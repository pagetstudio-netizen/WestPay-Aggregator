export const AUTO_STATUS_CHECK_INTERVAL_MS = 7_000;
export const AUTO_STATUS_MAX_CHECKS = 5;
export const PENDING_OPERATION_TIMEOUT_MS = 3 * 60 * 60 * 1000;
export const MANUAL_PAYIN_EXPIRY_MS = PENDING_OPERATION_TIMEOUT_MS;
export const AUTO_TIMEOUT_ERROR_MARKER = "AUTO_TIMEOUT_3H";
export const AUTO_TIMEOUT_ADMIN_MESSAGE =
  "Délai maximal de 3 heures dépassé. Vérifiez le paiement auprès du fournisseur avant de le valider.";
export const AUTO_TIMEOUT_PUBLIC_MESSAGE =
  "Le paiement n’a pas été confirmé dans le délai de trois heures.";

function timestamp(value: Date | string | null | undefined): number | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isAutomaticStatusCheckDue(
  checkCount: number,
  lastCheckedAt: Date | string | null | undefined,
  createdAt: Date | string,
  now: number,
): boolean {
  if (checkCount >= AUTO_STATUS_MAX_CHECKS) return false;
  const baseline = timestamp(lastCheckedAt) ?? timestamp(createdAt);
  return baseline !== null && now - baseline >= AUTO_STATUS_CHECK_INTERVAL_MS;
}

export function isPendingOperationExpired(createdAt: Date | string, now: number): boolean {
  const created = timestamp(createdAt);
  return created !== null && now - created >= PENDING_OPERATION_TIMEOUT_MS;
}

export function isManualPayinExpired(createdAt: Date | string, now: number): boolean {
  return isPendingOperationExpired(createdAt, now);
}

export function isAutomaticWithdrawal(withdrawalMode: unknown, gateway: unknown): boolean {
  return String(withdrawalMode || "").trim().toLowerCase() === "auto"
    && String(gateway || "").trim().toLowerCase() !== "manual";
}

export function isAutomaticWithdrawalStatusOpen(status: unknown): boolean {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  return normalizedStatus === "pending" || normalizedStatus === "processing";
}
