---
name: Telegram merchant onboarding
description: User decisions for merchant creation and country activation through Telegram.
---

For WestPay merchant onboarding, post the generated account welcome message and credentials in the configured admin group, not in the invoking admin's private chat. It uses the merchant email and password for login, and the same email plus a separate six-digit PIN for API documentation. Do not include a `/setmerchant` activation code in this welcome message; admins generate one separately for a merchant and use it in the target group. Country activation from the panel and Telegram must use the same supported merchant-country list and only add/reactivate that merchant's country row. Provider/number configuration remains separate and is not part of activation. Newly created country rows should inherit the gateway or manual recipient number configured by the admin for the selected operator. The stored settlement cycle is informational only.

Merchant creation from Telegram must be invoked only in the configured administrator group and only by a Telegram creator or administrator of that group. Reject private-chat and other-group invocations; do not create the account unless the bot successfully deletes the command containing the TOTP.

Private Telegram chats must be silent except for `/start` account activation. Ignore other private messages and commands; administrator commands belong in the configured admin group.

**Why:** The user requires account-creation and other administrator commands to be used only in the admin group, and does not want replies to arbitrary private messages. `/start` remains the required merchant account-activation flow.

**How to apply:** Keep login password and docs PIN distinct. Leave the per-country gateway override empty for new rows so operator configuration controls routing; preserve explicit existing overrides when reactivating a row. Limit the credentials broadcast to the configured admin group. Restrict merchant creation to group administrators in that exact group, and update Telegram help to match. Ignore private messages and commands except `/start`; do not move account activation out of that flow without an explicit request. Generate one-time `/setmerchant` codes on a separate admin command and leave them out of the account welcome message. Do not treat D0/D+N or periodic settlement-cycle labels as test mode.
