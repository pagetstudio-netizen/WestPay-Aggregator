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
function detectLanguage(text: string): "fr" | "en" {
  const lower = text.toLowerCase();
  const frWords = /\b(bonjour|salut|bonsoir|bonne nuit|coucou|merci|s'il vous|svp|stp|oui|non|comment|pourquoi|quand|combien|avoir|votre|notre|avec|pour|dans|sur|mon|ma|mes|les|des|une|que|qui|est|pas|mais|plus|très|bien|aussi|si|je|tu|il|elle|nous|vous|ils|faire|veux|veux|vouloir|intégrer|integrer|utiliser|marche|fonctionne|aide|aidez|besoin|problème|probleme|retrait|solde|paiement|encaissement|compte|boite|reçu|reçus|envoyé|arrivé|délai|attente|frais|commission|tarif|accès|acceder|tableau|bord|connexion|connecter|mot de passe|clé|api|webhook|lien|lier|activer|désactiver|supprimer|créer|modifier|voir|afficher)\b/;
  if (frWords.test(lower)) return "fr";
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
async function getBalanceText(merchantId: number, lang: "fr" | "en"): Promise<string> {
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

async function getWithdrawalsText(merchantId: number, lang: "fr" | "en"): Promise<string> {
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

async function getTransactionsText(merchantId: number, lang: "fr" | "en"): Promise<string> {
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

async function getStatsText(merchantId: number, lang: "fr" | "en"): Promise<string> {
  const stats = await storage.getMerchantStats(merchantId);
  if (lang === "fr") {
    return `Statistiques de votre compte :\n\nNombre de transactions : ${stats.transactionCount}\nVolume total : ${formatAmount(stats.totalVolume)}`;
  }
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
  return `You are a professional customer support agent named "WestPay Assistant" for WestPay, a Mobile Money payment aggregator platform serving West Africa (Togo, Benin, Burkina Faso, Côte d'Ivoire, Mali, Senegal, and more).

STRICT RULES:
- Always respond in English only, regardless of the language the merchant uses.
- Be friendly, warm, concise, and professional. Max 3-4 sentences unless a detailed explanation is needed.
- NEVER use markdown formatting (no **, no *, no #, no backticks). Plain text only.
- You have access to the merchant's real-time account data below. Use it for accurate, specific answers.
- If asked about balance, withdrawals, or transactions, always refer to the actual data provided.
- API integration: get API key from dashboard > "API & SDK" tab, use POST /api/payment/initiate, configure webhook, docs at /api-docs.
- Payment delays: Mobile Money payments confirm in seconds to a few minutes. Withdrawals process within 24-48 business hours.
- For issues or transaction problems: ask for the transaction reference (format OP-XXXX or TR-XXXX).
- WestPay supports: MTN, Orange, Moov, Wave, TMoney, Flooz and crypto via OxaPay.
- Support contacts on Telegram: @Atfchalvt, @geeorbotpay, @pankeyrobotpay, @astapay
- Do not invent information. If unsure, say you will escalate to the technical team.
- Sound human and natural, not robotic.

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
async function buildNaturalResponse(text: string, merchantId: number, lang: "fr" | "en"): Promise<string | null> {
  const lower = text.toLowerCase().trim();
  const isFr = lang === "fr";

  if (text.trim().length < 2) return null;

  // ── Greetings ────────────────────────────────────────────────────────────────
  if (/^(bonjour|salut|bonsoir|bonne nuit|coucou|bonne journée|hello|hi|hey|good morning|good afternoon|good evening|good day|yo|sup|what's up|wassup)\b/.test(lower)) {
    const hour = new Date().getHours();
    const greetFr = hour < 12 ? "Bonjour" : hour < 18 ? "Bonne après-midi" : "Bonsoir";
    const greetEn = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    return isFr
      ? pick([
          `${greetFr} ! Comment puis-je vous aider aujourd'hui ?`,
          `${greetFr} ! Qu'est-ce que je peux faire pour vous ?`,
          `${greetFr} ! Je suis là pour vous aider, que puis-je faire ?`,
        ])
      : pick([
          `${greetEn}! How can I help you today?`,
          `${greetEn}! What can I do for you?`,
          `${greetEn}! Good to hear from you — what do you need?`,
        ]);
  }

  // ── How are you ──────────────────────────────────────────────────────────────
  if (/\b(comment (tu|vous) (vas|allez)|ça va|ca va|comment (ça|ca) va|how are you|how r u|you good|tu vas bien|vous allez bien)\b/.test(lower)) {
    return isFr
      ? pick([
          "Je vais très bien, merci de demander ! Et vous ? Comment puis-je vous aider ?",
          "Très bien, merci ! Je suis opérationnel et prêt à vous aider. Qu'est-ce qu'il vous faut ?",
        ])
      : pick([
          "Doing great, thanks for asking! How about you? What can I help you with?",
          "All good here! Ready to assist — what do you need?",
        ]);
  }

  // ── Thanks ───────────────────────────────────────────────────────────────────
  if (/\b(merci|merci beaucoup|grand merci|mèsi|thanks|thank you|thank u|thx|ty|tks)\b/.test(lower)) {
    return isFr
      ? pick([
          "Avec plaisir ! N'hésitez pas si vous avez d'autres questions.",
          "C'est avec plaisir ! Je reste disponible.",
          "De rien ! Revenez quand vous voulez.",
        ])
      : pick([
          "You're welcome! Don't hesitate to reach out if you need anything else.",
          "Happy to help! I'm always here.",
          "Anytime! Let me know if anything else comes up.",
        ]);
  }

  // ── OK / Acknowledged ────────────────────────────────────────────────────────
  if (/^(ok|okay|ok|d'accord|d accord|entendu|compris|vu|seen|noted|roger|alright|parfait|super|nickel|cool|👍|✅|👌)[\s!.]*$/.test(lower)) {
    return isFr
      ? pick(["Parfait, je reste disponible si besoin.", "Très bien ! N'hésitez pas.", "D'accord, à votre disposition."])
      : pick(["Perfect, I'm here if you need anything.", "Got it! Feel free to reach out anytime.", "Alright, just say the word."]);
  }

  // ── Transaction reference lookup (OP-XXXX or TR-XXXX) ────────────────────────
  const refMatch = text.match(/\b(OP|TR|WP)-[A-Z0-9]{4,}\b/i);
  if (refMatch) {
    const ref = refMatch[0].toUpperCase();
    return isFr
      ? `J'ai noté la référence ${ref}. Je vais vérifier le statut de cette transaction pour vous. En attendant, assurez-vous que le numéro de téléphone du client a bien reçu la notification USSD. Si le problème persiste, je transmets immédiatement à l'équipe technique.`
      : `I've noted the reference ${ref}. I'll check the status of this transaction for you. In the meantime, ensure the customer's phone received the USSD prompt. If the issue persists, I'll escalate to our technical team immediately.`;
  }

  // ── Phone number detected ─────────────────────────────────────────────────────
  if (/(\+?2[0-9]{10,12}|0[67][0-9]{8})/.test(lower)) {
    return isFr
      ? "J'ai bien noté le numéro. Pouvez-vous également me donner la référence de transaction (format OP-XXXX) ou préciser le montant concerné ? Je vais vérifier ça pour vous."
      : "I've noted the phone number. Could you also share the transaction reference (format OP-XXXX) or the amount involved? I'll look into it for you.";
  }

  // ── API / Integration ────────────────────────────────────────────────────────
  if (/\b(intégr|integr|api|sdk|webhook|clé api|api key|documentation|doc|developer|développeur|implémenter|implement|integrate|integration|endpoint|requête|request|callback|http|curl|postman|json)\b/.test(lower)) {
    return isFr
      ? `Pour intégrer l'API WestPay sur votre site ou application :\n\n1. Récupérez votre clé API dans votre tableau de bord (onglet "API & SDK")\n2. Documentation complète disponible sur /api-docs\n3. Endpoint de paiement : POST /api/payment/initiate\n4. Configurez votre webhook pour recevoir les confirmations automatiques\n\nL'API utilise l'authentification par clé en en-tête X-API-Key. Avez-vous besoin d'un exemple de code ou d'aide sur un point précis ?`
      : `To integrate the WestPay API:\n\n1. Get your API key from your dashboard (tab "API & SDK")\n2. Full documentation at /api-docs\n3. Payment endpoint: POST /api/payment/initiate\n4. Configure your webhook to receive automatic payment confirmations\n\nThe API uses key-based auth via X-API-Key header. Do you need a code example or help with a specific part?`;
  }

  // ── Balance / Solde ──────────────────────────────────────────────────────────
  if (/\b(balance|solde|combien (j'ai|il y a|reste|j'ai reçu)|how much|available|disponible|argent|fonds|funds|voir (mon|le) solde|mon compte|account balance)\b/.test(lower)) {
    return getBalanceText(merchantId, lang);
  }

  // ── Withdrawals / Retraits ────────────────────────────────────────────────────
  if (/\b(retrait|retraits|withdrawal|withdraw|payout|virement|reversement|virer|débloquer|décaisser|cashout|cash out)\b/.test(lower)
    || /\b(faire (un )?retrait|demande de retrait|sortir (mon|les|l')argent|transférer|transfer)\b/.test(lower)) {
    return getWithdrawalsText(merchantId, lang);
  }

  // ── Waiting / Not yet received ────────────────────────────────────────────────
  if (/\b(en attente|pending|pas encore|toujours pas|not yet|still waiting|haven't received|n'est pas arrivé|pas arrivé|pas reçu|non reçu|not received|where is|où est|where('s| is) my)\b/.test(lower)) {
    return isFr
      ? "Je comprends votre attente. Veuillez me communiquer la référence de transaction (format OP-XXXX) ou le numéro de téléphone concerné. Je vais vérifier le statut en temps réel et vous revenir rapidement."
      : "I understand your concern. Please share the transaction reference (OP-XXXX format) or the phone number involved. I'll check the real-time status and get back to you right away.";
  }

  // ── Transactions / Historique ────────────────────────────────────────────────
  if (/\b(transaction|paiement reçu|encaissement|payment|deposit|historique|history|receipt|récent|recent|dernière|last|voir (mes|les) (paiements|transactions)|combien (de paiements|de transactions|j'ai eu))\b/.test(lower)) {
    return getTransactionsText(merchantId, lang);
  }

  // ── Stats / Volume ───────────────────────────────────────────────────────────
  if (/\b(stat|stats|statistique|statistic|volume|total|performance|chiffre|rapport|report|résumé|summary|combien (j'ai fait|j'ai encaissé|total))\b/.test(lower)) {
    return getStatsText(merchantId, lang);
  }

  // ── Payment failed / Declined ────────────────────────────────────────────────
  if (/\b(échoué|echec|échec|failed|failure|refusé|refuse|declined|rejeté|rejected|annulé|canceled|ne passe pas|doesn't go through|paiement bloqué)\b/.test(lower)) {
    return isFr
      ? "Un paiement échoué peut avoir plusieurs causes : numéro invalide, solde insuffisant chez le client, ou réseau de l'opérateur momentanément indisponible. Pouvez-vous me donner la référence OP-XXXX ? Je vais vérifier les détails côté serveur."
      : "A failed payment can have several causes: invalid number, insufficient customer balance, or temporary operator network issue. Can you share the OP-XXXX reference? I'll check the server-side details for you.";
  }

  // ── Problème / Erreur ────────────────────────────────────────────────────────
  if (/\b(problème|probleme|soucis|souci|problem|issue|bug|erreur|error|fail|failed|ne (fonctionne|marche) pas|doesn't work|not working|bloqué|blocked|planté|crash)\b/.test(lower)) {
    return isFr
      ? pick([
          "Je suis désolé d'apprendre ça. Pouvez-vous me préciser le problème et partager la référence de transaction si disponible ? Je vais escalader ça à l'équipe technique immédiatement.",
          "Compris, je prends note. Décrivez-moi le problème en détail — et si vous avez une référence de transaction, partagez-la. Je transmets à l'équipe technique sans délai.",
        ])
      : pick([
          "I'm sorry to hear that. Could you describe the issue and share the transaction reference if available? I'll escalate this to our technical team right away.",
          "Got it — please describe what's happening and include the transaction reference if you have it. I'll flag this to our tech team immediately.",
        ]);
  }

  // ── Délai / Timing ───────────────────────────────────────────────────────────
  if (/\b(délai|delai|combien de temps|how long|durée|duration|processing time|temps (de|d')attente|temps de traitement|prend (du temps|longtemps))\b/.test(lower)) {
    return isFr
      ? "Les paiements Mobile Money sont confirmés en quelques secondes à quelques minutes après que le client valide le USSD. Pour Wave, le client reçoit un lien de paiement. Les retraits sont traités sous 24 à 48h ouvrées. Au-delà, contactez-nous avec la référence OP-XXXX."
      : "Mobile Money payments confirm within seconds to a few minutes after the customer validates the USSD prompt. For Wave, the customer receives a payment link. Withdrawals are processed within 24–48 business hours. Beyond that, contact us with the OP-XXXX reference.";
  }

  // ── Frais / Commission ───────────────────────────────────────────────────────
  if (/\b(frais|commission|tarif|fee|fees|taux|rate|déduire|déduit|retenu|how much (do you charge|is the fee|are the fees)|combien (ça coûte|vous prenez|vous déduisez|est déduit))\b/.test(lower)) {
    return isFr
      ? "Vos frais sont définis dans votre contrat marchand. Vous pouvez consulter votre taux de commission dans votre tableau de bord sous \"Paramètres\". La commission est automatiquement déduite de chaque paiement reçu. Pour toute renégociation, contactez notre équipe commerciale."
      : "Your fees are defined in your merchant contract. You can view your commission rate in your dashboard under \"Settings\". The commission is automatically deducted from each received payment. To renegotiate, contact our sales team.";
  }

  // ── Mot de passe / Connexion ─────────────────────────────────────────────────
  if (/\b(mot de passe|password|mdp|connexion|connecter|login|se connecter|oublié|forgot|réinitialiser|reset|accès|access|se connecte plus|cannot login|can't login)\b/.test(lower)) {
    return isFr
      ? "Pour réinitialiser votre mot de passe, cliquez sur \"Mot de passe oublié\" sur la page de connexion. Un lien de réinitialisation vous sera envoyé par email. Si vous n'avez pas accès à votre email, contactez l'administrateur."
      : "To reset your password, click \"Forgot password\" on the login page. A reset link will be sent to your email. If you don't have access to your email, please contact the platform administrator.";
  }

  // ── Opérateurs / Pays ────────────────────────────────────────────────────────
  if (/\b(opérateur|operator|pays|country|countries|mtn|orange|moov|wave|tmoney|flooz|airtel|mpesa|mobile money|activer|désactiver|ajouter un pays|togo|benin|bénin|burkina|côte d'ivoire|cote d'ivoire|mali|sénégal|senegal)\b/.test(lower)) {
    return isFr
      ? "WestPay supporte MTN, Orange, Moov, Wave, TMoney, Flooz et d'autres opérateurs Mobile Money en Afrique de l'Ouest (Togo, Bénin, Burkina Faso, Côte d'Ivoire, Mali, Sénégal…). L'activation des pays se fait depuis votre tableau de bord, section \"Pays & Opérateurs\". Un pays désactivé n'acceptera plus de paiements entrants."
      : "WestPay supports MTN, Orange, Moov, Wave, TMoney, Flooz, and more across West Africa (Togo, Benin, Burkina Faso, Ivory Coast, Mali, Senegal…). Country/operator activation is managed from your dashboard under \"Countries & Operators\". A disabled country will stop accepting incoming payments.";
  }

  // ── Crypto ───────────────────────────────────────────────────────────────────
  if (/\b(crypto|bitcoin|btc|eth|usdt|tron|trx|bnb|ethereum|litecoin|ltc|dogecoin|doge|cryptomonnaie|cryptocurrency|oxapay|stablecoin)\b/.test(lower)) {
    return isFr
      ? "WestPay supporte les paiements crypto via OxaPay (USDT, BTC, ETH, TRX, BNB, LTC et d'autres). L'activation se fait depuis votre tableau de bord, onglet \"Crypto\". Aucune restriction géographique — disponible pour tous vos clients. Consultez /api-docs pour l'intégration."
      : "WestPay supports crypto payments via OxaPay (USDT, BTC, ETH, TRX, BNB, LTC and more). Activation is done from your dashboard under the \"Crypto\" tab. No geographic restriction — available to all your customers. See /api-docs for integration.";
  }

  // ── Contact / Support humain ─────────────────────────────────────────────────
  if (/\b(contacter|contact|support|assistance|parler à quelqu'un|speak to someone|human|agent|équipe|team|urgence|urgent|escalade|escalate)\b/.test(lower)) {
    return isFr
      ? "Notre équipe support est disponible via Telegram : @Atfchalvt, @geeorbotpay, @pankeyrobotpay, @astapay. Pour les urgences techniques, mentionnez votre identifiant marchand et la référence de transaction (OP-XXXX)."
      : "Our support team is available on Telegram: @Atfchalvt, @geeorbotpay, @pankeyrobotpay, @astapay. For technical urgencies, mention your merchant ID and transaction reference (OP-XXXX).";
  }

  // ── Aide générale / What can you do ──────────────────────────────────────────
  if (/\b(que (peux-tu|pouvez-vous|peut-on)|what can you|que fais-tu|what do you do|aide-moi|aidez-moi|help me|j'ai besoin d'aide|i need help|comment ça marche|how does this work|quoi faire|what to do)\b/.test(lower)) {
    return isFr
      ? `Je suis votre assistant WestPay. Voici ce que je peux faire pour vous :\n\nConsulter votre solde disponible\nVoir vos retraits en attente\nAfficher vos dernières transactions et statistiques\nRépondre à vos questions sur l'intégration API et webhook\nExpliquer les délais de paiement et les frais\nVous aider en cas de paiement bloqué ou échoué\n\nDites-moi simplement ce dont vous avez besoin !`
      : `I'm your WestPay assistant. Here's what I can help you with:\n\nCheck your available balance\nView pending withdrawals\nShow recent transactions and stats\nAnswer API and webhook integration questions\nExplain payment delays and fees\nHelp with blocked or failed payments\n\nJust tell me what you need!`;
  }

  // ── Lien de paiement / Payment link ──────────────────────────────────────────
  if (/\b(lien de paiement|payment link|lien paiement|page de paiement|payment page|share.*link|envoyer.*lien|send.*link)\b/.test(lower)) {
    return isFr
      ? "Vous pouvez créer des liens de paiement depuis votre tableau de bord, onglet \"Liens de paiement\". Chaque lien peut avoir un montant fixe ou variable, et vous pouvez le partager directement avec vos clients. Les paiements sont confirmés automatiquement."
      : "You can create payment links from your dashboard under the \"Payment Links\" tab. Each link can have a fixed or variable amount, and you can share it directly with your customers. Payments are confirmed automatically.";
  }

  // ── Client / Customer questions ───────────────────────────────────────────────
  if (/\b(client|customer|acheteur|buyer|utilisateur|user|ils (n'arrivent|ne peuvent)|they can't|customer.*problem|client.*problème)\b/.test(lower)) {
    return isFr
      ? "Pour les problèmes côté client, vérifiez d'abord que le numéro Mobile Money est correct et actif sur l'opérateur. Si le client ne reçoit pas le USSD, il peut réessayer après quelques minutes. Partagez la référence OP-XXXX pour que je vérifie de notre côté."
      : "For customer-side issues, first verify the Mobile Money number is correct and active on the operator. If the customer doesn't receive the USSD prompt, they can retry after a few minutes. Share the OP-XXXX reference so I can check on our end.";
  }

  // ── Amounts mentioned (customer asking about specific amount) ─────────────────
  if (/\b(\d[\d\s]*(?:fcfa|xof|cfa|f\b|francs?)?)\b/i.test(lower)) {
    return isFr
      ? "Je vois que vous mentionnez un montant. S'agit-il d'un paiement en attente, d'un retrait, ou d'une vérification de solde ? Précisez-moi le contexte et partagez la référence de transaction si vous en avez une."
      : "I see you're mentioning an amount. Is this about a pending payment, a withdrawal, or a balance check? Let me know the context and share the transaction reference if you have one.";
  }

  // ── Intelligent fallback — analyze message intent ─────────────────────────────
  if (text.trim().length < 5) return null;

  // Question marks → it's a question, give helpful response
  if (/\?/.test(text) || /^(comment|pourquoi|quand|quoi|combien|est-ce que|is|can|how|why|what|when|where|does|do|could|would|should)\b/.test(lower)) {
    return isFr
      ? pick([
          "Bonne question ! Pour mieux vous aider, pourriez-vous me donner un peu plus de détails ? Je peux vérifier votre solde, vos retraits, vos transactions, ou répondre à toute question sur la plateforme.",
          "Je suis là pour vous aider avec ça. Pouvez-vous préciser un peu ? Par exemple : s'agit-il d'un paiement, d'un retrait, ou d'une question technique ?",
        ])
      : pick([
          "Good question! To help you better, could you give me a bit more detail? I can check your balance, withdrawals, transactions, or answer any platform question.",
          "I'm here to help with that. Could you clarify a bit? For example: is this about a payment, a withdrawal, or a technical question?",
        ]);
  }

  // Statement → acknowledge and offer help
  return isFr
    ? pick([
        "Je comprends. Pouvez-vous me donner plus de détails afin que je puisse vous aider au mieux ? Si vous avez une référence de transaction, n'hésitez pas à la partager.",
        "Compris. Dites-m'en davantage — je peux vérifier vos paiements, votre solde, ou vous aider avec une intégration API.",
        "Je vois. Pour mieux vous assister, pouvez-vous préciser s'il s'agit d'un paiement, d'un retrait, ou d'autre chose ?",
      ])
    : pick([
        "I understand. Could you give me more details so I can help you properly? If you have a transaction reference, feel free to share it.",
        "Got it. Tell me more — I can check your payments, balance, or help with an API integration.",
        "I see. To assist you better, could you clarify whether this is about a payment, a withdrawal, or something else?",
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
