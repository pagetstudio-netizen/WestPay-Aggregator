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

// ─── OpenAI-powered response ──────────────────────────────────────────────────
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

async function askOpenAI(userMessage: string, merchantContext: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = `You are a professional customer support agent for WestPay, a Mobile Money payment aggregator platform serving West Africa (Togo, Benin, Burkina Faso, Côte d'Ivoire, Mali, Senegal, and more).

RULES:
- Always respond in English only, regardless of the language the merchant uses.
- Be friendly, concise, and professional. Max 3-4 sentences unless a detailed explanation is needed.
- Never use markdown formatting (no **, no *, no #). Plain text only.
- You have access to the merchant's real-time account data below — use it to give accurate, specific answers.
- If asked about balance, withdrawals, or transactions, refer to the actual data provided.
- For API integration questions, explain: get API key from dashboard > API & SDK tab, use POST /api/payment/initiate, configure webhook for confirmations, docs at /api-docs.
- For delays: Mobile Money payments confirm in a few minutes, withdrawals process within 24-48 business hours.
- For issues or errors: ask for the transaction reference (format OP-XXXX or TR-XXXX).
- WestPay supports: MTN, Orange, Moov, Wave, TMoney, Flooz and crypto via OxaPay.
- Do not invent information. If unsure, say you'll escalate to the technical team.

${merchantContext}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[USERBOT] OpenAI error:", res.status, err);
      return null;
    }

    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err: any) {
    console.error("[USERBOT] OpenAI fetch failed:", err.message);
    return null;
  }
}

// ─── Natural conversation response builder ────────────────────────────────────
async function buildNaturalResponse(text: string, merchantId: number, lang: "fr" | "en"): Promise<string | null> {
  const lower = text.toLowerCase().trim();
  const isFr = lang === "fr";

  // --- Too short to respond ---
  if (text.trim().length < 2) return null;

  // ── Greetings ────────────────────────────────────────────────────────────────
  if (/^(bonjour|salut|bonsoir|bonne nuit|coucou|hello|hi|hey|good morning|good afternoon|good evening|good day|yo|hola|ola)\b/.test(lower)) {
    const hour = new Date().getHours();
    const timeGreet = isFr
      ? (hour < 12 ? "Bonjour" : hour < 18 ? "Bonne après-midi" : "Bonsoir")
      : (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
    return isFr
      ? `${timeGreet} ! Comment puis-je vous aider aujourd'hui ?`
      : `${timeGreet}! How can I help you today?`;
  }

  // ── "Comment tu vas / ça va / how are you" ───────────────────────────────────
  if (/\b(comment (tu|vous) (vas|allez)|ça va|ca va|comment (ça|ca) va|how are you|how r u|how do you do|you good|tu vas bien|vous allez bien)\b/.test(lower)) {
    return isFr
      ? "Je vais très bien, merci ! Je suis là pour vous aider. Qu'est-ce que je peux faire pour vous ?"
      : "I'm doing great, thanks for asking! I'm here to help. What can I do for you?";
  }

  // ── Thanks ───────────────────────────────────────────────────────────────────
  if (/\b(merci|merci beaucoup|grand merci|thanks|thank you|thank u|thx|ty)\b/.test(lower)) {
    return isFr
      ? "Avec plaisir ! N'hésitez pas si vous avez d'autres questions."
      : "You're welcome! Don't hesitate to reach out if you need anything else.";
  }

  // ── OK / Acknowledged ────────────────────────────────────────────────────────
  if (/^(ok|okay|d'accord|d accord|entendu|compris|vu|seen|noted|roger|alright|parfait|super|nickel|👍|✅)[\s!.]*$/.test(lower)) {
    return isFr ? "Parfait, je reste disponible si besoin." : "Perfect, I'm here if you need anything.";
  }

  // ── API Integration ──────────────────────────────────────────────────────────
  if (/\b(intégr|integr|api|sdk|webhook|clé api|api key|documentation|doc|developer|développeur|comment (utiliser|connecter|implémenter|implement)|comment (utiliser|connecter)|integrate|integration)\b/.test(lower)) {
    return isFr
      ? `Pour intégrer l'API WestPay sur votre site ou application, voici les étapes :\n\n1. Récupérez votre clé API dans votre tableau de bord (onglet "API & SDK")\n2. Consultez la documentation complète sur /api-docs\n3. Endpoint de paiement : POST /api/payment/initiate\n4. Configurez votre webhook pour recevoir les confirmations de paiement\n\nVous pouvez aussi tester l'API directement depuis le tableau de bord. Avez-vous besoin d'aide sur un point précis ?`
      : `To integrate the WestPay API into your website or app:\n\n1. Get your API key from your dashboard (tab "API & SDK")\n2. Full documentation available at /api-docs\n3. Payment endpoint: POST /api/payment/initiate\n4. Set up your webhook to receive payment confirmations\n\nYou can also test the API directly from the dashboard. Do you need help with a specific part?`;
  }

  // ── Balance / Solde ──────────────────────────────────────────────────────────
  if (/\b(balance|solde|combien (j'ai|il y a|reste)|how much|available|disponible|argent|fonds|funds|voir (mon|le) solde)\b/.test(lower)) {
    return getBalanceText(merchantId, lang);
  }

  // ── Withdrawals / Retraits ───────────────────────────────────────────────────
  if (/\b(retrait|retraits|withdrawal|withdraw|payout|virement|reversement|virer|en attente|pending|débloquer|pas (encore )?reçu|non reçu|not received)\b/.test(lower)
    || /\b(faire (un )?retrait|demande de retrait|quand (est-ce que|est ce que|je vais|je recevrai|j'aurai)|when will i (get|receive))\b/.test(lower)) {
    return getWithdrawalsText(merchantId, lang);
  }

  // ── Transactions / Historique ────────────────────────────────────────────────
  if (/\b(transaction|paiement|encaissement|payment|deposit|historique|history|receipt|reçu|récent|recent|dernière|last|voir (mes|les) (paiements|transactions))\b/.test(lower)) {
    return getTransactionsText(merchantId, lang);
  }

  // ── Stats ────────────────────────────────────────────────────────────────────
  if (/\b(stat|stats|statistique|statistic|volume|total|performance|chiffre|rapport|report|résumé|summary)\b/.test(lower)) {
    return getStatsText(merchantId, lang);
  }

  // ── Délai / Timing ───────────────────────────────────────────────────────────
  if (/\b(délai|delai|combien de temps|quand|when|how long|durée|duration|processing time|temps de traitement)\b/.test(lower)) {
    return isFr
      ? "Les paiements Mobile Money sont généralement confirmés en quelques minutes après validation du client. Les retraits sont traités sous 24 à 48h ouvrées. Si un paiement dépasse ce délai, contactez-nous avec la référence de transaction."
      : "Mobile Money payments are typically confirmed within a few minutes after customer validation. Withdrawals are processed within 24–48 business hours. If a payment exceeds this delay, please contact us with the transaction reference.";
  }

  // ── Frais / Commission ───────────────────────────────────────────────────────
  if (/\b(frais|commission|tarif|fee|fees|taux|rate|combien (ça coûte|vous prenez|vous déduisez)|how much (do you charge|is the fee))\b/.test(lower)) {
    return isFr
      ? "Nos frais sont définis par votre contrat marchand. Vous pouvez consulter votre taux de commission dans votre tableau de bord, onglet \"Paramètres\". Pour toute renégociation, contactez notre équipe commerciale."
      : "Your fees are defined by your merchant contract. You can view your commission rate in your dashboard under \"Settings\". To renegotiate, please contact our sales team.";
  }

  // ── Mot de passe / Connexion ─────────────────────────────────────────────────
  if (/\b(mot de passe|password|mdp|connexion|connecter|login|se connecter|oublié|forgot|réinitialiser|reset|accès|access)\b/.test(lower)) {
    return isFr
      ? "Pour réinitialiser votre mot de passe, cliquez sur \"Mot de passe oublié\" sur la page de connexion. Si vous n'avez pas accès à votre email, contactez l'administrateur de la plateforme."
      : "To reset your password, click \"Forgot password\" on the login page. If you don't have access to your email, please contact the platform administrator.";
  }

  // ── Opérateurs / Pays ────────────────────────────────────────────────────────
  if (/\b(opérateur|operator|pays|country|countries|mtn|orange|moov|wave|tmoney|flooz|airtel|mpesa|mobile money|activer|désactiver|ajouter un pays)\b/.test(lower)) {
    return isFr
      ? "WestPay supporte les opérateurs Mobile Money dans plusieurs pays d'Afrique de l'Ouest : MTN, Orange, Moov, Wave, TMoney, Flooz, et d'autres. L'activation des pays et opérateurs se fait depuis votre tableau de bord, section \"Pays & Opérateurs\"."
      : "WestPay supports Mobile Money operators across several West African countries: MTN, Orange, Moov, Wave, TMoney, Flooz, and more. Country and operator activation is managed from your dashboard under \"Countries & Operators\".";
  }

  // ── Problème / Erreur ────────────────────────────────────────────────────────
  if (/\b(problème|probleme|problem|issue|bug|erreur|error|fail|failed|ne (fonctionne|marche) pas|doesn't work|not working|bloqué|blocked)\b/.test(lower)) {
    return isFr
      ? "Je suis désolé d'apprendre ça. Pouvez-vous me préciser le problème et partager la référence de transaction si disponible ? Je vais escalader ça à l'équipe technique immédiatement."
      : "I'm sorry to hear that. Could you describe the issue and share the transaction reference if available? I'll escalate this to our technical team right away.";
  }

  // ── Paiement non reçu ────────────────────────────────────────────────────────
  if (/\b(pas (encore )?reçu|non reçu|not received|not arrived|haven't received|didn't receive|n'est pas arrivé|pas arrivé)\b/.test(lower)) {
    return isFr
      ? "Je comprends. Veuillez me communiquer la référence de la transaction (format OP-XXXX ou TR-XXXX) et le numéro de téléphone concerné. Je vais vérifier le statut de votre côté immédiatement."
      : "I understand. Please share the transaction reference (format OP-XXXX or TR-XXXX) and the phone number involved. I'll check the status on our end right away.";
  }

  // ── Contact / Support ────────────────────────────────────────────────────────
  if (/\b(contacter|contact|support|aide|help|assistance|besoin d'aide|need help|parler à quelqu'un|speak to someone|équipe|team)\b/.test(lower)) {
    return isFr
      ? "Notre équipe support est disponible pour vous aider. Pour les urgences techniques, mentionnez votre identifiant marchand et la référence de transaction. Vous pouvez aussi envoyer un email à support@westpay.cloud."
      : "Our support team is here to help. For technical urgencies, please mention your merchant ID and the transaction reference. You can also email support@westpay.cloud.";
  }

  // ── Crypto ───────────────────────────────────────────────────────────────────
  if (/\b(crypto|bitcoin|btc|eth|usdt|tron|bnb|ethereum|cryptomonnaie|cryptocurrency|oxapay)\b/.test(lower)) {
    return isFr
      ? "WestPay supporte également les paiements crypto via OxaPay (USDT, BTC, ETH, TRX, BNB et d'autres). L'activation se fait depuis votre tableau de bord, onglet \"Crypto\". Consultez la documentation crypto sur /crypto-docs pour l'intégration."
      : "WestPay also supports crypto payments via OxaPay (USDT, BTC, ETH, TRX, BNB and more). Activation is done from your dashboard under the \"Crypto\" tab. See /crypto-docs for integration details.";
  }

  // ── Aide générale / What can you do ──────────────────────────────────────────
  if (/\b(que (peux-tu|pouvez-vous|peut-on)|what can you|que fais-tu|what do you do|aide-moi|aidez-moi|help me|je ne sais pas|i don't know|comment ça marche|how does this work)\b/.test(lower)) {
    return isFr
      ? `Je suis votre assistant WestPay. Voici ce que je peux faire pour vous :\n\n• Consulter votre solde\n• Voir vos retraits en attente\n• Afficher vos dernières transactions\n• Répondre à vos questions sur l'intégration API\n• Expliquer les délais et frais\n• Vous orienter en cas de problème\n\nDites-moi simplement ce dont vous avez besoin !`
      : `I'm your WestPay assistant. Here's what I can help you with:\n\n• Check your balance\n• View pending withdrawals\n• Show recent transactions\n• Answer API integration questions\n• Explain processing times and fees\n• Guide you through any issue\n\nJust tell me what you need!`;
  }

  // ── Fallback intelligent ─────────────────────────────────────────────────────
  // Only reply if the message is substantial enough
  if (text.trim().length < 5) return null;

  return isFr
    ? "Je suis là pour vous aider. Pourriez-vous préciser votre demande ? Par exemple : consulter votre solde, voir vos retraits, une question sur l'API, ou signaler un problème."
    : "I'm here to help. Could you clarify your request? For example: check your balance, view withdrawals, API question, or report an issue.";
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

  // ── Try OpenAI first, fallback to keyword-based ───────────────────────────
  let response: string | null = null;

  if (process.env.OPENAI_API_KEY) {
    try {
      const merchantContext = await buildMerchantContext(merchantId);
      response = await askOpenAI(text, merchantContext);
      if (response) console.log("[USERBOT] OpenAI response generated");
    } catch (err: any) {
      console.error("[USERBOT] OpenAI failed, using fallback:", err.message);
    }
  }

  if (!response) {
    response = await buildNaturalResponse(text, merchantId, "en");
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
