import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeAdminPromoMetadata } from "../api/admin.js";

const read = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const script = read("script.js");
const style = read("style.css");
const adminApi = read("api/admin.js");
const promoGas = read("google-apps-script/promo-access.gs");
const page = read("index.html");
const worker = read("service-worker.js");

function readFunction(name, nextName) {
  const start = script.indexOf(`function ${name}`);
  const end = script.indexOf(`function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return script.slice(start, end);
}

test("promo users are recognized from database fields until converted to paid", () => {
  const source = readFunction("isAdminPromoUser", "getAdminPhoneKey");
  const isAdminPromoUser = Function(`${source}; return isAdminPromoUser;`)();

  assert.equal(isAdminPromoUser({ accessSource: "promo" }), true);
  assert.equal(isAdminPromoUser({ isPromo: true }), true);
  assert.equal(isAdminPromoUser({ promoDaysUsed: 5 }), true);
  assert.equal(isAdminPromoUser({ accessSource: "paid", promoDaysUsed: 5 }), false);
  assert.equal(isAdminPromoUser({ promo: false, promoDaysUsed: 5 }), false);
  assert.equal(isAdminPromoUser({ accessSource: "promo", isPromo: false }), false);
});

test("promo cards remain purple and keep a dedicated Send action even when active", () => {
  assert.match(script, /const showSend = showRenew \|\| isPromo/u);
  assert.match(script, /admin-user-card is-\$\{status\.key\}\$\{isPromo \? " is-promo" : ""\}/u);
  assert.match(script, /admin-promo-badge">Promo 5 giorni/u);
  assert.match(script, /is-promo-send/u);
  assert.match(
    style,
    /\.admin-user-card\.is-promo\s*\{[\s\S]*?linear-gradient\([\s\S]*?rgba\(235, 226, 252, 0\.88\)[\s\S]*?border-color:/u
  );
});

test("promo Send opens the dedicated Bangla conversion message", () => {
  const source = readFunction("getPromoBanglaMessage", "getRenewPopupState");
  const getPromoBanglaMessage = Function(`${source}; return getPromoBanglaMessage;`)();
  const message = getPromoBanglaMessage();

  assert.match(message, /৫ দিনের Promo Access/u);
  assert.match(message, /৭৮৬টি Magic Quiz/u);
  assert.match(message, /নিয়মিত নতুন অডিও, অনুবাদ, ব্যাখ্যা ও ফিচার আপডেট/u);
  assert.match(message, /৩০ দিন — ১০€/u);
  assert.match(message, /৯০ দিন — ২০€/u);
  assert.match(message, /৩৬৫ দিন — ৪০€/u);
  assert.match(message, /https:\/\/tmmmagic\.eu\/join/u);
  assert.match(script, /if \(isAdminPromoUser\(user\)\) return getPromoBanglaMessage\(\);/u);
});

test("a paid admin renewal asks the database to clear promo presentation", () => {
  assert.match(script, /adminRequest\("renew", \{[\s\S]*?accessSource: "paid"/u);
  assert.match(adminApi, /action === "renew" && accessSource === "paid"/u);
  assert.match(adminApi, /fields\.accessSource = "paid"/u);
  assert.match(adminApi, /callGasAdmin\("admin_mark_paid"/u);
  assert.match(promoGas, /function promoAdminMarkPaid_\(payload\)/u);
  assert.match(promoGas, /setValue\('paid'\)/u);
  assert.match(promoGas, /columns\.promoFlag[\s\S]*?setValue\(false\)/u);
});

test("admin list merges protected promo metadata without losing normal user fields", () => {
  const merged = mergeAdminPromoMetadata([
    { phone: "+39 333 111 2222", expiry: "2026-08-01" },
    { phone: "393332223333", expiry: "2026-12-01" }
  ], [
    { phone: "393331112222", accessSource: "promo", isPromo: true, promoDaysUsed: 5 },
    { phone: "393332223333", accessSource: "paid", isPromo: false, promoDaysUsed: 5 }
  ]);

  assert.equal(merged[0].isPromo, true);
  assert.equal(merged[0].expiry, "2026-08-01");
  assert.equal(merged[1].isPromo, false);
  assert.equal(merged[1].accessSource, "paid");
  assert.match(adminApi, /callGasAdmin\("admin_promo_users"\)/u);
  assert.match(promoGas, /function promoAdminUsers_\(payload\)/u);
  assert.match(promoGas, /promoVerifyAdminRequest_\(payload\)/u);
});

test("promo admin UI ships with fresh PWA assets", () => {
  assert.match(page, /style\.css\?v=57-promo-admin-users/u);
  assert.match(page, /script\.js\?v=50-promo-admin-users/u);
  assert.match(worker, /magicbook-pwa-v107-promo-admin-users/u);
  assert.match(worker, /style\.css\?v=57-promo-admin-users/u);
  assert.match(worker, /script\.js\?v=50-promo-admin-users/u);
});
