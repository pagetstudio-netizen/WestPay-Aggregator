export const MIN_PAYMENT_PHONE_DIGITS = 8;
export const MAX_PAYMENT_PHONE_DIGITS = 15;
export const MIN_PAYMENT_REFERENCE_CHARACTERS = 8;
export const MAX_PAYMENT_REFERENCE_CHARACTERS = 120;

export const PAYMENT_PHONE_VALIDATION_MESSAGE =
  "Numéro de paiement invalide : saisissez au moins 8 chiffres, sans lettres.";
export const PAYMENT_REFERENCE_VALIDATION_MESSAGE =
  "La référence doit contenir au moins 8 caractères non blancs, et au maximum 120 caractères.";

const PAYMENT_PHONE_CHARACTERS = /^\+?[0-9\s()-]+$/;

export function normalizePaymentPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const phone = value.trim();
  if (!phone || phone.length > 32 || !PAYMENT_PHONE_CHARACTERS.test(phone)) return null;

  const digits = phone.replace(/\D/g, "");
  if (digits.length < MIN_PAYMENT_PHONE_DIGITS || digits.length > MAX_PAYMENT_PHONE_DIGITS) {
    return null;
  }

  return phone;
}

export function isValidPaymentPhone(value: unknown): boolean {
  return normalizePaymentPhone(value) !== null;
}

export function normalizePaymentReference(value: unknown): string | null {
  const rawReference =
    typeof value === "string"
      ? value
      : typeof value === "number" && Number.isSafeInteger(value) && value >= 0
        ? String(value)
        : null;
  if (rawReference === null) return null;

  const reference = rawReference.trim();
  if (!reference || reference.length > MAX_PAYMENT_REFERENCE_CHARACTERS) return null;

  const meaningfulCharacters = reference.replace(/\s/g, "").length;
  if (meaningfulCharacters < MIN_PAYMENT_REFERENCE_CHARACTERS) return null;

  return reference;
}
