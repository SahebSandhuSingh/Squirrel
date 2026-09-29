# Squirrel Social — campus-service

Backend for the IISER Kolkata territory / GPS-activity / claims / challenges / social-map system.
Node 20+ · TypeScript · Fastify 5 · PostgreSQL 16 + PostGIS 3. No other infrastructure.

* **docs/API.md** — every endpoint, body, response, error code
* **docs/ARCHITECTURE.md** — how verification, qualification and claims work
* **docs/GEOGRAPHIC_DATA_REQUIRED.md** — what must be surveyed before launch

## Run it locally

```bash
# 1. PostGIS (either)
docker compose up db -d                        # postgis/postgis:16-3.4 on :5432
#   or: createdb campus && psql campus -c 'CREATE EXTENSION postgis'

# 2. Service
cp .env.example .env                           # DATABASE_URL, AUTH_DEV_HS256_SECRET are enough for dev
npm install
npm run migrate                                # applies migrations/*.sql once each
npm run seed                                   # 5 hostels, 16 placeholder zones, 4 dev users, 1 crew
npm run dev                                    # API on :8080 with the verification worker inline

# 3. A dev token (HS256, dev only)
export T=$(npm run -s dev:token -- u_aanya "Aanya" aanya@iiserkol.ac.in)
curl -s localhost:8080/v1/zones | jq '.zones | length'
curl -s -H "Authorization: Bearer $T" localhost:8080/v1/me | jq .display_name
```

Point the Expo app at it: `EXPO_PUBLIC_CAMPUS_API_URL=http://<lan-ip>:8080` (the app appends `/v1`); realtime is `ws://<lan-ip>:8080/v1/realtime`.

## Scripts

| command | what |
|---|---|
| `npm run dev` / `npm start` | API (+ inline worker when `WORKER_INLINE=1`) |
| `npm run dev:worker` / `npm run start:worker` | standalone verification worker (run ≥ 1 in prod, set `WORKER_INLINE=0` on the API) |
| `npm run migrate` · `npm run seed` | schema · dev data (seed is idempotent and never overwrites non-placeholder geometry) |
| `npm run seed:zones` | hostels + placeholder zones only (no dev users, no dev crew) |
| `node dist/db/migrate.js` · `node dist/seed/run.js --zones-only` | the same from the production image (no `tsx` there) |
| `npm run typecheck` · `npm run build` | tsc |
| `npm test` | unit tests (no DB) + integration tests (need `TEST_DATABASE_URL`, see below) |

## Tests

```bash
npm run test:unit                                                          # GPS validation, anti-cheat, rules, privacy — 33 tests
TEST_DATABASE_URL=postgres://campus:campus@localhost:5432/campus_test npm run test:integration   # 81 tests, DB is reset per file
```
The test database needs PostGIS available (`CREATE DATABASE campus_test`; the migrations run `CREATE EXTENSION postgis`). Every integration file drops and recreates the `public` schema, so never point `TEST_DATABASE_URL` at a real database.
Integration coverage: verified → qualified → claim; duplicate claim; unverified/pending/insufficient → cannot claim; steal (shield, unqualified, owner, success + notification); defend (owner-only, under-attack-only, spends attackers' eligibility); 4 concurrent claimers → exactly one owner; 5 identical requests → one write; ROUTE zone loop vs cut-through; invalid GPS payloads (malformed, backwards time, teleport, accuracy, off-campus); batch upload + idempotent batches + finish; presence never exposes coordinates, nearby needs mutual open-to-meet; challenge lifecycle with server-decided winner; auth/404 behaviour; blocks, crews, meetups, shared zones, Squirrel Dates, heatmap; the Social identity bridge against a fake Social server (profile ids out and in, Social names, realtime frames, Social down/timeout/401 fallback, bridge off).

## Identity bridge to Social

Users are keyed by the JWT `sub` internally. The Social service owns the public identity: a **profile id** (≠ `sub`), display name, avatar, hostel. Set `SOCIAL_API_URL` **and** `SOCIAL_INTERNAL_TOKEN` to turn the bridge on (either unset = off, ids are subs as before):

* **Out** — every user id in HTTP responses, realtime frames (incl. `auth.ok`) and notifications (`actor`, `data.user_id`) is the Social profile id; `display_name`/`avatar_url` come from Social, `hostel` from Social when it has one. One central step (`src/identity/translate.ts`) runs in the `preSerialization` hook and in `realtime/ws.ts`; it rewrites the fields listed in `USER_ID_KEYS` and every person-shaped object (`user_id` + `display_name`).
* **In** — ids clients send (`/v1/users/:id`, `…/context`, `…/block`, meetup `invitee_ids`, challenge `target.id`, crew `transfer_to`) may be profile ids; `src/identity/inbound.ts` resolves them to subs before the handler runs. An id that doesn't resolve is used as-is (existing campus ids keep working; unknown ids 404 as before).
* **Stored names** — first sight of a user and every cache refresh write Social's name/avatar into `users`, so server-built text ("Aanya stole CC1 from you") uses real names. With the bridge on, `PATCH /v1/me` `display_name`/`avatar_url` are overridden by Social on the next refresh — edit the Social profile instead.
* **Failure** — `POST {SOCIAL_API_URL}/internal/v1/people/resolve`, batched (≤ 200), cached 5 min both ways, 3 s timeout, 30 s back-off after a failure. Social down / 401 / 404 → a warning is logged and campus data is used (id = sub, campus name); a request never fails because of Social.

## Production checklist

1. `NODE_ENV=production`, `AUTH_JWKS_URL` (or `AUTH_PUBLIC_KEY_PEM`) — the API refuses to start without a key source. For the Exercise backend's tokens use `AUTH_JWKS_URL=https://squirrel-exercise.onrender.com/api/auth/jwks.json` and leave `AUTH_ISSUER`/`AUTH_AUDIENCE` **empty** (those tokens carry neither claim). `AUTH_DEV_HS256_SECRET` is ignored in production.
1. `SOCIAL_API_URL` + `SOCIAL_INTERNAL_TOKEN` so ids and names match the Social app (see above).
2. Replace placeholder zone geometry (docs/GEOGRAPHIC_DATA_REQUIRED.md).
3. Run ≥ 1 worker process; `WORKER_INLINE=0` on API instances.
4. `REALTIME_PUBLIC_URL=wss://…/v1/realtime`, `CORS_ORIGINS` for any web origins.
5. TLS termination and WebSocket pass-through at the load balancer; `trustProxy` is on.
6. Backups; `pg_stat_statements` on; retention job for `presence` (`sweepPresence`) and `idempotency_keys` (> 7 days) — both are trivial `DELETE`s to schedule.

Container: `docker build -t campus-service .` — API by default, worker with `node dist/worker.js`.

### One free Render web service

Docker runtime, `dockerContext: ./campus-service`, start command = the image's `node dist/index.js`, health check path `/healthz` (`/readyz` also pings the database). Env: `NODE_ENV=production`, `DATABASE_URL` (PostGIS database), `AUTH_JWKS_URL` (above; `AUTH_ISSUER`/`AUTH_AUDIENCE` unset), `SOCIAL_API_URL`, `SOCIAL_INTERNAL_TOKEN`, `MIGRATE_ON_START=1`, `SEED_ZONES_ON_START=1`, `WORKER_INLINE=1`, `CORS_ORIGINS`, `REALTIME_PUBLIC_URL=wss://<host>/v1/realtime`. Render sets `PORT`. Start-up runs migrations (each once, advisory-locked), then upserts the 5 hostels and 16 placeholder zones (`geometry_source: "dev_placeholder"`, visible in `/v1/zones` and `/v1/map/features`), then listens. Use a session-mode connection (not a transaction pooler): the realtime fan-out and worker use `LISTEN/NOTIFY`, the migrator a session advisory lock.
