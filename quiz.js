// ─────────────────────────────────────────────────────────────────────────────
// QUIZ API CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const CLIENT_AUTH_RESET_VERSION = "2026-04-device-reset-1";
const CLIENT_AUTH_RESET_KEY = "client_auth_reset_version";
const HOME_ROUTE = "/magic-book";
const TRIAL_MODE = window.location.pathname.replace(/\/+$/, "") === "/quiz/prova-gratis";
const TRIAL_HOME_ROUTE = "/?trialOffer=1";
const TRIAL_ALLOWED_CHAPTERS = new Set(["1", "3"]);
const RESULT_VIDEO_SOURCES = {
  pass: "assets/videos/pial_vhai%20applauso.mp4",
  fail: "assets/videos/delusione.mp4"
};
const PASSING_SCORE_RATIO = 0.9;

function syncQuizViewportHeight() {
  const height = window.visualViewport?.height || window.innerHeight;
  if (!height) return;
  document.documentElement.style.setProperty("--quiz-viewport-height", `${Math.round(height)}px`);
}

syncQuizViewportHeight();
window.addEventListener("pageshow", syncQuizViewportHeight);
window.addEventListener("resize", syncQuizViewportHeight);
window.addEventListener("orientationchange", syncQuizViewportHeight);
window.visualViewport?.addEventListener("resize", syncQuizViewportHeight);

function calculateQuizResult(correctAnswers, totalQuestions) {
  const total = Number(totalQuestions) || 0;
  const correct = Number(correctAnswers) || 0;

  if (total <= 0) {
    return {
      passed: false,
      passingScore: 0,
      scorePercentage: 0
    };
  }

  const passingScore = Math.ceil(total * PASSING_SCORE_RATIO);
  const scorePercentage = Math.round((correct / total) * 100);

  return {
    passed: correct >= passingScore,
    passingScore,
    scorePercentage
  };
}

function getCorrectAnswerCount(result) {
  const candidates = [
    result?.correct,
    result?.correctAnswers,
    result?.correctCount
  ];

  for (const value of candidates) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }

  return 0;
}

function getResultTotalQuestions(result) {
  const candidates = [
    result?.totalQuestions,
    quiz.length,
    answers.length,
    result?.total,
    result?.questionCount
  ];

  for (const value of candidates) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue) && numberValue > 0) return numberValue;
  }

  return 0;
}

function normalizeQuizResult(result, totalQuestions = getResultTotalQuestions(result)) {
  const correctAnswers = getCorrectAnswerCount(result);
  const calculated = calculateQuizResult(correctAnswers, totalQuestions);

  return {
    ...result,
    correct: correctAnswers,
    totalQuestions: Number(totalQuestions) || 0,
    passingScore: calculated.passingScore,
    scorePercentage: calculated.scorePercentage,
    passed: calculated.passed
  };
}

function hasCurrentClientAuthResetVersion() {
  try {
    return localStorage.getItem(CLIENT_AUTH_RESET_KEY) === CLIENT_AUTH_RESET_VERSION;
  } catch {
    return false;
  }
}

if (!TRIAL_MODE && !hasCurrentClientAuthResetVersion()) {
  window.location.href = HOME_ROUTE;
  throw new Error("client_auth_reset_required");
}

const QUIZ_API = "/api/quiz";
const ASSET_API = "/api/asset";
const EXPLANATION_EXTENSIONS = ["png", "webp", "jpg", "jpeg"];
const EXPLANATION_FIGURES_CACHE_KEY = "magicbook_explanation_figures_v1";
const QUIZ_MODE_CONFIG = {
  exam80: { title: "Exam", timerMinutes: 50 },
  exam30: { title: "Exam", timerMinutes: 20 },
  default: { title: "Quiz", timerMinutes: 20 }
};

function setQuizTitle(title = "MagicBook | Quiz") {
  document.title = title;
}

function buildAssetUrl(params) {
  const search = new URLSearchParams(params);
  return `${ASSET_API}?${search.toString()}`;
}

function buildFigureImageUrl(figure) {
  return buildAssetUrl({ kind: "figure", figure: String(figure || "").trim() });
}

function stopQuizLoadingFigures() {}

function startQuizLoadingFigures() {
  const img = document.getElementById("quiz-loading-figure-img");
  if (img) img.src = "icons/loading.gif";
}

function buildExplanationImageUrl(figure, value, ext) {
  return buildAssetUrl({
    kind: "explanation",
    figure: String(figure || "").trim(),
    value: String(value ?? "").trim(),
    ext
  });
}

function getQuizRouteInfo() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/quiz";
  const params = new URLSearchParams(window.location.search);
  const chapterMatch = path.match(/^\/quiz\/capitolo-(\d{1,2})$/);
  const examMatch = path.match(/^\/quiz\/esame-(80|30)$/);
  if (TRIAL_MODE) {
    const chapter = params.get("chapter") || "";
    return { chapters: TRIAL_ALLOWED_CHAPTERS.has(chapter) ? chapter : "", mode: "default" };
  }

  if (chapterMatch) {
    return { chapters: String(Number(chapterMatch[1])), mode: "default" };
  }
  if (examMatch) {
    return { chapters: "", mode: examMatch[1] === "80" ? "exam80" : "exam30" };
  }
  if (path === "/quiz/multi") {
    return { chapters: params.get("chapters") || "", mode: "default" };
  }
  return {
    chapters: params.get("chapters") || "",
    mode: params.get("mode") || ""
  };
}

function getRequestedQuizMode() {
  const mode = getQuizRouteInfo().mode || "";
  return Object.prototype.hasOwnProperty.call(QUIZ_MODE_CONFIG, mode) ? mode : "default";
}

function getQuizModeConfig(mode = quizMode) {
  return QUIZ_MODE_CONFIG[mode] || QUIZ_MODE_CONFIG.default;
}

function formatTimer(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

function getQuizTimerPresentation(remainingSeconds, adminMode = false) {
  const normalizedSeconds = Math.trunc(Number(remainingSeconds) || 0);
  const isOvertime = adminMode && normalizedSeconds <= 0;
  const displayedTime = formatTimer(isOvertime ? Math.abs(normalizedSeconds) : normalizedSeconds);
  return {
    text: isOvertime ? `+${displayedTime}` : displayedTime,
    ariaLabel: isOvertime
      ? `Tempo supplementare Admin: ${displayedTime}`
      : "Tempo rimanente",
    isOvertime
  };
}

function parseStoredQuizSession(rawSession) {
  if (!rawSession) return null;

  try {
    const session = JSON.parse(rawSession);
    if (session?.loggedIn === false) return null;
    return {
      phone: session?.phone || "",
      deviceId: session?.deviceId || "",
      accessToken: session?.accessToken || "",
      accessTokenExpiresAt: session?.accessTokenExpiresAt || 0
    };
  } catch (err) {
    console.warn("[quiz] Stored session is not readable");
    return null;
  }
}

function getQuizSession() {
  try {
    const loggedIn = localStorage.getItem("loggedIn");
    const sessionCandidates = [
      parseStoredQuizSession(localStorage.getItem("user_session")),
      parseStoredQuizSession(localStorage.getItem("session"))
    ].filter(Boolean);

    const fallbackSession = {
      phone: localStorage.getItem("phone") || "",
      deviceId: localStorage.getItem("deviceId") || "",
      accessToken: localStorage.getItem("accessToken") || "",
      accessTokenExpiresAt: Number(localStorage.getItem("accessTokenExpiresAt") || 0)
    };

    const session = sessionCandidates.find(item => item.phone && item.deviceId)
      || (loggedIn === "true" && fallbackSession.phone && fallbackSession.deviceId ? fallbackSession : null);

    if (!session?.phone || !session?.deviceId) return null;
    return session;
  } catch (err) {
    console.warn("[quiz] Session check unavailable");
    return null;
  }
}

function requireQuizSession() {
  const session = getQuizSession();
  if (!session) {
    window.location.href = HOME_ROUTE;
    throw new Error("missing_quiz_session");
  }
  return session;
}

let memoryTrialId = "";
function getTrialId() {
  let id = memoryTrialId;
  try { id = sessionStorage.getItem("magicbook_trial_id") || id; } catch { /* private browsing fallback */ }
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(id)) {
    const randomPart = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
    id = `trial_${randomPart}`;
    memoryTrialId = id;
    try { sessionStorage.setItem("magicbook_trial_id", id); } catch { /* memory fallback */ }
  }
  return id;
}

const QUIZ_SESSION = TRIAL_MODE ? { phone: "trial", deviceId: getTrialId(), accessToken: "" } : requireQuizSession();

function getQuizPhone() {
  return QUIZ_SESSION.phone;
}

function getQuizDeviceId() {
  return QUIZ_SESSION.deviceId;
}

function getQuizAccessToken() {
  try {
    return localStorage.getItem("accessToken") || QUIZ_SESSION.accessToken || "";
  } catch {
    return QUIZ_SESSION.accessToken || "";
  }
}

function saveQuizAccessToken(accessToken, accessTokenExpiresAt) {
  if (!accessToken || !accessTokenExpiresAt) return;
  QUIZ_SESSION.accessToken = accessToken;
  QUIZ_SESSION.accessTokenExpiresAt = accessTokenExpiresAt;

  try {
    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("accessTokenExpiresAt", String(accessTokenExpiresAt));
    const raw = localStorage.getItem("user_session");
    const session = raw ? JSON.parse(raw) : {};
    if (session?.phone) {
      session.accessToken = accessToken;
      session.accessTokenExpiresAt = accessTokenExpiresAt;
      localStorage.setItem("user_session", JSON.stringify(session));
    }
  } catch {
    // Best effort: top-level localStorage keys are already updated.
  }
}

let quizSessionToken = "";
let quizSessionTokenExpiresAt = 0;
const QUIZ_SESSION_REFRESH_SKEW_MS = 90 * 1000;
let quizSessionRefreshPromise = null;

function getQuizSessionToken() {
  return quizSessionToken;
}

function isQuizSessionProtectedAction(action) {
  return ["getItalianAudio", "getBengaliAudio", "getTTS", "checkQuiz"].includes(String(action || ""));
}

function quizApiAction(url) {
  try {
    return new URL(url, window.location.origin).searchParams.get("action") || "";
  } catch {
    return "";
  }
}

async function refreshQuizSession() {
  if (TRIAL_MODE) return { ok: false, error: new Error("trial_session_refresh_not_needed") };
  if (quizSessionRefreshPromise) return quizSessionRefreshPromise;

  quizSessionRefreshPromise = (async () => {
    const routeInfo = getQuizRouteInfo();
    const response = await fetch(QUIZ_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(getQuizAccessToken() ? { Authorization: `Bearer ${getQuizAccessToken()}` } : {}),
        ...(quizSessionToken ? { "X-Quiz-Session": quizSessionToken } : {})
      },
      body: JSON.stringify({
        action: "refreshQuizSession",
        phone: getQuizPhone(),
        deviceId: getQuizDeviceId(),
        chapters: routeInfo.chapters,
        mode: getRequestedQuizMode()
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(String(data?.error || `quiz_session_refresh_${response.status}`));
      error.status = response.status;
      throw error;
    }
    if (!data?.quizSessionToken || !data?.quizSessionTokenExpiresAt) {
      throw new Error("invalid_quiz_session_refresh");
    }

    if (data.accessToken && data.accessTokenExpiresAt) {
      saveQuizAccessToken(data.accessToken, data.accessTokenExpiresAt);
    }
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

function createBoundedCache(maxEntries = 36) {
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
    delete(key) { entries.delete(key); },
    clear() { entries.clear(); }
  };
}

function createQuizDrawId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function buildQuizApiUrl(action, params = {}) {
  if (TRIAL_MODE) {
    const query = new URLSearchParams({ action, trialId: getQuizDeviceId() });
    const guestKey = sessionStorage.getItem("magicbook_trial_guest_key") || "";
    if (guestKey) query.set("guestKey", guestKey);
    const chapter = getQuizRouteInfo().chapters;
    if (chapter) query.set("chapter", chapter);
    const activeTrialToken = getQuizSessionToken();
    if (activeTrialToken) query.set("trialToken", activeTrialToken);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "" && key !== "chapters" && key !== "mode") query.set(key, String(value));
    });
    return `/api/trial?${query.toString()}`;
  }
  const query = new URLSearchParams({
    action,
    phone: getQuizPhone(),
    deviceId: getQuizDeviceId()
  });

  if (action === "getQuiz") query.set("draw", createQuizDrawId());

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, value);
    }
  });

  return `${QUIZ_API}?${query.toString()}`;
}

function getQuizAccessErrorMessage(error) {
  if (error === "expired") return "Accesso scaduto. Contatta il supporto per rinnovare.";
  if (error === "not_found") return "Numero non autorizzato.";
  if (error === "device_replaced") return "Questo dispositivo non è più autorizzato perché l’accesso è stato spostato su un altro dispositivo.";
  if (error === "device_mismatch") return "Questo dispositivo non è più autorizzato.";
  if (error === "quiz_session_expired") return "Sessione quiz scaduta. Riapri il quiz.";
  return "Accesso non autorizzato.";
}

function isExamQuizMode(mode = quizMode) {
  return mode === "exam80" || mode === "exam30";
}

function getQuizLoadErrorMessage(mode = quizMode) {
  return isExamQuizMode(mode)
    ? "Non è stato possibile avviare l’Exam. Riprova tra qualche istante."
    : "Non è stato possibile caricare il quiz. Riprova tra qualche istante.";
}

function isQuizAccessError(error) {
  return ["expired", "not_found", "device_replaced", "device_mismatch", "unauthorized", "quiz_session_expired", "trial_session_expired"].includes(error);
}

let quizAccessErrorHandled = false;

function isQuizRevokedSessionError(error) {
  return ["expired", "not_found", "device_replaced", "device_mismatch"].includes(error);
}

function clearQuizSessionDataForLogout() {
  try {
    [
      "loggedIn",
      "phone",
      "expiry",
      "user_session",
      "session",
      "accessToken",
      "accessTokenExpiresAt",
      "quizSessionToken",
      "quizSessionTokenExpiresAt",
      "renewPopupLastShown"
    ].forEach(key => localStorage.removeItem(key));
  } catch (err) {
    console.warn("[quiz] Session cleanup unavailable");
  }
}

async function handleQuizAccessError(error) {
  if (quizAccessErrorHandled) return;
  quizAccessErrorHandled = true;

  try {
    hideLoading();
    if (isQuizRevokedSessionError(error)) clearQuizSessionDataForLogout();
    await showMessage("Accesso", getQuizAccessErrorMessage(error));
  } finally {
    window.location.href = TRIAL_MODE ? TRIAL_HOME_ROUTE : HOME_ROUTE;
  }
}

async function fetchQuizJson(url, options = {}) {
  const { allowSessionRefresh = true, ...fetchOptions } = options;
  const action = quizApiAction(url);
  if (allowSessionRefresh && !TRIAL_MODE && isQuizSessionProtectedAction(action)) {
    const freshSession = await ensureFreshQuizSession();
    if (!freshSession.ok && [401, 403].includes(Number(freshSession.error?.status))) {
      await handleQuizAccessError(freshSession.error?.message || "unauthorized");
      throw freshSession.error;
    }
  }

  const headers = new Headers(fetchOptions.headers || {});
  if (!TRIAL_MODE) {
    const accessToken = getQuizAccessToken();
    const activeQuizToken = getQuizSessionToken();
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    if (activeQuizToken) headers.set("X-Quiz-Session", activeQuizToken);
  }

  const response = await fetch(url, { ...fetchOptions, headers });

  let data = null;
  try {
    data = await response.json();
  } catch (err) {
    data = null;
  }

  const error = data?.error;
  if (
    allowSessionRefresh
    && !TRIAL_MODE
    && isQuizSessionProtectedAction(action)
    && (error === "quiz_session_expired" || error === "token_expired")
  ) {
    const refreshed = await refreshQuizSession();
    if (refreshed.ok) {
      return fetchQuizJson(url, { ...fetchOptions, allowSessionRefresh: false });
    }
    if ([401, 403].includes(Number(refreshed.error?.status))) {
      await handleQuizAccessError(refreshed.error?.message || "unauthorized");
    }
    throw new Error("quiz_session_refresh_unavailable");
  }

  if (response.status === 401 || response.status === 403 || isQuizAccessError(error)) {
    await handleQuizAccessError(error || "unauthorized");
    throw new Error(error || "unauthorized");
  }

  if (!response.ok) {
    throw new Error(error || `quiz_api_${response.status}`);
  }

  return data;
}

let quiz = [];
let answers = [];
let current = 0;
let quizMode = getRequestedQuizMode();
setQuizTitle(`MagicBook | ${getQuizModeConfig(quizMode).title || "Quiz"}`);
let quizDurationMinutes = getQuizModeConfig(quizMode).timerMinutes;
let time = quizDurationMinutes * 60;
let quizStartedAt = 0;
let learningSessionId = "";
let learningQuestionVisibleAt = 0;
let learningQuestionWasHidden = false;
let isFinishing = false;
let lastQuizSet = null;
let isAdmin = false;
let modalResolver = null;
let modalFocusOrigin = null;
let reviewTranslationGeneration = 0;
let reviewTranslationRequestSequence = 0;
let isTtsPlaying = false;
let isBengaliPlaying = false;
let italianAudioId = 0;
let banglaAudioId = 0;
let googleItalianAudio = null;
let googleTTSAudio = null;
let googleItalianAudioUrl = "";
let googleTTSAudioUrl = "";
let italianTtsRequest = null;
let bengaliTtsRequest = null;
const italianAudioCache = createBoundedCache(36);
const bengaliAudioCache = createBoundedCache(36);

function getLearningQuizMode() {
  if (isExamQuizMode()) return "simulation";
  return getQuizRouteInfo().chapters ? "chapter_quiz" : "random_quiz";
}

function beginLearningQuizSession() {
  if (TRIAL_MODE || !window.MagicBookLearningSync) {
    learningSessionId = "";
    return;
  }
  learningSessionId = window.MagicBookLearningSync.generateEventId("ses");
  learningQuestionVisibleAt = Date.now();
  learningQuestionWasHidden = document.visibilityState === "hidden";
}

function markLearningQuestionVisible() {
  if (!learningSessionId) return;
  learningQuestionVisibleAt = Date.now();
  learningQuestionWasHidden = document.visibilityState === "hidden";
}

function queueLearningAnswer(userAnswer) {
  if (TRIAL_MODE || !learningSessionId || !window.MagicBookLearningSync) return;
  const question = quiz[current];
  const answerState = answers[current];
  if (!question?.id || !answerState) return;

  const answeredAt = Date.now();
  const responseTimeMs = learningQuestionVisibleAt
    ? Math.max(0, answeredAt - learningQuestionVisibleAt)
    : "";
  answerState.learningAttemptNumber = Number(answerState.learningAttemptNumber || 0) + 1;
  void window.MagicBookLearningSync.enqueueAnswer({
    quiz_id: String(question.id),
    user_answer: userAnswer,
    answered_at: new Date(answeredAt).toISOString(),
    response_time_ms: responseTimeMs,
    response_time_valid: responseTimeMs !== "" && !learningQuestionWasHidden,
    page_was_hidden: learningQuestionWasHidden,
    mode: getLearningQuizMode(),
    session_id: learningSessionId,
    attempt_number: answerState.learningAttemptNumber,
    client_version: "quiz-65-learning-sync"
  }).catch(error => {
    console.warn("[LearningSync] answer could not be queued", error?.message || error);
  });

  learningQuestionVisibleAt = answeredAt;
  learningQuestionWasHidden = document.visibilityState === "hidden";
}

document.addEventListener("visibilitychange", () => {
  if (learningSessionId && document.visibilityState === "hidden") {
    learningQuestionWasHidden = true;
  }
});

const modal = document.getElementById("custom-modal");
const modalCard = modal.querySelector(".modal-card");
const quizContainer = document.querySelector(".quiz-container");
const modalBadge = modal.querySelector(".modal-badge");
const modalTitle = document.getElementById("modal-title");
const modalMessage = document.getElementById("modal-message");
const modalConfirm = document.getElementById("modal-confirm");
const modalCancel = document.getElementById("modal-cancel");
const modalRifai  = document.getElementById("modal-rifai");
const modalIconShell = document.getElementById("modal-icon-shell");
const modalResultVideo = document.getElementById("modal-result-video");
const modalIcon = document.getElementById("modal-icon");
const modalIconFallback = document.getElementById("modal-icon-fallback");
const modalStats         = document.getElementById("modal-stats");
const modalScoreFraction = document.getElementById("modal-score-fraction");
const modalScorePct      = document.getElementById("modal-score-pct");
const modalWrongCount    = document.getElementById("modal-wrong-count");
const modalCorrectCount  = document.getElementById("modal-correct-count");
const modalReview = document.getElementById("modal-review");
const modalReviewList = document.getElementById("modal-review-list");
const REVIEW_TRANSLATION_WAIT_MS = 5000;
const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-text");
const prevButton = document.getElementById("prev-btn");
const nextButton = document.getElementById("next-btn");
const nextIconWrap = document.getElementById("next-icon-wrap");
const nextLabel = document.getElementById("next-label");
const explanationButton = document.getElementById("explanation-btn");
const explanationModal = document.getElementById("explanation-modal");
const explanationClose = document.getElementById("explanation-close");
const explanationLoading = document.getElementById("explanation-loading");
const explanationImage = document.getElementById("explanation-image");
const explanationError = document.getElementById("explanation-error");
let explanationLoadId = 0;

/***********************
 * AUDIO
 ***********************/

const italianAudioBtn = document.querySelector(".audio-btn[aria-label='Ascolta in italiano']");
const banglaAudioBtn  = document.querySelector(".audio-btn[aria-label='Ascolta in Bengali']");
const sharedAudioShell = document.getElementById("quiz-audio-explanation-shell");
const sharedAudioPlayer = document.getElementById("quiz-audio-explanation");
const sharedAudioPlay = document.getElementById("quiz-audio-play");
const sharedAudioProgress = document.getElementById("quiz-audio-progress");
const sharedAudioSpeed = document.getElementById("quiz-audio-speed");
const sharedAudioArtwork = document.getElementById("quiz-audio-artwork");
const quizAudioAdminTools = document.getElementById("quiz-audio-admin-tools");
const quizAudioAdd = document.getElementById("quiz-audio-add");
const quizAudioAddPlus = quizAudioAdd?.querySelector("span");
const quizAudioAddEditIcon = quizAudioAdd?.querySelector("img");
const quizAudioEditMenu = document.getElementById("quiz-audio-edit-menu");
const quizAudioRerecord = document.getElementById("quiz-audio-rerecord");
const quizAudioDelete = document.getElementById("quiz-audio-delete");
const quizAudioRecorder = document.getElementById("quiz-audio-recorder");
const quizAudioRecordClose = document.getElementById("quiz-audio-record-close");
const quizAudioRecordStart = document.getElementById("quiz-audio-record-start");
const quizAudioRecordStartLabel = document.getElementById("quiz-audio-record-start-label");
const quizAudioRecordPause = document.getElementById("quiz-audio-record-pause");
const quizAudioRecordSave = document.getElementById("quiz-audio-record-save");
const quizAudioRecordStatus = document.getElementById("quiz-audio-record-status");
const quizAudioRecordTime = document.getElementById("quiz-audio-record-time");
const quizAudioRecordPreview = document.getElementById("quiz-audio-record-preview");
const sharedAudio = new Audio();
sharedAudio.preload = "metadata";
const reviewAudio = new Audio();
reviewAudio.preload = "metadata";
const SHARED_AUDIO_AVAILABILITY_DELAY_MS = 350;
const QUIZ_IMAGE_REQUEST_DELAY_MS = 140;
let sharedAudioQuestion = "";
let sharedAudioLoading = null;
let sharedAudioFrame = 0;
let sharedAudioSpeedValue = 1;
let sharedAudioRequestId = 0;
let sharedAudioObjectUrl = "";
let sharedAudioSeeking = false;
let sharedAudioDurationHint = 0;
let sharedAudioContext = null;
let sharedAudioFailure = null;
let sharedAudioAvailabilityTimer = 0;
let sharedAudioAvailabilityController = null;
let reviewAudioButton = null;
let reviewAudioKey = "";
let reviewAudioObjectUrl = "";
let reviewAudioRequestId = 0;
let quizImageRequestTimer = 0;
let quizImageRequestId = 0;
const sharedAudioAvailabilityCache = new Map();
const loadedQuizFigures = new Set();

function setSharedAudioVisualState(state) {
  if (!sharedAudioPlayer) return;
  const normalized = ["active", "loading", "inactive", "error"].includes(state) ? state : "inactive";
  sharedAudioPlayer.classList.remove("is-active", "is-loading", "is-inactive", "is-error");
  sharedAudioPlayer.classList.add(`is-${normalized}`);
  sharedAudioPlayer.dataset.audioState = normalized;
  sharedAudioPlayer.setAttribute("aria-label", normalized === "active"
    ? "Spiegazione audio"
    : normalized === "loading"
      ? "Caricamento spiegazione audio"
      : "Spiegazione audio non disponibile");
}

function setSharedAudioVisibility(isVisible) {
  sharedAudioShell?.classList.toggle("hidden", !isVisible);
  sharedAudioShell?.setAttribute("aria-hidden", isVisible ? "false" : "true");
  sharedAudioPlayer?.setAttribute("aria-hidden", isVisible ? "false" : "true");
}

function setSharedAudioPlaying(isPlaying) {
  sharedAudioPlay?.classList.toggle("is-playing", isPlaying);
  sharedAudioPlay?.setAttribute("aria-label", isPlaying ? "Metti in pausa la spiegazione" : "Riproduci spiegazione");
  sharedAudioPlayer?.classList.toggle("is-playing", isPlaying);
  sharedAudioArtwork?.classList.toggle("is-spinning", isPlaying);
}

function setSharedAudioFailure(error, stage) {
  sharedAudioFailure = {
    code: String(error?.message || error || "quiz_audio_unknown_error"),
    stage: String(stage || "unknown"),
    questionId: String(sharedAudioContext?.id ?? ""),
    figure: QuizAudioIdentity.normalizeFigure(sharedAudioContext?.figure ?? "")
  };
  setSharedAudioVisualState("error");
}

async function reportSharedAudioFailure() {
  if (!isAdmin) {
    showAudioUnavailableToast("L'audio non è disponibile al momento. Riprova tra poco.");
    return;
  }
  const failure = sharedAudioFailure || {
    code: "quiz_audio_not_available",
    stage: "availability",
    questionId: String(sharedAudioContext?.id ?? ""),
    figure: QuizAudioIdentity.normalizeFigure(sharedAudioContext?.figure ?? "")
  };
  await showMessage(
    "Errore spiegazione audio",
    `Fase: ${failure.stage}\nCodice: ${failure.code}\nDomanda ID: ${failure.questionId || "non disponibile"}\nFigura: ${failure.figure || "none"}`
  );
}

function revokeSharedAudioObjectUrl() {
  if (!sharedAudioObjectUrl) return;
  URL.revokeObjectURL(sharedAudioObjectUrl);
  sharedAudioObjectUrl = "";
}

function resetSharedAudioPlayer() {
  if (sharedAudioAvailabilityTimer) window.clearTimeout(sharedAudioAvailabilityTimer);
  sharedAudioAvailabilityTimer = 0;
  sharedAudioAvailabilityController?.abort();
  sharedAudioAvailabilityController = null;
  sharedAudioRequestId += 1;
  sharedAudio.pause();
  revokeSharedAudioObjectUrl();
  sharedAudio.removeAttribute("src");
  sharedAudio.load();
  setSharedAudioVisibility(false);
  setSharedAudioPlaying(false);
  sharedAudioPlay?.classList.remove("is-loading");
  sharedAudioProgress?.style.setProperty("--progress", "0%");
  if (sharedAudioProgress) sharedAudioProgress.value = "0";
  sharedAudioQuestion = "";
  sharedAudioLoading = null;
  sharedAudioFailure = null;
  sharedAudioSeeking = false;
  sharedAudioDurationHint = 0;
  if (sharedAudioFrame) cancelAnimationFrame(sharedAudioFrame);
  sharedAudioFrame = 0;
  setSharedAudioVisualState("loading");
}

function paintSharedAudioProgress() {
  if (!sharedAudioProgress) return;
  if (sharedAudioSeeking) return;
  const duration = Number.isFinite(Number(sharedAudio.duration)) && Number(sharedAudio.duration) > 0
    ? Number(sharedAudio.duration)
    : sharedAudioDurationHint;
  const currentTime = Number(sharedAudio.currentTime);
  const percent = Number.isFinite(duration) && duration > 0 && Number.isFinite(currentTime)
    ? Math.max(0, Math.min(100, currentTime / duration * 100))
    : 0;
  sharedAudioProgress.value = String(percent);
  sharedAudioProgress.setAttribute("aria-valuenow", percent.toFixed(1));
  sharedAudioProgress.style.setProperty("--progress", `${percent}%`);
}

function seekSharedAudioFromProgress() {
  if (!sharedAudioProgress) return;
  const duration = Number.isFinite(Number(sharedAudio.duration)) && Number(sharedAudio.duration) > 0
    ? Number(sharedAudio.duration)
    : sharedAudioDurationHint;
  if (!Number.isFinite(duration) || duration <= 0) return;
  const percent = Math.max(0, Math.min(100, Number(sharedAudioProgress.value) || 0));
  try { sharedAudio.currentTime = duration * percent / 100; } catch (_) { return; }
  sharedAudioProgress.setAttribute("aria-valuenow", percent.toFixed(1));
  sharedAudioProgress.style.setProperty("--progress", `${percent}%`);
}

function animateSharedAudioProgress() {
  paintSharedAudioProgress();
  if (!sharedAudio.paused && !sharedAudio.ended) sharedAudioFrame = requestAnimationFrame(animateSharedAudioProgress);
}

async function requestSharedAudio(action, question, { signal } = {}) {
  const audioQuestion = question?.audioQuestion || question?.question || question || "";
  const audioFigure = question?.audioFigure ?? question?.figure ?? "";
  const identityPayload = {
    questionId: question?.id ?? "",
    question: String(audioQuestion),
    figure: QuizAudioIdentity.normalizeFigure(audioFigure),
    quizAudioIdentityVersion: QuizAudioIdentity.VERSION,
    audioIdentityToken: question?.audioIdentityToken || ""
  };
  const response = await fetch(QUIZ_API, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(getQuizAccessToken() ? { Authorization: `Bearer ${getQuizAccessToken()}` } : {})
    },
    body: JSON.stringify({
      action,
      phone: getQuizPhone(),
      deviceId: getQuizDeviceId(),
      ...identityPayload
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `quiz_audio_${response.status}`);
  return data;
}

async function requestSharedAudioBlob(question) {
  const audioQuestion = question?.audioQuestion || question?.question || question || "";
  const audioFigure = question?.audioFigure ?? question?.figure ?? "";
  const identityPayload = {
    questionId: question?.id ?? "",
    question: String(audioQuestion),
    figure: QuizAudioIdentity.normalizeFigure(audioFigure),
    quizAudioIdentityVersion: QuizAudioIdentity.VERSION,
    audioIdentityToken: question?.audioIdentityToken || ""
  };
  const response = await fetch(QUIZ_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(getQuizAccessToken() ? { Authorization: `Bearer ${getQuizAccessToken()}` } : {})
    },
    body: JSON.stringify({
      action: "getQuizAudioBlob",
      phone: getQuizPhone(),
      deviceId: getQuizDeviceId(),
      ...identityPayload
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error || `quiz_audio_${response.status}`);
  }

  const blob = await response.blob();
  if (!blob.size) throw new Error("empty_audio_blob");
  const mimeType = String(blob.type || "audio/webm").startsWith("audio/")
    ? blob.type
    : "audio/webm";
  return {
    blob: new Blob([blob], { type: mimeType }),
    durationMs: Number(response.headers.get("X-Audio-Duration-Ms")) || 0
  };
}

function reviewAudioIdentityKey(question) {
  return [
    String(question?.id ?? ""),
    String(question?.audioQuestion || question?.question || ""),
    QuizAudioIdentity.normalizeFigure(question?.audioFigure ?? question?.figure ?? "")
  ].join("\u001f");
}

function setReviewAudioButtonState(button, state = "idle") {
  if (!button) return;
  const baseLabel = button.dataset.audioLabel || "Ascolta la spiegazione audio";
  button.classList.toggle("is-loading", state === "loading");
  button.classList.toggle("is-playing", state === "playing");
  button.disabled = state === "loading";
  button.setAttribute("aria-busy", state === "loading" ? "true" : "false");
  button.setAttribute("aria-pressed", state === "playing" ? "true" : "false");
  button.setAttribute("aria-label", state === "loading"
    ? "Caricamento della spiegazione audio"
    : state === "playing"
      ? "Metti in pausa la spiegazione audio"
      : baseLabel);
}

function revokeReviewAudioObjectUrl() {
  if (!reviewAudioObjectUrl) return;
  URL.revokeObjectURL(reviewAudioObjectUrl);
  reviewAudioObjectUrl = "";
}

function resetReviewAudioPlayer() {
  reviewAudioRequestId += 1;
  reviewAudio.pause();
  revokeReviewAudioObjectUrl();
  reviewAudio.removeAttribute("src");
  reviewAudio.load();
  setReviewAudioButtonState(reviewAudioButton, "idle");
  reviewAudioButton = null;
  reviewAudioKey = "";
}

function waitForReviewAudioReady() {
  if (reviewAudio.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("review_audio_metadata_timeout"));
    }, 10000);
    const cleanup = () => {
      clearTimeout(timeout);
      reviewAudio.removeEventListener("loadedmetadata", ready);
      reviewAudio.removeEventListener("canplay", ready);
      reviewAudio.removeEventListener("error", failed);
    };
    const ready = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("review_audio_media_error")); };
    reviewAudio.addEventListener("loadedmetadata", ready);
    reviewAudio.addEventListener("canplay", ready);
    reviewAudio.addEventListener("error", failed);
  });
}

async function toggleReviewAudio(button, question) {
  const audioKey = reviewAudioIdentityKey(question);
  if (reviewAudioButton === button && reviewAudioKey === audioKey && reviewAudio.src) {
    try {
      if (reviewAudio.paused) await reviewAudio.play();
      else reviewAudio.pause();
    } catch (_) {
      resetReviewAudioPlayer();
      showAudioUnavailableToast("La spiegazione audio non è disponibile per questa domanda.");
    }
    return;
  }

  stopAllAudio();
  resetReviewAudioPlayer();
  reviewAudioButton = button;
  reviewAudioKey = audioKey;
  const requestId = reviewAudioRequestId;
  setReviewAudioButtonState(button, "loading");

  try {
    const result = await requestSharedAudioBlob(question);
    if (requestId !== reviewAudioRequestId || reviewAudioButton !== button) return;
    reviewAudioObjectUrl = URL.createObjectURL(result.blob);
    reviewAudio.src = reviewAudioObjectUrl;
    reviewAudio.load();
    setReviewAudioButtonState(button, "idle");
    await waitForReviewAudioReady();
    if (requestId !== reviewAudioRequestId || reviewAudioButton !== button) return;
    await reviewAudio.play();
  } catch (_) {
    if (requestId !== reviewAudioRequestId || reviewAudioButton !== button) return;
    resetReviewAudioPlayer();
    showAudioUnavailableToast("La spiegazione audio non è disponibile per questa domanda.");
  }
}

reviewAudio.addEventListener("play", () => setReviewAudioButtonState(reviewAudioButton, "playing"));
reviewAudio.addEventListener("pause", () => setReviewAudioButtonState(reviewAudioButton, "idle"));
reviewAudio.addEventListener("ended", () => {
  setReviewAudioButtonState(reviewAudioButton, "idle");
  try { reviewAudio.currentTime = 0; } catch (_) {}
});

async function loadSharedAudioBlob(question, requestId) {
  const result = await requestSharedAudioBlob(question);
  if (requestId !== sharedAudioRequestId || !sharedAudioQuestion) return;
  revokeSharedAudioObjectUrl();
  sharedAudioDurationHint = Math.max(sharedAudioDurationHint, Math.max(0, Number(result.durationMs) || 0) / 1000);
  sharedAudioObjectUrl = URL.createObjectURL(result.blob);
  sharedAudio.src = sharedAudioObjectUrl;
  sharedAudio.load();
}

async function loadSharedAudioSource(question, requestId) {
  // The production CSP allows media only from self/blob. Loading the
  // authenticated same-origin blob directly is reliable across browsers and
  // avoids losing the user's play gesture during a signed-URL fallback.
  await loadSharedAudioBlob(question, requestId);
}

function updateQuizAudioAdminTool(hasAudio) {
  if (!quizAudioAdd) return;
  quizAudioAdd.dataset.hasAudio = hasAudio ? "true" : "false";
  quizAudioAdd.classList.toggle("has-audio", hasAudio);
  quizAudioAdd.setAttribute("aria-label", hasAudio ? "Modifica spiegazione audio" : "Aggiungi spiegazione audio");
  quizAudioAdd.setAttribute("aria-expanded", "false");
  quizAudioAddPlus?.classList.toggle("hidden", hasAudio);
  quizAudioAddEditIcon?.classList.toggle("hidden", !hasAudio);
  quizAudioEditMenu?.classList.add("hidden");
}

function sharedAudioAvailabilityKey(question) {
  const id = String(question?.id ?? "").trim();
  const audioQuestion = String(question?.audioQuestion || question?.question || "").trim();
  const audioFigure = QuizAudioIdentity.normalizeFigure(question?.audioFigure ?? question?.figure ?? "");
  return `${id}\u001f${audioQuestion}\u001f${audioFigure}`;
}

function invalidateSharedAudioAvailability(question) {
  sharedAudioAvailabilityCache.delete(sharedAudioAvailabilityKey(question));
}

function applySharedAudioAvailability(data, question, requestId) {
  if (requestId !== sharedAudioRequestId) return;
  updateQuizAudioAdminTool(data.available === true);
  if (data.available) {
    setSharedAudioVisibility(true);
    sharedAudioQuestion = {
      id: question.id ?? "",
      question: String(question.audioQuestion || question.question),
      figure: question.audioFigure ?? question.figure ?? "",
      audioIdentityToken: question.audioIdentityToken || ""
    };
    sharedAudioDurationHint = Math.max(0, Number(data.durationMs) || 0) / 1000;
    sharedAudioFailure = null;
    // Availability is lightweight; the audio blob is downloaded only after
    // the user explicitly presses Play.
    setSharedAudioVisualState("active");
    return;
  }

  setSharedAudioVisibility(false);
  sharedAudioFailure = {
    code: data.requiresReview ? "quiz_audio_requires_review" : "quiz_audio_not_found",
    stage: "availability",
    questionId: String(question.id ?? ""),
    figure: QuizAudioIdentity.normalizeFigure(question.figure ?? "")
  };
  setSharedAudioVisualState("inactive");
}

function updateSharedAudioAvailability(question) {
  resetSharedAudioPlayer();
  const requestId = sharedAudioRequestId;
  sharedAudioContext = question ? {
    id: question.id ?? "",
    question: String(question.question || ""),
    figure: question.figure ?? ""
  } : null;
  if (TRIAL_MODE || !question?.question || !sharedAudioPlayer) {
    setSharedAudioVisibility(false);
    return;
  }
  setSharedAudioVisualState("loading");
  const cacheKey = sharedAudioAvailabilityKey(question);
  const cached = sharedAudioAvailabilityCache.get(cacheKey);
  if (cached) {
    applySharedAudioAvailability(cached, question, requestId);
    return;
  }

  sharedAudioAvailabilityTimer = window.setTimeout(async () => {
    sharedAudioAvailabilityTimer = 0;
    if (requestId !== sharedAudioRequestId) return;
    const controller = new AbortController();
    sharedAudioAvailabilityController = controller;
    try {
      const data = await requestSharedAudio("getQuizAudioStatus", question, { signal: controller.signal });
      if (requestId !== sharedAudioRequestId) return;
      if (data.temporaryUnavailable !== true) sharedAudioAvailabilityCache.set(cacheKey, data);
      applySharedAudioAvailability(data, question, requestId);
    } catch (error) {
      if (error?.name === "AbortError" || requestId !== sharedAudioRequestId) return;
      updateQuizAudioAdminTool(false);
      setSharedAudioFailure(error, "status");
    } finally {
      if (sharedAudioAvailabilityController === controller) sharedAudioAvailabilityController = null;
    }
  }, SHARED_AUDIO_AVAILABILITY_DELAY_MS);
}

async function playSharedAudio() {
  if (!sharedAudioQuestion || sharedAudioPlayer?.dataset.audioState === "inactive" || sharedAudioPlayer?.dataset.audioState === "error") {
    await reportSharedAudioFailure();
    return;
  }
  const requestId = sharedAudioRequestId;
  try {
    if (!sharedAudio.src) {
      sharedAudioPlay?.classList.add("is-loading");
      setSharedAudioVisualState("loading");
      sharedAudioLoading ||= loadSharedAudioSource(sharedAudioQuestion, requestId);
      await sharedAudioLoading;
      if (requestId !== sharedAudioRequestId) return;
      sharedAudioPlay?.classList.remove("is-loading");
      setSharedAudioVisualState("active");
    }
    if (sharedAudio.paused) {
      await waitForSharedAudioReady();
      await sharedAudio.play();
      setSharedAudioVisualState("active");
    } else sharedAudio.pause();
  } catch (error) {
    sharedAudioPlay?.classList.remove("is-loading");
    sharedAudioLoading = null;
    sharedAudio.pause();
    revokeSharedAudioObjectUrl();
    sharedAudio.removeAttribute("src");
    sharedAudio.load();
    setSharedAudioFailure(error, "playback");
    await reportSharedAudioFailure();
  }
}

function waitForSharedAudioReady() {
  if (sharedAudio.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("audio_metadata_timeout"));
    }, 10000);
    const cleanup = () => {
      clearTimeout(timeout);
      sharedAudio.removeEventListener("loadedmetadata", ready);
      sharedAudio.removeEventListener("canplay", ready);
      sharedAudio.removeEventListener("error", failed);
    };
    const ready = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("audio_media_error")); };
    sharedAudio.addEventListener("loadedmetadata", ready);
    sharedAudio.addEventListener("canplay", ready);
    sharedAudio.addEventListener("error", failed);
  });
}

sharedAudioPlay?.addEventListener("click", playSharedAudio);
sharedAudioProgress?.addEventListener("pointerdown", event => { sharedAudioSeeking = true; sharedAudioProgress.setPointerCapture?.(event.pointerId); });
sharedAudioProgress?.addEventListener("touchstart", () => { sharedAudioSeeking = true; }, { passive: true });
sharedAudioProgress?.addEventListener("input", seekSharedAudioFromProgress);
sharedAudioProgress?.addEventListener("change", () => { seekSharedAudioFromProgress(); sharedAudioSeeking = false; paintSharedAudioProgress(); });
sharedAudioProgress?.addEventListener("pointerup", () => { seekSharedAudioFromProgress(); sharedAudioSeeking = false; paintSharedAudioProgress(); });
sharedAudioProgress?.addEventListener("pointercancel", () => { seekSharedAudioFromProgress(); sharedAudioSeeking = false; paintSharedAudioProgress(); });
sharedAudioProgress?.addEventListener("touchend", () => { seekSharedAudioFromProgress(); sharedAudioSeeking = false; paintSharedAudioProgress(); }, { passive: true });
sharedAudioSpeed?.addEventListener("click", () => { const speeds = [1, 1.25, 1.5, 2]; sharedAudioSpeedValue = speeds[(speeds.indexOf(sharedAudioSpeedValue) + 1) % speeds.length]; sharedAudio.playbackRate = sharedAudioSpeedValue; sharedAudioSpeed.textContent = `${String(sharedAudioSpeedValue).replace(".", ",")}×`; sharedAudioSpeed.setAttribute("aria-label", `Velocità ${sharedAudioSpeedValue}x`); });
sharedAudio.addEventListener("play", () => { setSharedAudioPlaying(true); if (sharedAudioFrame) cancelAnimationFrame(sharedAudioFrame); animateSharedAudioProgress(); });
sharedAudio.addEventListener("pause", () => { setSharedAudioPlaying(false); if (sharedAudioFrame) cancelAnimationFrame(sharedAudioFrame); sharedAudioFrame = 0; });
sharedAudio.addEventListener("ended", () => { setSharedAudioPlaying(false); if (sharedAudioFrame) cancelAnimationFrame(sharedAudioFrame); sharedAudioFrame = 0; sharedAudioSeeking = false; if (sharedAudioProgress) sharedAudioProgress.value = "0"; sharedAudioProgress?.style.setProperty("--progress", "0%"); });
[
  "loadedmetadata",
  "durationchange",
  "canplay",
  "timeupdate",
  "seeking",
  "seeked"
].forEach(eventName => sharedAudio.addEventListener(eventName, paintSharedAudioProgress));

let inlineAudioRecording = null;

function inlineAudioElapsed() {
  if (!inlineAudioRecording) return 0;
  return inlineAudioRecording.elapsed
    + (inlineAudioRecording.phase === "recording" ? Date.now() - inlineAudioRecording.startedAt : 0);
}

function paintInlineAudioTimer() {
  if (!quizAudioRecordTime) return;
  const seconds = Math.floor(inlineAudioElapsed() / 1000);
  quizAudioRecordTime.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function setInlineAudioStatus(message) {
  if (quizAudioRecordStatus) quizAudioRecordStatus.textContent = message;
}

function setInlineAudioStartState(_icon, label, disabled) {
  if (quizAudioRecordStartLabel) quizAudioRecordStartLabel.textContent = label;
  if (quizAudioRecordStart) {
    quizAudioRecordStart.disabled = disabled;
    quizAudioRecordStart.classList.toggle("is-recording", label === "Registrazione");
  }
}

function buildInlineAudioBlob() {
  if (!inlineAudioRecording?.chunks.length) return null;
  if (inlineAudioRecording.url) URL.revokeObjectURL(inlineAudioRecording.url);
  inlineAudioRecording.blob = new Blob(inlineAudioRecording.chunks, {
    type: inlineAudioRecording.mimeType || "audio/webm"
  });
  inlineAudioRecording.url = URL.createObjectURL(inlineAudioRecording.blob);
  if (quizAudioRecordPreview) {
    quizAudioRecordPreview.src = inlineAudioRecording.url;
    quizAudioRecordPreview.classList.remove("hidden");
  }
  quizAudioRecordSave.disabled = false;
  return inlineAudioRecording.blob;
}

function closeInlineAudioRecorder() {
  const item = inlineAudioRecording;
  if (item?.timer) clearInterval(item.timer);
  if (item?.recorder && item.recorder.state !== "inactive") item.recorder.stop();
  item?.stream?.getTracks().forEach(track => track.stop());
  if (item?.url) URL.revokeObjectURL(item.url);
  inlineAudioRecording = null;
  quizAudioRecordPreview?.pause();
  quizAudioRecordPreview?.removeAttribute("src");
  quizAudioRecordPreview?.classList.add("hidden");
  quizAudioRecorder?.classList.add("hidden");
}

function openInlineAudioRecorder(event) {
  event?.stopPropagation();
  if (!isAdmin || TRIAL_MODE) return;
  closeInlineAudioRecorder();
  inlineAudioRecording = {
    questionIndex: current,
    stream: null,
    recorder: null,
    chunks: [],
    mimeType: "audio/webm",
    phase: "ready",
    startedAt: 0,
    elapsed: 0,
    timer: 0,
    blob: null,
    url: "",
    saving: false
  };
  quizAudioRecorder?.classList.remove("hidden");
  setInlineAudioStartState("mic", "Registra", false);
  quizAudioRecordPause.disabled = true;
  quizAudioRecordSave.disabled = true;
  quizAudioRecordSave.classList.remove("is-saving");
  setInlineAudioStatus("Premi il microfono per iniziare.");
  paintInlineAudioTimer();
}

async function startInlineAudioRecording(event) {
  event?.stopPropagation();
  const item = inlineAudioRecording;
  if (!item || item.saving) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    setInlineAudioStatus("Microfono non disponibile: apri il sito con HTTPS.");
    return;
  }
  try {
    if (!item.stream?.active) item.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (item.recorder?.state === "paused") {
      item.recorder.resume();
    } else {
      item.mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      item.chunks = [];
      item.recorder = new MediaRecorder(item.stream, { mimeType: item.mimeType, audioBitsPerSecond: 64000 });
      item.recorder.ondataavailable = chunk => { if (chunk.data?.size) item.chunks.push(chunk.data); };
      item.recorder.start();
    }
    item.phase = "recording";
    item.startedAt = Date.now();
    item.timer = setInterval(paintInlineAudioTimer, 250);
    setInlineAudioStartState("graphic_eq", "Registrazione", true);
    quizAudioRecordPause.disabled = false;
    setInlineAudioStatus("Registrazione in corso…");
  } catch (error) {
    setInlineAudioStatus(error?.name === "NotAllowedError"
      ? "Microfono bloccato. Consenti l'accesso dal lucchetto del browser."
      : "Impossibile accedere al microfono.");
  }
}

async function pauseInlineAudioRecording(event) {
  event?.stopPropagation();
  const item = inlineAudioRecording;
  if (!item || item.recorder?.state !== "recording") return;
  item.elapsed += Date.now() - item.startedAt;
  item.recorder.requestData();
  item.recorder.pause();
  item.phase = "paused";
  clearInterval(item.timer);
  paintInlineAudioTimer();
  await new Promise(resolve => setTimeout(resolve, 100));
  buildInlineAudioBlob();
  setInlineAudioStartState("play_arrow", "Riprendi", false);
  quizAudioRecordPause.disabled = true;
  setInlineAudioStatus("In pausa. Puoi ascoltare o salvare.");
}

function blobAsAudioDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("audio_read_failed"));
    reader.readAsDataURL(blob);
  });
}

async function quizAudioAdminApi(action, question, extra = {}) {
  const response = await fetch(QUIZ_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(getQuizAccessToken() ? { Authorization: `Bearer ${getQuizAccessToken()}` } : {})
    },
    body: JSON.stringify({
      action,
      phone: getQuizPhone(),
      deviceId: getQuizDeviceId(),
      questionId: question?.id ?? "",
      question: String(question?.question || ""),
      figure: QuizAudioIdentity.normalizeFigure(question?.figure ?? ""),
      quizAudioIdentityVersion: QuizAudioIdentity.VERSION,
      ...extra
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `quiz_audio_${response.status}`);
  return data;
}

async function saveInlineAudioRecording(event) {
  event?.stopPropagation();
  const item = inlineAudioRecording;
  if (!item || item.saving) return;
  if (item.phase === "recording") await pauseInlineAudioRecording();
  if (!item.blob) return;
  const question = quiz[item.questionIndex];
  item.saving = true;
  quizAudioRecordSave.disabled = true;
  quizAudioRecordSave.classList.add("is-saving");
  setInlineAudioStatus("Salvataggio in corso…");
  try {
    const created = await quizAudioAdminApi("createQuizAudioUpload", question);
    try {
      const upload = await fetch(created.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": String(created.uploadContentType || "audio/webm") },
        body: item.blob
      });
      if (!upload.ok) throw new Error(`r2_upload_${upload.status}`);
      await quizAudioAdminApi("confirmQuizAudioUpload", question, { audioDurationMs: inlineAudioElapsed() });
    } catch (_) {
      await quizAudioAdminApi("saveQuizAudio", question, {
        audioBase64: await blobAsAudioDataUrl(item.blob),
        audioMimeType: "audio/webm",
        audioDurationMs: inlineAudioElapsed()
      });
    }
    closeInlineAudioRecorder();
    invalidateSharedAudioAvailability(question);
    updateSharedAudioAvailability(question);
    showAudioUnavailableToast("Spiegazione audio salvata");
  } catch (error) {
    item.saving = false;
    quizAudioRecordSave.disabled = false;
    quizAudioRecordSave.classList.remove("is-saving");
    setInlineAudioStatus(`Salvataggio non riuscito: ${error.message || "riprova"}`);
  }
}

quizAudioAdd?.addEventListener("click", event => {
  event.stopPropagation();
  if (quizAudioAdd.dataset.hasAudio !== "true") {
    openInlineAudioRecorder(event);
    return;
  }
  const willOpen = quizAudioEditMenu?.classList.contains("hidden");
  quizAudioEditMenu?.classList.toggle("hidden", !willOpen);
  quizAudioAdd.setAttribute("aria-expanded", String(willOpen));
});
quizAudioRerecord?.addEventListener("click", event => {
  event.stopPropagation();
  quizAudioEditMenu?.classList.add("hidden");
  quizAudioAdd?.setAttribute("aria-expanded", "false");
  openInlineAudioRecorder(event);
});
quizAudioDelete?.addEventListener("click", async event => {
  event.stopPropagation();
  const question = quiz[current];
  quizAudioEditMenu?.classList.add("hidden");
  quizAudioAdd?.setAttribute("aria-expanded", "false");
  const accepted = await showConfirm(
    "Eliminare la spiegazione?",
    "L'audio di questa domanda verrà eliminato.",
    "Elimina",
    "Annulla"
  );
  if (!accepted) return;
  try {
    await quizAudioAdminApi("deleteQuizAudio", question);
    invalidateSharedAudioAvailability(question);
    sharedAudioAvailabilityCache.set(sharedAudioAvailabilityKey(question), { available: false });
    resetSharedAudioPlayer();
    updateQuizAudioAdminTool(false);
    showAudioUnavailableToast("Spiegazione audio eliminata");
  } catch (error) {
    await showMessage("Eliminazione non riuscita", error.message || "Riprova.");
  }
});
quizAudioRecordClose?.addEventListener("click", event => { event.stopPropagation(); closeInlineAudioRecorder(); });
quizAudioRecordStart?.addEventListener("click", startInlineAudioRecording);
quizAudioRecordPause?.addEventListener("click", pauseInlineAudioRecording);
quizAudioRecordSave?.addEventListener("click", saveInlineAudioRecording);
quizAudioRecorder?.addEventListener("click", event => event.stopPropagation());
document.addEventListener("click", event => {
  if (!quizAudioAdminTools?.contains(event.target)) {
    quizAudioEditMenu?.classList.add("hidden");
    quizAudioAdd?.setAttribute("aria-expanded", "false");
  }
});

let _audioToastTimer = null;

function showAudioUnavailableToast(message = "Audio non disponibile") {
  const toast = document.getElementById("audio-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(_audioToastTimer);
  _audioToastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

const MAX_INLINE_TTS_BYTES = 3 * 1024 * 1024;

function audioUrlFromBase64(value, mimeType = "audio/mpeg") {
  const encoded = String(value || "").replace(/^data:[^,]+,/, "");
  if (!encoded || encoded.length > Math.ceil(MAX_INLINE_TTS_BYTES * 4 / 3) + 16) {
    throw new Error("audio_payload_too_large");
  }
  const binary = atob(encoded);
  if (binary.length > MAX_INLINE_TTS_BYTES) throw new Error("audio_payload_too_large");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

function cancelQuizTtsRequest(kind) {
  const request = kind === "it" ? italianTtsRequest : bengaliTtsRequest;
  request?.controller.abort();
  if (kind === "it") italianTtsRequest = null;
  else bengaliTtsRequest = null;
}

function disposeGeneratedAudio(player, objectUrl) {
  if (player) {
    player.pause();
    player.removeAttribute("src");
    player.load();
  }
  if (objectUrl) URL.revokeObjectURL(objectUrl);
}

function stopAllAudio() {
  italianAudioId++;
  banglaAudioId++;
  cancelQuizTtsRequest("it");
  cancelQuizTtsRequest("bn");
  window.stopQuizHelpAudio?.();
  if (googleItalianAudio) {
    disposeGeneratedAudio(googleItalianAudio, googleItalianAudioUrl);
    googleItalianAudio = null;
    googleItalianAudioUrl = "";
  }
  if (googleTTSAudio) {
    disposeGeneratedAudio(googleTTSAudio, googleTTSAudioUrl);
    googleTTSAudio = null;
    googleTTSAudioUrl = "";
  }
  isTtsPlaying = false;
  isBengaliPlaying = false;
  sharedAudio.pause();
  reviewAudio.pause();
  setSharedAudioPlaying(false);
  italianAudioBtn?.classList.remove("is-playing", "is-loading");
  banglaAudioBtn?.classList.remove("is-playing", "is-loading");
}

function hasTrialAudioPreview(question = quiz[current]) {
  return !TRIAL_MODE || question?.trialAudioPreview === true;
}

function openTrialAudioOffer(language = "Audio") {
  window.location.href = `${TRIAL_HOME_ROUTE}&feature=${encodeURIComponent(`${language} completo`)}`;
}

function updateTrialAudioButtons(question) {
  if (!TRIAL_MODE) return;
  const available = hasTrialAudioPreview(question);
  [italianAudioBtn, banglaAudioBtn].forEach(button => {
    button?.classList.toggle("is-trial-preview", available);
    button?.classList.toggle("is-trial-locked", !available);
  });
  italianAudioBtn?.setAttribute("aria-label", available ? "Ascolta l’anteprima in italiano" : "Audio italiano Premium");
  banglaAudioBtn?.setAttribute("aria-label", available ? "Ascolta l’anteprima in Bengali" : "Audio Bengali Premium");
}

async function fetchItalianAudio(text, cacheKey, questionId) {
  const cached = italianAudioCache.get(cacheKey);
  if (cached) return cached;
  if (italianTtsRequest?.key === cacheKey) return italianTtsRequest.promise;
  cancelQuizTtsRequest("it");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  const request = { key: cacheKey, controller, promise: null };
  request.promise = (async () => {
    try {
      const res = await fetchQuizJson(
        buildQuizApiUrl("getItalianAudio", { text, questionId: String(questionId || "") }),
        { signal: controller.signal }
      );
      const data = res;
      if (!data.audio) throw new Error(data.error || "no audio in response");
      italianAudioCache.set(cacheKey, data);
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  })().finally(() => {
    if (italianTtsRequest === request) italianTtsRequest = null;
  });
  italianTtsRequest = request;
  return request.promise;
}

function speakItalian() {
  if (!quiz.length) return;
  const q = quiz[current];
  if (!q || !q.question) return;
  if (!hasTrialAudioPreview(q)) {
    openTrialAudioOffer("Audio italiano");
    return;
  }

  if (isTtsPlaying) {
    stopAllAudio();
    return;
  }

  stopAllAudio();
  const myId = italianAudioId;
  italianAudioBtn?.classList.add("is-loading");

  const cacheKey = String(q.id || current) + "_it";

  fetchItalianAudio(q.question, cacheKey, q.id)
    .then(data => {
      if (italianAudioId !== myId) return;
      italianAudioBtn?.classList.remove("is-loading");

      const blobUrl = audioUrlFromBase64(data.audio);

      const audio = new Audio(blobUrl);
      googleItalianAudio = audio;
      googleItalianAudioUrl = blobUrl;
      isTtsPlaying = true;
      italianAudioBtn?.classList.add("is-playing");

      const done = () => {
        if (googleItalianAudioUrl === blobUrl) googleItalianAudioUrl = "";
        URL.revokeObjectURL(blobUrl);
        if (italianAudioId !== myId) return;
        googleItalianAudio = null;
        isTtsPlaying = false;
        italianAudioBtn?.classList.remove("is-playing");
      };

      audio.onended = done;
      audio.onerror = () => { done(); showAudioUnavailableToast(); };
      audio.play().catch(() => { done(); showAudioUnavailableToast(); });
    })
    .catch(err => {
      if (italianAudioId !== myId) return;
      italianAudioBtn?.classList.remove("is-loading");
      console.error("[Italian TTS] Failed:", err.message);
      showAudioUnavailableToast("Audio italiano non disponibile");
    });
}

// Prefers the synchronized TMM Books/All Books text and uses the protected
// automatic translator only when no catalog translation exists.
// Returns { audio: base64_mp3, translation: bengaliText }.
async function fetchBengaliAudio(question, cacheKey, options = {}) {
  const cached = bengaliAudioCache.get(cacheKey);
  if (cached) return cached;
  const requestKey = `${cacheKey}:${options.requireAudio === false ? "translation" : "audio"}`;
  if (bengaliTtsRequest?.key === requestKey) return bengaliTtsRequest.promise;
  cancelQuizTtsRequest("bn");

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 15000);

  const request = { key: requestKey, controller, promise: null };
  request.promise = (async () => {
    try {
      const questionId = String(question?.id || "");
      let synchronizedTranslation = "";
      if (options.skipRuntimeLookup !== true) {
        try {
          const runtime = await window.QuizHelpRuntimeV3?.load?.();
          const resolved = runtime?.resolver?.resolve(question);
          const candidate = String(
            resolved?.questionBnStandard || resolved?.questionBnEasy || resolved?.questionBn || ""
          ).trim();
          if ([...candidate].some(character => {
            const codePoint = character.codePointAt(0);
            return codePoint >= 0x0980 && codePoint <= 0x09ff;
          })) synchronizedTranslation = candidate;
        } catch (_) {}
      }

      if (!synchronizedTranslation) {
        const catalogCandidate = String(question?.question_bd || question?.questionBD || "").trim();
        if ([...catalogCandidate].some(character => {
          const codePoint = character.codePointAt(0);
          return codePoint >= 0x0980 && codePoint <= 0x09ff;
        })) synchronizedTranslation = catalogCandidate;
      }

      const automaticBackup = !synchronizedTranslation;
      const res = await fetchQuizJson(
        buildQuizApiUrl(automaticBackup ? "getBengaliAudio" : "getTTS", {
          text: automaticBackup ? String(question?.question || "") : synchronizedTranslation,
          questionId
        }),
        { signal: controller.signal }
      );
      const translatedText = automaticBackup
        ? String(res?.translation || "").trim()
        : synchronizedTranslation;
      if (![...translatedText].some(character => {
        const codePoint = character.codePointAt(0);
        return codePoint >= 0x0980 && codePoint <= 0x09ff;
      })) throw new Error("translation_not_available");
      const data = {
        ...res,
        translation: translatedText,
        translationSource: String(
          res?.translationSource || (automaticBackup ? "automatic" : "tmm_books")
        )
      };
      if (!data.audio && options.requireAudio !== false) throw new Error(data.error || "no audio in response");
      if (data.audio) bengaliAudioCache.set(cacheKey, data);
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  })().finally(() => {
    if (bengaliTtsRequest === request) bengaliTtsRequest = null;
  });
  bengaliTtsRequest = request;
  return request.promise;
}

// Bengali TTS — single reliable path via GAS proxy.
// The server receives only the synchronized Bengali text and generates its audio.
// banglaAudioId guards stale async callbacks after navigation.
function playBanglaAudio() {
  if (!quiz.length) return;
  const q = quiz[current];
  if (!q || !q.question) return;
  if (!hasTrialAudioPreview(q)) {
    openTrialAudioOffer("Audio Bengali");
    return;
  }

  if (isBengaliPlaying) {
    stopAllAudio();
    return;
  }

  stopAllAudio();
  const myId = banglaAudioId;
  banglaAudioBtn?.classList.add("is-loading");

  const cacheKey = String(q.id || current) + "_bn";

  fetchBengaliAudio(q, cacheKey)
    .then(data => {
      if (banglaAudioId !== myId) return;
      banglaAudioBtn?.classList.remove("is-loading");
      console.log("[Bengali TTS] Translation:", data.translation);

      const blobUrl = audioUrlFromBase64(data.audio);

      const audio = new Audio(blobUrl);
      googleTTSAudio = audio;
      googleTTSAudioUrl = blobUrl;
      isBengaliPlaying = true;
      banglaAudioBtn?.classList.add("is-playing");

      const done = () => {
        if (googleTTSAudioUrl === blobUrl) googleTTSAudioUrl = "";
        URL.revokeObjectURL(blobUrl);
        if (banglaAudioId !== myId) return;
        googleTTSAudio = null;
        isBengaliPlaying = false;
        banglaAudioBtn?.classList.remove("is-playing");
      };

      audio.onended = done;
      audio.onerror = () => { done(); showAudioUnavailableToast(); };
      audio.play().catch(() => { done(); showAudioUnavailableToast(); });
    })
    .catch(err => {
      if (banglaAudioId !== myId) return;
      banglaAudioBtn?.classList.remove("is-loading");
      console.error("[Bengali TTS] Failed:", err.message);
      showAudioUnavailableToast("Audio bangla non disponibile");
    });
}

/***********************
 * IMAGE LOADER
 ***********************/

function getExplanationValue(question) {
  return explanationFigures.has(getNormalizedFigureKey(question)) ? "0" : null;
}

function getNormalizedFigureKey(question) {
  const figure = getFigureKey(question).normalize("NFKC").toLowerCase();
  const clean = figure.split(/[?#]/, 1)[0].replace(/\\/g, "/");
  const basename = clean.split("/").pop() || clean;
  const match = basename.match(/^(?:fig[\s_-]*)?0*(\d+)(?:\.[a-z0-9]+)?$/i);
  return match ? `fig${Number(match[1])}` : basename.replace(/\.[a-z0-9]+$/i, "");
}

let explanationFigures = readCachedExplanationFigures();
const explanationFigureChecks = new Map();

function readCachedExplanationFigures() {
  try {
    const cached = JSON.parse(localStorage.getItem(EXPLANATION_FIGURES_CACHE_KEY) || "null");
    return new Set(Array.isArray(cached?.figures) ? cached.figures : []);
  } catch (_) {
    return new Set();
  }
}

async function refreshExplanationFigures() {
  if (TRIAL_MODE) return explanationFigures;
  const data = await fetchQuizJson(buildQuizApiUrl("getExplanationFigures"), { cache: "no-store" });
  const figures = Array.isArray(data.figures) ? data.figures.filter(value => /^fig\d+$/.test(value)) : [];
  explanationFigures = new Set(figures);
  try {
    localStorage.setItem(EXPLANATION_FIGURES_CACHE_KEY, JSON.stringify({ figures, savedAt: Date.now() }));
  } catch (_) {}
  if (quiz[current]) updateExplanationButton(quiz[current]);
  return explanationFigures;
}

function saveExplanationFigures() {
  const figures = [...explanationFigures];
  try {
    localStorage.setItem(EXPLANATION_FIGURES_CACHE_KEY, JSON.stringify({ figures, savedAt: Date.now() }));
  } catch (_) {}
}

async function checkExplanationFigure(figureKey) {
  if (!figureKey) return false;
  if (explanationFigures.has(figureKey)) return true;
  if (explanationFigureChecks.has(figureKey)) return explanationFigureChecks.get(figureKey);

  const check = (async () => {
    for (const extension of EXPLANATION_EXTENSIONS) {
      const response = await fetch(buildExplanationImageUrl(figureKey, 0, extension), {
        method: "HEAD",
        cache: "no-store"
      }).catch(() => null);
      if (response?.ok) {
        explanationFigures.add(figureKey);
        saveExplanationFigures();
        return true;
      }
    }
    return false;
  })().finally(() => explanationFigureChecks.delete(figureKey));

  explanationFigureChecks.set(figureKey, check);
  return check;
}

function checkCurrentExplanationFigure(question) {
  const figureKey = getNormalizedFigureKey(question);
  if (!figureKey || explanationFigures.has(figureKey)) return;
  void checkExplanationFigure(figureKey).then(available => {
    if (available && getNormalizedFigureKey(quiz[current]) === figureKey) {
      updateExplanationButton(quiz[current]);
    }
  });
}

async function checkQuizExplanationFigures(questions) {
  const figures = [...new Set((Array.isArray(questions) ? questions : [])
    .map(getNormalizedFigureKey)
    .filter(Boolean))];
  const concurrency = 6;
  let cursor = 0;
  const worker = async () => {
    while (cursor < figures.length) {
      const figureKey = figures[cursor++];
      await checkExplanationFigure(figureKey);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, figures.length) }, worker));
}

function getFigureKey(question) {
  const figure = String(question?.figure ?? "").trim();
  const normalized = figure.toLowerCase();
  if (!figure || ["0", "false", "null", "undefined"].includes(normalized)) return "";
  return figure;
}

function updateExplanationButton(question) {
  if (!explanationButton) return;
  const available = getExplanationValue(question) !== null && Boolean(getFigureKey(question));
  explanationButton.classList.toggle("hidden", !available);
  explanationButton.disabled = !available;
  if (!available && explanationModal && !explanationModal.classList.contains("hidden")) {
    closeExplanation();
  }
  if (!available) checkCurrentExplanationFigure(question);
}

function closeExplanation() {
  explanationLoadId += 1;
  explanationModal?.classList.add("hidden");
  explanationModal?.setAttribute("aria-hidden", "true");
  explanationImage?.classList.add("hidden");
  explanationImage?.removeAttribute("src");
  document.body.classList.remove("modal-open");
}

function loadExplanationCandidate(sources, index, loadId) {
  if (!explanationImage || loadId !== explanationLoadId) return;
  if (index >= sources.length) {
    explanationLoading?.classList.add("hidden");
    explanationError?.classList.remove("hidden");
    return;
  }

  explanationImage.onload = () => {
    if (loadId !== explanationLoadId) return;
    explanationLoading?.classList.add("hidden");
    explanationImage.classList.remove("hidden");
  };
  explanationImage.onerror = () => loadExplanationCandidate(sources, index + 1, loadId);
  explanationImage.src = sources[index];
}

function openExplanation() {
  const question = quiz[current];
  const explanationValue = getExplanationValue(question);
  const figure = getFigureKey(question);
  if (!explanationModal || explanationValue === null || !figure) return;

  const loadId = ++explanationLoadId;
  const sources = EXPLANATION_EXTENSIONS.map(extension => buildExplanationImageUrl(figure, explanationValue, extension));

  explanationImage?.classList.add("hidden");
  explanationError?.classList.add("hidden");
  explanationLoading?.classList.remove("hidden");
  explanationModal.classList.remove("hidden");
  explanationModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  loadExplanationCandidate(sources, 0, loadId);
}

function loadQuizImage(q) {
  const img        = document.getElementById("figure");
  const figureWrap = document.getElementById("figure-wrap");
  const skeleton   = document.getElementById("img-skeleton");
  if (!img || !figureWrap) return;

  // Instantly hide any previous image and detach stale handlers.
  // A short cancellable dwell avoids hitting the image endpoint when the user
  // is only moving rapidly across questions.
  if (quizImageRequestTimer) window.clearTimeout(quizImageRequestTimer);
  quizImageRequestTimer = 0;
  const requestId = ++quizImageRequestId;
  img.classList.remove("img-ready");
  img.onload  = null;
  img.onerror = null;
  img.removeAttribute("src");

  const figVal   = String(q.figure ?? "").trim().toLowerCase();
  const noFigure = figVal === "" || figVal === "0" || figVal === "false" ||
                   figVal === "null" || figVal === "undefined";

  figureWrap.classList.remove("hidden");
  skeleton?.classList.remove("hidden");

  const requestedSource = noFigure ? "icons/wearetmm.svg" : buildFigureImageUrl(q.figure);
  let showingFallback = false;
  const reveal = () => {
    if (requestId !== quizImageRequestId) return;
    if (!noFigure && !showingFallback) loadedQuizFigures.add(requestedSource);
    skeleton?.classList.add("hidden");
    img.classList.add("img-ready");
  };

  img.onerror = function () {
    if (requestId !== quizImageRequestId) return;
    showingFallback = true;
    this.onerror = null;
    this.onload  = reveal;
    this.src     = "icons/wearetmm.svg";
  };

  img.onload = reveal;
  const startRequest = () => {
    if (requestId !== quizImageRequestId) return;
    quizImageRequestTimer = 0;
    img.src = requestedSource;
  };
  if (noFigure || loadedQuizFigures.has(requestedSource)) startRequest();
  else quizImageRequestTimer = window.setTimeout(startRequest, QUIZ_IMAGE_REQUEST_DELAY_MS);
}

function showLoading(message = "Caricamento...") {
  loadingText.innerText = message;
  loadingOverlay.classList.remove("hidden");
  loadingOverlay.setAttribute("aria-hidden", "false");
  loadingOverlay.setAttribute("aria-busy", "true");
  document.body.classList.add("loading-open");
  startQuizLoadingFigures();
}

function hideLoading() {
  stopQuizLoadingFigures();
  loadingOverlay.classList.add("hidden");
  loadingOverlay.setAttribute("aria-hidden", "true");
  loadingOverlay.setAttribute("aria-busy", "false");
  document.body.classList.remove("loading-open");
}

function returnToBook() {
  window.location.href = TRIAL_MODE ? TRIAL_HOME_ROUTE : HOME_ROUTE;
}

function rifaiScheda() {
  if (quizMode === "exam80" || quizMode === "exam30") {
    stopAllAudio();
    current = 0;
    isFinishing = false;
    loadQuiz();
    return;
  }

  if (!lastQuizSet || !lastQuizSet.length) {
    returnToBook();
    return;
  }

  stopAllAudio();
  quiz    = lastQuizSet.slice();
  answers = quiz.map(q => ({ id: q.id, answer: null }));
  beginLearningQuizSession();
  current = 0;
  isFinishing = false;

  buildProgressBar();
  showQuestion();
  startTimer();
}

// LOAD QUIZ
async function loadQuiz() {
  showLoading("Caricamento quiz...");
  let recoveryAction = null;

  try {
    const explanationFiguresRequest = refreshExplanationFigures().catch(error => {
      console.warn("[quiz] explanation figures unavailable", error?.message || error);
      return explanationFigures;
    });
    const routeInfo = getQuizRouteInfo();
    const chapters = routeInfo.chapters || "";
    if (TRIAL_MODE && !TRIAL_ALLOWED_CHAPTERS.has(chapters)) throw new Error("trial_chapter_forbidden");
    quizMode = getRequestedQuizMode();
    const url = buildQuizApiUrl("getQuiz", { chapters, mode: quizMode === "default" ? "" : quizMode });
    const data = await fetchQuizJson(url, { cache: "no-store" });

    if (data.accessToken && data.accessTokenExpiresAt) {
      saveQuizAccessToken(data.accessToken, data.accessTokenExpiresAt);
    }

    isAdmin = data.isAdmin === true;
    console.log("[quiz] admin mode", isAdmin ? "enabled" : "disabled");
    quizSessionToken = data.quizSessionToken || "";
    quizSessionTokenExpiresAt = data.quizSessionTokenExpiresAt || 0;
    if (TRIAL_MODE) {
      quizSessionToken = data.trialToken || "";
      quizSessionTokenExpiresAt = data.trialTokenExpiresAt || 0;
    }
    quizDurationMinutes = Number(data.timerMinutes) || getQuizModeConfig(quizMode).timerMinutes;
    if (!Array.isArray(data.quiz)) {
      throw new Error("invalid_quiz_response");
    }
    quiz = data.quiz;
    void explanationFiguresRequest.finally(() => checkQuizExplanationFigures(quiz));

    const modeConfig = getQuizModeConfig(quizMode);
    const titleEl = document.querySelector(".top-bar h2");
    if (titleEl) titleEl.innerText = data.title || modeConfig.title || "Quiz";
    setQuizTitle(`MagicBook | ${data.title || modeConfig.title || "Quiz"}`);

    // inizializza risposte
    answers = quiz.map(q => ({ id: q.id, answer: null }));
    beginLearningQuizSession();

    buildProgressBar();
    showQuestion();
    startTimer();
  } catch (err) {
    if (quizAccessErrorHandled) return;
    console.error("[quiz] loadQuiz failed:", err.message);
    hideLoading();
    recoveryAction = await showConfirm(
      isExamQuizMode() ? "Exam non disponibile" : "Quiz non disponibile",
      getQuizLoadErrorMessage(),
      "Riprova",
      "Torna al menu"
    );
  } finally {
    hideLoading();
  }

  if (recoveryAction === true) {
    void loadQuiz();
  } else if (recoveryAction === false) {
    returnToBook();
  }
}
loadQuiz();

let _resultScrollCleanup = null;

function attachResultScroll() {
  if (_resultScrollCleanup) { _resultScrollCleanup(); _resultScrollCleanup = null; }
  let lastY = 0;
  const handler = () => {
    const y = modalCard.scrollTop;
    if (y > 70 && y > lastY) {
      modalStats.classList.add("stats-collapsed");
    } else if (y < lastY || y < 20) {
      modalStats.classList.remove("stats-collapsed");
    }
    lastY = y;
  };
  modalCard.addEventListener("scroll", handler, { passive: true });
  _resultScrollCleanup = () => {
    modalCard.removeEventListener("scroll", handler);
    modalStats.classList.remove("stats-collapsed");
  };
}

const MODAL_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

function getModalFocusableElements() {
  return Array.from(modalCard.querySelectorAll(MODAL_FOCUSABLE_SELECTOR))
    .filter(element => !element.closest(".hidden") && element.getClientRects().length > 0);
}

function focusModalDialog() {
  modalCard.setAttribute("tabindex", "-1");
  try {
    modalCard.focus({ preventScroll: true });
  } catch (_) {
    modalCard.focus();
  }
}

function handleModalKeyboard(event) {
  if (modal.classList.contains("hidden")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeModal(false);
    return;
  }
  if (event.key !== "Tab") return;

  const focusable = getModalFocusableElements();
  if (!focusable.length) {
    event.preventDefault();
    focusModalDialog();
    return;
  }

  const first = focusable[0];
  const last = focusable.at(-1);
  const active = document.activeElement;
  if (event.shiftKey && (active === modalCard || active === first || !modalCard.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !modalCard.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

function resetModalState() {
  reviewTranslationGeneration += 1;
  if (_resultScrollCleanup) { _resultScrollCleanup(); _resultScrollCleanup = null; }
  modal.classList.remove("modal-fullscreen");
  modalCard.classList.remove("modal-result", "modal-pass", "modal-fail");
  modalBadge.innerText = "Quiz";
  modalIconShell.classList.add("hidden");
  modalIconShell.onclick = null;
  modalIconShell.removeAttribute("role");
  modalIconShell.removeAttribute("tabindex");
  modalIconShell.removeAttribute("aria-label");
  if (modalResultVideo) {
    modalResultVideo.pause();
    modalResultVideo.onerror = null;
    modalResultVideo.onended = null;
    modalResultVideo.removeAttribute("src");
    modalResultVideo.load();
    modalResultVideo.classList.add("hidden");
  }
  modalIcon.classList.add("hidden");
  modalIconFallback.classList.add("hidden");
  modalStats.classList.add("hidden");
  modalReview.classList.add("hidden");
  modalReviewList.replaceChildren();
  modalRifai.style.display = "none";
  const oldBanner = document.getElementById("_result_stats_banner");
  if (oldBanner) oldBanner.remove();
}

function stopResultVideo() {
  if (!modalResultVideo) return;
  modalResultVideo.pause();
  modalResultVideo.currentTime = 0;
}

function setModalVideo(videoSrc, fallbackIconSrc, fallbackText, options = {}) {
  if (!modalResultVideo || !videoSrc) {
    setModalIcon(fallbackIconSrc, fallbackText);
    return;
  }

  const shouldMute = options.muted === true;
  const shouldLoop = options.loop !== false;
  const endIconSrc = String(options.endIconSrc || "").trim();
  modalIcon.classList.add("hidden");
  modalIconFallback.classList.add("hidden");
  modalResultVideo.src = videoSrc;
  modalResultVideo.classList.remove("hidden");
  modalResultVideo.currentTime = 0;
  modalResultVideo.loop = shouldLoop;
  modalResultVideo.muted = shouldMute;
  modalResultVideo.volume = shouldMute ? 0 : 1;
  modalIconShell.setAttribute("role", "button");
  modalIconShell.setAttribute("tabindex", "0");
  modalIconShell.setAttribute("aria-label", "Riproduci video risultato");
  modalIconShell.onclick = () => {
    modalResultVideo.muted = shouldMute;
    modalResultVideo.volume = shouldMute ? 0 : 1;
    modalResultVideo.play().catch(() => {});
  };
  modalResultVideo.onerror = () => {
    modalResultVideo.classList.add("hidden");
    setModalIcon(fallbackIconSrc, fallbackText);
  };
  modalResultVideo.onended = !shouldLoop && endIconSrc
    ? () => {
        modalResultVideo.pause();
        modalResultVideo.muted = true;
        modalResultVideo.volume = 0;
        setModalIcon(endIconSrc, fallbackText);
      }
    : null;
  modalResultVideo.play().catch(() => {
    modalResultVideo.muted = shouldMute;
    modalResultVideo.volume = shouldMute ? 0 : 1;
  });
}

function setModalIcon(iconSrc, fallbackText) {
  modalIconShell.onclick = null;
  modalIconShell.removeAttribute("role");
  modalIconShell.removeAttribute("tabindex");
  modalIconShell.removeAttribute("aria-label");
  if (modalResultVideo) modalResultVideo.onended = null;

  if (!iconSrc) {
    modalResultVideo?.classList.add("hidden");
    modalIcon.classList.add("hidden");
    modalIconFallback.innerText = fallbackText;
    modalIconFallback.classList.remove("hidden");
    return;
  }

  modalResultVideo?.classList.add("hidden");
  modalIcon.src = iconSrc;
  modalIcon.alt = modalTitle.innerText;
  modalIcon.classList.remove("hidden");
  modalIconFallback.classList.add("hidden");
  modalIcon.onerror = () => {
    modalIcon.classList.add("hidden");
    modalIconFallback.innerText = fallbackText;
    modalIconFallback.classList.remove("hidden");
  };
}

function openModal({
  title,
  message,
  confirmText = "OK",
  cancelText = "Annulla",
  showCancel = false,
  badgeText = "Quiz",
  result = null
}) {
  if (modal.classList.contains("hidden")) {
    modalFocusOrigin = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  }
  resetModalState();
  modalTitle.innerText = title;
  modalMessage.innerText = message;
  modalConfirm.innerText = confirmText;
  modalCancel.innerText = cancelText;
  modalCancel.style.display = showCancel ? "block" : "none";
  modalBadge.innerText = badgeText;

  if (result) {
    const normalizedResult = normalizeQuizResult(result);
    const total       = normalizedResult.totalQuestions;
    const corrette    = normalizedResult.correct;
    const nonRisposte = result._nonRisposte ?? 0;
    const sbagliate   = Math.max(0, total - corrette - nonRisposte);
    const isPassed    = normalizedResult.passed === true;
    const passingScore = normalizedResult.passingScore;
    const elapsedSeconds = Math.max(0, Number(normalizedResult._elapsedSeconds) || 0);

    console.log("[quiz] result →", { corrette, nonRisposte, sbagliate, total, isPassed });

    modal.classList.add("modal-fullscreen");
    modalCard.classList.add("modal-result", isPassed ? "modal-pass" : "modal-fail");
    modalIconShell.classList.remove("hidden");
    setModalVideo(
      isPassed ? RESULT_VIDEO_SOURCES.pass : RESULT_VIDEO_SOURCES.fail,
      isPassed ? "icons/promosso.png" : "icons/bocciato.png",
      isPassed ? "OK" : "X",
      {
        muted: !isPassed,
        loop: !isPassed,
        endIconSrc: isPassed ? "icons/superato.png" : ""
      }
    );

    // In exam mode, starting again must draw a new randomized exam.
    modalRifai.innerText = quizMode === "exam80" || quizMode === "exam30" ? "Nuovo Exam" : "Rifai scheda";
    modalRifai.style.display = "block";

    // ── Stats banner (fully inline — immune to CSS caching) ──
    const correttePct    = total > 0 ? (corrette    / total) * 100 : 0;
    const nonRispostePct = total > 0 ? (nonRisposte / total) * 100 : 0;
    const sbagliAtePct   = total > 0 ? (sbagliate   / total) * 100 : 0;
    const pct            = normalizedResult.scorePercentage;

    const banner = document.createElement("div");
    banner.id = "_result_stats_banner";
    banner.style.cssText = [
      "background:#ffffff",
      "border-radius:20px",
      "padding:18px 16px 14px",
      "display:flex",
      "flex-direction:column",
      "gap:12px",
      "box-shadow:0 4px 18px rgba(37,41,67,0.1)",
      "margin-bottom:4px"
    ].join(";");

    banner.innerHTML = `
      <div style="display:flex;justify-content:space-around;align-items:center;">
        <div style="text-align:center;">
          <div style="font-size:2.2rem;font-weight:900;line-height:1;color:#15d66b;">${corrette}</div>
          <div style="font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:rgba(37,41,67,.5);margin-top:4px;">Corrette</div>
        </div>
        <div style="font-size:1.4rem;font-weight:300;color:rgba(37,41,67,.15);">|</div>
        <div style="text-align:center;">
          <div style="font-size:2.2rem;font-weight:900;line-height:1;color:#8a8fa8;">${nonRisposte}</div>
          <div style="font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:rgba(37,41,67,.5);margin-top:4px;">Non risp.</div>
        </div>
        <div style="font-size:1.4rem;font-weight:300;color:rgba(37,41,67,.15);">|</div>
        <div style="text-align:center;">
          <div style="font-size:2.2rem;font-weight:900;line-height:1;color:#ee2f4b;">${sbagliate}</div>
          <div style="font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:rgba(37,41,67,.5);margin-top:4px;">Sbagliate</div>
        </div>
      </div>
      <div style="width:100%;height:14px;border-radius:999px;background:#eef0f8;overflow:hidden;display:flex;">
        <div style="height:100%;width:${correttePct.toFixed(1)}%;background:#15d66b;${correttePct > 0 && sbagliAtePct === 0 && nonRispostePct === 0 ? "border-radius:999px;" : "border-radius:999px 0 0 999px;"};transition:width .65s ease;"></div>
        <div style="height:100%;width:${nonRispostePct.toFixed(1)}%;background:#c8cad8;transition:width .65s ease;"></div>
        <div style="height:100%;width:${sbagliAtePct.toFixed(1)}%;background:#ee2f4b;${sbagliAtePct > 0 && correttePct === 0 && nonRispostePct === 0 ? "border-radius:999px;" : "border-radius:0 999px 999px 0;"};transition:width .65s ease;"></div>
      </div>
      <div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap;text-align:center;font-size:0.76rem;font-weight:700;color:rgba(37,41,67,.42);letter-spacing:.03em;">
        <span>Risultato: ${corrette}/${total} corrette</span>
        <span>Percentuale: ${pct}%</span>
        <span>Minimo richiesto: ${passingScore}/${total}</span>
        <span>Tempo impiegato: ${formatTimer(elapsedSeconds)}</span>
      </div>
    `;

    modalReview.parentNode.insertBefore(banner, modalReview);

    console.log("[quiz] stats banner injected — corrette:", corrette, "nonRisposte:", nonRisposte, "sbagliate:", sbagliate);

    // ── Render review (wrapped so a throw here can't hide the stats) ──
    try {
      const reviewItems = buildAnswerReview(normalizedResult);
      renderAnswerReview(reviewItems);
    } catch (err) {
      console.error("[quiz] review render failed:", err.message);
    }
  }

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  quizContainer?.setAttribute("inert", "");
  requestAnimationFrame(focusModalDialog);

  if (result) {
    // Reset scroll position then attach hide-on-scroll for stats
    modalCard.scrollTop = 0;
    requestAnimationFrame(() => attachResultScroll());
  }

  return new Promise(resolve => {
    modalResolver = resolve;
  });
}

function closeModal(result) {
  stopResultVideo();
  resetReviewAudioPlayer();
  reviewTranslationGeneration += 1;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  quizContainer?.removeAttribute("inert");

  const focusOrigin = modalFocusOrigin;
  modalFocusOrigin = null;
  if (focusOrigin?.isConnected) {
    requestAnimationFrame(() => focusOrigin.focus({ preventScroll: true }));
  }

  if (modalResolver) {
    modalResolver(result);
    modalResolver = null;
  }
}

function showMessage(title, message, confirmText = "Chiudi") {
  return openModal({ title, message, confirmText, showCancel: false });
}

function showConfirm(title, message, confirmText = "Conferma", cancelText = "Annulla") {
  return openModal({ title, message, confirmText, cancelText, showCancel: true });
}

function showResult(result) {
  const normalizedResult = normalizeQuizResult(result);
  return openModal({
    title:       normalizedResult.passed ? "Promosso" : "Bocciato",
    message:     normalizedResult.passed ? "Hai superato il quiz." : "Riprova e migliora il risultato.",
    confirmText: "Chiudi",
    showCancel:  false,
    badgeText:   "Esito",
    result: normalizedResult
  });
}

function normalizeAnswerValue(value) {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    if (value === 1) return 1;
    if (value === 0) return 0;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["1", "true", "vero", "v", "yes"].includes(normalized)) return 1;
    if (["0", "false", "falso", "f", "no"].includes(normalized)) return 0;
  }

  return null;
}

function answerLabel(value) {
  if (value === 1) return "Vero";
  if (value === 0) return "Falso";
  return "Non risposta";
}

function getQuestionCorrectAnswer(question = {}) {
  const possibleKeys = [
    "correct",
    "answer",
    "ans",
    "correct_answer",
    "correctAnswer",
    "correct_answer_value",
    "correctValue",
    "correct_value",
    "adminCorrectAnswer",
    "admin_correct_answer",
    "admin_answer",
    "rightAnswer",
    "right_answer",
    "risposta",
    "rispostaCorretta",
    "risposta_corretta",
    "corretta",
    "soluzione",
    "solution",
    "value"
  ];

  for (const key of possibleKeys) {
    const normalized = normalizeAnswerValue(question[key]);
    if (normalized !== null) return normalized;
  }

  return null;
}

function getServerReviewItems(result = {}) {
  const reviewArrays = [
    result.review,
    result.details,
    result.answers,
    result.results,
    result.questions
  ];

  const review = reviewArrays.find(Array.isArray);
  if (!review) return [];

  return review.map((item, index) => {
    // Match question by ID (authoritative) then fall back to index
    const qIndex = quiz.findIndex(q => String(q.id) === String(item.id));
    const qi     = qIndex !== -1 ? qIndex : index;
    const q      = quiz[qi];

    // item.correct from the server is a BOOLEAN: did the user answer correctly?
    // It is NOT the correct answer value — never use it as normalizeAnswerValue input.
    const isCorrect  = typeof item.correct === "boolean"   ? item.correct
                     : typeof item.isCorrect === "boolean" ? item.isCorrect
                     : false;

    const userAnswer = normalizeAnswerValue(
      item.userAnswer ?? item.user_answer ?? item.selected ?? item.selectedAnswer ?? answers[qi]?.answer
    );

    // Derive what the correct answer must have been from isCorrect + userAnswer
    let correctAnswer;
    if (isCorrect) {
      correctAnswer = userAnswer;
    } else if (userAnswer === 1) {
      correctAnswer = 0;
    } else if (userAnswer === 0) {
      correctAnswer = 1;
    } else {
      correctAnswer = null;
    }

    return {
      id:            q?.id ?? item.id ?? "",
      index:         qi + 1,
      question:      q?.question || `Domanda ${qi + 1}`,
      figure:        q?.figure ?? null,
      audioQuestion: q?.audioQuestion || q?.question || `Domanda ${qi + 1}`,
      audioFigure:   q?.audioFigure ?? q?.figure ?? null,
      audioIdentityToken: q?.audioIdentityToken || "",
      helpQuestion: {
        id: q?.id ?? item.id ?? "",
        question: q?.question || item.question || `Domanda ${qi + 1}`,
        figure: q?.figure ?? item.figure ?? null,
        question_bd: q?.question_bd ?? q?.questionBD ?? item.question_bd ?? item.questionBD ?? "",
        questionTranslationSource: q?.questionTranslationSource || item.questionTranslationSource || ""
      },
      userAnswer,
      correctAnswer,
      isCorrect
    };
  });
}

function buildAnswerReview(result = {}) {
  const serverItems = getServerReviewItems(result);
  if (serverItems.length) return serverItems;

  if (!quiz.some(question => getQuestionCorrectAnswer(question) !== null)) {
    return [];
  }

  return quiz.map((question, index) => {
    const userAnswer    = normalizeAnswerValue(answers[index]?.answer);
    const correctAnswer = getQuestionCorrectAnswer(question);
    const isCorrect     = correctAnswer !== null && userAnswer !== null
      ? userAnswer === correctAnswer
      : false;

    return {
      id:            question.id ?? "",
      index:         index + 1,
      question:      question.question || `Domanda ${index + 1}`,
      figure:        question.figure ?? null,
      audioQuestion: question.audioQuestion || question.question || `Domanda ${index + 1}`,
      audioFigure:   question.audioFigure ?? question.figure ?? null,
      audioIdentityToken: question.audioIdentityToken || "",
      helpQuestion: {
        id: question.id ?? "",
        question: question.question || `Domanda ${index + 1}`,
        figure: question.figure ?? null,
        question_bd: question.question_bd ?? question.questionBD ?? "",
        questionTranslationSource: question.questionTranslationSource || ""
      },
      userAnswer,
      correctAnswer,
      isCorrect
    };
  });
}

const REVIEW_TRANSLATION_ICON_PATH = "M5.80688 18.5304C5.82459 18.5005 5.84273 18.4709 5.8613 18.4413C7.2158 16.2881 7.99991 13.7418 7.99991 11C7.99991 8.79086 9.79077 7 11.9999 7C14.209 7 15.9999 8.79086 15.9999 11C15.9999 12.017 15.9307 13.0186 15.7966 14M13.6792 20.8436C14.2909 19.6226 14.7924 18.3369 15.1707 17M19.0097 18.132C19.6547 15.8657 20 13.4732 20 11C20 6.58172 16.4183 3 12 3C10.5429 3 9.17669 3.38958 8 4.07026M3 15.3641C3.64066 14.0454 4 12.5646 4 11C4 9.54285 4.38958 8.17669 5.07026 7M11.9999 11C11.9999 14.5172 10.9911 17.7988 9.24707 20.5712";

function createReviewTranslationIcon() {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(namespace, "path");
  path.setAttribute("d", REVIEW_TRANSLATION_ICON_PATH);
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  return svg;
}

function hasBanglaText(value = "") {
  return [...String(value || "")].some(character => {
    const codePoint = character.codePointAt(0);
    return codePoint >= 0x0980 && codePoint <= 0x09ff;
  });
}

function closeReviewTranslation(button) {
  if (!button) return;
  const panel = document.getElementById(button.getAttribute("aria-controls") || "");
  if (panel) {
    setReviewTranslationExpanded(button, panel, false);
  } else {
    button.setAttribute("aria-expanded", "false");
    if (button.dataset.expandLabel) button.setAttribute("aria-label", button.dataset.expandLabel);
    button.closest(".modal-review-item")?.classList.remove("is-translation-open");
  }
}

function closeOtherReviewTranslations(currentButton) {
  modalReviewList
    .querySelectorAll('.modal-review-translation-button[aria-expanded="true"]')
    .forEach(button => {
      if (button !== currentButton) closeReviewTranslation(button);
    });
}

function setReviewTranslationExpanded(button, panel, expanded) {
  button.setAttribute("aria-expanded", String(expanded));
  const actionLabel = expanded ? button.dataset.collapseLabel : button.dataset.expandLabel;
  if (actionLabel) button.setAttribute("aria-label", actionLabel);
  panel.classList.toggle("hidden", !expanded);
  button.closest(".modal-review-item")?.classList.toggle("is-translation-open", expanded);
}

function createReviewHelpLabel(text) {
  const label = document.createElement("span");
  label.className = "modal-review-translation-label";
  label.textContent = text;
  return label;
}

function renderReviewTranslationLoading(panel) {
  panel.replaceChildren();
  panel.dataset.helpState = "loading";
  panel.setAttribute("aria-busy", "true");

  const status = document.createElement("p");
  status.className = "modal-review-translation-loading magic-loading-indicator";
  status.setAttribute("role", "status");
  const media = document.createElement("span");
  media.className = "magic-loading-indicator__media";
  media.setAttribute("aria-hidden", "true");
  const image = document.createElement("img");
  image.className = "magic-loading-indicator__image";
  image.src = "icons/loading.gif";
  image.alt = "";
  const label = document.createElement("span");
  label.className = "magic-loading-indicator__label";
  label.textContent = "Carico traduzione e parole chiave…";
  media.appendChild(image);
  status.append(media, label);
  panel.append(status);
}

function renderReviewTranslationPanel(panel, help = {}) {
  panel.replaceChildren();
  panel.dataset.helpState = help?.isPartial ? "partial" : "ready";
  panel.removeAttribute("aria-busy");

  const translationGroup = document.createElement("div");
  translationGroup.className = "modal-review-translation-group";
  translationGroup.appendChild(createReviewHelpLabel("TRADUZIONE BANGLA"));

  const translation = document.createElement("p");
  const translationText = String(help?.translation || "").trim();
  const hasTranslation = hasBanglaText(translationText);
  translation.className = "modal-review-translation-text";
  translation.classList.toggle("is-missing", !hasTranslation);
  if (hasTranslation) {
    translation.lang = "bn";
    translation.setAttribute("translate", "no");
  }
  translation.textContent = hasTranslation
    ? translationText
    : "Traduzione non disponibile al momento.";
  translationGroup.appendChild(translation);

  if (hasTranslation && help?.translationSource === "automatic") {
    const note = document.createElement("small");
    note.className = "modal-review-translation-note";
    note.textContent = "Traduzione automatica di supporto.";
    translationGroup.appendChild(note);
  }
  panel.appendChild(translationGroup);

  const contextValues = [
    { label: "Capitolo", value: String(help?.chapter?.italian || "").trim() },
    { label: "Argomento", value: String(help?.topic?.italian || "").trim() }
  ];
  const context = document.createElement("div");
  context.className = "modal-review-translation-context";
  context.setAttribute("aria-label", "Capitolo e argomento");
  contextValues.forEach(item => {
    const tag = document.createElement("span");
    const tagValue = item.value || `${item.label} non disponibile`;
    tag.className = "modal-review-translation-tag";
    tag.classList.toggle("is-missing", !item.value);
    tag.setAttribute("aria-label", `${item.label}: ${item.value || "non disponibile"}`);
    tag.textContent = item.value
      ? window.MagicItalianDisplay.uppercase(tagValue)
      : tagValue;
    context.appendChild(tag);
  });
  const wordsGroup = document.createElement("div");
  wordsGroup.className = "modal-review-translation-words-group";
  wordsGroup.appendChild(createReviewHelpLabel("PAROLE CHIAVE"));
  const words = document.createElement("div");
  words.className = "modal-review-translation-words";
  const wordItems = Array.isArray(help?.words)
    ? help.words.filter(word => String(word?.italian || "").trim() && hasBanglaText(word?.bangla))
    : [];

  if (!wordItems.length) {
    const empty = document.createElement("p");
    empty.className = "modal-review-translation-empty";
    empty.textContent = "Parole chiave non disponibili per questa domanda.";
    words.appendChild(empty);
  } else {
    wordItems.forEach(word => {
      const chip = document.createElement("span");
      chip.className = "modal-review-translation-word";
      const italian = document.createElement("strong");
      italian.textContent = window.MagicItalianDisplay.initialUppercase(word.italian);
      const bangla = document.createElement("span");
      bangla.lang = "bn";
      bangla.setAttribute("translate", "no");
      bangla.textContent = String(word.bangla || "").trim();
      chip.append(italian, bangla);
      words.appendChild(chip);
    });
  }
  wordsGroup.appendChild(words);
  panel.appendChild(wordsGroup);
  panel.appendChild(context);
}

function fallbackReviewTranslationHelp(item) {
  const translation = String(item?.helpQuestion?.question_bd || "").trim();
  return {
    translation: hasBanglaText(translation) ? translation : "",
    translationSource: item?.helpQuestion?.questionTranslationSource || "catalog",
    words: [],
    isPartial: true
  };
}

function waitForReviewTranslation(request, fallback) {
  let timeoutId = 0;
  const deadline = new Promise(resolve => {
    timeoutId = window.setTimeout(
      () => resolve({ help: fallback, timedOut: true }),
      REVIEW_TRANSLATION_WAIT_MS
    );
  });
  return Promise.race([
    Promise.resolve(request).then(help => ({ help, timedOut: false })),
    deadline
  ]).finally(() => window.clearTimeout(timeoutId));
}

async function toggleReviewTranslation(button, panel, item) {
  const isExpanded = button.getAttribute("aria-expanded") === "true";
  if (isExpanded) {
    closeReviewTranslation(button);
    return;
  }

  closeOtherReviewTranslations(button);
  setReviewTranslationExpanded(button, panel, true);
  if (["loading", "ready"].includes(panel.dataset.helpState)) return;

  const modalGeneration = reviewTranslationGeneration;
  const requestId = ++reviewTranslationRequestSequence;
  panel.dataset.requestId = String(requestId);
  renderReviewTranslationLoading(panel);

  const fallbackHelp = fallbackReviewTranslationHelp(item);
  let help = fallbackHelp;
  let helpRequest = null;
  let timedOut = false;
  try {
    const getQuestionHelp = window.QuizHelpData?.getQuestionHelp;
    if (typeof getQuestionHelp === "function") {
      helpRequest = Promise.resolve(getQuestionHelp(item.helpQuestion || item));
      const outcome = await waitForReviewTranslation(helpRequest, fallbackHelp);
      help = outcome.help;
      timedOut = outcome.timedOut;
    }
  } catch (error) {
    console.warn("[quiz] review translation unavailable", error?.message || error);
  }

  if (
    modalGeneration !== reviewTranslationGeneration
    || panel.dataset.requestId !== String(requestId)
    || !panel.isConnected
  ) return;
  if (button.getAttribute("aria-expanded") !== "true") {
    panel.dataset.helpState = "idle";
    panel.removeAttribute("aria-busy");
    panel.replaceChildren();
    return;
  }
  renderReviewTranslationPanel(panel, help);

  if (timedOut && helpRequest) {
    const renderLateHelp = lateHelp => {
      if (
        modalGeneration !== reviewTranslationGeneration
        || panel.dataset.requestId !== String(requestId)
        || !panel.isConnected
        || button.getAttribute("aria-expanded") !== "true"
      ) return;
      renderReviewTranslationPanel(panel, lateHelp);
    };

    void helpRequest.then(renderLateHelp).catch(() => {});

    if (!hasBanglaText(help?.translation)) {
      const question = item.helpQuestion || item;
      const cacheKey = `${String(question?.id || item.index)}_bn_help`;
      void fetchBengaliAudio(question, cacheKey, {
        requireAudio: false,
        skipRuntimeLookup: true
      }).then(translated => {
        const translation = String(translated?.translation || "").trim();
        if (!hasBanglaText(translation)) return;
        renderLateHelp({
          ...fallbackHelp,
          translation,
          translationSource: String(translated?.translationSource || "automatic"),
          isPartial: true
        });
      }).catch(() => {});
    }
  }
}

function createReviewTranslationDisclosure(item) {
  const panelId = `modal-review-translation-${item.index}`;
  const buttonId = `${panelId}-button`;
  const tools = document.createElement("div");
  tools.className = "modal-review-tools";

  const button = document.createElement("button");
  button.type = "button";
  button.id = buttonId;
  button.className = "modal-review-translation-button";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", panelId);
  button.dataset.expandLabel = `Mostra traduzione Bangla e parole chiave della domanda ${item.index}`;
  button.dataset.collapseLabel = `Nascondi traduzione Bangla e parole chiave della domanda ${item.index}`;
  button.setAttribute("aria-label", button.dataset.expandLabel);

  const icon = document.createElement("span");
  icon.className = "modal-review-translation-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.appendChild(createReviewTranslationIcon());
  const label = document.createElement("span");
  label.className = "modal-review-translation-button-label";
  label.lang = "bn";
  label.setAttribute("translate", "no");
  label.textContent = "বাংলা";
  button.append(icon, label);
  tools.appendChild(button);

  const panel = document.createElement("section");
  panel.id = panelId;
  panel.className = "modal-review-translation-panel hidden";
  panel.dataset.helpState = "idle";
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-labelledby", buttonId);
  panel.setAttribute("translate", "no");
  button.addEventListener("click", event => {
    event.stopPropagation();
    void toggleReviewTranslation(button, panel, item);
  });

  return { tools, panel };
}

function renderAnswerReview(items = []) {
  resetReviewAudioPlayer();
  modalReviewList.replaceChildren();

  if (!items.length) {
    modalReview.classList.add("hidden");
    return;
  }

  const fragment = document.createDocumentFragment();

  items.forEach(item => {
    const isUnanswered = item.userAnswer === null || item.userAnswer === undefined;
    const stateClass   = item.isCorrect ? "is-correct" : isUnanswered ? "is-unanswered" : "is-wrong";

    const row = document.createElement("div");
    row.className = `modal-review-item ${stateClass}`;

    const status = document.createElement("span");
    status.className = "modal-review-status";
    status.textContent = item.isCorrect ? "Corretta" : isUnanswered ? "Non risp." : "Sbagliata";

    const title = document.createElement("strong");
    title.className = "modal-review-question";
    title.textContent = `${item.index}. ${item.question}`;

    const answersText = document.createElement("p");
    answersText.className = "modal-review-answer";
    answersText.textContent = isUnanswered
      ? `Non risposta | Corretta: ${answerLabel(item.correctAnswer)}`
      : `La tua risposta: ${answerLabel(item.userAnswer)} | Corretta: ${answerLabel(item.correctAnswer)}`;

    const translationDisclosure = createReviewTranslationDisclosure(item);
    row.append(status, title, answersText, translationDisclosure.tools);

    const reviewAudioControl = document.createElement("button");
    reviewAudioControl.type = "button";
    reviewAudioControl.className = "modal-review-audio-button magic-loading-control";
    reviewAudioControl.classList.toggle("is-trial-locked", TRIAL_MODE);
    reviewAudioControl.dataset.audioLabel = `Ascolta la spiegazione audio della domanda ${item.index}`;
    setReviewAudioButtonState(reviewAudioControl, "idle");

    const explainIcon = document.createElement("img");
    explainIcon.className = "modal-review-explain-icon";
    explainIcon.src = "icons/explain_quiz.svg";
    explainIcon.alt = "";
    explainIcon.setAttribute("aria-hidden", "true");
    explainIcon.loading = "lazy";
    explainIcon.decoding = "async";
    reviewAudioControl.appendChild(explainIcon);
    reviewAudioControl.addEventListener("click", event => {
      event.stopPropagation();
      if (TRIAL_MODE) openTrialAudioOffer("Spiegazioni audio");
      else toggleReviewAudio(reviewAudioControl, item);
    });

    // Show question image if present
    const figVal = String(item.figure ?? "").trim().toLowerCase();
    const hasFig = figVal !== "" && figVal !== "0" && figVal !== "false" &&
                   figVal !== "null" && figVal !== "undefined";
    if (hasFig) {
      row.classList.add("has-figure");
      const figureShell = document.createElement("div");
      figureShell.className = "modal-review-figure-shell";
      const img = document.createElement("img");
      img.className = "modal-review-img";
      img.alt = "";
      img.src = buildFigureImageUrl(item.figure);
      img.onerror = function () { this.remove(); };
      figureShell.appendChild(img);
      figureShell.appendChild(reviewAudioControl);
      row.appendChild(figureShell);
    } else {
      row.appendChild(reviewAudioControl);
    }

    row.appendChild(translationDisclosure.panel);

    fragment.appendChild(row);
  });

  modalReviewList.appendChild(fragment);
  modalReview.classList.remove("hidden");
}

modalConfirm.addEventListener("click", () => closeModal(true));
modalCancel.addEventListener("click", () => closeModal(false));
modalRifai.addEventListener("click", () => closeModal("rifai"));
modal.addEventListener("click", event => {
  if (event.target === modal) closeModal(false);
});
modal.addEventListener("keydown", handleModalKeyboard);
explanationClose?.addEventListener("click", closeExplanation);
explanationModal?.addEventListener("click", event => {
  if (event.target === explanationModal) closeExplanation();
});

/***********************
 * PROGRESS BAR
 ***********************/

function buildProgressBar() {
  const bar = document.getElementById("progress");
  bar.innerHTML = "";
  quiz.forEach((_, i) => {
    const btn = document.createElement("button");
    btn.className = "progress-dot progress-dot--unanswered";
    btn.textContent = i + 1;
    btn.setAttribute("aria-label", `Vai alla domanda ${i + 1}`);
    btn.addEventListener("click", () => {
      stopAllAudio();
      current = i;
      showQuestion();
    });
    bar.appendChild(btn);
  });
}

function updateProgressBar() {
  const dots = document.querySelectorAll(".progress-dot");
  dots.forEach((dot, i) => {
    dot.classList.remove("progress-dot--answered", "progress-dot--current", "progress-dot--unanswered");
    if (i === current) {
      dot.classList.add("progress-dot--current");
    } else if (answers[i]?.answer !== null) {
      dot.classList.add("progress-dot--answered");
    } else {
      dot.classList.add("progress-dot--unanswered");
    }
  });

  // Scroll current dot into view
  const currentDot = dots[current];
  if (currentDot) {
    currentDot.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }
}

function updateFinishButtonState() {
  const isLastQuestion = current === quiz.length - 1;
  const canHighlightFinish = isLastQuestion && allAnswered();

  nextButton.classList.toggle("is-finish", isLastQuestion);
  nextButton.classList.toggle("finish-attention", canHighlightFinish);
  nextIconWrap.classList.toggle("hidden", isLastQuestion);
  nextLabel.classList.toggle("hidden", !isLastQuestion);
  nextButton.setAttribute("aria-label", isLastQuestion ? "Fine quiz" : "Avanti");
  prevButton.disabled = current === 0;
}

async function exitQuiz() {
  const confirmed = await showConfirm(
    "Uscire dal quiz?",
    "Se esci adesso, tornerai al libro e il quiz non verra completato.",
    "Esci",
    "Resta qui"
  );

  if (!confirmed) return;

  stopAllAudio();
  returnToBook();
}

// MOSTRA DOMANDA
function updateAdminCorrectDots(question) {
  const wrappers = document.querySelectorAll(".answer-wrapper[data-answer-value]");
  const correctAnswer = getQuestionCorrectAnswer(question);

  wrappers.forEach(wrapper => {
    const slot = wrapper.querySelector(".admin-correct-dot-slot");
    if (!slot) return;
    slot.replaceChildren();
    slot.classList.remove("is-visible");
    slot.removeAttribute("role");
    slot.removeAttribute("aria-label");

    const optionValue = normalizeAnswerValue(wrapper.dataset.answerValue);
    if (!isAdmin || correctAnswer === null || optionValue !== correctAnswer) return;

    const dot = document.createElement("span");
    dot.className = "admin-correct-dot";
    dot.classList.add(optionValue === 1 ? "admin-correct-dot--true" : "admin-correct-dot--false");
    dot.setAttribute("aria-hidden", "true");
    slot.classList.add("is-visible");
    slot.setAttribute("role", "note");
    slot.setAttribute("aria-label", `Risposta corretta per Admin: ${answerLabel(optionValue)}`);
    slot.appendChild(dot);
  });
}

function showQuestion() {
  const q = quiz[current];
  markLearningQuestionVisible();
  if (inlineAudioRecording && inlineAudioRecording.questionIndex !== current) closeInlineAudioRecorder();
  quizAudioAdminTools?.classList.toggle("hidden", !isAdmin || TRIAL_MODE);
  updateQuizAudioAdminTool(false);
  const veroBtn = document.getElementById("vero");
  const falsoBtn = document.getElementById("falso");
  document.getElementById("question").innerText = q.question;
  updateProgressBar();
  updateTrialAudioButtons(q);

  loadQuizImage(q);
  updateExplanationButton(q);
  void updateSharedAudioAvailability(q);

  // reset bottoni
  veroBtn.classList.remove("selected", "tap-feedback");
  falsoBtn.classList.remove("selected", "tap-feedback");

  // evidenzia risposta salvata
  if (answers[current].answer === 1) {
    veroBtn.classList.add("selected");
  } else if (answers[current].answer === 0) {
    falsoBtn.classList.add("selected");
  }

  updateFinishButtonState();
  updateAdminCorrectDots(q);
}

// RISPOSTA
function answer(val) {
  const veroBtn = document.getElementById("vero");
  const falsoBtn = document.getElementById("falso");
  const selectedBtn = document.getElementById(val === 1 ? "vero" : "falso");
  const otherBtn = val === 1 ? falsoBtn : veroBtn;

  answers[current].answer = val;
  queueLearningAnswer(val);

  // mantiene una sola risposta selezionata per volta
  veroBtn.classList.remove("selected", "tap-feedback");
  falsoBtn.classList.remove("selected", "tap-feedback");
  otherBtn.classList.remove("selected", "tap-feedback");

  selectedBtn.classList.remove("tap-feedback");
  void selectedBtn.offsetWidth;
  selectedBtn.classList.add("selected", "tap-feedback");
  updateFinishButtonState();
  updateProgressBar();
}

// NAVIGAZIONE
function next() {
  stopAllAudio();
  if (current < quiz.length - 1) {
    current++;
    showQuestion();
    return;
  }
  finishQuiz();
}

function prev() {
  stopAllAudio();
  if (current > 0) {
    current--;
    showQuestion();
  }
}

// TIMER
let timerInterval = null;

function getElapsedQuizSeconds() {
  const maxSeconds = quizDurationMinutes * 60;
  const elapsedSeconds = !quizStartedAt
    ? Math.max(0, maxSeconds - time)
    : Math.max(0, Math.floor((Date.now() - quizStartedAt) / 1000));
  return isAdmin ? elapsedSeconds : Math.min(maxSeconds, elapsedSeconds);
}

function paintQuizTimer() {
  const timer = document.getElementById("timer");
  if (!timer) return;
  const presentation = getQuizTimerPresentation(time, isAdmin);
  timer.innerText = presentation.text;
  timer.setAttribute("aria-label", presentation.ariaLabel);
  timer.classList.toggle("is-overtime", presentation.isOvertime);
}

function startTimer() {
  clearInterval(timerInterval);
  time = quizDurationMinutes * 60;
  quizStartedAt = Date.now();
  paintQuizTimer();
  timerInterval = setInterval(() => {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - quizStartedAt) / 1000));
    time = quizDurationMinutes * 60 - elapsedSeconds;
    paintQuizTimer();
    if (time <= 0 && !isAdmin) {
      clearInterval(timerInterval);
      finishQuiz(true);
    }
  }, 1000);
}

// CONTROLLO RISPOSTE
function allAnswered() {
  return answers.every(a => a.answer !== null);
}

// FINE QUIZ
async function finishQuiz(forceFinish = false) {
  if (isFinishing) return;

  if (!forceFinish && !allAnswered()) {
    const confirmed = await showConfirm(
      "Risposte mancanti",
      "Non hai risposto a tutte le domande. Vuoi finire comunque?",
      "Si, termina",
      "Continua quiz"
    );

    if (!confirmed) return;
  }

  isFinishing = true;
  const elapsedSeconds = getElapsedQuizSeconds();
  showLoading("Controllo risultato...");

  // Count unanswered questions before sending
  const nonRisposte = answers.filter(a => a.answer === null).length;

  // Save the current quiz set so "Rifai scheda" can reuse it
  lastQuizSet = quiz.slice();

  // Validate payload integrity before sending.
  // Each entry must have a non-null id and a numeric answer (0 or 1).
  // Unanswered questions are sent as null — the server treats them as wrong.
  const payload = answers.map((a, i) => {
    const id = quiz[i]?.id ?? a.id;
    const answer = (a.answer === 1 || a.answer === 0) ? a.answer : null;
    return { id, answer };
  });

  const missingIds = payload.filter(a => a.id === null || a.id === undefined);
  if (missingIds.length > 0) {
    console.warn("[quiz] payload has entries with missing question IDs:", missingIds.length);
  }

  try {
    console.log("[quiz] submitting answers", payload.length);

    const data = await fetchQuizJson(TRIAL_MODE ? "/api/trial" : "/api/quiz?action=checkQuiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: TRIAL_MODE ? "checkQuiz" : undefined,
        trialId: TRIAL_MODE ? getQuizDeviceId() : undefined,
        trialToken: TRIAL_MODE ? getQuizSessionToken() : undefined,
        phone: getQuizPhone(),
        deviceId: getQuizDeviceId(),
        answers: payload
      })
    });

    const result = normalizeQuizResult(data, payload.length);
    result._nonRisposte = nonRisposte;
    result._elapsedSeconds = elapsedSeconds;

    clearInterval(timerInterval);
    hideLoading();
    const action = await showResult(result);

    if (action === "rifai") {
      rifaiScheda();
    } else {
      returnToBook();
    }
  } catch (err) {
    if (quizAccessErrorHandled) return;
    hideLoading();
    await showMessage(
      "Risultato non disponibile",
      "Non siamo riusciti a controllare il risultato. Verifica la connessione e riprova."
    );
    console.error("[quiz] finishQuiz failed:", err.message);
  } finally {
    hideLoading();
    isFinishing = false;
  }
}
