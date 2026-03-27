import crypto from "crypto";

const OXAPAY_BASE_URL = "https://api.oxapay.com/v1";

export interface OxaPayInvoiceRequest {
  merchant: string;
  amount: number;
  currency: string;
  lifeTime?: number;
  feePaidByPayer?: number;
  underPaidCover?: number;
  callbackUrl?: string;
  returnUrl?: string;
  description?: string;
  orderId?: string;
  email?: string;
}

export interface OxaPayInvoiceResponse {
  result: number;
  message?: string;
  trackId?: string;
  payLink?: string;
  expiredAt?: string;
}

export interface OxaPayStatusResponse {
  result: number;
  message?: string;
  trackId?: string;
  status?: string;
  amount?: number;
  currency?: string;
  payAmount?: number;
  payCurrency?: string;
  receivedConfirm?: number;
  address?: string;
  network?: string;
  txHash?: string;
  createdAt?: string;
  expiredAt?: string;
}

export interface OxaPayWebhookPayload {
  trackId?: string;
  status?: string;
  amount?: number;
  currency?: string;
  payAmount?: number;
  payCurrency?: string;
  orderId?: string;
  email?: string;
  description?: string;
  hmac?: string;
  [key: string]: any;
}

export const OXAPAY_STATUS = {
  NEW: "new",
  WAITING: "waiting",
  CONFIRMING: "confirming",
  PAYING: "paying",
  PAID: "paid",
  EXPIRED: "expired",
  FAILED: "failed",
  REFUNDED: "refunded",
} as const;

async function oxapayRequest<T>(endpoint: string, payload: Record<string, any>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${OXAPAY_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json();
    return data as T;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error("OxaPay: Timeout de connexion (30s)");
    }
    throw new Error(`OxaPay: ${err.message}`);
  }
}

export async function createInvoice(params: OxaPayInvoiceRequest): Promise<OxaPayInvoiceResponse> {
  console.log(`[OXAPAY] Création invoice: ${params.amount} ${params.currency} - Merchant: ${params.merchant.substring(0, 8)}...`);

  const result = await oxapayRequest<OxaPayInvoiceResponse>("/merchants/request", {
    merchant: params.merchant,
    amount: params.amount,
    currency: params.currency,
    lifeTime: params.lifeTime ?? 30,
    feePaidByPayer: params.feePaidByPayer ?? 0,
    underPaidCover: params.underPaidCover ?? 0,
    callbackUrl: params.callbackUrl,
    returnUrl: params.returnUrl,
    description: params.description,
    orderId: params.orderId,
    email: params.email,
  });

  if (result.result === 100) {
    console.log(`[OXAPAY] Invoice créée - TrackId: ${result.trackId}`);
  } else {
    console.error(`[OXAPAY] Échec création invoice - Code: ${result.result} - ${result.message}`);
  }

  return result;
}

export async function getInvoiceStatus(apiKey: string, trackId: string): Promise<OxaPayStatusResponse> {
  console.log(`[OXAPAY] Vérification statut - TrackId: ${trackId}`);
  const result = await oxapayRequest<OxaPayStatusResponse>("/merchants/inquiry", {
    merchant: apiKey,
    trackId,
  });
  return result;
}

export function verifyWebhookSignature(callbackKey: string, payload: OxaPayWebhookPayload): boolean {
  if (!payload.hmac) return false;

  const { hmac, ...rest } = payload;
  const sortedKeys = Object.keys(rest).sort();
  const concatenated = sortedKeys.map(k => `${k}=${rest[k]}`).join("&");

  const computed = crypto
    .createHmac("sha512", callbackKey)
    .update(concatenated)
    .digest("hex");

  return computed === hmac;
}

export function generateOxaPayReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `OXA${timestamp}${random}`;
}
