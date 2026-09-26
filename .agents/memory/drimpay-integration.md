---
name: Drimpay integration constraints
description: Unspecified API capabilities and the safe routing limits for Drimpay.
---

**Rule:** Do not invent a Drimpay account-balance endpoint or enable bank payouts without an official API specification. Keep country, currency, and mobile-money operator codes explicitly configured from provider-supplied values. A failed payout must claim its pending status and refund the merchant balance in one financial-database transaction.

**Why:** The available Drimpay documentation used for integration does not specify balance lookup or bank-transfer payout fields. Guessing could display an incorrect balance or send an irreversible payout with the wrong routing data. If the status change and refund are separate, a partial failure can permanently leave the merchant unpaid.

**How to apply:** If adding balance display or bank payouts, first obtain the official endpoint, authentication, request, and response formats; then implement and test the provider adapter. Until then, leave those capabilities unavailable. Preserve the pending-status compare-and-set and atomic refund across webhook, manual admin checks, and scheduled reconciliation.