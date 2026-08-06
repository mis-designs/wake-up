import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  LOCAL_EXAM_ROWS,
  LOCAL_MAGIC_BOOK_ROWS,
  gradeLocalQuiz,
  hideLocalCorrectAnswers,
  selectLocalQuizRows
} from "../api/local-quiz-bank.mjs";

test("local quiz bank contains the complete chapter and exam pools", () => {
  assert.equal(LOCAL_MAGIC_BOOK_ROWS.length, 788);
  assert.equal(LOCAL_EXAM_ROWS.length, 80);
  assert.equal(new Set([...LOCAL_MAGIC_BOOK_ROWS, ...LOCAL_EXAM_ROWS].map(row => row.id)).size, 868);
});

test("local chapter selection supports single and multiple chapters", () => {
  assert.equal(selectLocalQuizRows("1").length, 72);
  assert.equal(selectLocalQuizRows("1,2").length, 119);
  assert.equal(selectLocalQuizRows("").length, 788);
});

test("local grading checks answers without returning the answer key", () => {
  const [first, second] = LOCAL_MAGIC_BOOK_ROWS;
  const result = gradeLocalQuiz([
    { id: first.id, answer: first.correct },
    { id: second.id, answer: second.correct === 1 ? 0 : 1 },
    { id: "missing", answer: 1 }
  ]);
  assert.equal(result.correct, 1);
  assert.equal(result.wrong, 2);
  assert.deepEqual(result.results.map(item => item.correct), [true, false, false]);
  assert.ok(result.results.every(item => !("correctAnswer" in item)));
});

test("public quiz rows never expose private answer metadata", () => {
  const [question] = hideLocalCorrectAnswers([LOCAL_MAGIC_BOOK_ROWS[0]]);
  assert.equal("correct" in question, false);
  assert.equal("explanations" in question, false);
  assert.equal("xyz3d" in question, false);
});

function signAccessToken({ phone, deviceId, secret }) {
  const payload = {
    phone,
    deviceId,
    purpose: "access",
    role: "user",
    exp: Date.now() + 60_000
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }
  };
}

test("quiz loading and grading complete without a quiz upstream request", async () => {
  const secret = "local-quiz-test-secret";
  process.env.GAS_ACCESS_URL = "https://access.invalid";
  process.env.GAS_SECRET = "test-access-secret";
  process.env.SESSION_SECRET = secret;
  delete process.env.QUIZ_GAS_URL;
  delete process.env.QUIZ_PROXY_SECRET;
  const { default: handler } = await import(`../api/quiz.js?local-bank-test=${Date.now()}`);

  const phone = "1234567890";
  const deviceId = "device_123";
  const accessToken = signAccessToken({ phone, deviceId, secret });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("unexpected_upstream_fetch"); };

  try {
    const quizResponse = responseRecorder();
    await handler({
      method: "GET",
      query: { action: "getQuiz", phone, deviceId, chapters: "1" },
      headers: { authorization: `Bearer ${accessToken}` }
    }, quizResponse);

    assert.equal(quizResponse.statusCode, 200, JSON.stringify(quizResponse.body));
    assert.equal(quizResponse.body.quiz.length, 30);
    assert.ok(quizResponse.body.quiz.every(question => !("correct" in question)));

    const examResponse = responseRecorder();
    await handler({
      method: "GET",
      query: { action: "getQuiz", phone, deviceId, mode: "exam80" },
      headers: { authorization: `Bearer ${accessToken}` }
    }, examResponse);
    assert.equal(examResponse.statusCode, 200, JSON.stringify(examResponse.body));
    assert.equal(examResponse.body.quiz.length, 80);
    assert.ok(examResponse.body.quiz.every(question => !("correct" in question)));

    const studyResponse = responseRecorder();
    await handler({
      method: "GET",
      query: { action: "getStudyQuiz", phone, deviceId, chapters: "1" },
      headers: { authorization: `Bearer ${accessToken}` }
    }, studyResponse);
    assert.equal(studyResponse.statusCode, 200, JSON.stringify(studyResponse.body));
    assert.equal(studyResponse.body.quiz.length, 72);

    const first = quizResponse.body.quiz[0];
    const expected = LOCAL_MAGIC_BOOK_ROWS.find(question => question.id === first.id).correct;
    const gradeResponse = responseRecorder();
    await handler({
      method: "POST",
      query: {},
      headers: { "x-quiz-session": quizResponse.body.quizSessionToken },
      body: { action: "checkQuiz", phone, deviceId, answers: [{ id: first.id, answer: expected }] }
    }, gradeResponse);

    assert.equal(gradeResponse.statusCode, 200);
    assert.equal(gradeResponse.body.correct, 1);
    assert.equal(gradeResponse.body.wrong, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
