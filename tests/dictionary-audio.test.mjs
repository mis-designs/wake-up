import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { dictionaryAudioText } from "../api/dictionary-audio.mjs";

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const fallback = JSON.parse(read("data/patente/quiz-help-runtime-v2.json"));
const source = read("magic-dictionary.js");
const localEntry = Object.entries(fallback.words).find(([, value]) => value[0]?.length > 2 && /[\u0980-\u09ff]/u.test(value[1]));
const trim = value => value.normalize("NFKC").trim().replace(/[।.]+$/u, "").trim();

test("dictionary TTS resolves only exact catalog entries in the requested language", () => {
  const [entryId, entry] = localEntry;
  assert.equal(dictionaryAudioText({ entryId, language: "it", text: entry[0] }), trim(entry[0]));
  assert.equal(dictionaryAudioText({ entryId, language: "bn", text: entry[1] }), trim(entry[1]));
  for (const request of [
    { entryId, language: "bn", text: entry[0] },
    { entryId, language: "en", text: entry[0] },
    { entryId: "__proto__", language: "it", text: "arbitrary" },
    { entryId: "../private", language: "it", text: entry[0] },
    { entryId, language: "it", text: "arbitrary text for billing abuse" }
  ]) assert.equal(dictionaryAudioText(request), "");
  const runtime = { entries: { ai_kw_test: { bn: "সঠিক শব্দ", canonical_italian: "Parola corretta" } } };
  assert.equal(dictionaryAudioText({ entryId: "ai_kw_test", language: "bn", text: "সঠিক শব্দ" }, runtime), "সঠিক শব্দ");
});

test("authenticated dictionary endpoint forwards separate IT/BN actions, rejects unauthorized access", async t => {
  const config = { GAS_ACCESS_URL: "https://auth.test/", GAS_SECRET: "test-auth", SESSION_SECRET: "test-dictionary-session-secret", QUIZ_GAS_URL: "https://audio.test/", QUIZ_PROXY_SECRET: "test-proxy" };
  for (const [key, value] of Object.entries(config)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  const { default: handler } = await import(`../api/quiz.js?dictionary-test`);
  const phone = "39123456789", deviceId = "test_device_1234";
  const payload = Buffer.from(JSON.stringify({ phone, deviceId, purpose: "access", role: "user", exp: Date.now() + 60_000 })).toString("base64url");
  const token = `${payload}.${crypto.createHmac("sha256", config.SESSION_SECRET).update(payload).digest("base64url")}`;
  const calls = [];
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(input); calls.push(url);
    if (url.hostname === "auth.test") return Response.json({ success: false, error: "device_mismatch" });
    assert.equal(url.hostname, "audio.test");
    return Response.json({ audio: Buffer.from("ID3test").toString("base64") });
  });
  async function request(overrides = {}, authorization = `Bearer ${token}`) {
    const req = { method: "POST", headers: { authorization }, body: { action: "getDictionaryAudio", phone, deviceId,
      entryId: localEntry[0], language: "it", text: localEntry[1][0], ...overrides } };
    const res = { headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await handler(req,res); return res;
  }
  for (const language of ["it", "bn"]) {
    const result = await request({ language, text: localEntry[1][language === "it" ? 0 : 1] });
    assert.equal(result.code, 200);
    assert.equal(result.data.language, language);
    assert.equal(result.data.mimeType, "audio/mpeg");
    assert.equal(result.headers["Cache-Control"], "no-store");
    assert.equal(calls.at(-1).searchParams.get("action"), language === "it" ? "getItalianAudio" : "getTTS");
  }
  const count = calls.length;
  assert.equal((await request({}, "Bearer forged")).code, 403);
  assert.equal(calls.length, count + 1);
  assert.equal(calls.at(-1).hostname, "auth.test");
  assert.equal((await request({ language: "en" })).code, 400);
  assert.equal(calls.length, count + 1);
});

test("synchronized vocabulary audio uses the verified manifest and caches only that trusted catalog", async t => {
  const { resolveDictionaryAudio } = await import("../api/dictionary-audio.mjs?verified-fixture");
  const runtime = JSON.stringify({ schema_version: "3.0.0", entries: { ai_kw_test: { bn: "সঠিক শব্দ", canonical_italian: "Parola corretta" } } });
  const sha256 = crypto.createHash("sha256").update(runtime).digest("hex");
  const urls = [];
  t.mock.method(globalThis,"fetch",async input => {
    const url = String(input); urls.push(url);
    return url.includes("manifest") ? Response.json({schema_version:"3.0.0",sha256,url:"runtime-fixture.json"}) : new Response(runtime);
  });
  assert.equal(await resolveDictionaryAudio({entryId:"ai_kw_test",language:"bn",text:"সঠিক শব্দ"}),"সঠিক শব্দ");
  assert.equal(await resolveDictionaryAudio({entryId:"ai_kw_test",language:"it",text:"Parola corretta"}),"Parola corretta");
  assert.equal(urls.length,2);
  assert.equal(await resolveDictionaryAudio({entryId:"ai_kw_test",language:"bn",text:"অন্য কথা"}),"");
});

test("a foreign manifest target or corrupt runtime cannot authorize new speech text", async t => {
  for (const foreign of [true,false]) {
    const { resolveDictionaryAudio } = await import(`../api/dictionary-audio.mjs?invalid-${foreign}`);
    const urls=[];
    t.mock.method(globalThis,"fetch",async input => {
      const url = String(input); urls.push(url);
      return url.includes("manifest") ? Response.json({schema_version:"3.0.0",sha256:"a".repeat(64),url:foreign?"https://untrusted.test/private":"runtime-fixture.json"}) : new Response("corrupt");
    });
    await assert.rejects(resolveDictionaryAudio({entryId:"ai_kw_test",language:"bn",text:"সঠিক শব্দ"}));
    assert.equal(urls.length,foreign?1:2);
    assert.ok(urls.every(url=>url.startsWith("https://www.tmmbooks.eu/")));
    t.mock.restoreAll();
  }
});

async function setup() {
  const audio = [], requests = [], timers = new Map(), messages = [];
  const storage = new Map([["phone", "39123456789"], ["deviceId", "test_device_1234"], ["accessToken", "test-token"]]);
  let timerId = 0;
  const context = { URL, Blob, Uint8Array, atob, AbortController, console: { warn() {}, error() {} },
    setTimeout(fn) { const id = ++timerId; timers.set(id,fn); return id; }, clearTimeout(id) { timers.delete(id); },
    localStorage: { getItem: key => storage.get(key), setItem: (key,value) => storage.set(key,value) },
    Audio: class {
      constructor() { audio.push(this); }
      play() { if (context.blocked) return Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" })); this.played = true; return Promise.resolve(); }
      pause() { this.paused = true; } removeAttribute() {} load() {}
    },
    fetch: async (url, options) => {
      if (url === "/data/patente/quiz-help-runtime-v2.json") return Response.json(fallback);
      if (url !== "/api/quiz") throw new Error("offline manifest fixture");
      const body = JSON.parse(options.body); requests.push({ body, options });
      if (context.reply) return context.reply(body);
      return Response.json({ audio: "SUQzdGVzdA==", language: body.language, mimeType: "audio/mpeg" });
    }
  };
  context.globalThis = context;
  vm.runInNewContext(read("audio-focus.js"),context);
  vm.runInNewContext(source,context);
  const feature = context.MagicDictionaryFeature;
  const words = await feature.loadCatalog();
  function button(language = "it", word = words[0]) {
    const attrs = new Map([["aria-label", `Ascolta ${word.it}`]]), classes = new Set();
    const message = { hidden: true, textContent: "" }; messages.push(message);
    return { dataset: { dictionaryAudio: language, entryId: word.id },
      classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)), contains: n => classes.has(n) },
      setAttribute: (k,v) => attrs.set(k,v), removeAttribute: k => attrs.delete(k), getAttribute: k => attrs.get(k),
      closest: () => ({ querySelector: () => message }) };
  }
  return { context, feature, button, words, audio, requests, timers, messages, storage };
}

test("both language buttons play server audio with NO installed speech engine; repeat stops and cache replays", async () => {
  const h = await setup();
  for (const language of ["it", "bn"]) {
    const button = h.button(language);
    await h.feature.__test.playDictionaryAudio(button);
    assert.equal(h.requests.at(-1).body.language, language);
    assert.equal(h.requests.at(-1).options.headers.Authorization, "Bearer test-token");
    assert.equal(button.getAttribute("aria-pressed"), "true");
    assert.ok(h.audio.at(-1).src.startsWith("blob:"));
    const count = h.requests.length;
    await h.feature.__test.playDictionaryAudio(button);
    assert.equal(h.audio.at(-1).paused,true);
    await h.feature.__test.playDictionaryAudio(button);
    assert.equal(h.requests.length,count);
    h.audio.at(-1).onended();
    assert.equal(button.getAttribute("aria-pressed"), "false");
  }
  assert.equal(h.timers.size,0);
});

test("slow stale response cannot replace or reset a newer language, even after retapping the same button", async () => {
  const h = await setup();
  let resolve;
  h.context.reply = () => new Promise(done => { resolve = done; });
  const button = h.button();
  const first = h.feature.__test.playDictionaryAudio(button);
  await h.feature.__test.playDictionaryAudio(button); // cancel
  h.context.reply = null;
  await h.feature.__test.playDictionaryAudio(button);
  resolve(Response.json({ audio: "SUQzdGVzdA==", language: "it" }));
  await first;
  assert.equal(h.audio.length,1);
  assert.equal(button.getAttribute("aria-pressed"),"true");
  h.feature.hideDictionary();
  assert.equal(h.audio[0].paused,true);
  assert.equal(h.timers.size,0);
});

test("failed and timed-out requests are retryable; autoplay denial reuses prepared clip", async () => {
  const h = await setup(), button = h.button("bn");
  h.context.reply = async () => Response.json({}, { status: 503 });
  await h.feature.__test.playDictionaryAudio(button);
  assert.match(h.messages[0].textContent,/connessione/);
  assert.equal(button.getAttribute("aria-busy"),undefined);
  h.context.reply = null; h.context.blocked = true;
  await h.feature.__test.playDictionaryAudio(button);
  assert.match(h.messages[0].textContent,/Audio pronto/);
  h.context.blocked = false;
  const count = h.requests.length;
  await h.feature.__test.playDictionaryAudio(button);
  assert.equal(h.requests.length,count);
  h.feature.__test.stopDictionaryAudio();
  let resolve;
  h.context.reply = () => new Promise(done => { resolve = done; });
  const pending = h.feature.__test.playDictionaryAudio(h.button("it",h.words[1]));
  [...h.timers.values()][0]();
  resolve(Response.json({ audio: "SUQzdGVzdA==", language: "it" }));
  await pending;
  assert.equal(h.timers.size,0);
  assert.match(h.messages.at(-1).textContent,/riprovare/);
});

test("word audio participates in natural-resume versus manual-stop shared focus", async () => {
  const h = await setup(); let playing = true, resumed = 0;
  h.context.MagicAudioFocus.setResumable({ isPlaying: () => playing, pause() { playing=false; }, resume() { playing=true; resumed++; } });
  const a = h.button(), b = h.button("bn");
  await h.feature.__test.playDictionaryAudio(a);
  assert.equal(playing,false);
  await h.feature.__test.playDictionaryAudio(b);
  assert.equal(h.audio[0].paused,true);
  h.audio[1].onended();
  await Promise.resolve();
  assert.equal(resumed,1);
  await h.feature.__test.playDictionaryAudio(a);
  h.feature.__test.stopDictionaryAudio();
  assert.equal(resumed,1);
});

test("account/device change rejects a pending audio response and releases its transient focus", async () => {
  const h=await setup(); let resolve;
  h.context.reply=()=>new Promise(done=>{resolve=done;});
  const button=h.button();
  const pending=h.feature.__test.playDictionaryAudio(button);
  h.storage.set("deviceId","different_device");
  resolve(Response.json({audio:"SUQzdGVzdA==",language:"it"}));
  await pending;
  assert.equal(h.audio.length,0);
  assert.equal(button.getAttribute("aria-busy"),undefined);
  assert.equal(h.timers.size,0);
});
