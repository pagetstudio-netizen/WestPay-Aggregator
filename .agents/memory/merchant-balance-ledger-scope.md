---
name: Merchant balance ledger scope
description: Distinguishes per-country integer wallets from separate crypto balances in administrative history.
---

The admin balance ledger records merchant wallets keyed by country. Crypto balances are a separate per-currency balance system and are not included in this ledger.

**Why:** Country wallets use integer amounts and country context, while crypto wallets use decimal amounts and currency context. Combining them without explicit wallet type, currency, and precision would make balances ambiguous.

**How to apply:** Keep crypto history explicit as a separate feature, or model wallet type and currency/precision before unifying the ledgers. Do not describe the country-wallet ledger as covering crypto activity.
