# ZB Cup

An internal, mobile-first web app for **Zimmer Biomet** colleagues to play along with the
2026 FIFA World Cup — predict match results, guess fun facts about each other, chat, and climb
the leaderboards. Built just for fun; not affiliated with FIFA or any official competition.

## What it does
- **Match predictions** — pick the winner and exact score of every game; points for correct calls, locked at kick-off.
- **Fun facts** — set a few facts about yourself and guess colleagues' for points.
- **Leaderboards** — an overall ranking plus a football-only board for the sharpest predictor.
- **Chat & celebration photos**, a pinned admin announcement, ZB fun facts, and in-app notifications.
- **Auto-scoring** — finished results are pulled in and points awarded automatically (with manual entry as a backup).

## Tech
Plain HTML, CSS and vanilla JavaScript — **no build step**. Hosted on **GitHub Pages**.
Backend is **Firebase** (Email/Password Auth + Cloud Firestore). A small **Cloud Function**
(`functions/`) fetches finished match results and scores them on a schedule.

## Structure
- `index.html` — app shell that loads everything
- `css/` — styles (Apple-clean, ZB blue `#0079BD`)
- `js/` — app logic + two interchangeable storage layers (demo / Firebase)
- `data/` — team list and fixtures
- `assets/` — icons and logo
- `functions/` — the auto-scores Cloud Function
- `tools/` — score-sync helper script

## Local preview
Open `index.html` in a browser — it runs in **demo mode** (data saved to your browser only,
with a few sample players so nothing looks empty). Switch to a narrow / mobile view to see the
phone layout.

## A note on this being public
The repo is public so GitHub Pages can serve it. It contains **no credentials** — the Firebase
web config is public by design (access is controlled by Firestore security rules), and the
results-API key and service-account credentials live in GitHub Actions secrets / Google Secret
Manager, never in the code.

Made with care for the ZB community. ⚽
