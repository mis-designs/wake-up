import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { quizAudioCatalog, quizAudioLegacyRegistry } from "../api/quiz-audio-catalog.mjs";
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
  context.realCreateAudioPlayer = context.createAudioPlayer;
  context.createItalianQuestionPlayer = () => element("button");
  context.createAudioPlayer = () => element("audio");
  return { context, nodes };
}

test("Admin and legacy players keep shared icons, accessible playback state, speed and seeking", () => {
  const { context } = setup();
  const audios = [];
  context.Audio = class {
    constructor() { this.events = {}; this.paused = true; this.duration = 100; this.currentTime = 0; audios.push(this); }
    addEventListener(name, callback) { this.events[name] = callback; }
  };
  context.requestAnimationFrame = () => 1;
  context.cancelAnimationFrame = () => {};
  for (const legacy of [false, true]) {
    const player = context.realCreateAudioPlayer({}, { legacy });
    const [play, progress, speed] = player.children;
    const audio = audios.at(-1);
    assert.match(play.innerHTML, /audio-player-icon--play[\s\S]*audio-player-icon--pause/);
    assert.equal(play.attributes["aria-label"], "Riproduci spiegazione");
    audio.paused = false;
    audio.events.play();
    assert.ok(player.classList.contains("is-playing"));
    assert.ok(play.classList.contains("is-playing"));
    assert.equal(play.attributes["aria-label"], "Metti in pausa la spiegazione");
    audio.events.pause();
    assert.equal(player.classList.contains("is-playing"), false);
    assert.equal(play.attributes["aria-pressed"], "false");
    for (const expected of [0.8, 1, 1.25, 1.5, 2, 1, 0.8, 1, 1.25, 1.5, 2, 1]) {
      speed.click();
      assert.equal(audio.playbackRate, expected);
      assert.equal(speed.textContent, `${String(expected).replace('.', ',')}×`);
    }
    progress.value = "60";
    progress.input();
    assert.equal(audio.currentTime, 60);
    audio.events.ended();
    assert.equal(progress.value, "0");
  }
});

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
  assert.ok(figures.every(image => image.src.includes("presentation=numberless-v2")));
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

test("chapter progress counts 70 stored recordings across current, previous and safe legacy keys", () => {
  const { context } = setup();
  const rows = context.fixtureRows.filter(row => row.chapter === 1);
  // Reproduce a mixed historical database, not a claim about production data.
  const recorded = rows.filter(row => !["cap1_q12", "cap1_q72"].includes(row.id));
  context.registryFixture = quizAudioLegacyRegistry;
  context.storedKeys = recorded.map((row, index) => index < 35
    ? row.identity.previousQuizKeys[0] || row.quizKey
    : row.identity.legacyQuizKey);
  vm.runInContext(`
    state.collisionRegistry = registryFixture;
    state.audioKeys = new Set(storedKeys);
    state.chapters[0].questions.forEach(row => {
      const candidates = state.collisionRegistry.collisions[row.identity.legacyQuizKey]?.candidates || [];
      row.identity.legacySafe = row.identity.legacySafe && candidates.length <= 1;
    });
  `, context);
  assert.equal(vm.runInContext("state.chapters[0].questions.filter(row => isIdentityAvailable(row.identity)).length", context), 70);
});
