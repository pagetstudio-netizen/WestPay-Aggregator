import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, Bitcoin, ArrowRight, ExternalLink } from "lucide-react";

type MerchantInfo = {
  id: number;
  name: string;
  slug: string;
};

export default function CryptoLinkPage() {
  const [, params] = useRoute("/c/:slug");
  const slug = params?.slug || "";

  const urlParams = new URLSearchParams(window.location.search);
  const currency = urlParams.get("currency") || "USDT";
  const amountParam = urlParams.get("amount");
  const descriptionParam = urlParams.get("description") || "";
  const returnUrl = urlParams.get("returnUrl") || "";
  const isLibre = !amountParam || amountParam === "0";

  const [customAmount, setCustomAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paymentUrl, setPaymentUrl] = useState("");

  const { data: merchant, isLoading: merchantLoading, isError } = useQuery<MerchantInfo>({
    queryKey: ["/api/merchant/public", slug],
    queryFn: async () => {
      const res = await fetch(`/api/merchant/public/${slug}`);
      if (!res.ok) throw new Error("Marchand introuvable");
      return res.json();
    },
    enabled: !!slug,
    retry: false,
  });

  useEffect(() => {
    document.title = merchant ? `Payer ${merchant.name} en crypto` : "Paiement crypto — RobotPay";
  }, [merchant]);

  const handlePay = async () => {
    const amt = isLibre ? parseFloat(customAmount) : parseFloat(amountParam!);
    if (isNaN(amt) || amt <= 0) {
      setError("Veuillez saisir un montant valide");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/pay-crypto/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, currency, description: descriptionParam, returnUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur lors de la création du paiement");
      setPaymentUrl(data.paymentUrl);
      window.location.href = data.paymentUrl;
    } catch (e: any) {
      setError(e.message || "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  };

  if (merchantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f8fafc" }}>
        <Loader2 className="animate-spin text-blue-600" size={36} />
      </div>
    );
  }

  if (isError || !merchant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6" style={{ background: "#f8fafc" }}>
        <AlertCircle className="text-red-500" size={40} />
        <p className="text-base font-semibold text-red-600">Lien de paiement invalide ou expiré</p>
        <p className="text-sm text-gray-500">Ce lien ne correspond à aucun marchand actif.</p>
      </div>
    );
  }

  if (paymentUrl) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6" style={{ background: "#f8fafc" }}>
        <Loader2 className="animate-spin text-blue-600" size={36} />
        <p className="text-sm text-gray-600">Redirection vers la page de paiement…</p>
        <a href={paymentUrl} className="text-xs text-blue-600 underline flex items-center gap-1">
          Cliquez ici si la redirection ne fonctionne pas <ExternalLink size={12} />
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: "#f8fafc" }}>
      <div className="w-full max-w-sm rounded-2xl shadow-lg overflow-hidden" style={{ background: "#fff" }}>
        <div className="p-5" style={{ background: "linear-gradient(135deg, #1a237e 0%, #283593 100%)" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.15)" }}>
              <Bitcoin size={20} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>Paiement crypto via RobotPay</p>
              <p className="text-base font-bold text-white">{merchant.name}</p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {descriptionParam && (
            <div className="rounded-xl p-3" style={{ background: "#f1f5f9" }}>
              <p className="text-xs text-gray-500 mb-0.5">Description</p>
              <p className="text-sm font-semibold text-gray-800">{descriptionParam}</p>
            </div>
          )}

          <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: "#dcfce7", color: "#166534" }}>{currency}</span>
            {isLibre ? (
              <p className="text-sm text-gray-500">Montant libre</p>
            ) : (
              <p className="text-lg font-bold text-gray-800">{parseFloat(amountParam!).toLocaleString("fr-FR")} <span className="text-sm font-medium text-gray-500">{currency}</span></p>
            )}
          </div>

          {isLibre && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Montant à payer ({currency})</label>
              <input
                type="number"
                min="0.01"
                step="any"
                placeholder={`ex: 10`}
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: "#e2e8f0" }}
                data-testid="input-crypto-amount"
              />
            </div>
          )}

          {error && (
            <div className="rounded-lg p-3 text-xs flex items-center gap-2" style={{ background: "#ffebee", color: "#c62828" }}>
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <button
            onClick={handlePay}
            disabled={loading}
            className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-opacity"
            style={{ background: loading ? "#c5cae9" : "#1a237e", color: "#fff" }}
            data-testid="btn-pay-crypto"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Création du paiement…
              </>
            ) : (
              <>
                Payer maintenant
                <ArrowRight size={16} />
              </>
            )}
          </button>

          <p className="text-center text-xs" style={{ color: "#94a3b8" }}>
            Sécurisé par RobotPay · Paiement en {currency}
          </p>
        </div>
      </div>
    </div>
  );
}
