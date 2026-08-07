import test from "node:test";
import assert from "node:assert/strict";
import { fetchUpstream, publicApiError, withOperationalTimeout } from "../api/upstream-fetch.mjs";

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
