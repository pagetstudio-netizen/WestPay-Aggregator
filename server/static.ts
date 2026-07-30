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

  // Serve static assets (JS, CSS, images) — index.html excluded (served below with injection)
  app.use(express.static(distPath, { index: false }));

  // Inject ADMIN_SLUG env var into the HTML at request time.
  // The client reads window.__ADMIN_PATH__ — no slug is stored in the source code.
  app.get("/{*path}", (_req, res) => {
    const slug = process.env.ADMIN_SLUG || "";
    const adminPath = slug ? `/${slug}` : "/__admin_not_configured__";

    const html = fs.readFileSync(indexHtmlPath, "utf-8").replace(
      "</head>",
      `<script>window.__ADMIN_PATH__=${JSON.stringify(adminPath)};</script></head>`,
    );

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store"); // never cache — value changes with env
    res.send(html);
  });
}
