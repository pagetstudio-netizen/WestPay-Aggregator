---
name: GitHub shell authentication
description: The Replit GitHub connector and local HTTPS Git credentials are separate authentication paths.
---

Attaching an authorized GitHub connection to the Repl makes authenticated GitHub API access available, but it does not automatically populate the terminal's Git credential helper. A direct `git push` over an HTTPS remote can therefore still fail with an invalid username or token.

**Why:** The connector proxy keeps OAuth credentials inside its integration runtime instead of exposing them to shell processes.

**How to apply:** Prefer the workspace's GitHub push flow for normal repository pushes. If an API-based publication is needed, use the connected GitHub API without copying credentials into the project or chat.