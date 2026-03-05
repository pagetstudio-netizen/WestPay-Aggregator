import { Telegraf } from "telegraf";
import { storage } from "./storage";

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
  return storage.getSetting("telegram_group_id");
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

      const adminGroupId = await storage.getSetting("telegram_group_id");
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
        await ctx.reply("🔒 Ce bot est réservé aux marchands WestPay autorisés.\n\nSi vous êtes marchand, demandez votre code d'activation à votre administrateur.", { parse_mode: "Markdown" });
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

  // ─── /broadcast (groupe admin uniquement) ─────────────────────────────────
  bot.command("broadcast", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup) {
      await ctx.reply("❌ Cette commande est réservée au groupe admin.");
      return;
    }
    const authorized = await isAdminGroup(chatId);
    if (!authorized) return;

    const text = ctx.message.text || "";
    const parts = text.split(" ");
    parts.shift();
    const message = parts.join(" ").trim();

    if (!message) {
      await ctx.reply(
        "📢 *Diffusion de message*\n\nUsage :\n`/broadcast Votre message ici`\n\nLe message sera envoyé à tous les groupes connectés.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const knownGroups = await getKnownGroups();
    if (knownGroups.length === 0) {
      await ctx.reply("⚠️ Aucun groupe enregistré. Configurez d'abord des groupes marchands via `/setmarchand`.", { parse_mode: "Markdown" });
      return;
    }

    const sender = formatUser(ctx);
    const broadcastMsg = `📢 *Message de WestPay*\n\n${message}\n\n_— ${sender}_`;

    let sent = 0;
    let failed = 0;
    for (const groupId of knownGroups) {
      try {
        await bot!.telegram.sendMessage(groupId, broadcastMsg, { parse_mode: "Markdown" });
        sent++;
      } catch {
        failed++;
      }
    }

    await ctx.reply(
      `✅ *Diffusion terminée*\n\n📤 Envoyé : *${sent}* groupe(s)\n❌ Échec : *${failed}* groupe(s)`,
      { parse_mode: "Markdown" }
    );
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

  // ─── /connexionid (groupe admin uniquement) ───────────────────────────────
  bot.command("connexionid", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";

    if (isGroup) {
      if (!await isAdminGroup(chatId)) return;
    }

    try {
      const platformUrl = await storage.getSetting("platform_url") || "https://westpay.replit.app";
      const adminEmail = await storage.getSetting("admin_email_hint") || "admin@westpay.com";

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
          `/connexionid — Rappel des URLs et identifiants admin\n` +
          `/seturl URL — Définir l'URL de la plateforme\n` +
          `/restreint — Voir les utilisateurs bloqués\n` +
          `/restreint ID — Débloquer un utilisateur spécifique\n` +
          `/restreint tous — Débloquer tout le monde\n\n` +
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

  // ─── Bot ajouté à un groupe ────────────────────────────────────────────────
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

  // ─── Messages non reconnus (DM uniquement) ─────────────────────────────────
  bot.on("message", async (ctx) => {
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (isGroup) return;

    const chatId = String(ctx.chat.id);
    const merchant = await storage.getMerchantByTelegramChatId(chatId);
    if (!merchant) {
      await ctx.reply("🔒 Ce bot est réservé aux marchands WestPay autorisés.\n\nSi vous êtes marchand, demandez votre code d'activation à votre administrateur.");
    }
  });

  const launchBot = async (attempt = 1): Promise<void> => {
    try {
      await bot!.launch({ dropPendingUpdates: true, allowedUpdates: [] });
      console.log("[TELEGRAM] Bot connecte et actif (polling)");
    } catch (err: any) {
      if (err.message?.includes("409") && attempt <= 5) {
        const delay = attempt * 5000;
        console.log(`[TELEGRAM] Conflit detecte (autre instance active), retry dans ${delay / 1000}s...`);
        setTimeout(() => launchBot(attempt + 1), delay);
      } else if (err.message?.includes("409")) {
        console.log("[TELEGRAM] Instance de production deja active — polling desactive sur ce serveur.");
      } else {
        console.error("[TELEGRAM] Erreur demarrage bot:", err.message);
      }
    }
  };

  launchBot();

  console.log("[TELEGRAM] Bot initialise");

  process.once("SIGINT", () => bot?.stop("SIGINT"));
  process.once("SIGTERM", () => bot?.stop("SIGTERM"));

  return bot;
}

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

    const countries = await storage.getMerchantCountries(merchantId);
    const mc = countries.find(c => c.country === data.country);
    const newBalance = mc ? mc.balance : 0;

    const todayStats = await (async () => {
      const txs = await storage.getTransactions(merchantId);
      const todayTxs = txs.filter(t => t.country === data.country && isToday(new Date(t.createdAt)));
      const success = todayTxs.filter(t => t.status === "confirmed").length;
      const total = todayTxs.length;
      const amount = todayTxs.filter(t => t.status === "confirmed").reduce((s, t) => s + t.amount, 0);
      return { success, total, amount };
    })();

    const msg = [
      `🧡🧡 *Dépôt ${countryLabel(data.country)}* 🧡🧡`,
      ``,
      `✅ *Nouveau paiement reçu !*`,
      ``,
      `💰 *Montant :* ${formatAmount(data.amount)}`,
      `📞 *Payeur :* ${data.payerNumber || "N/A"}`,
      `🌍 *Pays :* ${countryLabel(data.country)}`,
      `🔖 *TX :* \`${data.txId}\``,
      `📡 *Via :* ${data.provider === "omnipay" ? "OmniPay" : "SMS"}`,
      ``,
      `🧡🧡 *Solde compte* 🧡🧡`,
      ``,
      `💰 Solde total : ${formatAmountPlain(newBalance)} F CFA`,
      `💳 Solde reversement : ${formatAmountPlain(newBalance)} F CFA`,
      `📊 Dépôts réussis aujourd'hui : ${todayStats.success} ; Montant : ${formatAmountPlain(todayStats.amount)} F CFA`,
      `📈 Taux de réussite : ${successRate(todayStats.success, todayStats.total)}`,
    ].join("\n");

    await bot.telegram.sendMessage(merchant.telegramChatId, msg, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("[TELEGRAM] Erreur notification marchand:", (err as any).message);
  }
}

export async function notifyAdminGroup(message: string): Promise<void> {
  if (!bot) return;
  try {
    const groupId = await storage.getSetting("telegram_group_id");
    if (!groupId) return;
    await bot.telegram.sendMessage(groupId, message, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("[TELEGRAM] Erreur notification groupe:", (err as any).message);
  }
}

export function getBot(): Telegraf | null {
  return bot;
}
