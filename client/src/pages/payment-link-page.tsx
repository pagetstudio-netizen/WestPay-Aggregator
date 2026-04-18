import { useState, useCallback, useRef, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, ChevronRight, Check, Phone, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import HelpButton from "@/components/HelpButton";

const PAYMENT_METHODS: Record<string, string[]> = {
  "Togo": ["Moov Money", "TMoney"],
  "Benin": ["MTN Mobile Money"],
  "Burkina Faso": ["Moov Money", "Orange Money"],
  "Cameroun": ["MTN Mobile Money", "Orange Money"],
  "Congo Brazzaville": ["MTN Mobile Money"],
  "Congo RDC": ["Airtel Money", "M-Pesa", "Orange Money"],
  "Gabon": ["Airtel Money", "Moov Money"],
  "Cote d'Ivoire": ["Moov Money", "MTN Mobile Money", "Orange Money", "Wave"],
  "Mali": ["Orange Money"],
  "Senegal": ["Mixx by Yas", "Orange Money", "Wave"],
  "Guinee": ["MTN Mobile Money", "Orange Money"],
};

const DIAL_CODES: Record<string, string> = {
  "Togo": "+228",
  "Benin": "+229",
  "Burkina Faso": "+226",
  "Cameroun": "+237",
  "Congo Brazzaville": "+242",
  "Congo RDC": "+243",
  "Gabon": "+241",
  "Cote d'Ivoire": "+225",
  "Mali": "+223",
  "Senegal": "+221",
  "Guinee": "+224",
};

type LinkInfo = {
  link: {
    id: number;
    uniqueId: string;
    name: string;
    amountType: string;
    amount: number | null;
    redirectUrl: string | null;
    paymentCount: number;
    paymentLimit: number | null;
    active: boolean;
    expiresAt: string | null;
  };
  merchantName: string;
  merchantSlug: string;
  countries: string[];
};

export default function PaymentLinkPage() {
  const [, params] = useRoute("/link/:uniqueId");
  const uniqueId = params?.uniqueId || "";
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [customAmount, setCustomAmount] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("");
  const [hiddenOtp] = useState(() => String(Math.floor(1000 + Math.random() * 9000)));
  const [otpCode, setOtpCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [omnipayPaymentUrl, setOmnipayPaymentUrl] = useState<string | null>(null);
  const [omnipayReference, setOmnipayReference] = useState<string | null>(null);
  const [omnipayFees, setOmnipayFees] = useState(0);
  const [omnipayPolling, setOmnipayPolling] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(5);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [dynamicMethods, setDynamicMethods] = useState<string[] | null>(null);

  const { data, isLoading, error } = useQuery<LinkInfo>({
    queryKey: ["/api/payment-link", uniqueId],
    queryFn: async () => {
      const res = await fetch(`/api/payment-link/${uniqueId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Lien introuvable");
      }
      return res.json();
    },
    enabled: !!uniqueId,
    retry: false,
  });

  useEffect(() => {
    if (data?.countries?.length && !selectedCountry) {
      setSelectedCountry(data.countries[0]);
    }
  }, [data]);

  useEffect(() => {
    if (!selectedCountry) return;
    fetch(`/api/public/payment-methods/${encodeURIComponent(selectedCountry)}?type=link`)
      .then(r => r.json())
      .then(d => { setDynamicMethods(Array.isArray(d.methods) ? d.methods : null); })
      .catch(() => setDynamicMethods(null));
    setSelectedMethod("");
    setOtpCode("");
  }, [selectedCountry]);

  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

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
      setRedirectCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          const redirectUrl = data?.link.redirectUrl;
          if (redirectUrl) {
            safeRedirect(redirectUrl, { status: "success", ref: omnipayReference || "" });
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  const availableMethods = dynamicMethods ?? (PAYMENT_METHODS[selectedCountry] || []);
  const dialCode = DIAL_CODES[selectedCountry] || "+";
  const needsManualOtp = selectedMethod === "Orange Money" && (selectedCountry === "Burkina Faso" || selectedCountry === "Cote d'Ivoire");
  const otpUssdDisplay = selectedCountry === "Burkina Faso" ? "*144*4*6*montant#" : "#144*82#";
  const orangeUssdCode = selectedCountry === "Mali" ? "#144#" : null;
  const orangeMenuHint = selectedCountry === "Mali" ? "menu Paiement marchand (option 2)" : null;
  const needsOrangeInstruction = selectedMethod === "Orange Money" && selectedCountry === "Mali";
  const handleSelectMethod = useCallback((m: string) => { setSelectedMethod(m); setOtpCode(""); }, []);

  const startPolling = (pId: number) => {
    setOmnipayPolling(true);
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/omnipay/payment/${pId}/status`);
        const d = await res.json();
        if (d.status === "confirmed") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setOmnipayPolling(false);
          setStep(3);
        } else if (d.status === "failed") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setOmnipayPolling(false);
          toast({ title: "Paiement échoué", description: "Le paiement a été refusé ou a expiré.", variant: "destructive" });
          setStep(1);
        }
      } catch {}
    }, 5000);
  };

  const handlePay = async () => {
    if (!payerPhone.trim()) { toast({ title: "Veuillez entrer votre numéro de téléphone", variant: "destructive" }); return; }
    if (!selectedMethod) { toast({ title: "Veuillez choisir une méthode de paiement", variant: "destructive" }); return; }
    if (needsManualOtp && !otpCode.trim()) { toast({ title: "Veuillez entrer votre code OTP Orange Money", variant: "destructive" }); return; }

    const amount = data!.link.amountType === "fixed" ? data!.link.amount! : Number(customAmount);
    if (!amount || amount <= 0) { toast({ title: "Montant invalide", variant: "destructive" }); return; }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/payment/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantSlug: data!.merchantSlug,
          country: selectedCountry,
          amount,
          payerPhone: payerPhone.trim(),
          payerName: "Client RobotPay",
          paymentMethod: selectedMethod,
          redirectUrl: data!.link.redirectUrl || null,
          firstName: "Client",
          lastName: "RobotPay",
          operator: selectedMethod.toLowerCase().includes("wave") ? "wave" : undefined,
          otp: needsManualOtp ? otpCode.trim() : hiddenOtp,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      setPaymentId(d.paymentId);
      setOmnipayReference(d.omnipayReference);
      setOmnipayFees(d.fees || 0);
      if (d.paymentUrl) { setOmnipayPaymentUrl(d.paymentUrl); setStep(2); }
      else { setStep(2); startPolling(d.paymentId); }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatAmount = (n: number) => n.toLocaleString("fr-FR");

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#00b050" }}>
        <Loader2 className="w-10 h-10 animate-spin text-white" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#00b050" }}>
        <div className="bg-white rounded-xl p-6 max-w-sm w-full text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Lien invalide</h2>
          <p className="text-sm text-gray-500">{(error as Error)?.message || "Ce lien de paiement est introuvable ou a expiré."}</p>
        </div>
      </div>
    );
  }

  const { link, merchantName } = data;
  const fixedAmount = link.amountType === "fixed" ? link.amount! : Number(customAmount) || 0;
  const stepLabels = ["Informations", "Validation", "Confirmation"];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: "#00b050" }}>
      <style>{`
        .plp-root, .plp-root * { box-sizing: border-box; }
        .plp-card input, .plp-card select { color: #111827 !important; background-color: #ffffff !important; border-color: #d1d5db !important; -webkit-text-fill-color: #111827 !important; }
        .plp-card input::placeholder { color: #9ca3af !important; -webkit-text-fill-color: #9ca3af !important; }
        .plp-card input:focus, .plp-card select:focus { border-color: #00b050 !important; box-shadow: 0 0 0 2px rgba(0,176,80,0.15); outline: none; }
        .plp-method { user-select: none; -webkit-tap-highlight-color: transparent; transition: border-color 0.15s, background-color 0.15s; }
        .plp-method:active { transform: scale(0.98); }
        .plp-btn { display:inline-flex; align-items:center; justify-content:center; gap:0.5rem; font-weight:600; font-size:0.875rem; border-radius:0.375rem; padding:0.625rem 1.5rem; border:none; cursor:pointer; transition:opacity 0.15s,transform 0.1s; -webkit-tap-highlight-color:transparent; }
        .plp-btn:active:not(:disabled) { transform:scale(0.97); }
        .plp-btn:disabled { opacity:0.45; cursor:not-allowed; }
        .plp-btn-green { background-color:#00b050; color:#ffffff; } .plp-btn-green:hover:not(:disabled) { background-color:#009a45; }
        .plp-btn-blue { background-color:#2563eb; color:#ffffff; } .plp-btn-blue:hover:not(:disabled) { background-color:#1d4ed8; }
        @keyframes pulse-ring { 0%{transform:scale(0.95);opacity:1} 50%{transform:scale(1.05);opacity:0.7} 100%{transform:scale(0.95);opacity:1} }
        .plp-pulse { animation:pulse-ring 2s ease-in-out infinite; }
      `}</style>

      <div className="plp-root w-full max-w-[420px] px-4 py-3">
        <div className="mb-2">
          <p className="text-white font-bold text-lg">RobotPay</p>
          <p className="text-white/80 text-sm">{link.name}</p>
        </div>

        <div className="mb-3">
          <p className="text-white/80 text-xs">Montant:</p>
          {link.amountType === "fixed" ? (
            <p className="text-white font-bold text-3xl">{formatAmount(link.amount!)}<span className="text-base ml-2">F CFA</span></p>
          ) : (
            <p className="text-white font-bold text-3xl">{customAmount ? formatAmount(Number(customAmount)) : "—"}<span className="text-base ml-2">F CFA</span></p>
          )}
        </div>

        <div className="bg-white rounded-lg p-4 plp-card">
          <div className="mb-2">
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#e5e7eb" }}>
              <div className="h-full rounded-full" style={{ width: step === 1 ? "33%" : step === 2 ? "66%" : "100%", backgroundColor: "#00b050", transition: "width 0.5s ease-in-out" }} />
            </div>
            <p className="text-xs text-right mt-1" style={{ color: "#9ca3af" }}>Etape {step} sur 3</p>
          </div>

          <div className="flex items-center justify-between mb-4 px-2">
            {stepLabels.map((label, i) => {
              const num = i + 1;
              const isActive = step === num;
              const isDone = step > num;
              return (
                <div key={num} className="flex flex-col items-center relative" style={{ flex: 1 }}>
                  {i > 0 && (
                    <div className="absolute top-3 right-1/2 h-0.5" style={{ width: "100%", backgroundColor: isDone || isActive ? "#00b050" : "#d1d5db" }} />
                  )}
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2"
                      style={{ borderColor: isActive || isDone ? "#00b050" : "#d1d5db", backgroundColor: isDone ? "#00b050" : "#ffffff", color: isDone ? "#ffffff" : isActive ? "#00b050" : "#9ca3af" }}>
                      {isDone ? <Check className="w-4 h-4" /> : num}
                    </div>
                    <p className="text-xs text-center mt-1 leading-tight" style={{ color: isActive || isDone ? "#00b050" : "#9ca3af" }}>{label}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {step === 1 && (
            <div className="space-y-3">
              {link.amountType === "flexible" && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "#374151" }}>Montant (F CFA):</label>
                  <input type="number" value={customAmount} onChange={e => setCustomAmount(e.target.value)}
                    placeholder="Ex: 5000" className="w-full py-2 px-3 text-sm border rounded-md"
                    style={{ borderColor: "#d1d5db" }} data-testid="input-custom-amount" />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#374151" }}>Numéro de téléphone mobile:</label>
                <div className="flex items-center border rounded-md overflow-hidden" style={{ borderColor: "#d1d5db" }}>
                  <span className="px-3 py-2 text-sm font-semibold" style={{ color: "#00b050", backgroundColor: "#f9fafb" }}>{dialCode}</span>
                  <input type="tel" value={payerPhone} onChange={e => setPayerPhone(e.target.value)}
                    placeholder="Ex: 90123456" className="flex-1 py-2 px-3 text-sm outline-none"
                    style={{ borderLeft: "1px solid #d1d5db" }} data-testid="input-payer-phone" />
                </div>
              </div>

              {data.countries.length > 1 && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "#374151" }}>Pays:</label>
                  <select value={selectedCountry} onChange={e => { setSelectedCountry(e.target.value); setSelectedMethod(""); }}
                    className="w-full py-2 px-3 text-sm border rounded-md" style={{ borderColor: "#d1d5db" }} data-testid="select-country">
                    {data.countries.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "#374151" }}>Méthode de paiement:</label>
                <div className="space-y-2" role="radiogroup">
                  {availableMethods.map(method => {
                    const isSel = selectedMethod === method;
                    return (
                      <div key={method} onClick={() => handleSelectMethod(method)}
                        onTouchEnd={e => { e.preventDefault(); handleSelectMethod(method); }}
                        className="plp-method flex items-center gap-3 p-3 border rounded-md cursor-pointer"
                        style={{ borderColor: isSel ? "#00b050" : "#e5e7eb", backgroundColor: isSel ? "#f0fdf4" : "#ffffff" }}
                        role="radio" aria-checked={isSel} tabIndex={0}
                        onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); handleSelectMethod(method); } }}
                        data-testid={`radio-method-${method.replace(/\s+/g, "-").toLowerCase()}`}>
                        <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                          style={{ borderColor: isSel ? "#00b050" : "#d1d5db" }}>
                          {isSel && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#00b050" }} />}
                        </div>
                        <span className="text-sm font-medium" style={{ color: "#1f2937" }}>{method}</span>
                      </div>
                    );
                  })}
                  {availableMethods.length === 0 && <p className="text-sm" style={{ color: "#6b7280" }}>Aucune méthode disponible pour ce pays.</p>}
                </div>
              </div>

              {needsManualOtp && (
                <div className="rounded-md p-3 space-y-2" style={{ backgroundColor: "#fff7ed", border: "1px solid #fdba74" }} data-testid="otp-orange-block">
                  <p className="text-sm font-semibold" style={{ color: "#c2410c" }}>Orange Money — Code OTP requis</p>
                  <p className="text-xs" style={{ color: "#9a3412" }}>
                    Composez{" "}
                    <span className="font-mono font-bold">
                      {selectedCountry === "Burkina Faso"
                        ? `*144*4*6*${data?.link.amountType === "fixed" ? data.link.amount : (customAmount || "montant")}#`
                        : otpUssdDisplay}
                    </span>{" "}
                    sur votre téléphone pour générer votre code OTP, puis saisissez-le ci-dessous.
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={8}
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="Code OTP reçu par SMS"
                    className="w-full py-2 px-3 text-sm border rounded-md"
                    style={{ borderColor: "#f97316" }}
                    data-testid="input-otp-code"
                  />
                </div>
              )}

              {needsOrangeInstruction && (
                <div className="rounded-md p-3 space-y-2" style={{ backgroundColor: "#fff7ed", border: "1px solid #fdba74" }} data-testid="orange-instruction-plp">
                  <p className="text-sm font-semibold" style={{ color: "#c2410c" }}>Orange Money — Instructions de validation</p>
                  <p className="text-xs" style={{ color: "#9a3412" }}>
                    Veuillez valider le paiement sur votre téléphone Orange Money.
                  </p>
                  <p className="text-xs" style={{ color: "#9a3412" }}>
                    Si vous ne recevez pas de notification, composez{" "}
                    <span className="font-mono font-bold">{orangeUssdCode}</span>{" "}
                    sur votre téléphone, puis accédez au <strong>{orangeMenuHint}</strong>.
                  </p>
                  <p className="text-xs" style={{ color: "#9a3412" }}>
                    Validez l'opération en entrant votre code secret.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end pt-1">
                <button type="button" onClick={handlePay}
                  disabled={isSubmitting || !payerPhone.trim() || !selectedMethod || (link.amountType === "flexible" && !customAmount) || (needsManualOtp && !otpCode.trim())}
                  className="plp-btn plp-btn-green" data-testid="button-pay-now">
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Payer maintenant <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              {omnipayPaymentUrl ? (
                <>
                  <div className="p-3 rounded-md text-center text-sm font-medium" style={{ backgroundColor: "#dbeafe", color: "#1e40af" }}>
                    Cliquez ci-dessous pour valider votre paiement de {formatAmount(fixedAmount)} F CFA
                  </div>
                  
                  <button type="button" onClick={() => { window.open(omnipayPaymentUrl, "_blank"); if (paymentId) startPolling(paymentId); }}
                    className="plp-btn plp-btn-green w-full" data-testid="button-wave-pay">
                    <ExternalLink className="w-4 h-4" /> Valider le paiement
                  </button>
                  {omnipayPolling && (
                    <div className="text-center py-2">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: "#00b050" }} />
                      <p className="text-sm mt-2" style={{ color: "#6b7280" }}>En attente de la confirmation...</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="p-3 rounded-md text-center text-sm font-medium" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
                    Une demande de paiement a été envoyée sur votre téléphone
                  </div>
                  <div className="text-center py-3">
                    <div className="plp-pulse inline-block">
                      <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: "#dcfce7" }}>
                        <Phone className="w-10 h-10" style={{ color: "#00b050" }} />
                      </div>
                    </div>
                    <p className="text-sm mt-4 font-medium" style={{ color: "#374151" }}>Validez le paiement sur votre téléphone</p>
                    <p className="text-xs mt-1" style={{ color: "#6b7280" }}>Composez votre code secret pour confirmer la transaction de {formatAmount(fixedAmount)} F CFA</p>
                  </div>

                  {needsOrangeInstruction && (
                    <div className="rounded-md p-3 space-y-1 text-left" style={{ backgroundColor: "#fff7ed", border: "1px solid #fdba74" }} data-testid="orange-instruction-step2-plp">
                      <p className="text-xs font-semibold" style={{ color: "#c2410c" }}>Orange Money — Comment valider ?</p>
                      <p className="text-xs" style={{ color: "#9a3412" }}>
                        Si vous ne recevez pas de notification, composez{" "}
                        <span className="font-mono font-bold">{orangeUssdCode}</span>{" "}
                        sur votre téléphone, puis accédez au <strong>{orangeMenuHint}</strong>.
                      </p>
                      <p className="text-xs" style={{ color: "#9a3412" }}>
                        Validez en entrant votre code secret.
                      </p>
                    </div>
                  )}

                  {omnipayPolling && (
                    <div className="flex items-center justify-center gap-2" style={{ color: "#6b7280" }}>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Vérification en cours...</span>
                    </div>
                  )}
                </>
              )}
              <div className="pt-2">
                <button type="button" onClick={() => { if (pollingRef.current) clearInterval(pollingRef.current); setOmnipayPolling(false); setStep(1); }}
                  className="plp-btn plp-btn-blue" data-testid="button-back">Retour</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 text-center py-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: "#dcfce7" }}>
                <Check className="w-8 h-8" style={{ color: "#00b050" }} />
              </div>
              <h2 className="text-lg font-bold" style={{ color: "#111827" }}>Paiement confirmé !</h2>
              <p className="text-sm" style={{ color: "#4b5563" }}>
                Votre paiement de <strong>{formatAmount(fixedAmount)} F CFA</strong> a été confirmé avec succès.
              </p>
              {omnipayReference && (
                <p className="text-xs" style={{ color: "#6b7280" }}>Référence : <span className="font-mono font-semibold">{omnipayReference}</span></p>
              )}
              {link.redirectUrl ? (
                <div className="pt-2">
                  <p className="text-sm" style={{ color: "#6b7280" }}>Redirection dans <strong>{redirectCountdown}</strong>s...</p>
                </div>
              ) : (
                <p className="text-sm pt-2" style={{ color: "#6b7280" }}>Vous pouvez fermer cette page.</p>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-white/60 text-xs mt-3">Paiement sécurisé via RobotPay</p>
        <HelpButton />
      </div>
    </div>
  );
}
