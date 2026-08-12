import crypto from "crypto";
import { fetchUpstream, publicApiError } from "./upstream-fetch.mjs";
import {
  isMagicBookStorageConfigured,
  isMissingMagicBookObject,
  readMagicBookObject,
  setPrivateBookResponseHeaders
} from "./magicbook-storage.mjs";
import { watermarkMagicBookPage } from "./book-watermark.mjs";

const GOOGLE_SCRIPT_URL = process.env.GAS_ACCESS_URL;
const TOKEN = process.env.GAS_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;
const ADMIN_PHONE_NUMBERS = (process.env.ADMIN_PHONE_NUMBERS || "")
  .split(/[\s,;]+/)
  .map(normalizePhone)
  .filter(Boolean);
const SUPPORTED_BOOKS = new Set(["magic"]);
const MAX_MAGIC_BOOK_CHAPTER = 25;
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const MAX_REQUEST_BODY_BYTES = 16 * 1024;

function normalizePhone(input) {
  let phone = String(input || "").trim();
  phone = phone.replace(/\s+/g, "").replace(/^\+/, "").replace(/\D+/g, "");
  if (!phone) return "";
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (!phone.startsWith("39")) phone = "39" + phone;
  return phone;
}

export function getSessionRole(phone, tokenStatus, adminPhoneNumbers = ADMIN_PHONE_NUMBERS) {
  const normalizedPhone = normalizePhone(phone);
  const adminIsStillAllowed = adminPhoneNumbers
    .map(normalizePhone)
    .includes(normalizedPhone);
  const signedAdminProofMatchesPhone = tokenStatus?.signatureValid === true
    && tokenStatus?.payload?.role === "admin"
    && normalizePhone(tokenStatus?.payload?.phone) === normalizedPhone;

  // The access backend has just revalidated this phone and device before this
  // function is called. An expired token may therefore renew its admin role,
  // but only when its server signature is valid, it is bound to this phone,
  // and the phone remains in the server-side allow-list. Missing, forged and
  // user tokens always fail closed.
  return normalizedPhone && adminIsStillAllowed && signedAdminProofMatchesPhone
    ? "admin"
    : "user";
}

function buildMagicBookPath({ type, chapter, page }) {
  const pageNumber = String(page).padStart(4, "0");

  if (type === "exam") {
    return `books/magic-book/exam/exam_page-${pageNumber}.jpg`;
  }

  if (type === "chapter") {
    return `books/magic-book/cap${chapter}/magic book-${chapter}_page-${pageNumber}.jpg`;
  }

  return null;
}

async function validateAccess(phone, deviceId, options = {}) {
  if (!phone || !deviceId) return null;

  const authResponse = await fetchUpstream(GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      token: TOKEN,
      phone,
      deviceId,
      action: "validate",
      registerDevice: options.registerDevice === true
    })
  }, { service: "access_service", timeoutMs: 10_000 });

  let authData = null;
  try {
    authData = await authResponse.json();
  } catch (err) {
    authData = null;
  }

  if (!authResponse.ok && !authData) return null;

  const authStatus = authData?.status || authData?.error;

  if (authData?.success !== true && authStatus !== "success") {
    return {
      success: false,
      error: authStatus || "unauthorized"
    };
  }

  return authData;
}

function getAuthError(authData) {
  const error = authData?.error || authData?.status;
  const knownErrors = new Set([
    "expired",
    "not_found",
    "device_replaced",
    "device_mismatch",
    "device_limit",
    "busy",
    "temporary_error",
    "server_error"
  ]);

  return knownErrors.has(error) ? error : "unauthorized";
}

function getAuthStatusCode(error) {
  if (error === "busy" || error === "temporary_error" || error === "server_error") return 503;
  if (error === "device_replaced" || error === "device_mismatch" || error === "device_limit") return 403;
  return 401;
}

function isAuthSuccess(authData) {
  return authData?.success === true || authData?.status === "success";
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
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

function verifyAccessToken(token, phone, deviceId) {
  if (!token || !phone || !deviceId) return { ok: false, error: "unauthorized" };

  const serializedToken = String(token);
  if (serializedToken.length > 4096) return { ok: false, error: "unauthorized" };
  const parts = serializedToken.split(".");
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
    return { ok: false, error: "token_expired", signatureValid: true, payload };
  }

  return { ok: true, signatureValid: true, payload };
}

function getBearerToken(req) {
  const authorization = String(req.headers?.authorization || "").trim();
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  return match ? match[1] : "";
}

export default async function handler(req, res) {
  setPrivateBookResponseHeaders(res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (!isMagicBookStorageConfigured() || !GOOGLE_SCRIPT_URL || !TOKEN || !SESSION_SECRET) {
    return res.status(500).json({ error: "missing_server_config" });
  }

  try {
    const declaredLength = Number(req.headers?.["content-length"] || 0);
    if (declaredLength > MAX_REQUEST_BODY_BYTES) {
      return res.status(413).json({ error: "request_too_large" });
    }

    let body;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    } catch {
      return res.status(400).json({ error: "invalid_json" });
    }

    if (Buffer.byteLength(JSON.stringify(body)) > MAX_REQUEST_BODY_BYTES) {
      return res.status(413).json({ error: "request_too_large" });
    }
    const { action, book, type, chapter, page, registerDevice } = body;
    const accessToken = getBearerToken(req);
    const phone = normalizePhone(body.phone);
    const deviceId = String(body.deviceId || "").trim();
    const pageNumber = Number(page);
    const chapterNumber = chapter === undefined ? undefined : Number(chapter);

    if (action === "validate") {
      if (!/^[0-9]{6,15}$/.test(phone) || !/^[A-Za-z0-9_-]{8,128}$/.test(deviceId)) {
        return res.status(400).json({ error: "invalid_request" });
      }
      const authData = await validateAccess(phone, deviceId, {
        registerDevice: registerDevice === true
      });
      if (!isAuthSuccess(authData)) {
        const error = getAuthError(authData);
        return res.status(getAuthStatusCode(error)).json({ error });
      }

      const previousTokenStatus = verifyAccessToken(accessToken, phone, deviceId);
      const role = getSessionRole(phone, previousTokenStatus);
      const tokenData = createAccessToken(phone, deviceId, role);

      return res.status(200).json({
        success: true,
        phone,
        deviceId,
        role,
        expiry: authData.expiry,
        accessToken: tokenData.accessToken,
        accessTokenExpiresAt: tokenData.accessTokenExpiresAt,
        ...(authData.rotated ? { rotated: true } : {}),
        ...(authData.replacedDevice ? { replacedDevice: authData.replacedDevice } : {})
      });
    }

    if (!SUPPORTED_BOOKS.has(book)) {
      return res.status(400).json({ error: "invalid_book" });
    }

    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 10000) {
      return res.status(400).json({ error: "invalid_page" });
    }

    if (type === "chapter" && (!Number.isInteger(chapterNumber) || chapterNumber < 1 || chapterNumber > MAX_MAGIC_BOOK_CHAPTER)) {
      return res.status(400).json({ error: "invalid_chapter" });
    }

    if (!/^[0-9]{6,15}$/.test(phone) || !/^[A-Za-z0-9_-]{8,128}$/.test(deviceId)) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const tokenStatus = verifyAccessToken(accessToken, phone, deviceId);
    if (!tokenStatus.ok) {
      return res.status(401).json({ error: tokenStatus.error });
    }

    const path = buildMagicBookPath({
      type,
      chapter: chapterNumber,
      page: pageNumber
    });

    if (!path) {
      return res.status(400).json({ error: "invalid_type" });
    }

    let object;
    try {
      object = await readMagicBookObject(path);
    } catch (error) {
      if (isMissingMagicBookObject(error)) return res.status(404).json({ error: "not_found" });
      throw error;
    }

    res.setHeader("Content-Type", "image/jpeg");
    return res.send(await watermarkMagicBookPage(object.buffer));
  } catch (err) {
    const { statusCode, error: publicError } = publicApiError(err);
    if (statusCode === 503) res.setHeader("Retry-After", "5");
    return res.status(statusCode).json({ error: publicError });
  }
}
