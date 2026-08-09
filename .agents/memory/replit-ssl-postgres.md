---
name: Replit internal PostgreSQL SSL
description: Replit's internal PostgreSQL host ("helium") does not support SSL — the sslFor() helper in server/db.ts must skip SSL for it.
---

# Replit Internal PostgreSQL and SSL

**Rule:** Replit's built-in PostgreSQL uses the hostname `helium` internally. It does NOT support SSL connections.

**Why:** The `sslFor()` function in `server/db.ts` originally only skipped SSL for `localhost`, `127.0.0.1`, and `/var/run`. The `helium` hostname doesn't match those patterns, so `pg` tried to connect with SSL and got "The server does not support SSL connections".

**How to apply:** When connecting to Replit's internal PostgreSQL, ensure `sslFor()` (or equivalent) returns `false` for URLs containing `helium`. The fix added `url.includes("helium")` to the no-SSL check. Also handle `sslmode=disable` in the URL for completeness.

Affected file: `server/db.ts` — `sslFor()` helper function.
