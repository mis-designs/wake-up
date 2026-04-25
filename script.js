/***********************
 * CONFIG
 ***********************/
const API_URL = "https://script.google.com/macros/s/AKfycbxOOQ-8FYN4qv0e5575rNyrvjTiZtEUmaNUj07KjBkjN1G9iCl0Ks4iWcSxthbuWh9h5A/exec";
const TOKEN = "Xk92!abC_2026_securePanel@#";
const CHECK_INTERVAL = 2 * 60 * 1000;
const IMMEDIATE_VALIDATE_COOLDOWN = 4000;
const FETCH_TIMEOUT = 8000;
const MAX_SILENT_FAILURE_TIME = 15 * 60 * 1000;

// numero whatsapp per rinnovo
const RENEW_WHATSAPP_NUMBER = "393663584525";
const RENEW_MESSAGE = "Ciao, vorrei rinnovare il mio accesso.";

/***********************
 * STORAGE ROBUSTO
 ***********************/
const Storage = (() => {
  let mem = {};

  function canUse(s) {
    try {
      const k = "__t";
      s.setItem(k, "1");
      s.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  const ls = (typeof localStorage !== "undefined" && canUse(localStorage)) ? localStorage : null;
  const ss = (typeof sessionStorage !== "undefined" && canUse(sessionStorage)) ? sessionStorage : null;

  return {
    get(key) {
      if (ls) return ls.getItem(key);
      if (ss) return ss.getItem(key);
      return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
    },
    set(key, val) {
      const v = String(val);
      if (ls) { ls.setItem(key, v); return "local"; }
      if (ss) { ss.setItem(key, v); return "session"; }
      mem[key] = v;
      return "memory";
    },
    remove(key) {
      if (ls) ls.removeItem(key);
      if (ss) ss.removeItem(key);
      delete mem[key];
    },
    mode() {
      if (ls) return "local";
      if (ss) return "session";
      return "memory";
    }
  };
})();

const KEYS = {
  deviceId: "deviceId",
  loggedIn: "loggedIn",
  phone: "phone",
  expiry: "expiry",
  session: "session",
  renewPopupLastShown: "renewPopupLastShown"
};

function readStoredSession() {
  try {
    const raw = Storage.get(KEYS.session);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn("Sessione salvata non leggibile, continuo senza logout automatico");
    return null;
  }
}

function persistSession(phone, data = {}) {
  if (!phone) return;

  const existing = readStoredSession() || {};
  const session = {
    ...existing,
    phone,
    deviceId: data.deviceId || existing.deviceId || Storage.get(KEYS.deviceId) || getDeviceId(),
    lastValid: data.lastValid || Date.now()
  };

  if (data.expiry || existing.expiry) session.expiry = data.expiry || existing.expiry;

  Storage.set(KEYS.session, JSON.stringify(session));
  Storage.set(KEYS.loggedIn, "true");
  Storage.set(KEYS.phone, phone);
  Storage.set(KEYS.deviceId, session.deviceId);
  if (session.expiry) Storage.set(KEYS.expiry, session.expiry);
}

function restoreSession(session) {
  if (!session?.phone) return false;
  persistSession(session.phone, {
    deviceId: session.deviceId,
    expiry: session.expiry,
    lastValid: session.lastValid || Date.now()
  });
  if (session.lastValid) lastSuccess = session.lastValid;
  return true;
}

/***********************
 * NORMALIZZA TELEFONO
 ***********************/
function normalizePhone(input) {
  let s = String(input || "").trim();
  s = s.replace(/\s+/g, "");
  s = s.replace(/^\+/, "");
  s = s.replace(/\D+/g, "");
  if (!s) return "";
  if (!s.startsWith("39")) s = "39" + s;
  return s;
}

/***********************
 * DEVICE ID
 ***********************/
function getDeviceId() {
  let id = Storage.get(KEYS.deviceId);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID())
      ? crypto.randomUUID()
      : "dev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 12);

    Storage.set(KEYS.deviceId, id);
  }
  return id;
}

/***********************
 * AUTO LOGIN
 ***********************/
window.addEventListener("load", () => {
  setupProfileUI();

  const session = readStoredSession();
  const logged = Storage.get(KEYS.loggedIn);
  let phone = session?.phone || Storage.get(KEYS.phone);
  let deviceId = session?.deviceId || Storage.get(KEYS.deviceId);

  const mode = Storage.mode();
  if (mode !== "local") {
    console.warn("Storage non persistente:", mode, "(iOS privata / blocchi privacy).");
  }

  if (session) restoreSession(session);
  else if (logged === "true" && phone && deviceId) {
    persistSession(phone, { deviceId, lastValid: Date.now() });
  }

  phone = Storage.get(KEYS.phone);
  deviceId = Storage.get(KEYS.deviceId);

  if ((session || logged === "true") && phone && deviceId) {
    showHome();
    startSessionCheck();
    safeCheckAccess(true);
    checkRenewReminder();
  } else {
    showLoginScreen("");
  }
});

/***********************
 * FETCH HELPER
 ***********************/
async function fetchWithRetry(url, options = {}, retries = 2) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return res;
  } catch (err) {
    if (retries > 0) return fetchWithRetry(url, options, retries - 1);
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function postApi(payload) {
  const res = await fetchWithRetry(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      token: TOKEN,
      ...payload
    })
  });
  return res.json();
}

/***********************
 * LOGIN
 ***********************/
async function login() {
  const phoneInput = document.getElementById("user");
  const err = document.getElementById("err");

  const phone = normalizePhone(phoneInput?.value);

  if (!phone) {
    err.textContent = "Inserisci il numero di telefono";
    return;
  }

  err.textContent = "Verifica in corso...";

  try {
    const deviceId = getDeviceId();

    const data = await postApi({
      action: "login",
      phone,
      deviceId
    });

    if (data && data.success) {
      sessionCleared = false;
      persistSession(phone, {
        deviceId,
        expiry: data.expiry,
        lastValid: Date.now()
      });
      failCount = 0;
      lastSuccess = Date.now();

      showHome();
      startSessionCheck();
      safeCheckAccess(true);
      checkRenewReminder(true);
    } else {
      const e = data?.error;
      if (e === "expired") err.textContent = "Abbonamento scaduto";
      else if (e === "not_found") err.textContent = "Numero non autorizzato";
      else err.textContent = "Accesso non consentito";
    }
  } catch (e) {
    err.textContent = "Errore di connessione";
  }
}

/***********************
 * LOGOUT
 ***********************/
function logout(showLogin = true, reason = "revoked") {
  clearSessionData();
  setChapterMode(false);
  currentScreen = "login";

  if (showLogin) {
    let msg = "Accesso revocato dall'amministratore";
    if (reason === "expired") msg = "Abbonamento scaduto";
    else if (reason === "not_found") msg = "Numero non autorizzato";
    showLoginScreen(msg);
  }
}

function clearSessionData() {
  sessionCleared = true;

  if (sessionTimer) {
    clearInterval(sessionTimer);
    sessionTimer = null;
  }

  [
    KEYS.loggedIn,
    KEYS.phone,
    KEYS.expiry,
    KEYS.session,
    KEYS.deviceId,
    KEYS.renewPopupLastShown,
    "token"
  ].forEach(key => Storage.remove(key));

  try {
    localStorage.removeItem("session");
    localStorage.removeItem("loggedIn");
    localStorage.removeItem("phone");
    localStorage.removeItem("expiry");
    localStorage.removeItem("deviceId");
    localStorage.removeItem("renewPopupLastShown");
    localStorage.removeItem("token");
  } catch (err) {
    console.warn("Pulizia localStorage non disponibile");
  }

  try {
    sessionStorage.clear();
  } catch (err) {
    console.warn("Pulizia sessionStorage non disponibile");
  }
}

function showLoginScreen(message = "") {
  hideAll();
  document.getElementById("login")?.classList.remove("hidden");
  const err = document.getElementById("err");
  if (err) err.textContent = message;
  updateProfileUI(false);
}

function getCurrentSessionPhone() {
  const session = readStoredSession();
  return session?.phone || Storage.get(KEYS.phone) || "";
}

function updateProfileUI(isLoggedIn = true) {
  const profileBtn = document.getElementById("profileBtn");
  const profilePanel = document.getElementById("profilePanel");
  const userPhone = document.getElementById("userPhone");
  if (!profileBtn || !profilePanel) return;

  const phone = isLoggedIn ? getCurrentSessionPhone() : "";
  profileBtn.classList.toggle("hidden", !phone);
  profilePanel.classList.add("hidden");
  profileBtn.setAttribute("aria-expanded", "false");
  if (userPhone) userPhone.textContent = phone ? "Telefono: " + phone : "";
}

function setupProfileUI() {
  const profileBtn = document.getElementById("profileBtn");
  const profilePanel = document.getElementById("profilePanel");
  const logoutBtn = document.getElementById("logoutBtn");
  if (!profileBtn || !profilePanel || !logoutBtn) return;

  profileBtn.addEventListener("click", event => {
    event.stopPropagation();
    const phone = getCurrentSessionPhone();
    const userPhone = document.getElementById("userPhone");
    if (userPhone) userPhone.textContent = phone ? "Telefono: " + phone : "";
    profilePanel.classList.toggle("hidden");
    profileBtn.setAttribute("aria-expanded", profilePanel.classList.contains("hidden") ? "false" : "true");
  });

  profilePanel.addEventListener("click", event => event.stopPropagation());

  document.addEventListener("click", () => {
    profilePanel.classList.add("hidden");
    profileBtn.setAttribute("aria-expanded", "false");
  });

  logoutBtn.addEventListener("click", () => {
    clearSessionData();
    updateProfileUI(false);
    showLoginScreen("");
    window.location.href = "index.html";
  });
}

/***********************
 * SESSION CHECK
 ***********************/
let sessionTimer = null;
let failCount = 0;
let lastSuccess = Date.now();
let accessCheckRunning = false;
let sessionCleared = false;

function startSessionCheck() {
  if (sessionTimer) clearInterval(sessionTimer);
  sessionTimer = setInterval(() => safeCheckAccess(), CHECK_INTERVAL);
}

function getAccessStatus(data) {
  const status = data?.status || data?.error;
  if (data?.success === true || status === "success") return "success";
  if (status === "expired" || status === "not_found") return status;
  return "unknown";
}

async function checkAccessAPI() {
  const session = readStoredSession();
  if (session) restoreSession(session);

  const phone = session?.phone || Storage.get(KEYS.phone);
  const deviceId = session?.deviceId || Storage.get(KEYS.deviceId);

  if (!phone || !deviceId) {
    console.warn("Sessione incompleta, tengo lo stato senza logout automatico");
    return { status: "unknown" };
  }

  const data = await postApi({ action: "validate", phone, deviceId });
  return {
    status: getAccessStatus(data),
    data,
    phone,
    deviceId
  };
}

async function safeCheckAccess(force = false) {
  const now = Date.now();

  if (sessionCleared) return;
  if (accessCheckRunning) return;

  if (!force) {
    if (now - lastImmediateValidate < IMMEDIATE_VALIDATE_COOLDOWN) return;
  }

  accessCheckRunning = true;
  immediateValidateRunning = true;
  lastImmediateValidate = now;

  try {
    const res = await checkAccessAPI();

    if (sessionCleared) return;

    if (res.status === "success") {
      failCount = 0;
      lastSuccess = Date.now();
      persistSession(res.phone, {
        deviceId: res.deviceId,
        expiry: res.data?.expiry,
        lastValid: lastSuccess
      });
      checkRenewReminder();
      return;
    }

    if (res.status === "expired" || res.status === "not_found") {
      logout(true, res.status);
      return;
    }

    failCount++;
    console.warn("Risposta temporanea o sconosciuta, sessione mantenuta attiva");
  } catch (error) {
    failCount++;
    console.warn("Problema temporaneo di rete/API, sessione mantenuta attiva");
  } finally {
    if (Date.now() - lastSuccess > MAX_SILENT_FAILURE_TIME) {
      console.warn("Errore prolungato, ma nessun logout automatico senza conferma backend");
    }
    accessCheckRunning = false;
    immediateValidateRunning = false;
  }
}

/***********************
 * VALIDATE IMMEDIATO
 ***********************/
let lastImmediateValidate = 0;
let immediateValidateRunning = false;

async function runImmediateValidate(force = false) {
  return safeCheckAccess(force);
}

/***********************
 * POPUP RINNOVO
 ***********************/
function getDaysToExpiry() {
  const expiry = Storage.get(KEYS.expiry);
  if (!expiry) return null;

  const expDate = new Date(expiry);
  if (isNaN(expDate.getTime())) return null;

  const now = new Date();
  const diffMs = expDate.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getTodayKey() {
  const d = new Date();
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

function checkRenewReminder(force = false) {
  const daysLeft = getDaysToExpiry();
  if (daysLeft === null) return;
  if (daysLeft < 0) return;
  if (daysLeft > 7) return;

  const todayKey = getTodayKey();
  const lastShown = Storage.get(KEYS.renewPopupLastShown);

  if (!force && lastShown === todayKey) return;

  showRenewPopup(daysLeft);
  Storage.set(KEYS.renewPopupLastShown, todayKey);
}

function showRenewPopup(daysLeft) {
  const old = document.getElementById("renewPopupOverlay");
  if (old) old.remove();

  // Inject styles once
  if (!document.getElementById("renewPopupStyles")) {
    const style = document.createElement("style");
    style.id = "renewPopupStyles";
    style.textContent = `
      @keyframes renewSlideUp {
        from { opacity: 0; transform: translateY(28px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      #renewPopupBox {
        animation: renewSlideUp 0.38s cubic-bezier(0.22,1,0.36,1) both;
      }
      .rpkg-card {
        display: flex;
        align-items: center;
        gap: 12px;
        background: #f8f9ff;
        border: 1.5px solid #e8eaf6;
        border-radius: 16px;
        padding: 14px 16px;
        margin-bottom: 10px;
        cursor: pointer;
        transition: box-shadow 0.2s, border-color 0.2s, transform 0.15s;
        -webkit-tap-highlight-color: transparent;
      }
      .rpkg-card:hover   { box-shadow: 0 6px 24px rgba(99,102,241,0.13); border-color: #6366f1; transform: translateY(-1px); }
      .rpkg-card:active  { transform: scale(0.985); }
      .rpkg-card.popular { background: linear-gradient(135deg,#f0f0ff 0%,#f5f3ff 100%); border-color: #8b5cf6; }
      .rpkg-icon {
        width: 40px; height: 40px; border-radius: 12px;
        display: flex; align-items: center; justify-content: center;
        font-size: 18px; flex-shrink: 0;
      }
      .rpkg-info { flex: 1; text-align: left; }
      .rpkg-price {
        font-size: 20px; font-weight: 800; line-height: 1.1;
      }
      .rpkg-duration {
        font-size: 13px; font-weight: 600; color: #555; margin-top: 1px;
      }
      .rpkg-badge {
        font-size: 10px; font-weight: 700; letter-spacing: 0.4px;
        padding: 2px 7px; border-radius: 20px;
        background: #ede9fe; color: #7c3aed;
        display: inline-block; margin-top: 3px;
      }
      .rpkg-btn {
        border: none; border-radius: 12px;
        padding: 10px 0; font-size: 13px; font-weight: 700;
        color: #fff; cursor: pointer; white-space: nowrap;
        width: 82px; flex: 0 0 82px; text-align: center;
        transition: opacity 0.15s, transform 0.12s;
      }
      .rpkg-btn:hover  { opacity: 0.87; transform: scale(1.05); }
      .rpkg-btn:active { transform: scale(0.96); }
      .renew-dismiss {
        display: block; width: 100%; margin-top: 14px;
        padding: 12px; background: transparent;
        border: 1.5px solid #ebebeb; border-radius: 12px;
        font-size: 14px; color: #aaa; cursor: pointer;
        font-family: inherit;
        transition: background 0.15s, color 0.15s;
      }
      .renew-dismiss:hover { background: #f7f7f7; color: #666; }
    `;
    document.head.appendChild(style);
  }

  // Overlay
  const overlay = document.createElement("div");
  overlay.id = "renewPopupOverlay";
  overlay.style.cssText = [
    "position:fixed;inset:0;",
    "background:rgba(10,10,30,0.62);",
    "backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);",
    "z-index:999999;",
    "display:flex;align-items:center;justify-content:center;",
    "padding:20px;"
  ].join("");
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  // Box
  const box = document.createElement("div");
  box.id = "renewPopupBox";
  box.style.cssText = [
    "background:#ffffff;",
    "width:100%;max-width:440px;",
    "border-radius:24px;",
    "padding:24px 20px 20px;",
    "box-shadow:0 32px 80px rgba(0,0,0,0.24);",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;"
  ].join("");

  // — Header —
  const header = document.createElement("div");
  header.style.cssText = "text-align:center;margin-bottom:18px;";

  const alertBadge = document.createElement("div");
  alertBadge.style.cssText = [
    "display:inline-flex;align-items:center;gap:5px;",
    "background:#fff3e0;color:#d84315;",
    "font-size:11px;font-weight:700;letter-spacing:0.4px;",
    "padding:5px 13px;border-radius:30px;margin-bottom:14px;"
  ].join("");
  const daysText = daysLeft === 0 ? "আজকেই শেষ!" : `${daysLeft} দিন বাকি`;
  alertBadge.innerHTML = `⏳&nbsp;${daysText}`;

  const titleEl = document.createElement("div");
  titleEl.style.cssText = "font-size:21px;font-weight:800;color:#0f0f1e;margin-bottom:5px;";
  titleEl.textContent = "প্ল্যান রিনিউ করুন";

  const subtitleEl = document.createElement("div");
  subtitleEl.style.cssText = "font-size:13px;color:#888;line-height:1.5;";
  subtitleEl.textContent = "আপনার পছন্দের প্যাকেজ বেছে নিন এবং WhatsApp-এ সহজেই অ্যাক্টিভ করুন।";

  header.appendChild(alertBadge);
  header.appendChild(titleEl);
  header.appendChild(subtitleEl);

  // — Divider —
  const hr = document.createElement("div");
  hr.style.cssText = "height:1px;background:#f0f0f0;margin-bottom:16px;";

  // — Package cards —
  const packages = [
    {
      price: "১০€", duration: "৩০ দিন",
      icon: "📅", iconBg: "#e8f5e9", color: "#16a34a",
      msgPrice: "১০€", msgDays: "৩০",
      popular: false
    },
    {
      price: "২০€", duration: "৯০ দিন",
      icon: "⭐", iconBg: "#ede9fe", color: "#7c3aed",
      msgPrice: "২০€", msgDays: "৯০",
      popular: true
    },
    {
      price: "৪০€", duration: "৩৬৫ দিন",
      icon: "🏆", iconBg: "#fff3e0", color: "#d97706",
      msgPrice: "৪০€", msgDays: "৩৬৫",
      popular: false
    }
  ];

  const pkgWrap = document.createElement("div");

  packages.forEach(pkg => {
    const card = document.createElement("div");
    card.className = "rpkg-card" + (pkg.popular ? " popular" : "");

    // Icon
    const iconEl = document.createElement("div");
    iconEl.className = "rpkg-icon";
    iconEl.style.background = pkg.iconBg;
    iconEl.textContent = pkg.icon;

    // Info
    const info = document.createElement("div");
    info.className = "rpkg-info";

    const priceEl = document.createElement("div");
    priceEl.className = "rpkg-price";
    priceEl.style.color = pkg.color;
    priceEl.textContent = pkg.price;

    const durEl = document.createElement("div");
    durEl.className = "rpkg-duration";
    durEl.textContent = pkg.duration;

    info.appendChild(priceEl);
    info.appendChild(durEl);

    if (pkg.popular) {
      const badge = document.createElement("div");
      badge.className = "rpkg-badge";
      badge.textContent = "★ সবচেয়ে জনপ্রিয়";
      info.appendChild(badge);
    }

    // Button
    const btn = document.createElement("button");
    btn.className = "rpkg-btn";
    btn.style.background = `linear-gradient(135deg, ${pkg.color} 0%, ${pkg.color}bb 100%)`;
    btn.textContent = "Scegli";

    btn.onclick = e => {
      e.stopPropagation();
      const phone = Storage.get(KEYS.phone) || "";
      const msgText = `Ciao, voglio attivare il pacchetto ${pkg.msgPrice} (${pkg.msgDays} giorni)${phone ? `. Numero: ${phone}` : ""}`;
      const url = `https://wa.me/${RENEW_WHATSAPP_NUMBER}?text=${encodeURIComponent(msgText)}`;
      window.open(url, "_blank");
      overlay.remove();
    };

    card.appendChild(iconEl);
    card.appendChild(info);
    card.appendChild(btn);

    card.onclick = e => { if (e.target !== btn) btn.click(); };

    pkgWrap.appendChild(card);
  });

  // — Dismiss —
  const dismiss = document.createElement("button");
  dismiss.className = "renew-dismiss";
  dismiss.textContent = "Adesso no";
  dismiss.onclick = () => overlay.remove();

  box.appendChild(header);
  box.appendChild(hr);
  box.appendChild(pkgWrap);
  box.appendChild(dismiss);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

/***********************
 * EVENTI EXTRA MOBILE
 ***********************/
// Re-validate only when the user genuinely returns to the app.
// touchstart / click / scroll are intentionally excluded — they fire on every
// user gesture and cause unnecessary API hammering without any safety benefit,
// since the interval-based check and the visibility/focus handlers below are
// already sufficient.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) safeCheckAccess(true);
});

window.addEventListener("focus", () => safeCheckAccess(true));
window.addEventListener("pageshow", () => safeCheckAccess(true));

/***********************
 * UI NAVIGATION
 ***********************/
function hideAll() {
  ["login", "home", "chapters", "viewer"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
}

function showHome() {
  hideAll();
  document.getElementById("home")?.classList.remove("hidden");
  setChapterMode(false);
  document.body.classList.add("app-mode");
  showAppHeader("home");
  currentScreen = "home";
  updateProfileUI(true);
}

function showChapters() {
  runImmediateValidate();
  hideAll();
  document.getElementById("chapters")?.classList.remove("hidden");
  setChapterMode(false);
  document.body.classList.add("app-mode");
  showAppHeader("chapters");
  currentScreen = "chapters";
  updateProfileUI(true);
  requestAnimationFrame(() => updateCardTrack());
}

function back() { goBack(); }

/***********************
 * CAPITOLI (CARD STACK)
 ***********************/
const TOTAL_CHAPTERS = 25;
let selectedChapter = 1;

const CARD_WIDTH = 140;
const CARD_GAP = 16;
const CARD_SPACING = CARD_WIDTH + CARD_GAP;

function clampChapter(value) {
  return Math.max(1, Math.min(TOTAL_CHAPTERS, value));
}

function formatChapter(value) {
  return String(value).padStart(2, "0");
}

function getTrackBaseOffset(chapter) {
  const viewport = document.getElementById("cardSelectorViewport");
  if (!viewport) return 0;
  const w = viewport.getBoundingClientRect().width;
  return (w - CARD_WIDTH) / 2 - (chapter - 1) * CARD_SPACING;
}

function updateCardStyles() {
  const track = document.getElementById("chapterCardTrack");
  if (!track) return;

  track.querySelectorAll(".chapter-card").forEach((card, i) => {
    const dist = Math.min(Math.abs(i - (selectedChapter - 1)), 2);
    const scale = [1, 0.85, 0.72][dist];
    const opacity = [1, 0.65, 0.38][dist];
    card.style.transform = `scale(${scale})`;
    card.style.opacity = opacity;
    card.classList.toggle("is-active", dist === 0);
  });

  document.querySelectorAll(".chapter-card-dot").forEach((dot, i) => {
    dot.classList.toggle("is-active", i + 1 === selectedChapter);
  });
}

function updateCardTrack(dragOffset) {
  const track = document.getElementById("chapterCardTrack");
  if (!track) return;
  const base = getTrackBaseOffset(selectedChapter);
  track.style.transform = `translateX(${base + (dragOffset || 0)}px)`;
}

function selectChapter(num) {
  selectedChapter = clampChapter(num);
  updateCardStyles();
  updateCardTrack();
}

let cardDragging = false;
let cardDragStartX = 0;
let cardDragDelta = 0;
let cardPointerMoved = false;

function initCardTrack() {
  const track = document.getElementById("chapterCardTrack");
  const dotsEl = document.getElementById("chapterCardDots");
  if (!track) return;

  for (let i = 1; i <= TOTAL_CHAPTERS; i++) {
    const card = document.createElement("div");
    card.className = "chapter-card";
    card.dataset.chapter = i;
    card.innerHTML = `
      <span class="chapter-card-label">Capitolo</span>
      <strong class="chapter-card-number">${formatChapter(i)}</strong>
    `;
    track.appendChild(card);
  }

  if (dotsEl) {
    for (let i = 1; i <= TOTAL_CHAPTERS; i++) {
      const dot = document.createElement("span");
      dot.className = "chapter-card-dot";
      dot.dataset.chapter = i;
      dot.addEventListener("click", () => selectChapter(i));
      dotsEl.appendChild(dot);
    }
  }

  track.addEventListener("pointerdown", e => {
    cardDragging = true;
    cardPointerMoved = false;
    cardDragStartX = e.clientX;
    cardDragDelta = 0;
    track.classList.add("is-dragging");
    track.setPointerCapture(e.pointerId);
  });

  track.addEventListener("pointermove", e => {
    if (!cardDragging) return;
    cardDragDelta = e.clientX - cardDragStartX;
    if (Math.abs(cardDragDelta) > 5) cardPointerMoved = true;
    updateCardTrack(cardDragDelta);
  });

  const endDrag = e => {
    if (!cardDragging) return;
    cardDragging = false;
    track.classList.remove("is-dragging");
    if (track.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId);

    if (cardPointerMoved) {
      const steps = Math.round(-cardDragDelta / CARD_SPACING);
      selectChapter(selectedChapter + steps);
    } else {
      const tapped = e.target.closest(".chapter-card");
      if (tapped) {
        const ch = parseInt(tapped.dataset.chapter);
        if (ch === selectedChapter) startEngineSequence();
        else selectChapter(ch);
      } else {
        updateCardTrack();
      }
    }
    cardDragDelta = 0;
  };

  track.addEventListener("pointerup", endDrag);
  track.addEventListener("pointercancel", endDrag);

  document.addEventListener("keydown", e => {
    if (document.getElementById("chapters")?.classList.contains("hidden")) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); selectChapter(selectedChapter + 1); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); selectChapter(selectedChapter - 1); }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startEngineSequence(); }
  });

  updateCardStyles();
}

initCardTrack();

/***********************
 * ENGINE START SEQUENCE
 ***********************/
let engineStarting = false;

function startEngineSequence() {
  if (engineStarting) return;
  engineStarting = true;

  const engineBtn = document.getElementById("engineBtn");
  const engineImg = document.getElementById("engineImg");
  const chaptersEl = document.getElementById("chapters");

  // Fallback: no dashboard present, navigate directly
  if (!engineBtn) {
    openChapter(selectedChapter);
    engineStarting = false;
    return;
  }

  // --- Sound ---
  try {
    const audio = new Audio("icons/car_on.mp3");
    audio.volume = 0.9;
    audio.play().catch(() => {});
  } catch (_) {}

  // --- Button boot animation ---
  engineBtn.classList.add("is-starting");

  // --- Screen shake ---
  if (chaptersEl) {
    chaptersEl.classList.add("engine-shaking");
    chaptersEl.addEventListener("animationend", () => {
      chaptersEl.classList.remove("engine-shaking");
    }, { once: true });
  }

  // --- Crossfade car_off → car_on ---
  if (engineImg) {
    setTimeout(() => {
      engineImg.style.opacity = "0";
      setTimeout(() => {
        engineImg.src = "icons/car_on.png";
        engineImg.style.opacity = "1";
      }, 220);
    }, 80);
  }

  // --- Accent flash ---
  setTimeout(() => {
    const flash = document.createElement("div");
    flash.className = "engine-flash";
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 600);
  }, 300);

  // --- Navigate to chapter ---
  setTimeout(() => {
    openChapter(selectedChapter);

    // Reset engine button after viewer is open (invisible to user)
    setTimeout(() => {
      engineStarting = false;
      engineBtn.classList.remove("is-starting");
      if (engineImg) {
        engineImg.style.opacity = "0";
        setTimeout(() => {
          engineImg.src = "icons/car_off.png";
          engineImg.style.opacity = "1";
        }, 280);
      }
    }, 700);
  }, 1650);
}

function initDashboard() {
  const engineBtn = document.getElementById("engineBtn");
  const fuelGauge = document.getElementById("fuelGauge");
  const rpmGauge  = document.getElementById("rpmGauge");

  if (engineBtn) {
    engineBtn.addEventListener("click", () => startEngineSequence());
  }

  function gaugeClick(el) {
    if (!el) return;
    el.classList.remove("gauge-pulse");
    void el.offsetWidth;
    el.classList.add("gauge-pulse");
    el.addEventListener("animationend", () => el.classList.remove("gauge-pulse"), { once: true });
  }

  if (fuelGauge) fuelGauge.addEventListener("click", () => gaugeClick(fuelGauge));
  if (rpmGauge)  rpmGauge.addEventListener("click",  () => gaugeClick(rpmGauge));
}

initDashboard();

/***********************
 * EXAM
 ***********************/
function openExam() {
  runImmediateValidate(true);
  openImageFolder("exam", "exam_page");
}

function openChapter(cap) {
  runImmediateValidate(true);
  openImageFolder(`cap${cap}`, `magic book-${cap}_page`);
}

/***********************
 * APP HEADER & MENU
 ***********************/
let currentViewingChapter = null;
let currentScreen = "login"; // login | home | chapters | viewer | exam

function setChapterMode(enabled, chapterNum = null) {
  const viewerBackBtn = document.getElementById("viewerBackBtn");

  if (enabled) {
    document.body.classList.add("app-mode");
    if (viewerBackBtn) viewerBackBtn.classList.add("hidden");
    showAppHeader("chapter", chapterNum);
    return;
  }

  document.body.classList.remove("app-mode");
  hideAppHeader();
  if (viewerBackBtn) viewerBackBtn.classList.add("hidden");
}

function showAppHeader(context = "chapter", param = null) {
  const header  = document.getElementById("appHeader");
  if (!header) return;

  header.classList.remove("hidden");
  requestAnimationFrame(() => header.classList.add("is-visible"));

  const nameEl  = document.getElementById("headerChapterName");
  const iconEl  = document.getElementById("statusIcon");
  const backBtn = document.getElementById("backBtn");
  const menuBtn = document.querySelector(".menu-btn");

  // Menu only visible inside a chapter viewer or exam
  const menuVisible = context === "chapter" || context === "exam";
  if (menuBtn) menuBtn.classList.toggle("menu-btn-hidden", !menuVisible);
  if (!menuVisible) closeChapterMenu();

  if (context === "home") {
    if (nameEl) nameEl.textContent = "Magic Book";
    if (iconEl) iconEl.src = "icons/home.png";
    backBtn?.classList.add("back-hidden");
    return;
  }

  if (context === "chapters") {
    if (nameEl) nameEl.textContent = "Scegli Capitolo";
    if (iconEl) iconEl.src = "icons/chapter.png";
    backBtn?.classList.remove("back-hidden");
    return;
  }

  if (context === "exam") {
    if (nameEl) nameEl.textContent = "Esame Finale";
    if (iconEl) iconEl.src = "icons/true.png";
    backBtn?.classList.remove("back-hidden");
    return;
  }

  // Default: context === "chapter" (viewer)
  if (iconEl) iconEl.src = "icons/chapter.png";
  backBtn?.classList.remove("back-hidden");
  const num = param || currentViewingChapter;
  if (nameEl) nameEl.textContent = `Capitolo ${num}`;
  if (num) currentViewingChapter = num;
}

function hideAppHeader() {
  const header = document.getElementById("appHeader");
  header?.classList.remove("is-visible");
  closeChapterMenu();
  currentViewingChapter = null;
}

function buildChapterMenu() {
  const list = document.getElementById("menuChaptersList");
  if (!list) return;

  list.innerHTML = "";

  for (let i = 1; i <= TOTAL_CHAPTERS; i++) {
    const item = document.createElement("div");
    item.className = "menu-chapter-item";
    if (currentViewingChapter === i) item.classList.add("active");

    item.innerHTML = `
      <span class="menu-chapter-num">${String(i).padStart(2, "0")}</span>
      <span>Capitolo ${i}</span>
    `;
    item.onclick = () => openChapterFromMenu(i);
    list.appendChild(item);
  }
}

function toggleChapterMenu() {
  const menu    = document.getElementById("chapterMenu");
  const overlay = document.getElementById("menuOverlay");
  if (!menu) return;

  if (menu.classList.contains("menu-open")) {
    closeChapterMenu();
  } else {
    buildChapterMenu();
    menu.classList.add("menu-open");
    overlay?.classList.add("overlay-visible");
    document.body.classList.add("body-menu-open");
  }
}

function closeChapterMenu() {
  document.getElementById("chapterMenu")?.classList.remove("menu-open");
  document.getElementById("menuOverlay")?.classList.remove("overlay-visible");
  document.body.classList.remove("body-menu-open");
}

function openChapterFromMenu(chapterNum) {
  closeChapterMenu();
  openChapter(chapterNum);
}

// Context-aware back navigation
function goBack() {
  closeChapterMenu();
  if (currentScreen === "quizMode") {
    closeQuizModeScreen();
    return;
  }
  if (currentScreen === "viewer" || currentScreen === "exam") {
    runImmediateValidate();
    showChapters();
  } else if (currentScreen === "chapters") {
    showHome();
  }
  // On home screen the back button is hidden, so nothing needed
}

// Legacy alias
function goBackFromChapter() { goBack(); }

function goHome() {
  closeChapterMenu();
  showHome();
}

function openExamFromMenu() {
  closeChapterMenu();
  openExam();
}

function openQuizFromMenu() {
  closeChapterMenu();
  openQuiz();
}

/***********************
 * VIEWER
 ***********************/
function openImageFolder(folder, prefix) {
  runImmediateValidate();

  hideAll();
  document.getElementById("viewer")?.classList.remove("hidden");
  document.getElementById("viewerBackBtn")?.classList.add("hidden");
  
  // Extract chapter number from folder name
  const capMatch = folder.match(/^cap(\d+)$/);
  if (capMatch) {
    const chapterNum = parseInt(capMatch[1]);
    currentScreen = "viewer";
    setChapterMode(true, chapterNum);
  } else if (folder === "exam") {
    currentScreen = "exam";
    setChapterMode(false);
    document.body.classList.add("app-mode");
    showAppHeader("exam");
  }
  
  const pages = document.getElementById("pages");
  if (!pages) return;

  pages.innerHTML = "";
  let page = 1;

  function loadNext() {
    const n = String(page).padStart(4, "0");
    const img = new Image();
    img.src = `capitoli/${folder}/${prefix}-${n}.jpg`;

    img.onload = () => {
      const box = document.createElement("div");
      box.className = "page";

      const shield = document.createElement("div");
      shield.className = "shield";
      shield.oncontextmenu = e => e.preventDefault();

      box.appendChild(img);
      box.appendChild(shield);
      pages.appendChild(box);

      page++;
      loadNext();
    };

    img.onerror = () => { };
  }

  loadNext();
}

function openQuiz() {
  openQuizModeScreen();
}

/***********************
 * QUIZ MODE SELECTION
 ***********************/

// ── State ──────────────────────────────────────────────────────────────────
let qmsActiveMode    = null;   // "chapter" | "multi" | null
let qmsCapSelected   = null;   // single chapter number or null
let qmsMultiSelected = new Set();
let qmsPillsBuilt    = false;

// ── Open / Close ───────────────────────────────────────────────────────────

function openQuizModeScreen() {
  const overlay = document.getElementById("quizModeOverlay");
  if (!overlay) return;

  _qmsResetAll();

  if (!qmsPillsBuilt) {
    _buildQMSCapPills();
    _buildQMSMultiPills();
    qmsPillsBuilt = true;
  }

  overlay.classList.remove("hidden");
  requestAnimationFrame(() => overlay.classList.add("qms-visible"));
  document.body.classList.add("qms-open");
  currentScreen = "quizMode";
}

function closeQuizModeScreen() {
  const overlay = document.getElementById("quizModeOverlay");
  if (!overlay) return;
  overlay.classList.remove("qms-visible");
  setTimeout(() => {
    overlay.classList.add("hidden");
    document.body.classList.remove("qms-open");
  }, 450);
  currentScreen = "chapters";
}

// ── Internal reset helpers ─────────────────────────────────────────────────

function _qmsResetAll() {
  qmsActiveMode    = null;
  qmsCapSelected   = null;
  qmsMultiSelected = new Set();

  document.querySelectorAll(".qms-pill").forEach(p => p.classList.remove("is-selected"));

  const capBtn   = document.getElementById("qmsCapStartBtn");
  const multiBtn = document.getElementById("qmsMultiStartBtn");
  const hint     = document.getElementById("qmsMultiHint");
  if (capBtn)   capBtn.disabled   = true;
  if (multiBtn) multiBtn.disabled = true;
  if (hint) {
    hint.textContent = "Seleziona almeno 2 capitoli";
    hint.classList.remove("is-ok");
  }

  _qmsUpdateCardStates();
}

function _qmsResetCapMode() {
  qmsCapSelected = null;
  document.querySelectorAll("#qmsCapPills .qms-pill").forEach(p => p.classList.remove("is-selected"));
  const btn = document.getElementById("qmsCapStartBtn");
  if (btn) btn.disabled = true;
}

function _qmsResetMultiMode() {
  qmsMultiSelected = new Set();
  document.querySelectorAll("#qmsMultiPills .qms-pill").forEach(p => p.classList.remove("is-selected"));
  const btn  = document.getElementById("qmsMultiStartBtn");
  const hint = document.getElementById("qmsMultiHint");
  if (btn) btn.disabled = true;
  if (hint) {
    hint.textContent = "Seleziona almeno 2 capitoli";
    hint.classList.remove("is-ok");
  }
}

// ── Visual state ───────────────────────────────────────────────────────────

function _qmsUpdateCardStates() {
  const cardMix   = document.getElementById("qmsCardMix");
  const cardCap   = document.getElementById("qmsCardCap");
  const cardMulti = document.getElementById("qmsCardMulti");

  [cardMix, cardCap, cardMulti].forEach(c => {
    if (c) c.classList.remove("qms-card--active", "qms-card--inactive");
  });

  if (qmsActiveMode === "chapter") {
    cardCap?.classList.add("qms-card--active");
    cardMix?.classList.add("qms-card--inactive");
    cardMulti?.classList.add("qms-card--inactive");
  } else if (qmsActiveMode === "multi") {
    cardMulti?.classList.add("qms-card--active");
    cardMix?.classList.add("qms-card--inactive");
    cardCap?.classList.add("qms-card--inactive");
  }
}

// ── Pill builders (run once) ───────────────────────────────────────────────

function _buildQMSCapPills() {
  const container = document.getElementById("qmsCapPills");
  if (!container) return;

  for (let i = 1; i <= TOTAL_CHAPTERS; i++) {
    const pill = document.createElement("button");
    pill.className   = "qms-pill";
    pill.textContent = String(i).padStart(2, "0");
    pill.dataset.ch  = i;

    pill.addEventListener("click", () => {
      // Entering chapter mode clears any multi selection
      if (qmsActiveMode === "multi") _qmsResetMultiMode();

      if (qmsCapSelected === i) {
        // Toggle off: same chapter clicked again
        qmsCapSelected = null;
        pill.classList.remove("is-selected");
        qmsActiveMode = null;
      } else {
        // Replace previous chapter selection with this one
        document.querySelectorAll("#qmsCapPills .qms-pill")
          .forEach(p => p.classList.remove("is-selected"));
        pill.classList.add("is-selected");
        qmsCapSelected = i;
        qmsActiveMode  = "chapter";
      }

      const btn = document.getElementById("qmsCapStartBtn");
      if (btn) btn.disabled = (qmsCapSelected === null);
      _qmsUpdateCardStates();
    });

    container.appendChild(pill);
  }
}

function _buildQMSMultiPills() {
  const container = document.getElementById("qmsMultiPills");
  if (!container) return;

  for (let i = 1; i <= TOTAL_CHAPTERS; i++) {
    const pill = document.createElement("button");
    pill.className   = "qms-pill";
    pill.textContent = String(i).padStart(2, "0");
    pill.dataset.ch  = i;

    pill.addEventListener("click", () => {
      // Entering multi mode clears any chapter selection
      if (qmsActiveMode === "chapter") _qmsResetCapMode();

      // Toggle this chapter
      if (qmsMultiSelected.has(i)) {
        qmsMultiSelected.delete(i);
        pill.classList.remove("is-selected");
      } else {
        qmsMultiSelected.add(i);
        pill.classList.add("is-selected");
      }

      const count = qmsMultiSelected.size;
      qmsActiveMode = count > 0 ? "multi" : null;

      const btn  = document.getElementById("qmsMultiStartBtn");
      const hint = document.getElementById("qmsMultiHint");
      if (btn) btn.disabled = count < 2;
      if (hint) {
        if (count === 0) {
          hint.textContent = "Seleziona almeno 2 capitoli";
          hint.classList.remove("is-ok");
        } else if (count === 1) {
          hint.textContent = "Seleziona ancora 1 capitolo";
          hint.classList.remove("is-ok");
        } else {
          hint.textContent = `${count} capitoli selezionati ✓`;
          hint.classList.add("is-ok");
        }
      }

      _qmsUpdateCardStates();
    });

    container.appendChild(pill);
  }
}

// ── Start actions ──────────────────────────────────────────────────────────

function startMixQuiz() {
  closeQuizModeScreen();
  setTimeout(() => { window.location.href = "quiz.html"; }, 460);
}

function startCapQuiz() {
  if (qmsCapSelected === null) return;
  const ch = qmsCapSelected;
  closeQuizModeScreen();
  setTimeout(() => { window.location.href = "quiz.html?chapters=" + ch; }, 460);
}

function startMultiQuiz() {
  if (qmsMultiSelected.size < 2) return;
  const chapters = Array.from(qmsMultiSelected).sort((a, b) => a - b).join(",");
  closeQuizModeScreen();
  setTimeout(() => { window.location.href = "quiz.html?chapters=" + encodeURIComponent(chapters); }, 460);
}

/***********************
 * CONTENT PROTECTION
 ***********************/
document.addEventListener("contextmenu", e => {
  if (e.target.closest("#viewer")) e.preventDefault();
});
document.addEventListener("dragstart", e => {
  if (e.target.closest("#viewer")) e.preventDefault();
});
document.addEventListener("copy", e => {
  if (e.target.closest("#viewer")) e.preventDefault();
});

/***********************
 * WHATSAPP BUTTON
 ***********************/
const whatsappBtn = document.getElementById("whatsappBtn");
if (whatsappBtn) {
  let moved = false, startX, startY;

  whatsappBtn.addEventListener("touchstart", e => {
    moved = false;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  whatsappBtn.addEventListener("touchmove", e => {
    const dx = Math.abs(e.touches[0].clientX - startX);
    const dy = Math.abs(e.touches[0].clientY - startY);
    if (dx > 6 || dy > 6) {
      moved = true;
      whatsappBtn.style.left = (e.touches[0].clientX - 30) + "px";
      whatsappBtn.style.top = (e.touches[0].clientY - 30) + "px";
    }
  }, { passive: true });

  whatsappBtn.addEventListener("click", () => {
    if (!moved) {
      window.open(
        "https://api.whatsapp.com/send/?phone=393663584525&text&type=phone_number&app_absent=0",
        "_blank"
      );
    }
  });
}
