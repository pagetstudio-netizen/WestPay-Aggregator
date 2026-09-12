---
name: LipaPap integration
description: LipaPap pay-in uses documented MOMOAPM/HMAC flows; payout remains intentionally disabled until an official mobile-money payout API is supplied.
---

LipaPap pay-in must use the documented `MOMOAPM` action, `hash` field, request Formula 1, and response/callback Formula 2. The public network list contains 20 operator codes, but numeric `momo_network_id` values and a mobile-money payout endpoint are not documented.

**Why:** Inventing network IDs or a payout endpoint could route money incorrectly or create an unsupported withdrawal flow.

**How to apply:** Keep Sandbox configuration explicit (`CLIENT_KEY`, `SECRET_KEY`, exact `PAYMENT_URL`, optional verified network-ID map). Fail closed when credentials or endpoint are missing, and do not fallback to another gateway for LipaPap payouts.