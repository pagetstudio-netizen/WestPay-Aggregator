const LEGACY_FEE_PROVIDERS = new Set(["mobile_money", "drimpay", "seapay", "clapay"]);

export function resolveOriginalMerchantCredit(payment: {
  amount: number;
  merchantCredit: number | null;
  provider: string;
  providerFee: number | null;
}): number | null {
  const amount = Number(payment.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;

  if (payment.merchantCredit != null) {
    const credit = Number(payment.merchantCredit);
    return Number.isSafeInteger(credit) && credit >= 0 && credit <= amount ? credit : null;
  }

  // Legacy records from these flows stored the exact WestPay deduction in
  // provider_fee. Other providers sometimes store their own fee there instead.
  if (!LEGACY_FEE_PROVIDERS.has(String(payment.provider || "").toLowerCase())) return null;
  if (payment.providerFee == null) return null;
  const fee = Number(payment.providerFee);
  if (!Number.isSafeInteger(fee) || fee < 0 || fee > amount) return null;
  return amount - fee;
}
