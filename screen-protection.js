(function magicBookScreenProtection() {
  "use strict";

  if (window.__MAGICBOOK_SCREEN_PROTECTION__) return;
  Object.defineProperty(window, "__MAGICBOOK_SCREEN_PROTECTION__", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const PROTECTED_PATHS = [
    /^\/(?:home|capitoli|dizionario|admin)(?:\/|$)/,
    /^\/magic-book(?:\/|$)/,
    /^\/quiz(?:\.html)?(?:\/|$)/,
    /^\/(?:studia-quiz|study-quiz(?:\.html)?)(?:\/|$)/,
    /^\/aggiungi-spiegazioni(?:\.html)?(?:\/|$)/,
    /^\/prova-gratis\/libro-(?:1|3)(?:\/|$)/
  ];
  const PUBLIC_PATHS = new Set(["/", "/login", "/join", "/about", "/prova-gratis"]);
  const HOST_ID = "magicbook-screen-protection";
  const REVEAL_DELAY_MS = 240;
  const CAPTURE_REVEAL_DELAY_MS = 1800;

  let active = false;
  let revealTimer = 0;
  let watermarkTimer = 0;
  let motionTimer = 0;
  let toastTimer = 0;
  let host = null;
  let shadow = null;
  let watermark = null;
  let shieldMessage = null;
  let toast = null;

  function normalizePath(pathname = window.location.pathname) {
    return String(pathname || "/").replace(/\/+$/, "") || "/";
  }

  function routeNeedsProtection(pathname = window.location.pathname) {
    const path = normalizePath(pathname);
    if (PUBLIC_PATHS.has(path)) return false;
    return PROTECTED_PATHS.some(pattern => pattern.test(path));
  }

  function pageNeedsProtection() {
    const body = document.body;
    if (!body) return routeNeedsProtection();
    if (body.dataset.screenProtection === "always") return true;
    if (body.classList.contains("public-mode")) return false;
    if (body.classList.contains("app-mode") || body.classList.contains("admin-mode")) return true;
    return routeNeedsProtection();
  }

  function safeStorageValue(storage, key) {
    try {
      return String(storage?.getItem(key) || "");
    } catch (_) {
      return "";
    }
  }

  function safeSessionObject() {
    const candidates = [
      safeStorageValue(window.localStorage, "user_session"),
      safeStorageValue(window.localStorage, "session")
    ];
    for (const raw of candidates) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed;
      } catch (_) {
        // A malformed local cache must never disable the protection layer.
      }
    }
    return {};
  }

  function shortFingerprint(value) {
    let hash = 2166136261;
    const text = String(value || "magicbook");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(-7);
  }

  function getMaskedIdentity() {
    const session = safeSessionObject();
    const rawPhone = String(session.phone || safeStorageValue(window.localStorage, "phone"));
    const phoneDigits = rawPhone.replace(/\D/g, "");
    const deviceId = String(
      session.deviceId
      || safeStorageValue(window.localStorage, "deviceId")
      || safeStorageValue(window.localStorage, "magicbook_user_id")
      || safeStorageValue(window.sessionStorage, "magicbook_trial_id")
      || "magicbook-session"
    );
    const token = shortFingerprint(`${rawPhone}|${deviceId}`);
    if (phoneDigits.length >= 4) return `UTENTE •••• ${phoneDigits.slice(-4)} · ${token}`;
    if (String(session.role || "").toLowerCase() === "admin") return `ADMIN · ${token}`;
    if (normalizePath().includes("prova-gratis")) return `PROVA · ${token}`;
    return `SESSIONE · ${token}`;
  }

  function getContextLabel() {
    const path = normalizePath();
    if (path.startsWith("/quiz")) return "QUIZ";
    if (path.startsWith("/studia-quiz") || path.startsWith("/study-quiz")) return "STUDIO";
    if (path.startsWith("/aggiungi-spiegazioni") || path === "/admin") return "ADMIN";
    if (path.startsWith("/dizionario")) return "DIZIONARIO";
    if (path.startsWith("/magic-book") || path.startsWith("/prova-gratis/libro-")) return "LIBRO";
    return "MAGICBOOK";
  }

  function formattedMinute() {
    const now = new Date();
    const date = new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(now);
    const time = new Intl.DateTimeFormat("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(now);
    return `${date} · ${time}`;
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function buildHost() {
    host = document.createElement("div");
    host.id = HOST_ID;
    host.setAttribute("aria-hidden", "true");
    host.dataset.active = "false";
    host.dataset.concealed = "false";
    shadow = host.attachShadow({ mode: "closed" });

    const style = createElement("style");
    style.textContent = `
      :host {
        all: initial;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        contain: strict;
        font-family: Inter, Arial, sans-serif;
      }
      :host([data-active="false"]) { display: none; }
      .watermark {
        position: absolute;
        inset: -8vh -8vw;
        display: grid;
        grid-template-columns: repeat(3, minmax(150px, 1fr));
        align-content: space-around;
        gap: clamp(44px, 10vh, 118px) clamp(20px, 7vw, 90px);
        transform: translate3d(var(--shift-x, 0), var(--shift-y, 0), 0);
        transition: transform 3.2s cubic-bezier(.22, .61, .36, 1);
        overflow: hidden;
      }
      .mark {
        justify-self: center;
        min-width: 138px;
        padding: 7px 10px;
        border: 1px solid rgba(10, 130, 112, .22);
        border-radius: 10px;
        color: rgba(5, 82, 73, .72);
        background: rgba(255, 255, 255, .32);
        box-shadow: 0 1px 0 rgba(255, 255, 255, .5) inset;
        font-size: clamp(8px, 1.15vw, 11px);
        font-weight: 800;
        line-height: 1.45;
        letter-spacing: .08em;
        text-align: center;
        white-space: pre-line;
        transform: rotate(-19deg);
        opacity: .28;
      }
      .shield {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 28px;
        color: #fff;
        background:
          radial-gradient(circle at 20% 10%, rgba(124, 255, 107, .18), transparent 33%),
          radial-gradient(circle at 85% 88%, rgba(10, 130, 112, .24), transparent 35%),
          #061411;
        opacity: 0;
        visibility: hidden;
        transition: opacity 90ms linear, visibility 90ms linear;
      }
      :host([data-concealed="true"]) .shield {
        opacity: 1;
        visibility: visible;
      }
      .shield-card {
        width: min(390px, calc(100vw - 48px));
        padding: 34px 28px;
        border: 1px solid rgba(124, 255, 107, .3);
        border-radius: 28px;
        background: rgba(7, 37, 32, .88);
        box-shadow: 0 30px 90px rgba(0, 0, 0, .45);
        text-align: center;
      }
      .shield-lock {
        display: grid;
        width: 58px;
        height: 58px;
        margin: 0 auto 18px;
        place-items: center;
        border-radius: 18px;
        color: #06231d;
        background: linear-gradient(135deg, #7cff6b, #24d17e);
        font: 900 28px/1 Arial, sans-serif;
      }
      .shield-card strong {
        display: block;
        margin-bottom: 8px;
        font-size: 22px;
        font-weight: 800;
      }
      .shield-card span {
        display: block;
        color: rgba(255, 255, 255, .72);
        font-size: 14px;
        line-height: 1.5;
      }
      .toast {
        position: absolute;
        left: 50%;
        bottom: max(24px, env(safe-area-inset-bottom));
        max-width: min(430px, calc(100vw - 32px));
        padding: 12px 18px;
        border: 1px solid rgba(124, 255, 107, .28);
        border-radius: 999px;
        color: #fff;
        background: rgba(5, 35, 30, .94);
        box-shadow: 0 14px 44px rgba(0, 0, 0, .28);
        font-size: 13px;
        font-weight: 700;
        line-height: 1.3;
        text-align: center;
        transform: translate(-50%, 18px);
        opacity: 0;
        transition: opacity .2s ease, transform .2s ease;
      }
      .toast.is-visible { opacity: 1; transform: translate(-50%, 0); }
      @media (max-width: 680px) {
        .watermark { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
        .mark { opacity: .25; }
      }
      @media (prefers-reduced-motion: reduce) {
        .watermark, .shield, .toast { transition: none; }
      }
    `;

    watermark = createElement("div", "watermark");
    for (let index = 0; index < 12; index += 1) {
      watermark.appendChild(createElement("span", "mark"));
    }

    const shield = createElement("div", "shield");
    const shieldCard = createElement("div", "shield-card");
    shieldCard.appendChild(createElement("span", "shield-lock", "●"));
    shieldCard.appendChild(createElement("strong", "", "Contenuto protetto"));
    shieldMessage = createElement("span", "", "Torna a MagicBook per continuare.");
    shieldCard.appendChild(shieldMessage);
    shield.appendChild(shieldCard);
    toast = createElement("div", "toast");

    shadow.append(style, watermark, shield, toast);
    document.documentElement.appendChild(host);
  }

  function ensureHost() {
    if (!host) buildHost();
    if (!document.documentElement.contains(host)) document.documentElement.appendChild(host);
  }

  function updateWatermark() {
    if (!active) return;
    ensureHost();
    const line = `TMM MAGICBOOK · ${getContextLabel()}\n${getMaskedIdentity()} · ${formattedMinute()}`;
    shadow.querySelectorAll(".mark").forEach(mark => {
      mark.textContent = line;
    });
  }

  function moveWatermark() {
    if (!active || !watermark || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const x = Math.round((Math.random() - 0.5) * 34);
    const y = Math.round((Math.random() - 0.5) * 42);
    watermark.style.setProperty("--shift-x", `${x}px`);
    watermark.style.setProperty("--shift-y", `${y}px`);
  }

  function showToast(message) {
    if (!active) return;
    ensureHost();
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
  }

  function conceal(message = "Torna a MagicBook per continuare.") {
    if (!active) return;
    window.clearTimeout(revealTimer);
    ensureHost();
    shieldMessage.textContent = message;
    host.dataset.concealed = "true";
  }

  function reveal(delay = REVEAL_DELAY_MS) {
    if (!active) return;
    window.clearTimeout(revealTimer);
    revealTimer = window.setTimeout(() => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        if (!active || document.visibilityState === "hidden" || !document.hasFocus()) return;
        if (host) host.dataset.concealed = "false";
      }));
    }, delay);
  }

  function setActive(nextActive) {
    if (active === nextActive && host) {
      if (active) updateWatermark();
      return;
    }
    active = nextActive;
    ensureHost();
    host.dataset.active = String(active);
    document.documentElement.dataset.screenProtected = String(active);
    if (!active) {
      host.dataset.concealed = "false";
      window.clearInterval(watermarkTimer);
      window.clearInterval(motionTimer);
      watermarkTimer = 0;
      motionTimer = 0;
      return;
    }
    updateWatermark();
    moveWatermark();
    if (!watermarkTimer) watermarkTimer = window.setInterval(updateWatermark, 30000);
    if (!motionTimer) motionTimer = window.setInterval(moveWatermark, 24000);
    if (document.visibilityState === "hidden" || !document.hasFocus()) conceal();
  }

  function refreshProtection() {
    setActive(pageNeedsProtection());
  }

  function isEditableTarget(target) {
    return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true'], [data-screen-protection-allow]"));
  }

  function blockProtectedAction(event, message = "Azione disattivata sui contenuti protetti.") {
    if (!active || isEditableTarget(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showToast(message);
  }

  document.addEventListener("visibilitychange", () => {
    if (!active) return;
    if (document.visibilityState === "hidden") conceal();
    else reveal();
  }, true);
  window.addEventListener("blur", () => conceal(), true);
  window.addEventListener("focus", () => reveal(), true);
  window.addEventListener("pagehide", () => conceal(), true);
  window.addEventListener("pageshow", () => { refreshProtection(); reveal(); }, true);
  document.addEventListener("freeze", () => conceal(), true);
  document.addEventListener("resume", () => reveal(), true);
  window.addEventListener("beforeprint", () => conceal("La stampa dei contenuti e disattivata."), true);
  window.addEventListener("afterprint", () => reveal(), true);

  document.addEventListener("keydown", event => {
    if (!active) return;
    const key = String(event.key || "");
    const lowerKey = key.toLowerCase();
    const printScreen = key === "PrintScreen" || event.code === "PrintScreen";
    const macCapture = event.metaKey && event.shiftKey && ["3", "4", "5"].includes(key);
    const saveOrPrint = (event.ctrlKey || event.metaKey) && ["p", "s"].includes(lowerKey);
    const snippingShortcut = event.ctrlKey && event.shiftKey && lowerKey === "s";
    if (!printScreen && !macCapture && !saveOrPrint && !snippingShortcut) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    conceal("La cattura, il salvataggio e la stampa sono disattivati.");
    showToast("Cattura disattivata: contenuto riservato MagicBook.");
    reveal(CAPTURE_REVEAL_DELAY_MS);
  }, true);

  document.addEventListener("keyup", event => {
    if (!active || (event.key !== "PrintScreen" && event.code !== "PrintScreen")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    conceal("La cattura, il salvataggio e la stampa sono disattivati.");
    showToast("Cattura disattivata: contenuto riservato MagicBook.");
    reveal(CAPTURE_REVEAL_DELAY_MS);
  }, true);

  ["copy", "cut", "dragstart", "contextmenu", "selectstart"].forEach(type => {
    document.addEventListener(type, blockProtectedAction, true);
  });

  window.addEventListener("popstate", refreshProtection, true);
  window.addEventListener("hashchange", refreshProtection, true);

  if (typeof MutationObserver === "function") {
    const rootObserver = new MutationObserver(() => {
      if (active && host && !document.documentElement.contains(host)) {
        document.documentElement.appendChild(host);
      }
    });
    rootObserver.observe(document.documentElement, { childList: true });

    if (document.body) {
      new MutationObserver(refreshProtection).observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "data-screen-protection"]
      });
    }
  }

  refreshProtection();
})();
