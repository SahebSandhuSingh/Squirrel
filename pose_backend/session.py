"""One WebSocket connection = one workout session.

Session lifetime and state
--------------------------
A session owns everything stateful for one workout: the backlog queue, the
smoothing buffer, the orientation/multi-person hysteresis, the consecutive-
"unrecognized" streak, the MediaPipe instance, and the metrics. All of it is
created when the socket opens and released in ``_teardown`` when it closes, for
any reason (clean stop, client disappearing, network drop, server shutdown,
idle timeout). Nothing is global and nothing outlives the connection, so a
dropped connection cannot leak: see the ``finally`` in :meth:`run`.

Backlog policy (never process stale frames, never queue without bound)
----------------------------------------------------------------------
Frames arrive on the event loop and are processed on ONE worker thread (a
MediaPipe landmarker is stateful and not thread-safe, and one thread per session
is what keeps ordering deterministic). Between them sits a queue of at most
``FRAME_QUEUE_MAX_SIZE`` frames. When a frame arrives and the queue is full, the
OLDEST queued frame is discarded: on a live stream a 300 ms-old frame is worth
nothing, and the alternative — an unbounded queue — turns a slow moment into
permanently growing latency. Dropped frames simply produce no response, and
because ``frame_number`` is assigned at ingestion, gaps in the sequence the
client receives are exactly the frames that were dropped.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Optional

from starlette.websockets import WebSocket, WebSocketDisconnect, WebSocketState

from .config import (
    FRAME_QUEUE_MAX_SIZE,
    MAX_FRAME_BYTES,
    SESSION_IDLE_TIMEOUT_S,
    WS_CLOSE_IDLE_TIMEOUT,
    WS_CLOSE_INTERNAL_ERROR,
)
from .metrics import SessionMetrics
from .pipeline import FramePipeline, QueuedFrame
from .pose_estimator import MediaPipePoseEstimator, PoseEstimator
from .schemas import ErrorMessage, SessionClosed
from .session_info import session_ready_message

logger = logging.getLogger(__name__)

__all__ = ["WorkoutSession", "EstimatorFactory"]

#: Injected so tests (and alternative backends) can supply their own estimator.
EstimatorFactory = Callable[[], PoseEstimator]

#: WebSocket close code per stop reason. 1000 is a normal closure; the 4xxx codes
#: let the app distinguish "we timed you out" from "the server broke" without
#: parsing text. Anything not listed closes normally.
_CLOSE_CODES = {
    "idle_timeout": WS_CLOSE_IDLE_TIMEOUT,
    "internal_error": WS_CLOSE_INTERNAL_ERROR,
}
_NORMAL_CLOSURE = 1000


def default_estimator_factory() -> PoseEstimator:
    return MediaPipePoseEstimator()


class WorkoutSession:
    """Streaming session state machine for one connection."""

    def __init__(
        self,
        websocket: WebSocket,
        selected_exercise: str,
        estimator_factory: EstimatorFactory = default_estimator_factory,
        session_id: Optional[str] = None,
        client_session_id: Optional[str] = None,
    ) -> None:
        self.session_id = session_id or uuid.uuid4().hex[:12]
        self.selected_exercise = selected_exercise
        self.client_session_id = client_session_id
        self._websocket = websocket
        self._estimator_factory = estimator_factory
        self._queue: asyncio.Queue[QueuedFrame] = asyncio.Queue(
            maxsize=FRAME_QUEUE_MAX_SIZE
        )
        self.metrics = SessionMetrics(self.session_id)
        self._executor: Optional[ThreadPoolExecutor] = None
        self._pipeline: Optional[FramePipeline] = None
        self._worker: Optional[asyncio.Task] = None
        self._send_lock = asyncio.Lock()
        self._frames_ingested = 0
        self._stop_reason = "client_disconnected"
        self._closing = False

    # -- lifecycle ----------------------------------------------------------

    async def run(self) -> None:
        """Serve this session until the socket closes or the client stops.

        The ``finally`` block is the whole memory-leak story: whatever happens —
        disconnect mid-set, cancelled task, unexpected exception — the worker is
        cancelled, the queue drained, MediaPipe closed and the thread released.
        """
        try:
            await self._startup()
            await self._receive_loop()
        except WebSocketDisconnect:
            self._stop_reason = "client_disconnected"
            logger.info("session=%s client disconnected", self.session_id)
        except asyncio.CancelledError:
            self._stop_reason = "server_shutdown"
            raise
        except Exception:
            self._stop_reason = "internal_error"
            logger.exception("session=%s failed", self.session_id)
            await self._send_error(
                ErrorMessage(
                    reason="internal_error",
                    message="session ended because of a server error",
                    fatal=True,
                )
            )
        finally:
            await self._teardown()

    async def _startup(self) -> None:
        """Build the per-session pipeline on its own worker thread."""
        loop = asyncio.get_running_loop()
        self._executor = ThreadPoolExecutor(
            max_workers=1, thread_name_prefix=f"pose-{self.session_id}"
        )
        # The MediaPipe landmarker is created ON the worker thread that will use
        # it, so the native graph is never touched from two threads.
        self._pipeline = await loop.run_in_executor(self._executor, self._build_pipeline)
        self._worker = asyncio.create_task(
            self._process_loop(), name=f"pose-worker-{self.session_id}"
        )
        await self._send(session_ready_message(self.session_id, self.selected_exercise))
        logger.info(
            "session=%s started exercise=%s client_session_id=%s",
            self.session_id,
            self.selected_exercise,
            self.client_session_id,
        )

    def _build_pipeline(self) -> FramePipeline:
        return FramePipeline(
            session_id=self.session_id,
            selected_exercise=self.selected_exercise,
            estimator=self._estimator_factory(),
            metrics=self.metrics,
        )

    # -- ingestion (event loop) --------------------------------------------

    async def _receive_loop(self) -> None:
        """Read messages off the socket and enqueue frames. Never blocks on work."""
        while not self._closing:
            try:
                message = await asyncio.wait_for(
                    self._websocket.receive(), timeout=SESSION_IDLE_TIMEOUT_S
                )
            except asyncio.TimeoutError:
                # No frames for a while: the app was backgrounded, or the network
                # went away without a close frame. Teardown sends the summary and
                # closes with WS_CLOSE_IDLE_TIMEOUT.
                self._stop_reason = "idle_timeout"
                logger.info(
                    "session=%s idle for %.0fs, closing",
                    self.session_id,
                    SESSION_IDLE_TIMEOUT_S,
                )
                return

            kind = message.get("type")
            if kind == "websocket.disconnect":
                self._stop_reason = "client_disconnected"
                return
            if message.get("bytes") is not None:
                await self._ingest_frame(message["bytes"])
            elif message.get("text") is not None:
                if await self._handle_control(message["text"]):
                    return

    async def _ingest_frame(self, payload: bytes) -> None:
        """Assign a frame number, enqueue, and drop the oldest if backed up."""
        if len(payload) > MAX_FRAME_BYTES:
            await self._send_error(
                ErrorMessage(
                    reason="frame_too_large",
                    message=f"frame exceeds {MAX_FRAME_BYTES} bytes",
                    frame_number=self._frames_ingested + 1,
                )
            )
            return

        self._frames_ingested += 1
        self.metrics.note_received()
        frame = QueuedFrame(
            frame_number=self._frames_ingested,
            payload=payload,
            received_at=time.time(),
            received_perf=time.perf_counter(),
        )
        while True:
            try:
                self._queue.put_nowait(frame)
                return
            except asyncio.QueueFull:
                # Drop the OLDEST queued frame, then retry. The loop handles the
                # (single-threaded, but explicit) case of the queue still being
                # full because the worker has not yet taken anything.
                with contextlib.suppress(asyncio.QueueEmpty):
                    stale = self._queue.get_nowait()
                    self._queue.task_done()
                    self.metrics.note_dropped()
                    logger.debug(
                        "session=%s dropped stale frame=%d (backlog full, age=%.0fms)",
                        self.session_id,
                        stale.frame_number,
                        (time.perf_counter() - stale.received_perf) * 1000.0,
                    )

    async def _handle_control(self, text: str) -> bool:
        """Handle a JSON control message. Returns True if the session should end."""
        try:
            message: Any = json.loads(text)
        except json.JSONDecodeError:
            await self._send_error(
                ErrorMessage(reason="unsupported_message", message="expected JSON text")
            )
            return False
        kind = message.get("type") if isinstance(message, dict) else None
        if kind == "stop":
            self._stop_reason = "client_stopped"
            return True
        if kind == "ping":
            await self._send({"type": "pong", "server_time": time.time()})
            return False
        if kind == "config":
            # Re-configuration mid-session would invalidate the smoothing buffer
            # and every streak counter; the app opens a new session instead.
            await self._send_error(
                ErrorMessage(
                    reason="unsupported_message",
                    message="exercise cannot be changed mid-session; open a new session",
                )
            )
            return False
        await self._send_error(
            ErrorMessage(
                reason="unsupported_message",
                message=f"unsupported message type: {kind!r}",
            )
        )
        return False

    # -- processing (worker task + worker thread) ---------------------------

    async def _process_loop(self) -> None:
        """Take frames off the queue, process them off-loop, send results in order."""
        loop = asyncio.get_running_loop()
        assert self._pipeline is not None and self._executor is not None
        while True:
            frame = await self._queue.get()
            try:
                result = await loop.run_in_executor(
                    self._executor, self._pipeline.process, frame
                )
                await self._send(result.model_dump(exclude_none=True))
            except (WebSocketDisconnect, RuntimeError):
                # Socket went away between dequeue and send; the receive loop
                # handles the disconnect, this task just stops.
                return
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception(
                    "session=%s frame=%d processing failed",
                    self.session_id,
                    frame.frame_number,
                )
                await self._send_error(
                    ErrorMessage(
                        reason="internal_error",
                        message="frame processing failed",
                        frame_number=frame.frame_number,
                    )
                )
            finally:
                self._queue.task_done()

    # -- sending ------------------------------------------------------------

    async def _send(self, payload: dict) -> None:
        """Serialise one JSON message. Lock: worker and receive loop both send."""
        async with self._send_lock:
            if self._websocket.client_state is not WebSocketState.CONNECTED:
                return
            await self._websocket.send_text(json.dumps(payload))

    async def _send_error(self, error: ErrorMessage) -> None:
        with contextlib.suppress(Exception):
            await self._send(error.model_dump(exclude_none=True))

    async def _close_socket(self, code: int) -> None:
        """Close the socket once, if it is still open."""
        self._closing = True
        with contextlib.suppress(Exception):
            if self._websocket.client_state is WebSocketState.CONNECTED:
                await self._websocket.close(code=code)

    # -- teardown -----------------------------------------------------------

    async def _teardown(self) -> None:
        """Discard all session state. Safe to call twice, and cancellation-safe.

        Ordering matters here. Everything that releases a resource is done with
        SYNCHRONOUS calls first, because this coroutine often runs while the task
        is already being cancelled — and in that state the next ``await`` raises
        ``CancelledError`` immediately. Doing the releases synchronously means a
        client that vanishes mid-set cannot leave a MediaPipe graph, a worker
        thread or a queue of frames behind; the awaits that follow are
        best-effort courtesies to a socket that may already be gone.
        """
        self._closing = True

        worker, self._worker = self._worker, None
        if worker is not None:
            worker.cancel()

        # Drop anything still queued: those frames are stale by definition.
        drained = 0
        while not self._queue.empty():
            with contextlib.suppress(asyncio.QueueEmpty):
                self._queue.get_nowait()
                self._queue.task_done()
                drained += 1

        # Close MediaPipe on the thread that owns it. Submitted rather than
        # awaited: the executor runs already-queued work before its thread
        # exits, so this completes even if this coroutine is cancelled right now.
        pipeline, self._pipeline = self._pipeline, None
        executor, self._executor = self._executor, None
        if executor is not None:
            if pipeline is not None:
                with contextlib.suppress(RuntimeError):
                    executor.submit(pipeline.close)
            executor.shutdown(wait=False)

        snapshot = self.metrics.snapshot()

        # Best-effort from here on. BaseException is suppressed deliberately: a
        # CancelledError raised by these awaits must not skip the log line, and
        # the cancellation itself is still propagated by the caller.
        if worker is not None:
            with contextlib.suppress(BaseException):
                await worker
        with contextlib.suppress(BaseException):
            await self._send(
                SessionClosed(
                    session_id=self.session_id,
                    reason=self._stop_reason,
                    frames_received=snapshot.frames_received,
                    frames_processed=snapshot.frames_processed,
                    frames_dropped=snapshot.frames_dropped,
                    duration_s=snapshot.duration_s,
                    achieved_fps=snapshot.achieved_fps,
                    mean_latency_ms=snapshot.mean_latency_ms,
                    p95_latency_ms=snapshot.p95_latency_ms,
                ).model_dump()
            )
        with contextlib.suppress(BaseException):
            await self._close_socket(
                _CLOSE_CODES.get(self._stop_reason, _NORMAL_CLOSURE)
            )

        logger.info(
            "session=%s closed reason=%s frames(recv=%d proc=%d drop=%d drained=%d) "
            "fps=%.1f latency_ms(mean=%.1f p95=%.1f) duration=%.1fs",
            self.session_id,
            self._stop_reason,
            snapshot.frames_received,
            snapshot.frames_processed,
            snapshot.frames_dropped,
            drained,
            snapshot.achieved_fps,
            snapshot.mean_latency_ms,
            snapshot.p95_latency_ms,
            snapshot.duration_s,
        )
