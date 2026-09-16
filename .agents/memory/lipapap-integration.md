---
name: LipaPap integration
description: LipaPap uses documented MOMO/MOMOPAYOUT flows; account-balance lookup still needs an official balance API.
---

LipaPap pay-in uses the documented `MOMO` action and Formula 1/HMAC callback flow. Mobile-money payout uses `MOMOPAYOUT`, Formula 3 for requests, Formula 4 for `PAYOUT_STATUS`, and Formula 2 for callbacks. The public payout provider-code table currently documents KES/MPESA, GHS/MTN/VOD/ATM, XOF/MTN_BJ/MOOV_BJ/TMONEY_TOGO. The documentation does not expose an account-balance action or endpoint.

**Why:** Inventing a balance action or endpoint could return misleading funds information; payout requests also need provider codes that are explicitly enabled for the account.

**How to apply:** Keep credentials, registered payer email, and the official `https://gateway.lipapap.net/post` endpoint explicit. Fail closed when payout credentials/provider codes are missing. Add a Telegram balance lookup only after LipaPap supplies the balance method, signature, and response schema.

The Network ID Mapping table's `LipaPap Code` column is the active pay-in mapping source; for the supplied table, `TMONEY_TG` maps to `165`, while some Ghana/MPESA entries use text codes. The first `ID` column is not used as the API value.

**Why:** The table has separate `ID`, `Network ID`, and `LipaPap Code` columns; using the row ID would send the wrong provider value, and documented codes are mixed numeric/text.

**How to apply:** Use the documented non-NULL `LipaPap Code` values as pay-in network values, allow both numeric and alphanumeric values, and keep payout `provider_code` mappings separate.