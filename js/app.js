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
  function readImage(file, cb) {
    if (!file) return cb(null);
    const r = new FileReader();
    r.onload = () => {
      // downscale to keep photos small (fits Firestore + localStorage)
      const img = new Image();
      img.onload = () => {
        const max = 320, scale = Math.min(1, max / Math.max(img.width, img.height));
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

  /* ---------------- icons ---------------- */
  const I = {
    ball: '<svg viewBox="0 0 243.596 243.596" width="1em" height="1em" fill="currentColor" style="vertical-align:-0.15em"><path d="M129,7.2A121.8,121.8,0,1,0,250.8,129,121.69,121.69,0,0,0,129,7.2Zm8.7,42.629,26.97-18.777a103.707,103.707,0,0,1,48.864,36.9l-8.337,29-11.817,4.06-55.679-39Zm43.644,64.017L161.55,172.5H96.3L76.654,113.846,129,77.161ZM93.329,31.052,120.3,49.829v12.18l-55.534,39-11.817-4.2L44.609,67.954A103.674,103.674,0,0,1,93.329,31.052ZM73.319,190.767l-26.462,2.247a103.171,103.171,0,0,1-22.112-63.147l22.62-16.53,12.035,4.2L80.134,178.95Zm82.286,39.149A103.764,103.764,0,0,1,129,233.4a110.554,110.554,0,0,1-26.607-3.48l-14.137-30.3,5.582-9.57H164.16l5.582,9.57Zm55.534-36.684-26.462-2.32-6.96-11.817,20.88-61.552,12.035-4.2,22.62,16.53A104.283,104.283,0,0,1,211.139,193.232Z" transform="translate(-7.2 -7.2)"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.9 6.7 19.3l1.1-5.9L3.4 9.3l6-.8z"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 4h10v5a5 5 0 01-10 0zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M9 19h6M12 14v5"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H8l-4 4V5a2 2 0 012-2h13a2 2 0 012 2z"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>',
    crown: '<svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" style="vertical-align:-2px"><path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M3 8a2 2 0 012-2h2l1.5-2h7L18 6h2a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><circle cx="12" cy="12.5" r="3.5"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 00-1.7-1l-.3-2.6H9.4l-.3 2.6a7 7 0 00-1.7 1l-2.3-1-2 3.4L5 11a7 7 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.7 1l.3 2.6h5.2l.3-2.6a7 7 0 001.7-1l2.3 1 2-3.4-2-1.5a7 7 0 00.1-1z"/></svg>',
    zb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 8l8 8M16 8l-8 8"/></svg>'
  };

  /* ---------------- app state ---------------- */
  let tab = "matches";
  let matchFilter = "upcoming";
  let expandedReplies = new Set(); // chat posts whose replies are expanded
  let onb = null; // onboarding working state

  /* =====================================================
     ENTRY
  ===================================================== */
  function render() {
    const u = S.currentUser();
    // 1) Live email mode, not signed in yet → email login (or forgot-password) step
    if (S.emailLogin && !S.authed()) {
      if (!onb || !["email", "forgot"].includes(onb.step)) onb = { step: "email" };
      return renderOnboarding();
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
        <p class="sub">Colleagues guess these to earn points — and you get a 👑 crown each time someone's right. Make them surprising!</p>
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
        <p class="sub">Support a nation in the World Cup. If they win it all, you earn <b>100 points</b> — but once you pick, it's locked. Choose wisely!</p>
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
      <p>${flag(team, "lg")}<br><br>Your country is <b>locked in</b> for the whole tournament. If ${esc(team.name)} win the World Cup you get <b>100 points</b> — but you can't change it later.</p>
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
    shell.querySelector("#my-av").onclick = () => { tab = "more"; renderApp(); };
    shell.querySelectorAll(".tab").forEach(b => b.onclick = () => { tab = b.dataset.tab; renderApp(); });
    drawView();
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

  /* ---------------- MATCHES ---------------- */
  function viewMatches() {
    const all = S.fixtures();
    const now = Date.now();
    const soon = all.filter(f => !f.teamA.tbd && !f.teamB.tbd && f.status !== "finished"
      && new Date(f.kickoff).getTime() > now && new Date(f.kickoff).getTime() - now < 36 * 3600 * 1000
      && !S.myPrediction(f.id)).length;
    const wrap = h(`<div class="screen"><h2>Matches</h2><p class="sub">Predict the winner (5 pts) and the exact score (5 pts).</p></div>`);
    wrap.appendChild(countdownCard());
    if (soon > 0) wrap.appendChild(h(`<div class="banner">${I.ball} ${soon} game${soon > 1 ? "s" : ""} to predict in the next day or two.</div>`));

    const myCode = (S.currentUser().country || {}).code;
    const filters = myCode ? ["upcoming", "finished", "all", "myteam"] : ["upcoming", "finished", "all"];
    const labelFor = k => k === "myteam" ? "My team" : k;
    if (!filters.includes(matchFilter)) matchFilter = "upcoming";
    const chips = h(`<div class="row" style="gap:8px;margin-bottom:14px;flex-wrap:wrap">
      ${filters.map(k => `<button class="chip ${matchFilter === k ? "" : "grey"}" data-k="${k}" style="cursor:pointer;text-transform:capitalize">${labelFor(k)}</button>`).join("")}</div>`);
    chips.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { matchFilter = b.dataset.k; viewMatches(); });
    wrap.appendChild(chips);

    // always list chronologically by kickoff so each date shows all its games together
    let list = all.slice().sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    if (matchFilter === "upcoming") list = list.filter(f => f.status !== "finished");
    else if (matchFilter === "finished") list = list.filter(f => f.status === "finished");
    else if (matchFilter === "myteam") list = list.filter(f => myCode && (f.teamA.code === myCode || f.teamB.code === myCode));

    if (!list.length) wrap.appendChild(h(`<div class="empty">${I.ball}<p>${matchFilter === "myteam" ? "Your team's fixtures will appear here." : "No matches here yet."}</p></div>`));
    let lastDate = "";
    list.forEach(f => {
      const d = new Date(f.kickoff).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
      if (d !== lastDate) { wrap.appendChild(h(`<div class="section-title">${d}</div>`)); lastDate = d; }
      wrap.appendChild(matchCard(f));
    });
    setView(wrap);
  }

  function teamSide(team, isMine) {
    const badge = team.tbd
      ? `<span class="flag lg" style="display:inline-flex;align-items:center;justify-content:center;color:var(--muted);font-weight:800">?</span>`
      : flag(team, "lg");
    return `<div class="match-side">${badge}<span>${esc(team.name)}${isMine ? ` <span style="color:var(--zb-blue)" title="Your team">★</span>` : ""}</span></div>`;
  }

  function matchCard(f, onSaved) {
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

    if (tbd && !finished) {
      area.appendChild(h(`<div class="divider"></div><p class="muted center" style="font-size:13px;margin:0">Teams confirmed after the group stage.</p>`));
      if (S.isAdmin()) area.appendChild(adminScoreBtn(f));
      return card;
    }

    if (finished) {
      if (pred) {
        const realWinner = f.result.scoreA > f.result.scoreB ? "A" : f.result.scoreB > f.result.scoreA ? "B" : "draw";
        const winOk = pred.winner === realWinner;
        const scoreOk = pred.scoreA === f.result.scoreA && pred.scoreB === f.result.scoreB;
        const pts = (winOk ? 5 : 0) + (scoreOk ? 5 : 0);
        area.appendChild(h(`<div class="divider"></div>
          <div class="row between"><span class="muted" style="font-size:13px">Your pick: ${pred.scoreA}–${pred.scoreB}</span>
          <span class="chip ${pts ? "good" : "grey"}">${pts ? "+" + pts + " pts" : "0 pts"}</span></div>
          <div style="font-size:12px;margin-top:6px" class="muted">${winOk ? "✅ Winner" : "❌ Winner"} · ${scoreOk ? "✅ Exact score" : "❌ Exact score"}</div>`));
      } else {
        area.appendChild(h(`<div class="divider"></div><p class="muted center" style="font-size:13px;margin:0">You didn't predict this one.</p>`));
      }
      // admin can re-score
      if (S.isAdmin()) area.appendChild(adminScoreBtn(f));
      return card;
    }

    if (kicked) { // kicked off but no result yet — predictions closed
      area.appendChild(h(`<div class="divider"></div><p class="muted center" style="font-size:13px;margin:0">${pred ? "Your pick: " + pred.scoreA + "–" + pred.scoreB + " · locked at kickoff" : "Predictions closed at kickoff."}</p>`));
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
        <div><div style="font-weight:600">${esc(u.name)} ${u.crowns ? `<span class="crown">${I.crown}</span>`.repeat(Math.min(u.crowns, 3)) : ""}</div>
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
      <p>Correct = 20 pts + a crown for them. You have <b id="gl"></b> wrong guess(es) left today — get one right to keep going!</p>
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
    const wrap = h(`<div class="screen"><h2>Leaderboard</h2><p class="sub">Live ranking. Earn points from matches, fun facts, and your country.</p></div>`);
    const card = h(`<div class="card"></div>`);
    board.forEach((u, i) => {
      const row = h(`<div class="lb-row ${i === 0 ? "top1" : ""} ${u.id === me.id ? "me" : ""}">
        <span class="lb-rank">${i + 1}</span>
        ${avatar(u, "sm")}
        ${u.country ? `<img class="flag" src="${window.ZB_FLAG(u.country.code)}" alt="${esc(u.country.name)}" title="${esc(u.country.name)}" loading="lazy" style="width:24px;height:17px">` : ""}
        <span class="lb-name">${esc(u.name)}${u.id === me.id ? " (you)" : ""} ${u.crowns ? `<span class="crown">${I.crown}</span>` : ""}</span>
        <span class="chip points">${u.points}</span>
      </div>`);
      card.appendChild(row);
    });
    wrap.appendChild(card);
    setView(wrap);
  }

  /* ---------------- CHAT ---------------- */
  function viewChat() {
    const me = S.currentUser();
    const wrap = h(`<div class="screen" style="padding-bottom:120px"><h2>Chat</h2><p class="sub">Say hi, share your predictions, and give "Goals" ⚽ to cheer colleagues on.</p><div id="feed"></div></div>`);
    const feed = wrap.querySelector("#feed");
    const blockedIds = new Set(S.allUsers().filter(u => u.blocked).map(u => u.id));
    const posts = S.posts().filter(p => !blockedIds.has(p.authorId)); // hide blocked users' posts
    if (!posts.length) feed.appendChild(h(`<div class="empty">${I.chat}<p>No messages yet. Start the conversation!</p></div>`));
    posts.forEach(p => {
      const mine = p.authorId === me.id;
      const on = p.goaledBy.includes(me.id);
      const replies = (p.replies || []).filter(r => !blockedIds.has(r.authorId));
      const post = h(`<div class="post">${avatar({ name: p.authorName, photoURL: p.authorPhoto }, "sm")}
        <div class="body">
          <div class="meta"><b style="color:var(--ink)">${esc(p.authorName)}</b><span>· ${timeAgo(p.createdAt)}</span>
            ${mine || S.isAdmin() ? `<button class="del btn ghost" style="margin-left:auto;width:auto;padding:0;font-size:12px">Delete</button>` : ""}</div>
          <div>${esc(p.text)}</div>
          <div class="row" style="gap:18px;margin-top:8px;flex-wrap:wrap">
            <button class="goal-btn ${on ? "on" : ""}">${I.ball}<span>${p.goals} Goal${p.goals === 1 ? "" : "s"}</span></button>
            <button class="reply-btn goal-btn">💬 <span>Reply</span></button>
            ${replies.length ? `<button class="toggle-btn goal-btn"><span>${expandedReplies.has(p.id) ? "Hide replies" : "View " + replies.length + " repl" + (replies.length === 1 ? "y" : "ies")}</span></button>` : ""}
          </div>
          <div class="replies"></div>
          <div class="reply-box" style="display:none"></div>
        </div></div>`);
      post.querySelector(".goal-btn").onclick = () => { S.toggleGoal(p.id); viewChat(); };
      const del = post.querySelector(".del"); if (del) del.onclick = () => { S.deletePost(p.id); viewChat(); };
      const toggle = post.querySelector(".toggle-btn");
      if (toggle) toggle.onclick = () => { expandedReplies.has(p.id) ? expandedReplies.delete(p.id) : expandedReplies.add(p.id); viewChat(); };

      const repWrap = post.querySelector(".replies");
      if (replies.length && expandedReplies.has(p.id)) {
        repWrap.style.cssText = "margin-top:10px;padding-left:10px;border-left:2px solid var(--line);display:flex;flex-direction:column;gap:8px";
        replies.forEach(r => {
          const rmine = r.authorId === me.id;
          const rr = h(`<div class="post" style="margin:0">${avatar({ name: r.authorName, photoURL: r.authorPhoto }, "sm")}
            <div class="body" style="background:#F7F9FB">
              <div class="meta"><b style="color:var(--ink)">${esc(r.authorName)}</b><span>· ${timeAgo(r.createdAt)}</span>
                ${rmine || S.isAdmin() ? `<button class="rdel btn ghost" style="margin-left:auto;width:auto;padding:0;font-size:12px">Delete</button>` : ""}</div>
              <div>${esc(r.text)}</div>
            </div></div>`);
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
    const comp = h(`<div class="composer"><input id="c-in" placeholder="Write a message…" maxlength="280"><button class="btn sm" id="c-send">Post</button></div>`);
    root.appendChild(comp);
    const send = () => {
      const inp = comp.querySelector("#c-in"); const t = inp.value.trim();
      if (!t) return;
      const r = S.addPost(t); if (r && r.error) return toast(r.error);
      inp.value = ""; viewChat();
      setTimeout(() => { const f = root.querySelector("#feed"); if (f) f.lastElementChild.scrollIntoView({ behavior: "smooth" }); }, 50);
    };
    comp.querySelector("#c-send").onclick = send;
    comp.querySelector("#c-in").addEventListener("keydown", e => { if (e.key === "Enter") send(); });
  }

  /* ---------------- MORE (ZB facts / rules / settings) ---------------- */
  function viewMore() {
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

    if (upcoming.length) {
      wrap.appendChild(h(`<div class="section-title">Upcoming — tap to edit before kickoff</div>`));
      upcoming.forEach(f => wrap.appendChild(matchCard(f, subPredictions)));
    }
    if (finished.length) {
      wrap.appendChild(h(`<div class="section-title">Past results</div>`));
      finished.forEach(f => wrap.appendChild(matchCard(f, subPredictions)));
    }
    setView(wrap);
  }

  function subZbFacts() {
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
      <p>Sign up with your name and work email — no password. Add a photo and pick a country to support.</p>
      <div class="section-title">Your country (100 pts)</div>
      <p>Pick one nation. <b>It locks immediately</b> and can't be changed. If they win the whole World Cup, you score <b>100 points</b>.</p>
      <div class="section-title">Match predictions (up to 10 pts/game)</div>
      <p>For each game predict the <b>winner</b> (+5) and the <b>exact score</b> (+5). Predictions lock at kickoff.</p>
      <div class="section-title">Fun facts (20 pts each)</div>
      <p>Set 3 multiple-choice facts about yourself. Then guess colleagues' facts for <b>20 points</b> each — they earn a 👑 crown, and answers stay hidden until you get it right. You get <b>3 wrong guesses per day</b>: keep guessing as long as you're right, but 3 wrong and you're done until tomorrow. So choose carefully!</p>
      <div class="section-title">Leaderboard</div>
      <p>All your points add up here, live. Highest total wins bragging rights.</p>
      <div class="section-title">Chat & Goals</div>
      <p>Post messages and give <b>Goals</b> ⚽ to show kudos.</p>
      <div class="section-title">ZB Fun Facts</div>
      <p>Read facts about Zimmer Biomet posted by the admin.</p>`;
  }
  function subRules() {
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
        : "Set 3 fun facts so colleagues can guess them (you earn a 👑 each time). They lock once all 3 are saved."}</p>
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

    setView(wrap);
    card.querySelector("#s-photo").onclick = () => card.querySelector("#s-file").click();
    card.querySelector("#s-file").onchange = e => readImage(e.target.files[0], d => { if (d) { S.updateProfile({ photoURL: d }); card.querySelector("#s-prev").innerHTML = avatar(S.currentUser(), "lg"); } });
    card.querySelector("#s-save").onclick = () => { const n = card.querySelector("#s-name").value.trim(); if (!n) return toast("Name can't be empty"); S.updateProfile({ name: n }); toast("Saved ✓"); renderApp(); };
    card.querySelector("#s-out").onclick = () => { S.signOut(); onb = null; tab = "matches"; render(); };
  }

  function subAdmin() {
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
    const secC = h(`<div class="card"><div class="section-title" style="margin-top:0">ZB Fun Facts</div></div>`);
    const cb = h(`<button class="btn" style="margin-bottom:8px">+ New ZB Fact</button>`); cb.onclick = () => newZbFact(subAdmin);
    const mb = h(`<button class="btn secondary">View / delete posted facts</button>`); mb.onclick = subZbFacts;
    secC.appendChild(cb); secC.appendChild(mb);
    wrap.appendChild(secC);

    /* D — Players (block / unblock) */
    const secD = h(`<div class="card"><div class="section-title" style="margin-top:0">Players</div><div id="pl"></div></div>`);
    const pl = secD.querySelector("#pl");
    S.allUsers().forEach(u => {
      const row = h(`<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">${avatar(u, "sm")}
        <span style="flex:1;font-weight:600;font-size:14px">${esc(u.name)} ${u.blocked ? `<span class="chip" style="background:#FBEBEB;color:var(--bad)">blocked</span>` : ""}</span>
        <button class="btn ${u.blocked ? "secondary" : "danger"} sm" style="width:auto">${u.blocked ? "Unblock" : "Block"}</button></div>`);
      row.querySelector("button").onclick = () => { S.toggleBlock(u.id); subAdmin(); };
      pl.appendChild(row);
    });
    wrap.appendChild(secD);

    /* E — Tournament winner */
    const t = S.tournament();
    const secE = h(`<div class="card"><div class="section-title" style="margin-top:0">Tournament winner (awards 100 pts)</div>
      <select class="input" id="win"><option value="">— pick winning country —</option>
      ${window.ZB_TEAMS.map(tm => `<option value="${tm.code}" ${t.winnerCountryCode === tm.code ? "selected" : ""}>${esc(tm.name)}</option>`).join("")}</select>
      <button class="btn" id="setwin" style="margin-top:12px">Award 100 pts to supporters</button></div>`);
    secE.querySelector("#setwin").onclick = () => {
      const c = secE.querySelector("#win").value; if (!c) return toast("Pick a country");
      const tm = window.ZB_TEAM_BY_CODE[c];
      const bg = modal(`<h3>Confirm winner: ${esc(tm.name)}?</h3><p>Every supporter of ${esc(tm.name)} gets +100 points.</p>
        <div class="actions"><button class="btn secondary" id="x">Cancel</button><button class="btn" id="ok">Confirm</button></div>`);
      bg.querySelector("#x").onclick = () => bg.remove();
      bg.querySelector("#ok").onclick = () => { S.setTournamentWinner(c); bg.remove(); toast("100 pts awarded ✓"); renderApp(); };
    };
    wrap.appendChild(secE);

    setView(wrap);
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
