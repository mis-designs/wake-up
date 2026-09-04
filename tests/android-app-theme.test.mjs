import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const theme = read("android-app-theme.css");
const marker = read("android-webview-mode.js");
const app = read("script.js");
const worker = read("service-worker.js");

const pages = [
  "index.html",
  "quiz.html",
  "study-quiz.html",
  "aggiungi-spiegazioni.html",
  "libreria-font.html",
  "privacypolicy.html"
];

function rgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function luminance(hex) {
  const channels = rgb(hex).map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

test("the Aura installed-app palette uses the supplied colors and stays WebView-scoped", () => {
  for (const token of ["#5B1E91", "#FFFFFF", "#EB0000", "#BDB5E9", "#111827", "#4B5563", "#AFAFB6"]) {
    assert.match(theme, new RegExp(token, "i"));
  }

  assert.match(theme, /^html\.android-webview\s*\{/m);
  assert.doesNotMatch(theme, /(^|\})\s*:root\s*\{/m);
  assert.doesNotMatch(theme, /(^|\})\s*body\s*\{/m);
  assert.match(theme, /semantic status colors[\s\S]*remain owned/i);
});

test("the app marker is applied before styles and the theme loads last on every entry", () => {
  assert.match(marker, /MagicBookViewer/);
  assert.match(marker, /classList\.add\("android-webview"\)/);
  assert.match(marker, /dataset\.appPalette = "aura-fluid"/);

  for (const page of pages) {
    const html = read(page);
    const markerIndex = html.indexOf("/android-webview-mode.js?v=2-aura-fluid");
    const firstStylesheetIndex = html.indexOf('rel="stylesheet"');
    const themeIndex = html.indexOf("/android-app-theme.css?v=2-aura-fluid");
    const lastStylesheetIndex = html.lastIndexOf('rel="stylesheet"');

    assert.ok(markerIndex >= 0, `${page} must load the WebView marker`);
    assert.ok(markerIndex < firstStylesheetIndex, `${page} must mark the app before CSS`);
    assert.equal(themeIndex, lastStylesheetIndex + 'rel="stylesheet" href="'.length, `${page} must load the app theme last`);
  }
});

test("the app theme assets are available offline", () => {
  assert.match(worker, /\/android-webview-mode\.js\?v=2-aura-fluid/);
  assert.match(worker, /\/android-app-theme\.css\?v=2-aura-fluid/);
});

test("primary app color pairings meet WCAG AA for normal text", () => {
  assert.ok(contrast("#FFFFFF", "#5B1E91") >= 4.5, "white text on Aura purple must pass AA");
  assert.ok(contrast("#111827", "#BDB5E9") >= 4.5, "dark text on lilac surface must pass AA");
  assert.ok(contrast("#4B5563", "#FFFFFF") >= 4.5, "muted text on white must pass AA");
  assert.ok(contrast("#FFFFFF", "#EB0000") >= 4.5, "white text on the danger accent must pass AA");
});

test("Aura drag follows the pointer, resists edges and keeps a non-drag alternative", () => {
  assert.match(app, /dataset\.appPalette === "aura-fluid"/);
  assert.match(app, /function getResistedDragOffset\(rawDelta\)/);
  assert.match(app, /cardDragVelocity \* AURA_DRAG_PROJECTION_MS/);
  assert.match(app, /requestAnimationFrame\(\(\) =>/);
  assert.match(app, /pointercancel", e => endDrag\(e, true\)/);
  assert.match(app, /document\.createElement\("button"\)/);
  assert.match(app, /card\.tabIndex = isSelected \? 0 : -1/);
  assert.match(app, /e\.key === "Home"/);
  assert.match(app, /e\.key === "End"/);
  assert.match(theme, /\.chapter-card\.is-drag-preview/);
  assert.match(theme, /@media \(prefers-reduced-motion: reduce\)/);
});
