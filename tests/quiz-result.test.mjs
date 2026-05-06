import assert from "node:assert/strict";
import { calculateQuizResult } from "../api/quiz-result.mjs";

const cases = [
  { totalQuestions: 30, correctAnswers: 27, passed: true, passingScore: 27 },
  { totalQuestions: 30, correctAnswers: 26, passed: false, passingScore: 27 },
  { totalQuestions: 8, correctAnswers: 8, passed: true, passingScore: 8 },
  { totalQuestions: 8, correctAnswers: 7, passed: false, passingScore: 8 },
  { totalQuestions: 18, correctAnswers: 17, passed: true, passingScore: 17 },
  { totalQuestions: 18, correctAnswers: 16, passed: false, passingScore: 17 },
  { totalQuestions: 10, correctAnswers: 9, passed: true, passingScore: 9 },
  { totalQuestions: 10, correctAnswers: 8, passed: false, passingScore: 9 },
  { totalQuestions: 0, correctAnswers: 0, passed: false, passingScore: 0 }
];

for (const testCase of cases) {
  const result = calculateQuizResult(testCase.correctAnswers, testCase.totalQuestions);
  assert.equal(
    result.passed,
    testCase.passed,
    `${testCase.correctAnswers}/${testCase.totalQuestions} passed should be ${testCase.passed}`
  );
  assert.equal(
    result.passingScore,
    testCase.passingScore,
    `${testCase.totalQuestions} questions should require ${testCase.passingScore}`
  );
}

console.log("quiz result threshold tests passed");
