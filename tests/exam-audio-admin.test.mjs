import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { quizAudioCatalog } from "../api/quiz-audio-catalog.mjs";
import identityTools from "../quiz-audio-identity.cjs";

function element(tag = "div") {
  const classes = new Set();
  return {
    tag, children: [], dataset: {}, attributes: {}, style: { setProperty() {} },
    classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value), toggle(value, on) { on ? classes.add(value) : classes.delete(value); } },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, fn) { this[key] = fn; }
  };
}

function setup() {
  const nodes = new Map();
  const context = vm.createContext({
    document: { getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); }, createElement: element },
    window: { addEventListener() {} }, history: { replaceState(_state, _title, url) { context.url = url; } },
    QuizAudioIdentity: { normalizeFigure: identityTools.normalizeQuizAudioFigure, normalizeQuestion: identityTools.normalizeQuizAudioQuestion, VERSION: 2 },
    URLSearchParams, URL, console, clearInterval, setTimeout
  });
  const source = readFileSync(new URL("../aggiungi-spiegazioni.js", import.meta.url), "utf8").replace(/load\(\);\s*$/, "");
  vm.runInContext(source, context);
  context.fixtureRows = quizAudioCatalog.rows.map(row => ({ ...row, identity: quizAudioCatalog.identityFor(row), quizKey: quizAudioCatalog.identityFor(row).quizKey }));
  vm.runInContext(`state.chapters = [...Array(25)].map((_, i) => ({ key: String(i + 1), name: 'Capitolo ' + (i + 1), questions: fixtureRows.filter(row => row.chapter === i + 1) })); state.chapters.push({ key: '0', name: 'Exam 80', questions: fixtureRows.filter(row => row.chapter === 0) });`, context);
  context.createQuestionHelpDisclosure = () => ({ button: element("button"), panel: element() });
  context.createItalianQuestionPlayer = () => element("button");
  context.createAudioPlayer = () => element("audio");
  return { context, nodes };
}

test("Exam 80 button opens all 80 real questions, figures and the shared recorder payload", async () => {
  const { context, nodes } = setup();
  context.renderChapters();
  const buttons = nodes.get("audioAdminChapters").children;
  assert.equal(buttons.length, 27); // Review + 25 chapters + Exam.
  assert.equal(buttons.at(-1).children[0].textContent, "Exam 80");
  await buttons.at(-1).click();
  assert.equal(context.url, "/aggiungi-spiegazioni?exam=80");
  const section = nodes.get("audioAdminQuestions");
  assert.equal(section.children[0].children[0].textContent, "Exam 80");
  assert.equal(section.children[2].children.length, 80);
  const figures = section.children[2].children.flatMap(row => row.children[0].children).filter(node => node.tag === "img");
  assert.ok(figures.length > 0);
  assert.ok(figures.every(image => image.src.includes("presentation=numberless-v1")));
  const payload = vm.runInContext("quizAudioPayload(state.chapters[25].questions[0])", context);
  assert.match(payload.questionId, /^exam_q/);
  assert.equal(payload.quizAudioIdentityVersion, 2);
  vm.runInContext('state.query = "testo sicuramente assente"; renderChapter();', context);
  assert.equal(section.children[2].children[0].textContent, "Nessun quiz corrisponde al filtro.");
  vm.runInContext('state.query = ""; state.filter = "available"; renderChapter();', context);
  assert.equal(section.children[2].children.length, 1);
  vm.runInContext('state.audioKeys.add(state.chapters[25].questions[0].quizKey); renderChapter();', context);
  assert.ok(section.children[2].children[0].className.includes("audio-admin-question"));
  await context.closeChapter();
  assert.equal(context.url, "/aggiungi-spiegazioni");
});

test("section changes preserve a recording when cancelled and block navigation during upload", async () => {
  const { context } = setup();
  await context.openChapter(25);
  vm.runInContext('state.inline = { saving: true };', context);
  await context.closeChapter();
  assert.equal(context.url, "/aggiungi-spiegazioni?exam=80");
  context.openDialog = async () => false;
  vm.runInContext('state.inline = { saving: false, phase: "paused", chunks: [] };', context);
  await context.openChapter(0);
  assert.equal(context.url, "/aggiungi-spiegazioni?exam=80");
  assert.equal(vm.runInContext("state.selected", context), 25);
});
