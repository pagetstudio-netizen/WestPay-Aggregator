import {
  admins, merchants, merchantCountries, transactions, smsLogs, numbers, settings, loginLogs,
  merchantPins, apiLogs, pendingPayments, webhookLogs, telegramActivationCodes, paymentLinks,
  walletTransfers, walletTransferCountries, withdrawals, withdrawalOperators, statsBaselines,
  cryptoAggregators, cryptoAggregatorCountries, cryptoAggregatorMerchants, cryptoTransactions,
  cryptoBalances, cryptoWithdrawalRequests, cryptoPaymentLinks,
  allowedIps, blockedIps, blockedDevices, securityLogs, devices, adminOtpCodes, merchantLoginOtps,
  type Admin, type InsertAdmin, type Merchant, type InsertMerchant,
  type MerchantCountry, type InsertMerchantCountry, type Transaction, type InsertTransaction,
  type SmsLog, type InsertSmsLog, type PhoneNumber, type InsertNumber,
  type Setting, type InsertSetting, type LoginLog, type InsertLoginLog,
  type MerchantPin, type InsertMerchantPin, type ApiLog, type InsertApiLog,
  type PendingPayment, type InsertPendingPayment,
  type WebhookLog, type InsertWebhookLog,
  type TelegramActivationCode, type PaymentLink, type InsertPaymentLink,
  type WalletTransfer, type InsertWalletTransfer,
  type WalletTransferCountry, type InsertWalletTransferCountry,
  type Withdrawal, type InsertWithdrawal,
  type WithdrawalOperator, type InsertWithdrawalOperator,
  type CryptoAggregator, type InsertCryptoAggregator,
  type CryptoAggregatorCountry, type InsertCryptoAggregatorCountry,
  type CryptoAggregatorMerchant, type InsertCryptoAggregatorMerchant,
  type CryptoTransaction, type InsertCryptoTransaction,
  type CryptoBalance, type InsertCryptoBalance,
  type CryptoWithdrawalRequest, type InsertCryptoWithdrawalRequest,
  type CryptoPaymentLink, type InsertCryptoPaymentLink,
  type AllowedIp, type InsertAllowedIp,
  type BlockedIp, type InsertBlockedIp,
  type BlockedDevice, type InsertBlockedDevice,
  type SecurityLog, type InsertSecurityLog,
  type Device, type InsertDevice,
} from "@shared/schema";
import { authDb, financialDb } from "./db";
import { eq, desc, sql, and, gte, lt, inArray, isNull } from "drizzle-orm";

// ── Helpers cross-DB ──────────────────────────────────────────────────────────
// Utilisés par les méthodes qui ont besoin de données des deux bases.

/** IDs des marchands fee_exempt depuis la base Auth */
async function getFeeExemptIds(): Promise<number[]> {
  const rows = await authDb.select({ id: merchants.id })
    .from(merchants)
    .where(eq(merchants.feeExempt, true));
  return rows.map(r => r.id);
}

/** Clause SQL paramétrée "merchant_id IN (...)" ou "FALSE" si liste vide */
function exemptClause(ids: number[]) {
  const safeIds = ids.filter(Number.isSafeInteger);
  if (safeIds.length === 0) return sql`FALSE`;
  return sql`merchant_id IN (${sql.join(safeIds.map(id => sql`${id}`), sql`, `)})`;
}

/** Map id → { name, website } de tous les marchands (depuis Auth) */
async function getMerchantNameMap(): Promise<Map<number, { name: string; website: string | null }>> {
  const rows = await authDb.select({ id: merchants.id, name: merchants.name, website: merchants.website }).from(merchants);
  return new Map(rows.map(r => [r.id, { name: r.name, website: r.website ?? null }]));
}

// ─────────────────────────────────────────────────────────────────────────────

export interface IStorage {
  getAdminByEmail(email: string): Promise<Admin | undefined>;
  getAdminById(id: number): Promise<Admin | undefined>;
  createAdmin(admin: InsertAdmin): Promise<Admin>;
  updateAdminPassword(id: number, passwordHash: string): Promise<void>;
  updateAdminTotp(id: number, totpSecret: string | null, totpEnabled: boolean): Promise<void>;
  revokeAdminTokens(id: number): Promise<void>;
  revokeMerchantTokens(id: number): Promise<void>;

  getMerchants(): Promise<Merchant[]>;
  getMerchantById(id: number): Promise<Merchant | undefined>;
  getMerchantByEmail(email: string): Promise<Merchant | undefined>;
  getMerchantBySlug(slug: string): Promise<Merchant | undefined>;
  createMerchant(merchant: InsertMerchant): Promise<Merchant>;
  updateMerchant(id: number, data: Partial<Merchant>): Promise<void>;
  deleteMerchant(id: number): Promise<void>;

  getMerchantCountries(merchantId?: number): Promise<MerchantCountry[]>;
  getMerchantCountryById(id: number): Promise<MerchantCountry | undefined>;
  addMerchantCountry(mc: InsertMerchantCountry): Promise<MerchantCountry>;
  deleteMerchantCountry(id: number): Promise<void>;
  updateMerchantCountryBalance(id: number, balance: number): Promise<void>;
  incrementMerchantCountryBalance(id: number, amount: number): Promise<void>;
  decrementMerchantCountryBalanceAtomic(id: number, amount: number): Promise<boolean>;
  findMerchantCountryBySimAndCountry(merchantId: number, country: string): Promise<MerchantCountry | undefined>;
  getTotalConfirmedDepositsForMC(merchantId: number, country: string): Promise<number>;
  getTotalApprovedWithdrawalsForMC(merchantCountryId: number): Promise<number>;
  addAdminCreditToMC(id: number, amount: number): Promise<void>;
  findMerchantCountryByApiKey(apiKey: string): Promise<MerchantCountry | undefined>;
  updateMerchantCountryApiKey(id: number, apiKey: string): Promise<void>;
  updateMerchantCountryActive(id: number, active: boolean): Promise<void>;

  getTransactions(merchantId?: number, opts?: { dateFrom?: Date; dateTo?: Date; limit?: number }): Promise<Transaction[]>;
  getTransactionByTxId(txId: string): Promise<Transaction | undefined>;
  createTransaction(tx: InsertTransaction): Promise<Transaction>;

  getSmsLogs(): Promise<SmsLog[]>;
  createSmsLog(log: InsertSmsLog): Promise<SmsLog>;

  getNumbers(): Promise<PhoneNumber[]>;
  getNumberByPhone(phone: string): Promise<PhoneNumber | undefined>;
  addNumber(num: InsertNumber): Promise<PhoneNumber>;
  toggleNumberStatus(id: number): Promise<PhoneNumber>;
  deleteNumber(id: number): Promise<void>;

  getSetting(key: string): Promise<string | undefined>;
  setSetting(key: string, value: string): Promise<void>;

  createLoginLog(log: InsertLoginLog): Promise<void>;
  getFailedLoginCount(userId: number, role: string): Promise<number>;
  getRecentLoginLogs(limit?: number): Promise<LoginLog[]>;
  hasMerchantSeenIp(merchantId: number, ip: string): Promise<boolean>;

  getStats(): Promise<{ merchantCount: number; transactionCount: number; totalVolume: number; activeNumbers: number }>;
  getAdminDetailedStats(): Promise<{
    commissionTotal: number; commissionToday: number; commissionThisMonth: number; commissionPrevMonth: number;
    apiPaymentsCount: number; apiPaymentsTotal: number;
    linkPaymentsCount: number; linkPaymentsTotal: number;
    withdrawalsCount: number; withdrawalsTotal: number;
  }>;
  getMerchantStats(merchantId: number): Promise<{ transactionCount: number; totalVolume: number; todayVolume: number; yesterdayVolume: number; totalWithdrawn: number }>;
  getPlatformBalance(): Promise<number>;
  getLatestStatsBaseline(): Promise<typeof statsBaselines.$inferSelect | undefined>;
  createStatsBaseline(values: { transactionCount: number; totalVolume: number; commissionTotal: number; apiPaymentsCount: number; apiPaymentsTotal: number; linkPaymentsCount: number; linkPaymentsTotal: number; withdrawalsCount: number; withdrawalsTotal: number }): Promise<void>;
  deleteAllStatsBaselines(): Promise<void>;

  getMerchantPin(merchantId: number): Promise<MerchantPin | undefined>;
  upsertMerchantPin(merchantId: number, pinHash: string): Promise<MerchantPin>;

  createApiLog(log: InsertApiLog): Promise<ApiLog>;
  getApiLogs(merchantId?: number): Promise<ApiLog[]>;

  createPendingPayment(payment: InsertPendingPayment): Promise<PendingPayment>;
  getPendingPaymentById(id: number): Promise<PendingPayment | undefined>;
  getPendingPaymentsByTxId(txId: string): Promise<PendingPayment[]>;
  updatePendingPaymentTxId(id: number, txId: string): Promise<PendingPayment>;
  updatePendingPaymentStatus(id: number, status: string): Promise<void>;
  cleanupExpiredPayments(): Promise<number>;
  getPendingPayments(merchantId?: number): Promise<PendingPayment[]>;

  updateMerchantWebhook(id: number, webhookUrl: string | null, webhookSecret: string | null): Promise<void>;
  createWebhookLog(log: InsertWebhookLog): Promise<WebhookLog>;
  getWebhookLogs(merchantId?: number): Promise<WebhookLog[]>;

  updateMerchantCountryOmnipay(id: number, omnipayEnabled: boolean): Promise<void>;
  updateMerchantCountryPayinGateway(id: number, payinGateway: string): Promise<void>;
  getPendingPaymentByOmnipayReference(reference: string): Promise<PendingPayment | undefined>;
  getPendingPaymentByOmnipayTxId(omnipayTxId: string): Promise<PendingPayment | undefined>;
  updatePendingPaymentOmnipayTxId(id: number, omnipayTxId: string): Promise<void>;
  updatePendingPaymentOtpToken(id: number, otpToken: string): Promise<void>;
  decrementMerchantCountryBalance(id: number, amount: number): Promise<void>;

  getMerchantByTelegramChatId(chatId: string): Promise<Merchant | undefined>;
  updateMerchantTelegramChatId(id: number, chatId: string | null): Promise<void>;
  updateMerchantTelegramBotLanguage(id: number, language: string): Promise<void>;
  createTelegramActivationCode(merchantId: number, code: string, expiresAt: Date): Promise<TelegramActivationCode>;
  getTelegramActivationCode(code: string): Promise<TelegramActivationCode | undefined>;
  markTelegramActivationCodeUsed(code: string): Promise<void>;
  deleteTelegramActivationCodes(merchantId: number): Promise<void>;

  getPaymentLinks(merchantId: number): Promise<PaymentLink[]>;
  getAllPaymentLinks(): Promise<(PaymentLink & { merchantName: string })[]>;
  getPaymentLinkById(id: number): Promise<PaymentLink | undefined>;
  getPaymentLinkByUniqueId(uniqueId: string): Promise<PaymentLink | undefined>;
  createPaymentLink(data: InsertPaymentLink): Promise<PaymentLink>;
  updatePaymentLink(id: number, data: Partial<InsertPaymentLink>): Promise<PaymentLink>;
  deletePaymentLink(id: number): Promise<void>;
  recordPaymentLinkPayment(id: number, amount: number): Promise<void>;

  createWalletTransfer(data: InsertWalletTransfer): Promise<WalletTransfer>;
  getWalletTransfers(merchantId?: number): Promise<(WalletTransfer & { merchantName: string })[]>;
  getWalletTransferById(id: number): Promise<WalletTransfer | undefined>;
  updateWalletTransferStatus(id: number, status: string, adminNote?: string): Promise<void>;
  applyWalletTransfer(id: number): Promise<void>;
  reimbursWalletTransfer(id: number): Promise<void>;

  getWalletTransferCountries(activeOnly?: boolean): Promise<WalletTransferCountry[]>;
  getWalletTransferCountryByName(country: string): Promise<WalletTransferCountry | undefined>;
  createWalletTransferCountry(data: InsertWalletTransferCountry): Promise<WalletTransferCountry>;
  toggleWalletTransferCountry(id: number, active: boolean): Promise<void>;
  deleteWalletTransferCountry(id: number): Promise<void>;

  createWithdrawal(data: InsertWithdrawal): Promise<Withdrawal>;
  getWithdrawals(merchantId?: number): Promise<(Withdrawal & { merchantName: string; merchantWebsite?: string | null })[]>;
  getPendingWithdrawals(): Promise<(Withdrawal & { merchantName: string })[]>;
  getWithdrawalById(id: number): Promise<Withdrawal | undefined>;
  getWithdrawalByOmnipayRef(ref: string): Promise<Withdrawal | undefined>;
  updateWithdrawalStatus(id: number, status: string, adminNote?: string, omnipayRef?: string, fees?: number, providerPayoutFee?: number): Promise<void>;
  updateWithdrawalGateway(id: number, gateway: string): Promise<void>;
  applyWithdrawal(id: number): Promise<void>;

  getWithdrawalOperators(country?: string, activeOnly?: boolean): Promise<WithdrawalOperator[]>;
  getWithdrawalOperatorById(id: number): Promise<WithdrawalOperator | undefined>;
  getWithdrawalOperatorByNameAndCountry(name: string, country: string): Promise<WithdrawalOperator | undefined>;
  createWithdrawalOperator(data: InsertWithdrawalOperator): Promise<WithdrawalOperator>;
  updateWithdrawalOperator(id: number, data: Partial<InsertWithdrawalOperator>): Promise<WithdrawalOperator>;
  deleteWithdrawalOperator(id: number): Promise<void>;
  updateOperatorsSortOrder(updates: { id: number; sortOrder: number }[]): Promise<void>;

  getCryptoAggregators(): Promise<CryptoAggregator[]>;
  getCryptoAggregatorById(id: number): Promise<CryptoAggregator | undefined>;
  createCryptoAggregator(data: InsertCryptoAggregator): Promise<CryptoAggregator>;
  updateCryptoAggregator(id: number, data: Partial<CryptoAggregator>): Promise<void>;
  deleteCryptoAggregator(id: number): Promise<void>;

  getCryptoAggregatorCountries(aggregatorId: number): Promise<CryptoAggregatorCountry[]>;
  upsertCryptoAggregatorCountry(aggregatorId: number, country: string, active: boolean): Promise<void>;

  getCryptoAggregatorMerchants(aggregatorId: number): Promise<CryptoAggregatorMerchant[]>;
  getCryptoAggregatorsByMerchant(merchantId: number): Promise<(CryptoAggregator & { countries: string[] })[]>;
  upsertCryptoAggregatorMerchant(aggregatorId: number, merchantId: number, active: boolean): Promise<void>;
  getMerchantByCryptoApiKey(apiKey: string): Promise<Merchant | undefined>;
  updateMerchantCryptoApiKey(merchantId: number, apiKey: string): Promise<void>;

  createCryptoTransaction(data: InsertCryptoTransaction): Promise<CryptoTransaction>;
  getCryptoTransactionByTrackId(trackId: string): Promise<CryptoTransaction | undefined>;
  updateCryptoTransactionStatus(id: number, updates: {
    status: string; payAmount?: string; payCurrency?: string;
    walletAddress?: string; network?: string; txHash?: string;
  }): Promise<void>;
  markCryptoTransactionCredited(id: number): Promise<boolean>;
  getCryptoTransactions(merchantId?: number): Promise<CryptoTransaction[]>;

  getCryptoBalances(merchantId: number): Promise<CryptoBalance[]>;
  incrementCryptoBalance(merchantId: number, currency: string, amount: number): Promise<void>;

  getMerchantBySdkKey(sdkApiKey: string): Promise<Merchant | undefined>;
  enableMerchantSdk(merchantId: number, sdkApiKey: string): Promise<void>;
  disableMerchantSdk(merchantId: number): Promise<void>;

  createCryptoWithdrawalRequest(data: InsertCryptoWithdrawalRequest): Promise<CryptoWithdrawalRequest>;
  getCryptoWithdrawalRequestsByMerchant(merchantId: number): Promise<CryptoWithdrawalRequest[]>;
  getAllCryptoWithdrawalRequests(): Promise<CryptoWithdrawalRequest[]>;
  updateCryptoWithdrawalRequest(id: number, status: string, adminNote?: string): Promise<void>;
  deductCryptoBalance(merchantId: number, currency: string, amount: number): Promise<void>;

  createCryptoPaymentLink(data: InsertCryptoPaymentLink): Promise<CryptoPaymentLink>;
  getCryptoPaymentLinkByUniqueId(uniqueId: string): Promise<CryptoPaymentLink | undefined>;
  getCryptoPaymentLinksByMerchant(merchantId: number): Promise<CryptoPaymentLink[]>;
  deleteCryptoPaymentLink(id: number, merchantId: number): Promise<void>;

  getCommissionByMerchant(period: "today" | "month" | "all"): Promise<{
    merchantId: number; merchantName: string;
    collectionBenefit: number; withdrawalBenefit: number; transferBenefit: number; totalBenefit: number;
  }[]>;
  getCommissionByCountry(period: "today" | "month" | "all"): Promise<{
    country: string; collectionBenefit: number; withdrawalBenefit: number; totalBenefit: number;
  }[]>;

  getAllowedIps(): Promise<AllowedIp[]>;
  isIpAllowed(ip: string): Promise<boolean>;
  addAllowedIp(data: InsertAllowedIp): Promise<AllowedIp>;
  removeAllowedIp(id: number): Promise<void>;

  getBlockedIps(): Promise<BlockedIp[]>;
  isIpBlocked(ip: string): Promise<boolean>;
  addBlockedIp(data: InsertBlockedIp): Promise<BlockedIp>;
  removeBlockedIp(id: number): Promise<void>;

  getBlockedDevices(): Promise<BlockedDevice[]>;
  isDeviceBlocked(fingerprint: string): Promise<boolean>;
  addBlockedDevice(data: InsertBlockedDevice): Promise<BlockedDevice>;
  removeBlockedDevice(id: number): Promise<void>;

  createSecurityLog(data: InsertSecurityLog): Promise<SecurityLog>;
  getSecurityLogs(limit?: number): Promise<SecurityLog[]>;

  getDeviceByFingerprint(userId: number, userRole: string, deviceId: string): Promise<Device | undefined>;
  upsertDevice(data: InsertDevice & { userId: number; userRole: string }): Promise<Device>;
  trustDevice(id: number): Promise<void>;
  blockDeviceById(id: number): Promise<void>;
  getDevicesForUser(userId: number, userRole: string): Promise<Device[]>;
  getAllDevices(limit?: number): Promise<Device[]>;
  deleteDevice(id: number): Promise<void>;

  createAdminOtp(email: string, code: string, expiresAt: Date): Promise<void>;
  getAdminOtp(email: string): Promise<{ code: string; expiresAt: Date } | undefined>;
  deleteAdminOtp(email: string): Promise<void>;

  createMerchantLoginOtp(email: string, otpHash: string, tempToken: string, expiresAt: Date): Promise<void>;
  getMerchantLoginOtp(email: string): Promise<{ otpHash: string; tempToken: string; expiresAt: Date; used: boolean; attempts: number } | undefined>;
  deleteMerchantLoginOtp(email: string): Promise<void>;
  incrementMerchantLoginOtpAttempts(email: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {

  // ══════════════════════════════════════════════════════════════════════════
  // BASE AUTH — admins
  // ══════════════════════════════════════════════════════════════════════════
  async getAdminByEmail(email: string): Promise<Admin | undefined> {
    const [a] = await authDb.select().from(admins).where(eq(admins.email, email));
    return a;
  }
  async getAdminById(id: number): Promise<Admin | undefined> {
    const [a] = await authDb.select().from(admins).where(eq(admins.id, id));
    return a;
  }
  async createAdmin(admin: InsertAdmin): Promise<Admin> {
    const [a] = await authDb.insert(admins).values(admin).returning();
    return a;
  }
  async updateAdminPassword(id: number, passwordHash: string): Promise<void> {
    await authDb.update(admins).set({ passwordHash }).where(eq(admins.id, id));
  }
  async updateAdminTotp(id: number, totpSecret: string | null, totpEnabled: boolean): Promise<void> {
    await authDb.update(admins).set({ totpSecret, totpEnabled }).where(eq(admins.id, id));
  }
  async revokeAdminTokens(id: number): Promise<void> {
    await authDb.update(admins).set({ tokenInvalidatedAt: new Date() }).where(eq(admins.id, id));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE AUTH — merchants
  // ══════════════════════════════════════════════════════════════════════════
  async revokeMerchantTokens(id: number): Promise<void> {
    await authDb.update(merchants).set({ tokenInvalidatedAt: new Date() }).where(eq(merchants.id, id));
  }
  async getMerchants(): Promise<Merchant[]> {
    return authDb.select().from(merchants).orderBy(desc(merchants.createdAt));
  }
  async getMerchantById(id: number): Promise<Merchant | undefined> {
    const [m] = await authDb.select().from(merchants).where(eq(merchants.id, id));
    return m;
  }
  async getMerchantByEmail(email: string): Promise<Merchant | undefined> {
    const [m] = await authDb.select().from(merchants).where(
      sql`LOWER(${merchants.email}) = LOWER(${email.trim()})`
    );
    return m;
  }
  async getMerchantBySlug(slug: string): Promise<Merchant | undefined> {
    const [m] = await authDb.select().from(merchants).where(eq(merchants.slug, slug));
    return m;
  }
  async createMerchant(merchant: InsertMerchant): Promise<Merchant> {
    const [m] = await authDb.insert(merchants).values(merchant).returning();
    return m;
  }
  async updateMerchant(id: number, data: Partial<Merchant>): Promise<void> {
    await authDb.update(merchants).set(data).where(eq(merchants.id, id));
  }
  async deleteMerchant(id: number): Promise<void> {
    await authDb.delete(merchants).where(eq(merchants.id, id));
  }

  // ── Cross-DB : merchants(auth) + merchantPins(auth) + paymentLinks/transactions(financial) ──
  async getMerchantsWithStats(): Promise<(Merchant & { hasPin: boolean; linkCount: number; txCount: number; totalRevenue: number })[]> {
    const [merchantsList, pinRows, linkRows, txRows] = await Promise.all([
      authDb.select().from(merchants).orderBy(desc(merchants.createdAt)),
      authDb.select({ merchantId: merchantPins.merchantId }).from(merchantPins),
      financialDb.select({
        merchantId: paymentLinks.merchantId,
        cnt: sql<string>`count(*)`,
      }).from(paymentLinks).groupBy(paymentLinks.merchantId),
      financialDb.select({
        merchantId: transactions.merchantId,
        cnt: sql<string>`count(*)`,
        revenue: sql<string>`coalesce(sum(case when status = any(array['confirmed','success','completed']::text[]) then amount else 0 end), 0)`,
      }).from(transactions).groupBy(transactions.merchantId),
    ]);
    const pinSet  = new Set(pinRows.map(p => p.merchantId));
    const linkMap = new Map(linkRows.map(r => [r.merchantId, Number(r.cnt)]));
    const txMap   = new Map(txRows.map(r => [r.merchantId, { count: Number(r.cnt), revenue: Number(r.revenue) }]));
    return merchantsList.map(m => ({
      ...m,
      hasPin:       pinSet.has(m.id),
      linkCount:    linkMap.get(m.id) ?? 0,
      txCount:      txMap.get(m.id)?.count ?? 0,
      totalRevenue: txMap.get(m.id)?.revenue ?? 0,
    }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE FINANCIAL — merchant_countries
  // ══════════════════════════════════════════════════════════════════════════
  async getMerchantCountries(merchantId?: number): Promise<MerchantCountry[]> {
    if (merchantId) return financialDb.select().from(merchantCountries).where(eq(merchantCountries.merchantId, merchantId));
    return financialDb.select().from(merchantCountries);
  }
  async getMerchantCountryById(id: number): Promise<MerchantCountry | undefined> {
    const [mc] = await financialDb.select().from(merchantCountries).where(eq(merchantCountries.id, id));
    return mc;
  }
  async addMerchantCountry(mc: InsertMerchantCountry): Promise<MerchantCountry> {
    const [c] = await financialDb.insert(merchantCountries).values(mc).returning();
    return c;
  }
  async deleteMerchantCountry(id: number): Promise<void> {
    await financialDb.delete(merchantCountries).where(eq(merchantCountries.id, id));
  }
  async updateMerchantCountryBalance(id: number, balance: number): Promise<void> {
    await financialDb.update(merchantCountries).set({ balance }).where(eq(merchantCountries.id, id));
  }
  async incrementMerchantCountryBalance(id: number, amount: number): Promise<void> {
    await financialDb.update(merchantCountries)
      .set({ balance: sql`${merchantCountries.balance} + ${amount}` })
      .where(eq(merchantCountries.id, id));
  }
  async decrementMerchantCountryBalanceAtomic(id: number, amount: number): Promise<boolean> {
    const r = await financialDb.update(merchantCountries)
      .set({ balance: sql`${merchantCountries.balance} - ${amount}` })
      .where(and(eq(merchantCountries.id, id), sql`${merchantCountries.balance} >= ${amount}`))
      .returning({ id: merchantCountries.id });
    return r.length > 0;
  }
  async findMerchantCountryBySimAndCountry(merchantId: number, country: string): Promise<MerchantCountry | undefined> {
    const [mc] = await financialDb.select().from(merchantCountries).where(and(
      eq(merchantCountries.merchantId, merchantId),
      sql`LOWER(${merchantCountries.country}) = LOWER(${country.trim()})`
    ));
    return mc;
  }
  async getTotalConfirmedDepositsForMC(merchantId: number, country: string): Promise<number> {
    const [row] = await financialDb.select({ total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)` })
      .from(transactions)
      .where(and(
        eq(transactions.merchantId, merchantId),
        sql`LOWER(${transactions.country}) = LOWER(${country.trim()})`,
        eq(transactions.status, "confirmed")
      ));
    return parseInt(row?.total ?? "0") || 0;
  }
  async getTotalApprovedWithdrawalsForMC(merchantCountryId: number): Promise<number> {
    const [row] = await financialDb.select({ total: sql<string>`COALESCE(SUM(${withdrawals.amount}), 0)` })
      .from(withdrawals)
      .where(and(eq(withdrawals.merchantCountryId, merchantCountryId), sql`${withdrawals.status} IN ('pending', 'approved')`));
    return parseInt(row?.total ?? "0") || 0;
  }
  async addAdminCreditToMC(id: number, amount: number): Promise<void> {
    await financialDb.update(merchantCountries)
      .set({ adminCreditsTotal: sql`${merchantCountries.adminCreditsTotal} + ${amount}` })
      .where(eq(merchantCountries.id, id));
  }
  async findMerchantCountryByApiKey(apiKey: string): Promise<MerchantCountry | undefined> {
    const [mc] = await financialDb.select().from(merchantCountries).where(eq(merchantCountries.apiKey, apiKey));
    return mc;
  }
  async updateMerchantCountryApiKey(id: number, apiKey: string): Promise<void> {
    await financialDb.update(merchantCountries).set({ apiKey }).where(eq(merchantCountries.id, id));
  }
  async updateMerchantCountryActive(id: number, active: boolean): Promise<void> {
    await financialDb.update(merchantCountries).set({ active }).where(eq(merchantCountries.id, id));
  }
  async updateMerchantCountryOmnipay(id: number, omnipayEnabled: boolean): Promise<void> {
    await financialDb.update(merchantCountries).set({ omnipayEnabled }).where(eq(merchantCountries.id, id));
  }
  async updateMerchantCountryPayinGateway(id: number, payinGateway: string): Promise<void> {
    await financialDb.update(merchantCountries).set({ payinGateway }).where(eq(merchantCountries.id, id));
  }
  async decrementMerchantCountryBalance(id: number, amount: number): Promise<void> {
    await financialDb.update(merchantCountries)
      .set({ balance: sql`${merchantCountries.balance} - ${amount}` })
      .where(eq(merchantCountries.id, id));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE FINANCIAL — transactions
  // ══════════════════════════════════════════════════════════════════════════
  async getTransactions(merchantId?: number, opts?: { dateFrom?: Date; dateTo?: Date; limit?: number }): Promise<Transaction[]> {
    const conds = [];
    if (merchantId)      conds.push(eq(transactions.merchantId, merchantId));
    if (opts?.dateFrom)  conds.push(gte(transactions.createdAt, opts.dateFrom));
    if (opts?.dateTo)    conds.push(lt(transactions.createdAt, opts.dateTo));
    let q = financialDb.select().from(transactions);
    if (conds.length) q = (q as any).where(and(...conds));
    q = (q as any).orderBy(desc(transactions.createdAt));
    if (opts?.limit) q = (q as any).limit(opts.limit);
    return q as any;
  }
  async getTransactionByTxId(txId: string): Promise<Transaction | undefined> {
    const [tx] = await financialDb.select().from(transactions).where(eq(transactions.txId, txId));
    return tx;
  }
  async createTransaction(tx: InsertTransaction): Promise<Transaction> {
    const [t] = await financialDb.insert(transactions).values(tx).returning();
    return t;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE FINANCIAL — sms_logs
  // ══════════════════════════════════════════════════════════════════════════
  async getSmsLogs(): Promise<SmsLog[]> {
    return financialDb.select().from(smsLogs).orderBy(desc(smsLogs.createdAt));
  }
  async createSmsLog(log: InsertSmsLog): Promise<SmsLog> {
    const [s] = await financialDb.insert(smsLogs).values(log).returning();
    return s;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE AUTH — numbers (SIM cards — configuration)
  // ══════════════════════════════════════════════════════════════════════════
  async getNumbers(): Promise<PhoneNumber[]> { return authDb.select().from(numbers); }
  async getNumberByPhone(phone: string): Promise<PhoneNumber | undefined> {
    const [n] = await authDb.select().from(numbers).where(eq(numbers.phoneNumber, phone));
    return n;
  }
  async addNumber(num: InsertNumber): Promise<PhoneNumber> {
    const [n] = await authDb.insert(numbers).values(num).returning();
    return n;
  }
  async toggleNumberStatus(id: number): Promise<PhoneNumber> {
    const [n] = await authDb.select().from(numbers).where(eq(numbers.id, id));
    if (!n) throw new Error("Numero introuvable");
    const [u] = await authDb.update(numbers).set({ status: n.status === "active" ? "inactive" : "active" }).where(eq(numbers.id, id)).returning();
    return u;
  }
  async deleteNumber(id: number): Promise<void> { await authDb.delete(numbers).where(eq(numbers.id, id)); }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE AUTH — settings
  // ══════════════════════════════════════════════════════════════════════════
  async getSetting(key: string): Promise<string | undefined> {
    const [s] = await authDb.select().from(settings).where(eq(settings.key, key));
    return s?.value;
  }
  async setSetting(key: string, value: string): Promise<void> {
    const ex = await this.getSetting(key);
    if (ex !== undefined) {
      await authDb.update(settings).set({ value }).where(eq(settings.key, key));
    } else {
      await authDb.insert(settings).values({ key, value });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE FINANCIAL — login_logs
  // ══════════════════════════════════════════════════════════════════════════
  async createLoginLog(log: InsertLoginLog): Promise<void> {
    await financialDb.insert(loginLogs).values(log);
  }
  async getRecentLoginLogs(limit = 20): Promise<LoginLog[]> {
    return financialDb.select().from(loginLogs).orderBy(desc(loginLogs.createdAt)).limit(limit);
  }
  async hasMerchantSeenIp(merchantId: number, ip: string): Promise<boolean> {
    const cleanIp = ip.replace(/^::ffff:/, "");
    const hit = await financialDb.select({ id: loginLogs.id }).from(loginLogs).where(and(
      eq(loginLogs.userId, merchantId), eq(loginLogs.role, "merchant"),
      eq(loginLogs.ip, cleanIp), eq(loginLogs.success, true),
    )).limit(1);
    return hit.length > 0;
  }
  async getFailedLoginCount(userId: number, role: string): Promise<number> {
    const [r] = await financialDb.select({ count: sql<number>`count(*)` }).from(loginLogs).where(and(
      eq(loginLogs.userId, userId), eq(loginLogs.role, role), eq(loginLogs.success, false),
    ));
    return Number(r?.count || 0);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATS — cross-DB
  // ══════════════════════════════════════════════════════════════════════════
  async getStats() {
    const validStatuses = ["confirmed", "success", "completed"];
    const [[mc], [tc], [tv], [an]] = await Promise.all([
      authDb.select({ count: sql<number>`count(*)` }).from(merchants),
      financialDb.select({ count: sql<number>`count(*)` }).from(transactions).where(inArray(transactions.status, validStatuses)),
      financialDb.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(transactions).where(inArray(transactions.status, validStatuses)),
      authDb.select({ count: sql<number>`count(*)` }).from(numbers).where(eq(numbers.status, "active")),
    ]);
    return {
      merchantCount:    Number(mc?.count || 0),
      transactionCount: Number(tc?.count || 0),
      totalVolume:      Number(tv?.total || 0),
      activeNumbers:    Number(an?.count || 0),
    };
  }

  async getAdminDetailedStats() {
    const now           = new Date();
    const todayStart    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart    = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd  = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayIso      = todayStart.toISOString();
    const monthIso      = monthStart.toISOString();
    const prevIso       = prevMonthStart.toISOString();
    const prevEndIso    = prevMonthEnd.toISOString();

    type FeeRow = { total: string; today: string; this_month: string; prev_month: string };
    const zero: FeeRow = { total: "0", today: "0", this_month: "0", prev_month: "0" };

    // fee_exempt depuis Auth DB
    const feeIds   = await getFeeExemptIds();
    const exemptSql = exemptClause(feeIds);

    const [wdResult, txResult, wtFees, apiPay, linkPay, wdStats] = await Promise.all([
      financialDb.execute<FeeRow>(sql`
        SELECT
          coalesce(sum(case when ${exemptSql}
            then -coalesce(nullif(provider_payout_fee,0),fees,0)
            else floor(amount * case when country in ('Congo Brazzaville','Congo RDC') then 0.055 else 0.045 end)
                 - coalesce(nullif(provider_payout_fee,0),fees,0)
          end), 0) as total,
          coalesce(sum(case when processed_at >= ${todayIso}::timestamp then
            case when ${exemptSql} then -coalesce(nullif(provider_payout_fee,0),fees,0)
            else floor(amount * case when country in ('Congo Brazzaville','Congo RDC') then 0.055 else 0.045 end)
                 - coalesce(nullif(provider_payout_fee,0),fees,0) end else 0 end), 0) as today,
          coalesce(sum(case when processed_at >= ${monthIso}::timestamp then
            case when ${exemptSql} then -coalesce(nullif(provider_payout_fee,0),fees,0)
            else floor(amount * case when country in ('Congo Brazzaville','Congo RDC') then 0.055 else 0.045 end)
                 - coalesce(nullif(provider_payout_fee,0),fees,0) end else 0 end), 0) as this_month,
          coalesce(sum(case when processed_at >= ${prevIso}::timestamp and processed_at < ${prevEndIso}::timestamp then
            case when ${exemptSql} then -coalesce(nullif(provider_payout_fee,0),fees,0)
            else floor(amount * case when country in ('Congo Brazzaville','Congo RDC') then 0.055 else 0.045 end)
                 - coalesce(nullif(provider_payout_fee,0),fees,0) end else 0 end), 0) as prev_month
        FROM withdrawals WHERE status = 'approved'
      `),
      financialDb.execute<FeeRow>(sql`
        SELECT
          coalesce(sum(case when ${exemptSql}
            then -coalesce(provider_fee,0)
            else (amount - floor(amount * case when country in ('Congo Brazzaville','Congo RDC') then 0.935 else 0.945 end))
                 - coalesce(provider_fee,0)
          end), 0) as total,
          coalesce(sum(case when created_at >= ${todayIso}::timestamp then
            case when ${exemptSql} then -coalesce(provider_fee,0)
            else (amount - floor(amount * case when country in ('Congo Brazzaville','Congo RDC') then 0.935 else 0.945 end))
                 - coalesce(provider_fee,0) end else 0 end), 0) as today,
          coalesce(sum(case when created_at >= ${monthIso}::timestamp then
            case when ${exemptSql} then -coalesce(provider_fee,0)
            else (amount - floor(amount * case when country in ('Congo Brazzaville','Congo RDC') then 0.935 else 0.945 end))
                 - coalesce(provider_fee,0) end else 0 end), 0) as this_month,
          coalesce(sum(case when created_at >= ${prevIso}::timestamp and created_at < ${prevEndIso}::timestamp then
            case when ${exemptSql} then -coalesce(provider_fee,0)
            else (amount - floor(amount * case when country in ('Congo Brazzaville','Congo RDC') then 0.935 else 0.945 end))
                 - coalesce(provider_fee,0) end else 0 end), 0) as prev_month
        FROM transactions
        WHERE status IN ('confirmed','success','completed') AND amount > 0
          AND (tx_id IS NULL OR tx_id NOT LIKE 'TR-%')
      `),
      financialDb.select({
        total:     sql<number>`coalesce(sum(fee), 0)`,
        today:     sql<number>`coalesce(sum(case when processed_at >= ${todayIso}::timestamp then fee else 0 end), 0)`,
        thisMonth: sql<number>`coalesce(sum(case when processed_at >= ${monthIso}::timestamp then fee else 0 end), 0)`,
        prevMonth: sql<number>`coalesce(sum(case when processed_at >= ${prevIso}::timestamp and processed_at < ${prevEndIso}::timestamp then fee else 0 end), 0)`,
      }).from(walletTransfers).where(eq(walletTransfers.status, "approved")),
      financialDb.select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(amount), 0)` })
        .from(transactions).where(and(eq(transactions.provider, "omnipay"), sql`amount > 0`, sql`tx_id NOT LIKE 'TR-%'`, inArray(transactions.status, ["confirmed","success","completed"]))),
      financialDb.select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(total_revenue), 0)` }).from(paymentLinks),
      financialDb.select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(amount), 0)` }).from(withdrawals).where(eq(withdrawals.status, "approved")),
    ]);

    const wd = wdResult.rows[0] ?? zero;
    const tx = txResult.rows[0] ?? zero;
    const wt = wtFees[0];
    return {
      commissionTotal:      Number(wd.total)      + Number(wt?.total     || 0) + Number(tx.total),
      commissionToday:      Number(wd.today)      + Number(wt?.today     || 0) + Number(tx.today),
      commissionThisMonth:  Number(wd.this_month) + Number(wt?.thisMonth || 0) + Number(tx.this_month),
      commissionPrevMonth:  Number(wd.prev_month) + Number(wt?.prevMonth || 0) + Number(tx.prev_month),
      apiPaymentsCount:     Number(apiPay[0]?.count || 0),
      apiPaymentsTotal:     Number(apiPay[0]?.total || 0),
      linkPaymentsCount:    Number(linkPay[0]?.count || 0),
      linkPaymentsTotal:    Number(linkPay[0]?.total || 0),
      withdrawalsCount:     Number(wdStats[0]?.count || 0),
      withdrawalsTotal:     Number(wdStats[0]?.total || 0),
    };
  }

  async getPlatformBalance(): Promise<number> {
    const [r] = await financialDb.select({ total: sql<number>`coalesce(sum(balance), 0)` }).from(merchantCountries);
    return Number(r?.total || 0);
  }

  async getLatestStatsBaseline() {
    const [r] = await financialDb.select().from(statsBaselines).orderBy(desc(statsBaselines.id)).limit(1);
    return r;
  }
  async createStatsBaseline(values: any) {
    await financialDb.insert(statsBaselines).values(values);
  }
  async deleteAllStatsBaselines() {
    await financialDb.delete(statsBaselines);
  }

  async getMerchantStats(merchantId: number) {
    const now          = new Date();
    const todayStart   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const [[tc],[tv],[todayRow],[ystdRow],[wRow]] = await Promise.all([
      financialDb.select({ count: sql<number>`count(*)` }).from(transactions).where(eq(transactions.merchantId, merchantId)),
      financialDb.select({ total: sql<number>`coalesce(sum(amount),0)` }).from(transactions).where(and(eq(transactions.merchantId, merchantId), eq(transactions.status, "confirmed"))),
      financialDb.select({ total: sql<number>`coalesce(sum(amount),0)` }).from(transactions).where(and(eq(transactions.merchantId, merchantId), eq(transactions.status, "confirmed"), gte(transactions.createdAt, todayStart))),
      financialDb.select({ total: sql<number>`coalesce(sum(amount),0)` }).from(transactions).where(and(eq(transactions.merchantId, merchantId), eq(transactions.status, "confirmed"), gte(transactions.createdAt, yesterdayStart), lt(transactions.createdAt, todayStart))),
      financialDb.select({ total: sql<number>`coalesce(sum(amount),0)` }).from(withdrawals).where(and(eq(withdrawals.merchantId, merchantId), eq(withdrawals.status, "approved"))),
    ]);
    return {
      transactionCount: Number(tc?.count || 0),
      totalVolume:      Number(tv?.total || 0),
      todayVolume:      Number(todayRow?.total || 0),
      yesterdayVolume:  Number(ystdRow?.total || 0),
      totalWithdrawn:   Number(wRow?.total || 0),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE AUTH — merchant_pins
  // ══════════════════════════════════════════════════════════════════════════
  async getMerchantPin(merchantId: number): Promise<MerchantPin | undefined> {
    const [p] = await authDb.select().from(merchantPins).where(eq(merchantPins.merchantId, merchantId));
    return p;
  }
  async upsertMerchantPin(merchantId: number, pinHash: string): Promise<MerchantPin> {
    const ex = await this.getMerchantPin(merchantId);
    if (ex) {
      const [u] = await authDb.update(merchantPins).set({ pinHash, updatedAt: new Date() }).where(eq(merchantPins.merchantId, merchantId)).returning();
      return u;
    }
    const [c] = await authDb.insert(merchantPins).values({ merchantId, pinHash }).returning();
    return c;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE FINANCIAL — api_logs
  // ══════════════════════════════════════════════════════════════════════════
  async createApiLog(log: InsertApiLog): Promise<ApiLog> {
    const [a] = await financialDb.insert(apiLogs).values(log).returning();
    return a;
  }
  async getApiLogs(merchantId?: number): Promise<ApiLog[]> {
    if (merchantId) return financialDb.select().from(apiLogs).where(eq(apiLogs.merchantId, merchantId)).orderBy(desc(apiLogs.createdAt));
    return financialDb.select().from(apiLogs).orderBy(desc(apiLogs.createdAt));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE FINANCIAL — pending_payments
  // ══════════════════════════════════════════════════════════════════════════
  async createPendingPayment(payment: InsertPendingPayment): Promise<PendingPayment> {
    const [p] = await financialDb.insert(pendingPayments).values(payment).returning();
    return p;
  }
  async getPendingPaymentById(id: number): Promise<PendingPayment | undefined> {
    const [p] = await financialDb.select().from(pendingPayments).where(eq(pendingPayments.id, id));
    return p;
  }
  async getPendingPaymentsByTxId(txId: string): Promise<PendingPayment[]> {
    return financialDb.select().from(pendingPayments).where(and(eq(pendingPayments.txId, txId), eq(pendingPayments.status, "submitted")));
  }
  async getPendingPayment(id: number): Promise<PendingPayment | undefined> {
    return this.getPendingPaymentById(id);
  }
  async updatePendingPaymentTxId(id: number, txId: string): Promise<PendingPayment> {
    const [p] = await financialDb.update(pendingPayments).set({ txId }).where(eq(pendingPayments.id, id)).returning();
    return p;
  }
  async updatePendingPaymentStatus(id: number, status: string): Promise<void> {
    await financialDb.update(pendingPayments).set({ status }).where(eq(pendingPayments.id, id));
  }
  async updatePendingPaymentError(id: number, status: string, errorMessage: string): Promise<void> {
    await financialDb.update(pendingPayments).set({ status, errorMessage }).where(eq(pendingPayments.id, id));
  }
  async cleanupExpiredPayments(): Promise<number> {
    const r = await financialDb.delete(pendingPayments).where(and(eq(pendingPayments.status, "pending"), sql`${pendingPayments.expiresAt} < NOW()`)).returning();
    return r.length;
  }
  async getPendingPayments(merchantId?: number): Promise<PendingPayment[]> {
    if (merchantId) return financialDb.select().from(pendingPayments).where(eq(pendingPayments.merchantId, merchantId)).orderBy(desc(pendingPayments.createdAt));
    return financialDb.select().from(pendingPayments).orderBy(desc(pendingPayments.createdAt));
  }
  async getPendingPaymentByOmnipayReference(reference: string): Promise<PendingPayment | undefined> {
    const [p] = await financialDb.select().from(pendingPayments).where(eq(pendingPayments.omnipayReference, reference));
    return p;
  }
  async getPendingPaymentByOmnipayTxId(omnipayTxId: string): Promise<PendingPayment | undefined> {
    const [p] = await financialDb.select().from(pendingPayments).where(eq(pendingPayments.omnipayTxId, omnipayTxId));
    return p;
  }
  async updatePendingPaymentOmnipayTxId(id: number, omnipayTxId: string): Promise<void> {
    await financialDb.update(pendingPayments).set({ omnipayTxId }).where(eq(pendingPayments.id, id));
  }
  // Stores the SendavaPay OTP token server-side in omnipayPaymentUrl.
  // omnipayPaymentUrl is null for SendavaPay payments; reusing it avoids a schema migration.
  // The proxy submit-otp route reads this value instead of accepting it from the client.
  async updatePendingPaymentOtpToken(id: number, otpToken: string): Promise<void> {
    await financialDb.update(pendingPayments).set({ omnipayPaymentUrl: otpToken }).where(eq(pendingPayments.id, id));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE AUTH — webhook (URL/secret) + BASE FINANCIAL — webhook_logs
  // ══════════════════════════════════════════════════════════════════════════
  async updateMerchantWebhook(id: number, webhookUrl: string | null, webhookSecret: string | null): Promise<void> {
    await authDb.update(merchants).set({ webhookUrl, webhookSecret }).where(eq(merchants.id, id));
  }
  async createWebhookLog(log: InsertWebhookLog): Promise<WebhookLog> {
    const [w] = await financialDb.insert(webhookLogs).values(log).returning();
    return w;
  }
  async getWebhookLogs(merchantId?: number): Promise<WebhookLog[]> {
    if (merchantId) return financialDb.select().from(webhookLogs).where(eq(webhookLogs.merchantId, merchantId)).orderBy(desc(webhookLogs.createdAt));
    return financialDb.select().from(webhookLogs).orderBy(desc(webhookLogs.createdAt));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE AUTH — telegram
  // ══════════════════════════════════════════════════════════════════════════
  async getMerchantByTelegramChatId(chatId: string): Promise<Merchant | undefined> {
    const [m] = await authDb.select().from(merchants).where(eq(merchants.telegramChatId, chatId));
    return m;
  }
  async updateMerchantTelegramChatId(id: number, chatId: string | null): Promise<void> {
    await authDb.update(merchants).set({ telegramChatId: chatId }).where(eq(merchants.id, id));
  }
  async updateMerchantTelegramBotLanguage(id: number, language: string): Promise<void> {
    await authDb.update(merchants).set({ telegramBotLanguage: language }).where(eq(merchants.id, id));
  }
  async createTelegramActivationCode(merchantId: number, code: string, expiresAt: Date): Promise<TelegramActivationCode> {
    const [c] = await authDb.insert(telegramActivationCodes).values({ merchantId, code, expiresAt, used: false }).returning();
    return c;
  }
  async getTelegramActivationCode(code: string): Promise<TelegramActivationCode | undefined> {
    const [c] = await authDb.select().from(telegramActivationCodes).where(eq(telegramActivationCodes.code, code));
    return c;
  }
  async markTelegramActivationCodeUsed(code: string): Promise<void> {
    await authDb.update(telegramActivationCodes).set({ used: true }).where(eq(telegramActivationCodes.code, code));
  }
  async deleteTelegramActivationCodes(merchantId: number): Promise<void> {
    await authDb.delete(telegramActivationCodes).where(eq(telegramActivationCodes.merchantId, merchantId));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE FINANCIAL — payment_links  (cross-DB pour getAllPaymentLinks)
  // ══════════════════════════════════════════════════════════════════════════
  async getPaymentLinks(merchantId: number): Promise<PaymentLink[]> {
    return financialDb.select().from(paymentLinks).where(eq(paymentLinks.merchantId, merchantId)).orderBy(desc(paymentLinks.createdAt));
  }
  async getAllPaymentLinks(): Promise<(PaymentLink & { merchantName: string })[]> {
    const [links, nameMap] = await Promise.all([
      financialDb.select().from(paymentLinks).orderBy(desc(paymentLinks.createdAt)),
      getMerchantNameMap(),
    ]);
    return links.map(l => ({ ...l, merchantName: nameMap.get(l.merchantId)?.name || "" }));
  }
  async getPaymentLinkById(id: number): Promise<PaymentLink | undefined> {
    const [l] = await financialDb.select().from(paymentLinks).where(eq(paymentLinks.id, id));
    return l;
  }
  async getPaymentLinkByUniqueId(uniqueId: string): Promise<PaymentLink | undefined> {
    const [l] = await financialDb.select().from(paymentLinks).where(eq(paymentLinks.uniqueId, uniqueId));
    return l;
  }
  async createPaymentLink(data: InsertPaymentLink): Promise<PaymentLink> {
    const [l] = await financialDb.insert(paymentLinks).values(data).returning();
    return l;
  }
  async updatePaymentLink(id: number, data: Partial<InsertPaymentLink>): Promise<PaymentLink> {
    const [l] = await financialDb.update(paymentLinks).set(data).where(eq(paymentLinks.id, id)).returning();
    return l;
  }
  async deletePaymentLink(id: number): Promise<void> {
    await financialDb.delete(paymentLinks).where(eq(paymentLinks.id, id));
  }
  async recordPaymentLinkPayment(id: number, amount: number): Promise<void> {
    await financialDb.update(paymentLinks).set({
      paymentCount:  sql`${paymentLinks.paymentCount} + 1`,
      totalRevenue:  sql`${paymentLinks.totalRevenue} + ${amount}`,
      lastPaymentAt: new Date(),
    }).where(eq(paymentLinks.id, id));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE FINANCIAL — wallet_transfers  (cross-DB pour getWalletTransfers)
  // ══════════════════════════════════════════════════════════════════════════
  async createWalletTransfer(data: InsertWalletTransfer): Promise<WalletTransfer> {
    const [w] = await financialDb.insert(walletTransfers).values(data).returning();
    return w;
  }
  async getWalletTransfers(merchantId?: number): Promise<(WalletTransfer & { merchantName: string })[]> {
    const [rows, nameMap] = await Promise.all([
      merchantId
        ? financialDb.select().from(walletTransfers).where(eq(walletTransfers.merchantId, merchantId)).orderBy(desc(walletTransfers.createdAt))
        : financialDb.select().from(walletTransfers).orderBy(desc(walletTransfers.createdAt)),
      getMerchantNameMap(),
    ]);
    return rows.map(r => ({ ...r, merchantName: nameMap.get(r.merchantId)?.name || "" }));
  }
  async getWalletTransferById(id: number): Promise<WalletTransfer | undefined> {
    const [w] = await financialDb.select().from(walletTransfers).where(eq(walletTransfers.id, id));
    return w;
  }
  async updateWalletTransferStatus(id: number, status: string, adminNote?: string): Promise<void> {
    await financialDb.update(walletTransfers).set({ status, adminNote: adminNote || null, processedAt: new Date() }).where(eq(walletTransfers.id, id));
  }
  async applyWalletTransfer(id: number): Promise<void> {
    const t = await this.getWalletTransferById(id);
    if (!t) throw new Error("Transfert introuvable");
    await financialDb.update(merchantCountries).set({ balance: sql`${merchantCountries.balance} + ${t.netAmount}` }).where(eq(merchantCountries.id, t.toCountryId));
  }
  async reimbursWalletTransfer(id: number): Promise<void> {
    const t = await this.getWalletTransferById(id);
    if (!t) throw new Error("Transfert introuvable");
    await financialDb.update(merchantCountries).set({ balance: sql`${merchantCountries.balance} + ${t.amount + t.fee}` }).where(eq(merchantCountries.id, t.fromCountryId));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE AUTH — wallet_transfer_countries
  // ══════════════════════════════════════════════════════════════════════════
  async getWalletTransferCountries(activeOnly = false): Promise<WalletTransferCountry[]> {
    return activeOnly
      ? authDb.select().from(walletTransferCountries).where(eq(walletTransferCountries.active, true)).orderBy(walletTransferCountries.currencyZone, walletTransferCountries.country)
      : authDb.select().from(walletTransferCountries).orderBy(walletTransferCountries.currencyZone, walletTransferCountries.country);
  }
  async getWalletTransferCountryByName(country: string): Promise<WalletTransferCountry | undefined> {
    const [r] = await authDb.select().from(walletTransferCountries).where(eq(walletTransferCountries.country, country));
    return r;
  }
  async createWalletTransferCountry(data: InsertWalletTransferCountry): Promise<WalletTransferCountry> {
    const [r] = await authDb.insert(walletTransferCountries).values(data).returning();
    return r;
  }
  async toggleWalletTransferCountry(id: number, active: boolean): Promise<void> {
    await authDb.update(walletTransferCountries).set({ active }).where(eq(walletTransferCountries.id, id));
  }
  async deleteWalletTransferCountry(id: number): Promise<void> {
    await authDb.delete(walletTransferCountries).where(eq(walletTransferCountries.id, id));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE FINANCIAL — withdrawals  (cross-DB pour getWithdrawals/getPendingWithdrawals)
  // ══════════════════════════════════════════════════════════════════════════
  async createWithdrawal(data: InsertWithdrawal): Promise<Withdrawal> {
    const [w] = await financialDb.insert(withdrawals).values(data).returning();
    return w;
  }
  async getWithdrawals(merchantId?: number): Promise<(Withdrawal & { merchantName: string; merchantWebsite?: string | null })[]> {
    const [rows, nameMap] = await Promise.all([
      merchantId
        ? financialDb.select().from(withdrawals).where(eq(withdrawals.merchantId, merchantId)).orderBy(desc(withdrawals.createdAt))
        : financialDb.select().from(withdrawals).orderBy(desc(withdrawals.createdAt)),
      getMerchantNameMap(),
    ]);
    return rows.map(r => ({
      ...r,
      merchantName:    nameMap.get(r.merchantId)?.name    || "",
      merchantWebsite: nameMap.get(r.merchantId)?.website ?? null,
    }));
  }
  async getPendingWithdrawals(): Promise<(Withdrawal & { merchantName: string })[]> {
    const [rows, nameMap] = await Promise.all([
      financialDb.select().from(withdrawals).where(eq(withdrawals.status, "pending")).orderBy(desc(withdrawals.createdAt)),
      getMerchantNameMap(),
    ]);
    return rows.map(r => ({ ...r, merchantName: nameMap.get(r.merchantId)?.name || "" }));
  }
  async getWithdrawalById(id: number): Promise<Withdrawal | undefined> {
    const [w] = await financialDb.select().from(withdrawals).where(eq(withdrawals.id, id));
    return w;
  }
  async getWithdrawalByOmnipayRef(ref: string): Promise<Withdrawal | undefined> {
    const [w] = await financialDb.select().from(withdrawals).where(eq(withdrawals.omnipayRef, ref));
    return w;
  }
  async updateWithdrawalStatus(id: number, status: string, adminNote?: string, omnipayRef?: string, fees?: number, providerPayoutFee?: number): Promise<void> {
    const data: any = { status, adminNote: adminNote || null, processedAt: new Date() };
    if (omnipayRef)                       data.omnipayRef = omnipayRef;
    if (fees !== undefined)               data.fees = fees;
    if (providerPayoutFee !== undefined)  data.providerPayoutFee = providerPayoutFee;
    await financialDb.update(withdrawals).set(data).where(eq(withdrawals.id, id));
  }
  async updateWithdrawalGateway(id: number, gateway: string): Promise<void> {
    await financialDb.update(withdrawals).set({ gateway }).where(eq(withdrawals.id, id));
  }
  async applyWithdrawal(id: number): Promise<void> {
    const w = await this.getWithdrawalById(id);
    if (!w) throw new Error("Reversement introuvable");
    await financialDb.update(merchantCountries).set({ balance: sql`${merchantCountries.balance} - ${w.amount}` }).where(eq(merchantCountries.id, w.merchantCountryId));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE AUTH — withdrawal_operators
  // ══════════════════════════════════════════════════════════════════════════
  async getWithdrawalOperators(country?: string, activeOnly?: boolean): Promise<WithdrawalOperator[]> {
    const conds = [];
    if (country)    conds.push(eq(withdrawalOperators.country, country));
    if (activeOnly) conds.push(eq(withdrawalOperators.active, true));
    if (conds.length) return authDb.select().from(withdrawalOperators).where(and(...conds)).orderBy(withdrawalOperators.sortOrder, withdrawalOperators.name);
    return authDb.select().from(withdrawalOperators).orderBy(withdrawalOperators.country, withdrawalOperators.sortOrder, withdrawalOperators.name);
  }
  async getWithdrawalOperatorById(id: number): Promise<WithdrawalOperator | undefined> {
    const [o] = await authDb.select().from(withdrawalOperators).where(eq(withdrawalOperators.id, id));
    return o;
  }
  async getWithdrawalOperatorByNameAndCountry(name: string, country: string): Promise<WithdrawalOperator | undefined> {
    const [o] = await authDb.select().from(withdrawalOperators).where(and(eq(withdrawalOperators.name, name), eq(withdrawalOperators.country, country)));
    return o;
  }
  async createWithdrawalOperator(data: InsertWithdrawalOperator): Promise<WithdrawalOperator> {
    const [o] = await authDb.insert(withdrawalOperators).values(data).returning();
    return o;
  }
  async updateWithdrawalOperator(id: number, data: Partial<InsertWithdrawalOperator>): Promise<WithdrawalOperator> {
    const [o] = await authDb.update(withdrawalOperators).set(data).where(eq(withdrawalOperators.id, id)).returning();
    return o;
  }
  async deleteWithdrawalOperator(id: number): Promise<void> {
    await authDb.delete(withdrawalOperators).where(eq(withdrawalOperators.id, id));
  }
  async updateOperatorsSortOrder(updates: { id: number; sortOrder: number }[]): Promise<void> {
    for (const { id, sortOrder } of updates) {
      await authDb.update(withdrawalOperators).set({ sortOrder }).where(eq(withdrawalOperators.id, id));
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE AUTH — crypto_aggregators (config)
  // ══════════════════════════════════════════════════════════════════════════
  async getCryptoAggregators(): Promise<CryptoAggregator[]> {
    return authDb.select().from(cryptoAggregators).orderBy(desc(cryptoAggregators.createdAt));
  }
  async getCryptoAggregatorById(id: number): Promise<CryptoAggregator | undefined> {
    const [a] = await authDb.select().from(cryptoAggregators).where(eq(cryptoAggregators.id, id));
    return a;
  }
  async createCryptoAggregator(data: InsertCryptoAggregator): Promise<CryptoAggregator> {
    const [a] = await authDb.insert(cryptoAggregators).values(data).returning();
    return a;
  }
  async updateCryptoAggregator(id: number, data: Partial<CryptoAggregator>): Promise<void> {
    await authDb.update(cryptoAggregators).set(data).where(eq(cryptoAggregators.id, id));
  }
  async deleteCryptoAggregator(id: number): Promise<void> {
    await authDb.delete(cryptoAggregators).where(eq(cryptoAggregators.id, id));
  }
  async getCryptoAggregatorCountries(aggregatorId: number): Promise<CryptoAggregatorCountry[]> {
    return authDb.select().from(cryptoAggregatorCountries).where(eq(cryptoAggregatorCountries.aggregatorId, aggregatorId));
  }
  async upsertCryptoAggregatorCountry(aggregatorId: number, country: string, active: boolean): Promise<void> {
    const [ex] = await authDb.select().from(cryptoAggregatorCountries).where(and(eq(cryptoAggregatorCountries.aggregatorId, aggregatorId), eq(cryptoAggregatorCountries.country, country)));
    if (ex) await authDb.update(cryptoAggregatorCountries).set({ active }).where(and(eq(cryptoAggregatorCountries.aggregatorId, aggregatorId), eq(cryptoAggregatorCountries.country, country)));
    else    await authDb.insert(cryptoAggregatorCountries).values({ aggregatorId, country, active });
  }
  async getCryptoAggregatorMerchants(aggregatorId: number): Promise<CryptoAggregatorMerchant[]> {
    return authDb.select().from(cryptoAggregatorMerchants).where(eq(cryptoAggregatorMerchants.aggregatorId, aggregatorId));
  }
  async getCryptoAggregatorsByMerchant(merchantId: number): Promise<(CryptoAggregator & { countries: string[] })[]> {
    const rows = await authDb.select({ aggregator: cryptoAggregators, cam: cryptoAggregatorMerchants })
      .from(cryptoAggregatorMerchants)
      .innerJoin(cryptoAggregators, eq(cryptoAggregatorMerchants.aggregatorId, cryptoAggregators.id))
      .where(and(eq(cryptoAggregatorMerchants.merchantId, merchantId), eq(cryptoAggregatorMerchants.active, true), eq(cryptoAggregators.active, true)));
    const result: (CryptoAggregator & { countries: string[] })[] = [];
    for (const row of rows) {
      const ctryRows = await authDb.select().from(cryptoAggregatorCountries).where(and(eq(cryptoAggregatorCountries.aggregatorId, row.aggregator.id), eq(cryptoAggregatorCountries.active, true)));
      result.push({ ...row.aggregator, countries: ctryRows.map(c => c.country) });
    }
    return result;
  }
  async upsertCryptoAggregatorMerchant(aggregatorId: number, merchantId: number, active: boolean): Promise<void> {
    const [ex] = await authDb.select().from(cryptoAggregatorMerchants).where(and(eq(cryptoAggregatorMerchants.aggregatorId, aggregatorId), eq(cryptoAggregatorMerchants.merchantId, merchantId)));
    if (ex) await authDb.update(cryptoAggregatorMerchants).set({ active }).where(and(eq(cryptoAggregatorMerchants.aggregatorId, aggregatorId), eq(cryptoAggregatorMerchants.merchantId, merchantId)));
    else    await authDb.insert(cryptoAggregatorMerchants).values({ aggregatorId, merchantId, active });
    if (active) {
      const [m] = await authDb.select().from(merchants).where(eq(merchants.id, merchantId));
      if (m && !m.cryptoApiKey) {
        const { randomBytes } = await import("crypto");
        await authDb.update(merchants).set({ cryptoApiKey: "WP-CRYPTO-" + randomBytes(20).toString("hex").toUpperCase() }).where(eq(merchants.id, merchantId));
      }
    }
  }
  async getMerchantByCryptoApiKey(apiKey: string): Promise<Merchant | undefined> {
    const [m] = await authDb.select().from(merchants).where(eq(merchants.cryptoApiKey, apiKey));
    return m;
  }
  async updateMerchantCryptoApiKey(merchantId: number, apiKey: string): Promise<void> {
    await authDb.update(merchants).set({ cryptoApiKey: apiKey }).where(eq(merchants.id, merchantId));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE FINANCIAL — crypto_transactions
  // ══════════════════════════════════════════════════════════════════════════
  async createCryptoTransaction(data: InsertCryptoTransaction): Promise<CryptoTransaction> {
    const [t] = await financialDb.insert(cryptoTransactions).values(data).returning();
    return t;
  }
  async getCryptoTransactionByTrackId(trackId: string): Promise<CryptoTransaction | undefined> {
    const [t] = await financialDb.select().from(cryptoTransactions).where(eq(cryptoTransactions.trackId, trackId));
    return t;
  }
  async updateCryptoTransactionStatus(id: number, updates: { status: string; payAmount?: string; payCurrency?: string; walletAddress?: string; network?: string; txHash?: string; }): Promise<void> {
    const data: any = { status: updates.status };
    if (updates.payAmount    !== undefined) data.payAmount    = updates.payAmount;
    if (updates.payCurrency  !== undefined) data.payCurrency  = updates.payCurrency;
    if (updates.walletAddress !== undefined) data.walletAddress = updates.walletAddress;
    if (updates.network      !== undefined) data.network      = updates.network;
    if (updates.txHash       !== undefined) data.txHash       = updates.txHash;
    await financialDb.update(cryptoTransactions).set(data).where(eq(cryptoTransactions.id, id));
  }
  async markCryptoTransactionCredited(id: number): Promise<boolean> {
    const r = await financialDb.update(cryptoTransactions).set({ creditedAt: new Date() }).where(and(eq(cryptoTransactions.id, id), isNull(cryptoTransactions.creditedAt))).returning({ id: cryptoTransactions.id });
    return r.length > 0;
  }
  async getCryptoTransactions(merchantId?: number): Promise<CryptoTransaction[]> {
    if (merchantId) return financialDb.select().from(cryptoTransactions).where(eq(cryptoTransactions.merchantId, merchantId)).orderBy(desc(cryptoTransactions.createdAt));
    return financialDb.select().from(cryptoTransactions).orderBy(desc(cryptoTransactions.createdAt));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE FINANCIAL — crypto_balances
  // ══════════════════════════════════════════════════════════════════════════
  async getCryptoBalances(merchantId: number): Promise<CryptoBalance[]> {
    return financialDb.select().from(cryptoBalances).where(eq(cryptoBalances.merchantId, merchantId));
  }
  async incrementCryptoBalance(merchantId: number, currency: string, amount: number): Promise<void> {
    const [ex] = await financialDb.select().from(cryptoBalances).where(and(eq(cryptoBalances.merchantId, merchantId), eq(cryptoBalances.currency, currency)));
    if (ex) await financialDb.update(cryptoBalances).set({ balance: (parseFloat(ex.balance) + amount).toFixed(8), updatedAt: new Date() }).where(and(eq(cryptoBalances.merchantId, merchantId), eq(cryptoBalances.currency, currency)));
    else    await financialDb.insert(cryptoBalances).values({ merchantId, currency, balance: amount.toFixed(8) });
  }
  async deductCryptoBalance(merchantId: number, currency: string, amount: number): Promise<void> {
    const [ex] = await financialDb.select().from(cryptoBalances).where(and(eq(cryptoBalances.merchantId, merchantId), eq(cryptoBalances.currency, currency)));
    if (ex) await financialDb.update(cryptoBalances).set({ balance: Math.max(0, parseFloat(ex.balance) - amount).toFixed(8), updatedAt: new Date() }).where(and(eq(cryptoBalances.merchantId, merchantId), eq(cryptoBalances.currency, currency)));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE AUTH — merchant SDK
  // ══════════════════════════════════════════════════════════════════════════
  async getMerchantBySdkKey(sdkApiKey: string): Promise<Merchant | undefined> {
    const [m] = await authDb.select().from(merchants).where(eq(merchants.sdkApiKey, sdkApiKey));
    return m;
  }
  async enableMerchantSdk(merchantId: number, sdkApiKey: string): Promise<void> {
    await authDb.update(merchants).set({ sdkEnabled: true, sdkApiKey }).where(eq(merchants.id, merchantId));
  }
  async disableMerchantSdk(merchantId: number): Promise<void> {
    await authDb.update(merchants).set({ sdkEnabled: false, sdkApiKey: null }).where(eq(merchants.id, merchantId));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE FINANCIAL — crypto_withdrawal_requests
  // ══════════════════════════════════════════════════════════════════════════
  async createCryptoWithdrawalRequest(data: InsertCryptoWithdrawalRequest): Promise<CryptoWithdrawalRequest> {
    const [r] = await financialDb.insert(cryptoWithdrawalRequests).values(data).returning();
    return r;
  }
  async getCryptoWithdrawalRequestsByMerchant(merchantId: number): Promise<CryptoWithdrawalRequest[]> {
    return financialDb.select().from(cryptoWithdrawalRequests).where(eq(cryptoWithdrawalRequests.merchantId, merchantId)).orderBy(desc(cryptoWithdrawalRequests.createdAt));
  }
  async getAllCryptoWithdrawalRequests(): Promise<CryptoWithdrawalRequest[]> {
    return financialDb.select().from(cryptoWithdrawalRequests).orderBy(desc(cryptoWithdrawalRequests.createdAt));
  }
  async updateCryptoWithdrawalRequest(id: number, status: string, adminNote?: string): Promise<void> {
    await financialDb.update(cryptoWithdrawalRequests).set({ status, ...(adminNote !== undefined && { adminNote }), updatedAt: new Date() }).where(eq(cryptoWithdrawalRequests.id, id));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE FINANCIAL — crypto_payment_links
  // ══════════════════════════════════════════════════════════════════════════
  async createCryptoPaymentLink(data: InsertCryptoPaymentLink): Promise<CryptoPaymentLink> {
    const [l] = await financialDb.insert(cryptoPaymentLinks).values(data).returning();
    return l;
  }
  async getCryptoPaymentLinkByUniqueId(uniqueId: string): Promise<CryptoPaymentLink | undefined> {
    const [l] = await financialDb.select().from(cryptoPaymentLinks).where(eq(cryptoPaymentLinks.uniqueId, uniqueId));
    return l;
  }
  async getCryptoPaymentLinksByMerchant(merchantId: number): Promise<CryptoPaymentLink[]> {
    return financialDb.select().from(cryptoPaymentLinks).where(eq(cryptoPaymentLinks.merchantId, merchantId)).orderBy(desc(cryptoPaymentLinks.createdAt));
  }
  async deleteCryptoPaymentLink(id: number, merchantId: number): Promise<void> {
    await financialDb.delete(cryptoPaymentLinks).where(and(eq(cryptoPaymentLinks.id, id), eq(cryptoPaymentLinks.merchantId, merchantId)));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COMMISSIONS — cross-DB (financial data + auth merchants)
  // ══════════════════════════════════════════════════════════════════════════
  async getCommissionByMerchant(period: "today" | "month" | "all") {
    const now      = new Date();
    const todayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const cutoff   = period === "today" ? todayIso : period === "month" ? monthIso : null;

    // 1. Marchands depuis Auth DB
    const merchantRows = await authDb.select({ id: merchants.id, name: merchants.name, feeExempt: merchants.feeExempt }).from(merchants);
    const mMap         = new Map(merchantRows.map(m => [m.id, m]));
    const feeIds       = merchantRows.filter(m => m.feeExempt).map(m => m.id);
    const exemptSql    = exemptClause(feeIds);

    const txCutoff = cutoff ? sql` AND created_at >= ${cutoff}::timestamp` : sql``;
    const wdCutoff = cutoff ? sql` AND processed_at >= ${cutoff}::timestamp` : sql``;
    const wtCutoff = cutoff ? sql` AND processed_at >= ${cutoff}::timestamp` : sql``;

    type Row = { merchant_id: string; net: string };

    // 2. Agrégations sur Financial DB (sans JOIN merchants)
    const [txRows, wdRows, wtRows] = await Promise.all([
      financialDb.execute<Row>(sql`
        SELECT merchant_id,
          COALESCE(SUM(CASE WHEN ${exemptSql} THEN -COALESCE(provider_fee,0)
            ELSE (amount - FLOOR(amount * CASE WHEN country IN ('Congo Brazzaville','Congo RDC') THEN 0.935 ELSE 0.945 END))
                 - COALESCE(provider_fee,0) END), 0) as net
        FROM transactions
        WHERE status IN ('confirmed','success','completed') AND amount > 0
          AND (tx_id IS NULL OR tx_id NOT LIKE 'TR-%') ${txCutoff}
        GROUP BY merchant_id
      `),
      financialDb.execute<Row>(sql`
        SELECT merchant_id,
          COALESCE(SUM(CASE WHEN ${exemptSql} THEN -COALESCE(fees,0)
            ELSE FLOOR(amount * CASE WHEN country IN ('Congo Brazzaville','Congo RDC') THEN 0.055 ELSE 0.045 END)
                 - COALESCE(fees,0) END), 0) as net
        FROM withdrawals WHERE status = 'approved' ${wdCutoff}
        GROUP BY merchant_id
      `),
      financialDb.execute<Row>(sql`
        SELECT merchant_id, COALESCE(SUM(fee), 0) as net
        FROM wallet_transfers WHERE status = 'approved' ${wtCutoff}
        GROUP BY merchant_id
      `),
    ]);

    // 3. Fusion avec noms depuis Auth
    const map = new Map<number, { merchantId: number; merchantName: string; collectionBenefit: number; withdrawalBenefit: number; transferBenefit: number }>();
    for (const r of txRows.rows) {
      const id = Number(r.merchant_id);
      map.set(id, { merchantId: id, merchantName: mMap.get(id)?.name || "?", collectionBenefit: Number(r.net), withdrawalBenefit: 0, transferBenefit: 0 });
    }
    for (const r of wdRows.rows) {
      const id = Number(r.merchant_id); const ex = map.get(id);
      if (ex) ex.withdrawalBenefit = Number(r.net);
      else    map.set(id, { merchantId: id, merchantName: mMap.get(id)?.name || "?", collectionBenefit: 0, withdrawalBenefit: Number(r.net), transferBenefit: 0 });
    }
    for (const r of wtRows.rows) {
      const id = Number(r.merchant_id); const ex = map.get(id);
      if (ex) ex.transferBenefit = Number(r.net);
      else    map.set(id, { merchantId: id, merchantName: mMap.get(id)?.name || "?", collectionBenefit: 0, withdrawalBenefit: 0, transferBenefit: Number(r.net) });
    }
    return Array.from(map.values()).map(r => ({ ...r, totalBenefit: r.collectionBenefit + r.withdrawalBenefit + r.transferBenefit })).sort((a, b) => b.totalBenefit - a.totalBenefit);
  }

  async getCommissionByCountry(period: "today" | "month" | "all") {
    const now      = new Date();
    const todayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const cutoff   = period === "today" ? todayIso : period === "month" ? monthIso : null;

    const feeIds    = await getFeeExemptIds();
    const exemptSql = exemptClause(feeIds);

    const txCutoff = cutoff ? sql` AND t.created_at >= ${cutoff}::timestamp` : sql``;
    const wdCutoff = cutoff ? sql` AND w.processed_at >= ${cutoff}::timestamp` : sql``;

    type TxRow = { country: string; net: string };
    const [txRows, wdRows] = await Promise.all([
      financialDb.execute<TxRow>(sql`
        SELECT country, COALESCE(SUM(CASE WHEN ${exemptSql} THEN -COALESCE(provider_fee,0)
          ELSE (amount - FLOOR(amount * CASE WHEN country IN ('Congo Brazzaville','Congo RDC') THEN 0.935 ELSE 0.945 END))
               - COALESCE(provider_fee,0) END), 0) as net
        FROM transactions t
        WHERE status IN ('confirmed','success','completed') AND amount > 0
          AND (tx_id IS NULL OR tx_id NOT LIKE 'TR-%') ${txCutoff}
        GROUP BY country
      `),
      financialDb.execute<TxRow>(sql`
        SELECT country, COALESCE(SUM(CASE WHEN ${exemptSql} THEN -COALESCE(fees,0)
          ELSE FLOOR(amount * CASE WHEN country IN ('Congo Brazzaville','Congo RDC') THEN 0.055 ELSE 0.045 END)
               - COALESCE(fees,0) END), 0) as net
        FROM withdrawals w WHERE status = 'approved' ${wdCutoff}
        GROUP BY country
      `),
    ]);
    const map = new Map<string, { country: string; collectionBenefit: number; withdrawalBenefit: number }>();
    for (const r of txRows.rows) {
      const c = r.country || "Inconnu";
      map.set(c, { country: c, collectionBenefit: Number(r.net), withdrawalBenefit: 0 });
    }
    for (const r of wdRows.rows) {
      const c = r.country || "Inconnu"; const ex = map.get(c);
      if (ex) ex.withdrawalBenefit = Number(r.net);
      else    map.set(c, { country: c, collectionBenefit: 0, withdrawalBenefit: Number(r.net) });
    }
    return Array.from(map.values()).map(r => ({ ...r, totalBenefit: r.collectionBenefit + r.withdrawalBenefit })).sort((a, b) => b.totalBenefit - a.totalBenefit);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE AUTH — allowed_ips, blocked_ips, blocked_devices
  // ══════════════════════════════════════════════════════════════════════════
  async getAllowedIps(): Promise<AllowedIp[]> { return authDb.select().from(allowedIps).orderBy(desc(allowedIps.createdAt)); }
  async isIpAllowed(ip: string): Promise<boolean> {
    const all = await authDb.select({ id: allowedIps.id }).from(allowedIps);
    if (all.length === 0) return true;
    const hit = await authDb.select({ id: allowedIps.id }).from(allowedIps).where(eq(allowedIps.ipAddress, ip)).limit(1);
    return hit.length > 0;
  }
  async addAllowedIp(data: InsertAllowedIp): Promise<AllowedIp> {
    const [r] = await authDb.insert(allowedIps).values(data).onConflictDoUpdate({ target: allowedIps.ipAddress, set: { userEmail: data.userEmail, role: data.role, note: data.note, createdBy: data.createdBy } }).returning();
    return r;
  }
  async removeAllowedIp(id: number): Promise<void> { await authDb.delete(allowedIps).where(eq(allowedIps.id, id)); }

  async getBlockedIps(): Promise<BlockedIp[]> { return authDb.select().from(blockedIps).orderBy(desc(blockedIps.createdAt)); }
  async isIpBlocked(ip: string): Promise<boolean> {
    const cleanIp = ip.replace(/^::ffff:/, "");
    const hit = await authDb.select({ id: blockedIps.id }).from(blockedIps).where(eq(blockedIps.ipAddress, cleanIp)).limit(1);
    return hit.length > 0;
  }
  async addBlockedIp(data: InsertBlockedIp): Promise<BlockedIp> {
    const [r] = await authDb.insert(blockedIps).values(data).onConflictDoUpdate({ target: blockedIps.ipAddress, set: { reason: data.reason, blockedBy: data.blockedBy, country: data.country, city: data.city } }).returning();
    return r;
  }
  async removeBlockedIp(id: number): Promise<void> { await authDb.delete(blockedIps).where(eq(blockedIps.id, id)); }

  async getBlockedDevices(): Promise<BlockedDevice[]> { return authDb.select().from(blockedDevices).orderBy(desc(blockedDevices.createdAt)); }
  async isDeviceBlocked(fingerprint: string): Promise<boolean> {
    const hit = await authDb.select({ id: blockedDevices.id }).from(blockedDevices).where(eq(blockedDevices.fingerprint, fingerprint)).limit(1);
    return hit.length > 0;
  }
  async addBlockedDevice(data: InsertBlockedDevice): Promise<BlockedDevice> {
    const [r] = await authDb.insert(blockedDevices).values(data).onConflictDoUpdate({ target: blockedDevices.fingerprint, set: { reason: data.reason, blockedBy: data.blockedBy, ipAddress: data.ipAddress, userAgent: data.userAgent } }).returning();
    return r;
  }
  async removeBlockedDevice(id: number): Promise<void> { await authDb.delete(blockedDevices).where(eq(blockedDevices.id, id)); }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE FINANCIAL — security_logs
  // ══════════════════════════════════════════════════════════════════════════
  async createSecurityLog(data: InsertSecurityLog): Promise<SecurityLog> {
    const [r] = await financialDb.insert(securityLogs).values(data).returning();
    return r;
  }
  async getSecurityLogs(limit = 50): Promise<SecurityLog[]> {
    return financialDb.select().from(securityLogs).orderBy(desc(securityLogs.createdAt)).limit(limit);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE AUTH — devices
  // ══════════════════════════════════════════════════════════════════════════
  async getDeviceByFingerprint(userId: number, userRole: string, deviceId: string): Promise<Device | undefined> {
    const [d] = await authDb.select().from(devices).where(and(eq(devices.userId, userId), eq(devices.userRole, userRole), eq(devices.deviceId, deviceId))).limit(1);
    return d;
  }
  async upsertDevice(data: InsertDevice & { userId: number; userRole: string }): Promise<Device> {
    const ex = await this.getDeviceByFingerprint(data.userId, data.userRole, data.deviceId);
    if (ex) {
      const [u] = await authDb.update(devices).set({ lastSeen: new Date(), ipAddress: data.ipAddress, country: data.country, city: data.city }).where(eq(devices.id, ex.id)).returning();
      return u;
    }
    const [r] = await authDb.insert(devices).values({ ...data, lastSeen: new Date() }).returning();
    return r;
  }
  async trustDevice(id: number): Promise<void> { await authDb.update(devices).set({ isTrusted: true }).where(eq(devices.id, id)); }
  async blockDeviceById(id: number): Promise<void> {
    const [d] = await authDb.select().from(devices).where(eq(devices.id, id));
    if (d) await authDb.insert(blockedDevices).values({ fingerprint: d.deviceId, ipAddress: d.ipAddress, userAgent: d.browser, reason: "Bloqué via dashboard", blockedBy: "admin" }).onConflictDoNothing();
    await authDb.delete(devices).where(eq(devices.id, id));
  }
  async getDevicesForUser(userId: number, userRole: string): Promise<Device[]> {
    return authDb.select().from(devices).where(and(eq(devices.userId, userId), eq(devices.userRole, userRole))).orderBy(desc(devices.lastSeen));
  }
  async getAllDevices(limit = 100): Promise<Device[]> {
    return authDb.select().from(devices).orderBy(desc(devices.lastSeen)).limit(limit);
  }
  async deleteDevice(id: number): Promise<void> { await authDb.delete(devices).where(eq(devices.id, id)); }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE AUTH — admin_otp_codes
  // ══════════════════════════════════════════════════════════════════════════
  async createAdminOtp(email: string, code: string, expiresAt: Date): Promise<void> {
    await authDb.delete(adminOtpCodes).where(eq(adminOtpCodes.email, email));
    await authDb.insert(adminOtpCodes).values({ email, code, expiresAt });
  }
  async getAdminOtp(email: string): Promise<{ code: string; expiresAt: Date } | undefined> {
    const [r] = await authDb.select().from(adminOtpCodes).where(eq(adminOtpCodes.email, email)).limit(1);
    return r ? { code: r.code, expiresAt: r.expiresAt } : undefined;
  }
  async deleteAdminOtp(email: string): Promise<void> { await authDb.delete(adminOtpCodes).where(eq(adminOtpCodes.email, email)); }

  // ══════════════════════════════════════════════════════════════════════════
  // BASE AUTH — merchant_login_otps
  // ══════════════════════════════════════════════════════════════════════════
  async createMerchantLoginOtp(email: string, otpHash: string, tempToken: string, expiresAt: Date): Promise<void> {
    await authDb.delete(merchantLoginOtps).where(eq(merchantLoginOtps.email, email));
    await authDb.insert(merchantLoginOtps).values({ email, otpHash, tempToken, expiresAt, used: false, attempts: 0 });
  }
  async getMerchantLoginOtp(email: string): Promise<{ otpHash: string; tempToken: string; expiresAt: Date; used: boolean; attempts: number } | undefined> {
    const [r] = await authDb.select().from(merchantLoginOtps).where(eq(merchantLoginOtps.email, email)).limit(1);
    return r ? { otpHash: r.otpHash, tempToken: r.tempToken, expiresAt: r.expiresAt, used: r.used, attempts: r.attempts } : undefined;
  }
  async deleteMerchantLoginOtp(email: string): Promise<void> { await authDb.delete(merchantLoginOtps).where(eq(merchantLoginOtps.email, email)); }
  async incrementMerchantLoginOtpAttempts(email: string): Promise<void> {
    await authDb.update(merchantLoginOtps).set({ attempts: sql`${merchantLoginOtps.attempts} + 1` }).where(eq(merchantLoginOtps.email, email));
  }
}

export const storage = new DatabaseStorage();
