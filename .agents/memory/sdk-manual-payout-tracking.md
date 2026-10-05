---
name: SDK manual payout tracking
description: Keep merchant-visible SDK payout references pollable without treating manual payouts as provider-submitted.
---

For SDK payouts configured for manual handling, persist a generated local reference in the withdrawal's reference field because the SDK transaction-status endpoint resolves withdrawals by that reference. Keep the withdrawal marked manual and its gateway set to manual, so provider retry and status-sync paths cannot submit the local reference. Return the reference and pending status to the merchant without revealing the manual handling mode.

**Why:** SDK clients need a stable value to poll while the actual transfer is handled by an administrator; the current status endpoint does not use a separate merchant-reference field.

**How to apply:** If the status endpoint or reference schema changes, preserve pollability for pending manual SDK withdrawals and ensure every provider callback, sync, or retry path still treats their reference as local only.
