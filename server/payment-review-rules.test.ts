import assert from "node:assert/strict";
import test from "node:test";
import { getPaymentReviewActions } from "./payment-review-rules";

test("only pending payments expose approve and reject actions", () => {
  for (const status of ["pending", "gateway_pending", "lipapap_pending", "submitted"]) {
    assert.deepEqual(
      getPaymentReviewActions({ source: "pending", gateway: "mbiyo", status }),
      { approve: true, reject: true },
    );
    assert.deepEqual(
      getPaymentReviewActions({ source: "transaction", gateway: "mbiyo", status }),
      { approve: true, reject: true },
    );
  }
});

test("manual requests waiting for customer proof can only be rejected", () => {
  assert.deepEqual(
    getPaymentReviewActions({
      source: "pending",
      gateway: "manual",
      status: "manual_waiting_submission",
    }),
    { approve: false, reject: true },
  );
  assert.deepEqual(
    getPaymentReviewActions({
      source: "pending",
      gateway: "manual",
      status: "manual_submitted",
    }),
    { approve: true, reject: true },
  );
});

test("final and failed payments never expose review actions", () => {
  for (const status of [
    "confirmed",
    "completed",
    "paid",
    "rejected",
    "manual_rejected",
    "failed",
    "gateway_failed",
    "gateway_confirmed",
    "lipapap_confirmed",
  ]) {
    assert.deepEqual(
      getPaymentReviewActions({ source: "pending", gateway: "clapay", status }),
      { approve: false, reject: false },
    );
    assert.deepEqual(
      getPaymentReviewActions({ source: "transaction", gateway: "clapay", status }),
      { approve: false, reject: false },
    );
  }
});
