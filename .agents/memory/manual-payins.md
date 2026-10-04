---
name: Manual pay-in handling
description: Safety constraints and post-approval side effects for manual merchant pay-ins.
---

For manual pay-ins, never ask for, store, or include a private PIN or authentication secret. Request only the transaction reference after payment; keep it separate from dialer instructions and USSD codes.

When the customer submits the transaction reference, the admin-group notification must show that customer reference and the generated deposit reference as separately labeled, searchable lines, alongside the customer number, country, operator, merchant, amount, and recipient number.

After a manual payment is approved, send the standard deposit notification to the merchant's linked Telegram chat/group, keep the confirmed transaction visible in merchant history, and dispatch the standard `payment.confirmed` webhook when configured. Run these side effects only for a newly approved payment, not an already-approved one.

**Why:** The user explicitly set this as a product constraint.

**How to apply:** Do not add PIN/OTP fields or include secrets in copied instructions, Telegram notices, or admin review content. Make the transaction-reference request explicit and warn customers not to submit a secret. On submission, label both references separately for group search. On approval, use the usual notification, history, and signed/idempotent webhook paths.