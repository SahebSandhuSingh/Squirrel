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
npm run check           # both
npx expo start --web    # browser preview at phone size
```

Everything the app imports is bundled in Expo Go (`react-native-svg`, `expo-linear-gradient`, `expo-haptics`, `expo-font`, `expo-location`, `expo-task-manager`, `react-native-webview`, `expo-file-system`, AsyncStorage, Google Fonts), so day-to-day development needs no custom dev build. It uses no paid APIs, and all social data is local demo data.

**One exception — background run tracking.** Keeping GPS alive with the screen off uses `startLocationUpdatesAsync` + a TaskManager task, which needs the config in `app.json` (`UIBackgroundModes: location`, Android foreground service) baked into the native app. That works in a development build (`npx expo run:android|ios` or `eas build --profile development`) and in store builds; in Expo Go the app falls back to foreground-only tracking and the GPS pill says *keep app open*. Test the background path on a real phone before relying on it.

## Screens

| Route | Screen |
|---|---|
| `/sign-in` | Sign in (account service), demo mode, or developer token |
| `/territory` | Own your block: district map, zone control, decay |
| `/challenges` | Daily, head-to-head and group challenges (auto-resolve) |
| `/leaderboard` | City ranking by territory area: daily, weekly, all-time |
| `/welcome` | Landing: cinematic sunset city, avatar + squirrel mascot, Get Started |
| `/avatar` | **Make It You**: body, hair, outfit, shoes, accessories, gear, emotes and pet mascot |
| `/home` *(tab)* | Top bar (avatar, level, XP, coins), greeting, activity rings, Start Run, missions, events carousel, city leaderboard, crew activity |
| `/explore` *(tab)* | Stylised neon city map: pulsing markers, animated route, filters, search (places + people), place carousel |
| **＋** *(tab)* | Create menu: start run, post, log water/workout/meal, find event |
| `/social` *(tab)* | Stories, For You / Following / Nearby feed, suggested people, crews teaser |
| `/profile` *(tab)* | Cover, level card, highlights, badges, equipped cosmetics, posts/activity/saved grid |
| `/run` | Live run: 3-2-1 countdown, route animation, live stats, music/camera, hold-to-finish, summary |
| `/missions` | Daily / Weekly / Special missions with completion and claim states |
| `/progress` | Your Progress: Day/Week/Month/Year charts, stat cards, streak heatmap, recent activity |
| `/crews`, `/crew/[id]` | Find Your Crew (Nearby/Online/Campus/Interests), crew detail with members, events and posts |
| `/events`, `/event/[id]` | Events (Nearby/Online/My Events) and event detail with attendees and meeting point |
| `/level-up` | RPG level-up reveal: rays, mascot, XP bar, staggered reward cards, next unlock |
| `/rewards` | Level road, achievement badges, sticker collection |
| `/shop`, `/item/[id]` | Shop (20+ items, rarities, level locks) and item sheet (buy / equip) |
| `/compose` | Post composer: backdrop, sticker and activity (pre-filled after a run) |
| `/post/[id]` | Post with comments |
| `/highlight/[id]` | Full-screen story viewer for profile highlights |
| `/user/[id]` | Any user's profile, with Follow |
| `/city` | City picker |
| `/notifications` | Activity notifications |

## Look & feel — "Voltage" (white + electric blue)

A bright, clean **light** theme for a Gen-Z / college crowd, with GTA-style type:
- **Canvas:** white `#FFFFFF`, with soft blue-grey cards (`#F4F6FB` / `#E9EDF7`, border `#E1E6F0`) and near-black ink text `#0B0F1A`.
- **Colours:** **electric blue `#2F5BFF`** for every action and everything that's "yours" (your territory, your rank, your route); ink as the second voice; amber `#FFB020` for coins and rewards; pink `#FF4D8D` for rivals.
- **Art:** the city illustrations stay dark (a blue-hour city: electric-blue neon, indigo skies, amber sun and windows). Anything drawn on top of artwork uses `colors.onImage` (white) and dark `imageChip` chips, so it stays readable.
- **Type:** Anton for headlines and big numbers (heavy, condensed, slanted −6° like GTA title cards). Barlow Condensed for labels, buttons and italic callouts; Inter for body text.
  - These are free Google Fonts lookalikes: GTA's own fonts are proprietary or commercial.
- **Brand:** the squirrel-with-dumbbell logo is the app icon (on electric blue), the splash and the favicon, and appears in the in-app header. The Welcome screen uses a text wordmark and the waving mascot.

All UI tokens live in `src/theme.ts`; illustration colours live in `src/art/palette.ts`.

## Backend integration (Run Module)

This follows the *Frontend ↔ Backend Compatibility Assessment*.

| Area | State in the app |
|---|---|
| **Install** | `package.json` pins Expo SDK 57 / expo-router 57 and every module the app imports (`npm run check` = typecheck + lint, both clean) |
| **Auth** | `src/auth/AuthProvider.tsx`: sign-in screen, token in SecureStore, `Authorization: Bearer` on every call. A 401 from any endpoint signs the user out and sends them to sign-in with a "session expired" note, instead of leaving the app in a live mode where every call fails. Needs an account service (`EXPO_PUBLIC_AUTH_URL`) — none exists yet. Until then: demo mode, or paste a developer token |
| **API layer** | `src/api/`, matched to the verified Run Module contract: `POST /v1/runs` → `{run_id}`; points in batches of 500 with `seq` (index in the full array), `lng`, `recorded_at`, required `accuracy_m`, and a seq-range `idempotency_key`; `/finish` is async, so the app polls `GET /v1/runs/:id` with backoff until `finalized` / `flagged` / `rejected`. XP comes from `GET /v1/users/me/xp`; the leaderboard uses `scope=global&metric=area&window=…` with `me` + `next_cursor`. 429s are retried after `Retry-After`; idempotent calls also retry on network errors / 5xx. **Run creation is retried only on 429** — a timeout may mean the server already created the run — and sends a client-generated `Idempotency-Key` header + `client_run_id` body field so the backend can de-duplicate once it supports either. Your own leaderboard row is matched by the token's `sub` (`page.me` has no `user_id`). Verification polls for up to 5 min, with a "Don't wait" button after 15 s. Still marked `ASSUMPTION` in `endpoints.ts`: the create request body (incl. `client_run_id`) and leaderboard score units (m²) |
| **Runs** | `src/logic/runTracker.ts` owns GPS, the clock and the track as a module-level session: background location via `expo-task-manager` where available (foreground `watchPositionAsync` otherwise), elapsed time from wall-clock timestamps (no drift when the JS timer is throttled), accuracy/jump filtering, auto-pause, and a snapshot every 10 fixes so a killed app can **resume** the run from Home. Signed in, the run uploads and the **server's** distance, status and territory are shown; XP earned is the before/after difference from `/users/me/xp`. If the upload fails, the run and its exact upload progress (created? points accepted? finished?) are saved in `src/logic/pendingRuns.ts`; **Retry** from the summary or the Home banner resumes at that step and never creates a second run, and XP is only awarded once the server has it. Without GPS (web, or permission denied), a clearly labelled demo simulation runs |
| **XP** | Local estimate uses the backend's rules (50 + 10/km + 25 territory, 150/day run cap). Signed in, the server total replaces it. Levels are derived client-side (2,000 XP each) |
| **Anti-cheat** | Run summary shows *accepted / flagged / rejected* (server verdict when live, local plausibility check otherwise) |
| **Territory** | New `/territory` screen (zones, control %, rivals, contested, 14-day decay) and area-based leaderboard (`/leaderboard`). Demo data until the territory endpoints are wired |
| **Challenges** | New `/challenges` screen (daily, head-to-head, group), auto-resolving with no claim. Missions stay as a separate frontend feature (company decision, §4.3) |
| **Still frontend-only** | Coins, cosmetics, social feed, crews/events, badges. They need backend models (§5). Note that a signed-in user still sees the demo profile, coins and level until a profile service exists; only the XP total comes from the server, so it snaps to the server's number once loaded |

To point the app at a backend, copy `.env.example` to `.env`, then set `EXPO_PUBLIC_API_URL` (and `EXPO_PUBLIC_AUTH_URL` when the account service exists).

## Architecture

```
src/
  app/                 Expo Router routes (every file is a screen)
    (tabs)/            Home · Explore · Social · Profile, plus the custom tab bar with a central Create button
  art/                 Original vector illustration library (react-native-svg)
    Mascot.tsx         Squirrel mascot: 9 poses (idle, run, celebrate, drink, lift, sit, cheer, sleep, wave) + accessories
    Character.tsx      Parametric human avatars (AvatarLook) in 6 poses, plus circular Portrait
    Scene.tsx          14 cinematic scenes (city sunset/night/dawn, run, yoga, gym, cafe, brunch, crew, hiit…)
    Product.tsx        20 shop items (hoodie, tee, shoes, bag, bottle, sunglasses, watch…)
    Badge.tsx          12 achievement badges (plus locked state)
    Sticker.tsx        8 die-cut stickers
    Reward.tsx         Level-reward illustrations (outfit, badge, stickers, trail, coins, chest)
    CityMap.tsx        Stylised city map + animated run route
    palette.ts         Shared art palette so everything belongs to one visual universe
  components/          ui.tsx (primitives + motion), cards.tsx, Avatar, TopBar, TabBar, ProfileView, Sheet, Toast
  data/                Typed demo data: cities, users, community (crews/events/places), missions, posts, shop, rewards, stats
  logic/               track.ts (GPS filtering), xp.ts (XP rules), runTracker.ts (run session + background GPS), pendingRuns.ts (failed uploads)
  state/AppState.tsx   App state: identity, city, XP/level, coins, missions, shop, follows, likes, posts, toasts — persisted to AsyncStorage
  types.ts             Shared domain types (AvatarLook, SceneKind, ProductKind…)
  theme.ts             Colour, gradient, font and radius tokens
assets/                App icon, splash, and PNG exports of the illustration set (see assets/README.md)
```

**The city is data, not code.** `data/cities.ts` defines Pune, Mumbai, Bangalore, Delhi, Hyderabad, London and New York. Crews, events and map places are generated from each city's venues (`crewsForCity`, `eventsForCity`, `placesForCity`), and the Nearby feed filters by the active city. To add a city, add one entry. Pune is only the default demo city.

**Users aren't hard-coded.** `CURRENT_USER_ID` picks the signed-in user, every profile is rendered by `ProfileView` from a `User`, and `/user/[id]` shows anyone else's profile.

**State persists.** `AppState` hydrates from AsyncStorage on launch and saves (debounced) whatever the user did: progression, cosmetics, mission progress, joined crews/events, follows, likes, saves, own posts and territory. Seed content is never stored, so it can change between builds. Progression arithmetic (`buy`, `addXp`, `claimRewards`, `finishRun`) reads from refs rather than from inside `setState` updaters — React only runs the first updater of an event synchronously, so the previous version could unlock items without charging coins and never detected a level-up.

**Backend-ready.** Screens read everything through `useApp()`. Replacing the demo data with API calls means swapping the seed arrays and generator functions in `data/`, and backing the `AppState` actions with requests. The component tree doesn't need to change.

**Art is code.** Illustrations are React components, so they're crisp at any size, themeable, animatable and tiny to ship. PNG exports in `assets/` are for store listings, marketing and a future backend.

## 3D avatar previews

`/avatar` has a **2D / 3D** toggle (native only — web has no WebView, so the toggle is hidden there). 2D is the parametric `Character` illustration. 3D renders one of the character models in `assets/models/*.glb` with Google's `<model-viewer>` inside a WebView (`src/art/Avatar3DViewer.tsx`) — deliberately **not** native three.js/`expo-gl`, since that needs a custom dev client and `react-native-webview`, `expo-asset` and `expo-file-system` are all in Expo Go.

**How the model reaches the page.** Neither Chromium (Android WebView) nor WebKit lets `fetch()` read a `file://` URL, and three.js loads models with fetch, so the viewer can't just point `<model-viewer src>` at the bundled file. Instead it stages three files in one cache folder — the vendored `model-viewer` script, the `.glb`, and a small `viewer.html` — loads the page from `file://` with read access to that folder (`allowFileAccessFromFileURLs` on Android, `allowingReadAccessToURL` on iOS), and the page XHRs the model into a Blob and hands model-viewer a `blob:` URL. Nothing is fetched from the network: `@google/model-viewer` (BSD-3-Clause) is vendored in `assets/vendor/`, stored as `.txt` so Metro treats it as an asset. Check this path on both platforms after any react-native-webview upgrade.

**Model files.** The scans arrived as raw AI-generated exports (~350k–430k vertices, 20–34 MB each, ~100 MB in the binary). They've been made game-ready with

```bash
npx gltfpack -i in.glb -o packed.glb -si 0.08 -sa         # simplify to ~40k triangles, quantize
npx @gltf-transform/cli resize packed.glb r.glb --width 1536 --height 1536
npx @gltf-transform/cli webp r.glb out.glb --quality 85    # 1536² WebP textures
```

which gives ~0.7 MB per model (2.8 MB for all four). They use `KHR_mesh_quantization`, `KHR_texture_transform` and `EXT_texture_webp`, all supported by three.js/model-viewer. Re-run the pipeline on any new scan before committing it. Eyeball each model on a device after simplifying — `-sa` prioritises the triangle budget over fidelity.

**Third-party branding.** `urban-03.glb` has a real Nike swoosh baked into its texture (shoes / tank top). It's flagged with `hasThirdPartyBranding` in `src/data/avatar3DModels.ts` and only appears in development builds (`__DEV__`), never in a release. Swap the texture or re-scan before making it public — shipping a brand's mark on a character skin without a licence is a trademark risk.

## Notes

- Without GPS (web, or permission denied) run distance is simulated from pace.
- The Explore map is illustrative. A real tile map (`react-native-maps`) would need a development build.
- User state persists in AsyncStorage (see Architecture). Clearing the app's data resets it to the demo defaults.
- The level-up screen shows the rewards defined for the level just reached (`data/rewards.ts`), falling back to the nearest earlier tier.
