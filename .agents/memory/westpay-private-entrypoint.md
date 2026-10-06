---
name: WestPay private entrypoint
description: User-stated security context and scope for public entrypoint changes.
---

The user considers WestPay a private project and expects people to probe its public address. Preserve valid routes when changing the root or unknown-path behavior.

**Why:** The user stated that people are looking for ways to access the private project.

**How to apply:** Treat a decoy or hidden fallback only as presentation, not access control. If access protection is requested, enforce it at the authentication and API layers rather than relying on obscured URLs.
