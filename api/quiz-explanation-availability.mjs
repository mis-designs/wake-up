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

export function explanationFilesFromObjects(objects) {
  const files = {};
  const order = file => (/_\d\./.test(file) ? (file.includes('_0.') ? 10 : 20) : 0)
    + ['webp', 'png', 'jpg', 'jpeg'].indexOf(file.split('.').pop());
  for (const object of objects) {
    // Only exact paths the existing public image endpoint can serve.
    const match = String(object.Key || '').match(/^explanations\/(fig[1-9]\d*(?:_[01])?\.(?:webp|png|jpg|jpeg))$/);
    if (!match) continue;
    const file = match[1], figure = file.match(/^fig\d+/)[0];
    if (!files[figure] || order(file) < order(files[figure].file)) {
      const time = new Date(object.LastModified || 0).getTime();
      files[figure] = { file, version: Number.isFinite(time) ? time : 0 };
    }
  }
  return files;
}

// A listing may prove absence only in the same account/bucket that serves images.
export function explanationListingMatchesAssets(env = process.env) {
  const listingBucket = env.EXPLANATION_R2_BUCKET || env.R2_BUCKET_NAME || env.R2_BUCKET || env.QUIZ_AUDIO_R2_BUCKET;
  const listingAccount = env.EXPLANATION_R2_ACCOUNT_ID || env.R2_ACCOUNT_ID || env.QUIZ_AUDIO_R2_ACCOUNT_ID;
  const bucket = String(env.BOOK_R2_BUCKET || "").trim();
  const account = String(env.BOOK_R2_ACCOUNT_ID || "").trim();
  return Boolean(bucket && account && listingBucket === bucket && listingAccount === account);
}
