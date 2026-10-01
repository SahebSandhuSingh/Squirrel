# Squirrel Social — mobile app

A social-fitness app with a neon-city feel. Track runs and form-coached workouts, hit your daily goals, earn XP, level up, claim campus territory, poke people into friends and join crews.

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
npx expo start --web    # browser preview at phone size
```

Everything ships in Expo Go (`react-native-svg`, `expo-linear-gradient`, `expo-haptics`, `expo-font`, Google Fonts), so no custom dev build is needed. It uses no paid APIs.

## Real data only — no sample content, no simulation

Everything the app shows about you or anyone else comes from a backend. There is **no** sample/seed content (no demo people, posts, crews, missions, coins, XP or stats), **no** mock backend and **no** simulated location or sign-in code.

| Backend | Set | Screens it feeds |
|---|---|---|
| Run Module | `EXPO_PUBLIC_API_URL` | Runs (upload, verification, server XP), run leaderboard |
| progress-service | `EXPO_PUBLIC_PROGRESS_API_URL` | Home's today (steps, active minutes, calories, streak) and Today's goals, Your Progress, Challenges, XP / level |
| Exercise Mechanics | `EXPO_PUBLIC_EXERCISE_API_URL` | Form coach: catalog, coach profile, sessions, reports |
| Campus API | `EXPO_PUBLIC_CAMPUS_API_URL` | Profile, map, people, pokes, zones, crews, meetups, invites, leaderboards, notifications |

Without a backend (or a session), a screen shows one of three honest states, never invented data:
- **Not connected** — the backend exists but this build isn't configured for it, or it needs you signed in (with a Sign in button). `NotConnected` in `components/campus/States.tsx`.
- **Not live yet** — the endpoint isn't built (see `api/availability.ts`), e.g. posts & stories, the ambassador waitlist, heatmap.
- **Error** — a real failure (offline, 401, 5xx) with retry or sign-in.

You can **look around first** without an account (welcome → *Look around first*); every screen then shows those states. The one simulation kept on purpose is the Run Module's **demo route** for devices with no GPS (the web preview): it's always labelled "Demo route · simulated, not a real activity" and is never uploaded (`logic/demoRoute.ts`, geometry in `logic/demoLoop.ts`).

Removed with the sample content: the shop, coins, cosmetics unlocks, rewards road, posts feed, highlights, city picker and the tap-to-log missions (replaced by the server's daily goals).

## Screens

| Route | Screen |
|---|---|
| `/sign-in` | **Join / sign in with a .ac.in email** (one-time code, needs the account service), or look around first; password and developer token under “Other options”. New accounts go to onboarding |
| `/onboarding` | Wingman intro → **What are you looking for? Date / Friends / Crew** → hostel → Open to Meet → saved to the profile (`PATCH /v1/me`) |
| `/territory` | Redirects to the campus map |
| `/zone/[id]` | One zone: map, owner, territory status, stats, history, and **Claim / Steal / Defend** only where the backend allows |
| `/challenges` | Daily, head-to-head and group challenges (auto-resolve) |
| `/exercise/select` | **Start Exercise** picker (opened from Home). Lists the Exercise backend's catalog (`GET /api/exercises`) with plan, time and estimated calories; Start creates a real session (`POST /api/users/{id}/sessions`) |
| `/exercise/train/[key]` | Active exercise: the backend plan (sets × reps/seconds, rest). Tap each rep, or a real countdown for timed sets; camera mirror; pause/finish. Completion is reported to the progress-service (`WORKOUT_COMPLETED`), which decides XP and today's figures |
| `/exercise`, `/exercise/profile`, `/exercise/plan/[key]`, `/exercise/session/[id]` | Form Coach hub, coach profile, custom plan, session report (Exercise backend). The coach profile's gender uses the backend's closed list `female · male · non_binary · other · undisclosed` (`EXERCISE_GENDERS` in `api/exercise.ts`; "Prefer not to say" is `undisclosed`) — anything else, e.g. `unspecified`, is a 422 `literal_error` |
| `/partner-hunt/*` | **Partner Hunt** (locked · Coming soon): "Find your workout buddy". Card on the Social tab; every route (index, preferences, matching, buddy/[id], connect/[id]) shows the locked preview while `LOCKED.partnerHunt` is on |
| `/leaderboard` | **Leaderboards**: Top 10 squirrels (XP, zones held, distance) and **Hostel vs Hostel** (score, territories, activity), daily / weekly / all-time |
| `/welcome` | **Live at IISER Kolkata**: IISER-only messaging, `.ac.in` CTA, live user / zone / crew counters (from the backend), campus map visual, Founding Squirrel |
| `/avatar` | **Make It You**: your own look — body, hair, outfit, shoes, accessories and emotes (no shop or unlocks) |
| `/home` *(tab)* | Top bar (avatar, server level/XP, theme, notifications), greeting, **today from the progress-service** (steps, active, kcal, streak), Start Exercise, Start Run, **today's goals**, **your territory**, **Active now**, Friend Mode / Challenges shortcuts, today's top squirrels, campus events |
| `/explore` *(Map tab)* | **Squirrel Social Map**: full-screen game world (terrain, roads, buildings, POIs), territories by status (neutral / controlled / contested / under attack), your avatar marker, nearby Squirrels with clustering, player / territory / POI sheets, nearby list with search, Poke from any card |
| **＋** *(tab)* | Create menu: start run, start exercise, post (not live yet); log water, log a meal and find an event are locked (coming soon) |
| `/social` *(tab)* | Partner Hunt (locked), Friend Mode / Active now, **Squirrels near you** (with Poke), Squirrel Dates, crews; the posts & stories feed is *Not live yet* |
| `/profile` *(tab)* | **Campus profile**: photo, name, bio, connection mode, Founding Squirrel, Open to Meet toggle, activity stats (distance, month, zones, defended, stolen, crews, events, streak), territory, crews, badges, activity history, verification. Without the campus backend it says so and keeps your settings (theme, avatar, progress, coach, sign in/out) |
| `/edit-profile` | Name, bio, connection mode, hostel |
| `/run` | **Run / Walk**: pick activity, permission handling, live GPS route on the campus map, distance/duration/pace, pause, finish or discard; summary with route, **zones interacted with / eligible**, and the backend-allowed claim action. Upload retry on network failure |
| `/missions` | **Today's goals** from the progress-service (counted by the server; nothing to log by hand), plus the locked meal & water goals |
| `/progress` | **Your Progress**, in four sections:<br>• **Today:** goal ring, today's XP, activities done, XP left, run XP, streak and a level bar.<br>• **Progress:** Day/Week/Month/Year with Steps/Active/Calories/Workouts, a tap-to-read bar chart and the streak calendar with active days.<br>• **Your performance:** change vs the previous period and campus rank.<br>• **Next:** the best next action (an open goal, or a run).<br>All from the progress-service; without it, *Not connected* / sign in. |
| `/crews`, `/crew/[id]`, `/crew/new` | Discover / my crews with search, crew profile (members, crew territory, upcoming events), join / leave, create (when the backend allows) |
| `/events`, `/event/[id]` | Upcoming / going; details with date, place, participants, type, territory-challenge info, RSVP / cancel RSVP |
| `/friends` | **Friend Mode**: activity-based suggestions, shared zones/crews, backend icebreakers, challenge invite |
| `/date` | **Date Mode** behind the backend safety gate; when open: toggle, activity-first profiles, suggested plans, icebreakers |
| `/active` | **Active now** + **Squirrels near you** (coarse proximity only) with the Open to Meet toggle |
| `/invites`, `/invite/new` | **Challenge invites**: incoming / sent, accept · decline · cancel; create (type, person or crew, zone, time, message) |
| `/meetups`, `/meetup/[id]` | Upcoming meetups; **check in**, attendees, optional safety-contact notification (shown as sent only when the API confirms) |
| `/badges` | Badges: unlocked, locked, progress |
| `/level-up` | Level-up reveal (after a run crosses a level on the server's XP): rays, mascot, your server level and XP bar |
| `/compose` | Post composer with your run's real numbers pre-filled — **Posts · Not live yet**, so Post is disabled and nothing is saved |
| `/user/[id]` | Anyone's campus profile: shared context, icebreakers, Challenge |
| `/shared`, `/shared/[id]` | **Shared zones**: everyone you share ground with; “You’ve both been here” with one person (zone-level only) |
| `/ambassador` | **Become a Squirrel ambassador**: backend-defined form, then application status |
| `/notifications` | **Pokes & friends** (Poke Back inline) and campus notifications from the backend; *Not live yet* without it |

## Not launched yet (locked)

`src/data/features.ts` holds the launch switches (`LOCKED`, `COMING_SOON`, `isLocked`). UI reads them through `components/Locked.tsx`: `useLocks()` (`locked`, `notify`, `guard`) and `<FeatureGate feature fallback>`. Lock-aware components (e.g. `EventCard`) handle their own locked state, so no screen can render an interactive locked card. While a flag is on, the feature stays visible as **Coming soon** but can't be used. Every entry point is blocked: buttons, routes and the `AppState` actions.
- `LOCKED.mealWater`: Log water / Log a meal (Create sheet) and the water and meal daily goals.
- `LOCKED.stories`: stories (with the posts feed, which is *Not live yet*).
- `LOCKED.partnerHunt`: the Social tab card and every `/partner-hunt` route (the layout renders the locked preview). The future flow and model (preferences by campus, interests, activities, availability and goals; buddy profile; connection status) are in `data/partnerHunt.ts`. There is no matching logic and no buddy data yet.
- `LOCKED.events` is **on** (not launching yet):
  - `/events` and `/event/[id]` render the Coming Soon screen, deep links included.
  - Home hides "Happening on campus" and its Study Break Walk card.
  - Event rows (Crew, Home, Events) and event notifications show the "Events are coming soon" toast.
  - `StudyBreakCard` renders nothing while locked, so JOIN WALK can't be pressed anywhere.
  - Meetups doesn't offer "Browse events". The Create sheet's "Find an event" was already gated.

Set a flag to `false` at launch.

**Campus, not city.** The campus (name, email domains, courses) comes from `GET /v1/config`; there's no city list.

## Campus social (IISER Kolkata launch)

The IISER-first social layer: **Move → Discover people → Claim territory → Join crews → Meet IRL**.

**Where the data comes from** (`src/api/campus/`):

| Source | When | What the screens show |
|---|---|---|
| `live` — `http.ts` | `EXPO_PUBLIC_CAMPUS_API_URL` (or `EXPO_PUBLIC_API_URL`) is set | The backend's data, with the shared bearer token |
| `off` | No campus URL (any build) | “Not live yet” states — never invented numbers. There is no mock backend |

Screens only import `campusApi` (typed contract in `types.ts`); no component calls `fetch`. If the backend's shapes differ, adapt `http.ts`. Routes the app calls:

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

**Sign-in.** `.ac.in` emails get a one-time code (`POST {AUTH_URL}/email/start`, `/email/verify` → `{ access_token }` — an assumption until the account service exists). There is no simulated code.

**Date Mode** unlocks only when `GET /v1/config` reports `features.date_mode.available`; the requirements list comes from the backend.

## Map & Poke → Poke Back → Friends

The Map is the main way to discover people: see who's around → tap them → **POKE 👋**. When they poke back you're **FRIENDS 🎉**. The backend decides everything that matters: who appears on the map and roughly where, whether a poke is allowed, reciprocity, friendship and territory ownership. The app only displays it.

**Routes** (in `http.ts`):

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

Without location permission (or on the web) there's no position at all: the app never invents one.

## Light & dark themes

- **Two complete palettes** live in `src/theme.ts`:
  - **Dark** is the original night-campus identity.
  - **Light** is its daytime twin: warm paper canvas, white cards, near-black ink, and deeper lime and pink for text and icons so they stay readable. Filled CTAs keep the neon lime (`primaryFill`) with an ink outline.
- **Theme-aware tokens:** `panel`, `backdrop` and `mapColors` (the campus map's base layer), plus `alpha(color, a)` for tints and `statusBarStyle`.
- **Artwork stays as it is** (scenes, the title screen, the camera and story views), and so does text drawn over it (`onImage`).
- **Switching**, two ways, one switch (`components/ThemeToggle.tsx`):
  - the **sun/moon icon** in the Home, Map, Social and Profile headers (`<ThemeIconButton>`): Dark shows a gold sun (tap for Light), Light shows a violet moon (tap for Dark); the glyph turns and cross-fades before the switch;
  - Profile → More → **Appearance** (Dark / Light).
  - The choice is saved on the device: SecureStore on phones (read synchronously at start-up), localStorage on web.
  - The app then reloads once (`reloadAppAsync`, or `location.reload` on web), so every screen, sheet and module-level style is rebuilt with the new palette. On web you return to the screen you tapped from, with no second launch splash; on phones the app restarts at Home.
- **No hardcoded colours:** every colour in `app/` and `components/` goes through tokens, except imagery-bound overlays, which are dark on purpose.

## Launch splash

- `components/LaunchSplash.tsx`, overlaid on the root layout (not a route: it can't be navigated back to, and deep links mount underneath it).
- Logo (the official logo, framed as an app-icon tile) → **SQUIRREL SOCIAL** → "Backed by Split Labs VC", then a fade into whatever start-up picked.
- It lifts only when **both** at least 3 s (`SPLASH_MIN_MS`) have passed since launch **and** the app is ready (fonts loaded, saved session restored). Reduce Motion skips the animation, not the content.
- Once per launch, themed (Dark / Light), and skipped after a theme-switch reload.

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
- **Not built (backend):** the routes listed at the top of `api/sharedWorkout.ts`. Until they exist (capability `sharedWorkout` in `api/availability.ts`) every call rejects with `EndpointUnavailableError`, and every build shows "Shared workouts aren't live yet". Even when opted in, it only calls a **live** campus API. There is no simulated partner, sync or realtime.

## Map engine

The campus map is Squirrel Social's own renderer: react-native-svg with a pan/zoom transform. It uses no Mapbox, no API key and no tile server. It draws both themes from `mapColors`. MapLibre isn't used today; switching the engine is a separate decision (it needs a development build and a tile source).

## Campus loop features: shared zones, heat, walks, dates, ratings, photos, ambassadors

Everything below is frontend. The backend work belongs to Dev A and Dev B, and none of it is claimed as done here.

- Screens import feature adapters in `api/campus/`: `discovery.ts`, `community.ts` and `media.ts`. They never call `fetch` directly.
- **Availability is per endpoint, not per service** (`api/availability.ts`, wired in `api/campus/index.ts`). The seven campus endpoints with no backend yet are gated in *every* mode (live and off): shared zones, heatmap, Squirrel Dates, media, meetup rating, ambassador, and `profile_details` on `PATCH /v1/me`. A gated call rejects with `EndpointUnavailableError` (`code: <capability>_unavailable`). All other campus calls go straight through, so one missing endpoint never fails another.
- **Four states, kept distinct:** data, empty (`[]` — "nothing yet"), **unavailable** ("<Feature> · Not live yet", layout kept, only the dependent action disabled, no retry) and **error** (401/403/400/422/5xx/offline — shown as errors with retry or sign-in). `featureUnavailable()` is true only for `EndpointUnavailableError`, campus off, 404 `no_route`/no code, 501, or 503 `*_unavailable`.
- **No fake success anywhere:** no invented heat cells, date suggestions, uploads, ratings, ambassador forms, stored profile details or related notifications.
- **When a backend ships:** set it to `true` in `BUILT` in `api/availability.ts`, or opt it in without a code change with `EXPO_PUBLIC_LIVE_ENDPOINTS=heatmap,ambassador` (comma-separated capability names: `sharedZones, heatmap, dateSuggestions, media, meetupRating, ambassador, ambassadorWaitlist, profileDetails, sharedWorkout`). Tests: `src/api/availability.test.mjs` (`npm test`).

| Feature | Where | API (status) |
|---|---|---|
| **Shared Zones** | Profile → People & places → Shared zones (`/shared`), someone's profile → shared-zones row (`/shared/[id]`), notifications | `GET /v1/users/{id}/context` (existing overlap API, Dev B; optional `activity_count` per zone), `GET /v1/me/shared-zones` (**expected, Dev B**) |
| **Activity Heatmap** | Map → 🔥 toggle; window 1h / 24h / 7d, legend in words, privacy line | `GET /v1/map/heatmap?window=` → aggregated cells `{center, radius_m, intensity, level}` (**expected, Dev B**). The app only draws them |
| **Study-Break Walk** | Home (leads "Happening on campus"), Events (featured on Upcoming), event page (JOIN WALK / YOU'RE IN) | Existing Events API. Optional fields `template: 'study_break_walk'`, `duration_min`, `meeting_point` (**expected, Dev A**) |
| **Squirrel Dates** | Social tab section, someone's profile (only when there's a suggestion) | `GET /v1/dates/suggestions[?user_id=]`, `POST …/{id}/dismiss`, `POST …/{id}/invite` (**expected, Dev B**) |
| **Post-meetup rating** | Meetup page, after it ends; notification reminder | `GET /v1/meetups/{id}/rating` (eligibility, rateable people excluding you, optional dimensions, trust score), `POST /v1/meetups/{id}/ratings` (**expected, Dev A**) |
| **Photo upload** | New Post, Meetup page (`<PhotoUpload purpose=…>`) | Social service's presigned flow: `POST /v1/media/uploads` → PUT → `POST /v1/media/{id}/complete`, plus `GET /v1/media/{id}` with `moderation` (**expected, Dev A**) |
| **Campus Ambassador waitlist** | Profile → More → Campus Ambassador (`/ambassador`) | `POST /v1/ambassador/waitlist` (`api/campus/ambassadorWaitlist.ts`): full name, personal + college email, phone (E.164), college, `campus_id`, course, year of study, optional motivation and Instagram. 201 → on the list, 409 → already on the list (**expected**). The reviewed application (`GET/POST /v1/ambassador/application`) stays in the API layer for later |

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
| Media | The photo tile reads "Photo uploads · Not live yet" and can't be tapped. The rest of the screen (e.g. meetup check-in) keeps working. |
| Meetup rating | The meetup page works (check-in etc.); the rating block reads "Meetup ratings · Not live yet". |
| Ambassador waitlist | Profile row reads "Waitlist · Not live yet". `/ambassador` shows the full form (pre-filled from your name, sign-in email and campus; inline validation works) with an "Ambassador waitlist · Not live yet" card, and **Join** is disabled: nothing is sent or saved. Opted in but the server answers 404/405/501 → the same state, answers kept. Real errors (offline, 401 → Sign in, 422, 5xx) show as errors with Try again. |
| Profile details | See "Profile building" above. |

**Runs:**
- `logic/track.ts` is the verified `saheb` version with the GPS noise gate, byte for byte. A phone left stationary for about 2 minutes stays at 0.00 m. The tests are in `logic/track.test.mjs`: `node --experimental-strip-types --test src/logic/track.test.mjs`.
- The demo route starts at `DEMO_START = 0` (0.00 km, 0:00) and is offered only where GPS can't exist (the web preview). It's the one simulation kept on purpose, always labelled and never uploaded.
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
  - **Yellow `#FFD21F`:** defend and XP.
  - **Text:** muted text is `#A9A9AE`.
- **Type (GTA VI style):**
  - **Anton:** heavy condensed headlines and big numbers, slanted −6° like GTA title cards.
  - **Barlow Condensed:** labels, buttons and italic callouts.
  - **Inter:** body text.
  - GTA VI's own typeface is proprietary; these are the closest free Google Fonts.
- **Art:** the illustrations use the website palette (neon lime and pink city).
  - `art/CampusScene.tsx` is the campus at dusk: hostel blocks with lit windows, the lecture hall, a floodlit sports ground and a lamp-lit path.
  - It's the title-screen backdrop and the Home "your world" card that opens the Map.
- **The squirrel is scarce on purpose.** It appears on the title screen, onboarding, level-ups, today's goals, run results, meetup check-in, locked features and empty states. It doesn't appear on everyday surfaces such as Home, the Create sheet or your profile header.
- **First impression:** the title screen reads SQUIRREL SOCIAL → YOUR CAMPUS. YOUR GAME. → the campus with the squirrel → ENTER IISER KOLKATA / LOOK AROUND FIRST. One live line ("N moving right now", from `GET /v1/campus/stats`) shows the world is active; it's hidden when the backend isn't reachable.
- **Game feel, kept subtle:**
  - Map markers spring in the first time they appear.
  - A claim, steal or defend confirmed by the backend shows a short "ZONE CLAIMED" stamp that clears itself (`components/game/CaptureMoment.tsx`).
  - Poke has a ripple and haptics; friendship has its celebration.

All UI tokens live in `src/theme.ts`; illustration colours live in `src/art/palette.ts`.

## Backend integration (Run Module)

This follows the *Frontend ↔ Backend Compatibility Assessment*.

| Area | State in the app |
|---|---|
| **Install** | `package.json` pins Expo SDK 57 / expo-router 57; the stray `"undefined"` dependency is gone |
| **Auth** | `src/auth/AuthProvider.tsx`: sign-in screen, token in SecureStore, `Authorization: Bearer` on every call. Needs an account service (`EXPO_PUBLIC_AUTH_URL`) — none exists yet. Until then: paste a developer token, or look around signed out (no data) |
| **API layer** | `src/api/`, matched to the verified Run Module contract: `POST /v1/runs` → `{run_id}`; points in batches of 500 with `seq` (index in the full array), `lng`, `recorded_at`, required `accuracy_m`, and a seq-range `idempotency_key`; `/finish` is async, so the app polls `GET /v1/runs/:id` with backoff until `finalized` / `flagged` / `rejected`. XP comes from `GET /v1/users/me/xp`; the leaderboard uses `scope=global&metric=area&window=…` with `me` + `next_cursor`. 429s are retried after `Retry-After`. Your own leaderboard row is matched by the token's `sub` (`page.me` has no `user_id`). Verification polls for up to 5 min, with a "Don't wait" button after 15 s. Still marked `ASSUMPTION` in `endpoints.ts`: the create request body and leaderboard score units (m²) |
| **Runs** | Real GPS via `expo-location` (accuracy/jump filtering, auto-pause). Signed in, the run uploads and the **server's** distance, status and territory are shown; XP earned is the before/after difference from `/users/me/xp`. Without GPS (web, or permission denied), a clearly labelled demo simulation runs |
| **XP** | The run summary shows the backend's rules as an estimate for that run (50 + 10/km, 150/day cap). Your XP total and level only ever come from a server (progress-service, or the Run Module's `/users/me/xp`); until one answers they aren't shown |
| **Anti-cheat** | Run summary shows *accepted / flagged / rejected* (server verdict when live, local plausibility check otherwise) |
| **Territory** | The campus map's zones and territories (campus API); `/territory` redirects to the map |
| **Challenges** | `/challenges` screen (daily, head-to-head, group, special), auto-resolving with no claim. Backed by the progress-service (below); *Not connected* otherwise |
| **No backend yet (not shown)** | Coins/shop, cosmetics unlocks, the posts feed. They need backend models (§5) |

To point the app at a backend, copy `.env.example` to `.env`, then set `EXPO_PUBLIC_API_URL` (and `EXPO_PUBLIC_AUTH_URL` when the account service exists).

## Backend integration (progress-service)

`../progress-service` owns XP, levels, daily goals, streaks, challenges and XP leaderboards. Set `EXPO_PUBLIC_PROGRESS_API_URL` and sign in; it authenticates the same bearer token, and a token alone is enough to go live when only this service is configured. With it unset, or signed out, the screens show *Not connected* / sign in — never demo data.

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
    Product.tsx        Product art used by the avatar editor (hoodie, tee, shoes, bag, bottle, sunglasses…)
    Badge.tsx          12 achievement badges (plus locked state)
    Sticker.tsx        8 die-cut stickers
    Reward.tsx         Level-reward illustrations (outfit, badge, stickers, trail, coins, chest)
    CityMap.tsx        Stylised city map + animated run route
    palette.ts         Shared art palette so everything belongs to one visual universe
  components/          ui.tsx (primitives + motion), cards.tsx (scene art, daily goals, bars), Avatar, TopBar, TabBar, Sheet, Toast
  data/                App configuration only: feature locks, icons, the exercise catalog, avatar-editor options (no sample content)
  state/AppState.tsx   Client state: your look, server XP/level, the exercise in progress, toasts (no sample content)
  types.ts             Shared domain types (AvatarLook, SceneKind, ProductKind…)
  theme.ts             Colour, gradient, font and radius tokens
assets/                App icon, splash, and PNG exports of the illustration set (see assets/README.md)
```

**Users aren't hard-coded.** Your profile and anyone else's come from the campus API (`CampusProfileView`); people without a photo get a coloured initial, never someone else's face.

**Art is code.** Illustrations are React components, so they're crisp at any size, themeable, animatable and tiny to ship. PNG exports in `assets/` are for store listings, marketing and a future backend.

## Notes

- Without GPS (web, or permission denied) run distance is simulated from pace.
- The Explore map is illustrative. A real tile map (`react-native-maps`) would need a development build.
- Your avatar look is kept in memory and resets on reload; everything else lives on the backends.
