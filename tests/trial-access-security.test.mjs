import assert from "node:assert/strict";
import test from "node:test";
import {
  createGuestTrialToken,
  GUEST_TRIAL_ENABLED,
  GUEST_TRIAL_DURATION_MS,
  verifyGuestTrialToken
} from "../api/trialAccess.js";

test("guest trial issuance and verification remain disabled", () => {
  const secret = "test-secret-with-enough-entropy";
  const trialId = "trial_test_device_123456";
  const issuedAt = Date.now();
  const issued = createGuestTrialToken(trialId, secret);
  assert.equal(GUEST_TRIAL_ENABLED, false);
  assert.ok(issued.expiresAt >= issuedAt + GUEST_TRIAL_DURATION_MS);
  assert.ok(issued.expiresAt <= Date.now() + GUEST_TRIAL_DURATION_MS);
  assert.equal(verifyGuestTrialToken(issued.token, trialId, secret), null);
  assert.equal(verifyGuestTrialToken(issued.token, "trial_other_device_123", secret), null);
  assert.equal(verifyGuestTrialToken(`${issued.token}tampered`, trialId, secret), null);
});
