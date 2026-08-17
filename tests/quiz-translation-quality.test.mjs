import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyCuratedQuizTranslation,
  getCuratedQuizTranslation,
  isUsableBengaliTranslation,
  listCuratedQuizTranslations
} from "../api/quiz-translations.mjs";
import { isExactCatalogQuestion } from "../api/quiz.js";

const targetQuestion = "La carreggiata non comprende le piste ciclabili";
const targetTranslation = "গাড়ি চলার অংশের মধ্যে সাইকেল চলার পথ অন্তর্ভুক্ত নয়।";
const tatsQuestion = "I rimorchi T.A.T.S. sono destinati al trasporto di attrezzature che non devono costituire oggetto di commercio, ma essere impiegate solo per il tempo libero";

test("automatic translation accepts only the exact catalog question", () => {
  assert.equal(isExactCatalogQuestion("cap1_q50", tatsQuestion), true);
  assert.equal(isExactCatalogQuestion("cap1_q50", `${tatsQuestion} testo alterato`), false);
  assert.equal(isExactCatalogQuestion("unknown", tatsQuestion), false);
});

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

test("Bengali audio prefers synchronized text and securely falls back to automatic translation", () => {
  const quizSource = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
  const studySource = readFileSync(new URL("../study-quiz.js", import.meta.url), "utf8");
  const helpSource = readFileSync(new URL("../quiz-help.js", import.meta.url), "utf8");
  const quizApi = readFileSync(new URL("../api/quiz.js", import.meta.url), "utf8");
  const trialApi = readFileSync(new URL("../api/trial.js", import.meta.url), "utf8");
  assert.match(quizSource, /fetchBengaliAudio\(q, cacheKey\)/);
  assert.match(quizSource, /automaticBackup = !synchronizedTranslation/);
  assert.match(quizSource, /buildQuizApiUrl\(automaticBackup \? "getBengaliAudio" : "getTTS"/);
  assert.match(quizSource, /automaticBackup \? "automatic" : "tmm_books"/);
  assert.match(quizSource, /questionId = String\(question\?\.id \|\| ""\)/);
  assert.match(studySource, /questionId:\s*String\(question\.id \|\| ""\)/);
  assert.match(studySource, /action:\s*"getTTS"[\s\S]*?text:\s*value/);
  assert.match(studySource, /async function loadAutomaticTranslation\(question\)/);
  assert.match(studySource, /action:\s*"getBengaliAudio"/);
  assert.match(helpSource, /fetchBengaliAudio\(question, cacheKey, \{ requireAudio: false \}\)/);
  assert.match(quizApi, /action === "getBengaliAudio" && !isExactCatalogQuestion\(questionId, text\)[\s\S]*?translation_content_forbidden/);
  assert.match(quizApi, /action === "getTTS" && !BENGALI_TEXT_PATTERN\.test/);
  assert.match(trialApi, /!payload\.audioIds\?\.includes\(questionId\)/);
  assert.match(trialApi, /action === "getTTS" && !BENGALI_TEXT_PATTERN\.test/);
  assert.match(trialApi, /quiz\.flatMap\(q => \[q\.question, q\.question_bd\]/);
  assert.match(helpSource, /buildQuizApiUrl\("getTTS", \{ text: cleanText \}\)/);
  assert.doesNotMatch(studySource, /speechSynthesis|SpeechSynthesisUtterance/);
  assert.doesNotMatch(helpSource, /speechSynthesis|SpeechSynthesisUtterance/);
});

test("study mode treats synchronized V3 translations as authoritative before automatic backup", () => {
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
  assert.match(source, /if \(!usableBanglaTranslation\(help\.translation\)\)[\s\S]*?loadAutomaticTranslation\(question\)/);
  assert.match(source, /TRADUZIONE BANGLA · BACKUP AUTOMATICO/);
  assert.doesNotMatch(source, /loadOnDemandTranslation/);
  assert.match(source, /requestIdleCallback\(prewarmHelpLibrary/);
  assert.doesNotMatch(source, /REMOTE_HELP_TIMEOUT_MS|Promise\.race/);
});
