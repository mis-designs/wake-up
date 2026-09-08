import test from "node:test";
import assert from "node:assert/strict";
import { ChapterDial, angleDelta, clampChapter, dialLabelPosition, progressValue } from "../android-rotary-model.mjs";

test("chapter selection is integer bounded, never wraps", () => {
  assert.equal(clampChapter(26), 25);
  assert.equal(clampChapter(0), 1);
  assert.equal(clampChapter(NaN), 1);
  const dial = new ChapterDial(24);
  assert.deepEqual(dial.select(25), { selected: 25, preview: 25, changed: true, boundary: false });
  assert.deepEqual(dial.select(26), { selected: 25, preview: 25, changed: false, boundary: true });
});

test("rotary angle unwraps at the seam in both directions", () => {
  assert.equal(angleDelta(179, -178), 3);
  assert.equal(angleDelta(-179, 178), -3);
  const dial = new ChapterDial(3);
  dial.begin(10, 179);
  assert.equal(dial.move(10, -148).selected, 4);
});

test("one pointer owns the wheel, interruption preserves last selection", () => {
  const dial = new ChapterDial(8);
  assert.equal(dial.begin(1, 180), true);
  assert.equal(dial.begin(2, 100), false);
  assert.equal(dial.move(2, 200), null);
  assert.equal(dial.end(2), false);
  assert.equal(dial.move(1, 213).selected, 9);
  assert.equal(dial.end(1), true);
  assert.equal(dial.selected, 9);
  assert.equal(dial.move(1, 240), null);
});

test("wheel numbers follow the finger and ascend from top to bottom", () => {
  assert.ok(dialLabelPosition(7, 8).y < 150);
  assert.ok(dialLabelPosition(9, 8).y > 150);
  assert.ok(Math.abs(dialLabelPosition(8, 8).y - 150) < .001);
  assert.equal(dialLabelPosition(8, 8).x, 25);
  const dial = new ChapterDial(8);
  dial.begin(1, 180);
  const before = dialLabelPosition(9, 8);
  const result = dial.move(1, 213);
  const after = dialLabelPosition(9, result.preview);
  assert.equal(after.rotation - before.rotation, 33, 'number moves with the clockwise finger, not against it');
  assert.equal(result.selected, 9);
});

test("detent hysteresis rejects tremor around the midpoint without losing reverse travel", () => {
  const dial = new ChapterDial(8);
  dial.begin(1, 0);
  assert.equal(dial.move(1, .6 * 33).selected, 9);
  for (const position of [.51, .49, .52, .47]) {
    assert.equal(dial.move(1, position * 33).changed, false);
    assert.equal(dial.selected, 9);
  }
  assert.equal(dial.move(1, .4 * 33).selected, 8);
});

test("end-stop emits boundary only on entering and resists without dead travel", () => {
  const dial = new ChapterDial(25);
  dial.begin(1, 0);
  assert.equal(dial.move(1, 8).boundary, true);
  assert.equal(dial.move(1, 20).boundary, false);
  assert.equal(dial.move(1, 30).selected, 25);
  assert.equal(dial.move(1, -10).selected, 24);
  dial.end(1);
  dial.select(1);
  dial.begin(2, 0);
  assert.equal(dial.move(2, -8).boundary, true);
});

test("progress never invents completion when missing or catalog unavailable", () => {
  assert.equal(progressValue({ summary: { quizCoveragePct: 50 } }), null);
  assert.equal(progressValue({ summary: { quizCoveragePct: null }, dataQuality: { catalogQuizCount: 100 } }), null);
  assert.equal(progressValue({ summary: { quizCoveragePct: 0 }, dataQuality: { catalogQuizCount: 100 } }), 0);
  assert.equal(progressValue({ summary: { quizCoveragePct: 62.4 }, dataQuality: { catalogQuizCount: 100 } }), 62.4);
  assert.equal(progressValue({ summary: { quizCoveragePct: 120 }, dataQuality: { catalogQuizCount: 100 } }), 100);
});
