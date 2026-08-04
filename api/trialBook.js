import { verifyGuestTrialToken } from "./trialAccess.js";
import { fetchUpstream } from "./upstream-fetch.mjs";

const BASE_URL = process.env.R2_BASE_URL;
export const TRIAL_BOOK_CHAPTERS = new Set(["2", "4"]);

export function isAllowedTrialBookRequest(chapter, page) {
  const normalizedChapter = String(chapter || "").trim();
  const normalizedPage = Number(page);
  return TRIAL_BOOK_CHAPTERS.has(normalizedChapter)
    && Number.isInteger(normalizedPage)
    && normalizedPage >= 1
    && normalizedPage <= 10000;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
  if (!BASE_URL) return res.status(500).json({ error: "missing_server_config" });
  const chapter = String(req.query?.chapter || "").trim();
  const page = Number(req.query?.page);
  const trialId = String(req.query?.trialId || "");
  const guest = verifyGuestTrialToken(req.query?.guestKey, trialId);
  if (!guest || !guest.chapters.includes(Number(chapter))) return res.status(401).json({ error: "invalid_guest_key" });
  if (!isAllowedTrialBookRequest(chapter, page)) return res.status(403).json({ error: "trial_book_forbidden" });

  try {
    const pageNumber = String(page).padStart(4, "0");
    const path = `books/magic-book/cap${chapter}/magic book-${chapter}_page-${pageNumber}.jpg`;
    const response = await fetchUpstream(
      new URL(path, `${BASE_URL}/`).toString(),
      {},
      { service: "trial_book_storage", timeoutMs: 12_000 }
    );
    if (!response.ok) return res.status(404).json({ error: "not_found" });
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) return res.status(500).json({ error: "empty_file" });
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.send(Buffer.from(buffer));
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    if (statusCode === 503) res.setHeader("Retry-After", "5");
    return res.status(statusCode).json({ error: error?.message || "server_error" });
  }
}
