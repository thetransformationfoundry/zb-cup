/* ZB Cup — Storage layer (DEMO MODE)
   ------------------------------------------------------------
   This keeps all data in the browser (localStorage) so the app
   works instantly with no backend. Every screen talks to this
   ZB_STORE object. When we go live, Claude Code swaps the guts of
   these methods for Firebase calls — the screens won't need to change.
   ============================================================ */

(function () {
  // Bump this version whenever the seed/demo data changes (e.g. new fixtures).
  // Changing it makes the app discard old cached demo data and re-seed fresh.
  const KEY = "zbcup_v4";
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const uid = () => "u_" + Math.random().toString(36).slice(2, 9);
  const now = () => Date.now();

  function blank() {
    return {
      currentUserId: null,
      users: {},
      facts: {},        // userId -> [ {id, question, options, answerIndex} ]
      guesses: [],      // {guesserId, targetUserId, factId, dateKey, correct}
      predictions: {},  // fixtureId -> userId -> {winner, scoreA, scoreB, pointsAwarded}
      fixtures: JSON.parse(JSON.stringify(window.ZB_FIXTURES_SEED || [])),
      posts: [],
      zbFacts: [],
      tournament: { winnerCountryCode: null }
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    const fresh = blank();
    seedDemo(fresh);
    persist(fresh);
    return fresh;
  }

  let state = null;
  function persist(s) { localStorage.setItem(KEY, JSON.stringify(s || state)); }
  function get() { if (!state) state = load(); return state; }
  function save() { persist(get()); }

  /* ---------- demo seed: a few colleagues so it's not empty ---------- */
  function seedDemo(s) {
    const demo = [
      { name: "Emma de Vries", email: "emma@zimmerbiomet.com", country: "nl", points: 145, crowns: 2,
        facts: [
          { question: "What's my hidden talent?", options: ["Juggling", "Opera singing", "Yo-yo tricks", "Whistling"], answerIndex: 1 },
          { question: "Which country was I born in?", options: ["Netherlands", "Belgium", "Germany", "France"], answerIndex: 0 },
          { question: "My first job was as a…", options: ["Lifeguard", "Barista", "DJ", "Tour guide"], answerIndex: 2 }
        ] },
      { name: "Marco Rossi", email: "marco@zimmerbiomet.com", country: "it", points: 120, crowns: 1,
        facts: [
          { question: "How many countries have I visited?", options: ["12", "27", "40", "5"], answerIndex: 2 },
          { question: "My favourite food is…", options: ["Sushi", "Pizza (obviously)", "Tacos", "Curry"], answerIndex: 1 },
          { question: "I once met…", options: ["A president", "A famous chef", "An astronaut", "A footballer"], answerIndex: 3 }
        ] },
      { name: "Aisha Khan", email: "aisha@zimmerbiomet.com", country: "gb-eng", points: 95, crowns: 0,
        facts: [
          { question: "My secret skill?", options: ["Speed-cubing", "Calligraphy", "Archery", "Beatboxing"], answerIndex: 2 },
          { question: "Pets at home?", options: ["A cat", "Two dogs", "A parrot", "None"], answerIndex: 1 },
          { question: "Dream holiday?", options: ["Japan", "Iceland", "Safari", "Maldives"], answerIndex: 0 }
        ] },
      { name: "Tom Becker", email: "tom@zimmerbiomet.com", country: "de", points: 60, crowns: 0,
        facts: [
          { question: "I collect…", options: ["Vinyl records", "Stamps", "Sneakers", "Comics"], answerIndex: 0 },
          { question: "Marathon finish time?", options: ["3h10", "4h30", "Never run one", "5h"], answerIndex: 0 },
          { question: "Childhood dream job?", options: ["Pilot", "Vet", "Astronaut", "Footballer"], answerIndex: 2 }
        ] }
    ];

    demo.forEach(d => {
      const id = uid();
      s.users[id] = {
        id, name: d.name, email: d.email, photoURL: null,
        country: window.ZB_TEAM_BY_CODE[d.country] || null,
        isAdmin: false, points: d.points, crowns: d.crowns, createdAt: now()
      };
      s.facts[id] = d.facts.map((f, i) => ({ id: "f_" + id + "_" + i, ...f, order: i }));
    });

    const ids = Object.keys(s.users);
    s.posts = [
      { id: uid(), authorId: ids[0], authorName: demo[0].name, authorPhoto: null,
        text: "Good luck everyone! May the best country win 🏆", goals: 4, goaledBy: [ids[1], ids[2], ids[3]], createdAt: now() - 7200000,
        replies: [
          { id: uid(), authorId: ids[2], authorName: demo[2].name, authorPhoto: null, text: "Let's gooo! 🔥", createdAt: now() - 6900000 },
          { id: uid(), authorId: ids[3], authorName: demo[3].name, authorPhoto: null, text: "May the best fun-fact guesser win 😏", createdAt: now() - 6600000 }
        ] },
      { id: uid(), authorId: ids[1], authorName: demo[1].name, authorPhoto: null,
        text: "Italy all the way. Don't @ me 🇮🇹", goals: 2, goaledBy: [ids[0]], createdAt: now() - 3600000, replies: [] }
    ];
    s.zbFacts = [
      { id: uid(), title: "Did you know?", body: "Zimmer Biomet's brand blue is #0079BD — you'll spot it across our products and this app.", imageURL: null, createdAt: now() - 86400000 },
      { id: uid(), title: "ZB around the world", body: "Zimmer Biomet operates in more than 25 countries — almost a World Cup of its own!", imageURL: null, createdAt: now() - 43200000 }
    ];
  }

  /* ----------------------------- API ----------------------------- */
  const Store = {
    todayKey, uid, now,
    emailLogin: false,   // demo mode uses the simple name+email onboarding

    /* --- current user / auth --- */
    currentUser() { const s = get(); return s.currentUserId ? s.users[s.currentUserId] : null; },
    isAdmin() { const u = this.currentUser(); return !!(u && u.isAdmin); },
    signUp({ name, email, photoURL }) {
      const s = get();
      const adminEmails = (window.ZB_CONFIG.ADMIN_EMAILS || []).map(e => e.toLowerCase());
      const id = uid();
      s.users[id] = {
        id, name, email, photoURL: photoURL || null, country: null,
        isAdmin: adminEmails.includes((email || "").toLowerCase()),
        points: 0, crowns: 0, createdAt: now()
      };
      s.facts[id] = [];
      s.currentUserId = id;
      save();
      return s.users[id];
    },
    signOut() { get().currentUserId = null; save(); },
    updateProfile(patch) {
      const u = this.currentUser(); if (!u) return;
      Object.assign(u, patch); save(); return u;
    },
    setCountry(code) {
      const u = this.currentUser(); if (!u || u.country) return;   // locked once set
      u.country = window.ZB_TEAM_BY_CODE[code] || null; save(); return u;
    },

    /* --- users / leaderboard --- */
    allUsers() { return Object.values(get().users); },
    leaderboard() { return this.allUsers().slice().sort((a, b) => b.points - a.points); },

    /* --- fun facts --- */
    factsFor(userId) { return get().facts[userId] || []; },
    // Once a user has all 3 facts set they're locked (can't be changed — keeps guessing fair).
    factsLocked(userId) {
      const id = userId || (this.currentUser() || {}).id;
      return (get().facts[id] || []).length >= 3;
    },
    setMyFacts(facts) {
      const u = this.currentUser(); if (!u) return { error: "Not signed in" };
      if (this.factsLocked(u.id)) return { error: "Your fun facts are locked and can't be changed." };
      get().facts[u.id] = facts.map((f, i) => ({ id: "f_" + u.id + "_" + i, order: i, ...f }));
      save();
      return { ok: true };
    },
    guessedToday(targetUserId, factId) {
      const me = this.currentUser(); if (!me) return false;
      return get().guesses.some(g =>
        g.guesserId === me.id && g.targetUserId === targetUserId &&
        g.factId === factId && g.dateKey === todayKey());
    },
    alreadyCorrect(targetUserId, factId) {
      const me = this.currentUser(); if (!me) return false;
      return get().guesses.some(g =>
        g.guesserId === me.id && g.targetUserId === targetUserId &&
        g.factId === factId && g.correct);
    },
    // Daily limit: 3 WRONG guesses per day total. Correct guesses don't use up
    // the budget, so a hot streak keeps you playing. 3 wrong = done until tomorrow.
    DAILY_WRONG_LIMIT: 3,
    wrongGuessesToday() {
      const me = this.currentUser(); if (!me) return 0;
      return get().guesses.filter(g => g.guesserId === me.id && g.dateKey === todayKey() && !g.correct).length;
    },
    guessesLeftToday() { return Math.max(0, this.DAILY_WRONG_LIMIT - this.wrongGuessesToday()); },
    guessFact(targetUserId, factId, optionIndex) {
      const me = this.currentUser(); const s = get();
      const fact = (s.facts[targetUserId] || []).find(f => f.id === factId);
      if (!fact) return { error: "Fact not found" };
      if (this.guessesLeftToday() <= 0) return { error: "Out of guesses for today — come back tomorrow!" };
      if (this.guessedToday(targetUserId, factId)) return { error: "Already guessed this fact today" };
      const correct = optionIndex === fact.answerIndex;
      s.guesses.push({ guesserId: me.id, targetUserId, factId, dateKey: todayKey(), correct });
      if (correct) {
        me.points += 20;
        const target = s.users[targetUserId];
        if (target) target.crowns = (target.crowns || 0) + 1;
      }
      save();
      return { correct, answerIndex: correct ? fact.answerIndex : null };
    },

    /* --- fixtures / predictions --- */
    fixtures() { return get().fixtures; },
    myPrediction(fixtureId) {
      const me = this.currentUser(); if (!me) return null;
      return (get().predictions[fixtureId] || {})[me.id] || null;
    },
    savePrediction(fixtureId, { winner, scoreA, scoreB }) {
      const me = this.currentUser(); const s = get();
      const fx = s.fixtures.find(f => f.id === fixtureId);
      if (!fx || fx.status === "finished") return { error: "Locked" };
      s.predictions[fixtureId] = s.predictions[fixtureId] || {};
      s.predictions[fixtureId][me.id] = { winner, scoreA, scoreB, pointsAwarded: null };
      save();
      return { ok: true };
    },
    // ADMIN: enter a result and award points to everyone who predicted it.
    scoreFixture(fixtureId, scoreA, scoreB) {
      const s = get();
      const fx = s.fixtures.find(f => f.id === fixtureId);
      if (!fx) return;
      fx.status = "finished"; fx.result = { scoreA, scoreB };
      const realWinner = scoreA > scoreB ? "A" : scoreB > scoreA ? "B" : "draw";
      const preds = s.predictions[fixtureId] || {};
      Object.entries(preds).forEach(([userId, p]) => {
        let pts = 0;
        if (p.winner === realWinner) pts += 5;
        if (p.scoreA === scoreA && p.scoreB === scoreB) pts += 5;
        p.pointsAwarded = pts;
        if (s.users[userId]) s.users[userId].points += pts;
      });
      save();
    },

    /* --- chat --- */
    posts() { return get().posts.slice().sort((a, b) => a.createdAt - b.createdAt); },
    addPost(text) {
      const me = this.currentUser(); const s = get();
      if (me.blocked) return { error: "You've been blocked from posting by the admin." };
      s.posts.push({ id: uid(), authorId: me.id, authorName: me.name,
        authorPhoto: me.photoURL, text, goals: 0, goaledBy: [], createdAt: now(), replies: [] });
      save();
      return { ok: true };
    },
    addReply(postId, text) {
      const me = this.currentUser(); const s = get();
      if (me.blocked) return { error: "You've been blocked from posting by the admin." };
      const p = s.posts.find(x => x.id === postId); if (!p) return { error: "Post not found" };
      if (!p.replies) p.replies = [];
      p.replies.push({ id: uid(), authorId: me.id, authorName: me.name, authorPhoto: me.photoURL, text, createdAt: now() });
      save();
      return { ok: true };
    },
    deleteReply(postId, replyId) {
      const s = get(); const p = s.posts.find(x => x.id === postId);
      if (p && p.replies) { p.replies = p.replies.filter(r => r.id !== replyId); save(); }
    },
    toggleGoal(postId) {
      const me = this.currentUser(); const s = get();
      const p = s.posts.find(x => x.id === postId); if (!p) return;
      const i = p.goaledBy.indexOf(me.id);
      if (i >= 0) { p.goaledBy.splice(i, 1); p.goals--; }
      else { p.goaledBy.push(me.id); p.goals++; }
      save();
    },
    deletePost(postId) {
      const s = get(); s.posts = s.posts.filter(p => p.id !== postId); save();
    },

    /* --- users: admin block/unblock --- */
    toggleBlock(userId) {
      const s = get(); const u = s.users[userId]; if (!u) return;
      u.blocked = !u.blocked; save(); return u.blocked;
    },

    /* --- admin: set teams on a fixture (for knockout slots once known) --- */
    setFixtureTeams(fixtureId, codeA, codeB) {
      const s = get(); const fx = s.fixtures.find(f => f.id === fixtureId); if (!fx) return;
      if (codeA) fx.teamA = window.ZB_TEAM_BY_CODE[codeA] || fx.teamA;
      if (codeB) fx.teamB = window.ZB_TEAM_BY_CODE[codeB] || fx.teamB;
      save();
    },
    // games that have kicked off but have no result yet (admin's daily to-do)
    resultsToEnter() {
      const t = now();
      return get().fixtures.filter(f => f.status !== "finished" && new Date(f.kickoff).getTime() <= t)
        .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    },

    /* --- ZB facts (admin) --- */
    zbFacts() { return get().zbFacts.slice().sort((a, b) => b.createdAt - a.createdAt); },
    // One ZB fact highlighted per day, same for everyone, rotating through the list by date.
    factOfTheDay() {
      const facts = get().zbFacts.slice().sort((a, b) => a.createdAt - b.createdAt);
      if (!facts.length) return null;
      const dayIndex = Math.floor(new Date(todayKey()).getTime() / 86400000);
      return facts[dayIndex % facts.length];
    },
    addZbFact({ title, body, imageURL, linkURL }) {
      const s = get();
      s.zbFacts.push({ id: uid(), title, body, imageURL: imageURL || null, linkURL: linkURL || null, createdAt: now() });
      save();
    },
    deleteZbFact(id) { const s = get(); s.zbFacts = s.zbFacts.filter(f => f.id !== id); save(); },

    /* --- tournament (admin) --- */
    tournament() { return get().tournament; },
    setTournamentWinner(code) {
      const s = get();
      s.tournament.winnerCountryCode = code;
      Object.values(s.users).forEach(u => {
        if (u.country && u.country.code === code) u.points += 100;
      });
      save();
    },

    /* --- danger: reset demo data --- */
    resetDemo() { localStorage.removeItem(KEY); state = null; }
  };

  if (!window.ZB_LIVE) window.ZB_STORE = Store; // in live mode, store-firebase.js owns ZB_STORE
})();
