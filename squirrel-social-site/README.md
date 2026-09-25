# Squirrel Social — landing page

Static site, no build step. Open `index.html` in a browser, or serve the folder:

```bash
cd website && python3 -m http.server 8080
```

## What's on the page

The page tells the story in order: **hook → what it is → how it works → why it's fun → what you compete for → who's here → launch → join.**

| Section | Anchor | Notes |
| --- | --- | --- |
| Hero | `#home` | Headline, demo activity ticker, pre-launch figures |
| This isn't another fitness tracker | `#what` | Track / Compete / Claim / Connect cards |
| How it works | `#how` | Four steps, each with a small UI example |
| Choose your battle | `#challenges` | Daily goal, head-to-head (steps tick while visible), territory |
| Own your block | `#territory` | Live-run map (crop of `phone.jpg`) plus the territory card and legend |
| Find your crew | `#community` | Profiles with follow toggles + crew wall |
| Who's moving + real places | — | Leaderboard tabs (sample data) and place types |
| Why Squirrel | `#why` | Three statements |
| Launch | `#launch` | Countdown to 02/10/26 |
| Early access | `#join` | Email form on a founding-member pass |
| FAQ | `#faq` | 10 questions |

### Fun layer

Small interactive touches aimed at a younger, mobile-first crowd:

- **Marquee tape strip** between the hero and the next section (pauses on hover)
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
| `map` (size, river, roads) | Not used at present (Territory now shows the live-run map image) |
| `districts` (polygon, label, `territory.status` / control / XP) | Map zones and zone card; the `featured` district feeds the Track/Claim card, challenge cards |
| `landmarks` | Map labels and meetup locations |
| `routes`, `players` | Your run and the people on the map |
| `members` | Home district on each crew profile card |
| `meetups` | Crew meetup module |
| `activities` | Hero ticker and map pings |
| `crews` | Rival crew name on the zone card |

Map geometry is in abstract map units (`map.width × map.height`), not latitude/longitude. To show another city, replace the object in `city.js` with one of the same shape; no HTML, CSS or UI code changes are needed. Place names in `index.html` are only fallbacks — elements with `data-city="…"` are filled from the dataset at runtime.

### Demo data

Everything that looks like live product data is illustrative and labelled on the page ("Demo feed", "Demo activity", "Sample data", "Pre-launch preview figures"). Edit it in `js/main.js`:

- `js/city.js` → `activities`, `districts`, `meetups`, `members` — ticker, feed, map, territory card, meetup, profile locations
- `js/main.js` → `BOARD` — leaderboard (name, XP, streak)
- `LAUNCH` — launch date for the countdown (`new Date(2026, 9, 2)` = 2 Oct 2026, visitor's local time)

Hero stats are in `index.html` (`.stats`). Footer links go to Instagram (@joinsquirrelsocial), LinkedIn and info@squirrelsocial.in. The hero **Watch video** button opens the Instagram reel in a modal (`#videoFrame` in `index.html`).

## Images

All images live in `assets/`. To change one, replace the file and keep its name.

| File | Where it shows |
| --- | --- |
| `hero.jpg` | Hero photo behind the headline |
| `phone.jpg` | Live-run phone in the hero; also the source of every round face and the Territory map crop |
| `you.jpg` | "You" in the head-to-head card and on the territory map |
| `crew.jpg` | "Good people move different" banner, Why Squirrel |
| `places.jpg` | "Real places. Real meetups." photo, Why Squirrel |
| `run.jpg` | Why Squirrel, crew stories |
| `logo.png` | Menu bar and footer logo (transparent copy of `logo.jpg`) |
| `favicon.png`, `apple-touch-icon.png` | Browser-tab and home-screen icons |

## Wiring up the waitlist

Every "Join early access" button scrolls to the email form. The form checks the email and shows a success message in the browser.
To store sign-ups, send the form to your backend at the `// Hook up your waitlist backend here` comment in `js/main.js`.
