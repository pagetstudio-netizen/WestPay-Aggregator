---
name: SeaPay operator seeding pattern
description: How new-country withdrawal operators (SeaPay) get seeded, and the India IFSC structural gap.
---

Withdrawal operators for a new payment gateway/country (e.g. SeaPay's Pakistan/Philippines/India) should be seeded via an idempotent function called unconditionally on every `seedDatabase()` run (checked via `getWithdrawalOperatorByNameAndCountry` before insert), not gated behind the one-time "admin seed disabled" flag. That flag only guards initial admin/merchant account creation — operator lists need to stay in sync across restarts even on existing installs.

**Why:** The existing `seedDatabase()` has an early-return path once an admin exists (`admin_seed_permanently_disabled` flag), which would silently skip seeding new operators on every environment except a brand-new install. Operator seeding was placed before that check, alongside `enforceCompromisedAccountSuspensions()`.

**How to apply:** When a new payment gateway introduces a fixed list of country operators (bank codes, wallet codes), write a dedicated `ensureXxxOperatorsExist()` function, call it at the very top of `seedDatabase()`, and match operator `name` exactly against whatever the payment/withdrawal UI and routes.ts use to look up `getWithdrawalOperatorByNameAndCountry(name, country)` (e.g. must match the frontend's PAYMENT_METHODS names character-for-character).

**India / IFSC gap:** SeaPay's India payout requires a free-form IFSC bank code supplied per-transaction (`payee_bank` param) — there is no fixed bank list like Pakistan's PKR1-PKR46. A single generic "Virement bancaire (IFSC)" operator was seeded as a placeholder, but the withdrawal request form only has a `phone` field — a dedicated IFSC/account-number input needs to be added to fully support India withdrawals.
