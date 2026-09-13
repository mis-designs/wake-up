import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const script = read("script.js");
const loginSource = script.slice(script.indexOf("async function login(options = {})"), script.indexOf("function ensureAdminPasswordUI()"));

function fixture(response) {
  const calls = { auth: 0, pending: 0, expired: 0, success: 0, admin: 0 };
  const phone = { value: "+39 331 000 0000", focus() {}, invalid: false };
  const error = { textContent: "" };
  const label = { textContent: "Continua" };
  const button = { dataset: {}, querySelector: () => label, getAttribute: () => button.busy ? "true" : "false" };
  const ctx = vm.createContext({
    PROMO_LOGIN_ENABLED: false, currentScreen: "login", adminPasswordRequired: false,
    document: { getElementById: id => id === "user" ? phone : id === "err" ? error : null, querySelector: () => button },
    normalizePhone: value => String(value || "").replace(/\D/g, ""),
    isValidPhoneNumber: value => String(value).replace(/\D/g, "").length >= 10,
    setLoginFieldInvalid: (field, invalid) => { if (field) field.invalid = invalid; },
    setLoginButtonBusy: (_, busy) => { button.busy = busy; },
    getRobustDeviceId: async () => "fixture-device-only",
    requestAuthAction: async () => { calls.auth++; return typeof response === "function" ? response() : response; },
    showLoginPendingPopup: () => calls.pending++,
    showExpiredRenewPopup: () => calls.expired++,
    completeLogin: () => calls.success++,
    showAdminPasswordUI: () => calls.admin++,
    updateLoginButtonState() {}, updatePromoLandingButtonState() {},
    getLoginErrorMessage: code => `specific:${code}`,
    setTimeout: callback => callback(), console: { error() {} }
  });
  vm.runInContext(loginSource, ctx);
  return { calls, ctx, phone, error, button, run: () => ctx.login() };
}

test("unregistered main login shows guidance without invalidating a well-formed phone or granting access", async () => {
  const f = fixture({ success: false, error: "not_found" });
  await f.run();
  assert.equal(f.calls.pending, 1);
  assert.equal(f.calls.auth, 1);
  assert.equal(f.calls.success, 0);
  assert.equal(f.calls.expired, 0);
  assert.equal(f.phone.invalid, false);
  assert.equal(f.phone.value, "+39 331 000 0000");
  assert.equal(f.error.textContent, "");
  assert.equal(f.button.busy, false);
});

test("expired retains renewal; other failures never masquerade as pending payment", async () => {
  for (const code of ["expired", "bad_phone", "device_mismatch", "device_replaced", "device_reset_required", "too_many_attempts", "server_error", "temporary_error", "service_unavailable", "busy", "unknown"]) {
    const f = fixture({ success: false, error: code });
    await f.run();
    assert.equal(f.calls.pending, 0, code);
    assert.equal(f.calls.expired, code === "expired" ? 1 : 0, code);
    assert.equal(f.error.textContent, `specific:${code}`);
  }
});

test("Admin challenge, success, status fallback and local validation keep their owners", async () => {
  const admin = fixture({ success: false, error: "admin_password_required" });
  await admin.run(); assert.equal(admin.calls.admin, 1); assert.equal(admin.calls.pending, 0);
  const ok = fixture({ success: true });
  await ok.run(); assert.equal(ok.calls.success, 1); assert.equal(ok.calls.pending, 0);
  const fallback = fixture({ success: false, status: "not_found" });
  await fallback.run(); assert.equal(fallback.calls.pending, 1);
  const bad = fixture({ success: false, error: "not_found" });
  bad.phone.value = "123";
  await bad.run(); assert.equal(bad.calls.auth, 0); assert.equal(bad.phone.invalid, true);
});

test("busy guard precedes async device identity and blocks concurrent submits without adding retries", async () => {
  let resolve;
  const f = fixture(() => new Promise(done => { resolve = done; }));
  const first = f.run();
  await f.run();
  assert.equal(f.calls.auth, 1);
  resolve({ success: false, error: "not_found" });
  await first;
  assert.equal(f.calls.auth, 1);
  assert.equal(f.calls.pending, 1);
});

test("navigation and an edited phone suppress stale pending notices", async () => {
  for (const change of [f => { f.ctx.currentScreen = "welcome"; }, f => { f.phone.value = "+39 332 000 0000"; }]) {
    let resolve;
    const f = fixture(() => new Promise(done => { resolve = done; }));
    const pending = f.run();
    await new Promise(setImmediate);
    change(f);
    resolve({ success: false, error: "not_found" });
    await pending;
    assert.equal(f.calls.pending, 0);
  }
});

test("failed requests clear busy state and retain technical-error feedback", async () => {
  const f = fixture(() => { throw new Error("fixture network failure"); });
  await f.run();
  assert.equal(f.calls.pending, 0);
  assert.equal(f.button.busy, false);
  assert.match(f.error.textContent, /Verifica non riuscita/);
});

test("shared bilingual notice uses scoped tokens, canonical focus behavior and no payment claim or polling", () => {
  const page = read("index.html"), css = read("login-experience.css");
  const popup = script.slice(script.indexOf("let dismissLoginPendingPopup"), script.indexOf("function showWhatsAppGroupPopup()"));
  assert.match(page, /Se hai già effettuato il pagamento/);
  assert.match(page, /potrebbe essere ancora in elaborazione/);
  assert.match(page, /id="loginPendingBangla">আপনি যদি ইতিমধ্যে পেমেন্ট করে থাকেন/);
  assert.match(page, /aria-describedby="loginPendingItalian loginPendingBangla"/);
  assert.match(css, /#login \.login-pending-bangla p[^}]*var\(--font-bn-support\)/);
  assert.match(css, /#login \.login-pending-bangla h3[^}]*var\(--font-bn-title\)/);
  assert.match(css, /z-index: 20000/);
  assert.match(popup, /mountAppPopup/);
  assert.match(popup, /removeEventListener\("magicbook:before-offline-notice", onLeave\)/);
  assert.match(popup, /removeEventListener\("pagehide", onLeave\)/);
  assert.doesNotMatch(popup, /fetch\(|requestAuthAction|setInterval|setTimeout|localStorage/);
  assert.match(script, /function hideAll\(\) \{\s*dismissLoginPendingPopup/);
});
