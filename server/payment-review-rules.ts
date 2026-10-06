export type PaymentReviewSubject = {
  source: "pending" | "transaction";
  gateway: string;
  status: string;
};

export type PaymentReviewActions = {
  approve: boolean;
  reject: boolean;
};

const OPEN_PAYMENT_STATUSES = new Set([
  "pending",
  "provider_pending",
  "gateway_pending",
  "lipapap_pending",
  "submitted",
  "manual_submitted",
]);

export function getPaymentReviewActions(payment: PaymentReviewSubject): PaymentReviewActions {
  const status = payment.status.trim().toLowerCase();
  const isManual = payment.gateway.trim().toLowerCase() === "manual";

  if (payment.source === "pending" && isManual && status === "manual_waiting_submission") {
    return { approve: false, reject: true };
  }

  const actionable = OPEN_PAYMENT_STATUSES.has(status);
  return { approve: actionable, reject: actionable };
}
