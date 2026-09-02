import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../script.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

test("Promo Code stays fail-closed and logged-out visitors use personal login", () => {
  assert.match(script, /const PROMO_LOGIN_ENABLED = false;/);
  assert.match(page, /class="promo-access-card hidden"[^>]*id="promoAccessCard"[^>]*aria-hidden="true"[^>]*hidden/);
  assert.match(script, /function showLandingScreen\(options = \{\}\) \{\s*if \(!PROMO_LOGIN_ENABLED\) \{\s*showLoginScreen\("", \{ replace: options\.replace === true \}\);\s*return;/u);
  assert.match(script, /function syncPromoLoginAvailability\(\)[\s\S]*?card\.hidden = !PROMO_LOGIN_ENABLED;[\s\S]*?card\.classList\.toggle\("hidden", !PROMO_LOGIN_ENABLED\);/u);
});

test("disabled promo access does not initialize or request campaign status", () => {
  assert.match(script, /if \(PROMO_LOGIN_ENABLED\) \{\s*setupPromoLandingUI\(\);\s*void setupPromoCampaign\(\);\s*\}/u);
  assert.match(script, /function setupPromoLandingUI\(\) \{\s*if \(!PROMO_LOGIN_ENABLED\) return;/u);
  assert.match(script, /async function setupPromoCampaign\(\) \{\s*if \(!PROMO_LOGIN_ENABLED\) return;[\s\S]*?fetch\(PROMO_STATUS_API/u);
  assert.match(script, /function loginFromPromoCard\(\) \{\s*if \(!PROMO_LOGIN_ENABLED\)[\s\S]*?showLoginScreen\("", \{ replace: true \}\);/u);
});

test("the disabled promo release uses matching cache-busted assets", () => {
  assert.match(page, /script\.js\?v=67-promo-ui-disabled/u);
  assert.match(worker, /CACHE_NAME = "magicbook-pwa-v158-admin-profile-logo"/u);
  assert.match(worker, /script\.js\?v=67-promo-ui-disabled/u);
});
