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
npx expo start --web    # browser preview at phone size
```

Everything ships in Expo Go (`react-native-svg`, `expo-linear-gradient`, `expo-haptics`, `expo-font`, Google Fonts), so no custom dev build is needed. It uses no paid APIs, and all data is local demo data.

## Screens

| Route | Screen |
|---|---|
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

- Run distance is simulated from pace. Wire in `expo-location` for real GPS.
- The Explore map is illustrative. A real tile map (`react-native-maps`) would need a development build.
- State is in memory and resets on reload.
