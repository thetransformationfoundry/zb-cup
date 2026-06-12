/* ============================================================
   ZB Cup — App logic & UI
   Plain JavaScript, no framework. Renders screens into #app and
   talks to ZB_STORE. Swap ZB_STORE's internals for Firebase later.
   ============================================================ */
(function () {
  const S = window.ZB_STORE;
  const root = document.getElementById("app");

  /* ---------------- tiny helpers ---------------- */
  const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const esc = (s) => (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initials = (n) => (n || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const timeAgo = (t) => { const s = (Date.now() - t) / 1000; if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m"; if (s < 86400) return Math.floor(s / 3600) + "h"; return Math.floor(s / 86400) + "d"; };

  function avatar(user, cls = "") {
    if (user && user.photoURL) return `<span class="avatar ${cls}"><img src="${user.photoURL}" style="width:100%;height:100%;object-fit:cover"></span>`;
    return `<span class="avatar ${cls}">${initials(user ? user.name : "?")}</span>`;
  }
  function flag(team, cls = "") {
    if (!team) return "";
    return `<img class="flag ${cls}" src="${window.ZB_FLAG(team.code)}" alt="${esc(team.name)}" loading="lazy">`;
  }
  function toast(msg) {
    document.querySelectorAll(".toast").forEach(t => t.remove());
    const t = h(`<div class="toast">${esc(msg)}</div>`); document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }
  function modal(html) {
    const bg = h(`<div class="modal-bg"><div class="modal">${html}</div></div>`);
    bg.addEventListener("click", e => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
    return bg;
  }
  function readImage(file, cb, max) {
    if (!file) return cb(null);
    max = max || 320;
    const r = new FileReader();
    r.onload = () => {
      // downscale to keep photos small (fits Firestore + localStorage)
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        try { cb(c.toDataURL("image/jpeg", 0.75)); } catch (e) { cb(r.result); }
      };
      img.onerror = () => cb(r.result);
      img.src = r.result;
    };
    r.readAsDataURL(file);
  }
  // Falling soccer balls + confetti for a moment of victory 🎉
  function celebrate() {
    const layer = h(`<div class="celebrate-layer"></div>`);
    document.body.appendChild(layer);
    const colors = ["#0079BD", "#E8B923", "#1E9E5A", "#D64545", "#ffffff"];
    for (let i = 0; i < 30; i++) {
      const isBall = i % 3 === 0;
      const size = isBall ? 16 + Math.random() * 20 : 8 + Math.random() * 8;
      const el = document.createElement("div");
      el.className = "cele-item";
      el.style.left = (Math.random() * 100) + "%";
      el.style.setProperty("--r", (Math.random() * 900 - 450) + "deg");
      el.style.animationDuration = (2 + Math.random() * 2) + "s";
      el.style.animationDelay = (Math.random() * 0.5) + "s";
      if (isBall) {
        el.innerHTML = `<span style="display:block;font-size:${size}px;line-height:1;color:#1A1A1A">${I.ball}</span>`;
      } else {
        el.style.width = size + "px"; el.style.height = (size * 0.55) + "px";
        el.style.background = colors[i % colors.length]; el.style.borderRadius = "2px";
        el.style.boxShadow = "0 0 0 1px rgba(0,0,0,.04)";
      }
      layer.appendChild(el);
    }
    setTimeout(() => layer.remove(), 4500);
  }
  // Shared explainer so people understand they author the question AND the answers.
  function factsIntro() {
    return `<div class="banner" style="display:block;font-weight:400;line-height:1.5">
      <b>How this works:</b> for each fact you write a <b>question about yourself</b>, type <b>4 possible answers</b>, then tap the circle next to the one that's <b>true</b>. Colleagues see your question and the 4 options and try to pick the right answer.
      <div style="margin-top:8px;font-size:13px;opacity:.85"><b>Example</b> — Question: “Which country was I born in?” → answers: <b>Italy ✓</b>, Spain, Japan, Brazil</div>
      <div style="margin-top:8px;font-size:13px;font-weight:600">🔒 Choose carefully — once you save all 3, your fun facts lock and can't be changed.</div>
    </div>`;
  }
  const OPTS_LABEL = `Possible answers — tap the circle ⦿ next to the TRUE one`;

  // overlapping avatars of the 3 most-recent goalers (for the chat "N Goals given" row)
  function goalPreview(list) {
    return list.slice(-3).reverse().map((u, i) => u.photoURL
      ? `<img src="${esc(u.photoURL)}" style="width:26px;height:26px;border-radius:50%;object-fit:cover;border:2px solid #fff;margin-left:${i ? -8 : 0}px">`
      : `<span style="width:26px;height:26px;border-radius:50%;background:var(--zb-blue-soft);color:var(--zb-blue);display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;border:2px solid #fff;margin-left:${i ? -8 : 0}px">${initials(u.name)}</span>`).join("");
  }

  // crown badge: 👑 + count, shown the same way everywhere (times your facts were guessed)
  function crownBadge(n) {
    if (!n) return "";
    return `<span class="crown" title="Times colleagues have guessed your fun facts">${I.crown}</span><span style="color:var(--gold);font-weight:700;font-size:13px;margin-left:1px">${n}</span>`;
  }

  /* ---- match supporters ("who predicted each team to win") ---- */
  // One cluster: overlapping avatars + count for a side, tappable for the full list.
  function supGroup(f, side, list, title) {
    const n = list.length;
    const label = side === "draw" ? "Draw" : esc((side === "A" ? f.teamA : f.teamB).name);
    const faces = n
      ? `<span class="sup-faces">${goalPreview(list)}</span><span class="sup-count">${n}</span>`
      : `<span class="sup-none muted">—</span>`;
    const el = h(`<button class="sup-col" data-side="${side}" type="button">
        <span class="sup-label muted">${label}</span>
        <span class="sup-faces-row">${faces}</span>
      </button>`);
    if (n) el.onclick = () => showPeopleList(title + ` (${n})`, list);
    else el.disabled = true;
    return el;
  }
  // grey placeholder circles, so the layout doesn't jump while a fixture's picks load
  function supSkeleton(f) {
    const col = (label) => `<div class="sup-col" style="cursor:default"><span class="sup-label muted">${label}</span><span class="sup-faces-row"><span class="sup-skel"></span><span class="sup-skel"></span></span></div>`;
    return `<div class="sup-title muted">Who's backing who</div><div class="supporters">${col(esc(f.teamA.name))}${col("Draw")}${col(esc(f.teamB.name))}</div>`;
  }
  // Fill a card's supporters wrapper with real avatars. Loads each fixture's picks
  // only when the card scrolls into view (keeps Firestore reads low on the free plan).
  function setupSupporters(wrap, f) {
    const paint = () => {
      const g = S.fixturePredictors(f.id);
      if (!g) { wrap.innerHTML = supSkeleton(f); return; }
      const total = g.A.length + g.draw.length + g.B.length;
      if (!total) { wrap.innerHTML = `<div class="sup-empty muted">No predictions yet — be the first!</div>`; return; }
      wrap.innerHTML = `<div class="sup-title muted">Who's backing who</div><div class="supporters"></div>`;
      const row = wrap.querySelector(".supporters");
      row.appendChild(supGroup(f, "A", g.A, "Backing " + f.teamA.name));
      row.appendChild(supGroup(f, "draw", g.draw, "Predicting a draw"));
      row.appendChild(supGroup(f, "B", g.B, "Backing " + f.teamB.name));
    };
    const load = () => {
      if (S.fixturePredictors(f.id)) { paint(); return; }
      wrap.innerHTML = supSkeleton(f);
      S.loadFixturePredictors(f.id).then(paint);
    };
    if (S.fixturePredictors(f.id)) { paint(); return; }   // cached already
    wrap.innerHTML = supSkeleton(f);
    if (typeof IntersectionObserver === "function") {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { io.disconnect(); load(); } });
      }, { rootMargin: "150px" });
      io.observe(wrap);
    } else { load(); }
  }

  /* ---- finished-match winners (gold ring = right winner +5, 👑 = perfect score +10) ---- */
  function winFace(u, perfect, i) {
    const ml = i ? "margin-left:-8px;" : "";
    const ring = "box-shadow:0 0 0 2px var(--gold);";
    const inner = u.photoURL
      ? `<img src="${esc(u.photoURL)}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;border:2px solid #fff;${ring}${ml}">`
      : `<span style="width:30px;height:30px;border-radius:50%;background:var(--zb-blue-soft);color:var(--zb-blue);display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;${ring}${ml}">${initials(u.name)}</span>`;
    return `<span class="win-face">${inner}${perfect ? `<span class="win-crown">${I.crown}</span>` : ""}</span>`;
  }
  function winSkeleton() {
    return `<div class="sup-title muted">Who called it 🏆</div><div class="sup-faces-row" style="justify-content:flex-start"><span class="sup-skel"></span><span class="sup-skel"></span><span class="sup-skel"></span></div>`;
  }
  function showWinnersList(f, winners, isPerfect) {
    const rows = winners.map(u => `<div class="row" style="gap:10px;padding:9px 0;border-bottom:1px solid var(--line)">
      ${avatar(u, "sm")}<span style="font-weight:600;flex:1">${esc(u.name)}</span>
      <span class="chip ${isPerfect(u) ? "gold" : "good"}">${isPerfect(u) ? "+10 " + I.crown : "+5"}</span></div>`).join("");
    const bg = modal(`<h3>🏆 Who called it</h3>
      <p class="muted" style="font-size:13px;margin:0 0 10px">${esc(f.teamA.name)} ${f.result.scoreA}–${f.result.scoreB} ${esc(f.teamB.name)} · gold ring = right winner (+5), 👑 = perfect score (+10)</p>
      <div style="max-height:55vh;overflow-y:auto">${rows}</div>
      <button class="btn" id="x" style="margin-top:14px">Close</button>`);
    bg.querySelector("#x").onclick = () => bg.remove();
  }
  function setupFinishedWinners(wrap, f) {
    const paint = () => {
      const g = S.fixturePredictors(f.id);
      if (!g || !f.result) { wrap.innerHTML = winSkeleton(); return; }
      const r = f.result;
      const realWinner = r.scoreA > r.scoreB ? "A" : r.scoreB > r.scoreA ? "B" : "draw";
      const isPerfect = u => u.scoreA === r.scoreA && u.scoreB === r.scoreB;
      const winners = (g[realWinner] || []).slice().sort((a, b) => (isPerfect(b) ? 1 : 0) - (isPerfect(a) ? 1 : 0));
      if (!winners.length) { wrap.innerHTML = `<div class="sup-title muted">Who called it 🏆</div><div class="sup-empty muted">Nobody predicted this result.</div>`; return; }
      const preview = winners.slice(0, 6).map((u, i) => winFace(u, isPerfect(u), i)).join("");
      wrap.innerHTML = `<div class="sup-title muted">Who called it 🏆</div>
        <button class="win-row" type="button"><span class="win-faces">${preview}</span><span class="sup-count">${winners.length} ${winners.length === 1 ? "got it" : "got it"}</span></button>`;
      wrap.querySelector(".win-row").onclick = () => showWinnersList(f, winners, isPerfect);
    };
    const load = () => { if (S.fixturePredictors(f.id)) { paint(); return; } wrap.innerHTML = winSkeleton(); S.loadFixturePredictors(f.id).then(paint); };
    if (S.fixturePredictors(f.id)) { paint(); return; }
    wrap.innerHTML = winSkeleton();
    if (typeof IntersectionObserver === "function") {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { io.disconnect(); load(); } });
      }, { rootMargin: "150px" });
      io.observe(wrap);
    } else { load(); }
  }

  /* ---------------- icons ---------------- */
  const I = {
    ball: '<svg viewBox="0 0 243.596 243.596" width="1em" height="1em" fill="currentColor" style="vertical-align:-0.15em"><path d="M129,7.2A121.8,121.8,0,1,0,250.8,129,121.69,121.69,0,0,0,129,7.2Zm8.7,42.629,26.97-18.777a103.707,103.707,0,0,1,48.864,36.9l-8.337,29-11.817,4.06-55.679-39Zm43.644,64.017L161.55,172.5H96.3L76.654,113.846,129,77.161ZM93.329,31.052,120.3,49.829v12.18l-55.534,39-11.817-4.2L44.609,67.954A103.674,103.674,0,0,1,93.329,31.052ZM73.319,190.767l-26.462,2.247a103.171,103.171,0,0,1-22.112-63.147l22.62-16.53,12.035,4.2L80.134,178.95Zm82.286,39.149A103.764,103.764,0,0,1,129,233.4a110.554,110.554,0,0,1-26.607-3.48l-14.137-30.3,5.582-9.57H164.16l5.582,9.57Zm55.534-36.684-26.462-2.32-6.96-11.817,20.88-61.552,12.035-4.2,22.62,16.53A104.283,104.283,0,0,1,211.139,193.232Z" transform="translate(-7.2 -7.2)"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.9 6.7 19.3l1.1-5.9L3.4 9.3l6-.8z"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 4h10v5a5 5 0 01-10 0zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M9 19h6M12 14v5"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H8l-4 4V5a2 2 0 012-2h13a2 2 0 012 2z"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>',
    crown: '<svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" style="vertical-align:-2px"><path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="14" height="14"><path d="M5 13l4 4L19 7"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"/></svg>',
    clap: '<svg viewBox="0 0 181.293 181.18" width="1em" height="1em" fill="currentColor" style="vertical-align:-0.15em"><path d="M144.952,143.532,93.417,173.439c-21.72,12.605-48.612,9.855-66.124-8.538A53.054,53.054,0,0,1,.754,127.512c-2.776-17.34,2.147-34.249,14.228-46.45L38.419,57.389c4.172-4.213,11.094-4.432,15.055.57,1.7,2.151,2.931,5.219,4.241,8.449L81.094,43.087a13.413,13.413,0,0,1,12.912-3.518c4.459,1.229,7.354,4.532,9.411,9.445l4.767-4.768c5.75-5.751,13.761-6.82,19.369-1.79,6.281,5.632,5.191,14.683-.378,20.469a16.321,16.321,0,0,1,9.248,9.272c6.87-5.787,16.259-4.993,20.913,2.073,4.216,6.4,1.856,15.41-6.031,19.605,4.139,2.888,6.567,6.7,6.557,11.284a13.605,13.605,0,0,1-6.21,11.384l-7.1,4.373c3.639,2.714,6.147,6.224,6.4,10.282.276,4.462-1.414,9.675-6,12.334M87.97,121.037,129,80.044c1.791-3.294,1.584-7.232-.862-9.447a7.179,7.179,0,0,0-8.767-.263L78.356,111.4c-1.266.427-4.127.523-4.467-.54a12,12,0,0,1-.035-3.953l50.5-50.455c1.992-3.477,1.385-7.789-1.348-9.718a7.015,7.015,0,0,0-9.315.992l-49.466,49.5c-1.148.31-3.567.433-4.209-.253s-.785-2.27-.758-3.7L95.267,57.283a7.015,7.015,0,0,0,0-9.91,6.915,6.915,0,0,0-9.8.161L31.023,102c-1.344.4-3.7.107-4.379-.719s-.47-3.356.287-4.111L48.139,76.021A11.153,11.153,0,0,0,51.2,67.593,9.612,9.612,0,0,0,45.218,59.8L18.56,86.507a47.008,47.008,0,0,0,.287,63.926c17.676,18.917,47.877,19.987,66.29,1.646l43.534-43.36a7.206,7.206,0,0,0,.216-9.729c-2.254-2.305-6.6-3.4-9.529-.473L92.473,125.355c-.878.876-4.59.636-4.57-.464Zm47.235-25.162L150.092,87.1c3.684-2.172,3.881-7.828,1.167-10.479-4.741-4.63-13.7-.145-17.6,7.18l-6.031,6.93Zm-17.467,32.888,31.127-17.883c3.553-2.042,3.28-7.787,1.122-10.07-4.6-4.862-12.658-.156-12.883,2.163-.275,2.822-1.738,7.978-3.9,9.967ZM49.281,171.856c13.56,5.6,28.2,3.5,40.8-3.783l51.88-29.974c2.916-2.736,3.607-6.831,1.5-9.816a7.1,7.1,0,0,0-8.915-1.777L99.094,146.947,87.436,158.423c-10.061,9.9-23.569,12.882-38.155,13.433"/><path d="M159.923,35.149c-.918.351-3.386.586-4.28.107-1.073-.575-.779-3.384-.151-4.606L176.169,9.932c.927-.254,3.441-.334,4.241.214.96.657.786,3.122.234,4.26Z"/><path d="M74.551,23.29a5.549,5.549,0,0,1-.643,4.235c-.731.833-4.157.347-4.64-.771L59.647,4.464c-.474-1.1.75-3.958,1.784-4.371s3.443.615,3.944,1.785Z"/><path d="M146.709,32.473c-.582,1.166-3.188,2.234-4.195,1.78s-2.121-3.184-1.607-4.217l9.39-18.875c.533-1.071,3.372-1.989,4.4-1.443s1.833,3.081,1.227,4.295Z"/><path d="M61.8,29.229c.806,1,.47,3.93-.4,4.592s-3.647.411-4.375-.5L44.532,17.716c-.636-.8-.633-3.157-.22-4.033.5-1.052,3.883-1.347,4.648-.4Z"/><path d="M164.461,49.391c-1.02.612-3.875.325-4.6-.5s-.316-3.893.667-4.483l16.284-9.769c1.051-.631,4.186.617,4.435,1.727a4.824,4.824,0,0,1-1.674,3.95Z"/><path d="M87.574,24.509c0,1.277-1.463,3.474-2.528,3.666-1.473.266-3.8-1.693-3.8-3.261l.01-18.5c0-1.118,1.782-3.27,2.857-3.373,1.3-.126,3.457,1.941,3.457,3.374Z"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M3 8a2 2 0 012-2h2l1.5-2h7L18 6h2a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><circle cx="12" cy="12.5" r="3.5"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 00-1.7-1l-.3-2.6H9.4l-.3 2.6a7 7 0 00-1.7 1l-2.3-1-2 3.4L5 11a7 7 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.7 1l.3 2.6h5.2l.3-2.6a7 7 0 001.7-1l2.3 1 2-3.4-2-1.5a7 7 0 00.1-1z"/></svg>',
    zb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 8l8 8M16 8l-8 8"/></svg>'
  };

  /* ---------------- app state ---------------- */
  let tab = "matches";
  let matchFilter = "upcoming";
  let expandedReplies = new Set(); // chat posts whose replies are expanded
  let pendingChatPhoto = null;     // photo attached to the chat composer, before posting
  let subScreen = null;            // active "More" sub-screen (so live refreshes don't bounce us back)
  let annExpanded = false;         // is the pinned announcement expanded?
  let onb = null; // onboarding working state

  /* =====================================================
     ENTRY
  ===================================================== */
  function renderLoading() {
    root.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;color:var(--muted);font-family:var(--font)">Loading…</div>`;
  }

  function render() {
    const u = S.currentUser();
    // 1) Live email mode, not signed in yet → email login (or forgot-password) step
    if (S.emailLogin && !S.authed()) {
      if (!onb || !["email", "forgot"].includes(onb.step)) onb = { step: "email" };
      return renderOnboarding();
    }
    // 1b) Signed in but profile not confirmed loaded yet → WAIT on a loading screen.
    // (A slow profile load must never be mistaken for a brand-new user, or onboarding
    //  could overwrite an existing player's points/country.)
    if (S.emailLogin && S.authed() && !u && S.profileKnown && !S.profileKnown()) {
      if (S.reloadMe && !window.__zbProfileReloading) {
        window.__zbProfileReloading = true;
        S.reloadMe().then(() => { window.__zbProfileReloading = false; render(); });
      }
      return renderLoading();
    }
    // 2) Signed in (or demo) but no profile → name/identity → photo → facts → country
    if (!u) {
      const first = S.emailLogin ? "name" : "identity";
      const valid = ["name", "identity", "photo", "facts", "country"];
      if (!onb || !valid.includes(onb.step)) onb = { step: first };
      return renderOnboarding();
    }
    // 3) Profile exists but country not locked → continue onboarding
    if (!u.country) {
      const valid = ["photo", "facts", "country"];
      if (!onb || !valid.includes(onb.step)) onb = { step: "photo" };
      return renderOnboarding();
    }
    // 4) Fully onboarded
    renderApp();
  }

  /* =====================================================
     ONBOARDING
  ===================================================== */
  function dots(active) {
    const order = S.emailLogin ? ["name", "photo", "facts", "country"] : ["identity", "photo", "facts", "country"];
    return `<div class="dots">${order.map(s => `<i class="${s === active ? "on" : ""}"></i>`).join("")}</div>`;
  }

  function renderOnboarding() {
    const step = onb.step;
    if (step === "email") return onbEmail();
    if (step === "forgot") return onbForgot();
    if (step === "identity") return onbIdentity();
    if (step === "name") return onbName();
    if (step === "photo") return onbPhoto();
    if (step === "facts") return onbFacts();
    if (step === "country") return onbCountry();
  }

  function onbEmail() {
    root.innerHTML = "";
    const v = h(`<div class="onb">
      <svg class="hero-logo"></svg>
      <div class="grow">
        <h2>Welcome to ZB Cup</h2>
        <p class="sub">Play along with the 2026 World Cup with your ZB colleagues. <b>New here?</b> Create an account. <b>Already joined?</b> Sign in.</p>
        <label class="fld">Work email</label>
        <input class="input" id="o-email" type="email" inputmode="email" placeholder="you@zimmerbiomet.com" autocomplete="email">
        <label class="fld">Password</label>
        <input class="input" id="o-pass" type="password" placeholder="At least 6 characters" autocomplete="current-password">
        <button class="btn ghost" id="o-forgot" style="width:auto;padding:8px 0;margin-top:4px;font-size:14px">Forgot password?</button>
      </div>
      <div>
        <button class="btn" id="o-signup" style="background:#141414">Create account</button>
        <button class="btn secondary" id="o-signin" style="margin-top:8px">Sign in</button>
        <div class="center" style="margin-top:10px"><button class="chip" id="o-rules" style="cursor:pointer;font-size:13px;padding:7px 14px">📖 How to play</button></div>
      </div>
    </div>`);
    v.querySelector(".hero-logo").outerHTML = logoSVG("hero-logo");
    root.appendChild(v);
    const signupBtn = root.querySelector("#o-signup");
    const signinBtn = root.querySelector("#o-signin");
    root.querySelector("#o-rules").onclick = showRulesModal;
    root.querySelector("#o-forgot").onclick = () => {
      onb = { step: "forgot", email: root.querySelector("#o-email").value.trim() };
      render();
    };
    const run = (mode) => {
      const email = root.querySelector("#o-email").value.trim();
      const pass = root.querySelector("#o-pass").value;
      if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Please enter a valid email");
      if (pass.length < 6) return toast("Password must be at least 6 characters");
      signupBtn.disabled = signinBtn.disabled = true;
      const busy = mode === "signin" ? signinBtn : signupBtn;
      const label = busy.textContent; busy.textContent = "Please wait…";
      const action = mode === "signin" ? S.signInEmail(email, pass) : S.createEmail(email, pass);
      const finish = () => { onb = null; render(); };
      action
        .then(() => (S.reloadMe ? S.reloadMe().then(finish) : finish()))
        .catch(err => {
          signupBtn.disabled = signinBtn.disabled = false; busy.textContent = label;
          const code = (err && err.code) || "";
          if (code === "auth/email-already-in-use") toast("That email already has an account — tap Sign in instead.");
          else if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(code)) toast("Wrong email or password. New here? Tap Create account.");
          else if (code === "auth/weak-password") toast("Password too weak — use at least 6 characters.");
          else if (code === "auth/invalid-email") toast("That email doesn't look right.");
          else { console.error(err); toast("Couldn't sign in — please try again."); }
        });
    };
    signupBtn.onclick = () => run("signup");
    signinBtn.onclick = () => run("signin");
  }

  function onbForgot() {
    root.innerHTML = "";
    const mail = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--zb-blue)" stroke-width="1.7" width="72" height="72"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/></svg>`;
    const v = h(`<div class="onb">
      <div class="grow">
        <button class="btn ghost" id="o-back" style="width:auto;padding:6px 10px 6px 0;margin-bottom:6px">‹ Back to sign in</button>
        <h2>Reset your password</h2>
        <p class="sub">Enter your work email and we'll send you a link to set a new password.</p>
        <label class="fld">Work email</label>
        <input class="input" id="o-email" type="email" inputmode="email" placeholder="you@zimmerbiomet.com" autocomplete="email" value="${esc((onb && onb.email) || "")}">
      </div>
      <div id="o-foot"><button class="btn" id="o-send">Send reset link</button></div>
    </div>`);
    root.appendChild(v);
    root.querySelector("#o-back").onclick = () => { onb = { step: "email" }; render(); };
    const btn = root.querySelector("#o-send");
    btn.onclick = () => {
      const email = root.querySelector("#o-email").value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Please enter a valid email");
      btn.disabled = true; btn.textContent = "Sending…";
      const showSent = () => {
        v.querySelector(".grow").innerHTML = `
          <div class="center" style="margin-top:36px">
            <div style="margin-bottom:18px">${mail}</div>
            <h2 style="margin-bottom:8px">Check your email 📬</h2>
            <p class="sub">If an account exists for <b>${esc(email)}</b>, we've sent a link to reset your password.</p>
            <p class="muted" style="font-size:14px">Be sure to check your <b>junk / spam</b> folder too — it can land there. Tap the link, choose a new password, then come back and sign in.</p>
          </div>`;
        v.querySelector("#o-foot").innerHTML = `<button class="btn" id="o-done">Back to sign in</button>`;
        v.querySelector("#o-done").onclick = () => { onb = { step: "email" }; render(); };
      };
      // Show the same confirmation whether or not the email exists (don't reveal accounts).
      S.resetPassword(email).then(showSent).catch(showSent);
    };
  }

  function onbName() {
    root.innerHTML = "";
    const v = h(`<div class="onb">
      <div class="grow">
        <h2>What's your name?</h2>
        <p class="sub">You're signed in as <b>${esc(S.pendingEmail() || "")}</b>. This is how colleagues will see you on the leaderboard and in chat.</p>
        <label class="fld">Your name</label>
        <input class="input" id="o-name" placeholder="e.g. Sam Jansen" autocomplete="name">
      </div>
      <div>${dots("name")}<button class="btn" id="o-next">Continue</button></div>
    </div>`);
    root.appendChild(v);
    root.querySelector("#o-next").onclick = () => {
      const name = root.querySelector("#o-name").value.trim();
      if (!name) return toast("Please enter your name");
      S.signUp({ name });
      onb = { step: "photo" }; render();
    };
  }

  function onbIdentity() {
    root.innerHTML = "";
    const v = h(`<div class="onb">
      <svg class="hero-logo">${"" /*logo injected below*/}</svg>
      <div class="grow">
        <h2>Welcome to ZB Cup</h2>
        <p class="sub">Play along with the 2026 World Cup with your ZB colleagues. Let's get you set up.</p>
        <label class="fld">Your name</label>
        <input class="input" id="o-name" placeholder="e.g. Sam Jansen" autocomplete="name">
        <label class="fld">Work email</label>
        <input class="input" id="o-email" type="email" placeholder="you@zimmerbiomet.com" autocomplete="email">
        <p class="muted center" style="font-size:12px;margin-top:18px">No password needed — just your name and email.</p>
        <div class="center" style="margin-top:14px"><button class="chip" id="o-rules" style="cursor:pointer;font-size:13px;padding:7px 14px">📖 How to play</button></div>
      </div>
      <div>${dots("identity")}<button class="btn" id="o-next">Continue</button></div>
    </div>`);
    v.querySelector(".hero-logo").outerHTML = logoSVG("hero-logo");
    root.appendChild(v);
    root.querySelector("#o-rules").onclick = showRulesModal;
    root.querySelector("#o-next").onclick = () => {
      const name = root.querySelector("#o-name").value.trim();
      const email = root.querySelector("#o-email").value.trim();
      if (!name) return toast("Please enter your name");
      if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Please enter a valid email");
      S.signUp({ name, email });
      onb.step = "photo"; render();
    };
  }

  function onbPhoto() {
    const u = S.currentUser();
    root.innerHTML = "";
    const v = h(`<div class="onb">
      <div class="grow">
        <h2>Add a photo</h2>
        <p class="sub">So colleagues recognise you on the leaderboard and in chat.</p>
        <div class="photo-pick">
          <span id="o-prev">${avatar(u, "lg")}</span>
          <input type="file" accept="image/*" id="o-file" style="display:none">
          <input type="file" accept="image/*" capture="user" id="o-cam" style="display:none">
          <div class="row" style="gap:10px">
            <button class="btn secondary btn-pill" id="o-upload">Upload photo</button>
            <button class="btn secondary btn-pill" id="o-take">${I.camera} Take photo</button>
          </div>
        </div>
      </div>
      <div>${dots("photo")}
        <button class="btn" id="o-next">Continue</button>
        <button class="btn ghost" id="o-skip" style="margin-top:6px">Skip for now</button>
      </div>
    </div>`);
    root.appendChild(v);
    const setPhoto = (data) => { S.updateProfile({ photoURL: data }); root.querySelector("#o-prev").innerHTML = avatar(S.currentUser(), "lg"); };
    v.querySelector("#o-upload").onclick = () => v.querySelector("#o-file").click();
    v.querySelector("#o-take").onclick = () => v.querySelector("#o-cam").click();
    v.querySelector("#o-file").onchange = e => readImage(e.target.files[0], d => d && setPhoto(d));
    v.querySelector("#o-cam").onchange = e => readImage(e.target.files[0], d => d && setPhoto(d));
    v.querySelector("#o-next").onclick = () => { onb.step = "facts"; render(); };
    v.querySelector("#o-skip").onclick = () => { onb.step = "facts"; render(); };
  }

  function onbFacts() {
    const me = S.currentUser();
    const existing = S.factsFor(me.id);
    root.innerHTML = "";
    const v = h(`<div class="onb">
      <div class="grow">
        <h2>3 fun facts about you</h2>
        <p class="sub">Guess colleagues' facts for points. Each time someone guesses one of YOUR facts, you earn a 👑 (you've been figured out!). Set good ones below, then go guessing. Make them surprising.</p>
        ${factsIntro()}
        <div id="ff"></div>
      </div>
      <div>${dots("facts")}
        <button class="btn" id="o-next">Continue</button>
        <button class="btn ghost" id="o-skip" style="margin-top:6px">Skip — I'll do this later</button>
      </div>
    </div>`);
    root.appendChild(v);
    const ff = v.querySelector("#ff");
    for (let i = 0; i < 3; i++) {
      const ex = existing[i] || { question: "", options: ["", "", "", ""], answerIndex: 0 };
      ff.appendChild(h(`<div class="card" style="margin-bottom:12px">
        <label class="fld" style="margin-top:0">Fact ${i + 1} — question</label>
        <input class="input q" placeholder="e.g. Which country was I born in?" value="${esc(ex.question)}">
        <label class="fld">${OPTS_LABEL}</label>
        ${[0, 1, 2, 3].map(o => `<div class="row" style="margin-bottom:6px">
          <input type="radio" name="ans${i}" ${ex.answerIndex === o ? "checked" : ""} value="${o}" title="Mark as the correct answer" style="width:20px;height:20px;flex:0 0 auto;accent-color:var(--zb-blue)">
          <input class="input opt-in" data-o="${o}" placeholder="Answer ${o + 1}" value="${esc(ex.options[o] || "")}">
        </div>`).join("")}
      </div>`));
    }
    const collect = (requireAll) => {
      const blocks = ff.children; const facts = [];
      for (let i = 0; i < 3; i++) {
        const b = blocks[i];
        const q = b.querySelector(".q").value.trim();
        const opts = [...b.querySelectorAll(".opt-in")].map(x => x.value.trim());
        const ans = +b.querySelector(`input[name="ans${i}"]:checked`).value;
        if (requireAll && (!q || opts.some(o => !o))) { toast(`Complete fact ${i + 1} fully`); return null; }
        if (q && !opts.some(o => !o)) facts.push({ question: q, options: opts, answerIndex: ans });
      }
      return facts;
    };
    v.querySelector("#o-next").onclick = () => { const f = collect(true); if (f) { S.setMyFacts(f); onb.step = "country"; render(); } };
    v.querySelector("#o-skip").onclick = () => { const f = collect(false); if (f && f.length) S.setMyFacts(f); onb.step = "country"; render(); };
  }

  function onbCountry() {
    root.innerHTML = "";
    const v = h(`<div class="onb">
      <div class="grow">
        <h2>Pick your country</h2>
        <p class="sub">Support a nation in the World Cup. If they win it all, you earn a massive <b>2,500 points</b> — but once you pick, it's locked. Choose wisely!</p>
        <input class="input" id="o-search" placeholder="Search countries…" style="margin-bottom:14px">
        <div class="team-grid" id="o-teams"></div>
      </div>
      ${dots("country")}
    </div>`);
    root.appendChild(v);
    const grid = v.querySelector("#o-teams");
    const draw = (q = "") => {
      grid.innerHTML = "";
      window.ZB_TEAMS.filter(t => t.name.toLowerCase().includes(q.toLowerCase())).forEach(t => {
        const c = h(`<div class="team-card ${t.host ? "host" : ""}">${flag(t)}<span>${esc(t.name)}</span></div>`);
        c.onclick = () => confirmCountry(t);
        grid.appendChild(c);
      });
    };
    draw();
    v.querySelector("#o-search").oninput = e => draw(e.target.value);
  }

  function confirmCountry(team) {
    const bg = modal(`
      <h3>Lock in ${esc(team.name)}?</h3>
      <p>${flag(team, "lg")}<br><br>Your country is <b>locked in</b> for the whole tournament. If ${esc(team.name)} win the World Cup you get <b>2,500 points</b> — but you can't change it later.</p>
      <div class="actions">
        <button class="btn secondary" id="c-cancel">Not yet</button>
        <button class="btn" id="c-ok">Lock it in</button>
      </div>`);
    bg.querySelector("#c-cancel").onclick = () => bg.remove();
    bg.querySelector("#c-ok").onclick = () => {
      S.setCountry(team.code); bg.remove(); onb = null; tab = "matches";
      toast(`${team.name} locked in! Good luck 🍀`); render();
    };
  }

  /* =====================================================
     MAIN APP SHELL
  ===================================================== */
  function renderApp() {
    root.innerHTML = "";
    const shell = h(`<div>
      <div class="appbar">
        <span class="logo">${logoSVG("logo")}</span>
        <span class="spacer"></span>
        <button class="bell" id="my-bell" aria-label="Notifications">${I.bell}<span class="badge" id="my-badge" style="display:none"></span></button>
        <span class="chip points" id="my-pts"></span>
        <span id="my-av"></span>
      </div>
      <div id="view"></div>
      <div class="tabbar">
        ${tabBtn("matches", I.ball, "Matches")}
        ${tabBtn("facts", I.star, "Facts")}
        ${tabBtn("leaderboard", I.trophy, "Ranks")}
        ${tabBtn("chat", I.chat, "Chat")}
        ${tabBtn("more", I.more, "More")}
      </div>
    </div>`);
    root.appendChild(shell);
    const meNow = S.currentUser();
    shell.querySelector("#my-pts").textContent = meNow.points + " pts";
    shell.querySelector("#my-av").innerHTML = avatar(meNow, "sm");
    shell.querySelector("#my-av").style.cursor = "pointer";
    shell.querySelector("#my-av").onclick = () => { tab = "more"; subScreen = null; renderApp(); };
    const unread = S.unreadCount ? S.unreadCount() : 0;
    const badge = shell.querySelector("#my-badge");
    if (unread > 0) { badge.style.display = "flex"; badge.textContent = unread > 9 ? "9+" : unread; }
    shell.querySelector("#my-bell").onclick = openNotifications;
    shell.querySelectorAll(".tab").forEach(b => b.onclick = () => { tab = b.dataset.tab; subScreen = null; renderApp(); });
    // keep an open "More" sub-screen across live refreshes instead of bouncing to the menu
    if (tab === "more" && subScreen) subScreen(); else drawView();
  }
  function tabBtn(id, icon, label) {
    return `<button class="tab ${tab === id ? "active" : ""}" data-tab="${id}">${icon}<span>${label}</span></button>`;
  }
  function setView(node) { const v = root.querySelector("#view"); v.innerHTML = ""; v.appendChild(node); }

  function drawView() {
    if (tab === "matches") return viewMatches();
    if (tab === "facts") return viewFacts();
    if (tab === "leaderboard") return viewLeaderboard();
    if (tab === "chat") return viewChat();
    if (tab === "more") return viewMore();
  }

  /* ---------------- countdown ---------------- */
  function fmtCountdown(ms) {
    if (ms <= 0) return "Kicking off! ⚽";
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (d > 0) return `${d}d ${hh}h ${m}m`;
    if (hh > 0) return `${hh}h ${m}m ${sec}s`;
    return `${m}m ${sec}s`;
  }
  function startCountdown(targetMs) {
    if (window.ZB_TIMER) clearInterval(window.ZB_TIMER);
    const tick = () => {
      const el = document.getElementById("cd");
      if (!el) { clearInterval(window.ZB_TIMER); window.ZB_TIMER = null; return; }
      el.textContent = fmtCountdown(targetMs - Date.now());
    };
    tick();
    window.ZB_TIMER = setInterval(tick, 1000);
  }
  function countdownCard() {
    const now = Date.now();
    const next = S.fixtures().filter(f => new Date(f.kickoff).getTime() > now)
      .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))[0];
    if (!next) return h(`<div style="display:none"></div>`);
    const tbd = next.teamA.tbd || next.teamB.tbd;
    const mc = (S.currentUser().country || {}).code;
    const star = c => (mc && c === mc) ? ` <span style="color:var(--zb-blue)">★</span>` : "";
    const title = tbd
      ? `<div style="font-weight:700;font-size:15px">${esc(next.round)}</div>`
      : `<div class="row" style="justify-content:center;gap:8px;font-weight:700;font-size:15px">${flag(next.teamA)} ${esc(next.teamA.name)}${star(next.teamA.code)} <span class="muted">v</span> ${esc(next.teamB.name)}${star(next.teamB.code)} ${flag(next.teamB)}</div>`;
    const localTime = new Date(next.kickoff).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const card = h(`<div class="card" style="text-align:center;background:linear-gradient(135deg,#ffffff,var(--zb-blue-soft))">
      <div class="muted" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em">Next kick-off</div>
      <div style="margin:8px 0">${title}</div>
      <div id="cd" style="font-size:28px;font-weight:800;color:var(--zb-blue);letter-spacing:-.02em">—</div>
      <div class="muted" style="font-size:12px;margin-top:4px">${esc(localTime)} · your local time</div>
    </div>`);
    startCountdown(new Date(next.kickoff).getTime());
    return card;
  }

  // Tapping the Live chip when nothing is in play → a fun "come back at kickoff" countdown.
  function liveCountdownModal() {
    const t = Date.now();
    const upcoming = S.fixtures()
      .filter(f => !f.teamA.tbd && !f.teamB.tbd && new Date(f.kickoff).getTime() > t)
      .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    const next = upcoming[0];
    if (!next) return toast("No upcoming matches scheduled yet.");
    const nextMs = new Date(next.kickoff).getTime();
    const nextDay = new Date(next.kickoff).toDateString();
    const sameDay = upcoming.filter(f => new Date(f.kickoff).toDateString() === nextDay);
    const dayStr = new Date(next.kickoff).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
    const localTime = new Date(next.kickoff).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
    const bg = modal(`
      <div class="center">
        <div style="font-size:42px;line-height:1;margin-bottom:8px">⏰</div>
        <h3 style="margin-bottom:6px">No matches live right now</h3>
        <p style="margin:0 0 16px">Come back when the whistle blows! Next kick-off in…</p>
        <div id="live-cd" style="font-size:40px;font-weight:800;color:var(--zb-blue);letter-spacing:-.02em;line-height:1">—</div>
        <div class="row" style="justify-content:center;gap:8px;margin:14px 0 4px;font-weight:700;flex-wrap:wrap">${flag(next.teamA)} ${esc(next.teamA.name)} <span class="muted">v</span> ${esc(next.teamB.name)} ${flag(next.teamB)}</div>
        <div class="muted" style="font-size:13px">${esc(localTime)} · your local time</div>
        <div class="chip" style="margin-top:14px">${sameDay.length} match${sameDay.length > 1 ? "es" : ""} on ${esc(dayStr)}</div>
      </div>
      <button class="btn" id="x" style="margin-top:18px">Got it</button>`);
    bg.querySelector("#x").onclick = () => bg.remove();
    const cdEl = bg.querySelector("#live-cd");
    const tick = () => {
      if (!document.body.contains(cdEl)) { clearInterval(iv); return; } // stop when modal closes
      cdEl.textContent = fmtCountdown(nextMs - Date.now());
    };
    tick();
    const iv = setInterval(tick, 1000);
  }

  /* ---------------- MATCHES ---------------- */
  function viewMatches() {
    const all = S.fixtures();
    const now = Date.now();
    const isLive = f => !f.teamA.tbd && !f.teamB.tbd && f.status !== "finished" && new Date(f.kickoff).getTime() <= now;
    const liveGames = all.filter(isLive);
    const soon = all.filter(f => !f.teamA.tbd && !f.teamB.tbd && f.status !== "finished"
      && new Date(f.kickoff).getTime() > now && new Date(f.kickoff).getTime() - now < 36 * 3600 * 1000
      && !S.myPrediction(f.id)).length;
    const wrap = h(`<div class="screen"><h2>Matches</h2><p class="sub">Predict the winner (5 pts) and the exact score (5 pts).</p></div>`);
    wrap.appendChild(countdownCard());

    // live-now nudge (tap jumps to the Live filter)
    if (liveGames.length && matchFilter !== "live") {
      const lb = h(`<div class="banner live-banner"><span class="live-dot solid"></span>${liveGames.length} match${liveGames.length > 1 ? "es" : ""} live now — tap to see who's backing who</div>`);
      lb.onclick = () => { matchFilter = "live"; viewMatches(); };
      wrap.appendChild(lb);
    }
    if (soon > 0) wrap.appendChild(h(`<div class="banner">${I.ball} ${soon} game${soon > 1 ? "s" : ""} to predict in the next day or two.</div>`));

    const myCode = (S.currentUser().country || {}).code;
    const baseFilters = myCode ? ["upcoming", "finished", "all", "myteam"] : ["upcoming", "finished", "all"];
    const labelFor = k => k === "myteam" ? "My team" : k;
    const hasLive = liveGames.length > 0;
    if (matchFilter === "live" && !hasLive) matchFilter = "upcoming";        // don't get stuck on an empty Live view
    if (matchFilter !== "live" && !baseFilters.includes(matchFilter)) matchFilter = "upcoming";
    const chips = h(`<div class="row" style="gap:8px;margin-bottom:14px;flex-wrap:wrap"></div>`);
    // Live chip is ALWAYS shown. Live games → filter to them; otherwise → countdown modal.
    const liveChip = h(`<button class="chip live-chip ${hasLive ? "" : "idle"} ${matchFilter === "live" ? "on" : ""}" type="button"><span class="live-dot"></span>Live</button>`);
    liveChip.onclick = () => { if (hasLive) { matchFilter = "live"; viewMatches(); } else liveCountdownModal(); };
    chips.appendChild(liveChip);
    baseFilters.forEach(k => {
      const b = h(`<button class="chip ${matchFilter === k ? "" : "grey"}" type="button" style="cursor:pointer;text-transform:capitalize">${labelFor(k)}</button>`);
      b.onclick = () => { matchFilter = k; viewMatches(); };
      chips.appendChild(b);
    });
    wrap.appendChild(chips);

    // always list chronologically by kickoff so each date shows all its games together
    let list = all.slice().sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    if (matchFilter === "live") list = list.filter(isLive);
    else if (matchFilter === "upcoming") list = list.filter(f => f.status !== "finished");
    else if (matchFilter === "finished") list = list.filter(f => f.status === "finished");
    else if (matchFilter === "myteam") list = list.filter(f => myCode && (f.teamA.code === myCode || f.teamB.code === myCode));

    if (!list.length) wrap.appendChild(h(`<div class="empty">${I.ball}<p>${matchFilter === "myteam" ? "Your team's fixtures will appear here." : matchFilter === "live" ? "No matches are live right now." : "No matches here yet."}</p></div>`));
    let lastDate = "";
    list.forEach(f => {
      const d = new Date(f.kickoff).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
      if (d !== lastDate) { wrap.appendChild(h(`<div class="section-title">${d}</div>`)); lastDate = d; }
      wrap.appendChild(matchCard(f, null, { supporters: true }));
    });
    setView(wrap);
  }

  function teamSide(team, isMine) {
    const badge = team.tbd
      ? `<span class="flag lg" style="display:inline-flex;align-items:center;justify-content:center;color:var(--muted);font-weight:800">?</span>`
      : flag(team, "lg");
    return `<div class="match-side">${badge}<span>${esc(team.name)}${isMine ? ` <span style="color:var(--zb-blue)" title="Your team">★</span>` : ""}</span></div>`;
  }

  function matchCard(f, onSaved, opts) {
    opts = opts || {};
    const pred = S.myPrediction(f.id);
    const finished = f.status === "finished";
    const tbd = f.teamA.tbd || f.teamB.tbd;
    const kicked = new Date(f.kickoff).getTime() <= Date.now();
    const when = new Date(f.kickoff).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
    const statusChip = finished ? `<span class="chip grey">Full time</span>`
      : kicked ? `<span class="chip gold">In play</span>`
      : `<span class="chip grey">${when}</span>`;
    const head = `${f.round}${f.group ? " · Group " + f.group : ""}${f.venue ? " · " + f.venue : ""}`;
    const myCode = (S.currentUser().country || {}).code;
    const mineA = myCode && f.teamA.code === myCode, mineB = myCode && f.teamB.code === myCode;
    const card = h(`<div class="card" style="${mineA || mineB ? "border-color:var(--zb-blue);box-shadow:0 0 0 1px var(--zb-blue) inset" : ""}">
      <div style="margin-bottom:12px">
        <div class="muted" style="font-size:12px;font-weight:600;margin-bottom:8px">${esc(head)}</div>
        <div class="row" style="gap:6px;flex-wrap:wrap">${mineA || mineB ? `<span class="chip">★ Your team</span>` : ""}${statusChip}</div>
      </div>
      <div class="match-teams">
        ${teamSide(f.teamA, mineA)}
        <div class="vs">${finished ? `<b style="font-size:18px;color:var(--ink)">${f.result.scoreA} – ${f.result.scoreB}</b>` : "vs"}</div>
        ${teamSide(f.teamB, mineB)}
      </div>
      <div class="pred-area"></div>
    </div>`);
    const area = card.querySelector(".pred-area");

    // Supporters: who predicted each team to win. Live games open automatically;
    // upcoming games reveal on tap. Not shown on TBD or finished games.
    if (opts.supporters && !tbd && !finished) {
      const sup = h(`<div class="sup-wrap"></div>`);
      card.querySelector(".match-teams").after(sup);
      setupSupporters(sup, f);
    }
    // Finished games: show who called it (gold ring = right winner, 👑 = perfect score).
    if (opts.supporters && !tbd && finished && f.result) {
      const win = h(`<div class="sup-wrap"></div>`);
      card.querySelector(".match-teams").after(win);
      setupFinishedWinners(win, f);
    }

    if (tbd && !finished) {
      area.appendChild(h(`<div><div class="divider"></div><p class="muted center" style="font-size:13px;margin:0">Teams confirmed after the group stage.</p></div>`));
      if (S.isAdmin()) area.appendChild(adminScoreBtn(f));
      return card;
    }

    if (finished) {
      if (pred) {
        const realWinner = f.result.scoreA > f.result.scoreB ? "A" : f.result.scoreB > f.result.scoreA ? "B" : "draw";
        const winOk = pred.winner === realWinner;
        const scoreOk = pred.scoreA === f.result.scoreA && pred.scoreB === f.result.scoreB;
        const pts = (winOk ? 5 : 0) + (scoreOk ? 5 : 0);
        const headline = pts === 10 ? "Perfect! You nailed the winner and the exact score."
          : pts === 5 ? "Called the winner."
          : "Missed this one.";
        const stateIco = pts ? `<span class="result-ico gold">${I.crown}</span>` : `<span class="result-dot"></span>`;
        const tick = ok => ok ? `<span class="r-yes">${I.check}</span>` : `<span class="r-no"></span>`;
        area.appendChild(h(`<div>
          <div class="divider"></div>
          <div class="result-summary ${pts ? (pts === 10 ? "perfect" : "good") : "miss"}">
            <div class="row between" style="align-items:flex-start">
              <div class="row" style="gap:9px;align-items:flex-start">
                ${stateIco}
                <div>
                  <div style="font-weight:700;font-size:14px">${esc(headline)}</div>
                  <div class="muted" style="font-size:13px;margin-top:4px">Result <b style="color:var(--ink)">${f.result.scoreA}–${f.result.scoreB}</b> · your pick <b style="color:var(--ink)">${pred.scoreA}–${pred.scoreB}</b></div>
                  <div class="row" style="gap:14px;margin-top:7px;font-size:12px">
                    <span class="row" style="gap:5px">${tick(winOk)}<span class="muted">Winner (5)</span></span>
                    <span class="row" style="gap:5px">${tick(scoreOk)}<span class="muted">Exact (5)</span></span>
                  </div>
                </div>
              </div>
              <span class="chip ${pts ? (pts === 10 ? "gold" : "good") : "grey"}" style="flex:0 0 auto">${pts ? "+" + pts + " pts" : "0 pts"}</span>
            </div>
          </div>
        </div>`));
      } else {
        area.appendChild(h(`<div><div class="divider"></div><p class="muted center" style="font-size:13px;margin:0">You didn't predict this one.</p></div>`));
      }
      // admin can re-score
      if (S.isAdmin()) area.appendChild(adminScoreBtn(f));
      return card;
    }

    if (kicked) { // kicked off but no result yet — predictions closed
      area.appendChild(h(`<div><div class="divider"></div><p class="muted center" style="font-size:13px;margin:0">${pred ? "Your pick: " + pred.scoreA + "–" + pred.scoreB + " · locked at kickoff" : "Predictions closed at kickoff."}</p></div>`));
      if (S.isAdmin()) area.appendChild(adminScoreBtn(f));
      return card;
    }

    // upcoming: editable prediction
    let winner = pred ? pred.winner : null;
    let sA = pred ? pred.scoreA : 0, sB = pred ? pred.scoreB : 0;
    const ui = h(`<div>
      <div class="divider"></div>
      <div class="seg">
        <button data-w="A">${esc(f.teamA.name)}</button>
        <button data-w="draw">Draw</button>
        <button data-w="B">${esc(f.teamB.name)}</button>
      </div>
      <div class="score-row">
        <div class="stepper" data-s="A"><button class="dec">–</button><span class="val">${sA}</span><button class="inc">+</button></div>
        <span class="muted">score</span>
        <div class="stepper" data-s="B"><button class="dec">–</button><span class="val">${sB}</span><button class="inc">+</button></div>
      </div>
      <button class="btn sm" style="width:100%;margin-top:14px">${pred ? "Update prediction" : "Save prediction"}</button>
    </div>`);
    const refreshSeg = () => ui.querySelectorAll(".seg button").forEach(b => b.classList.toggle("active", b.dataset.w === winner));
    refreshSeg();
    ui.querySelectorAll(".seg button").forEach(b => b.onclick = () => { winner = b.dataset.w; refreshSeg(); });
    ui.querySelectorAll(".stepper").forEach(st => {
      const valEl = st.querySelector(".val"); const side = st.dataset.s;
      st.querySelector(".inc").onclick = () => { if (side === "A") sA = Math.min(20, sA + 1); else sB = Math.min(20, sB + 1); valEl.textContent = side === "A" ? sA : sB; };
      st.querySelector(".dec").onclick = () => { if (side === "A") sA = Math.max(0, sA - 1); else sB = Math.max(0, sB - 1); valEl.textContent = side === "A" ? sA : sB; };
    });
    ui.querySelector(".btn").onclick = () => {
      if (!winner) return toast("Pick a winner first");
      S.savePrediction(f.id, { winner, scoreA: sA, scoreB: sB });
      toast("Prediction saved ✓"); (onSaved || viewMatches)();
    };
    area.appendChild(ui);
    return card;
  }

  function adminScoreBtn(f) {
    const b = h(`<button class="btn ghost sm" style="width:100%;margin-top:10px">Admin: enter / edit result</button>`);
    b.onclick = () => promptScore(f);
    return b;
  }
  function promptScore(f) {
    const bg = modal(`<h3>Enter result</h3><p>${esc(f.teamA.name)} vs ${esc(f.teamB.name)} — points are awarded automatically.</p>
      <div class="score-row">
        <input class="input" id="rA" type="number" min="0" value="${f.result ? f.result.scoreA : 0}" style="width:70px;text-align:center">
        <span class="muted">–</span>
        <input class="input" id="rB" type="number" min="0" value="${f.result ? f.result.scoreB : 0}" style="width:70px;text-align:center">
      </div>
      <div class="actions" style="margin-top:18px"><button class="btn secondary" id="x">Cancel</button><button class="btn" id="ok">Save & award</button></div>`);
    bg.querySelector("#x").onclick = () => bg.remove();
    bg.querySelector("#ok").onclick = () => {
      const a = +bg.querySelector("#rA").value, b = +bg.querySelector("#rB").value;
      S.scoreFixture(f.id, a, b); bg.remove(); toast("Result saved, points awarded ✓"); renderApp();
    };
  }

  /* ---------------- FUN FACTS ---------------- */
  function viewFacts() {
    const me = S.currentUser();
    const myFacts = S.factsFor(me.id);
    const wrap = h(`<div class="screen"><h2>Fun Facts</h2><p class="sub">Guess colleagues' facts for 20 pts each. You get 3 wrong guesses a day — keep going while you're right!</p></div>`);

    const fotd = S.factOfTheDay();
    if (fotd) {
      wrap.appendChild(h(`<div class="card" style="background:linear-gradient(135deg,#ffffff,var(--zb-blue-soft))">
        <span class="chip" style="margin-bottom:8px">⭐ ZB Fact of the Day</span>
        <div style="font-weight:700;font-size:16px;margin:6px 0 4px">${esc(fotd.title)}</div>
        ${fotd.imageURL ? `<img src="${esc(fotd.imageURL)}" style="width:100%;border-radius:10px;margin:8px 0">` : ""}
        <div class="muted" style="color:var(--ink);font-size:14px">${esc(fotd.body)}</div>
        ${fotd.linkURL ? `<a href="${esc(fotd.linkURL)}" target="_blank" rel="noopener" class="btn secondary sm" style="margin-top:10px;display:inline-block;text-decoration:none">Open link ↗</a>` : ""}
      </div>`));
    }

    // 🌟 Colleague Highlight of the Day
    const cotd = S.colleagueOfTheDay ? S.colleagueOfTheDay() : null;
    if (cotd) {
      const claps = cotd.claps || 0;
      const clapsLine = claps > 0
        ? `<button class="cotd-who" style="display:flex;align-items:center;gap:8px;background:none;border:none;cursor:pointer;padding:8px 0 0;margin:0;width:auto"><span style="display:inline-flex">${goalPreview(S.cotdClappers ? S.cotdClappers() : [])}</span><span class="muted" style="font-size:13px;font-weight:600">${claps} celebration${claps === 1 ? "" : "s"} 👏</span></button>`
        : "";
      if (cotd.id === me.id) {
        const c = h(`<div class="card" style="background:linear-gradient(135deg,#fff,#FBF3D7)">
          <span class="chip gold" style="margin-bottom:8px">🌟 Colleague of the Day</span>
          <div style="font-weight:700;font-size:16px;margin:6px 0 4px">It's you today! 🎉</div>
          <div class="muted" style="color:var(--ink);font-size:14px">You're in the spotlight — colleagues are getting to know you${claps > 0 ? " and celebrating you" : ""}! Sit back and enjoy. 🙌</div>
          ${clapsLine}
        </div>`);
        const who = c.querySelector(".cotd-who"); if (who) who.onclick = () => showPeopleList("👏 Celebrations", S.cotdClappers());
        wrap.appendChild(c);
      } else {
        const done = S.factsFor(cotd.id).length > 0 && S.factsFor(cotd.id).every(f => S.alreadyCorrect(cotd.id, f.id));
        const iClapped = (cotd.clappedBy || []).includes(me.id);
        const card = h(`<div class="card" style="background:linear-gradient(135deg,#fff,#FBF3D7)">
          <span class="chip gold" style="margin-bottom:8px">🌟 Colleague of the Day</span>
          <div class="row" style="gap:12px;margin:8px 0">${avatar(cotd, "lg")}
            <div><div style="font-weight:700;font-size:17px">${esc(cotd.name)}</div>
            <div class="muted" style="font-size:13px">${done ? "You've guessed all their facts ✅" : "3 fun facts to guess"}</div></div></div>
          <div class="muted" style="color:var(--ink);font-size:14px;margin-bottom:10px">Get to know <b>${esc(cotd.name)}</b>, beyond their awesomeness we already know! Give their fun facts a go 👇</div>
          <button class="btn" id="cotd-go" style="width:100%">${done ? "See their facts" : "Guess " + esc(cotd.name.split(" ")[0]) + "'s facts"}</button>
          <div class="row" style="gap:16px;margin-top:10px">
            <button class="cotd-clap goal-btn" style="${iClapped ? "color:var(--gold)" : ""}">${I.clap}<span>${iClapped ? "Celebrated" : "Celebrate"}</span></button>
          </div>
          ${clapsLine}
        </div>`);
        card.querySelector("#cotd-go").onclick = () => guessPerson(cotd);
        card.querySelector(".cotd-clap").onclick = () => { S.celebrateCotd(); viewFacts(); };
        const who = card.querySelector(".cotd-who"); if (who) who.onclick = () => showPeopleList("Celebrated by", S.cotdClappers());
        wrap.appendChild(card);
      }
    }

    if (myFacts.length < 3) {
      wrap.appendChild(h(`<div class="banner">${I.star} Set up your 3 fun facts so others can guess them.</div>`));
    }
    if (S.factsLocked()) {
      wrap.appendChild(h(`<div class="card tight row" style="margin-bottom:18px;gap:10px"><span class="chip good">🔒 Locked</span><span class="muted" style="font-size:13px">Your 3 fun facts are set. View them in Settings.</span></div>`));
    } else {
      const setupBtn = h(`<button class="btn" style="margin-bottom:18px">${myFacts.length ? "Finish setting my fun facts" : "Set up my 3 fun facts"}</button>`);
      setupBtn.onclick = () => setupFacts(viewFacts);
      wrap.appendChild(setupBtn);
    }

    const left = S.guessesLeftToday();
    wrap.appendChild(h(`<div class="row between" style="margin:22px 4px 10px"><span class="section-title" style="margin:0">Colleagues to guess</span><span class="chip ${left ? "" : "grey"}">${left} guess${left === 1 ? "" : "es"} left today</span></div>`));
    const others = S.allUsers().filter(u => u.id !== me.id && S.factsFor(u.id).length > 0);
    if (!others.length) wrap.appendChild(h(`<div class="empty">${I.star}<p>No one to guess yet. Invite colleagues!</p></div>`));
    others.forEach(u => {
      const row = h(`<div class="card tight list-tap">${avatar(u)}
        <div><div style="font-weight:600">${esc(u.name)} ${crownBadge(u.crowns)}</div>
        <div class="muted" style="font-size:13px">3 facts to guess</div></div>
        <span class="chev">${I.chev}</span></div>`);
      row.onclick = () => guessPerson(u);
      wrap.appendChild(row);
    });
    setView(wrap);
  }

  function setupFacts(after) {
    const me = S.currentUser();
    const existing = S.factsFor(me.id);
    const bg = modal(`<h3>Your 3 fun facts</h3>${factsIntro()}
      <div id="ff"></div>
      <div class="actions"><button class="btn secondary" id="x">Cancel</button><button class="btn" id="save">Save facts</button></div>`);
    const ff = bg.querySelector("#ff");
    for (let i = 0; i < 3; i++) {
      const ex = existing[i] || { question: "", options: ["", "", "", ""], answerIndex: 0 };
      const block = h(`<div style="margin-bottom:16px">
        <label class="fld">Fact ${i + 1} — question</label>
        <input class="input q" placeholder="e.g. Which country was I born in?" value="${esc(ex.question)}">
        <label class="fld">${OPTS_LABEL}</label>
        ${[0, 1, 2, 3].map(o => `<div class="row" style="margin-bottom:6px">
          <input type="radio" name="ans${i}" ${ex.answerIndex === o ? "checked" : ""} value="${o}" title="Mark as the correct answer" style="width:20px;height:20px;flex:0 0 auto;accent-color:var(--zb-blue)">
          <input class="input opt-in" data-o="${o}" placeholder="Answer ${o + 1}" value="${esc(ex.options[o] || "")}">
        </div>`).join("")}
      </div>`);
      ff.appendChild(block);
    }
    bg.querySelector("#x").onclick = () => bg.remove();
    bg.querySelector("#save").onclick = () => {
      const blocks = ff.children; const facts = [];
      for (let i = 0; i < 3; i++) {
        const b = blocks[i];
        const q = b.querySelector(".q").value.trim();
        const opts = [...b.querySelectorAll(".opt-in")].map(x => x.value.trim());
        const ans = +b.querySelector(`input[name="ans${i}"]:checked`).value;
        if (!q || opts.some(o => !o)) return toast(`Complete fact ${i + 1} fully`);
        facts.push({ question: q, options: opts, answerIndex: ans });
      }
      const r = S.setMyFacts(facts); if (r && r.error) return toast(r.error);
      bg.remove(); toast("Fun facts saved & locked in ✓"); (after || viewFacts)();
    };
  }

  function guessPerson(u) {
    const facts = S.factsFor(u.id);
    const bg = modal(`<h3>Guess ${esc(u.name)}</h3>
      <p>Correct = 20 points! (They'll earn a 👑 for having a fact figured out.) You have <b id="gl"></b> wrong guess(es) left today — get one right to keep going!</p>
      <div id="gf"></div>
      <button class="btn secondary" id="close" style="margin-top:6px">Close</button>`);
    const gf = bg.querySelector("#gf");
    const glEl = bg.querySelector("#gl");
    const noBudget = () => S.guessesLeftToday() <= 0;
    const updateLeft = () => { glEl.textContent = S.guessesLeftToday(); };
    updateLeft();
    facts.forEach(fact => {
      const done = S.alreadyCorrect(u.id, fact.id);
      const guessedToday = S.guessedToday(u.id, fact.id);
      const block = h(`<div style="margin-bottom:18px"><div class="fact-q">${esc(fact.question)}</div><div class="opts"></div>
        <div class="hint muted" style="font-size:12px"></div></div>`);
      const opts = block.querySelector(".opts");
      const hint = block.querySelector(".hint");
      fact.options.forEach((o, idx) => {
        const btn = h(`<button class="opt">${esc(o)}</button>`);
        if (done && idx === fact.answerIndex) btn.classList.add("correct");
        if (done || guessedToday || (noBudget() && !done && !guessedToday)) btn.disabled = true;
        btn.onclick = () => {
          const r = S.guessFact(u.id, fact.id, idx);
          if (r.error) { toast(r.error); return; }
          [...opts.children].forEach(b => b.disabled = true);
          if (r.correct) { btn.classList.add("correct"); hint.textContent = "Correct! +20 points 🎉"; toast("Correct! +20 pts"); celebrate(); }
          else { btn.classList.add("wrong"); hint.textContent = "Not quite — try again tomorrow."; toast("Wrong guess"); }
          updateLeft();
          if (noBudget()) gf.querySelectorAll(".opt").forEach(b => { if (!b.classList.contains("correct")) b.disabled = true; });
          renderApp();
        };
        opts.appendChild(btn);
      });
      if (done) hint.textContent = "You already guessed this correctly ✓";
      else if (guessedToday) hint.textContent = "Already guessed today — try again tomorrow.";
      else if (noBudget()) hint.textContent = "Out of guesses today.";
      gf.appendChild(block);
    });
    bg.querySelector("#close").onclick = () => bg.remove();
  }

  /* ---------------- LEADERBOARD ---------------- */
  function viewLeaderboard() {
    const me = S.currentUser();
    const board = S.leaderboard();
    const wrap = h(`<div class="screen"><h2>Leaderboard</h2><p class="sub">Live ranking. Earn points from matches, fun facts, and your country. ${I.crown} = times colleagues have guessed your facts.</p></div>`);
    const card = h(`<div class="card"></div>`);
    board.forEach((u, i) => {
      const row = h(`<div class="lb-row ${i === 0 ? "top1" : ""} ${u.id === me.id ? "me" : ""}">
        <span class="lb-rank">${i + 1}</span>
        ${avatar(u, "sm")}
        ${u.country ? `<img class="flag" src="${window.ZB_FLAG(u.country.code)}" alt="${esc(u.country.name)}" title="${esc(u.country.name)}" loading="lazy" style="width:24px;height:17px">` : ""}
        <span class="lb-name">${esc(u.name)}${u.id === me.id ? " (you)" : ""} ${crownBadge(u.crowns)}</span>
        <span class="chip points">${u.points}</span>
      </div>`);
      card.appendChild(row);
    });
    wrap.appendChild(card);
    setView(wrap);
  }

  function openNotifications() {
    const items = S.notifications ? S.notifications() : [];
    const icon = t => t === "guess" ? "👑" : t === "reply" ? "💬" : t === "announcement" ? "📢" : t === "bug" ? "🐞" : t === "bugreply" ? "🐞" : t === "celebrate" ? "👏" : "⚽";
    const tappable = t => t === "bugreply" || t === "announcement";
    const bg = modal(`<h3>Notifications</h3>
      <div style="max-height:60vh;overflow-y:auto">
        ${items.length ? items.map(n => `<div class="row notif-row" data-type="${esc(n.type)}" style="gap:10px;padding:10px 0;border-bottom:1px solid var(--line)${tappable(n.type) ? ";cursor:pointer" : ""}">
          <span style="font-size:20px">${icon(n.type)}</span>
          <div style="flex:1"><div style="font-size:14px">${esc(n.text)}</div><div class="muted" style="font-size:12px">${timeAgo(n.createdAt)} ago${tappable(n.type) ? " · tap to view" : ""}</div></div>
          ${n.read ? "" : `<span style="width:8px;height:8px;border-radius:50%;background:var(--zb-blue);flex:0 0 auto"></span>`}
        </div>`).join("") : `<div class="empty">${I.bell}<p>No notifications yet. You'll hear when someone guesses your fact, replies, or gives you a Goal.</p></div>`}
      </div>
      <div class="actions" style="margin-top:14px">${items.length ? `<button class="btn secondary" id="clr">Clear all</button>` : ""}<button class="btn" id="x">Close</button></div>`);
    bg.querySelector("#x").onclick = () => bg.remove();
    // tapping an admin bug reply opens the user's bug thread
    bg.querySelectorAll('.notif-row[data-type="bugreply"]').forEach(r => r.onclick = () => {
      bg.remove(); tab = "more"; subScreen = subMyBugs; renderApp();
    });
    // tapping an announcement jumps to Chat (where it's pinned at the top) and expands it
    bg.querySelectorAll('.notif-row[data-type="announcement"]').forEach(r => r.onclick = () => {
      bg.remove(); tab = "chat"; subScreen = null; annExpanded = true; renderApp();
      setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 60);
    });
    const clr = bg.querySelector("#clr");
    if (clr) clr.onclick = () => { if (S.clearNotifications) S.clearNotifications(); bg.remove(); renderApp(); };
    if (S.unreadCount && S.unreadCount() > 0 && S.markAllRead) {
      S.markAllRead();
      const b = document.getElementById("my-badge"); if (b) b.style.display = "none";
    }
  }

  function showPeopleList(title, list) {
    const bg = modal(`<h3>${title}</h3>${(list && list.length)
      ? `<div style="max-height:55vh;overflow-y:auto">${list.slice().reverse().map(u => `<div class="row" style="gap:10px;padding:9px 0;border-bottom:1px solid var(--line)">${avatar(u, "sm")}<span style="font-weight:600">${esc(u.name)}</span></div>`).join("")}</div>`
      : `<p class="muted">No one yet.</p>`}<button class="btn" id="x" style="margin-top:14px">Close</button>`);
    bg.querySelector("#x").onclick = () => bg.remove();
  }

  function showGoalers(postId) {
    const list = S.goalers ? S.goalers(postId) : [];
    const bg = modal(`<h3>${I.ball} Goals</h3>${list.length
      ? `<div style="max-height:55vh;overflow-y:auto">${list.slice().reverse().map(u => `<div class="row" style="gap:10px;padding:9px 0;border-bottom:1px solid var(--line)">${avatar(u, "sm")}<span style="font-weight:600">${esc(u.name)}</span></div>`).join("")}</div>`
      : `<p class="muted">No Goals yet.</p>`}<button class="btn" id="x" style="margin-top:14px">Close</button>`);
    bg.querySelector("#x").onclick = () => bg.remove();
  }

  /* ---------------- CHAT ---------------- */
  function viewChat() {
    const me = S.currentUser();
    const wrap = h(`<div class="screen" style="padding-bottom:calc(var(--tab-h) + env(safe-area-inset-bottom,0px) + 96px)"><h2>Chat</h2><p class="sub">Say hi, share predictions, post a celebration photo (+10 pts, once a day!), and give "Goals" ⚽ to cheer colleagues on.</p><div id="feed"></div></div>`);
    const feed = wrap.querySelector("#feed");
    // pinned admin announcement
    const ann = S.announcement ? S.announcement() : null;
    if (ann) {
      const full = ann.text || "";
      const long = full.length > 160 || (full.match(/\n/g) || []).length > 2;
      const shown = annExpanded || !long;
      const body = shown ? full : full.slice(0, 150).replace(/\s+\S*$/, "") + "…";
      const annGoals = ann.goals || 0;
      const annOn = (ann.goaledBy || []).includes(me.id);
      const card = h(`<div class="card" style="background:linear-gradient(135deg,#ffffff,var(--zb-blue-soft));border-color:var(--zb-blue)">
        <div class="row between" style="margin-bottom:6px"><span class="chip">📢 Announcement</span>
          ${S.isAdmin() ? `<button class="ann-clear btn ghost" style="width:auto;padding:0;font-size:12px">Remove</button>` : ""}</div>
        <div style="white-space:pre-wrap">${esc(body)}</div>
        ${long ? `<button class="ann-toggle btn ghost" style="width:auto;padding:6px 0;font-size:13px">${shown ? "Show less" : "Expand"}</button>` : ""}
        <div class="muted" style="font-size:12px;margin-top:4px">${esc(ann.byName || "Admin")} · ${timeAgo(ann.createdAt)} ago</div>
        <div class="row" style="gap:16px;margin-top:8px;flex-wrap:wrap">
          <button class="ann-goal goal-btn ${annOn ? "on" : ""}">${I.ball}<span>${annOn ? "Goaled" : "Goal"}</span></button>
        </div>
        ${annGoals > 0 ? `<button class="ann-who" style="display:flex;align-items:center;gap:8px;background:none;border:none;cursor:pointer;padding:8px 0 0;margin:0;width:auto"><span style="display:inline-flex">${goalPreview(S.announcementGoalers ? S.announcementGoalers() : [])}</span><span class="muted" style="font-size:13px;font-weight:600">${annGoals} Goal${annGoals === 1 ? "" : "s"} given</span></button>` : ""}
      </div>`);
      const tg = card.querySelector(".ann-toggle"); if (tg) tg.onclick = () => { annExpanded = !annExpanded; viewChat(); };
      const clr = card.querySelector(".ann-clear"); if (clr) clr.onclick = () => { S.clearAnnouncement(); viewChat(); };
      card.querySelector(".ann-goal").onclick = () => { S.toggleAnnouncementGoal(); viewChat(); };
      const aw = card.querySelector(".ann-who"); if (aw) aw.onclick = () => showPeopleList(`${I.ball} Goals`, S.announcementGoalers());
      feed.appendChild(card);
    }
    const blockedIds = new Set(S.allUsers().filter(u => u.blocked).map(u => u.id));
    const posts = S.posts().filter(p => !blockedIds.has(p.authorId)).reverse(); // newest first
    if (!posts.length) feed.appendChild(h(`<div class="empty">${I.chat}<p>No messages yet. Start the conversation!</p></div>`));
    posts.forEach(p => {
      const mine = p.authorId === me.id;
      const goals = p.goals || 0;
      const on = (p.goaledBy || []).includes(me.id);
      const replies = (p.replies || []).filter(r => !blockedIds.has(r.authorId));
      const repsOpen = replies.length && expandedReplies.has(p.id);
      const post = h(`<div class="post">${avatar({ name: p.authorName, photoURL: p.authorPhoto }, "sm")}
        <div class="body">
          <div class="meta"><b style="color:var(--ink)">${esc(p.authorName)}</b><span>· ${timeAgo(p.createdAt)}</span>
            ${mine || S.isAdmin() ? `<button class="del btn ghost" style="margin-left:auto;width:auto;padding:0;font-size:12px">Delete</button>` : ""}</div>
          ${p.text ? `<div>${esc(p.text)}</div>` : ""}
          ${p.imageURL ? `<img src="${esc(p.imageURL)}" alt="photo" style="width:100%;border-radius:12px;margin-top:8px">` : ""}
          <div class="row" style="gap:16px;margin-top:8px;flex-wrap:wrap">
            <button class="goal-btn ${on ? "on" : ""}">${I.ball}<span>${on ? "Goaled" : "Goal"}</span></button>
            ${!repsOpen ? `<button class="reply-btn goal-btn">💬 <span>Reply</span></button>` : ""}
            ${replies.length ? `<button class="toggle-btn goal-btn"><span>${expandedReplies.has(p.id) ? "Hide replies" : "View " + replies.length + " repl" + (replies.length === 1 ? "y" : "ies")}</span></button>` : ""}
          </div>
          ${goals > 0 ? `<button class="goalers-btn" style="display:flex;align-items:center;gap:8px;background:none;border:none;cursor:pointer;padding:8px 0 0;margin:0;width:auto"><span style="display:inline-flex" class="gp"></span><span class="muted" style="font-size:13px;font-weight:600">${goals} Goal${goals === 1 ? "" : "s"} given</span></button>` : ""}
          <div class="replies"></div>
          ${repsOpen ? `<div class="reply-row" style="display:flex;justify-content:flex-end;margin-top:8px"><button class="reply-btn goal-btn">💬 <span>Reply</span></button></div>` : ""}
          <div class="reply-box" style="display:none"></div>
        </div></div>`);
      post.querySelector(".goal-btn").onclick = () => { S.toggleGoal(p.id); viewChat(); };
      const gbtn = post.querySelector(".goalers-btn");
      if (gbtn) { gbtn.querySelector(".gp").innerHTML = goalPreview(S.goalers ? S.goalers(p.id) : []); gbtn.onclick = () => showGoalers(p.id); }
      const del = post.querySelector(".del"); if (del) del.onclick = () => { S.deletePost(p.id); viewChat(); };
      const toggle = post.querySelector(".toggle-btn");
      if (toggle) toggle.onclick = () => { expandedReplies.has(p.id) ? expandedReplies.delete(p.id) : expandedReplies.add(p.id); viewChat(); };

      const repWrap = post.querySelector(".replies");
      if (replies.length && expandedReplies.has(p.id)) {
        repWrap.style.cssText = "margin-top:10px;padding-left:10px;border-left:2px solid var(--line);display:flex;flex-direction:column;gap:8px";
        replies.forEach(r => {
          const rmine = r.authorId === me.id;
          const rgoals = r.goals || 0, ron = (r.goaledBy || []).includes(me.id);
          const rr = h(`<div class="post" style="margin:0">${avatar({ name: r.authorName, photoURL: r.authorPhoto }, "sm")}
            <div class="body" style="background:#F7F9FB">
              <div class="meta"><b style="color:var(--ink)">${esc(r.authorName)}</b><span>· ${timeAgo(r.createdAt)}</span>
                ${rmine || S.isAdmin() ? `<button class="rdel btn ghost" style="margin-left:auto;width:auto;padding:0;font-size:12px">Delete</button>` : ""}</div>
              <div>${esc(r.text)}</div>
              <button class="rgoal goal-btn ${ron ? "on" : ""}" style="margin-top:6px">${I.ball}<span>${rgoals} Goal${rgoals === 1 ? "" : "s"}</span></button>
            </div></div>`);
          rr.querySelector(".rgoal").onclick = () => { if (S.toggleReplyGoal) { S.toggleReplyGoal(p.id, r.id); viewChat(); } };
          const rdel = rr.querySelector(".rdel"); if (rdel) rdel.onclick = () => { S.deleteReply(p.id, r.id); viewChat(); };
          repWrap.appendChild(rr);
        });
      }

      const box = post.querySelector(".reply-box");
      post.querySelector(".reply-btn").onclick = () => {
        if (S.currentUser().blocked) return toast("You've been blocked from posting by the admin.");
        if (box.style.display !== "none") { box.style.display = "none"; return; }
        box.style.cssText = "display:flex;gap:8px;margin-top:10px";
        box.innerHTML = "";
        const inp = h(`<input class="input" placeholder="Write a reply…" maxlength="280" style="flex:1;font-size:14px;padding:9px 12px">`);
        const send = h(`<button class="btn sm" style="width:auto">Reply</button>`);
        box.appendChild(inp); box.appendChild(send); inp.focus();
        const go = () => { const t = inp.value.trim(); if (!t) return; const r = S.addReply(p.id, t); if (r && r.error) return toast(r.error); expandedReplies.add(p.id); viewChat(); };
        send.onclick = go;
        inp.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
      };

      feed.appendChild(post);
    });
    setView(wrap);

    // composer (fixed above tab bar)
    document.querySelectorAll(".composer").forEach(c => c.remove());
    if (S.currentUser().blocked) {
      const blk = h(`<div class="composer" style="justify-content:center"><span class="muted" style="font-size:13px">You've been blocked from posting by the admin.</span></div>`);
      root.appendChild(blk);
      return;
    }
    const comp = h(`<div class="composer" style="flex-wrap:wrap">
      <div id="c-prev" style="width:100%;display:none;margin-bottom:6px"></div>
      <div style="position:relative;flex:1;display:flex;align-items:center">
        <input id="c-in" placeholder="Write a message…" maxlength="280" style="width:100%;padding-right:42px">
        <button id="c-photo" title="Attach a photo" style="position:absolute;right:8px;background:none;border:none;cursor:pointer;font-size:18px;line-height:1;padding:2px">📷</button>
      </div>
      <button class="btn sm" id="c-send" style="width:auto">Post</button>
      <input type="file" accept="image/*" id="c-file" style="display:none">
    </div>`);
    root.appendChild(comp);
    const prev = comp.querySelector("#c-prev");
    const renderPrev = () => {
      if (pendingChatPhoto) {
        prev.style.display = "block";
        prev.innerHTML = `<span style="position:relative;display:inline-block"><img src="${pendingChatPhoto}" style="height:54px;border-radius:8px"><button id="c-rm" style="position:absolute;top:-6px;right:-6px;background:#141414;color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;line-height:1">×</button></span>`;
        prev.querySelector("#c-rm").onclick = () => { pendingChatPhoto = null; renderPrev(); };
      } else { prev.style.display = "none"; prev.innerHTML = ""; }
    };
    renderPrev();
    comp.querySelector("#c-photo").onclick = () => comp.querySelector("#c-file").click();
    comp.querySelector("#c-file").onchange = e => readImage(e.target.files[0], d => { pendingChatPhoto = d; renderPrev(); }, 720);
    const send = () => {
      const inp = comp.querySelector("#c-in"); const t = inp.value.trim();
      if (!t && !pendingChatPhoto) return;
      const r = S.addPost(t, pendingChatPhoto); if (r && r.error) return toast(r.error);
      if (r && r.bonus) { celebrate(); toast("Nice photo! +10 pts 🎉"); }
      inp.value = ""; pendingChatPhoto = null; viewChat();
      setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 60);
    };
    comp.querySelector("#c-send").onclick = send;
    comp.querySelector("#c-in").addEventListener("keydown", e => { if (e.key === "Enter") send(); });
  }

  /* ---------------- MORE (ZB facts / rules / settings) ---------------- */
  function viewMore() {
    subScreen = null;
    document.querySelectorAll(".composer").forEach(c => c.remove());
    const wrap = h(`<div class="screen"><h2>More</h2></div>`);
    const items = [
      ["predictions", I.ball, "My Predictions", "Your picks & points won"],
      ["zbfacts", I.zb, "ZB Fun Facts", "Learn about Zimmer Biomet"],
      ["rules", I.info, "Rules & How to Play", "Points, guessing, and more"],
      ["settings", I.settings, "Settings", "Photo, name, your country"]
    ];
    if (S.isAdmin()) items.push(["admin", I.trophy, "Admin tools", "Manage the game"]);
    const card = h(`<div class="card"></div>`);
    items.forEach(([id, icon, title, sub]) => {
      const r = h(`<div class="list-tap"><span style="color:var(--zb-blue);width:24px;height:24px">${icon}</span>
        <div><div style="font-weight:600">${title}</div><div class="muted" style="font-size:13px">${sub}</div></div>
        <span class="chev">${I.chev}</span></div>`);
      r.onclick = () => { if (id === "predictions") subPredictions(); else if (id === "zbfacts") subZbFacts(); else if (id === "rules") subRules(); else if (id === "settings") subSettings(); else subAdmin(); };
      card.appendChild(r);
    });
    wrap.appendChild(card);
    setView(wrap);
  }

  function backHeader(title) {
    const bar = h(`<div class="row" style="margin-bottom:6px"><button class="btn ghost sm" style="width:auto;padding:6px 10px 6px 0">‹ More</button><h2 style="margin:0">${esc(title)}</h2></div>`);
    bar.querySelector("button").onclick = viewMore;
    return bar;
  }

  function subPredictions() {
    subScreen = subPredictions;
    const wrap = h(`<div class="screen"></div>`);
    wrap.appendChild(backHeader("My Predictions"));
    const mine = S.fixtures().filter(f => S.myPrediction(f.id));
    if (!mine.length) {
      wrap.appendChild(h(`<div class="empty">${I.ball}<p>No predictions yet.<br>Head to the Matches tab to make some!</p></div>`));
      setView(wrap); return;
    }
    const finished = mine.filter(f => f.status === "finished");
    const upcoming = mine.filter(f => f.status !== "finished");

    let pts = 0, scored = 0, missed = 0;
    finished.forEach(f => { const p = S.myPrediction(f.id); const pa = p.pointsAwarded || 0; pts += pa; if (pa > 0) scored++; else missed++; });

    wrap.appendChild(h(`<div class="card row between">
      <div><div style="font-weight:800;font-size:22px;color:var(--zb-blue)">${pts} pts</div><div class="muted" style="font-size:12px">from predictions</div></div>
      <div class="row" style="gap:18px">
        <div class="center"><div style="font-weight:800;color:var(--good);font-size:18px">${scored}</div><div class="muted" style="font-size:11px">scored</div></div>
        <div class="center"><div style="font-weight:800;color:var(--muted);font-size:18px">${missed}</div><div class="muted" style="font-size:11px">missed</div></div>
      </div></div>`));

    // Past results FIRST (newest at top) — that's what people check after a game —
    // then the upcoming picks below.
    if (finished.length) {
      wrap.appendChild(h(`<div class="section-title">Past results — how your picks did</div>`));
      finished.slice().sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff))
        .forEach(f => wrap.appendChild(matchCard(f, subPredictions)));
    }
    if (upcoming.length) {
      wrap.appendChild(h(`<div class="section-title">Upcoming — tap to edit before kickoff</div>`));
      upcoming.slice().sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
        .forEach(f => wrap.appendChild(matchCard(f, subPredictions)));
    }
    setView(wrap);
  }

  function subZbFacts() {
    subScreen = subZbFacts;
    const wrap = h(`<div class="screen"></div>`);
    wrap.appendChild(backHeader("ZB Fun Facts"));
    if (S.isAdmin()) { const b = h(`<button class="btn" style="margin:10px 0 18px">+ New ZB Fact</button>`); b.onclick = () => newZbFact(subZbFacts); wrap.appendChild(b); }
    const facts = S.zbFacts();
    if (!facts.length) wrap.appendChild(h(`<div class="empty">${I.zb}<p>No ZB facts yet.</p></div>`));
    facts.forEach(f => {
      const card = h(`<div class="card">
        <div class="row between" style="margin-bottom:8px"><span class="chip">ZB</span>${S.isAdmin() ? `<button class="del btn ghost" style="width:auto;padding:0;font-size:12px">Delete</button>` : ""}</div>
        <div style="font-weight:700;font-size:17px;margin-bottom:4px">${esc(f.title)}</div>
        ${f.imageURL ? `<img src="${esc(f.imageURL)}" style="width:100%;border-radius:10px;margin:8px 0">` : ""}
        <div class="muted" style="color:var(--ink)">${esc(f.body)}</div>
        ${f.linkURL ? `<a href="${esc(f.linkURL)}" target="_blank" rel="noopener" class="btn secondary sm" style="margin-top:10px;display:inline-block;text-decoration:none">Open link ↗</a>` : ""}
        <div class="muted" style="font-size:12px;margin-top:8px">${timeAgo(f.createdAt)} ago</div></div>`);
      const del = card.querySelector(".del");
      if (del) del.onclick = () => { S.deleteZbFact(f.id); subZbFacts(); };
      wrap.appendChild(card);
    });
    setView(wrap);
  }
  function newZbFact(after) {
    const bg = modal(`<h3>New ZB Fact</h3>
      <label class="fld">Title</label><input class="input" id="t" placeholder="Did you know?">
      <label class="fld">Photo (optional)</label>
      <div class="row" style="gap:12px;margin:6px 0"><span id="prev"></span>
        <input type="file" accept="image/*" id="img" style="display:none">
        <button class="btn secondary btn-pill" id="pick">Add image</button></div>
      <label class="fld">Fact</label><textarea class="input" id="b" placeholder="Share something about ZB…"></textarea>
      <label class="fld">Link (optional)</label><input class="input" id="u" placeholder="https://…">
      <div class="actions" style="margin-top:16px"><button class="btn secondary" id="x">Cancel</button><button class="btn" id="ok">Post</button></div>`);
    let imgData = null;
    bg.querySelector("#pick").onclick = () => bg.querySelector("#img").click();
    bg.querySelector("#img").onchange = e => readImage(e.target.files[0], d => { imgData = d; if (d) bg.querySelector("#prev").innerHTML = `<img src="${d}" style="width:74px;height:56px;border-radius:8px;object-fit:cover">`; });
    bg.querySelector("#x").onclick = () => bg.remove();
    bg.querySelector("#ok").onclick = () => {
      const t = bg.querySelector("#t").value.trim(), b = bg.querySelector("#b").value.trim(), u = bg.querySelector("#u").value.trim();
      if (!t || !b) return toast("Add a title and a fact");
      S.addZbFact({ title: t, body: b, imageURL: imgData, linkURL: u || null });
      bg.remove(); toast("Posted ✓"); (after || subZbFacts)();
    };
  }

  function rulesInner() {
    return `
      <div class="section-title" style="margin-top:0">Getting in</div>
      <p>Create an account with your <b>work email and a password</b> (tap "Forgot password?" any time to reset it). Add a profile photo, set your fun facts, and pick a country. Your account works on any device — just sign in.</p>
      <div class="section-title">Your country (2,500 pts)</div>
      <p>Pick one nation. <b>It locks immediately</b> and can't be changed. If they win the whole World Cup, you score a huge <b>2,500 points</b>!</p>
      <div class="section-title">Match predictions (up to 10 pts/game)</div>
      <p>For each game predict the <b>winner</b> (+5) and the <b>exact score</b> (+5). Predictions <b>lock at kickoff</b> — get them in early!</p>
      <div class="section-title">Fun facts (20 pts each)</div>
      <p>Set 3 multiple-choice facts about yourself (they <b>lock</b> once saved). Guess colleagues' facts for <b>20 points</b> each. Each time someone guesses one of <b>your</b> facts, you earn a 👑. You get <b>3 wrong guesses per day</b> — keep going while you're right; 3 wrong and you're done until tomorrow.</p>
      <div class="section-title">📸 Celebration photos (+10 pts)</div>
      <p>Post a photo in Chat to earn <b>+10 points — once per day</b>. Use the 📷 in the message box.</p>
      <p style="background:#FBEBEB;color:var(--bad);border-radius:10px;padding:10px 12px;font-size:14px"><b>Please keep it relevant:</b> photos should celebrate colleagues or the football. Off-topic or inappropriate photos will be <b>removed by the admin and the 10 points taken back</b>. Keep it fun and professional. 🙏</p>
      <div class="section-title">Leaderboard</div>
      <p>All your points add up here, live. 👑 shows how many times colleagues have guessed your facts.</p>
      <div class="section-title">Chat & Goals</div>
      <p>Post messages, reply to start a conversation, and give <b>Goals</b> ⚽ to cheer colleagues on. Tap "N Goals given" to see who.</p>
      <div class="section-title">ZB Fun Facts</div>
      <p>Read facts about Zimmer Biomet posted by the admin, including the daily "Fact of the Day".</p>
      <div class="section-title">Found a bug?</div>
      <p>Go to <b>More → Settings → Report a bug</b> to let the admin know (you can attach a screenshot).</p>`;
  }
  function subRules() {
    subScreen = subRules;
    const wrap = h(`<div class="screen"></div>`);
    wrap.appendChild(backHeader("Rules & How to Play"));
    wrap.appendChild(h(`<div class="card">${rulesInner()}</div>`));
    setView(wrap);
  }
  function showRulesModal() {
    const bg = modal(`<h3>How to play ZB Cup</h3><div style="max-height:60vh;overflow-y:auto">${rulesInner()}</div>
      <button class="btn" id="x" style="margin-top:16px">Got it</button>`);
    bg.querySelector("#x").onclick = () => bg.remove();
  }

  function subSettings() {
    subScreen = subSettings;
    const me = S.currentUser();
    const wrap = h(`<div class="screen"></div>`);
    wrap.appendChild(backHeader("Settings"));
    const card = h(`<div class="card">
      <div class="photo-pick" style="margin:6px 0 16px">
        <span id="s-prev">${avatar(me, "lg")}</span>
        <input type="file" accept="image/*" id="s-file" style="display:none">
        <button class="btn secondary btn-pill" id="s-photo">Change photo</button>
      </div>
      <label class="fld">Display name</label>
      <input class="input" id="s-name" value="${esc(me.name)}">
      <label class="fld">Your country (locked)</label>
      <div class="card tight row" style="margin-top:6px">${flag(me.country)} <b>${esc(me.country ? me.country.name : "—")}</b> <span class="chip grey" style="margin-left:auto">Locked</span></div>
      <button class="btn" id="s-save" style="margin-top:18px">Save changes</button>
      <button class="btn danger" id="s-out" style="margin-top:6px">Sign out</button>
    </div>`);
    wrap.appendChild(card);

    // My fun facts — read-only when locked; otherwise let them set/finish right here
    const facts = S.factsFor(me.id);
    const locked = S.factsLocked(me.id);
    const fc = h(`<div class="card">
      <div class="row between" style="margin-bottom:6px">
        <div class="section-title" style="margin-top:0">My fun facts</div>
        ${locked ? `<span class="chip good">🔒 Locked</span>` : ""}
      </div>
      <p class="muted" style="font-size:13px;margin:0 0 6px">${locked
        ? "These can't be changed — they're what colleagues guess about you."
        : "Set 3 fun facts so colleagues can guess them. They lock once all 3 are saved."}</p>
    </div>`);
    facts.forEach((f, i) => fc.appendChild(h(`<div style="padding:10px 0;border-top:1px solid var(--line)">
      <div style="font-weight:600;font-size:14px">${i + 1}. ${esc(f.question)}</div>
      <div class="muted" style="font-size:13px;margin-top:2px">Correct answer: <b style="color:var(--good)">${esc(f.options[f.answerIndex])}</b></div>
    </div>`)));
    if (!locked) {
      const b = h(`<button class="btn" style="margin-top:14px">${facts.length ? "Finish my fun facts" : "Set up my fun facts"}</button>`);
      b.onclick = () => setupFacts(subSettings);
      fc.appendChild(b);
    }
    wrap.appendChild(fc);

    // Report a bug
    const bugCard = h(`<div class="card"><div class="section-title" style="margin-top:0">Found a problem?</div>
      <p class="muted" style="font-size:13px;margin:0 0 10px">Spotted a bug or something off? Let the admin know — you can attach a screenshot.</p>
      <button class="btn secondary" id="report-bug">🐞 Report a bug</button>
      <button class="btn ghost" id="my-bugs" style="margin-top:6px">View my reports &amp; replies</button></div>`);
    bugCard.querySelector("#report-bug").onclick = openBugReport;
    bugCard.querySelector("#my-bugs").onclick = subMyBugs;
    wrap.appendChild(bugCard);

    setView(wrap);
    card.querySelector("#s-photo").onclick = () => card.querySelector("#s-file").click();
    card.querySelector("#s-file").onchange = e => readImage(e.target.files[0], d => { if (d) { S.updateProfile({ photoURL: d }); card.querySelector("#s-prev").innerHTML = avatar(S.currentUser(), "lg"); } });
    card.querySelector("#s-save").onclick = () => { const n = card.querySelector("#s-name").value.trim(); if (!n) return toast("Name can't be empty"); S.updateProfile({ name: n }); toast("Saved ✓"); renderApp(); };
    card.querySelector("#s-out").onclick = () => { S.signOut(); onb = null; tab = "matches"; render(); };
  }

  function openBugReport() {
    let shot = null;
    const bg = modal(`<h3>🐞 Report a bug</h3>
      <p class="muted" style="font-size:13px;margin:0 0 10px">Describe what happened — a screenshot helps a lot.</p>
      <textarea class="input" id="b-text" placeholder="What went wrong, and what were you doing?" style="min-height:90px"></textarea>
      <div class="row" style="gap:12px;margin-top:10px"><span id="b-prev"></span>
        <button class="btn secondary btn-pill" id="b-shot">Add screenshot</button></div>
      <input type="file" accept="image/*" id="b-file" style="display:none">
      <div class="actions" style="margin-top:16px"><button class="btn secondary" id="x">Cancel</button><button class="btn" id="ok">Send report</button></div>`);
    bg.querySelector("#b-shot").onclick = () => bg.querySelector("#b-file").click();
    bg.querySelector("#b-file").onchange = e => readImage(e.target.files[0], d => { shot = d; if (d) bg.querySelector("#b-prev").innerHTML = `<img src="${d}" style="width:60px;height:46px;border-radius:8px;object-fit:cover">`; }, 900);
    bg.querySelector("#x").onclick = () => bg.remove();
    bg.querySelector("#ok").onclick = () => {
      const t = bg.querySelector("#b-text").value.trim();
      if (!t) return toast("Please describe the bug");
      const r = S.submitBug(t, shot); if (r && r.error) return toast(r.error);
      bg.remove(); toast("Thanks! Sent to the admin 🐞");
    };
  }

  // Shared bug conversation: thread messages + a reply box (works for admin and reporter).
  function bugThread(b, redraw) {
    const wrap = h(`<div style="margin-top:10px"></div>`);
    const msgs = (b.messages || []).slice().sort((a, c) => a.createdAt - c.createdAt);
    if (msgs.length) {
      const t = h(`<div class="bug-thread"></div>`);
      msgs.forEach(m => {
        const adminMsg = m.from === "admin";
        t.appendChild(h(`<div class="bug-msg ${adminMsg ? "admin" : "user"}">
          <div class="bug-msg-meta">${esc(m.name)}${adminMsg ? ` <span class="chip" style="padding:1px 6px;font-size:10px">admin</span>` : ""} · ${timeAgo(m.createdAt)} ago</div>
          <div>${esc(m.text)}</div></div>`));
      });
      wrap.appendChild(t);
    }
    const box = h(`<div class="row" style="gap:8px;margin-top:8px">
      <input class="input bug-reply-in" placeholder="Write a reply…" maxlength="500" style="flex:1;font-size:14px;padding:9px 12px">
      <button class="btn sm bug-reply-send" style="width:auto">Reply</button></div>`);
    const send = () => {
      const inp = box.querySelector(".bug-reply-in"); const t = inp.value.trim(); if (!t) return;
      const r = S.addBugMessage(b.id, t); if (r && r.error) return toast(r.error);
      inp.value = ""; toast("Reply sent ✓"); if (redraw) redraw();
    };
    box.querySelector(".bug-reply-send").onclick = send;
    box.querySelector(".bug-reply-in").addEventListener("keydown", e => { if (e.key === "Enter") send(); });
    wrap.appendChild(box);
    return wrap;
  }

  // The reporter's own bug reports + the back-and-forth with the admin.
  function subMyBugs() {
    subScreen = subMyBugs;
    const wrap = h(`<div class="screen"></div>`);
    wrap.appendChild(backHeader("My bug reports"));
    const listWrap = h(`<div id="mybugs"></div>`);
    wrap.appendChild(listWrap);
    setView(wrap);
    const draw = () => {
      const bugs = S.myBugReports ? S.myBugReports() : [];
      listWrap.innerHTML = "";
      if (!bugs.length) { listWrap.appendChild(h(`<div class="empty">${I.info}<p>You haven't reported anything yet.</p></div>`)); return; }
      bugs.forEach(b => {
        const c = h(`<div class="card">
          <div class="row between" style="margin-bottom:6px"><span class="chip">🐞 Your report</span><span class="muted" style="font-size:12px">${timeAgo(b.createdAt)} ago</span></div>
          <div style="white-space:pre-wrap">${esc(b.text)}</div>
          ${b.imageURL ? `<img src="${esc(b.imageURL)}" style="width:100%;border-radius:10px;margin-top:8px">` : ""}
        </div>`);
        c.appendChild(bugThread(b, draw));
        listWrap.appendChild(c);
      });
    };
    if (S.myBugReports && S.myBugReports().length) draw();
    else listWrap.innerHTML = `<div class="muted center" style="padding:30px">Loading…</div>`;
    if (S.myBugReportsLoad) S.myBugReportsLoad().then(draw); else draw();
  }

  function subBugReports() {
    subScreen = subBugReports;
    const wrap = h(`<div class="screen"></div>`);
    wrap.appendChild(backHeader("Bug reports"));
    const listWrap = h(`<div id="bugs"></div>`);
    wrap.appendChild(listWrap);
    setView(wrap);
    const draw = () => {
      const bugs = S.bugReports ? S.bugReports() : [];
      listWrap.innerHTML = "";
      if (!bugs.length) { listWrap.appendChild(h(`<div class="empty">${I.info}<p>No bug reports. All good!</p></div>`)); return; }
      bugs.forEach(b => {
        const c = h(`<div class="card">
          <div class="row between" style="margin-bottom:6px"><b>${esc(b.name)}</b><span class="muted" style="font-size:12px">${timeAgo(b.createdAt)} ago</span></div>
          <div style="white-space:pre-wrap">${esc(b.text)}</div>
          ${b.imageURL ? `<img src="${esc(b.imageURL)}" style="width:100%;border-radius:10px;margin-top:8px">` : ""}
          ${b.email ? `<div class="muted" style="font-size:12px;margin-top:6px">${esc(b.email)}</div>` : ""}
        </div>`);
        c.appendChild(bugThread(b, draw));
        const res = h(`<button class="btn ghost sm bres" style="margin-top:10px">Mark resolved &amp; remove</button>`);
        res.onclick = () => { S.resolveBug(b.id).then(draw); };
        c.appendChild(res);
        listWrap.appendChild(c);
      });
    };
    // show what's cached now (Loading only if we have nothing), then refresh in the background
    if (S.bugReports && S.bugReports().length) draw();
    else listWrap.innerHTML = `<div class="muted center" style="padding:30px">Loading…</div>`;
    if (S.bugReportsLoad) S.bugReportsLoad().then(draw); else draw();
  }

  function subAdmin() {
    subScreen = subAdmin;
    const wrap = h(`<div class="screen"></div>`);
    wrap.appendChild(backHeader("Admin tools"));
    wrap.appendChild(h(`<p class="sub">Your hub: enter scores daily, post ZB facts, manage players.</p>`));

    /* A — Results to enter (the daily workflow) */
    const toEnter = S.resultsToEnter();
    const secA = h(`<div class="card"><div class="section-title" style="margin-top:0">⚽ Results to enter ${toEnter.length ? `<span class="chip">${toEnter.length}</span>` : ""}</div><div id="te"></div></div>`);
    const te = secA.querySelector("#te");
    if (!toEnter.length) te.appendChild(h(`<p class="muted center" style="font-size:14px;margin:6px 0">All caught up 🎉 No games waiting for a score.</p>`));
    toEnter.forEach(f => {
      const tbd = f.teamA.tbd || f.teamB.tbd;
      const row = h(`<div class="row between" style="padding:10px 0;border-bottom:1px solid var(--line)">
        <div style="font-size:14px"><b>${esc(f.teamA.name)}</b> vs <b>${esc(f.teamB.name)}</b><br>
        <span class="muted" style="font-size:12px">${esc(f.round)}${f.venue ? " · " + esc(f.venue) : ""}</span></div>
        <button class="btn sm" style="width:auto">${tbd ? "Set teams" : "Enter score"}</button></div>`);
      row.querySelector("button").onclick = () => tbd ? promptSetTeams(f) : promptScore(f);
      te.appendChild(row);
    });
    wrap.appendChild(secA);

    /* B — All matches (edit any) */
    const secB = h(`<details class="card"><summary style="font-weight:600;cursor:pointer;color:var(--zb-blue)">All ${S.fixtures().length} matches — edit any</summary><div id="allm" style="margin-top:10px"></div></details>`);
    const allm = secB.querySelector("#allm");
    S.fixtures().forEach(f => {
      const fin = f.status === "finished";
      const tbd = f.teamA.tbd || f.teamB.tbd;
      const row = h(`<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)">
        <div style="font-size:13px">${esc(f.teamA.name)} ${fin ? `<b>${f.result.scoreA}–${f.result.scoreB}</b>` : "vs"} ${esc(f.teamB.name)}<br>
        <span class="muted" style="font-size:11px">${esc(f.round)}</span></div>
        <div class="row" style="gap:6px">
          ${tbd ? `<button class="btn ghost sm teams" style="width:auto;padding:4px 8px">Teams</button>` : ""}
          <button class="btn ghost sm score" style="width:auto;padding:4px 8px">Score</button>
        </div></div>`);
      row.querySelector(".score").onclick = () => promptScore(f);
      const tb = row.querySelector(".teams"); if (tb) tb.onclick = () => promptSetTeams(f);
      allm.appendChild(row);
    });
    wrap.appendChild(secB);

    /* C — ZB facts */
    // Announcement (pinned to top of Chat + pings everyone)
    const curAnn = S.announcement ? S.announcement() : null;
    const secAnn = h(`<div class="card"><div class="section-title" style="margin-top:0">📢 Pinned announcement</div>
      <p class="muted" style="font-size:13px;margin:0 0 8px">Pins a highlighted message to the top of Chat and pings everyone's bell. Great for updates &amp; new features.</p>
      <textarea class="input" id="ann" placeholder="e.g. New feature: you can now post photos for +10 pts!" style="min-height:70px">${curAnn ? esc(curAnn.text) : ""}</textarea>
      <button class="btn" id="ann-pin" style="margin-top:10px">${curAnn ? "Update announcement" : "Pin announcement"}</button>
      ${curAnn ? `<button class="btn ghost danger" id="ann-rm" style="margin-top:4px">Remove announcement</button>` : ""}</div>`);
    secAnn.querySelector("#ann-pin").onclick = () => {
      const t = secAnn.querySelector("#ann").value.trim(); if (!t) return toast("Write an announcement first");
      S.setAnnouncement(t); toast("Announcement pinned ✓"); subAdmin();
    };
    const annRm = secAnn.querySelector("#ann-rm"); if (annRm) annRm.onclick = () => { S.clearAnnouncement(); toast("Announcement removed"); subAdmin(); };
    wrap.appendChild(secAnn);

    // Bug reports
    const secBug = h(`<div class="card"><div class="section-title" style="margin-top:0">🐞 Bug reports</div>
      <button class="btn secondary" id="open-bugs">View bug reports</button></div>`);
    secBug.querySelector("#open-bugs").onclick = subBugReports;
    wrap.appendChild(secBug);

    const secC = h(`<div class="card"><div class="section-title" style="margin-top:0">ZB Fun Facts</div></div>`);
    const cb = h(`<button class="btn" style="margin-bottom:8px">+ New ZB Fact</button>`); cb.onclick = () => newZbFact(subAdmin);
    const mb = h(`<button class="btn secondary">View / delete posted facts</button>`); mb.onclick = subZbFacts;
    secC.appendChild(cb); secC.appendChild(mb);
    wrap.appendChild(secC);

    /* D — Players (block / unblock) */
    const secD = h(`<div class="card"><div class="section-title" style="margin-top:0">Players</div><div id="pl"></div></div>`);
    const pl = secD.querySelector("#pl");
    S.allUsers().forEach(u => {
      // Empty account (0 pts, no country, no facts) — either brand-new or possibly reset. Worth a look.
      const looksEmpty = !(u.points) && !u.country && S.factsFor(u.id).length === 0;
      const row = h(`<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">${avatar(u, "sm")}
        <span style="flex:1;font-weight:600;font-size:14px">${esc(u.name)} <span class="muted" style="font-weight:600">· ${u.points || 0} pts</span>
          ${looksEmpty ? `<span class="chip gold" title="No points, country or fun facts — likely a new player, but check it wasn't reset">⚠️ check</span>` : ""}
          ${u.blocked ? `<span class="chip" style="background:#FBEBEB;color:var(--bad)">blocked</span>` : ""}</span>
        <button class="btn ghost sm edit-p" style="width:auto;padding:4px 8px">Edit</button>
        <button class="btn ${u.blocked ? "secondary" : "danger"} sm block-p" style="width:auto">${u.blocked ? "Unblock" : "Block"}</button></div>`);
      row.querySelector(".block-p").onclick = () => { S.toggleBlock(u.id); subAdmin(); };
      row.querySelector(".edit-p").onclick = () => promptEditPlayer(u);
      pl.appendChild(row);
    });
    wrap.appendChild(secD);

    /* E — Tournament winner */
    const t = S.tournament();
    const secE = h(`<div class="card"><div class="section-title" style="margin-top:0">Tournament winner (awards 2,500 pts)</div>
      <select class="input" id="win"><option value="">— pick winning country —</option>
      ${window.ZB_TEAMS.map(tm => `<option value="${tm.code}" ${t.winnerCountryCode === tm.code ? "selected" : ""}>${esc(tm.name)}</option>`).join("")}</select>
      <button class="btn" id="setwin" style="margin-top:12px">Award 2,500 pts to supporters</button></div>`);
    secE.querySelector("#setwin").onclick = () => {
      const c = secE.querySelector("#win").value; if (!c) return toast("Pick a country");
      const tm = window.ZB_TEAM_BY_CODE[c];
      const bg = modal(`<h3>Confirm winner: ${esc(tm.name)}?</h3><p>Every supporter of ${esc(tm.name)} gets +2,500 points.</p>
        <div class="actions"><button class="btn secondary" id="x">Cancel</button><button class="btn" id="ok">Confirm</button></div>`);
      bg.querySelector("#x").onclick = () => bg.remove();
      bg.querySelector("#ok").onclick = () => { S.setTournamentWinner(c); bg.remove(); toast("2,500 pts awarded ✓"); renderApp(); };
    };
    wrap.appendChild(secE);

    setView(wrap);
  }

  function promptEditPlayer(u) {
    const opts = window.ZB_TEAMS.map(t => `<option value="${t.code}" ${u.country && u.country.code === t.code ? "selected" : ""}>${esc(t.name)}</option>`).join("");
    const bg = modal(`<h3>Edit ${esc(u.name)}</h3>
      <p class="muted" style="font-size:13px;margin:0 0 10px">Correct a player's points or country — e.g. to restore data after an issue. Use with care.</p>
      <label class="fld">Points</label>
      <input class="input" id="ep" type="number" inputmode="numeric" value="${u.points || 0}">
      <label class="fld">Country</label>
      <select class="input" id="ec"><option value="">— none —</option>${opts}</select>
      <div class="actions" style="margin-top:16px"><button class="btn secondary" id="x">Cancel</button><button class="btn" id="ok">Save</button></div>`);
    bg.querySelector("#x").onclick = () => bg.remove();
    bg.querySelector("#ok").onclick = () => {
      const pts = parseInt(bg.querySelector("#ep").value, 10);
      const code = bg.querySelector("#ec").value;
      const patch = { points: isNaN(pts) ? 0 : pts };
      patch.country = code ? { code, name: (window.ZB_TEAM_BY_CODE[code] || {}).name || code } : null;
      const r = S.adminUpdateUser(u.id, patch);
      if (r && r.error) return toast(r.error);
      bg.remove(); toast("Player updated ✓"); subAdmin();
    };
  }

  function promptSetTeams(f) {
    const opts = window.ZB_TEAMS.map(t => `<option value="${t.code}">${esc(t.name)}</option>`).join("");
    const bg = modal(`<h3>Set teams</h3><p>${esc(f.round)} — choose the two teams now that they're known.</p>
      <label class="fld">Team A <span class="muted">(now: ${esc(f.teamA.name)})</span></label>
      <select class="input" id="a"><option value="">— keep —</option>${opts}</select>
      <label class="fld">Team B <span class="muted">(now: ${esc(f.teamB.name)})</span></label>
      <select class="input" id="b"><option value="">— keep —</option>${opts}</select>
      <div class="actions" style="margin-top:16px"><button class="btn secondary" id="x">Cancel</button><button class="btn" id="ok">Save</button></div>`);
    bg.querySelector("#x").onclick = () => bg.remove();
    bg.querySelector("#ok").onclick = () => {
      S.setFixtureTeams(f.id, bg.querySelector("#a").value, bg.querySelector("#b").value);
      bg.remove(); toast("Teams updated ✓"); subAdmin();
    };
  }

  /* ---------------- logo ---------------- */
  function logoSVG(cls) { return (window.ZB_LOGO_SVG || "").replace("<svg", `<svg class="${cls}"`); }

  /* ---------------- boot ---------------- */
  // Called by the Firebase store when live data changes, so the screen updates
  // in real time. Skip while a modal is open or the user is typing.
  window.ZB_REFRESH = function () {
    if (document.querySelector(".modal-bg")) return;
    const a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")) return;
    render();
  };
  window.ZB_BOOT = render;
})();
