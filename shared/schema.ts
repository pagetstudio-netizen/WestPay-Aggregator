import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  apiKey: text("api_key").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const merchants = pgTable("merchants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  slug: text("slug").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  suspended: boolean("suspended").default(false).notNull(),
  feeExempt: boolean("fee_exempt").default(false).notNull(),
  webhookUrl: text("webhook_url"),
  webhookSecret: text("webhook_secret"),
  telegramChatId: text("telegram_chat_id"),
  telegramBotLanguage: text("telegram_bot_language").default("fr").notNull(),
  withdrawalMode: text("withdrawal_mode").default("manual").notNull(),
  website: text("website"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const telegramActivationCodes = pgTable("telegram_activation_codes", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  used: boolean("used").default(false).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const merchantCountries = pgTable("merchant_countries", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  country: text("country").notNull(),
  apiKey: text("api_key").notNull(),
  balance: integer("balance").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  omnipayEnabled: boolean("omnipay_enabled").default(false).notNull(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  country: text("country").notNull(),
  txId: text("tx_id").notNull().unique(),
  amount: integer("amount").notNull(),
  payerNumber: text("payer_number"),
  payerName: text("payer_name"),
  status: text("status").notNull().default("confirmed"),
  provider: text("provider").notNull().default("sms"),
  omnipayTxId: text("omnipay_tx_id"),
  operator: text("operator"),
  omnipayReference: text("omnipay_reference"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const smsLogs = pgTable("sms_logs", {
  id: serial("id").primaryKey(),
  fromSim: text("from_sim").notNull(),
  smsText: text("sms_text").notNull(),
  parsed: boolean("parsed").default(false).notNull(),
  errorMessage: text("error_message"),
  parsedAmount: integer("parsed_amount"),
  parsedTxId: text("parsed_tx_id"),
  parsedPayer: text("parsed_payer"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const numbers = pgTable("numbers", {
  id: serial("id").primaryKey(),
  phoneNumber: text("phone_number").notNull(),
  country: text("country").notNull(),
  operator: text("operator"),
  status: text("status").notNull().default("active"),
  merchantId: integer("merchant_id").references(() => merchants.id, { onDelete: "set null" }),
});

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
});

export const loginLogs = pgTable("login_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  role: text("role").notNull(),
  ip: text("ip"),
  device: text("device"),
  success: boolean("success").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const merchantPins = pgTable("merchant_pins", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }).unique(),
  pinHash: text("pin_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const apiLogs = pgTable("api_logs", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").references(() => merchants.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  ip: text("ip"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pendingPayments = pgTable("pending_payments", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  country: text("country").notNull(),
  amount: integer("amount").notNull(),
  payerPhone: text("payer_phone"),
  payerName: text("payer_name"),
  paymentMethod: text("payment_method").notNull(),
  txId: text("tx_id"),
  status: text("status").notNull().default("pending"),
  redirectUrl: text("redirect_url"),
  omnipayReference: text("omnipay_reference"),
  omnipayTxId: text("omnipay_tx_id"),
  omnipayPaymentUrl: text("omnipay_payment_url"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const webhookLogs = pgTable("webhook_logs", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  payload: text("payload").notNull(),
  statusCode: integer("status_code"),
  response: text("response"),
  success: boolean("success").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const paymentLinks = pgTable("payment_links", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  uniqueId: text("unique_id").notNull().unique(),
  name: text("name").notNull(),
  amountType: text("amount_type").notNull().default("fixed"),
  amount: integer("amount"),
  redirectUrl: text("redirect_url"),
  expiresAt: timestamp("expires_at"),
  paymentLimit: integer("payment_limit"),
  paymentCount: integer("payment_count").default(0).notNull(),
  totalRevenue: integer("total_revenue").default(0).notNull(),
  lastPaymentAt: timestamp("last_payment_at"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const withdrawals = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  merchantCountryId: integer("merchant_country_id").notNull(),
  country: text("country").notNull(),
  amount: integer("amount").notNull(),
  phone: text("phone").notNull(),
  operator: text("operator"),
  status: text("status").notNull().default("pending"),
  withdrawalMode: text("withdrawal_mode").notNull().default("manual"),
  adminNote: text("admin_note"),
  omnipayRef: text("omnipay_ref"),
  fees: integer("fees").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
});

export const withdrawalOperators = pgTable("withdrawal_operators", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("Mobile Money"),
  country: text("country").notNull(),
  dailyLimit: integer("daily_limit").notNull().default(1000000),
  gateway: text("gateway").notNull().default("OmniPay"),
  omnipayCode: text("omnipay_code"),
  active: boolean("active").default(true).notNull(),
  maintenanceAll: boolean("maintenance_all").default(false).notNull(),
  maintenanceDeposits: boolean("maintenance_deposits").default(false).notNull(),
  maintenanceWithdrawals: boolean("maintenance_withdrawals").default(false).notNull(),
  maintenancePaymentLinks: boolean("maintenance_payment_links").default(false).notNull(),
  maintenanceApiPayment: boolean("maintenance_api_payment").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const walletTransferCountries = pgTable("wallet_transfer_countries", {
  id: serial("id").primaryKey(),
  country: text("country").notNull().unique(),
  currencyZone: text("currency_zone").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const statsBaselines = pgTable("stats_baselines", {
  id: serial("id").primaryKey(),
  resetAt: timestamp("reset_at").defaultNow().notNull(),
  transactionCount: integer("transaction_count").default(0).notNull(),
  totalVolume: integer("total_volume").default(0).notNull(),
  commissionTotal: integer("commission_total").default(0).notNull(),
  apiPaymentsCount: integer("api_payments_count").default(0).notNull(),
  apiPaymentsTotal: integer("api_payments_total").default(0).notNull(),
  linkPaymentsCount: integer("link_payments_count").default(0).notNull(),
  linkPaymentsTotal: integer("link_payments_total").default(0).notNull(),
  withdrawalsCount: integer("withdrawals_count").default(0).notNull(),
  withdrawalsTotal: integer("withdrawals_total").default(0).notNull(),
});

export const cryptoAggregators = pgTable("crypto_aggregators", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("oxapay"),
  apiKey: text("api_key").notNull(),
  payoutApiKey: text("payout_api_key"),
  callbackKey: text("callback_key"),
  active: boolean("active").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const cryptoAggregatorCountries = pgTable("crypto_aggregator_countries", {
  id: serial("id").primaryKey(),
  aggregatorId: integer("aggregator_id").notNull().references(() => cryptoAggregators.id, { onDelete: "cascade" }),
  country: text("country").notNull(),
  active: boolean("active").default(false).notNull(),
});

export const cryptoAggregatorMerchants = pgTable("crypto_aggregator_merchants", {
  id: serial("id").primaryKey(),
  aggregatorId: integer("aggregator_id").notNull().references(() => cryptoAggregators.id, { onDelete: "cascade" }),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  active: boolean("active").default(true).notNull(),
});

export const cryptoTransactions = pgTable("crypto_transactions", {
  id: serial("id").primaryKey(),
  aggregatorId: integer("aggregator_id").notNull().references(() => cryptoAggregators.id, { onDelete: "cascade" }),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  trackId: text("track_id").notNull().unique(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("USDT"),
  country: text("country"),
  cryptoAmount: text("crypto_amount"),
  status: text("status").notNull().default("pending"),
  walletAddress: text("wallet_address"),
  callbackUrl: text("callback_url"),
  creditedAt: timestamp("credited_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const walletTransfers = pgTable("wallet_transfers", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  fromCountryId: integer("from_country_id").notNull(),
  toCountryId: integer("to_country_id").notNull(),
  fromCountry: text("from_country").notNull(),
  toCountry: text("to_country").notNull(),
  currency: text("currency").notNull(),
  amount: integer("amount").notNull(),
  fee: integer("fee").notNull().default(0),
  netAmount: integer("net_amount").notNull(),
  status: text("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
});

export const insertTelegramActivationCodeSchema = createInsertSchema(telegramActivationCodes).omit({ id: true, createdAt: true });
export const insertAdminSchema = createInsertSchema(admins).omit({ id: true, createdAt: true });
export const insertMerchantSchema = createInsertSchema(merchants).omit({ id: true, createdAt: true });
export const insertMerchantCountrySchema = createInsertSchema(merchantCountries).omit({ id: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, createdAt: true });
export const insertSmsLogSchema = createInsertSchema(smsLogs).omit({ id: true, createdAt: true });
export const insertNumberSchema = createInsertSchema(numbers).omit({ id: true });
export const insertSettingSchema = createInsertSchema(settings).omit({ id: true });
export const insertLoginLogSchema = createInsertSchema(loginLogs).omit({ id: true, createdAt: true });
export const insertMerchantPinSchema = createInsertSchema(merchantPins).omit({ id: true, createdAt: true, updatedAt: true });
export const insertApiLogSchema = createInsertSchema(apiLogs).omit({ id: true, createdAt: true });
export const insertPendingPaymentSchema = createInsertSchema(pendingPayments).omit({ id: true, createdAt: true });
export const insertWebhookLogSchema = createInsertSchema(webhookLogs).omit({ id: true, createdAt: true });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type Admin = typeof admins.$inferSelect;
export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type Merchant = typeof merchants.$inferSelect;
export type InsertMerchant = z.infer<typeof insertMerchantSchema>;
export type MerchantCountry = typeof merchantCountries.$inferSelect;
export type InsertMerchantCountry = z.infer<typeof insertMerchantCountrySchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type SmsLog = typeof smsLogs.$inferSelect;
export type InsertSmsLog = z.infer<typeof insertSmsLogSchema>;
export type PhoneNumber = typeof numbers.$inferSelect;
export type InsertNumber = z.infer<typeof insertNumberSchema>;
export type Setting = typeof settings.$inferSelect;
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type LoginLog = typeof loginLogs.$inferSelect;
export type InsertLoginLog = z.infer<typeof insertLoginLogSchema>;
export type MerchantPin = typeof merchantPins.$inferSelect;
export type InsertMerchantPin = z.infer<typeof insertMerchantPinSchema>;
export type ApiLog = typeof apiLogs.$inferSelect;
export type InsertApiLog = z.infer<typeof insertApiLogSchema>;
export type PendingPayment = typeof pendingPayments.$inferSelect;
export type InsertPendingPayment = z.infer<typeof insertPendingPaymentSchema>;
export type WebhookLog = typeof webhookLogs.$inferSelect;
export type InsertWebhookLog = z.infer<typeof insertWebhookLogSchema>;
export type TelegramActivationCode = typeof telegramActivationCodes.$inferSelect;
export type InsertTelegramActivationCode = z.infer<typeof insertTelegramActivationCodeSchema>;

export const insertPaymentLinkSchema = createInsertSchema(paymentLinks).omit({ id: true, createdAt: true, paymentCount: true, totalRevenue: true, lastPaymentAt: true });
export type PaymentLink = typeof paymentLinks.$inferSelect;
export type InsertPaymentLink = z.infer<typeof insertPaymentLinkSchema>;

export const insertWalletTransferSchema = createInsertSchema(walletTransfers).omit({ id: true, createdAt: true, processedAt: true });
export type WalletTransfer = typeof walletTransfers.$inferSelect;
export type InsertWalletTransfer = z.infer<typeof insertWalletTransferSchema>;

export const insertWalletTransferCountrySchema = createInsertSchema(walletTransferCountries).omit({ id: true, createdAt: true });
export type WalletTransferCountry = typeof walletTransferCountries.$inferSelect;
export type InsertWalletTransferCountry = z.infer<typeof insertWalletTransferCountrySchema>;

export const insertWithdrawalSchema = createInsertSchema(withdrawals).omit({ id: true, createdAt: true, processedAt: true });
export type Withdrawal = typeof withdrawals.$inferSelect;
export type InsertWithdrawal = z.infer<typeof insertWithdrawalSchema>;

export const insertWithdrawalOperatorSchema = createInsertSchema(withdrawalOperators).omit({ id: true, createdAt: true });
export type WithdrawalOperator = typeof withdrawalOperators.$inferSelect;
export type InsertWithdrawalOperator = z.infer<typeof insertWithdrawalOperatorSchema>;

export const insertCryptoAggregatorSchema = createInsertSchema(cryptoAggregators).omit({ id: true, createdAt: true });
export type CryptoAggregator = typeof cryptoAggregators.$inferSelect;
export type InsertCryptoAggregator = z.infer<typeof insertCryptoAggregatorSchema>;

export const insertCryptoAggregatorCountrySchema = createInsertSchema(cryptoAggregatorCountries).omit({ id: true });
export type CryptoAggregatorCountry = typeof cryptoAggregatorCountries.$inferSelect;
export type InsertCryptoAggregatorCountry = z.infer<typeof insertCryptoAggregatorCountrySchema>;

export const insertCryptoAggregatorMerchantSchema = createInsertSchema(cryptoAggregatorMerchants).omit({ id: true });
export type CryptoAggregatorMerchant = typeof cryptoAggregatorMerchants.$inferSelect;
export type InsertCryptoAggregatorMerchant = z.infer<typeof insertCryptoAggregatorMerchantSchema>;

export const insertCryptoTransactionSchema = createInsertSchema(cryptoTransactions).omit({ id: true, createdAt: true });
export type CryptoTransaction = typeof cryptoTransactions.$inferSelect;
export type InsertCryptoTransaction = z.infer<typeof insertCryptoTransactionSchema>;
