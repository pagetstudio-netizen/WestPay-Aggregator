import crypto from "crypto";

const OXAPAY_BASE_URL = "https://api.oxapay.com";

export interface OxaPayInvoiceRequest {
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

export interface OxaPayWhiteLabelRequest {
  amount: number;
  currency: string;
  payCurrency: string;
  lifeTime?: number;
  feePaidByPayer?: number;
  callbackUrl?: string;
  returnUrl?: string;
  description?: string;
  orderId?: string;
  email?: string;
  network?: string;
}

export interface OxaPayWhiteLabelResponse {
  result: number;
  message?: string;
  trackId?: string;
  address?: string;
  network?: string;
  payAmount?: number;
  payCurrency?: string;
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

export interface OxaPayPayoutRequest {
  address: string;
  amount: number;
  currency: string;
  callbackUrl?: string;
  description?: string;
  orderId?: string;
}

export interface OxaPayPayoutResponse {
  result: number;
  message?: string;
  trackId?: string;
  status?: string;
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

async function oxapayRequest<T>(apiKey: string, endpoint: string, payload: Record<string, any>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${OXAPAY_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "merchant_api_key": apiKey,
      },
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

export async function createInvoice(merchantApiKey: string, params: OxaPayInvoiceRequest): Promise<OxaPayInvoiceResponse> {
  console.log(`[OXAPAY] Création invoice: ${params.amount} ${params.currency}`);

  const result = await oxapayRequest<OxaPayInvoiceResponse>(merchantApiKey, "/merchants/request", {
    amount: params.amount,
    currency: params.currency,
    lifeTime: params.lifeTime ?? 30,
    feePaidByPayer: params.feePaidByPayer ?? 0,
    underPaidCover: params.underPaidCover ?? 0,
    ...(params.callbackUrl && { callbackUrl: params.callbackUrl }),
    ...(params.returnUrl && { returnUrl: params.returnUrl }),
    ...(params.description && { description: params.description }),
    ...(params.orderId && { orderId: params.orderId }),
    ...(params.email && { email: params.email }),
  });

  if (result.result === 100) {
    console.log(`[OXAPAY] Invoice créée - TrackId: ${result.trackId}`);
  } else {
    console.error(`[OXAPAY] Échec création invoice - Code: ${result.result} - ${result.message}`);
  }

  return result;
}

export async function createWhiteLabel(merchantApiKey: string, params: OxaPayWhiteLabelRequest): Promise<OxaPayWhiteLabelResponse> {
  console.log(`[OXAPAY] White Label: ${params.amount} ${params.currency} → ${params.payCurrency}`);

  const result = await oxapayRequest<OxaPayWhiteLabelResponse>(merchantApiKey, "/merchants/request/whitelabel", {
    amount: params.amount,
    currency: params.currency,
    payCurrency: params.payCurrency,
    lifeTime: params.lifeTime ?? 30,
    feePaidByPayer: params.feePaidByPayer ?? 0,
    ...(params.callbackUrl && { callbackUrl: params.callbackUrl }),
    ...(params.returnUrl && { returnUrl: params.returnUrl }),
    ...(params.description && { description: params.description }),
    ...(params.orderId && { orderId: params.orderId }),
    ...(params.email && { email: params.email }),
    ...(params.network && { network: params.network }),
  });

  if (result.result === 100) {
    console.log(`[OXAPAY] White Label créée - TrackId: ${result.trackId} | Adresse: ${result.address} | Réseau: ${result.network}`);
  } else {
    console.error(`[OXAPAY] Échec White Label - Code: ${result.result} - ${result.message}`);
  }

  return result;
}

export async function getStatus(merchantApiKey: string, trackId: string): Promise<OxaPayStatusResponse> {
  console.log(`[OXAPAY] Vérification statut - TrackId: ${trackId}`);
  const result = await oxapayRequest<OxaPayStatusResponse>(merchantApiKey, "/merchants/inquiry", { trackId });
  return result;
}

export async function generatePayout(payoutApiKey: string, params: OxaPayPayoutRequest): Promise<OxaPayPayoutResponse> {
  console.log(`[OXAPAY] Payout vers ${params.address}: ${params.amount} ${params.currency}`);

  const result = await oxapayRequest<OxaPayPayoutResponse>(payoutApiKey, "/merchants/payout", {
    address: params.address,
    amount: params.amount,
    currency: params.currency,
    ...(params.callbackUrl && { callbackUrl: params.callbackUrl }),
    ...(params.description && { description: params.description }),
    ...(params.orderId && { orderId: params.orderId }),
  });

  if (result.result === 100) {
    console.log(`[OXAPAY] Payout initié - TrackId: ${result.trackId}`);
  } else {
    console.error(`[OXAPAY] Échec payout - Code: ${result.result} - ${result.message}`);
  }

  return result;
}

export function verifyWebhook(callbackKey: string, payload: OxaPayWebhookPayload): boolean {
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

export interface OxaPayCurrency {
  symbol: string;
  name?: string;
  networks?: string[];
  minAmount?: number;
  maxAmount?: number;
}

let currenciesCache: { data: OxaPayCurrency[]; fetchedAt: number } | null = null;
const CURRENCIES_CACHE_TTL_MS = 15 * 60 * 1000;

export async function getCurrencies(merchantApiKey: string): Promise<OxaPayCurrency[]> {
  if (currenciesCache && Date.now() - currenciesCache.fetchedAt < CURRENCIES_CACHE_TTL_MS) {
    return currenciesCache.data;
  }
  try {
    const result = await oxapayRequest<{ result: number; currencies?: any[] }>(
      merchantApiKey,
      "/merchants/allowedCoins",
      {},
    );
    if (result.result === 100 && Array.isArray(result.currencies) && result.currencies.length > 0) {
      const parsed: OxaPayCurrency[] = result.currencies.map((c: any) => ({
        symbol: c.symbol || c.currency || String(c),
        name: c.name || c.symbol || String(c),
        networks: c.networks || [],
        minAmount: c.minAmount,
        maxAmount: c.maxAmount,
      }));
      currenciesCache = { data: parsed, fetchedAt: Date.now() };
      return parsed;
    }
  } catch (e) {
    console.warn("[OXAPAY] getCurrencies échoué, fallback liste statique");
  }
  const fallback: OxaPayCurrency[] = [
    { symbol: "USDT", name: "Tether USD" },
    { symbol: "BTC", name: "Bitcoin" },
    { symbol: "ETH", name: "Ethereum" },
    { symbol: "LTC", name: "Litecoin" },
    { symbol: "TRX", name: "Tron" },
    { symbol: "BNB", name: "BNB" },
    { symbol: "DOGE", name: "Dogecoin" },
  ];
  if (!currenciesCache) currenciesCache = { data: fallback, fetchedAt: Date.now() };
  return fallback;
}
