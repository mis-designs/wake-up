import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url));
const text = file => read(file).toString('utf8');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('the runtime card is rebuilt from the current supplied image, with cache-busted consumers', async () => {
  const manifest = JSON.parse(text('assets/video-class/card-artwork.json'));
  assert.equal(hash(read(manifest.source)), manifest.sourceHash, 'Run npm run build:video-card after replacing the PNG');
  assert.equal(hash(read(manifest.output)), manifest.outputHash);
  const source = await sharp(read(manifest.source)).metadata();
  const derivative = await sharp(read(manifest.output)).metadata();
  assert.equal(derivative.width, manifest.width);
  assert.equal(derivative.height, manifest.height);
  assert.ok(Math.abs(source.width / source.height - derivative.width / derivative.height) < .003, 'No destructive crop of supplied artwork');
  assert.ok(read(manifest.output).length < 250000, 'Keep the card light on mobile');
  for (const file of ['study-quiz.html','video-class.js','service-worker.js']) {
    assert.ok(text(file).includes(`teacher.webp?v=${manifest.sourceHash.slice(0,12)}`), file);
    assert.doesNotMatch(text(file), /teacher\.webp['"]/);
  }
  for (const file of ['study-quiz.html','study-quiz.js','service-worker.js']) {
    const imports = [...text(file).matchAll(/(?:study-quiz|video-class)\.js\?v=[\w-]+(?:&art=[a-f0-9]+)?/g)];
    assert.ok(imports.length > 0, file);
    for (const [url] of imports) assert.ok(url.endsWith(`&art=${manifest.sourceHash.slice(0,12)}`), 'The module import chain must refresh with the image');
  }
});

test('Video Class loading reuses the complete shared bounded and rounded panel variant', () => {
  const code = text('video-class.js');
  assert.match(code, /vc-loading magic-loading-indicator magic-loading-indicator--panel/);
  assert.match(code, /'aria-busy': 'true'/);
  assert.match(text('loading-ui.css'), /--magic-loading-panel-size: clamp\(64px, 14vw, 88px\)/);
  assert.match(text('loading-ui.css'), /border-radius: clamp\(14px, calc\(var\(--magic-loading-size\) \* .18\), 26px\)/);
  assert.doesNotMatch(text('video-class.css'), /\.vc-loading[^}]*animation\s*:/);
});

test('the study entry and chapter list omit redundant copy and keep heading IDs unique', () => {
  assert.doesNotMatch(text('study-quiz.html'), /IL TUO PERCORSO/);
  const code = text('video-class.js');
  assert.doesNotMatch(code, /LA TUA AULA, QUANDO VUOI|Capitoli nell’ordine del documento studenti\.|Scegli cosa studiare/);
  assert.match(code, /heading\('Capitoli', '', 'vc-chapters-heading'\)/);
  assert.match(text('video-class.css'), /\.study-page:is\(\.study-video-active,\.study-hub-active\) \.study-header/);
});

test('the Video Class hub preserves the whole landscape rather than a dark portrait split', () => {
  const css = text('video-class.css');
  assert.match(css, /\.vc-hub \.vc-hub-art \{[^}]*width: 100%;[^}]*aspect-ratio: 1200 \/ 675;[^}]*object-fit: contain;/);
  assert.doesNotMatch(css, /\.vc-hub-video::before|\.vc-hub \.vc-hub-video \{[^}]*background: var\(--forest\)/);
  assert.doesNotMatch(css, /\.vc-hub \.vc-hub-art[^}]*width: (?:32|57)%;/);
});
