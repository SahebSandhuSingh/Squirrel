"""PostgreSQL storage for exercise sessions.

Optional: without DATABASE_URL the backend runs exactly as before on its per-user files, and every
database call here is a no-op. With it, each exercise session is mirrored into the
`exercise_sessions` table (see migrations/). The files stay the source of truth, so a database that is
down never interrupts training; `python -m backend.db backfill` catches the table up afterwards.

    python -m backend.db migrate     apply pending migrations
    python -m backend.db backfill    write every stored session into the table
"""
