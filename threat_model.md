# Threat Model — WestPay / RobotPay

## Project Overview

WestPay (internally RobotPay) is a private mobile money payment aggregation platform with admin and merchant dashboards. It processes payments via OmniPay, Mbiyo, SendavaPay, SeaPay, ClapaPay, and OxaPay (crypto). There is no public registration — the admin creates all merchant accounts. The backend is Express.js with JWT authentication (httpOnly cookies + Bearer header). The database is PostgreSQL with Drizzle ORM. The frontend is React + Tailwind. Deployed on Plesk in production; development runs on Replit.

## Assets

- **Admin credentials and session tokens** — Admin account password and JWT. Compromise gives full platform control: create/suspend merchants, approve withdrawals, view all transactions.
- **Merchant credentials and API keys** — Per-merchant email/password login, JWT sessions, and per-country API keys. Compromise allows initiating payments and transfers against a merchant's balance.
- **Payment gateway API keys** — OmniPay, Mbiyo, SendavaPay, SeaPay, OxaPay, ClapaPay API keys stored as environment variables (with DB fallback). Compromise allows direct calls to payment providers, potentially initiating charges or payouts.
- **Transaction and balance data** — Merchant account balances, transaction history, withdrawal requests, and customer phone numbers. Contains PII and financial data.
- **Application secrets** — JWT signing secret (`SESSION_SECRET`/`JWT_SECRET`), webhook HMAC secrets per merchant, TOTP seeds.
- **Admin URL slug** — The secret URL path for the admin login page. Currently exposed in committed log files.

## Trust Boundaries

- **Public internet → WestPay API** — Payment initiation, callback receipt, public lookup endpoints. The server must validate all inputs and verify signatures on callbacks.
- **Browser → WestPay API (authenticated)** — Admin and merchant dashboards. JWT must be verified on every request. Admin role is additionally geo-restricted.
- **WestPay server → Payment providers** — Outbound calls with API keys. The server trusts provider responses but verifies inbound callbacks with HMAC.
- **Payment providers → WestPay callbacks** — Inbound webhook notifications. Must be signature-verified before crediting merchants. Idempotency checks prevent double-crediting.
- **SendavaPay CORS proxy** — Browser-facing proxy routes that forward requests to SendavaPay using WestPay's API key. Currently unauthenticated — should be restricted to legitimate payment sessions.

## Scan Anchors

- **Production entry points:** `server/routes.ts` (10,297 lines, all HTTP routes), `server/index.ts` (startup)
- **Highest-risk areas:** Callback handlers (omnipay/mbiyo/seapay/oxapay/sendavapay), withdrawal approval flow (~line 8055), payment initiation (~line 4003), SendavaPay proxy routes (~line 5593)
- **Public surfaces:** `/api/payment/*`, `/api/public/*`, `/api/omnipay/callback`, `/api/mbiyo/callback`, `/api/seapay/callback`, `/api/oxapay/callback`, `/api/sendavapay/callback`, `/api/sendavapay/proxy/*`
- **Authenticated surfaces:** `/api/admin/*` (admin JWT + geo-restriction), `/api/merchant/*` (merchant JWT or API key)
- **Dev-only:** `script/create-test-account.ts`, `scripts/check-telegram.ts`, `scripts/cleanup-test-data.ts` — not production reachable

## Threat Categories

### Spoofing

JWT tokens are verified on every request using a strong secret (`SESSION_SECRET`). Admin tokens are additionally revocable via `tokenInvalidatedAt`. The admin login page is hidden behind a secret URL slug — but this slug is now exposed in committed log files, weakening the obscurity layer. Payment callbacks from external providers are verified with HMAC signatures (SHA3-512 for OmniPay, SHA512 for OxaPay, SHA256 for Mbiyo/SendavaPay, MD5 for SeaPay per vendor mandate).

**Required guarantees:** JWT secret must be a strong random value set via environment variable. The admin URL slug should be rotated since it was committed to the repository. SeaPay callback signature must be verified before any state change; the current implementation does verify it but must remain fail-closed.

### Tampering

Payment amounts are computed server-side using stored pending-payment records rather than client-supplied values. Withdrawal and wallet transfer endpoints scope operations to the authenticated merchant's own data. SeaPay's callback handler lacks an atomic idempotency check — simultaneous duplicate callbacks can double-credit a merchant, which is a tamper risk via callback replay.

**Required guarantees:** All callback handlers must use atomic CAS-style database updates (`WHERE status='pending' RETURNING id`) rather than read-check-write patterns. The SeaPay callback must be updated to match the idempotency pattern used by OmniPay and OxaPay.

### Information Disclosure

Merchant email addresses appear in startup log output. Internal payment gateway routing codes (OmniPay operator codes, Mbiyo codes, SeaPay codes) are exposed via `/api/merchant/withdrawal-operators/:country` without authentication. The admin URL slug is committed in a log file in the repository.

**Required guarantees:** Auth middleware must be applied to `/api/merchant/withdrawal-operators/:country`. Application logs must not contain merchant email addresses in plaintext. The committed log file must be purged from git history.

### Denial of Service

The SendavaPay proxy routes are publicly accessible and use WestPay's API key. An attacker can flood SendavaPay with requests using the platform key, exhausting rate limits or triggering account suspension. The `/api/docs/access` PIN endpoint is rate-limited per-IP but not globally, making the 1,000,000-PIN keyspace exhaustible via IP rotation.

**Required guarantees:** SendavaPay proxy routes must require authentication or validate that the `orderId`/`ref` belongs to an active WestPay payment session. The docs PIN must have higher entropy or a global rate limit.

### Elevation of Privilege

Admin routes are protected by `authMiddleware("admin")` which checks role, geo-restriction, and account existence. Merchant routes check role and account suspension. No path to privilege escalation was found in the authenticated code paths. The SendavaPay proxy routes allow unauthenticated callers to use the platform's API key for calls to SendavaPay's API, which constitutes privilege abuse without authentication bypass per se.

**Required guarantees:** All routes under `/api/merchant/` must have authentication middleware applied, including `/api/merchant/withdrawal-operators/:country`. SendavaPay proxy routes must validate the caller has an active payment session.
