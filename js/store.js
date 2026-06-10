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
  const KEY = "zbcup_v7";
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
      notifications: [],
      bugReports: [],
      cotd: null,
      cotdHistory: [],
      announcement: null,
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
  function notify(targetId, type, text) {
    const s = get(); const me = s.currentUserId ? s.users[s.currentUserId] : null;
    if (!targetId || !me || targetId === me.id) return;
    if (!s.notifications) s.notifications = [];
    s.notifications.push({ id: uid(), userId: targetId, type, text, fromName: me.name, createdAt: now(), read: false });
  }

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
    isAdmin() {
      const u = this.currentUser(); if (!u) return false;
      const admins = (window.ZB_CONFIG.ADMIN_EMAILS || []).map(e => e.toLowerCase());
      return !!(u.isAdmin || admins.includes((u.email || "").toLowerCase()));
    },
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
        // +20 pts for the guesser; the TARGET earns a 👑 (their fact got figured out)
        me.points += 20;
        const target = s.users[targetUserId]; if (target) target.crowns = (target.crowns || 0) + 1;
        notify(targetUserId, "guess", `${me.name} guessed one of your fun facts!`);
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
      if (new Date(fx.kickoff).getTime() <= now()) return { error: "Predictions closed at kickoff" };
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
    goalers(postId) {
      const s = get(); const p = s.posts.find(x => x.id === postId); if (!p) return [];
      return (p.goaledBy || []).map(id => { const u = s.users[id] || {}; return { name: u.name || "Someone", photoURL: u.photoURL || null }; });
    },
    addPost(text, imageURL) {
      const me = this.currentUser(); const s = get();
      if (me.blocked) return { error: "You've been blocked from posting by the admin." };
      if (imageURL && me.lastPhotoBonus === todayKey()) return { error: "You can post one photo per day — try again tomorrow!" };
      s.posts.push({ id: uid(), authorId: me.id, authorName: me.name,
        authorPhoto: me.photoURL, text: text || "", imageURL: imageURL || null, goals: 0, goaledBy: [], createdAt: now(), replies: [] });
      let bonus = 0;
      if (imageURL) { bonus = 10; me.points = (me.points || 0) + 10; me.lastPhotoBonus = todayKey(); }
      save();
      return { ok: true, bonus };
    },
    addReply(postId, text) {
      const me = this.currentUser(); const s = get();
      if (me.blocked) return { error: "You've been blocked from posting by the admin." };
      const p = s.posts.find(x => x.id === postId); if (!p) return { error: "Post not found" };
      if (!p.replies) p.replies = [];
      p.replies.push({ id: uid(), authorId: me.id, authorName: me.name, authorPhoto: me.photoURL, text, goals: 0, goaledBy: [], createdAt: now() });
      notify(p.authorId, "reply", `${me.name} replied to your post`);
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
      else { p.goaledBy.push(me.id); p.goals++; notify(p.authorId, "goal", `${me.name} gave your post a Goal ⚽`); }
      save();
    },
    toggleReplyGoal(postId, replyId) {
      const me = this.currentUser(); const s = get();
      const p = s.posts.find(x => x.id === postId); if (!p || !p.replies) return;
      const r = p.replies.find(x => x.id === replyId); if (!r) return;
      r.goaledBy = r.goaledBy || []; r.goals = r.goals || 0;
      const i = r.goaledBy.indexOf(me.id);
      if (i >= 0) { r.goaledBy.splice(i, 1); r.goals--; }
      else { r.goaledBy.push(me.id); r.goals++; notify(r.authorId, "goal", `${me.name} gave your reply a Goal ⚽`); }
      save();
    },
    deletePost(postId) {
      const s = get(); const p = s.posts.find(x => x.id === postId);
      if (p && p.imageURL && p.authorId) {
        const a = s.users[p.authorId]; if (a) { a.points = Math.max(0, (a.points || 0) - 10); a.lastPhotoBonus = ""; }
      }
      s.posts = s.posts.filter(x => x.id !== postId); save();
    },

    /* --- notifications --- */
    notifications() {
      const s = get(); const me = this.currentUser(); if (!me) return [];
      return (s.notifications || []).filter(n => n.userId === me.id).sort((a, b) => b.createdAt - a.createdAt);
    },
    unreadCount() {
      const s = get(); const me = this.currentUser(); if (!me) return 0;
      return (s.notifications || []).filter(n => n.userId === me.id && !n.read).length;
    },
    markAllRead() {
      const s = get(); const me = this.currentUser(); if (!me) return;
      (s.notifications || []).forEach(n => { if (n.userId === me.id) n.read = true; });
      save();
    },
    clearNotifications() {
      const s = get(); const me = this.currentUser(); if (!me) return;
      s.notifications = (s.notifications || []).filter(n => n.userId !== me.id); save();
    },
    resetCrowns() {
      const s = get(); Object.values(s.users).forEach(u => u.crowns = 0); save();
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
    colleagueOfTheDay() {
      const s = get(); const today = todayKey();
      if (!s.cotd || s.cotd.dateKey !== today) {
        const elig = Object.values(s.users).filter(u => (s.facts[u.id] || []).length >= 1);
        let pool = elig.filter(u => !(s.cotdHistory || []).includes(u.id));
        if (!pool.length) { pool = elig; s.cotdHistory = []; }
        if (!pool.length) return null;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        s.cotd = { dateKey: today, userId: pick.id, claps: 0, clappedBy: [] };
        s.cotdHistory = (s.cotdHistory || []).concat(pick.id);
        save();
      }
      const u = s.users[s.cotd.userId]; if (!u) return null;
      return Object.assign({}, u, { claps: s.cotd.claps || 0, clappedBy: s.cotd.clappedBy || [] });
    },
    celebrateCotd() {
      const s = get(); const me = this.currentUser();
      if (!s.cotd || !me || s.cotd.userId === me.id) return;
      const i = s.cotd.clappedBy.indexOf(me.id);
      if (i >= 0) { s.cotd.clappedBy.splice(i, 1); s.cotd.claps--; }
      else { s.cotd.clappedBy.push(me.id); s.cotd.claps++; notify(s.cotd.userId, "celebrate", `${me.name} celebrated you as Colleague of the Day 👏`); }
      save();
    },
    cotdClappers() {
      const s = get(); if (!s.cotd) return [];
      return (s.cotd.clappedBy || []).map(id => { const x = s.users[id] || {}; return { name: x.name || "Someone", photoURL: x.photoURL || null }; });
    },
    addZbFact({ title, body, imageURL, linkURL }) {
      const s = get();
      s.zbFacts.push({ id: uid(), title, body, imageURL: imageURL || null, linkURL: linkURL || null, createdAt: now() });
      save();
    },
    deleteZbFact(id) { const s = get(); s.zbFacts = s.zbFacts.filter(f => f.id !== id); save(); },

    /* --- bug reports --- */
    submitBug(text, imageURL) {
      const s = get(); const me = this.currentUser(); if (!me) return { error: "Not signed in" };
      (s.bugReports = s.bugReports || []).push({ id: uid(), userId: me.id, name: me.name, email: me.email || "", text, imageURL: imageURL || null, createdAt: now(), resolved: false });
      Object.values(s.users).filter(x => x.isAdmin && x.id !== me.id).forEach(a => notify(a.id, "bug", `${me.name} reported a bug 🐞`));
      save(); return { ok: true };
    },
    bugReportsLoad() { return Promise.resolve(); },
    bugReports() { return (get().bugReports || []).slice().sort((a, b) => b.createdAt - a.createdAt); },
    resolveBug(id) { const s = get(); s.bugReports = (s.bugReports || []).filter(b => b.id !== id); save(); return Promise.resolve(); },

    /* --- announcement (admin pinned post) --- */
    announcement() { return get().announcement; },
    toggleAnnouncementGoal() {
      const s = get(); const me = this.currentUser(); if (!s.announcement || !me) return;
      s.announcement.goaledBy = s.announcement.goaledBy || [];
      const i = s.announcement.goaledBy.indexOf(me.id);
      if (i >= 0) { s.announcement.goaledBy.splice(i, 1); s.announcement.goals = (s.announcement.goals || 0) - 1; }
      else { s.announcement.goaledBy.push(me.id); s.announcement.goals = (s.announcement.goals || 0) + 1; }
      save();
    },
    announcementGoalers() {
      const s = get(); if (!s.announcement) return [];
      return (s.announcement.goaledBy || []).map(id => { const x = s.users[id] || {}; return { name: x.name || "Someone", photoURL: x.photoURL || null }; });
    },
    setAnnouncement(text) {
      const s = get(); const me = this.currentUser();
      s.announcement = { text, byName: me ? me.name : "Admin", createdAt: now(), goals: 0, goaledBy: [] };
      Object.values(s.users).forEach(u => { if (!me || u.id !== me.id) { (s.notifications = s.notifications || []).push({ id: uid(), userId: u.id, type: "announcement", text: "📢 " + text.slice(0, 90), fromName: me ? me.name : "Admin", createdAt: now(), read: false }); } });
      save();
    },
    clearAnnouncement() { const s = get(); s.announcement = null; save(); },

    /* --- tournament (admin) --- */
    tournament() { return get().tournament; },
    setTournamentWinner(code) {
      const s = get();
      s.tournament.winnerCountryCode = code;
      Object.values(s.users).forEach(u => {
        if (u.country && u.country.code === code) u.points += 2500;
      });
      save();
    },

    /* --- danger: reset demo data --- */
    resetDemo() { localStorage.removeItem(KEY); state = null; }
  };

  if (!window.ZB_LIVE) window.ZB_STORE = Store; // in live mode, store-firebase.js owns ZB_STORE
})();
