/**
 * Job de réconciliation automatique
 * Vérifie toutes les 5 minutes les paiements bloqués "omnipay_pending"
 * depuis plus de 15 minutes et les crédite si le prestataire les confirme.
 */

import { storage } from "./storage";
import { getPaymentStatus as sendavaGetStatus } from "./sendavapay";
import { notifyMerchantPayment, notifyAdminPayment } from "./telegram-bot";

const COLLECTION_FEE_RATE = 0.055;
const EXTRA_FEE_COUNTRIES = new Set(["Congo Brazzaville", "Congo RDC"]);

function calcCredit(amount: number, country?: string | null): number {
  const rate = country && EXTRA_FEE_COUNTRIES.has(country)
    ? COLLECTION_FEE_RATE + 0.01
    : COLLECTION_FEE_RATE;
  return Math.floor(amount * (1 - rate));
}

async function getSendavaKey(): Promise<string | undefined> {
  return (
    process.env.SENDAVA_API_KEY ||
    process.env.SENDAVAPAY_API_KEY ||
    await storage.getSetting("sendavapay_api_key")
  );
}

async function creditConfirmedPayment(pending: any, txRef: string): Promise<boolean> {
  const existing = await storage.getTransactionByTxId(txRef);
  if (existing) return false;

  const merchant = await storage.getMerchantById(pending.merchantId);
  const mc = await storage.findMerchantCountryBySimAndCountry(pending.merchantId, pending.country);
  if (!mc) {
    console.error(`[RECONCILIATION] MerchantCountry introuvable — paiement #${pending.id}`);
    return false;
  }

  const credit = merchant?.feeExempt ? pending.amount : calcCredit(pending.amount, pending.country);

  await storage.updatePendingPaymentStatus(pending.id, "omnipay_confirmed");
  await storage.incrementMerchantCountryBalance(mc.id, credit);
  await storage.createTransaction({
    merchantId: pending.merchantId,
    country: pending.country,
    txId: txRef,
    amount: pending.amount,
    payerNumber: pending.payerPhone || null,
    payerName: pending.payerName || null,
    status: "confirmed",
    provider: "westpay",
    omnipayTxId: null,
    operator: pending.paymentMethod || null,
    omnipayReference: pending.omnipayReference || null,
    errorMessage: null,
    providerFee: 0,
  });

  notifyMerchantPayment(pending.merchantId, {
    txId: txRef,
    amount: pending.amount,
    payerNumber: pending.payerPhone,
    country: pending.country,
    provider: "westpay",
  }).catch(() => {});

  notifyAdminPayment({
    txId: txRef,
    merchantName: merchant?.name || `#${pending.merchantId}`,
    payerNumber: pending.payerPhone,
    country: pending.country,
    amount: pending.amount,
    provider: "westpay",
    status: "confirmed",
  }).catch(() => {});

  return true;
}

export async function runReconciliation(): Promise<void> {
  try {
    const allPending = await storage.getPendingPayments();
    const now = Date.now();
    const FIFTEEN_MIN = 15 * 60 * 1000;
    const FOUR_HOURS = 4 * 60 * 60 * 1000;

    const stale = allPending.filter(p => {
      if (p.status !== "omnipay_pending") return false;
      if (!p.omnipayReference) return false;
      const age = now - new Date(p.createdAt).getTime();
      return age >= FIFTEEN_MIN && age < FOUR_HOURS;
    });

    if (stale.length === 0) return;
    console.log(`[RECONCILIATION] ${stale.length} paiement(s) bloqué(s) >15min — vérification...`);

    for (const pending of stale) {
      try {
        if (pending.gateway === "sendavapay") {
          const apiKey = await getSendavaKey();
          if (!apiKey) continue;

          const result = await sendavaGetStatus(apiKey, pending.omnipayReference!);
          const status = (result.data?.status || "").toLowerCase();

          if (["completed", "paid", "successful", "success", "approved"].includes(status)) {
            const txRef = `SP-${pending.omnipayReference}`;
            const credited = await creditConfirmedPayment(pending, txRef);
            console.log(
              `[RECONCILIATION] SendavaPay OK — ref=${pending.omnipayReference} montant=${pending.amount}` +
              (credited ? " — crédité" : " — déjà traité")
            );
          } else if (["failed", "failure", "cancelled", "canceled", "rejected"].includes(status)) {
            await storage.updatePendingPaymentStatus(pending.id, "omnipay_failed");
            console.log(`[RECONCILIATION] SendavaPay ECHEC — ref=${pending.omnipayReference} status=${status}`);
          } else {
            console.log(`[RECONCILIATION] SendavaPay EN COURS — ref=${pending.omnipayReference} status=${status || "inconnu"}`);
          }
        }
      } catch (err: any) {
        console.error(`[RECONCILIATION] Erreur paiement #${pending.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error("[RECONCILIATION] Erreur globale:", err.message);
  }
}

export function startReconciliationJob(intervalMs = 5 * 60 * 1000): void {
  console.log(`[RECONCILIATION] Job démarré — vérification toutes les ${intervalMs / 60000}min`);
  setTimeout(() => runReconciliation().catch(() => {}), 60_000);
  setInterval(() => runReconciliation().catch(() => {}), intervalMs);
}
