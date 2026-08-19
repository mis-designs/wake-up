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

test("the desktop home layout ships in a fresh PWA build", () => {
  assert.match(page, /style\.css\?v=57-promo-admin-users/u);
  assert.match(worker, /magicbook-pwa-v107-promo-admin-users/u);
  assert.match(worker, /style\.css\?v=57-promo-admin-users/u);
});
