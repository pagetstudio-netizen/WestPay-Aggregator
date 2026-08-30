const EMAIL_MAX_LENGTH = 254;
const EMAIL_LOCAL_MAX_LENGTH = 64;

// Format volontairement strict pour les comptes de l'application :
// - partie locale limitée aux caractères courants d'une adresse professionnelle
//   (sans espaces, guillemets, backticks, backslash ou séparateurs SQL)
// - domaine composé de labels valides et d'un TLD
const EMAIL_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

/**
 * Trim and normalize a user-supplied email, or return null when it is not
 * a valid application email address.
 *
 * This is input validation only; database queries must remain parameterized.
 */
export function normalizeEmailInput(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const email = value.trim().toLowerCase();
  const atIndex = email.lastIndexOf("@");
  const localPart = atIndex > 0 ? email.slice(0, atIndex) : "";
  const domainPart = atIndex > 0 ? email.slice(atIndex + 1) : "";

  if (
    email.length === 0 ||
    email.length > EMAIL_MAX_LENGTH ||
    localPart.length === 0 ||
    localPart.length > EMAIL_LOCAL_MAX_LENGTH ||
    localPart.includes("..") ||
    domainPart.includes("..") ||
    !EMAIL_PATTERN.test(email)
  ) {
    return null;
  }

  return email;
}