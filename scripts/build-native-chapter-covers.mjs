import { mkdir, access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Re-encode the existing public All Books cards; never read protected book pages.
// Original artwork stays intact. The UI, not the asset, crops its illustration.
const source = process.argv[2];
if (!source) throw new Error("Pass the All Books quiz_cards directory.");
const output = fileURLToPath(new URL("../assets/chapter-covers/", import.meta.url));
const numbers = Array.from({ length: 25 }, (_, i) => String(i + 1).padStart(2, "0"));
await Promise.all(numbers.map(n => access(resolve(source, `Capitolo_${n}.png`))));
await mkdir(output, { recursive: true });
let total = 0;
for (const n of numbers) {
  const result = await sharp(resolve(source, `Capitolo_${n}.png`))
    .resize({ width: 640, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(resolve(output, `chapter-${n}.webp`));
  total += result.size;
}
console.log(`Built 25 native chapter covers: ${Math.round(total / 1024)} KiB total.`);
