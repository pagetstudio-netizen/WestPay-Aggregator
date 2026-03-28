import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ChevronRight, Check, Phone, ExternalLink, Bitcoin } from "lucide-react";
import HelpButton from "@/components/HelpButton";

type MerchantInfo = {
  name: string;
  slug: string;
  countries: string[];
};

const PAYMENT_METHODS: Record<string, string[]> = {
  "Togo": ["Moov Money", "TMoney"],
  "Benin": ["MTN Mobile Money"],
  "Burkina Faso": ["Moov Money", "Orange Money"],
  "Cameroun": ["MTN Mobile Money", "Orange Money"],
  "Congo Brazzaville": ["MTN Mobile Money"],
  "Gabon": ["Airtel Money", "Moov Money"],
  "Cote d'Ivoire": ["Moov Money", "MTN Mobile Money", "Orange Money", "Wave"],
  "Mali": ["Orange Money"],
  "Senegal": ["Mixx by Yas", "Orange Money", "Wave"],
};

const DIAL_CODES: Record<string, string> = {
  "Togo": "+228",
  "Benin": "+229",
  "Burkina Faso": "+226",
  "Cameroun": "+237",
  "Congo Brazzaville": "+242",
  "Gabon": "+241",
  "Cote d'Ivoire": "+225",
  "Mali": "+223",
  "Senegal": "+221",
};

export default function PaymentPage() {
  const { toast } = useToast();
  const pathParts = window.location.pathname.split("/");
  const slugFromPath = pathParts.length === 3 && pathParts[1] === "pay" ? pathParts[2] : "";

  const urlParams = new URLSearchParams(window.location.search);
  const merchantSlug = urlParams.get("merchant") || slugFromPath || "";
  const amountParam = urlParams.get("amount");
  const countryParam = urlParams.get("country") || "";
  const redirectUrlParam = urlParams.get("redirect") || "";
  const omnipayStatusParam = urlParams.get("omnipay_status") || "";
  const refParam = urlParams.get("ref") || "";

  const [amount, setAmount] = useState(amountParam ? parseInt(amountParam, 10) : 0);
  const [redirectUrl, setRedirectUrl] = useState(redirectUrlParam);
  const redirectUrlRef = useRef(redirectUrlParam);

  const [step, setStep] = useState(omnipayStatusParam === "complete" ? 3 : 1);
  const [merchantInfo, setMerchantInfo] = useState<MerchantInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [payerPhone, setPayerPhone] = useState("");
  const [payerName, setPayerName] = useState("");
  const [selectedCountry, setSelectedCountry] = useState(countryParam);
  const [selectedMethod, setSelectedMethod] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(5);

  const [omnipayPaymentUrl, setOmnipayPaymentUrl] = useState<string | null>(null);
  const [omnipayReference, setOmnipayReference] = useState<string | null>(null);
  const [omnipayPolling, setOmnipayPolling] = useState(false);
  const [omnipayFees, setOmnipayFees] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [dynamicMethods, setDynamicMethods] = useState<string[] | null>(null);
  const [cryptoEnabled, setCryptoEnabled] = useState(false);
  const [isCryptoLoading, setIsCryptoLoading] = useState(false);

  useEffect(() => {
    if (omnipayStatusParam === "complete" && refParam) {
      setIsLoading(false);
      fetch(`/api/payment/by-ref/${encodeURIComponent(refParam)}`)
        .then(r => r.json())
        .then(d => {
          if (d.amount) setAmount(d.amount);
          if (d.redirectUrl) { setRedirectUrl(d.redirectUrl); redirectUrlRef.current = d.redirectUrl; }
          if (d.omnipayReference) setOmnipayReference(d.omnipayReference);
          if (d.merchantSlug || d.merchantName) {
            setMerchantInfo({
              name: d.merchantName || d.merchantSlug || "",
              slug: d.merchantSlug || "",
              countries: d.country ? [d.country] : [],
            });
          }
        })
        .catch(() => {});
      return;
    }
    if (!merchantSlug) {
      setLoadError("Lien de paiement invalide. Parametre 'merchant' manquant.");
      setIsLoading(false);
      return;
    }
    fetchMerchantInfo();
  }, [merchantSlug]);

  useEffect(() => {
    if (!selectedCountry) return;
    fetch(`/api/public/payment-methods/${encodeURIComponent(selectedCountry)}?type=api`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.methods) && d.methods.length > 0) setDynamicMethods(d.methods); else setDynamicMethods(null); })
      .catch(() => setDynamicMethods(null));
    setSelectedMethod("");
    setOtpCode("");
  }, [selectedCountry]);

  useEffect(() => {
    if (!merchantSlug) return;
    fetch(`/api/public/crypto/check-merchant/${encodeURIComponent(merchantSlug)}`)
      .then(r => r.ok ? r.json() : { enabled: false })
      .then(d => setCryptoEnabled(!!d.enabled))
      .catch(() => setCryptoEnabled(false));
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

  const availableMethods = dynamicMethods ?? (PAYMENT_METHODS[selectedCountry] || []);
  const needsManualOtp = selectedCountry === "Burkina Faso" && selectedMethod === "Orange Money";
  const orangeUssdCode = selectedCountry === "Cote d'Ivoire" ? "*144#" : selectedCountry === "Mali" ? "#144#" : null;
  const needsOrangeInstruction = selectedMethod === "Orange Money" && (selectedCountry === "Cote d'Ivoire" || selectedCountry === "Mali");

  const handleSelectMethod = useCallback((method: string) => {
    setSelectedMethod(method);
    setOtpCode("");
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

  const isCryptoMethod = selectedMethod === "crypto";

  const handleStep1Next = async () => {
    if (!selectedMethod) {
      toast({ title: "Veuillez choisir une methode de paiement", variant: "destructive" });
      return;
    }

    if (isCryptoMethod) {
      setIsCryptoLoading(true);
      try {
        const res = await fetch("/api/payment/crypto/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merchantSlug,
            amount,
            currency: "XOF",
            returnUrl: redirectUrl || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        window.location.replace(`/pay/crypto/${data.trackId}`);
      } catch (err: any) {
        toast({ title: "Erreur crypto", description: err.message, variant: "destructive" });
      } finally {
        setIsCryptoLoading(false);
      }
      return;
    }

    if (!payerPhone.trim()) {
      toast({ title: "Veuillez entrer votre numero de telephone", variant: "destructive" });
      return;
    }
    if (needsManualOtp && !otpCode.trim()) {
      toast({ title: "Veuillez entrer votre code OTP Orange Money", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const firstName = "Client";
      const lastName = "RobotPay";

      const res = await fetch("/api/payment/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantSlug,
          country: selectedCountry,
          amount,
          payerPhone: payerPhone.trim(),
          payerName: payerName.trim(),
          paymentMethod: selectedMethod,
          redirectUrl: redirectUrl || null,
          firstName,
          lastName,
          operator: selectedMethod.toLowerCase().includes("wave") ? "wave" : undefined,
          otp: needsManualOtp ? otpCode.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setPaymentId(data.paymentId);
      setOmnipayReference(data.omnipayReference);
      setOmnipayFees(data.fees || 0);

      if (data.paymentUrl) {
        setOmnipayPaymentUrl(data.paymentUrl);
        setStep(2);
      } else {
        setStep(2);
        startOmnipayPolling(data.paymentId);
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWaveRedirect = () => {
    if (omnipayPaymentUrl) {
      window.open(omnipayPaymentUrl, "_blank");
      if (paymentId) startOmnipayPolling(paymentId);
    }
  };

  const safeRedirect = (rawUrl: string, extra?: Record<string, string>) => {
    const normalized = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    try {
      const url = new URL(normalized);
      if (extra) Object.entries(extra).forEach(([k, v]) => url.searchParams.set(k, v));
      window.location.replace(url.toString());
    } catch {
      window.location.replace(normalized);
    }
  };

  useEffect(() => {
    if (step !== 3) return;
    const timer = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          const currentRedirectUrl = redirectUrlRef.current;
          if (currentRedirectUrl) {
            safeRedirect(currentRedirectUrl, {
              status: "success",
              amount: String(amount),
              ref: omnipayReference || "",
            });
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  const formatAmount = (val: number) => val.toLocaleString("fr-FR");

  const dialCode = DIAL_CODES[selectedCountry] || "+";

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#00b050" }}>
        <Loader2 className="w-10 h-10 animate-spin text-white" />
      </div>
    );
  }

  if ((loadError || !merchantInfo) && step !== 3) {
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

  const stepLabels = ["Informations", "Validation", "Confirmation"];

  return (
    <div className="min-h-screen payment-page-root flex flex-col items-center justify-center" style={{ background: "#00b050" }}>
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
        @keyframes pulse-ring {
          0% { transform: scale(0.95); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.7; }
          100% { transform: scale(0.95); opacity: 1; }
        }
        .omnipay-pulse {
          animation: pulse-ring 2s ease-in-out infinite;
        }
      `}</style>
      <div className="w-full max-w-[420px] px-4 py-3">
        <div className="mb-2">
          <h1 className="text-white font-bold text-lg" data-testid="text-brand">RobotPay</h1>
          <p className="text-white/80 text-sm">Paiement securise</p>
        </div>

        <div className="mb-3">
          <p className="text-white/80 text-xs">Montant:</p>
          <p className="text-white font-bold text-3xl" data-testid="text-pay-amount">
            {formatAmount(amount)}<span className="text-base ml-2">XOF</span>
          </p>
        </div>

        <div className="bg-white rounded-lg p-4 payment-card">
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

          <div className="flex items-center justify-between mb-4 px-2">
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
            <div className="space-y-3" data-testid="step-1-content">
              {!isCryptoMethod && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "#374151" }}>
                    Numero de telephone mobile:
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
              )}

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
                  Methode de paiement:
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

                  {cryptoEnabled && (
                    <div
                      onClick={() => handleSelectMethod("crypto")}
                      onTouchEnd={(e) => { e.preventDefault(); handleSelectMethod("crypto"); }}
                      className="pay-method-option flex items-center gap-3 p-3 border rounded-md cursor-pointer"
                      style={{
                        borderColor: isCryptoMethod ? "#f59e0b" : "#e5e7eb",
                        backgroundColor: isCryptoMethod ? "#fffbeb" : "#ffffff",
                      }}
                      role="radio"
                      aria-checked={isCryptoMethod}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); handleSelectMethod("crypto"); } }}
                      data-testid="radio-method-crypto"
                    >
                      <div
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                        style={{ borderColor: isCryptoMethod ? "#f59e0b" : "#d1d5db" }}
                      >
                        {isCryptoMethod && (
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#f59e0b" }} />
                        )}
                      </div>
                      <Bitcoin className="w-4 h-4 shrink-0" style={{ color: "#f59e0b" }} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium block" style={{ color: "#1f2937" }}>
                          Crypto (via OxaPay)
                        </span>
                        <span className="text-xs" style={{ color: "#9ca3af" }}>
                          USDT · BTC · ETH · LTC · TRX et plus
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                {availableMethods.length === 0 && !cryptoEnabled && (
                  <p className="text-sm mt-2" style={{ color: "#6b7280" }}>Aucune methode disponible pour ce pays.</p>
                )}
              </div>

              {isCryptoMethod && (
                <div
                  className="p-3 rounded-md text-xs space-y-1"
                  style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}
                  data-testid="crypto-info-block"
                >
                  <p className="font-semibold" style={{ color: "#78350f" }}>Paiement en crypto-monnaie</p>
                  <p>Vous allez etre redirige vers une page de paiement securisee ou vous pourrez scanner un QR code ou copier l'adresse de paiement.</p>
                  <p>Equivalence FCFA → crypto calculee en temps reel par OxaPay.</p>
                </div>
              )}

              {needsManualOtp && !isCryptoMethod && (
                <div
                  className="p-3 rounded-md space-y-2"
                  style={{ backgroundColor: "#fff7ed", border: "1px solid #fed7aa" }}
                  data-testid="otp-orange-bfa-block"
                >
                  <p className="text-xs font-semibold" style={{ color: "#c2410c" }}>
                    Orange Money Burkina Faso — Code OTP requis
                  </p>
                  <p className="text-xs" style={{ color: "#92400e" }}>
                    Composez <span className="font-bold font-mono">*144*4*6*montant#</span> sur votre telephone pour recevoir votre code OTP, puis entrez-le ci-dessous.
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={8}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="Entrez votre code OTP"
                    className="w-full py-2 px-3 text-sm border rounded-md outline-none"
                    style={{ borderColor: "#fb923c", backgroundColor: "#ffffff", color: "#111827" }}
                    data-testid="input-otp-orange-bfa"
                  />
                </div>
              )}

              {needsOrangeInstruction && !isCryptoMethod && (
                <div
                  className="p-3 rounded-md space-y-2"
                  style={{ backgroundColor: "#fff7ed", border: "1px solid #fed7aa" }}
                  data-testid="orange-instruction-block"
                >
                  <p className="text-xs font-semibold" style={{ color: "#c2410c" }}>
                    Orange Money — Instructions de validation
                  </p>
                  <p className="text-xs" style={{ color: "#92400e" }}>
                    Veuillez valider le paiement sur votre telephone Orange Money.
                  </p>
                  <p className="text-xs" style={{ color: "#92400e" }}>
                    Si vous ne recevez pas de notification, composez{" "}
                    <span className="font-bold font-mono">{orangeUssdCode}</span>{" "}
                    sur votre telephone.
                  </p>
                  <p className="text-xs" style={{ color: "#92400e" }}>
                    Ensuite, accedez au menu <strong>Paiement</strong> ou <strong>Transactions</strong>, puis validez l'operation en entrant votre code secret.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleStep1Next}
                  disabled={
                    isSubmitting ||
                    isCryptoLoading ||
                    !selectedMethod ||
                    (!isCryptoMethod && !payerPhone.trim()) ||
                    (needsManualOtp && !isCryptoMethod && !otpCode.trim())
                  }
                  className="pay-btn pay-btn-green"
                  data-testid="button-step1-next"
                >
                  {(isSubmitting || isCryptoLoading) ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {isCryptoMethod ? "Payer en crypto" : "Payer maintenant"}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3" data-testid="step-2-omnipay-content">
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

                  <div className="text-center py-3">
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

                  {needsOrangeInstruction && (
                    <div
                      className="p-3 rounded-md space-y-1 text-left"
                      style={{ backgroundColor: "#fff7ed", border: "1px solid #fed7aa" }}
                      data-testid="orange-instruction-step2"
                    >
                      <p className="text-xs font-semibold" style={{ color: "#c2410c" }}>
                        Orange Money — Comment valider ?
                      </p>
                      <p className="text-xs" style={{ color: "#92400e" }}>
                        Si vous ne recevez pas de notification, composez{" "}
                        <span className="font-bold font-mono">{orangeUssdCode}</span>{" "}
                        sur votre telephone.
                      </p>
                      <p className="text-xs" style={{ color: "#92400e" }}>
                        Accedez au menu <strong>Paiement</strong> ou <strong>Transactions</strong>, puis validez en entrant votre code secret.
                      </p>
                    </div>
                  )}

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
                  Retour
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 text-center py-4" data-testid="step-3-content">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
                style={{ backgroundColor: "#dcfce7" }}
              >
                <Check className="w-8 h-8" style={{ color: "#00b050" }} />
              </div>

              <h2 className="text-lg font-bold" style={{ color: "#111827" }}>
                Paiement confirme !
              </h2>
              <p className="text-sm" style={{ color: "#4b5563" }}>
                Votre paiement de <strong>{formatAmount(amount)} XOF</strong> a ete confirme avec succes.
              </p>
              {omnipayReference && (
                <p className="text-xs" style={{ color: "#6b7280" }}>
                  Reference : <span className="font-mono font-semibold">{omnipayReference}</span>
                </p>
              )}

              {redirectUrl ? (
                <div className="pt-4">
                  <p className="text-sm" style={{ color: "#6b7280" }}>
                    Redirection automatique dans <strong>{redirectCountdown}</strong> seconde{redirectCountdown > 1 ? "s" : ""}...
                  </p>
                  <a
                    href={(() => {
                      const normalized = /^https?:\/\//i.test(redirectUrl) ? redirectUrl : `https://${redirectUrl}`;
                      try {
                        const url = new URL(normalized);
                        url.searchParams.set("status", "success");
                        url.searchParams.set("amount", String(amount));
                        url.searchParams.set("ref", omnipayReference || "");
                        return url.toString();
                      } catch {
                        return normalized;
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

        <p className="text-center text-white/60 text-xs mt-3">
          Paiement securise via RobotPay
        </p>
        <HelpButton />
      </div>
    </div>
  );
}
