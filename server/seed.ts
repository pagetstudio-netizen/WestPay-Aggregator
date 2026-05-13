import { storage } from "./storage";
import bcrypt from "bcryptjs";
import crypto from "crypto";

function generateSecureApiKey(country: string): string {
  const prefixes: Record<string, string> = {
    "Togo": "TGO", "Benin": "BEN", "Cote d'Ivoire": "CIV",
    "Senegal": "SEN", "Mali": "MLI", "Burkina Faso": "BFA",
    "Cameroun": "CMR", "Congo Brazzaville": "COG", "Gabon": "GAB",
  };
  const prefix = prefixes[country] || country.substring(0, 3).toUpperCase();
  const randomPart = crypto.randomBytes(20).toString("hex").toUpperCase();
  return `${prefix}-${randomPart}`;
}

// ── Incident response: Task #12 — 2025-05-13 ────────────────────────────────
// Three merchant accounts were compromised by an automated bot (Deno/SupabaseEdgeRuntime)
// that made 4,700+ successful logins using credential stuffing across 60+ AWS IPs.
// These accounts MUST remain suspended until admin manually re-enables them after
// verifying merchant identity. API keys were also rotated as part of incident response.
const COMPROMISED_MERCHANT_EMAILS = [
  "Alvyqe7@gmail.com",   // teslaplus — confirmed bot credential stuffing
  "kingobs71@gmail.com", // e-livre   — confirmed bot credential stuffing
  "kenkorodriguez7@gmail.com", // avenix — confirmed bot credential stuffing
];

async function enforceCompromisedAccountSuspensions(): Promise<void> {
  // One-time API key rotation flag — only executed once per environment
  const rotationDone = await storage.getSetting("incident_task12_api_keys_rotated");

  for (const email of COMPROMISED_MERCHANT_EMAILS) {
    const merchant = await storage.getMerchantByEmail(email);
    if (!merchant) continue;

    // Always keep suspended
    if (!merchant.suspended) {
      await storage.updateMerchant(merchant.id, { suspended: true });
      console.log(`[SECURITY] Compte compromis re-suspendu: ${email} (${merchant.slug})`);
    }

    // One-time: invalidate password hash so account cannot log in even if un-suspended without reset
    if (!rotationDone) {
      const invalidHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
      await storage.updateMerchant(merchant.id, { passwordHash: invalidHash });

      // Regenerate all country API keys
      const countries = await storage.getMerchantCountries(merchant.id);
      for (const mc of countries) {
        const prefix = mc.country.substring(0, 3).toUpperCase();
        const newKey = `${prefix}-${crypto.randomBytes(20).toString("hex").toUpperCase()}`;
        await storage.updateMerchantCountryApiKey(mc.id, newKey);
      }
      console.log(`[SECURITY] Clés API + mot de passe invalidés: ${email} (${countries.length} pays)`);
    }
  }

  // Mark rotation as done so it doesn't re-run on subsequent startups
  if (!rotationDone) {
    await storage.setSetting("incident_task12_api_keys_rotated", new Date().toISOString());
    console.log("[SECURITY] Rotation clés incident Task#12 marquée comme complète");
  }
}

export async function seedDatabase() {
  // Enforce suspension of compromised accounts on every startup
  await enforceCompromisedAccountSuspensions().catch(err =>
    console.error("[SECURITY] Erreur vérification comptes compromis:", err.message)
  );

  const existingAdmin = await storage.getAdminByEmail("devappmanagement40@gmail.com");
  if (existingAdmin) {
    // Verify password hash is correct — fix if desynchronized across environments
    const passwordOk = await bcrypt.compare("Admin@2026!", existingAdmin.passwordHash);
    if (!passwordOk) {
      const fixedHash = await bcrypt.hash("Admin@2026!", 10);
      await storage.updateAdminPassword(existingAdmin.id, fixedHash);
      console.log("[SEED] Admin password hash resynchronisé");
    }
    await ensurePinsExist();
    return;
  }

  const adminHash = await bcrypt.hash("Admin@2026!", 10);
  await storage.createAdmin({
    email: "devappmanagement40@gmail.com",
    passwordHash: adminHash,
    apiKey: "WP-ADMIN-" + crypto.randomBytes(16).toString("hex").toUpperCase(),
  });

  const merchantHash = await bcrypt.hash("Merchant@2026!", 10);
  const pinHash = await bcrypt.hash("123456", 10);

  const ecomat = await storage.createMerchant({
    name: "EcoMat Togo",
    email: "contact@ecomat.com",
    slug: "ecomat",
    passwordHash: merchantHash,
    suspended: false,
  });

  await storage.upsertMerchantPin(ecomat.id, pinHash);

  const payfast = await storage.createMerchant({
    name: "PayFast Benin",
    email: "info@payfast.bj",
    slug: "payfast",
    passwordHash: merchantHash,
    suspended: false,
  });

  const pinHash2 = await bcrypt.hash("654321", 10);
  await storage.upsertMerchantPin(payfast.id, pinHash2);

  await storage.addMerchantCountry({
    merchantId: ecomat.id,
    country: "Togo",
    apiKey: generateSecureApiKey("Togo"),
    balance: 12500,
    active: true,
  });

  await storage.addMerchantCountry({
    merchantId: ecomat.id,
    country: "Benin",
    apiKey: generateSecureApiKey("Benin"),
    balance: 18000,
    active: true,
  });

  await storage.addMerchantCountry({
    merchantId: payfast.id,
    country: "Benin",
    apiKey: generateSecureApiKey("Benin"),
    balance: 45000,
    active: true,
  });

  await storage.addMerchantCountry({
    merchantId: payfast.id,
    country: "Cote d'Ivoire",
    apiKey: generateSecureApiKey("Cote d'Ivoire"),
    balance: 22000,
    active: true,
  });

  await storage.addNumber({
    phoneNumber: "+22899935673",
    country: "Togo",
    operator: "Moov Money",
    status: "active",
    merchantId: ecomat.id,
  });

  await storage.addNumber({
    phoneNumber: "+22892299772",
    country: "Togo",
    operator: "TMoney",
    status: "active",
    merchantId: ecomat.id,
  });

  await storage.createTransaction({
    merchantId: ecomat.id,
    country: "Togo",
    txId: "TX12345",
    amount: 2000,
    payerNumber: "+22898123456",
    status: "confirmed",
  });

  await storage.createTransaction({
    merchantId: ecomat.id,
    country: "Benin",
    txId: "TX98765",
    amount: 5000,
    payerNumber: "+22967891234",
    status: "confirmed",
  });

  await storage.createTransaction({
    merchantId: payfast.id,
    country: "Benin",
    txId: "TX54321",
    amount: 15000,
    payerNumber: "+22997654321",
    status: "confirmed",
  });

  await storage.createTransaction({
    merchantId: ecomat.id,
    country: "Togo",
    txId: "TX67890",
    amount: 3500,
    payerNumber: "+22890456789",
    status: "confirmed",
  });

  await storage.createTransaction({
    merchantId: payfast.id,
    country: "Cote d'Ivoire",
    txId: "TX11223",
    amount: 8000,
    payerNumber: "+22507891234",
    status: "confirmed",
  });

  console.log("Database seeded successfully");
}

async function ensurePinsExist() {
  const merchants = await storage.getMerchants();
  for (const merchant of merchants) {
    const existingPin = await storage.getMerchantPin(merchant.id);
    if (!existingPin) {
      const defaultPin = merchant.email === "contact@ecomat.com" ? "123456" : "654321";
      const pinHash = await bcrypt.hash(defaultPin, 10);
      await storage.upsertMerchantPin(merchant.id, pinHash);
      console.log(`PIN backfilled for merchant ${merchant.name}`);
    }
  }
}
