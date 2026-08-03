import crypto from "crypto";
import { maskPhone } from "./logMask";

const OMNIPAY_BASE_URL = "https://omnipay.webtechci.com/interface/api2";

export interface OmniPayPaymentRequest {
  apikey: string;
  msisdn: string;
  amount: number;
  reference: string;
  first_name: string;
  last_name: string;
  otp?: string;
  operator?: string;
  return_url?: string;
}

export interface OmniPayTransferRequest {
  apikey: string;
  msisdn: string;
  amount: number;
  reference: string;
  first_name: string;
  last_name: string;
  operator?: string;
}

export interface OmniPayResponse {
  success: number;
  code?: number;
  message?: string;
  id?: number;
  reference?: string;
  payment_url?: string;
  first_name?: string;
  last_name?: string;
  msisdn?: string;
  amount?: number;
  fees?: number;
  currency?: string;
  type?: string;
}

export interface OmniPayStatusResponse {
  success: number;
  code?: number;
  message?: string;
  id?: number;
  status?: number;
  reference?: string;
  first_name?: string;
  last_name?: string;
  msisdn?: string;
  amount?: number;
  fees?: number;
  type?: string;
}

export interface OmniPayBalanceResponse {
  success: number;
  code?: number;
  message?: string;
  balance?: Array<{
    countryName: string;
    countryCode: string;
    amount: number;
    pending?: number;
    currency: string;
  }>;
}

export interface OmniPayCallbackPayload {
  action: string;
  id: string;
  type: string;
  reference: string;
  first_name: string;
  last_name: string;
  msisdn: string;
  amount: string;
  fees: string;
  currency: string;
  status: string;
  message: string;
  signature?: string;
}

export const OMNIPAY_STATUS = {
  INITIATED: 1,
  PENDING: 2,
  SUCCESS: 3,
  FAILED: 4,
} as const;

export const OMNIPAY_ERRORS: Record<number, string> = {
  1: "Cle API invalide",
  2: "Service non disponible",
  3: "Operation non autorisee",
  4: "Parametre manquant: msisdn",
  5: "Montant invalide",
  6: "Montant maximum depasse",
  7: "Parametre manquant: reference",
  8: "Reference deja utilisee",
  9: "Erreur de communication interne",
  10: "Numero de telephone invalide",
  11: "Parametre manquant: first_name",
  12: "Parametre manquant: last_name",
  13: "Parametre manquant: amount",
  14: "Operateur non disponible",
  15: "Montant minimum non atteint",
  16: "MSISDN invalide",
  17: "Parametre manquant: otp",
  18: "Fonds insuffisants",
  19: "Reference invalide",
  20: "Parametre manquant: return_url",
  21: "Solde non disponible",
  22: "Numero blackliste pour activite frauduleuse",
};

async function omnipayRequest<T>(payload: Record<string, any>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(OMNIPAY_BASE_URL, {
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
      throw new Error("OmniPay: Timeout de connexion (30s)");
    }
    throw new Error(`OmniPay: ${err.message}`);
  }
}

export async function initiatePayment(params: OmniPayPaymentRequest): Promise<OmniPayResponse> {
  const payload: Record<string, any> = {
    action: "paymentrequest",
    apikey: params.apikey,
    msisdn: params.msisdn,
    amount: String(params.amount),
    reference: params.reference,
    first_name: params.first_name,
    last_name: params.last_name,
  };

  if (params.otp) payload.otp = params.otp;
  if (params.operator) payload.operator = params.operator;
  if (params.return_url) payload.return_url = params.return_url;

  console.log(`[OMNIPAY] Demande de paiement: ${params.amount} - Ref: ${params.reference} - Tel: ${maskPhone(params.msisdn)}`);
  const result = await omnipayRequest<OmniPayResponse>(payload);

  if (result.success === 1) {
    console.log(`[OMNIPAY] Paiement initie avec succes - ID: ${result.id} - Ref: ${result.reference}`);
  } else {
    const errorMsg = OMNIPAY_ERRORS[result.code || 0] || result.message || "Erreur inconnue";
    console.error(`[OMNIPAY] Echec paiement - Code: ${result.code} - ${errorMsg}`);
  }

  return result;
}

export async function initiateTransfer(params: OmniPayTransferRequest): Promise<OmniPayResponse> {
  const payload: Record<string, any> = {
    action: "transfer",
    apikey: params.apikey,
    msisdn: params.msisdn,
    amount: String(params.amount),
    reference: params.reference,
    first_name: params.first_name,
    last_name: params.last_name,
  };

  if (params.operator) payload.operator = params.operator;

  console.log(`[OMNIPAY] Demande de transfert: ${params.amount} - Ref: ${params.reference} - Tel: ${maskPhone(params.msisdn)}`);
  const result = await omnipayRequest<OmniPayResponse>(payload);

  if (result.success === 1) {
    console.log(`[OMNIPAY] Transfert initie avec succes - ID: ${result.id} - Ref: ${result.reference}`);
  } else {
    const errorMsg = OMNIPAY_ERRORS[result.code || 0] || result.message || "Erreur inconnue";
    console.error(`[OMNIPAY] Echec transfert - Code: ${result.code} - ${errorMsg}`);
  }

  return result;
}

export async function getTransactionStatus(apikey: string, reference: string): Promise<OmniPayStatusResponse> {
  const result = await omnipayRequest<OmniPayStatusResponse>({
    action: "getstatus",
    apikey,
    reference,
  });
  return result;
}

export async function getBalance(apikey: string): Promise<OmniPayBalanceResponse> {
  const result = await omnipayRequest<OmniPayBalanceResponse>({
    action: "getbalance",
    apikey,
  });
  return result;
}

export function verifyCallbackSignature(callbackKey: string, payload: OmniPayCallbackPayload): boolean {
  const concatenated = [
    payload.id,
    payload.type,
    payload.reference,
    payload.msisdn,
    payload.amount,
    payload.fees,
    payload.status,
    payload.message,
  ].join("|");

  const computed = crypto
    .createHmac("sha3-512", callbackKey)
    .update(concatenated)
    .digest("hex");

  return computed === payload.signature;
}

export function generateReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `WP${timestamp}${random}`;
}
