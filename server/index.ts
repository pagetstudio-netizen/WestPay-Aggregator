import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import path from "path";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
// Trust the first proxy (Replit / reverse proxy) so req.ip returns the real client IP
app.set("trust proxy", true);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,       // Vite handles CSP in dev; Nginx in prod
  crossOriginEmbedderPolicy: false,   // Required for canvas/WebGL fingerprinting
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
  next();
});
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

(async () => {
  const { pool, runMigrations } = await import("./db");
  const { seedDatabase } = await import("./seed");

  try {
    await runMigrations();
  } catch (err) {
    console.error("[FATAL] Migration failed — cannot start with incomplete schema:", (err as any).message);
    process.exit(1);
  }

  try {
    await seedDatabase();
  } catch (err) {
    console.log("Seed skipped or already done:", (err as any).message);
  }

  try {
    const { seedKnowledge } = await import("./knowledge");
    seedKnowledge().catch(e => console.log("[KNOWLEDGE] Seed error:", e.message));
  } catch (err) {
    console.log("Knowledge seed skipped:", (err as any).message);
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Start listening FIRST — optional services initialized after
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  // ── Optional services (failures must never crash the server) ──────────────

  // Telegram main bot
  try {
    const { initTelegramBotFromDb: initTelegramBot, setupWebhook, registerWebhookUrl, startPolling } = await import("./telegram-bot");
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
      const appUrl = process.env.APP_URL || "http://Westpay.cfd";
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
