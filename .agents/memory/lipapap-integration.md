---
name: LipaPap integration
description: LipaPap uses documented MOMO/MOMOPAYOUT flows; account-balance lookup still needs an official balance API.
---

LipaPap pay-in uses the documented `MOMO` action and Formula 1/HMAC callback flow. Mobile-money payout uses `MOMOPAYOUT`, Formula 3 for requests, Formula 4 for `PAYOUT_STATUS`, and Formula 2 for callbacks. The public payout provider-code table currently documents KES/MPESA, GHS/MTN/VOD/ATM, XOF/MTN_BJ/MOOV_BJ/TMONEY_TOGO. The documentation does not expose an account-balance action or endpoint.

**Why:** Inventing a balance action or endpoint could return misleading funds information; payout requests also need provider codes that are explicitly enabled for the account.

**How to apply:** Keep credentials, registered payer email, and the official `https://gateway.lipapap.net/post` endpoint explicit. Fail closed when payout credentials/provider codes are missing. Add a Telegram balance lookup only after LipaPap supplies the balance method, signature, and response schema.

The latest LipaPap operator-code document distinguishes `id (send this)` from `Lipapap_code (do NOT send)`: `TMONEY_TG` must send operator ID `20`, while `165` is reference-only. Other entries also use the `id` column, including numeric and text IDs.

**Why:** Sending the `Lipapap_code` column caused Togo T-Money to return `MOMO network not found`; the new document explicitly says only the operator `id` is sent.

**How to apply:** Keep `TMONEY_TG` mapped to `20` for pay-in, never `165`; keep payout `provider_code` mappings separate because their table uses different fields.

LipaPap's `MOMOPAYOUT` Sandbox validates a separate `customer_name` field in addition to `account_name`; once present, the payout reached the provider's balance check and returned `Insufficient Balance`.

**Why:** Sending only the account/beneficiary name is rejected before signature or balance validation, while the provider's 402 response confirms the remaining payload and payout hash were accepted far enough to check funds.

**How to apply:** Keep `customer_name` and `account_name` in payout payloads, use the configured country/operator `provider_code`, and treat HTTP 402 `Insufficient Balance` as a provider-account funding issue rather than a payload or signature error.

## Sandbox validation

The configured Sandbox request reaches the LipaPap endpoint but is rejected with HTTP 400 `Hash mismatch`; the official v5.3.1 docs define Formula 1 as HMAC-SHA256 over client_key, order_id, order_amount, order_currency, order_description, card fields, payer_email, payer_phone, payer_ip, secret_key, using secret_key as the HMAC key.

**Why:** Retrying with the same signature only repeats the provider rejection and can create unnecessary Sandbox orders.

**How to apply:** Confirm the Sandbox `CLIENT_KEY`/`SECRET_KEY` pair and the official Formula 1 field order/format with LipaPap, then update the admin settings or signing code before retrying.

The published Formula 1 implementation was independently validated locally and tested against the Sandbox with `MOMOAPM`, Togo/T-Money, `1000.00` XOF, and the approved test number; LipaPap still returns `Hash mismatch` after excluding `action` from the signature and using the documented decimal amount.

**Why:** The documentation's sample hashes are reused across materially different sample payloads, so they cannot serve as reliable fixtures; the remaining mismatch needs a provider-confirmed canonical payload/signing example rather than more blind retries.

**How to apply:** Obtain one redacted provider-generated signature fixture for the exact `MOMOAPM` payload, especially whether `order_currency` and `payer_ip` are included or empty, before attempting another real Sandbox request.

LipaPap explicitly confirmed that the initial pay-in action must be `MOMO`; after normalizing the application to send `MOMO`, the Sandbox still returned `Hash mismatch` while Formula 1 HMAC was used.

**Why:** The action name was an independent provider requirement, but changing it did not resolve the signature rejection; the remaining discrepancy is in the canonical pay-in signing inputs or credentials.

**How to apply:** Keep `MOMO` as the normal pay-in action and do not revert to `MOMOAPM`; use the provider-confirmed shared request hash below.

LipaPap subsequently confirmed that the PHP calculation example is shared by both `MOMO` and `MOMOPAYOUT`; it uses MD5 over uppercase(reverse(email) + secret + reverse(first six + last four phone/account)), producing 32 characters.

**Why:** The provider's direct clarification supersedes the earlier public-document interpretation for this merchant account; the HMAC attempt remained rejected.

**How to apply:** Use the shared MD5 formula for both pay-in and payout initiation requests, while keeping callback/status signatures unchanged until LipaPap confirms those flows separately.

With the shared MD5 formula, numeric Togo MSISDN `22872086435` passes LipaPap's hash validation but returns `Invalid mobile number`; adding `+` to the body while hashing digits returns `Hash mismatch`, so the exact Sandbox mobile-number representation remains provider-specific.

**Why:** This isolates the remaining pay-in failure to phone canonicalization/number eligibility rather than the shared hash.

**How to apply:** Preserve the numeric representation for signing and obtain LipaPap's exact accepted T-Money Sandbox phone format before another real retry.

Using the provider-confirmed PHP formula independently for local `72086435`, international `22872086435`, and `+22872086435` all produced 32-character hashes and all reached LipaPap, which returned `Invalid mobile number` for each.

**Why:** Testing all three canonical phone representations isolates the remaining failure to the Sandbox number's eligibility or T-Money test data, not hash formatting.

**How to apply:** Ask LipaPap for a valid Togo/T-Money Sandbox test MSISDN and confirm the account's network mapping before further retries.

The operator-code document lists Côte d'Ivoire MTN as operator ID `32` to send; `433` is reference-only. A direct Sandbox `MOMO` request with CI/MTN/`2250789012345` returned HTTP 200 `PENDING`, and the full Homily application flow succeeded after routing Homily's CI pay-in to LipaPap.

**Why:** This validates the shared MD5 formula, CI country/network mapping, and application routing independently of the still-unsupported Togo Sandbox case.

**How to apply:** Route CI MTN pay-ins through LipaPap with `momo_network_id=32`; do not send `433`. Keep `payer_ip` out of LipaPap pay-in payloads because the provider returned a decryption error when the application included it, while the same request without it succeeded.

The supplied v5.3.1 documentation confirms Kenya M-Pesa pay-in through `STK_PUSH` with KES and a `2547...` phone number; this flow must not require `momo_network_id`. Nigeria is confirmed only for NIP bank payout: NGN, provider code `000033`, and a bank account number distinct from a mobile phone.

**Why:** Nigeria's supplied documentation does not define a mobile-money pay-in operator or network id, while treating a bank account as a phone number would create an invalid payout request.

**How to apply:** Route only Kenya M-Pesa to `STK_PUSH`; keep other pay-ins on their documented action. Route Nigeria NIP as a bank transfer with provider code `000033`, store/use `account_number` separately, and fail closed for Nigeria pay-in until LipaPap supplies its operator mapping.

The pay-in initiation can be accepted while the current transaction-status probe returns `ERROR` with a “Missing required fields” response, even when the JSON includes `client_key`, `transactionId`, and `hash`; the status endpoint/schema is not yet confirmed.

**Why:** LipaPap’s status response did not match the initiation endpoint’s JSON contract, so treating that probe result as a payment failure could misclassify an accepted live payment.

**How to apply:** Keep live payment records pending until LipaPap confirms the exact status endpoint, content type, field names, and signing formula; do not retry the payment just because the status probe returns this error.

The production `GET_TRANS_STATUS` endpoint recognizes `transaction_id` (snake case), despite its missing-fields message naming `transactionId`; camel case returns the missing-fields error, while snake case reaches the lookup and currently returns `Transaction not found`.

**Why:** This distinguishes a request-schema error from an identifier or provider-availability error without creating another live payment.

**How to apply:** Send `transaction_id` for status lookups, preserve the provider's “not found” response for investigation, and do not treat it as proof of a customer payment failure.