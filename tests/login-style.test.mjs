import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const script = readFileSync(new URL("../script.js", import.meta.url), "utf8");
const daisySource = readFileSync(new URL("../src/daisyui.css", import.meta.url), "utf8");
const daisyBuild = readFileSync(new URL("../assets/daisyui.css", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("login uses locally compiled, scoped daisyUI components", () => {
  assert.ok(page.indexOf("assets/daisyui.css?v=2-learning-shell") < page.indexOf("style.css?v=65-promo-desktop-layout"));
  assert.match(page, /id="login" data-theme="magicbook"/);
  assert.match(page, /class="login-pass d-card"/);
  assert.match(page, /class="login-form d-fieldset"/);
  assert.match(page, /class="login-input d-input d-input-lg"/);
  assert.match(page, /class="login-submit d-btn d-btn-primary d-btn-lg"/);
  assert.match(page, /class="login-feedback d-alert d-alert-error d-alert-soft"/);
  assert.match(page, /d-loading d-loading-spinner d-loading-sm/);

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

test("login keeps the Magic Book type, route motif, and teal-to-lime action", () => {
  assert.match(page, /family=Rubik:wght@400;500;600;700;800/);
  assert.match(styles, /#login,\s*#login \*[\s\S]*?font-family: "Rubik", "Inter", sans-serif/);
  assert.match(page, /class="login-road" aria-hidden="true"/);
  assert.match(styles, /LOGIN — DAISYUI STUDY PASS/);
  assert.match(styles, /#login > \.login-pass[\s\S]*?grid-template-columns/);
  assert.match(styles, /#login \.login-submit,[\s\S]*?radial-gradient\([\s\S]*?201, 244, 29[\s\S]*?linear-gradient\(112deg[\s\S]*?#0a8270/);
  assert.match(styles, /@keyframes loginGradientBlend/);
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*?#login \.login-submit \{ animation: none; \}/);
});

test("login form owns validation and exposes accessible field states", () => {
  assert.match(page, /<form class="login-form d-fieldset"[^>]*novalidate/);
  assert.match(page, /<label class="login-label d-label" for="user">Numero di telefono<\/label>/);
  assert.match(page, /id="user"[^>]*autocomplete="tel"[^>]*aria-describedby="phoneHelp err"/);
  assert.match(page, /id="adminPassword"[^>]*type="password"[^>]*autocomplete="current-password"/);
  assert.match(page, /id="adminPasswordToggle"[^>]*aria-label="Mostra password amministratore"[^>]*aria-pressed="false"/);
  assert.match(page, /id="err"[^>]*role="status"[^>]*aria-live="polite"/);

  assert.match(script, /function setLoginFieldInvalid\([\s\S]*?aria-invalid/);
  assert.match(script, /setLoginFieldInvalid\(phoneInput, true\);\s*phoneInput\?\.focus\(\)/);
  assert.match(script, /setLoginFieldInvalid\(document\.getElementById\("promoCode"\), false\)/);
  assert.match(script, /setLoginButtonBusy\([\s\S]*?aria-busy/);
  assert.match(script, /setLoginButtonBusy\([\s\S]*?aria-disabled/);
  assert.match(styles, /#login \.login-submit\.is-loading::after[\s\S]*?content: none;[\s\S]*?display: none;/);
  assert.match(styles, /@media \(max-width: 800px\) and \(max-height: 720px\)[\s\S]*?#login \.login-greeting-cloud,[\s\S]*?#login \.login-road[\s\S]*?display: none;/);
  assert.match(styles, /\.promo-access-form input\[aria-invalid="true"\][\s\S]*?border-color: #d85c55/);
  assert.match(script, /Nascondi password amministratore/);
});

test("login fills the upper space with restrained multilingual greetings", () => {
  for (const greeting of ["Ciao!", "Hello", "Welcome back", "Assalamu alaikum", "স্বাগতম"]) {
    assert.match(page, new RegExp(greeting));
  }
  assert.match(page, /login-greeting-cloud" aria-hidden="true"/);
  assert.match(script, /function updateLoginTimeGreeting/);
  for (const greeting of ["Good morning", "Good afternoon", "Good evening", "Good night"]) {
    assert.match(script, new RegExp(greeting));
  }
  assert.match(script, /showLoginScreen[\s\S]*?updateLoginTimeGreeting\(\)/);
  assert.match(styles, /login-greeting-ciao[\s\S]*?font-family: "Bodoni Moda"/);
  assert.match(styles, /login-greeting-bangla[\s\S]*?font-family: "Ekush"/);
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*?login-greeting-cloud/);
});

test("login restores the accessible optional promo-code controls", () => {
  assert.ok(page.indexOf('id="user"') > 0);
  assert.match(page, /class="login-input login-promo-input d-input d-input-lg" id="promoCode"/);
  assert.match(page, /id="promoCodeHint"[^>]*>Con un codice valido ricevi 5 giorni/);
  assert.match(script, /promoCode: promoCode \|\| undefined/);
});
