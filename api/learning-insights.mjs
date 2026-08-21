import { buildLearningInsights } from "./learning-analytics.mjs";
import { validateLearningEvent, verifyLearningAccessToken } from "./learning-sync.mjs";
import { fetchUpstream } from "./upstream-fetch.mjs";

export const LEARNING_INSIGHTS_SERVER_CONFIG = Object.freeze({
  maxRequestBytes: 384 * 1024,
  maxLocalEvents: 250,
  upstreamTimeoutMs: 12_000
});

function readRequestBody(req) {
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return req.body || {};
}

function boundedDeviceId(value) {
  const deviceId = String(value || "").trim();
  return /^[A-Za-z0-9_-]{8,128}$/.test(deviceId) ? deviceId : "";
}

function normalizeStoredAnswer(raw, expectedUserId) {
  const eventId = String(raw?.event_id || "").trim();
  const userId = String(raw?.user_id || "").replace(/\D/g, "");
  const quizId = String(raw?.quiz_id || "").trim();
  const result = String(raw?.result || "").toUpperCase();
  const answeredAt = String(raw?.answered_at || "").trim();
  if (!/^ans_[a-z0-9_-]{16,100}$/i.test(eventId)) return null;
  if (userId !== expectedUserId || !quizId) return null;
  if (result !== "CORRECT" && result !== "WRONG") return null;
  if (!Number.isFinite(Date.parse(answeredAt))) return null;
  return { event_id: eventId, user_id: userId, quiz_id: quizId, result, answered_at: answeredAt };
}

function validLocalAnswerEvents(values, userId) {
  const output = [];
  (Array.isArray(values) ? values : []).forEach(raw => {
    if (raw?.event_type !== "answer_event") return;
    const validation = validateLearningEvent(raw, { userId });
    if (!validation.ok) return;
    output.push(validation.event.payload);
  });
  return output;
}

function mergeByEventId(serverEvents, localEvents) {
  const merged = new Map();
  localEvents.forEach(event => merged.set(String(event.event_id), event));
  serverEvents.forEach(event => merged.set(String(event.event_id), event));
  return [...merged.values()];
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const learningDatabaseUrl = process.env.MAGICBOOK_LEARNING_DB;
  const gasSecret = process.env.GAS_SECRET;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!learningDatabaseUrl || !gasSecret || !sessionSecret) {
    return res.status(500).json({ error: "missing_server_config" });
  }

  let body;
  try {
    body = readRequestBody(req);
  } catch {
    return res.status(400).json({ error: "invalid_json" });
  }
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > LEARNING_INSIGHTS_SERVER_CONFIG.maxRequestBytes) {
    return res.status(413).json({ error: "payload_too_large" });
  }

  const deviceId = boundedDeviceId(body.device_id ?? body.deviceId);
  if (!deviceId) return res.status(400).json({ error: "invalid_device_id" });
  const bearer = String(req.headers?.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
  const auth = verifyLearningAccessToken(bearer, { secret: sessionSecret, deviceId });
  if (!auth.ok) return res.status(401).json({ error: auth.error });

  const localValues = Array.isArray(body.local_events) ? body.local_events : [];
  if (localValues.length > LEARNING_INSIGHTS_SERVER_CONFIG.maxLocalEvents) {
    return res.status(400).json({ error: "too_many_local_events" });
  }
  const localEvents = validLocalAnswerEvents(localValues, auth.userId);

  try {
    const upstream = await fetchUpstream(learningDatabaseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "learning_insights",
        token: gasSecret,
        user_id: auth.userId
      })
    }, {
      service: "learning_database",
      timeoutMs: LEARNING_INSIGHTS_SERVER_CONFIG.upstreamTimeoutMs
    });

    if (!upstream.ok) {
      res.setHeader("Retry-After", "5");
      return res.status(503).json({ error: "learning_database_unavailable" });
    }
    const upstreamData = await upstream.json().catch(() => null);
    if (!upstreamData || upstreamData.success !== true || !Array.isArray(upstreamData.events)) {
      res.setHeader("Retry-After", String(Math.max(1, Number(upstreamData?.retryAfterSeconds) || 5)));
      return res.status(503).json({ error: "learning_database_unavailable" });
    }

    const storedEvents = upstreamData.events
      .map(event => normalizeStoredAnswer(event, auth.userId))
      .filter(Boolean);
    const mergedEvents = mergeByEventId(storedEvents, localEvents);
    const model = buildLearningInsights(mergedEvents, {
      pendingLocalEvents: localEvents.length,
      pendingLocalIncluded: true,
      sourceTruncated: upstreamData.truncated === true
    });
    return res.status(200).json({
      success: true,
      source: "learning_database",
      ...model
    });
  } catch (error) {
    console.error("[api/learning-insights] unavailable", {
      code: error?.message || "learning_insights_failed",
      details: error?.details || null
    });
    res.setHeader("Retry-After", "5");
    return res.status(503).json({ error: "learning_database_unavailable" });
  }
}
