/**
 * WestPay Userbot — Customer Service Agent
 * Connects a real Telegram account (MTProto via GramJS) to merchant groups.
 * Responds in English only to non-admin members.
 * Supports /setmarchand CODE to link a group to a merchant.
 */

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage } from "telegram/events";
import { Api } from "telegram";
import { storage } from "./storage";

const API_ID = parseInt(process.env.TELEGRAM_API_ID || "0", 10);
const API_HASH = process.env.TELEGRAM_API_HASH || "";
const PHONE_NUMBER = process.env.USERBOT_PHONE || "+15843334306";

let client: TelegramClient | null = null;
let isConnected = false;

// ─── In-memory auth state (one active auth session at a time) ────────────────
interface AuthState {
  phone: string;
  phoneCodeHash: string;
  client: TelegramClient;
}
let pendingAuth: AuthState | null = null;

// ─── Session persistence ──────────────────────────────────────────────────────
async function loadSession(): Promise<string> {
  try {
    return (await storage.getSetting("userbot_session")) || "";
  } catch {
    return "";
  }
}

async function persistSession(sessionStr: string): Promise<void> {
  await storage.setSetting("userbot_session", sessionStr);
}

// ─── Group → Merchant mapping ─────────────────────────────────────────────────
async function getGroupMap(): Promise<Record<string, number>> {
  const raw = await storage.getSetting("userbot_group_map").catch(() => null);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

async function setGroupMap(map: Record<string, number>): Promise<void> {
  await storage.setSetting("userbot_group_map", JSON.stringify(map));
}

async function linkGroupToMerchant(chatId: string, merchantId: number): Promise<void> {
  const map = await getGroupMap();
  map[chatId] = merchantId;
  await setGroupMap(map);
}

async function getMerchantIdForGroup(chatId: string): Promise<number | null> {
  const map = await getGroupMap();
  return map[chatId] ?? null;
}

// ─── Activation code helpers (reuse existing system) ─────────────────────────
async function resolveActivationCode(code: string): Promise<{ merchantId: number; valid: boolean }> {
  const ac = await storage.getTelegramActivationCode(code).catch(() => null);
  if (!ac || ac.used || new Date() > new Date(ac.expiresAt)) {
    return { merchantId: 0, valid: false };
  }
  return { merchantId: ac.merchantId, valid: true };
}

// ─── Admin check in group ─────────────────────────────────────────────────────
async function isGroupAdmin(chatId: string, userId: bigInt.BigInteger): Promise<boolean> {
  if (!client) return false;
  try {
    const entity = await client.getEntity(chatId);
    const participants = await client.getParticipants(entity, {
      filter: new Api.ChannelParticipantsAdmins(),
    });
    return participants.some(p => p.id.toString() === userId.toString());
  } catch {
    try {
      const member = await client.invoke(
        new Api.channels.GetParticipant({
          channel: await client.getEntity(chatId),
          participant: userId,
        })
      );
      const p = (member as any).participant;
      return p?.className === "ChannelParticipantAdmin" || p?.className === "ChannelParticipantCreator";
    } catch {
      return false;
    }
  }
}

// ─── English response builder ─────────────────────────────────────────────────
function formatAmount(n: number): string {
  return n.toLocaleString("en-US") + " FCFA";
}

function buildHelpMessage(): string {
  return (
    `👋 *WestPay Support — Available Commands*\n\n` +
    `💰 *balance* — View your balance by country\n` +
    `📋 *transactions* — Last 5 transactions\n` +
    `⏳ *withdrawals* — Pending withdrawal requests\n` +
    `🔑 *api* — Your API keys and integration info\n` +
    `📊 *stats* — Your global statistics\n\n` +
    `You can also type keywords like:\n` +
    `"balance", "withdrawal", "payment", "api key", "help"\n\n` +
    `_For urgent issues, contact the WestPay admin team._`
  );
}

async function buildBalanceMessage(merchantId: number, merchantName: string): Promise<string> {
  const countries = await storage.getMerchantCountries(merchantId);
  const active = countries.filter(mc => mc.active);
  if (active.length === 0) {
    return `ℹ️ *${merchantName}* — No active countries configured yet.`;
  }
  const lines: string[] = [`💰 *Balance — ${merchantName}*\n`];
  for (const mc of active) {
    const flag = countryFlag(mc.country);
    lines.push(`${flag} *${mc.country}*\n   Account: \`${formatAmount(mc.balance)}\``);
  }
  return lines.join("\n");
}

async function buildWithdrawalMessage(merchantId: number): Promise<string> {
  const all = await storage.getWithdrawals(merchantId);
  const pending = all.filter(w => w.status === "pending");
  if (pending.length === 0) {
    return `✅ *No pending withdrawals.*\n\nAll your withdrawal requests have been processed.`;
  }
  const lines: string[] = [`⏳ *Pending Withdrawals (${pending.length})*\n`];
  for (const w of pending.slice(0, 5)) {
    const flag = countryFlag(w.country);
    const date = new Date(w.createdAt).toLocaleDateString("en-US");
    lines.push(`${flag} ${formatAmount(w.amount)} → \`${w.phone}\` (${w.operator || "—"}) — ${date}`);
  }
  if (pending.length > 5) lines.push(`\n_...and ${pending.length - 5} more._`);
  return lines.join("\n");
}

async function buildTransactionMessage(merchantId: number): Promise<string> {
  const txs = await storage.getTransactions(merchantId);
  const last5 = txs.slice(0, 5);
  if (last5.length === 0) {
    return `ℹ️ *No transactions found yet.*\n\nTransactions will appear here as payments come in.`;
  }
  const lines: string[] = [`📋 *Last ${last5.length} Transactions*\n`];
  for (const t of last5) {
    const icon = t.status === "confirmed" ? "✅" : t.status === "failed" ? "❌" : "⏳";
    const flag = countryFlag(t.country);
    const date = new Date(t.createdAt).toLocaleDateString("en-US");
    lines.push(`${icon} ${flag} ${formatAmount(t.amount)} — ${date}\n   ID: \`${t.txId}\``);
  }
  return lines.join("\n");
}

async function buildApiMessage(merchantId: number, merchantName: string): Promise<string> {
  const countries = await storage.getMerchantCountries(merchantId);
  const active = countries.filter(mc => mc.active);
  const lines: string[] = [`🔑 *API Keys — ${merchantName}*\n`];
  if (active.length === 0) {
    return `ℹ️ No countries configured. Contact the admin to enable countries for your account.`;
  }
  for (const mc of active) {
    const flag = countryFlag(mc.country);
    lines.push(`${flag} *${mc.country}*\n   \`${mc.apiKey}\``);
  }
  lines.push(`\n📖 Full API docs: https://westpay.cloud/api-docs`);
  return lines.join("\n");
}

async function buildStatsMessage(merchantId: number, merchantName: string): Promise<string> {
  const stats = await storage.getMerchantStats(merchantId);
  return (
    `📊 *Statistics — ${merchantName}*\n\n` +
    `💳 Total Transactions: *${stats.transactionCount}*\n` +
    `💰 Total Volume: *${formatAmount(stats.totalVolume)}*`
  );
}

function countryFlag(country: string): string {
  const flags: Record<string, string> = {
    "Togo": "🇹🇬",
    "Benin": "🇧🇯",
    "Burkina Faso": "🇧🇫",
    "Cameroun": "🇨🇲",
    "Cote d'Ivoire": "🇨🇮",
    "Mali": "🇲🇱",
    "Senegal": "🇸🇳",
    "Guinee": "🇬🇳",
    "Congo Brazzaville": "🇨🇬",
    "Congo RDC": "🇨🇩",
  };
  return flags[country] || "🌍";
}

async function buildResponse(message: string, merchantId: number, merchantName: string): Promise<string | null> {
  const msg = message.toLowerCase().trim();

  // Commands
  if (msg === "/balance" || msg === "/solde") {
    return buildBalanceMessage(merchantId, merchantName);
  }
  if (msg === "/withdrawals" || msg === "/retrait" || msg === "/retraits") {
    return buildWithdrawalMessage(merchantId);
  }
  if (msg === "/transactions" || msg === "/tx") {
    return buildTransactionMessage(merchantId);
  }
  if (msg === "/api" || msg === "/keys" || msg === "/apikey") {
    return buildApiMessage(merchantId, merchantName);
  }
  if (msg === "/stats" || msg === "/statistics") {
    return buildStatsMessage(merchantId, merchantName);
  }
  if (msg === "/help" || msg === "/start" || msg === "/aide") {
    return buildHelpMessage();
  }

  // Keyword matching
  if (/\b(balance|solde|account|how much|my balance|check balance|available)\b/.test(msg)) {
    return buildBalanceMessage(merchantId, merchantName);
  }
  if (/\b(withdrawal|withdraw|retrait|pending|en attente|reversement|payout|not received|not arrived)\b/.test(msg)) {
    return buildWithdrawalMessage(merchantId);
  }
  if (/\b(transaction|payment|deposit|paiement|encaissement|history|receipt|last|recent)\b/.test(msg)) {
    return buildTransactionMessage(merchantId);
  }
  if (/\b(api|key|apikey|api key|integration|sdk|developer|webhook|code|clé)\b/.test(msg)) {
    return buildApiMessage(merchantId, merchantName);
  }
  if (/\b(stat|stats|statistic|volume|total|performance)\b/.test(msg)) {
    return buildStatsMessage(merchantId, merchantName);
  }
  if (/\b(help|support|aide|command|commands|what can|how to|menu)\b/.test(msg)) {
    return buildHelpMessage();
  }
  if (/^(hello|hi|hey|good morning|good afternoon|good evening|good day|bonjour|salut|bonsoir)\b/.test(msg)) {
    return `Hello! 👋 Welcome to *WestPay Support*.\n\nHow can I help you today?\nType *help* or */help* to see available commands.`;
  }

  // No keyword matched — don't respond
  return null;
}

// ─── Event handler ────────────────────────────────────────────────────────────
async function handleMessage(event: any): Promise<void> {
  if (!client) return;

  const message = event.message;
  if (!message || !message.text) return;
  if (message.out) return; // Ignore own messages

  const chat = await message.getChat();
  if (!chat) return;

  const chatType = chat.className;
  const isGroup = chatType === "Chat" || chatType === "Channel";
  if (!isGroup) return;

  const chatId = chat.id.toString();
  const text: string = message.text || "";

  // Handle /setmarchand CODE
  const setMerchantMatch = text.match(/^\/setmarchand\s+([A-Z0-9]+)/i);
  if (setMerchantMatch) {
    const code = setMerchantMatch[1].trim().toUpperCase();
    const { merchantId, valid } = await resolveActivationCode(code);

    if (!valid) {
      await client.sendMessage(chat, {
        message: "❌ *Invalid or expired code.*\n\nPlease generate a new activation code from the WestPay dashboard and try again.",
        parseMode: "markdown",
        replyTo: message.id,
      });
      return;
    }

    await linkGroupToMerchant(chatId, merchantId);
    await storage.markTelegramActivationCodeUsed(code);

    const merchant = await storage.getMerchantById(merchantId);
    await client.sendMessage(chat, {
      message:
        `✅ *Group successfully linked!*\n\n` +
        `🏪 Merchant: *${merchant?.name}*\n` +
        `📧 Email: ${merchant?.email}\n\n` +
        `I'm your WestPay support assistant. I'll answer questions from your team members here.\n\n` +
        buildHelpMessage(),
      parseMode: "markdown",
      replyTo: message.id,
    });
    console.log(`[USERBOT] Group ${chatId} linked to merchant #${merchantId} (${merchant?.name})`);
    return;
  }

  // Find merchant for this group
  const merchantId = await getMerchantIdForGroup(chatId);
  if (!merchantId) return;

  // Check if sender is a group admin — if so, skip
  const sender = await message.getSender();
  if (!sender) return;

  const senderIsAdmin = await isGroupAdmin(chatId, sender.id).catch(() => false);
  if (senderIsAdmin) return;

  // Build a response based on message content
  const merchant = await storage.getMerchantById(merchantId);
  if (!merchant) return;

  const response = await buildResponse(text, merchantId, merchant.name);
  if (!response) return;

  await client.sendMessage(chat, {
    message: response,
    parseMode: "markdown",
    replyTo: message.id,
  }).catch(err => {
    console.error("[USERBOT] Failed to send response:", err.message);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getUserbotStatus(): Promise<{
  connected: boolean;
  phone: string;
  linkedGroups: number;
  pendingAuth: boolean;
}> {
  const groupMap = await getGroupMap().catch(() => ({}));
  return {
    connected: isConnected,
    phone: PHONE_NUMBER,
    linkedGroups: Object.keys(groupMap).length,
    pendingAuth: pendingAuth !== null,
  };
}

/** Step 1: Send SMS code to phone */
export async function startUbotAuth(phone: string): Promise<{ success: boolean; message: string }> {
  if (!API_ID || !API_HASH) {
    return { success: false, message: "TELEGRAM_API_ID or TELEGRAM_API_HASH not configured." };
  }

  try {
    // Stop previous client if any
    if (client && isConnected) {
      await client.disconnect().catch(() => {});
      isConnected = false;
    }

    const session = new StringSession("");
    const tempClient = new TelegramClient(session, API_ID, API_HASH, {
      connectionRetries: 3,
      useWSS: false,
    });
    await tempClient.connect();

    const result = await tempClient.invoke(
      new Api.auth.SendCode({
        phoneNumber: phone,
        apiId: API_ID,
        apiHash: API_HASH,
        settings: new Api.CodeSettings({}),
      })
    );

    pendingAuth = {
      phone,
      phoneCodeHash: result.phoneCodeHash,
      client: tempClient,
    };

    console.log(`[USERBOT] SMS code sent to ${phone}`);
    return { success: true, message: `Verification code sent to ${phone}. Enter it to complete setup.` };
  } catch (err: any) {
    console.error("[USERBOT] startUbotAuth error:", err.message);
    return { success: false, message: err.message || "Failed to send verification code." };
  }
}

/** Step 2: Submit the SMS/Telegram code */
export async function completeUbotAuth(code: string, password?: string): Promise<{ success: boolean; message: string }> {
  if (!pendingAuth) {
    return { success: false, message: "No pending auth session. Please start authentication first." };
  }

  const { phone, phoneCodeHash, client: tempClient } = pendingAuth;

  try {
    try {
      await tempClient.invoke(
        new Api.auth.SignIn({
          phoneNumber: phone,
          phoneCodeHash,
          phoneCode: code.replace(/\s/g, ""),
        })
      );
    } catch (err: any) {
      if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
        if (!password) {
          return { success: false, message: "2FA_REQUIRED" };
        }
        const passInfo = await tempClient.invoke(new Api.account.GetPassword());
        const { computeCheck } = await import("telegram/Password");
        const passwordCheck = await computeCheck(passInfo as any, password);
        await tempClient.invoke(new Api.auth.CheckPassword({ password: passwordCheck }));
      } else {
        throw err;
      }
    }

    const sessionStr = tempClient.session.save() as unknown as string;
    await persistSession(sessionStr);

    // Replace global client with authenticated one
    client = tempClient;
    pendingAuth = null;

    // Register message handler
    client.addEventHandler(handleMessage, new NewMessage({}));
    isConnected = true;

    console.log("[USERBOT] Authentication successful — userbot is now running");
    return { success: true, message: "Userbot connected successfully! It will now respond in merchant groups." };
  } catch (err: any) {
    console.error("[USERBOT] completeUbotAuth error:", err.message);
    return { success: false, message: err.message || "Invalid code. Please try again." };
  }
}

/** Disconnect the userbot */
export async function disconnectUserbot(): Promise<void> {
  if (client) {
    await client.disconnect().catch(() => {});
    client = null;
  }
  pendingAuth = null;
  isConnected = false;
  console.log("[USERBOT] Disconnected");
}

/** Initialize userbot from stored session on server start */
export async function initUserbot(): Promise<void> {
  if (!API_ID || !API_HASH) {
    console.log("[USERBOT] TELEGRAM_API_ID or TELEGRAM_API_HASH not set — skipped");
    return;
  }

  const sessionStr = await loadSession();
  if (!sessionStr) {
    console.log("[USERBOT] No stored session — connect via admin dashboard");
    return;
  }

  try {
    const session = new StringSession(sessionStr);
    const c = new TelegramClient(session, API_ID, API_HASH, {
      connectionRetries: 3,
      useWSS: false,
    });

    await c.connect();

    // Verify still authenticated
    const me = await c.getMe();
    console.log(`[USERBOT] Reconnected as ${(me as any).firstName} ${(me as any).lastName || ""} (@${(me as any).username || "no username"})`);

    client = c;
    isConnected = true;

    // Save refreshed session
    const refreshed = c.session.save() as unknown as string;
    await persistSession(refreshed);

    // Register message handler
    client.addEventHandler(handleMessage, new NewMessage({}));
    console.log("[USERBOT] Listening for messages in merchant groups");
  } catch (err: any) {
    console.error("[USERBOT] Failed to reconnect with stored session:", err.message);
    // Clear bad session
    await persistSession("").catch(() => {});
  }
}
