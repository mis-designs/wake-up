import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const page = readFileSync(new URL("../quiz.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
const helpSource = readFileSync(new URL("../quiz-help.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../mystyle.css", import.meta.url), "utf8");
const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

function functionSource(source, name) {
  const declaration = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, "u");
  const match = declaration.exec(source);
  assert.ok(match, `${name} must be declared as a named function`);
  const start = match.index;
  const tail = source.slice(start + match[0].length);
  const next = /\n(?:  )?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/u.exec(tail);
  return source.slice(start, next ? start + match[0].length + next.index : source.length);
}

function assetVersion(source, asset) {
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:^|["'/])${escaped}\\?v=([^"'\\s]+)`, "u").exec(source)?.[1] || "";
}

test("quiz help exposes one shared question-help loader", () => {
  assert.match(
    helpSource,
    /window\.QuizHelpData\s*=\s*(?:Object\.freeze\(\s*)?\{[\s\S]*?\bgetQuestionHelp\b/u
  );

  const sharedHelp = functionSource(helpSource, "getQuestionHelp");
  assert.match(sharedHelp, /questionHelpCache\.get\(key\)/u);
  assert.match(sharedHelp, /resolveQuestionHelp\(question, options\)/u);

  const resolver = functionSource(helpSource, "resolveQuestionHelp");
  assert.match(resolver, /loadLibrary\(\)/u);
  assert.match(resolver, /decodeHelp\(question, data\)/u);
  assert.match(resolver, /question\.question_bd\s*\|\|\s*question\.questionBD/u);
  assert.match(resolver, /fetchBengaliAudio\(question,[\s\S]*?\{\s*requireAudio:\s*false\s*\}\)/u);

  const synchronizedIndex = resolver.indexOf("decodeHelp");
  const catalogIndex = resolver.indexOf("question.question_bd");
  const automaticIndex = resolver.indexOf("fetchBengaliAudio");
  assert.ok(synchronizedIndex >= 0 && synchronizedIndex < catalogIndex, "V3 must win over the catalog field");
  assert.ok(catalogIndex < automaticIndex, "the protected automatic translation must remain the last fallback");
  assert.match(resolver, /if\s*\(\s*!verifiedTranslation[^)]*\)[\s\S]*?fetchBengaliAudio/u);
});

test("answer-review items retain the complete source question", () => {
  const serverReview = functionSource(script, "getServerReviewItems");
  const localReview = functionSource(script, "buildAnswerReview");

  assert.match(
    serverReview,
    /helpQuestion:\s*\{[\s\S]*?id:\s*q\?\.id[\s\S]*?question:\s*q\?\.question[\s\S]*?figure:\s*q\?\.figure[\s\S]*?question_bd:\s*q\?\.question_bd/u
  );
  assert.match(
    localReview,
    /helpQuestion:\s*\{[\s\S]*?id:\s*question\.id[\s\S]*?question:\s*question\.question[\s\S]*?figure:\s*question\.figure[\s\S]*?question_bd:\s*question\.question_bd/u
  );
  assert.match(script, /getQuestionHelp\(item\.helpQuestion\s*\|\|\s*item\)/u);
});

test("every review card receives a semantic Bengali disclosure button", () => {
  const disclosure = functionSource(script, "createReviewTranslationDisclosure");
  const icon = functionSource(script, "createReviewTranslationIcon");

  assert.match(
    disclosure,
    /document\.createElement\("button"\)[\s\S]*?className\s*=\s*"modal-review-translation-button"/u
  );
  assert.match(disclosure, /button\.type\s*=\s*"button"/u);
  assert.match(disclosure, /button\.setAttribute\("aria-expanded",\s*"false"\)/u);
  assert.match(disclosure, /button\.setAttribute\("aria-controls",\s*panelId\)/u);
  assert.match(disclosure, /button\.setAttribute\([\s\S]*?"aria-label"/u);
  assert.match(disclosure, /label\.textContent\s*=\s*"বাংলা"/u);
  assert.match(disclosure, /modal-review-translation-icon/u);
  assert.match(icon, /createElementNS\(namespace,\s*"svg"\)/u);
  assert.match(icon, /setAttribute\("viewBox",\s*"0 0 24 24"\)/u);
  assert.match(icon, /setAttribute\("d",\s*REVIEW_TRANSLATION_ICON_PATH\)/u);
  assert.match(script, /REVIEW_TRANSLATION_ICON_PATH\s*=\s*"M5\.80688\s+18\.5304/u);
});

test("the inline panel renders the full translation, two context tags, and bilingual word chips", () => {
  assert.match(script, /className\s*=\s*"modal-review-translation-panel(?:\s+hidden)?"/u);
  assert.match(script, /className\s*=\s*"modal-review-translation-text"/u);
  assert.match(script, /(?:translationText|translation)\.lang\s*=\s*"bn"/u);
  assert.match(script, /help\?*\.translation|questionBnStandard/u);

  assert.match(script, /className\s*=\s*"modal-review-translation-context"/u);
  assert.match(script, /help\?*\.chapter\?*\.italian/u);
  assert.match(script, /help\?*\.topic\?*\.italian/u);
  assert.match(script, /className\s*=\s*"modal-review-translation-tag"/u);

  assert.match(script, /className\s*=\s*"modal-review-translation-words"/u);
  assert.match(script, /className\s*=\s*"modal-review-translation-word"/u);
  assert.match(script, /(?:help\?*\.words|help\.words)[\s\S]*?(?:forEach|for\s*\()/u);
  assert.match(script, /word\.italian/u);
  assert.match(script, /word\.bangla/u);
  assert.match(script, /\.lang\s*=\s*"bn"/u);
});

test("review translations use one exclusive accordion on every viewport", () => {
  const toggle = functionSource(script, "toggleReviewTranslation");
  const closeOthers = functionSource(script, "closeOtherReviewTranslations");
  assert.match(toggle, /closeOtherReviewTranslations\(button\);[\s\S]*?setReviewTranslationExpanded\(button, panel, true\)/u);
  assert.equal((toggle.match(/closeOtherReviewTranslations\(button\)/gu) || []).length, 1);
  assert.match(closeOthers, /querySelectorAll\(['"]\.modal-review-translation-button\[aria-expanded="true"\]['"]\)/u);
  assert.match(closeOthers, /if\s*\(button\s*!==\s*currentButton\)\s*closeReviewTranslation\(button\)/u);
  assert.doesNotMatch(script, /reviewCompactDisclosureMedia|enforceCompactReviewTranslations/u);
});

test("opening the next review translation closes the previously open row", async () => {
  function classList(initial = []) {
    const values = new Set(initial);
    return {
      contains: value => values.has(value),
      toggle(value, force) {
        if (force === true) values.add(value);
        else if (force === false) values.delete(value);
        else if (values.has(value)) values.delete(value);
        else values.add(value);
      }
    };
  }

  const panels = new Map();
  const makeDisclosure = (index, expanded) => {
    const panelId = `panel-${index}`;
    const item = { classList: classList(expanded ? ["is-translation-open"] : []) };
    const attributes = new Map([
      ["aria-controls", panelId],
      ["aria-expanded", String(expanded)],
      ["aria-label", expanded ? `Chiudi ${index}` : `Apri ${index}`]
    ]);
    const button = {
      dataset: { expandLabel: `Apri ${index}`, collapseLabel: `Chiudi ${index}` },
      getAttribute: name => attributes.get(name) ?? null,
      setAttribute: (name, value) => attributes.set(name, String(value)),
      closest: () => item
    };
    const panel = {
      classList: classList(expanded ? [] : ["hidden"]),
      dataset: { helpState: "ready" }
    };
    panels.set(panelId, panel);
    return { button, panel, item };
  };

  const first = makeDisclosure(1, true);
  const second = makeDisclosure(2, false);
  const buttons = [first.button, second.button];
  const context = {
    document: { getElementById: id => panels.get(id) || null },
    modalReviewList: {
      querySelectorAll: () => buttons.filter(button => button.getAttribute("aria-expanded") === "true")
    }
  };
  context.globalThis = context;
  vm.runInNewContext([
    functionSource(script, "closeReviewTranslation"),
    functionSource(script, "closeOtherReviewTranslations"),
    functionSource(script, "setReviewTranslationExpanded"),
    functionSource(script, "toggleReviewTranslation")
  ].join("\n"), context);

  await context.toggleReviewTranslation(second.button, second.panel, {});

  assert.equal(first.button.getAttribute("aria-expanded"), "false");
  assert.equal(first.button.getAttribute("aria-label"), "Apri 1");
  assert.equal(first.panel.classList.contains("hidden"), true);
  assert.equal(first.item.classList.contains("is-translation-open"), false);
  assert.equal(second.button.getAttribute("aria-expanded"), "true");
  assert.equal(second.button.getAttribute("aria-label"), "Chiudi 2");
  assert.equal(second.panel.classList.contains("hidden"), false);
  assert.equal(second.item.classList.contains("is-translation-open"), true);
});

test("desktop review layout keeps the question and translation panel side by side", () => {
  assert.match(
    styles,
    /@media\s*\(min-width:\s*(?:768|960|1024)px\)[\s\S]*?\.modal-review-item\.is-translation-open\s*\{[^}]*grid-template-columns\s*:/u
  );
  assert.match(
    styles,
    /@media\s*\(min-width:\s*(?:768|960|1024)px\)[\s\S]*?\.modal-review-item\.is-translation-open\s*>\s*\.modal-review-translation-panel\s*\{[^}]*grid-column\s*:\s*2/u
  );
});

test("translation controls meet touch, focus, Bengali typography, and reduced-motion requirements", () => {
  assert.match(
    styles,
    /\.modal-review-translation-button\s*\{[^}]*(?:min-height|height)\s*:\s*(?:4[4-9]|[5-9]\d)px/u
  );
  assert.match(
    styles,
    /\.modal-review-translation-button:focus-visible\s*\{[^}]*(?:outline|box-shadow)\s*:/u
  );
  assert.match(
    styles,
    /\.modal-card\.modal-result\s+\.modal-review-translation-text\s*\{[^}]*font-family\s*:\s*(?:var\(--font-bengali\)|[^;]*"Noto Sans Bengali")/u
  );
  assert.match(
    styles,
    /\.modal-review-translation-word span\s*\{[^}]*font-family\s*:\s*(?:var\(--font-bengali\)|[^;]*"Noto Sans Bengali")/u
  );
  assert.match(
    styles,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?modal-review-translation[\s\S]*?(?:animation\s*:\s*none|transition(?:-duration)?\s*:\s*(?:none|0|\.01ms))/u
  );
});

test("review translation asset versions match between the page and service worker", () => {
  const expected = new Map([
    ["mystyle.css", "48-shared-gif-loader"],
    ["quiz.js", "73-shared-gif-loader"],
    ["quiz-help.js", "20260831-shared-gif-loader"]
  ]);

  for (const [asset, version] of expected) {
    assert.equal(assetVersion(page, asset), version, `${asset} must have the new page cache key`);
    assert.equal(assetVersion(worker, asset), version, `${asset} must have the same service-worker cache key`);
  }
});
