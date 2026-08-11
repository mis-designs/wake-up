import assert from "node:assert/strict";
import test from "node:test";
import {
  createGuestTrialToken,
  GUEST_TRIAL_DURATION_MS,
  verifyGuestTrialToken
} from "../api/trialAccess.js";

test("guest trial key is signed, device-bound and limited to chapters 1 and 3", () => {
  const secret = "test-secret-with-enough-entropy";
  const trialId = "trial_test_device_123456";
  const issuedAt = Date.now();
  const issued = createGuestTrialToken(trialId, secret);
  const payload = verifyGuestTrialToken(issued.token, trialId, secret);
  assert.deepEqual(payload.chapters, [1, 3]);
  assert.ok(issued.expiresAt >= issuedAt + GUEST_TRIAL_DURATION_MS);
  assert.ok(issued.expiresAt <= Date.now() + GUEST_TRIAL_DURATION_MS);
  assert.equal(verifyGuestTrialToken(issued.token, "trial_other_device_123", secret), null);
  assert.equal(verifyGuestTrialToken(`${issued.token}tampered`, trialId, secret), null);
});
