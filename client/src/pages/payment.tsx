import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, ChevronLeft, ChevronRight, Check } from "lucide-react";

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
  "Cote d'Ivoire": ["Orange Money", "MTN Mobile Money", "Moov Money"],
  "Guinee": ["Orange Money", "MTN Mobile Money"],
  "Senegal": ["Orange Money", "Wave"],
  "Mali": ["Orange Money", "Moov Money"],
  "Burkina Faso": ["Orange Money", "Moov Money"],
  "Niger": ["Airtel Money", "Moov Money"],
  "Ghana": ["MTN Mobile Money", "Vodafone Cash"],
  "Nigeria": ["MTN Mobile Money", "Airtel Money"],
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

  const amount = amountParam ? parseInt(amountParam, 10) : 0;

  const [step, setStep] = useState(1);
  const [merchantInfo, setMerchantInfo] = useState<MerchantInfo | null>(null);
  const [paymentNumbers, setPaymentNumbers] = useState<PaymentNumber[]>([]);
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

  const handleStep1Next = async () => {
    if (!payerPhone.trim() || !selectedMethod) {
      toast({ title: "Veuillez remplir les champs obligatoires", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setPaymentId(data.paymentId);
      setStep(2);
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

  useEffect(() => {
    if (step !== 3) return;
    const timer = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (redirectUrl) {
            const url = new URL(redirectUrl);
            url.searchParams.set("status", "success");
            url.searchParams.set("amount", String(amount));
            url.searchParams.set("tx_id", txId.trim());
            window.location.href = url.toString();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  const copyNumber = (number: string) => {
    navigator.clipboard.writeText(number);
    setCopied(true);
    toast({ title: "Numero copie !" });
    setTimeout(() => setCopied(false), 2000);
  };

  const formatAmount = (val: number) => val.toLocaleString("fr-FR");

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
        <div className="bg-white rounded-md p-6 max-w-sm w-full text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <span className="text-red-600 text-xl font-bold">!</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Page introuvable</h2>
          <p className="text-sm text-gray-500">{loadError || "Ce lien de paiement n'est pas valide."}</p>
        </div>
      </div>
    );
  }

  const stepLabels = ["Informations\ngenerales", "Compte\nde paiement", "Paiement\ntermine"];

  return (
    <div className="min-h-screen payment-page-root" style={{ background: "#00b050" }}>
      <style>{`
        .payment-page-root input,
        .payment-page-root select,
        .payment-page-root textarea {
          color: #111827 !important;
          background-color: white !important;
          border-color: #d1d5db !important;
        }
        .payment-page-root input::placeholder {
          color: #9ca3af !important;
        }
        .payment-page-root select option {
          color: #111827 !important;
          background-color: white !important;
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
        </div>

        <div className="bg-white rounded-md p-6" style={{ color: "#1f2937" }}>
          <div className="mb-2">
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
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
            <p className="text-xs text-gray-400 text-right mt-1" data-testid="text-step-count">
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
                      className="absolute top-4 right-1/2 h-0.5"
                      style={{
                        width: "100%",
                        backgroundColor: isDone || isActive ? "#00b050" : "#d1d5db",
                      }}
                    />
                  )}
                  <div className="relative z-10 flex flex-col items-center">
                    <p
                      className="text-xs text-center mb-1 whitespace-pre-line leading-tight"
                      style={{ color: isActive || isDone ? "#00b050" : "#9ca3af", minHeight: "2rem" }}
                    >
                      {label}
                    </p>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2"
                      style={{
                        borderColor: isActive || isDone ? "#00b050" : "#d1d5db",
                        backgroundColor: isDone ? "#00b050" : "white",
                        color: isDone ? "white" : isActive ? "#00b050" : "#9ca3af",
                      }}
                      data-testid={`step-indicator-${stepNum}`}
                    >
                      {isDone ? <Check className="w-4 h-4" /> : stepNum}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {step === 1 && (
            <div className="space-y-4" data-testid="step-1-content">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Entrez votre compte bancaire mobile:
                </label>
                <div className="flex items-center border rounded-md overflow-hidden">
                  <span className="px-3 py-2 text-sm font-semibold" style={{ color: "#00b050" }}>
                    {selectedCountry === "Togo" ? "+228" :
                     selectedCountry === "Benin" ? "+229" :
                     selectedCountry === "Cote d'Ivoire" ? "+225" :
                     selectedCountry === "Guinee" ? "+224" :
                     selectedCountry === "Senegal" ? "+221" :
                     selectedCountry === "Mali" ? "+223" :
                     selectedCountry === "Burkina Faso" ? "+226" :
                     selectedCountry === "Niger" ? "+227" :
                     selectedCountry === "Ghana" ? "+233" :
                     selectedCountry === "Nigeria" ? "+234" : "+"}
                  </span>
                  <input
                    type="tel"
                    value={payerPhone}
                    onChange={(e) => setPayerPhone(e.target.value)}
                    placeholder="Ex: 90123456"
                    className="flex-1 py-2 px-3 text-sm outline-none border-l"
                    style={{ color: "#111827", backgroundColor: "white" }}
                    data-testid="input-payer-phone"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom complet (optionnel):
                </label>
                <input
                  type="text"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  placeholder="Ex: Jean Dupont"
                  className="w-full py-2 px-3 text-sm border rounded-md outline-none"
                  style={{ color: "#111827", backgroundColor: "white" }}
                  data-testid="input-payer-name"
                />
              </div>

              {merchantInfo.countries.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pays:</label>
                  <select
                    value={selectedCountry}
                    onChange={(e) => { setSelectedCountry(e.target.value); setSelectedMethod(""); }}
                    className="w-full py-2 px-3 text-sm border rounded-md outline-none"
                    style={{ color: "#111827", backgroundColor: "white" }}
                    data-testid="select-country"
                  >
                    {merchantInfo.countries.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Choisissez la methode de transfert:
                </label>
                <div className="space-y-2">
                  {availableMethods.map((method) => (
                    <div
                      key={method}
                      onClick={() => setSelectedMethod(method)}
                      className="flex items-center gap-3 p-3 border rounded-md cursor-pointer hover-elevate"
                      style={{
                        borderColor: selectedMethod === method ? "#00b050" : "#e5e7eb",
                        backgroundColor: selectedMethod === method ? "#f0fdf4" : "white",
                      }}
                      role="radio"
                      aria-checked={selectedMethod === method}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setSelectedMethod(method); } }}
                      data-testid={`radio-method-${method.replace(/\s+/g, "-").toLowerCase()}`}
                    >
                      <div
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                        style={{ borderColor: selectedMethod === method ? "#00b050" : "#d1d5db" }}
                      >
                        {selectedMethod === method && (
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#00b050" }} />
                        )}
                      </div>
                      <span className="text-sm font-medium text-gray-800">{method}</span>
                    </div>
                  ))}
                </div>
                {availableMethods.length === 0 && (
                  <p className="text-sm text-gray-500 mt-2">Aucune methode disponible pour ce pays.</p>
                )}
              </div>

              <div
                className="p-3 rounded-md text-sm"
                style={{ backgroundColor: "#dcfce7", color: "#166534" }}
              >
                Veuillez selectionner la meme option que votre methode de transfert.
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={handleStep1Next}
                  disabled={isSubmitting || !payerPhone.trim() || !selectedMethod}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-md text-white text-sm font-semibold disabled:opacity-50"
                  style={{ backgroundColor: "#2563eb" }}
                  data-testid="button-step1-next"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Suivant <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4" data-testid="step-2-content">
              <div
                className="p-3 rounded-md text-center text-sm font-medium"
                style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
              >
                Virez {formatAmount(amount)} XOF sur le compte suivant :
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-1">Numero de compte :</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-3xl font-bold text-gray-900 font-mono" data-testid="text-account-number">
                    {displayNumber ? displayNumber.phoneNumber : "---"}
                  </p>
                  {displayNumber && (
                    <button
                      onClick={() => copyNumber(displayNumber.phoneNumber)}
                      className="px-4 py-1.5 rounded-md text-white text-sm font-semibold"
                      style={{ backgroundColor: copied ? "#16a34a" : "#00b050" }}
                      data-testid="button-copy-number"
                    >
                      {copied ? "Copie !" : "copie"}
                    </button>
                  )}
                </div>
                {displayNumber?.operator && (
                  <p className="text-xs text-gray-500 mt-1">{displayNumber.operator} - {displayNumber.country}</p>
                )}
              </div>

              <button
                className="px-4 py-2 rounded-md text-white text-sm font-semibold"
                style={{ backgroundColor: "#00b050" }}
                onClick={() => {
                  if (displayNumber) {
                    const dialCode =
                      selectedCountry === "Togo" ? "228" :
                      selectedCountry === "Benin" ? "229" :
                      selectedCountry === "Cote d'Ivoire" ? "225" : "";
                    window.open(`tel:${dialCode}${displayNumber.phoneNumber}`, "_blank");
                  }
                }}
                data-testid="button-go-pay"
              >
                Allez payer
              </button>

              <div
                className="p-3 rounded-md text-sm"
                style={{ backgroundColor: "#dcfce7", color: "#166534" }}
              >
                Une fois le transfert termine, veuillez saisir l'ID de transfert :
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Entrer l'ID de transfert :
                </label>
                <input
                  type="text"
                  value={txId}
                  onChange={(e) => setTxId(e.target.value.toUpperCase())}
                  placeholder="Ex: TRF123456789"
                  className="w-full py-2 px-3 text-sm border rounded-md outline-none"
                  style={{ color: "#111827", backgroundColor: "white" }}
                  data-testid="input-tx-id"
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-md text-white text-sm font-semibold"
                  style={{ backgroundColor: "#2563eb" }}
                  data-testid="button-step2-prev"
                >
                  <ChevronLeft className="w-4 h-4" /> Precedent
                </button>
                <button
                  onClick={handleStep2Next}
                  disabled={isValidating || !txId.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-md text-white text-sm font-semibold disabled:opacity-50"
                  style={{ backgroundColor: "#2563eb" }}
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

              <h2 className="text-lg font-bold text-gray-900">
                Merci !
              </h2>
              <p className="text-sm text-gray-600">
                Votre paiement de <strong>{formatAmount(amount)} XOF</strong> a bien ete enregistre.
              </p>
              <p className="text-xs text-gray-500">
                ID de transaction : <span className="font-mono font-semibold">{txId}</span>
              </p>

              {redirectUrl ? (
                <div className="pt-4">
                  <p className="text-sm text-gray-500">
                    Redirection automatique dans <strong>{redirectCountdown}</strong> seconde{redirectCountdown > 1 ? "s" : ""}...
                  </p>
                  <a
                    href={(() => {
                      const url = new URL(redirectUrl);
                      url.searchParams.set("status", "success");
                      url.searchParams.set("amount", String(amount));
                      url.searchParams.set("tx_id", txId.trim());
                      return url.toString();
                    })()}
                    className="inline-block mt-3 px-6 py-2.5 rounded-md text-white text-sm font-semibold"
                    style={{ backgroundColor: "#00b050" }}
                    data-testid="link-redirect"
                  >
                    Retourner sur le site
                  </a>
                </div>
              ) : (
                <div className="pt-4">
                  <p className="text-sm text-gray-500">
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
