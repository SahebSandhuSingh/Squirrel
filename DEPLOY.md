# Deploying Squirrel (free plans)

| Part | Where | Config |
|---|---|---|
| Web version of the app (`mobilessss/`) | **Vercel** (Hobby) | [`vercel.json`](vercel.json) |
| Exercise backend, Run Module API (with its workers), Redis | **Render** (free) | [`render.yaml`](render.yaml) |
| Database | **Supabase** (free) | already set up |
| Phone app | **EAS Build**, then the App Store / Play Store | |

Order: the web app first (it runs on sample data until the backends exist), then the backends, then
connect the two.

## What the free plans mean

- **Render free services sleep** after 15 minutes without requests. The next request wakes them in
  about a minute. While the Run Module sleeps, its hourly leaderboard snapshot and nightly territory
  decay wait until it wakes.
- **Their files are wiped** when they sleep or redeploy. Accounts, profiles, runs, territory and XP
  are in Supabase and stay. The Exercise backend's session files do not, so **workout history and
  reports reset**.
- **Render free Redis** keeps no copy on disk: a restart loses queued jobs; the leaderboard can be
  rebuilt from Postgres.
- Render gives **750 free hours a month** across the workspace, plenty for services that sleep.
- **Supabase free** pauses a project after a week without activity (restore it from the dashboard).
- **Vercel Hobby** is for non-commercial use; move to Pro (or Cloudflare Pages) for launch.

## 1. Web app on Vercel

1. vercel.com → sign up with GitHub (Hobby).
2. **Add New… → Project** → import `SahebSandhuSingh/Squirrel`. If it is not listed, **Adjust GitHub
   App Permissions** and give Vercel that repository.
3. **Project Name** decides the address: `squirrel-social` → `https://squirrel-social.vercel.app`.
   Write it down. **Framework Preset:** Other. Leave everything else; no environment variables yet.
   **Deploy.** The first deploy builds `main` and fails or shows nothing; that is expected.
4. **Settings → Environments → Production → Branch Tracking** (older layout: Settings → Git →
   Production Branch): `saheb`. **Settings → Build and Deployment → Node.js Version:** `22.x`, and
   no Build/Output/Install overrides switched on (the root `vercel.json` builds `mobilessss`).
5. **Deployments → Create Deployment →** branch `saheb`. The log shows `cd mobilessss && npm ci`,
   the Expo export, and ends with `Exported: dist` after 2–4 minutes. (A build that ends in under a
   second built nothing: check the branch.)
6. Open the address: the Squirrel Social welcome screen, on sample data.

## 2. Backends on Render

**You need:**

- The Supabase **Session pooler** URL (port 5432, user `postgres.<project-ref>`, not the 6543
  transaction pooler), with Supabase's CA certificate at `/etc/secrets`:

  ```
  postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=/etc/secrets/prod-ca-2021.crt
  ```

- The certificate: Supabase → Database → SSL Configuration → download `prod-ca-2021.crt`.

**Steps:**

1. render.com → sign up with GitHub → **New → Blueprint** → connect `SahebSandhuSingh/Squirrel`,
   branch **`saheb`**. Render reads `render.yaml`: two free web services, a free Key Value (Redis)
   and an environment group `squirrel-shared` with a generated `JWT_SECRET` both backends share.
2. It asks for:
   - `DATABASE_URL` (twice, same value): the Supabase URL above.
   - `CORS_ALLOWED_ORIGINS` (twice): your Vercel address, plus previews if you like:
     `https://squirrel-social.vercel.app,https://squirrel-social-*.vercel.app`
   - `RUN_MODULE_URL`: `https://squirrel-run-api.onrender.com`
3. **Apply.** The first deploys cannot reach the database yet; that is expected.
4. **Env Groups → `squirrel-shared` → Secret Files → Add:** name `prod-ca-2021.crt`, contents: the
   certificate file. Save.
5. On **squirrel-run-api** and **squirrel-exercise**: **Manual Deploy → Deploy latest commit**. The
   Run Module applies its migrations as it starts, and runs its workers in the same process; the
   Exercise backend applies its own migrations at startup.
6. Check:
   - `https://squirrel-run-api.onrender.com/health` → `"status":"ok"`, Postgres and Redis connected.
   - `https://squirrel-exercise.onrender.com/` opens the browser coach.

   If Render added a suffix to a name (because it was taken), use the addresses the dashboard shows,
   and correct `RUN_MODULE_URL` on squirrel-exercise to match.

## 3. Connect the web app

1. Vercel → **Settings → Environment Variables** (Production and Preview):

   | Name | Value |
   |---|---|
   | `EXPO_PUBLIC_EXERCISE_API_URL` | `https://squirrel-exercise.onrender.com` |
   | `EXPO_PUBLIC_API_URL` | `https://squirrel-run-api.onrender.com` |

   `https://`, no trailing slash. They are built into the app, so:
2. **Deployments → latest → ⋯ → Redeploy.**
3. Open the site, create an account, check that the profile and XP load. The first request after a
   quiet spell can take a minute while Render wakes the backend.
   "Cannot reach the server" → the Vercel address is missing from `CORS_ALLOWED_ORIGINS` on Render,
   or an address has a typo.

A custom domain goes in Vercel → Domains, and into `CORS_ALLOWED_ORIGINS` on both Render services.

## 4. Phone app

Set the same two `EXPO_PUBLIC_*` values as EAS environment variables, then
`npx eas-cli@latest build`. The phone app is not a browser and needs no CORS.

## Later, on paid plans

A disk for the Exercise backend (keeps workout history), the Run Module worker as its own service
(`node --import tsx/esm src/workers/start.ts`, without `RUN_WORKERS_IN_API`), migrations as a
pre-deploy command, and no sleeping. Before real users: RS256 tokens (run-module ADR-003).
