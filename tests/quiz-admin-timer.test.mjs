import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../quiz.html", import.meta.url), "utf8");
const source = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
const api = readFileSync(new URL("../api/quiz.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

function functionSource(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

test("Admin timer changes from the normal countdown to explicit elapsed overtime", () => {
  const formatSource = functionSource("formatTimer", "getQuizTimerPresentation");
  const presentationSource = functionSource("getQuizTimerPresentation", "parseStoredQuizSession");
  const getPresentation = Function(
    `${formatSource}\n${presentationSource}\nreturn getQuizTimerPresentation;`
  )();

  assert.deepEqual(getPresentation(1, true), {
    text: "0:01",
    ariaLabel: "Tempo rimanente",
    isOvertime: false
  });
  assert.deepEqual(getPresentation(0, true), {
    text: "+0:00",
    ariaLabel: "Tempo supplementare Admin: 0:00",
    isOvertime: true
  });
  assert.deepEqual(getPresentation(-61, true), {
    text: "+1:01",
    ariaLabel: "Tempo supplementare Admin: 1:01",
    isOvertime: true
  });
  assert.deepEqual(getPresentation(0, false), {
    text: "0:00",
    ariaLabel: "Tempo rimanente",
    isOvertime: false
  });
});

test("only a server-authorized Admin enters uninterrupted overtime", () => {
  const elapsed = functionSource("getElapsedQuizSeconds", "paintQuizTimer");
  const timer = functionSource("startTimer", "allAnswered");

  assert.match(api, /const admin = access\.role === "admin";/u);
  assert.match(api, /isAdmin: admin/u);
  assert.match(source, /isAdmin = data\.isAdmin === true;/u);
  assert.match(timer, /time <= 0 && !isAdmin/u);
  assert.match(timer, /void handleUserTimerExpiry\(\)/u);
  assert.doesNotMatch(timer, /finishQuiz/u);
  assert.match(timer, /time = cycleSeconds - elapsedCycleSeconds/u);
  assert.match(elapsed, /return elapsedSeconds;/u);
});

test("the Admin overtime timer ships in fresh quiz and PWA assets", () => {
  assert.match(page, /quiz\.js\?v=78-audio-speed-cycle/u);
  assert.match(worker, /magicbook-pwa-v158-admin-profile-logo/u);
  assert.match(worker, /quiz\.js\?v=78-audio-speed-cycle/u);
});
