import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../quiz.html", import.meta.url), "utf8");
const helpScript = readFileSync(new URL("../quiz-help.js", import.meta.url), "utf8");
const helpStyles = readFileSync(new URL("../quiz-help.css", import.meta.url), "utf8");
const quizScript = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
const quizStyles = readFileSync(new URL("../mystyle.css", import.meta.url), "utf8");
const quizApi = readFileSync(new URL("../api/quiz.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

function functionSource(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

test("live quiz translation sits below the question in one glass panel with text keyword buttons", () => {
  const question = page.indexOf('id="question"');
  const help = page.indexOf('id="quiz-help-workspace"');
  const recorder = page.indexOf('id="quiz-audio-recorder"');
  assert.ok(question < help && help < recorder);
  assert.match(page, /class="quiz-help-workspace magic-glass-panel hidden"/u);
  assert.match(page, /id="question"[^>]*aria-expanded="false"[^>]*aria-controls="quiz-help-workspace"/u);
  assert.match(page, /id="quiz-help-words"[^>]*role="group"/u);
  assert.doesNotMatch(page, /quiz-help-shell|data-help-slide|data-help-tab|data-help-swipe-zone/u);
  assert.match(helpStyles, /\.quiz-help-workspace\s*\{[^}]*position:\s*relative;[^}]*flex:\s*0 0 auto;/u);
  assert.doesNotMatch(helpStyles, /position:\s*fixed|body\.quiz-help-open/u);
  assert.match(helpScript, /button.className = "quiz-help-word magic-glass-chip"/u);
  assert.match(helpScript, /button.append\(italian\)/u);
});

test("inline help keeps the quiz usable and exposes native disclosure controls", () => {
  const open = functionSource(helpScript, "open", "close");
  assert.match(open, /setAttribute\("aria-expanded", "true"\)/u);
  assert.doesNotMatch(helpScript, /setSlide|quizSurface|helpFocusOrigin|setPointerCapture|event.key !== "Tab"/u);
  assert.match(helpScript, /workspace\?\.addEventListener\("keydown"[\s\S]*?event.key !== "Escape"/u);
  assert.match(helpScript, /workspace.contains\(document.activeElement\)/u);
  assert.match(helpScript, /questionText\?\.focus\(\{ preventScroll: true \}\)/u);
  assert.match(helpScript, /button.setAttribute\("aria-controls", "quiz-help-word-detail"\)/u);
  assert.match(helpScript, /wordDetail.classList.toggle\("hidden", wasOpen\)/u);
  assert.doesNotMatch(helpScript, /wordsList.innerHTML =/u);
});

test("the correct-answer marker is private to signed Admin quiz sessions", () => {
  const marker = functionSource(quizScript, "updateAdminCorrectDots", "showQuestion");

  assert.match(quizApi, /const admin = access\.role === "admin";/u);
  assert.match(quizApi, /const quizWithAdminAnswers = admin \? await addAdminCorrectAnswers\(quiz\) : quiz;/u);
  assert.match(marker, /if \(!isAdmin \|\| correctAnswer === null \|\| optionValue !== correctAnswer\) return;/u);
  assert.match(marker, /slot\.classList\.add\("is-visible"\)/u);
  assert.match(marker, /Risposta corretta per Admin/u);
  assert.match(quizStyles, /\.admin-correct-dot-slot\s*\{[\s\S]*?margin-top:\s*13px;[\s\S]*?display:\s*none;/u);
  assert.match(quizStyles, /\.admin-correct-dot-slot\.is-visible\s*\{\s*display:\s*flex;/u);
  assert.match(quizStyles, /\.admin-correct-dot\s*\{[\s\S]*?width:\s*8px;[\s\S]*?height:\s*8px;/u);
  assert.match(quizStyles, /\.admin-correct-dot--true\s*\{[\s\S]*?background:\s*#22c55e;/u);
  assert.match(quizStyles, /\.admin-correct-dot--false\s*\{[\s\S]*?background:\s*#ef4444;/u);
});

test("the bilingual card and Admin marker ship through fresh PWA assets", () => {
  assert.match(page, /mystyle\.css\?v=51-question-footer-reflow/u);
  assert.match(page, /quiz\.js\?v=80-numberless-figures/u);
  assert.match(page, /quiz-help\.css\?v=20260907-inline-glass/u);
  assert.match(page, /quiz-help\.js\?v=20260907-inline-glass/u);
  assert.match(worker, /magicbook-pwa-v161-numberless-figures/u);
  assert.match(worker, /mystyle\.css\?v=51-question-footer-reflow/u);
  assert.match(worker, /quiz\.js\?v=80-numberless-figures/u);
  assert.match(worker, /quiz-help\.css\?v=20260907-inline-glass/u);
  assert.match(worker, /quiz-help\.js\?v=20260907-inline-glass/u);
});
