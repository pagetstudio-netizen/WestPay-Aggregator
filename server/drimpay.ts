import crypto from "crypto";
import { storage } from "./storage";

export type DrimpayCountryMapping = {
  countryCode: string;
  currency: string;
  operators: Record<string, string>;
  payoutOperators?: Record<string, string>;
};

export type DrimpayConfig = {
  apiKey: string;
  webhookSecret?: string;
  environment: "sandbox" | "production";
  baseUrl: string;
  countryMappings: Record<string, DrimpayCountryMapping>;
};

export type DrimpayOperation = "payin" | "payout";

export class DrimpayApiError extends Error {
  constructor(message: string, readonly statusCode?: number) {
    super(message);
    this.name = "DrimpayApiError";
  }
}

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.trim();
  return result || undefined;
}

function normalizedKey(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseOperatorMap(value: unknown, label: string): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} doit être un objet opérateur/code.`);
  }
  const result: Record<string, string> = {};
  for (const [operator, code] of Object.entries(value)) {
    if (!operator.trim() || typeof code !== "string" || !code.trim()) {
      throw new Error(`${label} contient un opérateur ou un code vide.`);
    }
    result[operator] = code.trim();
  }
  return result;
}

export function parseDrimpayCountryMappings(json: string | undefined | null): Record<string, DrimpayCountryMapping> {
  if (!json?.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Les pays et codes opérateur Drimpay doivent être un JSON valide.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("La configuration des pays Drimpay doit être un objet JSON.");
  }

  const mappings: Record<string, DrimpayCountryMapping> = {};
  for (const [country, value] of Object.entries(parsed)) {
    if (!country.trim() || !value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Chaque pays Drimpay doit contenir un objet de configuration.");
    }
    const row = value as Record<string, unknown>;
    const countryCode = clean(row.countryCode);
    const currency = clean(row.currency);
    if (!countryCode || !/^[A-Za-z]{2}$/.test(countryCode)) {
      throw new Error(`Le code pays ISO à deux lettres est requis pour ${country}.`);
    }
    if (!currency || !/^[A-Za-z0-9]{3,8}$/.test(currency)) {
      throw new Error(`La devise est invalide pour ${country}.`);
    }
    mappings[country] = {
      countryCode: countryCode.toUpperCase(),
      currency: currency.toUpperCase(),
      operators: parseOperatorMap(row.operators, `Les opérateurs de ${country}`),
      ...(row.payoutOperators === undefined
        ? {}
        : { payoutOperators: parseOperatorMap(row.payoutOperators, `Les opérateurs payout de ${country}`) }),
    };
  }
  return mappings;
}

export async function getDrimpayConfig(): Promise<DrimpayConfig | undefined> {
  const [storedApiKey, storedWebhookSecret, storedEnvironment, mappingsJson] = await Promise.all([
    storage.getSetting("drimpay_api_key"),
    storage.getSetting("drimpay_webhook_secret"),
    storage.getSetting("drimpay_environment"),
    storage.getSetting("drimpay_country_mappings"),
  ]);
  const apiKey = clean(storedApiKey) || clean(process.env.DRIMPAY_API_KEY);
  if (!apiKey) return undefined;
  const environmentValue = clean(storedEnvironment) || clean(process.env.DRIMPAY_ENVIRONMENT);
  const environment = environmentValue === "production" ? "production" : "sandbox";
  return {
    apiKey,
    webhookSecret: clean(storedWebhookSecret) || clean(process.env.DRIMPAY_WEBHOOK_SECRET),
    environment,
    baseUrl: environment === "production"
      ? "https://drimpay.com/api/v2"
      : "https://drimpay.com/sandbox-api/v2",
    countryMappings: parseDrimpayCountryMappings(mappingsJson),
  };
}

export function resolveDrimpayRoute(
  config: DrimpayConfig,
  country: string,
  operator: string,
  operation: DrimpayOperation,
): { countryCode: string; currency: string; operatorCode: string } {
  const countryKey = normalizedKey(country);
  const countryEntry = Object.entries(config.countryMappings)
    .find(([name]) => normalizedKey(name) === countryKey)?.[1];
  if (!countryEntry) {
    throw new Error(`Aucun code pays Drimpay n’est configuré pour ${country}.`);
  }
  const operatorMap = operation === "payout"
    ? countryEntry.payoutOperators || countryEntry.operators
    : countryEntry.operators;
  const operatorKey = normalizedKey(operator);
  const operatorCode = Object.entries(operatorMap)
    .find(([name]) => normalizedKey(name) === operatorKey)?.[1];
  if (!operatorCode) {
    throw new Error(`Aucun code opérateur Drimpay n’est configuré pour ${country}/${operator}.`);
  }
  return {
    countryCode: countryEntry.countryCode,
    currency: countryEntry.currency,
    operatorCode,
  };
}

async function requestDrimpay(
  config: DrimpayConfig,
  path: string,
  body?: Record<string, unknown>,
): Promise<any> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(25_000),
  });
  const responseText = await response.text();
  let result: any = {};
  if (responseText) {
    try {
      result = JSON.parse(responseText);
    } catch {
      if (response.ok) throw new DrimpayApiError("Drimpay a renvoyé une réponse illisible.", response.status);
    }
  }
  if (!response.ok || result?.success === false) {
    const providerMessage = clean(result?.message) || clean(result?.error) || clean(result?.detail);
    throw new DrimpayApiError(
      providerMessage || `La requête Drimpay a échoué (HTTP ${response.status}).`,
      response.status,
    );
  }
  return result;
}

function dataOf(response: any): any {
  return response?.data && typeof response.data === "object" ? response.data : response;
}

function responseReference(response: any): string | undefined {
  const data = dataOf(response);
  return clean(data?.reference) || clean(data?.payment_reference) || clean(data?.transaction_reference);
}

function responseStatus(response: any): string {
  const data = dataOf(response);
  return (clean(data?.status) || clean(data?.transaction_status) || clean(response?.status) || "").toLowerCase();
}

export function normalizeDrimpayStatus(response: any): string {
  return responseStatus(response).replace(/[\s-]+/g, "_");
}

export async function initiateDrimpayPayin(
  config: DrimpayConfig,
  input: {
    amount: number;
    currency: string;
    countryCode: string;
    operator: string;
    phone: string;
    orderId: string;
    webhookUrl: string;
    description: string;
    expiresInMinutes: number;
  },
): Promise<{ reference: string; status: string; paymentUrl: string | null; raw: any }> {
  const raw = await requestDrimpay(config, "/payin/initiate", {
    amount: input.amount,
    currency: input.currency,
    country: input.countryCode,
    operator: input.operator,
    phone: input.phone,
    order_id: input.orderId,
    webhook_url: input.webhookUrl,
    description: input.description,
    expires_in_minutes: input.expiresInMinutes,
  });
  const reference = responseReference(raw);
  if (!reference) throw new DrimpayApiError("Drimpay n’a pas renvoyé de référence fournisseur.");
  const data = dataOf(raw);
  return {
    reference,
    status: responseStatus(raw),
    paymentUrl: clean(data?.payment_url) || clean(data?.checkout_url) || null,
    raw,
  };
}

export async function initiateDrimpayPayout(
  config: DrimpayConfig,
  input: {
    amount: number;
    currency: string;
    countryCode: string;
    operator: string;
    phone: string;
    orderId: string;
    webhookUrl: string;
    description?: string;
  },
): Promise<{ reference: string; status: string; raw: any }> {
  const raw = await requestDrimpay(config, "/payout/initiate", {
    amount: input.amount,
    currency: input.currency,
    country_code: input.countryCode,
    operator: input.operator,
    phone: input.phone,
    external_ref: input.orderId,
    order_id: input.orderId,
    webhook_url: input.webhookUrl,
    ...(clean(input.description) ? { description: clean(input.description) } : {}),
  });
  const reference = responseReference(raw);
  if (!reference) throw new DrimpayApiError("Drimpay n’a pas renvoyé de référence fournisseur.");
  return { reference, status: responseStatus(raw), raw };
}

export async function getDrimpayWalletBalance(
  config: DrimpayConfig,
  countryCode: string,
): Promise<{
  countryCode: string;
  currency: string;
  balance: number;
  active?: boolean;
  mode?: string;
}> {
  const normalizedCountryCode = clean(countryCode)?.toUpperCase();
  if (!normalizedCountryCode || !/^[A-Z]{2}$/.test(normalizedCountryCode)) {
    throw new DrimpayApiError("Le code pays ISO Drimpay doit contenir deux lettres.");
  }

  const response = await requestDrimpay(
    config,
    `/payout/wallets/${encodeURIComponent(normalizedCountryCode)}/balance`,
  );
  const data = dataOf(response);
  const balanceValue = data?.balance;
  const balance = typeof balanceValue === "number"
    ? balanceValue
    : typeof balanceValue === "string" && balanceValue.trim()
      ? Number(balanceValue)
      : Number.NaN;
  const currency = clean(data?.currency)?.toUpperCase();
  if (!Number.isFinite(balance) || !currency) {
    throw new DrimpayApiError("Drimpay n’a pas retourné un solde et une devise valides.");
  }

  return {
    countryCode: clean(data?.country_code)?.toUpperCase() || normalizedCountryCode,
    currency,
    balance,
    ...(typeof data?.active === "boolean" ? { active: data.active } : {}),
    ...(clean(data?.mode) ? { mode: clean(data.mode) } : {}),
  };
}

export async function getDrimpayPayinStatus(config: DrimpayConfig, reference: string): Promise<any> {
  return requestDrimpay(config, `/payin/${encodeURIComponent(reference)}`);
}

export async function getDrimpayPayoutStatus(config: DrimpayConfig, reference: string): Promise<any> {
  return requestDrimpay(config, `/payout/${encodeURIComponent(reference)}`);
}

function safeEqualHex(expectedHex: string, actualHex: string): boolean {
  if (!/^[a-f0-9]+$/i.test(actualHex) || expectedHex.length !== actualHex.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expectedHex, "hex"), Buffer.from(actualHex, "hex"));
}

export function verifyDrimpayWebhookSignature(input: {
  signature: string | undefined;
  timestampHeader?: string | undefined;
  secret: string;
  rawBody: string;
  nowMs?: number;
}): boolean {
  const signature = input.signature?.trim();
  if (!signature) return false;
  const nowMs = input.nowMs ?? Date.now();

  const fields = Object.fromEntries(
    signature.split(",").map(part => {
      const separator = part.indexOf("=");
      return separator < 0
        ? [part.trim(), ""]
        : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
    }),
  );
  const timestamp = fields.t || input.timestampHeader?.trim();
  const v1 = fields.v1;
  if (timestamp && v1 && /^\d{9,13}$/.test(timestamp)) {
    const timestampMs = timestamp.length > 10 ? Number(timestamp) : Number(timestamp) * 1000;
    if (!Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > 5 * 60 * 1000) return false;
    const expected = crypto.createHmac("sha256", input.secret)
      .update(`${timestamp}.${input.rawBody}`)
      .digest("hex");
    return safeEqualHex(expected, v1);
  }

  // Older Drimpay examples use sha256=<HMAC(raw body)> without a timestamp.
  // Transaction settlement is independently idempotent for these callbacks.
  const legacy = /^sha256=([a-f0-9]+)$/i.exec(signature);
  if (legacy) {
    const expected = crypto.createHmac("sha256", input.secret).update(input.rawBody).digest("hex");
    return safeEqualHex(expected, legacy[1]);
  }
  return false;
}