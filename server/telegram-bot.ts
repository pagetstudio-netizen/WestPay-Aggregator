import { Telegraf } from "telegraf";
import { storage } from "./storage";

let bot: Telegraf | null = null;

const COUNTRIES_FR: Record<string, string> = {
  tg: "🇹🇬 Togo",
  bj: "🇧🇯 Bénin",
  ci: "🇨🇮 Côte d'Ivoire",
  sn: "🇸🇳 Sénégal",
  ml: "🇲🇱 Mali",
  bf: "🇧🇫 Burkina Faso",
  gn: "🇬🇳 Guinée",
  gh: "🇬🇭 Ghana",
};

function countryLabel(code: string): string {
  return COUNTRIES_FR[code.toLowerCase()] || code.toUpperCase();
}

function formatAmount(n: number): string {
  return n.toLocaleString("fr-FR") + " F CFA";
}

// ─── Rate Limiter ────────────────────────────────────────────────────────────
const MAX_FAILED = 5;
const LOCK_DURATION_MS = 60 * 60 * 1000;
const failedAttempts = new Map<string, { count: number; lockedUntil: Date | null }>();

function isRateLimited(userId: string): boolean {
  const r = failedAttempts.get(userId);
  if (!r) return false;
  if (r.lockedUntil && new Date() < r.lockedUntil) return true;
  if (r.lockedUntil && new Date() >= r.lockedUntil) {
    failedAttempts.delete(userId);
    return false;
  }
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

export function initTelegramBot(): Telegraf | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("[TELEGRAM] TELEGRAM_BOT_TOKEN non defini — bot non demarre");
    return null;
  }

  bot = new Telegraf(token);

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
        if (remaining <= 2) {
          await alertAdminGroup(`⚠️ *Tentatives suspectes de liaison bot*\n\n👤 Utilisateur : ${formatUser(ctx)}\n🆔 ID : \`${userId}\`\n⚠️ Tentatives restantes : ${remaining}`);
        }
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
      await bot!.telegram.sendMessage(
        groupId,
        `🔗 *Nouveau marchand lié à Telegram*\n\n🏪 Marchand : *${merchant?.name}*\n📧 ${merchant?.email}\n👤 Telegram : ${formatUser(ctx)}`,
        { parse_mode: "Markdown" }
      ).catch(() => {});
    }
  });

  // ─── /setgroup (groupe admin uniquement, protégé par clé API admin) ──────
  bot.command("setgroup", async (ctx) => {
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup) {
      await ctx.reply("❌ Cette commande doit être utilisée dans un groupe.");
      return;
    }

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

    const admins = await storage.getMerchants();
    const allAdmins = await (storage as any).getAdminByEmail?.("admin@westpay.com");
    const validAdmin = await storage.getSetting("admin_api_key").then(async (key) => {
      if (key && key === apiKey) return true;
      return false;
    }).catch(() => false);

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
    await ctx.reply(
      `✅ *Groupe admin enregistré !*\n\n🔐 Authentifié : *${adminRecord.email}*\n📢 Toutes les alertes WestPay arriveront dans ce groupe.\n🆔 Chat ID : \`${chatId}\``,
      { parse_mode: "Markdown" }
    );
  });

  // ─── /setmarchand (liaison groupe → marchand, code d'activation requis) ──
  bot.command("setmarchand", async (ctx) => {
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup) {
      await ctx.reply("❌ Cette commande doit être utilisée dans un groupe dédié au marchand.");
      return;
    }

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
    resetAttempts(userId);

    const merchant = await storage.getMerchantById(ac.merchantId);
    await ctx.reply(
      `✅ *Groupe lié au marchand !*\n\n🏪 Marchand : *${merchant?.name}*\n📧 ${merchant?.email}\n\nLes notifications de paiement de ce marchand arriveront ici.`,
      { parse_mode: "Markdown" }
    );

    const adminGroupId = await getAdminGroupId();
    if (adminGroupId && adminGroupId !== chatId) {
      await bot!.telegram.sendMessage(
        adminGroupId,
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
      const authorized = await isAdminGroup(chatId);
      if (!authorized) return;
      try {
        const stats = await storage.getStats();
        await ctx.reply(
          `📊 *Statistiques WestPay*\n\n🏪 Marchands : *${stats.merchantCount}*\n💳 Transactions : *${stats.transactionCount}*\n💰 Volume total : *${formatAmount(stats.totalVolume)}*\n📱 Numéros actifs : *${stats.activeNumbers}*`,
          { parse_mode: "Markdown" }
        );
      } catch {
        await ctx.reply("❌ Erreur lors de la récupération des statistiques.");
      }
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
    } catch {
      await ctx.reply("❌ Erreur.");
    }
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
    } catch {
      await ctx.reply("❌ Erreur.");
    }
  });

  // ─── /solde ────────────────────────────────────────────────────────────────
  bot.command("solde", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";

    if (isGroup) {
      const authorized = await isAdminGroup(chatId);
      if (!authorized) return;
      try {
        const allCountries = await storage.getMerchantCountries();
        const merchants = await storage.getMerchants();
        const lines: string[] = [];
        for (const m of merchants.slice(0, 10)) {
          const mcs = allCountries.filter(mc => mc.merchantId === m.id && mc.active);
          if (mcs.length === 0) continue;
          lines.push(`\n*${m.name}*`);
          for (const mc of mcs) lines.push(`  ${countryLabel(mc.country)}: *${formatAmount(mc.balance)}*`);
        }
        if (lines.length === 0) { await ctx.reply("Aucun solde à afficher."); return; }
        await ctx.reply(`💰 *Soldes des marchands*\n${lines.join("\n")}`, { parse_mode: "Markdown" });
      } catch {
        await ctx.reply("❌ Erreur.");
      }
      return;
    }

    const merchant = await storage.getMerchantByTelegramChatId(chatId);
    if (!merchant) return;
    if (merchant.suspended) { await ctx.reply("⚠️ Compte suspendu. Contactez votre administrateur."); return; }
    try {
      const countries = await storage.getMerchantCountries(merchant.id);
      const active = countries.filter(mc => mc.active);
      if (active.length === 0) { await ctx.reply("Aucun pays actif."); return; }
      const lines = active.map(mc => `${countryLabel(mc.country)}: *${formatAmount(mc.balance)}*`);
      await ctx.reply(`💰 *Votre solde — ${merchant.name}*\n\n${lines.join("\n")}`, { parse_mode: "Markdown" });
    } catch {
      await ctx.reply("❌ Erreur.");
    }
  });

  // ─── /transactions (DM marchand uniquement) ────────────────────────────────
  bot.command("transactions", async (ctx) => {
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (isGroup) return;
    const chatId = String(ctx.chat.id);
    const merchant = await storage.getMerchantByTelegramChatId(chatId);
    if (!merchant) return;
    try {
      const txs = await storage.getTransactions(merchant.id);
      const recent = txs.slice(0, 5);
      if (recent.length === 0) { await ctx.reply("Aucune transaction enregistrée."); return; }
      const lines = recent.map((t, i) => {
        const date = new Date(t.createdAt).toLocaleDateString("fr-FR");
        return `${i + 1}. *${formatAmount(t.amount)}* — ${countryLabel(t.country)} — ${date}${t.payerNumber ? `\n   📞 ${t.payerNumber}` : ""}`;
      });
      await ctx.reply(`📋 *Vos 5 dernières transactions*\n\n${lines.join("\n\n")}`, { parse_mode: "Markdown" });
    } catch {
      await ctx.reply("❌ Erreur.");
    }
  });

  // ─── /aide ─────────────────────────────────────────────────────────────────
  bot.command("aide", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";

    if (isGroup) {
      const authorized = await isAdminGroup(chatId);
      if (!authorized) return;
      await ctx.reply(
        `📖 *Commandes Admin — WestPay Bot*\n\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `⚙️ *Configuration*\n` +
        `/setgroup CLE\\_API — Enregistrer ce groupe admin (clé API depuis le dashboard)\n\n` +
        `👥 *Marchands*\n` +
        `/marchands — Liste de tous les marchands\n` +
        `/setmarchand CODE — Lier un groupe au compte d'un marchand\n\n` +
        `📊 *Statistiques & Soldes*\n` +
        `/stats — Statistiques globales\n` +
        `/solde — Soldes de tous les marchands\n\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `💡 *Configurer un groupe marchand :*\n` +
        `1️⃣ Générer un code dans le dashboard WestPay\n` +
        `2️⃣ Ajouter le bot au groupe du marchand\n` +
        `3️⃣ Envoyer \`/setmarchand CODE\` dans ce groupe\n\n` +
        `🔐 *Configurer ce groupe admin :*\n` +
        `\`/setgroup CLE_API_ADMIN\`\n` +
        `(Clé API disponible dans Paramètres du dashboard)`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    const merchant = await storage.getMerchantByTelegramChatId(chatId);
    if (merchant) {
      await ctx.reply(
        `📖 *Commandes — ${merchant.name}*\n\n/solde — Votre solde par pays\n/transactions — Vos 5 dernières transactions\n/stats — Vos statistiques\n/aide — Cette aide`,
        { parse_mode: "Markdown" }
      );
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

    const existingGroupId = await getAdminGroupId();
    if (existingGroupId && chatId === existingGroupId) {
      await ctx.reply("✅ Bot WestPay actif dans le groupe admin.\n\nTapez /aide pour voir les commandes.", { parse_mode: "Markdown" });
    } else {
      await ctx.reply(
        `👋 *Bot WestPay ajouté à ${groupTitle}.*\n\n` +
        `Pour configurer ce groupe :\n` +
        `• *Groupe admin* : \`/setgroup CLE_API_ADMIN\`\n` +
        `• *Groupe marchand* : \`/setmarchand CODE\`\n\n` +
        `Tapez /aide pour l'aide.`,
        { parse_mode: "Markdown" }
      );
      await alertAdminGroup(`ℹ️ *Bot ajouté à un nouveau groupe*\n\n👥 Groupe : *${groupTitle}*\n🆔 Chat ID : \`${chatId}\`\n👤 Par : ${formatUser(ctx)}`);
    }
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

  bot.launch().catch((err) => {
    console.error("[TELEGRAM] Erreur demarrage bot:", err.message);
  });

  console.log("[TELEGRAM] Bot demarre avec succes (polling actif)");

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
    const msg = [
      `✅ *Nouveau paiement reçu !*`,
      ``,
      `🏪 *${merchant.name}*`,
      `💰 Montant : *${formatAmount(data.amount)}*`,
      `${countryLabel(data.country)}`,
      `🔖 TX : \`${data.txId}\``,
      data.payerNumber ? `📞 Payeur : ${data.payerNumber}` : null,
      `📡 Via : ${data.provider === "omnipay" ? "OmniPay" : "SMS"}`,
    ].filter(Boolean).join("\n");
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
