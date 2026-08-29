import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  normalizeStudyChapter,
  selectStudyChapterRows,
  STUDY_CHAPTER_COUNT
} from "../api/study-quiz.mjs";

test("study mode accepts only the 25 MagicBook chapters", () => {
  assert.equal(STUDY_CHAPTER_COUNT, 25);
  assert.equal(normalizeStudyChapter("01"), 1);
  assert.equal(normalizeStudyChapter(25), 25);
  assert.equal(normalizeStudyChapter(0), null);
  assert.equal(normalizeStudyChapter(26), null);
  assert.equal(normalizeStudyChapter("2,4"), null);
});

test("study mode returns every question in the selected chapter in ID order", () => {
  const rows = [
    { id: "q00120", chapter: 2, question: "Terza", figure: "fig3" },
    { id: "q00002", chapter: 1, question: "Altro capitolo", figure: "" },
    { id: "q00101", chapter: "02", question: "Prima", figure: "fig1" },
    { id: "q00110", chapter: 2, question: "Seconda", figure: "fig2" }
  ];

  const selected = selectStudyChapterRows(rows, 2);
  assert.deepEqual(selected.map(row => row.id), ["q00101", "q00110", "q00120"]);
  assert.deepEqual(selected.map(row => row.audioQuestion), ["Prima", "Seconda", "Terza"]);
  assert.deepEqual(selected.map(row => row.audioFigure), ["fig1", "fig2", "fig3"]);
});

test("study mode also recognizes legacy chapter-prefixed IDs", () => {
  const selected = selectStudyChapterRows([
    { id: "capitolo_04_002", question: "B", figure: "" },
    { id: "cap04_001", question: "A", figure: "" },
    { id: "cap05_001", question: "C", figure: "" }
  ], 4);

  assert.deepEqual(selected.map(row => row.question), ["A", "B"]);
});

test("the quiz menu and clean routes expose the study experience", () => {
  const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const page = readFileSync(new URL("../study-quiz.html", import.meta.url), "utf8");
  const routes = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

  assert.match(index, /id="qmsCardStudy"/);
  assert.match(index, /onclick="startStudyQuiz\(\)"/);
  assert.match(page, /id="study-chapter-grid"/);
  assert.match(page, /id="study-question-list"/);
  assert.doesNotMatch(page, /id="timer"|id="true-btn"|id="false-btn"/);
  assert.ok(routes.rewrites.some(route => route.source === "/studia-quiz" && route.destination === "/study-quiz"));
  assert.ok(routes.rewrites.some(route => route.source === "/studia-quiz/prova-gratis" && route.destination === "/study-quiz"));
  assert.ok(routes.rewrites.some(route => route.source === "/studia-quiz/capitolo-:chapter"));
});

test("study questions use the supplied audio icon and the complete explanation player", () => {
  const source = readFileSync(new URL("../study-quiz.js", import.meta.url), "utf8");
  assert.match(source, /M5\.80688 18\.5304C5\.82459/);
  assert.match(source, /study-explanation-play/);
  assert.match(source, /study-explanation-progress/);
  assert.match(source, /study-explanation-speed/);
  assert.match(source, /seekExplanation\(controls\)/);
  assert.match(source, /changeExplanationSpeed\(controls\)/);
});

test("study explanation players reuse the supplied artwork with stable responsive geometry", () => {
  const page = readFileSync(new URL("../study-quiz.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("../study-quiz.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../study-quiz.css", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

  assert.match(source, /surface\.className = "study-explanation-media hidden"/u);
  assert.match(source, /artwork\.className = "study-explanation-artwork"[\s\S]*?artwork\.src = "icons\/explain_quiz\.svg"[\s\S]*?artwork\.alt = ""[\s\S]*?aria-hidden[\s\S]*?artwork\.width = 50[\s\S]*?artwork\.height = 50[\s\S]*?artwork\.loading = "lazy"/u);
  assert.match(source, /surface\.append\(artwork, root\)/u);
  assert.match(source, /actions\.append\(italian, bangla, lockedExplanation \|\| explanation\.surface, help\)/u);
  assert.match(source, /function setExplanationPlaying\(controls, isPlaying\)[\s\S]*?controls\?\.artwork\.classList\.toggle\("is-spinning", isPlaying\)/u);
  assert.match(styles, /\.study-explanation-media\s*\{[^}]*flex:\s*0 1 368px[^}]*min-width:\s*0[^}]*gap:\s*8px/u);
  assert.match(styles, /\.study-explanation-artwork\s*\{[^}]*width:\s*50px[^}]*height:\s*50px[^}]*animation-play-state:\s*paused/u);
  assert.match(styles, /@media \(max-width: 430px\)[\s\S]*?\.study-explanation-artwork\s*\{[^}]*flex-basis:\s*44px[^}]*width:\s*44px[^}]*height:\s*44px/u);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.study-explanation-artwork\s*\{\s*animation:\s*none/u);
  assert.match(page, /study-quiz\.css\?v=23-adorsho-study-text/u);
  assert.match(page, /study-quiz\.js\?v=17-tts-session-recovery/u);
  assert.match(worker, /magicbook-pwa-v145-mobile-help-layout/u);
  assert.match(worker, /\/icons\/explain_quiz\.svg/u);
});

test("study chapter picker uses the layered performance-green visual system", () => {
  const page = readFileSync(new URL("../study-quiz.html", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../study-quiz.css", import.meta.url), "utf8");
  assert.match(page, /আজকে কোন অধ্যায়টি পড়তে চাচ্ছেন \?/u);
  assert.match(styles, /\.study-intro::before/);
  assert.match(styles, /\.study-intro::after/);
  assert.match(styles, /background-image:\s*linear-gradient[\s\S]*?background-size:\s*68px 68px/);
  assert.match(styles, /\.study-chapter::before/);
  assert.match(styles, /--lime:\s*#67f528/);
  assert.doesNotMatch(styles, /\.study-intro\s*\{[^}]*background:\s*#[0-9a-f]{3,8}\s*;/i);
});

test("the study intro keeps Hadi Rounded only on the large title and uses Adorsho Lipi for smaller Bangla text", () => {
  const page = readFileSync(new URL("../study-quiz.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("../study-quiz.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../study-quiz.css", import.meta.url), "utf8");
  const sharedFonts = readFileSync(new URL("../assets/fonts/magicbook-bangla-fonts.css", import.meta.url), "utf8");
  const titleFont = readFileSync(new URL("../assets/fonts/hadi-rounded/hadi-rounded-regular.woff2", import.meta.url));
  const subtitleFont = readFileSync(new URL("../assets/fonts/adorsho-lipi/adorsho-lipi-regular.woff2", import.meta.url));
  const fallbackFont = readFileSync(new URL("../assets/fonts/ekushey-lal-sabuj/ekushey-lal-sabuj-regular.woff2", import.meta.url));
  const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
  const routes = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const policy = routes.headers[0].headers.find(header => header.key === "Content-Security-Policy")?.value || "";

  assert.match(page, /rel="preload" as="font" type="font\/woff2" href="\/assets\/fonts\/hadi-rounded\/hadi-rounded-regular\.woff2\?v=1" crossorigin/u);
  assert.match(page, /rel="preload" as="font" type="font\/woff2" href="\/assets\/fonts\/adorsho-lipi\/adorsho-lipi-regular\.woff2\?v=1" crossorigin/u);
  assert.doesNotMatch(page, /rel="preload"[^>]+ekushey-lal-sabuj/u);
  assert.match(page, /\/assets\/fonts\/magicbook-bangla-fonts\.css\?v=1-adorsho/u);
  assert.doesNotMatch(page, /banglawebfonts\.pages\.dev\/css\/(?:hadi-rounded|adorsho-lipi|ekushey-lal-sabuj)/u);
  assert.match(page, /id="study-last-chapter" class="hidden"/u);
  assert.match(sharedFonts, /@font-face\s*\{[^}]*font-family:\s*"Hadi Rounded";[^}]*hadi-rounded-regular\.woff2\?v=1[^}]*font-weight:\s*400;[^}]*font-display:\s*swap;[^}]*unicode-range:\s*U\+0964-0965, U\+0980-09FF, U\+200C-200D;/su);
  assert.match(sharedFonts, /@font-face\s*\{[^}]*font-family:\s*"Hadi Rounded";[^}]*hadi-rounded-regular\.woff2\?v=1[^}]*font-weight:\s*700;[^}]*font-display:\s*swap;[^}]*unicode-range:\s*U\+0964-0965, U\+0980-09FF, U\+200C-200D;/su);
  assert.match(sharedFonts, /@font-face\s*\{[^}]*font-family:\s*"Adorsho Lipi";[^}]*adorsho-lipi-regular\.woff2\?v=1[^}]*font-weight:\s*400;[^}]*font-display:\s*swap;[^}]*unicode-range:\s*U\+0964-0965, U\+0980-09FF, U\+200C-200D;/su);
  assert.match(sharedFonts, /@font-face\s*\{[^}]*font-family:\s*"Ekushey Lal Sabuj";[^}]*ekushey-lal-sabuj-regular\.woff2\?v=1[^}]*font-weight:\s*400;[^}]*font-display:\s*swap;[^}]*unicode-range:\s*U\+0964-0965, U\+0980-09FF, U\+200C-200D;/su);
  assert.match(sharedFonts, /--font-bn-support:\s*var\(--font-bn-adorsho\);/u);
  assert.match(styles, /--font-bangla:\s*var\(--font-bn-support\);/u);
  assert.match(styles, /--font-bangla-title:\s*var\(--font-bn-title\);/u);
  assert.match(styles, /--text-bangla-support:\s*clamp\(1\.15rem, calc\(1\.1rem \+ \.15vw\), 1\.2rem\);/u);
  assert.match(styles, /--text-bangla-compact:\s*clamp\(\.86rem, calc\(\.83rem \+ \.1vw\), \.92rem\);/u);
  assert.match(styles, /body\s*\{[^}]*font-family:\s*"Adorsho Lipi", "Ekushey Lal Sabuj", "Hadi Rounded", Inter, Arial, sans-serif;[^}]*font-weight:\s*400;[^}]*font-style:\s*normal;/su);
  assert.doesNotMatch(page, /family=Anek\+Bangla/u);
  assert.match(styles, /\[lang="bn"\]\s*\{[^}]*font-family:\s*var\(--font-bangla\);/su);
  assert.match(styles, /\.study-intro-copy\s*\{[^}]*font-family:\s*var\(--font-bangla\);/su);
  assert.match(styles, /\.study-intro h2\s*\{[^}]*font-family:\s*var\(--font-bangla-title\);[^}]*font-weight:\s*400;[^}]*font-style:\s*normal;/su);
  assert.match(styles, /#study-last-chapter\s*\{[^}]*font-family:\s*var\(--font-bangla\);/su);
  assert.match(styles, /\.study-action-bangla\s*\{[^}]*font-size:\s*var\(--text-bangla-compact\);/su);
  assert.match(styles, /\.study-translation\s*\{[^}]*font-family:\s*var\(--font-bangla\);[^}]*font-size:\s*var\(--text-bangla-support\);[^}]*line-height:\s*1\.65;/su);
  assert.match(styles, /\.study-word span\s*\{[^}]*font-family:\s*var\(--font-bangla\);[^}]*font-size:\s*var\(--text-bangla-compact\);[^}]*line-height:\s*1\.35;/su);
  assert.match(styles, /\.study-word-detail p\[lang="bn"\]\s*\{[^}]*font-family:\s*var\(--font-bangla\);[^}]*font-size:\s*var\(--text-bangla-compact\);[^}]*line-height:\s*1\.55;/su);
  assert.match(source, /bangla\.lang = "bn"/u);
  assert.match(source, /translation\.lang = "bn"/u);
  assert.equal(titleFont.subarray(0, 4).toString("ascii"), "wOF2");
  assert.equal(subtitleFont.subarray(0, 4).toString("ascii"), "wOF2");
  assert.equal(fallbackFont.subarray(0, 4).toString("ascii"), "wOF2");
  assert.ok(titleFont.length > 50_000);
  assert.equal(subtitleFont.length, 104_732);
  assert.ok(fallbackFont.length > 50_000);
  assert.equal(createHash("sha256").update(titleFont).digest("hex"), "195701ac3bef5f5eedbd9768cbab55fef14a7d1a02c8d059edeabb7f053165e4");
  assert.equal(createHash("sha256").update(subtitleFont).digest("hex"), "5df4772d28684b962fa2ceb5a2b64b683496f173b3746fbc3739d5b3b7e1d7e6");
  assert.equal(createHash("sha256").update(fallbackFont).digest("hex"), "bdb7955ae89c44de417b9f894d0e09ba59a3ffe1a646c36a9b2bac7d6770b7a7");
  assert.match(worker, /\/assets\/fonts\/magicbook-bangla-fonts\.css\?v=1-adorsho/u);
  assert.match(worker, /\/assets\/fonts\/hadi-rounded\/hadi-rounded-regular\.woff2\?v=1/u);
  assert.match(worker, /\/assets\/fonts\/adorsho-lipi\/adorsho-lipi-regular\.woff2\?v=1/u);
  assert.match(worker, /\/assets\/fonts\/ekushey-lal-sabuj\/ekushey-lal-sabuj-regular\.woff2\?v=1/u);
  assert.match(source, /STUDY_RETURN_DELAY_MS\s*=\s*5 \* 60 \* 1000/u);
  assert.match(source, /শেষবার আপনি পড়েছিলেন অধ্যায়/u);
  assert.match(source, /BANGLA_DIGITS\s*=\s*\["০", "১", "২", "৩", "৪", "৫"/u);
  assert.match(source, /rememberStudyChapter\(chapter\)/u);
  assert.match(source, /markStudyChapterExit\(currentChapter\)/u);
  assert.match(source, /visibilitychange[\s\S]*?visibilityState === "visible"[\s\S]*?renderStudyIntro\(\)/u);
  assert.match(source, /pageshow[\s\S]*?renderStudyIntro\(\)/u);
  assert.match(policy, /style-src[^;]*https:\/\/banglawebfonts\.pages\.dev/u);
  assert.match(policy, /font-src[^;]*https:\/\/banglawebfonts\.pages\.dev/u);
});

test("the chapter hero uses the supplied section cover across the whole card", () => {
  const page = readFileSync(new URL("../study-quiz.html", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../study-quiz.css", import.meta.url), "utf8");
  assert.doesNotMatch(page, /study-intro-mark/u);
  assert.match(styles, /\.study-intro\s*\{[^}]*height:\s*clamp\(430px, 44vw, 540px\)[^}]*background-image:\s*url\("\/assets\/images\/study_quiz_section_cover\.png"\)[^}]*background-position:\s*center top[^}]*background-size:\s*cover/s);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.study-intro\s*\{[^}]*height:\s*auto[^}]*aspect-ratio:\s*1672\s*\/\s*941[^}]*background-position:\s*center/s);
  assert.match(styles, /@media \(max-width: 430px\)[\s\S]*?\.study-intro\s*\{[^}]*padding:\s*16px[^}]*border-radius:\s*19px/s);
});
