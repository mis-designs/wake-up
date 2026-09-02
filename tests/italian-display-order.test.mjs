import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const formatterSource = readFileSync(new URL("../italian-display.js", import.meta.url), "utf8");
const quizPage = readFileSync(new URL("../quiz.html", import.meta.url), "utf8");
const studyPage = readFileSync(new URL("../study-quiz.html", import.meta.url), "utf8");
const quizScript = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
const helpScript = readFileSync(new URL("../quiz-help.js", import.meta.url), "utf8");
const helpStyles = readFileSync(new URL("../quiz-help.css", import.meta.url), "utf8");
const studyScript = readFileSync(new URL("../study-quiz.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

function section(source, startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  assert.notEqual(start, -1, `${startText} must exist`);
  assert.notEqual(end, -1, `${endText} must follow ${startText}`);
  return source.slice(start, end);
}

test("shared Italian display casing preserves source spelling after the first letter", () => {
  const sandbox = { window: {} };
  runInNewContext(formatterSource, sandbox);
  const display = sandbox.window.MagicItalianDisplay;

  assert.equal(display.initialUppercase("segnale"), "Segnale");
  assert.equal(display.initialUppercase("in corrispondenza"), "In corrispondenza");
  assert.equal(display.initialUppercase("'arresto"), "'Arresto");
  assert.equal(display.initialUppercase("ABS"), "ABS");
  assert.equal(display.uppercase("pedoni ciclisti"), "PEDONI CICLISTI");
});

test("keywords precede uppercase chapter and topic tags across help surfaces", () => {
  const reviewPanel = section(quizScript, "function renderReviewTranslationPanel", "function fallbackReviewTranslationHelp");
  const studyHelp = section(studyScript, "function renderHelp", "function renderWordDetail");

  assert.ok(quizPage.indexOf('id="quiz-help-words"') < quizPage.indexOf('id="quiz-help-context"'));
  assert.ok(reviewPanel.indexOf("panel.appendChild(wordsGroup)") < reviewPanel.indexOf("panel.appendChild(context)"));
  assert.equal((reviewPanel.match(/panel\.appendChild\(context\)/gu) || []).length, 1);
  assert.ok(studyHelp.indexOf("wordsSection.appendChild(words)") < studyHelp.indexOf("wordsSection.appendChild(detail)"));
  assert.ok(studyHelp.indexOf("container.appendChild(wordsSection)") < studyHelp.indexOf("if (context) container.appendChild(context)"));
  assert.match(helpStyles, /\.quiz-help-context\s*\{[^}]*margin-top:\s*13px;/u);
  assert.match(readFileSync(new URL("../study-quiz.css", import.meta.url), "utf8"), /\.study-context span\[lang="it"\]\s*\{\s*text-transform:\s*uppercase;/u);
});

test("quiz and study renderers use the shared Italian case owner", () => {
  for (const source of [quizScript, helpScript, studyScript]) {
    assert.match(source, /MagicItalianDisplay\.initialUppercase/u);
    assert.match(source, /MagicItalianDisplay\.uppercase/u);
  }

  assert.ok(quizPage.indexOf("italian-display.js?v=1") < quizPage.indexOf("quiz.js?v=78-audio-speed-cycle"));
  assert.ok(studyPage.indexOf("italian-display.js?v=1") < studyPage.indexOf("study-quiz.js?v=23-audio-speed-cycle"));
  assert.match(worker, /CACHE_NAME = "magicbook-pwa-v159-solid-profile-controls"/u);
  assert.match(worker, /\/italian-display\.js\?v=1/u);
});
