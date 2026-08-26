const PAYMENT_PROVIDER_PATTERN =
  /\b(?:clapay|nowallet|mbiyopay|mbiyo|sendavapay|sendava\s*pay|seapay|sea\s*pay|omnipay|omni\s*pay|oxapay|oxa\s*pay)\b/i;

export function sanitizePaymentMessage(
  value: unknown,
  fallback = "Le service de paiement est momentanément indisponible. Veuillez réessayer.",
): string {
  const message = typeof value === "string" ? value.trim() : "";
  if (!message || PAYMENT_PROVIDER_PATTERN.test(message)) return fallback;
  return message;
}