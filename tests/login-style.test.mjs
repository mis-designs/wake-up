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

test("web and Android login reuse the same intact Home book", () => {
  assert.match(page, /class="login-hero-img" src="\/icons\/mg_book\.svg" width="280" height="390" alt=""/u);
  assert.match(loginStyles, /#login \.login-hero-img \{[^}]*object-fit: contain; filter: none; box-shadow: none/u);
  assert.match(page, /class="native-book-art" src="\/icons\/mg_book\.svg"/u);
  assert.match(readFileSync(new URL("../service-worker.js", import.meta.url), "utf8"), /"\/icons\/mg_book\.svg"/u);
});

test("shared glass login hides only visual labels and preserves canonical form semantics", () => {
  assert.match(loginStyles, /#login > \.login-pass \{[^}]*backdrop-filter: blur\(16px\)/u);
  assert.match(loginStyles, /#login :is\(\.login-kicker, \.login-greeting-cloud, \.login-road\) \{ display: none/u);
  const label = loginStyles.match(/#login \.login-label\[for="user"\] \{([^}]+)\}/u)[1];
  assert.match(label, /clip-path: inset\(50%\)/u);
  assert.doesNotMatch(label, /display: none|visibility: hidden/u);
  assert.match(loginStyles, /--login-display: "Norwester"/u);
});

test("shared greeting rails keep local-time copy, Bangla and motion-safe stable geometry", () => {
  const shell = readFileSync(new URL("../login-experience.js", import.meta.url), "utf8");
  const renderer = readFileSync(new URL("../greeting-view.mjs", import.meta.url), "utf8");
  const nativeCss = readFileSync(new URL("../android-study-shell.css", import.meta.url), "utf8");
  assert.match(renderer, /line\.lang = .*\? "bn" : "it"/u);
  assert.match(renderer, /rail\.setAttribute\("aria-hidden", "true"\)/u);
  assert.match(shell, /\["Bentornato\.", \.\.\.homeGreetings\(new Date\(\)\.getHours\(\)\), "Bentornato\."\]/u);
  assert.match(shell, /MutationObserver\(syncLoginGreeting\).*attributeFilter: \["class"\]/u);
  assert.match(loginStyles, /login-greeting-rise 16s[^;]+infinite/u);
  assert.match(loginStyles, /#login #loginTitle \{\s*height: 48px; overflow: hidden/u);
  assert.match(loginStyles, /#loginTitle \.login-greeting-rail > \[lang="bn"\] \{[^}]*var\(--font-bn-title\)/u);
  assert.match(nativeCss, /\.native-home h1 \.native-greeting-rail > \[lang="bn"\] \{[^}]*var\(--font-bn-title\)/u);
  assert.match(loginStyles, /#login:is\(\.hidden, :focus-within, \[data-login-background\]\)/u);
  assert.match(shell, /document\.hidden/u);
  assert.match(loginStyles, /data-native-motion-paused\] #login[^}]*animation: none; transform: none/u);
  assert.match(loginStyles, /prefers-reduced-motion: reduce\) \{[^}]*login-greeting-rail\) \{ animation: none; transform: none/u);
});

test("login uses the original logo and an animated two-line Norwester wordmark", () => {
  assert.match(page, /class="login-watermark-logo" src="\/icons\/mdesignstextlogo\.png" width="512" height="137" alt="MiskatDesigns"/u);
  assert.match(page, /class="login-brand" aria-label="MagicBook"><span aria-hidden="true">Magic<\/span><span aria-hidden="true">Book<\/span>/u);
  assert.match(loginStyles, /\.login-brand \{[^}]*flex-direction: column;[^}]*login-brand-drift 6s/u);
  assert.match(loginStyles, /\.login-brand > span \{[^}]*font: inherit/u);
  assert.match(loginStyles, /\.login-watermark-logo \{[^}]*aspect-ratio: 512 \/ 137; object-fit: contain/u);
  assert.match(loginStyles, /watermark-link:focus-visible/);
});

test("shared login ships offline without exposing Android Home to browsers", () => {
  const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
  const native = readFileSync(new URL("../android-study-shell.js", import.meta.url), "utf8");
  const theme = readFileSync(new URL("../android-app-theme.css", import.meta.url), "utf8");
  const login = readFileSync(new URL("../login-experience.js", import.meta.url), "utf8");
  for (const asset of ["login-experience.css?v=1-shared-login", "login-experience.js?v=1-shared-login"]) {
    assert.ok(page.includes(asset)); assert.ok(worker.includes(asset));
  }
  for (const asset of ["greeting-view.mjs?v=1-shared-login", "/icons/mdesignstextlogo.png", "/assets/fonts/norwester/norwester.woff"]) assert.ok(worker.includes(asset));
  assert.match(native, /classList\.contains\("android-webview"\) && template/u);
  assert.doesNotMatch(native, /syncLoginGreeting|function renderGreeting/u);
  assert.doesNotMatch(login, /initialize\(|MagicBookAndroidAdapter|fetch\(|setInterval/u);
  const palette = theme.match(/html\.android-webview, #login \{([^}]+)\}/u)[1];
  assert.ok(palette.split('\n').filter(s => s.trim()).every(s => s.trim().startsWith('--')));
});

test("login uses locally compiled, scoped daisyUI components", () => {
  assert.ok(page.indexOf("assets/daisyui.css?v=2-learning-shell") < page.indexOf("style.css?v=72-solid-profile-controls"));
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
  assert.doesNotMatch(script, /document\.getElementById\("promoCode"\)/);
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

test("main login no longer presents the finished optional promo-code field", () => {
  assert.ok(page.indexOf('id="user"') > 0);
  assert.doesNotMatch(page, /id="promoCode"|id="promoCodeHint"|login-promo-input|promo-code-hint/);
  assert.doesNotMatch(script, /document\.getElementById\("promoCode"\)/);
  assert.match(page, /id="promoLandingCode"/);
  assert.match(script, /promoLandingCode/);
});
