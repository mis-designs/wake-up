import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const SAMPLE = "ম্যাজিক বুক, ইতালিয়ান ড্রাইভিং লাইসেন্স প্রস্তুতির সেরা বই . ৭৮৬টি গুরুত্বপূর্ণ কুইজ.";
const read = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("the Admin exposes a clean, static Bengali font library route", () => {
  const index = read("index.html");
  const page = read("libreria-font.html");
  const redirects = read("_redirects");
  const headers = read("_headers");
  const routes = JSON.parse(read("vercel.json"));

  assert.match(index, /<a class="admin-new-btn admin-action-pill admin-action-pill--font" href="\/libreria-font">/u);
  assert.ok(routes.rewrites.some(route => route.source === "/libreria-font" && route.destination === "/libreria-font.html"));
  assert.ok(routes.headers.some(entry => entry.source === "/libreria-font"));
  assert.ok(routes.headers.some(entry => entry.source === "/libreria-font.html"));
  assert.match(redirects, /^\/libreria-font \/libreria-font\.html 200$/mu);
  assert.match(headers, /\/libreria-font[\s\S]*?Cache-Control: no-cache, no-store, must-revalidate[\s\S]*?X-Robots-Tag: noindex, nofollow, noimageindex/u);

  assert.match(page, /<title>MagicBook \| Magic Styles<\/title>/u);
  assert.match(page, /<meta name="robots" content="noindex,nofollow,noimageindex">/u);
  assert.match(page, /<a class="font-library-back" href="\/admin" aria-label="Torna al pannello Admin">/u);
  assert.match(page, /<main class="font-library-main" aria-labelledby="font-library-title">/u);
  assert.match(page, /\/assets\/fonts\/magicbook-bangla-fonts\.css\?v=1-adorsho/u);
  assert.match(page, /\/libreria-font\.css\?v=2-magic-styles/u);
  assert.doesNotMatch(page, /banglawebfonts\.pages\.dev/u);
  const scripts = [...page.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/gu)].map(match => match[1]);
  assert.deepEqual(scripts, [
    "/android-webview-mode.js?v=2-aura-fluid",
    "/offline-notice.js?v=1.0.0"
  ]);
  assert.doesNotMatch(page, /<script\b(?![^>]*src="\/(?:android-webview-mode\.js\?v=2-aura-fluid|offline-notice\.js\?v=1\.0\.0)")[^>]*>/u);
});

test("the library compares all three local fonts with the same live Bengali sentence", () => {
  const page = read("libreria-font.html");
  const styles = read("libreria-font.css");
  const sharedFonts = read("assets/fonts/magicbook-bangla-fonts.css");

  assert.equal((page.match(/<article class="font-specimen /gu) || []).length, 3);
  assert.equal((page.match(/class="font-specimen-sample" lang="bn"/gu) || []).length, 3);
  assert.equal(page.split(SAMPLE).length - 1, 3);
  assert.match(page, /id="font-hadi-title">Hadi Rounded<\/h2>/u);
  assert.match(page, /id="font-adorsho-title">Adorsho Lipi<\/h2>/u);
  assert.match(page, /id="font-ekushey-title">Ekushey Lal Sabuj<\/h2>/u);
  assert.match(page, /Titoli principali/u);
  assert.match(page, /Sottotitoli e testi del quiz/u);
  assert.match(page, /Carattere alternativo/u);

  for (const family of ["Hadi Rounded", "Adorsho Lipi", "Ekushey Lal Sabuj"]) {
    assert.match(sharedFonts, new RegExp(`font-family: "${family}";`, "u"));
  }
  assert.match(sharedFonts, /hadi-rounded\/hadi-rounded-regular\.woff2\?v=1/u);
  assert.match(sharedFonts, /adorsho-lipi\/adorsho-lipi-regular\.woff2\?v=1/u);
  assert.match(sharedFonts, /ekushey-lal-sabuj\/ekushey-lal-sabuj-regular\.woff2\?v=1/u);
  assert.equal((sharedFonts.match(/font-display:\s*swap;/gu) || []).length, 4);
  assert.equal((sharedFonts.match(/unicode-range:\s*U\+0964-0965, U\+0980-09FF, U\+200C-200D;/gu) || []).length, 4);
  assert.match(sharedFonts, /--font-bn-title:\s*var\(--font-bn-hadi\);/u);
  assert.match(sharedFonts, /--font-bn-support:\s*var\(--font-bn-adorsho\);/u);

  assert.match(styles, /\.font-specimen--hadi \.font-specimen-sample\s*\{\s*font-family:\s*var\(--font-bn-hadi\);\s*\}/u);
  assert.match(styles, /\.font-specimen--adorsho \.font-specimen-sample\s*\{\s*font-family:\s*var\(--font-bn-adorsho\);\s*\}/u);
  assert.match(styles, /\.font-specimen--ekushey \.font-specimen-sample\s*\{\s*font-family:\s*var\(--font-bn-ekushey\);\s*\}/u);
  assert.match(styles, /\.font-specimen-sample\s*\{[^}]*font-size:\s*clamp\(1\.55rem, 3vw, 2\.35rem\)[^}]*font-style:\s*normal[^}]*font-weight:\s*400[^}]*letter-spacing:\s*0[^}]*line-height:\s*1\.45/su);
  assert.match(styles, /\.font-library-back\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/su);
  assert.match(styles, /\.font-library-back:focus-visible\s*\{[^}]*outline:\s*3px solid #263bd4/su);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.font-specimen\s*\{[^}]*grid-template-columns:\s*1fr/su);
  assert.match(styles, /body\s*\{[^}]*min-width:\s*320px/su);
  assert.doesNotMatch(styles, /text-overflow:\s*ellipsis|white-space:\s*nowrap/su);
});

test("the library fonts are valid, pinned local WOFF2 assets and cached offline", () => {
  const worker = read("service-worker.js");
  const fontFiles = [
    {
      path: "../assets/fonts/hadi-rounded/hadi-rounded-regular.woff2",
      size: 59_436,
      hash: "195701ac3bef5f5eedbd9768cbab55fef14a7d1a02c8d059edeabb7f053165e4"
    },
    {
      path: "../assets/fonts/adorsho-lipi/adorsho-lipi-regular.woff2",
      size: 104_732,
      hash: "5df4772d28684b962fa2ceb5a2b64b683496f173b3746fbc3739d5b3b7e1d7e6"
    },
    {
      path: "../assets/fonts/ekushey-lal-sabuj/ekushey-lal-sabuj-regular.woff2",
      size: 53_800,
      hash: "bdb7955ae89c44de417b9f894d0e09ba59a3ffe1a646c36a9b2bac7d6770b7a7"
    }
  ];

  for (const item of fontFiles) {
    const font = readFileSync(new URL(item.path, import.meta.url));
    assert.equal(font.subarray(0, 4).toString("ascii"), "wOF2");
    assert.equal(font.length, item.size);
    assert.equal(createHash("sha256").update(font).digest("hex"), item.hash);
  }

  assert.match(worker, /magicbook-pwa-v161-numberless-figures/u);
  assert.match(worker, /\/libreria-font\.html/u);
  assert.match(worker, /\/libreria-font\.css\?v=2-magic-styles/u);
  assert.match(worker, /\/assets\/fonts\/magicbook-bangla-fonts\.css\?v=1-adorsho/u);
  assert.match(worker, /\/assets\/fonts\/hadi-rounded\/hadi-rounded-regular\.woff2\?v=1/u);
  assert.match(worker, /\/assets\/fonts\/adorsho-lipi\/adorsho-lipi-regular\.woff2\?v=1/u);
  assert.match(worker, /\/assets\/fonts\/ekushey-lal-sabuj\/ekushey-lal-sabuj-regular\.woff2\?v=1/u);
  assert.match(worker, /url\.pathname\.startsWith\("\/libreria-font"\)[\s\S]*?"\/libreria-font\.html"/u);
  assert.ok(read("assets/fonts/adorsho-lipi/LICENSE-GPL-2.0.txt").length > 10_000);
  assert.ok(read("assets/fonts/adorsho-lipi/FONT-EXCEPTION-2.0.txt").length > 300);
});
