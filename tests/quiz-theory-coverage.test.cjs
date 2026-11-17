'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const bank = require('../api/_quiz-bank.json').quiz;
const {findQuizTheory} = require('../lib/quiz-theory.cjs');

test('all 443 figure-free chapter questions resolve; no illustrated chapter question resolves', () => {
  const chapters = bank.filter(q => /^cap\d+_q\d+$/.test(q.id));
  assert.equal(chapters.length, 788);
  let covered = 0;
  for (const row of chapters) {
    const result = findQuizTheory(row);
    if (row.figure) { assert.equal(result, null, row.id); continue; }
    assert.ok(result, row.id);
    assert.equal(result.correct_answer, Boolean(row.correct), row.id);
    assert.equal(findQuizTheory({...row, correct: !Boolean(row.correct)}), null, row.id);
    covered++;
  }
  assert.equal(covered, 443);
});

test('new decisive phrases are literal question excerpts, never inferred answer shortcuts', () => {
  const records = require('../api/_quiz-theory.json');
  for (const record of records.slice(71)) {
    assert.ok(record.question_it.toLowerCase().includes(record.focus_it.toLowerCase()), record.id);
    for (const text of Object.values(record.explanation)) {
      assert.doesNotMatch(text, /\b(?:sempre vero|sempre falso)\b/i);
    }
  }
});
