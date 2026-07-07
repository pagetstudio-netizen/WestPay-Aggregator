/**
 * Job de réconciliation automatique
 * Vérifie toutes les 5 minutes les paiements bloqués "omnipay_pending"
 * depuis plus de 3 minutes et les crédite si le prestataire les confirme.
 */

import { storage } from "./storage";
import { getPaymentStatus as sendavaGetStatus, getWithdrawalStatus as sendavaGetWithdrawalStatus } from "./sendavapay";
import { getTransactionStatus as omnipayGetStatus } from "./omnipay";
import { getTransactionStatus as mbiyoGetStatus } from "./mbiyo";
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

async function getOmnipayPayoutKey(): Promise<string | undefined> {
  return (
    process.env.OMNIPAY_PAYOUT_API_KEY ||
    await storage.getSetting("omnipay_payout_api_key") ||
    process.env.OMNIPAY_API_KEY ||
    await storage.getSetting("omnipay_api_key")
  );
}

async function getMbiyoKey(): Promise<string | undefined> {
  return process.env.MBIYO_API_KEY || await storage.getSetting("mbiyo_api_key");
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

  // Intervalles progressifs : on vérifie très vite au début (l'argent arrive souvent
  // en quelques secondes chez l'opérateur), puis on espace les vérifications.
  // Total ~10 minutes de couverture avant que le job de fond ne prenne le relais.
  const INTERVALS_MS = [
    3_000, 3_000, 4_000, 5_000, 5_000,   // 0-20s : vérifications rapprochées
    10_000, 10_000, 10_000,               // 20-50s
    15_000, 15_000, 15_000, 15_000,       // 50s-110s
    30_000, 30_000, 30_000, 30_000,       // 110s-230s
    60_000, 60_000, 60_000, 60_000, 60_000, // jusqu'à ~10min
  ];
  const SUCCESS_STATUSES = ["completed", "success", "approved", "paid", "sent", "transferred", "processed", "delivered", "confirmed", "done", "ok"];
  const FAILURE_STATUSES = ["failed", "failure", "cancelled", "canceled", "rejected", "declined", "error"];

  console.log(`[POLL-WD] Démarrage vérification retrait #${withdrawalId} — ref=${sendavaRef}`);

  let elapsedMs = 0;
  for (let attempt = 1; attempt <= INTERVALS_MS.length; attempt++) {
    const waitMs = INTERVALS_MS[attempt - 1];
    await new Promise(resolve => setTimeout(resolve, waitMs));
    elapsedMs += waitMs;

    try {
      // Vérifier si déjà traité par le webhook entre-temps
      const current = await storage.getWithdrawalById(withdrawalId);
      if (!current || current.status !== "pending") {
        console.log(`[POLL-WD] Retrait #${withdrawalId} déjà traité (statut: ${current?.status}) — arrêt vérification`);
        return;
      }

      const result = await sendavaGetWithdrawalStatus(apiKey, sendavaRef);
      const status = (result.data?.status || "").toLowerCase();
      console.log(`[POLL-WD] Retrait #${withdrawalId} tentative ${attempt}/${INTERVALS_MS.length} (${Math.round(elapsedMs / 1000)}s) — statut fournisseur: ${status || "inconnu"}`);

      if (SUCCESS_STATUSES.includes(status)) {
        const merchant = await storage.getMerchantById(merchantId);
        await storage.updateWithdrawalStatus(withdrawalId, "approved", `Retrait confirmé`, sendavaRef, fees, fees);
        notifyAdminWithdrawal({ id: withdrawalId, merchantName: merchant?.name || `#${merchantId}`, country, amount, fees, phone, operator, status: "approved", mode: "auto" }).catch(() => {});
        notifyMerchantWithdrawal(merchantId, { id: withdrawalId, country, amount, fees, phone, operator, status: "approved" }).catch(() => {});
        console.log(`[POLL-WD] Retrait #${withdrawalId} approuvé après ${Math.round(elapsedMs / 1000)}s — ref=${sendavaRef}`);
        return;
      }

      if (FAILURE_STATUSES.includes(status)) {
        const merchant = await storage.getMerchantById(merchantId);
        await storage.updateWithdrawalStatus(withdrawalId, "failed", `Retrait refusé (${status})`, sendavaRef);
        const mc = await storage.findMerchantCountryBySimAndCountry(merchantId, country);
        if (mc) await storage.incrementMerchantCountryBalance(mc.id, amount);
        notifyAdminWithdrawal({ id: withdrawalId, merchantName: merchant?.name || `#${merchantId}`, country, amount, fees: 0, phone, operator, status: "failed", mode: "auto" }).catch(() => {});
        notifyMerchantWithdrawal(merchantId, { id: withdrawalId, country, amount, fees: 0, phone, operator, status: "failed" }).catch(() => {});
        console.log(`[POLL-WD] Retrait #${withdrawalId} échoué après ${Math.round(elapsedMs / 1000)}s — ref=${sendavaRef} statut=${status}`);
        return;
      }
    } catch (err: any) {
      console.error(`[POLL-WD] Erreur vérification retrait #${withdrawalId} tentative ${attempt}:`, err.message);
    }
  }

  console.log(`[POLL-WD] Fin de la vérification rapprochée pour le retrait #${withdrawalId} (${Math.round(elapsedMs / 60000)}min) — le job de fond prendra le relais`);
}

const WD_SUCCESS = ["completed", "success", "approved", "paid", "sent", "transferred", "processed", "delivered", "confirmed", "done", "ok"];
const WD_FAILURE = ["failed", "failure", "cancelled", "canceled", "rejected", "declined", "error"];

async function applyWithdrawalResult(wd: any, status: string, ref: string): Promise<void> {
  const merchant = await storage.getMerchantById(wd.merchantId);
  if (WD_SUCCESS.includes(status)) {
    const fees = wd.fees || 0;
    await storage.updateWithdrawalStatus(wd.id, "approved", `Retrait confirmé`, ref, fees, fees);
    notifyAdminWithdrawal({ id: wd.id, merchantName: merchant?.name || `#${wd.merchantId}`, country: wd.country, amount: wd.amount, fees, phone: wd.phone, operator: wd.operator, status: "approved", mode: "auto" }).catch(() => {});
    notifyMerchantWithdrawal(wd.merchantId, { id: wd.id, country: wd.country, amount: wd.amount, fees, phone: wd.phone, operator: wd.operator, status: "approved" }).catch(() => {});
    console.log(`[RECONCILIATION-WD] Retrait #${wd.id} approuvé (${wd.gateway || "omnipay"}) — ref=${ref}`);
  } else if (WD_FAILURE.includes(status)) {
    await storage.updateWithdrawalStatus(wd.id, "failed", `Retrait refusé (${status})`, ref);
    const mc = await storage.getMerchantCountryById(wd.merchantCountryId);
    if (mc) await storage.incrementMerchantCountryBalance(mc.id, wd.amount);
    notifyAdminWithdrawal({ id: wd.id, merchantName: merchant?.name || `#${wd.merchantId}`, country: wd.country, amount: wd.amount, fees: 0, phone: wd.phone, operator: wd.operator, status: "failed", mode: "auto" }).catch(() => {});
    notifyMerchantWithdrawal(wd.merchantId, { id: wd.id, country: wd.country, amount: wd.amount, fees: 0, phone: wd.phone, operator: wd.operator, status: "failed" }).catch(() => {});
    console.log(`[RECONCILIATION-WD] Retrait #${wd.id} échoué (${wd.gateway || "omnipay"}) — ref=${ref} status=${status}`);
  } else {
    console.log(`[RECONCILIATION-WD] Retrait #${wd.id} en cours (${wd.gateway || "omnipay"}) — ref=${ref} status=${status || "inconnu"}`);
  }
}

async function reconcileStaleWithdrawals(): Promise<void> {
  try {
    const now = Date.now();
    const ONE_MIN = 60 * 1000;
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    const allPending = await storage.getPendingWithdrawals?.() || [];
    const stale = allPending.filter((w: any) => {
      if (w.status !== "pending") return false;
      if (!w.omnipayRef) return false;
      const age = now - new Date(w.createdAt).getTime();
      return age >= ONE_MIN && age < TWENTY_FOUR_HOURS;
    });

    if (stale.length === 0) return;
    console.log(`[RECONCILIATION-WD] ${stale.length} retrait(s) bloqué(s) >1min — vérification (sendavapay/omnipay/mbiyo)...`);

    // ── SendavaPay ──────────────────────────────────────────────────────────
    const sendavaStale = stale.filter((w: any) => w.gateway === "sendavapay");
    if (sendavaStale.length > 0) {
      const apiKey = await getSendavaKey();
      if (!apiKey) {
        console.warn("[RECONCILIATION-WD][sendavapay] Clé API non configurée — réconciliation ignorée");
      } else {
        for (const wd of sendavaStale) {
          try {
            const ageMin = Math.round((now - new Date(wd.createdAt).getTime()) / 60000);
            const result = await sendavaGetWithdrawalStatus(apiKey, wd.omnipayRef);
            const status = (result.data?.status || "").toLowerCase();
            console.log(`[RECONCILIATION-WD][sendavapay] Retrait #${wd.id} (${ageMin}min) ref=${wd.omnipayRef} → API success=${result.success} status="${status || "vide"}" rawData=${JSON.stringify(result.data || result)}`);
            if (!status && !result.success) {
              console.warn(`[RECONCILIATION-WD][sendavapay] ⚠️ Réponse API inattendue pour retrait #${wd.id}: ${JSON.stringify(result)}`);
            }
            await applyWithdrawalResult(wd, status, wd.omnipayRef);
          } catch (err: any) {
            console.error(`[RECONCILIATION-WD][sendavapay] Erreur retrait #${wd.id} ref=${wd.omnipayRef}:`, err.message);
          }
        }
      }
    }

    // ── OmniPay ─────────────────────────────────────────────────────────────
    // Les retraits OmniPay ont gateway=null/"" ou gateway="omnipay"
    const omnipayStale = stale.filter((w: any) => !w.gateway || w.gateway === "omnipay");
    if (omnipayStale.length > 0) {
      const apiKey = await getOmnipayPayoutKey();
      if (apiKey) {
        for (const wd of omnipayStale) {
          try {
            const result = await omnipayGetStatus(apiKey, wd.omnipayRef) as any;
            const status = String(result?.status || result?.data?.status || "").toLowerCase();
            await applyWithdrawalResult(wd, status, wd.omnipayRef);
          } catch (err: any) {
            console.error(`[RECONCILIATION-WD][omnipay] Erreur retrait #${wd.id}:`, err.message);
          }
        }
      }
    }

    // ── Mbiyo ───────────────────────────────────────────────────────────────
    const mbiyoStale = stale.filter((w: any) => w.gateway === "mbiyo");
    if (mbiyoStale.length > 0) {
      const apiKey = await getMbiyoKey();
      if (apiKey) {
        for (const wd of mbiyoStale) {
          try {
            const result = await mbiyoGetStatus(apiKey, wd.omnipayRef) as any;
            const status = String(result?.data?.status || result?.status || "").toLowerCase();
            await applyWithdrawalResult(wd, status, wd.omnipayRef);
          } catch (err: any) {
            console.error(`[RECONCILIATION-WD][mbiyo] Erreur retrait #${wd.id}:`, err.message);
          }
        }
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
