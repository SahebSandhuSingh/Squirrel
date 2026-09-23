# Squirrel Social — landing page

Static site, no build step. Open `index.html` in a browser, or serve the folder:

```bash
cd website && python3 -m http.server 8080
```

## Images

All images live in `assets/`. To change one, replace the file and keep its name.

| File | Where it shows |
| --- | --- |
| `hero.jpg` | Hero photo behind the headline |
| `phone.jpg` | Live-run phone in the hero (also the source of the round leaderboard faces) |
| `avatar-1.jpg` … `avatar-5.jpg` | "Your avatar. Your vibe." picker |
| `crew.jpg` | "Good people move different" banner |
| `places.jpg` | "Real places. Real meetups." photo next to the leaderboard |
| `run.jpg` | "Small steps, bigger crews." strip |
| `logo.png` | Menu bar logo (transparent copy of `logo.jpg`; `logo.svg` is the browser-tab icon) |

## Wiring up the waitlist

Every "Join early access" button scrolls to the email form. The form checks the email and shows a success message in the browser.
To store sign-ups, send the form to your backend at the `// Hook up your waitlist backend here` comment in `js/main.js`.
