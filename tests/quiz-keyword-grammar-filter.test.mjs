import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const context = { console };
context.globalThis = context;

for (const filename of ["patenteGlossaryResolver.js", "patenteContextResolverV3.js"]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, filename), "utf8"), context, { filename });
}

const Glossary = context.PatenteGlossaryResolver;
const Resolver = context.PatenteContextResolverV3;

function entry(id, italian, type = "word") {
  return {
    id,
    canonical_italian: italian,
    lemma: italian,
    forms: [italian],
    aliases_it: [],
    type,
    bn: "বাংলা",
    simple_it: "",
    simple_bn: "বাংলা ব্যাখ্যা",
    tts_bn: "বাংলা",
    status: "high",
    confidence: "high",
    translation_authority: "package_v2"
  };
}

function runtimeFor(question, entries) {
  return {
    schema_version: "3.0.0",
    chapters: { ch01: { italian: "Doveri", bangla: "কর্তব্য" } },
    topics: { tp01: { italian: "Passo carrabile", bangla: "প্রবেশপথ" } },
    entries: Object.fromEntries(entries.map(item => [item.id, item])),
    quizzes: {
      q00220: {
        id: "q00220",
        chapter_id: "ch01",
        topic_id: "tp01",
        question,
        entry_ids: entries.map(item => item.id)
      }
    }
  };
}

test("q00220 hides isolated grammar and absorbs phrase components", () => {
  const question = "Il passo carrabile permette ai veicoli che circolano su una strada pubblica di accedere ad un'area laterale adibita alla sosta";
  const runtime = runtimeFor(question, [
    entry("ai_kw_passo_carrabile", "passo carrabile", "technical_phrase"),
    entry("ai_kw_passo", "passo"),
    entry("ai_kw_carrabile", "carrabile"),
    entry("ai_kw_permette", "permette"),
    entry("ai_kw_veicoli", "veicoli"),
    entry("ai_kw_che", "che"),
    entry("ai_kw_ad", "ad")
  ]);

  const result = Resolver.create(runtime).resolve({ id: "q00220", question });
  assert.deepEqual(
    Array.from(result.words, word => word.italian),
    ["passo carrabile", "permette", "veicoli"]
  );
  assert.deepEqual(
    Array.from(result.glossaryAudit.hidden_canonical_keys).sort(),
    ["ad", "carrabile", "che", "passo"]
  );
  assert.equal(result.glossaryAudit.grammar_hidden_count, 2);
});

test("function words remain valid inside useful multi-word phrases", () => {
  const question = "Il veicolo è ammesso ad alto rischio a condizione che rallenti";
  const phrases = [
    entry("phrase_ad", "ad alto rischio", "technical_phrase"),
    entry("phrase_che", "a condizione che", "technical_phrase"),
    entry("word_ad", "ad"),
    entry("word_che", "che")
  ];
  const runtime = runtimeFor(question, phrases);
  const result = Resolver.create(runtime).resolve({ id: "q00220", question });

  assert.deepEqual(
    Array.from(result.words, word => word.italian),
    ["ad alto rischio", "a condizione che"]
  );
  assert.ok(result.words.every(word => word.type === "technical_phrase"));
  assert.equal(result.glossaryAudit.grammar_hidden_count, 2);
});

test("the central grammar policy covers every hidden form and preserves teaching words", () => {
  for (const italian of Glossary.CONFIG.grammar_hidden) {
    assert.equal(
      Glossary.isGrammarHidden(entry(`hidden_${italian}`, italian), { surface: italian }),
      true,
      `${italian} must be hidden when isolated`
    );
  }
  for (const italian of Glossary.CONFIG.grammar_keep) {
    assert.equal(
      Glossary.isGrammarHidden(entry(`keep_${italian}`, italian), { surface: italian }),
      false,
      `${italian} must remain teachable`
    );
  }
  assert.equal(
    Glossary.isGrammarHidden(entry("phrase", "diritto di precedenza", "technical_phrase"), {
      surface: "diritto di precedenza"
    }),
    false
  );
});

test("the V2 fallback and both UI consumers enforce the same central policy", () => {
  const v2 = JSON.parse(fs.readFileSync(path.join(root, "data", "patente", "quiz-help-runtime-v2.json"), "utf8"));
  const hiddenFallbackWords = Object.values(v2.words || {}).filter(word => Glossary.isGrammarHidden({
    canonical_italian: word?.[0],
    lemma: word?.[0],
    type: "word"
  }, {
    surface: word?.[0]
  }));
  assert.equal(hiddenFallbackWords.length, 0);

  for (const filename of ["quiz-help.js", "study-quiz.js"]) {
    const source = fs.readFileSync(path.join(root, filename), "utf8");
    assert.match(source, /function visibleKeywords\(words = \[\]\)/u);
    assert.match(source, /grammar\.isGrammarHidden/u);
    assert.match(source, /words: visibleKeywords\(resolved\.words\)/u);
    assert.match(source, /const words = visibleKeywords\(wordIds\.map/u);
  }
});

test("the synchronized resolver and cache versions are deployed together", () => {
  const quizPage = fs.readFileSync(path.join(root, "quiz.html"), "utf8");
  const studyPage = fs.readFileSync(path.join(root, "study-quiz.html"), "utf8");
  const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

  for (const source of [quizPage, studyPage, worker]) {
    assert.match(source, /patenteContextResolverV3\.js\?v=4\.0\.0-glossary-display/u);
  }
  assert.match(worker, /magicbook-pwa-v159-solid-profile-controls/u);
  assert.match(worker, /quiz-help\.js\?v=20260903-audio-focus/u);
  assert.match(worker, /study-quiz\.js\?v=24-audio-focus/u);
});
