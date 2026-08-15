import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "magic-dictionary.js"), "utf8");
const storage = new Map();
const context = {
  URL,
  TextDecoder,
  TextEncoder,
  clearTimeout,
  console,
  location: { pathname: "/home" },
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value))
  },
  setTimeout,
  addEventListener() {}
};
context.globalThis = context;
vm.runInNewContext(source, context, { filename: "magic-dictionary.js" });
const feature = context.MagicDictionaryFeature;

test("the authenticated learning gate requires five correct words every twelve hours", () => {
  assert.equal(feature.REQUIRED_CORRECT, 5);
  assert.equal(feature.GATE_INTERVAL_MS, 12 * 60 * 60 * 1000);

  const phone = "393331234567";
  storage.set("loggedIn", "true");
  storage.set("phone", phone);
  storage.set("user_session", JSON.stringify({ phone, role: "user" }));
  const preferenceKey = `magicbook.wordLearning.v1.${feature.__test.hashString(phone)}`;
  const now = Date.now();

  storage.delete(preferenceKey);
  assert.equal(feature.isGateDue(now), true);

  storage.set(preferenceKey, JSON.stringify({ lastCompletedAt: now, disabled: false }));
  assert.equal(feature.isGateDue(now), false);

  storage.set(preferenceKey, JSON.stringify({ lastCompletedAt: now - feature.GATE_INTERVAL_MS - 1, disabled: false }));
  assert.equal(feature.isGateDue(now), true);

  storage.set(preferenceKey, JSON.stringify({ lastCompletedAt: 0, disabled: true }));
  assert.equal(feature.isGateDue(now), false);

  storage.set(preferenceKey, JSON.stringify({
    lastCompletedAt: now,
    disabled: false,
    active: { manual: true, wordIds: ["w1", "w2", "w3", "w4", "w5"] }
  }));
  assert.equal(feature.isGateDue(now), false, "manual practice must not become an access gate after refresh");

  storage.set("user_session", JSON.stringify({ phone, role: "admin" }));
  storage.delete(preferenceKey);
  assert.equal(feature.isGateDue(now), true, "the learning gate also applies to administrators");
});

test("consecutive sessions select five new words and only recycle after the catalog is exhausted", () => {
  const words = Array.from({ length: 80 }, (_, index) => ({ id: `word-${index}` }));
  const first = feature.__test.selectFreshWords(words, [], "same-period");
  const firstIds = first.map(word => word.id);
  const second = feature.__test.selectFreshWords(words, firstIds, "same-period");

  assert.equal(first.length, 5);
  assert.equal(second.length, 5);
  assert.equal(second.some(word => firstIds.includes(word.id)), false);

  const almostComplete = words.slice(0, 78).map(word => word.id);
  const rollover = feature.__test.selectFreshWords(words, almostComplete, "rollover");
  const rolloverIds = rollover.map(word => word.id);
  const recent = new Set(almostComplete.slice(-50));
  assert.ok(rolloverIds.includes("word-78"));
  assert.ok(rolloverIds.includes("word-79"));
  assert.equal(rolloverIds.some(id => recent.has(id)), false);
  assert.equal(new Set(rolloverIds).size, 5);
  assert.doesNotMatch(source, /createGateSession\(\{ \.\.\.preference, history: \[\] \}\)/u);
});

test("dictionary dashboard reports real catalog progress and review timing", () => {
  const words = Array.from({ length: 20 }, (_, index) => ({ id: `word-${index}` }));
  const now = Date.now();
  const stats = feature.__test.dictionaryLearningStats(words, {
    history: ["word-0", "word-1", "word-2", "word-3", "word-4", "removed-word"],
    lastCompletedAt: now,
    disabled: false
  }, now);

  assert.equal(stats.total, 20);
  assert.equal(stats.learned, 5);
  assert.equal(stats.percent, 25);
  assert.match(stats.nextReview, /^Tra 12 h$/u);
  assert.equal(feature.__test.dictionaryLearningStats(words, { disabled: true }, now).nextReview, "Ripasso disattivato");
});

test("the local fallback remains a valid non-grammar Italian-Bangla dictionary", () => {
  const runtime = JSON.parse(fs.readFileSync(path.join(root, "data", "patente", "quiz-help-runtime-v2.json"), "utf8"));
  const words = feature.buildV2Catalog(runtime);
  const normalize = feature.__test.normalizeItalian;
  assert.ok(words.length >= 300);
  assert.equal(new Set(words.map(word => normalize(word.it))).size, words.length);
  assert.ok(words.every(word => /[\u0980-\u09ff]/u.test(word.bn)));
  assert.ok(!words.some(word => ["il", "la", "e", "che", "essere"].includes(normalize(word.it))));
});

test("new authoritative quiz translations override an older dictionary label", () => {
  const runtime = {
    entries: {
      w_segnale: {
        id: "w_segnale",
        canonical_italian: "segnale",
        lemma: "segnale",
        bn: "পুরোনো সংকেত",
        simple_bn: "পুরোনো অর্থ।",
        type: "word"
      },
      ai_kw_segnale: {
        id: "ai_kw_segnale",
        canonical_italian: "segnale",
        lemma: "segnale",
        bn: "সড়ক সংকেত",
        simple_bn: "নিয়ম, বিপদ বা তথ্য জানানো চিহ্ন।",
        type: "word"
      }
    },
    quizzes: {
      q1: { entry_ids: ["ai_kw_segnale"] },
      q2: { entry_ids: ["ai_kw_segnale"] }
    }
  };
  const words = feature.buildV3Catalog(runtime);
  assert.equal(words.length, 1);
  assert.equal(words[0].id, "w_segnale");
  assert.equal(words[0].sourceId, "ai_kw_segnale");
  assert.equal(words[0].bn, "সড়ক সংকেত");
});

test("Magic Book exposes the dictionary from home and the chapter menu", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
  const quiz = fs.readFileSync(path.join(root, "quiz.html"), "utf8");
  const studyQuiz = fs.readFileSync(path.join(root, "study-quiz.html"), "utf8");
  const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
  const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const redirects = fs.readFileSync(path.join(root, "_redirects"), "utf8");

  assert.match(index, /home-dictionary-entry/u);
  assert.match(index, /premium-new-badge home-dictionary-new-badge/u);
  assert.doesNotMatch(index, /home-dictionary-mark/u);
  assert.match(index, /openDictionaryFromMenu\(\)/u);
  assert.match(index, /magic-dictionary\.js\?v=1\.2\.4/u);
  assert.match(quiz, /magic-dictionary\.js\?v=1\.2\.4/u);
  assert.match(studyQuiz, /magic-dictionary\.js\?v=1\.2\.4/u);
  assert.match(script, /state\.screen === "dictionary"/u);
  assert.match(script, /MagicDictionaryFeature\?\.onAuthenticated/u);
  assert.match(worker, /magicbook-pwa-v90-study-section-cover/u);
  assert.match(worker, /magic-dictionary\.js\?v=1\.2\.4/u);
  assert.match(worker, /magic-dictionary\.css\?v=1\.2\.2/u);
  assert.ok(vercel.rewrites.some(route => route.source === "/dizionario" && route.destination === "/"));
  assert.match(redirects, /^\/dizionario \/index\.html 200$/mu);
  assert.match(source, /magic-word-unlock/u);
  assert.match(source, /openHomeAfterUnlock/u);
  assert.match(source, /magic-dictionary-dashboard/u);
  assert.match(source, /magicDictionaryFeaturedItalian/u);
  assert.match(source, /magicDictionaryProgressRing/u);
  assert.match(source, /<h1 id="magicDictionaryTitle">Dizionario<\/h1>/u);
  assert.doesNotMatch(source, /magic-dictionary-term"><span/u);
  assert.match(source, /Non voglio imparare/u);
  assert.match(source, /Sei sicuro\?/u);
  assert.match(source, /gate\.className = "magic-word-gate hidden notranslate"/u);
  assert.match(source, /gate\.lang = "it"/u);
  assert.match(source, /gate\.setAttribute\("translate", "no"\)/u);
  assert.match(source, /documentElement\.lang = "it"/u);
  assert.match(source, /documentElement\.setAttribute\("translate", "no"\)/u);
  assert.match(source, /documentElement\.classList\.add\("notranslate"\)/u);
  assert.match(source, /dictionary\.className = "magic-dictionary-screen hidden notranslate"/u);
  assert.match(source, /dictionary\.lang = "it"/u);
  assert.match(source, /dictionary\.setAttribute\("translate", "no"\)/u);
  assert.match(source, /Sì, disattiva/u);
});

test("the word exercise remains Italian regardless of the browser language", () => {
  for (const page of ["index.html", "quiz.html", "study-quiz.html"]) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    assert.match(html, /<html lang="it" translate="no" class="notranslate">/u);
    assert.match(html, /<meta name="google" content="notranslate">/u);
  }

  assert.match(source, /5 PAROLE OGNI 12 ORE/u);
  assert.match(source, /Qual è il significato corretto\?/u);
  assert.match(source, /Non voglio imparare/u);
  assert.match(source, /class="magic-word-prompt" lang="it"/u);
  assert.match(source, /data-word-id="\$\{escapeHtml\(option\.id\)\}" lang="bn"/u);
  assert.doesNotMatch(source, /navigator\.(?:language|languages)/u);
});

test("the word exercise speaks each Italian prompt and the Italian word behind a wrong answer", () => {
  const events = [];
  class MockUtterance {
    constructor(text) {
      this.text = text;
    }
  }
  context.SpeechSynthesisUtterance = MockUtterance;
  context.speechSynthesis = {
    cancel: () => events.push({ type: "cancel" }),
    getVoices: () => [
      { lang: "en-US", name: "English" },
      { lang: "it-IT", name: "Italiano" }
    ],
    speak: utterance => events.push({ type: "speak", utterance })
  };

  assert.equal(feature.__test.speakItalian("fermarsi"), true);
  const spoken = events.find(event => event.type === "speak")?.utterance;
  assert.equal(spoken.text, "fermarsi");
  assert.equal(spoken.lang, "it-IT");
  assert.equal(spoken.rate, 0.92);
  assert.equal(spoken.voice.name, "Italiano");
  assert.match(source, /speakItalian\(word\.it, \{ delayMs: WORD_ARRIVAL_SPEECH_DELAY_MS \}\)/u);
  assert.match(source, /const selectedWord = findWord\(selectedId\);[\s\S]*speakItalian\(selectedWord\.it\)/u);
  assert.match(source, /answerLocked = true;\s+stopItalianSpeech\(\);/u);
});
