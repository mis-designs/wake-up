const FIGURE_CORRECTIONS_BY_ID = new Map([
  ["q01131", "fig37"]
]);

function normalizeQuestion(value) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase();
}

function getFigureCorrection(row) {
  const id = String(row?.id ?? "").trim().toLowerCase();
  const byId = FIGURE_CORRECTIONS_BY_ID.get(id);
  if (byId) return byId;

  const question = normalizeQuestion(row?.question);
  if (question.includes("forte vento laterale") && question.includes("entrata delle gallerie")) {
    return "fig37";
  }
  return "";
}

export function applyQuizFigureCorrections(row) {
  if (!row || typeof row !== "object") return row;

  const correctedFigure = getFigureCorrection(row);
  if (!correctedFigure || row.figure === correctedFigure) return row;

  // Corrections in this map are authoritative. Some catalog rows contain a
  // non-empty legacy value (for example "37" or an old image path): the audio
  // identity normalizes it correctly, while the figure endpoint needs the
  // canonical R2 basename.
  return { ...row, figure: correctedFigure };
}
