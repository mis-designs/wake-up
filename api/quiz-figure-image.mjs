import sharp from "sharp";

const MAX_INPUT_PIXELS = 50_000_000;
export const QUIZ_FIGURE_PRESENTATION_VERSION = "numberless-v2";

// This is a search window, never a painted rectangle. Only isolated, neutral
// digit-sized components on the top label line can be removed. A component
// touching the search boundary or containing sign colours is preserved.
function numberRegions(data, width, height, expectedDigits) {
  const scanWidth = Math.ceil(width * 0.24);
  const scanHeight = Math.ceil(height * 0.20);
  const labels = new Int32Array(scanWidth * scanHeight);
  const queue = new Int32Array(labels.length);
  const candidates = [];
  const isInk = index => {
    const offset = (Math.floor(index / scanWidth) * width + index % scanWidth) * 3;
    return Math.min(data[offset], data[offset + 1], data[offset + 2]) < 245;
  };
  let label = 0;
  for (let seed = 0; seed < labels.length; seed += 1) {
    if (labels[seed] || !isInk(seed)) continue;
    label += 1;
    labels[seed] = label;
    let head = 0, tail = 1;
    queue[0] = seed;
    let left = scanWidth, right = 0, top = scanHeight, bottom = 0;
    let neutral = true, dark = false;
    while (head < tail) {
      const index = queue[head++];
      const x = index % scanWidth, y = Math.floor(index / scanWidth);
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      const offset = (y * width + x) * 3;
      const min = Math.min(data[offset], data[offset + 1], data[offset + 2]);
      const max = Math.max(data[offset], data[offset + 1], data[offset + 2]);
      if (max - min > 24) neutral = false;
      if (max < 100) dark = true;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= scanWidth || ny >= scanHeight) continue;
          const next = ny * scanWidth + nx;
          if (labels[next] || !isInk(next)) continue;
          labels[next] = label;
          queue[tail++] = next;
        }
      }
    }
    const w = right - left + 1, h = bottom - top + 1;
    if (neutral && dark && right < scanWidth - 1 && bottom < scanHeight - 1
      && top <= height * 0.10 && left <= width * 0.18
      && h >= height * 0.025 && h <= height * 0.12
      && w >= width * 0.005 && w <= width * 0.08 * (expectedDigits || 1)
      && w / h >= 0.12 && w / h <= (expectedDigits || 1) * 1.1) {
      // At small source resolutions, antialiasing may join adjacent digits.
      const digits = Math.max(1, Math.round(w / h / 0.7));
      candidates.push({ label, left, right, top, bottom, digits });
    }
  }
  if (!candidates.length) return [];
  candidates.sort((a, b) => a.top - b.top || a.left - b.left);
  const first = candidates[0];
  const lineHeight = first.bottom - first.top + 1;
  const line = candidates.filter(item => Math.abs(item.top - first.top) <= lineHeight * 0.2
    && Math.abs(item.bottom - first.bottom) <= lineHeight * 0.2).sort((a, b) => a.left - b.left);
  const detectedDigits = line.reduce((sum, item) => sum + item.digits, 0);
  if (detectedDigits > 3 || (expectedDigits && detectedDigits !== expectedDigits)) return [];
  for (let i = 1; i < line.length; i += 1) {
    if (line[i].left - line[i - 1].right > lineHeight * 0.6) return [];
  }
  const padding = Math.max(1, Math.round(height / 600));
  const selected = new Set(line.map(item => item.label));
  const regions = line.map(item => ({
    left: Math.max(0, item.left - padding), right: Math.min(scanWidth - 1, item.right + padding),
    top: Math.max(0, item.top - padding), bottom: Math.min(scanHeight - 1, item.bottom + padding)
  }));
  for (const region of regions) {
    for (let y = region.top; y <= region.bottom; y += 1) {
      for (let x = region.left; x <= region.right; x += 1) {
        const other = labels[y * scanWidth + x];
        if (other && !selected.has(other)) {
          const offset = (y * width + x) * 3;
          const min = Math.min(data[offset], data[offset + 1], data[offset + 2]);
          const max = Math.max(data[offset], data[offset + 1], data[offset + 2]);
          // Light neutral JPEG ringing inside a digit box is not another
          // drawing. Dark or coloured neighbouring ink still blocks removal.
          if (min < 200 || max - min > 24) return [];
        }
      }
    }
  }
  return regions;
}

export async function renderNumberlessQuizFigure(input, { figure = "" } = {}) {
  const image = sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).autoOrient();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || !["jpeg", "png"].includes(metadata.format)) {
    const error = new Error("invalid_quiz_figure_image");
    error.statusCode = 500;
    throw error;
  }
  const { data, info } = await image.flatten({ background: "#ffffff" }).toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const digits = String(figure).match(/^fig(\d{1,3})$/)?.[1].length;
  const regions = numberRegions(data, info.width, info.height, digits);
  for (const region of regions) {
    for (let y = region.top; y <= region.bottom; y += 1) {
      data.fill(255, (y * info.width + region.left) * 3, (y * info.width + region.right + 1) * 3);
    }
  }
  // Lossless output preserves every decoded source pixel outside the digits.
  // If the label cannot be separated confidently, preserve the whole figure.
  return sharp(data, { raw: info }).png().toBuffer();
}
