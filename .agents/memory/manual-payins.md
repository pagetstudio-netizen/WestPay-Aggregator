---
name: Manual pay-in handling
description: Safety constraints and post-approval side effects for manual merchant pay-ins.
---

For manual pay-ins, never ask for, store, or include a private PIN or authentication secret. Request only the transaction reference after payment; keep it separate from dialer instructions and USSD codes.

Payment phone inputs must contain at least eight digits and no letters. Manual-payment and Wave-link references may contain text or numbers, but must contain at least eight non-space characters.

**Why:** the user explicitly set the minimum input requirements for payment numbers and transaction references.

**How to apply:** enforce the phone and reference rules in both the public form and server routes; do not reject a valid-length text reference solely because it contains letters.

When the customer submits the transaction reference, the admin-group notification must show that customer reference and the generated deposit reference as separately labeled, searchable lines, alongside the customer number, country, operator, merchant, amount, and recipient number.

After a manual payment is approved, send the standard deposit notification to the merchant's linked Telegram chat/group, keep the confirmed transaction visible in merchant history, and dispatch the standard `payment.confirmed` webhook when configured. Run these side effects only for a newly approved payment, not an already-approved one.

For manual-payment and Wave-link status checks, keep the loading view visible long enough to notice and leave non-confirmed results on the page until the customer retries or edits the payment reference.

Manual numbers must use an operator selected from the operators configured for the chosen country. Store the public USSD template on the number. Selecting the “Manuel” gateway and its saved number routes that operator's pay-ins and withdrawals manually; do not require a separate manual-pay-in toggle, and do not change other operators.

**Why:** The user explicitly set this as a product constraint.

**Why:** The user explicitly reported that the status-check view and result disappear too quickly and said this is not acceptable.

**How to apply:** Do not add PIN/OTP fields or include secrets in copied instructions, Telegram notices, or admin review content. Make the transaction-reference request explicit and warn customers not to submit a secret. On submission, label both references separately for group search. On approval, use the usual notification, history, and signed/idempotent webhook paths. Preserve status-check feedback on the payment page until another status check starts or the reference is edited.

**Why:** the user asked to keep the manual route tied to the selected operator and saved number, with the USSD template managed on the number.

**How to apply:** Filter the number form's operator choices by country. Treat the operator's “Manuel” gateway plus selected number as the setting for both manual payment directions; avoid a second pay-in switch and preserve other operators' settings.