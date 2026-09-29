import assert from "node:assert/strict";
import test from "node:test";
import {
  getMerchantCategory,
  getSettlementCycle,
  isMerchantCategory,
  isMerchantSettlementCycle,
  MERCHANT_CATEGORIES,
  MERCHANT_SETTLEMENT_CYCLES,
} from "./merchant-account";

test("merchant account labels include D0 through D+30 and periodic cycles", () => {
  const dayCycles = MERCHANT_SETTLEMENT_CYCLES.filter(option =>
    option.value === "D0" || option.value.startsWith("D+"),
  );
  assert.equal(dayCycles.length, 31);
  assert.equal(dayCycles[0].value, "D0");
  assert.equal(dayCycles[30].value, "D+30");
  assert.deepEqual(
    MERCHANT_SETTLEMENT_CYCLES.filter(option => !option.value.startsWith("D")).map(option => option.value),
    ["WEEKLY", "EVERY_TWO_WEEKS", "MONTHLY", "CUSTOM"],
  );
});

test("merchant account labels have French admin and Chinese merchant copy", () => {
  assert.equal(getSettlementCycle("D0")?.descriptionFr, "Règlement prévu le jour même de l’opération.");
  assert.equal(getSettlementCycle("D+2")?.descriptionZh, "预计在交易后 2 个工作日结算。");
  assert.equal(getMerchantCategory("investment")?.labelFr, "Investissement");
  assert.equal(getMerchantCategory("investment")?.labelZh, "投资");
});

test("merchant account choices reject unsupported values", () => {
  assert.equal(isMerchantSettlementCycle("D+30"), true);
  assert.equal(isMerchantSettlementCycle("D+31"), false);
  assert.equal(isMerchantCategory("other_platforms"), true);
  assert.equal(isMerchantCategory("unlisted"), false);
  assert.equal(MERCHANT_CATEGORIES.length, 4);
});