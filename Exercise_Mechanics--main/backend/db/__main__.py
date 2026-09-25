"""python -m backend.db migrate | backfill"""

from __future__ import annotations

import logging
import sys

from backend.db import connection
from backend.db.exercise_sessions import backfill
from backend.db.migrate import migrate


def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    command = argv[0] if argv else ""
    if command not in ("migrate", "backfill"):
        print("usage: python -m backend.db migrate | backfill")
        return 2
    if not connection.enabled():
        print("DATABASE_URL is not set")
        return 1
    if command == "migrate":
        applied = migrate()
        print(f"applied: {', '.join(applied)}" if applied else "already up to date")
    else:
        written, skipped = backfill()
        print(f"sessions written: {written}, skipped (nothing recorded yet): {skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
