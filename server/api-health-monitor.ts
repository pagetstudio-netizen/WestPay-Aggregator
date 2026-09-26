import { storage } from "./storage";
import { notifyAdminGroup } from "./telegram-bot";
import { clapayGetBalance } from "./clapay";
import { seapayBalance } from "./seapay";
import { getCurrencies as oxapayGetCurrencies } from "./oxapay";

// null = unknown (first run), true = healthy, false = failing
const healthState: Record<string, boolean | null> = {};

const SEAPAY_COUNTRIES = ["Pakistan", "Philippines", "India"] as const;

function configured(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

async function settingOrEnv(envName: string, settingName: string): Promise<string | undefined> {
  const envValue = process.env[envName];
  if (configured(envValue)) return envValue.trim();
  const dbValue = await storage.getSetting(settingName).catch(() => undefined);
  return configured(dbValue) ? dbValue.trim() : undefined;
}

async function testHttpEndpoint(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    // A read-only HEAD/GET probe avoids creating a payment or payout.
    const response = await fetch(url, { method: "HEAD", signal: controller.signal });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function testSeapay(country: string, merchantId: string, apiSecret: string): Promise<boolean> {
  const currency = country === "Pakistan" ? "PKR" : country === "Philippines" ? "PHP" : "INR";
  const result = await seapayBalance(merchantId, currency, apiSecret);
  return result.code === 200;
}

// ── Core: run one check and alert on state change ─────────────────────────────
async function checkService(
  name: string,
  emoji: string,
  test: () => Promise<boolean>,
): Promise<void> {
  let isOk = false;
  try {
    isOk = await test();
  } catch {
    isOk = false;
  }

  const previous = healthState[name];
  if (previous === null || previous === undefined) {
    healthState[name] = isOk;
    return;
  }

  if (!isOk && previous === true) {
    healthState[name] = false;
    await notifyAdminGroup(
      `🔴 *Alerte API — ${emoji} ${name}*\n\n` +
        `La connexion est indisponible ou la configuration est invalide.\n` +
        `⚠️ Les opérations via *${name}* peuvent échouer.\n\n` +
        `👉 Vérifiez la configuration dans le tableau de bord admin.`,
    ).catch(() => {});
  } else if (isOk && previous === false) {
    healthState[name] = true;
    await notifyAdminGroup(
      `✅ *API restaurée — ${emoji} ${name}*\n\n` +
        `La connexion est rétablie.\n` +
        `Les opérations via *${name}* peuvent reprendre. ✓`,
    ).catch(() => {});
  } else {
    healthState[name] = isOk;
  }
}

async function runHealthChecks(): Promise<void> {
  console.log("[HEALTH] Vérification des clés API externes...");

  const clapayKey = await settingOrEnv("CLAPAY_API_KEY", "clapay_api_key");
  if (clapayKey) {
    await checkService("ClaPay", "📲", async () => (await clapayGetBalance(clapayKey)).success);
  }

  const mbiyoKey = await settingOrEnv("MBIYO_API_KEY", "mbiyo_api_key");
  if (mbiyoKey) {
    await checkService("Mbiyo", "📲", async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(
          "https://dashboard.mbiyo.africa/api/v1/merchant/transactions/__healthprobe__",
          { headers: { Authorization: `Bearer ${mbiyoKey}` }, signal: controller.signal },
        );
        return response.status === 404 || response.status === 200;
      } finally {
        clearTimeout(timer);
      }
    });
  }

  for (const country of SEAPAY_COUNTRIES) {
    const slug = country.toUpperCase().replace(/[^A-Z]/g, "");
    const merchantId = await settingOrEnv(
      `SEAPAY_${slug}_MERCHANT_ID`,
      `seapay_merchant_id_${country.toLowerCase()}`,
    );
    const apiSecret = await settingOrEnv(
      `SEAPAY_${slug}_API_SECRET`,
      `seapay_api_secret_${country.toLowerCase()}`,
    );
    if (merchantId && apiSecret) {
      await checkService(`SeaPay (${country})`, "🌊", () => testSeapay(country, merchantId, apiSecret));
    }
  }

  const lipaClient = await settingOrEnv("LIPAPAP_CLIENT_KEY", "lipapap_client_key");
  const lipaSecret = await settingOrEnv("LIPAPAP_SECRET_KEY", "lipapap_secret_key");
  const lipaUrl = await settingOrEnv("LIPAPAP_PAYMENT_URL", "lipapap_payment_url");
  if (lipaClient && lipaSecret && lipaUrl) {
    await checkService("LipaPap", "🔗", () => testHttpEndpoint(lipaUrl));
  }

  const aggregators = await storage.getCryptoAggregators().catch(() => []);
  for (const aggregator of aggregators.filter((item) => item.active && item.apiKey)) {
    await checkService(`OxaPay (${aggregator.name})`, "₿", async () => {
      const currencies = await oxapayGetCurrencies(aggregator.apiKey!);
      return currencies.length > 0;
    });
  }

  console.log("[HEALTH] Vérification terminée.");
}

export function startApiHealthMonitor(intervalMs = 5 * 60 * 1000): void {
  console.log("[HEALTH] Moniteur API démarré — vérification toutes les 5 min");
  // First check after 45s so the app finishes booting and Telegram bot initialises.
  setTimeout(() => {
    runHealthChecks().catch(() => {});
    setInterval(() => runHealthChecks().catch(() => {}), intervalMs);
  }, 45_000);
}