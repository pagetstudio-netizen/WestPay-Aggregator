---
name: Telegram delivery recovery
description: Non-obvious Telegraf polling and webhook behavior for keeping the WestPay bot responsive
---

## Rule
Never start Telegraf polling blindly when a production webhook may exist: `bot.launch()` implicitly calls `deleteWebhook()`. Polling and webhook delivery need separate ownership checks, and webhook queues that remain pending across checks should trigger re-registration without dropping updates.

**Why:** A development instance can otherwise remove the Plesk webhook, while a production webhook can remain configured but stop delivering updates after a TLS, Passenger, or network interruption; both symptoms make the bot appear asleep.

**How to apply:** Before polling, inspect `getWebhookInfo()` and stop local polling when a webhook URL is active. Keep polling recovery bounded and automatic, and run a short production webhook watchdog that repairs repeated delivery failures or stuck pending updates while preserving queued updates.