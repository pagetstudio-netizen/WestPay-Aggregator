import { calcMerchantCredit, FLAT_PAYIN_FEE } from "./feeConfig";

export function calcMerchantCreditForMerchant(
  grossAmount: number,
  country: string | null | undefined,
  merchant: { feeExempt?: boolean; customFeeRate?: number | null } | null | undefined,
): number {
  if (merchant?.customFeeRate != null) {
    const flatFee = country && FLAT_PAYIN_FEE[country] ? FLAT_PAYIN_FEE[country] : 0;
    return Math.max(0, Math.floor(grossAmount * (1 - merchant.customFeeRate / 100) - flatFee));
  }
  if (merchant?.feeExempt) return grossAmount;
  return calcMerchantCredit(grossAmount, country);
}