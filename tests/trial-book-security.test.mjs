import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedTrialBookRequest } from "../api/trialBook.js";

test("free book access is restricted to chapters 1 and 3", () => {
  assert.equal(isAllowedTrialBookRequest(1, 1), true);
  assert.equal(isAllowedTrialBookRequest("3", 25), true);
  for (const chapter of ["2", "4", "5", "0", "1,3", "../../1"]) {
    assert.equal(isAllowedTrialBookRequest(chapter, 1), false);
  }
});

test("free book access accepts only bounded integer pages", () => {
  for (const page of [0, -1, 1.5, "bad", 10001]) assert.equal(isAllowedTrialBookRequest(1, page), false);
});
