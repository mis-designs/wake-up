import { isAllowedPromoHost, normalizePromoCode, PROMO_GRANT_DAYS } from "./promo-code.js";

const PROMO_CODE_5_DAYS = process.env.PROMO_CODE_5_DAYS || "";
const PROMO_CODE_5_DAYS_EXPIRES_AT = process.env.PROMO_CODE_5_DAYS_EXPIRES_AT || "";
const PROMO_ALLOWED_HOSTS = process.env.PROMO_ALLOWED_HOSTS || "";
const PROMO_MAX_CODE_VALIDITY_MS = (PROMO_GRANT_DAYS * 24 * 60 * 60 * 1000) + (10 * 60 * 1000);

export function getPublicPromoStatus({ configuredCode, expiresAt, now = Date.now() }) {
  const expiryMs = Date.parse(String(expiresAt || ""));
  const remainingMs = expiryMs - Number(now);
  const configured = normalizePromoCode(configuredCode).length >= 6;
  const active = configured
    && Number.isFinite(expiryMs)
    && remainingMs > 0
    && remainingMs <= PROMO_MAX_CODE_VALIDITY_MS;

  return {
    active,
    expiresAt: active ? new Date(expiryMs).toISOString() : null,
    grantDays: PROMO_GRANT_DAYS
  };
}

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Vary", "Host");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ active: false, error: "method_not_allowed" });
  }

  const hostAllowed = isAllowedPromoHost(
    req.headers?.host,
    PROMO_ALLOWED_HOSTS,
    process.env.VERCEL_ENV === "production"
  );
  if (!hostAllowed) {
    return res.status(403).json({ active: false, error: "promo_host_forbidden" });
  }

  return res.status(200).json(getPublicPromoStatus({
    configuredCode: PROMO_CODE_5_DAYS,
    expiresAt: PROMO_CODE_5_DAYS_EXPIRES_AT
  }));
}
