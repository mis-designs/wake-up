const BASE_URL = "https://pub-21131aa867534601af79c34beb746fb7.r2.dev";
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxOOQ-8FYN4qv0e5575rNyrvjTiZtEUmaNUj07KjBkjN1G9iCl0Ks4iWcSxthbuWh9h5A/exec";
const TOKEN = "Xk92!abC_2026_securePanel@#";
const SUPPORTED_BOOKS = new Set(["magic"]);

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

async function validateAccess(phone, deviceId) {
  if (!phone || !deviceId) return null;

  const authResponse = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      token: TOKEN,
      phone,
      deviceId,
      action: "validate"
    })
  });

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
  return error === "expired" || error === "not_found" ? error : "unauthorized";
}

function isAuthSuccess(authData) {
  return authData?.success === true || authData?.status === "success";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { action, book, type, chapter, page, phone, deviceId } = body;
    const pageNumber = Number(page);
    const chapterNumber = chapter === undefined ? undefined : Number(chapter);

    if (action === "validate") {
      const authData = await validateAccess(phone, deviceId);
      if (!isAuthSuccess(authData)) {
        return res.status(401).json({ error: getAuthError(authData) });
      }

      return res.status(200).json({
        success: true,
        phone,
        deviceId,
        expiry: authData.expiry
      });
    }

    if (!SUPPORTED_BOOKS.has(book)) {
      return res.status(400).json({ error: "invalid_book" });
    }

    if (!Number.isInteger(pageNumber) || !pageNumber || pageNumber < 1) {
      return res.status(400).json({ error: "invalid_page" });
    }

    if (type === "chapter" && (!Number.isInteger(chapterNumber) || !chapterNumber || chapterNumber < 1)) {
      return res.status(400).json({ error: "invalid_chapter" });
    }

    if (!phone || !deviceId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const authData = await validateAccess(phone, deviceId);
    if (!isAuthSuccess(authData)) {
      return res.status(401).json({ error: getAuthError(authData) });
    }

    const path = buildMagicBookPath({
      type,
      chapter: chapterNumber,
      page: pageNumber
    });

    if (!path) {
      return res.status(400).json({ error: "invalid_type" });
    }

    const url = new URL(path, `${BASE_URL}/`).toString();
    console.log(url);

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(404).json({ error: "not_found" });
    }

    const buffer = await response.arrayBuffer();

    if (!buffer || buffer.byteLength === 0) {
      return res.status(500).json({ error: "empty_file" });
    }

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    return res.send(Buffer.from(buffer));
  } catch (err) {
    return res.status(500).json({ error: "server_error" });
  }
}
