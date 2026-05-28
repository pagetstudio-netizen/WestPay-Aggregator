import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { db } from "./db";
import { pool } from "./db";
import { admins, merchantCountries } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sendMerchantOtpEmail } from "./email";
import { notifyMerchantPayment, notifyAdminGroup, notifyAdminPayment, notifyAdminWithdrawal, notifyAdminWalletTransfer, notifyAdminBalanceUpdate, notifyMerchantWithdrawal, notifyMerchantWalletTransfer, notifyAdminLogin, notifyAdminMerchantCreated, notifyAdminAdminCreated, getGeoInfo, notifyAdminMerchantLogin, notifyAdminIpBlocked, notifyAdminBruteForce, notifyAdminDeviceBlocked, notifyAdminNewDevice, notifyAdminOtp, notifyAdminVpn, notifyAdminCountryBlocked, notifyAdminLocationJump, notifyAdminNewMerchantIp, broadcastToMerchants, sendTelegramMessage } from "./telegram-bot";
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
import {
  createInvoice as oxapayCreateInvoice,
  createWhiteLabel as oxapayCreateWhiteLabel,
  getStatus as oxapayGetStatus,
  verifyWebhook as oxapayVerifyWebhook,
  getCurrencies as oxapayGetCurrencies,
  generateOxaPayReference,
  type OxaPayWebhookPayload,
} from "./oxapay";
import {
  initiatePayin as mbiyoInitiatePayin,
  initiatePayout as mbiyoInitiatePayout,
  getTransactionStatus as mbiyoGetStatus,
  verifyWebhookSignature as mbiyoVerifySignature,
  generateReference as mbiyoGenerateRef,
  mbiyoCountryCode,
  mbiyoCurrency,
  mbiyoNetwork,
  type MbiyoWebhookPayload,
  type MbiyoPayoutWebhookPayload,
} from "./mbiyo";
import {
  createPayment as sendavaCreatePayment,
  initiateWithdraw as sendavaInitiateWithdraw,
  verifyPayment as sendavaVerifyPayment,
  getBalance as sendavaGetBalance,
  getTransactions as sendavaGetTransactions,
  configureWebhook as sendavaConfigureWebhook,
  generateReference as sendavaGenerateRef,
  verifyWebhookSignature as sendavaVerifySignature,
  toSendavaOperator,
  SENDAVAPAY_COUNTRY_CODES,
  SENDAVAPAY_CURRENCY_MAP,
  type SendavaWebhookPayload,
} from "./sendavapay";

// ── Multer — logo opérateur ───────────────────────────────────────────────────
const LOGOS_DIR = path.resolve(process.cwd(), "uploads", "operator-logos");
if (!fs.existsSync(LOGOS_DIR)) fs.mkdirSync(LOGOS_DIR, { recursive: true });

// ── Multer — images broadcast ─────────────────────────────────────────────────
const BROADCAST_DIR = path.resolve(process.cwd(), "uploads", "broadcast");
if (!fs.existsSync(BROADCAST_DIR)) fs.mkdirSync(BROADCAST_DIR, { recursive: true });
const broadcastStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, BROADCAST_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `bc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}${ext}`);
  },
});
const broadcastUpload = multer({
  storage: broadcastStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error("Format non supporté (jpg, png, webp, gif)"));
  },
});

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, LOGOS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".png";
    cb(null, `op-${Date.now()}-${Math.random().toString(36).substr(2, 6)}${ext}`);
  },
});
const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error("Format non supporté (jpg, png, webp, gif, svg)"));
  },
});

const JWT_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("[SECURITY] SESSION_SECRET must be set — refusing to start without it. Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"");
}

async function getOmnipayApiKey(): Promise<string | undefined> {
  return process.env.OMNIPAY_API_KEY || await storage.getSetting("omnipay_api_key");
}

async function getOmnipayPayoutApiKey(): Promise<string | undefined> {
  return process.env.OMNIPAY_PAYOUT_API_KEY || await storage.getSetting("omnipay_payout_api_key") || await getOmnipayApiKey();
}

async function getOmnipayCallbackKey(): Promise<string | undefined> {
  return process.env.OMNIPAY_CALLBACK_KEY || await storage.getSetting("omnipay_callback_key");
}

async function getMbiyoApiKey(): Promise<string | undefined> {
  return process.env.MBIYO_API_KEY || await storage.getSetting("mbiyo_api_key");
}

async function getMbiyoWebhookSecret(): Promise<string | undefined> {
  return process.env.MBIYO_WEBHOOK_SECRET || await storage.getSetting("mbiyo_webhook_secret");
}

async function getSendavaApiKey(): Promise<string | undefined> {
  return process.env.SENDAVAPAY_API_KEY || await storage.getSetting("sendavapay_api_key");
}

async function getSendavaWebhookSecret(): Promise<string | undefined> {
  return process.env.SENDAVAPAY_WEBHOOK_SECRET || await storage.getSetting("sendavapay_webhook_secret");
}

const COLLECTION_FEE_RATE = 0.055;
const WITHDRAWAL_FEE_RATE = 0.045;
const EXTRA_FEE_COUNTRIES = new Set(["Congo Brazzaville", "Congo RDC"]);
function getCollectionFeeRate(country?: string | null): number {
  return country && EXTRA_FEE_COUNTRIES.has(country) ? COLLECTION_FEE_RATE + 0.01 : COLLECTION_FEE_RATE;
}
function getWithdrawalFeeRate(country?: string | null): number {
  return country && EXTRA_FEE_COUNTRIES.has(country) ? WITHDRAWAL_FEE_RATE + 0.01 : WITHDRAWAL_FEE_RATE;
}
function calcMerchantCredit(grossAmount: number, country?: string | null): number {
  return Math.floor(grossAmount * (1 - getCollectionFeeRate(country)));
}
function calcWithdrawalFee(amount: number, country?: string | null): number {
  return Math.floor(amount * getWithdrawalFeeRate(country));
}

function toOmnipayOperatorCode(operatorName: string | null | undefined): string | undefined {
  if (!operatorName) return undefined;
  const n = operatorName.toLowerCase();
  if (n.includes("wave")) return "wave";
  if (n.includes("mixx") || n.includes("yas")) return "mixx";
  // MTN, Moov, Orange, TMoney etc. are auto-detected by OmniPay via phone number — do not send operator
  return undefined;
}

const OMNIPAY_MANDATORY_OPERATORS = ["wave", "mixx"];

const COUNTRY_DIAL_CODES: Record<string, string> = {
  "Togo": "228", "Benin": "229", "Cote d'Ivoire": "225",
  "Senegal": "221", "Mali": "223", "Burkina Faso": "226",
  "Cameroun": "237", "Congo Brazzaville": "242", "Gabon": "241",
  "Congo RDC": "243", "Guinee": "224", "Gambie": "220",
};

const COUNTRY_ALIASES: Record<string, string> = {
  // Noms complets (variations casse/accents)
  "togo": "Togo",
  "benin": "Benin", "bénin": "Benin",
  "cote d'ivoire": "Cote d'Ivoire", "côte d'ivoire": "Cote d'Ivoire",
  "cote divoire": "Cote d'Ivoire", "côte divoire": "Cote d'Ivoire",
  "ivory coast": "Cote d'Ivoire",
  "senegal": "Senegal", "sénégal": "Senegal",
  "mali": "Mali",
  "burkina faso": "Burkina Faso", "burkina": "Burkina Faso",
  "cameroun": "Cameroun", "cameroon": "Cameroun",
  "congo brazzaville": "Congo Brazzaville", "congo": "Congo Brazzaville",
  "gabon": "Gabon",
  "congo rdc": "Congo RDC", "rdc": "Congo RDC", "drc": "Congo RDC",
  "republique democratique du congo": "Congo RDC", "république démocratique du congo": "Congo RDC",
  "democratic republic of congo": "Congo RDC", "democratic republic of the congo": "Congo RDC",
  "guinee": "Guinee", "guinée": "Guinee", "guinea": "Guinee", "republic of guinea": "Guinee",
  "gambie": "Gambie", "gambia": "Gambie", "the gambia": "Gambie",
  // Codes API (préfixe des clés WestPay : TGO-xxx, BEN-xxx, etc.)
  "tgo": "Togo",
  "ben": "Benin",
  "civ": "Cote d'Ivoire",
  "sen": "Senegal",
  "mli": "Mali",
  "bfa": "Burkina Faso",
  "cmr": "Cameroun",
  "cog": "Congo Brazzaville",
  "gab": "Gabon",
  "gin": "Guinee",
  "gmb": "Gambie",
  // Codes ISO 3166-1 alpha-2
  "tg": "Togo",
  "bj": "Benin",
  "ci": "Cote d'Ivoire",
  "sn": "Senegal",
  "ml": "Mali",
  "bf": "Burkina Faso",
  "cm": "Cameroun",
  "cg": "Congo Brazzaville",
  "ga": "Gabon",
  "cd": "Congo RDC", "cod": "Congo RDC",
  "gn": "Guinee",
  "gm": "Gambie",
};

function normalizeCountry(country: string): string {
  if (!country) return country;
  const trimmed = country.trim();
  const lower = trimmed.toLowerCase();
  return COUNTRY_ALIASES[lower] || trimmed;
}

function prependDialCode(phone: string, country: string): string {
  const cleaned = phone.replace(/[\s\-\(\)\+]/g, "");
  const dialCode = COUNTRY_DIAL_CODES[country] || "";
  if (!dialCode || cleaned.startsWith(dialCode)) return cleaned;
  const TRUNK_PREFIX_COUNTRIES = new Set(["Congo RDC", "Congo Brazzaville", "Gabon"]);
  const local = (TRUNK_PREFIX_COUNTRIES.has(country) && cleaned.startsWith("0")) ? cleaned.slice(1) : cleaned;
  return `${dialCode}${local}`;
}
async function resolveOmnipayOperatorCode(operatorName: string | null | undefined, country: string | null | undefined): Promise<string | undefined> {
  if (!operatorName) return undefined;
  if (country) {
    try {
      const op = await storage.getWithdrawalOperatorByNameAndCountry(operatorName, country);
      if (op?.omnipayCode && OMNIPAY_MANDATORY_OPERATORS.includes(op.omnipayCode.toLowerCase())) {
        return op.omnipayCode.toLowerCase();
      }
    } catch {}
  }
  return toOmnipayOperatorCode(operatorName);
}

function generateSecureApiKey(country: string): string {
  const prefixes: Record<string, string> = {
    "Togo": "TGO", "Benin": "BEN", "Cote d'Ivoire": "CIV",
    "Senegal": "SEN", "Mali": "MLI", "Burkina Faso": "BFA",
    "Cameroun": "CMR", "Congo Brazzaville": "COG", "Gabon": "GAB",
    "Congo RDC": "COD", "Guinee": "GIN", "Gambie": "GMB",
  };
  const prefix = prefixes[country] || country.substring(0, 3).toUpperCase();
  const randomPart = crypto.randomBytes(20).toString("hex").toUpperCase();
  return `${prefix}-${randomPart}`;
}

function signToken(payload: { id: number; role: string; email: string }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function authMiddleware(role: "admin" | "merchant") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Non autorise" });
    }
    try {
      const decoded = jwt.verify(auth.split(" ")[1], JWT_SECRET) as any;
      if (decoded.role !== role) {
        return res.status(403).json({ message: "Acces interdit" });
      }
      // Vérification critique : s'assurer que le compte existe toujours en base
      if (role === "admin") {
        const admin = await storage.getAdminById(decoded.id);
        if (!admin) {
          return res.status(401).json({ message: "Compte administrateur introuvable ou supprimé" });
        }
      } else if (role === "merchant") {
        const merchant = await storage.getMerchantById(decoded.id);
        if (!merchant || merchant.suspended) {
          return res.status(401).json({ message: "Compte marchand introuvable ou suspendu" });
        }
      }
      (req as any).user = decoded;
      next();
    } catch {
      return res.status(401).json({ message: "Token invalide" });
    }
  };
}

async function apiKeyAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const apiKey = (req.headers["x-api-key"] as string) || "";

  if (apiKey) {
    try {
      const mc = await storage.findMerchantCountryByApiKey(apiKey);
      if (mc) {
        (req as any).user = { id: mc.merchantId, role: "merchant" };
        (req as any).apiKeyMerchantCountry = mc;
        return next();
      }
    } catch {}
  }

  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    try {
      const decoded = jwt.verify(auth.split(" ")[1], JWT_SECRET) as any;
      if (decoded.role === "merchant") {
        (req as any).user = decoded;
        return next();
      }
    } catch {}
  }

  return res.status(401).json({ message: "Non autorise. Fournissez un Bearer token JWT ou un header X-API-KEY valide." });
}

async function cryptoApiKeyAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const apiKey = (req.headers["x-api-key"] as string) || "";

  if (apiKey) {
    try {
      const merchantByCryptoKey = await storage.getMerchantByCryptoApiKey(apiKey);
      if (merchantByCryptoKey) {
        (req as any).user = { id: merchantByCryptoKey.id, role: "merchant" };
        return next();
      }
    } catch {}
  }

  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    try {
      const decoded = jwt.verify(auth.split(" ")[1], JWT_SECRET) as any;
      if (decoded.role === "merchant") {
        (req as any).user = decoded;
        return next();
      }
    } catch {}
  }

  return res.status(401).json({ message: "Non autorise. Fournissez un Bearer token JWT ou un header X-API-KEY crypto (WP-CRYPTO-...) valide." });
}

const CRYPTO_FEE_RATE = 0.05;

async function notifyCryptoWebhook(merchant: { id: number; webhookUrl?: string | null; webhookSecret?: string | null }, payload: Record<string, any>): Promise<void> {
  if (!merchant.webhookUrl) return;
  try {
    const payloadStr = JSON.stringify(payload);
    const signature = merchant.webhookSecret
      ? crypto.createHmac("sha256", merchant.webhookSecret).update(payloadStr).digest("hex")
      : "";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(merchant.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RobotPay-Signature": signature,
          "X-RobotPay-Event": payload.event || "crypto.payment.confirmed",
        },
        body: payloadStr,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      await storage.createWebhookLog({
        merchantId: merchant.id,
        url: merchant.webhookUrl,
        payload: payloadStr,
        statusCode: res.status,
        response: (await res.text().catch(() => "")).substring(0, 500),
        success: res.status >= 200 && res.status < 300,
      });
      console.log(`[CRYPTO WEBHOOK] Envoyé à ${merchant.webhookUrl} → ${res.status}`);
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      const errMsg = fetchErr.name === "AbortError" ? "Timeout (10s)" : fetchErr.message;
      await storage.createWebhookLog({
        merchantId: merchant.id, url: merchant.webhookUrl, payload: payloadStr, statusCode: 0, response: errMsg, success: false,
      });
      console.error(`[CRYPTO WEBHOOK] Erreur:`, errMsg);
    }
  } catch (err: any) {
    console.error(`[CRYPTO WEBHOOK] Erreur générale:`, err.message);
  }
}

async function creditMerchantForCryptoTx(cryptoTx: { id: number; merchantId: number; payCurrency: string | null; payAmount: string | null; trackId?: string; orderId?: string | null; description?: string | null }): Promise<void> {
  if (!cryptoTx.payCurrency || !cryptoTx.payAmount) {
    console.warn(`[CRYPTO CREDIT] Transaction #${cryptoTx.id} sans payCurrency/payAmount — crédit impossible`);
    return;
  }
  const payAmountNum = parseFloat(cryptoTx.payAmount);
  if (isNaN(payAmountNum) || payAmountNum <= 0) {
    console.warn(`[CRYPTO CREDIT] Transaction #${cryptoTx.id} payAmount invalide (${cryptoTx.payAmount}) — crédit ignoré`);
    return;
  }
  const credited = await storage.markCryptoTransactionCredited(cryptoTx.id);
  if (!credited) {
    console.log(`[CRYPTO CREDIT] Transaction #${cryptoTx.id} déjà créditée — ignoré`);
    return;
  }
  const merchant = await storage.getMerchantById(cryptoTx.merchantId);
  const feeRate = merchant?.feeExempt ? 0 : CRYPTO_FEE_RATE;
  const feeAmount = payAmountNum * feeRate;
  const netAmount = payAmountNum - feeAmount;
  await storage.incrementCryptoBalance(cryptoTx.merchantId, cryptoTx.payCurrency, netAmount);
  console.log(`[CRYPTO CREDIT] Marchand #${cryptoTx.merchantId} — ${cryptoTx.payCurrency} — Brut: ${payAmountNum} — Frais: ${feeAmount.toFixed(8)} (${(feeRate*100).toFixed(0)}%) — Net: ${netAmount.toFixed(8)} — tx #${cryptoTx.id}`);
  if (merchant?.webhookUrl) {
    await notifyCryptoWebhook(merchant, {
      event: "crypto.payment.confirmed",
      trackId: cryptoTx.trackId || cryptoTx.id.toString(),
      status: "paid",
      currency: cryptoTx.payCurrency,
      grossAmount: payAmountNum,
      feeAmount: parseFloat(feeAmount.toFixed(8)),
      netAmount: parseFloat(netAmount.toFixed(8)),
      orderId: cryptoTx.orderId || null,
      description: cryptoTx.description || null,
      timestamp: new Date().toISOString(),
    });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ── Security headers (applied to every response) ─────────────────────────────
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }
    res.setHeader("Content-Security-Policy", [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://api.dicebear.com",
      "connect-src 'self' wss: ws: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "frame-src 'none'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "));
    next();
  });

  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send("User-agent: *\nDisallow: /\n");
  });

  // ==================== IP SECURITY ====================
  app.get("/api/auth/my-ip", (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    res.json({ ip });
  });

  app.get("/api/auth/check-ip", async (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "";
      const allowed = await storage.isIpAllowed(ip);
      res.json({ allowed, ip });
    } catch {
      res.json({ allowed: true, ip: "" });
    }
  });

  // ── Brute force tracker (in-memory) ─────────────────────────────────────────
  const loginAttempts = new Map<string, { count: number; firstFail: number; lastEmail: string }>();
  const BRUTE_FORCE_MAX = 5;
  const BRUTE_FORCE_WINDOW = 15 * 60 * 1000;
  // Debounce for blocked-IP Telegram notifications (avoid spam)
  const blockedIpNotifyCache = new Map<string, number>();
  const BLOCKED_NOTIFY_COOLDOWN = 5 * 60 * 1000;

  const ipGuard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawIp = req.ip || req.socket.remoteAddress || "";
      const cleanIp = rawIp.replace(/^::ffff:/, "");

      // 1. Check if IP is explicitly blocked
      const blocked = await storage.isIpBlocked(cleanIp);
      if (blocked) {
        storage.createSecurityLog({ eventType: "blocked_access", ip: cleanIp, action: "ip_blocked_middleware", details: req.path }).catch(() => {});
        const lastNotify = blockedIpNotifyCache.get(cleanIp) || 0;
        if (Date.now() - lastNotify > BLOCKED_NOTIFY_COOLDOWN) {
          blockedIpNotifyCache.set(cleanIp, Date.now());
          notifyAdminIpBlocked({ ip: cleanIp, path: req.path, device: req.headers["user-agent"] }).catch(() => {});
        }
        return res.status(403).json({ error: "access_denied" });
      }

      // 2. Check device fingerprint if provided
      const fp = req.headers["x-device-fp"] as string | undefined;
      if (fp && fp.length > 8) {
        const deviceBlocked = await storage.isDeviceBlocked(fp);
        if (deviceBlocked) {
          storage.createSecurityLog({ eventType: "blocked_device", ip: cleanIp, fingerprint: fp, action: "device_blocked_middleware", details: req.path }).catch(() => {});
          notifyAdminDeviceBlocked({ ip: cleanIp, fingerprint: fp, path: req.path }).catch(() => {});
          return res.status(403).json({ error: "access_denied" });
        }
      }

      // 3. Check allowed IPs whitelist
      const allowed = await storage.isIpAllowed(rawIp);
      if (!allowed) return res.status(403).json({ error: "access_denied" });
      next();
    } catch {
      next();
    }
  };

  // ── Extraction IP réelle — résistante au spoofing X-Forwarded-For ────────────
  // L'attaquant peut injecter de fausses IPs dans X-Forwarded-For (ex: 198.51.100.x)
  // Cette fonction détecte les plages réservées/RFC-5737 et les marque comme spoofées.
  function isReservedIp(ip: string): boolean {
    if (!ip) return false;
    // Plages IANA réservées qui ne peuvent jamais être de vraies IPs client publiques
    // (incluant les plages privées utilisées pour contourner le check géo)
    const reserved = [
      /^0\./,                          // 0.0.0.0/8
      /^10\./,                         // 10.0.0.0/8 — privé (spoofé pour bypass geo)
      /^127\./,                        // loopback
      /^169\.254\./,                   // link-local
      /^172\.(1[6-9]|2\d|3[01])\./,   // 172.16.0.0/12 — privé (spoofé pour bypass geo)
      /^192\.0\.2\./,                  // TEST-NET-1 (RFC 5737)
      /^192\.168\./,                   // 192.168.0.0/16 — privé
      /^198\.51\.100\./,               // TEST-NET-2 (RFC 5737) ← utilisé par l'attaquant
      /^203\.0\.113\./,                // TEST-NET-3 (RFC 5737) ← utilisé par l'attaquant
      /^224\./,                        // multicast
      /^240\./,                        // réservé
      /^255\.255\.255\.255$/,          // broadcast
    ];
    return reserved.some(r => r.test(ip));
  }

  function getClientIp(req: Request): string {
    const raw = (req.ip || req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
    // Si l'IP est dans une plage réservée (jamais légitime depuis Internet), c'est du spoofing
    if (isReservedIp(raw)) return `SPOOFED:${raw}`;
    return raw;
  }

  // ── Validation email — rejette les payloads d'injection ───────────────────────
  function isValidEmailInput(email: unknown): email is string {
    if (typeof email !== "string") return false;
    if (email.length > 254) return false;
    // Rejette tout ce qui ressemble à du JSON, NoSQL injection, ou script
    if (/[{}<>$]/.test(email)) return false;
    // Validation basique format email
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  }

  // ── Helpers sécurité ─────────────────────────────────────────────────────────
  function parseUa(ua: string): { browser: string; os: string } {
    const browser = ua.includes("Firefox") ? "Firefox" : ua.includes("Edg") ? "Edge" : ua.includes("Chrome") ? "Chrome" : ua.includes("Safari") ? "Safari" : "Autre";
    const os = ua.includes("Windows") ? "Windows" : ua.includes("Mac") ? "macOS" : ua.includes("Linux") ? "Linux" : ua.includes("Android") ? "Android" : ua.includes("iPhone") || ua.includes("iPad") ? "iOS" : "Autre";
    return { browser, os };
  }

  async function getSecuritySettings(): Promise<{ twoFa: boolean; deviceCheck: boolean; vpnBlock: boolean; blockedCountries: string[] }> {
    try {
      const [twoFaRaw, deviceCheckRaw, vpnBlockRaw, countriesRaw] = await Promise.all([
        storage.getSetting("security_2fa_enabled"),
        storage.getSetting("security_device_check"),
        storage.getSetting("security_vpn_block"),
        storage.getSetting("security_blocked_countries"),
      ]);
      return {
        twoFa: twoFaRaw === "true",
        deviceCheck: deviceCheckRaw === "true",
        vpnBlock: vpnBlockRaw === "true",
        blockedCountries: countriesRaw ? JSON.parse(countriesRaw) : [],
      };
    } catch { return { twoFa: false, deviceCheck: false, vpnBlock: false, blockedCountries: [] }; }
  }

  // ==================== AUTH ====================
  app.post("/api/auth/admin/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      // Validation stricte du format email — rejette injections JSON/NoSQL/script
      if (!isValidEmailInput(email) || !password) return res.status(400).json({ message: "Email et mot de passe requis" });

      const clientIp = getClientIp(req);
      const ua = req.headers["user-agent"] || "?";
      const fp = (req.headers["x-device-fp"] as string || "").trim();

      // 0. Blocage immédiat : IP spoofée (plage réservée RFC 5737)
      if (clientIp.startsWith("SPOOFED:")) {
        storage.createSecurityLog({ eventType: "blocked_access", ip: clientIp, userEmail: email, action: "spoofed_ip_admin", details: `IP réservée injectée via X-Forwarded-For — ${ua.substring(0, 60)}` }).catch(() => {});
        return res.status(403).json({ message: "Accès refusé" });
      }

      // 0b. Blocage email immédiat (liste noire en mémoire)
      if (blockedLoginEmails.has(email.toLowerCase().trim())) {
        storage.createSecurityLog({ eventType: "blocked_access", ip: clientIp, userEmail: email, action: "email_blacklisted_admin", details: `Email sur liste noire — admin login` }).catch(() => {});
        return res.status(401).json({ message: "Identifiants invalides" });
      }

      // 1. Check if IP is explicitly blocked
      const ipBlocked = await storage.isIpBlocked(clientIp);
      if (ipBlocked) {
        storage.createSecurityLog({ eventType: "blocked_login_attempt", ip: clientIp, userEmail: email, action: "ip_blocked", details: "Admin login blocked" }).catch(() => {});
        return res.status(403).json({ message: "Accès refusé" });
      }

      // 1b. Check allowed IPs whitelist — seules les IPs autorisées peuvent se connecter
      const ipAllowed = await storage.isIpAllowed(clientIp);
      if (!ipAllowed) {
        storage.createSecurityLog({ eventType: "blocked_login_attempt", ip: clientIp, userEmail: email, action: "ip_not_whitelisted", details: "Admin login — IP non autorisée" }).catch(() => {});
        return res.status(403).json({ message: "Accès refusé" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin || email.toLowerCase() === "admin@westpay.com") return res.status(401).json({ message: "Identifiants invalides" });

      const valid = await bcrypt.compare(password, admin.passwordHash);
      if (!valid) {
        await storage.createLoginLog({ userId: admin.id, role: "admin", ip: clientIp, device: ua, success: false });
        notifyAdminLogin({ email: admin.email, ip: clientIp, device: ua, success: false }).catch(() => {});
        const now = Date.now();
        const attempt = loginAttempts.get(clientIp) || { count: 0, firstFail: now, lastEmail: email };
        if (now - attempt.firstFail > BRUTE_FORCE_WINDOW) { attempt.count = 0; attempt.firstFail = now; }
        attempt.count++;
        attempt.lastEmail = email;
        loginAttempts.set(clientIp, attempt);
        if (attempt.count >= BRUTE_FORCE_MAX) {
          storage.addBlockedIp({ ipAddress: clientIp, reason: `Brute force — ${attempt.count} tentatives admin`, blockedBy: "système" }).catch(() => {});
          storage.createSecurityLog({ eventType: "brute_force", ip: clientIp, userEmail: email, action: "auto_blocked", details: `${attempt.count} tentatives` }).catch(() => {});
          notifyAdminBruteForce({ ip: clientIp, email, attempts: attempt.count }).catch(() => {});
          loginAttempts.delete(clientIp);
        }
        return res.status(401).json({ message: "Identifiants invalides" });
      }

      // Password correct — now run enhanced security checks
      loginAttempts.delete(clientIp);
      const [geo, secSettings] = await Promise.all([
        getGeoInfo(clientIp).catch(() => ({ country: "", city: "", isp: "", isProxy: false, isHosting: false })),
        getSecuritySettings(),
      ]);
      const { browser, os } = parseUa(ua);

      // 2. Country blacklist check
      if (secSettings.blockedCountries.length > 0 && geo.country) {
        const isBlocked = secSettings.blockedCountries.some((c: string) =>
          geo.country.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(geo.country.toLowerCase())
        );
        if (isBlocked) {
          storage.createSecurityLog({ eventType: "country_blocked", ip: clientIp, userEmail: email, action: "login_refused", details: geo.country }).catch(() => {});
          notifyAdminCountryBlocked({ ip: clientIp, country: geo.country, email }).catch(() => {});
          return res.status(403).json({ message: "Accès refusé" });
        }
      }

      // 3. VPN / Proxy / Hosting detection
      if ((geo as any).isProxy || (geo as any).isHosting) {
        const vpnType = (geo as any).isProxy ? "proxy" : "hosting";
        storage.createSecurityLog({ eventType: "vpn_detected", ip: clientIp, userEmail: email, action: secSettings.vpnBlock ? "blocked" : "alert_only", details: `${vpnType} — ${(geo as any).isp}` }).catch(() => {});
        notifyAdminVpn({ email, ip: clientIp, isp: (geo as any).isp || "", vpnType, country: geo.country }).catch(() => {});
        if (secSettings.vpnBlock) return res.status(403).json({ message: "Accès refusé" });
      }

      // 4. Location jump detection (compare with last successful login)
      try {
        const lastLogs = await storage.getRecentLoginLogs(5);
        const lastSuccess = lastLogs.find((l: any) => l.role === "admin" && l.success && l.ip && l.ip !== clientIp);
        if (lastSuccess && geo.country && lastSuccess.ip) {
          const lastGeo = await getGeoInfo(String(lastSuccess.ip)).catch(() => null);
          if (lastGeo && lastGeo.country && lastGeo.country !== geo.country) {
            const minutesApart = Math.round((Date.now() - new Date(lastSuccess.createdAt).getTime()) / 60000);
            if (minutesApart < 120) {
              storage.createSecurityLog({ eventType: "location_jump", ip: clientIp, userEmail: email, action: "alert_sent", details: `${lastGeo.country} → ${geo.country} en ${minutesApart}min` }).catch(() => {});
              notifyAdminLocationJump({ email, fromCountry: lastGeo.country, toCountry: geo.country, fromCity: lastGeo.city || "", toCity: geo.city || "", minutesApart }).catch(() => {});
            }
          }
        }
      } catch { /* non bloquant */ }

      // 5. Device fingerprint trust check
      if (fp && secSettings.deviceCheck) {
        const deviceBlocked = await storage.isDeviceBlocked(fp);
        if (deviceBlocked) {
          storage.createSecurityLog({ eventType: "blocked_device", ip: clientIp, fingerprint: fp, userEmail: email, action: "login_refused", details: "device_blocked" }).catch(() => {});
          return res.status(403).json({ message: "Accès refusé" });
        }
        const existingDevice = await storage.getDeviceByFingerprint(admin.id, "admin", fp);
        if (!existingDevice) {
          const newDev = await storage.upsertDevice({ userId: admin.id, userRole: "admin", deviceId: fp, browser, os, country: geo.country, city: geo.city, ipAddress: clientIp, isTrusted: false });
          notifyAdminNewDevice({ email, ip: clientIp, deviceId: fp, browser, os, country: geo.country, city: geo.city, deviceDbId: newDev.id }).catch(() => {});
          storage.createSecurityLog({ eventType: "new_device", ip: clientIp, fingerprint: fp, userEmail: email, action: "pending_trust", details: `${browser} / ${os}` }).catch(() => {});
          return res.status(403).json({ message: "Nouvel appareil détecté — validation requise via Telegram", code: "NEW_DEVICE" });
        } else if (!existingDevice.isTrusted) {
          return res.status(403).json({ message: "Appareil en attente de validation", code: "DEVICE_PENDING" });
        } else {
          storage.upsertDevice({ userId: admin.id, userRole: "admin", deviceId: fp, browser, os, country: geo.country, city: geo.city, ipAddress: clientIp, isTrusted: true }).catch(() => {});
        }
      } else if (fp) {
        // Even if device check is off, record the device silently
        storage.upsertDevice({ userId: admin.id, userRole: "admin", deviceId: fp, browser, os, country: geo.country, city: geo.city, ipAddress: clientIp, isTrusted: true }).catch(() => {});
      }

      // 6. 2FA via Telegram OTP
      if (secSettings.twoFa) {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        await storage.createAdminOtp(email, code, expiresAt);
        notifyAdminOtp({ email, code, ip: clientIp }).catch(() => {});
        const tempToken = jwt.sign({ email, purpose: "otp_verify", adminId: admin.id }, JWT_SECRET, { expiresIn: "6m" });
        return res.json({ requires2fa: true, tempToken });
      }

      // 7. All checks passed — issue JWT
      await storage.createLoginLog({ userId: admin.id, role: "admin", ip: clientIp, device: ua, success: true });
      notifyAdminLogin({ email: admin.email, ip: clientIp, device: ua, success: true }).catch(() => {});
      const token = signToken({ id: admin.id, role: "admin", email: admin.email });
      res.json({ token, user: { id: admin.id, email: admin.email } });
    } catch (err: any) {
      res.status(500).json({ message: "Erreur interne" });
    }
  });

  app.post("/api/auth/admin/verify-2fa", async (req, res) => {
    try {
      const { tempToken, code } = req.body;
      if (!tempToken || !code) return res.status(400).json({ message: "Données manquantes" });
      let payload: any;
      try { payload = jwt.verify(tempToken, JWT_SECRET); } catch { return res.status(401).json({ message: "Session expirée" }); }
      if (payload.purpose !== "otp_verify") return res.status(401).json({ message: "Token invalide" });
      const otp = await storage.getAdminOtp(payload.email);
      if (!otp || otp.code !== String(code).trim() || new Date() > otp.expiresAt) {
        return res.status(401).json({ message: "Code invalide ou expiré" });
      }
      await storage.deleteAdminOtp(payload.email);
      const admin = await storage.getAdminByEmail(payload.email);
      if (!admin) return res.status(401).json({ message: "Compte introuvable" });
      const token = signToken({ id: admin.id, role: "admin", email: admin.email });
      const clientIp = (req.ip || "").replace(/^::ffff:/, "");
      await storage.createLoginLog({ userId: admin.id, role: "admin", ip: clientIp, device: req.headers["user-agent"] || "", success: true });
      res.json({ token, user: { id: admin.id, email: admin.email } });
    } catch (err: any) {
      res.status(500).json({ message: "Erreur interne" });
    }
  });

  // ── Rate-limit store pour login marchands ────────────────────────────────────
  const merchantLoginAttempts = new Map<string, { count: number; firstFail: number }>();
  const MERCHANT_BRUTE_MAX = 5;
  const MERCHANT_BRUTE_WINDOW = 10 * 60 * 1000; // 10 min

  // User-agents automatisés interdits sur le login marchand et les endpoints sensibles
  const BLOCKED_UA_PATTERNS = [
    /Deno\//i,
    /SupabaseEdgeRuntime/i,
    /python-requests/i,
    /Go-http-client/i,
    /curl\//i,
    /axios\//i,
    /node-fetch/i,
    /undici/i,
  ];

  // Hôtes autorisés pour la validation Origin/Referer du login marchand
  const ALLOWED_HOSTS = (() => {
    const base = ["westpay.cloud", "www.westpay.cloud"];
    // Toujours inclure les domaines Replit (dev ET production déployée)
    const replitDomains = process.env.REPLIT_DOMAINS || "";
    const devDomain = process.env.REPLIT_DEV_DOMAIN || "";
    if (devDomain) base.push(devDomain);
    replitDomains.split(",").map(d => d.trim()).filter(Boolean).forEach(d => base.push(d));
    if (process.env.NODE_ENV !== "production") {
      base.push("localhost", "127.0.0.1");
    }
    return base;
  })();

  // Pays autorisés pour la connexion marchand (Afrique de l'Ouest + Centrale uniquement)
  const ALLOWED_MERCHANT_COUNTRIES = new Set([
    // Afrique de l'Ouest
    "Togo", "Benin", "Ivory Coast", "Côte d'Ivoire", "Senegal", "Mali",
    "Burkina Faso", "Ghana", "Nigeria", "Guinea", "Niger", "Mauritania",
    "Sierra Leone", "Liberia", "Cape Verde", "Gambia", "Guinea-Bissau",
    // Afrique Centrale
    "Cameroon", "Democratic Republic of the Congo", "Republic of the Congo",
    "Congo", "Gabon", "Chad", "Central African Republic", "Equatorial Guinea",
    "São Tomé and Príncipe", "Angola", "Rwanda", "Burundi",
  ]);

  // ── Liste noire d'emails (blocage immédiat avant tout traitement) ─────────────
  // Chargée depuis la DB (settings key: blocked_login_emails) + mise à jour dynamique
  const blockedLoginEmails = new Set<string>();
  const loadBlockedEmails = async () => {
    try {
      const row = await db.execute(sql`SELECT value FROM settings WHERE key = 'blocked_login_emails' LIMIT 1`);
      const raw = (row.rows?.[0] as any)?.value;
      if (raw) {
        const list: string[] = typeof raw === "string" ? JSON.parse(raw) : raw;
        blockedLoginEmails.clear();
        list.forEach(e => blockedLoginEmails.add(e.toLowerCase().trim()));
      }
    } catch {}
  };
  // Charger immédiatement au démarrage
  loadBlockedEmails();

  // Cache géo pour le login marchand (évite de surcharger ip-api.com)
  const geoLoginCache = new Map<string, { country: string; ts: number }>();
  const GEO_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 heures par IP

  // Helper : extrait le hostname d'une Origin ou Referer (strict, pas de startsWith)
  function parseHost(headerValue: string): string | null {
    try {
      return new URL(headerValue).hostname;
    } catch {
      return null;
    }
  }

  // ── Middleware bot-guard (UA + Origin) pour /api/merchant/* et /api/payment/* ──
  // botGuard : UA blocking uniquement (s'applique à /api/merchant/* et /api/payment/*)
  // La validation Origin/Referer est réservée au seul endpoint /api/auth/merchant/login
  // pour ne pas bloquer les appels API server-to-server légitimes des marchands.
  const botGuard = (req: Request, res: Response, next: NextFunction) => {
    const ua = req.headers["user-agent"] || "";

    // Skip OPTIONS (CORS preflight)
    if (req.method === "OPTIONS") return next();

    // Block automated user-agents
    if (ua && BLOCKED_UA_PATTERNS.some(p => p.test(ua))) {
      const clientIp = (req.ip || req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
      storage.createSecurityLog({ eventType: "bot_blocked", ip: clientIp, action: "ua_blocked_middleware", details: `${ua.substring(0, 120)} — ${req.path}` }).catch(() => {});
      return res.status(403).json({ message: "Accès refusé" });
    }

    next();
  };

  // ── Lightweight blocked-IP middleware for merchant + payment routes ──────────
  // Ensures IPs auto-blocked by rate-limiter or brute-force are also rejected here.
  // (ipGuard covers /api/admin only, which includes allowed-IP whitelist; this simpler
  //  version checks only blocked_ips without the admin whitelist requirement.)
  const blockedIpGuard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.method === "OPTIONS") return next();
      const cleanIp = (req.ip || req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
      const blocked = await storage.isIpBlocked(cleanIp);
      if (blocked) {
        storage.createSecurityLog({ eventType: "blocked_access", ip: cleanIp, action: "ip_blocked_merchant_payment", details: req.path }).catch(() => {});
        return res.status(403).json({ message: "Accès refusé" });
      }
      next();
    } catch {
      next();
    }
  };

  app.use("/api/merchant", blockedIpGuard, botGuard);
  app.use("/api/payment", blockedIpGuard, botGuard);

  // ── Rate-limit store pour les endpoints de paiement ──────────────────────────
  const paymentInitiateAttempts = new Map<string, { count: number; firstReq: number }>();
  const PAYMENT_RATE_MAX = 10;
  const PAYMENT_RATE_WINDOW = 60 * 1000; // 1 min

  const paymentRateLimit = (req: Request, res: Response, next: NextFunction) => {
    const clientIp = (req.ip || req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
    const now = Date.now();
    const entry = paymentInitiateAttempts.get(clientIp) || { count: 0, firstReq: now };
    if (now - entry.firstReq > PAYMENT_RATE_WINDOW) { entry.count = 0; entry.firstReq = now; }
    entry.count++;
    paymentInitiateAttempts.set(clientIp, entry);
    if (entry.count > PAYMENT_RATE_MAX) {
      // Auto-block IP in DB and log the event
      storage.addBlockedIp({ ipAddress: clientIp, reason: `Rate limit paiement — ${entry.count} req/min`, blockedBy: "système" }).catch(() => {});
      storage.createSecurityLog({ eventType: "rate_limit", ip: clientIp, action: "payment_rate_autoblock", details: `${entry.count} req/min — ${req.path}` }).catch(() => {});
      return res.status(429).json({ message: "Trop de requêtes. Réessayez dans un moment." });
    }
    next();
  };

  // Compteur d'alertes bad-origin pour Telegram (évite le spam : 1 alerte par IP/5min)
  const badOriginAlertCache = new Map<string, number>();
  const BAD_ORIGIN_ALERT_COOLDOWN = 5 * 60 * 1000;

  app.post("/api/auth/merchant/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      // Validation stricte du format email — rejette injections JSON/NoSQL/script
      if (!isValidEmailInput(email) || !password) return res.status(400).json({ message: "Email et mot de passe requis" });

      const clientIp = getClientIp(req);
      const ua = req.headers["user-agent"] || "?";

      // ── COUCHE 0a : IP spoofée (plage réservée RFC 5737 injectée dans X-Forwarded-For) ──
      if (clientIp.startsWith("SPOOFED:")) {
        storage.createSecurityLog({ eventType: "blocked_access", ip: clientIp, userEmail: email, action: "spoofed_ip_merchant", details: `IP réservée — ${ua.substring(0, 60)}` }).catch(() => {});
        return res.status(403).json({ message: "Accès refusé" });
      }

      // ── COUCHE 0b : Blocage email immédiat (avant toute DB/geo/UA — coût zéro) ──
      if (blockedLoginEmails.has(email.toLowerCase().trim())) {
        // Log silencieux sans révéler la raison à l'attaquant
        storage.createSecurityLog({ eventType: "blocked_access", ip: clientIp, userEmail: email, action: "email_blacklisted", details: `Email sur liste noire — ${ua.substring(0, 80)}` }).catch(() => {});
        // Auto-ban l'IP aussi si nouvelle IP
        storage.isIpBlocked(clientIp).then(already => {
          if (!already) storage.addBlockedIp({ ipAddress: clientIp, reason: `Email blacklisté: ${email}`, blockedBy: "système" }).catch(() => {});
        }).catch(() => {});
        return res.status(401).json({ message: "Email ou mot de passe incorrect" });
      }

      // Contrôle IP bloquée (défense en profondeur — couvre les IPs auto-bloquées par rate-limit)
      const isBlocked = await storage.isIpBlocked(clientIp).catch(() => false);
      if (isBlocked) {
        storage.createSecurityLog({ eventType: "blocked_access", ip: clientIp, userEmail: email, action: "ip_blocked_login", details: "blocked_ips check" }).catch(() => {});
        return res.status(403).json({ message: "Accès refusé" });
      }

      // Restriction géographique + blocage datacenter/VPS
      const isLocalIp = clientIp === "127.0.0.1" || clientIp === "::1" || clientIp.startsWith("192.168.") || clientIp.startsWith("10.");
      if (!isLocalIp) {
        let geoCountry = "";
        let isDatacenter = false;
        const cached = geoLoginCache.get(clientIp);
        if (cached && Date.now() - cached.ts < GEO_CACHE_TTL) {
          geoCountry = cached.country;
          isDatacenter = (cached as any).isHosting || false;
        } else {
          const geo = await getGeoInfo(clientIp).catch(() => null);
          geoCountry = geo?.country || "";
          isDatacenter = geo?.isHosting || false;
          if (geoCountry) geoLoginCache.set(clientIp, { country: geoCountry, ts: Date.now(), isHosting: isDatacenter } as any);
        }

        // Bloquer les IPs de datacenter / VPS / serveurs cloud (jamais un vrai marchand)
        if (isDatacenter) {
          storage.addBlockedIp({ ipAddress: clientIp, reason: `IP datacenter/VPS: ${geoCountry || "inconnu"}`, blockedBy: "système" }).catch(() => {});
          storage.createSecurityLog({ eventType: "datacenter_blocked", ip: clientIp, userEmail: email, action: "hosting_ip_blocked", details: `Datacenter ${geoCountry || "?"} — ${ua.substring(0, 60)}` }).catch(() => {});
          return res.status(403).json({ message: "Accès refusé" });
        }

        if (geoCountry && !ALLOWED_MERCHANT_COUNTRIES.has(geoCountry)) {
          // Auto-bloquer l'IP immédiatement + log + Telegram
          storage.addBlockedIp({ ipAddress: clientIp, reason: `Zone géographique non autorisée: ${geoCountry}`, blockedBy: "système" }).catch(() => {});
          storage.createSecurityLog({ eventType: "geo_blocked", ip: clientIp, userEmail: email, action: "country_not_allowed", details: `${geoCountry} — tentative login marchand` }).catch(() => {});
          notifyAdminCountryBlocked({ ip: clientIp, country: geoCountry, email }).catch(() => {});
          return res.status(403).json({ message: "Ce service n'est pas disponible dans votre région." });
        }
      }

      // Bloquer les bots / scripts automatisés (double-check au niveau de la route)
      if (BLOCKED_UA_PATTERNS.some(p => p.test(ua))) {
        storage.createSecurityLog({ eventType: "bot_blocked", ip: clientIp, userEmail: email, action: "ua_blocked", details: ua.substring(0, 120) }).catch(() => {});
        return res.status(403).json({ message: "Accès refusé" });
      }

      // Validation stricte Origin + Referer (obligatoire pour login marchand)
      // Utilise new URL().hostname pour éviter le bypass via westpay.cloud.attacker.tld
      const origin = req.headers["origin"] as string | undefined;
      const referer = req.headers["referer"] as string | undefined;
      const originHost = origin ? parseHost(origin) : null;
      const refererHost = referer ? parseHost(referer) : null;
      const hasValidOrigin = originHost && ALLOWED_HOSTS.includes(originHost);
      const hasValidReferer = refererHost && ALLOWED_HOSTS.includes(refererHost);

      const triggerBadOriginAlert = (action: string, detail: string) => {
        storage.createSecurityLog({ eventType: "bad_origin", ip: clientIp, userEmail: email, action, details: detail }).catch(() => {});
        // Alerte Telegram avec cooldown par IP pour éviter le spam
        const lastAlert = badOriginAlertCache.get(clientIp) || 0;
        if (Date.now() - lastAlert > BAD_ORIGIN_ALERT_COOLDOWN) {
          badOriginAlertCache.set(clientIp, Date.now());
          notifyAdminGroup(
            `🚨 *Tentative login sans Origin valide*\n\n` +
            `🌐 *IP :* \`${clientIp}\`\n` +
            `📧 *Email :* \`${email}\`\n` +
            `🔍 *Raison :* ${action}\n` +
            `📋 *Détail :* \`${detail.substring(0, 80)}\``
          ).catch(() => {});
        }
      };

      if (origin && !hasValidOrigin) {
        triggerBadOriginAlert("origin_rejected_login", `origin=${origin}`);
        return res.status(403).json({ message: "Accès refusé" });
      }
      if (referer && !hasValidReferer) {
        triggerBadOriginAlert("referer_rejected_login", `referer=${referer.substring(0, 80)}`);
        return res.status(403).json({ message: "Accès refusé" });
      }
      if (!origin && !referer) {
        triggerBadOriginAlert("missing_origin_referer_login", "no origin/referer");
        return res.status(403).json({ message: "Accès refusé" });
      }

      // Rate-limit brute-force par IP
      const now = Date.now();
      const attempt = merchantLoginAttempts.get(clientIp) || { count: 0, firstFail: now };
      if (now - attempt.firstFail > MERCHANT_BRUTE_WINDOW) { attempt.count = 0; attempt.firstFail = now; }
      if (attempt.count >= MERCHANT_BRUTE_MAX) {
        storage.addBlockedIp({ ipAddress: clientIp, reason: `Brute force marchand — ${attempt.count} tentatives`, blockedBy: "système" }).catch(() => {});
        storage.createSecurityLog({ eventType: "brute_force", ip: clientIp, userEmail: email, action: "merchant_auto_blocked", details: `${attempt.count} tentatives` }).catch(() => {});
        return res.status(429).json({ message: "Trop de tentatives. Réessayez plus tard." });
      }

      const merchant = await storage.getMerchantByEmail(email);
      if (!merchant) {
        attempt.count++;
        merchantLoginAttempts.set(clientIp, attempt);
        return res.status(401).json({ message: "Identifiants invalides" });
      }
      if (merchant.suspended) return res.status(403).json({ message: "Compte suspendu" });

      const valid = await bcrypt.compare(password, merchant.passwordHash);
      if (!valid) {
        attempt.count++;
        merchantLoginAttempts.set(clientIp, attempt);
        await storage.createLoginLog({ userId: merchant.id, role: "merchant", ip: clientIp, device: ua, success: false });
        notifyAdminMerchantLogin({ email: merchant.email, merchantName: merchant.name, ip: clientIp, device: ua, success: false }).catch(() => {});
        return res.status(401).json({ message: "Identifiants invalides" });
      }

      merchantLoginAttempts.delete(clientIp);

      // Vérifier AVANT d'enregistrer le log si l'IP a déjà été vue pour ce compte
      const seenBefore = await storage.hasMerchantSeenIp(merchant.id, clientIp).catch(() => true);

      await storage.createLoginLog({ userId: merchant.id, role: "merchant", ip: clientIp, device: ua, success: true });

      if (!seenBefore) {
        storage.createSecurityLog({ eventType: "new_ip_login", ip: clientIp, userEmail: merchant.email, action: "new_merchant_ip", details: merchant.name }).catch(() => {});
        notifyAdminNewMerchantIp({ email: merchant.email, merchantName: merchant.name, merchantId: merchant.id, ip: clientIp, device: ua }).catch(() => {});
      } else {
        notifyAdminMerchantLogin({ email: merchant.email, merchantName: merchant.name, ip: clientIp, device: ua, success: true }).catch(() => {});
      }

      // ── Bypass OTP pour les comptes de test internes ─────────────────────────
      const OTP_BYPASS_EMAILS = ["test@westpay.dev", "test@testmerchant.com", "demo@westpay.dev"];
      if (OTP_BYPASS_EMAILS.includes(merchant.email.toLowerCase())) {
        const token = jwt.sign(
          { merchantId: merchant.id, email: merchant.email, role: "merchant", slug: merchant.slug, name: merchant.name },
          JWT_SECRET,
          { expiresIn: "7d" }
        );
        return res.json({ token, user: { id: merchant.id, email: merchant.email, name: merchant.name, slug: merchant.slug } });
      }

      // ── Email OTP 2FA ─────────────────────────────────────────────────────────
      const otpValue = String(Math.floor(100000 + Math.random() * 900000));
      const otpHash = await bcrypt.hash(otpValue, 8);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      const tempToken = jwt.sign(
        { merchantId: merchant.id, email: merchant.email, purpose: "merchant_otp", slug: merchant.slug, name: merchant.name },
        JWT_SECRET,
        { expiresIn: "6m" }
      );

      // Invalider les anciens OTPs non utilisés pour cet email
      await pool.query(`DELETE FROM merchant_login_otps WHERE email = $1`, [merchant.email]);

      await pool.query(
        `INSERT INTO merchant_login_otps (email, otp_hash, temp_token, expires_at, used, attempts)
         VALUES ($1, $2, $3, $4, false, 0)`,
        [merchant.email, otpHash, tempToken, expiresAt]
      );

      // Envoyer l'OTP — bot OTP dédié → bot principal → email (fallback chain)
      let otpVia: "telegram" | "email" = "email";
      if (merchant.telegramChatId) {
        try {
          // 1st priority: dedicated OTP bot (separate token, single responsibility)
          const { sendOtpViaDedicatedBot } = await import("./telegram-otp-bot");
          const sent = await sendOtpViaDedicatedBot(merchant.telegramChatId, otpValue, merchant.name);
          if (sent) {
            otpVia = "telegram";
          } else {
            // 2nd priority: main notification bot fallback
            const { sendMerchantOtpTelegram } = await import("./telegram-bot");
            const sentFallback = await sendMerchantOtpTelegram(merchant.telegramChatId, otpValue, merchant.name);
            if (sentFallback) otpVia = "telegram";
          }
        } catch (err) {
          console.error("[MERCHANT OTP] Telegram error, falling back to email:", err);
        }
      }
      if (otpVia === "email") {
        sendMerchantOtpEmail(merchant.email, otpValue, merchant.name).catch((err) => {
          console.error("[MERCHANT OTP] Email error:", err);
        });
      }

      return res.json({ requiresOtp: true, tempToken, otpVia, merchantName: merchant.name });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Merchant email OTP verification ───────────────────────────────────────────
  app.post("/api/auth/merchant/verify-otp", async (req, res) => {
    try {
      const { tempToken, code } = req.body;
      if (!tempToken || !code) return res.status(400).json({ message: "Données manquantes" });

      let payload: any;
      try {
        payload = jwt.verify(tempToken, JWT_SECRET);
      } catch {
        return res.status(401).json({ message: "Session expirée, veuillez vous reconnecter." });
      }

      if (payload.purpose !== "merchant_otp") {
        return res.status(401).json({ message: "Token invalide" });
      }

      const { merchantId, email, slug, name } = payload;

      // Récupérer l'OTP en DB
      const otpRow = await pool.query(
        `SELECT id, otp_hash, expires_at, used, attempts
         FROM merchant_login_otps
         WHERE email = $1 AND temp_token = $2
         ORDER BY created_at DESC LIMIT 1`,
        [email, tempToken]
      );

      if (!otpRow.rowCount || otpRow.rowCount === 0) {
        return res.status(401).json({ message: "Code introuvable ou expiré." });
      }

      const otp = otpRow.rows[0];

      if (otp.used) return res.status(401).json({ message: "Ce code a déjà été utilisé." });
      if (new Date(otp.expires_at) < new Date()) return res.status(401).json({ message: "Code expiré." });
      if (otp.attempts >= 5) {
        return res.status(429).json({ message: "Trop de tentatives. Veuillez vous reconnecter." });
      }

      // Incrémenter les tentatives
      await pool.query(`UPDATE merchant_login_otps SET attempts = attempts + 1 WHERE id = $1`, [otp.id]);

      const valid = await bcrypt.compare(String(code).trim(), otp.otp_hash);
      if (!valid) {
        const remaining = 4 - otp.attempts;
        return res.status(401).json({ message: `Code incorrect. ${remaining > 0 ? `${remaining} tentative(s) restante(s).` : "Veuillez vous reconnecter."}` });
      }

      // Marquer comme utilisé
      await pool.query(`UPDATE merchant_login_otps SET used = true WHERE id = $1`, [otp.id]);

      const token = signToken({ id: merchantId, role: "merchant", email });
      return res.json({ token, user: { id: merchantId, email, name, slug } });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ==================== ADMIN ROUTES ====================
  app.use("/api/admin", ipGuard);

  app.get("/api/admin/security/ips", authMiddleware("admin"), async (_req, res) => {
    try {
      const ips = await storage.getAllowedIps();
      res.json(ips);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/security/ips", authMiddleware("admin"), async (req, res) => {
    try {
      const { ipAddress, userEmail, role, note } = req.body;
      if (!ipAddress) return res.status(400).json({ message: "IP requise" });
      const geo = await getGeoInfo(ipAddress).catch(() => ({ country: null, city: null }));
      const row = await storage.addAllowedIp({
        ipAddress,
        userEmail: userEmail || null,
        role: role || "merchant",
        country: geo.country || null,
        city: geo.city || null,
        note: note || null,
        createdBy: (req as any).adminId ? String((req as any).adminId) : "admin",
      });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/security/ips/:id", authMiddleware("admin"), async (req, res) => {
    try {
      await storage.removeAllowedIp(Number(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/login-logs", authMiddleware("admin"), async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const logs = await storage.getRecentLoginLogs(limit);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Blocked IPs ──────────────────────────────────────────────────────────────
  app.get("/api/admin/security/blocked-ips", authMiddleware("admin"), async (_req, res) => {
    try {
      res.json(await storage.getBlockedIps());
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/security/blocked-ips", authMiddleware("admin"), async (req, res) => {
    try {
      const { ipAddress, reason } = req.body;
      if (!ipAddress) return res.status(400).json({ message: "IP requise" });
      const geo = await getGeoInfo(ipAddress).catch(() => ({ country: null, city: null }));
      const row = await storage.addBlockedIp({
        ipAddress,
        country: geo.country || null,
        city: geo.city || null,
        reason: reason || "Bloqué manuellement",
        blockedBy: (req as any).user?.email || "admin",
      });
      storage.createSecurityLog({ eventType: "ip_blocked", ip: ipAddress, action: "manual_block", details: reason || "Bloqué manuellement", telegramAdmin: (req as any).user?.email }).catch(() => {});
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/security/blocked-ips/:id", authMiddleware("admin"), async (req, res) => {
    try {
      await storage.removeBlockedIp(Number(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Blocked Emails (liste noire login marchand) ───────────────────────────────
  app.get("/api/admin/security/blocked-emails", authMiddleware("admin"), async (_req, res) => {
    try {
      const row = await db.execute(sql`SELECT value FROM settings WHERE key = 'blocked_login_emails' LIMIT 1`);
      const raw = (row.rows?.[0] as any)?.value;
      const list: string[] = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : [];
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/security/blocked-emails", authMiddleware("admin"), async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") return res.status(400).json({ message: "Email requis" });
      const clean = email.toLowerCase().trim();
      const row = await db.execute(sql`SELECT value FROM settings WHERE key = 'blocked_login_emails' LIMIT 1`);
      const raw = (row.rows?.[0] as any)?.value;
      const list: string[] = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : [];
      if (!list.includes(clean)) list.push(clean);
      await db.execute(sql`INSERT INTO settings (key, value) VALUES ('blocked_login_emails', ${JSON.stringify(list)}) ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(list)}`);
      blockedLoginEmails.add(clean);
      res.json({ ok: true, list });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/security/blocked-emails/:email", authMiddleware("admin"), async (req, res) => {
    try {
      const clean = decodeURIComponent(req.params.email).toLowerCase().trim();
      const row = await db.execute(sql`SELECT value FROM settings WHERE key = 'blocked_login_emails' LIMIT 1`);
      const raw = (row.rows?.[0] as any)?.value;
      const list: string[] = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : [];
      const updated = list.filter(e => e !== clean);
      await db.execute(sql`INSERT INTO settings (key, value) VALUES ('blocked_login_emails', ${JSON.stringify(updated)}) ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(updated)}`);
      blockedLoginEmails.delete(clean);
      res.json({ ok: true, list: updated });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Blocked Devices ──────────────────────────────────────────────────────────
  app.get("/api/admin/security/blocked-devices", authMiddleware("admin"), async (_req, res) => {
    try {
      res.json(await storage.getBlockedDevices());
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/security/blocked-devices", authMiddleware("admin"), async (req, res) => {
    try {
      const { fingerprint, ipAddress, reason } = req.body;
      if (!fingerprint) return res.status(400).json({ message: "Empreinte requise" });
      const row = await storage.addBlockedDevice({
        fingerprint,
        ipAddress: ipAddress || null,
        userAgent: null,
        reason: reason || "Bloqué manuellement",
        blockedBy: (req as any).user?.email || "admin",
      });
      storage.createSecurityLog({ eventType: "device_blocked", fingerprint, ip: ipAddress, action: "manual_block", details: reason || "Bloqué manuellement" }).catch(() => {});
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/security/blocked-devices/:id", authMiddleware("admin"), async (req, res) => {
    try {
      await storage.removeBlockedDevice(Number(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Security Logs ────────────────────────────────────────────────────────────
  app.get("/api/admin/security/logs", authMiddleware("admin"), async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      res.json(await storage.getSecurityLogs(limit));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Devices ──────────────────────────────────────────────────────────────────
  app.get("/api/admin/security/devices", authMiddleware("admin"), async (_req, res) => {
    try {
      res.json(await storage.getAllDevices(200));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/admin/security/devices/:id/trust", authMiddleware("admin"), async (req, res) => {
    try {
      await storage.trustDevice(Number(req.params.id));
      storage.createSecurityLog({ eventType: "device_trusted", action: "manual_trust", details: `ID ${req.params.id}`, telegramAdmin: (req as any).user?.email }).catch(() => {});
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/admin/security/devices/:id", authMiddleware("admin"), async (req, res) => {
    try {
      await storage.blockDeviceById(Number(req.params.id));
      storage.createSecurityLog({ eventType: "device_blocked", action: "manual_block", details: `ID ${req.params.id}`, telegramAdmin: (req as any).user?.email }).catch(() => {});
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Security Settings (2FA, Device Check, VPN Block, Country Blacklist) ─────
  app.get("/api/admin/security/config", authMiddleware("admin"), async (_req, res) => {
    try {
      res.json(await getSecuritySettings());
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/admin/security/config", authMiddleware("admin"), async (req, res) => {
    try {
      const { twoFa, deviceCheck, vpnBlock, blockedCountries } = req.body;
      if (typeof twoFa === "boolean") await storage.setSetting("security_2fa_enabled", String(twoFa));
      if (typeof deviceCheck === "boolean") await storage.setSetting("security_device_check", String(deviceCheck));
      if (typeof vpnBlock === "boolean") await storage.setSetting("security_vpn_block", String(vpnBlock));
      if (Array.isArray(blockedCountries)) await storage.setSetting("security_blocked_countries", JSON.stringify(blockedCountries));
      storage.createSecurityLog({ eventType: "security_config_updated", action: "config_change", details: JSON.stringify({ twoFa, deviceCheck, vpnBlock }), telegramAdmin: (req as any).user?.email }).catch(() => {});
      res.json(await getSecuritySettings());
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

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

  // ── OTP Bot settings ──────────────────────────────────────────────────────

  app.get("/api/admin/telegram/otp-bot/settings", authMiddleware("admin"), async (_req, res) => {
    try {
      const { getOtpBotStatus } = await import("./telegram-otp-bot");
      const status = getOtpBotStatus();
      const storedToken = await storage.getSetting("telegram_otp_bot_token");
      const hasToken = !!(process.env.TELEGRAM_OTP_BOT_TOKEN || storedToken);
      const masked = storedToken
        ? storedToken.slice(0, 8) + "..." + storedToken.slice(-6)
        : process.env.TELEGRAM_OTP_BOT_TOKEN
        ? "(env var)"
        : null;
      res.json({ running: status.running, username: status.username, hasToken, masked });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/telegram/otp-bot/settings", authMiddleware("admin"), async (req, res) => {
    try {
      const { token } = req.body;
      if (!token || typeof token !== "string" || !token.trim()) {
        return res.status(400).json({ message: "token required" });
      }
      await storage.setSetting("telegram_otp_bot_token", token.trim());
      const { reloadOtpBot } = await import("./telegram-otp-bot");
      const result = await reloadOtpBot();
      if (!result.ok) return res.status(400).json({ message: result.error || "Invalid token" });
      await storage.createAuditLog({ adminId: (req as any).user.id, action: "otp_bot_token_updated", details: "OTP bot token updated and reloaded", ip: req.ip || "" });
      res.json({ success: true, username: result.username });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/telegram/otp-bot/test", authMiddleware("admin"), async (req, res) => {
    try {
      const { chatId, merchantName } = req.body;
      if (!chatId) return res.status(400).json({ message: "chatId required" });
      const { sendOtpViaDedicatedBot } = await import("./telegram-otp-bot");
      const testOtp = String(Math.floor(100000 + Math.random() * 900000));
      const sent = await sendOtpViaDedicatedBot(String(chatId), testOtp, merchantName || "Test Merchant");
      if (!sent) return res.status(500).json({ message: "Failed to send — check bot token and chat ID" });
      res.json({ success: true, otp: testOtp });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/telegram/broadcast", authMiddleware("admin"), async (req, res) => {
    try {
      const { message, imageUrl, buttons, target, merchantIds } = req.body;
      if (!message || !message.trim()) return res.status(400).json({ message: "Message requis" });

      const validatedButtons: Array<Array<{ text: string; url: string }>> = [];
      if (buttons && Array.isArray(buttons)) {
        for (const row of buttons) {
          if (Array.isArray(row)) {
            const validRow = row.filter((b: any) => b.text?.trim() && b.url?.trim());
            if (validRow.length > 0) validatedButtons.push(validRow);
          }
        }
      }

      let targetChatIds: string[] | undefined;
      if (target === "specific" && Array.isArray(merchantIds) && merchantIds.length > 0) {
        const merchants = await storage.getMerchants();
        targetChatIds = merchants
          .filter((m: any) => merchantIds.includes(m.id) && m.telegramChatId)
          .map((m: any) => m.telegramChatId as string);
      }

      const result = await broadcastToMerchants({
        message: message.trim(),
        imageUrl: imageUrl?.trim() || undefined,
        buttons: validatedButtons.length > 0 ? validatedButtons : undefined,
        targetChatIds,
      });

      res.json({
        message: `Telegram : ${result.sent} envoyé(s), ${result.failed} échec(s)`,
        ...result,
      });
    } catch (err: any) {
      console.error("[TELEGRAM BROADCAST]", err);
      res.status(500).json({ message: err.message || "Erreur serveur" });
    }
  });

  app.post("/api/admin/telegram/upload-image", authMiddleware("admin"), broadcastUpload.single("image"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "Aucun fichier fourni" });
      const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || process.env.REPLIT_DEV_DOMAIN;
      const base = domain ? `https://${domain}` : "";
      const url = `${base}/uploads/broadcast/${req.file.filename}`;
      res.json({ url });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Erreur upload" });
    }
  });

  app.get("/api/admin/telegram/merchants-with-telegram", authMiddleware("admin"), async (_req, res) => {
    try {
      const merchants = await storage.getMerchants();
      const withTelegram = merchants
        .filter((m: any) => m.telegramChatId)
        .map((m: any) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          telegramChatId: m.telegramChatId,
          suspended: m.suspended,
        }));
      res.json(withTelegram);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/stats", authMiddleware("admin"), async (_req, res) => {
    try {
      const [stats, detailedStats, allLinks, platformBalance, baseline] = await Promise.all([
        storage.getStats(),
        storage.getAdminDetailedStats(),
        storage.getAllPaymentLinks(),
        storage.getPlatformBalance(),
        storage.getLatestStatsBaseline(),
      ]);
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayPayments = allLinks.reduce((s, l) => s + (l.lastPaymentAt && new Date(l.lastPaymentAt) >= todayStart ? 1 : 0), 0);
      const b = baseline || { transactionCount: 0, totalVolume: 0, commissionTotal: 0, apiPaymentsCount: 0, apiPaymentsTotal: 0, linkPaymentsCount: 0, linkPaymentsTotal: 0, withdrawalsCount: 0, withdrawalsTotal: 0 };
      const sub = (a: number, bv: number) => Math.max(0, a - bv);
      res.json({
        ...stats,
        transactionCount: sub(stats.transactionCount, b.transactionCount),
        totalVolume: sub(stats.totalVolume, b.totalVolume),
        paymentLinkCount: allLinks.length,
        todayPayments,
        platformBalance,
        ...detailedStats,
        commissionTotal: sub(detailedStats.commissionTotal, b.commissionTotal),
        apiPaymentsCount: sub(detailedStats.apiPaymentsCount, b.apiPaymentsCount),
        apiPaymentsTotal: sub(detailedStats.apiPaymentsTotal, b.apiPaymentsTotal),
        linkPaymentsCount: sub(detailedStats.linkPaymentsCount, b.linkPaymentsCount),
        linkPaymentsTotal: sub(detailedStats.linkPaymentsTotal, b.linkPaymentsTotal),
        withdrawalsCount: sub(detailedStats.withdrawalsCount, b.withdrawalsCount),
        withdrawalsTotal: sub(detailedStats.withdrawalsTotal, b.withdrawalsTotal),
        lastStatsReset: baseline?.resetAt || null,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/stats/by-merchant", authMiddleware("admin"), async (req, res) => {
    try {
      const period = (req.query.period as string) || "all";
      const validPeriod = ["today", "month", "all"].includes(period) ? (period as "today" | "month" | "all") : "all";
      const data = await storage.getCommissionByMerchant(validPeriod);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/stats/by-country", authMiddleware("admin"), async (req, res) => {
    try {
      const period = (req.query.period as string) || "all";
      const validPeriod = ["today", "month", "all"].includes(period) ? (period as "today" | "month" | "all") : "all";
      const data = await storage.getCommissionByCountry(validPeriod);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/reset-stats", authMiddleware("admin"), async (_req, res) => {
    try {
      const [stats, detailedStats] = await Promise.all([
        storage.getStats(),
        storage.getAdminDetailedStats(),
      ]);
      await storage.createStatsBaseline({
        transactionCount: stats.transactionCount,
        totalVolume: stats.totalVolume,
        commissionTotal: detailedStats.commissionTotal,
        apiPaymentsCount: detailedStats.apiPaymentsCount,
        apiPaymentsTotal: detailedStats.apiPaymentsTotal,
        linkPaymentsCount: detailedStats.linkPaymentsCount,
        linkPaymentsTotal: detailedStats.linkPaymentsTotal,
        withdrawalsCount: detailedStats.withdrawalsCount,
        withdrawalsTotal: detailedStats.withdrawalsTotal,
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/merchants", authMiddleware("admin"), async (_req, res) => {
    try {
      const result = await (storage as any).getMerchantsWithStats();
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

      const adminUser = (req as any).user;
      const mcIp = req.ip || "";
      getGeoInfo(mcIp).then(geo => {
        notifyAdminMerchantCreated({
          merchantName: name,
          merchantEmail: email,
          merchantSlug: slug,
          merchantId: merchant.id,
          adminEmail: adminUser?.email,
          adminId: adminUser?.id,
          ip: mcIp,
          geo,
        }).catch(() => {});
      }).catch(() => {
        notifyAdminMerchantCreated({
          merchantName: name,
          merchantEmail: email,
          merchantSlug: slug,
          merchantId: merchant.id,
          adminEmail: adminUser?.email,
          adminId: adminUser?.id,
          ip: mcIp,
        }).catch(() => {});
      });

      res.json(merchant);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/merchants/:id/slug", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const { slug } = req.body;
      if (!slug || typeof slug !== "string") return res.status(400).json({ message: "Slug requis" });
      const trimmed = slug.trim().toLowerCase();
      if (!/^[a-z0-9-]+$/.test(trimmed)) return res.status(400).json({ message: "Slug invalide : uniquement des lettres minuscules, chiffres et tirets" });
      if (trimmed.length < 2) return res.status(400).json({ message: "Slug trop court (minimum 2 caractères)" });
      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant) return res.status(404).json({ message: "Marchand introuvable" });
      const existing = await storage.getMerchantBySlug(trimmed);
      if (existing && existing.id !== merchantId) return res.status(400).json({ message: "Ce slug est déjà utilisé par un autre marchand" });
      await storage.updateMerchant(merchantId, { slug: trimmed });
      await storage.createApiLog({
        merchantId,
        action: "slug_updated",
        ip: req.ip || "",
        description: `Slug modifié de "${merchant.slug}" vers "${trimmed}" par l'administrateur`,
      });
      res.json({ success: true, slug: trimmed });
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

  app.delete("/api/admin/merchant-country/:id", authMiddleware("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "ID invalide" });
      await storage.deleteMerchantCountry(id);
      res.json({ ok: true });
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
      const updatedMC = await storage.getMerchantCountryById(id);
      if (updatedMC) {
        const balMerchant = await storage.getMerchantById(updatedMC.merchantId);
        const adminUser = (req as any).user;
        const rawIp = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "").split(",")[0].trim();
        getGeoInfo(rawIp).then(geo => {
          notifyAdminBalanceUpdate({
            merchantName: balMerchant?.name || `#${updatedMC.merchantId}`,
            merchantEmail: balMerchant?.email,
            country: updatedMC.country,
            newBalance: balance,
            adminEmail: adminUser?.email,
            adminId: adminUser?.id,
            ip: geo.ip || rawIp,
            geo,
          }).catch(() => {});
        }).catch(() => {
          notifyAdminBalanceUpdate({
            merchantName: balMerchant?.name || `#${updatedMC.merchantId}`,
            merchantEmail: balMerchant?.email,
            country: updatedMC.country,
            newBalance: balance,
            adminEmail: adminUser?.email,
            adminId: adminUser?.id,
            ip: rawIp,
          }).catch(() => {});
        });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/transactions", authMiddleware("admin"), async (req, res) => {
    try {
      const { dateFilter = "all", startDate, endDate } = req.query as { dateFilter?: string; startDate?: string; endDate?: string };

      const now = new Date();
      let dateFrom: Date | null = null;
      let dateTo: Date | null = null;

      if (dateFilter === "today") {
        dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (dateFilter === "yesterday") {
        dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        dateTo = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (dateFilter === "week") {
        dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (dateFilter === "month") {
        dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (dateFilter === "custom" && startDate) {
        dateFrom = new Date(startDate as string);
        if (endDate) {
          dateTo = new Date(endDate as string);
          dateTo.setDate(dateTo.getDate() + 1);
        }
      }

      const hasDateFilter = !!dateFrom || !!dateTo;
      const txLimit = hasDateFilter ? undefined : 400;

      const [txs, wds, wts, merchantsList, pendingPays] = await Promise.all([
        storage.getTransactions(undefined, { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, limit: txLimit }),
        storage.getWithdrawals(),
        storage.getWalletTransfers(),
        storage.getMerchants(),
        storage.getPendingPayments(),
      ]);

      const merchantMap = new Map(merchantsList.map(m => [m.id, m.name]));

      const payments = txs.map(t => ({
        id: `pay-${t.id}`,
        rowId: t.id,
        type: "payment" as const,
        txId: t.txId,
        amount: t.amount,
        status: t.status,
        country: t.country,
        merchantId: t.merchantId,
        merchantName: merchantMap.get(t.merchantId) || `Marchand #${t.merchantId}`,
        payerNumber: t.payerNumber,
        operator: t.operator,
        provider: t.provider,
        omnipayReference: t.omnipayReference,
        errorMessage: t.errorMessage,
        createdAt: t.createdAt,
      }));

      const withdrawalItems = wds.map(w => ({
        id: `wd-${w.id}`,
        rowId: w.id,
        type: "withdrawal" as const,
        txId: w.omnipayRef || `WD-${w.id}`,
        amount: w.amount,
        status: w.status,
        country: w.country,
        merchantId: w.merchantId,
        merchantName: w.merchantName,
        payerNumber: w.phone,
        operator: w.operator,
        provider: null,
        omnipayReference: w.omnipayRef,
        errorMessage: w.adminNote,
        createdAt: w.createdAt,
      }));

      const transferItems = wts.map(t => ({
        id: `wt-${t.id}`,
        rowId: t.id,
        type: "transfer" as const,
        txId: `TR-${t.id}`,
        amount: t.amount,
        status: t.status,
        country: `${t.fromCountry} → ${t.toCountry}`,
        merchantId: t.merchantId,
        merchantName: t.merchantName,
        payerNumber: null,
        operator: null,
        provider: null,
        omnipayReference: null,
        errorMessage: t.adminNote,
        createdAt: t.createdAt,
      }));

      const pendingItems = pendingPays.map(p => ({
        id: `pp-${p.id}`,
        rowId: p.id,
        type: "pending" as const,
        txId: p.txId || `PP-${p.id}`,
        amount: p.amount,
        status: p.status,
        country: p.country,
        merchantId: p.merchantId,
        merchantName: merchantMap.get(p.merchantId) || `Marchand #${p.merchantId}`,
        payerNumber: p.payerPhone,
        operator: p.paymentMethod,
        provider: null,
        omnipayReference: p.omnipayReference,
        errorMessage: null,
        createdAt: p.createdAt,
      }));

      let all = [...payments, ...withdrawalItems, ...transferItems, ...pendingItems];

      if (dateFrom) {
        all = all.filter(t => new Date(t.createdAt!) >= dateFrom!);
      }
      if (dateTo) {
        all = all.filter(t => new Date(t.createdAt!) < dateTo!);
      }

      all.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

      res.json(all);
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
      const { email, password, masterKey } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Email et mot de passe requis" });

      // Clé maître obligatoire pour créer un admin — définie via ADMIN_MASTER_KEY
      const expectedKey = process.env.ADMIN_MASTER_KEY;
      if (!expectedKey || !masterKey || masterKey !== expectedKey) {
        storage.createSecurityLog({ eventType: "unauthorized_admin_creation", ip: (req.ip || "").replace(/^::ffff:/, ""), userEmail: email, action: "master_key_invalid", details: "Tentative de création admin sans clé maître" }).catch(() => {});
        return res.status(403).json({ message: "Clé maître requise pour créer un administrateur" });
      }

      // Limite stricte : maximum 3 admins simultanés
      const allAdmins = await db.select({ id: admins.id }).from(admins);
      if (allAdmins.length >= 3) {
        return res.status(403).json({ message: "Nombre maximum d'administrateurs atteint (3). Supprimez un compte existant d'abord." });
      }

      if (password.length < 10) return res.status(400).json({ message: "Mot de passe trop court (10 caractères minimum)" });
      const existing = await storage.getAdminByEmail(email);
      if (existing) return res.status(400).json({ message: "Un compte admin avec cet email existe déjà" });
      const passwordHash = await bcrypt.hash(password, 10);
      const apiKey = "WP-ADMIN-" + crypto.randomBytes(16).toString("hex").toUpperCase();
      await storage.createAdmin({ email, passwordHash, apiKey });

      const creatorAdmin = (req as any).user;
      const caIp = req.ip || "";
      getGeoInfo(caIp).then(geo => {
        notifyAdminAdminCreated({
          newAdminEmail: email,
          createdByEmail: creatorAdmin?.email,
          createdById: creatorAdmin?.id,
          ip: caIp,
          geo,
        }).catch(() => {});
      }).catch(() => {
        notifyAdminAdminCreated({
          newAdminEmail: email,
          createdByEmail: creatorAdmin?.email,
          createdById: creatorAdmin?.id,
          ip: caIp,
        }).catch(() => {});
      });

      res.json({ success: true, email });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/delete-admin/:id", authMiddleware("admin"), async (req, res) => {
    try {
      const currentAdmin = (req as any).user;
      const id = Number(req.params.id);
      if (currentAdmin && currentAdmin.id === id) return res.status(400).json({ message: "Vous ne pouvez pas supprimer votre propre compte" });
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
  app.get("/api/merchant/me", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchant = await storage.getMerchantById((req as any).user.id);
      if (!merchant) return res.status(404).json({ message: "Marchand introuvable" });
      res.json({ id: merchant.id, name: merchant.name, email: merchant.email, slug: merchant.slug, feeExempt: merchant.feeExempt });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

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
      // Sanitize: never expose internal provider/gateway names to merchants
      const sanitized = txs.map((t: any) => ({
        ...t,
        provider: "westpay",
        omnipayTxId: undefined,
        omnipayReference: t.omnipayReference ? `WP-${t.id}` : undefined,
        gateway: undefined,
      }));
      res.json(sanitized);
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

  // ─── Docs : infos crypto marchand (via token docs) ────────────────────────
  app.get("/api/docs/crypto-merchant-info", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ message: "Token requis" });
      const token = authHeader.slice(7);
      let payload: any;
      try { payload = jwt.verify(token, JWT_SECRET); } catch { return res.status(401).json({ message: "Token invalide ou expiré" }); }
      if (payload.purpose !== "docs") return res.status(403).json({ message: "Accès interdit" });
      const merchant = await storage.getMerchantById(payload.merchantId);
      if (!merchant) return res.status(404).json({ message: "Marchand introuvable" });
      const aggs = await storage.getCryptoAggregatorsByMerchant(merchant.id);
      res.json({
        name: merchant.name,
        email: merchant.email,
        slug: merchant.slug,
        cryptoApiKey: merchant.cryptoApiKey || null,
        webhookUrl: merchant.webhookUrl || null,
        cryptoEnabled: aggs.length > 0,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ==================== PAYMENT PAGE (public) ====================
  // ─── Crypto : vérification activation crypto pour un marchand (public) ──────

  app.get("/api/public/crypto/check-merchant/:merchantSlug", async (req, res) => {
    try {
      const { merchantSlug } = req.params;
      const merchant = await storage.getMerchantBySlug(merchantSlug);
      if (!merchant || merchant.suspended) {
        return res.json({ enabled: false });
      }
      const aggs = await storage.getCryptoAggregatorsByMerchant(merchant.id);
      const enabled = aggs.length > 0;
      if (!enabled) return res.json({ enabled: false });
      const agg = aggs[0];
      const currencies = await oxapayGetCurrencies(agg.apiKey);
      res.json({
        enabled: true,
        merchantId: merchant.id,
        aggregatorId: agg.id,
        currencies: currencies.map(c => c.symbol),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Crypto : cryptos disponibles (public) ───────────────────────────────

  app.get("/api/public/crypto-currencies", async (req, res) => {
    try {
      const allAggs = await storage.getCryptoAggregators();
      const activeAgg = allAggs.find(a => a.active);
      if (!activeAgg) {
        return res.json([
          { symbol: "USDT", name: "Tether USD" },
          { symbol: "BTC", name: "Bitcoin" },
          { symbol: "ETH", name: "Ethereum" },
          { symbol: "LTC", name: "Litecoin" },
          { symbol: "TRX", name: "Tron" },
        ]);
      }
      const currencies = await oxapayGetCurrencies(activeAgg.apiKey);
      res.json(currencies);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/public/payment-methods/:country", async (req, res) => {
    try {
      const { country } = req.params;
      const type = (req.query.type as string) || "api";
      const ops = await storage.getWithdrawalOperators(country, true);
      const activeOps = ops.filter(op => {
        if (op.maintenanceAll) return false;
        if (op.maintenanceDeposits) return false;
        if (type === "link" && op.maintenancePaymentLinks) return false;
        if (type === "api" && op.maintenanceApiPayment) return false;
        return true;
      });
      res.json({ methods: activeOps.map(o => ({ name: o.name, logo: o.logo || null })) });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Public merchant info (for crypto payment link page) ───────────────────
  app.get("/api/merchant/public/:slug", async (req, res) => {
    try {
      const merchant = await storage.getMerchantBySlug(req.params.slug);
      if (!merchant || merchant.suspended) {
        return res.status(404).json({ message: "Marchand introuvable ou suspendu" });
      }
      res.json({ id: merchant.id, name: merchant.name, slug: merchant.slug });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Public: get crypto payment link details ─────────────────────────────
  app.get("/api/crypto-link/:uniqueId", async (req, res) => {
    try {
      const link = await storage.getCryptoPaymentLinkByUniqueId(req.params.uniqueId);
      if (!link || !link.active) {
        return res.status(404).json({ message: "Lien de paiement introuvable ou désactivé" });
      }
      const merchant = await storage.getMerchantById(link.merchantId);
      if (!merchant || merchant.suspended) {
        return res.status(404).json({ message: "Marchand introuvable ou suspendu" });
      }
      res.json({
        uniqueId: link.uniqueId,
        name: link.name,
        currency: link.currency,
        amountType: link.amountType,
        amount: link.amount,
        description: link.description,
        returnUrl: link.returnUrl,
        merchantName: merchant.name,
        merchantSlug: merchant.slug,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Public: pay via crypto link uniqueId (white label — no redirect) ────────
  app.post("/api/crypto-link/:uniqueId/pay", async (req, res) => {
    try {
      const link = await storage.getCryptoPaymentLinkByUniqueId(req.params.uniqueId);
      if (!link || !link.active) {
        return res.status(404).json({ message: "Lien de paiement introuvable ou désactivé" });
      }
      const merchant = await storage.getMerchantById(link.merchantId);
      if (!merchant || merchant.suspended) {
        return res.status(404).json({ message: "Marchand introuvable ou suspendu" });
      }
      const { customAmount, network } = req.body;
      const isLibre = link.amountType === "libre";
      const amountNum = isLibre ? Number(customAmount) : Number(link.amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({ message: "Montant invalide" });
      }
      const merchantAggs = await storage.getCryptoAggregatorsByMerchant(merchant.id);
      if (merchantAggs.length === 0) {
        return res.status(403).json({ message: "Le paiement crypto n'est pas activé pour ce marchand" });
      }
      const agg = merchantAggs[0];
      const callbackUrl = `${process.env.APP_URL || "https://westpay.cloud"}/api/oxapay/callback`;
      const XOF_PER_USD = parseInt(process.env.XOF_PER_USD || "600", 10);
      const currency = link.currency.toUpperCase();
      const isXof = currency === "XOF" || currency === "FCFA";
      const invoiceAmount = isXof ? parseFloat((amountNum / XOF_PER_USD).toFixed(2)) : amountNum;
      const invoiceCurrency = isXof ? "USDT" : currency;

      // Use white label to get wallet address immediately (no redirect to OxaPay)
      const wlResult = await oxapayCreateWhiteLabel(agg.apiKey, {
        amount: invoiceAmount,
        currency: invoiceCurrency,
        payCurrency: invoiceCurrency,
        lifeTime: 30,
        feePaidByPayer: 1,
        callbackUrl,
        ...(link.returnUrl && { returnUrl: link.returnUrl }),
        ...(link.description && { description: link.description }),
        orderId: link.uniqueId,
        ...(network && { network }),
      });

      if (wlResult.result !== 100 || !wlResult.trackId || !wlResult.address) {
        return res.status(502).json({ message: wlResult.message || "Échec de création du paiement" });
      }

      await storage.createCryptoTransaction({
        aggregatorId: agg.id,
        merchantId: merchant.id,
        trackId: wlResult.trackId,
        amount: String(amountNum),
        currency: currency,
        status: "pending",
        callbackUrl,
        ...(link.returnUrl && { returnUrl: link.returnUrl }),
        ...(link.description && { description: link.description }),
        orderId: link.uniqueId,
        walletAddress: wlResult.address,
        network: wlResult.network,
      });

      res.json({
        success: true,
        trackId: wlResult.trackId,
        address: wlResult.address,
        network: wlResult.network,
        payAmount: wlResult.payAmount,
        payCurrency: wlResult.payCurrency || currency,
        expiredAt: wlResult.expiredAt,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Merchant: create crypto payment link ────────────────────────────────
  app.post("/api/merchant/crypto-links", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const { name, currency, amountType, amount, description, returnUrl } = req.body;
      if (!name || !currency || !amountType) {
        return res.status(400).json({ message: "Nom, devise et type de montant requis" });
      }
      if (amountType === "fixed" && (!amount || Number(amount) <= 0)) {
        return res.status(400).json({ message: "Montant requis pour un lien à montant fixe" });
      }
      const uniqueId = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 6);
      const link = await storage.createCryptoPaymentLink({
        merchantId,
        uniqueId,
        name,
        currency: currency.toUpperCase(),
        amountType,
        amount: amountType === "fixed" ? String(amount) : null,
        description: description || null,
        returnUrl: returnUrl || null,
        active: true,
      });
      res.json({ success: true, link, url: `${process.env.APP_URL || "https://westpay.cloud"}/c/${uniqueId}` });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Merchant: list crypto payment links ─────────────────────────────────
  app.get("/api/merchant/crypto-links", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const links = await storage.getCryptoPaymentLinksByMerchant(merchantId);
      const BASE = process.env.APP_URL || "https://westpay.cloud";
      res.json(links.map(l => ({ ...l, url: `${BASE}/c/${l.uniqueId}` })));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Merchant: delete crypto payment link ─────────────────────────────────
  app.delete("/api/merchant/crypto-links/:id", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      await storage.deleteCryptoPaymentLink(Number(req.params.id), merchantId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Public crypto payment: create OxaPay invoice from slug link ───────────
  app.post("/api/pay-crypto/:slug", async (req, res) => {
    try {
      const merchant = await storage.getMerchantBySlug(req.params.slug);
      if (!merchant || merchant.suspended) {
        return res.status(404).json({ message: "Marchand introuvable ou suspendu" });
      }
      const { amount, currency, description, returnUrl } = req.body;
      if (!amount || !currency) {
        return res.status(400).json({ message: "Montant et devise requis" });
      }
      const amountNum = Number(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({ message: "Montant invalide" });
      }
      const merchantAggs = await storage.getCryptoAggregatorsByMerchant(merchant.id);
      if (merchantAggs.length === 0) {
        return res.status(403).json({ message: "Le paiement crypto n'est pas activé pour ce marchand" });
      }
      const agg = merchantAggs[0];
      const callbackUrl = `${process.env.APP_URL || "https://westpay.cloud"}/api/oxapay/callback`;
      const XOF_PER_USD = parseInt(process.env.XOF_PER_USD || "600", 10);
      const isXof = currency.toUpperCase() === "XOF" || currency.toUpperCase() === "FCFA";
      const invoiceAmount = isXof ? parseFloat((amountNum / XOF_PER_USD).toFixed(2)) : amountNum;
      const invoiceCurrency = isXof ? "USD" : currency.toUpperCase();
      const invoiceResult = await oxapayCreateInvoice(agg.apiKey, {
        amount: invoiceAmount,
        currency: invoiceCurrency,
        lifeTime: 30,
        feePaidByPayer: 1,
        callbackUrl,
        ...(returnUrl && { returnUrl }),
        ...(description && { description }),
      });
      if (invoiceResult.result !== 100 || !invoiceResult.trackId) {
        return res.status(502).json({ message: invoiceResult.message || "Échec de création de l'invoice" });
      }
      await storage.createCryptoTransaction({
        aggregatorId: agg.id,
        merchantId: merchant.id,
        trackId: invoiceResult.trackId,
        amount: String(amountNum),
        currency: currency.toUpperCase(),
        status: "pending",
        callbackUrl,
        ...(returnUrl && { returnUrl }),
        ...(description && { description }),
      });
      res.json({
        success: true,
        trackId: invoiceResult.trackId,
        paymentUrl: `${process.env.APP_URL || "https://westpay.cloud"}/pay/crypto/${invoiceResult.trackId}`,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

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
  app.post("/api/payment/initiate", paymentRateLimit, async (req, res) => {
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

      if (!payerPhone) {
        return res.status(400).json({ message: "Numero de telephone requis" });
      }

      const callbackBaseUrl = process.env.NODE_ENV === "production" ? "https://westpay.cloud" : `${req.protocol}://${req.get("host")}`;
      const dialCodes: Record<string, string> = {
        "Togo": "228", "Benin": "229", "Cote d'Ivoire": "225",
        "Senegal": "221", "Mali": "223", "Burkina Faso": "226",
        "Cameroun": "237", "Congo Brazzaville": "242", "Gabon": "241",
        "Congo RDC": "243", "Guinee": "224", "Gambie": "220",
      };
      const dialCode = dialCodes[country] || "";
      const cleanPhone = payerPhone.replace(/[\s\-\(\)\+]/g, "");
      // Certains pays utilisent un 0 comme préfixe national (ex: RDC 0981556946 → international 243981556946)
      const TRUNK_PREFIX_COUNTRIES = new Set(["Congo RDC", "Congo Brazzaville", "Gabon"]);
      const localPhone = (TRUNK_PREFIX_COUNTRIES.has(country) && cleanPhone.startsWith("0") && !cleanPhone.startsWith(dialCode))
        ? cleanPhone.slice(1)
        : cleanPhone;
      const msisdn = localPhone.startsWith(dialCode) ? localPhone : `${dialCode}${localPhone}`;

      const operatorRecord = await storage.getWithdrawalOperatorByNameAndCountry(paymentMethod, country);
      const gatewayLower = operatorRecord?.gateway?.toLowerCase();
      const useMbiyo = gatewayLower === "mbiyo";
      const useSendava = gatewayLower === "sendavapay";

      if (useSendava) {
        const sendavaApiKey = await getSendavaApiKey();
        if (!sendavaApiKey) {
          return res.status(500).json({ message: "Service de paiement non configure. Contactez l'administrateur." });
        }

        const reference = sendavaGenerateRef();
        const countryCode = SENDAVAPAY_COUNTRY_CODES[country] || "";
        const currency = SENDAVAPAY_CURRENCY_MAP[countryCode] || "XOF";
        const webhookUrl = `${callbackBaseUrl}/api/sendavapay/callback`;
        const customerRedirectUrl = redirectUrl
          ? `${callbackBaseUrl}/api/payment/sendavapay/return?ref=${reference}&redirect=${encodeURIComponent(redirectUrl)}`
          : `${callbackBaseUrl}/pay?ref=${reference}&sendava_status=complete`;

        try {
          const sendavaResult = await sendavaCreatePayment(sendavaApiKey, {
            amount: parsedAmount,
            currency,
            payerCountry: countryCode,
            customerName: payerName || undefined,
            customerPhone: msisdn || undefined,
            description: `Paiement WestPay - ${merchantSlug}`,
            redirectUrl: customerRedirectUrl,
            webhookUrl,
            externalReference: reference,
          });

          if (!sendavaResult.success || !sendavaResult.data?.paymentUrl) {
            const errorMsg = sendavaResult.message || "Erreur de paiement. Veuillez reessayer.";
            storage.createTransaction({
              merchantId: merchant.id,
              country,
              txId: reference,
              amount: parsedAmount,
              payerNumber: msisdn || null,
              payerName: payerName || null,
              status: "failed",
              provider: "westpay",
              omnipayTxId: null,
              operator: paymentMethod || null,
              omnipayReference: reference,
              errorMessage: errorMsg,
            }).catch(() => {});
            return res.status(400).json({ message: errorMsg });
          }

          const spReference = sendavaResult.data.reference || reference;
          const paymentUrl = sendavaResult.data.paymentUrl;

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
            omnipayReference: spReference,
            omnipayTxId: null,
            omnipayPaymentUrl: paymentUrl,
            gateway: "sendavapay",
            expiresAt,
          });

          await storage.createApiLog({
            merchantId: merchant.id,
            action: "sendavapay_payment_initiated",
            ip: req.ip || "",
            description: `Paiement SendavaPay initie - Ref: ${spReference} - Montant: ${parsedAmount} - Pays: ${countryCode} - URL: ${paymentUrl}`,
          });

          return res.json({
            success: true,
            paymentId: pending.id,
            sendavapay: true,
            omnipayReference: spReference,
            paymentUrl,
            fees: 0,
          });
        } catch (sendavaErr: any) {
          console.error("[SENDAVAPAY] Erreur initiation:", sendavaErr.message);
          return res.status(500).json({ message: "Erreur de connexion au service de paiement. Veuillez reessayer." });
        }
      } else if (useMbiyo) {
        const mbiyoApiKey = await getMbiyoApiKey();
        if (!mbiyoApiKey) {
          return res.status(500).json({ message: "Service de paiement non configure. Contactez l'administrateur." });
        }

        const reference = mbiyoGenerateRef();
        const countryCode = mbiyoCountryCode(country);
        const currency = mbiyoCurrency(country);
        const network = operatorRecord?.mbiyoCode || mbiyoNetwork(operator || paymentMethod);
        const callbackUrl = `${callbackBaseUrl}/api/mbiyo/callback`;
        const returnUrl = `${callbackBaseUrl}/pay?ref=${encodeURIComponent(reference)}&omnipay_status=complete`;

        try {
          const mbiyoResult = await mbiyoInitiatePayin({
            apiKey: mbiyoApiKey,
            amount: parsedAmount,
            currency,
            orderId: reference,
            callbackUrl,
            network,
            phoneNumber: msisdn,
            countryCode,
            otp: otp || undefined,
          });

          if (mbiyoResult.status !== "success" || !mbiyoResult.data) {
            const errorMsg = mbiyoResult.message || "Erreur de paiement. Veuillez reessayer.";
            storage.createTransaction({
              merchantId: merchant.id,
              country,
              txId: reference,
              amount: parsedAmount,
              payerNumber: msisdn || null,
              payerName: payerName || null,
              status: "failed",
              provider: "westpay",
              omnipayTxId: null,
              operator: operator || network || null,
              omnipayReference: reference,
              errorMessage: errorMsg,
            }).catch(() => {});
            return res.status(400).json({ message: errorMsg });
          }

          const paymentUrl = mbiyoResult.data.redirect_url || null;
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
            omnipayTxId: mbiyoResult.data.transaction_id,
            omnipayPaymentUrl: paymentUrl,
            gateway: "westpay",
            expiresAt,
          });

          await storage.createApiLog({
            merchantId: merchant.id,
            action: "mbiyo_payment_initiated",
            ip: req.ip || "",
            description: `Paiement Mbiyo initie - Ref: ${reference} - TxID: ${mbiyoResult.data.transaction_id} - Montant: ${parsedAmount}`,
          });

          res.json({
            success: true,
            paymentId: pending.id,
            omnipay: true,
            omnipayReference: reference,
            paymentUrl: paymentUrl || (network === "wave" ? returnUrl : null),
            fees: mbiyoResult.data.fee || 0,
          });
        } catch (mbiyoErr: any) {
          console.error("[MBIYO] Erreur initiation:", mbiyoErr.message);
          return res.status(500).json({ message: "Erreur de connexion au service de paiement. Veuillez reessayer." });
        }
      } else {
        const omnipayApiKey = await getOmnipayApiKey();
        if (!omnipayApiKey) {
          return res.status(500).json({ message: "Systeme de paiement non configure. Contactez l'administrateur." });
        }

        const reference = omnipayGenerateRef();
        const nameParts = (payerName || "Client WestPay").split(" ");
        const fName = firstName || nameParts[0] || "Client";
        const lName = lastName || nameParts.slice(1).join(" ") || "WestPay";
        const omnipayOperator = toOmnipayOperatorCode(operator) || (paymentMethod.toLowerCase().includes("wave") ? "wave" : paymentMethod.toLowerCase().includes("mixx") || paymentMethod.toLowerCase().includes("yas") ? "mixx" : undefined);
        const returnUrl = `${callbackBaseUrl}/pay?ref=${encodeURIComponent(reference)}&omnipay_status=complete`;
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
            storage.createTransaction({
              merchantId: merchant.id,
              country,
              txId: reference,
              amount: parsedAmount,
              payerNumber: msisdn || null,
              payerName: payerName || null,
              status: "failed",
              provider: "westpay",
              omnipayTxId: null,
              operator: operator || omnipayOperator || null,
              omnipayReference: reference,
              errorMessage: errorMsg,
            }).catch(() => {});
            return res.status(400).json({ message: errorMsg, paymentError: true, code: omnipayResult.code });
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
            gateway: "westpay",
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

  // ─── Récupérer un paiement en attente par référence OmniPay (public) ──────

  app.get("/api/payment/by-ref/:reference", async (req, res) => {
    try {
      const { reference } = req.params;
      const pending = await storage.getPendingPaymentByOmnipayReference(reference);
      if (!pending) return res.status(404).json({ message: "Paiement introuvable" });
      const merchant = await storage.getMerchantById(pending.merchantId);
      res.json({
        merchantSlug: merchant?.slug || "",
        merchantName: merchant?.name || "",
        amount: pending.amount,
        country: pending.country,
        redirectUrl: pending.redirectUrl || null,
        status: pending.status,
        omnipayReference: pending.omnipayReference,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
        const withdrawal = await storage.getWithdrawalByOmnipayRef(payload.reference);
        if (withdrawal) {
          console.log(`[OMNIPAY CALLBACK] Retrait ref=${payload.reference} statut OmniPay=${payload.status} statut local=${withdrawal.status}`);

          if (withdrawal.status === "approved" || withdrawal.status === "rejected" || withdrawal.status === "failed") {
            return res.json({ status: "already_processed" });
          }

          const wdStatusNum = parseInt(payload.status);
          const wdMerchant = await storage.getMerchantById(withdrawal.merchantId);

          if (wdStatusNum === OMNIPAY_STATUS.SUCCESS) {
            const wdFees = payload.fees ? parseInt(payload.fees) : undefined;
            await storage.updateWithdrawalStatus(
              withdrawal.id,
              "approved",
              `Retrait confirmé${wdFees !== undefined ? ` - Frais: ${wdFees} F` : ""}`,
              payload.reference,
              wdFees,
              wdFees,
            );
            notifyAdminWithdrawal({ id: withdrawal.id, merchantName: wdMerchant?.name || `#${withdrawal.merchantId}`, country: withdrawal.country, amount: withdrawal.amount, fees: wdFees || 0, phone: withdrawal.phone, operator: withdrawal.operator, status: "approved", mode: withdrawal.withdrawalMode }).catch(() => {});
            notifyMerchantWithdrawal(withdrawal.merchantId, { id: withdrawal.id, country: withdrawal.country, amount: withdrawal.amount, fees: wdFees || 0, phone: withdrawal.phone, operator: withdrawal.operator, status: "approved" }).catch(() => {});
            console.log(`[OMNIPAY CALLBACK] Retrait #${withdrawal.id} approuvé - ref=${payload.reference}`);
            return res.json({ status: "approved" });

          } else if (wdStatusNum === OMNIPAY_STATUS.FAILED) {
            await storage.updateWithdrawalStatus(
              withdrawal.id,
              "failed",
              `Retrait échoué: ${payload.message || "Echec opérateur"}`,
              payload.reference,
            );
            await storage.incrementMerchantCountryBalance(withdrawal.merchantCountryId, withdrawal.amount);
            notifyAdminWithdrawal({ id: withdrawal.id, merchantName: wdMerchant?.name || `#${withdrawal.merchantId}`, country: withdrawal.country, amount: withdrawal.amount, fees: 0, phone: withdrawal.phone, operator: withdrawal.operator, status: "failed", mode: withdrawal.withdrawalMode }).catch(() => {});
            notifyMerchantWithdrawal(withdrawal.merchantId, { id: withdrawal.id, country: withdrawal.country, amount: withdrawal.amount, fees: 0, phone: withdrawal.phone, operator: withdrawal.operator, status: "failed" }).catch(() => {});
            console.log(`[OMNIPAY CALLBACK] Retrait #${withdrawal.id} échoué - ref=${payload.reference} - ${payload.message}`);
            return res.json({ status: "failed" });

          } else {
            console.log(`[OMNIPAY CALLBACK] Retrait #${withdrawal.id} toujours en cours (OmniPay status=${wdStatusNum})`);
            return res.json({ status: "pending", providerStatus: wdStatusNum });
          }
        }
        const txByRef = await storage.getTransactionByTxId(payload.reference);
        if (txByRef) {
          console.log(`[OMNIPAY CALLBACK] Transfert connu ref=${payload.reference}`);
          return res.json({ status: "acknowledged" });
        }
        console.log(`[OMNIPAY CALLBACK] Reference inconnue: ${payload.reference}`);
        return res.json({ status: "unknown" });
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

        // ── IDEMPOTENCE ATOMIQUE : Compare-And-Swap sur le statut ─────────────
        // On ne passe à "omnipay_confirmed" QUE si le statut est encore "pending".
        // Si deux callbacks arrivent simultanément, un seul UPDATE réussira.
        const casResult = await pool.query(
          `UPDATE pending_payments SET status = 'omnipay_confirmed'
           WHERE id = $1 AND status NOT IN ('confirmed','omnipay_confirmed','omnipay_error')
           RETURNING id`,
          [pending.id]
        );
        if (!casResult.rowCount || casResult.rowCount === 0) {
          console.log(`[OMNIPAY CALLBACK] Déjà traité (CAS) ref=${payload.reference}`);
          return res.json({ status: "already_processed" });
        }

        {
          const txId = `OP-${payload.id || payload.reference}`;

          const existingTx = await storage.getTransactionByTxId(txId);
          if (!existingTx) {
            const payerFullName = [payload.first_name, payload.last_name].filter(Boolean).join(" ") || pending.payerName || null;
            const merchantCredit1 = merchant?.feeExempt ? pending.amount : calcMerchantCredit(pending.amount, pending.country);
            await storage.createTransaction({
              merchantId: pending.merchantId,
              country: pending.country,
              txId,
              amount: pending.amount,
              payerNumber: payload.msisdn || pending.payerPhone || null,
              payerName: payerFullName,
              status: "confirmed",
              provider: "westpay",
              omnipayTxId: payload.id || null,
              omnipayReference: pending.omnipayReference || payload.reference || null,
              providerFee: payload.fees != null ? parseInt(String(payload.fees)) || 0 : 0,
            });

            await storage.incrementMerchantCountryBalance(merchantCountry.id, merchantCredit1);

            console.log(`[OMNIPAY CALLBACK] Paiement confirme: ${txId} - Brut: ${pending.amount} - Net marchand: ${merchantCredit1} - Marchand #${pending.merchantId}`);

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
                provider: "westpay",
                omnipayReference: payload.reference,
                timestamp: new Date().toISOString(),
              }).catch(err => console.error("[WEBHOOK] Erreur async:", err));
            }

            notifyMerchantPayment(pending.merchantId, {
              txId,
              amount: pending.amount,
              payerNumber: payload.msisdn || pending.payerPhone,
              country: pending.country,
              provider: "westpay",
            }).catch(() => {});

            notifyAdminPayment({
              txId,
              merchantName: merchant?.name || `#${pending.merchantId}`,
              payerNumber: payload.msisdn || pending.payerPhone,
              country: pending.country,
              amount: pending.amount,
              provider: "westpay",
              status: "confirmed",
            }).catch(() => {});
          }
        }

        res.json({ status: "confirmed" });
      } else if (statusNum === OMNIPAY_STATUS.FAILED) {
        await storage.updatePendingPaymentStatus(pending.id, "omnipay_failed");

        const failedRef = payload.reference || pending.omnipayReference || `FAIL-${Date.now()}-${pending.id}`;
        const failErrorMsg = payload.message || "Paiement refusé par l'opérateur";
        storage.createTransaction({
          merchantId: pending.merchantId,
          country: pending.country,
          txId: failedRef,
          amount: pending.amount,
          payerNumber: payload.msisdn || pending.payerPhone || null,
          payerName: pending.payerName || null,
          status: "failed",
          provider: "westpay",
          omnipayTxId: payload.id ? String(payload.id) : null,
          operator: null,
          omnipayReference: failedRef,
          errorMessage: failErrorMsg,
        }).catch(() => {});

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
        res.json({ status: "pending", providerStatus: statusNum });
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
        if (pending.gateway === "mbiyo" && pending.omnipayTxId) {
          const mbiyoApiKey = await getMbiyoApiKey();
          if (mbiyoApiKey) {
            try {
              const statusResult = await mbiyoGetStatus(mbiyoApiKey, pending.omnipayTxId);
              if (statusResult.status === "success" && statusResult.data) {
                const s = statusResult.data.status;
                const isSuccess = s === "successful";
                const isFailure = s === "failed" || s === "cancelled";

                if (isSuccess) {
                  const mc = await storage.findMerchantCountryBySimAndCountry(pending.merchantId, pending.country);
                  const merchant = await storage.getMerchantById(pending.merchantId);
                  if (mc) {
                    const credit = merchant?.feeExempt ? pending.amount : calcMerchantCredit(pending.amount, pending.country);
                    await storage.incrementMerchantCountryBalance(mc.id, credit);
                    await storage.updatePendingPaymentStatus(pending.id, "omnipay_confirmed");
                    const txRef = statusResult.data.transaction_id || pending.omnipayReference;
                    const existingTx = await storage.getTransactionByTxId(txRef);
                    if (!existingTx) {
                      await storage.createTransaction({
                        merchantId: pending.merchantId,
                        country: pending.country,
                        txId: txRef,
                        amount: pending.amount,
                        payerNumber: pending.payerPhone || null,
                        payerName: pending.payerName || null,
                        status: "confirmed",
                        provider: "westpay",
                        omnipayTxId: statusResult.data.transaction_id || null,
                        operator: pending.paymentMethod || null,
                        omnipayReference: pending.omnipayReference,
                        errorMessage: null,
                        providerFee: statusResult.data.fee != null ? parseInt(String(statusResult.data.fee)) || 0 : 0,
                      });
                    }
                    console.log(`[POLL MBIYO] Paiement credite via polling — ref=${pending.omnipayReference} montant=${pending.amount} credit=${credit} marchand=#${pending.merchantId}`);
                    if (merchant?.webhookUrl) {
                      try {
                        const fetch2 = (await import("node-fetch")).default;
                        const wp = { event: "payment.confirmed", txId: txRef, amount: pending.amount, country: pending.country, payerNumber: pending.payerPhone, payerName: pending.payerName, status: "confirmed", reference: pending.omnipayReference, provider: "westpay" };
                        const hmac = crypto.createHmac("sha256", merchant.webhookSecret || "").update(JSON.stringify(wp)).digest("hex");
                        await fetch2(merchant.webhookUrl, { method: "POST", headers: { "Content-Type": "application/json", "X-Signature": hmac }, body: JSON.stringify(wp) });
                      } catch {}
                    }
                    notifyMerchantPayment(pending.merchantId, { txId: txRef, amount: pending.amount, payerNumber: pending.payerPhone, country: pending.country, provider: "westpay" }).catch(() => {});
                    notifyAdminPayment({ txId: txRef, merchantName: merchant?.name || `#${pending.merchantId}`, payerNumber: pending.payerPhone, country: pending.country, amount: pending.amount, provider: "westpay", status: "confirmed" }).catch(() => {});
                  } else {
                    console.error(`[POLL MBIYO] MerchantCountry introuvable pour merchantId=${pending.merchantId} country="${pending.country}"`);
                  }
                  return res.json({ status: "confirmed", paymentId: pending.id });
                }

                if (isFailure) {
                  await storage.updatePendingPaymentStatus(pending.id, "omnipay_failed");
                  return res.json({ status: "failed", paymentId: pending.id });
                }

                return res.json({ status: "pending", paymentId: pending.id });
              }
            } catch {}
          }
        } else if (pending.gateway === "sendavapay") {
          const sendavaKey = await getSendavaApiKey();
          if (sendavaKey) {
            try {
              const statusResult = await sendavaVerifyPayment(sendavaKey, pending.omnipayReference);
              const spStatus = (statusResult.data?.status || "").toLowerCase();
              const spSuccess = ["completed", "paid", "successful", "success", "approved"].includes(spStatus);
              const spFailed = ["failed", "failure", "cancelled", "canceled", "rejected"].includes(spStatus);

              if (spSuccess) {
                const mc = await storage.findMerchantCountryBySimAndCountry(pending.merchantId, pending.country);
                const merchant = await storage.getMerchantById(pending.merchantId);
                if (mc) {
                  const credit = merchant?.feeExempt ? pending.amount : calcMerchantCredit(pending.amount, pending.country);
                  await storage.updatePendingPaymentStatus(pending.id, "omnipay_confirmed");
                  const txRef = `SP-${pending.omnipayReference}`;
                  const existingTx = await storage.getTransactionByTxId(txRef);
                  if (!existingTx) {
                    await storage.incrementMerchantCountryBalance(mc.id, credit);
                    await storage.createTransaction({
                      merchantId: pending.merchantId,
                      country: pending.country,
                      txId: txRef,
                      amount: pending.amount,
                      payerNumber: pending.payerPhone || null,
                      payerName: pending.payerName || null,
                      status: "confirmed",
                      provider: "westpay",
                      omnipayTxId: null,
                      operator: pending.paymentMethod || null,
                      omnipayReference: pending.omnipayReference,
                      errorMessage: null,
                      providerFee: 0,
                    });
                    console.log(`[POLL SENDAVAPAY] Paiement credite via polling — ref=${pending.omnipayReference} montant=${pending.amount} credit=${credit}`);
                    notifyMerchantPayment(pending.merchantId, { txId: txRef, amount: pending.amount, payerNumber: pending.payerPhone, country: pending.country, provider: "westpay" }).catch(() => {});
                    notifyAdminPayment({ txId: txRef, merchantName: merchant?.name || `#${pending.merchantId}`, payerNumber: pending.payerPhone, country: pending.country, amount: pending.amount, provider: "westpay", status: "confirmed" }).catch(() => {});
                  }
                }
                return res.json({ status: "confirmed", paymentId: pending.id });
              }

              if (spFailed) {
                await storage.updatePendingPaymentStatus(pending.id, "omnipay_failed");
                return res.json({ status: "failed", paymentId: pending.id });
              }

              return res.json({ status: "pending", paymentId: pending.id });
            } catch {}
          }
        } else {
          const omnipayApiKey = await getOmnipayApiKey();
          if (omnipayApiKey) {
            try {
              const statusResult = await omnipayGetStatus(omnipayApiKey, pending.omnipayReference);
              if (statusResult.success === 1) {
                return res.json({ status: "pending", paymentId: pending.id, providerStatus: statusResult.status });
              }
            } catch {}
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

  // ==================== MBIYO ROUTES ====================

  app.post("/api/mbiyo/callback", async (req, res) => {
    try {
      const rawBody = (req.rawBody as Buffer)?.toString() || JSON.stringify(req.body);
      const signature = (
        req.headers["x-signature"] ||
        req.headers["signature"] ||
        req.headers["x-mbiyo-signature"] ||
        req.headers["x-webhook-signature"] ||
        ""
      ) as string;
      const webhookSecret = await getMbiyoWebhookSecret();

      console.log(`[MBIYO CALLBACK] Headers: ${JSON.stringify(req.headers)}`);
      console.log(`[MBIYO CALLBACK] Body: ${rawBody}`);

      if (webhookSecret) {
        const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
        console.log(`[MBIYO CALLBACK] Signature recue: ${signature} — attendue: ${expected}`);
        const isValid = mbiyoVerifySignature(webhookSecret, signature, rawBody);
        if (!isValid) {
          console.error(`[MBIYO CALLBACK] Signature invalide — recue: ${signature} — attendue: ${expected}`);
          return res.status(401).json({ message: "Signature invalide" });
        }
      } else {
        console.log(`[MBIYO CALLBACK] Signature recue: ${signature} (verification ignoree — secret non configure)`);
      }

      const payload = req.body as MbiyoWebhookPayload;
      console.log(`[MBIYO CALLBACK] Recu: order_id=${payload.order_id} status=${payload.status}`);

      if (!payload.order_id) {
        return res.status(400).json({ message: "order_id manquant" });
      }

      const pending = await storage.getPendingPaymentByOmnipayReference(payload.order_id);
      if (!pending) {
        console.warn(`[MBIYO CALLBACK] Paiement non trouve: ${payload.order_id}`);
        return res.status(200).json({ received: true });
      }

      if (pending.status === "omnipay_confirmed" || pending.status === "omnipay_failed") {
        return res.json({ status: "already_processed" });
      }

      const statusLower = (payload.status || "").toLowerCase();
      const isSuccess = ["successful", "success", "paid", "completed"].includes(statusLower);
      const isFailure = ["failed", "failure", "cancelled", "canceled", "rejected"].includes(statusLower);

      if (isSuccess) {
        const merchant = await storage.getMerchantById(pending.merchantId);
        const credit = merchant?.feeExempt ? pending.amount : calcMerchantCredit(pending.amount, pending.country);

        const mc = await storage.findMerchantCountryBySimAndCountry(pending.merchantId, pending.country);
        if (!mc) {
          console.error(`[MBIYO CALLBACK] CRITIQUE: MerchantCountry introuvable pour merchantId=${pending.merchantId} country="${pending.country}" — solde non credite, callback rejete pour retry`);
          return res.status(500).json({ message: "MerchantCountry introuvable — réessayez" });
        }

        await storage.incrementMerchantCountryBalance(mc.id, credit);
        await storage.updatePendingPaymentStatus(pending.id, "omnipay_confirmed");

        const txRef = payload.transaction_id || payload.order_id;
        const tx = await storage.createTransaction({
          merchantId: pending.merchantId,
          country: pending.country,
          txId: txRef,
          amount: pending.amount,
          payerNumber: pending.payerPhone || null,
          payerName: pending.payerName || null,
          status: "confirmed",
          provider: "westpay",
          omnipayTxId: payload.transaction_id || null,
          operator: pending.paymentMethod || null,
          omnipayReference: payload.order_id,
          errorMessage: null,
          providerFee: payload.fee != null ? parseInt(String(payload.fee)) || 0 : 0,
        });

        console.log(`[MBIYO CALLBACK] Paiement confirme: ${payload.order_id}`);
        res.json({ status: "confirmed" });

        setImmediate(async () => {
          try {
            if (merchant?.webhookUrl) {
              try {
                const fetch = (await import("node-fetch")).default;
                const webhookPayload = {
                  event: "payment.confirmed",
                  txId: tx.txId,
                  amount: tx.amount,
                  country: tx.country,
                  payerNumber: tx.payerNumber,
                  payerName: tx.payerName,
                  status: "confirmed",
                  reference: payload.order_id,
                  provider: "westpay",
                };
                const hmac = crypto.createHmac("sha256", merchant.webhookSecret || "").update(JSON.stringify(webhookPayload)).digest("hex");
                await fetch(merchant.webhookUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "X-Signature": hmac },
                  body: JSON.stringify(webhookPayload),
                });
              } catch {}
            }
            if (merchant) {
              notifyMerchantPayment(pending.merchantId, { txId: tx.txId || txRef, amount: pending.amount, payerNumber: pending.payerPhone, country: pending.country, provider: "westpay" }).catch(() => {});
              notifyAdminPayment({ txId: tx.txId || txRef, merchantName: merchant.name, payerNumber: pending.payerPhone, country: pending.country, amount: pending.amount, provider: "westpay", status: "confirmed" }).catch(() => {});
            }
          } catch {}
        });
        return;
      } else if (isFailure) {
        await storage.updatePendingPaymentStatus(pending.id, "omnipay_failed");
        storage.createTransaction({
          merchantId: pending.merchantId,
          country: pending.country,
          txId: payload.order_id,
          amount: pending.amount,
          payerNumber: pending.payerPhone || null,
          payerName: pending.payerName || null,
          status: "failed",
          provider: "westpay",
          omnipayTxId: payload.transaction_id || null,
          operator: pending.paymentMethod || null,
          omnipayReference: payload.order_id,
          errorMessage: "Paiement refusé ou annulé",
        }).catch(() => {});
        console.log(`[MBIYO CALLBACK] Paiement echoue: ${payload.order_id}`);
        return res.json({ status: "failed" });
      }

      res.json({ received: true });
    } catch (err: any) {
      console.error("[MBIYO CALLBACK] Erreur:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/mbiyo/payout-callback", async (req, res) => {
    try {
      const rawBody = (req.rawBody as Buffer)?.toString() || JSON.stringify(req.body);
      const signature = (
        req.headers["x-signature"] ||
        req.headers["signature"] ||
        req.headers["x-mbiyo-signature"] ||
        req.headers["x-webhook-signature"] ||
        ""
      ) as string;
      const webhookSecret = await getMbiyoWebhookSecret();

      console.log(`[MBIYO PAYOUT CALLBACK] Headers: ${JSON.stringify(req.headers)}`);
      console.log(`[MBIYO PAYOUT CALLBACK] Body: ${rawBody}`);

      if (webhookSecret) {
        const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
        console.log(`[MBIYO PAYOUT CALLBACK] Signature recue: ${signature} — attendue: ${expected}`);
        const isValid = mbiyoVerifySignature(webhookSecret, signature, rawBody);
        if (!isValid) {
          console.error(`[MBIYO PAYOUT CALLBACK] Signature invalide — recue: ${signature} — attendue: ${expected}`);
          return res.status(401).json({ message: "Signature invalide" });
        }
      } else {
        console.log(`[MBIYO PAYOUT CALLBACK] Signature recue: ${signature} (verification ignoree — secret non configure)`);
      }

      const payload = req.body as MbiyoPayoutWebhookPayload;
      console.log(`[MBIYO PAYOUT CALLBACK] Recu: event=${payload.event} order_id=${payload.order_id} status=${payload.status}`);

      if (!payload.order_id) {
        return res.status(400).json({ message: "order_id manquant" });
      }

      const withdrawal = await storage.getWithdrawalByOmnipayRef(payload.order_id);
      if (!withdrawal) {
        console.warn(`[MBIYO PAYOUT CALLBACK] Retrait non trouve: ${payload.order_id}`);
        return res.status(200).json({ received: true });
      }

      if (withdrawal.status === "approved" || withdrawal.status === "rejected") {
        return res.json({ status: "already_processed" });
      }

      const wdFees = Math.round(parseFloat(String(payload.fee || 0)) || 0);
      const wdStatusLower = (payload.status || "").toLowerCase();
      const wdIsSuccess = ["successful", "success", "paid", "completed"].includes(wdStatusLower);
      const wdIsFailure = ["failed", "failure", "cancelled", "canceled", "rejected"].includes(wdStatusLower);

      // ── Protection anti-race-condition : mise à jour atomique ─────────────────
      // Si deux callbacks Mbiyo arrivent simultanément, un seul peut passer cette
      // clause WHERE status = 'pending'. L'autre recevra 0 lignes et sera ignoré.
      if (wdIsSuccess || wdIsFailure) {
        const newStatus = wdIsSuccess ? "approved" : "failed";
        const locked = await pool.query(
          `UPDATE withdrawals SET status = $1 WHERE id = $2 AND status = 'pending' RETURNING id`,
          [newStatus, withdrawal.id]
        );
        if (locked.rowCount === 0) {
          console.log(`[MBIYO PAYOUT CALLBACK] Retrait #${withdrawal.id} déjà traité (race condition évitée)`);
          return res.json({ status: "already_processed" });
        }
        // Le verrou est acquis — continuer le traitement normalement
        // (updateWithdrawalStatus mettra à jour les champs supplémentaires)
      }

      const wdMerchant = await storage.getMerchantById(withdrawal.merchantId);

      // Reconciliation : retrait marqué failed chez nous mais confirmé par Mbiyo
      if (withdrawal.status === "failed" && wdIsSuccess) {
        const mc = await storage.getMerchantCountryById(withdrawal.merchantCountryId);
        if (mc) await storage.decrementMerchantCountryBalance(mc.id, withdrawal.amount);
        await storage.updateWithdrawalStatus(withdrawal.id, "approved", `Transfert Mbiyo confirme (reconciliation automatique)`, payload.order_id, wdFees, wdFees);
        console.log(`[MBIYO PAYOUT CALLBACK] Reconciliation retrait #${withdrawal.id} — redebit balance ${withdrawal.amount}`);
        res.json({ status: "reconciled" });
        setImmediate(() => {
          notifyAdminWithdrawal({ id: withdrawal.id, merchantName: wdMerchant?.name || `#${withdrawal.merchantId}`, country: withdrawal.country, amount: withdrawal.amount, fees: wdFees, phone: withdrawal.phone, operator: withdrawal.operator, status: "approved", mode: withdrawal.withdrawalMode }).catch(() => {});
          notifyMerchantWithdrawal(withdrawal.merchantId, { id: withdrawal.id, country: withdrawal.country, amount: withdrawal.amount, fees: wdFees, phone: withdrawal.phone, operator: withdrawal.operator, status: "approved" }).catch(() => {});
        });
        return;
      }

      if (withdrawal.status === "failed") {
        return res.json({ status: "already_processed" });
      }

      if (wdIsSuccess) {
        await storage.updateWithdrawalStatus(withdrawal.id, "approved", `Transfert Mbiyo confirme`, payload.order_id, wdFees, wdFees);
        console.log(`[MBIYO PAYOUT CALLBACK] Retrait #${withdrawal.id} approuve - ref=${payload.order_id}`);
        res.json({ status: "approved" });
        setImmediate(() => {
          notifyAdminWithdrawal({ id: withdrawal.id, merchantName: wdMerchant?.name || `#${withdrawal.merchantId}`, country: withdrawal.country, amount: withdrawal.amount, fees: wdFees, phone: withdrawal.phone, operator: withdrawal.operator, status: "approved", mode: withdrawal.withdrawalMode }).catch(() => {});
          notifyMerchantWithdrawal(withdrawal.merchantId, { id: withdrawal.id, country: withdrawal.country, amount: withdrawal.amount, fees: wdFees, phone: withdrawal.phone, operator: withdrawal.operator, status: "approved" }).catch(() => {});
        });
        return;
      } else if (wdIsFailure) {
        await storage.updateWithdrawalStatus(withdrawal.id, "failed", `Transfert Mbiyo echoue - statut: ${payload.status}`, payload.order_id);
        const mc = await storage.getMerchantCountryById(withdrawal.merchantCountryId);
        if (mc) await storage.incrementMerchantCountryBalance(mc.id, withdrawal.amount);
        console.log(`[MBIYO PAYOUT CALLBACK] Retrait #${withdrawal.id} echoue - ref=${payload.order_id}`);
        res.json({ status: "failed" });
        setImmediate(() => {
          notifyAdminWithdrawal({ id: withdrawal.id, merchantName: wdMerchant?.name || `#${withdrawal.merchantId}`, country: withdrawal.country, amount: withdrawal.amount, fees: 0, phone: withdrawal.phone, operator: withdrawal.operator, status: "failed", mode: withdrawal.withdrawalMode }).catch(() => {});
          notifyMerchantWithdrawal(withdrawal.merchantId, { id: withdrawal.id, country: withdrawal.country, amount: withdrawal.amount, fees: 0, phone: withdrawal.phone, operator: withdrawal.operator, status: "failed" }).catch(() => {});
        });
        return;
      }

      res.json({ received: true });
    } catch (err: any) {
      console.error("[MBIYO PAYOUT CALLBACK] Erreur:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/mbiyo/settings", authMiddleware("admin"), async (_req, res) => {
    try {
      const apiKey = await getMbiyoApiKey();
      const webhookSecret = await getMbiyoWebhookSecret();
      res.json({
        apiKey: apiKey || "",
        webhookSecret: webhookSecret || "",
        configured: !!apiKey,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/mbiyo/settings", authMiddleware("admin"), async (req, res) => {
    try {
      const { apiKey, webhookSecret } = req.body;
      if (apiKey !== undefined) await storage.setSetting("mbiyo_api_key", apiKey);
      if (webhookSecret !== undefined) await storage.setSetting("mbiyo_webhook_secret", webhookSecret);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ==================== SENDAVAPAY ROUTES ====================

  app.post("/api/sendavapay/callback", async (req, res) => {
    try {
      const rawBody = (req.rawBody as Buffer)?.toString() || JSON.stringify(req.body);
      const signature = (req.headers["x-sendavapay-signature"] || "") as string;

      console.log(`[SENDAVAPAY CALLBACK] Headers: ${JSON.stringify(req.headers)}`);
      console.log(`[SENDAVAPAY CALLBACK] Body: ${rawBody}`);

      const webhookSecret = await getSendavaWebhookSecret();
      if (webhookSecret && signature) {
        const isValid = sendavaVerifySignature(webhookSecret, signature, rawBody);
        if (!isValid) {
          console.error(`[SENDAVAPAY CALLBACK] Signature invalide`);
          return res.status(401).json({ message: "Signature invalide" });
        }
      }

      const payload = req.body as SendavaWebhookPayload;
      const reference = payload.reference;
      console.log(`[SENDAVAPAY CALLBACK] Recu: event=${payload.event} ref=${reference} status=${payload.status}`);

      if (!reference) {
        return res.status(400).json({ message: "reference manquante" });
      }

      const pending = await storage.getPendingPaymentByOmnipayReference(reference);
      if (!pending) {
        console.warn(`[SENDAVAPAY CALLBACK] Paiement non trouve: ${reference}`);
        return res.status(200).json({ received: true });
      }

      if (pending.status === "omnipay_confirmed" || pending.status === "omnipay_failed") {
        return res.json({ status: "already_processed" });
      }

      const statusLower = (payload.status || "").toLowerCase();
      const eventLower = (payload.event || "").toLowerCase();
      const isSuccess = statusLower === "completed" || eventLower === "payment.completed";
      const isFailure = ["failed", "failure", "cancelled", "canceled", "rejected"].includes(statusLower);

      if (isSuccess) {
        const merchant = await storage.getMerchantById(pending.merchantId);
        const mc = await storage.findMerchantCountryBySimAndCountry(pending.merchantId, pending.country);

        if (!mc) {
          console.error(`[SENDAVAPAY CALLBACK] MerchantCountry introuvable pour marchand #${pending.merchantId} pays ${pending.country}`);
          await storage.updatePendingPaymentStatus(pending.id, "omnipay_error");
          return res.status(500).json({ message: "Configuration marchand/pays introuvable" });
        }

        await storage.updatePendingPaymentStatus(pending.id, "omnipay_confirmed");

        const txId = `SP-${reference}`;
        const existingTx = await storage.getTransactionByTxId(txId);
        if (!existingTx) {
          const credit = merchant?.feeExempt ? pending.amount : calcMerchantCredit(pending.amount, pending.country);
          await storage.createTransaction({
            merchantId: pending.merchantId,
            country: pending.country,
            txId,
            amount: pending.amount,
            payerNumber: payload.customerPhone || pending.payerPhone || null,
            payerName: pending.payerName || null,
            status: "confirmed",
            provider: "westpay",
            omnipayTxId: null,
            omnipayReference: pending.omnipayReference || reference,
            providerFee: 0,
          });
          await storage.incrementMerchantCountryBalance(mc.id, credit);
          console.log(`[SENDAVAPAY CALLBACK] Paiement confirme: ${txId} - Brut: ${pending.amount} - Net marchand: ${credit}`);

          sendWebhookNotification(pending.merchantId, {
            event: "payment.confirmed",
            txId,
            amount: pending.amount,
            currency: pending.country,
            payer: payload.customerPhone || pending.payerPhone,
            country: pending.country,
            merchantSlug: merchant?.slug || "",
            provider: "westpay",
            timestamp: new Date().toISOString(),
          }).catch(() => {});

          notifyMerchantPayment(pending.merchantId, { txId, amount: pending.amount, payerNumber: payload.customerPhone || pending.payerPhone, country: pending.country, provider: "westpay" }).catch(() => {});
          notifyAdminPayment({ txId, merchantName: merchant?.name || `#${pending.merchantId}`, payerNumber: payload.customerPhone || pending.payerPhone, country: pending.country, amount: pending.amount, provider: "westpay", status: "confirmed" }).catch(() => {});
        }

        return res.json({ status: "confirmed" });

      } else if (isFailure) {
        await storage.updatePendingPaymentStatus(pending.id, "omnipay_failed");
        console.log(`[SENDAVAPAY CALLBACK] Paiement echoue: ref=${reference} status=${payload.status}`);
        return res.json({ status: "failed" });

      } else {
        console.log(`[SENDAVAPAY CALLBACK] Paiement en cours: ref=${reference} status=${payload.status}`);
        return res.json({ status: "pending" });
      }
    } catch (err: any) {
      console.error("[SENDAVAPAY CALLBACK] Erreur:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/payment/sendavapay/return", async (req, res) => {
    try {
      const { ref, redirect, sendava_status } = req.query as Record<string, string>;
      const status = sendava_status || "complete";
      if (redirect) {
        const safe = /^https?:\/\//i.test(redirect) ? redirect : `https://${redirect}`;
        try {
          const u = new URL(safe);
          if (ref) u.searchParams.set("ref", ref);
          u.searchParams.set("sendava_status", status);
          return res.redirect(u.toString());
        } catch {}
      }
      const target = ref ? `/pay?ref=${encodeURIComponent(ref)}&sendava_status=${status}` : `/`;
      res.redirect(target);
    } catch (err: any) {
      res.redirect("/");
    }
  });

  app.get("/api/admin/sendavapay/settings", authMiddleware("admin"), async (_req, res) => {
    try {
      const apiKey = await getSendavaApiKey();
      const webhookSecret = await getSendavaWebhookSecret();
      res.json({
        apiKey: apiKey || "",
        webhookSecret: webhookSecret ? "configured" : "",
        configured: !!apiKey,
        callbackUrl: "https://westpay.cloud/api/sendavapay/callback",
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/sendavapay/settings", authMiddleware("admin"), async (req, res) => {
    try {
      const { apiKey, webhookSecret } = req.body;
      if (apiKey !== undefined) await storage.setSetting("sendavapay_api_key", apiKey);
      if (webhookSecret !== undefined) await storage.setSetting("sendavapay_webhook_secret", webhookSecret);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/sendavapay/balance", authMiddleware("admin"), async (req, res) => {
    try {
      const apiKey = await getSendavaApiKey();
      if (!apiKey) return res.status(400).json({ message: "Service de paiement non configure." });
      const countryCode = (req.query.country as string) || undefined;
      const result = await sendavaGetBalance(apiKey, countryCode);
      res.json({ success: result.success, data: result.data, message: result.message });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/sendavapay/transactions", authMiddleware("admin"), async (_req, res) => {
    try {
      const apiKey = await getSendavaApiKey();
      if (!apiKey) return res.status(400).json({ message: "Service de paiement non configure." });
      const result = await sendavaGetTransactions(apiKey);
      res.json({ success: result.success, data: result.data, message: result.message });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/sendavapay/configure-webhook", authMiddleware("admin"), async (_req, res) => {
    try {
      const apiKey = await getSendavaApiKey();
      if (!apiKey) return res.status(400).json({ message: "Service de paiement non configure." });
      const result = await sendavaConfigureWebhook(apiKey, "https://westpay.cloud/api/sendavapay/callback");
      if (result.success && result.data?.webhookSecret) {
        await storage.setSetting("sendavapay_webhook_secret", result.data.webhookSecret);
      }
      res.json({ success: result.success, data: result.data, message: result.message });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/mbiyo/confirm-payment", authMiddleware("admin"), async (req, res) => {
    try {
      const { reference, txId } = req.body;
      if (!reference) return res.status(400).json({ message: "reference requis" });

      const pending = await storage.getPendingPaymentByOmnipayReference(reference);
      if (!pending) return res.status(404).json({ message: `Paiement introuvable pour la référence: ${reference}` });

      if (pending.status === "omnipay_confirmed") {
        return res.status(400).json({ message: "Ce paiement est déjà confirmé" });
      }

      await storage.updatePendingPaymentStatus(pending.id, "omnipay_confirmed");

      const merchant = await storage.getMerchantById(pending.merchantId);
      const credit = calcMerchantCredit(pending.amount, pending.country);

      const mc = await storage.findMerchantCountryBySimAndCountry(pending.merchantId, pending.country);
      if (mc) {
        await storage.incrementMerchantCountryBalance(mc.id, credit);
      }

      const tx = await storage.createTransaction({
        merchantId: pending.merchantId,
        country: pending.country,
        txId: txId || reference,
        amount: pending.amount,
        payerNumber: pending.payerPhone || null,
        payerName: pending.payerName || null,
        status: "confirmed",
        provider: "westpay",
        omnipayTxId: txId || null,
        operator: pending.paymentMethod || null,
        omnipayReference: reference,
        errorMessage: null,
      });

      if (merchant) {
        notifyMerchantPayment(merchant, pending.amount, pending.payerPhone || "", pending.payerName || "").catch(() => {});
        notifyAdminPayment(merchant, pending.amount, pending.payerPhone || "", tx.txId || "", "Mbiyo (Manuel)").catch(() => {});
      }

      console.log(`[MBIYO ADMIN] Paiement confirmé manuellement: ${reference} — Crédit: ${credit} — Marchand: ${merchant?.name}`);
      res.json({ success: true, credit, txId: tx.txId, merchantName: merchant?.name });
    } catch (err: any) {
      console.error("[MBIYO ADMIN] Erreur confirmation manuelle:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // Update merchant country payin gateway
  app.patch("/api/admin/merchant-countries/:id/gateway", authMiddleware("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { payinGateway } = req.body;
      if (!["omnipay", "mbiyo", "sendavapay"].includes(payinGateway)) {
        return res.status(400).json({ message: "Methode de paiement invalide." });
      }
      await storage.updateMerchantCountryPayinGateway(id, payinGateway);
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

  app.post("/api/merchant/transfer", apiKeyAuthMiddleware, async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const { msisdn, amount, firstName, lastName, operator } = req.body;
      const country = normalizeCountry(req.body.country || "");

      if (!country || !msisdn || !amount || !firstName || !lastName) {
        return res.status(400).json({ message: "Pays, numero, montant, prenom et nom requis" });
      }

      const parsedAmount = parseInt(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: "Le montant doit etre un nombre positif" });
      }

      const merchantCountry = await storage.findMerchantCountryBySimAndCountry(merchantId, country);
      if (!merchantCountry) {
        const availableMCs = await storage.getMerchantCountries(merchantId);
        const available = availableMCs.filter(c => c.active).map(c => c.country);
        return res.status(400).json({
          message: `Pays "${country}" non configure sur ce compte. Pays disponibles : ${available.join(", ") || "aucun"}`,
        });
      }
      if (!merchantCountry.active) {
        return res.status(400).json({ message: `Le pays "${country}" est desactive sur ce compte marchand` });
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
      const msisdnFull = prependDialCode(msisdn, country);

      const result = await omnipayInitiateTransfer({
        apikey: omnipayApiKey,
        msisdn: msisdnFull,
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
        provider: "westpay",
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

        const smsM2 = await storage.getMerchantById(found.merchantId);
        const merchantCredit2 = smsM2?.feeExempt ? amount : calcMerchantCredit(amount, found.country);
        await storage.createTransaction({
          merchantId: found.merchantId,
          country: found.country,
          txId,
          amount,
          payerNumber: payerNumber || null,
          status: "confirmed",
        });

        await storage.incrementMerchantCountryBalance(merchantCountry.id, merchantCredit2);

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

        notifyAdminPayment({
          txId,
          merchantName: foundMerchant?.name || `#${found.merchantId}`,
          payerNumber,
          country: found.country,
          amount,
          provider: "sms",
          status: "confirmed",
        }).catch(() => {});

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

      const smsM3 = await storage.getMerchantById(simNumber.merchantId);
      const merchantCredit3 = smsM3?.feeExempt ? amount : calcMerchantCredit(amount, simNumber.country);
      await storage.createTransaction({
        merchantId: simNumber.merchantId,
        country: simNumber.country,
        txId,
        amount,
        payerNumber: payerNumber || null,
        status: "confirmed",
      });

      await storage.incrementMerchantCountryBalance(merchantCountry.id, merchantCredit3);

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

      notifyMerchantPayment(simNumber.merchantId, {
        txId,
        amount,
        payerNumber,
        country: simNumber.country,
        provider: "sms",
      }).catch(() => {});

      notifyAdminPayment({
        txId,
        merchantName: simMerchant?.name || `#${simNumber.merchantId}`,
        payerNumber,
        country: simNumber.country,
        amount,
        provider: "sms",
        status: "confirmed",
      }).catch(() => {});

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
      const { name, description, amountType, amount, redirectUrl, expiresAt, paymentLimit, active, countries, confirmationMessage, collectBillingAddress, showShareButton, notificationEmail } = req.body;
      if (!name || !amountType) return res.status(400).json({ message: "name et amountType requis" });
      if (amountType === "fixed" && !amount) return res.status(400).json({ message: "amount requis pour un lien fixe" });
      const uniqueId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      const link = await storage.createPaymentLink({
        merchantId: merchantId,
        uniqueId,
        name,
        description: description || null,
        amountType,
        amount: amount ? Number(amount) : null,
        redirectUrl: redirectUrl || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        paymentLimit: paymentLimit ? Number(paymentLimit) : null,
        active: active !== false,
        countries: Array.isArray(countries) && countries.length > 0 ? countries : null,
        confirmationMessage: confirmationMessage || null,
        collectBillingAddress: collectBillingAddress === true,
        showShareButton: showShareButton !== false,
        notificationEmail: notificationEmail || null,
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
      const { name, description, amountType, amount, redirectUrl, expiresAt, paymentLimit, active, countries, confirmationMessage, collectBillingAddress, showShareButton, notificationEmail } = req.body;
      const updated = await storage.updatePaymentLink(id, {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description: description || null }),
        ...(amountType !== undefined && { amountType }),
        ...(amount !== undefined && { amount: amount ? Number(amount) : null }),
        ...(redirectUrl !== undefined && { redirectUrl: redirectUrl || null }),
        ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
        ...(paymentLimit !== undefined && { paymentLimit: paymentLimit ? Number(paymentLimit) : null }),
        ...(active !== undefined && { active }),
        ...(countries !== undefined && { countries: Array.isArray(countries) && countries.length > 0 ? countries : null }),
        ...(confirmationMessage !== undefined && { confirmationMessage: confirmationMessage || null }),
        ...(collectBillingAddress !== undefined && { collectBillingAddress: collectBillingAddress === true }),
        ...(showShareButton !== undefined && { showShareButton: showShareButton !== false }),
        ...(notificationEmail !== undefined && { notificationEmail: notificationEmail || null }),
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
  app.get("/api/public/wallet-transfer-fee", async (_req, res) => {
    try {
      const feeType = await storage.getSetting("wallet_transfer_fee_type");
      const feeValue = await storage.getSetting("wallet_transfer_fee_value");
      res.json({
        feeType: feeType?.value || "percentage",
        feeValue: parseFloat(feeValue?.value || "3"),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/public/platform-flags", async (_req, res) => {
    try {
      const withdrawalsDisabled = await storage.getSetting("withdrawals_disabled");
      res.json({ withdrawalsDisabled: withdrawalsDisabled === "true" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/admin/platform-flags", authMiddleware("admin"), async (req, res) => {
    try {
      const { withdrawalsDisabled } = req.body;
      if (withdrawalsDisabled !== undefined) {
        await storage.setSetting("withdrawals_disabled", withdrawalsDisabled ? "true" : "false");
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

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

  // ==================== SUPPORT / AIDE ====================
  app.post("/api/support/help", async (req, res) => {
    try {
      const { name, whatsapp, message, merchantName, merchantSlug } = req.body;
      if (!name || !message) {
        return res.status(400).json({ message: "Nom et message sont requis" });
      }
      const now = new Date();
      const date = now.toLocaleDateString("fr-FR");
      const time = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      const merchantInfo = merchantName ? `🏪 *Marchand :* ${merchantName}${merchantSlug ? ` (${merchantSlug})` : ""}` : "🏪 *Marchand :* Inconnu";
      const text = `🆘 *Nouvelle demande d'aide — Page de paiement*\n\n${merchantInfo}\n\n👤 *Nom :* ${name}\n📱 *WhatsApp :* ${whatsapp || "Non renseigné"}\n💬 *Message :*\n${message}\n\n📅 *Date :* ${date}  🕐 *Heure :* ${time}`;
      const { notifyAdminGroup } = await import("./telegram-bot");
      await notifyAdminGroup(text);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[SUPPORT] Erreur envoi aide:", err.message);
      res.status(500).json({ message: "Erreur lors de l'envoi" });
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
      if (!country?.trim() || !["XOF", "XAF", "CDF", "GNF", "GMD"].includes(currencyZone)) {
        return res.status(400).json({ message: "Pays et zone monetaire requis (XOF, XAF, CDF, GNF ou GMD)" });
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
      const wtMerchantForFee = await storage.getMerchantById(merchantId);
      const feeTypeSetting = await storage.getSetting("wallet_transfer_fee_type");
      const feeValueSetting = await storage.getSetting("wallet_transfer_fee_value");
      const feeType = feeTypeSetting?.value || "percentage";
      const feeValue = parseFloat(feeValueSetting?.value || "3");
      let fee = 0;
      if (!wtMerchantForFee?.feeExempt) {
        if (feeType === "percentage") {
          fee = Math.round((parsedAmount * feeValue) / 100);
        } else {
          fee = Math.round(feeValue);
        }
      }
      const totalNeeded = parsedAmount + fee;
      if (fromMC.balance < totalNeeded) {
        return res.status(400).json({ message: `Solde insuffisant. Vous avez ${fromMC.balance.toLocaleString("fr-FR")} ${fromZone}, vous avez besoin de ${totalNeeded.toLocaleString("fr-FR")} ${fromZone} (montant + frais)` });
      }

      // ── DÉBIT ATOMIQUE transfert (élimine la race condition) ──────────────────
      const transferDebited = await storage.decrementMerchantCountryBalanceAtomic(fromMC.id, totalNeeded);
      if (!transferDebited) {
        return res.status(400).json({ message: "Solde insuffisant (vérification atomique échouée)" });
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

      notifyAdminWalletTransfer({ id: transfer.id, merchantName: wtMerchantForFee?.name || `#${merchantId}`, fromCountry: fromMC.country, toCountry: toMC.country, amount: parsedAmount, fee, currency: fromZone, status: "pending" }).catch(() => {});

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
      const wtApprMerchant = await storage.getMerchantById(transfer.merchantId);
      notifyAdminWalletTransfer({ id, merchantName: wtApprMerchant?.name || `#${transfer.merchantId}`, fromCountry: transfer.fromCountry, toCountry: transfer.toCountry, amount: transfer.amount, fee: transfer.fee, currency: transfer.currency, status: "approved" }).catch(() => {});
      notifyMerchantWalletTransfer(transfer.merchantId, { id, fromCountry: transfer.fromCountry, toCountry: transfer.toCountry, amount: transfer.amount, fee: transfer.fee, currency: transfer.currency, status: "approved" }).catch(() => {});
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
      const wtRejMerchant = await storage.getMerchantById(transfer.merchantId);
      notifyAdminWalletTransfer({ id, merchantName: wtRejMerchant?.name || `#${transfer.merchantId}`, fromCountry: transfer.fromCountry, toCountry: transfer.toCountry, amount: transfer.amount, fee: transfer.fee, currency: transfer.currency, status: "rejected" }).catch(() => {});
      notifyMerchantWalletTransfer(transfer.merchantId, { id, fromCountry: transfer.fromCountry, toCountry: transfer.toCountry, amount: transfer.amount, fee: transfer.fee, currency: transfer.currency, status: "rejected" }).catch(() => {});
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
      const { merchantCountryId, amount, phone, operator, recipientName } = req.body;
      if (!merchantCountryId || !amount || !phone) return res.status(400).json({ message: "Champs requis manquants" });

      const withdrawalsDisabledFlag = await storage.getSetting("withdrawals_disabled");
      if (withdrawalsDisabledFlag === "true") {
        return res.status(503).json({ message: "Les retraits sont temporairement indisponibles. Veuillez réessayer plus tard.", withdrawalsDisabled: true });
      }

      const mc = await storage.getMerchantCountryById(Number(merchantCountryId));
      if (!mc || mc.merchantId !== merchantId) return res.status(403).json({ message: "Wallet introuvable" });
      if (amount <= 0) return res.status(400).json({ message: "Montant invalide" });
      if (mc.balance < amount) return res.status(400).json({ message: "Solde insuffisant" });
      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant) return res.status(404).json({ message: "Marchand introuvable" });

      const payoutOpRecord = operator ? await storage.getWithdrawalOperatorByNameAndCountry(operator, mc.country) : null;
      const payoutGatewayLower = payoutOpRecord?.gateway?.toLowerCase();
      const useMbiyoPayout = payoutGatewayLower === "mbiyo";
      const useSendavaPayout = payoutGatewayLower === "sendavapay";

      if ((useMbiyoPayout || useSendavaPayout) && amount < 500) {
        return res.status(400).json({ message: "Le montant minimum de retrait est de 500 FCFA." });
      }

      // ── ANTI-DOUBLON (vérification avant lock) ────────────────────────────────
      const recentDuplicate = await pool.query(
        `SELECT id, status, created_at FROM withdrawals
         WHERE merchant_id = $1 AND phone = $2 AND amount = $3 AND country = $4
           AND status IN ('pending', 'approved')
           AND created_at > NOW() - INTERVAL '2 hours'
         ORDER BY created_at DESC LIMIT 1`,
        [merchantId, phone, amount, mc.country]
      );
      if (recentDuplicate.rowCount && recentDuplicate.rowCount > 0) {
        const dup = recentDuplicate.rows[0];
        const dupDate = new Date(dup.created_at).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        return res.status(409).json({
          message: `Un retrait identique (${amount} FCFA → ${phone}) est déjà ${dup.status === "approved" ? "approuvé" : "en cours"} depuis ${dupDate}. Attendez 2 heures avant de réessayer.`,
          duplicateId: dup.id,
        });
      }

      // ── DÉBIT ATOMIQUE (SELECT … WHERE balance >= amount) ─────────────────────
      // Élimine la race condition : le solde ne peut pas devenir négatif même
      // si deux requêtes simultanées passent la vérification précédente.
      const debited = await storage.decrementMerchantCountryBalanceAtomic(mc.id, amount);
      if (!debited) {
        return res.status(400).json({ message: "Solde insuffisant (vérification atomique échouée)" });
      }

      const w = await storage.createWithdrawal({
        merchantId,
        merchantCountryId: mc.id,
        country: mc.country,
        amount,
        phone,
        recipientName: recipientName || null,
        operator: operator || null,
        status: "pending",
        withdrawalMode: "auto",
        adminNote: null,
        gateway: useMbiyoPayout ? "mbiyo" : useSendavaPayout ? "sendavapay" : "omnipay",
      });

      const wdRawIp = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "").split(",")[0].trim();
      getGeoInfo(wdRawIp).then(wdGeo => {
        notifyAdminWithdrawal({ id: w.id, merchantName: merchant.name, merchantEmail: merchant.email, merchantId, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "pending", mode: "auto", ip: wdGeo.ip || wdRawIp, geo: wdGeo }).catch(() => {});
      }).catch(() => {
        notifyAdminWithdrawal({ id: w.id, merchantName: merchant.name, merchantEmail: merchant.email, merchantId, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "pending", mode: "auto", ip: wdRawIp }).catch(() => {});
      });

      const withdrawalFee = merchant.feeExempt ? 0 : calcWithdrawalFee(amount, mc.country);
      const netAmount = amount - withdrawalFee;
      const reference = mbiyoGenerateRef();

      if (useMbiyoPayout) {
        const mbiyoApiKey = await getMbiyoApiKey();
        if (!mbiyoApiKey) {
          await storage.updateWithdrawalStatus(w.id, "failed", "Cle API Mbiyo non configuree", reference);
          await storage.incrementMerchantCountryBalance(mc.id, amount);
          return res.status(500).json({ message: "Service de retrait non configure. Contactez l'administrateur." });
        }
        try {
          const msisdnFull = prependDialCode(phone, mc.country);
          const countryCode = mbiyoCountryCode(mc.country);
          const currency = mbiyoCurrency(mc.country);
          const network = payoutOpRecord?.mbiyoCode || mbiyoNetwork(operator || "");
          const callbackBaseUrl = process.env.NODE_ENV === "production" ? "https://westpay.cloud" : `${req.protocol}://${req.get("host")}`;
          const callbackUrl = `${callbackBaseUrl}/api/mbiyo/payout-callback`;
          console.log(`[WITHDRAWAL MBIYO] Params: msisdn=${msisdnFull} network=${network} country=${countryCode} currency=${currency}`);

          const result = await mbiyoInitiatePayout({
            apiKey: mbiyoApiKey,
            amount: netAmount,
            currency,
            orderId: reference,
            callbackUrl,
            network,
            phoneNumber: msisdnFull,
            countryCode,
            beneficiary: merchant.name,
          });

          const payoutInitOk = (result.status === "success" || result.status === "pending") && result.data;
          if (payoutInitOk) {
            const mbiyoRef = result.data!.transaction_id || reference;
            const mbiyoFee = Math.round(parseFloat(String(result.data!.fee || 0)) || withdrawalFee);
            await storage.updateWithdrawalStatus(w.id, "pending", `En cours de traitement - TxID: ${mbiyoRef}`, reference, mbiyoFee, mbiyoFee);
            console.log(`[WITHDRAWAL MBIYO] Initié (statut: ${result.status}) - TxID: ${mbiyoRef} ref=${reference}`);
            return res.json({ ...w, status: "pending", omnipayRef: reference, fees: mbiyoFee, netAmount, autoProcessed: true, gateway: "westpay" });
          } else {
            const errMsg = result.message || "Echec du transfert";
            console.warn(`[WITHDRAWAL MBIYO] Echec: ${errMsg} — tentative fallback OmniPay...`);
            // Fallback OmniPay
            const fallbackApiKey = await getOmnipayPayoutApiKey();
            if (fallbackApiKey) {
              try {
                const nameParts = merchant.name.trim().split(/\s+/);
                const wdFirstName = nameParts[0] || merchant.name;
                const wdLastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : nameParts[0] || merchant.name;
                const omnipayOperatorCode = await resolveOmnipayOperatorCode(operator, mc.country);
                const msisdnFullFb = prependDialCode(phone, mc.country);
                const fallbackRef = reference + "F";
                const fallbackResult = await omnipayInitiateTransfer({
                  apikey: fallbackApiKey,
                  msisdn: msisdnFullFb,
                  amount: netAmount,
                  reference: fallbackRef,
                  first_name: wdFirstName,
                  last_name: wdLastName,
                  operator: omnipayOperatorCode,
                });
                if (fallbackResult.success === 1) {
                  const omnipayRef = fallbackResult.reference || fallbackRef;
                  const fbProviderFee = fallbackResult.fees || 0;
                  await storage.updateWithdrawalStatus(w.id, "pending", `En cours de traitement - Frais prévus: ${withdrawalFee} F`, omnipayRef, withdrawalFee, fbProviderFee);
                  console.log(`[WITHDRAWAL FALLBACK] Basculé sur OmniPay ref=${omnipayRef}`);
                  return res.json({ ...w, status: "pending", omnipayRef, fees: withdrawalFee, netAmount, autoProcessed: true, gateway: "westpay" });
                }
              } catch (fbErr: any) {
                console.error(`[WITHDRAWAL FALLBACK] OmniPay fallback échoué: ${fbErr.message}`);
              }
            }
            // Les deux ont échoué
            await storage.updateWithdrawalStatus(w.id, "failed", `Retrait non abouti: ${errMsg}`, reference);
            notifyAdminWithdrawal({ id: w.id, merchantName: merchant.name, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "failed", mode: "auto" }).catch(() => {});
            notifyMerchantWithdrawal(merchantId, { id: w.id, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "failed" }).catch(() => {});
            await storage.incrementMerchantCountryBalance(mc.id, amount);
            return res.status(400).json({ message: "Retrait non abouti. Votre solde a été restitué." });
          }
        } catch (mbiyoErr: any) {
          const errDetail = mbiyoErr?.cause?.message || mbiyoErr?.message || "unknown";
          const isTimeout = errDetail.includes("abort") || errDetail.includes("timeout") || errDetail.includes("UND_ERR");
          const techMsg = isTimeout ? "Timeout connexion passerelle" : `Erreur technique: ${errDetail}`;
          console.error(`[WITHDRAWAL MBIYO] Erreur catch — retrait #${w.id} | ${techMsg} — tentative fallback OmniPay...`);
          // Fallback OmniPay sur exception
          const fallbackApiKey = await getOmnipayPayoutApiKey();
          if (fallbackApiKey) {
            try {
              const nameParts = merchant.name.trim().split(/\s+/);
              const wdFirstName = nameParts[0] || merchant.name;
              const wdLastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : nameParts[0] || merchant.name;
              const omnipayOperatorCode = await resolveOmnipayOperatorCode(operator, mc.country);
              const msisdnFullFb = prependDialCode(phone, mc.country);
              const fallbackRef = reference + "F";
              const fallbackResult = await omnipayInitiateTransfer({
                apikey: fallbackApiKey,
                msisdn: msisdnFullFb,
                amount: netAmount,
                reference: fallbackRef,
                first_name: wdFirstName,
                last_name: wdLastName,
                operator: omnipayOperatorCode,
              });
              if (fallbackResult.success === 1) {
                const omnipayRef = fallbackResult.reference || fallbackRef;
                const fbProviderFee2 = fallbackResult.fees || 0;
                await storage.updateWithdrawalStatus(w.id, "pending", `En cours de traitement - Frais prévus: ${withdrawalFee} F`, omnipayRef, withdrawalFee, fbProviderFee2);
                console.log(`[WITHDRAWAL FALLBACK] Basculé sur OmniPay ref=${omnipayRef} (après erreur Mbiyo)`);
                return res.json({ ...w, status: "pending", omnipayRef, fees: withdrawalFee, netAmount, autoProcessed: true, gateway: "westpay" });
              }
            } catch (fbErr: any) {
              console.error(`[WITHDRAWAL FALLBACK] OmniPay fallback échoué: ${fbErr.message}`);
            }
          }
          await storage.updateWithdrawalStatus(w.id, "failed", techMsg, reference);
          notifyAdminWithdrawal({ id: w.id, merchantName: merchant.name, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "failed", mode: "auto" }).catch(() => {});
          notifyMerchantWithdrawal(merchantId, { id: w.id, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "failed" }).catch(() => {});
          await storage.incrementMerchantCountryBalance(mc.id, amount);
          return res.status(500).json({ message: "Retrait non abouti. Votre solde a été restitué." });
        }
      } else if (useSendavaPayout) {
        const sendavaApiKey = await getSendavaApiKey();
        if (!sendavaApiKey) {
          await storage.updateWithdrawalStatus(w.id, "failed", "Cle API SendavaPay non configuree", reference);
          await storage.incrementMerchantCountryBalance(mc.id, amount);
          return res.status(500).json({ message: "Service de retrait non configure. Contactez l'administrateur." });
        }
        try {
          const msisdnFull = prependDialCode(phone, mc.country);
          const countryCode = SENDAVAPAY_COUNTRY_CODES[mc.country] || "";
          const currency = SENDAVAPAY_CURRENCY_MAP[countryCode] || "XOF";
          const sendavaOperator = toSendavaOperator(operator || "", countryCode);
          console.log(`[WITHDRAWAL SENDAVAPAY] Params: msisdn=${msisdnFull} op=${sendavaOperator} country=${countryCode}`);

          const result = await sendavaInitiateWithdraw(sendavaApiKey, {
            amount: netAmount,
            phoneNumber: msisdnFull,
            operator: sendavaOperator,
            country: countryCode,
            currency,
            description: `Retrait WestPay - ${merchant.name}`,
            externalReference: reference,
          });

          const spStatusLower = (result.data?.status || "").toLowerCase();
          const spInitOk = result.success && !["failed", "failure", "cancelled", "canceled", "rejected"].includes(spStatusLower);
          if (spInitOk) {
            const spRef = result.data?.reference || reference;
            const spFee = result.data?.fee != null ? Math.round(result.data.fee || withdrawalFee) : withdrawalFee;
            await storage.updateWithdrawalStatus(w.id, "pending", `En cours de traitement SendavaPay - Ref: ${spRef}`, spRef, spFee, spFee);
            console.log(`[WITHDRAWAL SENDAVAPAY] Initie (statut: ${result.data?.status}) - ref=${spRef}`);
            return res.json({ ...w, status: "pending", omnipayRef: spRef, fees: spFee, netAmount, autoProcessed: true, gateway: "sendavapay" });
          } else {
            const errMsg = result.message || result.data?.message || "Echec du transfert SendavaPay";
            console.warn(`[WITHDRAWAL SENDAVAPAY] Echec: ${errMsg}`);
            await storage.updateWithdrawalStatus(w.id, "failed", `Retrait non abouti: ${errMsg}`, reference);
            notifyAdminWithdrawal({ id: w.id, merchantName: merchant.name, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "failed", mode: "auto" }).catch(() => {});
            notifyMerchantWithdrawal(merchantId, { id: w.id, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "failed" }).catch(() => {});
            await storage.incrementMerchantCountryBalance(mc.id, amount);
            return res.status(400).json({ message: "Retrait non abouti. Votre solde a été restitué." });
          }
        } catch (spErr: any) {
          const errDetail = spErr?.cause?.message || spErr?.message || "unknown";
          const isTimeout = errDetail.includes("abort") || errDetail.includes("timeout") || errDetail.includes("UND_ERR");
          const techMsg = isTimeout ? "Timeout connexion SendavaPay" : `Erreur technique: ${errDetail}`;
          console.error(`[WITHDRAWAL SENDAVAPAY] Erreur catch — retrait #${w.id} | ${techMsg}`);
          await storage.updateWithdrawalStatus(w.id, "failed", techMsg, reference);
          notifyAdminWithdrawal({ id: w.id, merchantName: merchant.name, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "failed", mode: "auto" }).catch(() => {});
          notifyMerchantWithdrawal(merchantId, { id: w.id, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "failed" }).catch(() => {});
          await storage.incrementMerchantCountryBalance(mc.id, amount);
          return res.status(500).json({ message: "Retrait non abouti. Votre solde a été restitué." });
        }
      } else {
        const apiKeyToUse = await getOmnipayPayoutApiKey();
        if (!apiKeyToUse) {
          await storage.updateWithdrawalStatus(w.id, "failed", "Cle API retrait non configuree", reference);
          await storage.incrementMerchantCountryBalance(mc.id, amount);
          return res.status(500).json({ message: "Cle API retrait non configuree. Contactez l'administrateur." });
        }
        try {
          const nameParts = merchant.name.trim().split(/\s+/);
          const wdFirstName = nameParts[0] || merchant.name;
          const wdLastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : nameParts[0] || merchant.name;
          const omnipayOperatorCode = await resolveOmnipayOperatorCode(operator, mc.country);
          const msisdnFull = prependDialCode(phone, mc.country);
          const result = await omnipayInitiateTransfer({
            apikey: apiKeyToUse,
            msisdn: msisdnFull,
            amount: netAmount,
            reference,
            first_name: wdFirstName,
            last_name: wdLastName,
            operator: omnipayOperatorCode,
          });
          if (result.success === 1) {
            const omnipayRef = result.reference || reference;
            const omnipayProviderFee = result.fees || 0;
            await storage.updateWithdrawalStatus(w.id, "pending", `En cours de traitement - Frais prévus: ${withdrawalFee} F`, omnipayRef, withdrawalFee, omnipayProviderFee);
            console.log(`[WITHDRAWAL AUTO] Initié chez OmniPay ref=${omnipayRef} - en attente du callback`);
            return res.json({ ...w, status: "pending", omnipayRef, fees: withdrawalFee, netAmount, autoProcessed: true });
          } else {
            const errMsg = OMNIPAY_ERRORS[result.code || 0] || result.message || "Echec de traitement";
            await storage.updateWithdrawalStatus(w.id, "failed", `Retrait non abouti: ${errMsg}`, reference);
            notifyAdminWithdrawal({ id: w.id, merchantName: merchant.name, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "failed", mode: "auto" }).catch(() => {});
            notifyMerchantWithdrawal(merchantId, { id: w.id, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "failed" }).catch(() => {});
            await storage.incrementMerchantCountryBalance(mc.id, amount);
            return res.status(400).json({ message: errMsg, paymentError: true, code: result.code });
          }
        } catch (omnipayErr: any) {
          console.error("[WITHDRAWAL AUTO] Erreur OmniPay:", omnipayErr.message);
          await storage.updateWithdrawalStatus(w.id, "failed", `Erreur technique lors du traitement`, reference);
          notifyAdminWithdrawal({ id: w.id, merchantName: merchant.name, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "failed", mode: "auto" }).catch(() => {});
          notifyMerchantWithdrawal(merchantId, { id: w.id, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "failed" }).catch(() => {});
          await storage.incrementMerchantCountryBalance(mc.id, amount);
          return res.status(500).json({ message: "Erreur lors du traitement du retrait. Votre solde a été restitué." });
        }
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/merchant/withdrawal-operators/:country", async (req, res) => {
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
      // ── PROTECTION ANTI-DOUBLE-ENVOI ──────────────────────────────────────────
      // Si omnipayRef est déjà rempli, ce retrait a déjà été envoyé au prestataire
      // (flow auto). Approuver à nouveau enverrait l'argent une deuxième fois.
      if (w.omnipayRef) return res.status(400).json({
        message: `Ce retrait est déjà en cours de traitement chez le prestataire (réf: ${w.omnipayRef}). Attendez la confirmation automatique.`
      });

      const mc = await storage.getMerchantCountryById(w.merchantCountryId);
      const merchant = await storage.getMerchantById(w.merchantId);
      let omnipayRef: string | undefined;
      let fees: number | undefined;
      let sentToProvider = false;
      const useMbiyoPayout = w.gateway === "mbiyo";

      if (useMbiyoPayout) {
        const mbiyoApiKey = await getMbiyoApiKey();
        if (mc && mbiyoApiKey && merchant) {
          try {
            const reference = mbiyoGenerateRef();
            const msisdnFull = prependDialCode(w.phone, w.country);
            const countryCode = mbiyoCountryCode(w.country);
            const currency = mbiyoCurrency(w.country);
            const wdOpRecord = w.operator ? await storage.getWithdrawalOperatorByNameAndCountry(w.operator, w.country) : null;
            const network = wdOpRecord?.mbiyoCode || mbiyoNetwork(w.operator || "");
            const callbackBaseUrl = process.env.NODE_ENV === "production" ? "https://westpay.cloud" : `${req.protocol}://${req.get("host")}`;
            const callbackUrl = `${callbackBaseUrl}/api/mbiyo/payout-callback`;
            console.log(`[ADMIN APPROVE WD MBIYO] Transfert: ${w.amount} vers ${msisdnFull}, ref: ${reference}, network: ${network}`);
            const result = await mbiyoInitiatePayout({
              apiKey: mbiyoApiKey,
              amount: w.amount,
              currency,
              orderId: reference,
              callbackUrl,
              network,
              phoneNumber: msisdnFull,
              countryCode,
              beneficiary: merchant.name,
            });
            if ((result.status === "success" || result.status === "pending") && result.data) {
              omnipayRef = reference;
              fees = Math.round(parseFloat(String(result.data.fee || 0)) || 0);
              sentToProvider = true;
              console.log(`[ADMIN APPROVE WD MBIYO] Initié (statut: ${result.status}) - TxID: ${result.data.transaction_id}, Ref: ${reference} - en attente callback`);
            } else {
              console.error(`[ADMIN APPROVE WD MBIYO] Echec: ${result.message}`);
            }
          } catch (mbiyoErr: any) {
            const errDetail = mbiyoErr?.cause?.message || mbiyoErr?.message || "unknown";
            const isTimeout = errDetail.includes("abort") || errDetail.includes("timeout") || errDetail.includes("UND_ERR");
            console.error(`[ADMIN APPROVE WD MBIYO] Erreur catch — retrait #${w.id} | ${isTimeout ? "Timeout/connexion Mbiyo" : errDetail}`);
          }
        }
      } else {
        const omnipayApiKey = await getOmnipayPayoutApiKey();
        if (mc && mc.omnipayEnabled && omnipayApiKey && merchant) {
          try {
            const reference = `WD-${w.id}-${Date.now()}`;
            const mNameParts = merchant.name.trim().split(/\s+/);
            const mFirstName = mNameParts[0] || merchant.name;
            const mLastName = mNameParts.length > 1 ? mNameParts.slice(1).join(" ") : mNameParts[0] || merchant.name;
            const adminOmnipayCode = await resolveOmnipayOperatorCode(w.operator, w.country);
            const wdMsisdn = prependDialCode(w.phone, w.country);
            console.log(`[ADMIN APPROVE WD] Transfert: ${w.amount} vers ${wdMsisdn}, operateur: ${adminOmnipayCode || "(auto)"}, ref: ${reference}`);
            const result = await omnipayInitiateTransfer({
              apikey: omnipayApiKey,
              msisdn: wdMsisdn,
              amount: w.amount,
              reference,
              first_name: mFirstName,
              last_name: mLastName,
              operator: adminOmnipayCode,
            });
            if (result.success === 1) {
              omnipayRef = result.reference || reference;
              fees = result.fees || 0;
              sentToProvider = true;
              console.log(`[ADMIN APPROVE WD] Initié chez OmniPay - ID: ${result.id}, Ref: ${omnipayRef} - en attente callback`);
            } else {
              const errMsg = OMNIPAY_ERRORS[result.code || 0] || result.message || "Echec inconnu";
              console.error(`[ADMIN APPROVE WD] OmniPay echec (code ${result.code}): ${errMsg}`);
            }
          } catch (omnipayErr: any) {
            console.error("[ADMIN APPROVE WD] OmniPay erreur:", omnipayErr.message);
          }
        }
      }

      if (sentToProvider) {
        await storage.updateWithdrawalStatus(id, "pending", `En cours de traitement - en attente de confirmation${note ? ` - Note: ${note}` : ""}`, omnipayRef, fees, fees);
        console.log(`[ADMIN APPROVE WD] Retrait #${id} en attente confirmation ${useMbiyoPayout ? "Mbiyo" : "OmniPay"} - ref=${omnipayRef}`);
        res.json({ success: true, omnipayRef, fees, pendingPayment: true });
      } else {
        await storage.updateWithdrawalStatus(id, "approved", note, omnipayRef, fees, fees);
        notifyAdminWithdrawal({ id, merchantName: merchant?.name || `#${w.merchantId}`, country: w.country, amount: w.amount, fees: fees || 0, phone: w.phone, operator: w.operator, status: "approved", mode: "manual" }).catch(() => {});
        notifyMerchantWithdrawal(w.merchantId, { id, country: w.country, amount: w.amount, fees: fees || 0, phone: w.phone, operator: w.operator, status: "approved" }).catch(() => {});
        res.json({ success: true, omnipayRef, fees });
      }
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
      const rejMerchant = await storage.getMerchantById(w.merchantId);
      await storage.updateWithdrawalStatus(id, "rejected", note);
      await storage.incrementMerchantCountryBalance(w.merchantCountryId, w.amount);
      notifyAdminWithdrawal({ id, merchantName: rejMerchant?.name || `#${w.merchantId}`, country: w.country, amount: w.amount, fees: 0, phone: w.phone, operator: w.operator, status: "rejected", mode: "manual" }).catch(() => {});
      notifyMerchantWithdrawal(w.merchantId, { id, country: w.country, amount: w.amount, fees: 0, phone: w.phone, operator: w.operator, status: "rejected" }).catch(() => {});
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

  app.patch("/api/admin/merchants/:id/fee-exempt", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { feeExempt } = req.body;
      if (typeof feeExempt !== "boolean") return res.status(400).json({ message: "Valeur invalide" });
      await storage.updateMerchant(id, { feeExempt });
      res.json({ success: true, feeExempt });
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

  // Upload logo for an operator
  app.post("/api/admin/operator-logo/:id", authMiddleware("admin"), (req, res, next) => {
    logoUpload.single("logo")(req, res, async (err) => {
      if (err) return res.status(400).json({ message: err.message });
      try {
        const id = Number(req.params.id);
        if (!req.file) return res.status(400).json({ message: "Aucun fichier reçu" });
        const existing = await storage.getWithdrawalOperatorById(id);
        if (!existing) return res.status(404).json({ message: "Opérateur introuvable" });
        // Delete old logo file if it exists and is a local file
        if (existing.logo && existing.logo.startsWith("/uploads/")) {
          const oldPath = path.resolve(process.cwd(), existing.logo.slice(1));
          try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch {}
        }
        const logoUrl = `/uploads/operator-logos/${req.file.filename}`;
        const updated = await storage.updateWithdrawalOperator(id, { logo: logoUrl });
        res.json(updated);
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    });
  });

  // Remove logo for an operator
  app.delete("/api/admin/operator-logo/:id", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getWithdrawalOperatorById(id);
      if (!existing) return res.status(404).json({ message: "Opérateur introuvable" });
      if (existing.logo && existing.logo.startsWith("/uploads/")) {
        const oldPath = path.resolve(process.cwd(), existing.logo.slice(1));
        try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch {}
      }
      const updated = await storage.updateWithdrawalOperator(id, { logo: null });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Batch reorder operators
  app.put("/api/admin/withdrawal-operators/reorder", authMiddleware("admin"), async (req, res) => {
    try {
      const { updates } = req.body as { updates: { id: number; sortOrder: number }[] };
      if (!Array.isArray(updates)) return res.status(400).json({ message: "updates[] requis" });
      await storage.updateOperatorsSortOrder(updates);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/withdrawal-operators", authMiddleware("admin"), async (req, res) => {
    try {
      const { name, type, country, dailyLimit, gateway, omnipayCode, mbiyoCode, active } = req.body;
      if (!name || !country) return res.status(400).json({ message: "Nom et pays requis" });
      const op = await storage.createWithdrawalOperator({
        name,
        type: type || "Mobile Money",
        country,
        dailyLimit: dailyLimit ? Number(dailyLimit) : 1000000,
        gateway: "westpay",
        omnipayCode: omnipayCode?.trim() || null,
        mbiyoCode: mbiyoCode?.trim() || null,
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
      const { name, type, country, dailyLimit, gateway, omnipayCode, mbiyoCode, logo, sortOrder, active, maintenanceAll, maintenanceDeposits, maintenanceWithdrawals, maintenancePaymentLinks, maintenanceApiPayment } = req.body;
      const updated = await storage.updateWithdrawalOperator(id, {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(country !== undefined && { country }),
        ...(dailyLimit !== undefined && { dailyLimit: Number(dailyLimit) }),
        ...(gateway !== undefined && { gateway }),
        ...(omnipayCode !== undefined && { omnipayCode: omnipayCode?.trim() || null }),
        ...(mbiyoCode !== undefined && { mbiyoCode: mbiyoCode?.trim() || null }),
        ...(logo !== undefined && { logo: logo || null }),
        ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
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

  // ─── Agrégateurs Crypto ──────────────────────────────────────────────────

  app.get("/api/admin/crypto-aggregators", authMiddleware("admin"), async (_req, res) => {
    try {
      const aggs = await storage.getCryptoAggregators();
      const result = await Promise.all(aggs.map(async (agg) => {
        const countries = await storage.getCryptoAggregatorCountries(agg.id);
        const merchants = await storage.getCryptoAggregatorMerchants(agg.id);
        return { ...agg, countries, assignedMerchants: merchants };
      }));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/crypto-aggregators", authMiddleware("admin"), async (req, res) => {
    try {
      const { name, type, apiKey, payoutApiKey, callbackKey } = req.body;
      if (!name || !apiKey) return res.status(400).json({ message: "Nom et clé API requis" });
      const agg = await storage.createCryptoAggregator({
        name: name.trim(),
        type: type || "oxapay",
        apiKey: apiKey.trim(),
        payoutApiKey: payoutApiKey?.trim() || null,
        callbackKey: callbackKey?.trim() || null,
        active: false,
      });
      res.json(agg);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/crypto-aggregators/:id", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { name, apiKey, payoutApiKey, callbackKey, active } = req.body;
      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (apiKey !== undefined) updateData.apiKey = apiKey.trim();
      if (payoutApiKey !== undefined) updateData.payoutApiKey = payoutApiKey?.trim() || null;
      if (callbackKey !== undefined) updateData.callbackKey = callbackKey?.trim() || null;
      if (active !== undefined) updateData.active = !!active;
      await storage.updateCryptoAggregator(id, updateData);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/crypto-aggregators/:id", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteCryptoAggregator(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/admin/crypto-aggregators/:id/countries", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { country, active } = req.body;
      if (!country || typeof active !== "boolean") return res.status(400).json({ message: "country et active requis" });
      await storage.upsertCryptoAggregatorCountry(id, country, active);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/admin/crypto-aggregators/:id/merchants", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { merchantId, active } = req.body;
      if (!merchantId || typeof active !== "boolean") return res.status(400).json({ message: "merchantId et active requis" });
      await storage.upsertCryptoAggregatorMerchant(id, Number(merchantId), active);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Route marchands : lecture des agrégateurs crypto assignés ──────────

  app.get("/api/merchant/crypto-aggregators", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const aggs = await storage.getCryptoAggregatorsByMerchant(merchantId);
      res.json(aggs.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        countries: a.countries,
      })));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Crypto : initiation paiement public (page de paiement WestPay) ─────

  app.post("/api/payment/crypto/initiate", paymentRateLimit, async (req, res) => {
    try {
      const { merchantSlug, amount, currency, description, orderId, returnUrl, amountFcfa } = req.body;
      if (!merchantSlug) {
        return res.status(400).json({ message: "merchantSlug est requis" });
      }
      const rawAmount = amount || amountFcfa;
      const rawCurrency = currency || "XOF";
      if (!rawAmount) {
        return res.status(400).json({ message: "amount est requis" });
      }
      const amountNum = Number(rawAmount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({ message: "Montant invalide" });
      }
      const merchant = await storage.getMerchantBySlug(merchantSlug);
      if (!merchant || merchant.suspended) {
        return res.status(404).json({ message: "Marchand introuvable ou suspendu" });
      }
      const aggs = await storage.getCryptoAggregatorsByMerchant(merchant.id);
      if (aggs.length === 0) {
        return res.status(403).json({ message: "Le paiement crypto n'est pas activé pour ce marchand" });
      }
      const agg = aggs[0];
      const XOF_PER_USD = parseInt(process.env.XOF_PER_USD || "600", 10);
      const isXof = rawCurrency.toUpperCase() === "XOF" || rawCurrency.toUpperCase() === "FCFA";
      const invoiceAmount = isXof ? parseFloat((amountNum / XOF_PER_USD).toFixed(2)) : amountNum;
      const invoiceCurrency = isXof ? "USD" : rawCurrency.toUpperCase();
      const callbackUrl = `${process.env.APP_URL || "https://westpay.cloud"}/api/oxapay/callback`;
      const invoiceResult = await oxapayCreateInvoice(agg.apiKey, {
        amount: invoiceAmount,
        currency: invoiceCurrency,
        lifeTime: 30,
        feePaidByPayer: 1,
        callbackUrl,
        ...(returnUrl && { returnUrl }),
        ...(description && { description }),
        ...(orderId && { orderId }),
      });
      if (invoiceResult.result !== 100 || !invoiceResult.trackId) {
        return res.status(502).json({ message: invoiceResult.message || "Échec de création de l'invoice" });
      }
      let walletAddress: string | undefined;
      let payCurrency: string | undefined;
      let payAmount: string | undefined;
      let network: string | undefined;
      try {
        const oxaStatus = await oxapayGetStatus(agg.apiKey, invoiceResult.trackId);
        if (oxaStatus.result === 100) {
          walletAddress = oxaStatus.address;
          payAmount = oxaStatus.payAmount !== undefined ? String(oxaStatus.payAmount) : undefined;
          payCurrency = oxaStatus.payCurrency;
          network = oxaStatus.network;
        }
      } catch {
      }
      await storage.createCryptoTransaction({
        aggregatorId: agg.id,
        merchantId: merchant.id,
        trackId: invoiceResult.trackId,
        amount: String(amountNum),
        currency: rawCurrency.toUpperCase(),
        status: "pending",
        callbackUrl,
        ...(returnUrl && { returnUrl }),
        ...(description && { description }),
        ...(orderId && { orderId }),
        ...(walletAddress && { walletAddress }),
        ...(payAmount && { payAmount }),
        ...(payCurrency && { payCurrency }),
        ...(network && { network }),
      });
      res.json({
        success: true,
        trackId: invoiceResult.trackId,
        payLink: invoiceResult.payLink,
        expiredAt: invoiceResult.expiredAt,
        walletAddress: walletAddress || null,
        payAmount: payAmount || null,
        payCurrency: payCurrency || null,
        network: network || null,
        amount: amountNum,
        currency: rawCurrency.toUpperCase(),
        paymentUrl: `${process.env.APP_URL || "https://westpay.cloud"}/pay/crypto/${invoiceResult.trackId}`,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Crypto : statut polling (page de paiement publique) ─────────────────

  app.get("/api/payment/crypto/:trackId/status", async (req, res) => {
    try {
      const { trackId } = req.params;
      const cryptoTx = await storage.getCryptoTransactionByTrackId(trackId);
      if (!cryptoTx) {
        return res.status(404).json({ message: "Transaction introuvable" });
      }
      const agg = await storage.getCryptoAggregatorById(cryptoTx.aggregatorId);
      if (!agg) {
        return res.status(404).json({ message: "Agrégateur introuvable" });
      }
      const oxaStatus = await oxapayGetStatus(agg.apiKey, trackId);
      if (oxaStatus.result === 100) {
        const newStatus = oxaStatus.status || cryptoTx.status;
        const updatedPayAmount = oxaStatus.payAmount !== undefined ? String(oxaStatus.payAmount) : (cryptoTx.payAmount || undefined);
        const updatedPayCurrency = oxaStatus.payCurrency || cryptoTx.payCurrency || undefined;
        if (newStatus !== cryptoTx.status) {
          await storage.updateCryptoTransactionStatus(cryptoTx.id, {
            status: newStatus,
            payAmount: updatedPayAmount,
            payCurrency: updatedPayCurrency,
            walletAddress: oxaStatus.address || undefined,
            network: oxaStatus.network || undefined,
            txHash: oxaStatus.txHash || undefined,
          });
          if (newStatus === "paid") {
            console.log(`[OXAPAY STATUS] Transaction ${trackId} payée via polling — tentative crédit`);
            await creditMerchantForCryptoTx({
              id: cryptoTx.id,
              merchantId: cryptoTx.merchantId,
              payCurrency: updatedPayCurrency || null,
              payAmount: updatedPayAmount || null,
              trackId: cryptoTx.trackId,
              orderId: cryptoTx.orderId || null,
              description: cryptoTx.description || null,
            });
          }
        }
        res.json({
          trackId,
          status: newStatus,
          amount: cryptoTx.amount,
          currency: cryptoTx.currency,
          payAmount: updatedPayAmount || null,
          payCurrency: updatedPayCurrency || null,
          address: oxaStatus.address || cryptoTx.walletAddress,
          network: oxaStatus.network || cryptoTx.network,
          txHash: oxaStatus.txHash || cryptoTx.txHash,
          expiredAt: oxaStatus.expiredAt,
          createdAt: cryptoTx.createdAt,
        });
      } else {
        res.json({
          trackId,
          status: cryptoTx.status,
          amount: cryptoTx.amount,
          currency: cryptoTx.currency,
          payAmount: cryptoTx.payAmount,
          payCurrency: cryptoTx.payCurrency,
          address: cryptoTx.walletAddress,
          network: cryptoTx.network,
          txHash: cryptoTx.txHash,
          createdAt: cryptoTx.createdAt,
        });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Crypto : infos publiques d'une transaction (page de paiement) ────────

  app.get("/api/public/crypto-payment/:trackId", async (req, res) => {
    try {
      const { trackId } = req.params;
      const cryptoTx = await storage.getCryptoTransactionByTrackId(trackId);
      if (!cryptoTx) {
        return res.status(404).json({ message: "Transaction introuvable" });
      }
      const agg = await storage.getCryptoAggregatorById(cryptoTx.aggregatorId);
      const merchant = await storage.getMerchantById(cryptoTx.merchantId);
      res.json({
        trackId,
        status: cryptoTx.status,
        amount: cryptoTx.amount,
        currency: cryptoTx.currency,
        payAmount: cryptoTx.payAmount,
        payCurrency: cryptoTx.payCurrency,
        walletAddress: cryptoTx.walletAddress,
        network: cryptoTx.network,
        txHash: cryptoTx.txHash,
        aggregatorName: "WestPay Crypto",
        merchantName: merchant?.name || "",
        createdAt: cryptoTx.createdAt,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Crypto : créer une invoice OxaPay (marchands — API directe) ─────────

  app.post("/api/merchant/crypto/invoice", cryptoApiKeyAuthMiddleware, async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const { amount, currency, description, orderId, callbackUrl, returnUrl } = req.body;
      if (amount === undefined || amount === null || !currency) {
        return res.status(400).json({ message: "amount et currency sont requis" });
      }
      const amountNum = Number(amount);
      if (isNaN(amountNum) || amountNum < 0) {
        return res.status(400).json({ message: "Montant invalide" });
      }
      const merchantAggs = await storage.getCryptoAggregatorsByMerchant(merchantId);
      if (merchantAggs.length === 0) {
        return res.status(403).json({ message: "Le paiement crypto n'est pas activé pour votre compte" });
      }
      const agg = merchantAggs[0];
      const invoiceCallbackUrl = callbackUrl || `${process.env.APP_URL || "https://westpay.cloud"}/api/oxapay/callback`;
      const XOF_PER_USD = parseInt(process.env.XOF_PER_USD || "600", 10);
      const isXof = currency.toUpperCase() === "XOF" || currency.toUpperCase() === "FCFA";
      const invoiceAmount = isXof ? parseFloat((amountNum / XOF_PER_USD).toFixed(2)) : amountNum;
      const invoiceCurrency = isXof ? "USD" : currency.toUpperCase();
      const invoiceResult = await oxapayCreateInvoice(agg.apiKey, {
        amount: invoiceAmount,
        currency: invoiceCurrency,
        lifeTime: 30,
        feePaidByPayer: 1,
        callbackUrl: invoiceCallbackUrl,
        ...(returnUrl && { returnUrl }),
        ...(description && { description }),
        ...(orderId && { orderId }),
      });
      if (invoiceResult.result !== 100 || !invoiceResult.trackId) {
        return res.status(502).json({ message: invoiceResult.message || "Échec de création de l'invoice" });
      }
      const cryptoTx = await storage.createCryptoTransaction({
        aggregatorId: agg.id,
        merchantId,
        trackId: invoiceResult.trackId,
        amount: String(amountNum),
        currency: currency.toUpperCase(),
        status: "pending",
        callbackUrl: invoiceCallbackUrl,
        ...(returnUrl && { returnUrl }),
        ...(description && { description }),
        ...(orderId && { orderId }),
      });
      res.json({
        success: true,
        trackId: invoiceResult.trackId,
        payLink: invoiceResult.payLink,
        expiredAt: invoiceResult.expiredAt,
        paymentUrl: `${process.env.APP_URL || "https://westpay.cloud"}/pay/crypto/${invoiceResult.trackId}`,
        transaction: {
          id: cryptoTx.id,
          trackId: cryptoTx.trackId,
          amount: cryptoTx.amount,
          currency: cryptoTx.currency,
          status: cryptoTx.status,
        },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Crypto : transactions marchand ─────────────────────────────────────

  app.get("/api/merchant/crypto/transactions", cryptoApiKeyAuthMiddleware, async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const txs = await storage.getCryptoTransactions(merchantId);
      res.json(txs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Crypto : soldes marchand par devise ─────────────────────────────────

  app.get("/api/merchant/crypto/balances", cryptoApiKeyAuthMiddleware, async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const balances = await storage.getCryptoBalances(merchantId);
      res.json(balances);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Crypto : cryptos disponibles (marchand connecté) ────────────────────

  app.get("/api/merchant/crypto/currencies", cryptoApiKeyAuthMiddleware, async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const aggs = await storage.getCryptoAggregatorsByMerchant(merchantId);
      if (aggs.length === 0) {
        return res.json([]);
      }
      const currencies = await oxapayGetCurrencies(aggs[0].apiKey);
      res.json(currencies);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Crypto : clé API globale marchand ───────────────────────────────────

  app.get("/api/merchant/crypto/api-key", cryptoApiKeyAuthMiddleware, async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant) return res.status(404).json({ message: "Marchand introuvable" });
      res.json({ cryptoApiKey: merchant.cryptoApiKey || null });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/merchant/crypto/regenerate-api-key", cryptoApiKeyAuthMiddleware, async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const aggs = await storage.getCryptoAggregatorsByMerchant(merchantId);
      if (aggs.length === 0) {
        return res.status(403).json({ message: "Le paiement crypto n'est pas activé pour votre compte" });
      }
      const newKey = "WP-CRYPTO-" + crypto.randomBytes(20).toString("hex").toUpperCase();
      await storage.updateMerchantCryptoApiKey(merchantId, newKey);
      res.json({ cryptoApiKey: newKey, message: "Clé API crypto régénérée avec succès" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Crypto : demandes de retrait (marchand) ─────────────────────────────

  app.post("/api/merchant/crypto/withdraw", cryptoApiKeyAuthMiddleware, async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const { currency, amount, walletAddress, network } = req.body;
      if (!currency?.trim() || !amount || !walletAddress?.trim()) {
        return res.status(400).json({ message: "currency, amount et walletAddress sont requis" });
      }
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({ message: "Montant invalide" });
      }
      const balances = await storage.getCryptoBalances(merchantId);
      const bal = balances.find(b => b.currency.toUpperCase() === currency.toUpperCase());
      const available = parseFloat(bal?.balance || "0");
      if (amountNum > available) {
        return res.status(400).json({ message: `Solde insuffisant. Disponible : ${available.toFixed(8)} ${currency}` });
      }
      const merchant = await storage.getMerchantById(merchantId);
      const withdrawFeeRate = merchant?.feeExempt ? 0 : CRYPTO_FEE_RATE;
      const feeAmount = amountNum * withdrawFeeRate;
      const netAmount = amountNum - feeAmount;
      await storage.deductCryptoBalance(merchantId, currency.toUpperCase(), amountNum);
      const wr = await storage.createCryptoWithdrawalRequest({
        merchantId,
        currency: currency.toUpperCase(),
        amount: amountNum.toFixed(8),
        feeAmount: feeAmount.toFixed(8),
        netAmount: netAmount.toFixed(8),
        walletAddress: walletAddress.trim(),
        network: network?.trim() || null,
        status: "pending",
      });
      res.json({
        id: wr.id,
        message: "Demande de retrait soumise avec succès",
        withdrawal: wr,
        fee: { rate: `${(withdrawFeeRate * 100).toFixed(0)}%`, feeAmount: feeAmount.toFixed(8), netAmount: netAmount.toFixed(8) },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/merchant/crypto/withdrawals", cryptoApiKeyAuthMiddleware, async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const reqs = await storage.getCryptoWithdrawalRequestsByMerchant(merchantId);
      res.json(reqs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Crypto : retraits (admin) ────────────────────────────────────────────

  app.get("/api/admin/crypto/withdrawals", authMiddleware("admin"), async (_req, res) => {
    try {
      const reqs = await storage.getAllCryptoWithdrawalRequests();
      res.json(reqs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/crypto/withdrawals/:id", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status, adminNote } = req.body;
      if (!["pending", "processing", "completed", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Statut invalide" });
      }
      await storage.updateCryptoWithdrawalRequest(id, status, adminNote);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Crypto : régénération clé API crypto (admin) ────────────────────────

  app.put("/api/admin/merchant/:id/crypto/regenerate-key", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = Number(req.params.id);
      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant) return res.status(404).json({ message: "Marchand introuvable" });
      const newKey = "WP-CRYPTO-" + crypto.randomBytes(20).toString("hex").toUpperCase();
      await storage.updateMerchantCryptoApiKey(merchantId, newKey);
      res.json({ cryptoApiKey: newKey, message: "Clé API crypto régénérée" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Crypto : statut legacy (gardé pour rétrocompatibilité) ──────────────

  app.get("/api/crypto/status/:trackId", async (req, res) => {
    res.redirect(301, `/api/payment/crypto/${req.params.trackId}/status`);
  });

  // ─── Crypto : webhook OxaPay (callback) ─────────────────────────────────

  app.post("/api/oxapay/callback", async (req, res) => {
    try {
      const payload: OxaPayWebhookPayload = req.body;
      console.log("[OXAPAY CALLBACK]", JSON.stringify(payload));
      const { trackId, status } = payload;
      if (!trackId) {
        return res.status(400).json({ message: "trackId manquant" });
      }
      const cryptoTx = await storage.getCryptoTransactionByTrackId(trackId);
      if (!cryptoTx) {
        console.warn(`[OXAPAY CALLBACK] Transaction inconnue: ${trackId}`);
        return res.status(200).json({ ok: true });
      }
      const agg = await storage.getCryptoAggregatorById(cryptoTx.aggregatorId);
      if (!agg) {
        console.warn(`[OXAPAY CALLBACK] Agrégateur introuvable pour tx ${trackId}`);
        return res.status(200).json({ ok: true });
      }
      if (!agg.callbackKey) {
        console.error(`[OXAPAY CALLBACK] SÉCURITÉ : aucune callbackKey configurée pour agrégateur ${agg.id} (${agg.name}) — callback rejeté`);
        return res.status(403).json({ message: "Callback rejeté : callbackKey non configurée pour cet agrégateur" });
      }
      const valid = oxapayVerifyWebhook(agg.callbackKey, payload);
      if (!valid) {
        console.warn(`[OXAPAY CALLBACK] Signature HMAC invalide pour trackId=${trackId} — agrégateur ${agg.id}`);
        return res.status(401).json({ message: "Signature HMAC invalide" });
      }
      if (status) {
        const cbPayAmount = payload.payAmount !== undefined ? String(payload.payAmount) : (cryptoTx.payAmount || undefined);
        const cbPayCurrency = payload.payCurrency || cryptoTx.payCurrency || undefined;
        if (status !== cryptoTx.status) {
          await storage.updateCryptoTransactionStatus(cryptoTx.id, {
            status,
            payAmount: cbPayAmount,
            payCurrency: cbPayCurrency,
            network: payload.network || undefined,
            txHash: payload.txHash || undefined,
          });
          console.log(`[OXAPAY CALLBACK] Transaction ${trackId} mise à jour: ${cryptoTx.status} → ${status}`);
        } else {
          console.log(`[OXAPAY CALLBACK] Statut inchangé pour ${trackId} (${status})`);
        }
        if (status === "paid") {
          console.log(`[OXAPAY CALLBACK] Transaction ${trackId} payée — tentative crédit`);
          await creditMerchantForCryptoTx({
            id: cryptoTx.id,
            merchantId: cryptoTx.merchantId,
            payCurrency: cbPayCurrency || null,
            payAmount: cbPayAmount || null,
            trackId: cryptoTx.trackId,
            orderId: cryptoTx.orderId || null,
            description: cryptoTx.description || null,
          });
        }
      }
      res.status(200).json({ ok: true });
    } catch (err: any) {
      console.error("[OXAPAY CALLBACK ERROR]", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Crypto : transactions admin ─────────────────────────────────────────

  app.get("/api/admin/crypto/transactions", authMiddleware("admin"), async (_req, res) => {
    try {
      const txs = await storage.getCryptoTransactions();
      res.json(txs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── WestPay SDK API v1 ────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  async function sdkAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    const sdkKey = req.headers["x-sdk-key"] as string | undefined;
    if (!sdkKey) return res.status(401).json({ status: "error", message: "Clé SDK manquante. Fournissez X-SDK-Key dans les headers." });
    const merchant = await storage.getMerchantBySdkKey(sdkKey);
    if (!merchant || !merchant.sdkEnabled) return res.status(401).json({ status: "error", message: "Clé SDK invalide ou SDK désactivé pour ce compte." });
    if (merchant.suspended) return res.status(403).json({ status: "error", message: "Compte marchand suspendu." });
    (req as any).sdkMerchant = merchant;
    next();
  }

  // Admin: lister marchands avec statut SDK
  app.get("/api/admin/sdk/merchants", authMiddleware("admin"), async (_req, res) => {
    try {
      const allMerchants = await storage.getMerchants();
      const list = allMerchants.map(m => ({
        id: m.id,
        name: m.name,
        email: m.email,
        sdkEnabled: m.sdkEnabled,
        sdkApiKey: m.sdkApiKey,
      }));
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Admin: activer SDK pour un marchand
  app.post("/api/admin/sdk/merchants/:id/enable", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant) return res.status(404).json({ message: "Marchand introuvable" });
      const sdkKey = "WP-SDK-" + crypto.randomBytes(24).toString("hex").toUpperCase();
      await storage.enableMerchantSdk(merchantId, sdkKey);
      res.json({ message: "SDK activé", sdkApiKey: sdkKey });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Admin: désactiver SDK pour un marchand
  app.post("/api/admin/sdk/merchants/:id/disable", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      await storage.disableMerchantSdk(merchantId);
      res.json({ message: "SDK désactivé" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Admin: régénérer clé SDK
  app.post("/api/admin/sdk/merchants/:id/regenerate", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant || !merchant.sdkEnabled) return res.status(400).json({ message: "SDK non activé pour ce marchand" });
      const sdkKey = "WP-SDK-" + crypto.randomBytes(24).toString("hex").toUpperCase();
      await storage.enableMerchantSdk(merchantId, sdkKey);
      res.json({ message: "Clé SDK régénérée", sdkApiKey: sdkKey });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Merchant: récupérer statut SDK (onglet SDK dashboard)
  app.get("/api/merchant/sdk/status", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant) return res.status(404).json({ sdkEnabled: false });
      res.json({ sdkEnabled: merchant.sdkEnabled, sdkApiKey: merchant.sdkEnabled ? merchant.sdkApiKey : null });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── SDK API v1 : Payin ────────────────────────────────────────

  app.post("/api/sdk/v1/payin", sdkAuthMiddleware, async (req, res) => {
    try {
      const merchant = (req as any).sdkMerchant;
      const { amount, currency, order_id, callback_url, metadata } = req.body;
      if (!amount || !currency || !order_id || !callback_url || !metadata?.phone_number || !metadata?.network || !metadata?.country_code) {
        return res.status(400).json({ status: "error", message: "Paramètres manquants: amount, currency, order_id, callback_url, metadata.phone_number, metadata.network, metadata.country_code requis." });
      }
      if (typeof amount !== "number" || amount <= 0) {
        return res.status(400).json({ status: "error", message: "amount doit être un nombre positif." });
      }
      const mbiyoApiKey = await getMbiyoApiKey();
      if (!mbiyoApiKey) return res.status(503).json({ status: "error", message: "Passerelle de paiement non configurée." });

      const countryMap: Record<string, string> = {
        "TG": "Togo", "BJ": "Benin", "CI": "Cote d'Ivoire", "SN": "Senegal",
        "ML": "Mali", "BF": "Burkina Faso", "CM": "Cameroun", "CG": "Congo Brazzaville",
        "CD": "Congo RDC", "GN": "Guinee", "GM": "Gambie",
      };
      const countryName = countryMap[metadata.country_code.toUpperCase()] || metadata.country_code;

      const internalRef = mbiyoGenerateRef();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await storage.createPendingPayment({
        merchantId: merchant.id,
        country: countryName,
        amount,
        payerPhone: metadata.phone_number,
        payerName: metadata.customer_name || null,
        paymentMethod: metadata.network,
        txId: null,
        status: "pending",
        redirectUrl: callback_url,
        omnipayReference: internalRef,
        omnipayTxId: null,
        omnipayPaymentUrl: null,
        gateway: "westpay",
        expiresAt,
      });

      const appUrl = process.env.APP_URL || "https://westpay.cloud";
      const mbiyoResult = await mbiyoInitiatePayin({
        apiKey: mbiyoApiKey,
        amount,
        currency: currency.toUpperCase(),
        orderId: internalRef,
        callbackUrl: `${appUrl}/api/mbiyo/callback`,
        network: metadata.network,
        phoneNumber: metadata.phone_number,
        countryCode: metadata.country_code.toUpperCase(),
      });

      if (mbiyoResult.status !== "success" && mbiyoResult.status !== "pending") {
        return res.status(422).json({ status: "error", message: mbiyoResult.message || "Echec initiation paiement", data: null });
      }

      await storage.createApiLog({ merchantId: merchant.id, action: "sdk_payin_initiated", ip: req.ip || "-", description: `SDK Payin — Ref: ${internalRef} — ${amount} ${currency} via ${metadata.network}/${metadata.country_code}` });

      res.json({
        status: "success",
        message: "Paiement initié avec succès",
        data: {
          reference: internalRef,
          transaction_id: mbiyoResult.data?.transaction_id || null,
          amount,
          currency: currency.toUpperCase(),
          order_id,
          status: "pending",
          payment_method: "mobile_money",
          network: metadata.network,
          country_code: metadata.country_code,
          redirect_url: mbiyoResult.data?.redirect_url || null,
          instructions: mbiyoResult.data?.instructions || null,
          created_at: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      console.error("[SDK PAYIN ERROR]", err.message);
      res.status(500).json({ status: "error", message: "Erreur interne du serveur", data: null });
    }
  });

  // ─── SDK API v1 : Payout ───────────────────────────────────────

  app.post("/api/sdk/v1/payout", sdkAuthMiddleware, async (req, res) => {
    try {
      const merchant = (req as any).sdkMerchant;
      const { amount, currency, order_id, callback_url, metadata } = req.body;
      if (!amount || !currency || !order_id || !callback_url || !metadata?.phone_number || !metadata?.network || !metadata?.country_code) {
        return res.status(400).json({ status: "error", message: "Paramètres manquants: amount, currency, order_id, callback_url, metadata.phone_number, metadata.network, metadata.country_code requis." });
      }
      if (typeof amount !== "number" || amount <= 0) {
        return res.status(400).json({ status: "error", message: "amount doit être un nombre positif." });
      }

      const countryMap: Record<string, string> = {
        "TG": "Togo", "BJ": "Benin", "CI": "Cote d'Ivoire", "SN": "Senegal",
        "ML": "Mali", "BF": "Burkina Faso", "CM": "Cameroun", "CG": "Congo Brazzaville",
        "CD": "Congo RDC", "GN": "Guinee", "GM": "Gambie",
      };
      const countryName = countryMap[metadata.country_code.toUpperCase()] || metadata.country_code;

      const feeRate = merchant.feeExempt ? 0 : getWithdrawalFeeRate(countryName);
      const totalDeducted = Math.ceil(amount * (1 + feeRate));

      const mc = await storage.findMerchantCountryBySimAndCountry(merchant.id, countryName);
      if (!mc) return res.status(422).json({ status: "error", message: `Compte ${countryName} non trouvé pour ce marchand.` });
      if (mc.balance < totalDeducted) {
        return res.status(422).json({
          status: "error",
          message: "Solde insuffisant pour ce retrait.",
          data: { required_amount: totalDeducted, available_balance: mc.balance, currency: currency.toUpperCase() },
        });
      }

      const mbiyoApiKey = await getMbiyoApiKey();
      if (!mbiyoApiKey) return res.status(503).json({ status: "error", message: "Passerelle de paiement non configurée." });

      const internalRef = mbiyoGenerateRef();

      await storage.updateMerchantCountryBalance(mc.id, mc.balance - totalDeducted);

      const appUrl = process.env.APP_URL || "https://westpay.cloud";
      const mbiyoResult = await mbiyoInitiatePayout({
        apiKey: mbiyoApiKey,
        amount,
        currency: currency.toUpperCase(),
        orderId: internalRef,
        callbackUrl: `${appUrl}/api/mbiyo/payout-callback`,
        network: metadata.network,
        phoneNumber: metadata.phone_number,
        countryCode: metadata.country_code.toUpperCase(),
        beneficiary: metadata.beneficiary || "Marchand WestPay",
      });

      if (mbiyoResult.status !== "success" && mbiyoResult.status !== "pending") {
        await storage.updateMerchantCountryBalance(mc.id, mc.balance);
        return res.status(422).json({ status: "error", message: mbiyoResult.message || "Echec initiation du payout", data: null });
      }

      const fees = totalDeducted - amount;
      await storage.createWithdrawal({
        merchantId: merchant.id,
        merchantCountryId: mc.id,
        country: countryName,
        amount,
        phone: metadata.phone_number,
        status: "processing",
        withdrawalMode: "auto",
        operator: metadata.network,
        adminNote: null,
        fees,
        gateway: "westpay",
        omnipayRef: internalRef,
      });

      await storage.createApiLog({ merchantId: merchant.id, action: "sdk_payout_initiated", ip: req.ip || "-", description: `SDK Payout — Ref: ${internalRef} — ${amount} ${currency} vers ${metadata.phone_number} via ${metadata.network}/${metadata.country_code}` });

      res.json({
        status: "success",
        message: "Payout initié avec succès",
        data: {
          reference: internalRef,
          transaction_id: mbiyoResult.data?.transaction_id || null,
          amount,
          fee: fees,
          charged_amount: totalDeducted,
          currency: currency.toUpperCase(),
          order_id,
          status: "pending",
          payment_method: "mobile_money",
          recipient: {
            phone_number: metadata.phone_number,
            network: metadata.network,
            country_code: metadata.country_code,
            beneficiary: metadata.beneficiary || null,
          },
          created_at: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      console.error("[SDK PAYOUT ERROR]", err.message);
      res.status(500).json({ status: "error", message: "Erreur interne du serveur", data: null });
    }
  });

  // ─── SDK API v1 : Statut transaction ──────────────────────────

  app.get("/api/sdk/v1/transaction/:orderId", sdkAuthMiddleware, async (req, res) => {
    try {
      const merchant = (req as any).sdkMerchant;
      const { orderId } = req.params;
      const pending = await storage.getPendingPaymentByOmnipayReference(orderId);
      if (pending && pending.merchantId === merchant.id) {
        return res.json({
          status: "success",
          data: {
            reference: orderId,
            amount: pending.amount,
            status: pending.status,
            payment_method: "mobile_money",
            network: pending.paymentMethod,
            country: pending.country,
            phone_number: pending.payerPhone,
            created_at: pending.createdAt,
          },
        });
      }
      const tx = await storage.getTransactionByTxId(orderId);
      if (tx && tx.merchantId === merchant.id) {
        return res.json({
          status: "success",
          data: {
            reference: orderId,
            amount: tx.amount,
            status: tx.status,
            payment_method: "mobile_money",
            network: tx.operator,
            country: tx.country,
            phone_number: tx.payerNumber,
            created_at: tx.createdAt,
          },
        });
      }
      const withdrawal = await storage.getWithdrawalByOmnipayRef(orderId);
      if (withdrawal && withdrawal.merchantId === merchant.id) {
        return res.json({
          status: "success",
          data: {
            reference: orderId,
            amount: withdrawal.amount,
            fee: withdrawal.fees,
            status: withdrawal.status,
            type: "payout",
            network: withdrawal.operator,
            country: withdrawal.country,
            phone_number: withdrawal.phone,
            created_at: withdrawal.createdAt,
          },
        });
      }
      return res.status(404).json({ status: "error", message: "Transaction introuvable ou non autorisée." });
    } catch (err: any) {
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // ─── SDK API v1 : Solde marchand ──────────────────────────────

  app.get("/api/sdk/v1/balance", sdkAuthMiddleware, async (req, res) => {
    try {
      const merchant = (req as any).sdkMerchant;
      const countries = await storage.getMerchantCountries(merchant.id);
      const balances = countries.filter(c => c.active).map(c => ({
        country: c.country,
        balance: c.balance,
        currency: (() => {
          const cur: Record<string, string> = {
            "Togo": "XOF", "Benin": "XOF", "Cote d'Ivoire": "XOF", "Senegal": "XOF",
            "Mali": "XOF", "Burkina Faso": "XOF", "Cameroun": "XAF",
            "Congo Brazzaville": "XAF", "Congo RDC": "CDF", "Guinee": "GNF", "Gambie": "GMD",
          };
          return cur[c.country] || "XOF";
        })(),
      }));
      res.json({ status: "success", data: { balances } });
    } catch (err: any) {
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // ─── ADMIN: Send notification emails ──────────────────────────────────────

  app.post("/api/admin/notify", authMiddleware("admin"), async (req, res) => {
    try {
      const { subject, message, to } = req.body;
      if (!subject || !subject.trim()) return res.status(400).json({ message: "Sujet requis" });
      if (!message || !message.trim()) return res.status(400).json({ message: "Message requis" });

      const { sendAdminNotificationEmail } = await import("./email");

      if (to && to.trim()) {
        // Send to a single specific email
        const ok = await sendAdminNotificationEmail(to.trim(), subject.trim(), message.trim());
        if (!ok) return res.status(500).json({ message: "Échec envoi email — vérifiez RESEND_API_KEY" });
        return res.json({ message: "Email envoyé", count: 1, recipients: [to.trim()] });
      }

      // Send to ALL active merchants
      const merchants = await storage.getMerchants();
      const targets = merchants.filter((m: any) => m.email && m.status !== "suspended");
      if (targets.length === 0) return res.status(400).json({ message: "Aucun marchand actif trouvé" });

      let sent = 0;
      const failed: string[] = [];
      for (const m of targets) {
        const ok = await sendAdminNotificationEmail(m.email, subject.trim(), message.trim(), m.name);
        if (ok) sent++; else failed.push(m.email);
      }
      return res.json({ message: `Envoyé à ${sent}/${targets.length} marchands`, count: sent, failed });
    } catch (err: any) {
      console.error("[ADMIN NOTIFY]", err);
      res.status(500).json({ message: err.message || "Erreur serveur" });
    }
  });

  // ─── SDK API v1 : Ping ────────────────────────────────────────

  app.get("/api/sdk/v1/ping", sdkAuthMiddleware, async (req, res) => {
    const merchant = (req as any).sdkMerchant;
    res.json({ status: "success", message: "WestPay SDK opérationnel", merchant: merchant.name, timestamp: new Date().toISOString() });
  });

  return httpServer;
}
