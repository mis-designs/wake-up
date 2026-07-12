import assert from "node:assert/strict";
import test from "node:test";

import { getSessionRole } from "../api/getPages.js";

test("subscription validation never elevates a session to admin", () => {
  assert.equal(getSessionRole("391234567890", { role: "admin" }), "user");
  assert.equal(getSessionRole("391234567890", {}), "user");
});
