// Publish only the owner's chosen graduation cap. Preserve other source artwork on disk.
// SVG animation posters use the same local Playwright setup as browser QA.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const folder = 'icons/Home Page Animation/';
const output = 'assets/home-animations/';
const hash = data => createHash('sha256').update(data).digest('hex').slice(0, 12);
const assetUrl = (file, data) => '/' + file.split('/').map(encodeURIComponent).join('/') + '?v=' + hash(data);
await mkdir(new URL(output, root), { recursive: true });
const names = (await readdir(new URL(folder, root), { withFileTypes: true }))
  .filter(file => file.isFile() && /^Graduation_Hat\.(gif|svg|png|jpe?g|webp|avif|tiff?)$/i.test(file.name))
  .map(file => file.name).sort().slice(0, 1);
const items = [];
let browser;
try {
  for (const name of names) {
    const original = await readFile(new URL(folder + name, root));
    const svg = /\.svg$/i.test(name), smil = svg && /<(?:animate|set)\b|<animateTransform\b|<animateMotion\b/.test(original.toString());
    const meta = await sharp(original).metadata();
    let poster;
    if (smil) {
      if (!browser) {
        const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
        browser = await chromium.launch({ headless: true, channel: 'msedge' });
      }
      const page = await browser.newPage({ viewport: { width: 320, height: 320 } });
      await page.route('**/*', route => route.abort());
      await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:320px;height:320px}</style>${original}`);
      await page.locator('svg').evaluate(svg => {
        const durations = [...svg.querySelectorAll('[dur]')].map(node => {
          const value = node.getAttribute('dur');
          return parseFloat(value) * (value.endsWith('ms') ? .001 : 1);
        }).filter(Number.isFinite);
        svg.pauseAnimations();
        svg.setCurrentTime(Math.min(60, Math.max(1, ...durations)) - .01);
      });
      poster = await page.locator('svg').screenshot({ omitBackground: true });
      await page.close();
    } else {
      // A representative GIF/WebP frame; PNG/JPEG/AVIF/TIFF/static SVG work too.
      const frame = Math.min(12, Math.max(0, (meta.pages || 1) - 1));
      poster = await sharp(original, { page: frame }).rotate().resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    }
    const posterFile = output + hash(Buffer.from(name)) + '.png';
    await writeFile(new URL(posterFile, root), poster);
    items.push({ id: name, sourceHash: hash(original), src: assetUrl(folder + name, original), poster: assetUrl(posterFile, poster), animated: smil || (meta.pages || 1) > 1 });
  }
} finally { await browser?.close(); }
const catalog = 'export default ' + JSON.stringify(items, null, 2) + ';\n';
await writeFile(new URL(output + 'catalog.mjs', root), catalog);
const revision = hash(catalog);
// Update the entire module import chain so previous worker caches cannot serve an old list.
for (const file of ['home-animation.js', 'home-offers.js', 'index.html', 'service-worker.js']) {
  const url = new URL(file, root), before = await readFile(url, 'utf8');
  let after = before.replace(/(home-animations\/catalog\.mjs\?v=)[\w-]+/g, '$1' + revision)
    .replace(/((?:home-offers|home-animation)\.js\?v=[\w-]+)(?:&art=[a-f0-9]+)?/g, '$1&art=' + revision);
  if (file === 'service-worker.js') {
    const urls = [assetUrl(output + 'catalog.mjs', catalog), ...items.flatMap(item => [item.src, item.poster])];
    after = after.replace(/  \/\/ HOME_ANIMATION_ASSETS_START[^]*?  \/\/ HOME_ANIMATION_ASSETS_END/, '  // HOME_ANIMATION_ASSETS_START\n' + urls.map(url => '  ' + JSON.stringify(url) + ',').join('\n') + '\n  // HOME_ANIMATION_ASSETS_END');
  }
  if (after !== before) await writeFile(url, after);
}
console.log(`Home artwork: ${items.length} assets, catalog ${revision}. Originals unchanged.`);
