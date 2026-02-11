import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = process.env.SESSION_SECRET || "westpay-secret-key-change-me";

function generateSecureApiKey(country: string): string {
  const prefixes: Record<string, string> = {
    "Togo": "TGO", "Benin": "BEN", "Cote d'Ivoire": "CIV", "Guinee": "GIN",
    "Senegal": "SEN", "Mali": "MLI", "Burkina Faso": "BFA", "Niger": "NER", "Ghana": "GHA", "Nigeria": "NGA",
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
  app.get("/api/admin/stats", authMiddleware("admin"), async (_req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
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
        result.push({ ...m, hasPin: !!pin });
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/create-merchant", authMiddleware("admin"), async (req, res) => {
    try {
      const { name, email, slug, password, pin } = req.body;
      if (!name || !email || !slug || !password) return res.status(400).json({ message: "Tous les champs sont requis" });

      const existing = await storage.getMerchantByEmail(email);
      if (existing) return res.status(400).json({ message: "Email deja utilise" });

      const slugExists = await storage.getMerchantBySlug(slug);
      if (slugExists) return res.status(400).json({ message: "Slug deja utilise" });

      const passwordHash = await bcrypt.hash(password, 10);
      const merchant = await storage.createMerchant({ name, email, slug, passwordHash, suspended: false });

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

  app.delete("/api/admin/delete-merchant/:id", authMiddleware("admin"), async (req, res) => {
    try {
      await storage.deleteMerchant(parseInt(req.params.id));
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
      const mc = await storage.addMerchantCountry({ merchantId, country, apiKey, balance: 0, active: true });

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

  app.delete("/api/admin/delete-number/:id", authMiddleware("admin"), async (req, res) => {
    try {
      await storage.deleteNumber(parseInt(req.params.id));
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
      const merchantId = parseInt(req.params.id);
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

  // ==================== SMS RECEIVE (for Android SMS Forwarder) ====================
  app.post("/sms/receive", async (req, res) => {
    try {
      const { from_sim, sms_text, received_at } = req.body;
      if (!from_sim || !sms_text) return res.status(400).json({ message: "Donnees SMS manquantes" });

      const smsLog = await storage.createSmsLog({
        fromSim: from_sim,
        smsText: sms_text,
        parsed: false,
      });

      const txIdMatch = sms_text.match(/TX\d+/i);
      const amountMatch = sms_text.match(/([\d\s,.]+)\s*F\s*CFA/i);
      const payerMatch = sms_text.match(/(\+?\d{10,15})/);

      if (txIdMatch && amountMatch) {
        const txId = txIdMatch[0];
        const amount = parseInt(amountMatch[1].replace(/[\s,.]/g, ""));

        const existingTx = await storage.getTransactionByTxId(txId);
        if (existingTx) {
          return res.json({ status: "duplicate", txId });
        }

        const simNumber = await storage.getNumberByPhone(from_sim);
        if (simNumber && simNumber.merchantId) {
          const merchantCountry = await storage.findMerchantCountryBySimAndCountry(
            simNumber.merchantId,
            simNumber.country
          );

          if (merchantCountry && merchantCountry.active) {
            await storage.createTransaction({
              merchantId: simNumber.merchantId,
              country: simNumber.country,
              txId,
              amount,
              payerNumber: payerMatch ? payerMatch[1] : null,
              status: "confirmed",
            });

            await storage.incrementMerchantCountryBalance(merchantCountry.id, amount);

            await storage.createSmsLog({
              fromSim: from_sim,
              smsText: `[TRAITE] ${sms_text}`,
              parsed: true,
            });

            return res.json({ status: "processed", txId, amount, country: simNumber.country });
          }
        }
      }

      res.json({ status: "logged", message: "SMS enregistre mais non traite automatiquement" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
