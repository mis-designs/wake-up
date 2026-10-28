// Emits an apply_patch patch, not a copy of the private exam questions.
// Usage: node scripts/build-quizbank-audio-references.mjs <AllBooks JSON> <QuizBank JSON>
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { audioContentSignature } from "../api/quiz-audio-catalog.mjs";
const [referencePath, bankPath] = process.argv.slice(2);
const referenceBytes = fs.readFileSync(referencePath);
const reference = JSON.parse(referenceBytes);
const bank = JSON.parse(fs.readFileSync(bankPath, "utf8"));
const digest = row => crypto.createHash("sha256").update(audioContentSignature(row)).digest("hex");
const all = Object.values(reference).flatMap(topics => Object.values(topics).flat());
const verified = new Set(all.map(row => digest({ question: row.q, figure: row.img, correct: row.a })));
const signatures = [...new Set(bank.map(row => digest({ question: row.domanda, figure: row.numero_figura || "", correct: row.risposta_corretta })))]
  .filter(key => verified.has(key)).sort();
const result = { source: "Ed0ardo/QuizPatenteB quizPatenteB2023.json (MIT)",
  sourceSha256: crypto.createHash("sha256").update(referenceBytes).digest("hex"), signatures };
const json = JSON.stringify(result, null, 2);
process.stdout.write(`*** Begin Patch\n*** Add File: ${fileURLToPath(new URL("../api/quizbank-audio-references.json", import.meta.url)).replaceAll("\\", "/")}\n`
  + json.split("\n").map(line => `+${line}`).join("\n") + "\n*** End Patch\n");
