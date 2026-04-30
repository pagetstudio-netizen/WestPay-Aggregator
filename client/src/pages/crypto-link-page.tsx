import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Check, ExternalLink } from "lucide-react";

type LinkInfo = {
  uniqueId: string;
  name: string;
  currency: string;
  amountType: string;
  amount: string | null;
  description: string | null;
  returnUrl: string | null;
  merchantName: string;
  merchantSlug: string;
};

export default function CryptoLinkPage() {
  const [, params] = useRoute("/c/:uniqueId");
  const uniqueId = params?.uniqueId || "";

  const [step, setStep] = useState(1);
  const [customAmount, setCustomAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [paymentUrl, setPaymentUrl] = useState("");

  const { data: link, isLoading, isError } = useQuery<LinkInfo>({
    queryKey: ["/api/crypto-link", uniqueId],
    queryFn: async () => {
      const res = await fetch(`/api/crypto-link/${uniqueId}`);
      if (!res.ok) throw new Error("Lien introuvable");
      return res.json();
    },
    enabled: !!uniqueId,
    retry: false,
  });

  useEffect(() => {
    document.title = link ? `Payer ${link.merchantName} — RobotPay` : "Paiement — RobotPay";
  }, [link]);

  const isLibre = link?.amountType === "libre";
  const fixedAmount = link?.amount ? parseFloat(link.amount) : null;

  const displayAmount = isLibre
    ? (customAmount ? parseFloat(customAmount) : null)
    : fixedAmount;

  const handlePay = async () => {
    if (isLibre && (!customAmount || parseFloat(customAmount) <= 0)) {
      setError("Veuillez saisir un montant valide");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const body: any = {};
      if (isLibre) body.customAmount = parseFloat(customAmount);
      const res = await fetch(`/api/crypto-link/${uniqueId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur lors de la création du paiement");
      setPaymentUrl(data.paymentUrl);
      setStep(2);
      setTimeout(() => { window.location.href = data.paymentUrl; }, 1500);
    } catch (e: any) {
      setError(e.message || "Erreur inattendue");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#00b050" }}>
        <Loader2 className="w-10 h-10 animate-spin text-white" />
      </div>
    );
  }

  if (isError || !link) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#00b050" }}>
        <div className="bg-white rounded-md p-6 max-w-sm w-full text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <span className="text-red-600 text-xl font-bold">!</span>
          </div>
          <h2 className="text-lg font-semibold" style={{ color: "#111827" }}>Page introuvable</h2>
          <p className="text-sm" style={{ color: "#6b7280" }}>Ce lien de paiement n'est pas valide.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: "#00b050" }}>
      <style>{`
        .crypto-card { color: #1f2937; }
        .crypto-card input {
          color: #111827 !important;
          background-color: #ffffff !important;
          border-color: #d1d5db !important;
          -webkit-text-fill-color: #111827 !important;
        }
        .crypto-card input::placeholder {
          color: #9ca3af !important;
          -webkit-text-fill-color: #9ca3af !important;
        }
        .crypto-card input:focus {
          border-color: #00b050 !important;
          box-shadow: 0 0 0 2px rgba(0,176,80,0.15);
          outline: none;
        }
        .pay-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          font-weight: 600;
          font-size: 0.875rem;
          border-radius: 0.375rem;
          padding: 0.625rem 1.5rem;
          border: none;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.1s;
        }
        .pay-btn:active:not(:disabled) { transform: scale(0.97); }
        .pay-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .pay-btn-green { background-color: #00b050; color: #ffffff; }
        .pay-btn-green:hover:not(:disabled) { background-color: #009a45; }
      `}</style>

      <div className="w-full max-w-[420px] px-4 py-3">
        <div className="mb-2">
          <h1 className="text-white font-bold text-lg">RobotPay</h1>
          <p className="text-white/80 text-sm">Paiement sécurisé</p>
        </div>

        <div className="mb-3">
          <p className="text-white/80 text-xs">Montant :</p>
          {displayAmount !== null ? (
            <p className="text-white font-bold text-3xl">
              {displayAmount.toLocaleString("fr-FR")}
              <span className="text-base ml-2">{link.currency}</span>
            </p>
          ) : (
            <p className="text-white font-bold text-2xl opacity-60">Montant libre</p>
          )}
        </div>

        <div className="bg-white rounded-lg p-4 crypto-card">
          <div className="mb-2">
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#e5e7eb" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: step === 1 ? "50%" : "100%",
                  backgroundColor: "#00b050",
                  transition: "width 0.5s ease-in-out",
                }}
              />
            </div>
            <p className="text-xs text-right mt-1" style={{ color: "#9ca3af" }}>
              Étape {step} sur 2
            </p>
          </div>

          <div className="flex items-center justify-around mb-4 px-2">
            {["Informations", "Confirmation"].map((label, i) => {
              const stepNum = i + 1;
              const isActive = step === stepNum;
              const isDone = step > stepNum;
              return (
                <div key={stepNum} className="flex flex-col items-center relative" style={{ flex: 1 }}>
                  {i > 0 && (
                    <div
                      className="absolute top-3 right-1/2 h-0.5"
                      style={{
                        width: "100%",
                        backgroundColor: isDone || isActive ? "#00b050" : "#d1d5db",
                      }}
                    />
                  )}
                  <div className="relative z-10 flex flex-col items-center">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2"
                      style={{
                        borderColor: isActive || isDone ? "#00b050" : "#d1d5db",
                        backgroundColor: isDone ? "#00b050" : "#ffffff",
                        color: isDone ? "#ffffff" : isActive ? "#00b050" : "#9ca3af",
                      }}
                    >
                      {isDone ? <Check className="w-4 h-4" /> : stepNum}
                    </div>
                    <p
                      className="text-xs text-center mt-1 leading-tight"
                      style={{ color: isActive || isDone ? "#00b050" : "#9ca3af" }}
                    >
                      {label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: "#374151" }}>Marchand</p>
                <p className="text-base font-bold" style={{ color: "#111827" }}>{link.merchantName}</p>
              </div>

              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: "#374151" }}>Objet du paiement</p>
                <p className="text-sm" style={{ color: "#4b5563" }}>{link.name}</p>
              </div>

              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: "#374151" }}>Devise de paiement</p>
                <span
                  className="inline-block px-3 py-1 rounded-full text-sm font-bold"
                  style={{ background: "#fff8e1", color: "#b45309" }}
                >
                  {link.currency}
                </span>
              </div>

              {isLibre && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "#374151" }}>
                    Montant à payer ({link.currency})
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    placeholder="ex: 10"
                    value={customAmount}
                    onChange={e => setCustomAmount(e.target.value)}
                    className="w-full py-2 px-3 text-sm border rounded-md"
                    data-testid="input-crypto-amount"
                  />
                </div>
              )}

              {error && (
                <div className="text-xs p-2 rounded-md" style={{ background: "#fef2f2", color: "#b91c1c" }}>
                  {error}
                </div>
              )}

              <button
                onClick={handlePay}
                disabled={submitting || (isLibre && !customAmount)}
                className="pay-btn pay-btn-green w-full"
                data-testid="btn-pay-crypto"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Création du paiement…
                  </>
                ) : (
                  "Payer maintenant"
                )}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 text-center py-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: "#f0fdf4" }}>
                <Check className="w-8 h-8" style={{ color: "#00b050" }} />
              </div>
              <div>
                <p className="font-semibold text-base" style={{ color: "#111827" }}>Paiement en cours de traitement</p>
                <p className="text-sm mt-1" style={{ color: "#6b7280" }}>Redirection vers la page de paiement…</p>
              </div>
              <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: "#00b050" }} />
              {paymentUrl && (
                <a
                  href={paymentUrl}
                  className="text-xs underline flex items-center justify-center gap-1"
                  style={{ color: "#6b7280" }}
                >
                  Cliquez ici si la redirection ne fonctionne pas <ExternalLink size={11} />
                </a>
              )}
            </div>
          )}

          <div className="mt-4 pt-3" style={{ borderTop: "1px solid #e5e7eb" }}>
            <p className="text-xs text-center" style={{ color: "#9ca3af" }}>
              Paiement sécurisé via RobotPay · {link.currency}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
