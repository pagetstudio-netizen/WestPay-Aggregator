import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2, Shield, KeyRound } from "lucide-react";

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

    // Canvas fingerprint
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

    // WebGL fingerprint
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

    // Audio context fingerprint
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
    // SHA-256 via Web Crypto API
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(raw);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fp = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("_wp_dfp2", fp);
    return fp;
  } catch {
    // Fallback: simple hash
    const raw = [navigator.userAgent, navigator.language, screen.width, screen.height].join("|");
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(16, "0");
  }
}

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [ipStatus, setIpStatus] = useState<"checking" | "allowed" | "denied">("checking");

  // 2FA state
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/auth/check-ip")
      .then((r) => r.json())
      .then((d) => {
        if (d.allowed === false) {
          setLocation("/ip-verify");
        } else {
          setIpStatus("allowed");
        }
      })
      .catch(() => setIpStatus("allowed"));
    // Pre-build fingerprint in background
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
      if (data.requires2fa) {
        setOtpToken(data.tempToken);
        setOtpStep(true);
        toast({ title: "Code 2FA envoyé", description: "Un code de vérification a été envoyé sur Telegram." });
        return;
      }
      login(data.token, { id: data.user.id, email: data.user.email, role: "admin" });
      toast({ title: "Connexion réussie", description: "Redirection vers le tableau de bord..." });
      setTimeout(() => setLocation("/admin-access-958425546648484886646634808526522886433/dashboard"), 300);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
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
      toast({ title: "Authentification réussie" });
      setTimeout(() => setLocation("/admin-access-958425546648484886646634808526522886433/dashboard"), 300);
    } catch (err: any) {
      toast({ title: "Erreur 2FA", description: err.message, variant: "destructive" });
    } finally {
      setOtpLoading(false);
    }
  }, [otpToken, otpCode, login, setLocation, toast]);

  if (ipStatus === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f5f5f5" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "#00b050" }}>
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#00b050" }} />
            <span className="text-sm font-medium" style={{ color: "#64748b" }}>Vérification de sécurité...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: "#f5f5f5" }}>
      <style>{`
        .wp-admin-input {
          width: 100%;
          padding: 0.65rem 0.875rem;
          font-size: 0.9rem;
          border: 1.5px solid #e2e8f0;
          border-radius: 0.5rem;
          background: #fff;
          color: #1a1a1a;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .wp-admin-input:focus {
          border-color: #00b050;
          box-shadow: 0 0 0 3px rgba(0,176,80,0.1);
        }
        .wp-admin-input::placeholder { color: #a0aec0; }
        .wp-admin-btn {
          width: 100%;
          padding: 0.75rem;
          font-size: 0.95rem;
          font-weight: 600;
          background: #00b050;
          color: #fff;
          border: none;
          border-radius: 0.5rem;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }
        .wp-admin-btn:hover:not(:disabled) { background: #009a45; }
        .wp-admin-btn:active:not(:disabled) { transform: scale(0.98); }
        .wp-admin-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .wp-otp-input {
          width: 100%;
          padding: 0.75rem 1rem;
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: 0.4em;
          text-align: center;
          border: 2px solid #e2e8f0;
          border-radius: 0.5rem;
          background: #fff;
          color: #1a1a1a;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .wp-otp-input:focus {
          border-color: #00b050;
          box-shadow: 0 0 0 3px rgba(0,176,80,0.1);
        }
      `}</style>

      <div className="w-full max-w-[380px]">
        <div className="text-center mb-7">
          <img
            src="/robotpay-logo.jpg"
            alt="WestPay"
            className="w-16 h-16 rounded-2xl object-cover mx-auto mb-4 shadow-sm"
          />
          <h1 className="text-2xl font-bold" style={{ color: "#1a1a1a" }}>
            {otpStep ? "Vérification 2FA" : "Se connecter à votre compte"}
          </h1>
          {otpStep && (
            <p className="text-sm mt-1" style={{ color: "#64748b" }}>Entrez le code reçu sur Telegram</p>
          )}
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
          {!otpStep ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold" style={{ color: "#1a1a1a" }}>
                  Adresse email
                </label>
                <input
                  type="email"
                  className="wp-admin-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Votre adresse email"
                  required
                  data-testid="input-admin-email"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold" style={{ color: "#1a1a1a" }}>
                  Mot de passe
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="wp-admin-input"
                    style={{ paddingRight: "2.5rem" }}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mot de passe administrateur"
                    required
                    data-testid="input-admin-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#a0aec0" }}
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex justify-end mt-1">
                  <button
                    type="button"
                    className="text-sm font-medium"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#00b050", padding: 0 }}
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
                className="wp-admin-btn"
                style={{ marginTop: "0.5rem" }}
                data-testid="button-admin-login"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isLoading ? "Connexion..." : "Se connecter"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div className="flex items-center justify-center gap-3 p-3 rounded-lg" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                <KeyRound className="w-5 h-5 shrink-0" style={{ color: "#00b050" }} />
                <p className="text-sm font-medium" style={{ color: "#166534" }}>Code envoyé sur Telegram — valide 5 minutes</p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-center" style={{ color: "#1a1a1a" }}>
                  Code de vérification
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  className="wp-otp-input"
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
                className="wp-admin-btn"
                data-testid="button-verify-otp"
              >
                {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                {otpLoading ? "Vérification..." : "Confirmer"}
              </button>

              <button
                type="button"
                onClick={() => { setOtpStep(false); setOtpCode(""); setOtpToken(""); }}
                style={{ width: "100%", background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: "0.85rem", padding: "0.25rem" }}
                data-testid="button-back-to-login"
              >
                ← Retour à la connexion
              </button>
            </form>
          )}
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs" style={{ color: "#a0aec0" }}>
            Accès réservé aux administrateurs autorisés — WestPay
          </p>
        </div>
      </div>
    </div>
  );
}
