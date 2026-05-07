import crypto from "crypto";

const GAS_ACCESS_URL = process.env.GAS_ACCESS_URL;
const GAS_SECRET = process.env.GAS_SECRET;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;
const SESSION_SECRET = process.env.SESSION_SECRET;
const ADMIN_LOGIN_PASSWORD = process.env.ADMIN_LOGIN_PASSWORD || "";

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const OTP_COOLDOWN_SECONDS = 120;

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
  .split(",")
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

function createAccessToken(phone, deviceId) {
  const accessTokenExpiresAt = Date.now() + ACCESS_TOKEN_TTL_MS;
  const payload = {
    phone,
    deviceId,
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
  const response = await fetch(GAS_ACCESS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: GAS_SECRET,
      action,
      phone,
      deviceId,
      ...extra
    })
  });

  const data = await readJsonResponse(response);
  if (!response.ok && !data) return { success: false, error: "auth_backend_error" };
  return data || { success: false, error: "auth_backend_error" };
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

  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(TWILIO_VERIFY_SERVICE_SID)}/Verifications`,
    {
      method: "POST",
      headers: {
        "Authorization": getTwilioAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    }
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

  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(TWILIO_VERIFY_SERVICE_SID)}/VerificationCheck`,
    {
      method: "POST",
      headers: {
        "Authorization": getTwilioAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    }
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

function sendSuccessfulLogin(res, { phone, deviceId, authData, extra = {} }) {
  const tokenData = createAccessToken(phone, deviceId);

  return res.status(200).json({
    success: true,
    phone,
    deviceId,
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
  if (req.method !== "POST") {
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

    if (!deviceId) {
      return res.status(400).json({ success: false, error: "bad_device" });
    }

    if (action === "login") {
      const adminPasswordCheck = validateAdminLoginPassword(phone, body.adminPassword);
      if (!adminPasswordCheck.ok) {
        return res.status(adminPasswordCheck.statusCode || 200).json({
          success: false,
          error: adminPasswordCheck.error
        });
      }

      const authData = await callAccessBackend("login", phone, deviceId, {
        registerDevice: true
      });

      if (isAuthSuccess(authData)) {
        return sendSuccessfulLogin(res, {
          phone,
          deviceId,
          authData,
          extra: {
            ...(authData.rotated ? { rotated: true } : {}),
            ...(authData.replacedDevice ? { replacedDevice: authData.replacedDevice } : {})
          }
        });
      }

      if (getAuthError(authData) === "otp_required") {
        const rotationData = await callAccessBackend("confirm_device_rotation", phone, deviceId);

        if (isAuthSuccess(rotationData)) {
          return sendSuccessfulLogin(res, {
            phone,
            deviceId,
            authData: rotationData,
            extra: {
              ...(rotationData.rotated ? { rotated: true } : {}),
              ...(rotationData.replacedDevice ? { replacedDevice: rotationData.replacedDevice } : {})
            }
          });
        }

        return res.status(200).json({ success: false, error: getAuthError(rotationData) });
      }

      return res.status(200).json({ success: false, error: getAuthError(authData) });
    }

    if (action === "resendOtp") {
      return res.status(400).json({ success: false, error: "otp_disabled" });
    }

    if (action === "verifyOtp") {
      return res.status(400).json({ success: false, error: "otp_disabled" });
    }

    return res.status(400).json({ success: false, error: "invalid_action" });
  } catch {
    return res.status(500).json({ error: "server_error" });
  }
}
