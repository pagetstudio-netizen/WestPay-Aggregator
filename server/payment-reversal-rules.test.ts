import assert from "node:assert/strict";
import test from "node:test";
import { resolveOriginalMerchantCredit } from "./payment-reversal-rules";

test("uses the stored original merchant credit, including a zero-fee payment", () => {
  assert.equal(resolveOriginalMerchantCredit({
    amount: 1000,
    merchantCredit: 945,
    provider: "lipapap",
    providerFee: 0,
  }), 945);
});

test("uses the legacy platform deduction only for providers with known semantics", () => {
  assert.equal(resolveOriginalMerchantCredit({
    amount: 1000,
    merchantCredit: null,
    provider: "drimpay",
    providerFee: 55,
  }), 945);
  assert.equal(resolveOriginalMerchantCredit({
    amount: 1000,
    merchantCredit: null,
    provider: "mobile_money",
    providerFee: 0,
  }), 1000);
});

test("refuses to guess the original credit for unknown or ambiguous legacy records", () => {
  assert.equal(resolveOriginalMerchantCredit({
    amount: 1000,
    merchantCredit: null,
    provider: "lipapap",
    providerFee: 0,
  }), null);
  assert.equal(resolveOriginalMerchantCredit({
    amount: 1000,
    merchantCredit: null,
    provider: "mbiyo",
    providerFee: 55,
  }), null);
  assert.equal(resolveOriginalMerchantCredit({
    amount: 1000,
    merchantCredit: null,
    provider: "clapay",
    providerFee: null,
  }), null);
});

test("rejects credits and fees outside the transaction amount", () => {
  assert.equal(resolveOriginalMerchantCredit({
    amount: 1000,
    merchantCredit: 1001,
    provider: "clapay",
    providerFee: 0,
  }), null);
  assert.equal(resolveOriginalMerchantCredit({
    amount: 1000,
    merchantCredit: null,
    provider: "seapay",
    providerFee: 1001,
  }), null);
});
