import { financialPool } from "./db";
import { storage } from "./storage";
import { calcMerchantCreditForMerchant } from "./payment-fees";
import { getPaymentReviewActions } from "./payment-review-rules";

export type ManualPaymentRecord = {
  id: number;
  source: "pending" | "transaction";
  merchantId: number;
  country: string;
  amount: number;
  payerPhone: string | null;
  payerName: string | null;
  paymentMethod: string;
  gateway: string;
  txId: string | null;
  providerTxId: string | null;
  providerReference: string | null;
  status: string;
  manualRecipientPhone: string | null;
  manualRecipientName: string | null;
  manualUssdCode?: string | null;
  manualInstructions?: string | null;
  manualSubmission?: string | null;
  manualSubmittedAt?: Date | string | null;
  createdAt?: Date | string;
};

export type ManualReviewResult = {
  outcome: "approved" | "already_approved" | "rejected" | "already_rejected" | "not_found" | "not_submitted" | "not_actionable";
  payment?: ManualPaymentRecord;
  merchant?: Awaited<ReturnType<typeof storage.getMerchantById>>;
  credit?: number;
};

function mapPayment(row: any): ManualPaymentRecord {
  return {
    id: Number(row.id),
    source: row.record_source === "transaction" ? "transaction" : "pending",
    merchantId: Number(row.merchant_id),
    country: String(row.country),
    amount: Number(row.amount),
    payerPhone: row.payer_phone ?? null,
    payerName: row.payer_name ?? null,
    paymentMethod: String(row.payment_method || ""),
    gateway: String(row.gateway || ""),
    txId: row.tx_id ?? null,
    providerTxId: row.provider_tx_id ?? null,
    providerReference: row.provider_reference ?? null,
    status: String(row.status || ""),
    manualRecipientPhone: row.manual_recipient_phone ?? null,
    manualRecipientName: row.manual_recipient_name ?? null,
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

async function reviewPendingPaymentCore(
  id: number,
  reviewer: string,
  action: "approve" | "reject",
  allowAnyGateway: boolean,
): Promise<ManualReviewResult> {
  const client = await financialPool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query(
      `SELECT * FROM pending_payments
        WHERE id = $1 ${allowAnyGateway ? "" : "AND gateway = 'manual'"}
        FOR UPDATE`,
      [id],
    );
    const row = selected.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { outcome: "not_found" };
    }

    const payment = mapPayment(row);
    const status = payment.status.toLowerCase();
    if (action === "approve" && ["confirmed", "completed", "paid"].includes(status)) {
      await client.query("COMMIT");
      return { outcome: "already_approved", payment };
    }
    if (action === "reject" && ["manual_rejected", "rejected"].includes(status)) {
      await client.query("COMMIT");
      return { outcome: "already_rejected", payment };
    }
    if (!allowAnyGateway && (payment.gateway !== "manual" || status !== "manual_submitted")) {
      await client.query("ROLLBACK");
      return { outcome: "not_submitted", payment };
    }

    const isManual = payment.gateway.toLowerCase() === "manual";
    const manualWaitingSubmission = isManual && status === "manual_waiting_submission";
    if (!getPaymentReviewActions(payment)[action]) {
      await client.query("ROLLBACK");
      return {
        outcome: manualWaitingSubmission && action === "approve" ? "not_submitted" : "not_actionable",
        payment,
      };
    }

    const safeReviewer = reviewer.trim().slice(0, 160) || "admin";
    if (action === "reject") {
      const rejectedStatus = isManual ? "manual_rejected" : "rejected";
      const rejected = await client.query(
        `UPDATE pending_payments
            SET status = $3, manual_reviewed_by = $2, manual_reviewed_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [id, safeReviewer, rejectedStatus],
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

    const txId = String(payment.txId || payment.providerReference || `WP-${payment.id}`).trim();
    const existingTx = await client.query(
      `SELECT status FROM transactions
        WHERE merchant_id = $1
          AND (
            tx_id = $2
            OR ($3::text IS NOT NULL AND provider_reference = $3)
            OR ($4::text IS NOT NULL AND provider_tx_id = $4)
          )
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE`,
      [payment.merchantId, txId, payment.providerReference, payment.providerTxId],
    );
    if (existingTx.rows[0]) {
      if (String(existingTx.rows[0].status).toLowerCase() === "confirmed") {
        await client.query(
          `UPDATE pending_payments
              SET status = 'confirmed', manual_reviewed_by = $2, manual_reviewed_at = NOW()
            WHERE id = $1`,
          [id, safeReviewer],
        );
        await client.query("COMMIT");
        return { outcome: "already_approved", payment };
      }
      await client.query("ROLLBACK");
      return { outcome: "not_actionable", payment };
    }

    const credit = calcMerchantCreditForMerchant(payment.amount, payment.country, merchant);
    const transactionProvider = isManual ? "mobile_money" : (payment.gateway || "mobile_money");

    await client.query(
      `INSERT INTO transactions
         (merchant_id, country, tx_id, amount, payer_number, payer_name, manual_recipient_name, status, provider,
          provider_tx_id, operator, provider_reference, error_message, provider_fee)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', $8, $9, $10, $11, NULL, $12)`,
      [
        payment.merchantId,
        payment.country,
        txId,
        payment.amount,
        payment.payerPhone,
        payment.payerName,
        payment.manualRecipientName,
        transactionProvider,
        payment.providerTxId,
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

export async function reviewManualPayment(
  id: number,
  reviewer: string,
  action: "approve" | "reject",
): Promise<ManualReviewResult> {
  return reviewPendingPaymentCore(id, reviewer, action, false);
}

export async function reviewPendingPayment(
  id: number,
  reviewer: string,
  action: "approve" | "reject",
): Promise<ManualReviewResult> {
  return reviewPendingPaymentCore(id, reviewer, action, true);
}

export async function reviewTransactionPayment(
  id: number,
  action: "approve" | "reject",
  options: { allowManualOverride?: boolean } = {},
): Promise<ManualReviewResult> {
  const client = await financialPool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query(
      "SELECT * FROM transactions WHERE id = $1 FOR UPDATE",
      [id],
    );
    const row = selected.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { outcome: "not_found" };
    }
    const payment = mapPayment({
      ...row,
      record_source: "transaction",
      gateway: row.provider,
      payment_method: row.operator,
      payer_phone: row.payer_number,
    });
    const status = payment.status.toLowerCase();
    const isAlreadySuccessful =
      ["confirmed", "completed", "paid", "success"].includes(status) ||
      /_(confirmed|completed|paid|success)$/.test(status);
    const isAlreadyRejected =
      ["rejected", "manual_rejected"].includes(status) ||
      /_rejected$/.test(status);
    if (action === "approve" && isAlreadySuccessful) {
      await client.query("COMMIT");
      return { outcome: "already_approved", payment };
    }
    if (action === "reject" && isAlreadyRejected) {
      await client.query("COMMIT");
      return { outcome: "already_rejected", payment };
    }
    const manualOverrideAllowed =
      action === "approve" &&
      options.allowManualOverride === true &&
      !isAlreadySuccessful &&
      !isAlreadyRejected;
    if (!getPaymentReviewActions(payment)[action] && !manualOverrideAllowed) {
      await client.query("ROLLBACK");
      return { outcome: "not_actionable", payment };
    }

    if (action === "reject") {
      const rejected = await client.query(
        `UPDATE transactions SET status = 'rejected'
          WHERE id = $1 RETURNING *`,
        [id],
      );
      await client.query("COMMIT");
      return {
        outcome: "rejected",
        payment: mapPayment({
          ...rejected.rows[0],
          record_source: "transaction",
          gateway: rejected.rows[0].provider,
          payment_method: rejected.rows[0].operator,
          payer_phone: rejected.rows[0].payer_number,
        }),
      };
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

    const credit = calcMerchantCreditForMerchant(payment.amount, payment.country, merchant);
    const confirmed = await client.query(
      `UPDATE transactions
          SET status = 'confirmed', provider_fee = COALESCE(provider_fee, $2)
        WHERE id = $1 AND status = $3
        RETURNING *`,
      [id, payment.amount - credit, payment.status],
    );
    if (!confirmed.rows[0]) {
      await client.query("ROLLBACK");
      return { outcome: "not_actionable", payment };
    }
    await client.query(
      "UPDATE merchant_countries SET balance = balance + $2 WHERE id = $1",
      [merchantCountryId, credit],
    );
    await client.query("COMMIT");
    const confirmedPayment = confirmed.rows[0];
    return {
      outcome: "approved",
      payment: mapPayment({
        ...confirmedPayment,
        record_source: "transaction",
        gateway: confirmedPayment.provider,
        payment_method: confirmedPayment.operator,
        payer_phone: confirmedPayment.payer_number,
      }),
      merchant,
      credit,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function searchPaymentsByNumber(search: string): Promise<ManualPaymentRecord[]> {
  const digits = search.replace(/\D/g, "");
  if (digits.length < 3) throw new Error("Saisissez au moins trois chiffres du numéro.");
  const { rows } = await financialPool.query(
    `SELECT *
       FROM (
         SELECT
           'pending'::text AS record_source,
           p.id, p.merchant_id, p.country, p.amount, p.payer_phone, p.payer_name,
           p.payment_method, p.gateway, p.tx_id, p.provider_tx_id, p.provider_reference,
           p.status, p.manual_recipient_phone, p.manual_recipient_name, p.manual_submission, p.manual_submitted_at,
           p.created_at
         FROM pending_payments p
         WHERE (
           regexp_replace(COALESCE(p.manual_recipient_phone, ''), '[^0-9]', '', 'g') LIKE '%' || $1 || '%'
           OR regexp_replace(COALESCE(p.payer_phone, ''), '[^0-9]', '', 'g') LIKE '%' || $1 || '%'
         )
         AND NOT EXISTS (
           SELECT 1
             FROM transactions t
            WHERE t.merchant_id = p.merchant_id
               AND regexp_replace(COALESCE(t.payer_number, ''), '[^0-9]', '', 'g') LIKE '%' || $1 || '%'
              AND (
                (p.tx_id IS NOT NULL AND (t.tx_id = p.tx_id OR t.provider_reference = p.tx_id OR t.provider_tx_id = p.tx_id))
                OR (p.provider_reference IS NOT NULL AND (t.tx_id = p.provider_reference OR t.provider_reference = p.provider_reference OR t.provider_tx_id = p.provider_reference))
                OR (p.provider_tx_id IS NOT NULL AND (t.tx_id = p.provider_tx_id OR t.provider_reference = p.provider_tx_id OR t.provider_tx_id = p.provider_tx_id))
              )
         )
         UNION ALL
         SELECT
           'transaction'::text AS record_source,
           t.id, t.merchant_id, t.country, t.amount, t.payer_number AS payer_phone, t.payer_name,
           t.operator AS payment_method, t.provider AS gateway, t.tx_id, t.provider_tx_id,
           t.provider_reference, t.status, NULL::text AS manual_recipient_phone,
           t.manual_recipient_name,
           NULL::text AS manual_submission, NULL::timestamp AS manual_submitted_at, t.created_at
         FROM transactions t
         WHERE regexp_replace(COALESCE(t.payer_number, ''), '[^0-9]', '', 'g') LIKE '%' || $1 || '%'
       ) AS payment_history
      ORDER BY created_at DESC
      LIMIT 10`,
    [digits],
  );
  return rows.map(mapPayment);
}

export async function getPaymentReviewRecord(
  source: "pending" | "transaction",
  id: number,
): Promise<ManualPaymentRecord | undefined> {
  if (source === "pending") {
    const { rows } = await financialPool.query(
      "SELECT * FROM pending_payments WHERE id = $1 LIMIT 1",
      [id],
    );
    return rows[0] ? mapPayment(rows[0]) : undefined;
  }
  const { rows } = await financialPool.query(
    "SELECT * FROM transactions WHERE id = $1 LIMIT 1",
    [id],
  );
  const row = rows[0];
  return row
    ? mapPayment({
        ...row,
        record_source: "transaction",
        gateway: row.provider,
        payment_method: row.operator,
        payer_phone: row.payer_number,
      })
    : undefined;
}