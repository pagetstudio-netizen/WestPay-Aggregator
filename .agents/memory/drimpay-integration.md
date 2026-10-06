---
name: Drimpay integration constraints
description: Unspecified API capabilities and the safe routing limits for Drimpay.
---

**Rule:** Drimpay documents mobile-money payouts, including Wave in Senegal and Côte d'Ivoire, plus per-country wallet balance lookup. Use the documented API v2 fields and exact provider-supplied operator codes; do not invent codes or bank-transfer routing. A failed payout must claim its pending status and refund the merchant balance in one financial-database transaction.

**Why:** Drimpay's official payout documentation now specifies `POST /payout/initiate`, `GET /payout/wallets/{country_code}/balance`, and country/operator availability. The Wave operator code itself must still come from Drimpay; a wrong code can route or reject an irreversible payout. If the payout status change and refund are separate, a partial failure can permanently leave the merchant unpaid.

**How to apply:** Query the official balance endpoint once per configured ISO country code and label those as country wallets, not an invented global balance. Send the documented country, operator, phone, amount, webhook, and stable idempotency reference for mobile payouts. Keep bank transfers unavailable until Drimpay documents their fields. Preserve pending-status compare-and-set and atomic refunds across webhook, manual admin checks, and scheduled reconciliation.