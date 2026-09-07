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

test("the Roadcraft installed-app palette is purposeful and stays WebView-scoped", () => {
  for (const token of ["#315EFB", "#FFFFFF", "#D92D42", "#EAF0FF", "#17233A", "#637083", "#D7DEEA", "#087A60", "#C9F41D"]) {
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
    const themeIndex = html.indexOf("/android-app-theme.css?v=4-roadcraft");
    const lastStylesheetIndex = html.lastIndexOf('rel="stylesheet"');

    assert.ok(markerIndex >= 0, `${page} must load the WebView marker`);
    assert.ok(markerIndex < firstStylesheetIndex, `${page} must mark the app before CSS`);
    assert.equal(themeIndex, lastStylesheetIndex + 'rel="stylesheet" href="'.length, `${page} must load the app theme last`);
  }
});

test("the app theme assets are available offline", () => {
  assert.match(worker, /\/android-webview-mode\.js\?v=2-aura-fluid/);
  assert.match(worker, /\/android-app-theme\.css\?v=4-roadcraft/);
});

test("primary app color pairings meet WCAG AA for normal text", () => {
  assert.ok(contrast("#FFFFFF", "#315EFB") >= 4.5, "white text on navigation blue must pass AA");
  assert.ok(contrast("#17233A", "#EAF0FF") >= 4.5, "navy text on soft blue must pass AA");
  assert.ok(contrast("#637083", "#FFFFFF") >= 4.5, "muted text on white must pass AA");
  assert.ok(contrast("#FFFFFF", "#D92D42") >= 4.5, "white text on the danger accent must pass AA");
});

test("Roadcraft keeps the hierarchy open and restores domain-specific color roles", () => {
  assert.match(theme, /--app-palette-background:\s*#F4F7FB/i);
  assert.match(theme, /--app-palette-primary-strong:\s*#243BC7/i);
  assert.match(theme, /--app-palette-positive:\s*#087A60/i);
  assert.match(theme, /#home > \.home-actions\s*\{[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/su);
  assert.match(theme, /#home > \.home-actions::before\s*\{[^}]*display:\s*none;/su);
  assert.match(theme, /#home \.home-start-btn\s*\{[^}]*background:\s*linear-gradient\(135deg, #075F4C[^}]*#10A56D 100%\);/su);
  assert.match(theme, /#home \.home-dictionary-entry\s*\{[^}]*background:\s*linear-gradient\(135deg, #17233A 0%, #263A59 100%\);/su);
  assert.match(theme, /\.lesson-board\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/su);
  assert.match(theme, /\.lesson-tool-exam\s*\{[^}]*background:\s*var\(--app-palette-lime\);/su);
  assert.match(theme, /\.quiz-command-bar\s*\{[^}]*border:[^;]*var\(--app-palette-line\);[^}]*background:\s*var\(--app-palette-paper\);/su);
  assert.match(theme, /body\.admin-mode \.admin-toolbar\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/su);
  assert.match(theme, /@media \(hover: none\), \(pointer: coarse\)/u);
  assert.match(theme, /scrollbar-color:\s*var\(--app-palette-primary\) transparent;/u);
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
