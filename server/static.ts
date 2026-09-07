import express, { type Express } from "express";
import fs from "fs";
import path from "path";

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
  app.get("/api-docs", (_req, res) => {
    res.status(404).type("text").send("Not Found");
  });

  // Ancienne URL de connexion marchand définitivement désactivée.
  app.get("/merchant/login", (_req, res) => {
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
    const hasQueryParameters = Object.keys(req.query || {}).length > 0;

    // Les racines seules sont volontairement neutres. Le DNS ne pouvant pas
    // distinguer une URL avec/sans query string, on bloque au niveau HTTP.
    const isReservedSubdomainRoot =
      reqPath === "/" &&
      (
        requestHost === "checkout1.westpay.cfd" ||
        requestHost === "dashboard.westpay.cfd" ||
        requestHost === "link.westpay.cfd" ||
        requestHost === "payment.bank2.westpay.cfd"
      );
    if (isReservedSubdomainRoot && !hasQueryParameters) {
      return res.status(404).type("text").send("Not Found");
    }

    // Bank 1 ne doit pas charger le shell SPA sur /pay sans paramètres.
    // Les liens réels portent merchant/amount/country, ou ref/omnipay_status
    // lors du retour d'un paiement Wave.
    const isBareBank1Payment =
      requestHost === "checkout1.westpay.cfd" &&
      (reqPath === "/pay" || /^\/pay\/[^/]+$/.test(reqPath));
    if (isBareBank1Payment && !hasQueryParameters) {
      return res.status(404).type("text").send("Not Found");
    }

    const isLegacyBank1CheckoutHost =
      requestHost === "westpay.cfd" || requestHost === "www.westpay.cfd";
    const isLegacyBank1CheckoutPath =
      reqPath === "/pay" || /^\/pay\/[^/]+$/.test(reqPath);
    if (isLegacyBank1CheckoutHost && isLegacyBank1CheckoutPath) {
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
