import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const source = read('quiz-help.js');

test('browser reminders are bounded, do not repeat on revisits and stop after help is used', () => {
  let dismissed = false, shown = false;
  const env = vm.createContext({
    isNativeQuiz: false, current: 0, document: { hidden: false },
    currentQuestion: () => ({ id: 1 }),
    clickHint: { classList: { contains: () => dismissed } },
    questionArea: { classList: { toggle: (_name, value) => { shown = value; } } }
  });
  const start = source.indexOf('  function updateWebHint()');
  const end = source.indexOf('  updateWebHint();', start);
  vm.runInContext('const hintedQuestions = new Set();\n' + source.slice(start, end), env);
  env.updateWebHint(); assert.equal(shown, true);
  env.updateWebHint(); assert.equal(shown, false);
  env.current = 1; env.updateWebHint(); assert.equal(shown, false);
  env.current = 5; env.updateWebHint(); assert.equal(shown, true);
  env.document.hidden = true;
  env.current = 10; env.updateWebHint(); assert.equal(shown, false);
  env.document.hidden = false; env.updateWebHint(); assert.equal(shown, true);
  env.current = 15; env.updateWebHint(); assert.equal(shown, false);
  dismissed = true;
  vm.runInContext('hintedQuestions.clear()', env);
  env.current = 0; env.updateWebHint(); assert.equal(shown, false);
  assert.doesNotMatch(source.slice(start, end), /fetch\(|setInterval|setTimeout/);
});

test('only installed phones can select fullscreen, and web empty-space activation excludes child controls', () => {
  assert.equal((source.match(/setHelpFullscreen\(isNativeQuiz && phoneHelpQuery.matches\)/g) || []).length, 2);
  assert.doesNotMatch(source, /setHelpFullscreen\(phoneHelpQuery.matches\)/);
  assert.match(source, /if \(!isNativeQuiz\) \{[\s\S]*questionArea.addEventListener\("click"/);
  assert.match(source, /\[questionArea, questionScroller, document.querySelector\("\.quiz-question-actions"\)\].includes\(event.target\)/);
  assert.match(source, /window.getSelection\(\)\?\.toString\(\)/);
});

test('web help uses the emerald owner and only roomy viewports split into columns', () => {
  const css = read('quiz-help.css');
  assert.match(css, /background: color-mix\(in srgb, var\(--audio-player-emerald\) 8%, transparent\)/);
  assert.match(css, /@media \(min-width: 768px\) and \(min-height: 501px\), \(min-width: 951px\)/);
  assert.match(css, /html:not\(\.android-webview\) \.quiz-page \.has-web-help \.quiz-question-content/);
  assert.match(css, /quizWebHintReminder 8s ease-out both/);
  assert.match(css, /quizClickHintTap 1s ease-in-out 2/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
