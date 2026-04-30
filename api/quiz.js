const ACCESS_GAS_URL = process.env.GAS_ACCESS_URL;
const ACCESS_GAS_SECRET = process.env.GAS_SECRET;
const QUIZ_GAS_URL = process.env.QUIZ_GAS_URL;
const QUIZ_PROXY_SECRET = process.env.QUIZ_PROXY_SECRET;

const GET_ACTIONS = new Set(["getQuiz", "getItalianAudio", "getBengaliAudio", "getTTS"]);

function isConfigured() {
  return ACCESS_GAS_URL && ACCESS_GAS_SECRET && QUIZ_GAS_URL && QUIZ_PROXY_SECRET;
}

function getAuthError(authData) {
  const error = authData?.error || authData?.status;
  if (["expired", "not_found", "device_limit"].includes(error)) return error;
  return "unauthorized";
}

function getAuthStatusCode(error) {
  if (error === "device_limit") return 403;
  return 401;
}

function isAuthSuccess(authData) {
  return authData?.success === true || authData?.status === "success";
}

async function validateAccess(phone, deviceId) {
  if (!phone || !deviceId) return { success: false, error: "unauthorized" };

  const response = await fetch(ACCESS_GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: ACCESS_GAS_SECRET,
      action: "validate",
      phone,
      deviceId,
      registerDevice: false
    })
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok && !data) return { success: false, error: "unauthorized" };
  return data || { success: false, error: "unauthorized" };
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { error: "invalid_quiz_response" };
  }
}

function getRequestData(req) {
  const query = req.query || {};
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  return {
    action: body.action || query.action,
    phone: body.phone || query.phone,
    deviceId: body.deviceId || query.deviceId,
    chapters: body.chapters || query.chapters,
    text: body.text || query.text,
    answers: body.answers
  };
}

async function forwardGetAction({ action, chapters, text }) {
  const params = new URLSearchParams({
    action,
    token: QUIZ_PROXY_SECRET
  });

  if (chapters) params.set("chapters", chapters);
  if (text) params.set("text", text);

  const url = `${QUIZ_GAS_URL}?${params.toString()}`;
  const response = await fetch(url);
  return readJsonResponse(response);
}

async function forwardCheckQuiz(answers) {
  const url = `${QUIZ_GAS_URL}?action=checkQuiz`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: QUIZ_PROXY_SECRET,
      answers
    })
  });

  return readJsonResponse(response);
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (!isConfigured()) {
    return res.status(500).json({ error: "missing_server_config" });
  }

  try {
    const { action, phone, deviceId, chapters, text, answers } = getRequestData(req);

    if (!action) {
      return res.status(400).json({ error: "missing_action" });
    }

    const authData = await validateAccess(phone, deviceId);
    if (!isAuthSuccess(authData)) {
      const error = getAuthError(authData);
      return res.status(getAuthStatusCode(error)).json({ error });
    }

    if (req.method === "GET" && GET_ACTIONS.has(action)) {
      const data = await forwardGetAction({ action, chapters, text });
      return res.status(200).json(data);
    }

    if (req.method === "POST" && action === "checkQuiz") {
      if (!Array.isArray(answers)) {
        return res.status(400).json({ error: "missing_answers" });
      }

      const data = await forwardCheckQuiz(answers);
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: "invalid_action" });
  } catch (err) {
    return res.status(500).json({ error: "server_error" });
  }
}
