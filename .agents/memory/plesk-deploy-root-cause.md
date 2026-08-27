---
name: Plesk deploy.sh root cause
description: Why the Plesk/Passenger app kept crashing and how it was fixed.
---

## The rule
Never run `npm run build` in deploy.sh on the production server. The pre-built `dist/` is committed to git and arrives via `git pull` — no server-side rebuild needed.

**Why:** `script/build.ts` calls `rm("dist", { recursive: true, force: true })` at the start. If the build then fails on Plesk (memory, permissions, missing env, etc.), `dist/index.cjs` is permanently deleted. Passenger then tries to start `node dist/index.cjs` → MODULE_NOT_FOUND → "something went wrong" on every request.

**How to apply:** deploy.sh should only do:
```bash
npm install
npm prune --omit=dev
```
The `dist/` comes from git, not from a server-side rebuild.

## Plesk domain configuration
In this project's Plesk setup, the main domain and `payment.bank2.westpay.cfd` can share the same `Document Root` and `Application Root`; the second Node.js entry works with those shared paths.

**Why:** The user confirmed that Plesk serves both domains successfully with the shared roots, so an alias-only setup is not required for this hosting configuration.

**How to apply:** Preserve the working shared-root configuration for future Bank2 deployments. The application code must continue recognizing the exact Bank2 hostname `payment.bank2.westpay.cfd`.

## Passenger cold-start lessons (Plesk)
- Passenger spawns the Node process on demand: requests can arrive at uptime 0, before async init finishes. Static SPA must be registered immediately after `listen()`; `/api` requests are gated by a middleware that awaits init (max 30s) instead of 404-ing HTML (which broke JSON clients with "Unexpected token '<'").
- The SPA catch-all must `next()` for `/api` paths since API routes are registered later.
- Plesk Document Root = `/httpdocs/dist` means Apache serves files there directly — `index.cjs` (server bundle) was publicly downloadable until `dist/.htaccess` denied `.cjs/.env/.log/.sh` and disabled indexes. If Plesk ever serves statics via nginx, move Document Root to `/httpdocs/dist/public` instead.
- `git pull` does NOT restore locally-deleted tracked files (e.g. dist/public wiped by a failed server build) — deploy.sh runs `git checkout -- dist/` first.
- `dotenv` must be bundled into the server bundle (esbuild allowlist) so startup never depends on node_modules.

## Secondary fixes applied in the same session
- Static imports of `routes.ts` and `static.ts` in `server/index.ts` converted to dynamic imports → ensures `httpServer.listen()` fires before any module-level code (DB throws, mkdirSync, SESSION_SECRET check).
- `reusePort: true` removed from `httpServer.listen()` — incompatible with some Passenger setups.
- `httpServer.on("error", ...)` handler added — prevents EADDRINUSE from crashing the process silently.
- Added `/api/healthz-boot` endpoint registered before `listen()` — always accessible even if full init fails.
- esbuild `target: "node16"` added for compatibility (was defaulting to current Node.js version).
