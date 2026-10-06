---
name: Wave manual payment options
description: Product constraints for adding a configurable Wave payment link and QR beside existing number-based payments.
---

Keep the existing Wave number and account-holder details available for number payments. Store the separate Wave payment-link/QR only as admin-managed configuration—never hardcode or seed it—and make it easy to disable, delete, or replace without changing number or API-provider settings. New link/QR configs start disabled and can only be activated when the country’s Wave operator is active and set to « Manuel ». If operator routing changes, disable the active link/QR and require explicit reactivation. When link/QR is active, expose one Wave checkout option rather than a duplicate provider option. Customers submit proof for manual review; the link flow must not credit a merchant automatically.

Always display the Wave logo on the Wave link-payment header and success screen, and keep the configured QR code unchanged.

On manual-payment success screens, say “Paiement soumis avec succès. Votre paiement est en cours de traitement.” Do not describe the payment as “manual” or “under verification” on that screen. Show a merchant-return button for API Bank1/Bank2 flows; for payment links, show it only when that specific link has a configured redirect URL.

When notifying admins about a submitted Wave link/QR payment, include the exact Wave payment URL saved on that pending payment, not the country's current configuration.

**Why:** The user asked admins to see which Wave link the customer used when submitting a payment.

**How to apply:** Pass the persisted Wave URL to the admin notification only for Wave link/QR submissions, so later configuration changes cannot misidentify the payment destination.

**Why:** The user explicitly requires the Wave logo to remain visible, and clarified that link/QR activation depends on the Wave operator being in « Manuel » mode to prevent duplicate provider options. The user also asked to preserve the existing number flow, avoid hardcoding/seeding the link or QR, and specified the success message and return-button rules.

**How to apply:** Manage the link and QR through the admin config panel; default new configs to disabled, validate Manual mode on activation, and deactivate links when Wave routing changes. Preserve the number/provider options, show only one Wave checkout entry with its logo, and route link payments through the existing manual proof-review process. Apply the wording and return-button rule to manual success screens across both checkout banks.
