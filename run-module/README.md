# Run Module

GPS tracking, territory marking, territory maintenance, and leaderboard backend.

---

## Architecture decisions (not to be re-opened)

| Concern | Decision |
|---|---|
| Backend runtime | Node 22 LTS + TypeScript (strict mode, ESM) |
| Database | PostgreSQL 16 + PostGIS 3.4 |
| Cache | Redis 7 |
| Queue | BullMQ (backed by Redis) |
| ORM | **None** — raw SQL via `pg`, queries in `db/queries/` |
| Mobile | Native Swift (iOS) + Kotlin (Android) |

---

> **Local ports:** Postgres is published on host port **5434** (→ container 5432) and
> Redis on **6379** (→ 6379). Port 5434 is used because this machine has native
> PostgreSQL 17 on 5432 and PostgreSQL 18 on 5433. Port 5434 is confirmed free.
> `DATABASE_URL` in your `.env` must use port 5434; see `.env.example`.
> The container-side port is always 5432 and does not change.

---


## Repository layout

```
run-module/
├── .env.example            # Variable names + placeholder values — copy to .env
├── .gitignore
├── AGENTS.md               # Coding agent rules & scope boundary
├── README.md
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── .eslintrc.json
│   └── src/
│       ├── api/            # Fastify server + routes
│       ├── config/env.ts   # Typed env loader — fails fast on missing vars
│       ├── db/pool.ts      # pg Pool
│       ├── redis/client.ts # ioredis client
│       ├── workers/        # BullMQ workers (finalize_run, leaderboard_sync, decay)
│       ├── geometry/       # GPS path → polygon logic (RM-1.5+)
│       └── anticheat/      # Anti-cheat scoring (RM-2.1+)
├── db/
│   ├── migrations/         # SQL migration files (RM-3.1+)
│   └── queries/            # Named SQL query files
├── docs/
│   └── decisions/          # Architecture Decision Records (ADRs)
├── infra/
│   └── docker-compose.yml  # Local dev: Postgres + Redis
└── mobile/
    ├── ios/                # Native Swift (future)
    └── android/            # Native Kotlin (future)
```

---

## Local development setup

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for Postgres + Redis)
- [Node.js 22 LTS](https://nodejs.org/en/download)
- `npm` ≥ 10

### 1. Clone and configure

```bash
git clone <repo-url>
cd run-module

cp .env.example backend/.env
# Edit backend/.env — fill in real DATABASE_URL, REDIS_URL, etc.
```

### 2. Start infrastructure

```bash
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml ps   # wait until both are "healthy"
```

### 3. Install dependencies

```bash
cd backend
npm install
```

### 4. Verify PostGIS and Redis

```bash
# PostGIS
docker exec -i run_module_postgres psql -U postgres -c "SELECT PostGIS_version();"

# Redis
docker exec -i run_module_redis redis-cli ping
```

### 5. Run the server

```bash
cd backend
npm run dev
# → Server listens on http://localhost:3000
```

### 6. Check the health endpoint

```bash
curl -s http://localhost:3000/health | jq
# Expected:
# {
#   "status": "ok",
#   "postgis_version": "3.4 ...",
#   "redis": "PONG"
# }
```

---

## Available npm scripts (run inside `backend/`)

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with hot-reload via tsx |
| `npm run build` | Compile TypeScript to `build/` |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | ESLint with @typescript-eslint |
| `npm run test` | Run Vitest test suite |
| `npm run migrate` | Run database migrations |

---

## Env variable reference

See [`.env.example`](.env.example) for all required variables.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection URL |
| `PORT` | HTTP server port (default: 3000) |
| `NODE_ENV` | `development` \| `test` \| `production` |
| `LOG_LEVEL` | Pino log level (`info`, `debug`, etc.) |

The server **exits immediately** if any variable is missing — see `src/config/env.ts`.

---

## Out of scope

See [AGENTS.md](AGENTS.md) for the full scope boundary. Do not add Exercise Module code here.

---

## Checks

There is no CI workflow. Before pushing, run `npm run lint`, `npm run typecheck` and `npm run test` in `backend/`.
