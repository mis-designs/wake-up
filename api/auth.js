import crypto from "crypto";

const GAS_ACCESS_URL = process.env.GAS_ACCESS_URL;
const GAS_SECRET = process.env.GAS_SECRET;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;
const SESSION_SECRET = process.env.SESSION_SECRET;

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;

function isConfigured() {
  return GAS_ACCESS_URL &&
    GAS_SECRET &&
    TWILIO_ACCOUNT_SID &&
    TWILIO_AUTH_TOKEN &&
    TWILIO_VERIFY_SERVICE_SID &&
    SESSION_SECRET;
}

function normalizePhone(input) {
  let phone = String(input || "").trim();
  phone = phone.replace(/\s+/g, "").replace(/^\+/, "").replace(/\D+/g, "");
  if (!phone) return "";
  if (!phone.startsWith("39")) phone = "39" + phone;
  return phone;
}

function isValidPhone(phone) {
  return /^[0-9]{6,15}$/.test(phone);
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

async function callAccessBackend(action, phone, deviceId) {
  const response = await fetch(GAS_ACCESS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: GAS_SECRET,
      action,
      phone,
      deviceId
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
  const params = new URLSearchParams({
    To: `+${phone}`,
    Channel: "sms"
  });

  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(TWILIO_VERIFY_SERVICE_SID)}/Verifications`,
    {
      method: "POST",
      headers: {
        "Authorization": getTwilioAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params
    }
  );

  await readJsonResponse(response);
  return { ok: response.ok };
}

async function checkTwilioVerification(phone, code) {
  const params = new URLSearchParams({
    To: `+${phone}`,
    Code: code
  });

  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(TWILIO_VERIFY_SERVICE_SID)}/VerificationCheck`,
    {
      method: "POST",
      headers: {
        "Authorization": getTwilioAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params
    }
  );

  const data = await readJsonResponse(response);
  return {
    ok: response.ok,
    status: data?.status || null
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (!isConfigured()) {
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
      const authData = await callAccessBackend("login_check", phone, deviceId);

      if (isAuthSuccess(authData)) {
        return sendSuccessfulLogin(res, { phone, deviceId, authData });
      }

      const error = getAuthError(authData);
      if (error !== "otp_required") {
        return res.status(200).json({ success: false, error });
      }

      const verification = await startTwilioVerification(phone);
      if (!verification.ok) {
        return res.status(502).json({ success: false, error: "otp_send_failed" });
      }

      return res.status(200).json({
        success: false,
        error: "otp_required",
        phone,
        deviceId
      });
    }

    if (action === "verifyOtp") {
      const code = String(body.code || "").trim();
      if (!code) {
        return res.status(400).json({ success: false, error: "bad_otp" });
      }

      const verification = await checkTwilioVerification(phone, code);
      if (!verification.ok || verification.status !== "approved") {
        return res.status(200).json({ success: false, error: "invalid_otp" });
      }

      const authData = await callAccessBackend("confirm_device_rotation", phone, deviceId);
      if (!isAuthSuccess(authData)) {
        return res.status(200).json({ success: false, error: getAuthError(authData) });
      }

      return sendSuccessfulLogin(res, {
        phone,
        deviceId,
        authData,
        extra: {
          rotated: true,
          ...(authData.replacedDevice ? { replacedDevice: authData.replacedDevice } : {})
        }
      });
    }

    return res.status(400).json({ success: false, error: "invalid_action" });
  } catch {
    return res.status(500).json({ error: "server_error" });
  }
}
