/***********************
 * CONFIG
 ***********************/
// numero whatsapp per rinnovo
const RENEW_WHATSAPP_NUMBER = "393663584525";
const RENEW_MESSAGE = "Ciao, vorrei rinnovare il mio accesso.";
const WHATSAPP_GROUP_CODE = "LBL1G7nvz2B3SThJj4uRxD";
const AUTH_API = "/api/auth";
const ADMIN_API = "/api/admin";
const PROMO_STATUS_API = "/api/promo-status";
const APP_TITLE = "MagicBook";
const EXPLANATION_FIGURES_CACHE_KEY = "magicbook_explanation_figures_v1";
const PROMO_CAMPAIGN_DURATION_MS = 3 * 24 * 60 * 60 * 1000;
const FREE_TRIAL_CHAPTERS = Object.freeze([1, 3]);
const FREE_TRIAL_CHAPTER_SET = new Set(FREE_TRIAL_CHAPTERS);
const FREE_TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const FREE_TRIAL_POLICY_VERSION = "chapters-1-3-audio-preview-v2";
let applyingRouteFromHistory = false;

function isFreeTrialChapter(chapter) {
  return FREE_TRIAL_CHAPTER_SET.has(Number(chapter));
}

function openExternalUrl(url) {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (opened) opened.opener = null;
  return opened;
}

function normalizeRoutePath(path = window.location.pathname) {
  return String(path || "/").replace(/\/+$/, "") || "/";
}

function getChapterPath(chapter) {
  return `/magic-book/capitolo-${String(chapter).padStart(2, "0")}`;
}

function getQuizPath(params = {}) {
  if (params.mode === "exam80") return "/quiz/esame-80";
  if (params.mode === "exam30") return "/quiz/esame-30";
  if (params.chapters) {
    const chapters = String(params.chapters);
    if (/^\d+$/.test(chapters)) return `/quiz/capitolo-${chapters.padStart(2, "0")}`;
    return `/quiz/multi?chapters=${encodeURIComponent(chapters)}`;
  }
  return "/quiz";
}

function getAppRoute(state = {}) {
  if (state.screen === "welcome") return "/";
  if (state.screen === "login") return "/login";
  if (state.screen === "join") return "/join";
  if (state.screen === "about") return "/about";
  if (state.screen === "trialHub") return "/prova-gratis";
  if (state.screen === "home") return "/home";
  if (state.screen === "chapters") return "/magic-book";
  if (state.screen === "dictionary") return "/dizionario";
  if (state.screen === "statistics") return "/statistiche";
  if (state.screen === "errors") return "/errori";
  if (state.screen === "admin") return "/admin";
  if (state.screen === "exam") return "/magic-book/esame-pdf";
  if (state.screen === "viewer" && state.chapter) return getChapterPath(state.chapter);
  return "/home";
}

function getRouteTitle(state = {}) {
  if (state.screen === "welcome") return APP_TITLE;
  if (state.screen === "login") return `${APP_TITLE} | Accesso`;
  if (state.screen === "join") return `${APP_TITLE} | Pacchetti`;
  if (state.screen === "about") return `${APP_TITLE} | About`;
  if (state.screen === "home") return `${APP_TITLE} | Home`;
  if (state.screen === "chapters") return `${APP_TITLE} | Capitoli`;
  if (state.screen === "dictionary") return `${APP_TITLE} | Dizionario`;
  if (state.screen === "statistics") return `${APP_TITLE} | Statistiche`;
  if (state.screen === "errors") return `${APP_TITLE} | Errori`;
  if (state.screen === "admin") return `${APP_TITLE} | Admin`;
  if (state.screen === "exam") return `${APP_TITLE} | Esame PDF`;
  if (state.screen === "viewer" && state.chapter) return `${APP_TITLE} | Capitolo ${state.chapter}`;
  return APP_TITLE;
}

function setAppRoute(state = {}, options = {}) {
  document.title = getRouteTitle(state);
  if (applyingRouteFromHistory) return;

  const path = getAppRoute(state);
  const current = normalizeRoutePath();
  if (current === path) return;

  const method = options.replace ? "replaceState" : "pushState";
  window.history[method](state, "", path);
}

function getRouteStateFromLocation() {
  const path = normalizeRoutePath();
  if (path === "/prova-gratis" || /^\/prova-gratis\/libro-(1|3)$/.test(path)) {
    return { screen: "welcome" };
  }
  const chapterMatch = path.match(/^\/magic-book\/capitolo-(\d{1,2})$/);
  if (chapterMatch) {
    return { screen: "viewer", chapter: clampChapter(Number(chapterMatch[1])) };
  }
  if (path === "/magic-book/esame-pdf") return { screen: "exam" };
  if (path === "/magic-book" || path === "/capitoli") return { screen: "chapters" };
  if (path === "/dizionario") return { screen: "dictionary" };
  if (path === "/statistiche") return { screen: "statistics" };
  if (path === "/errori") return { screen: "errors" };
  if (path === "/admin") return { screen: "admin" };
  if (path === "/login") return { screen: "login" };
  if (path === "/join") return { screen: "join" };
  if (path === "/about") return { screen: "about" };
  if (path === "/home") return { screen: "home" };
  return { screen: "welcome" };
}

function openRouteState(state = getRouteStateFromLocation()) {
  const publicScreens = ["welcome", "login", "join", "about"];
  const requestedState = publicScreens.includes(state.screen)
    ? { screen: "home" }
    : state;
  const nextState = requestedState.screen === "admin" && !isCurrentSessionAdmin()
    ? { screen: "home" }
    : requestedState;

  applyingRouteFromHistory = true;
  try {
    if (nextState.screen === "trialHub") {
      startGuestTrial({ replace: true });
    } else if (nextState.screen === "trialBook") {
      startGuestTrial({ replace: true, openChapter: nextState.chapter });
    } else if (nextState.screen === "admin") {
      showAdminPanel();
    } else if (nextState.screen === "chapters") {
      showChapters();
    } else if (nextState.screen === "dictionary") {
      showMagicDictionary({ replace: true });
    } else if (nextState.screen === "statistics") {
      showLearningStatistics({ replace: true });
    } else if (nextState.screen === "errors") {
      showLearningErrors({ replace: true });
    } else if (nextState.screen === "viewer") {
      openMagicBookPages({ type: "chapter", chapter: nextState.chapter });
    } else if (nextState.screen === "exam") {
      openMagicBookPages({ type: "exam" });
    } else {
      showHome();
    }
  } finally {
    applyingRouteFromHistory = false;
  }
  setAppRoute(nextState, { replace: true });
}

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

  return {
    get(key) {
      if (ls) return ls.getItem(key);
      return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
    },
    set(key, val) {
      const v = String(val);
      if (ls) { ls.setItem(key, v); return "local"; }
      mem[key] = v;
      return "memory";
    },
    remove(key) {
      if (ls) ls.removeItem(key);
      delete mem[key];
    },
    mode() {
      if (ls) return "local";
      return "memory";
    }
  };
})();

const KEYS = {
  deviceId: "deviceId",
  loggedIn: "loggedIn",
  phone: "phone",
  expiry: "expiry",
  accessToken: "accessToken",
  accessTokenExpiresAt: "accessTokenExpiresAt",
  quizSessionToken: "quizSessionToken",
  quizSessionTokenExpiresAt: "quizSessionTokenExpiresAt",
  session: "user_session",
  legacySession: "session",
  renewPopupLastShown: "renewPopupLastShown",
  renewPopupDailyState: "renewPopupDailyState"
};

const CLIENT_AUTH_RESET_VERSION = "2026-04-device-reset-1";
const CLIENT_AUTH_RESET_KEY = "client_auth_reset_version";
const ACCESS_TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const ACCESS_VALIDATION_INTERVAL_MS = 5 * 60 * 1000;
const OTP_COOLDOWN_SECONDS = 120;
let accessValidationTimer = null;
let accessValidationPromise = null;
let pendingOtpLogin = null;
let otpResendTimer = null;
let otpRetryAtMs = 0;
let otpResendLoading = false;
let adminPasswordRequired = false;

function getClientAuthResetVersion() {
  try {
    return localStorage.getItem(CLIENT_AUTH_RESET_KEY);
  } catch {
    return Storage.get(CLIENT_AUTH_RESET_KEY);
  }
}

function setClientAuthResetVersion(version) {
  try {
    localStorage.setItem(CLIENT_AUTH_RESET_KEY, version);
  } catch {
    // Storage fallback keeps the app usable in restricted/private contexts.
  }
  Storage.set(CLIENT_AUTH_RESET_KEY, version);
}

async function forceGlobalAuthResetIfNeeded() {
  const current = getClientAuthResetVersion();

  if (current === CLIENT_AUTH_RESET_VERSION) return false;

  await clearSessionDataForGlobalReset();

  setClientAuthResetVersion(CLIENT_AUTH_RESET_VERSION);

  return true;
}

function readStoredSession() {
  const rawSessionValues = [Storage.get(KEYS.session), Storage.get(KEYS.legacySession)].filter(Boolean);

  for (const raw of rawSessionValues) {
    try {
      const session = JSON.parse(raw);
      if (session?.phone) return session;
    } catch (err) {
      console.warn("Sessione salvata non leggibile, continuo senza logout automatico");
    }
  }

  return null;
}

function persistSession(phone, data = {}) {
  if (!phone) return;

  const existing = readStoredSession() || {};
  const session = {
    ...existing,
    phone,
    deviceId: data.deviceId || existing.deviceId || Storage.get(KEYS.deviceId) || getDeviceId(),
    loggedIn: true,
    accessToken: data.accessToken || existing.accessToken || Storage.get(KEYS.accessToken) || "",
    accessTokenExpiresAt: data.accessTokenExpiresAt || existing.accessTokenExpiresAt || Number(Storage.get(KEYS.accessTokenExpiresAt) || 0),
    role: data.role || existing.role || "user",
    lastLogin: data.lastLogin || existing.lastLogin || Date.now(),
    lastValid: data.lastValid || existing.lastValid || Date.now()
  };

  if (data.expiry || existing.expiry) session.expiry = data.expiry || existing.expiry;

  Storage.set(KEYS.session, JSON.stringify(session));
  Storage.set(KEYS.loggedIn, "true");
  Storage.set(KEYS.phone, phone);
  Storage.set(KEYS.deviceId, session.deviceId);
  if (session.accessToken) Storage.set(KEYS.accessToken, session.accessToken);
  if (session.accessTokenExpiresAt) Storage.set(KEYS.accessTokenExpiresAt, session.accessTokenExpiresAt);
  if (session.expiry) Storage.set(KEYS.expiry, session.expiry);
}

function restoreSession(session) {
  if (!session?.phone) return false;
  persistSession(session.phone, {
    deviceId: session.deviceId,
    expiry: session.expiry,
    role: session.role,
    accessToken: session.accessToken,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    lastValid: session.lastValid || Date.now()
  });
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
  if (s.startsWith("00")) s = s.slice(2);
  if (!s.startsWith("39")) s = "39" + s;
  return s;
}

/***********************
 * DEVICE ID
 ***********************/
const DEVICE_DB_NAME = "magicph_device";
const DEVICE_STORE_NAME = "kv";
let cachedDeviceId = null;

function isValidStoredDeviceId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function createDeviceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "dev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 12);
}

function getDeviceCookie() {
  if (typeof document === "undefined" || !document.cookie) return null;
  const name = encodeURIComponent(KEYS.deviceId) + "=";
  const match = document.cookie
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(name));

  if (!match) return null;

  try {
    return decodeURIComponent(match.slice(name.length));
  } catch {
    return null;
  }
}

function setDeviceCookie(id) {
  if (typeof document === "undefined" || !isValidStoredDeviceId(id)) return;
  document.cookie = `${encodeURIComponent(KEYS.deviceId)}=${encodeURIComponent(id)}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function openDeviceDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb_unavailable"));
      return;
    }

    const request = indexedDB.open(DEVICE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DEVICE_STORE_NAME)) {
        db.createObjectStore(DEVICE_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexeddb_error"));
  });
}

async function getIndexedDbDeviceId() {
  let db = null;
  try {
    db = await openDeviceDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DEVICE_STORE_NAME, "readonly");
      const request = tx.objectStore(DEVICE_STORE_NAME).get(KEYS.deviceId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("indexeddb_read_error"));
    });
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

async function setIndexedDbDeviceId(id) {
  let db = null;
  try {
    db = await openDeviceDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DEVICE_STORE_NAME, "readwrite");
      tx.objectStore(DEVICE_STORE_NAME).put(id, KEYS.deviceId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("indexeddb_write_error"));
    });
  } catch {
    // IndexedDB is a best-effort persistence layer.
  } finally {
    db?.close();
  }
}

async function clearIndexedDbDeviceId() {
  let db = null;
  try {
    db = await openDeviceDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DEVICE_STORE_NAME, "readwrite");
      tx.objectStore(DEVICE_STORE_NAME).delete(KEYS.deviceId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("indexeddb_delete_error"));
    });
  } catch {
    // IndexedDB is a best-effort persistence layer.
  } finally {
    db?.close();
  }
}

function clearDeviceCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${encodeURIComponent(KEYS.deviceId)}=; Max-Age=0; Path=/; SameSite=Lax`;
  document.cookie = `${encodeURIComponent(KEYS.deviceId)}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`;
}

async function clearSessionDataForGlobalReset() {
  // This forced admin reset is the only client-side cleanup allowed to delete deviceId.
  if (accessValidationTimer) {
    clearInterval(accessValidationTimer);
    accessValidationTimer = null;
  }

  [
    KEYS.deviceId,
    KEYS.loggedIn,
    KEYS.phone,
    KEYS.expiry,
    KEYS.session,
    KEYS.legacySession,
    KEYS.accessToken,
    KEYS.accessTokenExpiresAt,
    KEYS.quizSessionToken,
    KEYS.quizSessionTokenExpiresAt,
    KEYS.renewPopupLastShown,
    KEYS.renewPopupDailyState,
  ].forEach(key => Storage.remove(key));

  try {
    [
      "deviceId",
      "loggedIn",
      "phone",
      "expiry",
      "user_session",
      "session",
      "accessToken",
      "accessTokenExpiresAt",
      "quizSessionToken",
      "quizSessionTokenExpiresAt",
      "renewPopupLastShown",
      "renewPopupDailyState",
    ].forEach(key => localStorage.removeItem(key));
  } catch (err) {
    console.warn("Pulizia reset globale localStorage non disponibile");
  }

  cachedDeviceId = null;
  clearDeviceCookie();
  await clearIndexedDbDeviceId();
}

function syncDeviceId(id) {
  if (!isValidStoredDeviceId(id)) return;
  cachedDeviceId = id;
  Storage.set(KEYS.deviceId, id);
  setDeviceCookie(id);
  setIndexedDbDeviceId(id);
}

async function getRobustDeviceId() {
  const candidates = [
    cachedDeviceId,
    Storage.get(KEYS.deviceId),
    getDeviceCookie(),
    await getIndexedDbDeviceId(),
    readStoredSession()?.deviceId
  ];

  const existing = candidates.find(isValidStoredDeviceId);
  const id = existing || createDeviceId();
  syncDeviceId(id);
  return id;
}

function getDeviceId() {
  const id = [
    cachedDeviceId,
    Storage.get(KEYS.deviceId),
    getDeviceCookie(),
    readStoredSession()?.deviceId
  ].find(isValidStoredDeviceId) || createDeviceId();

  syncDeviceId(id);
  return id;
}

/***********************
 * AUTO LOGIN
 ***********************/
window.addEventListener("load", async () => {
  const wasReset = await forceGlobalAuthResetIfNeeded();

  setupLoginUI();
  setupPromoLandingUI();
  setupProfileUI();
  setupAdminUI();
  void setupPromoCampaign();

  if (wasReset) {
    const publicRoute = getRouteStateFromLocation();
    if (publicRoute.screen === "trialHub") {
      startGuestTrial({ replace: true });
    } else if (publicRoute.screen === "trialBook") {
      startGuestTrial({ replace: true, openChapter: publicRoute.chapter });
    } else if (publicRoute.screen === "login") {
      showLoginScreen("Effettua nuovamente il login.", { replace: true });
    } else if (publicRoute.screen === "join") {
      showJoinScreen({ replace: true });
    } else if (publicRoute.screen === "about") {
      showAboutScreen({ replace: true });
    } else {
      showLandingScreen({ replace: true });
    }
    return;
  }

  const stableDeviceId = await getRobustDeviceId();
  const session = readStoredSession();
  const logged = Storage.get(KEYS.loggedIn);
  let phone = session?.phone || Storage.get(KEYS.phone);
  let deviceId = stableDeviceId;

  const mode = Storage.mode();
  if (mode !== "local") {
    console.warn("Storage non persistente:", mode, "(iOS privata / blocchi privacy).");
  }

  if (session) restoreSession({ ...session, deviceId });
  else if (logged === "true" && phone && deviceId) {
    persistSession(phone, { deviceId, lastLogin: Date.now(), lastValid: Date.now() });
  }

  phone = Storage.get(KEYS.phone);
  deviceId = await getRobustDeviceId();

  if ((session || logged === "true") && phone && deviceId) {
    openRouteState(getRouteStateFromLocation());
    maybeShowWhatsNewPopup();
    void window.MagicDictionaryFeature?.onAuthenticated();
    checkRenewReminder();
    startAccessValidationTimer();
    // Always reconcile a restored session once with the server. This repairs
    // the admin role immediately when a mobile/private browser kept the phone
    // and device but lost or partially rewrote the previous token.
    validateRestoredSession(phone, deviceId);
  } else {
    const publicRoute = getRouteStateFromLocation();
    if (publicRoute.screen === "trialHub") {
      startGuestTrial({ replace: true });
    } else if (publicRoute.screen === "trialBook") {
      startGuestTrial({ replace: true, openChapter: publicRoute.chapter });
    } else if (publicRoute.screen === "login") {
      showLoginScreen("", { replace: true });
    } else if (publicRoute.screen === "join") {
      showJoinScreen({ replace: true });
    } else if (publicRoute.screen === "about") {
      showAboutScreen({ replace: true });
    } else {
      showLandingScreen({ replace: true });
    }
  }
});

function isRevokedSessionError(error) {
  return ["expired", "not_found", "device_replaced", "device_mismatch"].includes(error);
}

function getCurrentAccessToken() {
  const session = readStoredSession();
  return Storage.get(KEYS.accessToken) || session?.accessToken || "";
}

function getAccessTokenExpiresAt() {
  const session = readStoredSession();
  return Number(Storage.get(KEYS.accessTokenExpiresAt) || session?.accessTokenExpiresAt || 0);
}

function isAccessTokenUsable(skewMs = 0) {
  return Boolean(getCurrentAccessToken()) && getAccessTokenExpiresAt() > Date.now() + skewMs;
}

function shouldRefreshAccessToken() {
  return !isAccessTokenUsable(ACCESS_TOKEN_REFRESH_SKEW_MS);
}

function startAccessValidationTimer() {
  if (accessValidationTimer) clearInterval(accessValidationTimer);
  accessValidationTimer = setInterval(() => {
    const phone = getCurrentSessionPhone();
    const deviceId = getCurrentSessionDeviceId();
    if (phone && deviceId) {
      validateRestoredSession(phone, deviceId);
    }
  }, ACCESS_VALIDATION_INTERVAL_MS);
}

async function ensureAccessToken(options = {}) {
  if (!options.force && isAccessTokenUsable(ACCESS_TOKEN_REFRESH_SKEW_MS)) {
    return true;
  }

  const phone = getCurrentSessionPhone();
  const deviceId = getCurrentSessionDeviceId();
  if (!phone || !deviceId) return false;

  try {
    const data = await validateLoginAccess(phone, deviceId);
    const error = data?.error || data?.status;

    if (isRevokedSessionError(error)) {
      logout(true, error);
      return false;
    }

    if (data?.success) {
      persistSession(phone, {
        deviceId,
        expiry: data.expiry,
        role: data.role,
        accessToken: data.accessToken,
        accessTokenExpiresAt: data.accessTokenExpiresAt,
        lastValid: Date.now()
      });
      updateAdminEntryVisibility();
      return true;
    }

    return isAccessTokenUsable();
  } catch (err) {
    console.warn("Access token refresh unavailable, keeping current session", err);
    return isAccessTokenUsable();
  }
}

async function validateRestoredSession(phone, deviceId) {
  if (accessValidationPromise) return accessValidationPromise;

  accessValidationPromise = (async () => {
    try {
      const data = await validateLoginAccess(phone, deviceId);
      const error = data?.error || data?.status;

      if (isRevokedSessionError(error)) {
        logout(true, error);
        return false;
      }

      if (data?.success) {
        persistSession(phone, {
          deviceId,
          expiry: data.expiry,
          role: data.role,
          accessToken: data.accessToken,
          accessTokenExpiresAt: data.accessTokenExpiresAt,
          lastValid: Date.now()
        });
        updateAdminEntryVisibility();
        checkRenewReminder();
        void warmExplanationFiguresCache();
        return true;
      }

      console.warn("Auto-login validation inconclusive, keeping stored session", data);
      return false;
    } catch (error) {
      console.warn("Auto-login validation unavailable, keeping stored session", error);
      return false;
    }
  })();

  try {
    return await accessValidationPromise;
  } finally {
    accessValidationPromise = null;
  }
}

async function validateLoginAccess(phone, deviceId, options = {}) {
  const accessToken = getCurrentAccessToken();
  const response = await fetch("/api/getPages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify({
      action: "validate",
      phone,
      deviceId,
      registerDevice: options.registerDevice === true
    })
  });

  let data = null;
  try {
    data = await response.json();
  } catch (err) {
    console.warn("Risposta validazione non leggibile", err);
  }

  if (response.status !== 200) {
    return data || { error: "temporary_error", statusCode: response.status };
  }

  return data;
}

async function requestAuthAction(payload) {
  const response = await fetch(AUTH_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  let data = null;
  try {
    data = await response.json();
  } catch (err) {
    console.warn("Risposta autenticazione non leggibile", err);
  }

  if (response.status !== 200) {
    return data || { success: false, error: "server_error", statusCode: response.status };
  }

  return data || { success: false, error: "server_error" };
}

const PROMO_LOGIN_RETRYABLE_ERRORS = new Set([
  "auth_backend_error",
  "busy",
  "server_error",
  "service_unavailable",
  "temporary_error"
]);

function waitForPromoRetry(delayMs) {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

async function requestPromoLoginWithRetry(payload, onRetry) {
  const delays = [450, 850, 1500, 2400, 3600];
  let lastData = null;

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      lastData = await requestAuthAction(payload);
    } catch {
      lastData = { success: false, error: "service_unavailable" };
    }

    const errorCode = String(lastData?.error || lastData?.status || "").trim();
    const shouldRetry = !lastData?.success
      && attempt < delays.length
      && (lastData?.retryable === true || PROMO_LOGIN_RETRYABLE_ERRORS.has(errorCode));
    if (!shouldRetry) break;

    if (typeof onRetry === "function") onRetry(attempt + 1);
    const serverDelay = Math.max(250, Math.min(5000, Number(lastData?.retryAfterMs) || delays[attempt]));
    const jitter = Math.floor(Math.random() * 450);
    await waitForPromoRetry(serverDelay + jitter);
  }

  return lastData || { success: false, error: "service_unavailable" };
}

function completeLogin(phone, deviceId, data) {
  persistSession(phone, {
    deviceId,
    expiry: data.expiry,
    role: data.role,
    accessToken: data.accessToken,
    accessTokenExpiresAt: data.accessTokenExpiresAt,
    lastLogin: Date.now(),
    lastValid: Date.now()
  });
  updateAdminEntryVisibility();

  const err = document.getElementById("err");
  if (err) err.textContent = "";
  const promoCodeInput = document.getElementById("promoCode");
  if (promoCodeInput) promoCodeInput.value = "";
  const promoLandingCodeInput = document.getElementById("promoLandingCode");
  if (promoLandingCodeInput) promoLandingCodeInput.value = "";
  const promoLandingError = document.getElementById("promoLandingError");
  if (promoLandingError) promoLandingError.textContent = "";
  hidePromoAccessNextStep();
  pendingOtpLogin = null;
  hideAdminPasswordUI();
  hideOtpUI();
  openRouteState(getRouteStateFromLocation());
  maybeShowWhatsNewPopup();
  void window.MagicDictionaryFeature?.onAuthenticated();
  startAccessValidationTimer();
  void warmExplanationFiguresCache();
  checkRenewReminder(true);
  maybeShowWhatsAppGroupPopup();

  if (data?.promoGranted) {
    setTimeout(() => showPromoLoginToast("Promo attivata: 5 giorni di accesso completo. La promozione può essere utilizzata una sola volta."), 120);
  } else if (data?.promoNotice === "access_already_active") {
    setTimeout(() => showPromoLoginToast("Il tuo accesso era già attivo: la scadenza non è stata modificata."), 120);
  }
}

function showPromoLoginToast(message) {
  document.querySelector(".promo-login-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "promo-login-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = String(message || "");
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5200);
}

/***********************
 * LOGIN
 ***********************/
function setLoginFieldInvalid(input, isInvalid) {
  if (!input) return;
  input.setAttribute("aria-invalid", isInvalid ? "true" : "false");
  input.classList.toggle("d-input-error", Boolean(isInvalid));
}

function setLoginButtonBusy(button, isBusy) {
  if (!button) return;
  const spinner = button.querySelector(".login-submit-spinner");
  button.classList.toggle("is-loading", Boolean(isBusy));
  button.setAttribute("aria-busy", isBusy ? "true" : "false");
  button.setAttribute("aria-disabled", button.disabled ? "true" : "false");
  spinner?.classList.toggle("hidden", !isBusy);
}

async function login(options = {}) {
  const fromPromoCard = options.source === "promo-card";
  const phoneInput = document.getElementById(fromPromoCard ? "promoLandingPhone" : "user");
  const promoCodeInput = document.getElementById(fromPromoCard ? "promoLandingCode" : "promoCode");
  const adminPasswordInput = document.getElementById("adminPassword");
  const err = document.getElementById(fromPromoCard ? "promoLandingError" : "err");
  const loginButton = document.querySelector(fromPromoCard ? ".promo-access-submit" : "#login .login-submit");
  const loginButtonLabel = loginButton?.querySelector("span") || loginButton;

  const phone = normalizePhone(phoneInput?.value);
  const promoCode = String(promoCodeInput?.value || "").trim();

  if (!isValidPhoneNumber(phoneInput?.value)) {
    if (err) err.textContent = "Inserisci un numero di telefono valido";
    setLoginFieldInvalid(phoneInput, true);
    phoneInput?.focus();
    if (fromPromoCard) updatePromoLandingButtonState();
    else updateLoginButtonState();
    return;
  }

  if (fromPromoCard && promoCode.length < 6) {
    if (err) err.textContent = "Inserisci il Promo Code.";
    setLoginFieldInvalid(promoCodeInput, true);
    promoCodeInput?.focus();
    updatePromoLandingButtonState();
    return;
  }

  const deviceId = await getRobustDeviceId();
  const originalText = loginButton?.dataset.defaultText || loginButtonLabel?.textContent || "Continua";

  if (loginButton) {
    loginButton.disabled = true;
    if (!fromPromoCard) setLoginButtonBusy(loginButton, true);
    else {
      loginButton.classList.add("is-loading");
      loginButton.setAttribute("aria-busy", "true");
      loginButton.setAttribute("aria-disabled", "true");
    }
    if (loginButtonLabel) loginButtonLabel.textContent = "Verifica...";
  }

  if (err) err.textContent = "";
  if (!fromPromoCard) {
    setLoginFieldInvalid(phoneInput, false);
    setLoginFieldInvalid(promoCodeInput, false);
    setLoginFieldInvalid(adminPasswordInput, false);
  } else {
    setLoginFieldInvalid(phoneInput, false);
    setLoginFieldInvalid(promoCodeInput, false);
  }

  try {
    const authPayload = {
      action: "login",
      phone,
      deviceId,
      promoCode: promoCode || undefined,
      adminPassword: adminPasswordRequired ? String(adminPasswordInput?.value || "") : undefined
    };
    const data = fromPromoCard
      ? await requestPromoLoginWithRetry(authPayload, () => {
          if (loginButtonLabel) loginButtonLabel.textContent = "Attivazione...";
        })
      : await requestAuthAction(authPayload);

    if (!data?.success) {
      if ((data?.error || data?.status) === "admin_password_required") {
        if (fromPromoCard) {
          const mainPhoneInput = document.getElementById("user");
          const mainPromoInput = document.getElementById("promoCode");
          if (mainPhoneInput) mainPhoneInput.value = phoneInput?.value || "";
          if (mainPromoInput) mainPromoInput.value = promoCode;
          showLoginScreen("Inserisci la password amministratore.");
        }
        showAdminPasswordUI();
        if (err) err.textContent = "Inserisci la password amministratore.";
        updateLoginButtonState();
        return;
      }

      if ((data?.error || data?.status) === "admin_password_invalid") {
        showAdminPasswordUI();
        if (adminPasswordInput) {
          adminPasswordInput.value = "";
          setLoginFieldInvalid(adminPasswordInput, true);
          adminPasswordInput.focus();
        }
        if (err) err.textContent = "Password amministratore non corretta.";
        updateLoginButtonState();
        return;
      }

      const loginError = data?.error || data?.status;
      if (loginError === "expired") {
        setTimeout(showExpiredRenewPopup, 80);
      }
      const promoConversionErrors = ["promo_already_used", "promo_code_reused", "promo_limit_reached", "promo_campaign_full"];
      if (promoConversionErrors.includes(loginError)) {
        if (fromPromoCard) {
          if (err) err.textContent = "";
          showPromoAccessNextStep(loginError);
        } else {
          const landingPhone = document.getElementById("promoLandingPhone");
          const landingCode = document.getElementById("promoLandingCode");
          showLandingScreen();
          if (landingPhone) landingPhone.value = phoneInput?.value || "";
          if (landingCode) landingCode.value = promoCode;
          updatePromoLandingButtonState();
          showPromoAccessNextStep(loginError);
        }
        return;
      }
      if (err) err.textContent = getLoginErrorMessage(loginError);
      if (!fromPromoCard && (loginError === "not_found" || loginError === "bad_phone")) {
        setLoginFieldInvalid(phoneInput, true);
        phoneInput?.focus();
      }
      if (["promo_invalid", "promo_expired", "promo_unavailable"].includes(loginError)) {
        setLoginFieldInvalid(promoCodeInput, true);
        promoCodeInput?.focus();
      }
      return;
    }

    completeLogin(phone, deviceId, data);
  } catch (error) {
    console.error("Login validation error", error);
    if (err) err.textContent = "Verifica non riuscita. Riprova tra poco.";
  } finally {
    if (loginButton) {
      if (!fromPromoCard) setLoginButtonBusy(loginButton, false);
      else {
        loginButton.classList.remove("is-loading");
        loginButton.setAttribute("aria-busy", "false");
      }
      if (loginButtonLabel) loginButtonLabel.textContent = originalText;
    }
    updateLoginButtonState();
    updatePromoLandingButtonState();
  }
}

function ensureAdminPasswordUI() {
  const input = document.getElementById("adminPassword");
  const toggle = document.getElementById("adminPasswordToggle");
  if (!input || input.dataset.loginUiReady === "true") return;

  input.dataset.loginUiReady = "true";

  input.addEventListener("input", () => {
    const err = document.getElementById("err");
    if (err) err.textContent = "";
    setLoginFieldInvalid(input, false);
    updateLoginButtonState();
  });

  toggle?.addEventListener("click", () => {
    const shouldReveal = input.type === "password";
    input.type = shouldReveal ? "text" : "password";
    toggle.textContent = shouldReveal ? "Nascondi" : "Mostra";
    toggle.setAttribute("aria-pressed", shouldReveal ? "true" : "false");
    toggle.setAttribute(
      "aria-label",
      shouldReveal ? "Nascondi password amministratore" : "Mostra password amministratore"
    );
    toggle.title = shouldReveal ? "Nascondi password" : "Mostra password";
    input.focus({ preventScroll: true });
  });
}

function showAdminPasswordUI() {
  ensureAdminPasswordUI();
  adminPasswordRequired = true;
  const group = document.getElementById("adminPasswordGroup");
  const input = document.getElementById("adminPassword");
  group?.classList.remove("hidden");
  group?.setAttribute("aria-hidden", "false");
  input?.setAttribute("aria-required", "true");
  input?.focus();
}

function hideAdminPasswordUI() {
  adminPasswordRequired = false;
  const group = document.getElementById("adminPasswordGroup");
  const input = document.getElementById("adminPassword");
  const toggle = document.getElementById("adminPasswordToggle");
  group?.classList.add("hidden");
  group?.setAttribute("aria-hidden", "true");
  if (!input) return;

  input.value = "";
  input.type = "password";
  input.setAttribute("aria-required", "false");
  setLoginFieldInvalid(input, false);
  if (toggle) {
    toggle.textContent = "Mostra";
    toggle.setAttribute("aria-pressed", "false");
    toggle.setAttribute("aria-label", "Mostra password amministratore");
    toggle.title = "Mostra password";
  }
}

function ensureOtpUI() {
  return;
  if (document.getElementById("otpForm")) return;

  const loginCard = document.getElementById("login");
  const loginForm = loginCard?.querySelector(".login-form");
  if (!loginCard || !loginForm) return;

  const otpForm = document.createElement("form");
  otpForm.id = "otpForm";
  otpForm.className = "otp-form hidden";
  otpForm.setAttribute("aria-describedby", "err");
  otpForm.addEventListener("submit", event => {
    event.preventDefault();
    verifyOtp();
  });

  const otpInput = document.createElement("input");
  otpInput.id = "otpCode";
  otpInput.type = "text";
  otpInput.inputMode = "numeric";
  otpInput.autocomplete = "one-time-code";
  otpInput.placeholder = "Codice OTP";
  otpInput.maxLength = 10;
  otpInput.setAttribute("aria-label", "Codice OTP");

  const actions = document.createElement("div");
  actions.className = "otp-actions";

  const verifyButton = document.createElement("button");
  verifyButton.id = "otpVerifyButton";
  verifyButton.className = "login-submit otp-submit";
  verifyButton.type = "submit";
  verifyButton.textContent = "Verifica";
  verifyButton.dataset.defaultText = "Verifica";

  const resendButton = document.createElement("button");
  resendButton.id = "otpResendButton";
  resendButton.className = "otp-resend";
  resendButton.type = "button";
  resendButton.textContent = "Reinvia codice";
  resendButton.addEventListener("click", resendOtp);

  const cancelButton = document.createElement("button");
  cancelButton.id = "otpCancelButton";
  cancelButton.className = "otp-cancel";
  cancelButton.type = "button";
  cancelButton.textContent = "Indietro";
  cancelButton.addEventListener("click", cancelOtpLogin);

  otpInput.addEventListener("input", () => {
    const err = document.getElementById("err");
    if (err) err.textContent = "";
  });

  actions.appendChild(verifyButton);
  actions.appendChild(resendButton);
  actions.appendChild(cancelButton);
  otpForm.appendChild(otpInput);
  otpForm.appendChild(actions);
  loginForm.insertAdjacentElement("afterend", otpForm);
}

function showOtpUI(data = {}) {
  return;
  ensureOtpUI();
  const loginForm = document.querySelector("#login .login-form");
  const otpForm = document.getElementById("otpForm");
  const otpInput = document.getElementById("otpCode");
  const retryAfterSeconds = getOtpRetryAfterSeconds(data);

  loginForm?.classList.add("hidden");
  otpForm?.classList.remove("hidden");
  setOtpLoading(false);
  startOtpResendCooldown(retryAfterSeconds);
  if (otpInput) {
    otpInput.value = "";
    otpInput.focus();
  }
}

function hideOtpUI() {
  const loginForm = document.querySelector("#login .login-form");
  const otpForm = document.getElementById("otpForm");
  const otpInput = document.getElementById("otpCode");

  loginForm?.classList.remove("hidden");
  otpForm?.classList.add("hidden");
  if (otpInput) otpInput.value = "";
  stopOtpResendCooldown();
  setOtpLoading(false);
}

function setOtpLoading(isLoading) {
  const otpInput = document.getElementById("otpCode");
  const verifyButton = document.getElementById("otpVerifyButton");
  const cancelButton = document.getElementById("otpCancelButton");
  const resendButton = document.getElementById("otpResendButton");

  if (otpInput) otpInput.disabled = isLoading;
  if (cancelButton) cancelButton.disabled = isLoading;
  if (verifyButton) {
    verifyButton.disabled = isLoading;
    verifyButton.classList.toggle("is-loading", isLoading);
    verifyButton.textContent = isLoading ? "Verifica..." : (verifyButton.dataset.defaultText || "Verifica");
  }
  if (resendButton && isLoading) {
    resendButton.disabled = true;
  } else {
    updateOtpResendButton();
  }
}

function getOtpRetryAfterSeconds(data = {}) {
  const seconds = Number(data.retryAfterSeconds);
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  return OTP_COOLDOWN_SECONDS;
}

function getOtpRequiredMessage(data = {}) {
  if (data.otpAlreadySent) {
    return "Codice OTP già inviato. Attendi prima di richiederne un altro.";
  }

  if (data.otpSent) {
    return "Codice OTP inviato. Inserisci il codice ricevuto.";
  }

  return "Codice OTP inviato. Inserisci il codice ricevuto.";
}

function stopOtpResendCooldown() {
  if (otpResendTimer) {
    clearInterval(otpResendTimer);
    otpResendTimer = null;
  }
  otpRetryAtMs = 0;
  otpResendLoading = false;
  updateOtpResendButton();
}

function startOtpResendCooldown(seconds = OTP_COOLDOWN_SECONDS) {
  if (otpResendTimer) clearInterval(otpResendTimer);

  const safeSeconds = Math.max(0, Math.ceil(Number(seconds) || OTP_COOLDOWN_SECONDS));
  otpRetryAtMs = Date.now() + safeSeconds * 1000;
  updateOtpResendButton();

  otpResendTimer = setInterval(() => {
    updateOtpResendButton();
    if (otpRetryAtMs <= Date.now()) {
      clearInterval(otpResendTimer);
      otpResendTimer = null;
    }
  }, 1000);
}

function updateOtpResendButton() {
  const resendButton = document.getElementById("otpResendButton");
  if (!resendButton) return;

  if (otpResendLoading) {
    resendButton.disabled = true;
    resendButton.textContent = "Invio...";
    return;
  }

  const remainingSeconds = Math.max(0, Math.ceil((otpRetryAtMs - Date.now()) / 1000));
  resendButton.disabled = remainingSeconds > 0;
  resendButton.textContent = remainingSeconds > 0
    ? `Reinvia codice tra ${remainingSeconds}s`
    : "Reinvia codice";
}

function setOtpResendLoading(isLoading) {
  otpResendLoading = isLoading;
  const verifyButton = document.getElementById("otpVerifyButton");
  const cancelButton = document.getElementById("otpCancelButton");

  if (verifyButton) verifyButton.disabled = isLoading;
  if (cancelButton) cancelButton.disabled = isLoading;
  updateOtpResendButton();
}

function cancelOtpLogin() {
  pendingOtpLogin = null;
  hideOtpUI();

  const err = document.getElementById("err");
  if (err) err.textContent = "";

  const phoneInput = document.getElementById("user");
  phoneInput?.focus();
  updateLoginButtonState();
}

async function resendOtp() {
  return;
  const err = document.getElementById("err");

  if (!pendingOtpLogin) {
    hideOtpUI();
    if (err) err.textContent = "Verifica non riuscita. Riprova tra poco.";
    return;
  }

  if (otpRetryAtMs > Date.now()) {
    updateOtpResendButton();
    return;
  }

  setOtpResendLoading(true);
  if (err) err.textContent = "Invio codice OTP in corso...";

  try {
    const data = await requestAuthAction({
      action: "resendOtp",
      phone: pendingOtpLogin.phone,
      deviceId: pendingOtpLogin.deviceId,
      otpToken: pendingOtpLogin.otpToken
    });

    if (data?.success) {
      completeLogin(pendingOtpLogin.phone, pendingOtpLogin.deviceId, data);
      return;
    }

    const error = data?.error || data?.status;
    if (error === "otp_required") {
      if (data?.otpToken) pendingOtpLogin.otpToken = data.otpToken;
      startOtpResendCooldown(getOtpRetryAfterSeconds(data));
      if (err) err.textContent = getOtpRequiredMessage(data);
      return;
    }

    if (error === "otp_send_failed") {
      logOtpSendFailure(data, "resendOtp");
    }

    if (err) err.textContent = getOtpErrorMessage(error);
  } catch (error) {
    console.error("OTP resend error", error);
    if (err) err.textContent = "Non siamo riusciti a inviare il codice OTP. Riprova più tardi.";
  } finally {
    setOtpResendLoading(false);
  }
}

async function verifyOtp() {
  return;
  const otpInput = document.getElementById("otpCode");
  const err = document.getElementById("err");
  const code = String(otpInput?.value || "").trim();

  if (!pendingOtpLogin) {
    hideOtpUI();
    if (err) err.textContent = "Verifica non riuscita. Riprova tra poco.";
    return;
  }

  if (!code) {
    if (err) err.textContent = "Inserisci il codice OTP.";
    otpInput?.focus();
    return;
  }

  setOtpLoading(true);
  if (err) err.textContent = "Verifica codice in corso...";

  try {
    const data = await requestAuthAction({
      action: "verifyOtp",
      phone: pendingOtpLogin.phone,
      deviceId: pendingOtpLogin.deviceId,
      otpToken: pendingOtpLogin.otpToken,
      code
    });

    if (!data?.success) {
      if (err) err.textContent = getOtpErrorMessage(data?.error || data?.status);
      return;
    }

    completeLogin(pendingOtpLogin.phone, pendingOtpLogin.deviceId, data);
  } catch (error) {
    console.error("OTP verification error", error);
    if (err) err.textContent = "Verifica non riuscita. Riprova tra poco.";
  } finally {
    setOtpLoading(false);
  }
}

function isValidPhoneNumber(input) {
  const phone = normalizePhone(input);
  return phone.length >= 10 && phone.length <= 15;
}

function getLoginErrorMessage(error) {
  if (error === "otp_required") return "Inserisci il codice OTP inviato al tuo telefono.";
  if (error === "device_reset_required") return "Questo numero è già associato a un altro dispositivo. Contatta l’amministratore per autorizzare questo dispositivo.";
  if (error === "admin_password_required") return "Inserisci la password amministratore.";
  if (error === "admin_password_invalid") return "Password amministratore non corretta.";
  if (error === "missing_admin_password_config") return "Password amministratore non configurata.";
  if (error === "too_many_attempts") return "Troppi tentativi. Attendi qualche minuto prima di riprovare.";
  if (error === "promo_invalid") return "Promo code non valido.";
  if (error === "promo_expired") return "Questo promo code è scaduto. Richiedi il nuovo codice.";
  if (error === "promo_unavailable") return "La promozione non è disponibile in questo momento.";
  if (["promo_already_used", "promo_code_reused", "promo_limit_reached"].includes(error)) return "Hai già utilizzato la tua promozione gratuita.";
  if (error === "promo_campaign_full") return "Gli 800 posti gratuiti di questa promozione sono terminati.";
  if (error === "promo_backend_not_ready") return "La promozione è in configurazione. Riprova più tardi.";
  if (error === "promo_host_forbidden") return "Promozione disponibile soltanto sul sito ufficiale.";
  if (error === "request_expired" || error === "request_replayed") return "Richiesta promozionale scaduta. Riprova.";
  if (error === "promo_users_sheet_missing" || error === "promo_user_columns_missing") return "Promozione temporaneamente non disponibile.";
  if (["service_unavailable", "auth_backend_error", "bad_action", "unauthorized", "invalid_request"].includes(error)) return "Servizio promozionale momentaneamente non disponibile. Riprova tra poco.";
  if (error === "expired") return "Accesso scaduto. Contatta il supporto per rinnovare.";
  if (error === "not_found") return "Numero non autorizzato.";
  if (error === "device_replaced") return "Questo dispositivo non è più autorizzato perché l’accesso è stato spostato su un altro dispositivo.";
  if (error === "device_mismatch") return "Questo dispositivo non è più autorizzato.";
  if (error === "otp_send_failed") return "Non siamo riusciti a inviare il codice OTP. Riprova più tardi.";
  if (error === "missing_twilio_config") return "Servizio OTP non configurato correttamente.";
  if (error === "temporary_error" || error === "server_error" || error === "busy") return "Servizio momentaneamente non disponibile.";
  return "Numero non valido o accesso non autorizzato.";
}

function getOtpErrorMessage(error) {
  if (error === "invalid_otp") return "Codice OTP non valido. Riprova.";
  if (error === "expired") return "Accesso scaduto. Contatta il supporto per rinnovare.";
  if (error === "not_found") return "Numero non autorizzato.";
  if (error === "otp_send_failed") return "Non siamo riusciti a inviare il codice OTP. Riprova più tardi.";
  if (error === "missing_twilio_config") return "Servizio OTP non configurato correttamente.";
  return "Verifica non riuscita. Riprova tra poco.";
}

function logOtpSendFailure(data, context) {
  console.warn("OTP send failed", {
    context,
    twilioStatus: data?.twilioStatus || null,
    twilioErrorCode: data?.twilioErrorCode || null,
    twilioMessage: data?.twilioMessage || null
  });
}

function updateLoginButtonState() {
  const phoneInput = document.getElementById("user");
  const adminPasswordInput = document.getElementById("adminPassword");
  const loginButton = document.querySelector("#login .login-submit");
  if (!loginButton) return;

  const isLoading = loginButton.classList.contains("is-loading");
  const missingAdminPassword = adminPasswordRequired && !String(adminPasswordInput?.value || "").trim();
  loginButton.disabled = isLoading || !isValidPhoneNumber(phoneInput?.value) || missingAdminPassword;
  loginButton.setAttribute("aria-disabled", loginButton.disabled ? "true" : "false");
}

function setupLoginUI() {
  ensureAdminPasswordUI();

  const phoneInput = document.getElementById("user");
  const promoCodeInput = document.getElementById("promoCode");
  const loginButton = document.querySelector("#login .login-submit");
  const err = document.getElementById("err");

  if (loginButton && !loginButton.dataset.defaultText) {
    loginButton.dataset.defaultText = loginButton.querySelector(".login-submit-label")?.textContent || "Continua";
  }

  phoneInput?.addEventListener("input", () => {
    hideAdminPasswordUI();
    if (err) err.textContent = "";
    setLoginFieldInvalid(phoneInput, false);
    updateLoginButtonState();
  });

  promoCodeInput?.addEventListener("input", () => {
    promoCodeInput.value = promoCodeInput.value.toUpperCase().replace(/\s+/g, "");
    if (err) err.textContent = "";
    setLoginFieldInvalid(promoCodeInput, false);
  });

  updateLoginButtonState();
}

/***********************
 * LOGOUT
 ***********************/
function logout(showLogin = true, reason = "revoked") {
  if (accessValidationTimer) {
    clearInterval(accessValidationTimer);
    accessValidationTimer = null;
  }
  resetWhatsNewPopupForNextLogin();
  clearSessionData();
  setChapterMode(false);
  currentScreen = "login";

  if (showLogin) {
    let msg = "";
    if (reason === "expired") msg = "Accesso scaduto. Contatta il supporto per rinnovare.";
    else if (reason === "not_found") msg = "Numero non autorizzato";
    else if (reason === "device_replaced") msg = "Questo dispositivo non è più autorizzato perché l’accesso è stato spostato su un altro dispositivo.";
    else if (reason === "device_mismatch") msg = "Questo dispositivo non è più autorizzato.";
    else if (reason === "revoked") msg = "Accesso revocato dall'amministratore";
    showLoginScreen(msg);
    if (reason === "expired") {
      setTimeout(showExpiredRenewPopup, 120);
    }
  }
}

function clearSessionData() {
  [
    KEYS.loggedIn,
    KEYS.phone,
    KEYS.expiry,
    KEYS.accessToken,
    KEYS.accessTokenExpiresAt,
    KEYS.session,
    KEYS.legacySession,
    KEYS.renewPopupLastShown,
    KEYS.renewPopupDailyState,
  ].forEach(key => Storage.remove(key));

  try {
    localStorage.removeItem("user_session");
    localStorage.removeItem("session");
    localStorage.removeItem("loggedIn");
    localStorage.removeItem("phone");
    localStorage.removeItem("expiry");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("accessTokenExpiresAt");
    localStorage.removeItem("renewPopupLastShown");
    localStorage.removeItem("renewPopupDailyState");
  } catch (err) {
    console.warn("Pulizia localStorage non disponibile");
  }

  Storage.remove(KEYS.session);
  Storage.remove(KEYS.legacySession);
}

function showLandingScreen(options = {}) {
  hideAll();
  document.getElementById("landing")?.classList.remove("hidden");
  const promoLandingError = document.getElementById("promoLandingError");
  if (promoLandingError) promoLandingError.textContent = "";
  hidePromoAccessNextStep();
  setLoginFieldInvalid(document.getElementById("promoLandingPhone"), false);
  setLoginFieldInvalid(document.getElementById("promoLandingCode"), false);
  setChapterMode(false);
  document.body.classList.add("public-mode");
  updateProfileUI(false);
  setProfileIconVisible(false);
  setLoggedOutChrome();
  currentScreen = "welcome";
  setAppRoute({ screen: "welcome" }, { replace: options.replace === true });
}

let promoCampaignTimer = null;
let promoCampaignDeadline = 0;
let promoCampaignActive = null;

function updatePromoLandingButtonState() {
  const phoneInput = document.getElementById("promoLandingPhone");
  const codeInput = document.getElementById("promoLandingCode");
  const button = document.querySelector(".promo-access-submit");
  if (!button) return;

  const isLoading = button.classList.contains("is-loading");
  const validPhone = isValidPhoneNumber(phoneInput?.value);
  const validCode = String(codeInput?.value || "").trim().length >= 6;
  button.disabled = isLoading || promoCampaignActive === false || !validPhone || !validCode;
  button.setAttribute("aria-disabled", button.disabled ? "true" : "false");
}

function hidePromoAccessNextStep() {
  const panel = document.getElementById("promoAccessNextStep");
  if (!panel) return;
  panel.classList.add("hidden");
  panel.setAttribute("aria-hidden", "true");
}

function showPromoAccessNextStep(errorCode) {
  const panel = document.getElementById("promoAccessNextStep");
  const kicker = document.getElementById("promoAccessNextKicker");
  const title = document.getElementById("promoAccessNextTitle");
  const message = document.getElementById("promoAccessNextMessage");
  const button = panel?.querySelector(".promo-access-packages-button");
  if (!panel || !kicker || !title || !message) return;

  const campaignFull = errorCode === "promo_campaign_full";
  kicker.textContent = campaignFull ? "POSTI PROMO TERMINATI" : "PROMO GIÀ UTILIZZATA";
  title.textContent = campaignFull
    ? "Gli 800 posti gratuiti di questa promozione sono terminati."
    : "Spero che ti sia piaciuta la nostra ultima promo.";
  message.textContent = campaignFull
    ? "Puoi continuare subito scegliendo il pacchetto MagicBook più adatto a te."
    : "La promozione può essere utilizzata una sola volta. Scegli un pacchetto per continuare con MagicBook.";
  panel.classList.remove("hidden");
  panel.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => button?.focus());
}

function openPromoPackages() {
  hidePromoAccessNextStep();
  showJoinScreen();
  requestAnimationFrame(() => {
    const heading = document.getElementById("joinPackagesTitle");
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  });
}

function setupPromoLandingUI() {
  const phoneInput = document.getElementById("promoLandingPhone");
  const codeInput = document.getElementById("promoLandingCode");
  const button = document.querySelector(".promo-access-submit");
  const error = document.getElementById("promoLandingError");

  if (button && !button.dataset.defaultText) {
    button.dataset.defaultText = button.querySelector("span")?.textContent || "Entra con Promo Code";
  }

  phoneInput?.addEventListener("input", () => {
    if (error) error.textContent = "";
    hidePromoAccessNextStep();
    setLoginFieldInvalid(phoneInput, false);
    updatePromoLandingButtonState();
  });

  codeInput?.addEventListener("input", () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/\s+/g, "");
    if (error) error.textContent = "";
    hidePromoAccessNextStep();
    setLoginFieldInvalid(codeInput, false);
    updatePromoLandingButtonState();
  });

  updatePromoLandingButtonState();
}

function loginFromPromoCard() {
  return login({ source: "promo-card" });
}

function setPromoCampaignState(active, label) {
  promoCampaignActive = active;
  document.body.classList.toggle("promo-campaign-active", active === true);
  document.body.classList.toggle("promo-campaign-ended", active === false);
  document.querySelectorAll("[data-promo-state]").forEach(element => {
    element.textContent = label;
  });
  updatePromoLandingButtonState();
}

function renderPromoCampaignCountdown() {
  if (!promoCampaignDeadline) return;
  const remaining = Math.max(0, promoCampaignDeadline - Date.now());
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const values = { days, hours, minutes, seconds };

  Object.entries(values).forEach(([unit, value]) => {
    document.querySelectorAll(`[data-promo-${unit}]`).forEach(element => {
      element.textContent = String(value).padStart(2, "0");
    });
  });

  const label = `${days} giorni, ${hours} ore, ${minutes} minuti e ${seconds} secondi`;
  document.querySelectorAll("[data-promo-countdown]").forEach(element => {
    element.setAttribute("aria-label", `Il Promo Code cambia tra ${label}`);
  });
  const progress = Math.max(0, Math.min(100, remaining / PROMO_CAMPAIGN_DURATION_MS * 100));
  document.querySelectorAll("[data-promo-progress]").forEach(element => {
    element.style.setProperty("--promo-progress", `${progress.toFixed(4)}%`);
  });

  if (remaining <= 0) {
    if (promoCampaignTimer) clearInterval(promoCampaignTimer);
    promoCampaignTimer = null;
    setPromoCampaignState(false, "Codice scaduto");
  }
}

async function setupPromoCampaign() {
  if (promoCampaignTimer) clearInterval(promoCampaignTimer);
  promoCampaignTimer = null;
  promoCampaignDeadline = 0;
  setPromoCampaignState(null, "Sincronizzazione…");

  try {
    const response = await fetch(PROMO_STATUS_API, {
      method: "GET",
      headers: { "Accept": "application/json" },
      cache: "no-store"
    });
    const data = await response.json().catch(() => null);
    const expiresAt = Date.parse(String(data?.expiresAt || ""));
    if (!response.ok || !data?.active || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      setPromoCampaignState(false, response.status === 403 ? "Dominio non autorizzato" : "Nuovo codice in arrivo");
      return;
    }

    promoCampaignDeadline = expiresAt;
    setPromoCampaignState(true, "Codice disponibile");
    renderPromoCampaignCountdown();
    promoCampaignTimer = setInterval(renderPromoCampaignCountdown, 1000);
  } catch {
    // The authentication endpoint remains authoritative if the public status
    // check is temporarily unreachable.
    setPromoCampaignState(null, "Verifica online");
  }
}

const TRIAL_COUNTDOWN_KEY = "trial_offer_ends_at_v4";
let trialCountdownTimer = null;
let trialPromoCopyTimer = null;
let trialPromoCopySwapTimer = null;

const TRIAL_PROMO_COPY = Object.freeze([
  Object.freeze({
    lang: "bn",
    label: "৭ দিন বিনামূল্যে ম্যাজিক বই",
    kicker: "৭ দিন বিনামূল্যে",
    title: "ম্যাজিক বই"
  }),
  Object.freeze({
    lang: "it",
    label: "Prova MagicBook gratis",
    kicker: "7 GIORNI GRATIS",
    title: "MagicBook"
  })
]);

function setupTrialPromoCopy() {
  const copyRoot = document.getElementById("trialPromoCopy");
  const trialCard = copyRoot?.closest(".trial-card");
  if (!copyRoot || !trialCard) return;

  if (trialPromoCopyTimer) clearInterval(trialPromoCopyTimer);
  if (trialPromoCopySwapTimer) clearTimeout(trialPromoCopySwapTimer);
  copyRoot.classList.remove("is-copy-leaving", "is-copy-entering");
  trialPromoCopyTimer = null;
  trialPromoCopySwapTimer = null;
  let activeCopy = 0;

  const applyCopy = copy => {
    copyRoot.querySelector('[data-trial-copy="kicker"]')?.replaceChildren(copy.kicker);
    copyRoot.querySelector('[data-trial-copy="title"]')?.replaceChildren(copy.title);
    copyRoot.lang = copy.lang;
    copyRoot.classList.toggle("is-bangla", copy.lang === "bn");
    trialCard.setAttribute("aria-label", copy.label);
  };

  applyCopy(TRIAL_PROMO_COPY[activeCopy]);
  trialPromoCopyTimer = setInterval(() => {
    activeCopy = (activeCopy + 1) % TRIAL_PROMO_COPY.length;
    const nextCopy = TRIAL_PROMO_COPY[activeCopy];
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      applyCopy(nextCopy);
      return;
    }
    copyRoot.classList.add("is-copy-leaving");
    trialPromoCopySwapTimer = setTimeout(() => {
      applyCopy(nextCopy);
      copyRoot.classList.remove("is-copy-leaving");
      copyRoot.classList.add("is-copy-entering");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => copyRoot.classList.remove("is-copy-entering"));
      });
      trialPromoCopySwapTimer = null;
    }, 520);
  }, 10000);
}

function setupTrialMarketing(serverExpiresAt = 0) {
  setupTrialPromoCopy();
  const signedDeadline = Number(serverExpiresAt || getTrialGuestCredentials().expiresAt || 0);
  let endsAt = signedDeadline > 0 ? signedDeadline : Number(Storage.get(TRIAL_COUNTDOWN_KEY) || 0);
  if (!endsAt) {
    endsAt = Date.now() + FREE_TRIAL_DURATION_MS;
  }
  Storage.set(TRIAL_COUNTDOWN_KEY, String(endsAt));
  const render = () => {
    const remaining = Math.max(0, endsAt - Date.now());
    const active = remaining > 0;
    document.body.classList.toggle("trial-campaign-active", active);
    document.body.classList.toggle("trial-campaign-ended", !active);
    const animatedFrame = document.getElementById("aura-spline");
    if (animatedFrame) {
      if (active) {
        if (!animatedFrame.dataset.standbySrc) animatedFrame.dataset.standbySrc = animatedFrame.getAttribute("src") || "";
        animatedFrame.removeAttribute("src");
      } else if (!animatedFrame.getAttribute("src") && animatedFrame.dataset.standbySrc) {
        animatedFrame.setAttribute("src", animatedFrame.dataset.standbySrc);
      }
    }
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor(remaining % 3600000 / 60000);
    const seconds = Math.floor(remaining % 60000 / 1000);
    const clock = [hours, minutes, seconds].map(value => String(value).padStart(2, "0")).join(":");
    const progress = Math.max(0, Math.min(100, remaining / FREE_TRIAL_DURATION_MS * 100));
    document.querySelectorAll("[data-trial-progress]").forEach(el => {
      el.style.setProperty("--trial-progress", `${progress.toFixed(4)}%`);
    });
    document.querySelectorAll("[data-trial-hours]").forEach(el => { el.textContent = String(hours).padStart(2, "0"); });
    document.querySelectorAll("[data-trial-minutes]").forEach(el => { el.textContent = String(minutes).padStart(2, "0"); });
    document.querySelectorAll("[data-trial-seconds]").forEach(el => { el.textContent = String(seconds).padStart(2, "0"); });
    document.querySelectorAll("[data-trial-digital]").forEach(el => {
      el.setAttribute("aria-label", `${hours} ore, ${minutes} minuti e ${seconds} secondi`);
    });
    document.querySelectorAll("[data-trial-countdown]").forEach(el => {
      el.textContent = clock;
      el.setAttribute("aria-label", `${hours} ore, ${minutes} minuti e ${seconds} secondi`);
    });
    if (!active && trialCountdownTimer) {
      clearInterval(trialCountdownTimer);
      trialCountdownTimer = null;
    }
  };
  render();
  if (trialCountdownTimer) clearInterval(trialCountdownTimer);
  trialCountdownTimer = setInterval(render, 1000);
  const params = new URLSearchParams(location.search);
  if (params.get("trialOffer") === "1") {
    const requestedFeature = String(params.get("feature") || "").trim().slice(0, 80);
    history.replaceState({}, "", "/");
    setTimeout(() => openTrialPaywall(requestedFeature || "Questa funzione"), 450);
  }
}

let trialGuestMode = false;
const TRIAL_ONBOARDING_KEY = "magicbook_trial_onboarding_seen_v2";
const TRIAL_ONBOARDING_SKIP_KEY = "magicbook_trial_onboarding_skipped_v2";
let trialOnboardingStep = 0;

function trialOnboardingStorageHas(key) {
  try { return localStorage.getItem(key) === "1" || sessionStorage.getItem(key) === "1"; } catch { return false; }
}
function trialOnboardingStorageSet(key, persistent = false) {
  try { (persistent ? localStorage : sessionStorage).setItem(key, "1"); } catch { /* private browsing */ }
}
function getTrialMixAttempts() {
  try { return Number(sessionStorage.getItem("magicbook_trial_mix_attempts") || 0); } catch { return 0; }
}
function setTrialMixAttempts(value) {
  try { sessionStorage.setItem("magicbook_trial_mix_attempts", String(value)); } catch { /* private browsing */ }
}
function scheduleTrialOnboarding() {
  if (!trialGuestMode || trialOnboardingStorageHas(TRIAL_ONBOARDING_KEY) || trialOnboardingStorageHas(TRIAL_ONBOARDING_SKIP_KEY)) return;
  window.setTimeout(() => startTrialOnboarding(), 650);
}
function trialOnboardingTarget(selector) {
  document.querySelectorAll(".trial-onboarding-target").forEach(el => el.classList.remove("trial-onboarding-target"));
  const target = document.querySelector(selector);
  const spotlight = document.getElementById("trialOnboardingSpotlight");
  if (target) {
    target.classList.add("trial-onboarding-target");
    const rect = target.getBoundingClientRect();
    if (spotlight) {
      const pad = target.matches(".qms-pill") ? 5 : 9;
      spotlight.style.left = `${Math.max(8, rect.left - pad)}px`;
      spotlight.style.top = `${Math.max(8, rect.top - pad)}px`;
      spotlight.style.width = `${Math.min(window.innerWidth - 16, rect.width + pad * 2)}px`;
      spotlight.style.height = `${Math.min(window.innerHeight - 16, rect.height + pad * 2)}px`;
      spotlight.classList.add("is-visible");
    }
    requestAnimationFrame(positionTrialOnboardingCard);
  } else if (spotlight) {
    spotlight.classList.remove("is-visible");
  }
  return target;
}
function positionTrialOnboardingCard() {
  const guide = document.getElementById("trialOnboarding");
  const card = guide?.querySelector(".trial-onboarding-card");
  const target = guide?.querySelector(".trial-onboarding-target");
  if (!guide || !card || !target) return;
  const targetRect = target.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const gap = 18;
  const canPlaceBelow = targetRect.bottom + gap + cardRect.height <= window.innerHeight - 14;
  const top = canPlaceBelow
    ? targetRect.bottom + gap
    : Math.max(14, targetRect.top - cardRect.height - gap);
  const left = Math.max(14, Math.min(window.innerWidth - cardRect.width - 14, targetRect.left + targetRect.width / 2 - cardRect.width / 2));
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.style.bottom = "auto";
  card.classList.toggle("is-above-target", !canPlaceBelow);
}
function renderTrialOnboardingStep() {
  const step = document.getElementById("trialOnboardingStep");
  const title = document.getElementById("trialOnboardingTitle");
  const text = document.getElementById("trialOnboardingText");
  const guide = document.getElementById("trialOnboarding");
  const content = [
    ["Inizia dai capitoli gratuiti", "Il capitolo 1 è aperto: libro e quiz sono disponibili, insieme a una selezione di audio demo.", ".chapter-card[data-chapter='1']"],
    ["Anche il capitolo 3 è gratuito", "Puoi studiare e fare il quiz anche dal capitolo 3, con alcuni audio aperti e altri Premium.", ".chapter-card[data-chapter='3']"],
    ["Scegli la modalità Quiz", "Apri Quiz per vedere subito quali capitoli puoi usare: 01 e 03 sono verdi, gli altri sono grigi e bloccati.", "#quizButton"],
    ["Hai 2 prove Mix Quiz 786", `Il Mix Quiz 786 include ${Math.max(0, 2 - getTrialMixAttempts())} prove dimostrative. Il limite è indicato prima di iniziare.`, "#qmsCardMix"]
  ][trialOnboardingStep];
  if (!content || !guide) return;
  if (step) step.textContent = String(trialOnboardingStep + 1);
  if (title) title.textContent = content[0];
  if (text) text.textContent = content[1];
  trialOnboardingTarget(content[2]);
}
function startTrialOnboarding() {
  const guide = document.getElementById("trialOnboarding");
  if (!guide || !trialGuestMode) return;
  trialOnboardingStep = 0;
  guide.classList.remove("hidden");
  renderTrialOnboardingStep();
}
function nextTrialOnboarding() {
  if (trialOnboardingStep === 2) openQuizModeScreen();
  if (trialOnboardingStep < 3) {
    trialOnboardingStep += 1;
    window.setTimeout(renderTrialOnboardingStep, trialOnboardingStep === 3 ? 180 : 0);
    return;
  }
  closeTrialOnboarding();
}
function closeTrialOnboarding() {
  neverShowTrialOnboarding();
  document.getElementById("trialOnboarding")?.classList.add("hidden");
  document.getElementById("trialOnboardingSpotlight")?.classList.remove("is-visible");
  document.querySelectorAll(".trial-onboarding-target").forEach(el => el.classList.remove("trial-onboarding-target"));
}
function skipTrialOnboarding() {
  trialOnboardingStorageSet(TRIAL_ONBOARDING_SKIP_KEY);
  closeTrialOnboarding();
}
function neverShowTrialOnboarding() {
  const never = document.getElementById("trialOnboardingNever");
  if (never?.checked) trialOnboardingStorageSet(TRIAL_ONBOARDING_KEY, true);
}

function getTrialGuestCredentials() {
  try {
    const read = key => localStorage.getItem(key) || sessionStorage.getItem(key) || "";
    const policyVersion = read("magicbook_trial_guest_policy");
    const policyMatches = policyVersion === FREE_TRIAL_POLICY_VERSION;
    const credentials = {
      trialId: read("magicbook_trial_id"),
      guestKey: policyMatches ? read("magicbook_trial_guest_key") : "",
      expiresAt: policyMatches ? Number(read("magicbook_trial_guest_expires") || 0) : 0,
      policyVersion
    };
    if (credentials.guestKey) {
      sessionStorage.setItem("magicbook_trial_id", credentials.trialId);
      sessionStorage.setItem("magicbook_trial_guest_key", credentials.guestKey);
      sessionStorage.setItem("magicbook_trial_guest_expires", String(credentials.expiresAt));
      sessionStorage.setItem("magicbook_trial_guest_policy", credentials.policyVersion);
    }
    return credentials;
  } catch { return { trialId: "", guestKey: "", expiresAt: 0, policyVersion: "" }; }
}

function saveTrialGuestCredentials(credentials) {
  const values = {
    magicbook_trial_id: credentials.trialId,
    magicbook_trial_guest_key: credentials.guestKey,
    magicbook_trial_guest_expires: String(credentials.expiresAt),
    magicbook_trial_guest_policy: FREE_TRIAL_POLICY_VERSION
  };
  Object.entries(values).forEach(([key, value]) => {
    localStorage.setItem(key, value);
    sessionStorage.setItem(key, value);
  });
}

async function startGuestTrial(options = {}) {
  const campaignEndsAt = Number(Storage.get(TRIAL_COUNTDOWN_KEY) || 0);
  if (campaignEndsAt > 0 && campaignEndsAt <= Date.now()) {
    openTrialPaywall("La prova gratuita di 7 giorni");
    return false;
  }
  let credentials = getTrialGuestCredentials();
  let trialId = credentials.trialId;
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(trialId)) trialId = `trial_${createDeviceId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (!credentials.guestKey || credentials.expiresAt <= Date.now() + 60000 || credentials.trialId !== trialId) {
    const response = await fetch("/api/trialAccess", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trialId }) });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.guestKey) {
      await showMessage("Prova gratuita", "Impossibile avviare la prova. Riprova tra poco.");
      return;
    }
    credentials = { trialId, guestKey: data.guestKey, expiresAt: Number(data.expiresAt), policyVersion: FREE_TRIAL_POLICY_VERSION };
    saveTrialGuestCredentials(credentials);
  }
  setupTrialMarketing(Math.min(credentials.expiresAt, campaignEndsAt || credentials.expiresAt));
  trialGuestMode = true;
  selectedChapter = isFreeTrialChapter(selectedChapter) ? selectedChapter : FREE_TRIAL_CHAPTERS[0];
  showChapters();
  decorateGuestTrialUI();
  if (!isFreeTrialChapter(options.openChapter)) scheduleTrialOnboarding();
  setAppRoute({ screen: "trialHub" }, { replace: options.replace === true });
  if (isFreeTrialChapter(options.openChapter)) openTrialBook(Number(options.openChapter));
  return true;
}
function openTrialChapterPicker() { startGuestTrial(); }
function closeTrialChapterPicker() { document.getElementById("trialChapterModal")?.classList.add("hidden"); }
function startFreeTrial(chapter) {
  if (!isFreeTrialChapter(chapter)) return;
  window.location.href = `/quiz/prova-gratis?chapter=${Number(chapter)}`;
}
function startTrialBook(chapter) {
  if (!isFreeTrialChapter(chapter)) return;
  closeTrialChapterPicker();
  openTrialBook(Number(chapter));
}
async function openLockedTrialFeature(feature) {
  closeTrialChapterPicker();
  openTrialPaywall(feature);
}
function buildTrialHubChapters() {
  const container = document.getElementById("trialHubChapters");
  if (!container || container.childElementCount) return;
  for (let chapter = 1; chapter <= 25; chapter++) {
    const unlocked = isFreeTrialChapter(chapter);
    const card = document.createElement("article");
    card.className = `trial-hub-chapter${unlocked ? " is-open" : " is-locked"}`;
    card.innerHTML = `<span>${unlocked ? "APERTO" : "🔒"}</span><small>CAPITOLO</small><strong>${chapter}</strong><p>${unlocked ? "Libro e quiz disponibili" : "Contenuto Premium"}</p>`;
    card.addEventListener("click", () => unlocked ? startTrialBook(chapter) : openTrialPaywall(`Capitolo ${chapter}`));
    if (unlocked) {
      const quizButton = document.createElement("button");
      quizButton.type = "button";
      quizButton.textContent = "Quiz →";
      quizButton.addEventListener("click", event => { event.stopPropagation(); startFreeTrial(chapter); });
      card.appendChild(quizButton);
    }
    container.appendChild(card);
  }
}
function showTrialHub(options = {}) {
  hideAll();
  isTrialBookViewer = false;
  document.getElementById("trialHub")?.classList.remove("hidden");
  document.body.classList.add("public-mode", "trial-hub-mode");
  buildTrialHubChapters();
  currentScreen = "trialHub";
  setProfileIconVisible(false);
  setAppRoute({ screen: "trialHub" }, { replace: options.replace === true });
}
function openTrialPaywall(feature = "Questa funzione") {
  const title = document.getElementById("trialOfferTitle");
  const message = document.getElementById("trialOfferMessage");
  if (title) title.textContent = `${feature} è bloccato`;
  if (message) message.textContent = "Hai già visto il metodo in azione. Sblocca capitoli, audio, quiz e simulazioni per costruire una preparazione completa e arrivare all’esame più sicuro.";
  document.getElementById("trialOfferModal")?.classList.remove("hidden");
}
let trialPreviewTimer = null;
function startTrialPreview(feature) {
  clearInterval(trialPreviewTimer);
  const overlay = document.getElementById("trialPreview");
  const title = document.getElementById("trialPreviewTitle");
  const countdown = document.getElementById("trialPreviewCountdown");
  if (!overlay || !title || !countdown) return;
  title.textContent = feature;
  overlay.classList.remove("hidden");
  let seconds = 5;
  countdown.textContent = String(seconds);
  trialPreviewTimer = setInterval(() => {
    seconds -= 1;
    countdown.textContent = String(Math.max(0, seconds));
    if (seconds <= 0) {
      clearInterval(trialPreviewTimer);
      overlay.classList.add("hidden");
      openTrialPaywall(feature);
    }
  }, 1000);
}
function closeTrialOffer() {
  document.getElementById("trialOfferModal")?.classList.add("hidden");
  const title = document.getElementById("trialOfferTitle");
  const message = document.getElementById("trialOfferMessage");
  if (title) title.textContent = "Sblocca tutto MagicBook";
  if (message) message.textContent = "Continua con tutti i capitoli, gli audio, i quiz e le simulazioni per prepararti con un percorso completo.";
}
function openTrialJoinOffer() {
  closeTrialOffer();
  trialGuestMode = false;
  document.body.classList.remove("guest-trial-mode");
  showJoinScreen();
  window.scrollTo({ top: 0, behavior: "smooth" });
  document.getElementById("join")?.scrollTo?.({ top: 0, behavior: "smooth" });
}

function showJoinScreen(options = {}) {
  hideAll();
  document.getElementById("join")?.classList.remove("hidden");
  setChapterMode(false);
  document.body.classList.add("public-mode");
  updateProfileUI(false);
  setProfileIconVisible(false);
  setLoggedOutChrome();
  currentScreen = "join";
  setAppRoute({ screen: "join" }, { replace: options.replace === true });
}

function showAboutScreen(options = {}) {
  hideAll();
  document.getElementById("about")?.classList.remove("hidden");
  setChapterMode(false);
  document.body.classList.add("public-mode");
  updateProfileUI(false);
  setProfileIconVisible(false);
  setLoggedOutChrome();
  currentScreen = "about";
  setAppRoute({ screen: "about" }, { replace: options.replace === true });
  requestAnimationFrame(animateFollowerCounters);
}

function formatCompactCount(value) {
  if (value >= 1000000) return `${Math.floor(value / 1000000)}M`;
  if (value >= 1000) return `${Math.floor(value / 1000)}K`;
  return String(Math.floor(value));
}

function animateFollowerCounters() {
  document.querySelectorAll(".follower-count").forEach(counter => {
    const target = Number(counter.dataset.count || "0");
    if (!target) return;
    const duration = 1500;
    const startTime = performance.now();

    function tick(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      counter.textContent = formatCompactCount(target * eased);
      if (progress < 1) requestAnimationFrame(tick);
      else counter.textContent = formatCompactCount(target);
    }

    requestAnimationFrame(tick);
  });
}

function openJoinWhatsApp(price, duration) {
  const msgText = `Ciao, voglio attivare il pacchetto MagicBook ${price} (${duration}).`;
  const url = `https://wa.me/${RENEW_WHATSAPP_NUMBER}?text=${encodeURIComponent(msgText)}`;
  openExternalUrl(url);
}

function updateLoginTimeGreeting(now = new Date()) {
  const greeting = document.querySelector("[data-login-time-greeting]");
  if (!greeting) return;
  const hour = now.getHours();
  greeting.textContent = hour >= 5 && hour < 12
    ? "Good morning"
    : hour >= 12 && hour < 17
      ? "Good afternoon"
      : hour >= 17 && hour < 22
        ? "Good evening"
        : "Good night";
}

function showLoginScreen(message = "", options = {}) {
  hideAll();
  pendingOtpLogin = null;
  hideOtpUI();
  document.getElementById("login")?.classList.remove("hidden");
  updateLoginTimeGreeting();
  setChapterMode(false);
  const err = document.getElementById("err");
  if (err) err.textContent = message;
  setLoginFieldInvalid(document.getElementById("user"), false);
  setLoginFieldInvalid(document.getElementById("promoCode"), false);
  setLoginFieldInvalid(document.getElementById("adminPassword"), false);
  setLoginButtonBusy(document.querySelector("#login .login-submit"), false);
  updateProfileUI(false);
  setProfileIconVisible(false);
  setLoggedOutChrome();
  currentScreen = "login";
  document.title = "MagicBook | Accesso";
  setAppRoute({ screen: "login" }, { replace: options.replace === true });
  updateLoginButtonState();
}

function getCurrentSessionPhone() {
  const session = readStoredSession();
  return session?.phone || Storage.get(KEYS.phone) || "";
}

function getCurrentSessionDeviceId() {
  const session = readStoredSession();
  return Storage.get(KEYS.deviceId) || session?.deviceId || getDeviceId();
}

async function warmExplanationFiguresCache() {
  const phone = getCurrentSessionPhone();
  const deviceId = getCurrentSessionDeviceId();
  if (!phone || !deviceId) return;

  const query = new URLSearchParams({ action: "getExplanationFigures", phone, deviceId });
  try {
    const token = getCurrentAccessToken();
    const response = await fetch(`/api/quiz?${query.toString()}`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) return;
    const data = await response.json();
    const figures = Array.isArray(data?.figures)
      ? data.figures.filter(value => /^fig\d+$/.test(value))
      : [];
    Storage.set(EXPLANATION_FIGURES_CACHE_KEY, JSON.stringify({ figures, savedAt: Date.now() }));
  } catch (error) {
    console.warn("Explanation figures preload unavailable", error);
  }
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

function setProfileIconVisible(visible) {
  const profileBtn = document.getElementById("profileBtn");
  const profilePanel = document.getElementById("profilePanel");
  const adminEntryBtn = document.getElementById("adminEntryBtn");
  if (!profileBtn) return;

  const hasPhone = Boolean(getCurrentSessionPhone());
  profileBtn.classList.toggle("hidden", !visible || !hasPhone);
  // L'accesso admin è indipendente dal pannello profilo: alcune schermate
  // nascondono il profilo, ma non devono far sparire l'ingresso admin.
  adminEntryBtn?.classList.toggle("hidden", !hasPhone || !isCurrentSessionAdmin());
  if (!visible) {
    profilePanel?.classList.add("hidden");
    profileBtn.setAttribute("aria-expanded", "false");
  }
}

function setWhatsAppVisible(visible) {
  document.getElementById("whatsappBtn")?.classList.toggle("hidden", !visible);
}

function setLoggedOutChrome() {
  setWhatsAppVisible(false);
}

function setLoggedInChrome() {
  setWhatsAppVisible(true);
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
    logout(true, "manual");
    window.location.href = "/";
  });
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

function toBanglaDigits(value) {
  const digits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return String(value).replace(/\d/g, digit => digits[Number(digit)] || digit);
}

function getExpiringBanglaMessage(daysLeft) {
  return [
    "আসসালামু আলাইকুম,",
    `আপনার MagicBook অ্যাক্সেস আর মাত্র ${toBanglaDigits(daysLeft)} দিন বাকি আছে। পড়াশোনার ছন্দ একবার ভেঙে গেলে তা আবার শুরু করা কঠিন হয়ে যায়। আপনার প্রস্তুতির গতি ধরে রাখতে এখনই রিনিউ করে নিন।`,
    "",
    "✅ রিনিউ প্ল্যান:",
    "🔹 ১০ ইউরো = ৩০ দিন",
    "🔹 ২০ ইউরো = ৯০ দিন (সবচেয়ে জনপ্রিয়)",
    "🔹 ৪০ ইউরো = ৩৬৫ দিন (পুরো বছরের জন্য নিশ্চিন্ত)",
    "",
    "📲 রিনিউ করতে আমাদের এই নাম্বারে হোয়াটসঅ্যাপ করুন: +39 366 358 4525।",
    "পড়াশোনার ছন্দে থাকুন, সফলতার পথে এগিয়ে থাকুন!",
    "Tmm Bangla Patente"
  ].join("\n");
}

function getExpiredBanglaMessage() {
  return [
    "আসসালামু আলাইকুম,",
    "আপনার ম্যাজিকবুক-এর মেয়াদ শেষ হয়ে গেছে। লক্ষ্য পূরণের পথে থেমে থাকা চলবে না! পড়াশোনার ছন্দ ফিরে পেতে এবং ম্যাজিকবুক-এর সব সুবিধা পেতে আজই রিনিউ করুন।",
    "",
    "📅 আপনার জন্য প্ল্যান:",
    "📍 ৩০ দিন = ১০€ | ৯০ দিন = ২০€ | ৩৬৫ দিন = ৪০€",
    "",
    "সরাসরি যোগাযোগ করুন এই নাম্বারে: +39 366 358 4525।",
    "পড়াশোনা হোক আরও সহজ ও আনন্দময়!",
    "Tmm Bangla Patente"
  ].join("\n");
}

function getPromoBanglaMessage() {
  return [
    "আসসালামু আলাইকুম,",
    "",
    "আশা করি TMM Bangla Patente-এর ৫ দিনের Promo Access আপনার ভালো লেগেছে। এই সময়ে আপনি আমাদের এমন একটি সম্পূর্ণ স্টাডি সিস্টেম দেখেছেন, যা ইতালির ড্রাইভিং পরীক্ষার প্রস্তুতিকে আরও সহজ, গোছানো এবং আত্মবিশ্বাসী করে।",
    "",
    "MagicBook-এ আপনি পাচ্ছেন:",
    "✅ অধ্যায়ভিত্তিক বই ও ৭৮৬টি Magic Quiz",
    "✅ ৩০ প্রশ্নের Mix Quiz ও পরীক্ষার অনুশীলন",
    "✅ ইতালিয়ান–বাংলা Dictionary, অডিও ও অনুবাদ",
    "✅ ভুল উত্তরের ব্যাখ্যা, ছবি ও সহজ রিভিশন",
    "✅ নিয়মিত নতুন অডিও, অনুবাদ, ব্যাখ্যা ও ফিচার আপডেট",
    "",
    "আমাদের লক্ষ্য শুধু প্রশ্ন মুখস্থ করানো নয়—কঠিন বিষয় সহজভাবে বুঝিয়ে প্রতিদিনের পড়াশোনাকে কার্যকর করা। নিয়মিত এই সিস্টেম অনুসরণ করলে আপনার প্রস্তুতি আরও শক্ত হবে এবং পরীক্ষার দিন আত্মবিশ্বাস বাড়বে।",
    "",
    "সব প্ল্যানেই সম্পূর্ণ সিস্টেম ও ভবিষ্যৎ আপডেট অন্তর্ভুক্ত:",
    "• ৩০ দিন — ১০€",
    "• ৯০ দিন — ২০€ (সবচেয়ে জনপ্রিয়)",
    "• ৩৬৫ দিন — ৪০€",
    "",
    "প্ল্যানের বিস্তারিত দেখুন এবং আপনার জন্য সঠিকটি বেছে নিন:",
    "https://tmmmagic.eu/join",
    "",
    "অ্যাক্টিভ করতে বা কোনো প্রশ্ন থাকলে WhatsApp-এ লিখুন: +39 366 358 4525",
    "",
    "TMM Bangla Patente"
  ].join("\n");
}

function getRenewPopupState() {
  try {
    const state = JSON.parse(Storage.get(KEYS.renewPopupDailyState) || "{}");
    return state && typeof state === "object" ? state : {};
  } catch {
    return {};
  }
}

function saveRenewPopupState(state) {
  Storage.set(KEYS.renewPopupDailyState, JSON.stringify(state || {}));
}

function checkRenewReminder(force = false) {
  const daysLeft = getDaysToExpiry();
  if (daysLeft === null) return;
  if (daysLeft < 0) return;
  if (daysLeft > ADMIN_EXPIRING_DAYS) return;

  const todayKey = getTodayKey();
  const state = getRenewPopupState();
  const sameDay = state.date === todayKey;
  const count = sameDay ? Number(state.count || 0) : 0;
  const lastShownAt = sameDay ? Number(state.lastShownAt || 0) : 0;
  const tooSoon = Date.now() - lastShownAt < 4 * 60 * 60 * 1000;

  if (count >= 2) return;
  if (!force && count > 0 && tooSoon) return;

  showRenewPopup(daysLeft);
  saveRenewPopupState({
    date: todayKey,
    count: count + 1,
    lastShownAt: Date.now()
  });
  Storage.set(KEYS.renewPopupLastShown, todayKey);
}

function showBanglaRenewPopup(message, daysLeft = null) {
  const old = document.getElementById("renewPopupOverlay");
  if (old) old.remove();

  if (!document.getElementById("renewPopupBanglaStyles")) {
    const style = document.createElement("style");
    style.id = "renewPopupBanglaStyles";
    style.textContent = `
      @keyframes renewSlideUp {
        from { opacity: 0; transform: translateY(24px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      #renewPopupBox {
        animation: renewSlideUp 0.34s cubic-bezier(0.22,1,0.36,1) both;
      }
      .renew-bn-message {
        white-space: pre-line;
        color: #1f2937;
        font-size: 15px;
        line-height: 1.62;
        text-align: left;
      }
      .renew-bn-badge {
        display: inline-flex;
        margin-bottom: 14px;
        padding: 6px 12px;
        border-radius: 999px;
        background: #fff7ed;
        color: #c2410c;
        font-size: 12px;
        font-weight: 900;
      }
      .renew-bn-actions {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
        margin-top: 18px;
      }
      .renew-bn-primary,
      .renew-bn-secondary {
        min-height: 46px;
        border-radius: 14px;
        font-weight: 900;
      }
      .renew-bn-primary {
        background: linear-gradient(135deg, #16a34a, #22c55e);
        color: #ffffff;
      }
      .renew-bn-secondary {
        background: #f8fafc;
        color: #64748b;
        border: 1px solid #e2e8f0;
        box-shadow: none;
      }
    `;
    document.head.appendChild(style);
  }

  const overlay = document.createElement("div");
  overlay.id = "renewPopupOverlay";
  overlay.style.cssText = [
    "position:fixed;inset:0;",
    "background:rgba(10,10,30,0.62);",
    "backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);",
    "z-index:999999;",
    "display:flex;align-items:center;justify-content:center;",
    "padding:18px;"
  ].join("");

  const box = document.createElement("div");
  box.id = "renewPopupBox";
  box.style.cssText = [
    "background:#ffffff;",
    "width:100%;max-width:480px;",
    "max-height:calc(100dvh - 36px);overflow:auto;",
    "border-radius:24px;",
    "padding:22px 18px 18px;",
    "box-shadow:0 32px 80px rgba(0,0,0,0.24);",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;"
  ].join("");

  const badge = document.createElement("div");
  badge.className = "renew-bn-badge";
  badge.textContent = daysLeft === null ? "Accesso scaduto" : `${toBanglaDigits(daysLeft)} দিন বাকি`;

  const text = document.createElement("div");
  text.className = "renew-bn-message";
  text.textContent = message;

  const actions = document.createElement("div");
  actions.className = "renew-bn-actions";

  const primary = document.createElement("button");
  primary.type = "button";
  primary.className = "renew-bn-primary";
  primary.textContent = "WhatsApp";
  primary.onclick = () => {
    const url = `https://wa.me/${RENEW_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    openExternalUrl(url);
    overlay.remove();
  };

  const secondary = document.createElement("button");
  secondary.type = "button";
  secondary.className = "renew-bn-secondary";
  secondary.textContent = "পরে";
  secondary.onclick = () => overlay.remove();

  actions.appendChild(primary);
  actions.appendChild(secondary);
  box.appendChild(badge);
  box.appendChild(text);
  box.appendChild(actions);
  overlay.appendChild(box);
  overlay.addEventListener("click", event => {
    if (event.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}

function showRenewPopup(daysLeft) {
  const old = document.getElementById("renewPopupOverlay");
  if (old) old.remove();

  showBanglaRenewPopup(getExpiringBanglaMessage(daysLeft), daysLeft);
  return;

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
      openExternalUrl(url);
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

function showExpiredRenewPopup() {
  showBanglaRenewPopup(getExpiredBanglaMessage(), null);
}

/***********************
 * WHAT'S NEW POPUP
 ***********************/
const WHATS_NEW_ARTWORK = "icons/ui%20mobile.svg";
const WHATS_NEW_CAMPAIGN_ID = "mobile-ui-2026-08";
const WHATS_NEW_MAX_SHOWS_PER_USER = 3;
const WHATS_NEW_SHOW_COUNT_PREFIX = "whats_new_popup_show_count:";
let whatsNewPopupShownThisVisit = false;
let whatsNewPopupRetryTimer = null;

function getWhatsNewPopupCountKey() {
  const phone = normalizePhone(getCurrentSessionPhone());
  return phone ? `${WHATS_NEW_SHOW_COUNT_PREFIX}${WHATS_NEW_CAMPAIGN_ID}:${phone}` : "";
}

function getWhatsNewPopupShowCount() {
  const key = getWhatsNewPopupCountKey();
  if (!key) return WHATS_NEW_MAX_SHOWS_PER_USER;
  const count = Number.parseInt(Storage.get(key) || "0", 10);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function hasReachedWhatsNewPopupLimit() {
  return getWhatsNewPopupShowCount() >= WHATS_NEW_MAX_SHOWS_PER_USER;
}

function recordWhatsNewPopupShown() {
  const key = getWhatsNewPopupCountKey();
  if (!key) return;
  const nextCount = Math.min(WHATS_NEW_MAX_SHOWS_PER_USER, getWhatsNewPopupShowCount() + 1);
  Storage.set(key, String(nextCount));
}

function resetWhatsNewPopupForNextLogin() {
  if (whatsNewPopupRetryTimer) {
    window.clearTimeout(whatsNewPopupRetryTimer);
    whatsNewPopupRetryTimer = null;
  }
  document.getElementById("whatsNewPopupOverlay")?.remove();
  whatsNewPopupShownThisVisit = false;
}

function isWhatsNewPopupAllowed() {
  if (whatsNewPopupShownThisVisit) return false;
  if (trialGuestMode || !getCurrentSessionPhone()) return false;
  if (hasReachedWhatsNewPopupLimit()) return false;
  if (hasVisibleBlockingPopup()) return false;
  return true;
}

function maybeShowWhatsNewPopup() {
  if (whatsNewPopupShownThisVisit || whatsNewPopupRetryTimer) return;
  if (trialGuestMode || !getCurrentSessionPhone()) return;
  if (hasReachedWhatsNewPopupLimit()) return;

  const tryToShow = () => {
    whatsNewPopupRetryTimer = null;
    if (whatsNewPopupShownThisVisit || trialGuestMode || !getCurrentSessionPhone()) return;
    if (hasReachedWhatsNewPopupLimit()) return;

    if (!isWhatsNewPopupAllowed()) {
      whatsNewPopupRetryTimer = window.setTimeout(tryToShow, 900);
      return;
    }

    showWhatsNewPopup();
  };

  whatsNewPopupRetryTimer = window.setTimeout(tryToShow, 140);
}

function showWhatsNewPopup() {
  if (!isWhatsNewPopupAllowed()) return;

  recordWhatsNewPopupShown();
  whatsNewPopupShownThisVisit = true;
  const previouslyFocused = document.activeElement;
  const overlay = document.createElement("div");
  overlay.id = "whatsNewPopupOverlay";
  overlay.className = "whats-new-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "whatsNewPopupTitle");

  const card = document.createElement("div");
  card.className = "whats-new-card";

  const title = document.createElement("h2");
  title.id = "whatsNewPopupTitle";
  title.className = "sr-only";
  title.textContent = "Cosa c'e di nuovo";

  const artwork = document.createElement("img");
  artwork.className = "whats-new-artwork";
  artwork.src = WHATS_NEW_ARTWORK;
  artwork.alt = "Anteprima della nuova interfaccia mobile di MagicBook";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "whats-new-close";
  closeButton.setAttribute("aria-label", "Chiudi le novita");
  closeButton.innerHTML = "<span aria-hidden=\"true\">&times;</span>";

  const understoodButton = document.createElement("button");
  understoodButton.type = "button";
  understoodButton.className = "whats-new-understood";
  understoodButton.textContent = "Capito";

  const closePopup = () => {
    if (!overlay.isConnected || overlay.classList.contains("is-closing")) return;
    overlay.classList.add("is-closing");
    window.setTimeout(() => {
      overlay.remove();
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
      maybeShowWhatsAppGroupPopup();
    }, 180);
  };

  closeButton.addEventListener("click", closePopup);
  understoodButton.addEventListener("click", closePopup);
  overlay.addEventListener("click", event => {
    if (event.target === overlay) closePopup();
  });
  overlay.addEventListener("keydown", event => {
    if (event.key === "Escape") closePopup();
    if (event.key === "Tab") {
      event.preventDefault();
      const nextButton = event.shiftKey
        ? (document.activeElement === closeButton ? understoodButton : closeButton)
        : (document.activeElement === understoodButton ? closeButton : understoodButton);
      nextButton.focus({ preventScroll: true });
    }
  });

  card.appendChild(title);
  card.appendChild(artwork);
  card.appendChild(closeButton);
  card.appendChild(understoodButton);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  window.requestAnimationFrame(() => closeButton.focus({ preventScroll: true }));
}

/***********************
 * WHATSAPP GROUP POPUP
 ***********************/
const WHATSAPP_GROUP_CLICKED_KEY = "whatsapp_group_joined_or_clicked";
const WHATSAPP_GROUP_DISMISSED_AT_KEY = "whatsapp_group_popup_dismissed_at";
const WHATSAPP_GROUP_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

const WHATSAPP_GROUP_POPUP_TEXT = {
  bn: {
    title: "MagicBook WhatsApp গ্রুপে যোগ দিন",
    message: "সাপোর্ট, আপডেট এবং অ্যাপ ব্যবহারের সাহায্যের জন্য আমাদের অফিসিয়াল WhatsApp গ্রুপে যোগ দিন।",
    primary: "গ্রুপে যোগ দিন",
    secondary: "এখন না",
    note: "আপনি চাইলে পরে আবার যোগ দিতে পারবেন।"
  },
  it: {
    title: "Unisciti al gruppo WhatsApp MagicBook",
    message: "Entra nel gruppo ufficiale per supporto, aggiornamenti e aiuto sull’utilizzo dell’app.",
    primary: "Unisciti al gruppo",
    secondary: "Non ora",
    note: "Puoi unirti anche più tardi."
  }
};

function hasVisibleBlockingPopup() {
  const quizModeOverlay = document.getElementById("quizModeOverlay");
  const menuOverlay = document.getElementById("menuOverlay");

  return Boolean(
    document.getElementById("renewPopupOverlay") ||
    document.getElementById("whatsNewPopupOverlay") ||
    document.getElementById("whatsappGroupPopupOverlay") ||
    quizModeOverlay?.classList.contains("qms-visible") ||
    menuOverlay?.classList.contains("overlay-visible")
  );
}

function getWhatsAppGroupDismissedAt() {
  const value = Number(Storage.get(WHATSAPP_GROUP_DISMISSED_AT_KEY) || 0);
  return Number.isFinite(value) ? value : 0;
}

function isWhatsAppGroupPopupAllowed() {
  if (currentScreen !== "home") return false;
  if (!getCurrentSessionPhone()) return false;
  if (Storage.get(WHATSAPP_GROUP_CLICKED_KEY) === "true") return false;
  if (Date.now() - getWhatsAppGroupDismissedAt() < WHATSAPP_GROUP_DISMISS_MS) return false;
  if (hasVisibleBlockingPopup()) return false;
  return true;
}

function maybeShowWhatsAppGroupPopup() {
  setTimeout(() => {
    if (isWhatsAppGroupPopupAllowed()) showWhatsAppGroupPopup();
  }, 360);
}

function openWhatsAppGroupLink() {
  const groupCode = WHATSAPP_GROUP_CODE;
  const normalLink = "https://chat.whatsapp.com/" + groupCode;
  const isAndroid = /Android/i.test(navigator.userAgent);

  if (isAndroid) {
    const intentUrl =
      "intent://chat.whatsapp.com/" +
      groupCode +
      "#Intent;scheme=https;package=com.whatsapp;end";

    window.location.href = intentUrl;

    setTimeout(() => {
      openExternalUrl(normalLink);
    }, 1200);

    return;
  }

  openExternalUrl(normalLink);
}

function injectWhatsAppGroupPopupStyles() {
  if (document.getElementById("whatsappGroupPopupStyles")) return;

  const style = document.createElement("style");
  style.id = "whatsappGroupPopupStyles";
  style.textContent = `
    @keyframes whatsappGroupFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes whatsappGroupSlideUp {
      from { opacity: 0; transform: translateY(24px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    #whatsappGroupPopupOverlay {
      position: fixed;
      inset: 0;
      z-index: 999998;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: max(18px, env(safe-area-inset-top)) 18px max(18px, env(safe-area-inset-bottom));
      background:
        linear-gradient(180deg, rgba(4, 13, 16, 0.58), rgba(6, 18, 20, 0.76)),
        rgba(6, 18, 20, 0.68);
      backdrop-filter: blur(16px) saturate(118%);
      -webkit-backdrop-filter: blur(16px) saturate(118%);
      animation: whatsappGroupFadeIn 0.22s ease-out both;
    }
    #whatsappGroupPopupCard {
      position: relative;
      width: 100%;
      max-width: 432px;
      overflow: hidden;
      border-radius: 28px;
      border: 1px solid rgba(255, 255, 255, 0.78);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(245, 255, 250, 0.98) 100%);
      box-shadow:
        0 34px 90px rgba(0, 0, 0, 0.34),
        0 2px 0 rgba(255, 255, 255, 0.72) inset;
      font-family: 'Hind Siliguri', 'Noto Sans Bengali', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      isolation: isolate;
      animation: whatsappGroupSlideUp 0.36s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    #whatsappGroupPopupCard::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
      background:
        linear-gradient(135deg, rgba(34, 197, 94, 0.14), transparent 38%),
        linear-gradient(315deg, rgba(20, 184, 166, 0.12), transparent 42%);
      pointer-events: none;
    }
    .wgp-accent {
      height: 6px;
      background: linear-gradient(90deg, #0f9f4a 0%, #25d366 46%, #9af5bd 100%);
    }
    .wgp-content {
      padding: 23px 22px 22px;
      text-align: center;
    }
    .wgp-lang {
      position: absolute;
      top: 15px;
      right: 15px;
      display: inline-flex;
      gap: 2px;
      padding: 2px;
      border-radius: 999px;
      background: rgba(237, 253, 244, 0.92);
      border: 1px solid rgba(165, 243, 192, 0.9);
      box-shadow: 0 10px 26px rgba(15, 118, 61, 0.12);
      z-index: 2;
    }
    .wgp-lang button {
      min-width: 42px;
      height: 28px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: #12833d;
      font: 800 11px/1 Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      letter-spacing: 0.02em;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .wgp-lang button.is-active {
      background: linear-gradient(135deg, #119948, #22c55e);
      color: #ffffff;
      box-shadow: 0 8px 18px rgba(22, 163, 74, 0.26);
    }
    .wgp-close {
      position: absolute;
      top: 15px;
      left: 15px;
      width: 34px;
      height: 34px;
      border: 1px solid rgba(209, 250, 229, 0.9);
      border-radius: 999px;
      background: rgba(247, 255, 251, 0.84);
      color: #4f6f5d;
      font: 800 18px/1 Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      cursor: pointer;
      box-shadow: 0 10px 24px rgba(15, 118, 61, 0.1);
      -webkit-tap-highlight-color: transparent;
    }
    .wgp-close::before,
    .wgp-close::after {
      content: "";
      position: absolute;
      left: 50%;
      top: 50%;
      width: 14px;
      height: 2px;
      border-radius: 999px;
      background: currentColor;
    }
    .wgp-close::before {
      transform: translate(-50%, -50%) rotate(45deg);
    }
    .wgp-close::after {
      transform: translate(-50%, -50%) rotate(-45deg);
    }
    .wgp-close:focus-visible,
    .wgp-lang button:focus-visible,
    .wgp-primary:focus-visible,
    .wgp-secondary:focus-visible {
      outline: 3px solid rgba(37, 211, 102, 0.28);
      outline-offset: 3px;
    }
    .wgp-icon {
      width: 72px;
      height: 72px;
      margin: 40px auto 17px;
      border-radius: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(145deg, #78f2a4 0%, #25d366 52%, #099143 100%);
      color: #ffffff;
      font-size: 36px;
      box-shadow:
        0 18px 36px rgba(22, 163, 74, 0.3),
        0 1px 0 rgba(255, 255, 255, 0.48) inset;
    }
    .wgp-icon img {
      width: 44px;
      height: 44px;
      object-fit: contain;
    }
    .wgp-title {
      margin: 0 auto 10px;
      max-width: 372px;
      color: #10251a;
      font-size: clamp(21px, 5.2vw, 24px);
      font-weight: 800;
      line-height: 1.16;
      letter-spacing: 0;
      text-wrap: balance;
    }
    .wgp-message {
      margin: 0 auto 18px;
      max-width: 352px;
      color: #506259;
      font-size: 15px;
      line-height: 1.48;
      text-wrap: pretty;
    }
    .wgp-actions {
      display: grid;
      gap: 10px;
      margin-top: 18px;
    }
    .wgp-primary,
    .wgp-secondary {
      min-height: 48px;
      border-radius: 16px;
      border: 0;
      font: 800 15px/1.2 'Hind Siliguri', 'Noto Sans Bengali', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      cursor: pointer;
      transition: transform 0.14s ease, box-shadow 0.14s ease, background 0.14s ease;
      -webkit-tap-highlight-color: transparent;
    }
    .wgp-primary {
      color: #ffffff;
      background: linear-gradient(135deg, #0f9f4a 0%, #25d366 100%);
      box-shadow:
        0 16px 30px rgba(22, 163, 74, 0.3),
        0 1px 0 rgba(255, 255, 255, 0.3) inset;
    }
    .wgp-secondary {
      color: #27533a;
      background: rgba(239, 252, 245, 0.9);
      border: 1px solid rgba(190, 242, 208, 0.9);
    }
    .wgp-close:active,
    .wgp-primary:active,
    .wgp-secondary:active {
      transform: scale(0.985);
    }
    .wgp-note {
      margin: 13px 0 0;
      color: #789083;
      font-size: 12.5px;
      line-height: 1.35;
    }
    @media (max-width: 380px) {
      #whatsappGroupPopupOverlay { padding-left: 14px; padding-right: 14px; }
      .wgp-content { padding: 22px 16px 18px; }
      .wgp-title { font-size: 20px; max-width: 310px; }
      .wgp-message { font-size: 14px; }
      .wgp-lang { top: 12px; right: 12px; }
      .wgp-lang button { min-width: 36px; height: 26px; font-size: 10px; }
      .wgp-close { top: 12px; left: 12px; width: 32px; height: 32px; }
      .wgp-icon { margin-top: 38px; }
    }
  `;
  document.head.appendChild(style);
}

function showWhatsAppGroupPopup() {
  if (!isWhatsAppGroupPopupAllowed()) return;

  injectWhatsAppGroupPopupStyles();

  let lang = "bn";
  const overlay = document.createElement("div");
  overlay.id = "whatsappGroupPopupOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");

  const card = document.createElement("div");
  card.id = "whatsappGroupPopupCard";

  const accent = document.createElement("div");
  accent.className = "wgp-accent";

  const content = document.createElement("div");
  content.className = "wgp-content";

  const langToggle = document.createElement("div");
  langToggle.className = "wgp-lang";
  langToggle.setAttribute("aria-label", "Language");

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "wgp-close";
  closeBtn.setAttribute("aria-label", "Close");

  const bnBtn = document.createElement("button");
  bnBtn.type = "button";
  bnBtn.textContent = "BN";

  const itBtn = document.createElement("button");
  itBtn.type = "button";
  itBtn.textContent = "IT";

  const icon = document.createElement("div");
  icon.className = "wgp-icon";
  icon.setAttribute("aria-hidden", "true");
  const iconImg = document.createElement("img");
  iconImg.src = "assets/images/whatsapp.png";
  iconImg.alt = "";
  iconImg.onerror = () => {
    icon.textContent = "☎";
  };
  icon.appendChild(iconImg);

  const title = document.createElement("h2");
  title.className = "wgp-title";

  const message = document.createElement("p");
  message.className = "wgp-message";

  const actions = document.createElement("div");
  actions.className = "wgp-actions";

  const primary = document.createElement("button");
  primary.type = "button";
  primary.className = "wgp-primary";

  const secondary = document.createElement("button");
  secondary.type = "button";
  secondary.className = "wgp-secondary";

  const note = document.createElement("p");
  note.className = "wgp-note";

  function renderLanguage() {
    const text = WHATSAPP_GROUP_POPUP_TEXT[lang];
    card.setAttribute("lang", lang === "bn" ? "bn" : "it");
    title.textContent = text.title;
    message.textContent = text.message;
    primary.textContent = text.primary;
    secondary.textContent = text.secondary;
    note.textContent = text.note;
    bnBtn.classList.toggle("is-active", lang === "bn");
    itBtn.classList.toggle("is-active", lang === "it");
    bnBtn.setAttribute("aria-pressed", lang === "bn" ? "true" : "false");
    itBtn.setAttribute("aria-pressed", lang === "it" ? "true" : "false");
  }

  bnBtn.addEventListener("click", () => {
    lang = "bn";
    renderLanguage();
  });

  itBtn.addEventListener("click", () => {
    lang = "it";
    renderLanguage();
  });

  primary.addEventListener("click", () => {
    Storage.set(WHATSAPP_GROUP_CLICKED_KEY, "true");
    openWhatsAppGroupLink();
    overlay.remove();
  });

  secondary.addEventListener("click", () => {
    Storage.set(WHATSAPP_GROUP_DISMISSED_AT_KEY, String(Date.now()));
    overlay.remove();
  });

  closeBtn.addEventListener("click", () => {
    Storage.set(WHATSAPP_GROUP_DISMISSED_AT_KEY, String(Date.now()));
    overlay.remove();
  });

  overlay.addEventListener("click", event => {
    if (event.target === overlay) {
      Storage.set(WHATSAPP_GROUP_DISMISSED_AT_KEY, String(Date.now()));
      overlay.remove();
    }
  });

  langToggle.appendChild(bnBtn);
  langToggle.appendChild(itBtn);
  actions.appendChild(primary);
  actions.appendChild(secondary);
  content.appendChild(langToggle);
  content.appendChild(closeBtn);
  content.appendChild(icon);
  content.appendChild(title);
  content.appendChild(message);
  content.appendChild(actions);
  content.appendChild(note);
  card.appendChild(accent);
  card.appendChild(content);
  overlay.appendChild(card);

  renderLanguage();
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
/***********************
 * UI NAVIGATION
 ***********************/
function hideAll() {
  cleanupMagicBookViewer();
  window.MagicBookLearningInsights?.hide();
  ["landing", "about", "join", "login", "home", "chapters", "viewer", "adminPanel", "trialHub", "magicDictionaryScreen", "learningInsightsScreen"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
  document.body.classList.remove("admin-mode", "app-mode", "public-mode", "trial-hub-mode", "learning-insights-mode");
  updateAdminEntryVisibility();
}

function showHome() {
  if (trialGuestMode) { showChapters(); return; }
  hideAll();
  document.getElementById("home")?.classList.remove("hidden");
  setChapterMode(false);
  document.body.classList.add("app-mode");
  showAppHeader("home");
  currentScreen = "home";
  updateProfileUI(true);
  setProfileIconVisible(true);
  setLoggedInChrome();
  setAppRoute({ screen: "home" });
  updateAdminEntryVisibility();
  maybeShowWhatsAppGroupPopup();
}

function showChapters() {
  hideAll();
  document.getElementById("chapters")?.classList.remove("hidden");
  setChapterMode(false);
  document.body.classList.add("app-mode");
  showAppHeader("chapters");
  currentScreen = "chapters";
  updateProfileUI(!trialGuestMode);
  setProfileIconVisible(false);
  setAppRoute({ screen: "chapters" });
  requestAnimationFrame(() => updateCardTrack());
  if (trialGuestMode) decorateGuestTrialUI();
}

function showMagicDictionary(options = {}) {
  if (trialGuestMode) {
    openTrialPaywall("Dizionario");
    return;
  }
  const returnScreen = ["home", "statistics", "errors"].includes(currentScreen) ? currentScreen : "chapters";
  hideAll();
  setChapterMode(false);
  document.body.classList.add("app-mode");
  currentScreen = "dictionary";
  updateProfileUI(true);
  setProfileIconVisible(false);
  setLoggedInChrome();
  setAppRoute({ screen: "dictionary" }, { replace: options.replace === true });
  window.MagicDictionaryFeature?.showDictionary({ returnScreen, query: options.query || "" });
}

function showLearningInsightsScreen(mode, options = {}) {
  if (trialGuestMode) {
    openTrialPaywall(mode === "errors" ? "Errori" : "Statistiche");
    return;
  }
  hideAll();
  setChapterMode(false);
  document.getElementById("learningInsightsScreen")?.classList.remove("hidden");
  document.body.classList.add("app-mode", "learning-insights-mode");
  currentScreen = mode === "errors" ? "errors" : "statistics";
  updateProfileUI(true);
  setProfileIconVisible(false);
  setLoggedInChrome();
  setAppRoute({ screen: currentScreen }, { replace: options.replace === true });
  window.MagicBookLearningInsights?.show(mode, { focus: options.focus !== false });
}

function showLearningStatistics(options = {}) {
  showLearningInsightsScreen("statistics", options);
}

function showLearningErrors(options = {}) {
  showLearningInsightsScreen("errors", options);
}

function isGuestTrialChapter(chapter) { return trialGuestMode && isFreeTrialChapter(chapter); }
function decorateGuestTrialUI() {
  document.body.classList.toggle("guest-trial-mode", trialGuestMode);
  document.querySelectorAll(".chapter-card").forEach(card => {
    const allowed = isFreeTrialChapter(card.dataset.chapter);
    card.classList.toggle("guest-locked", trialGuestMode && !allowed);
    card.classList.toggle("guest-open", trialGuestMode && allowed);
    let badge = card.querySelector(".guest-lock-badge");
    if (trialGuestMode && !allowed && !badge) {
      badge = document.createElement("span"); badge.className = "guest-lock-badge"; badge.textContent = "🔒"; card.appendChild(badge);
    }
    if (!trialGuestMode) badge?.remove();
  });
  document.getElementById("examButton")?.classList.toggle("guest-locked-tool", trialGuestMode);
  const kicker = document.querySelector("#chapters .lesson-kicker");
  if (kicker) kicker.textContent = trialGuestMode ? "Guest Trial · Capitoli 1 e 3" : "License Journey";
}

function back() { goBack(); }

/***********************
 * CAPITOLI (CARD STACK)
 ***********************/
const TOTAL_CHAPTERS = 25;
const CHAPTER_TITLES = Object.freeze([
  "Doveri nell'uso della strada",
  "Segnali di pericolo",
  "Segnali di divieto",
  "Segnali d'obbligo",
  "Segnali di precedenza",
  "Segnaletica orizzontale",
  "Semafori e agenti di traffico",
  "Segnali di indicazione",
  "Segnali complementari e di cantiere",
  "Pannelli integrativi",
  "Limiti di velocità",
  "Distanza di sicurezza",
  "Norme e circolazione veicoli",
  "Precedenza e incroci",
  "Norme sul sorpasso",
  "Fermata, sosta e arresto",
  "Circolazione su autostrade",
  "Luci e dispositivi acustici",
  "Casco e cintura di sicurezza",
  "Patente e documenti",
  "Incidenti stradali",
  "Alcol e droga",
  "Responsabilità civile e penale",
  "Consumi di carburante",
  "Manutenzione ed elementi del veicolo"
]);
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
    const chapterTitle = CHAPTER_TITLES[i - 1] || `Capitolo ${i}`;
    card.className = "chapter-card";
    card.dataset.chapter = i;
    card.setAttribute("aria-label", `Capitolo ${i}: ${chapterTitle}`);
    card.innerHTML = `
      <span class="chapter-card-label">Capitolo</span>
      <strong class="chapter-card-number">${formatChapter(i)}</strong>
      <span class="chapter-card-title">${chapterTitle}</span>
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
      // Pointer capture makes `e.target` resolve to the track on several mobile
      // browsers. Resolve the element under the actual release coordinates so
      // a tap on a locked card always reaches the Premium paywall.
      const releaseTarget = document.elementFromPoint(e.clientX, e.clientY);
      const tapped = releaseTarget?.closest(".chapter-card") || e.target.closest(".chapter-card");
      if (tapped) {
        const ch = parseInt(tapped.dataset.chapter);
        if (trialGuestMode && !isFreeTrialChapter(ch)) {
          selectChapter(ch);
          openTrialPaywall(`Capitolo ${ch}`);
        } else if (ch === selectedChapter) startEngineSequence();
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
  if (trialGuestMode && !isFreeTrialChapter(selectedChapter)) {
    openTrialPaywall(`Capitolo ${selectedChapter}`);
    return;
  }
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
  if (trialGuestMode) { openTrialPaywall("Exam"); return; }
  openExamModeScreen();
}

function openExamModeScreen() {
  const overlay = document.getElementById("examModeOverlay");
  if (!overlay) return;

  overlay.classList.remove("hidden");
  requestAnimationFrame(() => overlay.classList.add("qms-visible"));
  document.body.classList.add("qms-open");
  currentScreen = "examMode";
}

function closeExamModeScreen() {
  const overlay = document.getElementById("examModeOverlay");
  if (!overlay) return;
  overlay.classList.remove("qms-visible");
  setTimeout(() => {
    overlay.classList.add("hidden");
    document.body.classList.remove("qms-open");
  }, 450);
  currentScreen = "chapters";
}

function startExamQuiz(mode) {
  const validModes = new Set(["exam80", "exam30"]);
  if (!validModes.has(mode)) return;

  closeExamModeScreen();
  setTimeout(() => {
    window.location.href = getQuizPath({ mode });
  }, 460);
}

function startExamPdf() {
  closeExamModeScreen();
  setTimeout(() => {
    openMagicBookPages({ type: "exam" });
  }, 460);
}

function openChapter(cap) {
  if (trialGuestMode && !isGuestTrialChapter(cap)) { openTrialPaywall(`Capitolo ${cap}`); return; }
  if (trialGuestMode) { openTrialBook(cap); return; }
  openMagicBookPages({ type: "chapter", chapter: cap });
}

/***********************
 * APP HEADER & MENU
 ***********************/
let currentViewingChapter = null;
let currentScreen = "welcome"; // welcome | about | join | login | home | chapters | viewer | admin | exam | quizMode | examMode

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
  if (trialGuestMode && currentScreen === "chapters") {
    trialGuestMode = false;
    document.body.classList.remove("guest-trial-mode");
    showLandingScreen();
    return;
  }
  if (currentScreen === "trialBook") {
    isTrialBookViewer = false;
    document.querySelector(".menu-btn")?.classList.remove("hidden");
    showChapters();
    return;
  }
  if (currentScreen === "examMode") {
    closeExamModeScreen();
    return;
  }
  if (currentScreen === "quizMode") {
    closeQuizModeScreen();
    return;
  }
  if (currentScreen === "viewer" || currentScreen === "exam") {
    showChapters();
  } else if (currentScreen === "chapters") {
    showHome();
  } else if (currentScreen === "statistics" || currentScreen === "errors") {
    showHome();
  } else if (currentScreen === "dictionary") {
    showChapters();
  } else if (currentScreen === "join" || currentScreen === "login" || currentScreen === "about") {
    showLandingScreen();
  }
  // On home screen the back button is hidden, so nothing needed
}

// Legacy alias
function goBackFromChapter() { goBack(); }

function goHome() {
  closeChapterMenu();
  showHome();
}

window.addEventListener("popstate", () => {
  if (readStoredSession() || Storage.get(KEYS.loggedIn) === "true") {
    openRouteState(getRouteStateFromLocation());
  } else {
    const state = getRouteStateFromLocation();
    if (state.screen === "trialHub") startGuestTrial({ replace: true });
    else if (state.screen === "trialBook") startGuestTrial({ replace: true, openChapter: state.chapter });
    else if (state.screen === "login") showLoginScreen("", { replace: true });
    else if (state.screen === "join") showJoinScreen({ replace: true });
    else if (state.screen === "about") showAboutScreen({ replace: true });
    else showLandingScreen({ replace: true });
  }
});

function openExamFromMenu() {
  closeChapterMenu();
  openExam();
}

function openQuizFromMenu() {
  closeChapterMenu();
  openQuiz();
}

function openDictionaryFromMenu() {
  closeChapterMenu();
  showMagicDictionary();
}

/***********************
 * VIEWER
 ***********************/
const MAGIC_BOOK_API = "/api/getPages";
let isTrialBookViewer = false;
const VIEWER_LOADING_FIGURES = [
  "fig1",
  "fig8",
  "fig25",
  "fig50",
  "fig120",
  "fig220",
  "fig350",
  "fig440",
  "fig550"
];
let currentBookViewer = {
  book: "magic",
  type: null,
  chapter: null,
  page: 0,
  isLoading: false,
  hasNext: false,
  loaderInView: false
};
let magicBookViewerRequestId = 0;
let magicBookScrollHandlerInstalled = false;
let magicBookLoadObserver = null;

function buildViewerLoadingFigureUrl(figure) {
  const params = new URLSearchParams({
    kind: "figure",
    figure
  });
  return `/api/asset?${params.toString()}`;
}

function stopViewerLoadingAnimation(loader) {
  if (loader?._figureTimer) {
    window.clearInterval(loader._figureTimer);
    loader._figureTimer = null;
  }
}

function startViewerLoadingAnimation(loader) {
  const img = loader?.querySelector(".viewer-loading-figure-img");
  if (!loader || !img || loader._figureTimer) return;

  let lastFigure = "";

  const getRandomFigure = () => {
    if (VIEWER_LOADING_FIGURES.length <= 1) return VIEWER_LOADING_FIGURES[0] || "";
    let next = "";
    do {
      next = VIEWER_LOADING_FIGURES[Math.floor(Math.random() * VIEWER_LOADING_FIGURES.length)];
    } while (next === lastFigure);
    lastFigure = next;
    return next;
  };

  const showNext = () => {
    const figure = getRandomFigure();
    if (!figure) return;
    img.classList.remove("is-sliding");
    void img.offsetWidth;
    img.src = buildViewerLoadingFigureUrl(figure);
    img.classList.add("is-sliding");
  };

  img.onerror = showNext;
  showNext();
  loader._figureTimer = window.setInterval(showNext, 1500);
}

async function fetchMagicBookPage({ type, chapter, page }) {
  if (isTrialBookViewer) {
    if (!isFreeTrialChapter(chapter) || type !== "chapter") return null;
    const guest = getTrialGuestCredentials();
    const response = await fetch("/api/trialBook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        chapter: String(Number(chapter)),
        page: String(Number(page)),
        trialId: guest.trialId,
        guestKey: guest.guestKey
      })
    });
    if (response.status === 404) return null;
    if (!response.ok || !(response.headers.get("Content-Type") || "").toLowerCase().includes("image/jpeg")) return null;
    const blob = await response.blob();
    return blob?.size ? blob : null;
  }
  const body = {
    book: "magic",
    type,
    page,
    phone: getCurrentSessionPhone(),
    deviceId: getCurrentSessionDeviceId()
  };

  if (type === "chapter") body.chapter = chapter;

  let response = null;

  try {
    response = await fetch(MAGIC_BOOK_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getCurrentAccessToken()}`
      },
      cache: "no-store",
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.warn("Magic Book API non raggiungibile", err);
    return null;
  }

  const contentType = response.headers.get("Content-Type") || "";

  if (response.status === 401 || response.status === 403) {
    let authError = "unauthorized";
    try {
      const data = await response.json();
      authError = data?.error || authError;
    } catch (err) {
      console.warn("Risposta autorizzazione non leggibile", err);
    }

    const error = new Error(authError);
    error.code = authError;
    throw error;
  }

  if (response.status === 404) {
    if (page === 1) {
      console.error("Failed to load page", {
        status: response.status,
        endpoint: MAGIC_BOOK_API,
        type,
        chapter,
        page
      });
    }
    return null;
  }

  if (response.status !== 200) {
    console.error("Failed to load page", {
      status: response.status,
      endpoint: MAGIC_BOOK_API,
      type,
      chapter,
      page
    });
    return null;
  }

  if (!contentType.toLowerCase().includes("image/jpeg")) {
    const text = await response.text();
    console.warn(`Invalid Magic Book response type: ${contentType || "empty"} ${text.slice(0, 120)}`);
    return null;
  }

  const blob = await response.blob();

  if (!blob || blob.size === 0) {
    return null;
  }

  if (blob.type && blob.type !== "image/jpeg") {
    return null;
  }

  return blob;
}

function cleanupMagicBookViewer({ resetState = true } = {}) {
  magicBookViewerRequestId++;
  magicBookLoadObserver?.disconnect();
  magicBookLoadObserver = null;

  const pages = document.getElementById("pages");
  if (pages) {
    stopViewerLoadingAnimation(pages.querySelector(".viewer-loading"));
    pages.querySelectorAll(".page canvas").forEach(canvas => {
      canvas.width = 0;
      canvas.height = 0;
    });
    pages.innerHTML = "";
  }

  if (resetState) {
    currentBookViewer = {
      book: "magic",
      type: null,
      chapter: null,
      page: 0,
      isLoading: false,
      hasNext: false,
      loaderInView: false
    };
  }
}

function showMagicBookError(message) {
  const pages = document.getElementById("pages");
  if (!pages) return;

  pages.innerHTML = "";
  const box = document.createElement("div");
  box.className = "page";
  box.style.cssText = "color:#252943;text-align:center;padding:40px 16px;font-weight:700;";
  box.textContent = message;
  pages.appendChild(box);
}

function getMagicBookAccessErrorMessage(error) {
  if (error === "expired") return "Accesso scaduto. Contatta il supporto per rinnovare.";
  if (error === "not_found") return "Numero non autorizzato.";
  if (error === "device_replaced") return "Questo dispositivo non è più autorizzato perché l’accesso è stato spostato su un altro dispositivo.";
  if (error === "device_mismatch") return "Questo dispositivo non è più autorizzato.";
  return "Accesso non disponibile. Riprova tra poco.";
}

function setMagicBookLoading(pages, visible, { active = true } = {}) {
  if (!pages) return;

  const existing = pages.querySelector(".viewer-loading");

  if (!visible) {
    magicBookLoadObserver?.disconnect();
    magicBookLoadObserver = null;
    currentBookViewer.loaderInView = false;
    stopViewerLoadingAnimation(existing);
    existing?.remove();
    return;
  }

  if (existing) {
    existing.classList.toggle("is-active", active);
    if (active) {
      startViewerLoadingAnimation(existing);
    } else {
      stopViewerLoadingAnimation(existing);
    }
    return;
  }

  const loader = document.createElement("div");
  loader.className = "viewer-loading";
  loader.classList.toggle("is-active", active);
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-live", "polite");

  const figureShell = document.createElement("div");
  figureShell.className = "viewer-loading-figure";

  const img = document.createElement("img");
  img.className = "viewer-loading-figure-img";
  img.alt = "";
  img.draggable = false;

  figureShell.appendChild(img);

  const text = document.createElement("span");
  text.className = "viewer-loading-text";
  text.textContent = "Loading...";

  const progress = document.createElement("div");
  progress.className = "viewer-loading-bar";

  const progressFill = document.createElement("span");
  progress.appendChild(progressFill);

  loader.appendChild(figureShell);
  loader.appendChild(text);
  loader.appendChild(progress);
  pages.appendChild(loader);

  if (active) startViewerLoadingAnimation(loader);
}

async function decodeMagicBookPage(pageBlob) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(pageBlob);
    return { source: bitmap, width: bitmap.width, height: bitmap.height };
  }

  const objectUrl = URL.createObjectURL(pageBlob);
  const image = new Image();

  try {
    image.decoding = "async";
    image.src = objectUrl;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Impossibile decodificare la pagina MagicBook."));
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function createMagicBookPage(pageBlob) {
  const decoded = await decodeMagicBookPage(pageBlob);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });

  if (!context) {
    decoded.source.close?.();
    throw new Error("Canvas 2D non disponibile.");
  }

  canvas.width = decoded.width;
  canvas.height = decoded.height;
  canvas.setAttribute("aria-label", "Pagina MagicBook");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("draggable", "false");

  try {
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
  } finally {
    decoded.source.close?.();
  }

  const box = document.createElement("div");
  box.className = "page";

  const shield = document.createElement("div");
  shield.className = "shield";
  shield.oncontextmenu = e => e.preventDefault();

  box.appendChild(canvas);
  box.appendChild(shield);
  return box;
}

function shouldLoadNextMagicBookPage(viewer) {
  if (!viewer) return false;
  const remaining = viewer.scrollHeight - viewer.scrollTop - viewer.clientHeight;
  return remaining < 520;
}

function checkMagicBookScrollLoad() {
  const viewer = document.getElementById("viewer");
  if (!viewer) return;
  if (!currentBookViewer.type || currentBookViewer.isLoading || !currentBookViewer.hasNext) return;

  if (shouldLoadNextMagicBookPage(viewer) || currentBookViewer.loaderInView) {
    loadNextMagicBookPage();
  }
}

function observeMagicBookContinuationLoader() {
  const viewer = document.getElementById("viewer");
  const loader = document.querySelector("#pages .viewer-loading");
  if (!viewer || !loader) return;

  magicBookLoadObserver?.disconnect();
  currentBookViewer.loaderInView = false;

  if (!("IntersectionObserver" in window)) {
    checkMagicBookScrollLoad();
    return;
  }

  magicBookLoadObserver = new IntersectionObserver(entries => {
    currentBookViewer.loaderInView = entries.some(entry => entry.isIntersecting);
    checkMagicBookScrollLoad();
  }, {
    root: viewer,
    rootMargin: "360px 0px",
    threshold: 0.01
  });

  magicBookLoadObserver.observe(loader);
}

function ensureMagicBookScrollLoading() {
  const viewer = document.getElementById("viewer");
  if (!viewer || magicBookScrollHandlerInstalled) return;

  viewer.addEventListener("scroll", () => {
    checkMagicBookScrollLoad();
  }, { passive: true });

  magicBookScrollHandlerInstalled = true;
}

async function loadNextMagicBookPage() {
  const pages = document.getElementById("pages");
  if (!pages) return;
  if (!currentBookViewer.type || currentBookViewer.isLoading || !currentBookViewer.hasNext) return;

  const requestId = magicBookViewerRequestId;
  const type = currentBookViewer.type;
  const chapter = currentBookViewer.chapter;
  const nextPage = currentBookViewer.page + 1;

  currentBookViewer.isLoading = true;
  setMagicBookLoading(pages, true, { active: true });

  try {
    const blob = await fetchMagicBookPage({ type, chapter, page: nextPage });
    if (requestId !== magicBookViewerRequestId) return;

    if (!blob) {
      currentBookViewer.hasNext = false;
      setMagicBookLoading(pages, false);
      if (nextPage === 1) showMagicBookError("Nessuna pagina trovata.");
      return;
    }

    const pageBox = await createMagicBookPage(blob);
    if (requestId !== magicBookViewerRequestId) {
      pageBox.querySelectorAll("canvas").forEach(canvas => {
        canvas.width = 0;
        canvas.height = 0;
      });
      return;
    }

    const loader = pages.querySelector(".viewer-loading");
    pages.insertBefore(pageBox, loader || null);
    currentBookViewer.page = nextPage;
    setMagicBookLoading(pages, true, { active: false });
    observeMagicBookContinuationLoader();
  } catch (err) {
    if (requestId !== magicBookViewerRequestId) return;

    console.error("Image load error", err);
    if (isRevokedSessionError(err.code || err.message)) {
      logout(true, err.code || err.message);
      return;
    }

    if ((err.code || err.message) === "token_expired") {
      currentBookViewer.isLoading = false;
      const ok = await ensureAccessToken({ force: true });
      if (ok && requestId === magicBookViewerRequestId) {
        await loadNextMagicBookPage();
      } else {
        setMagicBookLoading(pages, false);
      }
      return;
    }

    setMagicBookLoading(pages, false);
    if (nextPage === 1) showMagicBookError("Errore caricamento pagina.");
  } finally {
    if (requestId === magicBookViewerRequestId) {
      currentBookViewer.isLoading = false;
      window.setTimeout(checkMagicBookScrollLoad, 0);
    }
  }
}

async function openMagicBookPages({ type, chapter = null }) {
  hideAll();
  document.getElementById("viewer")?.classList.remove("hidden");
  document.getElementById("viewerBackBtn")?.classList.add("hidden");
  setProfileIconVisible(false);

  if (type === "chapter") {
    currentScreen = "viewer";
    setChapterMode(true, chapter);
    setAppRoute({ screen: "viewer", chapter });
  } else if (type === "exam") {
    currentScreen = "exam";
    setChapterMode(false);
    document.body.classList.add("app-mode");
    showAppHeader("exam");
    setAppRoute({ screen: "exam" });
  }

  const pages = document.getElementById("pages");
  if (!pages) return;

  const viewer = document.getElementById("viewer");
  if (viewer) viewer.scrollTop = 0;
  ensureMagicBookScrollLoading();
  magicBookViewerRequestId++;
  currentBookViewer = {
    book: "magic",
    type,
    chapter,
    page: 0,
    isLoading: false,
    hasNext: true,
    loaderInView: false
  };

  pages.innerHTML = "";
  setMagicBookLoading(pages, true);

  const accessReady = isTrialBookViewer || await ensureAccessToken({ force: true });
  if (!accessReady) {
    currentBookViewer.hasNext = false;
    setMagicBookLoading(pages, false);
    showMagicBookError("Accesso non disponibile. Riprova tra poco.");
    return;
  }

  loadNextMagicBookPage();
}

function openTrialBook(chapter) {
  const normalizedChapter = Number(chapter);
  if (!isFreeTrialChapter(normalizedChapter)) {
    showLandingScreen({ replace: true });
    return;
  }
  isTrialBookViewer = true;
  openMagicBookPages({ type: "chapter", chapter: normalizedChapter }).then(() => {
    currentScreen = "trialBook";
    document.querySelector(".menu-btn")?.classList.add("hidden");
    history.replaceState({ screen: "trialBook", chapter: normalizedChapter }, "", `/prova-gratis/libro-${normalizedChapter}`);
  });
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
  decorateGuestQuizUI();
}

function decorateGuestQuizUI() {
  if (!trialGuestMode) return;
  const studyCard = document.getElementById("qmsCardStudy");
  studyCard?.classList.add("guest-qms-free-card");
  const studySubtitle = studyCard?.querySelector(".qms-card-sub");
  const studyLabel = studyCard?.querySelector(".qms-start-label");
  if (studySubtitle) studySubtitle.textContent = "Capitoli 1 e 3: domande, audio, traduzioni e parole chiave";
  if (studyLabel) studyLabel.textContent = "Studia 01 e 03 gratis";
  document.querySelectorAll("#qmsCapPills .qms-pill").forEach(pill => {
    const free = isFreeTrialChapter(pill.dataset.ch);
    pill.classList.toggle("guest-qms-free", free);
    pill.classList.toggle("guest-qms-locked", !free);
  });
  document.getElementById("qmsCardMulti")?.classList.add("guest-qms-locked-card");
  const mixButton = document.querySelector("#qmsCardMix .qms-start");
  if (mixButton) {
    const remaining = Math.max(0, 2 - getTrialMixAttempts());
    mixButton.querySelector(".qms-start-label")?.replaceChildren(document.createTextNode(remaining ? `Inizia · ${remaining} gratis` : "Sblocca Mix Quiz"));
  }
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
  const cardStudy = document.getElementById("qmsCardStudy");
  const cardMix   = document.getElementById("qmsCardMix");
  const cardCap   = document.getElementById("qmsCardCap");
  const cardMulti = document.getElementById("qmsCardMulti");

  [cardStudy, cardMix, cardCap, cardMulti].forEach(c => {
    if (c) c.classList.remove("qms-card--active", "qms-card--inactive");
  });

  if (qmsActiveMode === "chapter") {
    cardCap?.classList.add("qms-card--active");
    cardStudy?.classList.add("qms-card--inactive");
    cardMix?.classList.add("qms-card--inactive");
    cardMulti?.classList.add("qms-card--inactive");
  } else if (qmsActiveMode === "multi") {
    cardMulti?.classList.add("qms-card--active");
    cardStudy?.classList.add("qms-card--inactive");
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
      if (trialGuestMode && !isFreeTrialChapter(i)) { openTrialPaywall(`Quiz Capitolo ${i}`); return; }
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
      if (trialGuestMode) { openTrialPaywall("Quiz Multi"); return; }
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

function startStudyQuiz() {
  if (trialGuestMode) {
    closeQuizModeScreen();
    setTimeout(() => { window.location.href = "/studia-quiz/prova-gratis"; }, 460);
    return;
  }
  closeQuizModeScreen();
  setTimeout(() => { window.location.href = "/studia-quiz"; }, 460);
}

function startMixQuiz() {
  if (trialGuestMode) {
    const attempts = getTrialMixAttempts();
    if (attempts >= 2) { openTrialPaywall("Quiz Mix 786"); return; }
    setTrialMixAttempts(attempts + 1);
    closeQuizModeScreen();
    setTimeout(() => { window.location.href = "/quiz/prova-gratis?chapter=1&mix=1"; }, 460);
    return;
  }
  closeQuizModeScreen();
  setTimeout(() => { window.location.href = getQuizPath(); }, 460);
}

function startCapQuiz() {
  if (trialGuestMode && !isFreeTrialChapter(qmsCapSelected)) { openTrialPaywall("Questo quiz"); return; }
  if (qmsCapSelected === null) return;
  const ch = qmsCapSelected;
  closeQuizModeScreen();
  setTimeout(() => {
    window.location.href = trialGuestMode
      ? `/quiz/prova-gratis?chapter=${ch}`
      : getQuizPath({ chapters: String(ch) });
  }, 460);
}

function startMultiQuiz() {
  if (trialGuestMode) { openTrialPaywall("Quiz Multi"); return; }
  if (qmsMultiSelected.size < 2) return;
  const chapters = Array.from(qmsMultiSelected).sort((a, b) => a - b).join(",");
  closeQuizModeScreen();
  setTimeout(() => { window.location.href = getQuizPath({ chapters }); }, 460);
}

/***********************
 * ADMIN PANEL
 ***********************/
const ADMIN_EXPIRING_DAYS = 16;
const adminState = {
  users: [],
  tab: "users",
  query: "",
  loading: false,
  loadVersion: 0,
  promoLoading: false,
  promoLoaded: false,
  promoError: "",
  confirm: null
};

function getCurrentSessionRole() {
  const session = readStoredSession();
  return String(session?.role || "user").trim().toLowerCase();
}

function isCurrentSessionAdmin() {
  return getCurrentSessionRole() === "admin";
}

function updateAdminEntryVisibility() {
  const btn = document.getElementById("adminEntryBtn");
  if (!btn) return;
  const adminPanel = document.getElementById("adminPanel");
  const adminPanelIsOpen = Boolean(adminPanel && !adminPanel.classList.contains("hidden"));
  const shouldShow = Boolean(getCurrentSessionPhone())
    && isCurrentSessionAdmin()
    && !adminPanelIsOpen;
  btn.classList.toggle("hidden", !shouldShow);
}

function refreshAdminEntryOnResume() {
  if (document.visibilityState === "hidden") return;
  updateAdminEntryVisibility();
}

window.addEventListener("pageshow", refreshAdminEntryOnResume);
window.addEventListener("focus", refreshAdminEntryOnResume);
document.addEventListener("visibilitychange", refreshAdminEntryOnResume);

function getAdminStatus(user) {
  const expiry = user?.expiry ? new Date(user.expiry) : null;
  if (!expiry || isNaN(expiry.getTime())) {
    return { key: "no-expiry", label: "No expiry", days: null };
  }
  if (trialGuestMode) {
    document.querySelectorAll("#qmsCapPills .qms-pill").forEach(pill => pill.classList.toggle("guest-qms-locked", !isFreeTrialChapter(pill.dataset.ch)));
    document.getElementById("qmsCardMix")?.classList.add("guest-qms-locked-card");
    document.getElementById("qmsCardMulti")?.classList.add("guest-qms-locked-card");
  }

  const days = Math.ceil((expiry.getTime() - Date.now()) / 86400000);
  if (days < 0) return { key: "expired", label: "Scaduto", days };
  if (days <= ADMIN_EXPIRING_DAYS) return { key: "expiring", label: "In scadenza", days };
  return { key: "active", label: "Attivo", days };
}

function isAdminPromoUser(user) {
  const source = String(user?.accessSource ?? user?.access_source ?? user?.source ?? "")
    .trim()
    .toLowerCase();
  if (["paid", "normal", "regular", "customer", "manual", "admin"].includes(source)) return false;

  const promoFlag = user?.isPromo ?? user?.is_promo ?? user?.promoUser ?? user?.promo_user ?? user?.promo;
  if (promoFlag !== undefined && promoFlag !== null && String(promoFlag).trim() !== "") {
    return promoFlag === true
      || promoFlag === 1
      || ["1", "true", "yes", "si", "sì", "promo"].includes(String(promoFlag).trim().toLowerCase());
  }

  if (source === "promo" || source === "promotion" || source === "promotional") return true;

  return Number(user?.promoDaysUsed ?? user?.promo_days_used) > 0
    || Number(user?.promoRedemptions ?? user?.promo_redemptions) > 0
    || Boolean(String(user?.lastPromoCodeId ?? user?.last_promo_code_id ?? "").trim());
}

function getAdminPhoneKey(phone) {
  return normalizePhone(phone);
}

function getAdminDuplicatePhones(users = adminState.users) {
  const counts = users.reduce((acc, user) => {
    const phone = getAdminPhoneKey(user.phone);
    if (phone) acc.set(phone, (acc.get(phone) || 0) + 1);
    return acc;
  }, new Map());
  return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([phone]) => phone));
}

function getAdminRegistrationTime(user) {
  const date = user?.registration_date ? new Date(user.registration_date) : null;
  return date && !isNaN(date.getTime()) ? date.getTime() : 0;
}

function mergeAdminPromoUsers(users, promoUsers) {
  const promoByPhone = new Map((Array.isArray(promoUsers) ? promoUsers : []).map(user => [
    getAdminPhoneKey(user?.phone),
    {
      accessSource: String(user?.accessSource || "").trim().toLowerCase(),
      isPromo: user?.isPromo === true,
      promoDaysUsed: Math.max(0, Number(user?.promoDaysUsed) || 0),
      promoRedemptions: Math.max(0, Number(user?.promoRedemptions) || 0)
    }
  ]));

  return (Array.isArray(users) ? users : []).map(user => ({
    ...user,
    ...(promoByPhone.get(getAdminPhoneKey(user?.phone)) || {})
  }));
}

function normalizeAdminSearch(input) {
  return String(input || "").replace(/\D+/g, "");
}

function isRenewActionVisible(user) {
  const status = getAdminStatus(user);
  return status.key === "expiring" || status.key === "expired";
}

function formatAdminDate(value) {
  if (!value) return "Nessuna";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "Nessuna";
  return date.toLocaleDateString("it-IT", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setAdminMessage(message = "", type = "") {
  const el = document.getElementById("adminMessage");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("hidden", !message);
  el.classList.toggle("is-success", type === "success");
  el.classList.toggle("is-error", type === "error");
}

function getAdminErrorMessage(error) {
  if (error === "admin_required") return "Accesso admin richiesto.";
  if (error === "token_expired" || error === "unauthorized") return "Sessione scaduta. Effettua nuovamente il login.";
  if (error === "duplicate") return "Questo numero esiste gia.";
  if (error === "not_found") return "Utente non trovato.";
  if (error === "bad_phone" || error === "bad_new_phone") return "Numero di telefono non valido.";
  if (error === "bad_expiry") return "Data di scadenza non valida.";
  if (error === "missing_server_config") return "Configurazione admin mancante sul server.";
  if (["admin_backend_error", "busy", "rate_limited", "server_error", "service_unavailable", "temporary_error"].includes(error)) {
    return "Il servizio utenti è momentaneamente occupato. Riprova tra pochi secondi.";
  }
  if (error === "bad_action" || error === "unknown_admin_action") return "Il pannello Admin deve essere aggiornato.";
  return "Operazione non riuscita. Riprova.";
}

const ADMIN_READ_RETRYABLE_ERRORS = new Set([
  "admin_backend_error",
  "busy",
  "rate_limited",
  "server_error",
  "service_unavailable",
  "temporary_error"
]);

function waitForAdminRetry(delayMs) {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

async function adminRequest(action, fields = {}, retryToken = true, transientAttempt = 0) {
  if (!isCurrentSessionAdmin()) throw new Error("admin_required");

  const hasToken = await ensureAccessToken({ force: !isAccessTokenUsable() });
  if (!hasToken && !getCurrentAccessToken()) throw new Error("unauthorized");

  const readOnlyAction = action === "list" || action === "search" || action === "promo_users";
  const maxTransientAttempts = action === "promo_users" ? 1 : 2;
  let response;
  try {
    response = await fetch(ADMIN_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        sessionPhone: getCurrentSessionPhone(),
        deviceId: getCurrentSessionDeviceId(),
        accessToken: getCurrentAccessToken(),
        ...fields
      })
    });
  } catch {
    if (readOnlyAction && transientAttempt < maxTransientAttempts) {
      await waitForAdminRetry(transientAttempt === 0 ? 700 : 1400);
      return adminRequest(action, fields, retryToken, transientAttempt + 1);
    }
    throw new Error("service_unavailable");
  }

  const data = await response.json().catch(() => null);
  if ((response.status === 401 || response.status === 403) && retryToken && data?.error === "token_expired") {
    await ensureAccessToken({ force: true });
    return adminRequest(action, fields, false, transientAttempt);
  }

  if (!response.ok || !data?.success) {
    const errorCode = String(data?.error || "admin_backend_error").trim();
    if (readOnlyAction && transientAttempt < maxTransientAttempts && ADMIN_READ_RETRYABLE_ERRORS.has(errorCode)) {
      await waitForAdminRetry(transientAttempt === 0 ? 700 : 1400);
      return adminRequest(action, fields, retryToken, transientAttempt + 1);
    }
    throw new Error(errorCode);
  }

  return data;
}

function setupAdminUI() {
  document.querySelectorAll(".admin-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      adminState.tab = tab.dataset.adminTab || "users";
      document.querySelectorAll(".admin-tab").forEach(btn => {
        btn.classList.toggle("is-active", btn === tab);
      });
      renderAdminUsers();
      if (adminState.tab === "promo" && !adminState.promoLoaded && !adminState.promoLoading) {
        void adminLoadPromoUsers(adminState.loadVersion);
      }
    });
  });

  const search = document.getElementById("adminSearchInput");
  const clearSearch = document.getElementById("adminSearchClear");
  search?.addEventListener("input", () => {
    adminState.query = search.value || "";
    clearSearch?.classList.toggle("hidden", !adminState.query);
    renderAdminUsers();
  });

  clearSearch?.addEventListener("click", () => {
    if (search) search.value = "";
    adminState.query = "";
    clearSearch.classList.add("hidden");
    renderAdminUsers();
    search?.focus();
  });

  document.getElementById("adminUserList")?.addEventListener("click", event => {
    const button = event.target.closest("[data-admin-action]");
    if (!button) return;
    const phone = button.dataset.phone || "";
    const user = adminState.users.find(item => item.phone === phone);
    if (!user) return;

    const action = button.dataset.adminAction;
    if (action === "edit") adminOpenUserModal("edit", user);
    if (action === "renew") adminOpenUserModal("renew", user);
    if (action === "reset") adminOpenConfirm("reset_devices", user);
    if (action === "delete") adminOpenConfirm("delete", user);
    if (action === "send") adminOpenUserWhatsApp(user);
  });

  document.getElementById("adminUserForm")?.addEventListener("submit", event => {
    event.preventDefault();
    adminSubmitUserModal();
  });

  document.getElementById("adminClipboardBtn")?.addEventListener("click", adminFillBulkFromClipboard);
}

async function showAdminPanel() {
  if (!isCurrentSessionAdmin()) {
    updateAdminEntryVisibility();
    showHome();
    return;
  }

  hideAll();
  document.getElementById("adminPanel")?.classList.remove("hidden");
  document.body.classList.add("admin-mode");
  setChapterMode(false);
  setProfileIconVisible(false);
  setLoggedInChrome();
  currentScreen = "admin";
  updateAdminEntryVisibility();
  setAppRoute({ screen: "admin" });
  await adminLoadUsers();
}

async function adminLoadUsers(force = false) {
  if (!isCurrentSessionAdmin()) return;
  if (adminState.loading && !force) return;

  const loadVersion = ++adminState.loadVersion;
  adminState.loading = true;
  renderAdminLoading();
  setAdminMessage("Caricamento utenti...");

  try {
    const data = await adminRequest("list");
    adminState.users = (Array.isArray(data.list) ? data.list : [])
      .sort((a, b) => getAdminRegistrationTime(b) - getAdminRegistrationTime(a));
    adminState.promoLoaded = false;
    adminState.promoLoading = true;
    adminState.promoError = "";
    setAdminMessage("Lista aggiornata.", "success");
    renderAdminUsers();
    void adminLoadPromoUsers(loadVersion);
  } catch (err) {
    setAdminMessage(getAdminErrorMessage(err.message), "error");
    renderAdminUsers();
  } finally {
    adminState.loading = false;
  }
}

async function adminLoadPromoUsers(loadVersion) {
  if (!isCurrentSessionAdmin()) return;
  adminState.promoLoading = true;
  adminState.promoError = "";
  if (adminState.tab === "promo") renderAdminUsers();

  try {
    const data = await adminRequest("promo_users");
    if (loadVersion !== adminState.loadVersion) return;
    adminState.users = mergeAdminPromoUsers(adminState.users, data.list);
    adminState.promoLoaded = true;
  } catch (error) {
    if (loadVersion !== adminState.loadVersion) return;
    adminState.promoError = getAdminErrorMessage(error?.message || "service_unavailable");
  } finally {
    if (loadVersion === adminState.loadVersion) {
      adminState.promoLoading = false;
      renderAdminUsers();
    }
  }
}

function adminRetryPromoUsers() {
  if (adminState.promoLoading) return;
  void adminLoadPromoUsers(adminState.loadVersion);
}

function renderAdminLoading() {
  const list = document.getElementById("adminUserList");
  if (list) list.innerHTML = '<div class="admin-loading">Caricamento...</div>';
}

function getFilteredAdminUsers() {
  const query = normalizeAdminSearch(adminState.query);
  const duplicates = getAdminDuplicatePhones();
  return adminState.users.filter(user => {
    const status = getAdminStatus(user);
    const phoneDigits = normalizeAdminSearch(user.phone);
    if (query && !phoneDigits.includes(query)) return false;
    if (adminState.tab === "promo") return isAdminPromoUser(user);
    if (adminState.tab === "expiring") return status.key === "expiring";
    if (adminState.tab === "expired") return status.key === "expired";
    if (adminState.tab === "duplicates") return duplicates.has(getAdminPhoneKey(user.phone));
    return true;
  });
}

function updateAdminStats() {
  const duplicates = getAdminDuplicatePhones();
  const totals = adminState.users.reduce((acc, user) => {
    const status = getAdminStatus(user);
    acc.total += 1;
    if (status.key === "active") acc.active += 1;
    if (status.key === "expiring") acc.expiring += 1;
    if (status.key === "expired") acc.expired += 1;
    return acc;
  }, { total: 0, active: 0, expiring: 0, expired: 0 });

  const map = {
    adminStatTotal: totals.total,
    adminStatActive: totals.active,
    adminStatExpiring: totals.expiring,
    adminStatExpired: totals.expired,
    adminStatDuplicates: duplicates.size
  };

  Object.entries(map).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  });
}

function renderAdminUserCard(user, duplicatePhones = getAdminDuplicatePhones()) {
  const status = getAdminStatus(user);
  const isPromo = isAdminPromoUser(user);
  const isDuplicate = duplicatePhones.has(getAdminPhoneKey(user.phone));
  const showRenew = isRenewActionVisible(user);
  const showSend = showRenew || isPromo;
  const daysText = status.days === null
    ? "senza scadenza"
    : status.days < 0
      ? `${Math.abs(status.days)} giorni fa`
      : `${status.days} giorni`;
  const deviceCount = [user.device1, user.device2].filter(Boolean).length;

  return `
    <article class="admin-user-card is-${status.key}${isPromo ? " is-promo" : ""}">
      <div class="admin-user-head">
        <div class="admin-phone">${escapeHtml(user.phone)}</div>
        <div class="admin-status">
          <span class="admin-status-dot"></span>
          <span>${escapeHtml(status.label)}</span>
        </div>
      </div>
      <div class="admin-meta">
        ${isPromo ? '<span class="admin-promo-badge">Promo 5 giorni</span>' : ''}
        <span>Scadenza: ${escapeHtml(formatAdminDate(user.expiry))}</span>
        <span>${escapeHtml(daysText)}</span>
        <span>Dispositivi: ${deviceCount}/2</span>
      </div>
      ${isDuplicate ? '<div class="admin-duplicate-note">Possibile duplicato: stesso numero presente piu volte.</div>' : ''}
      <div class="admin-card-actions">
        <button class="admin-action-btn" type="button" data-admin-action="edit" data-phone="${escapeHtml(user.phone)}" aria-label="Modifica">
          <img src="assets/admin/edit.png" alt="">
        </button>
        ${showRenew ? `<button class="admin-action-btn" type="button" data-admin-action="renew" data-phone="${escapeHtml(user.phone)}" aria-label="Rinnova">
          <img src="assets/admin/renew.png" alt="">
        </button>` : ''}
        ${showSend ? `<button class="admin-action-btn is-send${isPromo ? " is-promo-send" : ""}" type="button" data-admin-action="send" data-phone="${escapeHtml(user.phone)}" aria-label="${isPromo ? "Invia offerta promo su WhatsApp" : "Invia WhatsApp"}">Send</button>` : ''}
        <button class="admin-action-btn" type="button" data-admin-action="reset" data-phone="${escapeHtml(user.phone)}" aria-label="Reset dispositivi">
          <img src="assets/admin/reset.png" alt="">
        </button>
        <button class="admin-action-btn is-danger" type="button" data-admin-action="delete" data-phone="${escapeHtml(user.phone)}" aria-label="Elimina">
          <img src="assets/admin/trash.png" alt="">
        </button>
      </div>
    </article>
  `;
}

function renderAdminUsers() {
  updateAdminStats();
  const list = document.getElementById("adminUserList");
  if (!list) return;

  if (adminState.tab === "promo" && adminState.promoLoading) {
    list.innerHTML = `
      <div class="admin-promo-state is-loading" role="status">
        <span class="admin-promo-spinner" aria-hidden="true"></span>
        <strong>Caricamento utenti promo...</strong>
        <small>Sto leggendo i dati promozionali dal database.</small>
      </div>
    `;
    return;
  }

  if (adminState.tab === "promo" && adminState.promoError) {
    list.innerHTML = `
      <div class="admin-promo-state is-error" role="alert">
        <strong>Utenti promo non caricati</strong>
        <small>${escapeHtml(adminState.promoError)}</small>
        <button class="admin-promo-retry" type="button" onclick="adminRetryPromoUsers()">Riprova</button>
      </div>
    `;
    return;
  }

  const users = getFilteredAdminUsers();
  if (!users.length) {
    const emptyText = adminState.tab === "promo" ? "Nessun utente promo trovato." : "Nessun utente trovato.";
    list.innerHTML = `<div class="admin-empty">${emptyText}</div>`;
    return;
  }

  const duplicatePhones = getAdminDuplicatePhones();
  if (adminState.tab === "duplicates") {
    const groups = users.reduce((acc, user) => {
      const phone = getAdminPhoneKey(user.phone);
      if (!acc.has(phone)) acc.set(phone, []);
      acc.get(phone).push(user);
      return acc;
    }, new Map());

    list.innerHTML = Array.from(groups.entries()).map(([phone, group]) => `
      <section class="admin-duplicate-group">
        <div class="admin-duplicate-group-title">${escapeHtml(phone)} · ${group.length} record</div>
        <div class="admin-duplicate-cards">
          ${group.map(user => renderAdminUserCard(user, duplicatePhones)).join("")}
        </div>
      </section>
    `).join("");
    return;
  }

  list.innerHTML = users.map(user => renderAdminUserCard(user, duplicatePhones)).join("");
}

function adminOpenUserModal(mode, user = null) {
  if (!isCurrentSessionAdmin()) return;

  const modal = document.getElementById("adminUserModal");
  const title = document.getElementById("adminModalTitle");
  const modeInput = document.getElementById("adminModalMode");
  const originalPhone = document.getElementById("adminOriginalPhone");
  const bulkFields = document.getElementById("adminBulkFields");
  const phoneField = document.getElementById("adminPhoneField");
  const phone = document.getElementById("adminModalPhone");
  const expiry = document.getElementById("adminModalExpiry");
  const expiryLabel = document.querySelector("#adminExpiryField > span");
  const days = document.getElementById("adminModalDays");
  const daysField = document.getElementById("adminDaysField");
  const expiryField = document.getElementById("adminExpiryField");
  const renewModeField = document.getElementById("adminRenewModeField");
  const addMode = document.getElementById("adminRenewAddMode");
  const save = document.getElementById("adminModalSave");

  if (!modal || !modeInput || !phone || !expiry || !days) return;

  modeInput.value = mode;
  originalPhone.value = user?.phone || "";
  phone.value = user?.phone || "";
  phone.readOnly = mode === "renew";
  expiry.value = mode === "renew" ? "" : formatDateInput(user?.expiry);
  days.value = "90";

  bulkFields?.classList.toggle("hidden", mode !== "create");
  phoneField?.classList.toggle("hidden", mode === "create");
  daysField?.classList.toggle("hidden", mode === "edit" || mode === "create");
  expiryField?.classList.toggle("hidden", mode === "create");
  renewModeField?.classList.toggle("hidden", mode !== "renew");
  if (addMode) addMode.checked = true;
  if (expiryLabel) expiryLabel.textContent = mode === "renew" ? "Scadenza manuale opzionale" : "Scadenza";
  phone.disabled = mode === "create";
  expiry.disabled = mode === "create";
  days.disabled = mode === "create" || mode === "edit";

  if (mode === "create") resetAdminBulkFields();

  if (title) title.textContent = mode === "create" ? "+ Utenti Nuovi" : mode === "renew" ? "Rinnova utente" : "Modifica utente";
  if (save) save.textContent = mode === "create" ? "Aggiungi" : mode === "renew" ? "Rinnova" : "Salva";

  modal.classList.remove("hidden");
  const firstBulkPhone = document.querySelector(".admin-bulk-phone");
  setTimeout(() => (mode === "create" ? firstBulkPhone : phone)?.focus(), 40);
}

function adminCloseUserModal() {
  document.getElementById("adminUserModal")?.classList.add("hidden");
}

function resetAdminBulkFields() {
  document.querySelectorAll(".admin-bulk-row").forEach(row => {
    const phone = row.querySelector(".admin-bulk-phone");
    const days = row.querySelector(".admin-bulk-days");
    if (phone) phone.value = "";
    if (days) days.value = "90";
  });
}

function getAdminBulkEntries() {
  const rows = Array.from(document.querySelectorAll(".admin-bulk-row"));
  return rows.map(row => {
    const rawPhone = row.querySelector(".admin-bulk-phone")?.value || "";
    const phone = normalizePhone(rawPhone);
    const daysValue = Number(row.querySelector(".admin-bulk-days")?.value || 90);
    return {
      rawPhone,
      phone,
      days: Number.isFinite(daysValue) && daysValue > 0 ? Math.min(Math.floor(daysValue), 3650) : 90
    };
  }).filter(entry => String(entry.rawPhone || "").trim());
}

function getExistingAdminUser(phone) {
  const normalized = getAdminPhoneKey(phone);
  return adminState.users.find(user => getAdminPhoneKey(user.phone) === normalized) || null;
}

function setAdminTab(tabName) {
  adminState.tab = tabName;
  document.querySelectorAll(".admin-tab").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.adminTab === tabName);
  });
}

function showAdminDuplicateUsers(phones) {
  const uniquePhones = Array.from(new Set(phones.map(getAdminPhoneKey).filter(Boolean)));
  if (!uniquePhones.length) return;

  const search = document.getElementById("adminSearchInput");
  if (search) search.value = "";
  adminState.query = "";
  document.getElementById("adminSearchClear")?.classList.add("hidden");

  setAdminTab("users");
  const phoneSet = new Set(uniquePhones);
  const originalQuery = adminState.query;
  adminState.query = "";
  renderAdminUsers();

  const list = document.getElementById("adminUserList");
  if (!list) return;
  const duplicateUsers = adminState.users.filter(user => phoneSet.has(getAdminPhoneKey(user.phone)));
  if (!duplicateUsers.length) return;
  const oldUsers = adminState.users;
  adminState.users = duplicateUsers;
  renderAdminUsers();
  adminState.users = oldUsers;
  adminState.query = originalQuery;
}

async function adminSubmitUserModal() {
  const mode = document.getElementById("adminModalMode")?.value || "create";
  const originalPhone = normalizePhone(document.getElementById("adminOriginalPhone")?.value || "");
  const phone = normalizePhone(document.getElementById("adminModalPhone")?.value || "");
  const expiry = document.getElementById("adminModalExpiry")?.value || "";
  const days = Number(document.getElementById("adminModalDays")?.value || 0);
  const addMode = document.getElementById("adminRenewAddMode")?.checked;
  const save = document.getElementById("adminModalSave");

  if (!phone) {
    if (mode === "create") {
      await adminSubmitBulkCreate(save);
      return;
    }
    setAdminMessage("Inserisci un numero valido.", "error");
    return;
  }

  const originalText = save?.textContent || "Salva";
  if (save) {
    save.disabled = true;
    save.textContent = "Salvataggio...";
  }

  try {
    if (mode === "create") {
      await adminRequest("create", { phone, days: days || 90, expiry });
      setAdminMessage("Utente creato.", "success");
    } else if (mode === "edit") {
      await adminRequest("update", { phone: originalPhone, newPhone: phone, expiry });
      setAdminMessage("Utente aggiornato.", "success");
    } else {
      await adminRequest("renew", {
        phone: originalPhone || phone,
        days: days || 90,
        expiry,
        mode: addMode ? "add" : "set",
        accessSource: "paid"
      });
      setAdminMessage("Rinnovo completato.", "success");
    }

    adminCloseUserModal();
    await adminLoadUsers(true);
  } catch (err) {
    setAdminMessage(getAdminErrorMessage(err.message), "error");
  } finally {
    if (save) {
      save.disabled = false;
      save.textContent = originalText;
    }
  }
}

async function adminSubmitBulkCreate(save) {
  const entries = getAdminBulkEntries();
  if (!entries.length) {
    setAdminMessage("Inserisci almeno un numero.", "error");
    return;
  }

  const invalidEntries = entries.filter(entry => !isValidPhoneNumber(entry.phone));
  if (invalidEntries.length) {
    setAdminMessage("Uno o piu numeri non sono validi.", "error");
    return;
  }

  const seen = new Set();
  const duplicatedInBatch = [];
  const uniqueEntries = [];
  entries.forEach(entry => {
    if (seen.has(entry.phone)) {
      duplicatedInBatch.push(entry.phone);
      return;
    }
    seen.add(entry.phone);
    uniqueEntries.push(entry);
  });

  const existing = [];
  const toCreate = [];
  uniqueEntries.forEach(entry => {
    const existingUser = getExistingAdminUser(entry.phone);
    if (existingUser) existing.push(existingUser.phone);
    else toCreate.push(entry);
  });

  const originalText = save?.textContent || "Aggiungi";
  if (save) {
    save.disabled = true;
    save.textContent = "Aggiungo...";
  }

  const created = [];
  const failed = [];
  const backendDuplicates = [];

  try {
    for (const entry of toCreate) {
      try {
        await adminRequest("create", { phone: entry.phone, days: entry.days });
        created.push(entry.phone);
      } catch (err) {
        if (err.message === "duplicate") backendDuplicates.push(entry.phone);
        else failed.push({ phone: entry.phone, error: err.message });
      }
    }

    await adminLoadUsers(true);
    adminCloseUserModal();

    const allDuplicates = [...existing, ...duplicatedInBatch, ...backendDuplicates];
    const parts = [];
    if (created.length) parts.push(`${created.length} utenti aggiunti`);
    if (allDuplicates.length) parts.push(`${allDuplicates.length} gia esistenti`);
    if (failed.length) parts.push(`${failed.length} non aggiunti`);

    setAdminMessage(parts.join(", ") || "Nessun utente aggiunto.", failed.length ? "error" : "success");
    if (allDuplicates.length) showAdminDuplicateUsers(allDuplicates);
  } finally {
    if (save) {
      save.disabled = false;
      save.textContent = originalText;
    }
  }
}

function parseClipboardAdminEntries(text) {
  const lines = String(text || "")
    .split(/\r?\n|;/)
    .map(line => line.trim())
    .filter(Boolean);

  const entries = [];
  const sourceLines = lines.length ? lines : [String(text || "")];

  for (const line of sourceLines) {
    const phoneMatch = line.match(/(?:\+|00)?\d[\d\s().-]{7,}\d/);
    if (!phoneMatch) continue;

    const phone = normalizePhone(phoneMatch[0]);
    if (!phone || entries.some(entry => entry.phone === phone)) continue;

    const rest = line.replace(phoneMatch[0], " ");
    const dayMatch = rest.match(/\b([1-9]\d{0,3})\b/);
    const days = dayMatch ? Math.min(Number(dayMatch[1]), 3650) : 90;
    entries.push({ phone, days });
    if (entries.length >= 6) break;
  }

  return entries;
}

async function adminFillBulkFromClipboard() {
  if (!navigator.clipboard?.readText) {
    setAdminMessage("Clipboard non disponibile su questo browser.", "error");
    return;
  }

  try {
    const text = await navigator.clipboard.readText();
    const entries = parseClipboardAdminEntries(text);
    if (!entries.length) {
      setAdminMessage("Nessun numero valido trovato nella clipboard.", "error");
      return;
    }

    resetAdminBulkFields();
    const rows = Array.from(document.querySelectorAll(".admin-bulk-row"));
    entries.forEach((entry, index) => {
      const row = rows[index];
      if (!row) return;
      const phone = row.querySelector(".admin-bulk-phone");
      const days = row.querySelector(".admin-bulk-days");
      if (phone) phone.value = entry.phone;
      if (days) days.value = String(entry.days || 90);
    });

    setAdminMessage(`${entries.length} numeri caricati dalla clipboard.`, "success");
  } catch {
    setAdminMessage("Permesso clipboard negato o non disponibile.", "error");
  }
}

function getAdminWhatsAppText(user) {
  if (isAdminPromoUser(user)) return getPromoBanglaMessage();
  const status = getAdminStatus(user);
  if (status.key === "expired") return getExpiredBanglaMessage();
  return getExpiringBanglaMessage(Math.max(0, Number(status.days) || 0));
}

function adminOpenUserWhatsApp(user) {
  const phone = normalizePhone(user?.phone);
  if (!phone) {
    setAdminMessage("Numero utente non valido.", "error");
    return;
  }

  const url = `https://wa.me/${phone}?text=${encodeURIComponent(getAdminWhatsAppText(user))}`;
  openExternalUrl(url);
}

function adminOpenConfirm(action, user) {
  const modal = document.getElementById("adminConfirmModal");
  const title = document.getElementById("adminConfirmTitle");
  const text = document.getElementById("adminConfirmText");
  const button = document.getElementById("adminConfirmAction");
  if (!modal || !button || !user) return;

  adminState.confirm = { action, phone: user.phone };
  if (title) title.textContent = action === "delete" ? "Elimina utente" : "Reset dispositivi";
  if (text) {
    text.textContent = action === "delete"
      ? `Vuoi eliminare l'utente ${user.phone}?`
      : `Vuoi svuotare device1 e device2 per ${user.phone}?`;
  }
  button.textContent = action === "delete" ? "Elimina" : "Reset";
  button.onclick = adminRunConfirm;
  modal.classList.remove("hidden");
}

function adminCloseConfirm() {
  adminState.confirm = null;
  document.getElementById("adminConfirmModal")?.classList.add("hidden");
}

async function adminRunConfirm() {
  const confirm = adminState.confirm;
  const button = document.getElementById("adminConfirmAction");
  if (!confirm) return;

  const originalText = button?.textContent || "Conferma";
  if (button) {
    button.disabled = true;
    button.textContent = "Attendi...";
  }

  try {
    await adminRequest(confirm.action, { phone: confirm.phone });
    setAdminMessage(confirm.action === "delete" ? "Utente eliminato." : "Dispositivi resettati.", "success");
    adminCloseConfirm();
    await adminLoadUsers(true);
  } catch (err) {
    setAdminMessage(getAdminErrorMessage(err.message), "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

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
      openExternalUrl("https://api.whatsapp.com/send/?phone=393663584525&text&type=phone_number&app_absent=0");
    }
  });
}

/***********************
 * PWA INSTALL PROMPT
 ***********************/
(function initPwaInstallPrompt() {
  const INSTALLED_KEY = "magicbook_pwa_installed";
  const ACCEPTED_KEY = "magicbook_pwa_prompt_accepted";
  const SNOOZE_UNTIL_KEY = "magicbook_pwa_prompt_snooze_until";
  const DISMISS_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
  const promptEl = document.getElementById("installPrompt");
  const promptBtn = document.getElementById("installPromptBtn");
  const promptClose = document.getElementById("installPromptClose");
  const promptText = document.getElementById("installPromptText");
  let deferredInstallPrompt = null;

  function isStandalone() {
    return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
  }

  function markInstalled() {
    try {
      localStorage.setItem(INSTALLED_KEY, "1");
      localStorage.setItem(ACCEPTED_KEY, "1");
      localStorage.removeItem(SNOOZE_UNTIL_KEY);
    } catch {}
    hidePrompt();
  }

  function shouldSkipPrompt() {
    try {
      const snoozeUntil = Number(localStorage.getItem(SNOOZE_UNTIL_KEY) || 0);
      return localStorage.getItem(INSTALLED_KEY) === "1"
        || localStorage.getItem(ACCEPTED_KEY) === "1"
        || snoozeUntil > Date.now();
    } catch {
      return true;
    }
  }

  function showPrompt(mode = "browser") {
    if (!promptEl || shouldSkipPrompt() || isStandalone()) return;
    if (promptText) {
      promptText.textContent = mode === "ios"
        ? "Apri Condividi e scegli Aggiungi a Home."
        : "Aggiungi alla schermata Home.";
    }
    if (promptBtn) {
      promptBtn.textContent = "Aggiungi";
      promptBtn.dataset.mode = mode;
    }
    promptEl.classList.remove("hidden");
  }

  function hidePrompt() {
    promptEl?.classList.add("hidden");
  }

  if (isStandalone()) {
    markInstalled();
    return;
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
      .register("/service-worker.js?v=41-promo-single-use", { updateViaCache: "none" })
        .then(registration => registration.update())
        .catch(() => {});
    });
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    window.setTimeout(() => showPrompt("browser"), 900);
  });

  window.addEventListener("appinstalled", markInstalled);

  promptBtn?.addEventListener("click", async () => {
    try {
      localStorage.setItem(ACCEPTED_KEY, "1");
      localStorage.removeItem(SNOOZE_UNTIL_KEY);
    } catch {}

    if (promptBtn.dataset.mode === "ios") {
      hidePrompt();
      if (!isStandalone()) {
        openExternalUrl(window.location.href);
      }
      return;
    }

    if (!deferredInstallPrompt) {
      hidePrompt();
      return;
    }
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") markInstalled();
    deferredInstallPrompt = null;
    hidePrompt();
  });

  promptClose?.addEventListener("click", () => {
    try {
      localStorage.setItem(SNOOZE_UNTIL_KEY, String(Date.now() + DISMISS_SNOOZE_MS));
    } catch {}
    hidePrompt();
  });

  const isIosSafari = /iphone|ipad|ipod/i.test(navigator.userAgent)
    && !/crios|fxios|edgios/i.test(navigator.userAgent);
  if (isIosSafari) {
    window.setTimeout(() => showPrompt("ios"), 1200);
  }
})();
