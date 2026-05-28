---
name: SendavaPay SDK integration
description: How SendavaPay's API actually works vs documentation — key gotchas for the CORS endpoints
---

## Rule
SendavaPay's CORS endpoints (`/api/soleaspay/services/:cc`, `/api/pay-api/:ref`) are **Cloudflare-protected** and block all server-to-server calls regardless of auth headers. The correct flow uses their **official JS SDK** (`sendavapay.js`) loaded dynamically from the browser.

## Flow
1. Backend: `POST /api/sdk/v1/create-payment` (Bearer sdk key) → returns `paymentToken` + `reference`
2. Frontend: load `https://sendavapay.com/sdk/sendavapay.js` dynamically
3. Frontend: call `SendavaPay.init({ token: paymentToken, onSuccess, onFailed })`
4. SDK opens its own payment modal (handles operator selection, USSD, OTP internally)
5. `onSuccess` → start polling to confirm; `onFailed` → show error
6. Webhook: `POST /api/sendavapay/callback` — `sha256=HMAC_SHA256(secret, rawBody_buffer)` in `X-SendavaPay-Signature`

## Why
Tried calling CORS endpoints from server proxy — all returned `{"message":"Accès refusé."}`. 
Cloudflare blocks non-browser requests. The `create-payment` backend API works correctly.
The `GET /api/sdk/widget/token/:paymentToken` endpoint also works server-side.

## Phone format
CI (Côte d'Ivoire): `0595857098` → E.164: `+2250595857098` (225 + 10 digits starting with 0).
Backend returns `payerPhoneE164` in the payment initiate response.

## DB keys
- `sendavapay_api_key` (sk_live_...) — used for backend SDK calls
- `sendavapay_api_secret` (ps_...) — stored for reference
- Env secrets: `SENDAVA_API_KEY` (checked first), `SENDAVA_WEBHOOK_SECRET`
- `getSendavaApiKey()` checks env first, then DB `sendavapay_api_key`
