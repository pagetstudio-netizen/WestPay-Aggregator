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
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
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
    console.log("Migration skipped:", (err as any).message);
  }

  try {
    await seedDatabase();
  } catch (err) {
    console.log("Seed skipped or already done:", (err as any).message);
  }

  await registerRoutes(httpServer, app);

  const { initTelegramBot, setupWebhook, registerWebhookUrl, startPolling } = await import("./telegram-bot");
  const { storage } = await import("./storage");

  const telegramBot = initTelegramBot();
  if (telegramBot) {
    if (process.env.NODE_ENV === "production") {
      let webhookSecret = await storage.getSetting("telegram_webhook_secret");
      if (!webhookSecret) {
        const { randomBytes } = await import("crypto");
        webhookSecret = randomBytes(24).toString("hex");
        await storage.setSetting("telegram_webhook_secret", webhookSecret);
      }
      const webhookUrl = `${process.env.APP_URL || "https://west-pay-aggregator-1--beryowone.replit.app"}/api/telegram/webhook/${webhookSecret}`;
      setupWebhook(app, webhookSecret);
      await registerWebhookUrl(webhookUrl);
    } else {
      // En développement : activer le polling pour recevoir les commandes du groupe
      await telegramBot.telegram.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
      startPolling();
      console.log("[TELEGRAM] Mode developpement — polling actif (envoi + reception)");
    }
  }

  // Initialize dedicated OTP bot (separate token, separate instance)
  const { initOtpBot } = await import("./telegram-otp-bot");
  await initOtpBot();

  // Réconciliation automatique des paiements bloqués
  const { startReconciliationJob } = await import("./reconciliation");
  startReconciliationJob();

  // Userbot — customer service agent (real Telegram account)
  const { initUserbot } = await import("./userbot");
  await initUserbot();

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

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
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
})();
