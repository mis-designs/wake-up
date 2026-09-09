// Source: data/patente/quiz-help-runtime-v2.json, words[id][1].
// Pedestrian crossing uses the first slash-delimited meaning, unchanged.
// Existing numberless figures visually verified on 2026-09-10. No quiz answers.
export const LOGIN_SIGNS = Object.freeze([
  Object.freeze({ figure: "fig40", wordId: "w_dare-precedenza", title: "Dare precedenza", meaning: "অগ্রাধিকার দিতে হবে" }),
  Object.freeze({ figure: "fig41", wordId: "w_stop", title: "Stop", meaning: "স্টপ/পুরো থামা" }),
  Object.freeze({ figure: "fig218", wordId: "w_attraversamento-pedonale", title: "Attraversamento pedonale", meaning: "পথচারী পারাপার" })
]);
export const SIGN_HOLD_MS = 4600;
const ENTRANCES = Object.freeze([
  Object.freeze({ x: -7, y: 10, angle: -3 }),
  Object.freeze({ x: 6, y: 8, angle: 2.5 }),
  Object.freeze({ x: 0, y: 12, angle: -.8 }),
  Object.freeze({ x: -4, y: 6, angle: 1.5 })
]);
export function signEntrance(step) { return ENTRANCES[Math.abs(Math.trunc(step)) % ENTRANCES.length]; }
export function signAssetUrl(sign) {
  return `/api/asset?${new URLSearchParams({ kind: "figure", figure: sign.figure, presentation: "numberless-v2" })}`;
}
