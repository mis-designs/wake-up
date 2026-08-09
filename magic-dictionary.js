(function exposeMagicDictionary(root, factory) {
  "use strict";

  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MagicDictionaryFeature = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMagicDictionary(root) {
  "use strict";

  const VERSION = "1.0.0";
  const MANIFEST_URL = "https://www.tmmbooks.eu/dist/patente/quiz-help-runtime-manifest.json";
  const FALLBACK_URL = "/data/patente/quiz-help-runtime-v2.json";
  const STORAGE_PREFIX = "magicbook.wordLearning.v1";
  const GATE_INTERVAL_MS = 12 * 60 * 60 * 1000;
  const REQUIRED_CORRECT = 5;
  const CATALOG_LIMIT = 800;
  const PAGE_SIZE = 60;
  const BASE_ENTRY_PATTERN = /^(?:w|gw)_/u;
  const AI_ENTRY_PATTERN = /^ai_kw_/u;
  const BENGALI_PATTERN = /[\u0980-\u09ff]/u;
  const FUNCTION_WORDS = new Set([
    "a", "ad", "al", "allo", "alla", "ai", "agli", "alle",
    "da", "dal", "dallo", "dalla", "dai", "dagli", "dalle",
    "di", "del", "dello", "della", "dei", "degli", "delle",
    "in", "nel", "nello", "nella", "nei", "negli", "nelle",
    "con", "su", "sul", "sullo", "sulla", "sui", "sugli", "sulle",
    "per", "tra", "fra", "e", "ed", "o", "od", "oppure", "ma", "che",
    "il", "lo", "la", "i", "gli", "le", "un", "uno", "una",
    "chi", "cui", "quale", "quali", "questo", "questa", "questi", "queste",
    "quello", "quella", "quelli", "quelle", "esso", "essa", "essi", "esse",
    "essere", "è", "sono", "sia", "si"
  ]);

  let catalogPromise = null;
  let catalog = [];
  let manifestInfo = null;
  let activeQuiz = null;
  let answerLocked = false;
  let dictionaryFilter = "all";
  let dictionaryVisibleCount = PAGE_SIZE;
  let dictionaryReturnScreen = "chapters";
  let inertTargets = [];
  const memoryStorage = new Map();

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

  function normalizeBangla(value = "") {
    return String(value).normalize("NFKC").trim().replace(/[।.]+$/u, "").trim();
  }

  function hashString(value = "") {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function seededRandom(seedText = "") {
    let state = Number.parseInt(hashString(seedText), 36) || 1;
    return () => {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(values, seedText) {
    const list = [...values];
    const random = seededRandom(seedText);
    for (let index = list.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
    }
    return list;
  }

  function readLocal(key) {
    try {
      return root.localStorage?.getItem(key) ?? memoryStorage.get(key) ?? null;
    } catch {
      return memoryStorage.get(key) ?? null;
    }
  }

  function writeLocal(key, value) {
    const serialized = String(value);
    memoryStorage.set(key, serialized);
    try {
      root.localStorage?.setItem(key, serialized);
    } catch {
      // Memory fallback keeps the session usable in private browsing.
    }
  }

  function parseJson(value, fallback = null) {
    try {
      return JSON.parse(String(value || ""));
    } catch {
      return fallback;
    }
  }

  function storedSession() {
    return parseJson(readLocal("user_session"), null)
      || parseJson(readLocal("session"), null)
      || {};
  }

  function currentPhone() {
    const session = storedSession();
    return String(session.phone || readLocal("phone") || "").replace(/\D+/gu, "");
  }

  function isAuthenticated() {
    return Boolean(currentPhone() && (readLocal("loggedIn") === "true" || storedSession().phone));
  }

  function isAdminSession() {
    const session = storedSession();
    return String(session.role || "").toLocaleLowerCase("it-IT") === "admin";
  }

  function isTrialRoute() {
    const path = String(root.location?.pathname || "");
    return path.startsWith("/prova-gratis") || path.includes("prova-gratis");
  }

  function preferenceKey() {
    const identity = currentPhone() || String(root.MAGICBOOK_UID || "anonymous");
    return `${STORAGE_PREFIX}.${hashString(identity)}`;
  }

  function readPreference() {
    const value = parseJson(readLocal(preferenceKey()), {});
    return {
      disabled: value?.disabled === true,
      disabledAt: Number(value?.disabledAt || 0),
      lastCompletedAt: Number(value?.lastCompletedAt || 0),
      history: Array.isArray(value?.history) ? value.history.filter(Boolean).slice(-100) : [],
      active: value?.active && typeof value.active === "object" ? value.active : null
    };
  }

  function writePreference(value) {
    writeLocal(preferenceKey(), JSON.stringify({
      disabled: value?.disabled === true,
      disabledAt: Number(value?.disabledAt || 0),
      lastCompletedAt: Number(value?.lastCompletedAt || 0),
      history: Array.isArray(value?.history) ? value.history.filter(Boolean).slice(-100) : [],
      active: value?.active && typeof value.active === "object" ? value.active : null
    }));
  }

  function isGateDue(now = Date.now()) {
    if (!isAuthenticated() || isAdminSession() || isTrialRoute()) return false;
    const preference = readPreference();
    if (preference.disabled) return false;
    if (preference.active?.wordIds?.length === REQUIRED_CORRECT) return true;
    return !preference.lastCompletedAt || now - preference.lastCompletedAt >= GATE_INTERVAL_MS;
  }

  async function sha256(text) {
    if (!root.crypto?.subtle || typeof TextEncoder === "undefined") return "";
    const bytes = new TextEncoder().encode(text);
    const digest = await root.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  }

  async function fetchJson(url, options = {}) {
    const response = await root.fetch(url, options);
    if (!response.ok) throw new Error(`dictionary_fetch_${response.status}`);
    return response.json();
  }

  async function loadV3Runtime() {
    if (root.QuizHelpRuntimeV3?.load) {
      try {
        const loaded = await root.QuizHelpRuntimeV3.load();
        if (loaded?.runtime && loaded?.manifest) return loaded;
      } catch {
        // The independent loader below keeps the entry gate available on home.
      }
    }

    const source = String(root.QUIZ_HELP_RUNTIME_V3_MANIFEST_URL || MANIFEST_URL);
    const manifestResponse = await root.fetch(source, { cache: "no-cache" });
    if (!manifestResponse.ok) throw new Error(`dictionary_manifest_${manifestResponse.status}`);
    const manifest = await manifestResponse.json();
    if (manifest?.schema_version !== "3.0.0" || Number(manifest?.quiz_count) !== 7139 || !manifest?.sha256) {
      throw new Error("dictionary_manifest_invalid");
    }

    const runtimeUrl = new URL(manifest.url, source).href;
    const runtimeResponse = await root.fetch(runtimeUrl, { cache: "force-cache" });
    if (!runtimeResponse.ok) throw new Error(`dictionary_runtime_${runtimeResponse.status}`);
    const runtimeText = await runtimeResponse.text();
    const digest = await sha256(runtimeText);
    if (digest && digest !== manifest.sha256) throw new Error("dictionary_runtime_hash_mismatch");
    const runtime = JSON.parse(runtimeText);
    if (runtime?.schema_version !== "3.0.0" || Object.keys(runtime?.quizzes || {}).length !== 7139) {
      throw new Error("dictionary_runtime_invalid");
    }
    return { manifest, runtime, runtimeUrl };
  }

  function isFunctionWord(entry) {
    const normalized = normalizeItalian(entry?.canonical_italian || entry?.it || "");
    const lemma = normalizeItalian(entry?.lemma || "");
    if (root.PatenteGlossaryResolver?.isGrammarHidden) {
      try {
        if (root.PatenteGlossaryResolver.isGrammarHidden(entry)) return true;
      } catch {
        // Fall through to the local compatibility list.
      }
    }
    return FUNCTION_WORDS.has(normalized) || FUNCTION_WORDS.has(lemma);
  }

  function usableEntry(entry) {
    const italian = String(entry?.canonical_italian || entry?.it || entry?.forms?.[0] || "").trim();
    const bangla = normalizeBangla(entry?.bn || "");
    return Boolean(
      entry?.id
      && italian.length > 1
      && italian.length <= 80
      && BENGALI_PATTERN.test(bangla)
      && !isFunctionWord(entry)
    );
  }

  function entryKey(entry) {
    return normalizeItalian(entry?.lemma || entry?.canonical_italian || entry?.it || "");
  }

  function toStudyWord(entry, overrides = null, useCount = 0) {
    const source = overrides || entry;
    return {
      id: String(entry.id),
      it: String(entry.canonical_italian || entry.forms?.[0] || entry.lemma || "").trim(),
      bn: normalizeBangla(source.bn || entry.bn),
      simpleBn: String(source.simple_bn || source.tts_bn || entry.simple_bn || entry.tts_bn || source.bn || entry.bn || "").trim(),
      type: entry.type === "technical_phrase" ? "phrase" : "word",
      sourceId: String(source.id || entry.id),
      useCount: Number(useCount || 0)
    };
  }

  function buildV3Catalog(runtime) {
    const entries = Object.values(runtime?.entries || {});
    const usage = new Map();
    Object.values(runtime?.quizzes || {}).forEach(quiz => {
      (quiz?.entry_ids || []).forEach(id => usage.set(id, (usage.get(id) || 0) + 1));
    });

    const authoritativeByKey = new Map();
    entries
      .filter(entry => AI_ENTRY_PATTERN.test(String(entry?.id || "")) && usableEntry(entry))
      .sort((left, right) => (usage.get(right.id) || 0) - (usage.get(left.id) || 0))
      .forEach(entry => {
        const keys = new Set([entryKey(entry), normalizeItalian(entry.canonical_italian)]);
        keys.forEach(key => {
          if (key && !authoritativeByKey.has(key)) authoritativeByKey.set(key, entry);
        });
      });

    const selected = new Map();
    const selectedConceptKeys = new Set();
    entries
      .filter(entry => BASE_ENTRY_PATTERN.test(String(entry?.id || "")) && usableEntry(entry))
      .sort((left, right) => String(left.id).localeCompare(String(right.id), "it"))
      .forEach(entry => {
        const conceptKey = entryKey(entry);
        const displayKey = normalizeItalian(entry.canonical_italian || entry.forms?.[0]);
        if (!conceptKey || !displayKey) return;
        const authoritative = authoritativeByKey.get(conceptKey)
          || authoritativeByKey.get(normalizeItalian(entry.canonical_italian));
        const current = selected.get(displayKey);
        const next = toStudyWord(entry, authoritative, usage.get(authoritative?.id || entry.id));
        if (!current || String(entry.id).startsWith("w_")) selected.set(displayKey, next);
        selectedConceptKeys.add(conceptKey);
      });

    const additions = entries
      .filter(entry => (
        AI_ENTRY_PATTERN.test(String(entry?.id || ""))
        && entry.type === "word"
        && usableEntry(entry)
        && (usage.get(entry.id) || 0) >= 2
      ))
      .sort((left, right) => (
        (usage.get(right.id) || 0) - (usage.get(left.id) || 0)
        || String(left.canonical_italian || "").localeCompare(String(right.canonical_italian || ""), "it")
      ));

    for (const entry of additions) {
      if (selected.size >= CATALOG_LIMIT) break;
      const conceptKey = entryKey(entry);
      const displayKey = normalizeItalian(entry.canonical_italian);
      if (!conceptKey || !displayKey || selectedConceptKeys.has(conceptKey) || selected.has(displayKey)) continue;
      selected.set(displayKey, toStudyWord(entry, null, usage.get(entry.id)));
      selectedConceptKeys.add(conceptKey);
    }

    return [...selected.values()]
      .filter(word => word.it && BENGALI_PATTERN.test(word.bn))
      .sort((left, right) => left.it.localeCompare(right.it, "it", { sensitivity: "base" }));
  }

  function buildV2Catalog(runtime) {
    return Object.entries(runtime?.words || {})
      .map(([id, value]) => ({
        id,
        it: String(value?.[0] || "").trim(),
        bn: normalizeBangla(value?.[1] || ""),
        simpleBn: String(value?.[3] || value?.[5] || value?.[1] || "").trim(),
        type: String(value?.[0] || "").trim().includes(" ") ? "phrase" : "word",
        sourceId: id,
        useCount: 0
      }))
      .filter(word => word.it.length > 1 && BENGALI_PATTERN.test(word.bn) && !FUNCTION_WORDS.has(normalizeItalian(word.it)))
      .sort((left, right) => left.it.localeCompare(right.it, "it", { sensitivity: "base" }));
  }

  async function loadCatalog(options = {}) {
    if (options.force === true) catalogPromise = null;
    if (catalogPromise) return catalogPromise;

    catalogPromise = (async () => {
      try {
        const loaded = await loadV3Runtime();
        const words = buildV3Catalog(loaded.runtime);
        if (words.length < 300) throw new Error("dictionary_catalog_too_small");
        catalog = words;
        manifestInfo = loaded.manifest;
        return catalog;
      } catch (error) {
        console.warn("[magic-dictionary] shared runtime unavailable; using local fallback", error);
        const fallback = await fetchJson(FALLBACK_URL, { cache: "force-cache" });
        catalog = buildV2Catalog(fallback);
        manifestInfo = { sha256: "local-v2", work_progress: null };
        if (catalog.length < REQUIRED_CORRECT * 4) throw new Error("dictionary_fallback_invalid");
        return catalog;
      }
    })();

    try {
      return await catalogPromise;
    } catch (error) {
      catalogPromise = null;
      throw error;
    }
  }

  function findWord(id) {
    return catalog.find(word => word.id === id) || null;
  }

  function chooseGateWords(preference, now = Date.now()) {
    const previous = new Set(preference.history || []);
    const fresh = catalog.filter(word => !previous.has(word.id));
    const pool = fresh.length >= REQUIRED_CORRECT ? fresh : catalog;
    const seed = `${currentPhone()}|${Math.floor(now / GATE_INTERVAL_MS)}|${manifestInfo?.sha256 || VERSION}`;
    return shuffled(pool, seed).slice(0, REQUIRED_CORRECT);
  }

  function createGateSession(preference, now = Date.now()) {
    const selected = chooseGateWords(preference, now);
    return {
      startedAt: now,
      sourceVersion: String(manifestInfo?.sha256 || VERSION),
      wordIds: selected.map(word => word.id),
      currentIndex: 0,
      correctCount: 0
    };
  }

  function ensureElements() {
    if (!root.document || root.document.getElementById("magicWordGate")) return;

    const gate = root.document.createElement("div");
    gate.id = "magicWordGate";
    gate.className = "magic-word-gate hidden";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-labelledby", "magicWordGateTitle");
    gate.innerHTML = `
      <div class="magic-word-gate-card">
        <div class="magic-word-gate-progress" aria-hidden="true"><span id="magicWordGateMeter"></span></div>
        <div id="magicWordGateContent" class="magic-word-gate-content" aria-live="polite"></div>
      </div>`;

    const dictionary = root.document.createElement("section");
    dictionary.id = "magicDictionaryScreen";
    dictionary.className = "magic-dictionary-screen hidden";
    dictionary.setAttribute("aria-labelledby", "magicDictionaryTitle");
    dictionary.innerHTML = `
      <header class="magic-dictionary-header">
        <button id="magicDictionaryBack" class="magic-dictionary-back" type="button" aria-label="Indietro">
          <img src="icons/go-back.png" alt="">
        </button>
        <div><small>ITALIANO · বাংলা</small><h1 id="magicDictionaryTitle">Dizionario</h1></div>
        <button id="magicDictionaryPractice" class="magic-dictionary-practice" type="button">Allenati · 5</button>
      </header>
      <main class="magic-dictionary-main">
        <section class="magic-dictionary-hero">
          <div><span>PAROLE DELLA PATENTE</span><h2>Impara poco, ricorda a lungo.</h2><p>Le stesse traduzioni verificate usate nei quiz, sempre sincronizzate.</p></div>
          <strong id="magicDictionaryTotal">—</strong>
        </section>
        <section class="magic-dictionary-tools" aria-label="Cerca e filtra">
          <label><span class="sr-only">Cerca nel dizionario</span><input id="magicDictionarySearch" type="search" placeholder="Cerca in italiano o Bangla…" autocomplete="off"></label>
          <div id="magicDictionaryFilters" class="magic-dictionary-filters" role="group" aria-label="Tipo di voce">
            <button class="is-active" type="button" data-filter="all">Tutte</button>
            <button type="button" data-filter="word">Parole</button>
            <button type="button" data-filter="phrase">Locuzioni</button>
          </div>
        </section>
        <p id="magicDictionaryStatus" class="magic-dictionary-status" role="status">Caricamento del dizionario…</p>
        <div id="magicDictionaryList" class="magic-dictionary-list"></div>
        <button id="magicDictionaryMore" class="magic-dictionary-more hidden" type="button">Mostra altre parole</button>
        <section class="magic-dictionary-settings">
          <div><strong>Ripasso ogni 12 ore</strong><p id="magicDictionaryGateStatus">Attivo</p></div>
          <button id="magicDictionaryEnableGate" class="hidden" type="button">Riattiva</button>
        </section>
      </main>`;

    root.document.body.append(dictionary, gate);
    bindEvents();
  }

  function setGateOpen(open) {
    const gate = root.document?.getElementById("magicWordGate");
    if (!gate) return;
    const wasOpen = !gate.classList.contains("hidden");
    gate.classList.toggle("hidden", !open);
    root.document.body?.classList.toggle("magic-word-gate-open", open);

    if (open && !wasOpen) {
      inertTargets = [...root.document.body.children].filter(element => element !== gate && !element.inert);
      inertTargets.forEach(element => { element.inert = true; });
    } else if (!open && wasOpen) {
      inertTargets.forEach(element => { element.inert = false; });
      inertTargets = [];
    }
  }

  function gateContent() {
    return root.document?.getElementById("magicWordGateContent");
  }

  function renderGateLoading() {
    const content = gateContent();
    if (!content) return;
    root.document.getElementById("magicWordGateMeter").style.width = "0%";
    content.innerHTML = `
      <span class="magic-word-kicker">IL TUO RIPASSO</span>
      <div class="magic-word-loader" aria-hidden="true"><i></i><i></i><i></i></div>
      <h2 id="magicWordGateTitle">Preparo le tue 5 parole…</h2>
      <p>Un piccolo allenamento prima di iniziare.</p>`;
  }

  function renderGateError() {
    const content = gateContent();
    if (!content) return;
    content.innerHTML = `
      <span class="magic-word-kicker">CONNESSIONE</span>
      <div class="magic-word-symbol">↻</div>
      <h2 id="magicWordGateTitle">Non riesco a caricare le parole</h2>
      <p>Controlla la connessione e riprova. Il tuo progresso non viene perso.</p>
      <button id="magicWordGateRetry" class="magic-word-primary" type="button">Riprova</button>`;
    root.document.getElementById("magicWordGateRetry")?.addEventListener("click", () => onAuthenticated({ forceReload: true }));
  }

  function distractorsFor(word, session) {
    const distinct = catalog.filter(candidate => candidate.id !== word.id && candidate.bn !== word.bn);
    return shuffled(distinct, `${session.sourceVersion}|${word.id}|options`).slice(0, 3);
  }

  function renderGateQuestion() {
    const content = gateContent();
    if (!content || !activeQuiz) return;
    const wordId = activeQuiz.wordIds[activeQuiz.currentIndex];
    const word = findWord(wordId);
    if (!word) {
      activeQuiz = null;
      void onAuthenticated({ forceNew: true });
      return;
    }

    answerLocked = false;
    const completed = Number(activeQuiz.correctCount || 0);
    const options = shuffled([word, ...distractorsFor(word, activeQuiz)], `${activeQuiz.sourceVersion}|${word.id}|order`);
    const meter = root.document.getElementById("magicWordGateMeter");
    if (meter) meter.style.width = `${(completed / REQUIRED_CORRECT) * 100}%`;

    content.innerHTML = `
      <div class="magic-word-topline"><span class="magic-word-kicker">5 PAROLE OGNI 12 ORE</span><strong>${completed + 1} / ${REQUIRED_CORRECT}</strong></div>
      <p class="magic-word-question-label">Qual è il significato corretto?</p>
      <h2 id="magicWordGateTitle" class="magic-word-prompt" lang="it">${escapeHtml(word.it)}</h2>
      <div class="magic-word-options" role="group" aria-label="Scegli il significato">
        ${options.map(option => `<button type="button" data-word-id="${escapeHtml(option.id)}" lang="bn"><span>${escapeHtml(option.bn)}</span></button>`).join("")}
      </div>
      <p id="magicWordFeedback" class="magic-word-feedback" role="status"></p>
      ${activeQuiz.manual
        ? '<button id="magicWordManualClose" class="magic-word-optout" type="button">Chiudi allenamento</button>'
        : '<button id="magicWordOptOut" class="magic-word-optout" type="button">Non voglio imparare</button>'}`;

    content.querySelectorAll("[data-word-id]").forEach(button => {
      button.addEventListener("click", () => answerGateQuestion(button, button.dataset.wordId, word.id));
    });
    root.document.getElementById("magicWordOptOut")?.addEventListener("click", renderOptOutConfirmation);
    root.document.getElementById("magicWordManualClose")?.addEventListener("click", closeManualPractice);
    content.querySelector("[data-word-id]")?.focus();
  }

  function closeManualPractice() {
    const preference = readPreference();
    if (preference.active?.manual === true) {
      preference.active = null;
      writePreference(preference);
    }
    activeQuiz = null;
    setGateOpen(false);
  }

  function answerGateQuestion(button, selectedId, correctId) {
    if (answerLocked || !activeQuiz) return;
    const feedback = root.document.getElementById("magicWordFeedback");
    if (selectedId !== correctId) {
      button.classList.add("is-wrong");
      button.disabled = true;
      if (feedback) feedback.textContent = "Non ancora. Riprova: puoi farcela.";
      return;
    }

    answerLocked = true;
    button.classList.add("is-correct");
    root.document.querySelectorAll(".magic-word-options button").forEach(option => { option.disabled = true; });
    if (feedback) feedback.textContent = "Corretto!";
    activeQuiz.correctCount = Number(activeQuiz.correctCount || 0) + 1;
    activeQuiz.currentIndex = Number(activeQuiz.currentIndex || 0) + 1;

    const preference = readPreference();
    preference.active = activeQuiz;
    writePreference(preference);

    root.setTimeout(() => {
      if (activeQuiz.correctCount >= REQUIRED_CORRECT) finishGateSession();
      else renderGateQuestion();
    }, 650);
  }

  function finishGateSession() {
    const preference = readPreference();
    const completedIds = [...(activeQuiz?.wordIds || [])];
    preference.lastCompletedAt = Date.now();
    preference.history = [...preference.history, ...completedIds].slice(-100);
    preference.active = null;
    writePreference(preference);
    activeQuiz = null;

    const meter = root.document.getElementById("magicWordGateMeter");
    if (meter) meter.style.width = "100%";
    const content = gateContent();
    if (!content) return;
    content.innerHTML = `
      <span class="magic-word-kicker">COMPLETATO</span>
      <div class="magic-word-symbol is-success">✓</div>
      <h2 id="magicWordGateTitle">5 parole imparate</h2>
      <p>Ottimo lavoro. Ora puoi usare tutti i servizi di Magic Book.</p>
      <button id="magicWordGateEnter" class="magic-word-primary" type="button">Entra in Magic Book</button>`;
    root.document.getElementById("magicWordGateEnter")?.addEventListener("click", () => setGateOpen(false));
    root.document.getElementById("magicWordGateEnter")?.focus();
  }

  function renderOptOutConfirmation() {
    const content = gateContent();
    if (!content) return;
    content.innerHTML = `
      <span class="magic-word-kicker">PRIMA DI DISATTIVARE</span>
      <div class="magic-word-symbol">?</div>
      <h2 id="magicWordGateTitle">Sei sicuro?</h2>
      <p>Questo metodo ti aiuta a imparare con costanza almeno cinque parole ogni giorno. Se lo disattivi, il ripasso non apparirà più quando entri.</p>
      <div class="magic-word-confirm-actions">
        <button id="magicWordKeepLearning" class="magic-word-primary" type="button">No, continuo a imparare</button>
        <button id="magicWordDisable" class="magic-word-danger" type="button">Sì, disattiva</button>
      </div>`;
    root.document.getElementById("magicWordKeepLearning")?.addEventListener("click", renderGateQuestion);
    root.document.getElementById("magicWordDisable")?.addEventListener("click", disableGate);
    root.document.getElementById("magicWordKeepLearning")?.focus();
  }

  function disableGate() {
    const preference = readPreference();
    preference.disabled = true;
    preference.disabledAt = Date.now();
    preference.active = null;
    writePreference(preference);
    activeQuiz = null;
    updateGateSetting();
    setGateOpen(false);
  }

  function enableGate() {
    const preference = readPreference();
    preference.disabled = false;
    preference.disabledAt = 0;
    preference.lastCompletedAt = 0;
    preference.active = null;
    writePreference(preference);
    updateGateSetting();
  }

  async function onAuthenticated(options = {}) {
    ensureElements();
    if (!isGateDue() && options.forceNew !== true) {
      updateGateSetting();
      return false;
    }

    setGateOpen(true);
    renderGateLoading();
    try {
      await loadCatalog({ force: options.forceReload === true });
      const preference = readPreference();
      const resumable = preference.active
        && Array.isArray(preference.active.wordIds)
        && preference.active.wordIds.length === REQUIRED_CORRECT
        && preference.active.wordIds.every(id => findWord(id));
      activeQuiz = resumable && options.forceNew !== true
        ? preference.active
        : createGateSession(preference);
      preference.active = activeQuiz;
      writePreference(preference);
      renderGateQuestion();
      return true;
    } catch (error) {
      console.error("[magic-dictionary] gate unavailable", error);
      renderGateError();
      return false;
    }
  }

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/gu, "&amp;")
      .replace(/</gu, "&lt;")
      .replace(/>/gu, "&gt;")
      .replace(/"/gu, "&quot;")
      .replace(/'/gu, "&#39;");
  }

  function filteredDictionaryWords() {
    const input = root.document?.getElementById("magicDictionarySearch");
    const query = String(input?.value || "").normalize("NFKC").trim().toLocaleLowerCase("it-IT");
    return catalog.filter(word => {
      if (dictionaryFilter !== "all" && word.type !== dictionaryFilter) return false;
      if (!query) return true;
      return `${word.it} ${word.bn} ${word.simpleBn}`.normalize("NFKC").toLocaleLowerCase("it-IT").includes(query);
    });
  }

  function renderDictionary() {
    const list = root.document?.getElementById("magicDictionaryList");
    const status = root.document?.getElementById("magicDictionaryStatus");
    const more = root.document?.getElementById("magicDictionaryMore");
    const total = root.document?.getElementById("magicDictionaryTotal");
    if (!list || !status || !more || !total) return;

    const filtered = filteredDictionaryWords();
    const visible = filtered.slice(0, dictionaryVisibleCount);
    total.textContent = String(catalog.length);
    total.setAttribute("aria-label", `${catalog.length} voci sincronizzate`);
    status.textContent = filtered.length === catalog.length
      ? `${catalog.length} parole e locuzioni sincronizzate`
      : `${filtered.length} risultati`;

    if (!visible.length) {
      list.innerHTML = `<p class="magic-dictionary-empty">Nessuna parola trovata.</p>`;
    } else {
      list.innerHTML = visible.map(word => `
        <article class="magic-dictionary-word">
          <div><small>${word.type === "phrase" ? "LOCUZIONE" : "PAROLA"}</small><h3>${escapeHtml(word.it)}</h3></div>
          <div lang="bn"><strong>${escapeHtml(word.bn)}</strong><p>${escapeHtml(word.simpleBn)}</p></div>
        </article>`).join("");
    }
    more.classList.toggle("hidden", visible.length >= filtered.length);
    updateGateSetting();
  }

  function updateGateSetting() {
    const preference = readPreference();
    const label = root.document?.getElementById("magicDictionaryGateStatus");
    const enable = root.document?.getElementById("magicDictionaryEnableGate");
    if (label) label.textContent = preference.disabled
      ? "Disattivato su questo dispositivo"
      : "Attivo · 5 parole prima dell’accesso";
    enable?.classList.toggle("hidden", !preference.disabled);
  }

  async function showDictionary(options = {}) {
    ensureElements();
    dictionaryReturnScreen = options.returnScreen === "home" ? "home" : "chapters";
    const screen = root.document?.getElementById("magicDictionaryScreen");
    screen?.classList.remove("hidden");
    const status = root.document?.getElementById("magicDictionaryStatus");
    if (status) status.textContent = "Caricamento del dizionario…";
    try {
      await loadCatalog();
      dictionaryVisibleCount = PAGE_SIZE;
      renderDictionary();
    } catch (error) {
      if (status) status.textContent = "Dizionario non disponibile. Riprova tra poco.";
      console.error("[magic-dictionary] dictionary unavailable", error);
    }
  }

  function hideDictionary() {
    root.document?.getElementById("magicDictionaryScreen")?.classList.add("hidden");
  }

  async function startManualPractice() {
    ensureElements();
    setGateOpen(true);
    renderGateLoading();
    try {
      await loadCatalog();
      const preference = readPreference();
      activeQuiz = createGateSession({ ...preference, history: [] });
      activeQuiz.manual = true;
      renderGateQuestion();
    } catch (error) {
      renderGateError();
    }
  }

  function bindEvents() {
    root.document.getElementById("magicDictionaryBack")?.addEventListener("click", () => {
      hideDictionary();
      if (dictionaryReturnScreen === "home" && typeof root.showHome === "function") root.showHome();
      else if (typeof root.showChapters === "function") root.showChapters();
      else root.location.href = "/home";
    });
    root.document.getElementById("magicDictionaryPractice")?.addEventListener("click", startManualPractice);
    root.document.getElementById("magicDictionarySearch")?.addEventListener("input", () => {
      dictionaryVisibleCount = PAGE_SIZE;
      renderDictionary();
    });
    root.document.getElementById("magicDictionaryFilters")?.addEventListener("click", event => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;
      dictionaryFilter = button.dataset.filter || "all";
      dictionaryVisibleCount = PAGE_SIZE;
      root.document.querySelectorAll("#magicDictionaryFilters [data-filter]").forEach(item => {
        item.classList.toggle("is-active", item === button);
      });
      renderDictionary();
    });
    root.document.getElementById("magicDictionaryMore")?.addEventListener("click", () => {
      dictionaryVisibleCount += PAGE_SIZE;
      renderDictionary();
    });
    root.document.getElementById("magicDictionaryEnableGate")?.addEventListener("click", enableGate);

    root.document.getElementById("magicWordGate")?.addEventListener("keydown", event => {
      if (event.key === "Escape") event.preventDefault();
      if (event.key !== "Tab") return;
      const focusable = [...event.currentTarget.querySelectorAll("button:not([disabled]), input:not([disabled])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && root.document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && root.document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  function bootstrap() {
    ensureElements();
    if (isAuthenticated()) void onAuthenticated();
  }

  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", ensureElements, { once: true });
    else ensureElements();
    root.addEventListener?.("load", bootstrap, { once: true });
  }

  return {
    VERSION,
    GATE_INTERVAL_MS,
    REQUIRED_CORRECT,
    CATALOG_LIMIT,
    buildV2Catalog,
    buildV3Catalog,
    enableGate,
    hideDictionary,
    isGateDue,
    loadCatalog,
    onAuthenticated,
    readPreference,
    showDictionary,
    startManualPractice,
    __test: {
      hashString,
      normalizeItalian,
      seededRandom,
      shuffled
    }
  };
});
