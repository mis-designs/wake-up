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
  let libraryPromise = null;
  let quizIdIndex = null;
  let requestId = 0;
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

  function disposeWordAudio(playback) {
    if (!playback) return;
    if (activeWordPlayback === playback) activeWordPlayback = null;
    wordAudioRequestId += 1;
    playback.controller?.abort();
    playback.audio?.pause();
    playback.audio?.removeAttribute("src");
    playback.audio?.load();
    playback.button.classList.remove("is-playing", "is-loading");
    playback.button.removeAttribute("aria-busy");
    playback.button.disabled = false;
    if (playback.url) URL.revokeObjectURL(playback.url);
  }

  function stopWordAudio({ resume = false, reason = "manual" } = {}) {
    const playback = activeWordPlayback;
    if (!playback) return;
    const focus = window.MagicAudioFocus;
    if (playback.focusToken && focus?.isCurrent(playback.focusToken)) {
      void focus.cancelTransient(playback.focusToken, { resume, reason });
      return;
    }
    disposeWordAudio(playback);
  }

  function completeWordAudio(playback, { resume = true } = {}) {
    if (!playback || activeWordPlayback !== playback) return false;
    const focus = window.MagicAudioFocus;
    disposeWordAudio(playback);
    if (playback.focusToken && focus) {
      void focus.completeTransient(playback.focusToken, { resume });
    }
    return true;
  }

  window.stopQuizHelpAudio = () => stopWordAudio({ resume: false, reason: "context-change" });

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
      stopWordAudio({ resume: false, reason: "manual" });
      return;
    }

    const controller = new AbortController();
    const playback = { audio: null, url: "", button, key, controller, focusToken: null };
    const focus = window.MagicAudioFocus;
    window.cancelPendingQuizExplanationAudio?.({ preserveStartedPlayback: Boolean(focus) });
    if (focus) {
      playback.focusToken = focus.beginTransient({
        key: `quiz-word:${key}`,
        stop: () => disposeWordAudio(playback)
      });
    } else {
      stopAllAudio?.();
    }
    activeWordPlayback = playback;
    const ownRequest = ++wordAudioRequestId;
    button.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
    try {
      let data = wordAudioCache.get(key);
      if (!data) {
        data = await fetchQuizJson(
          buildQuizApiUrl("getTTS", { text: cleanText }),
          { signal: controller.signal }
        );
        if (!data?.audio) throw new Error("audio_not_available");
        wordAudioCache.set(key, data);
      }
      if (ownRequest !== wordAudioRequestId || activeWordPlayback !== playback) return;

      const url = wordAudioUrl(data.audio);
      const audio = new Audio(url);
      playback.audio = audio;
      playback.url = url;
      audio.addEventListener("play", () => button.classList.add("is-playing"));
      audio.addEventListener("ended", () => completeWordAudio(playback, { resume: true }), { once: true });
      audio.addEventListener("error", () => {
        if (completeWordAudio(playback, { resume: true })) {
          showAudioUnavailableToast?.("Audio bangla non disponibile");
        }
      }, { once: true });
      button.classList.remove("is-loading");
      button.removeAttribute("aria-busy");
      await audio.play();
    } catch (error) {
      if (error?.name === "AbortError" || ownRequest !== wordAudioRequestId || activeWordPlayback !== playback) return;
      if (completeWordAudio(playback, { resume: true })) {
        showAudioUnavailableToast?.("Audio bangla non disponibile");
      }
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

  function showWordDetail(word, trigger) {
    stopWordAudio();
    const wasOpen = trigger.getAttribute("aria-expanded") === "true";
    wordsList.querySelectorAll("button").forEach(button => button.setAttribute("aria-expanded", "false"));
    wordDetail.classList.toggle("hidden", wasOpen);
    if (wasOpen) return;
    trigger.setAttribute("aria-expanded", "true");
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
    audio.textContent = "Ascolta in Bangla";
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
      button.className = "quiz-help-word magic-glass-chip";
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-controls", "quiz-help-word-detail");
      const italian = document.createElement("strong");
      italian.textContent = window.MagicItalianDisplay.initialUppercase(word.italian);
      button.append(italian);
      button.addEventListener("click", () => showWordDetail(word, button));
      wordsList.appendChild(button);
    });
  }

  async function render() {
    const question = currentQuestion();
    if (!question?.question) return;
    const ownRequest = ++requestId;
    stopWordAudio();
    workspace.setAttribute("aria-busy", "true");
    wordDetail.classList.add("hidden");
    context.open = false;
    translationText.textContent = "";
    translationStatus.classList.add("magic-loading-inline-status", "is-loading");
    translationStatus.textContent = "Caricamento traduzione…";
    renderContext(null);
    wordsList.replaceChildren();

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
    workspace.setAttribute("aria-busy", "false");
    const verifiedTranslation = usableBanglaTranslation(help?.translation);
    translationText.textContent = verifiedTranslation;
    translationStatus.classList.remove("is-loading");
    translationStatus.textContent = verifiedTranslation
      ? (help?.translationSource === "automatic" ? "Traduzione automatica di backup." : "")
      : "Traduzione non disponibile al momento.";
    renderContext(help);
    renderWords(help?.words || []);
  }

  function open() {
    workspace.classList.remove("hidden");
    workspace.setAttribute("aria-hidden", "false");
    questionText?.setAttribute("aria-expanded", "true");
    render();
  }

  function close() {
    const restoreFocus = workspace.contains(document.activeElement);
    requestId += 1;
    workspace.classList.add("hidden");
    workspace.setAttribute("aria-hidden", "true");
    workspace.setAttribute("aria-busy", "false");
    questionText?.setAttribute("aria-expanded", "false");
    stopWordAudio();
    if (restoreFocus) questionText?.focus({ preventScroll: true });
  }

  questionText?.addEventListener("click", () => {
    questionArea.classList.remove("quiz-help-discoverable");
    clickHint?.classList.add("is-dismissed");
    if (workspace.classList.contains("hidden")) open();
    else close();
  });
  document.querySelectorAll("[data-help-close]").forEach(button => button.addEventListener("click", close));
  workspace?.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close();
  });
  new MutationObserver(() => {
    if (!workspace.classList.contains("hidden")) render();
  }).observe(questionText, { childList: true, characterData: true, subtree: true });
})();
