---
name: Screenshot asset and Git safety
description: Workspace behavior to check before pushing after preview screenshots.
---

Previewing an app can create an automatic local Git safety commit for a user-uploaded image in `attached_assets/`, even when that image was previously excluded from project history.

**Why:** A preview verification unexpectedly reintroduced an uploaded capture into the branch after it had been removed, which could leak an unrelated asset on the next push.

**How to apply:** Before recommending a push after screenshot-based verification, inspect `git log` and `git status`; remove any generated asset-only commit while preserving the local file as untracked.