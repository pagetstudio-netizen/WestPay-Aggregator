---
name: Dual-database architecture
description: How the two PostgreSQL instances are split, exported symbols, and cross-DB query pattern.
---

## Split

**AUTH DB (Supabase — AUTH_DATABASE_URL):**
`admins`, `merchants`, `merchant_pins`, `settings`, `numbers`, `allowed_ips`, `blocked_ips`,
`blocked_devices`, `devices`, `admin_otp_codes`, `merchant_login_otps`,
`telegram_activation_codes`, `withdrawal_operators`, `wallet_transfer_countries`,
`crypto_aggregators`, `crypto_aggregator_countries`, `crypto_aggregator_merchants`

**FINANCIAL DB (Neon — FINANCIAL_DATABASE_URL):**
`transactions`, `merchant_countries`, `withdrawals`, `pending_payments`, `wallet_transfers`,
`payment_links`, `crypto_transactions`, `crypto_balances`, `crypto_withdrawal_requests`,
`crypto_payment_links`, `sms_logs`, `api_logs`, `webhook_logs`, `login_logs`,
`security_logs`, `stats_baselines`, `knowledge_chunks`

## Exports from server/db.ts

| Symbol | Description |
|--------|-------------|
| `authDb` / `authPool` | Supabase Drizzle + pg Pool |
| `financialDb` / `financialPool` | Neon Drizzle + pg Pool |
| `db` | alias for `authDb` (backward compat) |
| `pool` | alias for `authPool` (backward compat) |
| `encrypt(text)` / `decrypt(text)` | AES-256-GCM helpers, key = ENCRYPTION_KEY (64-char hex) |
| `runMigrations()` | runs both runAuthMigrations() and runFinancialMigrations() in parallel |

## Cross-DB query pattern

For storage methods that previously JOINed financial + auth tables:
1. Query financial DB for the financial rows
2. Query auth DB for merchant names/fee_exempt separately
3. Merge in application code (Map<id, name>)

Helper functions in storage.ts: `getFeeExemptIds()`, `getMerchantNameMap()`, `exemptClause(ids[])`.

## Files that directly use db/pool (not via storage)

- `server/routes.ts` — imports `db, pool, financialDb, financialPool`; `db` used for settings/admins (auth); `financialDb` used for transactions/pendingPayments; `financialPool` for CAS updates on pending_payments/withdrawals
- `server/telegram-bot.ts` — imports `pool, financialPool`; `pool` for allowed_ips/blocked_ips; `financialPool` for withdrawals/transactions/security_logs queries
- `server/knowledge.ts` — `financialPool` (knowledge_chunks is a financial table)
- `server/seed.ts` — uses `db` (=authDb) for withdrawal_operators and admins (both auth) ✓

**Why:** Two separate PostgreSQL services have no shared FK integrity; enforcing at app layer keeps the two DBs independently scalable and avoids vendor lock-in to a single provider.

**How to apply:** Any new table must be classified Auth or Financial before creation. Any method accessing both must use the two-query + app-merge pattern.
