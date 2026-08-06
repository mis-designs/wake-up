import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function normalizeBinary(value, field, rowNumber, { optional = false } = {}) {
  const normalized = String(value ?? "").trim();
  if (optional && normalized === "") return null;
  if (normalized === "0") return 0;
  if (normalized === "1") return 1;
  throw new Error(`Invalid ${field} value at CSV row ${rowNumber}: ${JSON.stringify(value)}`);
}

const inputPath = resolve(process.argv[2] || "QuizBank - quiz.csv");
const outputPath = resolve(process.argv[3] || "api/_quiz-bank.json");
const csv = (await readFile(inputPath, "utf8")).replace(/^\uFEFF/, "");
const parsed = parseCsv(csv).filter(row => row.some(value => String(value).trim() !== ""));
if (parsed.length < 2) throw new Error("CSV has no quiz rows");

const headers = parsed.shift().map(value => String(value).trim());
const requiredHeaders = ["id", "chapter", "question", "figure", "correct"];
for (const header of requiredHeaders) {
  if (!headers.includes(header)) throw new Error(`Missing required CSV column: ${header}`);
}

const records = parsed.map((values, index) => Object.fromEntries(
  headers.map((header, column) => [header, values[column] ?? ""])
));
const ids = new Set();
const quiz = records.map((record, index) => {
  const rowNumber = index + 2;
  const id = String(record.id).trim();
  const question = String(record.question).trim();
  const chapter = Number(String(record.chapter).trim());
  if (!id) throw new Error(`Missing id at CSV row ${rowNumber}`);
  if (ids.has(id)) throw new Error(`Duplicate quiz id at CSV row ${rowNumber}: ${id}`);
  if (!question) throw new Error(`Missing question at CSV row ${rowNumber}`);
  if (!Number.isInteger(chapter) || chapter < 0 || chapter > 25) {
    throw new Error(`Invalid chapter at CSV row ${rowNumber}: ${JSON.stringify(record.chapter)}`);
  }
  ids.add(id);

  return {
    id,
    chapter,
    question,
    figure: String(record.figure || "").trim(),
    correct: normalizeBinary(record.correct, "correct", rowNumber),
    question_bd: String(record.question_bd || "").trim(),
    explanations: normalizeBinary(record.explanations, "explanations", rowNumber, { optional: true }),
    xyz3d: normalizeBinary(record.xyz3d, "xyz3d", rowNumber, { optional: true })
  };
});

const chapterQuestions = quiz.filter(row => row.chapter !== 0).length;
const examQuestions = quiz.filter(row => row.chapter === 0).length;
if (chapterQuestions !== 788 || examQuestions !== 80) {
  throw new Error(`Unexpected quiz counts: ${chapterQuestions} chapter questions, ${examQuestions} exam questions`);
}

const output = {
  meta: {
    source: "QuizBank - quiz.csv",
    count: quiz.length,
    chapterQuestions,
    examQuestions
  },
  quiz
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output)}\n`, "utf8");
console.log(`Imported ${quiz.length} questions (${chapterQuestions} chapter, ${examQuestions} exam) to ${outputPath}`);
