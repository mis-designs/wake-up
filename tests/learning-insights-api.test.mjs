import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import handler, { LEARNING_INSIGHTS_SERVER_CONFIG } from "../api/learning-insights.mjs";
import { LOCAL_MAGIC_BOOK_ROWS } from "../api/local-quiz-bank.mjs";

const SECRET = "insights-session-secret";
const GAS_SECRET = "insights-gas-secret";
const DEVICE = "device_insights_123";
const PHONE = "3331112222";
const QUIZ = LOCAL_MAGIC_BOOK_ROWS[0];

function token({ deviceId = DEVICE, exp = Date.now() + 60_000 } = {}) {
  const encoded = Buffer.from(JSON.stringify({ phone: PHONE, deviceId, purpose: "access", role: "user", exp })).toString("base64url");
  return `${encoded}.${crypto.createHmac("sha256", SECRET).update(encoded).digest("base64url")}`;
}

function localEvent(index = 1) {
  return {
    event_id: `ans_${String(index).padStart(20, "0")}`,
    event_type: "answer_event",
    user_id: PHONE,
    payload: {
      quiz_id: QUIZ.id,
      user_answer: QUIZ.correct,
      answered_at: "2026-08-21T10:00:00.000Z",
      response_time_ms: 1200,
      response_time_valid: true,
      page_was_hidden: false,
      mode: "chapter_quiz",
      session_id: "ses_1234567890123456",
      attempt_number: 1,
      client_version: "test"
    }
  };
}

function recorder() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

async function invoke({ body = {}, bearer = token() } = {}) {
  const req = { method: "POST", headers: { authorization: `Bearer ${bearer}` }, body: { device_id: DEVICE, ...body } };
  const res = recorder();
  await handler(req, res);
  return res;
}

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

test.beforeEach(() => {
  process.env.MAGICBOOK_LEARNING_DB = "https://script.google.com/macros/s/learning-insights/exec";
  process.env.GAS_SECRET = GAS_SECRET;
  process.env.SESSION_SECRET = SECRET;
});

test.afterEach(() => { globalThis.fetch = originalFetch; });
test.after(() => {
  ["MAGICBOOK_LEARNING_DB", "GAS_SECRET", "SESSION_SECRET"].forEach(key => {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  });
});

test("the endpoint requests only the authenticated user's events and merges a local answer", async () => {
  let forwarded;
  globalThis.fetch = async (_url, options) => {
    forwarded = JSON.parse(options.body);
    return new Response(JSON.stringify({ success: true, events: [], truncated: false }), { status: 200 });
  };
  const res = await invoke({ body: { local_events: [localEvent()] } });

  assert.equal(res.statusCode, 200);
  assert.equal(forwarded.action, "learning_insights");
  assert.equal(forwarded.token, GAS_SECRET);
  assert.equal(forwarded.user_id, PHONE);
  assert.equal(res.body.summary.totalAnswers, 1);
  assert.equal(res.body.summary.totalCorrect, 1);
  assert.equal(res.body.summary.pendingLocalEvents, 1);
});

test("server rows win event-id deduplication", async () => {
  const local = localEvent();
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true,
    events: [{ event_id: local.event_id, user_id: PHONE, quiz_id: QUIZ.id, result: "WRONG", answered_at: local.payload.answered_at }]
  }), { status: 200 });
  const res = await invoke({ body: { local_events: [local] } });
  assert.equal(res.body.summary.totalAnswers, 1);
  assert.equal(res.body.summary.totalWrong, 1);
});

test("forged sessions and oversized local batches never reach Apps Script", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response(); };
  const forged = await invoke({ bearer: `${token()}x` });
  const tooMany = await invoke({ body: { local_events: Array.from({ length: LEARNING_INSIGHTS_SERVER_CONFIG.maxLocalEvents + 1 }, (_, index) => localEvent(index + 1)) } });
  assert.equal(forged.statusCode, 401);
  assert.equal(tooMany.statusCode, 400);
  assert.equal(calls, 0);
});

test("upstream failure is retryable and does not expose internal details", async () => {
  globalThis.fetch = async () => { throw new Error("private-network-detail"); };
  const res = await invoke();
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers["retry-after"], "5");
  assert.deepEqual(res.body, { error: "learning_database_unavailable" });
});
