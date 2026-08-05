import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

const iconSources = [
  "icons/study_quiz.png",
  "icons/mix_quiz.gif",
  "icons/quiz_capitolo.gif",
  "icons/multi_quiz.gif"
];

test("quiz mode cards use the supplied image assets instead of emoji", () => {
  iconSources.forEach(source => assert.match(index, new RegExp(`src="${source.replace(".", "\\.")}"`)));
  assert.doesNotMatch(index, /qms-badge-study">🎧|qms-badge-mix">🎲|qms-badge-cap">📖|qms-badge-multi">🗂️/u);
});

test("supplied quiz mode artwork keeps its original colors and loads on demand", () => {
  assert.match(styles, /\.qms-card-badge\.qms-badge-art img[\s\S]*?filter:\s*none/);
  iconSources.forEach(source => {
    assert.match(index, new RegExp(`src="${source.replace(".", "\\.")}" alt="" loading="lazy"`));
    assert.doesNotMatch(serviceWorker, new RegExp(`/${source.replace(".", "\\.")}`));
  });
  assert.match(serviceWorker, /cache\.put\(request, copy\)/);
});
