---
name: Telegram delivery recovery
description: Non-obvious Telegraf polling and webhook behavior for keeping the WestPay bot responsive
---

## Rule
Never start Telegraf polling blindly when a production webhook may exist: `bot.launch()` implicitly calls `deleteWebhook()`. Polling and webhook delivery need separate ownership checks, and webhook queues that remain pending across checks should trigger re-registration without dropping updates. Validate the webhook secret and bot readiness before returning success; use a retryable response for transient failures. Treat Telegram's last-error fields as the latest event, not proof of an ongoing failure: only repair once per new error signature unless the URL is wrong or updates are still stuck in the queue.

**Why:** A development instance can otherwise remove the Plesk webhook, while a production webhook can remain configured but stop delivering updates after a TLS, Passenger, or network interruption; both symptoms make the bot appear asleep. A success response sent before secret validation or bot dispatch silently discards updates, and a persistent recent-error timestamp can otherwise cause repeated webhook resets after a single incident.

**How to apply:** Before polling, inspect `getWebhookInfo()` and stop local polling when a webhook URL is active. Keep polling recovery bounded and automatic, and run a short production webhook watchdog that repairs repeated delivery failures or stuck pending updates while preserving queued updates.