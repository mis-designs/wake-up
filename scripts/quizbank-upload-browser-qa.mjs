// Local fixtures only: never sends a recording, credentials or traffic to production.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || "playwright");
const repo = fileURLToPath(new URL("../", import.meta.url));
const out = process.argv[2];
if (!out) throw new Error("Supply a QA output directory");
fs.mkdirSync(out, { recursive: true });
const wav = Buffer.alloc(16044);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
const audioFile = { name: "Spiegazione di prova.wav", mimeType: "audio/wav", buffer: wav };
const rows = Array.from({ length: 30 }, (_, i) => ({ id: `qb_s01_q${String(i + 1).padStart(2, "0")}`,
  sheet: 1, number: i + 1, question: `Domanda di prova ${i + 1}: controllare la spiegazione prima di caricarla.`,
  correct: i % 2 === 0, figure: "", explanationMapped: i !== 0 }));
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".gif": "image/gif", ".woff": "font/woff", ".woff2": "font/woff2" };
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const report = [];
try {
  for (const width of [1440, 375, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const counts = { sheets: 0, status: 0, upload: 0, blob: 0, external: 0 };
    const saved = new Set([rows[1].id]);
    let mode = "ok", held = null, canUpload = true;
    const errors = [];
    await context.route("**/*", async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.hostname !== "quizbank.local") { counts.external++; return route.fulfill({ status: 503, body: "" }); }
      if (url.pathname === "/api/quizbank") {
        const data = req.method() === "POST" ? req.postDataJSON() : Object.fromEntries(url.searchParams);
        if (data.action === "getStudyQuiz") { counts.sheets++; return route.fulfill({ json: { quiz: rows, canUploadAudio: canUpload, quizSessionToken: "fixture", quizSessionTokenExpiresAt: Date.now() + 600000 } }); }
        if (data.action === "getQuizAudioStatus") { counts.status++; return route.fulfill({ json: { available: saved.has(data.questionId) } }); }
        if (data.action === "getQuizAudioBlob") { counts.blob++; return route.fulfill({ contentType: "audio/wav", body: wav }); }
        if (data.action === "saveQuizAudio") {
          counts.upload++;
          assert.deepEqual(Buffer.from(data.audioBase64, "base64"), wav);
          assert.equal(data.questionId, rows[0].id);
          if (mode === "hold") await new Promise(resolve => { held = resolve; });
          if (mode === "fail") return route.fulfill({ status: 503, json: { error: "service_unavailable" } }).catch(() => {});
          if (mode === "denied") return route.fulfill({ status: 403, json: { error: "quizbank_preview_forbidden" } }).catch(() => {});
          if (mode === "conflict") { saved.add(data.questionId); return route.fulfill({ status: 409, json: { error: "quiz_audio_already_exists" } }); }
          saved.add(data.questionId);
          return route.fulfill({ json: { ok: true } }).catch(() => {});
        }
        return route.fulfill({ status: 400, json: { error: "invalid_action" } });
      }
      const file = path.resolve(repo, url.pathname === "/quizbank" ? "quizbank.html" : decodeURIComponent(url.pathname).slice(1));
      if (!file.startsWith(repo) || !mime[path.extname(file)] || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ contentType: mime[path.extname(file)], body: fs.readFileSync(file) });
    });
    await context.addInitScript(() => localStorage.setItem("user_session", JSON.stringify({ phone: "39123456789", deviceId: "quizbank_upload_fixture", accessToken: "fixture" })));
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    const first = page.locator(".study-question-card").first();
    const trigger = first.getByRole("button", { name: "Carica audio per la domanda 1", exact: true });
    const dialog = page.getByRole("dialog");
    const save = page.locator("[data-upload-save]");
    const status = page.locator("#quizAudioUploadStatus");
    await page.goto("https://quizbank.local/quizbank?scheda=1");
    await trigger.waitFor();
    assert.equal(counts.upload, 0);
    assert.ok(counts.status < 15, "only visible cards are checked, including isolated identity");
    await trigger.click(); await dialog.waitFor();
    assert.equal(await page.locator("#quizbank-main").evaluate(el => el.inert), true);
    await page.keyboard.press("Escape"); await dialog.waitFor({ state: "detached" });
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
    assert.equal(counts.sheets, 1, "closing modal does not reload the sheet");
    await trigger.click();
    await page.locator("input[type=file]").setInputFiles({ name: "not-audio.txt", mimeType: "text/plain", buffer: Buffer.from("bad") });
    assert.match(await status.textContent(), /Formato non supportato/);
    assert.equal(await save.isEnabled(), false);
    await page.locator("input[type=file]").setInputFiles({ ...audioFile, buffer: Buffer.alloc(3 * 1024 * 1024 + 1) });
    assert.match(await status.textContent(), /supera 3 MB/);
    await page.locator("input[type=file]").setInputFiles(audioFile);
    await page.waitForFunction(() => !document.querySelector("[data-upload-save]").disabled);
    await page.screenshot({ path: path.join(out, `upload-ready-${width}.png`) });
    const geometry = await dialog.evaluate(el => ({ x: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right,
      bottom: el.getBoundingClientRect().bottom, scroll: document.documentElement.scrollWidth, width: innerWidth, height: innerHeight }));
    assert.ok(geometry.x >= 0 && geometry.right <= width && geometry.bottom <= geometry.height && geometry.scroll <= width, JSON.stringify(geometry));
    // Back is owned by the popup and warns before discarding selected work.
    await page.goBack();
    await page.locator("[data-upload-keep]").waitFor();
    assert.equal(counts.sheets, 1);
    await page.locator("[data-upload-keep]").click();
    mode = "hold";
    const dimensions = await save.boundingBox();
    await save.click();
    await page.waitForFunction(() => document.querySelector("[data-upload-save]").getAttribute("aria-busy") === "true");
    await save.dispatchEvent("click");
    await page.waitForTimeout(80);
    assert.equal(counts.upload, 1, "duplicate save cannot send a second request");
    const busyDimensions = await save.boundingBox();
    assert.equal(busyDimensions.width, dimensions.width); assert.equal(busyDimensions.height, dimensions.height);
    const loader = await save.evaluate(el => ({ asset: getComputedStyle(el).getPropertyValue("--magic-loading-asset"), size: getComputedStyle(el).getPropertyValue("--magic-loading-button-size") }));
    assert.match(loader.asset, /loading_backup/); assert.match(loader.size, /22px/);
    assert.equal(await save.locator("span").evaluate(el => getComputedStyle(el).opacity), "0.22", "Busy label uses the shared compact-loader treatment");
    await page.screenshot({ path: path.join(out, `upload-busy-${width}.png`) });
    mode = "fail"; held?.();
    await page.waitForFunction(() => document.querySelector("#quizAudioUploadStatus").textContent.includes("Non posso confermare"));
    assert.equal(await save.isEnabled(), true);
    assert.match(await page.locator("[data-upload-filename]").textContent(), /Spiegazione di prova/);
    assert.equal(counts.upload, 1, "failed upload has no automatic retry");
    mode = "ok"; await save.click(); await dialog.waitFor({ state: "detached" });
    assert.equal(counts.upload, 2);
    assert.equal(await trigger.isVisible(), false);
    await first.locator(".study-explanation-media:not(.hidden)").waitFor();
    await first.getByRole("button", { name: "Riproduci spiegazione", exact: true }).click();
    await page.waitForTimeout(100);
    assert.equal(counts.blob, 1, "saved explanation uses shared player");
    // Reload uses server availability and never re-offers upload for saved audio.
    await page.reload(); await first.locator(".study-explanation-media:not(.hidden)").waitFor();
    assert.equal(await trigger.isVisible(), false);
    saved.delete(rows[0].id); await page.reload(); await trigger.waitFor(); await trigger.click();
    await page.locator("input[type=file]").setInputFiles(audioFile);
    await page.waitForFunction(() => !document.querySelector("[data-upload-save]").disabled);
    mode = "conflict"; await save.click();
    await page.waitForFunction(() => document.querySelector("#quizAudioUploadStatus").textContent.includes("già presente"));
    assert.equal(await save.isEnabled(), false);
    await page.locator("[data-upload-cancel]").click(); await page.locator("[data-upload-discard]").click();
    await dialog.waitFor({ state: "detached" });
    saved.delete(rows[0].id); await page.reload(); await trigger.waitFor(); await trigger.click();
    await page.locator("input[type=file]").setInputFiles(audioFile);
    await page.waitForFunction(() => !document.querySelector("[data-upload-save]").disabled);
    mode = "hold"; await save.click(); await page.waitForTimeout(80);
    await page.locator("[data-upload-cancel]").click();
    await page.waitForFunction(() => document.querySelector("#quizAudioUploadStatus").textContent.includes("Non posso confermare"));
    mode = "fail"; held?.();
    assert.equal(await save.isEnabled(), true, "cancel wait preserves file for safe retry");
    // Revoked authorization closes modal and clears private questions.
    mode = "denied"; await save.click();
    await page.locator("#study-error:not(.hidden)").waitFor();
    assert.equal(await dialog.count(), 0); assert.equal(await page.locator(".study-question-card").count(), 0);
    mode = "ok"; canUpload = false; await page.reload();
    await page.locator("#study-reader:not(.hidden)").waitFor();
    assert.equal(await page.locator(".quizbank-upload").count(), 0, "capability omitted/false never renders uploader");
    assert.equal(counts.external, 0);
    assert.deepEqual(errors, []);
    report.push({ width, counts, errors, checks: "missing/existing/isolated, capability, picker, validation, preview, keyboard, Back, pending, duplicate, retry, save/play/reload, conflict, abort, forbidden" });
    await context.close();
  }
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
