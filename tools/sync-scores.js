#!/usr/bin/env node
/* ============================================================
   ZB Cup — score sync (DRY-RUN matcher)
   ------------------------------------------------------------
   Pulls finished World Cup match results from football-data.org
   and matches each one to our 104 fixtures, printing what it
   WOULD set. It writes nothing — this is the safe proof step.

   Usage:
     node tools/sync-scores.js --demo        # uses built-in sample data (no key, no network)
     FD_API_KEY=xxxx node tools/sync-scores.js   # hits the real football-data.org API (read-only)

   When we trust the matching, a later version adds the writing
   step (set the result in Firestore + award points), with
   Donnae's manual entry kept as a backup/override.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* ---- load our static data (teams.js / fixtures.js set window.* ) ----
   Works whether the repo keeps the app under Code/ (our working folder) or at
   the repo root (next to index.html), and whether run from tools/ or repo root. */
function findDataFile(file) {
  const candidates = [
    path.join(__dirname, "..", "Code", "data", file),  // working folder: tools/ next to Code/
    path.join(__dirname, "..", "data", file),          // repo root: tools/ next to data/
    path.join(__dirname, "data", file),
    path.join(process.cwd(), "Code", "data", file),
    path.join(process.cwd(), "data", file)
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) throw new Error("Could not find " + file + " (looked in:\n  " + candidates.join("\n  ") + ")");
  return found;
}
function loadWindowFile(file) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(findDataFile(file), "utf8"), ctx);
  return ctx.window;
}
const TEAMS = loadWindowFile("teams.js").ZB_TEAMS;
const FIXTURES = loadWindowFile("fixtures.js").ZB_FIXTURES_SEED;

/* ---- name matching ---- */
// normalise a team name: strip accents, lowercase, keep letters/numbers only
const normalize = s => (s || "").toString()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// football-data.org sometimes names teams differently from us — map those here.
// Keys are the NORMALISED football-data name; values are our team code.
const ALIASES = {
  "korea republic": "kr", "south korea": "kr",
  "czech republic": "cz", "czechia": "cz",
  "united states": "us", "usa": "us",
  "cote d ivoire": "ci", "cote divoire": "ci", "ivory coast": "ci",
  "congo dr": "cd", "dr congo": "cd", "democratic republic of congo": "cd",
  "turkiye": "tr", "turkey": "tr",
  "cabo verde": "cv", "cape verde": "cv", "cape verde islands": "cv",
  "bosnia and herzegovina": "ba", "bosnia herzegovina": "ba",
  "curacao": "cw",
  "ir iran": "ir", "iran": "ir",
  "saudi arabia": "sa"
};
// base map from our own team names
const BY_NAME = {};
TEAMS.forEach(t => { BY_NAME[normalize(t.name)] = t.code; });
const resolveCode = name => { const n = normalize(name); return ALIASES[n] || BY_NAME[n] || null; };
// resolve a football-data team object, trying full name → short name → abbreviation
const resolveTeam = t => t ? (resolveCode(t.name) || resolveCode(t.shortName) || resolveCode(t.tla)) : null;

// index our fixtures by the (unordered) pair of team codes — two teams meet at most once
const byPair = {};
FIXTURES.forEach(f => {
  if (!f.teamA.code || !f.teamB.code) return;            // skip knockout slots with no teams yet
  byPair[[f.teamA.code, f.teamB.code].sort().join("|")] = f;
});

/* ---- turn one football-data match into a proposed result ---- */
function proposeForMatch(m) {
  if (m.status !== "FINISHED") return { skip: "not finished" };
  const ft = m.score && m.score.fullTime;
  if (!ft || ft.home == null || ft.away == null) return { skip: "no score" };
  const homeCode = resolveTeam(m.homeTeam);
  const awayCode = resolveTeam(m.awayTeam);
  if (!homeCode || !awayCode) {
    return { unmatched: { reason: "unknown team name", home: m.homeTeam && m.homeTeam.name, away: m.awayTeam && m.awayTeam.name, homeCode, awayCode } };
  }
  const fx = byPair[[homeCode, awayCode].sort().join("|")];
  if (!fx) return { unmatched: { reason: "no fixture for this pair", home: homeCode, away: awayCode } };
  // orient the score to our teamA / teamB
  let scoreA, scoreB;
  if (fx.teamA.code === homeCode) { scoreA = ft.home; scoreB = ft.away; }
  else { scoreA = ft.away; scoreB = ft.home; }
  // sanity: dates should line up (two teams only meet once, so this is just a guard)
  const fdDate = (m.utcDate || "").slice(0, 10);
  const fxDate = new Date(fx.kickoff).toISOString().slice(0, 10);
  const dateWarn = (fdDate && fxDate && fdDate !== fxDate) ? `  ⚠ date check: API ${fdDate} vs fixture ${fxDate}` : "";
  return { matched: { id: fx.id, scoreA, scoreB, label: `${fx.teamA.name} ${scoreA}-${scoreB} ${fx.teamB.name}`, dateWarn } };
}

/* ---- football-data.org API (read-only) ---- */
async function api(suffix) {
  const KEY = process.env.FD_API_KEY;
  if (!KEY) {
    console.error("No FD_API_KEY set.\n  • Test offline:  node tools/sync-scores.js --demo\n  • Real data:     FD_API_KEY=<your key> node tools/sync-scores.js [--teams|--inspect]");
    process.exit(1);
  }
  const res = await fetch("https://api.football-data.org/v4" + suffix, { headers: { "X-Auth-Token": KEY } });
  if (!res.ok) { console.error("football-data.org API error:", res.status, await res.text()); process.exit(1); }
  return res.json();
}

/* ---- mode: --teams — match EVERY World Cup team name to our codes up front ---- */
async function runTeams() {
  const teams = (await api("/competitions/WC/teams")).teams || [];
  console.log(`\nfootball-data lists ${teams.length} World Cup team(s). Matching each to our codes…\n`);
  const matched = [], unmatched = [];
  teams.forEach(t => {
    const code = resolveCode(t.name) || resolveCode(t.shortName) || resolveCode(t.tla);
    (code ? matched : unmatched).push({ name: t.name, shortName: t.shortName, tla: t.tla, code });
  });
  matched.sort((a, b) => a.name.localeCompare(b.name)).forEach(m => console.log(`  ✓ ${String(m.name).padEnd(28)} → ${m.code}`));
  console.log(`\n${matched.length}/${teams.length} matched.`);
  if (unmatched.length) {
    console.log(`\n✗ ${unmatched.length} NOT matched — send these to Claude and they'll be added to ALIASES:`);
    unmatched.forEach(u => console.log(`     name="${u.name}"  shortName="${u.shortName}"  tla="${u.tla}"`));
  } else {
    console.log("Every World Cup team name maps cleanly — we're fully covered. 🎉");
  }
  console.log("");
}

/* ---- mode: --inspect — show what data/fields the free tier gives us ---- */
async function runInspect() {
  const matches = (await api("/competitions/WC/matches")).matches || [];
  console.log(`\nFree-tier check — /competitions/WC/matches returned ${matches.length} matches.`);
  if (matches[0]) {
    console.log("\nFields on a match object:\n  " + Object.keys(matches[0]).join(", "));
    const e = matches.find(x => x.status === "FINISHED") || matches[0];
    console.log("\nExample match (trimmed):");
    console.log(JSON.stringify({
      id: e.id, utcDate: e.utcDate, status: e.status, matchday: e.matchday,
      stage: e.stage, group: e.group,
      homeTeam: e.homeTeam && e.homeTeam.name, awayTeam: e.awayTeam && e.awayTeam.name,
      score: e.score
    }, null, 2));
  }
  console.log("\nStatus values present:", [...new Set(matches.map(x => x.status))].join(", "));
  console.log("");
}

/* ---- mode: default / --demo — dry-run finished-match matcher ---- */
const DEMO_MATCHES = [
  { status: "FINISHED", utcDate: "2026-06-11T19:00:00Z", homeTeam: { name: "Mexico" }, awayTeam: { name: "South Africa" }, score: { fullTime: { home: 2, away: 0 } } },
  { status: "FINISHED", utcDate: "2026-06-12T02:00:00Z", homeTeam: { name: "Korea Republic" }, awayTeam: { name: "Czechia" }, score: { fullTime: { home: 1, away: 2 } } },
  { status: "FINISHED", utcDate: "2026-06-12T19:00:00Z", homeTeam: { name: "Canada" }, awayTeam: { name: "Bosnia and Herzegovina" }, score: { fullTime: { home: 3, away: 1 } } },
  { status: "FINISHED", utcDate: "2026-06-14T20:00:00Z", homeTeam: { name: "Netherlands" }, awayTeam: { name: "Japan" }, score: { fullTime: { home: 2, away: 1 } } },
  { status: "FINISHED", utcDate: "2026-06-14T23:00:00Z", homeTeam: { name: "Côte d'Ivoire" }, awayTeam: { name: "Ecuador" }, score: { fullTime: { home: 0, away: 0 } } },
  { status: "FINISHED", utcDate: "2026-06-20T19:00:00Z", homeTeam: { name: "Atlantis" }, awayTeam: { name: "Narnia" }, score: { fullTime: { home: 1, away: 1 } } }, // intentionally unmatchable
  { status: "IN_PLAY", utcDate: "2026-06-13T22:00:00Z", homeTeam: { name: "Brazil" }, awayTeam: { name: "Morocco" }, score: { fullTime: { home: null, away: null } } }
];

async function runDryRun(demo) {
  const matches = demo ? DEMO_MATCHES : ((await api("/competitions/WC/matches")).matches || []);
  const finished = matches.filter(m => m.status === "FINISHED");
  console.log(`\nSource returned ${matches.length} World Cup match(es) — ${finished.length} finished.`);
  console.log("DRY RUN — nothing is written.\n");
  const proposals = [], unmatched = [];
  finished.forEach(m => {
    const r = proposeForMatch(m);
    if (r.matched) proposals.push(r.matched);
    else if (r.unmatched) unmatched.push(r.unmatched);
  });
  console.log(`✓ Would set ${proposals.length} result(s):`);
  proposals.forEach(p => console.log(`    ${p.id.padEnd(4)} →  ${p.scoreA}-${p.scoreB}   (${p.label})${p.dateWarn}`));
  if (unmatched.length) {
    console.log(`\n✗ ${unmatched.length} finished match(es) could NOT be mapped — add an alias in ALIASES:`);
    unmatched.forEach(u => console.log("    ", JSON.stringify(u)));
  } else {
    console.log("\nAll finished matches mapped cleanly. 🎉");
  }
  console.log("");
}

/* ---- mode: --write — actually set results + award points (group stage only) ---- */
async function runWrite() {
  let admin;
  try { admin = require("firebase-admin"); }
  catch (e) { console.error("firebase-admin not installed (the GitHub Action installs it automatically)."); process.exit(1); }
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saRaw) { console.error("FIREBASE_SERVICE_ACCOUNT secret not set."); process.exit(1); }
  let sa; try { sa = JSON.parse(saRaw); } catch (e) { console.error("FIREBASE_SERVICE_ACCOUNT is not valid JSON."); process.exit(1); }
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const db = admin.firestore();
  const FV = admin.firestore.FieldValue;

  const matches = (await api("/competitions/WC/matches")).matches || [];
  // ONLY group-stage games that are finished in regular time (knockouts/extra-time stay manual)
  const todo = matches.filter(m => m.status === "FINISHED" && m.stage === "GROUP_STAGE"
    && (!m.score || !m.score.duration || m.score.duration === "REGULAR"));
  console.log(`\nLIVE WRITE — ${todo.length} finished group-stage match(es) to consider.\n`);

  let wrote = 0, skipped = 0, unmatched = 0;
  for (const m of todo) {
    const r = proposeForMatch(m);
    if (!r.matched) { unmatched++; console.log("  ✗ unmatched:", JSON.stringify(r.unmatched || r.skip)); continue; }
    const { id, scoreA, scoreB } = r.matched;
    const metaRef = db.collection("fixturesMeta").doc(id);
    const meta = await metaRef.get();
    if (meta.exists && meta.data().status === "finished") { skipped++; console.log(`  – ${id} already scored — leaving it alone`); continue; }

    await metaRef.set({ status: "finished", result: { scoreA, scoreB } }, { merge: true });
    const realWinner = scoreA > scoreB ? "A" : scoreB > scoreA ? "B" : "draw";
    const preds = await db.collection("predictions").where("fixtureId", "==", id).get();
    const batch = db.batch();
    let scoredPreds = 0;
    preds.forEach(d => {
      const p = d.data();
      if (p.pointsAwarded != null) return;              // never double-award
      let pts = 0;
      if (p.winner === realWinner) pts += 5;
      if (p.scoreA === scoreA && p.scoreB === scoreB) pts += 5;
      batch.update(d.ref, { pointsAwarded: pts });
      if (pts > 0) batch.update(db.collection("users").doc(p.uid), { points: FV.increment(pts) });
      scoredPreds++;
    });
    await batch.commit();
    wrote++;
    console.log(`  ✓ ${id} → ${scoreA}-${scoreB}  (scored ${scoredPreds} prediction(s))`);
  }
  console.log(`\nDone. ${wrote} newly scored, ${skipped} already done, ${unmatched} unmatched.\n`);
}

/* ---- entry ---- */
const argv = process.argv.slice(2);
(async () => {
  if (argv.includes("--teams")) return runTeams();
  if (argv.includes("--inspect")) return runInspect();
  if (argv.includes("--write")) return runWrite();
  return runDryRun(argv.includes("--demo"));
})();
