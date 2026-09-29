# Railway deployment guide

No Railway project configuration is included in this guide. The Run Module
Dockerfile now lives at `run-module/Dockerfile`, inside its `run-module/` build
context; its `COPY` lines are unchanged. This guide records the verified
decisions and setup sequence while Render remains untouched.

Railway's current repo-as-code format is TypeScript Infrastructure as Code
(IaC), one file for the whole project. `railway.json` / `railway.toml` are
deprecated and new services cannot opt into them. IaC is evaluated by the CLI;
`plan` previews and `apply` provisions after confirmation. References:
[IaC](https://docs.railway.com/infrastructure-as-code),
[IaC reference](https://docs.railway.com/infrastructure-as-code/reference).

## Railway config status

For Railway, set the Run service root directory to `/run-module`; its
`Dockerfile` is now at that source root and the existing `COPY backend/` and
`COPY db/` paths resolve against that context. Railway can detect the default
`Dockerfile` at the source root. References: [Railway monorepos](https://docs.railway.com/deployments/monorepo),
[Dockerfiles](https://docs.railway.com/builds/dockerfiles).

The complete Railway IaC configuration still needs to be authored and reviewed
as one project-level file before anyone plans or applies it.

## R1 — Research and deployment decisions

### Secret files

Railway provides runtime variables (including multiline values) and persistent
volumes, but no Render-style Secret File facility that automatically mounts
uploaded files at `/etc/secrets/`. Files can be uploaded to a volume using the
Railway CLI. A volume is manually managed storage, mounted only at runtime.
References: [Variables](https://docs.railway.com/variables),
[Volumes](https://docs.railway.com/volumes),
[volume CLI](https://docs.railway.com/cli/volume).

No source change is needed for these three cases:

* **`jwt-private.pem` on Exercise:** code accepts the PEM as `JWT_PRIVATE_KEY`
  (multiline or `\\n`-escaped), and also supports `JWT_PRIVATE_KEY_FILE`.
  Prefer a sealed, service-scoped `JWT_PRIVATE_KEY` value; alternatively mount
  a volume at `/etc/secrets` and set the existing file path variable.
* **`prod-ca-2021.crt`:** current Supabase URLs use
  `sslrootcert=/etc/secrets/prod-ca-2021.crt`. To preserve that behavior, make
  a separate `/etc/secrets` volume for each service using those URLs and upload
  the CA file to each. Railway shared variables do not share a filesystem.
  An inline CA variable would need separate driver validation or an app change;
  this guide does not assume one.
* **Optional Social `campus-zones.json`:** Social already reads JSON from
  `SOCIAL_ZONES`, so set that as a multiline/sealed variable and avoid the file.
  Or mount a Social volume at `/etc/secrets` and keep
  `SOCIAL_ZONES_FILE=/etc/secrets/campus-zones.json`.

Never put the key, CA certificate, or zones file in Git.

### PostGIS/database

The standard Railway PostgreSQL service uses an official PostgreSQL image and
does not include PostGIS by default. Railway has PostGIS marketplace templates,
so PostGIS can be run there as a separately managed container/template; the
reviewed docs do not establish it as a built-in managed-Postgres extension or
identify a plan enabling it. **For this deployment keep both existing Supabase
databases**: the shared app DB and the separate campus PostGIS DB. No DB move is
part of RAIL-1. Any later move must validate the PostGIS image/version, backup,
restore, and extension setup. Sources:
[Railway PostgreSQL](https://docs.railway.com/databases/postgresql),
[PostGIS marketplace template](https://railway.com/deploy/postgis-spatial-database).

### Separate workers and sleeping

Railway supports separate persistent services from the same GitHub repo with
different start commands. Run Module worker command:
`node --import tsx/esm src/workers/start.ts`; campus worker command:
`node dist/worker.js`. References:
[Monorepo deployments](https://docs.railway.com/deployments/monorepo),
[Start command](https://docs.railway.com/deployments/start-command),
[IaC reference](https://docs.railway.com/infrastructure-as-code/reference).
When introduced, set `RUN_WORKERS_IN_API=0` on the Run API and
`WORKER_INLINE=0` on campus API and worker. Run one replica of each worker so
jobs do not execute twice.

Railway does not automatically sleep every service after inactivity. Its
Serverless setting is optional and per-service; leave it disabled for APIs and
workers. References: [Serverless](https://docs.railway.com/deployments/serverless),
[Free trial](https://docs.railway.com/pricing/free-trial). Trial projects are
limited to five services; this topology needs seven (four APIs, two workers,
Redis), so it needs a plan/project arrangement that supports all seven.

## R2 — Existing Render inventory

Ports below are the app/container listening ports. `render.yaml` does not
explicitly set a port; the Dockerfiles/app defaults are shown. `sync: false`
means dashboard-entered, never stored in the YAML.

| Service | Dockerfile / context | Health | Port | Shared group `squirrel-shared` | `sync: false` variables | Other service variables |
|---|---|---|---:|---|---|---|
| `squirrel-exercise` | `Exercise_Mechanics--main/Dockerfile` / `Exercise_Mechanics--main` | `/` | 8000 | `JWT_SECRET` (generated), `JWT_ALGORITHM` (sync:false), `XP_TIMEZONE=Asia/Kolkata`, `SOCIAL_INTERNAL_TOKEN` (generated) | `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`, `RUN_MODULE_URL`, `SOCIAL_API_URL`, `SMTP_USER`, `SMTP_PASSWORD`, `RESEND_API_KEY`, `EMAIL_FROM` | `EXERCISE_REQUIRE_AUTH=1`; generated `MODERATION_TOKEN`; `SQUIRREL_PUBLIC_BASE_URL=https://squirrelsocial.app`; `SQUIRREL_ALLOWED_EMAIL_DOMAINS=ac.in`; `SQUIRREL_EMAIL_VERIFICATION=on` |
| `squirrel-run-api` | `run-module/Dockerfile` / `run-module` | `/health` | 3000 | Same four shared entries | `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`, `SOCIAL_API_URL` | `REDIS_URL` from `squirrel-redis`; `MIGRATE_ON_START=1`; `RUN_WORKERS_IN_API=1`; `NODE_ENV=production`; `LOG_LEVEL=info` |
| `squirrel-social` | `squirrel-social-profile-social-fixed/social-backend/Dockerfile` / `squirrel-social-profile-social-fixed/social-backend` | `/healthz` | 8100 | Same four shared entries | `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`, `SOCIAL_RUN_MODULE_URL`, `SOCIAL_HOSTELS`, `SOCIAL_ZONES_FILE`, `SOCIAL_APP_URL`, `EXPO_ACCESS_TOKEN` | None |
| `squirrel-campus` | `campus-service/Dockerfile` / `campus-service` | `/healthz` | 8080 | Same four shared entries; campus ignores JWT pair | `DATABASE_URL`, `AUTH_JWKS_URL`, `SOCIAL_API_URL`, `CORS_ORIGINS`, `REALTIME_PUBLIC_URL` | `NODE_ENV=production`; `MIGRATE_ON_START=1`; `SEED_ZONES_ON_START=1`; `WORKER_INLINE=1` |
| `squirrel-redis` | Render Key Value, no Dockerfile | N/A | 6379 | None | None | `maxmemoryPolicy=noeviction`; private-only `ipAllowList=[]`; connection string feeds Run `REDIS_URL` |

`JWT_SECRET` and `SOCIAL_INTERNAL_TOKEN` are generated in the Render shared
group, not `sync: false`. The table contains all variables named in
`render.yaml`; values marked `sync: false` must be copied from Render's
dashboard or their authoritative provider, never guessed.

## R3/R4 — Setup sequence

1. Leave Render online. Create a new Railway project and production
   environment. Do not change domains or Vercel traffic yet.
2. Confirm plan/service capacity: the full stack is seven services, beyond the
   five-service trial cap.
3. Keep the existing two Supabase databases. Set the shared app DB URL on
   Exercise, Run, and Social; set the separate PostGIS Supabase URL on campus.
   Preserve `sslrootcert` and upload the CA to per-service `/etc/secrets`
   volumes as above.
4. In Railway Shared Variables, define `JWT_SECRET`, `JWT_ALGORITHM`,
   `XP_TIMEZONE=Asia/Kolkata`, and `SOCIAL_INTERNAL_TOKEN`. IaC's
   `ctx.shared.NAME` references an existing shared variable; it does not create
   it. Generate a new high-entropy internal token.
5. Configure **RS256 before this new environment has live users**. Generate a
   new RSA key pair; set shared `JWT_ALGORITHM=RS256`, shared `JWT_SECRET` to
   the public PEM, and Exercise-only `JWT_PRIVATE_KEY` to the private PEM.
   Never put the private key in the shared group. Point campus
   `AUTH_JWKS_URL` to Exercise's `/api/auth/jwks.json`. Validate Run/Social
   verification before connecting clients. This fresh-environment switch is
   safer than switching the active Render environment with live users.
6. Once the complete IaC file exists, define the four app services from the
   existing Dockerfiles and Redis. Use generated Railway domains for public
   URLs and private service references only where the caller runs in the
   Railway private network.
7. Create separate Run and campus worker services using the commands above.
   Set `RUN_WORKERS_IN_API=0` / `WORKER_INLINE=0` in their API and worker
   services. Run exactly one replica for each worker. Keep migrations and
   campus zone seeding enabled on their API services only.
8. Configure optional campus zones through Social's `SOCIAL_ZONES` variable
   or the Social-mounted file volume. Configure each inventory variable from
   the current Render dashboard; do not place secrets in code.
9. From the directory holding the eventual IaC file, install the Railway SDK,
   link the new project/environment, then inspect and apply only a reviewed
   plan:

   ```powershell
   npm install railway
   railway login
   railway link
   railway config plan --file railway/railway.ts
   railway config apply --file railway/railway.ts
   ```

   No account, project, or deployment was created for this ticket.
10. Check Railway health paths: Exercise `/`, Run `/health`, Social `/healthz`,
    Campus `/healthz`. Then verify sign-in/JWKS, activity publication, Run
    Redis connectivity, and campus PostGIS operations before routing clients.
11. The web app remains on Vercel; it is not migrated here. Roll back by leaving
    Railway domains unused and continuing to use the unchanged Render services.

### Per-service variable checklist

* **Exercise:** shared variables; `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`,
  `RUN_MODULE_URL`, `SOCIAL_API_URL`, `EXERCISE_REQUIRE_AUTH=1`,
  `MODERATION_TOKEN`, `SQUIRREL_PUBLIC_BASE_URL`,
  `SQUIRREL_ALLOWED_EMAIL_DOMAINS`, `SQUIRREL_EMAIL_VERIFICATION`,
  `SMTP_USER`, `SMTP_PASSWORD`, `RESEND_API_KEY`, `EMAIL_FROM`, and
  `JWT_PRIVATE_KEY` (RS256).
* **Run API:** shared variables; `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`,
  `REDIS_URL`, `MIGRATE_ON_START=1`, `RUN_WORKERS_IN_API=0`, `SOCIAL_API_URL`,
  `NODE_ENV=production`, `LOG_LEVEL=info`.
* **Run worker:** `DATABASE_URL`, `REDIS_URL`, shared `JWT_SECRET` and
  `JWT_ALGORITHM`, `RUN_WORKERS_IN_API=0`, `NODE_ENV=production`,
  `LOG_LEVEL=info`; start with `node --import tsx/esm src/workers/start.ts`.
* **Social:** shared variables; `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`,
  `SOCIAL_RUN_MODULE_URL`, `SOCIAL_HOSTELS`, optional `SOCIAL_ZONES` or
  `SOCIAL_ZONES_FILE`, `SOCIAL_APP_URL`, optional `EXPO_ACCESS_TOKEN`.
* **Campus API:** its PostGIS `DATABASE_URL`, `AUTH_JWKS_URL`, `SOCIAL_API_URL`,
  `CORS_ORIGINS`, `REALTIME_PUBLIC_URL`, `NODE_ENV=production`,
  `MIGRATE_ON_START=1`, `SEED_ZONES_ON_START=1`, `WORKER_INLINE=0`, and shared
  `SOCIAL_INTERNAL_TOKEN`.
* **Campus worker:** same campus DB/JWKS/social/internal-token settings,
  `NODE_ENV=production`, `WORKER_INLINE=0`; start with `node dist/worker.js`.
* **Redis:** use its Railway connection string as `REDIS_URL` for both Run
  processes; retain private-only access and no-eviction behavior.

## R5/R6 — Change boundary and source checks

No application change is needed for the named PEM and zones files when using
the supported env/volume options. DOCK-2 moves the Run Module Dockerfile
without changing its contents and updates Render's Dockerfile path. No other
application, database, or Render setting is changed by that move.

| Verification | Result |
|---|---|
| Dockerfile paths | All four Render paths exist. Exercise, Social, campus, and the moved Run Module Dockerfiles are inside their respective contexts. |
| Exercise `/` | Root route exists in the Exercise FastAPI app. |
| Run `/health` | Exists in `run-module/backend/src/api/routes/health.ts`. |
| Social `/healthz` | Exists in `squirrel-social-profile-social-fixed/social-backend/app/main.py`. |
| Campus `/healthz` | Exists in `campus-service/src/app.ts`. |
| Variable names | Checked against Exercise `backend/config.py` and `backend/auth/tokens.py`; Run `backend/src/config/env.ts` and `src/api/server.ts`; Social `app/config.py`; campus `src/config.ts`. The inventory names match the values declared by `render.yaml`; the code additionally reads optional configuration not set there. |

These are repository source inspections, not deployments or live health checks.
