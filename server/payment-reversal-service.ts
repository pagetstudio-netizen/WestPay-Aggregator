import { financialPool } from "./db";
import { resolveOriginalMerchantCredit } from "./payment-reversal-rules";
import { applyMerchantBalanceDelta } from "./merchant-balance-ledger";

export { resolveOriginalMerchantCredit } from "./payment-reversal-rules";
const REVERSIBLE_STATUSES = ["confirmed", "completed", "success", "successful", "paid"];

export interface PaymentReversalRecord {
  id: number;
  merchant_id: number;
  merchant_country_id: number | null;
  country: string;
  tx_id: string;
  amount: number;
  merchant_credit: number | null;
  payer_number: string | null;
  payer_name: string | null;
  provider: string;
  provider_tx_id: string | null;
  provider_reference: string | null;
  provider_fee: number | null;
  status: string;
  created_at: Date | string;
}

const PAYMENT_COLUMNS = `
  id, merchant_id, merchant_country_id, country, tx_id, amount, merchant_credit,
  payer_number, payer_name, provider, provider_tx_id, provider_reference,
  provider_fee, status, created_at
`;

export async function searchReversiblePayments(search: string): Promise<PaymentReversalRecord[]> {
  const term = String(search || "").trim().slice(0, 180);
  if (!term) return [];

  const exact = await financialPool.query<PaymentReversalRecord>(
    `SELECT ${PAYMENT_COLUMNS}
       FROM transactions
      WHERE LOWER(status) = ANY($1::text[])
        AND amount > 0
        AND (
          LOWER(BTRIM(tx_id)) = LOWER($2)
          OR LOWER(BTRIM(COALESCE(provider_reference, ''))) = LOWER($2)
          OR LOWER(BTRIM(COALESCE(provider_tx_id, ''))) = LOWER($2)
        )
      ORDER BY created_at DESC, id DESC
      LIMIT 11`,
    [REVERSIBLE_STATUSES, term],
  );
  if (exact.rows.length) return exact.rows;

  const phoneDigits = term.replace(/\D/g, "");
  if (phoneDigits.length < 6) return [];

  const byPhone = await financialPool.query<PaymentReversalRecord>(
    `SELECT ${PAYMENT_COLUMNS}
       FROM transactions
      WHERE LOWER(status) = ANY($1::text[])
        AND amount > 0
        AND REGEXP_REPLACE(COALESCE(payer_number, ''), '[^0-9]', '', 'g') = $2
      ORDER BY created_at DESC, id DESC
      LIMIT 11`,
    [REVERSIBLE_STATUSES, phoneDigits],
  );
  return byPhone.rows;
}

export async function getPaymentReversalRecord(id: number): Promise<PaymentReversalRecord | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const result = await financialPool.query<PaymentReversalRecord>(
    `SELECT ${PAYMENT_COLUMNS} FROM transactions WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] || null;
}

export type ReversePaymentResult =
  | {
      outcome: "reversed";
      payment: PaymentReversalRecord;
      creditedAmount: number;
      balanceBefore: number;
      balanceAfter: number;
    }
  | { outcome: "not_found" | "already_reversed" | "not_reversible" | "credit_unverifiable" | "merchant_country_missing" | "merchant_country_ambiguous" };

export async function reverseConfirmedPayment(
  transactionId: number,
  admin: { telegramUserId: string | null; name: string },
): Promise<ReversePaymentResult> {
  if (!Number.isSafeInteger(transactionId) || transactionId <= 0) return { outcome: "not_found" };

  const client = await financialPool.connect();
  try {
    await client.query("BEGIN");

    const paymentResult = await client.query<PaymentReversalRecord>(
      `SELECT ${PAYMENT_COLUMNS}
         FROM transactions
        WHERE id = $1
        FOR UPDATE`,
      [transactionId],
    );
    const payment = paymentResult.rows[0];
    if (!payment) {
      await client.query("ROLLBACK");
      return { outcome: "not_found" };
    }

    const status = String(payment.status || "").toLowerCase();
    if (status === "reversed") {
      await client.query("ROLLBACK");
      return { outcome: "already_reversed" };
    }
    if (!REVERSIBLE_STATUSES.includes(status)) {
      await client.query("ROLLBACK");
      return { outcome: "not_reversible" };
    }

    const creditedAmount = resolveOriginalMerchantCredit({
      amount: payment.amount,
      merchantCredit: payment.merchant_credit,
      provider: payment.provider,
      providerFee: payment.provider_fee,
    });
    if (creditedAmount == null) {
      await client.query("ROLLBACK");
      return { outcome: "credit_unverifiable" };
    }

    const countryResult = payment.merchant_country_id != null
      ? await client.query<{ id: number; balance: number }>(
          `SELECT id, balance
             FROM merchant_countries
            WHERE id = $1 AND merchant_id = $2
              AND LOWER(BTRIM(country)) = LOWER(BTRIM($3))
            FOR UPDATE`,
          [payment.merchant_country_id, payment.merchant_id, payment.country],
        )
      : await client.query<{ id: number; balance: number }>(
          `SELECT id, balance
             FROM merchant_countries
            WHERE merchant_id = $1
              AND LOWER(BTRIM(country)) = LOWER(BTRIM($2))
            ORDER BY id
            FOR UPDATE`,
          [payment.merchant_id, payment.country],
        );

    if (!countryResult.rows.length) {
      await client.query("ROLLBACK");
      return { outcome: "merchant_country_missing" };
    }
    if (countryResult.rows.length !== 1) {
      await client.query("ROLLBACK");
      return { outcome: "merchant_country_ambiguous" };
    }

    const merchantCountry = countryResult.rows[0];
    const balanceBefore = Number(merchantCountry.balance);
    const balanceAfter = balanceBefore - creditedAmount;
    if (!Number.isSafeInteger(balanceBefore) || !Number.isSafeInteger(balanceAfter)) {
      throw new Error("Le solde marchand n’est pas un entier valide.");
    }

    const balanceUpdate = await applyMerchantBalanceDelta(
      merchantCountry.id,
      -creditedAmount,
      {
        eventType: "payin_reversal",
        reference: payment.tx_id,
        sourceType: "transaction",
        sourceId: payment.id,
        description: "Annulation d'un pay-in confirmé",
        allowNegativeBalance: true,
      },
      client,
    );
    if (!balanceUpdate.applied || balanceUpdate.balanceBefore !== balanceBefore || balanceUpdate.balanceAfter !== balanceAfter) {
      throw new Error("Le solde marchand n’a pas pu être mis à jour.");
    }

    const statusUpdate = await client.query(
      `UPDATE transactions
          SET status = 'reversed',
              merchant_country_id = COALESCE(merchant_country_id, $2)
        WHERE id = $1 AND LOWER(status) = ANY($3::text[])
        RETURNING id`,
      [payment.id, merchantCountry.id, REVERSIBLE_STATUSES],
    );
    if (!statusUpdate.rowCount) throw new Error("La transaction a changé d’état pendant l’annulation.");

    const audit = await client.query(
      `INSERT INTO payment_reversals
         (transaction_id, merchant_id, merchant_country_id, country, tx_id,
          credited_amount, balance_before, balance_after, telegram_user_id, telegram_admin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (transaction_id) DO NOTHING
       RETURNING id`,
      [
        payment.id,
        payment.merchant_id,
        merchantCountry.id,
        payment.country,
        payment.tx_id,
        creditedAmount,
        balanceBefore,
        balanceAfter,
        admin.telegramUserId,
        String(admin.name || "Admin Telegram").slice(0, 180),
      ],
    );
    if (!audit.rowCount) throw new Error("Une annulation existe déjà pour cette transaction.");

    await client.query("COMMIT");
    return {
      outcome: "reversed",
      payment: { ...payment, status: "reversed", merchant_country_id: merchantCountry.id },
      creditedAmount,
      balanceBefore,
      balanceAfter,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
