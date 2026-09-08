import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("installed Home omits instructional/pause copy; motion control belongs to Profile", () => {
  const html = read("index.html");
  const home = html.split('<section class="native-home"')[1].split('</section>')[0];
  assert.doesNotMatch(home, /Tocca il libro|Pausa animazioni|native-motion-toggle/u);
  assert.match(home, /aria-label="Apri Magic Book e scegli il capitolo"/u);
  assert.match(read("android-study-shell.js"), /getElementById\("profilePanel"\)\?\.append\(motionToggle\)/u);
});

test("installed content bounds reserve the actual floating dock, not just padding behind it", () => {
  const css = read("android-study-shell.css");
  assert.match(css, /height: calc\(100dvh - var\(--native-dock-reserve\)\)/u);
  assert.match(css, /grid-template-rows: auto minmax\(144px, 1fr\) auto auto/u);
  assert.match(css, /prefers-reduced-motion: reduce/u);
  const js = read("android-study-shell.js");
  assert.match(js, /new ResizeObserver\(syncDockSpace\)\.observe\(dock\)/u);
  assert.match(js, /innerHeight - dock\.getBoundingClientRect\(\)\.top \+ 12/u);
});

test("rotary route keeps the native gate and canonical selected-chapter action", () => {
  const js = read("android-study-shell.js");
  assert.match(js, /html\.classList\.contains\("android-webview"\) && template/u);
  assert.match(js, /open: \(\) => openChapter\(selectedChapter\)/u);
  assert.match(js, /event\.persisted && \["home", "chapters"\]\.includes\(app\.screen\(\)\)/u);
  assert.match(js, /if \(!canInteract\(\) \|\| model\.gesture \|\| performance\.now\(\) < suppressActionsUntil\) return/u);
  assert.doesNotMatch(js, /(?:window\.)?(?:alert|confirm|prompt)\s*\(/u);
});

test("chapter title adapts inside fixed geometry; black wheel separates outer numbers from its inner readout", () => {
  const css = read("android-study-shell.css");
  const template = read("index.html").split('<template id="androidStudyTemplate">')[1].split('</template>')[0];
  assert.doesNotMatch(template, /data-native-step|native-dial-core|Ruota o usa le frecce/u);
  assert.match(template, /<circle class="native-dial-orbit" cx="150" cy="150" r="100"\//u);
  assert.match(template, /id="nativeChapterDial"[^]*id="nativeSelectedNumber"[^]*<\/div>\s*<button id="nativeOpenChapter"/u);
  assert.match(css, /\.native-dial-orbit\s*\{[^}]*fill: none;[^}]*stroke: var\(--native-line\)/u);
  assert.match(css, /\.native-selected-number\s*\{[^}]*color: var\(--native-canvas\); pointer-events: none/u);
  assert.match(css, /#nativeOpenChapter\s*\{[^}]*top: 50%; transform: translate\(-50%, -50%\)/u);
  assert.doesNotMatch(read("android-study-shell.js"), /label\.style\.opacity|label\.style\.display = i \+ 1 === model\.selected/u);
  assert.match(css, /\.native-chapter-caption\s*\{[^}]*height: 60px;/u);
  assert.match(css, /--native-title-size/u);
  assert.match(css, /--native-wheel: #000000/u);
  assert.match(css, /@media \(max-height: 620px\)\s*\{\s*html\.android-webview \.native-selected-number \{ font-size: 28px; \}/u);
  assert.match(read("android-study-shell.js"), /chapterTitle\.scrollHeight > chapterTitle\.clientHeight/u);
});

test("provided gesture assets ship offline and never own pointer input", () => {
  const template = read("index.html");
  const worker = read("service-worker.js");
  for (const asset of ["clich_here.svg", "Arrow%20bent%20upword%20icon.svg", "Arrow%20bent%20downward%20icon.svg"]) {
    assert.ok(template.includes(asset));
    assert.ok(worker.includes(asset));
    assert.ok(read(`icons/${decodeURIComponent(asset)}`).includes('<svg'));
  }
  assert.match(read("android-study-shell.css"), /\.native-rotate-cue\s*\{[^}]*pointer-events: none/u);
  assert.match(read("android-study-shell.css"), /\.native-tap-cue\s*\{[^}]*pointer-events: none/u);
});

test("changed native files are versioned together in the offline shell", () => {
  const index = read("index.html");
  const worker = read("service-worker.js");
  for (const asset of ["android-study-shell.css?v=4-readout", "android-study-shell.js?v=4-readout"]) {
    assert.ok(index.includes(asset));
    assert.ok(worker.includes(asset));
  }
  assert.ok(worker.includes("android-rotary-model.mjs?v=4-readout"));
  assert.ok(read("android-study-shell.js").includes("android-rotary-model.mjs?v=4-readout"));
});
