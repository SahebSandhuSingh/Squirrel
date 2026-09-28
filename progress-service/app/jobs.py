"""Background jobs (run from cron / a scheduler every few minutes):

    python -m app.jobs resolve            # close challenges whose window + grace has passed
    python -m app.jobs daily [YYYY-MM-DD] # pre-create a day's daily challenges (also done lazily)
"""

from __future__ import annotations

import sys
from datetime import date

from app.db import SessionLocal
from app.services import challenges


def main(argv: list[str]) -> int:
    cmd = argv[1] if len(argv) > 1 else "resolve"
    with SessionLocal() as session:
        if cmd == "resolve":
            done = challenges.resolve_due(session)
            session.commit()
            print(f"resolved {len(done)} challenge(s)")
        elif cmd == "daily":
            day = date.fromisoformat(argv[2]) if len(argv) > 2 else date.today()
            challenges.ensure_daily(session, day)
            session.commit()
            print(f"daily challenges ready for {day}")
        else:
            print(__doc__)
            return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
