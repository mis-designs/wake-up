const EXPLANATION_FIELDS = [
  "explanations",
  "Explanations",
  "explanation",
  "Explanation"
];

export function getExplanationMarker(row) {
  if (!row || typeof row !== "object") return undefined;
  let emptyMarker;
  for (const field of EXPLANATION_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(row, field)) continue;
    const value = row[field];
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
    if (emptyMarker === undefined) emptyMarker = value;
  }
  return emptyMarker;
}

export function hasExplanationMarker(row) {
  const marker = getExplanationMarker(row);
  return marker !== null && marker !== undefined && String(marker).trim() !== "";
}

export function normalizeExplanationFigureKey(value) {
  const raw = String(value ?? "").normalize("NFKC").trim().toLowerCase();
  if (!raw || ["0", "false", "null", "undefined", "none", "nessuna"].includes(raw)) return "";

  const clean = raw.split(/[?#]/, 1)[0].replace(/\\/g, "/");
  const basename = clean.split("/").pop() || clean;
  const match = basename.match(/^(?:fig[\s_-]*)?0*(\d+)(?:\.[a-z0-9]+)?$/i);
  return match ? `fig${Number(match[1])}` : basename.replace(/\.[a-z0-9]+$/i, "");
}

export function applyExplanationAvailabilityByFigure(rows) {
  if (!Array.isArray(rows)) return [];

  const availableFigures = new Set(
    rows
      .filter(hasExplanationMarker)
      .map(row => normalizeExplanationFigureKey(row.figure))
      .filter(Boolean)
  );

  if (!availableFigures.size) return rows;

  return rows.map(row => {
    const figureKey = normalizeExplanationFigureKey(row?.figure);
    if (!figureKey || !availableFigures.has(figureKey)) return row;
    // The database value is only an availability marker. Explanation assets
    // are shared by figure and the asset endpoint uses the canonical marker 0.
    if (row.explanations === 0) return row;
    return { ...row, explanations: 0 };
  });
}
