import { useState, useEffect } from "react";
import { Shield, Copy, CheckCircle, Loader2, Lock, Wifi } from "lucide-react";

export default function IpVerificationPage() {
  const [ip, setIp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    fetch("/api/auth/my-ip")
      .then((r) => r.json())
      .then((d) => {
        setIp(d.ip || "Chargement...");
        setChecking(false);
      })
      .catch(() => {
        setIp("Non détectée");
        setChecking(false);
      });

    const interval = setInterval(() => setPulse((p) => !p), 2000);
    return () => clearInterval(interval);
  }, []);

  const handleCopy = () => {
    if (!ip) return;
    navigator.clipboard.writeText(ip).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)" }}>
      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes shimmer { 0%{opacity:0.4} 50%{opacity:1} 100%{opacity:0.4} }
        @keyframes scan { 0%{top:0} 100%{top:100%} }
        .ip-float { animation: float 4s ease-in-out infinite; }
        .ip-shimmer { animation: shimmer 2s ease-in-out infinite; }
        .copy-btn:hover { background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.5); }
        .copy-btn:active { transform: scale(0.97); }
      `}</style>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="ip-float inline-block mb-5">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto relative" style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)", boxShadow: "0 0 40px rgba(99,102,241,0.4)" }}>
              <Shield className="w-10 h-10 text-white" />
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "#10b981" }}>
                <Lock className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">
            Vérification de sécurité WestPay
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
            Pour protéger les comptes marchands et les opérations financières,
            l'accès à cette plateforme nécessite une autorisation préalable de votre adresse IP.
          </p>
        </div>

        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(20px)" }}>
          <div className="p-5 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2 mb-1">
              <Wifi className="w-4 h-4" style={{ color: "#94a3b8" }} />
              <span className="text-xs font-medium uppercase tracking-widest" style={{ color: "#64748b" }}>
                Votre adresse IP détectée
              </span>
            </div>

            {checking ? (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#6366f1" }} />
                <span className="text-sm" style={{ color: "#94a3b8" }}>Détection en cours...</span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 mt-2">
                <span className="text-xl font-bold font-mono tracking-wide" style={{ color: "#e2e8f0" }} data-testid="text-user-ip">
                  {ip}
                </span>
                <button
                  onClick={handleCopy}
                  className="copy-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
                  style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", color: copied ? "#10b981" : "#818cf8", cursor: "pointer" }}
                  data-testid="button-copy-ip"
                >
                  {copied ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      Copié
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copier mon IP
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="p-5">
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold" style={{ background: "rgba(99,102,241,0.2)", color: "#818cf8" }}>1</div>
                <div>
                  <p className="text-sm font-medium" style={{ color: "#e2e8f0" }}>Copiez votre adresse IP</p>
                  <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>Utilisez le bouton "Copier mon IP" ci-dessus</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold" style={{ background: "rgba(99,102,241,0.2)", color: "#818cf8" }}>2</div>
                <div>
                  <p className="text-sm font-medium" style={{ color: "#e2e8f0" }}>Contactez l'administrateur</p>
                  <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>Transmettez votre IP via Telegram ou WhatsApp</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold" style={{ background: "rgba(99,102,241,0.2)", color: "#818cf8" }}>3</div>
                <div>
                  <p className="text-sm font-medium" style={{ color: "#e2e8f0" }}>Attendez la validation</p>
                  <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>L'accès sera activé dès que l'admin autorise votre IP</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-xl p-4 flex items-start gap-3" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
          <div className="w-2 h-2 rounded-full shrink-0 mt-1.5 ip-shimmer" style={{ background: "#10b981" }} />
          <p className="text-xs leading-relaxed" style={{ color: "#6ee7b7" }}>
            Une fois votre IP autorisée, revenez sur cette page — vous serez redirigé automatiquement vers la connexion.
          </p>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "#334155" }}>
          WestPay — Plateforme de paiement sécurisée
        </p>
      </div>
    </div>
  );
}
