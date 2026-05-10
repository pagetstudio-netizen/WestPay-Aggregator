import {
  admins, merchants, merchantCountries, transactions, smsLogs, numbers, settings, loginLogs,
  merchantPins, apiLogs, pendingPayments, webhookLogs, telegramActivationCodes, paymentLinks,
  walletTransfers, walletTransferCountries, withdrawals, withdrawalOperators, statsBaselines,
  cryptoAggregators, cryptoAggregatorCountries, cryptoAggregatorMerchants, cryptoTransactions, cryptoBalances, cryptoWithdrawalRequests, cryptoPaymentLinks,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, and, gte, lt, inArray, isNull } from "drizzle-orm";

export interface IStorage {
  getAdminByEmail(email: string): Promise<Admin | undefined>;
  getAdminById(id: number): Promise<Admin | undefined>;
  createAdmin(admin: InsertAdmin): Promise<Admin>;
  updateAdminPassword(id: number, passwordHash: string): Promise<void>;

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
  updateMerchantCountryBalance(id: number, balance: number): Promise<void>;
  incrementMerchantCountryBalance(id: number, amount: number): Promise<void>;
  findMerchantCountryBySimAndCountry(merchantId: number, country: string): Promise<MerchantCountry | undefined>;
  findMerchantCountryByApiKey(apiKey: string): Promise<MerchantCountry | undefined>;
  updateMerchantCountryApiKey(id: number, apiKey: string): Promise<void>;
  updateMerchantCountryActive(id: number, active: boolean): Promise<void>;

  getTransactions(merchantId?: number): Promise<Transaction[]>;
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
  getWithdrawalById(id: number): Promise<Withdrawal | undefined>;
  getWithdrawalByOmnipayRef(ref: string): Promise<Withdrawal | undefined>;
  updateWithdrawalStatus(id: number, status: string, adminNote?: string, omnipayRef?: string, fees?: number, providerPayoutFee?: number): Promise<void>;
  applyWithdrawal(id: number): Promise<void>;

  getWithdrawalOperators(country?: string, activeOnly?: boolean): Promise<WithdrawalOperator[]>;
  getWithdrawalOperatorById(id: number): Promise<WithdrawalOperator | undefined>;
  getWithdrawalOperatorByNameAndCountry(name: string, country: string): Promise<WithdrawalOperator | undefined>;
  createWithdrawalOperator(data: InsertWithdrawalOperator): Promise<WithdrawalOperator>;
  updateWithdrawalOperator(id: number, data: Partial<InsertWithdrawalOperator>): Promise<WithdrawalOperator>;
  deleteWithdrawalOperator(id: number): Promise<void>;

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
    status: string;
    payAmount?: string;
    payCurrency?: string;
    walletAddress?: string;
    network?: string;
    txHash?: string;
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
    country: string;
    collectionBenefit: number; withdrawalBenefit: number; totalBenefit: number;
  }[]>;
}

export class DatabaseStorage implements IStorage {
  async getAdminByEmail(email: string): Promise<Admin | undefined> {
    const [admin] = await db.select().from(admins).where(eq(admins.email, email));
    return admin;
  }

  async getAdminById(id: number): Promise<Admin | undefined> {
    const [admin] = await db.select().from(admins).where(eq(admins.id, id));
    return admin;
  }

  async createAdmin(admin: InsertAdmin): Promise<Admin> {
    const [created] = await db.insert(admins).values(admin).returning();
    return created;
  }

  async updateAdminPassword(id: number, passwordHash: string): Promise<void> {
    await db.update(admins).set({ passwordHash }).where(eq(admins.id, id));
  }

  async getMerchants(): Promise<Merchant[]> {
    return db.select().from(merchants).orderBy(desc(merchants.createdAt));
  }

  async getMerchantById(id: number): Promise<Merchant | undefined> {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.id, id));
    return merchant;
  }

  async getMerchantByEmail(email: string): Promise<Merchant | undefined> {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.email, email));
    return merchant;
  }

  async getMerchantBySlug(slug: string): Promise<Merchant | undefined> {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.slug, slug));
    return merchant;
  }

  async createMerchant(merchant: InsertMerchant): Promise<Merchant> {
    const [created] = await db.insert(merchants).values(merchant).returning();
    return created;
  }

  async updateMerchant(id: number, data: Partial<Merchant>): Promise<void> {
    await db.update(merchants).set(data).where(eq(merchants.id, id));
  }

  async deleteMerchant(id: number): Promise<void> {
    await db.delete(merchants).where(eq(merchants.id, id));
  }

  async getMerchantCountries(merchantId?: number): Promise<MerchantCountry[]> {
    if (merchantId) {
      return db.select().from(merchantCountries).where(eq(merchantCountries.merchantId, merchantId));
    }
    return db.select().from(merchantCountries);
  }

  async getMerchantCountryById(id: number): Promise<MerchantCountry | undefined> {
    const [mc] = await db.select().from(merchantCountries).where(eq(merchantCountries.id, id));
    return mc;
  }

  async addMerchantCountry(mc: InsertMerchantCountry): Promise<MerchantCountry> {
    const [created] = await db.insert(merchantCountries).values(mc).returning();
    return created;
  }

  async updateMerchantCountryBalance(id: number, balance: number): Promise<void> {
    await db.update(merchantCountries).set({ balance }).where(eq(merchantCountries.id, id));
  }

  async incrementMerchantCountryBalance(id: number, amount: number): Promise<void> {
    await db.update(merchantCountries)
      .set({ balance: sql`${merchantCountries.balance} + ${amount}` })
      .where(eq(merchantCountries.id, id));
  }

  async findMerchantCountryBySimAndCountry(merchantId: number, country: string): Promise<MerchantCountry | undefined> {
    const [mc] = await db.select().from(merchantCountries)
      .where(and(
        eq(merchantCountries.merchantId, merchantId),
        sql`LOWER(${merchantCountries.country}) = LOWER(${country.trim()})`
      ));
    return mc;
  }

  async findMerchantCountryByApiKey(apiKey: string): Promise<MerchantCountry | undefined> {
    const [mc] = await db.select().from(merchantCountries)
      .where(eq(merchantCountries.apiKey, apiKey));
    return mc;
  }

  async updateMerchantCountryApiKey(id: number, apiKey: string): Promise<void> {
    await db.update(merchantCountries).set({ apiKey }).where(eq(merchantCountries.id, id));
  }

  async updateMerchantCountryActive(id: number, active: boolean): Promise<void> {
    await db.update(merchantCountries).set({ active }).where(eq(merchantCountries.id, id));
  }

  async getTransactions(merchantId?: number, opts?: { dateFrom?: Date; dateTo?: Date; limit?: number }): Promise<Transaction[]> {
    const conditions = [];
    if (merchantId) conditions.push(eq(transactions.merchantId, merchantId));
    if (opts?.dateFrom) conditions.push(gte(transactions.createdAt, opts.dateFrom));
    if (opts?.dateTo) conditions.push(lt(transactions.createdAt, opts.dateTo));
    let q = db.select().from(transactions);
    if (conditions.length > 0) q = (q as any).where(and(...conditions));
    q = (q as any).orderBy(desc(transactions.createdAt));
    if (opts?.limit) q = (q as any).limit(opts.limit);
    return q as any;
  }

  async getMerchantsWithStats(): Promise<(Merchant & { hasPin: boolean; linkCount: number; txCount: number; totalRevenue: number })[]> {
    const [merchantsList, pinRows, linkRows, txRows] = await Promise.all([
      db.select().from(merchants).orderBy(desc(merchants.createdAt)),
      db.select({ merchantId: merchantPins.merchantId }).from(merchantPins),
      db.select({
        merchantId: paymentLinks.merchantId,
        cnt: sql<string>`count(*)`,
      }).from(paymentLinks).groupBy(paymentLinks.merchantId),
      db.select({
        merchantId: transactions.merchantId,
        cnt: sql<string>`count(*)`,
        revenue: sql<string>`coalesce(sum(case when status = any(array['confirmed','success','completed']::text[]) then amount else 0 end), 0)`,
      }).from(transactions).groupBy(transactions.merchantId),
    ]);
    const pinSet = new Set(pinRows.map(p => p.merchantId));
    const linkMap = new Map(linkRows.map(r => [r.merchantId, Number(r.cnt)]));
    const txMap = new Map(txRows.map(r => [r.merchantId, { count: Number(r.cnt), revenue: Number(r.revenue) }]));
    return merchantsList.map(m => ({
      ...m,
      hasPin: pinSet.has(m.id),
      linkCount: linkMap.get(m.id) ?? 0,
      txCount: txMap.get(m.id)?.count ?? 0,
      totalRevenue: txMap.get(m.id)?.revenue ?? 0,
    }));
  }

  async getTransactionByTxId(txId: string): Promise<Transaction | undefined> {
    const [tx] = await db.select().from(transactions).where(eq(transactions.txId, txId));
    return tx;
  }

  async createTransaction(tx: InsertTransaction): Promise<Transaction> {
    const [created] = await db.insert(transactions).values(tx).returning();
    return created;
  }

  async getSmsLogs(): Promise<SmsLog[]> {
    return db.select().from(smsLogs).orderBy(desc(smsLogs.createdAt));
  }

  async createSmsLog(log: InsertSmsLog): Promise<SmsLog> {
    const [created] = await db.insert(smsLogs).values(log).returning();
    return created;
  }

  async getNumbers(): Promise<PhoneNumber[]> {
    return db.select().from(numbers);
  }

  async getNumberByPhone(phone: string): Promise<PhoneNumber | undefined> {
    const [num] = await db.select().from(numbers).where(eq(numbers.phoneNumber, phone));
    return num;
  }

  async addNumber(num: InsertNumber): Promise<PhoneNumber> {
    const [created] = await db.insert(numbers).values(num).returning();
    return created;
  }

  async toggleNumberStatus(id: number): Promise<PhoneNumber> {
    const [num] = await db.select().from(numbers).where(eq(numbers.id, id));
    if (!num) throw new Error("Numero introuvable");
    const newStatus = num.status === "active" ? "inactive" : "active";
    const [updated] = await db.update(numbers).set({ status: newStatus }).where(eq(numbers.id, id)).returning();
    return updated;
  }

  async deleteNumber(id: number): Promise<void> {
    await db.delete(numbers).where(eq(numbers.id, id));
  }

  async getSetting(key: string): Promise<string | undefined> {
    const [setting] = await db.select().from(settings).where(eq(settings.key, key));
    return setting?.value;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const existing = await this.getSetting(key);
    if (existing !== undefined) {
      await db.update(settings).set({ value }).where(eq(settings.key, key));
    } else {
      await db.insert(settings).values({ key, value });
    }
  }

  async createLoginLog(log: InsertLoginLog): Promise<void> {
    await db.insert(loginLogs).values(log);
  }

  async getFailedLoginCount(userId: number, role: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(loginLogs)
      .where(and(
        eq(loginLogs.userId, userId),
        eq(loginLogs.role, role),
        eq(loginLogs.success, false),
      ));
    return result[0]?.count || 0;
  }

  async getStats() {
    const validStatuses = ["confirmed", "success", "completed"];
    const [mc] = await db.select({ count: sql<number>`count(*)` }).from(merchants);
    const [tc] = await db.select({ count: sql<number>`count(*)` }).from(transactions).where(inArray(transactions.status, validStatuses));
    const [tv] = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(transactions).where(inArray(transactions.status, validStatuses));
    const [an] = await db.select({ count: sql<number>`count(*)` }).from(numbers).where(eq(numbers.status, "active"));
    return {
      merchantCount: Number(mc?.count || 0),
      transactionCount: Number(tc?.count || 0),
      totalVolume: Number(tv?.total || 0),
      activeNumbers: Number(an?.count || 0),
    };
  }

  async getAdminDetailedStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayIso = todayStart.toISOString();
    const monthIso = monthStart.toISOString();
    const prevMonthIso = prevMonthStart.toISOString();
    const prevMonthEndIso = prevMonthEnd.toISOString();

    type FeeRow = { total: string; today: string; this_month: string; prev_month: string };
    const zero: FeeRow = { total: "0", today: "0", this_month: "0", prev_month: "0" };

    // Bénéfice net WestPay sur les retraits
    // = frais prélevés au marchand (4.5% / 5.5% Congo, 0% fee_exempt) − frais fournisseur (provider_payout_fee)
    // provider_payout_fee = frais OmniPay/Mbiyo sur le payout (stockés explicitement depuis cette version)
    // NULLIF(w.provider_payout_fee, 0) : traite 0 comme « non défini » pour retomber sur w.fees (valeur
    // legacy) sur les anciennes lignes ayant reçu DEFAULT 0 avant la suppression du default.
    const wdResult = await db.execute<FeeRow>(sql`
      SELECT
        coalesce(sum(
          case when m.fee_exempt
               then -coalesce(nullif(w.provider_payout_fee, 0), w.fees, 0)
               else floor(w.amount * case when w.country in ('Congo Brazzaville','Congo RDC') then 0.055 else 0.045 end)
                    - coalesce(nullif(w.provider_payout_fee, 0), w.fees, 0)
          end
        ), 0) as total,
        coalesce(sum(case when w.processed_at >= ${todayIso}::timestamp then
          case when m.fee_exempt
               then -coalesce(nullif(w.provider_payout_fee, 0), w.fees, 0)
               else floor(w.amount * case when w.country in ('Congo Brazzaville','Congo RDC') then 0.055 else 0.045 end)
                    - coalesce(nullif(w.provider_payout_fee, 0), w.fees, 0)
          end else 0 end), 0) as today,
        coalesce(sum(case when w.processed_at >= ${monthIso}::timestamp then
          case when m.fee_exempt
               then -coalesce(nullif(w.provider_payout_fee, 0), w.fees, 0)
               else floor(w.amount * case when w.country in ('Congo Brazzaville','Congo RDC') then 0.055 else 0.045 end)
                    - coalesce(nullif(w.provider_payout_fee, 0), w.fees, 0)
          end else 0 end), 0) as this_month,
        coalesce(sum(case when w.processed_at >= ${prevMonthIso}::timestamp and w.processed_at < ${prevMonthEndIso}::timestamp then
          case when m.fee_exempt
               then -coalesce(nullif(w.provider_payout_fee, 0), w.fees, 0)
               else floor(w.amount * case when w.country in ('Congo Brazzaville','Congo RDC') then 0.055 else 0.045 end)
                    - coalesce(nullif(w.provider_payout_fee, 0), w.fees, 0)
          end else 0 end), 0) as prev_month
      FROM withdrawals w
      LEFT JOIN merchants m ON m.id = w.merchant_id
      WHERE w.status = 'approved'
    `);
    const wdFees = wdResult.rows[0] ?? zero;

    // Frais de virement wallet (pas de provider fee externe — net = fee wallet direct)
    const [wtFees] = await db.select({
      total: sql<number>`coalesce(sum(fee), 0)`,
      today: sql<number>`coalesce(sum(case when processed_at >= ${todayIso}::timestamp then fee else 0 end), 0)`,
      thisMonth: sql<number>`coalesce(sum(case when processed_at >= ${monthIso}::timestamp then fee else 0 end), 0)`,
      prevMonth: sql<number>`coalesce(sum(case when processed_at >= ${prevMonthIso}::timestamp and processed_at < ${prevMonthEndIso}::timestamp then fee else 0 end), 0)`,
    }).from(walletTransfers).where(eq(walletTransfers.status, "approved"));

    // Bénéfice net WestPay sur les collectes
    // = frais prélevés au marchand (5.5% / 6.5% Congo, 0% fee_exempt) − frais fournisseur (provider_fee)
    // Formule exacte alignée sur calcMerchantCredit :
    // frais_collecte = amount - floor(amount * (1 - taux)) = amount - floor(amount * net_rate)
    // net_rate standard = 0.945, Congo = 0.935
    const txResult = await db.execute<FeeRow>(sql`
      SELECT
        coalesce(sum(
          case when m.fee_exempt
               then -coalesce(t.provider_fee, 0)
               else (t.amount - floor(t.amount * case when t.country in ('Congo Brazzaville','Congo RDC') then 0.935 else 0.945 end))
                    - coalesce(t.provider_fee, 0)
          end
        ), 0) as total,
        coalesce(sum(case when t.created_at >= ${todayIso}::timestamp then
          case when m.fee_exempt
               then -coalesce(t.provider_fee, 0)
               else (t.amount - floor(t.amount * case when t.country in ('Congo Brazzaville','Congo RDC') then 0.935 else 0.945 end))
                    - coalesce(t.provider_fee, 0)
          end else 0 end), 0) as today,
        coalesce(sum(case when t.created_at >= ${monthIso}::timestamp then
          case when m.fee_exempt
               then -coalesce(t.provider_fee, 0)
               else (t.amount - floor(t.amount * case when t.country in ('Congo Brazzaville','Congo RDC') then 0.935 else 0.945 end))
                    - coalesce(t.provider_fee, 0)
          end else 0 end), 0) as this_month,
        coalesce(sum(case when t.created_at >= ${prevMonthIso}::timestamp and t.created_at < ${prevMonthEndIso}::timestamp then
          case when m.fee_exempt
               then -coalesce(t.provider_fee, 0)
               else (t.amount - floor(t.amount * case when t.country in ('Congo Brazzaville','Congo RDC') then 0.935 else 0.945 end))
                    - coalesce(t.provider_fee, 0)
          end else 0 end), 0) as prev_month
      FROM transactions t
      JOIN merchants m ON m.id = t.merchant_id
      WHERE t.status IN ('confirmed','success','completed')
        AND t.amount > 0
        AND (t.tx_id IS NULL OR t.tx_id NOT LIKE 'TR-%')
    `);
    const txFees = txResult.rows[0] ?? zero;

    const [apiPay] = await db.select({
      count: sql<number>`count(*)`,
      total: sql<number>`coalesce(sum(amount), 0)`,
    }).from(transactions).where(and(eq(transactions.provider, "omnipay"), sql`amount > 0`, sql`tx_id NOT LIKE 'TR-%'`, inArray(transactions.status, ["confirmed", "success", "completed"])));

    const [linkPay] = await db.select({
      count: sql<number>`count(*)`,
      total: sql<number>`coalesce(sum(total_revenue), 0)`,
    }).from(paymentLinks);

    const [wdStats] = await db.select({
      count: sql<number>`count(*)`,
      total: sql<number>`coalesce(sum(amount), 0)`,
    }).from(withdrawals).where(eq(withdrawals.status, "approved"));

    return {
      commissionTotal: Number(wdFees?.total || 0) + Number(wtFees?.total || 0) + Number(txFees.total || 0),
      commissionToday: Number(wdFees?.today || 0) + Number(wtFees?.today || 0) + Number(txFees.today || 0),
      commissionThisMonth: Number(wdFees?.this_month || 0) + Number(wtFees?.thisMonth || 0) + Number(txFees.this_month || 0),
      commissionPrevMonth: Number(wdFees?.prev_month || 0) + Number(wtFees?.prevMonth || 0) + Number(txFees.prev_month || 0),
      apiPaymentsCount: Number(apiPay?.count || 0),
      apiPaymentsTotal: Number(apiPay?.total || 0),
      linkPaymentsCount: Number(linkPay?.count || 0),
      linkPaymentsTotal: Number(linkPay?.total || 0),
      withdrawalsCount: Number(wdStats?.count || 0),
      withdrawalsTotal: Number(wdStats?.total || 0),
    };
  }

  async getPlatformBalance(): Promise<number> {
    const [row] = await db.select({ total: sql<number>`coalesce(sum(balance), 0)` }).from(merchantCountries);
    return Number(row?.total || 0);
  }

  async getLatestStatsBaseline() {
    const [row] = await db.select().from(statsBaselines).orderBy(desc(statsBaselines.id)).limit(1);
    return row;
  }

  async createStatsBaseline(values: { transactionCount: number; totalVolume: number; commissionTotal: number; apiPaymentsCount: number; apiPaymentsTotal: number; linkPaymentsCount: number; linkPaymentsTotal: number; withdrawalsCount: number; withdrawalsTotal: number }) {
    await db.insert(statsBaselines).values(values);
  }

  async getMerchantStats(merchantId: number) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);

    const [tc] = await db.select({ count: sql<number>`count(*)` }).from(transactions).where(eq(transactions.merchantId, merchantId));
    const [tv] = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(transactions).where(and(eq(transactions.merchantId, merchantId), eq(transactions.status, "confirmed")));
    const [todayRow] = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(transactions).where(and(eq(transactions.merchantId, merchantId), eq(transactions.status, "confirmed"), gte(transactions.createdAt, todayStart)));
    const [yesterdayRow] = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(transactions).where(and(eq(transactions.merchantId, merchantId), eq(transactions.status, "confirmed"), gte(transactions.createdAt, yesterdayStart), lt(transactions.createdAt, todayStart)));
    const [wRow] = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(withdrawals).where(and(eq(withdrawals.merchantId, merchantId), eq(withdrawals.status, "approved")));
    return {
      transactionCount: Number(tc?.count || 0),
      totalVolume: Number(tv?.total || 0),
      todayVolume: Number(todayRow?.total || 0),
      yesterdayVolume: Number(yesterdayRow?.total || 0),
      totalWithdrawn: Number(wRow?.total || 0),
    };
  }

  async getMerchantPin(merchantId: number): Promise<MerchantPin | undefined> {
    const [pin] = await db.select().from(merchantPins).where(eq(merchantPins.merchantId, merchantId));
    return pin;
  }

  async upsertMerchantPin(merchantId: number, pinHash: string): Promise<MerchantPin> {
    const existing = await this.getMerchantPin(merchantId);
    if (existing) {
      const [updated] = await db.update(merchantPins)
        .set({ pinHash, updatedAt: new Date() })
        .where(eq(merchantPins.merchantId, merchantId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(merchantPins)
      .values({ merchantId, pinHash })
      .returning();
    return created;
  }

  async createApiLog(log: InsertApiLog): Promise<ApiLog> {
    const [created] = await db.insert(apiLogs).values(log).returning();
    return created;
  }

  async getApiLogs(merchantId?: number): Promise<ApiLog[]> {
    if (merchantId) {
      return db.select().from(apiLogs).where(eq(apiLogs.merchantId, merchantId)).orderBy(desc(apiLogs.createdAt));
    }
    return db.select().from(apiLogs).orderBy(desc(apiLogs.createdAt));
  }

  async createPendingPayment(payment: InsertPendingPayment): Promise<PendingPayment> {
    const [created] = await db.insert(pendingPayments).values(payment).returning();
    return created;
  }

  async getPendingPaymentById(id: number): Promise<PendingPayment | undefined> {
    const [pp] = await db.select().from(pendingPayments).where(eq(pendingPayments.id, id));
    return pp;
  }

  async getPendingPaymentsByTxId(txId: string): Promise<PendingPayment[]> {
    return db.select().from(pendingPayments)
      .where(and(eq(pendingPayments.txId, txId), eq(pendingPayments.status, "submitted")));
  }

  async updatePendingPaymentTxId(id: number, txId: string): Promise<PendingPayment> {
    const [updated] = await db.update(pendingPayments).set({ txId }).where(eq(pendingPayments.id, id)).returning();
    return updated;
  }

  async updatePendingPaymentStatus(id: number, status: string): Promise<void> {
    await db.update(pendingPayments).set({ status }).where(eq(pendingPayments.id, id));
  }

  async cleanupExpiredPayments(): Promise<number> {
    const result = await db.delete(pendingPayments)
      .where(and(
        eq(pendingPayments.status, "pending"),
        sql`${pendingPayments.expiresAt} < NOW()`
      ))
      .returning();
    return result.length;
  }

  async getPendingPayments(merchantId?: number): Promise<PendingPayment[]> {
    if (merchantId) {
      return db.select().from(pendingPayments).where(eq(pendingPayments.merchantId, merchantId)).orderBy(desc(pendingPayments.createdAt));
    }
    return db.select().from(pendingPayments).orderBy(desc(pendingPayments.createdAt));
  }

  async updateMerchantWebhook(id: number, webhookUrl: string | null, webhookSecret: string | null): Promise<void> {
    await db.update(merchants).set({ webhookUrl, webhookSecret }).where(eq(merchants.id, id));
  }

  async createWebhookLog(log: InsertWebhookLog): Promise<WebhookLog> {
    const [created] = await db.insert(webhookLogs).values(log).returning();
    return created;
  }

  async getWebhookLogs(merchantId?: number): Promise<WebhookLog[]> {
    if (merchantId) {
      return db.select().from(webhookLogs).where(eq(webhookLogs.merchantId, merchantId)).orderBy(desc(webhookLogs.createdAt));
    }
    return db.select().from(webhookLogs).orderBy(desc(webhookLogs.createdAt));
  }

  async updateMerchantCountryOmnipay(id: number, omnipayEnabled: boolean): Promise<void> {
    await db.update(merchantCountries).set({ omnipayEnabled }).where(eq(merchantCountries.id, id));
  }

  async updateMerchantCountryPayinGateway(id: number, payinGateway: string): Promise<void> {
    await db.update(merchantCountries).set({ payinGateway }).where(eq(merchantCountries.id, id));
  }

  async getPendingPaymentByOmnipayReference(reference: string): Promise<PendingPayment | undefined> {
    const [pp] = await db.select().from(pendingPayments)
      .where(eq(pendingPayments.omnipayReference, reference));
    return pp;
  }

  async decrementMerchantCountryBalance(id: number, amount: number): Promise<void> {
    await db.update(merchantCountries)
      .set({ balance: sql`${merchantCountries.balance} - ${amount}` })
      .where(eq(merchantCountries.id, id));
  }

  async getMerchantByTelegramChatId(chatId: string): Promise<Merchant | undefined> {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.telegramChatId, chatId));
    return merchant;
  }

  async updateMerchantTelegramChatId(id: number, chatId: string | null): Promise<void> {
    await db.update(merchants).set({ telegramChatId: chatId }).where(eq(merchants.id, id));
  }

  async updateMerchantTelegramBotLanguage(id: number, language: string): Promise<void> {
    await db.update(merchants).set({ telegramBotLanguage: language }).where(eq(merchants.id, id));
  }

  async createTelegramActivationCode(merchantId: number, code: string, expiresAt: Date): Promise<TelegramActivationCode> {
    const [created] = await db.insert(telegramActivationCodes)
      .values({ merchantId, code, expiresAt, used: false })
      .returning();
    return created;
  }

  async getTelegramActivationCode(code: string): Promise<TelegramActivationCode | undefined> {
    const [ac] = await db.select().from(telegramActivationCodes).where(eq(telegramActivationCodes.code, code));
    return ac;
  }

  async markTelegramActivationCodeUsed(code: string): Promise<void> {
    await db.update(telegramActivationCodes).set({ used: true }).where(eq(telegramActivationCodes.code, code));
  }

  async deleteTelegramActivationCodes(merchantId: number): Promise<void> {
    await db.delete(telegramActivationCodes).where(eq(telegramActivationCodes.merchantId, merchantId));
  }

  async getPaymentLinks(merchantId: number): Promise<PaymentLink[]> {
    return db.select().from(paymentLinks).where(eq(paymentLinks.merchantId, merchantId)).orderBy(desc(paymentLinks.createdAt));
  }

  async getAllPaymentLinks(): Promise<(PaymentLink & { merchantName: string })[]> {
    const rows = await db
      .select({ link: paymentLinks, merchantName: merchants.name })
      .from(paymentLinks)
      .innerJoin(merchants, eq(paymentLinks.merchantId, merchants.id))
      .orderBy(desc(paymentLinks.createdAt));
    return rows.map(r => ({ ...r.link, merchantName: r.merchantName }));
  }

  async getPaymentLinkById(id: number): Promise<PaymentLink | undefined> {
    const [link] = await db.select().from(paymentLinks).where(eq(paymentLinks.id, id));
    return link;
  }

  async getPaymentLinkByUniqueId(uniqueId: string): Promise<PaymentLink | undefined> {
    const [link] = await db.select().from(paymentLinks).where(eq(paymentLinks.uniqueId, uniqueId));
    return link;
  }

  async createPaymentLink(data: InsertPaymentLink): Promise<PaymentLink> {
    const [link] = await db.insert(paymentLinks).values(data).returning();
    return link;
  }

  async updatePaymentLink(id: number, data: Partial<InsertPaymentLink>): Promise<PaymentLink> {
    const [link] = await db.update(paymentLinks).set(data).where(eq(paymentLinks.id, id)).returning();
    return link;
  }

  async deletePaymentLink(id: number): Promise<void> {
    await db.delete(paymentLinks).where(eq(paymentLinks.id, id));
  }

  async recordPaymentLinkPayment(id: number, amount: number): Promise<void> {
    await db.update(paymentLinks).set({
      paymentCount: sql`${paymentLinks.paymentCount} + 1`,
      totalRevenue: sql`${paymentLinks.totalRevenue} + ${amount}`,
      lastPaymentAt: new Date(),
    }).where(eq(paymentLinks.id, id));
  }

  async createWalletTransfer(data: InsertWalletTransfer): Promise<WalletTransfer> {
    const [created] = await db.insert(walletTransfers).values(data).returning();
    return created;
  }

  async getWalletTransfers(merchantId?: number): Promise<(WalletTransfer & { merchantName: string })[]> {
    const rows = await db
      .select({
        id: walletTransfers.id,
        merchantId: walletTransfers.merchantId,
        fromCountryId: walletTransfers.fromCountryId,
        toCountryId: walletTransfers.toCountryId,
        fromCountry: walletTransfers.fromCountry,
        toCountry: walletTransfers.toCountry,
        currency: walletTransfers.currency,
        amount: walletTransfers.amount,
        fee: walletTransfers.fee,
        netAmount: walletTransfers.netAmount,
        status: walletTransfers.status,
        adminNote: walletTransfers.adminNote,
        createdAt: walletTransfers.createdAt,
        processedAt: walletTransfers.processedAt,
        merchantName: merchants.name,
      })
      .from(walletTransfers)
      .leftJoin(merchants, eq(walletTransfers.merchantId, merchants.id))
      .where(merchantId ? eq(walletTransfers.merchantId, merchantId) : sql`1=1`)
      .orderBy(desc(walletTransfers.createdAt));
    return rows.map(r => ({ ...r, merchantName: r.merchantName || "" }));
  }

  async getWalletTransferById(id: number): Promise<WalletTransfer | undefined> {
    const [row] = await db.select().from(walletTransfers).where(eq(walletTransfers.id, id));
    return row;
  }

  async updateWalletTransferStatus(id: number, status: string, adminNote?: string): Promise<void> {
    await db.update(walletTransfers).set({
      status,
      adminNote: adminNote || null,
      processedAt: new Date(),
    }).where(eq(walletTransfers.id, id));
  }

  async applyWalletTransfer(id: number): Promise<void> {
    const transfer = await this.getWalletTransferById(id);
    if (!transfer) throw new Error("Transfert introuvable");
    await db.update(merchantCountries)
      .set({ balance: sql`${merchantCountries.balance} + ${transfer.netAmount}` })
      .where(eq(merchantCountries.id, transfer.toCountryId));
  }

  async reimbursWalletTransfer(id: number): Promise<void> {
    const transfer = await this.getWalletTransferById(id);
    if (!transfer) throw new Error("Transfert introuvable");
    await db.update(merchantCountries)
      .set({ balance: sql`${merchantCountries.balance} + ${transfer.amount + transfer.fee}` })
      .where(eq(merchantCountries.id, transfer.fromCountryId));
  }

  async getWalletTransferCountries(activeOnly = false): Promise<WalletTransferCountry[]> {
    const rows = activeOnly
      ? await db.select().from(walletTransferCountries).where(eq(walletTransferCountries.active, true)).orderBy(walletTransferCountries.currencyZone, walletTransferCountries.country)
      : await db.select().from(walletTransferCountries).orderBy(walletTransferCountries.currencyZone, walletTransferCountries.country);
    return rows;
  }

  async getWalletTransferCountryByName(country: string): Promise<WalletTransferCountry | undefined> {
    const [row] = await db.select().from(walletTransferCountries).where(eq(walletTransferCountries.country, country));
    return row;
  }

  async createWalletTransferCountry(data: InsertWalletTransferCountry): Promise<WalletTransferCountry> {
    const [created] = await db.insert(walletTransferCountries).values(data).returning();
    return created;
  }

  async toggleWalletTransferCountry(id: number, active: boolean): Promise<void> {
    await db.update(walletTransferCountries).set({ active }).where(eq(walletTransferCountries.id, id));
  }

  async deleteWalletTransferCountry(id: number): Promise<void> {
    await db.delete(walletTransferCountries).where(eq(walletTransferCountries.id, id));
  }

  async createWithdrawal(data: InsertWithdrawal): Promise<Withdrawal> {
    const [created] = await db.insert(withdrawals).values(data).returning();
    return created;
  }

  async getWithdrawals(merchantId?: number): Promise<(Withdrawal & { merchantName: string; merchantWebsite?: string | null })[]> {
    const rows = await db
      .select({
        id: withdrawals.id,
        merchantId: withdrawals.merchantId,
        merchantCountryId: withdrawals.merchantCountryId,
        country: withdrawals.country,
        amount: withdrawals.amount,
        phone: withdrawals.phone,
        operator: withdrawals.operator,
        status: withdrawals.status,
        withdrawalMode: withdrawals.withdrawalMode,
        adminNote: withdrawals.adminNote,
        omnipayRef: withdrawals.omnipayRef,
        fees: withdrawals.fees,
        createdAt: withdrawals.createdAt,
        processedAt: withdrawals.processedAt,
        merchantName: merchants.name,
        merchantWebsite: merchants.website,
      })
      .from(withdrawals)
      .leftJoin(merchants, eq(withdrawals.merchantId, merchants.id))
      .where(merchantId ? eq(withdrawals.merchantId, merchantId) : sql`1=1`)
      .orderBy(desc(withdrawals.createdAt));
    return rows.map(r => ({ ...r, merchantName: r.merchantName || "" }));
  }

  async getWithdrawalById(id: number): Promise<Withdrawal | undefined> {
    const [row] = await db.select().from(withdrawals).where(eq(withdrawals.id, id));
    return row;
  }

  async getWithdrawalByOmnipayRef(ref: string): Promise<Withdrawal | undefined> {
    const [row] = await db.select().from(withdrawals).where(eq(withdrawals.omnipayRef, ref));
    return row;
  }

  async updateWithdrawalStatus(id: number, status: string, adminNote?: string, omnipayRef?: string, fees?: number, providerPayoutFee?: number): Promise<void> {
    const updateData: any = {
      status,
      adminNote: adminNote || null,
      processedAt: new Date(),
    };
    if (omnipayRef) updateData.omnipayRef = omnipayRef;
    if (fees !== undefined) updateData.fees = fees;
    if (providerPayoutFee !== undefined) updateData.providerPayoutFee = providerPayoutFee;
    await db.update(withdrawals).set(updateData).where(eq(withdrawals.id, id));
  }

  async applyWithdrawal(id: number): Promise<void> {
    const w = await this.getWithdrawalById(id);
    if (!w) throw new Error("Reversement introuvable");
    await db.update(merchantCountries)
      .set({ balance: sql`${merchantCountries.balance} - ${w.amount}` })
      .where(eq(merchantCountries.id, w.merchantCountryId));
  }

  async getWithdrawalOperators(country?: string, activeOnly?: boolean): Promise<WithdrawalOperator[]> {
    const conditions = [];
    if (country) conditions.push(eq(withdrawalOperators.country, country));
    if (activeOnly) conditions.push(eq(withdrawalOperators.active, true));
    if (conditions.length > 0) {
      return db.select().from(withdrawalOperators).where(and(...conditions)).orderBy(withdrawalOperators.name);
    }
    return db.select().from(withdrawalOperators).orderBy(withdrawalOperators.country, withdrawalOperators.name);
  }

  async getWithdrawalOperatorById(id: number): Promise<WithdrawalOperator | undefined> {
    const [op] = await db.select().from(withdrawalOperators).where(eq(withdrawalOperators.id, id));
    return op;
  }

  async getWithdrawalOperatorByNameAndCountry(name: string, country: string): Promise<WithdrawalOperator | undefined> {
    const [op] = await db.select().from(withdrawalOperators)
      .where(and(eq(withdrawalOperators.name, name), eq(withdrawalOperators.country, country)));
    return op;
  }

  async createWithdrawalOperator(data: InsertWithdrawalOperator): Promise<WithdrawalOperator> {
    const [created] = await db.insert(withdrawalOperators).values(data).returning();
    return created;
  }

  async updateWithdrawalOperator(id: number, data: Partial<InsertWithdrawalOperator>): Promise<WithdrawalOperator> {
    const [updated] = await db.update(withdrawalOperators).set(data).where(eq(withdrawalOperators.id, id)).returning();
    return updated;
  }

  async deleteWithdrawalOperator(id: number): Promise<void> {
    await db.delete(withdrawalOperators).where(eq(withdrawalOperators.id, id));
  }

  async getCryptoAggregators(): Promise<CryptoAggregator[]> {
    return db.select().from(cryptoAggregators).orderBy(desc(cryptoAggregators.createdAt));
  }

  async getCryptoAggregatorById(id: number): Promise<CryptoAggregator | undefined> {
    const [row] = await db.select().from(cryptoAggregators).where(eq(cryptoAggregators.id, id));
    return row;
  }

  async createCryptoAggregator(data: InsertCryptoAggregator): Promise<CryptoAggregator> {
    const [created] = await db.insert(cryptoAggregators).values(data).returning();
    return created;
  }

  async updateCryptoAggregator(id: number, data: Partial<CryptoAggregator>): Promise<void> {
    await db.update(cryptoAggregators).set(data).where(eq(cryptoAggregators.id, id));
  }

  async deleteCryptoAggregator(id: number): Promise<void> {
    await db.delete(cryptoAggregators).where(eq(cryptoAggregators.id, id));
  }

  async getCryptoAggregatorCountries(aggregatorId: number): Promise<CryptoAggregatorCountry[]> {
    return db.select().from(cryptoAggregatorCountries).where(eq(cryptoAggregatorCountries.aggregatorId, aggregatorId));
  }

  async upsertCryptoAggregatorCountry(aggregatorId: number, country: string, active: boolean): Promise<void> {
    const [existing] = await db.select().from(cryptoAggregatorCountries)
      .where(and(eq(cryptoAggregatorCountries.aggregatorId, aggregatorId), eq(cryptoAggregatorCountries.country, country)));
    if (existing) {
      await db.update(cryptoAggregatorCountries).set({ active })
        .where(and(eq(cryptoAggregatorCountries.aggregatorId, aggregatorId), eq(cryptoAggregatorCountries.country, country)));
    } else {
      await db.insert(cryptoAggregatorCountries).values({ aggregatorId, country, active });
    }
  }

  async getCryptoAggregatorMerchants(aggregatorId: number): Promise<CryptoAggregatorMerchant[]> {
    return db.select().from(cryptoAggregatorMerchants).where(eq(cryptoAggregatorMerchants.aggregatorId, aggregatorId));
  }

  async getCryptoAggregatorsByMerchant(merchantId: number): Promise<(CryptoAggregator & { countries: string[] })[]> {
    const rows = await db.select({
      aggregator: cryptoAggregators,
      cam: cryptoAggregatorMerchants,
    }).from(cryptoAggregatorMerchants)
      .innerJoin(cryptoAggregators, eq(cryptoAggregatorMerchants.aggregatorId, cryptoAggregators.id))
      .where(and(eq(cryptoAggregatorMerchants.merchantId, merchantId), eq(cryptoAggregatorMerchants.active, true), eq(cryptoAggregators.active, true)));

    const result: (CryptoAggregator & { countries: string[] })[] = [];
    for (const row of rows) {
      const countryRows = await db.select().from(cryptoAggregatorCountries)
        .where(and(eq(cryptoAggregatorCountries.aggregatorId, row.aggregator.id), eq(cryptoAggregatorCountries.active, true)));
      result.push({ ...row.aggregator, countries: countryRows.map(c => c.country) });
    }
    return result;
  }

  async upsertCryptoAggregatorMerchant(aggregatorId: number, merchantId: number, active: boolean): Promise<void> {
    const [existing] = await db.select().from(cryptoAggregatorMerchants)
      .where(and(eq(cryptoAggregatorMerchants.aggregatorId, aggregatorId), eq(cryptoAggregatorMerchants.merchantId, merchantId)));
    if (existing) {
      await db.update(cryptoAggregatorMerchants).set({ active })
        .where(and(eq(cryptoAggregatorMerchants.aggregatorId, aggregatorId), eq(cryptoAggregatorMerchants.merchantId, merchantId)));
    } else {
      await db.insert(cryptoAggregatorMerchants).values({ aggregatorId, merchantId, active });
    }
    if (active) {
      const [merchant] = await db.select().from(merchants).where(eq(merchants.id, merchantId));
      if (merchant && !merchant.cryptoApiKey) {
        const { randomBytes } = await import("crypto");
        const newKey = "WP-CRYPTO-" + randomBytes(20).toString("hex").toUpperCase();
        await db.update(merchants).set({ cryptoApiKey: newKey }).where(eq(merchants.id, merchantId));
      }
    }
  }

  async getMerchantByCryptoApiKey(apiKey: string): Promise<Merchant | undefined> {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.cryptoApiKey, apiKey));
    return merchant;
  }

  async updateMerchantCryptoApiKey(merchantId: number, apiKey: string): Promise<void> {
    await db.update(merchants).set({ cryptoApiKey: apiKey }).where(eq(merchants.id, merchantId));
  }

  async createCryptoTransaction(data: InsertCryptoTransaction): Promise<CryptoTransaction> {
    const [created] = await db.insert(cryptoTransactions).values(data).returning();
    return created;
  }

  async getCryptoTransactionByTrackId(trackId: string): Promise<CryptoTransaction | undefined> {
    const [row] = await db.select().from(cryptoTransactions).where(eq(cryptoTransactions.trackId, trackId));
    return row;
  }

  async updateCryptoTransactionStatus(id: number, updates: {
    status: string;
    payAmount?: string;
    payCurrency?: string;
    walletAddress?: string;
    network?: string;
    txHash?: string;
  }): Promise<void> {
    const data: any = { status: updates.status };
    if (updates.payAmount !== undefined) data.payAmount = updates.payAmount;
    if (updates.payCurrency !== undefined) data.payCurrency = updates.payCurrency;
    if (updates.walletAddress !== undefined) data.walletAddress = updates.walletAddress;
    if (updates.network !== undefined) data.network = updates.network;
    if (updates.txHash !== undefined) data.txHash = updates.txHash;
    await db.update(cryptoTransactions).set(data).where(eq(cryptoTransactions.id, id));
  }

  async markCryptoTransactionCredited(id: number): Promise<boolean> {
    const result = await db
      .update(cryptoTransactions)
      .set({ creditedAt: new Date() })
      .where(
        and(
          eq(cryptoTransactions.id, id),
          isNull(cryptoTransactions.creditedAt),
        ),
      )
      .returning({ id: cryptoTransactions.id });
    return result.length > 0;
  }

  async getCryptoTransactions(merchantId?: number): Promise<CryptoTransaction[]> {
    if (merchantId) {
      return db.select().from(cryptoTransactions).where(eq(cryptoTransactions.merchantId, merchantId)).orderBy(desc(cryptoTransactions.createdAt));
    }
    return db.select().from(cryptoTransactions).orderBy(desc(cryptoTransactions.createdAt));
  }

  async getCryptoBalances(merchantId: number): Promise<CryptoBalance[]> {
    return db.select().from(cryptoBalances).where(eq(cryptoBalances.merchantId, merchantId));
  }

  async incrementCryptoBalance(merchantId: number, currency: string, amount: number): Promise<void> {
    const [existing] = await db.select().from(cryptoBalances)
      .where(and(eq(cryptoBalances.merchantId, merchantId), eq(cryptoBalances.currency, currency)));
    if (existing) {
      const newBalance = (parseFloat(existing.balance) + amount).toFixed(8);
      await db.update(cryptoBalances)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(and(eq(cryptoBalances.merchantId, merchantId), eq(cryptoBalances.currency, currency)));
    } else {
      await db.insert(cryptoBalances).values({
        merchantId,
        currency,
        balance: amount.toFixed(8),
      });
    }
  }

  async getMerchantBySdkKey(sdkApiKey: string): Promise<Merchant | undefined> {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.sdkApiKey, sdkApiKey));
    return merchant;
  }

  async enableMerchantSdk(merchantId: number, sdkApiKey: string): Promise<void> {
    await db.update(merchants).set({ sdkEnabled: true, sdkApiKey }).where(eq(merchants.id, merchantId));
  }

  async disableMerchantSdk(merchantId: number): Promise<void> {
    await db.update(merchants).set({ sdkEnabled: false, sdkApiKey: null }).where(eq(merchants.id, merchantId));
  }

  async createCryptoWithdrawalRequest(data: InsertCryptoWithdrawalRequest): Promise<CryptoWithdrawalRequest> {
    const [req] = await db.insert(cryptoWithdrawalRequests).values(data).returning();
    return req;
  }

  async getCryptoWithdrawalRequestsByMerchant(merchantId: number): Promise<CryptoWithdrawalRequest[]> {
    return db.select().from(cryptoWithdrawalRequests)
      .where(eq(cryptoWithdrawalRequests.merchantId, merchantId))
      .orderBy(desc(cryptoWithdrawalRequests.createdAt));
  }

  async getAllCryptoWithdrawalRequests(): Promise<CryptoWithdrawalRequest[]> {
    return db.select().from(cryptoWithdrawalRequests)
      .orderBy(desc(cryptoWithdrawalRequests.createdAt));
  }

  async updateCryptoWithdrawalRequest(id: number, status: string, adminNote?: string): Promise<void> {
    await db.update(cryptoWithdrawalRequests)
      .set({ status, ...(adminNote !== undefined && { adminNote }), updatedAt: new Date() })
      .where(eq(cryptoWithdrawalRequests.id, id));
  }

  async deductCryptoBalance(merchantId: number, currency: string, amount: number): Promise<void> {
    const [existing] = await db.select().from(cryptoBalances)
      .where(and(eq(cryptoBalances.merchantId, merchantId), eq(cryptoBalances.currency, currency)));
    if (existing) {
      const newBalance = Math.max(0, parseFloat(existing.balance) - amount).toFixed(8);
      await db.update(cryptoBalances)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(and(eq(cryptoBalances.merchantId, merchantId), eq(cryptoBalances.currency, currency)));
    }
  }

  async createCryptoPaymentLink(data: InsertCryptoPaymentLink): Promise<CryptoPaymentLink> {
    const [created] = await db.insert(cryptoPaymentLinks).values(data).returning();
    return created;
  }

  async getCryptoPaymentLinkByUniqueId(uniqueId: string): Promise<CryptoPaymentLink | undefined> {
    const [row] = await db.select().from(cryptoPaymentLinks).where(eq(cryptoPaymentLinks.uniqueId, uniqueId));
    return row;
  }

  async getCryptoPaymentLinksByMerchant(merchantId: number): Promise<CryptoPaymentLink[]> {
    return db.select().from(cryptoPaymentLinks)
      .where(eq(cryptoPaymentLinks.merchantId, merchantId))
      .orderBy(desc(cryptoPaymentLinks.createdAt));
  }

  async deleteCryptoPaymentLink(id: number, merchantId: number): Promise<void> {
    await db.delete(cryptoPaymentLinks)
      .where(and(eq(cryptoPaymentLinks.id, id), eq(cryptoPaymentLinks.merchantId, merchantId)));
  }

  async getCommissionByMerchant(period: "today" | "month" | "all") {
    const now = new Date();
    const todayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const cutoff = period === "today" ? todayIso : period === "month" ? monthIso : null;

    const txFilter = cutoff ? sql`AND t.created_at >= ${cutoff}::timestamp` : sql``;
    const wdFilter = cutoff ? sql`AND w.processed_at >= ${cutoff}::timestamp` : sql``;
    const wtFilter = cutoff ? sql`AND wt.processed_at >= ${cutoff}::timestamp` : sql``;

    type Row = { merchant_id: string; merchant_name: string; net: string };

    const [txRows, wdRows, wtRows] = await Promise.all([
      db.execute<Row>(sql`
        SELECT t.merchant_id, m.name as merchant_name,
          COALESCE(SUM(
            CASE WHEN m.fee_exempt THEN -COALESCE(t.provider_fee, 0)
            ELSE (t.amount - FLOOR(t.amount * CASE WHEN t.country IN ('Congo Brazzaville','Congo RDC') THEN 0.935 ELSE 0.945 END))
                 - COALESCE(t.provider_fee, 0)
            END
          ), 0) as net
        FROM transactions t
        JOIN merchants m ON m.id = t.merchant_id
        WHERE t.status IN ('confirmed','success','completed') AND t.amount > 0
          AND (t.tx_id IS NULL OR t.tx_id NOT LIKE 'TR-%')
          ${txFilter}
        GROUP BY t.merchant_id, m.name
      `),
      db.execute<Row>(sql`
        SELECT w.merchant_id, m.name as merchant_name,
          COALESCE(SUM(
            CASE WHEN m.fee_exempt THEN -COALESCE(w.fees, 0)
            ELSE FLOOR(w.amount * CASE WHEN w.country IN ('Congo Brazzaville','Congo RDC') THEN 0.055 ELSE 0.045 END)
                 - COALESCE(w.fees, 0)
            END
          ), 0) as net
        FROM withdrawals w
        JOIN merchants m ON m.id = w.merchant_id
        WHERE w.status = 'approved'
          ${wdFilter}
        GROUP BY w.merchant_id, m.name
      `),
      db.execute<Row>(sql`
        SELECT wt.merchant_id, m.name as merchant_name,
          COALESCE(SUM(wt.fee), 0) as net
        FROM wallet_transfers wt
        JOIN merchants m ON m.id = wt.merchant_id
        WHERE wt.status = 'approved'
          ${wtFilter}
        GROUP BY wt.merchant_id, m.name
      `),
    ]);

    const map = new Map<number, { merchantId: number; merchantName: string; collectionBenefit: number; withdrawalBenefit: number; transferBenefit: number }>();
    for (const r of txRows.rows) {
      const id = Number(r.merchant_id);
      map.set(id, { merchantId: id, merchantName: r.merchant_name, collectionBenefit: Number(r.net), withdrawalBenefit: 0, transferBenefit: 0 });
    }
    for (const r of wdRows.rows) {
      const id = Number(r.merchant_id);
      const ex = map.get(id);
      if (ex) ex.withdrawalBenefit = Number(r.net);
      else map.set(id, { merchantId: id, merchantName: r.merchant_name, collectionBenefit: 0, withdrawalBenefit: Number(r.net), transferBenefit: 0 });
    }
    for (const r of wtRows.rows) {
      const id = Number(r.merchant_id);
      const ex = map.get(id);
      if (ex) ex.transferBenefit = Number(r.net);
      else map.set(id, { merchantId: id, merchantName: r.merchant_name, collectionBenefit: 0, withdrawalBenefit: 0, transferBenefit: Number(r.net) });
    }

    return Array.from(map.values())
      .map(r => ({ ...r, totalBenefit: r.collectionBenefit + r.withdrawalBenefit + r.transferBenefit }))
      .sort((a, b) => b.totalBenefit - a.totalBenefit);
  }

  async getCommissionByCountry(period: "today" | "month" | "all") {
    const now = new Date();
    const todayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const cutoff = period === "today" ? todayIso : period === "month" ? monthIso : null;

    const txFilter = cutoff ? sql`AND t.created_at >= ${cutoff}::timestamp` : sql``;
    const wdFilter = cutoff ? sql`AND w.processed_at >= ${cutoff}::timestamp` : sql``;

    type TxRow = { country: string; net: string };

    const [txRows, wdRows] = await Promise.all([
      db.execute<TxRow>(sql`
        SELECT t.country,
          COALESCE(SUM(
            CASE WHEN m.fee_exempt THEN -COALESCE(t.provider_fee, 0)
            ELSE (t.amount - FLOOR(t.amount * CASE WHEN t.country IN ('Congo Brazzaville','Congo RDC') THEN 0.935 ELSE 0.945 END))
                 - COALESCE(t.provider_fee, 0)
            END
          ), 0) as net
        FROM transactions t
        JOIN merchants m ON m.id = t.merchant_id
        WHERE t.status IN ('confirmed','success','completed') AND t.amount > 0
          AND (t.tx_id IS NULL OR t.tx_id NOT LIKE 'TR-%')
          ${txFilter}
        GROUP BY t.country
      `),
      db.execute<TxRow>(sql`
        SELECT w.country,
          COALESCE(SUM(
            CASE WHEN m.fee_exempt THEN -COALESCE(w.fees, 0)
            ELSE FLOOR(w.amount * CASE WHEN w.country IN ('Congo Brazzaville','Congo RDC') THEN 0.055 ELSE 0.045 END)
                 - COALESCE(w.fees, 0)
            END
          ), 0) as net
        FROM withdrawals w
        JOIN merchants m ON m.id = w.merchant_id
        WHERE w.status = 'approved'
          ${wdFilter}
        GROUP BY w.country
      `),
    ]);

    const map = new Map<string, { country: string; collectionBenefit: number; withdrawalBenefit: number }>();
    for (const r of txRows.rows) {
      const c = r.country || "Inconnu";
      map.set(c, { country: c, collectionBenefit: Number(r.net), withdrawalBenefit: 0 });
    }
    for (const r of wdRows.rows) {
      const c = r.country || "Inconnu";
      const ex = map.get(c);
      if (ex) ex.withdrawalBenefit = Number(r.net);
      else map.set(c, { country: c, collectionBenefit: 0, withdrawalBenefit: Number(r.net) });
    }

    return Array.from(map.values())
      .map(r => ({ ...r, totalBenefit: r.collectionBenefit + r.withdrawalBenefit }))
      .sort((a, b) => b.totalBenefit - a.totalBenefit);
  }
}

export const storage = new DatabaseStorage();
