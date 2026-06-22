/* ============================================================
   ZB Cup — auto-scores Cloud Function
   ------------------------------------------------------------
   Two entry points, both run the same core sync:
     • runScoresNow      — callable from the app's Admin "Run scores now" button (admins only)
     • runScoresScheduled — runs every 15 minutes (reliable, Google-managed)
   Pulls finished GROUP-STAGE results from football-data.org and writes the result +
   awards points, idempotently (skips games already scored; never double-awards).
   Auth to Firestore is automatic (runs as the project service account — no key).
   The football-data key is a Firebase secret (FD_API_KEY).
   ============================================================ */
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();
const FD_API_KEY = defineSecret("FD_API_KEY");

const ADMIN_EMAILS = [
  "donnae.abbood@zimmerbiomet.com",
  "sean.abbood@thetransformationfoundry.nl"
];

const TEAMS = require("./teams.json");        // [{code,name}]
const FIXTURES = require("./fixtures.json");  // [{id,a,b}] group-stage fixtures with team codes

/* ---- team-name matching (same logic as tools/sync-scores.js) ---- */
const normalize = s => (s || "").toString()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ALIASES = {
  "korea republic": "kr", "south korea": "kr",
  "czech republic": "cz", "czechia": "cz",
  "united states": "us", "usa": "us",
  "cote d ivoire": "ci", "cote divoire": "ci", "ivory coast": "ci",
  "congo dr": "cd", "dr congo": "cd", "democratic republic of congo": "cd",
  "turkiye": "tr", "turkey": "tr",
  "cabo verde": "cv", "cape verde": "cv", "cape verde islands": "cv",
  "bosnia and herzegovina": "ba", "bosnia herzegovina": "ba",
  "curacao": "cw", "ir iran": "ir", "iran": "ir", "saudi arabia": "sa"
};
const BY_NAME = {}; TEAMS.forEach(t => { BY_NAME[normalize(t.name)] = t.code; });
const NAME_BY_CODE = {}; TEAMS.forEach(t => { NAME_BY_CODE[t.code] = t.name; });
const resolveCode = name => { const n = normalize(name); return ALIASES[n] || BY_NAME[n] || null; };
const resolveTeam = t => t ? (resolveCode(t.name) || resolveCode(t.shortName) || resolveCode(t.tla)) : null;
const byPair = {}; FIXTURES.forEach(f => { byPair[[f.a, f.b].sort().join("|")] = f; });

/* ---- core sync (returns a summary) ---- */
async function syncScores(apiKey, trigger) {
  const res = await fetch("https://api.football-data.org/v4/competitions/WC/matches", {
    headers: { "X-Auth-Token": apiKey }
  });
  if (!res.ok) throw new Error("football-data API error " + res.status);
  const matches = (await res.json()).matches || [];
  const todo = matches.filter(m => m.status === "FINISHED" && m.stage === "GROUP_STAGE"
    && (!m.score || !m.score.duration || m.score.duration === "REGULAR"));

  let wrote = 0, skipped = 0, unmatched = 0;
  const scoredNow = [];
  for (const m of todo) {
    const homeCode = resolveTeam(m.homeTeam), awayCode = resolveTeam(m.awayTeam);
    if (!homeCode || !awayCode) { unmatched++; continue; }
    const fx = byPair[[homeCode, awayCode].sort().join("|")];
    if (!fx) { unmatched++; continue; }
    const ft = m.score.fullTime;
    let scoreA, scoreB;
    if (fx.a === homeCode) { scoreA = ft.home; scoreB = ft.away; } else { scoreA = ft.away; scoreB = ft.home; }

    const metaRef = db.collection("fixturesMeta").doc(fx.id);
    const meta = await metaRef.get();
    if (meta.exists && meta.data().status === "finished") { skipped++; continue; }

    await metaRef.set({ status: "finished", result: { scoreA, scoreB } }, { merge: true });
    const realWinner = scoreA > scoreB ? "A" : scoreB > scoreA ? "B" : "draw";
    const preds = await db.collection("predictions").where("fixtureId", "==", fx.id).get();
    const batch = db.batch();
    preds.forEach(d => {
      const p = d.data();
      if (p.pointsAwarded != null) return;       // never double-award
      let pts = 0;
      if (p.winner === realWinner) pts += 5;
      if (p.scoreA === scoreA && p.scoreB === scoreB) pts += 5;
      batch.update(d.ref, { pointsAwarded: pts });
      if (pts > 0) batch.update(db.collection("users").doc(p.uid), { points: FieldValue.increment(pts), footballPoints: FieldValue.increment(pts) });
    });
    await batch.commit();
    wrote++;
    scoredNow.push(`${NAME_BY_CODE[fx.a]} ${scoreA}-${scoreB} ${NAME_BY_CODE[fx.b]}`);
  }

  await db.collection("tournament").doc("autoSync").set({
    lastRunAt: Date.now(), lastResult: "ok",
    newlyScored: wrote, alreadyDone: skipped, unmatched, scored: scoredNow, trigger
  }, { merge: true });

  return { newlyScored: wrote, alreadyDone: skipped, unmatched, scored: scoredNow };
}

/* ---- the Admin "Run scores now" button writes tournament/syncRequest; this runs the sync.
   A Firestore trigger (not a public HTTP endpoint) sidesteps the org policy that blocks
   publicly-invokable callable functions. Only admins can write that doc (Firestore rules),
   so the request is already authorised by the time we get here. ---- */
exports.onSyncRequested = onDocumentWritten(
  { document: "tournament/syncRequest", secrets: [FD_API_KEY], region: "us-central1" },
  async (event) => {
    const after = event.data && event.data.after;
    if (!after || !after.exists) return;        // ignore deletes
    try {
      await syncScores(FD_API_KEY.value(), "manual");
    } catch (e) {
      await db.collection("tournament").doc("autoSync").set(
        { lastRunAt: Date.now(), lastResult: "error", message: e.message || "error" }, { merge: true });
    }
  }
);

/* ---- reliable 15-minute schedule (replaces the GitHub cron) ---- */
exports.runScoresScheduled = onSchedule(
  { schedule: "every 15 minutes", secrets: [FD_API_KEY], region: "us-central1" },
  async () => { await syncScores(FD_API_KEY.value(), "schedule"); }
);
