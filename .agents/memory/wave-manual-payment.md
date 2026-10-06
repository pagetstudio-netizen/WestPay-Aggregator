---
name: Wave manual payment options
description: Product constraints for adding a configurable Wave payment link and QR beside existing number-based payments.
---

Keep the existing Wave number and account-holder details available for number payments. The Wave payment-link/QR option is separate, and its QR must be replaceable or removable through admin number management rather than hardcoded. Customers submit proof for manual review; the link flow must not credit a merchant automatically.

On manual-payment success screens, say “Paiement soumis avec succès. Votre paiement est en cours de traitement.” Do not describe the payment as “manual” or “under verification” on that screen. Show a merchant-return button for API Bank1/Bank2 flows; for payment links, show it only when that specific link has a configured redirect URL.

**Why:** The user explicitly asked to preserve the existing Wave number flow while adding a separately managed link/QR option, and specified the success message and return-button rules.

**How to apply:** When changing Wave checkout or admin number management, preserve both choices where configured and route link payments through the existing manual proof-review process. Apply the wording and return-button rule to manual success screens across both checkout banks.
