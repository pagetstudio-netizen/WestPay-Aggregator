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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const merchantCountries = pgTable("merchant_countries", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  country: text("country").notNull(),
  apiKey: text("api_key").notNull(),
  balance: integer("balance").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  country: text("country").notNull(),
  txId: text("tx_id").notNull().unique(),
  amount: integer("amount").notNull(),
  payerNumber: text("payer_number"),
  status: text("status").notNull().default("confirmed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const smsLogs = pgTable("sms_logs", {
  id: serial("id").primaryKey(),
  fromSim: text("from_sim").notNull(),
  smsText: text("sms_text").notNull(),
  parsed: boolean("parsed").default(false).notNull(),
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
