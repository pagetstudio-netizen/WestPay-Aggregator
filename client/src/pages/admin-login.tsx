import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2, Shield } from "lucide-react";

export default function AdminLogin() {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur de connexion");
      login(data.token, { id: data.user.id, email: data.user.email, role: "admin" });
      toast({ title: "Connexion réussie", description: "Redirection vers le tableau de bord..." });
      setTimeout(() => setLocation("/admin-access-958425546648484886646634808526522886433/dashboard"), 300);
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
