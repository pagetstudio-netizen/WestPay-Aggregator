---
name: Telegram help coverage
description: Keep command discovery aligned with the admin and merchant command scopes in this bot.
---

Every admin Telegram command and its aliases must be listed in the administrator group's `/help`. Merchant-only commands belong in merchant-specific help, and may also be summarized in admin help only when their required chat context is clearly stated. Do not list commands as admin actions when their handler ignores the administrator group.

**Why:** The user explicitly asked that newly added creation, activation, and other commands remain findable from Telegram help.

**How to apply:** After registering commands or aliases, compare the registrations with each role-appropriate help message and update the help text in the same change.
