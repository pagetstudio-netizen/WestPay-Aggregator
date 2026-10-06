export const PAYMENT_CHANNEL_UNAVAILABLE_MESSAGE =
  "Canal de paiement temporairement indisponible. Veuillez choisir un autre opérateur ou réessayer plus tard.";

export const PAYMENT_PROVIDER_UNAVAILABLE_MESSAGE =
  "Canal de paiement indisponible pour le moment. Veuillez réessayer plus tard.";

/**
 * Pay-in and payout availability is controlled manually by admin/Telegram
 * maintenance settings; there is no automatic daily time window.
 */
export function isPaymentChannelAvailable(maintenanceDisabled = false): boolean {
  return !maintenanceDisabled;
}
