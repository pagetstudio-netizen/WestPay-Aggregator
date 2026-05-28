import crypto from "crypto";

const SENDAVAPAY_BASE_URL = "https://sendavapay.com/api/sdk/v1";

export const SENDAVAPAY_COUNTRY_CODES: Record<string, string> = {
  "Togo": "TG",
  "Benin": "BJ",
  "Cameroun": "CM",
  "Burkina Faso": "BF",
  "Cote d'Ivoire": "CI",
  "Mali": "ML",
  "Senegal": "SN",
  "Guinee": "GN",
  "Congo RDC": "COD",
  "Congo Brazzaville": "COG",
};

export const SENDAVAPAY_CURRENCY_MAP: Record<string, string> = {
  "TG": "XOF", "BJ": "XOF", "BF": "XOF", "CI": "XOF",
  "ML": "XOF", "SN": "XOF", "GN": "GNF",
  "CM": "XAF", "COG": "XAF",
  "COD": "CDF",
};

export interface SendavaCreatePaymentRequest {
  amount: number;
  currency: string;
  description?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  payerCountry: string;
  redirectUrl?: string;
  webhookUrl?: string;
  externalReference?: string;
}

export interface SendavaCreatePaymentResponse {
  success: boolean;
  data?: {
    reference: string;
    amount: number;
    currency: string;
    status: string;
    paymentUrl: string;
    walletRouting?: {
      detectedCountry: string;
      targetWallet: string;
      note: string;
    };
    createdAt: string;
  };
  message?: string;
}

export interface SendavaVerifyPaymentResponse {
  success: boolean;
  data?: {
    reference: string;
    amount: string;
    status: string;
    paymentMethod?: string;
    completedAt?: string;
  };
  message?: string;
}

export interface SendavaWithdrawRequest {
  amount: number;
  phoneNumber: string;
  operator: string;
  country: string;
  currency: string;
  description?: string;
  externalReference?: string;
}

export interface SendavaWithdrawResponse {
  success: boolean;
  data?: {
    withdrawalId: number;
    reference: string;
    amount: number;
    fee: number;
    netAmount: number;
    currency: string;
    phoneNumber: string;
    operator: string;
    country: string;
    countryName: string;
    walletDebited: string;
    status: string;
    message: string;
  };
  message?: string;
}

export interface SendavaBalanceResponse {
  success: boolean;
  data?: {
    wallets: Array<{
      country: string;
      countryName: string;
      balance: string;
      currency: string;
    }>;
    totalWallets: number;
  };
  message?: string;
}

export interface SendavaTransactionsResponse {
  success: boolean;
  data?: {
    transactions: Array<{
      reference: string;
      type: string;
      amount: string;
      fee: string;
      currency: string;
      status: string;
      customerPhone?: string;
      paymentMethod?: string;
      createdAt: string;
      completedAt?: string;
    }>;
    total: number;
  };
  message?: string;
}

export interface SendavaWebhookPayload {
  event?: string;
  reference?: string;
  amount?: string;
  currency?: string;
  status?: string;
  customerPhone?: string;
  paymentMethod?: string;
  timestamp?: string;
}

export function verifyWebhookSignature(webhookSecret: string, signature: string, rawBody: string): boolean {
  const expected = `sha256=${crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex")}`;
  return expected === signature;
}

async function sendavaRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PUT",
  apiKey: string,
  payload?: Record<string, any>,
  queryParams?: Record<string, string>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    let url = `${SENDAVAPAY_BASE_URL}${endpoint}`;
    if (queryParams && Object.keys(queryParams).length > 0) {
      const qs = new URLSearchParams(queryParams).toString();
      url = `${url}?${qs}`;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    };

    const response = await fetch(url, {
      method,
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json();
    return data as T;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error("SendavaPay: Timeout de connexion (30s)");
    }
    throw new Error(`SendavaPay: ${err.message}`);
  }
}

export async function createPayment(
  apiKey: string,
  params: SendavaCreatePaymentRequest,
): Promise<SendavaCreatePaymentResponse> {
  const payload: Record<string, any> = {
    amount: params.amount,
    currency: params.currency,
    payerCountry: params.payerCountry,
  };
  if (params.description) payload.description = params.description;
  if (params.customerName) payload.customerName = params.customerName;
  if (params.customerEmail) payload.customerEmail = params.customerEmail;
  if (params.customerPhone) payload.customerPhone = params.customerPhone;
  if (params.redirectUrl) payload.redirectUrl = params.redirectUrl;
  if (params.webhookUrl) payload.webhookUrl = params.webhookUrl;
  if (params.externalReference) payload.externalReference = params.externalReference;

  console.log(`[SENDAVAPAY] Création paiement: ${params.amount} ${params.currency} - Pays: ${params.payerCountry}`);
  const result = await sendavaRequest<SendavaCreatePaymentResponse>("/create-payment", "POST", apiKey, payload);
  console.log(`[SENDAVAPAY] Réponse: success=${result.success} ref=${result.data?.reference} paymentUrl=${result.data?.paymentUrl}`);
  return result;
}

export async function verifyPayment(
  apiKey: string,
  reference: string,
): Promise<SendavaVerifyPaymentResponse> {
  const payload = { reference };
  console.log(`[SENDAVAPAY] Vérification paiement ref=${reference}`);
  const result = await sendavaRequest<SendavaVerifyPaymentResponse>("/verify-payment", "POST", apiKey, payload);
  console.log(`[SENDAVAPAY] Statut: ${result.data?.status}`);
  return result;
}

export async function initiateWithdraw(
  apiKey: string,
  params: SendavaWithdrawRequest,
): Promise<SendavaWithdrawResponse> {
  const payload: Record<string, any> = {
    amount: params.amount,
    phoneNumber: params.phoneNumber,
    operator: params.operator,
    country: params.country,
    currency: params.currency,
  };
  if (params.description) payload.description = params.description;
  if (params.externalReference) payload.externalReference = params.externalReference;

  const maskedPhone = params.phoneNumber ? params.phoneNumber.replace(/(\d{3})\d+(\d{2})/, "$1****$2") : "?";
  console.log(`[SENDAVAPAY] Retrait: ${params.amount} ${params.currency} - Tel: ${maskedPhone} - Op: ${params.operator} - Pays: ${params.country}`);
  const result = await sendavaRequest<SendavaWithdrawResponse>("/withdraw", "POST", apiKey, payload);
  console.log(`[SENDAVAPAY] Retrait réponse: success=${result.success} ref=${result.data?.reference}`);
  return result;
}

export async function getBalance(
  apiKey: string,
  countryCode?: string,
): Promise<SendavaBalanceResponse> {
  const queryParams = countryCode ? { country: countryCode } : undefined;
  return sendavaRequest<SendavaBalanceResponse>("/balance", "GET", apiKey, undefined, queryParams);
}

export async function getTransactions(apiKey: string): Promise<SendavaTransactionsResponse> {
  return sendavaRequest<SendavaTransactionsResponse>("/transactions", "GET", apiKey);
}

export async function configureWebhook(
  apiKey: string,
  webhookUrl: string,
): Promise<{ success: boolean; data?: { webhookUrl: string; webhookSecret: string; message: string }; message?: string }> {
  return sendavaRequest("/webhook", "PUT", apiKey, { webhookUrl });
}

export function generateReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `SP${timestamp}${random}`;
}

export function toSendavaOperator(operatorName: string, countryCode: string): string {
  const name = operatorName.toLowerCase().trim();
  const country = countryCode.toUpperCase();

  const mapping: Record<string, Record<string, string>> = {
    "TG": {
      "tmoney": "tmoney", "t-money": "tmoney",
      "moov": "flooz", "moov money": "flooz",
      "togocel": "togocel",
    },
    "BJ": {
      "mtn": "mtn_bj", "mtn mobile money": "mtn_bj",
      "moov": "moov_bj", "moov money": "moov_bj",
    },
    "SN": {
      "orange": "orange_sn", "orange money": "orange_sn",
      "wave": "wave_sn",
      "free": "free_sn", "free money": "free_sn",
    },
    "CI": {
      "orange": "orange_ci", "orange money": "orange_ci",
      "mtn": "mtn_ci", "mtn mobile money": "mtn_ci",
      "wave": "wave_ci",
      "moov": "moov_ci", "moov money": "moov_ci",
    },
    "ML": {
      "orange": "orange_ml", "orange money": "orange_ml",
      "wave": "wave_ml",
      "moov": "moov_ml", "moov money": "moov_ml",
    },
    "CM": {
      "orange": "orange_cm", "orange money": "orange_cm",
      "mtn": "mtn_cm", "mtn mobile money": "mtn_cm",
    },
    "BF": {
      "orange": "orange_bf", "orange money": "orange_bf",
      "moov": "moov_bf", "moov money": "moov_bf",
      "coris": "coris_bf", "coris money": "coris_bf",
    },
    "GN": {
      "orange": "orange_gn", "orange money": "orange_gn",
      "mtn": "mtn_gn", "mtn mobile money": "mtn_gn",
    },
  };

  const countryMap = mapping[country] || {};
  return countryMap[name] || name;
}
