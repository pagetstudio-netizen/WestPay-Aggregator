import crypto from "crypto";

// ── Base URL (NoWallet API v3) ─────────────────────────────────────────────────
const CLAPAY_BASE_URL = "https://nw-api.clapay.app/nowallet/api/v3";

// ── Request / Response types ──────────────────────────────────────────────────

/**
 * Payload for POST /init/payment (both payin and payout)
 * method = "MERCHANT" → payin (dépôt)
 * method = "CASHIN"   → payout (retrait vers wallet)
 * method = "CASHOUT"  → cashout
 */
export interface ClapayPayinRequest {
  transaction_id: string;          // ID généré par le marchand
  amount: number;
  country_code: string;            // CI, SN, TG, BJ, CM, etc.
  operators_code: string[];        // ex: ["OM"], ["MTN"], ["WAVE"]
  method: "MERCHANT" | "CASHIN" | "CASHOUT";
  tunnel: "CHECKOUTPAGE" | "API";
  callback_url: string;
  return_url?: string;
  operator_otp?: string;
  additional_infos?: {
    customer_email?: string;
    customer_lastname?: string;
    customer_firstname?: string;
    customer_phone?: string;
  };
}

export interface ClapayPayinResponse {
  success: boolean;
  message?: string;
  data?: {
    country?: string;
    currency?: string;
    /** Signature NoWallet — à conserver pour les checks de statut */
    signature?: string;
    available_operator?: string[];
    authorized_operator?: string[];
    payment_url?: string;
  };
}

/**
 * Le payout utilise le même endpoint et la même structure que le payin,
 * mais avec method = "CASHIN". On réutilise ClapayPayinRequest/Response.
 */
export type ClapayPayoutRequest = ClapayPayinRequest;
export type ClapayPayoutResponse = ClapayPayinResponse;

/**
 * Webhook / status payload (StatePaymentResponseDto)
 * Envoyé par NoWallet via callback ou retourné par /check/status/payment.
 */
export interface ClapayWebhookPayload {
  status: string;                      // SUCCESS, FAILED, PENDING, etc.
  transaction_id: string;              // = transaction_id du marchand (notre référence)
  amount: number;
  currency?: string;
  fee_percent?: number;
  fee_value?: number;
  balance?: number;
  balance_before?: number;
  balance_after?: number;
  transaction_method?: string;
  transaction_phone_number?: string;
  transaction_dialcode?: string;
  signature?: string;                  // Signature NoWallet
  transaction_date?: string;
  transaction_country_code?: string;
  transaction_service_name?: string;
  transaction_observation?: string;
  additional_infos?: {
    customer_email?: string;
    customer_lastname?: string;
    customer_firstname?: string;
    customer_phone?: string;
  };
  // Champs de compatibilité (ancienne API) — conservés pour robustesse
  reference?: string;
  external_reference?: string;
}

// ── Country / currency helpers ────────────────────────────────────────────────

const CLAPAY_COUNTRY_CODES: Record<string, string> = {
  "Togo": "TG",
  "Benin": "BJ",
  "Burkina Faso": "BF",
  "Cote d'Ivoire": "CI",
  "Senegal": "SN",
  "Mali": "ML",
  "Cameroun": "CM",
  "Congo Brazzaville": "CG",
  "Congo RDC": "CD",
  "Gabon": "GA",
  "Guinee": "GN",
  "Niger": "NE",
  "Guinee-Bissau": "GW",
  "Tchad": "TD",
  "Centrafrique": "CF",
  "Guinee Equatoriale": "GQ",
  "Nigeria": "NG",
};

const CLAPAY_CURRENCY_MAP: Record<string, string> = {
  "TG": "XOF", "BJ": "XOF", "BF": "XOF", "CI": "XOF",
  "SN": "XOF", "ML": "XOF", "NE": "XOF", "GW": "XOF",
  "CM": "XAF", "CG": "XAF", "GA": "XAF", "TD": "XAF",
  "CF": "XAF", "GQ": "XAF",
  "CD": "CDF",
  "GN": "GNF",
  "NG": "NGN",
};

export function clapayCountryCode(country: string): string {
  return CLAPAY_COUNTRY_CODES[country] || "";
}

export function clapayCurrency(country: string): string {
  const code = clapayCountryCode(country);
  return CLAPAY_CURRENCY_MAP[code] || "XOF";
}

export function generateReference(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let ref = "CP";
  for (let i = 0; i < 16; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

// Indicatifs pays NoWallet → longueur du numéro local
const CLAPAY_DIAL_CODES: Record<string, { dialCode: string; localLen: number }> = {
  TG: { dialCode: "228", localLen: 8 },
  BJ: { dialCode: "229", localLen: 8 },
  CI: { dialCode: "225", localLen: 8 },
  SN: { dialCode: "221", localLen: 9 },
  ML: { dialCode: "223", localLen: 8 },
  BF: { dialCode: "226", localLen: 8 },
  GN: { dialCode: "224", localLen: 9 },
  CM: { dialCode: "237", localLen: 9 },
  CG: { dialCode: "242", localLen: 9 },
  CD: { dialCode: "243", localLen: 9 },
  GA: { dialCode: "241", localLen: 8 },
  TD: { dialCode: "235", localLen: 8 },
  CF: { dialCode: "236", localLen: 8 },
  GQ: { dialCode: "240", localLen: 9 },
  GW: { dialCode: "245", localLen: 9 },
  NE: { dialCode: "227", localLen: 8 },
  NG: { dialCode: "234", localLen: 10 },
};

/**
 * Extrait le numéro local (sans indicatif pays) attendu par l'API NoWallet en mode tunnel API.
 * Ex: "+22899935673" / "22899935673" → "99935673" pour TG
 * Si le format n'est pas reconnu, retourne le numéro tel quel.
 */
export function clapayLocalPhone(phone: string, countryCode: string): string {
  const info = CLAPAY_DIAL_CODES[countryCode.toUpperCase()];
  if (!info) return phone;

  // Supprimer espaces et tirets
  let clean = phone.replace(/[\s\-().]/g, "");

  // Supprimer le + initial
  if (clean.startsWith("+")) clean = clean.slice(1);

  // Supprimer l'indicatif si présent
  if (clean.startsWith(info.dialCode)) {
    clean = clean.slice(info.dialCode.length);
  }

  // Supprimer un éventuel 0 initial (format 0XXXXXXXX)
  if (clean.startsWith("0") && clean.length === info.localLen + 1) {
    clean = clean.slice(1);
  }

  return clean;
}

// ── Internal HTTP helper ──────────────────────────────────────────────────────

async function clapayRequest(
  token: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `${CLAPAY_BASE_URL}${path}`;
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const response = await fetch(url, opts);
  let data: any;
  try { data = await response.json(); } catch { data = {}; }
  return { ok: response.ok, status: response.status, data };
}

// ── Payin (dépôt) — POST /init/payment, method=MERCHANT ──────────────────────

export async function clapayInitiatePayin(
  token: string,
  params: ClapayPayinRequest,
): Promise<ClapayPayinResponse> {
  try {
    const payload: Record<string, unknown> = {
      transaction_id: params.transaction_id,
      amount: params.amount,
      country_code: params.country_code,
      operators_code: params.operators_code,
      method: params.method,
      tunnel: params.tunnel,
      callback_url: params.callback_url,
    };
    if (params.return_url) payload.return_url = params.return_url;
    if (params.operator_otp) payload.operator_otp = params.operator_otp;
    if (params.additional_infos) payload.additional_infos = params.additional_infos;

    const r = await clapayRequest(token, "POST", "/init/payment", payload);
    if (r.ok) {
      return { success: true, data: r.data?.data ?? r.data, message: r.data?.message };
    }
    return { success: false, message: r.data?.message || `Erreur HTTP ${r.status}` };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

// ── Payout (retrait vers wallet) — POST /init/payment, method=CASHIN ─────────

export async function clapayInitiatePayout(
  token: string,
  params: ClapayPayoutRequest,
): Promise<ClapayPayoutResponse> {
  // Le payout utilise le même endpoint que le payin avec method=CASHIN
  return clapayInitiatePayin(token, { ...params, method: "CASHIN" });
}

// ── Balance par pays — GET /check/transactions/single/balances/{country} ──────

export async function clapayGetBalance(
  token: string,
  countryCode?: string,
): Promise<{ success: boolean; balance?: number; currency?: string; balances?: any[]; message?: string }> {
  try {
    if (countryCode) {
      // Balance d'un seul pays
      const r = await clapayRequest(token, "GET", `/check/transactions/single/balances/${encodeURIComponent(countryCode)}`);
      if (r.ok) {
        const d = r.data?.data ?? r.data;
        return { success: true, balance: d?.balance, currency: d?.currency };
      }
      return { success: false, message: r.data?.message || `Erreur HTTP ${r.status}` };
    } else {
      // Balance globale (toutes devises) — utilise XOF par défaut
      const r = await clapayRequest(token, "GET", `/check/transactions/global/balances/XOF`);
      if (r.ok) {
        const d = r.data?.data ?? r.data;
        // Peut retourner un tableau ou un objet
        if (Array.isArray(d)) {
          const total = d.reduce((sum: number, b: any) => sum + (b?.balance || 0), 0);
          return { success: true, balance: total, balances: d };
        }
        return { success: true, balance: d?.balance, currency: d?.currency };
      }
      return { success: false, message: r.data?.message || `Erreur HTTP ${r.status}` };
    }
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

// ── Statut de transaction — POST /check/status/payment ───────────────────────
//
// Prend la `signature` retournée par /init/payment (pas la référence marchande).

export async function clapayGetTransactionStatus(
  token: string,
  signature: string,
): Promise<{ success: boolean; status?: string; data?: any; message?: string }> {
  try {
    const r = await clapayRequest(token, "POST", "/check/status/payment", { signature });
    if (r.ok) {
      const d = r.data?.data ?? r.data;
      return {
        success: true,
        status: d?.status ?? r.data?.status,
        data: d,
      };
    }
    return { success: false, message: r.data?.message || `Erreur HTTP ${r.status}` };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

// ── Webhook signature verification ───────────────────────────────────────────
//
// Header format: Nowallet-Signature: key=<uuid>,signature=<hex>
// Algorithm:
//   1. encryptedKey = HMAC-SHA256(webhookUniqueKey, key)   → hex
//   2. payload      = encryptedKey + JSON.stringify(body)
//   3. expected     = HMAC-SHA256(webhookSecret, payload)  → hex
//   4. compare expected with signature(s) from header

export function verifyClapaySignature(
  nowalletSignature: string,
  body: string | Record<string, unknown>,
  webhookSecret: string,
  webhookUniqueKey: string,
): boolean {
  try {
    const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
    const parts = nowalletSignature.split(",");
    const keyPart = parts.find(c => c.startsWith("key="));
    const key = keyPart?.split("=").slice(1).join("=");
    if (!key) return false;
    const signatureParts = parts.filter(c => c.startsWith("signature="));
    const signatures = signatureParts.map(s => s.split("=").slice(1).join("="));
    const keyEncrypted = crypto.createHmac("sha256", webhookUniqueKey).update(key).digest("hex");
    const payload = keyEncrypted + bodyStr;
    const expected = crypto.createHmac("sha256", webhookSecret).update(payload).digest("hex");
    return signatures.includes(expected);
  } catch {
    return false;
  }
}
