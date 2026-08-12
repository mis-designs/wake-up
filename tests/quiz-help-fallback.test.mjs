import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../quiz-help.js", import.meta.url), "utf8");
const routes = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

test("quiz help waits for the synchronized catalog and falls back only when its host fails", () => {
  assert.match(source, /LOCAL_HELP_SOURCE\s*=\s*"\/data\/patente\/quiz-help-runtime-v2\.json"/);
  assert.doesNotMatch(source, /REMOTE_HELP_TIMEOUT_MS|Promise\.race/);
  assert.match(source, /libraryPromise = remote[\s\S]*?\.catch\(\(\) => fetch\(LOCAL_HELP_SOURCE/);
  assert.match(source, /fetch\(LOCAL_HELP_SOURCE, \{ cache: "force-cache" \}\)/);
  assert.match(source, /requestIdleCallback\(prewarmLibrary/);
});

test("the local runtime keeps contextual Bengali separate from the question translation", () => {
  assert.match(source, /wordIds = \[\], contextBn = ""/);
  assert.match(source, /contextBn:\s*String\(contextBn/);
  assert.doesNotMatch(source, /questionBnEasy:\s*contextBn/);
});

test("a missing synchronized translation never falls back to automatic translation", () => {
  assert.doesNotMatch(source, /loadOnDemandTranslation|getBengaliAudio|fetchBengaliAudio/);
  assert.match(source, /help\?\.questionBnStandard[\s\S]*?question\.question_bd/);
  assert.match(source, /Traduzione TMM Books non ancora sincronizzata\./);
});

test("clean Studia quiz routes rewrite to the clean static page", () => {
  assert.ok(routes.rewrites.some(route => route.source === "/studia-quiz" && route.destination === "/study-quiz"));
  assert.ok(routes.rewrites.some(route => route.source === "/studia-quiz/capitolo-:chapter" && route.destination === "/study-quiz"));
});
