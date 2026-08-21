import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import handler, {
  LEARNING_SYNC_SERVER_CONFIG,
  validateLearningEvent,
  verifyLearningAccessToken
} from "../api/learning-sync.mjs";
import { LOCAL_QUIZ_ROWS } from "../api/local-quiz-bank.mjs";

const TEST_SECRET = "learning-sync-session-secret";
const TEST_GAS_SECRET = "learning-sync-gas-secret";
const TEST_DEVICE = "device_learning_123";
const TEST_PHONE = "3331112222";
const TEST_QUIZ = LOCAL_QUIZ_ROWS[0];

function accessToken({ phone = TEST_PHONE, deviceId = TEST_DEVICE, exp = Date.now() + 60_000 } = {}) {
  const encoded = Buffer.from(JSON.stringify({
    phone,
    deviceId,
    purpose: "access",
    role: "user",
    exp
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", TEST_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function answerEvent(index, overrides = {}) {
  const { payload: payloadOverrides = {}, ...eventOverrides } = overrides;
  const eventId = `ans_${String(index).padStart(20, "0")}`;
  return {
    event_id: eventId,
    event_type: "answer_event",
    user_id: TEST_PHONE,
    payload: {
      quiz_id: String(TEST_QUIZ.id),
      user_answer: Number(TEST_QUIZ.correct),
      answered_at: "2026-08-21T10:00:00.000Z",
      response_time_ms: 2500,
      response_time_valid: true,
      page_was_hidden: false,
      mode: "chapter_quiz",
      session_id: "ses_1234567890123456",
      attempt_number: 1,
      client_version: "test",
      ...payloadOverrides
    },
    ...eventOverrides
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

async function invoke({ events, token = accessToken(), deviceId = TEST_DEVICE } = {}) {
  const req = {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: { device_id: deviceId, events }
  };
  const res = responseRecorder();
  await handler(req, res);
  return res;
}

const originalFetch = globalThis.fetch;
const originalEnv = {
  MAGICBOOK_LEARNING_DB: process.env.MAGICBOOK_LEARNING_DB,
  GAS_SECRET: process.env.GAS_SECRET,
  SESSION_SECRET: process.env.SESSION_SECRET
};

test.beforeEach(() => {
  process.env.MAGICBOOK_LEARNING_DB = "https://script.google.com/macros/s/test-learning-db/exec";
  process.env.GAS_SECRET = TEST_GAS_SECRET;
  process.env.SESSION_SECRET = TEST_SECRET;
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test.after(() => {
  Object.entries(originalEnv).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
});

test("learning access tokens bind the signed user to the current device", () => {
  const verified = verifyLearningAccessToken(accessToken(), {
    secret: TEST_SECRET,
    deviceId: TEST_DEVICE
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.userId, TEST_PHONE);
  assert.equal(verifyLearningAccessToken(accessToken(), {
    secret: TEST_SECRET,
    deviceId: "different_device"
  }).ok, false);
});

test("answer validation derives the result from the protected quiz bank", () => {
  const event = answerEvent(1, { payload: { result: "WRONG" } });
  const result = validateLearningEvent(event, { userId: TEST_PHONE });

  assert.equal(result.ok, true);
  assert.equal(result.event.payload.result, "CORRECT");
  assert.equal(result.event.payload.user_id, TEST_PHONE);
  assert.equal(result.event.payload.event_id, event.event_id);
});

test("the Vercel endpoint uses MAGICBOOK_LEARNING_DB and preserves partial results", async () => {
  const events = Array.from({ length: 20 }, (_, index) => answerEvent(index + 1));
  const accepted = events.slice(0, 18).map(event => event.event_id);
  const duplicate = events[18].event_id;
  const invalid = events[19].event_id;
  let upstreamRequest = null;
  globalThis.fetch = async (url, options) => {
    upstreamRequest = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      success: true,
      accepted,
      duplicates: [duplicate],
      rejected: [{ event_id: invalid, error: "invalid_event_payload" }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const res = await invoke({ events });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.accepted, accepted);
  assert.deepEqual(res.body.duplicates, [duplicate]);
  assert.deepEqual(res.body.rejected, [{ event_id: invalid, error: "invalid_event_payload" }]);
  assert.equal(upstreamRequest.url, process.env.MAGICBOOK_LEARNING_DB);
  assert.equal(upstreamRequest.body.action, "learning_sync");
  assert.equal(upstreamRequest.body.token, TEST_GAS_SECRET);
  assert.ok(upstreamRequest.body.events.every(event => event.user_id === TEST_PHONE));
});

test("invalid events are rejected individually without blocking valid events", async () => {
  const valid = answerEvent(1);
  const invalid = answerEvent(2, { user_id: "9999999999" });
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.events.length, 1);
    return new Response(JSON.stringify({
      success: true,
      accepted: [valid.event_id],
      duplicates: [],
      rejected: []
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const res = await invoke({ events: [valid, invalid] });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.accepted, [valid.event_id]);
  assert.equal(res.body.rejected[0].event_id, invalid.event_id);
  assert.equal(res.body.rejected[0].error, "user_mismatch");
});

test("forged or expired authentication never reaches Apps Script", async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; return new Response(); };

  const forged = await invoke({ events: [answerEvent(1)], token: `${accessToken()}x` });
  const expired = await invoke({
    events: [answerEvent(2)],
    token: accessToken({ exp: Date.now() - 1 })
  });

  assert.equal(forged.statusCode, 401);
  assert.equal(expired.statusCode, 401);
  assert.equal(requests, 0);
});

test("batch and payload limits are enforced before forwarding", async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; return new Response(); };
  const tooMany = Array.from(
    { length: LEARNING_SYNC_SERVER_CONFIG.maxBatchSize + 1 },
    (_, index) => answerEvent(index + 1)
  );

  const res = await invoke({ events: tooMany });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, "invalid_batch_size");
  assert.equal(requests, 0);
});

test("upstream 429 preserves Retry-After for client backoff", async () => {
  globalThis.fetch = async () => new Response("busy", {
    status: 429,
    headers: { "Retry-After": "30" }
  });

  const res = await invoke({ events: [answerEvent(1)] });

  assert.equal(res.statusCode, 429);
  assert.equal(res.headers["retry-after"], "30");
  assert.equal(res.body.error, "server_busy");
});

test("an incomplete Apps Script result is retried instead of losing an uncertain event", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true,
    accepted: [],
    duplicates: [],
    rejected: []
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  const res = await invoke({ events: [answerEvent(1)] });

  assert.equal(res.statusCode, 503);
  assert.equal(res.headers["retry-after"], "5");
  assert.equal(res.body.error, "incomplete_learning_database_response");
});
