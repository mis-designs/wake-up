import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { getSessionRole } from "../api/getPages.js";
import { verifyAdminToken } from "../api/admin.js";

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
  const adminPhones = ["391234567890"];
  assert.equal(getSessionRole("391234567890", null, adminPhones), "user");
  assert.equal(getSessionRole("391234567890", {}, adminPhones), "user");
  assert.equal(getSessionRole("391234567890", { ok: false, payload: { role: "admin" } }, adminPhones), "user");
});

test("only a valid signed token carrying the admin role grants admin authority", () => {
  const signedAdmin = { ok: true, payload: { role: "admin" } };
  const signedUser = { ok: true, payload: { role: "user" } };
  assert.equal(getSessionRole("391234567890", signedAdmin, []), "admin");
  assert.equal(getSessionRole("391234567890", signedUser, ["391234567890"]), "user");
});

test("expired or invalid admin tokens fail closed", () => {
  const expiredAdmin = { ok: false, error: "token_expired", payload: { role: "admin" } };
  assert.equal(getSessionRole("391234567890", expiredAdmin, ["391234567890"]), "user");
  assert.equal(getSessionRole("391234567890", { ok: true, payload: {} }, ["391234567890"]), "user");
});
