import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, cp, mkdir } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "bcryptjs",
  "connect-pg-simple",
  "cookie-parser",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "helmet",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "otplib",
  "passport",
  "passport-local",
  "pg",
  "qrcode",
  "resend",
  "stripe",
  "telegraf",
  "telegram",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  // Ne PAS supprimer dist/ avant le build — si le build échoue sur le serveur,
  // l'ancien dist/index.cjs reste disponible et le serveur continue à tourner.
  console.log("building client...");
  await viteBuild();

  // Copier uploads/ → dist/uploads/ pour que les logos et fichiers uploadés
  // soient disponibles en production (Plesk cwd = dist/)
  console.log("copying uploads...");
  try {
    await mkdir("dist/uploads", { recursive: true });
    await cp("uploads", "dist/uploads", { recursive: true, force: true });
    console.log("uploads copied to dist/uploads");
  } catch (err: any) {
    if (err.code !== "ENOENT") throw err;
    console.log("no uploads/ folder found — skipping");
  }

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    target: "node16",   // compatible Node.js 16+ (Plesk LTS typique)
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
