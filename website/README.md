# Squirrel Social — landing page

Static site, no build step. Open `index.html` in a browser, or serve the folder:

```bash
cd website && python3 -m http.server 8080
```

## What's on the page

The page tells the story in order: **hook → what it is → how it works → what you can do → why it's fun → who's here → what you compete for → launch → join.**

| Section | Anchor | Notes |
| --- | --- | --- |
| Hero | `#home` | Headline, demo activity ticker, pre-launch figures |
| This isn't another fitness tracker | `#what` | Track / Compete / Claim cards |
| How it works | `#how` | Four steps, each with a small UI example |
| Meet the game | `#game` | Live movement, challenges, XP + levels, crew meetups |
| Choose your battle | `#challenges` | Daily goal, head-to-head (steps tick while visible), territory |
| Own your block | `#territory` | SVG city map; zone labels are buttons that update the card |
| Your avatar | `#avatars` | Picking an avatar updates the identity card |
| Find your crew | `#community` | Profiles with follow toggles + crew wall |
| Right now | `#live` | Rotating **demo** activity feed |
| Who's moving + real places | — | Leaderboard tabs (sample data) and place types |
| Why Squirrel | `#why` | Three statements |
| Launch | `#launch` | Countdown to 02/10/26 |
| Early access | `#join` | Email form on a founding-member pass |
| FAQ | `#faq` | 10 questions |

### Fun layer

Small interactive touches aimed at a younger, mobile-first crowd:

- **Marquee tape strips** between sections (pause on hover)
- **Vibe check** in the avatar section: one tap picks the matching avatar
- **Crew stories**: story rings that open a full-screen, tap-through viewer (edit `STORIES` in `js/main.js`)
- **🔥 hype** reactions on crew wall posts
- **Confetti** and a **Tell your crew** share button (Web Share API, falls back to copying the link) after joining
- **Sticky "Join the crew" button** on phones, hidden while the form is on screen
- **Scroll progress bar** and lime text selection

All motion stops when the visitor has reduced motion turned on.

### The demo city (`js/city.js`)

The site is city-agnostic. Every place name, map shape and location-based sample on the page comes from one dataset, `window.SquirrelCity` in `js/city.js` — a **fictional** "Demo City" (Riverside, West End, Old Town, North District, …). `js/main.js` never names a place itself; it reads:

| Field | Used by |
| --- | --- |
| `map` (size, river, roads) | Territory map background |
| `districts` (polygon, label, `territory.status` / control / XP) | Map zones and zone card; the `featured` district feeds the Track/Claim card, challenge cards and "Meet the game" |
| `landmarks` | Map labels and meetup locations |
| `routes`, `players` | Your run and the people on the map |
| `members` | Home district on each crew profile card |
| `meetups` | Crew meetup module |
| `activities` | Hero ticker, "Right now" feed and map pings |
| `crews` | Rival crew name on the zone card |

Map geometry is in abstract map units (`map.width × map.height`), not latitude/longitude. To show another city, replace the object in `city.js` with one of the same shape; no HTML, CSS or UI code changes are needed. Place names in `index.html` are only fallbacks — elements with `data-city="…"` are filled from the dataset at runtime.

### Demo data

Everything that looks like live product data is illustrative and labelled on the page ("Demo feed", "Demo activity", "Sample data", "Pre-launch preview figures"). Edit it in `js/main.js`:

- `js/city.js` → `activities`, `districts`, `meetups`, `members` — ticker, feed, map, territory card, meetup, profile locations
- `js/main.js` → `BOARD` — leaderboard (name, XP, streak)
- `js/main.js` → `AVATARS` — avatar identities, stats and perks
- `LAUNCH` — launch date for the countdown (`new Date(2026, 9, 2)` = 2 Oct 2026, visitor's local time)

Hero stats are in `index.html` (`.stats`). Social links in the footer are placeholders marked "soon" — swap in real URLs when the accounts exist.

## Images

All images live in `assets/`. To change one, replace the file and keep its name.

| File | Where it shows |
| --- | --- |
| `hero.jpg` | Hero photo behind the headline |
| `phone.jpg` | Live-run phone in the hero; also the source of every round face and the live-movement map crop |
| `avatar-1.jpg` … `avatar-5.jpg` | "Your avatar. Your vibe." picker |
| `crew.jpg` | "Good people move different" banner, Why Squirrel |
| `places.jpg` | "Real places. Real meetups." photo, Why Squirrel |
| `run.jpg` | "Small steps, bigger crews." strip, Why Squirrel, video placeholder |
| `logo.png` | Menu bar logo (transparent copy of `logo.jpg`; `logo.svg` is the browser-tab icon) |

## Wiring up the waitlist

Every "Join early access" button scrolls to the email form. The form checks the email and shows a success message in the browser.
To store sign-ups, send the form to your backend at the `// Hook up your waitlist backend here` comment in `js/main.js`.
