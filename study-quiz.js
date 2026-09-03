(() => {
  "use strict";

  const TRIAL_MODE = window.location.pathname.replace(/\/+$/, "") === "/studia-quiz/prova-gratis";
  const API = TRIAL_MODE ? "/api/trial" : "/api/quiz";
  const HOME = TRIAL_MODE ? "/prova-gratis" : "/magic-book";
  const TRIAL_ALLOWED_CHAPTERS = new Set([1, 3]);
  const TRIAL_POLICY_VERSION = "chapters-1-3-audio-preview-v2";
  const HELP_MANIFEST_SOURCE = "https://www.tmmbooks.eu/dist/patente/quiz-help-runtime-manifest.json";
  const LOCAL_HELP_SOURCE = "/data/patente/quiz-help-runtime-v2.json";
  const STUDY_HISTORY_KEY = "magicph-study-history-v1";
  const STUDY_RETURN_DELAY_MS = 5 * 60 * 1000;
  const STUDY_INTRO_QUESTION = "আজকে কোন অধ্যায়টি পড়তে চাচ্ছেন ?";
  const BANGLA_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
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
    introTitle: document.getElementById("study-chapters-title"),
    lastChapter: document.getElementById("study-last-chapter"),
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
  let quizSessionTokenExpiresAt = 0;
  let quizSessionRefreshPromise = null;
  let helpPromise = null;
  let helpIdIndex = null;
  let activePlayback = null;
  let activeTtsPlayback = null;
  let pendingExplanation = null;
  let explanationRequestId = 0;
  let toastTimer = 0;
  let loadRequestId = 0;
  let wordTtsRequestId = 0;
  let ttsRequest = null;
  const QUIZ_SESSION_REFRESH_SKEW_MS = 90 * 1000;
  const STUDY_AUDIO_STATUS_DELAY_MS = 400;
  const STUDY_AUDIO_REQUEST_TIMEOUT_MS = 12000;
  const EXPLANATION_AUDIO_SPEED_STEPS = [1, 0.5, 1, 1.25, 1.5, 2];
  const ttsCache = createBoundedCache(48);
  const helpCache = new Map();
  const audioStatusCache = new Map();
  const pendingAudioStatusChecks = new Map();
  const audioFocus = window.MagicAudioFocus;

  function createBoundedCache(maxEntries = 48) {
    const entries = new Map();
    return {
      get(key) {
        if (!entries.has(key)) return undefined;
        const value = entries.get(key);
        entries.delete(key);
        entries.set(key, value);
        return value;
      },
      set(key, value) {
        entries.delete(key);
        entries.set(key, value);
        while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
      },
      clear() { entries.clear(); }
    };
  }

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

  function getTrialSession() {
    try {
      const deviceId = String(sessionStorage.getItem("magicbook_trial_id") || "");
      const guestKey = String(sessionStorage.getItem("magicbook_trial_guest_key") || "");
      const expiresAt = Number(sessionStorage.getItem("magicbook_trial_guest_expires") || 0);
      const policyVersion = String(sessionStorage.getItem("magicbook_trial_guest_policy") || "");
      if (!/^[a-zA-Z0-9_-]{16,80}$/.test(deviceId) || !guestKey || expiresAt <= Date.now() || policyVersion !== TRIAL_POLICY_VERSION) return null;
      return { phone: "trial", deviceId, guestKey, accessToken: "" };
    } catch (_) {
      return null;
    }
  }

  function trialOfferUrl(feature) {
    return `/?trialOffer=1&feature=${encodeURIComponent(String(feature || "Studia quiz"))}`;
  }

  const session = TRIAL_MODE ? getTrialSession() : getSession();
  if (!session) {
    window.location.replace(TRIAL_MODE ? trialOfferUrl("Prova gratuita scaduta") : HOME);
    return;
  }
  document.body.classList.toggle("study-trial-mode", TRIAL_MODE);
  if (TRIAL_MODE) {
    const headerKicker = document.querySelector(".study-heading small");
    const practiceLink = document.querySelector(".study-practice-link");
    if (headerKicker) headerKicker.textContent = "PROVA GRATUITA · 7 GIORNI";
    if (practiceLink) practiceLink.href = "/quiz/prova-gratis?chapter=1";
  }

  function accessToken() {
    if (TRIAL_MODE) return "";
    try {
      return String(localStorage.getItem("accessToken") || session.accessToken || "");
    } catch (_) {
      return session.accessToken || "";
    }
  }

  function saveAccessToken(token, expiresAt) {
    if (TRIAL_MODE) return;
    if (!token || !expiresAt) return;
    session.accessToken = token;
    try {
      localStorage.setItem("accessToken", token);
      localStorage.setItem("accessTokenExpiresAt", String(expiresAt));
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
    if (TRIAL_MODE) {
      try {
        ["magicbook_trial_guest_key", "magicbook_trial_guest_expires", "magicbook_trial_guest_policy"]
          .forEach(key => sessionStorage.removeItem(key));
      } catch (_) {}
      window.location.replace(trialOfferUrl("Prova gratuita scaduta"));
      return;
    }
    ["loggedIn", "phone", "expiry", "user_session", "session", "accessToken", "accessTokenExpiresAt"]
      .forEach(key => localStorage.removeItem(key));
    window.location.replace(HOME);
  }

  async function readApiResponse(response) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      const code = String(data.error || "unauthorized");
      if (["expired", "not_found", "device_replaced", "device_mismatch", "unauthorized", "invalid_guest_key", "trial_session_expired"].includes(code)) {
        clearSessionAndExit();
      }
      throw new Error(code);
    }
    if (!response.ok) throw new Error(data.error || `study_api_${response.status}`);
    return data;
  }

  function quizApiAction(url) {
    try {
      return new URL(url, window.location.origin).searchParams.get("action") || "";
    } catch (_) {
      return "";
    }
  }

  function isQuizSessionProtectedAction(action) {
    return ["getItalianAudio", "getBengaliAudio", "getTTS"].includes(String(action || ""));
  }

  async function refreshQuizSession() {
    if (TRIAL_MODE) return { ok: false, error: new Error("trial_session_refresh_not_needed") };
    if (quizSessionRefreshPromise) return quizSessionRefreshPromise;

    quizSessionRefreshPromise = (async () => {
      const response = await fetch(API, {
        method: "POST",
        headers: authHeaders({ withQuizSession: true, json: true }),
        body: JSON.stringify({
          action: "refreshQuizSession",
          phone: session.phone,
          deviceId: session.deviceId,
          chapters: String(currentChapter || ""),
          mode: ""
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(String(data?.error || `study_session_refresh_${response.status}`));
        error.status = response.status;
        throw error;
      }
      if (!data?.quizSessionToken || !data?.quizSessionTokenExpiresAt) {
        throw new Error("invalid_quiz_session_refresh");
      }
      saveAccessToken(data.accessToken, data.accessTokenExpiresAt);
      quizSessionToken = String(data.quizSessionToken);
      quizSessionTokenExpiresAt = Number(data.quizSessionTokenExpiresAt) || 0;
      return { ok: true };
    })()
      .then(result => result)
      .catch(error => ({ ok: false, error }))
      .finally(() => { quizSessionRefreshPromise = null; });

    return quizSessionRefreshPromise;
  }

  async function ensureFreshQuizSession() {
    if (TRIAL_MODE || !quizSessionToken || !quizSessionTokenExpiresAt) return { ok: true };
    if (quizSessionTokenExpiresAt > Date.now() + QUIZ_SESSION_REFRESH_SKEW_MS) return { ok: true };
    return refreshQuizSession();
  }

  async function fetchStudyJson(url, options = {}) {
    const { allowSessionRefresh = true, ...fetchOptions } = options;
    const action = quizApiAction(url);
    if (allowSessionRefresh && !TRIAL_MODE && isQuizSessionProtectedAction(action)) {
      const freshSession = await ensureFreshQuizSession();
      if (!freshSession.ok && [401, 403].includes(Number(freshSession.error?.status))) {
        clearSessionAndExit();
        throw freshSession.error;
      }
    }

    const requestHeaders = new Headers(fetchOptions.headers || {});
    if (!TRIAL_MODE && isQuizSessionProtectedAction(action)) {
      const currentAuthHeaders = authHeaders({ withQuizSession: true });
      if (currentAuthHeaders.has("Authorization")) {
        requestHeaders.set("Authorization", currentAuthHeaders.get("Authorization"));
      } else {
        requestHeaders.delete("Authorization");
      }
      if (currentAuthHeaders.has("X-Quiz-Session")) {
        requestHeaders.set("X-Quiz-Session", currentAuthHeaders.get("X-Quiz-Session"));
      } else {
        requestHeaders.delete("X-Quiz-Session");
      }
    }

    const response = await fetch(url, { ...fetchOptions, headers: requestHeaders });
    const data = await response.json().catch(() => ({}));
    const error = String(data?.error || "");
    if (
      allowSessionRefresh
      && !TRIAL_MODE
      && isQuizSessionProtectedAction(action)
      && (error === "quiz_session_expired" || error === "token_expired")
    ) {
      const refreshed = await refreshQuizSession();
      if (refreshed.ok) return fetchStudyJson(url, { ...fetchOptions, allowSessionRefresh: false });
      if ([401, 403].includes(Number(refreshed.error?.status))) clearSessionAndExit();
      throw new Error("quiz_session_refresh_unavailable");
    }
    if (!response.ok) {
      if ([401, 403].includes(response.status)) {
        if (["expired", "not_found", "device_replaced", "device_mismatch", "unauthorized", "invalid_guest_key", "trial_session_expired"].includes(error)) {
          clearSessionAndExit();
        }
        throw new Error(error || "unauthorized");
      }
      throw new Error(error || `study_api_${response.status}`);
    }
    return data;
  }

  function chapterFromLocation() {
    const match = window.location.pathname.replace(/\/+$/, "").match(/^\/studia-quiz\/capitolo-(\d{1,2})$/);
    const value = match?.[1] || new URLSearchParams(window.location.search).get("chapter") || "";
    const chapter = Number(value);
    return Number.isInteger(chapter) && chapter >= 1 && chapter <= CHAPTERS.length ? chapter : null;
  }

  function chapterPath(chapter) {
    if (TRIAL_MODE) return `/studia-quiz/prova-gratis?chapter=${Number(chapter)}`;
    return `/studia-quiz/capitolo-${String(chapter).padStart(2, "0")}`;
  }

  function toBanglaNumber(value) {
    return String(value).replace(/\d/g, digit => BANGLA_DIGITS[Number(digit)]);
  }

  function readStudyHistory() {
    try {
      const stored = JSON.parse(localStorage.getItem(STUDY_HISTORY_KEY) || "null");
      const chapter = Number(stored?.chapter);
      const leftAt = Number(stored?.leftAt);
      if (!Number.isInteger(chapter) || chapter < 1 || chapter > CHAPTERS.length) return null;
      return { chapter, leftAt: Number.isFinite(leftAt) && leftAt > 0 ? leftAt : 0 };
    } catch (_) {
      return null;
    }
  }

  function rememberStudyChapter(chapter) {
    try {
      localStorage.setItem(STUDY_HISTORY_KEY, JSON.stringify({ chapter, leftAt: 0 }));
    } catch (_) {}
  }

  function markStudyChapterExit(chapter) {
    const history = readStudyHistory();
    if (!history || history.chapter !== chapter) return;
    try {
      localStorage.setItem(STUDY_HISTORY_KEY, JSON.stringify({ chapter, leftAt: Date.now() }));
    } catch (_) {}
  }

  function renderStudyIntro(now = Date.now()) {
    if (elements.introTitle) elements.introTitle.textContent = STUDY_INTRO_QUESTION;
    if (!elements.lastChapter) return;
    const history = readStudyHistory();
    const showLastChapter = Boolean(
      history?.leftAt && now - history.leftAt >= STUDY_RETURN_DELAY_MS
    );
    elements.lastChapter.textContent = showLastChapter
      ? `শেষবার আপনি পড়েছিলেন অধ্যায় ${toBanglaNumber(history.chapter)}`
      : "";
    elements.lastChapter.classList.toggle("hidden", !showLastChapter);
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
      const trialChapterOpen = !TRIAL_MODE || TRIAL_ALLOWED_CHAPTERS.has(chapter);
      button.classList.toggle("is-trial-open", TRIAL_MODE && trialChapterOpen);
      button.classList.toggle("is-trial-locked", TRIAL_MODE && !trialChapterOpen);
      button.setAttribute("aria-label", trialChapterOpen
        ? `Studia il capitolo ${chapter}: ${name}`
        : `Capitolo ${chapter} bloccato. Scopri i pacchetti MagicBook.`);

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
      if (trialChapterOpen) arrow.appendChild(arrowIcon);
      else arrow.textContent = "🔒";
      button.append(number, copy, arrow);
      button.addEventListener("click", () => {
        if (!trialChapterOpen) {
          window.location.href = trialOfferUrl(`Studia quiz · Capitolo ${chapter}`);
          return;
        }
        openChapter(chapter);
      });
      fragment.appendChild(button);
    });
    elements.chapterGrid.replaceChildren(fragment);
  }

  function showPicker({ updateHistory = false } = {}) {
    loadRequestId += 1;
    resetAudioObservation();
    if (currentChapter) markStudyChapterExit(currentChapter);
    currentChapter = null;
    questions = [];
    stopPlayback();
    elements.loading.classList.add("hidden");
    elements.error.classList.add("hidden");
    elements.reader.classList.add("hidden");
    elements.chapters.classList.remove("hidden");
    elements.title.textContent = "Studia quiz";
    elements.subtitle.textContent = TRIAL_MODE
      ? "Capitoli 1 e 3 gratuiti per sette giorni, con una selezione di audio."
      : "Scegli un capitolo e studia tutte le domande.";
    renderStudyIntro();
    document.title = "MagicBook | Studia quiz";
    if (updateHistory) history.pushState({ screen: "study" }, "", TRIAL_MODE ? "/studia-quiz/prova-gratis" : "/studia-quiz");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function openChapter(chapter, { updateHistory = true } = {}) {
    if (!Number.isInteger(chapter) || chapter < 1 || chapter > CHAPTERS.length) return;
    if (TRIAL_MODE && !TRIAL_ALLOWED_CHAPTERS.has(chapter)) {
      window.location.href = trialOfferUrl(`Studia quiz · Capitolo ${chapter}`);
      return;
    }
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
      const query = new URLSearchParams(TRIAL_MODE ? {
        action: "getStudyQuiz",
        trialId: session.deviceId,
        guestKey: session.guestKey,
        chapter: String(chapter)
      } : {
        action: "getStudyQuiz",
        phone: session.phone,
        deviceId: session.deviceId,
        chapters: String(chapter)
      });
      const data = await fetchStudyJson(`${API}?${query}`, {
        headers: authHeaders(),
        cache: "no-store"
      });
      if (ownRequest !== loadRequestId) return;
      saveAccessToken(data.accessToken, data.accessTokenExpiresAt);
      quizSessionToken = String((TRIAL_MODE ? data.trialToken : data.quizSessionToken) || "");
      quizSessionTokenExpiresAt = Number((TRIAL_MODE ? data.trialTokenExpiresAt : data.quizSessionTokenExpiresAt) || 0);
      questions = Array.isArray(data.quiz) ? data.quiz : [];
      renderQuestions();
      rememberStudyChapter(chapter);
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
    button.className = `study-action magic-loading-control ${className}`;
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
    const surface = document.createElement("div");
    surface.className = "study-explanation-media hidden";

    const artwork = document.createElement("img");
    artwork.className = "study-explanation-artwork";
    artwork.src = "icons/explain_quiz.svg";
    artwork.alt = "";
    artwork.setAttribute("aria-hidden", "true");
    artwork.width = 50;
    artwork.height = 50;
    artwork.loading = "lazy";
    artwork.decoding = "async";
    artwork.draggable = false;

    const root = document.createElement("div");
    root.className = "study-explanation-player magic-loading-host";
    root.setAttribute("role", "group");
    const audioLabel = `Spiegazione audio della domanda ${index + 1}`;
    root.setAttribute("aria-label", audioLabel);

    const play = document.createElement("button");
    play.type = "button";
    play.className = "study-explanation-play magic-loading-control";
    play.setAttribute("aria-label", "Riproduci spiegazione");
    play.innerHTML = `
      <svg class="audio-player-icon audio-player-icon--play" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M9.5 8.96533C9.5 8.48805 9.5 8.24941 9.59974 8.11618C9.68666 8.00007 9.81971 7.92744 9.96438 7.9171C10.1304 7.90525 10.3311 8.03429 10.7326 8.29239L15.4532 11.3271C15.8016 11.551 15.9758 11.663 16.0359 11.8054C16.0885 11.9298 16.0885 12.0702 16.0359 12.1946C15.9758 12.337 15.8016 12.449 15.4532 12.6729L10.7326 15.7076C10.3311 15.9657 10.1304 16.0948 9.96438 16.0829C9.81971 16.0726 9.68666 15.9999 9.59974 15.8838C9.5 15.7506 9.5 15.512 9.5 15.0347V8.96533Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <svg class="audio-player-icon audio-player-icon--pause" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <path d="M9.5 15V9M14.5 15V9M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

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
      surface,
      root,
      artwork,
      play,
      progress,
      speed,
      speedStep: 0,
      speedValue: EXPLANATION_AUDIO_SPEED_STEPS[0],
      audioLabel,
      key: `explanation:${question.id || fingerprint(question)}`
    };
    play.addEventListener("click", () => playExplanation(question, controls));
    progress.addEventListener("input", () => seekExplanation(controls));
    speed.addEventListener("click", () => changeExplanationSpeed(controls));
    root.append(play, progress, speed);
    surface.append(artwork, root);
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
      const figure = document.createElement("div");
      figure.className = "study-figure-frame";
      const image = document.createElement("img");
      image.className = "study-figure";
      image.loading = "lazy";
      image.alt = `Figura della domanda ${index + 1}`;
      image.src = assetUrl(question.figure);
      image.addEventListener("error", () => figure.remove(), { once: true });
      figure.appendChild(image);
      main.appendChild(figure);
    }

    const text = document.createElement("p");
    text.className = "study-question-text notranslate";
    text.translate = false;
    text.lang = "it";
    text.textContent = String(question.question || "");
    main.appendChild(text);

    const actions = document.createElement("div");
    actions.className = "study-actions";
    const trialAudioAvailable = !TRIAL_MODE || question.trialAudioPreview === true;
    const italian = actionButton("study-action-italian", "Italiano", "audio-action");
    italian.classList.toggle("is-trial-preview", TRIAL_MODE && trialAudioAvailable);
    italian.classList.toggle("is-trial-locked", TRIAL_MODE && !trialAudioAvailable);
    italian.setAttribute("aria-label", trialAudioAvailable
      ? `Ascolta in italiano la domanda ${index + 1}`
      : `Audio italiano Premium per la domanda ${index + 1}`);
    italian.addEventListener("click", () => {
      if (!trialAudioAvailable) window.location.href = trialOfferUrl("Audio italiano completo");
      else playTts(question, "it", italian, card);
    });
    const bangla = actionButton("study-action-bangla", "বাংলা", "audio-action");
    bangla.lang = "bn";
    bangla.classList.toggle("is-trial-preview", TRIAL_MODE && trialAudioAvailable);
    bangla.classList.toggle("is-trial-locked", TRIAL_MODE && !trialAudioAvailable);
    bangla.setAttribute("aria-label", trialAudioAvailable
      ? `Ascolta in bengali la domanda ${index + 1}`
      : `Audio Bengali Premium per la domanda ${index + 1}`);
    bangla.addEventListener("click", () => {
      if (!trialAudioAvailable) window.location.href = trialOfferUrl("Audio Bengali completo");
      else playTts(question, "bn", bangla, card);
    });
    const explanation = createExplanationPlayer(question, index);
    const lockedExplanation = TRIAL_MODE
      ? actionButton("study-action-locked", "Spiegazione audio Premium", "🔒")
      : null;
    lockedExplanation?.addEventListener("click", () => {
      window.location.href = trialOfferUrl("Spiegazioni audio complete");
    });
    const help = actionButton("study-action-help", "Traduzione e parole chiave", "文");
    help.setAttribute("aria-expanded", "false");
    help.addEventListener("click", () => toggleHelp(question, card, help));
    actions.append(italian, bangla, lockedExplanation || explanation.surface, help);
    main.appendChild(actions);
    card.appendChild(main);
    if (!TRIAL_MODE) observeAudioAvailability(card, question, explanation.surface);
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
      helpPromise = remote
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

  const prewarmHelpLibrary = () => loadHelpLibrary().catch(() => {});
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(prewarmHelpLibrary, { timeout: 1500 });
  } else {
    window.setTimeout(prewarmHelpLibrary, 500);
  }

  function displayForm(question, canonical, aliases = []) {
    const normalizedQuestion = ` ${normalize(question)} `;
    return [...new Set([...(aliases || []), canonical])]
      .filter(Boolean)
      .sort((left, right) => right.length - left.length)
      .find(candidate => normalizedQuestion.includes(` ${normalize(candidate)} `)) || canonical;
  }

  function visibleKeywords(words = []) {
    const grammar = window.PatenteGlossaryResolver;
    if (!grammar?.isGrammarHidden) return words.filter(Boolean);
    return words.filter(word => word && !grammar.isGrammarHidden({
      canonical_italian: word.canonicalItalian || word.italian,
      lemma: word.lemma || word.canonicalItalian || word.italian,
      type: word.type || "word"
    }, {
      surface: word.italian || word.canonicalItalian
    }));
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
        resolved.questionBnStandard || resolved.questionBnEasy || resolved.questionBn
      );
      return {
        ...resolved,
        words: visibleKeywords(resolved.words),
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
    const words = visibleKeywords(wordIds.map(id => {
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
    }));
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

  async function loadAutomaticTranslation(question) {
    const key = `bn:${question.id || fingerprint(question)}`;
    const cached = ttsCache.get(key);
    if (cached?.translation && cached?.translationSource === "automatic") return cached;

    const query = new URLSearchParams(TRIAL_MODE ? {
      action: "getBengaliAudio",
      trialId: session.deviceId,
      trialToken: quizSessionToken,
      questionId: String(question.id || ""),
      text: String(question.question || "")
    } : {
      action: "getBengaliAudio",
      phone: session.phone,
      deviceId: session.deviceId,
      questionId: String(question.id || ""),
      text: String(question.question || "")
    });
    const data = await fetchStudyJson(`${API}?${query}`, {
      headers: authHeaders({ withQuizSession: true }),
      cache: "no-store"
    });
    const translation = usableBanglaTranslation(data?.translation);
    if (!translation) throw new Error("translation_not_available");
    const translated = { ...data, translation, translationSource: "automatic" };
    if (translated.audio) ttsCache.set(key, translated);
    return translated;
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
    if (!usableBanglaTranslation(help.translation)) {
      try {
        const automatic = await loadAutomaticTranslation(question);
        help.translation = automatic.translation;
        help.translationSource = "automatic";
      } catch (_) {}
    }
    helpCache.set(key, help);
    return help;
  }

  function helpSkeleton() {
    const section = document.createElement("section");
    section.className = "study-help";
    section.setAttribute("aria-busy", "true");
    section.innerHTML = `
      <div class="magic-loading-indicator magic-loading-indicator--panel" role="status">
        <span class="magic-loading-indicator__media" aria-hidden="true"><img class="magic-loading-indicator__image" src="icons/loading.gif" alt=""></span>
        <span class="magic-loading-indicator__label">Caricamento traduzione…</span>
      </div>`;
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
    const translationSection = helpSection(help?.translationSource === "automatic"
      ? "TRADUZIONE BANGLA · BACKUP AUTOMATICO"
      : "TRADUZIONE BANGLA");
    const translation = document.createElement("p");
    translation.className = "study-translation";
    translation.lang = "bn";
    const verifiedTranslation = String(help?.translation || "").trim();
    translation.classList.toggle("is-missing", !verifiedTranslation);
    translation.dataset.translationState = verifiedTranslation ? "ready" : "missing";
    translation.textContent = verifiedTranslation || "Traduzione non disponibile al momento.";
    translationSection.appendChild(translation);
    container.appendChild(translationSection);

    let context = null;
    if (help?.chapter?.italian || help?.topic?.italian) {
      context = document.createElement("div");
      context.className = "study-context";
      context.setAttribute("aria-label", "Capitolo e argomento");
      [
        { value: help.chapter?.italian, language: "it" },
        { value: help.topic?.italian, language: "it" },
        { value: help.chapter?.bangla, language: "bn" },
        { value: help.topic?.bangla, language: "bn" }
      ].filter(item => item.value).forEach(item => {
          const tag = document.createElement("span");
          tag.lang = item.language;
          tag.textContent = item.language === "it"
            ? window.MagicItalianDisplay.uppercase(item.value)
            : item.value;
          context.appendChild(tag);
        });
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
        italian.textContent = window.MagicItalianDisplay.initialUppercase(word.italian);
        const bangla = document.createElement("span");
        bangla.lang = "bn";
        bangla.textContent = word.bangla;
        button.append(italian, bangla);
        button.addEventListener("click", () => renderWordDetail(word, detail));
        words.appendChild(button);
      });
    }
    wordsSection.appendChild(words);
    wordsSection.appendChild(detail);
    container.appendChild(wordsSection);
    if (context) container.appendChild(context);
    return container;
  }

  function renderWordDetail(word, detail) {
    detail.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = `${window.MagicItalianDisplay.initialUppercase(word.italian)} · ${word.bangla}`;
    const italian = document.createElement("p");
    italian.textContent = window.MagicItalianDisplay.initialUppercase(word.simpleIt);
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
    controls.speedStep = (controls.speedStep + 1) % EXPLANATION_AUDIO_SPEED_STEPS.length;
    controls.speedValue = EXPLANATION_AUDIO_SPEED_STEPS[controls.speedStep];
    controls.speed.textContent = `${String(controls.speedValue).replace(".", ",")}\u00d7`;
    controls.speed.setAttribute("aria-label", `Velocit\u00e0 ${controls.speedValue}x`);
    if (activePlayback?.key === controls.key) activePlayback.audio.playbackRate = controls.speedValue;
  }

  function setExplanationPlaying(controls, isPlaying) {
    controls?.root.classList.toggle("is-playing", isPlaying);
    controls?.play.classList.toggle("is-playing", isPlaying);
    controls?.play.setAttribute("aria-label", isPlaying ? "Metti in pausa la spiegazione" : "Riproduci spiegazione");
    controls?.artwork.classList.toggle("is-spinning", isPlaying);
  }

  function setExplanationSuspended(playback, isSuspended) {
    if (!playback?.controls) return;
    const { controls } = playback;
    controls.root.classList.toggle("is-interrupted", isSuspended);
    controls.surface.classList.toggle("is-interrupted", isSuspended);
    controls.root.setAttribute(
      "aria-label",
      isSuspended ? "Spiegazione in pausa durante l'altro audio" : controls.audioLabel
    );
    if (isSuspended) {
      controls.play.setAttribute("aria-label", "Riprendi ora la spiegazione");
    } else {
      setExplanationPlaying(controls, !playback.audio.paused && !playback.audio.ended);
    }
  }

  function createExplanationFocusAdapter(playback) {
    return Object.freeze({
      isPlaying: () => activePlayback === playback && !playback.audio.paused && !playback.audio.ended,
      canResume: () => activePlayback === playback && playback.audio.hasAttribute("src") && !playback.audio.ended,
      pause: () => {
        if (activePlayback === playback) playback.audio.pause();
      },
      resume: async (_reason, isCurrent = () => true) => {
        if (activePlayback !== playback || playback.audio.ended || !isCurrent()) return;
        playback.audio.playbackRate = playback.controls.speedValue;
        await playback.audio.play();
      },
      setSuspended: value => setExplanationSuspended(playback, value)
    });
  }

  function disposeExplanationPlayback(playback = activePlayback) {
    if (!playback) return;
    if (activePlayback === playback) activePlayback = null;
    audioFocus?.clearResumable(playback.focusAdapter);
    if (playback.frame) cancelAnimationFrame(playback.frame);
    playback.audio.pause();
    playback.audio.removeAttribute("src");
    playback.audio.load();
    playback.button?.classList.remove("is-playing");
    setExplanationPlaying(playback.controls, false);
    setExplanationSuspended(playback, false);
    playback.controls?.root.classList.remove("is-loading");
    if (playback.controls) {
      playback.controls.progress.value = "0";
      playback.controls.progress.style.setProperty("--progress", "0%");
    }
    if (playback.url) URL.revokeObjectURL(playback.url);
  }

  function cancelPendingExplanation() {
    explanationRequestId += 1;
    const pending = pendingExplanation;
    pendingExplanation = null;
    if (!pending) return;
    pending.controller?.abort();
    pending.button.disabled = false;
    pending.button.removeAttribute("aria-busy");
    pending.root.classList.remove("is-loading");
  }

  window.cancelPendingStudyExplanationAudio = cancelPendingExplanation;

  function disposeStudyTts(playback) {
    if (!playback) return;
    if (activeTtsPlayback === playback) activeTtsPlayback = null;
    wordTtsRequestId += 1;
    cancelTtsRequest();
    playback.controller?.abort();
    playback.audio?.pause();
    playback.audio?.removeAttribute("src");
    playback.audio?.load();
    playback.button?.classList.remove("is-playing", "is-loading");
    playback.button?.removeAttribute("aria-busy");
    if (playback.button) playback.button.disabled = false;
    if (playback.url) URL.revokeObjectURL(playback.url);
  }

  function stopStudyTts({ resume = false, reason = "manual" } = {}) {
    const playback = activeTtsPlayback;
    if (!playback) return;
    if (playback.focusToken && audioFocus?.isCurrent(playback.focusToken)) {
      void audioFocus.cancelTransient(playback.focusToken, { resume, reason });
      return;
    }
    disposeStudyTts(playback);
  }

  function completeStudyTts(playback, { resume = true } = {}) {
    if (!playback || activeTtsPlayback !== playback) return false;
    disposeStudyTts(playback);
    if (playback.focusToken && audioFocus) {
      void audioFocus.completeTransient(playback.focusToken, { resume });
    }
    return true;
  }

  function stopPlayback() {
    audioFocus?.cancelAll();
    cancelPendingExplanation();
    cancelTtsRequest();
    disposeStudyTts(activeTtsPlayback);
    disposeExplanationPlayback(activePlayback);
  }

  const MAX_INLINE_TTS_BYTES = 3 * 1024 * 1024;

  function base64AudioUrl(base64, mimeType = "audio/mpeg") {
    const encoded = String(base64 || "").replace(/^data:[^,]+,/, "");
    if (!encoded || encoded.length > Math.ceil(MAX_INLINE_TTS_BYTES * 4 / 3) + 16) {
      throw new Error("audio_payload_too_large");
    }
    const binary = atob(encoded);
    if (binary.length > MAX_INLINE_TTS_BYTES) throw new Error("audio_payload_too_large");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  }

  function cancelTtsRequest() {
    ttsRequest?.controller.abort();
    ttsRequest = null;
  }

  function requestTtsData(key, work) {
    if (ttsRequest?.key === key) return ttsRequest.promise;
    cancelTtsRequest();
    const controller = new AbortController();
    const request = { key, controller, promise: null };
    request.promise = Promise.resolve()
      .then(() => work(controller.signal))
      .finally(() => {
        if (ttsRequest === request) ttsRequest = null;
      });
    ttsRequest = request;
    return request.promise;
  }

  async function startExplanationAudio(url, button, key, controls, durationHint = 0) {
    if (activePlayback?.key === key) {
      audioFocus?.claimResumable(activePlayback.focusAdapter);
      if (activePlayback.audio.paused) {
        await activePlayback.audio.play();
      } else {
        audioFocus?.markManualPause(activePlayback.focusAdapter);
        activePlayback.audio.pause();
      }
      return;
    }
    audioFocus?.claimResumable(activePlayback?.focusAdapter);
    disposeExplanationPlayback(activePlayback);
    const audio = new Audio(url);
    audio.preload = "metadata";
    audio.playbackRate = controls.speedValue;
    const playback = { audio, button, url, key, controls, durationHint, frame: 0, focusAdapter: null };
    playback.focusAdapter = createExplanationFocusAdapter(playback);
    activePlayback = playback;
    audioFocus?.setResumable(playback.focusAdapter);
    audio.addEventListener("play", () => {
      if (activePlayback?.audio !== audio) return;
      audioFocus?.setResumable(playback.focusAdapter);
      button.classList.add("is-playing");
      setExplanationPlaying(controls, true);
      if (activePlayback.frame) cancelAnimationFrame(activePlayback.frame);
      activePlayback.frame = requestAnimationFrame(animateExplanationProgress);
    });
    audio.addEventListener("pause", () => {
      if (activePlayback?.audio !== audio) return;
      button.classList.remove("is-playing");
      setExplanationPlaying(controls, false);
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
      disposeExplanationPlayback(playback);
    }, { once: true });
    audio.addEventListener("error", () => {
      if (activePlayback?.audio === audio) {
        disposeExplanationPlayback(playback);
        showToast("Audio non disponibile al momento.");
      }
    }, { once: true });
    try {
      await audio.play();
    } catch (error) {
      if (activePlayback?.audio === audio) disposeExplanationPlayback(playback);
      throw error;
    }
  }

  function beginStudyTts(key, button) {
    cancelPendingExplanation();
    const controller = new AbortController();
    const playback = { audio: null, url: "", button, key, controller, focusToken: null };
    if (audioFocus) {
      playback.focusToken = audioFocus.beginTransient({
        key: `study:${key}`,
        stop: () => disposeStudyTts(playback)
      });
    } else {
      stopStudyTts({ resume: false, reason: "superseded" });
      activePlayback?.audio.pause();
    }
    activeTtsPlayback = playback;
    const requestId = ++wordTtsRequestId;
    button.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
    return { playback, requestId };
  }

  async function startTtsAudio(playback, url) {
    if (!playback || activeTtsPlayback !== playback) {
      URL.revokeObjectURL(url);
      return;
    }
    const audio = new Audio(url);
    playback.audio = audio;
    playback.url = url;
    audio.addEventListener("play", () => {
      if (activeTtsPlayback === playback) playback.button.classList.add("is-playing");
    });
    audio.addEventListener("ended", () => completeStudyTts(playback, { resume: true }), { once: true });
    audio.addEventListener("error", () => {
      if (completeStudyTts(playback, { resume: true })) showToast("Audio non disponibile al momento.");
    }, { once: true });
    playback.button.classList.remove("is-loading");
    playback.button.removeAttribute("aria-busy");
    playback.button.disabled = false;
    await audio.play();
  }

  async function playTts(question, language, button, card) {
    if (TRIAL_MODE && question.trialAudioPreview !== true) {
      window.location.href = trialOfferUrl(language === "bn" ? "Audio Bengali completo" : "Audio italiano completo");
      return;
    }
    const key = `${language}:${question.id || fingerprint(question)}`;
    if (activeTtsPlayback?.key === key) {
      stopStudyTts({ resume: false, reason: "manual" });
      return;
    }
    const { playback, requestId: ownRequest } = beginStudyTts(key, button);
    try {
      let data = ttsCache.get(key);
      if (!data) {
        data = await requestTtsData(key, async signal => {
          let preferredTranslation = "";
          let preferredTranslationSource = "";
          let automaticBackup = false;
          if (language === "bn") {
            const help = await getQuestionHelp(question);
            preferredTranslation = usableBanglaTranslation(help?.translation);
            preferredTranslationSource = String(help?.translationSource || "runtime_v3");
            const trialCatalogTranslation = TRIAL_MODE
              ? usableBanglaTranslation(question.question_bd || question.questionBD)
              : "";
            if (trialCatalogTranslation) {
              preferredTranslation = trialCatalogTranslation;
              preferredTranslationSource = String(question.questionTranslationSource || "catalog");
            }
            automaticBackup = preferredTranslationSource === "automatic";
            if (!preferredTranslation) throw new Error("translation_not_available");
          }
          if (signal.aborted) throw new DOMException("The TTS request was aborted", "AbortError");
          const action = language === "bn"
            ? (automaticBackup ? "getBengaliAudio" : "getTTS")
            : "getItalianAudio";
          const requestText = automaticBackup
            ? String(question.question || "")
            : (preferredTranslation || String(question.question || ""));
          const query = new URLSearchParams(TRIAL_MODE ? {
            action,
            trialId: session.deviceId,
            trialToken: quizSessionToken,
            questionId: String(question.id || ""),
            text: requestText
          } : {
            action,
            phone: session.phone,
            deviceId: session.deviceId,
            questionId: String(question.id || ""),
            text: requestText
          });
          const data = await fetchStudyJson(`${API}?${query}`, {
            headers: authHeaders({ withQuizSession: true }),
            signal
          });
          if (!data.audio) throw new Error("audio_not_available");
          if (preferredTranslation && !automaticBackup) {
            return {
              ...data,
              translation: preferredTranslation,
              translationSource: preferredTranslationSource
            };
          }
          return data;
        });
        ttsCache.set(key, data);
      }
      if (ownRequest !== wordTtsRequestId || activeTtsPlayback !== playback) return;
      const safeTranslation = language === "bn" ? usableBanglaTranslation(data.translation) : "";
      if (safeTranslation) {
        const translation = card.querySelector(".study-translation");
        if (translation && (translation.dataset.translationState === "missing" || !translation.textContent.trim())) {
          translation.textContent = safeTranslation;
          translation.dataset.translationState = "ready";
          translation.classList.remove("is-missing");
        }
      }
      await startTtsAudio(playback, base64AudioUrl(data.audio));
    } catch (error) {
      if (error?.name === "AbortError" || ownRequest !== wordTtsRequestId || activeTtsPlayback !== playback) return;
      const missingTranslation = error?.message === "translation_not_available";
      if (completeStudyTts(playback, { resume: true })) {
        showToast(language === "bn"
          ? (missingTranslation ? "Traduzione non disponibile al momento." : "Audio bangla non disponibile.")
          : "Audio italiano non disponibile.");
      }
    }
  }

  async function playBanglaWord(word, button) {
    if (TRIAL_MODE) {
      window.location.href = trialOfferUrl("Audio parole e ripasso completo");
      return;
    }
    const value = usableBanglaTranslation(word.ttsBn || `${word.bangla}। ${word.simpleBn}`);
    if (!value) {
      showToast("Audio parola non disponibile.");
      return;
    }

    const key = `bn-word:${hash(value)}`;
    if (activeTtsPlayback?.key === key) {
      stopStudyTts({ resume: false, reason: "manual" });
      return;
    }

    const { playback, requestId: ownRequest } = beginStudyTts(key, button);
    try {
      let data = ttsCache.get(key);
      if (!data) {
        data = await requestTtsData(key, async signal => {
          const query = new URLSearchParams({
            action: "getTTS",
            phone: session.phone,
            deviceId: session.deviceId,
            text: value
          });
          const result = await fetchStudyJson(`${API}?${query}`, {
            headers: authHeaders({ withQuizSession: true }),
            signal
          });
          if (!result.audio) throw new Error("audio_not_available");
          return result;
        });
        ttsCache.set(key, data);
      }
      if (ownRequest !== wordTtsRequestId || activeTtsPlayback !== playback) return;
      await startTtsAudio(playback, base64AudioUrl(data.audio));
    } catch (error) {
      if (error?.name === "AbortError" || ownRequest !== wordTtsRequestId || activeTtsPlayback !== playback) return;
      if (completeStudyTts(playback, { resume: true })) showToast("Audio parola non disponibile.");
    }
  }

  function createTimedAudioRequest(parentSignal) {
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    if (parentSignal?.aborted) abortFromParent();
    else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
    const timeoutId = window.setTimeout(() => controller.abort(), STUDY_AUDIO_REQUEST_TIMEOUT_MS);
    return {
      signal: controller.signal,
      cleanup() {
        window.clearTimeout(timeoutId);
        parentSignal?.removeEventListener("abort", abortFromParent);
      }
    };
  }

  async function audioApi(action, question, { blob = false, signal } = {}) {
    if (TRIAL_MODE) throw new Error("trial_premium_audio");
    const request = createTimedAudioRequest(signal);
    try {
      const response = await fetch(API, {
        method: "POST",
        signal: request.signal,
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
      request.cleanup();
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
    const { root, play: button, key } = controls;
    if (pendingExplanation?.controls === controls) {
      cancelPendingExplanation();
      return;
    }
    cancelPendingExplanation();
    if (audioFocus) audioFocus.claimResumable(activePlayback?.focusAdapter);
    else stopStudyTts({ resume: false, reason: "resumable-request" });
    if (activePlayback?.key === key) {
      await startExplanationAudio(activePlayback.url, button, key, controls, activePlayback.durationHint)
        .catch(() => showToast("Spiegazione audio non disponibile."));
      return;
    }
    const request = {
      id: ++explanationRequestId,
      root,
      button,
      controls,
      controller: new AbortController()
    };
    pendingExplanation = request;
    button.disabled = true;
    root.classList.remove("is-error");
    root.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
    try {
      const source = await fetchExplanationBlob(question, { signal: request.controller.signal });
      if (pendingExplanation !== request || request.id !== explanationRequestId) return;
      if (!source.blob.size) throw new Error("empty_audio_blob");
      await startExplanationAudio(URL.createObjectURL(source.blob), button, key, controls, source.durationMs / 1000);
    } catch (error) {
      if (pendingExplanation !== request || request.id !== explanationRequestId) return;
      if (error?.name === "AbortError") return;
      const code = String(error?.message || "");
      const definitelyMissing = code === "quiz_audio_not_found" || code === "audio_blob_404";
      if (definitelyMissing) {
        audioStatusCache.set(audioStatusKey(question), false);
        paintAudioAvailability(controls.surface, false);
        showToast("Questa spiegazione audio non è disponibile.");
      } else {
        root.classList.add("is-error");
        root.dataset.audioState = "retry";
        showToast("L'audio non si è caricato. Tocca di nuovo per riprovare.");
      }
    } finally {
      if (pendingExplanation === request) {
        pendingExplanation = null;
        button.disabled = false;
        root.classList.remove("is-loading");
        button.removeAttribute("aria-busy");
      }
    }
  }

  async function fetchExplanationBlob(question, { signal } = {}) {
    let firstError = null;
    try {
      const source = await audioApi("getQuizAudioBlob", question, { blob: true, signal });
      if (source?.blob?.size) return source;
      firstError = new Error("empty_audio_blob");
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      firstError = error;
    }

    // Use the signed object only after an explicit click, so scrolling never
    // creates a second audio request for every visible question.
    try {
      const playback = await audioApi("getQuizAudioPlayback", question, { signal });
      if (!playback?.audioUrl) throw firstError || new Error("audio_url_missing");
      const request = createTimedAudioRequest(signal);
      let response;
      try {
        response = await fetch(playback.audioUrl, { cache: "no-store", signal: request.signal });
      } finally {
        request.cleanup();
      }
      if (!response.ok) throw firstError || new Error(`audio_url_${response.status}`);
      const blob = await response.blob();
      if (!blob.size) throw firstError || new Error("empty_audio_blob");
      return { blob, durationMs: Number(playback.durationMs) || 0 };
    } catch (error) {
      if (error?.name === "AbortError") throw error;
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
  window.addEventListener("pageshow", () => {
    if (!currentChapter) renderStudyIntro();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !currentChapter) renderStudyIntro();
  });
  window.addEventListener("pagehide", () => {
    if (currentChapter) markStudyChapterExit(currentChapter);
    stopPlayback();
    resetAudioObservation();
  });

  buildChapterPicker();
  const initialChapter = chapterFromLocation();
  if (initialChapter) void openChapter(initialChapter, { updateHistory: false });
  else showPicker();
})();
