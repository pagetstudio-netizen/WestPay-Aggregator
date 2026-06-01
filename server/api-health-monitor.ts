import { storage } from "./storage";
import { notifyAdminGroup } from "./telegram-bot";
import { getBalance as omnipayGetBalance } from "./omnipay";
import { getBalance as sendavaGetBalance } from "./sendavapay";
import { getCurrencies as oxapayGetCurrencies } from "./oxapay";

// null = unknown (first run), true = healthy, false = failing
const healthState: Record<string, boolean | null> = {};

// ── Key resolvers (same priority as routes.ts) ────────────────────────────────
async function getSendavaKey(): Promise<string | undefined> {
  return (
    process.env.SENDAVA_API_KEY ||
    process.env.SENDAVAPAY_API_KEY ||
    (await storage.getSetting("sendavapay_api_key")) ||
    undefined
  );
}

async function getOmnipayKey(): Promise<string | undefined> {
  return (
    process.env.OMNIPAY_API_KEY ||
    (await storage.getSetting("omnipay_api_key")) ||
    undefined
  );
}

async function getMbiyoKey(): Promise<string | undefined> {
  return (
    process.env.MBIYO_API_KEY ||
    (await storage.getSetting("mbiyo_api_key")) ||
    undefined
  );
}

// ── Mbiyo health test: GET /merchant/transactions/probe → 404 = key OK, 401 = key KO ──
async function testMbiyoKey(apiKey: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(
      "https://dashboard.mbiyo.africa/api/v1/merchant/transactions/__healthprobe__",
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      },
    );
    clearTimeout(timer);
    // 404 → transaction not found (key accepted) ✅   401/403 → invalid key ❌
    return res.status === 404 || res.status === 200;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

// ── Core: run one check and alert on state change ─────────────────────────────
async function checkService(
  name: string,
  emoji: string,
  test: () => Promise<boolean>,
): Promise<void> {
  let isOk: boolean;
  try {
    isOk = await test();
  } catch {
    isOk = false;
  }

  const prev = healthState[name];

  if (prev === null || prev === undefined) {
    // First run — initialise state, alert immediately if already broken
    healthState[name] = isOk;
    if (!isOk) {
      await notifyAdminGroup(
        `🔴 *Alerte API — ${emoji} ${name}*\n\n` +
          `La clé API est *invalide* ou le service est injoignable.\n` +
          `⚠️ Les paiements via *${name}* échouent actuellement.\n\n` +
          `👉 Mettez à jour la clé dans le tableau de bord admin.`,
      ).catch(() => {});
    }
    return;
  }

  if (!isOk && prev === true) {
    // Transition : healthy → failing
    healthState[name] = false;
    await notifyAdminGroup(
      `🔴 *Alerte API — ${emoji} ${name}*\n\n` +
        `La clé API vient de devenir *invalide* ou le service ne répond plus.\n` +
        `⚠️ Les paiements via *${name}* échouent.\n\n` +
        `👉 Mettez à jour la clé dans le tableau de bord admin.`,
    ).catch(() => {});
  } else if (isOk && prev === false) {
    // Transition : failing → healthy
    healthState[name] = true;
    await notifyAdminGroup(
      `✅ *API restaurée — ${emoji} ${name}*\n\n` +
        `La connexion est rétablie.\n` +
        `Les paiements via *${name}* fonctionnent à nouveau. ✓`,
    ).catch(() => {});
  } else {
    healthState[name] = isOk;
  }
}

// ── Main check loop ───────────────────────────────────────────────────────────
async function runHealthChecks(): Promise<void> {
  console.log("[HEALTH] Vérification des clés API externes...");

  // SendavaPay
  try {
    const key = await getSendavaKey();
    if (key) {
      await checkService("SendavaPay", "💳", async () => {
        const res = await sendavaGetBalance(key);
        return res.success === true;
      });
    }
  } catch {}

  // OmniPay
  try {
    const key = await getOmnipayKey();
    if (key) {
      await checkService("OmniPay", "📡", async () => {
        const res = await omnipayGetBalance(key);
        // success is a number: 1 = OK, or balance array present
        return res.success === 1 || Array.isArray(res.balance);
      });
    }
  } catch {}

  // Mbiyo
  try {
    const key = await getMbiyoKey();
    if (key) {
      await checkService("Mbiyo", "📲", () => testMbiyoKey(key));
    }
  } catch {}

  // OxaPay (one check per active aggregator)
  try {
    const aggregators = await storage.getCryptoAggregators();
    const active = aggregators.filter((a) => a.active && a.apiKey);
    for (const agg of active) {
      await checkService(`OxaPay (${agg.name})`, "₿", async () => {
        const currencies = await oxapayGetCurrencies(agg.apiKey!);
        return currencies.length > 0;
      });
    }
  } catch {}

  console.log("[HEALTH] Vérification terminée.");
}

// ── Public start function ─────────────────────────────────────────────────────
export function startApiHealthMonitor(intervalMs = 5 * 60 * 1000): void {
  console.log("[HEALTH] Moniteur API démarré — vérification toutes les 5 min");
  // First check after 45s so the app finishes booting and Telegram bot initialises
  setTimeout(() => {
    runHealthChecks().catch(() => {});
    setInterval(() => runHealthChecks().catch(() => {}), intervalMs);
  }, 45_000);
}
