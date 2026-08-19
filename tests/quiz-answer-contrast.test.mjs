import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../mystyle.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../quiz.html", import.meta.url), "utf8");
const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

test("selected answer labels use dark text on the bright accent background", () => {
  assert.match(
    styles,
    /#vero\.selected \.answer-label,\s*#falso\.selected \.answer-label\s*\{\s*color:\s*var\(--color-dark\);/u
  );
});

test("the answer contrast fix ships with a fresh stylesheet cache key", () => {
  assert.match(page, /mystyle\.css\?v=43-answer-label-contrast/u);
  assert.match(worker, /magicbook-pwa-v108-admin-list-fast/u);
  assert.match(worker, /mystyle\.css\?v=43-answer-label-contrast/u);
});
