import test from "node:test";
import assert from "node:assert/strict";
import { fetchUpstream, fetchUpstreamJson, publicApiError, withOperationalTimeout } from "../api/upstream-fetch.mjs";

test("public API errors do not expose upstream service names or internal details", () => {
  const internal = new Error("private_database_timeout");
  internal.statusCode = 503;
  internal.details = { service: "private_database", upstreamStatus: 502 };
  assert.deepEqual(publicApiError(internal), { statusCode: 503, error: "service_unavailable" });
  assert.deepEqual(publicApiError(new Error("secret_internal_path")), { statusCode: 500, error: "server_error" });
});

test("fetchUpstream returns successful upstream responses", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("ok", { status: 200 }));
  const response = await fetchUpstream("https://example.test", {}, { service: "quiz_service" });
  assert.equal(response.status, 200);
});

test("fetchUpstream converts upstream 5xx responses to a retryable 503", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("bad gateway", { status: 502 }));
  await assert.rejects(
    fetchUpstream("https://example.test", {}, { service: "quiz_service" }),
    error => error.statusCode === 503
      && error.message === "quiz_service_unavailable"
      && error.details.upstreamStatus === 502
  );
});

test("fetchUpstream aborts requests that exceed the configured timeout", async t => {
  t.mock.method(globalThis, "fetch", (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  }));

  await assert.rejects(
    fetchUpstream("https://example.test", {}, { service: "quiz_catalog", timeoutMs: 5 }),
    error => error.statusCode === 503
      && error.message === "quiz_catalog_timeout"
      && error.details.timeoutMs === 5
  );
});

test("withOperationalTimeout prevents a stalled database operation from blocking the route", async () => {
  await assert.rejects(
    withOperationalTimeout(new Promise(() => {}), { service: "audio_status", timeoutMs: 5 }),
    error => error.statusCode === 503
      && error.message === "audio_status_timeout"
      && error.details.timeoutMs === 5
  );
});

test("fetchUpstreamJson keeps the deadline active while the response body is stalled", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    signal = options.signal;
    return {
      status: 200, ok: true,
      json: () => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      })
    };
  });
  const request = fetchUpstreamJson("https://example.test", {}, { service: "learning_database", timeoutMs: 30000 });
  const failure = assert.rejects(request, error => error.message === "learning_database_timeout");
  await new Promise(setImmediate);
  t.mock.timers.tick(30001);
  await failure;
  assert.equal(signal.aborted, true);
});

test("fetchUpstreamJson returns parsed JSON and clears its timer on success", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    signal = options.signal;
    return new Response(JSON.stringify({ success: true }));
  });
  const { response, data } = await fetchUpstreamJson("https://example.test", {}, { timeoutMs: 30000 });
  assert.equal(response.status, 200);
  assert.deepEqual(data, { success: true });
  t.mock.timers.tick(40000);
  assert.equal(signal.aborted, false);
});

test("fetchUpstreamJson preserves 429 headers without waiting for a JSON error body", async t => {
  t.mock.method(globalThis, "fetch", async () => ({
    status: 429, ok: false, headers: new Headers({ "Retry-After": "15" }),
    json() { throw new Error("error bodies must not be parsed"); }
  }));
  const { response, data } = await fetchUpstreamJson("https://example.test");
  assert.equal(response.headers.get("Retry-After"), "15");
  assert.equal(data, null);
});

test("invalid upstream JSON fails safely and cleans up the deadline", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    signal = options.signal;
    return new Response("not JSON");
  });
  await assert.rejects(fetchUpstreamJson("https://example.test", {}, { service: "learning_database" }),
    error => error.message === "learning_database_unavailable");
  t.mock.timers.tick(40000);
  assert.equal(signal.aborted, false);
});
