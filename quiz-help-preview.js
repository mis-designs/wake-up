(function exposeQuizHelpPreview(root) {
  "use strict";

  const HELP_MANIFEST_SOURCE = "https://www.tmmbooks.eu/dist/patente/quiz-help-runtime-manifest.json";
  const LOCAL_HELP_SOURCE = "/data/patente/quiz-help-runtime-v2.json";
  let libraryPromise = null;
  let v2QuizIdIndex = null;
  const helpCache = new Map();

  function questionText(question = {}) {
    return String(question.question || question.q || "").trim();
  }

  function normalize(value = "") {
    return String(value)
      .toLocaleLowerCase("it-IT")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[\u2018\u2019]/gu, "'")
      .trim()
      .replace(/[.!?]+$/gu, "")
      .replace(/\s+/gu, " ");
  }

  function hash(value = "") {
    let result = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 0x01000193);
    }
    return (result >>> 0).toString(36);
  }

  function fingerprint(question) {
    const figure = String(question?.figure || question?.img || "")
      .match(/(\d+)(?=\.[a-z0-9]+$|$)/i)?.[1] || "";
    return hash(normalize(questionText(question)) + "|" + figure);
  }

  function usableBangla(value = "") {
    const text = String(value || "").trim();
    return [...text].some(character => {
      const codePoint = character.codePointAt(0);
      return codePoint >= 0x0980 && codePoint <= 0x09ff;
    }) ? text : "";
  }

  function asList(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.value)) return value.value;
    return [];
  }

  function displayForm(question, canonical, aliases = []) {
    const normalizedQuestion = " " + normalize(question) + " ";
    const candidates = Array.isArray(aliases) ? aliases : [aliases];
    return [...new Set([...candidates, canonical])]
      .filter(Boolean)
      .sort((left, right) => String(right).length - String(left).length)
      .find(candidate => normalizedQuestion.includes(" " + normalize(candidate) + " ")) || canonical;
  }

  function visibleKeywords(words = []) {
    const grammar = root.PatenteGlossaryResolver;
    return words
      .filter(Boolean)
      .filter(word => {
        if (!grammar?.isGrammarHidden) return true;
        return !grammar.isGrammarHidden({
          canonical_italian: word.canonicalItalian || word.italian,
          lemma: word.lemma || word.canonicalItalian || word.italian,
          type: word.type || "word"
        }, {
          surface: word.italian || word.canonicalItalian
        });
      })
      .filter(word => word.italian && usableBangla(word.bangla));
  }

  function normalizeWord(word, id = "") {
    if (!word) return null;
    return {
      id: word.id || id,
      italian: String(word.italian || word.display_italian || word.canonicalItalian || "").trim(),
      canonicalItalian: String(word.canonicalItalian || word.canonical_italian || word.italian || "").trim(),
      lemma: String(word.lemma || "").trim(),
      bangla: usableBangla(word.bangla || word.bn),
      simpleIt: String(word.simpleIt || word.simple_it || "").trim(),
      simpleBn: usableBangla(word.simpleBn || word.simple_bn),
      ttsBn: usableBangla(word.ttsBn || word.tts_bn),
      type: word.type || "word"
    };
  }

  function contextPair(value) {
    if (Array.isArray(value)) {
      return { italian: String(value[0] || "").trim(), bangla: usableBangla(value[1]) };
    }
    return {
      italian: String(value?.italian || "").trim(),
      bangla: usableBangla(value?.bangla)
    };
  }

  function emptyHelp(source = "") {
    return {
      translation: "",
      translationSource: "",
      chapter: null,
      topic: null,
      contextBn: "",
      words: [],
      source
    };
  }

  async function loadLibrary() {
    if (!libraryPromise) {
      root.QUIZ_HELP_RUNTIME_V3_MANIFEST_URL = root.QUIZ_HELP_RUNTIME_V3_MANIFEST_URL || HELP_MANIFEST_SOURCE;
      const remote = Promise.resolve().then(() => {
        if (!root.QuizHelpRuntimeV3?.load || !root.PatenteContextResolverV3) {
          throw new Error("quiz_help_preview_runtime_missing");
        }
        return root.QuizHelpRuntimeV3.load();
      }).then(bundle => ({ ...bundle, source: "runtime_v3" }));

      libraryPromise = remote
        .catch(() => root.fetch(LOCAL_HELP_SOURCE, { cache: "force-cache" })
          .then(response => {
            if (!response.ok) throw new Error("quiz_help_preview_local_" + response.status);
            return response.json();
          })
          .then(data => ({ data, source: "runtime_v2" })))
        .catch(error => {
          libraryPromise = null;
          throw error;
        });
    }
    return libraryPromise;
  }

  function buildV2Index(data) {
    if (v2QuizIdIndex) return v2QuizIdIndex;
    v2QuizIdIndex = new Map();
    Object.values(data?.quizzes || {}).forEach(value => {
      if (!Array.isArray(value) || !value[0]) return;
      const id = String(value[0]).toLocaleLowerCase("it-IT");
      v2QuizIdIndex.set(id, value);
      const digits = id.match(/\d+/)?.[0];
      if (digits) v2QuizIdIndex.set(String(Number(digits)), value);
    });
    return v2QuizIdIndex;
  }

  function decodeV2(question, data, source) {
    const index = buildV2Index(data);
    const sourceId = String(question?.id || question?.quizId || "").trim().toLocaleLowerCase("it-IT");
    const digits = sourceId.match(/\d+/)?.[0];
    const row = data?.quizzes?.[fingerprint(question)]
      || index.get(sourceId)
      || (digits ? index.get(String(Number(digits))) : null);
    if (!Array.isArray(row)) return null;

    const [quizId, chapterId, topicId, wordIds = [], contextBn = ""] = row;
    const chapter = contextPair(data.chapters?.[chapterId]);
    const topic = contextPair(data.topics?.[topicId]);
    const words = visibleKeywords(asList(wordIds).map(id => {
      const word = data.words?.[id];
      if (!Array.isArray(word)) return null;
      return normalizeWord({
        id,
        italian: displayForm(questionText(question), word[0], word[4]),
        canonicalItalian: word[0],
        bangla: word[1],
        simpleIt: word[2],
        simpleBn: word[3],
        ttsBn: word[5]
      }, id);
    }));

    const translation = usableBangla(question?.question_bd || question?.questionBD);
    return {
      quizId,
      translation,
      translationSource: translation ? question.questionTranslationSource || "catalog" : "",
      chapter,
      topic,
      contextBn: usableBangla(contextBn),
      words,
      source
    };
  }

  function decodeV3(question, bundle) {
    const resolved = bundle?.resolver?.resolve(question);
    if (!resolved) return null;
    const translation = usableBangla(
      resolved.questionBnStandard || resolved.questionBnEasy || resolved.questionBn
    );
    return {
      quizId: resolved.quizId || "",
      translation,
      translationSource: translation ? "runtime_v3" : "",
      chapter: contextPair(resolved.chapter),
      topic: contextPair(resolved.topic),
      contextBn: "",
      words: visibleKeywords((resolved.words || []).map(word => normalizeWord(word))),
      source: "runtime_v3"
    };
  }

  function catalogFallback(question) {
    const translation = usableBangla(question?.question_bd || question?.questionBD);
    return {
      ...emptyHelp(translation ? "catalog" : ""),
      translation,
      translationSource: translation ? question.questionTranslationSource || "catalog" : ""
    };
  }

  async function getQuestionHelp(question = {}) {
    const key = String(question.id || question.quizId || fingerprint(question));
    if (!helpCache.has(key)) {
      const pending = loadLibrary()
        .then(bundle => {
          const decoded = bundle?.resolver
            ? decodeV3(question, bundle)
            : decodeV2(question, bundle?.data || bundle, bundle?.source || "runtime_v2");
          return decoded || catalogFallback(question);
        })
        .catch(() => catalogFallback(question));
      helpCache.set(key, pending);
    }
    return helpCache.get(key);
  }

  root.QuizHelpPreview = Object.freeze({
    getQuestionHelp
  });
})(typeof globalThis !== "undefined" ? globalThis : window);

