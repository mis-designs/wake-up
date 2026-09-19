import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { neonConfig } from "@neondatabase/serverless";
import { S3Client, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { quizAudioCatalog } from "../api/quiz-audio-catalog.mjs";
import { audioLookupKeys } from "../lib/quiz-audio-lookup.mjs";

async function fixture(t, role = "user") {
  const config = {
    SESSION_SECRET: "request-efficiency-test-secret", GAS_ACCESS_URL: "https://access.invalid/",
    GAS_SECRET: "test-secret", QUIZ_GAS_URL: "https://audio.invalid/", QUIZ_PROXY_SECRET: "test-proxy",
    DATABASE_URL: "postgresql://test:test@unit-test.neon.tech/test",
    QUIZ_AUDIO_R2_BUCKET: "test-audio", QUIZ_AUDIO_R2_ACCOUNT_ID: "test-account",
    QUIZ_AUDIO_R2_ACCESS_KEY_ID: "test-key", QUIZ_AUDIO_R2_SECRET_ACCESS_KEY: "test-secret"
  };
  for (const [key, value] of Object.entries(config)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  const { default: handler } = await import(`../api/quiz.js?efficiency=${crypto.randomUUID()}`);
  const phone = "39123456789", deviceId = "efficiency_device";
  const payload = Buffer.from(JSON.stringify({ phone, deviceId, purpose: "access", role, exp: Date.now() + 60_000 })).toString("base64url");
  const token = `${payload}.${crypto.createHmac("sha256", config.SESSION_SECRET).update(payload).digest("base64url")}`;
  const quizPayload = Buffer.from(JSON.stringify({ phone, deviceId, purpose: "quiz", role: "user", exp: Date.now() + 60_000 })).toString("base64url");
  const quizSessionToken = `${quizPayload}.${crypto.createHmac("sha256", config.SESSION_SECRET).update(quizPayload).digest("base64url")}`;
  t.mock.method(globalThis, "fetch", () => assert.fail("unexpected external request"));
  return async (body, method = "POST") => {
    const res = { headers: {}, statusCode: 200, setHeader(key, value) { this.headers[key] = value; },
      status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end(body) { this.body = body; return this; } };
    await handler({ method, headers: { authorization: `Bearer ${token}` },
      [method === "GET" ? "query" : "body"]: { phone, deviceId, quizSessionToken, ...body } }, res);
    return res;
  };
}

test("actual Neon SDK sends one parameterized array lookup and preserves audio priority", async t => {
  const request = await fixture(t);
  const row = quizAudioCatalog.rows.find(row => row.id === "cap1_q17");
  const identity = quizAudioCatalog.identityFor(row);
  const keys = audioLookupKeys(identity);
  assert.equal(keys.length, 3, "fixture includes current, previous and legacy identities");
  const queries = [];
  let stored = [];
  const previousFetch = neonConfig.fetchFunction;
  t.after(() => { neonConfig.fetchFunction = previousFetch; });
  neonConfig.fetchFunction = async (_url, options) => {
    queries.push(JSON.parse(options.body));
    return Response.json({ command: "SELECT", rowCount: stored.length,
      fields: ["quiz_key", "audio_key", "audio_mime_type", "audio_duration_ms"].map(name => ({ name, dataTypeID: name === "audio_duration_ms" ? 23 : 25 })),
      rows: stored });
  };
  const body = { questionId: row.id, question: row.question, figure: row.figure, quizAudioIdentityVersion: 2 };
  const status = await request({ ...body, action: "getQuizAudioStatus" });
  assert.equal(status.statusCode, 200);
  assert.equal(status.body.available, false);
  assert.equal(status.body.temporaryUnavailable, undefined);
  assert.equal(queries.length, 1);
  assert.match(queries[0].query, /quiz_key = ANY\(\$1::text\[\]\)/);
  assert.deepEqual(queries[0].params, [`{${keys.map(key => `"${key}"`).join(",")}}`]);

  stored = [...keys].reverse().map(key => [key, `${key}.webm`, "audio/webm", "1200"]);
  const playback = await request({ ...body, action: "getQuizAudioPlayback" });
  assert.equal(playback.statusCode, 200);
  assert.equal(queries.length, 2, "one query per request, no stale row cache");
  assert.ok(new URL(playback.body.audioUrl).pathname.endsWith(`/${identity.quizKey}.webm`));
  assert.equal(playback.body.durationMs, 1200);
  assert.doesNotMatch(playback.headers["Cache-Control"] || "", /public|s-maxage/);
});

for (const role of ["user", "admin"]) {
  test(`chapter 17 questions 20/21: ${role} sees and plays current and legacy recordings`, async t => {
    const request = await fixture(t, role);
    const rows = ["cap17_q20", "cap17_q21"].map(id => quizAudioCatalog.rows.find(row => row.id === id));
    let stored = [], queries = 0, heads = 0, reads = 0;
    const bytes = Buffer.from("ID3local-audio-fixture");
    const previousFetch = neonConfig.fetchFunction;
    t.after(() => { neonConfig.fetchFunction = previousFetch; });
    neonConfig.fetchFunction = async () => {
      queries++;
      return Response.json({ command: "SELECT", rowCount: stored.length,
        fields: ["quiz_key", "audio_key", "audio_mime_type", "audio_duration_ms"].map(name => ({ name, dataTypeID: name === "audio_duration_ms" ? 23 : 25 })),
        rows: stored });
    };
    t.mock.method(S3Client.prototype, "send", async command => {
      if (command instanceof HeadObjectCommand) { heads++; return { ContentLength: bytes.length }; }
      assert.ok(command instanceof GetObjectCommand);
      reads++;
      return { Body: { transformToByteArray: async () => bytes } };
    });
    for (const row of rows) {
      const identity = quizAudioCatalog.identityFor(row);
      for (const key of [identity.quizKey, identity.legacyQuizKey]) {
        stored = [[key, `${key}.mp3`, "audio/mpeg", "1200"]];
        const body = { questionId: row.id, question: row.question, figure: row.figure, quizAudioIdentityVersion: 2 };
        const status = await request({ ...body, action: "getQuizAudioStatus" });
        assert.equal(status.statusCode, 200);
        assert.equal(status.body.available, true, `${role}: ${row.id} ${key}`);
        assert.equal(status.body.requiresReview, false);
        assert.equal(status.body.isAdmin, role === "admin");
        const playback = await request({ ...body, action: "getQuizAudioBlob" });
        assert.equal(playback.statusCode, 200);
        assert.deepEqual(playback.body, bytes);
        assert.doesNotMatch(playback.headers["Cache-Control"] || "", /public|s-maxage/);
      }
    }
    assert.equal(queries, 8, "one exact lookup per status/play, without fan-out");
    assert.equal(heads, 4);
    assert.equal(reads, 4);
  });
}

test("simultaneous authorized Italian audio requests share upstream work, later requests stay fresh", async t => {
  const request = await fixture(t);
  const row = quizAudioCatalog.rows[0];
  let calls = 0, finish;
  t.mock.method(globalThis, "fetch", async input => {
    assert.equal(new URL(input).hostname, "audio.invalid");
    calls++;
    return new Promise(resolve => { finish = () => resolve(Response.json({ audio: "SUQzdGVzdA==" })); });
  });
  const body = { action: "getItalianAudio", text: row.question };
  const first = request(body, "GET"), second = request(body, "GET");
  await new Promise(setImmediate);
  assert.equal(calls, 1);
  finish();
  const results = await Promise.all([first, second]);
  assert.ok(results.every(result => result.statusCode === 200));
  assert.deepEqual(results[0].body, results[1].body);
  const third = request(body, "GET");
  await new Promise(setImmediate);
  assert.equal(calls, 2);
  finish();
  assert.equal((await third).statusCode, 200);
});
