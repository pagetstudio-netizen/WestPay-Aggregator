export const BOT_LANGUAGE_OPTIONS = [
  { value: "fr", label: "🇫🇷 Français" },
  { value: "en", label: "🇬🇧 English" },
  { value: "zh", label: "🇨🇳 中文 (Chinois)" },
  { value: "de", label: "🇩🇪 Deutsch (Allemand)" },
  { value: "hi", label: "🇮🇳 हिन्दी (Hindi)" },
] as const;

export type BotLanguage = (typeof BOT_LANGUAGE_OPTIONS)[number]["value"];

export function isBotLanguage(value: unknown): value is BotLanguage {
  return BOT_LANGUAGE_OPTIONS.some((language) => language.value === value);
}
