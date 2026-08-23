import crypto from "crypto";
import { fetchUpstream, publicApiError } from "./upstream-fetch.mjs";
import {
  createPromoCodeId,
  createPromoRedeemProof,
  isAllowedPromoHost,
  normalizePromoCode,
  PROMO_GRANT_DAYS,
  validatePromoCode
} from "./promo-code.js";

const GAS_ACCESS_URL = process.env.GAS_ACCESS_URL;
const GAS_SECRET = process.env.GAS_SECRET;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;
const SESSION_SECRET = process.env.SESSION_SECRET;
const ADMIN_LOGIN_PASSWORD = process.env.ADMIN_LOGIN_PASSWORD || "";
const PROMO_CODE_5_DAYS = process.env.PROMO_CODE_5_DAYS || "";
const PROMO_CODE_5_DAYS_EXPIRES_AT = process.env.PROMO_CODE_5_DAYS_EXPIRES_AT || "";
const PROMO_ALLOWED_HOSTS = process.env.PROMO_ALLOWED_HOSTS || "";

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const OTP_COOLDOWN_SECONDS = 120;
const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_MAX_FAILURES = 5;
const adminLoginFailures = new Map();
const USER_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const USER_LOGIN_MAX_FAILURES_PER_IP = 10;
const USER_LOGIN_MAX_FAILURES_PER_PHONE = 5;
const userLoginIpFailures = new Map();
const userLoginPhoneFailures = new Map();
const PROMO_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const PROMO_MAX_FAILURES_PER_IP = 10;
const PROMO_MAX_FAILURES_PER_PHONE = 5;
const promoIpFailures = new Map();
const promoPhoneFailures = new Map();

const PUBLIC_PROMO_REDEMPTION_ERRORS = new Set([
  "active_access",
  "busy",
  "device_reset_required",
  "promo_already_used",
  "promo_code_reused",
  "promo_expired",
  "promo_campaign_full",
  "promo_limit_reached",
  "request_expired",
  "request_replayed"
]);

const PROMO_BACKEND_SETUP_ERRORS = new Set([
  "auth_backend_error",
  "bad_action",
  "invalid_action",
  "invalid_request",
  "promo_user_columns_missing",
  "promo_users_sheet_missing",
  "sheet_missing",
  "unauthorized",
  "unknown_action",
  "unknown_admin_action"
]);

function getPublicPromoRedemptionError(error) {
  const normalized = String(error || "").trim().toLowerCase();
  if (PROMO_BACKEND_SETUP_ERRORS.has(normalized)) return "promo_backend_not_ready";
  if (PUBLIC_PROMO_REDEMPTION_ERRORS.has(normalized)) return normalized;
  return "temporary_error";
}

function getClientIp(req) {
  return String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim()
    .slice(0, 64);
}

function getAdminRateLimitKey(req, phone) {
  return `${getClientIp(req)}:${phone}`;
}

function getAdminLoginLimit(key) {
  const now = Date.now();
  const state = adminLoginFailures.get(key);
  if (!state || state.resetAt <= now) {
    adminLoginFailures.delete(key);
    return { blocked: false, retryAfter: 0 };
  }
  return {
    blocked: state.count >= ADMIN_LOGIN_MAX_FAILURES,
    retryAfter: Math.max(1, Math.ceil((state.resetAt - now) / 1000))
  };
}

function recordAdminLoginFailure(key) {
  const now = Date.now();
  const state = adminLoginFailures.get(key);
  if (!state || state.resetAt <= now) {
    if (adminLoginFailures.size >= 1000) {
      for (const [storedKey, storedState] of adminLoginFailures) {
        if (storedState.resetAt <= now) adminLoginFailures.delete(storedKey);
      }
      if (adminLoginFailures.size >= 1000) {
        adminLoginFailures.delete(adminLoginFailures.keys().next().value);
      }
    }
    adminLoginFailures.set(key, { count: 1, resetAt: now + ADMIN_LOGIN_WINDOW_MS });
    return;
  }
  state.count += 1;
}

function readFailureLimit(store, key, maxFailures) {
  const now = Date.now();
  const state = store.get(key);
  if (!state || state.resetAt <= now) {
    store.delete(key);
    return { blocked: false, retryAfter: 0 };
  }
  return {
    blocked: state.count >= maxFailures,
    retryAfter: Math.max(1, Math.ceil((state.resetAt - now) / 1000))
  };
}

function recordFailure(store, key, windowMs) {
  const now = Date.now();
  const state = store.get(key);
  if (state && state.resetAt > now) {
    state.count += 1;
    return;
  }

  if (store.size >= 5000) {
    for (const [storedKey, storedState] of store) {
      if (storedState.resetAt <= now) store.delete(storedKey);
    }
    if (store.size >= 5000) store.delete(store.keys().next().value);
  }
  store.set(key, { count: 1, resetAt: now + windowMs });
}

function getUserLoginLimit(req, phone) {
  const ipKey = getClientIp(req);
  const ipLimit = readFailureLimit(userLoginIpFailures, ipKey, USER_LOGIN_MAX_FAILURES_PER_IP);
  const phoneLimit = readFailureLimit(userLoginPhoneFailures, phone, USER_LOGIN_MAX_FAILURES_PER_PHONE);
  return {
    blocked: ipLimit.blocked || phoneLimit.blocked,
    retryAfter: Math.max(ipLimit.retryAfter, phoneLimit.retryAfter),
    ipKey
  };
}

function recordUserLoginFailure(ipKey, phone) {
  recordFailure(userLoginIpFailures, ipKey, USER_LOGIN_WINDOW_MS);
  recordFailure(userLoginPhoneFailures, phone, USER_LOGIN_WINDOW_MS);
}

function getPromoAttemptLimit(req, phone) {
  const ipKey = getClientIp(req);
  const ipLimit = readFailureLimit(promoIpFailures, ipKey, PROMO_MAX_FAILURES_PER_IP);
  const phoneLimit = readFailureLimit(promoPhoneFailures, phone, PROMO_MAX_FAILURES_PER_PHONE);
  return {
    blocked: ipLimit.blocked || phoneLimit.blocked,
    retryAfter: Math.max(ipLimit.retryAfter, phoneLimit.retryAfter),
    ipKey
  };
}

function recordPromoFailure(ipKey, phone) {
  recordFailure(promoIpFailures, ipKey, PROMO_ATTEMPT_WINDOW_MS);
  recordFailure(promoPhoneFailures, phone, PROMO_ATTEMPT_WINDOW_MS);
}

function shouldCountUserLoginFailure(error) {
  return !["busy", "temporary_error", "server_error", "service_unavailable", "auth_backend_error"].includes(error);
}

function hasCoreConfig() {
  return Boolean(GAS_ACCESS_URL && GAS_SECRET && SESSION_SECRET);
}

function hasTwilioConfig() {
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_VERIFY_SERVICE_SID);
}

function normalizePhone(input) {
  let phone = String(input || "").trim();
  phone = phone.replace(/\s+/g, "").replace(/^\+/, "").replace(/\D+/g, "");
  if (!phone) return "";
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (!phone.startsWith("39")) phone = "39" + phone;
  return phone;
}

const ADMIN_PHONE_NUMBERS = (process.env.ADMIN_PHONE_NUMBERS || "")
  .split(/[\s,;]+/)
  .map(normalizePhone)
  .filter(Boolean);

function isValidPhone(phone) {
  return /^[0-9]{6,15}$/.test(phone);
}

function isAdminPhone(phone) {
  return ADMIN_PHONE_NUMBERS.includes(normalizePhone(phone));
}

function safeCompare(value, expected) {
  const provided = Buffer.from(String(value || ""));
  const target = Buffer.from(String(expected || ""));

  if (!provided.length || !target.length || provided.length !== target.length) {
    return false;
  }

  return crypto.timingSafeEqual(provided, target);
}

function validateAdminLoginPassword(phone, password) {
  if (!isAdminPhone(phone)) return { ok: true, admin: false };

  if (!ADMIN_LOGIN_PASSWORD) {
    return { ok: false, admin: true, error: "missing_admin_password_config", statusCode: 500 };
  }

  if (!password) {
    return { ok: false, admin: true, error: "admin_password_required", statusCode: 200 };
  }

  if (!safeCompare(password, ADMIN_LOGIN_PASSWORD)) {
    return { ok: false, admin: true, error: "admin_password_invalid", statusCode: 200 };
  }

  return { ok: true, admin: true };
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function signTokenPayload(encodedPayload) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(encodedPayload).digest("base64url");
}

function createAccessToken(phone, deviceId, role = "user") {
  const accessTokenExpiresAt = Date.now() + ACCESS_TOKEN_TTL_MS;
  const payload = {
    phone,
    deviceId,
    role: role === "admin" ? "admin" : "user",
    purpose: "access",
    exp: accessTokenExpiresAt
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signTokenPayload(encodedPayload);

  return {
    accessToken: `${encodedPayload}.${signature}`,
    accessTokenExpiresAt
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isAuthSuccess(data) {
  return data?.success === true || data?.status === "success";
}

function getAuthError(data) {
  return data?.error || data?.status || "unauthorized";
}

function getPhoneLast4(phone) {
  return String(phone || "").slice(-4) || "unknown";
}

function formatPhoneForTwilio(phone) {
  const digits = String(phone || "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (digits.startsWith("39")) return "+" + digits;
  return "+39" + digits;
}

function logFormattedTwilioPhone(formattedPhone) {
  console.log("[twilio] formatted phone", {
    phoneLast4: formattedPhone.slice(-4),
    hasPlus: formattedPhone.startsWith("+"),
    length: formattedPhone.length
  });
}

function logAuthEvent({ action, phone, event, twilioStatus, twilioErrorCode }) {
  const parts = [
    "[api/auth]",
    `action=${action}`,
    `phoneLast4=${getPhoneLast4(phone)}`,
    `event=${event}`
  ];

  if (twilioStatus) parts.push(`twilioStatus=${twilioStatus}`);
  if (twilioErrorCode) parts.push(`twilioErrorCode=${twilioErrorCode}`);

  console.info(parts.join(" "));
}

async function callAccessBackend(action, phone, deviceId, extra = {}) {
  const response = await fetchUpstream(GAS_ACCESS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: GAS_SECRET,
      action,
      phone,
      deviceId,
      ...extra
    })
  }, { service: "access_service", timeoutMs: 10_000 });

  const data = await readJsonResponse(response);
  if (!response.ok && !data) return { success: false, error: "auth_backend_error" };
  return data || { success: false, error: "auth_backend_error" };
}

async function callPromoAccessBackend(action, phone, deviceId, extra = {}) {
  try {
    return await callAccessBackend(action, phone, deviceId, extra);
  } catch (error) {
    const { statusCode } = publicApiError(error);
    if (statusCode === 503) {
      return {
        success: false,
        error: "service_unavailable",
        retryable: true,
        retryAfterMs: 900
      };
    }
    throw error;
  }
}

function getTwilioAuthHeader() {
  const credentials = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  return `Basic ${credentials}`;
}

async function startTwilioVerification(phone) {
  const to = formatPhoneForTwilio(phone);
  const params = new URLSearchParams();
  params.append("To", to);
  params.append("Channel", "sms");

  logFormattedTwilioPhone(to);

  const response = await fetchUpstream(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(TWILIO_VERIFY_SERVICE_SID)}/Verifications`,
    {
      method: "POST",
      headers: {
        "Authorization": getTwilioAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    },
    { service: "twilio_verify", timeoutMs: 12_000 }
  );

  const data = await readJsonResponse(response) || {};
  console.log("[twilio] start verification result", {
    httpStatus: response.status,
    ok: response.ok,
    twilioStatus: data.status || null,
    twilioCode: data.code || null,
    twilioMessage: data.message || null
  });

  return {
    ok: response.ok,
    httpStatus: response.status,
    verifyStatus: data.status || null,
    errorCode: data.code || data.error_code || data.errorCode || null,
    message: data.message || null
  };
}

async function checkTwilioVerification(phone, code) {
  const to = formatPhoneForTwilio(phone);
  const params = new URLSearchParams();
  params.append("To", to);
  params.append("Code", code);

  logFormattedTwilioPhone(to);

  const response = await fetchUpstream(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(TWILIO_VERIFY_SERVICE_SID)}/VerificationCheck`,
    {
      method: "POST",
      headers: {
        "Authorization": getTwilioAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    },
    { service: "twilio_verify", timeoutMs: 12_000 }
  );

  const data = await readJsonResponse(response) || {};
  console.log("[twilio] check verification result", {
    httpStatus: response.status,
    twilioStatus: data.status || null,
    twilioCode: data.code || null
  });

  return {
    ok: response.ok,
    httpStatus: response.status,
    verifyStatus: data.status || null,
    errorCode: data.code || data.error_code || data.errorCode || null
  };
}

function sendSuccessfulLogin(res, { phone, deviceId, authData, role = "user", extra = {} }) {
  const safeRole = role === "admin" ? "admin" : "user";
  const tokenData = createAccessToken(phone, deviceId, safeRole);

  return res.status(200).json({
    success: true,
    phone,
    deviceId,
    role: safeRole,
    expiry: authData?.expiry,
    accessToken: tokenData.accessToken,
    accessTokenExpiresAt: tokenData.accessTokenExpiresAt,
    ...extra
  });
}

async function sendOtpForDevice({ res, phone, deviceId, action }) {
  const otpState = await callAccessBackend("otp_start", phone, deviceId);
  const retryAfterSeconds = Number(otpState?.retryAfterSeconds) || OTP_COOLDOWN_SECONDS;

  if (otpState?.otpAlreadySent) {
    logAuthEvent({ action, phone, event: "otp_skipped_cooldown" });
    return res.status(200).json({
      success: false,
      error: "otp_required",
      otpAlreadySent: true,
      retryAfterSeconds
    });
  }

  if (!otpState?.otpStartAllowed) {
    const error = getAuthError(otpState);
    logAuthEvent({ action, phone, event: `otp_not_started_${error}` });
    return res.status(200).json({
      success: false,
      error,
      ...(otpState?.retryAfterSeconds ? { retryAfterSeconds: otpState.retryAfterSeconds } : {})
    });
  }

  let verification;
  try {
    verification = await startTwilioVerification(phone);
  } catch {
    verification = {
      ok: false,
      httpStatus: null,
      verifyStatus: null,
      errorCode: "network_error",
      message: "Twilio send failed"
    };
  }

  if (!verification.ok) {
    logAuthEvent({
      action,
      phone,
      event: "otp_send_failed",
      twilioStatus: verification.httpStatus,
      twilioErrorCode: verification.errorCode
    });

    await callAccessBackend("otp_mark_failed", phone, deviceId);

    return res.status(502).json({
      success: false,
      error: "otp_send_failed",
      twilioStatus: verification.httpStatus,
      twilioErrorCode: verification.errorCode || null,
      twilioMessage: verification.message || "Twilio send failed"
    });
  }

  await callAccessBackend("otp_mark_sent", phone, deviceId);

  logAuthEvent({
    action,
    phone,
    event: "otp_sent",
    twilioStatus: verification.verifyStatus
  });

  return res.status(200).json({
    success: false,
    error: "otp_required",
    otpSent: true,
    retryAfterSeconds: OTP_COOLDOWN_SECONDS
  });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (!hasCoreConfig()) {
    return res.status(500).json({ error: "missing_server_config" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const action = String(body.action || "").trim();
    const phone = normalizePhone(body.phone);
    const deviceId = String(body.deviceId || "").trim();

    if (!action) {
      return res.status(400).json({ success: false, error: "missing_action" });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({ success: false, error: "bad_phone" });
    }

    if (!/^[A-Za-z0-9_-]{8,128}$/.test(deviceId)) {
      return res.status(400).json({ success: false, error: "bad_device" });
    }

    if (action === "login") {
      const userLimit = getUserLoginLimit(req, phone);
      if (userLimit.blocked) {
        res.setHeader("Retry-After", String(userLimit.retryAfter));
        return res.status(429).json({ success: false, error: "too_many_attempts" });
      }

      const adminRateLimitKey = getAdminRateLimitKey(req, phone);
      if (isAdminPhone(phone)) {
        const limit = getAdminLoginLimit(adminRateLimitKey);
        if (limit.blocked) {
          res.setHeader("Retry-After", String(limit.retryAfter));
          return res.status(429).json({ success: false, error: "too_many_attempts" });
        }
      }

      const adminPasswordCheck = validateAdminLoginPassword(phone, body.adminPassword);
      if (!adminPasswordCheck.ok) {
        if (adminPasswordCheck.admin && adminPasswordCheck.error === "admin_password_invalid") {
          recordAdminLoginFailure(adminRateLimitKey);
        }
        return res.status(adminPasswordCheck.statusCode || 200).json({
          success: false,
          error: adminPasswordCheck.error
        });
      }

      const submittedPromoCode = normalizePromoCode(body.promoCode);
      let authData;
      let promoExtra = {};

      if (submittedPromoCode) {
        const promoLimit = getPromoAttemptLimit(req, phone);
        if (promoLimit.blocked) {
          res.setHeader("Retry-After", String(promoLimit.retryAfter));
          return res.status(429).json({ success: false, error: "too_many_attempts" });
        }

        const hostAllowed = isAllowedPromoHost(
          req.headers?.host,
          PROMO_ALLOWED_HOSTS,
          process.env.VERCEL_ENV === "production"
        );
        if (!hostAllowed) {
          return res.status(403).json({ success: false, error: "promo_host_forbidden" });
        }

        if (submittedPromoCode.length > 64) {
          recordPromoFailure(promoLimit.ipKey, phone);
          return res.status(200).json({ success: false, error: "promo_invalid" });
        }

        const promoValidation = validatePromoCode({
          submittedCode: submittedPromoCode,
          configuredCode: PROMO_CODE_5_DAYS,
          expiresAt: PROMO_CODE_5_DAYS_EXPIRES_AT
        });
        if (!promoValidation.ok) {
          if (promoValidation.error === "promo_invalid") recordPromoFailure(promoLimit.ipKey, phone);
          return res.status(200).json({
            success: false,
            error: promoValidation.error
          });
        }

        const promoCodeId = createPromoCodeId(PROMO_CODE_5_DAYS, SESSION_SECRET);
        const proof = createPromoRedeemProof({
          phone,
          deviceId,
          promoCodeId,
          promoValidUntil: promoValidation.expiresAt,
          secret: GAS_SECRET
        });
        const promoData = await callPromoAccessBackend("promo_redeem", phone, deviceId, {
          promoCodeId,
          promoValidUntil: promoValidation.expiresAt,
          ...proof
        });
        const promoError = getAuthError(promoData);

        if (isAuthSuccess(promoData)) {
          promoPhoneFailures.delete(phone);
          authData = promoData;
          promoExtra = {
            promoGranted: true,
            promoDaysUsed: Math.min(PROMO_GRANT_DAYS, Number(promoData.promoDaysUsed) || 0),
            promoRedemptions: Math.min(1, Number(promoData.promoRedemptions) || 0)
          };
        } else if (promoError === "active_access") {
          authData = await callPromoAccessBackend("login", phone, deviceId, { registerDevice: true });
          promoExtra = { promoNotice: "access_already_active" };
        } else {
          const publicPromoError = getPublicPromoRedemptionError(promoError);
          const retryable = ["temporary_error", "busy"].includes(publicPromoError);
          return res.status(200).json({
            success: false,
            error: publicPromoError,
            ...(retryable ? { retryable: true, retryAfterMs: Number(promoData?.retryAfterMs) || 900 } : {})
          });
        }
      } else {
        authData = await callAccessBackend("login", phone, deviceId, {
          registerDevice: true
        });
      }

      if (isAuthSuccess(authData)) {
        userLoginPhoneFailures.delete(phone);
        if (adminPasswordCheck.admin) adminLoginFailures.delete(adminRateLimitKey);
        return sendSuccessfulLogin(res, {
          phone,
          deviceId,
          authData,
          role: adminPasswordCheck.admin ? "admin" : "user",
          extra: {
            ...(authData.rotated ? { rotated: true } : {}),
            ...(authData.replacedDevice ? { replacedDevice: authData.replacedDevice } : {}),
            ...promoExtra
          }
        });
      }

      if (getAuthError(authData) === "otp_required") {
        // This installation has no OTP provider. Never rotate a registered
        // device automatically: an administrator must reset it explicitly.
        return res.status(403).json({ success: false, error: "device_reset_required" });
      }

      const authError = getAuthError(authData);
      if (shouldCountUserLoginFailure(authError)) {
        recordUserLoginFailure(userLimit.ipKey, phone);
      }
      return res.status(200).json({ success: false, error: authError });
    }

    if (action === "resendOtp") {
      return res.status(400).json({ success: false, error: "otp_disabled" });
    }

    if (action === "verifyOtp") {
      return res.status(400).json({ success: false, error: "otp_disabled" });
    }

    return res.status(400).json({ success: false, error: "invalid_action" });
  } catch (error) {
    const { statusCode, error: publicError } = publicApiError(error);
    if (statusCode === 503) res.setHeader("Retry-After", "5");
    return res.status(statusCode).json({ error: publicError });
  }
}
