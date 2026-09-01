(() => {
  "use strict";

  const readerSizes = ["default", "large", "xlarge"];
  const readerLabels = ["100%", "115%", "130%"];
  let readerSizeIndex = 0;
  try {
    readerSizeIndex = Math.max(0, readerSizes.indexOf(localStorage.getItem("magicph-reader-size")));
  } catch (_) {}

  const decreaseText = document.getElementById("text-size-decrease");
  const increaseText = document.getElementById("text-size-increase");
  const textSizeValue = document.getElementById("text-size-value");

  function applyReaderSize() {
    const size = readerSizes[readerSizeIndex];
    if (size === "default") document.documentElement.removeAttribute("data-reader-size");
    else document.documentElement.dataset.readerSize = size;
    if (textSizeValue) textSizeValue.textContent = readerLabels[readerSizeIndex];
    if (decreaseText) decreaseText.disabled = readerSizeIndex === 0;
    if (increaseText) increaseText.disabled = readerSizeIndex === readerSizes.length - 1;
    try { localStorage.setItem("magicph-reader-size", size); } catch (_) {}
  }

  decreaseText?.addEventListener("click", () => {
    readerSizeIndex = Math.max(0, readerSizeIndex - 1);
    applyReaderSize();
  });
  increaseText?.addEventListener("click", () => {
    readerSizeIndex = Math.min(readerSizes.length - 1, readerSizeIndex + 1);
    applyReaderSize();
  });
  applyReaderSize();

  const HELP_MANIFEST_SOURCE = "https://www.tmmbooks.eu/dist/patente/quiz-help-runtime-manifest.json";
  const LOCAL_HELP_SOURCE = "/data/patente/quiz-help-runtime-v2.json";
  const questionArea = document.querySelector(".question-area");
  const questionText = document.getElementById("question");
  const clickHint = document.querySelector(".quiz-click-hint");
  const workspace = document.getElementById("quiz-help-workspace");
  const translationText = document.getElementById("quiz-help-translation-text");
  const translationStatus = document.getElementById("quiz-help-translation-status");
  const context = document.getElementById("quiz-help-context");
  const chapterIt = document.getElementById("quiz-help-chapter-it");
  const chapterBn = document.getElementById("quiz-help-chapter-bn");
  const topicIt = document.getElementById("quiz-help-topic-it");
  const topicBn = document.getElementById("quiz-help-topic-bn");
  const wordsList = document.getElementById("quiz-help-words");
  const wordDetail = document.getElementById("quiz-help-word-detail");
  const shell = workspace?.querySelector(".quiz-help-shell");
  const slideViewport = workspace?.querySelector("[data-help-swipe-zone]");
  const swipeStatus = document.getElementById("quiz-help-swipe-status");
  const quizSurface = document.querySelector(".quiz-container");
  const slides = Array.from(document.querySelectorAll("[data-help-slide]"));
  const tabs = Array.from(document.querySelectorAll("[data-help-tab]"));
  let libraryPromise = null;
  let quizIdIndex = null;
  let requestId = 0;
  let activeSlide = 0;
  let helpFocusOrigin = null;
  let swipeStart = null;
  let activeWordPlayback = null;
  let wordAudioRequestId = 0;
  const wordAudioCache = new Map();
  const questionHelpCache = new Map();

  // Make the existing click-to-open help discoverable on the first question,
  // including the free-trial route, without covering or replacing the question.
  questionArea?.classList.toggle("quiz-help-discoverable", Number(current) === 0);

  function currentQuestion() {
    return Array.isArray(quiz) ? quiz[current] : null;
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

  function figureNumber(question) {
    const source = String(question?.figure || question?.img || "");
    return source.match(/(\d+)(?=\.[a-z0-9]+$|$)/i)?.[1] || "";
  }

  function fingerprint(question) {
    return hash(`${normalize(question?.question)}|${figureNumber(question)}`);
  }

  function loadLibrary() {
    if (!libraryPromise) {
      window.QUIZ_HELP_RUNTIME_V3_MANIFEST_URL = HELP_MANIFEST_SOURCE;
      const remote = Promise.resolve().then(() => {
        if (!window.QuizHelpRuntimeV3?.load) throw new Error("quiz_help_runtime_v3_missing");
        return window.QuizHelpRuntimeV3.load();
      });
      libraryPromise = remote
        .catch(() => fetch(LOCAL_HELP_SOURCE, { cache: "force-cache" })
          .then(response => {
            if (!response.ok) throw new Error(`quiz_help_local_${response.status}`);
            return response.json();
          }))
        .catch(error => {
          libraryPromise = null;
          throw error;
        });
    }
    return libraryPromise;
  }

  // Start downloading the synchronized TMM Books catalog before the user opens
  // the panel. The content-hashed runtime remains safely cached by the browser.
  const prewarmLibrary = () => loadLibrary().catch(() => {});
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(prewarmLibrary, { timeout: 1500 });
  } else {
    window.setTimeout(prewarmLibrary, 500);
  }

  function displayForm(question, canonical, aliases = []) {
    const normalizedQuestion = ` ${normalize(question)} `;
    return [...new Set([...(aliases || []), canonical])]
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
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
      const questionBn = usableBanglaTranslation(
        resolved.questionBnStandard || resolved.questionBnEasy || resolved.questionBn
      );
      return {
        ...resolved,
        words: visibleKeywords(resolved.words),
        questionBn,
        questionBnEasy: questionBn,
        questionBnStandard: questionBn
      };
    }
    if (!quizIdIndex) {
      quizIdIndex = new Map();
      Object.values(data.quizzes).forEach(value => {
        if (!Array.isArray(value) || !value[0]) return;
        const id = String(value[0]).toLocaleLowerCase("it-IT");
        quizIdIndex.set(id, value);
        const digits = id.match(/\d+/)?.[0];
        if (digits) quizIdIndex.set(String(Number(digits)), value);
      });
    }
    const sourceId = String(question?.id ?? "").trim().toLocaleLowerCase("it-IT");
    const sourceDigits = sourceId.match(/\d+/)?.[0];
    const row = data.quizzes[fingerprint(question)]
      || quizIdIndex.get(sourceId)
      || (sourceDigits ? quizIdIndex.get(String(Number(sourceDigits))) : null);
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
      contextBn: String(contextBn || "").trim(),
      chapter: { italian: chapter[0] || "", bangla: chapter[1] || "" },
      topic: { italian: topic[0] || "", bangla: topic[1] || "" },
      words
    };
  }

  function questionHelpKey(question) {
    return `${String(question?.id || "").trim()}|${fingerprint(question)}`;
  }

  async function resolveQuestionHelp(question, options = {}) {
    let help = null;
    let libraryLoaded = false;
    try {
      const data = await loadLibrary();
      libraryLoaded = true;
      help = decodeHelp(question, data);
    } catch (error) {
      console.warn("[Magic Book quiz help]", error?.message || error);
    }

    const synchronizedTranslation = usableBanglaTranslation(
      help?.questionBnStandard
      || help?.questionBnEasy
      || help?.questionBn
      || ""
    );
    let verifiedTranslation = synchronizedTranslation || usableBanglaTranslation(
      question.question_bd || question.questionBD || ""
    );
    let translationSource = synchronizedTranslation
      ? "runtime_v3"
      : verifiedTranslation
        ? String(question?.questionTranslationSource || "catalog")
        : "";

    if (!verifiedTranslation && typeof fetchBengaliAudio === "function") {
      options.onAutomaticBackup?.();
      try {
        const cacheKey = `${String(question?.id || fingerprint(question))}_bn_help`;
        const translated = await fetchBengaliAudio(question, cacheKey, { requireAudio: false });
        verifiedTranslation = usableBanglaTranslation(translated?.translation);
        if (verifiedTranslation) {
          translationSource = String(translated?.translationSource || "automatic");
        }
      } catch (_) {
        verifiedTranslation = "";
      }
    }

    return {
      ...(help || {}),
      translation: verifiedTranslation,
      translationSource,
      chapter: help?.chapter || null,
      topic: help?.topic || null,
      words: Array.isArray(help?.words) ? help.words : [],
      isPartial: !libraryLoaded || !verifiedTranslation
    };
  }

  function getQuestionHelp(question, options = {}) {
    const key = questionHelpKey(question);
    let request = questionHelpCache.get(key);
    if (!request) {
      request = resolveQuestionHelp(question, options)
        .then(help => {
          if (help?.isPartial) questionHelpCache.delete(key);
          return help;
        })
        .catch(error => {
          questionHelpCache.delete(key);
          throw error;
        });
      questionHelpCache.set(key, request);
    }
    return request;
  }

  window.QuizHelpData = Object.freeze({ getQuestionHelp });

  function stopWordAudio() {
    wordAudioRequestId += 1;
    const playback = activeWordPlayback;
    activeWordPlayback = null;
    if (!playback) return;
    playback.audio.pause();
    playback.button.classList.remove("is-playing", "is-loading");
    playback.button.disabled = false;
    URL.revokeObjectURL(playback.url);
  }

  window.stopQuizHelpAudio = stopWordAudio;

  function wordAudioUrl(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
  }

  async function playBanglaWord(text, button) {
    const cleanText = String(text || "").trim();
    if (!usableBanglaTranslation(cleanText)) {
      showAudioUnavailableToast?.("Audio bangla non disponibile");
      return;
    }
    if (typeof TRIAL_MODE !== "undefined" && TRIAL_MODE) {
      showAudioUnavailableToast?.("Audio parole disponibile con l'accesso completo");
      return;
    }

    const key = hash(cleanText);
    if (activeWordPlayback?.key === key) {
      if (activeWordPlayback.audio.paused) {
        await activeWordPlayback.audio.play().catch(() => stopWordAudio());
      } else {
        stopWordAudio();
      }
      return;
    }

    stopAllAudio?.();
    const ownRequest = ++wordAudioRequestId;
    button.disabled = true;
    button.classList.add("is-loading");
    try {
      let data = wordAudioCache.get(key);
      if (!data) {
        data = await fetchQuizJson(buildQuizApiUrl("getTTS", { text: cleanText }));
        if (!data?.audio) throw new Error("audio_not_available");
        wordAudioCache.set(key, data);
      }
      if (ownRequest !== wordAudioRequestId) return;

      const url = wordAudioUrl(data.audio);
      const audio = new Audio(url);
      activeWordPlayback = { audio, url, button, key };
      audio.addEventListener("play", () => button.classList.add("is-playing"));
      audio.addEventListener("ended", stopWordAudio, { once: true });
      audio.addEventListener("error", () => {
        stopWordAudio();
        showAudioUnavailableToast?.("Audio bangla non disponibile");
      }, { once: true });
      await audio.play();
    } catch (_) {
      stopWordAudio();
      showAudioUnavailableToast?.("Audio bangla non disponibile");
    } finally {
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  }

  function renderContext(help) {
    const visible = Boolean(help?.chapter?.italian || help?.topic?.italian);
    context.classList.toggle("hidden", !visible);
    chapterIt.textContent = window.MagicItalianDisplay.uppercase(help?.chapter?.italian);
    chapterBn.textContent = help?.chapter?.bangla || "";
    topicIt.textContent = window.MagicItalianDisplay.uppercase(help?.topic?.italian);
    topicBn.textContent = help?.topic?.bangla || "";
  }

  function showWordDetail(word) {
    wordDetail.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = `${window.MagicItalianDisplay.initialUppercase(word.italian)} · ${word.bangla}`;
    const italian = document.createElement("p");
    italian.textContent = window.MagicItalianDisplay.initialUppercase(word.simpleIt);
    const bangla = document.createElement("p");
    bangla.lang = "bn";
    bangla.textContent = word.simpleBn;
    const audio = document.createElement("button");
    audio.type = "button";
    audio.className = "quiz-help-word-audio magic-loading-control";
    audio.textContent = "🔊 Ascolta";
    audio.addEventListener("click", () => playBanglaWord(word.ttsBn || `${word.bangla}। ${word.simpleBn}`, audio));
    wordDetail.append(heading, italian, bangla, audio);
    wordDetail.classList.remove("hidden");
  }

  function renderWords(words = []) {
    wordsList.replaceChildren();
    wordDetail.classList.add("hidden");
    if (!words.length) {
      const empty = document.createElement("p");
      empty.className = "quiz-help-empty";
      empty.textContent = "Parole chiave non disponibili per questa domanda.";
      wordsList.appendChild(empty);
      return;
    }
    words.forEach(word => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quiz-help-word";
      const italian = document.createElement("strong");
      italian.textContent = window.MagicItalianDisplay.initialUppercase(word.italian);
      const bangla = document.createElement("span");
      bangla.lang = "bn";
      bangla.textContent = word.bangla;
      button.append(italian, bangla);
      button.addEventListener("click", () => showWordDetail(word));
      wordsList.appendChild(button);
    });
  }

  async function render() {
    const question = currentQuestion();
    if (!question?.question) return;
    const ownRequest = ++requestId;
    translationText.textContent = "";
    translationStatus.classList.add("magic-loading-inline-status", "is-loading");
    translationStatus.textContent = "Carico le traduzioni TMM Books…";
    renderContext(null);
    wordsList.innerHTML = '<span class="quiz-help-skeleton"></span><span class="quiz-help-skeleton"></span><span class="quiz-help-skeleton"></span>';

    let help = null;
    try {
      help = await getQuestionHelp(question, {
        onAutomaticBackup: () => {
          if (ownRequest === requestId) {
            translationStatus.textContent = "Creo la traduzione automatica di backup…";
          }
        }
      });
    } catch (error) {
      if (ownRequest !== requestId) return;
      console.warn("[Magic Book quiz help]", error?.message || error);
    }
    if (ownRequest !== requestId) return;
    const verifiedTranslation = usableBanglaTranslation(help?.translation);
    translationText.textContent = verifiedTranslation;
    translationStatus.classList.remove("is-loading");
    translationStatus.textContent = verifiedTranslation
      ? (help?.translationSource === "automatic" ? "Traduzione automatica di backup." : "")
      : "Traduzione non disponibile al momento.";
    renderContext(help);
    renderWords(help?.words || []);
  }

  function setSlide(index) {
    activeSlide = index === 1 ? 1 : 0;
    shell?.style.setProperty("--quiz-help-slide-index", String(activeSlide));
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === activeSlide;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", String(!active));
      slide.toggleAttribute("inert", !active);
      slide.tabIndex = active ? 0 : -1;
      if (active) slide.scrollTop = 0;
    });
    tabs.forEach((tab, tabIndex) => {
      const active = tabIndex === activeSlide;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    if (swipeStatus) {
      swipeStatus.textContent = activeSlide === 0
        ? "Pagina 1 di 2: Traduzione"
        : "Pagina 2 di 2: Parole chiave";
    }
  }

  function open() {
    helpFocusOrigin = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : questionText;
    workspace.classList.remove("hidden");
    workspace.setAttribute("aria-hidden", "false");
    document.body.classList.add("quiz-help-open");
    quizSurface?.setAttribute("inert", "");
    setSlide(0);
    render();
    window.requestAnimationFrame(() => workspace.querySelector("[data-help-close]")?.focus());
  }

  function close() {
    requestId += 1;
    workspace.classList.add("hidden");
    workspace.setAttribute("aria-hidden", "true");
    document.body.classList.remove("quiz-help-open");
    quizSurface?.removeAttribute("inert");
    stopWordAudio();
    const focusTarget = helpFocusOrigin?.isConnected ? helpFocusOrigin : questionText;
    helpFocusOrigin = null;
    window.requestAnimationFrame(() => focusTarget?.focus());
  }

  questionArea?.addEventListener("click", event => {
    const questionTrigger = event.target.closest("#question");
    if (event.target.closest("button, a") && !questionTrigger) return;
    questionArea.classList.remove("quiz-help-discoverable");
    clickHint?.classList.add("is-dismissed");
    open();
  });
  document.querySelectorAll("[data-help-close]").forEach(button => button.addEventListener("click", close));
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => setSlide(index));
    tab.addEventListener("keydown", event => {
      let nextIndex = null;
      if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabs.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      setSlide(nextIndex);
      tabs[nextIndex]?.focus();
    });
  });

  slideViewport?.addEventListener("pointerdown", event => {
    if (!event.isPrimary || !["touch", "pen"].includes(event.pointerType)) return;
    if (event.target.closest("button, a, input")) return;
    swipeStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY
    };
    slideViewport.setPointerCapture?.(event.pointerId);
  });

  slideViewport?.addEventListener("pointerup", event => {
    if (!swipeStart || swipeStart.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - swipeStart.x;
    const deltaY = event.clientY - swipeStart.y;
    swipeStart = null;
    slideViewport.releasePointerCapture?.(event.pointerId);
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
    setSlide(deltaX < 0 ? 1 : 0);
  });

  slideViewport?.addEventListener("pointercancel", () => {
    swipeStart = null;
  });

  workspace?.addEventListener("click", event => {
    if (event.target === workspace) close();
  });
  document.addEventListener("keydown", event => {
    if (workspace.classList.contains("hidden")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(shell?.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) || []).filter(element => !element.closest("[inert]") && element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  new MutationObserver(() => {
    if (!workspace.classList.contains("hidden")) render();
  }).observe(questionText, { childList: true, characterData: true, subtree: true });
})();
