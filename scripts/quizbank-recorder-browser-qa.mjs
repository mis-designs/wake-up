// All network traffic is mocked. Chromium's synthetic microphone never captures the user's voice.
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
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".gif": "image/gif", ".woff": "font/woff", ".woff2": "font/woff2" };
const rows = Array.from({ length: 30 }, (_, i) => ({ id: `qb_s01_q${String(i + 1).padStart(2, "0")}`,
  sheet: 1, number: i + 1, question: `Domanda di prova ${i + 1}: controllare la spiegazione prima di salvarla.`,
  correct: i % 2 === 0, figure: "", explanationMapped: i !== 0 }));
const browser = await chromium.launch({ headless: true, channel: "msedge",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const report = [];
try {
  for (const [width, native] of [[1440, false], [375, false], [320, false], [375, true]]) {
    const label = `${width}${native ? "-native" : ""}`;
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce", permissions: ["microphone"],
      ...(native ? { userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36 MagicBookViewer/1.0" } : {}) });
    const counts = { sheets: 0, status: 0, saves: 0, blob: 0, external: 0, direct: 0, confirm: 0, icon: 0 };
    const saved = new Map([[rows[1].id, { bytes: Buffer.alloc(0), type: "audio/webm" }]]);
    let mode = "ok", release = null, canUpload = true;
    const errors = [], payloads = [];
    await context.route("**/*", async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.hostname !== "quizbank.local") { counts.external++; return route.fulfill({ status: 503, body: "" }); }
      if (url.pathname === "/api/quizbank" || url.pathname === "/api/quiz") {
        const data = req.method() === "POST" ? req.postDataJSON() : Object.fromEntries(url.searchParams);
        if (data.action === "getStudyQuiz") { counts.sheets++; return route.fulfill({ json: { quiz: rows, canUploadAudio: canUpload, quizSessionToken: "fixture", quizSessionTokenExpiresAt: Date.now() + 600000 } }); }
        if (data.action === "getQuiz") return route.fulfill({ json: { quiz: rows.slice(0, 2), isAdmin: true, quizSessionToken: "fixture", timerMinutes: 20 } });
        if (data.action === "getQuizAudioStatus") { counts.status++; return route.fulfill({ json: { available: saved.has(data.questionId) } }); }
        if (data.action === "getQuizAudioBlob") { counts.blob++; const audio = saved.get(data.questionId); return route.fulfill({ contentType: audio.type, body: audio.bytes }); }
        if (data.action === "createQuizAudioUpload") { counts.direct++; return route.fulfill({ json: { uploadUrl: "https://quizbank.local/mock-audio", uploadContentType: data.audioMimeType || "audio/webm" } }); }
        if (data.action === "confirmQuizAudioUpload") { counts.confirm++; saved.set(rows[0].id, { bytes: Buffer.alloc(0), type: "audio/webm" }); return route.fulfill({ json: { ok: true } }); }
        if (data.action === "saveQuizAudio") {
          counts.saves++; payloads.push(data);
          const encoded = data.audioBase64.replace(/^data:[^,]+,/, "");
          assert.ok(Buffer.from(encoded, "base64").length > 0);
          assert.equal(data.questionId, rows[0].id);
          if (mode === "hold") await new Promise(resolve => { release = resolve; });
          if (mode === "fail") return route.fulfill({ status: 503, json: { error: "service_unavailable" } }).catch(() => {});
          if (mode === "denied") return route.fulfill({ status: 403, json: { error: "quizbank_admin_required" } }).catch(() => {});
          saved.set(data.questionId, { bytes: Buffer.from(encoded, "base64"), type: data.audioMimeType });
          if (mode === "conflict") return route.fulfill({ status: 409, json: { error: "quiz_audio_already_exists" } });
          return route.fulfill({ json: { ok: true } }).catch(() => {});
        }
        if (data.action === "getExplanationFigures") return route.fulfill({ json: { figures: [] } });
        return route.fulfill({ json: { ok: true, available: false } });
      }
      if (url.pathname === "/mock-audio") return route.fulfill({ status: 200, body: "" });
      if (url.pathname === "/icons/add_voice.png") counts.icon++;
      const file = path.resolve(repo, url.pathname === "/quizbank" ? "quizbank.html" : url.pathname.startsWith("/quiz/") ? "quiz.html" : decodeURIComponent(url.pathname).slice(1));
      if (!file.startsWith(repo) || !mime[path.extname(file)] || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ contentType: mime[path.extname(file)], body: fs.readFileSync(file) });
    });
    await context.addInitScript(() => {
      localStorage.setItem("client_auth_reset_version", "2026-04-device-reset-1");
      localStorage.setItem("user_session", JSON.stringify({ phone: "39123456789", deviceId: "recorder_fixture", accessToken: "fixture" }));
      let hash = 2166136261;
      for (const letter of "39123456789") { hash ^= letter.charCodeAt(0); hash = Math.imul(hash, 16777619); }
      localStorage.setItem(`magicbook.wordLearning.v1.${(hash >>> 0).toString(36)}`, JSON.stringify({ lastCompletedAt: Date.now() }));
      window.__MAGICBOOK_DISABLE_SCREEN_PROTECTION__ = true;
      window.fixtureStreams = []; window.fixtureDenied = false;
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async constraints => {
        if (window.fixtureDenied) throw new DOMException("Denied", "NotAllowedError");
        const stream = await original(constraints); window.fixtureStreams.push(stream); return stream;
      };
    });
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    const first = page.locator(".study-question-card").first();
    const trigger = first.getByRole("button", { name: "Aggiungi spiegazione audio per la domanda 1", exact: true });
    const panel = page.locator(".quiz-audio-recorder:not(.hidden)");
    const start = () => panel.getByRole("button", { name: /^(Registra|Riprendi)$/ });
    const save = () => panel.getByRole("button", { name: "Salva", exact: true });
    const pause = () => panel.getByRole("button", { name: "Pausa", exact: true });
    const record = async () => {
      await start().click(); await pause().waitFor();
      await page.waitForFunction(() => !document.querySelector('.quiz-audio-recorder:not(.hidden) [data-recorder="pause"], .quiz-audio-recorder:not(.hidden) #quiz-audio-record-pause').disabled);
      // Give the synthetic device time to deliver its first encoded audio packet.
      await page.waitForTimeout(1500); await pause().click();
      try {
        await page.waitForFunction(() => !document.querySelector('.quiz-audio-recorder:not(.hidden) [data-recorder="save"], .quiz-audio-recorder:not(.hidden) #quiz-audio-record-save').disabled);
      } catch (error) {
        await page.screenshot({ path: path.join(out, `recording-failure-${label}.png`) });
        throw new Error(`Recording fixture at ${page.url()}: ${await panel.textContent()}`, { cause: error });
      }
    };
    const noTracks = () => page.waitForFunction(() => window.fixtureStreams.every(stream => stream.getTracks().every(track => track.readyState === "ended")));
    await page.goto("https://quizbank.local/quizbank?scheda=1");
    await trigger.waitFor(); assert.equal(counts.saves, 0); assert.ok(counts.status < 15);
    const checkAddIcon = async button => {
      const icon = button.locator(".quiz-audio-add-icon");
      assert.equal(await icon.isVisible(), true);
      assert.equal(await icon.getAttribute("aria-hidden"), "true");
      assert.match(await icon.evaluate(el => getComputedStyle(el).backgroundImage), /\/icons\/add_voice\.png/);
      const [target, graphic] = await Promise.all([button.boundingBox(), icon.boundingBox()]);
      assert.ok(target.width >= 44 && target.height >= 44);
      assert.equal(graphic.width, 28); assert.equal(graphic.height, 28);
      assert.ok(Math.abs(target.x + target.width / 2 - graphic.x - graphic.width / 2) < 1);
      assert.ok(Math.abs(target.y + target.height / 2 - graphic.y - graphic.height / 2) < 1);
      assert.doesNotMatch(await button.textContent(), /\+/);
    };
    await checkAddIcon(trigger);
    assert.equal(counts.icon, 1, "One shared static icon request for the sheet, not one per question");
    await trigger.focus(); await page.keyboard.press("Space"); await panel.waitFor();
    assert.equal(await start().evaluate(el => el === document.activeElement), true);
    await panel.getByRole("button", { name: "Chiudi registratore" }).click();
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
    await trigger.click(); await panel.waitFor();
    const recorderGap = await panel.evaluate(el => el.getBoundingClientRect().top - el.previousElementSibling.getBoundingClientRect().bottom);
    assert.equal(recorderGap, 18, "Recorder stays separate from all wrapped action rows");
    await page.screenshot({ path: path.join(out, `recorder-open-${label}.png`) });
    assert.equal(await page.locator("input[type=file]").count(), 0);
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await page.evaluate(() => window.fixtureStreams.length), 0, "Opening never requests microphone");
    assert.equal(await save().isEnabled(), false);
    await page.evaluate(() => { window.fixtureDenied = true; });
    await start().click(); await page.getByText(/Microfono bloccato/).waitFor();
    await page.evaluate(() => { window.fixtureDenied = false; });
    await record(); await record();
    assert.equal(counts.saves, 0, "Record/pause/resume/preview stay local");
    assert.equal(await page.evaluate(() => window.fixtureStreams.length), 1, "Resume reuses microphone");
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `recorder-ready-${label}.png`) });
    const geometry = await panel.evaluate(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right,
      scroll: document.documentElement.scrollWidth, width: innerWidth }));
    assert.ok(geometry.left >= 0 && geometry.right <= width && geometry.scroll <= width, JSON.stringify(geometry));
    const qbLabels = await panel.locator(".quiz-audio-record-actions button").allTextContents();
    mode = "hold"; const dimensions = await save().boundingBox();
    await save().click(); await page.waitForFunction(() => document.querySelector('[data-recorder="save"], #quiz-audio-record-save').disabled);
    for (let turn = 0; turn < 100 && !release; turn++) await page.waitForTimeout(20);
    assert.ok(release, `Save did not reach the API: ${await panel.textContent()} / ${errors.join(", ")}`);
    await save().dispatchEvent("click"); assert.equal(counts.saves, 1);
    const busy = await save().boundingBox(); assert.ok(Math.abs(dimensions.width - busy.width) < 1);
    await page.screenshot({ path: path.join(out, `recorder-saving-${label}.png`) });
    mode = "fail"; release(); release = null;
    await page.getByText(/Salvataggio non riuscito/).waitFor(); assert.equal(await save().isEnabled(), true);
    mode = "ok"; await save().click(); await panel.waitFor({ state: "hidden" }); await noTracks();
    assert.equal(counts.saves, 2); assert.equal(payloads[0].audioBase64, payloads[1].audioBase64);
    assert.equal(await trigger.isVisible(), false);
    await first.locator(".study-explanation-play").click();
    await page.waitForTimeout(150); assert.equal(counts.blob, 1);
    await page.reload(); await first.waitFor(); assert.equal(await trigger.isVisible(), false);
    saved.delete(rows[0].id); await page.reload(); await trigger.waitFor();
    await trigger.click(); await record(); mode = "conflict"; await save().click();
    await page.getByText(/Nessun audio è stato sostituito/).waitFor(); assert.equal(await save().isEnabled(), false);
    mode = "ok"; saved.delete(rows[0].id); await page.reload(); await trigger.waitFor();
    await trigger.click(); await start().click(); await page.waitForTimeout(100);
    await page.locator("#quizbank-next").click(); await noTracks(); assert.equal(await panel.count(), 0);
    await page.goto("https://quizbank.local/quizbank?scheda=1"); await trigger.waitFor();
    await trigger.click(); await record(); mode = "denied"; await save().click();
    await page.locator("#study-error:not(.hidden)").waitFor(); await noTracks();
    assert.equal(await page.locator(".study-question-card").count(), 0);
    assert.ok(await page.evaluate(() => localStorage.getItem("user_session")));
    mode = "ok"; canUpload = false; await page.goto("https://quizbank.local/quizbank?scheda=1"); await first.waitFor();
    assert.equal(await page.locator(".quizbank-upload").count(), 0);
    // The real Magic Book consumer must still open and save through its adapter.
    saved.delete(rows[0].id);
    await page.goto("https://quizbank.local/quiz/capitolo-1");
    await page.locator("#quiz-audio-add").waitFor();
    await checkAddIcon(page.locator("#quiz-audio-add"));
    await page.locator("#quiz-audio-add").click(); await panel.waitFor();
    await record();
    assert.deepEqual(await panel.locator(".quiz-audio-record-actions button").allTextContents(), qbLabels);
    await panel.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `magicbook-recorder-${label}.png`) });
    await save().click(); await panel.waitFor({ state: "hidden" }); await noTracks();
    assert.equal(counts.direct, 1); assert.equal(counts.confirm, 1);
    await page.locator("#quiz-audio-add.has-audio").waitFor();
    assert.equal(await page.locator("#quiz-audio-add .quiz-audio-add-icon").isVisible(), false);
    assert.equal(await page.locator("#quiz-audio-add > img").isVisible(), true, "Existing audio keeps its edit icon");
    assert.deepEqual(errors, []);
    report.push({ width, native, recorderGap, counts, errors, checks: ["shared-add-voice-icon", "one-static-icon-request", "keyboard-open-close", "recorder-spacing", "preserved-edit-icon", "shared-controls", "real-synthetic-microphone", "denied-microphone", "pause-resume-preview", "one-save", "retry-same-recording", "save-play-reload", "conflict", "navigation-cleanup", "permission-denied", "learner-hidden", "magicbook-direct-save"] });
    await context.close();
  }
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
