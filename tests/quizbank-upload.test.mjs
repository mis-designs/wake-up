import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import { S3Client } from "@aws-sdk/client-s3";
import { neonConfig } from "@neondatabase/serverless";
import { quizAudioCatalog } from "../api/quiz-audio-catalog.mjs";
import { quizBankAudioIdentity, quizBankStorageIdentity } from "../api/quizbank-catalog.mjs";
import { audioLookupKeys } from "../lib/quiz-audio-lookup.mjs";
import { decodeQuizAudioUpload, saveMissingQuizAudio, MAX_QUIZ_AUDIO_BYTES } from "../lib/quiz-audio-upload.mjs";
import { sniffQuizAudioUploadMimeType, detectQuizAudioMimeType } from "../api/audio-mime.mjs";

// This test process uses only explicit dummy configuration and mocked transports.
Object.assign(process.env, {
  SESSION_SECRET: "upload-unit-secret", GAS_ACCESS_URL: "https://access.invalid/", GAS_SECRET: "fixture",
  DATABASE_URL: "postgresql://test:test@unit-test.neon.tech/test", ADMIN_PHONE_NUMBERS: "39123456789",
  QUIZ_AUDIO_R2_BUCKET: "upload-audio", QUIZ_AUDIO_R2_ACCOUNT_ID: "audio-fixture",
  QUIZ_AUDIO_R2_ACCESS_KEY_ID: "audio-fixture-key", QUIZ_AUDIO_R2_SECRET_ACCESS_KEY: "audio-fixture-secret",
  quiz_bank_access_key_id: "archive-read-key", quiz_bank_secret_access_key: "archive-read-secret",
  QUIZBANK_R2_ACCOUNT_ID: "archive-fixture", QUIZBANK_R2_BUCKET: "upload-archive", QUIZBANK_R2_KEY: "upload-unit.json"
});
const { default: handler } = await import("../api/quizbank.js");
const phone = "39123456789", deviceId = "upload_test_device";
const shared = quizAudioCatalog.rows.find(row => row.id === "cap1_q17");
const isolated = { question: "Una domanda privata non presente nel catalogo.", correct: true, figure: "25" };
const sharedId = "qb_s01_q01", isolatedId = "qb_s01_q02";
const archive = Array.from({ length: 1500 }, (_, i) => {
  const sheet = Math.floor(i / 30) + 1, number = i % 30 + 1;
  const row = i === 0 ? shared : i === 1 ? isolated : { question: `Upload fixture ${i}`, correct: true, figure: "" };
  return { id: `qb_s${String(sheet).padStart(2, "0")}_q${String(number).padStart(2, "0")}`,
    scheda: sheet, numero_domanda: number, domanda: row.question, risposta: row.correct ? "V" : "F",
    risposta_corretta: Boolean(row.correct), ha_figura: Boolean(row.figure),
    numero_figura: row.figure ? Number(String(row.figure).match(/\d+/)[0]) : null };
});
function wav(size = 46, sample = 1) {
  const bytes = Buffer.alloc(size, sample);
  bytes.write("RIFF"); bytes.writeUInt32LE(size - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(8000, 28); bytes.writeUInt16LE(1, 32);
  bytes.writeUInt16LE(8, 34); bytes.write("data", 36); bytes.writeUInt32LE(size - 44, 40);
  return bytes;
}
const payload = (questionId = isolatedId, bytes = wav()) => ({ action: "saveQuizAudio", questionId,
  audioBase64: bytes.toString("base64"), audioMimeType: "audio/wav", audioDurationMs: 1200 });
const token = (claims = {}) => {
  const body = Buffer.from(JSON.stringify({ phone, deviceId, purpose: "access", role: "admin", exp: Date.now() + 60_000, ...claims })).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", "upload-unit-secret").update(body).digest("base64url")}`;
};
const missing = () => Object.assign(new Error("missing"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
const fields = ["quiz_key", "audio_key", "audio_mime_type", "audio_duration_ms"];
const pgKeys = value => Array.isArray(value) ? value : String(value).slice(1, -1).split(",").map(key => key.replace(/^"|"$/g, ""));
function sqlResponse(rows, command = "SELECT") {
  return Response.json({ command, rowCount: rows.length,
    fields: fields.map(name => ({ name, dataTypeID: name === "audio_duration_ms" ? 23 : 25 })),
    rows: rows.map(row => fields.map(name => row[name] ?? null)) });
}
function fixture(t) {
  const state = { rows: new Map(), objects: new Map(), dbCalls: [], s3Calls: [], signals: [],
    beforeQuery: null, beforeObject: null, afterPut: null, beforeInsert: null, insertFailure: "" };
  t.mock.method(globalThis, "fetch", async () => Response.json({ success: false, error: "unauthorized" }));
  t.mock.method(S3Client.prototype, "send", async function(command, options = {}) {
    const input = command.input, kind = command.constructor.name;
    state.s3Calls.push({ kind, input });
    if (input.Bucket === "upload-archive") {
      assert.equal(kind, "GetObjectCommand", "archive credentials are read-only");
      return { Body: Readable.from([Buffer.from(JSON.stringify(archive))]) };
    }
    assert.equal(input.Bucket, "upload-audio");
    if (["PutObjectCommand", "HeadObjectCommand"].includes(kind) && options.abortSignal) {
      assert.equal(await this.config.maxAttempts(), 1, "only upload operations use the single-attempt client");
    }
    assert.equal((await this.config.credentials()).accessKeyId, "audio-fixture-key");
    if (options.abortSignal) state.signals.push(options.abortSignal);
    await state.beforeObject?.({ kind, input, options });
    options.abortSignal?.throwIfAborted();
    const existing = state.objects.get(input.Key);
    if (kind === "PutObjectCommand") {
      assert.equal(input.IfNoneMatch, "*");
      assert.ok(options.abortSignal, "upload storage calls are cancellable");
      if (existing) throw Object.assign(new Error("already exists"), { name: "PreconditionFailed", $metadata: { httpStatusCode: 412 } });
      state.objects.set(input.Key, { bytes: Buffer.from(input.Body), type: input.ContentType, metadata: { ...input.Metadata } });
      await state.afterPut?.();
      return {};
    }
    if (!existing) throw missing();
    if (kind === "HeadObjectCommand") return { ContentLength: existing.bytes.length, ContentType: existing.type, Metadata: existing.metadata };
    assert.equal(kind, "GetObjectCommand", "no deletion or alias migration is permitted");
    return { Body: Readable.from([existing.bytes]) };
  });
  const previousFetch = neonConfig.fetchFunction;
  t.after(() => { neonConfig.fetchFunction = previousFetch; });
  neonConfig.fetchFunction = async (_url, options) => {
    const { query, params } = JSON.parse(options.body);
    state.dbCalls.push({ query, params });
    if (options.signal) state.signals.push(options.signal);
    await state.beforeQuery?.({ query, params, options });
    options.signal?.throwIfAborted();
    if (/^\s*SELECT/.test(query)) {
      const keys = pgKeys(params[0]);
      return sqlResponse(keys.flatMap(key => state.rows.has(key) ? [state.rows.get(key)] : []));
    }
    assert.match(query, /^INSERT INTO quiz_audio_explanations/);
    assert.match(query, /WHERE NOT EXISTS[\s\S]*ANY\(\$6::text\[\]\)/);
    assert.match(query, /ON CONFLICT \(quiz_key\) DO NOTHING/);
    assert.doesNotMatch(query, /DO UPDATE|DELETE|UPDATE SET/);
    assert.ok(options.signal, "Neon writes share the upload deadline");
    await state.beforeInsert?.(params);
    if (state.insertFailure === "before") throw new Error("database unavailable before commit");
    // Simulate the atomic SQL condition/unique constraint without awaiting
    // between checking and insertion, including alias arrivals during upload.
    const keys = pgKeys(params[5]);
    if (keys.some(key => state.rows.has(key))) return sqlResponse([], "INSERT");
    const row = { quiz_key: params[0], audio_key: params[1], audio_mime_type: params[2],
      audio_duration_ms: params[3] == null ? null : Number(params[3]), created_by: params[4] };
    state.rows.set(row.quiz_key, row);
    if (state.insertFailure === "after") throw new Error("response lost after commit");
    return sqlResponse([row], "INSERT");
  };
  state.call = async (params = payload(), { bearer = token(), method = "POST", request = {} } = {}) => {
    const req = Object.assign(new EventEmitter(), { method, headers: { authorization: `Bearer ${bearer}` },
      [method === "GET" ? "query" : "body"]: { phone, deviceId, ...params } }, request);
    const res = Object.assign(new EventEmitter(), { headers: {}, statusCode: 200,
      setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }, end(bytes) { this.bytes = bytes; return this; } });
    await handler(req, res);
    assert.equal(req.listenerCount("aborted"), 0); assert.equal(res.listenerCount("close"), 0);
    return res;
  };
  return state;
}

test("upload rejects spoofed roles, unlisted admins, expired/forged/device-mismatched tokens before archive/database I/O", async t => {
  const f = fixture(t);
  for (const [bearer, extra, expected] of [
    [token({ role: "user" }), { role: "admin" }, 403], ["forged", { role: "admin" }, 401],
    [token({ phone: "39987654321" }), { phone: "39987654321" }, 403],
    [token({ exp: 1 }), {}, 401], [token({ deviceId: "different_device" }), {}, 401]
  ]) assert.equal((await f.call({ ...payload(), ...extra }, { bearer })).statusCode, expected);
  assert.equal(f.s3Calls.length, 0); assert.equal(f.dbCalls.length, 0);
});

test("strict decoding, sniffing and size validation fail before any storage/database access", async t => {
  const f = fixture(t);
  const invalid = [
    [{ audioBase64: "" }, 400], [{ audioBase64: "!!!!" }, 400], [{ audioBase64: "YQ=" }, 400],
    [{ audioBase64: "YR==" }, 400], [{ audioBase64: "YQ==\n" }, 400], [{ audioBase64: "Y=Q=" }, 400],
    [{ audioBase64: {} }, 400], [{ audioBase64: Buffer.from("<html>fake audio</html>").toString("base64") }, 415],
    [{ audioBase64: Buffer.from("ID3fixture").toString("base64") }, 415],
    [{ audioMimeType: "text/plain" }, 415], [{ audioMimeType: "audio/webm" }, 415],
    [{ audioBase64: `data:audio/mpeg;base64,${wav().toString("base64")}` }, 415],
    [{ audioBase64: "data:audio/wav,abc" }, 400], [{ audioDurationMs: "Infinity" }, 400],
    [{ audioBase64: wav(MAX_QUIZ_AUDIO_BYTES + 2).toString("base64") }, 413]
  ];
  for (const [change, status] of invalid) {
    const response = await f.call({ ...payload(), ...change });
    assert.equal(response.statusCode, status, JSON.stringify(change).slice(0, 100));
    assert.match(response.body.error, /invalid_audio|audio_too_large/);
  }
  assert.equal(f.s3Calls.length, 0); assert.equal(f.dbCalls.length, 0);
  const maximum = decodeQuizAudioUpload({ audioBase64: wav(MAX_QUIZ_AUDIO_BYTES).toString("base64"), audioMimeType: "audio/wav" });
  assert.equal(maximum.bytes.length, MAX_QUIZ_AUDIO_BYTES);
  assert.equal(decodeQuizAudioUpload({ audioBase64: `data:audio/x-wav;base64,${wav().toString("base64")}` }).mimeType, "audio/wav");
  assert.equal(detectQuizAudioMimeType(Buffer.from("unknown"), "audio/mp4"), "audio/mp4", "playback fallback is unchanged");
});

test("strict sniffing recognizes supported signatures and rejects truncated, unknown and AAC headers", () => {
  const mp3 = Buffer.alloc(417); mp3.set([0xff, 0xfb, 0x90, 0x64]);
  const id3 = Buffer.concat([Buffer.from([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]), mp3]);
  const mp4 = Buffer.alloc(24); mp4.writeUInt32BE(24); mp4.write("ftypM4A ", 4);
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x8b, 0x42, 0x82, 0x84]), Buffer.from("webm"), Buffer.alloc(8)]);
  const ogg = Buffer.alloc(64); ogg.write("OggS"); ogg[26] = 1; ogg[27] = 19; ogg.write("OpusHead", 28);
  for (const [bytes, mimeType] of [[wav(), "audio/wav"], [mp3, "audio/mpeg"], [id3, "audio/mpeg"],
    [mp4, "audio/mp4"], [webm, "audio/webm"], [ogg, "audio/ogg"]]) {
    assert.equal(sniffQuizAudioUploadMimeType(bytes), mimeType);
    assert.equal(decodeQuizAudioUpload({ audioBase64: bytes.toString("base64"), audioMimeType: `${mimeType};codecs=fixture` }).mimeType, mimeType);
  }
  const aac = Buffer.alloc(40); aac.set([0xff, 0xf1, 0x50, 0x80]);
  assert.equal(sniffQuizAudioUploadMimeType(aac), null);
  assert.equal(decodeQuizAudioUpload({ audioBase64: mp4.toString("base64"), audioMimeType: "audio/x-m4a" }).mimeType, "audio/mp4");
  assert.equal(decodeQuizAudioUpload({ audioBase64: mp3.toString("base64"), audioMimeType: "audio/mp3" }).mimeType, "audio/mpeg");
  assert.equal(sniffQuizAudioUploadMimeType(wav().subarray(0, 44)), null);
  assert.equal(sniffQuizAudioUploadMimeType(Buffer.from("not an audio container")), null);
});

test("shared and isolated uploads use trusted rows and audio credentials; status/blob/playback work for both", async t => {
  const f = fixture(t);
  assert.equal(quizBankAudioIdentity(isolated), null);
  for (const [questionId, row] of [[sharedId, shared], [isolatedId, isolated]]) {
    const response = await f.call({ ...payload(questionId), question: "tampered", figure: "9999", correct: false,
      quizKey: "q_stolen", audioKey: "original.webm", identity: { quizKey: "q_stolen" } });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.quizKey, quizBankStorageIdentity(row).quizKey);
    assert.equal(response.body.created, true); assert.equal(response.body.idempotent, false);
    assert.equal(f.rows.get(response.body.quizKey).created_by, phone);
    const status = await f.call({ action: "getQuizAudioStatus", questionId });
    assert.equal(status.body.available, true);
    const blob = await f.call({ action: "getQuizAudioBlob", questionId });
    assert.deepEqual(blob.bytes, wav()); assert.equal(blob.headers["Content-Type"], "audio/wav");
    const playback = await f.call({ action: "getQuizAudioPlayback", questionId });
    assert.equal(playback.statusCode, 200); assert.equal(playback.body.mimeType, "audio/wav");
    assert.match(playback.body.audioUrl, /quiz-explanations\/uploads\/v1/);
  }
  const sheet = await f.call({ action: "getStudyQuiz", chapters: "1" }, { method: "GET" });
  assert.equal(sheet.body.canUploadAudio, true);
  assert.equal(sheet.body.quiz[0].explanationMapped, true); assert.equal(sheet.body.quiz[1].explanationMapped, false);
  assert.equal(f.rows.size, 2, "no shared aliases inserted");
  assert.match(sheet.headers["Cache-Control"], /private, no-store/);
  const writes = f.s3Calls.filter(call => call.kind === "PutObjectCommand");
  assert.equal(writes.length, 2);
  assert.ok(writes.every(call => /\/[a-f0-9]{64}\.wav$/.test(call.input.Key)));
  const count = f.dbCalls.length;
  assert.equal((await f.call(payload("qb_s99_q01"))).statusCode, 404);
  assert.equal(f.dbCalls.length, count);
});

test("existing current/previous/legacy associations, including dangling rows, remain untouched", async t => {
  const f = fixture(t), identity = quizBankStorageIdentity(shared);
  for (const key of audioLookupKeys(identity)) {
    f.rows.clear(); f.objects.clear(); f.dbCalls.length = 0; f.s3Calls.length = 0;
    const original = { quiz_key: key, audio_key: `existing-${key}.mp3`, audio_mime_type: "audio/mpeg", audio_duration_ms: 4000 };
    f.rows.set(key, original);
    for (const contents of [null, Buffer.alloc(0), Buffer.from("original")]) {
      f.s3Calls.length = 0; f.dbCalls.length = 0;
      if (contents) f.objects.set(original.audio_key, { bytes: contents, type: "audio/mpeg" });
      const response = await f.call(payload(sharedId));
      assert.equal(response.statusCode, 409);
      assert.equal(response.body.error, contents?.length ? "quiz_audio_already_exists" : "quiz_audio_requires_repair");
      assert.deepEqual(f.rows.get(key), original);
      assert.deepEqual(f.s3Calls.filter(call => call.input.Bucket === "upload-audio").map(call => [call.kind, call.input.Key]),
        [["HeadObjectCommand", original.audio_key]]);
      assert.equal(f.dbCalls.length, 1); assert.match(f.dbCalls[0].query, /^\s*SELECT/);
      if (contents) assert.deepEqual(f.objects.get(original.audio_key).bytes, contents);
    }
  }
});

test("same-file retries are idempotent, preserve metadata and stay within request budget; different files conflict", async t => {
  const f = fixture(t);
  const first = await f.call(); assert.equal(first.statusCode, 201);
  assert.equal(f.dbCalls.length, 2);
  assert.equal(f.s3Calls.filter(call => call.kind === "PutObjectCommand").length, 1);
  const original = structuredClone([...f.rows.values()][0]);
  f.s3Calls.length = 0; f.dbCalls.length = 0;
  const retry = await f.call({ ...payload(), audioDurationMs: 9999 });
  assert.equal(retry.statusCode, 200); assert.equal(retry.body.idempotent, true);
  assert.equal(retry.body.durationMs, 1200); assert.deepEqual([...f.rows.values()][0], original);
  assert.equal(f.dbCalls.length, 1); assert.deepEqual(f.s3Calls.map(call => call.kind), ["HeadObjectCommand"]);
  const conflict = await f.call(payload(isolatedId, wav(48, 2)));
  assert.equal(conflict.statusCode, 409); assert.equal(conflict.body.error, "quiz_audio_already_exists");
  assert.equal(f.objects.size, 1); assert.deepEqual([...f.rows.values()][0], original);
});

test("concurrent different uploads publish one winner; identical uploads converge without overwriting bytes", async t => {
  for (const identical of [false, true]) await t.test(String(identical), async t => {
    const f = fixture(t);
    let arrivals = 0, release;
    const gate = new Promise(resolve => { release = resolve; });
    f.beforeObject = async ({ kind }) => {
      if (kind !== "PutObjectCommand") return;
      if (++arrivals === 2) release();
      await gate;
    };
    const responses = await Promise.all([f.call(), f.call(payload(isolatedId, identical ? wav() : wav(48, 2)))]);
    assert.deepEqual(responses.map(res => res.statusCode).sort(), identical ? [200, 201] : [201, 409]);
    assert.equal(f.rows.size, 1);
    const winner = [...f.rows.values()][0];
    const winnerBytes = f.objects.get(winner.audio_key).bytes;
    assert.ok(winnerBytes.equals(wav()) || winnerBytes.equals(wav(48, 2)));
    assert.equal(f.objects.size, identical ? 1 : 2, "losing objects are never blindly deleted during another request");
    assert.ok(f.dbCalls.length <= 6);
    assert.equal(f.s3Calls.filter(call => call.kind === "PutObjectCommand").length, 2);
  });
});

test("an alias appearing during object upload prevents insertion and is never migrated or overwritten", async t => {
  const f = fixture(t), identity = quizBankStorageIdentity(shared);
  const original = { quiz_key: identity.previousQuizKeys[0], audio_key: "late-alias.mp3", audio_mime_type: "audio/mpeg" };
  f.beforeInsert = () => f.rows.set(original.quiz_key, original);
  const response = await f.call(payload(sharedId));
  assert.equal(response.statusCode, 409); assert.equal(response.body.error, "quiz_audio_requires_repair");
  assert.equal(f.rows.size, 1); assert.deepEqual(f.rows.get(original.quiz_key), original);
  assert.equal(f.dbCalls.length, 3);
  assert.deepEqual(f.s3Calls.filter(call => call.input.Bucket === "upload-audio").map(call => call.kind), ["PutObjectCommand", "HeadObjectCommand"]);
});

test("a cached false status followed by upload reports repair; a later non-empty object is checked freshly", async t => {
  const f = fixture(t), identity = quizBankStorageIdentity(isolated);
  const row = { quiz_key: identity.quizKey, audio_key: "dangling-isolated.wav", audio_mime_type: "audio/wav" };
  f.rows.set(row.quiz_key, row);
  const status = await f.call({ action: "getQuizAudioStatus", questionId: isolatedId });
  assert.equal(status.body.available, false);
  f.s3Calls.length = 0; f.dbCalls.length = 0;
  const repair = await f.call();
  assert.equal(repair.statusCode, 409); assert.equal(repair.body.error, "quiz_audio_requires_repair");
  assert.equal(repair.body.available, undefined);
  assert.equal(f.dbCalls.length, 1); assert.deepEqual(f.s3Calls.map(call => call.kind), ["HeadObjectCommand"]);
  f.objects.set(row.audio_key, { bytes: wav(), type: "audio/wav" });
  f.s3Calls.length = 0;
  const exists = await f.call();
  assert.equal(exists.statusCode, 409); assert.equal(exists.body.error, "quiz_audio_already_exists");
  assert.deepEqual(f.s3Calls.map(call => call.kind), ["HeadObjectCommand"]);
  assert.deepEqual(f.rows.get(row.quiz_key), row); assert.equal(f.objects.size, 1);
});

test("existing-object HEAD failures stay unavailable and never claim absence or a playable conflict", async t => {
  const f = fixture(t), identity = quizBankStorageIdentity(isolated);
  f.rows.set(identity.quizKey, { quiz_key: identity.quizKey, audio_key: "unreadable.wav", audio_mime_type: "audio/wav" });
  f.beforeObject = ({ kind }) => {
    if (kind === "HeadObjectCommand") throw Object.assign(new Error("AccessDenied"), { $metadata: { httpStatusCode: 403 } });
  };
  const response = await f.call();
  assert.equal(response.statusCode, 503); assert.equal(response.body.error, "service_unavailable");
  assert.equal(f.dbCalls.length, 1);
  assert.deepEqual(f.s3Calls.filter(call => call.input.Bucket === "upload-audio").map(call => call.kind), ["HeadObjectCommand"]);
  assert.equal(f.rows.size, 1); assert.equal(f.objects.size, 0);
});

test("ambiguous legacy audio still requires review without probing an unassigned object", async () => {
  let queries = 0;
  await assert.rejects(saveMissingQuizAudio({ identity: { quizKey: "q2_fixture", legacyQuizKey: "q_legacy", legacySafe: true },
    upload: decodeQuizAudioUpload(payload()), createdBy: phone }, {
    bucket: "fixture", sql: { query: async () => { queries++; return [{ quiz_key: "q_legacy", audio_key: "unassigned.webm" }]; } },
    storage: { send: () => assert.fail("ambiguous legacy objects must not be probed") }, isLegacyAmbiguous: () => true
  }), error => error.statusCode === 409 && error.message === "quiz_audio_requires_review");
  assert.equal(queries, 1);
});

test("database failure before/after commit is recoverable by same-file retry without replacement or deletion", async t => {
  for (const failure of ["before", "after"]) await t.test(failure, async t => {
    const f = fixture(t); f.insertFailure = failure;
    assert.equal((await f.call()).statusCode, 503);
    assert.equal(f.objects.size, 1); assert.equal(f.rows.size, failure === "after" ? 1 : 0);
    f.insertFailure = "";
    const retry = await f.call();
    assert.equal(retry.statusCode, failure === "after" ? 200 : 201);
    assert.equal(retry.body.idempotent, failure === "after");
    assert.equal(f.objects.size, 1); assert.equal(f.rows.size, 1);
    assert.ok(f.s3Calls.every(call => call.kind !== "DeleteObjectCommand"));
  });
});

test("storage/verification errors fail closed and no write is automatically retried", async t => {
  const f = fixture(t);
  f.beforeObject = ({ kind }) => { if (kind === "PutObjectCommand") throw new Error("storage unavailable"); };
  assert.equal((await f.call()).statusCode, 503);
  assert.equal(f.rows.size, 0); assert.equal(f.objects.size, 0);
  assert.equal(f.s3Calls.filter(call => call.kind === "PutObjectCommand").length, 1);
  f.beforeObject = null;
  assert.equal((await f.call()).statusCode, 201);
  const object = [...f.objects.values()][0]; object.metadata.sha256 = "corrupt";
  const response = await f.call();
  assert.equal(response.statusCode, 409); assert.equal(response.body.error, "quiz_audio_upload_conflict");
  assert.equal(f.rows.size, 1); assert.equal(object.metadata.sha256, "corrupt");
});

test("a lost R2 write response leaves recoverable bytes; the next explicit retry verifies the conditional-write conflict", async t => {
  const f = fixture(t);
  f.afterPut = () => { throw new Error("object committed but response lost"); };
  assert.equal((await f.call()).statusCode, 503);
  assert.equal(f.rows.size, 0); assert.equal(f.objects.size, 1);
  f.afterPut = null; f.s3Calls.length = 0;
  assert.equal((await f.call()).statusCode, 201);
  assert.deepEqual(f.s3Calls.map(call => call.kind), ["PutObjectCommand", "HeadObjectCommand"]);
  assert.equal(f.objects.size, 1); assert.equal(f.rows.size, 1);
});

test("unverifiable pre-existing bytes never gain a database association", async t => {
  const f = fixture(t);
  f.insertFailure = "before";
  assert.equal((await f.call()).statusCode, 503);
  const object = [...f.objects.values()][0]; object.type = "text/plain";
  f.insertFailure = "";
  const response = await f.call();
  assert.equal(response.statusCode, 409); assert.equal(response.body.error, "quiz_audio_upload_conflict");
  assert.equal(f.rows.size, 0); assert.equal(f.objects.size, 1); assert.equal(object.type, "text/plain");
});

test("upload deadline aborts transports and a late storage response never starts a database insert", async () => {
  const upload = decodeQuizAudioUpload(payload()), identity = quizBankStorageIdentity(isolated);
  let finishPut, storageSignal, dbCalls = 0;
  const pending = new Promise(resolve => { finishPut = resolve; });
  const sql = { query: async (_query, _params, options) => { dbCalls++; assert.ok(options.fetchOptions.signal); return []; } };
  const storage = { send: (_command, options) => { storageSignal = options.abortSignal; return pending; } };
  await assert.rejects(saveMissingQuizAudio({ identity, upload, createdBy: phone }, { sql, storage, bucket: "fixture", timeoutMs: 20 }),
    error => error.statusCode === 503 && /timeout/.test(error.message));
  assert.equal(storageSignal.aborted, true);
  finishPut({}); await new Promise(resolve => setImmediate(resolve));
  assert.equal(dbCalls, 1);
});

test("request cancellation aborts database work, cleans listeners, and prevents object writes", async t => {
  const f = fixture(t), controller = new AbortController();
  f.beforeQuery = async ({ options }) => {
    controller.abort();
    assert.equal(options.signal.aborted, true);
    options.signal.throwIfAborted();
  };
  const response = await f.call(payload(), { request: { signal: controller.signal } });
  assert.equal(response.statusCode, 503);
  assert.equal(f.dbCalls.length, 1); assert.equal(f.objects.size, 0);
  assert.equal(f.s3Calls.filter(call => call.kind === "PutObjectCommand").length, 0);
});

test("an already-aborted request never starts upload I/O, including on a warm archive cache", async t => {
  const f = fixture(t), controller = new AbortController(); controller.abort();
  assert.equal((await f.call(payload(), { request: { signal: controller.signal } })).statusCode, 503);
  assert.equal(f.dbCalls.length, 0); assert.equal(f.objects.size, 0);
  assert.equal(f.s3Calls.filter(call => call.kind === "PutObjectCommand").length, 0);
});
