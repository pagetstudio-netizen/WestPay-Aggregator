import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Shield, Eye, EyeOff, Loader2, Lock } from "lucide-react";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

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
      toast({ title: "Connexion reussie", description: "Redirection vers le tableau de bord..." });
      setTimeout(() => setLocation("/admin-access-9584/dashboard"), 300);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(145deg, #00b050 0%, #009a45 50%, #007034 100%)" }}
    >
      <style>{`
        .admin-login-card input {
          background-color: #f9fafb !important;
          color: #111827 !important;
          border-color: #d1d5db !important;
        }
        .admin-login-card input:focus {
          border-color: #00b050 !important;
          box-shadow: 0 0 0 3px rgba(0,176,80,0.12) !important;
          outline: none;
        }
        .admin-login-card input::placeholder {
          color: #9ca3af !important;
        }
        .admin-login-btn {
          width: 100%;
          background-color: #1f2937;
          color: #fff;
          font-weight: 600;
          font-size: 0.9rem;
          border: none;
          border-radius: 0.5rem;
          padding: 0.7rem 1.5rem;
          cursor: pointer;
          transition: background-color 0.15s, transform 0.1s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }
        .admin-login-btn:hover:not(:disabled) { background-color: #111827; }
        .admin-login-btn:active:not(:disabled) { transform: scale(0.98); }
        .admin-login-btn:disabled { opacity: 0.55; cursor: not-allowed; }
      `}</style>

      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">WestPay</h1>
          <p className="text-white/75 text-sm mt-1">Administration</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-7 admin-login-card" style={{ color: "#1f2937" }}>
          <div className="mb-6">
            <h2 className="text-lg font-bold" style={{ color: "#111827" }}>Accès Administration</h2>
            <p className="text-sm mt-0.5" style={{ color: "#6b7280" }}>Réservé aux administrateurs autorisés</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium" style={{ color: "#374151" }}>
                Adresse email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@westpay.com"
                required
                className="w-full px-3 py-2.5 text-sm border rounded-lg outline-none transition-all"
                data-testid="input-admin-email"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium" style={{ color: "#374151" }}>
                Mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mot de passe administrateur"
                  required
                  className="w-full px-3 py-2.5 pr-10 text-sm border rounded-lg outline-none transition-all"
                  data-testid="input-admin-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "#9ca3af", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="submit"
                disabled={isLoading || !email || !password}
                className="admin-login-btn"
                data-testid="button-admin-login"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Accéder au tableau de bord
              </button>
            </div>
          </form>

          <div className="mt-6 pt-4 border-t" style={{ borderColor: "#f3f4f6" }}>
            <div className="flex items-center gap-2 justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <p className="text-xs" style={{ color: "#9ca3af" }}>
                Accès sécurisé — WestPay Administration
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
