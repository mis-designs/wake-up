(function exposePatenteContextResolverV3(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PatenteContextResolverV3 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createResolverApi() {
  "use strict";

  function normalizeItalian(value = "") {
    return String(value)
      .normalize("NFC")
      .toLocaleLowerCase("it-IT")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[\u2018\u2019`\u00b4]/gu, "'")
      .replace(/[^\p{L}\p{N}']+/gu, " ")
      .trim()
      .replace(/\s+/gu, " ");
  }

  function normalizeForMatch(value = "") {
    return normalizeItalian(value).replace(/'/gu, " ").replace(/\s+/gu, " ").trim();
  }

  function italianTokenStem(value = "") {
    const token = normalizeForMatch(value);
    if (token.length <= 3) return token;
    if (/[cg]i[ae]$/u.test(token)) return token.slice(0, -2);
    let stem = token.replace(/[aeio]$/u, "");
    if (/[ei]$/u.test(token) && /[cg]h$/u.test(stem)) stem = stem.slice(0, -1);
    return stem;
  }

  function containsItalianPhrase(text = "", phrase = "") {
    const sourceTokens = normalizeForMatch(text).split(" ").filter(Boolean);
    const phraseTokens = normalizeForMatch(phrase).split(" ").filter(Boolean);
    if (!phraseTokens.length || phraseTokens.length > sourceTokens.length) return false;
    for (let start = 0; start <= sourceTokens.length - phraseTokens.length; start += 1) {
      const matches = phraseTokens.every((token, offset) => {
        const sourceToken = sourceTokens[start + offset];
        return sourceToken === token || italianTokenStem(sourceToken) === italianTokenStem(token);
      });
      if (matches) return true;
    }
    return false;
  }

  function figureNumber(question = {}) {
    const source = String(question.figure || question.img || "");
    return source.match(/(\d+)(?=\.[a-z0-9]+$|$)/i)?.[1] || "";
  }

  function hashFingerprint(question = {}) {
    const value = `${normalizeItalian(question.question || question.q)}|${figureNumber(question)}`;
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
  }

  function normalizeQuizId(value = "") {
    const source = String(value || "").trim().toLocaleLowerCase("it-IT");
    if (/^q\d{5}$/u.test(source)) return source;
    const digits = source.match(/^(?:q)?(\d+)$/u)?.[1];
    if (!digits) return "";
    const number = Number(digits);
    return Number.isFinite(number) && number > 0
      ? `q${String(number).padStart(5, "0")}`
      : "";
  }

  function isPublishableEntry(entry) {
    return Boolean(
      entry &&
      ["approved", "high"].includes(entry.status) &&
      ["approved", "high"].includes(entry.confidence) &&
      entry.bn
    );
  }

  function tokenCount(value = "") {
    return normalizeItalian(value).split(" ").filter(Boolean).length;
  }

  function entryForms(entry, { forPhraseMatch = false } = {}) {
    const canonicalTokenCount = tokenCount(entry?.canonical_italian);
    return [
      entry?.canonical_italian,
      ...(entry?.aliases_it || []),
      ...(entry?.forms || []).map(form => typeof form === "string" ? form : form?.text)
    ]
      .filter(Boolean)
      .filter(form =>
        !forPhraseMatch ||
        entry?.type !== "technical_phrase" ||
        canonicalTokenCount <= 1 ||
        tokenCount(form) > 1
      )
      .filter((form, index, forms) =>
        forms.findIndex(candidate => normalizeItalian(candidate) === normalizeItalian(form)) === index
      );
  }

  function displayForm(questionText, entry) {
    const normalizedQuestion = ` ${normalizeForMatch(questionText)} `;
    const candidates = entryForms(entry, { forPhraseMatch: entry?.type === "technical_phrase" })
      .sort((left, right) => right.length - left.length);
    return candidates.find(candidate =>
      normalizedQuestion.includes(` ${normalizeForMatch(candidate)} `)
    ) || entry.canonical_italian;
  }

  function hasOverlap(candidate, ranges) {
    return ranges.some(range =>
      candidate.start < range.end && candidate.end > range.start
    );
  }

  function findLongestPhraseMatches(text, entries) {
    const normalized = normalizeForMatch(text);
    const matches = [];
    for (const entry of entries) {
      if (!entry || entry.type !== "technical_phrase" || !isPublishableEntry(entry)) continue;
      const forms = entryForms(entry, { forPhraseMatch: true })
        .map(normalizeForMatch)
        .filter(Boolean)
        .sort((left, right) => right.length - left.length);
      let best = null;
      for (const form of forms) {
        const start = (` ${normalized} `).indexOf(` ${form} `);
        if (start < 0) continue;
        const candidate = {
          entry,
          start,
          end: start + form.length,
          token_count: form.split(" ").length,
          length: form.length
        };
        if (!best || candidate.token_count > best.token_count || candidate.length > best.length) {
          best = candidate;
        }
      }
      if (best) matches.push(best);
    }
    matches.sort((left, right) =>
      Number(right.entry?.translation_authority === "package_v2") - Number(left.entry?.translation_authority === "package_v2") ||
      right.token_count - left.token_count ||
      right.length - left.length ||
      left.start - right.start ||
      left.entry.id.localeCompare(right.entry.id)
    );
    const selected = [];
    for (const match of matches) {
      if (hasOverlap(match, selected)) continue;
      selected.push(match);
    }
    return selected.sort((left, right) => left.start - right.start);
  }

  function shortBangla(entry) {
    const value = String(entry?.bn || "").trim().replace(/\s+/gu, " ");
    if (!value) return "";
    const words = value.split(/\s+/u).filter(Boolean);
    if (value.length <= 64 && words.length <= 7) return value;

    const firstClause = value
      .split(/[,،;:।.!?]/u)
      .map(part => part.trim())
      .find(Boolean);
    if (firstClause && firstClause.length <= 48 && firstClause.split(/\s+/u).length <= 5) {
      return firstClause;
    }

    return words.slice(0, 4).join(" ");
  }

  function entrySemanticKey(entry) {
    if (String(entry?.id || "").startsWith("ai_kw_")) {
      return normalizeItalian(entry?.canonical_italian || entry?.id);
    }
    return normalizeItalian(entry?.lemma || entry?.canonical_italian || entry?.id);
  }

  function preferEntry(left, right, questionText = "") {
    const score = entry => {
      const short = shortBangla(entry);
      const visible = normalizeItalian(displayForm(questionText, entry));
      const canonical = normalizeItalian(entry?.canonical_italian);
      return (canonical && canonical === visible ? 12 : 0)
        + (entry?.translation_authority === "package_v2" ? 64 : 0)
        + (String(entry?.id || "").startsWith("w_") ? 8 : 0)
        + (entry?.status === "approved" ? 4 : 0)
        + (entry?.confidence === "approved" ? 2 : 0)
        + (entry?.simple_it ? 1 : 0)
        - Math.min(short.length, 80) / 1000;
    };
    return score(right) > score(left) ? right : left;
  }

  function dedupeSemanticEntries(entries, questionText = "") {
    const order = [];
    const byKey = new Map();
    for (const entry of entries) {
      const key = entrySemanticKey(entry);
      if (!key) continue;
      if (!byKey.has(key)) {
        order.push(key);
        byKey.set(key, entry);
      } else {
        byKey.set(key, preferEntry(byKey.get(key), entry, questionText));
      }
    }
    const semanticEntries = order.map(key => byKey.get(key));
    const visibleOrder = [];
    const byVisible = new Map();
    for (const entry of semanticEntries) {
      const visible = normalizeItalian(displayForm(questionText, entry));
      if (!visible) continue;
      if (!byVisible.has(visible)) {
        visibleOrder.push(visible);
        byVisible.set(visible, entry);
      } else {
        byVisible.set(visible, preferEntry(byVisible.get(visible), entry, questionText));
      }
    }
    return visibleOrder.map(key => byVisible.get(key));
  }

  function create(runtime) {
    if (!runtime?.quizzes || !runtime?.entries) {
      throw new Error("quiz_help_runtime_v3_invalid");
    }

    const redirects = runtime.id_redirects || {};
    const entryById = id => {
      let current = String(id || "");
      const visited = new Set();
      while (redirects[current] && !visited.has(current)) {
        visited.add(current);
        current = redirects[current];
      }
      return runtime.entries[current] || null;
    };

    function findQuizId(question = {}) {
      const directCandidates = [
        question.canonical_quiz_id,
        question.canonicalQuizId,
        question.quiz_id,
        question.quizId,
        question.id
      ].map(normalizeQuizId).filter(Boolean);
      for (const candidate of directCandidates) {
        if (runtime.quizzes[candidate]) return candidate;
      }
      const fingerprint = hashFingerprint(question);
      const matches = runtime.fingerprint_index?.[fingerprint] || [];
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) {
        const normalizedQuestion = normalizeItalian(question.question || question.q);
        const exact = matches.find(id =>
          normalizeItalian(runtime.quizzes[id]?.question) === normalizedQuestion
        );
        return exact || matches[0];
      }
      return "";
    }

    function resolve(question = {}) {
      const quizId = findQuizId(question);
      if (!quizId) return null;
      const quiz = runtime.quizzes[quizId];
      const questionText = question.question || question.q || quiz.question || "";
      const linked = (quiz.entry_ids || [])
        .map(entryById)
        .filter(isPublishableEntry);

      const phraseMatches = findLongestPhraseMatches(questionText, linked);
      const selectedIds = new Set(phraseMatches.map(match => match.entry.id));
      const blockedTokens = new Set();
      for (const match of phraseMatches) {
        for (const term of match.entry.blocked_internal_terms || []) {
          blockedTokens.add(normalizeItalian(term));
        }
      }

      const words = dedupeSemanticEntries(linked.filter(entry => {
        if (entry.type === "technical_phrase") return selectedIds.has(entry.id);
        const normalized = normalizeItalian(displayForm(questionText, entry));
        if (!String(entry.id || "").startsWith("ai_kw_") && blockedTokens.has(normalized)) return false;
        return String(entry.id || "").startsWith("ai_kw_")
          || !(entry.absorbed_by || []).some(phraseId => selectedIds.has(phraseId));
      }), questionText);

      words.sort((left, right) => {
        const leftPhrase = left.type === "technical_phrase" ? 1 : 0;
        const rightPhrase = right.type === "technical_phrase" ? 1 : 0;
        if (leftPhrase !== rightPhrase) return rightPhrase - leftPhrase;
        const leftPosition = normalizeForMatch(questionText).indexOf(normalizeForMatch(displayForm(questionText, left)));
        const rightPosition = normalizeForMatch(questionText).indexOf(normalizeForMatch(displayForm(questionText, right)));
        return (leftPosition < 0 ? Number.MAX_SAFE_INTEGER : leftPosition)
          - (rightPosition < 0 ? Number.MAX_SAFE_INTEGER : rightPosition);
      });

      return {
        quizId,
        chapter: runtime.chapters?.[quiz.chapter_id] || null,
        topic: runtime.topics?.[quiz.topic_id] || null,
        questionBn: quiz.question_bn_easy || quiz.question_bn || "",
        questionBnEasy: quiz.question_bn_easy || quiz.question_bn || "",
        questionBnStandard: quiz.question_bn_standard || quiz.question_bn || "",
        ttsBn: words.map(entry => entry.tts_bn || [entry.bn, entry.simple_bn].filter(Boolean).join("। ")).join(" "),
        words: words.map(entry => ({
          id: entry.id,
          meaningId: entry.meaning_id,
          italian: displayForm(questionText, entry),
          canonicalItalian: entry.canonical_italian,
          bangla: shortBangla(entry),
          simpleIt: entry.simple_it || "",
          simpleBn: entry.simple_bn || "",
          ttsBn: entry.tts_bn || "",
          translationAuthority: entry.translation_authority || "",
          type: entry.type,
          hasMultipleMeanings: Boolean(entry.has_multiple_meanings),
          confidence: entry.confidence,
          status: entry.status
        }))
      };
    }

    return {
      findQuizId,
      resolve,
      entryById
    };
  }

  return {
    create,
    normalizeItalian,
    containsItalianPhrase,
    normalizeQuizId,
    hashFingerprint,
    findLongestPhraseMatches,
    isPublishableEntry,
    shortBangla,
    dedupeSemanticEntries
  };
});
