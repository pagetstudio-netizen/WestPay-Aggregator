// Charge .env en premier — avant toute lecture de process.env.
// Sur Plesk, les variables peuvent être écrites dans un fichier .env
// plutôt que passées directement au processus Node.js.
// override:false → process.env existant a toujours la priorité.
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
// En production (CJS esbuild) __dirname est injecté comme global Node.js.
// En dev ESM (tsx) il n'existe pas — seul loadEnv({ override:false }) est nécessaire
// car process.cwd() pointe déjà sur la racine projet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _dirname: string | undefined = (globalThis as any).__dirname;
if (_dirname) {
  // Tourne depuis dist/ (Plesk) : charge .env à la racine projet (dossier parent)
  loadEnv({ path: resolve(_dirname, "..", ".env"), override: false });
}
// Charge .env depuis le dossier courant (fallback dev ou racine Plesk)
loadEnv({ override: false });

import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";
import { createServer } from "http";
// NOTE: routes et static sont importés dynamiquement plus bas (dans l'IIFE async)
// pour garantir que httpServer.listen() s'exécute AVANT tout code module-level
// de ces fichiers (db.ts throws, mkdirSync, SESSION_SECRET check, etc.).

const app = express();
// Trust exactement 1 niveau de proxy (Replit reverse-proxy).
// "true" ferait confiance à TOUS les X-Forwarded-For envoyés par le client → spoofing d'IP possible.
// "1" signifie : seul le dernier proxy connu est fiable — le client ne peut pas forger req.ip.
app.set("trust proxy", 1);

// ── IP réelle derrière Cloudflare ─────────────────────────────────────────────
// En production (Plesk), le site passe par Cloudflare : req.ip vaut l'IP de
// Cloudflare (ex: 104.23.x.x) et non celle du visiteur → géolocalisation fausse
// (tous les visiteurs paraissaient "hors Afrique"). Cloudflare transmet la vraie
// IP dans l'en-tête CF-Connecting-IP, qu'on utilise en priorité quand présent.
app.use((req, _res, next) => {
  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string" && cfIp.length > 0 && cfIp.length < 64) {
    Object.defineProperty(req, "ip", {
      value: cfIp.replace(/^::ffff:/, "").trim(),
      configurable: true,
    });
  }
  next();
});

// ── Security headers — couche Helmet (baseline globale) ──────────────────────
// La couche complète est dans registerRoutes() (routes.ts) qui s'exécute après
// et surchargé les valeurs Helmet avec des directives plus strictes.
app.use(helmet({
  contentSecurityPolicy: false,   // géré manuellement ci-dessous (plus complet)
  frameguard: { action: "deny" },
  hidePoweredBy: true,
  hsts: false,                    // géré manuellement ci-dessous
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "same-site" },
}));
// X-Powered-By supprimé explicitement (double protection)
app.disable("x-powered-by");

// ── Security headers appliqués à TOUTES les réponses ─────────────────────────
// Ce bloc est intentionnellement dans index.ts (et non routes.ts) pour garantir
// qu'il s'exécute avant serveStatic en production. serveStatic est enregistré
// dans une IIFE asynchrone avant registerRoutes → sans ce bloc ici, les pages
// HTML statiques (ex : /) partiraient sans HSTS / CSP / Permissions-Policy.
app.use((_req, res, next) => {
  // HSTS : uniquement en production (évite les boucles en dev HTTP)
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  // Permissions-Policy : désactiver les APIs sensibles du navigateur
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");

  // Content-Security-Policy
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

  next();
});

// ── Cookie parser (requis pour lire les cookies httpOnly d'authentification) ──
app.use(cookieParser());
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Serve uploaded operator logos (and other uploads)
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        // Redact sensitive fields before logging
        const SENSITIVE_KEYS = new Set([
          "token", "accessToken", "refreshToken", "apiKey", "api_key",
          "secret", "webhookSecret", "password", "hash", "privateKey",
        ]);
        const redacted = JSON.parse(JSON.stringify(capturedJsonResponse));
        const redactObj = (obj: Record<string, any>) => {
          for (const key of Object.keys(obj)) {
            if (SENSITIVE_KEYS.has(key)) {
              obj[key] = "[REDACTED]";
            } else if (obj[key] && typeof obj[key] === "object") {
              redactObj(obj[key]);
            }
          }
        };
        if (typeof redacted === "object" && redacted !== null) redactObj(redacted);
        logLine += ` :: ${JSON.stringify(redacted)}`;
      }

      log(logLine);
    }
  });

  next();
});

// ── État d'initialisation interne ───────────────────────────────────────────
const bootState: {
  status: "starting" | "ready" | "error";
  errors: string[];
  steps: Record<string, "ok" | "error" | "pending">;
} = {
  status: "starting",
  errors: [],
  steps: {
    env: "pending",
    db_migrations: "pending",
    db_seed: "pending",
    routes: "pending",
    static: "pending",
  },
};

// Démarrer le serveur HTTP EN PREMIER — avant toute initialisation.
const port = parseInt(process.env.PORT || "5000", 10);

// Handler d'erreur — évite que EADDRINUSE ou autre erreur réseau crashe le process
httpServer.on("error", (err: any) => {
  const msg = `[FATAL] httpServer error: ${err.message} (code: ${err.code})`;
  console.error(msg);
  bootState.status = "error";
  bootState.errors.push(msg);
  // Écrire dans un fichier log lisible depuis le gestionnaire Plesk
  try {
    const fs = require("fs");
    const logPath = require("path").resolve(
      (globalThis as any).__dirname ?? process.cwd(), "..", "crash.log"
    );
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
});

// Démarrer l'écoute — sans reusePort (incompatible avec certains setups Passenger)
httpServer.listen(port, "0.0.0.0", () => {
  log(`serving on port ${port}`);
});

// ── Gate API : attendre la fin de l'init avant de traiter les requêtes /api ──
// Sur Plesk/Passenger, le process démarre à la demande : une requête API peut
// arriver AVANT que registerRoutes() ait tourné → 404 HTML → erreur JSON côté
// client. Ce middleware fait patienter la requête (max 30s) jusqu'à ce que les
// routes soient prêtes, au lieu de la rejeter.
let routesReady = false;
let resolveRoutesReady: () => void = () => {};
const routesReadyPromise = new Promise<void>((r) => { resolveRoutesReady = r; });

app.use("/api", async (req, res, next) => {
  if (routesReady) return next();
  if (bootState.status === "error") {
    return res.status(503).json({
      message: "Serveur indisponible : sa configuration n'est pas terminée. Contactez l'administrateur.",
    });
  }
  const timedOut = await Promise.race([
    routesReadyPromise.then(() => false),
    new Promise<boolean>((r) => setTimeout(() => r(true), 30_000)),
  ]);
  if (timedOut && !routesReady) {
    return res.status(503).json({
      message: bootState.status === "error"
        ? "Serveur indisponible : sa configuration n'est pas terminée. Contactez l'administrateur."
        : "Serveur en cours de démarrage, réessayez dans quelques secondes.",
    });
  }
  next();
});

// ── PRODUCTION : servir le frontend IMMÉDIATEMENT ─────────────────────────────
// Ne dépend pas de la DB. Sur Plesk/Passenger, le process est démarré à la
// demande : sans ça, la première requête arrive avant la fin de l'init DB et
// reçoit "Cannot GET /". Le catch-all de static.ts laisse passer /api via next().
if (process.env.NODE_ENV === "production") {
  (async () => {
    try {
      const { serveStatic } = await import("./static");
      serveStatic(app);
      bootState.steps.static = "ok";
      log("frontend statique servi (immédiat)");
    } catch (err: any) {
      bootState.steps.static = "error";
      bootState.errors.push(`Static: ${err.message}`);
      console.error("[FATAL] Static setup failed:", err.message);
    }
  })();
}

async function setupDevelopmentFrontend(): Promise<boolean> {
  if (process.env.NODE_ENV === "production") return true;

  try {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
    bootState.steps.static = "ok";
    return true;
  } catch (err: any) {
    bootState.steps.static = "error";
    bootState.errors.push(`Vite: ${err.message}`);
    bootState.status = "error";
    console.error("[FATAL] Vite setup failed:", err.message);
    return false;
  }
}

(async () => {
  // Vérification env
  const missingEnv = ["AUTH_DATABASE_URL", "FINANCIAL_DATABASE_URL", "SESSION_SECRET"]
    .filter(k => !process.env[k]);
  if (missingEnv.length > 0) {
    bootState.steps.env = "error";
    bootState.errors.push(`Missing env vars: ${missingEnv.join(", ")}`);
    bootState.status = "error";
    console.error("[FATAL] Variables manquantes:", missingEnv.join(", "));
    await setupDevelopmentFrontend();
    resolveRoutesReady();
    return; // Ne pas appeler process.exit : le serveur reste disponible pour le frontend
  }
  bootState.steps.env = "ok";

  let runMigrations: () => Promise<void>;
  let seedDatabase: () => Promise<void>;
  try {
    ({ runMigrations } = await import("./db"));
    ({ seedDatabase } = await import("./seed"));
  } catch (err: any) {
    bootState.steps.db_migrations = "error";
    bootState.errors.push(`DB module load: ${err.message}`);
    bootState.status = "error";
    console.error("[FATAL] DB module load failed:", err.message);
    await setupDevelopmentFrontend();
    resolveRoutesReady();
    return;
  }

  try {
    await runMigrations();
    bootState.steps.db_migrations = "ok";
  } catch (err: any) {
    bootState.steps.db_migrations = "error";
    bootState.errors.push(`Migrations: ${err.message}`);
    bootState.status = "error";
    console.error("[FATAL] Migration failed:", err.message);
    await setupDevelopmentFrontend();
    resolveRoutesReady();
    return;
  }

  try {
    await seedDatabase();
    bootState.steps.db_seed = "ok";
  } catch (err: any) {
    bootState.steps.db_seed = "error";
    console.log("Seed skipped or already done:", err.message);
  }

  try {
    const { seedKnowledge } = await import("./knowledge");
    seedKnowledge().catch(e => console.log("[KNOWLEDGE] Seed error:", e.message));
  } catch (err: any) {
    console.log("Knowledge seed skipped:", err.message);
  }

  try {
    // Import dynamique — évite que le code module-level de routes.ts
    // (db import, mkdirSync, SESSION_SECRET check) s'exécute avant httpServer.listen()
    const { registerRoutes } = await import("./routes");
    await registerRoutes(httpServer, app);
    bootState.steps.routes = "ok";
    routesReady = true;
    resolveRoutesReady();
  } catch (err: any) {
    bootState.steps.routes = "error";
    bootState.errors.push(`Routes: ${err.message}`);
    bootState.status = "error";
    console.error("[FATAL] Routes registration failed:", err.message);
    await setupDevelopmentFrontend();
    resolveRoutesReady();
    return;
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    console.error("Internal Server Error:", err);
    if (res.headersSent) return next(err);
    const clientMessage = process.env.NODE_ENV === "production"
      ? (status < 500 ? (err.message || "Erreur de requête") : "Erreur interne du serveur")
      : (err.message || "Internal Server Error");
    return res.status(status).json({ message: clientMessage });
  });

  // En production le frontend est déjà servi (immédiatement après listen()).
  // Ici uniquement le mode dev (Vite middleware).
  if (process.env.NODE_ENV !== "production") {
    if (!(await setupDevelopmentFrontend())) return;
  }

  if (!process.env.ADMIN_SLUG) {
    console.warn("[SECURITY] ADMIN_SLUG non défini — le tableau de bord admin sera inaccessible.");
  } else {
    log(`admin path configured (ADMIN_SLUG is set)`);
  }

  bootState.status = "ready";

  // ── Optional services (failures must never crash the server) ──────────────

  // Telegram main bot
  try {
    const { initTelegramBotFromDb: initTelegramBot, setupWebhook, registerWebhookUrl, startWebhookWatchdog, startPolling } = await import("./telegram-bot");
    const { storage } = await import("./storage");

    const telegramBot = await initTelegramBot();
    if (telegramBot) {
      // Toujours générer/lire le secret et enregistrer la route Express webhook.
      // Cela garantit que la route existe même si le bot démarre en mode polling.
      let webhookSecret = await storage.getSetting("telegram_webhook_secret");
      if (!webhookSecret) {
        const { randomBytes } = await import("crypto");
        webhookSecret = randomBytes(24).toString("hex");
        await storage.setSetting("telegram_webhook_secret", webhookSecret);
      }
      const appUrl = process.env.APP_URL || "https://westpay.cfd";
      const webhookUrl = `${appUrl}/api/telegram/webhook/${webhookSecret}`;

      // Enregistrer la route Express webhook SYSTÉMATIQUEMENT (peu importe le mode).
      // Sans ça, si "Réveiller le bot" est cliqué, Telegram enverrait vers une URL sans route.
      setupWebhook(app, webhookSecret);

      // Mode production : NODE_ENV=production OU APP_URL défini sans REPLIT_DEV_DOMAIN (= Plesk/serveur dédié)
      const isProductionEnv = process.env.NODE_ENV === "production" ||
        (!process.env.REPLIT_DEV_DOMAIN && !!process.env.APP_URL);

      if (isProductionEnv) {
        console.log(`[TELEGRAM] Mode production (webhook) — URL : ${webhookUrl}`);
        await registerWebhookUrl(webhookUrl);
        startWebhookWatchdog(webhookUrl);
      } else {
        // En dev Replit : NE PAS supprimer le webhook — cela couperait la production.
        // On tente le polling ; si un webhook de prod est actif, la 409 est ignorée silencieusement.
        startPolling();
        console.log("[TELEGRAM] Mode developpement — polling actif (envoi + reception)");
      }
    }
  } catch (err: any) {
    console.error("[TELEGRAM] Init failed (non-fatal):", err.message);
  }

  // OTP bot
  try {
    const { initOtpBot } = await import("./telegram-otp-bot");
    await initOtpBot();
  } catch (err: any) {
    console.error("[OTP BOT] Init failed (non-fatal):", err.message);
  }

  // Reconciliation job
  try {
    const { startReconciliationJob } = await import("./reconciliation");
    startReconciliationJob();
  } catch (err: any) {
    console.error("[RECONCILIATION] Init failed (non-fatal):", err.message);
  }

  // Userbot — customer service agent
  try {
    const { initUserbot } = await import("./userbot");
    await initUserbot();
  } catch (err: any) {
    console.error("[USERBOT] Init failed (non-fatal):", err.message);
  }

  // API health monitor — Telegram alert on key failure / recovery
  try {
    const { startApiHealthMonitor } = await import("./api-health-monitor");
    startApiHealthMonitor();
  } catch (err: any) {
    console.error("[HEALTH] Init failed (non-fatal):", err.message);
  }
})();
