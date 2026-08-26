import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2, Shield, KeyRound, Lock, CheckCircle2, Zap, Globe, Smartphone, QrCode, AlertTriangle, Copy, Check } from "lucide-react";
import { adminConfig } from "@/lib/admin-config";
import { useLanguage } from "@/lib/language";
import { copyTextToClipboard } from "@/lib/clipboard";

async function buildDeviceFingerprint(): Promise<string> {
  try {
    const stored = localStorage.getItem("_wp_dfp2");
    if (stored && stored.length > 20) return stored;

    const parts: string[] = [
      navigator.userAgent,
      navigator.language,
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      navigator.platform || "",
      String(navigator.hardwareConcurrency || ""),
      String((navigator as any).deviceMemory || ""),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      String(new Date().getTimezoneOffset()),
      navigator.languages?.join(",") || "",
    ];

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 240;
      canvas.height = 60;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#f60";
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = "#069";
        ctx.font = "11pt no-real-font-abc";
        ctx.fillText("WestPay🔒 fp", 2, 15);
        ctx.fillStyle = "rgba(102,204,0,0.7)";
        ctx.font = "18pt Arial";
        ctx.fillText("WestPay🔒 fp", 4, 45);
        parts.push(canvas.toDataURL().slice(0, 100));
      }
    } catch { /* canvas blocked */ }

    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl") as WebGLRenderingContext | null;
      if (gl) {
        const dbgRenderInfo = gl.getExtension("WEBGL_debug_renderer_info");
        if (dbgRenderInfo) {
          parts.push(gl.getParameter(dbgRenderInfo.UNMASKED_VENDOR_WEBGL) || "");
          parts.push(gl.getParameter(dbgRenderInfo.UNMASKED_RENDERER_WEBGL) || "");
        }
        parts.push(String(gl.getParameter(gl.MAX_TEXTURE_SIZE)));
        parts.push(String(gl.getParameter(gl.MAX_VERTEX_ATTRIBS)));
      }
    } catch { /* webgl blocked */ }

    try {
      const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = ac.createOscillator();
      const analyser = ac.createAnalyser();
      const gain = ac.createGain();
      gain.gain.value = 0;
      oscillator.type = "triangle";
      oscillator.connect(analyser);
      analyser.connect(gain);
      gain.connect(ac.destination);
      oscillator.start(0);
      const data = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(data);
      oscillator.stop();
      ac.close();
      parts.push(String(data[0] || ""));
    } catch { /* audio blocked */ }

    const raw = parts.join("|");
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(raw);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fp = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("_wp_dfp2", fp);
    return fp;
  } catch {
    const raw = [navigator.userAgent, navigator.language, screen.width, screen.height].join("|");
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(16, "0");
  }
}

const FEATURES = [
  { icon: Zap, label: "Paiements Mobile Money instantanés" },
  { icon: Globe, label: "Multi-opérateurs, multi-pays" },
  { icon: Shield, label: "Sécurité renforcée & audit complet" },
  { icon: CheckCircle2, label: "Tableau de bord temps réel" },
];

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [ipStatus, setIpStatus] = useState<"checking" | "allowed" | "denied">("checking");

  // Telegram OTP (fallback, kept for compat)
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  // TOTP verify (already configured)
  const [totpStep, setTotpStep] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [totpLoading, setTotpLoading] = useState(false);

  // TOTP setup (first-time: scan QR + enter code)
  const [totpSetupStep, setTotpSetupStep] = useState(false);
  const [setupQrCode, setSetupQrCode] = useState("");
  const [setupSecret, setSetupSecret] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupCodeStep, setSetupCodeStep] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);

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
    buildDeviceFingerprint().catch(() => {});
  }, [setLocation]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const fp = await buildDeviceFingerprint();
      const res = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(fp ? { "X-Device-FP": fp } : {}),
        },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        const code = data.code;
        if (code === "NEW_DEVICE") {
          toast({ title: "Nouvel appareil", description: "Un appareil inconnu a été détecté. Validez-le via Telegram puis reconnectez-vous.", variant: "destructive" });
        } else if (code === "DEVICE_PENDING") {
          toast({ title: "En attente", description: "Cet appareil attend validation via Telegram.", variant: "destructive" });
        } else {
          throw new Error(data.message || "Erreur de connexion");
        }
        return;
      }
      // TOTP déjà configuré → saisir le code
      if (data.requires_totp) {
        setTotpToken(data.tempToken);
        setTotpStep(true);
        return;
      }
      // TOTP pas encore configuré → afficher le QR code de setup
      if (data.requires_totp_setup) {
        setSetupToken(data.tempToken);
        setSetupQrCode(data.qrCode);
        setSetupSecret(data.secret || "");
        setTotpSetupStep(true);
        setSetupCodeStep(false);
        return;
      }
      // Telegram OTP fallback
      if (data.requires2fa) {
        setOtpToken(data.tempToken);
        setOtpStep(true);
        toast({ title: "Code 2FA envoyé", description: "Un code de vérification a été envoyé sur Telegram." });
        return;
      }
      login(data.token, { id: data.user.id, email: data.user.email, role: "admin" });
      toast({ title: t("authLoginSuccess"), description: t("authRedirecting"), variant: "success" });
      setTimeout(() => setLocation(`${adminConfig.base}/dashboard`), 300);
    } catch (err: any) {
      toast({ title: t("authLoginError"), description: err.message || t("authLoginError"), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [email, password, login, setLocation, toast]);

  const handleVerifyOtp = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) return;
    setOtpLoading(true);
    try {
      const res = await fetch("/api/auth/admin/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken: otpToken, code: otpCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Code invalide");
      login(data.token, { id: data.user.id, email: data.user.email, role: "admin" });
      toast({ title: t("authLoginSuccess"), variant: "success" });
      setTimeout(() => setLocation(`${adminConfig.base}/dashboard`), 300);
    } catch (err: any) {
      toast({ title: t("authInvalidCode"), description: err.message || t("authInvalidCode"), variant: "destructive" });
    } finally {
      setOtpLoading(false);
    }
  }, [otpToken, otpCode, login, setLocation, toast]);

  const handleVerifyTotp = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.length !== 6) return;
    setTotpLoading(true);
    try {
      const res = await fetch("/api/auth/admin/verify-totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken: totpToken, code: totpCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Code invalide");
      login(data.token, { id: data.user.id, email: data.user.email, role: "admin" });
      toast({ title: t("authLoginSuccess"), variant: "success" });
      setTimeout(() => setLocation(`${adminConfig.base}/dashboard`), 300);
    } catch (err: any) {
      toast({ title: t("authInvalidCode"), description: err.message || t("authInvalidCode"), variant: "destructive" });
      setTotpCode("");
    } finally {
      setTotpLoading(false);
    }
  }, [totpToken, totpCode, login, setLocation, toast]);

  const handleCompleteTotpSetup = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (setupCode.length !== 6) return;
    setSetupLoading(true);
    try {
      const res = await fetch("/api/auth/admin/complete-totp-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken: setupToken, code: setupCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Code invalide");
      login(data.token, { id: data.user.id, email: data.user.email, role: "admin" });
      toast({ title: "Google Authenticator activé !", description: "Votre compte est maintenant protégé par 2FA." });
      setTimeout(() => setLocation(`${adminConfig.base}/dashboard`), 300);
    } catch (err: any) {
      toast({ title: "Erreur de configuration", description: err.message, variant: "destructive" });
      setSetupCode("");
    } finally {
      setSetupLoading(false);
    }
  }, [setupToken, setupCode, login, setLocation, toast]);

  const resetAll = () => {
    setOtpStep(false); setOtpCode(""); setOtpToken("");
    setTotpStep(false); setTotpCode(""); setTotpToken("");
    setTotpSetupStep(false); setSetupQrCode(""); setSetupSecret(""); setSetupToken(""); setSetupCode(""); setSetupCodeStep(false); setSecretCopied(false);
  };

  const copySecret = async () => {
    if (!setupSecret) return;
    try {
      await copyTextToClipboard(setupSecret, { successTitle: t("copied") });
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    } catch {}
  };

  if (ipStatus === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg" style={{ background: "linear-gradient(135deg,#00b050,#005c2e)" }}>
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
        .al-input {
          width:100%;padding:0.7rem 0.9rem;font-size:0.9rem;
          border:1.5px solid #e2e8f0;border-radius:10px;
          background:#fafafa;color:#1a1a1a;outline:none;
          transition:border-color 0.15s,box-shadow 0.15s,background 0.15s;
        }
        .al-input:focus { border-color:#00b050;box-shadow:0 0 0 3px rgba(0,176,80,0.1);background:#fff; }
        .al-input::placeholder { color:#b0bec5; }
        .al-btn {
          width:100%;padding:0.8rem;font-size:0.95rem;font-weight:700;
          background:linear-gradient(135deg,#00b050,#009a45);color:#fff;
          border:none;border-radius:10px;cursor:pointer;
          transition:opacity 0.15s,transform 0.1s,box-shadow 0.15s;
          display:flex;align-items:center;justify-content:center;gap:0.5rem;
          box-shadow:0 4px 14px rgba(0,176,80,0.3);letter-spacing:0.01em;
        }
        .al-btn:hover:not(:disabled) { opacity:0.92;box-shadow:0 6px 20px rgba(0,176,80,0.35); }
        .al-btn:active:not(:disabled) { transform:scale(0.98); }
        .al-btn:disabled { opacity:0.45;cursor:not-allowed;box-shadow:none; }
        .al-otp {
          width:100%;padding:0.85rem 1rem;font-size:1.75rem;font-weight:800;
          letter-spacing:0.5em;text-align:center;
          border:2px solid #e2e8f0;border-radius:12px;
          background:#fafafa;color:#1a1a1a;outline:none;
          transition:border-color 0.15s,box-shadow 0.15s;
        }
        .al-otp:focus { border-color:#00b050;box-shadow:0 0 0 3px rgba(0,176,80,0.1);background:#fff; }
      `}</style>

      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: "linear-gradient(145deg,#00b050 0%,#005c2e 60%,#003d1e 100%)" }}>
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 20% 80%,#ffffff 0%,transparent 50%),radial-gradient(circle at 80% 20%,#ffffff 0%,transparent 40%)" }} />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <img src="/robotpay-logo.jpg" alt="WestPay" className="w-9 h-9 rounded-lg object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
            </div>
            <span className="text-2xl font-black text-white tracking-tight">WestPay</span>
          </div>
          <p className="text-white/60 text-sm mt-1">Plateforme de paiement Mobile Money</p>
        </div>

        <div className="relative z-10 space-y-6">
          <div>
            <h2 className="text-3xl xl:text-4xl font-black text-white leading-tight mb-3">
              La plateforme de référence pour le Mobile Money en Afrique
            </h2>
            <p className="text-white/70 text-base leading-relaxed">
              Agrégez, gérez et pilotez vos paiements Mobile Money sur l'ensemble de vos marchands en temps réel.
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
        </div>

        <div className="relative z-10 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
          <span className="text-white/50 text-xs">Système opérationnel</span>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 bg-white">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl overflow-hidden shadow">
              <img src="/robotpay-logo.jpg" alt="WestPay" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
            </div>
            <span className="text-xl font-black text-slate-900">WestPay</span>
          </div>

          {/* ── TOTP SETUP SCREEN (first-time configuration) ── */}
          {totpSetupStep ? (
            <>
              {!setupCodeStep ? (
                /* Step 1: Show QR code */
                <>
                  <div className="mb-6">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 mx-auto"
                      style={{ background: "linear-gradient(135deg,#7c3aed,#4c1d95)" }}>
                      <QrCode className="w-7 h-7 text-white" />
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 text-center mb-1">Configuration 2FA requise</h1>
                    <p className="text-slate-500 text-sm text-center">Votre compte n'a pas encore Google Authenticator activé.</p>
                  </div>

                  <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 mb-5">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-medium text-amber-800">
                      Scannez ce QR code avec <strong>Google Authenticator</strong> sur votre téléphone pour activer la double authentification.
                    </p>
                  </div>

                  {/* ── Code secret — affiché en premier, bien visible ── */}
                  {setupSecret && (
                    <div className="mb-5 rounded-2xl border-2 border-violet-400 bg-violet-50 p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0">
                          <KeyRound className="w-4 h-4 text-white" />
                        </div>
                        <p className="text-sm font-bold text-violet-800">
                          Clé secrète — à entrer dans Google Authenticator
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <code
                          className="flex-1 text-center font-mono text-base font-black text-violet-900 bg-white rounded-xl px-4 py-3 border-2 border-violet-300 tracking-[0.25em] select-all break-all shadow-inner"
                          data-testid="text-totp-secret"
                        >
                          {setupSecret.replace(/(.{4})/g, "$1 ").trim()}
                        </code>
                        <button
                          type="button"
                          onClick={copySecret}
                          className="flex-shrink-0 w-11 h-11 rounded-xl bg-violet-200 hover:bg-violet-300 active:bg-violet-400 flex items-center justify-center transition-colors"
                          title="Copier le code"
                          data-testid="button-copy-secret"
                        >
                          {secretCopied ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5 text-violet-700" />}
                        </button>
                      </div>
                      <p className="text-xs text-violet-600 font-medium">
                        📱 Dans Google Authenticator : appuyez sur <strong>+</strong> → <strong>Clé de configuration</strong> → collez ce code
                      </p>
                    </div>
                  )}

                  {/* ── QR Code ── */}
                  {setupQrCode && (
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-slate-500 text-center mb-2">— ou scannez le QR code —</p>
                      <div className="flex justify-center">
                        <div className="p-3 rounded-2xl border-2 border-violet-200 bg-white shadow-md">
                          <img src={setupQrCode} alt="QR Code Google Authenticator" className="w-44 h-44" data-testid="img-totp-qr" />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 mb-5">
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-violet-700">1</span>
                      </div>
                      <p className="text-sm text-slate-600">Ouvrez <strong>Google Authenticator</strong> sur votre téléphone</p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-violet-700">2</span>
                      </div>
                      <p className="text-sm text-slate-600">Appuyez sur <strong>+</strong> puis <strong>"Scanner un QR code"</strong> <em>(ou "Clé de configuration" pour le code manuel)</em></p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-violet-700">3</span>
                      </div>
                      <p className="text-sm text-slate-600">Scannez le QR code ci-dessus <em>ou</em> entrez le code manuellement</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSetupCodeStep(true)}
                    className="al-btn"
                    style={{ background: "linear-gradient(135deg,#7c3aed,#4c1d95)", boxShadow: "0 4px 14px rgba(124,58,237,0.3)" }}
                    data-testid="button-totp-setup-next"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    J'ai scanné le QR code — Continuer
                  </button>

                  <button
                    type="button"
                    onClick={resetAll}
                    className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium py-2 mt-2"
                    style={{ background: "none", border: "none", cursor: "pointer" }}
                    data-testid="button-back-from-setup"
                  >
                    ← Retour à la connexion
                  </button>
                </>
              ) : (
                /* Step 2: Enter TOTP code to confirm */
                <>
                  <div className="mb-6">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 mx-auto"
                      style={{ background: "linear-gradient(135deg,#7c3aed,#4c1d95)" }}>
                      <Smartphone className="w-7 h-7 text-white" />
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 text-center mb-1">Confirmer le code</h1>
                    <p className="text-slate-500 text-sm text-center">Entrez le code à 6 chiffres affiché dans Google Authenticator pour valider la configuration.</p>
                  </div>

                  <form onSubmit={handleCompleteTotpSetup} className="space-y-5">
                    <div className="flex items-center gap-3 p-3.5 rounded-xl bg-violet-50 border border-violet-100">
                      <Shield className="w-5 h-5 text-violet-600 flex-shrink-0" />
                      <p className="text-sm font-medium text-violet-800">Code valable 30 secondes — renouvelé automatiquement</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-slate-700 text-center">Code Google Authenticator</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        className="al-otp"
                        value={setupCode}
                        onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="000000"
                        autoFocus
                        data-testid="input-totp-setup-code"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={setupLoading || setupCode.length !== 6}
                      className="al-btn"
                      style={{ background: "linear-gradient(135deg,#7c3aed,#4c1d95)", boxShadow: "0 4px 14px rgba(124,58,237,0.3)" }}
                      data-testid="button-complete-totp-setup"
                    >
                      {setupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      {setupLoading ? "Activation en cours..." : "Activer Google Authenticator"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setSetupCodeStep(false)}
                      className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium py-1"
                      style={{ background: "none", border: "none", cursor: "pointer" }}
                      data-testid="button-back-to-qr"
                    >
                      ← Retour au QR code
                    </button>
                  </form>
                </>
              )}
            </>

          ) : totpStep ? (
            /* ── TOTP VERIFY SCREEN (code already configured) ── */
            <>
              <div className="mb-8">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 mx-auto"
                  style={{ background: "linear-gradient(135deg,#7c3aed,#4c1d95)" }}>
                  <Smartphone className="w-7 h-7 text-white" />
                </div>
                <h1 className="text-2xl font-black text-slate-900 text-center mb-1">Google Authenticator</h1>
                <p className="text-slate-500 text-sm text-center">Entrez le code à 6 chiffres de votre application</p>
              </div>

              <form onSubmit={handleVerifyTotp} className="space-y-5">
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-violet-50 border border-violet-100">
                  <Shield className="w-5 h-5 text-violet-600 flex-shrink-0" />
                  <p className="text-sm font-medium text-violet-800">Code temporaire valable 30 secondes</p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700 text-center">Code d'authentification</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    className="al-otp"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    autoFocus
                    data-testid="input-totp-code"
                  />
                </div>

                <button
                  type="submit"
                  disabled={totpLoading || totpCode.length !== 6}
                  className="al-btn"
                  data-testid="button-verify-totp"
                >
                  {totpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  {totpLoading ? "Vérification..." : "Confirmer le code"}
                </button>

                <button
                  type="button"
                  onClick={resetAll}
                  className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium py-1"
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                  data-testid="button-back-from-totp"
                >
                  ← Retour à la connexion
                </button>
              </form>
            </>

          ) : !otpStep ? (
            /* ── MAIN LOGIN FORM ── */
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-black text-slate-900 mb-1">Administration</h1>
                <p className="text-slate-500 text-sm">Accès réservé aux administrateurs autorisés.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">Adresse email</label>
                  <input
                    type="email"
                    className="al-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@westpay.cfd"
                    required
                    autoComplete="username"
                    data-testid="input-admin-email"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">Mot de passe</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      className="al-input"
                      style={{ paddingRight: "2.75rem" }}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      autoComplete="current-password"
                      data-testid="input-admin-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                      data-testid="button-toggle-password"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 0" }}
                      onClick={() => toast({ title: "Accès restreint", description: "Contactez un super-administrateur pour réinitialiser votre mot de passe." })}
                      data-testid="link-admin-forgot-password"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !email || !password}
                  className="al-btn"
                  style={{ marginTop: "0.75rem" }}
                  data-testid="button-admin-login"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  {isLoading ? "Connexion..." : "Se connecter"}
                </button>
              </form>
            </>

          ) : (
            /* ── TELEGRAM OTP SCREEN (fallback) ── */
            <>
              <div className="mb-8">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 mx-auto"
                  style={{ background: "linear-gradient(135deg,#00b050,#005c2e)" }}>
                  <Shield className="w-7 h-7 text-white" />
                </div>
                <h1 className="text-2xl font-black text-slate-900 text-center mb-1">Vérification 2FA</h1>
                <p className="text-slate-500 text-sm text-center">Entrez le code reçu sur Telegram</p>
              </div>

              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-emerald-50 border border-emerald-100">
                  <KeyRound className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  <p className="text-sm font-medium text-emerald-800">Code Telegram envoyé · valable 5 minutes</p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700 text-center">Code de vérification</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    className="al-otp"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    autoFocus
                    data-testid="input-otp-code"
                  />
                </div>

                <button
                  type="submit"
                  disabled={otpLoading || otpCode.length !== 6}
                  className="al-btn"
                  data-testid="button-verify-otp"
                >
                  {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  {otpLoading ? "Vérification..." : "Confirmer le code"}
                </button>

                <button
                  type="button"
                  onClick={resetAll}
                  className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium py-1"
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                  data-testid="button-back-to-login"
                >
                  ← Retour à la connexion
                </button>
              </form>
            </>
          )}

          <p className="text-center text-xs text-slate-300 mt-8">
            © {new Date().getFullYear()} WestPay · Accès sécurisé
          </p>
        </div>
      </div>
    </div>
  );
}
