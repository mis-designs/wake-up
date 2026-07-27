"use strict";

const crypto = require("crypto");

const QUIZ_AUDIO_IDENTITY_VERSION = 2;
const QUIZ_AUDIO_IDENTITY_PREFIX = "quiz-audio-v2";
const FALSE_FIGURE_VALUES = new Set(["", "0", "false", "null", "undefined", "none", "nessuna"]);

function normalizeQuizAudioQuestion(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("it-IT")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeQuizAudioFigure(value) {
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

function buildQuizAudioV2Source(question, figure) {
  const normalizedQuestion = normalizeQuizAudioQuestion(question);
  if (!normalizedQuestion || normalizedQuestion.length > 2500) {
    const error = new Error("invalid_quiz_audio_question");
    error.statusCode = 400;
    throw error;
  }
  const figureKey = normalizeQuizAudioFigure(figure);
  return {
    normalizedQuestion,
    figureKey,
    source: `${QUIZ_AUDIO_IDENTITY_PREFIX}\u001f${normalizedQuestion}\u001f${figureKey}`
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getQuizAudioIdentity(question, figure) {
  const { normalizedQuestion, figureKey, source } = buildQuizAudioV2Source(question, figure);
  const legacyQuizKey = `q_${sha256(normalizedQuestion)}`;
  const quizKey = `q2_${sha256(source)}`;
  return {
    version: QUIZ_AUDIO_IDENTITY_VERSION,
    quizKey,
    legacyQuizKey,
    normalizedQuestion,
    figureKey,
    audioKey: `quiz-explanations/v2/${quizKey}/explanation.webm`
  };
}

module.exports = {
  QUIZ_AUDIO_IDENTITY_VERSION,
  buildQuizAudioV2Source,
  getQuizAudioIdentity,
  normalizeQuizAudioFigure,
  normalizeQuizAudioQuestion
};
