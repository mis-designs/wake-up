'use strict';
// Usage: node scripts/build-figure-video-chapters.cjs /path/to/AllBooks/quizBookCompiled26Sections.json
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
function buildFigureChapters(book, catalog) {
  const chapters = [], figures = Object.fromEntries(catalog.map(row => [row.id, []]));
  const byNumber = new Map(catalog.map(row => [row.number, row.id]));
  for (const [key, section] of Object.entries(book.sezioni)) {
    const match = /^SEZIONE_BOTTONE_(\d{2})$/.exec(key);
    if (!match || Number(match[1]) === 0) continue; // Mix repeats other chapters.
    const chapter = String(Number(match[1]));
    chapters.push({ chapter, title: section.titolo });
    const found = new Set();
    for (const question of section.domande) {
      const number = /^\/img_sign\/(\d+)\.png$/i.exec(question.img || '')?.[1];
      const id = byNumber.get(Number(number));
      if (id) found.add(id);
    }
    for (const id of found) figures[id].push(chapter);
  }
  chapters.sort((a, b) => Number(a.chapter) - Number(b.chapter));
  for (const ids of Object.values(figures)) ids.sort((a, b) => Number(a) - Number(b));
  assert.equal(chapters.length, 25, 'Expected the 25 authoritative All Books chapters');
  return { source: 'All Books / quizBookCompiled26Sections.json (excluding Mix)', chapters, figures };
}
if (require.main === module) {
  const source = fs.readFileSync(process.argv[2]);
  const catalog = require('../lib/figure-video-catalog.json');
  const result = buildFigureChapters(JSON.parse(source), catalog);
  result.sourceSha256 = crypto.createHash('sha256').update(source).digest('hex');
  fs.writeFileSync(path.join(__dirname, '../lib/figure-video-chapters.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ chapters: result.chapters.length, figures: Object.keys(result.figures).length, unassigned: Object.values(result.figures).filter(ids => !ids.length).length }));
}
module.exports = { buildFigureChapters };
