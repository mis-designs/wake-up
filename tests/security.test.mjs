import assert from "node:assert/strict";
import test from "node:test";

import { getSessionRole } from "../api/getPages.js";

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
