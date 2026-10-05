---
name: Pay-in failure handling
description: Customer and administrator behavior when a provider cannot initiate a deposit.
---

When a provider definitively rejects or cannot initiate a deposit, do not advance the customer into the payment step. Show that the payment channel is temporarily unavailable, and send the operational error details to the administrator Telegram group.

**Why:** The user requires failed deposits to stop at checkout while administrators receive the error for follow-up.

**How to apply:** Keep customer-facing messages generic and send provider/configuration details through the existing admin error notification. Do not classify an uncertain provider result as a confirmed failure or invite a retry; leave it pending and alert administrators to avoid duplicate deposits.
