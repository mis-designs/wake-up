import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLiquidProgress } from "../native-liquid-progress.mjs";

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
test("liquid remains a native-only decorative renderer of real progress", () => {
  const source = read("native-liquid-progress.mjs");
  const shell = read("android-study-shell.js");
  assert.match(shell, /html.classList.contains\("android-webview"\)/);
  assert.match(shell, /liquid.setValue\(value\)/);
  assert.match(shell, /liquid.setValue\(null\)/);
  assert.doesNotMatch(source, /fetch\(|setInterval\(|iconify|gulp/);
  assert.match(source, /1000 \/ 24/);
  assert.match(source, /value > 0 && value < 100/);
  assert.match(source, /deleteProgram/);
  assert.match(source, /webglcontextlost/);
  assert.match(shell, /!doc.hidden && !dock.inert && !forcedColors.matches/);
});

test("unsupported WebGL retains truthful static fill and removable listeners", () => {
  const listeners = new Map(), properties = new Map();
  const canvas = { className: "", setAttribute() {}, getContext: () => null,
    addEventListener(name, fn) { listeners.set(`canvas:${name}`, fn); },
    removeEventListener(name) { listeners.delete(`canvas:${name}`); }, remove() {} };
  const win = { cancelAnimationFrame() {}, addEventListener(name, fn) { listeners.set(`window:${name}`, fn); }, removeEventListener(name) { listeners.delete(`window:${name}`); } };
  const track = { ownerDocument: { createElement: () => canvas, defaultView: win }, prepend() {},
    style: { setProperty(name, value) { properties.set(name, value); } },
    addEventListener(name, fn) { listeners.set(`track:${name}`, fn); }, removeEventListener(name) { listeners.delete(`track:${name}`); }, removeAttribute() {} };
  const liquid = createLiquidProgress(track);
  liquid.setActive(true, true);
  for (const [value, expected] of [[null,"0%"],[0,"0%"],[40,"40%"],[100,"100%"],[200,"100%"],[-8,"0%"],[NaN,"0%"]]) {
    liquid.setValue(value); assert.equal(properties.get("--native-progress"), expected);
  }
  assert.equal(listeners.size, 4);
  liquid.destroy(); assert.equal(listeners.size, 0);
});

test("new shader ships in the offline asset cache", () => {
  assert.match(read("service-worker.js"), /\/native-liquid-progress\.mjs\?v=1/);
});
