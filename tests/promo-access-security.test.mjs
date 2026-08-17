import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import {
  createPromoCodeId,
  createPromoRedeemProof,
  isAllowedPromoHost,
  normalizePromoCode,
  validatePromoCode
} from "../api/promo-code.js";
import { getPublicPromoStatus } from "../api/promo-status.js";

const authSource = readFileSync(new URL("../api/auth.js", import.meta.url), "utf8");
const gasSource = readFileSync(new URL("../google-apps-script/promo-access.gs", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const scriptSource = readFileSync(new URL("../script.js", import.meta.url), "utf8");
const promoStatusSource = readFileSync(new URL("../api/promo-status.js", import.meta.url), "utf8");

test("promo codes are normalized and checked with a server-controlled expiry", () => {
  const now = Date.parse("2026-08-12T10:00:00.000Z");
  assert.equal(normalizePromoCode(" ab 12 34 "), "AB1234");
  assert.equal(validatePromoCode({
    submittedCode: "ab 12 34",
    configuredCode: "AB1234",
    expiresAt: "2026-08-17T09:59:59.000Z",
    now
  }).ok, true);
  assert.equal(validatePromoCode({
    submittedCode: "AB1234",
    configuredCode: "AB1234",
    expiresAt: "2026-08-12T09:59:59.000Z",
    now
  }).error, "promo_expired");
  assert.equal(validatePromoCode({
    submittedCode: "WRONG1",
    configuredCode: "AB1234",
    expiresAt: "2026-08-17T09:59:59.000Z",
    now
  }).error, "promo_invalid");
  assert.equal(validatePromoCode({
    submittedCode: "AB1234",
    configuredCode: "AB1234",
    expiresAt: "2026-09-12T10:00:00.000Z",
    now
  }).error, "promo_unavailable");
});

test("promo identifiers and GAS writes are signed without forwarding the raw code", () => {
  const secret = "test-secret";
  const promoCodeId = createPromoCodeId("AB1234", secret);
  assert.match(promoCodeId, /^[a-f0-9]{64}$/);
  assert.equal(promoCodeId.includes("AB1234"), false);

  const proof = createPromoRedeemProof({
    phone: "393331112222",
    deviceId: "device_test_123",
    promoCodeId,
    promoValidUntil: "2026-08-17T10:00:00.000Z",
    secret,
    now: 1775988000000,
    nonce: "nonce_test_123456789"
  });
  assert.match(proof.promoSignature, /^[a-f0-9]{64}$/);
  assert.equal(proof.promoNonce, "nonce_test_123456789");
  const changedExpiryProof = createPromoRedeemProof({
    phone: "393331112222",
    deviceId: "device_test_123",
    promoCodeId,
    promoValidUntil: "2026-08-18T10:00:00.000Z",
    secret,
    now: 1775988000000,
    nonce: "nonce_test_123456789"
  });
  assert.notEqual(changedExpiryProof.promoSignature, proof.promoSignature);
  assert.match(authSource, /const proof = createPromoRedeemProof\([\s\S]*?callPromoAccessBackend\("promo_redeem"[\s\S]*?promoCodeId[\s\S]*?\.\.\.proof/);
  assert.doesNotMatch(authSource, /callAccessBackend\("promo_redeem"[\s\S]{0,500}?submittedPromoCode/);
});

test("production promo redemption accepts only configured canonical hosts", () => {
  assert.equal(isAllowedPromoHost("tmmmagic.eu", "tmmmagic.eu,www.tmmmagic.eu", true), true);
  assert.equal(isAllowedPromoHost("old-deployment.vercel.app", "tmmmagic.eu,www.tmmmagic.eu", true), false);
  assert.equal(isAllowedPromoHost("localhost:3000", "", false), true);
});

test("public promo status exposes only availability and server expiry", () => {
  const now = Date.parse("2026-08-12T10:00:00.000Z");
  const status = getPublicPromoStatus({
    configuredCode: "SECRET88",
    expiresAt: "2026-08-17T09:59:59.000Z",
    now
  });
  assert.deepEqual(status, {
    active: true,
    expiresAt: "2026-08-17T09:59:59.000Z",
    grantDays: 5
  });
  assert.equal(JSON.stringify(status).includes("SECRET88"), false);
  assert.equal(getPublicPromoStatus({
    configuredCode: "SECRET88",
    expiresAt: "2026-08-12T09:59:59.000Z",
    now
  }).active, false);
  assert.match(promoStatusSource, /isAllowedPromoHost/);
  assert.match(promoStatusSource, /Cache-Control", "no-store/);
  assert.match(promoStatusSource, /json\(getPublicPromoStatus\(/);
  assert.doesNotMatch(promoStatusSource, /\bpromoCode\s*:/);
});

test("GAS owns the five-day grant, thirty-day cap and atomic write", () => {
  assert.match(gasSource, /PROMO_GRANT_DAYS_ = 5/);
  assert.match(gasSource, /PROMO_MAX_DAYS_ = 30/);
  assert.match(gasSource, /configuredUsersSheetName \|\| existingUsersSheetName \|\| 'Sheet1'/);
  assert.match(gasSource, /LockService\.getScriptLock\(\)/);
  assert.match(gasSource, /promoVerifyRequest_\(payload\)[\s\S]*?LockService\.getScriptLock\(\)/);
  assert.match(gasSource, /tryLock\(1200\)/);
  assert.match(gasSource, /existingExpiry[\s\S]*?error: 'active_access'[\s\S]*?newExpiry/);
  assert.match(gasSource, /history\.usedCodeIds\[promoCodeId\]/);
  assert.match(gasSource, /promoUsedCodeIds/);
  assert.match(gasSource, /setValues\(\[rowValues\]\)/);
  assert.doesNotMatch(gasSource, /SpreadsheetApp\.flush\(\)/);
  assert.match(gasSource, /CacheService\.getScriptCache\(\)/);
  assert.match(gasSource, /computeHmacSha256Signature/);
  assert.match(gasSource, /PropertiesService\.getScriptProperties\(\)\.getProperty\('GAS_SECRET'\)/);
  assert.match(gasSource, /promoDaysUsed >= PROMO_MAX_DAYS_/);
});

test("GAS atomically caps the campaign at 1,500 distinct promo users", () => {
  assert.match(gasSource, /PROMO_MAX_UNIQUE_USERS_ = 1500/);
  assert.match(gasSource, /promoCountUniqueUsers_\(usersSheet, columns\) >= PROMO_MAX_UNIQUE_USERS_/);
  assert.match(gasSource, /error: 'promo_campaign_full'/);
  assert.match(gasSource, /LockService\.getScriptLock\(\)[\s\S]*?promoCountUniqueUsers_\(usersSheet, columns\)/);
  assert.match(gasSource, /uniquePhones\[phone\] = true/);
  assert.match(authSource, /PUBLIC_PROMO_REDEMPTION_ERRORS[\s\S]*?"promo_campaign_full"/);
  assert.match(scriptSource, /promo_campaign_full[\s\S]*?It's too late, follow our page to know for the next promo code, thanks\./);
  assert.doesNotMatch(scriptSource, /PROMO_MAX_UNIQUE_USERS_/);
});

test("the campaign counter counts distinct promo phones and ignores normal users", () => {
  const context = vm.createContext({ console });
  vm.runInContext(gasSource, context);
  const columns = {
    phone: 1,
    promoDaysUsed: 2,
    promoRedemptions: 3,
    lastPromoCodeId: 4,
    promoUsedCodeIds: 5,
    accessSource: 6
  };
  const rows = [
    ["3331112222", 5, 1, "", "", "promo"],
    ["393331112222", 0, 0, "", "", "promo"],
    ["3339998888", 0, 0, "", "", "paid"],
    ["3345556677", 0, 0, "code-id", "", ""]
  ];
  const sheet = {
    getLastRow: () => rows.length + 1,
    getRange: (row, column, rowCount, columnCount) => ({
      getValues: () => rows
        .slice(row - 2, row - 2 + rowCount)
        .map(values => values.slice(column - 1, column - 1 + columnCount))
    })
  };

  assert.equal(context.PROMO_MAX_UNIQUE_USERS_, 1500);
  assert.equal(context.promoCountUniqueUsers_(sheet, columns), 2);
});

test("transient promo contention is retried without retrying business denials", () => {
  assert.match(scriptSource, /PROMO_LOGIN_RETRYABLE_ERRORS/);
  assert.match(scriptSource, /"busy"/);
  assert.match(scriptSource, /"service_unavailable"/);
  assert.match(scriptSource, /const delays = \[450, 850, 1500, 2400, 3600\]/);
  assert.match(scriptSource, /Math\.random\(\) \* 450/);
  assert.match(scriptSource, /requestPromoLoginWithRetry\(authPayload/);
  assert.doesNotMatch(scriptSource, /PROMO_LOGIN_RETRYABLE_ERRORS[\s\S]{0,300}"promo_code_reused"/);
});

test("expected promo backpressure stays out of Vercel 5xx metrics", () => {
  assert.match(authSource, /callPromoAccessBackend/);
  assert.match(authSource, /retryAfterMs: 900/);
  assert.match(authSource, /return res\.status\(200\)\.json\(\{[\s\S]*?retryable/);
  assert.doesNotMatch(authSource, /promoValidation\.error === "promo_unavailable" \? 503/);
});

test("promo backend setup failures are normalized without leaking internal errors", () => {
  assert.match(authSource, /PROMO_BACKEND_SETUP_ERRORS/);
  assert.match(authSource, /"bad_action"/);
  assert.match(authSource, /"unauthorized"/);
  assert.match(authSource, /return "promo_backend_not_ready"/);
  assert.match(scriptSource, /Servizio promozionale momentaneamente non disponibile/);
});

test("login temporarily presents phone without promo-code controls", () => {
  const phoneIndex = pageSource.indexOf('id="user"');
  assert.ok(phoneIndex > 0);
  assert.doesNotMatch(pageSource, /id="promoCode"|promo-code-hint/);
});

test("landing hides expired promo controls without exposing environment values", () => {
  assert.doesNotMatch(pageSource, /id="promoLandingCode"|id="promoLandingPhone"|loginFromPromoCard\(\)/);
  assert.match(pageSource, /class="trial-card"/);
  assert.doesNotMatch(pageSource, /PROMO_CODE_5_DAYS|PROMO_CODE_5_DAYS_EXPIRES_AT/);
});
