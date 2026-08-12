import { normalizeExplanationFigureKey } from "./quiz-explanation-availability.mjs";
import {
  headMagicBookObject,
  isMagicBookStorageConfigured,
  isMissingMagicBookObject,
  readMagicBookObject
} from "./magicbook-storage.mjs";

const PUBLIC_ASSETS = {
  mg_logo: {
    path: "mg_logo.png",
    contentType: "image/png"
  },
  ourproduct: {
    path: "Figure/ourproduct.jpg",
    contentType: "image/jpeg"
  },
  quiz_opt_1: {
    path: "Figure/quiz_opt_1.jpg",
    contentType: "image/jpeg"
  },
  quiz_opt_2: {
    path: "Figure/quiz_opt_2.jpg",
    contentType: "image/jpeg"
  }
};

const IMAGE_CONTENT_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

function isSafeFilePart(value) {
  return value.length <= 120 && /^[a-zA-Z0-9._ ()-]+$/.test(value) && !value.includes("..");
}

export function normalizeExplanationFigure(value) {
  const figureKey = normalizeExplanationFigureKey(value);
  return /^fig\d+$/.test(figureKey) ? figureKey : "";
}

export function normalizeFigureAssetName(value) {
  const raw = String(value ?? "").normalize("NFKC").trim();
  if (!raw) return "";
  const clean = raw.split(/[?#]/, 1)[0].replace(/\\/g, "/");
  const basename = clean.split("/").pop() || clean;
  const match = basename.match(/^(?:fig[\s_-]*)?0*(\d+)(?:\.[a-z0-9]+)?$/i);
  return match ? `fig${Number(match[1])}` : "";
}

export function getExplanationAssetCandidates(figure, value, ext) {
  const normalizedFigure = normalizeExplanationFigure(figure);
  const normalizedValue = String(value ?? "").trim();
  const normalizedExt = String(ext || "").trim().toLowerCase();

  if (!normalizedFigure || normalizedValue !== "0" || !IMAGE_CONTENT_TYPES[normalizedExt]) return [];

  return [
    {
      path: `explanations/${normalizedFigure}.${normalizedExt}`,
      contentType: IMAGE_CONTENT_TYPES[normalizedExt]
    },
    {
      path: `explanations/${normalizedFigure}_0.${normalizedExt}`,
      contentType: IMAGE_CONTENT_TYPES[normalizedExt]
    },
    {
      path: `explanations/${normalizedFigure}_1.${normalizedExt}`,
      contentType: IMAGE_CONTENT_TYPES[normalizedExt]
    }
  ];
}

function getDynamicAsset(query = {}) {
  const kind = String(query.kind || "").trim();

  if (kind === "figure") {
    const figure = normalizeFigureAssetName(query.figure);
    if (!figure || !isSafeFilePart(figure)) return null;

    return {
      path: `Figure/${figure}.jpg`,
      contentType: "image/jpeg"
    };
  }

  if (kind === "explanation") {
    const figure = String(query.figure || "").trim();
    const value = String(query.value || "").trim();
    const ext = String(query.ext || "").trim().toLowerCase();

    if (!figure || !IMAGE_CONTENT_TYPES[ext]) return null;
    if (!isSafeFilePart(value)) return null;

    const candidates = getExplanationAssetCandidates(figure, value, ext);
    return candidates.length ? candidates : null;
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (!isMagicBookStorageConfigured()) {
    return res.status(500).json({ error: "missing_server_config" });
  }

  const name = String(req.query?.name || "").trim();
  const asset = PUBLIC_ASSETS[name] || getDynamicAsset(req.query);

  if (!asset) {
    return res.status(404).json({ error: "not_found" });
  }

  try {
    const candidates = Array.isArray(asset) ? asset : [asset];
    let selectedAsset = null;
    let selectedObject = null;

    for (const candidate of candidates) {
      try {
        selectedObject = req.method === "HEAD"
          ? await headMagicBookObject(candidate.path)
          : await readMagicBookObject(candidate.path);
        selectedAsset = candidate;
        break;
      } catch (error) {
        if (!isMissingMagicBookObject(error)) throw error;
      }
    }

    if (!selectedObject || !selectedAsset) return res.status(404).json({ error: "not_found" });

    if (req.method === "HEAD") {
      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
      return res.status(204).end();
    }

    res.setHeader("Content-Type", selectedAsset.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("X-Robots-Tag", "noindex, noimageindex");
    return res.send(selectedObject.buffer);
  } catch (err) {
    return res.status(500).json({ error: "server_error" });
  }
}
