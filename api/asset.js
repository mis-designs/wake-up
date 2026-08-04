import { normalizeExplanationFigureKey } from "./quiz-explanation-availability.mjs";

const BASE_URL = process.env.R2_BASE_URL;

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
    const figure = String(query.figure || "").trim();
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
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (!BASE_URL) {
    return res.status(500).json({ error: "missing_server_config" });
  }

  const name = String(req.query?.name || "").trim();
  const asset = PUBLIC_ASSETS[name] || getDynamicAsset(req.query);

  if (!asset) {
    return res.status(404).json({ error: "not_found" });
  }

  try {
    const candidates = Array.isArray(asset) ? asset : [asset];
    let response = null;
    let selectedAsset = null;

    for (const candidate of candidates) {
      const url = new URL(candidate.path, `${BASE_URL}/`).toString();
      const candidateResponse = await fetch(url);
      if (candidateResponse.ok) {
        response = candidateResponse;
        selectedAsset = candidate;
        break;
      }
    }

    if (!response || !selectedAsset) return res.status(404).json({ error: "not_found" });

    const buffer = await response.arrayBuffer();

    if (!buffer || buffer.byteLength === 0) {
      return res.status(500).json({ error: "empty_file" });
    }

    res.setHeader("Content-Type", selectedAsset.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
    return res.send(Buffer.from(buffer));
  } catch (err) {
    return res.status(500).json({ error: "server_error" });
  }
}
