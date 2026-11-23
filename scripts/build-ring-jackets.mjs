import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Exterior paper margins, measured in the public All Books print originals.
// Leave a narrow safety edge outside the printed keyline, including the footer.
const margins = [
  [67,36,70,62], [56,28,65,44], [51,29,69,42], [63,26,37,14], [57,33,68,45],
  [54,29,65,36], [57,41,71,43], [50,29,68,10], [20,21,26,18], [21,14,21,9],
  [18,15,19,10], [16,16,17,10], [20,21,20,11], [19,19,19,5], [18,18,17,8],
  [15,16,15,13], [15,15,15,10], [17,14,18,12], [18,15,18,11], [17,14,17,4],
  [16,15,16,6], [18,19,17,6], [20,19,20,9], [17,15,16,6], [4,16,17,8]
];
const source = process.argv[2];
if (!source) throw new Error("Pass the All Books quiz_cards directory.");
const output = fileURLToPath(new URL("../assets/chapter-covers/ring/", import.meta.url));
const manifestUrl = new URL("../assets/native-chapter-covers.json", import.meta.url);
const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
manifest.description = "Public All Books navigation jackets in Magic Book chapter order.";
manifest.ring = {};
await mkdir(output, { recursive: true });
for (const [index, [left, top, right, bottom]] of margins.entries()) {
  const folio = String(index + 1).padStart(2, "0");
  const original = sharp(join(source, "Capitolo_" + folio + ".png"));
  const { width, height } = await original.metadata();
  const name = "chapter-" + folio + ".webp";
  await original.extract({ left, top, width: width - left - right, height: height - top - bottom })
    .webp({ quality: 94, smartSubsample: true, effort: 6 }).toFile(join(output, name));
  manifest.ring[folio] = "/assets/chapter-covers/ring/" + name;
}
await writeFile(manifestUrl, JSON.stringify(manifest, null, 2) + "\n");
