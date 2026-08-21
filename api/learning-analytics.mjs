import { createRequire } from "node:module";
import { LOCAL_MAGIC_BOOK_ROWS } from "./local-quiz-bank.mjs";

const require = createRequire(import.meta.url);
const runtime = require("../data/patente/quiz-help-runtime-v2.json");

export const LEARNING_ANALYTICS_RULES = Object.freeze({
  diagnosticMinimumAnswers: 10,
  recentWindow: 40,
  entityRecentWindow: 6,
  figureMinimumDifferentWrongQuiz: 2,
  wordMinimumAttempts: 4,
  wordMinimumBaselineDeltaPct: 12,
  maxPlanItems: 3
});

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function round(value, digits = 0) {
  const multiplier = 10 ** digits;
  return Math.round((Number(value) || 0) * multiplier) / multiplier;
}

function percentage(correct, attempts) {
  return attempts ? round(correct / attempts * 100) : null;
}

function normalizeFingerprintText(value) {
  return String(value || "")
    .toLocaleLowerCase("it-IT")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/’/g, "'")
    .trim()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

function figureNumber(value) {
  const match = String(value || "").match(/\d+/);
  return match ? String(Number(match[0])) : "";
}

export function quizFingerprint(question, figure = "") {
  const input = `${normalizeFingerprintText(question)}|${figureNumber(figure)}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function chapterNumberFromId(value, fallback) {
  const match = String(value || "").match(/^ch(\d{2})_/);
  return match ? Number(match[1]) : Number(fallback);
}

function buildCatalog() {
  const chapterRuntime = runtime?.chapters || {};
  const topicRuntime = runtime?.topics || {};
  const wordRuntime = runtime?.words || {};
  const quizRuntime = runtime?.quizzes || {};
  const rows = new Map();
  const chapters = new Map();
  let contextualized = 0;

  LOCAL_MAGIC_BOOK_ROWS.forEach(row => {
    const context = quizRuntime[quizFingerprint(row.question, row.figure)] || [];
    const chapterId = String(context[1] || "");
    const chapterNumber = chapterNumberFromId(chapterId, row.chapter);
    const chapterCopy = chapterRuntime[chapterId] || [];
    const topicId = String(context[2] || "");
    const topicCopy = topicRuntime[topicId] || [];
    const wordIds = Array.isArray(context[3]) ? context[3].filter(id => wordRuntime[id]) : [];
    const figureId = String(row.figure || "").trim();
    if (context.length) contextualized += 1;

    const item = Object.freeze({
      quizId: String(row.id),
      chapter: chapterNumber,
      chapterId: chapterId || `chapter-${chapterNumber}`,
      chapterTitle: String(chapterCopy[0] || `Capitolo ${chapterNumber}`),
      chapterTitleBn: String(chapterCopy[1] || ""),
      chapterDescriptionBn: String(chapterCopy[2] || ""),
      topicId,
      topicTitle: String(topicCopy[0] || ""),
      topicTitleBn: String(topicCopy[1] || ""),
      wordIds,
      words: wordIds.map(id => ({
        id,
        italian: String(wordRuntime[id]?.[0] || id),
        bangla: String(wordRuntime[id]?.[1] || ""),
        simpleItalian: String(wordRuntime[id]?.[2] || ""),
        simpleBangla: String(wordRuntime[id]?.[3] || "")
      })),
      figureId,
      question: String(row.question || "")
    });
    rows.set(item.quizId, item);

    const chapter = chapters.get(chapterNumber) || {
      chapter: chapterNumber,
      chapterId: item.chapterId,
      title: item.chapterTitle,
      titleBn: item.chapterTitleBn,
      descriptionBn: item.chapterDescriptionBn,
      totalQuiz: 0
    };
    chapter.totalQuiz += 1;
    chapters.set(chapterNumber, chapter);
  });

  return Object.freeze({
    rows,
    chapters,
    totalQuiz: LOCAL_MAGIC_BOOK_ROWS.length,
    contextualized,
    contextCoveragePct: round(contextualized / LOCAL_MAGIC_BOOK_ROWS.length * 100, 1)
  });
}

export const LEARNING_CATALOG = buildCatalog();

function normalizeAnswerEvents(rawEvents) {
  const byId = new Map();
  (Array.isArray(rawEvents) ? rawEvents : []).forEach((raw, index) => {
    const eventId = String(raw?.event_id || "").trim();
    const quizId = String(raw?.quiz_id || "").trim();
    const result = String(raw?.result || "").toUpperCase();
    const timestamp = Date.parse(raw?.answered_at);
    if (!eventId || !LEARNING_CATALOG.rows.has(quizId)) return;
    if (result !== "CORRECT" && result !== "WRONG") return;
    if (!Number.isFinite(timestamp)) return;
    byId.set(eventId, {
      eventId,
      quizId,
      result,
      answeredAt: new Date(timestamp).toISOString(),
      timestamp,
      order: index
    });
  });
  return [...byId.values()].sort((left, right) => left.timestamp - right.timestamp || left.order - right.order);
}

function newBucket(id, type, copy = {}) {
  return {
    id,
    type,
    ...copy,
    events: [],
    wrongQuizIds: new Set(),
    quizIds: new Set()
  };
}

function appendToBucket(bucket, event) {
  bucket.events.push(event);
  bucket.quizIds.add(event.quizId);
  if (event.result === "WRONG") bucket.wrongQuizIds.add(event.quizId);
}

function recentRecencyScore(lastErrorAt, now) {
  const timestamp = Date.parse(lastErrorAt);
  if (!Number.isFinite(timestamp)) return 0;
  const days = Math.max(0, (now - timestamp) / DAY_MS);
  return clamp(20 - days * 1.5, 0, 20);
}

function finalizeBucket(bucket, { overallAccuracy, now, diagnosticReady }) {
  const events = bucket.events;
  const attempts = events.length;
  const correct = events.filter(event => event.result === "CORRECT").length;
  const wrong = attempts - correct;
  const recent = events.slice(-LEARNING_ANALYTICS_RULES.entityRecentWindow);
  const previous = events.slice(0, Math.max(0, events.length - recent.length));
  const recentCorrect = recent.filter(event => event.result === "CORRECT").length;
  const previousCorrect = previous.filter(event => event.result === "CORRECT").length;
  const recentAccuracy = percentage(recentCorrect, recent.length);
  const previousAccuracy = percentage(previousCorrect, previous.length);
  const lastError = [...events].reverse().find(event => event.result === "WRONG");
  const recentWrong = recent.length - recentCorrect;
  const correctTail = [...events].reverse().findIndex(event => event.result !== "CORRECT");
  const currentCorrectStreak = correctTail === -1 ? events.length : correctTail;
  const hadHistoricWeakness = previous.filter(event => event.result === "WRONG").length >= 2
    || (wrong >= 2 && attempts >= 5);
  const recovered = diagnosticReady
    && hadHistoricWeakness
    && recent.length >= 3
    && recentAccuracy >= 75
    && currentCorrectStreak >= 2;
  const improving = !recovered
    && diagnosticReady
    && previous.length >= 3
    && recent.length >= 3
    && recentAccuracy >= 60
    && recentAccuracy - previousAccuracy >= 15;
  const commonAttention = diagnosticReady && attempts >= 3 && recentWrong >= 2;
  let attention = commonAttention;
  if (bucket.type === "figure") {
    attention = commonAttention
      && bucket.wrongQuizIds.size >= LEARNING_ANALYTICS_RULES.figureMinimumDifferentWrongQuiz;
  }
  if (bucket.type === "word") {
    const baselineDelta = overallAccuracy - (recentAccuracy ?? percentage(correct, attempts) ?? overallAccuracy);
    attention = diagnosticReady
      && attempts >= LEARNING_ANALYTICS_RULES.wordMinimumAttempts
      && recentWrong >= 2
      && baselineDelta >= LEARNING_ANALYTICS_RULES.wordMinimumBaselineDeltaPct;
  }
  const riskScore = attention
    ? round(clamp((recentWrong / Math.max(1, recent.length)) * 55
      + Math.min(4, bucket.wrongQuizIds.size) / 4 * 25
      + recentRecencyScore(lastError?.answeredAt, now)))
    : 0;
  let status = "in_pratica";
  if (recovered) status = "recuperato";
  else if (improving) status = "in_miglioramento";
  else if (attention) status = "attenzione";
  else if (attempts < 3) status = "pochi_dati";
  else if ((recentAccuracy ?? 0) >= 80) status = "solido";

  return {
    ...Object.fromEntries(Object.entries(bucket).filter(([key]) => !["events", "wrongQuizIds", "quizIds"].includes(key))),
    attempts,
    correct,
    wrong,
    accuracyPct: percentage(correct, attempts),
    recentAccuracyPct: recentAccuracy,
    baselineDeltaPct: bucket.type === "word" ? round(overallAccuracy - (recentAccuracy ?? percentage(correct, attempts) ?? overallAccuracy)) : null,
    differentQuizWrong: bucket.wrongQuizIds.size,
    quizzesSeen: bucket.quizIds.size,
    currentCorrectStreak,
    lastResult: events.at(-1)?.result || "",
    lastSeenAt: events.at(-1)?.answeredAt || "",
    lastErrorAt: lastError?.answeredAt || "",
    status,
    riskScore,
    relatedQuizIds: [...bucket.wrongQuizIds]
  };
}

function entityLabel(type) {
  return ({ figure: "Figura", quiz: "Quiz", word: "Parola", topic: "Argomento" })[type] || "Ripasso";
}

function statusLabel(status) {
  return ({
    attenzione: "Da rivedere",
    in_miglioramento: "In miglioramento",
    recuperato: "Recuperato",
    solido: "Solido",
    pochi_dati: "Pochi dati",
    in_pratica: "In pratica",
    non_iniziato: "Non iniziato"
  })[status] || "In pratica";
}

function errorReason(item) {
  if (item.type === "figure") return `${item.differentQuizWrong} quiz diversi sbagliati con questa figura`;
  if (item.type === "word") return `Risultati recenti ${Math.max(0, item.baselineDeltaPct)} punti sotto la tua media`;
  if (item.type === "topic") return `${item.differentQuizWrong} quiz diversi da rivedere in questo argomento`;
  return `${item.wrong} errori su ${item.attempts} tentativi`;
}

function decorateItem(item) {
  return {
    ...item,
    typeLabel: entityLabel(item.type),
    statusLabel: statusLabel(item.status),
    reason: errorReason(item),
    relatedQuiz: (item.relatedQuizIds || []).slice(0, 5).flatMap(quizId => {
      const catalog = LEARNING_CATALOG.rows.get(quizId);
      return catalog ? [{ quizId, question: catalog.question, chapter: catalog.chapter, figureId: catalog.figureId }] : [];
    })
  };
}

function chapterStatus(stats) {
  if (!stats.attempts) return "non_iniziato";
  if (stats.attempts < 5) return "pochi_dati";
  if (stats.activeErrors > 0) return "attenzione";
  if (stats.recentAccuracyPct !== null && stats.accuracyPct !== null && stats.recentAccuracyPct >= stats.accuracyPct + 10) {
    return "in_miglioramento";
  }
  if (stats.recentAccuracyPct >= 80) return "solido";
  return "in_pratica";
}

function buildPlan(activeItems, chapters, diagnosticReady) {
  if (!diagnosticReady) return [];
  const preferred = activeItems
    .filter(item => ["figure", "topic", "word"].includes(item.type))
    .sort((left, right) => right.riskScore - left.riskScore || right.differentQuizWrong - left.differentQuizWrong);
  const chosen = [];
  preferred.forEach(item => {
    if (chosen.length >= LEARNING_ANALYTICS_RULES.maxPlanItems) return;
    const key = `${item.type}:${item.id}`;
    if (chosen.some(entry => entry.key === key)) return;
    chosen.push({ ...item, key });
  });

  if (!chosen.length) {
    const weakest = [...chapters]
      .filter(chapter => chapter.attempts >= 5 && chapter.accuracyPct < 75)
      .sort((left, right) => left.accuracyPct - right.accuracyPct)[0];
    if (weakest) chosen.push({
      type: "chapter",
      id: String(weakest.chapter),
      chapter: weakest.chapter,
      title: weakest.title,
      titleBn: weakest.titleBn,
      riskScore: round(100 - weakest.accuracyPct),
      reason: `Precisione ${weakest.accuracyPct}% nel capitolo`
    });
  }

  return chosen.slice(0, LEARNING_ANALYTICS_RULES.maxPlanItems).map((item, index) => {
    const chapter = Number(item.chapter || 0);
    const action = item.type === "word" ? "dictionary" : item.type === "figure" ? "figure" : "chapter_quiz";
    const minutes = item.type === "figure" ? 4 : 5;
    return {
      id: `plan-${index + 1}-${item.type}-${item.id}`,
      position: index + 1,
      type: item.type,
      entityId: item.id,
      title: item.title || `${entityLabel(item.type)} ${item.id}`,
      titleBn: item.titleBn || "",
      reason: item.reason || errorReason(item),
      chapter,
      action,
      estimatedMinutes: minutes,
      figureId: item.type === "figure" ? item.id : ""
    };
  });
}

function buildJourney(totalAnswers) {
  const milestones = [10, 40, 100];
  const reached = milestones.filter(value => totalAnswers >= value).length;
  const next = milestones.find(value => totalAnswers < value) || null;
  return {
    stage: reached,
    progressPct: next ? round(clamp(totalAnswers / next * 100)) : 100,
    nextMilestone: next,
    answersToNext: next ? Math.max(0, next - totalAnswers) : 0,
    waypoints: [
      { value: 10, label: "Prime indicazioni", reached: totalAnswers >= 10 },
      { value: 40, label: "Tendenza recente", reached: totalAnswers >= 40 },
      { value: 100, label: "Percorso consolidato", reached: totalAnswers >= 100 }
    ]
  };
}

function buildInsight({ diagnosticReady, totalAnswers, activeItems, recoveredItems, recentAccuracy }) {
  if (!totalAnswers) return {
    tone: "neutral",
    eyebrow: "Il primo passo",
    title: "Inizia un quiz: il percorso nascerà dalle tue risposte.",
    body: "Non ci sono ancora risposte da analizzare. Dopo i primi tentativi vedrai capitoli, errori e recuperi reali."
  };
  if (!diagnosticReady) return {
    tone: "neutral",
    eyebrow: "Percorso in formazione",
    title: `${totalAnswers} risposte raccolte, ancora poche per una diagnosi affidabile.`,
    body: `Servono almeno ${LEARNING_ANALYTICS_RULES.diagnosticMinimumAnswers} risposte per distinguere un errore occasionale da un pattern.`
  };
  const strongest = [...activeItems].sort((left, right) => right.riskScore - left.riskScore)[0];
  if (strongest) return {
    tone: "attention",
    eyebrow: "Prossimo passo utile",
    title: `${strongest.title} merita un ripasso mirato.`,
    body: strongest.reason
  };
  if (recoveredItems.length) return {
    tone: "positive",
    eyebrow: "Segnale positivo",
    title: `${recoveredItems.length === 1 ? "Un punto debole è stato recuperato" : `${recoveredItems.length} punti deboli sono stati recuperati`}.`,
    body: "Le risposte corrette più recenti mostrano un miglioramento reale rispetto agli errori precedenti."
  };
  return {
    tone: "positive",
    eyebrow: "Ritmo stabile",
    title: `Nelle risposte recenti hai il ${recentAccuracy ?? 0}% di precisione.`,
    body: "Continua sui capitoli meno esplorati per rendere il quadro più completo."
  };
}

export function buildLearningInsights(rawEvents, options = {}) {
  const now = Number(options.now) || Date.now();
  const events = normalizeAnswerEvents(rawEvents);
  const totalAnswers = events.length;
  const totalCorrect = events.filter(event => event.result === "CORRECT").length;
  const totalWrong = totalAnswers - totalCorrect;
  const overallAccuracy = percentage(totalCorrect, totalAnswers) ?? 0;
  const recent = events.slice(-LEARNING_ANALYTICS_RULES.recentWindow);
  const recentCorrect = recent.filter(event => event.result === "CORRECT").length;
  const recentAccuracy = percentage(recentCorrect, recent.length);
  const diagnosticReady = totalAnswers >= LEARNING_ANALYTICS_RULES.diagnosticMinimumAnswers;
  const uniqueQuiz = new Set(events.map(event => event.quizId)).size;

  const quizBuckets = new Map();
  const figureBuckets = new Map();
  const topicBuckets = new Map();
  const wordBuckets = new Map();
  const chapterBuckets = new Map();

  LEARNING_CATALOG.chapters.forEach(chapter => {
    chapterBuckets.set(chapter.chapter, newBucket(String(chapter.chapter), "chapter", {
      chapter: chapter.chapter,
      title: chapter.title,
      titleBn: chapter.titleBn,
      descriptionBn: chapter.descriptionBn,
      totalQuiz: chapter.totalQuiz
    }));
  });

  events.forEach(event => {
    const catalog = LEARNING_CATALOG.rows.get(event.quizId);
    const quizBucket = quizBuckets.get(event.quizId) || newBucket(event.quizId, "quiz", {
      title: catalog.question,
      chapter: catalog.chapter,
      question: catalog.question,
      figureId: catalog.figureId
    });
    appendToBucket(quizBucket, event);
    quizBuckets.set(event.quizId, quizBucket);

    appendToBucket(chapterBuckets.get(catalog.chapter), event);

    if (catalog.figureId) {
      const bucket = figureBuckets.get(catalog.figureId) || newBucket(catalog.figureId, "figure", {
        title: `Figura ${figureNumber(catalog.figureId)}`,
        chapter: catalog.chapter,
        figureId: catalog.figureId
      });
      appendToBucket(bucket, event);
      figureBuckets.set(catalog.figureId, bucket);
    }
    if (catalog.topicId) {
      const bucket = topicBuckets.get(catalog.topicId) || newBucket(catalog.topicId, "topic", {
        title: catalog.topicTitle || `Argomento del capitolo ${catalog.chapter}`,
        titleBn: catalog.topicTitleBn,
        chapter: catalog.chapter
      });
      appendToBucket(bucket, event);
      topicBuckets.set(catalog.topicId, bucket);
    }
    catalog.words.forEach(word => {
      const bucket = wordBuckets.get(word.id) || newBucket(word.id, "word", {
        title: word.italian,
        titleBn: word.bangla,
        simpleItalian: word.simpleItalian,
        simpleBangla: word.simpleBangla,
        chapter: catalog.chapter
      });
      appendToBucket(bucket, event);
      wordBuckets.set(word.id, bucket);
    });
  });

  const finalize = bucket => decorateItem(finalizeBucket(bucket, { overallAccuracy, now, diagnosticReady }));
  const questions = [...quizBuckets.values()].map(finalize);
  const figures = [...figureBuckets.values()].map(finalize);
  const topics = [...topicBuckets.values()].map(finalize);
  const words = [...wordBuckets.values()].map(finalize);
  const entityItems = [...figures, ...questions, ...words, ...topics];
  const activeItems = entityItems.filter(item => item.status === "attenzione");
  const recoveredItems = entityItems.filter(item => item.status === "recuperato")
    .filter(item => now - Date.parse(item.lastSeenAt) <= 7 * DAY_MS);

  const chapters = [...chapterBuckets.values()].map(bucket => {
    const finalized = finalizeBucket(bucket, { overallAccuracy, now, diagnosticReady });
    const uniqueSeen = bucket.quizIds.size;
    const activeErrors = activeItems.filter(item => item.chapter === bucket.chapter).length;
    const resolvedErrors = recoveredItems.filter(item => item.chapter === bucket.chapter).length;
    const output = {
      ...finalized,
      coveragePct: percentage(uniqueSeen, bucket.totalQuiz) ?? 0,
      activeErrors,
      resolvedErrors
    };
    output.status = chapterStatus(output);
    output.statusLabel = statusLabel(output.status);
    return output;
  }).sort((left, right) => left.chapter - right.chapter);

  const sortRisk = values => values.sort((left, right) => right.riskScore - left.riskScore || Date.parse(right.lastErrorAt) - Date.parse(left.lastErrorAt));
  const errors = {
    figures: sortRisk(figures.filter(item => item.status === "attenzione")),
    questions: sortRisk(questions.filter(item => item.status === "attenzione")),
    words: sortRisk(words.filter(item => item.status === "attenzione")),
    topics: sortRisk(topics.filter(item => item.status === "attenzione")),
    recovered: recoveredItems.sort((left, right) => Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt))
  };
  const plan = buildPlan(activeItems, chapters, diagnosticReady);

  return {
    generatedAt: new Date(now).toISOString(),
    state: totalAnswers === 0 ? "empty" : diagnosticReady ? "ready" : "insufficient",
    minimumAnswers: LEARNING_ANALYTICS_RULES.diagnosticMinimumAnswers,
    summary: {
      totalAnswers,
      totalCorrect,
      totalWrong,
      overallAccuracyPct: totalAnswers ? overallAccuracy : null,
      recentAccuracyPct: recentAccuracy,
      recentWindowSize: recent.length,
      uniqueQuizSeen: uniqueQuiz,
      quizCoveragePct: percentage(uniqueQuiz, LEARNING_CATALOG.totalQuiz) ?? 0,
      activeErrors: activeItems.length,
      recoveredThisWeek: recoveredItems.length,
      pendingLocalEvents: Math.max(0, Number(options.pendingLocalEvents) || 0),
      pendingLocalIncluded: Math.max(0, Number(options.pendingLocalEvents) || 0) > 0 && options.pendingLocalIncluded !== false
    },
    journey: buildJourney(totalAnswers),
    insight: buildInsight({ diagnosticReady, totalAnswers, activeItems, recoveredItems, recentAccuracy }),
    chapters,
    errors,
    plan,
    dataQuality: {
      acceptedEvents: events.length,
      rejectedEvents: Math.max(0, (Array.isArray(rawEvents) ? rawEvents.length : 0) - events.length),
      catalogQuizCount: LEARNING_CATALOG.totalQuiz,
      contextualizedQuizCount: LEARNING_CATALOG.contextualized,
      contextCoveragePct: LEARNING_CATALOG.contextCoveragePct,
      sourceTruncated: options.sourceTruncated === true
    }
  };
}
