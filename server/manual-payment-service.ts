import { financialPool } from "./db";
import { storage } from "./storage";
import { calcMerchantCreditForMerchant } from "./payment-fees";

export type ManualPaymentRecord = {
  id: number;
  merchantId: number;
  country: string;
  amount: number;
  payerPhone: string | null;
  payerName: string | null;
  paymentMethod: string;
  txId: string | null;
  providerReference: string | null;
  status: string;
  manualRecipientPhone: string | null;
  manualUssdCode?: string | null;
  manualInstructions?: string | null;
  manualSubmission?: string | null;
  manualSubmittedAt?: Date | string | null;
  createdAt?: Date | string;
};

export type ManualReviewResult = {
  outcome: "approved" | "already_approved" | "rejected" | "already_rejected" | "not_found" | "not_submitted";
  payment?: ManualPaymentRecord;
  merchant?: Awaited<ReturnType<typeof storage.getMerchantById>>;
  credit?: number;
};

function mapPayment(row: any): ManualPaymentRecord {
  return {
    id: Number(row.id),
    merchantId: Number(row.merchant_id),
    country: String(row.country),
    amount: Number(row.amount),
    payerPhone: row.payer_phone ?? null,
    payerName: row.payer_name ?? null,
    paymentMethod: String(row.payment_method || ""),
    txId: row.tx_id ?? null,
    providerReference: row.provider_reference ?? null,
    status: String(row.status || ""),
    manualRecipientPhone: row.manual_recipient_phone ?? null,
    manualUssdCode: row.manual_ussd_code ?? null,
    manualInstructions: row.manual_instructions ?? null,
    manualSubmission: row.manual_submission ?? null,
    manualSubmittedAt: row.manual_submitted_at ?? null,
    createdAt: row.created_at,
  };
}

export async function submitManualPaymentProof(
  id: number,
  paymentToken: string,
  proof: string,
): Promise<{ outcome: "submitted" | "already_submitted" | "not_found" | "expired" | "already_final"; payment?: ManualPaymentRecord }> {
  const normalizedProof = proof.trim();
  if (!normalizedProof || normalizedProof.length > 120) {
    throw new Error("La référence de transaction doit contenir entre 1 et 120 caractères.");
  }

  const { rows } = await financialPool.query(
    `UPDATE pending_payments
       SET status = 'manual_submitted',
           manual_submission = $3,
           manual_submitted_at = NOW()
     WHERE id = $1
       AND payment_token = $2
       AND gateway = 'manual'
       AND status = 'manual_waiting_submission'
       AND expires_at > NOW()
     RETURNING *`,
    [id, paymentToken, normalizedProof],
  );
  if (rows[0]) return { outcome: "submitted", payment: mapPayment(rows[0]) };

  const existing = await financialPool.query(
    `SELECT * FROM pending_payments
      WHERE id = $1 AND payment_token = $2 AND gateway = 'manual'
      LIMIT 1`,
    [id, paymentToken],
  );
  const row = existing.rows[0];
  if (!row) return { outcome: "not_found" };
  if (row.status === "manual_submitted") return { outcome: "already_submitted", payment: mapPayment(row) };
  if (["confirmed", "manual_rejected"].includes(String(row.status))) {
    return { outcome: "already_final", payment: mapPayment(row) };
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) return { outcome: "expired", payment: mapPayment(row) };
  return { outcome: "not_found" };
}

export async function reviewManualPayment(
  id: number,
  reviewer: string,
  action: "approve" | "reject",
): Promise<ManualReviewResult> {
  const client = await financialPool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query(
      "SELECT * FROM pending_payments WHERE id = $1 AND gateway = 'manual' FOR UPDATE",
      [id],
    );
    const row = selected.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { outcome: "not_found" };
    }

    const payment = mapPayment(row);
    if (action === "approve" && ["confirmed", "completed", "paid"].includes(payment.status)) {
      await client.query("COMMIT");
      return { outcome: "already_approved", payment };
    }
    if (action === "reject" && payment.status === "manual_rejected") {
      await client.query("COMMIT");
      return { outcome: "already_rejected", payment };
    }
    if (payment.status !== "manual_submitted") {
      await client.query("ROLLBACK");
      return { outcome: "not_submitted", payment };
    }

    const safeReviewer = reviewer.trim().slice(0, 160) || "admin";
    if (action === "reject") {
      const rejected = await client.query(
        `UPDATE pending_payments
            SET status = 'manual_rejected', manual_reviewed_by = $2, manual_reviewed_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [id, safeReviewer],
      );
      await client.query("COMMIT");
      return { outcome: "rejected", payment: mapPayment(rejected.rows[0]) };
    }

    const merchant = await storage.getMerchantById(payment.merchantId);
    if (!merchant) throw new Error("Le marchand associé à ce paiement est introuvable.");

    const merchantCountry = await client.query(
      `SELECT id FROM merchant_countries
        WHERE merchant_id = $1 AND LOWER(country) = LOWER($2)
        LIMIT 1 FOR UPDATE`,
      [payment.merchantId, payment.country],
    );
    const merchantCountryId = merchantCountry.rows[0]?.id;
    if (!merchantCountryId) throw new Error("Le pays de ce marchand n’est plus configuré; aucun solde n’a été modifié.");

    const txId = String(payment.txId || payment.providerReference || "").trim();
    if (!txId) throw new Error("Référence de transaction manquante; le paiement reste en attente.");
    const credit = calcMerchantCreditForMerchant(payment.amount, payment.country, merchant);

    await client.query(
      `INSERT INTO transactions
         (merchant_id, country, tx_id, amount, payer_number, payer_name, status, provider,
          provider_tx_id, operator, provider_reference, error_message, provider_fee)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', 'mobile_money', NULL, $7, $8, NULL, $9)`,
      [
        payment.merchantId,
        payment.country,
        txId,
        payment.amount,
        payment.payerPhone,
        payment.payerName,
        payment.paymentMethod,
        payment.providerReference || txId,
        payment.amount - credit,
      ],
    );
    await client.query(
      "UPDATE merchant_countries SET balance = balance + $2 WHERE id = $1",
      [merchantCountryId, credit],
    );
    const confirmed = await client.query(
      `UPDATE pending_payments
          SET status = 'confirmed', manual_reviewed_by = $2, manual_reviewed_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, safeReviewer],
    );
    await client.query("COMMIT");
    return { outcome: "approved", payment: mapPayment(confirmed.rows[0]), merchant, credit };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function searchManualPaymentsByNumber(search: string): Promise<ManualPaymentRecord[]> {
  const digits = search.replace(/\D/g, "");
  if (digits.length < 3) throw new Error("Saisissez au moins trois chiffres du numéro.");
  const { rows } = await financialPool.query(
    `SELECT *
       FROM pending_payments
      WHERE gateway = 'manual'
        AND status = 'manual_submitted'
        AND (
          regexp_replace(COALESCE(manual_recipient_phone, ''), '[^0-9]', '', 'g') LIKE '%' || $1 || '%'
          OR regexp_replace(COALESCE(payer_phone, ''), '[^0-9]', '', 'g') LIKE '%' || $1 || '%'
        )
      ORDER BY created_at DESC
      LIMIT 10`,
    [digits],
  );
  return rows.map(mapPayment);
}