"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Module = require("node:module");
const root = path.resolve(__dirname, "..");
const records = require("../api/_quiz-theory.json");
// In a repo, use its actual shared identity. Staging may point to that same module.
const identityPath = process.env.QUIZ_THEORY_IDENTITY_PATH || path.join(root, "quiz-audio-identity.cjs");
const identity = require(identityPath);
const resolverPath = path.join(root, "lib/quiz-theory.cjs");
const resolverModule = new Module(resolverPath, module);
resolverModule.filename = resolverPath;
const localRequire = Module.createRequire(resolverPath);
resolverModule.require = name => name === "../quiz-audio-identity.cjs" ? identity : localRequire(name);
resolverModule._compile(fs.readFileSync(resolverPath, "utf8"), resolverPath);
const { findQuizTheory } = resolverModule.exports;
const canonical = r => ({ question: r.question_it, figure: "", correct: r.correct_answer });

test("67 sanitized bilingual records, 69 unique keys, preserved answer split and TTS bounds", () => {
  assert.equal(records.length, 67);
  assert.equal(new Set(records.map(r => r.id)).size, 67);
  assert.equal(records.filter(r => r.correct_answer).length, 26);
  assert.equal(new Set(records.flatMap(r => r.keys)).size, 69);
  for (const r of records) {
    assert.deepEqual(Object.keys(r), ["id", "keys", "question_it", "figure", "correct_answer", "focus_it", "explanation"]);
    assert.deepEqual(Object.keys(r.explanation), ["it", "bn"]);
    assert.equal(r.figure, "");
    assert.equal(typeof r.correct_answer, "boolean");
    assert.equal(r.keys[0], identity.getQuizAudioIdentity(r.question_it, "").quizKey);
    assert.ok(r.keys.every(key => /^q2_[a-f0-9]{64}$/.test(key)));
    for (const value of [r.question_it, r.focus_it, r.explanation.it, r.explanation.bn]) {
      assert.ok(value.trim().length > 0 && value.length <= 500);
      assert.doesNotMatch(value, /[\u2013\u2014\uFFFD\u0000-\u001f]|[A-Za-z]:[\\/]|file:\/\//u);
    }
    assert.match(r.explanation.bn, /[\u0980-\u09ff]/u);
  }
});

test("every canonical row resolves in both schemas with exact minimal frozen response", () => {
  for (const r of records) {
    const expected = { id: r.id, correct_answer: r.correct_answer, focus_it: r.focus_it, explanation: r.explanation };
    for (const a of [r.correct_answer, Number(r.correct_answer), String(Number(r.correct_answer))]) {
      assert.deepEqual(findQuizTheory({ question: r.question_it, correct: a, figure: "" }), expected);
      assert.deepEqual(findQuizTheory({ q: r.question_it, a, img: "" }), expected);
    }
    const result = findQuizTheory(canonical(r));
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.explanation));
    assert.equal(findQuizTheory({ ...canonical(r), correct: !r.correct_answer }), null);
  }
});

test("only the two reviewed editorial equivalents resolve; no fuzzy expansions", () => {
  const aliasQuestions = [
    "Il conducente di un veicolo può fare a meno di usare la massima prudenza quando si avvicina ad un incrocio in cui ha il diritto di precedenza",
    "L'autovettura non può avere più di nove posti, compreso il conducente"
  ];
  const aliases = records.filter(r => r.keys.length === 2);
  assert.equal(aliases.length, 2);
  for (const [i, r] of aliases.entries()) {
    assert.equal(r.keys[1], identity.getQuizAudioIdentity(aliasQuestions[i], "").quizKey);
    assert.equal(findQuizTheory({ q: aliasQuestions[i], a: r.correct_answer }).id, r.id);
    assert.equal(findQuizTheory({ q: aliasQuestions[i], a: !r.correct_answer }), null);
  }
  assert.equal(findQuizTheory({ q: "L'autovettura non può avere più di 09 posti, compreso il conducente", a: true }), null);
  assert.equal(findQuizTheory({ q: aliasQuestions[0].replace("ad un", "ad uno"), a: false }), null);
});

test("unmatched light quadricycle remains distinct from opposite non-light proposition", () => {
  const light = records.find(r => r.question_it.startsWith("I quadricicli leggeri,"));
  const nonLight = records.find(r => r.question_it.startsWith("I quadricicli NON leggeri,"));
  assert.equal(light.keys.length, 1);
  assert.notEqual(light.id, nonLight.id);
  assert.equal(findQuizTheory(canonical(light)).correct_answer, true);
  assert.equal(findQuizTheory(canonical(nonLight)).correct_answer, false);
  assert.equal(findQuizTheory({ ...canonical(light), correct: false }), null);
  assert.equal(findQuizTheory({ ...canonical(nonLight), correct: true }), null);
});

test("known answers required; malformed or contradictory schemas fail closed", () => {
  const r = records[0];
  for (const bad of [null, undefined, {}, [], "true", "false", "VERO", "FALSO", "", " ", 2, -1, NaN]) {
    assert.equal(findQuizTheory({ question: r.question_it, correct: bad }), null);
  }
  for (const row of [null, undefined, [], {}, { question: r.question_it },
    { question: r.question_it, correct: true, a: false },
    { question: r.question_it, correct: null, a: true },
    { question: r.question_it, correct: true, q: records[1].question_it },
    { question: "", q: r.question_it, a: true },
    { question: "x".repeat(2501), correct: true },
    { question: {}, correct: true }, { question: "!!!", correct: true }]) {
    assert.equal(findQuizTheory(row), null);
  }
  assert.equal(findQuizTheory({ ...canonical(r), a: "1", q: r.question_it }).id, r.id);
});

test("normalization uses shared identity and refuses every actual figure", () => {
  const r = records[0];
  assert.equal(findQuizTheory({ question: `  ${r.question_it.toUpperCase()}!!!  `, correct: true }).id, r.id);
  for (const none of ["", 0, false, null, undefined, "0", "false", "null", "undefined", "none", "nessuna"]) {
    assert.equal(findQuizTheory({ ...canonical(r), figure: none }).id, r.id);
  }
  for (const figure of ["fig1", "1.png", 1, true, "custom-image.webp", {}, []]) {
    assert.equal(findQuizTheory({ ...canonical(r), figure }), null);
    assert.equal(findQuizTheory({ ...canonical(r), img: figure }), null);
  }
});

test("browser index is frozen hashes only and covers every resolver key", () => {
  const source = fs.readFileSync(path.join(root, "quiz-theory-index.js"), "utf8").replace(/\r\n/g, "\n");
  assert.match(source, /^"use strict";\nwindow\.MagicQuizTheoryKeys = Object\.freeze\(\[[\s\S]*\]\);\n$/);
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  const keys = sandbox.window.MagicQuizTheoryKeys;
  assert.ok(Object.isFrozen(keys));
  assert.deepEqual(Array.from(keys), records.flatMap(r => r.keys));
  assert.equal(keys.length, 69);
  assert.ok(keys.every(key => /^q2_[a-f0-9]{64}$/.test(key)));
  for (const r of records) {
    assert.ok(!source.includes(r.question_it));
    assert.ok(!source.includes(r.explanation.it) && !source.includes(r.explanation.bn));
  }
});

test("approved q38 and explicit alternative thresholds are retained", () => {
  const r = records.find(r => r.question_it === "L'autoveicolo è un qualunque veicolo a motore");
  assert.equal(r.explanation.it, "Anche una moto ha un motore, ma non è un autoveicolo. Perciò non tutti i veicoli a motore sono autoveicoli: la parola «qualunque» rende falsa la frase.");
  assert.equal(r.explanation.bn, "মোটরসাইকেলেও ইঞ্জিন থাকে, কিন্তু সেটি autoveicolo নয়। তাই সব মোটরচালিত যানকে autoveicolo বলা যায় না। এখানে «qualunque» - যেকোনো - শব্দটির কারণেই উত্তর মিথ্যা।");
  const tricicli = records.filter(r => r.question_it.startsWith("I tricicli a motore"));
  assert.equal(tricicli.length, 2);
  for (const t of tricicli) {
    assert.equal(t.correct_answer, true);
    assert.ok(t.explanation.it.startsWith("Nel quiz questa frase è considerata VERA, ma è semplificata."));
    assert.ok(t.explanation.bn.startsWith("এই কুইজে বাক্যটি VERO ধরা হয়, তবে এটি সরল করে বলা হয়েছে।"));
    for (const text of ["50 cm³", "45 km/h", "oppure", "termico", "semplificata"]) assert.ok(t.explanation.it.includes(text));
    for (const text of ["৫০ cm³", "৪৫ km/h", "অথবা", "তাপীয়"]) assert.ok(t.explanation.bn.includes(text));
  }
});
