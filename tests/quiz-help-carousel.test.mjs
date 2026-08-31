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

test("live quiz help uses one card with two dot-selected panels on every viewport", () => {
  assert.match(page, /class="quiz-help-shell" role="dialog" aria-modal="true"/u);
  assert.equal((page.match(/class="quiz-help-shell"/gu) || []).length, 1);
  assert.match(page, /id="quiz-help-translation-panel"[^>]*role="tabpanel"[^>]*aria-labelledby="quiz-help-translation-tab"/u);
  assert.match(page, /id="quiz-help-keywords-panel"[^>]*role="tabpanel"[^>]*aria-labelledby="quiz-help-keywords-tab"/u);
  assert.match(page, /id="quiz-help-translation-tab"[^>]*aria-controls="quiz-help-translation-panel"/u);
  assert.match(page, /id="quiz-help-keywords-tab"[^>]*aria-controls="quiz-help-keywords-panel"/u);
  assert.match(page, /id="question"[^>]*aria-describedby="quiz-help-trigger-description"/u);
  assert.match(page, /id="quiz-help-trigger-description" class="sr-only">Apri la traduzione Bangla e le parole chiave\.<\/span>/u);
  assert.match(helpStyles, /\.quiz-help-shell\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\) 48px;/u);
  assert.match(helpStyles, /(?:^|\n)\.sr-only\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?width:\s*1px;[\s\S]*?clip-path:\s*inset\(50%\);/u);
  assert.doesNotMatch(helpStyles, /\.quiz-help-workspace \.sr-only/u);
  assert.match(helpStyles, /\.quiz-help-slides\s*\{[\s\S]*?display:\s*flex;[\s\S]*?translate3d\(calc\(var\(--quiz-help-slide-index\) \* -100%\)/u);
  assert.match(helpStyles, /\.quiz-help-slides\s*\{[\s\S]*?grid-row:\s*1;[\s\S]*?grid-column:\s*1;/u);
  assert.match(helpStyles, /\.quiz-help-tabs\s*\{[\s\S]*?grid-row:\s*2;[\s\S]*?grid-column:\s*1;/u);
  assert.match(helpStyles, /\.quiz-help-tab\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/u);
  assert.match(helpStyles, /\.quiz-help-tab::before\s*\{[\s\S]*?width:\s*9px;[\s\S]*?border-radius:\s*50%;/u);
  assert.doesNotMatch(helpStyles, /\.quiz-help-slide\s*\{[^}]*position:\s*fixed;/u);
  assert.doesNotMatch(helpScript, /makeCardDraggable|bringCardToFront|clampCard/u);
});

test("the shared help card supports swipe, tabs, modal focus and a native question trigger", () => {
  const setSlide = functionSource(helpScript, "setSlide", "open");
  const open = functionSource(helpScript, "open", "close");
  const close = functionSource(helpScript, "close");

  assert.match(page, /<button id="question" type="button"[^>]*aria-haspopup="dialog"[^>]*aria-controls="quiz-help-workspace"/u);
  assert.match(setSlide, /--quiz-help-slide-index/u);
  assert.match(setSlide, /slide\.toggleAttribute\("inert", !active\)/u);
  assert.match(setSlide, /tab\.setAttribute\("aria-selected", String\(active\)\)/u);
  assert.match(helpScript, /\["touch", "pen"\]\.includes\(event\.pointerType\)/u);
  assert.match(helpScript, /Math\.abs\(deltaX\) < 48/u);
  assert.match(helpScript, /Math\.abs\(deltaX\) <= Math\.abs\(deltaY\) \* 1\.2/u);
  assert.match(helpScript, /event\.key === "ArrowLeft"[\s\S]*?event\.key === "ArrowRight"[\s\S]*?event\.key === "Home"[\s\S]*?event\.key === "End"/u);
  assert.match(open, /quizSurface\?\.setAttribute\("inert", ""\)/u);
  assert.match(open, /\[data-help-close\][\s\S]*?\.focus\(\)/u);
  assert.match(close, /quizSurface\?\.removeAttribute\("inert"\)/u);
  assert.match(close, /focusTarget\?\.focus\(\)/u);
  assert.match(helpScript, /event\.key !== "Tab"[\s\S]*?document\.activeElement === first[\s\S]*?document\.activeElement === last/u);
  assert.match(helpStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.quiz-help-slides\s*\{\s*transition:\s*none;/u);
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
  assert.match(page, /mystyle\.css\?v=48-shared-gif-loader/u);
  assert.match(page, /quiz\.js\?v=73-shared-gif-loader/u);
  assert.match(page, /quiz-help\.css\?v=20260829-a11y-trigger-label/u);
  assert.match(page, /quiz-help\.js\?v=20260831-shared-gif-loader/u);
  assert.match(worker, /magicbook-pwa-v148-shared-gif-loader/u);
  assert.match(worker, /mystyle\.css\?v=48-shared-gif-loader/u);
  assert.match(worker, /quiz\.js\?v=73-shared-gif-loader/u);
  assert.match(worker, /quiz-help\.css\?v=20260829-a11y-trigger-label/u);
  assert.match(worker, /quiz-help\.js\?v=20260831-shared-gif-loader/u);
});
