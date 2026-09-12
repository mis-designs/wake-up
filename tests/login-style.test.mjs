import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const script = readFileSync(new URL("../script.js", import.meta.url), "utf8");
const daisySource = readFileSync(new URL("../src/daisyui.css", import.meta.url), "utf8");
const daisyBuild = readFileSync(new URL("../assets/daisyui.css", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const loginStyles = readFileSync(new URL("../login-experience.css", import.meta.url), "utf8");


test("web and Android login reuse the intact Home book without a duplicate brand", () => {
  assert.match(page, /class="login-hero-img" src="\/icons\/mg_book\.svg" width="280" height="390" alt=""/u);
  assert.match(loginStyles, /object-fit: contain; filter: none; box-shadow: none/u);
  assert.match(page, /class="native-book-art" src="\/icons\/mg_book\.svg"/u);
  assert.doesNotMatch(page, /class="login-brand"|class="login-heading"|id="phoneHelp"/u);
});

test("shared unibody login retains accessible names and a direct phone form", () => {
  assert.match(loginStyles, /#login > \.login-pass \{[^}]*border: 0;[^}]*background: transparent;[^}]*box-shadow: none/u);
  assert.match(loginStyles, /#login #loginTitle, #login \.login-label\[for="user"\] \{[^}]*clip-path: inset\(50%\)/u);
  assert.match(page, /id="loginTitle">Accedi a Magic Book/u);
  assert.doesNotMatch(page, /Inserisci il numero collegato a MagicBook|Puoi scriverlo con o senza il prefisso/u);
  assert.match(loginStyles, /@media \(min-width: 900px\)/u);
  assert.match(loginStyles, /min-height: 100svh; min-height: 100dvh/u);
  assert.ok(loginStyles.includes('#login:not(.hidden) ~ #chapterMenu:not(.menu-open) { box-shadow: none; }'));
});

test("sign presentation is bounded, motion-safe and never owns authentication", () => {
  const shell = readFileSync(new URL("../login-experience.js", import.meta.url), "utf8");
  assert.match(shell, /SIGN_HOLD_MS/u);
  assert.match(shell, /pending\?\.abort\(\)/u);
  assert.match(shell, /ticket !== revision/u);
  assert.match(shell, /image\.decode\(\)/u);
  assert.match(shell, /clearTimeout\(timeout\)/u);
  assert.match(shell, /pagehide/u);
  assert.match(shell, /document\.hidden/u);
  assert.match(shell, /visualViewport/u);
  assert.match(shell, /viewport\.scale - 1/u);
  assert.match(shell, /--login-keyboard-inset/u);
  assert.doesNotMatch(shell, /fetch\(|setInterval|requestAuthAction|localStorage\.setItem|completeLogin\(/u);
  assert.match(loginStyles, /prefers-reduced-motion: reduce/u);
  assert.match(loginStyles, /data-native-motion-paused/u);
  assert.match(page, /id="loginMotionToggle"[^>]*aria-label="Pausa animazioni"[^>]*aria-pressed="false"/u);
});

test("original signature remains small and readable without a black container", () => {
  assert.match(page, /class="login-watermark-logo" src="\/icons\/mdesignstextlogo\.png" width="512" height="137" alt="MiskatDesigns"/u);
  assert.match(loginStyles, /#login \.watermark-link \{[^}]*min-height: 44px;[^}]*background: transparent/u);
  assert.match(loginStyles, /\.login-watermark-logo \{[^}]*width: 132px;[^}]*aspect-ratio: 512 \/ 137/u);
  assert.match(loginStyles, /watermark-link:focus-visible/u);
});

test("shared login assets are versioned without exposing Android Home to browsers", () => {
  const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
  const native = readFileSync(new URL("../android-study-shell.js", import.meta.url), "utf8");
  for (const asset of ["login-experience.css?v=3-shared-font", "login-experience.js?v=2-unibody"]) {
    assert.ok(page.includes(asset)); assert.ok(worker.includes(asset));
  }
  for (const asset of ["login-signs.mjs?v=1", "/icons/mdesignstextlogo.png", "/assets/fonts/norwester/norwester.woff"]) assert.ok(worker.includes(asset));
  assert.match(native, /classList\.contains\("android-webview"\) && template/u);
  assert.match(loginStyles, /@import url\("\/assets\/fonts\/magicbook-latin-fonts\.css\?v=1"\)/u);
  assert.match(readFileSync(new URL("../assets/fonts/magicbook-latin-fonts.css", import.meta.url), "utf8"), /font-family: "Norwester"/u);
});

test("login uses locally compiled, scoped daisyUI components", () => {
  assert.ok(page.indexOf("assets/daisyui.css?v=2-learning-shell") < page.indexOf("style.css?v=73-open-hand"));
  assert.match(page, /id="login" data-theme="magicbook"/);
  assert.match(page, /class="login-pass d-card"/);
  assert.match(page, /class="login-form d-fieldset"/);
  assert.match(page, /class="login-input d-input d-input-lg"/);
  assert.match(page, /class="login-submit d-btn d-btn-primary d-btn-lg"/);
  assert.match(page, /class="login-feedback d-alert d-alert-error d-alert-soft"/);
  assert.match(page, /login-submit-spinner magic-loading-image magic-loading-image--button/);

  assert.match(daisySource, /root: "#login"/);
  assert.match(daisySource, /prefix: "d-"/);
  assert.match(daisySource, /include: button, input, card, fieldset, label, alert, loading/);
  assert.doesNotMatch(daisySource, /@import "tailwindcss";/);
  assert.doesNotMatch(daisySource, /@source "\.\.\/(?:index\.html|script\.js)"/);
  assert.match(daisySource, /@source inline\("d-card[^"]*d-btn-ghost[^"]*d-loading-sm"\)/);
  for (const componentClass of ["d-card", "d-input", "d-btn", "d-alert", "d-loading"]) {
    assert.match(daisyBuild, new RegExp(`\\.${componentClass}`));
  }
  for (const leakedUtility of ["hidden", "sr-only", "container", "flex", "visible"]) {
    assert.doesNotMatch(daisyBuild, new RegExp(`\\.${leakedUtility}(?:[,{:]|\\\\:)`));
  }
  assert.equal(packageJson.scripts["build:css"], "tailwindcss -i ./src/daisyui.css -o ./assets/daisyui.css --minify");
  assert.equal(packageJson.devDependencies.daisyui, "^5.7.0");
});


test("unibody controls use canonical blue with stable busy and disabled geometry", () => {
  assert.match(loginStyles, /#login \.d-btn\.login-submit \{[^}]*height: 58px;[^}]*var\(--app-palette-primary\)/u);
  assert.match(loginStyles, /#login \.login-submit:disabled \{[^}]*var\(--app-palette-divider\)/u);
  assert.match(loginStyles, /#login \.login-submit\.is-loading \{[^}]*var\(--app-palette-primary\)/u);
  assert.match(loginStyles, /#login \.login-submit-spinner \{ position: absolute;/u);
  assert.match(loginStyles, /#login \.login-input\.d-input \{[^}]*height: 60px;/u);
});

test("login form owns validation and exposes accessible field states", () => {
  assert.match(page, /<form class="login-form d-fieldset"[^>]*novalidate/);
  assert.match(page, /<label class="login-label d-label" for="user">Numero di telefono<\/label>/);
  assert.match(page, /id="user"[^>]*autocomplete="tel"[^>]*aria-describedby="err"/);
  assert.match(page, /id="adminPassword"[^>]*type="password"[^>]*autocomplete="current-password"/);
  assert.match(page, /id="adminPasswordToggle"[^>]*aria-label="Mostra password amministratore"[^>]*aria-pressed="false"/);
  assert.match(page, /id="err"[^>]*role="status"[^>]*aria-live="polite"/);

  assert.match(script, /function setLoginFieldInvalid\([\s\S]*?aria-invalid/);
  assert.match(script, /setLoginFieldInvalid\(phoneInput, true\);\s*phoneInput\?\.focus\(\)/);
  assert.doesNotMatch(script, /document\.getElementById\("promoCode"\)/);
  assert.match(script, /setLoginButtonBusy\([\s\S]*?aria-busy/);
  assert.match(script, /setLoginButtonBusy\([\s\S]*?aria-disabled/);
  assert.match(styles, /#login \.login-submit\.is-loading::after[\s\S]*?content: none;[\s\S]*?display: none;/);
  assert.match(styles, /@media \(max-width: 800px\) and \(max-height: 720px\)[\s\S]*?#login \.login-greeting-cloud,[\s\S]*?#login \.login-road[\s\S]*?display: none;/);
  assert.match(styles, /\.promo-access-form input\[aria-invalid="true"\][\s\S]*?border-color: #d85c55/);
  assert.match(script, /Nascondi password amministratore/);
});


test("sign captions use the existing Bangla title face without changing native Home", () => {
  assert.match(page, /id="loginSign"[^>]*aria-label="Dare precedenza"/u);
  assert.match(page, /<figcaption lang="bn">অগ্রাধিকার দিতে হবে<\/figcaption>/u);
  assert.match(loginStyles, /#login \.login-sign figcaption \{[^}]*var\(--font-bn-title\)/u);
  assert.match(loginStyles, /grid-template-rows: 112px 70px/u);
  assert.match(readFileSync(new URL("../android-study-shell.css", import.meta.url), "utf8"), /\.native-home h1 \.native-greeting-rail > \[lang="bn"\]/u);
});

test("main login no longer presents the finished optional promo-code field", () => {
  assert.ok(page.indexOf('id="user"') > 0);
  assert.doesNotMatch(page, /id="promoCode"|id="promoCodeHint"|login-promo-input|promo-code-hint/);
  assert.doesNotMatch(script, /document\.getElementById\("promoCode"\)/);
  assert.match(page, /id="promoLandingCode"/);
  assert.match(script, /promoLandingCode/);
});
