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

  storage.set("user_session", JSON.stringify({ phone, role: "admin" }));
  storage.delete(preferenceKey);
  assert.equal(feature.isGateDue(now), true, "the learning gate also applies to administrators");
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
  assert.match(index, /openDictionaryFromMenu\(\)/u);
  assert.match(index, /magic-dictionary\.js\?v=1\.1\.0/u);
  assert.match(script, /state\.screen === "dictionary"/u);
  assert.match(script, /MagicDictionaryFeature\?\.onAuthenticated/u);
  assert.match(quiz, /magic-dictionary\.js\?v=1\.1\.0/u);
  assert.match(studyQuiz, /magic-dictionary\.js\?v=1\.1\.0/u);
  assert.match(worker, /magicbook-pwa-v51-dictionary-professional/u);
  assert.match(worker, /magic-dictionary\.css\?v=1\.1\.0/u);
  assert.ok(vercel.rewrites.some(route => route.source === "/dizionario" && route.destination === "/"));
  assert.match(redirects, /^\/dizionario \/index\.html 200$/mu);
  assert.match(source, /magic-word-unlock/u);
  assert.match(source, /openHomeAfterUnlock/u);
  assert.match(source, /Non voglio imparare/u);
  assert.match(source, /Sei sicuro\?/u);
  assert.match(source, /Sì, disattiva/u);
});
