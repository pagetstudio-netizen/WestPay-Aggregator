# RobotPay - Private Mobile Money Payment Aggregator Platform

## Overview
WestPay is a private Mobile Money payment aggregation platform with admin and merchant dashboards. No public registration - admin creates all merchant accounts. Payments are routed per operator/country via the `gateway` field on `withdrawal_operators`, using the active ClaPay, Mbiyo, SeaPay and LipaPap connectors, with SMS and OxaPay crypto flows where applicable.

## SeaPay Integration (Pakistan, Philippines, India)
- SDK module: `server/seapay.ts` (seapayPayin/Payout/Balance/Query, SEAPAY_CURRENCY_COUNTRY, buildSeapaySign/verifySeapaySign — MD5 signature)
- Countries added: Pakistan (PKR), Philippines (PHP), India (INR) — added to `COUNTRIES_LIST` everywhere in admin (reversements, merchant country assignment, operator dropdowns), with the same activate/maintenance toggles as other countries
- **Nigeria is NOT officially supported by SeaPay** (their supported list is India, Pakistan, Bangladesh, Philippines, Vietnam, Egypt) — flagged to user, not integrated with SeaPay
- `withdrawal_operators.seapay_code` column stores the SeaPay routing/channel code per operator
- Seeded automatically on every server start via `ensureSeaPayOperatorsExist()` in `server/seed.ts` (idempotent, skips existing):
  - Pakistan: 51 operators (46 banks PKR1-PKR46 + Easypaisa/JazzCash/AMEX/BankIslami/Barclays), gateway="SeaPay"
  - Philippines: GCash + Maya (PayMaya), gateway="SeaPay"
  - India: single generic "Virement bancaire (IFSC)" operator — SeaPay India payouts require a free-form IFSC bank code entered per-transaction (`payee_bank` param), not a fixed operator list. Current withdrawal form only has a phone field; a dedicated IFSC input still needs to be added for India withdrawals to be fully functional.
- Payin flow (`/api/payment/initiate`), payout/approve flow (`/api/admin/withdrawals/:id/approve`), and payout callback (`/api/seapay/payout-callback`, MD5-verified) are implemented
- Admin tools `/api/admin/withdrawals/:id/{check-status,sync-status,retry}` and `/api/admin/transactions/:id/{check-status,sync-status,trigger}` also support "seapay" as a provider (query/payout/payin via SeaPay SDK)
- No live SeaPay API keys configured yet — admin must add them via Settings once available (env var fallback to DB setting, same pattern as other connectors)

## Architecture
- **Frontend**: React + Tailwind CSS + shadcn/ui (dark theme by default)
- **Backend**: Express.js with JWT authentication
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: JWT tokens stored in localStorage
- **Payment Processing**: Mobile-money pay-ins and payouts are routed through the configured active connector for each country/operator.

## Key URLs
- `/` - Restricted access page (public)
- `/admin-access-[confidentiel]` - Admin login (URL confidentielle, ne pas noter ici)
- `/admin-access-[confidentiel]/dashboard` - Admin dashboard
- `/merchant-login` - Merchant login
- `https://dashboard.westpay.cfd/merchant/index/login` - Merchant login (official URL)
- `/merchant/:slug` - Merchant dashboard
- `https://secure.docs.westpay.cfd/` - PIN-protected API documentation
- `https://checkout1.westpay.cfd/pay?merchant=slug&amount=3000&country=Togo&redirect=https://...` - Bank 1 hosted payment wizard
- `https://westpay.cfd/pay` and `/pay/:slug` - anciens chemins Bank 1 désactivés (404)

## Default Credentials
⚠️ Les credentials de démo ont été supprimés de ce fichier pour des raisons de sécurité.
Les comptes de démonstration sont suspendus. Contactez l'admin pour créer un nouveau compte.

## API Structure
- `/api/auth/admin/login` - Admin authentication
- `/api/auth/merchant/login` - Merchant authentication
- `/api/admin/*` - Admin endpoints (JWT required)
- `/api/merchant/*` - Merchant endpoints (JWT required)
- `/api/docs/access` - PIN-protected docs access
- `/api/payment/initiate` - Create a mobile-money payment through the configured connector
- `/api/merchant/webhook` - GET/PUT merchant webhook config
- `/api/merchant/webhook/test` - POST test webhook notification
- `/api/merchant/webhook/logs` - GET webhook send logs
- `/api/merchant/transfer` - POST a supported merchant transfer
- `/api/admin/webhook-logs` - GET all webhook logs (admin)
- `/api/admin/merchant/:id/webhook` - PUT merchant webhook (admin)
- `/api/payment/:paymentId/status` - GET the payment status
- `/sms/receive` - SMS webhook (legacy, kept for backwards compatibility)

## Payment connector model
- New merchant-country configurations use `gatewayEnabled` and route through ClaPay by default.
- Active mobile-money connectors are ClaPay, Mbiyo, SeaPay and LipaPap; SMS reconciliation remains available where configured.
- OxaPay handles crypto payments separately.
- Payment records use neutral fields: `providerReference`, `providerTxId`, and `providerPaymentUrl`.
- Polling uses `GET /api/payment/:paymentId/status`; hosted-payment returns use the `payment_status` query parameter.

## API Management System
- Each merchant has unique API keys per country (format: PREFIX-[40char hex])
- API keys can be regenerated by merchants or admins (old key immediately invalidated)
- PIN-protected documentation access (6-digit PIN, bcrypt hashed)
- Admin manages PINs via "API & PIN" tab in admin dashboard
- All API activities logged in api_logs table

## Webhook Notification System
- Merchants configure a webhook URL in their dashboard ("Webhook" tab)
- Each merchant gets a unique webhook secret (HMAC-SHA256 signing key)
- On payment confirmation, WestPay sends POST to merchant's webhook URL
- Payload includes: event, txId, amount, currency, payer, country, merchantSlug, provider, timestamp
- Signature sent in `X-WestPay-Signature` header for verification
- Event type sent in `X-WestPay-Event` header
- Webhook logs stored in webhook_logs table for auditing
- Admin can view webhook URLs for each merchant in the merchants panel

## Database Tables
admins, merchants, merchant_countries, transactions, sms_logs, numbers, settings, login_logs, merchant_pins, api_logs, pending_payments, webhook_logs, payment_links, wallet_transfers, wallet_transfer_countries, withdrawals, withdrawal_operators, stats_baselines, telegram_activation_codes, crypto_aggregators, crypto_aggregator_countries, crypto_aggregator_merchants, crypto_transactions

### Payment data fields
- `merchant_countries.gateway_enabled` - boolean enabling payment collection for a country
- `transactions.provider` - connector or ingestion source identifier
- `transactions.provider_tx_id` - external transaction identifier
- `transactions.provider_reference` - external/provider reference
- `pending_payments.provider_reference` - provider reference for the pending payment
- `pending_payments.provider_tx_id` - external transaction identifier
- `pending_payments.provider_payment_url` - hosted payment URL when supported

## OxaPay Crypto Aggregator (Tasks #3 + #4 — COMPLETED)
- **GLOBAL crypto** — no country restriction; admin activates per merchant only
- Admin-only configuration in "Crypto" sidebar tab
- Admin can create/configure/enable-disable OxaPay aggregators and assign merchants
- Dynamic currency list from OxaPay API (15min cache), fallback to [USDT,BTC,ETH,LTC,TRX,BNB,DOGE]
- SDK module: `server/oxapay.ts` (createInvoice, getStatus, generatePayout, verifyWebhook, getCurrencies)
- DB tables: crypto_aggregators, crypto_aggregator_countries, crypto_aggregator_merchants, crypto_transactions, crypto_balances
- **Credit flow**: When `paid`, credits `payAmount` (in `payCurrency`) to `crypto_balances` table (net = 97% unless feeExempt)
- **Dual credit paths**: polling (`GET /api/payment/crypto/:trackId/status`) AND callback both call `creditMerchantForCryptoTx()`
- **Admin routes**: GET/POST/PATCH/DELETE /api/admin/crypto-aggregators, PUT countries/merchants
- **Merchant routes**:
  - GET /api/merchant/crypto-aggregators (assigned aggregators)
  - POST /api/merchant/crypto/invoice (create invoice via API key, no country needed)
  - GET /api/merchant/crypto/transactions
  - GET /api/merchant/crypto/balances (per-currency balances)
  - GET /api/merchant/crypto/currencies (available cryptos)
- **Public routes**:
  - GET /api/public/crypto/check-merchant/:merchantSlug (is crypto enabled for merchant?)
  - GET /api/public/crypto-currencies (global currency list)
  - GET /api/public/crypto-payment/:trackId (public tx info)
  - GET /api/payment/crypto/:trackId/status (polling status)
  - POST /api/payment/crypto/initiate (public: start payment, no country)
  - POST /api/oxapay/callback (HMAC-verified webhook from OxaPay)
  - GET /api/admin/crypto/transactions
- **Merchant dashboard CryptoPanel**: activation status, per-currency balance cards, API integration docs with copy buttons, recent transactions table (payAmount/payCurrency)
- **Payment page**: shows "Crypto (via OxaPay)" option when enabled (no country check)
- Public payment page: /pay/crypto/:trackId (QR code, wallet address, countdown, auto-polling 10s)
- Payment URL format: https://westpay.cfd/pay/crypto/{trackId}
- Merchant API contract: POST /api/merchant/crypto/invoice { amount, currency, description?, orderId?, returnUrl? }

## Replit setup
- Install dependencies with `npm install`, then start the preview with `npm run dev` on port 5000.
- The server requires the existing PostgreSQL databases before it can initialize routes and the frontend: `AUTH_DATABASE_URL` (auth/config database), `FINANCIAL_DATABASE_URL` (financial database), and `SESSION_SECRET`.
- Optional provider credentials (ClaPay, Mbiyo, SeaPay, LipaPap, OxaPay, Telegram, and AI services) can be added later through Replit Secrets or the admin settings where supported.
- If the database variables are missing, the server remains listening on port 5000, serves the development frontend for preview, exposes `/api/healthz-boot`, and keeps application API routes blocked until configuration is complete.

## Déploiement Plesk
- **Build** : `npm run build` → génère `dist/index.cjs` (serveur) + `dist/public/` (frontend)
- **Dossier racine Plesk** : `dist/` (Plesk pointe sur ce dossier)
- **Startup File Plesk** : `index.cjs` (relatif au dossier `dist/`)
- **Workflow Replit (dev)** : `npm run dev` → `NODE_ENV=development node --import tsx/esm server/index.ts`
- Le bot Telegram utilise le **webhook** en production (Plesk) et tente le **polling** en dev (Replit) sans supprimer le webhook de prod

## Mobile-money payment flow
1. Customer enters phone number, operator and name on the payment page.
2. WestPay routes the request to the configured active connector.
3. The customer validates the payment on their phone or opens the returned hosted-payment URL.
4. The connector callback or status flow is verified before the payment is confirmed.
5. WestPay credits the merchant and sends the configured webhook notification.
