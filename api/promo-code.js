import crypto from "crypto";

export const PROMO_GRANT_DAYS = 5;
const PROMO_MAX_CODE_VALIDITY_MS = (5 * 24 * 60 * 60 * 1000) + (10 * 60 * 1000);

export function normalizePromoCode(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest();
}

export function validatePromoCode({ submittedCode, configuredCode, expiresAt, now = Date.now() }) {
  const expected = normalizePromoCode(configuredCode);
  const supplied = normalizePromoCode(submittedCode);
  const expiryMs = Date.parse(String(expiresAt || ""));

  if (expected.length < 6 || !Number.isFinite(expiryMs)) {
    return { ok: false, error: "promo_unavailable" };
  }
  if (expiryMs <= Number(now)) {
    return { ok: false, error: "promo_expired" };
  }
  if (expiryMs - Number(now) > PROMO_MAX_CODE_VALIDITY_MS) {
    return { ok: false, error: "promo_unavailable" };
  }
  if (!supplied || !crypto.timingSafeEqual(sha256(supplied), sha256(expected))) {
    return { ok: false, error: "promo_invalid" };
  }

  return { ok: true, expiresAt: new Date(expiryMs).toISOString() };
}

export function createPromoCodeId(code, secret) {
  if (!secret) throw new Error("missing_promo_signing_secret");
  return crypto.createHmac("sha256", secret)
    .update(`promo-code:${normalizePromoCode(code)}`)
    .digest("hex");
}

export function createPromoRedeemProof({ phone, deviceId, promoCodeId, promoValidUntil, secret, now = Date.now(), nonce }) {
  if (!secret) throw new Error("missing_promo_signing_secret");
  const timestamp = String(Math.floor(Number(now)));
  const safeNonce = nonce || crypto.randomBytes(18).toString("base64url");
  const canonical = [timestamp, safeNonce, phone, deviceId, promoCodeId, promoValidUntil].join("\n");
  const promoSignature = crypto.createHmac("sha256", secret).update(canonical).digest("hex");
  return { promoTimestamp: timestamp, promoNonce: safeNonce, promoSignature };
}

export function isAllowedPromoHost(host, allowedHosts, isProduction = false) {
  if (!isProduction) return true;
  const normalizedHost = String(host || "").trim().toLowerCase().replace(/:\d+$/, "");
  const allowed = String(allowedHosts || "")
    .split(/[\s,;]+/)
    .map(value => value.trim().toLowerCase().replace(/:\d+$/, ""))
    .filter(Boolean);
  return Boolean(normalizedHost && allowed.includes(normalizedHost));
}
