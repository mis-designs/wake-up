import assert from "node:assert/strict";
import test from "node:test";
import { createGuestTrialToken, verifyGuestTrialToken } from "../api/trialAccess.js";

test("guest trial key is signed, device-bound and limited to chapters 2 and 4", () => {
  const secret = "test-secret-with-enough-entropy";
  const trialId = "trial_test_device_123456";
  const issued = createGuestTrialToken(trialId, secret);
  const payload = verifyGuestTrialToken(issued.token, trialId, secret);
  assert.deepEqual(payload.chapters, [2, 4]);
  assert.equal(verifyGuestTrialToken(issued.token, "trial_other_device_123", secret), null);
  assert.equal(verifyGuestTrialToken(`${issued.token}tampered`, trialId, secret), null);
});
