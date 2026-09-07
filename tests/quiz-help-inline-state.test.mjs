import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../quiz-help.js", import.meta.url), "utf8");
function element() {
  const classes = new Set();
  return {
    children: [], attributes: {}, textContent: "", focusCount: 0,
    classList: {
      add(...values) { values.forEach(value => classes.add(value)); },
      remove(...values) { values.forEach(value => classes.delete(value)); },
      contains(value) { return classes.has(value); },
      toggle(value, on) { on ? classes.add(value) : classes.delete(value); }
    },
    setAttribute(key, value) { this.attributes[key] = value; },
    getAttribute(key) { return this.attributes[key]; },
    append(...items) { this.children.push(...items); },
    appendChild(item) { this.children.push(item); },
    replaceChildren(...items) { this.children = items; },
    querySelectorAll() { return this.children; },
    contains(item) { return this.children.includes(item); },
    addEventListener(event, fn) { this[event] = fn; },
    focus() { this.focusCount += 1; }
  };
}
function renderer() {
  let question = { id: "first", question: "Prima domanda" };
  const pending = new Map();
  const nodes = Object.fromEntries(["workspace", "wordDetail", "wordsList", "translationText", "translationStatus", "questionText"].map(key => [key, element()]));
  const context = vm.createContext({
    ...nodes, context: {}, document: { activeElement: null },
    currentQuestion: () => question,
    getQuestionHelp: row => new Promise((resolve, reject) => pending.set(row.id, { resolve, reject })),
    usableBanglaTranslation: value => value || "",
    stopWordAudio() {}, renderContext() {}, renderWords() {}, console: { warn() {} }
  });
  const start = source.indexOf("  async function render()");
  const end = source.indexOf('  questionText?.addEventListener("click"', start);
  vm.runInContext("let requestId = 0;\n" + source.slice(start, end), context);
  return { context, nodes, pending, select(id) { question = { id, question: id }; } };
}

test("changing question clears old content and late translations cannot replace the current one", async () => {
  const { context, nodes, pending, select } = renderer();
  nodes.translationText.textContent = "Old text";
  const first = context.render();
  assert.equal(nodes.translationText.textContent, "");
  assert.equal(nodes.workspace.attributes["aria-busy"], "true");
  select("second");
  const second = context.render();
  pending.get("second").resolve({ translation: "Second translation" });
  await second;
  pending.get("first").resolve({ translation: "Stale translation" });
  await first;
  assert.equal(nodes.translationText.textContent, "Second translation");
  assert.equal(nodes.workspace.attributes["aria-busy"], "false");
});

test("closing inline help invalidates loading and only restores focus from inside its panel", async () => {
  const { context, nodes, pending } = renderer();
  const loading = context.render();
  context.close();
  pending.get("first").resolve({ translation: "Late text" });
  await loading;
  assert.equal(nodes.translationText.textContent, "");
  assert.equal(nodes.workspace.classList.contains("hidden"), true);
  assert.equal(nodes.workspace.attributes["aria-busy"], "false");
  assert.equal(nodes.questionText.attributes["aria-expanded"], "false");
  assert.equal(nodes.questionText.focusCount, 0);
  const child = element();
  nodes.workspace.append(child);
  context.document.activeElement = child;
  context.close();
  assert.equal(nodes.questionText.focusCount, 1);
});

test("failed help can be retried and does not strand the inline panel in loading", async () => {
  const { context, nodes, pending } = renderer();
  const failed = context.render();
  pending.get("first").reject(new Error("offline"));
  await failed;
  assert.equal(nodes.workspace.attributes["aria-busy"], "false");
  assert.equal(nodes.translationStatus.textContent, "Traduzione non disponibile al momento.");
  const retry = context.render();
  pending.get("first").resolve({ translation: "Available translation" });
  await retry;
  assert.equal(nodes.translationText.textContent, "Available translation");
});

test("real keyword text opens and closes its meaning in the same panel", () => {
  const wordsList = element(), wordDetail = element();
  const context = vm.createContext({
    wordsList, wordDetail, stopWordAudio() {}, playBanglaWord() {},
    document: { createElement: element },
    window: { MagicItalianDisplay: { initialUppercase: text => text || "" } }
  });
  vm.runInContext(source.slice(source.indexOf("  function showWordDetail("), source.indexOf("  async function render()")), context);
  context.renderWords([{ italian: "Carreggiata", bangla: "রাস্তা", simpleIt: "Parte della strada", simpleBn: "রাস্তার অংশ" }]);
  const chip = wordsList.children[0];
  assert.equal(chip.children[0].textContent, "Carreggiata");
  assert.equal(chip.children.length, 1);
  chip.click();
  assert.equal(chip.attributes["aria-expanded"], "true");
  assert.equal(wordDetail.classList.contains("hidden"), false);
  assert.equal(wordDetail.children[2].textContent, "রাস্তার অংশ");
  chip.click();
  assert.equal(chip.attributes["aria-expanded"], "false");
  assert.equal(wordDetail.classList.contains("hidden"), true);
});
