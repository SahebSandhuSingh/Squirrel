# backup/

Frontends and native clients that are **not built or deployed**. Kept for reference; git has their
full history under their old paths. Nothing here is used by Vercel, Render or any backend.

The live app is [`../mobile-4/`](../mobile-4/) (Vercel builds it via the root `vercel.json`). The
Exercise backend's browser coach, [`../Exercise_Mechanics--main/frontend-react/`](../Exercise_Mechanics--main/frontend-react/),
is also live (built into that service's Docker image).

| Folder | Was at | What it is |
|---|---|---|
| `mobilessss/` | `mobilessss/` | The app before mobile-4. Its Exercise screens (camera rep counting, workouts) were copied into mobile-4. |
| `mobile-3/` | `mobile-3/` | The "new frontend" drop of 28 Sep 2026, superseded by mobile-4. |
| `social-mobile/` | `squirrel-social-profile-social-fixed/mobile/` | The app that came with the Social backend. The backend itself (`social-backend/`) is live. |
| `mobile-nearby/` | `mobile/` | Nearby Discovery Bluetooth clients (Android Kotlin, iOS Swift). Protocol: `docs/nearby-discovery.md`. |
| `run-module-mobile/` | `run-module/mobile/` | The Run Module's native Android/iOS stubs. The Run Module backend is live. |

To bring one back, move the folder to its old path (`git mv`).
