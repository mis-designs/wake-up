import assert from "node:assert/strict";
import test from "node:test";

import { getSessionRole } from "../api/getPages.js";

test("validated admin device recovers its role even when the previous browser token is missing", () => {
  const adminPhones = ["391234567890"];
  assert.equal(getSessionRole("391234567890", { role: "admin" }, adminPhones), "admin");
  assert.equal(getSessionRole("391234567890", {}, adminPhones), "admin");
  assert.equal(getSessionRole("+39 123 456 7890", null, adminPhones), "admin");
});

test("server allow-list remains the authority for the refreshed admin role", () => {
  const signedAdmin = { ok: true, signatureValid: true, payload: { role: "admin" } };
  assert.equal(getSessionRole("391234567890", signedAdmin, ["391234567890"]), "admin");
  assert.equal(getSessionRole("391234567890", signedAdmin, ["399999999999"]), "user");
  assert.equal(getSessionRole("399999999999", signedAdmin, ["391234567890"]), "user");
});

test("expired token cannot remove an administrator that is still configured", () => {
  const expiredButVerifiedAdmin = {
    ok: false,
    error: "token_expired",
    signatureValid: true,
    payload: { role: "admin" }
  };

  assert.equal(getSessionRole("391234567890", expiredButVerifiedAdmin, ["391234567890"]), "admin");
  assert.equal(
    getSessionRole("391234567890", { ...expiredButVerifiedAdmin, signatureValid: false }, ["391234567890"]),
    "admin"
  );
  assert.equal(getSessionRole("391234567890", expiredButVerifiedAdmin, []), "user");
});
