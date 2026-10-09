import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizePaymentMessage } from "./sanitize-payment-message";

test("hides detailed phone validation rules from customer-facing messages", () => {
  assert.equal(
    sanitizePaymentMessage("Numéro de paiement invalide : saisissez au moins 8 chiffres, sans lettres."),
    "Numéro de téléphone invalide.",
  );
});

test("hides detailed reference validation rules from customer-facing messages", () => {
  assert.equal(
    sanitizePaymentMessage("La référence doit contenir au moins 8 caractères non blancs, et au maximum 120 caractères."),
    "Référence invalide.",
  );
});

test("keeps ordinary payment messages and hides provider implementation details", () => {
  assert.equal(sanitizePaymentMessage("Paiement non confirmé."), "Paiement non confirmé.");
  assert.equal(sanitizePaymentMessage("Gateway credential rejected", "Réessayez."), "Réessayez.");
});
