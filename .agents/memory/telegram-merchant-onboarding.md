---
name: Telegram merchant onboarding
description: User decisions for merchant creation and country activation through Telegram.
---

For WestPay merchant onboarding, post the generated account welcome message and credentials in the configured admin group, not in the invoking admin's private chat. It uses the merchant email and password for login, and the same email plus a separate six-digit PIN for API documentation. Do not include a `/setmerchant` activation code in this welcome message; admins generate one separately for a merchant and use it in the target group. Newly created country rows should inherit the gateway or manual recipient number configured by the admin for the selected operator. Do not ask for a provider when activating a country. The stored settlement cycle is informational only.

**Why:** The user chose the existing documentation PIN flow, specified that account credentials go to the admin group, requested separate Telegram generation of `/setmerchant` codes, and clarified that gateway/number selection is already configured by the admin for each operator.

**How to apply:** Keep login password and docs PIN distinct. Leave the per-country gateway override empty for new rows so operator configuration controls routing; preserve explicit existing overrides when reactivating a row. Limit the credentials broadcast to the configured admin group. Generate one-time `/setmerchant` codes on a separate admin command and leave them out of the account welcome message. Do not treat D0/D+N or periodic settlement-cycle labels as test mode.
