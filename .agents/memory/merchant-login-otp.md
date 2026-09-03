---
name: Merchant login OTP mode
description: Temporary authentication mode for merchant login while Telegram activation is paused.
---

The merchant login currently uses the legacy OTP flow: successful OTP verification issues the normal merchant JWT directly. Telegram activation is intentionally paused; its API endpoint returns 410 and the activation page is not routed.

**Why:** The activation flow introduced an unavailable client-IP helper and blocked merchants after entering a valid OTP; the legacy OTP is the required operational flow for now.

**How to apply:** Do not reintroduce activation checks into merchant login or OTP verification unless the user explicitly asks to reactivate that system and the full activation path is tested.