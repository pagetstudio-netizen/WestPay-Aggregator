/**
 * Log masking helpers — GDPR / privacy
 * Use these functions whenever personal data (phone numbers, wallet addresses,
 * street addresses) would otherwise appear in plaintext server logs readable
 * by the hosting provider.
 *
 * Phone masking:  '+22891****23'  (keep up to 5 prefix digits + last 2)
 * Address masking: 'bc1qa****ef12' (keep first 6 chars + last 4)
 */

/**
 * Mask a phone number for log output.
 * Keeps up to the first 5 digits and the last 2.
 * Examples:
 *   '22891234567' → '22891****67'
 *   '+22891234567' → '+22891****67'
 *   '90123456'    → '901****56'
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "?";
  const s = String(phone);
  // Preserve a leading '+' if present
  const prefix = s.startsWith("+") ? "+" : "";
  const digits = s.replace(/^\+/, "").replace(/\D/g, "");
  if (digits.length <= 6) return prefix + digits; // too short to mask
  // Keep first 5 digits and last 2
  const keep = Math.min(5, digits.length - 2);
  return `${prefix}${digits.slice(0, keep)}****${digits.slice(-2)}`;
}

/**
 * Mask a crypto wallet address or any opaque address string for log output.
 * Keeps the first 6 characters and the last 4.
 * Example:
 *   'TQn5m7RCi9YLHFGzB1E4VKoWx3pzNKdZU8' → 'TQn5m7****dZU8'
 */
export function maskAddress(address: string | null | undefined): string {
  if (!address) return "?";
  const s = String(address).trim();
  if (s.length <= 12) return s; // short enough to show as-is (not really an address)
  return `${s.slice(0, 6)}****${s.slice(-4)}`;
}
