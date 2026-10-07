# Debug pass — 2026-09-28

## What was run

| Check | Before | After |
|---|---|---|
| `social-backend`: `pytest` | 81 passed, 1 skipped | 81 passed, 1 skipped |
| `social-backend`: `alembic upgrade head` + `uvicorn` smoke test (`/healthz`, `/v1/users/me/profile`, `/v1/feed` with a dev token) | OK | OK |
| `mobile`: `tsc --noEmit` | clean | clean |
| `mobile`: `expo lint` | **148 problems (135 errors)** | **0** |
| `mobile`: `expo export --platform web` | builds | builds |

The one skipped backend test (`test_concurrency.py`) needs a real PostgreSQL via
`SOCIAL_TEST_DATABASE_URL`; it is not a failure.

## Mobile fixes

**Real bugs**
- `src/app/level-up.tsx` — confetti never rendered. `showConfetti` was a ref that was flipped inside an
  effect, which does not trigger a re-render, so `<Confetti visible={…showConfetti.current}>` stayed
  `false`. Confetti visibility is now derived directly from the `leveledUp` route param. The 30 confetti
  pieces and the three card animations are also created once via a lazy `useState` initialiser instead of
  being regenerated (with `Math.random`) on every render.
- `src/app/run.tsx` — `phaseRef.current = phase` was written during render; it is now synced in an
  effect. `startedAt` no longer calls `Date.now()` during render (it is set when the countdown ends, which
  was already the only place it was read). The demo-mode reset (`setSec(DEMO_START)`) now happens in the
  same place the source is decided instead of a follow-up effect.
- `src/app/leaderboard.tsx` — the tab change handler now resets the list itself; the effect only fetches.
  `loading` is derived (`paging || first live page in flight`) instead of being set from inside the effect.
- `src/art/Mascot.tsx` — the `Eyes` type shadowed the `Eyes` component; the type is now `EyeKind`.
- `src/app/(tabs)/explore.tsx` — route-animation effect was missing its `route` dependency; unused
  `PlaceKind` import removed.

**Idiom change (117 lint errors)**
- Every `useRef(new Animated.Value(x)).current` was replaced with React Native's built-in
  `useAnimatedValue(x)` hook (`ui.tsx`, `cards.tsx`, `TabBar.tsx`, `Sheet.tsx`, `Toast.tsx`, `Brand.tsx`,
  `Mascot.tsx`, `run.tsx`, `level-up.tsx`, `explore.tsx`, `highlight/[id].tsx`). Same runtime behaviour,
  but it no longer reads a ref during render, which the React Compiler lint rules reject.

**Cosmetic**
- Unescaped apostrophes in JSX text (`home.tsx`, `create.tsx`, `leaderboard.tsx`, `missions.tsx`,
  `territory.tsx`) → `&apos;`.
- `ReadonlyArray<T>` / `Array<T>` → `readonly T[]` / `T[]` in `Scene.tsx`, `sceneParts.tsx`
  (eslint `--fix`).
- Unused `Rect` import in `level-up.tsx` removed.

## Backend

No code changes were needed. The service starts with either PostgreSQL or `sqlite:///./social.db` for
local development, exactly as documented in `.env.example`.
