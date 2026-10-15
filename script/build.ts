import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, cp, mkdir, mkdtemp, rename } from "fs/promises";
import { join, resolve } from "path";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "dotenv",           // bundlé pour ne pas dépendre de node_modules au démarrage (critique Plesk)
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
  // Build both outputs away from the live dist files. Vite's emptyOutDir would
  // otherwise delete manually uploaded files and legacy assets in dist/public.
  await mkdir("dist", { recursive: true });
  const stagingDir = await mkdtemp(join(resolve("dist"), ".build-stage-"));
  const stagedPublicDir = join(stagingDir, "public");
  const stagedServerBundle = join(stagingDir, "index.cjs");

  try {
    console.log("building client in staging...");
    await viteBuild({
      build: {
        outDir: stagedPublicDir,
        emptyOutDir: true,
      },
    });

    console.log("building server in staging...");
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
      outfile: stagedServerBundle,
      define: {
        "process.env.NODE_ENV": '"production"',
      },
      minify: true,
      external: externals,
      logLevel: "info",
    });

    console.log("merging build into dist/ without removing existing public files...");
    await mkdir("dist/public", { recursive: true });
    await cp(stagedPublicDir, "dist/public", { recursive: true, force: true });

    // Copier uploads/ → dist/uploads/ pour que les logos et fichiers uploadés
    // soient disponibles en production (Plesk cwd = dist/). Fusionne sans effacer.
    try {
      await mkdir("dist/uploads", { recursive: true });
      await cp("uploads", "dist/uploads", { recursive: true, force: true });
      console.log("uploads copied to dist/uploads");
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
      console.log("no uploads/ folder found — skipping");
    }

    // Rename on the same filesystem atomically replaces index.cjs only after
    // both client and server bundles have compiled successfully.
    await rename(stagedServerBundle, "dist/index.cjs");
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
