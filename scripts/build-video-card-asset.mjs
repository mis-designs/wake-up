// Rebuild the owner's card artwork without altering the supplied original.
// Generated media/manifest and URL-only replacements are intentionally mechanical.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const source = 'icons/video_section_card_image.png';
const output = 'assets/video-class/teacher.webp';
const sha = buffer => createHash('sha256').update(buffer).digest('hex');
const original = await readFile(new URL(source, root));
const sourceHash = sha(original);
const { data, info } = await sharp(original).rotate().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
await writeFile(new URL(output, root), data);
await writeFile(new URL('assets/video-class/card-artwork.json', root), JSON.stringify({
  source, sourceHash, output, outputHash: sha(data), width: info.width, height: info.height,
  url: `/${output}?v=${sourceHash.slice(0, 12)}`,
}, null, 2) + '\n');
// The worker's precache URL changes as well, so an updated source changes the
// worker bytes and triggers installation rather than reusing stale image bytes.
for (const file of ['study-quiz.html', 'video-class.js', 'service-worker.js']) {
  const url = new URL(file, root), before = await readFile(url, 'utf8');
  const after = before.replace(/teacher\.webp(?:\?v=[a-f0-9]+)?/g, `teacher.webp?v=${sourceHash.slice(0, 12)}`);
  if (after === before && !before.includes(`teacher.webp?v=${sourceHash.slice(0, 12)}`)) throw new Error(`Missing artwork consumer: ${file}`);
  if (after !== before) await writeFile(url, after);
}
// The screen module embeds the image URL. Version its import chain too; otherwise
// the worker could reuse an older versioned JS response containing the old URL.
for (const file of ['study-quiz.html', 'study-quiz.js', 'service-worker.js']) {
  const url = new URL(file, root), before = await readFile(url, 'utf8');
  const after = before.replace(/((?:study-quiz|video-class)\.js\?v=[\w-]+)(?:&art=[a-f0-9]+)?/g, `$1&art=${sourceHash.slice(0, 12)}`);
  if (after !== before) await writeFile(url, after);
}
console.log(`Video card: ${info.width}x${info.height}, ${data.length} bytes, source ${sourceHash.slice(0, 12)}`);
