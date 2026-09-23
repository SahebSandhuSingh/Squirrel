# Squirrel Social — landing page

Static site, no build step. Open `index.html` in a browser, or serve the folder:

```bash
cd website && python3 -m http.server 8080
```

## Photos

The design's photos load from `assets/`. Until a file exists, a stylised fallback shows in its place.

| File | Where it shows |
| --- | --- |
| `assets/hero-crew.jpg` | Big torn photo in the hero |
| `assets/runners.jpg` | Polaroid in the hero |
| `assets/meetup.jpg` | "Real places. Real meetups." photo |
| `assets/rooftop-crew.jpg` | Footer banner background |

## Wiring up the waitlist

The "Join early access" form checks its inputs and shows a success message in the browser.
To store sign-ups, send the form to your backend at the `// Hook up your waitlist backend here` comment in `script.js`.
