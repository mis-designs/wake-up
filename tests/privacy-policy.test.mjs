import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("the privacy policy is a public, indexable static route", () => {
  const index = read("index.html");
  const page = read("privacypolicy.html");
  const redirects = read("_redirects");
  const routes = JSON.parse(read("vercel.json"));
  const sitemap = read("sitemap.xml");

  assert.ok(routes.rewrites.some(route => route.source === "/privacypolicy" && route.destination === "/privacypolicy.html"));
  assert.ok(routes.headers.some(entry => entry.source === "/privacypolicy"));
  assert.ok(routes.headers.some(entry => entry.source === "/privacypolicy.html"));
  assert.match(redirects, /^\/privacypolicy \/privacypolicy\.html 200$/mu);
  assert.match(sitemap, /<loc>https:\/\/tmmmagic\.eu\/privacypolicy<\/loc>/u);
  assert.match(page, /<html lang="it"/u);
  assert.match(page, /<title>Informativa sulla privacy \| MagicBook<\/title>/u);
  assert.match(page, /<meta name="robots" content="index,follow">/u);
  assert.match(page, /<link rel="canonical" href="https:\/\/tmmmagic\.eu\/privacypolicy">/u);
  assert.match(page, /privacy-policy\.css\?v=1-editorial-policy/u);
  assert.doesNotMatch(page, /googletagmanager|googleapis|banglawebfonts/u);
  assert.match(index, /<a class="landing-privacy-link" href="\/privacypolicy">Privacy policy<\/a>/u);
  assert.match(index, /<a href="\/privacypolicy">Privacy policy<\/a>/u);
});

test("the supplied policy content is fully represented and scannable", () => {
  const page = read("privacypolicy.html");
  const sectionIds = [
    "scope", "controller", "data", "purposes", "cookies", "providers", "external", "transfers",
    "retention", "security", "deletion", "privacy-rights", "statistics", "minors", "changes", "contacts"
  ];

  assert.equal((page.match(/class="privacy-section(?:\s|")/gu) || []).length, 16);
  assert.equal((page.match(/class="privacy-number"/gu) || []).length, 16);
  for (const id of sectionIds) assert.match(page, new RegExp(`id="${id}"`, "u"));
  for (const phrase of [
    "eu.tmmmagic.magicbookviewer",
    "Google Analytics 4",
    "localStorage e IndexedDB",
    "MagicBook non vende i dati personali degli utenti.",
    "miskatdesigns@gmail.com",
    "Garante per la protezione dei dati personali"
  ]) assert.match(page, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  assert.match(page, /Da completare prima della pubblicazione definitiva/u);
  assert.doesNotMatch(page, /�|Ã|Â|â€™|â€œ|â€/u);
});

test("the privacy policy is available in the offline shell", () => {
  const worker = read("service-worker.js");
  assert.match(worker, /\/privacypolicy\.html/u);
  assert.match(worker, /\/privacy-policy\.css\?v=1-editorial-policy/u);
  assert.match(worker, /url\.pathname\.startsWith\("\/privacypolicy"\)[\s\S]*?"\/privacypolicy\.html"/u);
});
