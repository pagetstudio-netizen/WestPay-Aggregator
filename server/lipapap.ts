import crypto from "crypto";

export const LIPAPAP_COUNTRY_CODES: Record<string, string> = {
  Ghana: "GH",
  Senegal: "SN",
  Benin: "BJ",
  "Burkina Faso": "BF",
  "Cote d'Ivoire": "CI",
  Cameroun: "CM",
  Kenya: "KE",
  Mali: "ML",
  Togo: "TG",
};

export const LIPAPAP_CURRENCY_MAP: Record<string, string> = {
  Ghana: "GHS",
  Senegal: "XOF",
  Benin: "XOF",
  "Burkina Faso": "XOF",
  "Cote d'Ivoire": "XOF",
  Cameroun: "XAF",
  Kenya: "KES",
  Mali: "XOF",
  Togo: "XOF",
};

/**
 * Operator identifiers from the supplied LipaPap network list.
 * The public documentation does not publish numeric momo_network_id values,
 * so numeric IDs remain an explicit admin configuration rather than guesses.
 */
export const LIPAPAP_NETWORKS = [
  { code: "AIRTELTIGO_MONEY_GH", name: "AirtelTigo Money", country: "Ghana" },
  { code: "MTN_MOMO_GH", name: "MTN Mobile Money", country: "Ghana" },
  { code: "VODAFONE_CASH_GH", name: "Vodafone Cash", country: "Ghana" },
  { code: "MIX_SN", name: "Mix", country: "Senegal" },
  { code: "ORANGE_MONEY_SN", name: "Orange Money", country: "Senegal" },
  { code: "WAVE_SN", name: "Wave", country: "Senegal" },
  { code: "MOOV_MONEY_BJ", name: "Moov Money", country: "Benin" },
  { code: "MTN_MOMO_BJ", name: "MTN Mobile Money", country: "Benin" },
  { code: "MOOV_MONEY_BF", name: "Moov Money", country: "Burkina Faso" },
  { code: "ORANGE_MONEY_BF", name: "Orange Money", country: "Burkina Faso" },
  { code: "MOOV_MONEY_CI", name: "Moov Money", country: "Cote d'Ivoire" },
  { code: "MTN_MOMO_CI", name: "MTN Mobile Money", country: "Cote d'Ivoire" },
  { code: "ORANGE_MONEY_CI", name: "Orange Money", country: "Cote d'Ivoire" },
  { code: "WAVE_CI", name: "Wave", country: "Cote d'Ivoire" },
  { code: "MTN_MOMO_CM", name: "MTN Mobile Money", country: "Cameroun" },
  { code: "ORANGE_MONEY_CM", name: "Orange Money", country: "Cameroun" },
  { code: "MPESA_KE", name: "M-Pesa", country: "Kenya" },
  { code: "MOOV_MONEY_ML", name: "Moov Money", country: "Mali" },
  { code: "ORANGE_MONEY_ML", name: "Orange Money", country: "Mali" },
  { code: "TMONEY_TG", name: "T-Money", country: "Togo" },
] as const;

export interface LipaPapConfig {
  clientKey: string;
  secretKey: string;
  paymentUrl: string;
  environment: "sandbox" | "production";
  action: "MOMOAPM" | "C2B_SIMULATE";
  networkIds: Record<string, string>;
}

export interface LipaPapPaymentResponse {
  action?: string;
  result?: string;
  status?: string;
  order_id?: string;
  trans_id?: string;
  amount?: string | number;
  currency?: string;
  redirect_url?: string;
  redirect_method?: string;
  txMsg?: string;
  decline_reason?: string;
  [key: string]: unknown;
}

export function lipapapCountryCode(country: string): string {
  return LIPAPAP_COUNTRY_CODES[country] || country.slice(0, 2).toUpperCase();
}

export function lipapapCurrency(country: string): string {
  return LIPAPAP_CURRENCY_MAP[country] || "XOF";
}

export function lipapapNetworkCode(country: string, operator: string): string | undefined {
  const normalized = operator.toLowerCase().replace(/[\s\-_]+/g, "");
  const network = LIPAPAP_NETWORKS.find((item) =>
    item.country === country &&
    (item.name.toLowerCase().replace(/[\s\-_]+/g, "") === normalized ||
      item.code.toLowerCase().replace(/[\s\-_]+/g, "") === normalized)
  );
  return network?.code;
}

function hmacSha256(value: string, secretKey: string): string {
  return crypto.createHmac("sha256", secretKey).update(value, "utf8").digest("hex");
}

export function buildLipaPapRequestHash(fields: {
  clientKey: string;
  orderId: string;
  orderAmount: string;
  orderCurrency: string;
  orderDescription: string;
  cardNumber?: string;
  cardExpMonth?: string;
  cardExpYear?: string;
  payerEmail?: string;
  payerPhone?: string;
  payerIp?: string;
}, secretKey: string): string {
  const value = [
    fields.clientKey,
    fields.orderId,
    fields.orderAmount,
    fields.orderCurrency,
    fields.orderDescription,
    fields.cardNumber || "",
    fields.cardExpMonth || "",
    fields.cardExpYear || "",
    fields.payerEmail || "",
    fields.payerPhone || "",
    fields.payerIp || "",
    secretKey,
  ].join("");
  return hmacSha256(value, secretKey);
}

export function buildLipaPapResponseHash(payload: {
  action?: unknown;
  result?: unknown;
  status?: unknown;
  order_id?: unknown;
  trans_id?: unknown;
  trans_date?: unknown;
  amount?: unknown;
  currency?: unknown;
  decline_reason?: unknown;
}, secretKey: string): string {
  const value = [
    payload.action,
    payload.result,
    payload.status,
    payload.order_id,
    payload.trans_id,
    payload.trans_date,
    payload.amount,
    payload.currency,
    payload.decline_reason || "",
    secretKey,
  ].map((part) => part == null ? "" : String(part)).join("");
  return hmacSha256(value, secretKey);
}

export function verifyLipaPapResponseHash(
  payload: Record<string, unknown>,
  secretKey: string,
  receivedHash: string | undefined,
): boolean {
  if (!receivedHash) return false;
  const expected = buildLipaPapResponseHash(payload, secretKey);
  const left = Buffer.from(expected.toLowerCase(), "utf8");
  const right = Buffer.from(receivedHash.toLowerCase(), "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function lipapapRequest(config: LipaPapConfig, body: Record<string, unknown>): Promise<LipaPapPaymentResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(config.paymentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    let data: LipaPapPaymentResponse;
    try {
      data = JSON.parse(raw) as LipaPapPaymentResponse;
    } catch {
      throw new Error(`Réponse LipaPap invalide (HTTP ${response.status})`);
    }
    if (!response.ok) {
      throw new Error(data.txMsg || data.decline_reason || `Réponse HTTP ${response.status}`);
    }
    return data;
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error("LipaPap : délai de connexion dépassé (30s)");
    throw new Error(`LipaPap : ${error?.message || "erreur de connexion"}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function initiateLipaPapPayment(config: LipaPapConfig, params: {
  orderId: string;
  amount: number;
  currency: string;
  country: string;
  phone: string;
  customerEmail?: string;
  customerName?: string;
  callbackUrl: string;
  returnUrl?: string;
  networkId?: string;
}): Promise<LipaPapPaymentResponse> {
  const orderAmount = params.amount.toFixed(2);
  const orderDescription = `WestPay payment ${params.orderId}`;
  const payerEmail = params.customerEmail || "customer@westpay.cfd";
  const timestamp = String(Date.now());
  const body: Record<string, unknown> = {
    action: config.action,
    client_key: config.clientKey,
    order_id: params.orderId,
    order_amount: orderAmount,
    order_currency: params.currency,
    order_description: orderDescription,
    payer_phone: params.phone,
    payer_email: payerEmail,
    payer_country: lipapapCountryCode(params.country),
    term_url_3ds: params.returnUrl || params.callbackUrl,
    timestamp,
  };
  if (params.networkId) body.momo_network_id = params.networkId;
  body.hash = buildLipaPapRequestHash({
    clientKey: config.clientKey,
    orderId: params.orderId,
    orderAmount,
    orderCurrency: params.currency,
    orderDescription,
    payerEmail,
    payerPhone: params.phone,
  }, config.secretKey);
  return lipapapRequest(config, body);
}

export async function getLipaPapTransactionStatus(
  config: LipaPapConfig,
  transactionId: string,
): Promise<LipaPapPaymentResponse> {
  const body = {
    action: "GET_TRANS_STATUS",
    client_key: config.clientKey,
    trans_id: transactionId,
    hash: buildLipaPapResponseHash({
      action: "GET_TRANS_STATUS",
      status: "",
      trans_id: transactionId,
    }, config.secretKey),
  };
  return lipapapRequest(config, body);
}