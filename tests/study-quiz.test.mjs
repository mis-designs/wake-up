import test from "node:test";
import assert from "node:assert/strict";
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

test("study chapter picker uses the layered performance-green visual system", () => {
  const page = readFileSync(new URL("../study-quiz.html", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../study-quiz.css", import.meta.url), "utf8");
  assert.match(page, /Scegli cosa <em>studiare<\/em>/);
  assert.match(styles, /\.study-intro::before/);
  assert.match(styles, /\.study-intro::after/);
  assert.match(styles, /background-image:\s*linear-gradient[\s\S]*?background-size:\s*68px 68px/);
  assert.match(styles, /\.study-chapter::before/);
  assert.match(styles, /--lime:\s*#67f528/);
  assert.doesNotMatch(styles, /\.study-intro\s*\{[^}]*background:\s*#[0-9a-f]{3,8}\s*;/i);
});
