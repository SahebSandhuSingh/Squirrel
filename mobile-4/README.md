# Squirrel Social — mobile app

A social-fitness app with a neon-city feel. Track runs, complete missions, earn XP, level up, unlock cosmetics, join crews and events, and build a fitness identity with your friends.

Built with Expo SDK 57, React Native 0.86, Expo Router and TypeScript. It runs on iOS, Android and the web from one codebase.

## Run it

```bash
cd mobile-4
npm install
npx expo start          # i = iOS simulator, a = Android, w = web, or scan the QR code with Expo Go
```

Other commands:

```bash
npm run typecheck       # tsc --noEmit
npx expo start --web    # browser preview at phone size
```

With no backend URLs (`.env.example`) it runs on local demo data. Live workouts (camera pose tracking in a WebView) and push notifications need a development build (`npx expo run:ios|android` or EAS); the web build works in the browser.

## Screens

| Route | Screen |
|---|---|
| `/sign-in` | **Join / sign in with a .ac.in email** (one-time code), demo mode; password and developer token under “Other options”. New accounts go to onboarding |
| `/onboarding` | Wingman intro → **What are you looking for? Date / Friends / Crew** → hostel → Open to Meet → saved to the profile (`PATCH /v1/me`) |
| `/territory` | Redirects to the campus map |
| `/zone/[id]` | One zone: map, owner, territory status, stats, history, and **Claim / Steal / Defend** only where the backend allows |
| `/challenges` | Daily, head-to-head and group challenges (auto-resolve) |
| `/exercise/select` | **Start Exercise** picker (opened from Home). Lists the Exercise backend's catalog (`GET /api/exercises`) with plan, time and estimated calories; Start creates a real session (`POST /api/users/{id}/sessions`) |
| `/exercise/train/[key]` | Active exercise: the backend plan (sets × reps/seconds, rest). Tap each rep, or a real countdown for timed sets; camera mirror; pause/finish. Completion updates missions, XP and Home's Active/kcal rings |
| `/exercise`, `/exercise/profile`, `/exercise/plan/[key]`, `/exercise/session/[id]` | Form Coach hub, coach profile, custom plan, session report (Exercise backend) |
| `/partner-hunt/*` | **Partner Hunt** (locked · Coming soon): "Find your workout buddy". Card on the Social tab; every route (index, preferences, matching, buddy/[id], connect/[id]) shows the locked preview while `LOCKED.partnerHunt` is on |
| `/leaderboard` | **Leaderboards**: Top 10 squirrels (XP, zones held, distance) and **Hostel vs Hostel** (score, territories, activity), daily / weekly / all-time |
| `/welcome` | **Live at IISER Kolkata**: IISER-only messaging, `.ac.in` CTA, live user / zone / crew counters (from the backend), campus map visual, Founding Squirrel |
| `/avatar` | **Make It You**: body, hair, outfit, shoes, accessories, gear, emotes and pet mascot |
| `/home` *(tab)* | Top bar, greeting, activity rings, Start Exercise, Start Run, missions, **your territory** (under-attack alerts), **Active now**, Friend Mode / Challenges shortcuts, today's top squirrels, campus events, crew activity |
| `/explore` *(Map tab)* | **Squirrel Social Map**: full-screen game world (terrain, roads, buildings, POIs), territories by status (neutral / controlled / contested / under attack), your avatar marker, nearby Squirrels with clustering, player / territory / POI sheets, nearby list with search, Poke from any card |
| **＋** *(tab)* | Create menu: start run, post, log workout; log water, log a meal and find an event are locked (coming soon) |
| `/social` *(tab)* | Stories, For You / Following / Nearby feed, **Squirrels near you** (with Poke), suggested people, crews teaser |
| `/profile` *(tab)* | **Campus profile**: photo, name, bio, connection mode, Founding Squirrel, Open to Meet toggle, activity stats (distance, month, zones, defended, stolen, crews, events, streak), territory, crews, badges, activity history, verification. (The offline demo profile when the campus backend is off.) |
| `/edit-profile` | Name, bio, connection mode, hostel |
| `/run` | **Run / Walk**: pick activity, permission handling, live GPS route on the campus map, distance/duration/pace, pause, finish or discard; summary with route, **zones interacted with / eligible**, and the backend-allowed claim action. Upload retry on network failure |
| `/missions` | Daily / Weekly / Special missions with completion and claim states |
| `/progress` | **Your Progress**, in four sections:<br>• **Today:** goal ring, today's XP, activities done, XP left, run XP, streak and a level bar.<br>• **Progress:** Day/Week/Month/Year with Steps/Active/Calories/Workouts, a tap-to-read bar chart and the streak calendar with active days.<br>• **Your performance:** change vs the previous period, campus rank and milestones in reach.<br>• **Next:** the best next action (claim, run, or log a mission). |
| `/crews`, `/crew/[id]`, `/crew/new` | Discover / my crews with search, crew profile (members, crew territory, upcoming events), join / leave, create (when the backend allows) |
| `/events`, `/event/[id]` | Upcoming / going; details with date, place, participants, type, territory-challenge info, RSVP / cancel RSVP |
| `/friends` | **Friend Mode**: activity-based suggestions, shared zones/crews, backend icebreakers, challenge invite |
| `/date` | **Date Mode** behind the backend safety gate; when open: toggle, activity-first profiles, suggested plans, icebreakers |
| `/active` | **Active now** + **Squirrels near you** (coarse proximity only) with the Open to Meet toggle |
| `/invites`, `/invite/new` | **Challenge invites**: incoming / sent, accept · decline · cancel; create (type, person or crew, zone, time, message) |
| `/meetups`, `/meetup/[id]` | Upcoming meetups; **check in**, attendees, optional safety-contact notification (shown as sent only when the API confirms) |
| `/badges` | Badges: unlocked, locked, progress |
| `/level-up` | RPG level-up reveal: rays, mascot, XP bar, staggered reward cards, next unlock |
| `/rewards` | Level road, achievement badges, sticker collection |
| `/shop`, `/item/[id]` | Shop (20+ items, rarities, level locks) and item sheet (buy / equip) |
| `/compose` | Post composer: backdrop, sticker and activity (pre-filled after a run) |
| `/post/[id]` | Post with comments |
| `/highlight/[id]` | Full-screen story viewer for profile highlights |
| `/user/[id]` | Anyone's campus profile: shared context, icebreakers, Challenge |
| `/city` | City picker |
| `/shared`, `/shared/[id]` | **Shared zones**: everyone you share ground with; “You’ve both been here” with one person (zone-level only) |
| `/ambassador` | **Become a Squirrel ambassador**: backend-defined form, then application status |
| `/notifications` | **Pokes & friends** (Poke Back inline) and campus notifications from the backend; demo list when the campus backend is off |

## Not launched yet (locked)

`src/data/features.ts` holds the launch switches (`LOCKED`, `COMING_SOON`, `isLocked`). UI reads them through `components/Locked.tsx`: `useLocks()` (`locked`, `notify`, `guard`) and `<FeatureGate feature fallback>`. Lock-aware components (e.g. `EventCard`) handle their own locked state, so no screen can render an interactive locked card. While a flag is on, the feature stays visible as **Coming soon** but can't be used. Every entry point is blocked: buttons, routes and the `AppState` actions.
- `LOCKED.mealWater`: Log water / Log a meal (Create sheet), the water and meal daily missions, and the Hydro Homie badge.
- `LOCKED.stories`: story bubbles on Social show a "Coming soon" toast and open the profile. Posting your own story via the composer still works.
- `LOCKED.partnerHunt`: the Social tab card and every `/partner-hunt` route (the layout renders the locked preview). The future flow and model (preferences by campus, interests, activities, availability and goals; buddy profile; connection status) are in `data/partnerHunt.ts`. There is no matching logic and no buddy data yet.
- `LOCKED.events` is **on** (not launching yet):
  - `/events` and `/event/[id]` render the Coming Soon screen, deep links included.
  - Home hides "Happening on campus" and its Study Break Walk card.
  - Event rows (Crew, Home, Events) and event notifications show the "Events are coming soon" toast.
  - `StudyBreakCard` renders nothing while locked, so JOIN WALK can't be pressed anywhere.
  - Meetups doesn't offer "Browse events". The Create sheet's "Find an event" was already gated.

Locked missions are listed last and left out of the done/XP counters and claimable rewards. Set a flag to `false` at launch.

**Campus, not city.** Each city in `data/cities.ts` has a `campus`, and the leaderboard ranks students on that campus. The Run Module's leaderboard API only offers `scope=global` today, so signed-in rows are labelled as all runners until a campus scope exists.

## Backends today (what is live)

The campus contract below is served by the Social service through an adapter
(`src/api/campus/social.ts`) until a dedicated campus backend exists:

| Live (real data) | Source |
|---|---|
| Profile, name, bio, hostel, founding badge, month km | Social `/v1/users/me/profile`, `/v1/me/membership` |
| Hostels in onboarding and Edit profile | Social `/v1/community/config` (`SOCIAL_HOSTELS`) |
| Crews: list, search, create, join, leave | Social `/v1/crews` |
| Events and RSVP (screens still locked by `LOCKED.events`) | Social `/v1/events` |
| Challenge invites = 7-day distance / workout duels | Social `/v1/challenges` |
| Squirrels board (daily, weekly) and Hostel vs Hostel | Social `/v1/leaderboards/xp`, `/hostels` |
| Notifications (and push on phones) | Social `/v1/notifications`, Expo push |
| Invite friends: code, place in line, "invite 3 to skip the line" | Social `/v1/me/membership`, `/v1/me/referral` (`/referral`) |
| People search and suggestions | Social `/v1/users/search`, `/suggestions` |
| Runs, run XP, XP total | Run Module `/v1/runs`, `/v1/users/me/xp` |
| Exercises: catalog, sessions, camera coaching, reports | Exercise backend `/api/...` |
| "Moving right now" counter | Run Module `/v1/live` + Exercise `/api/live` |

**Not live yet** (the screens say so, never invented data): named zones and claim / steal / defend,
the campus map's base layer and players, presence, pokes and friends, Open to Meet, Active-now
people, Date Mode, meetups, all-time boards, daily / group challenges (progress-service), and the
Dev A / Dev B endpoints in `src/api/availability.ts`. Connection mode and "onboarding done" are kept
on the device until the Social service has fields for them.

## Campus social (IISER Kolkata launch)

The IISER-first social layer: **Move → Discover people → Claim territory → Join crews → Meet IRL**.

**Where the data comes from** (`src/api/campus/`):

| Source | When | What the screens show |
|---|---|---|
| `live` — `http.ts` | `EXPO_PUBLIC_CAMPUS_API_URL` (or `EXPO_PUBLIC_API_URL`) is set | The backend's data, with the shared bearer token |
| `mock` — `mock/server.ts` | Development builds with no campus URL (or `EXPO_PUBLIC_DEV_MOCKS=1`) | An in-memory dev backend (IISER zones, people, crews…). Every screen shows a **Dev data** pill |
| `off` | Production build with no campus URL | “Not live yet” states — never invented numbers |

Screens only import `campusApi` (typed contract in `types.ts`); no component calls `fetch`. Swapping the mock for the real backend is the one line in `api/campus/index.ts`; if the backend's shapes differ, adapt `http.ts`. Routes the app calls:

```
GET  /v1/config                      GET  /v1/campus/stats
GET  /v1/me   PATCH /v1/me           PUT  /v1/me/open-to-meet     GET /v1/me/badges
GET  /v1/users/{id}                  GET  /v1/users/{id}/context   (shared zones/crews + icebreakers)
GET  /v1/zones                       GET  /v1/territories          GET /v1/zones/{id}
POST /v1/zones/{id}/claim | steal | defend   { idempotency_key }
GET  /v1/runs/{run_id}/zones         (zones a verified run interacted with + current eligibility)
GET  /v1/crews  POST /v1/crews       GET  /v1/crews/{id}           POST /v1/crews/{id}/join | leave
GET  /v1/events                      GET  /v1/events/{id}          PUT | DELETE /v1/events/{id}/rsvp
GET  /v1/people/suggested?mode=friends|date                        GET /v1/people/active
GET  /v1/challenge-invites/types     GET | POST /v1/challenge-invites   POST /v1/challenge-invites/{id}/accept | decline | cancel
GET  /v1/leaderboards/squirrels?period=&limit=                     GET /v1/leaderboards/hostels?period=
GET  /v1/meetups                     GET  /v1/meetups/{id}         POST /v1/meetups/{id}/check-in { notify_safety_contact }
WS   realtime_url  →  territory.updated · stats.updated · invite.updated · event.updated · active.updated
```

**Territory model.** RUN (a GPS route, owned by the Run Module) ≠ ZONE (a fixed named area) ≠ TERRITORY (who owns a zone). A run *interacts* with zones; the backend decides eligibility; the user claims, steals or defends. Nothing in the app claims a zone because a route crossed it. Claim/steal/defend buttons appear only when the zone's `actions.*.allowed` says so (otherwise the backend's `reason` is shown), every attempt sends an idempotency key, has loading / success / failure states, and the returned territory replaces local state.

**Live updates and performance.** `state/territoryStore.ts` keeps one territory per zone (highest `version` wins). Each map polygon subscribes to its own zone, so one ownership change repaints one polygon. Pan/zoom is an `Animated` transform (no SVG re-render). Updates arrive over the WebSocket when configured; otherwise screens refresh on focus (at most once a minute) — no tight polling.

**Privacy.** The app never shows another person's exact location or route: the Map draws only the approximate, backend-snapped positions it is given, Active Now uses coarse proximity buckets, and only your own route is drawn. Nearby people are shown only while you're Open to Meet. No secrets in `EXPO_PUBLIC_*`.

**Sign-in.** One account for every backend, on the Exercise backend: `POST /api/auth/email/start {email}` emails a 6-digit code to a .ac.in address (`new_account` says whether it has an account yet), and `POST /api/auth/email/verify {email, code, first_name?, last_name?}` returns tokens (a new address needs a first name and becomes a verified account with no password). Access tokens last 15 minutes and are refreshed with the single-use refresh token (`api/client.ts`). Password sign-in stays under “Other sign-in options” for older accounts. In the dev mock the code is `246810`.

**Date Mode** unlocks only when `GET /v1/config` reports `features.date_mode.available`; the requirements list comes from the backend.

## Map & Poke → Poke Back → Friends

The Map is the main way to discover people: see who's around → tap them → **POKE 👋**. When they poke back you're **FRIENDS 🎉**. The backend decides everything that matters: who appears on the map and roughly where, whether a poke is allowed, reciprocity, friendship and territory ownership. The app only displays it.

**Routes** (added to `http.ts`; mocked in `mock/server.ts`):

```
GET  /v1/map/features               roads, paths, buildings, terrain, POIs (static base map)
GET  /v1/map/players                → { players[], as_of, visible, hidden_reason }  approximate positions only
GET  /v1/zones/{id}/players         GET /v1/people/search?q=
PUT  /v1/map/presence               { lat, lng, accuracy_m }  your own location, throttled (≥ 60 s or ≥ 40 m)
GET  /v1/pokes/status/{user_id}     → { state: none | poked | poked_you | friends, can_poke, reason }
POST /v1/pokes                      { to_user_id, idempotency_key, reply? }  → { relationship, friendship_created, friend }
GET  /v1/pokes/incoming             GET /v1/friends/status/{user_id}
GET  /v1/notifications              POST /v1/notifications/read { ids }
WS   poke.received · relationship.updated · friendship.created · notification.created · players.updated
```

Service functions: `api/campus/map.ts` (getMapData, getNearbyUsers, getTerritories, getUserLocation…) and `api/campus/poke.ts` (getPokeStatus, sendPoke, pokeBack, getIncomingPokes, getFriendshipStatus, notifications).

**State.** It uses the same `useSyncExternalStore` pattern as the territory store, with no new state library:
- `state/socialStore.ts` holds one relationship per user, so a poke re-renders one button, not the map. It also holds the celebration queue and the unread count.
- `state/locationStore.ts` runs one ref-counted GPS watch (only while the Map is focused) and reports presence on a throttle.

**Poke rules in the UI:**
- **POKE** is optimistic (it shows POKED at once) and rolls back if the request fails.
- **POKE BACK** waits for the backend.
- **FRIENDS** and the celebration appear only when the backend confirms it, through `friendship_created`, a realtime `friendship.created`, or a later players list that reports the change.
- A list response never undoes a poke you made while that request was in flight.

**Map rendering** (`components/map/`):
- The base layer is a memoised SVG. Pan and zoom run as a native-driver `Animated` transform, and markers counter-scale so they stay the same size on screen.
- Players are clustered on a screen-space grid, recalculated when a gesture ends. Tapping a cluster zooms in; at maximum zoom it lists the people in it.
- Location updates re-render only the "you" marker and the header.

**Reusable components:**
- `PokeButton`, `NearbyUserCard`, `PokeNotificationCard` and `NearbySquirrels` (in `components/social/`).
- `SocialHost`, mounted in the root layout, routes realtime events and shows the "You're friends" celebration.

**States:**
- Loading shows the mascot and a scan line.
- An empty map shows “Nobody nearby yet. Your next Squirrel might be closer than you think.”
- If location is off, denied or unavailable, a banner offers Allow or Settings.
- A network failure keeps the last map and markers, with a Retry banner.
- Only one banner is shown at a time, the most important first.

In the web dev mock with no GPS, the map uses a demo location on campus, labelled as such.

**Dev mock:**
- Rhea, Zoya and Meera poke back 10 s after you poke them.
- Aarav and Kabir have already poked you.
- Dev pokes you 30 s after the app opens.
- `EXPO_PUBLIC_MOCK_FAIL_RATE=0.3` makes writes (pokes, claims) fail at random, to exercise rollback and error toasts.

## Light & dark themes

- **Two complete palettes** live in `src/theme.ts`:
  - **Dark** is the original night-campus identity.
  - **Light** is its daytime twin: warm paper canvas, white cards, near-black ink, and deeper lime and pink for text and icons so they stay readable. Filled CTAs keep the neon lime (`primaryFill`) with an ink outline.
- **Theme-aware tokens:** `panel`, `backdrop` and `mapColors` (the campus map's base layer), plus `alpha(color, a)` for tints and `statusBarStyle`.
- **Artwork stays as it is** (scenes, the title screen, the camera and story views), and so does text drawn over it (`onImage`).
- **Switching:** Profile → More → **Appearance** (Dark / Light).
  - The choice is saved on the device: SecureStore on phones (read synchronously at start-up), localStorage on web.
  - The app then reloads once (`reloadAppAsync`, or `location.reload` on web), so every screen, sheet and module-level style is rebuilt with the new palette. On web you return to Profile; on phones the app restarts at Home.
- **No hardcoded colours:** every colour in `app/` and `components/` goes through tokens, except imagery-bound overlays, which are dark on purpose.

## Profile building (onboarding → About you)

- **Step 1 of the existing onboarding** collects the profile details:
  - **Required:** full name, personal email, college email (must match the campus domain from `/v1/config`), phone (+91, normalised to E.164), gender, age (16–99) and course (from `campus.courses` if the backend sends them, otherwise common programmes, plus "Other").
  - **Optional:** CGPA (0–10, up to 2 decimals).
- **Blocking and errors:** Continue is blocked until every required field is valid. Errors show inline once a field is left, or after Continue is tried. Each field uses the right keyboard.
- **Rules:** they live in `logic/profileValidation.ts`, unit-tested in `logic/profileValidation.test.mjs` (`npm test`).
- **Saving:** the details are sent as `profile_details` on the existing `PATCH /v1/me` (a frontend contract; the backend should validate again). They stay private and never appear on the public profile.
- **Not live yet:** the `profile_details` field has no backend (capability `profileDetails`). While it's unavailable, step 1 shows "Profile details · Not live yet" instead of collecting details it can't store. Finish still saves mode, hostel and onboarding (the rest of `PATCH /v1/me` is live) and says the details weren't saved. If the backend is opted in but answers 404 `no_route`/501, the save retries without `profile_details` and says so. Real errors (401, 422, 5xx, offline) are shown as errors.

## Workout with partner (shared rep workout)

- **Flow:** Start Exercise → pick an exercise → **Start** (solo) or the pink **partner** icon → `/workout/new` → create the session → share the invite link (native share sheet or Copy) → partner opens it (`squirrelsocial://workout/join/{code}`, or `/w/{code}` on web) → waiting room → both tap **I'm ready** → shared countdown → rep race (your reps, their reps, progress, connection status, pause, undo, finish, exit) → completion screen.
- **Contract:** `SharedWorkoutSession` / `WorkoutParticipant` in `api/campus/types.ts`, the service in `api/sharedWorkout.ts` and state in `hooks/useSharedWorkout.ts`.
  - The countdown uses the server's `starts_at` and `server_time`, so both phones start together.
  - Your reps are counted on your phone (tap each rep, the same as solo) and reported, throttled to one report every 0.5 s. Your partner's reps only ever come from the backend (`workout.reps.updated` on the realtime socket, or a 2 s poll without one).
- **Edge states covered:** partner leaves (before or during), you leave, invite expired, session full, not found, already finished, reconnecting, and connection lost.
- **Not built (backend):** the routes listed at the top of `api/sharedWorkout.ts`. Until they exist (capability `sharedWorkout` in `api/availability.ts`) every call rejects with `EndpointUnavailableError`, and every build shows "Shared workouts aren't live yet". Even when opted in, it only calls a **live** campus API. There is no simulated partner, sync or realtime, and the dev mock doesn't fake one.
- **Design preview:** `/workout/preview` (dev builds only) renders every state from static props for design review. It is clearly labelled and is not a session.

## Map engine

The campus map is Squirrel Social's own renderer: react-native-svg with a pan/zoom transform. It uses no Mapbox, no API key and no tile server. It draws both themes from `mapColors`. MapLibre isn't used today; switching the engine is a separate decision (it needs a development build and a tile source).

## Campus loop features: shared zones, heat, walks, dates, ratings, photos, ambassadors

Everything below is frontend. The backend work belongs to Dev A and Dev B, and none of it is claimed as done here.

- Screens import feature adapters in `api/campus/`: `discovery.ts`, `community.ts` and `media.ts`. They never call `fetch` directly.
- **Availability is per endpoint, not per service** (`api/availability.ts`, wired in `api/campus/index.ts`). The seven campus endpoints with no backend yet are gated in *every* mode (live, dev mock, off): shared zones, heatmap, Squirrel Dates, media, meetup rating, ambassador, and `profile_details` on `PATCH /v1/me`. A gated call rejects with `EndpointUnavailableError` (`code: <capability>_unavailable`). All other campus calls go straight through, so one missing endpoint never fails another.
- **Four states, kept distinct:** data, empty (`[]` — "nothing yet"), **unavailable** ("<Feature> · Not live yet", layout kept, only the dependent action disabled, no retry) and **error** (401/403/400/422/5xx/offline — shown as errors with retry or sign-in). `featureUnavailable()` is true only for `EndpointUnavailableError`, campus off, 404 `no_route`/no code, 501, or 503 `*_unavailable`.
- **No fake success anywhere:** the dev mock no longer implements these seven — no invented heat cells, date suggestions, uploads, ratings, ambassador forms, stored profile details or related notifications.
- **When a backend ships:** set it to `true` in `BUILT` in `api/availability.ts`, or opt it in without a code change with `EXPO_PUBLIC_LIVE_ENDPOINTS=heatmap,ambassador` (comma-separated capability names: `sharedZones, heatmap, dateSuggestions, media, meetupRating, ambassador, profileDetails, sharedWorkout`). Tests: `src/api/availability.test.mjs` (`npm test`).

| Feature | Where | API (status) |
|---|---|---|
| **Shared Zones** | Profile → People & places → Shared zones (`/shared`), someone's profile → shared-zones row (`/shared/[id]`), notifications | `GET /v1/users/{id}/context` (existing overlap API, Dev B; optional `activity_count` per zone), `GET /v1/me/shared-zones` (**expected, Dev B**) |
| **Activity Heatmap** | Map → 🔥 toggle; window 1h / 24h / 7d, legend in words, privacy line | `GET /v1/map/heatmap?window=` → aggregated cells `{center, radius_m, intensity, level}` (**expected, Dev B**). The app only draws them |
| **Study-Break Walk** | Home (leads "Happening on campus"), Events (featured on Upcoming), event page (JOIN WALK / YOU'RE IN) | Existing Events API. Optional fields `template: 'study_break_walk'`, `duration_min`, `meeting_point` (**expected, Dev A**) |
| **Squirrel Dates** | Social tab section, someone's profile (only when there's a suggestion) | `GET /v1/dates/suggestions[?user_id=]`, `POST …/{id}/dismiss`, `POST …/{id}/invite` (**expected, Dev B**) |
| **Post-meetup rating** | Meetup page, after it ends; notification reminder | `GET /v1/meetups/{id}/rating` (eligibility, rateable people excluding you, optional dimensions, trust score), `POST /v1/meetups/{id}/ratings` (**expected, Dev A**) |
| **Photo upload** | New Post, Meetup page (`<PhotoUpload purpose=…>`) | Social service's presigned flow: `POST /v1/media/uploads` → PUT → `POST /v1/media/{id}/complete`, plus `GET /v1/media/{id}` with `moderation` (**expected, Dev A**) |
| **Ambassador** | Profile → More → Become an ambassador (`/ambassador`) | `GET /v1/ambassador/application` (open flag, fields, existing application), `POST` answers (**expected, Dev A**) |

**Rules the UI keeps:**
- Shared zones and heat are zone-level or aggregated only, and the copy says so.
- A photo isn't shown on a post until the backend reports `status: ready` and `moderation: approved`. Photos are resized on the device to ≤ 1600 px JPEG, with a 480 px preview.
- You can't rate yourself, and ratings are private. A trust score appears only if the API returns one.
- The ambassador form renders only the fields the backend sends, and the status replaces the form once you've applied.
- Squirrel Dates are optional and dismissible ("Maybe later"). The copy makes no romantic assumptions.

**What each one shows until its backend ships:**

| Endpoint | UI while unavailable |
|---|---|
| Shared zones (`GET /v1/me/shared-zones`) | `/shared` keeps its header; the list is "Shared zones · Not live yet". The per-person overlap (`/v1/users/{id}/context`) is live and unaffected. |
| Heatmap | The Heat panel opens and says "Heatmap · Not live yet"; the 1h/24h/7d picker is disabled. The map, players and zones keep working. |
| Squirrel Dates | The Social section stays in place with "Squirrel Dates · Not live yet"; no Invite/Maybe later actions. The per-profile card stays hidden. |
| Media | The photo tile reads "Photo uploads · Not live yet" and can't be tapped; posting without a photo still works. |
| Meetup rating | The meetup page works (check-in etc.); the rating block reads "Meetup ratings · Not live yet". |
| Ambassador | Profile row detail reads "Not live yet"; `/ambassador` keeps its title and shows the Not live yet card instead of the form. |
| Profile details | See "Profile building" above. |

**Dev-mock switch:** `EXPO_PUBLIC_MOCK_FAIL_RATE=1` exercises error states on the live-able endpoints.

**Runs:**
- `logic/track.ts` is the verified `saheb` version with the GPS noise gate, byte for byte. A phone left stationary for about 2 minutes stays at 0.00 m. The tests are in `logic/track.test.mjs`: `node --experimental-strip-types --test src/logic/track.test.mjs`.
- The demo route starts at `DEMO_START = 0` (0.00 km, 0:00) and is offered only where GPS can't exist (the web preview).
- Denied location shows **Location required**, "Turn on location permission to track your run." and **Open settings**. Approximate location is blocked too.
- A real run never starts without precise permission.
- Leaving mid-run (close, back gesture, hardware back) asks before discarding.

## Look & feel: a cinematic campus world

The goal is a GTA-inspired campus world, not a GTA clone: no GTA assets, logos, characters or layouts. Someone opening the app should feel they've entered their campus, not opened another fitness app.


- **Colours:** from the Squirrel Social website (www.squirrelsocial.in):
  - **Canvas:** near-black `#060606`, with graphite panels (`#111113` / `#17171A`) and `#27272B` lines.
  - **Neon is a signal, not a surface.** Large areas stay dark; selected tabs and filters are a raised dark surface with an accent underline or outline, not a lime block.
  - **Lime `#D7FF1F`:** primary action, progress, ownership and confirmation (claimed zones, FRIENDS).
  - **Pink `#FF2D9B`:** social, interaction and challenge (POKE, POKE BACK, challenges).
  - **Purple `#A855F7`:** game systems and secondary states (level chips).
  - **Orange / sunset:** atmosphere only (skies and street light in the art).
  - **Yellow `#FFD21F`:** coins and defend.
  - **Text:** muted text is `#A9A9AE`.
- **Type (GTA VI style):**
  - **Anton:** heavy condensed headlines and big numbers, slanted −6° like GTA title cards.
  - **Barlow Condensed:** labels, buttons and italic callouts.
  - **Inter:** body text.
  - GTA VI's own typeface is proprietary; these are the closest free Google Fonts.
- **Art:** the illustrations use the website palette (neon lime and pink city).
  - `art/CampusScene.tsx` is the campus at dusk: hostel blocks with lit windows, the lecture hall, a floodlit sports ground and a lamp-lit path.
  - It's the title-screen backdrop and the Home "your world" card that opens the Map.
- **The squirrel is scarce on purpose.** It appears on the title screen, onboarding, level-ups, missions, run results, meetup check-in, locked features and empty states. It doesn't appear on everyday surfaces such as Home, the Create sheet or your profile header.
- **First impression:** the title screen reads SQUIRREL SOCIAL → YOUR CAMPUS. YOUR GAME. → the campus with the squirrel → ENTER IISER KOLKATA / EXPLORE DEMO. One live line ("23 moving right now") shows the world is active; it's hidden when the backend isn't reachable.
- **Game feel, kept subtle:**
  - Map markers spring in the first time they appear.
  - A claim, steal or defend confirmed by the backend shows a short "ZONE CLAIMED" stamp that clears itself (`components/game/CaptureMoment.tsx`).
  - Poke has a ripple and haptics; friendship has its celebration.
  - Claiming mission rewards opens the reward screen.

All UI tokens live in `src/theme.ts`; illustration colours live in `src/art/palette.ts`.

## Backend integration (Run Module)

This follows the *Frontend ↔ Backend Compatibility Assessment*.

| Area | State in the app |
|---|---|
| **Install** | `package.json` pins Expo SDK 57 / expo-router 57; the stray `"undefined"` dependency is gone |
| **Auth** | `src/auth/AuthProvider.tsx`: sign-in screen, token in SecureStore, `Authorization: Bearer` on every call. Needs an account service (`EXPO_PUBLIC_AUTH_URL`) — none exists yet. Until then: demo mode, or paste a developer token |
| **API layer** | `src/api/`, matched to the verified Run Module contract: `POST /v1/runs` → `{run_id}`; points in batches of 500 with `seq` (index in the full array), `lng`, `recorded_at`, required `accuracy_m`, and a seq-range `idempotency_key`; `/finish` is async, so the app polls `GET /v1/runs/:id` with backoff until `finalized` / `flagged` / `rejected`. XP comes from `GET /v1/users/me/xp`; the leaderboard uses `scope=global&metric=area&window=…` with `me` + `next_cursor`. 429s are retried after `Retry-After`. Your own leaderboard row is matched by the token's `sub` (`page.me` has no `user_id`). Verification polls for up to 5 min, with a "Don't wait" button after 15 s. Still marked `ASSUMPTION` in `endpoints.ts`: the create request body and leaderboard score units (m²) |
| **Runs** | Real GPS via `expo-location` (accuracy/jump filtering, auto-pause). Signed in, the run uploads and the **server's** distance, status and territory are shown; XP earned is the before/after difference from `/users/me/xp`. Without GPS (web, or permission denied), a clearly labelled demo simulation runs |
| **XP** | Local estimate uses the backend's rules (50 + 10/km + 25 territory, 150/day run cap). Signed in, the server total replaces it. Levels are derived client-side (2,000 XP each) |
| **Anti-cheat** | Run summary shows *accepted / flagged / rejected* (server verdict when live, local plausibility check otherwise) |
| **Territory** | New `/territory` screen (zones, control %, rivals, contested, 14-day decay) and area-based leaderboard (`/leaderboard`). Demo data until the territory endpoints are wired |
| **Challenges** | `/challenges` screen (daily, head-to-head, group, special), auto-resolving with no claim. Backed by the progress-service (below); demo data otherwise. Missions stay a separate frontend feature (company decision, §4.3) |
| **Still frontend-only** | Coins, cosmetics, social feed, crews/events, badges. They need backend models (§5) |

To point the app at a backend, copy `.env.example` to `.env`, then set `EXPO_PUBLIC_API_URL` (and `EXPO_PUBLIC_AUTH_URL` when the account service exists).

## Backend integration (progress-service)

`../progress-service` owns XP, levels, daily goals, streaks, challenges and XP leaderboards. Set `EXPO_PUBLIC_PROGRESS_API_URL` and sign in; it authenticates the same bearer token, and a token alone is enough to go live when only this service is configured. With it unset, or in demo mode, the screens show the demo data exactly as before.

| Area | Live behaviour |
|---|---|
| **API layer** | `src/api/progress.ts` holds the typed contract (exact response shapes) and calls go through the shared `api()` client with `base: PROGRESS_API_URL` |
| **Your Progress** (`/progress`) | Today's XP, the goal ring, goals done, streak and level come from `/v1/progress`. Week-over-week comes from `/v1/progress/weekly`, and the Day/Month/Year charts and heatmap from `/v1/progress/history?days=366` (`src/logic/progressStats.ts`). Campus rank comes from `/v1/leaderboards/campus`. It has loading, error (retry) and expired-session (sign in) states. The layout is unchanged |
| **Challenges** (`/challenges`) | `/v1/challenges` maps onto the existing cards. A **Special** tab appears when there are special challenges. **Join**, **Leave**/**Forfeit**, and **Accept duel**/**Decline** buttons call the server. Results show as Completed, Won, Tie, Lost, Ended, Cancelled or Not eligible. Server error codes become toasts. There are loading, empty-per-tab, error and unauthorized states |
| **Workouts** | Finishing a form-coach exercise queues a `WORKOUT_COMPLETED` event (key `exercise:<startedAt>:<item>`), flushes it, then re-reads XP from `/v1/xp`. The server decides the XP; the local figure is only the completion-screen estimate |
| **Offline** | Queued events are stored one per key (SecureStore, or localStorage on web). The queue flushes on sign-in, on app foreground and after each workout. Replays are recognised as duplicates, rejected events are dropped, and network errors, 5xx and 401 keep the queue |
| **XP source** | When configured, AppState syncs XP from `/v1/xp` instead of the Run Module's `/v1/users/me/xp` |
| **Not yet sourced** | Steps: the app has no pedometer yet, so `STEP_COUNT` is never sent yet and step goals, step challenges and step duels stay at 0 until a step source (e.g. expo-sensors Pedometer or Health Connect/HealthKit) posts it. The Campus leaderboard screen is still the Run Module's territory board |

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
  data/                Typed demo data: cities, users, community (crews/events/places), missions, posts, shop, rewards, stats
  state/AppState.tsx   App state: identity, city, XP/level, coins, missions, shop, follows, likes, posts, toasts
  types.ts             Shared domain types (AvatarLook, SceneKind, ProductKind…)
  theme.ts             Colour, gradient, font and radius tokens
assets/                App icon, splash, and PNG exports of the illustration set (see assets/README.md)
```

**The city is data, not code.** `data/cities.ts` defines Pune, Mumbai, Bangalore, Delhi, Hyderabad, London and New York. Crews, events and map places are generated from each city's venues (`crewsForCity`, `eventsForCity`, `placesForCity`), and the Nearby feed filters by the active city. To add a city, add one entry. Pune is only the default demo city.

**Users aren't hard-coded.** `CURRENT_USER_ID` picks the signed-in user, every profile is rendered by `ProfileView` from a `User`, and `/user/[id]` shows anyone else's profile.

**Backend-ready.** Screens read everything through `useApp()`. Replacing the demo data with API calls means swapping the seed arrays and generator functions in `data/`, and backing the `AppState` actions with requests. The component tree doesn't need to change.

**Art is code.** Illustrations are React components, so they're crisp at any size, themeable, animatable and tiny to ship. PNG exports in `assets/` are for store listings, marketing and a future backend.

## Notes

- Without GPS (web, or permission denied) run distance is simulated from pace.
- The Explore map is illustrative. A real tile map (`react-native-maps`) would need a development build.
- State is in memory and resets on reload.
