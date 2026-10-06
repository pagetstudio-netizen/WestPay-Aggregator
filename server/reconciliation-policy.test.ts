import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTO_STATUS_CHECK_INTERVAL_MS,
  AUTO_STATUS_MAX_CHECKS,
  AUTO_TIMEOUT_ERROR_MARKER,
  MANUAL_PAYIN_EXPIRY_MS,
  PENDING_OPERATION_TIMEOUT_MS,
  isAutomaticStatusCheckDue,
  isAutomaticWithdrawal,
  isAutomaticWithdrawalStatusOpen,
  isManualPayinExpired,
  isPendingOperationExpired,
} from "./reconciliation-policy";

const createdAt = new Date("2026-01-01T00:00:00.000Z");

test("provider status checks wait seven seconds and stop after five attempts", () => {
  assert.equal(AUTO_STATUS_CHECK_INTERVAL_MS, 7_000);
  assert.equal(AUTO_STATUS_MAX_CHECKS, 5);
  assert.equal(isAutomaticStatusCheckDue(0, null, createdAt, createdAt.getTime() + 6_999), false);
  assert.equal(isAutomaticStatusCheckDue(0, null, createdAt, createdAt.getTime() + 7_000), true);
  assert.equal(isAutomaticStatusCheckDue(2, new Date(createdAt.getTime() + 14_000), createdAt, createdAt.getTime() + 20_999), false);
  assert.equal(isAutomaticStatusCheckDue(2, new Date(createdAt.getTime() + 14_000), createdAt, createdAt.getTime() + 21_000), true);
  assert.equal(isAutomaticStatusCheckDue(5, new Date(createdAt.getTime() + 28_000), createdAt, createdAt.getTime() + 60_000), false);
});

test("pending payment and payout deadline is exactly three hours", () => {
  assert.equal(PENDING_OPERATION_TIMEOUT_MS, 3 * 60 * 60 * 1000);
  assert.equal(MANUAL_PAYIN_EXPIRY_MS, PENDING_OPERATION_TIMEOUT_MS);
  assert.equal(isPendingOperationExpired(createdAt, createdAt.getTime() + PENDING_OPERATION_TIMEOUT_MS - 1), false);
  assert.equal(isPendingOperationExpired(createdAt, createdAt.getTime() + PENDING_OPERATION_TIMEOUT_MS), true);
  assert.equal(AUTO_TIMEOUT_ERROR_MARKER, "AUTO_TIMEOUT_3H");
});

test("manual payins with or without proof expire after three hours, including legacy rows", () => {
  const twoHourExpiry = new Date(createdAt.getTime() + 2 * 60 * 60 * 1000);
  assert.equal(isManualPayinExpired(createdAt, twoHourExpiry.getTime()), false);
  assert.equal(
    isManualPayinExpired(createdAt, createdAt.getTime() + PENDING_OPERATION_TIMEOUT_MS),
    true,
  );
});

test("manual withdrawals are not automatically reconciled or expired", () => {
  assert.equal(isAutomaticWithdrawal("manual", "mbiyo"), false);
  assert.equal(isAutomaticWithdrawal("auto", "manual"), false);
  assert.equal(isAutomaticWithdrawal("auto", "mbiyo"), true);
  assert.equal(isAutomaticWithdrawalStatusOpen("pending"), true);
  assert.equal(isAutomaticWithdrawalStatusOpen("processing"), true);
  assert.equal(isAutomaticWithdrawalStatusOpen("approved"), false);
});
