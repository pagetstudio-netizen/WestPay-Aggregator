import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2, Shield, Lock, Mail, CheckCircle2, Zap, Globe, ArrowRight } from "lucide-react";
import { SiTelegram } from "react-icons/si";
import Captcha, { generateCaptchaCode } from "@/components/Captcha";
import { useLanguage } from "@/lib/language";

const FEATURES = [
  { icon: Zap, label: "Encaissements Mobile Money en temps réel" },
  { icon: Globe, label: "Multi-pays, multi-opérateurs" },
  { icon: CheckCircle2, label: "Reporting & historique complet" },
  { icon: Shield, label: "Sécurité bancaire & 2FA email" },
];

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

  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useLanguage();

  useEffect(() => {
    fetch("/api/auth/check-ip")
      .then((r) => r.json())
      .then((d) => {
        if (d.allowed === false) setLocation("/ip-verify");
        else setIpStatus("allowed");
      })
      .catch(() => setIpStatus("allowed"));
  }, [setLocation]);

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
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur de connexion");

      if (data.requiresOtp) {
        setOtpToken(data.tempToken);
        setOtpEmail(email);
        setOtpMerchantName(data.merchantName || "");
        setOtpStep(true);
        setOtpCountdown(60);
        setOtpVia(data.otpVia || "email");
        toast({
          title: t("authCodeSent"),
          description: data.otpVia === "telegram"
            ? "Votre code de vérification a été envoyé dans votre groupe Telegram."
            : `Un code de vérification a été envoyé à ${email}`,
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Code invalide");
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      if (data.requiresOtp) {
        setOtpToken(data.tempToken);
        setOtpCode("");
        setOtpCountdown(60);
        if (data.otpVia) setOtpVia(data.otpVia);
        toast({
          title: t("authCodeResent"),
          description: data.otpVia === "telegram"
            ? "Nouveau code envoyé dans votre groupe Telegram."
            : `Nouveau code envoyé à ${otpEmail}`,
        });
      }
    } catch (err: any) {
      toast({ title: t("authLoginError"), description: err.message || t("authLoginError"), variant: "destructive" });
    } finally {
      setOtpResendLoading(false);
    }
  }, [email, password, otpEmail, otpCountdown, toast]);

  if (ipStatus === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
            style={{ background: "linear-gradient(135deg,#00b050,#005c2e)" }}>
            <Shield className="w-7 h-7 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            <span className="text-sm font-medium text-slate-500">Vérification de sécurité...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-white">
      <style>{`
        .ml-input {
          width:100%;padding:0.7rem 0.9rem;font-size:0.9rem;
          border:1.5px solid #e2e8f0;border-radius:10px;
          background:#fafafa;color:#1a1a1a;outline:none;
          transition:border-color 0.15s,box-shadow 0.15s,background 0.15s;
        }
        .ml-input:focus { border-color:#00b050;box-shadow:0 0 0 3px rgba(0,176,80,0.1);background:#fff; }
        .ml-input::placeholder { color:#b0bec5; }
        .ml-input-error { border-color:#ef4444 !important; box-shadow:0 0 0 3px rgba(239,68,68,0.1) !important; }
        .ml-btn {
          width:100%;padding:0.8rem;font-size:0.95rem;font-weight:700;
          background:linear-gradient(135deg,#00b050,#009a45);color:#fff;
          border:none;border-radius:10px;cursor:pointer;
          transition:opacity 0.15s,transform 0.1s,box-shadow 0.15s;
          display:flex;align-items:center;justify-content:center;gap:0.5rem;
          box-shadow:0 4px 14px rgba(0,176,80,0.3);letter-spacing:0.01em;
        }
        .ml-btn:hover:not(:disabled) { opacity:0.92;box-shadow:0 6px 20px rgba(0,176,80,0.35); }
        .ml-btn:active:not(:disabled) { transform:scale(0.98); }
        .ml-btn:disabled { opacity:0.45;cursor:not-allowed;box-shadow:none; }
        .ml-otp {
          width:100%;padding:0.9rem 1rem;font-size:1.75rem;font-weight:800;
          letter-spacing:0.5em;text-align:center;
          border:2px solid #e2e8f0;border-radius:12px;
          background:#fafafa;color:#1a1a1a;outline:none;
          transition:border-color 0.15s,box-shadow 0.15s;
        }
        .ml-otp:focus { border-color:#00b050;box-shadow:0 0 0 3px rgba(0,176,80,0.1);background:#fff; }
      `}</style>

      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: "linear-gradient(145deg,#00b050 0%,#005c2e 60%,#003d1e 100%)" }}>
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 25% 75%,#ffffff 0%,transparent 55%),radial-gradient(circle at 75% 25%,#ffffff 0%,transparent 45%)" }} />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <img src="/robotpay-logo.jpg" alt="WestPay" className="w-9 h-9 rounded-lg object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
            <span className="text-2xl font-black text-white tracking-tight">WestPay</span>
          </div>
          <p className="text-white/60 text-sm mt-2">Espace Marchand</p>
        </div>

        <div className="relative z-10 space-y-6">
          <div>
            <h2 className="text-3xl xl:text-4xl font-black text-white leading-tight mb-3">
              Gérez vos encaissements Mobile Money en toute simplicité
            </h2>
            <p className="text-white/70 text-base leading-relaxed">
              Suivez vos transactions, gérez vos retraits et intégrez nos API de paiement depuis votre tableau de bord.
            </p>
          </div>

          <div className="space-y-3">
            {FEATURES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <span className="text-white/85 text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>

          <div className="bg-white/10 backdrop-blur rounded-2xl p-5 border border-white/15">
            <p className="text-white/70 text-xs font-medium uppercase tracking-widest mb-2">Sécurité</p>
            <p className="text-white text-sm font-semibold">Vérification par email à chaque connexion pour protéger votre compte.</p>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
          <span className="text-white/50 text-xs">Plateforme sécurisée</span>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 bg-white">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl overflow-hidden shadow">
              <img src="/robotpay-logo.jpg" alt="WestPay" className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
            <span className="text-xl font-black text-slate-900">WestPay</span>
          </div>

          {!otpStep ? (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-black text-slate-900 mb-1">Connexion Marchand</h1>
                <p className="text-slate-500 text-sm">Accédez à votre espace de gestion.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">Adresse email</label>
                  <input
                    type="email"
                    className="ml-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vous@exemple.com"
                    required
                    autoComplete="username"
                    data-testid="input-merchant-email"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">Mot de passe</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      className="ml-input"
                      style={{ paddingRight: "2.75rem" }}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      autoComplete="current-password"
                      data-testid="input-merchant-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                      data-testid="button-toggle-merchant-password"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 0" }}
                      onClick={() => toast({ title: "Mot de passe oublié", description: "Contactez le support pour réinitialiser votre mot de passe." })}
                      data-testid="link-forgot-password"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                </div>

                {/* CAPTCHA */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Code de sécurité</label>
                  <Captcha code={captchaCode} onRefresh={refreshCaptcha} />
                  <input
                    type="text"
                    className={`ml-input ${captchaError ? "ml-input-error" : ""}`}
                    value={captchaInput}
                    onChange={(e) => { setCaptchaInput(e.target.value.toUpperCase()); setCaptchaError(false); }}
                    placeholder="Entrez le code ci-dessus"
                    maxLength={5}
                    autoComplete="off"
                    spellCheck={false}
                    required
                    data-testid="input-captcha"
                  />
                  {captchaError && (
                    <p className="text-xs text-red-500 font-medium">Code incorrect, un nouveau code a été généré.</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !email || !password || captchaInput.length < 5}
                  className="ml-btn"
                  style={{ marginTop: "0.75rem" }}
                  data-testid="button-merchant-login"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  {isLoading ? "Connexion..." : "Se connecter"}
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-slate-100">
                <p className="text-center text-sm text-slate-400">
                  Pas encore de compte ?{" "}
                  <button
                    type="button"
                    className="text-emerald-600 hover:text-emerald-700 font-semibold transition-colors"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    onClick={() => toast({ title: "Créer un compte", description: "Contactez notre équipe pour créer votre compte marchand." })}
                    data-testid="button-merchant-signup"
                  >
                    Contactez-nous
                  </button>
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="mb-8">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 mx-auto"
                  style={{ background: "linear-gradient(135deg,#229ED9,#0d6fa8)" }}>
                  <SiTelegram className="w-9 h-9 text-white" />
                </div>
                <h1 className="text-2xl font-black text-slate-900 text-center mb-2">
                  Vérification Telegram
                </h1>
                <p className="text-slate-500 text-sm text-center leading-relaxed">
                  Un code à 6 chiffres a été envoyé dans le groupe Telegram de<br />
                  <span className="font-semibold text-slate-700">{otpMerchantName || "votre compte"}</span>
                </p>
              </div>

              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                  <Lock className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Vérification à deux facteurs</p>
                    <p className="text-xs text-emerald-700 mt-0.5">Code valable 5 minutes · usage unique</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700 text-center">Votre code à 6 chiffres</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    className="ml-otp"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    autoFocus
                    data-testid="input-merchant-otp"
                  />
                </div>

                <button
                  type="submit"
                  disabled={otpLoading || otpCode.length !== 6}
                  className="ml-btn"
                  data-testid="button-merchant-verify-otp"
                >
                  {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  {otpLoading ? "Vérification..." : "Confirmer ma connexion"}
                </button>

                <div className="flex flex-col items-center gap-3">
                  <button
                    type="button"
                    disabled={otpCountdown > 0 || otpResendLoading}
                    onClick={handleResendOtp}
                    className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                    style={{ background: "none", border: "none", cursor: otpCountdown > 0 ? "not-allowed" : "pointer", padding: "2px 0" }}
                    data-testid="button-resend-otp"
                  >
                    {otpResendLoading ? (
                      <span className="flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" />Envoi...</span>
                    ) : otpCountdown > 0 ? (
                      `Renvoyer dans ${otpCountdown}s`
                    ) : (
                      "Renvoyer le code"
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setOtpStep(false); setOtpCode(""); setOtpToken(""); refreshCaptcha(); }}
                    className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 0" }}
                    data-testid="button-back-merchant-login"
                  >
                    ← Retour à la connexion
                  </button>
                </div>
              </form>
            </>
          )}

          <p className="text-center text-xs text-slate-300 mt-8">
            © {new Date().getFullYear()} WestPay · Connexion sécurisée
          </p>
        </div>
      </div>
    </div>
  );
}
