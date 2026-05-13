import crypto from "crypto";

const GAS_ACCESS_URL = process.env.GAS_ACCESS_URL;
const GAS_SECRET = process.env.GAS_SECRET;
const GAS_ADMIN_KEY = process.env.GAS_ADMIN_KEY || process.env.ADMIN_KEY || "";
const SESSION_SECRET = process.env.SESSION_SECRET;

const ADMIN_ACTIONS = new Set([
  "list",
  "create",
  "update",
  "renew",
  "delete",
  "reset_devices",
  "search"
]);

function normalizePhone(input) {
  let phone = String(input || "").trim();
  phone = phone.replace(/\s+/g, "").replace(/^\+/, "").replace(/\D+/g, "");
  if (!phone) return "";
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (!phone.startsWith("39")) phone = "39" + phone;
  return phone;
}

function isValidPhone(phone) {
  return /^[0-9]{6,15}$/.test(phone);
}

function base64UrlDecode(value) {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function signTokenPayload(encodedPayload) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(encodedPayload).digest("base64url");
}

function verifyAdminToken(token, phone, deviceId) {
  if (!token || !phone || !deviceId) return { ok: false, error: "unauthorized" };

  const parts = String(token).split(".");
  if (parts.length !== 2) return { ok: false, error: "unauthorized" };

  const [encodedPayload, signature] = parts;
  const expectedSignature = signTokenPayload(encodedPayload);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { ok: false, error: "unauthorized" };
  }

  let payload = null;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return { ok: false, error: "unauthorized" };
  }

  if (payload.purpose !== "access" || payload.phone !== phone || payload.deviceId !== deviceId) {
    return { ok: false, error: "unauthorized" };
  }

  if (!payload.exp || payload.exp <= Date.now()) {
    return { ok: false, error: "token_expired" };
  }

  if (payload.role !== "admin") {
    return { ok: false, error: "admin_required" };
  }

  return { ok: true, payload };
}

function readAdminError(data) {
  return data?.error || data?.message || data?.status || "admin_backend_error";
}

async function callGasAdmin(action, fields = {}) {
  const response = await fetch(GAS_ACCESS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: GAS_SECRET,
      adminKey: GAS_ADMIN_KEY,
      action,
      ...fields
    })
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok && !data) return { success: false, error: "admin_backend_error" };
  return data || { success: false, error: "admin_backend_error" };
}

function getGasAction(action) {
  if (action === "list") return "admin_list";
  if (action === "create") return "admin_add";
  if (action === "update") return "admin_update";
  if (action === "renew") return "admin_renew";
  if (action === "delete") return "admin_remove";
  if (action === "reset_devices") return "admin_reset_devices";
  if (action === "search") return "admin_search";
  return "";
}

function sanitizeAdminFields(action, body) {
  const fields = {};
  const phone = normalizePhone(body.phone);
  const newPhone = normalizePhone(body.newPhone);
  const days = Number(body.days);
  const expiry = String(body.expiry || "").trim();
  const mode = String(body.mode || "").trim();

  if (["create", "update", "renew", "delete", "reset_devices", "search"].includes(action)) {
    if (!isValidPhone(phone)) return { error: "bad_phone" };
    fields.phone = phone;
  }

  if (action === "create" || action === "renew") {
    if (Number.isFinite(days) && days > 0) fields.days = Math.min(Math.floor(days), 3650);
    if (expiry) fields.expiry = expiry;
    if (mode === "add") fields.mode = "add";
  }

  if (action === "update") {
    if (newPhone) {
      if (!isValidPhone(newPhone)) return { error: "bad_new_phone" };
      fields.newPhone = newPhone;
    }
    if (expiry) fields.expiry = expiry;
  }

  return { fields };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  if (!GAS_ACCESS_URL || !GAS_SECRET || !GAS_ADMIN_KEY || !SESSION_SECRET) {
    return res.status(500).json({ success: false, error: "missing_server_config" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const action = String(body.action || "").trim();
    const sessionPhone = normalizePhone(body.sessionPhone || body.phone);
    const deviceId = String(body.deviceId || "").trim();
    const tokenStatus = verifyAdminToken(body.accessToken, sessionPhone, deviceId);

    if (!tokenStatus.ok) {
      return res.status(tokenStatus.error === "token_expired" ? 401 : 403).json({
        success: false,
        error: tokenStatus.error
      });
    }

    if (!ADMIN_ACTIONS.has(action)) {
      return res.status(400).json({ success: false, error: "bad_action" });
    }

    const sanitized = sanitizeAdminFields(action, body);
    if (sanitized.error) return res.status(400).json({ success: false, error: sanitized.error });

    const data = await callGasAdmin(getGasAction(action), sanitized.fields);
    if (data?.success !== true) {
      return res.status(200).json({ success: false, error: readAdminError(data), details: data || null });
    }

    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ success: false, error: "server_error" });
  }
}
