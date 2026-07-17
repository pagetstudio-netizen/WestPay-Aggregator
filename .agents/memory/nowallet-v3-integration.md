---
name: NoWallet (ClaPay) API v3
description: Key quirks discovered while integrating the NoWallet v3 API — phone format, tunnel modes, endpoint differences vs older API.
---

## Phone number format
- API validation rejects international format (`+22899935673`, `22899935673`) with `ERROR_PHONE_NUMBER_LENGTH_IS_TOO_SHORT`
- Must send **local digits only** (e.g. `99935673` for Togo) in `additional_infos.customer_phone`
- Helper `clapayLocalPhone(phone, countryCode)` in `server/clapay.ts` strips dial code automatically

**Why:** NoWallet validates length against a per-country local digit count (TG=8, BJ=10, CI=10, SN=9, CM=9, etc.), not international E.164 length.

**How to apply:** Always call `clapayLocalPhone()` before passing phone to `additional_infos.customer_phone`.

## Tunnel modes
- `tunnel: "API"` — direct push to user's phone (no redirection). Requires a valid local phone number.
- `tunnel: "CHECKOUTPAGE"` — returns a `payment_url`; user enters phone on hosted page. **Only** for Wave and Mynita operators.

**NEVER** fallback automatically to CHECKOUTPAGE when phone is missing — return an explicit error instead.

**Why:** Wave requires QR code flow; Mynita has no USSD push support. All other operators use API direct. Silently falling back to CHECKOUTPAGE was hiding phone validation errors from the user.

**Helpers in `server/clapay.ts`:**
- `isClapayCheckoutOperator(code)` — returns true for WAVE and MYNITA codes
- `clapaySelectTunnel(operatorCode)` — returns tunnel based on operator only (no phone param)
- `clapayValidatePhone(rawPhone, countryCode)` — returns `{ ok, localPhone }` or `{ ok: false, error }` with a user-facing message; call this before initiating API tunnel payments

## Endpoints (v3 vs old)
| Function | Old endpoint | v3 endpoint |
|---|---|---|
| Payin | POST `/init/payment` (old payload) | POST `/init/payment` — `transaction_id`, `operators_code[]`, `method: "MERCHANT"`, `tunnel` |
| Payout | POST `/init/payout` (does not exist in v3) | POST `/init/payment` with `method: "CASHIN"` |
| Status check | GET `/transactions/{reference}` | POST `/check/status/payment` with body `{"signature": "..."}` |
| Balance | GET `/balance` | GET `/check/transactions/single/balances/{country}` |

## Signature flow
- Init response returns `signature` (e.g. `ASHTEC-af815927-c81637258d59`) — this is the key for status checks
- Stored as `omnipayTxId` in `pending_payments`; `omnipayReference` stores the merchant's `transaction_id`
- Webhook payload `transaction_id` = our merchant reference (for lookback lookup)

## Operators metadata
- GET `{baseUrl}/operators/data?country=TG` returns operator codes, `startwith` prefixes, OTP requirements
- Togo MOOV (`codeoperator: "MOOV"`) — no OTP needed, `startwith: ["96","97","98","99","79"]`
- Togo TMONEY — requires QR code (`secure.qrcode.MERCHANT: true`)

## customer_phone in CHECKOUTPAGE mode
- Do NOT send `customer_phone` in CHECKOUTPAGE tunnel — causes `ERROR_PHONE_NUMBER_LENGTH_IS_TOO_SHORT` even with a valid local number
- CHECKOUTPAGE: user enters phone on the hosted page
