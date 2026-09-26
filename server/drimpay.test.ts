import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  parseDrimpayCountryMappings,
  resolveDrimpayRoute,
  verifyDrimpayWebhookSignature,
  type DrimpayConfig,
} from "./drimpay";

test("Drimpay country mappings route pay-ins and payout-specific operator codes", () => {
  const countryMappings = parseDrimpayCountryMappings(JSON.stringify({
    "Côte d'Ivoire": {
      countryCode: "CI",
      currency: "XOF",
      operators: { "Orange Money": "ORANGE_PAYIN" },
      payoutOperators: { "Orange Money": "ORANGE_PAYOUT" },
    },
  }));
  const config: DrimpayConfig = {
    apiKey: "test-api-key",
    environment: "sandbox",
    baseUrl: "https://example.invalid",
    countryMappings,
  };

  assert.deepEqual(resolveDrimpayRoute(config, "cote d'ivoire", "orange-money", "payin"), {
    countryCode: "CI",
    currency: "XOF",
    operatorCode: "ORANGE_PAYIN",
  });
  assert.deepEqual(resolveDrimpayRoute(config, "Côte d'Ivoire", "Orange Money", "payout"), {
    countryCode: "CI",
    currency: "XOF",
    operatorCode: "ORANGE_PAYOUT",
  });
});

test("Drimpay mapping validation rejects malformed JSON and missing operator codes", () => {
  assert.throws(() => parseDrimpayCountryMappings("{"));
  assert.throws(() => parseDrimpayCountryMappings(JSON.stringify({
    Ghana: { countryCode: "GH", currency: "GHS", operators: { MTN: "" } },
  })));
});

test("Drimpay verifies timestamped and legacy HMAC signatures and rejects stale timestamps", () => {
  const secret = "local-test-secret";
  const rawBody = '{"order_id":"DP-PAY-test","status":"success"}';
  const nowMs = 1_700_000_000_000;
  const timestamp = String(nowMs / 1000);
  const timestampedDigest = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const legacyDigest = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  assert.equal(verifyDrimpayWebhookSignature({
    signature: `t=${timestamp},v1=${timestampedDigest}`,
    secret,
    rawBody,
    nowMs,
  }), true);
  assert.equal(verifyDrimpayWebhookSignature({
    signature: `t=${timestamp},v1=${timestampedDigest}`,
    secret,
    rawBody,
    nowMs: nowMs + 6 * 60 * 1000,
  }), false);
  assert.equal(verifyDrimpayWebhookSignature({
    signature: `sha256=${legacyDigest}`,
    secret,
    rawBody,
    nowMs,
  }), true);
  assert.equal(verifyDrimpayWebhookSignature({
    signature: `sha256=${"0".repeat(64)}`,
    secret,
    rawBody,
    nowMs,
  }), false);
});