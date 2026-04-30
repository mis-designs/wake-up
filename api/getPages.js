const BASE_URL = process.env.R2_BASE_URL;
const GOOGLE_SCRIPT_URL = process.env.GAS_ACCESS_URL;
const TOKEN = process.env.GAS_SECRET;
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

async function validateAccess(phone, deviceId, options = {}) {
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
      action: "validate",
      registerDevice: options.registerDevice === true
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
  const knownErrors = new Set([
    "expired",
    "not_found",
    "device_replaced",
    "device_mismatch",
    "device_limit"
  ]);

  return knownErrors.has(error) ? error : "unauthorized";
}

function getAuthStatusCode(error) {
  if (error === "device_limit") return 403;
  return 401;
}

function isAuthSuccess(authData) {
  return authData?.success === true || authData?.status === "success";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (!BASE_URL || !GOOGLE_SCRIPT_URL || !TOKEN) {
    return res.status(500).json({ error: "missing_server_config" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { action, book, type, chapter, page, phone, deviceId, registerDevice } = body;
    const pageNumber = Number(page);
    const chapterNumber = chapter === undefined ? undefined : Number(chapter);

    if (action === "validate") {
      const authData = await validateAccess(phone, deviceId, {
        registerDevice: registerDevice === true
      });
      if (!isAuthSuccess(authData)) {
        const error = getAuthError(authData);
        return res.status(getAuthStatusCode(error)).json({ error });
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
      const error = getAuthError(authData);
      return res.status(getAuthStatusCode(error)).json({ error });
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
