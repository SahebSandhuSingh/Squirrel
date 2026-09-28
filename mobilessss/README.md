# Squirrel Social — mobile app

A social-fitness app with a neon-city feel. Track runs, complete missions, earn XP, level up, unlock cosmetics, join crews and events, and build a fitness identity with your friends.

Built with Expo SDK 57, React Native 0.86, Expo Router and TypeScript. It runs on iOS, Android and the web from one codebase.

## Run it

```bash
cd mobile
npm install
npx expo start          # i = iOS simulator, a = Android, w = web, or scan the QR code with Expo Go
```

Other commands:

```bash
npm run typecheck       # tsc --noEmit
npm run lint            # expo lint (eslint-config-expo)
npx expo start --web    # browser preview at phone size
```

Everything ships in Expo Go (`react-native-svg`, `expo-linear-gradient`, `expo-haptics`, `expo-font`, Google Fonts), so no custom dev build is needed. It uses no paid APIs. Profile and Social come from the Social service (`../social-backend`); runs and XP come from the Run Module; the rest is still local demo data (see the table below).

## Screens

| Route | Screen |
|---|---|
| `/sign-in` | Sign in (account service), demo mode, or developer token |
| `/territory` | Own your block: district map, zone control, decay |
| `/challenges` | Daily, head-to-head and group challenges (auto-resolve) |
| `/exercise/select` | **Start Exercise** picker (opened from Home). Lists the Exercise backend's catalog (`GET /api/exercises`) with plan, time and estimated calories; Start creates a real session (`POST /api/users/{id}/sessions`) |
| `/exercise/train/[key]` | Active exercise: the backend plan (sets × reps/seconds, rest). Tap each rep, or a real countdown for timed sets; camera mirror; pause/finish. Completion updates missions, XP and Home's Active/kcal rings |
| `/exercise`, `/exercise/profile`, `/exercise/plan/[key]`, `/exercise/session/[id]` | Form Coach hub, coach profile, custom plan, session report (Exercise backend) |
| `/partner-hunt/*` | **Partner Hunt** (locked · Coming soon): "Find your workout buddy". Card on the Social tab; every route (index, preferences, matching, buddy/[id], connect/[id]) shows the locked preview while `LOCKED.partnerHunt` is on |
| `/leaderboard` | **Campus Leaderboard**: students on your campus ranked by territory area (daily, weekly, all-time) |
| `/welcome` | Landing: cinematic sunset city, avatar + squirrel mascot, Get Started |
| `/avatar` | **Make It You**: body, hair, outfit, shoes, accessories, gear, emotes and pet mascot |
| `/home` *(tab)* | Top bar (avatar, level, XP, coins), greeting, activity rings, Start Run, missions, campus leaderboard, events carousel (coming soon), crew activity |
| `/explore` *(tab)* | Stylised neon city map: pulsing markers, animated route, filters, search (places + people), place carousel |
| **＋** *(tab)* | Create menu: start run, post, log workout; log water, log a meal and find an event are locked (coming soon) |
| `/social` *(tab)* | For You / Following / Nearby feeds from the Social service (cursor-paged, pull to refresh), suggested people, crews teaser |
| `/profile` *(tab)* | Server profile: counts, level (Run Module XP), streak, badges, posts/activity/saved grid; highlights and equipped cosmetics stay local |
| `/profile-edit` | Username (live availability check), name, bio, city/area, college, interests, visibility |
| `/people` | Search people by @username or name, suggestions |
| `/follows` | Followers / following of anyone, or your follow requests (`kind=requests`) |
| `/run` | Live run: 3-2-1 countdown, route animation, live stats, music/camera, hold-to-finish, summary |
| `/missions` | Daily / Weekly / Special missions with completion and claim states |
| `/progress` | **Your Progress**, in four sections:<br>• **Today:** goal ring, today's XP, activities done, XP left, run XP, streak and a level bar.<br>• **Progress:** Day/Week/Month/Year with Steps/Active/Calories/Workouts, a tap-to-read bar chart and the streak calendar with active days.<br>• **Your performance:** change vs the previous period, campus rank and milestones in reach.<br>• **Next:** the best next action (claim, run, or log a mission). |
| `/crews`, `/crew/[id]` | Find Your Crew (Nearby/Online/Campus/Interests), crew detail with members, events and posts |
| `/events`, `/event/[id]` | Events preview behind a "Coming soon" banner; the detail route shows a locked screen |
| `/level-up` | RPG level-up reveal: rays, mascot, XP bar, staggered reward cards, next unlock |
| `/rewards` | Level road, achievement badges, sticker collection |
| `/shop`, `/item/[id]` | Shop (20+ items, rarities, level locks) and item sheet (buy / equip) |
| `/compose` | Post composer: backdrop, sticker, optional self-reported activity; after a run it shares the Run Module `run_id` (the server fetches the numbers) |
| `/post/[id]` | Post with paged comments (add, delete your own) |
| `/highlight/[id]` | Full-screen story viewer for profile highlights |
| `/user/[id]` | Any user's profile, with Follow / Requested / Following |
| `/city` | City picker |
| `/notifications` | Activity notifications |

## Not launched yet (locked)

`src/data/features.ts` holds the launch switches (`LOCKED`, `COMING_SOON`, `isLocked`). UI reads them through `components/Locked.tsx`: `useLocks()` (`locked`, `notify`, `guard`) and `<FeatureGate feature fallback>`. Lock-aware components (e.g. `EventCard`) handle their own locked state, so no screen can render an interactive locked card. While a flag is on, the feature stays visible as **Coming soon** but can't be used. Every entry point is blocked: buttons, routes and the `AppState` actions.
- `LOCKED.mealWater`: Log water / Log a meal (Create sheet), the water and meal daily missions, and the Hydro Homie badge.
- `LOCKED.stories`: story bubbles on Social show a "Coming soon" toast and open the profile. Posting your own story via the composer still works.
- `LOCKED.partnerHunt`: the Social tab card and every `/partner-hunt` route (the layout renders the locked preview). The future flow and model (preferences by campus, interests, activities, availability and goals; buddy profile; connection status) are in `data/partnerHunt.ts`. There is no matching logic and no buddy data yet.
- `LOCKED.events`: `/events` (preview + banner), `/event/[id]` (locked screen), event cards and Join pills, Explore event markers, the Home meetups carousel, joining, and the "Join a crew event" weekly mission.

Locked missions are listed last and left out of the done/XP counters and claimable rewards. Set a flag to `false` at launch.

**Campus, not city.** Each city in `data/cities.ts` has a `campus`, and the leaderboard ranks students on that campus. The Run Module's leaderboard API only offers `scope=global` today, so signed-in rows are labelled as all runners until a campus scope exists.

## Look & feel: website palette + GTA-style type

- **Colours:** from the Squirrel Social website (www.squirrelsocial.in):
  - **Canvas:** near-black `#060606`, with graphite panels (`#111113` / `#17171A`) and `#27272B` lines.
  - **Lime `#D7FF1F`:** every action and everything that's "yours".
  - **Pink `#FF2D9B`:** the second voice.
  - **Variety:** purple `#A855F7`, orange `#FF8A1F` and yellow `#FFD21F`.
  - **Text:** muted text is `#A9A9AE`.
- **Type (GTA VI style):**
  - **Anton:** heavy condensed headlines and big numbers, slanted −6° like GTA title cards.
  - **Barlow Condensed:** labels, buttons and italic callouts.
  - **Inter:** body text.
  - GTA VI's own typeface is proprietary; these are the closest free Google Fonts.
- **Art:** the illustrations use the website palette (neon lime and pink city).

All UI tokens live in `src/theme.ts`; illustration colours live in `src/art/palette.ts`.

## Backend integration (Run Module)

This follows the *Frontend ↔ Backend Compatibility Assessment*.

| Area | State in the app |
|---|---|
| **Install** | `package.json` pins Expo SDK 57 / expo-router 57; the stray `"undefined"` dependency is gone |
| **Auth** | One Squirrel Social account for everything. `src/auth/account.ts` signs up / signs in against the Exercise backend's `/api/auth` (`EXPO_PUBLIC_AUTH_URL`, defaulting to `EXPO_PUBLIC_EXERCISE_API_URL`); the Run Module accepts the same token. Access and refresh tokens live in SecureStore; `src/api/client.ts` refreshes an expired token once and retries. Demo mode and a pasted developer token still work |
| **API layer** | `src/api/`, matched to the verified Run Module contract: `POST /v1/runs` → `{run_id}`; points in batches of 500 with `seq` (index in the full array), `lng`, `recorded_at`, required `accuracy_m`, and a seq-range `idempotency_key`; `/finish` is async, so the app polls `GET /v1/runs/:id` with backoff until `finalized` / `flagged` / `rejected`. XP comes from `GET /v1/users/me/xp`; the leaderboard uses `scope=global&metric=area&window=…` with `me` + `next_cursor`. 429s are retried after `Retry-After`. Your own leaderboard row is matched by the token's `sub` (`page.me` has no `user_id`). Verification polls for up to 5 min, with a "Don't wait" button after 15 s. Still marked `ASSUMPTION` in `endpoints.ts`: the create request body and leaderboard score units (m²) |
| **Runs** | Real GPS via `expo-location` (accuracy/jump filtering, auto-pause). Signed in, the run uploads and the **server's** distance, status and territory are shown; XP earned is the before/after difference from `/users/me/xp`. Without GPS (web, or permission denied), a clearly labelled demo simulation runs |
| **XP** | Local estimate uses the backend's rules (50 + 10/km + 25 territory, 150/day run cap). Signed in, the server total replaces it. Levels are derived client-side (2,000 XP each) |
| **Anti-cheat** | Run summary shows *accepted / flagged / rejected* (server verdict when live, local plausibility check otherwise) |
| **Territory** | New `/territory` screen (zones, control %, rivals, contested, 14-day decay) and area-based leaderboard (`/leaderboard`). Demo data until the territory endpoints are wired |
| **Challenges** | New `/challenges` screen (daily, head-to-head, group), auto-resolving with no claim. Missions stay as a separate frontend feature (company decision, §4.3) |
| **Exercise** | `src/api/exercise.ts` on the same `api()` client and `withRetry` policy as the Run Module, pointed at `EXPO_PUBLIC_EXERCISE_API_URL`. Endpoints (from `Exercise_Mechanics--main/backend`): `GET·PUT /api/users/{id}[/profile]`, `GET·POST /api/users/{id}/skill`, `GET /api/exercises`, `POST /api/users/{id}/sessions`, `GET /api/users/{id}/{progress,activity/{year},sessions}`, `GET …/sessions/{sid}/{overview,report}`, `GET …/sessions/{sid}/exercises/{ex}/report`. Screens under `/exercise`; Home's Form Coach card and Progress (workouts, streak, recent sessions) read live data. The coach profile belongs to the signed-in account (its id is the token's `sub`): every `/api/users/{id}/...` call carries that account's token and the backend refuses anyone else's. `PUT /api/users/{id}/profile` saves the coach details |
| **Live workouts** | Signed in, the workout screen (`src/app/exercise/train/[key].tsx`) coaches for real. The body is tracked **on the phone** by the browser coach's own tracking: MediaPipe PoseLandmarker (lite, GPU with a CPU fallback) and the same One Euro smoothing, running in a WebView (`src/workout/tracker`). The app streams the 33 landmarks to the Exercise backend's `/ws/setup` and `/ws/train` exactly as the browser coach does (`src/workout/coach.ts`, with the browser coach's own message validation in `src/workout/protocol`). Each set opens with a 10-second get-ready countdown (step back, stand straight; the screen says when the whole body is in view), then the server's stillness check and standing baseline start on their own. The server counts reps, scores form and sends cues; every set is saved, so reports, history and workout XP follow. No video leaves the phone, only body points. MediaPipe loads from jsDelivr and Google's model storage the first time (internet needed); `EXPO_PUBLIC_POSE_ASSETS_URL` can point at a self-hosted copy. Not signed in: the guided demo, labelled as such |
| **Profile + Social** | `src/api/social.ts` (typed endpoints on the same `api()` client), `src/hooks/useSocial.ts` (profile, feeds, lists, comments), `src/state/socialStore.ts` (optimistic like/save/follow with rollback, shared across screens). Needs a live session: demo mode shows a sign-in prompt instead of made-up people. Backend: `../social-backend` |
| **Still frontend-only** | Coins, cosmetics, crews/events, missions, challenges, highlights, the notifications list (except follow requests), leaderboard names. They need backend models (§5) |

To point the app at a backend, copy `.env.example` to `.env`, then set `EXPO_PUBLIC_API_URL` (and `EXPO_PUBLIC_AUTH_URL` when the account service exists). For the form coach, set `EXPO_PUBLIC_EXERCISE_API_URL` to the Exercise Mechanics server (e.g. `http://<lan-ip>:8000` for `uvicorn backend.main:app --host 0.0.0.0`). For the **web** build on another domain (e.g. Vercel), both backends must list its address in `CORS_ALLOWED_ORIGINS`; iOS/Android are unaffected. Deploying the web build: [`../DEPLOY.md`](../DEPLOY.md). For profiles, follows and posts, set `EXPO_PUBLIC_SOCIAL_API_URL` to the Social service (`squirrel-social-profile-social-fixed/social-backend`, e.g. `http://localhost:8100`); unset, the social screens show sample data.

## Architecture

```
src/
  app/                 Expo Router routes (every file is a screen)
    (tabs)/            Home · Explore · Social · Profile, plus the custom tab bar with a central Create button
  art/                 Original vector illustration library (react-native-svg)
    Mascot.tsx         Squirrel mascot: 9 poses (idle, run, celebrate, drink, lift, sit, cheer, sleep, wave) + accessories
    Character.tsx      Parametric human avatars (AvatarLook) in 6 poses, plus circular Portrait
    Scene.tsx          13 cinematic scenes (city sunset/night/dawn, run, yoga, cafe, brunch, crew, hiit…)
    Product.tsx        20 shop items (hoodie, tee, shoes, bag, bottle, sunglasses, watch…)
    Badge.tsx          12 achievement badges (plus locked state)
    Sticker.tsx        8 die-cut stickers
    Reward.tsx         Level-reward illustrations (outfit, badge, stickers, trail, coins, chest)
    CityMap.tsx        Stylised city map + animated run route
    palette.ts         Shared art palette so everything belongs to one visual universe
  components/          ui.tsx (primitives + motion), cards.tsx, Avatar, TopBar, TabBar, ProfileView, Sheet, Toast
  api/social.ts        Profile + Social API (types + endpoints); socialRules.ts mirrors the server's input rules
  hooks/useSocial.ts   useMyProfile, usePublicProfile, useFeed, usePost, useComments, useFollowList, useFollow …
  data/                Typed demo data: cities, users, community (crews/events/places), missions, shop, rewards, stats; posts.ts = post display helpers
  state/AppState.tsx   App state: identity, city, XP/level, coins, missions, shop, toasts
  state/socialStore.ts Optimistic social actions + patches shared across screens
  types.ts             Shared domain types (AvatarLook, SceneKind, ProductKind…)
  theme.ts             Colour, gradient, font and radius tokens
assets/                App icon, splash, and PNG exports of the illustration set (see assets/README.md)
```

**The city is data, not code.** `data/cities.ts` defines Pune, Mumbai, Bangalore, Delhi, Hyderabad, London and New York. Crews, events and map places are generated from each city's venues (`crewsForCity`, `eventsForCity`, `placesForCity`), and the Nearby feed filters by the active city. To add a city, add one entry. Pune is only the default demo city.

**Users aren't hard-coded.** Signed in, your profile is `GET /v1/users/me/profile` and `/user/[id]` loads anyone's from the Social service; `ProfileView` renders both. The demo `users` list only feeds the demo-only modules (crews, events, leaderboard, challenges).

**Backend-ready.** Screens read everything through `useApp()`. Replacing the demo data with API calls means swapping the seed arrays and generator functions in `data/`, and backing the `AppState` actions with requests. The component tree doesn't need to change.

**Art is code.** Illustrations are React components, so they're crisp at any size, themeable, animatable and tiny to ship. PNG exports in `assets/` are for store listings, marketing and a future backend.

## Notes

- Without GPS (web, or permission denied) run distance is simulated from pace.
- The Explore map is illustrative. A real tile map (`react-native-maps`) would need a development build.
- Local (non-social) state is in memory and resets on reload; social data lives on the server.
