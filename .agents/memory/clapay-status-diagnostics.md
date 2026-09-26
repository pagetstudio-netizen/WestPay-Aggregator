---
name: ClaPay failed-status diagnostics
description: What the NoWallet v3 status response reveals when a payin fails without a useful decline reason.
---

For a ClaPay/NoWallet v3 payin, `/check/status/payment` can report `FAILED` with a generic `transaction_observation` such as “Callback processed with status: FAILED” and no actual decline reason. The same response may still identify the service, method, dial code, country code, and submitted phone.

**Why:** A live initiation was accepted, then failed without a handset prompt; the provider confirmed the operator and phone fields but did not expose why delivery failed.

**How to apply:** Compare only the non-sensitive routing fields with the request and the provider’s operator metadata. Do not infer an exact cause or automatically retry a real payment; another attempt requires explicit consent.