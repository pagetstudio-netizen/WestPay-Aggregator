import { storage } from "./storage";
import { getDrimpayConfig, getDrimpayPayinStatus, normalizeDrimpayStatus } from "./drimpay";
import { clapayGetTransactionStatus } from "./clapay";
import { getTransactionStatus as mbiyoGetTransactionStatus } from "./mbiyo";
import { getLipaPapTransactionStatus, type LipaPapConfig } from "./lipapap";
import { SEAPAY_CURRENCY_COUNTRY, seapayQuery } from "./seapay";
import type { ManualPaymentRecord } from "./manual-payment-service";

export type PaymentProviderStatusResult = {
  provider: string;
  status: string;
  message?: string;
};

const PROVIDER_LABELS: Record<string, string> = {
  mbiyo: "Mbiyo",
  seapay: "SeaPay",
  clapay: "ClaPay",
  lipapap: "LipaPap",
  drimpay: "Drimpay",
};

function normalizeGateway(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (normalized === "lipa") return "lipapap";
  if (normalized === "mbiyopay") return "mbiyo";
  return normalized;
}

export function supportsPaymentProviderStatus(payment: ManualPaymentRecord): boolean {
  const gateway = normalizeGateway(payment.gateway);
  if (!PROVIDER_LABELS[gateway]) return false;
  if (gateway === "drimpay") return Boolean(payment.providerTxId);
  return Boolean(payment.providerReference || payment.providerTxId);
}

async function getConfiguredValue(settingKey: string, envKey: string): Promise<string | undefined> {
  const stored = await storage.getSetting(settingKey);
  const value = (stored || process.env[envKey] || "").trim();
  return value || undefined;
}

async function getLipaPapStatusConfig(): Promise<LipaPapConfig | undefined> {
  const [clientKey, secretKey, paymentUrl, environment, payerEmail] = await Promise.all([
    getConfiguredValue("lipapap_client_key", "LIPAPAP_CLIENT_KEY"),
    getConfiguredValue("lipapap_secret_key", "LIPAPAP_SECRET_KEY"),
    getConfiguredValue("lipapap_payment_url", "LIPAPAP_PAYMENT_URL"),
    storage.getSetting("lipapap_environment"),
    getConfiguredValue("lipapap_payer_email", "LIPAPAP_PAYER_EMAIL"),
  ]);
  if (!clientKey || !secretKey || !paymentUrl) return undefined;
  return {
    clientKey,
    secretKey,
    paymentUrl,
    environment: environment === "production" ? "production" : "sandbox",
    action: "MOMO",
    networkIds: {},
    payoutProviderCodes: {},
    payerEmail,
  };
}

async function getSeaPayCredentials(country: string): Promise<{ merchantId?: string; apiKey?: string }> {
  const slug = country.trim().toLowerCase().replace(/[^a-z]/g, "");
  const envPrefix = `SEAPAY_${country.trim().toUpperCase().replace(/[^A-Z]/g, "")}`;
  const [merchantId, apiKey] = await Promise.all([
    getConfiguredValue(`seapay_merchant_id_${slug}`, `${envPrefix}_MERCHANT_ID`),
    getConfiguredValue(`seapay_api_key_${slug}`, `${envPrefix}_API_KEY`),
  ]);
  return { merchantId, apiKey };
}

export async function checkPaymentProviderStatus(
  payment: ManualPaymentRecord,
): Promise<PaymentProviderStatusResult> {
  const gateway = normalizeGateway(payment.gateway);
  const provider = PROVIDER_LABELS[gateway] || payment.gateway || "Fournisseur inconnu";
  if (!PROVIDER_LABELS[gateway]) {
    return { provider, status: "Vérification fournisseur non prise en charge" };
  }

  const reference = payment.providerReference || payment.providerTxId || "";
  if (!reference) return { provider, status: "Aucune référence fournisseur disponible" };

  try {
    if (gateway === "mbiyo") {
      const apiKey = await getConfiguredValue("mbiyo_api_key", "MBIYO_API_KEY");
      if (!apiKey) return { provider, status: "Configuration fournisseur indisponible" };
      const result = await mbiyoGetTransactionStatus(apiKey, reference);
      return { provider, status: String(result.data?.status || result.status || "inconnu") };
    }

    if (gateway === "clapay") {
      if (!/^CP/i.test(reference)) {
        return { provider, status: "Référence historique non interrogeable" };
      }
      const apiKey = await getConfiguredValue("clapay_api_key", "CLAPAY_API_KEY");
      if (!apiKey) return { provider, status: "Configuration fournisseur indisponible" };
      const result = await clapayGetTransactionStatus(apiKey, payment.providerTxId || reference);
      return {
        provider,
        status: String(result.status || "inconnu"),
        ...(result.message ? { message: result.message } : {}),
      };
    }

    if (gateway === "seapay") {
      const { merchantId, apiKey } = await getSeaPayCredentials(payment.country);
      if (!merchantId || !apiKey) return { provider, status: "Configuration fournisseur indisponible" };
      const currency = SEAPAY_CURRENCY_COUNTRY[payment.country] || "USD";
      const result = await seapayQuery(merchantId, reference, currency, apiKey);
      return {
        provider,
        status: String(result.data?.status || result.msg || "inconnu"),
      };
    }

    if (gateway === "lipapap") {
      const config = await getLipaPapStatusConfig();
      if (!config) return { provider, status: "Configuration fournisseur indisponible" };
      const result = await getLipaPapTransactionStatus(config, payment.providerTxId || reference);
      return { provider, status: String(result.status || result.result || "inconnu") };
    }

    const providerReference = payment.providerTxId;
    if (!providerReference) {
      return { provider, status: "Référence fournisseur absente; attente de confirmation fournisseur" };
    }
    const config = await getDrimpayConfig();
    if (!config) return { provider, status: "Configuration fournisseur indisponible" };
    const result = await getDrimpayPayinStatus(config, providerReference);
    return { provider, status: normalizeDrimpayStatus(result) || "inconnu" };
  } catch (error: any) {
    return {
      provider,
      status: "Échec de vérification",
      message: String(error?.message || "Erreur fournisseur").slice(0, 250),
    };
  }
}
