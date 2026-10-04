---
name: Manual pay-in safety
description: User requirement for keeping private PINs and authentication secrets out of customer-facing manual payment flows.
---

For manual pay-ins, never ask for, store, or include a private PIN or authentication secret. Request only the transaction reference after payment; keep it separate from dialer instructions and USSD codes.

**Why:** The user explicitly set this as a product constraint.

**How to apply:** Do not add PIN/OTP fields or include secrets in copied instructions, Telegram notices, or admin review content. Make the transaction-reference request explicit and warn customers not to submit a secret.