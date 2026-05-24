import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "../server/db";
import { merchants, merchantCountries, paymentLinks } from "../shared/schema";
import { eq } from "drizzle-orm";

const email = "demo@westpay.dev";
const password = "Demo@2026!";
const slug = "demo-westpay";

function genKey(country: string): string {
  const prefixes: Record<string, string> = {
    "Togo": "TGO",
    "Cote d'Ivoire": "CIV",
    "Benin": "BEN",
  };
  const prefix = prefixes[country] || country.substring(0, 3).toUpperCase();
  return `${prefix}-${crypto.randomBytes(20).toString("hex").toUpperCase()}`;
}

async function main() {
  const existing = await db.select().from(merchants).where(eq(merchants.email, email));
  if (existing.length > 0) {
    console.log("Compte test déjà existant, ID:", existing[0].id, "slug:", existing[0].slug);

    // Check countries
    const { merchantCountries: mc } = await import("../shared/schema");
    const countries = await db.select().from(mc).where(eq(mc.merchantId, existing[0].id));
    console.log("Pays existants:", countries.map(c => c.country).join(", "));

    // Check payment links
    const { paymentLinks: pl } = await import("../shared/schema");
    const links = await db.select().from(pl).where(eq(pl.merchantId, existing[0].id));
    console.log("Liens paiement:", links.map(l => `/link/${l.uniqueId}`).join(", "));
    process.exit(0);
  }

  const hash = await bcrypt.hash(password, 10);
  const [merchant] = await db.insert(merchants).values({
    name: "WestPay Demo",
    email,
    slug,
    passwordHash: hash,
    suspended: false,
  }).returning();

  console.log("Compte créé, ID:", merchant.id);

  for (const country of ["Togo", "Cote d'Ivoire", "Benin"]) {
    await db.insert(merchantCountries).values({
      merchantId: merchant.id,
      country,
      apiKey: genKey(country),
      balance: 50000,
      active: true,
    });
    console.log("Pays ajouté:", country);
  }

  const uniqueId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  const [link] = await db.insert(paymentLinks).values({
    merchantId: merchant.id,
    uniqueId,
    name: "Lien de paiement Demo",
    description: "Lien de test WestPay — Togo, Côte d'Ivoire, Bénin",
    amountType: "free",
    amount: null,
    active: true,
    countries: ["Togo", "Cote d'Ivoire", "Benin"],
    showShareButton: true,
    collectBillingAddress: false,
  }).returning();

  console.log("Lien créé:", `/link/${link.uniqueId}`);
  console.log("---");
  console.log("Email:", email);
  console.log("Mot de passe:", password);
  console.log("Slug:", slug);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
