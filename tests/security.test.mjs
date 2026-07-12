import assert from "node:assert/strict";
import test from "node:test";

import { getSessionRole } from "../api/getPages.js";

test("subscription validation never elevates an unsigned session to admin", () => {
  const adminPhones = ["391234567890"];
  assert.equal(getSessionRole("391234567890", { role: "admin" }, adminPhones), "user");
  assert.equal(getSessionRole("391234567890", {}, adminPhones), "user");
});

test("subscription validation preserves a signed admin only while configured on Vercel", () => {
  const signedAdmin = { ok: true, signatureValid: true, payload: { role: "admin" } };
  assert.equal(getSessionRole("391234567890", signedAdmin, ["391234567890"]), "admin");
  assert.equal(getSessionRole("391234567890", signedAdmin, ["399999999999"]), "user");
  assert.equal(getSessionRole("391234567890", { ok: true, signatureValid: true, payload: { role: "user" } }, ["391234567890"]), "user");
});

test("subscription validation preserves admin across a safely verified token refresh", () => {
  const expiredButVerifiedAdmin = {
    ok: false,
    error: "token_expired",
    signatureValid: true,
    payload: { role: "admin" }
  };

  assert.equal(getSessionRole("391234567890", expiredButVerifiedAdmin, ["391234567890"]), "admin");
  assert.equal(
    getSessionRole("391234567890", { ...expiredButVerifiedAdmin, signatureValid: false }, ["391234567890"]),
    "user"
  );
});
