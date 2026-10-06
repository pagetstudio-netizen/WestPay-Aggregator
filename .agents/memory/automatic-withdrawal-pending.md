---
name: Unresolved automatic withdrawals
description: Required handling when an automatic withdrawal is still inconclusive after provider status checks.
---

When an automatic withdrawal remains pending or processing after five inconclusive provider status checks, leave it open for administrator resolution. Stop automatic provider checks, do not mark it failed, and do not refund it automatically. A definitive provider success or failure still follows the normal terminal-status handling.

**Why:** the user asked for unresolved withdrawals to remain pending for the administrator after all five checks, with no automatic refund.

**How to apply:** Keep this rule scoped to automatic withdrawals that reached the five-check limit. Do not change pay-in expiry behavior or statuses returned definitively by a provider.
