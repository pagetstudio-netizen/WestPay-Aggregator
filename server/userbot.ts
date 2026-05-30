/**
 * WestPay Userbot — Customer Service Agent (Junjie)
 * Connects a real Telegram account (MTProto via GramJS) to merchant groups.
 * Powered by OpenAI GPT-4o-mini for intelligent, contextual responses.
 * Always responds in English regardless of the merchant's language.
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

// ─── Language detection ───────────────────────────────────────────────────────
function detectLanguage(_text: string): "en" {
  return "en";
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
async function getBalanceText(merchantId: number, _lang?: string): Promise<string> {
  const countries = await storage.getMerchantCountries(merchantId);
  const active = countries.filter(mc => mc.active);
  if (active.length === 0) return "No active countries on your account yet.";
  const lines = active.map(mc => `${countryFlag(mc.country)} ${mc.country}: ${formatAmount(mc.balance)}`);
  return "Here are your available balances:\n\n" + lines.join("\n");
}

async function getWithdrawalsText(merchantId: number, _lang?: string): Promise<string> {
  const all = await storage.getWithdrawals(merchantId);
  const pending = all.filter(w => w.status === "pending");
  if (pending.length === 0) return "No pending withdrawals. Everything has been processed.";
  const intro = `You have ${pending.length} pending withdrawal${pending.length > 1 ? "s" : ""}:`;
  const lines = pending.slice(0, 5).map(w => {
    const date = new Date(w.createdAt).toLocaleDateString("en-GB");
    return `${countryFlag(w.country)} ${formatAmount(w.amount)} to ${w.phone} (${w.operator || "—"}) — ${date}`;
  });
  if (pending.length > 5) lines.push(`...and ${pending.length - 5} more.`);
  return intro + "\n\n" + lines.join("\n");
}

async function getTransactionsText(merchantId: number, _lang?: string): Promise<string> {
  const txs = await storage.getTransactions(merchantId);
  const last5 = txs.slice(0, 5);
  if (last5.length === 0) return "No transactions yet.";
  const lines = last5.map(t => {
    const status = t.status === "confirmed" ? "✓" : t.status === "failed" ? "✗" : "…";
    const date = new Date(t.createdAt).toLocaleDateString("en-GB");
    return `${status} ${countryFlag(t.country)} ${formatAmount(t.amount)} — ${date}`;
  });
  return "Your recent transactions:\n\n" + lines.join("\n");
}

async function getStatsText(merchantId: number, _lang?: string): Promise<string> {
  const stats = await storage.getMerchantStats(merchantId);
  return `Your account statistics:\n\nTotal transactions: ${stats.transactionCount}\nTotal volume: ${formatAmount(stats.totalVolume)}`;
}

// ─── AI Provider key resolver (env var > DB) ─────────────────────────────────
async function getAIKey(provider: "openai" | "groq" | "gemini"): Promise<string | null> {
  const envMap: Record<string, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    groq: process.env.GROQ_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
  };
  const dbKeyMap: Record<string, string> = {
    openai: "ai_key_openai",
    groq: "ai_key_groq",
    gemini: "ai_key_gemini",
  };
  const envKey = envMap[provider];
  if (envKey && envKey.length > 10) return envKey;
  const dbKey = await storage.getSetting(dbKeyMap[provider]).catch(() => null);
  return dbKey && dbKey.length > 5 ? dbKey : null;
}

// ─── Shared system prompt ─────────────────────────────────────────────────────
function buildSystemPrompt(merchantContext: string): string {
  return `You are a professional first-line customer support agent named "WestPay Assistant" for WestPay, a Mobile Money payment aggregator platform serving West Africa.

LANGUAGE — ABSOLUTE RULE:
You MUST always respond in English ONLY. NEVER write in French or any other language. Even if the user writes in French, Ewe, Fon, or any other language, your response must always be in English. No exceptions.

HONESTY — ABSOLUTE RULE:
NEVER invent, guess, or fabricate information. If you don't know something, say so and offer to escalate. Never pretend to have performed an action you haven't done. Never give fictional transaction details, balances, or statuses.

WHAT YOU CAN DO (information only — you cannot execute actions):
- Show the merchant's real-time balance, withdrawals, and transaction history using the data provided below.
- Explain platform features: API integration, webhooks, payment links, crypto payments, operator setup.
- Guide merchants through the dashboard (where to find API keys, payment links, settings, etc.).
- Ask for transaction references (OP-XXXX, TR-XXXX) and acknowledge them for escalation.
- Provide processing time expectations: payments confirm in seconds to minutes, withdrawals in 24-48 business hours.
- Explain why a payment may have failed: invalid number, insufficient customer balance, operator network issue.

WHAT YOU CANNOT DO — be honest and redirect to the technical team:
- You CANNOT modify, add, or adjust any balance. Say: "I'm not able to modify balances — this is handled exclusively by the technical team. Please contact @Atfchalvt or @geeorbotpay and they will take care of it within a few minutes."
- You CANNOT approve, reject, or process withdrawals manually. Say: "Withdrawals are processed by the technical team within 24-48 business hours. If it's been longer, contact @Atfchalvt or @geeorbotpay with your withdrawal reference."
- You CANNOT change commission rates, fees, or pricing. Say: "Commission rates are set in your contract. To renegotiate, contact our commercial team via @Atfchalvt."
- You CANNOT reset passwords directly. Say: "Use the 'Forgot password' link on the login page. If you're locked out, contact the administrator."
- You CANNOT create, delete, or suspend accounts. Say: "Account management is done by the platform administrator — contact @Atfchalvt."
- You CANNOT add or remove countries/operators directly. Say: "Country and operator activation is done by the technical team — contact @Atfchalvt."
- You CANNOT refund a payment. Say: "Refunds must be processed by the technical team — share the OP-XXXX reference with @Atfchalvt."

TONE: Be warm, honest, professional, and concise. Max 3-4 sentences unless a step-by-step explanation is genuinely needed. Sound human, not robotic. Never overpromise.

FORMATTING: Plain text only. No markdown, no **, no *, no #, no backticks.

WESTPAY PLATFORM FACTS:
- API: GET key from dashboard "API & SDK" tab, POST /api/payment/initiate, X-API-Key header, docs at /api-docs, configure webhook for confirmations.
- Operators: MTN, Orange, Moov, Wave, TMoney, Flooz — Togo, Benin, Burkina Faso, Ivory Coast, Mali, Senegal.
- Crypto: via OxaPay (USDT, BTC, ETH, TRX, BNB, LTC+). Global, no country limit. Activate from dashboard "Crypto" tab.
- Payment links: dashboard "Payment Links" tab. Fixed or variable amounts.
- Wave payments: customer gets a payment URL link instead of USSD.
- Transaction refs: OP-XXXX = payment, TR-XXXX = transfer, WP = internal.
- Support Telegram handles: @Atfchalvt, @geeorbotpay, @pankeyrobotpay, @astapay

${merchantContext}`;
}

// ─── Merchant context builder ─────────────────────────────────────────────────
async function buildMerchantContext(merchantId: number): Promise<string> {
  try {
    const [countries, withdrawals, transactions, stats] = await Promise.all([
      storage.getMerchantCountries(merchantId).catch(() => []),
      storage.getWithdrawals(merchantId).catch(() => []),
      storage.getTransactions(merchantId).catch(() => []),
      storage.getMerchantStats(merchantId).catch(() => ({ transactionCount: 0, totalVolume: 0 })),
    ]);

    const active = (countries as any[]).filter((mc: any) => mc.active);
    const balanceLines = active.map((mc: any) =>
      `${mc.country}: ${mc.balance.toLocaleString("fr-FR")} FCFA`
    ).join(", ") || "No active countries";

    const pending = (withdrawals as any[]).filter((w: any) => w.status === "pending");
    const lastTx = (transactions as any[]).slice(0, 3).map((t: any) =>
      `${t.amount} FCFA (${t.status}) on ${new Date(t.createdAt).toLocaleDateString()}`
    ).join("; ") || "none";

    return `Merchant context:
- Balances: ${balanceLines}
- Pending withdrawals: ${pending.length}
- Total transactions: ${(stats as any).transactionCount}, Total volume: ${(stats as any).totalVolume?.toLocaleString()} FCFA
- Recent transactions: ${lastTx}`;
  } catch {
    return "Merchant context: unavailable";
  }
}

// ─── OpenAI provider ──────────────────────────────────────────────────────────
async function askOpenAI(userMessage: string, systemPrompt: string): Promise<string | null> {
  const apiKey = await getAIKey("openai");
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 350,
        temperature: 0.7,
      }),
    });
    if (!res.ok) {
      console.error("[USERBOT] OpenAI error:", res.status, await res.text());
      return null;
    }
    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err: any) {
    console.error("[USERBOT] OpenAI fetch failed:", err.message);
    return null;
  }
}

// ─── Groq provider (OpenAI-compatible API, llama-3.1-8b-instant) ──────────────
async function askGroq(userMessage: string, systemPrompt: string): Promise<string | null> {
  const apiKey = await getAIKey("groq");
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 350,
        temperature: 0.7,
      }),
    });
    if (!res.ok) {
      console.error("[USERBOT] Groq error:", res.status, await res.text());
      return null;
    }
    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err: any) {
    console.error("[USERBOT] Groq fetch failed:", err.message);
    return null;
  }
}

// ─── Gemini provider (Google Generative Language API) ────────────────────────
async function askGemini(userMessage: string, systemPrompt: string): Promise<string | null> {
  const apiKey = await getAIKey("gemini");
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          generationConfig: { maxOutputTokens: 350, temperature: 0.7 },
        }),
      }
    );
    if (!res.ok) {
      console.error("[USERBOT] Gemini error:", res.status, await res.text());
      return null;
    }
    const data = await res.json() as any;
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (err: any) {
    console.error("[USERBOT] Gemini fetch failed:", err.message);
    return null;
  }
}

// ─── AI Orchestrator: tries OpenAI → Groq → Gemini, stops at first success ───
async function askAI(userMessage: string, merchantContext: string): Promise<string | null> {
  const systemPrompt = buildSystemPrompt(merchantContext);
  const providers: Array<{ name: string; fn: () => Promise<string | null> }> = [
    { name: "OpenAI", fn: () => askOpenAI(userMessage, systemPrompt) },
    { name: "Groq",   fn: () => askGroq(userMessage, systemPrompt) },
    { name: "Gemini", fn: () => askGemini(userMessage, systemPrompt) },
  ];

  for (const provider of providers) {
    try {
      const result = await provider.fn();
      if (result) {
        console.log(`[USERBOT] ${provider.name} responded successfully`);
        return result;
      }
      console.log(`[USERBOT] ${provider.name} returned empty, trying next...`);
    } catch (err: any) {
      console.error(`[USERBOT] ${provider.name} threw an error, trying next:`, err.message);
    }
  }
  console.log("[USERBOT] All AI providers failed, falling back to keyword responses");
  return null;
}

// ─── Pick random item from array ─────────────────────────────────────────────
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── Natural conversation response builder ────────────────────────────────────
async function buildNaturalResponse(text: string, merchantId: number, _lang?: string): Promise<string | null> {
  const lower = text.toLowerCase().trim();

  if (text.trim().length < 2) return null;

  // ── Greetings ────────────────────────────────────────────────────────────────
  if (/^(bonjour|salut|bonsoir|bonne nuit|coucou|bonne journée|hello|hi|hey|good morning|good afternoon|good evening|good day|yo|sup|what's up|wassup)\b/.test(lower)) {
    const hour = new Date().getHours();
    const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    return pick([
      `${greet}! How can I help you today?`,
      `${greet}! What can I do for you?`,
      `${greet}! Good to hear from you — what do you need?`,
    ]);
  }

  // ── How are you ──────────────────────────────────────────────────────────────
  if (/\b(comment (tu|vous) (vas|allez)|ça va|ca va|comment (ça|ca) va|how are you|how r u|you good|tu vas bien|vous allez bien)\b/.test(lower)) {
    return pick([
      "Doing great, thanks for asking! How about you? What can I help you with?",
      "All good here! Ready to assist — what do you need?",
    ]);
  }

  // ── Thanks ───────────────────────────────────────────────────────────────────
  if (/\b(merci|merci beaucoup|grand merci|mèsi|thanks|thank you|thank u|thx|ty|tks)\b/.test(lower)) {
    return pick([
      "You're welcome! Don't hesitate to reach out if you need anything else.",
      "Happy to help! I'm always here.",
      "Anytime! Let me know if anything else comes up.",
    ]);
  }

  // ── OK / Acknowledged ────────────────────────────────────────────────────────
  if (/^(ok|okay|d'accord|d accord|entendu|compris|vu|seen|noted|roger|alright|parfait|super|nickel|cool|👍|✅|👌)[\s!.]*$/.test(lower)) {
    return pick(["Perfect, I'm here if you need anything.", "Got it! Feel free to reach out anytime.", "Alright, just say the word."]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CANNOT-DO ACTIONS — always checked FIRST before informational responses
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Balance modification request ──────────────────────────────────────────
  const balanceModifyPattern = /\b(modifier|modifie|changer|change|augmenter|augmente|ajouter|ajoute|recharger|recharge|créditer|crediter|mettre à jour|mettre a jour|update|add.*balance|add.*solde|top.?up|increase.*balance|set.*balance|charge.*balance|correct.*balance|ajuster|adjust|fix.*balance|rectifier|corriger|rajouter)\b.*\b(solde|balance|argent|fonds|funds|account|compte)\b|\b(solde|balance|argent|fonds|funds|account|compte)\b.*\b(modifier|changer|augmenter|ajouter|recharger|créditer|mettre à jour|update|top.?up|increase|set|charge|correct|ajuster|adjust|fix|rectifier|corriger|rajouter)\b/i;
  if (balanceModifyPattern.test(lower)) {
    return "I'm not able to modify or adjust balances — this is handled exclusively by our technical team. Please contact @Atfchalvt or @geeorbotpay directly on Telegram and they will take care of it within a few minutes.";
  }

  // ── Refund request ────────────────────────────────────────────────────────
  if (/\b(rembourser|remboursement|remboursé|refund|refunded|reverse|reversal|annuler (le |un )?paiement|cancel.*payment|rendre (l'argent|les fonds))\b/i.test(lower)) {
    return "I'm not able to process refunds directly. Please share the transaction reference (OP-XXXX) with @Atfchalvt or @geeorbotpay on Telegram — the technical team will handle it promptly.";
  }

  // ── Withdrawal approval / force processing ────────────────────────────────
  if (/\b(approuver|approuve|valider|valide|forcer|force|débloquer|debloquer|unlock|approve|validate|process.*now|traiter.*maintenant|payer.*maintenant|pay.*now)\b.*\b(retrait|withdrawal|virement|transfer|payout)\b|\b(retrait|withdrawal|virement|transfer|payout)\b.*\b(approuver|valider|forcer|débloquer|unlock|approve|validate|process|traiter|payer)\b/i.test(lower)) {
    return "I'm not able to manually approve or force withdrawals. Withdrawals are processed by the technical team within 24-48 business hours. If yours has been pending longer than that, please contact @Atfchalvt or @geeorbotpay with your withdrawal reference and they'll look into it.";
  }

  // ── Commission / fee change request ──────────────────────────────────────
  if (/\b(changer|modifier|réduire|reduire|baisser|augmenter|négocier|negocier|change|modify|reduce|lower|decrease|increase|negotiate|update)\b.*\b(commission|frais|taux|fee|fees|rate|tarif)\b|\b(commission|frais|taux|fee|fees|rate|tarif)\b.*\b(changer|modifier|réduire|baisser|augmenter|négocier|change|modify|reduce|lower|decrease|increase|negotiate|update)\b/i.test(lower)) {
    return "I'm not able to modify commission rates or fees — these are set in your merchant contract. To discuss a rate change, please reach out to our commercial team via @Atfchalvt on Telegram.";
  }

  // ── Account creation / deletion / suspension ──────────────────────────────
  if (/\b(créer|creer|ouvrir|supprimer|effacer|suspendre|bloquer|débloquer|activer|désactiver|create|open|delete|remove|suspend|block|unblock|activate|deactivate)\b.*\b(compte|account|marchand|merchant|profil|profile)\b/i.test(lower)) {
    return "Account management (creation, deletion, suspension) is handled by the platform administrator. Please contact @Atfchalvt on Telegram and they will process your request.";
  }

  // ── Add / remove country or operator ─────────────────────────────────────
  if (/\b(ajouter|rajouter|activer|désactiver|supprimer|enlever|add|activate|deactivate|enable|disable|remove)\b.*\b(pays|country|opérateur|operator|réseau|network|mtn|orange|moov|wave|tmoney|flooz)\b/i.test(lower)) {
    return "Country and operator activation is managed by the technical team on our end. Please contact @Atfchalvt or @geeorbotpay on Telegram with your merchant name and the country/operator you need, and they'll set it up for you.";
  }

  // ── Password reset request (action) ──────────────────────────────────────
  if (/\b(réinitialiser|reinitialiser|changer|modifier|reset|change|update)\b.*\b(mot de passe|password|mdp|pass)\b|\b(mot de passe|password|mdp|pass)\b.*\b(réinitialiser|oublié|perdu|reset|forgot|lost|change|update)\b/i.test(lower)) {
    return "To reset your password, use the \"Forgot password\" link on the merchant login page — a reset link will be sent to your registered email. If you no longer have access to that email, contact @Atfchalvt on Telegram for manual assistance.";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INFORMATIONAL RESPONSES
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Transaction reference lookup (OP-XXXX or TR-XXXX) ────────────────────────
  const refMatch = text.match(/\b(OP|TR|WP)-[A-Z0-9]{4,}\b/i);
  if (refMatch) {
    const ref = refMatch[0].toUpperCase();
    return `I've noted the reference ${ref}. I'll escalate this to our technical team for investigation. In the meantime, please ensure the customer's phone received the USSD prompt. Our team will get back to you as quickly as possible.`;
  }

  // ── Phone number detected ─────────────────────────────────────────────────────
  if (/(\+?2[0-9]{10,12}|0[67][0-9]{8})/.test(lower)) {
    return "I've noted the phone number. Could you also share the transaction reference (format OP-XXXX) and the amount involved? That will help our technical team investigate more efficiently.";
  }

  // ── API / Integration ────────────────────────────────────────────────────────
  if (/\b(intégr|integr|api|sdk|webhook|clé api|api key|documentation|doc|developer|développeur|implémenter|implement|integrate|integration|endpoint|requête|request|callback|http|curl|postman|json)\b/.test(lower)) {
    return `To integrate the WestPay API:\n\n1. Get your API key from your dashboard (tab "API & SDK")\n2. Full documentation at /api-docs\n3. Payment endpoint: POST /api/payment/initiate\n4. Add X-API-Key header with your key\n5. Configure your webhook URL to receive payment confirmations\n\nDo you need help with a specific step?`;
  }

  // ── Balance / Solde (read only) ──────────────────────────────────────────────
  if (/\b(balance|solde|combien (j'ai|il y a|reste|j'ai reçu)|how much|available|disponible|voir (mon|le) solde|mon compte|account balance)\b/.test(lower)) {
    return getBalanceText(merchantId);
  }

  // ── Withdrawals status (read only) ────────────────────────────────────────────
  if (/\b(retrait|retraits|withdrawal|withdraw|payout|virement|reversement|cashout|cash out|statut.*retrait|withdrawal.*status)\b/.test(lower)
    || /\b(voir (mes|les) retraits|mes retraits|my withdrawals|liste.*retrait)\b/.test(lower)) {
    return getWithdrawalsText(merchantId);
  }

  // ── Transfer money to customer ────────────────────────────────────────────────
  if (/\b(transférer|transfer|virer|envoyer (de l'argent|des fonds)|send (money|funds)|payer (un client|le client)|pay.*customer)\b/.test(lower)) {
    return "To transfer funds to a customer, go to your dashboard and use the \"Transfers\" tab. Enter the recipient's phone number, operator, country, and amount. The transfer will be processed via the Mobile Money network. If you encounter any issue, share the TR-XXXX reference with our team.";
  }

  // ── Waiting / Not yet received ────────────────────────────────────────────────
  if (/\b(en attente|pending|pas encore|toujours pas|not yet|still waiting|haven't received|pas arrivé|pas reçu|non reçu|not received|where is|où est|where('s| is) my)\b/.test(lower)) {
    return "I understand your concern. Please share the transaction reference (OP-XXXX format) or the phone number involved. I'll pass this to our technical team who will check the real-time status and respond to you as quickly as possible.";
  }

  // ── Transactions / Historique ────────────────────────────────────────────────
  if (/\b(transaction|paiement reçu|encaissement|payment|deposit|historique|history|receipt|récent|recent|dernière|last|voir (mes|les) (paiements|transactions)|combien (de paiements|de transactions|j'ai eu))\b/.test(lower)) {
    return getTransactionsText(merchantId);
  }

  // ── Stats / Volume ───────────────────────────────────────────────────────────
  if (/\b(stat|stats|statistique|statistic|volume|total|performance|rapport|report|résumé|summary|combien (j'ai fait|j'ai encaissé|total))\b/.test(lower)) {
    return getStatsText(merchantId);
  }

  // ── Payment failed / Declined ────────────────────────────────────────────────
  if (/\b(échoué|echec|échec|failed|failure|refusé|refuse|declined|rejeté|rejected|annulé|canceled|ne passe pas|doesn't go through|paiement bloqué)\b/.test(lower)) {
    return "A failed payment typically has one of these causes: invalid or inactive phone number, insufficient customer balance, or a temporary operator network issue. Please share the OP-XXXX reference so our technical team can check the server-side details and give you a precise answer.";
  }

  // ── Problème / Erreur ────────────────────────────────────────────────────────
  if (/\b(problème|probleme|soucis|souci|problem|issue|bug|erreur|error|ne (fonctionne|marche) pas|doesn't work|not working|bloqué|blocked|planté|crash)\b/.test(lower)) {
    return pick([
      "I'm sorry to hear that. Please describe the issue and include the transaction reference (OP-XXXX) if you have one — I'll escalate this to our technical team right away.",
      "Got it. Please tell me more about what's happening and share the transaction reference if available. I'll flag this to our tech team immediately.",
    ]);
  }

  // ── Délai / Timing ───────────────────────────────────────────────────────────
  if (/\b(délai|delai|combien de temps|how long|durée|duration|processing time|temps (de|d')attente|temps de traitement|prend (du temps|longtemps))\b/.test(lower)) {
    return "Mobile Money payments confirm within seconds to a few minutes after the customer validates the USSD prompt. For Wave, the customer receives a payment link. Withdrawals are processed within 24-48 business hours. If something has been pending longer than expected, contact us with the reference (OP-XXXX or TR-XXXX).";
  }

  // ── Frais / Commission (informational only) ───────────────────────────────────
  if (/\b(frais|commission|tarif|fee|fees|taux|rate|déduire|déduit|retenu|how much (do you charge|is the fee|are the fees)|combien (ça coûte|vous prenez|vous déduisez|est déduit))\b/.test(lower)) {
    return "Your commission rate is defined in your merchant contract and is automatically deducted from each received payment. You can view your current rate in your dashboard under \"Settings\". To discuss a rate change, contact our team via @Atfchalvt on Telegram.";
  }

  // ── Login / Access issues (informational) ────────────────────────────────────
  if (/\b(mot de passe|password|mdp|connexion|connecter|login|se connecter|oublié|forgot|accès|access|se connecte plus|cannot login|can't login|locked out)\b/.test(lower)) {
    return "To access your account, go to the merchant login page and click \"Forgot password\" — a reset link will be sent to your registered email. If you're locked out or don't have access to your email, contact @Atfchalvt on Telegram for direct assistance.";
  }

  // ── Opérateurs / Pays (informational) ────────────────────────────────────────
  if (/\b(opérateur|operator|pays|country|countries|mtn|orange|moov|wave|tmoney|flooz|airtel|mpesa|mobile money|togo|benin|bénin|burkina|côte d'ivoire|cote d'ivoire|mali|sénégal|senegal)\b/.test(lower)) {
    return "WestPay supports MTN, Orange, Moov, Wave, TMoney, Flooz and more across West Africa (Togo, Benin, Burkina Faso, Ivory Coast, Mali, Senegal…). To add or activate a country/operator on your account, contact @Atfchalvt or @geeorbotpay on Telegram — the technical team handles these activations.";
  }

  // ── Crypto ───────────────────────────────────────────────────────────────────
  if (/\b(crypto|bitcoin|btc|eth|usdt|tron|trx|bnb|ethereum|litecoin|ltc|dogecoin|doge|cryptomonnaie|cryptocurrency|oxapay|stablecoin)\b/.test(lower)) {
    return "WestPay supports crypto payments via OxaPay (USDT, BTC, ETH, TRX, BNB, LTC and more). No geographic restriction — available globally. To enable crypto on your account, contact @Atfchalvt on Telegram. Once active, integration details are in your dashboard under the \"Crypto\" tab and at /api-docs.";
  }

  // ── Contact / Escalate to human ─────────────────────────────────────────────
  if (/\b(contacter|contact|support|assistance|parler à quelqu'un|speak to someone|human|agent|équipe|team|urgence|urgent|escalade|escalate|responsable|manager)\b/.test(lower)) {
    return "Our support team is available on Telegram: @Atfchalvt, @geeorbotpay, @pankeyrobotpay, @astapay. For urgent technical issues, please mention your merchant name and the transaction reference (OP-XXXX or TR-XXXX) so they can assist you faster.";
  }

  // ── What can you do ──────────────────────────────────────────────────────────
  if (/\b(que (peux-tu|pouvez-vous|peut-on)|what can you|que fais-tu|what do you do|aide-moi|aidez-moi|help me|j'ai besoin d'aide|i need help|comment ça marche|how does this work|quoi faire|what to do)\b/.test(lower)) {
    return `I'm your WestPay first-line support assistant. Here's what I can help with:\n\nView your available balance, pending withdrawals, and recent transactions\nExplain API integration and webhook setup\nGuide you through dashboard features\nExplain payment delays and failure reasons\nEscalate complex issues to the technical team\n\nNote: I cannot modify balances, approve withdrawals, or change settings — those require the technical team. Just tell me what you need!`;
  }

  // ── Payment link ──────────────────────────────────────────────────────────────
  if (/\b(lien de paiement|payment link|lien paiement|page de paiement|payment page|share.*link|envoyer.*lien|send.*link)\b/.test(lower)) {
    return "You can create payment links from your dashboard under the \"Payment Links\" tab. Each link can have a fixed or variable amount, and you can share it directly with your customers via any channel. Payments confirm automatically and are credited to your balance.";
  }

  // ── Customer-side issues ─────────────────────────────────────────────────────
  if (/\b(client|customer|acheteur|buyer|utilisateur|ils (n'arrivent|ne peuvent)|they can't|customer.*problem)\b/.test(lower)) {
    return "For customer-side issues, first verify the Mobile Money number is correct and active on the operator. If the customer did not receive the USSD prompt, they can retry after a few minutes. For Wave, the customer must click the payment link. Share the OP-XXXX reference so our technical team can investigate on the server side.";
  }

  // ── Amount mentioned ─────────────────────────────────────────────────────────
  if (/\b(\d[\d\s]*(?:fcfa|xof|cfa|f\b|francs?)?)\b/i.test(lower)) {
    return "I see you're mentioning an amount. Could you clarify — is this about a pending payment, a withdrawal, or a balance discrepancy? If you have a transaction reference (OP-XXXX), please share it so I can pass the details to our technical team.";
  }

  // ── Intelligent fallback ──────────────────────────────────────────────────────
  if (text.trim().length < 5) return null;

  if (/\?/.test(text) || /^(comment|pourquoi|quand|quoi|combien|est-ce que|is|can|how|why|what|when|where|does|do|could|would|should)\b/.test(lower)) {
    return pick([
      "Good question! To help you accurately, could you give me a bit more detail? I can check your balance, withdrawals, transactions, explain platform features, or escalate to the technical team.",
      "I'm here to help. Could you clarify a bit more? For example: is this about a payment, a withdrawal, a technical issue, or a platform feature?",
    ]);
  }

  return pick([
    "Understood. Could you give me a bit more detail? If there's a transaction involved, the reference (OP-XXXX or TR-XXXX) will help our team investigate faster.",
    "Got it. Tell me more — I can check your payments or balance, explain platform features, or escalate this to the technical team.",
    "I see. To assist you properly, could you clarify whether this is about a payment, a withdrawal, an account setting, or something else?",
  ]);
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
        message: "Invalid or expired code. Please generate a new code from your dashboard.",
        replyTo: message.id,
      });
      return;
    }

    await linkGroupToMerchant(chatId, merchantId);
    await storage.markTelegramActivationCodeUsed(code);

    const merchant = await storage.getMerchantById(merchantId);
    await client.sendMessage(chat, {
      message: `Group successfully linked to account ${merchant?.name || "merchant"}. I'm here to answer your questions.`,
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

  // ── Build response ────────────────────────────────────────────────────────
  const merchant = await storage.getMerchantById(merchantId);
  if (!merchant) return;

  // ── Apply delay + typing indicator before generating (feels human) ────────
  const delayMs = await getResponseDelayMs();
  if (delayMs > 0) {
    await sendTyping(chat);
    await new Promise(resolve => setTimeout(resolve, Math.min(delayMs, 2000)));
  }

  // ── Try AI providers (OpenAI → Groq → Gemini), fallback to keyword-based ──
  let response: string | null = null;

  try {
    const merchantContext = await buildMerchantContext(merchantId);
    response = await askAI(text, merchantContext);
  } catch (err: any) {
    console.error("[USERBOT] AI orchestrator failed:", err.message);
  }

  if (!response) {
    const lang = detectLanguage(text);
    response = await buildNaturalResponse(text, merchantId, lang);
  }

  if (!response) return;

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
