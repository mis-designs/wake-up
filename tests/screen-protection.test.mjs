import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const source = read("screen-protection.js");
const css = read("screen-protection.css");
const worker = read("service-worker.js");
const vercel = JSON.parse(read("vercel.json"));
const staticHeaders = read("_headers");

test("all private application surfaces load the shared protection layer", () => {
  for (const page of ["index.html", "quiz.html", "study-quiz.html", "aggiungi-spiegazioni.html"]) {
    const html = read(page);
    assert.match(html, /screen-protection\.css\?v=1\.1\.0/u, `${page} must load the print guard`);
    assert.match(html, /screen-protection\.js\?v=1\.2\.0/u, `${page} must load the silent runtime guard`);
  }

  for (const page of ["quiz.html", "study-quiz.html", "aggiungi-spiegazioni.html"]) {
    assert.match(read(page), /data-screen-protection="always"/u, `${page} must be protected immediately`);
  }
});

test("public entry screens stay outside protection while private routes are covered", () => {
  assert.ok(source.includes('PUBLIC_PATHS = new Set(["/", "/login", "/join", "/about", "/prova-gratis"])'));
  assert.ok(source.includes("body.classList.contains(\"public-mode\")"));
  assert.ok(source.includes("body.classList.contains(\"app-mode\")"));
  assert.match(source, /magic-book/u);
  assert.match(source, /studia-quiz/u);
  assert.match(source, /aggiungi-spiegazioni/u);
  assert.match(source, /prova-gratis\\\/libro/u);
});

test("the shared protection layer never adds a watermark or session identity", () => {
  for (const forbidden of [
    "attachShadow",
    "getMaskedIdentity",
    "shortFingerprint",
    "phoneDigits",
    "TMM MAGICBOOK",
    "UTENTE",
    "watermark",
    "localStorage",
    "sessionStorage"
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden, "u"), `${forbidden} must not enter the shared guard`);
  }
});

test("the late content-protected popup and visibility shield are completely absent", () => {
  for (const forbidden of [
    "Contenuto protetto",
    "Torna a MagicBook",
    "visibilitychange",
    "pagehide",
    "freeze",
    "conceal",
    "reveal",
    "shieldMessage",
    "showToast"
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden, "u"), `${forbidden} must not return`);
  }
  assert.doesNotMatch(source, /addEventListener\("blur"/u);
});

test("silent browser controls remain enabled without showing a popup", () => {
  assert.match(source, /PrintScreen/u);
  assert.match(source, /event\.metaKey && event\.shiftKey/u);
  assert.match(source, /\["copy", "cut", "dragstart", "contextmenu", "selectstart"\]/u);
  assert.match(source, /addEventListener\("beforeprint", refreshProtection/u);
  assert.match(css, /@media print/u);
  assert.match(css, /body > \*/u);
  assert.match(css, /body\.app-mode > \*/u);
  assert.match(css, /body\[data-screen-protection="always"\] > \*/u);
});

test("editable fields remain usable on protected admin and search interfaces", () => {
  assert.match(source, /input, textarea, select, \[contenteditable='true'\], \[data-screen-protection-allow\]/u);
  assert.match(css, /\[contenteditable="true"\][\s\S]*?user-select: text/u);
});

test("screen sharing is denied by production headers and assets are cache-versioned", () => {
  const globalHeaders = vercel.headers.find(entry => entry.source === "/(.*)")?.headers || [];
  const permissionsPolicy = globalHeaders.find(header => header.key === "Permissions-Policy")?.value || "";
  assert.match(permissionsPolicy, /display-capture=\(\)/u);
  assert.match(staticHeaders, /display-capture=\(\)/u);
  assert.match(worker, /magicbook-pwa-v161-numberless-figures/u);
  assert.match(worker, /screen-protection\.css\?v=1\.1\.0/u);
  assert.match(worker, /screen-protection\.js\?v=1\.2\.0/u);
});
