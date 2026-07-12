import crypto from "crypto";

const SESSION_SECRET = process.env.SESSION_SECRET;
const TTL_MS = 36 * 60 * 60 * 1000;
export const GUEST_TRIAL_CHAPTERS = [2, 4];

function signature(encoded, secret = SESSION_SECRET) {
  return crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
}

export function createGuestTrialToken(trialId, secret = SESSION_SECRET) {
  const expiresAt = Date.now() + TTL_MS;
  const payload = { purpose: "guest_trial", trialId, chapters: GUEST_TRIAL_CHAPTERS, exp: expiresAt };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${encoded}.${signature(encoded, secret)}`, expiresAt };
}

export function verifyGuestTrialToken(token, trialId, secret = SESSION_SECRET) {
  if (!secret || !token || !trialId) return null;
  const parts = String(token).split(".");
  if (parts.length !== 2) return null;
  const [encoded, suppliedSignature] = parts;
  const expected = signature(encoded, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expected);
  if (supplied.length !== expectedBuffer.length || !crypto.timingSafeEqual(supplied, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload.purpose !== "guest_trial" || payload.trialId !== trialId || payload.exp <= Date.now()) return null;
    if (JSON.stringify(payload.chapters) !== JSON.stringify(GUEST_TRIAL_CHAPTERS)) return null;
    return payload;
  } catch { return null; }
}

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!SESSION_SECRET) return res.status(500).json({ error: "missing_server_config" });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const trialId = String(body.trialId || "");
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(trialId)) return res.status(400).json({ error: "invalid_trial" });
  const guest = createGuestTrialToken(trialId);
  return res.status(200).json({ guestKey: guest.token, expiresAt: guest.expiresAt, chapters: GUEST_TRIAL_CHAPTERS });
}
