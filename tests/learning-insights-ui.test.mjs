import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../script.js", import.meta.url), "utf8");
const appCss = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const client = readFileSync(new URL("../src/learning-insights.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/learning-insights.css", import.meta.url), "utf8");
const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
const redirects = readFileSync(new URL("../_redirects", import.meta.url), "utf8");
const homeLearningStart = index.indexOf('<div class="home-learning-entries"');
const homeLearningEnd = index.indexOf("<!-- LEARNING INSIGHTS", homeLearningStart);
const homeLearningMarkup = index.slice(homeLearningStart, homeLearningEnd);

test("home, history routing and deployment expose both learning screens", () => {
  assert.ok(homeLearningStart >= 0 && homeLearningEnd > homeLearningStart);
  assert.ok(existsSync(new URL("../icons/next.png", import.meta.url)));
  assert.match(index, /showLearningStatistics\(\)/u);
  assert.match(index, /showLearningErrors\(\)/u);
  assert.match(index, /icons\/statistiche-patente\.png/u);
  assert.match(index, /icons\/errori-patente\.png/u);
  assert.equal((homeLearningMarkup.match(/<span class="home-learning-arrow" aria-hidden="true"><\/span>/gu) || []).length, 2);
  assert.doesNotMatch(homeLearningMarkup, /(?:→|&rarr;|&#8594;|&#x0*2192;)/iu);
  assert.match(appCss, /#home \.home-learning-entry > \.home-learning-icon\s*\{[^}]*width:\s*52px;[^}]*height:\s*52px;[^}]*object-fit:\s*contain;/u);
  assert.match(appCss, /#home \.home-learning-arrow\s*\{[^}]*background:\s*url\("icons\/next\.png"\) center \/ contain no-repeat;/u);
  assert.match(client, /<img src="icons\/next\.png" alt="">/u);
  assert.doesNotMatch(client, /[→›]/u);
  assert.match(script, /path === "\/statistiche"/u);
  assert.match(script, /path === "\/errori"/u);
  assert.match(redirects, /\/statistiche \/index\.html 200/u);
  assert.match(redirects, /\/errori \/index\.html 200/u);
});

test("statistics use the roadbook narrative and split all 25 chapters into five stages", () => {
  for (const copy of [
    "Il punto, adesso.",
    "Prossima mossa",
    "Cosa sappiamo adesso",
    "Mappa dei 25 capitoli",
    "Il percorso, tappa per tappa."
  ]) assert.ok(client.includes(copy), `missing roadbook copy: ${copy}`);

  for (const className of ["li-snapshot", "li-next-move", "li-signal-board", "li-stage-list", "li-stage", "li-checkpoint"]) {
    assert.match(client, new RegExp(`class="(?:[^"]*\\s)?${className}(?=\\s|")`, "u"));
    assert.match(css, new RegExp(`\\.${className}(?=[\\s:{,.#>+~\\[])`, "u"));
  }

  assert.match(client, /value\.chapters\.length !== 25/u);
  assert.match(client, /Array\.from\(\{ length: 5 \}, \(_, index\) => model\.chapters\.slice\(index \* 5, index \* 5 \+ 5\)\)/u);
  assert.match(client, /Tappa \$\{groupIndex \+ 1\}/u);
  assert.doesNotMatch(client, /\b788\b/u);
});

test("the redesign cannot regress to the failed editorial or horizontally scrolling prototype", () => {
  assert.doesNotMatch(css, /Bodoni Moda/u);
  assert.doesNotMatch(css, /overflow-x:\s*auto/u);
  assert.doesNotMatch(css, /min-height:\s*520px/u);
  assert.match(css, /@media \(max-width: 599px\)[\s\S]*?\.li-stage ol \{ grid-template-columns: 1fr;/u);
  assert.match(css, /\.li-chapter-copy strong \{[\s\S]*?-webkit-line-clamp: 2;/u);
  assert.match(css, /body\.learning-insights-mode \.app-header \{ display: none !important; \}/u);
});

test("the UI includes stable loading, empty, offline, error and insufficient states", () => {
  assert.match(client, /renderSkeleton/u);
  assert.match(client, /li-empty-list/u);
  assert.match(client, /Modalità offline/u);
  assert.match(client, /Interruzione temporanea/u);
  assert.match(client, /state === "insufficient"/u);
  assert.match(client, /getInsightsCache/u);
  assert.match(client, /setInsightsCache/u);
  assert.match(client, /const controller = new AbortController\(\)/u);
  assert.match(client, /signal: controller\.signal/u);
  assert.match(client, /let timedOut = false/u);
  assert.match(client, /timedOut = true; controller\.abort\(\)/u);
  assert.match(client, /error\?\.name === "AbortError" && !timedOut/u);
  assert.match(client, /timedOut \? "timeout"/u);
  assert.match(client, /kind === "timeout"/u);
  assert.doesNotMatch(client, /requestId !== state\.requestId \|\| error\?\.name === "AbortError"/u);
});

test("error lenses and detail disclosure have accessible semantics", () => {
  assert.match(client, /role="tablist"/u);
  assert.match(client, /id="li-tab-\$\{item\.id\}" aria-controls="li-panel-\$\{item\.id\}"/u);
  assert.match(client, /id="li-panel-\$\{state\.lens\}" class="li-list-pane" role="tabpanel" aria-labelledby="li-tab-\$\{state\.lens\}"/u);
  assert.match(client, /aria-selected=/u);
  assert.match(client, /aria-expanded=/u);
  assert.match(client, /aria-controls="\$\{escapeHtml\(detailId\)\}"/u);
  assert.match(client, /aria-controls="liChapterDetail"/u);
  assert.match(client, /ArrowLeft/u);
  assert.match(client, /ArrowRight/u);
  assert.match(index, /role="status" aria-live="polite"/u);
  assert.match(client, /function focusSelectorFor\(element\)/u);
  assert.match(client, /content\.contains\(root\.document\?\.activeElement\)/u);
  assert.match(client, /else if \(restoreFocus\) focusControl\(restoreFocus\)/u);
  assert.match(client, /aria-busy="\$\{state\.isRefreshing\}"/u);
  assert.match(client, /dataset\.liAction === "refresh" && !state\.isRefreshing/u);
});

test("figure media load lazily and expose a visible fallback on failure", () => {
  const figureImages = client.match(/<img class="li-figure-image"[^>]*>/gu) || [];
  assert.ok(figureImages.length >= 3);
  for (const image of figureImages) {
    assert.match(image, /loading="lazy"/u);
    assert.match(image, /decoding="async"/u);
  }
  assert.match(client, /querySelectorAll\("\.li-figure-image"\)/u);
  assert.match(client, /closest\("\.li-media-frame, \.li-row-media, \.li-emerging-media"\)/u);
  assert.match(client, /frame\?\.classList\.add\("is-unavailable"\)/u);
  assert.match(client, /image\.alt = "Figura temporaneamente non disponibile"/u);
  assert.match(css, /\.li-media-fallback\b/u);
  assert.match(css, /\.is-unavailable[^\{]*\.li-media-fallback/u);
  assert.match(css, /\.is-unavailable[^\{]*(?:img|\.li-figure-image)/u);
});

test("responsive, reduced-motion and global scrollbar rules are present", () => {
  assert.match(css, /@media \(min-width: 1024px\)/u);
  assert.match(css, /@media \(max-width: 360px\)/u);
  assert.match(css, /prefers-reduced-motion: reduce/u);
  assert.match(css, /forced-colors: active/u);
  assert.match(css, /#learningInsightsScreen::-webkit-scrollbar/u);
  assert.match(index, /style\.css\?v=62-home-learning-layout/u);
  assert.match(index, /src\/learning-insights\.css\?v=2-roadbook/u);
  assert.match(index, /src\/learning-insights\.js\?v=2-roadbook/u);
  assert.match(worker, /magicbook-pwa-v116-home-learning-layout/u);
  assert.match(worker, /style\.css\?v=62-home-learning-layout/u);
  assert.match(worker, /src\/learning-insights\.css\?v=2-roadbook/u);
  assert.match(worker, /src\/learning-insights\.js\?v=2-roadbook/u);
  assert.match(worker, /\/icons\/next\.png/u);
  assert.match(worker, /\/icons\/go-back\.png/u);
  assert.match(worker, /\/assets\/admin\/update\.png/u);
});
