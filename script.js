/***********************
 * CONFIG
 ***********************/
// numero whatsapp per rinnovo
const RENEW_WHATSAPP_NUMBER = "393663584525";
const RENEW_MESSAGE = "Ciao, vorrei rinnovare il mio accesso.";
const WHATSAPP_GROUP_LINK = "https://chat.whatsapp.com/LBL1G7nvz2B3SThJj4uRxD";
const AUTH_API = "/api/auth";
const ADMIN_API = "/api/admin";

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
  renewPopupLastShown: "renewPopupLastShown"
};

const CLIENT_AUTH_RESET_VERSION = "2026-04-device-reset-1";
const CLIENT_AUTH_RESET_KEY = "client_auth_reset_version";
const ACCESS_TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const ACCESS_VALIDATION_INTERVAL_MS = 5 * 60 * 1000;
const OTP_COOLDOWN_SECONDS = 120;
let accessValidationTimer = null;
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
  setupProfileUI();
  setupAdminUI();

  if (wasReset) {
    showLoginScreen("Effettua nuovamente il login.");
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
    showHome();
    checkRenewReminder();
    startAccessValidationTimer();
    if (shouldRefreshAccessToken()) {
      validateRestoredSession(phone, deviceId);
    }
  } else {
    showLoginScreen("");
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
      return true;
    }

    return false;
  } catch (err) {
    console.warn("Access token refresh unavailable, keeping current session", err);
    return false;
  }
}

async function validateRestoredSession(phone, deviceId) {
  try {
    const data = await validateLoginAccess(phone, deviceId);
    const error = data?.error || data?.status;

    if (isRevokedSessionError(error)) {
      logout(true, error);
      return;
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
      checkRenewReminder();
      return;
    }

    console.warn("Auto-login validation inconclusive, keeping stored session", data);
  } catch (error) {
    console.warn("Auto-login validation unavailable, keeping stored session", error);
  }
}

async function validateLoginAccess(phone, deviceId, options = {}) {
  const response = await fetch("/api/getPages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

  const err = document.getElementById("err");
  if (err) err.textContent = "";
  pendingOtpLogin = null;
  hideAdminPasswordUI();
  hideOtpUI();
  showHome();
  startAccessValidationTimer();
  checkRenewReminder(true);
  maybeShowWhatsAppGroupPopup();
}

/***********************
 * LOGIN
 ***********************/
async function login() {
  const phoneInput = document.getElementById("user");
  const adminPasswordInput = document.getElementById("adminPassword");
  const err = document.getElementById("err");
  const loginButton = document.querySelector("#login .login-submit");

  const phone = normalizePhone(phoneInput?.value);

  if (!isValidPhoneNumber(phoneInput?.value)) {
    if (err) err.textContent = "Inserisci un numero di telefono valido";
    updateLoginButtonState();
    return;
  }

  const deviceId = await getRobustDeviceId();
  const originalText = loginButton?.dataset.defaultText || loginButton?.textContent || "Continua";

  if (loginButton) {
    loginButton.disabled = true;
    loginButton.classList.add("is-loading");
    loginButton.textContent = "Verifica...";
  }

  if (err) err.textContent = "Verifica in corso...";

  try {
    const data = await requestAuthAction({
      action: "login",
      phone,
      deviceId,
      adminPassword: adminPasswordRequired ? String(adminPasswordInput?.value || "") : undefined
    });

    if (!data?.success) {
      if ((data?.error || data?.status) === "admin_password_required") {
        showAdminPasswordUI();
        if (err) err.textContent = "Inserisci la password amministratore.";
        updateLoginButtonState();
        return;
      }

      if ((data?.error || data?.status) === "admin_password_invalid") {
        showAdminPasswordUI();
        if (adminPasswordInput) {
          adminPasswordInput.value = "";
          adminPasswordInput.focus();
        }
        if (err) err.textContent = "Password amministratore non corretta.";
        updateLoginButtonState();
        return;
      }

      if (err) err.textContent = getLoginErrorMessage(data?.error || data?.status);
      return;
    }

    completeLogin(phone, deviceId, data);
  } catch (error) {
    console.error("Login validation error", error);
    if (err) err.textContent = "Verifica non riuscita. Riprova tra poco.";
  } finally {
    if (loginButton) {
      loginButton.classList.remove("is-loading");
      loginButton.textContent = originalText;
    }
    updateLoginButtonState();
  }
}

function ensureAdminPasswordUI() {
  if (document.getElementById("adminPassword")) return;

  const phoneInput = document.getElementById("user");
  if (!phoneInput) return;

  const input = document.createElement("input");
  input.id = "adminPassword";
  input.className = "admin-password hidden";
  input.type = "password";
  input.placeholder = "Password amministratore";
  input.autocomplete = "current-password";
  input.setAttribute("aria-label", "Password amministratore");

  input.addEventListener("input", () => {
    const err = document.getElementById("err");
    if (err) err.textContent = "";
    updateLoginButtonState();
  });

  phoneInput.insertAdjacentElement("afterend", input);
}

function showAdminPasswordUI() {
  ensureAdminPasswordUI();
  adminPasswordRequired = true;
  const input = document.getElementById("adminPassword");
  input?.classList.remove("hidden");
  input?.focus();
}

function hideAdminPasswordUI() {
  adminPasswordRequired = false;
  const input = document.getElementById("adminPassword");
  if (!input) return;

  input.value = "";
  input.classList.add("hidden");
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
      deviceId: pendingOtpLogin.deviceId
    });

    if (data?.success) {
      completeLogin(pendingOtpLogin.phone, pendingOtpLogin.deviceId, data);
      return;
    }

    const error = data?.error || data?.status;
    if (error === "otp_required") {
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
  if (error === "otp_required") return "Accesso non disponibile. Riprova tra poco.";
  if (error === "admin_password_required") return "Inserisci la password amministratore.";
  if (error === "admin_password_invalid") return "Password amministratore non corretta.";
  if (error === "missing_admin_password_config") return "Password amministratore non configurata.";
  if (error === "expired") return "Accesso scaduto. Contatta il supporto per rinnovare.";
  if (error === "not_found") return "Numero non autorizzato.";
  if (error === "device_replaced") return "Questo dispositivo non è più autorizzato perché l’accesso è stato spostato su un altro dispositivo.";
  if (error === "device_mismatch") return "Questo dispositivo non è più autorizzato.";
  if (error === "otp_send_failed") return "Non siamo riusciti a inviare il codice OTP. Riprova più tardi.";
  if (error === "missing_twilio_config") return "Servizio OTP non configurato correttamente.";
  if (error === "temporary_error" || error === "server_error") return "Servizio momentaneamente non disponibile.";
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
}

function setupLoginUI() {
  ensureAdminPasswordUI();

  const phoneInput = document.getElementById("user");
  const loginButton = document.querySelector("#login .login-submit");
  const err = document.getElementById("err");

  if (loginButton && !loginButton.dataset.defaultText) {
    loginButton.dataset.defaultText = loginButton.textContent || "Continua";
  }

  phoneInput?.addEventListener("input", () => {
    hideAdminPasswordUI();
    if (err) err.textContent = "";
    updateLoginButtonState();
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
  } catch (err) {
    console.warn("Pulizia localStorage non disponibile");
  }

  Storage.remove(KEYS.session);
  Storage.remove(KEYS.legacySession);
}

function showLoginScreen(message = "") {
  hideAll();
  pendingOtpLogin = null;
  hideOtpUI();
  document.getElementById("login")?.classList.remove("hidden");
  const err = document.getElementById("err");
  if (err) err.textContent = message;
  updateProfileUI(false);
  setProfileIconVisible(false);
  setLoggedOutChrome();
  document.title = "MagicBook | Login";
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
  if (!profileBtn) return;

  const hasPhone = Boolean(getCurrentSessionPhone());
  profileBtn.classList.toggle("hidden", !visible || !hasPhone);
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
    window.location.href = "index.html";
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
  const groupCode = "LBL1G7nvz2B3SThJj4uRxD";
  const normalLink = "https://chat.whatsapp.com/" + groupCode;
  const isAndroid = /Android/i.test(navigator.userAgent);

  if (isAndroid) {
    const intentUrl =
      "intent://chat.whatsapp.com/" +
      groupCode +
      "#Intent;scheme=https;package=com.whatsapp;end";

    window.location.href = intentUrl;

    setTimeout(() => {
      window.open(normalLink, "_blank");
    }, 1200);

    return;
  }

  window.open(normalLink, "_blank");
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
      padding: 18px;
      background: rgba(6, 18, 20, 0.68);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      animation: whatsappGroupFadeIn 0.22s ease-out both;
    }
    #whatsappGroupPopupCard {
      position: relative;
      width: 100%;
      max-width: 420px;
      overflow: hidden;
      border-radius: 26px;
      background: linear-gradient(180deg, #ffffff 0%, #f7fffb 100%);
      box-shadow: 0 28px 80px rgba(0, 0, 0, 0.28);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      animation: whatsappGroupSlideUp 0.36s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .wgp-accent {
      height: 7px;
      background: linear-gradient(90deg, #16a34a 0%, #22c55e 48%, #86efac 100%);
    }
    .wgp-content {
      padding: 24px 20px 20px;
      text-align: center;
    }
    .wgp-lang {
      position: absolute;
      top: 14px;
      right: 14px;
      display: inline-flex;
      gap: 2px;
      padding: 2px;
      border-radius: 999px;
      background: #edfdf4;
      border: 1px solid #c7f5d8;
    }
    .wgp-lang button {
      min-width: 30px;
      height: 24px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: #12833d;
      font: 800 11px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      cursor: pointer;
    }
    .wgp-lang button.is-active {
      background: #16a34a;
      color: #ffffff;
      box-shadow: 0 6px 14px rgba(22, 163, 74, 0.25);
    }
    .wgp-icon {
      width: 70px;
      height: 70px;
      margin: 42px auto 16px;
      border-radius: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 30% 20%, #dcfce7 0%, #22c55e 62%, #128c45 100%);
      color: #ffffff;
      font-size: 36px;
      box-shadow: 0 18px 32px rgba(22, 163, 74, 0.28);
    }
    .wgp-icon img {
      width: 42px;
      height: 42px;
      object-fit: contain;
    }
    .wgp-title {
      margin: 0 6px 10px;
      color: #10251a;
      font-size: 23px;
      font-weight: 850;
      line-height: 1.22;
    }
    .wgp-message {
      margin: 0 auto 18px;
      max-width: 340px;
      color: #53615a;
      font-size: 15px;
      line-height: 1.55;
    }
    .wgp-actions {
      display: grid;
      gap: 10px;
      margin-top: 18px;
    }
    .wgp-primary,
    .wgp-secondary {
      min-height: 48px;
      border-radius: 15px;
      border: 0;
      font: 800 15px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      cursor: pointer;
      transition: transform 0.14s ease, box-shadow 0.14s ease, background 0.14s ease;
      -webkit-tap-highlight-color: transparent;
    }
    .wgp-primary {
      color: #ffffff;
      background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%);
      box-shadow: 0 13px 28px rgba(22, 163, 74, 0.26);
    }
    .wgp-secondary {
      color: #29543a;
      background: #eefaf3;
      border: 1px solid #d6f2df;
    }
    .wgp-primary:active,
    .wgp-secondary:active {
      transform: scale(0.985);
    }
    .wgp-note {
      margin: 13px 0 0;
      color: #789083;
      font-size: 12px;
      line-height: 1.4;
    }
    @media (max-width: 380px) {
      .wgp-content { padding: 22px 16px 18px; }
      .wgp-title { font-size: 20px; }
      .wgp-message { font-size: 14px; }
      .wgp-lang { top: 12px; right: 12px; }
      .wgp-lang button { min-width: 28px; height: 22px; font-size: 10px; }
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
  ["login", "home", "chapters", "viewer", "adminPanel"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
  document.body.classList.remove("admin-mode");
}

function showHome() {
  hideAll();
  document.getElementById("home")?.classList.remove("hidden");
  setChapterMode(false);
  document.body.classList.add("app-mode");
  showAppHeader("home");
  currentScreen = "home";
  updateProfileUI(true);
  setProfileIconVisible(true);
  setLoggedInChrome();
  document.title = "MagicBook | Home";
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
  updateProfileUI(true);
  setProfileIconVisible(false);
  document.title = "MagicBook | Capitoli";
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
    window.location.href = "quiz.html?mode=" + encodeURIComponent(mode);
  }, 460);
}

function startExamPdf() {
  closeExamModeScreen();
  setTimeout(() => {
    openMagicBookPages({ type: "exam" });
  }, 460);
}

function openChapter(cap) {
  openMagicBookPages({ type: "chapter", chapter: cap });
}

/***********************
 * APP HEADER & MENU
 ***********************/
let currentViewingChapter = null;
let currentScreen = "login"; // login | home | chapters | viewer | admin | exam | quizMode | examMode

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
const MAGIC_BOOK_API = "/api/getPages";
let currentBookViewer = {
  book: "magic",
  type: null,
  chapter: null,
  page: 0,
  isLoading: false,
  hasNext: false,
  userAdvanced: false,
  loaderInView: false
};
let magicBookViewerRequestId = 0;
let magicBookScrollHandlerInstalled = false;
let magicBookLoadObserver = null;

async function fetchMagicBookPage({ type, chapter, page }) {
  const body = {
    book: "magic",
    type,
    page,
    phone: getCurrentSessionPhone(),
    deviceId: getCurrentSessionDeviceId(),
    accessToken: getCurrentAccessToken()
  };

  if (type === "chapter") body.chapter = chapter;

  const response = await fetch(MAGIC_BOOK_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

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
        request: body
      });
    }
    return null;
  }

  if (response.status !== 200) {
    console.error("Failed to load page", {
      status: response.status,
      endpoint: MAGIC_BOOK_API,
      request: body
    });
    throw new Error(`Unable to load Magic Book page ${page}: ${response.status}`);
  }

  if (!contentType.toLowerCase().includes("image/jpeg")) {
    const text = await response.text();
    throw new Error(`Invalid Magic Book response type: ${contentType || "empty"} ${text.slice(0, 120)}`);
  }

  const blob = await response.blob();

  if (!blob || blob.size === 0) {
    throw new Error(`Empty Magic Book page ${page}`);
  }

  if (blob.type && blob.type !== "image/jpeg") {
    throw new Error(`Invalid Magic Book image type: ${blob.type}`);
  }

  return blob;
}

function cleanupMagicBookViewer({ resetState = true } = {}) {
  magicBookViewerRequestId++;
  magicBookLoadObserver?.disconnect();
  magicBookLoadObserver = null;

  const pages = document.getElementById("pages");
  if (pages) {
    pages.querySelectorAll("img[data-object-url]").forEach(img => {
      URL.revokeObjectURL(img.dataset.objectUrl);
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
      userAdvanced: false,
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
    existing?.remove();
    return;
  }

  if (existing) {
    existing.classList.toggle("is-active", active);
    return;
  }

  const loader = document.createElement("div");
  loader.className = "viewer-loading";
  loader.classList.toggle("is-active", active);
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-live", "polite");
  loader.addEventListener("click", () => {
    currentBookViewer.userAdvanced = true;
    checkMagicBookScrollLoad();
  });

  const img = document.createElement("img");
  img.src = "icons/loading.gif";
  img.alt = "";

  const text = document.createElement("span");
  text.textContent = "Caricamento...";

  loader.appendChild(img);
  loader.appendChild(text);
  pages.appendChild(loader);
}

function appendMagicBookPage(pages, blob) {
  const img = new Image();
  const url = URL.createObjectURL(blob);
  img.src = url;
  img.dataset.objectUrl = url;
  img.alt = "";
  img.draggable = false;

  const box = document.createElement("div");
  box.className = "page";

  const shield = document.createElement("div");
  shield.className = "shield";
  shield.oncontextmenu = e => e.preventDefault();

  box.appendChild(img);
  box.appendChild(shield);

  const loader = pages.querySelector(".viewer-loading");
  pages.insertBefore(box, loader || null);
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
  if (!currentBookViewer.userAdvanced) return;

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
    if (viewer.scrollTop > 24) currentBookViewer.userAdvanced = true;
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

    appendMagicBookPage(pages, blob);
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
    document.title = `MagicBook | Capitolo ${chapter}`;
  } else if (type === "exam") {
    currentScreen = "exam";
    setChapterMode(false);
    document.body.classList.add("app-mode");
    showAppHeader("exam");
    document.title = "MagicBook | Exam PDF";
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
    userAdvanced: false,
    loaderInView: false
  };

  pages.innerHTML = "";
  setMagicBookLoading(pages, true);

  const accessReady = await ensureAccessToken({ force: true });
  if (!accessReady) {
    currentBookViewer.hasNext = false;
    setMagicBookLoading(pages, false);
    showMagicBookError("Accesso non disponibile. Riprova tra poco.");
    return;
  }

  loadNextMagicBookPage();
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
 * ADMIN PANEL
 ***********************/
const ADMIN_EXPIRING_DAYS = 30;
const adminState = {
  users: [],
  tab: "users",
  query: "",
  loading: false,
  confirm: null
};

function getCurrentSessionRole() {
  const session = readStoredSession();
  return session?.role || "user";
}

function isCurrentSessionAdmin() {
  return getCurrentSessionRole() === "admin";
}

function updateAdminEntryVisibility() {
  const btn = document.getElementById("adminEntryBtn");
  if (!btn) return;
  btn.classList.toggle("hidden", !isCurrentSessionAdmin());
}

function getAdminStatus(user) {
  const expiry = user?.expiry ? new Date(user.expiry) : null;
  if (!expiry || isNaN(expiry.getTime())) {
    return { key: "no-expiry", label: "No expiry", days: null };
  }

  const days = Math.ceil((expiry.getTime() - Date.now()) / 86400000);
  if (days < 0) return { key: "expired", label: "Scaduto", days };
  if (days <= ADMIN_EXPIRING_DAYS) return { key: "expiring", label: "In scadenza", days };
  return { key: "active", label: "Attivo", days };
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
  return "Operazione non riuscita. Riprova.";
}

async function adminRequest(action, fields = {}, retry = true) {
  if (!isCurrentSessionAdmin()) throw new Error("admin_required");

  const hasToken = await ensureAccessToken({ force: !isAccessTokenUsable() });
  if (!hasToken && !getCurrentAccessToken()) throw new Error("unauthorized");

  const response = await fetch(ADMIN_API, {
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

  const data = await response.json().catch(() => null);
  if ((response.status === 401 || response.status === 403) && retry && data?.error === "token_expired") {
    await ensureAccessToken({ force: true });
    return adminRequest(action, fields, false);
  }

  if (!response.ok || !data?.success) {
    throw new Error(data?.error || "admin_error");
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
    });
  });

  const search = document.getElementById("adminSearchInput");
  search?.addEventListener("input", () => {
    adminState.query = search.value || "";
    renderAdminUsers();
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
  });

  document.getElementById("adminUserForm")?.addEventListener("submit", event => {
    event.preventDefault();
    adminSubmitUserModal();
  });
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
  document.title = "MagicBook | Admin";
  await adminLoadUsers();
}

async function adminLoadUsers(force = false) {
  if (!isCurrentSessionAdmin()) return;
  if (adminState.loading && !force) return;

  adminState.loading = true;
  renderAdminLoading();
  setAdminMessage("Caricamento utenti...");

  try {
    const data = await adminRequest("list");
    adminState.users = Array.isArray(data.list) ? data.list : [];
    setAdminMessage("Lista aggiornata.", "success");
    renderAdminUsers();
  } catch (err) {
    setAdminMessage(getAdminErrorMessage(err.message), "error");
    renderAdminUsers();
  } finally {
    adminState.loading = false;
  }
}

function renderAdminLoading() {
  const list = document.getElementById("adminUserList");
  if (list) list.innerHTML = '<div class="admin-loading">Caricamento...</div>';
}

function getFilteredAdminUsers() {
  const query = normalizePhone(adminState.query);
  return adminState.users.filter(user => {
    const status = getAdminStatus(user);
    if (query && !String(user.phone || "").includes(query)) return false;
    if (adminState.tab === "expiring") return status.key === "expiring";
    if (adminState.tab === "expired") return status.key === "expired";
    return true;
  });
}

function updateAdminStats() {
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
    adminStatExpired: totals.expired
  };

  Object.entries(map).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  });
}

function renderAdminUsers() {
  updateAdminStats();
  const list = document.getElementById("adminUserList");
  if (!list) return;

  const users = getFilteredAdminUsers();
  if (!users.length) {
    list.innerHTML = '<div class="admin-empty">Nessun utente trovato.</div>';
    return;
  }

  list.innerHTML = users.map(user => {
    const status = getAdminStatus(user);
    const daysText = status.days === null
      ? "senza scadenza"
      : status.days < 0
        ? `${Math.abs(status.days)} giorni fa`
        : `${status.days} giorni`;
    const deviceCount = [user.device1, user.device2].filter(Boolean).length;

    return `
      <article class="admin-user-card is-${status.key}">
        <div class="admin-user-head">
          <div class="admin-phone">${escapeHtml(user.phone)}</div>
          <div class="admin-status">
            <span class="admin-status-dot"></span>
            <span>${escapeHtml(status.label)}</span>
          </div>
        </div>
        <div class="admin-meta">
          <span>Scadenza: ${escapeHtml(formatAdminDate(user.expiry))}</span>
          <span>${escapeHtml(daysText)}</span>
          <span>Dispositivi: ${deviceCount}/2</span>
        </div>
        <div class="admin-card-actions">
          <button class="admin-action-btn" type="button" data-admin-action="edit" data-phone="${escapeHtml(user.phone)}" aria-label="Modifica">
            <img src="assets/admin/edit.png" alt="">
          </button>
          <button class="admin-action-btn" type="button" data-admin-action="renew" data-phone="${escapeHtml(user.phone)}" aria-label="Rinnova">
            <img src="assets/admin/renew.png" alt="">
          </button>
          <button class="admin-action-btn" type="button" data-admin-action="reset" data-phone="${escapeHtml(user.phone)}" aria-label="Reset dispositivi">
            <img src="assets/admin/reset.png" alt="">
          </button>
          <button class="admin-action-btn is-danger" type="button" data-admin-action="delete" data-phone="${escapeHtml(user.phone)}" aria-label="Elimina">
            <img src="assets/admin/trash.png" alt="">
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function adminOpenUserModal(mode, user = null) {
  if (!isCurrentSessionAdmin()) return;

  const modal = document.getElementById("adminUserModal");
  const title = document.getElementById("adminModalTitle");
  const modeInput = document.getElementById("adminModalMode");
  const originalPhone = document.getElementById("adminOriginalPhone");
  const phone = document.getElementById("adminModalPhone");
  const expiry = document.getElementById("adminModalExpiry");
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
  expiry.value = formatDateInput(user?.expiry);
  days.value = "90";

  daysField?.classList.toggle("hidden", mode === "edit");
  expiryField?.classList.toggle("hidden", false);
  renewModeField?.classList.toggle("hidden", mode !== "renew");
  if (addMode) addMode.checked = true;

  if (title) title.textContent = mode === "create" ? "Nuovo utente" : mode === "renew" ? "Rinnova utente" : "Modifica utente";
  if (save) save.textContent = mode === "create" ? "Crea" : mode === "renew" ? "Rinnova" : "Salva";

  modal.classList.remove("hidden");
  setTimeout(() => phone.focus(), 40);
}

function adminCloseUserModal() {
  document.getElementById("adminUserModal")?.classList.add("hidden");
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
      await adminRequest("renew", { phone: originalPhone || phone, days: days || 90, expiry, mode: addMode ? "add" : "set" });
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
 * CONTENT PROTECTION
 ***********************/
function isEditableTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
}

document.addEventListener("contextmenu", e => {
  if (!isEditableTarget(e.target)) e.preventDefault();
});

document.addEventListener("selectstart", e => {
  if (!isEditableTarget(e.target)) e.preventDefault();
});

document.addEventListener("dragstart", e => {
  if (!isEditableTarget(e.target)) e.preventDefault();
});

document.addEventListener("copy", e => {
  if (!isEditableTarget(e.target)) e.preventDefault();
});

document.addEventListener("keydown", e => {
  if (isEditableTarget(e.target)) return;

  if (e.ctrlKey && ["c", "u", "s", "a"].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }
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

/***********************
 * PWA INSTALL PROMPT
 ***********************/
(function initPwaInstallPrompt() {
  const INSTALLED_KEY = "magicbook_pwa_installed";
  const SESSION_DISMISSED_KEY = "magicbook_pwa_prompt_dismissed";
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
    } catch {}
    hidePrompt();
  }

  function shouldSkipPrompt() {
    try {
      return localStorage.getItem(INSTALLED_KEY) === "1" || sessionStorage.getItem(SESSION_DISMISSED_KEY) === "1";
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
      promptBtn.textContent = mode === "ios" ? "OK" : "Aggiungi";
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
      navigator.serviceWorker.register("/service-worker.js").catch(() => {});
    });
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    window.setTimeout(() => showPrompt("browser"), 900);
  });

  window.addEventListener("appinstalled", markInstalled);

  promptBtn?.addEventListener("click", async () => {
    if (promptBtn.dataset.mode === "ios") {
      try {
        sessionStorage.setItem(SESSION_DISMISSED_KEY, "1");
      } catch {}
      hidePrompt();
      return;
    }

    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") markInstalled();
    deferredInstallPrompt = null;
    hidePrompt();
  });

  promptClose?.addEventListener("click", () => {
    try {
      sessionStorage.setItem(SESSION_DISMISSED_KEY, "1");
    } catch {}
    hidePrompt();
  });

  const isIosSafari = /iphone|ipad|ipod/i.test(navigator.userAgent)
    && !/crios|fxios|edgios/i.test(navigator.userAgent);
  if (isIosSafari) {
    window.setTimeout(() => showPrompt("ios"), 1200);
  }
})();
