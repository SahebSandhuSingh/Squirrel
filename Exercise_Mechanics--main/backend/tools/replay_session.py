"""CLI for deterministic training replay and exercise-local signal reports.

Two independent things happen here, and keeping them separate is the point:

    PARITY + REP OUTCOMES — exercise-agnostic. Every capture, whatever the exercise, is re-run
    through its real adapter and compared field by field with what was persisted live, then each
    rep's stored verdict is summarized. This needs no per-exercise code and always runs.

    SIGNAL ANALYSIS — exercise-local. Measuring what a signal did means knowing what the signal IS,
    so it comes from a registered per-exercise analyzer. An exercise without one still gets the
    parity report rather than an error.

    python -m backend.tools.replay_session <set_dir> [--labels manifest.json] [--output report.json]
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Union

from backend.training.replay import (
    REPLAY_SCHEMA_VERSION,
    ReplayCapture,
    ReplayError,
    TimedReplayCapture,
    atomic_write_report,
    load_replay_capture,
    replay_capture,
    summarize_reps,
    summarize_timed_lifts,
)
from backend.workouts.bicep_curl.replay_analysis import (
    analyze_bicep_curl_signals,
    load_rep_labels as load_bicep_curl_rep_labels,
)
from backend.workouts.squat.replay_analysis import (
    analyze_squat_signals,
    load_rep_labels as load_squat_rep_labels,
)
from backend.workouts.high_knee.replay_analysis import (
    analyze_high_knee_signals,
    build_high_knee_replay_adapter,
    load_lift_labels as load_high_knee_lift_labels,
)

ReplayCaptureType = Union[ReplayCapture, TimedReplayCapture]


@dataclass(frozen=True)
class SignalAnalyzer:
    """One exercise's offline measurement pair: its review vocabulary and its signal reader."""

    load_labels: Callable[[Path | None, ReplayCaptureType], dict[int, dict]]
    analyze: Callable[[ReplayCaptureType, dict[int, dict]], dict]
    adapter_factory: Callable[[ReplayCaptureType], object] | None = None


# Explicit registration, like training/builders.py: an exercise gains signal analysis by being
# listed here, never implicitly. Absence is a supported state, not a failure.
SIGNAL_ANALYZERS: dict[str, SignalAnalyzer] = {
    "squat": SignalAnalyzer(load_squat_rep_labels, analyze_squat_signals),
    "bicep_curl": SignalAnalyzer(load_bicep_curl_rep_labels, analyze_bicep_curl_signals),
    "high_knee": SignalAnalyzer(
        load_high_knee_lift_labels,
        analyze_high_knee_signals,
        build_high_knee_replay_adapter,
    ),
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("set_dir", type=Path, help="captured set_N directory")
    parser.add_argument("--labels", type=Path, help="optional reviewed rep-label manifest")
    parser.add_argument(
        "--output",
        type=Path,
        help="report path (default: set/analysis/replay_report.json)",
    )
    arguments = parser.parse_args(argv)
    output = arguments.output or arguments.set_dir / "analysis" / "replay_report.json"

    try:
        capture = load_replay_capture(arguments.set_dir)
        analyzer = SIGNAL_ANALYZERS.get(capture.exercise)
        parity = replay_capture(
            capture,
            adapter_factory=(None if analyzer is None else analyzer.adapter_factory),
        )
        reps = summarize_reps(capture) if isinstance(capture, ReplayCapture) else None
        lifts = (
            summarize_timed_lifts(capture)
            if isinstance(capture, TimedReplayCapture)
            else None
        )
        if analyzer is None and arguments.labels is not None:
            # Labels are exercise-specific vocabulary; without an analyzer there is nothing to
            # validate them against, and silently dropping reviewed work would be worse.
            raise ReplayError(
                f"--labels needs a signal analyzer, and none is registered for "
                f"'{capture.exercise}'"
            )
        signals = (
            None if analyzer is None
            else analyzer.analyze(capture, analyzer.load_labels(arguments.labels, capture))
        )
        report = {
            "schema_version": REPLAY_SCHEMA_VERSION,
            "exercise": capture.exercise,
            "set": capture.set_no,
            "source": str(capture.set_dir),
            "parity": parity,
            "signals": signals,
        }
        if reps is not None:
            report["reps"] = reps
        if lifts is not None:
            report["lifts"] = lifts
        atomic_write_report(output, report)
    except ReplayError as exc:
        parser.exit(2, f"replay error: {exc}\n")
    except ValueError as exc:
        # A capture recorded against a configuration the code no longer supports (a renamed rule, a
        # removed kernel) surfaces when its adapter is rebuilt. That is a real answer about the
        # capture, not a crash.
        parser.exit(2, f"cannot replay this capture with the current code: {exc}\n")

    print(f"wrote {output}")
    print(
        f"parity={'PASS' if parity['ok'] else 'FAIL'}; "
        f"frames={parity['checked_frames']}; mismatches={parity['mismatch_count']}"
    )
    if reps is not None:
        for rep, summary in reps.items():
            outcome = summary["classification"] or (
                "discarded" if summary["discarded"] else "open"
            )
            peak = summary["peak"]
            print(
                f"  rep_{rep}: {outcome:<9} "
                f"peak={'n/a' if peak is None else format(peak, '.3f')} "
                f"score={summary['score']}"
            )
    if lifts is not None:
        for lift_id, event in lifts.items():
            print(
                f"  lift_{lift_id}: {event['side']:<5} "
                f"{event['classification']:<9} peak={event['peak_progress']:.3f}"
            )
    if signals is None:
        print(f"no signal analyzer registered for '{capture.exercise}'; parity only")
    return 0 if parity["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
