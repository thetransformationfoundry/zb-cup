# ZB Cup — tools

## sync-scores.js — auto-results matcher (currently DRY-RUN only)

Step toward "Donnae doesn't enter scores by hand". Pulls finished World Cup
results from [football-data.org](https://www.football-data.org/) and matches each
one to our 104 fixtures. **It writes nothing yet** — it only prints what it *would* set.

### Try it now (no key, no network)
```
node tools/sync-scores.js --demo
```
Uses built-in sample matches (with football-data's naming quirks like
"Korea Republic", "Côte d'Ivoire") to prove the matching works.

### Run against the real API (read-only)
1. Get a **free** API key at football-data.org (free tier includes the FIFA World Cup, 10 calls/min).
2. Pick a mode:
   ```
   FD_API_KEY=your_key node tools/sync-scores.js --teams     # match ALL 48 team names to our codes up front
   FD_API_KEY=your_key node tools/sync-scores.js --inspect   # show what fields/data the free tier gives us
   FD_API_KEY=your_key node tools/sync-scores.js             # dry-run: print finished results as mX → a-b
   ```
- `--teams` is the best first check: it confirms every World Cup team name maps cleanly,
  and lists any that don't so we can add them to `ALIASES` **before** those games are played.
- The dry-run prints `mX → a-b` for every finished match it can map, and flags any it can't.

### How matching works
- Resolves each API team name → our team **code** (via `ALIASES` + our own names).
- Two teams meet at most once, so the unordered **code pair** uniquely finds the fixture.
- The score is oriented to our `teamA` / `teamB`. A date check guards against surprises.
- Knockout fixtures with no teams yet are skipped until their teams are set.

### Writing step (built) — `--write`
```
FD_API_KEY=key FIREBASE_SERVICE_ACCOUNT='{...json...}' node tools/sync-scores.js --write
```
For each **finished group-stage** match (regular time only), it sets the result in
`fixturesMeta` and awards points to predictions — **idempotently**: it skips any game
already marked finished (manual or a prior run) and never awards points twice. Knockouts
(extra time / penalties) are intentionally skipped and stay manual. Uses the Firebase
Admin SDK; `firebase-admin` is installed automatically by the GitHub Action.

### Running it automatically
`.github/workflows/sync-scores.yml` runs every ~15 min (scheduled runs write; a manual
run defaults to a safe dry-run). **Full setup steps:** `Documentation/AUTO-SCORES-SETUP.md`.
