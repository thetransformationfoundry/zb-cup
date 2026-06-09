# ZB Cup — App Code

Mobile-first web app for Zimmer Biomet colleagues to play along with the 2026 World Cup.
Plain HTML/CSS/JS — **no build step**. Just files.

## Preview it right now
Double-click **`index.html`**. It opens in your browser in **demo mode** (data saved to your browser only, with a few sample colleagues seeded so nothing looks empty). Tip: in your browser, switch to a narrow / mobile view to see how it looks on a phone.

To start fresh, open the browser console and run: `ZB_STORE.resetDemo()` then reload.

## Files
| File | What it does |
|---|---|
| `index.html` | Loads everything |
| `css/styles.css` | The ZB design system (Apple-clean, blue `#0079BD`) |
| `js/firebase-config.js` | Paste your Firebase keys here to go live |
| `js/logo.js` | The ZB logo, inlined |
| `js/store.js` | Data layer (demo today → swap for Firebase) |
| `js/app.js` | All screens & logic |
| `data/teams.js` | Country list (admin trims to final 48) |
| `data/fixtures.js` | Sample matches (admin replaces with real schedule) |
| `assets/logo.svg` | ZB logo source |

## Go live
See `../Documentation/ROADMAP.md` for the full step-by-step (GitHub Pages + Firebase). Short version:
1. Create a GitHub repo, upload this `Code/` folder, turn on GitHub Pages.
2. Create a Firebase project, paste keys into `js/firebase-config.js`, add the admin email.
3. Publish the Firestore rules from `../Documentation/DATA-MODEL.md`.

## Built with Claude Code
Update `../Documentation/CONTEXT.md` after each work session so the next one picks up cleanly.
