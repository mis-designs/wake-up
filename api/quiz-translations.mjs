const CURATED_TRANSLATION_ROWS = Object.freeze([
  Object.freeze({
    id: "q00149",
    question: "La carreggiata non comprende le piste ciclabili",
    translation: "গাড়ি চলার অংশের মধ্যে সাইকেল চলার পথ অন্তর্ভুক্ত নয়।"
  })
]);

export function normalizeQuizTranslationId(value = "") {
  const source = String(value || "").trim().toLocaleLowerCase("it-IT");
  if (/^q\d{5}$/u.test(source)) return source;
  const digits = source.match(/^(?:q)?(\d+)$/u)?.[1];
  if (!digits) return "";
  const number = Number(digits);
  return Number.isInteger(number) && number > 0
    ? `q${String(number).padStart(5, "0")}`
    : "";
}

export function normalizeItalianQuizText(value = "") {
  return String(value || "")
    .normalize("NFC")
    .toLocaleLowerCase("it-IT")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[\u2018\u2019`\u00b4]/gu, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function isUsableBengaliTranslation(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  return [...text].some(character => {
    const codePoint = character.codePointAt(0);
    return codePoint >= 0x0980 && codePoint <= 0x09ff;
  });
}

const CURATED_BY_ID = new Map(
  CURATED_TRANSLATION_ROWS.map(row => [normalizeQuizTranslationId(row.id), row])
);
const CURATED_BY_QUESTION = new Map(
  CURATED_TRANSLATION_ROWS.map(row => [normalizeItalianQuizText(row.question), row])
);

export function getCuratedQuizTranslation({ id, question } = {}) {
  const normalizedId = normalizeQuizTranslationId(id);
  const normalizedQuestion = normalizeItalianQuizText(question);
  const idMatch = CURATED_BY_ID.get(normalizedId);

  // An ID alone is sufficient when resolving a catalog row. If both values
  // are present, require them to agree so a forged ID cannot change unrelated
  // Bengali audio.
  if (idMatch && (!normalizedQuestion || normalizeItalianQuizText(idMatch.question) === normalizedQuestion)) {
    return idMatch.translation;
  }

  return CURATED_BY_QUESTION.get(normalizedQuestion)?.translation || "";
}

export function applyCuratedQuizTranslation(row = {}) {
  const translation = getCuratedQuizTranslation({ id: row.id, question: row.question });
  if (!translation) return row;
  return {
    ...row,
    question_bd: translation,
    questionTranslationSource: "curated"
  };
}

export function listCuratedQuizTranslations() {
  return CURATED_TRANSLATION_ROWS.map(row => ({ ...row }));
}
