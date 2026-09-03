---
name: Merchant payment disable flags
description: Merchant-level payin and payout blocking behavior for Telegram administration and transaction APIs.
---

Merchant payout blocking remains represented by the existing `withdrawals_disabled` field for compatibility; payin blocking uses a separate `payin_disabled` field. The admin Telegram disable command sets both flags and transaction initiation endpoints return the exact shared 404 message.

**Why:** Reusing the established payout flag avoids splitting existing dashboard and merchant withdrawal behavior across two competing sources of truth.

**How to apply:** When adding another merchant transaction entry point, check the appropriate flag before side effects; do not apply these flags to read-only status, balance, or administrative operations.