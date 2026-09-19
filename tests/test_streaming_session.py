"""WebSocket session behaviour: handshake, per-frame responses, and teardown.

Runs against the real FastAPI app with a stub pose estimator injected, so these
exercise the actual socket path (framing, ordering, control messages, cleanup)
without needing MediaPipe or a camera.
"""

from __future__ import annotations

import asyncio
import json

import cv2
import pytest
from fastapi.testclient import TestClient

from pose_backend.config import FRAME_QUEUE_MAX_SIZE, MAX_FRAME_BYTES
from pose_backend.schemas import EXERCISE_KEYS
from pose_backend.server import ACTIVE_SESSIONS, create_app
from pose_backend.session import WorkoutSession
from stub_estimator import StubEstimator
from synthetic_poses import arm_curl_flexed, jpeg_like_frame, pushup_top


@pytest.fixture
def jpeg_bytes() -> bytes:
    ok, encoded = cv2.imencode(".jpg", jpeg_like_frame())
    assert ok
    return encoded.tobytes()


@pytest.fixture
def client() -> TestClient:
    """App whose sessions analyse a fixed push-up pose."""
    app = create_app(estimator_factory=lambda: StubEstimator([pushup_top()]))
    with TestClient(app) as test_client:
        yield test_client
    assert not ACTIVE_SESSIONS, "every session must be deregistered on close"


def read_until(websocket, message_type: str, limit: int = 40) -> dict:
    """Read messages until one of ``message_type`` arrives."""
    for _ in range(limit):
        message = json.loads(websocket.receive_text())
        if message["type"] == message_type:
            return message
    raise AssertionError(f"no {message_type} message within {limit} messages")


class TestHandshake:
    def test_exercise_can_be_passed_as_a_query_parameter(self, client):
        with client.websocket_connect("/ws/session?exercise=pushup") as websocket:
            ready = read_until(websocket, "session_ready")
            assert ready["exercise"] == "pushup"
            assert "side-on" in ready["required_camera_view"].lower()
            assert ready["config"]["target_min_fps"] == 15.0

    def test_exercise_can_be_sent_as_the_first_message(self, client):
        with client.websocket_connect("/ws/session") as websocket:
            websocket.send_text(json.dumps({"type": "config", "exercise": "arm_curl"}))
            ready = read_until(websocket, "session_ready")
            assert ready["exercise"] == "arm_curl"

    def test_client_session_id_is_accepted_for_correlation(self, client):
        with client.websocket_connect(
            "/ws/session?exercise=pushup&client_session_id=abc123"
        ) as websocket:
            assert read_until(websocket, "session_ready")["session_id"]

    def test_unsupported_exercise_is_refused(self, client):
        with client.websocket_connect("/ws/session?exercise=squat") as websocket:
            error = read_until(websocket, "error")
            assert error["reason"] == "invalid_config"
            assert error["fatal"] is True

    def test_frames_before_config_are_refused(self, client, jpeg_bytes):
        with client.websocket_connect("/ws/session") as websocket:
            websocket.send_bytes(jpeg_bytes)
            error = read_until(websocket, "error")
            assert error["reason"] == "config_required"

    def test_malformed_config_is_refused(self, client):
        with client.websocket_connect("/ws/session") as websocket:
            websocket.send_text("not json at all")
            assert read_until(websocket, "error")["reason"] == "invalid_config"


class TestFrameStreaming:
    def test_a_paced_stream_gets_one_result_per_frame(self, client, jpeg_bytes):
        """At a pace the pipeline keeps up with, nothing is dropped.

        Frames sent faster than they can be processed are a different case on
        purpose — see TestBacklogPolicy, where the oldest frame is discarded
        rather than queued.
        """
        results = []
        with client.websocket_connect("/ws/session?exercise=pushup") as websocket:
            read_until(websocket, "session_ready")
            for _ in range(5):
                websocket.send_bytes(jpeg_bytes)
                results.append(read_until(websocket, "frame_result"))
        assert [r["frame_number"] for r in results] == [1, 2, 3, 4, 5]
        assert all(r["validation_status"] == "ok" for r in results)
        assert all(r["detected_exercise"] == "pushup" for r in results)

    def test_result_carries_the_documented_interface(self, client, jpeg_bytes):
        with client.websocket_connect("/ws/session?exercise=pushup") as websocket:
            read_until(websocket, "session_ready")
            websocket.send_bytes(jpeg_bytes)
            result = read_until(websocket, "frame_result")
        for field in (
            "timestamp",
            "frame_number",
            "landmarks",
            "joint_angles",
            "detected_exercise",
            "classification_confidence",
            "validation_status",
        ):
            assert field in result, f"missing contract field: {field}"
        assert len(result["landmarks"]) == 33
        assert result["metrics"]["achieved_fps"] >= 0.0

    def test_selected_exercise_drives_classification(self, jpeg_bytes):
        """Same frames, arm-curl session: a push-up pose is not the selection."""
        app = create_app(estimator_factory=lambda: StubEstimator([pushup_top()]))
        with TestClient(app) as client:
            with client.websocket_connect("/ws/session?exercise=arm_curl") as websocket:
                read_until(websocket, "session_ready")
                websocket.send_bytes(jpeg_bytes)
                result = read_until(websocket, "frame_result")
        assert result["selected_exercise"] == "arm_curl"
        assert result["detected_exercise"] == "unrecognized"

    def test_undecodable_frame_reports_an_error_and_keeps_the_session(
        self, client, jpeg_bytes
    ):
        with client.websocket_connect("/ws/session?exercise=pushup") as websocket:
            read_until(websocket, "session_ready")
            websocket.send_bytes(b"definitely not a jpeg")
            error = read_until(websocket, "error")
            assert error["reason"] == "frame_decode_failed"
            assert error.get("fatal", False) is False
            websocket.send_bytes(jpeg_bytes)
            assert read_until(websocket, "frame_result")["validation_status"] == "ok"

    def test_oversized_frame_is_rejected_without_decoding(self, client):
        with client.websocket_connect("/ws/session?exercise=pushup") as websocket:
            read_until(websocket, "session_ready")
            websocket.send_bytes(b"\x00" * (MAX_FRAME_BYTES + 1))
            assert read_until(websocket, "error")["reason"] == "frame_too_large"


class TestControlMessages:
    def test_ping_is_answered(self, client):
        with client.websocket_connect("/ws/session?exercise=pushup") as websocket:
            read_until(websocket, "session_ready")
            websocket.send_text(json.dumps({"type": "ping"}))
            assert read_until(websocket, "pong")["server_time"] > 0

    def test_stop_closes_the_session_with_a_summary(self, client, jpeg_bytes):
        with client.websocket_connect("/ws/session?exercise=pushup") as websocket:
            read_until(websocket, "session_ready")
            websocket.send_bytes(jpeg_bytes)
            read_until(websocket, "frame_result")
            websocket.send_text(json.dumps({"type": "stop"}))
            closed = read_until(websocket, "session_closed")
        assert closed["reason"] == "client_stopped"
        assert closed["frames_received"] >= 1
        assert closed["frames_processed"] >= 1

    def test_changing_exercise_mid_session_is_refused(self, client):
        with client.websocket_connect("/ws/session?exercise=pushup") as websocket:
            read_until(websocket, "session_ready")
            websocket.send_text(json.dumps({"type": "config", "exercise": "arm_curl"}))
            error = read_until(websocket, "error")
            assert error["reason"] == "unsupported_message"
            assert "new session" in error["message"]

    def test_unknown_message_type_is_reported(self, client):
        with client.websocket_connect("/ws/session?exercise=pushup") as websocket:
            read_until(websocket, "session_ready")
            websocket.send_text(json.dumps({"type": "start_rep_counting"}))
            assert read_until(websocket, "error")["reason"] == "unsupported_message"


class TestSessionTeardown:
    def test_disconnect_deregisters_the_session(self, client, jpeg_bytes):
        with client.websocket_connect("/ws/session?exercise=pushup") as websocket:
            read_until(websocket, "session_ready")
            websocket.send_bytes(jpeg_bytes)
            read_until(websocket, "frame_result")
            assert len(ACTIVE_SESSIONS) == 1
        # Leaving the context manager drops the connection mid-session.
        assert not ACTIVE_SESSIONS

    def test_estimator_is_closed_when_the_socket_drops(self, jpeg_bytes):
        """No leaked MediaPipe graph or worker thread after a disconnect."""
        created: list[StubEstimator] = []

        def factory() -> StubEstimator:
            estimator = StubEstimator([arm_curl_flexed()])
            created.append(estimator)
            return estimator

        app = create_app(estimator_factory=factory)
        with TestClient(app) as client:
            with client.websocket_connect("/ws/session?exercise=arm_curl") as websocket:
                read_until(websocket, "session_ready")
                websocket.send_bytes(jpeg_bytes)
                read_until(websocket, "frame_result")
        assert len(created) == 1
        assert created[0].closed, "the session's estimator must be released"

    def test_many_sequential_sessions_leave_nothing_behind(self, client, jpeg_bytes):
        for _ in range(5):
            with client.websocket_connect("/ws/session?exercise=pushup") as websocket:
                read_until(websocket, "session_ready")
                websocket.send_bytes(jpeg_bytes)
                read_until(websocket, "frame_result")
        assert not ACTIVE_SESSIONS


class TestBacklogPolicy:
    """The drop-oldest policy, tested directly on the ingestion path.

    Driven at the session object rather than through the socket because the
    point is what happens when frames arrive faster than the worker consumes
    them — which a synchronous test client cannot reliably provoke.
    """

    def test_queue_never_exceeds_its_limit_and_drops_the_oldest(self):
        async def scenario():
            session = WorkoutSession(
                websocket=None,  # never touched: no frame is processed or sent
                selected_exercise="pushup",
                estimator_factory=lambda: StubEstimator([pushup_top()]),
            )
            for _ in range(FRAME_QUEUE_MAX_SIZE + 8):
                await session._ingest_frame(b"frame-bytes")
            return session

        session = asyncio.run(scenario())
        assert session._queue.qsize() == FRAME_QUEUE_MAX_SIZE
        assert session.metrics.frames_received == FRAME_QUEUE_MAX_SIZE + 8
        assert session.metrics.frames_dropped == 8

        # What survives is the NEWEST frames: stale frames are never processed.
        remaining = [session._queue.get_nowait().frame_number for _ in range(FRAME_QUEUE_MAX_SIZE)]
        assert remaining == sorted(remaining)
        assert remaining[-1] == FRAME_QUEUE_MAX_SIZE + 8

    def test_frame_numbers_keep_counting_so_gaps_reveal_drops(self):
        async def scenario():
            session = WorkoutSession(
                websocket=None,
                selected_exercise="pushup",
                estimator_factory=lambda: StubEstimator([pushup_top()]),
            )
            for _ in range(10):
                await session._ingest_frame(b"frame-bytes")
            return session

        session = asyncio.run(scenario())
        kept = [session._queue.get_nowait().frame_number for _ in range(session._queue.qsize())]
        assert kept[-1] == 10, "ingestion numbering is continuous across drops"


class TestIdleTimeout:
    def test_a_silent_session_is_closed(self, monkeypatch, jpeg_bytes):
        """A client that stops sending (backgrounded app, dead network) must not
        hold a worker thread and a MediaPipe graph open forever."""
        monkeypatch.setattr("pose_backend.session.SESSION_IDLE_TIMEOUT_S", 0.3)
        created: list[StubEstimator] = []

        def factory() -> StubEstimator:
            estimator = StubEstimator([pushup_top()])
            created.append(estimator)
            return estimator

        app = create_app(estimator_factory=factory)
        with TestClient(app) as client:
            with client.websocket_connect("/ws/session?exercise=pushup") as websocket:
                read_until(websocket, "session_ready")
                websocket.send_bytes(jpeg_bytes)
                read_until(websocket, "frame_result")
                closed = read_until(websocket, "session_closed")  # then stay silent
        assert closed["reason"] == "idle_timeout"
        assert created[0].closed
        assert not ACTIVE_SESSIONS


class TestHttpEndpoints:
    def test_health_reports_supported_exercises_and_target_fps(self, client):
        payload = client.get("/health").json()
        assert payload["status"] == "ok"
        assert payload["supported_exercises"] == list(EXERCISE_KEYS)
        assert payload["target_min_fps"] == 15.0

    def test_sessions_endpoint_lists_live_sessions(self, client, jpeg_bytes):
        with client.websocket_connect("/ws/session?exercise=pushup") as websocket:
            read_until(websocket, "session_ready")
            websocket.send_bytes(jpeg_bytes)
            read_until(websocket, "frame_result")
            payload = client.get("/sessions").json()
        assert len(payload["active_sessions"]) == 1
        assert payload["active_sessions"][0]["exercise"] == "pushup"
        assert payload["active_sessions"][0]["frames_processed"] >= 1
