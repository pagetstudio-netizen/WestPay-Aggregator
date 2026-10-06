import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeMerchantPaymentStatus,
  removePaymentAttemptsAlreadyFinalized,
} from "./merchant-payment-history";

test("provider payment states map to the merchant history filters", () => {
  assert.equal(normalizeMerchantPaymentStatus("gateway_pending"), "pending");
  assert.equal(normalizeMerchantPaymentStatus("manual_submitted"), "pending");
  assert.equal(normalizeMerchantPaymentStatus("gateway_confirmed"), "confirmed");
  assert.equal(normalizeMerchantPaymentStatus("lipapap_failed"), "failed");
  assert.equal(normalizeMerchantPaymentStatus("expired"), "failed");
  assert.equal(normalizeMerchantPaymentStatus("provider_state_unknown"), "pending");
});

test("attempts matching a finalized transaction by any reference are deduplicated", () => {
  const transactions = [{
    txId: "WP-ABC",
    providerReference: "gateway-ref-4",
    providerTxId: "provider-tx-9",
  }];
  const attempts = [
    { id: 1, txId: "wp-abc" },
    { id: 2, providerReference: "GATEWAY-REF-4" },
    { id: 3, providerTxId: "provider-tx-9" },
    { id: 4, txId: "different-attempt" },
  ];

  assert.deepEqual(
    removePaymentAttemptsAlreadyFinalized(attempts, transactions),
    [{ id: 4, txId: "different-attempt" }],
  );
});
