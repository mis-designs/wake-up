import test from "node:test";
import assert from "node:assert/strict";
import { nodeFileTrace } from "@vercel/nft";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("QuizBank function tracing includes the exact-audio proofs and shared media owners, not the private archive", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const { fileList } = await nodeFileTrace(["api/quizbank.js"], { base: root, processCwd: root });
  const files = new Set([...fileList].map(file => file.replaceAll("\\", "/")));
  for (const file of ["api/quiz.js", "api/quizbank-catalog.mjs", "api/quizbank-audio-references.json", "api/_quiz-bank.json", "lib/bounded-work-cache.mjs", "lib/quiz-audio-upload.mjs", "api/audio-mime.mjs"]) assert.ok(files.has(file), file);
  assert.ok(![...files].some(file => /50_schede|figure_pdf|outputs\//.test(file)));
});

test("QuizBank Home entry keeps private API responses out of service-worker caches", () => {
  const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)\) return/);
  const home = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(home, /href=["']\/quizbank["'] data-quizbank-entry/);
  const page = readFileSync(new URL("../quizbank.html", import.meta.url), "utf8");
  assert.match(page, /data-study-source="quizbank"/);
  assert.match(page, /noindex,nofollow,noarchive/);
  assert.doesNotMatch(page, /secret_access_key|access_key_id|cloudflarestorage/);
});
