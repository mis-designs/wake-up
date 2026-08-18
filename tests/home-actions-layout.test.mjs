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
});

test("the desktop home layout ships in a fresh PWA build", () => {
  assert.match(page, /style\.css\?v=53-home-actions-beside-promo/u);
  assert.match(worker, /magicbook-pwa-v101-home-actions-beside-promo/u);
  assert.match(worker, /style\.css\?v=53-home-actions-beside-promo/u);
});
