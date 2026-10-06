export type PaymentReferenceFields = {
  txId?: string | null;
  providerReference?: string | null;
  providerTxId?: string | null;
};

function normalizedReference(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function references(record: PaymentReferenceFields): string[] {
  return [record.txId, record.providerReference, record.providerTxId]
    .map(normalizedReference)
    .filter((value): value is string => value !== null);
}

export function removePaymentAttemptsAlreadyFinalized<T extends PaymentReferenceFields>(
  payments: T[],
  transactions: PaymentReferenceFields[],
): T[] {
  const transactionReferences = new Set(transactions.flatMap(references));
  return payments.filter(payment =>
    !references(payment).some(reference => transactionReferences.has(reference)),
  );
}

export function normalizeMerchantPaymentStatus(status: string): "confirmed" | "pending" | "failed" {
  const normalized = status.trim().toLowerCase();

  if (
    ["confirmed", "success", "completed", "paid"].includes(normalized) ||
    /_(confirmed|completed|paid)$/.test(normalized)
  ) {
    return "confirmed";
  }

  if (
    ["failed", "rejected", "expired", "cancelled", "canceled"].includes(normalized) ||
    /_(failed|rejected|expired|cancelled|canceled)$/.test(normalized)
  ) {
    return "failed";
  }

  // Un état fournisseur inconnu ne doit pas être présenté comme un échec confirmé.
  return "pending";
}
