---
name: Workflow process collisions
description: A Replit-managed restart may leave an older development process alive and cause a second instance to collide.
---

After a workflow restart fails with `EADDRINUSE`, an older application or Vite process may still be serving while the failed new process continues running background jobs.

**Why:** Restarting without confirming process cleanup can leave duplicate server-side timers and workers, even when the second HTTP server cannot bind its port.

**How to apply:** Check workflow logs and the process list, then use `stopWorkflow` first. If a specifically identified development process remains, terminate only that process with SIGTERM, verify the port is free, restart once, and confirm there is a single process and a successful HTTP response.
