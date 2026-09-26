# Threat Model — WestPay / RobotPay

## Project Overview

WestPay is a private mobile-money aggregation platform with admin and merchant dashboards. Active payment connectors are ClaPay, Mbiyo, SeaPay and LipaPap, with SMS reconciliation and OxaPay crypto payments. There is no public registration. The backend is Express.js with JWT authentication, PostgreSQL/Drizzle storage, and a React frontend.

## Assets

- **Admin credentials and session tokens** — compromise gives full platform control.
- **Merchant credentials and API keys** — compromise allows payment initiation and supported payouts.
- **Connector API keys** — ClaPay, Mbiyo, SeaPay, LipaPap and OxaPay credentials are stored in environment variables or the settings store. Compromise can initiate charges or payouts.
- **Transaction and balance data** — contains financial records and customer PII.
- **Application secrets** — JWT signing secret, merchant webhook secrets and TOTP seeds.

## Trust Boundaries

- Public internet → WestPay API: validate inputs and rate-limit public payment/status endpoints.
- Browser → authenticated API: verify JWT, role, suspension and geographic restrictions.
- WestPay → payment connectors: protect credentials and validate provider responses.
- Connectors → callbacks: verify signatures before any financial state change and enforce idempotency.

## Scan Anchors

- Production entry points: `server/routes.ts` and `server/index.ts`.
- Highest-risk areas: ClaPay, Mbiyo, SeaPay, LipaPap and OxaPay callbacks; withdrawal approval; payment initiation; public status lookups.
- Public callbacks: `/api/clapay/callback`, `/api/clapay/payout-callback`, `/api/mbiyo/callback`, `/api/mbiyo/payout-callback`, `/api/seapay/callback`, `/api/seapay/payout-callback`, `/api/lipapap/callback`, and `/api/oxapay/callback`.
- Authenticated surfaces: `/api/admin/*` and `/api/merchant/*`.

## Threat Categories

### Spoofing

JWT tokens are verified on every request and admin sessions are revocable. External callback signatures must be verified using each active connector's configured signature mechanism before processing.

**Required guarantees:** JWT secrets must be strong and supplied through environment configuration. Every callback must fail closed when its verification secret is missing or invalid.

### Tampering

Amounts are computed from stored pending-payment records rather than trusted client values. Merchant operations are scoped to the authenticated merchant. Callback handlers must use atomic pending-state transitions to prevent replay and duplicate credits.

**Required guarantees:** Callback handlers must use CAS-style updates such as `WHERE status='pending' RETURNING id`; never use read-check-write for financial confirmation.

### Information Disclosure

Merchant emails, secrets, phone numbers and internal routing codes must not appear in logs or unauthenticated responses. The merchant operator-list route must retain its intended authentication requirements.

**Required guarantees:** Do not log credentials or full PII. Keep admin URL secrets out of committed files and logs.

### Denial of Service

Public payment initiation and status endpoints require request-rate limits. The documentation PIN endpoint is rate-limited per IP and should also have a global protection against distributed guessing.

**Required guarantees:** Retain rate limits on payment initiation, callbacks and status polling. Use high-entropy documentation credentials and global throttling.

### Elevation of Privilege

Admin routes require admin authentication and geographic checks. Merchant dashboard routes require merchant authentication and suspension checks; API-key routes must scope every operation to the matching merchant and country.

**Required guarantees:** Every `/api/merchant/` route must have the appropriate authentication middleware, including operator listing and payout operations. Never accept a merchant or country identifier without ownership validation.