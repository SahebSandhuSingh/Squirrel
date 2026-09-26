# Deploying Squirrel

| Part | Where | Config |
|---|---|---|
| Web version of the app (`mobilessss/`) | **Vercel** | [`mobilessss/vercel.json`](mobilessss/vercel.json) |
| Exercise backend, Run Module API, Run Module worker, Redis | **Render** | [`render.yaml`](render.yaml) |
| Database | **Supabase** | already set up |
| Phone app | **EAS Build**, then the App Store / Play Store | |

The backends cannot run on Vercel: live coaching uses WebSockets, workout files are saved to disk,
and the Run Module worker runs all the time. Vercel serves the web app only.

## 1. Before you start

- **Supabase connection string:** the **Session pooler** (port 5432, user `postgres.<project-ref>`), not
  the transaction pooler (6543). Use it with Supabase's CA certificate at `/etc/secrets`:

  ```
  postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=/etc/secrets/prod-ca-2021.crt
  ```

- **The CA certificate:** Supabase → Database → SSL Configuration → download `prod-ca-2021.crt`.
- **The web app's address:** pick the Vercel project name now, e.g. `squirrel-social` gives
  `https://squirrel-social.vercel.app`. The backends only answer browser calls from addresses you allow.

## 2. Backends on Render

1. Render → **New → Blueprint** → connect `sahebsandhusingh/squirrel`, branch **`saheb`**.
2. Render reads `render.yaml` and asks for:
   - `DATABASE_URL` (three times, same value): the Supabase URL above.
   - `CORS_ALLOWED_ORIGINS` (twice): the web app's address, e.g.
     `https://squirrel-social.vercel.app,https://squirrel-social-*.vercel.app`
     (the second entry lets Vercel preview deployments in too).
3. Apply. It creates four services and an environment group, `squirrel-shared`, holding a generated
   `JWT_SECRET` that both backends share.
4. **Add the certificate:** Env Groups → `squirrel-shared` → Secret Files → add `prod-ca-2021.crt`
   with the certificate's contents. The first deploys fail to reach the database until this is there.
5. **Manual Deploy → Deploy latest commit** on `squirrel-run-api`, `squirrel-run-worker` and
   `squirrel-exercise`. The Run Module applies its migrations before each deploy; the Exercise backend
   applies its own at startup.
6. Check:
   - `https://squirrel-run-api.onrender.com/health` shows Postgres and Redis connected.
   - `https://squirrel-exercise.onrender.com/` opens the browser coach.

   Render adds a suffix to a service's address if the name is taken; use the addresses the
   dashboard shows.

Plans: the Exercise backend (it has a disk), the Run Module API (it runs migrations before deploys)
and the worker need paid Starter instances; Redis is on the free plan. See Render's pricing page.

## 3. Web app on Vercel

1. Vercel → **Add New → Project** → import `sahebsandhusingh/squirrel`.
2. **Root Directory:** `mobilessss`. Build settings come from `vercel.json` (build
   `npx expo export -p web --clear`, output `dist`, every page served by `index.html`).
3. **Environment Variables:**
   - `EXPO_PUBLIC_EXERCISE_API_URL` = `https://squirrel-exercise.onrender.com`
   - `EXPO_PUBLIC_API_URL` = `https://squirrel-run-api.onrender.com`

   They are built into the app, so redeploy after changing them.
4. Deploy, then Settings → Git → **Production Branch** = `saheb`, and redeploy.
5. Open the site and create an account. If sign-in says it cannot reach the server, the web
   address is missing from `CORS_ALLOWED_ORIGINS` on Render.

A custom domain (e.g. `app.squirrelsocial.in`) goes in Vercel → Domains, and into
`CORS_ALLOWED_ORIGINS` on both Render services.

## 4. Phone app

Set the same two `EXPO_PUBLIC_*` values as EAS environment variables, then
`npx eas-cli@latest build`. The phone app is not a browser, so it does not need CORS.

## Good to know

- **Redis** on the free plan keeps no copy on disk. A restart loses queued jobs; the leaderboard can
  be rebuilt from Postgres. Runs, territory, XP, accounts and profiles are all in Postgres.
- **Deploys of the worker** stop it mid-job; BullMQ picks unfinished jobs up again.
- **Before real users:** switch tokens to RS256 (run-module ADR-003); `JWT_SECRET` is the one key for
  sign-in on both backends, so keep it only in Render.
- **Locally**, `docker compose up --build` still runs everything; set `CORS_ALLOWED_ORIGINS` in `.env`
  to try the web build against it from another port.
