---
name: Legacy gateway retirement
description: Safety rules for stopping a payment provider without misrouting in-flight operations.
---

Never reinterpret an in-flight operation from a retired gateway as a transaction at its replacement. Keep its provider reference attached to the historical record, mark it non-pollable, and prevent status checks or background jobs from sending that reference to another provider. Do not retry an operation that already has a provider reference; resolve or reject it first, then create a distinct operation.

**Why:** A provider reference identifies a specific external payment or payout. Reusing it with another gateway can hide the old operation's status, duplicate a payout, or incorrectly credit a payment.

**How to apply:** During gateway retirement, distinguish unsent requests from submitted requests. Only requests without a provider reference can be safely assigned to the replacement; retain old references and financial rows for reconciliation and audit.