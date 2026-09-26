# FitSync — Pose-Coach Frontend (Vite + React + TS)

The high-fidelity AI Pose-Coach UI from the Claude Design handoff, wired to the **real**
FitSync squat pipeline. This is the sole UI; it replaced an earlier vanilla-JS dev panel
(since removed).

## What it is

- **Landscape-first 1280×720 HUD** (the design's Section E zone map), auto-scaled to fit.
- Three frames in scope (squat-only): **F1 Calibration → F3 Active Workout → F5 Summary**.
  (The design's F2 brief / F4 rest multi-exercise machinery is intentionally out of scope.)
- The design's `useEngine()` architecture is preserved: components read an `EngineState` and
  never know the data source. The source here is the **real `/ws` backend + MediaPipe**, not a
  mock tick loop.

## Architecture

```
MediaPipe PoseLandmarker (pose/usePose.ts)
  → 33 keypoints + visibility → WebSocket /ws → FastAPI backend (unchanged)
      → calibration → rep counter → squat rules → cue arbiter
  → { calib_state, rep_state, rules, cues }
      → engine/adapter.ts  (maps backend response → contract fields:
                            formScore, symmetryScore, flaggedJoint, severity, repTicks, ROM…)
      → engine/useEngine.ts (reducer + WS client + session accumulation)
      → EngineState → components (C1,C3,C4,C5,C6,C7,C8,C9,C12) / frames (F1,F3,F5)
```

## Files & their purpose

| File | Purpose |
|---|---|
| `index.html` | Vite entry. Loads Barlow fonts + defines the quality-color CSS variables and global styles once. |
| `vite.config.ts` | `base: './'` (assets resolve under the FastAPI mount), build → `../frontend-dist`, and a dev `/ws` proxy to `:8000`. |
| `src/main.tsx` | Mounts `<App>` inside `<StrictMode>` and an `<ErrorBoundary>`. The camera/WS effects are idempotent, so StrictMode's dev double-invoke no longer opens them twice. |
| `src/App.tsx` | Top-level: wires `useEngine` + `usePose`, the camera-start gesture, the **F1 → F3 → F5** view switch, the persistent `<video>`, and the 1280×720 auto-scale. |
| `src/tokens.tsx` | Foundations: quality color scale (`Q`, `qColor`), type hierarchy, inline-SVG `Icon` set, and shared atoms (`Ring`, `Glass`, `L`, `fmtClock`). |
| `src/types.ts` | The UI↔data contract: `EngineState` (the design's field names) + the backend `WS*` message types. |
| `src/pose/usePose.ts` | MediaPipe `PoseLandmarker`: camera, 33-landmark detection loop, and the per-frame `{ t_ms, keypoints }` send (identical to the legacy client). |
| `src/engine/useEngine.ts` | The reducer + WebSocket client. Folds each backend frame into `EngineState`, accumulates the session log for the summary, and owns reconnect. |
| `src/engine/adapter.ts` | Pure functions mapping the backend response → contract fields: single-cue priority (safety > rep-validity > ROM > tempo > general), `flaggedJoint`/severity, derived form & symmetry scores, calibration-stage mapping. |
| `src/engine/dummy.ts` | **Interim** static placeholders for fields the backend doesn't emit yet, each `// TODO(backend)`: `formScore` model, `weeklyWorkoutCount`, `currentJointAngle`, the static `SQUAT` exercise config. |
| `src/components/Skeleton.tsx` | C3 skeleton overlay (real landmarks → board px, mirrored to match the selfie view) + the camera `<video>` element. |
| `src/components/Hud.tsx` | The F3 HUD components: C8 Timer, C7 Form score, C5 ROM meter, C6 Rep bar, C4 Correction cue, C9 Metrics strip, C2 compact brief, C12 Pause menu. |
| `src/frames/Frames.tsx` | The three frames: F1 Calibration, F3 Active Workout (Section-E zone map), F5 Summary. |

> A complete real-vs-interim data inventory and the production-readiness roadmap live in
> `../plan/REVIEW_pose_coach_integration.md`.

## Run

### Production (served by FastAPI, single origin)

```bash
# 1. build the frontend → ../frontend-dist
cd frontend-react && npm install && npm run build

# 2. run the backend from the codebase root (serves frontend-dist at /)
cd .. && uvicorn backend.main:app --reload
# open http://localhost:8000
```

`backend/main.py` serves `frontend-dist/` at `/`. Always `npm run build` after changing the
React app — if `frontend-dist/` hasn't been built, the server has nothing to serve and `/` 404s.

### Dev (Vite HMR + backend on :8000)

```bash
# terminal 1 — backend
uvicorn backend.main:app --reload        # :8000

# terminal 2 — Vite (proxies /ws → :8000)
cd frontend-react && npm run dev          # :5173
# open http://localhost:5173
```

`vite.config.ts` proxies the `/ws` WebSocket to the uvicorn backend so the dev server talks to
the real pipeline.

## Honored non-negotiables (handoff)

- Quality color scale only (red/amber/green/neutral), defined once in `index.html`.
- One correction cue at a time, priority-ranked.
- Low confidence ⇒ hold last value + dim (never zero, never jump).
- Rep validity (count) separate from rep quality (tick color).
- No heart rate; no metric duplicated in the strip.
- Never color alone — every status paired with an icon/label/shape.
