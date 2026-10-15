import assert from "node:assert/strict";
import { test } from "node:test";
import { getOtpTranslation } from "./otp-translations";

test("OTP message translations follow each supported merchant bot language", () => {
  assert.equal(getOtpTranslation("zh").title, "RobotPay — 登录验证码");
  assert.equal(getOtpTranslation("en").otpLabel, "Your OTP code:");
  assert.equal(getOtpTranslation("de").merchant, "Händler");
  assert.equal(getOtpTranslation("hi").validity, "5 मिनट के लिए मान्य — एकल उपयोग।");
});

test("unsupported OTP language falls back to French", () => {
  assert.equal(getOtpTranslation("es").title, "RobotPay — Code de connexion");
  assert.equal(getOtpTranslation(undefined).warning, "Ne communiquez jamais ce code.");
});
