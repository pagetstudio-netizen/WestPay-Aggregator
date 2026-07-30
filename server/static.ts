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

  // Sert index.html pour toutes les routes SPA — SANS injection de window.__ADMIN_PATH__.
  // Le chemin admin n'est JAMAIS exposé dans le HTML.
  // Le client utilise POST /api/auth/admin/verify-path pour vérifier le chemin
  // sans que le slug soit jamais révélé (réponse : { isAdminPath: true|false } uniquement).
  app.get("/{*path}", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(indexHtml);
  });
}
