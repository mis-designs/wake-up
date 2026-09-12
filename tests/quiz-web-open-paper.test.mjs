import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = file => readFileSync(new URL('../'+file,import.meta.url),'utf8');
const styles=read('mystyle.css');
const start=styles.indexOf('/* Open-paper web Quiz.');
const end=styles.indexOf('/* Focused live Quiz',start);
const variant=styles.slice(start,end);

test('open-paper styling cannot reach the installed Android layout',()=>{
  assert.ok(start>0 && end>start);
  let rules=0;
  for (const [,selector] of variant.matchAll(/([^{}]+)\{/g)) {
    const clean=selector.replace(/\/\*[\s\S]*?\*\//g,'').trim();
    if(clean.startsWith('@')) continue;
    assert.match(clean,/^html:not\(\.android-webview\) (?:body\.)?quiz-page|^html:not\(\.android-webview\) \.quiz-page/);
    rules++;
  }
  assert.ok(rules>=12);
});

test('the web reading surface is white and divided, not a raised card',()=>{
  assert.match(variant,/\.quiz-container \{[^}]*height: var\(--quiz-viewport-height\);[^}]*margin: 0;[^}]*border-radius: 0;[^}]*background: var\(--color-white\);[^}]*box-shadow: none;/s);
  assert.match(variant,/\.question-area \{[^}]*border: 0;[^}]*border-block: 1px solid var\(--quiz-web-divider\);[^}]*border-radius: 0;[^}]*box-shadow: none;/s);
  assert.match(variant,/\.quiz-command-bar:has\(\.admin-correct-dot-slot\.is-visible\) \{[^}]*padding-bottom: 22px;/s);
  assert.doesNotMatch(variant,/overflow(?:-y)?: hidden|display: none|!important/);
});

test('web question numbers reserve space for a bounded shadow and focus ring',()=>{
  assert.match(variant,/#progress \{[^}]*padding: 10px 8px;[^}]*scrollbar-width: thin;/s);
  assert.match(variant,/--quiz-web-dot-shadow: 0 2px 5px color-mix\(in srgb, var\(--color-dark\) 18%, transparent\)/);
  assert.match(variant,/\.progress-dot--current \{\s*transform: none;\s*box-shadow: var\(--quiz-web-dot-shadow\)/);
  assert.match(variant,/\.progress-dot:focus-visible \{[^}]*outline: 2px solid var\(--color-primary\);[^}]*outline-offset: 3px;/s);
  assert.match(read('quiz.html'),/mystyle\.css\?v=56-web-open-paper/);
  assert.match(read('service-worker.js'),/magicbook-pwa-v196-dictionary-tts/);
});
