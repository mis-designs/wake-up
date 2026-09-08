export const MIN_CHAPTER = 1;
export const MAX_CHAPTER = 25;
export const DETENT_DEGREES = 33;
export const clampChapter = value => Math.max(MIN_CHAPTER, Math.min(MAX_CHAPTER, Math.round(Number(value) || 1)));

export function angleDelta(previous, next) {
  return ((next - previous + 540) % 360) - 180;
}

// Labels follow the finger: lower chapters above the selection, higher below.
export function dialLabelPosition(chapter, preview) {
  const degrees = 180 - (chapter - preview) * DETENT_DEGREES;
  const radians = degrees * Math.PI / 180;
  return { x: 150 + 125 * Math.cos(radians), y: 150 + 125 * Math.sin(radians), rotation: degrees - 180 };
}

// One pointer owns a gesture. No wrapping, inertia, timers, or navigation side effects.
export class ChapterDial {
  constructor(value = 1) { this.selected = clampChapter(value); this.gesture = null; }
  select(value) {
    const next = clampChapter(value);
    const changed = next !== this.selected;
    this.selected = next;
    return { selected: next, preview: next, changed, boundary: value < MIN_CHAPTER || value > MAX_CHAPTER };
  }
  begin(pointerId, angle) {
    if (this.gesture) return false;
    this.gesture = { pointerId, angle, value: this.selected, edge: 0 };
    return true;
  }
  move(pointerId, angle) {
    const g = this.gesture;
    if (!g || g.pointerId !== pointerId) return null;
    g.value += angleDelta(g.angle, angle) / DETENT_DEGREES;
    g.angle = angle;
    // A little resistance at either end, without accumulating dead travel.
    g.value = Math.max(MIN_CHAPTER - .3, Math.min(MAX_CHAPTER + .3, g.value));
    const edge = g.value < MIN_CHAPTER - .12 ? -1 : g.value > MAX_CHAPTER + .12 ? 1 : 0;
    // A small detent deadband prevents tiny finger tremors from selecting/buzzing
    // repeatedly on either side of the same half-step.
    const result = this.select(Math.abs(g.value - this.selected) >= .58 ? g.value : this.selected);
    result.boundary = edge !== 0 && edge !== g.edge;
    result.preview = g.value;
    g.edge = edge;
    return result;
  }
  end(pointerId) {
    if (!this.gesture || (pointerId !== undefined && pointerId !== this.gesture.pointerId)) return false;
    this.gesture = null;
    return true;
  }
}

export function progressValue(model) {
  const value = model?.summary?.quizCoveragePct;
  const catalog = Number(model?.dataQuality?.catalogQuizCount);
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) || !(catalog > 0)) return null;
  return Math.max(0, Math.min(100, Number(value)));
}
