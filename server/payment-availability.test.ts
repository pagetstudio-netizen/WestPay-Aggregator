import assert from "node:assert/strict";
import test from "node:test";
import {
  isPaymentChannelAvailable,
  PAYMENT_CHANNEL_UNAVAILABLE_MESSAGE,
  PAYMENT_PROVIDER_UNAVAILABLE_MESSAGE,
} from "./payment-availability";

test("admin maintenance flags alone control channel availability", () => {
  assert.equal(isPaymentChannelAvailable(false), true);
  assert.equal(isPaymentChannelAvailable(true), false);
  assert.doesNotMatch(PAYMENT_CHANNEL_UNAVAILABLE_MESSAGE, /7h|20h/);
});

test("provider initiation failures use a temporary channel-unavailable message", () => {
  assert.equal(
    PAYMENT_PROVIDER_UNAVAILABLE_MESSAGE,
    "Canal de paiement indisponible pour le moment. Veuillez réessayer plus tard.",
  );
});
