import crypto from "crypto";

const SEAPAY_BASE_URL = "https://api.seaglb.xyz";

/* ── Signature MD5 ─────────────────────────────────────────────────── */
export function buildSeapaySign(params: Record<string, any>, key: string): string {
  const sorted = Object.keys(params)
    .filter(k => k !== "sign" && params[k] !== "" && params[k] !== null && params[k] !== undefined)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("md5").update(`${sorted}&key=${key}`).digest("hex");
}

export function verifySeapaySign(params: Record<string, any>, key: string, receivedSign: string): boolean {
  const expected = buildSeapaySign(params, key);
  return expected === receivedSign?.toLowerCase();
}

/* ── Currency → pay_type mapping ───────────────────────────────────── */
export const SEAPAY_CURRENCY_COUNTRY: Record<string, string> = {
  "Pakistan":    "PKR",
  "Philippines": "PHP",
  "India":       "INR",
  "Bangladesh":  "BDT",
  "Vietnam":     "VND",
  "Egypt":       "EGP",
};

export const SEAPAY_PAY_TYPES: Record<string, string> = {
  PKR: "101",
  PHP: "201",
  INR: "301",
  BDT: "401",
  VND: "501",
  EGP: "601",
};

/* ── Interfaces ─────────────────────────────────────────────────────── */
export interface SeapayPayinRequest {
  merchantId: string;
  currency: string;
  amount: number;
  orderId: string;
  notifyUrl: string;
  payType?: string;
  channelCode?: string;
  returnUrl?: string;
  customerPhone?: string;
  customerName?: string;
  remark?: string;
}

export interface SeapayPayinResponse {
  code: number;
  msg: string;
  data?: {
    order_id?: string;
    payment_url?: string;
    trade_no?: string;
    amount?: number;
    currency?: string;
    status?: string;
    [key: string]: any;
  };
}

export interface SeapayPayoutRequest {
  merchantId: string;
  currency: string;
  amount: number;
  orderId: string;
  notifyUrl: string;
  bankCode?: string;
  walletCode?: string;
  channelCode?: string;
  account: string;
  accountName: string;
  remark?: string;
}

export interface SeapayPayoutResponse {
  code: number;
  msg: string;
  data?: {
    order_id?: string;
    trade_no?: string;
    amount?: number;
    currency?: string;
    status?: string;
    [key: string]: any;
  };
}

export interface SeapayBalanceResponse {
  code: number;
  msg: string;
  data?: {
    currency?: string;
    balance?: number;
    frozen?: number;
    [key: string]: any;
  };
}

export interface SeapayQueryResponse {
  code: number;
  msg: string;
  data?: {
    order_id?: string;
    trade_no?: string;
    status?: string;
    amount?: number;
    currency?: string;
    [key: string]: any;
  };
}

/* ── Pay-in (Dépôt — retourne une URL de paiement) ─────────────────── */
export async function seapayPayin(
  req: SeapayPayinRequest,
  apiKey: string
): Promise<SeapayPayinResponse> {
  const currency = req.currency.toUpperCase();
  const payType = req.payType || SEAPAY_PAY_TYPES[currency] || "101";

  const params: Record<string, any> = {
    merchant_id: req.merchantId,
    pay_type:    payType,
    currency,
    amount:      req.amount,
    order_id:    req.orderId,
    notify_url:  req.notifyUrl,
  };
  if (req.channelCode) params.channel_code = req.channelCode;
  if (req.returnUrl)   params.return_url   = req.returnUrl;
  if (req.customerPhone) params.customer_phone = req.customerPhone;
  if (req.customerName)  params.customer_name  = req.customerName;
  if (req.remark) params.remark = req.remark;

  params.sign = buildSeapaySign(params, apiKey);

  const resp = await fetch(`${SEAPAY_BASE_URL}/api/merchant/payin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return resp.json() as Promise<SeapayPayinResponse>;
}

/* ── Pay-out (Retrait — envoie de l'argent) ─────────────────────────── */
export async function seapayPayout(
  req: SeapayPayoutRequest,
  apiSecret: string
): Promise<SeapayPayoutResponse> {
  const currency = req.currency.toUpperCase();

  const params: Record<string, any> = {
    merchant_id:  req.merchantId,
    currency,
    amount:       req.amount,
    order_id:     req.orderId,
    notify_url:   req.notifyUrl,
    account:      req.account,
    account_name: req.accountName,
  };
  if (req.bankCode)    params.bank_code    = req.bankCode;
  if (req.walletCode)  params.wallet_code  = req.walletCode;
  if (req.channelCode) params.channel_code = req.channelCode;
  if (req.remark)      params.remark       = req.remark;

  params.sign = buildSeapaySign(params, apiSecret);

  const resp = await fetch(`${SEAPAY_BASE_URL}/api/merchant/payout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return resp.json() as Promise<SeapayPayoutResponse>;
}

/* ── Balance Check ──────────────────────────────────────────────────── */
export async function seapayBalance(
  merchantId: string,
  currency: string,
  apiSecret: string
): Promise<SeapayBalanceResponse> {
  const params: Record<string, any> = {
    merchant_id: merchantId,
    currency:    currency.toUpperCase(),
  };
  params.sign = buildSeapaySign(params, apiSecret);

  const resp = await fetch(`${SEAPAY_BASE_URL}/api/merchant/balance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return resp.json() as Promise<SeapayBalanceResponse>;
}

/* ── Order Query ────────────────────────────────────────────────────── */
export async function seapayQuery(
  merchantId: string,
  orderId: string,
  currency: string,
  apiKey: string
): Promise<SeapayQueryResponse> {
  const params: Record<string, any> = {
    merchant_id: merchantId,
    order_id:    orderId,
    currency:    currency.toUpperCase(),
  };
  params.sign = buildSeapaySign(params, apiKey);

  const resp = await fetch(`${SEAPAY_BASE_URL}/api/merchant/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return resp.json() as Promise<SeapayQueryResponse>;
}

/* ── Génération de référence unique ─────────────────────────────────── */
export function seapayGenerateRef(): string {
  return `SP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}
