import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { FIGURE_CATALOG } from '../figure-catalog.mjs';
import { FIGURE_STUDY_CATEGORIES, FIGURE_STUDY_ITEMS, studyFigure, searchStudyFigures, figureStudyPath } from '../figure-study-catalog.mjs';
import { selectFigureStudyExamples } from '../api/figure-study.mjs';
import { createFigureStudyData, explanationImageSource } from '../figure-study-data.mjs';
import { explanationFilesFromObjects } from '../api/quiz-explanation-availability.mjs';
import { LOCAL_MAGIC_BOOK_ROWS } from '../api/local-quiz-bank.mjs';
import { applyQuizFigureCorrections } from '../api/quiz-figure-corrections.mjs';
import { FIGURE_STUDY_NOTES } from '../figure-study-notes.mjs';

test('lesson mount never fetches illustrations; one delegated disclosure listener owns the read', () => {
  const ui = readFileSync(new URL('../figure-study.js', import.meta.url), 'utf8');
  const lesson = ui.slice(ui.indexOf('  function renderLesson'), ui.indexOf('  async function loadExplanation'));
  assert.doesNotMatch(lesson, /loadExplanation\(|data\.read\(/);
  assert.match(ui, /root\.addEventListener\('toggle',[\s\S]*capture: true, signal: lifetime\.signal/);
  assert.match(ui, /header\('Segnali e figure', 'Studia'\)/);
  assert.match(ui, /if \(manual\) data\.invalidate\('getExplanationFigures'\)/);
});

test('preview labels preserve canonical identity; parking is an indication and notes use exact IDs', () => {
  assert.equal(studyFigure('fig86').category, 'indicazione');
  assert.equal(studyFigure('fig126').displayTitle, 'Limitazione');
  assert.equal(studyFigure('fig126').italian, FIGURE_CATALOG.fig126.italian);
  assert.ok(searchStudyFigures('pannelli', 'শুধু').some(item => item.id === 'fig126'));
  assert.match(FIGURE_STUDY_NOTES.fig15.it, /Preavvisa/);
  assert.match(FIGURE_STUDY_NOTES.fig218.it, /punto/);
  for (const [id, note] of Object.entries(FIGURE_STUDY_NOTES)) {
    assert.ok(studyFigure(id)); assert.match(note.bn, /[\u0980-\u09ff]/);
    assert.ok([83, 88, 135].includes(note.article));
  }
});

test('manual manifest retry refreshes only that entry; repeated reads still deduplicate', async () => {
  const calls = [];
  const data = createFigureStudyData(async action => { calls.push(action); return {}; });
  await data.read('getExplanationFigures'); await data.read('getFigureStudy', 'fig40');
  data.invalidate('getExplanationFigures');
  await Promise.all([data.read('getExplanationFigures'), data.read('getExplanationFigures')]);
  await data.read('getFigureStudy', 'fig40');
  assert.deepEqual(calls, ['getExplanationFigures', 'getFigureStudy', 'getExplanationFigures']);
  data.clear();
});

test('all 186 known figures have one explicit category, unchanged bilingual identity and source', () => {
  assert.equal(FIGURE_STUDY_CATEGORIES.length, 12);
  assert.equal(new Set(FIGURE_STUDY_ITEMS.map(x => x.id)).size, 186);
  assert.deepEqual(FIGURE_STUDY_ITEMS.map(x => x.id).sort(), Object.keys(FIGURE_CATALOG).sort());
  for (const item of FIGURE_STUDY_ITEMS) {
    assert.equal(item.italian, FIGURE_CATALOG[item.id].italian);
    assert.match(item.bangla, /[\u0980-\u09ff]/);
    assert.ok(item.page > 0);
  }
  assert.equal(studyFigure('fig704').category, 'spie');
  assert.equal(studyFigure('fig40').category, 'precedenza');
  assert.equal(studyFigure('fig15').category, 'pericolo');
});
test('local bilingual search, combined words, category scope and safe deep links', () => {
  assert.equal(searchStudyFigures('spie', 'olio')[0].id, 'fig706');
  assert.ok(searchStudyFigures('', 'রাস্তা').length > 0);
  assert.equal(searchStudyFigures('divieto', 'olio').length, 0);
  assert.equal(searchStudyFigures('', 'discesa pericolosa')[0].id, 'fig17');
  assert.doesNotMatch(figureStudyPath({ category: '<script>', figure: '../secret' }), /script|secret/);
});
test('examples match exact corrected figure; never fabricate a missing true/false pair or return Exam rows', () => {
  const rows = LOCAL_MAGIC_BOOK_ROWS.map(applyQuizFigureCorrections);
  for (const item of FIGURE_STUDY_ITEMS) {
    const examples = selectFigureStudyExamples(rows, item.id);
    assert.ok(examples.length <= 2);
    assert.equal(new Set(examples.map(x => x.correct)).size, examples.length);
    for (const example of examples) {
      const original = rows.find(x => x.id === example.id);
      assert.equal(example.question, original.question);
      assert.equal(example.correct, Number(original.correct));
      assert.equal(example.figure, item.id);
      assert.ok(Number(example.chapter) > 0);
    }
  }
  assert.equal(selectFigureStudyExamples(rows, 'fig999999'), null);
  assert.deepEqual(selectFigureStudyExamples([{ id: 'exam', chapter: 0, figure: 'fig40', question: 'Exam only', correct: 1 }], 'fig40'), []);
});
test('Allbooks explanation filenames select one exact image, prefer canonical WebP, reject path injection', () => {
  const files = explanationFilesFromObjects([
    { Key: 'explanations/fig40_0.png' }, { Key: 'explanations/fig40.webp', LastModified: '2026-09-19T00:00:00Z' },
    { Key: 'explanations/fig1_1.jpg' }, { Key: 'private/fig1.webp' }, { Key: 'explanations/../secrets.webp' }
  ]);
  assert.equal(files.fig40.file, 'fig40.webp');
  assert.equal(files.fig1.file, 'fig1_1.jpg');
  assert.equal(Object.keys(files).length, 2);
  const src = new URL(explanationImageSource({ files }, 'fig40'), 'https://fixture.invalid');
  assert.equal(src.searchParams.get('file'), 'fig40.webp');
  assert.equal(src.searchParams.get('v'), String(Date.parse('2026-09-19T00:00:00Z')));
  assert.equal(explanationImageSource({ files: { fig40: { file: '../secret.webp' } } }, 'fig40'), '');
  assert.equal(explanationImageSource({ files }, 'fig2'), '');
});
test('read budget: simultaneous reads deduplicate, cached navigation costs zero, scope changes invalidate', async () => {
  let calls = 0, scope = 'a';
  const data = createFigureStudyData(async () => { calls++; return { examples: [] }; }, () => scope);
  await Promise.all([data.read('getFigureStudy', 'fig40'), data.read('getFigureStudy', 'fig40')]);
  await data.read('getFigureStudy', 'fig40');
  assert.equal(calls, 1);
  scope = 'b'; await data.read('getFigureStudy', 'fig40'); assert.equal(calls, 2); data.clear();
});
test('leaving aborts pending reads and rejects late responses; failed reads permit explicit retry', async () => {
  let release, signal, calls = 0;
  const data = createFigureStudyData((_action, _params, options) => {
    calls++; signal = options.signal; return new Promise(resolve => { release = resolve; });
  });
  const pending = data.read('getFigureStudy', 'fig40'); await Promise.resolve();
  data.cancel(); assert.equal(signal.aborted, true); release({ examples: [] });
  await assert.rejects(pending, /Cancelled/);
  const retry = data.read('getFigureStudy', 'fig40'); await Promise.resolve(); release({ examples: [] }); await retry;
  assert.equal(calls, 2); data.clear();
});

test('memory reads expire after one minute and retain at most sixteen entries', async t => {
  let now = 1000, calls = 0;
  t.mock.method(Date, 'now', () => now);
  const data = createFigureStudyData(async () => { calls++; return {}; });
  await data.read('getFigureStudy', 'fig1');
  now += 59999; await data.read('getFigureStudy', 'fig1'); assert.equal(calls, 1);
  now += 1; await data.read('getFigureStudy', 'fig1'); assert.equal(calls, 2);
  for (let n = 2; n <= 17; n++) await data.read('getFigureStudy', `fig${n}`);
  await data.read('getFigureStudy', 'fig1'); assert.equal(calls, 19, 'oldest item was evicted');
  data.clear();
});

test('a slow read has one ten-second deadline, clears its timer and never automatically retries', async t => {
  let deadline, calls = 0, cleared = 0;
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    assert.equal(delay, 10000); deadline = callback; return 123;
  });
  t.mock.method(globalThis, 'clearTimeout', id => { assert.equal(id, 123); cleared++; });
  const data = createFigureStudyData((_action, _params, { signal }) => {
    calls++;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  const result = data.read('getFigureStudy', 'fig40');
  await Promise.resolve(); deadline();
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(calls, 1); assert.equal(cleared, 1); data.clear();
});
test('authenticated figure examples use the existing access policy and zero upstream calls with a valid token', async t => {
  const env = { SESSION_SECRET: 'figure-study-test-secret', GAS_ACCESS_URL: 'https://fixture.invalid', GAS_SECRET: 'fixture', QUIZ_GAS_URL: 'https://fixture.invalid', QUIZ_PROXY_SECRET: 'fixture' };
  for (const [key, value] of Object.entries(env)) { const old = process.env[key]; process.env[key] = value; t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; }); }
  t.mock.method(globalThis, 'fetch', () => assert.fail('unexpected upstream request'));
  const { default: handler } = await import(`../api/quiz.js?figures=${crypto.randomUUID()}`);
  const phone = '39123456789', deviceId = 'figure-study-test-device';
  const payload = Buffer.from(JSON.stringify({ phone, deviceId, purpose: 'access', role: 'user', exp: Date.now() + 60000 })).toString('base64url');
  const token = `${payload}.${crypto.createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url')}`;
  const invoke = async (figure, reqPhone = phone) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ method: 'GET', query: { action: 'getFigureStudy', phone: reqPhone, deviceId, figure }, headers: { authorization: `Bearer ${token}` } }, res);
    return res;
  };
  const valid = await invoke('fig40'); assert.equal(valid.statusCode, 200);
  assert.ok(valid.body.examples.length > 0 && valid.body.examples.length <= 2);
  assert.equal(valid.headers['Cache-Control'], 'no-store');
  assert.equal(valid.headers['Vercel-CDN-Cache-Control'], 'no-store');
  assert.equal((await invoke('fig99999')).statusCode, 400);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ success: false, error: 'device_mismatch' }));
  const denied = await invoke('fig40', '39999999999');
  assert.equal(denied.statusCode, 403); assert.equal(denied.body.examples, undefined);
});
