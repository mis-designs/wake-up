const FIGURE_CORRECTIONS_BY_ID = new Map([
  ["q01131", "fig37"]
]);

function isMissingFigure(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return !normalized || ["0", "false", "null", "undefined"].includes(normalized);
}

export function applyQuizFigureCorrections(row) {
  if (!row || typeof row !== "object" || !isMissingFigure(row.figure)) return row;

  const id = String(row.id ?? "").trim().toLowerCase();
  const correctedFigure = FIGURE_CORRECTIONS_BY_ID.get(id);
  return correctedFigure ? { ...row, figure: correctedFigure } : row;
}

