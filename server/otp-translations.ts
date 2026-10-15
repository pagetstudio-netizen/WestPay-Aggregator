import { isBotLanguage, type BotLanguage } from "@shared/telegram-bot-language";

export type OtpTranslation = {
  title: string;
  merchant: string;
  otpLabel: string;
  validity: string;
  warning: string;
};

const OTP_TRANSLATIONS: Record<BotLanguage, OtpTranslation> = {
  fr: {
    title: "RobotPay — Code de connexion",
    merchant: "Marchand",
    otpLabel: "Votre code OTP :",
    validity: "Valide 5 minutes — usage unique.",
    warning: "Ne communiquez jamais ce code.",
  },
  en: {
    title: "RobotPay — Login code",
    merchant: "Merchant",
    otpLabel: "Your OTP code:",
    validity: "Valid 5 minutes — single use.",
    warning: "Never share this code.",
  },
  zh: {
    title: "RobotPay — 登录验证码",
    merchant: "商户",
    otpLabel: "您的 OTP 验证码：",
    validity: "有效期 5 分钟 — 仅限一次使用。",
    warning: "请勿向任何人透露此验证码。",
  },
  de: {
    title: "RobotPay — Anmeldecode",
    merchant: "Händler",
    otpLabel: "Ihr OTP-Code:",
    validity: "Gültig 5 Minuten — Einmalverwendung.",
    warning: "Geben Sie diesen Code niemals weiter.",
  },
  hi: {
    title: "RobotPay — लॉगिन कोड",
    merchant: "व्यापारी",
    otpLabel: "आपका OTP कोड:",
    validity: "5 मिनट के लिए मान्य — एकल उपयोग।",
    warning: "यह कोड कभी किसी को न बताएँ।",
  },
};

export function getOtpTranslation(language: unknown): OtpTranslation {
  const normalizedLanguage = isBotLanguage(language) ? language : "fr";
  return OTP_TRANSLATIONS[normalizedLanguage];
}
