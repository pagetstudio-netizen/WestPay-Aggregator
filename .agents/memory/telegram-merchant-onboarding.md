---
name: Telegram merchant onboarding
description: User decisions for merchant creation and country activation through Telegram.
---

For WestPay merchant onboarding, the welcome message uses the merchant email and password for merchant login, and the same email plus a separate six-digit PIN for API documentation. Newly created country rows should inherit the gateway or manual recipient number configured by the admin for the selected operator. Do not ask for a provider when activating a country. The stored settlement cycle is informational only.

**Why:** The user chose the existing documentation PIN flow, said activated countries should collect as usual, and clarified that gateway/number selection is already configured by the admin for each operator.

**How to apply:** Keep login password and docs PIN distinct. Leave the per-country gateway override empty for new rows so operator configuration controls routing; preserve explicit existing overrides when reactivating a row. Do not treat D0/D+N or periodic settlement-cycle labels as test mode.
