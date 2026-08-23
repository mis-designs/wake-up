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
const styleSource = readFileSync(new URL("../style.css", import.meta.url), "utf8");
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
  assert.equal(createPromoCodeId(" ab 12 34 ", secret), promoCodeId);
  assert.notEqual(createPromoCodeId("NEW1234", secret), promoCodeId);
  assert.notEqual(createPromoCodeId("AB1234", "rotated-secret"), promoCodeId);

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

test("GAS owns one lifetime five-day promo grant and the atomic write", () => {
  assert.match(gasSource, /PROMO_GRANT_DAYS_ = 5/);
  assert.doesNotMatch(gasSource, /PROMO_MAX_DAYS_ = 30/);
  assert.match(gasSource, /configuredUsersSheetName \|\| existingUsersSheetName \|\| 'Sheet1'/);
  assert.match(gasSource, /LockService\.getScriptLock\(\)/);
  assert.match(gasSource, /promoVerifyRequest_\(payload\)[\s\S]*?LockService\.getScriptLock\(\)/);
  assert.match(gasSource, /tryLock\(1200\)/);
  assert.match(gasSource, /existingExpiry[\s\S]*?error: 'active_access'[\s\S]*?hasPromoHistory[\s\S]*?error: 'promo_already_used'/);
  assert.match(gasSource, /promoFindCampaignEntry_\(redemptionSheet, promoCodeId, phone, 'reserved'\)/);
  assert.match(gasSource, /activeAuditValues\[0\] = existingExpiry[\s\S]*?activeAuditValues\[2\] = 'granted'/);
  assert.doesNotMatch(gasSource, /activeAuditValues\[1\]\s*=/);
  assert.match(gasSource, /Object\.keys\(history\.usedCodeIds\)\.length > 0/);
  assert.match(gasSource, /newPromoDaysUsed = PROMO_GRANT_DAYS_/);
  assert.match(gasSource, /newPromoRedemptions = 1/);
  assert.match(gasSource, /usedCodeIds\.push\(promoCodeId\)/);
  assert.match(gasSource, /promoUsedCodeIds/);
  assert.match(gasSource, /setValues\(\[rowValues\]\)/);
  assert.match(gasSource, /setValues\(\[rowValues\]\)[\s\S]*?SpreadsheetApp\.flush\(\)/);
  assert.doesNotMatch(gasSource, /promo_reservation_release/);
  assert.match(gasSource, /CacheService\.getScriptCache\(\)/);
  assert.match(gasSource, /computeHmacSha256Signature/);
  assert.match(gasSource, /PropertiesService\.getScriptProperties\(\)\.getProperty\('GAS_SECRET'\)/);
  assert.match(authSource, /PUBLIC_PROMO_REDEMPTION_ERRORS[\s\S]*?"promo_already_used"/);
});

test("GAS atomically caps each promo-code campaign at 800 first-time users", () => {
  assert.match(gasSource, /PROMO_MAX_UNIQUE_USERS_ = 800/);
  assert.match(gasSource, /PROMO_RESERVATION_TTL_MS_ = 10 \* 60 \* 1000/);
  assert.match(gasSource, /promoFindCampaignEntry_\(redemptionSheet, promoCodeId, phone\)/);
  assert.match(gasSource, /promoReconcileStaleReservations_\([\s\S]*?PROMO_RESERVATION_TTL_MS_/);
  assert.match(gasSource, /promoCountCampaignUsers_\(redemptionSheet, promoCodeId\)[\s\S]*?>= PROMO_MAX_UNIQUE_USERS_/);
  assert.match(gasSource, /error: 'promo_campaign_full'/);
  assert.match(gasSource, /LockService\.getScriptLock\(\)[\s\S]*?promoCountCampaignUsers_\(redemptionSheet, promoCodeId\)/);
  assert.match(gasSource, /redemptionSheet\.appendRow\([\s\S]*?'reserved'[\s\S]*?usersSheet\.getRange\([\s\S]*?setValues\(\[rowValues\]\)[\s\S]*?redemptionSheet\.getRange\(campaignRow[\s\S]*?'granted'/);
  assert.match(gasSource, /uniquePhones\[phone\] = true/);
  assert.doesNotMatch(gasSource, /function promoCountUniqueUsersForCode_/);
  assert.match(authSource, /PUBLIC_PROMO_REDEMPTION_ERRORS[\s\S]*?"promo_campaign_full"/);
  assert.match(scriptSource, /promo_campaign_full[\s\S]*?Gli 800 posti gratuiti/);
  assert.doesNotMatch(scriptSource, /PROMO_MAX_UNIQUE_USERS_/);
});

test("the durable campaign ledger isolates code IDs and survives user-row deletion", () => {
  const context = vm.createContext({ console });
  vm.runInContext(gasSource, context);
  const codeA = "a".repeat(64);
  const codeB = "b".repeat(64);
  const rows = [
    ["3331112222", codeA, 5, "2026-08-28T00:00:00Z", "hash-1", "granted"],
    ["393331112222", codeA, 5, "", "hash-1", "reserved"],
    ["3339998888", codeA, 5, "", "hash-2", "reserved"],
    ["3345556677", codeB, 5, "2026-08-28T00:00:00Z", "hash-3", "granted"],
    ["3357778899", codeB, 5, "", "hash-4", "failed"],
    ["3367778899", codeA, 5, "", "hash-5", "rejected"]
  ];
  const sheet = {
    getLastRow: () => rows.length + 1,
    getRange: (row, column, rowCount, columnCount) => ({
      getValues: () => rows
        .slice(row - 2, row - 2 + rowCount)
        .map(values => values.slice(column - 2, column - 2 + columnCount))
    })
  };

  assert.equal(context.PROMO_MAX_UNIQUE_USERS_, 800);
  assert.equal(context.promoCountCampaignUsers_(sheet, codeA), 2);
  assert.equal(context.promoCountCampaignUsers_(sheet, codeB), 1);
  assert.equal(context.promoCountCampaignUsers_(sheet, "invalid"), 0);
  assert.equal(context.promoFindCampaignEntry_(sheet, codeA, "3331112222"), 2);
  assert.equal(context.promoFindCampaignEntry_(sheet, codeA, "3331112222", "granted"), 2);
  assert.equal(context.promoFindCampaignEntry_(sheet, codeA, "3331112222", "reserved"), 3);
  assert.equal(context.promoFindCampaignEntry_(sheet, codeA, "3339998888"), 4);
  assert.equal(context.promoFindCampaignEntry_(sheet, codeB, "3357778899"), 0);
  const history = context.promoReadHistory_(sheet, "3331112222");
  assert.equal(history.daysUsed, 5);
  assert.equal(history.usedCodeIds[codeA], true);
  assert.equal(history.usedCodeIds[codeB], undefined);

  // The counter reads the durable ledger, so deleting a mutable user row
  // cannot free a campaign place. The 800th reservation remains occupied.
  rows.length = 0;
  for (let index = 0; index < 800; index += 1) {
    rows.push([String(390000000000 + index), codeA, 5, "", `hash-${index}`, index % 2 ? "reserved" : "granted"]);
  }
  assert.equal(context.promoCountCampaignUsers_(sheet, codeA), 800);
  rows.pop();
  assert.equal(context.promoCountCampaignUsers_(sheet, codeA), 799);
});

test("legacy false promo flags do not become lifetime promo history", () => {
  const context = vm.createContext({ console });
  vm.runInContext(gasSource, context);
  const columns = {
    promoDaysUsed: 1,
    promoRedemptions: 2,
    lastPromoCodeId: 3,
    promoUsedCodeIds: 4,
    promoFlag: 5,
    accessSource: 6
  };
  const rowForFlag = flag => [0, 0, "", "", flag, ""];

  [false, 0, "0", "false", "FALSE", "", null].forEach(flag => {
    assert.equal(context.promoRowHasPromoHistory_(rowForFlag(flag), columns), false);
  });
  [true, 1, "1", "true", "TRUE"].forEach(flag => {
    assert.equal(context.promoRowHasPromoHistory_(rowForFlag(flag), columns), true);
  });
  assert.equal(context.promoRowHasPromoHistory_([0, 0, "", "", false, "promo"], columns), true);
});

test("stale reservations reconcile to granted or failed before freeing a place", () => {
  let flushes = 0;
  const context = vm.createContext({
    console,
    SpreadsheetApp: { flush: () => { flushes += 1; } }
  });
  vm.runInContext(gasSource, context);
  const codeA = "a".repeat(64);
  const now = new Date("2026-08-23T12:00:00.000Z");
  const stale = new Date(now.getTime() - (11 * 60 * 1000));
  const recent = new Date(now.getTime() - (60 * 1000));
  const ledgerRows = [
    [stale, "393331111111", codeA, 5, "", "hash-1", "reserved"],
    [stale, "393332222222", codeA, 5, "", "hash-2", "reserved"],
    [recent, "393333333333", codeA, 5, "", "hash-3", "reserved"],
    [stale, "393334444444", codeA, 5, "", "hash-4", "granted"]
  ];
  const makeRange = (rows, row, column, rowCount, columnCount) => ({
    getValues: () => rows
      .slice(row - 2, row - 2 + rowCount)
      .map(values => values.slice(column - 1, column - 1 + columnCount)),
    setValue: value => { rows[row - 2][column - 1] = value; },
    setValues: values => values.forEach((nextRow, rowOffset) => {
      nextRow.forEach((value, columnOffset) => {
        rows[row - 2 + rowOffset][column - 1 + columnOffset] = value;
      });
    })
  });
  const redemptionSheet = {
    getLastRow: () => ledgerRows.length + 1,
    getRange: (row, column, rowCount = 1, columnCount = 1) =>
      makeRange(ledgerRows, row, column, rowCount, columnCount)
  };
  const userRows = [["393331111111", codeA, codeA]];
  const usersSheet = {
    getLastRow: () => userRows.length + 1,
    getRange: (row, column, rowCount, columnCount) =>
      makeRange(userRows, row, column, rowCount, columnCount)
  };
  const columns = { phone: 1, lastPromoCodeId: 2, promoUsedCodeIds: 3 };

  context.promoReconcileStaleReservations_(redemptionSheet, usersSheet, columns, codeA, now);
  assert.equal(ledgerRows[0][6], "granted");
  assert.equal(ledgerRows[1][6], "failed");
  assert.equal(ledgerRows[2][6], "reserved");
  assert.equal(ledgerRows[3][6], "granted");
  assert.equal(flushes, 1);
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

test("login presents the optional promo-code field", () => {
  const phoneIndex = pageSource.indexOf('id="user"');
  assert.ok(phoneIndex > 0);
  assert.match(pageSource, /id="promoCode"[^>]*aria-describedby="promoCodeHint err"/);
  assert.match(pageSource, /id="promoCodeHint"[^>]*>Con un codice valido ricevi 5 giorni/);
  assert.match(scriptSource, /promoCode: promoCode \|\| undefined/);
});

test("landing renders the promo login without exposing environment values", () => {
  assert.match(pageSource, /class="promo-access-card"/);
  assert.match(pageSource, /id="promoLandingPhone"[\s\S]*?id="promoLandingCode"/);
  assert.match(pageSource, /<form class="promo-access-form"[^>]*novalidate[^>]*loginFromPromoCard\(\)/);
  assert.match(pageSource, /id="promoAccessNextStep"[^>]*role="status"[\s\S]*?Spero che ti sia piaciuta la nostra ultima promo\./);
  assert.match(pageSource, /class="promo-access-packages-button"[^>]*aria-describedby="promoAccessNextTitle promoAccessNextMessage"[^>]*openPromoPackages\(\)[^>]*>Vedi i pacchetti/);
  assert.match(pageSource, /id="joinPackagesTitle" tabindex="-1">Pacchetti MagicBook/);
  assert.match(scriptSource, /promoConversionErrors = \["promo_already_used", "promo_code_reused", "promo_limit_reached", "promo_campaign_full"\]/);
  assert.match(scriptSource, /function openPromoPackages\(\)[\s\S]*?showJoinScreen\(\)[\s\S]*?joinPackagesTitle/);
  assert.match(scriptSource, /service-worker\.js\?v=41-promo-single-use/);
  assert.match(styleSource, /\.promo-access-next-step[\s\S]*?\.promo-access-packages-button/);
  assert.match(styleSource, /\.promo-access-packages-button:focus-visible[\s\S]*?outline-color: #075f55/);
  assert.doesNotMatch(pageSource, /class="trial-card"/);
  assert.doesNotMatch(pageSource, /PROMO_CODE_5_DAYS|PROMO_CODE_5_DAYS_EXPIRES_AT/);
});
