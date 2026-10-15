/**
 * WestPay — Dedicated OTP Bot
 * Single responsibility: deliver one-time login codes to merchant Telegram groups.
 * This bot never performs any other action. It does not share state with the
 * main notification bot (telegram-bot.ts).
 */

import { Telegraf } from "telegraf";
import { storage } from "./storage";
import { getOtpTranslation } from "./otp-translations";

let otpBot: Telegraf | null = null;
let otpBotUsername: string | null = null;
let otpBotInitialized = false;

// ── Initialize ───────────────────────────────────────────────────────────────

export async function initOtpBot(): Promise<void> {
  if (otpBotInitialized) return;
  otpBotInitialized = true;

  let token = process.env.TELEGRAM_OTP_BOT_TOKEN || "";

  if (!token) {
    try {
      const dbToken = await storage.getSetting("telegram_otp_bot_token");
      if (dbToken) token = dbToken.trim();
    } catch {
      /* ignore */
    }
  }

  if (!token) {
    console.log("[OTP BOT] TELEGRAM_OTP_BOT_TOKEN not set — OTP bot not started");
    return;
  }

  try {
    const bot = new Telegraf(token);
    const me = await bot.telegram.getMe();
    otpBotUsername = me.username || null;
    otpBot = bot;
    console.log("[OTP BOT] Started — ready to deliver OTP codes");
  } catch {
    console.error("[OTP BOT] Failed to initialize");
    otpBot = null;
  }
}

// ── Re-initialize after token change ────────────────────────────────────────

export async function reloadOtpBot(): Promise<{ ok: boolean; username?: string; error?: string }> {
  otpBotInitialized = false;
  otpBot = null;
  otpBotUsername = null;
  try {
    await initOtpBot();
    if (otpBot) return { ok: true, username: otpBotUsername || undefined };
    return { ok: false, error: "Token missing or invalid" };
  } catch (err: any) {
    return { ok: false, error: "Could not initialize OTP bot" };
  }
}

// ── Status ───────────────────────────────────────────────────────────────────

export function getOtpBotStatus(): { running: boolean; username: string | null } {
  return { running: otpBot !== null, username: otpBotUsername };
}

// ── Core delivery function ───────────────────────────────────────────────────

/**
 * Send an OTP code to a merchant Telegram group.
 * The message language follows the merchant group's saved bot language.
 * Returns true on success, false on any failure.
 */
export async function sendOtpViaDedicatedBot(
  chatId: string,
  otp: string,
  merchantName: string,
  language: unknown = "fr"
): Promise<boolean> {
  if (!otpBot) {
    console.warn("[OTP BOT] Not running; code not sent");
    return false;
  }

  const tr = getOtpTranslation(language);
  const digits = otp.split("").join("  ");

  const message = [
    `🤖 *${escapeMarkdown(tr.title)}*`,
    ``,
    `👤 *${escapeMarkdown(tr.merchant)} :* ${escapeMarkdown(merchantName)}`,
    ``,
    `🔑 *${escapeMarkdown(tr.otpLabel)}*`,
    ``,
    `\`  ${digits}  \``,
    ``,
    `⏱️ _${escapeMarkdown(tr.validity)}_`,
    `🔒 _${escapeMarkdown(tr.warning)}_`,
  ].join("\n");

  try {
    await otpBot.telegram.sendMessage(chatId, message, {
      parse_mode: "MarkdownV2",
    });
    console.log("[OTP BOT] Code delivered");
    return true;
  } catch {
    console.error("[OTP BOT] Delivery failed");

    // Fallback: try plain text if Markdown fails
    try {
      const plain = [
        `🤖 ${tr.title}`,
        ``,
        `👤 ${tr.merchant} : ${merchantName}`,
        ``,
        `🔑 ${tr.otpLabel}`,
        ``,
        `  ${otp}  `,
        ``,
        `⏱️ ${tr.validity}`,
        `🔒 ${tr.warning}`,
      ].join("\n");

      await otpBot.telegram.sendMessage(chatId, plain);
      console.log("[OTP BOT] Plain-text fallback delivered");
      return true;
    } catch {
      console.error("[OTP BOT] Plain-text fallback failed");
      return false;
    }
  }
}

/**
 * Send the one-time merchant dashboard activation link to the merchant group.
 * The IP and device binding are kept server-side and are never included here.
 */
export async function sendActivationLinkViaDedicatedBot(
  chatId: string,
  activationUrl: string,
): Promise<boolean> {
  if (!otpBot) return false;

  const message = "Hi, please click on the link to log in to your account.";
  const replyMarkup = {
    inline_keyboard: [[{ text: "Open login link", url: activationUrl }]],
  };

  try {
    await otpBot.telegram.sendMessage(chatId, message, { reply_markup: replyMarkup });
    return true;
  } catch {
    console.error("[OTP BOT] Activation link delivery failed");
    return false;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}
