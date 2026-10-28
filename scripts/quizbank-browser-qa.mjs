// Local-only browser QA. No requests reach production, R2, Neon or All Books.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseQuizBank } from "../api/quizbank-catalog.mjs";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || "playwright");
const repo = fileURLToPath(new URL("../", import.meta.url));
const [bankPath, out] = process.argv.slice(2);
const bank = parseQuizBank(JSON.parse(fs.readFileSync(bankPath, "utf8")));
fs.mkdirSync(out, { recursive: true });
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".gif": "image/gif", ".woff": "font/woff", ".woff2": "font/woff2" };
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const report = [];
try {
  for (const width of [1440, 375, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const counts = { catalog: 0, sheets: 0, status: 0, primary: 0, fallback: 0, help: 0 };
    const errors = [];
    let mode = "ok", held = null, canUploadAudio = true;
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.hostname === "raw.githubusercontent.com") { counts.primary++; return route.fulfill({ status: 503, body: "" }); }
      if (url.hostname !== "quizbank.local") { counts.help++; return route.fulfill({ status: 503, body: "" }); }
      if (url.pathname === "/api/asset") {
        counts.fallback++;
        if (mode === "figures-fail") return route.fulfill({ status: 404, body: "" });
        return route.fulfill({ contentType: "image/png", body: fs.readFileSync(path.join(path.dirname(bankPath), "img_sign", "25.png")) });
      }
      if (url.pathname === "/api/quizbank") {
        const data = request.method() === "POST" ? request.postDataJSON() : Object.fromEntries(url.searchParams);
        if (mode === "denied" || (mode === "revoked" && ["getQuizAudioStatus", "getItalianAudio"].includes(data.action))) return route.fulfill({ status: 403, json: { error: "quizbank_access_denied" } });
        if (mode === "error") return route.fulfill({ status: 503, json: { error: "quizbank_archive_unavailable" } });
        if (data.action === "catalog") { counts.catalog++; return route.fulfill({ json: { canUploadAudio, sheets: bank.sheets.map((rows, index) => ({ number: index + 1, count: rows.length })), questionCount: 1500 } }); }
        if (data.action === "getStudyQuiz") {
          counts.sheets++;
          if (mode === "hold") await new Promise(resolve => { held = resolve; });
          return route.fulfill({ json: { quiz: bank.sheets[Number(data.chapters) - 1], canUploadAudio, quizSessionToken: "fixture", quizSessionTokenExpiresAt: Date.now() + 1800000 } }).catch(() => {});
        }
        if (data.action === "getQuizAudioStatus") { counts.status++; return route.fulfill({ json: { available: false } }); }
        return route.fulfill({ status: 503, json: { error: "fixture_audio_unavailable" } });
      }
      const relative = url.pathname === "/quizbank" ? "quizbank.html" : decodeURIComponent(url.pathname).slice(1);
      const file = path.resolve(repo, relative);
      if (!file.startsWith(repo) || !mime[path.extname(file)] || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ contentType: mime[path.extname(file)], body: fs.readFileSync(file) });
    });
    await context.addInitScript(() => localStorage.setItem("user_session", JSON.stringify({ phone: "39123456789", deviceId: "quizbank_browser_fixture", accessToken: "fixture" })));
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("https://quizbank.local/quizbank");
    await page.locator("#study-chapters:not(.hidden)").waitFor();
    assert.equal(await page.locator(".study-chapter").count(), 50);
    assert.equal(counts.catalog, 1); assert.equal(counts.sheets, 0); assert.equal(counts.help, 0);
    assert.equal(await page.locator("#quizbank-access-label").textContent(), "Amministratore");
    await page.screenshot({ path: path.join(out, `picker-${width}.png`), fullPage: true });
    await page.locator('.study-chapter[data-chapter="1"]').click();
    await page.locator("#study-reader:not(.hidden)").waitFor();
    assert.equal(await page.locator(".study-question-card").count(), 30);
    assert.equal(counts.sheets, 1);
    await page.waitForTimeout(600);
    assert.ok(counts.status < 15, "only visible question audio availability is requested");
    assert.ok(counts.primary > 0 && counts.fallback > 0, "GitHub failures use own image once");
    assert.equal(counts.help, 0, "help is lazy");
    await page.screenshot({ path: path.join(out, `reader-${width}.png`) });
    const overflows = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(overflows.scroll <= overflows.width + 1, JSON.stringify(overflows));
    await page.locator("#study-search-input").fill("zzzznomatch");
    await page.locator("#study-empty-search:not(.hidden)").waitFor();
    assert.equal(counts.sheets, 1);
    assert.match(page.url(), /q=zzzznomatch/);
    await page.getByRole("button", { name: "Cancella ricerca" }).click();
    assert.equal(await page.locator(".study-question-card:not(.hidden)").count(), 30);
    // Shared translation UI with a deterministic, exact All Books runtime row.
    await page.evaluate(question => {
      window.QuizHelpRuntimeV3.load = async () => ({ runtime: { quizzes: { "canonical-fixture": question } },
        resolver: { resolve: () => ({ questionBnStandard: "এটি পরীক্ষার বাংলা অনুবাদ।", words: [] }) } });
    }, bank.sheets[0][0]);
    await page.locator(".study-action-help").first().click();
    await page.locator(".study-translation").first().waitFor();
    assert.equal(await page.locator(".study-translation").first().textContent(), "এটি পরীক্ষার বাংলা অনুবাদ।");
    await page.locator(".study-action-italian").first().click();
    await page.locator(".study-toast.is-visible").waitFor();
    assert.match(await page.locator("#study-toast").textContent(), /Audio italiano non disponibile/);
    await page.locator("#study-back").click();
    await page.locator("#study-chapters:not(.hidden)").waitFor();
    assert.equal(counts.catalog, 1, "in-session back does not reload the archive");
    mode = "hold";
    await page.locator('.study-chapter[data-chapter="2"]').click();
    await page.waitForTimeout(100);
    await page.locator("#study-back").click();
    held?.(); mode = "ok";
    await page.waitForTimeout(150);
    assert.equal(await page.locator("#study-reader").evaluate(el => el.classList.contains("hidden")), true);
    mode = "error";
    await page.locator('.study-chapter[data-chapter="3"]').click();
    await page.locator("#study-error:not(.hidden)").waitFor();
    await page.screenshot({ path: path.join(out, `error-${width}.png`) });
    mode = "ok"; await page.locator("#study-retry").click();
    await page.locator("#study-reader:not(.hidden)").waitFor();
    assert.equal(await page.locator("#study-reader-title").textContent(), "Scheda 03");
    // Cross-tab account changes clear the visible private questions immediately.
    await page.evaluate(() => { localStorage.removeItem("user_session"); window.dispatchEvent(new StorageEvent("storage", { key: "user_session" })); });
    assert.equal(await page.locator(".study-question-card").count(), 0);
    mode = "denied"; await page.reload();
    await page.locator("#study-error:not(.hidden)").waitFor();
    assert.match(await page.locator("#study-error-message").textContent(), /non è abilitato/);
    assert.equal(await page.locator("#study-retry").isVisible(), true);
    assert.equal(await page.locator("#quizbank-error-login").isVisible(), false);
    assert.equal(await page.locator(".study-question-card").count(), 0);
    assert.ok(await page.evaluate(() => localStorage.getItem("user_session")), "QB denial preserves MagicBook login");
    await page.screenshot({ path: path.join(out, `access-denied-${width}.png`) });
    mode = "ok"; canUploadAudio = false;
    await page.locator("#study-retry").click();
    await page.locator("#study-reader:not(.hidden)").waitFor();
    assert.equal(await page.locator(".study-question-card").count(), 30);
    assert.equal(await page.locator(".quizbank-upload").count(), 0, "QB learners never receive upload controls");
    assert.equal(await page.locator("#quizbank-admin-help").isVisible(), false);
    assert.equal(await page.locator("#quizbank-access-label").textContent(), "Accesso riservato");
    await page.screenshot({ path: path.join(out, `learner-${width}.png`) });
    await page.evaluate(() => { const session = JSON.parse(localStorage.getItem("user_session")); session.role = "admin"; session.Quiz_bank = 1; localStorage.setItem("user_session", JSON.stringify(session)); });
    await page.reload(); await page.locator("#study-reader:not(.hidden)").waitFor();
    assert.equal(await page.locator(".quizbank-upload").count(), 0, "Forged local role never enables uploads");
    mode = "revoked";
    await page.locator(".study-action-italian").first().click();
    await page.locator("#study-error:not(.hidden)").waitFor();
    assert.equal(await page.locator(".study-question-card").count(), 0, "A media permission denial clears the private reader");
    assert.ok(await page.evaluate(() => localStorage.getItem("user_session")));
    assert.deepEqual(errors, []);
    report.push({ width, counts, checks: "picker, reader, narrow, search, help, media failure, back, stale request, retry, account change, forbidden, learner access, admin-only controls, forged local role, media revocation", errors });
    await context.close();
  }
  const guest = await browser.newPage();
  await guest.route("**/*", route => {
    const url = new URL(route.request().url());
    const file = path.resolve(repo, url.pathname === "/quizbank" ? "quizbank.html" : url.pathname.slice(1));
    return file.startsWith(repo) && mime[path.extname(file)] && fs.existsSync(file)
      ? route.fulfill({ contentType: mime[path.extname(file)], body: fs.readFileSync(file) }) : route.fulfill({ status: 404, body: "" });
  });
  await guest.goto("https://quizbank.local/quizbank");
  await guest.locator("#quizbank-login:not(.hidden)").waitFor();
  await guest.close();
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
