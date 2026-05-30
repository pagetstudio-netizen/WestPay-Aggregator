/**
 * WestPay Userbot — Customer Service Agent (Junjie)
 * Connects a real Telegram account (MTProto via GramJS) to merchant groups.
 * Behaves like a real person: reads messages, responds naturally in the same language.
 * No markdown formatting, no commands list, no robotic behaviour.
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

// ─── In-memory auth state ─────────────────────────────────────────────────────
interface AuthState {
  phone: string;
  phoneCodeHash: string;
  client: TelegramClient;
}
let pendingAuth: AuthState | null = null;

// ─── Session persistence ──────────────────────────────────────────────────────
async function loadSession(): Promise<string> {
  try { return (await storage.getSetting("userbot_session")) || ""; } catch { return ""; }
}
async function persistSession(sessionStr: string): Promise<void> {
  await storage.setSetting("userbot_session", sessionStr);
}

// ─── Response delay ───────────────────────────────────────────────────────────
async function getResponseDelayMs(): Promise<number> {
  try {
    const raw = await storage.getSetting("userbot_response_delay");
    if (!raw || raw === "auto") {
      // Automatic: random between 3 and 8 seconds — feels human
      return Math.floor(Math.random() * 5000) + 3000;
    }
    const n = parseInt(raw, 10);
    if (isNaN(n) || n <= 0) return 0;
    // Unit: raw ends with "s" → seconds, "m" → minutes
    if (raw.endsWith("m")) return n * 60 * 1000;
    return n * 1000; // default: seconds
  } catch {
    return 3000;
  }
}

export async function setResponseDelay(value: string): Promise<void> {
  await storage.setSetting("userbot_response_delay", value);
}

export async function getResponseDelaySetting(): Promise<string> {
  return (await storage.getSetting("userbot_response_delay").catch(() => null)) || "auto";
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

// ─── Activation code helpers ──────────────────────────────────────────────────
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
    const participants = await client.getParticipants(entity, { filter: new Api.ChannelParticipantsAdmins() });
    return participants.some(p => p.id.toString() === userId.toString());
  } catch {
    try {
      const member = await client.invoke(new Api.channels.GetParticipant({
        channel: await client.getEntity(chatId),
        participant: userId,
      }));
      const p = (member as any).participant;
      return p?.className === "ChannelParticipantAdmin" || p?.className === "ChannelParticipantCreator";
    } catch { return false; }
  }
}

// ─── Language detection (simple) ─────────────────────────────────────────────
function detectLanguage(text: string): "fr" | "en" | "other" {
  const lower = text.toLowerCase();
  const frWords = /\b(bonjour|salut|bonsoir|merci|s'il vous|svp|oui|non|comment|pourquoi|quand|combien|avoir|votre|notre|avec|pour|dans|sur|mon|ma|mes|les|des|une|que|qui|est|pas|mais|plus|très|bien|aussi|si|je|tu|il|elle|nous|vous|ils)\b/;
  const enWords = /\b(hello|hi|hey|thanks|thank you|yes|no|how|why|when|how much|your|our|with|for|in|on|my|the|a|an|is|not|but|more|very|well|also|if|i|you|he|she|we|they|please|good|morning|afternoon|evening)\b/;
  if (frWords.test(lower)) return "fr";
  if (enWords.test(lower)) return "en";
  return "other";
}

// ─── Country flag helper ──────────────────────────────────────────────────────
function countryFlag(country: string): string {
  const flags: Record<string, string> = {
    "Togo": "🇹🇬", "Benin": "🇧🇯", "Burkina Faso": "🇧🇫",
    "Cameroun": "🇨🇲", "Cote d'Ivoire": "🇨🇮", "Ivory Coast": "🇨🇮",
    "Mali": "🇲🇱", "Senegal": "🇸🇳", "Guinee": "🇬🇳",
    "Congo Brazzaville": "🇨🇬", "Congo RDC": "🇨🇩",
  };
  return flags[country] || "🌍";
}

function formatAmount(n: number): string {
  return n.toLocaleString("fr-FR") + " FCFA";
}

// ─── Natural data fetchers (plain text, no markdown) ─────────────────────────
async function getBalanceText(merchantId: number, lang: "fr" | "en" | "other"): Promise<string> {
  const countries = await storage.getMerchantCountries(merchantId);
  const active = countries.filter(mc => mc.active);
  if (active.length === 0) {
    return lang === "fr"
      ? "Aucun pays actif pour le moment sur votre compte."
      : "No active countries on your account yet.";
  }
  const lines = active.map(mc => `${countryFlag(mc.country)} ${mc.country} : ${formatAmount(mc.balance)}`);
  const intro = lang === "fr" ? "Voici vos soldes disponibles :" : "Here are your available balances:";
  return intro + "\n\n" + lines.join("\n");
}

async function getWithdrawalsText(merchantId: number, lang: "fr" | "en" | "other"): Promise<string> {
  const all = await storage.getWithdrawals(merchantId);
  const pending = all.filter(w => w.status === "pending");
  if (pending.length === 0) {
    return lang === "fr"
      ? "Vous n'avez aucun retrait en attente. Tout a bien été traité."
      : "No pending withdrawals. Everything has been processed.";
  }
  const intro = lang === "fr"
    ? `Vous avez ${pending.length} retrait${pending.length > 1 ? "s" : ""} en attente :`
    : `You have ${pending.length} pending withdrawal${pending.length > 1 ? "s" : ""}:`;
  const lines = pending.slice(0, 5).map(w => {
    const date = new Date(w.createdAt).toLocaleDateString("fr-FR");
    return `${countryFlag(w.country)} ${formatAmount(w.amount)} vers ${w.phone} (${w.operator || "—"}) — ${date}`;
  });
  if (pending.length > 5) {
    lines.push(lang === "fr" ? `...et ${pending.length - 5} autre(s).` : `...and ${pending.length - 5} more.`);
  }
  return intro + "\n\n" + lines.join("\n");
}

async function getTransactionsText(merchantId: number, lang: "fr" | "en" | "other"): Promise<string> {
  const txs = await storage.getTransactions(merchantId);
  const last5 = txs.slice(0, 5);
  if (last5.length === 0) {
    return lang === "fr"
      ? "Aucune transaction pour l'instant."
      : "No transactions yet.";
  }
  const intro = lang === "fr" ? "Vos dernières transactions :" : "Your recent transactions:";
  const lines = last5.map(t => {
    const status = t.status === "confirmed" ? "✓" : t.status === "failed" ? "✗" : "…";
    const date = new Date(t.createdAt).toLocaleDateString("fr-FR");
    return `${status} ${countryFlag(t.country)} ${formatAmount(t.amount)} — ${date}`;
  });
  return intro + "\n\n" + lines.join("\n");
}

async function getStatsText(merchantId: number, lang: "fr" | "en" | "other"): Promise<string> {
  const stats = await storage.getMerchantStats(merchantId);
  if (lang === "fr") {
    return `Statistiques de votre compte :\n\nNombre de transactions : ${stats.transactionCount}\nVolume total : ${formatAmount(stats.totalVolume)}`;
  }
  return `Your account statistics:\n\nTotal transactions: ${stats.transactionCount}\nTotal volume: ${formatAmount(stats.totalVolume)}`;
}

// ─── Natural conversation response builder ────────────────────────────────────
async function buildNaturalResponse(text: string, merchantId: number, lang: "fr" | "en" | "other"): Promise<string | null> {
  const lower = text.toLowerCase().trim();

  // --- Greetings --- simple, human, no commands list
  if (/^(bonjour|salut|bonsoir|coucou|hello|hi|hey|good morning|good afternoon|good evening|good day|yo)\b/.test(lower)) {
    if (lang === "fr") {
      const options = ["Bonjour !", "Salut !", "Bonsoir !", "Bonjour, comment puis-je vous aider ?", "Bonjour ! Je vous écoute."];
      return options[Math.floor(Math.random() * options.length)];
    }
    const options = ["Hello!", "Hi there!", "Good day!", "Hello, how can I help you?"];
    return options[Math.floor(Math.random() * options.length)];
  }

  // --- Thanks ---
  if (/\b(merci|thanks|thank you|thank u|thx)\b/.test(lower)) {
    if (lang === "fr") return "De rien, je reste disponible si besoin.";
    return "You're welcome, feel free to ask anytime.";
  }

  // --- Balance / Solde ---
  if (/\b(balance|solde|account|how much|available|disponible|combien|argent)\b/.test(lower)) {
    return getBalanceText(merchantId, lang);
  }

  // --- Withdrawals / Retraits ---
  if (/\b(withdrawal|withdraw|retrait|retraits|pending|en attente|reversement|payout|not received|not arrived|reçu|reçus)\b/.test(lower)) {
    return getWithdrawalsText(merchantId, lang);
  }

  // --- Transactions ---
  if (/\b(transaction|payment|deposit|paiement|encaissement|history|historique|receipt|last|récent|recent|dernière)\b/.test(lower)) {
    return getTransactionsText(merchantId, lang);
  }

  // --- Stats ---
  if (/\b(stat|stats|statistic|volume|total|performance|chiffre)\b/.test(lower)) {
    return getStatsText(merchantId, lang);
  }

  // --- OK / Acknowledged ---
  if (/^(ok|okay|d'accord|d accord|entendu|compris|vu|seen|noted|roger|alright|parfait|super|nickel)[\s!.]*$/.test(lower)) {
    if (lang === "fr") return "Parfait.";
    return "Got it.";
  }

  // --- Problem / Issue ---
  if (/\b(problème|probleme|problem|issue|bug|erreur|error|fail|failed|pas fonctionné|ne fonctionne pas|doesn't work|not working)\b/.test(lower)) {
    if (lang === "fr") {
      return "Je vois. Pouvez-vous me donner plus de détails sur le problème ? Je vais vérifier ça pour vous.";
    }
    return "I see. Could you give me more details about the issue? I'll look into it for you.";
  }

  // --- Payment not received ---
  if (/\b(pas reçu|non reçu|not received|pas arrivé|n'est pas arrivé|haven't received|didn't receive)\b/.test(lower)) {
    if (lang === "fr") {
      return "Je comprends. Pouvez-vous me donner la référence de la transaction ou le numéro de téléphone concerné ? Je vais vérifier de notre côté.";
    }
    return "I understand. Could you share the transaction reference or the phone number involved? I'll check on our end.";
  }

  // --- Default: acknowledge and offer help, in detected language ---
  // Only respond if the message is long enough to warrant a reply (avoid reacting to noise)
  if (text.length < 4) return null;

  // For unknown messages, give a natural acknowledgement
  if (lang === "fr") {
    const options = [
      "Je prends note, je reviens vers vous rapidement.",
      "Bien reçu. Laissez-moi vérifier ça.",
      "Compris. Je vais regarder ça pour vous.",
    ];
    return options[Math.floor(Math.random() * options.length)];
  }
  if (lang === "en") {
    const options = [
      "Got it, I'll look into that for you.",
      "Understood. Let me check on that.",
      "Sure, I'll get back to you shortly.",
    ];
    return options[Math.floor(Math.random() * options.length)];
  }

  // Other language — don't respond to avoid confusion
  return null;
}

// ─── Simulate typing action ───────────────────────────────────────────────────
async function sendTyping(chat: any): Promise<void> {
  if (!client) return;
  try {
    await client.invoke(new Api.messages.SetTyping({
      peer: chat,
      action: new Api.SendMessageTypingAction(),
    }));
  } catch { /* ignore */ }
}

// ─── Event handler ────────────────────────────────────────────────────────────
async function handleMessage(event: any): Promise<void> {
  if (!client) return;

  const message = event.message;
  if (!message || !message.text) return;
  if (message.out) return;

  const chat = await message.getChat();
  if (!chat) return;

  const chatType = chat.className;
  const isGroup = chatType === "Chat" || chatType === "Channel";
  if (!isGroup) return;

  const chatId = chat.id.toString();
  const text: string = message.text || "";

  // ── Handle /setmarchand CODE ──────────────────────────────────────────────
  const setMerchantMatch = text.match(/^\/setmarchand\s+([A-Z0-9]+)/i);
  if (setMerchantMatch) {
    const code = setMerchantMatch[1].trim().toUpperCase();
    const { merchantId, valid } = await resolveActivationCode(code);

    if (!valid) {
      await client.sendMessage(chat, {
        message: "Code invalide ou expiré. Veuillez générer un nouveau code depuis le tableau de bord.",
        replyTo: message.id,
      });
      return;
    }

    await linkGroupToMerchant(chatId, merchantId);
    await storage.markTelegramActivationCodeUsed(code);

    const merchant = await storage.getMerchantById(merchantId);
    // Simple, human confirmation — no commands list
    await client.sendMessage(chat, {
      message: `Groupe lié avec succès au compte ${merchant?.name || "marchand"}. Je suis disponible pour répondre à vos questions.`,
      replyTo: message.id,
    });
    console.log(`[USERBOT] Group ${chatId} linked to merchant #${merchantId} (${merchant?.name})`);
    return;
  }

  // ── Find merchant for this group ──────────────────────────────────────────
  const merchantId = await getMerchantIdForGroup(chatId);
  if (!merchantId) return;

  // ── Skip group admins ─────────────────────────────────────────────────────
  const sender = await message.getSender();
  if (!sender) return;
  const senderIsAdmin = await isGroupAdmin(chatId, sender.id).catch(() => false);
  if (senderIsAdmin) return;

  // ── Build natural response ────────────────────────────────────────────────
  const merchant = await storage.getMerchantById(merchantId);
  if (!merchant) return;

  const lang = detectLanguage(text);
  const response = await buildNaturalResponse(text, merchantId, lang);
  if (!response) return;

  // ── Apply configured response delay ──────────────────────────────────────
  const delayMs = await getResponseDelayMs();
  if (delayMs > 0) {
    // Show typing indicator while waiting
    await sendTyping(chat);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  // Send plain text — NO parseMode to avoid markdown interpretation
  await client.sendMessage(chat, {
    message: response,
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
  responseDelay: string;
}> {
  const groupMap = await getGroupMap().catch(() => ({}));
  const responseDelay = await getResponseDelaySetting();
  return {
    connected: isConnected,
    phone: PHONE_NUMBER,
    linkedGroups: Object.keys(groupMap).length,
    pendingAuth: pendingAuth !== null,
    responseDelay,
  };
}

/** Step 1: Send SMS code to phone */
export async function startUbotAuth(phone: string): Promise<{ success: boolean; message: string }> {
  if (!API_ID || !API_HASH) {
    return { success: false, message: "TELEGRAM_API_ID or TELEGRAM_API_HASH not configured." };
  }
  try {
    if (client && isConnected) {
      await client.disconnect().catch(() => {});
      isConnected = false;
    }
    const session = new StringSession("");
    const tempClient = new TelegramClient(session, API_ID, API_HASH, { connectionRetries: 3, useWSS: false });
    await tempClient.connect();
    const result = await tempClient.invoke(new Api.auth.SendCode({
      phoneNumber: phone,
      apiId: API_ID,
      apiHash: API_HASH,
      settings: new Api.CodeSettings({}),
    }));
    pendingAuth = { phone, phoneCodeHash: result.phoneCodeHash, client: tempClient };
    console.log(`[USERBOT] SMS code sent to ${phone}`);
    return { success: true, message: `Verification code sent to ${phone}.` };
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
      await tempClient.invoke(new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash, phoneCode: code.replace(/\s/g, "") }));
    } catch (err: any) {
      if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
        if (!password) return { success: false, message: "2FA_REQUIRED" };
        const passInfo = await tempClient.invoke(new Api.account.GetPassword());
        const { computeCheck } = await import("telegram/Password");
        const passwordCheck = await computeCheck(passInfo as any, password);
        await tempClient.invoke(new Api.auth.CheckPassword({ password: passwordCheck }));
      } else { throw err; }
    }
    const sessionStr = tempClient.session.save() as unknown as string;
    await persistSession(sessionStr);
    client = tempClient;
    pendingAuth = null;
    client.addEventHandler(handleMessage, new NewMessage({}));
    isConnected = true;
    console.log("[USERBOT] Authentication successful — userbot is now running");
    return { success: true, message: "Userbot connected successfully!" };
  } catch (err: any) {
    console.error("[USERBOT] completeUbotAuth error:", err.message);
    return { success: false, message: err.message || "Invalid code. Please try again." };
  }
}

/** Disconnect the userbot */
export async function disconnectUserbot(): Promise<void> {
  if (client) { await client.disconnect().catch(() => {}); client = null; }
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
    const c = new TelegramClient(session, API_ID, API_HASH, { connectionRetries: 3, useWSS: false });
    await c.connect();
    const me = await c.getMe();
    console.log(`[USERBOT] Reconnected as ${(me as any).firstName} ${(me as any).lastName || ""} (@${(me as any).username || "no username"})`);
    client = c;
    isConnected = true;
    const refreshed = c.session.save() as unknown as string;
    await persistSession(refreshed);
    client.addEventHandler(handleMessage, new NewMessage({}));
    console.log("[USERBOT] Listening for messages in merchant groups");
  } catch (err: any) {
    console.error("[USERBOT] Failed to reconnect with stored session:", err.message);
    await persistSession("").catch(() => {});
  }
}
