/* ============================================================
   ZB Cup — Firebase storage layer (LIVE MODE)
   ------------------------------------------------------------
   Mirrors the SAME API as the demo store (js/store.js) so the
   app doesn't change — but data is shared across everyone via
   Firebase. It keeps an in-memory cache kept fresh by Firestore
   onSnapshot listeners, so the app's synchronous getters still
   work; writes go to Firestore (with optimistic cache updates)
   and a re-render is triggered (window.ZB_REFRESH).

   Static match schedule comes from data/fixtures.js; Firestore
   only stores the dynamic bits (results, knockout teams).
   ============================================================ */
(function () {
  if (!window.ZB_LIVE) return; // demo mode handled by js/store.js

  firebase.initializeApp(window.ZB_CONFIG.firebase);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const FV = firebase.firestore.FieldValue;

  const todayKey = () => new Date().toISOString().slice(0, 10);
  const now = () => Date.now();
  const uid = () => "x_" + Math.random().toString(36).slice(2, 10);
  const adminEmails = (window.ZB_CONFIG.ADMIN_EMAILS || []).map(e => e.toLowerCase());

  // ---- in-memory cache (mirrors demo store shape) ----
  const cache = {
    uid: null,
    authed: false,             // is there a signed-in (email-link) user?
    authEmail: null,           // that user's email
    users: {},                 // uid -> user doc (incl. facts array)
    fixturesMeta: {},          // fixtureId -> { status, result, teamA, teamB }
    predictionsMine: {},       // fixtureId -> prediction
    guessesMine: [],           // my guesses
    posts: [],                 // chat posts
    zbFacts: [],
    tournament: { winnerCountryCode: null }
  };

  const refresh = () => { if (window.ZB_REFRESH) window.ZB_REFRESH(); };

  // ---- static fixtures merged with Firestore overrides ----
  function mergedFixtures() {
    return (window.ZB_FIXTURES_SEED || []).map(f => {
      const m = cache.fixturesMeta[f.id];
      if (!m) return f;
      return Object.assign({}, f, {
        status: m.status || f.status,
        result: m.result || f.result,
        teamA: m.teamA || f.teamA,
        teamB: m.teamB || f.teamB
      });
    });
  }

  // ---- listeners (attached once, after auth) ----
  let listenersOn = false;
  function attachListeners() {
    if (listenersOn) return; listenersOn = true;
    db.collection("users").onSnapshot(s => {
      const u = {};
      s.forEach(d => { u[d.id] = Object.assign({ id: d.id }, d.data()); });
      cache.users = u;
      refresh();
    });
    db.collection("posts").orderBy("createdAt").onSnapshot(s => {
      cache.posts = s.docs.map(d => Object.assign({ id: d.id }, d.data()));
      refresh();
    });
    db.collection("zbFacts").onSnapshot(s => {
      cache.zbFacts = s.docs.map(d => Object.assign({ id: d.id }, d.data()));
      refresh();
    });
    db.collection("fixturesMeta").onSnapshot(s => {
      const m = {}; s.forEach(d => m[d.id] = d.data());
      cache.fixturesMeta = m; refresh();
    });
    db.doc("tournament/meta").onSnapshot(d => {
      cache.tournament = d.exists ? d.data() : { winnerCountryCode: null };
      refresh();
    });
    // my predictions + my guesses (scoped to me)
    db.collection("predictions").where("uid", "==", cache.uid).onSnapshot(s => {
      const p = {}; s.forEach(d => { const v = d.data(); p[v.fixtureId] = v; });
      cache.predictionsMine = p; refresh();
    });
    db.collection("guesses").where("guesserId", "==", cache.uid).onSnapshot(s => {
      cache.guessesMine = s.docs.map(d => Object.assign({ id: d.id }, d.data()));
      refresh();
    });
  }

  function me() { return cache.users[cache.uid] || null; }

  // ---- ready promise: resolves once auth state is known ----
  const ready = new Promise(resolve => {
    auth.onAuthStateChanged(user => {
      if (user) {
        cache.uid = user.uid; cache.authEmail = user.email; cache.authed = true;
        attachListeners();
        db.collection("users").doc(user.uid).get()
          .then(d => { if (d && d.exists) cache.users[user.uid] = Object.assign({ id: d.id }, d.data()); })
          .catch(() => {})
          .then(() => resolve());
      } else {
        cache.uid = null; cache.authEmail = null; cache.authed = false;
        resolve();
      }
      refresh();
    });
    setTimeout(resolve, 6000); // safety net
  });

  // ============================================================
  //  PUBLIC API (mirrors demo store)
  // ============================================================
  const Store = {
    ready, todayKey, uid, now,
    DAILY_WRONG_LIMIT: 3,
    emailLogin: true,           // app shows the email magic-link flow

    /* --- current user / auth --- */
    currentUser() { return me(); },
    isAdmin() { const u = me(); return !!(u && u.isAdmin); },
    authed() { return cache.authed; },
    pendingEmail() { return cache.authEmail || null; },
    // Email + password auth. Returns promises; the UI handles success/errors.
    signInEmail(email, password) { return auth.signInWithEmailAndPassword(email, password); },
    createEmail(email, password) { return auth.createUserWithEmailAndPassword(email, password); },
    resetPassword(email) { return auth.sendPasswordResetEmail(email); },
    // Load my own profile doc now (so returning sign-ins land straight on the app).
    reloadMe() {
      if (!cache.uid) return Promise.resolve();
      return db.collection("users").doc(cache.uid).get()
        .then(d => { if (d && d.exists) cache.users[cache.uid] = Object.assign({ id: d.id }, d.data()); })
        .catch(() => {});
    },
    signUp({ name }) {
      const id = cache.uid;
      const email = cache.authEmail || "";
      const doc = {
        name, email, photoURL: null, country: null,
        isAdmin: adminEmails.includes(email.toLowerCase()),
        blocked: false, points: 0, crowns: 0, facts: [], createdAt: now()
      };
      cache.users[id] = Object.assign({ id }, doc);           // optimistic
      db.collection("users").doc(id).set(doc, { merge: true });
      refresh();
      return cache.users[id];
    },
    signOut() {
      cache.uid = null; cache.authed = false; cache.authEmail = null;
      auth.signOut();
    },
    updateProfile(patch) {
      const u = me(); if (!u) return;
      Object.assign(u, patch);                                 // optimistic
      db.collection("users").doc(u.id).update(patch);
      refresh(); return u;
    },
    setCountry(code) {
      const u = me(); if (!u || u.country) return;
      const c = window.ZB_TEAM_BY_CODE[code]; if (!c) return;
      u.country = { code: c.code, name: c.name };
      db.collection("users").doc(u.id).update({ country: u.country });
      refresh(); return u;
    },

    /* --- users / leaderboard --- */
    allUsers() { return Object.values(cache.users); },
    leaderboard() { return this.allUsers().slice().sort((a, b) => (b.points || 0) - (a.points || 0)); },

    /* --- fun facts (stored as array on the user doc) --- */
    factsFor(userId) { const u = cache.users[userId]; return (u && u.facts) || []; },
    factsLocked(userId) {
      const id = userId || cache.uid;
      return ((cache.users[id] || {}).facts || []).length >= 3;
    },
    setMyFacts(facts) {
      const u = me(); if (!u) return { error: "Not signed in" };
      if (this.factsLocked(u.id)) return { error: "Your fun facts are locked and can't be changed." };
      const arr = facts.map((f, i) => Object.assign({ id: "f_" + u.id + "_" + i, order: i }, f));
      u.facts = arr;                                           // optimistic
      db.collection("users").doc(u.id).update({ facts: arr });
      refresh(); return { ok: true };
    },

    /* --- guessing (correctness computed locally from cache) --- */
    wrongGuessesToday() {
      return cache.guessesMine.filter(g => g.dateKey === todayKey() && !g.correct).length;
    },
    guessesLeftToday() { return Math.max(0, this.DAILY_WRONG_LIMIT - this.wrongGuessesToday()); },
    guessedToday(targetUserId, factId) {
      return cache.guessesMine.some(g => g.targetUserId === targetUserId && g.factId === factId && g.dateKey === todayKey());
    },
    alreadyCorrect(targetUserId, factId) {
      return cache.guessesMine.some(g => g.targetUserId === targetUserId && g.factId === factId && g.correct);
    },
    guessFact(targetUserId, factId, optionIndex) {
      const u = me(); if (!u) return { error: "Not signed in" };
      const tf = (cache.users[targetUserId] || {}).facts || [];
      const fact = tf.find(f => f.id === factId);
      if (!fact) return { error: "Fact not found" };
      if (this.guessesLeftToday() <= 0) return { error: "Out of guesses for today — come back tomorrow!" };
      if (this.guessedToday(targetUserId, factId)) return { error: "Already guessed this fact today" };
      const correct = optionIndex === fact.answerIndex;
      const g = { id: uid(), guesserId: u.id, targetUserId, factId, dateKey: todayKey(), correct, createdAt: now() };
      cache.guessesMine.push(g);                               // optimistic
      db.collection("guesses").doc(g.id).set(g);
      if (correct) {
        u.points = (u.points || 0) + 20;                       // optimistic
        db.collection("users").doc(u.id).update({ points: FV.increment(20) });
        const t = cache.users[targetUserId];
        if (t) { t.crowns = (t.crowns || 0) + 1; }
        db.collection("users").doc(targetUserId).update({ crowns: FV.increment(1) });
      }
      refresh();
      return { correct, answerIndex: correct ? fact.answerIndex : null };
    },

    /* --- fixtures / predictions --- */
    fixtures() { return mergedFixtures(); },
    myPrediction(fixtureId) { return cache.predictionsMine[fixtureId] || null; },
    savePrediction(fixtureId, { winner, scoreA, scoreB }) {
      const u = me(); const fx = mergedFixtures().find(f => f.id === fixtureId);
      if (!fx || fx.status === "finished") return { error: "Locked" };
      const docId = fixtureId + "_" + u.id;
      const p = { fixtureId, uid: u.id, winner, scoreA, scoreB, pointsAwarded: null, createdAt: now() };
      cache.predictionsMine[fixtureId] = p;                    // optimistic
      db.collection("predictions").doc(docId).set(p);
      refresh(); return { ok: true };
    },
    // ADMIN: enter a result and award points to all correct predictors
    scoreFixture(fixtureId, scoreA, scoreB) {
      const realWinner = scoreA > scoreB ? "A" : scoreB > scoreA ? "B" : "draw";
      db.collection("fixturesMeta").doc(fixtureId).set(
        { status: "finished", result: { scoreA, scoreB } }, { merge: true });
      db.collection("predictions").where("fixtureId", "==", fixtureId).get().then(snap => {
        const batch = db.batch();
        snap.forEach(d => {
          const p = d.data(); let pts = 0;
          if (p.winner === realWinner) pts += 5;
          if (p.scoreA === scoreA && p.scoreB === scoreB) pts += 5;
          batch.update(d.ref, { pointsAwarded: pts });
          if (pts > 0) batch.update(db.collection("users").doc(p.uid), { points: FV.increment(pts) });
        });
        batch.commit();
      });
    },
    setFixtureTeams(fixtureId, codeA, codeB) {
      const patch = {};
      if (codeA && window.ZB_TEAM_BY_CODE[codeA]) patch.teamA = window.ZB_TEAM_BY_CODE[codeA];
      if (codeB && window.ZB_TEAM_BY_CODE[codeB]) patch.teamB = window.ZB_TEAM_BY_CODE[codeB];
      if (Object.keys(patch).length) db.collection("fixturesMeta").doc(fixtureId).set(patch, { merge: true });
    },
    resultsToEnter() {
      const t = now();
      return mergedFixtures()
        .filter(f => f.status !== "finished" && new Date(f.kickoff).getTime() <= t)
        .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    },

    /* --- chat --- */
    posts() { return cache.posts.slice().sort((a, b) => a.createdAt - b.createdAt); },
    addPost(text) {
      const u = me(); if (u.blocked) return { error: "You've been blocked from posting by the admin." };
      const p = { authorId: u.id, authorName: u.name, authorPhoto: u.photoURL || null, text, goals: 0, goaledBy: [], replies: [], createdAt: now() };
      db.collection("posts").add(p);
      return { ok: true };
    },
    toggleGoal(postId) {
      const u = me(); const p = cache.posts.find(x => x.id === postId); if (!p) return;
      const on = (p.goaledBy || []).includes(u.id);
      db.collection("posts").doc(postId).update({
        goaledBy: on ? FV.arrayRemove(u.id) : FV.arrayUnion(u.id),
        goals: FV.increment(on ? -1 : 1)
      });
    },
    deletePost(postId) { db.collection("posts").doc(postId).delete(); },
    addReply(postId, text) {
      const u = me(); if (u.blocked) return { error: "You've been blocked from posting by the admin." };
      const r = { id: uid(), authorId: u.id, authorName: u.name, authorPhoto: u.photoURL || null, text, createdAt: now() };
      db.collection("posts").doc(postId).update({ replies: FV.arrayUnion(r) });
      return { ok: true };
    },
    deleteReply(postId, replyId) {
      const p = cache.posts.find(x => x.id === postId); if (!p) return;
      const newReplies = (p.replies || []).filter(r => r.id !== replyId);
      db.collection("posts").doc(postId).update({ replies: newReplies });
    },

    /* --- users: admin block --- */
    toggleBlock(userId) {
      const u = cache.users[userId]; if (!u) return;
      const v = !u.blocked; u.blocked = v;
      db.collection("users").doc(userId).update({ blocked: v });
      refresh(); return v;
    },

    /* --- ZB facts --- */
    zbFacts() { return cache.zbFacts.slice().sort((a, b) => b.createdAt - a.createdAt); },
    factOfTheDay() {
      const facts = cache.zbFacts.slice().sort((a, b) => a.createdAt - b.createdAt);
      if (!facts.length) return null;
      const dayIndex = Math.floor(new Date(todayKey()).getTime() / 86400000);
      return facts[dayIndex % facts.length];
    },
    addZbFact({ title, body, imageURL, linkURL }) {
      db.collection("zbFacts").add({ title, body, imageURL: imageURL || null, linkURL: linkURL || null, createdAt: now(), createdBy: cache.uid });
    },
    deleteZbFact(id) { db.collection("zbFacts").doc(id).delete(); },

    /* --- tournament --- */
    tournament() { return cache.tournament || { winnerCountryCode: null }; },
    setTournamentWinner(code) {
      db.doc("tournament/meta").set({ winnerCountryCode: code, name: window.ZB_CONFIG.tournamentName || "World Cup" }, { merge: true });
      db.collection("users").where("country.code", "==", code).get().then(snap => {
        const batch = db.batch();
        snap.forEach(d => batch.update(d.ref, { points: FV.increment(100) }));
        batch.commit();
      });
    },

    resetDemo() { /* no-op in live mode */ }
  };

  window.ZB_STORE = Store;
})();
