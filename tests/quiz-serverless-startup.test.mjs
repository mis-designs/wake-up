import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { traceServerless } from "./serverless-trace.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

test("the traced Quiz function includes its catalogs and starts outside the source checkout", async t => {
  const { fileList } = await traceServerless("api/quiz.js", projectRoot);
  const files = new Set([...fileList].map(file => file.replaceAll("\\", "/")));
  for (const file of ["api/_quiz-bank.json", "api/_quiz-theory.json", "lib/quiz-theory.cjs", "lib/quiz-theory-response.mjs", "data/quiz-audio-legacy-collisions-v1.json", "quiz-audio-identity.cjs", "api/figure-study.mjs", "figure-catalog.mjs"]) {
    assert.ok(files.has(file), `Vercel would omit ${file}`);
  }

  for (const dependency of ["@aws-sdk/client-s3", "@neondatabase/serverless"]) {
    assert.ok([...files].some(file => file.startsWith(`node_modules/${dependency}/`) && /\.[cm]?js$/.test(file)),
      `The bundle must contain executable ${dependency} files, not a node_modules junction`);
  }
  const temporaryRoot = path.resolve(tmpdir());
  const bundle = await mkdtemp(path.join(temporaryRoot, "magicph-quiz-bundle-"));
  t.after(async () => {
    const relative = path.relative(temporaryRoot, path.resolve(bundle));
    assert.ok(relative.startsWith("magicph-quiz-bundle-") && !relative.includes(path.sep));
    await rm(bundle, { recursive: true, force: true });
  });
  for (const file of fileList) {
    const destination = path.resolve(bundle, file);
    assert.ok(destination.startsWith(bundle + path.sep));
    await mkdir(path.dirname(destination), { recursive: true });
    const source = path.resolve(projectRoot, file);
    assert.ok((await stat(source)).isFile(), `Expected a traced file: ${file}`);
    await copyFile(source, destination);
  }

  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import crypto from 'node:crypto';
    process.env.SESSION_SECRET = 'isolated-deployment-test';
    process.env.GAS_ACCESS_URL = 'https://access.invalid';
    process.env.GAS_SECRET = 'test-only';
    process.env.ADMIN_PHONE_NUMBERS = '1234567890';
    const { default: handler } = await import('./api/quiz.js');
    const phone = '1234567890', deviceId = 'bundle_test';
    const payload = Buffer.from(JSON.stringify({ phone, deviceId, purpose: 'access', role: 'admin', exp: Date.now() + 60000 })).toString('base64url');
    const token = payload + '.' + crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
    const response = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ method: 'POST', headers: { authorization: 'Bearer ' + token }, body: { action: 'getAdminAudioCatalog', phone, deviceId } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.quiz.length, 868);
    const quizPayload = Buffer.from(JSON.stringify({ phone, deviceId, purpose: 'quiz', role: 'user', exp: Date.now() + 60000 })).toString('base64url');
    const quizToken = quizPayload + '.' + crypto.createHmac('sha256', process.env.SESSION_SECRET).update(quizPayload).digest('base64url');
    const row = response.body.quiz.find(row => row.id === 'cap1_q38');
    assert.ok(row);
    const theoryResponse = { ...response, body: null };
    await handler({ method: 'POST', headers: { 'x-quiz-session': quizToken }, body: {
      action: 'getQuizTheory', phone, deviceId, questionId: row.id, question: row.question, figure: String(row.figure || '')
    } }, theoryResponse);
    assert.equal(theoryResponse.statusCode, 200);
    assert.equal(theoryResponse.body.theory.correct_answer, false);
    assert.ok(theoryResponse.body.theory.explanation.it && theoryResponse.body.theory.explanation.bn);
    console.log('ISOLATED_CATALOG_OK');
    console.log('ISOLATED_THEORY_OK');
  `], { cwd: bundle, encoding: "utf8", timeout: 20_000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
  assert.match(result.stdout, /ISOLATED_CATALOG_OK/);
  assert.match(result.stdout, /ISOLATED_THEORY_OK/);
});
