import crypto from "crypto";

const MBIYO_BASE_URL = "https://dashboard.mbiyo.africa/api/v1";

export interface MbiyoPayinRequest {
  apiKey: string;
  amount: number;
  currency: string;
  orderId: string;
  callbackUrl: string;
  network: string;
  phoneNumber: string;
  countryCode: string;
  otp?: string;
  mode?: string;
}

export interface MbiyoPayinResponse {
  status: string;
  message: string;
  data?: {
    transaction_id: string;
    amount: number;
    fee: number;
    charged_amount: number;
    currency: string;
    order_id: string;
    status: string;
    payment_method: string;
    redirect_url: string | null;
    instructions?: string;
    created_at: string;
  };
}

export interface MbiyoWebhookPayload {
  transaction_id: string;
  amount: number;
  fee: number;
  currency: string;
  order_id: string;
  status: string;
  charged_amount: number;
  type: string;
  created_at: string;
  updated_at: string;
  metadata: {
    country_code: string;
    phone_number: string;
    network: string;
    om_otp: string | null;
  };
}

export interface MbiyoStatusResponse {
  status: string;
  data?: {
    transaction_id: string;
    amount: number;
    fee: number;
    currency: string;
    order_id: string;
    status: string;
    created_at: string;
    updated_at: string;
  };
}

const COUNTRY_CODES: Record<string, string> = {
  "Togo": "TG",
  "Benin": "BJ",
  "Cote d'Ivoire": "CI",
  "Senegal": "SN",
  "Mali": "ML",
  "Burkina Faso": "BF",
  "Cameroun": "CM",
  "Congo Brazzaville": "CG",
  "Congo RDC": "CD",
  "Guinee": "GN",
  "Gambie": "GM",
};

const COUNTRY_CURRENCIES: Record<string, string> = {
  "Togo": "XOF",
  "Benin": "XOF",
  "Cote d'Ivoire": "XOF",
  "Senegal": "XOF",
  "Mali": "XOF",
  "Burkina Faso": "XOF",
  "Cameroun": "XAF",
  "Congo Brazzaville": "XAF",
  "Congo RDC": "CDF",
  "Guinee": "GNF",
  "Gambie": "GMD",
};

export function mbiyoCountryCode(country: string): string {
  return COUNTRY_CODES[country] || country.slice(0, 2).toUpperCase();
}

export function mbiyoCurrency(country: string): string {
  return COUNTRY_CURRENCIES[country] || "XOF";
}

export function mbiyoNetwork(operator: string): string {
  const op = operator.toLowerCase();
  if (op.includes("mtn")) return "mtn";
  if (op.includes("wave")) return "wave";
  if (op.includes("coris")) return "coris";
  if (op.includes("togocom") || op.includes("t-money") || op.includes("tmoney")) return "togocom";
  if (op.includes("celtiis")) return "celtiis";
  if (op.includes("free")) return "free";
  if (op.includes("afrimoney")) return "afrimoney";
  if (op.includes("mpesa") || op.includes("m-pesa")) return "mpesa";
  if (op.includes("airtel")) return "airtel";
  if (op.includes("orange")) return "orange";
  if (op.includes("moov")) return "moov";
  return op.split(" ")[0].toLowerCase();
}

export function generateReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `MB${timestamp}${random}`;
}

export async function initiatePayin(params: MbiyoPayinRequest): Promise<MbiyoPayinResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  const body: Record<string, any> = {
    amount: params.amount,
    currency: params.currency,
    payment_method: "mobile_money",
    order_id: params.orderId,
    callback_url: params.callbackUrl,
    metadata: {
      network: params.network,
      phone_number: params.phoneNumber,
      country_code: params.countryCode,
    },
  };

  if (params.otp) {
    body.metadata.om_otp = params.otp;
  }

  console.log(`[MBIYO] Demande de paiement: ${params.amount} ${params.currency} - Ref: ${params.orderId} - Tel: ${params.phoneNumber} - Network: ${params.network} - Country: ${params.countryCode}`);

  try {
    const response = await fetch(`${MBIYO_BASE_URL}/merchant/payin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json() as MbiyoPayinResponse;

    if (data.status === "success") {
      console.log(`[MBIYO] Paiement initie - TxID: ${data.data?.transaction_id}`);
    } else {
      console.error(`[MBIYO] Echec paiement: ${data.message}`);
    }

    return data;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error("Mbiyo: Timeout de connexion (30s)");
    }
    throw new Error(`Mbiyo: ${err.message}`);
  }
}

export async function getTransactionStatus(apiKey: string, transactionId: string): Promise<MbiyoStatusResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${MBIYO_BASE_URL}/merchant/transactions/${transactionId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return await response.json() as MbiyoStatusResponse;
  } catch (err: any) {
    clearTimeout(timeout);
    throw new Error(`Mbiyo statut: ${err.message}`);
  }
}

export function verifyWebhookSignature(secret: string, signature: string, rawBody: string): boolean {
  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return computed === signature;
}

// ==================== PAYOUT (Send) ====================

export interface MbiyoPayoutRequest {
  apiKey: string;
  amount: number;
  currency: string;
  orderId: string;
  callbackUrl: string;
  network: string;
  phoneNumber: string;
  countryCode: string;
  beneficiary?: string;
}

export interface MbiyoPayoutResponse {
  status: string;
  message: string;
  data?: {
    transaction_id: string;
    amount: number;
    fee: number;
    charged_amount: number;
    currency: string;
    order_id: string;
    status: string;
    payment_method: string;
    created_at: string;
    metadata?: {
      phone_number: string;
      network: string;
      country_code: string;
      beneficiary?: string;
    };
  };
}

export interface MbiyoPayoutWebhookPayload {
  event: string;
  transaction_id: string;
  order_id: string;
  status: string;
  amount: number;
  fee: number;
  currency: string;
  metadata?: {
    phone_number?: string;
    network?: string;
    country_code?: string;
    beneficiary?: string;
  };
}

export async function initiatePayout(params: MbiyoPayoutRequest): Promise<MbiyoPayoutResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  const body: Record<string, any> = {
    amount: params.amount,
    currency: params.currency,
    payment_method: "mobile_money",
    order_id: params.orderId,
    callback_url: params.callbackUrl,
    metadata: {
      network: params.network,
      phone_number: params.phoneNumber,
      country_code: params.countryCode,
      beneficiary: params.beneficiary || "Marchand WestPay",
    },
  };

  console.log(`[MBIYO PAYOUT] Demande de transfert: ${params.amount} ${params.currency} - Ref: ${params.orderId} - Tel: ${params.phoneNumber}`);

  try {
    const response = await fetch(`${MBIYO_BASE_URL}/merchant/payout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json() as MbiyoPayoutResponse;

    if (data.status === "success") {
      console.log(`[MBIYO PAYOUT] Transfert initie - TxID: ${data.data?.transaction_id}`);
    } else {
      console.error(`[MBIYO PAYOUT] Echec transfert: ${data.message}`);
    }

    return data;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error("Mbiyo Payout: Timeout de connexion (30s)");
    }
    throw new Error(`Mbiyo Payout: ${err.message}`);
  }
}
