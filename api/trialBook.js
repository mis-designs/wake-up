import { GUEST_TRIAL_CHAPTERS, GUEST_TRIAL_ENABLED, verifyGuestTrialToken } from "./trialAccess.js";
import { publicApiError } from "./upstream-fetch.mjs";
import {
  isMagicBookStorageConfigured,
  isMissingMagicBookObject,
  readMagicBookObject,
  setPrivateBookResponseHeaders
} from "./magicbook-storage.mjs";
import { watermarkMagicBookPage } from "./book-watermark.mjs";

export const TRIAL_BOOK_CHAPTERS = new Set(GUEST_TRIAL_CHAPTERS.map(String));
const MAX_REQUEST_BODY_BYTES = 8 * 1024;

export function isAllowedTrialBookRequest(chapter, page) {
  const normalizedChapter = String(chapter || "").trim();
  const normalizedPage = Number(page);
  return TRIAL_BOOK_CHAPTERS.has(normalizedChapter)
    && Number.isInteger(normalizedPage)
    && normalizedPage >= 1
    && normalizedPage <= 10000;
}

export default async function handler(req, res) {
  setPrivateBookResponseHeaders(res);
  if (!GUEST_TRIAL_ENABLED) return res.status(410).json({ error: "guest_trial_disabled" });
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!isMagicBookStorageConfigured()) return res.status(500).json({ error: "missing_server_config" });
  const declaredLength = Number(req.headers?.["content-length"] || 0);
  if (declaredLength > MAX_REQUEST_BODY_BYTES) return res.status(413).json({ error: "request_too_large" });
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    return res.status(400).json({ error: "invalid_json" });
  }
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_REQUEST_BODY_BYTES) {
    return res.status(413).json({ error: "request_too_large" });
  }
  const chapter = String(body.chapter || "").trim();
  const page = Number(body.page);
  const trialId = String(body.trialId || "");
  const guest = verifyGuestTrialToken(body.guestKey, trialId);
  if (!guest || !guest.chapters.includes(Number(chapter))) return res.status(401).json({ error: "invalid_guest_key" });
  if (!isAllowedTrialBookRequest(chapter, page)) return res.status(403).json({ error: "trial_book_forbidden" });

  try {
    const pageNumber = String(page).padStart(4, "0");
    const path = `books/magic-book/cap${chapter}/magic book-${chapter}_page-${pageNumber}.jpg`;
    let object;
    try {
      object = await readMagicBookObject(path);
    } catch (error) {
      if (isMissingMagicBookObject(error)) return res.status(404).json({ error: "not_found" });
      throw error;
    }
    res.setHeader("Content-Type", "image/jpeg");
    return res.send(await watermarkMagicBookPage(object.buffer));
  } catch (error) {
    const { statusCode, error: publicError } = publicApiError(error);
    if (statusCode === 503) res.setHeader("Retry-After", "5");
    return res.status(statusCode).json({ error: publicError });
  }
}
