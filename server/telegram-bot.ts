import { Telegraf, Context } from "telegraf";
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

export function initTelegramBot(): Telegraf | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("[TELEGRAM] TELEGRAM_BOT_TOKEN non defini — bot non demarre");
    return null;
  }

  bot = new Telegraf(token);

  bot.command("start", async (ctx) => {
    const text = ctx.message.text || "";
    const parts = text.split(" ");
    const code = parts[1]?.trim();
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";

    if (isGroup) {
      await ctx.reply(
        "👋 *Bot WestPay actif dans ce groupe.*\n\nCommandes disponibles :\n/stats — Statistiques du jour\n/marchands — Liste des marchands\n/setgroup — Enregistrer ce groupe pour les notifications\n/aide — Aide",
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (!code) {
      await ctx.reply(
        "👋 Bonjour ! Je suis le bot WestPay.\n\nPour lier votre compte marchand, envoyez le code d'activation fourni par votre administrateur :\n\n`/start VOTRE_CODE`",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const ac = await storage.getTelegramActivationCode(code);
    if (!ac) {
      await ctx.reply("❌ Code d'activation invalide. Demandez un nouveau code à votre administrateur.");
      return;
    }
    if (ac.used) {
      await ctx.reply("❌ Ce code a déjà été utilisé. Demandez un nouveau code à votre administrateur.");
      return;
    }
    if (new Date() > new Date(ac.expiresAt)) {
      await ctx.reply("❌ Ce code a expiré. Demandez un nouveau code à votre administrateur.");
      return;
    }

    const existingMerchant = await storage.getMerchantByTelegramChatId(chatId);
    if (existingMerchant) {
      await ctx.reply(`ℹ️ Ce compte Telegram est déjà lié au marchand *${existingMerchant.name}*.`, { parse_mode: "Markdown" });
      return;
    }

    await storage.updateMerchantTelegramChatId(ac.merchantId, chatId);
    await storage.markTelegramActivationCodeUsed(code);

    const merchant = await storage.getMerchantById(ac.merchantId);
    await ctx.reply(
      `✅ *Compte lié avec succès !*\n\nBienvenue, *${merchant?.name}* 👋\n\nVous recevrez désormais vos notifications de paiement ici.\n\nTapez /aide pour voir les commandes disponibles.`,
      { parse_mode: "Markdown" }
    );

    const groupId = await storage.getSetting("telegram_group_id");
    if (groupId) {
      await bot!.telegram.sendMessage(
        groupId,
        `🔗 *Nouveau marchand lié à Telegram*\n\n📋 Marchand : *${merchant?.name}*\n📧 Email : ${merchant?.email}\n🆔 ID : #${merchant?.id}`,
        { parse_mode: "Markdown" }
      ).catch(() => {});
    }
  });

  bot.command("setgroup", async (ctx) => {
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (!isGroup) {
      await ctx.reply("❌ Cette commande doit être utilisée dans un groupe.");
      return;
    }
    const chatId = String(ctx.chat.id);
    await storage.setSetting("telegram_group_id", chatId);
    await ctx.reply(
      `✅ *Groupe enregistré !*\n\nToutes les notifications WestPay seront envoyées dans ce groupe.\n🆔 Chat ID : \`${chatId}\``,
      { parse_mode: "Markdown" }
    );
  });

  bot.command("stats", async (ctx) => {
    const groupId = await storage.getSetting("telegram_group_id");
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (isGroup && groupId && chatId !== groupId) {
      return;
    }

    if (!isGroup) {
      const merchant = await storage.getMerchantByTelegramChatId(chatId);
      if (merchant) {
        const stats = await storage.getMerchantStats(merchant.id);
        await ctx.reply(
          `📊 *Vos statistiques*\n\n💳 Transactions : *${stats.transactionCount}*\n💰 Volume total : *${formatAmount(stats.totalVolume)}*`,
          { parse_mode: "Markdown" }
        );
        return;
      }
    }

    try {
      const stats = await storage.getStats();
      await ctx.reply(
        `📊 *Statistiques WestPay*\n\n🏪 Marchands : *${stats.merchantCount}*\n💳 Transactions : *${stats.transactionCount}*\n💰 Volume total : *${formatAmount(stats.totalVolume)}*\n📱 Numéros actifs : *${stats.activeNumbers}*`,
        { parse_mode: "Markdown" }
      );
    } catch {
      await ctx.reply("❌ Erreur lors de la récupération des statistiques.");
    }
  });

  bot.command("marchands", async (ctx) => {
    const groupId = await storage.getSetting("telegram_group_id");
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (isGroup && groupId && chatId !== groupId) return;
    if (!isGroup) {
      await ctx.reply("❌ Cette commande est réservée au groupe administrateur.");
      return;
    }

    try {
      const merchants = await storage.getMerchants();
      if (merchants.length === 0) {
        await ctx.reply("Aucun marchand enregistré.");
        return;
      }
      const lines = merchants.slice(0, 20).map((m, i) =>
        `${i + 1}. *${m.name}* — ${m.suspended ? "🔴 Suspendu" : "🟢 Actif"}${m.telegramChatId ? " 📱" : ""}`
      );
      await ctx.reply(
        `🏪 *Marchands WestPay* (${merchants.length})\n\n${lines.join("\n")}\n\n📱 = Telegram lié`,
        { parse_mode: "Markdown" }
      );
    } catch {
      await ctx.reply("❌ Erreur lors de la récupération des marchands.");
    }
  });

  bot.command("solde", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";

    if (isGroup) {
      const groupId = await storage.getSetting("telegram_group_id");
      if (chatId !== groupId) return;
      try {
        const allCountries = await storage.getMerchantCountries();
        const merchants = await storage.getMerchants();
        const lines: string[] = [];
        for (const m of merchants.slice(0, 10)) {
          const mcs = allCountries.filter(mc => mc.merchantId === m.id && mc.active);
          if (mcs.length === 0) continue;
          lines.push(`\n*${m.name}*`);
          for (const mc of mcs) {
            lines.push(`  ${countryLabel(mc.country)}: *${formatAmount(mc.balance)}*`);
          }
        }
        await ctx.reply(`💰 *Soldes des marchands*\n${lines.join("\n")}`, { parse_mode: "Markdown" });
      } catch {
        await ctx.reply("❌ Erreur lors de la récupération des soldes.");
      }
      return;
    }

    const merchant = await storage.getMerchantByTelegramChatId(chatId);
    if (!merchant) {
      await ctx.reply("❌ Votre compte Telegram n'est pas lié. Utilisez le code fourni par votre administrateur.");
      return;
    }
    if (merchant.suspended) {
      await ctx.reply("⚠️ Votre compte est suspendu. Contactez votre administrateur.");
      return;
    }

    try {
      const countries = await storage.getMerchantCountries(merchant.id);
      const active = countries.filter(mc => mc.active);
      if (active.length === 0) {
        await ctx.reply("Aucun pays actif sur votre compte.");
        return;
      }
      const lines = active.map(mc => `${countryLabel(mc.country)}: *${formatAmount(mc.balance)}*`);
      await ctx.reply(
        `💰 *Votre solde — ${merchant.name}*\n\n${lines.join("\n")}`,
        { parse_mode: "Markdown" }
      );
    } catch {
      await ctx.reply("❌ Erreur lors de la récupération du solde.");
    }
  });

  bot.command("transactions", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (isGroup) return;

    const merchant = await storage.getMerchantByTelegramChatId(chatId);
    if (!merchant) {
      await ctx.reply("❌ Votre compte Telegram n'est pas lié. Utilisez le code fourni par votre administrateur.");
      return;
    }

    try {
      const txs = await storage.getTransactions(merchant.id);
      const recent = txs.slice(0, 5);
      if (recent.length === 0) {
        await ctx.reply("Aucune transaction enregistrée.");
        return;
      }
      const lines = recent.map((t, i) => {
        const date = new Date(t.createdAt).toLocaleDateString("fr-FR");
        return `${i + 1}. *${formatAmount(t.amount)}* — ${countryLabel(t.country)} — ${date}${t.payerNumber ? `\n   📞 ${t.payerNumber}` : ""}`;
      });
      await ctx.reply(
        `📋 *Vos 5 dernières transactions*\n\n${lines.join("\n\n")}`,
        { parse_mode: "Markdown" }
      );
    } catch {
      await ctx.reply("❌ Erreur lors de la récupération des transactions.");
    }
  });

  bot.command("aide", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";

    if (isGroup) {
      await ctx.reply(
        `📖 *Commandes Admin — WestPay Bot*\n\n/setgroup — Enregistrer ce groupe pour les notifications\n/stats — Statistiques globales\n/marchands — Liste des marchands\n/solde — Soldes de tous les marchands`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    const merchant = await storage.getMerchantByTelegramChatId(chatId);
    if (merchant) {
      await ctx.reply(
        `📖 *Commandes Marchand — WestPay Bot*\n\n/solde — Voir votre solde par pays\n/transactions — Vos 5 dernières transactions\n/stats — Vos statistiques\n/aide — Afficher cette aide`,
        { parse_mode: "Markdown" }
      );
    } else {
      await ctx.reply(
        `📖 *WestPay Bot*\n\nPour lier votre compte :\n\`/start CODE_ACTIVATION\`\n\nVotre code d'activation vous est fourni par votre administrateur.`,
        { parse_mode: "Markdown" }
      );
    }
  });

  bot.on("message", async (ctx) => {
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    if (isGroup) return;
    const chatId = String(ctx.chat.id);
    const merchant = await storage.getMerchantByTelegramChatId(chatId);
    if (!merchant) {
      await ctx.reply("Envoyez /aide pour voir les commandes disponibles.");
    }
  });

  bot.launch({
    allowedUpdates: ["message", "callback_query"],
  }).catch((err) => {
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
