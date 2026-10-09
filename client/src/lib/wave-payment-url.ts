export function addWaveAmountToPaymentUrl(
  paymentUrl: string,
  amount: number,
  currency: string,
): string {
  if (
    currency.trim().toUpperCase() !== "XOF" ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    return paymentUrl;
  }

  try {
    const url = new URL(paymentUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "pay.wave.com" ||
      url.port ||
      url.username ||
      url.password
    ) {
      return paymentUrl;
    }

    url.searchParams.set("amount", String(amount));
    return url.toString();
  } catch {
    return paymentUrl;
  }
}
