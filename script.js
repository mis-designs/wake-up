/***********************
 * CONFIG
 ***********************/
const API_URL = "https://script.google.com/macros/s/AKfycbxOOQ-8FYN4qv0e5575rNyrvjTiZtEUmaNUj07KjBkjN1G9iCl0Ks4iWcSxthbuWh9h5A/exec";
const CHECK_INTERVAL = 30 * 1000;
const IMMEDIATE_VALIDATE_COOLDOWN = 4000;

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
  renewPopupLastShown: "renewPopupLastShown"
};

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
  const logged = Storage.get(KEYS.loggedIn);
  const phone = Storage.get(KEYS.phone);
  const deviceId = Storage.get(KEYS.deviceId);

  const mode = Storage.mode();
  if (mode !== "local") {
    console.warn("Storage non persistente:", mode, "(iOS privata / blocchi privacy).");
  }

  if (logged === "true" && phone && deviceId) {
    showHome();
    startSessionCheck();
    runImmediateValidate(true);
    checkRenewReminder();
  } else {
    logout(false);
  }
});

/***********************
 * FETCH HELPER
 ***********************/
async function postApi(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
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
      Storage.set(KEYS.loggedIn, "true");
      Storage.set(KEYS.phone, phone);

      if (data.expiry) {
        Storage.set(KEYS.expiry, data.expiry);
      }

      showHome();
      startSessionCheck();
      runImmediateValidate(true);
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
function logout(showLogin = true) {
  Storage.remove(KEYS.loggedIn);
  Storage.remove(KEYS.phone);
  Storage.remove(KEYS.expiry);
  setChapterMode(false);
  currentScreen = "login";

  if (showLogin) {
    hideAll();
    document.getElementById("login")?.classList.remove("hidden");
    const err = document.getElementById("err");
    if (err) err.textContent = "Accesso revocato dall'amministratore";
  }
}

/***********************
 * SESSION CHECK
 ***********************/
let sessionTimer = null;

function startSessionCheck() {
  if (sessionTimer) clearInterval(sessionTimer);

  sessionTimer = setInterval(async () => {
    const phone = Storage.get(KEYS.phone);
    const deviceId = Storage.get(KEYS.deviceId);

    if (!phone || !deviceId) {
      logout();
      return;
    }

    try {
      const data = await postApi({ action: "validate", phone, deviceId });

      if (data?.expiry) {
        Storage.set(KEYS.expiry, data.expiry);
      }

      if (!data || data.success !== true) {
        logout();
        return;
      }

      checkRenewReminder();
    } catch (err) {
      console.warn("Check fallito, rete assente");
    }
  }, CHECK_INTERVAL);
}

/***********************
 * VALIDATE IMMEDIATO
 ***********************/
let lastImmediateValidate = 0;
let immediateValidateRunning = false;

async function runImmediateValidate(force = false) {
  const now = Date.now();

  if (!force) {
    if (immediateValidateRunning) return;
    if (now - lastImmediateValidate < IMMEDIATE_VALIDATE_COOLDOWN) return;
  }

  const phone = Storage.get(KEYS.phone);
  const deviceId = Storage.get(KEYS.deviceId);

  if (!phone || !deviceId) {
    logout();
    return;
  }

  immediateValidateRunning = true;
  lastImmediateValidate = now;

  try {
    const data = await postApi({
      action: "validate",
      phone,
      deviceId
    });

    if (data?.expiry) {
      Storage.set(KEYS.expiry, data.expiry);
    }

    if (!data || data.success !== true) {
      logout();
      return;
    }

    checkRenewReminder();
  } catch (err) {
    console.warn("Validate immediato fallito");
  } finally {
    immediateValidateRunning = false;
  }
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

  const overlay = document.createElement("div");
  overlay.id = "renewPopupOverlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.55)";
  overlay.style.zIndex = "999999";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.padding = "20px";

  const box = document.createElement("div");
  box.style.background = "#fff";
  box.style.color = "#111";
  box.style.width = "100%";
  box.style.maxWidth = "420px";
  box.style.borderRadius = "18px";
  box.style.padding = "22px";
  box.style.boxShadow = "0 20px 60px rgba(0,0,0,.25)";
  box.style.textAlign = "center";
  box.style.fontFamily = "Arial, sans-serif";

  const title = document.createElement("div");
  title.textContent = "Il tuo accesso sta per scadere";
  title.style.fontSize = "22px";
  title.style.fontWeight = "700";
  title.style.marginBottom = "12px";

  const msg = document.createElement("div");
  msg.textContent = daysLeft === 0
    ? "শেষ সুযোগ। এখনই রিনিউ করুন — ১০€ তে আরও ৯০ দিন।"
    : `মেয়াদ শেষ হতে আর ${daysLeft} দিন বাকি। এখনই রিনিউ করুন — ১০€ তে ৯০ দিন।`;
  msg.style.fontSize = "15px";
  msg.style.lineHeight = "1.5";
  msg.style.marginBottom = "18px";

  const btnRenew = document.createElement("button");
  btnRenew.textContent = "Rinnova";
  btnRenew.style.background = "#25D366";
  btnRenew.style.color = "#fff";
  btnRenew.style.border = "0";
  btnRenew.style.padding = "12px 18px";
  btnRenew.style.borderRadius = "12px";
  btnRenew.style.fontSize = "16px";
  btnRenew.style.fontWeight = "700";
  btnRenew.style.cursor = "pointer";
  btnRenew.style.marginRight = "10px";

  btnRenew.onclick = () => {
    const phone = Storage.get(KEYS.phone) || "";
    const text = `${RENEW_MESSAGE} Numero: ${phone}`;
    const url = `https://wa.me/${RENEW_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
    overlay.remove();
  };

  const btnClose = document.createElement("button");
  btnClose.textContent = "Chiudi";
  btnClose.style.background = "#eee";
  btnClose.style.color = "#111";
  btnClose.style.border = "0";
  btnClose.style.padding = "12px 18px";
  btnClose.style.borderRadius = "12px";
  btnClose.style.fontSize = "16px";
  btnClose.style.cursor = "pointer";

  btnClose.onclick = () => overlay.remove();

  box.appendChild(title);
  box.appendChild(msg);
  box.appendChild(btnRenew);
  box.appendChild(btnClose);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

/***********************
 * EVENTI EXTRA MOBILE
 ***********************/
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) runImmediateValidate(true);
});

window.addEventListener("focus", () => runImmediateValidate(true));
window.addEventListener("pageshow", () => runImmediateValidate(true));
document.addEventListener("touchstart", () => runImmediateValidate(), { passive: true });
document.addEventListener("click", () => runImmediateValidate(), true);
window.addEventListener("scroll", () => runImmediateValidate(), { passive: true });

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
}

function showChapters() {
  runImmediateValidate();
  hideAll();
  document.getElementById("chapters")?.classList.remove("hidden");
  setChapterMode(false);
  document.body.classList.add("app-mode");
  showAppHeader("chapters");
  currentScreen = "chapters";
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
  openImageFolder(`cap${cap}`, `Magic Book-${cap}_page`);
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
  window.location.href = "quiz.html";
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
