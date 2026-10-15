import crypto from "crypto";
import { lookup } from "node:dns/promises";
import * as http from "node:http";
import * as https from "node:https";
import { BlockList, isIP } from "node:net";
import { storage } from "./storage";

const blockedIpv4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) {
  blockedIpv4.addSubnet(network, prefix, "ipv4");
}

const globalIpv6 = new BlockList();
globalIpv6.addSubnet("2000::", 3, "ipv6");

const blockedIpv6 = new BlockList();
for (const [network, prefix] of [
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20],
] as const) {
  blockedIpv6.addSubnet(network, prefix, "ipv6");
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

function isPublicIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blockedIpv4.check(address, "ipv4");
  if (family === 6) return globalIpv6.check(address, "ipv6") && !blockedIpv6.check(address, "ipv6");
  return false;
}

/**
 * Validate syntax synchronously when a webhook URL is saved. Network requests
 * also resolve and pin the address in requestPublicWebhook to prevent DNS rebinding.
 */
export function assertPublicWebhookUrl(url: string): void {
  if (typeof url !== "string" || url.length === 0 || url.length > 2048) {
    throw new Error("URL webhook invalide");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL webhook invalide");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Protocole webhook non autorise: ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error("Les identifiants intégrés dans une URL webhook ne sont pas autorisés");
  }
  if (parsed.port && parsed.port !== "80" && parsed.port !== "443") {
    throw new Error("Les webhooks sont limités aux ports publics 80 et 443");
  }
  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("URL webhook vers une adresse locale/interne interdite");
  }
  if (isIP(hostname) && !isPublicIp(hostname)) {
    throw new Error("URL webhook vers une adresse privée ou réservée interdite");
  }
}

/**
 * Send a webhook without following redirects or resolving the hostname twice.
 * All DNS answers must be public, and the connection is pinned to one checked IP.
 */
export async function requestPublicWebhook(
  url: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs = 10_000,
): Promise<{ statusCode: number; response: string }> {
  assertPublicWebhookUrl(url);
  const parsed = new URL(url);
  const hostname = normalizeHostname(parsed.hostname);
  const family = isIP(hostname);
  const addresses = family
    ? [{ address: hostname, family }]
    : await lookup(hostname, { all: true, verbatim: true });

  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new Error("URL webhook résolue vers une adresse privée ou réservée");
  }

  const pinnedAddress = addresses[0];
  const isHttps = parsed.protocol === "https:";
  const requestOptions = {
    hostname: pinnedAddress.address,
    family: pinnedAddress.family,
    port: Number(parsed.port) || (isHttps ? 443 : 80),
    method: "POST",
    path: `${parsed.pathname || "/"}${parsed.search}`,
    headers: {
      ...headers,
      host: parsed.host,
      "content-length": String(Buffer.byteLength(body)),
      connection: "close",
    },
    agent: false,
    ...(isHttps && !family ? { servername: hostname } : {}),
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };
    const transport = isHttps ? https : http;
    const request = transport.request(requestOptions as any, (response) => {
      const chunks: Buffer[] = [];
      let responseBytes = 0;
      response.on("data", (chunk: Buffer | string) => {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        responseBytes += data.length;
        if (responseBytes > 64 * 1024) {
          request.destroy(new Error("Webhook response too large"));
          return;
        }
        chunks.push(data);
      });
      response.on("end", () => finish(() => resolve({
        statusCode: response.statusCode || 0,
        response: Buffer.concat(chunks).toString("utf8"),
      })));
      response.on("error", (error) => finish(() => reject(error)));
    });
    request.on("error", (error) => finish(() => reject(error)));
    request.setTimeout(timeoutMs, () => request.destroy(new Error("Webhook timeout")));
    request.end(body);
  });
}

export async function sendWebhookNotification(
  merchantId: number,
  payload: Record<string, any>,
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  try {
    const merchant = await storage.getMerchantById(merchantId);
    if (!merchant?.webhookUrl) return { success: false, error: "Aucune URL webhook configuree" };

    const payloadStr = JSON.stringify(payload);
    const signature = merchant.webhookSecret
      ? crypto.createHmac("sha256", merchant.webhookSecret).update(payloadStr).digest("hex")
      : "";

    try {
      const result = await requestPublicWebhook(merchant.webhookUrl, payloadStr, {
          "Content-Type": "application/json",
          "X-RobotPay-Signature": signature,
          "X-RobotPay-Event": payload.event || "payment.confirmed",
      });

      const success = result.statusCode >= 200 && result.statusCode < 300;
      await storage.createWebhookLog({
        merchantId,
        url: merchant.webhookUrl,
        payload: payloadStr,
        statusCode: result.statusCode,
        response: result.response.substring(0, 500),
        success,
      });
      console.log(`[WEBHOOK] ${success ? "Succes" : "Echec"} pour marchand #${merchantId}: ${result.statusCode}`);
      return { success, statusCode: result.statusCode };
    } catch (fetchError: any) {
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