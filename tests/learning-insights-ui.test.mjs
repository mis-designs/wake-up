import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../script.js", import.meta.url), "utf8");
const appCss = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const client = readFileSync(new URL("../src/learning-insights.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/learning-insights.css", import.meta.url), "utf8");
const daisySource = readFileSync(new URL("../src/daisyui.css", import.meta.url), "utf8");
const daisyBuild = readFileSync(new URL("../assets/daisyui.css", import.meta.url), "utf8");
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

test("statistics use the adaptive study workspace and render all 25 chapters in one matrix", () => {
  for (const copy of [
    "Come stai andando?",
    "Da ripassare",
    "Stai andando bene",
    "I tuoi 25 capitoli",
    "Servono ancora alcuni quiz"
  ]) assert.ok(client.includes(copy), `missing study-workspace copy: ${copy}`);

  for (const className of ["li-overview", "li-review-now", "li-progress-groups", "li-chapter-workspace", "li-chapter-matrix", "li-chapter-cell"]) {
    assert.match(client, new RegExp(`class="(?:[^"]*\\s)?${className}(?=\\s|")`, "u"));
    assert.match(css, new RegExp(`\\.${className}(?=[\\s:{,.#>+~\\[])`, "u"));
  }

  assert.match(client, /value\.chapters\.length !== 25/u);
  assert.match(client, /model\.chapters\.map\(chapterNode\)/u);
  assert.match(css, /\.li-chapter-matrix \{[^}]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/u);
  assert.doesNotMatch(client, /Tappa|checkpoint|Quadro di apprendimento|Percorso consolidato/u);
  assert.doesNotMatch(client, /Tutti i capitoli/u);
  assert.doesNotMatch(client, /\b788\b/u);
});

test("the redesign cannot regress to the failed editorial or horizontally scrolling prototype", () => {
  assert.doesNotMatch(css, /Bodoni Moda/u);
  assert.doesNotMatch(css, /overflow-x:\s*auto/u);
  assert.doesNotMatch(css, /min-height:\s*520px/u);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*?\.li-chapter-matrix \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/u);
  assert.match(css, /\.li-chapter-copy strong \{[\s\S]*?-webkit-line-clamp: 2;/u);
  assert.match(css, /body\.learning-insights-mode :where\([\s\S]*?#adminEntryBtn,[\s\S]*?#profileBtn,[\s\S]*?#whatsappBtn,[\s\S]*?\) \{ display: none !important; \}/u);
  assert.match(index, /id="learningInsightsScreen"[^>]*data-theme="magicbook"/u);
  assert.match(client, /li-icon-button d-btn d-btn-ghost d-btn-square d-btn-sm/u);
  assert.match(client, /li-refresh d-btn d-btn-ghost d-btn-sm/u);
  assert.match(client, /aria-label="\$\{state\.isRefreshing \? "Aggiornamento in corso" : "Aggiorna i dati"\}"/u);
  assert.match(client, /li-refresh-icon" aria-hidden="true"/u);
  assert.equal((client.match(/class="d-btn d-btn-ghost d-btn-sm" type="button" data-li-route=/gu) || []).length, 2);
  assert.match(daisySource, /d-btn-sm d-btn-ghost d-btn-square/u);
  for (const componentClass of ["d-btn-ghost", "d-btn-square", "d-btn-sm"]) {
    assert.match(daisyBuild, new RegExp(`\\.${componentClass}`));
  }
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
  assert.equal((client.match(/\{ id: "(?:figure|quiz|parole|argomenti|capitoli)"/gu) || []).length, 5);
  assert.doesNotMatch(client, /\{ id: "recuperati"/u);
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

test("figure errors use learner-facing references and optional R2 explanations", () => {
  assert.match(client, /const EXPLANATION_EXTENSIONS = Object\.freeze\(\["png", "webp", "jpg", "jpeg"\]\)/u);
  assert.match(client, /method: "HEAD"/u);
  assert.match(client, /data-li-action="open-explanation"/u);
  assert.match(client, /data-li-explanation-figure=/u);
  assert.match(client, /function figureAssetId\(item\)/u);
  assert.match(client, /function formatQuizReference\(quizId, chapter = 0\)/u);
  assert.match(client, /CAP\. \$\{chapterNumber\} · QUIZ \$\{quizNumber\}/u);
  assert.match(client, /solido: "Eccellente"/u);
  assert.match(client, /in_pratica: "Buono"/u);
  assert.match(client, /class="is-in-pratica">Buono<\/span>/u);
  assert.match(client, /simpleStatusLabel\(chapter\.status\)/u);
  assert.match(css, /\.li-media-frame \.li-figure-image \{[\s\S]*?max-height: min\(52vh, 430px\)/u);
  assert.match(css, /\.li-explanation-frame \{[\s\S]*?background: #fff;/u);
  assert.match(css, /\.li-state\.is-in-pratica \{ background: #dcfce7; color: #15803d; \}/u);
  assert.match(css, /\.li-state\.is-attenzione \{ background: #fee4e2; color: #b42318; \}/u);
});

test("responsive, reduced-motion and global scrollbar rules are present", () => {
  assert.match(css, /@media \(min-width: 1024px\)/u);
  assert.match(css, /@media \(max-width: 360px\)/u);
  assert.match(css, /prefers-reduced-motion: reduce/u);
  assert.match(css, /forced-colors: active/u);
  assert.match(css, /#learningInsightsScreen::-webkit-scrollbar/u);
  assert.match(index, /style\.css\?v=72-solid-profile-controls/u);
  assert.match(index, /assets\/daisyui\.css\?v=2-learning-shell/u);
  assert.match(index, /src\/learning-insights\.css\?v=9-card-spacing/u);
  assert.match(index, /src\/learning-insights\.js\?v=5-figure-explanation-ui/u);
  assert.match(worker, /magicbook-pwa-v161-numberless-figures/u);
  assert.match(worker, /style\.css\?v=72-solid-profile-controls/u);
  assert.match(worker, /assets\/daisyui\.css\?v=2-learning-shell/u);
  assert.match(worker, /src\/learning-insights\.css\?v=9-card-spacing/u);
  assert.match(worker, /src\/learning-insights\.js\?v=5-figure-explanation-ui/u);
  assert.match(worker, /\/icons\/next\.png/u);
  assert.match(worker, /\/icons\/go-back\.png/u);
  assert.match(worker, /\/assets\/admin\/update\.png/u);
});

test("learning workspace keeps a flat, aligned surface rhythm", () => {
  assert.match(css, /Quiet study canvas/u);
  assert.match(css, /--li-shadow:\s*none;/u);
  assert.match(css, /#learningInsightsScreen \.li-main \{\s*width: min\(1240px, calc\(100% - 48px\)\);/u);
  assert.match(css, /\.li-explorer-body \{[\s\S]*?border-top: 1px solid var\(--li-line\);[\s\S]*?border-radius: 0;/u);
  assert.match(css, /\.li-error-row > button \{[\s\S]*?border-bottom: 1px solid var\(--li-line\) !important;/u);
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*?\.li-chapter-cell \{ min-height: 78px;/u);
  assert.match(css, /\.li-progress-groups ul \{ margin-top: 22px; \}/u);
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*?\.li-route-nav \{[\s\S]*?left: 50%;[\s\S]*?transform: translateX\(-50%\);/u);
  assert.match(css, /\.li-route-nav \.d-btn:not\(\[aria-current="page"\]\) \{[\s\S]*?border: 1px dashed/u);
  assert.match(css, /\.li-lenses \.d-btn:not\(\[aria-selected="true"\]\) \{[\s\S]*?border: 1px dashed/u);
  assert.match(css, /\.li-emerging-card > \.li-state \{[\s\S]*?grid-column: 4;[\s\S]*?grid-row: 1;/u);
  assert.match(css, /grid-template-areas:[\s\S]*?"media copy disclosure"[\s\S]*?"media state disclosure"/u);
});
