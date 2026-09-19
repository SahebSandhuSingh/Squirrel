"""CLI: re-run a captured bicep-curl set through the CURRENT curl ROM signal and print the verdict.

The deterministic replay in `backend.tools.replay_session` compares a capture against the config it
was RECORDED with — that is a parity check, and it fails by design once a signal is deliberately
changed. This tool answers the other question: does the signal we ship TODAY classify a labelled
capture the way a human labelled it? It rebuilds the adapter from the live config plus the capture's
persisted baseline, feeds every stored frame in order, and reports each attempt.

    python -m backend.tools.replay_curl_rom <set_dir> [--expect full_rom,shallow,full_rom]

Exits non-zero when `--expect` is given and the classifications do not match, so a rig run can be
asserted in one command.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from backend.engine.loader import load_exercise_config
from backend.training.replay import ReplayError, load_replay_capture
from backend.workouts.bicep_curl.adapter import build_bicep_curl_adapter


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("set_dir", type=Path, help="captured set_N directory")
    parser.add_argument(
        "--expect",
        help="comma-separated expected classifications, e.g. full_rom,shallow,full_rom",
    )
    arguments = parser.parse_args(argv)

    try:
        capture = load_replay_capture(arguments.set_dir)
    except ReplayError as exc:
        parser.exit(2, f"replay error: {exc}\n")
    if capture.exercise != "bicep_curl":
        parser.exit(2, f"not a bicep curl capture: {capture.exercise}\n")

    config = load_exercise_config("bicep_curl")
    missing_body_anchor = not all(
        keypoint in capture.baseline for keypoint in ("left_hip", "right_hip")
    )
    if missing_body_anchor:
        parser.exit(
            2,
            "replay error: capture baseline has no hips; it predates the current "
            "body-relative curl ROM signal and needs a new rig capture\n",
        )
    gate = config.templates["curl_rom"]["full_rom_gate"]
    adapter = build_bicep_curl_adapter(
        baseline=capture.baseline,
        target_reps=capture.target_reps,
        config=config,
    )

    attempts: list[dict] = []
    unreadable = 0
    for item in capture.frames:
        status = adapter.process(item.source)
        if not status["tracking"]["available"]:
            unreadable += 1
        attempt = status["last_attempt"]
        if status["events"]["attempt_completed"] and attempt is not None:
            attempts.append({"captured_rep": item.rep, **attempt})

    print(f"{capture.set_dir} — {len(capture.frames)} frames, gate={gate}")
    if unreadable:
        print(f"  {unreadable} frame(s) produced no ROM reading")
    for attempt in attempts:
        print(
            f"  capture rep_{attempt['captured_rep']}: {attempt['classification']:<9} "
            f"peak={attempt['peak']:.3f} score={attempt['score']}"
        )

    if not arguments.expect:
        return 0
    expected = [value.strip() for value in arguments.expect.split(",") if value.strip()]
    actual = [attempt["classification"] for attempt in attempts]
    if actual == expected:
        print(f"PASS: classifications match {expected}")
        return 0
    print(f"FAIL: expected {expected}, got {actual}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
