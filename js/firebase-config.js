/* ============================================================
   ZB Cup — Firebase configuration
   ------------------------------------------------------------
   RIGHT NOW the app runs in DEMO MODE (saves to this browser
   only) so you can preview everything with zero setup.

   TO GO LIVE (shared by all colleagues):
   1. Create a Firebase project (see Documentation/ROADMAP.md, Step 4).
   2. Paste the firebaseConfig values below.
   3. Add your wife's email to ADMIN_EMAILS.
   The app auto-switches to LIVE MODE once real keys are present.
   ============================================================ */

window.ZB_CONFIG = {
  firebase: {
    apiKey: "AIzaSyDBUprTWeYDQsl-BaKM6RZMiDfjwmFTkC8",
    authDomain: "zb-cup.firebaseapp.com",
    projectId: "zb-cup",
    storageBucket: "zb-cup.firebasestorage.app",
    messagingSenderId: "823283973564",
    appId: "1:823283973564:web:992f0cf3bb4b16c98a3fb9"
  },

  // Anyone signing in with one of these emails gets admin powers.
  ADMIN_EMAILS: [
    "donnae.abbood@zimmerbiomet.com"  // Donnae — app admin
  ],

  tournamentName: "2026 FIFA World Cup"
};

// Are we live yet? True only when the apiKey has been filled in.
window.ZB_LIVE = window.ZB_CONFIG.firebase.apiKey !== "PASTE_ME";
