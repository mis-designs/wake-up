import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const styles = read("mystyle.css");

function intactWords(rule) {
  assert.match(rule, /-webkit-hyphens:\s*none/);
  assert.match(rule, /(?:^|[;\s])hyphens:\s*none/);
  assert.match(rule, /word-break:\s*normal/);
  assert.match(rule, /overflow-wrap:\s*normal/);
}

test("live Quiz/Exam and correction share whole-word wrapping, including Safari", () => {
  const rule = styles.match(/#question,\s*\.modal-review-question\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule);
  intactWords(rule);
  for (const [, selector, body] of styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/#question\b|\.modal-review-question\b/.test(selector)) continue;
    assert.doesNotMatch(body, /hyphens:\s*(auto|manual)|overflow-wrap:\s*(anywhere|break-word)|word-break:\s*(break-all|break-word)/);
  }
});

test("translation reader and study questions preserve the same whole-word rule", () => {
  const help = read("quiz-help.css").match(/\.quiz-help-workspace\.is-fullscreen #quiz-help-question\s*\{([^}]+)\}/)?.[1];
  const study = [...read("study-quiz.css").matchAll(/\.study-question-text\s*\{([^}]+)\}/g)].map(match => match[1]).join("\n");
  assert.ok(help);
  intactWords(help);
  intactWords(study);
});

test("changed question styles are versioned and included in the new worker cache", () => {
  const worker = read("service-worker.js");
  for (const [page, asset] of [["quiz.html", "mystyle.css?v=58-compact-loading"], ["quiz.html", "quiz-help.css?v=20260914-whole-words"], ["study-quiz.html", "study-quiz.css?v=28-compact"]]) {
    assert.ok(read(page).includes(asset));
    assert.ok(worker.includes(asset));
  }
  assert.match(worker, /magicbook-pwa-v204-figure-details/);
});
