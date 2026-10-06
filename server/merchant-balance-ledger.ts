import type { PoolClient } from "pg";
import { financialPool } from "./db";

export type MerchantBalanceEventType =
  | "payin"
  | "payin_reversal"
  | "payout"
  | "refund"
  | "admin_credit"
  | "admin_debit"
  | "wallet_transfer_in"
  | "wallet_transfer_out"
  | "adjustment";

export interface MerchantBalanceChangeDetails {
  eventType: MerchantBalanceEventType;
  reference?: string | null;
  sourceType?: string | null;
  sourceId?: number | string | null;
  actorAdminId?: number | null;
  description?: string | null;
  allowNegativeBalance?: boolean;
}

export interface MerchantBalanceChangeResult {
  applied: boolean;
  balanceBefore?: number;
  balanceAfter?: number;
}

/**
 * Applies and audits one wallet balance change in a single SQL statement.
 * Supplying an existing transaction client keeps the ledger entry atomic with
 * the caller's other financial writes.
 */
export async function applyMerchantBalanceDelta(
  merchantCountryId: number,
  delta: number,
  details: MerchantBalanceChangeDetails,
  client?: PoolClient,
): Promise<MerchantBalanceChangeResult> {
  if (!Number.isSafeInteger(merchantCountryId) || merchantCountryId <= 0) {
    throw new Error("Identifiant de portefeuille invalide");
  }
  if (!Number.isSafeInteger(delta) || delta === 0) {
    throw new Error("La variation de solde doit être un entier non nul");
  }

  const executor = client ?? financialPool;
  const result = await executor.query(
    `WITH changed AS (
       UPDATE merchant_countries
          SET balance = balance + $1,
              admin_credits_total = CASE
                WHEN $3 = 'admin_credit' AND $1 > 0
                  THEN admin_credits_total + $1
                ELSE admin_credits_total
              END
        WHERE id = $2
          AND ($9 OR $1 > 0 OR balance >= -$1)
       RETURNING id, merchant_id, country, balance
     ),
     logged AS (
       INSERT INTO merchant_balance_ledger
         (merchant_country_id, merchant_id, country, event_type, amount,
          balance_before, balance_after, reference, source_type, source_id,
          actor_admin_id, description)
       SELECT id, merchant_id, country, $3, $1, balance - $1, balance,
              $4, $5, $6, $7, $8
         FROM changed
       RETURNING id
     )
     SELECT changed.balance - $1 AS balance_before, changed.balance AS balance_after
       FROM changed
       JOIN logged ON true`,
    [
      delta,
      merchantCountryId,
      details.eventType,
      details.reference ?? null,
      details.sourceType ?? null,
      details.sourceId == null ? null : String(details.sourceId),
      details.actorAdminId ?? null,
      details.description ?? null,
      details.allowNegativeBalance ?? false,
    ],
  );

  if (!result.rows[0]) return { applied: false };
  return {
    applied: true,
    balanceBefore: Number(result.rows[0].balance_before),
    balanceAfter: Number(result.rows[0].balance_after),
  };
}
