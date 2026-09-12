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

test("the installed-app palette uses the supplied role colors and stays WebView-scoped", () => {
  for (const token of ["#F5F5F7", "#1D1D1F", "#AAAAAA", "#007AFF", "#076AE0", "#69696E", "#76767A"]) {
    assert.match(theme, new RegExp(token, "i"));
  }

  assert.match(theme, /^html\.android-webview\s*\{/m);
  assert.doesNotMatch(theme, /(^|\})\s*:root\s*\{/m);
  assert.doesNotMatch(theme, /(^|\})\s*body\s*\{/m);
  assert.match(theme, /semantic status colors[\s\S]*remain owned/i);
});

test("the app marker precedes styles; only the named native variants may follow the theme", () => {
  assert.match(marker, /MagicBookViewer/);
  assert.match(marker, /classList\.add\("android-webview"\)/);
  assert.match(marker, /dataset\.appPalette = "aura-fluid"/);

  for (const page of pages) {
    const html = read(page);
    const markerIndex = html.indexOf("/android-webview-mode.js?v=6-pearl-blue");
    const firstStylesheetIndex = html.indexOf('rel="stylesheet"');
    const themeIndex = html.indexOf(page === "quiz.html" ? "/android-app-theme.css?v=11-shared-quiz" : "/android-app-theme.css?v=10-shared-login");
    const lastStylesheetIndex = html.lastIndexOf('rel="stylesheet"');

    assert.ok(markerIndex >= 0, `${page} must load the WebView marker`);
    assert.ok(markerIndex < firstStylesheetIndex, `${page} must mark the app before CSS`);
    const studyIndex = html.indexOf("/android-study-shell.css?v=19-open-hand");
    if (page === "index.html") {
      assert.ok(studyIndex > themeIndex);
      const modesIndex = html.indexOf("/android-mode-screens.css?v=2-thumb");
      assert.ok(modesIndex > studyIndex);
      assert.equal(modesIndex, lastStylesheetIndex + 'rel="stylesheet" href="'.length);
    } else {
      assert.equal(studyIndex, -1);
      assert.equal(themeIndex, lastStylesheetIndex + 'rel="stylesheet" href="'.length, `${page} must load the app theme last`);
    }
  }
});

test("the app theme assets are available offline", () => {
  assert.match(worker, /\/android-webview-mode\.js\?v=6-pearl-blue/);
  assert.match(worker, /\/android-app-theme\.css\?v=10-shared-login/);
});

test("primary app color pairings meet WCAG AA for normal text", () => {
  const token = (name) => {
    const match = theme.match(new RegExp("--app-palette-" + name + ":\\s*(#[0-9a-f]{6});", "i"));
    assert.ok(match, `missing literal palette token: ${name}`);
    return match[1];
  };
  for (const role of ["surface", "background", "paper"]) {
    assert.ok(contrast(token("text"), token(role)) >= 4.5, `dark text on ${role} must pass AA`);
    assert.ok(contrast(token("muted"), token(role)) >= 4.5, `supporting text on ${role} must pass AA`);
  }
  assert.ok(contrast(token("border"), token("background")) >= 3, "structural border must be visible");
  for (const role of ["primary", "secondary"]) {
    assert.ok(contrast(token(`on-${role}`), token(role)) >= 4.5, `white labels on ${role} must pass AA`);
  }
  assert.ok(contrast(token("primary"), token("background")) >= 4.5, "selected chapter must pass AA");
  assert.ok(contrast(token("primary-strong"), token("background")) >= 4.5, "brand foreground must pass AA on the canvas");
  assert.match(theme, /\.privacy-hero h1 em,[^{}]+\{\s*color: var\(--app-palette-primary-strong\)/);
  assert.match(marker, /getComputedStyle\(root\)\.getPropertyValue\("--app-palette-primary"\)/);
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

test("thin section-only chrome is an Android variant, not a browser title rewrite", () => {
  assert.match(theme, /html\.android-webview \.app-header \{ height: 48px/);
  assert.match(theme, /html\.android-webview #learningInsightsScreen \.li-topbar \{ height: calc\(var\(--li-topbar-height\)/);
  assert.match(theme, /html\.android-webview \.admin-title small \{ display: none/);
  assert.match(read('src/learning-insights.js'), /classList\.contains\("android-webview"\) \? \(isErrors \? "Errori" : "Statistiche"\) : "Magic Book"/);
});
