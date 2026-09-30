# Squirrel

| Path | What it is |
|---|---|
| `mobile/` | Moved to `backup/social-mobile/` at the repository root; the app is `mobile-4/` now |
| `social-backend/` | Profile + Social service (FastAPI, PostgreSQL, Alembic): profiles, follows, posts, likes, comments, feeds. See `social-backend/README.md` |
| `Exercise_Mechanics--main/` | Exercise Mechanics / form-coach backend (FastAPI, `/api`) |

The Run Module (runs, XP, leaderboard; `/v1`) is a separate service that isn't in this repository.
The app talks to it through `mobile/src/api/endpoints.ts`, and the Social service reads XP and run
stats from it with the user's own token.

Quick start (local):

```bash
# Social service
cd social-backend && python3.11 -m venv .venv && .venv/bin/pip install -r requirements.txt
export SOCIAL_DATABASE_URL=postgresql+psycopg://USER:PASS@localhost:5432/social
.venv/bin/alembic upgrade head
.venv/bin/python scripts/dev_token.py init && export SOCIAL_JWT_PUBLIC_KEY_FILE=dev-keys/public.pem
.venv/bin/uvicorn app.main:app --port 8100

# App (another terminal)
cd mobile && npm install
EXPO_PUBLIC_SOCIAL_API_URL=http://localhost:8100 npx expo start
# Sign in → "Developer: paste a backend token" → output of: social-backend/.venv/bin/python social-backend/scripts/dev_token.py token <name>
```
