export type ProviderCode =
  | "lipapap"
  | "clapay"
  | "mbiyo"
  | "seapay"
  | "drimpay"
  | "oxapay"
  | "sms"
  | "crypto"
  | "manual"
  | "unknown";

function normalized(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[\s_-]+/g, "")
    : "";
}

const EXPLICIT_PROVIDER_CODES: Record<string, ProviderCode> = {
  lipapap: "lipapap",
  lipa: "lipapap",
  clapay: "clapay",
  nowallet: "clapay",
  mbiyo: "mbiyo",
  mbiyopay: "mbiyo",
  seapay: "seapay",
  drimpay: "drimpay",
  oxapay: "oxapay",
  sms: "sms",
  crypto: "crypto",
  manual: "manual",
};

const GENERIC_PROVIDER_CODES = new Set([
  "",
  "westpay",
  "robotpay",
  "mobilemoney",
  "unknown",
  "inconnu",
]);

function providerFromReference(reference: unknown): ProviderCode | undefined {
  const ref = typeof reference === "string" ? reference.trim().toUpperCase() : "";
  if (ref.startsWith("LP-")) return "lipapap";
  if (ref.startsWith("CP-")) return "clapay";
  if (ref.startsWith("MB") || ref.startsWith("MB-") || ref.startsWith("MBY")) return "mbiyo";
  if (ref.startsWith("DP-")) return "drimpay";
  return undefined;
}

/**
 * Resolves the provider code for a history row.
 *
 * Explicit provider/gateway values always win. Legacy generic values are
 * resolved from unambiguous reference prefixes; ambiguous references remain
 * unknown instead of being incorrectly attributed to a provider.
 */
export function resolveProviderCode(provider: unknown, reference?: unknown): ProviderCode {
  const code = normalized(provider);
  const explicit = EXPLICIT_PROVIDER_CODES[code];
  if (explicit) return explicit;
  if (!GENERIC_PROVIDER_CODES.has(code)) return "unknown";
  return providerFromReference(reference) || "unknown";
}

export function providerLabel(provider: unknown, reference?: unknown): string {
  switch (resolveProviderCode(provider, reference)) {
    case "lipapap": return "LipaPap";
    case "clapay": return "ClaPay";
    case "mbiyo": return "Mbiyo";
    case "seapay": return "SeaPay";
    case "drimpay": return "Drimpay";
    case "oxapay": return "OxaPay";
    case "sms": return "SMS";
    case "crypto": return "Crypto";
    case "manual": return "Manuel";
    default: return "Fournisseur non identifié";
  }
}