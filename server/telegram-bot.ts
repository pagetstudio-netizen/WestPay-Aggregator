import { Telegraf } from "telegraf";
import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { pool, financialPool } from "./db";
import {
  initiateTransfer as omnipayInitiateTransfer,
  getTransactionStatus as omnipayGetStatus,
  getBalance as omnipayGetBalance,
} from "./omnipay";
import {
  initiatePayout as mbiyoInitiatePayout,
  getTransactionStatus as mbiyoGetStatus,
  getBalance as mbiyoGetBalance,
  mbiyoCountryCode,
  mbiyoCurrency,
  mbiyoNetwork,
  generateReference as mbiyoGenerateRef,
} from "./mbiyo";
import {
  initiateWithdraw as sendavaInitiateWithdraw,
  getWithdrawalStatus as sendavaGetWithdrawalStatus,
  toSendavaOperator,
  SENDAVAPAY_COUNTRY_CODES,
  SENDAVAPAY_CURRENCY_MAP,
  getBalance as sendavaGetBalance,
} from "./sendavapay";
import {
  seapayBalance,
} from "./seapay";
import { clapayGetBalance } from "./clapay";

export interface GeoInfo {
  ip: string;
  city: string;
  region: string;
  country: string;
  isp: string;
  isProxy?: boolean;
  isHosting?: boolean;
  isMobile?: boolean;
}

export async function getGeoInfo(ip: string): Promise<GeoInfo> {
  const fallback: GeoInfo = { ip, city: "Inconnue", region: "", country: "", isp: "" };
  try {
    const cleanIp = ip.replace(/^::ffff:/, "");
    if (cleanIp === "127.0.0.1" || cleanIp === "::1" || cleanIp.startsWith("192.168.") || cleanIp.startsWith("10.")) {
      return { ...fallback, ip: cleanIp, city: "Local" };
    }
    // La géolocalisation est une couche de défense supplémentaire et le code
    // appelant applique un fail-open si le service est indisponible. Une limite
    // courte évite de bloquer la première connexion pendant plusieurs secondes.
    const res = await fetch(`http://ip-api.com/json/${cleanIp}?fields=status,city,regionName,country,isp,query,proxy,hosting,mobile`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { ...fallback, ip: cleanIp };
    const data = await res.json() as any;
    if (data.status !== "success") return { ...fallback, ip: cleanIp };
    return {
      ip: cleanIp,
      city: data.city || "?",
      region: data.regionName || "",
      country: data.country || "",
      isp: data.isp || "",
      isProxy: data.proxy || false,
      isHosting: data.hosting || false,
      isMobile: data.mobile || false,
    };
  } catch {
    return fallback;
  }
}

function parseUserAgent(ua: string): { browser: string; os: string; device: string } {
  const browser =
    ua.includes("Edg/") ? "Edge" :
    ua.includes("OPR/") || ua.includes("Opera") ? "Opera" :
    ua.includes("Firefox") ? "Firefox" :
    ua.includes("Chrome") ? "Chrome" :
    ua.includes("Safari") ? "Safari" : "Autre";
  const os =
    ua.includes("Windows NT") ? "Windows" :
    ua.includes("Macintosh") ? "macOS" :
    ua.includes("Android") ? "Android" :
    ua.includes("iPhone") || ua.includes("iPad") ? "iOS" :
    ua.includes("Linux") ? "Linux" : "Autre";
  const device =
    ua.includes("Mobile") || ua.includes("Android") || ua.includes("iPhone") ? "📱 Mobile" : "💻 Bureau";
  return { browser, os, device };
}

let bot: Telegraf | null = null;

// ─── Groupe admin ancré (ID immuable) ────────────────────────────────────────
const HARDCODED_ADMIN_GROUP_ID = "-1003802528942";

// ─── Flag : message de test envoyé une seule fois par démarrage serveur ───────
let startupTestSent = false;

const COUNTRIES_FR: Record<string, string> = {
  "togo": "🇹🇬 Togo",
  "benin": "🇧🇯 Bénin",
  "burkina faso": "🇧🇫 Burkina Faso",
  "cameroun": "🇨🇲 Cameroun",
  "congo brazzaville": "🇨🇬 Congo Brazzaville",
  "gabon": "🇬🇦 Gabon",
  "cote d'ivoire": "🇨🇮 Côte d'Ivoire",
  "mali": "🇲🇱 Mali",
  "senegal": "🇸🇳 Sénégal",
  "guinee": "🇬🇳 Guinée",
};

function countryLabel(code: string): string {
  return COUNTRIES_FR[code.toLowerCase()] || code.toUpperCase();
}

function formatAmount(n: number): string {
  return n.toLocaleString("fr-FR") + " F CFA";
}

function formatAmountPlain(n: number): string {
  return n.toFixed(2);
}

/** Retourne la devise ISO pour un pays donné */
function currencyForCountry(country: string): string {
  if (["Cameroun","Congo Brazzaville","Gabon","Tchad","Centrafrique","Guinee Equatoriale"].includes(country)) return "XAF";
  if (country === "Congo RDC")   return "CDF";
  if (country === "Guinee")      return "GNF";
  if (country === "Gambie")      return "GMD";
  if (country === "Pakistan")    return "PKR";
  if (country === "Philippines") return "PHP";
  if (country === "India")       return "INR";
  if (country === "Nigeria")     return "NGN";
  if (country === "Kenya")       return "KES";
  if (country === "Ghana")       return "GHS";
  return "XOF";
}

/** Formate un montant avec la bonne devise selon le pays */
function formatAmountC(n: number, country?: string | null): string {
  const cur = country ? currencyForCountry(country) : "XOF";
  return n.toLocaleString("fr-FR") + " " + cur;
}

// ─── Rate Limiter ────────────────────────────────────────────────────────────
const MAX_FAILED = 5;
const LOCK_DURATION_MS = 60 * 60 * 1000;
const failedAttempts = new Map<string, { count: number; lockedUntil: Date | null }>();

// ─── Broadcast conversationnel (groupe admin) ─────────────────────────────────
interface BroadcastSession {
  step: "waiting_type" | "waiting_content";
  broadcastType?: "all_groups" | "merchants_only";
  initiator: string;
}
const broadcastSessions = new Map<string, BroadcastSession>(); // chatId -> session

// ─── Session /commander ────────────────────────────────────────────────────
interface CommanderSession {
  step: "waiting_phone";
}
const commanderSessions = new Map<string, CommanderSession>();

// ─── Session /desactiverpaiement ────────────────────────────────────────────
interface MerchantPaymentDisableSession {
  step: "waiting_slug";
}
const merchantPaymentDisableSessions = new Map<string, MerchantPaymentDisableSession>();

// Ajoute le préfixe international à un numéro selon le pays (usage interne bot)
function botPrependDialCode(phone: string, country: string): string {
  const codes: Record<string, string> = {
    "Togo": "228", "Côte d'Ivoire": "225", "Bénin": "229", "Sénégal": "221",
    "Mali": "223", "Burkina Faso": "226", "Niger": "227", "Ghana": "233",
    "Nigeria": "234", "Cameroun": "237", "Guinée": "224", "Guinée-Bissau": "245",
  };
  const code = codes[country];
  if (!code) return phone;
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith(code)) return digits;
  return code + digits.replace(/^0+/, "");
}

function isRateLimited(userId: string): boolean {
  const r = failedAttempts.get(userId);
  if (!r) return false;
  if (r.lockedUntil && new Date() < r.lockedUntil) return true;
  if (r.lockedUntil && new Date() >= r.lockedUntil) { failedAttempts.delete(userId); return false; }
  return false;
}

function recordFailed(userId: string): number {
  const r = failedAttempts.get(userId) || { count: 0, lockedUntil: null };
  r.count++;
  if (r.count >= MAX_FAILED) r.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
  failedAttempts.set(userId, r);
  return MAX_FAILED - r.count;
}

function resetAttempts(userId: string): void {
  failedAttempts.delete(userId);
}

function resetAllAttempts(): number {
  const count = failedAttempts.size;
  failedAttempts.clear();
  return count;
}

function getBlockedUsers(): { userId: string; count: number; lockedUntil: Date | null }[] {
  const result: { userId: string; count: number; lockedUntil: Date | null }[] = [];
  const now = new Date();
  for (const [userId, r] of failedAttempts.entries()) {
    if (r.count > 0 || (r.lockedUntil && now < r.lockedUntil)) {
      result.push({ userId, count: r.count, lockedUntil: r.lockedUntil });
    }
  }
  return result;
}

// ─── Cache mémoire pour éviter les requêtes DB répétées à chaque update ──────
// Sans ce cache, chaque message Telegram déclenche 3-5 requêtes DB (pool de 10
// connexions Supabase → exhaustion rapide → bot figé).
const _cache: {
  knownGroups?: { value: string[]; expiresAt: number };
  adminGroupId?: { value: string | undefined; expiresAt: number };
  merchantByChat: Map<string, { value: any; expiresAt: number }>;
} = { merchantByChat: new Map() };

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function _invalidateGroupCache() {
  delete _cache.knownGroups;
  delete _cache.adminGroupId;
}

// ─── Known Groups Registry ───────────────────────────────────────────────────
async function getKnownGroups(): Promise<string[]> {
  const now = Date.now();
  if (_cache.knownGroups && now < _cache.knownGroups.expiresAt) {
    return _cache.knownGroups.value;
  }
  const raw = await storage.getSetting("telegram_known_groups");
  let value: string[];
  try { value = raw ? JSON.parse(raw) : []; } catch { value = []; }
  _cache.knownGroups = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

async function registerKnownGroup(chatId: string): Promise<void> {
  if (!chatId) return;
  const groups = await getKnownGroups();
  if (!groups.includes(chatId)) {
    groups.push(chatId);
    await storage.setSetting("telegram_known_groups", JSON.stringify(groups));
    _invalidateGroupCache(); // forcer rechargement au prochain appel
    console.log(`[TELEGRAM] Groupe enregistré: ${chatId} (total: ${groups.length})`);
  }
}

async function removeKnownGroup(chatId: string): Promise<void> {
  const groups = await getKnownGroups();
  const filtered = groups.filter(id => id !== chatId);
  if (filtered.length !== groups.length) {
    await storage.setSetting("telegram_known_groups", JSON.stringify(filtered));
    _invalidateGroupCache();
  }
}

/**
 * Fusionne et sauvegarde tous les groupes connus :
 * setting DB + groupe admin + telegramChatId de tous les marchands.
 * Retourne le nombre total et le nombre nouvellement ajoutés.
 */
export async function syncAllKnownGroups(): Promise<{ total: number; added: number }> {
  const existing = await getKnownGroups();
  const merged = new Set<string>(existing);

  const adminGroupId = await storage.getSetting("telegram_group_id");
  if (adminGroupId) merged.add(adminGroupId);

  try {
    const merchants = await storage.getMerchants();
    for (const m of merchants) {
      if ((m as any).telegramChatId) merged.add((m as any).telegramChatId as string);
    }
  } catch {}

  const all = Array.from(merged);
  const added = all.length - existing.length;
  await storage.setSetting("telegram_known_groups", JSON.stringify(all));
  console.log(`[TELEGRAM] syncAllKnownGroups: ${all.length} groupe(s) total, ${added} ajouté(s)`);
  return { total: all.length, added };
}

// ─── Merchant group helper ───────────────────────────────────────────────────
async function getMerchantForGroup(chatId: string) {
  const now = Date.now();
  const cached = _cache.merchantByChat.get(chatId);
  if (cached && now < cached.expiresAt) return cached.value;
  const merchant = await storage.getMerchantByTelegramChatId(chatId);
  _cache.merchantByChat.set(chatId, { value: merchant, expiresAt: now + CACHE_TTL_MS });
  return merchant;
}

const MERCHANT_AIDE_MSG = (name: string) =>
  `📖 *Commandes disponibles — ${name}*\n\n` +
  `💰 /solde — Solde détaillé par pays\n` +
  `📋 /transactions — Les 5 dernières transactions\n` +
  `📊 /stats — Vos statistiques globales\n` +
  `🌐 /addip ADRESSE\\_IP — Ajouter une IP à la whitelist\n` +
  `❓ /aide — Afficher cette aide\n\n` +
  `📲 *Notifications automatiques*\nChaque paiement confirmé est affiché ici en temps réel.\n\n` +
  `💡 *Astuce IP :* Si le bot ne répond pas quand vous envoyez une IP en texte, utilisez la commande \`/addip 1.2.3.4\` à la place.`;

// ─── Security helpers ─────────────────────────────────────────────────────────
async function getAdminGroupId(): Promise<string | undefined> {
  const now = Date.now();
  if (_cache.adminGroupId && now < _cache.adminGroupId.expiresAt) {
    return _cache.adminGroupId.value;
  }
  // Priorité : DB → env var TELEGRAM_ADMIN_GROUP_ID
  const fromDb = await storage.getSetting("telegram_group_id");
  const value = fromDb || process.env.TELEGRAM_ADMIN_GROUP_ID || undefined;
  _cache.adminGroupId = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

async function isAdminGroup(chatId: string): Promise<boolean> {
  const groupId = await getAdminGroupId();
  return !!groupId && chatId === groupId;
}

async function alertAdminGroup(message: string): Promise<void> {
  if (!bot) return;
  const groupId = await getAdminGroupId();
  if (!groupId) return;
  await bot.telegram.sendMessage(groupId, message, { parse_mode: "Markdown" }).catch(() => {});
}

async function alertAdminGroupWithButtons(
  message: string,
  buttons: Array<Array<{ text: string; callback_data: string }>>
): Promise<void> {
  if (!bot) return;
  const groupId = await getAdminGroupId();
  if (!groupId) {
    await alertAdminGroup(message);
    return;
  }
  await bot.telegram.sendMessage(groupId, message, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons },
  }).catch(() => alertAdminGroup(message).catch(() => {}));
}

function formatUser(ctx: any): string {
  const u = ctx.from;
  if (!u) return "Inconnu";
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
  return u.username ? `${name} (@${u.username})` : name;
}

// ─── Today's transaction stats helpers ───────────────────────────────────────
function isToday(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

async function getTodayStatsByCountry(merchantId: number, country: string): Promise<{ success: number; total: number; amount: number }> {
  const txs = await storage.getTransactions(merchantId);
  const todayTxs = txs.filter(t => t.country === country && isToday(new Date(t.createdAt)));
  const success = todayTxs.filter(t => t.status === "confirmed").length;
  const amount = todayTxs.filter(t => t.status === "confirmed").reduce((s, t) => s + t.amount, 0);
  return { success, total: todayTxs.length, amount };
}

function successRate(success: number, total: number): string {
  if (total === 0) return "100%";
  return ((success / total) * 100).toFixed(2) + "%";
}

// ─── Solde par pays (format enrichi) ─────────────────────────────────────────
async function buildMerchantSoldeMessage(merchantId: number, merchantName: string): Promise<string> {
  const countries = await storage.getMerchantCountries(merchantId);
  const active = countries.filter(mc => mc.active);
  if (active.length === 0) return `_Aucun pays actif pour ${merchantName}_`;

  const parts: string[] = [];
  for (const mc of active) {
    const stats = await getTodayStatsByCountry(merchantId, mc.country);
    parts.push(
      `🌍 *Pays :* ${countryLabel(mc.country)}\n` +
      `📌 *Clé :* \`${mc.apiKey.slice(-12)}\`\n` +
      `💰 *Solde compte :* ${formatAmountPlain(mc.balance)} ${currencyForCountry(mc.country)}\n` +
      `💳 *Solde reversement :* ${formatAmountPlain(mc.balance)} ${currencyForCountry(mc.country)}\n` +
      `📊 *Dépôts réussis aujourd'hui :* ${stats.success}\n` +
      `📈 *Taux de réussite aujourd'hui :* ${successRate(stats.success, stats.total)}`
    );
  }
  return parts.join("\n\n─────────────────\n\n");
}

type GatewayWalletBalance = {
  country: string;
  currency: string;
  amount: number;
  pending?: number;
  frozen?: number;
};

type GatewayBalanceResult = {
  wallets: GatewayWalletBalance[];
  skippedCountries?: string[];
};

const GATEWAY_BALANCE_OPTIONS = [
  { id: "omnipay", label: "OmniPay" },
  { id: "sendavapay", label: "SendavaPay" },
  { id: "mbiyo", label: "MbiyoPay" },
  { id: "seapay", label: "SeaPay" },
  { id: "clapay", label: "ClaPay" },
] as const;

type GatewayBalanceId = typeof GATEWAY_BALANCE_OPTIONS[number]["id"];

const SEAPAY_BALANCE_COUNTRIES: Record<string, string> = {
  Pakistan: "PKR",
  Philippines: "PHP",
  India: "INR",
  Nigeria: "NGN",
};

function gatewayMoney(amount: number, currency: string): string {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return "Indisponible";
  return `${numericAmount.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${currency || ""}`.trim();
}

function normalizeGatewayAmount(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function gatewayBalanceMenuMarkup() {
  return {
    inline_keyboard: [
      [
        { text: "💰 OmniPay", callback_data: "gateway_balance:omnipay" },
        { text: "💰 SendavaPay", callback_data: "gateway_balance:sendavapay" },
      ],
      [
        { text: "💰 SeaPay", callback_data: "gateway_balance:seapay" },
        { text: "💰 ClaPay", callback_data: "gateway_balance:clapay" },
      ],
      [
        { text: "💰 MbiyoPay", callback_data: "gateway_balance:mbiyo" },
      ],
    ],
  };
}

function gatewayBalanceResultMarkup(gateway: GatewayBalanceId) {
  return {
    inline_keyboard: [
      [{ text: "🔄 Actualiser", callback_data: `gateway_balance:${gateway}` }],
      [{ text: "↩️ Choisir un autre gateway", callback_data: "gateway_balance:menu" }],
    ],
  };
}

function formatGatewayBalanceMessage(
  gatewayLabel: string,
  result: GatewayBalanceResult,
): string {
  const totals = new Map<string, number>();
  for (const wallet of result.wallets) {
    totals.set(wallet.currency, (totals.get(wallet.currency) || 0) + wallet.amount);
  }

  const totalLines = totals.size > 0
    ? Array.from(totals.entries()).map(([currency, amount]) =>
        `💰 *${currency} :* ${gatewayMoney(amount, currency)}`
      ).join("\n")
    : "⚠️ Aucun solde retourné par le gateway.";

  const walletLines = result.wallets.length > 0
    ? result.wallets.map((wallet) => {
        const details = [
          `🌍 *${wallet.country}*`,
          `💳 ${gatewayMoney(wallet.amount, wallet.currency)}`,
        ];
        if (wallet.pending !== undefined) {
          details.push(`⏳ En attente : ${gatewayMoney(wallet.pending, wallet.currency)}`);
        }
        if (wallet.frozen !== undefined) {
          details.push(`🔒 Bloqué : ${gatewayMoney(wallet.frozen, wallet.currency)}`);
        }
        return details.join(" — ");
      }).join("\n")
    : "Aucun wallet pays retourné.";

  const skipped = result.skippedCountries?.length
    ? `\n\nℹ️ *Pays non configurés :* ${result.skippedCountries.join(", ")}`
    : "";

  return (
    `🏦 *Soldes — ${gatewayLabel}*\n\n` +
    `🌐 *Solde global du compte*\n${totalLines}\n\n` +
    `💳 *Soldes des wallets par pays*\n${walletLines}` +
    skipped +
    `\n\n🕒 Mis à jour : ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })}`
  );
}

async function getSeapayCredential(country: string, type: "merchant_id" | "api_secret"): Promise<string | undefined> {
  const slug = country.trim().toLowerCase().replace(/[^a-z]/g, "");
  const envCountry = country.trim().toUpperCase().replace(/[^A-Z]/g, "");
  const envName = `SEAPAY_${envCountry}_${type === "merchant_id" ? "MERCHANT_ID" : "API_SECRET"}`;
  return process.env[envName] || await storage.getSetting(`seapay_${type}_${slug}`);
}

async function fetchGatewayBalances(gateway: GatewayBalanceId): Promise<GatewayBalanceResult> {
  if (gateway === "omnipay") {
    const apiKey = process.env.OMNIPAY_API_KEY || await storage.getSetting("omnipay_api_key");
    if (!apiKey) throw new Error("OmniPay n'est pas configuré.");

    const result = await omnipayGetBalance(apiKey);
    if (result.success !== 1) throw new Error("OmniPay n'a pas retourné le solde.");
    const rawBalances = Array.isArray(result.balance) ? result.balance : [];
    return {
      wallets: rawBalances.map((wallet: any) => ({
        country: wallet.countryName || wallet.countryCode || "Pays inconnu",
        currency: wallet.currency || "—",
        amount: normalizeGatewayAmount(wallet.amount),
        pending: wallet.pending !== undefined ? normalizeGatewayAmount(wallet.pending) : undefined,
      })),
    };
  }

  if (gateway === "sendavapay") {
    const apiKey = process.env.SENDAVA_API_KEY
      || process.env.SENDAVAPAY_API_KEY
      || await storage.getSetting("sendavapay_api_key");
    if (!apiKey) throw new Error("SendavaPay n'est pas configuré.");

    const result = await sendavaGetBalance(apiKey);
    if (!result.success) throw new Error(result.message || "SendavaPay n'a pas retourné le solde.");
    return {
      wallets: (result.data?.wallets || []).map((wallet) => ({
        country: wallet.countryName || wallet.country || "Pays inconnu",
        currency: wallet.currency || "—",
        amount: normalizeGatewayAmount(wallet.balance),
      })),
    };
  }

  if (gateway === "mbiyo") {
    const apiKey = process.env.MBIYO_API_KEY || await storage.getSetting("mbiyo_api_key");
    if (!apiKey) throw new Error("MbiyoPay n'est pas configuré.");

    const result = await mbiyoGetBalance(apiKey);
    if (result.status !== "success") {
      throw new Error(result.message || "MbiyoPay n'a pas retourné le solde.");
    }
    return {
      wallets: (result.data || []).map((wallet) => ({
        country: wallet.country || wallet.currency || "Pays inconnu",
        currency: wallet.currency || "—",
        amount: normalizeGatewayAmount(wallet.amount),
        frozen: wallet.hold !== undefined ? normalizeGatewayAmount(wallet.hold) : undefined,
      })),
    };
  }

  if (gateway === "clapay") {
    const token = process.env.CLAPAY_API_KEY || await storage.getSetting("clapay_api_key");
    if (!token) throw new Error("ClaPay n'est pas configuré.");

    const result = await clapayGetBalance(token);
    if (!result.success) throw new Error(result.message || "ClaPay n'a pas retourné le solde.");
    if (Array.isArray(result.balances)) {
      return {
        wallets: result.balances.map((wallet: any) => ({
          country: wallet.countryName || wallet.country || wallet.country_code || "Pays inconnu",
          currency: wallet.currency || "XOF",
          amount: normalizeGatewayAmount(wallet.balance),
        })),
      };
    }
    return {
      wallets: result.balance !== undefined
        ? [{ country: "Global", currency: result.currency || "XOF", amount: normalizeGatewayAmount(result.balance) }]
        : [],
    };
  }

  const seapayCountries = Object.entries(SEAPAY_BALANCE_COUNTRIES);
  const settled = await Promise.all(seapayCountries.map(async ([country, currency]) => {
    const [merchantId, apiSecret] = await Promise.all([
      getSeapayCredential(country, "merchant_id"),
      getSeapayCredential(country, "api_secret"),
    ]);
    if (!merchantId || !apiSecret) return { country, wallet: null };

    try {
      const result = await seapayBalance(merchantId, currency, apiSecret);
      if (result.code !== 200 || !result.data) return { country, wallet: null };
      return {
        country,
        wallet: {
          country,
          currency: result.data.currency || currency,
          amount: normalizeGatewayAmount(result.data.balance),
          frozen: result.data.frozen !== undefined ? normalizeGatewayAmount(result.data.frozen) : undefined,
        },
      };
    } catch {
      return { country, wallet: null };
    }
  }));

  const wallets = settled.flatMap((item) => item.wallet ? [item.wallet] : []);
  const skippedCountries = settled.filter((item) => !item.wallet).map((item) => item.country);
  if (wallets.length === 0) throw new Error("Aucun compte SeaPay configuré ou joignable.");
  return { wallets, skippedCountries };
}

async function replyGatewayBalanceMenu(ctx: any): Promise<void> {
  await ctx.reply(
    "🏦 *Soldes des gateways*\n\nSélectionnez le gateway à consulter :\n\n" +
    "Le résultat affichera le solde global du compte et le détail des wallets par pays.",
    { parse_mode: "Markdown", reply_markup: gatewayBalanceMenuMarkup() },
  );
}

export function initTelegramBot(overrideToken?: string): Telegraf | null {
  const token = overrideToken || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("[TELEGRAM] TELEGRAM_BOT_TOKEN non defini — bot non demarre");
    return null;
  }

  bot = new Telegraf(token);

  // ─── Gestionnaire d'erreurs global — empêche le bot de se bloquer silencieusement ──
  // Sans ce handler, une erreur non capturée dans un command/middleware arrête le traitement
  // de tous les updates suivants sans aucun message d'erreur visible.
  bot.catch((err: any, ctx: any) => {
    const chatId = ctx?.chat?.id || ctx?.from?.id || "?";
    const updateType = ctx?.updateType || "unknown";
    console.error(`[TELEGRAM] Erreur non capturée (update: ${updateType}, chat: ${chatId}):`, err?.message || err);
    // Tenter d'informer l'utilisateur si possible
    if (ctx?.reply) {
      ctx.reply("❌ Une erreur interne s'est produite. Veuillez réessayer.").catch(() => {});
    }
  });

  // ─── Middleware global de logging + auto-enregistrement ──────────────────────
  // CRITIQUE : ce middleware DOIT toujours appeler next() sans exception.
  // Il log chaque update entrant pour diagnostiquer les problèmes de réception.
  bot.use(async (ctx, next) => {
    try {
      const updateType = (ctx.update as any).message ? "message"
        : (ctx.update as any).callback_query ? "callback_query"
        : (ctx.update as any).my_chat_member ? "my_chat_member"
        : (ctx.update as any).edited_message ? "edited_message"
        : "other";
      const chatId = ctx.chat ? String(ctx.chat.id) : ctx.from ? String(ctx.from.id) : "?";
      const text = (ctx.update as any).message?.text || (ctx.update as any).callback_query?.data || "";
      console.log(`[TG] update=${updateType} chat=${chatId} text="${text.slice(0, 60)}"`);

      // Auto-enregistrement des groupes
      if (ctx.chat && (ctx.chat.type === "group" || ctx.chat.type === "supergroup")) {
        const groups = await getKnownGroups();
        if (!groups.includes(chatId)) {
          registerKnownGroup(chatId).catch(() => {});
        }
      }
    } catch (e: any) {
      console.error("[TG] middleware error (ignoré):", e?.message);
    }
    // TOUJOURS passer au handler suivant, sans exception
    return next();
  });

  // ─── Initialisation : forcer groupe admin + reconstruire la liste des groupes connus ──
  (async () => {
    try {
      // ── 1. Forcer l'ID du groupe admin en DB (toujours, peu importe la valeur actuelle)
      const currentAdminGroup = await storage.getSetting("telegram_group_id");
      if (currentAdminGroup !== HARDCODED_ADMIN_GROUP_ID) {
        await storage.setSetting("telegram_group_id", HARDCODED_ADMIN_GROUP_ID);
        console.log(`[TELEGRAM] telegram_group_id forcé → ${HARDCODED_ADMIN_GROUP_ID} (était : "${currentAdminGroup || "vide"}")`);
      }

      // ── 2. Reconstruire la liste des groupes connus
      const known = await getKnownGroups();
      const toAdd: string[] = [];

      if (!known.includes(HARDCODED_ADMIN_GROUP_ID)) toAdd.push(HARDCODED_ADMIN_GROUP_ID);

      const merchants = await storage.getMerchants();
      for (const m of merchants) {
        if (m.telegramChatId && !known.includes(m.telegramChatId) && !toAdd.includes(m.telegramChatId)) {
          toAdd.push(m.telegramChatId);
        }
      }

      if (toAdd.length > 0) {
        const updated = [...known, ...toAdd];
        await storage.setSetting("telegram_known_groups", JSON.stringify(updated));
        console.log(`[TELEGRAM] Groupes connus mis à jour : ${updated.length} groupe(s)`);
      }

      // ── 3. Message de démarrage — cooldown 1h en base pour éviter le spam lors des redémarrages fréquents
      if (!startupTestSent) {
        startupTestSent = true;
        const COOLDOWN_MS = 60 * 60 * 1000; // 1 heure minimum entre deux notifications
        try {
          const lastSentRaw = await storage.getSetting("telegram_startup_last_sent");
          const lastSent = lastSentRaw ? parseInt(lastSentRaw, 10) : 0;
          const elapsed = Date.now() - lastSent;
          if (elapsed >= COOLDOWN_MS) {
            await storage.setSetting("telegram_startup_last_sent", String(Date.now()));
            const now = new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan", hour12: false });
            await bot!.telegram.sendMessage(
              HARDCODED_ADMIN_GROUP_ID,
              `✅ WestPay démarré — ${now}`,
              { parse_mode: "Markdown" }
            ).catch((err: any) => {
              console.error(`[TELEGRAM] Impossible d'envoyer le message de démarrage : ${err.message}`);
            });
          }
        } catch {
          // Si la DB est inaccessible, on n'envoie pas plutôt que de spammer
        }
      }
    } catch (err) {
      console.error("[TELEGRAM] Erreur init groupes:", (err as any).message);
    }
  })();

  // ─── /start (DM uniquement - liaison compte marchand) ────────────────────
  bot.command("start", async (ctx) => {
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (isGroup) return;

    const userId = String(ctx.from?.id || ctx.chat.id);
    const chatId = String(ctx.chat.id);
    const text = ctx.message.text || "";
    const code = text.split(" ")[1]?.trim();

    if (!code) {
      const linked = await storage.getMerchantByTelegramChatId(chatId);
      if (linked) {
        await ctx.reply(`✅ Votre compte *${linked.name}* est déjà lié.\n\nTapez /aide pour voir vos commandes.`, { parse_mode: "Markdown" });
      } else {
        await ctx.reply("🔒 此机器人仅供已获授权的 WestPay 商户使用。\n\n如果您是商户，请向您的管理员申请激活码。", { parse_mode: "Markdown" });
      }
      return;
    }

    if (isRateLimited(userId)) {
      await ctx.reply("⛔ Trop de tentatives incorrectes. Réessayez dans 1 heure.");
      await alertAdminGroup(`⚠️ *Tentative bloquée (rate limit)*\n\n👤 Utilisateur : ${formatUser(ctx)}\n🆔 ID : \`${userId}\``);
      return;
    }

    const ac = await storage.getTelegramActivationCode(code);
    if (!ac || ac.used || new Date() > new Date(ac.expiresAt)) {
      const remaining = recordFailed(userId);
      if (remaining <= 0) {
        await ctx.reply("⛔ Code invalide. Compte bloqué pendant 1 heure suite à trop de tentatives.");
        await alertAdminGroup(`🚨 *Compte bloqué (trop de tentatives)*\n\n👤 Utilisateur : ${formatUser(ctx)}\n🆔 ID : \`${userId}\``);
      } else {
        await ctx.reply(`❌ Code invalide ou expiré.\n\n⚠️ Tentatives restantes : *${remaining}*`, { parse_mode: "Markdown" });
        if (remaining <= 2) await alertAdminGroup(`⚠️ *Tentatives suspectes de liaison bot*\n\n👤 Utilisateur : ${formatUser(ctx)}\n🆔 ID : \`${userId}\`\n⚠️ Tentatives restantes : ${remaining}`);
      }
      return;
    }

    const existingMerchant = await storage.getMerchantByTelegramChatId(chatId);
    if (existingMerchant) {
      await ctx.reply(`ℹ️ Ce compte Telegram est déjà lié à *${existingMerchant.name}*.`, { parse_mode: "Markdown" });
      return;
    }

    await storage.updateMerchantTelegramChatId(ac.merchantId, chatId);
    await storage.markTelegramActivationCodeUsed(code);
    resetAttempts(userId);

    const merchant = await storage.getMerchantById(ac.merchantId);
    await ctx.reply(
      `✅ *Compte lié avec succès !*\n\nBienvenue, *${merchant?.name}* 👋\n\nVous recevrez désormais vos notifications de paiement ici.\n\nTapez /aide pour voir vos commandes.`,
      { parse_mode: "Markdown" }
    );

    const groupId = await getAdminGroupId();
    if (groupId) {
      await bot!.telegram.sendMessage(groupId,
        `🔗 *Nouveau marchand lié à Telegram*\n\n🏪 Marchand : *${merchant?.name}*\n📧 ${merchant?.email}\n👤 Telegram : ${formatUser(ctx)}`,
        { parse_mode: "Markdown" }
      ).catch(() => {});
    }
  });

  // ─── /setgroup (groupe admin, protégé par clé API) ────────────────────────
  bot.command("setgroup", async (ctx) => {
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup) { await ctx.reply("❌ Cette commande doit être utilisée dans un groupe."); return; }

    const text = ctx.message.text || "";
    const apiKey = text.split(" ")[1]?.trim();
    const chatId = String(ctx.chat.id);

    const existingGroupId = await getAdminGroupId();
    if (existingGroupId && chatId === existingGroupId && !apiKey) {
      await ctx.reply(`✅ Ce groupe est déjà enregistré comme groupe admin.\n🆔 Chat ID : \`${chatId}\``, { parse_mode: "Markdown" });
      return;
    }

    if (!apiKey) {
      await ctx.reply("🔒 Accès refusé. Utilisez : `/setgroup CLE_API_ADMIN`\n\nLa clé API admin se trouve dans le dashboard WestPay.", { parse_mode: "Markdown" });
      await alertAdminGroup(`⚠️ *Tentative /setgroup sans clé*\n\n👥 Groupe : ${(ctx.chat as any).title || chatId}\n👤 Par : ${formatUser(ctx)}`);
      return;
    }

    const adminRecord = await (async () => {
      try {
        const { db } = await import("./db");
        const { admins: adminsTable } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        const [a] = await db.select().from(adminsTable).where(eq(adminsTable.apiKey, apiKey));
        return a;
      } catch { return null; }
    })();

    if (!adminRecord) {
      await ctx.reply("🔒 Clé API invalide. Accès refusé.");
      await alertAdminGroup(`🚨 *Tentative /setgroup avec clé invalide*\n\n👥 Groupe : ${(ctx.chat as any).title || chatId}\n👤 Par : ${formatUser(ctx)}`);
      return;
    }

    await storage.setSetting("telegram_group_id", chatId);
    await registerKnownGroup(chatId);
    await ctx.reply(
      `✅ *Groupe admin enregistré !*\n\n🔐 Authentifié : *${adminRecord.email}*\n📢 Toutes les alertes WestPay arriveront dans ce groupe.\n🆔 Chat ID : \`${chatId}\``,
      { parse_mode: "Markdown" }
    );
  });

  // ─── /setmarchand (liaison groupe → marchand) ─────────────────────────────
  bot.command("setmarchand", async (ctx) => {
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup) { await ctx.reply("❌ Cette commande doit être utilisée dans un groupe dédié au marchand."); return; }

    const userId = String(ctx.from?.id || "");
    const chatId = String(ctx.chat.id);
    const text = ctx.message.text || "";
    const code = text.split(" ")[1]?.trim();

    if (!code) {
      await ctx.reply("❌ Code manquant.\n\nUtilisez : `/setmarchand CODE`\n\nLe code est généré depuis le dashboard WestPay.", { parse_mode: "Markdown" });
      return;
    }

    if (isRateLimited(userId)) {
      await ctx.reply("⛔ Trop de tentatives. Réessayez dans 1 heure.");
      await alertAdminGroup(`⚠️ *Tentative bloquée /setmarchand*\n\n👤 ${formatUser(ctx)}\n👥 Groupe : ${(ctx.chat as any).title || chatId}`);
      return;
    }

    const ac = await storage.getTelegramActivationCode(code);
    if (!ac || ac.used || new Date() > new Date(ac.expiresAt)) {
      const remaining = recordFailed(userId);
      if (remaining <= 0) {
        await ctx.reply("⛔ Code invalide. Bloqué pendant 1 heure.");
        await alertAdminGroup(`🚨 *Bloqué (trop de tentatives /setmarchand)*\n\n👤 ${formatUser(ctx)}\n👥 ${(ctx.chat as any).title || chatId}`);
      } else {
        await ctx.reply(`❌ Code invalide ou expiré.\n⚠️ Tentatives restantes : *${remaining}*`, { parse_mode: "Markdown" });
      }
      return;
    }

    const groupTitle = (ctx.chat as any).title || "Ce groupe";
    await storage.updateMerchantTelegramChatId(ac.merchantId, chatId);
    await storage.markTelegramActivationCodeUsed(code);
    await registerKnownGroup(chatId);
    // Invalider le cache merchant pour ce chatId (la liaison vient de changer)
    _cache.merchantByChat.delete(chatId);
    resetAttempts(userId);

    const merchant = await storage.getMerchantById(ac.merchantId);
    await ctx.reply(
      `✅ *Groupe lié au marchand !*\n\n🏪 Marchand : *${merchant?.name}*\n📧 ${merchant?.email}\n\n` +
      MERCHANT_AIDE_MSG(merchant?.name || ""),
      { parse_mode: "Markdown" }
    );

    const adminGroupId = await getAdminGroupId();
    if (adminGroupId && adminGroupId !== chatId) {
      await bot!.telegram.sendMessage(adminGroupId,
        `🔗 *Groupe marchand configuré*\n\n🏪 Marchand : *${merchant?.name}*\n👥 Groupe : ${groupTitle}\n👤 Configuré par : ${formatUser(ctx)}`,
        { parse_mode: "Markdown" }
      ).catch(() => {});
    }
  });

  // ─── /stats ────────────────────────────────────────────────────────────────
  bot.command("stats", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";

    if (isGroup) {
      if (await isAdminGroup(chatId)) {
        try {
          const stats = await storage.getStats();
          await ctx.reply(
            `📊 *Statistiques WestPay*\n\n🏪 Marchands : *${stats.merchantCount}*\n💳 Transactions : *${stats.transactionCount}*\n💰 Volume total : *${formatAmount(stats.totalVolume)}*\n📱 Numéros actifs : *${stats.activeNumbers}*`,
            { parse_mode: "Markdown" }
          );
        } catch { await ctx.reply("❌ Erreur lors de la récupération des statistiques."); }
        return;
      }
      const merchant = await getMerchantForGroup(chatId);
      if (!merchant) return;
      if (merchant.suspended) { await ctx.reply("⚠️ Compte suspendu."); return; }
      try {
        const stats = await storage.getMerchantStats(merchant.id);
        await ctx.reply(
          `📊 *Vos statistiques — ${merchant.name}*\n\n💳 Transactions : *${stats.transactionCount}*\n💰 Volume total : *${formatAmount(stats.totalVolume)}*`,
          { parse_mode: "Markdown" }
        );
      } catch { await ctx.reply("❌ Erreur."); }
      return;
    }

    const merchant = await storage.getMerchantByTelegramChatId(chatId);
    if (!merchant) return;
    if (merchant.suspended) { await ctx.reply("⚠️ Compte suspendu."); return; }
    try {
      const stats = await storage.getMerchantStats(merchant.id);
      await ctx.reply(
        `📊 *Vos statistiques — ${merchant.name}*\n\n💳 Transactions : *${stats.transactionCount}*\n💰 Volume total : *${formatAmount(stats.totalVolume)}*`,
        { parse_mode: "Markdown" }
      );
    } catch { await ctx.reply("❌ Erreur."); }
  });

  // ─── /marchands (groupe admin uniquement) ─────────────────────────────────
  bot.command("marchands", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup) return;
    const authorized = await isAdminGroup(chatId);
    if (!authorized) return;

    try {
      const merchants = await storage.getMerchants();
      if (merchants.length === 0) { await ctx.reply("Aucun marchand enregistré."); return; }
      const lines = merchants.slice(0, 20).map((m, i) =>
        `${i + 1}. *${m.name}* — ${m.suspended ? "🔴 Suspendu" : "🟢 Actif"}${m.telegramChatId ? " 📱" : ""}`
      );
      await ctx.reply(
        `🏪 *Marchands WestPay* (${merchants.length})\n\n${lines.join("\n")}\n\n📱 = Telegram lié`,
        { parse_mode: "Markdown" }
      );
    } catch { await ctx.reply("❌ Erreur."); }
  });

  // ─── /soldegateway (groupe admin uniquement) ─────────────────────────────
  bot.command("soldegateway", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup || !await isAdminGroup(chatId)) return;
    await replyGatewayBalanceMenu(ctx);
  });

  // ─── Callback : sélection et actualisation du solde gateway ──────────────
  bot.action("gateway_balance:menu", async (ctx) => {
    const chatId = String(ctx.chat?.id || "");
    if (!chatId || !await isAdminGroup(chatId)) {
      await ctx.answerCbQuery("⛔ Non autorisé");
      return;
    }
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      "🏦 *Soldes des gateways*\n\nSélectionnez le gateway à consulter :\n\n" +
      "Le résultat affichera le solde global du compte et le détail des wallets par pays.",
      { parse_mode: "Markdown", reply_markup: gatewayBalanceMenuMarkup() },
    );
  });

  bot.action(/^gateway_balance:(omnipay|sendavapay|mbiyo|seapay|clapay)$/, async (ctx) => {
    const chatId = String(ctx.chat?.id || "");
    if (!chatId || !await isAdminGroup(chatId)) {
      await ctx.answerCbQuery("⛔ Non autorisé").catch(() => {});
      return;
    }

    const gateway = ctx.match[1] as GatewayBalanceId;
    const gatewayLabel = GATEWAY_BALANCE_OPTIONS.find((option) => option.id === gateway)?.label || gateway;
    await ctx.answerCbQuery("⏳ Récupération du solde...").catch(() => {});

    try {
      await ctx.editMessageText(
        `⏳ Récupération des soldes ${gatewayLabel}...`,
        { reply_markup: gatewayBalanceResultMarkup(gateway) },
      );
    } catch {
      // Le message peut déjà avoir été modifié par un autre clic ; la requête
      // de solde doit tout de même continuer et produire une réponse finale.
    }

    try {
      const result = await Promise.race([
        fetchGatewayBalances(gateway),
        new Promise<GatewayBalanceResult>((_, reject) =>
          setTimeout(() => reject(new Error("Délai dépassé (35s).")), 35000)
        ),
      ]);
      await ctx.editMessageText(
        formatGatewayBalanceMessage(gatewayLabel, result),
        { parse_mode: "Markdown", reply_markup: gatewayBalanceResultMarkup(gateway) },
      );
    } catch (err: any) {
      const errorText =
        `❌ Impossible de récupérer les soldes ${gatewayLabel}.\n\n` +
        `${err?.message || "Le service n'a pas répondu."}\n\n` +
        "Vérifiez que le gateway est configuré et que son service est accessible.";
      try {
        await ctx.editMessageText(errorText, { reply_markup: gatewayBalanceResultMarkup(gateway) });
      } catch {
        await ctx.reply(errorText, { reply_markup: gatewayBalanceResultMarkup(gateway) }).catch(() => {});
      }
    }
  });

  // ─── /solde ────────────────────────────────────────────────────────────────
  bot.command("solde", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";

    if (isGroup) {
      if (await isAdminGroup(chatId)) {
        try {
          const merchants = await storage.getMerchants();
          if (merchants.length === 0) { await ctx.reply("Aucun marchand enregistré."); return; }
          for (const m of merchants.filter(m => !m.suspended).slice(0, 10)) {
            const msg = await buildMerchantSoldeMessage(m.id, m.name);
            await ctx.reply(`🏪 *${m.name}*\n\n${msg}`, { parse_mode: "Markdown" });
          }
        } catch { await ctx.reply("❌ Erreur."); }
        return;
      }
      const merchant = await getMerchantForGroup(chatId);
      if (!merchant) return;
      if (merchant.suspended) { await ctx.reply("⚠️ Compte suspendu. Contactez votre administrateur."); return; }
      try {
        const msg = await buildMerchantSoldeMessage(merchant.id, merchant.name);
        await ctx.reply(`💰 *Soldes — ${merchant.name}*\n\n${msg}`, { parse_mode: "Markdown" });
      } catch { await ctx.reply("❌ Erreur."); }
      return;
    }

    const merchant = await storage.getMerchantByTelegramChatId(chatId);
    if (!merchant) return;
    if (merchant.suspended) { await ctx.reply("⚠️ Compte suspendu. Contactez votre administrateur."); return; }
    try {
      const msg = await buildMerchantSoldeMessage(merchant.id, merchant.name);
      await ctx.reply(`💰 *Soldes — ${merchant.name}*\n\n${msg}`, { parse_mode: "Markdown" });
    } catch { await ctx.reply("❌ Erreur."); }
  });

  // ─── /transactions (DM et groupe marchand) ────────────────────────────────
  bot.command("transactions", async (ctx) => {
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    const chatId = String(ctx.chat.id);

    if (isGroup) {
      if (await isAdminGroup(chatId)) return;
      const merchant = await getMerchantForGroup(chatId);
      if (!merchant) return;
      try {
        const txs = await storage.getTransactions(merchant.id);
        const recent = txs.slice(0, 5);
        if (recent.length === 0) { await ctx.reply("Aucune transaction enregistrée."); return; }
        const lines = recent.map((t, i) => {
          const date = new Date(t.createdAt).toLocaleDateString("fr-FR");
          const statusIcon = t.status === "confirmed" ? "✅" : "⏳";
          return `${i + 1}. ${statusIcon} *${formatAmountC(t.amount, t.country)}*\n   ${countryLabel(t.country)} — ${date}${t.payerNumber ? `\n   📞 ${t.payerNumber}` : ""}\n   🔖 \`${t.txId}\``;
        });
        await ctx.reply(`📋 *5 dernières transactions — ${merchant.name}*\n\n${lines.join("\n\n")}`, { parse_mode: "Markdown" });
      } catch { await ctx.reply("❌ Erreur."); }
      return;
    }

    const merchant = await storage.getMerchantByTelegramChatId(chatId);
    if (!merchant) return;
    try {
      const txs = await storage.getTransactions(merchant.id);
      const recent = txs.slice(0, 5);
      if (recent.length === 0) { await ctx.reply("Aucune transaction enregistrée."); return; }
      const lines = recent.map((t, i) => {
        const date = new Date(t.createdAt).toLocaleDateString("fr-FR");
        const statusIcon = t.status === "confirmed" ? "✅" : "⏳";
        return `${i + 1}. ${statusIcon} *${formatAmountC(t.amount, t.country)}*\n   ${countryLabel(t.country)} — ${date}${t.payerNumber ? `\n   📞 ${t.payerNumber}` : ""}\n   🔖 \`${t.txId}\``;
      });
      await ctx.reply(`📋 *Vos 5 dernières transactions*\n\n${lines.join("\n\n")}`, { parse_mode: "Markdown" });
    } catch { await ctx.reply("❌ Erreur."); }
  });

  // ─── /broadcast (groupe admin — flux conversationnel) ─────────────────────
  bot.command("broadcast", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup || !await isAdminGroup(chatId)) {
      await ctx.reply("❌ Cette commande est réservée au groupe admin.");
      return;
    }

    broadcastSessions.set(chatId, {
      step: "waiting_type",
      initiator: formatUser(ctx),
    });

    await ctx.reply(
      "📢 *Nouveau broadcast*\n\n" +
      "Choisissez d'abord le type de diffusion :",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🌐 Tous les groupes (où le bot est présent)", callback_data: "broadcast_type:all_groups" }],
            [{ text: "🏪 Groupes marchands liés uniquement", callback_data: "broadcast_type:merchants_only" }],
            [{ text: "❌ Annuler", callback_data: "broadcast_type:cancel" }],
          ],
        },
      }
    );
  });

  // ─── Callback : sélection du type de broadcast ──────────────────────────
  bot.action(/^broadcast_type:(.+)$/, async (ctx) => {
    const chatId = String(ctx.chat?.id || "");
    if (!chatId || !await isAdminGroup(chatId)) { await ctx.answerCbQuery(); return; }

    const choice = ctx.match[1] as string;
    await ctx.answerCbQuery();

    if (choice === "cancel") {
      broadcastSessions.delete(chatId);
      await ctx.editMessageText("❌ Broadcast annulé.");
      return;
    }

    const session = broadcastSessions.get(chatId);
    if (!session || session.step !== "waiting_type") {
      await ctx.editMessageText("❌ Aucune session de broadcast en cours. Utilisez /broadcast pour recommencer.");
      return;
    }

    session.broadcastType = choice as "all_groups" | "merchants_only";
    session.step = "waiting_content";
    broadcastSessions.set(chatId, session);

    const typeLabel = choice === "all_groups"
      ? "🌐 *Tous les groupes* (où le bot est présent)"
      : "🏪 *Groupes marchands liés uniquement*";

    await ctx.editMessageText(
      `📢 *Nouveau broadcast*\n\n` +
      `📋 Type : ${typeLabel}\n\n` +
      `Envoyez maintenant votre message — il sera diffusé immédiatement.\n\n` +
      `• Texte seul → envoyez le texte\n` +
      `• Avec image → envoyez une *photo* (la légende sera le texte du message)\n\n` +
      `Vous pouvez utiliser *gras*, _italique_, \`code\` (Markdown Telegram).\n\n` +
      `Envoyez /annuler pour annuler.`,
      { parse_mode: "Markdown" }
    );
  });

  // ─── /annuler (annule le broadcast ou commander en cours) ────────────────
  bot.command("annuler", async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (merchantPaymentDisableSessions.has(chatId)) {
      merchantPaymentDisableSessions.delete(chatId);
      await ctx.reply("❌ Désactivation payin/payout annulée.");
    } else if (broadcastSessions.has(chatId)) {
      broadcastSessions.delete(chatId);
      await ctx.reply("❌ Broadcast annulé.");
    } else if (commanderSessions.has(chatId)) {
      commanderSessions.delete(chatId);
      await ctx.reply("❌ Commander annulé.");
    }
  });

  // ─── /commander (groupe admin uniquement) ─────────────────────────────────
  // Recherche un retrait par numéro de téléphone et propose 4 actions.
  bot.command("commander", async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!await isAdminGroup(chatId)) {
      await ctx.reply("⛔ Cette commande est réservée au groupe admin WestPay.").catch(() => {});
      return;
    }
    commanderSessions.set(chatId, { step: "waiting_phone" });
    await ctx.reply(
      "📱 *Commander — Recherche de retrait*\n\n" +
      "Envoyez le numéro de téléphone du bénéficiaire :\n" +
      "_(ex: 22890123456 ou 90123456)_\n\n" +
      "Envoyez /annuler pour annuler.",
      { parse_mode: "Markdown" }
    );
  });

  // ─── /desactiverpaiement (groupe admin uniquement) ─────────────────────────
  bot.command("desactiverpaiement", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup || !await isAdminGroup(chatId)) {
      await ctx.reply("⛔ Cette commande est réservée au groupe admin WestPay.").catch(() => {});
      return;
    }
    merchantPaymentDisableSessions.set(chatId, { step: "waiting_slug" });
    await ctx.reply(
      "🔒 *Désactiver payin et payout*\n\n" +
      "Envoyez maintenant le *slug exact du marchand*.\n\n" +
      "Toutes les nouvelles demandes de ce compte retourneront :\n" +
      "`404 未经授权的付款`\n\n" +
      "Envoyez /annuler pour annuler.",
      { parse_mode: "Markdown" },
    );
  });

  // ─── Photo reçue dans le groupe admin (pour le broadcast) ─────────────────
  // Diffuse immédiatement dès réception — pas d'étape intermédiaire.
  bot.on("photo", async (ctx, next) => {
    const chatId = String(ctx.chat.id);
    const session = broadcastSessions.get(chatId);
    // Si pas de session broadcast en attente de contenu → passer au handler suivant
    if (!session || session.step !== "waiting_content") return next();
    if (!await isAdminGroup(chatId)) return next();

    const photos = ctx.message.photo;
    const bestPhoto = photos[photos.length - 1];
    const caption = (ctx.message.caption || "").trim();

    broadcastSessions.delete(chatId);
    await ctx.reply("📤 Diffusion en cours...");

    const result = await broadcastToMerchants({
      message: caption,
      fileId: bestPhoto.file_id,
      buttons: undefined,
      useAllKnownGroups: session.broadcastType === "all_groups",
    });
    const typeLabel = session.broadcastType === "all_groups" ? "🌐 Tous les groupes" : "🏪 Groupes marchands";
    await ctx.reply(
      `✅ *Diffusion terminée*\n\n📋 Type : ${typeLabel}\n📤 Envoyé : *${result.sent}*\n❌ Échec : *${result.failed}*`,
      { parse_mode: "Markdown" }
    ).catch(() => {});
  });

  // ─── Messages texte (flux commander conversationnel) ─────────────────────
  bot.on("message", async (ctx, next) => {
    const chatId = String(ctx.chat.id);
    const paymentDisableSession = merchantPaymentDisableSessions.get(chatId);
    if (paymentDisableSession?.step === "waiting_slug") {
      const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
      if (!isGroup || !await isAdminGroup(chatId)) {
        merchantPaymentDisableSessions.delete(chatId);
        return next();
      }
      const msg = ctx.message as any;
      const slug = String(msg.text || "").trim();
      if (!slug || slug.startsWith("/")) return next();
      merchantPaymentDisableSessions.delete(chatId);

      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(slug)) {
        await ctx.reply("❌ Slug invalide. Relancez /desactiverpaiement avec le slug exact du marchand.");
        return;
      }

      try {
        const merchant = await storage.getMerchantBySlug(slug);
        if (!merchant) {
          await ctx.reply(
            `❌ Aucun marchand trouvé avec le slug \`${slug}\`. Relancez /desactiverpaiement pour réessayer.`,
            { parse_mode: "Markdown" },
          );
          return;
        }

        await storage.updateMerchant(merchant.id, {
          payinDisabled: true,
          withdrawalsDisabled: true,
        });
        await ctx.reply(
          `✅ *Payin et payout désactivés*\n\n` +
          `🏪 Marchand : *${merchant.name}*\n` +
          `🔖 Slug : \`${merchant.slug}\`\n\n` +
          `Toutes les nouvelles demandes via ce compte retournent :\n` +
          `\`404 未经授权的付款\``,
          { parse_mode: "Markdown" },
        );
      } catch (err: any) {
        console.error("[TELEGRAM] Désactivation payin/payout impossible:", err?.message || err);
        await ctx.reply("❌ Impossible de modifier ce marchand. Réessayez plus tard.");
      }
      return;
    }

    const cmdSession = commanderSessions.get(chatId);
    if (cmdSession && cmdSession.step === "waiting_phone") {
      if (!await isAdminGroup(chatId)) { commanderSessions.delete(chatId); return next(); }
      const msg = ctx.message as any;
      const text: string = (msg.text || "").trim();
      if (!text || text.startsWith("/")) return next();
      commanderSessions.delete(chatId);

      // Normalise : garde uniquement les chiffres pour la recherche
      const digitsOnly = text.replace(/\D/g, "");
      if (digitsOnly.length < 6) {
        await ctx.reply("❌ Numéro de téléphone invalide (trop court). Relancez /commander.");
        return;
      }

      // withdrawals → base financière ; merchants → base auth (deux requêtes séparées)
      const result = await financialPool.query<any>(
        `SELECT w.id, w.phone, w.amount, w.country, w.status, w.gateway, w.operator,
                w.omnipay_ref, w.created_at, w.fees, w.admin_note, w.merchant_id
         FROM withdrawals w
         WHERE REGEXP_REPLACE(w.phone, '[^0-9]', '', 'g') LIKE $1
           AND w.status IN ('pending', 'failed')
         ORDER BY w.created_at DESC
         LIMIT 5`,
        [`%${digitsOnly}%`]
      );
      // Enrichir avec le nom marchand depuis la base auth
      const _uniqueMids = Array.from(new Set(result.rows.map((r: any) => Number(r.merchant_id))));
      const _mNameMap = new Map<number, string>();
      for (const mid of _uniqueMids) {
        const m = await storage.getMerchantById(mid);
        if (m) _mNameMap.set(mid, m.name);
      }
      result.rows.forEach((r: any) => { r.merchant_name = _mNameMap.get(Number(r.merchant_id)) || ""; });

      if (result.rows.length === 0) {
        await ctx.reply(
          `🔍 Aucun retrait en attente trouvé pour *${text}*\n\n_Seuls les retraits en statut "pending" ou "failed" sont affichés._`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      await ctx.reply(
        `📋 *${result.rows.length} retrait(s) trouvé(s) pour \`${text}\`*`,
        { parse_mode: "Markdown" }
      );

      for (const w of result.rows) {
        const date = new Date(w.created_at).toLocaleString("fr-FR", {
          timeZone: "Africa/Abidjan", day: "2-digit", month: "2-digit",
          year: "2-digit", hour: "2-digit", minute: "2-digit",
        });
        const statusEmoji = w.status === "pending" ? "⏳" : "❌";
        const wMsg =
          `${statusEmoji} *Retrait #${w.id}*\n` +
          `👤 Marchand : ${w.merchant_name}\n` +
          `💰 Montant : ${Number(w.amount).toLocaleString("fr-FR")} FCFA\n` +
          `📱 Téléphone : \`${w.phone}\`\n` +
          `🌍 Pays : ${w.country}\n` +
          `🏦 Opérateur : ${w.operator || "N/A"}\n` +
          `⚙️ Fournisseur : ${w.gateway || "N/A"}\n` +
          `🔗 Réf fournisseur : ${w.omnipay_ref || "—"}\n` +
          `📅 Date : ${date}` +
          (w.admin_note ? `\n📝 Note : ${String(w.admin_note).slice(0, 80)}` : "");
        await ctx.reply(wMsg, {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Valider", callback_data: `wd:validate:${w.id}` },
                { text: "✓ Approuvé", callback_data: `wd:approve:${w.id}` },
              ],
              [
                { text: "🚀 Déclencher fournisseur", callback_data: `wd:trigger:${w.id}` },
                { text: "🔍 Vérifier fournisseur", callback_data: `wd:check:${w.id}` },
              ],
            ],
          },
        });
      }
      return;
    }
    return next();
  });

  // ─── Messages texte (flux broadcast conversationnel) ─────────────────────
  bot.on("message", async (ctx, next) => {
    const chatId = String(ctx.chat.id);
    const session = broadcastSessions.get(chatId);
    if (!session) return next();
    if (session.step === "waiting_type") return next(); // handled via callback_query
    if (!await isAdminGroup(chatId)) return next();

    const msg = ctx.message as any;
    const text: string = msg.text || "";

    // Skip if it's a command (handled separately)
    if (text.startsWith("/")) return next();

    if (session.step === "waiting_content") {
      if (!text.trim()) return next();

      // Diffuser immédiatement dès réception du texte — pas d'étape intermédiaire.
      broadcastSessions.delete(chatId);
      await ctx.reply("📤 Diffusion en cours...");

      const result = await broadcastToMerchants({
        message: text.trim(),
        buttons: undefined,
        useAllKnownGroups: session.broadcastType === "all_groups",
      });

      const typeLabel = session.broadcastType === "all_groups" ? "🌐 Tous les groupes" : "🏪 Groupes marchands";
      await ctx.reply(
        `✅ *Diffusion terminée*\n\n📋 Type : ${typeLabel}\n📤 Envoyé : *${result.sent}*\n❌ Échec : *${result.failed}*`,
        { parse_mode: "Markdown" }
      ).catch(() => {});
      return;
    }
  });

  // ─── /restreint (groupe admin uniquement) ─────────────────────────────────
  bot.command("restreint", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup || !await isAdminGroup(chatId)) return;

    const text = ctx.message.text || "";
    const arg = text.split(" ")[1]?.trim();

    if (!arg) {
      const blocked = getBlockedUsers();
      if (blocked.length === 0) {
        await ctx.reply("✅ Aucun utilisateur bloqué en ce moment.", { parse_mode: "Markdown" });
        return;
      }
      const now = new Date();
      const lines = blocked.map(b => {
        const isLocked = b.lockedUntil && now < b.lockedUntil;
        const remaining = b.lockedUntil
          ? Math.max(0, Math.ceil((b.lockedUntil.getTime() - now.getTime()) / 60000))
          : 0;
        return `• ID \`${b.userId}\` — ${isLocked ? `🔴 Bloqué encore ${remaining} min` : `⚠️ ${b.count} tentative(s)`}`;
      });
      await ctx.reply(
        `🚫 *Utilisateurs bloqués (${blocked.length})*\n\n${lines.join("\n")}\n\n` +
        `Pour débloquer :\n\`/restreint ID_UTILISATEUR\`\nPour tout débloquer : \`/restreint tous\``,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (arg === "tous") {
      const count = resetAllAttempts();
      await ctx.reply(
        `✅ *Tous les compteurs réinitialisés*\n\n🔓 ${count} utilisateur(s) débloqué(s)\nChacun dispose à nouveau de *${MAX_FAILED} tentatives*.`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    const existed = failedAttempts.has(arg);
    resetAttempts(arg);
    if (existed) {
      await ctx.reply(
        `✅ *Utilisateur débloqué*\n\n🆔 ID : \`${arg}\`\n🔓 Compteur remis à zéro\n⚡ Dispose à nouveau de *${MAX_FAILED} tentatives*.`,
        { parse_mode: "Markdown" }
      );
    } else {
      await ctx.reply(`ℹ️ Aucun blocage trouvé pour l'ID \`${arg}\`.`, { parse_mode: "Markdown" });
    }
  });

  // ─── /status (groupe admin uniquement) ───────────────────────────────────
  bot.command("status", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup || !await isAdminGroup(chatId)) return;
    try {
      const webhookInfo = await bot!.telegram.getWebhookInfo();
      const merchants = await storage.getMerchants();
      const linkedCount = merchants.filter(m => m.telegramChatId).length;
      const groups = await getKnownGroups();
      const webhookOk = webhookInfo.url && webhookInfo.url.length > 0;
      const lastError = webhookInfo.last_error_message ? `\n⚠️ Dernière erreur : ${webhookInfo.last_error_message}` : "";
      await ctx.reply(
        `🤖 *Statut du Bot WestPay*\n\n` +
        `🔗 *Webhook :* ${webhookOk ? "✅ Actif" : "❌ Non configuré"}\n` +
        `${webhookOk ? `🌐 URL : \`${webhookInfo.url!.slice(-20)}\`` : ""}${lastError}\n` +
        `📊 *Mises à jour en attente :* ${webhookInfo.pending_update_count || 0}\n\n` +
        `👥 *Groupes connectés :* ${groups.length}\n` +
        `🏪 *Marchands Telegram :* ${linkedCount}/${merchants.length}`,
        { parse_mode: "Markdown" }
      );
    } catch (err: any) {
      await ctx.reply(`❌ Erreur vérification statut : ${err.message}`);
    }
  });

  // ─── /connexionid (groupe admin uniquement) ───────────────────────────────
  bot.command("connexionid", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";

    if (isGroup) {
      if (!await isAdminGroup(chatId)) return;
    }

    try {
      const platformUrl = await storage.getSetting("platform_url") || "https://westpay.cfd";
      const adminEmail = await storage.getSetting("admin_email_hint") || "(email non configuré — définir le paramètre admin_email_hint en base)";

      await ctx.reply(
        `🔐 *Identifiants de connexion WestPay*\n\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `👑 *Espace Administrateur*\n` +
        `🌐 URL : ${platformUrl}/\n` +
        `📧 Email : \`${adminEmail}\`\n` +
        `🔑 Mot de passe : voir votre gestionnaire de mots de passe\n\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `🏪 *Espace Marchand*\n` +
        `🌐 URL : ${platformUrl}/merchant/login\n` +
        `🔑 Email + mot de passe fournis par l'admin\n\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `⚙️ _Pour modifier l'URL de la plateforme :_\n` +
        `\`/seturl https://votre-domaine.com\``,
        { parse_mode: "Markdown" }
      );
    } catch { await ctx.reply("❌ Erreur."); }
  });

  // ─── /seturl (groupe admin uniquement) ────────────────────────────────────
  bot.command("seturl", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup || !await isAdminGroup(chatId)) return;

    const text = ctx.message.text || "";
    const url = text.split(" ")[1]?.trim();
    if (!url || !url.startsWith("http")) {
      await ctx.reply("❌ Usage : `/seturl https://votre-domaine.com`", { parse_mode: "Markdown" });
      return;
    }
    await storage.setSetting("platform_url", url);
    await ctx.reply(`✅ URL de la plateforme mise à jour :\n${url}`, { parse_mode: "Markdown" });
  });

  // ─── /aide ─────────────────────────────────────────────────────────────────
  bot.command("aide", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";

    if (isGroup) {
      if (await isAdminGroup(chatId)) {
        await ctx.reply(
          `📖 *Commandes Admin — WestPay Bot*\n\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `⚙️ *Configuration*\n` +
          `/setgroup CLE\\_API — Enregistrer ce groupe admin\n\n` +
          `👥 *Marchands*\n` +
          `/marchands — Liste de tous les marchands\n` +
          `/setmarchand CODE — Lier un groupe à un marchand\n\n` +
          `/desactiverpaiement — Désactiver payin et payout d'un marchand\n\n` +
          `📊 *Statistiques & Soldes*\n` +
          `/stats — Statistiques globales\n` +
          `/solde — Soldes détaillés de tous les marchands\n\n` +
          `/commander@Westpaybot — Rechercher un retrait par numéro\n` +
          `/soldegateway@Westpaybot — Consulter le solde d'un gateway et ses wallets pays\n\n` +
          `📢 *Diffusion*\n` +
          `/broadcast — Envoyer un message dans les groupes\n` +
          `/groupes — Lister tous les groupes où le bot est présent\n` +
          `/scangroupes — Synchroniser et enregistrer tous les groupes\n\n` +
          `🔐 *Utilitaires*\n` +
          `/status — Vérifier l'état du bot et du webhook\n` +
          `/connexionid — Rappel des URLs et identifiants admin\n` +
          `/seturl URL — Définir l'URL de la plateforme\n` +
          `/restreint — Voir les utilisateurs bloqués\n` +
          `/restreint ID — Débloquer un utilisateur spécifique\n` +
          `/restreint tous — Débloquer tout le monde\n\n` +
          `🛡️ *Gestion des IPs*\n` +
          `/listeips — Voir toutes les IPs autorisées et bloquées\n` +
          `/autoriserip IP [note] — Autoriser une adresse IP\n` +
          `/bloquerip IP [raison] — Bloquer une adresse IP\n` +
          `/debloquerip IP — Retirer une IP de toutes les listes\n\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `💡 *Configurer un groupe marchand :*\n` +
          `1️⃣ Générer un code dans le dashboard WestPay\n` +
          `2️⃣ Ajouter le bot au groupe du marchand\n` +
          `3️⃣ Envoyer \`/setmarchand CODE\` dans ce groupe`,
          { parse_mode: "Markdown" }
        );
        return;
      }
      const merchant = await getMerchantForGroup(chatId);
      if (merchant) {
        await ctx.reply(MERCHANT_AIDE_MSG(merchant.name), { parse_mode: "Markdown" });
      }
      return;
    }

    const merchant = await storage.getMerchantByTelegramChatId(chatId);
    if (merchant) {
      await ctx.reply(MERCHANT_AIDE_MSG(merchant.name), { parse_mode: "Markdown" });
    }
  });

  // ─── /groupes (groupe admin uniquement) — liste et nettoyage des groupes connus ──
  bot.command("groupes", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup || !await isAdminGroup(chatId)) return;

    try {
      const groups = await getKnownGroups();
      const merchants = await storage.getMerchants();
      const merchantMap = new Map(merchants.filter(m => m.telegramChatId).map(m => [m.telegramChatId as string, m.name]));

      if (groups.length === 0) {
        await ctx.reply(
          "📭 *Aucun groupe enregistré*\n\n" +
          "Les groupes sont automatiquement enregistrés :\n" +
          "• Quand le bot est ajouté à un groupe\n" +
          "• Quand un message est reçu d'un groupe inconnu\n\n" +
          "💡 Pour forcer l'enregistrement d'un groupe, envoyez n'importe quel message depuis ce groupe.",
          { parse_mode: "Markdown" }
        );
        return;
      }

      const adminGroupId = await getAdminGroupId();
      const lines = groups.map((gid, i) => {
        const name = merchantMap.get(gid) ? `🏪 ${merchantMap.get(gid)}` : gid === adminGroupId ? "👑 Groupe Admin" : "👥 Non lié";
        return `${i + 1}. \`${gid}\` — ${name}`;
      });

      const chunkSize = 30;
      for (let i = 0; i < lines.length; i += chunkSize) {
        const chunk = lines.slice(i, i + chunkSize);
        const header = i === 0
          ? `👥 *Groupes connus (${groups.length})*\n\n`
          : `👥 *Suite (${i + 1}–${Math.min(i + chunkSize, lines.length)})*\n\n`;
        await ctx.reply(header + chunk.join("\n"), { parse_mode: "Markdown" });
      }

      const linkedCount = groups.filter(gid => merchantMap.has(gid)).length;
      const unlinkedCount = groups.length - linkedCount - (groups.includes(adminGroupId || "") ? 1 : 0);
      await ctx.reply(
        `📊 *Résumé*\n\n` +
        `📦 Total : *${groups.length}* groupe(s)\n` +
        `🏪 Liés à un marchand : *${linkedCount}*\n` +
        `👥 Non liés (diffusion possible) : *${unlinkedCount}*\n\n` +
        `💡 Le broadcast _"Tous les groupes"_ envoie dans les ${groups.length} groupe(s) listés ci-dessus.`,
        { parse_mode: "Markdown" }
      );
    } catch (err: any) {
      await ctx.reply(`❌ Erreur : ${err.message}`);
    }
  });

  // ─── /scangroupes (groupe admin uniquement) — force-sync tous les groupes ───
  bot.command("scangroupes", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup || !await isAdminGroup(chatId)) return;

    try {
      await ctx.reply("🔄 Synchronisation en cours...");
      const result = await syncAllKnownGroups();
      await ctx.reply(
        `✅ *Synchronisation terminée*\n\n` +
        `📦 Total groupes connus : *${result.total}*\n` +
        `✨ Nouvellement ajoutés : *${result.added}*\n\n` +
        `💡 Utilisez /groupes pour voir la liste complète.\n` +
        `📢 Le prochain broadcast _"Tous les groupes"_ couvrira ces ${result.total} groupe(s).`,
        { parse_mode: "Markdown" }
      );
    } catch (err: any) {
      await ctx.reply(`❌ Erreur : ${err.message}`);
    }
  });

  // ─── Bot ajouté à un groupe (API moderne : my_chat_member) ──────────────────
  bot.on("my_chat_member", async (ctx) => {
    const update = ctx.update.my_chat_member;
    if (!update) return;
    const newStatus = update.new_chat_member?.status;

    const chat = update.chat;
    if (chat.type !== "group" && chat.type !== "supergroup") return;

    const chatId = String(chat.id);
    const groupTitle = (chat as any).title || "ce groupe";

    // ── Bot expulsé ou ayant quitté → retirer de la liste ────────────────────
    if (newStatus === "kicked" || newStatus === "left") {
      await removeKnownGroup(chatId);
      await alertAdminGroup(`ℹ️ *Bot retiré du groupe*\n\n👥 Groupe : *${groupTitle}*\n🆔 Chat ID : \`${chatId}\``).catch(() => {});
      return;
    }

    // ── Bot ajouté ou promu admin → enregistrer ───────────────────────────────
    if (newStatus !== "member" && newStatus !== "administrator") return;

    await registerKnownGroup(chatId);

    if (await isAdminGroup(chatId)) {
      await bot!.telegram.sendMessage(chatId,
        "✅ *Bot WestPay actif dans le groupe admin.*\n\nTapez /aide pour voir toutes les commandes.",
        { parse_mode: "Markdown" }
      ).catch(() => {});
      return;
    }

    const linkedMerchant = await getMerchantForGroup(chatId);
    if (linkedMerchant) {
      await bot!.telegram.sendMessage(chatId,
        `✅ *Bot WestPay actif — ${linkedMerchant.name}*\n\n` + MERCHANT_AIDE_MSG(linkedMerchant.name),
        { parse_mode: "Markdown" }
      ).catch(() => {});
      return;
    }

    await bot!.telegram.sendMessage(chatId,
      `👋 *Bot WestPay ajouté à ${groupTitle}.*\n\n` +
      `Pour lier ce groupe à un compte marchand :\n\n` +
      `\`/setmarchand CODE\`\n\n` +
      `_(Le code d'activation est généré depuis le dashboard WestPay)_`,
      { parse_mode: "Markdown" }
    ).catch(() => {});
    await alertAdminGroup(`ℹ️ *Bot ajouté à un nouveau groupe*\n\n👥 Groupe : *${groupTitle}*\n🆔 Chat ID : \`${chatId}\``);
  });

  // ─── Bot ajouté à un groupe (API classique : new_chat_members) ───────────
  bot.on("new_chat_members", async (ctx) => {
    const newMembers = ctx.message.new_chat_members;
    const botInfo = await ctx.telegram.getMe();
    const botWasAdded = newMembers.some((m: any) => m.id === botInfo.id);
    if (!botWasAdded) return;

    const chatId = String(ctx.chat.id);
    const groupTitle = (ctx.chat as any).title || "ce groupe";

    await registerKnownGroup(chatId);

    if (await isAdminGroup(chatId)) {
      await ctx.reply("✅ *Bot WestPay actif dans le groupe admin.*\n\nTapez /aide pour voir toutes les commandes.", { parse_mode: "Markdown" });
      return;
    }

    const linkedMerchant = await getMerchantForGroup(chatId);
    if (linkedMerchant) {
      await ctx.reply(
        `✅ *Bot WestPay actif — ${linkedMerchant.name}*\n\n` + MERCHANT_AIDE_MSG(linkedMerchant.name),
        { parse_mode: "Markdown" }
      );
      return;
    }

    await ctx.reply(
      `👋 *Bot WestPay ajouté à ${groupTitle}.*\n\n` +
      `Pour lier ce groupe à un compte marchand :\n\n` +
      `\`/setmarchand CODE\`\n\n` +
      `_(Le code d'activation est généré depuis le dashboard WestPay)_`,
      { parse_mode: "Markdown" }
    );
    await alertAdminGroup(`ℹ️ *Bot ajouté à un nouveau groupe*\n\n👥 Groupe : *${groupTitle}*\n🆔 Chat ID : \`${chatId}\`\n👤 Par : ${formatUser(ctx)}`);
  });

  // ─── Inline callbacks sécurité ───────────────────────────────────────────────
  bot.action(/^sec:block:(.+)$/, async (ctx) => {
    const ip = ctx.match![1];
    const admin = formatUser(ctx);
    try {
      const geo = await getGeoInfo(ip).catch(() => null);
      await storage.addBlockedIp({
        ipAddress: ip,
        country: geo?.country || null,
        city: geo?.city || null,
        reason: "Bloqué via Telegram",
        blockedBy: admin,
      });
      await storage.createSecurityLog({
        eventType: "ip_blocked",
        ip,
        action: "blocked_via_telegram",
        details: `Bloqué par ${admin}`,
        telegramAdmin: admin,
      });
      await ctx.answerCbQuery(`⛔ IP ${ip} bloquée`);
      await ctx.editMessageReplyMarkup({ inline_keyboard: [[{ text: `⛔ Bloqué par ${admin}`, callback_data: "sec:noop" }]] }).catch(() => {});
    } catch (err: any) {
      await ctx.answerCbQuery(`❌ Erreur: ${err.message.substring(0, 50)}`);
    }
  });

  bot.action(/^sec:allow:(.+)$/, async (ctx) => {
    const ip = ctx.match![1];
    const admin = formatUser(ctx);
    try {
      await storage.addAllowedIp({
        ipAddress: ip,
        userEmail: null,
        role: null,
        country: null,
        city: null,
        note: "Autorisé via Telegram",
        createdBy: admin,
      });
      await storage.createSecurityLog({
        eventType: "ip_allowed",
        ip,
        action: "allowed_via_telegram",
        details: `Autorisé par ${admin}`,
        telegramAdmin: admin,
      });
      await ctx.answerCbQuery(`✅ IP ${ip} autorisée`);
      await ctx.editMessageReplyMarkup({ inline_keyboard: [[{ text: `✅ Autorisé par ${admin}`, callback_data: "sec:noop" }]] }).catch(() => {});
    } catch (err: any) {
      await ctx.answerCbQuery(`❌ Erreur: ${err.message.substring(0, 50)}`);
    }
  });

  bot.action(/^sec:unblock:(.+)$/, async (ctx) => {
    const ip = ctx.match![1];
    const admin = formatUser(ctx);
    try {
      const blocked = await storage.getBlockedIps();
      const entry = blocked.find(b => b.ipAddress === ip);
      if (entry) {
        await storage.removeBlockedIp(entry.id);
        await storage.createSecurityLog({
          eventType: "ip_unblocked",
          ip,
          action: "unblocked_via_telegram",
          details: `Débloqué par ${admin}`,
          telegramAdmin: admin,
        });
        await ctx.answerCbQuery(`✅ IP ${ip} débloquée`);
        await ctx.editMessageReplyMarkup({ inline_keyboard: [[{ text: `✅ Débloqué par ${admin}`, callback_data: "sec:noop" }]] }).catch(() => {});
      } else {
        await ctx.answerCbQuery("IP non trouvée dans la liste de blocage");
      }
    } catch (err: any) {
      await ctx.answerCbQuery(`❌ Erreur: ${err.message.substring(0, 50)}`);
    }
  });

  bot.action(/^sec:info:(.+)$/, async (ctx) => {
    const ip = ctx.match![1];
    try {
      const geo = await getGeoInfo(ip);
      const proxyLabel = geo.isProxy ? "⚠️ Oui (VPN/Proxy/TOR)" : "✅ Non";
      const msg = `🔍 *Info IP : \`${ip}\`*\n\n📍 ${geo.city}${geo.country ? ", " + geo.country : ""}\n🔌 ${geo.isp || "?"}\n🛡️ Proxy: ${proxyLabel}\n🖥️ Hébergeur: ${geo.isHosting ? "Oui" : "Non"}`;
      await ctx.answerCbQuery();
      await ctx.reply(msg, { parse_mode: "Markdown" });
    } catch {
      await ctx.answerCbQuery("Erreur récupération infos");
    }
  });

  bot.action("sec:noop", async (ctx) => {
    await ctx.answerCbQuery();
  });

  // ─── Actions boutons /commander ───────────────────────────────────────────

  // wd:noop — bouton inerte après action confirmée
  bot.action("wd:noop", async (ctx) => { await ctx.answerCbQuery(); });

  // wd:validate — ajoute une note de validation manuelle, garde le statut pending
  bot.action(/^wd:validate:(\d+)$/, async (ctx) => {
    const chatId = String(ctx.chat?.id ?? "");
    if (!await isAdminGroup(chatId)) { await ctx.answerCbQuery("⛔ Non autorisé"); return; }
    const id = Number(ctx.match![1]);
    const admin = formatUser(ctx);
    try {
      const now = new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan", hour: "2-digit", minute: "2-digit" });
      await financialPool.query(
        `UPDATE withdrawals
         SET admin_note = TRIM(COALESCE(admin_note, '') || $2)
         WHERE id = $1`,
        [id, ` [Validé via Telegram par ${admin} à ${now}]`]
      );
      await ctx.answerCbQuery("✅ Note de validation ajoutée");
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [
          [{ text: `✅ Validé à ${now} par ${admin}`, callback_data: "wd:noop" }],
          [
            { text: "✓ Approuvé", callback_data: `wd:approve:${id}` },
            { text: "🚀 Déclencher fournisseur", callback_data: `wd:trigger:${id}` },
            { text: "🔍 Vérifier fournisseur", callback_data: `wd:check:${id}` },
          ],
        ],
      }).catch(() => {});
    } catch (e: any) {
      await ctx.answerCbQuery("❌ " + String(e.message || "Erreur").slice(0, 60));
    }
  });

  // wd:approve — marque le retrait comme approuvé manuellement (sans appel fournisseur)
  bot.action(/^wd:approve:(\d+)$/, async (ctx) => {
    const chatId = String(ctx.chat?.id ?? "");
    if (!await isAdminGroup(chatId)) { await ctx.answerCbQuery("⛔ Non autorisé"); return; }
    const id = Number(ctx.match![1]);
    const admin = formatUser(ctx);
    try {
      const w = await storage.getWithdrawalById(id);
      if (!w) { await ctx.answerCbQuery("❌ Retrait introuvable"); return; }
      if (w.status === "approved") { await ctx.answerCbQuery("ℹ️ Déjà approuvé"); return; }
      const now = new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan", hour: "2-digit", minute: "2-digit" });
      await storage.updateWithdrawalStatus(id, "approved", `Approuvé manuellement via Telegram bot par ${admin} à ${now}`);
      const merchant = await storage.getMerchantById(w.merchantId);
      notifyAdminWithdrawal({ id, merchantName: merchant?.name || `#${w.merchantId}`, country: w.country, amount: w.amount, fees: w.fees || 0, phone: w.phone, operator: w.operator || null, status: "approved", mode: "manual" }).catch(() => {});
      notifyMerchantWithdrawal(w.merchantId, { id, country: w.country, amount: w.amount, fees: w.fees || 0, phone: w.phone, operator: w.operator || null, status: "approved" }).catch(() => {});
      await ctx.answerCbQuery("✓ Retrait approuvé");
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [[{ text: `✓ Approuvé à ${now} par ${admin}`, callback_data: "wd:noop" }]],
      }).catch(() => {});
    } catch (e: any) {
      await ctx.answerCbQuery("❌ " + String(e.message || "Erreur").slice(0, 60));
    }
  });

  // wd:trigger — déclenche le paiement chez le fournisseur configuré sur le retrait
  bot.action(/^wd:trigger:(\d+)$/, async (ctx) => {
    const chatId = String(ctx.chat?.id ?? "");
    if (!await isAdminGroup(chatId)) { await ctx.answerCbQuery("⛔ Non autorisé"); return; }
    const id = Number(ctx.match![1]);
    const admin = formatUser(ctx);
    await ctx.answerCbQuery("⏳ Déclenchement en cours...");
    try {
      const w = await storage.getWithdrawalById(id);
      if (!w) { await ctx.reply(`❌ Retrait #${id} introuvable`); return; }
      if (w.omnipayRef && w.status === "pending") {
        await ctx.reply(
          `⚠️ *Retrait #${id}* — déjà en cours chez *${w.gateway}*\n` +
          `Réf : \`${w.omnipayRef}\`\n\nAttendez la confirmation ou utilisez 🔍 Vérifier.`,
          { parse_mode: "Markdown" }
        );
        return;
      }
      const gateway = (w.gateway || "omnipay").toLowerCase();
      const appUrl = process.env.APP_URL || "";
      let resultMsg = "";

      if (gateway === "mbiyo") {
        const apiKey = process.env.MBIYO_API_KEY || await storage.getSetting("mbiyo_api_key");
        if (!apiKey) { await ctx.reply("❌ Clé API Mbiyo non configurée"); return; }
        const reference = mbiyoGenerateRef();
        const msisdn = botPrependDialCode(w.phone, w.country);
        const result = await mbiyoInitiatePayout({
          apiKey,
          amount: w.amount - (w.fees || 0),
          currency: mbiyoCurrency(w.country),
          orderId: reference,
          callbackUrl: `${appUrl}/api/mbiyo/payout-callback`,
          network: mbiyoNetwork(w.operator || ""),
          phoneNumber: msisdn,
          countryCode: mbiyoCountryCode(w.country),
          beneficiary: `Retrait #${w.id}`,
        });
        if ((result.status === "success" || result.status === "pending") && result.data) {
          await storage.updateWithdrawalStatus(id, "pending", `Déclenché via Telegram bot par ${admin}`, reference, w.fees || 0, w.fees || 0);
          resultMsg = `✅ Déclenché chez *Mbiyo*\nRéf : \`${reference}\`\nStatut : ${result.status}`;
        } else {
          resultMsg = `❌ Mbiyo : ${result.message || "Échec"}`;
        }
      } else if (gateway === "sendavapay") {
        const apiKey = process.env.SENDAVA_API_KEY || process.env.SENDAVAPAY_API_KEY || await storage.getSetting("sendavapay_api_key");
        if (!apiKey) { await ctx.reply("❌ Clé API SendavaPay non configurée"); return; }
        const reference = `SD-WD-${w.id}-${Date.now()}`;
        const countryCode = SENDAVAPAY_COUNTRY_CODES[w.country] || "";
        const currency = SENDAVAPAY_CURRENCY_MAP[countryCode] || "XOF";
        const msisdn = botPrependDialCode(w.phone, w.country);
        const mappedOperator = toSendavaOperator(w.operator || "", countryCode);
        const result = await sendavaInitiateWithdraw(apiKey, {
          amount: w.amount - (w.fees || 0),
          phoneNumber: msisdn,
          operator: mappedOperator,
          country: countryCode,
          currency,
          description: `Retrait WestPay #${w.id}`,
          externalReference: reference,
        });
        if (result.success) {
          const ref = result.data?.reference || reference;
          await storage.updateWithdrawalStatus(id, "pending", `Déclenché via Telegram bot par ${admin}`, ref, w.fees || 0, w.fees || 0);
          resultMsg = `✅ Déclenché chez *SendavaPay*\nRéf : \`${ref}\``;
        } else {
          resultMsg = `❌ SendavaPay : ${result.message || result.error || "Échec"}`;
        }
      } else {
        // OmniPay (default)
        const apiKey = process.env.OMNIPAY_PAYOUT_API_KEY || process.env.OMNIPAY_API_KEY
          || await storage.getSetting("omnipay_payout_api_key") || await storage.getSetting("omnipay_api_key");
        if (!apiKey) { await ctx.reply("❌ Clé API OmniPay non configurée"); return; }
        const reference = `WD-${w.id}-${Date.now()}`;
        const msisdn = botPrependDialCode(w.phone, w.country);
        const nameParts = (w.recipientName || `Retrait WP${w.id}`).split(" ");
        const result = await omnipayInitiateTransfer({
          apikey: apiKey,
          msisdn,
          amount: w.amount - (w.fees || 0),
          reference,
          first_name: nameParts[0] || "Retrait",
          last_name: nameParts.slice(1).join(" ") || `WP${w.id}`,
          operator: w.operator || undefined,
        });
        if (result.success === 1) {
          const omnipayRef = (result as any).reference || reference;
          await storage.updateWithdrawalStatus(id, "pending", `Déclenché via Telegram bot par ${admin}`, omnipayRef, w.fees || 0, w.fees || 0);
          resultMsg = `✅ Déclenché chez *OmniPay*\nRéf : \`${omnipayRef}\``;
        } else {
          resultMsg = `❌ OmniPay (code ${(result as any).code || "?"}) : ${result.message || "Échec"}`;
        }
      }

      const triggerSuccess = resultMsg.startsWith("✅");
      await ctx.reply(`🚀 *Retrait #${id} — Déclenchement*\n\n${resultMsg}`, { parse_mode: "Markdown" });
      if (triggerSuccess) {
        await ctx.editMessageReplyMarkup({
          inline_keyboard: [
            [{ text: `🚀 Déclenché par ${admin}`, callback_data: "wd:noop" }],
            [{ text: "🔍 Vérifier fournisseur", callback_data: `wd:check:${id}` }],
          ],
        }).catch(() => {});
      } else {
        // Garder les boutons d'action actifs pour permettre un retry
        await ctx.editMessageReplyMarkup({
          inline_keyboard: [
            [
              { text: "✅ Valider", callback_data: `wd:validate:${id}` },
              { text: "✓ Approuvé", callback_data: `wd:approve:${id}` },
            ],
            [
              { text: "🚀 Réessayer fournisseur", callback_data: `wd:trigger:${id}` },
              { text: "🔍 Vérifier fournisseur", callback_data: `wd:check:${id}` },
            ],
          ],
        }).catch(() => {});
      }
    } catch (e: any) {
      await ctx.reply(`❌ Retrait #${id} — Erreur déclenchement : ${e.message}`);
    }
  });

  // wd:check — vérifie le statut du retrait auprès du fournisseur (structure réelle)
  bot.action(/^wd:check:(\d+)$/, async (ctx) => {
    const chatId = String(ctx.chat?.id ?? "");
    if (!await isAdminGroup(chatId)) { await ctx.answerCbQuery("⛔ Non autorisé"); return; }
    const id = Number(ctx.match![1]);
    await ctx.answerCbQuery("⏳ Vérification en cours...");
    try {
      const w = await storage.getWithdrawalById(id);
      if (!w) { await ctx.reply(`❌ Retrait #${id} introuvable`); return; }
      if (!w.omnipayRef) {
        await ctx.reply(
          `⚠️ *Retrait #${id}* — Aucune référence fournisseur.\n` +
          `Le retrait n'a pas encore été déclenché chez le fournisseur.\n` +
          `Utilisez 🚀 Déclencher fournisseur d'abord.`,
          { parse_mode: "Markdown" }
        );
        return;
      }
      const gateway = (w.gateway || "omnipay").toLowerCase();
      let statusMsg = "";

      if (gateway === "mbiyo") {
        const apiKey = process.env.MBIYO_API_KEY || await storage.getSetting("mbiyo_api_key");
        if (!apiKey) { await ctx.reply("❌ Clé API Mbiyo non configurée"); return; }
        const result = await mbiyoGetStatus(apiKey, w.omnipayRef);
        const ps = String(result.data?.status || result.status || "inconnu");
        statusMsg = `Fournisseur : *Mbiyo*\nStatut fournisseur : *${ps}*\nRéf : \`${w.omnipayRef}\``;
        if (result.data) statusMsg += `\n\`\`\`\n${JSON.stringify(result.data, null, 2).slice(0, 400)}\n\`\`\``;
      } else if (gateway === "sendavapay") {
        const apiKey = process.env.SENDAVA_API_KEY || process.env.SENDAVAPAY_API_KEY || await storage.getSetting("sendavapay_api_key");
        if (!apiKey) { await ctx.reply("❌ Clé API SendavaPay non configurée"); return; }
        const result = await sendavaGetWithdrawalStatus(apiKey, w.omnipayRef);
        const ps = String(result.data?.status || (result.success ? "trouvé" : "inconnu"));
        statusMsg = `Fournisseur : *SendavaPay*\nStatut fournisseur : *${ps}*\nRéf : \`${w.omnipayRef}\``;
        if (result.data) statusMsg += `\n\`\`\`\n${JSON.stringify(result.data, null, 2).slice(0, 400)}\n\`\`\``;
        else if (result.message) statusMsg += `\nDétail : ${result.message}`;
      } else {
        const apiKey = process.env.OMNIPAY_PAYOUT_API_KEY || process.env.OMNIPAY_API_KEY
          || await storage.getSetting("omnipay_payout_api_key") || await storage.getSetting("omnipay_api_key");
        if (!apiKey) { await ctx.reply("❌ Clé API OmniPay non configurée"); return; }
        const result = await omnipayGetStatus(apiKey, w.omnipayRef);
        const ps = String((result as any).data?.status || (result as any).status || "inconnu");
        statusMsg = `Fournisseur : *OmniPay*\nStatut fournisseur : *${ps}*\nRéf : \`${w.omnipayRef}\``;
        const d = (result as any).data;
        if (d) statusMsg += `\n\`\`\`\n${JSON.stringify(d, null, 2).slice(0, 400)}\n\`\`\``;
      }

      await ctx.reply(
        `🔍 *Retrait #${id} — Structure fournisseur*\n\n${statusMsg}`,
        { parse_mode: "Markdown" }
      );
    } catch (e: any) {
      await ctx.reply(`❌ Retrait #${id} — Erreur vérification : ${e.message}`);
    }
  });

  // ─── Inline callbacks appareils ──────────────────────────────────────────────
  bot.action(/^dev:trust:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match![1]);
    const admin = formatUser(ctx);
    try {
      await storage.trustDevice(id);
      await storage.createSecurityLog({ eventType: "device_trusted", action: "trusted_via_telegram", details: `ID ${id}`, telegramAdmin: admin }).catch(() => {});
      await ctx.answerCbQuery("✅ Appareil autorisé");
      await ctx.editMessageReplyMarkup({ inline_keyboard: [[{ text: `✅ Autorisé par ${admin}`, callback_data: "sec:noop" }]] }).catch(() => {});
    } catch (err: any) {
      await ctx.answerCbQuery(`❌ Erreur: ${err.message.substring(0, 50)}`);
    }
  });

  bot.action(/^dev:block:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match![1]);
    const admin = formatUser(ctx);
    try {
      await storage.blockDeviceById(id);
      await storage.createSecurityLog({ eventType: "device_blocked", action: "blocked_via_telegram", details: `ID ${id}`, telegramAdmin: admin }).catch(() => {});
      await ctx.answerCbQuery("🚫 Appareil bloqué");
      await ctx.editMessageReplyMarkup({ inline_keyboard: [[{ text: `🚫 Bloqué par ${admin}`, callback_data: "sec:noop" }]] }).catch(() => {});
    } catch (err: any) {
      await ctx.answerCbQuery(`❌ Erreur: ${err.message.substring(0, 50)}`);
    }
  });

  // ─── Gestion des IPs depuis le groupe admin ─────────────────────────────────

  bot.command("autoriserip", async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!(await isAdminGroup(chatId))) return;
    const args = (ctx.message.text || "").split(/\s+/).slice(1);
    const ip = args[0]?.trim();
    const note = args.slice(1).join(" ") || "Ajouté via Telegram";
    if (!ip) {
      await ctx.reply("❌ Usage : `/autoriserip <ip> [note]`\nEx: `/autoriserip 1.2.3.4 Bureau Paris`", { parse_mode: "Markdown" });
      return;
    }
    try {
      const geo = await getGeoInfo(ip).catch(() => ({ country: "", city: "" }));
      await pool.query(
        `INSERT INTO allowed_ips (ip_address, user_email, role, country, city, note, created_by)
         VALUES ($1, $2, 'admin', $3, $4, $5, $6)
         ON CONFLICT (ip_address) DO UPDATE SET note = $5, created_by = $6`,
        [ip, "", geo.country || "", geo.city || "", note, ctx.from?.username || "telegram"]
      );
      const loc = [geo.city, geo.country].filter(Boolean).join(", ");
      await ctx.reply(
        `✅ *IP autorisée avec succès*\n\n` +
        `🌐 IP : \`${ip}\`\n` +
        `📍 Localisation : ${loc || "Inconnue"}\n` +
        `📝 Note : ${note}\n` +
        `👤 Ajoutée par : @${ctx.from?.username || "admin"}`,
        { parse_mode: "Markdown" }
      );
    } catch (err: any) {
      await ctx.reply(`❌ Erreur : ${err.message}`);
    }
  });

  bot.command("bloquerip", async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!(await isAdminGroup(chatId))) return;
    const args = (ctx.message.text || "").split(/\s+/).slice(1);
    const ip = args[0]?.trim();
    const reason = args.slice(1).join(" ") || "Bloqué via Telegram";
    if (!ip) {
      await ctx.reply("❌ Usage : `/bloquerip <ip> [raison]`\nEx: `/bloquerip 1.2.3.4 Comportement suspect`", { parse_mode: "Markdown" });
      return;
    }
    try {
      const geo = await getGeoInfo(ip).catch(() => ({ country: "", city: "" }));
      await pool.query(
        `INSERT INTO blocked_ips (ip_address, country, city, reason, blocked_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (ip_address) DO UPDATE SET reason = $4, blocked_by = $5`,
        [ip, geo.country || "", geo.city || "", reason, ctx.from?.username || "telegram"]
      );
      // Also remove from allowed_ips if present
      await pool.query(`DELETE FROM allowed_ips WHERE ip_address = $1`, [ip]).catch(() => {});
      const loc = [geo.city, geo.country].filter(Boolean).join(", ");
      await ctx.reply(
        `⛔ *IP bloquée avec succès*\n\n` +
        `🌐 IP : \`${ip}\`\n` +
        `📍 Localisation : ${loc || "Inconnue"}\n` +
        `⚠️ Raison : ${reason}\n` +
        `👤 Bloquée par : @${ctx.from?.username || "admin"}`,
        { parse_mode: "Markdown" }
      );
    } catch (err: any) {
      await ctx.reply(`❌ Erreur : ${err.message}`);
    }
  });

  bot.command("debloquerip", async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!(await isAdminGroup(chatId))) return;
    const args = (ctx.message.text || "").split(/\s+/).slice(1);
    const ip = args[0]?.trim();
    if (!ip) {
      await ctx.reply("❌ Usage : `/debloquerip <ip>`\nEx: `/debloquerip 1.2.3.4`", { parse_mode: "Markdown" });
      return;
    }
    try {
      const r1 = await pool.query(`DELETE FROM blocked_ips WHERE ip_address = $1`, [ip]);
      const r2 = await pool.query(`DELETE FROM allowed_ips WHERE ip_address = $1`, [ip]);
      const removed = (r1.rowCount || 0) + (r2.rowCount || 0);
      if (removed === 0) {
        await ctx.reply(`ℹ️ L'IP \`${ip}\` n'était dans aucune liste.`, { parse_mode: "Markdown" });
      } else {
        await ctx.reply(
          `✅ *IP débloquée / retirée*\n\n` +
          `🌐 IP : \`${ip}\`\n` +
          `👤 Déblocage par : @${ctx.from?.username || "admin"}\n\n` +
          `_L'adresse peut de nouveau accéder librement à la plateforme._`,
          { parse_mode: "Markdown" }
        );
      }
    } catch (err: any) {
      await ctx.reply(`❌ Erreur : ${err.message}`);
    }
  });

  bot.command("listeips", async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!(await isAdminGroup(chatId))) return;
    try {
      const allowed = await pool.query(`SELECT ip_address, note, created_by FROM allowed_ips ORDER BY created_at DESC LIMIT 15`);
      const blocked = await pool.query(`SELECT ip_address, reason, blocked_by FROM blocked_ips ORDER BY created_at DESC LIMIT 15`);

      let msg = `🔐 *Gestion des IPs WestPay*\n\n`;

      if (allowed.rows.length === 0) {
        msg += `✅ *IPs autorisées :* _Mode ouvert — aucune restriction_\n`;
      } else {
        msg += `✅ *IPs autorisées (${allowed.rows.length}) :*\n`;
        for (const row of allowed.rows) {
          msg += `  • \`${row.ip_address}\`${row.note ? ` — ${row.note}` : ""}\n`;
        }
      }

      msg += `\n`;

      if (blocked.rows.length === 0) {
        msg += `⛔ *IPs bloquées :* _Aucune_\n`;
      } else {
        msg += `⛔ *IPs bloquées (${blocked.rows.length}) :*\n`;
        for (const row of blocked.rows) {
          msg += `  • \`${row.ip_address}\`${row.reason ? ` — ${row.reason}` : ""}\n`;
        }
      }

      msg += `\n━━━━━━━━━━━━━━━━\n`;
      msg += `📌 Commandes :\n`;
      msg += `/autoriserip <ip> [note]\n`;
      msg += `/bloquerip <ip> [raison]\n`;
      msg += `/debloquerip <ip>`;

      await ctx.reply(msg, { parse_mode: "Markdown" });
    } catch (err: any) {
      await ctx.reply(`❌ Erreur : ${err.message}`);
    }
  });

  // ─── Détection IP dans les groupes marchands ────────────────────────────────
  // Quand un marchand envoie une adresse IP dans son groupe, le bot la whitelist
  // automatiquement si elle vient d'Afrique, sinon refuse.

  // Noms exacts retournés par ip-api.com (champ "country")
  // IMPORTANT : ne pas se fier aux noms ISO — ip-api.com a ses propres libellés.
  const AFRICAN_COUNTRIES = new Set([
    // Afrique de l'Ouest
    "Togo", "Benin", "Ivory Coast", "Côte d'Ivoire", "Senegal", "Mali",
    "Burkina Faso", "Ghana", "Nigeria", "Guinea", "Niger", "Mauritania",
    "Sierra Leone", "Liberia", "Cape Verde", "Gambia", "Guinea-Bissau",
    // Afrique Centrale
    // ip-api.com retourne "Congo, The Democratic Republic of the" pour la RDC
    "Democratic Republic of the Congo",
    "Congo, The Democratic Republic of the",
    "Republic of the Congo", "Congo",
    "Cameroon", "Gabon", "Chad", "Central African Republic", "Equatorial Guinea",
    "Sao Tome and Principe", "São Tomé and Príncipe", "Angola", "Rwanda", "Burundi",
    // Afrique de l'Est
    "Kenya", "Tanzania", "Uganda", "Ethiopia", "Somalia", "Eritrea",
    "Djibouti", "South Sudan", "Sudan", "Mozambique", "Madagascar",
    "Comoros", "Seychelles", "Mauritius", "Zambia", "Zimbabwe",
    "Malawi", "Botswana", "Namibia", "Lesotho", "Eswatini", "South Africa",
    // Afrique du Nord
    "Morocco", "Algeria", "Tunisia", "Libya", "Egypt",
  ]);

  // Détecte une IPv4 n'importe où dans le message (ex: "IP: 41.207.187.10 merci")
  const IP_EXTRACT_REGEX = /\b((?:\d{1,3}\.){3}\d{1,3})\b/;
  const isValidIpv4 = (ip: string) => ip.split(".").every((o) => +o >= 0 && +o <= 255);
  const IPV6_REGEX = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9]))$/;
  const isValidIpv6 = (ip: string) => IPV6_REGEX.test(ip);
  const isValidIp = (ip: string) => (IP_EXTRACT_REGEX.test(ip) && isValidIpv4(ip)) || isValidIpv6(ip);

  // ─── Fonction utilitaire partagée : whitelist une IP depuis un groupe marchand ─
  async function whitelistMerchantIp(ctx: any, candidate: string, merchant: any) {
    const geo = await getGeoInfo(candidate);
    console.log(`[TG/addip] geo pour ${candidate}: country="${geo.country}" city="${geo.city}"`);

    if (!geo.country || !AFRICAN_COUNTRIES.has(geo.country)) {
      await ctx.reply("Fake ip 您无法访问该平台。请联系客服。");
      await alertAdminGroup(
        `⚠️ *IP non africaine refusée*\n\n` +
        `👤 Marchand : *${merchant.name}*\n` +
        `🌐 IP : \`${candidate}\`\n` +
        `📍 ${geo.city || "?"}${geo.country ? ", " + geo.country : " — pays inconnu"}\n` +
        `🔌 ${geo.isp || "?"}`
      );
      return;
    }

    try {
      await storage.addAllowedIp({
        ipAddress: candidate,
        userEmail: merchant.email,
        role: "merchant",
        country: geo.country,
        city: geo.city || null,
        note: `Ajouté via Telegram — ${merchant.name}`,
        createdBy: `Telegram/${merchant.name}`,
      });
      await storage.createSecurityLog({
        eventType: "ip_allowed",
        ip: candidate,
        action: "allowed_via_merchant_telegram",
        details: `IP ajoutée par le marchand ${merchant.name} via Telegram — ${geo.city}, ${geo.country}`,
      }).catch(() => {});
      await ctx.reply("done ✅");
      await alertAdminGroup(
        `✅ *IP autorisée via Telegram marchand*\n\n` +
        `👤 Marchand : *${merchant.name}*\n` +
        `🌐 IP : \`${candidate}\`\n` +
        `📍 ${geo.city || "?"}${geo.country ? ", " + geo.country : ""}\n` +
        `🔌 ${geo.isp || "?"}`
      );
    } catch (err: any) {
      console.error(`[TG/addip] Erreur addAllowedIp pour ${candidate}:`, err?.message);
      await ctx.reply(`❌ Erreur lors de l'ajout : ${err?.message || "inconnue"}. Contactez l'administrateur.`);
    }
  }

  // ─── /addip — Commande pour ajouter une IP depuis un groupe marchand ──────────
  // ⚠️  IMPORTANT : utiliser cette commande si le bot ne répond pas aux messages
  // texte (mode privacy Telegram activé). Les commandes /xxx sont TOUJOURS reçues
  // par le bot même en mode privacy, contrairement aux messages texte ordinaires.
  bot.command("addip", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup) {
      await ctx.reply("❌ Cette commande doit être utilisée dans un groupe marchand.");
      return;
    }

    const merchant = await getMerchantForGroup(chatId);
    if (!merchant) {
      // Pas un groupe marchand — ignorer silencieusement
      return;
    }

    const args = (ctx.message.text || "").split(/\s+/).slice(1);
    const ip = args[0]?.trim();
    if (!ip || !isValidIp(ip)) {
      await ctx.reply(
        `❌ Usage : \`/addip ADRESSE_IP\`\n\nExemple : \`/addip 41.207.187.10\` ou \`/addip 2409:4053:59e:9bec::1\``,
        { parse_mode: "Markdown" }
      );
      return;
    }

    await ctx.reply("请稍等，我这就添加。");
    await whitelistMerchantIp(ctx, ip, merchant);
  });

  // ─── Catch-all message handler (doit être le DERNIER handler) ───────────────
  // IMPORTANT : utiliser (ctx, next) et toujours appeler next() pour ne jamais
  // bloquer les handlers qui pourraient venir après (callback_query, etc.)
  bot.on("message", async (ctx, next) => {
    try {
      const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
      const chatId = String(ctx.chat.id);
      const text = ("text" in ctx.message ? (ctx.message as any).text : "") || "";

      // Ignorer les commandes — elles sont gérées par bot.command() ci-dessus
      if (text.startsWith("/")) {
        console.log(`[TG] commande non matchée: "${text}" (chat=${chatId}) — ignoré`);
        return next();
      }

      if (isGroup) {
        // Vérifier si c'est un groupe marchand avec une IP à ajouter
        const merchant = await getMerchantForGroup(chatId);
        if (!merchant) return next();

        const ipMatch = text.match(IP_EXTRACT_REGEX);
        if (!ipMatch || !isValidIpv4(ipMatch[1])) return next();
        const candidate = ipMatch[1];
        console.log(`[TG] IP détectée (texte) dans groupe marchand ${chatId}: ${candidate}`);

        await ctx.reply("请稍等，我这就添加。");
        await whitelistMerchantIp(ctx, candidate, merchant);
        return;
      }

      // Message privé d'un utilisateur non lié
      const merchant = await storage.getMerchantByTelegramChatId(chatId);
      if (!merchant) {
        await ctx.reply("🔒 此机器人仅供已获授权的 WestPay 商户使用。\n\n如果您是商户，请向您的管理员申请激活码。");
      }
    } catch (e: any) {
      console.error("[TG] catch-all message error:", e?.message);
    }
    return next();
  });

  console.log("[TELEGRAM] Bot initialise");
  scheduleDailyReport();

  return bot;
}

export function setupWebhook(app: Express, secret: string): void {
  // Route désormais enregistrée de façon permanente dans routes.ts via registerTelegramWebhookRoute().
  // Cette fonction est conservée pour compatibilité (appelée depuis index.ts et refresh-webhook).
  console.log(`[TELEGRAM] Webhook actif sur route fixe /api/telegram/webhook/:secret (secret vérifié en interne)`);
}

export function handleWebhookUpdate(secret: string, body: any): boolean {
  if (!bot) return false;
  const updateId = body.update_id;
  const type = body.message ? "message"
    : body.callback_query ? "callback_query"
    : body.my_chat_member ? "my_chat_member"
    : body.edited_message ? "edited_message"
    : "unknown";
  const chatId = body.message?.chat?.id || body.callback_query?.message?.chat?.id || "?";
  const text = body.message?.text || body.callback_query?.data || "";
  console.log(`[TG-WEBHOOK] update_id=${updateId} type=${type} chat=${chatId} text="${String(text).slice(0, 80)}"`);
  bot.handleUpdate(body).catch((err: any) => console.error("[TG-WEBHOOK] Erreur handleUpdate:", err.message));
  return true;
}

async function tryRegisterWebhook(webhookUrl: string, force = false): Promise<boolean> {
  if (!bot) return false;
  try {
    const current = await bot.telegram.getWebhookInfo();
    console.log(`[TELEGRAM] Webhook actuel : "${current.url || "(vide)"}"`);
    if (!force && current.url === webhookUrl) {
      console.log(`[TELEGRAM] Webhook deja actif — aucune action requise`);
      return true;
    }
    await bot.telegram.deleteWebhook({ drop_pending_updates: false });
    await bot.telegram.setWebhook(webhookUrl, {
      allowed_updates: ["message", "callback_query", "my_chat_member", "chat_member", "edited_message", "channel_post"],
    });
    const check = await bot.telegram.getWebhookInfo();
    if (check.url === webhookUrl) {
      console.log(`[TELEGRAM] Webhook configure avec succes : ${webhookUrl}`);
      return true;
    }
    console.error(`[TELEGRAM] Verification post-enregistrement echouee. URL actuelle : "${check.url}"`);
    return false;
  } catch (err: any) {
    const detail = err.response ? ` (HTTP ${err.response.statusCode}: ${JSON.stringify(err.response.body)})` : "";
    console.error(`[TELEGRAM] Erreur enregistrement webhook: ${err.message}${detail}`);
    return false;
  }
}

export async function registerWebhookUrl(webhookUrl: string): Promise<void> {
  if (!bot) return;
  const delays = [0, 5000, 15000, 30000, 60000];
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) {
      console.log(`[TELEGRAM] Nouvelle tentative webhook dans ${delays[i] / 1000}s...`);
      await new Promise(r => setTimeout(r, delays[i]));
    }
    console.log(`[TELEGRAM] Tentative enregistrement webhook ${i + 1}/${delays.length}`);
    const ok = await tryRegisterWebhook(webhookUrl);
    if (ok) return;
  }
  console.error(`[TELEGRAM] Echec definitif enregistrement webhook — bot en mode reception uniquement`);
}

let _pollingActive = false;
let _pollingRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
let _webhookWatchdog: ReturnType<typeof setInterval> | null = null;
let _webhookWatchdogUrl: string | null = null;
let _webhookPendingChecks = 0;

/**
 * Surveille le webhook en production.
 *
 * Telegram conserve parfois une URL configurée mais cesse de livrer les
 * updates après une erreur TLS, un redémarrage Passenger ou une interruption
 * réseau. Dans ce cas le bot paraît "endormi" alors que le processus Node est
 * toujours vivant. Cette vérification légère répare automatiquement le
 * webhook, sans supprimer les updates en attente.
 */
export function startWebhookWatchdog(webhookUrl: string): void {
  if (_webhookWatchdog && _webhookWatchdogUrl === webhookUrl) return;
  if (_webhookWatchdog) clearInterval(_webhookWatchdog);
  _webhookWatchdogUrl = webhookUrl;
  _webhookPendingChecks = 0;

  const check = async () => {
    if (!bot || _webhookWatchdogUrl !== webhookUrl) return;
    try {
      const info = await bot.telegram.getWebhookInfo();
      const lastErrorDate = Number((info as any).last_error_date || 0) * 1000;
      const hasRecentError = !!(info as any).last_error_message &&
        (!lastErrorDate || Date.now() - lastErrorDate <= 10 * 60 * 1000);
      const wrongUrl = info.url !== webhookUrl;
      const pendingCount = Number(info.pending_update_count || 0);
      if (pendingCount > 0) _webhookPendingChecks++;
      else _webhookPendingChecks = 0;
      const pendingStuck = pendingCount > 0 && _webhookPendingChecks >= 2;
      if (!wrongUrl && !hasRecentError && !pendingStuck) {
        console.log(`[TELEGRAM] Webhook watchdog : OK (en attente: ${info.pending_update_count || 0})`);
        return;
      }

      console.warn(
        `[TELEGRAM] Webhook watchdog : réparation nécessaire` +
        `${wrongUrl ? ` — URL inattendue "${info.url || "(vide)"}"` : ""}` +
        `${hasRecentError ? ` — ${String((info as any).last_error_message).slice(0, 180)}` : ""}` +
        `${pendingStuck ? ` — ${pendingCount} update(s) en attente depuis plusieurs contrôles` : ""}`,
      );
      if (await tryRegisterWebhook(webhookUrl, true)) _webhookPendingChecks = 0;
    } catch (err: any) {
      console.error("[TELEGRAM] Webhook watchdog indisponible:", err?.message || err);
    }
  };

  // Première vérification après le démarrage, puis toutes les 60 secondes.
  void check();
  _webhookWatchdog = setInterval(() => { void check(); }, 60 * 1000);
  console.log("[TELEGRAM] Webhook watchdog activé (vérification toutes les 60 s)");
}

export function stopWebhookWatchdog(): void {
  if (_webhookWatchdog) clearInterval(_webhookWatchdog);
  _webhookWatchdog = null;
  _webhookWatchdogUrl = null;
  _webhookPendingChecks = 0;
}

export async function startPolling(): Promise<void> {
  if (!bot) return;
  if (_pollingActive) return; // Éviter les doublons
  _pollingActive = true;
  const pollingBot = bot;

  const launchWithRecovery = async (attempt = 1): Promise<void> => {
    if (!bot || bot !== pollingBot || !_pollingActive) return;
    try {
      // Telegraf.deleteWebhook() est appelé implicitement par bot.launch().
      // Vérifier d'abord évite qu'une instance Replit ne supprime le webhook
      // utilisé par l'instance de production Plesk.
      const webhookInfo = await pollingBot.telegram.getWebhookInfo();
      if (webhookInfo.url) {
        console.warn(`[TELEGRAM] Polling suspendu : webhook déjà actif (${webhookInfo.url})`);
        _pollingActive = false;
        return;
      }

      await pollingBot.launch({ dropPendingUpdates: false });
      if (bot === pollingBot && _pollingActive) {
        throw new Error("Le polling Telegram s'est arrêté sans signal d'arrêt.");
      }
    } catch (err: any) {
      if (bot !== pollingBot || !_pollingActive) return;
      const delay = Math.min(3000 * Math.max(attempt, 1), 30000);
      console.warn(`[TELEGRAM] Polling interrompu (tentative ${attempt}) — reprise dans ${delay / 1000}s:`, err?.message || err);
      if (_pollingRecoveryTimer) clearTimeout(_pollingRecoveryTimer);
      _pollingRecoveryTimer = setTimeout(() => {
        _pollingRecoveryTimer = null;
        void launchWithRecovery(attempt + 1);
      }, delay);
    }
  };

  try {
    console.log("[TELEGRAM] Bot demarre en mode polling (developpement)");
    void launchWithRecovery();
    process.once("SIGINT", () => {
      if (_pollingRecoveryTimer) clearTimeout(_pollingRecoveryTimer);
      _pollingRecoveryTimer = null;
      pollingBot.stop("SIGINT");
      _pollingActive = false;
    });
    process.once("SIGTERM", () => {
      if (_pollingRecoveryTimer) clearTimeout(_pollingRecoveryTimer);
      _pollingRecoveryTimer = null;
      pollingBot.stop("SIGTERM");
      _pollingActive = false;
    });
  } catch (err: any) {
    console.error("[TELEGRAM] Erreur demarrage polling:", err.message);
    _pollingActive = false;
  }
}

const NOTIFY_TRANSLATIONS: Record<string, {
  header: (country: string) => string;
  newPayment: string;
  amount: string;
  payer: string;
  country: string;
  via: string;
  mobileMoney: string;
  balanceHeader: string;
  totalBalance: string;
  payoutBalance: string;
  successfulDeposits: (count: number, amount: string, currency: string) => string;
  successRate: string;
  currency: string;
}> = {
  fr: {
    header: (c) => `🧡🧡 *Dépôt ${c}* 🧡🧡`,
    newPayment: `✅ *Nouveau paiement reçu !*`,
    amount: "💰 *Montant :*",
    payer: "📞 *Payeur :*",
    country: "🌍 *Pays :*",
    via: "📡 *Via :*",
    mobileMoney: "Mobile Money",
    balanceHeader: `🧡🧡 *Solde compte* 🧡🧡`,
    totalBalance: "💰 Solde total :",
    payoutBalance: "💳 Solde reversement :",
    successfulDeposits: (n, amt, cur) => `📊 Dépôts réussis aujourd'hui : ${n} ; Montant : ${amt} ${cur}`,
    successRate: "📈 Taux de réussite :",
    currency: "F CFA",
  },
  en: {
    header: (c) => `🧡🧡 *${c} Deposit* 🧡🧡`,
    newPayment: `✅ *New payment received!*`,
    amount: "💰 *Amount:*",
    payer: "📞 *Payer:*",
    country: "🌍 *Country:*",
    via: "📡 *Via:*",
    mobileMoney: "Mobile Money",
    balanceHeader: `🧡🧡 *Account Balance* 🧡🧡`,
    totalBalance: "💰 Total balance:",
    payoutBalance: "💳 Payout balance:",
    successfulDeposits: (n, amt, cur) => `📊 Successful deposits today: ${n} ; Amount: ${amt} ${cur}`,
    successRate: "📈 Success rate:",
    currency: "FCFA",
  },
  zh: {
    header: (c) => `🧡🧡 *${c} 存款* 🧡🧡`,
    newPayment: `✅ *收到新付款！*`,
    amount: "💰 *金额：*",
    payer: "📞 *付款人：*",
    country: "🌍 *国家：*",
    via: "📡 *通过：*",
    mobileMoney: "手机支付",
    balanceHeader: `🧡🧡 *账户余额* 🧡🧡`,
    totalBalance: "💰 总余额：",
    payoutBalance: "💳 付款余额：",
    successfulDeposits: (n, amt, cur) => `📊 今日成功存款：${n} ；金额：${amt} ${cur}`,
    successRate: "📈 成功率：",
    currency: "FCFA",
  },
  de: {
    header: (c) => `🧡🧡 *Einzahlung ${c}* 🧡🧡`,
    newPayment: `✅ *Neue Zahlung erhalten!*`,
    amount: "💰 *Betrag:*",
    payer: "📞 *Zahler:*",
    country: "🌍 *Land:*",
    via: "📡 *Über:*",
    mobileMoney: "Mobile Money",
    balanceHeader: `🧡🧡 *Kontostand* 🧡🧡`,
    totalBalance: "💰 Gesamtguthaben:",
    payoutBalance: "💳 Auszahlungssaldo:",
    successfulDeposits: (n, amt, cur) => `📊 Erfolgreiche Einzahlungen heute: ${n} ; Betrag: ${amt} ${cur}`,
    successRate: "📈 Erfolgsquote:",
    currency: "FCFA",
  },
  hi: {
    header: (c) => `🧡🧡 *${c} जमा* 🧡🧡`,
    newPayment: `✅ *नया भुगतान प्राप्त हुआ!*`,
    amount: "💰 *राशि:*",
    payer: "📞 *भुगतानकर्ता:*",
    country: "🌍 *देश:*",
    via: "📡 *माध्यम:*",
    mobileMoney: "मोबाइल मनी",
    balanceHeader: `🧡🧡 *खाता शेष* 🧡🧡`,
    totalBalance: "💰 कुल शेष:",
    payoutBalance: "💳 निकासी शेष:",
    successfulDeposits: (n, amt, cur) => `📊 आज के सफल जमा: ${n} ; राशि: ${amt} ${cur}`,
    successRate: "📈 सफलता दर:",
    currency: "INR",
  },
};

export async function notifyMerchantPayment(merchantId: number, data: {
  txId: string;
  amount: number;
  payerNumber?: string | null;
  country: string;
  provider: string;
}): Promise<void> {
  if (!bot) return;
  try {
    const merchant = await storage.getMerchantById(merchantId);
    if (!merchant?.telegramChatId) return;

    const lang = merchant.telegramBotLanguage || "fr";
    const t = NOTIFY_TRANSLATIONS[lang] || NOTIFY_TRANSLATIONS["fr"];

    const countries = await storage.getMerchantCountries(merchantId);
    const mc = countries.find(c => c.country === data.country);
    const newBalance = mc ? mc.balance : 0;

    const todayStats = await (async () => {
      const txs = await storage.getTransactions(merchantId);
      const todayTxs = txs.filter(tx => tx.country === data.country && isToday(new Date(tx.createdAt)));
      const success = todayTxs.filter(tx => tx.status === "confirmed").length;
      const total = todayTxs.length;
      const amount = todayTxs.filter(tx => tx.status === "confirmed").reduce((s, tx) => s + tx.amount, 0);
      return { success, total, amount };
    })();

    // ── Taux de frais par pays (miroir de COUNTRY_FEE_OVERRIDES dans routes.ts) ──
    // Ne pas importer depuis routes.ts → dépendance circulaire.
    const PAYIN_FEE_OVERRIDES: Record<string, number> = {
      "India": 0.15, "Pakistan": 0.15, "Nigeria": 0.15, "Philippines": 0.15,
      "Niger": 0.06, "Kenya": 0.06, "Ghana": 0.06,
    };
    const baseFeeRate = PAYIN_FEE_OVERRIDES[data.country] ?? 0.055;
    const feeRate = merchant?.feeExempt ? 0 : baseFeeRate;
    const feePct = (feeRate * 100).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
    const feePctEn = (feeRate * 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
    const grossAmount = data.amount;
    const westpayFee = Math.round(grossAmount * feeRate);
    const netCredited = grossAmount - westpayFee;

    const feeLinesFr = feeRate > 0 ? [
      `💳 *Brut reçu :* ${formatAmountC(grossAmount, data.country)}`,
      `📉 *Frais WestPay (${feePct}%) :* -${formatAmountC(westpayFee, data.country)}`,
      `✅ *Net crédité :* ${formatAmountC(netCredited, data.country)}`,
    ] : [
      `💳 *Montant crédité :* ${formatAmountC(grossAmount, data.country)} *(sans frais)*`,
    ];
    const feeLinesEn = feeRate > 0 ? [
      `💳 *Gross received:* ${formatAmountC(grossAmount, data.country)}`,
      `📉 *WestPay fee (${feePctEn}%):* -${formatAmountC(westpayFee, data.country)}`,
      `✅ *Net credited:* ${formatAmountC(netCredited, data.country)}`,
    ] : [
      `💳 *Amount credited:* ${formatAmountC(grossAmount, data.country)} *(no fee)*`,
    ];
    const feeLines = lang === "fr" ? feeLinesFr : feeLinesEn;

    const msg = [
      t.header(countryLabel(data.country)),
      ``,
      t.newPayment,
      ``,
      ...feeLines,
      `📞 *Payeur :* ${data.payerNumber || "N/A"}`,
      `🌍 *Pays :* ${countryLabel(data.country)}`,
      `🔖 *TX :* \`${data.txId}\``,
      ``,
      t.balanceHeader,
      ``,
      `${t.totalBalance} ${formatAmountPlain(newBalance)} ${currencyForCountry(data.country)}`,
      `${t.payoutBalance} ${formatAmountPlain(newBalance)} ${currencyForCountry(data.country)}`,
      t.successfulDeposits(todayStats.success, formatAmountPlain(todayStats.amount), currencyForCountry(data.country)),
      `${t.successRate} ${successRate(todayStats.success, todayStats.total)}`,
    ].join("\n");

    await safeSend(merchant.telegramChatId, msg);
  } catch (err) {
    console.error("[TELEGRAM] Erreur notification marchand:", (err as any).message);
  }
}

async function safeSend(chatId: string, message: string): Promise<void> {
  if (!bot) throw new Error("Bot Telegram non initialisé");
  try {
    await bot.telegram.sendMessage(chatId, message, { parse_mode: "Markdown" });
  } catch {
    // Markdown failed (special chars / emojis) — retry as plain text preserving all chars
    try {
      await bot.telegram.sendMessage(chatId, message);
    } catch (err2: any) {
      console.error("[TELEGRAM] Echec envoi:", err2.message);
      throw err2;
    }
  }
}

type InlineButton = { text: string; url: string };

function buildInlineKeyboard(buttons: InlineButton[][]): { inline_keyboard: { text: string; url: string }[][] } {
  return {
    inline_keyboard: buttons.map(row => row.map(btn => ({ text: btn.text, url: btn.url }))),
  };
}

async function safeSendWithMedia(
  chatId: string,
  message: string,
  imageSource?: string,
  buttons?: InlineButton[][]
): Promise<void> {
  if (!bot) throw new Error("Bot Telegram non initialisé");
  const replyMarkup = buttons && buttons.length > 0 ? buildInlineKeyboard(buttons) : undefined;

  if (imageSource) {
    try {
      // Try with Markdown formatting first
      await bot.telegram.sendPhoto(chatId, imageSource, {
        caption: message,
        parse_mode: "Markdown",
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
      return;
    } catch {
      // Markdown failed — retry photo without parse_mode (preserves emojis)
      try {
        await bot.telegram.sendPhoto(chatId, imageSource, {
          caption: message,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        });
        return;
      } catch (err2: any) {
        console.error("[TELEGRAM] Echec sendPhoto:", err2.message);
        // Fall through to text-only send
      }
    }
  }

  try {
    await bot.telegram.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  } catch {
    // Markdown failed (emojis / special chars) — retry as plain text preserving all chars
    try {
      await bot.telegram.sendMessage(chatId, message, {
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    } catch (err2: any) {
      console.error("[TELEGRAM] Echec envoi:", err2.message);
      throw err2;
    }
  }
}

export async function broadcastToMerchants(options: {
  message: string;
  imageUrl?: string;
  fileId?: string;
  buttons?: InlineButton[][];
  targetChatIds?: string[];
  useAllKnownGroups?: boolean;
}): Promise<{ sent: number; failed: number; skipped: number }> {
  if (!bot) return { sent: 0, failed: 0, skipped: 0 };

  let chatIds: string[] = [];

  if (options.targetChatIds && options.targetChatIds.length > 0) {
    chatIds = options.targetChatIds;
  } else if (options.useAllKnownGroups) {
    // Fusionner : setting DB + groupe admin + tous les telegramChatId marchands
    // Cela garantit que même les groupes non enregistrés dans le setting reçoivent le message
    const fromSetting = await getKnownGroups();
    const merged = new Set<string>(fromSetting);
    const adminGroupId = await storage.getSetting("telegram_group_id");
    if (adminGroupId) merged.add(adminGroupId);
    const merchants = await storage.getMerchants();
    for (const m of merchants) {
      if ((m as any).telegramChatId) merged.add((m as any).telegramChatId as string);
    }
    chatIds = Array.from(merged);
    console.log(`[TELEGRAM] Broadcast "tous les groupes" : ${chatIds.length} destinataires (setting:${fromSetting.length} + marchands/admin fusionnés)`);
  } else {
    const merchants = await storage.getMerchants();
    chatIds = merchants
      .filter((m: any) => m.telegramChatId && !m.suspended)
      .map((m: any) => m.telegramChatId as string);
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const chatId of chatIds) {
    if (!chatId) { skipped++; continue; }
    try {
      await safeSendWithMedia(chatId, options.message, options.fileId || options.imageUrl, options.buttons);
      sent++;
      await new Promise(r => setTimeout(r, 100));
    } catch (err: any) {
      console.error(`[TELEGRAM] Echec broadcast vers ${chatId}:`, err.message);
      failed++;
    }
  }

  console.log(`[TELEGRAM] Broadcast terminé: ${sent} envoyés, ${failed} échecs, ${skipped} ignorés`);
  return { sent, failed, skipped };
}

export async function sendTelegramMessage(options: {
  chatId: string;
  message: string;
  imageUrl?: string;
  buttons?: InlineButton[][];
}): Promise<boolean> {
  if (!bot) return false;
  try {
    await safeSendWithMedia(options.chatId, options.message, options.imageUrl, options.buttons);
    return true;
  } catch {
    return false;
  }
}

export async function notifyAdminGroup(message: string): Promise<void> {
  if (!bot) return;
  try {
    const groupId = await storage.getSetting("telegram_group_id");
    if (!groupId) return;
    await safeSend(groupId, message);
  } catch (err) {
    console.error("[TELEGRAM] Erreur notification groupe:", (err as any).message);
  }
}

export async function notifyAdminPayment(data: {
  txId: string;
  merchantName: string;
  payerNumber?: string | null;
  country: string;
  amount: number;
  provider: string;
  status: "confirmed" | "failed";
}): Promise<void> {
  const dateStr = new Date().toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  });
  const icon = data.status === "confirmed" ? "✅" : "❌";
  const statusLabel = data.status === "confirmed" ? "Succès" : "Échoué";
  const methodLabel = data.provider === "omnipay" ? "Mobile Money" : "SMS";

  const msg = [
    `${icon} *Nouvelle transaction WestPay*`,
    ``,
    `📋 *Type :* Paiement`,
    `🔖 *ID :* \`${data.txId}\``,
    `🏪 *Marchand :* ${data.merchantName}`,
    `📞 *Numéro client :* ${data.payerNumber || "N/A"}`,
    `🌍 *Pays :* ${countryLabel(data.country)}`,
    `💰 *Montant total :* ${formatAmountC(data.amount, data.country)}`,
    `💵 *Frais plateforme :* 0 ${currencyForCountry(data.country)}`,
    `✅ *Montant reçu :* ${formatAmountC(data.amount, data.country)}`,
    `📱 *Méthode :* ${methodLabel}`,
    `📊 *Statut :* ${statusLabel}`,
    `📅 *Date :* ${dateStr}`,
  ].join("\n");

  await notifyAdminGroup(msg);
}

function formatAdminRawError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.trim() || "Erreur inconnue";
  return normalized.length > 2800
    ? `${normalized.slice(0, 2800)}\n...[erreur tronquée pour Telegram]`
    : normalized;
}

export async function notifyAdminPaymentError(data: {
  merchantName: string;
  merchantId?: number;
  country: string;
  amount: number;
  payerNumber?: string | null;
  operator?: string | null;
  gateway?: string | null;
  stage?: string | null;
  error: unknown;
}): Promise<void> {
  const dateStr = new Date().toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC",
  });
  const rawError = formatAdminRawError(data.error);
  const lines = [
    `🚨 *Erreur paiement WestPay*`,
    ``,
    `🏪 *Marchand :* ${data.merchantName}`,
    data.merchantId ? `🆔 *ID marchand :* ${data.merchantId}` : null,
    `🌍 *Pays :* ${countryLabel(data.country)}`,
    `💰 *Montant :* ${formatAmountC(data.amount, data.country)}`,
    data.payerNumber ? `📞 *Numéro client :* ${data.payerNumber}` : null,
    data.operator ? `📱 *Opérateur :* ${data.operator}` : null,
    data.gateway ? `⚙️ *Gateway :* ${data.gateway}` : null,
    data.stage ? `📍 *Étape :* ${data.stage}` : null,
    `📅 *Date :* ${dateStr} UTC`,
    ``,
    `⚠️ *Erreur exacte :*`,
    "```",
    rawError,
    "```",
  ].filter(Boolean).join("\n");

  await notifyAdminGroup(lines);
}

export async function notifyAdminWithdrawal(data: {
  id: number;
  merchantName: string;
  merchantEmail?: string;
  merchantId?: number;
  country: string;
  amount: number;
  fees: number;
  phone: string;
  operator?: string | null;
  status: "pending" | "approved" | "failed" | "rejected";
  mode: "auto" | "manual";
  ip?: string;
  geo?: GeoInfo;
  reason?: string | null;
}): Promise<void> {
  const dateStr = new Date().toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  });
  const icon = data.status === "approved" ? "💸" : data.status === "pending" ? "⏳" : "❌";
  const statusLabel = data.status === "approved" ? "Effectué" : data.status === "rejected" ? "Rejeté" : data.status === "pending" ? "En attente" : "Échoué";
  const net = data.amount - data.fees;
  let adminReason = data.reason || null;
  if (!adminReason && (data.status === "failed" || data.status === "rejected")) {
    adminReason = (await storage.getWithdrawalById(data.id).catch(() => undefined))?.adminNote || null;
  }

  const geoLine = data.geo && data.status === "pending"
    ? `📍 *Localisation :* ${[data.geo.city, data.geo.region, data.geo.country].filter(Boolean).join(", ")}`
    : null;
  const ispLine = data.geo?.isp && data.status === "pending" ? `🌐 *FAI :* ${data.geo.isp}` : null;

  const lines = [
    `${icon} *Retrait WestPay*`,
    ``,
    `📋 *Type :* Retrait`,
    `🔖 *ID :* \`WD-${data.id}\``,
    `🏪 *Marchand :* ${data.merchantName}`,
    data.merchantEmail ? `📧 *Email :* \`${data.merchantEmail}\`` : null,
    data.merchantId ? `🆔 *ID Marchand :* ${data.merchantId}` : null,
    data.ip && data.status === "pending" ? `🌐 *IP :* \`${data.ip}\`` : null,
    geoLine,
    ispLine,
    ``,
    `📞 *Numéro réception :* ${data.phone}`,
    `🌍 *Pays :* ${countryLabel(data.country)}`,
    `💰 *Montant demandé :* ${formatAmountC(data.amount, data.country)}`,
    `💵 *Frais plateforme :* ${formatAmountC(data.fees, data.country)}`,
    `✅ *Montant envoyé :* ${formatAmountC(net, data.country)}`,
    data.operator ? `📱 *Opérateur :* ${data.operator}` : null,
    `⚙️ *Mode :* ${data.mode === "auto" ? "Automatique" : "Manuel"}`,
    `📊 *Statut :* ${statusLabel}`,
    adminReason ? `🛠️ *Cause interne :* ${adminReason}` : null,
    `📅 *Date :* ${dateStr} UTC`,
  ].filter(Boolean) as string[];

  await notifyAdminGroup(lines.join("\n"));
}

export async function notifyAdminWithdrawalError(data: {
  id?: number;
  merchantName: string;
  merchantEmail?: string;
  merchantId?: number;
  country: string;
  amount: number;
  phone?: string | null;
  operator?: string | null;
  gateway?: string | null;
  stage?: string | null;
  error: unknown;
}): Promise<void> {
  const dateStr = new Date().toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC",
  });
  const rawError = formatAdminRawError(data.error);
  const lines = [
    `🚨 *Erreur retrait WestPay*`,
    ``,
    data.id ? `🔖 *Retrait :* \`WD-${data.id}\`` : null,
    `🏪 *Marchand :* ${data.merchantName}`,
    data.merchantEmail ? `📧 *Email :* \`${data.merchantEmail}\`` : null,
    data.merchantId ? `🆔 *ID marchand :* ${data.merchantId}` : null,
    `🌍 *Pays :* ${countryLabel(data.country)}`,
    `💰 *Montant :* ${formatAmountC(data.amount, data.country)}`,
    data.phone ? `📞 *Numéro destinataire :* ${data.phone}` : null,
    data.operator ? `📱 *Opérateur :* ${data.operator}` : null,
    data.gateway ? `⚙️ *Gateway :* ${data.gateway}` : null,
    data.stage ? `📍 *Étape :* ${data.stage}` : null,
    `📅 *Date :* ${dateStr} UTC`,
    ``,
    `⚠️ *Erreur exacte :*`,
    "```",
    rawError,
    "```",
  ].filter(Boolean).join("\n");

  await notifyAdminGroup(lines);
}

export async function notifyAdminWalletTransfer(data: {
  id: number;
  merchantName: string;
  fromCountry: string;
  toCountry: string;
  amount: number;
  fee: number;
  currency: string;
  status: "pending" | "approved" | "rejected";
}): Promise<void> {
  const dateStr = new Date().toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  });
  const icon = data.status === "approved" ? "🔄" : data.status === "rejected" ? "❌" : "⏳";
  const statusLabel = data.status === "approved" ? "Approuvé" : data.status === "rejected" ? "Rejeté" : "En attente";
  const net = data.amount - data.fee;

  const msg = [
    `${icon} *Transfert entre wallets WestPay*`,
    ``,
    `📋 *Type :* Échange de wallets`,
    `🔖 *ID :* \`WT-${data.id}\``,
    `🏪 *Marchand :* ${data.merchantName}`,
    `🌍 *De :* ${countryLabel(data.fromCountry)} → *Vers :* ${countryLabel(data.toCountry)}`,
    `💰 *Montant total :* ${formatAmount(data.amount)} ${data.currency}`,
    `💵 *Frais plateforme :* ${formatAmount(data.fee)} ${data.currency}`,
    `✅ *Montant reçu :* ${formatAmount(net)} ${data.currency}`,
    `📊 *Statut :* ${statusLabel}`,
    `📅 *Date :* ${dateStr}`,
  ].join("\n");

  await notifyAdminGroup(msg);
}

const WITHDRAWAL_TRANSLATIONS: Record<string, {
  title: string;
  reference: string;
  amountRequested: string;
  fees: string;
  amountSent: string;
  phone: string;
  country: string;
  operator: string;
  status: string;
  date: string;
  statusApproved: string;
  statusRejected: string;
  statusFailed: string;
  statusPending: string;
  dateLocale: string;
}> = {
  fr: {
    title: "Demande de retrait",
    reference: "Référence",
    amountRequested: "Montant demandé",
    fees: "Frais",
    amountSent: "Montant envoyé",
    phone: "Numéro de réception",
    country: "Pays",
    operator: "Opérateur",
    status: "Statut",
    date: "Date",
    statusApproved: "Approuvé ✅",
    statusRejected: "Rejeté ❌",
    statusFailed: "Échoué ❌",
    statusPending: "En attente ⏳",
    dateLocale: "fr-FR",
  },
  en: {
    title: "Withdrawal request",
    reference: "Reference",
    amountRequested: "Amount requested",
    fees: "Fees",
    amountSent: "Amount sent",
    phone: "Receiving number",
    country: "Country",
    operator: "Operator",
    status: "Status",
    date: "Date",
    statusApproved: "Approved ✅",
    statusRejected: "Rejected ❌",
    statusFailed: "Failed ❌",
    statusPending: "Pending ⏳",
    dateLocale: "en-GB",
  },
  zh: {
    title: "提款请求",
    reference: "参考编号",
    amountRequested: "请求金额",
    fees: "手续费",
    amountSent: "发送金额",
    phone: "收款号码",
    country: "国家",
    operator: "运营商",
    status: "状态",
    date: "日期",
    statusApproved: "已批准 ✅",
    statusRejected: "已拒绝 ❌",
    statusFailed: "失败 ❌",
    statusPending: "待处理 ⏳",
    dateLocale: "zh-CN",
  },
  de: {
    title: "Auszahlungsanfrage",
    reference: "Referenz",
    amountRequested: "Angeforderter Betrag",
    fees: "Gebühren",
    amountSent: "Gesendeter Betrag",
    phone: "Empfangsnummer",
    country: "Land",
    operator: "Betreiber",
    status: "Status",
    date: "Datum",
    statusApproved: "Genehmigt ✅",
    statusRejected: "Abgelehnt ❌",
    statusFailed: "Fehlgeschlagen ❌",
    statusPending: "Ausstehend ⏳",
    dateLocale: "de-DE",
  },
  hi: {
    title: "निकासी अनुरोध",
    reference: "संदर्भ",
    amountRequested: "अनुरोधित राशि",
    fees: "शुल्क",
    amountSent: "भेजी गई राशि",
    phone: "प्राप्त नंबर",
    country: "देश",
    operator: "ऑपरेटर",
    status: "स्थिति",
    date: "तिथि",
    statusApproved: "स्वीकृत ✅",
    statusRejected: "अस्वीकृत ❌",
    statusFailed: "विफल ❌",
    statusPending: "लंबित ⏳",
    dateLocale: "hi-IN",
  },
};

const TRANSFER_TRANSLATIONS: Record<string, {
  title: string;
  reference: string;
  from: string;
  to: string;
  amount: string;
  fees: string;
  received: string;
  status: string;
  date: string;
  statusApproved: string;
  statusRejected: string;
  statusPending: string;
  dateLocale: string;
}> = {
  fr: {
    title: "Virement entre wallets",
    reference: "Référence",
    from: "De",
    to: "Vers",
    amount: "Montant",
    fees: "Frais",
    received: "Montant reçu",
    status: "Statut",
    date: "Date",
    statusApproved: "Approuvé ✅",
    statusRejected: "Rejeté ❌",
    statusPending: "En attente ⏳",
    dateLocale: "fr-FR",
  },
  en: {
    title: "Wallet transfer",
    reference: "Reference",
    from: "From",
    to: "To",
    amount: "Amount",
    fees: "Fees",
    received: "Amount received",
    status: "Status",
    date: "Date",
    statusApproved: "Approved ✅",
    statusRejected: "Rejected ❌",
    statusPending: "Pending ⏳",
    dateLocale: "en-GB",
  },
  zh: {
    title: "钱包转账",
    reference: "参考编号",
    from: "来自",
    to: "到",
    amount: "金额",
    fees: "手续费",
    received: "收到金额",
    status: "状态",
    date: "日期",
    statusApproved: "已批准 ✅",
    statusRejected: "已拒绝 ❌",
    statusPending: "待处理 ⏳",
    dateLocale: "zh-CN",
  },
  de: {
    title: "Wallet-Überweisung",
    reference: "Referenz",
    from: "Von",
    to: "Nach",
    amount: "Betrag",
    fees: "Gebühren",
    received: "Erhaltener Betrag",
    status: "Status",
    date: "Datum",
    statusApproved: "Genehmigt ✅",
    statusRejected: "Abgelehnt ❌",
    statusPending: "Ausstehend ⏳",
    dateLocale: "de-DE",
  },
  hi: {
    title: "वॉलेट ट्रांसफ़र",
    reference: "संदर्भ",
    from: "से",
    to: "तक",
    amount: "राशि",
    fees: "शुल्क",
    received: "प्राप्त राशि",
    status: "स्थिति",
    date: "तिथि",
    statusApproved: "स्वीकृत ✅",
    statusRejected: "अस्वीकृत ❌",
    statusPending: "लंबित ⏳",
    dateLocale: "hi-IN",
  },
};

export async function notifyMerchantWithdrawal(merchantId: number, data: {
  id: number;
  country: string;
  amount: number;
  fees: number;
  phone: string;
  operator?: string | null;
  status: "pending" | "approved" | "failed" | "rejected";
}): Promise<void> {
  if (!bot) return;
  try {
    const merchant = await storage.getMerchantById(merchantId);
    if (!merchant?.telegramChatId) return;

    const lang = (merchant as any).telegramBotLanguage || "fr";
    const tw = WITHDRAWAL_TRANSLATIONS[lang] || WITHDRAWAL_TRANSLATIONS["fr"];

    const dateStr = new Date().toLocaleString(tw.dateLocale, {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "UTC",
    });

    const icon = data.status === "approved" ? "✅" : (data.status === "failed" || data.status === "rejected") ? "❌" : "⏳";
    const statusLabel = data.status === "approved" ? tw.statusApproved : data.status === "rejected" ? tw.statusRejected : data.status === "failed" ? tw.statusFailed : tw.statusPending;
    const net = data.amount - data.fees;

    const lines = [
      `${icon} *${tw.title}*`,
      ``,
      `🔖 *${tw.reference} :* \`WD-${data.id}\``,
      `💰 *${tw.amountRequested} :* ${formatAmountC(data.amount, data.country)}`,
      data.fees > 0 ? `💵 *${tw.fees} :* ${formatAmountC(data.fees, data.country)}` : null,
      data.fees > 0 ? `✅ *${tw.amountSent} :* ${formatAmountC(net, data.country)}` : null,
      `📞 *${tw.phone} :* ${data.phone}`,
      `🌍 *${tw.country} :* ${countryLabel(data.country)}`,
      data.operator ? `📱 *${tw.operator} :* ${data.operator}` : null,
      `📊 *${tw.status} :* ${statusLabel}`,
      `📅 *${tw.date} :* ${dateStr}`,
    ].filter(Boolean) as string[];

    await safeSend(merchant.telegramChatId, lines.join("\n"));
  } catch (err) {
    console.error("[TELEGRAM] Erreur notification retrait marchand:", (err as any).message);
  }
}

export async function notifyMerchantWalletTransfer(merchantId: number, data: {
  id: number;
  fromCountry: string;
  toCountry: string;
  amount: number;
  fee: number;
  currency: string;
  status: "pending" | "approved" | "rejected";
}): Promise<void> {
  if (!bot) return;
  try {
    const merchant = await storage.getMerchantById(merchantId);
    if (!merchant?.telegramChatId) return;

    const lang = (merchant as any).telegramBotLanguage || "fr";
    const tt = TRANSFER_TRANSLATIONS[lang] || TRANSFER_TRANSLATIONS["fr"];

    const dateStr = new Date().toLocaleString(tt.dateLocale, {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "UTC",
    });

    const icon = data.status === "approved" ? "✅" : data.status === "rejected" ? "❌" : "⏳";
    const statusLabel = data.status === "approved" ? tt.statusApproved : data.status === "rejected" ? tt.statusRejected : tt.statusPending;
    const net = data.amount - data.fee;

    const msg = [
      `${icon} *${tt.title}*`,
      ``,
      `🔖 *${tt.reference} :* \`TR-${data.id}\``,
      `🌍 *${tt.from} :* ${countryLabel(data.fromCountry)} ➡️ *${tt.to} :* ${countryLabel(data.toCountry)}`,
      `💰 *${tt.amount} :* ${formatAmount(data.amount)} ${data.currency}`,
      `💵 *${tt.fees} :* ${formatAmount(data.fee)} ${data.currency}`,
      `✅ *${tt.received} :* ${formatAmount(net)} ${data.currency}`,
      `📊 *${tt.status} :* ${statusLabel}`,
      `📅 *${tt.date} :* ${dateStr}`,
    ].join("\n");

    await safeSend(merchant.telegramChatId, msg);
  } catch (err) {
    console.error("[TELEGRAM] Erreur notification virement marchand:", (err as any).message);
  }
}

export async function notifyAdminBalanceUpdate(data: {
  merchantName: string;
  merchantEmail?: string;
  country: string;
  newBalance: number;
  adminEmail?: string;
  adminId?: number;
  ip?: string;
  geo?: GeoInfo;
}): Promise<void> {
  const dateStr = new Date().toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  });

  const geoLine = data.geo
    ? `📍 *Localisation admin :* ${[data.geo.city, data.geo.region, data.geo.country].filter(Boolean).join(", ")}`
    : null;
  const ispLine = data.geo?.isp ? `🌐 *FAI :* ${data.geo.isp}` : null;

  const msg = [
    `🛠️ *Ajustement de solde WestPay*`,
    ``,
    `👤 *Admin :* ${data.adminEmail ? `\`${data.adminEmail}\`` : "Inconnu"}${data.adminId ? ` (ID ${data.adminId})` : ""}`,
    data.ip ? `🌐 *IP admin :* \`${data.ip}\`` : null,
    geoLine,
    ispLine,
    ``,
    `🏪 *Marchand :* ${data.merchantName}`,
    data.merchantEmail ? `📧 *Email marchand :* \`${data.merchantEmail}\`` : null,
    `🌍 *Pays wallet :* ${countryLabel(data.country)}`,
    `💰 *Nouveau solde :* ${formatAmountC(data.newBalance, data.country)}`,
    `📊 *Statut :* Effectué`,
    `📅 *Date :* ${dateStr} UTC`,
  ].filter(Boolean).join("\n");

  await notifyAdminGroup(msg);
}

export async function notifyAdminMerchantCreated(data: {
  merchantName: string;
  merchantEmail: string;
  merchantSlug: string;
  merchantId: number;
  adminEmail?: string;
  adminId?: number;
  ip?: string;
  geo?: GeoInfo;
}): Promise<void> {
  const dateStr = new Date().toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  });
  const geoLine = data.geo
    ? `📍 *Localisation admin :* ${[data.geo.city, data.geo.region, data.geo.country].filter(Boolean).join(", ")}`
    : null;

  const msg = [
    `🏪 *Nouveau marchand créé — WestPay*`,
    ``,
    `👤 *Admin :* ${data.adminEmail ? `\`${data.adminEmail}\`` : "Inconnu"}${data.adminId ? ` (ID ${data.adminId})` : ""}`,
    data.ip ? `🌐 *IP admin :* \`${data.ip}\`` : null,
    geoLine,
    data.geo?.isp ? `🔌 *FAI :* ${data.geo.isp}` : null,
    ``,
    `🏷️ *Nom :* ${data.merchantName}`,
    `📧 *Email :* \`${data.merchantEmail}\``,
    `🔗 *Slug :* \`${data.merchantSlug}\``,
    `🆔 *ID :* ${data.merchantId}`,
    `📅 *Date :* ${dateStr} UTC`,
  ].filter(Boolean).join("\n");

  await notifyAdminGroup(msg);
}

export async function notifyAdminAdminCreated(data: {
  newAdminEmail: string;
  createdByEmail?: string;
  createdById?: number;
  ip?: string;
  geo?: GeoInfo;
}): Promise<void> {
  const dateStr = new Date().toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  });
  const geoLine = data.geo
    ? `📍 *Localisation :* ${[data.geo.city, data.geo.region, data.geo.country].filter(Boolean).join(", ")}`
    : null;

  const msg = [
    `🛡️ *Nouveau compte administrateur — WestPay*`,
    ``,
    `📧 *Nouvel admin :* \`${data.newAdminEmail}\``,
    ``,
    `👤 *Créé par :* ${data.createdByEmail ? `\`${data.createdByEmail}\`` : "Inconnu"}${data.createdById ? ` (ID ${data.createdById})` : ""}`,
    data.ip ? `🌐 *IP :* \`${data.ip}\`` : null,
    geoLine,
    data.geo?.isp ? `🔌 *FAI :* ${data.geo.isp}` : null,
    `📅 *Date :* ${dateStr} UTC`,
  ].filter(Boolean).join("\n");

  await notifyAdminGroup(msg);
}

export async function notifyAdminLogin(data: {
  email: string;
  ip: string;
  device: string;
  success: boolean;
  fingerprint?: string;
}): Promise<void> {
  const dateStr = new Date().toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC",
  });
  const geo = await getGeoInfo(data.ip).catch(() => null);
  const { browser, os, device } = parseUserAgent(data.device);
  const cleanIp = data.ip.replace(/^::ffff:/, "");
  const icon = data.success ? "🛡️" : "⚠️";
  const statusLabel = data.success ? "✅ Connexion réussie" : "❌ Tentative échouée";

  const geoFlags: string[] = [];
  if (geo?.isProxy) geoFlags.push("⚠️ *VPN/Proxy/TOR détecté*");
  if (geo?.isHosting) geoFlags.push("🖥️ *Serveur hébergeur détecté*");

  const msg = [
    `${icon} *Connexion Admin — WestPay*`,
    ``,
    `👤 *Compte :* \`${data.email}\``,
    `🔐 *Statut :* ${statusLabel}`,
    `🌐 *IP :* \`${cleanIp}\``,
    geo && geo.city !== "Inconnue" ? `📍 *Localisation :* ${geo.city}${geo.country ? ", " + geo.country : ""}` : null,
    geo?.isp ? `🔌 *FAI :* ${geo.isp}` : null,
    `💻 *Navigateur :* ${browser} (${os})`,
    `📱 *Appareil :* ${device}`,
    ...geoFlags,
    `🕒 *Date :* ${dateStr} UTC`,
  ].filter(Boolean).join("\n");

  const buttons = [[
    { text: "✅ Autoriser IP", callback_data: `sec:allow:${cleanIp}` },
    { text: "⛔ Bloquer IP", callback_data: `sec:block:${cleanIp}` },
  ]];

  if (data.success || geo?.isProxy) {
    await alertAdminGroupWithButtons(msg, buttons);
  } else {
    await alertAdminGroup(msg);
  }
}

export async function notifyAdminMerchantLogin(data: {
  email: string;
  merchantName: string;
  ip: string;
  device: string;
  success: boolean;
}): Promise<void> {
  const dateStr = new Date().toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC",
  });
  const geo = await getGeoInfo(data.ip).catch(() => null);
  const { browser, os, device } = parseUserAgent(data.device);
  const cleanIp = data.ip.replace(/^::ffff:/, "");
  const icon = data.success ? "🏪" : "⚠️";
  const statusLabel = data.success ? "✅ Connexion réussie" : "❌ Tentative échouée";

  const geoFlags: string[] = [];
  if (geo?.isProxy) geoFlags.push("⚠️ *VPN/Proxy/TOR détecté*");

  const msg = [
    `${icon} *Connexion Marchand — WestPay*`,
    ``,
    `🏪 *Marchand :* ${data.merchantName}`,
    `👤 *Email :* \`${data.email}\``,
    `🔐 *Statut :* ${statusLabel}`,
    `🌐 *IP :* \`${cleanIp}\``,
    geo && geo.city !== "Inconnue" ? `📍 *Localisation :* ${geo.city}${geo.country ? ", " + geo.country : ""}` : null,
    `💻 *Navigateur :* ${browser} (${os})`,
    `📱 *Appareil :* ${device}`,
    ...geoFlags,
    `🕒 *Date :* ${dateStr} UTC`,
  ].filter(Boolean).join("\n");

  if (data.success || geo?.isProxy) {
    const buttons = [[
      { text: "✅ Autoriser IP", callback_data: `sec:allow:${cleanIp}` },
      { text: "⛔ Bloquer IP", callback_data: `sec:block:${cleanIp}` },
    ]];
    await alertAdminGroupWithButtons(msg, buttons);
  } else {
    await alertAdminGroup(msg);
  }
}

export async function notifyAdminNewMerchantIp(data: {
  email: string;
  merchantName: string;
  merchantId: number;
  ip: string;
  device: string;
}): Promise<void> {
  const dateStr = new Date().toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC",
  });
  const geo = await getGeoInfo(data.ip).catch(() => null);
  const { browser, os, device } = parseUserAgent(data.device);
  const cleanIp = data.ip.replace(/^::ffff:/, "");

  const geoFlags: string[] = [];
  if (geo?.isProxy) geoFlags.push("⚠️ *VPN/Proxy/TOR détecté*");
  if (geo?.isHosting) geoFlags.push("🖥️ *IP hébergeur / datacenter*");

  const msg = [
    `🆕 *Nouvelle IP — Connexion Marchand*`,
    ``,
    `🏪 *Marchand :* ${data.merchantName}`,
    `👤 *Email :* \`${data.email}\``,
    `🌐 *Nouvelle IP :* \`${cleanIp}\``,
    geo && geo.city !== "Inconnue" ? `📍 *Localisation :* ${geo.city}${geo.country ? ", " + geo.country : ""}` : null,
    geo?.isp ? `🏢 *FAI :* ${geo.isp}` : null,
    `💻 *Navigateur :* ${browser} (${os})`,
    `📱 *Appareil :* ${device}`,
    ...geoFlags,
    `🕒 *Date :* ${dateStr} UTC`,
    ``,
    `⚠️ _Cette IP n'a jamais été utilisée pour ce compte._`,
  ].filter(Boolean).join("\n");

  const buttons = [[
    { text: "✅ IP connue", callback_data: `sec:allow:${cleanIp}` },
    { text: "⛔ Bloquer IP", callback_data: `sec:block:${cleanIp}` },
  ]];
  await alertAdminGroupWithButtons(msg, buttons);
}

export async function notifyAdminIpBlocked(data: {
  ip: string;
  path: string;
  device?: string;
}): Promise<void> {
  const dateStr = new Date().toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC",
  });
  const geo = await getGeoInfo(data.ip).catch(() => null);
  const cleanIp = data.ip.replace(/^::ffff:/, "");

  const msg = [
    `🚫 *Accès refusé — WestPay*`,
    ``,
    `🌐 *IP :* \`${cleanIp}\``,
    geo && geo.city !== "Inconnue" ? `📍 *Localisation :* ${geo.city}${geo.country ? ", " + geo.country : ""}` : null,
    geo?.isp ? `🔌 *FAI :* ${geo.isp}` : null,
    geo?.isProxy ? `⚠️ *VPN/Proxy/TOR détecté*` : null,
    `📂 *Route :* ${data.path}`,
    `🕒 *Date :* ${dateStr} UTC`,
  ].filter(Boolean).join("\n");

  const buttons = [[
    { text: "✅ Autoriser IP", callback_data: `sec:allow:${cleanIp}` },
    { text: "🔍 Info", callback_data: `sec:info:${cleanIp}` },
  ]];
  await alertAdminGroupWithButtons(msg, buttons);
}

export async function notifyAdminBruteForce(data: {
  ip: string;
  email: string;
  attempts: number;
}): Promise<void> {
  const dateStr = new Date().toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC",
  });
  const geo = await getGeoInfo(data.ip).catch(() => null);
  const cleanIp = data.ip.replace(/^::ffff:/, "");

  const msg = [
    `🚨 *Brute Force détecté — WestPay*`,
    ``,
    `🌐 *IP :* \`${cleanIp}\``,
    `👤 *Email ciblé :* \`${data.email}\``,
    `🔢 *Tentatives :* ${data.attempts}`,
    geo && geo.city !== "Inconnue" ? `📍 *Localisation :* ${geo.city}${geo.country ? ", " + geo.country : ""}` : null,
    geo?.isp ? `🔌 *FAI :* ${geo.isp}` : null,
    geo?.isProxy ? `⚠️ *VPN/Proxy/TOR détecté*` : null,
    `⛔ *IP bloquée automatiquement*`,
    `🕒 *Date :* ${dateStr} UTC`,
  ].filter(Boolean).join("\n");

  const buttons = [[
    { text: "✅ Débloquer IP", callback_data: `sec:unblock:${cleanIp}` },
    { text: "🔍 Info", callback_data: `sec:info:${cleanIp}` },
  ]];
  await alertAdminGroupWithButtons(msg, buttons);
}

export async function notifyAdminDeviceBlocked(data: {
  ip: string;
  fingerprint: string;
  path: string;
}): Promise<void> {
  const dateStr = new Date().toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC",
  });
  const cleanIp = data.ip.replace(/^::ffff:/, "");
  const msg = [
    `🖥️ *Appareil bloqué — tentative d'accès — WestPay*`,
    ``,
    `🌐 *IP :* \`${cleanIp}\``,
    `🔑 *Empreinte :* \`${data.fingerprint.substring(0, 16)}…\``,
    `📂 *Route :* ${data.path}`,
    `🕒 *Date :* ${dateStr} UTC`,
  ].join("\n");
  await alertAdminGroup(msg);
}

export async function notifyAdminNewDevice(data: {
  email: string;
  ip: string;
  deviceId: string;
  browser: string;
  os: string;
  country: string;
  city: string;
  deviceDbId: number;
}): Promise<void> {
  const dateStr = new Date().toLocaleString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  const loc = [data.city, data.country].filter(Boolean).join(", ") || "Inconnue";
  const msg = [
    `🆕 *Nouvel appareil détecté — WestPay*`,
    ``,
    `👤 *Compte :* ${data.email}`,
    `🌐 *IP :* \`${data.ip}\``,
    `📍 *Localisation :* ${loc}`,
    `🖥️ *Navigateur :* ${data.browser || "Inconnu"}`,
    `💻 *OS :* ${data.os || "Inconnu"}`,
    `🔑 *Empreinte :* \`${data.deviceId.substring(0, 20)}…\``,
    `🕒 *Date :* ${dateStr} UTC`,
    ``,
    `⚠️ _Connexion depuis un appareil jamais vu. Validez ou bloquez ci-dessous._`,
  ].join("\n");
  await alertAdminGroupWithButtons(msg, [
    [
      { text: "✅ Autoriser", callback_data: `dev:trust:${data.deviceDbId}` },
      { text: "🚫 Bloquer", callback_data: `dev:block:${data.deviceDbId}` },
    ],
  ]);
}

export async function notifyAdminOtp(data: {
  email: string;
  code: string;
  ip: string;
}): Promise<void> {
  const msg = [
    `🔐 *Code 2FA — WestPay Admin*`,
    ``,
    `👤 *Compte :* ${data.email}`,
    `🌐 *IP :* \`${data.ip}\``,
    ``,
    `🔑 *Code OTP :*`,
    ``,
    `\`\`\``,
    `  ${data.code}`,
    `\`\`\``,
    ``,
    `⏱️ _Valide 5 minutes — ne jamais partager ce code._`,
  ].join("\n");
  await alertAdminGroup(msg);
}

export async function notifyAdminVpn(data: {
  email: string;
  ip: string;
  isp: string;
  vpnType: string;
  country: string;
}): Promise<void> {
  const typeLabel: Record<string, string> = { vpn: "🔒 VPN", proxy: "🔄 Proxy", hosting: "☁️ Hébergeur Cloud", tor: "🧅 Tor" };
  const loc = data.country || "Inconnu";
  const msg = [
    `🕵️ *${typeLabel[data.vpnType] || "Connexion suspecte"} détecté — WestPay*`,
    ``,
    `👤 *Compte :* ${data.email}`,
    `🌐 *IP :* \`${data.ip}\``,
    `📍 *Pays :* ${loc}`,
    `🏢 *FAI/Hébergeur :* ${data.isp}`,
    `🔍 *Type :* ${typeLabel[data.vpnType] || data.vpnType}`,
    `🕒 *Date :* ${new Date().toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" })} UTC`,
  ].join("\n");
  await alertAdminGroupWithButtons(msg, [
    [
      { text: "⛔ Bloquer IP", callback_data: `sec:block:${data.ip}` },
      { text: "✅ Ignorer", callback_data: "sec:noop" },
    ],
  ]);
}

export async function notifyAdminCountryBlocked(data: {
  ip: string;
  country: string;
  email?: string;
}): Promise<void> {
  const msg = [
    `🌍 *Pays bloqué — Accès refusé — WestPay*`,
    ``,
    ...(data.email ? [`👤 *Email tenté :* ${data.email}`] : []),
    `🌐 *IP :* \`${data.ip}\``,
    `📍 *Pays :* ${data.country}`,
    `🕒 *Date :* ${new Date().toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" })} UTC`,
  ].join("\n");
  await alertAdminGroup(msg);
}

export async function notifyAdminLocationJump(data: {
  email: string;
  fromCountry: string;
  toCountry: string;
  fromCity: string;
  toCity: string;
  minutesApart: number;
}): Promise<void> {
  const msg = [
    `🚨 *Saut de localisation suspect — WestPay*`,
    ``,
    `👤 *Compte :* ${data.email}`,
    `📍 *De :* ${[data.fromCity, data.fromCountry].filter(Boolean).join(", ")}`,
    `📍 *Vers :* ${[data.toCity, data.toCountry].filter(Boolean).join(", ")}`,
    `⏱️ *Délai :* ${data.minutesApart} minute(s)`,
    ``,
    `⚠️ _Connexion impossible à cette vitesse géographiquement — session suspendue._`,
  ].join("\n");
  await alertAdminGroupWithButtons(msg, [
    [
      { text: "✅ Valider session", callback_data: "sec:noop" },
      { text: "⛔ Bloquer IP", callback_data: "sec:noop" },
    ],
  ]);
}

async function sendDailyReport(): Promise<void> {
  const groupId = await storage.getSetting("telegram_group_id");
  if (!groupId || !bot) return;

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const dayStart = new Date(yesterday); dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(yesterday); dayEnd.setUTCHours(23, 59, 59, 999);

  // transactions, withdrawals, security_logs → base financière
  // blocked_ips → base auth (pool)
  const [txRow] = await financialPool.query(
    `SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS total_payments,
            COUNT(*) AS total_count
     FROM transactions WHERE created_at >= $1 AND created_at <= $2 AND status = 'confirmed'`,
    [dayStart.toISOString(), dayEnd.toISOString()]
  ).then(r => r.rows);

  const [wdRow] = await financialPool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total_withdrawals,
            COALESCE(SUM(fees), 0) AS total_fees,
            COUNT(*) AS wd_count
     FROM withdrawals WHERE processed_at >= $1 AND processed_at <= $2 AND status = 'approved'`,
    [dayStart.toISOString(), dayEnd.toISOString()]
  ).then(r => r.rows);

  // ── Statistiques sécurité / bots du jour ────────────────────────────────
  const [secRow] = await financialPool.query(
    `SELECT
       COUNT(*) FILTER (WHERE event_type = 'bot_blocked') AS bots_blocked,
       COUNT(*) FILTER (WHERE event_type = 'brute_force') AS brute_force,
       COUNT(*) FILTER (WHERE event_type = 'bad_origin') AS bad_origin,
       COUNT(*) FILTER (WHERE event_type = 'rate_limit') AS rate_limited,
       COUNT(*) FILTER (WHERE event_type = 'new_ip_login') AS new_ip_logins,
       COUNT(DISTINCT ip) FILTER (WHERE event_type IN ('bot_blocked','brute_force','bad_origin','rate_limit')) AS unique_attacker_ips
     FROM security_logs WHERE created_at >= $1 AND created_at <= $2`,
    [dayStart.toISOString(), dayEnd.toISOString()]
  ).then(r => r.rows).catch(() => [{ bots_blocked: 0, brute_force: 0, bad_origin: 0, rate_limited: 0, new_ip_logins: 0, unique_attacker_ips: 0 }]);

  const [blockedRow] = await pool.query(
    `SELECT COUNT(*) AS new_blocked FROM blocked_ips WHERE created_at >= $1 AND created_at <= $2`,
    [dayStart.toISOString(), dayEnd.toISOString()]
  ).then(r => r.rows).catch(() => [{ new_blocked: 0 }]);

  const dateLabel = yesterday.toLocaleDateString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "UTC",
  });

  const totalPay = Number(txRow.total_payments);
  const totalWd = Number(wdRow.total_withdrawals);
  const totalFees = Number(wdRow.total_fees);
  const txCount = Number(txRow.total_count) + Number(wdRow.wd_count);

  const botsBlocked = Number(secRow?.bots_blocked || 0);
  const bruteForce = Number(secRow?.brute_force || 0);
  const badOrigin = Number(secRow?.bad_origin || 0);
  const rateLimited = Number(secRow?.rate_limited || 0);
  const newIpLogins = Number(secRow?.new_ip_logins || 0);
  const uniqueAttackers = Number(secRow?.unique_attacker_ips || 0);
  const newBlocked = Number(blockedRow?.new_blocked || 0);
  const totalThreats = botsBlocked + bruteForce + badOrigin + rateLimited;

  const secLines = (totalThreats > 0 || newIpLogins > 0) ? [
    ``,
    `🔐 *Sécurité & Bots*`,
    botsBlocked > 0 ? `🤖 Bots bloqués : *${botsBlocked.toLocaleString("fr-FR")}*` : null,
    bruteForce > 0 ? `🔨 Brute-force : *${bruteForce.toLocaleString("fr-FR")}*` : null,
    badOrigin > 0 ? `🌐 Origines invalides : *${badOrigin.toLocaleString("fr-FR")}*` : null,
    rateLimited > 0 ? `⏱️ Rate-limités : *${rateLimited.toLocaleString("fr-FR")}*` : null,
    newIpLogins > 0 ? `🆕 Connexions depuis nouvelle IP : *${newIpLogins.toLocaleString("fr-FR")}*` : null,
    uniqueAttackers > 0 ? `🕵️ IPs attaquantes uniques : *${uniqueAttackers.toLocaleString("fr-FR")}*` : null,
    newBlocked > 0 ? `⛔ Nouvelles IPs bloquées : *${newBlocked.toLocaleString("fr-FR")}*` : null,
  ].filter(Boolean) : [``, `🔐 *Sécurité :* ✅ Aucune menace détectée`];

  const msg = [
    `📊 *Rapport journalier WestPay*`,
    ``,
    `📅 *Date :* ${dateLabel}`,
    ``,
    `💰 *Total paiements :* ${formatAmount(totalPay)}`,
    `💸 *Total retraits :* ${formatAmount(totalWd)}`,
    `💵 *Frais collectés :* ${formatAmount(totalFees)}`,
    `📋 *Nombre de transactions :* ${txCount.toLocaleString("fr-FR")}`,
    `📈 *Volume total traité :* ${formatAmount(totalPay + totalWd)}`,
    ...secLines,
  ].join("\n");

  await safeSend(groupId, msg);
  console.log("[TELEGRAM] Rapport journalier envoyé");
}

function scheduleDailyReport(): void {
  const scheduleNext = () => {
    const now = new Date();
    const next = new Date();
    next.setUTCHours(1, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    const delay = next.getTime() - now.getTime();
    setTimeout(async () => {
      try { await sendDailyReport(); } catch (e) {
        console.error("[TELEGRAM] Erreur rapport journalier:", (e as any).message);
      }
      scheduleNext();
    }, delay);
  };
  scheduleNext();
  const h = Math.round((new Date(new Date().setUTCHours(1,0,0,0)).getTime() - Date.now()) / 3600000);
  console.log(`[TELEGRAM] Rapport journalier programme (dans ~${h < 0 ? 24 + h : h}h)`);
}

export async function getBotWebhookInfo(): Promise<{
  hasToken: boolean;
  running: boolean;
  username: string | null;
  webhookUrl: string | null;
  webhookPendingCount: number;
  webhookLastError: string | null;
  hasAdminGroup: boolean;
}> {
  const tokenEnv = process.env.TELEGRAM_BOT_TOKEN;
  const tokenDb = await storage.getSetting("telegram_bot_token").catch(() => null);
  const hasToken = !!(tokenEnv || tokenDb);
  const groupId = await storage.getSetting("telegram_group_id").catch(() => null);
  if (!bot) {
    return { hasToken, running: false, username: null, webhookUrl: null, webhookPendingCount: 0, webhookLastError: null, hasAdminGroup: !!groupId };
  }
  try {
    const [me, webhookInfo] = await Promise.all([
      bot.telegram.getMe(),
      bot.telegram.getWebhookInfo(),
    ]);
    return {
      hasToken,
      running: true,
      username: me.username || null,
      webhookUrl: webhookInfo.url || null,
      webhookPendingCount: webhookInfo.pending_update_count || 0,
      webhookLastError: (webhookInfo as any).last_error_message || null,
      hasAdminGroup: !!groupId,
    };
  } catch (err: any) {
    return { hasToken, running: false, username: null, webhookUrl: null, webhookPendingCount: 0, webhookLastError: err.message, hasAdminGroup: !!groupId };
  }
}

export function getBot(): Telegraf | null {
  return bot;
}

export async function initTelegramBotFromDb(): Promise<Telegraf | null> {
  const tokenEnv = process.env.TELEGRAM_BOT_TOKEN;
  if (tokenEnv) return initTelegramBot(tokenEnv);
  try {
    const tokenDb = await storage.getSetting("telegram_bot_token");
    if (tokenDb) {
      console.log("[TELEGRAM] Token chargé depuis la base de données");
      return initTelegramBot(tokenDb);
    }
  } catch {}
  return initTelegramBot();
}

export async function reloadMainBot(newToken: string): Promise<{ ok: boolean; error?: string; username?: string }> {
  try {
    // Valider le nouveau token avant d'arrêter le bot actuel ou de l'enregistrer.
    // Sinon une faute de frappe peut à la fois couper le bot actif et persister
    // un token invalide qui cassera le prochain redémarrage.
    const candidateBot = new Telegraf(newToken);
    const me = await candidateBot.telegram.getMe();

    if (bot) {
      try { bot.stop("reload"); } catch {}
      bot = null;
    }
    if (_pollingRecoveryTimer) clearTimeout(_pollingRecoveryTimer);
    _pollingRecoveryTimer = null;
    _pollingActive = false;
    stopWebhookWatchdog();
    await storage.setSetting("telegram_bot_token", newToken);
    const newBot = initTelegramBot(newToken);
    if (!newBot) return { ok: false, error: "Impossible d'initialiser le bot" };

    const isProductionEnv = process.env.NODE_ENV === "production" ||
      (!process.env.REPLIT_DEV_DOMAIN && !!process.env.APP_URL);

    if (isProductionEnv) {
      // Le webhook est lié au token du bot Telegram. Après un changement de
      // token, le webhook de l'ancien bot ne peut pas servir au nouveau bot.
      // La route Express est déjà enregistrée lorsque cette action admin est
      // disponible, il suffit donc de publier le webhook pour le nouveau token.
      let webhookSecret = await storage.getSetting("telegram_webhook_secret");
      if (!webhookSecret) {
        const { randomBytes } = await import("crypto");
        webhookSecret = randomBytes(24).toString("hex");
        await storage.setSetting("telegram_webhook_secret", webhookSecret);
      }
      const appUrl = (process.env.APP_URL || "https://westpay.cfd").trim().replace(/\/+$/, "");
      const webhookUrl = `${appUrl}/api/telegram/webhook/${webhookSecret}`;
      await registerWebhookUrl(webhookUrl);
      startWebhookWatchdog(webhookUrl);

      const webhookInfo = await newBot.telegram.getWebhookInfo();
      if (webhookInfo.url !== webhookUrl) {
        return {
          ok: false,
          username: me.username,
          error: "Bot validé, mais le webhook Telegram n'a pas pu être configuré",
        };
      }
    } else {
      startPolling();
    }
    return { ok: true, username: me.username };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

const OTP_TRANSLATIONS: Record<string, { title: string; merchant: string; otpLabel: string; validity: string; warning: string }> = {
  fr: { title: "RobotPay — Code de connexion", merchant: "Marchand", otpLabel: "Votre code OTP :", validity: "Valide 5 minutes — usage unique.", warning: "Ne communiquez jamais ce code." },
  en: { title: "RobotPay — Login code", merchant: "Merchant", otpLabel: "Your OTP code:", validity: "Valid 5 minutes — single use.", warning: "Never share this code." },
  zh: { title: "RobotPay — 登录验证码", merchant: "商户", otpLabel: "您的 OTP 验证码：", validity: "有效期 5 分钟 — 仅限一次使用。", warning: "请勿向任何人透露此验证码。" },
  de: { title: "RobotPay — Anmeldecode", merchant: "Händler", otpLabel: "Ihr OTP-Code:", validity: "Gültig 5 Minuten — Einmalverwendung.", warning: "Geben Sie diesen Code niemals weiter." },
  hi: { title: "RobotPay — लॉगिन कोड", merchant: "व्यापारी", otpLabel: "आपका OTP कोड:", validity: "5 मिनट के लिए मान्य — एकल उपयोग।", warning: "यह कोड कभी किसी को न बताएँ।" },
};

export async function sendMerchantOtpTelegram(chatId: string, otp: string, merchantName: string, lang = "fr"): Promise<boolean> {
  if (!bot) {
    console.log(`[TELEGRAM OTP] Bot non initialisé — OTP pour ${chatId}: ${otp}`);
    return false;
  }
  const tr = OTP_TRANSLATIONS[lang] || OTP_TRANSLATIONS["fr"];
  const msg = [
    `🤖 *${tr.title}*`,
    ``,
    `👤 *${tr.merchant} :* ${merchantName}`,
    ``,
    `🔑 *${tr.otpLabel}*`,
    ``,
    `\`\`\``,
    `  ${otp}`,
    `\`\`\``,
    ``,
    `⏱️ _${tr.validity}_`,
    `🔒 _${tr.warning}_`,
  ].join("\n");
  try {
    await safeSend(chatId, msg);
    return true;
  } catch (err: any) {
    console.error("[TELEGRAM OTP] Échec envoi:", err.message);
    return false;
  }
}
