/**
 * Job de réconciliation automatique
 * Vérifie toutes les 5 minutes les paiements bloqués "omnipay_pending"
 * depuis plus de 3 minutes et les crédite si le prestataire les confirme.
 */

import { storage } from "./storage";
import { getPaymentStatus as sendavaGetStatus, getWithdrawalStatus as sendavaGetWithdrawalStatus } from "./sendavapay";
import { notifyMerchantPayment, notifyAdminPayment, notifyAdminWithdrawal, notifyMerchantWithdrawal } from "./telegram-bot";

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

/**
 * Polling immédiat pour un retrait SendavaPay.
 * Appelé juste après l'initiation — vérifie toutes les 30s jusqu'à 10 min.
 * Si le retrait est déjà traité par le webhook entre-temps, la fonction détecte
 * que le statut n'est plus "pending" et s'arrête.
 */
export async function pollSendavaWithdrawalBackground(params: {
  withdrawalId: number;
  sendavaRef: string;
  merchantId: number;
  country: string;
  amount: number;
  fees: number;
  phone: string;
  operator: string | null;
}): Promise<void> {
  const { withdrawalId, sendavaRef, merchantId, country, amount, fees, phone, operator } = params;
  const apiKey = await getSendavaKey();
  if (!apiKey) return;

  const INTERVAL_MS = 30_000; // 30 secondes
  const MAX_ATTEMPTS = 20;    // 20 × 30s = 10 minutes max
  const SUCCESS_STATUSES = ["completed", "success", "approved", "paid", "sent", "transferred"];
  const FAILURE_STATUSES = ["failed", "failure", "cancelled", "canceled", "rejected"];

  console.log(`[POLL-WD] Démarrage polling retrait #${withdrawalId} — ref=${sendavaRef}`);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));

    try {
      // Vérifier si déjà traité par le webhook
      const current = await storage.getWithdrawalById(withdrawalId);
      if (!current || current.status !== "pending") {
        console.log(`[POLL-WD] Retrait #${withdrawalId} déjà traité (statut: ${current?.status}) — arrêt polling`);
        return;
      }

      const result = await sendavaGetWithdrawalStatus(apiKey, sendavaRef);
      const status = (result.data?.status || "").toLowerCase();
      console.log(`[POLL-WD] Retrait #${withdrawalId} tentative ${attempt}/${MAX_ATTEMPTS} — statut SendavaPay: ${status || "inconnu"}`);

      if (SUCCESS_STATUSES.includes(status)) {
        const merchant = await storage.getMerchantById(merchantId);
        await storage.updateWithdrawalStatus(withdrawalId, "approved", `Retrait confirmé (polling ${attempt * 30}s)`, sendavaRef, fees, fees);
        notifyAdminWithdrawal({ id: withdrawalId, merchantName: merchant?.name || `#${merchantId}`, country, amount, fees, phone, operator, status: "approved", mode: "auto" }).catch(() => {});
        notifyMerchantWithdrawal(merchantId, { id: withdrawalId, country, amount, fees, phone, operator, status: "approved" }).catch(() => {});
        console.log(`[POLL-WD] Retrait #${withdrawalId} approuvé après ${attempt * 30}s — ref=${sendavaRef}`);
        return;
      }

      if (FAILURE_STATUSES.includes(status)) {
        const merchant = await storage.getMerchantById(merchantId);
        await storage.updateWithdrawalStatus(withdrawalId, "failed", `Retrait refusé (polling ${attempt * 30}s: ${status})`, sendavaRef);
        const mc = await storage.findMerchantCountryBySimAndCountry(merchantId, country);
        if (mc) await storage.incrementMerchantCountryBalance(mc.id, amount);
        notifyAdminWithdrawal({ id: withdrawalId, merchantName: merchant?.name || `#${merchantId}`, country, amount, fees: 0, phone, operator, status: "failed", mode: "auto" }).catch(() => {});
        notifyMerchantWithdrawal(merchantId, { id: withdrawalId, country, amount, fees: 0, phone, operator, status: "failed" }).catch(() => {});
        console.log(`[POLL-WD] Retrait #${withdrawalId} échoué après ${attempt * 30}s — ref=${sendavaRef} statut=${status}`);
        return;
      }
    } catch (err: any) {
      console.error(`[POLL-WD] Erreur polling retrait #${withdrawalId} tentative ${attempt}:`, err.message);
    }
  }

  console.log(`[POLL-WD] Timeout polling retrait #${withdrawalId} (${MAX_ATTEMPTS * INTERVAL_MS / 60000}min) — la réconciliation prendra le relais`);
}

async function reconcileStaleWithdrawals(): Promise<void> {
  try {
    const apiKey = await getSendavaKey();
    if (!apiKey) return;

    const now = Date.now();
    const TWO_MIN = 2 * 60 * 1000;
    const SIX_HOURS = 6 * 60 * 60 * 1000;

    const staleWithdrawals = await storage.getPendingWithdrawals?.() || [];
    const sendavaStale = staleWithdrawals.filter((w: any) => {
      if (w.status !== "pending") return false;
      if (w.gateway !== "sendavapay") return false;
      if (!w.omnipayRef) return false;
      const age = now - new Date(w.createdAt).getTime();
      return age >= TWO_MIN && age < SIX_HOURS;
    });

    if (sendavaStale.length === 0) return;
    console.log(`[RECONCILIATION-WD] ${sendavaStale.length} retrait(s) SendavaPay bloqué(s) >2min — vérification...`);

    for (const wd of sendavaStale) {
      try {
        const result = await sendavaGetWithdrawalStatus(apiKey, wd.omnipayRef);
        const status = (result.data?.status || "").toLowerCase();
        const merchant = await storage.getMerchantById(wd.merchantId);

        if (["completed", "success", "approved", "paid", "sent", "transferred"].includes(status)) {
          const fees = wd.fees || 0;
          await storage.updateWithdrawalStatus(wd.id, "approved", `Retrait confirmé (réconciliation)`, wd.omnipayRef, fees, fees);
          notifyAdminWithdrawal({ id: wd.id, merchantName: merchant?.name || `#${wd.merchantId}`, country: wd.country, amount: wd.amount, fees, phone: wd.phone, operator: wd.operator, status: "approved", mode: "auto" }).catch(() => {});
          notifyMerchantWithdrawal(wd.merchantId, { id: wd.id, country: wd.country, amount: wd.amount, fees, phone: wd.phone, operator: wd.operator, status: "approved" }).catch(() => {});
          console.log(`[RECONCILIATION-WD] Retrait #${wd.id} approuvé — ref=${wd.omnipayRef}`);
        } else if (["failed", "failure", "cancelled", "canceled", "rejected"].includes(status)) {
          await storage.updateWithdrawalStatus(wd.id, "failed", `Retrait refusé (réconciliation: ${status})`, wd.omnipayRef);
          const mc = await storage.findMerchantCountryBySimAndCountry(wd.merchantId, wd.country);
          if (mc) await storage.incrementMerchantCountryBalance(mc.id, wd.amount);
          notifyAdminWithdrawal({ id: wd.id, merchantName: merchant?.name || `#${wd.merchantId}`, country: wd.country, amount: wd.amount, fees: 0, phone: wd.phone, operator: wd.operator, status: "failed", mode: "auto" }).catch(() => {});
          notifyMerchantWithdrawal(wd.merchantId, { id: wd.id, country: wd.country, amount: wd.amount, fees: 0, phone: wd.phone, operator: wd.operator, status: "failed" }).catch(() => {});
          console.log(`[RECONCILIATION-WD] Retrait #${wd.id} échoué — ref=${wd.omnipayRef} status=${status}`);
        } else {
          console.log(`[RECONCILIATION-WD] Retrait #${wd.id} en cours — ref=${wd.omnipayRef} status=${status || "inconnu"}`);
        }
      } catch (err: any) {
        console.error(`[RECONCILIATION-WD] Erreur retrait #${wd.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error("[RECONCILIATION-WD] Erreur globale:", err.message);
  }
}

export async function runReconciliation(): Promise<void> {
  // Run withdrawal reconciliation in parallel
  reconcileStaleWithdrawals().catch(() => {});

  try {
    const allPending = await storage.getPendingPayments();
    const now = Date.now();
    const THREE_MIN = 3 * 60 * 1000;
    const FOUR_HOURS = 4 * 60 * 60 * 1000;

    const stale = allPending.filter(p => {
      if (p.status !== "omnipay_pending") return false;
      if (!p.omnipayReference) return false;
      const age = now - new Date(p.createdAt).getTime();
      return age >= THREE_MIN && age < FOUR_HOURS;
    });

    if (stale.length === 0) return;
    console.log(`[RECONCILIATION] ${stale.length} paiement(s) bloqué(s) >3min — vérification...`);

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
            const failTxId = `SP-${pending.omnipayReference}`;
            const existing = await storage.getTransactionByTxId(failTxId);
            if (!existing) {
              storage.createTransaction({
                merchantId: pending.merchantId,
                country: pending.country,
                txId: failTxId,
                amount: pending.amount,
                payerNumber: pending.payerPhone || null,
                payerName: pending.payerName || null,
                status: "failed",
                provider: "westpay",
                omnipayTxId: null,
                operator: pending.paymentMethod || null,
                omnipayReference: pending.omnipayReference || null,
                errorMessage: `Paiement ${status} (réconciliation)`,
                providerFee: 0,
              }).catch(() => {});
            }
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
