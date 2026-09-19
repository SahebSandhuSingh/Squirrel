#!/usr/bin/env python3
"""Pre-download the MediaPipe pose model bundle(s) into the cache directory.

Useful for container builds and air-gapped deployments: fetch here, then set
``POSE_MODEL_AUTO_DOWNLOAD = False`` in pose_backend/config.py so a running
service never reaches for the network.

    python tools/fetch_model.py                # the configured complexity
    python tools/fetch_model.py --all          # lite, full and heavy
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pose_backend.config import POSE_MODEL_COMPLEXITY, POSE_MODEL_VARIANTS  # noqa: E402
from pose_backend.logging_setup import configure_logging  # noqa: E402
from pose_backend.pose_estimator import resolve_model_path  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--all", action="store_true", help="fetch every model variant, not just one"
    )
    parser.add_argument(
        "--complexity",
        type=int,
        default=POSE_MODEL_COMPLEXITY,
        choices=sorted(POSE_MODEL_VARIANTS),
        help="0 = lite, 1 = full, 2 = heavy",
    )
    args = parser.parse_args()
    configure_logging("info")

    wanted = sorted(POSE_MODEL_VARIANTS) if args.all else [args.complexity]
    for complexity in wanted:
        path = resolve_model_path(complexity)
        size_mb = path.stat().st_size / (1024 * 1024)
        print(f"{POSE_MODEL_VARIANTS[complexity]:>5}: {path} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
