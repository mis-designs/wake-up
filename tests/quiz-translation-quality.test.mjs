import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyCuratedQuizTranslation,
  getCuratedQuizTranslation,
  isUsableBengaliTranslation,
  listCuratedQuizTranslations
} from "../api/quiz-translations.mjs";

const targetQuestion = "La carreggiata non comprende le piste ciclabili";
const targetTranslation = "গাড়ি চলার অংশের মধ্যে সাইকেল চলার পথ অন্তর্ভুক্ত নয়।";

test("the known carreggiata question has a precise curated Bengali translation", () => {
  assert.equal(getCuratedQuizTranslation({ id: "q00149", question: targetQuestion }), targetTranslation);
  assert.equal(getCuratedQuizTranslation({ id: "149", question: `${targetQuestion}.` }), targetTranslation);
  assert.equal(getCuratedQuizTranslation({ id: "wrong", question: targetQuestion }), targetTranslation);
  assert.equal(getCuratedQuizTranslation({ id: "q00149", question: "Domanda diversa" }), "");
});

test("curated translations replace an inaccurate database value and remain valid Bengali", () => {
  const row = applyCuratedQuizTranslation({
    id: "q00149",
    question: targetQuestion,
    question_bd: "সড়কটিতে সাইকেল চলার পথ নেই।"
  });
  assert.equal(row.question_bd, targetTranslation);
  assert.equal(row.questionTranslationSource, "curated");
  assert.equal(isUsableBengaliTranslation(row.question_bd), true);
  assert.equal(isUsableBengaliTranslation("??? ?????"), false);
  assert.equal(isUsableBengaliTranslation("traduzione italiana"), false);
  assert.ok(listCuratedQuizTranslations().every(item => item.translation.length <= 200));
});

test("the V2 fifth field is contextual speech, never the question translation", () => {
  const runtime = JSON.parse(readFileSync(new URL("../data/patente/quiz-help-runtime-v2.json", import.meta.url), "utf8"));
  const filled = Object.values(runtime.quizzes || {}).filter(row => String(row?.[4] || "").trim());
  assert.ok(filled.length > 0);
  assert.ok(filled.every(row => (row?.[3] || []).some(id => String(id).startsWith("ctx_"))));

  const studySource = readFileSync(new URL("../study-quiz.js", import.meta.url), "utf8");
  const helpSource = readFileSync(new URL("../quiz-help.js", import.meta.url), "utf8");
  assert.match(studySource, /wordIds = \[\], contextBn = ""/);
  assert.match(helpSource, /wordIds = \[\], contextBn = ""/);
  assert.doesNotMatch(studySource, /questionBD \|\| translation/);
  assert.doesNotMatch(helpSource, /questionBnEasy:\s*contextBn/);
});

test("corrupt remote translations are rejected before the V3 runtime is used", () => {
  const loader = readFileSync(new URL("../quizHelpRuntimeV3Loader.js", import.meta.url), "utf8");
  assert.match(loader, /assertTranslationEncoding\(runtime\)/);
  assert.match(loader, /quiz_help_runtime_translation_encoding_invalid/);
  assert.match(loader, /codePoint >= 0x0980 && codePoint <= 0x09ff/);
});

test("Bengali audio uses only synchronized text and never asks for automatic translation", () => {
  const quizSource = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
  const studySource = readFileSync(new URL("../study-quiz.js", import.meta.url), "utf8");
  const helpSource = readFileSync(new URL("../quiz-help.js", import.meta.url), "utf8");
  const quizApi = readFileSync(new URL("../api/quiz.js", import.meta.url), "utf8");
  const trialApi = readFileSync(new URL("../api/trial.js", import.meta.url), "utf8");
  assert.match(quizSource, /fetchBengaliAudio\(q, cacheKey\)/);
  assert.match(quizSource, /buildQuizApiUrl\("getTTS"/);
  assert.match(quizSource, /translationSource: "tmm_books"/);
  assert.match(quizSource, /throw new Error\("translation_not_synced"\)/);
  assert.doesNotMatch(quizSource, /buildQuizApiUrl\("getBengaliAudio"/);
  assert.match(quizSource, /questionId = String\(question\?\.id \|\| ""\)/);
  assert.match(studySource, /questionId:\s*String\(question\.id \|\| ""\)/);
  assert.match(studySource, /action:\s*"getTTS"[\s\S]*?text:\s*value/);
  assert.doesNotMatch(studySource, /action:\s*"getBengaliAudio"/);
  assert.doesNotMatch(helpSource, /loadOnDemandTranslation|getBengaliAudio/);
  assert.match(quizApi, /action === "getBengaliAudio" && !curatedTranslation[\s\S]*?translation_not_synced/);
  assert.match(trialApi, /action === "getBengaliAudio" && !curatedTranslation[\s\S]*?translation_not_synced/);
  assert.match(trialApi, /quiz\.flatMap\(q => \[q\.question, q\.question_bd\]/);
  assert.match(helpSource, /buildQuizApiUrl\("getTTS", \{ text: cleanText \}\)/);
  assert.doesNotMatch(studySource, /speechSynthesis|SpeechSynthesisUtterance/);
  assert.doesNotMatch(helpSource, /speechSynthesis|SpeechSynthesisUtterance/);
});

test("study mode treats synchronized V3 translations as authoritative", () => {
  const page = readFileSync(new URL("../study-quiz.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("../study-quiz.js", import.meta.url), "utf8");

  const resolverPosition = page.indexOf("patenteContextResolverV3.js");
  const loaderPosition = page.indexOf("quizHelpRuntimeV3Loader.js");
  const studyPosition = page.indexOf("study-quiz.js");
  assert.ok(resolverPosition >= 0 && resolverPosition < loaderPosition);
  assert.ok(loaderPosition < studyPosition);
  assert.match(page, /QUIZ_HELP_RUNTIME_V3_DEFAULT_ENABLED\s*=\s*true/);
  assert.match(source, /data\.resolver\.resolve\(question\)/);
  assert.match(source, /resolved\.questionBnStandard \|\| resolved\.questionBnEasy \|\| resolved\.questionBn/);
  assert.doesNotMatch(source, /loadOnDemandTranslation|preferredTranslation \? "getTTS" : "getBengaliAudio"/);
  assert.match(source, /Traduzione TMM Books non ancora sincronizzata\./);
  assert.match(source, /requestIdleCallback\(prewarmHelpLibrary/);
  assert.doesNotMatch(source, /REMOTE_HELP_TIMEOUT_MS|Promise\.race/);
});
