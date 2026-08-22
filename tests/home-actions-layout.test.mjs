import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

test("desktop home actions sit beside the promotion without changing mobile layout", () => {
  assert.match(page, /home-promo-shell[\s\S]*?home-actions/u);
  assert.match(
    styles,
    /@media \(min-width: 821px\)\s*\{[\s\S]*?body\.app-mode #home:not\(\.hidden\)[\s\S]*?flex-direction:\s*row;/u
  );
  assert.match(styles, /body\.app-mode #home > \.home-promo-shell,\s*body\.app-mode #home > \.home-actions/u);
  assert.match(styles, /body\.app-mode #home \.home-promo-shell\s*\{\s*width:\s*min\(100%, 52dvh, 410px\);/u);
  assert.match(styles, /body\.app-mode #home > \.home-actions\s*\{\s*width:\s*min\(520px, 49vw\);/u);
});

test("learning entries keep both route illustrations inside compact cards", () => {
  assert.equal((page.match(/class="home-learning-icon"/gu) || []).length, 2);
  assert.equal((page.match(/class="home-learning-arrow" aria-hidden="true"><\/span>/gu) || []).length, 2);
  assert.match(styles, /#home \.home-learning-entries\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/u);
  assert.match(styles, /#home \.home-learning-entry\s*\{[^}]*min-height:\s*78px;[^}]*grid-template-columns:\s*52px minmax\(0, 1fr\) 20px;[^}]*overflow:\s*hidden;/u);
  assert.match(styles, /#home \.home-learning-entry > \.home-learning-icon\s*\{[^}]*width:\s*52px;[^}]*height:\s*52px;[^}]*object-fit:\s*contain;/u);
  assert.match(styles, /#home \.home-learning-arrow\s*\{[^}]*width:\s*20px;[^}]*height:\s*20px;[^}]*url\("icons\/next\.png"\)/u);
  assert.doesNotMatch(page, /<img class="home-learning-arrow"/u);
});

test("the dictionary entry keeps its badge and bilingual copy separated", () => {
  assert.match(styles, /#home \.home-dictionary-entry\s*\{[^}]*width:\s*290px;[^}]*min-height:\s*64px;[^}]*grid-template-columns:\s*40px minmax\(0, 1fr\);/u);
  assert.match(styles, /#home \.home-dictionary-copy strong,\s*#home \.home-dictionary-copy small\s*\{[^}]*display:\s*block;/u);
  assert.match(styles, /#home \.home-dictionary-new-badge\s*\{[^}]*width:\s*38px;[^}]*height:\s*38px;/u);
});

test("the desktop home layout ships in a fresh PWA build", () => {
  assert.match(page, /style\.css\?v=62-home-learning-layout/u);
  assert.match(worker, /magicbook-pwa-v118-study-workspace/u);
  assert.match(worker, /style\.css\?v=62-home-learning-layout/u);
});
