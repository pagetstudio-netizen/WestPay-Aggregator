import crypto from "crypto";

const SENDAVAPAY_BASE_URL = "https://sendavapay.com";

export const SENDAVAPAY_COUNTRY_CODES: Record<string, string> = {
  "Togo": "TG",
  "Benin": "BJ",
  "Cameroun": "CM",
  "Burkina Faso": "BF",
  "Cote d'Ivoire": "CI",
  "Mali": "ML",
  "Senegal": "SN",
  "Congo RDC": "COD",
  "Congo Brazzaville": "COG",
};

export const SENDAVAPAY_OTP_COUNTRIES: Record<string, string[]> = {
  "BF": ["orange", "orange money"],
  "CI": ["orange", "orange money"],
  "ML": ["orange", "orange money"],
  "SN": ["orange", "orange money"],
};

export const SENDAVAPAY_USSD_CODES: Record<string, string> = {
  "BF": "*144*4*6*[MONTANT]#",
  "CI": "#144*82#",
  "ML": "#144#77#",
  "SN": "#144#391#",
};

export const SENDAVAPAY_OPERATOR_MAP: Record<string, string> = {
  "tmoney": "TMoney",
  "moov money": "Moov",
  "moov": "Moov",
  "mtn mobile money": "MTN",
  "mtn": "MTN",
  "orange money": "Orange",
  "orange": "Orange",
  "wave": "Wave",
  "airtel money": "Airtel",
  "airtel": "Airtel",
  "vodacom": "Vodacom",
  "m-pesa": "Vodacom",
  "africell": "Africell",
  "africell money": "Africell",
  "mixx by yas": "Orange",
  "celtiis": "MTN",
  "coris money": "Coris",
  "coris": "Coris",
};

export interface SendavaPayPaymentRequest {
  amount: number;
  phoneNumber: string;
  operator: string;
  country: string;
  customerName?: string;
  description?: string;
  callbackUrl?: string;
}

export interface SendavaPayPaymentResponse {
  success: boolean;
  status?: string;
  reference?: string;
  txid?: string;
  otpRequired?: boolean;
  ussdCode?: string;
  message?: string;
  fee?: string | number;
  currency?: string;
  redirectUrl?: string;
}

export interface SendavaPayOtpRequest {
  reference: string;
  otp: string;
}

export interface SendavaPayOtpResponse {
  success: boolean;
  status?: string;
  reference?: string;
  message?: string;
}

export interface SendavaPayVerifyResponse {
  success: boolean;
  status?: string;
  txid?: string;
  reference?: string;
  amount?: string | number;
  fee?: string | number;
  currency?: string;
  message?: string;
}

export interface SendavaPayBalanceResponse {
  success: boolean;
  balance?: Array<{ currency: string; amount: number }> | number;
  message?: string;
}

export interface SendavaPayWebhookPayload {
  reference?: string;
  txid?: string;
  status?: string;
  amount?: string | number;
  fee?: string | number;
  currency?: string;
  phoneNumber?: string;
  operator?: string;
  country?: string;
  message?: string;
  signature?: string;
}

function makeSignature(apiSecret: string, payload: Record<string, any>): string {
  return crypto
    .createHmac("sha256", apiSecret)
    .update(JSON.stringify(payload))
    .digest("hex");
}

export function verifyWebhookSignature(apiSecret: string, signature: string, rawBody: string): boolean {
  const expected = crypto.createHmac("sha256", apiSecret).update(rawBody).digest("hex");
  return expected === signature;
}

async function sendavaRequest<T>(
  endpoint: string,
  method: "GET" | "POST",
  apiKey: string,
  apiSecret: string,
  payload?: Record<string, any>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    };

    if (payload) {
      headers["x-signature"] = makeSignature(apiSecret, payload);
    }

    const response = await fetch(`${SENDAVAPAY_BASE_URL}${endpoint}`, {
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

export async function initiatePayment(
  apiKey: string,
  apiSecret: string,
  params: SendavaPayPaymentRequest,
): Promise<SendavaPayPaymentResponse> {
  const payload: Record<string, any> = {
    amount: params.amount,
    phoneNumber: params.phoneNumber,
    operator: params.operator,
    country: params.country,
  };
  if (params.customerName) payload.customerName = params.customerName;
  if (params.description) payload.description = params.description;
  if (params.callbackUrl) payload.callbackUrl = params.callbackUrl;

  console.log(`[SENDAVAPAY] Initiation paiement: ${params.amount} - Tel: ${params.phoneNumber} - Op: ${params.operator} - Pays: ${params.country}`);
  const result = await sendavaRequest<SendavaPayPaymentResponse>("/api/sdk/payment", "POST", apiKey, apiSecret, payload);
  console.log(`[SENDAVAPAY] Réponse initiation: success=${result.success} status=${result.status} otpRequired=${result.otpRequired} ref=${result.reference}`);
  return result;
}

export async function confirmOtp(
  apiKey: string,
  apiSecret: string,
  params: SendavaPayOtpRequest,
): Promise<SendavaPayOtpResponse> {
  const payload = { reference: params.reference, otp: params.otp };
  console.log(`[SENDAVAPAY] Confirmation OTP ref=${params.reference}`);
  const result = await sendavaRequest<SendavaPayOtpResponse>("/api/sdk/confirm-otp", "POST", apiKey, apiSecret, payload);
  console.log(`[SENDAVAPAY] OTP réponse: success=${result.success} status=${result.status}`);
  return result;
}

export async function verifyPayment(
  apiKey: string,
  apiSecret: string,
  reference: string,
): Promise<SendavaPayVerifyResponse> {
  const payload = { reference };
  return sendavaRequest<SendavaPayVerifyResponse>("/api/sdk/verify", "POST", apiKey, apiSecret, payload);
}

export async function getBalance(apiKey: string, apiSecret: string): Promise<SendavaPayBalanceResponse> {
  return sendavaRequest<SendavaPayBalanceResponse>("/api/sdk/balance", "GET", apiKey, apiSecret);
}

export function generateReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `SP${timestamp}${random}`;
}

export function toSendavaOperator(paymentMethod: string): string {
  const key = paymentMethod.toLowerCase().trim();
  return SENDAVAPAY_OPERATOR_MAP[key] || paymentMethod;
}

export function isSendavaOtpRequired(countryCode: string, paymentMethod: string): boolean {
  const operators = SENDAVAPAY_OTP_COUNTRIES[countryCode] || [];
  const lower = paymentMethod.toLowerCase();
  return operators.some(op => lower.includes(op));
}

export function getSendavaUssdCode(countryCode: string, amount: number): string {
  const template = SENDAVAPAY_USSD_CODES[countryCode] || "";
  return template.replace("[MONTANT]", String(amount));
}
