// Keep provider implementation details out of buyer-facing errors without
// hard-coding a list of provider brands.
const PAYMENT_PROVIDER_PATTERN =
  /\b(?:provider|gateway|upstream|credential|api\s*key|signature)\b/i;
const PAYMENT_PHONE_RULE_PATTERN =
  /(?:saisissez au moins 8 chiffres|au moins 8 chiffres|lettres ne sont pas acceptées)/i;
const PAYMENT_REFERENCE_RULE_PATTERN =
  /(?:référence doit contenir|8 caractères non blancs)/i;

export function sanitizePaymentMessage(
  value: unknown,
  fallback = "Le service de paiement est momentanément indisponible. Veuillez réessayer.",
): string {
  const message = typeof value === "string" ? value.trim() : "";
  if (PAYMENT_PHONE_RULE_PATTERN.test(message)) return "Numéro de téléphone invalide.";
  if (PAYMENT_REFERENCE_RULE_PATTERN.test(message)) return "Référence invalide.";
  if (!message || PAYMENT_PROVIDER_PATTERN.test(message)) return fallback;
  return message;
}