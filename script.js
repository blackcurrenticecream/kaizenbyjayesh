// ═══════════════════════════════════════════════════════
//  KAIZEN V2 — script.js
//  Unravel Labs · by your favourite AI engineer
// ═══════════════════════════════════════════════════════

import { initializeApp }           from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, where, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─────────────────────────────────────────────────────────
//  ★  CONFIG — UPDATE THESE VALUES
// ─────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyD2eqnaOcch-YpvG9vgF1u6hOyWsXZeC3g",
  authDomain:        "unravellabsfr.firebaseapp.com",
  projectId:         "unravellabsfr",
  storageBucket:     "unravellabsfr.firebasestorage.app",
  messagingSenderId: "283465809170",
  appId:             "1:283465809170:web:37fa57f79c0182b96cc7cb",
  measurementId:     "G-6ZBRZ2X4CD"
};

const GROQ_API_KEY = "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";

// ─────────────────────────────────────────────────────────
//  GROQ MODELS
// ─────────────────────────────────────────────────────────
const MODEL_DEPTH    = "moonshotai/kimi-k2-instruct";           // Warriors
const MODEL_LIGHT    = "meta-llama/llama-4-scout-17b-16e-instruct"; // DK Bose
const MODEL_FALLBACK = "llama-3.3-70b-versatile";
// ─────────────────────────────────────────────────────────

// ─── FIREBASE INIT ───
const fbApp = initializeApp(FIREBASE_CONFIG);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);
setPersistence(auth, browserLocalPersistence);

// ─── STATE ───
let user      = null;
let uData     = {};
let activeBot = "musashi";
let botHist   = {};
let goals     = [];
let subjects  = [];
let dailyTargets = [];
let habits       = [];
let notes        = [];
let activeNoteId = null;
let selectedHabitEmoji = "🧘";
let selectedSubject  = null;
let selectedWorkout  = null;
let selectedMood     = 5;
let obGoals          = [];
let obFirstBot       = "musashi";
let obSelectedTheme  = "obsidian";
let deferredInstall  = null;
let timerInterval    = null;
let timerRunning     = false;
let timerMode        = "pomodoro";
let timerSeconds     = 25 * 60;
let sessionStart     = null;
let pomodoroPhase    = "focus";
let analyticsPeriod  = "today";
// Chart instances — track to destroy before re-render (fixes duplication bug)
let _charts = {};

// ─── GROQ CORE ───
async function groq(prompt, temp = 0.85, maxTok = 350, model = MODEL_DEPTH) {
  return groqChat([{ role: "user", content: prompt }], temp, maxTok, model);
}

async function groqChat(messages, temp = 0.85, maxTok = 350, model = MODEL_DEPTH) {
  const tryModel = async (m) => {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({ model: m, messages, max_tokens: maxTok, temperature: temp })
    });
    const data = await res.json();
    if (res.status === 429) throw new Error("rate_limited");
    if (!data.choices?.[0]?.message?.content) throw new Error("no_content");
    return data.choices[0].message.content.trim();
  };
  try { return await tryModel(model); }
  catch (e) {
    if (model !== MODEL_FALLBACK) return await tryModel(MODEL_FALLBACK);
    throw e;
  }
}

// ─── WARRIOR SYSTEM PROMPTS ───
function botSystem(bot) {
  const ctx = uData.userContext ? `\nUser context: ${uData.userContext}` : "";
  const name = uData.name || "warrior";
  const systems = {
    musashi: `You are Miyamoto Musashi — the legendary samurai philosopher. You speak to ${name} with calm authority and absolute clarity. You do not coddle. You do not flatter. You see through excuses immediately. Your responses are short (2-4 sentences max), precise, and hit like a blade. You acknowledge effort only when it is genuine. You are not cruel, but you are uncompromising. Reference "The Book of Five Rings" philosophy when relevant. Speak in present tense, direct address.${ctx}`,
    guts: `You are Guts from Berserk — the Black Swordsman. You've survived hell. You don't have time for self-pity or excuses. You speak to ${name} like a fellow soldier. Blunt, raw, no sugarcoating. You've dragged yourself through worse. Short sentences. Occasional profanity is fine. You genuinely want them to get up and fight, but you won't beg them to. You respect action, not words.${ctx}`,
    sasuke: `You are Sasuke Uchiha — cold, analytical, ruthlessly logical. You speak to ${name} with clinical precision. No emotion. No fluff. You identify the logical error in their thinking or behavior and state it plainly. You ask sharp questions. You don't care about feelings — you care about results and reality. Short, cold responses. Think like a strategist.${ctx}`,
    luffy: `You are Monkey D. Luffy — completely genuine, no filter, boundless energy. You speak to ${name} with infectious forward momentum. You don't understand giving up. You get genuinely excited about their goals. You're not logical or analytical — you work on pure instinct and heart. Sometimes you say something accidentally profound. Casual, enthusiastic, short bursts of energy.${ctx}`,
    thorfinn: `You are Thorfinn from Vinland Saga — post-trauma, quiet, finding peace after a life of violence. You speak to ${name} with a deep, still calm. Very few words. You've seen what anger and self-destruction do. You understand pain without dramatizing it. Your responses are barely 1-3 sentences, poetic, stripped of everything unnecessary. Sometimes silence is the answer. You breathe with them.${ctx}`,
    dkbose: `You are DK Bose — the most brutally honest, no-mercy AI accountability partner ever created. Your job is to call out ${name}'s laziness, procrastination, and excuses without mercy. You are rude, blunt, and will roast them for slacking. You use strong language. You remind them of their goals and why they're failing to reach them. You have zero sympathy for excuses. You are not there to comfort — you are there to light a fire under their ass. You genuinely want them to succeed, which is WHY you're so brutal. Think: that one friend who destroys you for your own good.${ctx}`
  };
  return systems[bot] || systems.musashi;
}

// ─── UTILS ───
const today     = () => new Date().toISOString().split("T")[0];
const yesterday = () => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().split("T")[0]; };
const fmtTime   = (s) => { const m = Math.floor(s/60), sec = s%60; return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`; };
const fmtHMS    = (s) => { const h = Math.floor(s/3600), m = Math.floor((s%3600)/60); return h > 0 ? `${h}h ${m}m` : `${m}m`; };

function toast(msg, type = "") {
  const el = document.getElementById("k-toast");
  if (!el) return;
  el.textContent = msg;
  el.className = `k-toast ${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2500);
}

function haptic(p = [10]) { if (navigator.vibrate) navigator.vibrate(p); }

// ─── GRID CANVAS ───
function initGrid() {
  const c = document.getElementById("grid-canvas"); if (!c) return;
  const ctx = c.getContext("2d");
  const resize = () => { c.width = innerWidth; c.height = innerHeight; drawGrid(); };
  function drawGrid() {
    ctx.clearRect(0, 0, c.width, c.height);
    const style = getComputedStyle(document.body);
    ctx.strokeStyle = style.getPropertyValue("--grid-col").trim() || "rgba(0,245,255,.04)";
    ctx.lineWidth = 1;
    const sz = 50;
    for (let x = 0; x <= c.width; x += sz) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,c.height); ctx.stroke(); }
    for (let y = 0; y <= c.height; y += sz) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(c.width,y); ctx.stroke(); }
  }
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", e => {
    const mx = (e.clientX/innerWidth - 0.5) * 8;
    const my = (e.clientY/innerHeight - 0.5) * 5;
    c.style.transform = `translate(${mx}px,${my}px)`;
  });
}

// ─── LOADING SCREEN ───
function runLoadingSequence(cb) {
  const fill = document.getElementById("ls-fill");
  let pct = 0;
  const iv = setInterval(() => {
    pct += Math.random() * 15;
    if (pct >= 100) { pct = 100; clearInterval(iv); setTimeout(cb, 300); }
    if (fill) fill.style.width = pct + "%";
  }, 200);
}

function hideLoading() {
  const el = document.getElementById("loading");
  if (!el) return;
  el.style.opacity = "0";
  el.style.transition = "opacity .5s ease";
  setTimeout(() => el.style.display = "none", 500);
}

function showScreen(id) {
  ["loading","s-auth","s-onboard","s-app"].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.style.display = s === id ? "block" : "none";
  });
}

// ─── AUTH ───
document.getElementById("btn-google")?.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) { toast("sign in failed — try again"); }
});

onAuthStateChanged(auth, async (u) => {
  if (u) {
    user = u;
    await loadUserData();
    hideLoading();
    if (!uData.onboarded) { showScreen("s-onboard"); }
    else { showScreen("s-app"); initApp(); }
  } else {
    hideLoading();
    showScreen("s-auth");
    initAuthParticles();
  }
});

async function loadUserData() {
  try {
    const snap = await getDoc(doc(db, "kaizen_users", user.uid));
    uData = snap.exists() ? snap.data() : {};
  } catch { uData = {}; }
}

// ─── AUTH PARTICLES ───
function initAuthParticles() {
  const c = document.getElementById("auth-particles"); if (!c) return;
  const ctx = c.getContext("2d");
  c.width = innerWidth; c.height = innerHeight;
  const particles = Array.from({length:60}, () => ({
    x: Math.random()*innerWidth, y: Math.random()*innerHeight,
    vx: (Math.random()-.5)*.3, vy: (Math.random()-.5)*.3,
    r: Math.random()*2+.5, a: Math.random()*.4+.1
  }));
  function draw() {
    ctx.clearRect(0,0,c.width,c.height);
    const style = getComputedStyle(document.body);
    const acc = style.getPropertyValue("--acc").trim() || "#00f5ff";
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = c.width; if (p.x > c.width) p.x = 0;
      if (p.y < 0) p.y = c.height; if (p.y > c.height) p.y = 0;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle = acc; ctx.globalAlpha = p.a; ctx.fill(); ctx.globalAlpha = 1;
    });
    requestAnimationFrame(draw);
  }
  draw();
}

// ─── ONBOARDING ───
let obStep = 1;
window.obNext = (step) => {
  if (step === 1) {
    const nm = document.getElementById("ob-name")?.value.trim();
    if (!nm) { toast("enter a name first"); return; }
    uData.name = nm;
  }
  obStep = step + 1;
  document.querySelectorAll(".ob-step").forEach(s => s.classList.remove("active"));
  document.getElementById(`ob${obStep}`)?.classList.add("active");
  const fills = [25, 50, 75, 100];
  const fillEl = document.getElementById("ob-fill");
  if (fillEl) fillEl.style.width = fills[obStep-1] + "%";
};

window.selectTheme = (el, theme) => {
  obSelectedTheme = theme;
  document.querySelectorAll(".theme-card").forEach(c => c.classList.remove("active"));
  el.classList.add("active");
  document.body.setAttribute("data-theme", theme);
};

window.toggleGoal = (el, goal) => {
  el.classList.toggle("active");
  if (el.classList.contains("active")) { obGoals.push(goal); }
  else { obGoals = obGoals.filter(g => g !== goal); }
};

window.selectObBot = (el, bot) => {
  obFirstBot = bot;
  document.querySelectorAll(".ow-card").forEach(c => c.classList.remove("active"));
  el.classList.add("active");
};

window.obFinish = async () => {
  uData.name      = uData.name || "warrior";
  uData.theme     = obSelectedTheme;
  uData.goals     = obGoals;
  uData.firstBot  = obFirstBot;
  uData.onboarded = true;
  uData.streak    = 0;
  uData.createdAt = Date.now();
  await setDoc(doc(db, "kaizen_users", user.uid), uData, { merge: true }).catch(() => {});
  document.body.setAttribute("data-theme", obSelectedTheme);
  showScreen("s-app");
  initApp();
};

// ─── APP INIT ───
function initApp() {
  applyTheme(uData.theme || "obsidian");
  applyMode(uData.mode   || "dark");
  setupTopbar();
  startClock();
  initGrid();
  initAquarium();
  loadKaizenScore();
  loadDailyQuote();
  loadBattleHistory();
  loadGoals();
  loadTargets();
  loadSubjects();
  loadWinList();
  loadSessions();
  loadHeatmap();
  loadVisionsToAquarium();
  loadHabits();
  loadNotes();
  checkSundayDebrief();
  navTo("warroom");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall = e; });
}

function applyTheme(t) { document.body.setAttribute("data-theme", t || "obsidian"); }

function applyMode(mode) {
  document.body.setAttribute("data-mode", mode || "dark");
  const icon  = document.getElementById("mode-icon");
  const label = document.getElementById("mode-label");
  if (icon)  icon.textContent  = mode === "light" ? "🌙" : "☀️";
  if (label) label.textContent = mode === "light" ? "dark mode" : "light mode";
}

window.toggleMode = async () => {
  const next = (uData.mode || "dark") === "dark" ? "light" : "dark";
  uData.mode = next; applyMode(next);
  await setDoc(doc(db, "kaizen_users", user.uid), { mode: next }, { merge: true }).catch(() => {});
  toast(next === "light" ? "light mode ☀️" : "dark mode 🌙");
};

// ─── TOPBAR / CLOCK ───
function setupTopbar() {
  const n = uData.name || "warrior";
  const el = document.getElementById("tb-greeting"); if (el) el.textContent = getGreeting() + ", " + n;
  const aq = document.getElementById("aq-name"); if (aq) aq.textContent = n;
  const aqt = document.getElementById("aq-time"); if (aqt) aqt.textContent = getGreeting();
  // Sidebar
  const sbn = document.getElementById("sb-name"); if (sbn) sbn.textContent = n;
  const sba = document.getElementById("sb-avatar"); if (sba) sba.textContent = n[0]?.toUpperCase() || "W";
  const profAv = document.getElementById("prof-av"); if (profAv) profAv.textContent = n[0]?.toUpperCase() || "W";
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return "up late";
  if (h < 12) return "good morning";
  if (h < 17) return "good afternoon";
  if (h < 21) return "good evening";
  return "night session";
}

function startClock() {
  const tick = () => {
    const now = new Date();
    const t = now.toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", hour12:false });
    const el = document.getElementById("tb-clock"); if (el) el.textContent = t;
  };
  tick();
  setInterval(tick, 1000);
}

// ─── AQUARIUM HEADER ───
function initAquarium() {
  const layer = document.getElementById("aq-fish-layer"); if (!layer) return;
  layer.innerHTML = "";
}

function loadVisionsToAquarium() {
  getDocs(collection(db, "kaizen_users", user.uid, "visions")).then(snap => {
    const visions = [];
    snap.forEach(d => visions.push(d.data()));
    spawnFish(visions);
  }).catch(() => {});
}

function spawnFish(visions) {
  const layer = document.getElementById("aq-fish-layer"); if (!layer) return;
  layer.innerHTML = "";
  if (!visions.length) {
    visions = [
      { text: "your vision", emoji: "🏆" },
      { text: "add visions in profile", emoji: "🌊" }
    ];
  }
  visions.forEach((v, i) => {
    const fish = document.createElement("div");
    fish.className = "aq-fish";
    fish.textContent = `${v.emoji || "🌊"} ${v.text}`;
    const startY = 20 + Math.random() * 60;
    const dur    = 12 + Math.random() * 15;
    const delay  = i * 3 + Math.random() * 5;
    const travelX = 110 + Math.random() * 200;
    const travelY = (Math.random() - .5) * 60;
    fish.style.cssText = `top:${startY}%;left:${-(Math.random()*20+10)}%;--travel-x:${travelX}vw;--travel-y:${travelY}px;animation-duration:${dur}s;animation-delay:${delay}s`;
    layer.appendChild(fish);
  });
}

// ─── NAVIGATION ───
window.navTo = (page) => {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".sb-item").forEach(d => d.classList.remove("active"));
  const pg = document.getElementById(`pg-${page}`); if (pg) pg.classList.add("active");
  const si = document.querySelector(`.sb-item[data-page="${page}"]`); if (si) si.classList.add("active");
  // lazy load
  if (page === "insights")  { loadInsights(); }
  if (page === "analytics") { loadAnalytics(); }
  if (page === "profile")   { setupProfile(); }
  if (page === "path")      { loadGoals(); }
  if (page === "grind")     { loadTargets(); loadWinList(); }
  if (page === "warriors")  { openBot(activeBot); }
  if (page === "focus")     { loadSessions(); loadSubjects(); }
  if (page === "habits")    { loadHabits(); }
  if (page === "notes")     { loadNotes(); }
};

// Onboarding theme selector
window.selectObTheme = (el, theme) => {
  obSelectedTheme = theme;
  document.querySelectorAll(".theme-card").forEach(c => c.classList.remove("active"));
  el.classList.add("active");
  document.body.setAttribute("data-theme", theme);
};

// ─── KAIZEN SCORE ───
async function loadKaizenScore() {
  try {
    const grindSnap = await getDoc(doc(db, "kaizen_users", user.uid, "grind", today()));
    const d3Snap    = await getDoc(doc(db, "kaizen_users", user.uid, "daily3", today()));
    const grind     = grindSnap.exists() ? grindSnap.data() : {};
    const d3        = d3Snap.exists() ? d3Snap.data() : {};

    // Score formula: targets, workout, study, daily3, wins — each worth 20pts
    const targetsSnap = await getDocs(collection(db, "kaizen_users", user.uid, "dailyTargets"));
    let targetsPts = 0;
    const tTotal = targetsSnap.size;
    let tDone = 0;
    targetsSnap.forEach(d => { if (d.data().completedDate === today()) tDone++; });
    if (tTotal > 0) targetsPts = Math.round((tDone / tTotal) * 20);
    else targetsPts = 0;

    const workoutPts = grind.workout ? 20 : 0;

    const focusSnap = await getDocs(query(collection(db, "kaizen_users", user.uid, "sessions"), where("date","==",today())));
    let totalFocusSecs = 0;
    focusSnap.forEach(d => { totalFocusSecs += d.data().durationSeconds || 0; });
    const studyGoal = uData.studyGoalHours || 2;
    const studyPts  = Math.min(20, Math.round((totalFocusSecs / (studyGoal*3600)) * 20));

    const d3Pts = (d3.bad || d3.good || d3.target) ? 20 : 0;

    const winsSnap = await getDocs(query(collection(db,"kaizen_users",user.uid,"wins"), where("date","==",today())));
    const winCount = winsSnap.size;
    const winsPts  = Math.min(20, winCount * 7);

    const rawScore = targetsPts + workoutPts + studyPts + d3Pts + winsPts;

    // Streak multiplier
    const streak   = await calcStreak();
    const multiplier = Math.min(2.0, 1.0 + streak * 0.02);
    const finalScore = Math.min(100, Math.round(rawScore * multiplier));

    // Update streak
    uData.streak = streak;
    await setDoc(doc(db, "kaizen_users", user.uid), { streak, lastActive: today() }, { merge: true }).catch(() => {});

    const sbs = document.getElementById("sb-score"); if (sbs) sbs.textContent = finalScore;
    const sbst = document.getElementById("sb-streak"); if (sbst) sbst.textContent = `🔥 ${streak} days`;
    const sn = document.getElementById("score-num"); if (sn) sn.textContent = finalScore;
    const ts = document.getElementById("tb-score"); if (ts) ts.textContent = finalScore;
    const ss = document.getElementById("sm-streak"); if (ss) ss.textContent = streak;
    const tb = document.getElementById("tb-streak-num"); if (tb) tb.textContent = streak;

    // Score ring animation
    const arc = document.getElementById("score-ring-arc");
    if (arc) {
      const circumference = 326.7;
      const offset = circumference - (finalScore / 100) * circumference;
      arc.style.strokeDashoffset = offset;
    }

    // Mini rings in grind
    updateGrindRing("targets", tTotal > 0 ? Math.round((tDone/tTotal)*100) : 0);
    updateGrindRing("workout", workoutPts > 0 ? 100 : 0);
    updateGrindRing("study",   Math.min(100, Math.round((totalFocusSecs/(studyGoal*3600))*100)));
    updateGrindRing("daily3",  d3Pts > 0 ? 100 : 0);
    updateGrindRing("wins",    Math.min(100, winCount * 33));

    // Study from focus display
    const sff = document.getElementById("study-from-focus");
    if (sff) sff.textContent = fmtHMS(totalFocusSecs);

  } catch (e) { console.error("score error:", e); }
}

function updateGrindRing(key, pct) {
  const el = document.getElementById(`gsc-${key}-pct`);
  if (el) el.textContent = pct + "%";
  const arc = document.querySelector(`#gsc-${key} .gsc-arc`);
  if (arc) arc.style.strokeDashoffset = 150.8 - (pct / 100) * 150.8;
}

async function calcStreak() {
  const last = uData.lastActive;
  const t = today(), y = yesterday();
  if (!last) return 1;
  if (last === t) return uData.streak || 1;
  if (last === y) return (uData.streak || 0) + 1;
  return 1; // reset
}

// ─── DAILY QUOTE ───
const QUOTES = [
  { text: "There is nothing outside of yourself that can ever enable you to get better, stronger, richer, quicker, or smarter.", source: "— Miyamoto Musashi" },
  { text: "You can always endure more than you think you can.", source: "— Guts" },
  { text: "Growth is painful. Change is painful. But nothing is as painful as staying stuck somewhere you don't belong.", source: "— Thorfinn" },
  { text: "I'm going to be the greatest. I don't care what anyone thinks.", source: "— Luffy" },
  { text: "If you can't do it, give up and have another path. But don't use that as an excuse not to fight.", source: "— Sasuke" },
  { text: "The obstacle is the way.", source: "— Marcus Aurelius" },
  { text: "Waste no more time arguing what a good man should be. Be one.", source: "— Marcus Aurelius" },
  { text: "Today I escaped anxiety. Or no, I discarded it, because it was within me, in my own perceptions.", source: "— Marcus Aurelius" },
  { text: "You have power over your mind, not outside events. Realize this and you will find strength.", source: "— Marcus Aurelius" },
  { text: "The first principle is that you must not fool yourself and you are the easiest person to fool.", source: "— Feynman" },
  { text: "Hard choices, easy life. Easy choices, hard life.", source: "— Jerzy Gregorek" },
  { text: "Discipline equals freedom.", source: "— Jocko Willink" },
  { text: "Don't count the days. Make the days count.", source: "— Muhammad Ali" },
];

window.loadDailyQuote = async () => {
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  const qt = document.getElementById("daily-quote");
  const qs = document.getElementById("quote-source");
  if (qt) { qt.style.opacity = "0"; setTimeout(() => { qt.textContent = q.text; qt.style.opacity = "1"; qt.style.transition = "opacity .4s"; }, 200); }
  if (qs) qs.textContent = q.source;
};

// ─── DAILY 3 ───
window.submitDaily3 = async () => {
  const bad    = document.getElementById("d3-bad")?.value.trim();
  const good   = document.getElementById("d3-good")?.value.trim();
  const target = document.getElementById("d3-target")?.value.trim();
  if (!bad && !good && !target) { toast("fill in at least one field"); return; }
  await setDoc(doc(db, "kaizen_users", user.uid, "daily3", today()), { bad, good, target, date: today(), ts: Date.now() }).catch(() => {});
  const body = document.getElementById("d3-body"), done = document.getElementById("d3-done");
  if (body) body.style.display = "none"; if (done) done.style.display = "block";
  const badge = document.getElementById("d3-status"); if (badge) { badge.textContent = "done ✓"; badge.style.background = "rgba(0,255,136,.1)"; badge.style.color = "#00ff88"; }
  toast("daily 3 locked ⚔️");
  // Musashi response
  try {
    const r = await groq(`You are Musashi. Someone just filled their Daily 3: Bad: "${bad||"—"}", Win: "${good||"—"}", Target: "${target||"—"}". Give a direct 1-2 sentence response. No fluff.`, .85, 80);
    const el = document.getElementById("d3-musashi-resp"); if (el) el.textContent = r;
  } catch {}
  loadKaizenScore(); loadBattleHistory();
};

// ─── BATTLE LOG ───
window.saveBattleLog = async () => {
  const bad    = document.getElementById("bl-bad")?.value.trim();
  const good   = document.getElementById("bl-good")?.value.trim();
  const target = document.getElementById("bl-target")?.value.trim();
  if (!bad && !good && !target) { toast("fill something in first"); return; }
  await setDoc(doc(db, "kaizen_users", user.uid, "daily3", today()), { bad, good, target, mood: selectedMood, date: today(), ts: Date.now() }).catch(() => {});
  ["bl-bad","bl-good","bl-target"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  toast("battle logged ⚔️"); loadBattleHistory(); loadKaizenScore();
};

window.setMood = (el, val) => {
  selectedMood = val;
  document.querySelectorAll(".mp").forEach(m => m.classList.remove("active"));
  el.classList.add("active");
};

async function loadBattleHistory() {
  const wrap = document.getElementById("battle-history"); if (!wrap) return;
  try {
    const snap = await getDocs(query(collection(db, "kaizen_users", user.uid, "daily3"), orderBy("ts","desc"), limit(14)));
    if (snap.empty) { wrap.innerHTML = '<div class="empty-state">your battle log starts today ⚔️</div>'; return; }
    wrap.innerHTML = "";
    snap.forEach(d => {
      const data = d.data();
      const el = document.createElement("div"); el.className = "be-card";
      const dt = new Date(data.ts).toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short" });
      el.innerHTML = `<div class="be-date">${dt}</div>
        ${data.bad    ? `<div class="be-section"><div class="be-label">💢 what sucked</div><div class="be-text">${data.bad}</div></div>` : ""}
        ${data.good   ? `<div class="be-section"><div class="be-label">✅ win</div><div class="be-text">${data.good}</div></div>` : ""}
        ${data.target ? `<div class="be-section"><div class="be-label">🎯 target</div><div class="be-text">${data.target}</div></div>` : ""}`;
      wrap.appendChild(el);
    });
  } catch {}
}

// ─── ANGER ROOM ───
window.burnAnger = async () => {
  const text = document.getElementById("anger-in")?.value.trim();
  if (!text) { toast("write something first"); return; }
  const inp = document.getElementById("anger-in"); if (inp) inp.value = "";
  const out = document.getElementById("anger-out"), msg = document.getElementById("anger-msg");
  if (!out || !msg) return;
  out.style.display = "block"; msg.textContent = "burning...";
  haptic([50,30,50,30,100]);
  await new Promise(r => setTimeout(r, 800));
  msg.textContent = "🔥 gone. never saved. never judged. released.";
  const btn = document.getElementById("burn-btn-text"); if (btn) btn.textContent = "✓ incinerated";
  setTimeout(() => {
    out.style.display = "none";
    const bt = document.getElementById("burn-btn-text"); if (bt) bt.textContent = "🔥 incinerate";
  }, 3000);
};

// ─── WARRIORS ───
window.selectWarrior = (el, bot) => {
  activeBot = bot;
  document.querySelectorAll(".warrior-item").forEach(w => w.classList.remove("active"));
  el.classList.add("active");
  openBot(bot);
};

window.quickToWarrior = (bot) => {
  activeBot = bot;
  navTo("warriors");
  setTimeout(() => {
    const wi = document.querySelector(`.warrior-item[data-bot="${bot}"]`);
    if (wi) { document.querySelectorAll(".warrior-item").forEach(w => w.classList.remove("active")); wi.classList.add("active"); }
    openBot(bot);
  }, 100);
};

function openBot(bot) {
  activeBot = bot;
  const info = { musashi:{name:"Musashi",ico:"🗡️"}, guts:{name:"Guts",ico:"⚔️"}, sasuke:{name:"Sasuke",ico:"🔥"}, luffy:{name:"Luffy",ico:"🌊"}, thorfinn:{name:"Thorfinn",ico:"🌿"}, dkbose:{name:"DK Bose",ico:"💀"} };
  const b = info[bot] || info.musashi;
  const ico  = document.getElementById("cwh-ico");  if (ico)  ico.textContent  = b.ico;
  const name = document.getElementById("cwh-name"); if (name) name.textContent = b.name;
  const tcn  = document.getElementById("tc-warrior-name"); if (tcn) tcn.textContent = b.name.toUpperCase();
  const msgs = document.getElementById("warrior-msgs");
  if (msgs && (!botHist[bot] || botHist[bot].length === 0)) {
    msgs.innerHTML = `<div class="tc-boot"><div class="tc-boot-line">█ KAIZEN WARRIOR PROTOCOL v2.0</div><div class="tc-boot-line">█ warrior: ${b.name.toUpperCase()} loaded</div><div class="tc-boot-line">█ awaiting input...</div></div>`;
  }
}

window.sendWarriorMsg = async () => {
  const inp = document.getElementById("warrior-in");
  const text = inp?.value.trim(); if (!text) return;
  inp.value = "";
  if (!botHist[activeBot]) botHist[activeBot] = [];
  appendWarriorMsg(text, "user");
  botHist[activeBot].push({ role:"user", content:text });
  const typing = appendTypingIndicator();
  try {
    const msgs   = [{ role:"system", content: botSystem(activeBot) }, ...botHist[activeBot].slice(-12)];
    const model  = (activeBot === "dkbose") ? MODEL_LIGHT : MODEL_DEPTH;
    const reply  = await groqChat(msgs, 0.88, 300, model);
    typing.remove();
    appendWarriorMsg(reply, "bot", activeBot);
    botHist[activeBot].push({ role:"assistant", content:reply });
    // Save to Firestore
    const sessionId = `${user.uid}_${activeBot}_${Date.now()}`;
    await addDoc(collection(db, "kaizen_sessions", user.uid, "logs"), {
      bot: activeBot, text, response: reply, sessionId, ts: Date.now(), date: today()
    }).catch(() => {});
  } catch { typing.remove(); appendWarriorMsg("...", "bot", activeBot); }
};

function appendWarriorMsg(text, role, bot = "") {
  const msgs = document.getElementById("warrior-msgs"); if (!msgs) return;
  const div = document.createElement("div");
  div.className = role === "user" ? "msg msg-user" : `msg msg-bot ${bot}`;
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function appendTypingIndicator() {
  const msgs = document.getElementById("warrior-msgs"); if (!msgs) return { remove: () => {} };
  const div = document.createElement("div"); div.className = "typing-indicator";
  div.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  msgs.appendChild(div); msgs.scrollTop = msgs.scrollHeight;
  return div;
}

window.newWarriorChat = () => {
  botHist[activeBot] = [];
  const msgs = document.getElementById("warrior-msgs");
  if (msgs) {
    const info = { musashi:"MUSASHI", guts:"GUTS", sasuke:"SASUKE", luffy:"LUFFY", thorfinn:"THORFINN", dkbose:"DK BOSE" };
    msgs.innerHTML = `<div class="tc-boot"><div class="tc-boot-line">█ new session started</div><div class="tc-boot-line">█ warrior: ${info[activeBot]||"UNKNOWN"}</div><div class="tc-boot-line">█ awaiting input...</div></div>`;
  }
  toast("new chat started");
};

window.toggleChatHistory = async () => {
  const panel = document.getElementById("chat-history-panel");
  if (!panel) return;
  if (panel.style.display !== "none") { panel.style.display = "none"; return; }
  panel.style.display = "flex";
  panel.style.flexDirection = "column";
  const list = document.getElementById("chat-history-list");
  if (!list) return;
  list.innerHTML = '<div class="empty-state">loading...</div>';
  try {
    const snap = await getDocs(query(collection(db, "kaizen_sessions", user.uid, "logs"), orderBy("ts","desc"), limit(40)));
    if (snap.empty) { list.innerHTML = '<div class="empty-state">no past chats yet</div>'; return; }
    const sessions = {};
    snap.forEach(d => {
      const data = d.data();
      if (data.bot !== activeBot) return;
      const sid = data.sessionId || data.ts;
      if (!sessions[sid]) sessions[sid] = { ts:data.ts, preview:data.text, msgs:[], sid };
      sessions[sid].msgs.push(data);
    });
    const sorted = Object.values(sessions).sort((a,b) => b.ts - a.ts).slice(0, 20);
    if (!sorted.length) { list.innerHTML = '<div class="empty-state">no past chats with this warrior</div>'; return; }
    list.innerHTML = "";
    sorted.forEach(sess => {
      const item = document.createElement("div"); item.className = "hist-session";
      const dt = new Date(sess.ts).toLocaleDateString("en-IN", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" });
      item.innerHTML = `<div class="hs-date">${dt}</div><div class="hs-preview">${sess.preview?.slice(0,55)||"..."}</div>`;
      item.onclick = () => loadChatSession(sess.msgs);
      list.appendChild(item);
    });
  } catch { list.innerHTML = '<div class="empty-state">could not load history</div>'; }
};

function loadChatSession(msgs) {
  const container = document.getElementById("warrior-msgs"); if (!container) return;
  container.innerHTML = ""; botHist[activeBot] = [];
  msgs.sort((a,b) => a.ts - b.ts).forEach(m => {
    if (m.text)     { appendWarriorMsg(m.text, "user"); botHist[activeBot].push({ role:"user", content:m.text }); }
    if (m.response) { appendWarriorMsg(m.response, "bot", activeBot); botHist[activeBot].push({ role:"assistant", content:m.response }); }
  });
  document.getElementById("chat-history-panel").style.display = "none";
  toast("session loaded");
}

window.deleteAllChats = async () => {
  if (!confirm("delete ALL chat history? cannot be undone.")) return;
  try {
    const snap = await getDocs(collection(db, "kaizen_sessions", user.uid, "logs"));
    snap.forEach(d => deleteDoc(d.ref).catch(() => {}));
    botHist = {};
    document.getElementById("chat-history-panel").style.display = "none";
    newWarriorChat();
    toast("all chats deleted");
  } catch { toast("error deleting"); }
};

// User Context
window.toggleUserContext = () => {
  const panel = document.getElementById("ws-context-panel");
  const arrow = document.getElementById("ctx-arrow");
  if (!panel) return;
  const open = panel.style.display === "none";
  panel.style.display = open ? "block" : "none";
  if (arrow) arrow.classList.toggle("open", open);
  if (open && uData.userContext) {
    const inp = document.getElementById("user-context-input");
    if (inp) inp.value = uData.userContext;
  }
};

window.saveUserContext = async () => {
  const val = document.getElementById("user-context-input")?.value.trim();
  uData.userContext = val;
  await setDoc(doc(db, "kaizen_users", user.uid), { userContext: val }, { merge: true }).catch(() => {});
  toast("context saved — warriors will remember");
};

// ─── FOCUS TIMER ───
window.setTimerMode = (mode, btn) => {
  timerMode = mode;
  document.querySelectorAll(".fmt-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const cfg = document.getElementById("pom-config");
  if (cfg) cfg.style.display = mode === "pomodoro" ? "flex" : "none";
  resetTimer();
};

window.toggleTimer = () => {
  if (timerRunning) pauseTimer(); else startTimer();
};

function startTimer() {
  timerRunning = true;
  if (!sessionStart) sessionStart = Date.now();
  const playBtn = document.getElementById("fc-play");
  if (playBtn) playBtn.textContent = "⏸";
  const badge = document.getElementById("fh-live-badge");
  if (badge) { badge.textContent = "● LIVE"; badge.classList.add("running"); }
  if (timerMode === "pomodoro") {
    const focusMin = parseInt(document.getElementById("pom-focus-min")?.value || 25);
    if (timerSeconds <= 0) timerSeconds = focusMin * 60;
    timerInterval = setInterval(() => {
      timerSeconds--;
      updateTimerDisplay();
      if (timerSeconds <= 0) { clearInterval(timerInterval); onPomodoroComplete(); }
    }, 1000);
  } else {
    // stopwatch — count up
    if (timerSeconds === 0) timerSeconds = 0;
    timerInterval = setInterval(() => {
      timerSeconds++;
      updateTimerDisplay();
    }, 1000);
  }
}

function pauseTimer() {
  timerRunning = false;
  clearInterval(timerInterval);
  const playBtn = document.getElementById("fc-play");
  if (playBtn) playBtn.textContent = "▶";
  const badge = document.getElementById("fh-live-badge");
  if (badge) { badge.textContent = "● PAUSED"; badge.classList.remove("running"); }
}

window.resetTimer = () => {
  pauseTimer();
  sessionStart = null;
  if (timerMode === "pomodoro") {
    const focusMin = parseInt(document.getElementById("pom-focus-min")?.value || 25);
    timerSeconds = focusMin * 60;
  } else { timerSeconds = 0; }
  pomodoroPhase = "focus";
  updateTimerDisplay();
  const badge = document.getElementById("fh-live-badge");
  if (badge) { badge.textContent = "● READY"; badge.classList.remove("running"); }
};

function updateTimerDisplay() {
  const el = document.getElementById("fh-time-display");
  if (el) el.textContent = fmtTime(timerSeconds);
}

async function onPomodoroComplete() {
  haptic([100, 50, 100]);
  if (pomodoroPhase === "focus") {
    await saveSession("pomodoro", (parseInt(document.getElementById("pom-focus-min")?.value || 25)) * 60);
    const breakMin = parseInt(document.getElementById("pom-break-min")?.value || 5);
    timerSeconds   = breakMin * 60;
    pomodoroPhase  = "break";
    toast("focus session done! take a break 🎯");
    startTimer();
  } else {
    const focusMin = parseInt(document.getElementById("pom-focus-min")?.value || 25);
    timerSeconds   = focusMin * 60;
    pomodoroPhase  = "focus";
    toast("break over. lock in! 🔥");
    resetTimer();
  }
}

window.stopSession = async () => {
  if (!sessionStart) { toast("no active session"); return; }
  const dur = Math.floor((Date.now() - sessionStart) / 1000);
  if (dur < 30) { toast("too short — keep going"); return; }
  pauseTimer();
  await saveSession(timerMode, dur);
  sessionStart = null;
  timerSeconds = timerMode === "pomodoro" ? (parseInt(document.getElementById("pom-focus-min")?.value || 25)) * 60 : 0;
  updateTimerDisplay();
  toast(`session logged: ${fmtHMS(dur)} 💪`);
  loadSessions(); loadKaizenScore();
};

async function saveSession(type, durationSeconds) {
  const subj = subjects.find(s => s.id === selectedSubject);
  await addDoc(collection(db, "kaizen_users", user.uid, "sessions"), {
    type, durationSeconds,
    subject: subj?.name || "general",
    date: today(), ts: Date.now()
  }).catch(() => {});
  // update sessions display
  const todayEl = document.getElementById("fh-total-today");
  const countEl = document.getElementById("fh-sessions-today");
  // recalculate
  loadSessions();
}

async function loadSessions() {
  try {
    const snap = await getDocs(query(collection(db, "kaizen_users", user.uid, "sessions"), where("date","==",today()), orderBy("ts","desc")));
    let totalSecs = 0, count = 0;
    const list = document.getElementById("sessions-list");
    if (list) list.innerHTML = "";
    snap.forEach(d => {
      const data = d.data();
      totalSecs += data.durationSeconds || 0;
      count++;
      if (list) {
        const item = document.createElement("div"); item.className = "sess-item-focus";
        item.innerHTML = `<span class="sif-subject">${data.subject||"general"}</span><span class="sif-time">${fmtHMS(data.durationSeconds||0)}</span><span class="sif-type">${data.type||"focus"}</span>`;
        list.appendChild(item);
      }
    });
    if (list && count === 0) list.innerHTML = '<div class="sess-empty">no sessions yet today</div>';
    const totEl = document.getElementById("fh-total-today"); if (totEl) totEl.textContent = fmtHMS(totalSecs);
    const cntEl = document.getElementById("fh-sessions-today"); if (cntEl) cntEl.textContent = count;
    const sfEl  = document.getElementById("study-from-focus"); if (sfEl) sfEl.textContent = fmtHMS(totalSecs);
    const strEl = document.getElementById("fh-streak-focus"); if (strEl) strEl.textContent = uData.streak || 0;
  } catch {}
}

// Subjects
async function loadSubjects() {
  try {
    const snap = await getDocs(collection(db, "kaizen_users", user.uid, "subjects"));
    subjects = []; snap.forEach(d => subjects.push({ id:d.id, ...d.data() }));
    renderSubjectList();
  } catch {}
}

function renderSubjectList() {
  const list = document.getElementById("subject-list"); if (!list) return;
  if (!subjects.length) { list.innerHTML = '<div class="subject-empty">no subjects yet — add one above</div>'; return; }
  list.innerHTML = "";
  subjects.forEach(s => {
    const item = document.createElement("div");
    item.className = `subject-item${selectedSubject === s.id ? " active" : ""}`;
    item.innerHTML = `<span>${s.name}</span><button class="subject-del" onclick="event.stopPropagation();deleteSubject('${s.id}')">✕</button>`;
    item.onclick = () => { selectedSubject = s.id; renderSubjectList(); document.getElementById("fh-subject-display").textContent = s.name; };
    list.appendChild(item);
  });
}

window.showAddSubject = () => { document.getElementById("modal-subject").style.display = "flex"; document.getElementById("new-subject-name").focus(); };
window.addSubject     = async () => {
  const nm = document.getElementById("new-subject-name")?.value.trim(); if (!nm) return;
  const ref = await addDoc(collection(db, "kaizen_users", user.uid, "subjects"), { name:nm, createdAt:Date.now() }).catch(() => null);
  if (ref) { subjects.push({ id:ref.id, name:nm }); renderSubjectList(); }
  document.getElementById("new-subject-name").value = "";
  document.getElementById("modal-subject").style.display = "none";
  toast("subject added");
};
window.deleteSubject = async (id) => {
  await deleteDoc(doc(db, "kaizen_users", user.uid, "subjects", id)).catch(() => {});
  subjects = subjects.filter(s => s.id !== id);
  if (selectedSubject === id) { selectedSubject = null; document.getElementById("fh-subject-display").textContent = "no subject selected"; }
  renderSubjectList();
};

// Tasks
const tasks = [];
window.addTask = () => {
  const inp = document.getElementById("task-in"); const text = inp?.value.trim(); if (!text) return;
  inp.value = "";
  tasks.push({ id: Date.now(), text, done: false });
  renderTasks();
};

function renderTasks() {
  const list = document.getElementById("task-list"); if (!list) return;
  list.innerHTML = "";
  tasks.forEach(t => {
    const item = document.createElement("div"); item.className = `task-item${t.done?" done":""}`;
    item.innerHTML = `<div class="task-check" onclick="toggleTask(${t.id})"></div><span onclick="toggleTask(${t.id})">${t.text}</span><button class="task-del-btn" onclick="deleteTask(${t.id})">✕</button>`;
    list.appendChild(item);
  });
  const count = document.getElementById("task-count"); if (count) count.textContent = tasks.filter(t=>t.done).length + "/" + tasks.length;
}

window.toggleTask = (id) => {
  const t = tasks.find(t => t.id === id); if (t) t.done = !t.done;
  renderTasks();
};
window.deleteTask = (id) => { const i = tasks.findIndex(t=>t.id===id); if(i>-1) tasks.splice(i,1); renderTasks(); };
window.clearDistractions = () => { const el = document.getElementById("distraction-pad"); if(el) el.value=""; toast("cleared"); };

// Ambient Sounds (simple oscillator-based simulation)
let ambientOsc = null;
window.setAmbient = (sound, btn) => {
  document.querySelectorAll(".amb-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  // In a real build you'd load audio files; here we just acknowledge
  toast(sound === "off" ? "ambient off" : `${sound} ambient on 🎵`);
};

// DK BOSE
window.sendDKBose = async () => {
  const inp = document.getElementById("dkb-in"); const text = inp?.value.trim(); if (!text) return;
  inp.value = "";
  const chat = document.getElementById("dkb-chat"); if (!chat) return;
  const um = document.createElement("div"); um.className = "dkb-msg dkb-user"; um.textContent = text; chat.appendChild(um);
  chat.scrollTop = chat.scrollHeight;
  try {
    const msgs   = [{ role:"system", content: botSystem("dkbose") }, { role:"user", content: text }];
    const reply  = await groqChat(msgs, 0.92, 200, MODEL_LIGHT);
    const bm     = document.createElement("div"); bm.className = "dkb-msg dkb-bot"; bm.textContent = reply; chat.appendChild(bm);
    chat.scrollTop = chat.scrollHeight;
  } catch {}
};

// ─── THE GRIND ───
window.toggleWT = (btn, type) => {
  selectedWorkout = type;
  document.querySelectorAll(".wt-pill").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
};

window.saveGrind = async (type) => {
  const data = {};
  if (type === "workout") {
    data.workout    = selectedWorkout || "other";
    data.workoutMin = parseInt(document.getElementById("workout-dur")?.value || 0);
    data.workoutNotes = document.getElementById("workout-notes")?.value.trim() || "";
    if (!selectedWorkout) { toast("select a workout type"); return; }
  }
  if (type === "study") {
    data.study      = parseFloat(document.getElementById("study-hrs")?.value || 0);
    data.studyTopic = document.getElementById("study-topic")?.value.trim() || "";
  }
  await setDoc(doc(db, "kaizen_users", user.uid, "grind", today()), data, { merge: true }).catch(() => {});
  toast(`${type} logged 💪`); loadKaizenScore(); loadGrindProgress();
};

async function loadGrindProgress() {
  // already handled in loadKaizenScore
}

// Daily Targets
async function loadTargets() {
  const wrap = document.getElementById("targets-list"); if (!wrap) return;
  try {
    const snap = await getDocs(collection(db, "kaizen_users", user.uid, "dailyTargets"));
    dailyTargets = []; snap.forEach(d => dailyTargets.push({ id:d.id, ...d.data() }));
    renderTargets();
  } catch {}
}

function renderTargets() {
  const wrap = document.getElementById("targets-list"); if (!wrap) return;
  if (!dailyTargets.length) { wrap.innerHTML = '<div class="empty-state">no targets set — add one above</div>'; return; }
  wrap.innerHTML = "";
  dailyTargets.forEach(t => {
    const done = t.completedDate === today();
    const item = document.createElement("div"); item.className = `target-item${done?" done":""}`;
    item.innerHTML = `<div class="target-check" onclick="toggleTarget('${t.id}',${done})"></div><span>${t.name}</span><button class="target-del" onclick="deleteTarget('${t.id}')">✕</button>`;
    wrap.appendChild(item);
  });
}

window.showAddTarget = () => { const f = document.getElementById("add-target-form"); if (f) f.style.display = f.style.display === "none" ? "flex" : "none"; };
window.hideAddTarget = () => { const f = document.getElementById("add-target-form"); if (f) f.style.display = "none"; };

window.addDailyTarget = async () => {
  const nm = document.getElementById("target-name")?.value.trim(); if (!nm) return;
  const ref = await addDoc(collection(db, "kaizen_users", user.uid, "dailyTargets"), { name:nm, createdAt:Date.now() }).catch(() => null);
  if (ref) dailyTargets.push({ id:ref.id, name:nm });
  document.getElementById("target-name").value = "";
  hideAddTarget(); renderTargets(); loadKaizenScore();
  toast("target added");
};

window.toggleTarget = async (id, currentDone) => {
  const newDone = !currentDone;
  const t = dailyTargets.find(t => t.id === id); if (!t) return;
  t.completedDate = newDone ? today() : null;
  await setDoc(doc(db, "kaizen_users", user.uid, "dailyTargets", id), { completedDate: t.completedDate }, { merge: true }).catch(() => {});
  renderTargets(); loadKaizenScore();
};

window.deleteTarget = async (id) => {
  await deleteDoc(doc(db, "kaizen_users", user.uid, "dailyTargets", id)).catch(() => {});
  dailyTargets = dailyTargets.filter(t => t.id !== id); renderTargets(); loadKaizenScore();
};

// Wins
window.addWin = async () => {
  const inp = document.getElementById("win-in"); const text = inp?.value.trim(); if (!text) return; inp.value = "";
  await addDoc(collection(db, "kaizen_users", user.uid, "wins"), { text, date:today(), ts:Date.now() }).catch(() => {});
  toast("win logged 🏆"); loadWinList(); loadKaizenScore();
};

async function loadWinList() {
  const wrap = document.getElementById("win-list"); if (!wrap) return;
  try {
    const snap = await getDocs(query(collection(db, "kaizen_users", user.uid, "wins"), where("date","==",today()), orderBy("ts","desc")));
    wrap.innerHTML = "";
    let count = 0;
    snap.forEach(d => {
      const item = document.createElement("div"); item.className = "win-item";
      item.textContent = d.data().text; wrap.appendChild(item); count++;
    });
    const badge = document.getElementById("wins-count-badge"); if (badge) badge.textContent = count;
    const smw   = document.getElementById("sm-wins"); if (smw) smw.textContent = count;
  } catch {}
}

// ─── THE PATH ───
window.addGoal = async () => {
  const title    = document.getElementById("goal-title")?.value.trim(); if (!title) { toast("enter a goal title"); return; }
  const cat      = document.getElementById("goal-cat")?.value      || "personal";
  const deadline = document.getElementById("goal-deadline")?.value || "";
  const why      = document.getElementById("goal-why")?.value.trim() || "";
  const ref = await addDoc(collection(db, "kaizen_users", user.uid, "goals"), { title, cat, deadline, why, progress:0, ts:Date.now() }).catch(() => null);
  if (ref) goals.push({ id:ref.id, title, cat, deadline, why, progress:0 });
  ["goal-title","goal-why","goal-deadline"].forEach(id => { const e = document.getElementById(id); if (e) e.value=""; });
  toast("goal set ⚔️"); loadGoals();
};

async function loadGoals() {
  const wrap = document.getElementById("goals-list"); if (!wrap) return;
  try {
    const snap = await getDocs(query(collection(db, "kaizen_users", user.uid, "goals"), orderBy("ts","desc")));
    goals = []; snap.forEach(d => goals.push({ id:d.id, ...d.data() }));
    if (!goals.length) { wrap.innerHTML = '<div class="empty-state">no goals set yet. the path starts with a single step.</div>'; return; }
    wrap.innerHTML = "";
    goals.forEach(g => {
      const card = document.createElement("div"); card.className = "goal-card";
      card.innerHTML = `
        <div class="gc-head">
          <span class="gc-title">${g.title}</span>
          <span class="gc-cat">${g.cat}</span>
        </div>
        ${g.why ? `<div class="gc-why">"${g.why}"</div>` : ""}
        ${g.deadline ? `<div class="gc-deadline">⏳ ${g.deadline}</div>` : ""}
        <div class="gc-progress-wrap">
          <div class="gc-progress-bar"><div class="gc-progress-fill" style="width:${g.progress||0}%"></div></div>
          <span class="gc-pct">${g.progress||0}%</span>
        </div>
        <div class="gc-actions">
          <button class="gc-btn" onclick="updateGoal('${g.id}',${Math.min((g.progress||0)+10,100)})">+10%</button>
          <button class="gc-btn" onclick="updateGoal('${g.id}',100)">done ✓</button>
          <button class="gc-btn del" onclick="deleteGoal('${g.id}')">✕</button>
        </div>`;
      wrap.appendChild(card);
    });
    // Path overview sidebar
    const ov = document.getElementById("path-overview"); if (!ov) return;
    ov.innerHTML = "";
    goals.slice(0,5).forEach(g => {
      const row = document.createElement("div"); row.className = "po-row";
      row.innerHTML = `<span>${g.title.slice(0,20)}</span><span class="po-pct">${g.progress||0}%</span>`;
      ov.appendChild(row);
    });
  } catch {}
}

window.updateGoal = async (id, pct) => {
  await setDoc(doc(db, "kaizen_users", user.uid, "goals", id), { progress:pct }, { merge:true }).catch(() => {});
  loadGoals(); if (pct >= 100) toast("goal complete ⚔️");
};
window.deleteGoal = async (id) => {
  await deleteDoc(doc(db, "kaizen_users", user.uid, "goals", id)).catch(() => {}); loadGoals();
};
window.loadMusashiPath = async () => {
  const el = document.getElementById("musashi-path-txt"); if (!el) return;
  el.textContent = "Musashi is analyzing...";
  try {
    const list = goals.map(g => `"${g.title}" (${g.progress||0}% done, reason:"${g.why||"not stated"}")`).join("; ");
    const r = await groq(`You are Musashi. Review these goals: ${list||"none set"}. Give a 2-3 sentence direct assessment: which goal matters most, which is being avoided, and what to do today.`, .85, 150);
    el.textContent = r;
  } catch { el.textContent = "Set a goal first. Then we'll talk."; }
};

// ─── INSIGHTS ───
function loadInsights() {
  loadHeatmap(); loadStreakDisplay(); loadEnergyGraph(null, 7); loadDebrief_preview();
}

function loadHeatmap() {
  const wrap = document.getElementById("life-heatmap"); if (!wrap) return;
  wrap.innerHTML = "";
  const now = new Date(); const year = now.getFullYear();
  const start = new Date(year, 0, 1); const days = Math.ceil((now - start) / 86400000);
  for (let i = 0; i < days; i++) {
    const cell = document.createElement("div"); cell.className = "hm-cell";
    cell.setAttribute("data-score", "0"); // Would load from Firestore in full build
    cell.title = new Date(start.getTime() + i * 86400000).toLocaleDateString();
    wrap.appendChild(cell);
  }
}

function loadStreakDisplay() {
  const wrap = document.getElementById("streak-display"); if (!wrap) return;
  const streak = uData.streak || 0;
  wrap.innerHTML = `<span class="sd-num">${streak}</span><span class="sd-label">consecutive days on the path</span>`;
}

let energyChartInst = null;
window.loadEnergyGraph = async (btn, days) => {
  if (btn) { document.querySelectorAll(".ct-tab").forEach(b => b.classList.remove("active")); btn.classList.add("active"); }
  try {
    const snap = await getDocs(query(collection(db, "kaizen_energy", user.uid, "entries"), orderBy("ts","desc"), limit(days)));
    const entries = []; snap.forEach(d => entries.push(d.data())); entries.reverse();
    const labels = entries.map(e => new Date(e.ts).toLocaleDateString("en-IN", { day:"numeric", month:"short" }));
    const data   = entries.map(e => e.score || 5);
    const canvas = document.getElementById("energy-canvas"); if (!canvas) return;
    if (energyChartInst) { energyChartInst.destroy(); energyChartInst = null; }
    const acc = getComputedStyle(document.body).getPropertyValue("--acc").trim() || "#00f5ff";
    energyChartInst = new Chart(canvas, {
      type: "line",
      data: { labels, datasets: [{ data, borderColor: acc, backgroundColor: acc+"22", fill: true, tension: .4, pointBackgroundColor: acc, pointRadius: 3 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{display:false}, y:{min:0,max:10,ticks:{color:"rgba(255,255,255,.3)",font:{family:"JetBrains Mono",size:9}},grid:{color:"rgba(255,255,255,.04)"}} } }
    });
    if (data.length) {
      const avg = (data.reduce((a,b)=>a+b,0)/data.length).toFixed(1);
      const stats = document.getElementById("energy-stats");
      if (stats) stats.innerHTML = `<div class="es-s"><span class="es-val">${avg}</span><span class="es-lbl">avg energy</span></div><div class="es-s"><span class="es-val">${Math.max(...data)}</span><span class="es-lbl">peak</span></div><div class="es-s"><span class="es-val">${Math.min(...data)}</span><span class="es-lbl">lowest</span></div><div class="es-s"><span class="es-val">${data.length}</span><span class="es-lbl">logs</span></div>`;
    }
  } catch {}
};

async function loadDebrief_preview() { /* auto-loads only when insights visible */ }

window.loadDebrief = async () => {
  const el = document.getElementById("debrief-txt"); if (!el) return;
  el.textContent = "Musashi is reviewing your week...";
  try {
    const snap = await getDocs(query(collection(db, "kaizen_users", user.uid, "daily3"), orderBy("ts","desc"), limit(7)));
    const entries = []; snap.forEach(d => entries.push(d.data()));
    const wins = entries.filter(e=>e.good).map(e=>e.good).join("; ");
    const bads = entries.filter(e=>e.bad).map(e=>e.bad).join("; ");
    const r = await groq(`You are Musashi. Give an honest weekly debrief. Wins this week: "${wins||"none logged"}". Struggles: "${bads||"none logged"}". Streak: ${uData.streak||0} days. 3-4 sentences. Direct. Acknowledge wins. Call out patterns. End with one concrete instruction for next week.`, .85, 220);
    el.textContent = r;
  } catch { el.textContent = "Log more this week and I'll have something to say."; }
};

// ─── ANALYTICS ───
window.setAnalyticsPeriod = (period, btn) => {
  analyticsPeriod = period;
  document.querySelectorAll(".af-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  loadAnalytics();
};

let studyChart = null, subjectChart = null, scoreChart = null;

async function loadAnalytics() {
  try {
    // Top stats
    const streak = uData.streak || 0;
    const strEl = document.getElementById("at-streak-val"); if (strEl) strEl.textContent = streak;

    // Today focus time
    const sessSnap = await getDocs(query(collection(db, "kaizen_users", user.uid, "sessions"), where("date","==",today())));
    let focusSecs = 0; let tasksDone = 0;
    sessSnap.forEach(d => { focusSecs += d.data().durationSeconds || 0; });
    const ftEl = document.getElementById("at-focus-time"); if (ftEl) ftEl.textContent = fmtHMS(focusSecs);

    // Score
    const scEl = document.getElementById("at-score-avg"); if (scEl) scEl.textContent = document.getElementById("tb-score")?.textContent || "0";

    // Study chart (last 7 days)
    const days = analyticsPeriod === "today" ? 1 : analyticsPeriod === "week" ? 7 : analyticsPeriod === "month" ? 30 : 365;
    const studyData = [], studyLabels = [];
    for (let i = days-1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate()-i);
      const dateStr = d.toISOString().split("T")[0];
      studyLabels.push(d.toLocaleDateString("en-IN", { day:"numeric", month:"short" }));
      const sSnap = await getDocs(query(collection(db, "kaizen_users", user.uid, "sessions"), where("date","==",dateStr)));
      let secs = 0; sSnap.forEach(d => { secs += d.data().durationSeconds||0; });
      studyData.push(parseFloat((secs/3600).toFixed(2)));
    }

    const style = getComputedStyle(document.body);
    const acc   = style.getPropertyValue("--acc").trim() || "#00f5ff";

    const studyCanvas = document.getElementById("study-chart");
    if (studyCanvas) {
      if (studyChart) studyChart.destroy();
      studyChart = new Chart(studyCanvas, {
        type: "bar",
        data: { labels: studyLabels, datasets: [{ data: studyData, backgroundColor: acc+"44", borderColor: acc, borderWidth: 1 }] },
        options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales: { x:{ ticks:{ color:"#555", font:{family:"JetBrains Mono",size:9} }, grid:{ display:false } }, y:{ ticks:{ color:"#555", font:{family:"JetBrains Mono",size:9} }, grid:{ color:"rgba(255,255,255,.04)" } } } }
      });
    }

    // Subject distribution
    const subjMap = {};
    const allSess = await getDocs(collection(db, "kaizen_users", user.uid, "sessions"));
    allSess.forEach(d => {
      const s = d.data().subject || "general";
      subjMap[s] = (subjMap[s]||0) + (d.data().durationSeconds||0);
    });
    const subjLabels = Object.keys(subjMap).slice(0,6);
    const subjData   = subjLabels.map(k => parseFloat((subjMap[k]/3600).toFixed(2)));
    const colors     = ["#00f5ff","#ff6040","#ffcc00","#44bb88","#8844cc","#ff8800"];
    const subjectCanvas = document.getElementById("subject-chart");
    if (subjectCanvas && subjLabels.length) {
      if (subjectChart) subjectChart.destroy();
      subjectChart = new Chart(subjectCanvas, {
        type: "doughnut",
        data: { labels: subjLabels, datasets: [{ data: subjData, backgroundColor: colors.map(c=>c+"88"), borderColor: colors, borderWidth: 1 }] },
        options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ labels:{ color:"#888", font:{family:"JetBrains Mono",size:10} } } } }
      });
    }

    // Peak performance (hour analysis)
    let morning = 0, afternoon = 0, evening = 0;
    allSess.forEach(d => {
      const ts  = d.data().ts || 0;
      const hr  = new Date(ts).getHours();
      const dur = d.data().durationSeconds || 0;
      if (hr >= 5  && hr < 12) morning   += dur;
      if (hr >= 12 && hr < 18) afternoon += dur;
      if (hr >= 18 || hr < 5)  evening   += dur;
    });
    const total = morning + afternoon + evening || 1;
    const setPP = (id, val) => {
      const pct = Math.round((val/total)*100);
      const bar = document.getElementById(`pp-${id}`); if (bar) bar.style.width = pct + "%";
      const pctEl = document.getElementById(`pp-${id}-pct`); if (pctEl) pctEl.textContent = pct + "%";
    };
    setPP("morning", morning); setPP("afternoon", afternoon); setPP("evening", evening);

  } catch (e) { console.error("analytics error:", e); }
}

window.generateAAR = async () => {
  const el = document.getElementById("aar-content"); if (!el) return;
  el.innerHTML = '<p class="aar-empty">generating your after action report...</p>';
  const warrior = document.getElementById("aar-warrior")?.value || "musashi";
  try {
    const d3Snap = await getDocs(query(collection(db, "kaizen_users", user.uid, "daily3"), orderBy("ts","desc"), limit(7)));
    const entries = []; d3Snap.forEach(d => entries.push(d.data()));
    const wins = entries.filter(e=>e.good).map(e=>e.good).join("; ");
    const bads = entries.filter(e=>e.bad).map(e=>e.bad).join("; ");
    const streak = uData.streak || 0;
    const r = await groq(`You are ${warrior}. Write the user's weekly After Action Report. Wins: "${wins||"none"}". Struggles: "${bads||"none"}". Streak: ${streak} days. Write 4-6 sentences in your character's voice — brutally honest, direct. What did they crush? What patterns do you see in their failures? What is the ONE directive for next week? Stay in character completely.`, .88, 300);
    el.innerHTML = `<p class="aar-content">${r}</p>`;
  } catch { el.innerHTML = '<p class="aar-empty">could not generate — try again</p>'; }
};

// ─── PROFILE ───
function setupProfile() {
  const nm  = document.getElementById("prof-name");  if (nm)  nm.textContent  = uData.name || "—";
  const em  = document.getElementById("prof-email"); if (em)  em.textContent  = user.email || "—";
  const en  = document.getElementById("edit-name");  if (en)  en.value        = uData.name || "";
  const av  = document.getElementById("prof-avatar");
  if (av) av.textContent = (uData.name||"W")[0].toUpperCase();
  const stk = document.getElementById("prof-streak"); if (stk) stk.textContent = uData.streak || 0;
  // load visions
  loadVisionList();
  // apply theme buttons
  document.querySelectorAll(".ts-card").forEach(c => c.classList.toggle("active", c.dataset.theme === (uData.theme||"obsidian")));
}

window.saveProfile = async () => {
  const nm = document.getElementById("edit-name")?.value.trim();
  if (nm) uData.name = nm;
  await setDoc(doc(db, "kaizen_users", user.uid), uData, { merge:true }).catch(() => {});
  setupTopbar(); toast("saved ⚔️");
};

window.setTheme = (el, theme) => {
  uData.theme = theme;
  applyTheme(theme);
  setDoc(doc(db, "kaizen_users", user.uid), { theme }, { merge:true }).catch(() => {});
  document.querySelectorAll(".ts-card").forEach(c => c.classList.remove("active")); el.classList.add("active");
  document.querySelectorAll(".theme-card").forEach(c => c.classList.toggle("active", c.dataset.theme === theme));
  toast(`theme: ${theme} ✓`);
};

window.doSignOut = async () => {
  if (!confirm("sign out?")) return;
  await signOut(auth); window.location.reload();
};

window.deleteAccount = async () => {
  if (!confirm("permanently delete ALL your Kaizen data?")) return;
  if (!confirm("this cannot be undone. are you absolutely sure?")) return;
  try {
    const colls = ["daily3","grind","goals","wins","sessions","subjects","dailyTargets","visions"];
    for (const c of colls) { const s = await getDocs(collection(db,"kaizen_users",user.uid,c)); s.forEach(d => deleteDoc(d.ref).catch(()=>{})); }
    const s2 = await getDocs(collection(db,"kaizen_sessions",user.uid,"logs")); s2.forEach(d => deleteDoc(d.ref).catch(()=>{}));
    await deleteDoc(doc(db,"kaizen_users",user.uid)).catch(() => {});
    await signOut(auth); window.location.reload();
  } catch { toast("error during deletion"); }
};

// ─── VISION BOARD ───
window.showAddVision = () => {
  const f = document.getElementById("add-vision-form"); if (f) f.style.display = f.style.display === "none" ? "flex" : "none";
};

window.addVision = async () => {
  const text  = document.getElementById("vision-text")?.value.trim(); if (!text) return;
  const emoji = document.getElementById("vision-emoji")?.value || "🌊";
  await addDoc(collection(db, "kaizen_users", user.uid, "visions"), { text, emoji, ts:Date.now() }).catch(() => {});
  document.getElementById("vision-text").value = "";
  toast("vision added 🌊"); loadVisionList(); loadVisionsToAquarium();
};

async function loadVisionList() {
  const wrap = document.getElementById("vision-list"); if (!wrap) return;
  try {
    const snap = await getDocs(query(collection(db,"kaizen_users",user.uid,"visions"), orderBy("ts","desc")));
    if (snap.empty) { wrap.innerHTML = '<div class="empty-state">no visions yet — add what you\'re working towards</div>'; return; }
    wrap.innerHTML = "";
    snap.forEach(d => {
      const data = d.data();
      const item = document.createElement("div"); item.className = "vision-item";
      item.innerHTML = `<span class="vi-emoji">${data.emoji||"🌊"}</span><span>${data.text}</span><button class="vi-del" onclick="deleteVision('${d.id}')">✕</button>`;
      wrap.appendChild(item);
    });
  } catch {}
}

window.deleteVision = async (id) => {
  await deleteDoc(doc(db,"kaizen_users",user.uid,"visions",id)).catch(() => {});
  loadVisionList(); loadVisionsToAquarium(); toast("removed");
};

// ─── SUNDAY DEBRIEF ───
async function checkSundayDebrief() {
  if (new Date().getDay() !== 0) return;
  const key = `sunday_${new Date().getFullYear()}_w${Math.ceil(new Date().getDate()/7)}`;
  try {
    const snap = await getDoc(doc(db,"kaizen_users",user.uid,"meta",key));
    if (snap.exists()) return;
    const pop = document.createElement("div");
    pop.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:850;padding:2rem;backdrop-filter:blur(20px)";
    pop.innerHTML = `<div style="max-width:420px;width:100%;padding:2rem;background:rgba(10,10,20,.9);border:1px solid var(--border2);border-radius:18px"><p style="font-family:var(--font-mono);font-size:.6rem;letter-spacing:.2em;color:var(--acc);margin-bottom:1rem">🗡️ SUNDAY DEBRIEF — MUSASHI</p><p id="sunday-txt" style="font-size:.88rem;line-height:1.8;color:var(--text2)">Musashi is reviewing your week...</p><button onclick="this.closest('[style*=fixed]').remove()" style="width:100%;margin-top:1.5rem;padding:12px;background:var(--grad);border:none;border-radius:10px;color:#000;font-family:var(--font-mono);font-size:.8rem;font-weight:700;cursor:pointer;letter-spacing:.1em">noted ⚔️</button></div>`;
    document.body.appendChild(pop);
    await setDoc(doc(db,"kaizen_users",user.uid,"meta",key), { shown:true, ts:Date.now() }).catch(() => {});
    const r = await groq(`You are Musashi. It's Sunday. Give a direct weekly review in 3-4 sentences. No fluff. End with one clear instruction for next week.`, .85, 180);
    const txt = document.getElementById("sunday-txt"); if (txt) txt.textContent = r;
  } catch {}
}

// ─── HABITS ───
window.selectHabitEmoji = (el, emoji) => {
  selectedHabitEmoji = emoji;
  document.querySelectorAll(".he-pick").forEach(e => e.classList.remove("active"));
  el.classList.add("active");
};

window.addHabit = async () => {
  const nm = document.getElementById("habit-name")?.value.trim(); if (!nm) { toast("enter habit name"); return; }
  const ref = await addDoc(collection(db,"kaizen_users",user.uid,"habits"), {
    name: nm, emoji: selectedHabitEmoji, streak: 0, createdAt: Date.now()
  }).catch(() => null);
  if (ref) {
    document.getElementById("habit-name").value = "";
    document.getElementById("add-habit-form")?.classList.remove("visible");
    toast("habit added 🔁");
    loadHabits();
  }
};

async function loadHabits() {
  const grid = document.getElementById("habits-grid"); if (!grid) return;
  try {
    const snap = await getDocs(collection(db,"kaizen_users",user.uid,"habits"));
    habits = []; snap.forEach(d => habits.push({ id:d.id, ...d.data() }));
    if (!habits.length) { grid.innerHTML = '<div class="empty-state">no habits yet — add your first one above</div>'; return; }
    grid.innerHTML = "";
    habits.forEach(h => {
      const done = h.completedDates?.includes(today());
      const card = document.createElement("div"); card.className = `habit-card${done?" done":""}`;
      // Compute 7-day streak
      let streak = 0;
      for (let i = 0; i < 30; i++) {
        const d = new Date(); d.setDate(d.getDate()-i);
        if (h.completedDates?.includes(d.toISOString().split("T")[0])) streak++;
        else if (i > 0) break;
      }
      const pct = Math.min(100, (streak / 21) * 100);
      card.innerHTML = `
        <div class="hc-top">
          <span class="hc-ico">${h.emoji||"🔁"}</span>
          <span class="hc-streak-badge">🔥 ${streak}</span>
        </div>
        <div class="hc-name">${h.name}</div>
        <div class="hc-streak-txt">${streak} day streak · best in 30d</div>
        <div class="hc-prog"><div class="hc-prog-fill" style="width:${pct}%"></div></div>
        <button class="habit-check-btn" onclick="toggleHabit('${h.id}',${done})">${done?"✓ done today":"mark done"}</button>
      `;
      grid.appendChild(card);
    });
  } catch {}
}

window.toggleHabit = async (id, done) => {
  const h = habits.find(h => h.id === id); if (!h) return;
  const dates = h.completedDates || [];
  const t = today();
  if (done) { h.completedDates = dates.filter(d => d !== t); }
  else       { h.completedDates = [...dates, t]; }
  await setDoc(doc(db,"kaizen_users",user.uid,"habits",id), { completedDates: h.completedDates }, { merge:true }).catch(() => {});
  loadHabits(); loadKaizenScore();
  toast(done ? "unchecked" : "habit done! 🔥");
};

// ─── NOTES ───
window.newNote = () => {
  activeNoteId = null;
  const ti = document.getElementById("note-title"); if (ti) ti.value = "";
  const bo = document.getElementById("note-body");  if (bo) bo.value = "";
};

async function loadNotes() {
  const list = document.getElementById("notes-list"); if (!list) return;
  try {
    const snap = await getDocs(query(collection(db,"kaizen_users",user.uid,"notes"), orderBy("ts","desc"), limit(30)));
    notes = []; snap.forEach(d => notes.push({ id:d.id, ...d.data() }));
    if (!notes.length) { list.innerHTML = '<div class="empty-state">no notes yet</div>'; return; }
    list.innerHTML = "";
    notes.forEach(n => {
      const item = document.createElement("div"); item.className = `note-item${activeNoteId===n.id?" active":""}`;
      const dt = new Date(n.ts).toLocaleDateString("en-IN", { day:"numeric", month:"short" });
      item.innerHTML = `<div class="ni-title">${n.title||"untitled"}</div><div class="ni-date">${dt}</div>`;
      item.onclick = () => openNote(n);
      list.appendChild(item);
    });
  } catch {}
}

function openNote(n) {
  activeNoteId = n.id;
  const ti = document.getElementById("note-title"); if (ti) ti.value = n.title || "";
  const bo = document.getElementById("note-body");  if (bo) bo.value = n.body  || "";
  document.querySelectorAll(".note-item").forEach(ni => ni.classList.toggle("active", ni.querySelector(".ni-title")?.textContent === (n.title||"untitled")));
}

window.saveNote = async () => {
  const title = document.getElementById("note-title")?.value.trim() || "untitled";
  const body  = document.getElementById("note-body")?.value  || "";
  if (activeNoteId) {
    await setDoc(doc(db,"kaizen_users",user.uid,"notes",activeNoteId), { title, body, ts: Date.now() }, { merge:true }).catch(() => {});
  } else {
    const ref = await addDoc(collection(db,"kaizen_users",user.uid,"notes"), { title, body, ts:Date.now() }).catch(() => null);
    if (ref) activeNoteId = ref.id;
  }
  toast("note saved ✓"); loadNotes();
};

window.deleteCurrentNote = async () => {
  if (!activeNoteId) return;
  if (!confirm("delete this note?")) return;
  await deleteDoc(doc(db,"kaizen_users",user.uid,"notes",activeNoteId)).catch(() => {});
  activeNoteId = null;
  document.getElementById("note-title").value = "";
  document.getElementById("note-body").value = "";
  loadNotes(); toast("note deleted");
};

// Export notes as simple HTML → triggers print/PDF
window.exportNotes = async () => {
  try {
    const snap = await getDocs(query(collection(db,"kaizen_users",user.uid,"notes"), orderBy("ts","desc")));
    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Kaizen Notes — ${uData.name||"warrior"}</title><style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;line-height:1.7;color:#1a1a2e}h1{font-size:2rem;margin-bottom:2rem;border-bottom:2px solid #333;padding-bottom:.5rem}.note{margin-bottom:3rem;page-break-inside:avoid}.note h2{font-size:1.3rem;margin-bottom:.5rem}.note .date{font-size:.75rem;color:#666;margin-bottom:1rem}.note .body{white-space:pre-wrap}@media print{body{margin:20px}}</style></head><body><h1>📝 Kaizen Notes — ${uData.name||"warrior"}</h1>`;
    snap.forEach(d => {
      const n = d.data();
      const dt = new Date(n.ts).toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"long", year:"numeric" });
      html += `<div class="note"><h2>${n.title||"untitled"}</h2><div class="date">${dt}</div><div class="body">${(n.body||"").replace(/</g,"&lt;")}</div></div>`;
    });
    html += `</body></html>`;
    const win = window.open("","_blank");
    win.document.write(html); win.document.close();
    setTimeout(() => win.print(), 500);
  } catch { toast("export failed"); }
};

// ─── VISION BOARD TOGGLE ───
window.toggleAddVision = () => {
  const f = document.getElementById("add-vision-form");
  if (f) f.style.display = f.style.display === "none" ? "flex" : "none";
};

// ─── TOGGLE ADD TARGET ───
window.toggleAddTarget = () => {
  const f = document.getElementById("add-target-form");
  if (f) f.style.display = f.style.display === "none" ? "flex" : "none";
};

// ─── WARRIORS CONTEXT (renamed to avoid clash) ───
window.toggleCtx = () => {
  const panel = document.getElementById("ws-ctx");
  const arrow = document.getElementById("ctx-arr");
  if (!panel) return;
  const open = panel.style.display === "none";
  panel.style.display = open ? "block" : "none";
  if (arrow) arrow.style.transform = open ? "rotate(90deg)" : "";
  if (open && uData.userContext) {
    const inp = document.getElementById("ctx-input"); if (inp) inp.value = uData.userContext;
  }
};
window.saveCtx = window.saveUserContext;

// ─── START ───
runLoadingSequence(() => {
  // Auth observer handles the rest
});
