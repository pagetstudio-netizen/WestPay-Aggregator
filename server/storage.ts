import {
  admins, merchants, merchantCountries, transactions, smsLogs, numbers, settings, loginLogs,
  merchantPins, apiLogs, pendingPayments, webhookLogs, telegramActivationCodes, paymentLinks,
  type Admin, type InsertAdmin, type Merchant, type InsertMerchant,
  type MerchantCountry, type InsertMerchantCountry, type Transaction, type InsertTransaction,
  type SmsLog, type InsertSmsLog, type PhoneNumber, type InsertNumber,
  type Setting, type InsertSetting, type LoginLog, type InsertLoginLog,
  type MerchantPin, type InsertMerchantPin, type ApiLog, type InsertApiLog,
  type PendingPayment, type InsertPendingPayment,
  type WebhookLog, type InsertWebhookLog,
  type TelegramActivationCode, type PaymentLink, type InsertPaymentLink,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, and } from "drizzle-orm";

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
  updateMerchantCountryApiKey(id: number, apiKey: string): Promise<void>;

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
  getMerchantStats(merchantId: number): Promise<{ transactionCount: number; totalVolume: number }>;

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
  getPendingPaymentByOmnipayReference(reference: string): Promise<PendingPayment | undefined>;
  decrementMerchantCountryBalance(id: number, amount: number): Promise<void>;

  getMerchantByTelegramChatId(chatId: string): Promise<Merchant | undefined>;
  updateMerchantTelegramChatId(id: number, chatId: string | null): Promise<void>;
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
      .where(and(eq(merchantCountries.merchantId, merchantId), eq(merchantCountries.country, country)));
    return mc;
  }

  async updateMerchantCountryApiKey(id: number, apiKey: string): Promise<void> {
    await db.update(merchantCountries).set({ apiKey }).where(eq(merchantCountries.id, id));
  }

  async getTransactions(merchantId?: number): Promise<Transaction[]> {
    if (merchantId) {
      return db.select().from(transactions).where(eq(transactions.merchantId, merchantId)).orderBy(desc(transactions.createdAt));
    }
    return db.select().from(transactions).orderBy(desc(transactions.createdAt));
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
    const [mc] = await db.select({ count: sql<number>`count(*)` }).from(merchants);
    const [tc] = await db.select({ count: sql<number>`count(*)` }).from(transactions);
    const [tv] = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(transactions);
    const [an] = await db.select({ count: sql<number>`count(*)` }).from(numbers).where(eq(numbers.status, "active"));
    return {
      merchantCount: Number(mc?.count || 0),
      transactionCount: Number(tc?.count || 0),
      totalVolume: Number(tv?.total || 0),
      activeNumbers: Number(an?.count || 0),
    };
  }

  async getMerchantStats(merchantId: number) {
    const [tc] = await db.select({ count: sql<number>`count(*)` }).from(transactions).where(eq(transactions.merchantId, merchantId));
    const [tv] = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(transactions).where(eq(transactions.merchantId, merchantId));
    return {
      transactionCount: Number(tc?.count || 0),
      totalVolume: Number(tv?.total || 0),
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
}

export const storage = new DatabaseStorage();
