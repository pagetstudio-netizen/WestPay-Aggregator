import express, { type Express } from "express";
import fs from "fs";
import path from "path";

function getFallbackHost(requestHost: string): string | undefined {
  switch (requestHost) {
    case "westpay.cfd": return "westpay.cdf";
    case "dashboard.westpay.cfd": return "dashboard.westpay.cdf";
    case "link.westpay.cfd": return "link.westpay.cdf";
    case "payment.bank2.westpay.cfd": return "payment.bank2.westpay.cfd";
    case "checkout1.westpay.cfd": return "checkout1.westpay.cfd";
    default: return undefined;
  }
}

function fallbackRedirectUrl(host: string, originalUrl: string): string {
  const parsedUrl = new URL(originalUrl, "https://westpay.local");
  return `https://${host}${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
}

const BANK2_PAYMENT_QUERY_KEYS = [
  "merchant", "link", "linkId", "amount", "country", "redirect", "ref",
  "payment_status", "phone", "payerPhone", "name", "payerName",
];

const CHECKOUT_PAYMENT_QUERY_KEYS = [
  "merchant", "amount", "country", "redirect", "payment_status",
  "clapay_return", "ref", "phone", "payerPhone", "name", "payerName",
];

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  const indexHtmlPath = path.resolve(distPath, "index.html");
  const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");

  // Serve static assets (JS, CSS, images) — index.html excluded (served below)
  app.use(express.static(distPath, { index: false }));

  // L'ancienne URL est définitivement désactivée sur le domaine principal.
  // La documentation est disponible uniquement via secure.docs.westpay.cfd.
  app.get("/api-docs", (req, res) => {
    const requestHost = (req.hostname || "").toLowerCase();
    const fallbackHost = getFallbackHost(requestHost);
    if (fallbackHost) {
      return res.redirect(302, fallbackRedirectUrl(fallbackHost, req.originalUrl));
    }
    res.status(404).type("text").send("Not Found");
  });

  // Ancienne URL de connexion marchand définitivement désactivée.
  app.get("/merchant/login", (req, res) => {
    const requestHost = (req.hostname || "").toLowerCase();
    const fallbackHost = getFallbackHost(requestHost);
    if (fallbackHost) {
      return res.redirect(302, fallbackRedirectUrl(fallbackHost, req.originalUrl));
    }
    res.status(404).type("text").send("Not Found");
  });

  // Sert index.html pour toutes les routes SPA.
  // Si la requête correspond au chemin admin, on injecte window.__IS_ADMIN_PATH__=true
  // — uniquement un booléen, JAMAIS le slug lui-même dans le HTML.
  // Le client lit ce flag pour savoir qu'il est sur la route admin et utilise
  // l'URL courante comme chemin de base, sans connaître le slug.
  app.get("/{*path}", (req, res, next) => {
    // Ne jamais intercepter les routes API — elles sont enregistrées plus tard
    // (après l'init DB) et doivent recevoir la requête via next().
    if (req.path.startsWith("/api/") || req.path === "/api") return next();
    const slug = process.env.ADMIN_SLUG || "";
    const reqPath = req.path.replace(/\/+$/, "") || "/"; // normalise le trailing slash

    // Les sous-domaines publics ne doivent pas exposer l'application lorsqu'ils
    // sont ouverts seuls. Les URL fonctionnelles gardent leurs paramètres ou
    // leur identifiant dans le chemin (ex: /pay?merchant=... ou /link/abc).
    const requestHost = (req.hostname || "").toLowerCase();
    const fallbackHost = getFallbackHost(requestHost);
    const requestSearchParams = new URL(req.originalUrl, "https://westpay.local").searchParams;
    const hasRecognizedBank2Parameters = BANK2_PAYMENT_QUERY_KEYS.some(
      (key) => Boolean(requestSearchParams.get(key)),
    );
    const hasRecognizedCheckoutParameters = CHECKOUT_PAYMENT_QUERY_KEYS.some(
      (key) => Boolean(requestSearchParams.get(key)),
    );

    // Les routes de paiement restent sur .cfd seulement avec leurs paramètres
    // fonctionnels. Les racines de sous-domaines sans route reconnue vont vers .cdf.
    const isReservedSubdomainRoot =
      reqPath === "/" &&
      fallbackHost !== undefined &&
      requestHost !== "westpay.cfd";
    const isRecognizedBank2PaymentRoot =
      requestHost === "payment.bank2.westpay.cfd" &&
      reqPath === "/" &&
      hasRecognizedBank2Parameters;
    if (isReservedSubdomainRoot && !isRecognizedBank2PaymentRoot) {
      return res.redirect(302, fallbackRedirectUrl(fallbackHost, req.originalUrl));
    }

    // Bank 1 ne doit pas charger le shell SPA sur /pay sans paramètres.
    // Les liens réels portent merchant/amount/country, ou ref/payment_status
    // lors du retour d'un paiement avec redirection.
    const isBareBank1Payment =
      requestHost === "checkout1.westpay.cfd" &&
      (reqPath === "/pay" || /^\/pay\/[^/]+$/.test(reqPath));
    if (isBareBank1Payment && !hasRecognizedCheckoutParameters) {
      if (fallbackHost) {
        return res.redirect(302, fallbackRedirectUrl(fallbackHost, req.originalUrl));
      }
      return res.status(404).type("text").send("Not Found");
    }

    const isLegacyBank1CheckoutHost =
      requestHost === "westpay.cfd" || requestHost === "www.westpay.cfd";
    const isLegacyBank1CheckoutPath =
      reqPath === "/pay" || /^\/pay\/[^/]+$/.test(reqPath);
    if (isLegacyBank1CheckoutHost && isLegacyBank1CheckoutPath) {
      if (requestHost === "westpay.cfd" && fallbackHost) {
        return res.redirect(302, fallbackRedirectUrl(fallbackHost, req.originalUrl));
      }
      return res.status(404).type("text").send("Not Found");
    }

    const isAdminPath =
      slug !== "" &&
      (reqPath === `/${slug}` || reqPath.startsWith(`/${slug}/`));

    const html = isAdminPath
      ? indexHtml.replace(
          "</head>",
          `<script>window.__IS_ADMIN_PATH__=true;</script></head>`,
        )
      : indexHtml;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(html);
  });
}
