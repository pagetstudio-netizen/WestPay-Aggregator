---
name: Merchant payment disable flags
description: Merchant-level payin and payout blocking behavior for Telegram administration and transaction APIs.
---

Merchant payout blocking remains represented by the existing `withdrawals_disabled` field for compatibility; payin blocking uses a separate `payin_disabled` field. Operator-level payin and payout availability is controlled manually in the admin panel or through Telegram `/payin` and `/payout`, by country/operator/flow; there is no automatic daily 7h–20h closure.

**Why:** Reusing the established payout flag avoids splitting existing dashboard and merchant withdrawal behavior across two competing sources of truth. The user also wants payin and payout availability controlled manually rather than blocked by a fixed schedule.

**How to apply:** When adding another merchant transaction entry point, check the appropriate merchant and operator flags before side effects; do not add fixed hour-based availability checks. Do not apply the flags to read-only status, balance, or administrative operations.