/**
 * WestPay Knowledge Engine — RAG (Retrieval Augmented Generation)
 * pgvector on Supabase + OpenAI embeddings (text-embedding-3-small, 1536 dims)
 */

import { pool } from "./db";

// ─── Embed a text string via OpenAI ──────────────────────────────────────────
export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 8000) }),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// ─── Retrieve top-k relevant chunks for a query ───────────────────────────────
export async function retrieveRelevant(query: string, limit = 5): Promise<string> {
  const embedding = await embedText(query);
  if (!embedding) return "";

  try {
    const client = await pool.connect();
    const vec = `[${embedding.join(",")}]`;
    const result = await client.query(
      `SELECT title, content, category,
              1 - (embedding <=> $1::vector) AS similarity
       FROM knowledge_chunks
       WHERE active = true AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [vec, limit]
    );
    client.release();

    if (result.rows.length === 0) return "";

    const chunks = result.rows
      .filter(r => r.similarity > 0.3)
      .map(r => `[${r.category.toUpperCase()}] ${r.title}\n${r.content}`)
      .join("\n\n---\n\n");

    return chunks ? `\n\nRELEVANT KNOWLEDGE:\n${chunks}` : "";
  } catch (err: any) {
    console.error("[KNOWLEDGE] Retrieval error:", err.message);
    return "";
  }
}

// ─── Add or update a knowledge chunk ─────────────────────────────────────────
export async function addKnowledge(
  category: string,
  title: string,
  content: string,
  id?: number
): Promise<number | null> {
  const embedding = await embedText(`${title}. ${content}`);
  const vec = embedding ? `[${embedding.join(",")}]` : null;

  const client = await pool.connect();
  try {
    if (id) {
      await client.query(
        `UPDATE knowledge_chunks SET category=$1, title=$2, content=$3, embedding=$4::vector, updated_at=NOW() WHERE id=$5`,
        [category, title, content, vec, id]
      );
      return id;
    } else {
      const r = await client.query(
        `INSERT INTO knowledge_chunks (category, title, content, embedding) VALUES ($1,$2,$3,$4::vector) RETURNING id`,
        [category, title, content, vec]
      );
      return r.rows[0].id;
    }
  } finally {
    client.release();
  }
}

// ─── Delete a knowledge chunk ─────────────────────────────────────────────────
export async function deleteKnowledge(id: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("DELETE FROM knowledge_chunks WHERE id=$1", [id]);
  } finally {
    client.release();
  }
}

// ─── List all knowledge chunks (no embeddings, for UI) ───────────────────────
export async function listKnowledge(): Promise<any[]> {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT id, category, title, content, active, created_at, updated_at
       FROM knowledge_chunks ORDER BY category, id`
    );
    return r.rows;
  } finally {
    client.release();
  }
}

// ─── Toggle active state ──────────────────────────────────────────────────────
export async function toggleKnowledge(id: number, active: boolean): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("UPDATE knowledge_chunks SET active=$1, updated_at=NOW() WHERE id=$2", [active, id]);
  } finally {
    client.release();
  }
}

// ─── Re-embed all chunks (called when OpenAI key changes) ─────────────────────
export async function reembedAll(): Promise<void> {
  const client = await pool.connect();
  try {
    const rows = await client.query("SELECT id, title, content FROM knowledge_chunks WHERE embedding IS NULL");
    for (const row of rows.rows) {
      const embedding = await embedText(`${row.title}. ${row.content}`);
      if (embedding) {
        const vec = `[${embedding.join(",")}]`;
        await client.query("UPDATE knowledge_chunks SET embedding=$1::vector WHERE id=$2", [vec, row.id]);
      }
      await new Promise(r => setTimeout(r, 100));
    }
    console.log(`[KNOWLEDGE] Re-embedded ${rows.rows.length} chunks`);
  } finally {
    client.release();
  }
}

// ─── Seed the knowledge base with WestPay content ───────────────────────────
const WESTPAY_KNOWLEDGE: Array<{ category: string; title: string; content: string }> = [
  // ── PLATFORM OVERVIEW ──
  {
    category: "platform",
    title: "What is WestPay",
    content: "WestPay is a private Mobile Money payment aggregation platform for West Africa. It allows merchants to collect payments via MTN, Orange, Moov, Wave, TMoney, Flooz and crypto. Merchants access a dashboard to manage transactions, withdrawals, API keys, and payment links.",
  },
  {
    category: "platform",
    title: "Supported countries",
    content: "WestPay currently supports: Togo, Benin, Burkina Faso, Ivory Coast (Côte d'Ivoire), Mali, and Senegal. Each country has specific mobile money operators available.",
  },
  {
    category: "platform",
    title: "Supported operators by country",
    content: "Togo: TMoney, Flooz (Moov). Benin: MTN, Moov. Burkina Faso: Orange, Moov. Ivory Coast: MTN, Orange, Moov, Wave. Mali: Orange, Moov. Senegal: Orange, Wave, Free. Each operator must be activated per merchant by the admin.",
  },
  {
    category: "platform",
    title: "How to contact support",
    content: "WestPay technical support is available via Telegram: @Atfchalvt, @geeorbotpay, @pankeyrobotpay, @astapay. For urgent issues (payment failures, blocked withdrawals), always include your transaction reference (OP-XXXX or TR-XXXX).",
  },

  // ── PAYMENTS / PAY-IN ──
  {
    category: "payments",
    title: "How payment collection works",
    content: "When a customer initiates a payment, WestPay sends a USSD push notification to the customer's mobile phone. The customer then validates the payment on their phone by entering their mobile money PIN. For Wave, the customer receives a payment URL link to click instead of a USSD push.",
  },
  {
    category: "payments",
    title: "Payment confirmation timing",
    content: "Payments confirm within seconds to a few minutes after the customer validates on their phone. If the payment has been pending for more than 5 minutes, the customer may not have received the USSD prompt, or there may be a network issue. Share the OP-XXXX reference with support.",
  },
  {
    category: "payments",
    title: "Payment transaction references",
    content: "Every WestPay transaction has a unique reference: OP-XXXX for pay-in payments via OmniPay, TR-XXXX for merchant-initiated transfers, WP for internal references. Always provide this reference when contacting support about a specific transaction.",
  },
  {
    category: "payments",
    title: "Why a payment might fail",
    content: "Common reasons for payment failure: (1) Customer's mobile money account has insufficient balance. (2) The phone number is incorrect or inactive on the operator. (3) Customer did not validate the USSD prompt within the timeout window. (4) Operator network temporarily unavailable. (5) Daily or transaction limit exceeded on the customer's account.",
  },
  {
    category: "payments",
    title: "Payment not received by customer (USSD not sent)",
    content: "If a customer says they did not receive a USSD push: verify the phone number is correct and active on the operator. Some operators delay USSD during peak hours. The customer can retry after a few minutes. Share the OP-XXXX reference with support for server-side investigation.",
  },
  {
    category: "payments",
    title: "Wave payment flow",
    content: "For Wave operator, the customer does not receive a USSD push. Instead, WestPay generates a payment URL (wave payment link) which is displayed to the customer. The customer clicks the link and completes the payment in the Wave app. The merchant gets notified via webhook once confirmed.",
  },
  {
    category: "payments",
    title: "Payment page URL format",
    content: "WestPay payment pages can be accessed at: /pay?merchant=SLUG&amount=3000&country=Togo&redirect=https://... or the legacy /pay/SLUG format. The 3-step wizard guides the customer through selecting their operator and entering their phone number.",
  },

  // ── WITHDRAWALS / PAYOUTS ──
  {
    category: "withdrawals",
    title: "How withdrawals work",
    content: "Merchants request withdrawals of their WestPay balance from the 'Withdrawals' tab in the dashboard. The request is reviewed and processed by the WestPay technical team within 24-48 business hours. Withdrawals are sent directly to the merchant's mobile money account. The fee for merchant withdrawals (payout) is 4.5%.",
  },
  {
    category: "withdrawals",
    title: "Withdrawal processing time",
    content: "Standard merchant balance withdrawals are processed within 24-48 business hours from the time of the request. During weekends or holidays, processing may take slightly longer. For urgent withdrawals, contact @Atfchalvt on Telegram with your withdrawal reference. Note: this is different from customer payouts (transfers), which are processed instantly.",
  },
  {
    category: "withdrawals",
    title: "Payout (customer transfer) processing time",
    content: "WestPay payouts to customers (Transfers tab) are processed automatically and instantly. If a payout remains pending for more than 2 hours, the merchant should contact WestPay Support with the transaction reference, amount, country and recipient number. Never promise a specific resolution time.",
  },
  {
    category: "withdrawals",
    title: "Interwallet transfers between merchants",
    content: "WestPay supports interwallet transfers between merchant wallets. Important rules: (1) Interwallet transfers are manually processed by the WestPay team. (2) Transfers are only available between wallets in the same country. (3) Transfers are only available within the same currency zone. (4) Cross-currency transfers are not supported. (5) Cross-country transfers are not supported unless officially approved by WestPay. (6) The fee is 3%. To request an interwallet transfer, contact @Atfchalvt or @geeorbotpay on Telegram.",
  },
  {
    category: "withdrawals",
    title: "Minimum withdrawal amount",
    content: "I don't have enough information to confirm the exact minimum withdrawal amount for your account. Please contact the WestPay team (@Atfchalvt) or check your merchant contract for the specific limits that apply to you.",
  },
  {
    category: "withdrawals",
    title: "Withdrawal status meanings",
    content: "Withdrawal statuses: 'pending' = request received, waiting for processing. 'approved' = approved by team, being sent. 'completed' = funds sent to your account. 'rejected' = request denied (contact support for reason). If stuck in 'pending' for more than 48h, contact @Atfchalvt.",
  },
  {
    category: "withdrawals",
    title: "Transfers to customers",
    content: "Merchants can also send money directly to customer phone numbers using the 'Transfers' tab in the dashboard. These transfers use the OmniPay gateway and have reference format TR-XXXX. They are deducted from the merchant's balance.",
  },

  // ── API INTEGRATION ──
  {
    category: "api",
    title: "Getting started with the API",
    content: "To integrate WestPay payments: (1) Get your API key from the dashboard 'API & SDK' tab. (2) Make POST requests to /api/payment/initiate with X-API-Key header. (3) Configure your webhook URL to receive payment confirmations. Full documentation is at /api-docs (PIN protected — ask admin for access).",
  },
  {
    category: "api",
    title: "API authentication",
    content: "WestPay API uses API keys per country. Include the key in the X-API-Key header for every request. Example: X-API-Key: YOUR_COUNTRY_API_KEY. API keys can be regenerated from the dashboard — old keys are immediately invalidated. JWT tokens are used for dashboard authentication, not for API calls.",
  },
  {
    category: "api",
    title: "Payment initiation API endpoint",
    content: "POST /api/payment/initiate — Initiates a payment. Required fields: amount (number), country, phone (customer's mobile number), operator, merchantSlug. Optional: customerName, redirectUrl. Returns: paymentId, reference (OP-XXXX), status, and for Wave: payment_url.",
  },
  {
    category: "api",
    title: "API response format",
    content: "WestPay API responses are JSON. Success: { success: true, data: { ... } }. Error: { success: false, message: 'Error description', code: 'ERROR_CODE' }. Always check the 'success' field first. HTTP status codes: 200 OK, 400 Bad Request, 401 Unauthorized, 404 Not Found, 500 Server Error.",
  },
  {
    category: "api",
    title: "API rate limits",
    content: "I don't have enough information to confirm the exact API rate limits for your account. Please refer to the API documentation at /api-docs or contact the WestPay team for specifics that apply to your integration.",
  },
  {
    category: "api",
    title: "API key management",
    content: "Each merchant has a unique API key per activated country. Keys can be regenerated at any time from the 'API & SDK' tab in the merchant dashboard. After regeneration, update your integration immediately — old keys stop working instantly. Never share API keys publicly.",
  },
  {
    category: "api",
    title: "Testing API integration",
    content: "WestPay does not have a sandbox environment by default. Test with small real amounts in your activated countries. Always verify your webhook is receiving callbacks correctly. Check your webhook logs in the dashboard under 'Webhook' tab to see if callbacks were delivered.",
  },

  // ── WEBHOOKS ──
  {
    category: "webhooks",
    title: "How webhooks work",
    content: "WestPay sends a POST request to your configured webhook URL when a payment is confirmed. The payload includes: event, txId, amount, currency, payer phone, country, merchantSlug, provider, timestamp. Always verify the X-WestPay-Signature header using HMAC-SHA256 with your webhook secret.",
  },
  {
    category: "webhooks",
    title: "Webhook signature verification",
    content: "Every webhook includes an X-WestPay-Signature header. Compute HMAC-SHA256 of the raw JSON body using your webhook secret. Compare with the header value. If they don't match, reject the webhook — it may be a spoofed request. Your secret is in the dashboard 'Webhook' tab.",
  },
  {
    category: "webhooks",
    title: "Webhook not being received",
    content: "If webhooks are not reaching your server: (1) Verify your webhook URL is correct and publicly accessible. (2) Your server must return HTTP 200 within 10 seconds. (3) Check webhook logs in the dashboard. (4) Ensure no firewall is blocking WestPay's outbound IPs. (5) Verify HTTPS certificate is valid.",
  },
  {
    category: "webhooks",
    title: "Webhook event types",
    content: "WestPay sends the following webhook events: 'payment.confirmed' when a payment is successfully validated. The X-WestPay-Event header contains the event type. Your server should immediately return 200 OK and process asynchronously to avoid timeouts.",
  },
  {
    category: "webhooks",
    title: "Testing webhooks",
    content: "You can send a test webhook from the dashboard 'Webhook' tab using the 'Test webhook' button. This sends a sample payload to your configured URL. Check your webhook logs to see delivery status and server response. If you get 404 or 500, fix your endpoint first.",
  },

  // ── DASHBOARD ──
  {
    category: "dashboard",
    title: "Merchant dashboard overview",
    content: "The merchant dashboard has these main sections: Overview (balance summary), Transactions (payment history), Withdrawals (request payouts), Transfers (send money to customers), Payment Links (shareable payment pages), API & SDK (API keys and docs), Webhook (configure notifications), Crypto (OxaPay crypto payments).",
  },
  {
    category: "dashboard",
    title: "Finding your balance",
    content: "Your balance is displayed on the main Overview page of the dashboard. It shows the balance per country/operator. This is your available balance for withdrawals or transfers. Balances update in real-time when payments are confirmed.",
  },
  {
    category: "dashboard",
    title: "Transaction history",
    content: "All payments are visible in the 'Transactions' tab. You can filter by country, date range, and status. Each transaction shows: amount, currency, customer phone, status, and reference. Click a transaction to see full details. You can export as CSV.",
  },
  {
    category: "dashboard",
    title: "Payment links",
    content: "Payment links let you share a URL that customers can use to pay you. Create them in the 'Payment Links' tab. You can set a fixed amount or let customers enter any amount. Links can have expiry dates, payment limits, and custom confirmation messages.",
  },
  {
    category: "dashboard",
    title: "Dashboard login",
    content: "Merchants log in at /merchant-login with their email and password. If you forgot your password, use the 'Forgot password' link. For access issues or locked accounts, contact your account administrator via @Atfchalvt on Telegram.",
  },

  // ── CRYPTO ──
  {
    category: "crypto",
    title: "Crypto payments via OxaPay",
    content: "WestPay supports cryptocurrency payments through OxaPay integration. Supported currencies include: USDT, BTC, ETH, LTC, TRX, BNB, DOGE and others. Crypto payments have no country restriction — available globally. The merchant must have crypto activated by admin.",
  },
  {
    category: "crypto",
    title: "How crypto payments work",
    content: "When a customer pays with crypto: (1) WestPay generates an invoice via OxaPay with a wallet address and QR code. (2) Customer sends the exact amount within the time window. (3) OxaPay confirms the transaction on the blockchain. (4) WestPay credits the merchant's crypto balance. Confirmation time varies by blockchain.",
  },
  {
    category: "crypto",
    title: "Crypto balance and withdrawals",
    content: "Crypto balances are tracked per currency (USDT balance, BTC balance, etc.) separately from mobile money balances. To withdraw crypto earnings, contact the WestPay team. Crypto withdrawals are processed manually by the technical team.",
  },
  {
    category: "crypto",
    title: "Crypto payment API",
    content: "To initiate a crypto payment via API: POST /api/merchant/crypto/invoice with { amount, currency, description, orderId, returnUrl }. Returns a trackId and payment URL. Poll GET /api/payment/crypto/:trackId/status for status updates. Webhook is sent on confirmation.",
  },

  // ── SECURITY ──
  {
    category: "security",
    title: "Account security best practices",
    content: "To keep your WestPay account secure: never share your API key or dashboard password. Use a strong, unique password. Enable 2FA if available. Monitor your transaction history regularly for unauthorized activity. If you notice anything suspicious, contact @Atfchalvt immediately.",
  },
  {
    category: "security",
    title: "IP restrictions",
    content: "WestPay supports IP whitelisting for API access. Ask the admin to configure allowed IPs for your merchant account. Requests from non-whitelisted IPs will be blocked. This adds an extra layer of security to your API integration.",
  },
  {
    category: "security",
    title: "What to do if account is compromised",
    content: "If you suspect your account has been compromised: immediately contact @Atfchalvt on Telegram. Do not delay. The team can suspend suspicious activity, regenerate API keys, and investigate. Change your password immediately. Do not attempt to fix it alone.",
  },

  // ── COMMON ISSUES ──
  {
    category: "troubleshooting",
    title: "Payment stuck in pending",
    content: "If a payment is stuck in 'pending' for more than 10 minutes: (1) The customer may not have validated the USSD prompt — ask them to check their phone. (2) There may be an operator network delay. (3) For Wave, the customer must click the payment URL. Share the OP-XXXX reference with @Atfchalvt for investigation.",
  },
  {
    category: "troubleshooting",
    title: "Customer paid but merchant balance not updated",
    content: "If a customer says they paid but the merchant balance hasn't updated: (1) Get the exact OP-XXXX reference. (2) Verify the customer's mobile money account was actually debited. (3) Check if a webhook was received. (4) Escalate to @Atfchalvt with the reference, amount, country, and time of payment.",
  },
  {
    category: "troubleshooting",
    title: "API returning 401 Unauthorized",
    content: "A 401 error means authentication failed. Check: (1) You are sending the X-API-Key header (not Bearer token). (2) The API key is correct and has not been regenerated. (3) You are using the key for the correct country. (4) The merchant account is active and not suspended.",
  },
  {
    category: "troubleshooting",
    title: "Webhook returning errors",
    content: "If webhooks are failing: check your server logs for the error. Common issues: (1) Server returns non-200 status — fix your endpoint. (2) Timeout — process webhook asynchronously. (3) Signature mismatch — verify you're using the correct webhook secret and hashing the raw body. (4) Wrong URL configured — update in dashboard.",
  },
  {
    category: "troubleshooting",
    title: "Balance incorrect or missing",
    content: "If your balance appears incorrect: I cannot verify or modify balances directly. To investigate, contact @Atfchalvt on Telegram with: your merchant slug, the expected amount, the date/time, and any relevant transaction references. The technical team will reconcile and correct it.",
  },
  {
    category: "troubleshooting",
    title: "Cannot log in to dashboard",
    content: "If you cannot log in: (1) Double-check your email and password. (2) Use 'Forgot password' to reset. (3) Check if your account has been suspended (contact admin). (4) Clear browser cache and cookies. (5) If still stuck, contact @Atfchalvt on Telegram.",
  },

  // ── FEES & LIMITS ──
  {
    category: "fees",
    title: "WestPay fees and commissions",
    content: "WestPay official platform fees: Payin (Incoming Payments): 5.5%. Payout (Withdrawals to merchants): 4.5%. Interwallet Transfers (between merchant wallets): 3%. These fees are automatically applied to each transaction. If asked about fees, always provide these exact rates.",
  },
  {
    category: "fees",
    title: "Payin fee",
    content: "The WestPay fee for incoming payments (payin) is 5.5%. This is automatically deducted when a payment is confirmed and credited to the merchant balance.",
  },
  {
    category: "fees",
    title: "Payout fee",
    content: "The WestPay fee for merchant balance withdrawals (payout) is 4.5%. This is deducted from the withdrawal amount when processed.",
  },
  {
    category: "fees",
    title: "Interwallet transfer fee",
    content: "The WestPay fee for interwallet transfers between merchant wallets is 3%.",
  },
  {
    category: "fees",
    title: "Transaction limits",
    content: "Transaction limits depend on the mobile money operator and your merchant configuration. Common operator limits: single transaction up to 200,000–500,000 FCFA, daily limits vary. For higher limits or volume increases, contact @Atfchalvt.",
  },

  // ── ACCOUNT MANAGEMENT ──
  {
    category: "account",
    title: "Creating a merchant account",
    content: "WestPay does not have public registration. All merchant accounts are created by the WestPay administration team. To get an account, contact @Atfchalvt on Telegram. You will receive your login credentials once the account is set up.",
  },
  {
    category: "account",
    title: "Account suspension",
    content: "Accounts can be suspended for various reasons: unusual transaction patterns, policy violations, or pending compliance verification. If your account is suspended, contact @Atfchalvt immediately. Do not attempt to create a new account.",
  },
  {
    category: "account",
    title: "Updating account information",
    content: "To update merchant account details (email, name, contact information), contact the WestPay admin via @Atfchalvt. Merchants cannot self-modify account settings outside of what's available in the dashboard (webhook URL, API keys, payment links).",
  },
  {
    category: "account",
    title: "Multi-country accounts",
    content: "A single WestPay merchant account can be activated for multiple countries. Each country has its own balance, API key, and operator configuration. Contact @Atfchalvt to add a new country to your account.",
  },
];

export async function seedKnowledge(): Promise<void> {
  const client = await pool.connect();
  try {
    const existing = await client.query("SELECT COUNT(*) FROM knowledge_chunks");
    if (parseInt(existing.rows[0].count) > 0) {
      console.log("[KNOWLEDGE] Already seeded, skipping. Run reembedAll() for missing embeddings.");
      client.release();
      // Still try to embed any un-embedded chunks
      client.release();
      await reembedAll();
      return;
    }

    console.log(`[KNOWLEDGE] Seeding ${WESTPAY_KNOWLEDGE.length} knowledge chunks...`);

    for (const chunk of WESTPAY_KNOWLEDGE) {
      const embedding = await embedText(`${chunk.title}. ${chunk.content}`);
      const vec = embedding ? `[${embedding.join(",")}]` : null;
      const c2 = await pool.connect();
      await c2.query(
        `INSERT INTO knowledge_chunks (category, title, content, embedding) VALUES ($1,$2,$3,$4::vector)`,
        [chunk.category, chunk.title, chunk.content, vec]
      );
      c2.release();
      await new Promise(r => setTimeout(r, 80));
    }

    console.log("[KNOWLEDGE] Seed complete.");
  } catch (err: any) {
    console.error("[KNOWLEDGE] Seed error:", err.message);
    try { client.release(); } catch {}
  }
}
