// Keep provider implementation details out of buyer-facing errors without
// hard-coding a list of provider brands.
const PAYMENT_PROVIDER_PATTERN =
  /\b(?:provider|gateway|upstream|credential|api\s*key|signature)\b/i;

export function sanitizePaymentMessage(
  value: unknown,
  fallback = "Le service de paiement est momentanément indisponible. Veuillez réessayer.",
): string {
  const message = typeof value === "string" ? value.trim() : "";
  if (!message || PAYMENT_PROVIDER_PATTERN.test(message)) return fallback;
  return message;
}