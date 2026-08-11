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

export interface SendavaCreatePaymentResponse {
  success: boolean;
  data?: {
    reference: string;
    paymentToken: string;
    expiresAt: string;
    amount: number;
    currency: string;
    status: string;
    walletRouting?: {
      detectedCountry: string;
      targetWallet: string;
    };
  };
  error?: string;
  message?: string;
}

export interface SendavaPaymentStatusResponse {
  success: boolean;
  data?: {
    reference: string;
    status: string;
    amount: string;
    currency: string;
    completedAt?: string;
  };
  error?: string;
  message?: string;
}

export interface SendavaVerifyPaymentResponse {
  success: boolean;
  data?: {
    reference: string;
    externalReference?: string;
    amount: string;
    fee: string;
    currency: string;
    status: string;
    customerEmail?: string;
    customerPhone?: string;
    customerName?: string;
    paymentMethod?: string;
    createdAt: string;
    completedAt?: string;
  };
  error?: string;
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
    status: string;
    createdAt: string;
  };
  error?: string;
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
  error?: string;
  message?: string;
}

export interface SendavaTransactionsResponse {
  success: boolean;
  data?: {
    transactions: Array<{
      reference: string;
      externalReference?: string;
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
  error?: string;
  message?: string;
}

export interface SendavaWebhookPayload {
  event?: string;
  reference?: string;
  externalReference?: string;
  status?: string;
  amount?: string;
  fee?: string;
  currency?: string;
  customerPhone?: string;
  paymentMethod?: string;
  timestamp?: string;
}

/**
 * Vérifie la signature HMAC du webhook SendavaPay.
 * IMPORTANT: rawBody doit être le Buffer brut — pas JSON.stringify.
 */
export function verifyWebhookSignature(webhookSecret: string, signature: string, rawBody: Buffer | string): boolean {
  const data = typeof rawBody === "string" ? Buffer.from(rawBody) : rawBody;
  const expected = `sha256=${crypto.createHmac("sha256", webhookSecret).update(data).digest("hex")}`;
  return expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
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
      url = `${url}?${new URLSearchParams(queryParams).toString()}`;
    }

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json();
    return data as T;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") throw new Error("SendavaPay: Timeout (30s)");
    throw new Error(`SendavaPay: ${err.message}`);
  }
}

/**
 * Crée un paiement côté serveur.
 * Retourne reference + paymentToken (valide 30 min) à transmettre au frontend.
 */
export async function createPayment(
  apiKey: string,
  params: {
    amount: number;
    currency: string;
    payerCountry: string;
    description?: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    webhookUrl?: string;
    externalReference?: string;
    metadata?: Record<string, any>;
  },
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
  if (params.webhookUrl) payload.webhookUrl = params.webhookUrl;
  if (params.externalReference) payload.externalReference = params.externalReference;
  if (params.metadata) payload.metadata = params.metadata;

  console.log(`[SENDAVAPAY] Création paiement: ${params.amount} ${params.currency} — pays: ${params.payerCountry} — ref ext: ${params.externalReference}`);
  const result = await sendavaRequest<SendavaCreatePaymentResponse>("/create-payment", "POST", apiKey, payload);
  console.log(`[SENDAVAPAY] Réponse create-payment: success=${result.success} ref=${result.data?.reference} tokenOk=${!!result.data?.paymentToken}`);
  return result;
}

/**
 * Récupère le statut d'un paiement (polling léger).
 */
export async function getPaymentStatus(apiKey: string, reference: string): Promise<SendavaPaymentStatusResponse> {
  return sendavaRequest<SendavaPaymentStatusResponse>(`/payment-status/${encodeURIComponent(reference)}`, "GET", apiKey);
}

/**
 * Vérifie un paiement — retourne les détails complets (à appeler avant de valider une commande).
 */
export async function verifyPayment(apiKey: string, reference: string): Promise<SendavaVerifyPaymentResponse> {
  return sendavaRequest<SendavaVerifyPaymentResponse>("/verify-payment", "POST", apiKey, { reference });
}

/**
 * Récupère la liste des opérateurs disponibles pour un pays (code ISO 2 lettres, ex: "TG").
 */
export async function getOperators(
  apiKey: string,
  countryCode: string,
): Promise<{ success: boolean; data?: any[]; error?: string; message?: string }> {
  return sendavaRequest<{ success: boolean; data?: any[]; error?: string; message?: string }>(
    `/operators/${encodeURIComponent(countryCode)}`,
    "GET",
    apiKey,
  );
}

/**
 * Déclenche le push USSD côté serveur (SDK v1 initiate-payment).
 * Retourne : polling normal, redirect URL, ou OTP requis.
 */
export async function initiatePayment(
  apiKey: string,
  params: {
    paymentToken: string;
    payerName: string;
    payerPhone: string;
    payerCountry: string;
    operatorId: string;
  },
): Promise<{
  success: boolean;
  code?: string;
  requiresRedirect?: boolean;
  redirectUrl?: string;
  requiresOtp?: boolean;
  otpToken?: string | null;
  error?: string;
  message?: string;
}> {
  return sendavaRequest<any>("/initiate-payment", "POST", apiKey, params);
}

/**
 * Effectue un retrait (pay-out) depuis votre wallet vers un numéro Mobile Money.
 */
export async function initiateWithdraw(apiKey: string, params: SendavaWithdrawRequest): Promise<SendavaWithdrawResponse> {
  const payload: Record<string, any> = {
    amount: params.amount,
    phoneNumber: params.phoneNumber,
    operator: params.operator,
    country: params.country,
    currency: params.currency,
  };
  if (params.description) payload.description = params.description;
  if (params.externalReference) payload.externalReference = params.externalReference;

  const masked = params.phoneNumber.replace(/(\d{3})\d+(\d{2})/, "$1****$2");
  console.log(`[SENDAVAPAY] Retrait: ${params.amount} ${params.currency} — ${masked} — ${params.operator} — ${params.country}`);
  const result = await sendavaRequest<SendavaWithdrawResponse>("/withdraw", "POST", apiKey, payload);
  console.log(`[SENDAVAPAY] Retrait réponse: success=${result.success} ref=${result.data?.reference}`);
  return result;
}

/**
 * Consulte les soldes des wallets (tous les pays ou un pays spécifique).
 */
export async function getBalance(apiKey: string, countryCode?: string): Promise<SendavaBalanceResponse> {
  return sendavaRequest<SendavaBalanceResponse>("/balance", "GET", apiKey, undefined, countryCode ? { country: countryCode } : undefined);
}

/**
 * Liste toutes les transactions (pay-in + pay-out).
 */
export async function getTransactions(apiKey: string): Promise<SendavaTransactionsResponse> {
  return sendavaRequest<SendavaTransactionsResponse>("/transactions", "GET", apiKey);
}

export interface SendavaWithdrawalStatusResponse {
  success: boolean;
  data?: {
    reference: string;
    externalReference?: string;
    status: string;
    amount: string;
    fee: string;
    currency: string;
    phoneNumber?: string;
    operator?: string;
    createdAt: string;
    completedAt?: string;
  };
  error?: string;
  message?: string;
}

/**
 * Récupère le statut d'un retrait par sa référence SendavaPay.
 */
export async function getWithdrawalStatus(apiKey: string, reference: string): Promise<SendavaWithdrawalStatusResponse> {
  return sendavaRequest<SendavaWithdrawalStatusResponse>(`/withdrawal-status/${encodeURIComponent(reference)}`, "GET", apiKey);
}

/**
 * Configure l'URL webhook globale pour la clé SDK.
 * Retourne webhookSecret (à stocker en variable d'environnement — affiché une seule fois).
 */
export async function configureWebhook(
  apiKey: string,
  webhookUrl: string,
): Promise<{ success: boolean; data?: { webhookUrl: string; webhookSecret: string }; message?: string }> {
  return sendavaRequest("/webhook", "PUT", apiKey, { webhookUrl });
}

/**
 * Génère une référence interne unique pour le mapping pending_payments.
 */
export function generateReference(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `SP${ts}${rnd}`;
}

/**
 * Mappe un nom d'opérateur WestPay vers le slug SendavaPay pour les retraits.
 */
export function toSendavaOperator(operatorName: string, countryCode: string): string {
  const name = operatorName.toLowerCase().trim();
  const country = countryCode.toUpperCase();

  const mapping: Record<string, Record<string, string>> = {
    "TG": { "tmoney": "tmoney", "t-money": "tmoney", "moov": "moov", "moov money": "moov" },
    "BJ": { "mtn": "mtn", "mtn mobile money": "mtn", "moov": "moov", "moov money": "moov" },
    "SN": { "orange": "orange", "orange money": "orange", "wave": "wave", "free": "free", "free money": "free", "mixx by yas": "wave" },
    "CI": { "orange": "orange", "orange money": "orange", "mtn": "mtn", "mtn mobile money": "mtn", "wave": "wave", "moov": "moov", "moov money": "moov" },
    "ML": { "orange": "orange", "orange money": "orange", "wave": "wave", "moov": "moov", "moov money": "moov" },
    "CM": { "orange": "orange", "orange money": "orange", "mtn": "mtn", "mtn mobile money": "mtn" },
    "BF": { "orange": "orange", "orange money": "orange", "moov": "moov", "moov money": "moov", "coris": "coris", "coris money": "coris" },
    "GN": { "orange": "orange", "orange money": "orange", "mtn": "mtn", "mtn mobile money": "mtn" },
    "COD": { "vodacom": "vodacom", "m-pesa": "vodacom", "airtel": "airtel", "airtel money": "airtel", "orange": "orange", "orange money": "orange" },
    "COG": { "airtel": "airtel", "airtel money": "airtel", "mtn": "mtn", "mtn mobile money": "mtn" },
  };

  return mapping[country]?.[name] || name;
}
