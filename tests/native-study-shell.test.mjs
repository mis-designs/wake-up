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
  assert.match(css, /grid-template-rows: auto minmax\(210px, 1fr\) auto/u);
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

test("transparent numbered arc uses one blue selected value beside a stable title/artwork slot", () => {
  const css = read("android-study-shell.css");
  const template = read("index.html").split('<template id="androidStudyTemplate">')[1].split('</template>')[0];
  assert.doesNotMatch(template, /data-native-step|native-dial-core|Ruota o usa le frecce/u);
  assert.match(template, /<circle class="native-dial-orbit" cx="150" cy="150" r="100"\//u);
  assert.doesNotMatch(template, /nativeSelectedNumber|native-image-fallback/u);
  assert.match(css, /\.native-dial-orbit\s*\{[^}]*fill: none;[^}]*stroke: var\(--app-palette-divider\)/u);
  assert.match(css, /\.native-dial-face text\.is-selected \{ fill: var\(--native-blue\)/u);
  assert.match(css, /\.native-dial \{[^}]*background: transparent/u);
  assert.match(css, /\.native-chapter-detail\s*\{[^}]*grid-template-rows: minmax\(0, 1fr\) 44px/u);
  assert.match(css, /--native-title-size/u);
  assert.match(css, /font-family: "El Messiri"/u);
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
  assert.match(read("android-study-shell.css"), /\.native-rotate-guide\s*\{[^}]*inset: -20px;[^}]*pointer-events: none/u);
  assert.match(read("android-study-shell.css"), /@keyframes native-rotate-up[^\n]*rotate\(-24deg\)[^\n]*rotate\(-40deg\)/u);
  assert.match(read("android-study-shell.css"), /native-book-tap 5s/u);
  assert.match(read("android-study-shell.css"), /native-rotate-up 3\.8s/u);
  assert.match(read("android-study-shell.css"), /filter: brightness\(0\) invert\(1\)/u);
});

test("title-to-artwork presentation is bounded, interruptible and selection-versioned", () => {
  const js = read("android-study-shell.js");
  assert.match(js, /1800 - \(performance\.now\(\) - started\)/u);
  assert.match(js, /await image\.decode\(\)/u);
  assert.match(js, /clearTimeout\(imageLoadTimer\)/u);
  assert.match(js, /clearTimeout\(imageRevealTimer\)/u);
  assert.match(js, /function hide\(\)[^]*cancelImagePresentation\(\)/u);
  assert.match(js, /function scheduleDraw[^]*\(now - started\) \/ 220/u);
  assert.match(js, /if \(result\.boundary\)[^]*else if \(result\.changed\) \{\s*feedback\("selection"\)/u);
});

test("all 25 mapped All Books covers exist as lightweight WebP assets", () => {
  const manifest = JSON.parse(read("assets/native-chapter-covers.json"));
  assert.equal(Object.keys(manifest.covers).length, 25);
  let totalBytes = 0;
  for (let n = 1; n <= 25; n++) {
    const chapter = String(n).padStart(2, "0");
    const path = `/assets/chapter-covers/chapter-${chapter}.webp`;
    assert.equal(manifest.covers[chapter], path);
    const bytes = readFileSync(new URL(`..${path}`, import.meta.url));
    assert.equal(bytes.subarray(8, 12).toString(), "WEBP");
    assert.ok(bytes.length < 150000);
    totalBytes += bytes.length;
  }
  assert.ok(totalBytes < 2 * 1024 * 1024);
  assert.match(read("android-study-shell.js"), /if \(version !== imageVersion\) return/u);
});

test("changed native files are versioned together in the offline shell", () => {
  const index = read("index.html");
  const worker = read("service-worker.js");
  for (const asset of ["android-study-shell.css?v=6-transparent", "android-study-shell.js?v=6-transparent"]) {
    assert.ok(index.includes(asset));
    assert.ok(worker.includes(asset));
  }
  assert.ok(worker.includes("android-rotary-model.mjs?v=6-transparent"));
  assert.ok(read("android-study-shell.js").includes("android-rotary-model.mjs?v=6-transparent"));
});

test("ornamental title font is self-hosted, licensed and cached with a remeasure after loading", () => {
  const font = readFileSync(new URL('../assets/fonts/el-messiri/ElMessiri.ttf', import.meta.url));
  assert.equal(font.readUInt32BE(0), 0x00010000);
  assert.match(read('assets/fonts/el-messiri/OFL.txt'), /SIL OPEN FONT LICENSE/);
  assert.ok(read('service-worker.js').includes('/assets/fonts/el-messiri/ElMessiri.ttf'));
  assert.match(read('android-study-shell.js'), /fonts\.load\('500 28px "El Messiri"'\)/);
  assert.match(read('android-study-shell.js'), /reducedMotion\.addEventListener\("change"/);
});
