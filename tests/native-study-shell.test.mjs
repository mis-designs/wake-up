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
  assert.match(css, /grid-template-rows: minmax\(210px, 1fr\) auto/u);
  assert.match(css, /\.native-chapter-workspace \{[^}]*min-height: 420px;[^}]*margin-block: auto/u);
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
  assert.match(css, /\.native-chapter-detail\s*\{[^}]*left: 6%; right: 54%/u);
  assert.match(css, /object-fit: contain; border-radius: 0/u);
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
  assert.match(read("android-study-shell.css"), /@keyframes native-rotate-up[^\n]*rotate\(24deg\)[^\n]*rotate\(40deg\)/u);
  assert.match(read("android-study-shell.css"), /native-book-tap 5s/u);
  assert.match(read("android-study-shell.css"), /native-rotate-up 3\.8s/u);
  assert.match(read("android-study-shell.css"), /filter: brightness\(0\) invert\(1\)/u);
});

test("right-hand wheel has a projected blue marker and a semantic blue launch button inside", () => {
  const html = read("index.html").split('<template id="androidStudyTemplate">')[1].split('</template>')[0];
  const css = read("android-study-shell.css");
  assert.match(html, /id="nativeDialMarker"[^>]*cx="50"[^>]*cy="150"/u);
  assert.match(html, /class="native-dial-interior"[^]*<button[^>]*id="nativeOpenChapter"/u);
  assert.match(css, /\.native-dial \{ right: 0; transform: translate\(50%, -50%\)/u);
  assert.match(css, /#nativeOpenChapter \{[^}]*left: 33\.333333%; top: 50%;[^}]*background: var\(--native-blue\); color: var\(--app-palette-on-primary\)/u);
  assert.match(read("android-study-shell.js"), /dialLabelPosition\(model.selected, value, 100\)/u);
});

test("six bilingual action rails preserve labels, font roles and fixed target geometry", () => {
  const html = read("index.html");
  for (const label of ["কুইজ পড়ুন", "কুইজ করুন", "শব্দার্থ", "কঠিন প্রশ্নগুলো", "আমার অগ্রগতি", "ভুলগুলো"]) {
    assert.ok(html.includes(`data-native-bn="${label}"`));
  }
  const js = read("android-study-shell.js");
  assert.match(js, /viewport\.setAttribute\("aria-hidden", "true"\)/u);
  assert.match(js, /accessible\.append\(textSpan\(original, language\)/u);
  assert.match(js, /textSpan\(button\.dataset\.nativeBn, "bn"\)/u);
  const css = read("android-study-shell.css");
  assert.match(css, /\.native-label-window \{[^}]*height: 40px; overflow: clip/u);
  assert.match(css, /\.native-label-rail > \[lang="bn"\][^}]*var\(--font-bn-support\)/u);
  assert.match(css, /native-label-go-up 9\.2s/u);
  assert.match(css, /@keyframes native-label-go-up \{ 0%, 30%[^\n]*36%, 72%[^\n]*78%, 100%/u);
  assert.match(css, /\[data-native-motion-paused\] :is\(\.native-label-rail, \.native-roundabout\) \{ animation: none/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[^]*\.native-label-rail > span:last-child \{ display: none/u);
});

test("roundabout alternates direction and includes a slower double turn with quiet pauses", () => {
  const css = read("android-study-shell.css");
  assert.match(css, /native-roundabout-turn 40s/u);
  assert.match(css, /@keyframes native-roundabout-turn[^\n]*rotate\(360deg\)[^\n]*rotate\(0\)[^\n]*rotate\(-720deg\)/u);
  assert.match(css, /\[data-native-background\] :is\(\.native-label-rail, \.native-roundabout\)/u);
  assert.match(css, /button:focus-visible \.native-label-rail \{ animation-play-state: paused/u);
});

test("six supplied action icons stay outside the animated label rail and ship offline", () => {
  const template = read("index.html").split('<template id="androidStudyTemplate">')[1].split('</template>')[0];
  const worker = read("service-worker.js");
  for (const [action, name] of [["study","study_quiz.svg"],["quiz","do_quiz.svg"],["dictionary","dictionary.svg"],["exam","exam.svg"],["statistics","Statistics.png"],["errors","errors.png"]]) {
    const button = template.split(`data-native-action="${action}"`)[1].split('</button>')[0];
    assert.ok(button.includes(`src="/icons/${name}"`));
    assert.match(button, /alt="" aria-hidden="true" draggable="false"/u);
    assert.ok(worker.includes(`/icons/${name}`));
    const bytes = readFileSync(new URL(`../icons/${name}`, import.meta.url));
    if (name.endsWith('.svg')) {
      assert.match(bytes.toString(), /viewBox="0 0 24 24"/u);
      assert.doesNotMatch(bytes.toString(), /<script|<foreignObject|https?:\/\/(?!www\.w3\.org)/u);
    } else assert.equal(bytes.subarray(1,4).toString(), 'PNG');
  }
  const js = read("android-study-shell.js");
  assert.match(js, /button\.querySelector\("\.native-action-icon"\)/u);
  assert.match(js, /emblem\.setAttribute\("aria-hidden", "true"\)/u);
  assert.match(js, /if \(icon\) emblem\.append\(icon\)/u);
  assert.match(js, /button\.replaceChildren\(accessible, \.\.\.\(icon \? \[emblem\] : \[\]\), viewport\)/u);
  const css = read("android-study-shell.css");
  assert.match(css, /\.native-action-icon \{[^}]*width: 22px; height: 22px;[^}]*pointer-events: none/u);
  assert.match(css, /\.native-action-icon\.is-symbol \{[^}]*filter: brightness\(0\) invert\(1\)/u);
});

test("native chapter actions share one compact rhythm with labels beside their icons", () => {
  const css = read("android-study-shell.css");
  const html = read("index.html").split('<template id="androidStudyTemplate">')[1].split('</template>')[0];
  assert.match(html, /class="native-chapter-workspace"[^]*class="native-orbit-stage"[^]*class="native-actions"/u);
  assert.match(css, /\.native-actions \{[^}]*width: min\(92%, 392px\)/u);
  assert.match(css, /\.native-actions > button \{[^}]*grid-template-columns: 30px minmax\(0, 1fr\);[^}]*column-gap: 8px;[^}]*min-height: 48px/u);
  assert.doesNotMatch(css, /\.native-learning-action\s*\{[^}]*min-height/u);
  assert.match(css, /\.native-label-rail > span \{[^}]*justify-items: start;[^}]*height: 40px/u);
  assert.match(css, /\.native-road-divider \.native-roundabout \{ width: 22px; height: 22px/u);
  assert.match(css, /\.native-road-divider img:not\(\.native-roundabout\) \{ opacity: \.45/u);
});

test("chapter title fits complete words without hyphenation or changing the frame", () => {
  const css = read("android-study-shell.css").split('html.android-webview #nativeChapterTitle {')[1].split('}')[0];
  assert.match(css, /position: absolute; inset: 0/u);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/u);
  assert.match(css, /overflow-wrap: normal; word-break: normal; hyphens: none/u);
  assert.doesNotMatch(css, /(?:overflow-wrap|word-break):\s*(?:anywhere|break-all|break-word)/u);
  const js = read("android-study-shell.js");
  assert.match(js, /chapterTitle\.scrollWidth > chapterTitle\.clientWidth/u);
  assert.match(js, /getComputedStyle\(chapterTitle\)\.fontFamily/u);
  assert.match(js, /size > 16/u);
  assert.match(js, /titleSizes\.clear\(\); fitChapterTitle\(\)/u);
});

test("native instrument controls share a decorative recess and motion-safe tactile states", () => {
  const css = read("android-study-shell.css");
  assert.match(css, /\.native-action-emblem \{[^}]*width: 30px; height: 30px;[^}]*pointer-events: none/u);
  assert.match(css, /\.native-chapters \.native-actions > button:active:not\(:disabled\) \{[^}]*transform: translateY\(1px\)/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[^]*\.native-actions > button:active:not\(:disabled\) \{ transform: none/u);
  assert.match(css, /@media \(forced-colors: active\)[^]*\.native-action-emblem \{ border-color: ButtonText/u);
  assert.match(css, /\[data-app-transition\][^\n]*button \{ pointer-events: none/u);
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
  for (const asset of ["android-study-shell.css?v=11-wordfit-controls", "android-study-shell.js?v=9-wordfit-controls"]) {
    assert.ok(index.includes(asset));
    assert.ok(worker.includes(asset));
  }
  assert.ok(worker.includes("android-rotary-model.mjs?v=7-right-bilingual"));
  assert.ok(read("android-study-shell.js").includes("android-rotary-model.mjs?v=7-right-bilingual"));
});

test("ornamental title font is self-hosted, licensed and cached with a remeasure after loading", () => {
  const font = readFileSync(new URL('../assets/fonts/el-messiri/ElMessiri.ttf', import.meta.url));
  assert.equal(font.readUInt32BE(0), 0x00010000);
  assert.match(read('assets/fonts/el-messiri/OFL.txt'), /SIL OPEN FONT LICENSE/);
  assert.ok(read('service-worker.js').includes('/assets/fonts/el-messiri/ElMessiri.ttf'));
  assert.match(read('android-study-shell.js'), /fonts\.load\('500 28px "El Messiri"'\)/);
  assert.match(read('android-study-shell.js'), /reducedMotion\.addEventListener\("change"/);
});
