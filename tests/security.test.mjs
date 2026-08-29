import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getSessionRole } from "../api/getPages.js";
import { verifyAdminToken } from "../api/admin.js";

const clientSource = readFileSync(new URL("../script.js", import.meta.url), "utf8");

function signAdminToken({ phone, deviceId, role = "admin", exp = Date.now() + 60_000 }, secret) {
  const payload = { phone, deviceId, role, purpose: "access", exp };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

test("the admin API rejects missing, forged, expired and non-admin tokens", () => {
  const secret = "test-session-secret-with-enough-entropy";
  const phone = "391234567890";
  const deviceId = "device_12345678";

  assert.equal(verifyAdminToken("", phone, deviceId, secret).ok, false);

  const valid = signAdminToken({ phone, deviceId }, secret);
  assert.equal(verifyAdminToken(valid, phone, deviceId, secret).ok, true);
  assert.equal(verifyAdminToken(`${valid}x`, phone, deviceId, secret).ok, false);

  const expired = signAdminToken({ phone, deviceId, exp: Date.now() - 1 }, secret);
  assert.equal(verifyAdminToken(expired, phone, deviceId, secret).error, "token_expired");

  const userToken = signAdminToken({ phone, deviceId, role: "user" }, secret);
  assert.equal(verifyAdminToken(userToken, phone, deviceId, secret).error, "admin_required");
  assert.equal(verifyAdminToken(valid, phone, "other_device_123", secret).ok, false);
});

test("a phone allow-list entry cannot create admin authority without a valid signed token", () => {
  const phone = "391234567890";
  const adminPhones = ["391234567890"];
  assert.equal(getSessionRole(phone, null, adminPhones), "user");
  assert.equal(getSessionRole(phone, {}, adminPhones), "user");
  assert.equal(getSessionRole(phone, {
    ok: false,
    signatureValid: false,
    payload: { phone, role: "admin" }
  }, adminPhones), "user");
});

test("a signed admin session keeps its role across token expiry while it remains allowed", () => {
  const phone = "391234567890";
  const signedAdmin = {
    ok: true,
    signatureValid: true,
    payload: { phone, role: "admin" }
  };
  const expiredSignedAdmin = {
    ...signedAdmin,
    ok: false,
    error: "token_expired"
  };

  assert.equal(getSessionRole(phone, signedAdmin, [phone]), "admin");
  assert.equal(getSessionRole(phone, expiredSignedAdmin, [phone]), "admin");
  assert.equal(getSessionRole(`+39 123 456 7890`, expiredSignedAdmin, [phone]), "admin");
});

test("admin renewal fails closed when the proof, phone binding or allow-list does not match", () => {
  const phone = "391234567890";
  const signedAdmin = {
    ok: false,
    error: "token_expired",
    signatureValid: true,
    payload: { phone, role: "admin" }
  };

  assert.equal(getSessionRole(phone, signedAdmin, []), "user");
  assert.equal(getSessionRole(phone, signedAdmin, ["399999999999"]), "user");
  assert.equal(getSessionRole(phone, {
    ...signedAdmin,
    payload: { phone: "399999999999", role: "admin" }
  }, [phone]), "user");
  assert.equal(getSessionRole(phone, {
    ...signedAdmin,
    payload: { phone, role: "user" }
  }, [phone]), "user");
});

test("admin recovery retries only read-only operations", () => {
  assert.match(clientSource, /const readOnlyAction = action === "recent" \|\| action === "list" \|\| action === "search" \|\| action === "promo_users"/);
  assert.match(clientSource, /ADMIN_READ_RETRYABLE_ERRORS/);
  assert.match(clientSource, /const maxTransientAttempts = action === "promo_users" \? 1 : 2/);
  assert.match(clientSource, /transientAttempt < maxTransientAttempts/);
  assert.doesNotMatch(clientSource, /readOnlyAction = [^\n]*(?:create|renew|delete)/);
});
