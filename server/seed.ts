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
  // One-time initial suspension flag — after this runs once, admin can freely manage accounts
  const suspensionDone = await storage.getSetting("incident_task12_initial_suspension_done");

  for (const email of COMPROMISED_MERCHANT_EMAILS) {
    const merchant = await storage.getMerchantByEmail(email);
    if (!merchant) continue;

    // Suspend only on FIRST run — after that, respect admin's manual decisions
    // If admin explicitly re-enables an account, that decision is preserved across restarts
    if (!suspensionDone && !merchant.suspended) {
      await storage.updateMerchant(merchant.id, { suspended: true });
      console.log(`[SECURITY] Compte compromis suspendu (initialisation): ${email} (${merchant.slug})`);
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
  // Mark initial suspension as done — admin can now freely re-enable accounts
  if (!suspensionDone) {
    await storage.setSetting("incident_task12_initial_suspension_done", new Date().toISOString());
    console.log("[SECURITY] Suspension initiale Task#12 marquée comme complète — décisions admin préservées désormais");
  }
}

// ── SeaPay (Pakistan, Philippines, India) — opérateurs de retrait ───────────
// Codes officiels tirés de la documentation SeaPay (api-docs.seaglb.xyz).
const SEAPAY_PAKISTAN_BANKS: [string, string][] = [
  ["PKR1", "JS Bank"], ["PKR2", "Allied Bank"], ["PKR3", "Askari Bank"],
  ["PKR4", "Summit Bank"], ["PKR5", "Bank AlHabib"], ["PKR6", "Faysal Bank"],
  ["PKR7", "Habib Bank (HBL)"], ["PKR8", "BankIslami"], ["PKR9", "KASB Bank"],
  ["PKR10", "NIB Bank"], ["PKR11", "Samba Bank"], ["PKR12", "Soneri Bank"],
  ["PKR13", "Standard Chartered Bank"], ["PKR14", "Tameer Microfinance Bank"],
  ["PKR15", "United Bank (UBL)"], ["PKR16", "Burj Bank"], ["PKR17", "Bank of Punjab"],
  ["PKR18", "Citi Bank"], ["PKR19", "Silk Bank"], ["PKR20", "Dubai Islamic Bank"],
  ["PKR21", "Al Baraka Bank"], ["PKR22", "Meezan Bank"], ["PKR23", "Sindh Bank"],
  ["PKR24", "Apna Microfinance Bank"], ["PKR25", "Bank Alfalah"], ["PKR26", "Habib Metro Bank"],
  ["PKR27", "FINCA Microfinance Bank"], ["PKR28", "National Bank of Pakistan"],
  ["PKR29", "First Women Bank"], ["PKR30", "U Microfinance Bank"],
  ["PKR31", "Waseela Microfinance Bank"], ["PKR32", "MCB Bank"],
  ["PKR33", "Advans Microfinance Bank"], ["PKR34", "ICBC"],
  ["PKR35", "Bank of Tokyo Mitsubishi"], ["PKR36", "Deutsche Bank"],
  ["PKR37", "First Microfinance Bank"], ["PKR38", "Industrial Development Bank"],
  ["PKR39", "Oman International Bank"], ["PKR40", "SME Bank"],
  ["PKR41", "Bank of Khyber"], ["PKR42", "NRSP Microfinance Bank"],
  ["PKR43", "State Bank of Pakistan"], ["PKR44", "Zarai Taraqiati Bank"],
  ["PKR45", "Khushali Bank"], ["PKR46", "MCB Islamic Bank"],
  ["PKREAYPAISA", "Easypaisa"], ["PKRJAZZCASH", "JazzCash"],
  ["PKRAMEX", "AMEX (carte de credit)"], ["PKRISLAMI", "BankIslami Pakistan"],
  ["PKRBARCLAYS", "Barclays Bank"],
];

// ── ClaPay — opérateurs mobile money par pays ────────────────────────────────
// Codes vérifiés via GET /operators/data?country=XX (nw-api.clapay.app)
// Chaque opérateur est créé idempotently (lookup par nom+pays avant création)
const CLAPAY_OPERATORS: Array<{ country: string; name: string; clapayCode: string; wave?: boolean }> = [
  // Togo
  { country: "Togo",              name: "Moov Money",        clapayCode: "MOOV" },
  { country: "Togo",              name: "TMoney",            clapayCode: "TMONEY" },
  // Benin — 10 chiffres locaux (ex: 5012345678)
  { country: "Benin",             name: "MTN Mobile Money",  clapayCode: "MTN" },
  { country: "Benin",             name: "Moov Money",        clapayCode: "MOOV" },
  // Cote d'Ivoire
  { country: "Cote d'Ivoire",     name: "Orange Money",      clapayCode: "OM" },
  { country: "Cote d'Ivoire",     name: "MTN Mobile Money",  clapayCode: "MTN" },
  { country: "Cote d'Ivoire",     name: "Moov Money",        clapayCode: "MOOV" },
  { country: "Cote d'Ivoire",     name: "Wave",              clapayCode: "WAVE", wave: true },
  // Senegal
  { country: "Senegal",           name: "Orange Money",      clapayCode: "OM" },
  { country: "Senegal",           name: "Wave",              clapayCode: "WAVE", wave: true },
  // Mali
  { country: "Mali",              name: "Orange Money",      clapayCode: "OM" },
  { country: "Mali",              name: "Moov Money",        clapayCode: "MOOV" },
  { country: "Mali",              name: "Wave",              clapayCode: "WAVE", wave: true },
  // Burkina Faso
  { country: "Burkina Faso",      name: "Orange Money",      clapayCode: "OM" },
  { country: "Burkina Faso",      name: "Moov Money",        clapayCode: "MOOV" },
  { country: "Burkina Faso",      name: "Wave",              clapayCode: "WAVE", wave: true },
  // Cameroun
  { country: "Cameroun",          name: "MTN Mobile Money",  clapayCode: "MTN" },
  { country: "Cameroun",          name: "Orange Money",      clapayCode: "OM" },
  // Congo Brazzaville
  { country: "Congo Brazzaville", name: "MTN Mobile Money",  clapayCode: "MTN" },
  { country: "Congo Brazzaville", name: "Airtel Money",      clapayCode: "AIRTEL" },
  // Gabon
  { country: "Gabon",             name: "Airtel Money",      clapayCode: "AIRTEL" },
  { country: "Gabon",             name: "Moov Money",        clapayCode: "MOOV" },
  // Guinee
  { country: "Guinee",            name: "Orange Money",      clapayCode: "OM" },
  { country: "Guinee",            name: "MTN Mobile Money",  clapayCode: "MTN" },
  // Niger — 8 chiffres locaux, 5 opérateurs confirmés API direct
  { country: "Niger",             name: "Airtel Money",      clapayCode: "AIRTEL" },
  { country: "Niger",             name: "Moov Money",        clapayCode: "MOOV" },
  { country: "Niger",             name: "Zamani",            clapayCode: "ZAMANI" },
  { country: "Niger",             name: "Amana",             clapayCode: "AMANATA" },  // code API = AMANATA
  { country: "Niger",             name: "Mynita",            clapayCode: "MYNITA" },
  // Kenya — 9 chiffres locaux (712345678), currency KES
  { country: "Kenya",             name: "Airtel Money",      clapayCode: "AIRTEL" },
  { country: "Kenya",             name: "Safaricom M-Pesa",  clapayCode: "SAFARICOM" },
  { country: "Kenya",             name: "M-Pesa",            clapayCode: "MPESA" },
];

async function ensureClapayOperatorsExist() {
  try {
    let created = 0;
    for (let i = 0; i < CLAPAY_OPERATORS.length; i++) {
      const op = CLAPAY_OPERATORS[i];
      const existing = await storage.getWithdrawalOperatorByNameAndCountry(op.name, op.country);
      if (!existing) {
        await storage.createWithdrawalOperator({
          name: op.name,
          type: "Mobile Money",
          country: op.country,
          dailyLimit: 10000000,
          gateway: "ClaPay",
          clapayCode: op.clapayCode,
          sortOrder: i,
          active: true,
        } as any);
        created++;
      } else if (!(existing as any).clapayCode && op.clapayCode) {
        // Mettre à jour le clapayCode si manquant sur un opérateur existant
        const { db } = await import("./db");
        const { withdrawalOperators } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(withdrawalOperators).set({ clapayCode: op.clapayCode } as any).where(eq(withdrawalOperators.id, existing.id));
      }
    }
    console.log(`[SEED] Opérateurs ClaPay vérifiés/créés (${created} nouveaux)`);
  } catch (err: any) {
    console.error("[SEED] Erreur seed opérateurs ClaPay:", err.message);
  }
}

async function ensureSeaPayOperatorsExist() {
  try {
    // Pakistan — 46 banques + 5 portefeuilles/cartes (SeaPay)
    for (let i = 0; i < SEAPAY_PAKISTAN_BANKS.length; i++) {
      const [code, name] = SEAPAY_PAKISTAN_BANKS[i];
      const existing = await storage.getWithdrawalOperatorByNameAndCountry(name, "Pakistan");
      if (!existing) {
        const isWallet = ["PKREAYPAISA", "PKRJAZZCASH"].includes(code);
        await storage.createWithdrawalOperator({
          name,
          type: isWallet ? "Mobile Money" : (code === "PKRAMEX" ? "Carte bancaire" : "Virement bancaire"),
          country: "Pakistan",
          dailyLimit: 1000000,
          gateway: "SeaPay",
          seapayCode: code,
          sortOrder: i,
          active: true,
        } as any);
      }
    }

    // Philippines — GCash + Maya (SeaPay)
    const phOperators: [string, string][] = [["GCASH", "GCash"], ["PHPPAYMAYA", "Maya (PayMaya)"]];
    for (let i = 0; i < phOperators.length; i++) {
      const [code, name] = phOperators[i];
      const existing = await storage.getWithdrawalOperatorByNameAndCountry(name, "Philippines");
      if (!existing) {
        await storage.createWithdrawalOperator({
          name,
          type: "Mobile Money",
          country: "Philippines",
          dailyLimit: 1000000,
          gateway: "SeaPay",
          seapayCode: code,
          sortOrder: i,
          active: true,
        } as any);
      }
    }

    // India — virement bancaire via code IFSC (saisi par le marchand a la demande de retrait,
    // pas de liste fixe de banques cote SeaPay)
    const indiaExisting = await storage.getWithdrawalOperatorByNameAndCountry("Virement bancaire (IFSC)", "India");
    if (!indiaExisting) {
      await storage.createWithdrawalOperator({
        name: "Virement bancaire (IFSC)",
        type: "Virement bancaire",
        country: "India",
        dailyLimit: 1000000,
        gateway: "SeaPay",
        seapayCode: "",
        sortOrder: 0,
        active: true,
      } as any);
    }

    console.log("[SEED] Opérateurs SeaPay vérifiés/créés (Pakistan, Philippines, India)");
  } catch (err: any) {
    console.error("[SEED] Erreur seed opérateurs SeaPay:", err.message);
  }
}

export async function seedDatabase() {
  // Enforce suspension of compromised accounts (one-time enforcement, then admin can manage freely)
  await enforceCompromisedAccountSuspensions().catch(err =>
    console.error("[SECURITY] Erreur vérification comptes compromis:", err.message)
  );

  // SeaPay : créer les opérateurs de retrait Pakistan/Philippines/India s'ils n'existent pas encore
  await ensureSeaPayOperatorsExist();

  // ClaPay : créer les opérateurs mobile money pour tous les pays supportés
  await ensureClapayOperatorsExist();

  // Compte test : uniquement en développement OU si le flag d'activation est posé en DB
  // En production (Plesk), ce compte n'est pas recréé automatiquement après suppression
  const isDevMode = process.env.NODE_ENV !== "production";
  const testAccountEnabled = await storage.getSetting("enable_test_merchant_in_production").catch(() => null);
  const testAccountDisabled = await storage.getSetting("disable_test_merchant").catch(() => null);
  if ((isDevMode || testAccountEnabled === "true") && testAccountDisabled !== "true") {
    await ensureTestMerchantExists().catch(err =>
      console.error("[SEED] Erreur création compte test:", err.message)
    );
  }

  // Protection permanente : ne JAMAIS recréer de compte admin automatiquement
  // Ce flag est posé une fois en DB et ne peut pas être retiré par un redémarrage
  const adminSeedDisabled = await storage.getSetting("admin_seed_permanently_disabled");
  if (adminSeedDisabled) {
    await ensurePinsExist();
    return;
  }

  // Vérifier si des admins existent déjà (double protection)
  const { db } = await import("./db");
  const { admins } = await import("@shared/schema");
  const existingAdmins = await db.select({ id: admins.id }).from(admins);
  if (existingAdmins.length > 0) {
    // Poser le flag pour les prochains démarrages
    await storage.setSetting("admin_seed_permanently_disabled", "true");
    await ensurePinsExist();
    return;
  }

  // Aucun admin — première installation uniquement, pas de création automatique
  console.log("[SEED] Aucun admin trouvé — création manuelle requise.");
  await storage.setSetting("admin_seed_permanently_disabled", "true");
  await ensurePinsExist();

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

async function ensureTestMerchantExists() {
  const existing = await storage.getMerchantByEmail("test@westpay.dev");
  if (existing) return;

  const passwordHash = await bcrypt.hash("Test@2026!", 10);
  const pinHash = await bcrypt.hash("123456", 10);
  const webhookSecret = crypto.randomBytes(20).toString("hex");

  const merchant = await storage.createMerchant({
    name: "Compte Test",
    email: "test@westpay.dev",
    slug: "test-merchant",
    passwordHash,
    suspended: false,
    webhookSecret,
  });

  const testCountries = ["Togo", "Cote d'Ivoire", "Senegal", "Benin", "Mali", "Burkina Faso", "Cameroun", "Congo Brazzaville", "Congo RDC", "Gabon", "Guinee", "Gambie"];
  for (const country of testCountries) {
    await storage.addMerchantCountry({
      merchantId: merchant.id,
      country,
      apiKey: generateSecureApiKey(country),
      balance: 0,
      active: true,
    });
  }

  await storage.upsertMerchantPin(merchant.id, pinHash);
  console.log("[SEED] Compte test créé : test@westpay.dev (slug: test-merchant)");
}
