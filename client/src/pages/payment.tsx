import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, Phone, ExternalLink, Bitcoin, X, RefreshCw, Clock, CreditCard, ShieldCheck } from "lucide-react";
import HelpButton from "@/components/HelpButton";

type MerchantInfo = {
  name: string;
  slug: string;
  countries: string[];
};

const PAYMENT_METHODS: Record<string, string[]> = {
  "Togo": ["Moov Money", "TMoney"],
  "Benin": ["MTN Mobile Money", "Moov Money", "Celtiis"],
  "Burkina Faso": ["Coris Money", "Moov Money", "Orange Money"],
  "Cameroun": ["MTN Mobile Money", "Orange Money"],
  "Congo Brazzaville": ["MTN Mobile Money"],
  "Congo RDC": ["Africell", "Airtel Money", "M-Pesa", "Orange Money"],
  "Gabon": ["Airtel Money", "Moov Money"],
  "Cote d'Ivoire": ["Moov Money", "MTN Mobile Money", "Orange Money", "Wave"],
  "Mali": ["Orange Money"],
  "Senegal": ["Mixx by Yas", "Orange Money", "Wave"],
  "Guinee": ["MTN Mobile Money", "Orange Money"],
  "Gambie": ["Africell Money"],
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
  "Gambie": "+220",
};

const COUNTRY_FLAGS: Record<string, string> = {
  "Togo": "🇹🇬",
  "Benin": "🇧🇯",
  "Burkina Faso": "🇧🇫",
  "Cameroun": "🇨🇲",
  "Congo Brazzaville": "🇨🇬",
  "Congo RDC": "🇨🇩",
  "Gabon": "🇬🇦",
  "Cote d'Ivoire": "🇨🇮",
  "Mali": "🇲🇱",
  "Senegal": "🇸🇳",
  "Guinee": "🇬🇳",
  "Gambie": "🇬🇲",
};

const OPERATOR_META: Record<string, { color: string; abbr: string }> = {
  "Wave": { color: "#1E90FF", abbr: "WV" },
  "Orange Money": { color: "#FF6600", abbr: "OM" },
  "MTN Mobile Money": { color: "#FFCC00", abbr: "MTN" },
  "Moov Money": { color: "#00AEEF", abbr: "MV" },
  "TMoney": { color: "#0099CC", abbr: "TM" },
  "Airtel Money": { color: "#E8001D", abbr: "AT" },
  "M-Pesa": { color: "#60BB44", abbr: "MP" },
  "Coris Money": { color: "#7C2020", abbr: "CM" },
  "Mixx by Yas": { color: "#7C3AED", abbr: "MX" },
  "Africell": { color: "#0066B3", abbr: "AF" },
  "Africell Money": { color: "#0066B3", abbr: "AF" },
  "Celtiis": { color: "#E05A00", abbr: "CT" },
};

function currencyForCountry(country: string): string {
  if (["Cameroun", "Congo Brazzaville", "Gabon"].includes(country)) return "XAF";
  if (country === "Congo RDC") return "CDF";
  if (country === "Guinee") return "GNF";
  if (country === "Gambie") return "GMD";
  return "XOF";
}

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
  const phoneParam = urlParams.get("phone") || urlParams.get("payerPhone") || "";
  const nameParam = urlParams.get("name") || urlParams.get("payerName") || "";

  const [amount, setAmount] = useState(amountParam ? parseInt(amountParam, 10) : 0);
  const [redirectUrl, setRedirectUrl] = useState(redirectUrlParam);
  const redirectUrlRef = useRef(redirectUrlParam);

  const [step, setStep] = useState(omnipayStatusParam === "complete" ? 3 : 1);
  const [merchantInfo, setMerchantInfo] = useState<MerchantInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [payerPhone, setPayerPhone] = useState(phoneParam);
  const [payerName, setPayerName] = useState(nameParam);
  const [selectedCountry, setSelectedCountry] = useState(countryParam);
  const currency = currencyForCountry(selectedCountry);
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

  const [sendavaOtpRequired, setSendavaOtpRequired] = useState(false);
  const [sendavaUssdCode, setSendavaUssdCode] = useState<string | null>(null);
  const [sendavaOtp, setSendavaOtp] = useState("");
  const [sendavaOtpConfirming, setSendavaOtpConfirming] = useState(false);
  const [sendavaOtpConfirmed, setSendavaOtpConfirmed] = useState(false);

  const [paymentFailed, setPaymentFailed] = useState(false);
  const [failureReason, setFailureReason] = useState("");
  const [confirmedAt, setConfirmedAt] = useState<Date | null>(null);

  const [showOtpPopup, setShowOtpPopup] = useState(false);

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
          setConfirmedAt(new Date());
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
      .then(d => { setDynamicMethods(Array.isArray(d.methods) ? d.methods : null); })
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
  const needsManualOtp = selectedMethod === "Orange Money" && (selectedCountry === "Burkina Faso" || selectedCountry === "Cote d'Ivoire");
  const otpUssdDisplay = selectedCountry === "Burkina Faso" ? "*144*4*6*montant#" : "#144*82#";
  const orangeUssdCode = selectedCountry === "Mali" ? "#144#" : null;
  const orangeMenuHint = selectedCountry === "Mali" ? "menu Paiement marchand (option 2)" : null;
  const needsOrangeInstruction = selectedMethod === "Orange Money" && selectedCountry === "Mali";

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
          setConfirmedAt(new Date());
          setStep(3);
        } else if (data.status === "failed") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setOmnipayPolling(false);
          setPaymentFailed(true);
          setFailureReason("Le paiement n'a pas pu etre traite. Verifiez votre solde ou votre code secret et reessayez.");
        }
      } catch {}
    }, 5000);
  };

  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  const isCryptoMethod = selectedMethod === "crypto";

  const handlePayClick = () => {
    if (!selectedMethod) {
      toast({ title: "Methode de paiement requise", description: "Veuillez selectionner une methode de paiement.", variant: "destructive" });
      return;
    }
    if (isCryptoMethod) { handleStep1Next(); return; }
    if (!payerPhone.trim()) {
      toast({ title: "Numero requis", description: "Veuillez saisir votre numero de telephone.", variant: "destructive" });
      return;
    }
    if (needsManualOtp && !otpCode.trim()) {
      setShowOtpPopup(true);
      return;
    }
    handleStep1Next();
  };

  const handleStep1Next = async () => {
    if (!selectedMethod) return;
    if (isCryptoMethod) {
      setIsCryptoLoading(true);
      try {
        const res = await fetch("/api/payment/crypto/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merchantSlug, amount, currency, returnUrl: redirectUrl || undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        window.location.replace(`/pay/crypto/${data.trackId}`);
      } catch {
        toast({ title: "Paiement non disponible", description: "Une erreur est survenue. Veuillez reessayer.", variant: "destructive" });
      } finally {
        setIsCryptoLoading(false);
      }
      return;
    }
    setIsSubmitting(true);
    setPaymentFailed(false);
    setFailureReason("");
    try {
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
          firstName: "Client",
          lastName: "RobotPay",
          operator: selectedMethod.toLowerCase().includes("wave") ? "wave" : undefined,
          otp: needsManualOtp ? otpCode.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setPaymentId(data.paymentId);
      setOmnipayReference(data.omnipayReference);
      setOmnipayFees(data.fees || 0);
      setShowOtpPopup(false);
      if (data.sendavapay && data.otpRequired) {
        setSendavaOtpRequired(true);
        setSendavaUssdCode(data.ussdCode || null);
        setSendavaOtpConfirmed(false);
        setSendavaOtp("");
        setStep(2);
      } else if (data.paymentUrl) {
        setOmnipayPaymentUrl(data.paymentUrl);
        setStep(2);
      } else {
        setStep(2);
        startOmnipayPolling(data.paymentId);
      }
    } catch {
      toast({ title: "Paiement non abouti", description: "Une erreur est survenue. Verifiez vos informations et reessayez.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendavaConfirmOtp = async () => {
    if (!paymentId || !sendavaOtp.trim()) return;
    setSendavaOtpConfirming(true);
    try {
      const res = await fetch("/api/payment/sendavapay/confirm-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, otp: sendavaOtp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSendavaOtpConfirmed(true);
      startOmnipayPolling(paymentId);
    } catch (err: any) {
      toast({ title: "Code OTP invalide", description: err.message || "Le code est invalide ou a expire. Veuillez reessayer.", variant: "destructive" });
    } finally {
      setSendavaOtpConfirming(false);
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
            safeRedirect(currentRedirectUrl, { status: "success", amount: String(amount), ref: omnipayReference || "" });
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

  const handleRetry = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setOmnipayPolling(false);
    setPaymentFailed(false);
    setFailureReason("");
    setOmnipayPaymentUrl(null);
    setSendavaOtpRequired(false);
    setSendavaOtp("");
    setSendavaOtpConfirmed(false);
    setStep(1);
  };

  const formatTime = (date: Date) => date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const formatDate = (date: Date) => date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0d0d1a" }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-9 h-9 animate-spin" style={{ color: "#3b82f6" }} />
          <span className="text-sm" style={{ color: "#6b7280" }}>Chargement...</span>
        </div>
      </div>
    );
  }

  if ((loadError || !merchantInfo) && step !== 3) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0d0d1a" }}>
        <div className="rounded-2xl p-6 max-w-sm w-full text-center space-y-3" style={{ background: "#ffffff" }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: "#fee2e2" }}>
            <X className="w-6 h-6" style={{ color: "#dc2626" }} />
          </div>
          <h2 className="text-base font-semibold" style={{ color: "#111827" }}>Lien invalide</h2>
          <p className="text-sm" style={{ color: "#6b7280" }}>{loadError || "Ce lien de paiement n'est pas valide."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4" style={{ background: "#0d0d1a" }}>
      <style>{`
        .pay-root *, .pay-root *::before, .pay-root *::after { box-sizing: border-box; }
        .pay-input {
          width: 100%;
          padding: 10px 14px;
          font-size: 14px;
          border: 1.5px solid #e5e7eb;
          border-radius: 10px;
          outline: none;
          background: #f9fafb;
          color: #111827;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .pay-input::placeholder { color: #9ca3af; }
        .pay-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.12); background: #fff; }
        .pay-select {
          width: 100%;
          padding: 10px 14px;
          font-size: 14px;
          border: 1.5px solid #e5e7eb;
          border-radius: 10px;
          outline: none;
          background: #f9fafb;
          color: #111827;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
          padding-right: 36px;
          transition: border-color 0.15s;
        }
        .pay-select:focus { border-color: #3b82f6; }
        .op-tile {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          padding: 10px 6px;
          border-radius: 12px;
          border: 2px solid #e5e7eb;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s, transform 0.1s;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          flex: 1;
          min-width: 0;
        }
        .op-tile:active { transform: scale(0.95); }
        .op-tile.selected { border-color: #3b82f6; background: #eff6ff; }
        .op-tile-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 800;
          color: #fff;
          letter-spacing: 0.02em;
        }
        .op-tile-label {
          font-size: 10px;
          font-weight: 600;
          color: #374151;
          text-align: center;
          line-height: 1.2;
          word-break: break-word;
        }
        .op-tile.selected .op-tile-label { color: #1d4ed8; }
        .pay-btn-yellow {
          width: 100%;
          padding: 13px;
          font-size: 15px;
          font-weight: 700;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: opacity 0.15s, transform 0.1s;
          -webkit-tap-highlight-color: transparent;
          letter-spacing: 0.01em;
        }
        .pay-btn-yellow:hover:not(:disabled) { opacity: 0.92; }
        .pay-btn-yellow:active:not(:disabled) { transform: scale(0.98); }
        .pay-btn-yellow:disabled { opacity: 0.4; cursor: not-allowed; }
        .pay-btn-blue {
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 600;
          border-radius: 10px;
          border: none;
          cursor: pointer;
          background: #3b82f6;
          color: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: opacity 0.15s, transform 0.1s;
        }
        .pay-btn-blue:hover:not(:disabled) { opacity: 0.88; }
        .pay-btn-blue:active:not(:disabled) { transform: scale(0.97); }
        .pay-btn-blue:disabled { opacity: 0.4; cursor: not-allowed; }
        .pay-btn-ghost {
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 500;
          border-radius: 10px;
          border: 1.5px solid #e5e7eb;
          cursor: pointer;
          background: transparent;
          color: #6b7280;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          transition: background 0.15s;
        }
        .pay-btn-ghost:hover { background: #f3f4f6; }
        @keyframes success-pop {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.1); opacity: 1; }
          80% { transform: scale(0.95); }
          100% { transform: scale(1); opacity: 1; }
        }
        .success-icon-anim { animation: success-pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        @keyframes check-draw {
          0% { stroke-dashoffset: 100; }
          100% { stroke-dashoffset: 0; }
        }
        .check-path { stroke-dasharray: 100; stroke-dashoffset: 100; animation: check-draw 0.4s ease-out 0.35s forwards; }
        @keyframes omnipay-pulse {
          0% { transform: scale(0.95); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.7; }
          100% { transform: scale(0.95); opacity: 1; }
        }
        .omnipay-pulse { animation: omnipay-pulse 2s ease-in-out infinite; }
        @keyframes fail-shake {
          0% { transform: translateX(0); }
          15% { transform: translateX(-8px); }
          30% { transform: translateX(8px); }
          45% { transform: translateX(-6px); }
          60% { transform: translateX(6px); }
          75% { transform: translateX(-3px); }
          90% { transform: translateX(3px); }
          100% { transform: translateX(0); }
        }
        .fail-icon-anim { animation: fail-shake 0.5s ease-in-out 0.1s both; }
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.65);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 16px;
        }
        .modal-box {
          background: #fff;
          border-radius: 18px;
          padding: 24px;
          width: 100%;
          max-width: 360px;
          box-shadow: 0 25px 60px rgba(0,0,0,0.35);
        }
      `}</style>

      <div className="pay-root w-full" style={{ maxWidth: 420 }}>
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "#ffffff", boxShadow: "0 24px 60px rgba(0,0,0,0.45)" }}
        >
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.18)" }}
              >
                <CreditCard className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-tight" data-testid="text-brand">
                  Effectuer un paiement
                </p>
                {merchantInfo && (
                  <p className="text-white/70 text-xs">{merchantInfo.name}</p>
                )}
              </div>
            </div>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
              style={{ background: "rgba(255,255,255,0.15)" }}
              onClick={() => window.history.back()}
              data-testid="button-close"
            >
              <X className="w-4 h-4 text-white" />
            </div>
          </div>

          <div className="px-5 py-5 space-y-5">

            {step === 1 && (
              <>
                {merchantInfo && merchantInfo.countries.length > 1 && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#6b7280" }}>
                      Sélectionner un pays
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base pointer-events-none">
                        {COUNTRY_FLAGS[selectedCountry] || "🌍"}
                      </span>
                      <select
                        value={selectedCountry}
                        onChange={(e) => { setSelectedCountry(e.target.value); setSelectedMethod(""); }}
                        className="pay-select"
                        style={{ paddingLeft: "36px" }}
                        data-testid="select-country"
                      >
                        {merchantInfo.countries.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {amount > 0 && (
                  <div
                    className="rounded-xl px-4 py-3 flex items-center justify-between"
                    style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe" }}
                  >
                    <span className="text-xs font-semibold" style={{ color: "#3b82f6" }}>
                      Montant à payer
                    </span>
                    <span className="font-bold text-xl" style={{ color: "#1d4ed8" }} data-testid="text-pay-amount">
                      {currency} {formatAmount(amount)}
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#6b7280" }}>
                    Choisissez votre opérateur
                  </label>
                  {availableMethods.length === 0 && !cryptoEnabled ? (
                    <p className="text-sm py-3 text-center rounded-xl" style={{ color: "#9ca3af", border: "1.5px dashed #e5e7eb" }}>
                      Aucune méthode disponible pour ce pays.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Opérateur de paiement">
                      {availableMethods.map((method) => {
                        const meta = OPERATOR_META[method] || { color: "#6b7280", abbr: method.substring(0, 2).toUpperCase() };
                        const isSelected = selectedMethod === method;
                        return (
                          <div
                            key={method}
                            onClick={() => handleSelectMethod(method)}
                            onTouchEnd={(e) => { e.preventDefault(); handleSelectMethod(method); }}
                            className={`op-tile${isSelected ? " selected" : ""}`}
                            style={{ minWidth: "calc(25% - 8px)", maxWidth: "calc(25% - 8px)" }}
                            role="radio"
                            aria-checked={isSelected}
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); handleSelectMethod(method); } }}
                            data-testid={`radio-method-${method.replace(/\s+/g, "-").toLowerCase()}`}
                          >
                            <div className="op-tile-icon" style={{ background: meta.color }}>
                              {meta.abbr}
                            </div>
                            <span className="op-tile-label">{method}</span>
                          </div>
                        );
                      })}

                      {cryptoEnabled && (
                        <div
                          onClick={() => handleSelectMethod("crypto")}
                          onTouchEnd={(e) => { e.preventDefault(); handleSelectMethod("crypto"); }}
                          className={`op-tile${isCryptoMethod ? " selected" : ""}`}
                          style={{ minWidth: "calc(25% - 8px)", maxWidth: "calc(25% - 8px)", ...(isCryptoMethod ? { borderColor: "#f59e0b", background: "#fffbeb" } : {}) }}
                          role="radio"
                          aria-checked={isCryptoMethod}
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); handleSelectMethod("crypto"); } }}
                          data-testid="radio-method-crypto"
                        >
                          <div className="op-tile-icon" style={{ background: "#f59e0b" }}>
                            <Bitcoin className="w-5 h-5 text-white" />
                          </div>
                          <span className="op-tile-label" style={isCryptoMethod ? { color: "#d97706" } : {}}>Crypto</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {isCryptoMethod && (
                  <div
                    className="p-3 rounded-xl text-xs space-y-1"
                    style={{ background: "#fffbeb", border: "1.5px solid #fde68a", color: "#92400e" }}
                    data-testid="crypto-info-block"
                  >
                    <p className="font-semibold" style={{ color: "#78350f" }}>Paiement en crypto-monnaie</p>
                    <p>Vous serez redirigé vers une page sécurisée avec QR code. Équivalence FCFA → crypto calculée en temps réel.</p>
                  </div>
                )}

                {!isCryptoMethod && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#6b7280" }}>
                      Numéro de téléphone
                    </label>
                    <div className="flex items-stretch rounded-xl overflow-hidden" style={{ border: "1.5px solid #e5e7eb" }}>
                      <div
                        className="flex items-center justify-center px-3 shrink-0 text-sm font-bold"
                        style={{ background: "#f3f4f6", color: "#374151", borderRight: "1.5px solid #e5e7eb", minWidth: 60 }}
                      >
                        {dialCode}
                      </div>
                      <input
                        type="tel"
                        value={payerPhone}
                        onChange={(e) => setPayerPhone(e.target.value)}
                        placeholder="Ex: 90 123 456"
                        className="flex-1 py-2.5 px-3 text-sm outline-none"
                        style={{ background: "#f9fafb", color: "#111827", border: "none" }}
                        data-testid="input-payer-phone"
                      />
                    </div>
                  </div>
                )}

                {needsOrangeInstruction && !isCryptoMethod && (
                  <div
                    className="p-3 rounded-xl space-y-1.5"
                    style={{ background: "#fff7ed", border: "1.5px solid #fed7aa" }}
                    data-testid="orange-instruction-block"
                  >
                    <p className="text-xs font-semibold" style={{ color: "#c2410c" }}>Orange Money — Validation requise</p>
                    <p className="text-xs" style={{ color: "#92400e" }}>
                      Composez <span className="font-bold font-mono">{orangeUssdCode}</span> puis accédez au <strong>{orangeMenuHint}</strong> pour valider.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handlePayClick}
                  disabled={
                    isSubmitting ||
                    isCryptoLoading ||
                    !selectedMethod ||
                    (!isCryptoMethod && !payerPhone.trim())
                  }
                  className="pay-btn-yellow"
                  data-testid="button-step1-next"
                >
                  {(isSubmitting || isCryptoLoading) ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {isCryptoMethod ? "Payer en crypto" : "Payez avec RobotPay"}
                </button>

                <div className="flex items-center justify-center gap-1.5 pt-1">
                  <ShieldCheck className="w-3.5 h-3.5" style={{ color: "#9ca3af" }} />
                  <span className="text-xs" style={{ color: "#9ca3af" }}>
                    Paiement sécurisé · Données chiffrées
                  </span>
                </div>
              </>
            )}

            {step === 2 && (
              <div className="space-y-4" data-testid="step-2-omnipay-content">
                {paymentFailed ? (
                  <div className="text-center py-2 space-y-4" data-testid="step-2-failed">
                    <div className="fail-icon-anim inline-block">
                      <div
                        className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                        style={{ background: "#fee2e2", border: "4px solid #fca5a5" }}
                      >
                        <X className="w-9 h-9" style={{ color: "#dc2626" }} />
                      </div>
                    </div>
                    <div>
                      <p className="text-base font-bold" style={{ color: "#991b1b" }}>Paiement échoué</p>
                      <p className="text-sm mt-1" style={{ color: "#6b7280" }}>{failureReason}</p>
                    </div>
                    <div className="rounded-xl p-3 text-left space-y-1" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
                      <p className="text-xs font-semibold" style={{ color: "#991b1b" }}>Que faire ?</p>
                      <p className="text-xs" style={{ color: "#7f1d1d" }}>• Vérifiez que votre solde est suffisant</p>
                      <p className="text-xs" style={{ color: "#7f1d1d" }}>• Assurez-vous que votre code secret est correct</p>
                      <p className="text-xs" style={{ color: "#7f1d1d" }}>• Vérifiez que le numéro est correct</p>
                    </div>
                    <button type="button" onClick={handleRetry} className="pay-btn-yellow" data-testid="button-retry">
                      <RefreshCw className="w-4 h-4" /> Réessayer
                    </button>
                  </div>

                ) : sendavaOtpRequired && !sendavaOtpConfirmed ? (
                  <>
                    <div className="rounded-xl p-3 text-center text-sm font-medium" style={{ background: "#fff7ed", color: "#92400e" }}>
                      Validation Orange Money — Code OTP requis
                    </div>
                    {sendavaUssdCode && (
                      <div className="rounded-xl p-3 space-y-2" style={{ background: "#fff7ed", border: "1.5px solid #fed7aa" }} data-testid="sendava-ussd-block">
                        <p className="text-xs font-semibold" style={{ color: "#c2410c" }}>Étape 1 — Obtenez votre code OTP</p>
                        <p className="text-xs" style={{ color: "#92400e" }}>
                          Composez <span className="font-bold font-mono">{sendavaUssdCode}</span> sur votre téléphone pour recevoir votre code OTP par SMS.
                        </p>
                      </div>
                    )}
                    <div className="rounded-xl p-3 space-y-3" style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0" }} data-testid="sendava-otp-input-block">
                      <p className="text-xs font-semibold" style={{ color: "#166534" }}>Étape 2 — Entrez votre code OTP</p>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={8}
                        value={sendavaOtp}
                        onChange={(e) => setSendavaOtp(e.target.value.replace(/\D/g, ""))}
                        placeholder="Code OTP reçu par SMS"
                        className="pay-input"
                        data-testid="input-sendava-otp"
                      />
                      <button
                        type="button"
                        onClick={handleSendavaConfirmOtp}
                        disabled={sendavaOtpConfirming || !sendavaOtp.trim()}
                        className="pay-btn-yellow"
                        data-testid="button-sendava-confirm-otp"
                      >
                        {sendavaOtpConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Confirmer le paiement
                      </button>
                    </div>
                    <button type="button" onClick={handleRetry} className="pay-btn-ghost" data-testid="button-step2-sendava-prev">
                      ← Retour
                    </button>
                  </>

                ) : sendavaOtpRequired && sendavaOtpConfirmed ? (
                  <>
                    <div className="rounded-xl p-3 text-center text-sm font-medium" style={{ background: "#dcfce7", color: "#166534" }}>
                      Code OTP confirmé — Paiement en cours
                    </div>
                    <div className="text-center py-6">
                      <Loader2 className="w-9 h-9 animate-spin mx-auto" style={{ color: "#3b82f6" }} />
                      <p className="text-sm mt-3" style={{ color: "#6b7280" }}>Vérification en cours...</p>
                    </div>
                  </>

                ) : omnipayPaymentUrl ? (
                  <>
                    <div className="rounded-xl p-3 text-center text-sm font-medium" style={{ background: "#dbeafe", color: "#1e40af" }}>
                      Cliquez ci-dessous pour valider votre paiement de {formatAmount(amount)} {currency}
                    </div>
                    {omnipayFees > 0 && (
                      <p className="text-xs text-center" style={{ color: "#6b7280" }}>
                        Frais de transaction : {formatAmount(omnipayFees)} {currency}
                      </p>
                    )}
                    <button type="button" onClick={handleWaveRedirect} className="pay-btn-yellow" data-testid="button-wave-pay">
                      <ExternalLink className="w-4 h-4" /> Valider le paiement
                    </button>
                    {omnipayPolling && (
                      <div className="flex items-center justify-center gap-2 py-2" style={{ color: "#6b7280" }}>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">En attente de confirmation...</span>
                      </div>
                    )}
                    <button type="button" onClick={handleRetry} className="pay-btn-ghost" data-testid="button-step2-prev">
                      ← Retour
                    </button>
                  </>

                ) : (
                  <>
                    <div className="text-center py-4">
                      <div className="omnipay-pulse inline-block">
                        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto" style={{ background: "#eff6ff" }}>
                          <Phone className="w-10 h-10" style={{ color: "#3b82f6" }} />
                        </div>
                      </div>
                      <p className="text-sm mt-4 font-semibold" style={{ color: "#111827" }}>
                        Validez sur votre téléphone
                      </p>
                      <p className="text-xs mt-1.5" style={{ color: "#6b7280" }}>
                        Une demande de paiement de <strong style={{ color: "#1d4ed8" }}>{formatAmount(amount)} {currency}</strong> a été envoyée sur votre appareil.
                      </p>
                      {omnipayFees > 0 && (
                        <p className="text-xs mt-1" style={{ color: "#9ca3af" }}>Frais : {formatAmount(omnipayFees)} {currency}</p>
                      )}
                    </div>

                    {needsOrangeInstruction && (
                      <div className="rounded-xl p-3 space-y-1.5" style={{ background: "#fff7ed", border: "1.5px solid #fed7aa" }} data-testid="orange-instruction-step2">
                        <p className="text-xs font-semibold" style={{ color: "#c2410c" }}>Orange Money — Comment valider ?</p>
                        <p className="text-xs" style={{ color: "#92400e" }}>
                          Composez <span className="font-bold font-mono">{orangeUssdCode}</span> puis accédez au <strong>{orangeMenuHint}</strong> et validez avec votre code secret.
                        </p>
                      </div>
                    )}

                    {omnipayPolling && (
                      <div className="flex items-center justify-center gap-2 py-1" style={{ color: "#6b7280" }}>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span className="text-xs">Vérification en cours...</span>
                      </div>
                    )}

                    <button type="button" onClick={handleRetry} className="pay-btn-ghost" data-testid="button-step2-prev">
                      ← Retour
                    </button>
                  </>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="py-2 space-y-4" data-testid="step-3-content">
                <div className="flex flex-col items-center">
                  <div className="success-icon-anim">
                    <div
                      className="w-24 h-24 rounded-full flex items-center justify-center"
                      style={{ background: "radial-gradient(circle, #dcfce7 60%, #bbf7d0 100%)", border: "5px solid #86efac", boxShadow: "0 0 0 8px #dcfce7" }}
                    >
                      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                        <path className="check-path" d="M10 25 L20 35 L38 14" stroke="#00b050" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-xs font-bold mt-3 uppercase tracking-widest" style={{ color: "#00b050" }}>
                    Paiement approuvé
                  </p>
                </div>

                <div className="rounded-xl px-4 py-5 text-center" style={{ background: "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)" }}>
                  <p className="text-white/70 text-xs uppercase tracking-wider mb-1">Montant débité</p>
                  <p className="text-white font-bold text-4xl tracking-tight">
                    {formatAmount(amount)}
                    <span className="text-xl ml-2 font-medium opacity-80">{currency}</span>
                  </p>
                  {merchantInfo && <p className="text-white/60 text-xs mt-2">{merchantInfo.name}</p>}
                </div>

                <div className="rounded-xl overflow-hidden" style={{ border: "1.5px solid #e5e7eb" }}>
                  {omnipayReference && (
                    <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <span className="text-xs font-medium" style={{ color: "#6b7280" }}>Référence</span>
                      <span className="text-xs font-mono font-semibold" style={{ color: "#111827" }}>{omnipayReference}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <span className="text-xs font-medium" style={{ color: "#6b7280" }}>Statut</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#dcfce7", color: "#166534" }}>Confirmé</span>
                  </div>
                  {confirmedAt && (
                    <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <span className="text-xs font-medium" style={{ color: "#6b7280" }}>Date</span>
                      <span className="text-xs" style={{ color: "#374151" }}>{formatDate(confirmedAt)}</span>
                    </div>
                  )}
                  {confirmedAt && (
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-xs font-medium flex items-center gap-1" style={{ color: "#6b7280" }}>
                        <Clock className="w-3 h-3" /> Heure
                      </span>
                      <span className="text-xs font-semibold" style={{ color: "#374151" }}>{formatTime(confirmedAt)}</span>
                    </div>
                  )}
                </div>

                {redirectUrl ? (
                  <div className="space-y-2">
                    <p className="text-xs text-center" style={{ color: "#9ca3af" }}>
                      Redirection dans <strong style={{ color: "#374151" }}>{redirectCountdown}s</strong>...
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
                        } catch { return normalized; }
                      })()}
                      className="pay-btn-yellow"
                      style={{ textDecoration: "none" }}
                      data-testid="link-redirect"
                    >
                      Retourner sur le site
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-center" style={{ color: "#9ca3af" }}>Vous pouvez fermer cette page.</p>
                )}
              </div>
            )}

          </div>

          <div
            className="flex items-center justify-center gap-2 px-5 py-3"
            style={{ borderTop: "1px solid #f3f4f6", background: "#f9fafb" }}
          >
            <ShieldCheck className="w-3.5 h-3.5" style={{ color: "#9ca3af" }} />
            <span className="text-xs" style={{ color: "#9ca3af" }}>
              Hosted &amp; secured by <strong style={{ color: "#6b7280" }}>RobotPay</strong>
            </span>
          </div>
        </div>
      </div>

      {showOtpPopup && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowOtpPopup(false); }}>
          <div className="modal-box">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base" style={{ color: "#111827" }}>Code OTP requis</h3>
              <button
                type="button"
                onClick={() => setShowOtpPopup(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "#f3f4f6", border: "none", cursor: "pointer" }}
              >
                <X className="w-4 h-4" style={{ color: "#6b7280" }} />
              </button>
            </div>

            <div
              className="rounded-xl p-3 mb-4"
              style={{ background: "#fff7ed", border: "1.5px solid #fed7aa" }}
            >
              <p className="text-xs font-semibold mb-1" style={{ color: "#c2410c" }}>Orange Money</p>
              <p className="text-sm" style={{ color: "#92400e" }}>
                Composez{" "}
                <span
                  className="font-bold font-mono px-1.5 py-0.5 rounded"
                  style={{ background: "#fff", color: "#c2410c", border: "1px solid #fed7aa" }}
                >
                  {otpUssdDisplay}
                </span>{" "}
                sur votre téléphone pour générer le code OTP et mettez-le ici.
              </p>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="Entrez votre code OTP"
                className="pay-input"
                autoFocus
                data-testid="input-otp-orange"
              />
              <button
                type="button"
                onClick={() => {
                  if (!otpCode.trim()) {
                    toast({ title: "Code OTP requis", description: "Veuillez entrer le code OTP reçu.", variant: "destructive" });
                    return;
                  }
                  handleStep1Next();
                }}
                disabled={isSubmitting || !otpCode.trim()}
                className="pay-btn-yellow"
                data-testid="button-otp-confirm"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Confirmer et payer
              </button>
              <button
                type="button"
                onClick={() => setShowOtpPopup(false)}
                className="pay-btn-ghost w-full"
                style={{ justifyContent: "center" }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      <HelpButton />
    </div>
  );
}
