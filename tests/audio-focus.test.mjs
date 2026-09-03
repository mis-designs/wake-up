import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../audio-focus.js", import.meta.url), "utf8");

function createCoordinator() {
  const context = {};
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.MagicAudioFocus;
}

function createExplanation({ resume } = {}) {
  const state = {
    playing: true,
    canResume: true,
    pauses: [],
    resumes: 0,
    suspended: []
  };
  const adapter = {
    isPlaying: () => state.playing,
    canResume: () => state.canResume,
    pause: reason => {
      state.playing = false;
      state.pauses.push(reason);
    },
    resume: async reason => {
      state.resumes += 1;
      if (resume) await resume(reason, state);
      state.playing = true;
    },
    setSuspended: value => state.suspended.push(value)
  };
  return { adapter, state };
}

test("a completed TTS resumes the explanation from its paused player", async () => {
  const focus = createCoordinator();
  const { adapter, state } = createExplanation();
  focus.setResumable(adapter);

  const token = focus.beginTransient({ key: "word" });
  assert.equal(state.playing, false);
  assert.deepEqual(state.pauses, ["transient"]);
  assert.deepEqual(state.suspended, [true]);

  assert.equal(await focus.completeTransient(token), true);
  assert.equal(state.playing, true);
  assert.equal(state.resumes, 1);
  assert.deepEqual(state.suspended, [true, false]);
});

test("a manually stopped TTS leaves the explanation paused", async () => {
  const focus = createCoordinator();
  const { adapter, state } = createExplanation();
  let stoppedWith = "";
  focus.setResumable(adapter);

  const token = focus.beginTransient({
    key: "question",
    stop: reason => { stoppedWith = reason; }
  });
  assert.equal(await focus.cancelTransient(token, { reason: "manual" }), true);
  assert.equal(stoppedWith, "manual");
  assert.equal(state.playing, false);
  assert.equal(state.resumes, 0);
  assert.deepEqual(state.suspended, [true, false]);
});

test("an explicit explanation pause during an interruption suppresses automatic resume", async () => {
  const focus = createCoordinator();
  const { adapter, state } = createExplanation();
  focus.setResumable(adapter);

  const token = focus.beginTransient({ key: "question" });
  focus.markManualPause(adapter);

  assert.equal(await focus.completeTransient(token), false);
  assert.equal(state.playing, false);
  assert.equal(state.resumes, 0);
});

test("the latest simultaneous TTS owns focus and resumes only once", async () => {
  const focus = createCoordinator();
  const { adapter, state } = createExplanation();
  const stopped = [];
  focus.setResumable(adapter);

  const first = focus.beginTransient({ key: "italian", stop: reason => stopped.push(`it:${reason}`) });
  const second = focus.beginTransient({ key: "bangla", stop: reason => stopped.push(`bn:${reason}`) });

  assert.deepEqual(stopped, ["it:superseded"]);
  assert.equal(await focus.completeTransient(first), false);
  assert.equal(state.resumes, 0);
  assert.equal(await focus.completeTransient(second), true);
  assert.equal(state.resumes, 1);
});

test("a direct explanation request cancels TTS without a later automatic resume", async () => {
  const focus = createCoordinator();
  const { adapter, state } = createExplanation();
  const stopped = [];
  focus.setResumable(adapter);

  const token = focus.beginTransient({ key: "word", stop: reason => stopped.push(reason) });
  assert.equal(focus.claimResumable(adapter), true);
  assert.deepEqual(stopped, ["resumable-request"]);
  assert.equal(await focus.completeTransient(token), false);
  assert.equal(state.resumes, 0);
});

test("claiming a different explanation pauses the previous resumable source", () => {
  const focus = createCoordinator();
  const first = createExplanation();
  const second = createExplanation();
  focus.setResumable(first.adapter);

  focus.claimResumable(second.adapter);

  assert.equal(first.state.playing, false);
  assert.deepEqual(first.state.pauses, ["resumable-changed"]);
  assert.equal(second.state.playing, true);
});

test("a second TTS wins a pending asynchronous resume without overlapping", async () => {
  let releaseResume;
  const resumeGate = new Promise(resolve => { releaseResume = resolve; });
  const focus = createCoordinator();
  const { adapter, state } = createExplanation({ resume: () => resumeGate });
  focus.setResumable(adapter);

  const first = focus.beginTransient({ key: "first" });
  const firstCompletion = focus.completeTransient(first);
  await Promise.resolve();
  const second = focus.beginTransient({ key: "second" });
  releaseResume();

  assert.equal(await firstCompletion, false);
  assert.equal(state.playing, false);
  assert.ok(state.pauses.includes("stale-resume"));
  assert.equal(await focus.completeTransient(second), true);
  assert.equal(state.playing, true);
  assert.equal(state.resumes, 2);
});
