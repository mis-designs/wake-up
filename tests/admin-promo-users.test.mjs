import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

test("promo users have a dedicated filter tab with their Send message", () => {
  const filteredUsers = readFunction("getFilteredAdminUsers", "updateAdminStats");

  assert.match(page, /data-admin-tab="promo">Promo Users<\/button>/u);
  assert.match(filteredUsers, /adminState\.tab === "promo"\) return isAdminPromoUser\(user\)/u);
  assert.match(style, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/u);
  assert.match(script, /const showSend = showRenew \|\| isPromo/u);
  assert.match(script, /if \(isAdminPromoUser\(user\)\) return getPromoBanglaMessage\(\);/u);
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
  const normalizePhoneSource = readFunction("normalizePhone", "isValidStoredDeviceId");
  const phoneKeySource = readFunction("getAdminPhoneKey", "getAdminDuplicatePhones");
  const mergeSource = readFunction("mergeAdminPromoUsers", "normalizeAdminSearch");
  const mergeAdminPromoUsers = Function(
    `${normalizePhoneSource}\n${phoneKeySource}\n${mergeSource}; return mergeAdminPromoUsers;`
  )();
  const merged = mergeAdminPromoUsers([
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
  assert.match(adminApi, /if \(action === "promo_users"\) return "admin_promo_users"/u);
  assert.match(promoGas, /function promoAdminUsers_\(payload\)/u);
  assert.match(promoGas, /promoVerifyAdminRequest_\(payload\)/u);
});

test("promo metadata gets enough time and never appears as a false empty result", () => {
  const loadUsers = readFunction("adminLoadUsers", "adminLoadPromoUsers");
  const loadPromoUsers = readFunction("adminLoadPromoUsers", "adminRetryPromoUsers");
  const renderUsers = readFunction("renderAdminUsers", "adminOpenUserModal");

  assert.match(loadUsers, /adminRequest\("list"\)[\s\S]*?renderAdminUsers\(\);[\s\S]*?void adminLoadPromoUsers\(loadVersion\)/u);
  assert.match(loadPromoUsers, /adminRequest\("promo_users"\)/u);
  assert.match(loadPromoUsers, /promoLoading = true[\s\S]*?promoLoaded = true/u);
  assert.match(loadPromoUsers, /catch \(error\)[\s\S]*?promoError = getAdminErrorMessage/u);
  assert.match(renderUsers, /adminState\.tab === "promo" && adminState\.promoLoading[\s\S]*?Caricamento utenti promo/u);
  assert.match(renderUsers, /adminState\.tab === "promo" && adminState\.promoError[\s\S]*?adminRetryPromoUsers\(\)/u);
  assert.match(script, /readOnlyAction = action === "list" \|\| action === "search" \|\| action === "promo_users"/u);
  assert.match(adminApi, /action === "promo_users" \? 20_000 : 12_000/u);
  assert.match(style, /\.admin-promo-state[\s\S]*?\.admin-promo-spinner[\s\S]*?@keyframes adminPromoSpin/u);
  assert.doesNotMatch(adminApi, /if \(action === "list"\) \{[\s\S]*?admin_promo_users/u);
});

test("promo admin UI ships with fresh PWA assets", () => {
  assert.match(page, /style\.css\?v=62-home-learning-layout/u);
  assert.match(page, /script\.js\?v=56-login-daisyui/u);
  assert.match(worker, /magicbook-pwa-v118-study-workspace/u);
  assert.match(worker, /style\.css\?v=62-home-learning-layout/u);
  assert.match(worker, /script\.js\?v=56-login-daisyui/u);
});
