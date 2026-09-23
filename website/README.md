# Squirrel Social — landing page

Static site, no build step. Open `index.html` in a browser, or serve the folder:

```bash
cd website && python3 -m http.server 8080
```

## Images

All images live in `assets/`. To change one, replace the file and keep its name.

| File | Where it shows |
| --- | --- |
| `hero.jpg` | Big torn photo in the hero |
| `run.jpg` | Polaroid in the hero |
| `places.jpg` | "Real places. Real meetups." photo |
| `crew.jpg` | Footer banner background |
| `phone.jpg` | Live-run app screen in "Game on, in real life" |
| `avatar-1.jpg` … `avatar-5.jpg` | Avatar picker |
| `logo.png` | Menu bar logo (transparent copy of `logo.jpg`; `logo.svg` is the browser-tab icon) |

## Wiring up the waitlist

The "Join early access" form checks its inputs and shows a success message in the browser.
To store sign-ups, send the form to your backend at the `// Hook up your waitlist backend here` comment in `js/main.js`.
