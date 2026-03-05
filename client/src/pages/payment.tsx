import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, ChevronLeft, ChevronRight, Check, Phone, ExternalLink } from "lucide-react";

type PaymentNumber = {
  id: number;
  phoneNumber: string;
  country: string;
  operator: string | null;
};

type MerchantInfo = {
  name: string;
  slug: string;
  countries: string[];
};

const PAYMENT_METHODS: Record<string, string[]> = {
  "Togo": ["TMoney", "Moov Money"],
  "Benin": ["MTN Mobile Money", "Moov Money"],
  "Cote d'Ivoire": ["Orange Money", "MTN Mobile Money", "Moov Money", "Wave"],
  "Guinee": ["Orange Money", "MTN Mobile Money"],
  "Senegal": ["Orange Money", "Wave"],
  "Mali": ["Orange Money", "Moov Money"],
  "Burkina Faso": ["Orange Money", "Moov Money"],
  "Niger": ["Airtel Money", "Moov Money"],
  "Ghana": ["MTN Mobile Money", "Vodafone Cash"],
  "Nigeria": ["MTN Mobile Money", "Airtel Money"],
};

const DIAL_CODES: Record<string, string> = {
  "Togo": "+228",
  "Benin": "+229",
  "Cote d'Ivoire": "+225",
  "Guinee": "+224",
  "Senegal": "+221",
  "Mali": "+223",
  "Burkina Faso": "+226",
  "Niger": "+227",
  "Ghana": "+233",
  "Nigeria": "+234",
};

export default function PaymentPage() {
  const { toast } = useToast();
  const pathParts = window.location.pathname.split("/");
  const slugFromPath = pathParts.length === 3 && pathParts[1] === "pay" ? pathParts[2] : "";

  const urlParams = new URLSearchParams(window.location.search);
  const merchantSlug = urlParams.get("merchant") || slugFromPath || "";
  const amountParam = urlParams.get("amount");
  const countryParam = urlParams.get("country") || "";
  const redirectUrl = urlParams.get("redirect") || "";
  const omnipayStatusParam = urlParams.get("omnipay_status") || "";

  const amount = amountParam ? parseInt(amountParam, 10) : 0;

  const [step, setStep] = useState(omnipayStatusParam === "complete" ? 3 : 1);
  const [merchantInfo, setMerchantInfo] = useState<MerchantInfo | null>(null);
  const [paymentNumbers, setPaymentNumbers] = useState<PaymentNumber[]>([]);
  const [omnipayCountries, setOmnipayCountries] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [payerPhone, setPayerPhone] = useState("");
  const [payerName, setPayerName] = useState("");
  const [selectedCountry, setSelectedCountry] = useState(countryParam);
  const [selectedMethod, setSelectedMethod] = useState("");
  const [txId, setTxId] = useState("");
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(5);
  const [copied, setCopied] = useState(false);

  const [isOmnipay, setIsOmnipay] = useState(false);
  const [omnipayPaymentUrl, setOmnipayPaymentUrl] = useState<string | null>(null);
  const [omnipayReference, setOmnipayReference] = useState<string | null>(null);
  const [omnipayPolling, setOmnipayPolling] = useState(false);
  const [omnipayFees, setOmnipayFees] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isOmnipayCountry = omnipayCountries.includes(selectedCountry);

  useEffect(() => {
    if (!merchantSlug) {
      setLoadError("Lien de paiement invalide. Parametre 'merchant' manquant.");
      setIsLoading(false);
      return;
    }
    fetchMerchantInfo();
  }, [merchantSlug]);

  const fetchMerchantInfo = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/payment/${merchantSlug}/info`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Marchand introuvable");
      }
      const data = await res.json();
      setMerchantInfo(data.merchant);
      setPaymentNumbers(data.numbers);
      setOmnipayCountries(data.omnipayCountries || []);

      if (countryParam) {
        const match = data.merchant.countries.find(
          (c: string) => c.toLowerCase() === countryParam.toLowerCase()
        );
        if (match) setSelectedCountry(match);
        else if (data.merchant.countries.length > 0) setSelectedCountry(data.merchant.countries[0]);
      } else if (data.merchant.countries.length > 0) {
        setSelectedCountry(data.merchant.countries[0]);
      }
    } catch (err: any) {
      setLoadError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredNumbers = paymentNumbers.filter(
    (n) => n.country.toLowerCase() === selectedCountry.toLowerCase() &&
      (!selectedMethod || (n.operator && n.operator.toLowerCase() === selectedMethod.toLowerCase()))
  );

  const displayNumber = filteredNumbers.length > 0
    ? filteredNumbers[0]
    : paymentNumbers.find((n) => n.country.toLowerCase() === selectedCountry.toLowerCase()) || null;

  const availableMethods = PAYMENT_METHODS[selectedCountry] || [];

  const handleSelectMethod = useCallback((method: string) => {
    setSelectedMethod(method);
  }, []);

  const startOmnipayPolling = (pId: number) => {
    setOmnipayPolling(true);
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/omnipay/payment/${pId}/status`);
        const data = await res.json();

        if (data.status === "confirmed") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setOmnipayPolling(false);
          setStep(3);
        } else if (data.status === "failed") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setOmnipayPolling(false);
          toast({ title: "Paiement echoue", description: "Le paiement a ete refuse ou a expire.", variant: "destructive" });
          setStep(1);
        }
      } catch {
      }
    }, 5000);
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const handleStep1Next = async () => {
    if (!payerPhone.trim()) {
      toast({ title: "Veuillez entrer votre numero de telephone", variant: "destructive" });
      return;
    }
    if (!selectedMethod) {
      toast({ title: "Veuillez choisir une methode de paiement", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const nameParts = (payerName.trim() || "Client WestPay").split(" ");
      const firstName = nameParts[0] || "Client";
      const lastName = nameParts.slice(1).join(" ") || "WestPay";

      const res = await fetch("/api/payment/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantSlug,
          country: selectedCountry,
          amount,
          payerPhone: payerPhone.trim(),
          payerName: payerName.trim() || null,
          paymentMethod: selectedMethod,
          redirectUrl: redirectUrl || null,
          firstName,
          lastName,
          operator: selectedMethod.toLowerCase().includes("wave") ? "wave" : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setPaymentId(data.paymentId);

      if (data.omnipay) {
        setIsOmnipay(true);
        setOmnipayReference(data.omnipayReference);
        setOmnipayFees(data.fees || 0);

        if (data.paymentUrl) {
          setOmnipayPaymentUrl(data.paymentUrl);
          setStep(2);
        } else {
          setStep(2);
          startOmnipayPolling(data.paymentId);
        }
      } else {
        setIsOmnipay(false);
        setStep(2);
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStep2Next = async () => {
    if (!txId.trim()) {
      toast({ title: "Veuillez saisir l'ID de transaction", variant: "destructive" });
      return;
    }

    setIsValidating(true);
    try {
      const res = await fetch("/api/payment/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, txId: txId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setStep(3);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsValidating(false);
    }
  };

  const handleWaveRedirect = () => {
    if (omnipayPaymentUrl) {
      window.open(omnipayPaymentUrl, "_blank");
      if (paymentId) startOmnipayPolling(paymentId);
    }
  };

  useEffect(() => {
    if (step !== 3) return;
    const timer = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (redirectUrl) {
            try {
              const url = new URL(redirectUrl);
              url.searchParams.set("status", "success");
              url.searchParams.set("amount", String(amount));
              url.searchParams.set("tx_id", txId.trim() || omnipayReference || "");
              window.location.href = url.toString();
            } catch {
              window.location.href = redirectUrl;
            }
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  const copyNumber = async (number: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(number);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = number;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      toast({ title: "Numero copie !" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Impossible de copier", description: "Copiez manuellement le numero", variant: "destructive" });
    }
  };

  const formatAmount = (val: number) => val.toLocaleString("fr-FR");

  const dialCode = DIAL_CODES[selectedCountry] || "+";

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#00b050" }}>
        <Loader2 className="w-10 h-10 animate-spin text-white" />
      </div>
    );
  }

  if (loadError || !merchantInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#00b050" }}>
        <div className="bg-white rounded-md p-6 max-w-sm w-full text-center space-y-3" style={{ color: "#1f2937" }}>
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <span className="text-red-600 text-xl font-bold">!</span>
          </div>
          <h2 className="text-lg font-semibold" style={{ color: "#111827" }}>Page introuvable</h2>
          <p className="text-sm" style={{ color: "#6b7280" }}>{loadError || "Ce lien de paiement n'est pas valide."}</p>
        </div>
      </div>
    );
  }

  const stepLabels = ["Informations", "Paiement", "Confirmation"];

  return (
    <div className="min-h-screen payment-page-root" style={{ background: "#00b050" }}>
      <style>{`
        .payment-page-root,
        .payment-page-root * {
          box-sizing: border-box;
        }
        .payment-card {
          color: #1f2937;
        }
        .payment-card input,
        .payment-card select,
        .payment-card textarea {
          color: #111827 !important;
          background-color: #ffffff !important;
          border-color: #d1d5db !important;
          -webkit-text-fill-color: #111827 !important;
        }
        .payment-card input::placeholder {
          color: #9ca3af !important;
          -webkit-text-fill-color: #9ca3af !important;
        }
        .payment-card select option {
          color: #111827 !important;
          background-color: #ffffff !important;
        }
        .payment-card input:focus,
        .payment-card select:focus {
          border-color: #00b050 !important;
          box-shadow: 0 0 0 2px rgba(0, 176, 80, 0.15);
        }
        .pay-method-option {
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          transition: border-color 0.15s, background-color 0.15s;
        }
        .pay-method-option:active {
          transform: scale(0.98);
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
          -webkit-tap-highlight-color: transparent;
          line-height: 1.25rem;
        }
        .pay-btn:active:not(:disabled) {
          transform: scale(0.97);
        }
        .pay-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .pay-btn-primary {
          background-color: #2563eb;
          color: #ffffff;
        }
        .pay-btn-primary:hover:not(:disabled) {
          background-color: #1d4ed8;
        }
        .pay-btn-green {
          background-color: #00b050;
          color: #ffffff;
        }
        .pay-btn-green:hover:not(:disabled) {
          background-color: #009a45;
        }
        .pay-btn-green-sm {
          background-color: #00b050;
          color: #ffffff;
          padding: 0.375rem 1rem;
        }
        .pay-btn-green-sm:hover:not(:disabled) {
          background-color: #009a45;
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.95); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.7; }
          100% { transform: scale(0.95); opacity: 1; }
        }
        .omnipay-pulse {
          animation: pulse-ring 2s ease-in-out infinite;
        }
      `}</style>
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="mb-4">
          <h1 className="text-white font-bold text-lg" data-testid="text-brand">WestPay</h1>
          <p className="text-white/80 text-sm">Assistant de paiement</p>
        </div>

        <div className="mb-4">
          <p className="text-white/80 text-sm">Montant:</p>
          <p className="text-white font-bold text-4xl" data-testid="text-pay-amount">
            {formatAmount(amount)}<span className="text-lg ml-2">XOF</span>
          </p>
          {isOmnipayCountry && step === 1 && (
            <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#fff" }}>
              Paiement automatique via OmniPay
            </span>
          )}
        </div>

        <div className="bg-white rounded-md p-6 payment-card">
          <div className="mb-2">
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#e5e7eb" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: step === 1 ? "33%" : step === 2 ? "66%" : "100%",
                  backgroundColor: "#00b050",
                  transition: "width 0.5s ease-in-out",
                }}
                data-testid="progress-bar"
              />
            </div>
            <p className="text-xs text-right mt-1" style={{ color: "#9ca3af" }} data-testid="text-step-count">
              Etape {step} sur 3
            </p>
          </div>

          <div className="flex items-center justify-between mb-6 px-2">
            {stepLabels.map((label, i) => {
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
                      data-testid={`step-indicator-${stepNum}`}
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
            <div className="space-y-4" data-testid="step-1-content">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#374151" }}>
                  Entrez votre compte bancaire mobile:
                </label>
                <div className="flex items-center border rounded-md overflow-hidden" style={{ borderColor: "#d1d5db" }}>
                  <span className="px-3 py-2 text-sm font-semibold" style={{ color: "#00b050", backgroundColor: "#f9fafb" }}>
                    {dialCode}
                  </span>
                  <input
                    type="tel"
                    value={payerPhone}
                    onChange={(e) => setPayerPhone(e.target.value)}
                    placeholder="Ex: 90123456"
                    className="flex-1 py-2 px-3 text-sm outline-none"
                    style={{ borderLeft: "1px solid #d1d5db" }}
                    data-testid="input-payer-phone"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#374151" }}>
                  Nom complet {isOmnipayCountry ? "" : "(optionnel)"}:
                </label>
                <input
                  type="text"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  placeholder="Ex: Jean Dupont"
                  className="w-full py-2 px-3 text-sm border rounded-md outline-none"
                  data-testid="input-payer-name"
                />
              </div>

              {merchantInfo.countries.length > 1 && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "#374151" }}>Pays:</label>
                  <select
                    value={selectedCountry}
                    onChange={(e) => { setSelectedCountry(e.target.value); setSelectedMethod(""); }}
                    className="w-full py-2 px-3 text-sm border rounded-md outline-none"
                    data-testid="select-country"
                  >
                    {merchantInfo.countries.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "#374151" }}>
                  Choisissez la methode de transfert:
                </label>
                <div className="space-y-2" role="radiogroup" aria-label="Methode de paiement">
                  {availableMethods.map((method) => {
                    const isSelected = selectedMethod === method;
                    return (
                      <div
                        key={method}
                        onClick={() => handleSelectMethod(method)}
                        onTouchEnd={(e) => { e.preventDefault(); handleSelectMethod(method); }}
                        className="pay-method-option flex items-center gap-3 p-3 border rounded-md cursor-pointer"
                        style={{
                          borderColor: isSelected ? "#00b050" : "#e5e7eb",
                          backgroundColor: isSelected ? "#f0fdf4" : "#ffffff",
                        }}
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); handleSelectMethod(method); } }}
                        data-testid={`radio-method-${method.replace(/\s+/g, "-").toLowerCase()}`}
                      >
                        <div
                          className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                          style={{ borderColor: isSelected ? "#00b050" : "#d1d5db" }}
                        >
                          {isSelected && (
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#00b050" }} />
                          )}
                        </div>
                        <span className="text-sm font-medium" style={{ color: "#1f2937" }}>{method}</span>
                      </div>
                    );
                  })}
                </div>
                {availableMethods.length === 0 && (
                  <p className="text-sm mt-2" style={{ color: "#6b7280" }}>Aucune methode disponible pour ce pays.</p>
                )}
              </div>

              {isOmnipayCountry ? (
                <div
                  className="p-3 rounded-md text-sm"
                  style={{ backgroundColor: "#dbeafe", color: "#1e40af" }}
                >
                  Le paiement sera traite automatiquement. Vous recevrez une demande de validation sur votre telephone.
                </div>
              ) : (
                <div
                  className="p-3 rounded-md text-sm"
                  style={{ backgroundColor: "#dcfce7", color: "#166534" }}
                >
                  Veuillez selectionner la meme option que votre methode de transfert.
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleStep1Next}
                  disabled={isSubmitting || !payerPhone.trim() || !selectedMethod}
                  className="pay-btn pay-btn-primary"
                  data-testid="button-step1-next"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {isOmnipayCountry ? "Payer maintenant" : "Suivant"} <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && isOmnipay && (
            <div className="space-y-4" data-testid="step-2-omnipay-content">
              {omnipayPaymentUrl ? (
                <>
                  <div
                    className="p-3 rounded-md text-center text-sm font-medium"
                    style={{ backgroundColor: "#dbeafe", color: "#1e40af" }}
                  >
                    Cliquez sur le bouton ci-dessous pour valider votre paiement de {formatAmount(amount)} XOF
                  </div>

                  {omnipayFees > 0 && (
                    <p className="text-xs text-center" style={{ color: "#6b7280" }}>
                      Frais de transaction: {formatAmount(omnipayFees)} XOF
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={handleWaveRedirect}
                    className="pay-btn pay-btn-green w-full"
                    data-testid="button-wave-pay"
                  >
                    <ExternalLink className="w-4 h-4" /> Valider le paiement
                  </button>

                  {omnipayPolling && (
                    <div className="text-center py-4">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: "#00b050" }} />
                      <p className="text-sm mt-2" style={{ color: "#6b7280" }}>
                        En attente de la confirmation du paiement...
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div
                    className="p-3 rounded-md text-center text-sm font-medium"
                    style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
                  >
                    Une demande de paiement a ete envoyee sur votre telephone
                  </div>

                  <div className="text-center py-6">
                    <div className="omnipay-pulse inline-block">
                      <div
                        className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                        style={{ backgroundColor: "#dcfce7" }}
                      >
                        <Phone className="w-10 h-10" style={{ color: "#00b050" }} />
                      </div>
                    </div>
                    <p className="text-sm mt-4 font-medium" style={{ color: "#374151" }}>
                      Validez le paiement sur votre telephone
                    </p>
                    <p className="text-xs mt-1" style={{ color: "#6b7280" }}>
                      Composez votre code secret pour confirmer la transaction de {formatAmount(amount)} XOF
                    </p>
                    {omnipayFees > 0 && (
                      <p className="text-xs mt-1" style={{ color: "#6b7280" }}>
                        Frais: {formatAmount(omnipayFees)} XOF
                      </p>
                    )}
                  </div>

                  {omnipayPolling && (
                    <div className="flex items-center justify-center gap-2" style={{ color: "#6b7280" }}>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Verification en cours...</span>
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center justify-start pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (pollingRef.current) clearInterval(pollingRef.current);
                    setOmnipayPolling(false);
                    setStep(1);
                  }}
                  className="pay-btn pay-btn-primary"
                  data-testid="button-step2-prev"
                >
                  <ChevronLeft className="w-4 h-4" /> Retour
                </button>
              </div>
            </div>
          )}

          {step === 2 && !isOmnipay && (
            <div className="space-y-4" data-testid="step-2-content">
              <div
                className="p-3 rounded-md text-center text-sm font-medium"
                style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
              >
                Virez {formatAmount(amount)} XOF sur le compte suivant :
              </div>

              <div>
                <p className="text-sm mb-1" style={{ color: "#6b7280" }}>Numero de compte :</p>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-3xl font-bold font-mono" style={{ color: "#111827" }} data-testid="text-account-number">
                    {displayNumber ? displayNumber.phoneNumber : "---"}
                  </p>
                  {displayNumber && (
                    <button
                      type="button"
                      onClick={() => copyNumber(displayNumber.phoneNumber)}
                      className="pay-btn pay-btn-green-sm"
                      style={{ backgroundColor: copied ? "#16a34a" : undefined }}
                      data-testid="button-copy-number"
                    >
                      {copied ? <><Check className="w-4 h-4" /> Copie !</> : <><Copy className="w-4 h-4" /> Copier</>}
                    </button>
                  )}
                </div>
                {displayNumber?.operator && (
                  <p className="text-xs mt-1" style={{ color: "#6b7280" }}>{displayNumber.operator} - {displayNumber.country}</p>
                )}
              </div>

              {displayNumber && (
                <button
                  type="button"
                  className="pay-btn pay-btn-green w-full"
                  onClick={() => {
                    const code = dialCode.replace("+", "");
                    window.location.href = `tel:${code}${displayNumber.phoneNumber}`;
                  }}
                  data-testid="button-go-pay"
                >
                  <Phone className="w-4 h-4" /> Allez payer
                </button>
              )}

              <div
                className="p-3 rounded-md text-sm"
                style={{ backgroundColor: "#dcfce7", color: "#166534" }}
              >
                Une fois le transfert termine, veuillez saisir l'ID de transfert :
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#374151" }}>
                  Entrer l'ID de transfert :
                </label>
                <input
                  type="text"
                  value={txId}
                  onChange={(e) => setTxId(e.target.value.toUpperCase())}
                  placeholder="Ex: TRF123456789"
                  className="w-full py-2 px-3 text-sm border rounded-md outline-none"
                  data-testid="input-tx-id"
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="pay-btn pay-btn-primary"
                  data-testid="button-step2-prev"
                >
                  <ChevronLeft className="w-4 h-4" /> Precedent
                </button>
                <button
                  type="button"
                  onClick={handleStep2Next}
                  disabled={isValidating || !txId.trim()}
                  className="pay-btn pay-btn-primary"
                  data-testid="button-step2-next"
                >
                  {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Suivant <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 text-center py-6" data-testid="step-3-content">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
                style={{ backgroundColor: "#dcfce7" }}
              >
                <Check className="w-8 h-8" style={{ color: "#00b050" }} />
              </div>

              <h2 className="text-lg font-bold" style={{ color: "#111827" }}>
                Merci !
              </h2>
              <p className="text-sm" style={{ color: "#4b5563" }}>
                Votre paiement de <strong>{formatAmount(amount)} XOF</strong> a bien ete {isOmnipay ? "confirme" : "enregistre"}.
              </p>
              {(txId || omnipayReference) && (
                <p className="text-xs" style={{ color: "#6b7280" }}>
                  {isOmnipay ? "Reference" : "ID de transaction"} : <span className="font-mono font-semibold">{txId || omnipayReference}</span>
                </p>
              )}

              {redirectUrl ? (
                <div className="pt-4">
                  <p className="text-sm" style={{ color: "#6b7280" }}>
                    Redirection automatique dans <strong>{redirectCountdown}</strong> seconde{redirectCountdown > 1 ? "s" : ""}...
                  </p>
                  <a
                    href={(() => {
                      try {
                        const url = new URL(redirectUrl);
                        url.searchParams.set("status", "success");
                        url.searchParams.set("amount", String(amount));
                        url.searchParams.set("tx_id", txId.trim() || omnipayReference || "");
                        return url.toString();
                      } catch {
                        return redirectUrl;
                      }
                    })()}
                    className="pay-btn pay-btn-green mt-3 inline-flex"
                    data-testid="link-redirect"
                  >
                    Retourner sur le site
                  </a>
                </div>
              ) : (
                <div className="pt-4">
                  <p className="text-sm" style={{ color: "#6b7280" }}>
                    Vous pouvez fermer cette page.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-white/60 text-xs mt-6">
          Paiement securise via WestPay
        </p>
      </div>
    </div>
  );
}
