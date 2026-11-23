// Exercise the production ring and its actual print assets with a local route fixture.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const file = name => fileURLToPath(new URL("../" + name, import.meta.url));
const index = await readFile(file("index.html"), "utf8");
const markup = index.match(/<section class="chapter-ring"[^]*?<\/section>/)[0];
const { ring: covers } = JSON.parse(await readFile(file("assets/native-chapter-covers.json"), "utf8"));
const paths = new Set(Object.values(covers));
assert.equal(paths.size, 25);
const browser = await chromium.launch({ channel: process.env.QA_CHROME_CHANNEL || "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 740 }, reducedMotion: "reduce" });
  const requests = [];
  await page.route("**/*", async route => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/") return route.fulfill({ contentType: "text/html", body:
      '<html class="android-webview"><link rel="stylesheet" href="/android-study-atlas.css"><main class="has-chapter-ring">' + markup + '</main></html>' });
    if (pathname === "/android-study-atlas.css" || pathname === "/android-chapter-ring.mjs")
      return route.fulfill({ path: file(pathname.slice(1)), contentType: pathname.endsWith(".css") ? "text/css" : "text/javascript" });
    if (!paths.has(pathname)) return route.abort();
    requests.push(pathname);
    if (pathname === covers["17"]) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ path: file(pathname.slice(1)), contentType: "image/webp" });
  });
  await page.goto("https://ring.test/");
  assert.deepEqual(requests, []);
  await page.evaluate(async covers => {
    const { createChapterRing } = await import("/android-chapter-ring.mjs");
    const root = document.querySelector(".chapter-ring");
    root.hidden = false;
    const titles = Object.keys(covers).sort().map(folio => "Tema " + folio);
    let number = 1;
    const ring = createChapterRing(root, {
      titles, selected: () => number, enabled: () => true,
      select(value) { number = value; ring.render(number, covers); },
      open() { document.body.dataset.opened = String(number); }
    });
    ring.render(number, covers);
  }, covers);
  await page.waitForFunction(() => document.querySelectorAll(".has-art").length === 3);
  assert.deepEqual(new Set(requests), new Set([covers["25"], covers["01"], covers["02"]]));
  const picker = page.getByRole("combobox");
  await page.getByRole("button", { name: "Capitolo precedente" }).click();
  assert.equal(await picker.inputValue(), "25");
  await page.getByRole("button", { name: "Capitolo successivo" }).click();
  for (let number = 1; number <= 25; number++) {
    await picker.selectOption(String(number));
    await page.waitForFunction(() => [...document.querySelectorAll(".chapter-ring-card img")].every(image => image.complete));
    if (number === 17) {
      const fallback = page.getByRole("button", { name: "Apri capitolo 17, Tema 17" });
      assert.ok(await fallback.locator(".chapter-ring-fallback").isVisible());
      await fallback.click();
      assert.equal(await page.locator("body").getAttribute("data-opened"), "17");
    }
  }
  assert.equal(requests.length, 25, "Revisiting either neighbor must reuse its jacket");
  assert.deepEqual(new Set(requests), paths);
  console.log("25 chapters, wraparound, bounded image requests and missing-artwork opening passed");
} finally { await browser.close(); }
