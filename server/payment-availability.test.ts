import assert from "node:assert/strict";
import test from "node:test";
import {
  isPaymentChannelAvailable,
  isWithinPaymentHours,
  PAYMENT_CHANNEL_UNAVAILABLE_MESSAGE,
} from "./payment-availability";

test("payment hours use the selected country's local timezone", () => {
  // Same instant: 13:00 in Togo, 18:00 in India, and 21:00 in the Philippines.
  const instant = new Date("2026-01-15T13:00:00.000Z");
  assert.equal(isWithinPaymentHours("Togo", instant), true);
  assert.equal(isWithinPaymentHours("India", instant), true);
  assert.equal(isWithinPaymentHours("Philippines", instant), false);
});

test("payment availability opens at 07:00 and closes at 20:00 local time", () => {
  assert.equal(isWithinPaymentHours("Togo", new Date("2026-01-15T06:59:00.000Z")), false);
  assert.equal(isWithinPaymentHours("Togo", new Date("2026-01-15T07:00:00.000Z")), true);
  assert.equal(isWithinPaymentHours("Togo", new Date("2026-01-15T19:59:00.000Z")), true);
  assert.equal(isWithinPaymentHours("Togo", new Date("2026-01-15T20:00:00.000Z")), false);
});

test("maintenance and unknown countries fail closed with the shared customer message", () => {
  const duringHours = new Date("2026-01-15T12:00:00.000Z");
  assert.equal(isPaymentChannelAvailable("Togo", duringHours, true), false);
  assert.equal(isPaymentChannelAvailable("Unknown country", duringHours), false);
  assert.match(PAYMENT_CHANNEL_UNAVAILABLE_MESSAGE, /7h à 20h/);
});
