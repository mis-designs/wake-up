import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../script.js", import.meta.url), "utf8");
const client = readFileSync(new URL("../src/learning-insights.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/learning-insights.css", import.meta.url), "utf8");
const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
const redirects = readFileSync(new URL("../_redirects", import.meta.url), "utf8");

test("home, history routing and deployment expose both learning screens", () => {
  assert.match(index, /showLearningStatistics\(\)/u);
  assert.match(index, /showLearningErrors\(\)/u);
  assert.match(index, /icons\/statistiche-patente\.png/u);
  assert.match(index, /icons\/errori-patente\.png/u);
  assert.match(script, /path === "\/statistiche"/u);
  assert.match(script, /path === "\/errori"/u);
  assert.match(redirects, /\/statistiche \/index\.html 200/u);
  assert.match(redirects, /\/errori \/index\.html 200/u);
});

test("the UI includes stable loading, empty, offline, error and insufficient states", () => {
  assert.match(client, /renderSkeleton/u);
  assert.match(client, /li-empty-list/u);
  assert.match(client, /Modalità offline/u);
  assert.match(client, /Interruzione temporanea/u);
  assert.match(client, /state === "insufficient"/u);
  assert.match(client, /getInsightsCache/u);
  assert.match(client, /setInsightsCache/u);
  assert.match(client, /const controller = new AbortController\(\)/u);
  assert.match(client, /signal: controller\.signal/u);
});

test("error lenses and detail disclosure have accessible semantics", () => {
  assert.match(client, /role="tablist"/u);
  assert.match(client, /role="tabpanel"/u);
  assert.match(client, /aria-selected=/u);
  assert.match(client, /aria-expanded=/u);
  assert.match(client, /ArrowLeft/u);
  assert.match(client, /ArrowRight/u);
  assert.match(index, /role="status" aria-live="polite"/u);
});

test("responsive, reduced-motion and global scrollbar rules are present", () => {
  assert.match(css, /@media \(min-width: 1024px\)/u);
  assert.match(css, /@media \(max-width: 360px\)/u);
  assert.match(css, /prefers-reduced-motion: reduce/u);
  assert.match(css, /forced-colors: active/u);
  assert.match(css, /html::-webkit-scrollbar/u);
  assert.match(worker, /magicbook-pwa-v113-learning-insights/u);
  assert.match(worker, /src\/learning-insights\.js\?v=1/u);
});
