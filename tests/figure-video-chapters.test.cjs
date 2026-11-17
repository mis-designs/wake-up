const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFigureChapters } = require('../scripts/build-figure-video-chapters.cjs');
const { figureReferences, resolveFigureVideoRow } = require('../lib/figure-video.cjs');
const catalog = require('../lib/figure-video-catalog.json');
const mapping = require('../lib/figure-video-chapters.json');

test('chapter mapping covers every existing figure without changing its video identity', () => {
  assert.equal(mapping.chapters.length, 25);
  assert.equal(catalog.length, 410);
  for (const row of catalog) {
    const refs = figureReferences(row);
    assert.ok(refs.length > 0);
    assert.equal(new Set(refs.map(ref => ref.chapter)).size, refs.length);
    assert.ok(refs.every(ref => mapping.chapters.some(c => c.chapter === ref.chapter && c.title === ref.title)));
    assert.equal(resolveFigureVideoRow(row.id), row);
  }
  assert.equal(catalog.filter(row => figureReferences(row).length > 1).length, 17);
  assert.equal(figureReferences(resolveFigureVideoRow('fv_1'))[0].chapter, '2');
});

test('builder excludes Mix and counts one association per chapter even with repeated questions', () => {
  const sezioni = Object.fromEntries(Array.from({length:26}, (_, i) => ['SEZIONE_BOTTONE_'+String(i).padStart(2,'0'), {titolo:'Capitolo '+i,domande:[]} ]));
  sezioni.SEZIONE_BOTTONE_00.domande = [{img:'/img_sign/2.png'}];
  sezioni.SEZIONE_BOTTONE_01.domande = [{img:'/img_sign/1.png'}, {img:'/img_sign/1.png'}, {img:'/external/2.png'}, {img:null}];
  sezioni.SEZIONE_BOTTONE_02.domande = [{img:'/img_sign/1.png'}];
  const result = buildFigureChapters({sezioni}, [{id:'fv_1',number:1},{id:'fv_2',number:2}]);
  assert.deepEqual(result.figures, {fv_1:['1','2'],fv_2:[]});
  assert.deepEqual(figureReferences({id:'future',number:999}), [{source:'figures',chapter:'unassigned',title:'Altre figure',id:'999'}]);
});
