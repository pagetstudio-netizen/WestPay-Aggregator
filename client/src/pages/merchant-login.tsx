import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2, Shield, Lock, Mail, CheckCircle2, Zap, Globe, ArrowRight } from "lucide-react";
import { SiTelegram } from "react-icons/si";
import Captcha, { generateCaptchaCode } from "@/components/Captcha";
import { useLanguage } from "@/lib/language";
import { normalizeEmailInput } from "@shared/email-validation";

const FEATURES = [
  { icon: Zap, label: "Encaissements Mobile Money en temps réel" },
  { icon: Globe, label: "Multi-pays, multi-opérateurs" },
  { icon: CheckCircle2, label: "Reporting & historique complet" },
  { icon: Shield, label: "Sécurité bancaire & 2FA email" },
];

async function readApiJson(response: Response, fallbackMessage: string): Promise<any> {
  const rawBody = await response.text();
  try {
    return JSON.parse(rawBody);
  } catch {
    console.error("[MerchantLogin] Réponse API non JSON", {
      status: response.status,
      contentType: response.headers.get("content-type"),
    });
    throw new Error(fallbackMessage);
  }
}

const getDeviceFingerprint = (): string => {
  try {
    const stored = localStorage.getItem("_wp_dfp");
    if (stored) return stored;
    const parts = [
      navigator.userAgent, navigator.language,
      `${screen.width}x${screen.height}`, navigator.platform,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      navigator.hardwareConcurrency || "", (navigator as any).deviceMemory || "",
    ].join("|");
    let hash = 0;
    for (let i = 0; i < parts.length; i++) { hash = ((hash << 5) - hash) + parts.charCodeAt(i); hash |= 0; }
    const fp = Math.abs(hash).toString(16).padStart(8, "0") + Date.now().toString(16);
    localStorage.setItem("_wp_dfp", fp);
    return fp;
  } catch { return ""; }
};

export default function MerchantLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [ipStatus, setIpStatus] = useState<"checking" | "allowed">("checking");

  // CAPTCHA
  const [captchaCode, setCaptchaCode] = useState(() => generateCaptchaCode());
  const [captchaInput, setCaptchaInput] = useState("");
  const [captchaError, setCaptchaError] = useState(false);

  // Email OTP step
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpMerchantName, setOtpMerchantName] = useState("");
  const [otpVia, setOtpVia] = useState<"email" | "telegram">("email");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpResendLoading, setOtpResendLoading] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [sessionChecking, setSessionChecking] = useState(true);

  const { login, restoreUser, logout, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useLanguage();

  useEffect(() => {
    fetch("/api/auth/check-ip")
      .then((r) => readApiJson(r, "Le contrôle de sécurité est momentanément indisponible."))
      .then((d) => {
        if (d.allowed === false) setLocation("/ip-verify");
        else setIpStatus("allowed");
      })
      .catch(() => setIpStatus("allowed"));
  }, [setLocation]);

  // Si le visiteur possède encore un cookie de session valide, il n'a pas
  // besoin de remplir à nouveau le formulaire de connexion.
  useEffect(() => {
    if (authLoading || ipStatus !== "allowed") return;

    let cancelled = false;
    const restoreMerchantSession = async () => {
      try {
        const res = await fetch("/api/merchant/me", {
          credentials: "include",
          cache: "no-store",
        });

        if (!res.ok) {
          // Un cookie expiré, révoqué ou associé à un compte supprimé ne doit
          // pas conserver un ancien marchand affiché dans localStorage.
          if (res.status === 401 || res.status === 403) logout();
          if (!cancelled) setSessionChecking(false);
          return;
        }

        const merchant = await res.json();
        if (!merchant?.id || !merchant?.slug || !merchant?.email) {
          if (!cancelled) setSessionChecking(false);
          return;
        }

        restoreUser({
          id: merchant.id,
          email: merchant.email,
          role: "merchant",
          name: merchant.name,
          slug: merchant.slug,
        });

        if (!cancelled) {
          setSessionChecking(false);
          setLocation(`/merchant/${encodeURIComponent(merchant.slug)}`);
        }
      } catch {
        // Une erreur réseau ne doit pas supprimer une session locale ni
        // empêcher l'utilisateur de se connecter manuellement.
        if (!cancelled) setSessionChecking(false);
      }
    };

    restoreMerchantSession();
    return () => {
      cancelled = true;
    };
  }, [authLoading, ipStatus, logout, restoreUser, setLocation]);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (otpCountdown <= 0) return;
    const t = setTimeout(() => setOtpCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [otpCountdown]);

  const refreshCaptcha = useCallback(() => {
    setCaptchaCode(generateCaptchaCode());
    setCaptchaInput("");
    setCaptchaError(false);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = normalizeEmailInput(email);
    if (!normalizedEmail) {
      toast({
        title: "E-mail invalide",
        description: "Saisissez une adresse e-mail valide.",
        variant: "destructive",
      });
      return;
    }

    // Validate CAPTCHA
    if (captchaInput.toUpperCase().trim() !== captchaCode.toUpperCase()) {
      setCaptchaError(true);
      refreshCaptcha();
      toast({ title: t("authInvalidCaptcha"), description: t("authInvalidCaptchaDesc"), variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const fp = getDeviceFingerprint();
      const res = await fetch("/api/auth/merchant/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(fp ? { "X-Device-FP": fp } : {}) },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      const data = await readApiJson(
        res,
        "Le serveur de connexion est momentanément indisponible. Veuillez réessayer dans quelques secondes.",
      );
      if (!res.ok) throw new Error(data.message || "Unable to connect.");

      if (data.requiresOtp) {
        setOtpToken(data.tempToken);
        setOtpEmail(normalizedEmail);
        setOtpMerchantName(data.merchantName || "");
        setOtpStep(true);
        setOtpCountdown(60);
        setOtpVia(data.otpVia || "email");
        toast({
          title: t("authCodeSent"),
          description: data.otpVia === "telegram"
            ? "Your verification code was sent to your Telegram group."
            : `A verification code was sent to ${normalizedEmail}`,
        });
        return;
      }

      login(data.token, {
        id: data.user.id,
        email: data.user.email,
        role: "merchant",
        name: data.user.name,
        slug: data.user.slug,
      });
      toast({ title: t("authLoginSuccess"), description: t("authRedirecting"), variant: "success" });
      setTimeout(() => setLocation(`/merchant/${data.user.slug}`), 300);
    } catch (err: any) {
      toast({ title: t("authLoginError"), description: err.message || t("authLoginError"), variant: "destructive" });
      refreshCaptcha();
    } finally {
      setIsLoading(false);
    }
  }, [email, password, captchaInput, captchaCode, login, setLocation, toast, refreshCaptcha]);

  const handleVerifyOtp = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) return;
    setOtpLoading(true);
    try {
      const res = await fetch("/api/auth/merchant/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken: otpToken, code: otpCode.trim() }),
      });
      const data = await readApiJson(
        res,
        "Le serveur de vérification est momentanément indisponible. Veuillez réessayer dans quelques secondes.",
      );
       if (!res.ok) throw new Error(data.message || "Invalid code.");
      login(data.token, {
        id: data.user.id,
        email: data.user.email,
        role: "merchant",
        name: data.user.name,
        slug: data.user.slug,
      });
      toast({ title: t("authLoginSuccess"), variant: "success" });
      setTimeout(() => setLocation(`/merchant/${data.user.slug}`), 300);
    } catch (err: any) {
      toast({ title: t("authInvalidCode"), description: err.message || t("authInvalidCode"), variant: "destructive" });
      setOtpCode("");
    } finally {
      setOtpLoading(false);
    }
  }, [otpToken, otpCode, login, setLocation, toast]);

  const handleResendOtp = useCallback(async () => {
    if (otpCountdown > 0) return;
    setOtpResendLoading(true);
    try {
      const fp = getDeviceFingerprint();
      const res = await fetch("/api/auth/merchant/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(fp ? { "X-Device-FP": fp } : {}) },
        body: JSON.stringify({ email, password }),
      });
      const data = await readApiJson(
        res,
        "Le serveur de connexion est momentanément indisponible. Veuillez réessayer dans quelques secondes.",
      );
       if (!res.ok) throw new Error(data.message || "Unable to resend the code.");
      if (data.requiresOtp) {
        setOtpToken(data.tempToken);
        setOtpCode("");
        setOtpCountdown(60);
        if (data.otpVia) setOtpVia(data.otpVia);
        toast({
          title: t("authCodeResent"),
          description: data.otpVia === "telegram"
            ? "A new code was sent to your Telegram group."
            : `A new code was sent to ${otpEmail}`,
        });
      }
    } catch (err: any) {
      toast({ title: t("authLoginError"), description: err.message || t("authLoginError"), variant: "destructive" });
    } finally {
      setOtpResendLoading(false);
    }
  }, [email, password, otpEmail, otpCountdown, toast]);

  if (ipStatus === "checking" || authLoading || sessionChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 flex items-center justify-center shadow-lg"
            style={{ background: "#0963e8" }}>
            <Shield className="w-7 h-7 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            <span className="text-sm font-medium text-slate-500">Checking security...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wp-merchant-reference-gate">
      <style>{`
        .wp-merchant-reference-gate {
          min-height: 100dvh;
          box-sizing: border-box;
          padding-top: 93px;
          overflow-x: hidden;
          background: #0963e8;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
        }
        .wp-merchant-reference-brand {
          width: 328px;
          height: 105px;
          margin: 0 auto;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          padding: 0 20px 0 22px;
          gap: 22px;
          background: #fff;
        }
        .wp-merchant-reference-brand img {
          width: 78px;
          height: 78px;
          flex: 0 0 78px;
          display: block;
          object-fit: cover;
        }
        .wp-merchant-reference-brand-name {
          color: #061126;
          font-size: 39px;
          line-height: 1;
          font-weight: 700;
          letter-spacing: -1.6px;
          white-space: nowrap;
        }
        .wp-merchant-reference-card {
          width: min(553px, calc(100% - 24px));
          min-height: calc(100dvh - 198px);
          margin: 0 auto;
          box-sizing: border-box;
          padding: 54px 16px 80px 31px;
          background: #fff;
        }
        .wp-merchant-reference-content {
          width: 100%;
          max-width: 506px;
        }
        .wp-merchant-reference-title {
          margin: 0;
          color: #000;
          font-size: 28px;
          line-height: 1.18;
          font-weight: 700;
          text-align: center;
        }
        .wp-merchant-reference-description {
          margin: 0 auto;
          color: #000;
          font-size: 27px;
          line-height: 1.2;
          font-weight: 700;
          text-align: center;
        }
        .wp-merchant-reference-form {
          margin-top: 49px;
        }
        .wp-merchant-reference-input {
          width: 100%;
          height: 80px;
          box-sizing: border-box;
          padding: 0 19px;
          border: 2px solid #b8b8b8;
          border-radius: 7px;
          outline: none;
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 25px;
          line-height: 1;
        }
        .wp-merchant-reference-input::placeholder {
          color: #777;
          opacity: 1;
        }
        .wp-merchant-reference-input:focus {
          border-color: #8d8d8d;
          box-shadow: 0 0 0 2px rgba(9, 99, 232, .16);
        }
        .wp-merchant-reference-password {
          position: relative;
          margin-top: 18px;
        }
        .wp-merchant-reference-password .wp-merchant-reference-input {
          padding-right: 66px;
        }
        .wp-merchant-reference-eye {
          position: absolute;
          top: 50%;
          right: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          padding: 0;
          border: 0;
          transform: translateY(-50%);
          color: #000;
          background: transparent;
          cursor: pointer;
        }
        .wp-merchant-reference-eye svg {
          width: 27px;
          height: 27px;
          stroke-width: 2.3;
        }
        .wp-merchant-reference-captcha {
          display: flex;
          align-items: center;
          width: 100%;
          height: 78px;
          box-sizing: border-box;
          margin-top: 33px;
          overflow: hidden;
          border: 2px solid #b8b8b8;
          border-radius: 7px;
          background: #fff;
        }
        .wp-merchant-reference-captcha > div {
          display: flex;
          align-items: center;
          flex: 0 0 199px;
          width: 199px;
          height: 100%;
          padding-left: 9px;
          box-sizing: border-box;
        }
        .wp-merchant-reference-captcha canvas {
          width: 176px !important;
          height: 52px !important;
          border-radius: 0 !important;
        }
        .wp-merchant-reference-captcha > div > button {
          display: none;
        }
        .wp-merchant-reference-captcha-input {
          min-width: 0;
          width: 100%;
          height: 100%;
          padding: 0 12px 0 0;
          box-sizing: border-box;
          border: 0;
          outline: 0;
          color: #777;
          background: transparent;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 25px;
          font-weight: 700;
        }
        .wp-merchant-reference-captcha-input::placeholder {
          color: #777;
          opacity: 1;
        }
        .wp-merchant-reference-captcha-input:focus {
          box-shadow: none;
        }
        .wp-merchant-reference-captcha-error {
          margin: 6px 0 -19px;
          color: #dc2626;
          font-size: 13px;
          font-weight: 600;
        }
        .wp-merchant-reference-submit {
          display: flex;
          align-items: center;
          justify-content: center;
          width: calc(100% - 8px);
          height: 80px;
          margin: 65px 0 0 8px;
          box-sizing: border-box;
          border: 2px solid #456b8d;
          border-radius: 7px;
          color: #fff;
          background: #6083a8;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 37px;
          line-height: 1;
          font-weight: 700;
          cursor: pointer;
          transition: background-color .12s ease, transform .1s ease;
        }
        .wp-merchant-reference-submit:hover:not(:disabled) {
          background: #56799d;
        }
        .wp-merchant-reference-submit:active:not(:disabled) {
          transform: scale(.99);
        }
        .wp-merchant-reference-submit:disabled {
          cursor: not-allowed;
          opacity: .58;
        }
        .wp-merchant-reference-otp {
          width: 100%;
          height: 80px;
          box-sizing: border-box;
          padding: 0 15px;
          border: 2px solid #b8b8b8;
          border-radius: 7px;
          outline: none;
          background: #fff;
          color: #000;
          font-size: 29px;
          font-weight: 700;
          letter-spacing: .45em;
          text-align: center;
        }
        @media (max-width: 500px) {
          .wp-merchant-reference-gate {
            padding-top: 48px;
          }
          .wp-merchant-reference-brand {
            width: 286px;
            height: 92px;
            padding-left: 18px;
            gap: 18px;
          }
          .wp-merchant-reference-brand img {
            width: 66px;
            height: 66px;
            flex-basis: 66px;
          }
          .wp-merchant-reference-brand-name {
            font-size: 33px;
          }
          .wp-merchant-reference-card {
            min-height: calc(100dvh - 140px);
            padding: 42px 13px 56px 20px;
          }
          .wp-merchant-reference-title {
            font-size: 24px;
          }
          .wp-merchant-reference-description {
            font-size: 22px;
          }
          .wp-merchant-reference-form {
            margin-top: 35px;
          }
          .wp-merchant-reference-input {
            height: 68px;
            font-size: 21px;
          }
          .wp-merchant-reference-captcha {
            height: 68px;
          }
          .wp-merchant-reference-captcha > div {
            flex-basis: 148px;
            width: 148px;
            padding-left: 5px;
          }
          .wp-merchant-reference-captcha canvas {
            width: 136px !important;
            height: 46px !important;
          }
          .wp-merchant-reference-captcha-input {
            font-size: 20px;
          }
          .wp-merchant-reference-submit {
            height: 68px;
            margin-top: 48px;
            font-size: 30px;
          }
        }
      `}</style>

      <div className="wp-merchant-reference-brand">
        <img src="/robotpay-logo.jpg" alt="WestPay" />
        <span className="wp-merchant-reference-brand-name">WestPay</span>
      </div>

      <main className="wp-merchant-reference-card">
        <div className="wp-merchant-reference-content">
          {!otpStep ? (
            <>
              <h1 className="wp-merchant-reference-title">Merchant Login</h1>
              <p className="wp-merchant-reference-description">Access your management area.</p>

              <form onSubmit={handleSubmit} className="wp-merchant-reference-form">
                <input
                  type="email"
                  className="wp-merchant-reference-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  aria-label="Email"
                  required
                  maxLength={254}
                  autoComplete="username"
                  data-testid="input-merchant-email"
                />

                <div className="wp-merchant-reference-password">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="wp-merchant-reference-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    aria-label="Password"
                    required
                    autoComplete="current-password"
                    data-testid="input-merchant-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="wp-merchant-reference-eye"
                    data-testid="button-toggle-merchant-password"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>

                <div className={`wp-merchant-reference-captcha ${captchaError ? "border-red-500" : ""}`}>
                  <Captcha code={captchaCode} onRefresh={refreshCaptcha} />
                  <input
                    type="text"
                    className="wp-merchant-reference-captcha-input"
                    value={captchaInput}
                    onChange={(e) => { setCaptchaInput(e.target.value.toUpperCase()); setCaptchaError(false); }}
                    placeholder="Enter code"
                    aria-label="Security code"
                    maxLength={5}
                    autoComplete="off"
                    spellCheck={false}
                    required
                    data-testid="input-captcha"
                  />
                </div>
                {captchaError && <p className="wp-merchant-reference-captcha-error">The security code is incorrect.</p>}

                <button
                  type="submit"
                  disabled={isLoading || !email || !password || captchaInput.length < 5}
                  className="wp-merchant-reference-submit"
                  data-testid="button-merchant-login"
                >
                  {isLoading ? <Loader2 className="w-7 h-7 animate-spin" /> : "connect to Westpay"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="wp-merchant-reference-title">Verification code</h1>
              <p className="wp-merchant-reference-description">Enter the 6-digit code sent to your account.</p>

              <form onSubmit={handleVerifyOtp} className="wp-merchant-reference-form">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  className="wp-merchant-reference-otp"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  aria-label="Verification code"
                  autoFocus
                  data-testid="input-merchant-otp"
                />

                <button
                  type="submit"
                  disabled={otpLoading || otpCode.length !== 6}
                  className="wp-merchant-reference-submit"
                  data-testid="button-merchant-verify-otp"
                >
                  {otpLoading ? <Loader2 className="w-7 h-7 animate-spin" /> : "connect to Westpay"}
                </button>

                <div className="flex flex-col items-center gap-3 mt-5">
                  <button
                    type="button"
                    disabled={otpCountdown > 0 || otpResendLoading}
                    onClick={handleResendOtp}
                    className="text-sm font-semibold text-blue-700 hover:text-blue-900 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                    data-testid="button-resend-otp"
                  >
                    {otpResendLoading ? "Sending..." : otpCountdown > 0 ? `Resend in ${otpCountdown}s` : "Resend code"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setOtpStep(false); setOtpCode(""); setOtpToken(""); refreshCaptcha(); }}
                    className="text-sm text-slate-500 hover:text-slate-700 transition-colors font-medium"
                    data-testid="button-back-merchant-login"
                  >
                    ← Back to login
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
