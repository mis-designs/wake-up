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
  const slides = Array.from(document.querySelectorAll("[data-help-slide]"));
  const tabs = Array.from(document.querySelectorAll("[data-help-tab]"));
  let libraryPromise = null;
  let quizIdIndex = null;
  let requestId = 0;
  let activeSlide = 0;
  let cardLayer = 1;

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
      libraryPromise = window.QuizHelpRuntimeV3.load()
        .catch(error => {
          libraryPromise = null;
          throw error;
        });
    }
    return libraryPromise;
  }

  function displayForm(question, canonical, aliases = []) {
    const normalizedQuestion = ` ${normalize(question)} `;
    return [...new Set([...(aliases || []), canonical])]
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .find(candidate => normalizedQuestion.includes(` ${normalize(candidate)} `)) || canonical;
  }

  function decodeHelp(question, data) {
    if (data?.resolver) return data.resolver.resolve(question);
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
    const [quizId, chapterId, topicId, wordIds = [], ttsBn = ""] = row;
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
      ttsBn,
      chapter: { italian: chapter[0] || "", bangla: chapter[1] || "" },
      topic: { italian: topic[0] || "", bangla: topic[1] || "" },
      words
    };
  }

  function speak(text, language) {
    const cleanText = String(text || "").trim();
    if (!cleanText || !window.speechSynthesis) return;
    stopAllAudio?.();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = language;
    utterance.rate = language.startsWith("bn") ? 0.82 : 0.92;
    window.speechSynthesis.speak(utterance);
  }

  function renderContext(help) {
    const visible = Boolean(help?.chapter?.italian || help?.topic?.italian);
    context.classList.toggle("hidden", !visible);
    chapterIt.textContent = help?.chapter?.italian || "";
    chapterBn.textContent = help?.chapter?.bangla || "";
    topicIt.textContent = help?.topic?.italian || "";
    topicBn.textContent = help?.topic?.bangla || "";
  }

  function showWordDetail(word) {
    wordDetail.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = `${word.italian} · ${word.bangla}`;
    const italian = document.createElement("p");
    italian.textContent = word.simpleIt;
    const bangla = document.createElement("p");
    bangla.lang = "bn";
    bangla.textContent = word.simpleBn;
    const audio = document.createElement("button");
    audio.type = "button";
    audio.className = "quiz-help-word-audio";
    audio.textContent = "🔊 Ascolta";
    audio.addEventListener("click", () => speak(word.ttsBn || `${word.bangla}। ${word.simpleBn}`, "bn-BD"));
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
      italian.textContent = word.italian;
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
    translationStatus.textContent = "Traduzione in corso…";
    renderContext(null);
    wordsList.innerHTML = '<span class="quiz-help-skeleton"></span><span class="quiz-help-skeleton"></span><span class="quiz-help-skeleton"></span>';

    try {
      const data = await loadLibrary();
      if (ownRequest !== requestId) return;
      const help = decodeHelp(question, data);
      const verifiedTranslation = String(
        help?.questionBnEasy
        || help?.questionBn
        || question.question_bd
        || question.questionBD
        || ""
      ).trim();
      translationText.textContent = verifiedTranslation;
      translationStatus.textContent = verifiedTranslation ? "" : "Traduzione verificata non ancora disponibile.";
      renderContext(help);
      renderWords(help?.words || []);
    } catch (error) {
      if (ownRequest !== requestId) return;
      const directTranslation = String(question.question_bd || question.questionBD || "").trim();
      translationText.textContent = directTranslation;
      translationStatus.textContent = directTranslation ? "" : "Traduzione verificata non disponibile.";
      renderWords([]);
      console.warn("[Magic Book quiz help]", error.message);
    }
  }

  function setSlide(index) {
    activeSlide = index === 1 ? 1 : 0;
    slides.forEach((slide, slideIndex) => slide.classList.toggle("is-active", slideIndex === activeSlide));
    tabs.forEach((tab, tabIndex) => {
      const active = tabIndex === activeSlide;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
  }

  function open() {
    workspace.classList.remove("hidden");
    workspace.setAttribute("aria-hidden", "false");
    document.body.classList.add("quiz-help-open");
    setSlide(0);
    render();
  }

  function close() {
    requestId += 1;
    workspace.classList.add("hidden");
    workspace.setAttribute("aria-hidden", "true");
    document.body.classList.remove("quiz-help-open");
    window.speechSynthesis?.cancel();
  }

  function bringCardToFront(card) {
    cardLayer = cardLayer >= 8 ? 2 : cardLayer + 1;
    slides.forEach(item => {
      if (item !== card && Number(item.style.zIndex || 0) >= cardLayer) item.style.zIndex = "1";
    });
    card.style.zIndex = String(cardLayer);
  }

  function clampCard(card) {
    if (window.innerWidth <= 720 || !card || workspace.classList.contains("hidden")) return;
    const margin = 10;
    const rect = card.getBoundingClientRect();
    const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - rect.width - margin));
    const top = Math.min(Math.max(margin, rect.top), Math.max(margin, window.innerHeight - rect.height - margin));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.transform = "none";
  }

  function makeCardDraggable(card) {
    const handle = card.querySelector(".quiz-help-card-header");
    if (!handle) return;
    card.addEventListener("pointerdown", () => bringCardToFront(card));
    handle.addEventListener("pointerdown", event => {
      if (window.innerWidth <= 720 || event.target.closest("button")) return;
      event.preventDefault();
      bringCardToFront(card);
      const rect = card.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      card.style.left = `${rect.left}px`;
      card.style.top = `${rect.top}px`;
      card.style.transform = "none";
      card.classList.add("is-dragging");
      handle.setPointerCapture(event.pointerId);

      const move = moveEvent => {
        const margin = 10;
        const left = Math.min(Math.max(margin, moveEvent.clientX - offsetX), Math.max(margin, window.innerWidth - card.offsetWidth - margin));
        const top = Math.min(Math.max(margin, moveEvent.clientY - offsetY), Math.max(margin, window.innerHeight - card.offsetHeight - margin));
        card.style.left = `${left}px`;
        card.style.top = `${top}px`;
      };
      const stop = () => {
        card.classList.remove("is-dragging");
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", stop);
        handle.removeEventListener("pointercancel", stop);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", stop);
      handle.addEventListener("pointercancel", stop);
    });
  }

  questionArea?.addEventListener("click", event => {
    if (event.target.closest("button, a")) return;
    questionArea.classList.remove("quiz-help-discoverable");
    clickHint?.classList.add("is-dismissed");
    open();
  });
  document.querySelectorAll("[data-help-close]").forEach(button => button.addEventListener("click", close));
  tabs.forEach((tab, index) => tab.addEventListener("click", () => setSlide(index)));
  slides.forEach(makeCardDraggable);
  window.addEventListener("resize", () => slides.forEach(clampCard));
  workspace?.addEventListener("click", event => {
    if (event.target === workspace) close();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !workspace.classList.contains("hidden")) close();
  });
  new MutationObserver(() => {
    if (!workspace.classList.contains("hidden")) render();
  }).observe(questionText, { childList: true, characterData: true, subtree: true });
})();
