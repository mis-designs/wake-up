// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT CONFIG
// This is lightweight obfuscation only — NOT cryptographic security.
// Anyone with DevTools can still decode it.  For real security route requests
// through a backend proxy (Node/PHP/etc.) and store the real URL in an env var.
//
// To update the URL:  open the browser console and run
//   btoa("https://your-new-gas-url.../exec")
// then paste the result as the value of _e below.
// ─────────────────────────────────────────────────────────────────────────────
const _e = "aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J6Q21VOFp6VnpQeDJFMUtrem5qaU9ycUwwSWlDdUdWQ2ZTdC1XTldEeThPU1J0NFg2eGJDVVhmNGpnbnFrVi1aaHQvZXhlYw==";
const API = (() => { try { return atob(_e); } catch (_) { return ""; } })();
const BASE_IMG_URL = "https://pub-21131aa867534601af79c34beb746fb7.r2.dev/Figure/";

let quiz = [];
let answers = [];
let current = 0;
let time = 20 * 60;
let isFinishing = false;
let lastQuizSet = null;
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
    const res = await fetch(
      API + "?action=getItalianAudio&text=" + encodeURIComponent(text),
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    const data = await res.json();
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
    const res  = await fetch(
      API + "?action=getBengaliAudio&text=" + encodeURIComponent(italianText),
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    const data = await res.json();
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

// LOGIN CHECK
if (localStorage.getItem("loggedIn") !== "true") {
  window.location.href = "index.html";
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
    const res = await fetch(API + "?action=getQuiz");
    quiz = await res.json();

    // inizializza risposte
    answers = quiz.map(q => ({ id: q.id, answer: null }));

    buildProgressBar();
    showQuestion();
  } catch (err) {
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
  modalIcon.classList.add("hidden");
  modalIconFallback.classList.add("hidden");
  modalStats.classList.add("hidden");
  modalReview.classList.add("hidden");
  modalReviewList.innerHTML = "";
  modalRifai.style.display = "none";
  const oldBanner = document.getElementById("_result_stats_banner");
  if (oldBanner) oldBanner.remove();
}

function setModalIcon(iconSrc, fallbackText) {
  if (!iconSrc) {
    modalIcon.classList.add("hidden");
    modalIconFallback.innerText = fallbackText;
    modalIconFallback.classList.remove("hidden");
    return;
  }

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
    const total       = quiz.length || 30;
    const corrette    = result.correct    ?? 0;
    const nonRisposte = result._nonRisposte ?? 0;
    const sbagliate   = Math.max(0, total - corrette - nonRisposte);
    const isPassed    = result.passed === true;

    console.log("[quiz] result →", { corrette, nonRisposte, sbagliate, total, isPassed });

    modal.classList.add("modal-fullscreen");
    modalCard.classList.add("modal-result", isPassed ? "modal-pass" : "modal-fail");
    modalIconShell.classList.remove("hidden");
    setModalIcon(
      isPassed ? "icons/promosso.png" : "icons/bocciato.png",
      isPassed ? "OK" : "X"
    );

    // Show "Rifai scheda" button
    modalRifai.style.display = "block";

    // ── Stats banner (fully inline — immune to CSS caching) ──
    const correttePct    = (corrette    / total) * 100;
    const nonRispostePct = (nonRisposte / total) * 100;
    const sbagliAtePct   = (sbagliate   / total) * 100;
    const pct            = Math.round(correttePct);

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
      <div style="text-align:center;font-size:0.76rem;font-weight:700;color:rgba(37,41,67,.42);letter-spacing:.03em;">${pct}% corrette</div>
    `;

    modalReview.parentNode.insertBefore(banner, modalReview);

    console.log("[quiz] stats banner injected — corrette:", corrette, "nonRisposte:", nonRisposte, "sbagliate:", sbagliate);

    // ── Render review (wrapped so a throw here can't hide the stats) ──
    try {
      const reviewItems = buildAnswerReview(result);
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
  return openModal({
    title:       result.passed ? "Promosso" : "Bocciato",
    message:     result.passed ? "Hai superato il quiz." : "Riprova e migliora il risultato.",
    confirmText: "Chiudi",
    showCancel:  false,
    badgeText:   "Esito",
    result
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
    const res = await fetch(API + "?action=checkQuiz", {
      method: "POST",
      body: JSON.stringify({ answers: payload })
    });

    const data = await res.json();

    // Attach non-risposte count so the result modal can display it correctly
    data._nonRisposte = nonRisposte;

    hideLoading();
    const action = await showResult(data);

    if (action === "rifai") {
      rifaiScheda();
    } else {
      returnToBook();
    }
  } catch (err) {
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
