(() => {
  "use strict";

  const API = "/api/quiz";
  const HOME = "/magic-book";
  const HELP_MANIFEST_SOURCE = "https://www.tmmbooks.eu/dist/patente/quiz-help-runtime-manifest.json";
  const LOCAL_HELP_SOURCE = "/data/patente/quiz-help-runtime-v2.json";
  const REMOTE_HELP_TIMEOUT_MS = 10000;
  const AUDIO_ACTION_ICON = '<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.80688 18.5304C5.82459 18.5005 5.84273 18.4709 5.8613 18.4413C7.2158 16.2881 7.99991 13.7418 7.99991 11C7.99991 8.79086 9.79077 7 11.9999 7C14.209 7 15.9999 8.79086 15.9999 11C15.9999 12.017 15.9307 13.0186 15.7966 14M13.6792 20.8436C14.2909 19.6226 14.7924 18.3369 15.1707 17M19.0097 18.132C19.6547 15.8657 20 13.4732 20 11C20 6.58172 16.4183 3 12 3C10.5429 3 9.17669 3.38958 8 4.07026M3 15.3641C3.64066 14.0454 4 12.5646 4 11C4 9.54285 4.38958 8.17669 5.07026 7M11.9999 11C11.9999 14.5172 10.9911 17.7988 9.24707 20.5712" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CHAPTERS = [
    "Doveri nell'uso della strada",
    "Segnali di pericolo",
    "Segnali di divieto",
    "Segnali d'obbligo",
    "Segnali di precedenza",
    "Segnaletica orizzontale",
    "Semafori e agenti di traffico",
    "Segnali di indicazione",
    "Segnali complementari e di cantiere",
    "Pannelli integrativi",
    "Limiti di velocità",
    "Distanza di sicurezza",
    "Norme e circolazione dei veicoli",
    "Precedenza e incroci",
    "Norme sul sorpasso",
    "Fermata, sosta e arresto",
    "Circolazione su autostrade",
    "Luci e dispositivi acustici",
    "Casco e cintura di sicurezza",
    "Patente e documenti",
    "Incidenti stradali",
    "Alcol e droga",
    "Responsabilità civile e penale",
    "Consumi di carburante",
    "Manutenzione ed elementi del veicolo"
  ];

  const elements = {
    back: document.getElementById("study-back"),
    title: document.getElementById("study-title"),
    subtitle: document.getElementById("study-subtitle"),
    chapters: document.getElementById("study-chapters"),
    chapterGrid: document.getElementById("study-chapter-grid"),
    reader: document.getElementById("study-reader"),
    readerKicker: document.getElementById("study-reader-kicker"),
    readerTitle: document.getElementById("study-reader-title"),
    count: document.getElementById("study-question-count"),
    search: document.getElementById("study-search-input"),
    list: document.getElementById("study-question-list"),
    emptySearch: document.getElementById("study-empty-search"),
    loading: document.getElementById("study-loading"),
    error: document.getElementById("study-error"),
    errorMessage: document.getElementById("study-error-message"),
    retry: document.getElementById("study-retry"),
    toast: document.getElementById("study-toast")
  };

  let currentChapter = null;
  let questions = [];
  let quizSessionToken = "";
  let helpPromise = null;
  let helpIdIndex = null;
  let activePlayback = null;
  let toastTimer = 0;
  let loadRequestId = 0;
  let wordTtsRequestId = 0;
  const STUDY_AUDIO_STATUS_DELAY_MS = 400;
  const STUDY_AUDIO_REQUEST_TIMEOUT_MS = 12000;
  const ttsCache = new Map();
  const helpCache = new Map();
  const audioStatusCache = new Map();
  const pendingAudioStatusChecks = new Map();

  function parseSession(raw) {
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      if (value?.loggedIn === false) return null;
      return {
        phone: String(value?.phone || ""),
        deviceId: String(value?.deviceId || ""),
        accessToken: String(value?.accessToken || "")
      };
    } catch (_) {
      return null;
    }
  }

  function getSession() {
    const stored = [
      parseSession(localStorage.getItem("user_session")),
      parseSession(localStorage.getItem("session"))
    ].find(value => value?.phone && value?.deviceId);
    if (stored) return stored;
    if (localStorage.getItem("loggedIn") !== "true") return null;
    const fallback = {
      phone: String(localStorage.getItem("phone") || ""),
      deviceId: String(localStorage.getItem("deviceId") || ""),
      accessToken: String(localStorage.getItem("accessToken") || "")
    };
    return fallback.phone && fallback.deviceId ? fallback : null;
  }

  const session = getSession();
  if (!session) {
    window.location.replace(HOME);
    return;
  }

  function accessToken() {
    return String(localStorage.getItem("accessToken") || session.accessToken || "");
  }

  function saveAccessToken(token, expiresAt) {
    if (!token || !expiresAt) return;
    session.accessToken = token;
    localStorage.setItem("accessToken", token);
    localStorage.setItem("accessTokenExpiresAt", String(expiresAt));
    try {
      const stored = JSON.parse(localStorage.getItem("user_session") || "{}");
      if (stored?.phone) {
        stored.accessToken = token;
        stored.accessTokenExpiresAt = expiresAt;
        localStorage.setItem("user_session", JSON.stringify(stored));
      }
    } catch (_) {}
  }

  function authHeaders({ withQuizSession = false, json = false } = {}) {
    const headers = new Headers();
    const token = accessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (withQuizSession && quizSessionToken) headers.set("X-Quiz-Session", quizSessionToken);
    if (json) headers.set("Content-Type", "application/json");
    return headers;
  }

  function clearSessionAndExit() {
    ["loggedIn", "phone", "expiry", "user_session", "session", "accessToken", "accessTokenExpiresAt"]
      .forEach(key => localStorage.removeItem(key));
    window.location.replace(HOME);
  }

  async function readApiResponse(response) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      const code = String(data.error || "unauthorized");
      if (["expired", "not_found", "device_replaced", "device_mismatch", "unauthorized"].includes(code)) {
        clearSessionAndExit();
      }
      throw new Error(code);
    }
    if (!response.ok) throw new Error(data.error || `study_api_${response.status}`);
    return data;
  }

  function chapterFromLocation() {
    const match = window.location.pathname.replace(/\/+$/, "").match(/^\/studia-quiz\/capitolo-(\d{1,2})$/);
    const value = match?.[1] || new URLSearchParams(window.location.search).get("chapter") || "";
    const chapter = Number(value);
    return Number.isInteger(chapter) && chapter >= 1 && chapter <= CHAPTERS.length ? chapter : null;
  }

  function chapterPath(chapter) {
    return `/studia-quiz/capitolo-${String(chapter).padStart(2, "0")}`;
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2800);
  }

  function buildChapterPicker() {
    const fragment = document.createDocumentFragment();
    CHAPTERS.forEach((name, index) => {
      const chapter = index + 1;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "study-chapter";
      button.dataset.chapter = String(chapter);
      button.setAttribute("aria-label", `Studia il capitolo ${chapter}: ${name}`);

      const number = document.createElement("span");
      number.className = "study-chapter-number";
      number.textContent = String(chapter).padStart(2, "0");
      const copy = document.createElement("span");
      copy.className = "study-chapter-copy";
      const label = document.createElement("small");
      label.textContent = "CAPITOLO";
      const title = document.createElement("strong");
      title.textContent = name;
      copy.append(label, title);
      const arrow = document.createElement("span");
      arrow.className = "study-chapter-arrow";
      const arrowIcon = document.createElement("img");
      arrowIcon.className = "study-system-arrow";
      arrowIcon.src = "icons/next.png";
      arrowIcon.alt = "";
      arrow.setAttribute("aria-hidden", "true");
      arrow.appendChild(arrowIcon);
      button.append(number, copy, arrow);
      button.addEventListener("click", () => openChapter(chapter));
      fragment.appendChild(button);
    });
    elements.chapterGrid.replaceChildren(fragment);
  }

  function showPicker({ updateHistory = false } = {}) {
    loadRequestId += 1;
    resetAudioObservation();
    currentChapter = null;
    questions = [];
    stopPlayback();
    elements.loading.classList.add("hidden");
    elements.error.classList.add("hidden");
    elements.reader.classList.add("hidden");
    elements.chapters.classList.remove("hidden");
    elements.title.textContent = "Studia quiz";
    elements.subtitle.textContent = "Scegli un capitolo e studia tutte le domande.";
    document.title = "MagicBook | Studia quiz";
    if (updateHistory) history.pushState({ screen: "study" }, "", "/studia-quiz");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function openChapter(chapter, { updateHistory = true } = {}) {
    if (!Number.isInteger(chapter) || chapter < 1 || chapter > CHAPTERS.length) return;
    const ownRequest = ++loadRequestId;
    currentChapter = chapter;
    stopPlayback();
    elements.chapters.classList.add("hidden");
    elements.reader.classList.add("hidden");
    elements.error.classList.add("hidden");
    elements.loading.classList.remove("hidden");
    elements.search.value = "";
    elements.title.textContent = `Capitolo ${String(chapter).padStart(2, "0")}`;
    elements.subtitle.textContent = CHAPTERS[chapter - 1];
    document.title = `MagicBook | Studia quiz · Capitolo ${chapter}`;
    if (updateHistory) history.pushState({ screen: "studyChapter", chapter }, "", chapterPath(chapter));

    try {
      const query = new URLSearchParams({
        action: "getStudyQuiz",
        phone: session.phone,
        deviceId: session.deviceId,
        chapters: String(chapter)
      });
      const response = await fetch(`${API}?${query}`, {
        headers: authHeaders(),
        cache: "no-store"
      });
      const data = await readApiResponse(response);
      if (ownRequest !== loadRequestId) return;
      saveAccessToken(data.accessToken, data.accessTokenExpiresAt);
      quizSessionToken = String(data.quizSessionToken || "");
      questions = Array.isArray(data.quiz) ? data.quiz : [];
      renderQuestions();
      elements.loading.classList.add("hidden");
      elements.reader.classList.remove("hidden");
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch (error) {
      if (ownRequest !== loadRequestId || error.message === "unauthorized") return;
      elements.loading.classList.add("hidden");
      elements.error.classList.remove("hidden");
      elements.errorMessage.textContent = error.message === "study_chapter_empty"
        ? "Questo capitolo non contiene ancora domande."
        : "Controlla la connessione e riprova.";
    }
  }

  function answerLabel(value) {
    if (value === true || value === 1 || ["1", "true", "vero", "v"].includes(String(value).trim().toLowerCase())) return "Vero";
    if (value === false || value === 0 || ["0", "false", "falso", "f"].includes(String(value).trim().toLowerCase())) return "Falso";
    return "";
  }

  function assetUrl(figure) {
    return `/api/asset?${new URLSearchParams({ kind: "figure", figure: String(figure || "").trim() })}`;
  }

  function actionButton(className, label, icon) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `study-action ${className}`;
    const symbol = document.createElement("span");
    symbol.className = "study-action-icon";
    symbol.setAttribute("aria-hidden", "true");
    if (icon === "audio-action") {
      symbol.innerHTML = AUDIO_ACTION_ICON;
    } else if (String(icon).startsWith("icons/")) {
      const image = document.createElement("img");
      image.src = icon;
      image.alt = "";
      symbol.appendChild(image);
    } else {
      symbol.textContent = icon;
    }
    const copy = document.createElement("span");
    copy.textContent = label;
    button.append(symbol, copy);
    return button;
  }

  function createExplanationPlayer(question, index) {
    const root = document.createElement("div");
    root.className = "study-explanation-player hidden";
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", `Spiegazione audio della domanda ${index + 1}`);

    const play = document.createElement("button");
    play.type = "button";
    play.className = "study-explanation-play";
    play.setAttribute("aria-label", "Riproduci spiegazione");

    const progress = document.createElement("input");
    progress.className = "study-explanation-progress";
    progress.type = "range";
    progress.min = "0";
    progress.max = "100";
    progress.step = "0.1";
    progress.value = "0";
    progress.setAttribute("aria-label", "Avanzamento spiegazione");

    const speed = document.createElement("button");
    speed.type = "button";
    speed.className = "study-explanation-speed";
    speed.textContent = "1×";
    speed.setAttribute("aria-label", "Velocità 1x");

    const controls = {
      root,
      play,
      progress,
      speed,
      speedValue: 1,
      key: `explanation:${question.id || fingerprint(question)}`
    };
    play.addEventListener("click", () => playExplanation(question, controls));
    progress.addEventListener("input", () => seekExplanation(controls));
    speed.addEventListener("click", () => changeExplanationSpeed(controls));
    root.append(play, progress, speed);
    return controls;
  }

  function renderQuestion(question, index) {
    const card = document.createElement("article");
    card.className = "study-question-card";
    card.dataset.questionIndex = String(index);
    card.dataset.search = String(question.question || "").toLocaleLowerCase("it-IT");

    const main = document.createElement("div");
    main.className = "study-question-main";
    const meta = document.createElement("div");
    meta.className = "study-question-meta";
    const number = document.createElement("span");
    number.className = "study-question-number";
    number.textContent = `DOMANDA ${index + 1}`;
    meta.appendChild(number);
    const answer = answerLabel(question.correct);
    if (answer) {
      const badge = document.createElement("span");
      badge.className = `study-answer ${answer === "Vero" ? "is-true" : "is-false"}`;
      badge.textContent = `RISPOSTA: ${answer.toUpperCase()}`;
      meta.appendChild(badge);
    }
    main.appendChild(meta);

    if (String(question.figure || "").trim()) {
      const image = document.createElement("img");
      image.className = "study-figure";
      image.loading = "lazy";
      image.alt = `Figura della domanda ${index + 1}`;
      image.src = assetUrl(question.figure);
      image.addEventListener("error", () => image.remove(), { once: true });
      main.appendChild(image);
    }

    const text = document.createElement("p");
    text.className = "study-question-text notranslate";
    text.translate = false;
    text.lang = "it";
    text.textContent = String(question.question || "");
    main.appendChild(text);

    const actions = document.createElement("div");
    actions.className = "study-actions";
    const italian = actionButton("study-action-italian", "Italiano", "audio-action");
    italian.setAttribute("aria-label", `Ascolta in italiano la domanda ${index + 1}`);
    italian.addEventListener("click", () => playTts(question, "it", italian, card));
    const bangla = actionButton("study-action-bangla", "বাংলা", "audio-action");
    bangla.lang = "bn";
    bangla.setAttribute("aria-label", `Ascolta in bengali la domanda ${index + 1}`);
    bangla.addEventListener("click", () => playTts(question, "bn", bangla, card));
    const explanation = createExplanationPlayer(question, index);
    const help = actionButton("study-action-help", "Traduzione e parole chiave", "文");
    help.setAttribute("aria-expanded", "false");
    help.addEventListener("click", () => toggleHelp(question, card, help));
    actions.append(italian, bangla, explanation.root, help);
    main.appendChild(actions);
    card.appendChild(main);
    observeAudioAvailability(card, question, explanation.root);
    return card;
  }

  function renderQuestions() {
    resetAudioObservation();
    const fragment = document.createDocumentFragment();
    questions.forEach((question, index) => fragment.appendChild(renderQuestion(question, index)));
    elements.list.replaceChildren(fragment);
    elements.readerKicker.textContent = `CAPITOLO ${String(currentChapter).padStart(2, "0")}`;
    elements.readerTitle.textContent = CHAPTERS[currentChapter - 1];
    elements.count.textContent = `${questions.length} domande da studiare`;
    elements.emptySearch.classList.add("hidden");
  }

  function normalize(value = "") {
    return String(value)
      .toLocaleLowerCase("it-IT")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[’]/g, "'")
      .trim()
      .replace(/[.!?]+$/g, "")
      .replace(/\s+/g, " ");
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
    const figure = String(question?.figure || question?.img || "").match(/(\d+)(?=\.[a-z0-9]+$|$)/i)?.[1] || "";
    return hash(`${normalize(question?.question)}|${figure}`);
  }

  async function loadHelpLibrary() {
    if (!helpPromise) {
      window.QUIZ_HELP_RUNTIME_V3_MANIFEST_URL = HELP_MANIFEST_SOURCE;
      const remote = Promise.resolve().then(() => {
        if (!window.QuizHelpRuntimeV3?.load) throw new Error("study_help_runtime_v3_missing");
        return window.QuizHelpRuntimeV3.load();
      });
      const remoteDeadline = new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error("study_help_runtime_v3_timeout")), REMOTE_HELP_TIMEOUT_MS);
      });
      helpPromise = Promise.race([remote, remoteDeadline])
        .catch(() => fetch(LOCAL_HELP_SOURCE, { cache: "force-cache" })
          .then(response => {
            if (!response.ok) throw new Error(`study_help_local_${response.status}`);
            return response.json();
          }))
        .catch(error => {
          helpPromise = null;
          throw error;
        });
    }
    return helpPromise;
  }

  function displayForm(question, canonical, aliases = []) {
    const normalizedQuestion = ` ${normalize(question)} `;
    return [...new Set([...(aliases || []), canonical])]
      .filter(Boolean)
      .sort((left, right) => right.length - left.length)
      .find(candidate => normalizedQuestion.includes(` ${normalize(candidate)} `)) || canonical;
  }

  function usableBanglaTranslation(value = "") {
    const text = String(value || "").trim();
    return [...text].some(character => {
      const codePoint = character.codePointAt(0);
      return codePoint >= 0x0980 && codePoint <= 0x09ff;
    }) ? text : "";
  }

  function decodeHelp(question, data) {
    if (data?.resolver) {
      const resolved = data.resolver.resolve(question);
      if (!resolved) return null;
      const translation = usableBanglaTranslation(
        resolved.questionBnEasy || resolved.questionBnStandard || resolved.questionBn
      );
      return {
        ...resolved,
        translation,
        translationSource: translation ? "runtime_v3" : ""
      };
    }
    if (!helpIdIndex) {
      helpIdIndex = new Map();
      Object.values(data.quizzes || {}).forEach(value => {
        if (!Array.isArray(value) || !value[0]) return;
        const id = String(value[0]).toLocaleLowerCase("it-IT");
        helpIdIndex.set(id, value);
        const digits = id.match(/\d+/)?.[0];
        if (digits) helpIdIndex.set(String(Number(digits)), value);
      });
    }
    const sourceId = String(question?.id ?? "").trim().toLocaleLowerCase("it-IT");
    const digits = sourceId.match(/\d+/)?.[0];
    const row = data.quizzes?.[fingerprint(question)]
      || helpIdIndex.get(sourceId)
      || (digits ? helpIdIndex.get(String(Number(digits))) : null);
    if (!Array.isArray(row)) return null;
    const [quizId, chapterId, topicId, wordIds = [], contextBn = ""] = row;
    const chapter = data.chapters?.[chapterId] || [];
    const topic = data.topics?.[topicId] || [];
    const words = wordIds.map(id => {
      const word = data.words?.[id];
      if (!Array.isArray(word)) return null;
      return {
        id,
        italian: displayForm(question.question, word[0], word[4]),
        bangla: word[1] || "",
        simpleIt: word[2] || "",
        simpleBn: word[3] || "",
        ttsBn: word[5] || ""
      };
    }).filter(Boolean);
    return {
      quizId,
      translation: usableBanglaTranslation(question.question_bd || question.questionBD),
      translationSource: question.questionTranslationSource || "catalog",
      contextBn: String(contextBn || "").trim(),
      chapter: { italian: chapter[0] || "", bangla: chapter[1] || "" },
      topic: { italian: topic[0] || "", bangla: topic[1] || "" },
      words
    };
  }

  async function getQuestionHelp(question) {
    const key = String(question.id || fingerprint(question));
    const cached = helpCache.get(key);
    if (cached) return cached;
    let data = null;
    try { data = await loadHelpLibrary(); } catch (_) {}
    const help = (data && decodeHelp(question, data)) || {
      translation: usableBanglaTranslation(question.question_bd || question.questionBD),
      translationSource: question.questionTranslationSource || "catalog",
      words: []
    };
    helpCache.set(key, help);
    return help;
  }

  function helpSkeleton() {
    const section = document.createElement("section");
    section.className = "study-help";
    section.innerHTML = '<div class="study-help-skeleton" aria-label="Caricamento traduzione"></div>';
    return section;
  }

  function helpSection(labelText) {
    const section = document.createElement("div");
    section.className = "study-help-section";
    const label = document.createElement("span");
    label.className = "study-help-label";
    label.textContent = labelText;
    section.appendChild(label);
    return section;
  }

  function renderHelp(question, help) {
    const container = document.createElement("section");
    container.className = "study-help";
    const translationSection = helpSection("TRADUZIONE BANGLA");
    const translation = document.createElement("p");
    translation.className = "study-translation";
    translation.lang = "bn";
    const verifiedTranslation = String(help?.translation || "").trim();
    translation.classList.toggle("is-missing", !verifiedTranslation);
    translation.dataset.translationState = verifiedTranslation ? "ready" : "missing";
    translation.textContent = verifiedTranslation || "Traduzione non disponibile.";
    translationSection.appendChild(translation);
    container.appendChild(translationSection);

    if (help?.chapter?.italian || help?.topic?.italian) {
      const context = document.createElement("div");
      context.className = "study-context";
      [help.chapter?.italian, help.topic?.italian, help.chapter?.bangla, help.topic?.bangla]
        .filter(Boolean)
        .forEach(value => {
          const tag = document.createElement("span");
          tag.textContent = value;
          context.appendChild(tag);
        });
      translationSection.appendChild(context);
    }

    const wordsSection = helpSection("PAROLE CHIAVE");
    const words = document.createElement("div");
    words.className = "study-words";
    const detail = document.createElement("div");
    detail.className = "study-word-detail hidden";
    if (!help?.words?.length) {
      const empty = document.createElement("p");
      empty.className = "study-help-empty";
      empty.textContent = "Parole chiave non disponibili per questa domanda.";
      words.appendChild(empty);
    } else {
      help.words.forEach(word => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "study-word";
        const italian = document.createElement("strong");
        italian.textContent = word.italian;
        const bangla = document.createElement("span");
        bangla.lang = "bn";
        bangla.textContent = word.bangla;
        button.append(italian, bangla);
        button.addEventListener("click", () => renderWordDetail(word, detail));
        words.appendChild(button);
      });
    }
    wordsSection.append(words, detail);
    container.appendChild(wordsSection);
    return container;
  }

  function renderWordDetail(word, detail) {
    detail.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = `${word.italian} · ${word.bangla}`;
    const italian = document.createElement("p");
    italian.textContent = word.simpleIt;
    const bangla = document.createElement("p");
    bangla.lang = "bn";
    bangla.textContent = word.simpleBn;
    const listen = document.createElement("button");
    listen.type = "button";
    listen.className = "study-word-listen";
    listen.textContent = "🔊 Ascolta";
    listen.addEventListener("click", () => playBanglaWord(word, listen));
    detail.append(heading, italian, bangla, listen);
    detail.classList.remove("hidden");
  }

  async function toggleHelp(question, card, button) {
    const existing = card.querySelector(":scope > .study-help");
    if (existing) {
      const willShow = existing.classList.contains("hidden");
      existing.classList.toggle("hidden", !willShow);
      button.setAttribute("aria-expanded", String(willShow));
      return;
    }
    button.setAttribute("aria-expanded", "true");
    const skeleton = helpSkeleton();
    card.appendChild(skeleton);
    try {
      const key = String(question.id || fingerprint(question));
      let help = helpCache.get(key);
      if (!help) help = await getQuestionHelp(question);
      if (!String(help.translation || "").trim()) {
        try {
          const translated = await loadOnDemandTranslation(question);
          if (translated.translation) {
            help.translation = translated.translation;
            help.translationSource = translated.translationSource;
          }
        } catch (_) {}
      }
      helpCache.set(key, help);
      skeleton.replaceWith(renderHelp(question, help));
    } catch (_) {
      skeleton.replaceWith(renderHelp(question, {
        translation: usableBanglaTranslation(question.question_bd || question.questionBD),
        translationSource: question.questionTranslationSource || "catalog",
        words: []
      }));
    }
  }

  async function loadOnDemandTranslation(question) {
    const key = `bn:${question.id || fingerprint(question)}`;
    const cached = ttsCache.get(key);
    if (cached?.translation) return {
      translation: usableBanglaTranslation(cached.translation),
      translationSource: String(cached.translationSource || "automatic")
    };
    const query = new URLSearchParams({
      action: "getBengaliAudio",
      phone: session.phone,
      deviceId: session.deviceId,
      questionId: String(question.id || ""),
      text: String(question.question || "")
    });
    const response = await fetch(`${API}?${query}`, {
      headers: authHeaders({ withQuizSession: true }),
      cache: "force-cache"
    });
    const data = await readApiResponse(response);
    if (data?.audio) ttsCache.set(key, data);
    return {
      translation: usableBanglaTranslation(data?.translation),
      translationSource: String(data?.translationSource || "automatic")
    };
  }

  function explanationDuration(playback) {
    const nativeDuration = Number(playback?.audio?.duration);
    if (Number.isFinite(nativeDuration) && nativeDuration > 0) return nativeDuration;
    return Math.max(0, Number(playback?.durationHint) || 0);
  }

  function paintExplanationProgress(playback = activePlayback) {
    const controls = playback?.controls;
    if (!controls) return;
    const duration = explanationDuration(playback);
    const currentTime = Math.max(0, Number(playback.audio.currentTime) || 0);
    const percent = duration > 0 ? Math.min(100, currentTime / duration * 100) : 0;
    controls.progress.value = String(percent);
    controls.progress.style.setProperty("--progress", `${percent}%`);
    controls.progress.setAttribute("aria-valuenow", percent.toFixed(1));
  }

  function animateExplanationProgress() {
    if (!activePlayback?.controls || activePlayback.audio.paused || activePlayback.audio.ended) return;
    paintExplanationProgress(activePlayback);
    activePlayback.frame = requestAnimationFrame(animateExplanationProgress);
  }

  function seekExplanation(controls) {
    if (activePlayback?.key !== controls.key) return;
    const duration = explanationDuration(activePlayback);
    if (!duration) return;
    const percent = Math.max(0, Math.min(100, Number(controls.progress.value) || 0));
    try { activePlayback.audio.currentTime = duration * percent / 100; } catch (_) { return; }
    paintExplanationProgress(activePlayback);
  }

  function changeExplanationSpeed(controls) {
    const speeds = [1, 1.25, 1.5, 2];
    controls.speedValue = speeds[(speeds.indexOf(controls.speedValue) + 1) % speeds.length];
    controls.speed.textContent = `${String(controls.speedValue).replace(".", ",")}×`;
    controls.speed.setAttribute("aria-label", `Velocità ${controls.speedValue}x`);
    if (activePlayback?.key === controls.key) activePlayback.audio.playbackRate = controls.speedValue;
  }

  function stopPlayback() {
    if (!activePlayback) return;
    if (activePlayback.frame) cancelAnimationFrame(activePlayback.frame);
    activePlayback.audio.pause();
    activePlayback.button?.classList.remove("is-playing");
    activePlayback.controls?.root.classList.remove("is-playing", "is-loading");
    if (activePlayback.controls) {
      activePlayback.controls.progress.value = "0";
      activePlayback.controls.progress.style.setProperty("--progress", "0%");
    }
    if (activePlayback.url) URL.revokeObjectURL(activePlayback.url);
    activePlayback = null;
  }

  function base64AudioUrl(base64, mimeType = "audio/mpeg") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  }

  async function startAudio(url, button, key, controls = null, durationHint = 0) {
    if (activePlayback?.key === key) {
      if (activePlayback.audio.paused) {
        await activePlayback.audio.play();
      } else {
        activePlayback.audio.pause();
      }
      return;
    }
    stopPlayback();
    const audio = new Audio(url);
    audio.preload = "metadata";
    if (controls) audio.playbackRate = controls.speedValue;
    activePlayback = { audio, button, url, key, controls, durationHint, frame: 0 };
    audio.addEventListener("play", () => {
      if (activePlayback?.audio !== audio) return;
      button.classList.add("is-playing");
      controls?.root.classList.add("is-playing");
      if (controls) {
        if (activePlayback.frame) cancelAnimationFrame(activePlayback.frame);
        activePlayback.frame = requestAnimationFrame(animateExplanationProgress);
      }
    });
    audio.addEventListener("pause", () => {
      if (activePlayback?.audio !== audio) return;
      button.classList.remove("is-playing");
      controls?.root.classList.remove("is-playing");
      if (activePlayback.frame) cancelAnimationFrame(activePlayback.frame);
      activePlayback.frame = 0;
      paintExplanationProgress(activePlayback);
    });
    ["loadedmetadata", "durationchange", "timeupdate", "seeking", "seeked"]
      .forEach(eventName => audio.addEventListener(eventName, () => {
        if (activePlayback?.audio === audio) paintExplanationProgress(activePlayback);
      }));
    audio.addEventListener("ended", () => {
      if (activePlayback?.audio !== audio) return;
      if (activePlayback.frame) cancelAnimationFrame(activePlayback.frame);
      button.classList.remove("is-playing");
      controls?.root.classList.remove("is-playing");
      if (controls) {
        controls.progress.value = "0";
        controls.progress.style.setProperty("--progress", "0%");
      }
      URL.revokeObjectURL(url);
      activePlayback = null;
    }, { once: true });
    audio.addEventListener("error", () => {
      if (activePlayback?.audio === audio) stopPlayback();
      showToast("Audio non disponibile al momento.");
    }, { once: true });
    try {
      await audio.play();
    } catch (error) {
      if (activePlayback?.audio === audio) stopPlayback();
      throw error;
    }
  }

  async function playTts(question, language, button, card) {
    wordTtsRequestId += 1;
    const key = `${language}:${question.id || fingerprint(question)}`;
    if (activePlayback?.key === key) {
      await startAudio(activePlayback.url, button, key).catch(() => showToast("Audio non disponibile al momento."));
      return;
    }
    button.disabled = true;
    button.classList.add("is-loading");
    try {
      let data = ttsCache.get(key);
      if (!data) {
        let preferredTranslation = "";
        let preferredTranslationSource = "";
        if (language === "bn") {
          const help = await getQuestionHelp(question);
          preferredTranslation = usableBanglaTranslation(help?.translation);
          preferredTranslationSource = String(help?.translationSource || "runtime_v3");
        }
        const query = new URLSearchParams({
          action: language === "bn"
            ? (preferredTranslation ? "getTTS" : "getBengaliAudio")
            : "getItalianAudio",
          phone: session.phone,
          deviceId: session.deviceId,
          questionId: String(question.id || ""),
          text: preferredTranslation || String(question.question || "")
        });
        const response = await fetch(`${API}?${query}`, {
          headers: authHeaders({ withQuizSession: true })
        });
        data = await readApiResponse(response);
        if (!data.audio) throw new Error("audio_not_available");
        if (preferredTranslation) {
          data = {
            ...data,
            translation: preferredTranslation,
            translationSource: preferredTranslationSource
          };
        }
        ttsCache.set(key, data);
      }
      const safeTranslation = language === "bn" ? usableBanglaTranslation(data.translation) : "";
      if (safeTranslation) {
        const translation = card.querySelector(".study-translation");
        if (translation && (translation.dataset.translationState === "missing" || !translation.textContent.trim())) {
          translation.textContent = safeTranslation;
          translation.dataset.translationState = "ready";
          translation.classList.remove("is-missing");
        }
      }
      await startAudio(base64AudioUrl(data.audio), button, key);
    } catch (_) {
      showToast(language === "bn" ? "Audio bangla non disponibile." : "Audio italiano non disponibile.");
    } finally {
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  }

  async function playBanglaWord(word, button) {
    const value = usableBanglaTranslation(word.ttsBn || `${word.bangla}। ${word.simpleBn}`);
    if (!value) {
      showToast("Audio parola non disponibile.");
      return;
    }

    const key = `bn-word:${hash(value)}`;
    if (activePlayback?.key === key) {
      await startAudio(activePlayback.url, button, key)
        .catch(() => showToast("Audio parola non disponibile."));
      return;
    }

    const ownRequest = ++wordTtsRequestId;
    button.disabled = true;
    button.classList.add("is-loading");
    try {
      let data = ttsCache.get(key);
      if (!data) {
        const query = new URLSearchParams({
          action: "getTTS",
          phone: session.phone,
          deviceId: session.deviceId,
          text: value
        });
        const response = await fetch(`${API}?${query}`, {
          headers: authHeaders({ withQuizSession: true })
        });
        data = await readApiResponse(response);
        if (!data.audio) throw new Error("audio_not_available");
        ttsCache.set(key, data);
      }
      if (ownRequest !== wordTtsRequestId) return;
      await startAudio(base64AudioUrl(data.audio), button, key);
    } catch (_) {
      showToast("Audio parola non disponibile.");
    } finally {
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  }

  async function audioApi(action, question, { blob = false } = {}) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), STUDY_AUDIO_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(API, {
        method: "POST",
        signal: controller.signal,
        headers: authHeaders({ json: true }),
        body: JSON.stringify({
          action,
          phone: session.phone,
          deviceId: session.deviceId,
          questionId: question.id ?? "",
          question: String(question.audioQuestion || question.question || ""),
          figure: question.audioFigure ?? question.figure ?? "",
          quizAudioIdentityVersion: window.QuizAudioIdentity?.VERSION || 2,
          audioIdentityToken: question.audioIdentityToken || ""
        })
      });
      if (blob) {
        if (response.status === 401 || response.status === 403) clearSessionAndExit();
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data?.error || `audio_blob_${response.status}`);
        }
        return {
          blob: await response.blob(),
          durationMs: Number(response.headers.get("X-Audio-Duration-Ms")) || 0
        };
      }
      return readApiResponse(response);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function audioStatusKey(question) {
    return String(question?.id || fingerprint(question));
  }

  function paintAudioAvailability(button, available) {
    button.classList.toggle("hidden", available !== true);
    button.dataset.audioState = available === true ? "ready" : "unavailable";
    if (available === true) button.classList.remove("is-error");
  }

  function cancelPendingAudioStatus(card) {
    const timer = pendingAudioStatusChecks.get(card);
    if (!timer) return;
    window.clearTimeout(timer);
    pendingAudioStatusChecks.delete(card);
  }

  function resetAudioObservation() {
    audioObserver?.disconnect();
    pendingAudioStatusChecks.forEach(timer => window.clearTimeout(timer));
    pendingAudioStatusChecks.clear();
  }

  const audioObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) {
          cancelPendingAudioStatus(entry.target);
          return;
        }
        if (pendingAudioStatusChecks.has(entry.target)) return;
        const timer = window.setTimeout(() => {
          pendingAudioStatusChecks.delete(entry.target);
          audioObserver.unobserve(entry.target);
          entry.target._checkStudyAudio?.();
        }, STUDY_AUDIO_STATUS_DELAY_MS);
        pendingAudioStatusChecks.set(entry.target, timer);
      });
    }, { rootMargin: "120px" })
    : null;

  function observeAudioAvailability(card, question, button) {
    const check = async () => {
      const key = audioStatusKey(question);
      if (audioStatusCache.has(key)) {
        paintAudioAvailability(button, audioStatusCache.get(key));
        return;
      }
      try {
        const data = await audioApi("getQuizAudioStatus", question);
        const available = data.available === true;
        if (data.temporaryUnavailable !== true) audioStatusCache.set(key, available);
        paintAudioAvailability(button, available);
      } catch (_) {
        button.classList.add("hidden");
      }
    };
    if (audioObserver) {
      card._checkStudyAudio = check;
      audioObserver.observe(card);
    } else {
      const timer = window.setTimeout(() => {
        pendingAudioStatusChecks.delete(card);
        void check();
      }, STUDY_AUDIO_STATUS_DELAY_MS);
      pendingAudioStatusChecks.set(card, timer);
    }
  }

  async function playExplanation(question, controls) {
    wordTtsRequestId += 1;
    const { root, play: button, key } = controls;
    if (activePlayback?.key === key) {
      await startAudio(activePlayback.url, button, key, controls, activePlayback.durationHint)
        .catch(() => showToast("Spiegazione audio non disponibile."));
      return;
    }
    button.disabled = true;
    root.classList.remove("is-error");
    root.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
    try {
      const source = await fetchExplanationBlob(question);
      if (!source.blob.size) throw new Error("empty_audio_blob");
      await startAudio(URL.createObjectURL(source.blob), button, key, controls, source.durationMs / 1000);
    } catch (error) {
      const code = String(error?.message || "");
      const definitelyMissing = code === "quiz_audio_not_found" || code === "audio_blob_404";
      if (definitelyMissing) {
        audioStatusCache.set(audioStatusKey(question), false);
        paintAudioAvailability(root, false);
        showToast("Questa spiegazione audio non è disponibile.");
      } else {
        root.classList.add("is-error");
        root.dataset.audioState = "retry";
        showToast("L'audio non si è caricato. Tocca di nuovo per riprovare.");
      }
    } finally {
      button.disabled = false;
      root.classList.remove("is-loading");
      button.removeAttribute("aria-busy");
    }
  }

  async function fetchExplanationBlob(question) {
    let firstError = null;
    try {
      const source = await audioApi("getQuizAudioBlob", question, { blob: true });
      if (source?.blob?.size) return source;
      firstError = new Error("empty_audio_blob");
    } catch (error) {
      firstError = error;
    }

    // Use the signed object only after an explicit click, so scrolling never
    // creates a second audio request for every visible question.
    try {
      const playback = await audioApi("getQuizAudioPlayback", question);
      if (!playback?.audioUrl) throw firstError || new Error("audio_url_missing");
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), STUDY_AUDIO_REQUEST_TIMEOUT_MS);
      let response;
      try {
        response = await fetch(playback.audioUrl, { cache: "no-store", signal: controller.signal });
      } finally {
        window.clearTimeout(timeoutId);
      }
      if (!response.ok) throw firstError || new Error(`audio_url_${response.status}`);
      const blob = await response.blob();
      if (!blob.size) throw firstError || new Error("empty_audio_blob");
      return { blob, durationMs: Number(playback.durationMs) || 0 };
    } catch (_) {
      throw firstError || new Error("audio_not_available");
    }
  }

  function filterQuestions() {
    const query = normalize(elements.search.value);
    let visible = 0;
    elements.list.querySelectorAll(".study-question-card").forEach(card => {
      const matches = !query || normalize(card.dataset.search).includes(query);
      card.classList.toggle("hidden", !matches);
      if (matches) visible += 1;
    });
    elements.count.textContent = query
      ? `${visible} di ${questions.length} domande`
      : `${questions.length} domande da studiare`;
    elements.emptySearch.classList.toggle("hidden", visible !== 0);
  }

  elements.back.addEventListener("click", () => {
    if (currentChapter) showPicker({ updateHistory: true });
    else window.location.href = HOME;
  });
  elements.retry.addEventListener("click", () => currentChapter && openChapter(currentChapter, { updateHistory: false }));
  elements.search.addEventListener("input", filterQuestions);
  window.addEventListener("popstate", () => {
    const chapter = chapterFromLocation();
    if (chapter) openChapter(chapter, { updateHistory: false });
    else showPicker();
  });
  window.addEventListener("pagehide", () => {
    stopPlayback();
    resetAudioObservation();
  });

  buildChapterPicker();
  const initialChapter = chapterFromLocation();
  if (initialChapter) void openChapter(initialChapter, { updateHistory: false });
  else showPicker();
})();
