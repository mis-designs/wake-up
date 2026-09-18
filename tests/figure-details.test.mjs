import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { FIGURE_CATALOG, getFigureDetail, normalizeFigureId } from '../figure-catalog.mjs';
import { LOCAL_QUIZ_ROWS } from '../api/local-quiz-bank.mjs';
import { applyQuizFigureCorrections } from '../api/quiz-figure-corrections.mjs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('every current MagicBook and Exam figure has a bilingual identity and source page', () => {
  const ids = new Set(LOCAL_QUIZ_ROWS.map(row => normalizeFigureId(applyQuizFigureCorrections(row).figure)).filter(Boolean));
  assert.equal(ids.size, 186);
  for (const id of ids) {
    const item = getFigureDetail(id);
    assert.ok(item, id); assert.ok(item.italian.length > 2, id);
    assert.match(item.bangla, /[\u0980-\u09ff]/u, id);
    assert.ok(Number.isInteger(item.page) && item.page >= 1 && item.page <= 337, id);
    assert.deepEqual(Object.keys(item).sort(), ['bangla', 'id', 'italian', 'number', 'page']);
    assert.ok(Object.isFrozen(item));
  }
  assert.ok(Object.isFrozen(FIGURE_CATALOG));
});
test('identity uses quiz-list IDs, not a proposition or road-code numbering', () => {
  assert.equal(getFigureDetail('fig40').italian, 'Dare precedenza');
  assert.match(getFigureDetail('fig704').italian, /temperatura.*raffreddamento/);
  assert.match(getFigureDetail('fig698').italian, /segnalazione luminosa di pericolo/);
  for (const value of ['fig040', '40', 'path/FIG_040.jpg', 'folder\\fig40.png']) assert.equal(normalizeFigureId(value), 'fig40');
  for (const value of [null, '', '0', 'fig0', '<img>', 'wearetmm', 'fig1other', -4]) assert.equal(normalizeFigureId(value), '');
  assert.equal(getFigureDetail('fig999999'), null);
});
test('shared early history owner consumes only owned layers and can unsubscribe', () => {
  const listeners = [], calls = [];
  const root = { addEventListener: (name, handler) => { if (name === 'popstate') listeners.push(handler); } };
  vm.runInNewContext(read('app-popup.js'), { window: root });
  // This represents Study/Quiz's later route handler, which must NOT run on dismissal.
  listeners.push(() => calls.push('route'));
  const dispatch = () => {
    let stopped = false;
    for (const handler of listeners) { handler({ stopImmediatePropagation() { stopped = true; } }); if (stopped) break; }
  };
  const dispose = root.MagicBookPopup.registerHistoryLayer(() => { calls.push('popup'); return true; });
  dispatch(); assert.deepEqual(calls, ['popup']);
  dispose(); dispatch(); assert.deepEqual(calls, ['popup', 'route']);
  root.MagicBookPopup.registerHistoryLayer(() => false);
  dispatch(); assert.equal(calls.at(-1), 'route');
});
test('all entry points load the early popup owner and shared assets before route code', () => {
  for (const [html, route] of [['index.html','script.js?'],['quiz.html','quiz.js?'],['study-quiz.html','study-quiz.js?'],['aggiungi-spiegazioni.html','aggiungi-spiegazioni.js?']]) {
    const page = read(html);
    assert.ok(page.indexOf('app-popup.js?v=2') >= 0, html);
    assert.ok(page.indexOf('app-popup.js?v=2') < page.lastIndexOf(route), html);
    assert.match(page, /figure-detail\.css\?v=2/);
    assert.match(page, /type="module" src="figure-detail\.js\?v=2"/);
  }
  const worker = read('service-worker.js');
  for (const asset of ['app-popup.js?v=2', 'figure-detail.js?v=2', 'figure-detail.css?v=2', 'figure-catalog.mjs?v=1']) assert.ok(worker.includes(asset), asset);
});
test('figure viewer preserves nodes, scroll and prior modal state without API or route calls', () => {
  const viewer = read('figure-detail.js'), popup = read('app-popup.js'), css = read('figure-detail.css');
  assert.match(viewer, /state\.spacer\.replaceWith\(state\.image\)/);
  assert.match(viewer, /registerHistoryLayer/);
  assert.match(viewer, /restoreScroll\(pendingScrollRestore\)/);
  assert.doesNotMatch(viewer, /fetch\(|cloneNode|location\.reload|openChapter\(/);
  assert.doesNotMatch(viewer, /figure-detail-reference|Figura \$\{/);
  assert.match(viewer, /Nome della figura non ancora disponibile/);
  assert.match(popup, /element\.inert = inert/);
  assert.match(css, /native-action-scallop\.svg/);
  assert.match(css, /--font-bn-title/);
  assert.match(css, /prefers-reduced-motion/);
});
test('compact Study controls and loader keep their shared owners', () => {
  const audio = read('audio-player-ui.css'), loading = read('loading-ui.css'), native = read('android-app-theme.css');
  assert.match(audio, /\.study-page \.study-explanation-player\s*\{[^}]*height:\s*44px/);
  assert.match(audio, /\.study-page \.study-explanation-progress\s*\{[^}]*height:\s*44px/);
  assert.match(native, /\.study-action\.study-action-help\s*\{[^}]*background:\s*var\(--app-palette-primary\);[^}]*color:\s*var\(--app-palette-on-primary\)/);
  assert.match(loading, /--magic-loading-panel-size:\s*clamp\(64px, 14vw, 88px\)/);
  assert.match(loading, /--magic-loading-page-size:\s*clamp\(88px, 20vw, 112px\)/);
});
