import { Telegraf } from "telegraf";
import type { Express, Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { pool, financialPool } from "./db";
import {
  MERCHANT_ACTIVATABLE_COUNTRIES,
  canonicalMerchantCountryName,
  MERCHANT_CATEGORIES,
  isMerchantCategory,
  isMerchantSettlementCycle,
} from "@shared/merchant-account";
import {
  generateSecureApiKey,
  verifyEmailDomainHasMx,
} from "./merchant-admin-utils";
import {
  reviewPendingPayment,
  reviewTransactionPayment,
  getPaymentReviewRecord,
  searchPaymentsByNumber,
} from "./manual-payment-service";
import {
  checkPaymentProviderStatus,
  supportsPaymentProviderStatus,
} from "./payment-provider-status";
import { getPaymentReviewActions } from "./payment-review-rules";
import {
  getPaymentReversalRecord,
  resolveOriginalMerchantCredit,
  reverseConfirmedPayment,
  searchReversiblePayments,
  type PaymentReversalRecord,
} from "./payment-reversal-service";
import { notifyConfirmedPaymentWebhook } from "./merchant-webhooks";
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
  seapayBalance,
} from "./seapay";
import {
  clapayGetBalance,
  clapayInitiatePayout,
  clapayCountryCode,
  clapayGetTransactionStatus,
} from "./clapay";
import {
  initiateLipaPapPayout,
  getLipaPapPayoutStatus,
  lipapapCurrency,
  lipapapPayoutProviderCode,
  type LipaPapConfig,
} from "./lipapap";
import {
  getDrimpayConfig,
  initiateDrimpayPayout,
  getDrimpayPayoutStatus,
  normalizeDrimpayStatus,
  resolveDrimpayRoute,
  DrimpayApiError,
} from "./drimpay";
import {
  WESTPAY_PAYOUT_BENEFICIARY,
} from "./payout-constants";
import {
  cancelOperatorPaymentSession,
  registerOperatorPaymentCommand,
} from "./telegram-operator-payment-command";

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

function paymentReversalMerchantNotice(
  language: BotLanguage,
  payment: PaymentReversalRecord,
  creditedAmount: number,
): string {
  const reference = payment.provider_reference || payment.provider_tx_id || payment.tx_id;
  const customer = (payment.payer_name || "N/A").replace(/[\r\n]+/g, " ").slice(0, 120);
  const phone = (payment.payer_number || "N/A").replace(/[\r\n]+/g, " ").slice(0, 80);
  const details = {
    fr: {
      title: "⚠️ PAIEMENT ANNULÉ",
      notice: "Le paiement a été annulé à la demande du client. Le crédit correspondant a été retiré de votre solde marchand.",
      name: "Client",
      phone: "Numéro",
      ref: "Référence",
      paid: "Montant payé",
      debit: "Montant débité de votre solde",
      action: "Veuillez débiter le compte du client sur votre propre site web pour régulariser cette annulation.",
    },
    en: {
      title: "⚠️ PAYMENT REVERSED",
      notice: "The payment was reversed at the customer's request. The corresponding credit has been removed from your merchant balance.",
      name: "Customer",
      phone: "Phone",
      ref: "Reference",
      paid: "Amount paid",
      debit: "Amount deducted from your balance",
      action: "Please debit the customer's account on your own website to reflect this reversal.",
    },
    de: {
      title: "⚠️ ZAHLUNG STORNIERT",
      notice: "Die Zahlung wurde auf Wunsch des Kunden storniert. Die entsprechende Gutschrift wurde von Ihrem Händlerguthaben abgezogen.",
      name: "Kunde",
      phone: "Telefon",
      ref: "Referenz",
      paid: "Gezahlter Betrag",
      debit: "Von Ihrem Guthaben abgezogen",
      action: "Bitte belasten Sie das Kundenkonto auf Ihrer eigenen Website entsprechend dieser Stornierung.",
    },
    zh: {
      title: "⚠️ 支付已撤销",
      notice: "应客户要求，支付已撤销，相应金额已从您的商户余额中扣除。",
      name: "客户",
      phone: "电话",
      ref: "参考号",
      paid: "支付金额",
      debit: "从商户余额扣除",
      action: "请在您自己的网站上扣减客户账户，以完成本次撤销处理。",
    },
    hi: {
      title: "⚠️ भुगतान रद्द किया गया",
      notice: "ग्राहक के अनुरोध पर भुगतान रद्द किया गया है। संबंधित क्रेडिट आपकी व्यापारी शेष राशि से हटा दिया गया है।",
      name: "ग्राहक",
      phone: "फोन",
      ref: "संदर्भ",
      paid: "भुगतान राशि",
      debit: "आपकी शेष राशि से काटी गई राशि",
      action: "इस रद्दीकरण को दर्ज करने के लिए कृपया अपनी वेबसाइट पर ग्राहक के खाते से राशि काटें।",
    },
  }[language];

  return [
    details.title,
    "",
    details.notice,
    "",
    `${details.name}: ${customer}`,
    `${details.phone}: ${phone}`,
    `${details.ref}: ${String(reference || "N/A").replace(/[\r\n]+/g, " ").slice(0, 140)}`,
    `${details.paid}: ${formatAmountC(payment.amount, payment.country)}`,
    `${details.debit}: ${formatAmountC(creditedAmount, payment.country)}`,
    `Pays: ${countryLabel(payment.country)}`,
    "",
    details.action,
  ].join("\n");
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

// ─── Session /findwithdrawal ────────────────────────────────────────────────
interface CommanderSession {
  step: "waiting_phone";
}
const commanderSessions = new Map<string, CommanderSession>();

// ─── Sessions /disablepayments et /enablepayments ───────────────────────────
interface MerchantPaymentToggleSession {
  step: "waiting_slug";
  action: "disable" | "enable";
}
const merchantPaymentToggleSessions = new Map<string, MerchantPaymentToggleSession>();

interface OperatorMaintenanceSession {
  step: "country" | "operator" | "action";
  flow: "payin" | "payout";
  operators: Array<{ id: number; name: string; country: string }>;
  countries: string[];
  country?: string | null;
  targets?: Array<{ id: number; name: string; country: string }>;
}
const operatorMaintenanceSessions = new Map<string, OperatorMaintenanceSession>();

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

async function getTelegramLipaPapConfig(): Promise<LipaPapConfig | undefined> {
  const [clientKey, secretKey, paymentUrl, environment, payerEmail, payoutCodesJson] = await Promise.all([
    storage.getSetting("lipapap_client_key").then(value => value || process.env.LIPAPAP_CLIENT_KEY),
    storage.getSetting("lipapap_secret_key").then(value => value || process.env.LIPAPAP_SECRET_KEY),
    storage.getSetting("lipapap_payment_url").then(value => value || process.env.LIPAPAP_PAYMENT_URL),
    storage.getSetting("lipapap_environment"),
    storage.getSetting("lipapap_payer_email").then(value => value || process.env.LIPAPAP_PAYER_EMAIL),
    storage.getSetting("lipapap_payout_codes"),
  ]);
  if (!clientKey || !secretKey || !paymentUrl) return undefined;

  let payoutProviderCodes: Record<string, Record<string, string>> = {};
  if (payoutCodesJson) {
    try {
      const parsed = JSON.parse(payoutCodesJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
      payoutProviderCodes = Object.fromEntries(
        Object.entries(parsed).map(([country, operators]) => [
          country,
          Object.fromEntries(
            Object.entries(operators as Record<string, unknown>)
              .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim() !== "")
              .map(([operator, code]) => [operator.toLowerCase().replace(/[\s\-_]+/g, ""), code.trim()]),
          ),
        ]),
      );
    } catch {
      return undefined;
    }
  }

  return {
    clientKey,
    secretKey,
    paymentUrl,
    environment: environment === "production" ? "production" : "sandbox",
    action: "MOMO",
    networkIds: {},
    payoutProviderCodes,
    payerEmail: payerEmail || undefined,
  };
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

type BotLanguage = "fr" | "en" | "zh" | "de" | "hi";

const BOT_DATE_LOCALES: Record<BotLanguage, string> = {
  fr: "fr-FR",
  en: "en-GB",
  zh: "zh-CN",
  de: "de-DE",
  hi: "hi-IN",
};

type MerchantBotText = {
  helpMessage: (name: string) => string;
  alreadyLinked: (name: string) => string;
  linkedWelcome: (name: string) => string;
  groupLinked: (name: string, email: string, help: string) => string;
  groupActive: (name: string, help: string) => string;
  groupAdded: (groupTitle: string) => string;
  stats: (name: string, transactions: number, volume: string) => string;
  balances: (name: string, details: string) => string;
  transactionsTitle: (name: string, personal: boolean) => string;
  noTransactions: string;
  suspended: string;
  suspendedContact: string;
  genericError: string;
  ipUsage: string;
  ipProcessing: string;
  ipDone: string;
  ipDenied: string;
  ipError: string;
};

const BOT_TEXTS: Record<BotLanguage, MerchantBotText> = {
  fr: {
    helpMessage: (name) =>
      `📖 *Commandes disponibles — ${name}*\n\n` +
      `💰 /balance — Solde détaillé par pays\n` +
      `📋 /transactions — Les 5 dernières transactions\n` +
      `📊 /stats — Vos statistiques globales\n` +
      `🌐 /addip ADRESSE\\_IP — Ajouter une IP à la whitelist\n` +
      `❓ /help — Afficher cette aide\n\n` +
      `📲 *Notifications automatiques*\nChaque paiement confirmé est affiché ici en temps réel.\n\n` +
      `💡 *Astuce IP :* Si le bot ne répond pas quand vous envoyez une IP en texte, utilisez \`/addip 1.2.3.4\`.`,
    alreadyLinked: (name) => `✅ Votre compte *${name}* est déjà lié.\n\nTapez /help pour voir vos commandes.`,
    linkedWelcome: (name) => `✅ *Compte lié avec succès !*\n\nBienvenue, *${name}* 👋\n\nVous recevrez désormais vos notifications de paiement ici.\n\nTapez /help pour voir vos commandes.`,
    groupLinked: (name, email, help) => `✅ *Groupe lié au marchand !*\n\n🏪 Marchand : *${name}*\n📧 ${email}\n\n${help}`,
    groupActive: (name, help) => `✅ *Bot WestPay actif — ${name}*\n\n${help}`,
    groupAdded: (groupTitle) => `👋 *Bot WestPay ajouté à ${groupTitle}.*\n\nPour lier ce groupe à un compte marchand :\n\n\`/setmerchant CODE\`\n\n_(Demandez le code de liaison à l'administrateur WestPay)_`,
    stats: (name, transactions, volume) => `📊 *Vos statistiques — ${name}*\n\n💳 Transactions : *${transactions}*\n💰 Volume total : *${volume}*`,
    balances: (name, details) => `💰 *Soldes — ${name}*\n\n${details}`,
    transactionsTitle: (name, personal) => personal ? `📋 *Vos 5 dernières transactions*` : `📋 *5 dernières transactions — ${name}*`,
    noTransactions: "Aucune transaction enregistrée.",
    suspended: "⚠️ Compte suspendu.",
    suspendedContact: "⚠️ Compte suspendu. Contactez votre administrateur.",
    genericError: "❌ Erreur.",
    ipUsage: "❌ Usage : `/addip ADRESSE_IP`\n\nExemple : `/addip 41.207.187.10` ou `/addip 2409:4053:59e:9bec::1`",
    ipProcessing: "⏳ Ajout de l’adresse IP en cours...",
    ipDone: "✅ Adresse IP ajoutée à la liste blanche.",
    ipDenied: "❌ Cette adresse IP ne peut pas être autorisée.",
    ipError: "❌ Erreur lors de l'ajout. Contactez l'administrateur.",
  },
  en: {
    helpMessage: (name) =>
      `📖 *Available commands — ${name}*\n\n` +
      `💰 /balance — Detailed balance by country\n` +
      `📋 /transactions — Your 5 latest transactions\n` +
      `📊 /stats — Your overall statistics\n` +
      `🌐 /addip IP\\_ADDRESS — Add an IP to the whitelist\n` +
      `❓ /help — Show this help\n\n` +
      `📲 *Automatic notifications*\nEvery confirmed payment appears here in real time.\n\n` +
      `💡 *IP tip:* If the bot does not answer when you send an IP as text, use \`/addip 1.2.3.4\`.`,
    alreadyLinked: (name) => `✅ Your *${name}* account is already linked.\n\nType /help to see your commands.`,
    linkedWelcome: (name) => `✅ *Account linked successfully!*\n\nWelcome, *${name}* 👋\n\nYou will now receive your payment notifications here.\n\nType /help to see your commands.`,
    groupLinked: (name, email, help) => `✅ *Group linked to the merchant!*\n\n🏪 Merchant: *${name}*\n📧 ${email}\n\n${help}`,
    groupActive: (name, help) => `✅ *WestPay bot active — ${name}*\n\n${help}`,
    groupAdded: (groupTitle) => `👋 *WestPay bot added to ${groupTitle}.*\n\nTo link this group to a merchant account:\n\n\`/setmerchant CODE\`\n\n_(Ask your WestPay administrator for the linking code)_`,
    stats: (name, transactions, volume) => `📊 *Your statistics — ${name}*\n\n💳 Transactions: *${transactions}*\n💰 Total volume: *${volume}*`,
    balances: (name, details) => `💰 *Balances — ${name}*\n\n${details}`,
    transactionsTitle: (name, personal) => personal ? `📋 *Your 5 latest transactions*` : `📋 *5 latest transactions — ${name}*`,
    noTransactions: "No transactions recorded.",
    suspended: "⚠️ Account suspended.",
    suspendedContact: "⚠️ Account suspended. Contact your administrator.",
    genericError: "❌ Error.",
    ipUsage: "❌ Usage: `/addip IP_ADDRESS`\n\nExample: `/addip 41.207.187.10` or `/addip 2409:4053:59e:9bec::1`",
    ipProcessing: "⏳ Adding the IP address...",
    ipDone: "✅ IP address added to the whitelist.",
    ipDenied: "❌ This IP address cannot be authorized.",
    ipError: "❌ Error while adding the IP address. Contact the administrator.",
  },
  zh: {
    helpMessage: (name) =>
      `📖 *可用命令 — ${name}*\n\n` +
      `💰 /balance — 查看各国详细余额\n` +
      `📋 /transactions — 查看最近 5 笔交易\n` +
      `📊 /stats — 查看总体统计\n` +
      `🌐 /addip IP\\_地址 — 将 IP 加入白名单\n` +
      `❓ /help — 显示帮助\n\n` +
      `📲 *自动通知*\n每笔已确认的付款都会实时显示在这里。\n\n` +
      `💡 *IP 提示：* 如果直接发送 IP 没有响应，请使用 \`/addip 1.2.3.4\`。`,
    alreadyLinked: (name) => `✅ 您的 *${name}* 账户已经绑定。\n\n输入 /help 查看可用命令。`,
    linkedWelcome: (name) => `✅ *账户绑定成功！*\n\n欢迎，*${name}* 👋\n\n您现在将在这里收到付款通知。\n\n输入 /help 查看可用命令。`,
    groupLinked: (name, email, help) => `✅ *群组已与商户绑定！*\n\n🏪 商户：*${name}*\n📧 ${email}\n\n${help}`,
    groupActive: (name, help) => `✅ *WestPay 机器人已启用 — ${name}*\n\n${help}`,
    groupAdded: (groupTitle) => `👋 *WestPay 机器人已添加到 ${groupTitle}。*\n\n要将此群组绑定到商户账户：\n\n\`/setmerchant CODE\`\n\n_(请向 WestPay 管理员索取绑定码)_`,
    stats: (name, transactions, volume) => `📊 *您的统计 — ${name}*\n\n💳 交易数：*${transactions}*\n💰 总交易量：*${volume}*`,
    balances: (name, details) => `💰 *余额 — ${name}*\n\n${details}`,
    transactionsTitle: (name, personal) => personal ? `📋 *最近 5 笔交易*` : `📋 *最近 5 笔交易 — ${name}*`,
    noTransactions: "暂无交易记录。",
    suspended: "⚠️ 账户已暂停。",
    suspendedContact: "⚠️ 账户已暂停。请联系管理员。",
    genericError: "❌ 出错了。",
    ipUsage: "❌ 用法：`/addip IP地址`\n\n示例：`/addip 41.207.187.10` 或 `/addip 2409:4053:59e:9bec::1`",
    ipProcessing: "⏳ 正在添加 IP 地址...",
    ipDone: "✅ IP 地址已加入白名单。",
    ipDenied: "❌ 此 IP 地址无法授权。",
    ipError: "❌ 添加 IP 时出错。请联系管理员。",
  },
  de: {
    helpMessage: (name) =>
      `📖 *Verfügbare Befehle — ${name}*\n\n` +
      `💰 /balance — Detaillierter Kontostand nach Land\n` +
      `📋 /transactions — Die letzten 5 Transaktionen\n` +
      `📊 /stats — Ihre Gesamtstatistik\n` +
      `🌐 /addip IP\\_ADRESSE — Eine IP zur Whitelist hinzufügen\n` +
      `❓ /help — Diese Hilfe anzeigen\n\n` +
      `📲 *Automatische Benachrichtigungen*\nJede bestätigte Zahlung wird hier in Echtzeit angezeigt.\n\n` +
      `💡 *IP-Tipp:* Wenn der Bot auf eine IP als Text nicht antwortet, verwenden Sie \`/addip 1.2.3.4\`.`,
    alreadyLinked: (name) => `✅ Ihr Konto *${name}* ist bereits verknüpft.\n\nGeben Sie /help ein, um Ihre Befehle zu sehen.`,
    linkedWelcome: (name) => `✅ *Konto erfolgreich verknüpft!*\n\nWillkommen, *${name}* 👋\n\nSie erhalten Ihre Zahlungsbenachrichtigungen ab jetzt hier.\n\nGeben Sie /help ein, um Ihre Befehle zu sehen.`,
    groupLinked: (name, email, help) => `✅ *Gruppe mit dem Händler verknüpft!*\n\n🏪 Händler: *${name}*\n📧 ${email}\n\n${help}`,
    groupActive: (name, help) => `✅ *WestPay-Bot aktiv — ${name}*\n\n${help}`,
    groupAdded: (groupTitle) => `👋 *WestPay-Bot zu ${groupTitle} hinzugefügt.*\n\nUm diese Gruppe mit einem Händlerkonto zu verknüpfen:\n\n\`/setmerchant CODE\`\n\n_(Den Verbindungscode erhalten Sie vom WestPay-Administrator)_`,
    stats: (name, transactions, volume) => `📊 *Ihre Statistik — ${name}*\n\n💳 Transaktionen: *${transactions}*\n💰 Gesamtvolumen: *${volume}*`,
    balances: (name, details) => `💰 *Kontostände — ${name}*\n\n${details}`,
    transactionsTitle: (name, personal) => personal ? `📋 *Ihre letzten 5 Transaktionen*` : `📋 *Die letzten 5 Transaktionen — ${name}*`,
    noTransactions: "Keine Transaktionen vorhanden.",
    suspended: "⚠️ Konto gesperrt.",
    suspendedContact: "⚠️ Konto gesperrt. Kontaktieren Sie Ihren Administrator.",
    genericError: "❌ Fehler.",
    ipUsage: "❌ Verwendung: `/addip IP_ADRESSE`\n\nBeispiel: `/addip 41.207.187.10` oder `/addip 2409:4053:59e:9bec::1`",
    ipProcessing: "⏳ IP-Adresse wird hinzugefügt...",
    ipDone: "✅ IP-Adresse zur Whitelist hinzugefügt.",
    ipDenied: "❌ Diese IP-Adresse kann nicht autorisiert werden.",
    ipError: "❌ Fehler beim Hinzufügen. Kontaktieren Sie den Administrator.",
  },
  hi: {
    helpMessage: (name) =>
      `📖 *उपलब्ध कमांड — ${name}*\n\n` +
      `💰 /balance — देश के अनुसार विस्तृत बैलेंस\n` +
      `📋 /transactions — पिछली 5 लेन-देन\n` +
      `📊 /stats — आपके कुल आँकड़े\n` +
      `🌐 /addip IP\\_ADDRESS — IP को whitelist में जोड़ें\n` +
      `❓ /help — सहायता दिखाएँ\n\n` +
      `📲 *स्वचालित सूचनाएँ*\nहर पुष्टि किया गया भुगतान यहाँ तुरंत दिखाई देगा।\n\n` +
      `💡 *IP सुझाव:* यदि IP को टेक्स्ट के रूप में भेजने पर जवाब न मिले, तो \`/addip 1.2.3.4\` का उपयोग करें।`,
    alreadyLinked: (name) => `✅ आपका *${name}* खाता पहले से जुड़ा है।\n\nअपने कमांड देखने के लिए /help लिखें।`,
    linkedWelcome: (name) => `✅ *खाता सफलतापूर्वक जुड़ गया!*\n\nस्वागत है, *${name}* 👋\n\nअब आपको भुगतान सूचनाएँ यहाँ मिलेंगी।\n\nअपने कमांड देखने के लिए /help लिखें।`,
    groupLinked: (name, email, help) => `✅ *समूह व्यापारी से जुड़ गया!*\n\n🏪 व्यापारी: *${name}*\n📧 ${email}\n\n${help}`,
    groupActive: (name, help) => `✅ *WestPay बॉट सक्रिय — ${name}*\n\n${help}`,
    groupAdded: (groupTitle) => `👋 *WestPay बॉट ${groupTitle} में जोड़ा गया।*\n\nइस समूह को व्यापारी खाते से जोड़ने के लिए:\n\n\`/setmerchant CODE\`\n\n_(लिंक कोड के लिए WestPay व्यवस्थापक से पूछें)_`,
    stats: (name, transactions, volume) => `📊 *आपके आँकड़े — ${name}*\n\n💳 लेन-देन: *${transactions}*\n💰 कुल मात्रा: *${volume}*`,
    balances: (name, details) => `💰 *बैलेंस — ${name}*\n\n${details}`,
    transactionsTitle: (name, personal) => personal ? `📋 *आपके पिछले 5 लेन-देन*` : `📋 *पिछले 5 लेन-देन — ${name}*`,
    noTransactions: "कोई लेन-देन दर्ज नहीं है।",
    suspended: "⚠️ खाता निलंबित है।",
    suspendedContact: "⚠️ खाता निलंबित है। अपने व्यवस्थापक से संपर्क करें।",
    genericError: "❌ त्रुटि।",
    ipUsage: "❌ उपयोग: `/addip IP_ADDRESS`\n\nउदाहरण: `/addip 41.207.187.10` या `/addip 2409:4053:59e:9bec::1`",
    ipProcessing: "⏳ IP पता जोड़ा जा रहा है...",
    ipDone: "✅ IP पता whitelist में जोड़ दिया गया है।",
    ipDenied: "❌ इस IP पते को अधिकृत नहीं किया जा सकता।",
    ipError: "❌ IP जोड़ते समय त्रुटि हुई। व्यवस्थापक से संपर्क करें।",
  },
};

function normalizeBotLanguage(language: unknown): BotLanguage {
  return language === "en" || language === "zh" || language === "de" || language === "hi" ? language : "fr";
}

function merchantBotText(language: unknown): MerchantBotText {
  return BOT_TEXTS[normalizeBotLanguage(language)];
}

function merchantHelpMessage(name: string, language?: unknown): string {
  return merchantBotText(language).helpMessage(name);
}

const MERCHANT_BALANCE_LABELS: Record<BotLanguage, {
  noActive: (name: string) => string;
  country: string;
  key: string;
  accountBalance: string;
  payoutBalance: string;
  successfulDeposits: string;
  successRate: string;
}> = {
  fr: {
    noActive: (name) => `_Aucun pays actif pour ${name}_`,
    country: "Pays",
    key: "Clé",
    accountBalance: "Solde compte",
    payoutBalance: "Solde reversement",
    successfulDeposits: "Dépôts réussis aujourd'hui",
    successRate: "Taux de réussite aujourd'hui",
  },
  en: {
    noActive: (name) => `_No active country for ${name}_`,
    country: "Country",
    key: "Key",
    accountBalance: "Account balance",
    payoutBalance: "Payout balance",
    successfulDeposits: "Successful deposits today",
    successRate: "Success rate today",
  },
  zh: {
    noActive: (name) => `_${name} 没有启用的国家_`,
    country: "国家",
    key: "密钥",
    accountBalance: "账户余额",
    payoutBalance: "提现余额",
    successfulDeposits: "今日成功存款",
    successRate: "今日成功率",
  },
  de: {
    noActive: (name) => `_Kein aktives Land für ${name}_`,
    country: "Land",
    key: "Schlüssel",
    accountBalance: "Kontostand",
    payoutBalance: "Auszahlungssaldo",
    successfulDeposits: "Erfolgreiche Einzahlungen heute",
    successRate: "Erfolgsquote heute",
  },
  hi: {
    noActive: (name) => `_${name} के लिए कोई सक्रिय देश नहीं है_`,
    country: "देश",
    key: "कुंजी",
    accountBalance: "खाता बैलेंस",
    payoutBalance: "निकासी बैलेंस",
    successfulDeposits: "आज के सफल जमा",
    successRate: "आज की सफलता दर",
  },
};

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

async function isTelegramAdminGroupUser(ctx: any): Promise<boolean> {
  const groupId = await getAdminGroupId();
  if (
    !groupId ||
    !ctx.from?.id ||
    !["group", "supergroup"].includes(ctx.chat?.type) ||
    String(ctx.chat?.id) !== groupId
  ) {
    return false;
  }
  try {
    const member = await ctx.telegram.getChatMember(groupId, ctx.from.id);
    return member.status === "creator" || member.status === "administrator";
  } catch {
    return false;
  }
}

async function isTelegramAdminCommandUser(ctx: any): Promise<boolean> {
  return isTelegramAdminGroupUser(ctx);
}

function countryLookupKey(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .toLocaleLowerCase();
}

function canonicalCountryName(value: string): string {
  const trimmed = value.trim();
  const known: Record<string, string> = {
    togo: "Togo",
    benin: "Benin",
    "cote d'ivoire": "Cote d'Ivoire",
    senegal: "Senegal",
    mali: "Mali",
    "burkina faso": "Burkina Faso",
    cameroun: "Cameroun",
    "congo brazzaville": "Congo Brazzaville",
    gabon: "Gabon",
    "congo rdc": "Congo RDC",
    guinee: "Guinee",
    gambie: "Gambie",
  };
  return known[countryLookupKey(trimmed)] || trimmed;
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
async function buildMerchantSoldeMessage(merchantId: number, merchantName: string, language: unknown = "fr"): Promise<string> {
  const labels = MERCHANT_BALANCE_LABELS[normalizeBotLanguage(language)];
  const countries = await storage.getMerchantCountries(merchantId);
  const active = countries.filter(mc => mc.active);
  if (active.length === 0) return labels.noActive(merchantName);

  const parts: string[] = [];
  for (const mc of active) {
    const stats = await getTodayStatsByCountry(merchantId, mc.country);
    parts.push(
      `🌍 *${labels.country} :* ${countryLabel(mc.country)}\n` +
      `📌 *${labels.key} :* \`${mc.apiKey.slice(-12)}\`\n` +
      `💰 *${labels.accountBalance} :* ${formatAmountPlain(mc.balance)} ${currencyForCountry(mc.country)}\n` +
      `💳 *${labels.payoutBalance} :* ${formatAmountPlain(mc.balance)} ${currencyForCountry(mc.country)}\n` +
      `📊 *${labels.successfulDeposits} :* ${stats.success}\n` +
      `📈 *${labels.successRate} :* ${successRate(stats.success, stats.total)}`
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

  // Les messages privés restent silencieux, sauf /start pour activer un compte marchand.
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type !== "private") return next();

    const text = typeof ctx.message?.text === "string" ? ctx.message.text : "";
    if (!/^\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text)) return;
    return next();
  });

  registerOperatorPaymentCommand(
    bot,
    isAdminGroup,
    (chatId) =>
      operatorMaintenanceSessions.has(chatId) ||
      merchantPaymentToggleSessions.has(chatId) ||
      broadcastSessions.has(chatId) ||
      commanderSessions.has(chatId),
  );

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
        await ctx.reply(merchantBotText("zh").alreadyLinked(linked.name), { parse_mode: "Markdown" });
      } else {
        await ctx.reply("🔒 此机器人仅供获授权的 WestPay 商户使用。\n\n如果您是商户，请向管理员索取激活码。", { parse_mode: "Markdown" });
      }
      return;
    }

    if (isRateLimited(userId)) {
      await ctx.reply("⛔ 错误尝试次数过多，请在 1 小时后重试。");
      await alertAdminGroup(`⚠️ *Tentative bloquée (rate limit)*\n\n👤 Utilisateur : ${formatUser(ctx)}\n🆔 ID : \`${userId}\``);
      return;
    }

    const ac = await storage.getTelegramActivationCode(code);
    if (!ac || ac.used || new Date() > new Date(ac.expiresAt)) {
      const remaining = recordFailed(userId);
      if (remaining <= 0) {
        await ctx.reply("⛔ 激活码无效。由于尝试次数过多，账户已锁定 1 小时。");
        await alertAdminGroup(`🚨 *Compte bloqué (trop de tentatives)*\n\n👤 Utilisateur : ${formatUser(ctx)}\n🆔 ID : \`${userId}\``);
      } else {
        await ctx.reply(`❌ 激活码无效或已过期。\n\n⚠️ 剩余尝试次数：*${remaining}*`, { parse_mode: "Markdown" });
        if (remaining <= 2) await alertAdminGroup(`⚠️ *Tentatives suspectes de liaison bot*\n\n👤 Utilisateur : ${formatUser(ctx)}\n🆔 ID : \`${userId}\`\n⚠️ Tentatives restantes : ${remaining}`);
      }
      return;
    }

    const existingMerchant = await storage.getMerchantByTelegramChatId(chatId);
    if (existingMerchant) {
      await ctx.reply(merchantBotText("zh").alreadyLinked(existingMerchant.name), { parse_mode: "Markdown" });
      return;
    }

    await storage.updateMerchantTelegramChatId(ac.merchantId, chatId);
    await storage.markTelegramActivationCodeUsed(code);
    resetAttempts(userId);

    const merchant = await storage.getMerchantById(ac.merchantId);
    await ctx.reply(
      merchantBotText("zh").linkedWelcome(merchant?.name || ""),
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

  // ─── /setmerchant (liaison groupe → marchand) ─────────────────────────────
  bot.command("setmerchant", async (ctx) => {
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup) { await ctx.reply("❌ Cette commande doit être utilisée dans un groupe dédié au marchand."); return; }

    const userId = String(ctx.from?.id || "");
    const chatId = String(ctx.chat.id);
    const text = ctx.message.text || "";
    const code = text.split(" ")[1]?.trim();

    if (!code) {
      await ctx.reply("❌ Code manquant.\n\nUtilisez : `/setmerchant CODE`\n\nDemandez le code de liaison à l’administrateur WestPay.", { parse_mode: "Markdown" });
      return;
    }

    if (isRateLimited(userId)) {
      await ctx.reply("⛔ Trop de tentatives. Réessayez dans 1 heure.");
      await alertAdminGroup(`⚠️ *Tentative bloquée /setmerchant*\n\n👤 ${formatUser(ctx)}\n👥 Groupe : ${(ctx.chat as any).title || chatId}`);
      return;
    }

    const ac = await storage.getTelegramActivationCode(code);
    if (!ac || ac.used || new Date() > new Date(ac.expiresAt)) {
      const remaining = recordFailed(userId);
      if (remaining <= 0) {
        await ctx.reply("⛔ Code invalide. Bloqué pendant 1 heure.");
        await alertAdminGroup(`🚨 *Bloqué (trop de tentatives /setmerchant)*\n\n👤 ${formatUser(ctx)}\n👥 ${(ctx.chat as any).title || chatId}`);
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
    const merchantText = merchantBotText(merchant?.telegramBotLanguage);
    await ctx.reply(
      merchantText.groupLinked(
        merchant?.name || "",
        merchant?.email || "",
        merchantHelpMessage(merchant?.name || "", merchant?.telegramBotLanguage),
      ),
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
      const merchantText = merchantBotText(merchant.telegramBotLanguage);
      if (merchant.suspended) { await ctx.reply(merchantText.suspended); return; }
      try {
        const stats = await storage.getMerchantStats(merchant.id);
        await ctx.reply(
          merchantText.stats(merchant.name, stats.transactionCount, formatAmount(stats.totalVolume)),
          { parse_mode: "Markdown" }
        );
      } catch { await ctx.reply(merchantText.genericError); }
      return;
    }

    const merchant = await storage.getMerchantByTelegramChatId(chatId);
    if (!merchant) return;
    const merchantText = merchantBotText(merchant.telegramBotLanguage);
    if (merchant.suspended) { await ctx.reply(merchantText.suspended); return; }
    try {
      const stats = await storage.getMerchantStats(merchant.id);
      await ctx.reply(
        merchantText.stats(merchant.name, stats.transactionCount, formatAmount(stats.totalVolume)),
        { parse_mode: "Markdown" }
      );
    } catch { await ctx.reply(merchantText.genericError); }
  });

  // ─── /merchants (groupe admin uniquement) ─────────────────────────────────
  bot.command("merchants", async (ctx) => {
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

  const createMerchantFromTelegram = async (ctx: any) => {
    if (ctx.chat?.type === "private") return;

    const messageText = String(ctx.message?.text || "");
    const messageDeleted = await ctx.deleteMessage().then(
      () => true,
      () => false,
    );
    const adminGroupId = await getAdminGroupId().catch(() => undefined);
    if (!adminGroupId) {
      await ctx.reply("Le groupe administrateur WestPay n’est pas configuré.");
      return;
    }
    if (
      !["group", "supergroup"].includes(ctx.chat?.type) ||
      String(ctx.chat?.id) !== adminGroupId
    ) {
      await ctx.reply("⛔ Cette commande fonctionne uniquement dans le groupe administrateur WestPay.");
      return;
    }
    if (!await isTelegramAdminGroupUser(ctx)) {
      await ctx.reply("⛔ Seuls les administrateurs Telegram du groupe admin WestPay peuvent créer un marchand.");
      return;
    }
    if (!messageDeleted) {
      await ctx.reply(
        "⛔ Création annulée : le bot n’a pas pu supprimer la commande contenant les adresses e-mail. " +
        "Vérifiez qu’il peut supprimer les messages dans ce groupe.",
      );
      return;
    }

    const raw = messageText.replace(/^\/[^\s]+\s*/, "");
    const parts = raw.split("|").map((part: string) => part.trim());
    if (parts.length !== 7) {
      await ctx.reply(
        "Usage : /createmerchant EMAIL_ADMIN | NOM | EMAIL_MARCHAND | SLUG | PAYS1,PAYS2 | CYCLE | CATEGORIE\n\n" +
        "Exemple : /createmerchant admin@westpay.com | Demo | client@example.com | demo-shop | Togo,Benin | D+3 | other_platforms\n" +
        "Cycles : D0, D+1 à D+30, WEEKLY, EVERY_TWO_WEEKS, MONTHLY, CUSTOM.\n" +
        `Catégories : ${MERCHANT_CATEGORIES.map((category) => category.value).join(", ")}.\n` +
        "Indiquez l’e-mail de l’administrateur et celui du marchand. Aucun code TOTP n’est demandé; la commande est supprimée du chat.",
      );
      return;
    }

    const adminEmail = (parts[0] || "").trim().toLowerCase();
    const [name, rawEmail, rawSlug, countriesText, accountType, merchantCategory] = parts.slice(1);
    const email = rawEmail.toLowerCase();
    const slug = rawSlug.toLowerCase();
    const rawCountries = countriesText
      .split(",")
      .map((country: string) => country.trim())
      .filter(Boolean);
    const uniqueCountries: string[] = [];
    const unsupportedCountries: string[] = [];
    const countryKeys = new Set<string>();
    for (const rawCountry of rawCountries) {
      const country = canonicalMerchantCountryName(canonicalCountryName(rawCountry));
      if (!country) {
        unsupportedCountries.push(rawCountry);
        continue;
      }
      const key = countryLookupKey(country);
      if (!countryKeys.has(key)) {
        countryKeys.add(key);
        uniqueCountries.push(country);
      }
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) || adminEmail.length > 254) {
      await ctx.reply("Adresse e-mail de l’administrateur invalide.");
      return;
    }
    if (!name || name.length > 120) {
      await ctx.reply("Nom de marchand requis (maximum 120 caractères).");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      await ctx.reply("Adresse e-mail du marchand invalide.");
      return;
    }
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) {
      await ctx.reply("Slug invalide : utilisez 2 à 40 caractères minuscules, chiffres ou tirets.");
      return;
    }
    if (unsupportedCountries.length > 0) {
      await ctx.reply(
        `Pays non pris en charge : ${unsupportedCountries.join(", ")}.\n\n` +
        `Choisissez parmi les pays du panel : ${MERCHANT_ACTIVATABLE_COUNTRIES.join(", ")}.`,
      );
      return;
    }
    if (uniqueCountries.length === 0 || uniqueCountries.length > 20 || uniqueCountries.some((country: string) => country.length > 80)) {
      await ctx.reply("Indiquez de 1 à 20 pays, séparés par des virgules.");
      return;
    }
    if (!isMerchantSettlementCycle(accountType)) {
      await ctx.reply("Cycle invalide. Choisissez D0, D+1 à D+30, WEEKLY, EVERY_TWO_WEEKS, MONTHLY ou CUSTOM.");
      return;
    }
    if (!isMerchantCategory(merchantCategory)) {
      await ctx.reply(`Catégorie invalide. Valeurs possibles : ${MERCHANT_CATEGORIES.map((category) => category.value).join(", ")}.`);
      return;
    }

    let adminRecord;
    try {
      adminRecord = await storage.getAdminByEmail(adminEmail);
      if (!adminRecord) {
        await ctx.reply("⛔ Aucun compte administrateur WestPay ne correspond à cet e-mail.");
        return;
      }
    } catch (error: any) {
      console.error("[TELEGRAM] Vérification de l’e-mail admin pour création marchand impossible:", error?.message || error);
      await ctx.reply("⛔ Impossible de vérifier l’e-mail administrateur. Réessayez plus tard.");
      return;
    }

    try {
      if (!await verifyEmailDomainHasMx(email)) {
        await ctx.reply("L’adresse e-mail semble invalide ou son domaine n’a pas de serveur mail.");
        return;
      }
      if (await storage.getMerchantByEmail(email)) {
        await ctx.reply("Cette adresse e-mail est déjà utilisée.");
        return;
      }
      if (await storage.getMerchantBySlug(slug)) {
        await ctx.reply("Ce slug est déjà utilisé.");
        return;
      }
    } catch (error: any) {
      console.error("[TELEGRAM] Vérification du marchand impossible:", error?.message || error);
      await ctx.reply("Impossible de vérifier l’adresse ou le slug. Réessayez plus tard.");
      return;
    }

    const password = crypto.randomBytes(18).toString("hex");
    const docsPin = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    let merchantId: number | undefined;
    const createdCountryIds: number[] = [];
    const rollback = async () => {
      const countryIdsToDelete = createdCountryIds.slice();
      if (merchantId !== undefined) {
        try {
          const rows = await storage.getMerchantCountries(merchantId);
          for (let i = 0; i < rows.length; i++) {
            if (!countryIdsToDelete.includes(rows[i].id)) countryIdsToDelete.push(rows[i].id);
          }
        } catch (error: any) {
          console.error("[TELEGRAM] Lecture des pays du marchand incomplet impossible:", error?.message || error);
        }
      }
      for (let i = countryIdsToDelete.length - 1; i >= 0; i--) {
        await storage.deleteMerchantCountry(countryIdsToDelete[i]).catch((error: any) => {
          console.error("[TELEGRAM] Nettoyage d’un pays de marchand impossible:", error?.message || error);
        });
      }
      if (merchantId !== undefined) {
        await storage.deleteMerchant(merchantId).catch((error: any) => {
          console.error("[TELEGRAM] Nettoyage d’un marchand incomplet impossible:", error?.message || error);
        });
      }
    };

    try {
      const passwordHash = await bcrypt.hash(password, 10);
      const merchant = await storage.createMerchant({
        name,
        email,
        slug,
        passwordHash,
        suspended: false,
        website: null,
        accountType,
        merchantCategory,
        payinDisabled: false,
        withdrawalsDisabled: false,
      });
      merchantId = merchant.id;
      await storage.upsertMerchantPin(merchant.id, await bcrypt.hash(docsPin, 10));

      for (const country of uniqueCountries) {
        const merchantCountry = await storage.addMerchantCountry({
          merchantId: merchant.id,
          country,
          apiKey: generateSecureApiKey(country),
          balance: 0,
          active: true,
          gatewayEnabled: true,
        });
        createdCountryIds.push(merchantCountry.id);
      }

      const welcomeText =
        `Bienvenue chez WestPay, ${name} !\n\n` +
        `Votre compte marchand est actif.\n\n` +
        `Connexion marchand : https://westpay.cdf/merchant-login\n` +
        `Slug : ${slug}\n` +
        `Pays activés : ${uniqueCountries.join(", ")}\n` +
        `E-mail : ${email}\n` +
        `Mot de passe : ${password}\n\n` +
        `Documentation API : https://westpay.cdf/api-docs\n` +
        `E-mail : ${email}\n` +
        `PIN d’accès : ${docsPin}\n\n` +
        `Frais :\n` +
        `Payin : 5.5 %\n` +
        `Payout : 4.5 %\n` +
        `Transfert interwallet : 3 %\n\n` +
        `Support : https://t.me/robotpay19293`;

      try {
        await bot!.telegram.sendMessage(adminGroupId, welcomeText);
      } catch (sendError: any) {
        await rollback();
        console.error("[TELEGRAM] Publication des identifiants dans le groupe admin impossible:", sendError?.message || sendError);
        await ctx.reply("La création a été annulée car le message n’a pas pu être publié dans le groupe admin. Vérifiez que le bot peut y envoyer des messages.");
        return;
      }

      await Promise.all([
        storage.createApiLog({
          merchantId: merchant.id,
          action: "merchant_created_telegram",
          ip: "telegram",
          description: `Marchand ${name} créé depuis Telegram`,
        }),
        storage.createApiLog({
          merchantId: merchant.id,
          action: "countries_added",
          ip: "telegram",
          description: `Pays activés depuis Telegram : ${uniqueCountries.join(", ")}`,
        }),
      ]).catch((error: any) => {
        console.error("[TELEGRAM] Journalisation de la création marchand impossible:", error?.message || error);
      });

      await notifyAdminMerchantCreated({
        merchantName: name,
        merchantEmail: email,
        merchantSlug: slug,
        merchantId: merchant.id,
        adminEmail,
        adminId: adminRecord.id,
      }).catch((error: any) => {
        console.error("[TELEGRAM] Notification de création marchand impossible:", error?.message || error);
      });
      await ctx.reply("✅ Marchand créé. Les identifiants ont été publiés dans le groupe administrateur WestPay.");
    } catch (error: any) {
      await rollback();
      console.error("[TELEGRAM] Création marchand depuis Telegram impossible:", error?.message || error);
      await ctx.reply("❌ La création du marchand a échoué. Vérifiez les données puis réessayez.");
    }
  };
  bot.command("createmerchant", createMerchantFromTelegram);
  bot.command("creermarchand", createMerchantFromTelegram);

  bot.command("setmerchantcode", async (ctx) => {
    if (ctx.chat?.type === "private") return;
    if (!await isTelegramAdminCommandUser(ctx)) {
      await ctx.reply("⛔ Commande réservée aux administrateurs Telegram du groupe admin WestPay.");
      return;
    }

    const messageText = String(ctx.message?.text || "");
    const merchantRef = messageText.replace(/^\/[^\s]+\s*/, "").trim();
    if (!merchantRef) {
      await ctx.reply("Usage : /setmerchantcode SLUG_MARCHAND\nExemple : /setmerchantcode demo-shop");
      return;
    }

    try {
      const normalizedRef = merchantRef.toLowerCase();
      const merchant =
        await storage.getMerchantBySlug(normalizedRef) ||
        (normalizedRef.includes("@") ? await storage.getMerchantByEmail(normalizedRef) : undefined);
      if (!merchant) {
        await ctx.reply("Marchand introuvable. Indiquez son slug ou son e-mail.");
        return;
      }

      await storage.deleteTelegramActivationCodes(merchant.id);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      let activationCode: string | undefined;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = crypto.randomBytes(4).toString("hex").toUpperCase();
        if (await storage.getTelegramActivationCode(candidate)) continue;
        await storage.createTelegramActivationCode(merchant.id, candidate, expiresAt);
        activationCode = candidate;
        break;
      }
      if (!activationCode) throw new Error("Impossible de générer un code Telegram unique");

      await ctx.reply(
        `✅ Code de liaison pour ${merchant.slug} : ${activationCode}\n\n` +
        `Dans le groupe du marchand, lancez : /setmerchant ${activationCode}\n` +
        `Ce code est à usage unique et expire dans 24 heures. Tout ancien code de liaison a été révoqué.`,
      );
    } catch (error: any) {
      console.error("[TELEGRAM] Génération du code de liaison impossible:", error?.message || error);
      await ctx.reply("❌ Impossible de générer le code de liaison. Réessayez.");
    }
  });

  const activateCountryFromTelegram = async (ctx: any) => {
    if (ctx.chat?.type === "private") return;
    if (!await isTelegramAdminGroupUser(ctx)) {
      if (ctx.chat?.type === "group" || ctx.chat?.type === "supergroup") {
        await ctx.reply("⛔ Cette commande est réservée aux administrateurs Telegram du groupe admin WestPay.");
      }
      return;
    }

    const raw = String(ctx.message?.text || "").replace(/^\/[^\s]+\s*/, "");
    const parts = raw.split("|").map((part: string) => part.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      await ctx.reply("Usage : /activatecountry SLUG_MARCHAND | PAYS\nExemple : /activatecountry demo-shop | Togo");
      return;
    }
    const [merchantRef, rawCountry] = parts;
    const country = canonicalMerchantCountryName(canonicalCountryName(rawCountry));
    if (!country) {
      await ctx.reply(
        `Pays non pris en charge. Choisissez un pays disponible dans le panel : ${MERCHANT_ACTIVATABLE_COUNTRIES.join(", ")}.`,
      );
      return;
    }

    try {
      const merchant = merchantRef.includes("@")
        ? await storage.getMerchantByEmail(merchantRef.toLowerCase())
        : await storage.getMerchantBySlug(merchantRef.toLowerCase());
      if (!merchant) {
        await ctx.reply("Aucun marchand trouvé avec cet e-mail ou ce slug.");
        return;
      }

      const existingCountries = await storage.getMerchantCountries(merchant.id);
      const existing = existingCountries.find(
        (item) => countryLookupKey(item.country) === countryLookupKey(country),
      );
      if (existing?.active) {
        await ctx.reply(`Le pays ${existing.country} est déjà actif pour ${merchant.name} (${merchant.slug}).`);
        return;
      }

      let activatedCountry = country;
      if (existing) {
        await storage.updateMerchantCountryActive(existing.id, true);
        activatedCountry = existing.country;
      } else {
        await storage.addMerchantCountry({
          merchantId: merchant.id,
          country,
          apiKey: generateSecureApiKey(country),
          balance: 0,
          active: true,
          gatewayEnabled: true,
        });
      }

      await storage.createApiLog({
        merchantId: merchant.id,
        action: existing ? "country_reactivated_telegram" : "country_added_telegram",
        ip: "telegram",
        description: `Pays ${activatedCountry} activé depuis Telegram`,
      }).catch((error: any) => {
        console.error("[TELEGRAM] Journalisation de l’activation pays impossible:", error?.message || error);
      });

      await ctx.reply(`✅ Pays ${activatedCountry} activé pour ${merchant.name} (${merchant.slug}).`);
    } catch (error: any) {
      console.error("[TELEGRAM] Activation pays depuis Telegram impossible:", error?.message || error);
      await ctx.reply("❌ Impossible d’activer ce pays. Vérifiez le marchand et réessayez.");
    }
  };
  bot.command("activatecountry", activateCountryFromTelegram);
  bot.command("activerpays", activateCountryFromTelegram);

  // ─── /gatewaybalance (groupe admin uniquement) ────────────────────────────
  bot.command("gatewaybalance", async (ctx) => {
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

  bot.action(/^gateway_balance:(mbiyo|seapay|clapay)$/, async (ctx) => {
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

  // ─── /balance ─────────────────────────────────────────────────────────────
  bot.command("balance", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";

    if (isGroup) {
      if (await isAdminGroup(chatId)) {
        try {
          const merchants = await storage.getMerchants();
          if (merchants.length === 0) { await ctx.reply("Aucun marchand enregistré."); return; }
          for (const m of merchants.filter(m => !m.suspended).slice(0, 10)) {
            const msg = await buildMerchantSoldeMessage(m.id, m.name, m.telegramBotLanguage);
            await ctx.reply(`🏪 *${m.name}*\n\n${msg}`, { parse_mode: "Markdown" });
          }
        } catch { await ctx.reply("❌ Erreur."); }
        return;
      }
      const merchant = await getMerchantForGroup(chatId);
      if (!merchant) return;
      const merchantText = merchantBotText(merchant.telegramBotLanguage);
      if (merchant.suspended) { await ctx.reply(merchantText.suspendedContact); return; }
      try {
        const msg = await buildMerchantSoldeMessage(merchant.id, merchant.name, merchant.telegramBotLanguage);
        await ctx.reply(merchantText.balances(merchant.name, msg), { parse_mode: "Markdown" });
      } catch { await ctx.reply(merchantText.genericError); }
      return;
    }

    const merchant = await storage.getMerchantByTelegramChatId(chatId);
    if (!merchant) return;
    const merchantText = merchantBotText(merchant.telegramBotLanguage);
    if (merchant.suspended) { await ctx.reply(merchantText.suspendedContact); return; }
    try {
      const msg = await buildMerchantSoldeMessage(merchant.id, merchant.name, merchant.telegramBotLanguage);
      await ctx.reply(merchantText.balances(merchant.name, msg), { parse_mode: "Markdown" });
    } catch { await ctx.reply(merchantText.genericError); }
  });

  // ─── /transactions (DM et groupe marchand) ────────────────────────────────
  bot.command("transactions", async (ctx) => {
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    const chatId = String(ctx.chat.id);

    if (isGroup) {
      if (await isAdminGroup(chatId)) return;
      const merchant = await getMerchantForGroup(chatId);
      if (!merchant) return;
      const merchantText = merchantBotText(merchant.telegramBotLanguage);
      try {
        const txs = await storage.getTransactions(merchant.id);
        const recent = txs.slice(0, 5);
        if (recent.length === 0) { await ctx.reply(merchantText.noTransactions); return; }
        const lines = recent.map((t, i) => {
          const date = new Date(t.createdAt).toLocaleDateString(BOT_DATE_LOCALES[normalizeBotLanguage(merchant.telegramBotLanguage)]);
          const statusIcon = t.status === "confirmed" ? "✅" : "⏳";
          return `${i + 1}. ${statusIcon} *${formatAmountC(t.amount, t.country)}*\n   ${countryLabel(t.country)} — ${date}${t.payerNumber ? `\n   📞 ${t.payerNumber}` : ""}\n   🔖 \`${t.txId}\``;
        });
        await ctx.reply(`${merchantText.transactionsTitle(merchant.name, false)}\n\n${lines.join("\n\n")}`, { parse_mode: "Markdown" });
      } catch { await ctx.reply(merchantText.genericError); }
      return;
    }

    const merchant = await storage.getMerchantByTelegramChatId(chatId);
    if (!merchant) return;
    const merchantText = merchantBotText(merchant.telegramBotLanguage);
    try {
      const txs = await storage.getTransactions(merchant.id);
      const recent = txs.slice(0, 5);
      if (recent.length === 0) { await ctx.reply(merchantText.noTransactions); return; }
      const lines = recent.map((t, i) => {
        const date = new Date(t.createdAt).toLocaleDateString(BOT_DATE_LOCALES[normalizeBotLanguage(merchant.telegramBotLanguage)]);
        const statusIcon = t.status === "confirmed" ? "✅" : "⏳";
        return `${i + 1}. ${statusIcon} *${formatAmountC(t.amount, t.country)}*\n   ${countryLabel(t.country)} — ${date}${t.payerNumber ? `\n   📞 ${t.payerNumber}` : ""}\n   🔖 \`${t.txId}\``;
      });
      await ctx.reply(`${merchantText.transactionsTitle(merchant.name, true)}\n\n${lines.join("\n\n")}`, { parse_mode: "Markdown" });
    } catch { await ctx.reply(merchantText.genericError); }
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
      `Envoyez /cancel pour annuler.`,
      { parse_mode: "Markdown" }
    );
  });

  // ─── /cancel (annule le broadcast ou la recherche de retrait en cours) ────
  bot.command("cancel", async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (cancelOperatorPaymentSession(chatId)) {
      await ctx.reply("❌ Modification de la configuration opérateur annulée.");
    } else if (operatorMaintenanceSessions.has(chatId)) {
      operatorMaintenanceSessions.delete(chatId);
      await ctx.reply("❌ Réglage de disponibilité annulé.");
    } else if (merchantPaymentToggleSessions.has(chatId)) {
      merchantPaymentToggleSessions.delete(chatId);
      await ctx.reply("❌ Modification payin/payout annulée.");
    } else if (broadcastSessions.has(chatId)) {
      broadcastSessions.delete(chatId);
      await ctx.reply("❌ Broadcast annulé.");
    } else if (commanderSessions.has(chatId)) {
      commanderSessions.delete(chatId);
      await ctx.reply("❌ Recherche de retrait annulée.");
    }
  });

  // ─── /findwithdrawal (groupe admin uniquement) ────────────────────────────
  // Recherche un retrait par numéro de téléphone et propose 4 actions.
  bot.command("findwithdrawal", async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!await isAdminGroup(chatId)) {
      await ctx.reply("⛔ Cette commande est réservée au groupe admin WestPay.").catch(() => {});
      return;
    }
    commanderSessions.set(chatId, { step: "waiting_phone" });
    await ctx.reply(
      "📱 *Recherche de retrait*\n\n" +
      "Envoyez le numéro de téléphone du bénéficiaire :\n" +
      "_(ex: 22890123456 ou 90123456)_\n\n" +
      "Envoyez /cancel pour annuler.",
      { parse_mode: "Markdown" }
    );
  });

  // ─── /disablepayments (groupe admin uniquement) ────────────────────────────
  bot.command("disablepayments", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup || !await isAdminGroup(chatId)) {
      await ctx.reply("⛔ Cette commande est réservée au groupe admin WestPay.").catch(() => {});
      return;
    }
    merchantPaymentToggleSessions.set(chatId, { step: "waiting_slug", action: "disable" });
    await ctx.reply(
      "🔒 *Désactiver payin et payout*\n\n" +
      "Envoyez maintenant le *slug exact du marchand*.\n\n" +
      "Toutes les nouvelles demandes de ce compte retourneront :\n" +
      "`404 未经授权的付款`\n\n" +
      "Envoyez /cancel pour annuler.",
      { parse_mode: "Markdown" },
    );
  });

  // ─── /enablepayments et /activatepayments (groupe admin uniquement) ───────
  const activateMerchantPayments = async (ctx: any) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup || !await isAdminGroup(chatId)) {
      await ctx.reply("⛔ Cette commande est réservée au groupe admin WestPay.").catch(() => {});
      return;
    }
    merchantPaymentToggleSessions.set(chatId, { step: "waiting_slug", action: "enable" });
    await ctx.reply(
      "🔓 *Réactiver payin et payout*\n\n" +
      "Envoyez maintenant le *slug exact du marchand*.\n\n" +
      "Les nouvelles demandes de ce compte seront de nouveau autorisées.\n\n" +
      "Envoyez /cancel pour annuler.",
      { parse_mode: "Markdown" },
    );
  };
  bot.command("enablepayments", activateMerchantPayments);
  bot.command("activatepayments", activateMerchantPayments);

  const startOperatorMaintenance = async (ctx: any, flow: "payin" | "payout") => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup || !await isAdminGroup(chatId)) {
      await ctx.reply("⛔ Cette commande est réservée au groupe admin WestPay.");
      return;
    }
    const operators = await storage.getWithdrawalOperators();
    if (operators.length === 0) {
      await ctx.reply("Aucun opérateur n’est configuré.");
      return;
    }
    const countries = operators
      .map((operator) => operator.country)
      .filter((country, index, allCountries) => allCountries.indexOf(country) === index)
      .sort((a, b) => a.localeCompare(b));
    operatorMaintenanceSessions.set(chatId, { step: "country", flow, operators, countries });
    const countryLines = countries.map((country, index) => `${index + 1}. ${country}`);
    await ctx.reply(
      `Gestion du ${flow.toUpperCase()} — canaux ouverts de 7h à 20h, heure locale du pays.\n\n` +
      `Choisissez un pays en envoyant son numéro, ou 0 pour tous les pays :\n0. Tous les pays\n${countryLines.join("\n")}\n\n` +
      `Envoyez /cancel pour annuler.`,
    );
  };
  bot.command("payin", (ctx) => startOperatorMaintenance(ctx, "payin"));
  bot.command("payout", (ctx) => startOperatorMaintenance(ctx, "payout"));

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
    const maintenanceSession = operatorMaintenanceSessions.get(chatId);
    if (maintenanceSession) {
      const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
      if (!isGroup || !await isAdminGroup(chatId)) {
        operatorMaintenanceSessions.delete(chatId);
        return next();
      }
      const text = String((ctx.message as any).text || "").trim();
      if (!text || text.startsWith("/")) return next();

      if (maintenanceSession.step === "country") {
        const selected = Number(text);
        if (!Number.isInteger(selected) || selected < 0 || selected > maintenanceSession.countries.length) {
          await ctx.reply("Numéro invalide. Choisissez un numéro de la liste, ou 0 pour tous les pays.");
          return;
        }
        const country = selected === 0 ? null : maintenanceSession.countries[selected - 1];
        const candidates = maintenanceSession.operators.filter((operator) => !country || operator.country === country);
        maintenanceSession.country = country;
        maintenanceSession.targets = candidates;
        maintenanceSession.step = "operator";
        operatorMaintenanceSessions.set(chatId, maintenanceSession);
        const operatorLines = candidates.map((operator, index) =>
          `${index + 1}. ${operator.name} — ${operator.country}`,
        );
        await ctx.reply(
          `Choisissez un opérateur par son numéro, ou 0 pour tous les opérateurs${country ? ` de ${country}` : ""} :\n` +
          `0. Tous les opérateurs\n${operatorLines.join("\n")}\n\nEnvoyez /cancel pour annuler.`,
        );
        return;
      }

      if (maintenanceSession.step === "operator") {
        const selected = Number(text);
        const targets = maintenanceSession.targets || [];
        if (!Number.isInteger(selected) || selected < 0 || selected > targets.length) {
          await ctx.reply("Numéro invalide. Choisissez un numéro de la liste, ou 0 pour tous les opérateurs.");
          return;
        }
        maintenanceSession.targets = selected === 0 ? targets : [targets[selected - 1]];
        maintenanceSession.step = "action";
        operatorMaintenanceSessions.set(chatId, maintenanceSession);
        const names = maintenanceSession.targets.map((operator) => `${operator.name} (${operator.country})`);
        await ctx.reply(
          `Sélection : ${names.join(", ")}\n\n` +
          `Envoyez 1 pour désactiver le ${maintenanceSession.flow.toUpperCase()} ou 2 pour le réactiver.`,
        );
        return;
      }

      const action = text.toLocaleLowerCase();
      const disabled = ["1", "désactiver", "desactiver", "off"].includes(action)
        ? true
        : ["2", "réactiver", "reactiver", "on"].includes(action)
          ? false
          : null;
      if (disabled === null) {
        await ctx.reply("Réponse invalide. Envoyez 1 pour désactiver ou 2 pour réactiver.");
        return;
      }
      const targets = maintenanceSession.targets || [];
      for (const operator of targets) {
        if (maintenanceSession.flow === "payin") {
          await storage.updateWithdrawalOperator(operator.id, { maintenanceDeposits: disabled });
        } else {
          await storage.updateWithdrawalOperator(operator.id, { maintenanceWithdrawals: disabled });
        }
      }
      operatorMaintenanceSessions.delete(chatId);
      const state = disabled ? "désactivé" : "réactivé";
      const scope = targets.length === maintenanceSession.operators.length
        ? "tous les opérateurs de tous les pays"
        : targets.map((operator) => `${operator.name} (${operator.country})`).join(", ");
      await ctx.reply(
        `✅ ${maintenanceSession.flow.toUpperCase()} ${state} pour ${scope}.\n` +
        `Les canaux configurés restent visibles, mais leur étape finale est bloquée.`,
      );
      return;
    }

    const paymentToggleSession = merchantPaymentToggleSessions.get(chatId);
    if (paymentToggleSession?.step === "waiting_slug") {
      const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
      if (!isGroup || !await isAdminGroup(chatId)) {
        merchantPaymentToggleSessions.delete(chatId);
        return next();
      }
      const msg = ctx.message as any;
      const slug = String(msg.text || "").trim();
      if (!slug || slug.startsWith("/")) return next();
      merchantPaymentToggleSessions.delete(chatId);

      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(slug)) {
        await ctx.reply(`❌ Slug invalide. Relancez /${paymentToggleSession.action === "enable" ? "reactiverpaiement" : "desactiverpaiement"} avec le slug exact du marchand.`);
        return;
      }

      try {
        const merchant = await storage.getMerchantBySlug(slug);
        if (!merchant) {
          await ctx.reply(
            `❌ Aucun marchand trouvé avec le slug \`${slug}\`. Relancez /${paymentToggleSession.action === "enable" ? "reactiverpaiement" : "desactiverpaiement"} pour réessayer.`,
            { parse_mode: "Markdown" },
          );
          return;
        }

        const enabling = paymentToggleSession.action === "enable";
        await storage.updateMerchant(merchant.id, {
          payinDisabled: !enabling,
          withdrawalsDisabled: !enabling,
        });
        if (enabling) {
          await ctx.reply(
            `✅ *Payin et payout réactivés*\n\n` +
            `🏪 Marchand : *${merchant.name}*\n` +
            `🔖 Slug : \`${merchant.slug}\`\n\n` +
            `Les nouvelles demandes de paiement et de retrait sont de nouveau autorisées.`,
            { parse_mode: "Markdown" },
          );
        } else {
          await ctx.reply(
            `✅ *Payin et payout désactivés*\n\n` +
            `🏪 Marchand : *${merchant.name}*\n` +
            `🔖 Slug : \`${merchant.slug}\`\n\n` +
            `Toutes les nouvelles demandes via ce compte retournent :\n` +
            `\`404 未经授权的付款\``,
            { parse_mode: "Markdown" },
          );
        }
      } catch (err: any) {
        console.error("[TELEGRAM] Modification payin/payout impossible:", err?.message || err);
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
                w.provider_reference, w.created_at, w.fees, w.admin_note, w.merchant_id
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
          `🔗 Réf fournisseur : ${w.provider_reference || "—"}\n` +
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

  // ─── /blockedusers (groupe admin uniquement) ──────────────────────────────
  bot.command("blockedusers", async (ctx) => {
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
        `Pour débloquer :\n\`/blockedusers USER_ID\`\nPour tout débloquer : \`/blockedusers all\``,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (arg === "all") {
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

  // ─── /logininfo (groupe admin uniquement) ─────────────────────────────────
  bot.command("logininfo", async (ctx) => {
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

  // ─── /help ────────────────────────────────────────────────────────────────
  bot.command("help", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";

    if (isGroup) {
      if (await isAdminGroup(chatId)) {
        await ctx.reply(
          `📖 *Commandes Admin — WestPay Bot*\n\n` +
          `/help — Afficher cette aide\n` +
          `/cancel — Annuler une action en cours\n\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `⚙️ *Configuration*\n` +
          `/setgroup API\\_KEY — Enregistrer ce groupe admin\n\n` +
          `👥 *Marchands*\n` +
          `/merchants — Liste de tous les marchands\n` +
          `/setmerchant CODE — Lier un groupe à un marchand\n\n` +
          `/setmerchantcode SLUG — Générer un code de liaison à usage unique (24 h)\n\n` +
          `/createmerchant (/creermarchand) — Créer un marchand dans ce groupe uniquement (administrateurs Telegram; message supprimé automatiquement)\n` +
          `/activatecountry (/activerpays) — Activer un pays dans le groupe admin uniquement\n\n` +
           `/disablepayments — Désactiver payin et payout d'un marchand\n\n` +
           `/enablepayments (/activatepayments) — Réactiver payin et payout d'un marchand\n\n` +
           `/payin — Couper/réactiver le payin par pays et opérateur (07h–20h local)\n` +
           `/payout — Couper/réactiver le payout par pays et opérateur (07h–20h local)\n\n` +
           `/setoperatorpayment — Changer le fournisseur ou le numéro manuel d’un opérateur; gérer Wave par lien/QR\n\n` +
          `📊 *Statistiques & Soldes*\n` +
          `/stats — Statistiques globales\n` +
          `/balance — Soldes détaillés de tous les marchands\n\n` +
          `/findwithdrawal@Westpaybot — Rechercher un retrait par numéro\n` +
          `/findpayment NUMERO — Rechercher tous les paiements et leur historique\n` +
          `/findmanualpayment NUMERO — Alias historique de la commande\n` +
           `/annulerpaiement NUMÉRO CLIENT OU RÉFÉRENCE (/cancelpayment) — Annuler un paiement confirmé et débiter le solde marchand\n` +
          `/gatewaybalance@Westpaybot — Consulter le solde d'un gateway et ses wallets pays\n\n` +
          `📢 *Diffusion*\n` +
          `/broadcast — Envoyer un message dans les groupes\n` +
          `/groups — Lister tous les groupes où le bot est présent\n` +
          `/scangroups — Synchroniser et enregistrer tous les groupes\n\n` +
          `🔐 *Utilitaires*\n` +
          `/status — Vérifier l'état du bot et du webhook\n` +
          `/logininfo — Rappel des URLs et identifiants admin\n` +
          `/seturl URL — Définir l'URL de la plateforme\n` +
          `/blockedusers — Voir les utilisateurs bloqués\n` +
          `/blockedusers ID — Débloquer un utilisateur spécifique\n` +
          `/blockedusers all — Débloquer tout le monde\n\n` +
          `🛡️ *Gestion des IPs*\n` +
          `/listips — Voir toutes les IPs autorisées et bloquées\n` +
          `/allowip IP [note] — Autoriser une adresse IP\n` +
          `/blockip IP [reason] — Bloquer une adresse IP\n` +
          `/unblockip IP — Retirer une IP de toutes les listes\n\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `💡 *Configurer un groupe marchand :*\n` +
          `1️⃣ Générer un code dans le dashboard WestPay\n` +
          `2️⃣ Ajouter le bot au groupe du marchand\n` +
          `3️⃣ Envoyer \`/setmerchant CODE\` dans ce groupe`,
          { parse_mode: "Markdown" }
        );
        return;
      }
      const merchant = await getMerchantForGroup(chatId);
      if (merchant) {
         await ctx.reply(merchantHelpMessage(merchant.name, merchant.telegramBotLanguage), { parse_mode: "Markdown" });
      }
      return;
    }

    const merchant = await storage.getMerchantByTelegramChatId(chatId);
    if (merchant) {
       await ctx.reply(merchantHelpMessage(merchant.name, merchant.telegramBotLanguage), { parse_mode: "Markdown" });
    }
  });

  // ─── Recherche admin de tous les paiements par numéro ──────────────────────
  const handlePaymentSearch = async (ctx: any) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup || !await isAdminGroup(chatId)) return;
    const query = String((ctx.message as any)?.text || "").trim().split(/\s+/).slice(1).join(" ");
    try {
      const payments = await searchPaymentsByNumber(query);
      if (!payments.length) {
        await ctx.reply("Aucun paiement ni élément d’historique ne correspond à ce numéro.");
        return;
      }
      const merchants = await Promise.all(payments.map((payment) => storage.getMerchantById(payment.merchantId)));
      for (let offset = 0; offset < payments.length; offset += 3) {
        const batch = payments.slice(offset, offset + 3);
        const lines = [`Paiements trouvés pour ${query} (${offset + 1}–${offset + batch.length}/${payments.length}) :`];
        const keyboard: { text: string; callback_data: string }[][] = [];
        batch.forEach((payment, index) => {
          const merchant = merchants[offset + index];
          const reference = payment.txId || payment.providerReference || payment.providerTxId || "N/A";
          const customerReference = payment.manualSubmission?.replace(/\s+/g, " ").trim().slice(0, 120);
          const gateway = payment.gateway || "inconnu";
          const sourceCode = payment.source === "pending" ? "p" : "t";
          const reviewActions = getPaymentReviewActions(payment);
          lines.push(
            `${payment.source === "pending" ? "Demande" : "Transaction"} #${payment.id} · ${merchant?.name || `Marchand #${payment.merchantId}`}`,
            `Montant : ${formatAmountC(payment.amount, payment.country)} · Pays : ${countryLabel(payment.country)} · Opérateur : ${payment.paymentMethod || "N/A"}`,
            `Fournisseur : ${gateway} · Statut : ${payment.status}`,
            `Client : ${payment.payerName || "N/A"} · Numéro : ${payment.payerPhone || "N/A"}`,
            `Référence : ${reference}`,
            ...(payment.manualRecipientPhone ? [`Numéro destinataire : ${payment.manualRecipientPhone}`] : []),
            ...(payment.manualRecipientName ? [`Titulaire du compte destinataire : ${payment.manualRecipientName}`] : []),
            ...(customerReference ? [`Référence saisie par le client : ${customerReference}`] : []),
            "",
          );
          if (supportsPaymentProviderStatus(payment)) {
            keyboard.push([{ text: `🔍 Vérifier fournisseur #${payment.id}`, callback_data: `pay:check:${sourceCode}:${payment.id}` }]);
          }
          const actions: { text: string; callback_data: string }[] = [];
          if (reviewActions.approve) actions.push({ text: `✅ Valider manuellement #${payment.id}`, callback_data: `pay:approve:${sourceCode}:${payment.id}` });
          if (reviewActions.reject) actions.push({ text: `❌ Rejeter #${payment.id}`, callback_data: `pay:reject:${sourceCode}:${payment.id}` });
          if (actions.length) keyboard.push(actions);
        });
        await ctx.reply(lines.join("\n"), keyboard.length ? { reply_markup: { inline_keyboard: keyboard } } : {});
      }
    } catch (error: any) {
      await ctx.reply(error?.message || "Erreur lors de la recherche des paiements manuels.");
    }
  };
  bot.command("findpayment", handlePaymentSearch);
  bot.command("findmanualpayment", handlePaymentSearch);
  bot.command("manualpayments", handlePaymentSearch);

  // ─── Annulation administrative d’un paiement déjà crédité ─────────────────
  const sendPaymentReversalPreview = async (ctx: any, id: number) => {
    const payment = await getPaymentReversalRecord(id);
    if (!payment) {
      await ctx.reply("Paiement introuvable.");
      return;
    }

    const merchant = await storage.getMerchantById(payment.merchant_id);
    const merchantName = merchant?.name || `Marchand #${payment.merchant_id}`;
    const creditedAmount = resolveOriginalMerchantCredit({
      amount: payment.amount,
      merchantCredit: payment.merchant_credit,
      provider: payment.provider,
      providerFee: payment.provider_fee,
    });
    const eligible = ["confirmed", "completed", "success", "successful", "paid"].includes(
      String(payment.status || "").toLowerCase(),
    );
    const reference = payment.provider_reference || payment.provider_tx_id || payment.tx_id;
    const lines = [
      "⚠️ ANNULATION D’UN PAIEMENT",
      `Marchand : ${merchantName}`,
      `Client : ${payment.payer_name || "N/A"}`,
      `Numéro : ${payment.payer_number || "N/A"}`,
      `Pays : ${countryLabel(payment.country)}`,
      `Paiement payé : ${formatAmountC(payment.amount, payment.country)}`,
      `Référence : ${reference}`,
      `Transaction : ${payment.tx_id}`,
    ];

    if (!eligible) {
      lines.push("", `Aucune action : le statut actuel est « ${payment.status} ».`);
      await ctx.reply(lines.join("\n"));
      return;
    }
    if (creditedAmount == null) {
      lines.push(
        "",
        "Aucune action : le montant net réellement crédité n’est pas vérifiable dans les données enregistrées.",
        "Utilisez une transaction dont le montant crédité d’origine peut être établi.",
      );
      await ctx.reply(lines.join("\n"));
      return;
    }

    lines.push(
      `Net à retirer du solde marchand : ${formatAmountC(creditedAmount, payment.country)}`,
      "",
      "Confirmez-vous ? Le solde peut devenir négatif. Cette action n’effectue pas de remboursement auprès du fournisseur.",
    );
    await ctx.reply(lines.join("\n"), {
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Confirmer l’annulation", callback_data: `pvr:confirm:${payment.id}` },
          { text: "Annuler", callback_data: "pvr:cancel" },
        ]],
      },
    });
  };

  const handlePaymentReversalCommand = async (ctx: any) => {
    const chatId = String(ctx.chat?.id ?? "");
    const isGroup = ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
    if (!isGroup || !await isAdminGroup(chatId)) {
      if (!isGroup) await ctx.reply("Cette commande est réservée au groupe admin.");
      return;
    }

    const query = String(ctx.message?.text || "").trim().split(/\s+/).slice(1).join(" ").trim();
    if (!query) {
      await ctx.reply("Usage : /annulerpaiement NUMÉRO_CLIENT ou RÉFÉRENCE");
      return;
    }

    try {
      const payments = await searchReversiblePayments(query);
      if (!payments.length) {
        await ctx.reply("Aucun paiement confirmé ne correspond à ce numéro ou à cette référence.");
        return;
      }
      if (payments.length > 10) {
        await ctx.reply("Plus de 10 paiements correspondent. Relancez la commande avec une référence exacte.");
        return;
      }
      if (payments.length === 1) {
        await sendPaymentReversalPreview(ctx, payments[0].id);
        return;
      }

      const merchants = await Promise.all(payments.map((payment) => storage.getMerchantById(payment.merchant_id)));
      const lines = [`Plusieurs paiements correspondent à « ${query} ». Choisissez celui à examiner :`];
      const inlineKeyboard = payments.map((payment, index) => {
        const merchantName = merchants[index]?.name || `Marchand #${payment.merchant_id}`;
        const customerPhone = payment.payer_number || "numéro inconnu";
        const label = `#${payment.id} ${payment.tx_id} · ${formatAmountC(payment.amount, payment.country)}`.slice(0, 60);
        lines.push(`${payment.tx_id} · ${merchantName} · ${customerPhone} · ${payment.status}`);
        return [{ text: label, callback_data: `pvr:select:${payment.id}` }];
      });
      await ctx.reply(lines.join("\n"), { reply_markup: { inline_keyboard: inlineKeyboard } });
    } catch (error: any) {
      console.error("[TELEGRAM PAYMENT REVERSAL] Recherche échouée:", error?.message || error);
      await ctx.reply("La recherche du paiement a échoué. Aucun solde n’a été modifié.");
    }
  };
  bot.command("annulerpaiement", handlePaymentReversalCommand);
  bot.command("cancelpayment", handlePaymentReversalCommand);

  bot.action(/^pvr:select:(\d+)$/, async (ctx) => {
    const chatId = String(ctx.chat?.id ?? "");
    if (!await isAdminGroup(chatId)) {
      await ctx.answerCbQuery("Non autorisé");
      return;
    }
    await ctx.answerCbQuery();
    try {
      await sendPaymentReversalPreview(ctx, Number(ctx.match![1]));
    } catch (error: any) {
      await ctx.reply(`Impossible de vérifier ce paiement : ${String(error?.message || "erreur").slice(0, 180)}`);
    }
  });

  bot.action("pvr:cancel", async (ctx) => {
    const chatId = String(ctx.chat?.id ?? "");
    if (!await isAdminGroup(chatId)) {
      await ctx.answerCbQuery("Non autorisé");
      return;
    }
    await ctx.answerCbQuery("Annulation abandonnée");
    await ctx.editMessageText("Annulation abandonnée. Aucun changement n’a été effectué.").catch(() => {});
  });

  bot.action(/^pvr:confirm:(\d+)$/, async (ctx) => {
    const chatId = String(ctx.chat?.id ?? "");
    if (!await isAdminGroup(chatId)) {
      await ctx.answerCbQuery("Non autorisé");
      return;
    }
    await ctx.answerCbQuery("Annulation en cours…");
    try {
      const adminName = formatUser(ctx);
      const result = await reverseConfirmedPayment(Number(ctx.match![1]), {
        telegramUserId: ctx.from?.id != null ? String(ctx.from.id) : null,
        name: adminName,
      });
      if (result.outcome !== "reversed") {
        const messages: Record<typeof result.outcome, string> = {
          not_found: "Paiement introuvable. Aucun changement effectué.",
          already_reversed: "Ce paiement a déjà été annulé. Aucun second débit effectué.",
          not_reversible: "Le statut du paiement ne permet plus son annulation. Aucun changement effectué.",
          credit_unverifiable: "Le net réellement crédité ne peut pas être vérifié. Aucun changement effectué.",
          merchant_country_missing: "Le compte marchand de ce pays est introuvable. Aucun changement effectué.",
          merchant_country_ambiguous: "Plusieurs soldes marchands correspondent à ce pays. Aucun changement effectué.",
        };
        await ctx.editMessageText(messages[result.outcome]).catch(() => {});
        return;
      }

      const payment = result.payment;
      const merchant = await storage.getMerchantById(payment.merchant_id);
      let merchantNotified = false;
      let notificationIssue = "";
      if (!merchant?.telegramChatId) {
        notificationIssue = "Marchand non notifié : aucun groupe Telegram marchand n’est lié.";
      } else {
        try {
          await ctx.telegram.sendMessage(
            merchant.telegramChatId,
            paymentReversalMerchantNotice(
              normalizeBotLanguage(merchant.telegramBotLanguage),
              payment,
              result.creditedAmount,
            ),
          );
          merchantNotified = true;
        } catch (error: any) {
          notificationIssue = `Notification marchand échouée : ${String(error?.message || "erreur Telegram").slice(0, 160)}`;
          console.error("[TELEGRAM PAYMENT REVERSAL] Notification marchand échouée:", error?.message || error);
        }
      }

      const confirmation = [
        "✅ PAIEMENT ANNULÉ",
        `Marchand : ${merchant?.name || `#${payment.merchant_id}`}`,
        `Client : ${payment.payer_name || "N/A"} · ${payment.payer_number || "N/A"}`,
        `Transaction : ${payment.tx_id}`,
        `Référence : ${payment.provider_reference || payment.provider_tx_id || payment.tx_id}`,
        `Net débité : ${formatAmountC(result.creditedAmount, payment.country)}`,
        `Solde avant : ${formatAmountC(result.balanceBefore, payment.country)}`,
        `Solde après : ${formatAmountC(result.balanceAfter, payment.country)}`,
        `Administrateur : ${adminName}`,
        merchantNotified ? "Marchand notifié dans sa langue." : notificationIssue,
      ].join("\n");
      await ctx.editMessageText(confirmation).catch(() => ctx.reply(confirmation));
    } catch (error: any) {
      console.error("[TELEGRAM PAYMENT REVERSAL] Annulation échouée:", error?.message || error);
      await ctx.editMessageText(
        `L’annulation n’a pas abouti. Vérifiez le solde et le statut avant de réessayer. Aucun succès n’a été confirmé.\nDétail : ${String(error?.message || "erreur").slice(0, 180)}`,
      ).catch(() => {});
    }
  });

  // ─── /groups (groupe admin uniquement) — liste et nettoyage des groupes connus ──
  bot.command("groups", async (ctx) => {
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

  // ─── /scangroups (groupe admin uniquement) — force-sync tous les groupes ───
  bot.command("scangroups", async (ctx) => {
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
        `💡 Utilisez /groups pour voir la liste complète.\n` +
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
        "✅ *Bot WestPay actif dans le groupe admin.*\n\nTapez /help pour voir toutes les commandes.",
        { parse_mode: "Markdown" }
      ).catch(() => {});
      return;
    }

    const linkedMerchant = await getMerchantForGroup(chatId);
    if (linkedMerchant) {
      await bot!.telegram.sendMessage(chatId,
         merchantBotText(linkedMerchant.telegramBotLanguage).groupActive(
           linkedMerchant.name,
           merchantHelpMessage(linkedMerchant.name, linkedMerchant.telegramBotLanguage),
         ),
        { parse_mode: "Markdown" }
      ).catch(() => {});
      return;
    }

    await bot!.telegram.sendMessage(chatId,
      `👋 *Bot WestPay ajouté à ${groupTitle}.*\n\n` +
      `Pour lier ce groupe à un compte marchand :\n\n` +
      `\`/setmerchant CODE\`\n\n` +
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
      await ctx.reply("✅ *Bot WestPay actif dans le groupe admin.*\n\nTapez /help pour voir toutes les commandes.", { parse_mode: "Markdown" });
      return;
    }

    const linkedMerchant = await getMerchantForGroup(chatId);
    if (linkedMerchant) {
      await ctx.reply(
         merchantBotText(linkedMerchant.telegramBotLanguage).groupActive(
           linkedMerchant.name,
           merchantHelpMessage(linkedMerchant.name, linkedMerchant.telegramBotLanguage),
         ),
        { parse_mode: "Markdown" }
      );
      return;
    }

    await ctx.reply(
      `👋 *Bot WestPay ajouté à ${groupTitle}.*\n\n` +
      `Pour lier ce groupe à un compte marchand :\n\n` +
      `\`/setmerchant CODE\`\n\n` +
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

  // ─── Actions boutons /findwithdrawal ──────────────────────────────────────

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

  bot.action(/^(?:pay:(check|approve|reject):(p|t):(\d+)|mpay:(approve|reject):(\d+))$/, async (ctx) => {
    const chatId = String(ctx.chat?.id ?? "");
    if (!await isAdminGroup(chatId)) { await ctx.answerCbQuery("Non autorisé"); return; }
    const action = (ctx.match![4] || ctx.match![1]) as "check" | "approve" | "reject";
    const source = ctx.match![4] ? "pending" : ctx.match![2] === "p" ? "pending" : "transaction";
    const id = Number(ctx.match![5] || ctx.match![3]);
    const reviewer = `Telegram ${formatUser(ctx)}`;
    await ctx.answerCbQuery(action === "check" ? "Vérification fournisseur en cours…" : "Traitement en cours…");
    try {
      if (action === "check") {
        const payment = await getPaymentReviewRecord(source, id);
        if (!payment) {
          await ctx.reply(`Paiement #${id} introuvable.`);
          return;
        }
        if (!supportsPaymentProviderStatus(payment)) {
          await ctx.reply(`Paiement #${id} : aucune vérification fournisseur disponible pour cette référence.`);
          return;
        }
        const result = await checkPaymentProviderStatus(payment);
        await ctx.reply(
          `🔍 Paiement #${id} — ${result.provider}\n` +
          `Statut fournisseur : ${result.status.replace(/[\r\n]+/g, " ").slice(0, 200)}\n` +
          `${result.message ? `Détail : ${result.message.replace(/[\r\n]+/g, " ").slice(0, 250)}\n` : ""}` +
          `Aucun changement au paiement n’a été appliqué.`,
        );
        return;
      }

      const result = source === "pending"
        ? await reviewPendingPayment(id, reviewer, action)
        : await reviewTransactionPayment(id, action);
      if (result.outcome === "not_found") {
        await ctx.reply(`Paiement #${id} introuvable.`);
        return;
      }
      if (result.outcome === "not_submitted") {
        await ctx.reply(`Le paiement #${id} n’a pas encore été soumis pour vérification.`);
        return;
      }
      if (result.outcome === "not_actionable") {
        await ctx.reply(`Le paiement #${id} n’est plus en attente. Aucune modification n’a été appliquée.`);
        return;
      }
      const payment = result.payment;
      if (action === "approve" && result.outcome === "approved" && payment) {
        const merchantName = result.merchant?.name || `#${payment.merchantId}`;
        const txId = payment.txId || payment.providerReference || `WP-${payment.id}`;
        const provider = payment.gateway.toLowerCase() === "manual"
          ? "mobile_money"
          : payment.gateway || "mobile_money";
        const platformFee = payment.amount - (result.credit ?? payment.amount);
        const creditedAmount = result.credit ?? payment.amount;
        notifyAdminPayment({
          txId,
          merchantName,
          payerNumber: payment.payerPhone,
          country: payment.country,
          amount: payment.amount,
          provider,
          status: "confirmed",
          platformFee,
          creditedAmount,
        }).catch(() => {});
        notifyMerchantPayment(payment.merchantId, {
          txId,
          amount: payment.amount,
          payerNumber: payment.payerPhone,
          country: payment.country,
          provider: payment.gateway.toLowerCase() === "manual" ? "mobile_money" : provider,
          platformFee,
          creditedAmount,
        }).catch(() => {});
        notifyConfirmedPaymentWebhook(payment.merchantId, {
          event: "payment.confirmed",
          txId,
          amount: payment.amount,
          currency: payment.country,
          payer: payment.payerPhone || "",
          country: payment.country,
          merchantSlug: result.merchant?.slug || "",
          provider,
          reference: payment.providerReference || txId,
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }
      const alreadyHandled = result.outcome === "already_approved" || result.outcome === "already_rejected";
      const actionLabel = result.outcome === "approved" ? "Validé et crédité" : "Rejeté";
      const adminName = formatUser(ctx);
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [[{
          text: alreadyHandled ? `Déjà traité · #${id}` : `${actionLabel} par ${adminName}`,
          callback_data: "pay:noop",
        }]],
      }).catch(() => {});
    } catch (error: any) {
      await ctx.reply(`Erreur de traitement du paiement #${id} : ${String(error?.message || "erreur").slice(0, 250)}`);
    }
  });
  bot.action(/^pay:noop$/, async (ctx) => { await ctx.answerCbQuery("Paiement déjà traité"); });
  bot.action(/^mpay:noop$/, async (ctx) => { await ctx.answerCbQuery("Paiement déjà traité"); });

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
      if (w.providerReference && w.status === "pending") {
        await ctx.reply(
          `⚠️ *Retrait #${id}* — déjà en cours chez *${w.gateway}*\n` +
          `Réf : \`${w.providerReference}\`\n\nAttendez la confirmation ou utilisez 🔍 Vérifier.`,
          { parse_mode: "Markdown" }
        );
        return;
      }
      const gateway = (w.gateway || "clapay").toLowerCase();
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
          beneficiary: WESTPAY_PAYOUT_BENEFICIARY,
        });
        if ((result.status === "success" || result.status === "pending") && result.data) {
          await storage.updateWithdrawalStatus(id, "pending", `Déclenché via Telegram bot par ${admin}`, reference, w.fees || 0, w.fees || 0);
          resultMsg = `✅ Déclenché chez *Mbiyo*\nRéf : \`${reference}\`\nStatut : ${result.status}`;
        } else {
          resultMsg = `❌ Mbiyo : ${result.message || "Échec"}`;
        }
      } else if (gateway === "lipapap" || gateway === "lipa") {
        const config = await getTelegramLipaPapConfig();
        const providerCode = config
          ? lipapapPayoutProviderCode(w.country, w.operator || "", config.payoutProviderCodes)
          : undefined;
        if (!config?.payerEmail) {
          resultMsg = "❌ LipaPap : email enregistré non configuré";
        } else if (!providerCode) {
          resultMsg = `❌ LipaPap : provider_code non documenté pour ${w.country}/${w.operator || "(vide)"}`;
        } else {
          const accountNumber = w.accountNumber || botPrependDialCode(w.phone, w.country);
          const reference = `LP-WD-${w.id}-${Date.now().toString(36).toUpperCase()}`;
          const result = await initiateLipaPapPayout(config, {
            orderId: reference,
            amount: w.amount - (w.fees || 0),
            currency: lipapapCurrency(w.country),
            beneficiaryName: w.recipientName || WESTPAY_PAYOUT_BENEFICIARY,
            accountNumber,
            payerEmail: config.payerEmail,
            providerCode,
            payerPhone: w.accountNumber ? undefined : accountNumber,
          });
          const resultStatus = String(result.status || result.result || "").toUpperCase();
          if (["ACCEPTED", "PROCESSING", "PENDING", "SUCCESS", "SETTLED"].includes(resultStatus)) {
            await storage.updateWithdrawalStatus(id, "pending", `Déclenché via Telegram bot par ${admin}`, reference, w.fees || 0, 0);
            if (result.trans_id || result.TransactionID) {
              await storage.updateWithdrawalProviderTxId(id, String(result.trans_id || result.TransactionID));
            }
            resultMsg = `✅ Déclenché chez *LipaPap*\nRéf : \`${reference}\`\nStatut : ${resultStatus}`;
          } else {
            resultMsg = `❌ LipaPap : ${result.decline_reason || result.message || resultStatus || "Échec"}`;
          }
        }
      } else if (gateway === "drimpay") {
        const config = await getDrimpayConfig();
        if (!config) {
          resultMsg = "❌ Drimpay : clé API non configurée";
        } else if (w.accountNumber) {
          resultMsg = "❌ Drimpay : les payouts bancaires ne sont pas documentés";
        } else if (!String(w.phone || "").trim()) {
          resultMsg = "❌ Drimpay : numéro de téléphone requis";
        } else {
          let route: ReturnType<typeof resolveDrimpayRoute> | undefined;
          try {
            route = resolveDrimpayRoute(config, w.country, w.operator || "", "payout");
          } catch (error: any) {
            resultMsg = `❌ Drimpay : ${error.message}`;
          }
          if (route) {
            const reference = `DP-WD-${id}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
            const localReference = await financialPool.query(
              `UPDATE withdrawals
               SET gateway = 'drimpay', provider_reference = $1
               WHERE id = $2 AND (provider_reference IS NULL OR provider_reference = '')
               RETURNING id`,
              [reference, id],
            );
            if (!localReference.rowCount) {
              resultMsg = `⚠️ Drimpay : retrait déjà associé à une référence fournisseur. Ne le relancez pas.`;
            } else {
              try {
                const result = await initiateDrimpayPayout(config, {
                  amount: w.amount - (w.fees || 0),
                  currency: route.currency,
                  countryCode: route.countryCode,
                  operator: route.operatorCode,
                  phone: botPrependDialCode(w.phone || "", w.country),
                  orderId: reference,
                  webhookUrl: `${appUrl}/api/drimpay/webhook`,
                });
                const status = normalizeDrimpayStatus(result.raw);
                await storage.updateWithdrawalProviderTxId(id, result.reference);
                if (["failed", "failure", "declined", "rejected", "error", "cancelled", "canceled"].includes(status)) {
                  resultMsg = `⚠️ Drimpay a retourné ${status}. Réf : \`${reference}\` — vérifiez le statut avant toute autre action.`;
                } else {
                  resultMsg = `✅ Déclenché chez *Drimpay*\nRéf locale : \`${reference}\`\nRéf fournisseur : \`${result.reference}\`\nStatut : ${status || "en attente"}`;
                }
              } catch (error: any) {
                const statusCode = error instanceof DrimpayApiError ? error.statusCode : undefined;
                const uncertain = !statusCode || statusCode === 408 || statusCode === 409 || statusCode === 429 || statusCode >= 500;
                if (uncertain) {
                  resultMsg = `⚠️ Résultat Drimpay incertain. Ne relancez pas ce retrait. Réf locale : \`${reference}\`. Vérifiez cette référence dans le tableau Drimpay.`;
                } else {
                  await financialPool.query(
                    `UPDATE withdrawals SET provider_reference = NULL
                     WHERE id = $1 AND provider_reference = $2 AND provider_tx_id IS NULL`,
                    [id, reference],
                  );
                  resultMsg = `❌ Drimpay : ${error.message || "demande refusée"}`;
                }
              }
            }
          }
        }
      } else if (gateway === "clapay") {
        const token = process.env.CLAPAY_API_KEY || await storage.getSetting("clapay_api_key");
        const countryCode = clapayCountryCode(w.country);
        if (!token || !countryCode) {
          resultMsg = "❌ ClaPay : configuration indisponible pour ce pays";
        } else {
          const reference = `CP-WD-${id}-${Date.now().toString(36).toUpperCase()}`;
          const operatorConfig = w.operator
            ? await storage.getWithdrawalOperatorByNameAndCountry(w.operator, w.country)
            : undefined;
          const result = await clapayInitiatePayout(token, {
            transaction_id: reference,
            amount: w.amount - (w.fees || 0),
            country_code: countryCode,
            operators_code: [operatorConfig?.clapayCode || w.operator || ""].filter(Boolean),
            method: "CASHIN",
            tunnel: "API",
            callback_url: `${appUrl}/api/clapay/callback`,
            additional_infos: {
              customer_phone: w.phone,
              customer_firstname: WESTPAY_PAYOUT_BENEFICIARY,
            },
          });
          if (result.success) {
            const ref = result.data?.signature || reference;
            await storage.updateWithdrawalStatus(id, "pending", `Déclenché via Telegram bot par ${admin}`, ref, w.fees || 0, 0);
            resultMsg = `✅ Déclenché chez *ClaPay*\nRéf : \`${ref}\``;
          } else {
            resultMsg = `❌ ClaPay : ${result.message || "Échec"}`;
          }
        }
      } else {
        resultMsg = "❌ Retrait non déclenché : le prestataire historique n'est plus disponible.";
      }

      const triggerSuccess = resultMsg.startsWith("✅") || resultMsg.startsWith("⚠️");
      await ctx.reply(`🚀 *Retrait #${id} — Déclenchement*\n\n${resultMsg}`, { parse_mode: "Markdown" });
      if (triggerSuccess) {
        await ctx.editMessageReplyMarkup({
          inline_keyboard: [
            [{ text: resultMsg.startsWith("⚠️") ? `⚠️ À vérifier par ${admin}` : `🚀 Déclenché par ${admin}`, callback_data: "wd:noop" }],
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
      if (!w.providerReference) {
        await ctx.reply(
          `⚠️ *Retrait #${id}* — Aucune référence fournisseur.\n` +
          `Le retrait n'a pas encore été déclenché chez le fournisseur.\n` +
          `Utilisez 🚀 Déclencher fournisseur d'abord.`,
          { parse_mode: "Markdown" }
        );
        return;
      }
      const gateway = (w.gateway || "clapay").toLowerCase();
      let statusMsg = "";

      if (gateway === "mbiyo") {
        const apiKey = process.env.MBIYO_API_KEY || await storage.getSetting("mbiyo_api_key");
        if (!apiKey) { await ctx.reply("❌ Clé API Mbiyo non configurée"); return; }
        const result = await mbiyoGetStatus(apiKey, w.providerReference);
        const ps = String(result.data?.status || result.status || "inconnu");
        statusMsg = `Fournisseur : *Mbiyo*\nStatut fournisseur : *${ps}*\nRéf : \`${w.providerReference}\``;
        if (result.data) statusMsg += `\n\`\`\`\n${JSON.stringify(result.data, null, 2).slice(0, 400)}\n\`\`\``;
      } else if (gateway === "lipapap" || gateway === "lipa") {
        const config = await getTelegramLipaPapConfig();
        if (!config?.payerEmail) { await ctx.reply("❌ Email enregistré LipaPap non configuré"); return; }
        const result = await getLipaPapPayoutStatus(config, w.providerReference, config.payerEmail);
        const ps = String(result.status || result.result || "inconnu");
        statusMsg = `Fournisseur : *LipaPap*\nStatut fournisseur : *${ps}*\nRéf : \`${w.providerReference}\``;
        statusMsg += `\n\`\`\`\n${JSON.stringify(result, null, 2).slice(0, 400)}\n\`\`\``;
      } else if (gateway === "drimpay") {
        if (!w.providerTxId) {
          statusMsg = `Fournisseur : *Drimpay*\nStatut : référence fournisseur absente.\nRéf locale : \`${w.providerReference}\`\nNe relancez pas le payout; vérifiez cette référence dans le tableau Drimpay.`;
        } else {
          const config = await getDrimpayConfig();
          if (!config) {
            statusMsg = "Fournisseur : *Drimpay*\nStatut : clé API non configurée.";
          } else {
            const result = await getDrimpayPayoutStatus(config, w.providerTxId);
            const ps = normalizeDrimpayStatus(result);
            statusMsg = `Fournisseur : *Drimpay*\nStatut fournisseur : *${ps || "inconnu"}*\nRéf locale : \`${w.providerReference}\`\nRéf fournisseur : \`${w.providerTxId}\``;
            statusMsg += `\n\`\`\`\n${JSON.stringify(result?.data || result, null, 2).slice(0, 400)}\n\`\`\``;
          }
        }
      } else if (gateway === "clapay") {
        const token = process.env.CLAPAY_API_KEY || await storage.getSetting("clapay_api_key");
        if (!token) {
          statusMsg = "Fournisseur : *ClaPay*\nStatut : configuration indisponible";
        } else {
          const result = await clapayGetTransactionStatus(token, w.providerReference);
          const ps = String(result.data?.status || result.status || "inconnu");
          statusMsg = `Fournisseur : *ClaPay*\nStatut fournisseur : *${ps}*\nRéf : \`${w.providerReference}\``;
          if (result.data) statusMsg += `\n\`\`\`\n${JSON.stringify(result.data, null, 2).slice(0, 400)}\n\`\`\``;
        }
      } else {
        statusMsg = "Retrait historique : aucun connecteur actif pour vérifier ce statut.";
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

  bot.command("allowip", async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!(await isAdminGroup(chatId))) return;
    const args = (ctx.message.text || "").split(/\s+/).slice(1);
    const ip = args[0]?.trim();
    const note = args.slice(1).join(" ") || "Ajouté via Telegram";
    if (!ip) {
      await ctx.reply("❌ Usage : `/allowip <ip> [note]`\nEx: `/allowip 1.2.3.4 Office Paris`", { parse_mode: "Markdown" });
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

  bot.command("blockip", async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!(await isAdminGroup(chatId))) return;
    const args = (ctx.message.text || "").split(/\s+/).slice(1);
    const ip = args[0]?.trim();
    const reason = args.slice(1).join(" ") || "Bloqué via Telegram";
    if (!ip) {
      await ctx.reply("❌ Usage : `/blockip <ip> [reason]`\nEx: `/blockip 1.2.3.4 Suspicious activity`", { parse_mode: "Markdown" });
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

  bot.command("unblockip", async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (!(await isAdminGroup(chatId))) return;
    const args = (ctx.message.text || "").split(/\s+/).slice(1);
    const ip = args[0]?.trim();
    if (!ip) {
      await ctx.reply("❌ Usage : `/unblockip <ip>`\nEx: `/unblockip 1.2.3.4`", { parse_mode: "Markdown" });
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

  bot.command("listips", async (ctx) => {
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
      msg += `/allowip <ip> [note]\n`;
      msg += `/blockip <ip> [reason]\n`;
      msg += `/unblockip <ip>`;

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
    const merchantText = merchantBotText(merchant.telegramBotLanguage);
    const geo = await getGeoInfo(candidate);
    console.log(`[TG/addip] geo pour ${candidate}: country="${geo.country}" city="${geo.city}"`);

    if (!geo.country || !AFRICAN_COUNTRIES.has(geo.country)) {
      await ctx.reply(merchantText.ipDenied);
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
      await ctx.reply(merchantText.ipDone);
      await alertAdminGroup(
        `✅ *IP autorisée via Telegram marchand*\n\n` +
        `👤 Marchand : *${merchant.name}*\n` +
        `🌐 IP : \`${candidate}\`\n` +
        `📍 ${geo.city || "?"}${geo.country ? ", " + geo.country : ""}\n` +
        `🔌 ${geo.isp || "?"}`
      );
    } catch (err: any) {
      console.error(`[TG/addip] Erreur addAllowedIp pour ${candidate}:`, err?.message);
      await ctx.reply(merchantText.ipError);
    }
  }

  // ─── /addip — Commande pour ajouter une IP depuis un groupe marchand ──────────
  // ⚠️  IMPORTANT : utiliser cette commande si le bot ne répond pas aux messages
  // texte (mode privacy Telegram activé). Les commandes /xxx sont TOUJOURS reçues
  // par le bot même en mode privacy, contrairement aux messages texte ordinaires.
  bot.command("addip", async (ctx) => {
    if (ctx.chat?.type === "private") return;

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
      await ctx.reply(merchantBotText(merchant.telegramBotLanguage).ipUsage, { parse_mode: "Markdown" });
      return;
    }

    await ctx.reply(merchantBotText(merchant.telegramBotLanguage).ipProcessing);
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

      // Les messages privés non traités par /start doivent rester silencieux.
      if (!isGroup) return next();

      if (isGroup) {
        // Vérifier si c'est un groupe marchand avec une IP à ajouter
        const merchant = await getMerchantForGroup(chatId);
        if (!merchant) return next();

        const ipMatch = text.match(IP_EXTRACT_REGEX);
        if (!ipMatch || !isValidIpv4(ipMatch[1])) return next();
        const candidate = ipMatch[1];
        console.log(`[TG] IP détectée (texte) dans groupe marchand ${chatId}: ${candidate}`);

        await ctx.reply("⏳ Ajout de l’adresse IP en cours...");
        await whitelistMerchantIp(ctx, candidate, merchant);
        return;
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
  grossReceived: string;
  westpayFee: string;
  netCredited: string;
  amountCredited: string;
  noFee: string;
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
    grossReceived: "💳 *Brut reçu :*",
    westpayFee: "📉 *Frais WestPay",
    netCredited: "✅ *Net crédité :*",
    amountCredited: "💳 *Montant crédité :*",
    noFee: "sans frais",
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
    grossReceived: "💳 *Gross received:*",
    westpayFee: "📉 *WestPay fee",
    netCredited: "✅ *Net credited:*",
    amountCredited: "💳 *Amount credited:*",
    noFee: "no fee",
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
    grossReceived: "💳 *收到总额：*",
    westpayFee: "📉 *WestPay 手续费",
    netCredited: "✅ *入账净额：*",
    amountCredited: "💳 *入账金额：*",
    noFee: "无手续费",
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
    grossReceived: "💳 *Brutto erhalten:*",
    westpayFee: "📉 *WestPay-Gebühr",
    netCredited: "✅ *Netto gutgeschrieben:*",
    amountCredited: "💳 *Gutgeschriebener Betrag:*",
    noFee: "gebührenfrei",
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
    grossReceived: "💳 *प्राप्त सकल राशि:*",
    westpayFee: "📉 *WestPay शुल्क",
    netCredited: "✅ *जमा शुद्ध राशि:*",
    amountCredited: "💳 *जमा राशि:*",
    noFee: "बिना शुल्क",
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
  platformFee?: number;
  creditedAmount?: number;
}): Promise<void> {
  if (!bot) return;
  try {
    const merchant = await storage.getMerchantById(merchantId);
    if (!merchant?.telegramChatId) return;

    const lang = normalizeBotLanguage(merchant.telegramBotLanguage);
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
    const grossAmount = data.amount;
    const westpayFee = data.platformFee ?? Math.round(grossAmount * feeRate);
    const netCredited = data.creditedAmount ?? grossAmount - westpayFee;
    const effectiveFeeRate = grossAmount > 0 ? westpayFee / grossAmount : 0;
    const feePct = (effectiveFeeRate * 100).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
    const feePctEn = (effectiveFeeRate * 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

    const feeLines = westpayFee > 0 ? [
      `${t.grossReceived} ${formatAmountC(grossAmount, data.country)}`,
      `${t.westpayFee} (${lang === "fr" ? feePct : feePctEn}%):* -${formatAmountC(westpayFee, data.country)}`,
      `${t.netCredited} ${formatAmountC(netCredited, data.country)}`,
    ] : [
      `${t.amountCredited} ${formatAmountC(grossAmount, data.country)} *(${t.noFee})*`,
    ];

    const msg = [
      t.header(countryLabel(data.country)),
      ``,
      t.newPayment,
      ``,
      ...feeLines,
      `${t.payer} ${data.payerNumber || "N/A"}`,
      `${t.country} ${countryLabel(data.country)}`,
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
  platformFee?: number;
  creditedAmount?: number;
}): Promise<void> {
  const dateStr = new Date().toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  });
  const icon = data.status === "confirmed" ? "✅" : "❌";
  const statusLabel = data.status === "confirmed" ? "Succès" : "Échoué";
  const methodLabel = data.provider === "sms" ? "SMS" : "Mobile Money";

  const msg = [
    `${icon} *Nouvelle transaction WestPay*`,
    ``,
    `📋 *Type :* Paiement`,
    `🔖 *ID :* \`${data.txId}\``,
    `🏪 *Marchand :* ${data.merchantName}`,
    `📞 *Numéro client :* ${data.payerNumber || "N/A"}`,
    `🌍 *Pays :* ${countryLabel(data.country)}`,
    `💰 *Montant total :* ${formatAmountC(data.amount, data.country)}`,
    `💵 *Frais plateforme :* ${formatAmountC(data.platformFee ?? 0, data.country)}`,
    `✅ *Montant reçu :* ${formatAmountC(data.creditedAmount ?? data.amount, data.country)}`,
    `📱 *Méthode :* ${methodLabel}`,
    `📊 *Statut :* ${statusLabel}`,
    `📅 *Date :* ${dateStr}`,
  ].join("\n");

  await notifyAdminGroup(msg);
}

export async function notifyAdminManualPaymentSubmission(data: {
  paymentId: number;
  depositReference: string;
  customerReference: string;
  merchantName: string;
  payerName?: string | null;
  payerNumber: string;
  recipientPhone: string;
  recipientName: string;
  country: string;
  operator: string;
  amount: number;
}): Promise<boolean> {
  try {
    const groupId = await storage.getSetting("telegram_group_id");
    if (!bot || !groupId) return false;
    const depositReference = data.depositReference.trim() || "N/A";
    const customerReference = data.customerReference.replace(/\s+/g, " ").trim().slice(0, 120) || "N/A";
    const operator = data.operator.replace(/\s+/g, " ").trim() || "N/A";
    const message = [
      "Paiement manuel à vérifier",
      `ID de demande : ${data.paymentId}`,
      `Référence du dépôt : ${depositReference}`,
      `Référence saisie par le client : ${customerReference}`,
      `Marchand : ${data.merchantName}`,
      `Montant : ${formatAmountC(data.amount, data.country)}`,
      `Pays : ${countryLabel(data.country)}`,
      `Opérateur : ${operator}`,
      `Nom du client : ${data.payerName || "N/A"}`,
      `Numéro du client : ${data.payerNumber || "N/A"}`,
      `Numéro destinataire : ${data.recipientPhone || "N/A"}`,
      `Titulaire du compte destinataire : ${data.recipientName || "N/A"}`,
      "",
      "Vérifiez la réception auprès du compte Mobile Money avant d’approuver. Ne demandez pas de PIN ni de code secret.",
    ].join("\n");
    await bot.telegram.sendMessage(groupId, message, {
      reply_markup: {
        inline_keyboard: [[
          { text: "Approuver et créditer", callback_data: `pay:approve:p:${data.paymentId}` },
          { text: "Rejeter", callback_data: `pay:reject:p:${data.paymentId}` },
        ]],
      },
    });
    return true;
  } catch (error: any) {
    console.error("[TELEGRAM] Notification d’encaissement manuel impossible:", error?.message || error);
    return false;
  }
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
  accountNumber?: string | null;
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
  const withdrawal = await storage.getWithdrawalById(data.id).catch(() => undefined);
  const accountNumber = data.accountNumber || withdrawal?.accountNumber || null;
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
    accountNumber ? `🏦 *Compte bancaire :* ${accountNumber}` : `📞 *Numéro réception :* ${data.phone}`,
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
  accountNumber?: string | null;
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
  const withdrawal = data.id ? await storage.getWithdrawalById(data.id).catch(() => undefined) : undefined;
  const accountNumber = data.accountNumber || withdrawal?.accountNumber || null;
  const lines = [
    `🚨 *Erreur retrait WestPay*`,
    ``,
    data.id ? `🔖 *Retrait :* \`WD-${data.id}\`` : null,
    `🏪 *Marchand :* ${data.merchantName}`,
    data.merchantEmail ? `📧 *Email :* \`${data.merchantEmail}\`` : null,
    data.merchantId ? `🆔 *ID marchand :* ${data.merchantId}` : null,
    `🌍 *Pays :* ${countryLabel(data.country)}`,
    `💰 *Montant :* ${formatAmountC(data.amount, data.country)}`,
    accountNumber
      ? `🏦 *Compte bancaire :* ${accountNumber}`
      : data.phone ? `📞 *Numéro destinataire :* ${data.phone}` : null,
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
  account: string;
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
    account: "Compte bancaire",
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
    account: "Bank account",
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
    account: "银行账户",
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
    account: "Bankkonto",
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
    account: "बैंक खाता",
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
  accountNumber?: string | null;
  operator?: string | null;
  status: "pending" | "approved" | "failed" | "rejected";
}): Promise<void> {
  if (!bot) return;
  try {
    const merchant = await storage.getMerchantById(merchantId);
    if (!merchant?.telegramChatId) return;
    const withdrawal = await storage.getWithdrawalById(data.id).catch(() => undefined);
    const accountNumber = data.accountNumber || withdrawal?.accountNumber || null;

    const lang = normalizeBotLanguage((merchant as any).telegramBotLanguage);
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
      accountNumber ? `🏦 *${tw.account} :* ${accountNumber}` : `📞 *${tw.phone} :* ${data.phone}`,
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

    const lang = normalizeBotLanguage((merchant as any).telegramBotLanguage);
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
