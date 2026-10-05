---
name: Wave manual payment options
description: Product constraints for adding a configurable Wave payment link and QR beside existing number-based payments.
---

Keep the existing Wave number and account-holder details available for number payments. The Wave payment-link/QR option is separate, and its QR must be replaceable or removable through admin number management rather than hardcoded. Customers submit proof for manual review; the link flow must not credit a merchant automatically.

**Why:** The user explicitly asked to preserve the existing Wave number flow while adding a separately managed link/QR option.

**How to apply:** When changing Wave checkout or admin number management, preserve both choices where configured and route link payments through the existing manual proof-review process.
