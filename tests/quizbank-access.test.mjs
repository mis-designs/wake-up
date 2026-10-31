import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { S3Client } from "@aws-sdk/client-s3";
import { neonConfig } from "@neondatabase/serverless";
import { quizBankStorageIdentity } from "../api/quizbank-catalog.mjs";

// Only dummy configuration and intercepted transports: never contact GAS/R2/Neon.
const secret = "quizbank-access-unit-secret", adminPhone = "39123456789";
Object.assign(process.env, {
  QUIZBANK_ACCESS_MODE: "separate",
  SESSION_SECRET: secret, GAS_ACCESS_URL: "https://access.invalid/", GAS_SECRET: "fixture",
  QUIZ_GAS_URL: "https://tts.invalid/", QUIZ_PROXY_SECRET: "fixture", ADMIN_PHONE_NUMBERS: adminPhone,
  DATABASE_URL: "postgresql://test:test@unit-test.neon.tech/test",
  QUIZ_AUDIO_R2_BUCKET: "access-audio", QUIZ_AUDIO_R2_ACCOUNT_ID: "audio-fixture",
  QUIZ_AUDIO_R2_ACCESS_KEY_ID: "audio-fixture-key", QUIZ_AUDIO_R2_SECRET_ACCESS_KEY: "audio-fixture-secret",
  quiz_bank_access_key_id: "archive-fixture-key", quiz_bank_secret_access_key: "archive-fixture-secret",
  QUIZBANK_R2_ACCOUNT_ID: "archive-fixture", QUIZBANK_R2_BUCKET: "access-archive", QUIZBANK_R2_KEY: "access-unit.json"
});
const { default: handler } = await import("../api/quizbank.js");
const { default: magicBookHandler } = await import("../api/quiz.js");
const turn = () => new Promise(setImmediate);
const sign = claims => {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", secret).update(body).digest("base64url")}`;
};
const claimsOf = token => JSON.parse(Buffer.from(token.split(".")[0], "base64url"));
let serial = 0;
function account(overrides = {}) {
  const claims = { phone: String(39000000000 + ++serial), deviceId: "access_test_device", purpose: "access",
    role: "user", exp: Date.now() + 900_000, nonce: crypto.randomUUID(), ...overrides };
  return { phone: claims.phone, deviceId: claims.deviceId, token: sign(claims) };
}
function requestFor(user, params = {}, method = "POST", extra = {}) {
  return Object.assign(new EventEmitter(), { method, headers: { authorization: `Bearer ${user.token}` },
    [method === "GET" ? "query" : "body"]: { phone: user.phone, deviceId: user.deviceId,
      action: "refreshQuizSession", ...params } }, extra);
}
async function dispatch(req, target = handler) {
  const res = { headers: {}, statusCode: 200, setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; },
    end(body) { this.body = body; return this; } };
  await target(req, res);
  assert.equal(req.listenerCount("aborted"), 0, "request listeners are cleaned up");
  return res;
}
const call = (user, params, method, extra) => dispatch(requestFor(user, params, method, extra));
async function fixture(t) {
  const state = { gas: [], storage: [], queries: [], tts: [], reply: { success: true, Quiz_bank: 1 } };
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const parsed = new URL(url);
    if (parsed.hostname === "tts.invalid") {
      state.tts.push(parsed);
      return Response.json({ audio: Buffer.from("ID3fixture").toString("base64"), translation: "পরীক্ষা" });
    }
    assert.equal(parsed.hostname, "access.invalid", "no unmocked external request");
    const body = JSON.parse(options.body);
    assert.equal(body.action, "validate"); assert.equal(body.registerDevice, false);
    assert.ok(options.signal);
    state.gas.push({ body, signal: options.signal });
    return state.fetch ? await state.fetch(options) : Response.json(state.reply);
  });
  t.mock.method(S3Client.prototype, "send", async command => {
    state.storage.push(command);
    if (state.send) return state.send(command);
    assert.fail("storage before authorization");
  });
  const oldFetch = neonConfig.fetchFunction;
  t.after(() => { neonConfig.fetchFunction = oldFetch; });
  neonConfig.fetchFunction = async (_url, options) => {
    const query = JSON.parse(options.body); state.queries.push(query);
    if (state.query) return state.query(query);
    assert.fail("database before authorization");
  };
  // A fresh module gives cache-bound tests their own process-registry fixture.
  const { authorizeQuizBankPreview } = await import(`../api/quiz.js?access-test=${crypto.randomUUID()}`);
  state.gate = (user, params, extra) => authorizeQuizBankPreview(requestFor(user, params, "POST", extra));
  return state;
}
const rejection = (status, message) => error => error.statusCode === status && (!message || error.message === message);

function accessMode(t, mode) {
  const previous = process.env.QUIZBANK_ACCESS_MODE;
  if (mode === undefined) delete process.env.QUIZBANK_ACCESS_MODE;
  else process.env.QUIZBANK_ACCESS_MODE = mode;
  t.after(() => previous === undefined ? delete process.env.QUIZBANK_ACCESS_MODE : process.env.QUIZBANK_ACCESS_MODE = previous);
}

test("promotion is the default: verified Magic Book accounts enter without a Quiz_bank grant", async t => {
  accessMode(t, undefined);
  const f = await fixture(t);
  for (const fields of [{}, { Quiz_bank: 0 }, { Quiz_bank: "" }, { Quiz_bank: null }, { Quiz_bank: 1 }]) {
    f.reply = { success: true, ...fields };
    const response = await call(account(), { QUIZBANK_ACCESS_MODE: "separate" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.role, "user");
    assert.equal(response.body.canUploadAudio, false);
    assert.equal(response.body.Quiz_bank, undefined);
  }
  assert.equal(f.gas.length, 5);
  assert.equal(f.storage.length + f.queries.length + f.tts.length, 0);
});

test("promotion never admits expired, absent, revoked-device or unverifiable accounts", async t => {
  accessMode(t, "magicbook");
  const f = await fixture(t);
  for (const [error, status] of [["expired", 401], ["not_found", 401], ["device_replaced", 403],
    ["device_mismatch", 403], ["device_limit", 403], ["unauthorized", 401]]) {
    f.reply = { success: false, error, Quiz_bank: 1 };
    assert.equal((await call(account())).statusCode, status);
  }
  f.reply = {};
  assert.equal((await call(account())).statusCode, 401);
  f.fetch = () => { throw new Error("unavailable"); };
  assert.equal((await call(account())).statusCode, 503);
  const reads = f.gas.length;
  const user = account();
  for (const [who, params] of [[{ ...user, token: "forged" }, {}], [account({ purpose: "trial" }), {}],
    [user, { deviceId: "another_device" }], [user, { action: "saveQuizAudio", role: "admin", canUploadAudio: true }]]) {
    const result = await call(who, params);
    assert.ok([401, 403].includes(result.statusCode));
  }
  assert.equal(f.gas.length, reads);
  assert.equal(f.storage.length + f.queries.length + f.tts.length, 0);
});

test("promotion reuses one validation, renews once and still rechecks Magic Book expiry after 60s", async t => {
  accessMode(t, "magicbook");
  const f = await fixture(t), start = Date.now(); let now = start;
  t.mock.method(Date, "now", () => now);
  const user = account(); f.reply = { success: true };
  await Promise.all([f.gate(user), f.gate(user), f.gate(user)]);
  assert.equal(f.gas.length, 1);
  f.reply = { success: false, error: "expired" };
  now = start + 59_999; await f.gate(user); assert.equal(f.gas.length, 1);
  now = start + 60_000;
  await assert.rejects(f.gate(user), rejection(401, "expired"));
  assert.equal(f.gas.length, 2);
  f.reply = { success: true, Quiz_bank: 0 };
  const renewed = await call(account({ exp: 1 }));
  assert.equal(renewed.statusCode, 200);
  assert.ok(renewed.body.accessToken);
  assert.equal(f.gas.length, 3, "expired signed session renews with one shared GAS validation");
});

test("re-enabling separate access cannot reuse a promotional cached or pending grant", async t => {
  accessMode(t, "magicbook");
  const f = await fixture(t), user = account(); f.reply = { success: true, Quiz_bank: 0 };
  await f.gate(user); assert.equal(f.gas.length, 1);
  process.env.QUIZBANK_ACCESS_MODE = "separate";
  await assert.rejects(f.gate(user, { QUIZBANK_ACCESS_MODE: "magicbook" }), rejection(403, "quizbank_access_denied"));
  assert.equal(f.gas.length, 2);
  f.reply = { success: true, Quiz_bank: 1 };
  await f.gate(user); assert.equal(f.gas.length, 3);
  const pendingUser = account(); let resolve;
  process.env.QUIZBANK_ACCESS_MODE = "magicbook";
  f.fetch = () => new Promise(r => { resolve = r; });
  const pending = f.gate(pendingUser); await turn();
  process.env.QUIZBANK_ACCESS_MODE = "separate";
  f.fetch = null; f.reply = { success: true, Quiz_bank: 0 };
  await assert.rejects(f.gate(pendingUser), rejection(403, "quizbank_access_denied"));
  resolve(Response.json({ success: true, Quiz_bank: 0 })); await pending;
  await assert.rejects(f.gate(pendingUser), rejection(403, "quizbank_access_denied"));
});

test("unknown server access mode fails closed before external work", async t => {
  accessMode(t, "typo");
  const f = await fixture(t);
  assert.equal((await call(account())).statusCode, 503);
  assert.equal(f.gas.length + f.storage.length + f.queries.length + f.tts.length, 0);
});

test("only exact GAS Quiz_bank numeric 1 or trimmed string 1 grants access", async t => {
  const f = await fixture(t);
  for (const flag of [1, "1", " 1 ", "\t1\n"]) {
    f.reply = { success: true, Quiz_bank: flag };
    const response = await call(account());
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.role, "user"); assert.equal(response.body.canUploadAudio, false);
    assert.equal(response.body.authData, undefined); assert.equal(response.body.Quiz_bank, undefined);
  }
  for (const fields of [{ Quiz_bank: 0 }, { Quiz_bank: "0" }, { Quiz_bank: "" }, {}, { Quiz_bank: true },
    { Quiz_bank: false }, { Quiz_bank: null }, { Quiz_bank: "01" }, { Quiz_bank: "1.0" }, { Quiz_bank: [1] },
    { Quiz_bank: {} }, { Quiz_bank: 2 }, { quiz_bank: 1 }, { Quiz_Bank: 1 }, { QUIZ_BANK: 1 }, { quizBank: 1 }]) {
    f.reply = { success: true, ...fields };
    const response = await call(account());
    assert.equal(response.statusCode, 403, JSON.stringify(fields));
    assert.equal(response.body.error, "quizbank_access_denied");
  }
  f.reply = { status: "success", Quiz_bank: 1 };
  assert.equal((await call(account())).statusCode, 200, "existing common GAS success contract is preserved");
  assert.equal(f.storage.length + f.queries.length + f.tts.length, 0);
});

test("old GAS, unknown auth and unsuccessful responses fail closed, even with a grant field", async t => {
  const f = await fixture(t), user = account();
  for (const reply of [{ success: true }, { status: "success" }, {}, null, [], { Quiz_bank: 1 },
    { success: "true", Quiz_bank: 1 }, { status: "ok", Quiz_bank: 1 },
    { success: false, error: "unknown_auth", Quiz_bank: 1 }]) {
    f.reply = reply;
    const response = await call(user);
    assert.equal(response.statusCode, reply?.success === true || reply?.status === "success" ? 403 : 401);
  }
  assert.equal(f.gas.length, 9, "neither denial nor unknown auth is cached");
  f.reply = { success: true, Quiz_bank: 1 };
  assert.equal((await call(user)).statusCode, 200);
  assert.equal(f.gas.length, 10);
});

test("body/query/role/token flag spoofing and admin-phone user tokens cannot grant permission", async t => {
  const f = await fixture(t); f.reply = { success: true, Quiz_bank: 0 };
  for (const user of [account(), account({ phone: adminPhone }), account({ role: "admin" }),
    account({ Quiz_bank: 1, canUploadAudio: true, authData: { success: true, Quiz_bank: 1 } })]) {
    const params = { role: "admin", Quiz_bank: 1, canUploadAudio: true, forceValidate: false,
      authData: { success: true, Quiz_bank: 1 } };
    const response = await call(user, params);
    assert.equal(response.statusCode, 403); assert.equal(response.body.error, "quizbank_access_denied");
    const query = await call(user, { ...params, action: "catalog" }, "GET");
    assert.equal(query.statusCode, 403);
  }
  const calls = f.gas.length;
  const ordinary = account({ phone: adminPhone });
  const upload = await call(ordinary, { action: "saveQuizAudio", role: "admin", Quiz_bank: 1,
    audioBase64: "invalid", chapters: "not-a-sheet", questionId: "forged" });
  assert.equal(upload.statusCode, 403); assert.equal(upload.body.error, "quizbank_admin_required");
  assert.equal(f.gas.length, calls, "ordinary upload denied before GAS, decoding and archive");
  assert.equal(f.storage.length + f.queries.length, 0);
});

test("only a signed allowlisted admin bypasses GAS; nonallowlisted admin remains ordinary", async t => {
  const f = await fixture(t);
  const admin = account({ phone: adminPhone, role: "admin" });
  f.fetch = () => assert.fail("valid admin bypass must not call GAS");
  const response = await call(admin);
  assert.equal(response.statusCode, 200); assert.equal(response.body.role, "admin");
  assert.equal(response.body.canUploadAudio, true);
  const invalidFile = await call(admin, { action: "saveQuizAudio", audioBase64: "!" });
  assert.equal(invalidFile.statusCode, 400, "only authorized admins reach upload decoding");
  assert.equal(f.gas.length, 0); assert.equal(f.storage.length, 0);
  f.fetch = null;
  for (const user of [account({ role: "admin" }), account({ phone: adminPhone })]) {
    const result = await call(user);
    assert.equal(result.body.role, "user"); assert.equal(result.body.canUploadAudio, false);
    assert.equal(claimsOf(result.body.quizSessionToken).role, "user");
    const upload = await call(user, { action: "saveQuizAudio", audioBase64: "!" });
    assert.equal(upload.body.error, "quizbank_admin_required");
  }
});

test("unsigned, forged, other-purpose and mismatched sessions are rejected before any I/O", async t => {
  const f = await fixture(t), user = account();
  for (const [who, params] of [[{ ...user, token: "" }, {}], [{ ...user, token: "forged" }, {}],
    [{ ...user, token: user.token + "x" }, {}], [user, { phone: "39999999999" }],
    [user, { deviceId: "another_device" }], [account({ purpose: "quiz" }), {}],
    [account({ purpose: "quizbank", aud: "quizbank", role: "admin" }), {}]]) {
    assert.equal((await call(who, params)).statusCode, 401);
  }
  assert.equal(f.gas.length + f.storage.length + f.queries.length, 0);
});

test("common expiry/device failures retain their statuses and never populate entitlement cache", async t => {
  const f = await fixture(t), user = account();
  for (const [error, status] of [["expired", 401], ["not_found", 401], ["device_replaced", 403],
    ["device_mismatch", 403], ["device_limit", 403], ["unauthorized", 401]]) {
    f.reply = { success: false, error, Quiz_bank: 1 };
    for (let i = 0; i < 2; i++) {
      const response = await call(user);
      assert.equal(response.statusCode, status); assert.equal(response.body.error, error);
    }
  }
  assert.equal(f.gas.length, 12);
  f.reply = { success: true, Quiz_bank: 1 };
  assert.equal((await call(user)).statusCode, 200); assert.equal(f.gas.length, 13);
});

test("GAS service errors are 503, not entitlement denials; no retries or cached failures", async t => {
  const f = await fixture(t), user = account();
  for (const fetch of [() => { throw new TypeError("network failure"); },
    () => new Response("unavailable", { status: 502 }), () => new Response("limited", { status: 429 }),
    () => new Response("invalid json"), ...["busy", "temporary_error", "server_error"].map(error =>
      () => Response.json({ success: false, error, Quiz_bank: 1 }))]) {
    f.fetch = fetch;
    const before = f.gas.length;
    const response = await call(user);
    assert.equal(response.statusCode, 503); assert.equal(response.body.error, "service_unavailable");
    assert.equal(f.gas.length, before + 1, "one attempt per explicit request");
  }
  f.fetch = null;
  assert.equal((await call(user)).statusCode, 200); assert.equal(f.gas.length, 8);
  assert.equal(f.storage.length + f.queries.length, 0);
});

test("entitlement cache TTL starts before GAS response, never slides and expires at exactly 60s", async t => {
  const f = await fixture(t), start = Date.now(); let now = start;
  t.mock.method(Date, "now", () => now);
  const user = account();
  f.fetch = () => { now += 9_000; return Response.json({ success: true, Quiz_bank: 1 }); };
  await f.gate(user); assert.equal(f.gas.length, 1);
  f.fetch = null; f.reply = { success: true, Quiz_bank: 0 };
  now = start + 59_999;
  await f.gate(user); await f.gate(user); assert.equal(f.gas.length, 1);
  now = start + 60_000;
  await assert.rejects(f.gate(user), rejection(403, "quizbank_access_denied"));
  await assert.rejects(f.gate(user), rejection(403, "quizbank_access_denied"));
  assert.equal(f.gas.length, 3, "denial is not cached and response latency never extends TTL");
});

test("expired access token cannot reuse a positive cache; renewal preserves account/device checks", async t => {
  const f = await fixture(t), start = Date.now(); let now = start;
  t.mock.method(Date, "now", () => now);
  const user = account({ exp: start + 5_000 });
  await f.gate(user); now += 4_999; await f.gate(user); assert.equal(f.gas.length, 1);
  now++;
  f.reply = { success: false, error: "expired", Quiz_bank: 1 };
  await assert.rejects(f.gate(user), rejection(401, "expired"));
  f.reply = { success: false, error: "device_mismatch", Quiz_bank: 1 };
  await assert.rejects(f.gate(user), rejection(403, "device_mismatch"));
  f.reply = { success: true, Quiz_bank: 0 };
  await assert.rejects(f.gate(user), rejection(403, "quizbank_access_denied"));
  assert.equal(f.gas.length, 4);
});

test("cache identity includes verified phone, device and signed session, never caller identity/flags", async t => {
  const f = await fixture(t), first = account();
  await f.gate(first); await f.gate(first);
  assert.equal(f.gas.length, 1);
  f.reply = { success: true, Quiz_bank: 0 };
  for (const user of [account({ phone: first.phone }), account({ phone: first.phone, deviceId: "different_device" }),
    account({ deviceId: first.deviceId })]) {
    await assert.rejects(f.gate(user), rejection(403));
  }
  const before = f.gas.length;
  await assert.rejects(f.gate(first, { deviceId: "different_device" }), rejection(401));
  assert.equal(f.gas.length, before);
  await f.gate(first, { Quiz_bank: 0, authData: { success: false }, forceValidate: true });
  assert.equal(f.gas.length, before, "body cannot select validation mode or replace private authData");
  assert.ok(f.gas.every(({ body }) => !Object.hasOwn(body, "Quiz_bank")));
});

test("expiry during GAS fails closed; renewed grants also measure TTL from request start", async t => {
  const f = await fixture(t), start = Date.now(); let now = start;
  t.mock.method(Date, "now", () => now);
  const user = account({ exp: start + 5_000 });
  f.fetch = () => { now += 5_000; return Response.json({ success: true, Quiz_bank: 1 }); };
  await assert.rejects(f.gate(user), rejection(401, "token_expired"));
  assert.equal(f.gas.length, 1);
  const renewalStart = now;
  const renewed = await f.gate(user);
  assert.equal(f.gas.length, 2, "expired session renewal uses one fresh GAS response");
  const current = { ...user, token: renewed.access.accessToken };
  f.fetch = null; f.reply = { success: true, Quiz_bank: 0 };
  now = renewalStart + 59_999; await f.gate(current); assert.equal(f.gas.length, 2);
  now++;
  await assert.rejects(f.gate(current), rejection(403, "quizbank_access_denied"));
  assert.equal(f.gas.length, 3, "renewal latency does not extend the revocation window");
});

test("renewal coalesces and reuses one private GAS result; public session is isolated and never invents flags", async t => {
  const f = await fixture(t), user = account({ phone: adminPhone, exp: Date.now() - 1 });
  let release;
  f.fetch = () => new Promise(resolve => { release = () => resolve(Response.json({ success: true, Quiz_bank: 1, privateFixture: "private" })); });
  const first = f.gate(user), second = f.gate(user);
  await turn(); assert.equal(f.gas.length, 1); release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.access.accessToken, b.access.accessToken); assert.equal(a.role, "user");
  assert.equal(a.access.authData.privateFixture, "private");
  assert.equal(Object.getOwnPropertyDescriptor(a.access, "authData").enumerable, false);
  assert.equal({ ...a.access }.authData, undefined); assert.doesNotMatch(JSON.stringify(a), /privateFixture|Quiz_bank/);
  f.fetch = () => assert.fail("renewed session should have the same positive cache entry");
  const renewed = { ...user, token: a.access.accessToken };
  const cached = await f.gate(renewed);
  assert.equal(cached.access.authData, undefined, "a valid-token shortcut never manufactures trusted GAS data");
  assert.equal(f.gas.length, 1);
  f.fetch = null;
  const result = await call(account({ exp: Date.now() - 1 }));
  assert.equal(result.statusCode, 200); assert.equal(f.gas.length, 2, "route renewal performs exactly one GAS call");
  assert.equal(result.headers["X-Access-Token"], result.body.accessToken);
  const payload = claimsOf(result.body.quizSessionToken);
  assert.equal(payload.purpose, "quizbank"); assert.equal(payload.aud, "quizbank"); assert.equal(payload.role, "user");
  assert.equal(payload.Quiz_bank, undefined); assert.equal(payload.authData, undefined);
  assert.equal(result.body.authData, undefined); assert.equal(result.body.Quiz_bank, undefined);
});

test("expired signed admin bypass renews only after common validation, never from phone alone", async t => {
  const f = await fixture(t);
  f.reply = { success: true, Quiz_bank: 0 };
  const admin = account({ phone: adminPhone, role: "admin", exp: 1 });
  const renewed = await call(admin);
  assert.equal(renewed.statusCode, 200); assert.equal(renewed.body.canUploadAudio, true);
  assert.equal(claimsOf(renewed.body.accessToken).role, "admin"); assert.equal(f.gas.length, 1);
  const ordinary = await call(account({ phone: adminPhone, exp: 1 }));
  assert.equal(ordinary.statusCode, 403); assert.equal(ordinary.body.error, "quizbank_access_denied");
  f.reply = { success: false, error: "expired", Quiz_bank: 1 };
  assert.equal((await call(admin)).statusCode, 401); assert.equal(f.gas.length, 3);
});

test("positive registry is capped at 256 and eviction does not extend surviving TTLs", async t => {
  const f = await fixture(t), users = Array.from({ length: 257 }, () => account());
  for (const user of users.slice(0, 256)) await f.gate(user);
  assert.equal(f.gas.length, 256);
  await f.gate(users[0]); await f.gate(users[256]);
  assert.equal(f.gas.length, 257);
  await f.gate(users[0]); assert.equal(f.gas.length, 257, "recently used entry survives");
  await f.gate(users[1]); assert.equal(f.gas.length, 258, "257th entry evicts the least recently used grant");
});

test("64 pending cap rejects overflow before GAS; identical reads coalesce and slots recover", async t => {
  const f = await fixture(t), users = Array.from({ length: 65 }, () => account()), releases = [];
  f.fetch = () => new Promise(resolve => releases.push(() => resolve(Response.json({ success: true, Quiz_bank: 1 }))));
  const pending = users.slice(0, 64).map(user => f.gate(user));
  const duplicate = f.gate(users[0]);
  await turn(); assert.equal(f.gas.length, 64);
  await assert.rejects(f.gate(users[64]), rejection(503, "quizbank_access_busy"));
  assert.equal(f.gas.length, 64);
  releases.forEach(release => release());
  await Promise.all([...pending, duplicate]);
  f.fetch = null;
  await f.gate(users[64]); assert.equal(f.gas.length, 65);
  await f.gate(users[0]); assert.equal(f.gas.length, 65);
});

test("concurrent denials share only in-flight work, then a new request checks GAS again", async t => {
  const f = await fixture(t), user = account(); let release;
  f.fetch = () => new Promise(resolve => { release = () => resolve(Response.json({ success: true, Quiz_bank: 0 })); });
  const first = assert.rejects(f.gate(user), rejection(403));
  const second = assert.rejects(f.gate(user), rejection(403));
  await turn(); assert.equal(f.gas.length, 1); release(); await Promise.all([first, second]);
  f.fetch = null; await f.gate(user); assert.equal(f.gas.length, 2);
});

test("cancellation detaches one waiter; last cancellation aborts GAS without storing a grant", async t => {
  const f = await fixture(t), user = account(), controller = new AbortController(); let release, transport;
  f.fetch = options => { transport = options.signal; return new Promise(resolve => {
    release = () => resolve(Response.json({ success: true, Quiz_bank: 1 }));
  }); };
  const cancelled = assert.rejects(f.gate(user, {}, { signal: controller.signal }), rejection(503, "quizbank_request_cancelled"));
  const survivor = f.gate(user);
  await turn(); controller.abort(); await cancelled;
  assert.equal(transport.aborted, false, "remaining waiter keeps shared work alive");
  release(); await survivor; assert.equal(f.gas.length, 1);
  const other = account(), abandoned = new AbortController();
  const last = assert.rejects(f.gate(other, {}, { signal: abandoned.signal }), rejection(503));
  await turn(); abandoned.abort(); await last; assert.equal(transport.aborted, true);
  release(); await turn(); // Even an upstream ignoring abort cannot publish a positive cache entry.
  f.fetch = null; f.reply = { success: true, Quiz_bank: 0 };
  await assert.rejects(f.gate(other), rejection(403)); assert.equal(f.gas.length, 3);
  const before = f.gas.length;
  await assert.rejects(f.gate(account(), {}, { signal: abandoned.signal }), rejection(503));
  assert.equal(f.gas.length, before, "already-cancelled calls never start GAS");
});

test("GAS deadline covers headers and JSON body, aborts transports and releases pending work without retry", async t => {
  const f = await fixture(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const stalledBody of [false, true]) {
    const user = account(); let transport;
    f.fetch = options => {
      transport = options.signal;
      return stalledBody ? { status: 200, ok: true, json: () => new Promise(() => {}) } : new Promise(() => {});
    };
    const before = f.gas.length;
    const pending = call(user);
    await turn(); t.mock.timers.tick(10_000);
    const response = await pending;
    assert.equal(response.statusCode, 503); assert.equal(response.body.error, "service_unavailable");
    assert.equal(transport.aborted, true); assert.equal(f.gas.length, before + 1);
    f.fetch = null;
    assert.equal((await call(user)).statusCode, 200); assert.equal(f.gas.length, before + 2);
  }
});

const readActions = [
  ["catalog", "GET"], ["getStudyQuiz", "GET"], ["refreshQuizSession", "POST"],
  ["getItalianAudio", "GET"], ["getBengaliAudio", "GET"], ["getTTS", "GET"],
  ["getQuizAudioStatus", "POST"], ["getQuizAudioBlob", "POST"], ["getQuizAudioPlayback", "POST"]
];
test("every catalog/help/TTS/media action is gated before storage, even with a warmed archive", async t => {
  const f = await fixture(t), user = account(); f.reply = { success: true, Quiz_bank: 0 };
  for (const [action, method] of readActions) {
    const response = await call(user, { action, chapters: "1", questionId: "qb_s01_q01", text: "পরীক্ষা" }, method);
    assert.equal(response.statusCode, 403, action); assert.equal(response.body.error, "quizbank_access_denied", action);
  }
  assert.equal(f.gas.length, readActions.length);
  assert.equal(f.storage.length + f.queries.length + f.tts.length, 0);
});

for (const mode of ["separate", "magicbook"]) test(`ordinary users can read catalog/audio/help in ${mode} mode, never upload`, async t => {
  accessMode(t, mode);
  const previousKey = process.env.QUIZBANK_R2_KEY;
  process.env.QUIZBANK_R2_KEY = crypto.randomUUID();
  t.after(() => { process.env.QUIZBANK_R2_KEY = previousKey; });
  const f = await fixture(t), user = account();
  f.reply = { success: true, Quiz_bank: mode === "separate" ? 1 : 0 };
  const row = { question: "Domanda isolata per prova permessi.", correct: true, figure: "" };
  const identity = quizBankStorageIdentity(row), bytes = Buffer.from("ID3fixture");
  const archive = Array.from({ length: 1500 }, (_, i) => ({
    id: `qb_s${String(Math.floor(i / 30) + 1).padStart(2, "0")}_q${String(i % 30 + 1).padStart(2, "0")}`,
    scheda: Math.floor(i / 30) + 1, numero_domanda: i % 30 + 1, domanda: i ? `Fixture ${i}` : row.question,
    risposta: "V", risposta_corretta: true, ha_figura: false, numero_figura: null
  }));
  f.send = command => {
    if (command.input.Bucket === "access-archive") return { Body: Readable.from([Buffer.from(JSON.stringify(archive))]) };
    assert.equal(command.input.Bucket, "access-audio");
    if (command.constructor.name === "HeadObjectCommand") return { ContentLength: bytes.length };
    assert.equal(command.constructor.name, "GetObjectCommand"); return { Body: Readable.from([bytes]) };
  };
  f.query = ({ query, params }) => {
    assert.match(query, /^\s*SELECT/); assert.ok(params[0].includes(identity.quizKey));
    return Response.json({ command: "SELECT", rowCount: 1,
      fields: ["quiz_key", "audio_key", "audio_mime_type", "audio_duration_ms"].map(name =>
        ({ name, dataTypeID: name === "audio_duration_ms" ? 23 : 25 })),
      rows: [[identity.quizKey, "fixture.mp3", "audio/mpeg", 1200]] });
  };
  for (const [action, method] of readActions) {
    const response = await call(user, { action, chapters: "1", questionId: "qb_s01_q01", text: "পরীক্ষা" }, method);
    assert.equal(response.statusCode, 200, action);
    assert.match(response.headers["Cache-Control"], /private, no-store/);
    if (["catalog", "getStudyQuiz", "refreshQuizSession"].includes(action)) {
      assert.equal(response.body.role, "user"); assert.equal(response.body.canUploadAudio, false);
    }
    if (action === "getStudyQuiz") {
      assert.equal(response.body.quiz.length, 30); assert.equal(response.body.quiz[0].explanationMapped, false);
    }
    if (action === "getQuizAudioStatus") assert.equal(response.body.available, true);
    if (action === "getQuizAudioBlob") assert.deepEqual(response.body, bytes);
    if (action === "getQuizAudioPlayback") assert.match(response.body.audioUrl, /fixture.mp3/);
  }
  assert.equal(f.gas.length, 1, "navigation and visible-row/media reads reuse the same bounded grant");
  assert.equal(f.queries.length, 3); assert.equal(f.tts.length, 3);
  assert.equal(f.storage.filter(command => command.input.Bucket === "access-archive").length, 1);
  const before = f.storage.length + f.queries.length;
  const upload = await call(user, { action: "saveQuizAudio", audioBase64: "invalid", role: "admin" });
  assert.equal(upload.statusCode, 403); assert.equal(upload.body.error, "quizbank_admin_required");
  assert.equal(f.storage.length + f.queries.length, before); assert.equal(f.gas.length, 1);
  const admin = account({ role: "admin", phone: adminPhone });
  for (const action of ["catalog", "getStudyQuiz"]) {
    const response = await call(admin, { action, chapters: "1" }, "GET");
    assert.equal(response.body.role, "admin"); assert.equal(response.body.canUploadAudio, true);
  }
  f.reply = { success: true, Quiz_bank: 0 };
  assert.equal((await call(account(), { action: "catalog" }, "GET")).statusCode, mode === "separate" ? 403 : 200, "warm archive still follows the current verified access policy");
});

test("QuizBank quiz-session tokens cannot unlock MagicBook or substitute for access tokens", async t => {
  const f = await fixture(t), user = account();
  const session = await call(user), quizSessionToken = session.body.quizSessionToken;
  assert.equal(session.statusCode, 200);
  for (const [action, method] of [["getItalianAudio", "GET"], ["checkQuiz", "POST"]]) {
    const response = await dispatch(requestFor(user, { action, quizSessionToken, text: "Test", chapters: "1", answers: [] }, method), magicBookHandler);
    assert.equal(response.statusCode, 401, action);
  }
  const substitute = await call({ ...user, token: quizSessionToken });
  assert.equal(substitute.statusCode, 401);
  assert.equal(f.tts.length, 0);
  // A normal quiz-purpose token remains usable by the original endpoint, without extra GAS.
  const normalQuiz = sign({ ...claimsOf(user.token), purpose: "quiz" });
  const normal = await dispatch(requestFor(user, { action: "getItalianAudio", quizSessionToken: normalQuiz, text: "Test" }, "GET"), magicBookHandler);
  assert.equal(normal.statusCode, 200); assert.equal(f.tts.length, 1);
  assert.equal(f.gas.length, 1, "MagicBook signed-session playback behavior is unchanged");
});
