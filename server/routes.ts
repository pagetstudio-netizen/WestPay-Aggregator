import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { admins, merchantCountries } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { notifyMerchantPayment, notifyAdminGroup } from "./telegram-bot";
import {
  initiatePayment as omnipayInitiatePayment,
  initiateTransfer as omnipayInitiateTransfer,
  getTransactionStatus as omnipayGetStatus,
  getBalance as omnipayGetBalance,
  verifyCallbackSignature as omnipayVerifySignature,
  generateReference as omnipayGenerateRef,
  OMNIPAY_STATUS,
  OMNIPAY_ERRORS,
  type OmniPayCallbackPayload,
} from "./omnipay";

const JWT_SECRET = process.env.SESSION_SECRET || "westpay-secret-key-change-me";

async function getOmnipayApiKey(): Promise<string | undefined> {
  return process.env.OMNIPAY_API_KEY || await storage.getSetting("omnipay_api_key");
}

async function getOmnipayPayoutApiKey(): Promise<string | undefined> {
  return process.env.OMNIPAY_PAYOUT_API_KEY || await storage.getSetting("omnipay_payout_api_key") || await getOmnipayApiKey();
}

async function getOmnipayCallbackKey(): Promise<string | undefined> {
  return process.env.OMNIPAY_CALLBACK_KEY || await storage.getSetting("omnipay_callback_key");
}

function generateSecureApiKey(country: string): string {
  const prefixes: Record<string, string> = {
    "Togo": "TGO", "Benin": "BEN", "Cote d'Ivoire": "CIV",
    "Senegal": "SEN", "Mali": "MLI", "Burkina Faso": "BFA",
    "Cameroun": "CMR", "Congo Brazzaville": "COG", "Gabon": "GAB",
  };
  const prefix = prefixes[country] || country.substring(0, 3).toUpperCase();
  const randomPart = crypto.randomBytes(20).toString("hex").toUpperCase();
  return `${prefix}-${randomPart}`;
}

function signToken(payload: { id: number; role: string; email: string }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
}

function authMiddleware(role: "admin" | "merchant") {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Non autorise" });
    }
    try {
      const decoded = jwt.verify(auth.split(" ")[1], JWT_SECRET) as any;
      if (decoded.role !== role) {
        return res.status(403).json({ message: "Acces interdit" });
      }
      (req as any).user = decoded;
      next();
    } catch {
      return res.status(401).json({ message: "Token invalide" });
    }
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send("User-agent: *\nDisallow: /\n");
  });

  // ==================== AUTH ====================
  app.post("/api/auth/admin/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Email et mot de passe requis" });

      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(401).json({ message: "Identifiants invalides" });

      const valid = await bcrypt.compare(password, admin.passwordHash);
      if (!valid) {
        await storage.createLoginLog({ userId: admin.id, role: "admin", ip: req.ip || "", device: req.headers["user-agent"] || "", success: false });
        return res.status(401).json({ message: "Identifiants invalides" });
      }

      await storage.createLoginLog({ userId: admin.id, role: "admin", ip: req.ip || "", device: req.headers["user-agent"] || "", success: true });
      const token = signToken({ id: admin.id, role: "admin", email: admin.email });
      res.json({ token, user: { id: admin.id, email: admin.email } });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/auth/merchant/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Email et mot de passe requis" });

      const merchant = await storage.getMerchantByEmail(email);
      if (!merchant) return res.status(401).json({ message: "Identifiants invalides" });
      if (merchant.suspended) return res.status(403).json({ message: "Compte suspendu" });

      const valid = await bcrypt.compare(password, merchant.passwordHash);
      if (!valid) {
        await storage.createLoginLog({ userId: merchant.id, role: "merchant", ip: req.ip || "", device: req.headers["user-agent"] || "", success: false });
        return res.status(401).json({ message: "Identifiants invalides" });
      }

      await storage.createLoginLog({ userId: merchant.id, role: "merchant", ip: req.ip || "", device: req.headers["user-agent"] || "", success: true });
      const token = signToken({ id: merchant.id, role: "merchant", email: merchant.email });
      res.json({ token, user: { id: merchant.id, email: merchant.email, name: merchant.name, slug: merchant.slug } });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ==================== ADMIN ROUTES ====================
  app.get("/api/admin/profile", authMiddleware("admin"), async (req, res) => {
    try {
      const admin = await storage.getAdminById((req as any).user.id);
      if (!admin) return res.status(404).json({ message: "Admin non trouve" });
      res.json({ email: admin.email, apiKey: admin.apiKey });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/telegram/settings", authMiddleware("admin"), async (_req, res) => {
    try {
      const groupId = await storage.getSetting("telegram_group_id");
      const knownGroupsRaw = await storage.getSetting("telegram_known_groups");
      const knownGroups: string[] = knownGroupsRaw ? JSON.parse(knownGroupsRaw) : [];
      res.json({ groupId: groupId || null, knownGroupsCount: knownGroups.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/telegram/settings", authMiddleware("admin"), async (req, res) => {
    try {
      const { groupId } = req.body;
      if (!groupId || typeof groupId !== "string") return res.status(400).json({ message: "groupId requis" });
      const trimmed = groupId.trim();
      await storage.setSetting("telegram_group_id", trimmed);
      const knownGroupsRaw = await storage.getSetting("telegram_known_groups");
      const knownGroups: string[] = knownGroupsRaw ? JSON.parse(knownGroupsRaw) : [];
      if (!knownGroups.includes(trimmed)) {
        knownGroups.push(trimmed);
        await storage.setSetting("telegram_known_groups", JSON.stringify(knownGroups));
      }
      await storage.createAuditLog({ adminId: (req as any).user.id, action: "telegram_group_updated", details: `Groupe admin Telegram mis a jour : ${trimmed}`, ip: req.ip || "" });
      res.json({ success: true, groupId: trimmed });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/stats", authMiddleware("admin"), async (_req, res) => {
    try {
      const stats = await storage.getStats();
      const allLinks = await storage.getAllPaymentLinks();
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayPayments = allLinks.reduce((s, l) => s + (l.lastPaymentAt && new Date(l.lastPaymentAt) >= todayStart ? 1 : 0), 0);
      res.json({ ...stats, paymentLinkCount: allLinks.length, todayPayments });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/merchants", authMiddleware("admin"), async (_req, res) => {
    try {
      const merchantsList = await storage.getMerchants();
      const result = [];
      for (const m of merchantsList) {
        const pin = await storage.getMerchantPin(m.id);
        const links = await storage.getPaymentLinks(m.id);
        const txs = await storage.getTransactions(m.id);
        const totalRevenue = txs.filter(t => t.status === "confirmed").reduce((s, t) => s + t.amount, 0);
        result.push({ ...m, hasPin: !!pin, linkCount: links.length, txCount: txs.length, totalRevenue });
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/merchant/:id/details", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const merchant = await storage.getMerchantById(id);
      if (!merchant) return res.status(404).json({ message: "Marchand introuvable" });
      const [links, txs, countries, pin] = await Promise.all([
        storage.getPaymentLinks(id),
        storage.getTransactions(id),
        storage.getMerchantCountries(id),
        storage.getMerchantPin(id),
      ]);
      const totalRevenue = txs.filter(t => t.status === "confirmed").reduce((s, t) => s + t.amount, 0);
      res.json({ merchant, links, transactions: txs.slice(0, 50), countries, hasPin: !!pin, totalRevenue });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/create-merchant", authMiddleware("admin"), async (req, res) => {
    try {
      const { name, email, slug, password, pin, website } = req.body;
      if (!name || !email || !slug || !password) return res.status(400).json({ message: "Tous les champs sont requis" });

      const existing = await storage.getMerchantByEmail(email);
      if (existing) return res.status(400).json({ message: "Email deja utilise" });

      const slugExists = await storage.getMerchantBySlug(slug);
      if (slugExists) return res.status(400).json({ message: "Slug deja utilise" });

      const passwordHash = await bcrypt.hash(password, 10);
      const merchant = await storage.createMerchant({ name, email, slug, passwordHash, suspended: false, website: website?.trim() || null });

      if (pin && pin.length === 6) {
        const pinHash = await bcrypt.hash(pin, 10);
        await storage.upsertMerchantPin(merchant.id, pinHash);
      }

      await storage.createApiLog({
        merchantId: merchant.id,
        action: "merchant_created",
        ip: req.ip || "",
        description: `Marchand ${name} cree par l'administrateur`,
      });

      res.json(merchant);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/update-merchant", authMiddleware("admin"), async (req, res) => {
    try {
      const { id, ...data } = req.body;
      if (!id) return res.status(400).json({ message: "ID requis" });
      await storage.updateMerchant(id, data);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/admin/merchant/:id/profile", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const { name, email, password, website } = req.body;
      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant) return res.status(404).json({ message: "Marchand introuvable" });
      const updateData: any = {};
      if (name && name.trim()) updateData.name = name.trim();
      if (email && email.trim()) {
        const existing = await storage.getMerchantByEmail(email.trim());
        if (existing && existing.id !== merchantId) return res.status(400).json({ message: "Cet email est deja utilise" });
        updateData.email = email.trim();
      }
      if (password && password.length >= 6) {
        updateData.passwordHash = await bcrypt.hash(password, 10);
      }
      if (website !== undefined) updateData.website = website?.trim() || null;
      if (Object.keys(updateData).length === 0) return res.status(400).json({ message: "Aucune donnee a mettre a jour" });
      await storage.updateMerchant(merchantId, updateData);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/merchant/:id/wallets", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const wallets = await storage.getMerchantCountries(merchantId);
      res.json(wallets);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/admin/merchant/:id/country/:countryId/active", authMiddleware("admin"), async (req, res) => {
    try {
      const countryId = parseInt(req.params.countryId);
      const { active } = req.body;
      await storage.updateMerchantCountryActive(countryId, !!active);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/delete-merchant/:id", authMiddleware("admin"), async (req, res) => {
    try {
      await storage.deleteMerchant(parseInt(req.params.id as string));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/add-country", authMiddleware("admin"), async (req, res) => {
    try {
      const { merchantId, country } = req.body;
      if (!merchantId || !country) return res.status(400).json({ message: "Marchand et pays requis" });
      const apiKey = generateSecureApiKey(country);
      const mc = await storage.addMerchantCountry({ merchantId, country, apiKey, balance: 0, active: true, omnipayEnabled: true });

      await storage.createApiLog({
        merchantId,
        action: "country_added",
        ip: req.ip || "",
        description: `Pays ${country} active avec cle API generee`,
      });

      res.json(mc);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/countries", authMiddleware("admin"), async (_req, res) => {
    try {
      const countries = await storage.getMerchantCountries();
      const merchantsList = await storage.getMerchants();
      const merchantMap = new Map(merchantsList.map(m => [m.id, m.name]));
      const enriched = countries.map(c => ({
        ...c,
        merchantName: merchantMap.get(c.merchantId) || `Marchand #${c.merchantId}`,
      }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/update-balance", authMiddleware("admin"), async (req, res) => {
    try {
      const { id, balance } = req.body;
      if (id === undefined || balance === undefined) return res.status(400).json({ message: "ID et solde requis" });
      await storage.updateMerchantCountryBalance(id, balance);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/transactions", authMiddleware("admin"), async (_req, res) => {
    try {
      const txs = await storage.getTransactions();
      const merchantsList = await storage.getMerchants();
      const merchantMap = new Map(merchantsList.map(m => [m.id, m.name]));
      const enriched = txs.map(t => ({
        ...t,
        merchantName: merchantMap.get(t.merchantId) || `Marchand #${t.merchantId}`,
      }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/numbers", authMiddleware("admin"), async (_req, res) => {
    try {
      const nums = await storage.getNumbers();
      res.json(nums);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/add-number", authMiddleware("admin"), async (req, res) => {
    try {
      const { phoneNumber, country, operator, merchantId } = req.body;
      if (!phoneNumber || !country) return res.status(400).json({ message: "Numero et pays requis" });
      const num = await storage.addNumber({
        phoneNumber, country,
        operator: operator || null,
        status: "active",
        merchantId: merchantId && merchantId !== "none" ? parseInt(merchantId) : null,
      });
      res.json(num);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/toggle-number/:id", authMiddleware("admin"), async (req, res) => {
    try {
      const updated = await storage.toggleNumberStatus(parseInt(req.params.id as string));
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/delete-number/:id", authMiddleware("admin"), async (req, res) => {
    try {
      await storage.deleteNumber(parseInt(req.params.id as string));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/sms-logs", authMiddleware("admin"), async (_req, res) => {
    try {
      const logs = await storage.getSmsLogs();
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/admins", authMiddleware("admin"), async (_req, res) => {
    try {
      const allAdmins = await db.select({ id: admins.id, email: admins.email, createdAt: admins.createdAt }).from(admins).orderBy(admins.createdAt);
      res.json(allAdmins);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/create-admin", authMiddleware("admin"), async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Email et mot de passe requis" });
      if (password.length < 6) return res.status(400).json({ message: "Mot de passe trop court (6 caractères minimum)" });
      const existing = await storage.getAdminByEmail(email);
      if (existing) return res.status(400).json({ message: "Un compte admin avec cet email existe déjà" });
      const passwordHash = await bcrypt.hash(password, 10);
      const apiKey = "WP-ADMIN-" + crypto.randomBytes(16).toString("hex").toUpperCase();
      await storage.createAdmin({ email, passwordHash, apiKey });
      res.json({ success: true, email });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/delete-admin/:id", authMiddleware("admin"), async (req, res) => {
    try {
      const currentAdmin = (req as any).admin;
      const id = Number(req.params.id);
      if (currentAdmin.id === id) return res.status(400).json({ message: "Vous ne pouvez pas supprimer votre propre compte" });
      await db.delete(admins).where(eq(admins.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/change-password", authMiddleware("admin"), async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const admin = await storage.getAdminById((req as any).user.id);
      if (!admin) return res.status(404).json({ message: "Admin non trouve" });
      const valid = await bcrypt.compare(currentPassword, admin.passwordHash);
      if (!valid) return res.status(400).json({ message: "Mot de passe actuel incorrect" });
      const hash = await bcrypt.hash(newPassword, 10);
      await storage.updateAdminPassword(admin.id, hash);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/merchant/:id/api-keys", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id as string);
      const countries = await storage.getMerchantCountries(merchantId);
      res.json(countries);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/update-pin", authMiddleware("admin"), async (req, res) => {
    try {
      const { merchantId, pin } = req.body;
      if (!merchantId || !pin) return res.status(400).json({ message: "Marchand et PIN requis" });
      if (pin.length !== 6 || !/^\d{6}$/.test(pin)) return res.status(400).json({ message: "Le PIN doit etre exactement 6 chiffres" });

      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant) return res.status(404).json({ message: "Marchand non trouve" });

      const pinHash = await bcrypt.hash(pin, 10);
      await storage.upsertMerchantPin(merchantId, pinHash);

      await storage.createApiLog({
        merchantId,
        action: "pin_updated",
        ip: req.ip || "",
        description: `PIN mis a jour par l'administrateur pour ${merchant.name}`,
      });

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/regenerate-api", authMiddleware("admin"), async (req, res) => {
    try {
      const { merchantCountryId } = req.body;
      if (!merchantCountryId) return res.status(400).json({ message: "ID requis" });

      const mc = await storage.getMerchantCountryById(merchantCountryId);
      if (!mc) return res.status(404).json({ message: "Configuration pays non trouvee" });

      const newKey = generateSecureApiKey(mc.country);
      await storage.updateMerchantCountryApiKey(mc.id, newKey);

      await storage.createApiLog({
        merchantId: mc.merchantId,
        action: "api_key_regenerated_admin",
        ip: req.ip || "",
        description: `Cle API regeneree par l'admin pour ${mc.country}`,
      });

      res.json({ success: true, apiKey: newKey });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/api-logs", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = req.query.merchantId ? parseInt(req.query.merchantId as string) : undefined;
      const logs = await storage.getApiLogs(merchantId);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/webhook-logs", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = req.query.merchantId ? parseInt(req.query.merchantId as string) : undefined;
      const logs = await storage.getWebhookLogs(merchantId);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/admin/merchant/:id/webhook", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = parseInt(String(req.params.id));
      const { webhookUrl } = req.body;
      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant) return res.status(404).json({ message: "Marchand non trouve" });

      if (webhookUrl && !/^https?:\/\/.+/.test(webhookUrl)) {
        return res.status(400).json({ message: "URL invalide" });
      }

      const webhookSecret = webhookUrl ? (merchant.webhookSecret || crypto.randomBytes(32).toString("hex")) : null;
      await storage.updateMerchantWebhook(merchantId, webhookUrl || null, webhookSecret);

      res.json({ success: true, webhookUrl: webhookUrl || "", webhookSecret: webhookSecret || "" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ==================== ADMIN TELEGRAM ROUTES ====================
  app.post("/api/admin/merchant/:id/telegram/generate-code", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = parseInt(String(req.params.id));
      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant) return res.status(404).json({ message: "Marchand non trouve" });

      await storage.deleteTelegramActivationCodes(merchantId);

      const code = crypto.randomBytes(4).toString("hex").toUpperCase();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await storage.createTelegramActivationCode(merchantId, code, expiresAt);

      res.json({ success: true, code, expiresAt });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/merchant/:id/telegram/revoke", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = parseInt(String(req.params.id));
      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant) return res.status(404).json({ message: "Marchand non trouve" });

      await storage.updateMerchantTelegramChatId(merchantId, null);
      await storage.deleteTelegramActivationCodes(merchantId);

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/admin/merchant/:id/telegram/language", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const { language } = req.body;
      const allowed = ["fr", "en", "zh", "de"];
      if (!allowed.includes(language)) return res.status(400).json({ message: "Langue non supportee" });
      await storage.updateMerchantTelegramBotLanguage(merchantId, language);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/merchant/:id/telegram/status", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = parseInt(String(req.params.id));
      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant) return res.status(404).json({ message: "Marchand non trouve" });

      res.json({ linked: !!merchant.telegramChatId, chatId: merchant.telegramChatId || null, language: merchant.telegramBotLanguage || "fr" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ==================== MERCHANT ROUTES ====================
  app.get("/api/merchant/balance", authMiddleware("merchant"), async (req, res) => {
    try {
      const countries = await storage.getMerchantCountries((req as any).user.id);
      res.json(countries);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/merchant/transactions", authMiddleware("merchant"), async (req, res) => {
    try {
      const txs = await storage.getTransactions((req as any).user.id);
      res.json(txs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/merchant/api-keys", authMiddleware("merchant"), async (req, res) => {
    try {
      const countries = await storage.getMerchantCountries((req as any).user.id);
      res.json(countries);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/merchant/regenerate-api", authMiddleware("merchant"), async (req, res) => {
    try {
      const { merchantCountryId } = req.body;
      const merchantId = (req as any).user.id;
      if (!merchantCountryId) return res.status(400).json({ message: "ID du pays requis" });

      const mc = await storage.getMerchantCountryById(merchantCountryId);
      if (!mc || mc.merchantId !== merchantId) return res.status(403).json({ message: "Acces interdit" });

      const newKey = generateSecureApiKey(mc.country);
      await storage.updateMerchantCountryApiKey(mc.id, newKey);

      await storage.createApiLog({
        merchantId,
        action: "api_key_regenerated",
        ip: req.ip || "",
        description: `Cle API regeneree par le marchand pour ${mc.country}`,
      });

      res.json({ success: true, apiKey: newKey });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/merchant/stats", authMiddleware("merchant"), async (req, res) => {
    try {
      const stats = await storage.getMerchantStats((req as any).user.id);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/merchant/change-password", authMiddleware("merchant"), async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const merchant = await storage.getMerchantById((req as any).user.id);
      if (!merchant) return res.status(404).json({ message: "Marchand non trouve" });
      const valid = await bcrypt.compare(currentPassword, merchant.passwordHash);
      if (!valid) return res.status(400).json({ message: "Mot de passe actuel incorrect" });
      const hash = await bcrypt.hash(newPassword, 10);
      await storage.updateMerchant(merchant.id, { passwordHash: hash });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ==================== MERCHANT WEBHOOK ====================

  async function sendWebhookNotification(merchantId: number, payload: Record<string, any>): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    try {
      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant?.webhookUrl) return { success: false, error: "Aucune URL webhook configuree" };

      const payloadStr = JSON.stringify(payload);
      const signature = merchant.webhookSecret
        ? crypto.createHmac("sha256", merchant.webhookSecret).update(payloadStr).digest("hex")
        : "";

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(merchant.webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-RobotPay-Signature": signature,
            "X-RobotPay-Event": payload.event || "payment.confirmed",
          },
          body: payloadStr,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const responseText = await response.text().catch(() => "");
        const success = response.status >= 200 && response.status < 300;

        await storage.createWebhookLog({
          merchantId,
          url: merchant.webhookUrl,
          payload: payloadStr,
          statusCode: response.status,
          response: responseText.substring(0, 500),
          success,
        });

        console.log(`[WEBHOOK] ${success ? "Succes" : "Echec"} pour marchand #${merchantId}: ${response.status}`);
        return { success, statusCode: response.status };
      } catch (fetchErr: any) {
        clearTimeout(timeout);
        const errorMsg = fetchErr.name === "AbortError" ? "Timeout (10s)" : fetchErr.message;

        await storage.createWebhookLog({
          merchantId,
          url: merchant.webhookUrl,
          payload: payloadStr,
          statusCode: 0,
          response: errorMsg,
          success: false,
        });

        console.error(`[WEBHOOK] Erreur envoi pour marchand #${merchantId}:`, errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err: any) {
      console.error(`[WEBHOOK] Erreur generale:`, err.message);
      return { success: false, error: err.message };
    }
  }

  app.get("/api/merchant/webhook", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchant = await storage.getMerchantById((req as any).user.id);
      if (!merchant) return res.status(404).json({ message: "Marchand non trouve" });
      res.json({
        webhookUrl: merchant.webhookUrl || "",
        webhookSecret: merchant.webhookSecret || "",
        hasWebhook: !!merchant.webhookUrl,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/merchant/webhook", authMiddleware("merchant"), async (req, res) => {
    try {
      const { webhookUrl } = req.body;
      const merchantId = (req as any).user.id;

      if (webhookUrl && !/^https?:\/\/.+/.test(webhookUrl)) {
        return res.status(400).json({ message: "URL invalide. Elle doit commencer par http:// ou https://" });
      }

      const webhookSecret = webhookUrl ? crypto.randomBytes(32).toString("hex") : null;
      await storage.updateMerchantWebhook(merchantId, webhookUrl || null, webhookSecret);

      await storage.createApiLog({
        merchantId,
        action: webhookUrl ? "webhook_configured" : "webhook_removed",
        ip: req.ip || "",
        description: webhookUrl ? `Webhook configure: ${webhookUrl}` : "Webhook supprime",
      });

      res.json({
        success: true,
        webhookUrl: webhookUrl || "",
        webhookSecret: webhookSecret || "",
        hasWebhook: !!webhookUrl,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/merchant/webhook/test", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant?.webhookUrl) {
        return res.status(400).json({ message: "Aucune URL webhook configuree" });
      }

      const testPayload = {
        event: "test",
        txId: "TEST-" + Date.now(),
        amount: 1000,
        currency: "XOF",
        payer: "+22890000000",
        country: "Togo",
        merchantSlug: merchant.slug,
        timestamp: new Date().toISOString(),
        test: true,
      };

      const result = await sendWebhookNotification(merchantId, testPayload);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/merchant/webhook/logs", authMiddleware("merchant"), async (req, res) => {
    try {
      const logs = await storage.getWebhookLogs((req as any).user.id);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ==================== API DOCS ACCESS (PIN protected) ====================
  app.post("/api/docs/access", async (req, res) => {
    try {
      const { email, pin } = req.body;
      if (!email || !pin) return res.status(400).json({ message: "Email et code PIN requis" });

      const merchant = await storage.getMerchantByEmail(email);
      if (!merchant) return res.status(401).json({ message: "Acces refuse. Veuillez contacter l'administrateur." });

      const merchantPin = await storage.getMerchantPin(merchant.id);
      if (!merchantPin) return res.status(401).json({ message: "Acces refuse. Aucun code PIN configure. Veuillez contacter l'administrateur." });

      const valid = await bcrypt.compare(pin, merchantPin.pinHash);
      if (!valid) {
        await storage.createApiLog({
          merchantId: merchant.id,
          action: "docs_access_failed",
          ip: req.ip || "",
          description: `Tentative d'acces echouee a la documentation API`,
        });
        return res.status(401).json({ message: "Acces refuse. Code PIN incorrect." });
      }

      await storage.createApiLog({
        merchantId: merchant.id,
        action: "docs_access_granted",
        ip: req.ip || "",
        description: `Acces accorde a la documentation API`,
      });

      const docsToken = jwt.sign({ merchantId: merchant.id, purpose: "docs" }, JWT_SECRET, { expiresIn: "1h" });
      res.json({ success: true, token: docsToken, merchant: { name: merchant.name, email: merchant.email } });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ==================== PAYMENT PAGE (public) ====================
  app.get("/api/payment/:slug/info", async (req, res) => {
    try {
      const merchant = await storage.getMerchantBySlug(req.params.slug);
      if (!merchant || merchant.suspended) {
        return res.status(404).json({ message: "Marchand introuvable ou suspendu" });
      }

      const countries = await storage.getMerchantCountries(merchant.id);
      const activeCountries = countries.filter(c => c.active);

      res.json({
        merchant: {
          name: merchant.name,
          slug: merchant.slug,
          countries: activeCountries.map(c => c.country),
        },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ==================== PAYMENT WIZARD (public) ====================
  app.post("/api/payment/initiate", async (req, res) => {
    try {
      const { merchantSlug, country, amount, payerPhone, payerName, paymentMethod, redirectUrl, firstName, lastName, otp, operator } = req.body;
      if (!merchantSlug || !country || !amount || !paymentMethod) {
        return res.status(400).json({ message: "Marchand, pays, montant et methode de paiement requis" });
      }

      const parsedAmount = parseInt(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: "Le montant doit etre un nombre positif" });
      }

      const merchant = await storage.getMerchantBySlug(merchantSlug);
      if (!merchant || merchant.suspended) {
        return res.status(404).json({ message: "Marchand introuvable ou suspendu" });
      }

      const countries = await storage.getMerchantCountries(merchant.id);
      const merchantCountry = countries.find(c => c.country === country && c.active);
      if (!merchantCountry) {
        return res.status(400).json({ message: "Pays non disponible pour ce marchand" });
      }

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      const omnipayApiKey = await getOmnipayApiKey();
      if (!omnipayApiKey) {
        return res.status(500).json({ message: "Systeme de paiement non configure. Contactez l'administrateur." });
      }

      if (!payerPhone) {
        return res.status(400).json({ message: "Numero de telephone requis" });
      }

      {

        const reference = omnipayGenerateRef();
        const nameParts = (payerName || "Client WestPay").split(" ");
        const fName = firstName || nameParts[0] || "Client";
        const lName = lastName || nameParts.slice(1).join(" ") || "WestPay";

        const dialCodes: Record<string, string> = {
          "Togo": "228", "Benin": "229", "Cote d'Ivoire": "225",
          "Senegal": "221", "Mali": "223", "Burkina Faso": "226",
          "Cameroun": "237", "Congo Brazzaville": "242", "Gabon": "241",
        };
        const dialCode = dialCodes[country] || "";
        const cleanPhone = payerPhone.replace(/[\s\-\(\)\+]/g, "");
        const msisdn = cleanPhone.startsWith(dialCode) ? cleanPhone : `${dialCode}${cleanPhone}`;

        const omnipayOperator = operator || (paymentMethod.toLowerCase().includes("wave") ? "wave" : undefined);

        const callbackBaseUrl = `${req.protocol}://${req.get("host")}`;
        const returnUrl = redirectUrl || `${callbackBaseUrl}/pay?merchant=${merchantSlug}&amount=${parsedAmount}&country=${country}&omnipay_status=complete`;

        const autoOtp = otp || String(Math.floor(1000 + Math.random() * 9000));

        try {
          const omnipayResult = await omnipayInitiatePayment({
            apikey: omnipayApiKey,
            msisdn,
            amount: parsedAmount,
            reference,
            first_name: fName,
            last_name: lName,
            otp: autoOtp,
            operator: omnipayOperator,
            return_url: omnipayOperator === "wave" ? returnUrl : undefined,
          });

          if (omnipayResult.success !== 1) {
            const errorMsg = OMNIPAY_ERRORS[omnipayResult.code || 0] || omnipayResult.message || "Erreur de paiement";
            return res.status(400).json({ message: errorMsg, omnipayError: true, code: omnipayResult.code });
          }

          const pending = await storage.createPendingPayment({
            merchantId: merchant.id,
            country,
            amount: parsedAmount,
            payerPhone: payerPhone || null,
            payerName: payerName || null,
            paymentMethod,
            txId: null,
            status: "omnipay_pending",
            redirectUrl: redirectUrl || null,
            omnipayReference: reference,
            omnipayTxId: omnipayResult.id ? String(omnipayResult.id) : null,
            omnipayPaymentUrl: omnipayResult.payment_url || null,
            expiresAt,
          });

          await storage.createApiLog({
            merchantId: merchant.id,
            action: "omnipay_payment_initiated",
            ip: req.ip || "",
            description: `Paiement OmniPay initie - Ref: ${reference} - Montant: ${parsedAmount} - Tel: ${msisdn}`,
          });

          res.json({
            success: true,
            paymentId: pending.id,
            omnipay: true,
            omnipayReference: reference,
            paymentUrl: omnipayResult.payment_url || null,
            fees: omnipayResult.fees || 0,
          });
        } catch (omnipayErr: any) {
          console.error("[OMNIPAY] Erreur initiation:", omnipayErr.message);
          return res.status(500).json({ message: "Erreur de connexion au service de paiement. Veuillez reessayer." });
        }
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/payment/validate", async (req, res) => {
    try {
      const { paymentId, txId } = req.body;
      if (!paymentId || !txId) {
        return res.status(400).json({ success: false, message: "ID de paiement et ID de transaction requis" });
      }

      const pending = await storage.getPendingPaymentById(parseInt(paymentId));
      if (!pending) {
        return res.status(404).json({ success: false, message: "Paiement introuvable ou expire" });
      }

      if (pending.status !== "pending") {
        return res.status(400).json({ success: false, message: "Ce paiement a deja ete traite" });
      }

      if (new Date(pending.expiresAt) < new Date()) {
        await storage.updatePendingPaymentStatus(pending.id, "expired");
        return res.status(400).json({ success: false, message: "Ce paiement a expire. Veuillez recommencer." });
      }

      const encryptedTxId = crypto.createHash("sha256").update(txId.trim()).digest("hex").substring(0, 16).toUpperCase();

      await storage.updatePendingPaymentTxId(pending.id, txId.trim());
      await storage.updatePendingPaymentStatus(pending.id, "submitted");

      const merchant = await storage.getMerchantById(pending.merchantId);

      await storage.createApiLog({
        merchantId: pending.merchantId,
        action: "payment_submitted",
        ip: req.ip || "",
        description: `Paiement #${pending.id} soumis - TX: ${txId.trim()} - Montant: ${pending.amount} F CFA - ${pending.paymentMethod}`,
      });

      res.json({
        success: true,
        message: "Votre paiement a ete enregistre avec succes.",
        redirectUrl: pending.redirectUrl,
        amount: pending.amount,
        txId: txId.trim(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ==================== VERIFY TRANSACTION (public) ====================
  app.post("/api/verify-transaction", async (req, res) => {
    try {
      const { txId, merchantSlug, payerPhone, amount } = req.body;
      if (!txId || !merchantSlug) {
        return res.status(400).json({ verified: false, message: "ID de transaction et marchand requis" });
      }

      const merchant = await storage.getMerchantBySlug(merchantSlug);
      if (!merchant) {
        return res.status(404).json({ verified: false, message: "Marchand introuvable" });
      }

      const transaction = await storage.getTransactionByTxId(txId);
      if (!transaction) {
        return res.json({
          verified: false,
          message: "Transaction non trouvee. Si vous venez d'envoyer le paiement, veuillez patienter quelques instants et reessayer. Le traitement peut prendre jusqu'a 2 minutes.",
        });
      }

      if (transaction.merchantId !== merchant.id) {
        return res.json({
          verified: false,
          message: "Cette transaction n'appartient pas a ce marchand.",
        });
      }

      if (amount && typeof amount === "number" && transaction.amount !== amount) {
        return res.json({
          verified: false,
          message: `Le montant de la transaction (${transaction.amount} F CFA) ne correspond pas au montant attendu (${amount} F CFA).`,
        });
      }

      const logDescription = payerPhone
        ? `Transaction ${txId} verifiee - Montant: ${transaction.amount} F CFA - Numero: ${payerPhone}`
        : `Transaction ${txId} verifiee - Montant: ${transaction.amount} F CFA`;

      await storage.createApiLog({
        merchantId: merchant.id,
        action: "transaction_verified",
        ip: req.ip || "",
        description: logDescription,
      });

      res.json({
        verified: true,
        transaction: {
          txId: transaction.txId,
          amount: transaction.amount,
          country: transaction.country,
          status: transaction.status,
          createdAt: transaction.createdAt,
        },
        message: "Transaction verifiee avec succes. Le montant a ete credite sur le compte du marchand.",
      });
    } catch (err: any) {
      res.status(500).json({ verified: false, message: err.message });
    }
  });

  setInterval(async () => {
    try {
      const cleaned = await storage.cleanupExpiredPayments();
      if (cleaned > 0) console.log(`[Cleanup] ${cleaned} paiement(s) expire(s) supprime(s)`);
    } catch (err) {}
  }, 60 * 1000);

  // ==================== OMNIPAY ROUTES ====================

  app.post("/api/omnipay/callback", async (req, res) => {
    try {
      const payload = req.body as OmniPayCallbackPayload;
      console.log(`[OMNIPAY CALLBACK] Recu: action=${payload.action} ref=${payload.reference} status=${payload.status}`);

      if (!payload.reference) {
        return res.status(400).json({ message: "Reference manquante" });
      }

      const callbackKey = await getOmnipayCallbackKey();
      if (callbackKey) {
        if (!payload.signature) {
          console.error("[OMNIPAY CALLBACK] Signature manquante");
          return res.status(401).json({ message: "Signature manquante" });
        }
        const isValid = omnipayVerifySignature(callbackKey, payload);
        if (!isValid) {
          console.error("[OMNIPAY CALLBACK] Signature invalide");
          return res.status(401).json({ message: "Signature invalide" });
        }
      }

      const pending = await storage.getPendingPaymentByOmnipayReference(payload.reference);
      if (!pending) {
        console.log(`[OMNIPAY CALLBACK] Paiement en attente non trouve pour ref: ${payload.reference}`);
        return res.status(404).json({ message: "Paiement non trouve" });
      }

      if (pending.status === "confirmed" || pending.status === "omnipay_confirmed") {
        return res.json({ status: "already_processed" });
      }

      const statusNum = parseInt(payload.status);

      if (statusNum === OMNIPAY_STATUS.SUCCESS) {
        const merchant = await storage.getMerchantById(pending.merchantId);
        const merchantCountry = await storage.findMerchantCountryBySimAndCountry(pending.merchantId, pending.country);

        if (!merchantCountry) {
          console.error(`[OMNIPAY CALLBACK] Pays ${pending.country} introuvable pour marchand #${pending.merchantId}`);
          await storage.updatePendingPaymentStatus(pending.id, "omnipay_error");
          return res.status(500).json({ message: "Configuration marchand/pays introuvable" });
        }

        await storage.updatePendingPaymentStatus(pending.id, "omnipay_confirmed");

        {
          const txId = `OP-${payload.id || payload.reference}`;

          const existingTx = await storage.getTransactionByTxId(txId);
          if (!existingTx) {
            const payerFullName = [payload.first_name, payload.last_name].filter(Boolean).join(" ") || pending.payerName || null;
            await storage.createTransaction({
              merchantId: pending.merchantId,
              country: pending.country,
              txId,
              amount: pending.amount,
              payerNumber: payload.msisdn || pending.payerPhone || null,
              payerName: payerFullName,
              status: "confirmed",
              provider: "omnipay",
              omnipayTxId: payload.id || null,
            });

            await storage.incrementMerchantCountryBalance(merchantCountry.id, pending.amount);

            console.log(`[OMNIPAY CALLBACK] Paiement confirme: ${txId} - ${pending.amount} - Marchand #${pending.merchantId}`);

            await storage.createApiLog({
              merchantId: pending.merchantId,
              action: "omnipay_payment_confirmed",
              ip: req.ip || "",
              description: `Paiement OmniPay confirme - Ref: ${payload.reference} - TX: ${txId} - Montant: ${pending.amount} - Frais: ${payload.fees || 0}`,
            });

            if (merchant?.webhookUrl) {
              sendWebhookNotification(pending.merchantId, {
                event: "payment.confirmed",
                txId,
                amount: pending.amount,
                currency: payload.currency || "XOF",
                payer: payload.msisdn || pending.payerPhone || "",
                country: pending.country,
                merchantSlug: merchant.slug,
                provider: "omnipay",
                omnipayReference: payload.reference,
                timestamp: new Date().toISOString(),
              }).catch(err => console.error("[WEBHOOK] Erreur async:", err));
            }

            notifyMerchantPayment(pending.merchantId, {
              txId,
              amount: pending.amount,
              payerNumber: payload.msisdn || pending.payerPhone,
              country: pending.country,
              provider: "omnipay",
            }).catch(() => {});

            notifyAdminGroup(
              `✅ *Paiement confirmé*\n\n🏪 Marchand : *${merchant?.name || `#${pending.merchantId}`}*\n💰 Montant : *${pending.amount.toLocaleString("fr-FR")} F CFA*\n🌍 Pays : ${pending.country.toUpperCase()}\n🔖 TX : \`${txId}\``
            ).catch(() => {});
          }
        }

        res.json({ status: "confirmed" });
      } else if (statusNum === OMNIPAY_STATUS.FAILED) {
        await storage.updatePendingPaymentStatus(pending.id, "omnipay_failed");

        await storage.createApiLog({
          merchantId: pending.merchantId,
          action: "omnipay_payment_failed",
          ip: req.ip || "",
          description: `Paiement OmniPay echoue - Ref: ${payload.reference} - Message: ${payload.message}`,
        });

        console.log(`[OMNIPAY CALLBACK] Paiement echoue: ${payload.reference} - ${payload.message}`);
        res.json({ status: "failed" });
      } else {
        await storage.updatePendingPaymentStatus(pending.id, `omnipay_status_${statusNum}`);
        res.json({ status: "pending", omnipayStatus: statusNum });
      }
    } catch (err: any) {
      console.error("[OMNIPAY CALLBACK] Erreur:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/omnipay/payment/:paymentId/status", async (req, res) => {
    try {
      const pending = await storage.getPendingPaymentById(parseInt(req.params.paymentId));
      if (!pending) return res.status(404).json({ message: "Paiement non trouve" });

      if (pending.status === "omnipay_confirmed") {
        return res.json({ status: "confirmed", paymentId: pending.id });
      }
      if (pending.status === "omnipay_failed" || pending.status === "omnipay_error") {
        return res.json({ status: "failed", paymentId: pending.id });
      }

      if (pending.omnipayReference) {
        const omnipayApiKey = await getOmnipayApiKey();
        if (omnipayApiKey) {
          try {
            const statusResult = await omnipayGetStatus(omnipayApiKey, pending.omnipayReference);
            if (statusResult.success === 1) {
              return res.json({ status: "pending", paymentId: pending.id, omnipayStatus: statusResult.status });
            }
          } catch {
          }
        }
      }

      res.json({ status: "pending", paymentId: pending.id });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/omnipay/settings", authMiddleware("admin"), async (_req, res) => {
    try {
      const apiKey = await getOmnipayApiKey();
      const callbackKey = await getOmnipayCallbackKey();
      const payoutApiKey = await storage.getSetting("omnipay_payout_api_key");
      res.json({
        apiKey: apiKey || "",
        callbackKey: callbackKey || "",
        payoutApiKey: payoutApiKey || "",
        configured: !!apiKey,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/omnipay/settings", authMiddleware("admin"), async (req, res) => {
    try {
      const { apiKey, callbackKey, payoutApiKey } = req.body;
      if (apiKey !== undefined) await storage.setSetting("omnipay_api_key", apiKey);
      if (callbackKey !== undefined) await storage.setSetting("omnipay_callback_key", callbackKey);
      if (payoutApiKey !== undefined) await storage.setSetting("omnipay_payout_api_key", payoutApiKey);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/omnipay/balance", authMiddleware("admin"), async (_req, res) => {
    try {
      const apiKey = await getOmnipayApiKey();
      if (!apiKey) return res.status(400).json({ message: "Cle API non configuree" });
      const result = await omnipayGetBalance(apiKey);
      if (result.success !== 1) {
        return res.status(400).json({ message: OMNIPAY_ERRORS[result.code || 0] || result.message || "Erreur" });
      }
      res.json({ balance: result.balance });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/admin/merchant/:id/country/:countryId/omnipay", authMiddleware("admin"), async (req, res) => {
    try {
      const { omnipayEnabled } = req.body;
      const countryId = parseInt(req.params.countryId);
      await storage.updateMerchantCountryOmnipay(countryId, !!omnipayEnabled);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/merchant/transfer", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const { country, msisdn, amount, firstName, lastName, operator } = req.body;

      if (!country || !msisdn || !amount || !firstName || !lastName) {
        return res.status(400).json({ message: "Pays, numero, montant, prenom et nom requis" });
      }

      const parsedAmount = parseInt(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: "Le montant doit etre un nombre positif" });
      }

      const merchantCountry = await storage.findMerchantCountryBySimAndCountry(merchantId, country);
      if (!merchantCountry || !merchantCountry.active) {
        return res.status(400).json({ message: "Pays non disponible" });
      }

      if (!merchantCountry.omnipayEnabled) {
        return res.status(400).json({ message: "Paiement non active pour ce pays" });
      }

      if (merchantCountry.balance < parsedAmount) {
        return res.status(400).json({ message: "Solde insuffisant" });
      }

      const omnipayApiKey = await getOmnipayApiKey();
      if (!omnipayApiKey) {
        return res.status(500).json({ message: "Systeme de paiement non configure" });
      }

      const reference = omnipayGenerateRef();

      const result = await omnipayInitiateTransfer({
        apikey: omnipayApiKey,
        msisdn,
        amount: parsedAmount,
        reference,
        first_name: firstName,
        last_name: lastName,
        operator: operator || undefined,
      });

      if (result.success !== 1) {
        const errorMsg = OMNIPAY_ERRORS[result.code || 0] || result.message || "Erreur de paiement";
        return res.status(400).json({ message: errorMsg });
      }

      await storage.decrementMerchantCountryBalance(merchantCountry.id, parsedAmount);

      const txId = `TR-${result.id || reference}`;
      await storage.createTransaction({
        merchantId,
        country,
        txId,
        amount: -parsedAmount,
        payerNumber: msisdn,
        status: "confirmed",
        provider: "omnipay",
        omnipayTxId: result.id ? String(result.id) : null,
      });

      await storage.createApiLog({
        merchantId,
        action: "omnipay_transfer",
        ip: req.ip || "",
        description: `Transfert OmniPay: ${parsedAmount} vers ${msisdn} - Ref: ${reference} - Frais: ${result.fees || 0}`,
      });

      res.json({
        success: true,
        reference,
        omnipayId: result.id,
        fees: result.fees || 0,
        amount: parsedAmount,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ==================== SMS RECEIVE (for Android SMS Forwarder) ====================

  function normalizePhone(phone: string): string {
    let cleaned = phone.replace(/[\s\-\(\)]/g, "").trim();
    if (cleaned.startsWith("00")) {
      cleaned = "+" + cleaned.substring(2);
    }
    return cleaned;
  }

  function parseSmsContent(smsText: string): { txId: string | null; amount: number | null; payerNumber: string | null; errors: string[] } {
    const errors: string[] = [];
    let txId: string | null = null;
    let amount: number | null = null;
    let payerNumber: string | null = null;

    const txPatterns = [
      /(?:Transaction\s*ID|Trans\.?\s*ID|TXN?\s*ID|TX\s*N°)\s*[:\s]?\s*([A-Za-z0-9\-\.]{5,})/i,
      /(?:Ref(?:erence)?|N°)\s*[:\s]?\s*([A-Za-z0-9\-\.]{5,})/i,
      /(?:ID)\s*[:\s]\s*([A-Za-z0-9\-\.]{5,})/i,
      /\b(TX[A-Za-z0-9\-]{4,})\b/i,
      /\b(TM\d{6,})\b/i,
      /\b(MM\d{6,})\b/i,
      /\b(OM\d{6,})\b/i,
      /\b([A-Z]{2,4}\d{8,})\b/,
      /\b(\d{12,})\b/,
    ];

    for (const pattern of txPatterns) {
      const match = smsText.match(pattern);
      if (match && match[1]) {
        txId = match[1].trim();
        break;
      }
    }

    const amountPatterns = [
      /([\d\s.,]+)\s*(?:F\s*CFA|FCFA|XOF|CFA)/i,
      /(?:montant|amount|recu|received|envoye|sent)\s*[:\s]?\s*([\d\s.,]+)/i,
      /(?:GHS|NGN|XOF)\s*([\d\s.,]+)/i,
      /([\d.,]+)\s*(?:cedis?|naira)/i,
    ];

    for (const pattern of amountPatterns) {
      const match = smsText.match(pattern);
      if (match && match[1]) {
        const cleaned = match[1].replace(/[\s]/g, "").replace(/,/g, ".");
        const parts = cleaned.split(".");
        let numStr: string;
        if (parts.length > 1) {
          const lastPart = parts[parts.length - 1];
          if (lastPart.length <= 2) {
            numStr = parts.slice(0, -1).join("") + "." + lastPart;
          } else {
            numStr = parts.join("");
          }
        } else {
          numStr = cleaned;
        }
        const parsed = parseFloat(numStr);
        if (!isNaN(parsed) && parsed > 0) {
          amount = Math.round(parsed);
          break;
        }
      }
    }

    const phonePatterns = [
      /(?:de|from|par|numero)\s*[:\s]?\s*(\+?\d[\d\s\-]{8,15})/i,
      /(\+\d{10,15})/,
    ];

    for (const pattern of phonePatterns) {
      const match = smsText.match(pattern);
      if (match && match[1]) {
        payerNumber = normalizePhone(match[1]);
        break;
      }
    }

    if (!txId) errors.push("ID de transaction non trouve dans le SMS");
    if (!amount) errors.push("Montant non trouve dans le SMS");

    return { txId, amount, payerNumber, errors };
  }

  async function reconcilePendingPayments(txId: string, merchantId: number, amount: number) {
    try {
      const pendingPayments = await storage.getPendingPaymentsByTxId(txId);
      for (const pp of pendingPayments) {
        if (pp.merchantId === merchantId && pp.amount === amount) {
          await storage.updatePendingPaymentStatus(pp.id, "confirmed");
          console.log(`[SMS] Paiement en attente #${pp.id} confirme (TX: ${txId})`);
        }
      }
    } catch (err) {
      console.error(`[SMS] Erreur reconciliation paiement en attente:`, err);
    }
  }

  app.post("/sms/receive", async (req, res) => {
    try {
      const { from_sim, sms_text, received_at } = req.body;

      if (!from_sim || !sms_text) {
        console.log("[SMS] Requete invalide - donnees manquantes:", { from_sim: !!from_sim, sms_text: !!sms_text });
        return res.status(400).json({ message: "Donnees SMS manquantes (from_sim et sms_text requis)" });
      }

      const normalizedSim = normalizePhone(from_sim);
      console.log(`[SMS] Recu de ${normalizedSim}: ${sms_text.substring(0, 100)}...`);

      const { txId, amount, payerNumber, errors } = parseSmsContent(sms_text);

      if (errors.length > 0 || !txId || !amount) {
        const errorMsg = errors.join("; ");
        console.log(`[SMS] Parsing partiel - Erreurs: ${errorMsg}`);

        await storage.createSmsLog({
          fromSim: normalizedSim,
          smsText: sms_text,
          parsed: false,
          errorMessage: errorMsg || "Parsing incomplet",
          parsedAmount: amount,
          parsedTxId: txId,
          parsedPayer: payerNumber,
        });

        return res.json({
          status: "logged",
          message: "SMS enregistre mais non traite - parsing incomplet",
          errors,
          parsed: { txId, amount, payerNumber },
        });
      }

      const existingTx = await storage.getTransactionByTxId(txId);
      if (existingTx) {
        console.log(`[SMS] Transaction dupliquee: ${txId}`);
        await storage.createSmsLog({
          fromSim: normalizedSim,
          smsText: sms_text,
          parsed: false,
          errorMessage: `Transaction dupliquee: ${txId}`,
          parsedAmount: amount,
          parsedTxId: txId,
          parsedPayer: payerNumber,
        });
        return res.json({ status: "duplicate", txId, message: "Cette transaction a deja ete enregistree" });
      }

      const simNumber = await storage.getNumberByPhone(normalizedSim);

      if (!simNumber) {
        const allNumbers = await storage.getNumbers();
        const found = allNumbers.find(n => {
          const norm = normalizePhone(n.phoneNumber);
          return norm === normalizedSim || norm.endsWith(normalizedSim.slice(-8)) || normalizedSim.endsWith(norm.slice(-8));
        });

        if (!found) {
          console.log(`[SMS] Numero SIM non reconnu: ${normalizedSim}`);
          await storage.createSmsLog({
            fromSim: normalizedSim,
            smsText: sms_text,
            parsed: false,
            errorMessage: `Numero SIM non reconnu: ${normalizedSim}`,
            parsedAmount: amount,
            parsedTxId: txId,
            parsedPayer: payerNumber,
          });
          return res.json({ status: "unmatched", message: "Numero SIM non associe a un marchand", txId, amount });
        }

        if (!found.merchantId) {
          console.log(`[SMS] Numero ${normalizedSim} trouve mais non associe a un marchand`);
          await storage.createSmsLog({
            fromSim: normalizedSim,
            smsText: sms_text,
            parsed: false,
            errorMessage: `Numero trouve (${found.phoneNumber}) mais non associe a un marchand`,
            parsedAmount: amount,
            parsedTxId: txId,
            parsedPayer: payerNumber,
          });
          return res.json({ status: "unmatched", message: "Numero non associe a un marchand", txId, amount });
        }

        const merchantCountry = await storage.findMerchantCountryBySimAndCountry(found.merchantId, found.country);

        if (!merchantCountry || !merchantCountry.active) {
          console.log(`[SMS] Pays ${found.country} non actif pour le marchand #${found.merchantId}`);
          await storage.createSmsLog({
            fromSim: normalizedSim,
            smsText: sms_text,
            parsed: false,
            errorMessage: `Pays ${found.country} inactif pour le marchand`,
            parsedAmount: amount,
            parsedTxId: txId,
            parsedPayer: payerNumber,
          });
          return res.json({ status: "inactive", message: "Le pays n'est pas actif pour ce marchand" });
        }

        await storage.createTransaction({
          merchantId: found.merchantId,
          country: found.country,
          txId,
          amount,
          payerNumber: payerNumber || null,
          status: "confirmed",
        });

        await storage.incrementMerchantCountryBalance(merchantCountry.id, amount);

        await storage.createSmsLog({
          fromSim: normalizedSim,
          smsText: sms_text,
          parsed: true,
          parsedAmount: amount,
          parsedTxId: txId,
          parsedPayer: payerNumber,
        });

        await storage.createApiLog({
          merchantId: found.merchantId,
          action: "sms_payment_confirmed",
          ip: "",
          description: `Paiement confirme par SMS - TX: ${txId} - Montant: ${amount} F CFA - De: ${payerNumber || "inconnu"} - SIM: ${normalizedSim}`,
        });

        await reconcilePendingPayments(txId, found.merchantId, amount);

        const foundMerchant = await storage.getMerchantById(found.merchantId);
        if (foundMerchant?.webhookUrl) {
          sendWebhookNotification(found.merchantId, {
            event: "payment.confirmed",
            txId,
            amount,
            currency: "XOF",
            payer: payerNumber || "",
            country: found.country,
            merchantSlug: foundMerchant.slug,
            timestamp: new Date().toISOString(),
          }).catch(err => console.error("[WEBHOOK] Erreur async:", err));
        }

        notifyMerchantPayment(found.merchantId, {
          txId,
          amount,
          payerNumber,
          country: found.country,
          provider: "sms",
        }).catch(() => {});

        notifyAdminGroup(
          `✅ *Paiement SMS confirmé*\n\n🏪 Marchand : *${foundMerchant?.name || `#${found.merchantId}`}*\n💰 Montant : *${amount.toLocaleString("fr-FR")} F CFA*\n🌍 Pays : ${found.country.toUpperCase()}${payerNumber ? `\n📞 Payeur : ${payerNumber}` : ""}\n🔖 TX : \`${txId}\``
        ).catch(() => {});

        console.log(`[SMS] Transaction confirmee: TX=${txId}, Montant=${amount}, Marchand=#${found.merchantId}, Pays=${found.country}`);
        return res.json({ status: "processed", txId, amount, country: found.country });
      }

      if (!simNumber.merchantId) {
        console.log(`[SMS] Numero ${normalizedSim} non associe a un marchand`);
        await storage.createSmsLog({
          fromSim: normalizedSim,
          smsText: sms_text,
          parsed: false,
          errorMessage: `Numero non associe a un marchand`,
          parsedAmount: amount,
          parsedTxId: txId,
          parsedPayer: payerNumber,
        });
        return res.json({ status: "unmatched", message: "Numero non associe a un marchand", txId, amount });
      }

      const merchantCountry = await storage.findMerchantCountryBySimAndCountry(
        simNumber.merchantId,
        simNumber.country
      );

      if (!merchantCountry || !merchantCountry.active) {
        console.log(`[SMS] Pays ${simNumber.country} non actif pour le marchand #${simNumber.merchantId}`);
        await storage.createSmsLog({
          fromSim: normalizedSim,
          smsText: sms_text,
          parsed: false,
          errorMessage: `Pays ${simNumber.country} inactif pour le marchand`,
          parsedAmount: amount,
          parsedTxId: txId,
          parsedPayer: payerNumber,
        });
        return res.json({ status: "inactive", message: "Le pays n'est pas actif pour ce marchand" });
      }

      await storage.createTransaction({
        merchantId: simNumber.merchantId,
        country: simNumber.country,
        txId,
        amount,
        payerNumber: payerNumber || null,
        status: "confirmed",
      });

      await storage.incrementMerchantCountryBalance(merchantCountry.id, amount);

      await storage.createSmsLog({
        fromSim: normalizedSim,
        smsText: sms_text,
        parsed: true,
        parsedAmount: amount,
        parsedTxId: txId,
        parsedPayer: payerNumber,
      });

      await storage.createApiLog({
        merchantId: simNumber.merchantId,
        action: "sms_payment_confirmed",
        ip: "",
        description: `Paiement confirme par SMS - TX: ${txId} - Montant: ${amount} F CFA - De: ${payerNumber || "inconnu"} - SIM: ${normalizedSim}`,
      });

      await reconcilePendingPayments(txId, simNumber.merchantId, amount);

      const simMerchant = await storage.getMerchantById(simNumber.merchantId);
      if (simMerchant?.webhookUrl) {
        sendWebhookNotification(simNumber.merchantId, {
          event: "payment.confirmed",
          txId,
          amount,
          currency: "XOF",
          payer: payerNumber || "",
          country: simNumber.country,
          merchantSlug: simMerchant.slug,
          timestamp: new Date().toISOString(),
        }).catch(err => console.error("[WEBHOOK] Erreur async:", err));
      }

      console.log(`[SMS] Transaction confirmee: TX=${txId}, Montant=${amount}, Marchand=#${simNumber.merchantId}, Pays=${simNumber.country}`);
      return res.json({ status: "processed", txId, amount, country: simNumber.country });
    } catch (err: any) {
      console.error("[SMS] Erreur serveur:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ─── PAYMENT LINKS (admin) ───────────────────────────────────────────────

  app.get("/api/admin/payment-links", authMiddleware("admin"), async (_req, res) => {
    try {
      const links = await storage.getAllPaymentLinks();
      res.json(links);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/admin/payment-links/:id/toggle", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const link = await storage.getPaymentLinkById(id);
      if (!link) return res.status(404).json({ message: "Lien introuvable" });
      const updated = await storage.updatePaymentLink(id, { active: !link.active });
      await storage.createApiLog({ merchantId: link.merchantId, action: "admin_toggle_payment_link", ip: req.ip || "", description: `Admin: lien #${id} ${updated.active ? "activé" : "désactivé"}` });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/payment-links/:id", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const link = await storage.getPaymentLinkById(id);
      if (!link) return res.status(404).json({ message: "Lien introuvable" });
      await storage.deletePaymentLink(id);
      await storage.createApiLog({ merchantId: link.merchantId, action: "admin_delete_payment_link", ip: req.ip || "", description: `Admin: lien #${id} "${link.name}" supprimé` });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── PAYMENT LINKS (merchant) ────────────────────────────────────────────

  app.get("/api/merchant/payment-links", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const links = await storage.getPaymentLinks(merchantId);
      res.json(links);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/merchant/payment-links", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const { name, amountType, amount, redirectUrl, expiresAt, paymentLimit, active } = req.body;
      if (!name || !amountType) return res.status(400).json({ message: "name et amountType requis" });
      if (amountType === "fixed" && !amount) return res.status(400).json({ message: "amount requis pour un lien fixe" });
      const uniqueId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      const link = await storage.createPaymentLink({
        merchantId: merchantId,
        uniqueId,
        name,
        amountType,
        amount: amount ? Number(amount) : null,
        redirectUrl: redirectUrl || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        paymentLimit: paymentLimit ? Number(paymentLimit) : null,
        active: active !== false,
      });
      res.json(link);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/merchant/payment-links/:id", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const id = Number(req.params.id);
      const existing = await storage.getPaymentLinkById(id);
      if (!existing || existing.merchantId !== merchantId) return res.status(404).json({ message: "Lien introuvable" });
      const { name, amountType, amount, redirectUrl, expiresAt, paymentLimit, active } = req.body;
      const updated = await storage.updatePaymentLink(id, {
        ...(name !== undefined && { name }),
        ...(amountType !== undefined && { amountType }),
        ...(amount !== undefined && { amount: amount ? Number(amount) : null }),
        ...(redirectUrl !== undefined && { redirectUrl: redirectUrl || null }),
        ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
        ...(paymentLimit !== undefined && { paymentLimit: paymentLimit ? Number(paymentLimit) : null }),
        ...(active !== undefined && { active }),
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/merchant/payment-links/:id", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const id = Number(req.params.id);
      const existing = await storage.getPaymentLinkById(id);
      if (!existing || existing.merchantId !== merchantId) return res.status(404).json({ message: "Lien introuvable" });
      await storage.deletePaymentLink(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── PAYMENT LINK PUBLIC PAGE ─────────────────────────────────────────────

  app.get("/api/payment-link/:uniqueId", async (req, res) => {
    try {
      const link = await storage.getPaymentLinkByUniqueId(req.params.uniqueId);
      if (!link || !link.active) return res.status(404).json({ message: "Lien de paiement introuvable ou inactif" });
      if (link.expiresAt && new Date() > link.expiresAt) return res.status(410).json({ message: "Ce lien de paiement a expiré" });
      if (link.paymentLimit && link.paymentCount >= link.paymentLimit) return res.status(410).json({ message: "Ce lien a atteint sa limite de paiements" });
      const merchant = await storage.getMerchantById(link.merchantId);
      if (!merchant || merchant.suspended) return res.status(404).json({ message: "Marchand introuvable" });
      const countries = await storage.getMerchantCountries(merchant.id);
      const activeCountries = countries.filter(c => c.active).map(c => c.country);
      res.json({ link, merchantName: merchant.name, merchantSlug: merchant.slug, countries: activeCountries });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ==================== SUPPORT CONTACTS (public) ====================
  app.get("/api/public/support-contacts", async (_req, res) => {
    try {
      const [tg1, tg2, wa1, wa2, hours1, hours2] = await Promise.all([
        storage.getSetting("support_telegram_1"),
        storage.getSetting("support_telegram_2"),
        storage.getSetting("support_whatsapp_1"),
        storage.getSetting("support_whatsapp_2"),
        storage.getSetting("support_hours"),
        storage.getSetting("support_hours_2"),
      ]);
      res.json({
        telegram1: tg1 || "@Albertrobotpay",
        telegram2: tg2 || "@Atfchalvt",
        whatsapp1: wa1 || "+1 (226) 484-5698",
        whatsapp2: wa2 || "+1 (226) 484-568",
        hours: hours1 || "9h GMT à 12h",
        hours2: hours2 || "15h à 20h",
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ==================== SUPPORT CONTACTS (admin) ====================
  app.get("/api/wallet-transfer-countries", async (_req, res) => {
    try {
      const countries = await storage.getWalletTransferCountries(true);
      res.json(countries);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/wallet-transfer-countries", authMiddleware("admin"), async (_req, res) => {
    try {
      const countries = await storage.getWalletTransferCountries(false);
      res.json(countries);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/wallet-transfer-countries", authMiddleware("admin"), async (req, res) => {
    try {
      const { country, currencyZone } = req.body;
      if (!country?.trim() || !["XOF", "XAF"].includes(currencyZone)) {
        return res.status(400).json({ message: "Pays et zone monetaire requis (XOF ou XAF)" });
      }
      const existing = await storage.getWalletTransferCountryByName(country.trim());
      if (existing) return res.status(409).json({ message: "Ce pays existe deja" });
      const created = await storage.createWalletTransferCountry({ country: country.trim(), currencyZone, active: true });
      res.json(created);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/wallet-transfer-countries/:id/toggle", authMiddleware("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { active } = req.body;
      await storage.toggleWalletTransferCountry(id, !!active);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/wallet-transfer-countries/:id", authMiddleware("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteWalletTransferCountry(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const getCurrencyZone = async (country: string): Promise<string | null> => {
    const wtc = await storage.getWalletTransferCountryByName(country);
    return wtc?.active ? wtc.currencyZone : null;
  };

  app.get("/api/merchant/wallet-transfers", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const transfers = await storage.getWalletTransfers(merchantId);
      res.json(transfers);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/merchant/wallet-transfers", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const { fromCountryId, toCountryId, amount } = req.body;
      if (!fromCountryId || !toCountryId || !amount) {
        return res.status(400).json({ message: "Champs manquants" });
      }
      const parsedAmount = parseInt(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: "Montant invalide" });
      }
      const fromMC = await storage.getMerchantCountryById(parseInt(fromCountryId));
      const toMC = await storage.getMerchantCountryById(parseInt(toCountryId));
      if (!fromMC || fromMC.merchantId !== merchantId) {
        return res.status(400).json({ message: "Pays source invalide" });
      }
      if (!toMC || toMC.merchantId !== merchantId) {
        return res.status(400).json({ message: "Pays destination invalide" });
      }
      if (fromMC.id === toMC.id) {
        return res.status(400).json({ message: "Pays source et destination identiques" });
      }
      const fromZone = await getCurrencyZone(fromMC.country);
      const toZone = await getCurrencyZone(toMC.country);
      if (!fromZone || !toZone || fromZone !== toZone) {
        return res.status(400).json({ message: "Les deux pays doivent etre dans la meme zone monetaire (XOF ou XAF)" });
      }
      const feeTypeSetting = await storage.getSetting("wallet_transfer_fee_type");
      const feeValueSetting = await storage.getSetting("wallet_transfer_fee_value");
      const feeType = feeTypeSetting?.value || "percentage";
      const feeValue = parseFloat(feeValueSetting?.value || "2");
      let fee = 0;
      if (feeType === "percentage") {
        fee = Math.round((parsedAmount * feeValue) / 100);
      } else {
        fee = Math.round(feeValue);
      }
      const totalNeeded = parsedAmount + fee;
      if (fromMC.balance < totalNeeded) {
        return res.status(400).json({ message: `Solde insuffisant. Vous avez ${fromMC.balance.toLocaleString("fr-FR")} ${fromZone}, vous avez besoin de ${totalNeeded.toLocaleString("fr-FR")} ${fromZone} (montant + frais)` });
      }
      const transfer = await storage.createWalletTransfer({
        merchantId,
        fromCountryId: fromMC.id,
        toCountryId: toMC.id,
        fromCountry: fromMC.country,
        toCountry: toMC.country,
        currency: fromZone,
        amount: parsedAmount,
        fee,
        netAmount: parsedAmount,
        status: "pending",
      });
      await db.update(merchantCountries)
        .set({ balance: sql`${merchantCountries.balance} - ${parsedAmount + fee}` })
        .where(eq(merchantCountries.id, fromMC.id));
      res.json(transfer);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/wallet-transfers", authMiddleware("admin"), async (req, res) => {
    try {
      const transfers = await storage.getWalletTransfers();
      res.json(transfers);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/admin/wallet-transfers/:id/approve", authMiddleware("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const transfer = await storage.getWalletTransferById(id);
      if (!transfer) return res.status(404).json({ message: "Transfert introuvable" });
      if (transfer.status !== "pending") return res.status(400).json({ message: "Ce transfert n'est plus en attente" });
      await storage.applyWalletTransfer(id);
      await storage.updateWalletTransferStatus(id, "approved", req.body.note || null);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/admin/wallet-transfers/:id/reject", authMiddleware("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const transfer = await storage.getWalletTransferById(id);
      if (!transfer) return res.status(404).json({ message: "Transfert introuvable" });
      if (transfer.status !== "pending") return res.status(400).json({ message: "Ce transfert n'est plus en attente" });
      await storage.reimbursWalletTransfer(id);
      await storage.updateWalletTransferStatus(id, "rejected", req.body.note || null);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/wallet-transfer-fee", authMiddleware("admin"), async (_req, res) => {
    try {
      const feeType = await storage.getSetting("wallet_transfer_fee_type");
      const feeValue = await storage.getSetting("wallet_transfer_fee_value");
      res.json({
        feeType: feeType?.value || "percentage",
        feeValue: feeValue?.value || "2",
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/wallet-transfer-fee", authMiddleware("admin"), async (req, res) => {
    try {
      const { feeType, feeValue } = req.body;
      if (!["percentage", "fixed"].includes(feeType)) return res.status(400).json({ message: "Type de frais invalide" });
      const v = parseFloat(feeValue);
      if (isNaN(v) || v < 0) return res.status(400).json({ message: "Valeur de frais invalide" });
      await storage.setSetting("wallet_transfer_fee_type", feeType);
      await storage.setSetting("wallet_transfer_fee_value", String(v));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/support-contacts", authMiddleware("admin"), async (req, res) => {
    try {
      const { telegram1, telegram2, whatsapp1, whatsapp2, hours, hours2 } = req.body;
      if (telegram1 !== undefined) await storage.setSetting("support_telegram_1", telegram1);
      if (telegram2 !== undefined) await storage.setSetting("support_telegram_2", telegram2);
      if (whatsapp1 !== undefined) await storage.setSetting("support_whatsapp_1", whatsapp1);
      if (whatsapp2 !== undefined) await storage.setSetting("support_whatsapp_2", whatsapp2);
      if (hours !== undefined) await storage.setSetting("support_hours", hours);
      if (hours2 !== undefined) await storage.setSetting("support_hours_2", hours2);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Reversements (Withdrawals) ──────────────────────────────────────────

  app.get("/api/merchant/withdrawals", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const list = await storage.getWithdrawals(merchantId);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/merchant/withdrawals", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const { merchantCountryId, amount, phone, operator } = req.body;
      if (!merchantCountryId || !amount || !phone) return res.status(400).json({ message: "Champs requis manquants" });
      const mc = await storage.getMerchantCountryById(Number(merchantCountryId));
      if (!mc || mc.merchantId !== merchantId) return res.status(403).json({ message: "Wallet introuvable" });
      if (amount <= 0) return res.status(400).json({ message: "Montant invalide" });
      if (mc.balance < amount) return res.status(400).json({ message: "Solde insuffisant" });
      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant) return res.status(404).json({ message: "Marchand introuvable" });

      const apiKeyToUse = await getOmnipayPayoutApiKey();
      if (!apiKeyToUse) {
        return res.status(500).json({ message: "Cle API retrait non configuree. Contactez l'administrateur." });
      }

      const w = await storage.createWithdrawal({
        merchantId,
        merchantCountryId: mc.id,
        country: mc.country,
        amount,
        phone,
        operator: operator || null,
        status: "pending",
        withdrawalMode: "auto",
        adminNote: null,
      });
      await storage.decrementMerchantCountryBalance(mc.id, amount);

      try {
        const reference = `WD-${w.id}-${Date.now()}`;
        const nameParts = merchant.name.trim().split(/\s+/);
        const wdFirstName = nameParts[0] || merchant.name;
        const wdLastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : nameParts[0] || merchant.name;
        const result = await omnipayInitiateTransfer({
          apikey: apiKeyToUse,
          msisdn: phone,
          amount,
          reference,
          first_name: wdFirstName,
          last_name: wdLastName,
          operator: operator || undefined,
        });
        if (result.success === 1) {
          await storage.updateWithdrawalStatus(w.id, "approved", "Traitement automatique OmniPay", result.reference || reference, result.fees || 0);
          return res.json({ ...w, status: "approved", omnipayRef: result.reference, fees: result.fees || 0, autoProcessed: true });
        } else {
          const errMsg = OMNIPAY_ERRORS[result.code || 0] || result.message || "Echec OmniPay";
          await storage.updateWithdrawalStatus(w.id, "failed", `OmniPay: ${errMsg}`);
          await storage.incrementMerchantCountryBalance(mc.id, amount);
          return res.status(400).json({ message: errMsg, omnipayError: true, code: result.code });
        }
      } catch (omnipayErr: any) {
        console.error("[WITHDRAWAL AUTO] Erreur OmniPay:", omnipayErr.message);
        await storage.updateWithdrawalStatus(w.id, "failed", `Erreur technique: ${omnipayErr.message}`);
        await storage.incrementMerchantCountryBalance(mc.id, amount);
        return res.status(500).json({ message: "Erreur lors du traitement du retrait. Votre solde a été restitué." });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/merchant/withdrawal-operators/:country", authMiddleware("merchant"), async (req, res) => {
    try {
      const country = req.params.country;
      const ops = await storage.getWithdrawalOperators(country, true);
      const available = ops.filter(op => !op.maintenanceAll && !op.maintenanceWithdrawals);
      res.json(available);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/withdrawals", authMiddleware("admin"), async (_req, res) => {
    try {
      const list = await storage.getWithdrawals();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/admin/withdrawals/:id/approve", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { note } = req.body;
      const w = await storage.getWithdrawalById(id);
      if (!w) return res.status(404).json({ message: "Reversement introuvable" });
      if (w.status !== "pending") return res.status(400).json({ message: "Reversement deja traite" });

      const mc = await storage.getMerchantCountryById(w.merchantCountryId);
      const merchant = await storage.getMerchantById(w.merchantId);
      let omnipayRef: string | undefined;
      let fees: number | undefined;

      if (mc && mc.omnipayEnabled && mc.apiKey && merchant) {
        try {
          const reference = `WD-${w.id}-${Date.now()}`;
          const mNameParts = merchant.name.trim().split(/\s+/);
          const mFirstName = mNameParts[0] || merchant.name;
          const mLastName = mNameParts.length > 1 ? mNameParts.slice(1).join(" ") : mNameParts[0] || merchant.name;
          const result = await omnipayInitiateTransfer({
            apikey: mc.apiKey,
            msisdn: w.phone,
            amount: w.amount,
            reference,
            first_name: mFirstName,
            last_name: mLastName,
            operator: w.operator || undefined,
          });
          if (result.success === 1) {
            omnipayRef = result.reference || reference;
            fees = result.fees || 0;
          } else {
            console.error(`[ADMIN APPROVE WD] OmniPay echec: ${result.message}`);
          }
        } catch (omnipayErr: any) {
          console.error("[ADMIN APPROVE WD] OmniPay error:", omnipayErr.message);
        }
      }

      await storage.updateWithdrawalStatus(id, "approved", note, omnipayRef, fees);
      res.json({ success: true, omnipayRef, fees });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/admin/withdrawals/:id/reject", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { note } = req.body;
      const w = await storage.getWithdrawalById(id);
      if (!w) return res.status(404).json({ message: "Reversement introuvable" });
      if (w.status !== "pending") return res.status(400).json({ message: "Reversement deja traite" });
      await storage.updateWithdrawalStatus(id, "rejected", note);
      await storage.incrementMerchantCountryBalance(w.merchantCountryId, w.amount);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/merchants/:id/withdrawal-mode", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { mode } = req.body;
      if (!["auto", "manual"].includes(mode)) return res.status(400).json({ message: "Mode invalide" });
      await storage.updateMerchant(id, { withdrawalMode: mode });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Opérateurs de reversement ──────────────────────────────────────────

  app.get("/api/admin/withdrawal-operators", authMiddleware("admin"), async (_req, res) => {
    try {
      const ops = await storage.getWithdrawalOperators();
      res.json(ops);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/withdrawal-operators", authMiddleware("admin"), async (req, res) => {
    try {
      const { name, type, country, dailyLimit, gateway, active } = req.body;
      if (!name || !country) return res.status(400).json({ message: "Nom et pays requis" });
      const op = await storage.createWithdrawalOperator({
        name,
        type: type || "Mobile Money",
        country,
        dailyLimit: dailyLimit ? Number(dailyLimit) : 1000000,
        gateway: gateway || "OmniPay",
        active: active !== false,
        maintenanceAll: false,
        maintenanceDeposits: false,
        maintenanceWithdrawals: false,
        maintenancePaymentLinks: false,
        maintenanceApiPayment: false,
      });
      res.json(op);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/admin/withdrawal-operators/:id", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { name, type, country, dailyLimit, gateway, active, maintenanceAll, maintenanceDeposits, maintenanceWithdrawals, maintenancePaymentLinks, maintenanceApiPayment } = req.body;
      const updated = await storage.updateWithdrawalOperator(id, {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(country !== undefined && { country }),
        ...(dailyLimit !== undefined && { dailyLimit: Number(dailyLimit) }),
        ...(gateway !== undefined && { gateway }),
        ...(active !== undefined && { active }),
        ...(maintenanceAll !== undefined && { maintenanceAll }),
        ...(maintenanceDeposits !== undefined && { maintenanceDeposits }),
        ...(maintenanceWithdrawals !== undefined && { maintenanceWithdrawals }),
        ...(maintenancePaymentLinks !== undefined && { maintenancePaymentLinks }),
        ...(maintenanceApiPayment !== undefined && { maintenanceApiPayment }),
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/withdrawal-operators/:id", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteWithdrawalOperator(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
