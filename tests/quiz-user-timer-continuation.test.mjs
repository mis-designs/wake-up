import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../quiz.html", import.meta.url), "utf8");
const source = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../mystyle.css", import.meta.url), "utf8");
const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

function functionSource(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

test("learner timeout copy follows the active quiz duration", () => {
  const copySource = functionSource("getTimerExpiryCopy", "closeTransientQuizOverlaysForTimer");
  const getTimerExpiryCopy = Function(`${copySource}\nreturn getTimerExpiryCopy;`)();

  assert.deepEqual(getTimerExpiryCopy(20), {
    title: "Tempo scaduto",
    message: "Sono trascorsi 20 minuti. Vuoi continuare il quiz?",
    confirmText: "Sì, continua",
    cancelText: "Chiudi quiz"
  });
  assert.equal(getTimerExpiryCopy(1).message, "Sono trascorsi 1 minuto. Vuoi continuare il quiz?");
  assert.equal(getTimerExpiryCopy(50).message, "Sono trascorsi 50 minuti. Vuoi continuare il quiz?");
});

test("normal users pause at zero and choose another complete cycle or exit without grading", () => {
  const handler = functionSource("handleUserTimerExpiry", "startTimer");
  const timer = functionSource("startTimer", "allAnswered");
  const elapsed = functionSource("getElapsedQuizSeconds", "paintQuizTimer");

  assert.match(timer, /time <= 0 && !isAdmin/u);
  assert.match(timer, /time = 0;/u);
  assert.match(timer, /void handleUserTimerExpiry\(\)/u);
  assert.doesNotMatch(timer, /finishQuiz/u);
  assert.match(handler, /timeExpired: true/u);
  assert.match(handler, /startTimer\(\{ preserveElapsed: true \}\)/u);
  assert.match(handler, /returnToBook\(\)/u);
  assert.doesNotMatch(handler, /finishQuiz/u);
  assert.match(timer, /if \(!preserveElapsed \|\| !quizStartedAt\) quizStartedAt = now;/u);
  assert.match(elapsed, /return elapsedSeconds;/u);
});

test("timeout dialog safely owns focus and does not replace another shared dialog", () => {
  const handler = functionSource("handleUserTimerExpiry", "startTimer");
  const cleanup = functionSource("closeTransientQuizOverlaysForTimer", "schedulePendingTimerExpiry");
  const open = functionSource("openModal", "closeModal");
  const close = functionSource("closeModal", "showMessage");

  assert.match(page, /role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-message"/u);
  assert.match(handler, /if \(!modal\.classList\.contains\("hidden"\)\)/u);
  assert.match(handler, /timerExpiryPending = true;/u);
  assert.match(cleanup, /stopAllAudio\(\)/u);
  assert.match(cleanup, /data-help-close/u);
  assert.match(cleanup, /closeExplanation\(\)/u);
  assert.match(open, /timeExpired \? "alertdialog" : "dialog"/u);
  assert.match(open, /modalConfirm\.focus/u);
  assert.match(close, /schedulePendingTimerExpiry\(\)/u);
});

test("timeout dialog uses the shared emerald pill language and fresh cached assets", () => {
  assert.match(styles, /\.modal-card\.modal-time-expired/u);
  assert.match(styles, /border-radius: 999px;/u);
  assert.match(styles, /linear-gradient\(135deg, #0b9f6e 0%, #67d833 100%\)/u);
  assert.match(styles, /@media \(max-width: 380px\)/u);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(page, /mystyle\.css\?v=51-question-footer-reflow/u);
  assert.match(page, /quiz\.js\?v=79-audio-focus/u);
  assert.match(worker, /magicbook-pwa-v160-question-footer-reflow/u);
  assert.match(worker, /mystyle\.css\?v=51-question-footer-reflow/u);
  assert.match(worker, /quiz\.js\?v=79-audio-focus/u);
});
