import { Telegraf } from "telegraf";
import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { pool } from "./db";

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
    const res = await fetch(`http://ip-api.com/json/${cleanIp}?fields=status,city,regionName,country,isp,query,proxy,hosting,mobile`, { signal: AbortSignal.timeout(4000) });
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

// ─── Rate Limiter ────────────────────────────────────────────────────────────
const MAX_FAILED = 5;
const LOCK_DURATION_MS = 60 * 60 * 1000;
const failedAttempts = new Map<string, { count: number; lockedUntil: Date | null }>();

// ─── Broadcast conversationnel (groupe admin) ─────────────────────────────────
interface BroadcastSession {
  step: "waiting_type" | "waiting_content" | "waiting_buttons";
  broadcastType?: "all_groups" | "merchants_only";
  message: string;
  fileId?: string;
  buttons: Array<{ text: string; url: string }>;
  initiator: string;
}
const broadcastSessions = new Map<string, BroadcastSession>(); // chatId -> session

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

// ─── Known Groups Registry ───────────────────────────────────────────────────
async function getKnownGroups(): Promise<string[]> {
  const raw = await storage.getSetting("telegram_known_groups");
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function registerKnownGroup(chatId: string): Promise<void> {
  const groups = await getKnownGroups();
  if (!groups.includes(chatId)) {
    groups.push(chatId);
    await storage.setSetting("telegram_known_groups", JSON.stringify(groups));
  }
}

// ─── Merchant group helper ───────────────────────────────────────────────────
async function getMerchantForGroup(chatId: string) {
  return storage.getMerchantByTelegramChatId(chatId);
}

const MERCHANT_AIDE_MSG = (name: string) =>
  `📖 *Commandes disponibles — ${name}*\n\n` +
  `💰 /solde — Solde détaillé par pays\n` +
  `📋 /transactions — Les 5 dernières transactions\n` +
  `📊 /stats — Vos statistiques globales\n` +
  `❓ /aide — Afficher cette aide\n\n` +
  `📲 *Notifications automatiques*\nChaque paiement confirmé est affiché ici en temps réel.`;

// ─── Security helpers ─────────────────────────────────────────────────────────
async function getAdminGroupId(): Promise<string | undefined> {
  // Priorité : DB → env var TELEGRAM_ADMIN_GROUP_ID
  const fromDb = await storage.getSetting("telegram_group_id");
  return fromDb || process.env.TELEGRAM_ADMIN_GROUP_ID || undefined;
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
      `💰 *Solde compte :* ${formatAmountPlain(mc.balance)} F CFA\n` +
      `💳 *Solde reversement :* ${formatAmountPlain(mc.balance)} F CFA\n` +
      `📊 *Dépôts réussis aujourd'hui :* ${stats.success}\n` +
      `📈 *Taux de réussite aujourd'hui :* ${successRate(stats.success, stats.total)}`
    );
  }
  return parts.join("\n\n─────────────────\n\n");
}

export function initTelegramBot(): Telegraf | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("[TELEGRAM] TELEGRAM_BOT_TOKEN non defini — bot non demarre");
    return null;
  }

  bot = new Telegraf(token);

  // ─── Initialisation : reconstruire la liste des groupes connus ────────────
  (async () => {
    try {
      const known = await getKnownGroups();
      const toAdd: string[] = [];

      // Priorité DB → env var TELEGRAM_ADMIN_GROUP_ID (auto-sauvegarde en DB si absent)
      let adminGroupId = await storage.getSetting("telegram_group_id");
      if (!adminGroupId && process.env.TELEGRAM_ADMIN_GROUP_ID) {
        adminGroupId = process.env.TELEGRAM_ADMIN_GROUP_ID;
        await storage.setSetting("telegram_group_id", adminGroupId);
        console.log(`[TELEGRAM] telegram_group_id initialisé depuis env var : ${adminGroupId}`);
      }
      if (adminGroupId && !known.includes(adminGroupId)) toAdd.push(adminGroupId);

      const merchants = await storage.getMerchants();
      for (const m of merchants) {
        if (m.telegramChatId && !known.includes(m.telegramChatId) && !toAdd.includes(m.telegramChatId)) {
          toAdd.push(m.telegramChatId);
        }
      }

      if (toAdd.length > 0) {
        const updated = [...known, ...toAdd];
        await storage.setSetting("telegram_known_groups", JSON.stringify(updated));
        console.log(`[TELEGRAM] Groupes connus mis a jour : ${updated.length} groupe(s)`);
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
          return `${i + 1}. ${statusIcon} *${formatAmount(t.amount)}*\n   ${countryLabel(t.country)} — ${date}${t.payerNumber ? `\n   📞 ${t.payerNumber}` : ""}\n   🔖 \`${t.txId}\``;
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
        return `${i + 1}. ${statusIcon} *${formatAmount(t.amount)}*\n   ${countryLabel(t.country)} — ${date}${t.payerNumber ? `\n   📞 ${t.payerNumber}` : ""}\n   🔖 \`${t.txId}\``;
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
      message: "",
      buttons: [],
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
      `Envoyez maintenant votre message.\n\n` +
      `• Texte seul → envoyez le texte\n` +
      `• Avec image → envoyez une photo avec le texte en *légende*\n\n` +
      `Vous pouvez utiliser *gras*, _italique_, \`code\` (Markdown Telegram).\n\n` +
      `Envoyez /annuler pour annuler.`,
      { parse_mode: "Markdown" }
    );
  });

  // ─── /annuler (annule le broadcast en cours) ──────────────────────────────
  bot.command("annuler", async (ctx) => {
    const chatId = String(ctx.chat.id);
    if (broadcastSessions.has(chatId)) {
      broadcastSessions.delete(chatId);
      await ctx.reply("❌ Broadcast annulé.");
    }
  });

  // ─── Photo reçue dans le groupe admin (pour le broadcast) ─────────────────
  bot.on("photo", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const session = broadcastSessions.get(chatId);
    if (!session || session.step === "waiting_type") return;
    if (session.step !== "waiting_content") return;
    if (!await isAdminGroup(chatId)) return;

    const photos = ctx.message.photo;
    const bestPhoto = photos[photos.length - 1];
    const caption = ctx.message.caption?.trim() || session.message;

    session.fileId = bestPhoto.file_id;
    session.message = caption;
    session.step = "waiting_buttons";
    broadcastSessions.set(chatId, session);

    await ctx.reply(
      "✅ Photo reçue" + (caption ? ` avec le texte :\n_${caption}_` : " (sans texte)") + "\n\n" +
      "📎 *Voulez-vous ajouter des boutons ?*\n\n" +
      "Format (un par ligne) :\n`Texte du bouton | https://lien.com`\n\n" +
      "Exemple :\n`Se connecter | https://westpay.cfd/merchant-login`\n\n" +
      "Ou envoyez /skip pour diffuser sans boutons.",
      { parse_mode: "Markdown" }
    );
  });

  // ─── /skip — diffuser sans boutons ────────────────────────────────────────
  bot.command("skip", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const session = broadcastSessions.get(chatId);
    if (!session || session.step !== "waiting_buttons") return;
    if (!await isAdminGroup(chatId)) return;

    broadcastSessions.delete(chatId);
    await ctx.reply("📤 Diffusion en cours...");
    const result = await broadcastToMerchants({
      message: session.message,
      fileId: session.fileId,
      buttons: undefined,
      useAllKnownGroups: session.broadcastType === "all_groups",
    });
    const typeLabel = session.broadcastType === "all_groups" ? "🌐 Tous les groupes" : "🏪 Groupes marchands";
    await ctx.reply(
      `✅ *Diffusion terminée*\n\n📋 Type : ${typeLabel}\n📤 Envoyé : *${result.sent}*\n❌ Échec : *${result.failed}*`,
      { parse_mode: "Markdown" }
    );
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
      session.message = text.trim();
      session.step = "waiting_buttons";
      broadcastSessions.set(chatId, session);
      await ctx.reply(
        `✅ Message enregistré :\n_${text.slice(0, 200)}${text.length > 200 ? "…" : ""}_\n\n` +
        "📎 *Voulez-vous ajouter des boutons ?*\n\n" +
        "Format (un par ligne) :\n`Texte du bouton | https://lien.com`\n\n" +
        "Ou envoyez /skip pour diffuser sans boutons.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (session.step === "waiting_buttons") {
      // Parse button lines: "Texte | https://url"
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      const parsedButtons: Array<{ text: string; url: string }> = [];
      const errors: string[] = [];

      for (const line of lines) {
        const sep = line.indexOf("|");
        if (sep === -1) { errors.push(`• "${line}" — séparateur | manquant`); continue; }
        const btnText = line.slice(0, sep).trim();
        const btnUrl = line.slice(sep + 1).trim();
        if (!btnText || !btnUrl) { errors.push(`• "${line}" — texte ou URL vide`); continue; }
        if (!btnUrl.startsWith("http")) { errors.push(`• "${line}" — URL invalide (doit commencer par http)`); continue; }
        parsedButtons.push({ text: btnText, url: btnUrl });
      }

      if (errors.length > 0 && parsedButtons.length === 0) {
        await ctx.reply(
          `❌ *Erreurs dans les boutons :*\n${errors.join("\n")}\n\n` +
          "Format attendu : `Texte | https://lien.com` (un par ligne)",
          { parse_mode: "Markdown" }
        );
        return;
      }

      broadcastSessions.delete(chatId);
      await ctx.reply("📤 Diffusion en cours...");

      const buttonsPayload = parsedButtons.length > 0 ? [parsedButtons] : undefined;
      const result = await broadcastToMerchants({
        message: session.message,
        fileId: session.fileId,
        buttons: buttonsPayload,
        useAllKnownGroups: session.broadcastType === "all_groups",
      });

      const typeLabel = session.broadcastType === "all_groups" ? "🌐 Tous les groupes" : "🏪 Groupes marchands";
      let reply = `✅ *Diffusion terminée*\n\n📋 Type : ${typeLabel}\n📤 Envoyé : *${result.sent}*\n❌ Échec : *${result.failed}*`;
      if (errors.length > 0) reply += `\n\n⚠️ ${errors.length} bouton(s) ignoré(s) (format invalide)`;
      await ctx.reply(reply, { parse_mode: "Markdown" });
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
      const adminEmail = await storage.getSetting("admin_email_hint") || "devappmanagement40@gmail.com";

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
          `📊 *Statistiques & Soldes*\n` +
          `/stats — Statistiques globales\n` +
          `/solde — Soldes détaillés de tous les marchands\n\n` +
          `📢 *Diffusion*\n` +
          `/broadcast MESSAGE — Envoyer un message dans tous les groupes\n\n` +
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

  // ─── Bot ajouté à un groupe (API moderne : my_chat_member) ──────────────────
  bot.on("my_chat_member", async (ctx) => {
    const update = ctx.update.my_chat_member;
    if (!update) return;
    const newStatus = update.new_chat_member?.status;
    if (newStatus !== "member" && newStatus !== "administrator") return;

    const chat = update.chat;
    if (chat.type !== "group" && chat.type !== "supergroup") return;

    const chatId = String(chat.id);
    const groupTitle = (chat as any).title || "ce groupe";

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

  // ─── Messages non reconnus (DM uniquement) ─────────────────────────────────
  // ─── Détection IP dans les groupes marchands ────────────────────────────────
  // Quand un marchand envoie une adresse IP dans son groupe, le bot la whitelist
  // automatiquement si elle vient d'Afrique, sinon refuse.
  const AFRICAN_COUNTRIES = new Set([
    // Afrique de l'Ouest
    "Togo", "Benin", "Ivory Coast", "Côte d'Ivoire", "Senegal", "Mali",
    "Burkina Faso", "Ghana", "Nigeria", "Guinea", "Niger", "Mauritania",
    "Sierra Leone", "Liberia", "Cape Verde", "Gambia", "Guinea-Bissau",
    // Afrique Centrale
    "Cameroon", "Democratic Republic of the Congo", "Republic of the Congo",
    "Congo", "Gabon", "Chad", "Central African Republic", "Equatorial Guinea",
    "São Tomé and Príncipe", "Angola", "Rwanda", "Burundi",
    // Afrique de l'Est
    "Kenya", "Tanzania", "Uganda", "Ethiopia", "Somalia", "Eritrea",
    "Djibouti", "South Sudan", "Sudan", "Mozambique", "Madagascar",
    "Comoros", "Seychelles", "Mauritius", "Zambia", "Zimbabwe",
    "Malawi", "Botswana", "Namibia", "Lesotho", "Eswatini", "South Africa",
    // Afrique du Nord
    "Morocco", "Algeria", "Tunisia", "Libya", "Egypt",
  ]);

  const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

  bot.on("message", async (ctx) => {
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    const chatId = String(ctx.chat.id);

    if (isGroup) {
      const merchant = await getMerchantForGroup(chatId);
      if (!merchant) return;

      const text = ("text" in ctx.message ? ctx.message.text : "") || "";
      const candidate = text.trim();

      if (!IP_REGEX.test(candidate)) return;

      // Réponse immédiate en chinois
      await ctx.reply("请稍等，我这就帮你添加。");

      const geo = await getGeoInfo(candidate);

      if (!geo.country || !AFRICAN_COUNTRIES.has(geo.country)) {
        await ctx.reply("❌fake ip 该IP地址无法添加到我们的白名单中。");
        await alertAdminGroup(
          `⚠️ *IP non africaine refusée*\n\n` +
          `👤 Marchand : *${merchant.name}*\n` +
          `🌐 IP : \`${candidate}\`\n` +
          `📍 ${geo.city || "?"}${geo.country ? ", " + geo.country : " — pays inconnu"}\n` +
          `🔌 ${geo.isp || "?"}\n\n` +
          `❌ Impossible — cette IP vient de *${geo.country || "pays inconnu"}*, qui n'est pas en Afrique.`
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
        });
        await ctx.reply("done ✅");
        await alertAdminGroup(
          `✅ *IP autorisée via Telegram marchand*\n\n` +
          `👤 Marchand : *${merchant.name}*\n` +
          `🌐 IP : \`${candidate}\`\n` +
          `📍 ${geo.city}${geo.country ? ", " + geo.country : ""}\n` +
          `🔌 ${geo.isp || "?"}`
        );
      } catch {
        await ctx.reply("❌ Erreur lors de l'ajout. Contactez l'administrateur.");
      }
      return;
    }

    const merchant = await storage.getMerchantByTelegramChatId(chatId);
    if (!merchant) {
      await ctx.reply("🔒 此机器人仅供已获授权的 WestPay 商户使用。\n\n如果您是商户，请向您的管理员申请激活码。");
    }
  });

  console.log("[TELEGRAM] Bot initialise");
  scheduleDailyReport();

  return bot;
}

export function setupWebhook(app: Express, secret: string): void {
  if (!bot) return;
  const path = `/api/telegram/webhook/${secret}`;
  app.post(path, async (req: Request, res: Response) => {
    res.sendStatus(200);
    try {
      await bot!.handleUpdate(req.body);
    } catch (err: any) {
      console.error("[TELEGRAM] Erreur traitement update webhook:", err.message);
    }
  });
  console.log(`[TELEGRAM] Route webhook enregistree : POST ${path}`);
}

async function tryRegisterWebhook(webhookUrl: string): Promise<boolean> {
  if (!bot) return false;
  try {
    const current = await bot.telegram.getWebhookInfo();
    console.log(`[TELEGRAM] Webhook actuel : "${current.url || "(vide)"}"`);
    if (current.url === webhookUrl) {
      console.log(`[TELEGRAM] Webhook deja actif — aucune action requise`);
      return true;
    }
    await bot.telegram.deleteWebhook({ drop_pending_updates: false });
    await bot.telegram.setWebhook(webhookUrl, {
      allowed_updates: ["message", "callback_query", "my_chat_member", "chat_member"],
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

export async function startPolling(): Promise<void> {
  if (!bot) return;
  try {
    // Ne PAS appeler deleteWebhook() ici — si un webhook de production (Plesk) est actif,
    // le supprimer couperait la réception des commandes en production.
    // bot.launch() échouera avec une 409 si un webhook est actif, ce qui est ignoré ci-dessous.
    bot.launch({ dropPendingUpdates: false }).catch((err: any) => {
      console.warn("[TELEGRAM] Polling interrompu (conflit prod/dev — ignoré):", err.message);
    });
    console.log("[TELEGRAM] Bot demarre en mode polling (developpement)");
    process.once("SIGINT", () => bot?.stop("SIGINT"));
    process.once("SIGTERM", () => bot?.stop("SIGTERM"));
  } catch (err: any) {
    console.error("[TELEGRAM] Erreur demarrage polling:", err.message);
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

    const feeRate = merchant?.feeExempt ? 0 : 0.055;
    const grossAmount = data.amount;
    const westpayFee = Math.round(grossAmount * feeRate);
    const netCredited = grossAmount - westpayFee;

    const feeLinesFr = feeRate > 0 ? [
      `💳 *Brut reçu :* ${formatAmount(grossAmount)}`,
      `📉 *Frais WestPay (5,5%) :* -${formatAmount(westpayFee)}`,
      `✅ *Net crédité :* ${formatAmount(netCredited)}`,
    ] : [
      `💳 *Montant crédité :* ${formatAmount(grossAmount)} *(sans frais)*`,
    ];
    const feeLinesEn = feeRate > 0 ? [
      `💳 *Gross received:* ${formatAmount(grossAmount)}`,
      `📉 *WestPay fee (5.5%):* -${formatAmount(westpayFee)}`,
      `✅ *Net credited:* ${formatAmount(netCredited)}`,
    ] : [
      `💳 *Amount credited:* ${formatAmount(grossAmount)} *(no fee)*`,
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
      `${t.totalBalance} ${formatAmountPlain(newBalance)} ${t.currency}`,
      `${t.payoutBalance} ${formatAmountPlain(newBalance)} ${t.currency}`,
      t.successfulDeposits(todayStats.success, formatAmountPlain(todayStats.amount), t.currency),
      `${t.successRate} ${successRate(todayStats.success, todayStats.total)}`,
    ].join("\n");

    await safeSend(merchant.telegramChatId, msg);
  } catch (err) {
    console.error("[TELEGRAM] Erreur notification marchand:", (err as any).message);
  }
}

async function safeSend(chatId: string, message: string): Promise<void> {
  if (!bot) return;
  try {
    await bot.telegram.sendMessage(chatId, message, { parse_mode: "Markdown" });
  } catch (err: any) {
    console.error("[TELEGRAM] Echec envoi Markdown, tentative texte brut:", err.message);
    try {
      const plain = message.replace(/[*_`[\]()~>#+=|{}.!\\-]/g, "");
      await bot.telegram.sendMessage(chatId, plain);
    } catch (err2: any) {
      console.error("[TELEGRAM] Echec envoi texte brut:", err2.message);
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
  if (!bot) return;
  const replyMarkup = buttons && buttons.length > 0 ? buildInlineKeyboard(buttons) : undefined;

  if (imageSource) {
    try {
      // imageSource peut être une URL http ou un file_id Telegram
      await bot.telegram.sendPhoto(chatId, imageSource, {
        caption: message,
        parse_mode: "Markdown",
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
      return;
    } catch (err: any) {
      console.error("[TELEGRAM] Echec sendPhoto, tentative sans image:", err.message);
    }
  }

  try {
    await bot.telegram.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  } catch (err: any) {
    console.error("[TELEGRAM] Echec envoi Markdown, tentative texte brut:", err.message);
    try {
      const plain = message.replace(/[*_`[\]()~>#+=|{}.!\\-]/g, "");
      await bot.telegram.sendMessage(chatId, plain, {
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    } catch (err2: any) {
      console.error("[TELEGRAM] Echec envoi texte brut:", err2.message);
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
    chatIds = await getKnownGroups();
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
    `💰 *Montant total :* ${formatAmount(data.amount)}`,
    `💵 *Frais plateforme :* 0 F CFA`,
    `✅ *Montant reçu :* ${formatAmount(data.amount)}`,
    `📱 *Méthode :* ${methodLabel}`,
    `📊 *Statut :* ${statusLabel}`,
    `📅 *Date :* ${dateStr}`,
  ].join("\n");

  await notifyAdminGroup(msg);
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
}): Promise<void> {
  const dateStr = new Date().toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  });
  const icon = data.status === "approved" ? "💸" : data.status === "pending" ? "⏳" : "❌";
  const statusLabel = data.status === "approved" ? "Effectué" : data.status === "rejected" ? "Rejeté" : data.status === "pending" ? "En attente" : "Échoué";
  const net = data.amount - data.fees;

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
    `💰 *Montant demandé :* ${formatAmount(data.amount)}`,
    `💵 *Frais plateforme :* ${formatAmount(data.fees)}`,
    `✅ *Montant envoyé :* ${formatAmount(net)}`,
    data.operator ? `📱 *Opérateur :* ${data.operator}` : null,
    `⚙️ *Mode :* ${data.mode === "auto" ? "Automatique" : "Manuel"}`,
    `📊 *Statut :* ${statusLabel}`,
    `📅 *Date :* ${dateStr} UTC`,
  ].filter(Boolean) as string[];

  await notifyAdminGroup(lines.join("\n"));
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
      `💰 *${tw.amountRequested} :* ${formatAmount(data.amount)}`,
      data.fees > 0 ? `💵 *${tw.fees} :* ${formatAmount(data.fees)}` : null,
      data.fees > 0 ? `✅ *${tw.amountSent} :* ${formatAmount(net)}` : null,
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
    `💰 *Nouveau solde :* ${formatAmount(data.newBalance)}`,
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

  const [txRow] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS total_payments,
            COUNT(*) AS total_count
     FROM transactions WHERE created_at >= $1 AND created_at <= $2 AND status = 'confirmed'`,
    [dayStart.toISOString(), dayEnd.toISOString()]
  ).then(r => r.rows);

  const [wdRow] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total_withdrawals,
            COALESCE(SUM(fees), 0) AS total_fees,
            COUNT(*) AS wd_count
     FROM withdrawals WHERE processed_at >= $1 AND processed_at <= $2 AND status = 'approved'`,
    [dayStart.toISOString(), dayEnd.toISOString()]
  ).then(r => r.rows);

  // ── Statistiques sécurité / bots du jour ────────────────────────────────
  const [secRow] = await pool.query(
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

export async function sendMerchantOtpTelegram(chatId: string, otp: string, merchantName: string): Promise<boolean> {
  if (!bot) {
    console.log(`[TELEGRAM OTP] Bot non initialisé — OTP pour ${chatId}: ${otp}`);
    return false;
  }
  const msg = [
    `🤖 *RobotPay — Code de connexion*`,
    ``,
    `👤 *Marchand :* ${merchantName}`,
    ``,
    `🔑 *Votre code OTP :*`,
    ``,
    `\`\`\``,
    `  ${otp}`,
    `\`\`\``,
    ``,
    `⏱️ _Valide 5 minutes — usage unique._`,
    `🔒 _Ne communiquez jamais ce code._`,
  ].join("\n");
  try {
    await safeSend(chatId, msg);
    return true;
  } catch (err: any) {
    console.error("[TELEGRAM OTP] Échec envoi:", err.message);
    return false;
  }
}
