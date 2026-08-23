import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const client = readFileSync(new URL("../script.js", import.meta.url), "utf8");

function functionSource(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

const checkContinuationSource = functionSource(
  client,
  "checkMagicBookScrollLoad",
  "observeMagicBookContinuationLoader"
);

function runContinuationCheck(overrides = {}) {
  let loadCount = 0;
  const viewer = {};
  const context = {
    currentBookViewer: {
      type: "chapter",
      chapter: 21,
      page: 1,
      isLoading: false,
      hasNext: true,
      loaderInView: true,
      ...overrides
    },
    document: {
      getElementById(id) {
        return id === "viewer" ? viewer : null;
      }
    },
    loadNextMagicBookPage() {
      loadCount += 1;
    },
    shouldLoadNextMagicBookPage() {
      return false;
    }
  };

  vm.runInNewContext(`${checkContinuationSource}\ncheckMagicBookScrollLoad();`, context);
  return loadCount;
}

test("late Magic Book chapters continue when the first-page loader is visible", () => {
  for (const chapter of [21, 22, 23, 24, 25]) {
    assert.equal(runContinuationCheck({ chapter }), 1, `chapter ${chapter} should request page 2`);
  }
});

test("Magic Book continuation remains bounded by visibility and request state", () => {
  assert.equal(runContinuationCheck({ loaderInView: false }), 0);
  assert.equal(runContinuationCheck({ isLoading: true }), 0);
  assert.equal(runContinuationCheck({ hasNext: false }), 0);
  assert.equal(runContinuationCheck({ type: null }), 0);
});
