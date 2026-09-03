---
name: MbiyoPay balance endpoint
description: Official endpoint and response mapping for retrieving MbiyoPay merchant wallet balances.
---

MbiyoPay merchant balances are retrieved with `GET /api/v1/balances` using the merchant API key as a Bearer token. The response returns one entry per currency with `amount`, optional `hold`, and an optional ISO country code.

**Why:** MbiyoPay uses `/balances` for the merchant wallet lookup even though payment and payout operations use `/merchant/...` paths.

**How to apply:** Keep the gateway balance integration on `/api/v1/balances`; map `amount` to available balance and `hold` to the frozen/held amount.