import crypto from "crypto";
import { storage } from "./storage";

/**
 * SSRF guard: webhook destinations must be public HTTP(S) URLs.
 */
export function assertPublicWebhookUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`URL webhook invalide: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Protocole webhook non autorise: ${parsed.protocol}`);
  }
  const hostname = parsed.hostname.toLowerCase();
  const blocked = [
    /^localhost$/,
    /^127\./,
    /^0\.0\.0\.0$/,
    /^::1$/,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
    /^fc00:/i,
    /^fe80:/i,
    /^metadata\.google\.internal$/,
    /^169\.254\.169\.254$/,
  ];
  for (const pattern of blocked) {
    if (pattern.test(hostname)) {
      throw new Error(`URL webhook pointe vers une adresse privee/interne: ${hostname}`);
    }
  }
}

export async function sendWebhookNotification(
  merchantId: number,
  payload: Record<string, any>,
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  try {
    const merchant = await storage.getMerchantById(merchantId);
    if (!merchant?.webhookUrl) return { success: false, error: "Aucune URL webhook configuree" };

    assertPublicWebhookUrl(merchant.webhookUrl);
    const payloadStr = JSON.stringify(payload);
    const signature = merchant.webhookSecret
      ? crypto.createHmac("sha256", merchant.webhookSecret).update(payloadStr).digest("hex")
      : "";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(merchant.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RobotPay-Signature": signature,
          "X-RobotPay-Event": payload.event || "payment.confirmed",
        },
        body: payloadStr,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const responseText = await response.text().catch(() => "");
      const success = response.status >= 200 && response.status < 300;
      await storage.createWebhookLog({
        merchantId,
        url: merchant.webhookUrl,
        payload: payloadStr,
        statusCode: response.status,
        response: responseText.substring(0, 500),
        success,
      });
      console.log(`[WEBHOOK] ${success ? "Succes" : "Echec"} pour marchand #${merchantId}: ${response.status}`);
      return { success, statusCode: response.status };
    } catch (fetchError: any) {
      clearTimeout(timeout);
      const error = fetchError.name === "AbortError" ? "Timeout (10s)" : fetchError.message;
      await storage.createWebhookLog({
        merchantId,
        url: merchant.webhookUrl,
        payload: payloadStr,
        statusCode: 0,
        response: error,
        success: false,
      });
      console.error(`[WEBHOOK] Erreur envoi pour marchand #${merchantId}:`, error);
      return { success: false, error };
    }
  } catch (error: any) {
    console.error("[WEBHOOK] Erreur generale:", error.message);
    return { success: false, error: error.message };
  }
}

const paymentWebhookInFlight = new Map<string, Promise<void>>();

/**
 * Send a confirmed-payment event once per transaction, retrying transient
 * failures while keeping the existing webhook audit log as the durable marker.
 */
export async function notifyConfirmedPaymentWebhook(
  merchantId: number,
  payload: Record<string, any>,
): Promise<void> {
  const txId = String(payload.txId || payload.reference || "");
  const event = payload.event || "payment.confirmed";
  const key = `${merchantId}:${event}:${txId}`;
  if (!txId) {
    await sendWebhookNotification(merchantId, payload);
    return;
  }

  const running = paymentWebhookInFlight.get(key);
  if (running) {
    await running;
    return;
  }

  const delivery = (async () => {
    const merchant = await storage.getMerchantById(merchantId);
    if (!merchant?.webhookUrl) return;

    try {
      const logs = await storage.getWebhookLogs(merchantId);
      const alreadyDelivered = logs.some((log) => {
        if (!log.success || log.url !== merchant.webhookUrl) return false;
        try {
          const loggedPayload = JSON.parse(log.payload);
          return loggedPayload.event === event
            && String(loggedPayload.txId || loggedPayload.reference || "") === txId;
        } catch {
          return false;
        }
      });
      if (alreadyDelivered) {
        console.log(`[WEBHOOK] Confirmation déjà livrée pour marchand #${merchantId}, TX=${txId}`);
        return;
      }
    } catch (error: any) {
      console.warn(`[WEBHOOK] Lecture idempotence impossible pour TX=${txId}: ${error.message}`);
    }

    const retryDelays = [0, 500, 1500];
    for (let attempt = 0; attempt < retryDelays.length; attempt++) {
      if (retryDelays[attempt] > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
      }
      const result = await sendWebhookNotification(merchantId, payload);
      if (result.success) {
        console.log(`[WEBHOOK] Confirmation livrée pour TX=${txId} (tentative ${attempt + 1})`);
        return;
      }
      if (attempt < retryDelays.length - 1) {
        console.warn(`[WEBHOOK] Échec livraison TX=${txId}, nouvelle tentative ${attempt + 2}/3`);
      }
    }
  })();

  paymentWebhookInFlight.set(key, delivery);
  try {
    await delivery;
  } finally {
    if (paymentWebhookInFlight.get(key) === delivery) {
      paymentWebhookInFlight.delete(key);
    }
  }
}