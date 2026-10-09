import assert from "node:assert/strict";
import { test } from "node:test";
import { BOT_LANGUAGE_OPTIONS, isBotLanguage } from "./telegram-bot-language";

test("merchant Telegram languages match the supported panel choices", () => {
  assert.deepEqual(
    BOT_LANGUAGE_OPTIONS.map(({ value }) => value),
    ["fr", "en", "zh", "de", "hi"],
  );
});

test("bot language validation accepts only supported language codes", () => {
  for (const code of ["fr", "en", "zh", "de", "hi"]) {
    assert.equal(isBotLanguage(code), true);
  }

  for (const code of ["es", "FR", "", null, undefined]) {
    assert.equal(isBotLanguage(code), false);
  }
});
