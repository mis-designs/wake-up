import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const desktop = read('quiz-help-desktop.js'), help = read('quiz-help.js'), css = read('quiz-help.css');

test('PC help requires a roomy fine-pointer browser, never the installed shell', () => {
  assert.match(desktop, /\(min-width: 951px\) and \(hover: hover\) and \(pointer: fine\)/);
  assert.match(help, /const desktopHelp = !isNativeQuiz \? window.MagicQuizDesktopHelp\?\.create/);
  assert.match(help, /if \(!isNativeQuiz && !desktopHelp\?\.active\)/);
  assert.match(help, /function revealWebHelp\(\) \{\s*if \(desktopHelp\?\.active\) return;/);
});
test('desktop adapter reuses live nodes and never creates a second data or audio engine', () => {
  assert.doesNotMatch(desktop, /fetch\(|XMLHttpRequest|new Audio|localStorage|sessionStorage|setInterval|setTimeout|cloneNode|innerHTML/);
  assert.match(desktop, /pages\[0\].append\(translation, status\)/);
  assert.match(desktop, /pages\[1\].append\(loading, words, detail, context\)/);
  assert.match(desktop, /originalNodes.forEach\(node => content.appendChild\(node\)\)/);
  assert.match(desktop, /home.after\(workspace\)/);
  assert.match(help, /onPageChange: stopWordAudio/);
});
test('floating reader is non-modal with real tabs and bounded cancellable positioning', () => {
  assert.match(desktop, /setAttribute\("aria-modal", "false"\)/);
  for (const role of ['tablist', 'tab', 'tabpanel']) assert.ok(desktop.includes(`setAttribute("role", "${role}")`));
  assert.match(desktop, /page.inert = i !== index/);
  assert.match(desktop, /ArrowLeft: 1 - index, ArrowRight: 1 - index, Home: 0, End: 1/);
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'resize', 'blur', 'visibilitychange']) assert.ok(desktop.includes(`"${event}"`));
  assert.match(desktop, /Math.max\(12, Math.min\(left/);
});
test('dark presentation stays scoped, with static motion and high contrast fallbacks', () => {
  assert.match(css, /\.quiz-help-workspace.is-desktop-help \{\s*--help-paper: #18181b;/);
  assert.match(css, /grid-template-rows: auto minmax\(0, 1fr\) 44px/);
  assert.match(css, /scrollbar-color: #74747a var\(--help-paper\)/);
  assert.match(css, /\.quiz-help-desktop-track, \.quiz-help-desktop-pager button::after \{ transition: none;/);
  assert.match(css, /--help-paper: Canvas; --help-chrome: Canvas; --help-ink: CanvasText;/);
});
test('desktop presentation is shipped before the help controller and precached consistently', () => {
  const html = read('quiz.html'), worker = read('service-worker.js');
  assert.ok(html.indexOf('quiz-help-desktop.js?v=1-allbooks') < html.indexOf('quiz-help.js?v=20260928-desktop'));
  assert.match(worker, /"\/quiz-help-desktop.js\?v=1-allbooks"/);
  assert.match(worker, /magicbook-pwa-v242-desktop-help/);
});
