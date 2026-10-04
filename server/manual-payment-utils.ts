const COUNTRY_DIAL_CODES: Record<string, string> = {
  Togo: "228",
  Benin: "229",
  "Cote d'Ivoire": "225",
  Senegal: "221",
  Mali: "223",
  "Burkina Faso": "226",
  Cameroun: "237",
  "Congo Brazzaville": "242",
  "Congo RDC": "243",
  Gabon: "241",
  Guinee: "224",
  Gambie: "220",
  Pakistan: "92",
  Philippines: "63",
  India: "91",
  Nigeria: "234",
  Ghana: "233",
  Niger: "227",
  Kenya: "254",
};

export function validateManualUssdTemplate(template: string): string | null {
  const value = template.trim();
  if (!value) return null;
  if (value.length > 300) return "Le modèle USSD ne peut pas dépasser 300 caractères.";

  const withoutKnownPlaceholders = value
    .replaceAll("{{amount}}", "123")
    .replaceAll("{{number}}", "123");
  if (/[{}]/.test(withoutKnownPlaceholders) || !/^[0-9*#().\s-]+$/.test(withoutKnownPlaceholders)) {
    return "Utilisez uniquement les caractères d’un code USSD et les variables {{amount}} et {{number}}.";
  }
  return null;
}

export function buildManualUssdCode(
  template: string | null | undefined,
  amount: number,
  recipientPhone: string,
  country: string,
): string | null {
  if (!template?.trim()) return null;

  const validationMessage = validateManualUssdTemplate(template);
  if (validationMessage) throw new Error(validationMessage);

  let recipient = recipientPhone.replace(/\D/g, "");
  const dialCode = COUNTRY_DIAL_CODES[country];
  if (dialCode && recipient.startsWith(dialCode) && recipient.length > dialCode.length) {
    recipient = recipient.slice(dialCode.length);
  }
  if (!recipient || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Impossible de générer le code USSD avec ces informations.");
  }

  const code = template
    .replaceAll("{{amount}}", String(amount))
    .replaceAll("{{number}}", recipient)
    .replace(/[().\s-]/g, "");
  if (code.length < 3 || !/^[*#][0-9*#]*#$/.test(code)) {
    throw new Error("Le modèle ne produit pas un code USSD valide.");
  }
  return code;
}