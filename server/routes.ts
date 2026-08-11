import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { promises as dnsPromises } from "dns";
import { storage } from "./storage";
import { db, pool, financialDb, financialPool } from "./db";
import { generateSecret as totpGenerateSecret, generateURI as totpGenerateURI, verifySync as totpVerifySync } from "otplib";
import QRCode from "qrcode";
import { admins, merchantCountries, transactions, pendingPayments } from "@shared/schema";
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
  seapayPayin,
  seapayPayout,
  seapayBalance as seapayGetBalance,
  seapayQuery,
  buildSeapaySign,
  verifySeapaySign,
  seapayGenerateRef,
  SEAPAY_CURRENCY_COUNTRY,
} from "./seapay";
import {
  createPayment as sendavaCreatePayment,
  getOperators as sendavaGetOperators,
  initiatePayment as sendavaInitiatePayment,
  getPaymentStatus as sendavaGetPaymentStatus,
  verifyPayment as sendavaVerifyPayment,
  initiateWithdraw as sendavaInitiateWithdraw,
  getBalance as sendavaGetBalance,
  getTransactions as sendavaGetTransactions,
  configureWebhook as sendavaConfigureWebhook,
  generateReference as sendavaGenerateRef,
  verifyWebhookSignature as sendavaVerifySignature,
  getWithdrawalStatus as sendavaGetWithdrawalStatus,
  toSendavaOperator,
  SENDAVAPAY_COUNTRY_CODES,
  SENDAVAPAY_CURRENCY_MAP,
  type SendavaWebhookPayload,
} from "./sendavapay";
import { pollSendavaWithdrawalBackground } from "./reconciliation";
import {
  clapayInitiatePayin,
  clapayInitiatePayout,
  clapayGetBalance,
  clapayGetTransactionStatus,
  verifyClapaySignature,
  generateReference as clapayGenerateRef,
  clapayCountryCode,
  clapayCurrency,
  clapayLocalPhone,
  clapaySelectTunnel,
  clapayValidatePhone,
  isClapayCheckoutOperator,
  type ClapayWebhookPayload,
} from "./clapay";
import { maskPhone as maskPhoneForLog, maskAddress as maskAddressForLog } from "./logMask";
import {
  getCollectionFeeRate, getWithdrawalFeeRate, calcMerchantCredit,
  FLAT_PAYIN_FEE, loadFeeConfig, saveFeeConfig, getFeeSnapshot,
} from "./feeConfig";

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

// ── Rate limiter en mémoire pour les routes de retrait ─────────────────────
// Limite : max 5 demandes par IP par fenêtre de 10 minutes.
// Séparé de l'anti-doublon DB (2h) — ici on bloque les rafales brutes.
const _withdrawalRateMap = new Map<string, { count: number; windowStart: number }>();
const WITHDRAWAL_RATE_WINDOW_MS = 10 * 60 * 1000; // 10 min
const WITHDRAWAL_RATE_MAX = 5;

function checkWithdrawalRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = _withdrawalRateMap.get(ip);
  if (!entry || now - entry.windowStart > WITHDRAWAL_RATE_WINDOW_MS) {
    _withdrawalRateMap.set(ip, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (entry.count >= WITHDRAWAL_RATE_MAX) {
    const retryAfterSec = Math.ceil((WITHDRAWAL_RATE_WINDOW_MS - (now - entry.windowStart)) / 1000);
    return { allowed: false, retryAfterSec };
  }
  entry.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

// ── Invalidation de sessions — toutes les sessions antérieures au redémarrage sont invalides ─
// Cela déconnecte automatiquement tous les comptes connectés lors d'un redémarrage Plesk/serveur
const SESSION_START = Date.now();

// ── Restriction géographique absolue — seuls le Togo et la Côte d'Ivoire peuvent accéder au panel admin ─
// Toute tentative depuis un autre pays est bloquée immédiatement et l'IP auto-blacklistée.
// ip-api.com retourne "Togo" pour le Togo et "Ivory Coast" pour la Côte d'Ivoire.
const ADMIN_GEO_WHITELIST = ["togo", "ivory coast", "côte d'ivoire", "cote d'ivoire", "cote divoire"];

// Cache géo — évite de requêter ip-api.com à chaque appel API, TTL 10 min par IP
const _geoCache = new Map<string, { country: string; allowed: boolean; ts: number }>();
const GEO_CACHE_TTL = 10 * 60 * 1000;

async function checkAdminGeoAllowed(ip: string): Promise<{ allowed: boolean; country: string }> {
  // IPs locales — autorisées uniquement en développement local
  const isLocal = ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.") || ip.startsWith("172.") || ip === "unknown" || ip === "local";
  if (isLocal) {
    return { allowed: process.env.NODE_ENV === "development", country: "local" };
  }
  // IP spoofée — toujours refusée (déjà marquée SPOOFED: par getClientIp)
  if (ip.startsWith("SPOOFED:")) {
    return { allowed: false, country: "spoofed" };
  }
  // Vérification du cache
  const hit = _geoCache.get(ip);
  if (hit && Date.now() - hit.ts < GEO_CACHE_TTL) {
    return { allowed: hit.allowed, country: hit.country };
  }
  // Résolution géographique via ip-api.com
  // FAIL-OPEN intentionnel : si ip-api.com est indisponible ou lente, on autorise la session.
  // Le JWT (signé avec SESSION_SECRET) est la protection principale.
  // La restriction géo est une couche supplémentaire, pas le verrou primaire.
  // Sans fail-open, un redémarrage Passenger vide le cache → première requête = geo lookup
  // → ip-api.com timeout → country="" → 403 → useAdminFetch logout() → déconnexion parasite.
  const geo = await getGeoInfo(ip).catch(() => null);
  if (!geo || !geo.country) {
    // ip-api.com indisponible — autoriser, cache court (90s) pour re-tenter
    _geoCache.set(ip, { country: "inconnu", allowed: true, ts: Date.now() - (GEO_CACHE_TTL - 90_000) });
    return { allowed: true, country: "inconnu" };
  }
  const countryRaw = geo.country || "";
  const countryLower = countryRaw.toLowerCase().trim();
  const allowed = countryLower !== "" && ADMIN_GEO_WHITELIST.some(c => countryLower === c || countryLower.includes(c));
  _geoCache.set(ip, { country: countryRaw || "inconnu", allowed, ts: Date.now() });
  return { allowed, country: countryRaw || "inconnu" };
}

// Extraction IP minimale utilisable hors de registerRoutes (authMiddleware)
function extractIp(req: Request): string {
  // Cloudflare transmet la vraie IP du visiteur dans CF-Connecting-IP (non spoofable
  // tant que le trafic passe par Cloudflare) — priorité absolue quand présent.
  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string" && cfIp.length > 0 && cfIp.length < 64) {
    return cfIp.replace(/^::ffff:/, "").trim();
  }
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(",")[0].trim().replace(/^::ffff:/, "");
    // Plages privées/réservées = tentative de spoofing → bloquer
    if (/^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.0\.2\.|192\.168\.|198\.51\.100\.|203\.0\.113\.|224\.|240\.|255\.255\.255\.255$)/.test(first)) {
      return `SPOOFED:${first}`;
    }
    return first;
  }
  return (req.ip || req.socket?.remoteAddress || "unknown").replace(/^::ffff:/, "");
}

// ── OTP marchands — JAMAIS stockés en base de données, uniquement en mémoire RAM ──────
// Les OTPs marchands sont désormais stockés en base de données (table merchant_login_otps)
// afin de survivre aux redémarrages du serveur. Le hash bcrypt garantit la sécurité.

// ── Vérification DNS MX — l'email doit pointer vers un vrai serveur mail ─────────────
// Protège contre la création de marchands avec des adresses email inventées.
async function verifyEmailDomainHasMx(email: string): Promise<boolean> {
  try {
    const domain = email.split("@")[1];
    if (!domain || domain.length < 4) return false;
    const records = await dnsPromises.resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}

// ── Chiffrement AES-256-GCM des secrets TOTP — jamais stockés en clair en base ─
// Les codes Google Authenticator (6 chiffres) ne sont JAMAIS sauvegardés — seul le secret
// chiffré est stocké, et uniquement pour vérifier les futurs codes.
function encryptTotpSecret(plainSecret: string): string {
  const key = crypto.createHash("sha256").update(JWT_SECRET + ":totp-key-v1").digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plainSecret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `ENC:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

function decryptTotpSecret(stored: string): string {
  if (!stored || !stored.startsWith("ENC:")) return stored; // rétrocompat secrets non-chiffrés
  const parts = stored.split(":");
  if (parts.length !== 4) throw new Error("Format secret TOTP invalide");
  const key = crypto.createHash("sha256").update(JWT_SECRET + ":totp-key-v1").digest();
  const [, ivHex, tagHex, encHex] = parts;
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(encHex, "hex")).toString("utf8") + decipher.final("utf8");
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
  return process.env.SENDAVA_API_KEY || process.env.SENDAVAPAY_API_KEY || await storage.getSetting("sendavapay_api_key");
}

async function getSendavaWebhookSecret(): Promise<string | undefined> {
  return process.env.SENDAVA_WEBHOOK_SECRET || process.env.SENDAVAPAY_WEBHOOK_SECRET || await storage.getSetting("sendavapay_webhook_secret");
}

async function getClapayApiKey(): Promise<string | undefined> {
  return process.env.CLAPAY_API_KEY || await storage.getSetting("clapay_api_key");
}

async function getClapayWebhookSecret(): Promise<string | undefined> {
  return process.env.CLAPAY_WEBHOOK_SECRET || await storage.getSetting("clapay_webhook_secret");
}

async function getClapayWebhookUniqueKey(): Promise<string | undefined> {
  return process.env.CLAPAY_WEBHOOK_UNIQUE_KEY || await storage.getSetting("clapay_webhook_unique_key");
}

/* SeaPay : chaque pays possede son propre compte marchand (merchant_id/api_key/api_secret distincts) */
const SEAPAY_COUNTRIES = ["Pakistan", "Philippines", "India", "Nigeria"] as const;
const SEAPAY_COUNTRY_FROM_CURRENCY: Record<string, string> = {
  PKR: "Pakistan",
  PHP: "Philippines",
  INR: "India",
  NGN: "Nigeria",
  BDT: "Bangladesh",
  VND: "Vietnam",
  EGP: "Egypt",
};
function seapayCountrySlug(country: string): string {
  return country.trim().toLowerCase().replace(/[^a-z]/g, "");
}
function seapayCountryEnvPrefix(country: string): string {
  return `SEAPAY_${country.trim().toUpperCase().replace(/[^A-Z]/g, "")}`;
}
async function getSeapayMerchantId(country: string): Promise<string | undefined> {
  const envPrefix = seapayCountryEnvPrefix(country);
  // Uniquement la variable pays-spécifique (ex: SEAPAY_PAKISTAN_MERCHANT_ID)
  // Les variables génériques sans pays (SEAPAY_MERCHANT_ID) ne sont plus acceptées
  // pour éviter qu'un mauvais compte s'applique à un autre pays.
  return process.env[`${envPrefix}_MERCHANT_ID`]
    || await storage.getSetting(`seapay_merchant_id_${seapayCountrySlug(country)}`);
}
async function getSeapayApiKey(country: string): Promise<string | undefined> {
  const envPrefix = seapayCountryEnvPrefix(country);
  return process.env[`${envPrefix}_API_KEY`]
    || await storage.getSetting(`seapay_api_key_${seapayCountrySlug(country)}`);
}
async function getSeapayApiSecret(country: string): Promise<string | undefined> {
  const envPrefix = seapayCountryEnvPrefix(country);
  return process.env[`${envPrefix}_API_SECRET`]
    || await storage.getSetting(`seapay_api_secret_${seapayCountrySlug(country)}`);
}

// Nettoie tout message avant qu'il soit visible par un marchand/client (adminNote,
// réponse API publique/merchant) : jamais de nom de prestataire ni de jargon interne.
function toMerchantSafeMessage(msg: string | null | undefined): string {
  if (!msg) return "";
  return msg
    .replace(/sendava\s*pay/gi, "le service de paiement")
    .replace(/sendava/gi, "le service de paiement")
    .replace(/omnipay/gi, "le service de paiement")
    .replace(/mbiyo/gi, "le service de paiement")
    .replace(/r[ée]conciliation/gi, "vérification")
    .replace(/polling/gi, "vérification")
    .trim();
}

/* Pays fermés aux transferts inter-pays (wallet transfer interdit — devise isolée) */
const NO_WALLET_TRANSFER_COUNTRIES = new Set(["Niger", "Kenya", "Ghana"]);

/** Calcule le montant net crédité au marchand en tenant compte du taux personnalisé. */
function calcMerchantCreditForMerchant(
  grossAmount: number,
  country: string | null | undefined,
  merchant: { feeExempt?: boolean; customFeeRate?: number | null } | null | undefined
): number {
  if (merchant?.customFeeRate != null) {
    // Taux personnalisé (ex: 3.5 → 3.5%) — frais fixes pays conservés
    const flatFee = country && FLAT_PAYIN_FEE[country] ? FLAT_PAYIN_FEE[country] : 0;
    return Math.max(0, Math.floor(grossAmount * (1 - merchant.customFeeRate / 100) - flatFee));
  }
  if (merchant?.feeExempt) return grossAmount; // 0% — totalement gratuit
  return calcMerchantCredit(grossAmount, country);
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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "2d" });
}

/** Pose le JWT dans un cookie httpOnly (inaccessible au JS) — protection XSS */
function setAuthCookie(res: Response, token: string) {
  res.cookie("wp_auth", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // "lax" (et non "strict") : avec strict, ouvrir le site depuis un lien externe
    // (Telegram, WhatsApp, email) n'envoie pas le cookie → l'utilisateur paraît
    // déconnecté. "lax" garde la protection CSRF sur les requêtes POST cross-site.
    sameSite: "lax",
    maxAge: 2 * 24 * 60 * 60 * 1000, // 2 jours — aligné sur l'expiry JWT
    path: "/",
  });
}

function authMiddleware(role: "admin" | "merchant") {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Lire le token depuis le cookie httpOnly OU le header Authorization (compat API)
    const auth = req.headers.authorization;
    const cookieToken = (req as any).cookies?.wp_auth as string | undefined;
    let tokenStr: string | undefined;
    if (auth && auth.startsWith("Bearer ")) {
      tokenStr = auth.split(" ")[1];
    } else if (cookieToken) {
      tokenStr = cookieToken;
    }
    if (!tokenStr) {
      return res.status(401).json({ message: "Non autorise" });
    }
    try {
      const decoded = jwt.verify(tokenStr, JWT_SECRET) as any;
      if (decoded.role !== role) {
        return res.status(403).json({ message: "Acces interdit" });
      }
      // ── Restriction géographique sur chaque requête admin ─────────────────────
      // Bloque immédiatement et blackliste l'IP si le pays n'est pas Togo ou Côte d'Ivoire.
      // Cela empêche même une session valide depuis un autre pays d'accéder au dashboard.
      if (role === "admin") {
        const clientIp = extractIp(req);
        const geoCheck = await checkAdminGeoAllowed(clientIp);
        if (!geoCheck.allowed) {
          storage.createSecurityLog({
            eventType: "country_blocked",
            ip: clientIp,
            userEmail: decoded.email || "?",
            action: "admin_request_blocked_geo",
            details: `Pays non autorisé : ${geoCheck.country} — accès dashboard bloqué`,
          }).catch(() => {});
          // Auto-blacklist de l'IP (sauf IP locale ou spoofée déjà gérée)
          if (!clientIp.startsWith("SPOOFED:") && clientIp !== "local" && clientIp !== "unknown") {
            storage.addBlockedIp({ ipAddress: clientIp, reason: `Accès admin hors zone autorisée — ${geoCheck.country}`, blockedBy: "système-géo" }).catch(() => {});
            // Invalider le cache pour forcer la re-vérification à la prochaine tentative
            _geoCache.delete(clientIp);
          }
          return res.status(403).json({ message: "Accès refusé" });
        }
      }

      // Vérification critique : s'assurer que le compte existe toujours en base
      // + vérification de révocation de token (tokenInvalidatedAt)
      if (role === "admin") {
        const admin = await storage.getAdminById(decoded.id);
        if (!admin) {
          return res.status(401).json({ message: "Compte administrateur introuvable ou supprimé" });
        }
        if (admin.tokenInvalidatedAt) {
          const issuedAt = new Date((decoded.iat || 0) * 1000);
          if (issuedAt <= admin.tokenInvalidatedAt) {
            return res.status(401).json({ message: "Session révoquée — reconnectez-vous" });
          }
        }
      } else if (role === "merchant") {
        const merchant = await storage.getMerchantById(decoded.id);
        if (!merchant || merchant.suspended) {
          return res.status(401).json({ message: "Compte marchand introuvable ou suspendu" });
        }
        if (merchant.tokenInvalidatedAt) {
          const issuedAt = new Date((decoded.iat || 0) * 1000);
          if (issuedAt <= merchant.tokenInvalidatedAt) {
            return res.status(401).json({ message: "Session révoquée — reconnectez-vous" });
          }
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

/**
 * SSRF guard: validates that a webhook URL is a public HTTP(S) address.
 * Blocks loopback, link-local, private RFC-1918, and cloud metadata addresses.
 */
function assertPublicWebhookUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`URL webhook invalide: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Protocole webhook non autorise: ${parsed.protocol}`);
  }
  const hostname = parsed.hostname.toLowerCase();
  // Block private / loopback / link-local / metadata ranges
  const BLOCKED = [
    /^localhost$/,
    /^127\./,
    /^0\.0\.0\.0$/,
    /^::1$/,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
    /^fc00:/i,
    /^fe80:/i,
    /^metadata\.google\.internal$/,
    /^169\.254\.169\.254$/,
  ];
  for (const re of BLOCKED) {
    if (re.test(hostname)) {
      throw new Error(`URL webhook pointe vers une adresse privee/interne: ${hostname}`);
    }
  }
}

async function notifyCryptoWebhook(merchant: { id: number; webhookUrl?: string | null; webhookSecret?: string | null }, payload: Record<string, any>): Promise<void> {
  if (!merchant.webhookUrl) return;
  try {
    assertPublicWebhookUrl(merchant.webhookUrl);
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

// ── Sanitizers — strip TOUS les champs sensibles avant envoi au client ──────────
// Ces fonctions DOIVENT être utilisées sur tout objet admin/merchant renvoyé
// dans une res.json(). Ne jamais envoyer l'objet brut issu de la DB.
function sanitizeMerchant(m: Record<string, any>) {
  const { passwordHash, totpSecret, pinHash, webhookSecret: _ws, ...safe } = m;
  return safe;
}
function sanitizeAdmin(a: Record<string, any>) {
  const { passwordHash, totpSecret, ...safe } = a;
  return safe;
}

/**
 * Renvoie un message d'erreur sûr pour le client.
 * - En production  : message générique pour les 5xx (évite de fuiter des détails internes
 *   comme les noms de tables, contraintes DB, chemins de fichiers, etc.).
 *   Les messages métier explicites (4xx) sont toujours retournés tels quels.
 * - En développement : message complet pour faciliter le debug.
 */
function safeErrMsg(err: any): string {
  if (process.env.NODE_ENV !== "production") return err?.message || "Erreur interne";
  // Messages métier explicitement définis dans le code (courts, sans détail technique)
  const msg: string = err?.message || "";
  const isSafe = msg.length > 0 && msg.length < 120 && !/sql|column|table|relation|constraint|syntax|pool|drizzle|pg\b|Error:/i.test(msg);
  return isSafe ? msg : "Erreur interne du serveur";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ── Charger la config des frais depuis la DB ──────────────────────────────────
  await loadFeeConfig();

  // ── Security headers (applied to every response) ─────────────────────────────
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }

    // ── CSP ─────────────────────────────────────────────────────────────────
    // En production : 'unsafe-inline' retiré de script-src — les scripts sont
    // bundlés par Vite en fichiers séparés, aucun script inline légitime n'existe.
    // En développement : Vite injecte des scripts inline pour le HMR → toléré.
    const scriptSrc = process.env.NODE_ENV === "production"
      ? "script-src 'self'"
      : "script-src 'self' 'unsafe-inline'";

    res.setHeader("Content-Security-Policy", [
      "default-src 'self'",
      scriptSrc,
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

    // ── CORS pour les routes API sensibles ───────────────────────────────────
    // Les routes /api/admin/* et /api/merchant/* n'acceptent que les requêtes
    // same-origin. Les callbacks de paiement sont volontairement exclus (ils
    // sont appelés par des serveurs tiers et valident une signature HMAC).
    if (req.path.startsWith("/api/admin/") || req.path.startsWith("/api/merchant/")) {
      const origin = req.headers["origin"];
      // Requête sans Origin (curl, serveur→serveur, ou navigateur same-origin GET) : autorisée.
      if (origin) {
        // Construire la liste des origines légitimes :
        // 1. APP_URL (domaine de production défini explicitement)
        // 2. REPLIT_DEV_DOMAIN (domaine dev Replit)
        // 3. Fallback : protocole + hostname de la requête entrante (même serveur)
        const selfOrigin = `${req.protocol}://${req.hostname}`;
        const allowedOrigins = [
          process.env.APP_URL,
          process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : undefined,
          selfOrigin,
        ].filter(Boolean) as string[];

        const parseOrigin = (o: string) => { try { return new URL(o).origin; } catch { return null; } };
        const parsedOrigin  = parseOrigin(origin);
        const parsedAllowed = allowedOrigins.map(parseOrigin).filter(Boolean);

        if (parsedOrigin && !parsedAllowed.includes(parsedOrigin)) {
          res.setHeader("Vary", "Origin");
          // Ne pas bloquer OPTIONS (preflight) — le navigateur renverra la vraie requête
          // qui sera alors rejetée faute de header Access-Control-Allow-Origin.
          if (req.method !== "OPTIONS") {
            return res.status(403).json({ message: "Cross-origin request non autorisé" });
          }
        }
      }
    }

    next();
  });

  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send("User-agent: *\nDisallow: /\n");
  });

  // ── Vérification sécurisée du chemin admin ────────────────────────────────────
  // Utilisé comme fallback par le client quand window.__ADMIN_PATH__ n'est pas
  // injecté (Apache/Nginx sert index.html en statique, bypassant Node.js).
  // Ne révèle JAMAIS le slug — répond uniquement { isAdminPath: true|false }.
  // Protégé par le rate-limiter /api/auth (30 req / 5 min / IP).
  app.post("/api/auth/admin/verify-path", (req, res) => {
    const { path } = req.body || {};
    if (typeof path !== "string" || !path.startsWith("/")) {
      return res.status(400).json({ isAdminPath: false });
    }
    const slug = process.env.ADMIN_SLUG || "";
    const adminPath = slug ? `/${slug}` : null;
    res.setHeader("Cache-Control", "no-store");
    res.json({ isAdminPath: !!adminPath && path === adminPath });
  });

  // ── Route Telegram webhook PERMANENTE ─────────────────────────────────────────────────
  // Enregistrée ici (avant tout autre middleware) pour éviter les fenêtres de 404 pendant
  // les redémarrages Plesk. Le secret est vérifié dynamiquement depuis la DB à chaque appel.
  app.post("/api/telegram/webhook/:secret", async (req: Request, res: Response) => {
    // Répondre 200 immédiatement — Telegram abandonne si la réponse tarde > 1s
    res.sendStatus(200);
    try {
      const { secret } = req.params;
      // Vérifier le secret en DB
      const storedSecret = await storage.getSetting("telegram_webhook_secret");
      if (!storedSecret || secret !== storedSecret) {
        console.warn(`[TG-WEBHOOK] Secret invalide reçu: "${secret?.slice(0, 8)}..."`);
        return;
      }
      const body = req.body;
      if (!body || typeof body !== "object") {
        console.error("[TG-WEBHOOK] Body vide ou invalide — Content-Type incorrect ?", typeof body);
        return;
      }
      const { handleWebhookUpdate } = await import("./telegram-bot");
      const handled = handleWebhookUpdate(secret, body);
      if (!handled) {
        console.warn("[TG-WEBHOOK] Bot non initialisé — update ignoré (update_id=" + body.update_id + ")");
      }
    } catch (err: any) {
      console.error("[TG-WEBHOOK] Erreur:", err.message);
    }
  });

  // ── Blocage immédiat des chemins d'attaque courants des bots et scanners ──────────────
  // Ces chemins n'existent pas dans l'app — seuls des bots/scanners les tentent.
  // L'IP est auto-blacklistée dès la première tentative.
  const BOT_ATTACK_PATH_RE = /^\/(\.env|\.git|\.htaccess|\.htpasswd|\.ssh|\.aws|\.DS_Store|web\.config|Dockerfile|Makefile|composer\.(json|lock)|package-lock\.json|node_modules|wp-admin|wp-login\.php|wp-config\.php|xmlrpc\.php|phpmyadmin|pma|admin\.php|config\.php|setup\.php|install\.php|backup|shell|cmd|eval|base64_decode|passwd|shadow|proc\/self|etc\/passwd|var\/www|usr\/bin|\.travis\.yml|Jenkinsfile|\.circleci|\.github\/workflows|autodiscover\.|owa\/|ecp\/|\.well-known\/autoconfig|cgi-bin|\.svn|\.hg|thumbs\.db|server-status|server-info)/i;

  app.use((req, res, next) => {
    if (BOT_ATTACK_PATH_RE.test(req.path)) {
      const ip = extractIp(req);
      storage.createSecurityLog({ eventType: "bot_blocked", ip, action: "attack_path_blocked", details: `${req.method} ${req.path} — ${(req.headers["user-agent"] || "?").substring(0, 80)}` }).catch(() => {});
      if (!ip.startsWith("SPOOFED:") && ip !== "unknown" && ip !== "local" && ip !== "127.0.0.1" && ip !== "::1") {
        storage.addBlockedIp({ ipAddress: ip, reason: `Scan de chemin d'attaque — ${req.path}`, blockedBy: "système-bot" }).catch(() => {});
      }
      return res.status(404).end();
    }
    next();
  });

  // ── Rate limiting global sur les endpoints d'authentification ─────────────────────────
  // 30 requêtes max par fenêtre de 5 min par IP — après ça l'IP est auto-bloquée.
  // Protège admin login, merchant login, verify-otp, complete-totp-setup, etc.
  const authRateLimitStore = new Map<string, { count: number; firstReq: number }>();
  const AUTH_RATE_MAX = 30;
  const AUTH_RATE_WINDOW = 5 * 60 * 1000;

  app.use("/api/auth", (req, res, next) => {
    if (req.method === "OPTIONS") return next();
    const ip = extractIp(req);
    if (ip.startsWith("SPOOFED:")) {
      return res.status(403).json({ message: "Accès refusé" });
    }
    const now = Date.now();
    const entry = authRateLimitStore.get(ip) || { count: 0, firstReq: now };
    if (now - entry.firstReq > AUTH_RATE_WINDOW) { entry.count = 0; entry.firstReq = now; }
    entry.count++;
    authRateLimitStore.set(ip, entry);
    if (entry.count > AUTH_RATE_MAX) {
      storage.addBlockedIp({ ipAddress: ip, reason: `Rate limit auth — ${entry.count} req/5min`, blockedBy: "système-ratelimit" }).catch(() => {});
      storage.createSecurityLog({ eventType: "rate_limit", ip, action: "auth_rate_blocked", details: `${entry.count} req en 5min — ${req.path}` }).catch(() => {});
      authRateLimitStore.delete(ip);
      return res.status(429).json({ message: "Trop de requêtes. Veuillez patienter." });
    }
    next();
  });

  // ==================== IP SECURITY ====================
  app.get("/api/auth/my-ip", (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    res.json({ ip });
  });

  app.get("/api/auth/check-ip", async (req, res) => {
    try {
      const rawIp = req.ip || req.socket.remoteAddress || "";
      const cleanIp = rawIp.replace(/^::ffff:/, "");

      // Local/private IPs → always allowed (dev environment)
      const isLocal = cleanIp === "127.0.0.1" || cleanIp === "::1" ||
        cleanIp.startsWith("192.168.") || cleanIp.startsWith("10.");
      if (isLocal) return res.json({ allowed: true, ip: cleanIp, reason: "local" });

      // Pays supportés par la plateforme — noms anglais ET français (ip-api.com peut retourner l'un ou l'autre)
      const PLATFORM_COUNTRIES = new Set([
        // Afrique de l'Ouest
        "Togo",
        "Benin", "Bénin",
        "Ivory Coast", "Côte d'Ivoire", "Cote d'Ivoire", "Cote Divoire",
        "Senegal", "Sénégal",
        "Mali",
        "Burkina Faso",
        "Guinea", "Guinée", "Guinee",
        "Niger",
        "Ghana", "Nigeria", "Mauritania", "Mauritanie",
        "Sierra Leone", "Liberia", "Cape Verde", "Gambia", "Gambie", "Guinea-Bissau", "Guinée-Bissau",
        // Afrique Centrale
        "Cameroon", "Cameroun",
        "Democratic Republic of the Congo", "DR Congo", "DRC", "Congo RDC", "Congo-Kinshasa",
        "Republic of the Congo", "Congo", "Congo-Brazzaville", "Congo Brazzaville",
        "Gabon",
        "Chad", "Tchad",
        "Central African Republic", "Centrafrique",
        "Equatorial Guinea", "Guinée Équatoriale",
        "São Tomé and Príncipe", "Angola", "Rwanda", "Burundi",
      ]);

      // 1. Geo check FIRST — si le pays est supporté, autoriser même si l'IP est dans blocked_ips
      // (les FAI africains mobiles sont souvent faussement flaggés "datacenter" par ip-api.com)
      const geo = await getGeoInfo(cleanIp).catch(() => null);
      const country = geo?.country || "";

      if (!country || PLATFORM_COUNTRIES.has(country)) {
        // Pays supporté ou géoloc impossible → autorisé (bénéfice du doute)
        return res.json({ allowed: true, ip: cleanIp, reason: "geo", country });
      }

      // 2. Pays non supporté — vérifier si explicitement blacklisté
      const blocked = await storage.isIpBlocked(cleanIp);
      if (blocked) return res.json({ allowed: false, ip: cleanIp, reason: "blocked", country });

      // 3. Admin-whitelisted → always allowed regardless of country
      const whitelisted = await storage.isIpAllowed(rawIp);
      const { db: dbConn } = await import("./db");
      const { sql: sqlTag } = await import("drizzle-orm");
      const countResult = await dbConn.execute(sqlTag`SELECT COUNT(*)::int AS cnt FROM allowed_ips`);
      const tableHasEntries = ((countResult.rows?.[0] as any)?.cnt ?? 0) > 0;
      const isExplicitlyWhitelisted = tableHasEntries && whitelisted;
      if (isExplicitlyWhitelisted) return res.json({ allowed: true, ip: cleanIp, reason: "whitelist" });

      // 4. Hors zone plateforme + non whitelisté → page de vérification IP
      return res.json({ allowed: false, ip: cleanIp, reason: "geo_blocked", country });
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

      // 3. If request carries a valid admin JWT, skip IP whitelist check
      // (authMiddleware already validates the token on each route)
      const authHeader = req.headers["authorization"];
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET) as any;
          if (decoded?.role === "admin") return next();
        } catch {
          // Invalid token — fall through to whitelist check
        }
      }

      // 4. Check allowed IPs whitelist
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
    // Check X-Forwarded-For first — only flag as spoofed if injected via header
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      const firstIp = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(",")[0].trim().replace(/^::ffff:/, "");
      if (isReservedIp(firstIp)) return `SPOOFED:${firstIp}`;
      return firstIp;
    }
    // Direct connection — use socket IP as-is (never flag as spoofed)
    const raw = (req.ip || req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
    return raw || "unknown";
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

      // ── RESTRICTION GÉOGRAPHIQUE ABSOLUE — avant toute autre vérification ─────
      // Si le pays n'est pas Togo ou Côte d'Ivoire : blocage immédiat + auto-blacklist IP.
      // Un bot ne peut même pas atteindre la vérification du mot de passe.
      {
        const geoCheck = await checkAdminGeoAllowed(clientIp);
        if (!geoCheck.allowed) {
          storage.createSecurityLog({
            eventType: "country_blocked",
            ip: clientIp,
            userEmail: email,
            action: "admin_login_blocked_geo",
            details: `Pays non autorisé : ${geoCheck.country} — tentative connexion admin bloquée`,
          }).catch(() => {});
          // Auto-blacklist définitive de l'IP
          if (!clientIp.startsWith("SPOOFED:") && clientIp !== "local" && clientIp !== "unknown") {
            storage.addBlockedIp({ ipAddress: clientIp, reason: `Login admin hors zone — ${geoCheck.country}`, blockedBy: "système-géo" }).catch(() => {});
            _geoCache.delete(clientIp);
          }
          // Réponse générique pour ne pas révéler la raison du blocage
          return res.status(403).json({ message: "Accès refusé" });
        }
      }

      // WHITELIST STRICTE — emails autorisés via variable d'environnement ou paramètre DB
      // Définir ADMIN_EMAIL_WHITELIST="email1@exemple.com,email2@exemple.com" dans les secrets Replit
      const whitelistEnv = process.env.ADMIN_EMAIL_WHITELIST || "";
      const whitelistDb = await storage.getSetting("admin_email_whitelist").catch(() => "");
      const whitelistRaw = whitelistEnv || whitelistDb || "";
      const ADMIN_WHITELIST = whitelistRaw.split(",").map((e: string) => e.trim().toLowerCase()).filter(Boolean);
      if (ADMIN_WHITELIST.length > 0 && !ADMIN_WHITELIST.includes(email.toLowerCase().trim())) {
        storage.createSecurityLog({ eventType: "blocked_access", ip: clientIp, userEmail: email, action: "email_not_whitelisted", details: "Email non autorisé — tentative de connexion admin rejetée" }).catch(() => {});
        return res.status(401).json({ message: "Identifiants invalides" });
      }
      if (ADMIN_WHITELIST.length === 0) {
        console.warn("[SECURITY] ADMIN_EMAIL_WHITELIST non défini — tout compte admin en base peut se connecter. Définir cette variable d'environnement pour restreindre l'accès.");
      }

      const admin = await storage.getAdminByEmail(email);
      // Emails de comptes admin désactivés définitivement (liste en DB ou variable d'env)
      const permanentlyBlocked = (process.env.BLOCKED_ADMIN_EMAILS || "admin@westpay.com")
        .split(",").map((e: string) => e.trim().toLowerCase());
      if (!admin || permanentlyBlocked.includes(email.toLowerCase())) return res.status(401).json({ message: "Identifiants invalides" });

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

      // 6. TOTP Google Authenticator — OBLIGATOIRE à chaque connexion, aucune exception
      if (admin.totpEnabled && admin.totpSecret) {
        // TOTP déjà configuré → demander le code
        const tempToken = jwt.sign({ email, purpose: "totp_verify", adminId: admin.id }, JWT_SECRET, { expiresIn: "6m" });
        return res.json({ requires_totp: true, tempToken });
      }

      // TOTP pas encore configuré → démarrer le setup automatique (QR code)
      const setupSecret = totpGenerateSecret();
      const otpauth = totpGenerateURI({ label: admin.email, issuer: "WestPay Admin", secret: setupSecret, strategy: "totp" });
      const qrCodeDataUrl = await QRCode.toDataURL(otpauth);
      // Le secret est stocké dans le JWT temporaire (non en DB jusqu'à confirmation)
      const tempToken = jwt.sign({ email, purpose: "totp_setup", adminId: admin.id, secret: setupSecret }, JWT_SECRET, { expiresIn: "10m" });
      return res.json({ requires_totp_setup: true, tempToken, qrCode: qrCodeDataUrl, secret: setupSecret });
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
      setAuthCookie(res, token);
      res.json({ token, user: { id: admin.id, email: admin.email } });
    } catch (err: any) {
      res.status(500).json({ message: "Erreur interne" });
    }
  });

  // ── TOTP verify at login (Google Authenticator) ───────────────────────────
  app.post("/api/auth/admin/verify-totp", async (req, res) => {
    try {
      const { tempToken, code } = req.body;
      if (!tempToken || !code) return res.status(400).json({ message: "Données manquantes" });
      let payload: any;
      try { payload = jwt.verify(tempToken, JWT_SECRET); } catch { return res.status(401).json({ message: "Session expirée" }); }
      if (payload.purpose !== "totp_verify") return res.status(401).json({ message: "Token invalide" });
      const admin = await storage.getAdminByEmail(payload.email);
      if (!admin || !admin.totpSecret || !admin.totpEnabled) return res.status(401).json({ message: "TOTP non configuré" });
      const totpResult = totpVerifySync({ token: String(code).trim(), secret: decryptTotpSecret(admin.totpSecret), strategy: "totp" });
      if (!totpResult?.valid) return res.status(401).json({ message: "Code invalide ou expiré" });
      const jwtToken = signToken({ id: admin.id, role: "admin", email: admin.email });
      const clientIp = (req.ip || "").replace(/^::ffff:/, "");
      await storage.createLoginLog({ userId: admin.id, role: "admin", ip: clientIp, device: req.headers["user-agent"] || "", success: true });
      notifyAdminLogin({ email: admin.email, ip: clientIp, device: req.headers["user-agent"] || "", success: true }).catch(() => {});
      setAuthCookie(res, jwtToken);
      res.json({ token: jwtToken, user: { id: admin.id, email: admin.email } });
    } catch (err: any) {
      res.status(500).json({ message: "Erreur interne" });
    }
  });

  // ── TOTP setup completion during login (no auth — uses temp JWT) ─────────
  app.post("/api/auth/admin/complete-totp-setup", async (req, res) => {
    try {
      const { tempToken, code } = req.body;
      if (!tempToken || !code) return res.status(400).json({ message: "Données manquantes" });
      let payload: any;
      try { payload = jwt.verify(tempToken, JWT_SECRET); } catch { return res.status(401).json({ message: "Session expirée — recommencez la connexion" }); }
      if (payload.purpose !== "totp_setup") return res.status(401).json({ message: "Token invalide" });
      const { email, adminId, secret } = payload;
      if (!secret) return res.status(400).json({ message: "Secret TOTP manquant" });

      // Vérifier le code TOTP
      const totpResult = totpVerifySync({ token: String(code).trim(), secret, strategy: "totp" });
      if (!totpResult?.valid) return res.status(401).json({ message: "Code invalide — vérifiez votre application Google Authenticator" });

      // Sauvegarder le secret CHIFFRÉ et activer TOTP en base (jamais en clair)
      await storage.updateAdminTotp(adminId, encryptTotpSecret(secret), true);

      // Émettre le JWT final
      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(401).json({ message: "Compte introuvable" });
      const jwtToken = signToken({ id: admin.id, role: "admin", email: admin.email });
      const clientIp = (req.ip || "").replace(/^::ffff:/, "");
      await storage.createLoginLog({ userId: admin.id, role: "admin", ip: clientIp, device: req.headers["user-agent"] || "", success: true });
      notifyAdminLogin({ email: admin.email, ip: clientIp, device: req.headers["user-agent"] || "", success: true }).catch(() => {});
      setAuthCookie(res, jwtToken);
      res.json({ token: jwtToken, user: { id: admin.id, email: admin.email } });
    } catch (err: any) {
      res.status(500).json({ message: "Erreur interne" });
    }
  });

  // ── TOTP setup: generate secret + QR code (authenticated) ────────────────
  app.post("/api/admin/2fa/setup", authMiddleware("admin"), async (req, res) => {
    try {
      const adminUser = (req as any).user;
      const admin = await storage.getAdminById(adminUser.id);
      if (!admin) return res.status(404).json({ message: "Compte introuvable" });
      const secret = totpGenerateSecret();
      const otpauth = totpGenerateURI({ label: admin.email, issuer: "WestPay Admin", secret, strategy: "totp" });
      const qrCodeDataUrl = await QRCode.toDataURL(otpauth);
      res.json({ secret, qrCode: qrCodeDataUrl, otpauth });
    } catch (err: any) {
      res.status(500).json({ message: "Erreur interne" });
    }
  });

  // ── TOTP enable: verify first code and save secret ───────────────────────
  app.post("/api/admin/2fa/enable", authMiddleware("admin"), async (req, res) => {
    try {
      const adminUser = (req as any).user;
      const { secret, code } = req.body;
      if (!secret || !code) return res.status(400).json({ message: "Données manquantes" });
      const totpResult = totpVerifySync({ token: String(code).trim(), secret, strategy: "totp" });
      if (!totpResult?.valid) return res.status(400).json({ message: "Code invalide — vérifiez votre application d'authentification" });
      await storage.updateAdminTotp(adminUser.id, encryptTotpSecret(secret), true);
      res.json({ success: true, message: "Google Authenticator 2FA activé" });
    } catch (err: any) {
      res.status(500).json({ message: "Erreur interne" });
    }
  });

  // ── TOTP disable: DÉFINITIVEMENT BLOQUÉ — Google Authenticator est obligatoire ─
  app.post("/api/admin/2fa/disable", authMiddleware("admin"), async (req, res) => {
    const adminUser = (req as any).user;
    const clientIp = (req.ip || "").replace(/^::ffff:/, "");
    storage.createSecurityLog({
      eventType: "unauthorized_2fa_disable",
      ip: clientIp,
      userEmail: adminUser?.email || "?",
      action: "blocked_permanently",
      details: "Tentative de désactivation du Google Authenticator — opération définitivement interdite"
    }).catch(() => {});
    return res.status(403).json({
      message: "La désactivation du Google Authenticator est définitivement interdite. L'authentification à deux facteurs est obligatoire et ne peut pas être désactivée."
    });
  });

  // ── TOTP status: get current admin TOTP status ───────────────────────────
  app.get("/api/admin/2fa/status", authMiddleware("admin"), async (req, res) => {
    try {
      const adminUser = (req as any).user;
      const admin = await storage.getAdminById(adminUser.id);
      if (!admin) return res.status(404).json({ message: "Compte introuvable" });
      res.json({ totpEnabled: admin.totpEnabled ?? false });
    } catch (err: any) {
      res.status(500).json({ message: "Erreur interne" });
    }
  });

  // ── Rate-limit store pour login marchands — par IP ───────────────────────────
  const merchantLoginAttempts = new Map<string, { count: number; firstFail: number }>();
  const MERCHANT_BRUTE_MAX = 5;
  const MERCHANT_BRUTE_WINDOW = 10 * 60 * 1000; // 10 min

  // ── Rate-limit par EMAIL (résiste à la rotation d'IPs / Supabase Edge Runtime)
  // Logique : si le même email cumule des échecs depuis N IPs différentes → verrouillage temporaire
  const emailLoginAttempts = new Map<string, { count: number; firstFail: number; lockedUntil?: number }>();
  const EMAIL_BRUTE_MAX = 8;              // 8 échecs toutes IPs confondues
  const EMAIL_BRUTE_WINDOW = 15 * 60 * 1000; // fenêtre de 15 min
  const EMAIL_LOCK_DURATION = 30 * 60 * 1000; // verrouillage 30 min

  // ── Patterns UA de bots/scanners — bloqués sur tous les endpoints sensibles ──────────
  const BLOCKED_UA_PATTERNS = [
    // HTTP clients automatisés
    /Deno\//i, /SupabaseEdgeRuntime/i, /python-requests/i, /Go-http-client/i,
    /curl\//i, /axios\//i, /node-fetch/i, /undici/i, /libcurl/i, /pycurl/i,
    /httpx/i, /aiohttp/i, /urllib/i, /requests\//i, /java\/[0-9]/i,
    /okhttp/i, /apache-httpclient/i, /guzzle/i, /faraday/i, /rest-client/i,
    // Outils de scan de sécurité / pentest
    /sqlmap/i, /nikto/i, /nessus/i, /nmap/i, /masscan/i, /zap\//i,
    /burpsuite/i, /metasploit/i, /acunetix/i, /w3af/i, /wfuzz/i,
    /nuclei/i, /dirbuster/i, /gobuster/i, /ffuf/i, /hydra/i,
    /zgrab/i, /shodan/i, /censys/i, /openvas/i, /whatweb/i,
    // Crawlers / scrapers
    /scrapy/i, /wget/i, /httrack/i, /wget\//i, /lwp-request/i,
    /mechanize/i, /beautiful.?soup/i, /phantomjs/i,
    // Headless browsers
    /headlesschrome/i, /headless/i, /puppeteer/i, /playwright/i, /selenium/i,
    /webdriver/i, /chromedriver/i, /geckodriver/i,
    // Bots de recherche / indexation sur endpoints privés
    /googlebot/i, /bingbot/i, /baiduspider/i, /yandexbot/i, /semrushbot/i,
    /ahrefsbot/i, /dotbot/i, /mj12bot/i, /rogerbot/i, /exabot/i,
    // UA vides ou suspects
    /^-$/i, /^test$/i, /^bot$/i, /^scanner$/i, /^exploit/i,
  ];

  // Hôtes autorisés pour la validation Origin/Referer du login marchand
  const ALLOWED_HOSTS = (() => {
    const appHost = (() => { try { return new URL(process.env.APP_URL || "http://Westpay.cfd").hostname; } catch { return "westpay.cfd"; } })();
    const base = [appHost, `www.${appHost}`, "westpay.cfd", "www.westpay.cfd"];
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

  // Pays autorisés pour la connexion marchand (noms anglais ET français — ip-api.com peut retourner l'un ou l'autre)
  const ALLOWED_MERCHANT_COUNTRIES = new Set([
    // Afrique de l'Ouest
    "Togo",
    "Benin", "Bénin",
    "Ivory Coast", "Côte d'Ivoire", "Cote d'Ivoire", "Cote Divoire",
    "Senegal", "Sénégal",
    "Mali",
    "Burkina Faso",
    "Guinea", "Guinée", "Guinee",
    "Niger",
    "Ghana", "Nigeria", "Mauritania", "Mauritanie",
    "Sierra Leone", "Liberia", "Cape Verde", "Gambia", "Gambie", "Guinea-Bissau", "Guinée-Bissau",
    // Afrique Centrale
    "Cameroon", "Cameroun",
    "Democratic Republic of the Congo", "DR Congo", "DRC", "Congo RDC", "Congo-Kinshasa",
    "Republic of the Congo", "Congo", "Congo-Brazzaville", "Congo Brazzaville",
    "Gabon",
    "Chad", "Tchad",
    "Central African Republic", "Centrafrique",
    "Equatorial Guinea", "Guinée Équatoriale",
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

  // ── Fabrique de rate-limiters en mémoire (par IP) ────────────────────────────
  // Chaque appel crée un compteur indépendant avec ses propres paramètres.
  // autoBlock=true : dépasse → IP bannie en DB + security_log (endpoints critiques).
  function makeRateLimit(opts: {
    max: number;
    windowMs: number;
    label: string;
    autoBlock?: boolean;
  }) {
    const store = new Map<string, { count: number; firstReq: number }>();
    return (req: Request, res: Response, next: NextFunction) => {
      const clientIp = (req.ip || req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
      const now = Date.now();
      const entry = store.get(clientIp) || { count: 0, firstReq: now };
      if (now - entry.firstReq > opts.windowMs) { entry.count = 0; entry.firstReq = now; }
      entry.count++;
      store.set(clientIp, entry);
      if (entry.count > opts.max) {
        if (opts.autoBlock) {
          storage.addBlockedIp({ ipAddress: clientIp, reason: `Rate limit ${opts.label} — ${entry.count} req`, blockedBy: "système" }).catch(() => {});
          storage.createSecurityLog({ eventType: "rate_limit", ip: clientIp, action: `${opts.label}_autoblock`, details: `${entry.count} req/${opts.windowMs / 1000}s — ${req.path}` }).catch(() => {});
        }
        return res.status(429).json({ message: "Trop de requêtes. Réessayez dans un moment." });
      }
      next();
    };
  }

  // ── Rate-limit store pour les endpoints de paiement ──────────────────────────
  const paymentInitiateAttempts = new Map<string, { count: number; firstReq: number }>();
  const PAYMENT_RATE_MAX = 30;           // 30 tentatives/min — assez pour les tests légitimes
  const PAYMENT_RATE_WINDOW = 60 * 1000; // 1 min

  const paymentRateLimit = (req: Request, res: Response, next: NextFunction) => {
    const clientIp = (req.ip || req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
    const now = Date.now();
    const entry = paymentInitiateAttempts.get(clientIp) || { count: 0, firstReq: now };
    if (now - entry.firstReq > PAYMENT_RATE_WINDOW) { entry.count = 0; entry.firstReq = now; }
    entry.count++;
    paymentInitiateAttempts.set(clientIp, entry);
    if (entry.count > PAYMENT_RATE_MAX) {
      // NOTE : pas de addBlockedIp ici — le rate-limit paiement est temporaire (1 min).
      // Un blocage permanent par rate-limit de paiement bloque aussi les marchands
      // qui testent leurs intégrations et les clients qui réessaient légitimement.
      // Les vraies attaques (bots, flood) sont gérées par blockedIpGuard + botGuard.
      storage.createSecurityLog({ eventType: "rate_limit", ip: clientIp, action: "payment_rate_limit", details: `${entry.count} req/min — ${req.path}` }).catch(() => {});
      return res.status(429).json({ message: "Trop de requêtes. Réessayez dans un moment." });
    }
    next();
  };

  // ── Rate-limiters pour les autres endpoints publics sensibles ────────────────
  // docs/access : authentification par PIN — max 5 tentatives/5min (anti brute-force)
  const docsAccessRateLimit = makeRateLimit({ max: 5, windowMs: 5 * 60 * 1000, label: "docs_access", autoBlock: true });
  // create-merchant : max 5 créations / heure / IP — bloque les bots de masse
  const createMerchantRateLimit = makeRateLimit({ max: 5, windowMs: 60 * 60 * 1000, label: "create_merchant", autoBlock: true });
  // crypto pay : max 15 req/min par IP (création de factures crypto)
  const cryptoPayRateLimit  = makeRateLimit({ max: 15, windowMs: 60 * 1000, label: "crypto_pay", autoBlock: true });
  // validate   : max 20 req/min — polling de statut, mais abus possible
  const validateRateLimit   = makeRateLimit({ max: 20, windowMs: 60 * 1000, label: "payment_validate" });
  // verify-tx  : max 10 req/min — vérification de transaction publique
  const verifyTxRateLimit   = makeRateLimit({ max: 10, windowMs: 60 * 1000, label: "verify_tx", autoBlock: true });
  // report-failure : max 10 req/min — signalement d'échec de paiement
  const reportFailureRateLimit = makeRateLimit({ max: 10, windowMs: 60 * 1000, label: "report_failure" });

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

      // ── COUCHE 0b.1 : Rate-limit PAR EMAIL (résiste à la rotation d'IPs) ─────
      // Vérifie si cet email est temporairement verrouillé suite à trop d'échecs
      {
        const emailKey = email.toLowerCase().trim();
        const now = Date.now();
        const emailEntry = emailLoginAttempts.get(emailKey);
        if (emailEntry) {
          // Verrouillage actif ?
          if (emailEntry.lockedUntil && now < emailEntry.lockedUntil) {
            const remainMin = Math.ceil((emailEntry.lockedUntil - now) / 60000);
            storage.createSecurityLog({ eventType: "brute_force", ip: clientIp, userEmail: email, action: "email_rate_locked", details: `Email verrouillé — ${emailEntry.count} échecs — encore ${remainMin} min` }).catch(() => {});
            return res.status(429).json({ message: `Trop de tentatives. Réessayez dans ${remainMin} minute${remainMin > 1 ? "s" : ""}.` });
          }
          // Fenêtre expirée → reset
          if (now - emailEntry.firstFail > EMAIL_BRUTE_WINDOW) {
            emailLoginAttempts.delete(emailKey);
          }
        }
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

        // Bloquer les IPs de datacenter / VPS — SAUF si le pays est supporté
        // (les FAI mobiles africains sont souvent faussement flaggés "hosting" par ip-api.com)
        if (isDatacenter && (!geoCountry || !ALLOWED_MERCHANT_COUNTRIES.has(geoCountry))) {
          storage.addBlockedIp({ ipAddress: clientIp, reason: `IP datacenter/VPS hors zone: ${geoCountry || "inconnu"}`, blockedBy: "système" }).catch(() => {});
          storage.createSecurityLog({ eventType: "datacenter_blocked", ip: clientIp, userEmail: email, action: "hosting_ip_blocked", details: `Datacenter ${geoCountry || "?"} — ${ua.substring(0, 60)}` }).catch(() => {});
          return res.status(403).json({ message: "Accès refusé" });
        }

        if (geoCountry && !ALLOWED_MERCHANT_COUNTRIES.has(geoCountry)) {
          // Auto-bloquer l'IP immédiatement + log + Telegram (pays non supporté)
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
        // Incrément rate-limit par IP
        attempt.count++;
        merchantLoginAttempts.set(clientIp, attempt);

        // Incrément rate-limit par EMAIL (résiste à la rotation d'IPs)
        {
          const emailKey = email.toLowerCase().trim();
          const now = Date.now();
          const emailEntry = emailLoginAttempts.get(emailKey) || { count: 0, firstFail: now };
          if (now - emailEntry.firstFail > EMAIL_BRUTE_WINDOW) { emailEntry.count = 0; emailEntry.firstFail = now; }
          emailEntry.count++;
          if (emailEntry.count >= EMAIL_BRUTE_MAX) {
            emailEntry.lockedUntil = now + EMAIL_LOCK_DURATION;
            storage.createSecurityLog({ eventType: "brute_force", ip: clientIp, userEmail: email, action: "email_auto_locked", details: `${emailEntry.count} échecs depuis plusieurs IPs — verrouillage 30 min` }).catch(() => {});
            // Alerte Telegram unique quand le verrouillage se déclenche
            notifyAdminGroup(
              `🔒 *Verrouillage email marchand*\n\n` +
              `📧 *Email :* \`${email}\`\n` +
              `🔢 *Échecs :* ${emailEntry.count} (depuis plusieurs IPs)\n` +
              `🌐 *Dernière IP :* \`${clientIp}\`\n` +
              `⏱ *Durée :* 30 minutes`
            ).catch(() => {});
          }
          emailLoginAttempts.set(emailKey, emailEntry);
        }

        await storage.createLoginLog({ userId: merchant.id, role: "merchant", ip: clientIp, device: ua, success: false });
        notifyAdminMerchantLogin({ email: merchant.email, merchantName: merchant.name, ip: clientIp, device: ua, success: false }).catch(() => {});
        return res.status(401).json({ message: "Identifiants invalides" });
      }

      // Reset des deux rate-limits sur succès
      merchantLoginAttempts.delete(clientIp);
      emailLoginAttempts.delete(email.toLowerCase().trim());

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
      // Liste gérée via le paramètre DB "otp_bypass_emails" (virgule-séparés) — aucun email hardcodé
      const otpBypassRaw = await storage.getSetting("otp_bypass_emails").catch(() => "");
      const OTP_BYPASS_EMAILS = (otpBypassRaw || "").split(",").map((e: string) => e.trim().toLowerCase()).filter(Boolean);
      if (OTP_BYPASS_EMAILS.includes(merchant.email.toLowerCase())) {
        const token = jwt.sign(
          { merchantId: merchant.id, email: merchant.email, role: "merchant", slug: merchant.slug, name: merchant.name },
          JWT_SECRET,
          { expiresIn: "2d" }
        );
        setAuthCookie(res, token);
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

      // ── Stocker l'OTP en base de données (survit aux redémarrages serveur) ──────────
      // L'entrée précédente est écrasée (invalide l'ancien OTP automatiquement)
      await storage.createMerchantLoginOtp(merchant.email, otpHash, tempToken, expiresAt);

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
      res.status(500).json({ message: safeErrMsg(err) });
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

      // ── Récupérer l'OTP depuis la base de données ────────────────────────────────
      const otpEntry = await storage.getMerchantLoginOtp(email);

      if (!otpEntry || otpEntry.tempToken !== tempToken) {
        return res.status(401).json({ message: "Code introuvable ou expiré." });
      }

      if (otpEntry.used) {
        await storage.deleteMerchantLoginOtp(email);
        return res.status(401).json({ message: "Ce code a déjà été utilisé." });
      }
      if (otpEntry.expiresAt.getTime() < Date.now()) {
        await storage.deleteMerchantLoginOtp(email);
        return res.status(401).json({ message: "Code expiré." });
      }
      if (otpEntry.attempts >= 5) {
        await storage.deleteMerchantLoginOtp(email);
        return res.status(429).json({ message: "Trop de tentatives. Veuillez vous reconnecter." });
      }

      // Incrémenter les tentatives en base de données
      await storage.incrementMerchantLoginOtpAttempts(email);

      const valid = await bcrypt.compare(String(code).trim(), otpEntry.otpHash);
      if (!valid) {
        const remaining = 4 - (otpEntry.attempts + 1);
        if (remaining <= 0) await storage.deleteMerchantLoginOtp(email);
        return res.status(401).json({ message: `Code incorrect. ${remaining > 0 ? `${remaining} tentative(s) restante(s).` : "Veuillez vous reconnecter."}` });
      }

      // Supprimer l'OTP après utilisation réussie
      await storage.deleteMerchantLoginOtp(email);

      const token = signToken({ id: merchantId, role: "merchant", email });
      setAuthCookie(res, token);
      return res.json({ token, user: { id: merchantId, email, name, slug } });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ── Logout — efface le cookie httpOnly côté serveur ──────────────────────
  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("wp_auth", { path: "/", httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production" });
    res.json({ success: true });
  });

  // ==================== ADMIN ROUTES ====================
  app.use("/api/admin", ipGuard);

  app.get("/api/admin/security/ips", authMiddleware("admin"), async (_req, res) => {
    try {
      const ips = await storage.getAllowedIps();
      res.json(ips);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.delete("/api/admin/security/ips/:id", authMiddleware("admin"), async (req, res) => {
    try {
      await storage.removeAllowedIp(Number(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/login-logs", authMiddleware("admin"), async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const logs = await storage.getRecentLoginLogs(limit);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ── Action logs — journal complet des actions admin (connexions + événements sécurité) ─
  app.get("/api/admin/action-logs", authMiddleware("admin"), async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const [loginLogs, secLogs] = await Promise.all([
        storage.getRecentLoginLogs(limit),
        (async () => {
          const r = await financialDb.execute(
            sql`SELECT id, event_type as "eventType", user_email as "userEmail", ip, action, details, telegram_admin as "telegramAdmin", created_at as "createdAt" FROM security_logs ORDER BY created_at DESC LIMIT ${limit}`
          );
          return r.rows as any[];
        })(),
      ]);
      // Combine + sort by date descending
      const combined = [
        ...loginLogs.map((l: any) => ({ ...l, _type: "login" })),
        ...secLogs.map((l: any) => ({ ...l, _type: "security" })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);
      res.json(combined);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ── Blocked IPs ──────────────────────────────────────────────────────────────
  app.get("/api/admin/security/blocked-ips", authMiddleware("admin"), async (_req, res) => {
    try {
      res.json(await storage.getBlockedIps());
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.delete("/api/admin/security/blocked-ips/:id", authMiddleware("admin"), async (req, res) => {
    try {
      await storage.removeBlockedIp(Number(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ── Blocked Devices ──────────────────────────────────────────────────────────
  app.get("/api/admin/security/blocked-devices", authMiddleware("admin"), async (_req, res) => {
    try {
      res.json(await storage.getBlockedDevices());
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.delete("/api/admin/security/blocked-devices/:id", authMiddleware("admin"), async (req, res) => {
    try {
      await storage.removeBlockedDevice(Number(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ── Security Logs ────────────────────────────────────────────────────────────
  app.get("/api/admin/security/logs", authMiddleware("admin"), async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      res.json(await storage.getSecurityLogs(limit));
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ── Devices ──────────────────────────────────────────────────────────────────
  app.get("/api/admin/security/devices", authMiddleware("admin"), async (_req, res) => {
    try {
      res.json(await storage.getAllDevices(200));
    } catch (err: any) { res.status(500).json({ message: safeErrMsg(err) }); }
  });

  app.post("/api/admin/security/devices/:id/trust", authMiddleware("admin"), async (req, res) => {
    try {
      await storage.trustDevice(Number(req.params.id));
      storage.createSecurityLog({ eventType: "device_trusted", action: "manual_trust", details: `ID ${req.params.id}`, telegramAdmin: (req as any).user?.email }).catch(() => {});
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ message: safeErrMsg(err) }); }
  });

  app.delete("/api/admin/security/devices/:id", authMiddleware("admin"), async (req, res) => {
    try {
      await storage.blockDeviceById(Number(req.params.id));
      storage.createSecurityLog({ eventType: "device_blocked", action: "manual_block", details: `ID ${req.params.id}`, telegramAdmin: (req as any).user?.email }).catch(() => {});
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ message: safeErrMsg(err) }); }
  });

  // ── Security Settings (2FA, Device Check, VPN Block, Country Blacklist) ─────
  app.get("/api/admin/security/config", authMiddleware("admin"), async (_req, res) => {
    try {
      res.json(await getSecuritySettings());
    } catch (err: any) { res.status(500).json({ message: safeErrMsg(err) }); }
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
    } catch (err: any) { res.status(500).json({ message: safeErrMsg(err) }); }
  });

  app.get("/api/admin/profile", authMiddleware("admin"), async (req, res) => {
    try {
      const admin = await storage.getAdminById((req as any).user.id);
      if (!admin) return res.status(404).json({ message: "Admin non trouve" });
      res.json({ email: admin.email, apiKey: admin.apiKey });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/telegram/settings", authMiddleware("admin"), async (_req, res) => {
    try {
      const groupId = await storage.getSetting("telegram_group_id");
      const knownGroupsRaw = await storage.getSetting("telegram_known_groups");
      const knownGroups: string[] = knownGroupsRaw ? JSON.parse(knownGroupsRaw) : [];
      res.json({ groupId: groupId || null, knownGroupsCount: knownGroups.length });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ── Bot status (webhook info + token presence) ─────────────────────────────
  app.get("/api/admin/telegram/bot-status", authMiddleware("admin"), async (_req, res) => {
    try {
      const { getBotWebhookInfo } = await import("./telegram-bot");
      const info = await getBotWebhookInfo();
      res.json(info);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ── Force re-register webhook (réveiller le bot) ───────────────────────────
  app.post("/api/admin/telegram/refresh-webhook", authMiddleware("admin"), async (req, res) => {
    try {
      const { registerWebhookUrl, setupWebhook, getBot } = await import("./telegram-bot");
      if (!getBot()) return res.status(400).json({ message: "Bot non initialisé — vérifiez TELEGRAM_BOT_TOKEN" });
      const appUrl = process.env.APP_URL || "http://Westpay.cfd";
      let webhookSecret = await storage.getSetting("telegram_webhook_secret");
      if (!webhookSecret) {
        const { randomBytes } = await import("crypto");
        webhookSecret = randomBytes(24).toString("hex");
        await storage.setSetting("telegram_webhook_secret", webhookSecret);
      }
      const webhookUrl = `${appUrl}/api/telegram/webhook/${webhookSecret}`;
      // Toujours réenregistrer la route Express ET informer Telegram
      setupWebhook(app, webhookSecret);
      await registerWebhookUrl(webhookUrl);
      const { getBotWebhookInfo } = await import("./telegram-bot");
      const info = await getBotWebhookInfo();
      res.json({ success: true, webhookUrl, ...info });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ── Test message to admin group ────────────────────────────────────────────
  app.post("/api/admin/telegram/test-bot", authMiddleware("admin"), async (req, res) => {
    try {
      const { notifyAdminGroup, getBot } = await import("./telegram-bot");
      if (!getBot()) return res.status(400).json({ message: "Bot non initialisé — vérifiez TELEGRAM_BOT_TOKEN" });
      const groupId = await storage.getSetting("telegram_group_id");
      if (!groupId) return res.status(400).json({ message: "Groupe admin non configuré — définissez d'abord le Chat ID" });
      await notifyAdminGroup(
        `🤖 *Test bot WestPay*\n\n` +
        `✅ Le bot fonctionne correctement.\n` +
        `🕐 ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Lagos" })}\n` +
        `🌐 Environnement : ${process.env.NODE_ENV || "development"}`
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/admin/telegram/main-bot/settings", authMiddleware("admin"), async (req, res) => {
    try {
      const { token } = req.body;
      if (!token || typeof token !== "string" || !token.trim()) {
        return res.status(400).json({ message: "token requis" });
      }
      const { reloadMainBot } = await import("./telegram-bot");
      const result = await reloadMainBot(token.trim());
      if (!result.ok) return res.status(400).json({ message: result.error || "Token invalide" });
      await storage.createApiLog({ action: "telegram_main_bot_token_updated", description: `Token bot principal mis à jour — @${result.username}`, ip: req.ip || "" });
      res.json({ success: true, username: result.username });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      await storage.createApiLog({ action: "telegram_group_updated", description: `Groupe admin Telegram mis a jour : ${trimmed}`, ip: req.ip || "" });
      res.json({ success: true, groupId: trimmed });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      await storage.createApiLog({ action: "otp_bot_token_updated", description: "OTP bot token updated and reloaded", ip: req.ip || "" });
      res.json({ success: true, username: result.username });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ── Sync all known groups (merge setting + admin + merchant chatIds) ──────────
  app.post("/api/admin/telegram/sync-groups", authMiddleware("admin"), async (req, res) => {
    try {
      const { syncAllKnownGroups, getBot } = await import("./telegram-bot");
      if (!getBot()) return res.status(400).json({ message: "Bot non initialisé — vérifiez TELEGRAM_BOT_TOKEN" });
      const result = await syncAllKnownGroups();
      res.json({ success: true, total: result.total, added: result.added });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      let useAllKnownGroups = false;

      if (target === "all_groups") {
        useAllKnownGroups = true;
      } else if (target === "specific" && Array.isArray(merchantIds) && merchantIds.length > 0) {
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
        useAllKnownGroups,
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/stats/by-merchant", authMiddleware("admin"), async (req, res) => {
    try {
      const period = (req.query.period as string) || "all";
      const validPeriod = ["today", "month", "all"].includes(period) ? (period as "today" | "month" | "all") : "all";
      const data = await storage.getCommissionByMerchant(validPeriod);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/stats/by-country", authMiddleware("admin"), async (req, res) => {
    try {
      const period = (req.query.period as string) || "all";
      const validPeriod = ["today", "month", "all"].includes(period) ? (period as "today" | "month" | "all") : "all";
      const data = await storage.getCommissionByCountry(validPeriod);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.delete("/api/admin/stats-baseline", authMiddleware("admin"), async (_req, res) => {
    try {
      await storage.deleteAllStatsBaselines();
      queryClient?.invalidateQueries?.({ queryKey: ["/api/admin/stats"] });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/admin/reset-fees", authMiddleware("admin"), async (_req, res) => {
    try {
      const [stats, detailedStats, baseline] = await Promise.all([
        storage.getStats(),
        storage.getAdminDetailedStats(),
        storage.getLatestStatsBaseline(),
      ]);
      const b = baseline || { transactionCount: 0, totalVolume: 0, commissionTotal: 0, apiPaymentsCount: 0, apiPaymentsTotal: 0, linkPaymentsCount: 0, linkPaymentsTotal: 0, withdrawalsCount: 0, withdrawalsTotal: 0 };
      await storage.createStatsBaseline({
        transactionCount: stats.transactionCount - Math.max(0, stats.transactionCount - b.transactionCount),
        totalVolume: stats.totalVolume - Math.max(0, stats.totalVolume - b.totalVolume),
        commissionTotal: detailedStats.commissionTotal,
        apiPaymentsCount: stats.transactionCount - Math.max(0, detailedStats.apiPaymentsCount - b.apiPaymentsCount),
        apiPaymentsTotal: detailedStats.apiPaymentsTotal - Math.max(0, detailedStats.apiPaymentsTotal - b.apiPaymentsTotal),
        linkPaymentsCount: detailedStats.linkPaymentsCount - Math.max(0, detailedStats.linkPaymentsCount - b.linkPaymentsCount),
        linkPaymentsTotal: detailedStats.linkPaymentsTotal - Math.max(0, detailedStats.linkPaymentsTotal - b.linkPaymentsTotal),
        withdrawalsCount: detailedStats.withdrawalsCount - Math.max(0, detailedStats.withdrawalsCount - b.withdrawalsCount),
        withdrawalsTotal: detailedStats.withdrawalsTotal - Math.max(0, detailedStats.withdrawalsTotal - b.withdrawalsTotal),
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/merchants", authMiddleware("admin"), async (_req, res) => {
    try {
      const result = await (storage as any).getMerchantsWithStats();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.json({ merchant: sanitizeMerchant(merchant), links, transactions: txs.slice(0, 50), countries, hasPin: !!pin, totalRevenue });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/admin/create-merchant", authMiddleware("admin"), createMerchantRateLimit, async (req, res) => {
    try {
      const { name, email, slug, password, pin, website, totpCode } = req.body;
      if (!name || !email || !slug || !password) return res.status(400).json({ message: "Tous les champs sont requis" });

      // ── Vérification TOTP Google Authenticator obligatoire ────────────────────────────
      // L'admin doit fournir son code Google Authenticator pour créer un marchand.
      // Cela empêche un attaquant ayant accès au dashboard de créer des comptes en masse.
      if (!totpCode || typeof totpCode !== "string" || !/^\d{6}$/.test(totpCode.trim())) {
        return res.status(400).json({ message: "Code Google Authenticator requis (6 chiffres)" });
      }
      const adminUser = (req as any).user;
      const adminRecord = await storage.getAdminById(adminUser.id);
      if (!adminRecord || !adminRecord.totpEnabled || !adminRecord.totpSecret) {
        return res.status(403).json({ message: "Google Authenticator non configuré sur votre compte" });
      }
      const totpSecretDecrypted = decryptTotpSecret(adminRecord.totpSecret);
      const totpValid = totpVerifySync({ token: totpCode.trim(), secret: totpSecretDecrypted, strategy: "totp" });
      if (!totpValid) {
        const clientIp = extractIp(req);
        storage.createSecurityLog({ eventType: "blocked_access", ip: clientIp, userEmail: adminUser.email, action: "create_merchant_totp_invalid", details: "Code TOTP invalide lors de la tentative de création marchand" }).catch(() => {});
        return res.status(401).json({ message: "Code Google Authenticator invalide" });
      }

      // ── Vérification DNS MX — l'adresse email doit exister pour éviter les faux comptes ─
      const emailDomainValid = await verifyEmailDomainHasMx(email);
      if (!emailDomainValid) {
        return res.status(400).json({ message: "L'adresse email semble invalide ou son domaine n'existe pas" });
      }

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

      res.json(sanitizeMerchant(merchant));
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/admin/update-merchant", authMiddleware("admin"), async (req, res) => {
    try {
      const { id, ...data } = req.body;
      if (!id) return res.status(400).json({ message: "ID requis" });
      await storage.updateMerchant(id, data);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/merchant/:id/wallets", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      const wallets = await storage.getMerchantCountries(merchantId);
      res.json(wallets);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.put("/api/admin/merchant/:id/country/:countryId/active", authMiddleware("admin"), async (req, res) => {
    try {
      const countryId = parseInt(req.params.countryId);
      const { active } = req.body;
      await storage.updateMerchantCountryActive(countryId, !!active);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.delete("/api/admin/delete-merchant/:id", authMiddleware("admin"), async (req, res) => {
    try {
      await storage.deleteMerchant(parseInt(req.params.id as string));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/admin/add-countries", authMiddleware("admin"), async (req, res) => {
    try {
      const { merchantId, countries } = req.body;
      if (!merchantId || !Array.isArray(countries) || countries.length === 0) {
        return res.status(400).json({ message: "Marchand et au moins un pays requis" });
      }
      const results = [];
      const errors = [];
      for (const country of countries) {
        try {
          const apiKey = generateSecureApiKey(country);
          const mc = await storage.addMerchantCountry({ merchantId, country, apiKey, balance: 0, active: true, omnipayEnabled: true });
          results.push(mc);
        } catch (e: any) {
          errors.push({ country, error: e.message });
        }
      }
      await storage.createApiLog({
        merchantId,
        action: "countries_added",
        ip: req.ip || "",
        description: `${results.length} pays activés : ${results.map((r: any) => r.country).join(", ")}`,
      });
      res.json({ added: results.length, countries: results, errors });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.delete("/api/admin/merchant-country/:id", authMiddleware("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "ID invalide" });
      await storage.deleteMerchantCountry(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/admin/update-balance", authMiddleware("admin"), async (req, res) => {
    try {
      const { id, balance, adminPassword } = req.body;
      if (id === undefined || balance === undefined) return res.status(400).json({ message: "ID et solde requis" });
      if (!adminPassword) return res.status(400).json({ message: "Mot de passe administrateur requis pour créditer un compte" });

      // ── Vérification du mot de passe admin ───────────────────────────────────
      const adminUser = (req as any).user;
      const adminRecord = await storage.getAdminById(adminUser.id);
      if (!adminRecord) return res.status(403).json({ message: "Administrateur introuvable" });
      const passwordValid = await bcrypt.compare(adminPassword, adminRecord.passwordHash);
      if (!passwordValid) return res.status(403).json({ message: "Mot de passe administrateur incorrect" });

      // ── Lecture du solde actuel pour calculer le crédit admin ──────────────
      const currentMC = await storage.getMerchantCountryById(id);
      if (!currentMC) return res.status(404).json({ message: "Wallet introuvable" });

      await storage.updateMerchantCountryBalance(id, balance);

      // ── Si le nouveau solde > solde actuel, enregistrer le crédit admin ────
      if (balance > (currentMC.balance ?? 0)) {
        const creditAmount = balance - (currentMC.balance ?? 0);
        await storage.addAdminCreditToMC(id, creditAmount);
      }

      const updatedMC = await storage.getMerchantCountryById(id);
      if (updatedMC) {
        const balMerchant = await storage.getMerchantById(updatedMC.merchantId);
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      const txLimit = hasDateFilter ? undefined : 1000;

      const [txs, wds, wts, merchantsList, pendingPays] = await Promise.all([
        storage.getTransactions(undefined, { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, limit: txLimit }).catch((err) => {
          console.error("[ADMIN TRANSACTIONS] Erreur getTransactions:", err?.message || err);
          return [] as any[];
        }),
        storage.getWithdrawals().catch((err) => {
          console.error("[ADMIN TRANSACTIONS] Erreur getWithdrawals:", err?.message || err);
          return [] as any[];
        }),
        storage.getWalletTransfers().catch((err) => {
          console.error("[ADMIN TRANSACTIONS] Erreur getWalletTransfers:", err?.message || err);
          return [] as any[];
        }),
        storage.getMerchants().catch((err) => {
          console.error("[ADMIN TRANSACTIONS] Erreur getMerchants:", err?.message || err);
          return [] as any[];
        }),
        storage.getPendingPayments().catch((err) => {
          console.error("[ADMIN TRANSACTIONS] Erreur getPendingPayments:", err?.message || err);
          return [] as any[];
        }),
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

      // Seuls les paiements vraiment EN COURS (omnipay_pending/submitted) sont affichés ici.
      // Les confirmés et échoués apparaissent déjà via la table transactions → pas de doublon.
      const pendingItems = pendingPays
        .filter(p => ["omnipay_pending", "submitted", "pending"].includes(p.status))
        .map(p => ({
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
          provider: (p as any).gateway || null,
          omnipayReference: p.omnipayReference,
          errorMessage: (p as any).errorMessage || null,
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/numbers", authMiddleware("admin"), async (_req, res) => {
    try {
      const nums = await storage.getNumbers();
      res.json(nums);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.patch("/api/admin/toggle-number/:id", authMiddleware("admin"), async (req, res) => {
    try {
      const updated = await storage.toggleNumberStatus(parseInt(req.params.id as string));
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.delete("/api/admin/delete-number/:id", authMiddleware("admin"), async (req, res) => {
    try {
      await storage.deleteNumber(parseInt(req.params.id as string));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/sms-logs", authMiddleware("admin"), async (_req, res) => {
    try {
      const logs = await storage.getSmsLogs();
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/admins", authMiddleware("admin"), async (_req, res) => {
    try {
      const allAdmins = await db.select({ id: admins.id, email: admins.email, createdAt: admins.createdAt }).from(admins).orderBy(admins.createdAt);
      res.json(allAdmins);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/admin/create-admin", authMiddleware("admin"), async (req, res) => {
    // BLOQUÉ DÉFINITIVEMENT — Le système est limité aux deux comptes administrateur autorisés
    const attemptEmail = req.body?.email || "?";
    const requester = (req as any).user;
    storage.createSecurityLog({
      eventType: "unauthorized_admin_creation",
      ip: (req.ip || "").replace(/^::ffff:/, ""),
      userEmail: requester?.email || attemptEmail,
      action: "creation_permanently_disabled",
      details: `Tentative de création du compte admin "${attemptEmail}" — fonctionnalité désactivée définitivement`
    }).catch(() => {});
    return res.status(403).json({ message: "La création de comptes administrateur est définitivement désactivée. Le système accepte uniquement les deux comptes autorisés." });
  });

  app.delete("/api/admin/delete-admin/:id", authMiddleware("admin"), async (req, res) => {
    try {
      const currentAdmin = (req as any).user;
      const id = Number(req.params.id);
      if (currentAdmin && currentAdmin.id === id) return res.status(400).json({ message: "Vous ne pouvez pas supprimer votre propre compte" });
      await db.delete(admins).where(eq(admins.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/merchant/:id/api-keys", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id as string);
      const countries = await storage.getMerchantCountries(merchantId);
      res.json(countries);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/api-logs", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = req.query.merchantId ? parseInt(req.query.merchantId as string) : undefined;
      const logs = await storage.getApiLogs(merchantId);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/webhook-logs", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = req.query.merchantId ? parseInt(req.query.merchantId as string) : undefined;
      const logs = await storage.getWebhookLogs(merchantId);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.put("/api/admin/merchant/:id/webhook", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = parseInt(String(req.params.id));
      const { webhookUrl } = req.body;
      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant) return res.status(404).json({ message: "Marchand non trouve" });

      if (webhookUrl) {
        try { assertPublicWebhookUrl(webhookUrl); } catch (e: any) {
          return res.status(400).json({ message: e.message });
        }
      }

      const webhookSecret = webhookUrl ? (merchant.webhookSecret || crypto.randomBytes(32).toString("hex")) : null;
      await storage.updateMerchantWebhook(merchantId, webhookUrl || null, webhookSecret);

      res.json({ success: true, webhookUrl: webhookUrl || "", webhookSecret: webhookSecret || "" });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/merchant/:id/telegram/status", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = parseInt(String(req.params.id));
      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant) return res.status(404).json({ message: "Marchand non trouve" });

      res.json({ linked: !!merchant.telegramChatId, chatId: merchant.telegramChatId || null, language: merchant.telegramBotLanguage || "fr" });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ==================== MERCHANT ROUTES ====================
  app.get("/api/merchant/me", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchant = await storage.getMerchantById((req as any).user.id);
      if (!merchant) return res.status(404).json({ message: "Marchand introuvable" });
      res.json({ id: merchant.id, name: merchant.name, email: merchant.email, slug: merchant.slug, feeExempt: merchant.feeExempt, withdrawalsDisabled: !!merchant.withdrawalsDisabled });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/merchant/balance", authMiddleware("merchant"), async (req, res) => {
    try {
      const countries = await storage.getMerchantCountries((req as any).user.id);
      res.json(countries);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/merchant/api-keys", authMiddleware("merchant"), async (req, res) => {
    try {
      const countries = await storage.getMerchantCountries((req as any).user.id);
      res.json(countries);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/merchant/stats", authMiddleware("merchant"), async (req, res) => {
    try {
      const stats = await storage.getMerchantStats((req as any).user.id);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ==================== MERCHANT WEBHOOK ====================

  async function sendWebhookNotification(merchantId: number, payload: Record<string, any>): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    try {
      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant?.webhookUrl) return { success: false, error: "Aucune URL webhook configuree" };

      assertPublicWebhookUrl(merchant.webhookUrl);

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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.put("/api/merchant/webhook", authMiddleware("merchant"), async (req, res) => {
    try {
      const { webhookUrl } = req.body;
      const merchantId = (req as any).user.id;

      if (webhookUrl) {
        try { assertPublicWebhookUrl(webhookUrl); } catch (e: any) {
          return res.status(400).json({ message: e.message });
        }
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/merchant/webhook/logs", authMiddleware("merchant"), async (req, res) => {
    try {
      const logs = await storage.getWebhookLogs((req as any).user.id);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ==================== API DOCS ACCESS (PIN protected) ====================
  app.post("/api/docs/access", docsAccessRateLimit, async (req, res) => {
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ── Public: pay via crypto link uniqueId (white label — no redirect) ────────
  app.post("/api/crypto-link/:uniqueId/pay", cryptoPayRateLimit, async (req, res) => {
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
      const callbackUrl = `${process.env.APP_URL || "http://Westpay.cfd"}/api/oxapay/callback`;
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.json({ success: true, link, url: `${process.env.APP_URL || "http://Westpay.cfd"}/c/${uniqueId}` });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ── Merchant: list crypto payment links ─────────────────────────────────
  app.get("/api/merchant/crypto-links", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const links = await storage.getCryptoPaymentLinksByMerchant(merchantId);
      const BASE = process.env.APP_URL || "http://Westpay.cfd";
      res.json(links.map(l => ({ ...l, url: `${BASE}/c/${l.uniqueId}` })));
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ── Merchant: delete crypto payment link ─────────────────────────────────
  app.delete("/api/merchant/crypto-links/:id", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      await storage.deleteCryptoPaymentLink(Number(req.params.id), merchantId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      const callbackUrl = `${process.env.APP_URL || "http://Westpay.cfd"}/api/oxapay/callback`;
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
        paymentUrl: `${process.env.APP_URL || "http://Westpay.cfd"}/pay/crypto/${invoiceResult.trackId}`,
      });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ── Signalement d'échec côté frontend (paiement initié mais USSD/OTP raté) ──
  app.post("/api/payment/report-failure", reportFailureRateLimit, async (req, res) => {
    try {
      const { paymentId, errorMessage } = req.body;
      if (!paymentId || !errorMessage) {
        return res.status(400).json({ message: "paymentId et errorMessage requis" });
      }
      const id = parseInt(String(paymentId), 10);
      if (isNaN(id)) return res.status(400).json({ message: "paymentId invalide" });

      const pending = await storage.getPendingPayment(id);
      if (!pending) return res.status(404).json({ message: "Paiement introuvable" });

      // Ne pas écraser un statut déjà finalisé (confirmed/failed)
      if (!["pending", "omnipay_pending", "submitted"].includes(pending.status)) {
        return res.json({ ok: true });
      }

      const truncated = String(errorMessage).slice(0, 500);
      await storage.updatePendingPaymentError(id, "failed", truncated);
      console.log(`[PAYMENT REPORT] Échec signalé pour pending #${id}: ${truncated}`);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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

      const callbackBaseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const dialCodes: Record<string, string> = {
        "Togo": "228", "Benin": "229", "Cote d'Ivoire": "225",
        "Senegal": "221", "Mali": "223", "Burkina Faso": "226",
        "Cameroun": "237", "Congo Brazzaville": "242", "Gabon": "241",
        "Congo RDC": "243", "Guinee": "224", "Gambie": "220",
        "Pakistan": "92", "Philippines": "63", "India": "91", "Nigeria": "234",
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
      const useSeapay = gatewayLower === "seapay";
      const useClapay = gatewayLower === "clapay";

      if (useSendava) {
        const sendavaApiKey = await getSendavaApiKey();
        if (!sendavaApiKey) {
          return res.status(500).json({ message: "Service de paiement non configure. Contactez l'administrateur." });
        }

        const reference = sendavaGenerateRef();
        const countryCode = SENDAVAPAY_COUNTRY_CODES[country] || "";
        const currency = SENDAVAPAY_CURRENCY_MAP[countryCode] || "XOF";
        const webhookUrl = `${callbackBaseUrl}/api/sendavapay/callback`;

        try {
          // Étape 1 (backend) : créer le paiement → obtenir paymentToken + reference
          const returnRef = reference;
          const returnBase = callbackBaseUrl;
          const sendavaReturnUrl = redirectUrl
            ? `${returnBase}/api/payment/sendavapay/return?ref=${encodeURIComponent(returnRef)}&redirect=${encodeURIComponent(redirectUrl)}`
            : `${returnBase}/api/payment/sendavapay/return?ref=${encodeURIComponent(returnRef)}`;
          const sendavaResult = await sendavaCreatePayment(sendavaApiKey, {
            amount: parsedAmount,
            currency,
            payerCountry: countryCode,
            customerName: payerName || undefined,
            customerPhone: msisdn ? ("+" + msisdn.replace(/^\+/, "")) : undefined,
            description: `Paiement WestPay - ${merchantSlug}`,
            webhookUrl,
            externalReference: reference,
            metadata: { merchantSlug, country, returnUrl: sendavaReturnUrl },
          });

          if (!sendavaResult.success || !sendavaResult.data?.paymentToken) {
            const rawError = sendavaResult.message || (sendavaResult as any).error || "Erreur de paiement. Veuillez reessayer.";
            const userMsg = "Service de paiement temporairement indisponible. Veuillez reessayer dans quelques instants.";
            console.error(`[SENDAVAPAY] Erreur interne API: ${rawError}`);
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
              errorMessage: rawError,
            }).catch(() => {});
            return res.status(400).json({ message: userMsg });
          }

          const spReference = sendavaResult.data.reference;
          const paymentToken = sendavaResult.data.paymentToken;
          const payerPhoneE164 = msisdn.startsWith("+") ? msisdn : `+${msisdn}`;

          // ── Étape 2 (serveur) : résoudre l'opérateur ────────────────────
          // Résolution serveur — identique à la logique du frontend (supprimée).
          const normStr = (s: string) => s.toLowerCase().replace(/[\s\-_]+/g, "");
          const resolveOpId = (ops: any[], name: string): string | null => {
            const low = name.toLowerCase().trim();
            const normLow = normStr(low);
            const exact = ops.find((o: any) => normStr(o.name) === normLow);
            if (exact) return exact.id;
            const contained = ops.find((o: any) => {
              const on = normStr(o.name);
              return normLow.includes(on) || on.includes(normLow);
            });
            if (contained) return contained.id;
            const BRAND_MAP: Record<string, string> = {
              "tmoney": "tmoney", "moov money": "moov", "moov": "moov",
              "mtn mobile money": "mtn", "mtn money": "mtn", "mtn": "mtn",
              "orange money": "orange", "orange": "orange",
              "wave": "wave", "mixx by yas": "mixx", "mixx": "mixx",
              "free money": "free", "free": "free",
              "coris money": "coris", "coris": "coris",
              "airtel money": "airtel", "airtel": "airtel",
              "m-pesa": "mpesa", "mpesa": "mpesa",
              "vodacom": "vodacom",
              "africell money": "africell", "africell": "africell",
              "celtiis": "celtiis",
            };
            const brand = BRAND_MAP[low];
            if (brand) {
              const branded = ops.find((o: any) => normStr(o.name).includes(brand) || normStr(o.id ?? "").includes(brand));
              if (branded) return branded.id;
            }
            for (const kw of ["mtn","orange","moov","wave","mixx","airtel","vodacom","mpesa","tmoney","coris","free","africell","celtiis"]) {
              if (normLow.includes(kw)) {
                const found = ops.find((o: any) => normStr(o.name).includes(kw) || normStr(o.id ?? "").includes(kw));
                if (found) return found.id;
              }
            }
            return ops[0]?.id ?? null;
          };

          let operatorId: string | null = null;
          try {
            const opsResult = await sendavaGetOperators(sendavaApiKey, countryCode);
            const ops: any[] = Array.isArray(opsResult.data) ? opsResult.data : [];
            operatorId = resolveOpId(ops, paymentMethod);
            console.log(`[SENDAVAPAY] Opérateurs ${countryCode}: ${ops.length} — résolu: ${operatorId}`);
          } catch (opsErr: any) {
            console.error("[SENDAVAPAY] Erreur récupération opérateurs:", opsErr.message);
            // Continuer sans operatorId — le push pourrait quand même fonctionner
          }

          // Stocker le paiement en attente
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
            omnipayPaymentUrl: null,
            gateway: "sendavapay",
            expiresAt,
          });

          await storage.createApiLog({
            merchantId: merchant.id,
            action: "sendavapay_payment_created",
            ip: req.ip || "",
            description: `Paiement SendavaPay créé - Ref: ${spReference} - Montant: ${parsedAmount} ${currency} - Opérateur: ${operatorId ?? "inconnu"}`,
          });

          // ── Étape 3 (serveur) : déclencher le push USSD ─────────────────
          if (!operatorId) {
            // Pas d'opérateur trouvé → polling, le webhook confirmera
            console.warn(`[SENDAVAPAY] Opérateur introuvable pour "${paymentMethod}" — passage en polling`);
            return res.json({ success: true, paymentId: pending.id, sendavapay: true, omnipayReference: spReference, polling: true, fees: 0 });
          }

          try {
            const initResult = await sendavaInitiatePayment(sendavaApiKey, {
              paymentToken,
              payerName: payerName || "Client",
              payerPhone: payerPhoneE164,
              payerCountry: countryCode,
              operatorId,
            });
            console.log(`[SENDAVAPAY] initiate-payment: success=${initResult.success} code=${initResult.code ?? "-"} redirect=${!!initResult.requiresRedirect} otp=${!!initResult.requiresOtp}`);

            if (!initResult.success) {
              // SERVER_ERROR ou PAYMENT_IN_PROGRESS → polling (le webhook arrivera)
              if (initResult.code === "SERVER_ERROR" || initResult.code === "PAYMENT_IN_PROGRESS") {
                return res.json({ success: true, paymentId: pending.id, sendavapay: true, omnipayReference: spReference, polling: true, fees: 0 });
              }
              const errMsg = initResult.error || initResult.message || "Erreur initiation paiement";
              console.error(`[SENDAVAPAY] initiate-payment erreur: ${errMsg}`);
              return res.status(400).json({ message: errMsg });
            }

            if (initResult.requiresRedirect && initResult.redirectUrl) {
              return res.json({ success: true, paymentId: pending.id, sendavapay: true, omnipayReference: spReference, paymentUrl: initResult.redirectUrl, fees: 0 });
            }
            if (initResult.requiresOtp) {
              return res.json({ success: true, paymentId: pending.id, sendavapay: true, omnipayReference: spReference, requiresOtp: true, otpToken: initResult.otpToken ?? null, fees: 0 });
            }
            // Succès normal : push USSD envoyé → polling
            return res.json({ success: true, paymentId: pending.id, sendavapay: true, omnipayReference: spReference, polling: true, fees: 0 });
          } catch (initErr: any) {
            console.error("[SENDAVAPAY] Erreur initiation paiement:", initErr.message);
            // Timeout ou erreur réseau → polling quand même (le webhook peut confirmer)
            return res.json({ success: true, paymentId: pending.id, sendavapay: true, omnipayReference: spReference, polling: true, fees: 0 });
          }
        } catch (sendavaErr: any) {
          console.error("[SENDAVAPAY] Erreur création paiement:", sendavaErr.message);
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
      } else if (useSeapay) {
        /* ── SeaPay : GCash / Maya / UPI / EasyPaisa / JazzCash ─────────── */
        const [spMerchantId, spApiKey] = await Promise.all([getSeapayMerchantId(country), getSeapayApiKey(country)]);
        if (!spMerchantId || !spApiKey) {
          return res.status(500).json({ message: "Service de paiement non configure. Contactez l'administrateur." });
        }

        const reference = seapayGenerateRef();
        const currency = SEAPAY_CURRENCY_COUNTRY[country] || "USD";
        const callbackUrl = `${callbackBaseUrl}/api/seapay/callback`;
        const returnUrl = redirectUrl
          ? `${callbackBaseUrl}/pay?ref=${encodeURIComponent(reference)}&omnipay_status=complete`
          : `${callbackBaseUrl}/pay?ref=${encodeURIComponent(reference)}&omnipay_status=complete`;
        const channelCode = operatorRecord?.seapayCode || undefined;

        try {
          const spResult = await seapayPayin({
            merchantId: spMerchantId,
            currency,
            amount: parsedAmount,
            orderId: reference,
            notifyUrl: callbackUrl,
            channelCode,
            returnUrl,
            customerPhone: payerPhone || undefined,
            customerName: payerName || undefined,
          }, spApiKey);

          if (spResult.code !== 200 || !spResult.data) {
            const errorMsg = spResult.msg || "Erreur de paiement. Veuillez reessayer.";
            storage.createTransaction({
              merchantId: merchant.id, country,
              txId: reference, amount: parsedAmount,
              payerNumber: msisdn || null, payerName: payerName || null,
              status: "failed", provider: "seapay",
              omnipayTxId: null, operator: paymentMethod || null,
              omnipayReference: reference, errorMessage: errorMsg,
            }).catch(() => {});
            return res.status(400).json({ message: "Paiement non abouti. Veuillez reessayer." });
          }

          const paymentUrl = spResult.data.payment_url || null;
          const pending = await storage.createPendingPayment({
            merchantId: merchant.id, country,
            amount: parsedAmount,
            payerPhone: payerPhone || null,
            payerName: payerName || null,
            paymentMethod,
            txId: null,
            status: "omnipay_pending",
            redirectUrl: redirectUrl || null,
            omnipayReference: reference,
            omnipayTxId: spResult.data.trade_no || null,
            omnipayPaymentUrl: paymentUrl,
            gateway: "seapay",
            expiresAt,
          });

          await storage.createApiLog({
            merchantId: merchant.id,
            action: "seapay_payment_initiated",
            ip: req.ip || "",
            description: `Paiement SeaPay initie - Ref: ${reference} - Montant: ${parsedAmount} ${currency} - Operateur: ${paymentMethod}`,
          });

          return res.json({
            success: true,
            paymentId: pending.id,
            seapay: true,
            omnipayReference: reference,
            paymentUrl,
            fees: 0,
          });
        } catch (spErr: any) {
          console.error("[SEAPAY] Erreur initiation:", spErr.message);
          return res.status(500).json({ message: "Erreur de connexion au service de paiement. Veuillez reessayer." });
        }
      } else if (useClapay) {
        /* ── ClaPay : paiement mobile money multi-pays ────────────────── */
        const clapayToken = await getClapayApiKey();
        if (!clapayToken) {
          return res.status(500).json({ message: "Service de paiement non configure. Contactez l'administrateur." });
        }

        const reference = clapayGenerateRef();
        const countryCode = clapayCountryCode(country);
        const currency = clapayCurrency(country);
        const callbackUrl = `${callbackBaseUrl}/api/clapay/callback`;
        const returnUrl = `${callbackBaseUrl}/pay?ref=${encodeURIComponent(reference)}&omnipay_status=complete`;

        try {
          const clapayOpCode = (operatorRecord as any)?.clapayCode || paymentMethod || "";
          const clapayTunnel = clapaySelectTunnel(clapayOpCode);

          // Valider le numéro uniquement pour les opérateurs API direct
          let clapayLocalPhoneVal = "";
          if (clapayTunnel === "API") {
            const rawPhone = msisdn || payerPhone || "";
            const phoneCheck = clapayValidatePhone(rawPhone, countryCode);
            if (!phoneCheck.ok) {
              return res.status(400).json({ message: phoneCheck.error });
            }
            clapayLocalPhoneVal = phoneCheck.localPhone;
          }

          // additional_infos est obligatoire pour TOUTES les requêtes ClaPay (API v3)
          // — confirmé : sans ce champ, l'API retourne 400 "additional_infos must be an object"
          const nameParts = (payerName || "Client RobotPay").split(" ");
          const cpAdditionalInfos: Record<string, string> = {
            customer_firstname: nameParts[0] || "Client",
            customer_lastname:  nameParts.slice(1).join(" ") || "RobotPay",
          };
          if (clapayTunnel === "API" && clapayLocalPhoneVal) {
            cpAdditionalInfos.customer_phone = clapayLocalPhoneVal;
          }

          const cpResult = await clapayInitiatePayin(clapayToken, {
            transaction_id: reference,
            amount: parsedAmount,
            country_code: countryCode,
            operators_code: clapayOpCode ? [clapayOpCode] : [],
            method: "MERCHANT",
            tunnel: clapayTunnel,
            callback_url: callbackUrl,
            return_url: returnUrl,
            additional_infos: cpAdditionalInfos,
          });

          if (!cpResult.success) {
            const errorMsg = cpResult.message || "Erreur de paiement. Veuillez reessayer.";
            console.error(`[CLAPAY] Erreur initiation: ${errorMsg}`);
            storage.createTransaction({
              merchantId: merchant.id, country,
              txId: reference, amount: parsedAmount,
              payerNumber: msisdn || null, payerName: payerName || null,
              status: "failed", provider: "clapay",
              omnipayTxId: null, operator: paymentMethod || null,
              omnipayReference: reference, errorMessage: errorMsg,
            }).catch(() => {});
            return res.status(400).json({ message: "Paiement non abouti. Veuillez reessayer." });
          }

          const paymentUrl = cpResult.data?.payment_url || null;
          // La signature NoWallet est utilisée pour les checks de statut (/check/status/payment)
          const cpTxId = cpResult.data?.signature || null;
          const pending = await storage.createPendingPayment({
            merchantId: merchant.id, country,
            amount: parsedAmount,
            payerPhone: payerPhone || null,
            payerName: payerName || null,
            paymentMethod,
            txId: null,
            status: "omnipay_pending",
            redirectUrl: redirectUrl || null,
            omnipayReference: reference,
            omnipayTxId: cpTxId,
            omnipayPaymentUrl: paymentUrl,
            gateway: "clapay",
            expiresAt,
          });

          await storage.createApiLog({
            merchantId: merchant.id,
            action: "clapay_payment_initiated",
            ip: req.ip || "",
            description: `Paiement ClaPay initie - Ref: ${reference} - Montant: ${parsedAmount} ${currency} - Operateur: ${paymentMethod}`,
          });

          return res.json({
            success: true,
            paymentId: pending.id,
            clapay: true,
            omnipayReference: reference,
            paymentUrl,
            fees: 0,
          });
        } catch (cpErr: any) {
          console.error("[CLAPAY] Erreur initiation:", cpErr.message);
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/payment/validate", validateRateLimit, async (req, res) => {
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ==================== VERIFY TRANSACTION (public) ====================
  app.post("/api/verify-transaction", verifyTxRateLimit, async (req, res) => {
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
      // SÉCURITÉ : rejet fail-closed — si la clé n'est pas configurée, on refuse tout webhook
      if (!callbackKey) {
        console.error("[OMNIPAY CALLBACK] SÉCURITÉ: Clé de callback non configurée — webhook rejeté. Configurez omnipay_callback_key dans les paramètres admin.");
        return res.status(503).json({ message: "Webhook non sécurisé — configurez la clé de callback OmniPay dans les paramètres admin" });
      }
      if (!payload.signature) {
        console.error("[OMNIPAY CALLBACK] Signature manquante");
        return res.status(401).json({ message: "Signature manquante" });
      }
      const isValid = omnipayVerifySignature(callbackKey, payload);
      if (!isValid) {
        console.error("[OMNIPAY CALLBACK] Signature invalide");
        return res.status(401).json({ message: "Signature invalide" });
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
        const casResult = await financialPool.query(
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
            const merchantCredit1 = calcMerchantCreditForMerchant(pending.amount, pending.country, merchant);
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
      res.status(500).json({ message: safeErrMsg(err) });
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
                    const credit = calcMerchantCreditForMerchant(pending.amount, pending.country, merchant);
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
                  const mbFailRef = pending.omnipayReference || `FAIL-MB-${pending.id}`;
                  const mbExistingFail = await storage.getTransactionByTxId(mbFailRef);
                  if (!mbExistingFail) {
                    storage.createTransaction({
                      merchantId: pending.merchantId,
                      country: pending.country,
                      txId: mbFailRef,
                      amount: pending.amount,
                      payerNumber: pending.payerPhone || null,
                      payerName: pending.payerName || null,
                      status: "failed",
                      provider: "westpay",
                      omnipayTxId: null,
                      operator: pending.paymentMethod || null,
                      omnipayReference: pending.omnipayReference,
                      errorMessage: `Paiement ${s} par Mbiyo`,
                      providerFee: 0,
                    }).catch(() => {});
                  }
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
              const statusResult = await sendavaGetPaymentStatus(sendavaKey, pending.omnipayReference);
              const spStatus = (statusResult.data?.status || "").toLowerCase();
              const spSuccess = ["completed", "paid", "successful", "success", "approved"].includes(spStatus);
              const spFailed = ["failed", "failure", "cancelled", "canceled", "rejected"].includes(spStatus);

              if (spSuccess) {
                const mc = await storage.findMerchantCountryBySimAndCountry(pending.merchantId, pending.country);
                const merchant = await storage.getMerchantById(pending.merchantId);
                if (mc) {
                  const credit = calcMerchantCreditForMerchant(pending.amount, pending.country, merchant);
                  const westpayFee = pending.amount - credit;
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
                      providerFee: westpayFee,
                    });
                    console.log(`[POLL SENDAVAPAY] Paiement credite via polling — ref=${pending.omnipayReference} montant=${pending.amount} frais=${westpayFee} credit=${credit}`);
                    notifyMerchantPayment(pending.merchantId, { txId: txRef, amount: pending.amount, payerNumber: pending.payerPhone, country: pending.country, provider: "westpay" }).catch(() => {});
                    notifyAdminPayment({ txId: txRef, merchantName: merchant?.name || `#${pending.merchantId}`, payerNumber: pending.payerPhone, country: pending.country, amount: pending.amount, provider: "westpay", status: "confirmed" }).catch(() => {});
                  }
                }
                return res.json({ status: "confirmed", paymentId: pending.id });
              }

              if (spFailed) {
                await storage.updatePendingPaymentStatus(pending.id, "omnipay_failed");
                const failTxId = `SP-${pending.omnipayReference}`;
                const existingFail = await storage.getTransactionByTxId(failTxId);
                if (!existingFail) {
                  storage.createTransaction({
                    merchantId: pending.merchantId,
                    country: pending.country,
                    txId: failTxId,
                    amount: pending.amount,
                    payerNumber: pending.payerPhone || null,
                    payerName: pending.payerName || null,
                    status: "failed",
                    provider: "westpay",
                    omnipayTxId: null,
                    operator: pending.paymentMethod || null,
                    omnipayReference: pending.omnipayReference,
                    errorMessage: `Paiement ${spStatus}`,
                    providerFee: 0,
                  }).catch(() => {});
                }
                return res.json({ status: "failed", paymentId: pending.id });
              }

              return res.json({ status: "pending", paymentId: pending.id });
            } catch {}
          }
        } else if (pending.gateway === "clapay") {
          const cpToken = await getClapayApiKey();
          // omnipayTxId contient la signature NoWallet (clé pour /check/status/payment)
          // fallback sur omnipayReference si la signature n'a pas été stockée
          const clapaySignature = pending.omnipayTxId || pending.omnipayReference;
          if (cpToken && clapaySignature) {
            try {
              const cpStatus = await clapayGetTransactionStatus(cpToken, clapaySignature);
              const s = (cpStatus.status || "").toUpperCase();
              const cpSuccess = ["SUCCESSFUL", "SUCCESS", "COMPLETED", "PAID", "APPROVED"].includes(s);
              const cpFailed = ["FAILED", "FAILURE", "CANCELLED", "CANCELED", "REJECTED", "EXPIRED"].includes(s);

              if (cpSuccess) {
                const mc = await storage.findMerchantCountryBySimAndCountry(pending.merchantId, pending.country);
                const merchant = await storage.getMerchantById(pending.merchantId);
                if (mc) {
                  const credit = calcMerchantCreditForMerchant(pending.amount, pending.country, merchant);
                  const westpayFee = pending.amount - credit;
                  await storage.updatePendingPaymentStatus(pending.id, "omnipay_confirmed");
                  const txRef = `CP-${pending.omnipayReference}`;
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
                      provider: "clapay",
                      omnipayTxId: null,
                      operator: pending.paymentMethod || null,
                      omnipayReference: pending.omnipayReference,
                      errorMessage: null,
                      providerFee: westpayFee,
                    });
                    notifyMerchantPayment(pending.merchantId, { txId: txRef, amount: pending.amount, payerNumber: pending.payerPhone, country: pending.country, provider: "clapay" }).catch(() => {});
                    notifyAdminPayment({ txId: txRef, merchantName: merchant?.name || `#${pending.merchantId}`, payerNumber: pending.payerPhone, country: pending.country, amount: pending.amount, provider: "clapay", status: "confirmed" }).catch(() => {});
                  }
                }
                return res.json({ status: "confirmed", paymentId: pending.id });
              }
              if (cpFailed) {
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/omnipay/settings", authMiddleware("admin"), async (_req, res) => {
    try {
      // Pour l'affichage admin, lire la DB directement (l'env var est une surcharge runtime, pas affichée)
      const dbApiKey = await storage.getSetting("omnipay_api_key");
      const dbCallbackKey = await storage.getSetting("omnipay_callback_key");
      const dbPayoutApiKey = await storage.getSetting("omnipay_payout_api_key");
      const envOverride = !!process.env.OMNIPAY_API_KEY;
      const activeApiKey = await getOmnipayApiKey(); // clé réellement utilisée (env > db)
      res.json({
        apiKey: dbApiKey || "",
        callbackKey: dbCallbackKey || "",
        payoutApiKey: dbPayoutApiKey || "",
        configured: !!activeApiKey,
        envOverride,
      });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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

      // SÉCURITÉ : rejet fail-closed — secret obligatoire
      if (!webhookSecret) {
        console.error("[MBIYO CALLBACK] SÉCURITÉ: Secret webhook Mbiyo non configuré — webhook rejeté. Configurez mbiyo_webhook_secret dans les paramètres admin.");
        return res.status(503).json({ message: "Webhook Mbiyo non sécurisé — configurez le secret dans les paramètres admin" });
      }
      if (!signature) {
        console.error("[MBIYO CALLBACK] Signature manquante dans les headers");
        return res.status(401).json({ message: "Signature manquante" });
      }
      const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
      console.log(`[MBIYO CALLBACK] Signature recue: ${signature} — attendue: ${expected}`);
      const isValid = mbiyoVerifySignature(webhookSecret, signature, rawBody);
      if (!isValid) {
        console.error(`[MBIYO CALLBACK] Signature invalide — recue: ${signature} — attendue: ${expected}`);
        return res.status(401).json({ message: "Signature invalide" });
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
        // CAS atomique — protège contre les doubles callbacks simultanés
        const mbiyoCas = await financialPool.query(
          `UPDATE pending_payments SET status = 'omnipay_confirmed'
           WHERE id = $1 AND status NOT IN ('omnipay_confirmed','confirmed','omnipay_error')
           RETURNING id`,
          [pending.id]
        );
        if (!mbiyoCas.rowCount || mbiyoCas.rowCount === 0) {
          console.log(`[MBIYO CALLBACK] Déjà traité (CAS) order_id=${payload.order_id}`);
          return res.json({ status: "already_processed" });
        }

        const merchant = await storage.getMerchantById(pending.merchantId);
        const credit = calcMerchantCreditForMerchant(pending.amount, pending.country, merchant);

        const mc = await storage.findMerchantCountryBySimAndCountry(pending.merchantId, pending.country);
        if (!mc) {
          console.error(`[MBIYO CALLBACK] CRITIQUE: MerchantCountry introuvable pour merchantId=${pending.merchantId} country="${pending.country}" — solde non credite, callback rejete pour retry`);
          return res.status(500).json({ message: "MerchantCountry introuvable — réessayez" });
        }

        await storage.incrementMerchantCountryBalance(mc.id, credit);

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
      res.status(500).json({ message: safeErrMsg(err) });
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

      // SÉCURITÉ : rejet fail-closed — secret obligatoire
      if (!webhookSecret) {
        console.error("[MBIYO PAYOUT CALLBACK] SÉCURITÉ: Secret webhook Mbiyo non configuré — webhook rejeté. Configurez mbiyo_webhook_secret dans les paramètres admin.");
        return res.status(503).json({ message: "Webhook Mbiyo Payout non sécurisé — configurez le secret dans les paramètres admin" });
      }
      if (!signature) {
        console.error("[MBIYO PAYOUT CALLBACK] Signature manquante dans les headers");
        return res.status(401).json({ message: "Signature manquante" });
      }
      const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
      console.log(`[MBIYO PAYOUT CALLBACK] Signature recue: ${signature} — attendue: ${expected}`);
      const isValid = mbiyoVerifySignature(webhookSecret, signature, rawBody);
      if (!isValid) {
        console.error(`[MBIYO PAYOUT CALLBACK] Signature invalide — recue: ${signature} — attendue: ${expected}`);
        return res.status(401).json({ message: "Signature invalide" });
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
        const locked = await financialPool.query(
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
        await storage.updateWithdrawalStatus(withdrawal.id, "approved", `Retrait confirmé`, payload.order_id, wdFees, wdFees);
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/mbiyo/settings", authMiddleware("admin"), async (_req, res) => {
    try {
      const dbApiKey = await storage.getSetting("mbiyo_api_key");
      const dbWebhookSecret = await storage.getSetting("mbiyo_webhook_secret");
      const envOverride = !!process.env.MBIYO_API_KEY;
      const activeApiKey = await getMbiyoApiKey();
      res.json({
        apiKey: dbApiKey || "",
        webhookSecret: dbWebhookSecret || "",
        configured: !!activeApiKey,
        envOverride,
      });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/admin/mbiyo/settings", authMiddleware("admin"), async (req, res) => {
    try {
      const { apiKey, webhookSecret } = req.body;
      if (apiKey !== undefined) await storage.setSetting("mbiyo_api_key", apiKey);
      if (webhookSecret !== undefined) await storage.setSetting("mbiyo_webhook_secret", webhookSecret);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ==================== SEAPAY ADMIN SETTINGS (par pays) ====================

  app.get("/api/admin/seapay/settings", authMiddleware("admin"), async (_req, res) => {
    try {
      const countriesList = ["Pakistan", "Philippines", "India", "Nigeria"];
      const countries: Record<string, any> = {};
      const envOverrides: Record<string, boolean> = {};
      const envVarNames: Record<string, { merchantId: string; apiKey: string; apiSecret: string; legacyMerchantId?: string; legacyApiKey?: string; legacyApiSecret?: string }> = {};
      for (const c of countriesList) {
        const [mid, ak, as_] = await Promise.all([
          getSeapayMerchantId(c),
          getSeapayApiKey(c),
          getSeapayApiSecret(c),
        ]);
        const envPrefix = seapayCountryEnvPrefix(c);
        // Uniquement les variables pays-spécifiques (ex: SEAPAY_PAKISTAN_MERCHANT_ID)
        const midFromEnv = !!process.env[`${envPrefix}_MERCHANT_ID`];
        const akFromEnv  = !!process.env[`${envPrefix}_API_KEY`];
        const asFromEnv  = !!process.env[`${envPrefix}_API_SECRET`];
        countries[c] = {
          // Ne pas renvoyer les valeurs réelles des clés au navigateur pour la sécurité
          // — on indique juste si chaque champ est renseigné
          merchantId: mid ? (midFromEnv ? "••••••••[ENV]" : "••••••••[DB]") : "",
          apiKey:     ak  ? (akFromEnv  ? "••••••••[ENV]" : "••••••••[DB]") : "",
          apiSecret:  as_ ? (asFromEnv  ? "••••••••[ENV]" : "••••••••[DB]") : "",
          hasMerchantId: !!mid,
          hasApiKey:     !!ak,
          hasApiSecret:  !!as_,
          midFromEnv,
          akFromEnv,
          asFromEnv,
          configured: !!(mid && ak),
        };
        envOverrides[c] = midFromEnv || akFromEnv || asFromEnv;
        // Noms exacts des variables d'environnement attendues (une par pays)
        envVarNames[c] = {
          merchantId: `${envPrefix}_MERCHANT_ID`,
          apiKey:     `${envPrefix}_API_KEY`,
          apiSecret:  `${envPrefix}_API_SECRET`,
        };
      }
      // Rétrocompatibilité — indique si au moins un pays est configuré
      const configured = countriesList.some(c => countries[c].configured);
      res.json({ countries, envOverrides, envVarNames, configured });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/admin/seapay/settings", authMiddleware("admin"), async (req, res) => {
    try {
      const { country, merchantId, apiKey, apiSecret } = req.body;
      if (!country) return res.status(400).json({ message: "Pays requis (country)" });
      const slug = seapayCountrySlug(country);
      if (merchantId !== undefined) await storage.setSetting(`seapay_merchant_id_${slug}`, merchantId);
      if (apiKey    !== undefined) await storage.setSetting(`seapay_api_key_${slug}`, apiKey);
      if (apiSecret !== undefined) await storage.setSetting(`seapay_api_secret_${slug}`, apiSecret);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/seapay/balance", authMiddleware("admin"), async (req, res) => {
    try {
      const { currency } = req.query;
      const currStr = String(currency || "PKR").toUpperCase();
      const balanceCountry = SEAPAY_COUNTRY_FROM_CURRENCY[currStr] || "Pakistan";
      const [merchantId, apiSecret] = await Promise.all([getSeapayMerchantId(balanceCountry), getSeapayApiSecret(balanceCountry)]);
      if (!merchantId || !apiSecret) {
        return res.status(400).json({ message: `SeaPay non configuré pour ${balanceCountry}` });
      }
      const result = await seapayGetBalance(merchantId, currStr, apiSecret);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ==================== SENDAVAPAY ROUTES ====================

  // ── Proxy routes (évite les blocages CORS depuis le navigateur) ──────────

  // 1. Liste des opérateurs disponibles pour un pays
  app.get("/api/sendavapay/proxy/services/:countryCode", async (req, res) => {
    try {
      const { countryCode } = req.params;
      const sendavaApiKey = await getSendavaApiKey();
      const authHeaders: Record<string, string> = sendavaApiKey
        ? { "Authorization": `Bearer ${sendavaApiKey}` }
        : {};
      const upstream = await fetch(`https://sendavapay.com/api/soleaspay/services/${encodeURIComponent(countryCode)}`, {
        headers: authHeaders,
      });
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err: any) {
      console.error("[SENDAVAPAY PROXY] /services erreur:", err.message);
      res.status(502).json({ success: false, message: "Erreur service opérateurs" });
    }
  });

  // 2. Initier le paiement USSD push
  app.post("/api/sendavapay/proxy/pay/:ref", async (req, res) => {
    try {
      const { ref } = req.params;
      const sendavaApiKey = await getSendavaApiKey();
      const authHeaders: Record<string, string> = sendavaApiKey
        ? { "Authorization": `Bearer ${sendavaApiKey}` }
        : {};
      const upstream = await fetch(`https://sendavapay.com/api/pay-api/${encodeURIComponent(ref)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(req.body),
      });
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err: any) {
      console.error("[SENDAVAPAY PROXY] /pay erreur:", err.message);
      res.status(502).json({ success: false, message: "Erreur initiation paiement" });
    }
  });

  // 3. Vérifier l'OTP
  app.post("/api/sendavapay/proxy/pay/:ref/verify", async (req, res) => {
    try {
      const { ref } = req.params;
      const sendavaApiKey = await getSendavaApiKey();
      const authHeaders: Record<string, string> = sendavaApiKey
        ? { "Authorization": `Bearer ${sendavaApiKey}` }
        : {};
      const upstream = await fetch(`https://sendavapay.com/api/pay-api/${encodeURIComponent(ref)}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(req.body),
      });
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err: any) {
      console.error("[SENDAVAPAY PROXY] /verify erreur:", err.message);
      res.status(502).json({ success: false, message: "Erreur vérification OTP" });
    }
  });

  // ==================== SENDAVAPAY SDK v1 PROXY (anti-CORS) ====================
  // Le navigateur ne peut pas appeler sendavapay.com directement (CORS bloqué par Cloudflare).
  // Ces routes proxifient les 3 endpoints SDK v1 côté serveur.

  // Helper : fetch avec timeout pour les proxies SendavaPay
  const fetchWithTimeout = (url: string, options: RequestInit = {}, timeoutMs = 15000) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer));
  };

  // 1. Récupérer la liste des opérateurs
  app.get("/api/sendavapay/proxy/v1/operators/:countryCode", async (req, res) => {
    try {
      const { countryCode } = req.params;
      const sendavaApiKey = await getSendavaApiKey();
      const authHeaders: Record<string, string> = sendavaApiKey
        ? { "Authorization": `Bearer ${sendavaApiKey}` }
        : {};
      const upstream = await fetchWithTimeout(
        `https://sendavapay.com/api/sdk/v1/operators/${encodeURIComponent(countryCode)}`,
        { headers: authHeaders }
      );
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err: any) {
      const msg = err.name === "AbortError" ? "Timeout opérateurs SendavaPay (15s)" : err.message;
      console.error("[SENDAVAPAY PROXY v1] /operators erreur:", msg);
      res.status(502).json({ success: false, message: "Service de paiement indisponible. Réessayez." });
    }
  });

  // 2. Initier le paiement USSD push (SDK v1)
  app.post("/api/sendavapay/proxy/v1/initiate-payment", async (req, res) => {
    try {
      const sendavaApiKey = await getSendavaApiKey();
      const authHeaders: Record<string, string> = sendavaApiKey
        ? { "Authorization": `Bearer ${sendavaApiKey}` }
        : {};
      const upstream = await fetchWithTimeout(
        "https://sendavapay.com/api/sdk/v1/initiate-payment",
        { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify(req.body) }
      );
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err: any) {
      const msg = err.name === "AbortError" ? "Timeout initiation SendavaPay (15s)" : err.message;
      console.error("[SENDAVAPAY PROXY v1] /initiate-payment erreur:", msg);
      res.status(502).json({ success: false, message: "Service de paiement indisponible. Réessayez." });
    }
  });

  // 3. Soumettre l'OTP (SDK v1)
  app.post("/api/sendavapay/proxy/v1/submit-otp", async (req, res) => {
    try {
      const sendavaApiKey = await getSendavaApiKey();
      const authHeaders: Record<string, string> = sendavaApiKey
        ? { "Authorization": `Bearer ${sendavaApiKey}` }
        : {};
      const upstream = await fetchWithTimeout(
        "https://sendavapay.com/api/sdk/v1/submit-otp",
        { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify(req.body) }
      );
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err: any) {
      const msg = err.name === "AbortError" ? "Timeout OTP SendavaPay (15s)" : err.message;
      console.error("[SENDAVAPAY PROXY v1] /submit-otp erreur:", msg);
      res.status(502).json({ success: false, message: "Service de paiement indisponible. Réessayez." });
    }
  });

  // ==================== SEAPAY CALLBACK ====================
  app.post("/api/seapay/callback", async (req, res) => {
    try {
      const body = req.body as Record<string, any>;
      console.log(`[SEAPAY CALLBACK] Body: ${JSON.stringify(body)}`);

      const orderId = body.order_id || body.out_trade_no || "";
      if (!orderId) { return res.status(200).send("ok"); }

      // Trouver le pays depuis l'ordre pour utiliser la bonne cle API
      const pendingForCountry = await storage.getPendingPaymentByReference(orderId);
      const callbackCountry = pendingForCountry?.country || "";
      const cbCountry = SEAPAY_COUNTRY_FROM_CURRENCY[SEAPAY_CURRENCY_COUNTRY[callbackCountry] || ""] || callbackCountry;
      const apiKey = await getSeapayApiKey(cbCountry);
      if (!apiKey) {
        console.error("[SEAPAY CALLBACK] API Key non configurée pour le pays:", cbCountry);
        return res.status(200).send("ok");
      }

      const receivedSign = body.sign || "";
      if (!verifySeapaySign(body, apiKey, receivedSign)) {
        console.error("[SEAPAY CALLBACK] Signature invalide");
        return res.status(200).send("ok");
      }
      const status  = (body.status || "").toLowerCase();
      const tradeNo = body.trade_no || "";
      const amount  = parseInt(body.amount || "0", 10);

      const pending = pendingForCountry || await storage.getPendingPaymentByReference(orderId);
      if (!pending) {
        console.warn(`[SEAPAY CALLBACK] Paiement en attente introuvable: ${orderId}`);
        return res.status(200).send("ok");
      }
      if (pending.status === "confirmed") { return res.status(200).send("ok"); }

      if (status === "success" || status === "paid" || status === "completed") {
        const merchant = await storage.getMerchantById(pending.merchantId);
        if (!merchant) { return res.status(200).send("ok"); }

        const txId = `SP-${orderId}`;
        const tx = await storage.createTransaction({
          merchantId: pending.merchantId,
          country:    pending.country,
          txId,
          amount:     pending.amount,
          payerNumber: pending.payerPhone || null,
          payerName:  pending.payerName  || null,
          status:     "confirmed",
          provider:   "seapay",
          omnipayTxId: tradeNo || null,
          operator:   pending.paymentMethod || null,
          omnipayReference: orderId,
          errorMessage: null,
        });

        await storage.updateMerchantCountryBalance(pending.merchantId, pending.country, pending.amount);
        await storage.updatePendingPaymentStatus(pending.id, "confirmed");

        // Webhook marchand
        const webhookUrl = merchant.webhookUrl;
        if (webhookUrl) {
          const webhookSecret = merchant.webhookSecret || "";
          const payload = {
            event: "payment.confirmed",
            txId: tx.id, amount: pending.amount, currency: pending.country,
            payer: pending.payerPhone || "", country: pending.country,
            merchantSlug: merchant.slug, provider: "seapay", timestamp: new Date().toISOString(),
          };
          const sig = require("crypto").createHmac("sha256", webhookSecret).update(JSON.stringify(payload)).digest("hex");
          fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-WestPay-Signature": sig, "X-WestPay-Event": "payment.confirmed" },
            body: JSON.stringify(payload),
          }).catch(() => {});
        }

        console.log(`[SEAPAY CALLBACK] Paiement confirmé: ${orderId} — ${pending.amount} (${pending.country})`);
      } else if (status === "failed" || status === "expired" || status === "cancelled") {
        await storage.updatePendingPaymentStatus(pending.id, "failed");
        console.log(`[SEAPAY CALLBACK] Paiement échoué: ${orderId} — status: ${status}`);
      }

      return res.status(200).send("ok");
    } catch (err: any) {
      console.error("[SEAPAY CALLBACK] Erreur:", err.message);
      return res.status(200).send("ok");
    }
  });

  // ==================== SEAPAY PAYOUT CALLBACK (reversements) ====================
  app.post("/api/seapay/payout-callback", async (req, res) => {
    try {
      const body = req.body as Record<string, any>;
      console.log(`[SEAPAY PAYOUT CALLBACK] Body: ${JSON.stringify(body)}`);

      const orderId = body.order_id || body.out_trade_no || "";
      const status = (body.status || "").toLowerCase();
      if (!orderId) return res.status(200).send("ok");

      const withdrawal = await storage.getWithdrawalByOmnipayRef(orderId);

      // Utiliser le bon secret API selon le pays du retrait
      const payoutCountry = withdrawal?.country || "";
      const apiSecret = await getSeapayApiSecret(payoutCountry);
      if (!apiSecret) {
        console.error("[SEAPAY PAYOUT CALLBACK] Secret API non configuré pour le pays:", payoutCountry);
        return res.status(200).send("ok");
      }
      const receivedSign = body.sign || "";
      if (!verifySeapaySign(body, apiSecret, receivedSign)) {
        console.error("[SEAPAY PAYOUT CALLBACK] Signature invalide");
        return res.status(200).send("ok");
      }
      if (!withdrawal) {
        console.warn(`[SEAPAY PAYOUT CALLBACK] Retrait non trouve: ${orderId}`);
        return res.status(200).send("ok");
      }
      if (withdrawal.status === "approved" || withdrawal.status === "rejected" || withdrawal.status === "failed") {
        return res.json({ status: "already_processed" });
      }

      const isSuccess = ["success", "paid", "completed"].includes(status);
      const isFailure = ["failed", "expired", "cancelled"].includes(status);
      if (!isSuccess && !isFailure) return res.json({ status: "pending" });

      const locked = await financialPool.query(
        `UPDATE withdrawals SET status = $1 WHERE id = $2 AND status = 'pending' RETURNING id`,
        [isSuccess ? "approved" : "failed", withdrawal.id]
      );
      if (locked.rowCount === 0) return res.json({ status: "already_processed" });

      const wdMerchant = await storage.getMerchantById(withdrawal.merchantId);
      if (isSuccess) {
        await storage.updateWithdrawalStatus(withdrawal.id, "approved", "Transfert SeaPay confirme", orderId, withdrawal.fees || 0, withdrawal.fees || 0);
        console.log(`[SEAPAY PAYOUT CALLBACK] Retrait #${withdrawal.id} approuve - ref=${orderId}`);
      } else {
        await storage.updateWithdrawalStatus(withdrawal.id, "failed", `Transfert SeaPay echoue - statut: ${status}`, orderId);
        const mc = await storage.getMerchantCountryById(withdrawal.merchantCountryId);
        if (mc) await storage.incrementMerchantCountryBalance(mc.id, withdrawal.amount);
        console.log(`[SEAPAY PAYOUT CALLBACK] Retrait #${withdrawal.id} echoue - ref=${orderId}`);
      }
      res.json({ status: isSuccess ? "approved" : "failed" });
      setImmediate(() => {
        notifyAdminWithdrawal({ id: withdrawal.id, merchantName: wdMerchant?.name || `#${withdrawal.merchantId}`, country: withdrawal.country, amount: withdrawal.amount, fees: withdrawal.fees || 0, phone: withdrawal.phone, operator: withdrawal.operator, status: isSuccess ? "approved" : "failed", mode: withdrawal.withdrawalMode }).catch(() => {});
        notifyMerchantWithdrawal(withdrawal.merchantId, { id: withdrawal.id, country: withdrawal.country, amount: withdrawal.amount, fees: withdrawal.fees || 0, phone: withdrawal.phone, operator: withdrawal.operator, status: isSuccess ? "approved" : "failed" }).catch(() => {});
      });
    } catch (err: any) {
      console.error("[SEAPAY PAYOUT CALLBACK] Erreur:", err.message);
      res.status(200).send("ok");
    }
  });

  // ==================== CLAPAY CALLBACKS ====================

  app.post("/api/clapay/callback", async (req, res) => {
    try {
      const nowalletSig = (req.headers["nowallet-signature"] || "") as string;
      const rawBody = (req.rawBody as Buffer)?.toString() || JSON.stringify(req.body);
      const payload = req.body as ClapayWebhookPayload;

      console.log(`[CLAPAY CALLBACK] Status: ${payload.status} — TxId: ${payload.transaction_id} — Ref: ${payload.reference || payload.external_reference}`);

      const [webhookSecret, webhookUniqueKey] = await Promise.all([getClapayWebhookSecret(), getClapayWebhookUniqueKey()]);
      if (webhookSecret && webhookUniqueKey && nowalletSig) {
        const valid = verifyClapaySignature(nowalletSig, rawBody, webhookSecret, webhookUniqueKey);
        if (!valid) {
          console.warn("[CLAPAY CALLBACK] Signature invalide — requête rejetée");
          return res.status(401).json({ message: "Signature invalide" });
        }
      }

      // v3 : transaction_id = notre référence marchande (envoyée dans transaction_id à l'init)
      const reference = payload.transaction_id || payload.reference || payload.external_reference || payload.signature;
      if (!reference) return res.status(400).json({ message: "reference manquante" });

      const statusUpper = (payload.status || "").toUpperCase();
      const isSuccess = ["SUCCESSFUL", "SUCCESS", "COMPLETED", "PAID", "APPROVED"].includes(statusUpper);
      const isFailed  = ["FAILED", "FAILURE", "CANCELLED", "CANCELED", "REJECTED", "EXPIRED"].includes(statusUpper);

      const pending = await storage.getPendingPaymentByOmnipayReference(reference);
      if (!pending || pending.gateway !== "clapay") {
        console.log(`[CLAPAY CALLBACK] Paiement non trouvé pour ref=${reference}`);
        return res.json({ received: true });
      }
      if (isSuccess) {
        // ── CAS atomique — même protection que le callback OmniPay ──────────
        // Un seul UPDATE réussira si deux callbacks arrivent simultanément.
        const cpCas = await financialPool.query(
          `UPDATE pending_payments SET status = 'omnipay_confirmed'
           WHERE id = $1 AND status NOT IN ('omnipay_confirmed','confirmed','omnipay_error')
           RETURNING id`,
          [pending.id]
        );
        if (!cpCas.rowCount || cpCas.rowCount === 0) {
          console.log(`[CLAPAY CALLBACK] Déjà traité (CAS) ref=${reference}`);
          return res.json({ received: true, alreadyConfirmed: true });
        }

        const mc = await storage.findMerchantCountryBySimAndCountry(pending.merchantId, pending.country);
        const merchant = await storage.getMerchantById(pending.merchantId);
        if (!mc) return res.json({ received: true });

        const credit = calcMerchantCreditForMerchant(pending.amount, pending.country, merchant);
        const westpayFee = pending.amount - credit;
        const txRef = `CP-${reference}`;
        const existingTx = await storage.getTransactionByTxId(txRef);
        if (!existingTx) {
          await storage.incrementMerchantCountryBalance(mc.id, credit);
          await storage.createTransaction({
            merchantId: pending.merchantId,
            country: pending.country,
            txId: txRef,
            amount: pending.amount,
            payerNumber: pending.payerPhone || payload.transaction_phone_number || null,
            payerName: pending.payerName || null,
            status: "confirmed",
            provider: "clapay",
            omnipayTxId: payload.transaction_id || null,
            operator: pending.paymentMethod || payload.transaction_service_name || null,
            omnipayReference: reference,
            errorMessage: null,
            providerFee: westpayFee,
          });
          notifyMerchantPayment(pending.merchantId, { txId: txRef, amount: pending.amount, payerNumber: pending.payerPhone, country: pending.country, provider: "clapay" }).catch(() => {});
          notifyAdminPayment({ txId: txRef, merchantName: merchant?.name || `#${pending.merchantId}`, payerNumber: pending.payerPhone, country: pending.country, amount: pending.amount, provider: "clapay", status: "confirmed" }).catch(() => {});
        }
        if (pending.redirectUrl) {
          try {
            const webhookMerchant = await storage.getMerchantById(pending.merchantId);
            if (webhookMerchant?.webhookUrl) {
              const { triggerWebhook } = await import("./routes");
              triggerWebhook && triggerWebhook(webhookMerchant, { txId: txRef, amount: pending.amount, payerPhone: pending.payerPhone, country: pending.country }).catch(() => {});
            }
          } catch {}
        }
        console.log(`[CLAPAY CALLBACK] Paiement confirmé — ref=${reference} montant=${pending.amount} crédit=${credit}`);
      } else if (isFailed) {
        await storage.updatePendingPaymentStatus(pending.id, "omnipay_failed");
        const failTxRef = `CP-${reference}`;
        const existFail = await storage.getTransactionByTxId(failTxRef);
        if (!existFail) {
          storage.createTransaction({
            merchantId: pending.merchantId,
            country: pending.country,
            txId: failTxRef,
            amount: pending.amount,
            payerNumber: pending.payerPhone || null,
            payerName: pending.payerName || null,
            status: "failed",
            provider: "clapay",
            omnipayTxId: payload.transaction_id || null,
            operator: pending.paymentMethod || null,
            omnipayReference: reference,
            errorMessage: `Paiement ${statusUpper}`,
            providerFee: 0,
          }).catch(() => {});
        }
        console.log(`[CLAPAY CALLBACK] Paiement échoué — ref=${reference}`);
      }

      res.json({ received: true });
    } catch (err: any) {
      console.error("[CLAPAY CALLBACK] Erreur:", err.message);
      res.status(200).json({ received: true });
    }
  });

  app.post("/api/clapay/payout-callback", async (req, res) => {
    try {
      const nowalletSig = (req.headers["nowallet-signature"] || "") as string;
      const rawBody = (req.rawBody as Buffer)?.toString() || JSON.stringify(req.body);
      const payload = req.body as ClapayWebhookPayload;

      console.log(`[CLAPAY PAYOUT CALLBACK] Status: ${payload.status} — Ref: ${payload.reference || payload.external_reference}`);

      const [webhookSecret, webhookUniqueKey] = await Promise.all([getClapayWebhookSecret(), getClapayWebhookUniqueKey()]);
      if (webhookSecret && webhookUniqueKey && nowalletSig) {
        if (!verifyClapaySignature(nowalletSig, rawBody, webhookSecret, webhookUniqueKey)) {
          console.warn("[CLAPAY PAYOUT CALLBACK] Signature invalide");
          return res.status(401).json({ message: "Signature invalide" });
        }
      }

      // v3 : transaction_id = notre référence marchande du retrait
      const orderId = payload.transaction_id || payload.reference || payload.external_reference || "";
      if (!orderId) return res.status(200).json({ received: true });

      const withdrawal = await storage.getWithdrawalByRef(orderId);
      if (!withdrawal) return res.json({ received: true });

      const statusUpper = (payload.status || "").toUpperCase();
      const isSuccess = ["SUCCESSFUL", "SUCCESS", "COMPLETED", "PAID", "APPROVED"].includes(statusUpper);
      if (isSuccess) {
        if (withdrawal.status !== "approved") {
          await storage.updateWithdrawalStatus(withdrawal.id, "approved", `Approuvé par ClaPay — ref=${orderId}`, orderId);
        }
        console.log(`[CLAPAY PAYOUT CALLBACK] Retrait #${withdrawal.id} approuvé`);
      } else {
        if (withdrawal.status === "pending") {
          await storage.updateWithdrawalStatus(withdrawal.id, "failed", `Rejeté par ClaPay — statut ${statusUpper}`, orderId);
          const mc = await storage.getMerchantCountryById(withdrawal.merchantCountryId);
          if (mc) await storage.incrementMerchantCountryBalance(mc.id, withdrawal.amount);
        }
        console.log(`[CLAPAY PAYOUT CALLBACK] Retrait #${withdrawal.id} échoué`);
      }
      res.json({ received: true });
    } catch (err: any) {
      console.error("[CLAPAY PAYOUT CALLBACK] Erreur:", err.message);
      res.status(200).json({ received: true });
    }
  });

  app.post("/api/sendavapay/callback", async (req, res) => {
    try {
      const rawBody = (req.rawBody as Buffer)?.toString() || JSON.stringify(req.body);
      const signature = (req.headers["x-sendavapay-signature"] || "") as string;

      console.log(`[SENDAVAPAY CALLBACK] Headers: ${JSON.stringify(req.headers)}`);
      console.log(`[SENDAVAPAY CALLBACK] Body: ${rawBody}`);

      const webhookSecret = await getSendavaWebhookSecret();
      if (!webhookSecret) {
        // Pas de secret configuré : on accepte le callback mais on log un avertissement.
        // Le fail-closed empêchait tous les callbacks de passer en production quand le secret
        // n'avait pas encore été enregistré — les retraits restaient bloqués indéfiniment.
        console.warn("[SENDAVAPAY CALLBACK] ⚠️ Secret webhook non configuré — callback accepté sans vérification de signature. Configurez sendavapay_webhook_secret dans les paramètres admin pour sécuriser.");
      } else if (signature) {
        // Secret présent : vérifier la signature (préfixe sha256= ou sans)
        const isValid =
          sendavaVerifySignature(webhookSecret, signature, rawBody) ||
          sendavaVerifySignature(webhookSecret, `sha256=${signature}`, rawBody) ||
          sendavaVerifySignature(webhookSecret, signature.replace(/^sha256=/, ""), rawBody);
        if (!isValid) {
          console.error(`[SENDAVAPAY CALLBACK] Signature invalide — header: ${signature}`);
          return res.status(401).json({ message: "Signature invalide" });
        }
      } else {
        // Secret configuré mais signature absente des headers
        console.warn("[SENDAVAPAY CALLBACK] ⚠️ Signature absente des headers mais secret configuré — callback accepté (SendavaPay en cours de configuration).");
      }

      const payload = req.body as SendavaWebhookPayload;
      // SendavaPay can send reference OR externalReference depending on event type
      const reference = payload.reference || payload.externalReference;
      console.log(`[SENDAVAPAY CALLBACK] Recu: event=${payload.event} ref=${payload.reference} extRef=${payload.externalReference} status=${payload.status}`);

      if (!reference) {
        return res.status(400).json({ message: "reference manquante" });
      }

      const statusLower = (payload.status || "").toLowerCase();
      const eventLower = (payload.event || "").toLowerCase();
      // Handle both pay-in and payout/withdrawal event types + "success" status
      const isSuccess =
        statusLower === "completed" ||
        statusLower === "success" ||
        eventLower === "payment.completed" ||
        eventLower === "payout.completed" ||
        eventLower === "withdrawal.completed" ||
        eventLower === "transfer.completed";
      const isFailure = ["failed", "failure", "cancelled", "canceled", "rejected"].includes(statusLower);

      const pending = await storage.getPendingPaymentByOmnipayReference(reference);
      if (!pending) {
        // Pas un paiement entrant — vérifier si c'est une notification de retrait
        // Try with SendavaPay's reference first, then our externalReference as fallback
        let withdrawal = await storage.getWithdrawalByOmnipayRef(reference);
        if (!withdrawal && payload.reference && payload.externalReference) {
          withdrawal = await storage.getWithdrawalByOmnipayRef(payload.externalReference);
        }
        if (!withdrawal && payload.reference) {
          withdrawal = await storage.getWithdrawalByOmnipayRef(payload.reference);
        }
        if (!withdrawal) {
          console.warn(`[SENDAVAPAY CALLBACK] Référence introuvable (ni paiement ni retrait): ref=${payload.reference} extRef=${payload.externalReference}`);
          return res.status(200).json({ received: true });
        }

        // Notification de retrait
        if (withdrawal.status === "approved" || withdrawal.status === "failed") {
          return res.json({ status: "already_processed" });
        }

        const wdMerchant = await storage.getMerchantById(withdrawal.merchantId);

        if (isSuccess) {
          const wdFees = withdrawal.fees || 0;
          await storage.updateWithdrawalStatus(withdrawal.id, "approved", `Retrait confirmé automatiquement`, reference, wdFees, wdFees);
          notifyAdminWithdrawal({ id: withdrawal.id, merchantName: wdMerchant?.name || `#${withdrawal.merchantId}`, country: withdrawal.country, amount: withdrawal.amount, fees: wdFees, phone: withdrawal.phone, operator: withdrawal.operator, status: "approved", mode: "auto" }).catch(() => {});
          notifyMerchantWithdrawal(withdrawal.merchantId, { id: withdrawal.id, country: withdrawal.country, amount: withdrawal.amount, fees: wdFees, phone: withdrawal.phone, operator: withdrawal.operator, status: "approved" }).catch(() => {});
          console.log(`[SENDAVAPAY CALLBACK] Retrait #${withdrawal.id} approuvé — ref=${reference}`);
          return res.json({ status: "withdrawal_confirmed" });
        } else if (isFailure) {
          await storage.updateWithdrawalStatus(withdrawal.id, "failed", `Retrait refusé (${payload.status || "échec"})`, reference);
          const wdMc = await storage.findMerchantCountryBySimAndCountry(withdrawal.merchantId, withdrawal.country);
          if (wdMc) await storage.incrementMerchantCountryBalance(wdMc.id, withdrawal.amount);
          notifyAdminWithdrawal({ id: withdrawal.id, merchantName: wdMerchant?.name || `#${withdrawal.merchantId}`, country: withdrawal.country, amount: withdrawal.amount, fees: 0, phone: withdrawal.phone, operator: withdrawal.operator, status: "failed", mode: "auto" }).catch(() => {});
          notifyMerchantWithdrawal(withdrawal.merchantId, { id: withdrawal.id, country: withdrawal.country, amount: withdrawal.amount, fees: 0, phone: withdrawal.phone, operator: withdrawal.operator, status: "failed" }).catch(() => {});
          console.log(`[SENDAVAPAY CALLBACK] Retrait #${withdrawal.id} échoué — ref=${reference} status=${payload.status}`);
          return res.json({ status: "withdrawal_failed" });
        }

        return res.json({ status: "pending" });
      }

      if (isSuccess) {
        // CAS atomique — protège contre les doubles callbacks simultanés
        const spCas = await financialPool.query(
          `UPDATE pending_payments SET status = 'omnipay_confirmed'
           WHERE id = $1 AND status NOT IN ('omnipay_confirmed','confirmed','omnipay_error')
           RETURNING id`,
          [pending.id]
        );
        if (!spCas.rowCount || spCas.rowCount === 0) {
          console.log(`[SENDAVAPAY CALLBACK] Déjà traité (CAS) ref=${reference}`);
          return res.json({ status: "already_processed" });
        }

        const merchant = await storage.getMerchantById(pending.merchantId);
        const mc = await storage.findMerchantCountryBySimAndCountry(pending.merchantId, pending.country);

        if (!mc) {
          console.error(`[SENDAVAPAY CALLBACK] MerchantCountry introuvable pour marchand #${pending.merchantId} pays ${pending.country}`);
          await storage.updatePendingPaymentStatus(pending.id, "omnipay_error");
          return res.status(500).json({ message: "Configuration marchand/pays introuvable" });
        }

        const txId = `SP-${reference}`;
        const existingTx = await storage.getTransactionByTxId(txId);
        if (!existingTx) {
          const credit = calcMerchantCreditForMerchant(pending.amount, pending.country, merchant);
          const westpayFee = pending.amount - credit;
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
            providerFee: westpayFee,
          });
          await storage.incrementMerchantCountryBalance(mc.id, credit);
          console.log(`[SENDAVAPAY CALLBACK] Paiement confirme: ${txId} - Brut: ${pending.amount} - Frais WestPay: ${westpayFee} - Net marchand: ${credit}`);

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
        const failTxId = `SP-${reference}`;
        const existingFailTx = await storage.getTransactionByTxId(failTxId);
        if (!existingFailTx) {
          storage.createTransaction({
            merchantId: pending.merchantId,
            country: pending.country,
            txId: failTxId,
            amount: pending.amount,
            payerNumber: payload.customerPhone || pending.payerPhone || null,
            payerName: pending.payerName || null,
            status: "failed",
            provider: "westpay",
            omnipayTxId: null,
            omnipayReference: pending.omnipayReference || reference,
            errorMessage: `Paiement ${payload.status || "refusé"}`,
            providerFee: 0,
          }).catch(() => {});
        }
        console.log(`[SENDAVAPAY CALLBACK] Paiement echoue: ref=${reference} status=${payload.status}`);
        return res.json({ status: "failed" });

      } else {
        console.log(`[SENDAVAPAY CALLBACK] Paiement en cours: ref=${reference} status=${payload.status}`);
        return res.json({ status: "pending" });
      }
    } catch (err: any) {
      console.error("[SENDAVAPAY CALLBACK] Erreur:", err.message);
      res.status(500).json({ message: safeErrMsg(err) });
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
      const dbApiKey = await storage.getSetting("sendavapay_api_key");
      const dbWebhookSecret = await storage.getSetting("sendavapay_webhook_secret");
      const envOverride = !!process.env.SENDAVAPAY_API_KEY;
      const activeApiKey = await getSendavaApiKey();
      res.json({
        apiKey: dbApiKey || "",
        webhookSecret: dbWebhookSecret ? "configured" : "",
        configured: !!activeApiKey,
        envOverride,
        callbackUrl: `${process.env.APP_URL || "http://Westpay.cfd"}/api/sendavapay/callback`,
      });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/admin/sendavapay/settings", authMiddleware("admin"), async (req, res) => {
    try {
      const { apiKey, webhookSecret } = req.body;
      if (apiKey !== undefined) await storage.setSetting("sendavapay_api_key", apiKey);
      if (webhookSecret !== undefined && webhookSecret !== "") await storage.setSetting("sendavapay_webhook_secret", webhookSecret);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/sendavapay/transactions", authMiddleware("admin"), async (_req, res) => {
    try {
      const apiKey = await getSendavaApiKey();
      if (!apiKey) return res.status(400).json({ message: "Service de paiement non configure." });
      const result = await sendavaGetTransactions(apiKey);
      res.json({ success: result.success, data: result.data, message: result.message });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/admin/sendavapay/configure-webhook", authMiddleware("admin"), async (_req, res) => {
    try {
      const apiKey = await getSendavaApiKey();
      if (!apiKey) return res.status(400).json({ message: "Service de paiement non configure." });
      const result = await sendavaConfigureWebhook(apiKey, `${process.env.APP_URL || "http://Westpay.cfd"}/api/sendavapay/callback`);
      if (result.success && result.data?.webhookSecret) {
        await storage.setSetting("sendavapay_webhook_secret", result.data.webhookSecret);
      }
      res.json({ success: result.success, data: result.data, message: result.message });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ==================== CLAPAY ADMIN SETTINGS ====================

  app.get("/api/admin/clapay/settings", authMiddleware("admin"), async (_req, res) => {
    try {
      const [dbApiKey, dbWebhookSecret, dbWebhookUniqueKey] = await Promise.all([
        storage.getSetting("clapay_api_key"),
        storage.getSetting("clapay_webhook_secret"),
        storage.getSetting("clapay_webhook_unique_key"),
      ]);
      const activeKey = await getClapayApiKey();
      const envOverride = !!process.env.CLAPAY_API_KEY;
      res.json({
        apiKey: dbApiKey ? "••••••••[DB]" : "",
        webhookSecret: dbWebhookSecret ? "••••••••[DB]" : "",
        webhookUniqueKey: dbWebhookUniqueKey ? "••••••••[DB]" : "",
        configured: !!activeKey,
        envOverride,
        callbackUrl: `${process.env.APP_URL || "https://westpay.cfd"}/api/clapay/callback`,
        payoutCallbackUrl: `${process.env.APP_URL || "https://westpay.cfd"}/api/clapay/payout-callback`,
      });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/admin/clapay/settings", authMiddleware("admin"), async (req, res) => {
    try {
      const { apiKey, webhookSecret, webhookUniqueKey } = req.body;
      if (apiKey !== undefined && apiKey !== "") await storage.setSetting("clapay_api_key", apiKey);
      if (webhookSecret !== undefined && webhookSecret !== "") await storage.setSetting("clapay_webhook_secret", webhookSecret);
      if (webhookUniqueKey !== undefined && webhookUniqueKey !== "") await storage.setSetting("clapay_webhook_unique_key", webhookUniqueKey);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/clapay/balance", authMiddleware("admin"), async (_req, res) => {
    try {
      const token = await getClapayApiKey();
      if (!token) return res.status(400).json({ message: "Clé API ClaPay non configurée" });
      const result = await clapayGetBalance(token);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
        notifyMerchantPayment(pending.merchantId, { txId: tx.txId || "", amount: pending.amount, payerNumber: pending.payerPhone || null, country: pending.country, provider: "mbiyo" }).catch(() => {});
        notifyAdminPayment(merchant, pending.amount, pending.payerPhone || "", tx.txId || "", "Mbiyo (Manuel)").catch(() => {});
      }

      console.log(`[MBIYO ADMIN] Paiement confirmé manuellement: ${reference} — Crédit: ${credit} — Marchand: ${merchant?.name}`);
      res.json({ success: true, credit, txId: tx.txId, merchantName: merchant?.name });
    } catch (err: any) {
      console.error("[MBIYO ADMIN] Erreur confirmation manuelle:", err.message);
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // Révoquer les sessions d'un admin ou d'un marchand
  app.post("/api/admin/revoke-sessions", authMiddleware("admin"), async (req, res) => {
    try {
      const { targetType, targetId } = req.body;
      if (!targetType || !targetId) {
        return res.status(400).json({ message: "targetType et targetId requis" });
      }
      if (targetType === "admin") {
        await storage.revokeAdminTokens(parseInt(targetId));
        storage.createSecurityLog({
          eventType: "session_revoked",
          ip: extractIp(req),
          userEmail: (req as any).user?.email || "admin",
          action: "admin_session_revoked",
          details: `Sessions admin id=${targetId} révoquées manuellement`,
        }).catch(() => {});
      } else if (targetType === "merchant") {
        await storage.revokeMerchantTokens(parseInt(targetId));
        storage.createSecurityLog({
          eventType: "session_revoked",
          ip: extractIp(req),
          userEmail: (req as any).user?.email || "admin",
          action: "merchant_session_revoked",
          details: `Sessions marchand id=${targetId} révoquées manuellement`,
        }).catch(() => {});
      } else {
        return res.status(400).json({ message: "targetType invalide (admin|merchant)" });
      }
      res.json({ success: true, message: `Sessions ${targetType} id=${targetId} révoquées` });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // Update merchant country payin gateway
  app.patch("/api/admin/merchant-countries/:id/gateway", authMiddleware("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { payinGateway } = req.body;
      if (!["omnipay", "mbiyo", "sendavapay", "seapay", "clapay", "oxapay"].includes(payinGateway)) {
        return res.status(400).json({ message: "Methode de paiement invalide." });
      }
      await storage.updateMerchantCountryPayinGateway(id, payinGateway);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.put("/api/admin/merchant/:id/country/:countryId/omnipay", authMiddleware("admin"), async (req, res) => {
    try {
      const { omnipayEnabled } = req.body;
      const countryId = parseInt(req.params.countryId);
      await storage.updateMerchantCountryOmnipay(countryId, !!omnipayEnabled);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
        const merchantCredit2 = calcMerchantCreditForMerchant(amount, found.country, smsM2);
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
      const merchantCredit3 = calcMerchantCreditForMerchant(amount, simNumber.country, smsM3);
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ─── PAYMENT LINKS (admin) ───────────────────────────────────────────────

  app.get("/api/admin/payment-links", authMiddleware("admin"), async (_req, res) => {
    try {
      const links = await storage.getAllPaymentLinks();
      res.json(links);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ─── PAYMENT LINKS (merchant) ────────────────────────────────────────────

  app.get("/api/merchant/payment-links", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const links = await storage.getPaymentLinks(merchantId);
      res.json(links);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ==================== SUPPORT CONTACTS (public) ====================
  app.get("/api/public/wallet-transfer-fee", async (_req, res) => {
    try {
      const feeType = await storage.getSetting("wallet_transfer_fee_type");
      const feeValue = await storage.getSetting("wallet_transfer_fee_value");
      res.json({
        feeType: feeType || "percentage",
        feeValue: parseFloat(feeValue || "4.5"),
      });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/public/platform-flags", async (_req, res) => {
    try {
      const [withdrawalsDisabled, minAmountRaw, walletTransfersDisabled] = await Promise.all([
        storage.getSetting("withdrawals_disabled"),
        storage.getSetting("withdrawal_min_amount"),
        storage.getSetting("wallet_transfers_disabled"),
      ]);
      const withdrawalMinAmount = minAmountRaw ? parseInt(minAmountRaw) || 200 : 200;
      res.json({
        withdrawalsDisabled: withdrawalsDisabled === "true",
        withdrawalMinAmount,
        walletTransfersDisabled: walletTransfersDisabled === "true",
      });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.put("/api/admin/platform-flags", authMiddleware("admin"), async (req, res) => {
    try {
      const { withdrawalsDisabled, withdrawalMinAmount, walletTransfersDisabled } = req.body;
      if (withdrawalsDisabled !== undefined) {
        await storage.setSetting("withdrawals_disabled", withdrawalsDisabled ? "true" : "false");
      }
      if (walletTransfersDisabled !== undefined) {
        await storage.setSetting("wallet_transfers_disabled", walletTransfersDisabled ? "true" : "false");
      }
      if (withdrawalMinAmount !== undefined) {
        const parsed = parseInt(withdrawalMinAmount);
        if (!isNaN(parsed) && parsed >= 1) {
          await storage.setSetting("withdrawal_min_amount", String(parsed));
        }
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/public/support-contacts", async (_req, res) => {
    try {
      const [tg1, tg2, tg3, tg4] = await Promise.all([
        storage.getSetting("support_telegram_1"),
        storage.getSetting("support_telegram_2"),
        storage.getSetting("support_telegram_3"),
        storage.getSetting("support_telegram_4"),
      ]);
      res.json({
        telegram1: tg1 || "@Atfchalvt",
        telegram2: tg2 || "@geeorbotpay",
        telegram3: tg3 || "@pankeyrobotpay",
        telegram4: tg4 || "@astapay",
      });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ==================== SUPPORT / AIDE ====================
  // Rate-limit : 5 messages/5min par IP (anti-spam Telegram)
  const supportHelpRateLimit = makeRateLimit({ max: 5, windowMs: 5 * 60 * 1000, label: "support_help" });
  app.post("/api/support/help", supportHelpRateLimit, async (req, res) => {
    try {
      const { name, whatsapp, message, merchantName, merchantSlug } = req.body;
      if (!name || !message) {
        return res.status(400).json({ message: "Nom et message sont requis" });
      }
      // Sanitize : limiter la taille des champs pour éviter le spam / les injections Telegram Markdown
      const safeName    = String(name).slice(0, 80).replace(/[*_`[\]]/g, "");
      const safeWa      = String(whatsapp || "").slice(0, 20).replace(/[^0-9+\s]/g, "");
      const safeMsg     = String(message).slice(0, 500).replace(/[*_`[\]]/g, "");
      const safeMerch   = merchantName ? String(merchantName).slice(0, 60).replace(/[*_`[\]]/g, "") : null;
      const safeSlug    = merchantSlug ? String(merchantSlug).slice(0, 40).replace(/[^a-z0-9-]/g, "") : null;

      const now = new Date();
      const date = now.toLocaleDateString("fr-FR");
      const time = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      const merchantInfo = safeMerch ? `🏪 *Marchand :* ${safeMerch}${safeSlug ? ` (${safeSlug})` : ""}` : "🏪 *Marchand :* Inconnu";
      const text = `🆘 *Nouvelle demande d'aide — Page de paiement*\n\n${merchantInfo}\n\n👤 *Nom :* ${safeName}\n📱 *WhatsApp :* ${safeWa || "Non renseigné"}\n💬 *Message :*\n${safeMsg}\n\n📅 *Date :* ${date}  🕐 *Heure :* ${time}`;
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/wallet-transfer-countries", authMiddleware("admin"), async (_req, res) => {
    try {
      const countries = await storage.getWalletTransferCountries(false);
      res.json(countries);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.patch("/api/admin/wallet-transfer-countries/:id/toggle", authMiddleware("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { active } = req.body;
      await storage.toggleWalletTransferCountry(id, !!active);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.delete("/api/admin/wallet-transfer-countries/:id", authMiddleware("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteWalletTransferCountry(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      // Bloquer Niger et Kenya : devise propre, pas d'échange inter-pays autorisé
      if (NO_WALLET_TRANSFER_COUNTRIES.has(fromMC.country)) {
        return res.status(400).json({ message: `Les transferts inter-pays ne sont pas autorisés depuis le ${fromMC.country}. Les fonds reçus au ${fromMC.country} doivent être retirés localement.` });
      }
      if (NO_WALLET_TRANSFER_COUNTRIES.has(toMC.country)) {
        return res.status(400).json({ message: `Les transferts inter-pays ne sont pas autorisés vers le ${toMC.country}.` });
      }
      const fromZone = await getCurrencyZone(fromMC.country);
      const toZone = await getCurrencyZone(toMC.country);
      if (!fromZone || !toZone || fromZone !== toZone) {
        return res.status(400).json({ message: "Les deux pays doivent etre dans la meme zone monetaire (XOF ou XAF)" });
      }
      // Vérifier si les virements inter-wallets sont globalement désactivés
      const walletTransfersDisabledFlag = await storage.getSetting("wallet_transfers_disabled");
      if (walletTransfersDisabledFlag === "true") {
        return res.status(403).json({ message: "Les virements inter-wallets sont temporairement désactivés par l'administrateur." });
      }

      const wtMerchantForFee = await storage.getMerchantById(merchantId);
      const feeTypeSetting = await storage.getSetting("wallet_transfer_fee_type");
      const feeValueSetting = await storage.getSetting("wallet_transfer_fee_value");
      const feeType = feeTypeSetting || "percentage";
      const feeValue = parseFloat(feeValueSetting || "4.5");
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/wallet-transfers", authMiddleware("admin"), async (req, res) => {
    try {
      const transfers = await storage.getWalletTransfers();
      res.json(transfers);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/wallet-transfer-fee", authMiddleware("admin"), async (_req, res) => {
    try {
      const feeType = await storage.getSetting("wallet_transfer_fee_type");
      const feeValue = await storage.getSetting("wallet_transfer_fee_value");
      res.json({
        feeType: feeType || "percentage",
        feeValue: feeValue || "4.5",
      });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ── Taux de frais payin/payout globaux ────────────────────────────────────────
  app.get("/api/admin/fee-settings", authMiddleware("admin"), async (_req, res) => {
    try {
      res.json(getFeeSnapshot());
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/admin/fee-settings", authMiddleware("admin"), async (req, res) => {
    try {
      const { payinRate, payoutRate, countryOverrides } = req.body;
      const payin  = parseFloat(payinRate);
      const payout = parseFloat(payoutRate);
      if (isNaN(payin)  || payin  < 0 || payin  > 100) return res.status(400).json({ message: "Taux payin invalide (0–100)" });
      if (isNaN(payout) || payout < 0 || payout > 100) return res.status(400).json({ message: "Taux payout invalide (0–100)" });
      if (typeof countryOverrides !== "object" || Array.isArray(countryOverrides)) {
        return res.status(400).json({ message: "countryOverrides invalide" });
      }
      // Valider chaque override pays
      for (const [country, rates] of Object.entries(countryOverrides as any)) {
        const r = rates as any;
        if (typeof r?.payin !== "number" || typeof r?.payout !== "number" || r.payin < 0 || r.payout < 0) {
          return res.status(400).json({ message: `Override invalide pour ${country}` });
        }
      }
      await saveFeeConfig(payin, payout, countryOverrides as any);
      res.json({ success: true, ...getFeeSnapshot() });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ==================== AI KEYS (OpenAI / Groq / Gemini) ====================

  app.get("/api/admin/ai-keys", authMiddleware("admin"), async (_req, res) => {
    try {
      const [openai, groq, gemini] = await Promise.all([
        storage.getSetting("ai_key_openai"),
        storage.getSetting("ai_key_groq"),
        storage.getSetting("ai_key_gemini"),
      ]);
      const mask = (k: string | null) => k && k.length > 8 ? k.slice(0, 6) + "..." + k.slice(-4) : null;
      res.json({
        openai: mask(openai),
        groq: mask(groq),
        gemini: mask(gemini),
        openaiConfigured: !!(openai && openai.length > 5) || !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 10),
        groqConfigured: !!(groq && groq.length > 5) || !!(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.length > 10),
        geminiConfigured: !!(gemini && gemini.length > 5) || !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10),
      });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/admin/ai-keys", authMiddleware("admin"), async (req, res) => {
    try {
      const { openai, groq, gemini } = req.body;
      if (openai !== undefined) await storage.setSetting("ai_key_openai", openai);
      if (groq !== undefined) await storage.setSetting("ai_key_groq", groq);
      if (gemini !== undefined) await storage.setSetting("ai_key_gemini", gemini);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ── Test a specific AI provider ───────────────────────────────────────────
  app.post("/api/admin/ai-keys/test", authMiddleware("admin"), async (req, res) => {
    const { provider } = req.body;
    if (!["openai", "groq", "gemini"].includes(provider)) {
      return res.status(400).json({ success: false, message: "Provider invalide" });
    }
    const getKey = async (p: string) => {
      const envMap: Record<string, string | undefined> = {
        openai: process.env.OPENAI_API_KEY,
        groq: process.env.GROQ_API_KEY,
        gemini: process.env.GEMINI_API_KEY,
      };
      const dbKeyMap: Record<string, string> = {
        openai: "ai_key_openai",
        groq: "ai_key_groq",
        gemini: "ai_key_gemini",
      };
      const envKey = envMap[p];
      if (envKey && envKey.length > 10) return envKey;
      const dbKey = await storage.getSetting(dbKeyMap[p]).catch(() => null);
      return dbKey && dbKey.length > 5 ? dbKey : null;
    };
    try {
      const apiKey = await getKey(provider);
      if (!apiKey) return res.json({ success: false, message: "Aucune clé configurée pour ce provider", source: null });
      const envSources: Record<string, string | undefined> = {
        openai: process.env.OPENAI_API_KEY,
        groq: process.env.GROQ_API_KEY,
        gemini: process.env.GEMINI_API_KEY,
      };
      const source = (envSources[provider] && envSources[provider]!.length > 10) ? "env" : "db";
      if (provider === "openai") {
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: "gpt-4o-mini", max_tokens: 5, messages: [{ role: "user", content: "Hi" }] }),
        });
        if (!r.ok) { const t = await r.text(); return res.json({ success: false, message: `OpenAI: ${r.status} — ${t.slice(0, 120)}`, source }); }
        const d = await r.json() as any;
        return res.json({ success: true, message: `OpenAI OK — modèle: ${d.model || "gpt-4o-mini"}`, source });
      }
      if (provider === "groq") {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: "llama-3.1-8b-instant", max_tokens: 5, messages: [{ role: "user", content: "Hi" }] }),
        });
        if (!r.ok) { const t = await r.text(); return res.json({ success: false, message: `Groq: ${r.status} — ${t.slice(0, 120)}`, source }); }
        return res.json({ success: true, message: "Groq OK — llama-3.1-8b-instant", source });
      }
      if (provider === "gemini") {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Hi" }] }], generationConfig: { maxOutputTokens: 5 } }),
          }
        );
        if (!r.ok) { const t = await r.text(); return res.json({ success: false, message: `Gemini: ${r.status} — ${t.slice(0, 120)}`, source }); }
        return res.json({ success: true, message: "Gemini OK — gemini-1.5-flash", source });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/admin/support-contacts", authMiddleware("admin"), async (req, res) => {
    try {
      const { telegram1, telegram2, telegram3, telegram4 } = req.body;
      if (telegram1 !== undefined) await storage.setSetting("support_telegram_1", telegram1);
      if (telegram2 !== undefined) await storage.setSetting("support_telegram_2", telegram2);
      if (telegram3 !== undefined) await storage.setSetting("support_telegram_3", telegram3);
      if (telegram4 !== undefined) await storage.setSetting("support_telegram_4", telegram4);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ─── Reversements (Withdrawals) ──────────────────────────────────────────

  app.get("/api/merchant/withdrawals", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const list = await storage.getWithdrawals(merchantId);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/merchant/withdrawals", authMiddleware("merchant"), async (req, res) => {
    try {
      const merchantId = (req as any).user.id;

      // ── Rate limiting par IP ──────────────────────────────────────────────────
      const clientIp = extractIp(req);
      const rlCheck = checkWithdrawalRateLimit(clientIp);
      if (!rlCheck.allowed) {
        console.warn(`[WITHDRAWAL RATE LIMIT] IP ${clientIp} bloquée — trop de tentatives. Retry dans ${rlCheck.retryAfterSec}s`);
        res.setHeader("Retry-After", String(rlCheck.retryAfterSec));
        return res.status(429).json({
          message: `Trop de demandes de retrait. Veuillez réessayer dans ${Math.ceil(rlCheck.retryAfterSec / 60)} minute(s).`,
          retryAfterSec: rlCheck.retryAfterSec,
        });
      }

      // ── Validation des entrées ────────────────────────────────────────────────
      const { merchantCountryId, amount, phone, operator, recipientName } = req.body;
      if (!merchantCountryId || !amount || !phone) return res.status(400).json({ message: "Champs requis manquants" });

      // Validation stricte du numéro de téléphone (chiffres + indicatifs internationaux)
      const phoneClean = String(phone).trim();
      if (!/^\+?[0-9\s\-().]{6,20}$/.test(phoneClean)) {
        return res.status(400).json({ message: "Numéro de téléphone invalide" });
      }
      // Validation du montant : entier positif raisonnable
      const parsedAmount = Number(amount);
      if (!Number.isInteger(parsedAmount) || parsedAmount <= 0 || parsedAmount > 50_000_000) {
        return res.status(400).json({ message: "Montant invalide (doit être un entier positif, max 50 000 000)" });
      }
      // merchantCountryId doit être un entier
      if (!Number.isInteger(Number(merchantCountryId)) || Number(merchantCountryId) <= 0) {
        return res.status(400).json({ message: "merchantCountryId invalide" });
      }

      const withdrawalsDisabledFlag = await storage.getSetting("withdrawals_disabled");
      if (withdrawalsDisabledFlag === "true") {
        return res.status(503).json({ message: "Les retraits sont temporairement indisponibles. Veuillez réessayer plus tard.", withdrawalsDisabled: true });
      }

      // ── Vérification désactivation par marchand + suivi tentatives ────────────
      const merchantRecord = await storage.getMerchantById(merchantId);
      if (merchantRecord?.withdrawalsDisabled) {
        const now = Date.now();
        const retryKey = `wd_retry_${merchantId}`;
        let retryData: { count: number; blockedUntil?: number } = { count: 0 };
        const existing = await storage.getSetting(retryKey);
        if (existing) {
          try { retryData = JSON.parse(existing); } catch { retryData = { count: 0 }; }
        }
        if (retryData.blockedUntil && now < retryData.blockedUntil) {
          const remaining = Math.ceil((retryData.blockedUntil - now) / 60000);
          return res.status(503).json({
            message: `Trop de tentatives. Les retraits sont bloqués sur votre compte. Réessayez dans ${remaining} minute(s).`,
            withdrawalsDisabled: true,
            blocked: true,
            blockedUntil: retryData.blockedUntil,
          });
        }
        const newCount = (retryData.count || 0) + 1;
        if (newCount >= 3) {
          const blockedUntil = now + 3 * 60 * 60 * 1000;
          await storage.setSetting(retryKey, JSON.stringify({ count: newCount, blockedUntil }));
          return res.status(503).json({
            message: "Trop de tentatives. Les retraits sont bloqués sur votre compte. Réessayez dans 3 heures.",
            withdrawalsDisabled: true,
            blocked: true,
            blockedUntil,
          });
        }
        await storage.setSetting(retryKey, JSON.stringify({ count: newCount }));
        return res.status(503).json({
          message: "Les retraits sont désactivés sur votre compte. Veuillez patienter et réessayer dans quelques minutes.",
          withdrawalsDisabled: true,
          retryCount: newCount,
          retriesLeft: 3 - newCount,
        });
      }

      const mc = await storage.getMerchantCountryById(Number(merchantCountryId));
      if (!mc || mc.merchantId !== merchantId) return res.status(403).json({ message: "Wallet introuvable" });
      if (parsedAmount <= 0) return res.status(400).json({ message: "Montant invalide" });
      if (mc.balance < parsedAmount) return res.status(400).json({ message: "Solde insuffisant" });
      const merchant = await storage.getMerchantById(merchantId);
      if (!merchant) return res.status(404).json({ message: "Marchand introuvable" });

      const payoutOpRecord = operator ? await storage.getWithdrawalOperatorByNameAndCountry(operator, mc.country) : null;
      const payoutGatewayLower = payoutOpRecord?.gateway?.toLowerCase();
      const useMbiyoPayout = payoutGatewayLower === "mbiyo";
      const useSendavaPayout = payoutGatewayLower === "sendavapay";
      const useClapayPayout = payoutGatewayLower === "clapay";

      const minAmountRaw = await storage.getSetting("withdrawal_min_amount");
      const withdrawalMinAmount = minAmountRaw ? parseInt(minAmountRaw) || 200 : 200;
      if ((useMbiyoPayout || useSendavaPayout || useClapayPayout) && amount < withdrawalMinAmount) {
        return res.status(400).json({ message: `Le montant minimum de retrait est de ${withdrawalMinAmount} FCFA.` });
      }

      // ── ANTI-DOUBLON (vérification avant lock) ────────────────────────────────
      const recentDuplicate = await financialPool.query(
        `SELECT id, status, created_at FROM withdrawals
         WHERE merchant_id = $1 AND phone = $2 AND amount = $3 AND country = $4
           AND status IN ('pending', 'approved')
           AND created_at > NOW() - INTERVAL '2 hours'
         ORDER BY created_at DESC LIMIT 1`,
        [merchantId, phoneClean, parsedAmount, mc.country]
      );
      if (recentDuplicate.rowCount && recentDuplicate.rowCount > 0) {
        const dup = recentDuplicate.rows[0];
        const dupDate = new Date(dup.created_at).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        return res.status(409).json({
          message: `Un retrait identique (${parsedAmount} FCFA → ${phoneClean}) est déjà ${dup.status === "approved" ? "approuvé" : "en cours"} depuis ${dupDate}. Attendez 2 heures avant de réessayer.`,
          duplicateId: dup.id,
        });
      }

      // ── VÉRIFICATION SÉCURITÉ : dépôts reçus vs retraits effectués ──────────────
      const totalDeposits = await storage.getTotalConfirmedDepositsForMC(merchantId, mc.country);
      const adminCredits = (mc as any).adminCreditsTotal ?? 0;
      const totalAllowed = totalDeposits + adminCredits;
      const totalAlreadyWithdrawn = await storage.getTotalApprovedWithdrawalsForMC(mc.id);
      if (totalAllowed === 0) {
        return res.status(400).json({
          message: "Sécurité: Aucun dépôt confirmé sur ce compte. Vous ne pouvez pas effectuer de retrait.",
          securityBlock: true,
        });
      }
      if ((totalAlreadyWithdrawn + parsedAmount) > totalAllowed) {
        return res.status(400).json({
          message: `Sécurité: Le total de vos retraits (${(totalAlreadyWithdrawn + parsedAmount).toLocaleString("fr-FR")} F) dépasse vos dépôts confirmés (${totalAllowed.toLocaleString("fr-FR")} F). Retrait bloqué pour anomalie de solde.`,
          securityBlock: true,
          totalDeposits,
          adminCredits,
          totalAllowed,
          totalAlreadyWithdrawn,
          requested: parsedAmount,
        });
      }

      // ── DÉBIT ATOMIQUE ─────────────────────────────────────────────────────────
      const debited = await storage.decrementMerchantCountryBalanceAtomic(mc.id, parsedAmount);
      if (!debited) {
        return res.status(400).json({ message: "Solde insuffisant (vérification atomique échouée)" });
      }

      const w = await storage.createWithdrawal({
        merchantId,
        merchantCountryId: mc.id,
        country: mc.country,
        amount: parsedAmount,
        phone: phoneClean,
        recipientName: recipientName || null,
        operator: operator || null,
        status: "pending",
        withdrawalMode: "auto",
        adminNote: null,
        gateway: useMbiyoPayout ? "mbiyo" : useSendavaPayout ? "sendavapay" : useClapayPayout ? "clapay" : "omnipay",
      });

      const wdRawIp = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "").split(",")[0].trim();
      getGeoInfo(wdRawIp).then(wdGeo => {
        notifyAdminWithdrawal({ id: w.id, merchantName: merchant.name, merchantEmail: merchant.email, merchantId, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "pending", mode: "auto", ip: wdGeo.ip || wdRawIp, geo: wdGeo }).catch(() => {});
      }).catch(() => {
        notifyAdminWithdrawal({ id: w.id, merchantName: merchant.name, merchantEmail: merchant.email, merchantId, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "pending", mode: "auto", ip: wdRawIp }).catch(() => {});
      });

      const withdrawalFee = merchant.customFeeRate != null
        ? Math.floor(amount * merchant.customFeeRate / 100)
        : merchant.feeExempt ? 0 : calcWithdrawalFee(amount, mc.country);
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
          const callbackBaseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
          const callbackUrl = `${callbackBaseUrl}/api/mbiyo/payout-callback`;
          console.log(`[WITHDRAWAL MBIYO] Params: msisdn=${maskPhoneForLog(msisdnFull)} network=${network} country=${countryCode} currency=${currency}`);

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
          await storage.updateWithdrawalStatus(w.id, "failed", "Service de retrait non configuré", reference);
          await storage.incrementMerchantCountryBalance(mc.id, amount);
          return res.status(500).json({ message: "Service de retrait non configure. Contactez l'administrateur." });
        }
        try {
          const msisdnFull = "+" + prependDialCode(phone, mc.country);
          const countryCode = SENDAVAPAY_COUNTRY_CODES[mc.country] || "";
          const currency = SENDAVAPAY_CURRENCY_MAP[countryCode] || "XOF";
          const sendavaOperator = toSendavaOperator(operator || "", countryCode);
          console.log(`[WITHDRAWAL SENDAVAPAY] Params: msisdn=${maskPhoneForLog(msisdnFull)} op=${sendavaOperator} country=${countryCode}`);

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
            await storage.updateWithdrawalStatus(w.id, "pending", `En cours de traitement - Ref: ${spRef}`, spRef, spFee, spFee);
            console.log(`[WITHDRAWAL SENDAVAPAY] Initie (statut: ${result.data?.status}) - ref=${spRef}`);

            // Notifier le marchand que le retrait est en cours
            notifyMerchantWithdrawal(merchantId, { id: w.id, country: mc.country, amount, fees: spFee, phone, operator: operator || null, status: "pending" }).catch(() => {});

            // Démarrer le polling immédiat en arrière-plan (30s × 20 = 10 min)
            pollSendavaWithdrawalBackground({
              withdrawalId: w.id,
              sendavaRef: spRef,
              merchantId,
              country: mc.country,
              amount,
              fees: spFee,
              phone,
              operator: operator || null,
            }).catch(() => {});

            return res.json({ ...w, status: "pending", omnipayRef: spRef, fees: spFee, netAmount, autoProcessed: true, gateway: "sendavapay" });
          } else {
            const rawErrMsg = result.message || result.data?.message || (result as any).error || "Échec du virement";
            console.warn(`[WITHDRAWAL SENDAVAPAY] Echec: ${rawErrMsg}`);
            const safeErrMsg = toMerchantSafeMessage(rawErrMsg) || "Échec du virement";
            await storage.updateWithdrawalStatus(w.id, "failed", `Retrait non abouti: ${safeErrMsg}`, reference);
            notifyAdminWithdrawal({ id: w.id, merchantName: merchant.name, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "failed", mode: "auto" }).catch(() => {});
            notifyMerchantWithdrawal(merchantId, { id: w.id, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "failed" }).catch(() => {});
            await storage.incrementMerchantCountryBalance(mc.id, amount);
            return res.status(400).json({
              message: `Retrait refusé : ${safeErrMsg}. Votre solde a été restitué.`,
              providerMessage: safeErrMsg,
            });
          }
        } catch (spErr: any) {
          const errDetail = spErr?.cause?.message || spErr?.message || "unknown";
          const isTimeout = errDetail.includes("abort") || errDetail.includes("timeout") || errDetail.includes("UND_ERR");
          const techMsg = isTimeout
            ? "Délai d'attente dépassé (service inaccessible)"
            : `Erreur technique : ${toMerchantSafeMessage(errDetail)}`;
          console.error(`[WITHDRAWAL SENDAVAPAY] Erreur catch — retrait #${w.id} | ${techMsg}`);
          await storage.updateWithdrawalStatus(w.id, "failed", techMsg, reference);
          notifyAdminWithdrawal({ id: w.id, merchantName: merchant.name, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "failed", mode: "auto" }).catch(() => {});
          notifyMerchantWithdrawal(merchantId, { id: w.id, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "failed" }).catch(() => {});
          await storage.incrementMerchantCountryBalance(mc.id, amount);
          return res.status(500).json({
            message: `${techMsg}. Votre solde a été restitué.`,
            providerMessage: techMsg,
          });
        }
      } else if (useClapayPayout) {
        const cpToken = await getClapayApiKey();
        if (!cpToken) {
          await storage.updateWithdrawalStatus(w.id, "failed", "Clé API ClaPay non configurée", reference);
          await storage.incrementMerchantCountryBalance(mc.id, amount);
          return res.status(500).json({ message: "Service de retrait non configure. Contactez l'administrateur." });
        }
        try {
          const countryCode = clapayCountryCode(mc.country);
          const currency = clapayCurrency(mc.country);
          const wdOpRecord = await storage.getWithdrawalOperatorByNameAndCountry(operator || "", mc.country).catch(() => null);
          const serviceName = (wdOpRecord as any)?.clapayCode || wdOpRecord?.name || operator || undefined;
          const callbackBaseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
          const cpCallbackUrl = `${callbackBaseUrl}/api/clapay/payout-callback`;
          const msisdnFull = "+" + prependDialCode(phone, mc.country);
          const cpLocalPhone = clapayLocalPhone(msisdnFull, countryCode);
          console.log(`[WITHDRAWAL CLAPAY] Virement: ${netAmount} ${currency} → ${maskPhoneForLog(cpLocalPhone)}, service: ${serviceName}, ref: ${reference}`);
          const result = await clapayInitiatePayout(cpToken, {
            transaction_id: reference,
            amount: netAmount,
            country_code: countryCode,
            operators_code: serviceName ? [serviceName] : [],
            method: "CASHIN",
            tunnel: "API",
            callback_url: cpCallbackUrl,
            return_url: `${callbackBaseUrl}/pay?ref=${encodeURIComponent(reference)}&omnipay_status=complete`,
            additional_infos: {
              customer_phone: cpLocalPhone,
              customer_firstname: merchant.name,
            },
          });
          if (result.success) {
            const cpRef = result.data?.reference || reference;
            await storage.updateWithdrawalStatus(w.id, "pending", `En cours ClaPay — Ref: ${cpRef}`, cpRef, 0, 0);
            notifyMerchantWithdrawal(merchantId, { id: w.id, country: mc.country, amount, fees: 0, phone, operator: operator || null, status: "pending" }).catch(() => {});
            return res.json({ ...w, status: "pending", omnipayRef: cpRef, fees: 0, netAmount, autoProcessed: true, gateway: "clapay" });
          } else {
            const rawErrMsg = result.message || "Échec ClaPay";
            await storage.updateWithdrawalStatus(w.id, "failed", rawErrMsg, reference);
            await storage.incrementMerchantCountryBalance(mc.id, amount);
            return res.status(400).json({ message: `Retrait refusé : ${rawErrMsg}. Votre solde a été restitué.` });
          }
        } catch (cpErr: any) {
          await storage.updateWithdrawalStatus(w.id, "failed", `Erreur technique ClaPay`, reference);
          await storage.incrementMerchantCountryBalance(mc.id, amount);
          return res.status(500).json({ message: "Erreur technique lors du traitement. Votre solde a été restitué." });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/merchant/withdrawal-operators/:country", async (req, res) => {
    try {
      const country = req.params.country;
      const ops = await storage.getWithdrawalOperators(country, true);
      const available = ops.filter(op => !op.maintenanceAll && !op.maintenanceWithdrawals);
      res.json(available);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/withdrawals", authMiddleware("admin"), async (_req, res) => {
    try {
      const list = await storage.getWithdrawals();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      const useSeapayPayout = w.gateway === "seapay";
      const useClapayPayoutApprove = w.gateway === "clapay";

      if (useClapayPayoutApprove) {
        const cpToken = await getClapayApiKey();
        if (mc && cpToken && merchant) {
          try {
            const reference = clapayGenerateRef();
            const countryCode = clapayCountryCode(w.country);
            const currency = clapayCurrency(w.country);
            const wdOpRecord = w.operator ? await storage.getWithdrawalOperatorByNameAndCountry(w.operator, w.country) : null;
            const serviceName = (wdOpRecord as any)?.clapayCode || wdOpRecord?.name || w.operator || undefined;
            const callbackBaseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
            const callbackUrl = `${callbackBaseUrl}/api/clapay/payout-callback`;
            const cpAdminLocalPhone = clapayLocalPhone(w.phone || "", countryCode);
            console.log(`[ADMIN APPROVE WD CLAPAY] Virement: ${w.amount} ${currency} → ${maskPhoneForLog(cpAdminLocalPhone)}, service: ${serviceName}, ref: ${reference}`);
            const result = await clapayInitiatePayout(cpToken, {
              transaction_id: reference,
              amount: w.amount,
              country_code: countryCode,
              operators_code: serviceName ? [serviceName] : [],
              method: "CASHIN",
              tunnel: "API",
              callback_url: callbackUrl,
              return_url: `${callbackBaseUrl}/pay?ref=${encodeURIComponent(reference)}&omnipay_status=complete`,
              additional_infos: {
                customer_phone: cpAdminLocalPhone,
                customer_firstname: w.recipientName || merchant.name,
              },
            });
            if (result.success) {
              omnipayRef = reference;
              fees = 0;
              sentToProvider = true;
              console.log(`[ADMIN APPROVE WD CLAPAY] Initié - Ref: ${reference}`);
            } else {
              console.error(`[ADMIN APPROVE WD CLAPAY] Échec: ${result.message}`);
            }
          } catch (cpErr: any) {
            console.error("[ADMIN APPROVE WD CLAPAY] Erreur:", cpErr.message);
          }
        } else {
          console.error("[ADMIN APPROVE WD CLAPAY] Token ClaPay non configuré");
        }
      } else if (useSeapayPayout) {
        const [spMerchantId, spApiSecret] = await Promise.all([getSeapayMerchantId(w.country), getSeapayApiSecret(w.country)]);
        if (mc && spMerchantId && spApiSecret && merchant) {
          try {
            const reference = seapayGenerateRef();
            const currency = SEAPAY_CURRENCY_COUNTRY[w.country] || "USD";
            const wdOpRecord = w.operator ? await storage.getWithdrawalOperatorByNameAndCountry(w.operator, w.country) : null;
            const channelCode = wdOpRecord?.seapayCode || undefined;
            const isBankTransfer = wdOpRecord?.type === "Virement bancaire";
            const callbackBaseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
            const notifyUrl = `${callbackBaseUrl}/api/seapay/payout-callback`;
            console.log(`[ADMIN APPROVE WD SEAPAY] Transfert: ${w.amount} ${currency} vers ${maskPhoneForLog(w.phone)}, canal: ${channelCode || "(non defini)"}, ref: ${reference}`);
            const result = await seapayPayout({
              merchantId: spMerchantId,
              currency,
              amount: w.amount,
              orderId: reference,
              notifyUrl,
              bankCode: isBankTransfer ? channelCode : undefined,
              walletCode: !isBankTransfer ? channelCode : undefined,
              channelCode,
              account: w.phone,
              accountName: w.recipientName || merchant.name,
            }, spApiSecret);
            if (result.code === 200 && result.data) {
              omnipayRef = reference;
              fees = 0;
              sentToProvider = true;
              console.log(`[ADMIN APPROVE WD SEAPAY] Initié - TradeNo: ${result.data.trade_no}, Ref: ${reference} - en attente callback`);
            } else {
              console.error(`[ADMIN APPROVE WD SEAPAY] Echec: ${result.msg}`);
            }
          } catch (seapayErr: any) {
            console.error("[ADMIN APPROVE WD SEAPAY] Erreur:", seapayErr.message);
          }
        } else {
          console.error("[ADMIN APPROVE WD SEAPAY] Configuration SeaPay incomplete (merchantId/apiSecret manquant)");
        }
      } else if (useMbiyoPayout) {
        const mbiyoApiKey = await getMbiyoApiKey();
        if (mc && mbiyoApiKey && merchant) {
          try {
            const reference = mbiyoGenerateRef();
            const msisdnFull = prependDialCode(w.phone, w.country);
            const countryCode = mbiyoCountryCode(w.country);
            const currency = mbiyoCurrency(w.country);
            const wdOpRecord = w.operator ? await storage.getWithdrawalOperatorByNameAndCountry(w.operator, w.country) : null;
            const network = wdOpRecord?.mbiyoCode || mbiyoNetwork(w.operator || "");
            const callbackBaseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
            const callbackUrl = `${callbackBaseUrl}/api/mbiyo/payout-callback`;
            console.log(`[ADMIN APPROVE WD MBIYO] Transfert: ${w.amount} vers ${maskPhoneForLog(msisdnFull)}, ref: ${reference}, network: ${network}`);
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
            console.log(`[ADMIN APPROVE WD] Transfert: ${w.amount} vers ${maskPhoneForLog(wdMsisdn)}, operateur: ${adminOmnipayCode || "(auto)"}, ref: ${reference}`);
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // Vérifie le statut d'un reversement directement auprès d'un fournisseur (choisi par l'admin)
  app.get("/api/admin/withdrawals/:id/check-status", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const provider = String(req.query.provider || "").toLowerCase();
      const w = await storage.getWithdrawalById(id);
      if (!w) return res.status(404).json({ message: "Reversement introuvable" });
      const effectiveProvider = provider || w.gateway || "";
      if (!["sendavapay", "mbiyo", "omnipay", "seapay", "clapay"].includes(effectiveProvider)) {
        return res.status(400).json({ message: "Veuillez choisir un fournisseur valide (SendavaPay, Mbiyo, OmniPay, SeaPay ou ClaPay)" });
      }
      if (!w.omnipayRef) return res.status(400).json({ message: "Aucune référence fournisseur pour ce reversement" });

      if (effectiveProvider === "clapay") {
        const cpToken = await getClapayApiKey();
        if (!cpToken) return res.status(500).json({ message: "Clé API ClaPay non configurée" });
        const result = await clapayGetTransactionStatus(cpToken, w.omnipayRef);
        return res.json({ provider: "clapay", success: result.success, status: result.status, data: result.data, error: result.message });
      }
      if (effectiveProvider === "sendavapay") {
        const sendavaApiKey = await getSendavaApiKey();
        if (!sendavaApiKey) return res.status(500).json({ message: "Clé API SendavaPay non configurée" });
        const result = await sendavaGetWithdrawalStatus(sendavaApiKey, w.omnipayRef);
        return res.json({ provider: "sendavapay", success: result.success, status: result.data?.status, data: result.data, error: result.error || result.message });
      }
      if (effectiveProvider === "mbiyo") {
        const mbiyoApiKey = await getMbiyoApiKey();
        if (!mbiyoApiKey) return res.status(500).json({ message: "Clé API Mbiyo non configurée" });
        const result = await mbiyoGetStatus(mbiyoApiKey, w.omnipayRef);
        return res.json({ provider: "mbiyo", success: result.status === "success", status: result.data?.status, data: result.data, error: result.message });
      }
      if (effectiveProvider === "seapay") {
        const [spMerchantId, spApiKey] = await Promise.all([getSeapayMerchantId(w.country), getSeapayApiKey(w.country)]);
        if (!spMerchantId || !spApiKey) return res.status(500).json({ message: "Clé API SeaPay non configurée" });
        const currency = SEAPAY_CURRENCY_COUNTRY[w.country] || "USD";
        const result = await seapayQuery(spMerchantId, w.omnipayRef, currency, spApiKey);
        return res.json({ provider: "seapay", success: result.code === 200, status: result.data?.status, data: result.data, error: result.msg });
      }
      const omnipayApiKey = await getOmnipayPayoutApiKey();
      if (!omnipayApiKey) return res.status(500).json({ message: "Clé API OmniPay non configurée" });
      const result = await omnipayGetStatus(omnipayApiKey, w.omnipayRef);
      return res.json({ provider: "omnipay", success: result.success === 1, status: (result as any).status || (result as any).data?.status, data: result, error: result.message });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // Applique le statut renvoyé par le fournisseur au reversement local ("Approuver chez le fournisseur")
  app.post("/api/admin/withdrawals/:id/sync-status", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const provider = String(req.body.provider || "").toLowerCase();
      const w = await storage.getWithdrawalById(id);
      if (!w) return res.status(404).json({ message: "Reversement introuvable" });
      const effectiveProvider = provider || w.gateway || "";
      if (!["sendavapay", "mbiyo", "omnipay", "seapay", "clapay"].includes(effectiveProvider)) {
        return res.status(400).json({ message: "Veuillez choisir un fournisseur valide (SendavaPay, Mbiyo, OmniPay, SeaPay ou ClaPay)" });
      }
      if (!w.omnipayRef) return res.status(400).json({ message: "Aucune référence fournisseur pour ce reversement" });

      let providerStatus = "";
      let raw: any = null;
      if (effectiveProvider === "clapay") {
        const cpToken = await getClapayApiKey();
        if (!cpToken) return res.status(500).json({ message: "Clé API ClaPay non configurée" });
        const result = await clapayGetTransactionStatus(cpToken, w.omnipayRef);
        providerStatus = (result.status || "").toLowerCase();
        raw = result.data;
      } else if (effectiveProvider === "sendavapay") {
        const sendavaApiKey = await getSendavaApiKey();
        if (!sendavaApiKey) return res.status(500).json({ message: "Clé API SendavaPay non configurée" });
        const result = await sendavaGetWithdrawalStatus(sendavaApiKey, w.omnipayRef);
        providerStatus = (result.data?.status || "").toLowerCase();
        raw = result.data;
      } else if (effectiveProvider === "mbiyo") {
        const mbiyoApiKey = await getMbiyoApiKey();
        if (!mbiyoApiKey) return res.status(500).json({ message: "Clé API Mbiyo non configurée" });
        const result = await mbiyoGetStatus(mbiyoApiKey, w.omnipayRef);
        providerStatus = (result.data?.status || result.status || "").toLowerCase();
        raw = result.data;
      } else if (effectiveProvider === "seapay") {
        const [spMerchantId, spApiKey] = await Promise.all([getSeapayMerchantId(w.country), getSeapayApiKey(w.country)]);
        if (!spMerchantId || !spApiKey) return res.status(500).json({ message: "Clé API SeaPay non configurée" });
        const currency = SEAPAY_CURRENCY_COUNTRY[w.country] || "USD";
        const result = await seapayQuery(spMerchantId, w.omnipayRef, currency, spApiKey);
        providerStatus = String(result.data?.status || "").toLowerCase();
        raw = result.data;
      } else {
        const omnipayApiKey = await getOmnipayPayoutApiKey();
        if (!omnipayApiKey) return res.status(500).json({ message: "Clé API OmniPay non configurée" });
        const result = await omnipayGetStatus(omnipayApiKey, w.omnipayRef);
        providerStatus = String((result as any).status || (result as any).data?.status || "").toLowerCase();
        raw = result;
      }

      const successStatuses = ["success", "successful", "completed", "complete", "confirmed", "approved", "paid"];
      const failureStatuses = ["failed", "failure", "cancelled", "canceled", "rejected", "expired"];
      const merchant = await storage.getMerchantById(w.merchantId);

      if (successStatuses.includes(providerStatus)) {
        await storage.updateWithdrawalStatus(id, "approved", `Confirmé chez ${effectiveProvider} par l'admin`, undefined, w.fees || undefined, w.fees || undefined);
        notifyAdminWithdrawal({ id, merchantName: merchant?.name || `#${w.merchantId}`, country: w.country, amount: w.amount, fees: w.fees || 0, phone: w.phone, operator: w.operator, status: "approved", mode: "manual" }).catch(() => {});
        notifyMerchantWithdrawal(w.merchantId, { id, country: w.country, amount: w.amount, fees: w.fees || 0, phone: w.phone, operator: w.operator, status: "approved" }).catch(() => {});
        console.log(`[ADMIN SYNC-STATUS WD] Retrait #${id} approuvé suite à confirmation ${effectiveProvider} (statut: ${providerStatus})`);
        return res.json({ success: true, applied: "approved", providerStatus, data: raw });
      }
      if (failureStatuses.includes(providerStatus)) {
        await storage.updateWithdrawalStatus(id, "failed", `Échec confirmé chez ${effectiveProvider} par l'admin`);
        console.log(`[ADMIN SYNC-STATUS WD] Retrait #${id} marqué échoué suite à ${effectiveProvider} (statut: ${providerStatus})`);
        return res.json({ success: true, applied: "failed", providerStatus, data: raw });
      }
      return res.json({ success: true, applied: "none", providerStatus, message: "Le fournisseur n'a pas encore confirmé le statut final", data: raw });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // Déclenche (ou relance) le paiement chez le fournisseur choisi par l'admin
  app.post("/api/admin/withdrawals/:id/retry", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const requestedProvider = String(req.body?.provider || "").toLowerCase();
      const w = await storage.getWithdrawalById(id);
      if (!w) return res.status(404).json({ message: "Reversement introuvable" });
      const provider = requestedProvider || w.gateway || "sendavapay";
      if (!["sendavapay", "mbiyo", "omnipay", "seapay", "clapay"].includes(provider)) {
        return res.status(400).json({ message: "Veuillez choisir un fournisseur valide (SendavaPay, Mbiyo, OmniPay, SeaPay ou ClaPay)" });
      }
      if (w.status === "pending" && w.omnipayRef && provider === w.gateway) {
        return res.status(400).json({ message: `Ce retrait est déjà en cours de traitement chez ${provider} (réf: ${w.omnipayRef}). Attendez la confirmation ou choisissez un autre fournisseur.` });
      }
      const mc = await storage.getMerchantCountryById(w.merchantCountryId);
      const merchant = await storage.getMerchantById(w.merchantId);
      if (!mc || !merchant) return res.status(404).json({ message: "Marchand introuvable" });
      const fees = w.fees || 0;
      const netAmount = w.amount - fees;

      if (provider === "sendavapay") {
        const sendavaApiKey = await getSendavaApiKey();
        if (!sendavaApiKey) return res.status(500).json({ message: "Clé API SendavaPay non configurée" });
        const reference = sendavaGenerateRef();
        const msisdnFull = "+" + prependDialCode(w.phone, w.country);
        const countryCode = SENDAVAPAY_COUNTRY_CODES[w.country] || "";
        const currency = SENDAVAPAY_CURRENCY_MAP[countryCode] || "XOF";
        const sendavaOperator = toSendavaOperator(w.operator || "", countryCode);
        const result = await sendavaInitiateWithdraw(sendavaApiKey, {
          amount: netAmount,
          phoneNumber: msisdnFull,
          operator: sendavaOperator,
          country: countryCode,
          currency,
          description: `Retrait WestPay (relance) - ${merchant.name}`,
          externalReference: reference,
        });
        const spStatusLower = (result.data?.status || "").toLowerCase();
        const spInitOk = result.success && !["failed", "failure", "cancelled", "canceled", "rejected"].includes(spStatusLower);
        if (spInitOk) {
          const spRef = result.data?.reference || reference;
          const spFee = result.data?.fee != null ? Math.round(result.data.fee || fees) : fees;
          await storage.updateWithdrawalGateway(id, "sendavapay");
          await storage.updateWithdrawalStatus(id, "pending", `Relancé chez SendavaPay — Ref: ${spRef}`, spRef, spFee, spFee);
          pollSendavaWithdrawalBackground({ withdrawalId: id, sendavaRef: spRef, merchantId: w.merchantId, country: w.country, amount: w.amount, fees: spFee, phone: w.phone, operator: w.operator });
          console.log(`[ADMIN TRIGGER WD] Retrait #${id} relancé chez SendavaPay — ref=${spRef}`);
          return res.json({ success: true, provider: "sendavapay", reference: spRef, fees: spFee });
        }
        const errMsg = result.error || result.message || "Échec inconnu";
        console.error(`[ADMIN TRIGGER WD] Retrait #${id} échec relance SendavaPay: ${errMsg}`);
        return res.status(502).json({ success: false, message: errMsg });
      }

      if (provider === "mbiyo") {
        const mbiyoApiKey = await getMbiyoApiKey();
        if (!mbiyoApiKey) return res.status(500).json({ message: "Clé API Mbiyo non configurée" });
        const reference = mbiyoGenerateRef();
        const msisdnFull = prependDialCode(w.phone, w.country);
        const countryCode = mbiyoCountryCode(w.country);
        const currency = mbiyoCurrency(w.country);
        const wdOpRecord = w.operator ? await storage.getWithdrawalOperatorByNameAndCountry(w.operator, w.country) : null;
        const network = wdOpRecord?.mbiyoCode || mbiyoNetwork(w.operator || "");
        const callbackBaseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
        const callbackUrl = `${callbackBaseUrl}/api/mbiyo/payout-callback`;
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
        if ((result.status === "success" || result.status === "pending") && result.data) {
          const mbFee = Math.round(parseFloat(String(result.data.fee || fees)) || fees);
          await storage.updateWithdrawalGateway(id, "mbiyo");
          await storage.updateWithdrawalStatus(id, "pending", `Relancé chez Mbiyo — Ref: ${reference}`, reference, mbFee, mbFee);
          console.log(`[ADMIN TRIGGER WD] Retrait #${id} relancé chez Mbiyo — ref=${reference}`);
          return res.json({ success: true, provider: "mbiyo", reference, fees: mbFee });
        }
        console.error(`[ADMIN TRIGGER WD] Retrait #${id} échec relance Mbiyo: ${result.message}`);
        return res.status(502).json({ success: false, message: result.message || "Échec inconnu" });
      }

      if (provider === "seapay") {
        const [spMerchantId, spApiSecret] = await Promise.all([getSeapayMerchantId(w.country), getSeapayApiSecret(w.country)]);
        if (!spMerchantId || !spApiSecret) return res.status(500).json({ message: "Clé API SeaPay non configurée" });
        const reference = seapayGenerateRef();
        const currency = SEAPAY_CURRENCY_COUNTRY[w.country] || "USD";
        const wdOpRecord = w.operator ? await storage.getWithdrawalOperatorByNameAndCountry(w.operator, w.country) : null;
        const channelCode = wdOpRecord?.seapayCode || undefined;
        const isBankTransfer = wdOpRecord?.type === "Virement bancaire";
        const callbackBaseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
        const notifyUrl = `${callbackBaseUrl}/api/seapay/payout-callback`;
        const result = await seapayPayout({
          merchantId: spMerchantId,
          currency,
          amount: netAmount,
          orderId: reference,
          notifyUrl,
          bankCode: isBankTransfer ? channelCode : undefined,
          walletCode: !isBankTransfer ? channelCode : undefined,
          channelCode,
          account: w.phone,
          accountName: w.recipientName || merchant.name,
        }, spApiSecret);
        if (result.code === 200 && result.data) {
          await storage.updateWithdrawalGateway(id, "seapay");
          await storage.updateWithdrawalStatus(id, "pending", `Relancé chez SeaPay — Ref: ${reference}`, reference, fees, fees);
          console.log(`[ADMIN TRIGGER WD] Retrait #${id} relancé chez SeaPay — ref=${reference}`);
          return res.json({ success: true, provider: "seapay", reference, fees });
        }
        console.error(`[ADMIN TRIGGER WD] Retrait #${id} échec relance SeaPay: ${result.msg}`);
        return res.status(502).json({ success: false, message: result.msg || "Échec inconnu" });
      }

      // provider === "omnipay"
      const omnipayApiKey = await getOmnipayPayoutApiKey();
      if (!omnipayApiKey) return res.status(500).json({ message: "Clé API OmniPay non configurée" });
      const reference = `WD-${id}-${Date.now()}`;
      const mNameParts = merchant.name.trim().split(/\s+/);
      const mFirstName = mNameParts[0] || merchant.name;
      const mLastName = mNameParts.length > 1 ? mNameParts.slice(1).join(" ") : mNameParts[0] || merchant.name;
      const adminOmnipayCode = await resolveOmnipayOperatorCode(w.operator, w.country);
      const wdMsisdn = prependDialCode(w.phone, w.country);
      const result = await omnipayInitiateTransfer({
        apikey: omnipayApiKey,
        msisdn: wdMsisdn,
        amount: netAmount,
        reference,
        first_name: mFirstName,
        last_name: mLastName,
        operator: adminOmnipayCode,
      });
      if (result.success === 1) {
        const opRef = result.reference || reference;
        const opFee = result.fees || fees;
        await storage.updateWithdrawalGateway(id, "omnipay");
        await storage.updateWithdrawalStatus(id, "pending", `Relancé chez OmniPay — Ref: ${opRef}`, opRef, opFee, opFee);
        console.log(`[ADMIN TRIGGER WD] Retrait #${id} relancé chez OmniPay — ref=${opRef}`);
        return res.json({ success: true, provider: "omnipay", reference: opRef, fees: opFee });
      }
      const errMsg = OMNIPAY_ERRORS[result.code || 0] || result.message || "Échec inconnu";
      console.error(`[ADMIN TRIGGER WD] Retrait #${id} échec relance OmniPay (code ${result.code}): ${errMsg}`);
      return res.status(502).json({ success: false, message: errMsg });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/admin/withdrawals/:id/force-validate", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { note } = req.body;
      const w = await storage.getWithdrawalById(id);
      if (!w) return res.status(404).json({ message: "Reversement introuvable" });
      if (w.status === "approved") return res.status(400).json({ message: "Ce reversement est déjà approuvé" });
      const merchant = await storage.getMerchantById(w.merchantId);
      await storage.updateWithdrawalStatus(id, "approved", note || "Validé manuellement par l'administrateur");
      notifyAdminWithdrawal({ id, merchantName: merchant?.name || `#${w.merchantId}`, country: w.country, amount: w.amount, fees: w.fees || 0, phone: w.phone, operator: w.operator, status: "approved", mode: "manual" }).catch(() => {});
      notifyMerchantWithdrawal(w.merchantId, { id, country: w.country, amount: w.amount, fees: w.fees || 0, phone: w.phone, operator: w.operator, status: "approved" }).catch(() => {});
      console.log(`[ADMIN FORCE-VALIDATE WD] Retrait #${id} validé manuellement (précédent: ${w.status})`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/admin/withdrawals/:id/force-reject", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { note } = req.body;
      const w = await storage.getWithdrawalById(id);
      if (!w) return res.status(404).json({ message: "Reversement introuvable" });
      if (w.status === "rejected") return res.status(400).json({ message: "Ce reversement est déjà rejeté" });
      const merchant = await storage.getMerchantById(w.merchantId);
      await storage.updateWithdrawalStatus(id, "rejected", note || "Rejeté manuellement par l'administrateur");
      if (w.status === "pending" || w.status === "failed") {
        await storage.incrementMerchantCountryBalance(w.merchantCountryId, w.amount);
      }
      notifyAdminWithdrawal({ id, merchantName: merchant?.name || `#${w.merchantId}`, country: w.country, amount: w.amount, fees: 0, phone: w.phone, operator: w.operator, status: "rejected", mode: "manual" }).catch(() => {});
      notifyMerchantWithdrawal(w.merchantId, { id, country: w.country, amount: w.amount, fees: 0, phone: w.phone, operator: w.operator, status: "rejected" }).catch(() => {});
      console.log(`[ADMIN FORCE-REJECT WD] Retrait #${id} rejeté manuellement (précédent: ${w.status})`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/admin/transactions/:id/validate", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "ID de transaction invalide" });
      const [tx] = await financialDb.select().from(transactions).where(eq(transactions.id, id));
      if (!tx) return res.status(404).json({ message: "Transaction introuvable" });
      if (tx.status === "confirmed") return res.json({ success: true, alreadyConfirmed: true });

      // Créditer le marchand si la transaction n'était pas déjà confirmée
      const mc = await storage.findMerchantCountryBySimAndCountry(tx.merchantId, tx.country || "");
      const merchant = await storage.getMerchantById(tx.merchantId);
      if (mc) {
        const credit = calcMerchantCreditForMerchant(tx.amount, tx.country, merchant);
        await storage.incrementMerchantCountryBalance(mc.id, credit);
      }
      await financialDb.update(transactions).set({ status: "confirmed" }).where(eq(transactions.id, id));
      notifyAdminPayment({ txId: tx.txId || `TX-${id}`, merchantName: merchant?.name || `#${tx.merchantId}`, payerNumber: tx.payerNumber, country: tx.country || "", amount: tx.amount, provider: tx.provider || "manual", status: "confirmed" }).catch(() => {});
      notifyMerchantPayment(tx.merchantId, { txId: tx.txId || `TX-${id}`, amount: tx.amount, payerNumber: tx.payerNumber, country: tx.country || "", provider: tx.provider || "manual" }).catch(() => {});
      console.log(`[ADMIN FORCE-VALIDATE TX] Transaction #${id} validée manuellement — crédit: ${mc ? "oui" : "pays non trouvé"}`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/admin/transactions/:id/reject", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "ID de transaction invalide" });
      await financialDb.update(transactions).set({ status: "rejected" }).where(eq(transactions.id, id));
      console.log(`[ADMIN FORCE-REJECT TX] Transaction #${id} rejetée manuellement`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // Vérifie le statut d'un paiement (transaction confirmée ou en attente) auprès d'un fournisseur choisi par l'admin
  app.get("/api/admin/transactions/:id/check-status", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const source = String(req.query.source || "payment");
      const provider = String(req.query.provider || "").toLowerCase();

      let ref: string | null | undefined;
      let txCountry: string | null | undefined;
      if (source === "pending") {
        const pp = await storage.getPendingPaymentById(id);
        if (!pp) return res.status(404).json({ message: "Paiement en cours introuvable" });
        ref = pp.omnipayReference;
        txCountry = pp.country;
      } else {
        const [tx] = await financialDb.select().from(transactions).where(eq(transactions.id, id));
        if (!tx) return res.status(404).json({ message: "Transaction introuvable" });
        ref = tx.omnipayReference;
        txCountry = tx.country;
      }
      if (!ref) return res.status(400).json({ message: "Aucune référence fournisseur pour ce paiement" });
      if (!["sendavapay", "mbiyo", "omnipay", "seapay", "clapay"].includes(provider)) {
        return res.status(400).json({ message: "Veuillez choisir un fournisseur valide (SendavaPay, Mbiyo, OmniPay, SeaPay ou ClaPay)" });
      }

      if (provider === "clapay") {
        const cpToken = await getClapayApiKey();
        if (!cpToken) return res.status(500).json({ message: "Clé API ClaPay non configurée" });
        const result = await clapayGetTransactionStatus(cpToken, ref);
        return res.json({ provider: "clapay", success: result.success, status: result.status, data: result.data, error: result.message });
      }
      if (provider === "sendavapay") {
        const sendavaApiKey = await getSendavaApiKey();
        if (!sendavaApiKey) return res.status(500).json({ message: "Clé API SendavaPay non configurée" });
        const result = await sendavaGetPaymentStatus(sendavaApiKey, ref);
        return res.json({ provider: "sendavapay", success: result.success, status: (result as any).data?.status, data: (result as any).data, error: (result as any).error || (result as any).message });
      }
      if (provider === "mbiyo") {
        const mbiyoApiKey = await getMbiyoApiKey();
        if (!mbiyoApiKey) return res.status(500).json({ message: "Clé API Mbiyo non configurée" });
        const result = await mbiyoGetStatus(mbiyoApiKey, ref);
        return res.json({ provider: "mbiyo", success: result.status === "success", status: result.data?.status, data: result.data, error: result.message });
      }
      if (provider === "seapay") {
        const [spMerchantId, spApiKey] = await Promise.all([getSeapayMerchantId(txCountry || ""), getSeapayApiKey(txCountry || "")]);
        if (!spMerchantId || !spApiKey) return res.status(500).json({ message: "Clé API SeaPay non configurée" });
        const currency = SEAPAY_CURRENCY_COUNTRY[txCountry || ""] || "USD";
        const result = await seapayQuery(spMerchantId, ref, currency, spApiKey);
        return res.json({ provider: "seapay", success: result.code === 200, status: result.data?.status, data: result.data, error: result.msg });
      }
      const omnipayApiKey = await getOmnipayApiKey();
      if (!omnipayApiKey) return res.status(500).json({ message: "Clé API OmniPay non configurée" });
      const result = await omnipayGetStatus(omnipayApiKey, ref);
      return res.json({ provider: "omnipay", success: result.success === 1, status: (result as any).status || (result as any).data?.status, data: result, error: result.message });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // Applique le statut renvoyé par le fournisseur à une transaction/paiement en cours ("Approuver chez le fournisseur")
  app.post("/api/admin/transactions/:id/sync-status", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "ID invalide" });
      const source = String(req.body.source || "payment");
      const provider = String(req.body.provider || "").toLowerCase();
      if (!["sendavapay", "mbiyo", "omnipay", "seapay", "clapay"].includes(provider)) {
        return res.status(400).json({ message: "Veuillez choisir un fournisseur valide (SendavaPay, Mbiyo, OmniPay, SeaPay ou ClaPay)" });
      }

      let ref: string | null | undefined;
      let txCountry: string | null | undefined;
      let pendingRecord: any = null;
      let txRecord: any = null;

      if (source === "pending") {
        pendingRecord = await storage.getPendingPaymentById(id);
        if (!pendingRecord) return res.status(404).json({ message: "Paiement en cours introuvable" });
        ref = pendingRecord.omnipayReference;
        txCountry = pendingRecord.country;
      } else {
        const [tx] = await financialDb.select().from(transactions).where(eq(transactions.id, id));
        if (!tx) return res.status(404).json({ message: "Transaction introuvable" });
        txRecord = tx;
        ref = tx.omnipayReference;
        txCountry = tx.country;
      }
      if (!ref) return res.status(400).json({ message: "Aucune référence fournisseur pour ce paiement" });

      // ── Interroger le fournisseur ──────────────────────────────────────────
      let providerStatus = "";
      if (provider === "clapay") {
        const cpToken = await getClapayApiKey();
        if (!cpToken) return res.status(500).json({ message: "Clé API ClaPay non configurée" });
        const result = await clapayGetTransactionStatus(cpToken, ref);
        providerStatus = (result.status || "").toLowerCase();
      } else if (provider === "sendavapay") {
        const sendavaApiKey = await getSendavaApiKey();
        if (!sendavaApiKey) return res.status(500).json({ message: "Clé API SendavaPay non configurée" });
        const result = await sendavaGetPaymentStatus(sendavaApiKey, ref);
        providerStatus = ((result as any).data?.status || "").toLowerCase();
      } else if (provider === "mbiyo") {
        const mbiyoApiKey = await getMbiyoApiKey();
        if (!mbiyoApiKey) return res.status(500).json({ message: "Clé API Mbiyo non configurée" });
        const result = await mbiyoGetStatus(mbiyoApiKey, ref);
        providerStatus = (result.data?.status || result.status || "").toLowerCase();
      } else if (provider === "seapay") {
        const [spMerchantId, spApiKey] = await Promise.all([getSeapayMerchantId(txCountry || ""), getSeapayApiKey(txCountry || "")]);
        if (!spMerchantId || !spApiKey) return res.status(500).json({ message: "Clé API SeaPay non configurée" });
        const currency = SEAPAY_CURRENCY_COUNTRY[txCountry || ""] || "USD";
        const result = await seapayQuery(spMerchantId, ref, currency, spApiKey);
        providerStatus = String(result.data?.status || "").toLowerCase();
      } else {
        const omnipayApiKey = await getOmnipayApiKey();
        if (!omnipayApiKey) return res.status(500).json({ message: "Clé API OmniPay non configurée" });
        const result = await omnipayGetStatus(omnipayApiKey, ref);
        providerStatus = String((result as any).status || (result as any).data?.status || "").toLowerCase();
      }

      const successStatuses = ["success", "successful", "completed", "complete", "confirmed", "approved", "paid"];
      const failureStatuses = ["failed", "failure", "cancelled", "canceled", "rejected", "expired"];

      // ── Statut final SUCCÈS ───────────────────────────────────────────────
      if (successStatuses.includes(providerStatus)) {
        if (source === "pending" && pendingRecord) {
          // Paiement en attente → crédit complet comme un callback
          const pp = pendingRecord;
          const merchant = await storage.getMerchantById(pp.merchantId);
          const mc = await storage.findMerchantCountryBySimAndCountry(pp.merchantId, pp.country || "");
          const providerLabel = provider === "clapay" ? "clapay" : provider === "sendavapay" ? "sendavapay" : provider === "seapay" ? "seapay" : provider === "mbiyo" ? "mbiyo" : "westpay";
          const txRef = `SYNC-${ref}`;
          const existingTx = await storage.getTransactionByTxId(txRef);
          if (!existingTx && mc) {
            const credit = calcMerchantCreditForMerchant(pp.amount, pp.country, merchant);
            const fee = pp.amount - credit;
            await storage.incrementMerchantCountryBalance(mc.id, credit);
            await storage.createTransaction({
              merchantId: pp.merchantId,
              country: pp.country,
              txId: txRef,
              amount: pp.amount,
              payerNumber: pp.payerPhone || null,
              payerName: pp.payerName || null,
              status: "confirmed",
              provider: providerLabel,
              omnipayTxId: null,
              operator: pp.paymentMethod || null,
              omnipayReference: ref,
              errorMessage: null,
              providerFee: fee,
            });
            // Webhook marchand
            sendWebhookNotification(pp.merchantId, { event: "payment.confirmed", txId: txRef, amount: pp.amount, country: pp.country, payerNumber: pp.payerPhone, payerName: pp.payerName, status: "confirmed", reference: ref, provider: providerLabel }).catch(() => {});
            notifyMerchantPayment(pp.merchantId, { txId: txRef, amount: pp.amount, payerNumber: pp.payerPhone, country: pp.country, provider: providerLabel }).catch(() => {});
            notifyAdminPayment({ txId: txRef, merchantName: merchant?.name || `#${pp.merchantId}`, payerNumber: pp.payerPhone, country: pp.country, amount: pp.amount, provider: providerLabel, status: "confirmed" }).catch(() => {});
          }
          await storage.updatePendingPaymentStatus(id, "confirmed");
          console.log(`[ADMIN SYNC-STATUS TX] pending #${id} confirmé (${provider}/${providerStatus}) — crédit: ${existingTx ? "doublon ignoré" : mc ? "ok" : "pays non trouvé"}`);
        } else if (source !== "pending" && txRecord) {
          // Transaction existante → crédit si pas encore confirmée
          if (txRecord.status !== "confirmed") {
            const merchant = await storage.getMerchantById(txRecord.merchantId);
            const mc = await storage.findMerchantCountryBySimAndCountry(txRecord.merchantId, txRecord.country || "");
            if (mc) {
              const credit = calcMerchantCreditForMerchant(txRecord.amount, txRecord.country, merchant);
              await storage.incrementMerchantCountryBalance(mc.id, credit);
            }
            await financialDb.update(transactions).set({ status: "confirmed" }).where(eq(transactions.id, id));
            notifyAdminPayment({ txId: txRecord.txId || `TX-${id}`, merchantName: (await storage.getMerchantById(txRecord.merchantId))?.name || `#${txRecord.merchantId}`, payerNumber: txRecord.payerNumber, country: txRecord.country || "", amount: txRecord.amount, provider: txRecord.provider || provider, status: "confirmed" }).catch(() => {});
            notifyMerchantPayment(txRecord.merchantId, { txId: txRecord.txId || `TX-${id}`, amount: txRecord.amount, payerNumber: txRecord.payerNumber, country: txRecord.country || "", provider: txRecord.provider || provider }).catch(() => {});
          }
          console.log(`[ADMIN SYNC-STATUS TX] transaction #${id} confirmée (${provider}/${providerStatus})`);
        }
        return res.json({ success: true, applied: "confirmed", providerStatus });
      }

      // ── Statut final ÉCHEC ────────────────────────────────────────────────
      if (failureStatuses.includes(providerStatus)) {
        if (source === "pending") {
          await storage.updatePendingPaymentStatus(id, "omnipay_failed");
        } else {
          await financialDb.update(transactions).set({ status: "failed" }).where(eq(transactions.id, id));
        }
        console.log(`[ADMIN SYNC-STATUS TX] ${source} #${id} marqué échoué (${provider}/${providerStatus})`);
        return res.json({ success: true, applied: "failed", providerStatus });
      }

      // ── Toujours en attente chez le fournisseur ───────────────────────────
      return res.json({ success: true, applied: "none", providerStatus, message: "Le fournisseur n'a pas encore confirmé le statut final" });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // Re-déclenche un paiement en attente auprès du fournisseur choisi par l'admin
  app.post("/api/admin/transactions/:id/trigger", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const provider = String(req.body?.provider || "").toLowerCase();
      if (!["sendavapay", "mbiyo", "omnipay", "seapay"].includes(provider)) {
        return res.status(400).json({ message: "Veuillez choisir un fournisseur valide (SendavaPay, Mbiyo, OmniPay ou SeaPay)" });
      }
      const pp = await storage.getPendingPaymentById(id);
      if (!pp) return res.status(404).json({ message: "Paiement en cours introuvable" });
      const merchant = await storage.getMerchantById(pp.merchantId);
      if (!merchant) return res.status(404).json({ message: "Marchand introuvable" });
      const callbackBaseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;

      if (provider === "omnipay") {
        const omnipayApiKey = await getOmnipayApiKey();
        if (!omnipayApiKey) return res.status(500).json({ message: "Clé API OmniPay non configurée" });
        const reference = omnipayGenerateRef();
        const msisdn = prependDialCode(pp.payerPhone || "", pp.country);
        const nameParts = (pp.payerName || "Client WestPay").split(" ");
        const fName = nameParts[0] || "Client";
        const lName = nameParts.slice(1).join(" ") || "WestPay";
        const omnipayOperator = toOmnipayOperatorCode(pp.paymentMethod) || undefined;
        const returnUrl = `${callbackBaseUrl}/pay?ref=${encodeURIComponent(reference)}&omnipay_status=complete`;
        const autoOtp = String(Math.floor(1000 + Math.random() * 9000));
        const result = await omnipayInitiatePayment({
          apikey: omnipayApiKey,
          msisdn,
          amount: pp.amount,
          reference,
          first_name: fName,
          last_name: lName,
          otp: autoOtp,
          operator: omnipayOperator,
          return_url: omnipayOperator === "wave" ? returnUrl : undefined,
        });
        if (result.success !== 1) {
          const errorMsg = OMNIPAY_ERRORS[result.code || 0] || result.message || "Échec inconnu";
          return res.status(502).json({ success: false, message: errorMsg });
        }
        await financialDb.update(pendingPayments).set({
          status: "omnipay_pending",
          omnipayReference: reference,
          omnipayTxId: result.id ? String(result.id) : null,
          omnipayPaymentUrl: result.payment_url || null,
          gateway: "westpay",
        }).where(eq(pendingPayments.id, id));
        console.log(`[ADMIN TRIGGER TX] Paiement #${id} re-déclenché chez OmniPay — ref=${reference}`);
        return res.json({ success: true, provider: "omnipay", reference, paymentUrl: result.payment_url });
      }

      if (provider === "sendavapay") {
        const sendavaApiKey = await getSendavaApiKey();
        if (!sendavaApiKey) return res.status(500).json({ message: "Clé API SendavaPay non configurée" });
        const reference = sendavaGenerateRef();
        const msisdnFull = "+" + prependDialCode(pp.payerPhone || "", pp.country);
        const countryCode = SENDAVAPAY_COUNTRY_CODES[pp.country] || "";
        const currency = SENDAVAPAY_CURRENCY_MAP[countryCode] || "XOF";
        const sendavaOperator = toSendavaOperator(pp.paymentMethod || "", countryCode);
        const result = await sendavaCreatePayment(sendavaApiKey, {
          amount: pp.amount,
          phoneNumber: msisdnFull,
          operator: sendavaOperator,
          country: countryCode,
          currency,
          description: `Paiement WestPay (relance admin) - ${merchant.name}`,
          externalReference: reference,
          callbackUrl: `${callbackBaseUrl}/api/sendavapay/callback`,
        });
        if (!result.success) {
          return res.status(502).json({ success: false, message: (result as any).error || (result as any).message || "Échec inconnu" });
        }
        await financialDb.update(pendingPayments).set({
          status: "omnipay_pending",
          omnipayReference: reference,
          gateway: "sendavapay",
        }).where(eq(pendingPayments.id, id));
        console.log(`[ADMIN TRIGGER TX] Paiement #${id} re-déclenché chez SendavaPay — ref=${reference}`);
        return res.json({ success: true, provider: "sendavapay", reference });
      }

      if (provider === "mbiyo") {
        const mbiyoApiKey = await getMbiyoApiKey();
        if (!mbiyoApiKey) return res.status(500).json({ message: "Clé API Mbiyo non configurée" });
        const reference = mbiyoGenerateRef();
        const msisdnMbiyo = prependDialCode(pp.payerPhone || "", pp.country);
        const countryCode = mbiyoCountryCode(pp.country);
        const currency = mbiyoCurrency(pp.country);
        const network = mbiyoNetwork(pp.paymentMethod || "");
        const result = await mbiyoInitiatePayin({
          apiKey: mbiyoApiKey,
          amount: pp.amount,
          currency,
          orderId: reference,
          callbackUrl: `${callbackBaseUrl}/api/mbiyo/callback`,
          network,
          phoneNumber: msisdnMbiyo,
          countryCode,
        });
        if (result.status !== "success" && result.status !== "pending") {
          return res.status(502).json({ success: false, message: result.message || "Échec inconnu" });
        }
        await financialDb.update(pendingPayments).set({
          status: "omnipay_pending",
          omnipayReference: reference,
          gateway: "mbiyo",
        }).where(eq(pendingPayments.id, id));
        console.log(`[ADMIN TRIGGER TX] Paiement #${id} re-déclenché chez Mbiyo — ref=${reference}`);
        return res.json({ success: true, provider: "mbiyo", reference });
      }

      if (provider === "seapay") {
        const [spMerchantId, spApiKey] = await Promise.all([getSeapayMerchantId(pp.country), getSeapayApiKey(pp.country)]);
        if (!spMerchantId || !spApiKey) return res.status(500).json({ message: "Clé API SeaPay non configurée" });
        const reference = seapayGenerateRef();
        const currency = SEAPAY_CURRENCY_COUNTRY[pp.country] || "USD";
        const operatorRecord = pp.paymentMethod ? await storage.getWithdrawalOperatorByNameAndCountry(pp.paymentMethod, pp.country) : null;
        const channelCode = operatorRecord?.seapayCode || undefined;
        const returnUrl = `${callbackBaseUrl}/pay?ref=${encodeURIComponent(reference)}&omnipay_status=complete`;
        const result = await seapayPayin({
          merchantId: spMerchantId,
          currency,
          amount: pp.amount,
          orderId: reference,
          notifyUrl: `${callbackBaseUrl}/api/seapay/callback`,
          channelCode,
          returnUrl,
          customerPhone: pp.payerPhone || undefined,
          customerName: pp.payerName || undefined,
        }, spApiKey);
        if (result.code !== 200 || !result.data) {
          return res.status(502).json({ success: false, message: result.msg || "Échec inconnu" });
        }
        await financialDb.update(pendingPayments).set({
          status: "omnipay_pending",
          omnipayReference: reference,
          omnipayTxId: result.data.trade_no || null,
          omnipayPaymentUrl: result.data.payment_url || null,
          gateway: "seapay",
        }).where(eq(pendingPayments.id, id));
        console.log(`[ADMIN TRIGGER TX] Paiement #${id} re-déclenché chez SeaPay — ref=${reference}`);
        return res.json({ success: true, provider: "seapay", reference, paymentUrl: result.data.payment_url });
      }

      if (provider === "clapay") {
        const cpToken = await getClapayApiKey();
        if (!cpToken) return res.status(500).json({ message: "Clé API ClaPay non configurée" });
        const reference = clapayGenerateRef();
        const countryCode = clapayCountryCode(pp.country);
        const currency = clapayCurrency(pp.country);
        const operatorRecord = pp.paymentMethod ? await storage.getWithdrawalOperatorByNameAndCountry(pp.paymentMethod, pp.country) : null;
        const clapayAdminOpCode = (operatorRecord as any)?.clapayCode || pp.paymentMethod || "";
        const adminTunnel = clapaySelectTunnel(clapayAdminOpCode);

        let adminLocalPhone = "";
        if (adminTunnel === "API") {
          const phoneCheck = clapayValidatePhone(pp.payerPhone || "", countryCode);
          if (!phoneCheck.ok) {
            return res.status(400).json({ success: false, message: phoneCheck.error });
          }
          adminLocalPhone = phoneCheck.localPhone;
        }

        const adminNameParts = (pp.payerName || "Client RobotPay").split(" ");
        const adminAdditionalInfos: Record<string, string> = {
          customer_firstname: adminNameParts[0] || "Client",
          customer_lastname:  adminNameParts.slice(1).join(" ") || "RobotPay",
        };
        if (adminTunnel === "API" && adminLocalPhone) {
          adminAdditionalInfos.customer_phone = adminLocalPhone;
        }

        const result = await clapayInitiatePayin(cpToken, {
          transaction_id: reference,
          amount: pp.amount,
          country_code: countryCode,
          operators_code: clapayAdminOpCode ? [clapayAdminOpCode] : [],
          method: "MERCHANT",
          tunnel: adminTunnel,
          callback_url: `${callbackBaseUrl}/api/clapay/callback`,
          return_url: `${callbackBaseUrl}/pay?ref=${encodeURIComponent(reference)}&omnipay_status=complete`,
          additional_infos: adminAdditionalInfos,
        });
        if (!result.success) {
          return res.status(502).json({ success: false, message: result.message || "Échec ClaPay" });
        }
        await financialDb.update(pendingPayments).set({
          status: "omnipay_pending",
          omnipayReference: reference,
          omnipayTxId: result.data?.signature || null,
          omnipayPaymentUrl: result.data?.payment_url || null,
          gateway: "clapay",
        }).where(eq(pendingPayments.id, id));
        console.log(`[ADMIN TRIGGER TX] Paiement #${id} re-déclenché chez ClaPay — ref=${reference}`);
        return res.json({ success: true, provider: "clapay", reference, paymentUrl: result.data?.payment_url });
      }
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.patch("/api/admin/merchants/:id/fee-exempt", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { feeExempt, customFeeRate } = req.body;
      if (typeof feeExempt !== "boolean") return res.status(400).json({ message: "Valeur invalide" });
      if (customFeeRate !== undefined && customFeeRate !== null && (typeof customFeeRate !== "number" || customFeeRate < 0 || customFeeRate > 100)) {
        return res.status(400).json({ message: "Taux personnalisé invalide (0–100)" });
      }
      const update: any = { feeExempt };
      update.customFeeRate = (customFeeRate === null || customFeeRate === undefined || customFeeRate === "") ? null : Number(customFeeRate);
      await storage.updateMerchant(id, update);
      res.json({ success: true, feeExempt, customFeeRate: update.customFeeRate });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.patch("/api/admin/merchants/:id/withdrawals-disabled", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { withdrawalsDisabled } = req.body;
      if (typeof withdrawalsDisabled !== "boolean") return res.status(400).json({ message: "Valeur invalide" });
      await storage.updateMerchant(id, { withdrawalsDisabled });
      if (!withdrawalsDisabled) {
        await storage.setSetting(`wd_retry_${id}`, JSON.stringify({ count: 0 }));
      }
      res.json({ success: true, withdrawalsDisabled });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ─── Opérateurs de reversement ──────────────────────────────────────────

  app.get("/api/admin/withdrawal-operators", authMiddleware("admin"), async (_req, res) => {
    try {
      const ops = await storage.getWithdrawalOperators();
      res.json(ops);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
        clapayCode: (req.body.clapayCode || "")?.trim() || null,
        active: active !== false,
        maintenanceAll: false,
        maintenanceDeposits: false,
        maintenanceWithdrawals: false,
        maintenancePaymentLinks: false,
        maintenanceApiPayment: false,
      });
      res.json(op);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
        ...(req.body.clapayCode !== undefined && { clapayCode: (req.body.clapayCode || "")?.trim() || null }),
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.delete("/api/admin/withdrawal-operators/:id", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteWithdrawalOperator(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.delete("/api/admin/crypto-aggregators/:id", authMiddleware("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteCryptoAggregator(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      const callbackUrl = `${process.env.APP_URL || "http://Westpay.cfd"}/api/oxapay/callback`;
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
        paymentUrl: `${process.env.APP_URL || "http://Westpay.cfd"}/pay/crypto/${invoiceResult.trackId}`,
      });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      const invoiceCallbackUrl = callbackUrl || `${process.env.APP_URL || "http://Westpay.cfd"}/api/oxapay/callback`;
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
        paymentUrl: `${process.env.APP_URL || "http://Westpay.cfd"}/pay/crypto/${invoiceResult.trackId}`,
        transaction: {
          id: cryptoTx.id,
          trackId: cryptoTx.trackId,
          amount: cryptoTx.amount,
          currency: cryptoTx.currency,
          status: cryptoTx.status,
        },
      });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ─── Crypto : transactions marchand ─────────────────────────────────────

  app.get("/api/merchant/crypto/transactions", cryptoApiKeyAuthMiddleware, async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const txs = await storage.getCryptoTransactions(merchantId);
      res.json(txs);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ─── Crypto : soldes marchand par devise ─────────────────────────────────

  app.get("/api/merchant/crypto/balances", cryptoApiKeyAuthMiddleware, async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const balances = await storage.getCryptoBalances(merchantId);
      res.json(balances);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/merchant/crypto/withdrawals", cryptoApiKeyAuthMiddleware, async (req, res) => {
    try {
      const merchantId = (req as any).user.id;
      const reqs = await storage.getCryptoWithdrawalRequestsByMerchant(merchantId);
      res.json(reqs);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ─── Crypto : retraits (admin) ────────────────────────────────────────────

  app.get("/api/admin/crypto/withdrawals", authMiddleware("admin"), async (_req, res) => {
    try {
      const reqs = await storage.getAllCryptoWithdrawalRequests();
      res.json(reqs);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ─── Crypto : transactions admin ─────────────────────────────────────────

  app.get("/api/admin/crypto/transactions", authMiddleware("admin"), async (_req, res) => {
    try {
      const txs = await storage.getCryptoTransactions();
      res.json(txs);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // Admin: désactiver SDK pour un marchand
  app.post("/api/admin/sdk/merchants/:id/disable", authMiddleware("admin"), async (req, res) => {
    try {
      const merchantId = parseInt(req.params.id);
      await storage.disableMerchantSdk(merchantId);
      res.json({ message: "SDK désactivé" });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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
      res.status(500).json({ message: safeErrMsg(err) });
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

      const appUrl = process.env.APP_URL || "http://Westpay.cfd";
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

      const feeRate = merchant.customFeeRate != null
        ? merchant.customFeeRate / 100
        : merchant.feeExempt ? 0 : getWithdrawalFeeRate(countryName);
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

      const appUrl = process.env.APP_URL || "http://Westpay.cfd";
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

  // ─── Userbot (Customer Service Account) ──────────────────────────────────────

  app.get("/api/admin/userbot/status", authMiddleware("admin"), async (_req, res) => {
    try {
      const { getUserbotStatus } = await import("./userbot");
      const status = await getUserbotStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/admin/userbot/start-auth", authMiddleware("admin"), async (req, res) => {
    try {
      const { startUbotAuth } = await import("./userbot");
      const phone = (req.body.phone as string) || process.env.USERBOT_PHONE || "+15843334306";
      const result = await startUbotAuth(phone);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/admin/userbot/complete-auth", authMiddleware("admin"), async (req, res) => {
    try {
      const { completeUbotAuth } = await import("./userbot");
      const { code, password } = req.body as { code: string; password?: string };
      if (!code) return res.status(400).json({ success: false, message: "Code is required" });
      const result = await completeUbotAuth(code, password);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/admin/userbot/disconnect", authMiddleware("admin"), async (_req, res) => {
    try {
      const { disconnectUserbot } = await import("./userbot");
      await disconnectUserbot();
      res.json({ success: true, message: "Userbot disconnected" });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.get("/api/admin/userbot/delay", authMiddleware("admin"), async (_req, res) => {
    try {
      const { getResponseDelaySetting } = await import("./userbot");
      const value = await getResponseDelaySetting();
      res.json({ value });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  app.post("/api/admin/userbot/delay", authMiddleware("admin"), async (req, res) => {
    try {
      const { value } = req.body;
      if (typeof value !== "string") return res.status(400).json({ message: "value required" });
      const { setResponseDelay } = await import("./userbot");
      await setResponseDelay(value);
      res.json({ success: true, value });
    } catch (err: any) {
      res.status(500).json({ message: safeErrMsg(err) });
    }
  });

  // ─── Knowledge Base (RAG) Routes ──────────────────────────────────────────────
  app.get("/api/admin/knowledge", authMiddleware("admin"), async (_req, res) => {
    try {
      const { listKnowledge } = await import("./knowledge");
      res.json(await listKnowledge());
    } catch (err: any) { res.status(500).json({ message: safeErrMsg(err) }); }
  });

  app.post("/api/admin/knowledge", authMiddleware("admin"), async (req, res) => {
    try {
      const { category, title, content } = req.body;
      if (!title?.trim() || !content?.trim()) return res.status(400).json({ message: "title and content required" });
      const { addKnowledge } = await import("./knowledge");
      const id = await addKnowledge(category || "general", title.trim(), content.trim());
      res.json({ success: true, id });
    } catch (err: any) { res.status(500).json({ message: safeErrMsg(err) }); }
  });

  app.put("/api/admin/knowledge/:id", authMiddleware("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { category, title, content, active } = req.body;
      const { addKnowledge, toggleKnowledge } = await import("./knowledge");
      if (typeof active === "boolean") {
        await toggleKnowledge(id, active);
      } else {
        if (!title?.trim() || !content?.trim()) return res.status(400).json({ message: "title and content required" });
        await addKnowledge(category || "general", title.trim(), content.trim(), id);
      }
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: safeErrMsg(err) }); }
  });

  app.delete("/api/admin/knowledge/:id", authMiddleware("admin"), async (req, res) => {
    try {
      const { deleteKnowledge } = await import("./knowledge");
      await deleteKnowledge(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: safeErrMsg(err) }); }
  });

  app.post("/api/admin/knowledge/reembed", authMiddleware("admin"), async (_req, res) => {
    try {
      const { reembedAll } = await import("./knowledge");
      reembedAll().catch(console.error);
      res.json({ success: true, message: "Re-embedding started in background" });
    } catch (err: any) { res.status(500).json({ message: safeErrMsg(err) }); }
  });

  return httpServer;
}
