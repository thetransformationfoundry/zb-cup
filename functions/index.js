/* ============================================================
   ZB Cup — auto-scores Cloud Function
   ------------------------------------------------------------
   Two entry points, both run the same core sync:
     • onSyncRequested    — Firestore trigger fired by the Admin "Run scores now" button
     • runScoresScheduled — runs every 15 minutes (reliable, Google-managed)
   It (1) fills in KNOCKOUT teams from football-data as the bracket resolves, and
   (2) scores finished games (group + knockout, incl. extra time / penalties via the
   API's winner field), idempotently (skips games already scored; never double-awards).
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
const FIXTURES = require("./fixtures.json");  // [{id,a,b,kickoff,round}] — knockouts have a/b = null

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
const teamObj = code => ({ code, name: NAME_BY_CODE[code] || code });

// group fixtures: keyed by the unordered pair of team codes (teams known from the start)
const byPair = {}; FIXTURES.filter(f => f.a && f.b).forEach(f => { byPair[[f.a, f.b].sort().join("|")] = f; });
// knockout fixtures: teams unknown initially → matched by round + nearest kickoff
const KNOCKOUTS = FIXTURES.filter(f => !f.a || !f.b);
const ROUND_BY_STAGE = {
  LAST_32: "Round of 32", ROUND_OF_32: "Round of 32",
  LAST_16: "Round of 16", ROUND_OF_16: "Round of 16",
  QUARTER_FINALS: "Quarter-final", QUARTER_FINAL: "Quarter-final",
  SEMI_FINALS: "Semi-final", SEMI_FINAL: "Semi-final",
  THIRD_PLACE: "Third place", THIRD_PLACE_FINAL: "Third place", "3RD_PLACE": "Third place",
  FINAL: "Final"
};
// find our knockout fixture for a football-data knockout match: same round (if known) + nearest kickoff
function matchKnockout(m, used) {
  const round = ROUND_BY_STAGE[m.stage];
  const t = new Date(m.utcDate).getTime();
  let best = null, bestDiff = Infinity;
  for (const f of KNOCKOUTS) {
    if (used.has(f.id)) continue;
    if (round && f.round !== round) continue;
    const diff = Math.abs(new Date(f.kickoff).getTime() - t);
    if (diff < bestDiff) { bestDiff = diff; best = f; }
  }
  return (best && bestDiff <= 12 * 3600 * 1000) ? best : null;  // within ~half a day
}

/* ---- core sync: set knockout teams as the bracket resolves + score finished games ---- */
async function syncScores(apiKey, trigger) {
  const res = await fetch("https://api.football-data.org/v4/competitions/WC/matches", {
    headers: { "X-Auth-Token": apiKey }
  });
  if (!res.ok) throw new Error("football-data API error " + res.status);
  const matches = (await res.json()).matches || [];

  let teamsSet = 0, wrote = 0, skipped = 0, unmatched = 0;
  const scoredNow = [];
  const usedKO = new Set();

  for (const m of matches) {
    const isGroup = m.stage === "GROUP_STAGE";
    const homeCode = resolveTeam(m.homeTeam), awayCode = resolveTeam(m.awayTeam);

    // find OUR fixture: group by code-pair; knockout by round + nearest kickoff
    let fx = null;
    if (isGroup) { if (homeCode && awayCode) fx = byPair[[homeCode, awayCode].sort().join("|")]; }
    else { fx = matchKnockout(m, usedKO); if (fx) usedKO.add(fx.id); }
    if (!fx) { if (m.status === "FINISHED") unmatched++; continue; }

    const metaRef = db.collection("fixturesMeta").doc(fx.id);
    const meta = await metaRef.get();
    const cur = meta.exists ? meta.data() : {};
    const alreadyFinished = cur.status === "finished";

    // KNOCKOUT team-setting: fill in teamA/teamB as soon as the API knows them (teamA = home)
    if (!isGroup && homeCode && awayCode && !alreadyFinished) {
      const need = !cur.teamA || !cur.teamB || (cur.teamA.code !== homeCode) || (cur.teamB.code !== awayCode);
      if (need) { await metaRef.set({ teamA: teamObj(homeCode), teamB: teamObj(awayCode) }, { merge: true }); teamsSet++; }
    }

    // SCORING
    if (m.status === "FINISHED") {
      const ft = m.score && m.score.fullTime;
      if (!ft || ft.home == null || ft.away == null) continue;

      // Group games: score once, then leave alone.
      if (isGroup && alreadyFinished) { skipped++; continue; }

      let scoreA, scoreB, realWinner, aCode, bCode;
      if (isGroup) {
        if (fx.a === homeCode) { scoreA = ft.home; scoreB = ft.away; } else { scoreA = ft.away; scoreB = ft.home; }
        aCode = fx.a; bCode = fx.b;
        realWinner = scoreA > scoreB ? "A" : scoreB > scoreA ? "B" : "draw";
      } else {
        scoreA = ft.home; scoreB = ft.away; aCode = homeCode; bCode = awayCode;
        const w = m.score && m.score.winner;
        realWinner = w === "HOME_TEAM" ? "A" : w === "AWAY_TEAM" ? "B" : (scoreA > scoreB ? "A" : scoreB > scoreA ? "B" : "draw");
      }
      // how a knockout was decided (for the +5 "finish" bonus)
      let actualFinish = null;
      if (!isGroup) {
        const dur = m.score && m.score.duration;
        actualFinish = dur === "PENALTY_SHOOTOUT" ? "penalties" : dur === "EXTRA_TIME" ? "extratime" : "normal";
      }
      const resultDoc = isGroup ? { scoreA, scoreB } : { scoreA, scoreB, winner: realWinner, finish: actualFinish };
      await metaRef.set({ status: "finished", result: resultDoc }, { merge: true });

      const preds = await db.collection("predictions").where("fixtureId", "==", fx.id).get();
      const batch = db.batch();
      let touched = 0, sumDelta = 0;
      const finCounts = {};
      if (!isGroup) console.log(`[KO-RES] ${fx.id} resultBefore=${JSON.stringify(cur.result || {})} computed={score:${scoreA}-${scoreB},winner:${realWinner},finish:${actualFinish}} apiDuration=${m.score && m.score.duration}`);
      preds.forEach(d => {
        const p = d.data();
        if (!isGroup) finCounts[p.finish || "(none)"] = (finCounts[p.finish || "(none)"] || 0) + 1;
        // correct points for this prediction
        let correct = 0;
        if (p.winner === realWinner) correct += 5;
        if (p.scoreA === scoreA && p.scoreB === scoreB) correct += 5;
        if (!isGroup && actualFinish && p.finish === actualFinish) correct += 5;   // knockout finish bonus
        if (!isGroup) console.log(`[KO-PRED] ${fx.id} ${p.uid} w=${p.winner} fin=${p.finish} ${p.scoreA}-${p.scoreB} pa=${p.pointsAwarded} correct=${correct}`);

        if (isGroup) {
          // group: award once (pointsAwarded was null)
          batch.update(d.ref, { pointsAwarded: correct });
          if (correct > 0) batch.update(db.collection("users").doc(p.uid), { points: FieldValue.increment(correct), footballPoints: FieldValue.increment(correct) });
          touched++;
        } else {
          // knockout: RECONCILE — top up (or fix) the difference vs what was awarded before.
          // Self-heals games scored before the finish bonus existed; idempotent (delta 0 once correct).
          const old = (p.pointsAwarded == null) ? 0 : p.pointsAwarded;
          const delta = correct - old;
          if (p.pointsAwarded == null || delta !== 0) {
            batch.update(d.ref, { pointsAwarded: correct });
            if (delta !== 0) { batch.update(db.collection("users").doc(p.uid), { points: FieldValue.increment(delta), footballPoints: FieldValue.increment(delta) }); sumDelta += delta; }
            touched++;
          }
        }
      });
      if (touched) await batch.commit();
      if (!isGroup) console.log(`[KO] ${fx.id} ${NAME_BY_CODE[aCode]} ${scoreA}-${scoreB} ${NAME_BY_CODE[bCode]} | winner=${realWinner} finish=${actualFinish} | preds=${preds.size} touched=${touched} sumDelta=${sumDelta} | predFinishes=${JSON.stringify(finCounts)}`);
      if (!alreadyFinished) { wrote++; scoredNow.push(`${NAME_BY_CODE[aCode]} ${scoreA}-${scoreB} ${NAME_BY_CODE[bCode]}`); }
    }
  }

  await db.collection("tournament").doc("autoSync").set({
    lastRunAt: Date.now(), lastResult: "ok",
    teamsSet, newlyScored: wrote, alreadyDone: skipped, unmatched, scored: scoredNow, trigger
  }, { merge: true });

  return { teamsSet, newlyScored: wrote, alreadyDone: skipped, unmatched, scored: scoredNow };
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
