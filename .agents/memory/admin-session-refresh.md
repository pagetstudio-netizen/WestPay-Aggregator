---
name: Admin session refresh
description: Admin authentication must survive refreshes without storing JWTs in localStorage.
---

The admin JWT remains in the httpOnly `wp_auth` cookie. Refresh the frontend session through a server-side session check; only an explicit 401 should clear the cached user and redirect to login. Treat network errors and temporary database failures as unavailable-session checks, not as logout signals.

**Why:** A protected admin request could be mistaken for an expired login during a temporary Auth database or network failure, forcing the administrator to reconnect after refreshing the page.

**How to apply:** Keep cookie credentials explicit on admin login and session requests, preserve the display user during non-401 failures, and keep the JWT out of localStorage.