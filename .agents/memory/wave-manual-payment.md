---
name: Wave manual payment options
description: Product constraints for adding a configurable Wave payment link and QR beside existing number-based payments.
---

Keep the existing Wave number and account-holder details available for number payments. Store the separate Wave payment-link/QR only as admin-managed configuration—never hardcode or seed it—and make it easy to disable, delete, or replace without changing number or API-provider settings. New link/QR configs start disabled and can only be activated when the country’s Wave operator is active and set to « Manuel ». If operator routing changes, disable the active link/QR and require explicit reactivation. When link/QR is active, expose one Wave checkout option rather than a duplicate provider option. Customers submit proof for manual review; the link flow must not credit a merchant automatically.

Keep the configured QR code unchanged. On the Wave link/QR instruction page, omit the Wave logo from the top header; keep the logo on the success screen.

Show and require the payer's phone number on the Wave link/QR checkout, and pass it with the payment-initiation request.

On manual-payment success screens, say “Paiement soumis avec succès. Votre paiement est en cours de traitement.” Do not describe the payment as “manual” or “under verification” on that screen. Show a merchant-return button for API Bank1/Bank2 flows; for payment links, show it only when that specific link has a configured redirect URL.

When notifying admins about a submitted Wave link/QR payment, include the exact Wave payment URL saved on that pending payment, not the country's current configuration.

**Why:** The user asked admins to see which Wave link the customer used when submitting a payment.

**How to apply:** Pass the persisted Wave URL to the admin notification only for Wave link/QR submissions, so later configuration changes cannot misidentify the payment destination.

**Why:** The user explicitly changed the header-logo requirement: remove the Wave logo from the QR payment instruction page, while keeping it on the success screen. The user also confirmed the payer's phone number is needed for the Wave link/QR flow. Other confirmed constraints remain: link/QR activation depends on the Wave operator being in « Manuel » mode, the existing number flow remains available, and payment-link QR submissions keep manual review.

**How to apply:** Manage the link and QR through the admin config panel; default new configs to disabled, validate Manual mode on activation, and deactivate links when Wave routing changes. Preserve the number/provider options and the Wave icon in the checkout-method selector. Require and pass the payer's phone number for Wave link/QR checkouts. Omit only the logo at the top of the QR instruction page; keep it on success. Route link payments through the existing manual proof-review process and preserve the success-message and return-button rules.

For customer-initiated Wave manual-link payments in XOF, add or replace the `amount` query parameter only when the customer opens an HTTPS URL whose exact host is `pay.wave.com`. Preserve the saved account path, other query parameters, and fragment; do not alter the administrator's stored URL, QR code, non-XOF countries, or links on other hosts. Keep collecting the transaction reference and leave the payment pending for manual review.

**Why:** The user explicitly requires Wave to receive the selected XOF amount without changing the payment page, QR code, other countries, or manual-review process.

**How to apply:** Transform a valid integer XOF amount at the customer click handler, not when saving/loading the configuration. Leave other URLs/currencies byte-for-byte unchanged and never treat opening the link as payment confirmation.
