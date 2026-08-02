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

## Secondary fixes applied in the same session
- Static imports of `routes.ts` and `static.ts` in `server/index.ts` converted to dynamic imports → ensures `httpServer.listen()` fires before any module-level code (DB throws, mkdirSync, SESSION_SECRET check).
- `reusePort: true` removed from `httpServer.listen()` — incompatible with some Passenger setups.
- `httpServer.on("error", ...)` handler added — prevents EADDRINUSE from crashing the process silently.
- Added `/api/healthz-boot` endpoint registered before `listen()` — always accessible even if full init fails.
- esbuild `target: "node16"` added for compatibility (was defaulting to current Node.js version).
