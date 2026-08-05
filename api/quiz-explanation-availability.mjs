export function normalizeExplanationFigureKey(value) {
  const raw = String(value ?? "").normalize("NFKC").trim().toLowerCase();
  if (!raw || ["0", "false", "null", "undefined", "none", "nessuna"].includes(raw)) return "";

  const clean = raw.split(/[?#]/, 1)[0].replace(/\\/g, "/");
  const basename = clean.split("/").pop() || clean;
  const match = basename.match(/^(?:fig[\s_-]*)?0*(\d+)(?:\.[a-z0-9]+)?$/i);
  return match ? `fig${Number(match[1])}` : basename.replace(/\.[a-z0-9]+$/i, "");
}

export function getExplanationFigureFromObjectKey(value) {
  const key = String(value ?? "").normalize("NFKC").trim().replace(/\\/g, "/");
  const match = key.match(/^explanations\/(fig[\s_-]*0*\d+)(?:_[01])?\.(?:png|webp|jpe?g)$/i);
  return match ? normalizeExplanationFigureKey(match[1]) : "";
}

export function getExplanationFiguresFromObjectKeys(keys) {
  return [...new Set(
    (Array.isArray(keys) ? keys : [])
      .map(getExplanationFigureFromObjectKey)
      .filter(Boolean)
  )].sort((left, right) => Number(left.slice(3)) - Number(right.slice(3)));
}
