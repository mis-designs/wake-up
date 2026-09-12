import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = name => readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
const source = read('android-mode-screens.js');
const css = read('android-mode-screens.css');

test('only native Quiz reparents its existing launch controls into the thumb footer', () => {
  assert.match(source,/if \(kind === "quiz"\) \{[^]*?footer\.append\(tabs\)/);
  assert.match(source,/config\.startButtons = config\.cards\.map[^]*?querySelector\("\.qms-start"\)[^]*?footer\.append\(start\)/);
  assert.match(source,/if \(config\.startButtons\) config\.startButtons\[i\]\.hidden = !selected/);
  assert.match(source,/else \{\s*element\.querySelector\("\.qms-header"\)\.after\(tabs\)/);
  assert.doesNotMatch(source,/start\.cloneNode|start\.addEventListener/);
  assert.match(css,/#quizModeOverlay :is\(\.qms-start, \.native-mode-permission\)\[hidden\] \{ display: none/);
});

test('original Mix launch keeps a stable ID and guest-attempt decoration after moving', () => {
  assert.match(read('index.html'),/id="qmsMixStartBtn" onclick="startMixQuiz\(\)"/);
  assert.match(read('script.js'),/const mixButton = document\.getElementById\("qmsMixStartBtn"\)/);
  assert.doesNotMatch(read('script.js'),/querySelector\("#qmsCardMix \.qms-start"\)/);
  assert.match(source,/start\.setAttribute\("aria-describedby", `native-copy-\$\{id\}`\)/);
});

test('mode explanations have both languages, natural grid sizing and static motion alternatives', () => {
  for (const text of ['Da tutto il catalogo di 786 quiz.','Domande da un capitolo specifico.','Domande da almeno 2 capitoli insieme.','৭৮৬টি প্রশ্নের পুরো সংগ্রহ থেকে।','একটি নির্দিষ্ট অধ্যায় থেকে প্রশ্ন।','অন্তত ২টি অধ্যায় থেকে একসঙ্গে প্রশ্ন।']) assert.ok(source.includes(text));
  assert.match(source,/viewport\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(source,/row\.lang = language/);
  assert.match(source,/accessible\.append\(row\.cloneNode\(true\)\)/);
  assert.match(css,/grid-area: 1 \/ 1/);
  assert.match(css,/native-mode-copy-it 9\.2s/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)[^]*?native-mode-copy-window \{ display: none/);
  assert.match(css,/data-native-motion-paused[^]*?native-mode-copy-accessible/);
  assert.match(source,/note\.hidden = !guest/);
});

test('the centered count stays thirty and only decorative digits move', () => {
  assert.match(source,/\[\["qmsCardMix", "30", "domande casuali"\]/);
  assert.match(source,/digits\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(source,/for \(const digit of number\)/);
  assert.match(css,/font: inherit; animation: native-mode-digit-drift 5\.6s/);
  assert.match(css,/45% \{ transform: translateY\(-3px\)/);
  assert.match(css,/data-native-background[^]*?animation-play-state: paused/);
  assert.doesNotMatch(source,/Math\.random|setInterval/);
});
