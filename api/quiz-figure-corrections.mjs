const FIGURE_CORRECTIONS_BY_ID = new Map([
  ["q01131", "fig37"]
]);

export function applyQuizFigureCorrections(row) {
  if (!row || typeof row !== "object") return row;

  const id = String(row.id ?? "").trim().toLowerCase();
  const correctedFigure = FIGURE_CORRECTIONS_BY_ID.get(id);
  if (!correctedFigure || row.figure === correctedFigure) return row;

  // Corrections in this map are authoritative. Some catalog rows contain a
  // non-empty legacy value (for example "37" or an old image path): the audio
  // identity normalizes it correctly, while the figure endpoint needs the
  // canonical R2 basename.
  return { ...row, figure: correctedFigure };
}
