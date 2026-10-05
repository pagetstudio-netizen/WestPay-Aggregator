const COUNTRY_TIME_ZONES: Record<string, string> = {
  togo: "Africa/Lome",
  benin: "Africa/Porto-Novo",
  "burkina faso": "Africa/Ouagadougou",
  "cote d'ivoire": "Africa/Abidjan",
  "côte d'ivoire": "Africa/Abidjan",
  senegal: "Africa/Dakar",
  mali: "Africa/Bamako",
  cameroun: "Africa/Douala",
  cameroon: "Africa/Douala",
  "congo brazzaville": "Africa/Brazzaville",
  congo: "Africa/Brazzaville",
  "congo rdc": "Africa/Kinshasa",
  rdc: "Africa/Kinshasa",
  gabon: "Africa/Libreville",
  guinee: "Africa/Conakry",
  "guinée": "Africa/Conakry",
  niger: "Africa/Niamey",
  kenya: "Africa/Nairobi",
  ghana: "Africa/Accra",
  "guinee-bissau": "Africa/Bissau",
  tchad: "Africa/Ndjamena",
  centrafrique: "Africa/Bangui",
  "guinee equatoriale": "Africa/Malabo",
  pakistan: "Asia/Karachi",
  philippines: "Asia/Manila",
  india: "Asia/Kolkata",
  nigeria: "Africa/Lagos",
  gambie: "Africa/Banjul",
  tg: "Africa/Lome",
  bj: "Africa/Porto-Novo",
  bf: "Africa/Ouagadougou",
  ci: "Africa/Abidjan",
  sn: "Africa/Dakar",
  ml: "Africa/Bamako",
  cm: "Africa/Douala",
  cg: "Africa/Brazzaville",
  cd: "Africa/Kinshasa",
  ga: "Africa/Libreville",
  gn: "Africa/Conakry",
  ne: "Africa/Niamey",
  ke: "Africa/Nairobi",
  gh: "Africa/Accra",
  gw: "Africa/Bissau",
  td: "Africa/Ndjamena",
  cf: "Africa/Bangui",
  gq: "Africa/Malabo",
  pk: "Asia/Karachi",
  ph: "Asia/Manila",
  in: "Asia/Kolkata",
  ng: "Africa/Lagos",
  gm: "Africa/Banjul",
};

export const PAYMENT_CHANNEL_UNAVAILABLE_MESSAGE =
  "Canal de paiement indisponible. Les canaux de paiement sont disponibles de 7h à 20h.";

function normalizeCountryKey(country: string): string {
  return country.trim().toLocaleLowerCase().normalize("NFC");
}

export function isWithinPaymentHours(country: string, at: Date = new Date()): boolean {
  const timeZone = COUNTRY_TIME_ZONES[normalizeCountryKey(country)];
  if (!timeZone || Number.isNaN(at.getTime())) return false;

  try {
    const parts = new Intl.DateTimeFormat("fr-FR", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    return Number.isInteger(hour) && hour >= 7 && hour < 20;
  } catch {
    return false;
  }
}

export function isPaymentChannelAvailable(
  country: string,
  at: Date = new Date(),
  maintenanceDisabled = false,
): boolean {
  return !maintenanceDisabled && isWithinPaymentHours(country, at);
}
