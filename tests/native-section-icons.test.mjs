import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const theme = read("android-app-theme.css");

test("native section symbols reuse cached action assets and reserve decorative geometry", () => {
  for (const file of ["study_quiz.svg", "do_quiz.svg", "dictionary.svg", "exam.svg", "Statistics.png", "errors.png"]) {
    assert.ok(read("service-worker.js").includes(`"/icons/${file}"`));
  }
  const sectionRules = theme.slice(theme.indexOf("/* Reuse the chapter-action symbols"), theme.indexOf("@media (forced-colors: active)"));
  for (const selector of sectionRules.replace(/\/\*[\s\S]*?\*\//g, "").split("}")) {
    if (!selector.trim()) continue;
    assert.match(selector.trim(), /^html\.android-webview/);
  }
  assert.match(sectionRules, /content: ""/);
  assert.match(sectionRules, /padding-inline-start: 28px/);
  assert.match(sectionRules, /width: 20px;\s*height: 20px/);
  assert.match(sectionRules, /background-color: currentColor/);
  assert.match(sectionRules, /pointer-events: none/);
  assert.match(sectionRules, /grid-template-columns: 44px minmax\(0, 1fr\) auto/);
  assert.match(sectionRules, /text-overflow: ellipsis/);
});

test("Statistics and Errors use the new PNGs only in Android, including the section switcher", () => {
  const source = read("src/learning-insights.js");
  const helper = source.slice(source.indexOf("  function iconForMode(mode)"), source.indexOf("  function figureUrl("));
  for (const native of [true, false]) {
    const getIcon = runInNewContext(`${helper}; iconForMode`, { document: { documentElement: { classList: { contains: () => native } } } });
    assert.equal(getIcon("statistics"), native ? "icons/Statistics.png" : "icons/statistiche-patente.png");
    assert.equal(getIcon("errors"), native ? "icons/errors.png" : "icons/errori-patente.png");
  }
  assert.ok(source.includes('<img src="${iconForMode("statistics")}" alt="">'));
  assert.ok(source.includes('<img src="${iconForMode("errors")}" alt="">'));
});

test("Quiz/Exam icon mode is set before loading and never mutates a browser document", () => {
  const source = read("quiz.js");
  const helper = source.slice(source.indexOf("function syncNativeQuizSection()"), source.indexOf("syncNativeQuizSection();"));
  for (const native of [true, false]) {
    const dataset = {};
    let exam = false;
    const sync = runInNewContext(`${helper}; syncNativeQuizSection`, { document: { documentElement: { dataset, classList: { contains: () => native } } }, isExamQuizMode: () => exam });
    sync();
    assert.equal(dataset.nativeQuizSection, native ? "quiz" : undefined);
    exam = true;
    sync();
    assert.equal(dataset.nativeQuizSection, native ? "exam" : undefined);
    exam = false;
    sync();
    assert.equal(dataset.nativeQuizSection, native ? "quiz" : undefined);
  }
  assert.match(source, /quizMode = getRequestedQuizMode\(\);\s*syncNativeQuizSection\(\);/);
  assert.match(read("script.js"), /classList\.contains\("android-webview"\)\s*\? "icons\/exam\.svg" : "icons\/true\.png"/);
});
