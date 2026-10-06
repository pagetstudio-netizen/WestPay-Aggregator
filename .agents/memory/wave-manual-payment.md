---
name: Wave manual payment options
description: Product constraints for adding a configurable Wave payment link and QR beside existing number-based payments.
---

Keep the existing Wave number and account-holder details available for number payments. Store the separate Wave payment-link/QR only as admin-managed configuration—never hardcode or seed it—and make it easy to disable, delete, or replace without changing number or API-provider settings. Customers submit proof for manual review; the link flow must not credit a merchant automatically.

On manual-payment success screens, say “Paiement soumis avec succès. Votre paiement est en cours de traitement.” Do not describe the payment as “manual” or “under verification” on that screen. Show a merchant-return button for API Bank1/Bank2 flows; for payment links, show it only when that specific link has a configured redirect URL.

**Why:** The user explicitly asked to preserve the existing Wave number flow, avoid hardcoding/seeding the link or QR, keep it easy to switch, and specified the success message and return-button rules.

**How to apply:** Manage the link and QR through the admin config panel; preserve the number/provider options, and route link payments through the existing manual proof-review process. Apply the wording and return-button rule to manual success screens across both checkout banks.
