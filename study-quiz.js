(() => {
  "use strict";

  const API = "/api/quiz";
  const HOME = "/magic-book";
  const HELP_LIBRARY = "/data/patente/quiz-help-runtime-v2.json";
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
  const STUDY_AUDIO_STATUS_DELAY_MS = 400;
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
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "→";
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
    symbol.setAttribute("aria-hidden", "true");
    symbol.textContent = icon;
    const copy = document.createElement("span");
    copy.textContent = label;
    button.append(symbol, copy);
    return button;
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
    const italian = actionButton("study-action-italian", "Italiano", "🔊");
    italian.setAttribute("aria-label", `Ascolta in italiano la domanda ${index + 1}`);
    italian.addEventListener("click", () => playTts(question, "it", italian, card));
    const bangla = actionButton("study-action-bangla", "বাংলা", "🔊");
    bangla.lang = "bn";
    bangla.setAttribute("aria-label", `Ascolta in bengali la domanda ${index + 1}`);
    bangla.addEventListener("click", () => playTts(question, "bn", bangla, card));
    const explanation = actionButton("study-action-explanation hidden", "Spiegazione audio", "▶");
    explanation.setAttribute("aria-label", `Ascolta la spiegazione audio della domanda ${index + 1}`);
    explanation.addEventListener("click", () => playExplanation(question, explanation));
    const help = actionButton("study-action-help", "Traduzione e parole chiave", "文");
    help.setAttribute("aria-expanded", "false");
    help.addEventListener("click", () => toggleHelp(question, card, help));
    actions.append(italian, bangla, explanation, help);
    main.appendChild(actions);
    card.appendChild(main);
    observeAudioAvailability(card, question, explanation);
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
    helpPromise ||= fetch(HELP_LIBRARY, { cache: "force-cache" })
      .then(response => {
        if (!response.ok) throw new Error(`study_help_${response.status}`);
        return response.json();
      })
      .catch(error => {
        helpPromise = null;
        throw error;
      });
    return helpPromise;
  }

  function displayForm(question, canonical, aliases = []) {
    const normalizedQuestion = ` ${normalize(question)} `;
    return [...new Set([...(aliases || []), canonical])]
      .filter(Boolean)
      .sort((left, right) => right.length - left.length)
      .find(candidate => normalizedQuestion.includes(` ${normalize(candidate)} `)) || canonical;
  }

  function decodeHelp(question, data) {
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
    const [quizId, chapterId, topicId, wordIds = [], translation = ""] = row;
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
      translation: String(question.question_bd || question.questionBD || translation || "").trim(),
      chapter: { italian: chapter[0] || "", bangla: chapter[1] || "" },
      topic: { italian: topic[0] || "", bangla: topic[1] || "" },
      words
    };
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
    translation.textContent = help?.translation || "Traduzione verificata non ancora disponibile.";
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
    listen.addEventListener("click", () => speakWord(word));
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
      if (!help) {
        const data = await loadHelpLibrary();
        help = decodeHelp(question, data) || {
          translation: String(question.question_bd || question.questionBD || ""),
          words: []
        };
        helpCache.set(key, help);
      }
      skeleton.replaceWith(renderHelp(question, help));
    } catch (_) {
      skeleton.replaceWith(renderHelp(question, {
        translation: String(question.question_bd || question.questionBD || ""),
        words: []
      }));
    }
  }

  function stopPlayback() {
    window.speechSynthesis?.cancel();
    if (!activePlayback) return;
    activePlayback.audio.pause();
    activePlayback.button?.classList.remove("is-playing");
    if (activePlayback.url) URL.revokeObjectURL(activePlayback.url);
    activePlayback = null;
  }

  function base64AudioUrl(base64, mimeType = "audio/mpeg") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  }

  async function startAudio(url, button, key) {
    if (activePlayback?.key === key) {
      if (activePlayback.audio.paused) {
        await activePlayback.audio.play();
        button.classList.add("is-playing");
      } else {
        activePlayback.audio.pause();
        button.classList.remove("is-playing");
      }
      return;
    }
    stopPlayback();
    const audio = new Audio(url);
    activePlayback = { audio, button, url, key };
    button.classList.add("is-playing");
    audio.addEventListener("ended", () => {
      if (activePlayback?.audio !== audio) return;
      button.classList.remove("is-playing");
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
        const query = new URLSearchParams({
          action: language === "bn" ? "getBengaliAudio" : "getItalianAudio",
          phone: session.phone,
          deviceId: session.deviceId,
          text: String(question.question || "")
        });
        const response = await fetch(`${API}?${query}`, {
          headers: authHeaders({ withQuizSession: true })
        });
        data = await readApiResponse(response);
        if (!data.audio) throw new Error("audio_not_available");
        ttsCache.set(key, data);
      }
      if (language === "bn" && data.translation) {
        const translation = card.querySelector(".study-translation");
        if (translation && !translation.textContent.trim()) translation.textContent = data.translation;
      }
      await startAudio(base64AudioUrl(data.audio), button, key);
    } catch (_) {
      showToast(language === "bn" ? "Audio bangla non disponibile." : "Audio italiano non disponibile.");
    } finally {
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  }

  function speakWord(word) {
    const value = String(word.ttsBn || `${word.bangla}। ${word.simpleBn}`).trim();
    if (!value || !window.speechSynthesis) {
      showToast("Audio parola non disponibile.");
      return;
    }
    stopPlayback();
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = "bn-BD";
    utterance.rate = .82;
    window.speechSynthesis.speak(utterance);
  }

  async function audioApi(action, question, { blob = false } = {}) {
    const response = await fetch(API, {
      method: "POST",
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
      if (!response.ok) throw new Error(`audio_blob_${response.status}`);
      return response.blob();
    }
    return readApiResponse(response);
  }

  function audioStatusKey(question) {
    return String(question?.id || fingerprint(question));
  }

  function paintAudioAvailability(button, available) {
    button.classList.toggle("hidden", available !== true);
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

  async function playExplanation(question, button) {
    const key = `explanation:${question.id || fingerprint(question)}`;
    if (activePlayback?.key === key) {
      await startAudio(activePlayback.url, button, key).catch(() => showToast("Spiegazione audio non disponibile."));
      return;
    }
    button.disabled = true;
    button.classList.add("is-loading");
    try {
      const blob = await audioApi("getQuizAudioBlob", question, { blob: true });
      if (!blob.size) throw new Error("empty_audio_blob");
      await startAudio(URL.createObjectURL(blob), button, key);
    } catch (_) {
      button.classList.add("hidden");
      showToast("Spiegazione audio non disponibile.");
    } finally {
      button.disabled = false;
      button.classList.remove("is-loading");
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
