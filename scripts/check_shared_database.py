"""Check that the Exercise backend, the Run Module and the Social service can share one PostgreSQL +
PostGIS database.

All three write to the same database server (locally the compose `postgres`, in production
Supabase), each through its own migrations and its own code. Apart from the documented contracts
between them (the Exercise backend writes `activity_sessions`; Social reads the Run Module's
`run_points` for Squirrel Dates, read-only), each keeps to its own tables, so the way they can
break each other at migration time is by creating an object with the same name. This script
proves they do not:

  1. Each module's migrations run alone in a fresh database, and the objects each creates are
     recorded (tables, views, sequences, indexes; per schema).
  2. No two sets may overlap. An overlap fails the check and names the objects.
  3. All modules migrate into one database, in forward and reverse order, and then again (the second
     run must be a no-op), so none assumes it runs first or alone.

It only runs each module's own migration command; it imports nothing from either module.

    python scripts/check_shared_database.py postgresql://postgres:postgres@localhost:5435/postgres

The URL is a maintenance connection with CREATEDB (the throwaway databases are created next to its
database and always dropped). Needs the Exercise requirements (psycopg), `npm ci` in
run-module/backend, and the Social requirements for SOCIAL_PYTHON (default: social-backend/.venv). Exit status 0 = compatible, 1 = collision or migration failure.
"""

from __future__ import annotations

import os
import subprocess
import sys
import uuid
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import psycopg

ROOT = Path(__file__).resolve().parent.parent
EXERCISE_DIR = ROOT / "Exercise_Mechanics--main"
RUN_BACKEND_DIR = ROOT / "run-module" / "backend"
SOCIAL_DIR = ROOT / "squirrel-social-profile-social-fixed" / "social-backend"
SOCIAL_PYTHON = os.environ.get("SOCIAL_PYTHON") or str(
    SOCIAL_DIR / ".venv" / "bin" / "python" if (SOCIAL_DIR / ".venv").is_dir() else sys.executable
)

# Each module's own migration command, exactly as its README / the compose file runs it.
MODULES = {
    "exercise": ([sys.executable, "-m", "backend.db", "migrate"], EXERCISE_DIR),
    "run_module": (["node", "node_modules/node-pg-migrate/bin/node-pg-migrate.js", "up",
                    "--migrations-dir", "../db/migrations", "--database-url-var", "DATABASE_URL"],
                   RUN_BACKEND_DIR),
    # Alembic, as its Dockerfile runs it; reads DATABASE_URL like the others (app/config.py).
    "social": ([SOCIAL_PYTHON, "-m", "alembic", "upgrade", "head"], SOCIAL_DIR),
}

# Everything with a name in a schema: tables, partitioned tables, views, materialized views,
# sequences, foreign tables, indexes. Composite types that back tables are covered by their table.
_OBJECTS_SQL = """
    SELECT n.nspname, c.relname, c.relkind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f', 'i')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND n.nspname NOT LIKE 'pg_temp_%' AND n.nspname NOT LIKE 'pg_toast_temp_%'
"""
_KIND = {"r": "table", "p": "table", "v": "view", "m": "materialized view", "S": "sequence",
         "f": "foreign table", "i": "index"}


def _with_database(url: str, name: str) -> str:
    parts = urlsplit(url)
    return urlunsplit(parts._replace(path="/" + name))


def objects(url: str) -> dict[str, str]:
    """{"schema.name": kind} for every named relation in the database."""
    with psycopg.connect(url) as conn:
        return {f"{schema}.{name}": _KIND[kind] for schema, name, kind in conn.execute(_OBJECTS_SQL)}


def migrate(module: str, url: str) -> None:
    command, cwd = MODULES[module]
    env = {**os.environ, "DATABASE_URL": url}
    done = subprocess.run(command, cwd=cwd, env=env, capture_output=True, text=True)
    if done.returncode != 0:
        output = (done.stdout + done.stderr).strip().splitlines()
        raise MigrationFailed(module, "\n".join(output[-25:]))


class MigrationFailed(RuntimeError):
    def __init__(self, module: str, output: str) -> None:
        super().__init__(f"{module} migrations failed:\n{output}")


@contextmanager
def scratch_database(admin_url: str, label: str):
    name = f"shared_db_check_{label}_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(admin_url, autocommit=True) as conn:
        conn.execute(f'CREATE DATABASE "{name}"')
    try:
        yield _with_database(admin_url, name)
    finally:
        with psycopg.connect(admin_url, autocommit=True) as conn:
            conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')


def check(admin_url: str) -> list[str]:
    """Run every step; returns the problems found (empty = the modules can share a database)."""
    problems: list[str] = []

    # 1. What does each module create on its own? (Baseline = what an empty database already has.)
    created: dict[str, dict[str, str]] = {}
    for module in MODULES:
        with scratch_database(admin_url, module) as url:
            before = objects(url)
            migrate(module, url)
            created[module] = {k: v for k, v in objects(url).items() if k not in before}
        print(f"{module}: {len(created[module])} objects "
              f"({sum(v == 'table' for v in created[module].values())} tables)")

    # 2. No name may belong to two modules.
    names = list(MODULES)
    for i, first in enumerate(names):
        for second in names[i + 1:]:
            for name in sorted(created[first].keys() & created[second].keys()):
                problems.append(f"{first} and {second} both create {name} "
                                f"({first}: {created[first][name]}, {second}: {created[second][name]})")
    if problems:
        return problems  # migrating them together would only fail on the same names

    # 3. Together in one database, forward and reverse order, twice.
    expected = set().union(*(created[m].keys() for m in names))
    for order in (tuple(names), tuple(reversed(names))):
        label = "then".join(m[:3] for m in order)
        with scratch_database(admin_url, label) as url:
            before = objects(url)
            for module in order:
                migrate(module, url)
            together = objects(url).keys() - before.keys()
            for module in order:  # again: must change nothing
                migrate(module, url)
            again = objects(url).keys() - before.keys()
        found = len(problems)
        if together != expected:
            problems.append(f"order {' → '.join(order)}: objects differ from running each alone: "
                            f"missing {sorted(expected - together)}, extra {sorted(together - expected)}")
        if again != together:
            problems.append(f"order {' → '.join(order)}: re-running migrations changed the schema")
        if len(problems) == found:
            print(f"together ({' → '.join(order)}), then re-run: ok")
    return problems


def main(argv: list[str]) -> int:
    admin_url = argv[0] if argv else os.environ.get("SHARED_DB_CHECK_URL", "")
    if not admin_url:
        print(__doc__)
        return 2
    if not (RUN_BACKEND_DIR / "node_modules").is_dir():
        print("run-module/backend/node_modules is missing: run `npm ci` in run-module/backend first")
        return 2
    try:
        problems = check(admin_url)
    except MigrationFailed as exc:
        print(f"FAIL: {exc}")
        return 1
    if problems:
        print("FAIL: the modules cannot share one database:")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    print("OK: the Exercise backend, the Run Module and the Social service can share one database")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
