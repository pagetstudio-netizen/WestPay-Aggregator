import crypto from "crypto";
import { promises as dnsPromises } from "dns";

export async function verifyEmailDomainHasMx(email: string): Promise<boolean> {
  try {
    const domain = email.split("@")[1];
    if (!domain || domain.length < 4) return false;
    const records = await dnsPromises.resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}

export function generateSecureApiKey(country: string): string {
  const prefixes: Record<string, string> = {
    Togo: "TGO",
    Benin: "BEN",
    "Cote d'Ivoire": "CIV",
    Senegal: "SEN",
    Mali: "MLI",
    "Burkina Faso": "BFA",
    Cameroun: "CMR",
    "Congo Brazzaville": "COG",
    Gabon: "GAB",
    "Congo RDC": "COD",
    Guinee: "GIN",
    Gambie: "GMB",
  };
  const prefix = prefixes[country] || country.substring(0, 3).toUpperCase();
  const randomPart = crypto.randomBytes(20).toString("hex").toUpperCase();
  return `${prefix}-${randomPart}`;
}

export function decryptTotpSecret(stored: string, jwtSecret: string | undefined): string {
  if (!stored || !stored.startsWith("ENC:")) return stored;
  const parts = stored.split(":");
  if (parts.length !== 4) throw new Error("Format secret TOTP invalide");
  const key = crypto.createHash("sha256").update(`${jwtSecret}:totp-key-v1`).digest();
  const [, ivHex, tagHex, encHex] = parts;
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(encHex, "hex")).toString("utf8") + decipher.final("utf8");
}
