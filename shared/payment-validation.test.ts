import assert from "node:assert/strict";
import test from "node:test";
import { isValidPaymentPhone, normalizePaymentReference } from "./payment-validation";

test("payment phone accepts numeric numbers with at least eight digits", () => {
  assert.equal(isValidPaymentPhone("90000000"), true);
  assert.equal(isValidPaymentPhone("+228 90 00 00 00"), true);
});

test("payment phone rejects short values, pasted text, and unsupported punctuation", () => {
  assert.equal(isValidPaymentPhone("3039"), false);
  assert.equal(isValidPaymentPhone("mrogltlhlg"), false);
  assert.equal(isValidPaymentPhone("90ab0000"), false);
  assert.equal(isValidPaymentPhone("90.00.00.00"), false);
  assert.equal(isValidPaymentPhone("1234567890123456"), false);
});

test("payment reference accepts text or numbers with at least eight non-space characters", () => {
  assert.equal(normalizePaymentReference("12345678"), "12345678");
  assert.equal(normalizePaymentReference("mrogltlhlg"), "mrogltlhlg");
  assert.equal(normalizePaymentReference("TX 1234 AB"), "TX 1234 AB");
  assert.equal(normalizePaymentReference(12345678), "12345678");
});

test("payment reference rejects short or overlong values", () => {
  assert.equal(normalizePaymentReference("3039"), null);
  assert.equal(normalizePaymentReference("abcdefg"), null);
  assert.equal(normalizePaymentReference("        "), null);
  assert.equal(normalizePaymentReference("x".repeat(121)), null);
});
