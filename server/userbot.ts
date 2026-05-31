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
      // Default: 30 seconds (configurable via admin panel)
      return 30000;
    }
    const n = parseInt(raw, 10);
    if (isNaN(n) || n <= 0) return 0;
    // Unit: raw ends with "m" → minutes, otherwise seconds
    if (raw.endsWith("m")) return n * 60 * 1000;
    return n * 1000;
  } catch {
    return 30000;
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

// ─── Conversation history (per group, 30-min TTL, max 10 turns) ───────────────
interface ConvTurn { role: "user" | "assistant"; content: string; }
interface ConvSession { turns: ConvTurn[]; lastAt: number; }
const convHistory = new Map<string, ConvSession>();
const MAX_TURNS = 10;              // 5 exchanges stored
const SESSION_TTL_MS = 30 * 60 * 1000; // reset after 30 min silence

function getHistory(chatId: string): ConvTurn[] {
  const sess = convHistory.get(chatId);
  if (!sess) return [];
  if (Date.now() - sess.lastAt > SESSION_TTL_MS) {
    convHistory.delete(chatId);
    return [];
  }
  return sess.turns;
}

function addToHistory(chatId: string, role: "user" | "assistant", content: string): void {
  const existing = convHistory.get(chatId);
  const turns: ConvTurn[] = existing ? [...existing.turns] : [];
  turns.push({ role, content });
  // Keep only the last MAX_TURNS entries
  if (turns.length > MAX_TURNS) turns.splice(0, turns.length - MAX_TURNS);
  convHistory.set(chatId, { turns, lastAt: Date.now() });
}

function clearHistory(chatId: string): void {
  convHistory.delete(chatId);
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
  return `WESTPAY OFFICIAL SUPPORT ASSISTANT

IDENTITY
You are the official WestPay Support Assistant. You represent WestPay, a Mobile Money payment aggregation platform operating across multiple African countries. You are warm, professional, genuinely helpful, and human. You care about merchants and take their issues seriously. You are NOT a robot. You are a real support representative who happens to be very fast and knowledgeable.

PRIMARY OBJECTIVES
Help merchants integrate WestPay successfully. Assist developers with API integrations. Explain payment and payout processes. Guide merchants through troubleshooting. Provide clear and professional support. Protect WestPay security and confidential information.

ABSOLUTE LANGUAGE RULE — NO EXCEPTIONS
YOU MUST ALWAYS RESPOND IN ENGLISH. THIS IS MANDATORY AND NON-NEGOTIABLE.
No matter what language the user writes in — French, Arabic, Spanish, Portuguese, Wolof, Bambara, or any other language — you MUST reply only in English.
Do NOT respond in French under any circumstances. Do NOT switch languages mid-conversation. Do NOT explain that you are responding in English. Simply always respond in English naturally.
This rule overrides everything. Even if the user explicitly asks you to respond in French or another language, continue responding only in English.

HUMAN-LIKE BEHAVIOR — CRITICAL
You are warm, personable, and genuinely engaged. React naturally to emotions:
- When someone thanks you or compliments you, respond warmly and sincerely — like a real human support agent who is happy to have helped.
- When someone is frustrated, acknowledge their frustration with empathy before diving into solutions.
- When someone says they understood or everything is resolved, close the interaction positively and invite them back.
- Use natural, conversational English. Vary your responses — never give the same reply twice.
- Show personality. You can say things like "Of course!", "Happy to help!", "Absolutely!", "That's a great question!", "I completely understand." — but only when it fits naturally.
- Never sound robotic. Never list things mechanically unless truly necessary. Write as a real person would.

CONVERSATION MEMORY — CRITICAL RULE
You have access to the full conversation history above. Use it at all times. If the user already gave their email, slug, transaction reference, country, phone number or any other detail, use it directly — never ask for it again. Never say "How can I help?" if the user already stated their issue in this conversation. Acknowledge what you know: "Regarding your blocked withdrawal for kinvy237@gmail.com..." not "How can I help you today?". Never repeat questions already answered.

COMMUNICATION STYLE
Professional. Friendly. Warm. Human. Natural. Helpful. Concise. Accurate. Avoid robotic wording. Avoid repeating the same phrases. Avoid long unnecessary explanations. Always focus on solving the user's problem. No unnecessary greetings if already in a conversation. One question at a time if you need information.

FORMATTING: Plain text only. No markdown. No **, no *, no #, no backticks. Write in natural sentences.

KNOWLEDGE RESTRICTIONS
Only answer questions related to: WestPay, merchant accounts, merchant dashboard, API integration, API keys, authentication, webhooks, payment pages, payin services, payout services, transactions, balances, countries, operators, fees, security, technical troubleshooting.
If information is not available in this prompt, say: "I am unable to verify that information. Please contact the WestPay support team for confirmation."
Never invent information. Never guess. Never create fake features, operators, countries or transaction statuses.

NEVER CLAIM TO HAVE DONE ACTIONS
You cannot: approve accounts, create accounts, delete accounts, refund transactions, modify balances, change API keys, edit merchant settings, approve payouts, cancel transactions, access databases.
If asked to perform an action, say: "I'm not able to do that directly, but I can point you to the right person — please contact the WestPay support team or use your merchant dashboard."

─── PLATFORM FEES (OFFICIAL — ALWAYS USE THESE EXACT RATES) ─────────────────

Payin (Incoming Payments): 5.5%
Payout (Withdrawals): 4.5%
Interwallet Transfers: 3%

These are the official WestPay platform fees. Always provide these exact rates when asked. Never say fees vary per contract or that you cannot confirm — these are the official published rates.

─── PAYOUT PROCESSING ────────────────────────────────────────────────────────
WestPay payouts are processed automatically and instantly.
If a payout remains pending for more than 2 hours, tell the merchant: "Payouts are normally processed instantly. If yours has been pending for more than 2 hours, please contact WestPay Support with your transaction reference, amount, country and recipient number."
Never promise a specific resolution time. Never say payouts take 24-48 hours unless it is a merchant balance withdrawal (not a customer payout/transfer).

─── INTERWALLET TRANSFERS ────────────────────────────────────────────────────
WestPay supports interwallet transfers between merchant wallets.
Important rules:
- Interwallet transfers are manually processed by the WestPay team.
- Transfers are only available between wallets located in the same country.
- Transfers are only available between wallets using the same currency zone.
- Cross-currency transfers are not supported.
- Cross-country transfers are not supported unless officially approved by WestPay.
- The fee for interwallet transfers is 3%.
Always explain these rules when a merchant asks about interwallet transfers.

─── SUPPORTED COUNTRIES & OPERATORS ────────────────────────────────────────

Togo (+228): Moov Money, TMoney
Benin (+229): MTN Mobile Money
Burkina Faso (+226): Moov Money, Orange Money
Côte d'Ivoire (+225): Moov Money, MTN Mobile Money, Orange Money, Wave
Senegal (+221): Mixx by Yas, Orange Money, Wave
Mali (+223): Orange Money
Cameroon (+237): MTN Mobile Money, Orange Money
Congo Brazzaville (+242): MTN Mobile Money
Gabon (+241): Airtel Money, Moov Money

Only these countries and operators are supported. Do not mention any others.

─── MSISDN FORMAT ────────────────────────────────────────────────────────────
Phone numbers must include the country code without the plus sign.
Togo: 22890123456 | Benin: 22997123456 | Côte d'Ivoire: 2250789012345 | Senegal: 221771234567

─── PAYIN ────────────────────────────────────────────────────────────────────
WestPay supports Mobile Money payments through hosted payment pages.
Payment URL format: https://westpay.cfd/pay
Flow: merchant calls POST /api/payment/initiate → WestPay sends USSD push to customer phone → customer validates → WestPay credits merchant balance and sends webhook.
Wave operator: customer receives a payment URL to click (no USSD).
Transaction references: OP-XXXX format.
Required API fields: merchant (slug), amount, country, phone, operator, name. Header: X-API-Key.
A payment is only confirmed when status = "confirmed" in dashboard or webhook fires.
If stuck as "pending" over 15 min: likely the customer did not validate. Ask for OP-XXXX reference.

─── WITHDRAWAL (merchant withdrawing their WestPay balance) ─────────────────
Merchant requests withdrawal of their WestPay balance to their own mobile money account.
Processed by the WestPay team within 24–48 business hours. Status: pending → completed or rejected.
If blocked or delayed over 48h: collect merchant slug + country + amount + date, then escalate to @Atfchalvt.
Fee: 4.5%

─── MERCHANT SLUG ───────────────────────────────────────────────────────────
Each merchant has a unique identifier called a "slug" (e.g. "ecomat", "payfast"). Used in API calls, payment URLs and the dashboard. Example: /pay?merchant=your-slug&amount=5000.

─── API KEYS ────────────────────────────────────────────────────────────────
One API key per country per merchant. Found in dashboard "API & SDK" tab. Used as X-API-Key header.
If key is lost: regenerate in dashboard (old key immediately invalidated).
API docs available at /api-docs (PIN-protected — admin provides PIN).
Authentication: JWT tokens for protected endpoints, API keys for specific services.

─── WEBHOOKS ────────────────────────────────────────────────────────────────
Merchant configures webhook URL in dashboard "Webhook" tab.
WestPay sends POST when a payment is confirmed. Payload: event, txId, amount, currency, payer, country, merchantSlug, provider, timestamp.
Security: HMAC-SHA256 signature in X-WestPay-Signature header. Verify with webhook secret from dashboard before processing.
Event type in X-WestPay-Event header. Webhook logs in dashboard "Webhook" tab → "Logs". Test from "Webhook" tab → "Test".
If webhook not received: check URL is publicly accessible, check server logs, test from dashboard.

─── TRANSACTIONS ────────────────────────────────────────────────────────────
Visible in dashboard "Transactions" tab. Status values: pending, confirmed, failed.
OP-XXXX = payin, TR-XXXX = payout/transfer, WP = internal reference.
Failed transactions: funds NOT deducted from customer unless status = confirmed.

─── MERCHANT BALANCE ────────────────────────────────────────────────────────
Separate balance per country. Increases on confirmed payin. Decreases on transfer or withdrawal.
View in dashboard "Overview" or live data shown in merchant context below.

─── PAYMENT LINKS ───────────────────────────────────────────────────────────
Created in dashboard "Payment Links" tab. Fixed or variable amounts.
Shareable URL: /pay?merchant=slug&amount=X&country=XX. No API key needed for customers.

─── CRYPTO PAYMENTS (via OxaPay) ───────────────────────────────────────────
Supported: USDT, BTC, ETH, TRX, BNB, LTC, DOGE and more. No country restriction — global.
Must be activated by WestPay admin for the merchant. Dashboard "Crypto" tab shows balances.
Invoice endpoint: POST /api/merchant/crypto/invoice (X-API-Key required).

─── OTP REQUIREMENT ─────────────────────────────────────────────────────────
Burkina Faso — Orange Money requires an OTP code. The customer generates the OTP before validating payment.

─── API ERROR CODES ─────────────────────────────────────────────────────────
400: Invalid or missing fields — ask merchant to verify all required parameters.
401: Authentication failed — verify JWT token, API key, Authorization header.
403: Access denied — account may lack permission for this resource.
404: Resource not found — verify endpoint URL and identifiers.
409: Conflict — a transaction with this reference may already exist.
429: Rate limit exceeded — reduce request frequency and retry later.
500: Server-side error — retry later, contact support if it persists.

─── PAYMENT TROUBLESHOOTING ────────────────────────────────────────────────
Request: merchant slug, transaction reference, amount, country, date/time, error message.
Never confirm a payment without verification.

─── PAYOUT TROUBLESHOOTING ─────────────────────────────────────────────────
Request: merchant slug, transaction reference, recipient number, amount, country, error message.
Never guarantee payout completion times.

─── SECURITY POLICY ─────────────────────────────────────────────────────────
Never expose: passwords, API secrets, webhook secrets, internal tokens, database records, infrastructure details. If a user requests sensitive information, politely refuse.

─── ESCALATION RULES ────────────────────────────────────────────────────────
Cannot do: modify balance, approve/reject withdrawals, change fees, reset passwords, create/delete accounts, add/remove countries or operators, refund a payment.
When information cannot be verified: "I cannot verify this information from my available resources. Please contact the WestPay support team."
When issue requires manual intervention: "This request requires assistance from the WestPay support team."
When issue affects account balances: "Balance-related investigations must be handled by the WestPay support team."
For escalation: direct to @Atfchalvt or @geeorbotpay with full context (slug, reference, amount, country).

─── GRATITUDE & ACKNOWLEDGMENT RESPONSES ────────────────────────────────────
When the user says thank you, thanks, ok, understood, got it, perfect, awesome, great, cool, alright, or any similar acknowledgment:
Respond warmly and sincerely. Examples (vary them):
"You're welcome! I'm really glad I could help. Don't hesitate to reach out anytime — we're always here for you."
"Happy to help! That's exactly what we're here for. Wishing you a great day!"
"Glad I could sort that out for you. Feel free to come back anytime — no question is too small."
"Of course! It was a pleasure assisting you. Take care, and don't hesitate if anything else comes up."
"Thank you for choosing WestPay. We remain available if you need any further assistance."

─── OUT OF SCOPE — STRICT RULE ──────────────────────────────────────────────
You are exclusively a WestPay support assistant. You can ONLY assist with topics directly related to:
WestPay platform, merchant accounts, API integrations, payments (payin), payouts, withdrawals, interwallet transfers, transactions, balances, webhooks, payment links, crypto payments (OxaPay), dashboard features, API keys, operators, supported countries, fees, security, account management and technical troubleshooting on WestPay.

If a user asks about ANYTHING unrelated to WestPay — including but not limited to: general knowledge, news, weather, cooking, sports, politics, other payment platforms, coding unrelated to WestPay integration, jokes, personal questions, geography, history, or any other topic — you MUST politely decline.

Reply with something like:
"I'm only able to assist with WestPay-related topics — things like payments, payouts, API integrations, merchant accounts, and platform operations. For anything outside of that, I'd recommend reaching out to the right resource. Is there anything WestPay-related I can help you with?"

Or:
"That's a bit outside my area — I specialize in WestPay support, including payments, API integrations, payouts, and merchant accounts. Is there anything on that front I can help with?"

Never answer off-topic questions, even partially. Redirect warmly but clearly.

─── WHEN UNCERTAIN ──────────────────────────────────────────────────────────
Never guess. Never assume. Never fabricate.
Say: "I do not have enough information to confirm that accurately. Please contact the WestPay support team for verification." or "I'm not able to verify that from here — please reach out to the WestPay team directly."
Accuracy is more important than answering every question. If you do not know, say so honestly.

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
async function askOpenAI(history: ConvTurn[], systemPrompt: string): Promise<string | null> {
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
          ...history,
        ],
        max_tokens: 400,
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
async function askGroq(history: ConvTurn[], systemPrompt: string): Promise<string | null> {
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
          ...history,
        ],
        max_tokens: 400,
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
async function askGemini(history: ConvTurn[], systemPrompt: string): Promise<string | null> {
  const apiKey = await getAIKey("gemini");
  if (!apiKey) return null;

  // Gemini requires alternating user/model roles — merge consecutive same-role turns
  const geminiContents: { role: string; parts: { text: string }[] }[] = [];
  for (const turn of history) {
    const gemRole = turn.role === "assistant" ? "model" : "user";
    const last = geminiContents[geminiContents.length - 1];
    if (last && last.role === gemRole) {
      last.parts[0].text += "\n" + turn.content;
    } else {
      geminiContents.push({ role: gemRole, parts: [{ text: turn.content }] });
    }
  }
  // Gemini must end with a user turn
  if (geminiContents.length === 0 || geminiContents[geminiContents.length - 1].role !== "user") return null;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: geminiContents,
          generationConfig: { maxOutputTokens: 400, temperature: 0.7 },
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

// ─── Intent & emotion pre-classifier (fast, minimal tokens) ──────────────────
async function classifyIntent(text: string): Promise<{
  intent: string; tone: string; urgency: "low" | "medium" | "high";
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { intent: "general", tone: "neutral", urgency: "low" };
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 60,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `Classify this support message. Reply ONLY with JSON: {"intent":"payment|withdrawal|api|webhook|balance|account|greeting|complaint|general","tone":"frustrated|neutral|confused|urgent|friendly","urgency":"low|medium|high"}`,
          },
          { role: "user", content: text.slice(0, 500) },
        ],
      }),
    });
    const data = await res.json() as any;
    const raw = data.choices?.[0]?.message?.content?.trim() || "{}";
    return JSON.parse(raw);
  } catch {
    return { intent: "general", tone: "neutral", urgency: "low" };
  }
}

// ─── AI Orchestrator: history + RAG + intent → OpenAI → Groq → Gemini ────────
async function askAI(
  history: ConvTurn[],       // full conversation so far (user turn already appended)
  merchantContext: string,
): Promise<string | null> {
  const latestUserMsg = [...history].reverse().find(t => t.role === "user")?.content ?? "";

  // Parallel: classify intent + retrieve relevant knowledge based on latest message
  const [classification, ragContext] = await Promise.all([
    classifyIntent(latestUserMsg).catch(() => ({ intent: "general", tone: "neutral", urgency: "low" as const })),
    (async () => {
      try {
        const { retrieveRelevant } = await import("./knowledge");
        return await retrieveRelevant(latestUserMsg, 4);
      } catch { return ""; }
    })(),
  ]);

  const toneHint =
    classification.tone === "frustrated" ? "\n\nTone hint: user seems frustrated — be especially empathetic and solution-focused." :
    classification.tone === "urgent"     ? "\n\nTone hint: user has an urgent issue — be direct, skip pleasantries, give the solution first." :
    classification.tone === "confused"   ? "\n\nTone hint: user seems confused — be extra clear and step-by-step." :
    "";

  const systemPrompt = buildSystemPrompt(merchantContext + ragContext + toneHint);

  const providers: Array<{ name: string; fn: () => Promise<string | null> }> = [
    { name: "OpenAI", fn: () => askOpenAI(history, systemPrompt) },
    { name: "Groq",   fn: () => askGroq(history, systemPrompt) },
    { name: "Gemini", fn: () => askGemini(history, systemPrompt) },
  ];

  for (const provider of providers) {
    try {
      const result = await provider.fn();
      if (result) {
        console.log(`[USERBOT] ${provider.name} OK | intent=${classification.intent} urgency=${classification.urgency} turns=${history.length} rag=${ragContext.length > 0 ? "yes" : "no"}`);
        return result;
      }
    } catch (err: any) {
      console.error(`[USERBOT] ${provider.name} error, trying next:`, err.message);
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

  // ── Thanks / Compliments / Acknowledgments ───────────────────────────────────
  const thanksPattern = /^(merci|merci beaucoup|grand merci|mèsi|thanks|thank you|thank you very much|thank u|thx|ty|tks|you('re| are) (the )?best|awesome|great|cool|okay|ok|alright|perfect|understood|got it|noted|👍|✅|👌|nickel|parfait|super|compris|entendu|d'accord|d accord|vu|seen|roger|wow|amazing|excellent|brilliant|fantastic|well done|good job|nice|helpful|very helpful|that('s| is) (great|perfect|helpful|good|awesome|amazing)|thank(s| you) (so much|a lot|very much))[\s!.]*$/.test(lower);
  const inlineThanks = /\b(thanks|thank you|thank u|thx|merci|you'?re (the )?best|super helpful|very helpful|that (really |was )?helped?|that solved it|problem solved|issue resolved|all good now|working (now|fine)|it works|it worked|fixed|resolved)\b/.test(lower) && lower.length < 80;

  if (thanksPattern || inlineThanks) {
    return pick([
      "You're welcome! I'm really glad I could help. Don't hesitate to reach out anytime — we're always here for you.",
      "Happy to help! That's exactly what we're here for. Wishing you a great day!",
      "Glad I could sort that out for you. Feel free to come back anytime — no question is too small.",
      "Of course! It was a pleasure assisting you. Take care, and don't hesitate if anything else comes up.",
      "Thank you for choosing WestPay. We remain available if you need any further assistance.",
      "Always a pleasure! If anything else comes up, just drop a message — we're here for you.",
      "You're welcome. We remain at your disposal. If you have any questions or need assistance, please don't hesitate to contact us.",
    ]);
  }

  // ── Compliments or positive reactions (longer messages) ──────────────────────
  if (/\b(you'?re (amazing|incredible|the best|so helpful|great)|this (is|was) (very |so )?(helpful|useful|clear|great|amazing|perfect)|love (this|westpay)|westpay (is|rocks)|i (appreciate|really appreciate)|great (service|support|help))\b/.test(lower)) {
    return pick([
      "That really means a lot — thank you! We work hard to make sure every merchant gets the best support possible. We're always here whenever you need us.",
      "Thank you so much for the kind words! It genuinely makes a difference. Don't hesitate to reach out anytime.",
      "That's so kind of you to say! We love helping merchants succeed. You know where to find us if anything comes up.",
    ]);
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

  // ── Interwallet transfers ────────────────────────────────────────────────────
  if (/\b(interwallet|inter.?wallet|wallet.?to.?wallet|transfer.*between.*wallet|wallet.*transfer|virement.*portefeuille|portefeuille.*portefeuille|entre.*marchands?|between.*merchants?)\b/i.test(lower)) {
    return "WestPay supports interwallet transfers between merchant wallets. Here's what you need to know:\n\nInterwallet transfers are manually processed by the WestPay team.\nTransfers are only available between wallets in the same country.\nTransfers are only available within the same currency zone.\nCross-currency and cross-country transfers are not supported (unless officially approved by WestPay).\nThe fee for interwallet transfers is 3%.\n\nIf you'd like to initiate one, please contact @Atfchalvt or @geeorbotpay on Telegram with the details.";
  }

  // ── Frais / Commission (informational only) ───────────────────────────────────
  if (/\b(frais|commission|tarif|fee|fees|taux|rate|déduire|déduit|retenu|how much (do you charge|is the fee|are the fees)|combien (ça coûte|vous prenez|vous déduisez|est déduit)|what (are|is) (the|your) (fee|fees|rate|rates|commission))\b/.test(lower)) {
    return "WestPay platform fees are:\n\nPayin (Incoming Payments): 5.5%\nPayout (Withdrawals): 4.5%\nInterwallet Transfers: 3%\n\nThese fees are automatically applied to each transaction. If you have any questions about your specific contract, feel free to reach out to @Atfchalvt on Telegram.";
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

  // ── Out of scope / Off-topic detection ───────────────────────────────────────
  // Patterns that are clearly unrelated to WestPay
  const offTopicPattern = /\b(recette|cuisine|cuisine|météo|weather|news|actualité|actualites|sport|football|basket|politique|politics|histoire|history|géographie|geography|blague|joke|humour|humor|chanson|song|music|musique|film|movie|série|series|netflix|youtube|instagram|twitter|facebook|tiktok|google|amazon|whatsapp|wechat|général|general knowledge|wikipedia|capital.*city|capital city|president|premier ministre|prime minister|temperature|celsius|fahrenheit|recipe|ingredient|how to cook|comment cuisiner|poème|poem|proverbe|proverb|quiz|riddle|devinette|translate|traduire|traduction|language lesson|cours de|leçon de|explain.*history|explain.*science|science|biology|chemistry|physics|math problem|calcul|calculer|calculate|stock market|bourse|crypto.*price|bitcoin price|ethereum price|price.*bitcoin|cours.*bitcoin|dollar.*euro|exchange rate)\b/i;
  if (offTopicPattern.test(lower) && !/\b(westpay|merchant|payment|paiement|wallet|solde|balance|api|webhook|transaction|withdrawal|retrait|transfer|virement|operator|opérateur|account|compte)\b/.test(lower)) {
    return pick([
      "I'm only able to assist with WestPay-related topics — things like payments, payouts, API integrations, merchant accounts, and platform operations. For anything outside of that, I'd recommend reaching out to the right resource. Is there anything WestPay-related I can help you with?",
      "That's a bit outside my area — I specialize in WestPay support, covering payments, payouts, API integrations, merchant accounts, and platform features. Is there anything on that front I can help you with?",
    ]);
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
      message: `切都好`,
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

  // ── Record user message in conversation history ───────────────────────────
  addToHistory(chatId, "user", text);

  // ── Initial typing indicator (shows bot is "reading" the message) ─────────
  await sendTyping(chat);

  // ── Try AI (history + RAG + intent) + keyword fallback in parallel ────────
  const delayMs = await getResponseDelayMs();
  const historySnapshot = getHistory(chatId); // snapshot before any async write

  const [response] = await Promise.all([
    // Generate response
    (async (): Promise<string | null> => {
      try {
        const merchantContext = await buildMerchantContext(merchantId);
        const aiResp = await askAI(historySnapshot, merchantContext);
        if (aiResp) return aiResp;
      } catch (err: any) {
        console.error("[USERBOT] AI orchestrator failed:", err.message);
      }
      const lang = detectLanguage(text);
      return buildNaturalResponse(text, merchantId, lang);
    })(),
    // Humanized delay: full configured delay with periodic typing indicators
    (async () => {
      const totalDelay = delayMs > 0 ? delayMs : 30000;
      const typingInterval = 4500; // renew typing indicator every 4.5s (Telegram clears it after 5s)
      const elapsed = { ms: 0 };
      // Send typing every ~4.5s for the full duration so it looks like the bot is composing
      while (elapsed.ms < totalDelay) {
        await sendTyping(chat);
        const chunk = Math.min(typingInterval, totalDelay - elapsed.ms);
        await new Promise(r => setTimeout(r, chunk));
        elapsed.ms += chunk;
      }
    })(),
  ]);

  if (!response) return;

  // ── Record bot reply in history ───────────────────────────────────────────
  addToHistory(chatId, "assistant", response);

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
