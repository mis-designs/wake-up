import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getVideoClassCatalog } from '../api/video-class-catalog.mjs';
const text = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const lessons = getVideoClassCatalog().lessons;
const vocabulary = lessons.filter(x => x.kind === 'parole');

test('all fourteen vocabulary covers have distinct, source-backed Italian/Bangla pairs', () => {
  const glossary = JSON.parse(text('data/patente/quiz-help-runtime-v2.json')).words;
  assert.equal(vocabulary.length, 14);
  const used = new Set();
  for (const lesson of vocabulary) {
    assert.equal(lesson.coverWords.length, 2);
    for (const word of lesson.coverWords) {
      const source = glossary[word.key];
      assert.ok(source, word.key);
      assert.equal(word.it.toLocaleLowerCase('it-IT'), source[0]);
      assert.ok(source[1].split('/').map(x => x.trim()).includes(word.bn), word.it);
      assert.match(word.bn, /[\u0980-\u09ff]/u);
      assert.doesNotMatch(word.bn, /\uFFFD|[A-Za-z]/u);
      assert.ok(!used.has(word.key), `${word.it} should not repeat across covers`);
      used.add(word.key);
    }
  }
  assert.equal(used.size, 28);
  for (const lesson of lessons.filter(x => x.kind !== 'parole')) assert.equal(lesson.coverWords, undefined);
});

test('only the five source-labelled vocabulary parts claim a chapter association', () => {
  assert.equal(vocabulary.filter(x => x.relatedChapter === '01').length, 5);
  for (const lesson of vocabulary) {
    assert.equal(lesson.relatedChapter, lesson.sourceTitle.startsWith('Parole del capitolo 1 ·') ? '01' : undefined);
    assert.ok(lesson.aliases.every(x => !x.includes('· রাস্তা')), 'source references stay unchanged');
  }
  assert.deepEqual(vocabulary[0].coverWords.map(x => `${x.it} · ${x.bn}`), ['Strada · রাস্তা', 'Corsia · লেন']);
});

test('vocabulary covers use accessible language spans and centered separators, not ABC', () => {
  const js = text('video-class.js'), css = text('video-class.css');
  assert.doesNotMatch(js, /\bABC\b/);
  assert.match(js, /class: 'vc-word-dot', 'aria-hidden': 'true' \}, '·'/);
  assert.match(js, /lang: 'it' \}, word.it/);
  assert.match(js, /lang: 'bn' \}, word.bn/);
  assert.match(js, /'aria-hidden': vocabulary \? undefined : 'true'/);
  assert.match(css, /\.vc-library \.vc-cover-word \[lang="bn"\] \{[^}]*var\(--font-bn-support\)/);
  assert.match(css, /\.vc-cover-word \{[^}]*align-items: center/);
});
