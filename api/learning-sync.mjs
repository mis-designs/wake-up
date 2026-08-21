import crypto from "node:crypto";
import {
  LOCAL_QUIZ_ROWS,
  gradeLocalQuiz,
  normalizeLocalAnswer
} from "./local-quiz-bank.mjs";
import { fetchUpstream } from "./upstream-fetch.mjs";

export const LEARNING_SYNC_SERVER_CONFIG = Object.freeze({
  maxBatchSize: 25,
  maxRequestBytes: 128 * 1024,
  upstreamTimeoutMs: 12_000
});

const QUIZ_IDS = new Set(LOCAL_QUIZ_ROWS.map(row => String(row.id ?? "").trim()));
const EVENT_ID_PATTERNS = Object.freeze({
  answer_event: /^ans_[a-z0-9_-]{16,100}$/i,
  study_activity_event: /^act_[a-z0-9_-]{16,100}$/i
});

function base64UrlDecode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function normalizedPhone(value) {
  let phone = String(value || "").replace(/\D/g, "");
  if (phone.startsWith("39") && phone.length === 12) phone = phone.slice(2);
  return phone;
}

function safeSignatureEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyLearningAccessToken(token, { secret, deviceId, now = Date.now() } = {}) {
  if (!token || !secret || !deviceId) return { ok: false, error: "unauthorized" };
  const parts = String(token).split(".");
  if (parts.length !== 2) return { ok: false, error: "unauthorized" };

  const [encodedPayload, suppliedSignature] = parts;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
  if (!safeSignatureEqual(suppliedSignature, expectedSignature)) {
    return { ok: false, error: "unauthorized" };
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return { ok: false, error: "unauthorized" };
  }

  const phone = normalizedPhone(payload?.phone);
  if (
    payload?.purpose !== "access" ||
    payload?.deviceId !== deviceId ||
    !/^\d{6,15}$/.test(phone)
  ) {
    return { ok: false, error: "unauthorized" };
  }
  if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= now) {
    return { ok: false, error: "token_expired" };
  }

  return { ok: true, userId: phone, payload };
}

function plainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function boundedText(value, { required = false, max = 255 } = {}) {
  if (value === undefined || value === null) return required ? null : "";
  const text = String(value).trim();
  if ((required && !text) || text.length > max) return null;
  return text;
}

function optionalInteger(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === "") return "";
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function optionalBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === true || value === false) return value;
  return null;
}

function isoTimestamp(value, { required = false, now = Date.now() } = {}) {
  if (value === undefined || value === null || value === "") return required ? null : "";
  if (typeof value !== "string" || value.length > 40) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > now + 5 * 60 * 1000) return null;
  return new Date(timestamp).toISOString();
}

function rejected(eventId, error) {
  return {
    ok: false,
    rejection: {
      event_id: boundedText(eventId, { max: 120 }) || "unknown",
      error
    }
  };
}

function validateAnswerEvent(event, userId, now) {
  const payload = event.payload;
  const quizId = boundedText(payload.quiz_id, { required: true, max: 255 });
  const userAnswer = normalizeLocalAnswer(payload.user_answer);
  const answeredAt = isoTimestamp(payload.answered_at, { required: true, now });
  const responseTimeMs = optionalInteger(payload.response_time_ms, { min: 0, max: 4 * 60 * 60 * 1000 });
  const responseTimeValid = optionalBoolean(payload.response_time_valid, false);
  const pageWasHidden = optionalBoolean(payload.page_was_hidden, false);
  const mode = boundedText(payload.mode, { max: 100 });
  const sessionId = boundedText(payload.session_id, { max: 255 });
  const attemptNumber = optionalInteger(payload.attempt_number, { min: 1, max: 10_000 });
  const clientVersion = boundedText(payload.client_version, { max: 100 });

  if (!quizId || !QUIZ_IDS.has(quizId)) return rejected(event.event_id, "invalid_quiz_id");
  if (userAnswer === null) return rejected(event.event_id, "invalid_user_answer");
  if (!answeredAt) return rejected(event.event_id, "invalid_answered_at");
  if (responseTimeMs === null) return rejected(event.event_id, "invalid_response_time_ms");
  if (responseTimeValid === null || pageWasHidden === null) {
    return rejected(event.event_id, "invalid_boolean_field");
  }
  if (mode === null || sessionId === null || attemptNumber === null || clientVersion === null) {
    return rejected(event.event_id, "invalid_answer_payload");
  }

  const grade = gradeLocalQuiz([{ id: quizId, answer: userAnswer }]);
  const result = grade.results[0]?.correct === true ? "CORRECT" : "WRONG";
  return {
    ok: true,
    event: {
      event_id: event.event_id,
      event_type: "answer_event",
      user_id: userId,
      payload: {
        event_id: event.event_id,
        user_id: userId,
        quiz_id: quizId,
        result,
        user_answer: userAnswer,
        answered_at: answeredAt,
        response_time_ms: responseTimeMs,
        response_time_valid: responseTimeValid && responseTimeMs !== "" && !pageWasHidden,
        page_was_hidden: pageWasHidden,
        mode,
        session_id: sessionId,
        attempt_number: attemptNumber,
        client_version: clientVersion
      }
    }
  };
}

function validateStudyActivityEvent(event, userId, now) {
  const payload = event.payload;
  const activityType = boundedText(payload.activity_type, { required: true, max: 100 });
  const entityType = boundedText(payload.entity_type, { required: true, max: 100 });
  const entityId = boundedText(payload.entity_id, { required: true, max: 255 });
  const sessionId = boundedText(payload.session_id, { max: 255 });
  const startedAt = isoTimestamp(payload.started_at, { required: true, now });
  const completedAt = isoTimestamp(payload.completed_at, { now });
  const durationMs = optionalInteger(payload.duration_ms, { min: 0, max: 24 * 60 * 60 * 1000 });
  let metadataJson = "";

  try {
    metadataJson = payload.metadata_json === undefined || payload.metadata_json === null
      ? ""
      : typeof payload.metadata_json === "string"
        ? payload.metadata_json
        : JSON.stringify(payload.metadata_json);
    if (metadataJson) JSON.parse(metadataJson);
  } catch {
    return rejected(event.event_id, "invalid_metadata_json");
  }

  if (!activityType || !entityType || !entityId || !startedAt) {
    return rejected(event.event_id, "missing_activity_field");
  }
  if (sessionId === null || completedAt === null || durationMs === null || metadataJson.length > 45_000) {
    return rejected(event.event_id, "invalid_activity_payload");
  }

  return {
    ok: true,
    event: {
      event_id: event.event_id,
      event_type: "study_activity_event",
      user_id: userId,
      payload: {
        event_id: event.event_id,
        user_id: userId,
        session_id: sessionId,
        activity_type: activityType,
        entity_type: entityType,
        entity_id: entityId,
        started_at: startedAt,
        completed_at: completedAt,
        duration_ms: durationMs,
        metadata_json: metadataJson
      }
    }
  };
}

export function validateLearningEvent(event, { userId, now = Date.now() } = {}) {
  if (!plainObject(event)) return rejected("unknown", "invalid_event");
  const eventType = boundedText(event.event_type, { required: true, max: 50 });
  const pattern = EVENT_ID_PATTERNS[eventType];
  const eventId = boundedText(event.event_id, { required: true, max: 120 });
  const suppliedUserId = normalizedPhone(event.user_id);

  if (!pattern || !eventId || !pattern.test(eventId)) return rejected(eventId, "invalid_event_identity");
  if (!userId || suppliedUserId !== userId) return rejected(eventId, "user_mismatch");
  if (!plainObject(event.payload)) return rejected(eventId, "invalid_payload");
  if (eventType === "answer_event") return validateAnswerEvent(event, userId, now);
  return validateStudyActivityEvent(event, userId, now);
}

function readRequestBody(req) {
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return req.body || {};
}

function responseIdSet(values, allowedIds) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || ""))
    .filter(value => allowedIds.has(value)))];
}

function normalizeUpstreamRejected(values, allowedIds) {
  if (!Array.isArray(values)) return [];
  return values.flatMap(value => {
    const eventId = String(value?.event_id || "");
    if (!allowedIds.has(eventId)) return [];
    return [{ event_id: eventId, error: boundedText(value?.error, { max: 120 }) || "rejected" }];
  });
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
  const requestBytes = Buffer.byteLength(JSON.stringify(body), "utf8");
  if (requestBytes > LEARNING_SYNC_SERVER_CONFIG.maxRequestBytes) {
    return res.status(413).json({ error: "payload_too_large" });
  }

  const events = body.events;
  if (!Array.isArray(events) || events.length < 1 || events.length > LEARNING_SYNC_SERVER_CONFIG.maxBatchSize) {
    return res.status(400).json({ error: "invalid_batch_size" });
  }

  const deviceId = boundedText(body.device_id ?? body.deviceId, { required: true, max: 128 });
  if (!deviceId || !/^[A-Za-z0-9_-]{8,128}$/.test(deviceId)) {
    return res.status(400).json({ error: "invalid_device_id" });
  }
  const authorization = String(req.headers?.authorization || "");
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  const auth = verifyLearningAccessToken(bearer, { secret: sessionSecret, deviceId });
  if (!auth.ok) return res.status(401).json({ error: auth.error });

  const acceptedForForwarding = [];
  const rejectedByVercel = [];
  events.forEach(event => {
    const validation = validateLearningEvent(event, { userId: auth.userId });
    if (validation.ok) acceptedForForwarding.push(validation.event);
    else rejectedByVercel.push(validation.rejection);
  });

  if (!acceptedForForwarding.length) {
    return res.status(200).json({ success: true, accepted: [], duplicates: [], rejected: rejectedByVercel });
  }

  try {
    const upstream = await fetchUpstream(learningDatabaseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "learning_sync",
        token: gasSecret,
        events: acceptedForForwarding
      })
    }, {
      service: "learning_database",
      timeoutMs: LEARNING_SYNC_SERVER_CONFIG.upstreamTimeoutMs
    });

    if (upstream.status === 429) {
      const retryAfter = upstream.headers.get("retry-after");
      if (retryAfter) res.setHeader("Retry-After", retryAfter);
      return res.status(429).json({ error: "server_busy" });
    }
    if (!upstream.ok) {
      res.setHeader("Retry-After", "5");
      return res.status(503).json({ error: "learning_database_unavailable" });
    }

    const upstreamData = await upstream.json().catch(() => null);
    if (!upstreamData || upstreamData.success !== true) {
      res.setHeader("Retry-After", String(Math.max(1, Number(upstreamData?.retryAfterSeconds) || 5)));
      return res.status(503).json({ error: "learning_database_unavailable" });
    }

    const allowedIds = new Set(acceptedForForwarding.map(event => event.event_id));
    const accepted = responseIdSet(upstreamData.accepted, allowedIds);
    const duplicates = responseIdSet(upstreamData.duplicates, allowedIds)
      .filter(eventId => !accepted.includes(eventId));
    const handledIds = new Set([...accepted, ...duplicates]);
    const upstreamRejected = normalizeUpstreamRejected(upstreamData.rejected, allowedIds)
      .filter(item => !handledIds.has(item.event_id));
    const explicitlyRejectedIds = new Set(upstreamRejected.map(item => item.event_id));
    const missingIds = [];
    allowedIds.forEach(eventId => {
      if (!handledIds.has(eventId) && !explicitlyRejectedIds.has(eventId)) {
        missingIds.push(eventId);
      }
    });
    if (missingIds.length) {
      res.setHeader("Retry-After", "5");
      return res.status(503).json({ error: "incomplete_learning_database_response" });
    }

    return res.status(200).json({
      success: true,
      accepted,
      duplicates,
      rejected: [...rejectedByVercel, ...upstreamRejected]
    });
  } catch (error) {
    console.error("[api/learning-sync] unavailable", {
      code: error?.message || "learning_sync_failed",
      details: error?.details || null
    });
    res.setHeader("Retry-After", "5");
    return res.status(503).json({ error: "learning_database_unavailable" });
  }
}
