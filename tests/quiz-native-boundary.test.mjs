import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('every focused Quiz layout selector requires the installed Android marker', () => {
  for (const name of ['mystyle.css', 'audio-player-ui.css']) {
    const rules = read(name).matchAll(/([^{}]+)\{/g);
    let checked = 0;
    for (const [_, selectorText] of rules) {
      if (!selectorText.includes('.quiz-page.quiz-focus')) continue;
      const selectors = selectorText.replace(/\/\*[\s\S]*?\*\//g, '').trim();
      assert.match(selectors, /^html\.android-webview /, name + ': ' + selectors);
      assert.doesNotMatch(selectors, /,\s*(?:body)?\.quiz-page\.quiz-focus/, name);
      checked++;
    }
    assert.ok(checked >= 10, name + ' must retain the gated native rules');
  }
  assert.match(read('mystyle.css'), /html:not\(\.android-webview\) \.selected,\s*body:not\(\.quiz-focus\) \.selected/);
});

test('thumb X shares the existing close action, outside the scrollable translation', () => {
  const html = read('quiz.html'), css = read('quiz-help.css'), js = read('quiz-help.js');
  const button = html.match(/<button class="quiz-help-close-thumb"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(button);
  assert.match(button, /type="button" data-help-close aria-label="Chiudi traduzione"/);
  assert.match(button, /aria-hidden="true" focusable="false"/);
  assert.equal((html.match(/data-help-close/g) || []).length, 2);
  assert.match(html, /<\/details>\s*<\/div>\s*<div class="quiz-help-thumb-actions">/);
  assert.match(css, /\.quiz-help-thumb-actions \{ display: none; \}/);
  assert.match(css, /html\.android-webview \.quiz-help-workspace\.is-fullscreen \{\s*grid-template-rows: auto minmax\(0, 1fr\) auto;/);
  assert.match(css, /html\.android-webview \.quiz-help-workspace\.is-fullscreen \.quiz-help-thumb-actions \{[^}]*display: flex;[^}]*safe-area-inset-bottom/);
  assert.match(css, /\.quiz-help-close-thumb \{[^}]*width: 52px;[^}]*height: 52px;/);
  assert.match(js, /document.querySelectorAll\("\[data-help-close\]"\).forEach\(button => button.addEventListener\("click", close\)\)/);
});
