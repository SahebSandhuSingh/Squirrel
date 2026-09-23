# Squirrel Social — mobile app

Expo (React Native) frontend for Squirrel Social: **Move · Connect · Grow**.
Runs on iOS, Android, and the web from one codebase. It uses Expo Router, TypeScript, and the neon/synthwave design.

## Run it

```bash
cd mobile
npm install
npx expo start        # press i (iOS), a (Android), w (web), or scan the QR with Expo Go
npm run typecheck
```

Everything used ships in Expo Go (`expo-linear-gradient`, `react-native-svg`, `expo-haptics`, Google Fonts), so a custom dev build isn't needed.

## Screens

| Route | Screen |
|---|---|
| `/welcome` | Splash — Get started / I already have an account |
| `/avatar` | Make it You — avatar, outfit, and style picker |
| `/home` (tab) | Today's Missions — log progress, claim XP |
| `/explore` (tab) | Neon map with gyms, runs, cafes, and events, plus filters and search |
| `/social` (tab) | Feed — For You / Following / Nearby, like and save |
| `/profile` (tab) | Profile, highlights, and post grid |
| `/run` (center **+**) | Live run tracker — pause/resume, long-press to finish |
| `/progress` | Your Progress — Day/Week/Month/Year stats |
| `/crew` | Find Your Crew — search and join clubs |
| `/events` | Events — Nearby / Online / My Events |
| `/level-up` | Level Up rewards screen (opens after claiming missions) |
| `/shop` | Shop — spend coins on avatar gear |

## Structure

```
src/
  app/                 Expo Router routes (every file is a screen)
    (tabs)/            Home, Explore, Social, Profile + custom tab bar layout
  components/
    ui.tsx             Buttons, chips, segmented control, cards, header, Screen wrapper
    art.tsx            SVG artwork: city skyline, neon map, run route, minimap
    TabBar.tsx         Floating tab bar with the raised pink "+" button
  data/mock.ts         Mock data (missions, stats, crews, events, shop, posts)
  state/AppState.tsx   In-memory app state (XP/level, coins, joins, likes, purchases)
  theme.ts             Colors, gradients, fonts
```

## Next steps / placeholders

- **Art:** The squirrel mascot and avatars are emoji placeholders (`Mascot`, `AvatarCircle`), and the city backdrops are generated SVG. Drop the real illustrations into `assets/` and swap them in inside `components/ui.tsx` and `components/art.tsx`.
- **Data:** Everything comes from `src/data/mock.ts` and `AppState`, and it resets when the app restarts. Replace these with API calls once the backend is ready.
- **Run tracking:** Distance is simulated from pace. Wire in `expo-location` for real GPS, and `react-native-maps` for a real Explore map (that one needs a dev build).
- **Auth:** `/` always redirects to `/welcome`. Once auth exists, send signed-in users to `/home`.
