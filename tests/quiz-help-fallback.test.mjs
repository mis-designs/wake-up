import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../quiz-help.js", import.meta.url), "utf8");
const routes = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

test("quiz help falls back to the same-origin runtime when the shared host is unavailable", () => {
  assert.match(source, /LOCAL_HELP_SOURCE\s*=\s*"\/data\/patente\/quiz-help-runtime-v2\.json"/);
  assert.match(source, /REMOTE_HELP_TIMEOUT_MS\s*=\s*1800/);
  assert.match(source, /fetch\(LOCAL_HELP_SOURCE, \{ cache: "force-cache" \}\)/);
});

test("the local runtime keeps contextual Bengali separate from the question translation", () => {
  assert.match(source, /wordIds = \[\], contextBn = ""/);
  assert.match(source, /contextBn:\s*String\(contextBn/);
  assert.doesNotMatch(source, /questionBnEasy:\s*contextBn/);
});

test("a missing catalog translation is requested only after opening quiz help", () => {
  assert.match(source, /async function loadOnDemandTranslation\(question\)/);
  assert.match(source, /fetchBengaliAudio\(question, cacheKey, \{ requireAudio: false \}\)/);
  assert.match(source, /if \(!verifiedTranslation\)/);
});

test("clean Studia quiz routes rewrite to the clean static page", () => {
  assert.ok(routes.rewrites.some(route => route.source === "/studia-quiz" && route.destination === "/study-quiz"));
  assert.ok(routes.rewrites.some(route => route.source === "/studia-quiz/capitolo-:chapter" && route.destination === "/study-quiz"));
});
