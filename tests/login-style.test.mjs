import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const script = readFileSync(new URL("../script.js", import.meta.url), "utf8");

test("login uses Rubik and the teal-to-lime blended identity", () => {
  assert.match(page, /family=Rubik:wght@400;500;600;700;800/);
  assert.match(styles, /#login,\s*#login \*[\s\S]*?font-family: "Rubik", "Inter", sans-serif/);
  assert.match(styles, /#login h1[\s\S]*?linear-gradient\(100deg, #0A8270[\s\S]*?#7CFF6B/);
  assert.match(styles, /#login \.login-submit[\s\S]*?radial-gradient\([\s\S]*?124, 255, 107[\s\S]*?linear-gradient\(112deg[\s\S]*?#0A8270/);
  assert.match(styles, /@keyframes loginGradientBlend/);
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*?#login \.login-submit \{ animation: none; \}/);
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

test("login temporarily hides the expired promo-code controls", () => {
  assert.ok(page.indexOf('id="user"') > 0);
  assert.doesNotMatch(page, /id="promoCode"|promo-code-hint/);
  assert.match(script, /promoCode: promoCode \|\| undefined/);
});
