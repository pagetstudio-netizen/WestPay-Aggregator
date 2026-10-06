---
name: Telegram operator payment routing
description: Confirmed behavior for admin changes to operator providers, manual numbers, and Wave link/QR.
---

Use the same scope as the admin panel: selecting a provider routes both payins and payouts through it; selecting a manual number enables the existing manual-pay-in path and keeps that number as the operator's manual payout route. A Wave link/QR is a separate country-level payment option; changing it must not rewrite the operator's gateway or number. Telegram may activate or deactivate only a link/QR already saved in the panel. If none is configured, direct the admin to the panel rather than collecting the URL or QR in chat.

**Why:** The user clarified that provider selection applies to the whole operator and that manual withdrawals keep their existing behavior; the panel already owns the separate Wave URL/QR configuration.

**How to apply:** Keep gateway/manual-number changes independent from the Wave link setting, and validate manual numbers against the selected operator and country before saving.
