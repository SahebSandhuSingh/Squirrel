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

### Demo data

Everything that looks like live product data is illustrative and labelled on the page ("Demo feed", "Demo activity", "Sample data", "Pre-launch preview figures"). Edit it in `js/main.js`:

- `TICKS` — hero ticker
- `FEED` — Right now feed
- `BOARD` — leaderboard (name, XP, streak)
- `ZONES` — territory card text
- `AVATARS` — avatar identities, stats and perks
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
