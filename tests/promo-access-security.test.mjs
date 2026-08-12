import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
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
  assert.match(authSource, /const proof = createPromoRedeemProof\([\s\S]*?callAccessBackend\("promo_redeem"[\s\S]*?promoCodeId[\s\S]*?\.\.\.proof/);
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
  assert.match(gasSource, /tryLock\(2500\)/);
  assert.match(gasSource, /existingExpiry[\s\S]*?error: 'active_access'[\s\S]*?newExpiry/);
  assert.match(gasSource, /history\.usedCodeIds\[promoCodeId\]/);
  assert.match(gasSource, /CacheService\.getScriptCache\(\)/);
  assert.match(gasSource, /computeHmacSha256Signature/);
  assert.match(gasSource, /PropertiesService\.getScriptProperties\(\)\.getProperty\('GAS_SECRET'\)/);
  assert.match(gasSource, /promoDaysUsed >= PROMO_MAX_DAYS_/);
});

test("transient promo contention is retried without retrying business denials", () => {
  assert.match(scriptSource, /PROMO_LOGIN_RETRYABLE_ERRORS/);
  assert.match(scriptSource, /"busy"/);
  assert.match(scriptSource, /"service_unavailable"/);
  assert.match(scriptSource, /const delays = \[650, 1300\]/);
  assert.match(scriptSource, /requestPromoLoginWithRetry\(authPayload/);
  assert.doesNotMatch(scriptSource, /PROMO_LOGIN_RETRYABLE_ERRORS[\s\S]{0,300}"promo_code_reused"/);
});

test("promo backend setup failures are normalized without leaking internal errors", () => {
  assert.match(authSource, /PROMO_BACKEND_SETUP_ERRORS/);
  assert.match(authSource, /"bad_action"/);
  assert.match(authSource, /"unauthorized"/);
  assert.match(authSource, /return "promo_backend_not_ready"/);
  assert.match(scriptSource, /Servizio promozionale momentaneamente non disponibile/);
});

test("login presents phone first and optional promo code second", () => {
  const phoneIndex = pageSource.indexOf('id="user"');
  const promoIndex = pageSource.indexOf('id="promoCode"');
  assert.ok(phoneIndex > 0);
  assert.ok(promoIndex > phoneIndex);
  assert.match(pageSource, /Con un codice valido ricevi 5 giorni di accesso completo/);
});

test("landing promo login requires phone and promo code without exposing environment values", () => {
  assert.ok(pageSource.indexOf('id="promoLandingCode"') > pageSource.indexOf('id="promoLandingPhone"'));
  assert.match(pageSource, /loginFromPromoCard\(\)/);
  assert.doesNotMatch(pageSource, /PROMO_CODE_5_DAYS|PROMO_CODE_5_DAYS_EXPIRES_AT/);
});
