"""Check that the Exercise backend and the Run Module can share one PostgreSQL + PostGIS database.

Both modules write to the same database server (locally the compose `postgres`, in production
Supabase), each through its own migrations and its own code. They never read each other's tables, so
the only way they can break each other is by creating an object with the same name. This script
proves they do not:

  1. Each module's migrations run alone in a fresh database, and the objects each creates are
     recorded (tables, views, sequences, indexes; per schema).
  2. The two sets must not overlap. An overlap fails the check and names the objects.
  3. Both modules migrate into one database, in both orders, and then again (the second run must be a
     no-op), so neither assumes it runs first or alone.

It only runs each module's own migration command; it imports nothing from either module.

    python scripts/check_shared_database.py postgresql://postgres:postgres@localhost:5435/postgres

The URL is a maintenance connection with CREATEDB (the throwaway databases are created next to its
database and always dropped). Needs the Exercise requirements (psycopg) and
`npm ci` in run-module/backend. Exit status 0 = compatible, 1 = collision or migration failure.
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

# Each module's own migration command, exactly as its README / the compose file runs it.
MODULES = {
    "exercise": ([sys.executable, "-m", "backend.db", "migrate"], EXERCISE_DIR),
    "run_module": (["node", "node_modules/node-pg-migrate/bin/node-pg-migrate.js", "up",
                    "--migrations-dir", "../db/migrations", "--database-url-var", "DATABASE_URL"],
                   RUN_BACKEND_DIR),
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

    # 2. No name may belong to both.
    shared = sorted(created["exercise"].keys() & created["run_module"].keys())
    for name in shared:
        problems.append(f"both modules create {name} "
                        f"(exercise: {created['exercise'][name]}, run_module: {created['run_module'][name]})")
    if problems:
        return problems  # migrating them together would only fail on the same names

    # 3. Together in one database, either order, twice.
    expected = created["exercise"].keys() | created["run_module"].keys()
    for order in (("exercise", "run_module"), ("run_module", "exercise")):
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
        print("FAIL: the two modules cannot share one database:")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    print("OK: the Exercise backend and the Run Module can share one database")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
