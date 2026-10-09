import assert from "node:assert/strict";
import { test } from "node:test";
import { addWaveAmountToPaymentUrl } from "./wave-payment-url";

test("adds the selected XOF amount to a Wave payment URL", () => {
  const result = new URL(
    addWaveAmountToPaymentUrl("https://pay.wave.com/c/merchant-123?lang=fr", 5000, "XOF"),
  );

  assert.equal(result.pathname, "/c/merchant-123");
  assert.equal(result.searchParams.get("lang"), "fr");
  assert.equal(result.searchParams.get("amount"), "5000");
});

test("replaces existing amount values without changing the account path or other parameters", () => {
  const result = new URL(
    addWaveAmountToPaymentUrl(
      "https://pay.wave.com/c/merchant-123?amount=1200&source=westpay&amount=2500#checkout",
      5000,
      "xof",
    ),
  );

  assert.equal(result.pathname, "/c/merchant-123");
  assert.equal(result.searchParams.get("amount"), "5000");
  assert.equal(result.searchParams.getAll("amount").length, 1);
  assert.equal(result.searchParams.get("source"), "westpay");
  assert.equal(result.hash, "#checkout");
});

test("leaves links to other sites and non-XOF payments unchanged", () => {
  const otherSiteUrl = "https://payments.example.com/account?amount=1200&source=westpay";
  const otherCountryWaveUrl = "https://pay.wave.com/c/merchant-123?amount=1200&source=westpay";

  assert.equal(addWaveAmountToPaymentUrl(otherSiteUrl, 5000, "XOF"), otherSiteUrl);
  assert.equal(addWaveAmountToPaymentUrl(otherCountryWaveUrl, 5000, "GHS"), otherCountryWaveUrl);
});

test("leaves non-HTTPS or non-canonical Wave hosts and invalid XOF amounts unchanged", () => {
  const httpUrl = "http://pay.wave.com/c/merchant-123?source=westpay";
  const subdomainUrl = "https://checkout.pay.wave.com/c/merchant-123?source=westpay";
  const validUrl = "https://pay.wave.com/c/merchant-123?source=westpay";

  assert.equal(addWaveAmountToPaymentUrl(httpUrl, 5000, "XOF"), httpUrl);
  assert.equal(addWaveAmountToPaymentUrl(subdomainUrl, 5000, "XOF"), subdomainUrl);
  assert.equal(addWaveAmountToPaymentUrl(validUrl, 0, "XOF"), validUrl);
  assert.equal(addWaveAmountToPaymentUrl(validUrl, 5000.5, "XOF"), validUrl);
});
