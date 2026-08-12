import sharp from "sharp";

export const BOOK_WATERMARK_TEXT = "TMM Bangla Patente";
const MAX_INPUT_PIXELS = 50_000_000;
// Pre-rendered transparent tile containing only BOOK_WATERMARK_TEXT. Keeping
// the glyphs as pixels avoids font lookup during a serverless cold start.
const BOOK_WATERMARK_TILE = Buffer.from(
  "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",
  "base64"
);

async function getWatermarkTile(width, height) {
  const maxWidth = 520;
  const maxHeight = 220;
  const scale = Math.min(1, Number(width) / maxWidth, Number(height) / maxHeight);
  if (scale >= 1) return BOOK_WATERMARK_TILE;
  return sharp(BOOK_WATERMARK_TILE)
    .resize({
      width: Math.max(1, Math.floor(maxWidth * scale)),
      height: Math.max(1, Math.floor(maxHeight * scale)),
      fit: "fill"
    })
    .png({ palette: true, colors: 32, compressionLevel: 9 })
    .toBuffer();
}

export async function watermarkMagicBookPage(input) {
  const image = sharp(input, {
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS
  }).autoOrient();
  const metadata = await image.metadata();

  if (metadata.format !== "jpeg" || !metadata.width || !metadata.height) {
    const error = new Error("invalid_private_book_image");
    error.statusCode = 500;
    throw error;
  }

  const watermarkTile = await getWatermarkTile(metadata.width, metadata.height);
  return image
    .composite([{ input: watermarkTile, tile: true, gravity: "northwest", blend: "over" }])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
}
