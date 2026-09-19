#!/usr/bin/env python3
"""Simulated mobile camera: stream a video file over the WebSocket at a real FPS.

This is how the live path gets tested without a phone. It reads frames one at a
time, JPEG-encodes them exactly as the app would, and paces them at a target
frame rate — including the part that matters most: it does NOT slow down when
the backend falls behind, so the backlog-drop policy is genuinely exercised.

    # stream a workout clip as a 15 FPS push-up session
    python tools/test_client.py --source clip.mp4 --exercise pushup

    # webcam instead of a file, arm curls, verbose per-frame lines
    python tools/test_client.py --source 0 --exercise arm_curl --show-frames

    # log every frame's angles and latency for threshold tuning
    python tools/test_client.py --source clip.mp4 --exercise pushup --csv angles.csv

Output: a per-frame log (optional), a CSV of raw joint angles and latencies for
tuning, and a summary comparing achieved FPS against the target.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import statistics
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import websockets

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pose_backend.config import TARGET_MIN_FPS  # noqa: E402

#: CSV columns: everything needed to tune thresholds after a run.
CSV_FIELDS = [
    "frame_number",
    "timestamp",
    "validation_status",
    "detected_exercise",
    "classification_confidence",
    "elbow_angle_deg",
    "body_line_angle_deg",
    "elbow_drift_angle_deg",
    "torso_angle_from_horizontal_deg",
    "analysed_side",
    "shoulder_spread_ratio",
    "hip_spread_ratio",
    "min_key_joint_visibility",
    "unrecognized_streak",
    "detail",
    "processing_latency_ms",
    "inference_latency_ms",
    "queue_wait_ms",
    "end_to_end_latency_ms",
    "server_achieved_fps",
    "dropped_frames",
    "client_round_trip_ms",
]


class FrameSource:
    """A video file or camera index, read frame by frame."""

    def __init__(self, source: str, width: Optional[int], loop: bool) -> None:
        self._spec: Any = int(source) if source.isdigit() else source
        self._capture = cv2.VideoCapture(self._spec)
        if not self._capture.isOpened():
            raise SystemExit(f"could not open video source: {source!r}")
        self._width = width
        self._loop = loop
        self.native_fps = self._capture.get(cv2.CAP_PROP_FPS) or 0.0

    def read(self):
        ok, frame = self._capture.read()
        if not ok:
            if not self._loop:
                return None
            self._capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ok, frame = self._capture.read()
            if not ok:
                return None
        if self._width and frame.shape[1] > self._width:
            scale = self._width / frame.shape[1]
            frame = cv2.resize(
                frame,
                (self._width, int(round(frame.shape[0] * scale))),
                interpolation=cv2.INTER_AREA,
            )
        return frame

    def release(self) -> None:
        self._capture.release()


class SessionStats:
    """Collects what the run is meant to tell us."""

    def __init__(self) -> None:
        self.sent = 0
        self.results = 0
        self.errors: Counter = Counter()
        self.statuses: Counter = Counter()
        self.exercises: Counter = Counter()
        self.end_to_end_ms: List[float] = []
        self.processing_ms: List[float] = []
        self.round_trip_ms: List[float] = []
        self.server_fps: List[float] = []
        self.dropped = 0
        self.closed: Optional[Dict[str, Any]] = None
        self.started = time.perf_counter()

    def print_summary(self, target_fps: float) -> None:
        elapsed = time.perf_counter() - self.started
        print("\n--- session summary ---")
        print(f"frames sent           : {self.sent}")
        print(f"frame results         : {self.results}")
        print(f"dropped by backend    : {self.dropped} (backlog full)")
        if self.sent:
            print(f"response rate         : {self.results / self.sent:.0%} of sent frames")
        print(f"wall clock            : {elapsed:.1f}s")
        if self.server_fps:
            print(f"server frames/s (fed) : {self.server_fps[-1]:.1f} "
                  f"(cannot exceed the {self.sent / elapsed:.1f}/s this client sent)")
        if self.processing_ms:
            # The real question is capacity: how many frames a second the pipeline
            # could process. Frames/s "as fed" is capped by the send rate, so it
            # says nothing about headroom when the client paces at the target.
            capacity = 1000.0 / statistics.fmean(self.processing_ms)
            verdict = "OK" if capacity >= target_fps else "BELOW TARGET"
            print(f"processing capacity   : {capacity:.1f} frames/s "
                  f"(target >= {target_fps:.0f}) {verdict}")
        for label, values in (
            ("processing latency ms", self.processing_ms),
            ("end-to-end latency ms", self.end_to_end_ms),
            ("client round-trip ms", self.round_trip_ms),
        ):
            if values:
                print(
                    f"{label:<22}: mean {statistics.fmean(values):6.1f}  "
                    f"p95 {_percentile(values, 95):6.1f}  max {max(values):6.1f}"
                )
        if self.statuses:
            print("validation statuses   : " + ", ".join(
                f"{status}={count}" for status, count in self.statuses.most_common()
            ))
        if self.exercises:
            print("detected exercises    : " + ", ".join(
                f"{name}={count}" for name, count in self.exercises.most_common()
            ))
        if self.errors:
            print("errors                : " + ", ".join(
                f"{reason}={count}" for reason, count in self.errors.most_common()
            ))
        if self.closed:
            print(f"close reason          : {self.closed.get('reason')}")


def _percentile(values: List[float], pct: int) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(round((pct / 100.0) * (len(ordered) - 1))))
    return ordered[index]


async def send_frames(
    websocket,
    source: FrameSource,
    args,
    stats: SessionStats,
    sent_at: Dict[int, float],
    ready: asyncio.Event,
) -> None:
    """Paced sender: keeps real time like a camera, never waits for responses.

    Waits for ``session_ready`` before the first frame. The backend builds the
    session's pose graph during the handshake, and frames pushed into that window
    would just sit in the backlog and be dropped as stale — so a real app should
    wait for this message too.
    """
    try:
        await asyncio.wait_for(ready.wait(), timeout=args.ready_timeout)
    except asyncio.TimeoutError:
        print(f"session was not ready within {args.ready_timeout}s; streaming anyway")
    interval = 1.0 / args.fps
    encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), args.jpeg_quality]
    next_due = time.perf_counter()
    while args.max_frames == 0 or stats.sent < args.max_frames:
        frame = source.read()
        if frame is None:
            break
        ok, encoded = cv2.imencode(".jpg", frame, encode_params)
        if not ok:
            continue
        stats.sent += 1
        sent_at[stats.sent] = time.perf_counter()
        await websocket.send(encoded.tobytes())

        next_due += interval
        delay = next_due - time.perf_counter()
        if delay > 0:
            await asyncio.sleep(delay)
        else:
            # Behind schedule: a real camera would not pause, so neither do we.
            next_due = time.perf_counter()

    await websocket.send(json.dumps({"type": "stop"}))


async def receive_results(
    websocket, args, stats: SessionStats, sent_at: Dict[int, float], writer,
    ready: asyncio.Event,
) -> None:
    """Consume server messages until the session closes."""
    async for raw in websocket:
        message = json.loads(raw)
        kind = message.get("type")

        if kind == "session_ready":
            print(f"session {message['session_id']} ready: {message['exercise']}")
            print(f"camera requirement: {message['required_camera_view']}")
            ready.set()
            continue

        if kind == "frame_result":
            stats.results += 1
            stats.statuses[message["validation_status"]] += 1
            stats.exercises[message["detected_exercise"]] += 1
            metrics = message.get("metrics") or {}
            debug = message.get("debug") or {}
            angles = message.get("joint_angles") or {}
            orientation = debug.get("orientation") or {}

            round_trip = None
            if message["frame_number"] in sent_at:
                round_trip = (
                    time.perf_counter() - sent_at.pop(message["frame_number"])
                ) * 1000.0
                stats.round_trip_ms.append(round_trip)
            if "processing_latency_ms" in metrics:
                stats.processing_ms.append(metrics["processing_latency_ms"])
            if "end_to_end_latency_ms" in metrics:
                stats.end_to_end_ms.append(metrics["end_to_end_latency_ms"])
            if metrics.get("achieved_fps"):
                stats.server_fps.append(metrics["achieved_fps"])
            stats.dropped = metrics.get("dropped_frames", stats.dropped)

            if args.show_frames:
                angle_text = " ".join(f"{k}={v:.1f}" for k, v in angles.items())
                print(
                    f"#{message['frame_number']:<5} {message['validation_status']:<32} "
                    f"{message['detected_exercise']:<13} conf={message['classification_confidence']:.2f} "
                    f"{angle_text} proc={metrics.get('processing_latency_ms', 0):.0f}ms"
                )
            if writer is not None:
                writer.writerow(
                    {
                        "frame_number": message["frame_number"],
                        "timestamp": message["timestamp"],
                        "validation_status": message["validation_status"],
                        "detected_exercise": message["detected_exercise"],
                        "classification_confidence": message["classification_confidence"],
                        "elbow_angle_deg": angles.get("elbow_angle_deg"),
                        "body_line_angle_deg": angles.get("body_line_angle_deg"),
                        "elbow_drift_angle_deg": angles.get("elbow_drift_angle_deg"),
                        "torso_angle_from_horizontal_deg": debug.get(
                            "torso_angle_from_horizontal_deg"
                        ),
                        "analysed_side": debug.get("analysed_side"),
                        "shoulder_spread_ratio": orientation.get("shoulder_spread_ratio"),
                        "hip_spread_ratio": orientation.get("hip_spread_ratio"),
                        "min_key_joint_visibility": debug.get("min_key_joint_visibility"),
                        "unrecognized_streak": debug.get("unrecognized_streak"),
                        "detail": debug.get("detail"),
                        "processing_latency_ms": metrics.get("processing_latency_ms"),
                        "inference_latency_ms": metrics.get("inference_latency_ms"),
                        "queue_wait_ms": metrics.get("queue_wait_ms"),
                        "end_to_end_latency_ms": metrics.get("end_to_end_latency_ms"),
                        "server_achieved_fps": metrics.get("achieved_fps"),
                        "dropped_frames": metrics.get("dropped_frames"),
                        "client_round_trip_ms": None
                        if round_trip is None
                        else round(round_trip, 2),
                    }
                )
            continue

        if kind == "error":
            stats.errors[message["reason"]] += 1
            print(f"error: {message['reason']}: {message['message']}")
            if message.get("fatal"):
                return
            continue

        if kind == "session_closed":
            stats.closed = message
            return


async def run(args) -> None:
    source = FrameSource(args.source, args.width, args.loop)
    stats = SessionStats()
    sent_at: Dict[int, float] = {}
    url = f"{args.url}?exercise={args.exercise}&client_session_id=test_client"
    print(
        f"streaming {args.source!r} -> {url} at {args.fps} FPS "
        f"(source native FPS: {source.native_fps:.1f})"
    )

    csv_file = open(args.csv, "w", newline="") if args.csv else None
    writer = None
    if csv_file is not None:
        writer = csv.DictWriter(csv_file, fieldnames=CSV_FIELDS)
        writer.writeheader()

    try:
        async with websockets.connect(url, max_size=8 * 1024 * 1024) as websocket:
            ready = asyncio.Event()
            receiver = asyncio.create_task(
                receive_results(websocket, args, stats, sent_at, writer, ready)
            )
            await send_frames(websocket, source, args, stats, sent_at, ready)
            # Give the backlog a moment to flush before the summary.
            try:
                await asyncio.wait_for(receiver, timeout=args.drain_timeout)
            except asyncio.TimeoutError:
                receiver.cancel()
    finally:
        source.release()
        if csv_file is not None:
            csv_file.close()
            print(f"per-frame angles and latencies written to {args.csv}")
        stats.print_summary(TARGET_MIN_FPS)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", required=True,
                        help="video file path, or a camera index like 0")
    parser.add_argument("--exercise", required=True, choices=("pushup", "arm_curl"),
                        help="the exercise the app would have the user select")
    parser.add_argument("--url", default="ws://127.0.0.1:8000/ws/session")
    parser.add_argument("--fps", type=float, default=TARGET_MIN_FPS,
                        help="send rate; raise above the target to force backlog drops")
    parser.add_argument("--width", type=int, default=720,
                        help="downscale frames to this width before encoding (0 = keep)")
    parser.add_argument("--jpeg-quality", type=int, default=80)
    parser.add_argument("--max-frames", type=int, default=0, help="0 = whole source")
    parser.add_argument("--loop", action="store_true",
                        help="restart the video when it ends (long-run soak testing)")
    parser.add_argument("--show-frames", action="store_true",
                        help="print a line per frame with angles and latency")
    parser.add_argument("--csv", help="write per-frame angles and latencies here")
    parser.add_argument("--drain-timeout", type=float, default=5.0)
    parser.add_argument("--ready-timeout", type=float, default=30.0,
                        help="how long to wait for session_ready before streaming")
    args = parser.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
