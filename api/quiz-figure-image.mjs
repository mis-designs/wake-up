import sharp from "sharp";

const MAX_INPUT_PIXELS = 50_000_000;

export const QUIZ_FIGURE_PRESENTATION_VERSION = "numberless-v1";
// The catalog prints its identifier inside this blank upper-left area. Ratios
// are applied to source pixels, so alternate resolutions keep the same crop.
export const QUIZ_FIGURE_NUMBER_MASK = Object.freeze({
  leftRatio: 0,
  topRatio: 0,
  widthRatio: 0.24,
  heightRatio: 0.20,
  background: "#ffffff"
});

function invalidQuizFigureImage() {
  const error = new Error("invalid_quiz_figure_image");
  error.statusCode = 500;
  return error;
}

export function getQuizFigureNumberMask(width, height) {
  const imageWidth = Number(width);
  const imageHeight = Number(height);
  if (!Number.isInteger(imageWidth) || imageWidth < 1 || !Number.isInteger(imageHeight) || imageHeight < 1) {
    throw invalidQuizFigureImage();
  }

  return {
    left: Math.floor(imageWidth * QUIZ_FIGURE_NUMBER_MASK.leftRatio),
    top: Math.floor(imageHeight * QUIZ_FIGURE_NUMBER_MASK.topRatio),
    width: Math.max(1, Math.ceil(imageWidth * QUIZ_FIGURE_NUMBER_MASK.widthRatio)),
    height: Math.max(1, Math.ceil(imageHeight * QUIZ_FIGURE_NUMBER_MASK.heightRatio))
  };
}

function createOpaqueMask(width, height) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${QUIZ_FIGURE_NUMBER_MASK.background}"/></svg>`
  );
}

export async function renderNumberlessQuizFigure(input) {
  const image = sharp(input, {
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS
  }).autoOrient();
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height || !["jpeg", "png"].includes(metadata.format)) {
    throw invalidQuizFigureImage();
  }

  const mask = getQuizFigureNumberMask(metadata.width, metadata.height);
  return image
    .composite([{
      input: createOpaqueMask(mask.width, mask.height),
      left: mask.left,
      top: mask.top,
      blend: "over"
    }])
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toBuffer();
}
