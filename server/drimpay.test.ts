import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  getDrimpayWalletBalance,
  initiateDrimpayPayout,
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
      payoutOperators: { "Orange Money": "ORANGE_PAYOUT", Wave: "WAVE_PAYOUT" },
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
  assert.deepEqual(resolveDrimpayRoute(config, "Côte d'Ivoire", "wave", "payout"), {
    countryCode: "CI",
    currency: "XOF",
    operatorCode: "WAVE_PAYOUT",
  });
});

test("Drimpay payout uses the documented v2 fields and a stable external reference", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ reference: "OUT-123", status: "processing" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await initiateDrimpayPayout({
      apiKey: "test-api-key",
      environment: "sandbox",
      baseUrl: "https://example.invalid/api/v2",
      countryMappings: {},
    }, {
      amount: 1000,
      currency: "XOF",
      countryCode: "SN",
      operator: "WAVE_PAYOUT",
      phone: "+221770000000",
      orderId: "DP-WD-123",
      webhookUrl: "https://example.invalid/webhook",
      description: "Retrait de test",
    });

    const body = JSON.parse(String(requestInit?.body));
    assert.equal(requestUrl, "https://example.invalid/api/v2/payout/initiate");
    assert.equal(body.country_code, "SN");
    assert.equal(body.operator, "WAVE_PAYOUT");
    assert.equal(body.external_ref, "DP-WD-123");
    assert.equal(body.order_id, "DP-WD-123");
    assert.equal(body.description, "Retrait de test");
    assert.deepEqual(result, {
      reference: "OUT-123",
      status: "processing",
      raw: { reference: "OUT-123", status: "processing" },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Drimpay wallet balance uses the documented per-country endpoint", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({
      country_code: "SN",
      currency: "XOF",
      balance: 125000,
      active: true,
      mode: "live",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await getDrimpayWalletBalance({
      apiKey: "test-api-key",
      environment: "production",
      baseUrl: "https://example.invalid/api/v2",
      countryMappings: {},
    }, "sn");

    assert.equal(requestUrl, "https://example.invalid/api/v2/payout/wallets/SN/balance");
    assert.equal(new Headers(requestInit?.headers).get("Authorization"), "Bearer test-api-key");
    assert.deepEqual(result, {
      countryCode: "SN",
      currency: "XOF",
      balance: 125000,
      active: true,
      mode: "live",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
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