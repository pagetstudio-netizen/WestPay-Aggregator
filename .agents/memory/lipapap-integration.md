---
name: LipaPap integration
description: LipaPap uses documented MOMO/MOMOPAYOUT flows; account-balance lookup still needs an official balance API.
---

LipaPap pay-in uses the documented `MOMO` action and Formula 1/HMAC callback flow. Mobile-money payout uses `MOMOPAYOUT`, Formula 3 for requests, Formula 4 for `PAYOUT_STATUS`, and Formula 2 for callbacks. The public payout provider-code table currently documents KES/MPESA, GHS/MTN/VOD/ATM, XOF/MTN_BJ/MOOV_BJ/TMONEY_TOGO. The documentation does not expose an account-balance action or endpoint.

**Why:** Inventing a balance action or endpoint could return misleading funds information; payout requests also need provider codes that are explicitly enabled for the account.

**How to apply:** Keep credentials, registered payer email, and the official `https://gateway.lipapap.net/post` endpoint explicit. Fail closed when payout credentials/provider codes are missing. Add a Telegram balance lookup only after LipaPap supplies the balance method, signature, and response schema.

The Network ID Mapping table's `LipaPap Code` column is the source for pay-in mappings; for the supplied table, `TMONEY_TG` maps to `165`, while some Ghana/MPESA entries use text codes. These values must remain administrator-configurable.

**Why:** The table has separate `ID`, `Network ID`, and `LipaPap Code` columns; using the row ID would send the wrong provider value, and documented codes are mixed numeric/text. Provider values can change without a code release.

**How to apply:** Enter the documented non-NULL `LipaPap Code` values in the admin network mapping JSON, allow numeric and alphanumeric values, and configure payout `provider_code` mappings separately in the admin panel.

## Sandbox validation

The configured Sandbox request reaches the LipaPap endpoint but is rejected with HTTP 400 `Hash mismatch`; replacing the stored credentials with the secure Sandbox pair and adding the provider's sample fields did not change the result, so the exact signing formula/field order still needs confirmation.

**Why:** Retrying with the same signature only repeats the provider rejection and can create unnecessary Sandbox orders.

**How to apply:** Confirm the Sandbox `CLIENT_KEY`/`SECRET_KEY` pair and the official Formula 1 field order/format with LipaPap, then update the admin settings or signing code before retrying.