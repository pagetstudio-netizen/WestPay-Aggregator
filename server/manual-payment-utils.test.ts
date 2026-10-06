import assert from "node:assert/strict";
import test from "node:test";
import { buildManualUssdCode } from "./manual-payment-utils";

test("a missing per-number USSD template produces no USSD code", () => {
  assert.equal(buildManualUssdCode(null, 1_000, "+22899935673", "Togo"), null);
  assert.equal(buildManualUssdCode(" ", 1_000, "+22899935673", "Togo"), null);
});

test("a per-number USSD template is filled with the amount and local recipient number", () => {
  assert.equal(
    buildManualUssdCode("*145*1*{{amount}}*{{number}}#", 1_000, "+22899935673", "Togo"),
    "*145*1*1000*99935673#",
  );
});
