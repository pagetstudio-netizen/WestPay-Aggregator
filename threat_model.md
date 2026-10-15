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

## Security Audit Status — 2026-10-15

### Protections Added

- Production client IPs are derived only through the local Plesk proxy or Cloudflare's published proxy ranges. Raw `X-Forwarded-For` and `CF-Connecting-IP` headers are not trusted by application code. Development continues to trust the single managed Replit preview proxy.
- Merchant-country API keys are restricted to their associated country and rejected for inactive countries or suspended/deleted merchants. Bearer-token fallbacks use the full merchant authentication checks, including session revocation and suspension. Crypto API keys also reject suspended merchants.
- Merchant webhook requests resolve every DNS answer, reject private/reserved addresses, pin the connection to a validated public IP, reject embedded URL credentials and nonstandard ports, do not follow redirects, cap responses, and time out requests.
- OTP values, Telegram message text/chat identifiers, API response bodies/path identifiers, callback bodies, and callback signatures are no longer written to application logs. Webhook URLs are not written to console logs.
- New operator-logo uploads reject SVG. Existing SVG uploads are served with `nosniff` and a restrictive sandbox CSP; upload routes remain admin-authenticated and size-limited.
- Documentation tokens no longer return crypto credentials after a merchant is suspended.
- Vulnerable direct/transitive packages with published fixes were updated in both lockfiles. `tailwindcss-animate` is build-only and is now a development dependency.

### Remaining Risks and Scan Limitations

- The dependency scan still reports three lockfile occurrences of `braces@3.0.3` as high severity. The npm registry currently has no later `braces` release; its remaining use is in the Tailwind build tree, not the production dependency tree. `npm audit --omit=dev` reports zero production vulnerabilities. Recheck when upstream publishes a fix.
- LipaPap and SeaPay currently require MD5-based request formulas. Do not replace these hashes unilaterally; obtain a provider-supported stronger signing scheme first. LipaPap response verification uses HMAC-SHA-256, and SeaPay signature comparison is constant-time.
- The SAST findings for generated random seed values and the fixed-host redirects in `server/static.ts` were reviewed as false positives: seed inputs come from cryptographic randomness, and redirects use an allowlisted host mapping.
- HoundDog data-flow scanning could not complete because the scanner returned a JSON schema validation error twice. No clean result is claimed for that scan.
- Custom rate-limit and account-lock maps are process-local. Deployments with multiple workers or frequent restarts should move these controls to a shared store to preserve limits across instances.
- The application unconditionally runs migrations and seeding at startup. Those routines can make schema/data/config updates (including withdrawal-operator corrections and missing-PIN backfills); do not use the production database for a development preview without explicit migration approval. Prefer a separate development database or an explicit startup migration gate.