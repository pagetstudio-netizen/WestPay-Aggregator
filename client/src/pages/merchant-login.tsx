import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2, Shield } from "lucide-react";

export default function MerchantLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [ipStatus, setIpStatus] = useState<"checking" | "allowed" | "denied">("checking");
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
  }, [setLocation]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      login(data.token, {
        id: data.user.id,
        email: data.user.email,
        role: "merchant",
        name: data.user.name,
        slug: data.user.slug,
      });
      toast({ title: "Connexion réussie", description: "Redirection vers votre espace..." });
      const slug = data.user.slug;
      setTimeout(() => setLocation(`/merchant/${slug}`), 300);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

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
        .wp-login-input {
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
        .wp-login-input:focus {
          border-color: #00b050;
          box-shadow: 0 0 0 3px rgba(0,176,80,0.1);
        }
        .wp-login-input::placeholder { color: #a0aec0; }
        .wp-login-btn {
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
        .wp-login-btn:hover:not(:disabled) { background: #009a45; }
        .wp-login-btn:active:not(:disabled) { transform: scale(0.98); }
        .wp-login-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .wp-signup-btn {
          width: 100%;
          padding: 0.75rem;
          font-size: 0.95rem;
          font-weight: 500;
          background: #fff;
          color: #1a1a1a;
          border: 1.5px solid #e2e8f0;
          border-radius: 0.5rem;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .wp-signup-btn:hover { background: #f7fafc; border-color: #cbd5e0; }
      `}</style>

      <div className="w-full max-w-[380px]">
        <div className="text-center mb-7">
          <img
            src="/robotpay-logo.jpg"
            alt="WestPay"
            className="w-16 h-16 rounded-2xl object-cover mx-auto mb-4 shadow-sm"
          />
          <h1 className="text-2xl font-bold" style={{ color: "#1a1a1a" }}>
            Se connecter à votre compte
          </h1>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold" style={{ color: "#1a1a1a" }}>
                Adresse email
              </label>
              <input
                type="email"
                className="wp-login-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="marchand@exemple.com"
                required
                data-testid="input-merchant-email"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold" style={{ color: "#1a1a1a" }}>
                Mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="wp-login-input"
                  style={{ paddingRight: "2.5rem" }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Votre mot de passe"
                  required
                  data-testid="input-merchant-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#a0aec0" }}
                  data-testid="button-toggle-merchant-password"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex justify-end mt-1">
                <button
                  type="button"
                  className="text-sm font-medium"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#00b050", padding: 0 }}
                  onClick={() => toast({ title: "Mot de passe oublié", description: "Contactez le support pour réinitialiser votre mot de passe." })}
                  data-testid="link-forgot-password"
                >
                  Mot de passe oublié ?
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="wp-login-btn"
              style={{ marginTop: "0.5rem" }}
              data-testid="button-merchant-login"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isLoading ? "Connexion..." : "Se connecter"}
            </button>
          </form>
        </div>

        <div className="mt-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px" style={{ background: "#e2e8f0" }} />
            <span className="text-sm" style={{ color: "#a0aec0", whiteSpace: "nowrap" }}>
              Vous n'avez pas de compte ?
            </span>
            <div className="flex-1 h-px" style={{ background: "#e2e8f0" }} />
          </div>
          <button
            type="button"
            className="wp-signup-btn"
            onClick={() => toast({ title: "Créer un compte", description: "Contactez notre équipe pour créer votre compte marchand." })}
            data-testid="button-merchant-signup"
          >
            Créer un compte
          </button>
        </div>
      </div>
    </div>
  );
}
