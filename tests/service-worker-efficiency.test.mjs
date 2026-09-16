import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
function harness({ cacheBroken = false } = {}) {
  const origin = "https://magic.test";
  const stores = new Map();
  const handlers = new Map();
  const requests = [];
  const keyOf = input => new URL(typeof input === "string" ? input : input.url, origin).href;
  const fresh = text => new Response(text, { headers: { "Cache-Control": "public, max-age=0" } });
  const fetch = async input => { requests.push(keyOf(input)); return fresh(`network:${keyOf(input)}`); };
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(key) { return stores.delete(key); },
    async match(input) {
      for (const store of stores.values()) if (store.has(keyOf(input))) return store.get(keyOf(input)).clone();
    },
    async open(name) {
      if (cacheBroken) throw new Error("quota");
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(input) { return store.get(keyOf(input))?.clone(); },
        async put(input, response) { store.set(keyOf(input), response.clone()); },
        async add(input) { store.set(keyOf(input), await fetch(input)); }
      };
    }
  };
  const self = { location: { origin }, addEventListener: (type, handler) => handlers.set(type, handler),
    skipWaiting() {}, clients: { claim() {} } };
  const context = vm.createContext({ URL, Set, Promise, Response, self, caches, fetch });
  vm.runInContext(source, context);
  async function dispatch(path, overrides = {}) {
    let result;
    const waits = [];
    const request = { url: keyOf(path), method: "GET", mode: "cors", cache: "default", headers: new Headers(), ...overrides };
    handlers.get("fetch")({ request, respondWith(value) { result = value; }, waitUntil(value) { waits.push(value); } });
    const response = await result;
    await Promise.all(waits);
    return response;
  }
  async function lifecycle(type) {
    const waits = [];
    handlers.get(type)({ waitUntil: p => waits.push(p) });
    await Promise.all(waits);
  }
  return { stores, requests, caches, fresh, dispatch, lifecycle,
    name: vm.runInContext("CACHE_NAME", context),
    versioned: [...vm.runInContext("VERSIONED_STATIC_ASSETS", context)],
    assets: [...vm.runInContext("STATIC_ASSETS", context)] };
}

test("warm versioned files avoid network calls without changing bytes", async () => {
  const h = harness();
  const asset = "/learning-sync.js?v=5-insights-backup";
  const first = await (await h.dispatch(asset)).text();
  for (let i = 0; i < 10; i++) assert.equal(await (await h.dispatch(asset)).text(), first);
  assert.equal(h.requests.length, 1);
});

test("new versions, explicit reloads and unversioned assets still use the network", async () => {
  const h = harness();
  await h.dispatch("/learning-sync.js?v=5-insights-backup");
  await h.dispatch("/learning-sync.js?v=4-new-release");
  await h.dispatch("/learning-sync.js?v=5-insights-backup", { cache: "reload" });
  await h.dispatch("/learning-sync.js?v=5-insights-backup", { cache: "no-store" });
  await h.dispatch("/icons/mg_logo.png");
  await h.dispatch("/icons/mg_logo.png");
  assert.equal(h.requests.length, 6);
});

test("API traffic bypasses the worker and HTML remains network-first", async () => {
  const h = harness();
  assert.equal(await h.dispatch("/api/getPages", { method: "POST" }), undefined);
  assert.equal(await h.dispatch("/api/quiz?action=getQuiz"), undefined);
  assert.equal(h.requests.length, 0);
  await h.dispatch("/", { mode: "navigate" });
  await h.dispatch("/", { mode: "navigate" });
  await h.dispatch("/aggiungi-spiegazioni", { mode: "navigate" });
  assert.equal(h.requests.length, 3);
});

test("Cache Storage failures never break an online versioned resource", async () => {
  const h = harness({ cacheBroken: true });
  const response = await h.dispatch("/learning-sync.js?v=5-insights-backup");
  assert.equal(response.status, 200);
  assert.equal(h.requests.length, 1);
});

test("new SW releases reuse unchanged versioned public files, not HTML or private responses", async () => {
  const h = harness();
  const previous = await h.caches.open("magicbook-pwa-previous");
  for (const asset of h.assets) await previous.put(asset, h.fresh(`saved:${asset}`));
  const denied = h.versioned[0];
  await previous.put(denied, new Response("private", { headers: { "Cache-Control": "private, no-store" } }));
  await h.lifecycle("install");
  assert.equal(h.requests.length, h.assets.length - h.versioned.length + 1);
  assert.ok(h.requests.some(url => url.endsWith(denied)));
  assert.ok(h.requests.some(url => url.endsWith("/index.html")));
  assert.equal(await (await (await h.caches.open(h.name)).match(h.versioned[1])).text(), `saved:${h.versioned[1]}`);
  await h.caches.open("unrelated-feature-cache");
  await h.lifecycle("activate");
  assert.deepEqual((await h.caches.keys()).sort(), [h.name, "unrelated-feature-cache"].sort());
});
