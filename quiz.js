// ─────────────────────────────────────────────────────────────────────────────
// QUIZ API CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const CLIENT_AUTH_RESET_VERSION = "2026-04-device-reset-1";
const CLIENT_AUTH_RESET_KEY = "client_auth_reset_version";
const RESULT_PREVIEW_MODE = new URLSearchParams(window.location.search).get("previewResult");
const RESULT_VIDEO_SOURCES = {
  pass: "pial_vhai%20applauso.mp4",
  fail: "delusione.mp4"
};
const PASSING_SCORE_RATIO = 0.9;

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

if (!hasCurrentClientAuthResetVersion() && !RESULT_PREVIEW_MODE) {
  window.location.href = "index.html";
  throw new Error("client_auth_reset_required");
}

const QUIZ_API = "/api/quiz";
const BASE_IMG_URL = "https://pub-21131aa867534601af79c34beb746fb7.r2.dev/Figure/";

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
  if (RESULT_PREVIEW_MODE) {
    return {
      phone: "preview",
      deviceId: "preview",
      accessToken: "",
      accessTokenExpiresAt: 0
    };
  }

  const session = getQuizSession();
  if (!session) {
    window.location.href = "index.html";
    throw new Error("missing_quiz_session");
  }
  return session;
}

const QUIZ_SESSION = requireQuizSession();

function getQuizPhone() {
  return QUIZ_SESSION.phone;
}

function getQuizDeviceId() {
  return QUIZ_SESSION.deviceId;
}

function getQuizAccessToken() {
  return localStorage.getItem("accessToken") || QUIZ_SESSION.accessToken || "";
}

function saveQuizAccessToken(accessToken, accessTokenExpiresAt) {
  if (!accessToken || !accessTokenExpiresAt) return;
  QUIZ_SESSION.accessToken = accessToken;
  QUIZ_SESSION.accessTokenExpiresAt = accessTokenExpiresAt;
  localStorage.setItem("accessToken", accessToken);
  localStorage.setItem("accessTokenExpiresAt", String(accessTokenExpiresAt));

  try {
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

function getQuizSessionToken() {
  return quizSessionToken;
}

function buildQuizApiUrl(action, params = {}) {
  const query = new URLSearchParams({
    action,
    phone: getQuizPhone(),
    deviceId: getQuizDeviceId(),
    accessToken: getQuizAccessToken()
  });

  const activeQuizToken = getQuizSessionToken();
  if (activeQuizToken) query.set("quizSessionToken", activeQuizToken);

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

function isQuizAccessError(error) {
  return ["expired", "not_found", "device_replaced", "device_mismatch", "unauthorized", "quiz_session_expired"].includes(error);
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
    window.location.href = "index.html";
  }
}

async function fetchQuizJson(url, options = {}) {
  const response = await fetch(url, options);

  let data = null;
  try {
    data = await response.json();
  } catch (err) {
    data = null;
  }

  const error = data?.error;
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
let time = 20 * 60;
let isFinishing = false;
let lastQuizSet = null;
let isAdmin = false;
let modalResolver = null;
let isTtsPlaying = false;
let isBengaliPlaying = false;
let italianAudioId = 0;
let banglaAudioId = 0;
let googleItalianAudio = null;
let googleTTSAudio = null;
const italianAudioCache = {};
const bengaliAudioCache = {};

const modal = document.getElementById("custom-modal");
const modalCard = modal.querySelector(".modal-card");
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
const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-text");
const prevButton = document.getElementById("prev-btn");
const nextButton = document.getElementById("next-btn");
const nextIconWrap = document.getElementById("next-icon-wrap");
const nextLabel = document.getElementById("next-label");

/***********************
 * AUDIO
 ***********************/

const italianAudioBtn = document.querySelector(".audio-btn[aria-label='Ascolta in italiano']");
const banglaAudioBtn  = document.querySelector(".audio-btn[aria-label='Ascolta in Bengali']");

let _audioToastTimer = null;

function showAudioUnavailableToast(message = "Audio non disponibile") {
  const toast = document.getElementById("audio-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(_audioToastTimer);
  _audioToastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function stopAllAudio() {
  italianAudioId++;
  banglaAudioId++;
  if (googleItalianAudio) {
    googleItalianAudio.pause();
    googleItalianAudio.src = "";
    googleItalianAudio = null;
  }
  if (googleTTSAudio) {
    googleTTSAudio.pause();
    googleTTSAudio.src = "";
    googleTTSAudio = null;
  }
  isTtsPlaying = false;
  isBengaliPlaying = false;
  italianAudioBtn?.classList.remove("is-playing", "is-loading");
  banglaAudioBtn?.classList.remove("is-playing", "is-loading");
}

async function fetchItalianAudio(text, cacheKey) {
  if (italianAudioCache[cacheKey]) return italianAudioCache[cacheKey];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetchQuizJson(
      buildQuizApiUrl("getItalianAudio", { text }),
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    const data = res;
    if (!data.audio) throw new Error(data.error || "no audio in response");
    italianAudioCache[cacheKey] = data;
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

function speakItalian() {
  if (!quiz.length) return;
  const q = quiz[current];
  if (!q || !q.question) return;

  if (isTtsPlaying) {
    stopAllAudio();
    return;
  }

  stopAllAudio();
  const myId = italianAudioId;
  italianAudioBtn?.classList.add("is-loading");

  const cacheKey = String(q.id || current) + "_it";

  fetchItalianAudio(q.question, cacheKey)
    .then(data => {
      if (italianAudioId !== myId) return;
      italianAudioBtn?.classList.remove("is-loading");

      const binary = atob(data.audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));

      const audio = new Audio(blobUrl);
      googleItalianAudio = audio;
      isTtsPlaying = true;
      italianAudioBtn?.classList.add("is-playing");

      const done = () => {
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

// Calls GAS endpoint that: translates Italian→Bengali with LanguageApp.translate()
// (real Google Translate quality), fetches TTS audio server-side, caches result.
// Returns { audio: base64_mp3, translation: bengaliText }.
async function fetchBengaliAudio(italianText, cacheKey) {
  if (bengaliAudioCache[cacheKey]) return bengaliAudioCache[cacheKey];

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetchQuizJson(
      buildQuizApiUrl("getBengaliAudio", { text: italianText }),
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    const data = res;
    if (!data.audio) throw new Error(data.error || "no audio in response");
    bengaliAudioCache[cacheKey] = data;
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

function prefetchBengali(index) {
  if (index < 0 || index >= quiz.length) return;
  const q = quiz[index];
  if (!q?.question) return;
  const cacheKey = String(q.id || index) + "_bn";
  if (bengaliAudioCache[cacheKey]) return;
  fetchBengaliAudio(q.question, cacheKey).catch(() => {});
}

function prefetchItalian(index) {
  if (index < 0 || index >= quiz.length) return;
  const q = quiz[index];
  if (!q?.question) return;
  const cacheKey = String(q.id || index) + "_it";
  if (italianAudioCache[cacheKey]) return;
  fetchItalianAudio(q.question, cacheKey).catch(() => {});
}

// Bengali TTS — single reliable path via GAS proxy.
// GAS uses LanguageApp.translate() for high-quality translation and fetches
// TTS server-side so no browser CORS/403 restrictions apply.
// banglaAudioId guards stale async callbacks after navigation.
function playBanglaAudio() {
  if (!quiz.length) return;
  const q = quiz[current];
  if (!q || !q.question) return;

  if (isBengaliPlaying) {
    stopAllAudio();
    return;
  }

  stopAllAudio();
  const myId = banglaAudioId;
  banglaAudioBtn?.classList.add("is-loading");

  const cacheKey = String(q.id || current) + "_bn";

  fetchBengaliAudio(q.question, cacheKey)
    .then(data => {
      if (banglaAudioId !== myId) return;
      banglaAudioBtn?.classList.remove("is-loading");
      console.log("[Bengali TTS] Translation:", data.translation);

      const binary = atob(data.audio);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));

      const audio = new Audio(blobUrl);
      googleTTSAudio = audio;
      isBengaliPlaying = true;
      banglaAudioBtn?.classList.add("is-playing");

      const done = () => {
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
      showAudioUnavailableToast("Bengali non disponibile");
    });
}

/***********************
 * IMAGE LOADER
 ***********************/

function loadQuizImage(q) {
  const img        = document.getElementById("figure");
  const figureWrap = document.getElementById("figure-wrap");
  const skeleton   = document.getElementById("img-skeleton");
  if (!img || !figureWrap) return;

  // Instantly hide any previous image and detach stale handlers
  img.classList.remove("img-ready");
  img.onload  = null;
  img.onerror = null;
  img.src     = "";

  const figVal   = String(q.figure ?? "").trim().toLowerCase();
  const noFigure = figVal === "" || figVal === "0" || figVal === "false" ||
                   figVal === "null" || figVal === "undefined";

  figureWrap.classList.remove("hidden");
  skeleton?.classList.remove("hidden");

  const reveal = () => {
    skeleton?.classList.add("hidden");
    img.classList.add("img-ready");
  };

  img.onerror = function () {
    this.onerror = null;
    this.onload  = reveal;
    this.src     = "icons/wearetmm.svg";
  };

  img.onload = reveal;
  img.src    = noFigure
    ? "icons/wearetmm.svg"
    : BASE_IMG_URL + q.figure + ".jpg";
}

function showLoading(message = "Caricamento...") {
  loadingText.innerText = message;
  loadingOverlay.classList.remove("hidden");
  loadingOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("loading-open");
}

function hideLoading() {
  loadingOverlay.classList.add("hidden");
  loadingOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("loading-open");
}

function showResultPreviewLauncher(result) {
  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.innerText = "VEDI ANTEPRIMA VIDEO";
  launcher.style.cssText = [
    "position:fixed",
    "left:50%",
    "top:50%",
    "transform:translate(-50%,-50%)",
    "z-index:1200",
    "border:0",
    "border-radius:18px",
    "padding:18px 22px",
    "background:#252943",
    "color:#fff",
    "font-weight:900",
    "font-size:1rem",
    "box-shadow:0 18px 40px rgba(37,41,67,.28)",
    "cursor:pointer"
  ].join(";");
  launcher.addEventListener("click", () => {
    launcher.remove();
    showResult(result);
  }, { once: true });
  document.body.appendChild(launcher);
}

function returnToBook() {
  window.location.href = "index.html";
}

function rifaiScheda() {
  if (!lastQuizSet || !lastQuizSet.length) {
    returnToBook();
    return;
  }

  stopAllAudio();
  quiz    = lastQuizSet.slice();
  answers = quiz.map(q => ({ id: q.id, answer: null }));
  current = 0;
  isFinishing = false;

  buildProgressBar();
  showQuestion();
  startTimer();
}

// LOAD QUIZ
async function loadQuiz() {
  showLoading("Caricamento quiz...");

  try {
    const params   = new URLSearchParams(window.location.search);
    if (RESULT_PREVIEW_MODE) {
      const isPassedPreview = RESULT_PREVIEW_MODE.toLowerCase() !== "fail";
      isAdmin = params.get("previewAdmin") === "1";
      const previewTotal = isPassedPreview ? 8 : 18;
      const previewCorrect = isPassedPreview ? 8 : 16;
      quiz = Array.from({ length: previewTotal }, (_, index) => ({
        id: `preview-${index + 1}`,
        question: "Anteprima risultato quiz con video nel cerchio.",
        figure: "",
        correct_answer: index % 2
      }));
      answers = quiz.map((q, index) => ({
        id: q.id,
        answer: index < previewCorrect ? q.correct_answer : null
      }));
      lastQuizSet = quiz.slice();

      buildProgressBar();
      showQuestion();

      setTimeout(() => {
        hideLoading();
        showResultPreviewLauncher(normalizeQuizResult({
          correct: previewCorrect,
          _nonRisposte: 1,
          review: []
        }, previewTotal));
      });
      return;
    }

    const chapters = params.get("chapters") || "";
    const url = buildQuizApiUrl("getQuiz", { chapters });
    const data = await fetchQuizJson(url);

    if (data.accessToken && data.accessTokenExpiresAt) {
      saveQuizAccessToken(data.accessToken, data.accessTokenExpiresAt);
    }

    isAdmin = data.isAdmin === true;
    quizSessionToken = data.quizSessionToken || "";
    quizSessionTokenExpiresAt = data.quizSessionTokenExpiresAt || 0;
    quiz = data.quiz;

    if (!Array.isArray(quiz)) {
      throw new Error("invalid_quiz_response");
    }

    // inizializza risposte
    answers = quiz.map(q => ({ id: q.id, answer: null }));

    buildProgressBar();
    showQuestion();
  } catch (err) {
    if (quizAccessErrorHandled) return;
    showMessage("Errore", "Errore caricamento quiz");
    console.error("[quiz] loadQuiz failed:", err.message);
  } finally {
    hideLoading();
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

function resetModalState() {
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
    modalResultVideo.removeAttribute("src");
    modalResultVideo.load();
    modalResultVideo.classList.add("hidden");
  }
  modalIcon.classList.add("hidden");
  modalIconFallback.classList.add("hidden");
  modalStats.classList.add("hidden");
  modalReview.classList.add("hidden");
  modalReviewList.innerHTML = "";
  modalRifai.style.display = "none";
  const oldBanner = document.getElementById("_result_stats_banner");
  if (oldBanner) oldBanner.remove();
}

function stopResultVideo() {
  if (!modalResultVideo) return;
  modalResultVideo.pause();
  modalResultVideo.currentTime = 0;
}

function setModalVideo(videoSrc, fallbackIconSrc, fallbackText) {
  if (!modalResultVideo || !videoSrc) {
    setModalIcon(fallbackIconSrc, fallbackText);
    return;
  }

  modalIcon.classList.add("hidden");
  modalIconFallback.classList.add("hidden");
  modalResultVideo.src = videoSrc;
  modalResultVideo.classList.remove("hidden");
  modalResultVideo.currentTime = 0;
  modalResultVideo.loop = true;
  modalResultVideo.muted = false;
  modalResultVideo.volume = 1;
  modalIconShell.setAttribute("role", "button");
  modalIconShell.setAttribute("tabindex", "0");
  modalIconShell.setAttribute("aria-label", "Riproduci video risultato");
  modalIconShell.onclick = () => {
    modalResultVideo.muted = false;
    modalResultVideo.volume = 1;
    modalResultVideo.play().catch(() => {});
  };
  modalResultVideo.onerror = () => {
    modalResultVideo.classList.add("hidden");
    setModalIcon(fallbackIconSrc, fallbackText);
  };
  modalResultVideo.play().catch(() => {
    modalResultVideo.muted = false;
  });
}

function setModalIcon(iconSrc, fallbackText) {
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

    console.log("[quiz] result →", { corrette, nonRisposte, sbagliate, total, isPassed });

    modal.classList.add("modal-fullscreen");
    modalCard.classList.add("modal-result", isPassed ? "modal-pass" : "modal-fail");
    modalIconShell.classList.remove("hidden");
    setModalVideo(
      isPassed ? RESULT_VIDEO_SOURCES.pass : RESULT_VIDEO_SOURCES.fail,
      isPassed ? "icons/promosso.png" : "icons/bocciato.png",
      isPassed ? "OK" : "X"
    );

    // Show "Rifai scheda" button
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
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");

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
    "correctAnswer",
    "rightAnswer",
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
      index:         qi + 1,
      question:      q?.question || `Domanda ${qi + 1}`,
      figure:        q?.figure ?? null,
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
      index:         index + 1,
      question:      question.question || `Domanda ${index + 1}`,
      figure:        question.figure ?? null,
      userAnswer,
      correctAnswer,
      isCorrect
    };
  });
}

function renderAnswerReview(items = []) {
  modalReviewList.innerHTML = "";

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

    row.append(status, title, answersText);

    // Show question image if present
    const figVal = String(item.figure ?? "").trim().toLowerCase();
    const hasFig = figVal !== "" && figVal !== "0" && figVal !== "false" &&
                   figVal !== "null" && figVal !== "undefined";
    if (hasFig) {
      const img = document.createElement("img");
      img.className = "modal-review-img";
      img.alt = "";
      img.src = BASE_IMG_URL + item.figure + ".jpg";
      img.onerror = function () { this.remove(); };
      row.appendChild(img);
    }

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
    slot.innerHTML = "";

    const optionValue = normalizeAnswerValue(wrapper.dataset.answerValue);
    if (!isAdmin || correctAnswer === null || optionValue !== correctAnswer) return;

    const dot = document.createElement("span");
    dot.className = "admin-correct-dot";
    dot.setAttribute("aria-hidden", "true");
    slot.appendChild(dot);
  });
}

function showQuestion() {
  const q = quiz[current];
  const veroBtn = document.getElementById("vero");
  const falsoBtn = document.getElementById("falso");
  document.getElementById("question").innerText = q.question;
  updateProgressBar();

  loadQuizImage(q);

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
  prefetchBengali(current + 1);
  prefetchBengali(current - 1);
  prefetchItalian(current + 1);
  prefetchItalian(current - 1);
}

// RISPOSTA
function answer(val) {
  const veroBtn = document.getElementById("vero");
  const falsoBtn = document.getElementById("falso");
  const selectedBtn = document.getElementById(val === 1 ? "vero" : "falso");
  const otherBtn = val === 1 ? falsoBtn : veroBtn;

  answers[current].answer = val;

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

function startTimer() {
  clearInterval(timerInterval);
  time = 20 * 60;
  document.getElementById("timer").innerText = "20:00";
  timerInterval = setInterval(() => {
    time--;
    let m = Math.floor(time / 60);
    let s = time % 60;
    document.getElementById("timer").innerText =
      `${m}:${s < 10 ? "0" : ""}${s}`;
    if (time <= 0) {
      clearInterval(timerInterval);
      finishQuiz(true);
    }
  }, 1000);
}

startTimer();

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

    const data = await fetchQuizJson("/api/quiz?action=checkQuiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: getQuizPhone(),
        deviceId: getQuizDeviceId(),
        quizSessionToken: getQuizSessionToken(),
        answers: payload
      })
    });

    const result = normalizeQuizResult(data, payload.length);
    result._nonRisposte = nonRisposte;

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
    await showMessage("Errore", "Errore invio risposte");
    console.error("[quiz] finishQuiz failed:", err.message);
  } finally {
    hideLoading();
    isFinishing = false;
  }
}

/***********************
 * CONTENT PROTECTION
 ***********************/
document.addEventListener("contextmenu", e => e.preventDefault());
document.addEventListener("dragstart",   e => e.preventDefault());
document.addEventListener("copy",        e => e.preventDefault());
