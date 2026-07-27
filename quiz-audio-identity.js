(function attachQuizAudioIdentity(global) {
  "use strict";

  const VERSION = 2;
  const PREFIX = "quiz-audio-v2";
  const FALSE_FIGURE_VALUES = new Set(["", "0", "false", "null", "undefined", "none", "nessuna"]);

  function normalizeQuestion(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("it-IT")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function normalizeFigure(value) {
    const raw = String(value ?? "").normalize("NFKC").trim().toLowerCase();
    if (FALSE_FIGURE_VALUES.has(raw)) return "none";
    const clean = raw.split(/[?#]/, 1)[0].replace(/\\/g, "/");
    const basename = clean.split("/").pop() || clean;
    const numberedFigure = basename.match(/^(?:fig[\s_-]*)?0*(\d+)(?:\.[a-z0-9]+)?$/i);
    if (numberedFigure) return `fig${Number(numberedFigure[1])}`;
    const normalized = basename
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "");
    return normalized ? `figure-${normalized}` : "none";
  }

  function buildSource(question, figure) {
    const normalizedQuestion = normalizeQuestion(question);
    if (!normalizedQuestion || normalizedQuestion.length > 2500) throw new Error("invalid_quiz_audio_question");
    const figureKey = normalizeFigure(figure);
    return {
      normalizedQuestion,
      figureKey,
      source: `${PREFIX}\u001f${normalizedQuestion}\u001f${figureKey}`
    };
  }

  async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }

  async function getIdentity(question, figure) {
    const { normalizedQuestion, figureKey, source } = buildSource(question, figure);
    const [legacyHash, v2Hash] = await Promise.all([sha256(normalizedQuestion), sha256(source)]);
    return {
      version: VERSION,
      quizKey: `q2_${v2Hash}`,
      legacyQuizKey: `q_${legacyHash}`,
      normalizedQuestion,
      figureKey
    };
  }

  global.QuizAudioIdentity = Object.freeze({
    VERSION,
    buildSource,
    getIdentity,
    normalizeFigure,
    normalizeQuestion
  });
})(window);
