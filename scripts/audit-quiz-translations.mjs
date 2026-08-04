import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { listCuratedQuizTranslations } from "../api/quiz-translations.mjs";

const runtimePath = fileURLToPath(new URL("../data/patente/quiz-help-runtime-v2.json", import.meta.url));
const runtime = JSON.parse(readFileSync(runtimePath, "utf8"));
const rows = Object.values(runtime.quizzes || {});
const filledContextRows = rows.filter(row => String(row?.[4] || "").trim());
const rowsWithContextKeywords = filledContextRows.filter(row =>
  (row?.[3] || []).some(id => String(id).startsWith("ctx_"))
);

const groupedContext = new Map();
for (const row of filledContextRows) {
  const value = String(row[4]).trim();
  groupedContext.set(value, (groupedContext.get(value) || 0) + 1);
}

const repeatedContextRows = filledContextRows.filter(row =>
  (groupedContext.get(String(row[4]).trim()) || 0) > 1
).length;

const report = {
  dataset: "quiz-help-runtime-v2",
  grain: "una riga per quiz",
  counts: {
    quizzes: rows.length,
    emptyFifthField: rows.length - filledContextRows.length,
    nonEmptyFifthField: filledContextRows.length,
    distinctFifthFieldValues: groupedContext.size,
    fifthFieldRowsWithContextKeywords: rowsWithContextKeywords.length,
    repeatedFifthFieldRows: repeatedContextRows,
    curatedQuestionTranslations: listCuratedQuizTranslations().length
  },
  finding: {
    severity: "high",
    code: "v2_fifth_field_is_context_not_question_translation",
    evidence: `${rowsWithContextKeywords.length}/${filledContextRows.length} righe compilate collegano il quinto campo a keyword ctx_*`,
    remediation: "Usare il quinto campo solo come nota contestuale; prendere la traduzione da question_bd, override curati o fallback on-demand."
  }
};

console.log(JSON.stringify(report, null, 2));
