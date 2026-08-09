(function exposePatenteGlossaryResolver(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PatenteGlossaryResolver = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createGlossaryResolverApi() {
  "use strict";

  const CONFIG = Object.freeze({
    version: "1.0.0",
    phrase_only: Object.freeze([
      Object.freeze({ key: "velocita massima", forms: ["velocità massima"], bn: "সর্বোচ্চ গতিসীমা" }),
      Object.freeze({ key: "senso unico", forms: ["senso unico"] }),
      Object.freeze({ key: "diritto di precedenza", forms: ["diritto di precedenza"] }),
      Object.freeze({ key: "dare precedenza", forms: ["dare precedenza", "dare la precedenza", "dà precedenza"] }),
      Object.freeze({ key: "passaggio a livello", forms: ["passaggio a livello"] }),
      Object.freeze({ key: "corsia di emergenza", forms: ["corsia di emergenza"] }),
      Object.freeze({ key: "condotte a mano", forms: ["condotte a mano"] }),
      Object.freeze({ key: "massa a pieno carico", forms: ["massa a pieno carico"] })
    ]),
    words_only: Object.freeze([
      Object.freeze({
        key: "strada extraurbana principale",
        forms: ["strada extraurbana principale", "strade extraurbane principali"],
        components: Object.freeze([
          Object.freeze({ lemma: "strada" }),
          Object.freeze({ lemma: "extraurbano" }),
          Object.freeze({ lemma: "principale" })
        ])
      })
    ]),
    units: Object.freeze([
      Object.freeze({ key: "km/h", pattern: "(?<![\\p{L}\\p{N}])(\\d+(?:[.,]\\d+)?)\\s*km\\s*\\/\\s*h(?![\\p{L}\\p{N}])", label_bn: "km_per_hour" }),
      Object.freeze({ key: "kg", pattern: "(?<![\\p{L}\\p{N}])(\\d+(?:[.,]\\d+)?)\\s*kg(?![\\p{L}\\p{N}])", label_bn: "kilogram" }),
      Object.freeze({ key: "km", pattern: "(?<![\\p{L}\\p{N}])(\\d+(?:[.,]\\d+)?)\\s*km(?![\\p{L}\\p{N}])", label_bn: "kilometer" }),
      Object.freeze({ key: "cm", pattern: "(?<![\\p{L}\\p{N}])(\\d+(?:[.,]\\d+)?)\\s*cm(?![\\p{L}\\p{N}])", label_bn: "centimeter" }),
      Object.freeze({ key: "mm", pattern: "(?<![\\p{L}\\p{N}])(\\d+(?:[.,]\\d+)?)\\s*mm(?![\\p{L}\\p{N}])", label_bn: "millimeter" }),
      Object.freeze({ key: "m", pattern: "(?<![\\p{L}\\p{N}])(\\d+(?:[.,]\\d+)?)\\s*m(?![\\p{L}\\p{N}])", label_bn: "meter" }),
      Object.freeze({ key: "t", pattern: "(?<![\\p{L}\\p{N}])(\\d+(?:[.,]\\d+)?)\\s*t(?![\\p{L}\\p{N}])", label_bn: "ton" }),
      Object.freeze({ key: "%", pattern: "(?<![\\p{L}\\p{N}])(\\d+(?:[.,]\\d+)?)\\s*%(?![\\p{L}\\p{N}])", label_bn: "percent" })
    ]),
    grammar_hidden: Object.freeze([
      "il", "lo", "la", "i", "gli", "le", "un", "uno", "una",
      "di", "a", "ad", "da", "in", "con", "su", "per", "tra", "fra",
      "del", "dello", "della", "dei", "degli", "delle",
      "al", "allo", "alla", "ai", "agli", "alle",
      "dal", "dallo", "dalla", "dai", "dagli", "dalle",
      "nel", "nello", "nella", "nei", "negli", "nelle",
      "sul", "sullo", "sulla", "sui", "sugli", "sulle",
      "e", "ed", "o", "od", "oppure", "ma", "ne", "che", "se",
      "si", "essere", "sono", "sei", "siamo", "siete", "era", "erano", "sara", "saranno", "sia", "siano"
    ]),
    grammar_hidden_lemmas: Object.freeze(["essere"]),
    grammar_keep: Object.freeze([
      "non", "solo", "anche", "sempre", "mai", "puo", "deve", "vieta", "consente", "senza"
    ])
  });

  function normalizeItalian(value = "") {
    return String(value)
      .normalize("NFC")
      .toLocaleLowerCase("it-IT")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[\u2018\u2019`\u00b4]/gu, "'")
      .replace(/[^\p{L}\p{N}%']+/gu, " ")
      .trim()
      .replace(/\s+/gu, " ");
  }

  function italianTokenStem(value = "") {
    const token = normalizeItalian(value).replace(/'/gu, " ").trim();
    if (token.length <= 3) return token;
    if (/[cg]i[ae]$/u.test(token)) return token.slice(0, -2);
    let stem = token.replace(/[aeio]$/u, "");
    if (/[ei]$/u.test(token) && /[cg]h$/u.test(stem)) stem = stem.slice(0, -1);
    return stem;
  }

  function tokenizeItalian(value = "") {
    const text = String(value || "");
    const tokens = [];
    for (const match of text.matchAll(/[\p{L}\p{N}]+|%/gu)) {
      tokens.push({
        raw: match[0],
        normalized: normalizeItalian(match[0]),
        start: match.index,
        end: match.index + match[0].length
      });
    }
    return tokens;
  }

  function tokenMatches(source, expected, allowInflection = true) {
    if (source === expected) return true;
    if (!allowInflection || source.length <= 3 || expected.length <= 3) return false;
    return italianTokenStem(source) === italianTokenStem(expected);
  }

  function findSequence(tokens, form, fromToken = 0, allowInflection = true) {
    const expected = tokenizeItalian(form).map(token => token.normalized).filter(Boolean);
    if (!expected.length || expected.length > tokens.length) return null;
    let inflectedFallback = null;
    for (let startToken = fromToken; startToken <= tokens.length - expected.length; startToken += 1) {
      let inflectionCount = 0;
      const matches = expected.every((token, offset) => {
        const source = tokens[startToken + offset].normalized;
        if (source === token) return true;
        if (!tokenMatches(source, token, allowInflection)) return false;
        inflectionCount += 1;
        return true;
      });
      if (!matches) continue;
      const endToken = startToken + expected.length;
      const result = {
        startToken,
        endToken,
        start: tokens[startToken].start,
        end: tokens[endToken - 1].end,
        tokenCount: expected.length,
        inflectionCount
      };
      if (inflectionCount === 0) return result;
      inflectedFallback ||= result;
    }
    return inflectedFallback;
  }

  function findAllSequences(tokens, forms, allowInflection = true) {
    const matches = [];
    for (const form of forms || []) {
      let fromToken = 0;
      while (fromToken < tokens.length) {
        const match = findSequence(tokens, form, fromToken, allowInflection);
        if (!match) break;
        matches.push({ ...match, form });
        fromToken = Math.max(match.endToken, fromToken + 1);
      }
    }
    const unique = new Map();
    for (const match of matches) {
      const key = `${match.start}:${match.end}`;
      const current = unique.get(key);
      if (!current || match.tokenCount > current.tokenCount) unique.set(key, match);
    }
    return [...unique.values()].sort((left, right) => left.start - right.start || right.end - left.end);
  }

  function entryForms(entry) {
    const canonicalTokenCount = tokenizeItalian(entry?.canonical_italian).length;
    return [
      entry?.canonical_italian,
      ...(entry?.aliases_it || []),
      ...(entry?.forms || []).map(form => typeof form === "string" ? form : form?.text),
      entry?.lemma
    ]
      .filter(Boolean)
      .filter(form => entry?.type !== "technical_phrase" || canonicalTokenCount <= 1 || tokenizeItalian(form).length > 1)
      .filter((form, index, values) => values.findIndex(candidate => normalizeItalian(candidate) === normalizeItalian(form)) === index)
      .sort((left, right) => tokenizeItalian(right).length - tokenizeItalian(left).length || right.length - left.length);
  }

  function findEntryMatch(questionText, tokens, entry) {
    let best = null;
    for (const form of entryForms(entry)) {
      const match = findSequence(tokens, form, 0, true);
      if (!match) continue;
      if (
        !best
        || match.inflectionCount < best.inflectionCount
        || (match.inflectionCount === best.inflectionCount && match.start < best.start)
        || (match.inflectionCount === best.inflectionCount && match.start === best.start && match.tokenCount > best.tokenCount)
      ) {
        best = { ...match, form, surface: questionText.slice(match.start, match.end) };
      }
    }
    return best;
  }

  function isPublishableEntry(entry) {
    return Boolean(
      entry
      && ["approved", "high"].includes(entry.status)
      && ["approved", "high"].includes(entry.confidence)
      && entry.bn
    );
  }

  function createIndex(entries = {}) {
    const list = (Array.isArray(entries) ? entries : Object.values(entries || {})).filter(isPublishableEntry);
    const byForm = new Map();
    const byLemma = new Map();
    const add = (map, key, entry) => {
      const normalized = normalizeItalian(key);
      if (!normalized) return;
      if (!map.has(normalized)) map.set(normalized, []);
      map.get(normalized).push(entry);
    };
    for (const entry of list) {
      entryForms(entry).forEach(form => add(byForm, form, entry));
      add(byLemma, entry.lemma || entry.canonical_italian, entry);
    }
    return { entries: list, byForm, byLemma };
  }

  function entryPreference(entry, surface = "", lemma = "") {
    const visible = normalizeItalian(surface);
    const canonical = normalizeItalian(entry?.canonical_italian);
    const entryLemma = normalizeItalian(entry?.lemma || entry?.canonical_italian);
    return (entry?.translation_authority === "package_v2" ? 128 : 0)
      + (canonical === visible ? 64 : 0)
      + (entryLemma === normalizeItalian(lemma) ? 32 : 0)
      + (entry?.type === "word" ? 8 : 0)
      + (String(entry?.id || "").startsWith("ai_kw_") ? 4 : 0)
      + (entry?.status === "approved" ? 2 : 0)
      + (entry?.confidence === "approved" ? 1 : 0);
  }

  function findBestIndexedEntry(index, { surface = "", lemma = "", type = "" } = {}) {
    const candidates = new Map();
    const collect = values => (values || []).forEach(entry => candidates.set(entry.id, entry));
    collect(index?.byForm?.get(normalizeItalian(surface)));
    collect(index?.byLemma?.get(normalizeItalian(lemma)));
    if (!candidates.size && tokenizeItalian(surface).length === 1) {
      const surfaceStem = italianTokenStem(surface);
      for (const entry of index?.entries || []) {
        if (italianTokenStem(entry.lemma || entry.canonical_italian) === surfaceStem) candidates.set(entry.id, entry);
      }
    }
    return [...candidates.values()]
      .filter(entry => !type || entry.type === type)
      .sort((left, right) =>
        entryPreference(right, surface, lemma) - entryPreference(left, surface, lemma)
        || String(left.id).localeCompare(String(right.id))
      )[0] || null;
  }

  function overlaps(left, right) {
    return left.start < right.end && left.end > right.start;
  }

  function toBanglaNumber(value = "") {
    const digits = "০১২৩৪৫৬৭৮৯";
    return String(value).replace(/\d/gu, digit => digits[Number(digit)]);
  }

  function unitBangla(label, number) {
    const value = toBanglaNumber(number);
    const labels = {
      km_per_hour: `ঘণ্টায় ${value} কিলোমিটার`,
      kilogram: `${value} কিলোগ্রাম`,
      kilometer: `${value} কিলোমিটার`,
      centimeter: `${value} সেন্টিমিটার`,
      millimeter: `${value} মিলিমিটার`,
      meter: `${value} মিটার`,
      ton: `${value} টন`,
      percent: `${value} শতাংশ`
    };
    return labels[label] || value;
  }

  function findUnitMatches(questionText, index, linkedEntries = []) {
    const matches = [];
    for (const rule of CONFIG.units) {
      const expression = new RegExp(rule.pattern, "giu");
      for (const match of questionText.matchAll(expression)) {
        const number = match[1];
        const start = match.index;
        const end = start + match[0].length;
        const normalizedUnit = normalizeItalian(rule.key);
        const linkedBase = linkedEntries
          .filter(isPublishableEntry)
          .filter(entry => entryForms(entry).some(form => normalizeItalian(form) === normalizedUnit))
          .sort((left, right) =>
            entryPreference(right, rule.key, rule.key) - entryPreference(left, rule.key, rule.key)
            || String(left.id).localeCompare(String(right.id))
          )[0];
        const base = linkedBase || findBestIndexedEntry(index, { surface: rule.key, lemma: rule.key });
        const id = base?.id || `unit_${normalizeItalian(rule.key).replace(/\s+/gu, "_")}`;
        matches.push({
          ...(base || {}),
          id,
          meaning_id: base?.meaning_id || `${id}.display`,
          canonical_italian: rule.key,
          lemma: normalizeItalian(rule.key),
          type: "unit",
          bn: unitBangla(rule.label_bn, number),
          simple_bn: base?.simple_bn || "",
          simple_it: base?.simple_it || "",
          tts_bn: unitBangla(rule.label_bn, number),
          status: base?.status || "high",
          confidence: base?.confidence || "high",
          display_italian: questionText.slice(start, end).replace(/\s+/gu, " ").trim(),
          display_start: start,
          display_end: end,
          glossary_mode: "unit",
          canonical_key: rule.key,
          learning_key: base?.id || rule.key
        });
      }
    }
    return matches
      .sort((left, right) => left.display_start - right.display_start || right.display_end - left.display_end)
      .filter((entry, indexInList, values) => !values.slice(0, indexInList).some(selected =>
        overlaps(
          { start: entry.display_start, end: entry.display_end },
          { start: selected.display_start, end: selected.display_end }
        )
      ));
  }

  function ruleMatches(questionText, tokens, rule) {
    return findAllSequences(tokens, rule.forms, true).map(match => ({
      ...match,
      surface: questionText.slice(match.start, match.end),
      rule
    }));
  }

  function phraseEntryForRule(index, rule, surface) {
    const direct = findBestIndexedEntry(index, { surface, lemma: rule.key, type: "technical_phrase" });
    if (direct) return direct;
    return findBestIndexedEntry(index, { surface: rule.forms[0], lemma: rule.key, type: "technical_phrase" });
  }

  function cloneForDisplay(entry, match, mode, overrides = {}) {
    return {
      ...entry,
      ...overrides,
      display_italian: overrides.display_italian || match.surface,
      display_start: match.start,
      display_end: match.end,
      glossary_mode: mode,
      canonical_key: overrides.canonical_key || normalizeItalian(entry.canonical_italian),
      learning_key: overrides.learning_key || entry.id
    };
  }

  function isGrammarHidden(entry, match) {
    const visible = normalizeItalian(match?.surface || entry?.canonical_italian);
    const lemma = normalizeItalian(entry?.lemma || entry?.canonical_italian);
    const keep = new Set(CONFIG.grammar_keep);
    if (keep.has(visible) || keep.has(lemma)) return false;
    return new Set(CONFIG.grammar_hidden).has(visible)
      || new Set(CONFIG.grammar_hidden_lemmas).has(lemma);
  }

  function resolveVisibleEntries({ questionText = "", linkedEntries = [], allEntries = {}, index = null } = {}) {
    const source = String(questionText || "");
    const tokens = tokenizeItalian(source);
    const glossaryIndex = index || createIndex(allEntries);
    const linked = (linkedEntries || []).filter(isPublishableEntry);
    const linkedMatches = linked.map(entry => ({ entry, match: findEntryMatch(source, tokens, entry) }));
    const grammarHidden = linkedMatches.filter(({ entry, match }) =>
      entry.type !== "technical_phrase" && match && isGrammarHidden(entry, match)
    );
    const candidates = linkedMatches.filter(item => item.match && !grammarHidden.includes(item));
    const output = [];
    const occupied = [];
    const representedIds = new Set();
    const duplicateRemovedIds = new Set();
    const ambiguousPhrases = new Set();
    const phraseOnlyKeys = new Set();
    const wordsOnlyKeys = new Set();

    const units = findUnitMatches(source, glossaryIndex, linked);
    for (const unit of units) {
      output.push(unit);
      occupied.push({ start: unit.display_start, end: unit.display_end, mode: "unit", id: unit.id });
      representedIds.add(unit.id);
    }

    const wordsOnlyMatches = CONFIG.words_only
      .flatMap(rule => ruleMatches(source, tokens, rule))
      .sort((left, right) => left.start - right.start || right.end - left.end)
      .filter((match, matchIndex, values) =>
        !occupied.some(range => overlaps(match, range))
        && !values.slice(0, matchIndex).some(selected => overlaps(match, selected))
      );

    for (const match of wordsOnlyMatches) {
      occupied.push({ start: match.start, end: match.end, mode: "words_only", key: match.rule.key });
      wordsOnlyKeys.add(match.rule.key);
      const coveredTokens = tokens.slice(match.startToken, match.endToken);
      match.rule.components.forEach((component, componentIndex) => {
        const token = coveredTokens[componentIndex];
        if (!token) return;
        const entry = findBestIndexedEntry(glossaryIndex, {
          surface: token.raw,
          lemma: component.lemma,
          type: "word"
        });
        if (!entry) return;
        const componentMatch = {
          start: token.start,
          end: token.end,
          surface: token.raw
        };
        output.push(cloneForDisplay(entry, componentMatch, "words_only", {
          canonical_key: normalizeItalian(component.lemma),
          learning_key: entry.id
        }));
        representedIds.add(entry.id);
      });
    }

    const explicitPhraseCandidates = CONFIG.phrase_only.flatMap(rule =>
      ruleMatches(source, tokens, rule).map(match => {
        const entry = phraseEntryForRule(glossaryIndex, rule, match.surface);
        return entry ? { entry, match, rule, explicit: true, linked: false } : null;
      }).filter(Boolean)
    );
    const linkedPhraseCandidates = candidates
      .filter(({ entry, match }) => entry.type === "technical_phrase" || match.tokenCount > 1)
      .map(({ entry, match }) => {
        const rule = CONFIG.phrase_only.find(candidate =>
          normalizeItalian(candidate.key) === normalizeItalian(entry.canonical_italian)
          || candidate.forms.some(form => normalizeItalian(form) === normalizeItalian(match.surface))
        );
        return { entry, match, rule: rule || null, explicit: Boolean(rule), linked: true };
      });
    const phraseCandidateMap = new Map();
    for (const candidate of [...explicitPhraseCandidates, ...linkedPhraseCandidates]) {
      const key = `${candidate.entry.id}:${candidate.match.start}:${candidate.match.end}`;
      const current = phraseCandidateMap.get(key);
      if (!current || candidate.explicit) phraseCandidateMap.set(key, candidate);
    }
    const phraseCandidates = [...phraseCandidateMap.values()].sort((left, right) =>
      right.match.tokenCount - left.match.tokenCount
      || (right.match.end - right.match.start) - (left.match.end - left.match.start)
      || Number(right.explicit) - Number(left.explicit)
      || Number(right.linked) - Number(left.linked)
      || Number(right.entry.translation_authority === "package_v2") - Number(left.entry.translation_authority === "package_v2")
      || left.match.start - right.match.start
      || String(left.entry.id).localeCompare(String(right.entry.id))
    );

    for (const candidate of phraseCandidates) {
      if (occupied.some(range => overlaps(candidate.match, range))) {
        if (!representedIds.has(candidate.entry.id)) duplicateRemovedIds.add(candidate.entry.id);
        continue;
      }
      const mode = "phrase_only";
      const overrides = candidate.rule?.bn ? { bn: candidate.rule.bn, tts_bn: candidate.rule.bn } : {};
      const displayed = cloneForDisplay(candidate.entry, candidate.match, mode, overrides);
      output.push(displayed);
      occupied.push({
        start: candidate.match.start,
        end: candidate.match.end,
        mode,
        id: candidate.entry.id
      });
      representedIds.add(candidate.entry.id);
      phraseOnlyKeys.add(candidate.rule?.key || normalizeItalian(candidate.entry.canonical_italian));
      if (!candidate.explicit) ambiguousPhrases.add(candidate.entry.canonical_italian);
    }

    for (const { entry, match } of candidates) {
      if (entry.type === "technical_phrase" || match.tokenCount > 1 || representedIds.has(entry.id)) continue;
      const coveringRange = occupied.find(range => overlaps(match, range));
      if (coveringRange) {
        duplicateRemovedIds.add(entry.id);
        continue;
      }
      output.push(cloneForDisplay(entry, match, "word"));
      representedIds.add(entry.id);
    }

    const finalEntries = [];
    const byTeachingKey = new Map();
    const byVisibleKey = new Map();
    const teachingKey = entry => {
      if (entry.glossary_mode === "unit") return `unit:${entry.canonical_key}:${normalizeItalian(entry.display_italian)}`;
      if (entry.glossary_mode === "phrase_only" || entry.type === "technical_phrase") {
        return `phrase:${normalizeItalian(entry.canonical_italian)}`;
      }
      return `word:${normalizeItalian(entry.lemma || entry.canonical_italian)}`;
    };
    for (const entry of output.sort((left, right) =>
      left.display_start - right.display_start
      || (right.display_end - right.display_start) - (left.display_end - left.display_start)
      || String(left.id).localeCompare(String(right.id))
    )) {
      const key = teachingKey(entry);
      const visibleKey = normalizeItalian(entry.display_italian);
      const existing = byTeachingKey.get(key) || byVisibleKey.get(visibleKey);
      if (existing) {
        if (existing.id !== entry.id) duplicateRemovedIds.add(entry.id);
        continue;
      }
      byTeachingKey.set(key, entry);
      byVisibleKey.set(visibleKey, entry);
      finalEntries.push(entry);
    }

    const finalIds = new Set(finalEntries.map(entry => entry.id));
    const finalCanonical = new Set(finalEntries.map(entry => normalizeItalian(entry.canonical_italian)));
    const hiddenCanonicalKeys = new Set();
    for (const { entry } of linkedMatches) {
      const canonical = normalizeItalian(entry.canonical_italian);
      if (!finalIds.has(entry.id) && !finalCanonical.has(canonical)) hiddenCanonicalKeys.add(canonical);
    }

    return {
      entries: finalEntries,
      audit: {
        config_version: CONFIG.version,
        duplicate_count: duplicateRemovedIds.size,
        duplicate_entry_ids: [...duplicateRemovedIds].sort(),
        phrase_only_count: finalEntries.filter(entry => entry.glossary_mode === "phrase_only").length,
        phrase_only_keys: [...phraseOnlyKeys].sort(),
        words_only_count: wordsOnlyMatches.length,
        words_only_keys: [...wordsOnlyKeys].sort(),
        unit_count: units.length,
        grammar_hidden_count: grammarHidden.length,
        grammar_hidden_entry_ids: grammarHidden.map(item => item.entry.id).sort(),
        hidden_canonical_keys: [...hiddenCanonicalKeys].sort(),
        ambiguous_phrases: [...ambiguousPhrases].sort((left, right) => left.localeCompare(right, "it"))
      }
    };
  }

  return {
    CONFIG,
    createIndex,
    findUnitMatches,
    isGrammarHidden,
    normalizeItalian,
    resolveVisibleEntries,
    tokenizeItalian,
    toBanglaNumber
  };
});
