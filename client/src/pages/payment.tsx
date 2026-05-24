import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Phone, ExternalLink, Bitcoin, X, RefreshCw, Clock, CreditCard } from "lucide-react";
import HelpButton from "@/components/HelpButton";

import waveIcon from "@assets/zOMoVcU_1779635321598.png";
import moovIcon from "@assets/ZJCa7PK_1779635321640.jpg";
import mtnIcon from "@assets/XzQ5b64_1779635321616.png";
import tmoneyIcon from "@assets/ruU3bQe_1779635321485.png";
import robotpayLogo from "@assets/20260524_144646_1779635303879.png";

type MerchantInfo = { name: string; slug: string; countries: string[] };

const PAYMENT_METHODS: Record<string, string[]> = {
  "Togo": ["Moov Money", "TMoney"],
  "Benin": ["MTN Mobile Money", "Moov Money", "Celtiis"],
  "Burkina Faso": ["Coris Money", "Moov Money", "Orange Money"],
  "Cameroun": ["MTN Mobile Money", "Orange Money"],
  "Congo Brazzaville": ["MTN Mobile Money"],
  "Congo RDC": ["Africell", "Airtel Money", "M-Pesa", "Orange Money"],
  "Gabon": ["Airtel Money", "Moov Money"],
  "Cote d'Ivoire": ["Wave", "Orange Money", "Moov Money", "MTN Mobile Money"],
  "Mali": ["Orange Money"],
  "Senegal": ["Wave", "Mixx by Yas", "Orange Money"],
  "Guinee": ["MTN Mobile Money", "Orange Money"],
  "Gambie": ["Africell Money"],
};

const DIAL_CODES: Record<string, string> = {
  "Togo": "+228", "Benin": "+229", "Burkina Faso": "+226", "Cameroun": "+237",
  "Congo Brazzaville": "+242", "Congo RDC": "+243", "Gabon": "+241",
  "Cote d'Ivoire": "+225", "Mali": "+223", "Senegal": "+221",
  "Guinee": "+224", "Gambie": "+220",
};

const COUNTRY_FLAGS: Record<string, string> = {
  "Togo": "🇹🇬", "Benin": "🇧🇯", "Burkina Faso": "🇧🇫", "Cameroun": "🇨🇲",
  "Congo Brazzaville": "🇨🇬", "Congo RDC": "🇨🇩", "Gabon": "🇬🇦",
  "Cote d'Ivoire": "🇨🇮", "Mali": "🇲🇱", "Senegal": "🇸🇳",
  "Guinee": "🇬🇳", "Gambie": "🇬🇲",
};

/* Map operator name → real image */
const OPERATOR_IMAGES: Record<string, string> = {
  "Wave": waveIcon,
  "Moov Money": moovIcon,
  "MTN Mobile Money": mtnIcon,
  "TMoney": tmoneyIcon,
};

/* Fallback color + abbreviation for operators without an image */
const OPERATOR_META: Record<string, { color: string; abbr: string }> = {
  "Orange Money": { color: "#FF6600", abbr: "OM" },
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
  const [payerName] = useState(nameParam);
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

  /* ── Fetch merchant on mount ─────────────────────────────────────────────── */
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
            setMerchantInfo({ name: d.merchantName || d.merchantSlug || "", slug: d.merchantSlug || "", countries: d.country ? [d.country] : [] });
          }
          setConfirmedAt(new Date());
        }).catch(() => {});
      return;
    }
    if (!merchantSlug) { setLoadError("Lien de paiement invalide."); setIsLoading(false); return; }
    fetchMerchantInfo();
  }, [merchantSlug]);

  useEffect(() => {
    if (!selectedCountry) return;
    fetch(`/api/public/payment-methods/${encodeURIComponent(selectedCountry)}?type=api`)
      .then(r => r.json())
      .then(d => setDynamicMethods(Array.isArray(d.methods) ? d.methods : null))
      .catch(() => setDynamicMethods(null));
    setSelectedMethod(""); setOtpCode("");
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
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Marchand introuvable"); }
      const data = await res.json();
      setMerchantInfo(data.merchant);
      if (countryParam) {
        const match = data.merchant.countries.find((c: string) => c.toLowerCase() === countryParam.toLowerCase());
        setSelectedCountry(match || (data.merchant.countries[0] ?? ""));
      } else if (data.merchant.countries.length > 0) {
        setSelectedCountry(data.merchant.countries[0]);
      }
    } catch (err: any) { setLoadError(err.message); }
    finally { setIsLoading(false); }
  };

  const availableMethods = dynamicMethods ?? (PAYMENT_METHODS[selectedCountry] || []);
  const needsManualOtp = selectedMethod === "Orange Money" && (selectedCountry === "Burkina Faso" || selectedCountry === "Cote d'Ivoire");
  const otpUssdDisplay = selectedCountry === "Burkina Faso" ? "*144*4*6*montant#" : "#144*82#";
  const orangeUssdCode = selectedCountry === "Mali" ? "#144#" : null;
  const orangeMenuHint = selectedCountry === "Mali" ? "menu Paiement marchand (option 2)" : null;
  const needsOrangeInstruction = selectedMethod === "Orange Money" && selectedCountry === "Mali";
  const isCryptoMethod = selectedMethod === "crypto";
  const dialCode = DIAL_CODES[selectedCountry] || "+";

  const handleSelectMethod = useCallback((m: string) => { setSelectedMethod(m); setOtpCode(""); }, []);

  /* ── OmniPay polling ─────────────────────────────────────────────────────── */
  const startOmnipayPolling = (pId: number) => {
    setOmnipayPolling(true);
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/omnipay/payment/${pId}/status`);
        const data = await res.json();
        if (data.status === "confirmed") { clearInterval(pollingRef.current!); setOmnipayPolling(false); setConfirmedAt(new Date()); setStep(3); }
        else if (data.status === "failed") { clearInterval(pollingRef.current!); setOmnipayPolling(false); setPaymentFailed(true); setFailureReason("Le paiement n'a pas pu être traité. Vérifiez votre solde ou votre code secret."); }
      } catch {}
    }, 5000);
  };

  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  /* ── Redirect countdown on success ──────────────────────────────────────── */
  const safeRedirect = (rawUrl: string, extra?: Record<string, string>) => {
    if (!rawUrl || /^(javascript|data|vbscript):/i.test(rawUrl.trim())) return;
    const normalized = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    try {
      const url = new URL(normalized);
      if (!["https:", "http:"].includes(url.protocol)) return;
      if (extra) Object.entries(extra).forEach(([k, v]) => url.searchParams.set(k, v));
      window.location.replace(url.toString());
    } catch {}
  };

  useEffect(() => {
    if (step !== 3) return;
    const timer = setInterval(() => {
      setRedirectCountdown(prev => {
        if (prev <= 1) { clearInterval(timer); if (redirectUrlRef.current) safeRedirect(redirectUrlRef.current, { status: "success", amount: String(amount), ref: omnipayReference || "" }); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  /* ── Payment handlers ────────────────────────────────────────────────────── */
  const handlePayClick = () => {
    if (!selectedMethod) { toast({ title: "Méthode requise", description: "Veuillez sélectionner une méthode de paiement.", variant: "destructive" }); return; }
    if (isCryptoMethod) { handleStep1Next(); return; }
    if (!payerPhone.trim()) { toast({ title: "Numéro requis", description: "Veuillez saisir votre numéro de téléphone.", variant: "destructive" }); return; }
    if (needsManualOtp && !otpCode.trim()) { setShowOtpPopup(true); return; }
    handleStep1Next();
  };

  const handleStep1Next = async () => {
    if (!selectedMethod) return;
    if (isCryptoMethod) {
      setIsCryptoLoading(true);
      try {
        const res = await fetch("/api/payment/crypto/initiate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ merchantSlug, amount, currency, returnUrl: redirectUrl || undefined }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        window.location.replace(`/pay/crypto/${data.trackId}`);
      } catch { toast({ title: "Paiement non disponible", variant: "destructive" }); }
      finally { setIsCryptoLoading(false); }
      return;
    }
    setIsSubmitting(true); setPaymentFailed(false); setFailureReason("");
    try {
      const res = await fetch("/api/payment/initiate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantSlug, country: selectedCountry, amount, payerPhone: payerPhone.trim(), payerName: payerName.trim(), paymentMethod: selectedMethod, redirectUrl: redirectUrl || null, firstName: "Client", lastName: "RobotPay", operator: selectedMethod.toLowerCase().includes("wave") ? "wave" : undefined, otp: needsManualOtp ? otpCode.trim() : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setPaymentId(data.paymentId); setOmnipayReference(data.omnipayReference); setOmnipayFees(data.fees || 0); setShowOtpPopup(false);
      if (data.sendavapay && data.otpRequired) { setSendavaOtpRequired(true); setSendavaUssdCode(data.ussdCode || null); setSendavaOtpConfirmed(false); setSendavaOtp(""); setStep(2); }
      else if (data.paymentUrl) { setOmnipayPaymentUrl(data.paymentUrl); setStep(2); }
      else { setStep(2); startOmnipayPolling(data.paymentId); }
    } catch { toast({ title: "Paiement non abouti", description: "Vérifiez vos informations et réessayez.", variant: "destructive" }); }
    finally { setIsSubmitting(false); }
  };

  const handleSendavaConfirmOtp = async () => {
    if (!paymentId || !sendavaOtp.trim()) return;
    setSendavaOtpConfirming(true);
    try {
      const res = await fetch("/api/payment/sendavapay/confirm-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentId, otp: sendavaOtp.trim() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSendavaOtpConfirmed(true); startOmnipayPolling(paymentId);
    } catch (err: any) { toast({ title: "Code OTP invalide", description: err.message, variant: "destructive" }); }
    finally { setSendavaOtpConfirming(false); }
  };

  const handleWaveRedirect = () => { if (omnipayPaymentUrl) { window.open(omnipayPaymentUrl, "_blank"); if (paymentId) startOmnipayPolling(paymentId); } };

  const handleRetry = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setOmnipayPolling(false); setPaymentFailed(false); setFailureReason(""); setOmnipayPaymentUrl(null);
    setSendavaOtpRequired(false); setSendavaOtp(""); setSendavaOtpConfirmed(false); setStep(1);
  };

  const formatAmount = (v: number) => v.toLocaleString("fr-FR");
  const formatTime = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const formatDate = (d: Date) => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

  /* ── Loading / Error states ─────────────────────────────────────────────── */
  if (isLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
      <Loader2 style={{ width: 32, height: 32, color: "#2563eb", animation: "spin 1s linear infinite" }} />
    </div>
  );

  if ((loadError || !merchantInfo) && step !== 3) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 32, maxWidth: 340, width: "100%", textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.10)" }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <X style={{ width: 24, height: 24, color: "#dc2626" }} />
        </div>
        <p style={{ fontWeight: 700, color: "#111", marginBottom: 8 }}>Lien invalide</p>
        <p style={{ color: "#6b7280", fontSize: 14 }}>{loadError || "Ce lien de paiement n'est pas valide."}</p>
      </div>
    </div>
  );

  /* ── Main render ─────────────────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes success-pop { 0%{transform:scale(0.5);opacity:0} 60%{transform:scale(1.1);opacity:1} 80%{transform:scale(0.95)} 100%{transform:scale(1);opacity:1} }
        @keyframes check-draw { 0%{stroke-dashoffset:100} 100%{stroke-dashoffset:0} }
        @keyframes omni-pulse { 0%,100%{transform:scale(0.95);opacity:1} 50%{transform:scale(1.05);opacity:0.7} }
        @keyframes fail-shake { 0%,100%{transform:translateX(0)} 15%{transform:translateX(-8px)} 30%{transform:translateX(8px)} 45%{transform:translateX(-6px)} 60%{transform:translateX(6px)} 75%{transform:translateX(-3px)} 90%{transform:translateX(3px)} }
        .anim-success { animation: success-pop 0.5s cubic-bezier(0.175,0.885,0.32,1.275) forwards; }
        .anim-check { stroke-dasharray:100;stroke-dashoffset:100;animation:check-draw 0.4s ease-out 0.35s forwards; }
        .anim-pulse { animation: omni-pulse 2s ease-in-out infinite; }
        .anim-fail { animation: fail-shake 0.5s ease-in-out 0.1s both; }
        .op-circle { border-radius:50%;cursor:pointer;transition:transform 0.12s,box-shadow 0.12s;-webkit-tap-highlight-color:transparent;user-select:none; }
        .op-circle:active { transform:scale(0.93); }
        .pay-btn { width:100%;padding:15px;font-size:17px;font-weight:800;border:none;border-radius:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;letter-spacing:0.01em;-webkit-tap-highlight-color:transparent;transition:opacity 0.15s,transform 0.1s; }
        .pay-btn:active:not(:disabled){transform:scale(0.98);}
        .pay-btn:disabled{opacity:0.45;cursor:not-allowed;}
        .ghost-btn{padding:10px 18px;font-size:13px;font-weight:500;border:1.5px solid #e5e7eb;border-radius:10px;background:transparent;color:#6b7280;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:background 0.15s;}
        .ghost-btn:hover{background:#f3f4f6;}
        .pay-input{width:100%;padding:11px 14px;font-size:15px;border:1.5px solid #d1d5db;border-radius:11px;outline:none;background:#fff;color:#111;transition:border-color 0.15s,box-shadow 0.15s;}
        .pay-input:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,0.12);}
        .pay-input::placeholder{color:#9ca3af;}
        .pay-select{width:100%;padding:11px 40px 11px 14px;font-size:15px;border:1.5px solid #d1d5db;border-radius:11px;outline:none;background:#fff;color:#111;cursor:pointer;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;transition:border-color 0.15s;}
        .pay-select:focus{border-color:#2563eb;}
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;}
        .modal-box{background:#fff;border-radius:22px;padding:26px;width:100%;max-width:360px;box-shadow:0 24px 60px rgba(0,0,0,0.22);}
      `}</style>

      {/* ════════════════════════════════ CARD ════════════════════════════════ */}
      <div style={{ width: "100%", maxWidth: 390, background: "#fff", borderRadius: 28, boxShadow: "0 4px 32px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #f1f5f9", background: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <CreditCard style={{ width: 20, height: 20, color: "#2563eb" }} />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 15, color: "#111827", lineHeight: 1.2 }} data-testid="text-brand">Effectuer un paiement</p>
              {merchantInfo && <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{merchantInfo.name}</p>}
            </div>
          </div>
          <button onClick={() => window.history.back()} data-testid="button-close"
            style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px solid #e5e7eb", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X style={{ width: 15, height: 15, color: "#6b7280" }} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: "22px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ══ STEP 1 ══════════════════════════════════════════════════════ */}
          {step === 1 && (<>

            {/* Country selector */}
            {merchantInfo && merchantInfo.countries.length > 1 && (
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Sélectionner un pays</label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 18, pointerEvents: "none" }}>
                    {COUNTRY_FLAGS[selectedCountry] || "🌍"}
                  </span>
                  <select value={selectedCountry} onChange={e => { setSelectedCountry(e.target.value); setSelectedMethod(""); }}
                    className="pay-select" style={{ paddingLeft: 40 }} data-testid="select-country">
                    {merchantInfo.countries.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Amount */}
            {amount > 0 && (
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 4, fontWeight: 500 }}>Montant à payer</p>
                <p style={{ fontSize: 28, fontWeight: 800, color: "#2563eb", letterSpacing: "-0.5px" }} data-testid="text-pay-amount">
                  {currency} {formatAmount(amount)}
                </p>
              </div>
            )}

            {/* Operator circles */}
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 10 }}>Choisissez une méthode de payement</p>

              {availableMethods.length === 0 && !cryptoEnabled ? (
                <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: "12px 0", border: "1.5px dashed #e5e7eb", borderRadius: 12 }}>Aucune méthode disponible pour ce pays.</p>
              ) : (
                <div style={{ border: "2px solid #111", borderRadius: 16, padding: "12px 10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" }}
                  role="radiogroup" aria-label="Opérateur de paiement">

                  {availableMethods.map(method => {
                    const img = OPERATOR_IMAGES[method];
                    const meta = OPERATOR_META[method] || { color: "#6b7280", abbr: method.substring(0, 2).toUpperCase() };
                    const isSelected = selectedMethod === method;
                    return (
                      <div key={method} className="op-circle"
                        onClick={() => handleSelectMethod(method)}
                        onTouchEnd={e => { e.preventDefault(); handleSelectMethod(method); }}
                        role="radio" aria-checked={isSelected} tabIndex={0}
                        onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); handleSelectMethod(method); } }}
                        data-testid={`radio-method-${method.replace(/\s+/g, "-").toLowerCase()}`}
                        style={{
                          width: 64, height: 64, overflow: "hidden", flexShrink: 0,
                          boxShadow: isSelected ? "0 0 0 3px #2563eb" : "0 0 0 2px transparent",
                          transition: "box-shadow 0.15s, transform 0.12s",
                        }}
                        title={method}
                      >
                        {img ? (
                          <img src={img} alt={method} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: meta.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#fff", letterSpacing: "0.03em" }}>
                            {meta.abbr}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {cryptoEnabled && (
                    <div className="op-circle"
                      onClick={() => handleSelectMethod("crypto")}
                      onTouchEnd={e => { e.preventDefault(); handleSelectMethod("crypto"); }}
                      role="radio" aria-checked={isCryptoMethod} tabIndex={0}
                      onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); handleSelectMethod("crypto"); } }}
                      data-testid="radio-method-crypto"
                      style={{ width: 64, height: 64, overflow: "hidden", flexShrink: 0, boxShadow: isCryptoMethod ? "0 0 0 3px #f59e0b" : "0 0 0 2px transparent", transition: "box-shadow 0.15s" }}
                      title="Crypto"
                    >
                      <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Bitcoin style={{ width: 28, height: 28, color: "#fff" }} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Selected method label */}
              {selectedMethod && !isCryptoMethod && (
                <p style={{ textAlign: "center", fontSize: 13, color: "#2563eb", fontWeight: 600, marginTop: 8 }}>{selectedMethod}</p>
              )}
              {isCryptoMethod && (
                <p style={{ textAlign: "center", fontSize: 13, color: "#d97706", fontWeight: 600, marginTop: 8 }}>Paiement en crypto-monnaie</p>
              )}
            </div>

            {/* Crypto info */}
            {isCryptoMethod && (
              <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 12, padding: "10px 14px" }} data-testid="crypto-info-block">
                <p style={{ fontSize: 12, color: "#92400e" }}>Vous serez redirigé vers une page sécurisée avec QR code. Équivalence FCFA → crypto calculée en temps réel.</p>
              </div>
            )}

            {/* Phone input */}
            {!isCryptoMethod && (
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Numéro de téléphone</label>
                <div style={{ display: "flex", alignItems: "stretch", border: "1.5px solid #d1d5db", borderRadius: 11, overflow: "hidden", background: "#fff", transition: "border-color 0.15s" }}
                  onFocus={() => {}} onBlur={() => {}}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px", background: "#f8fafc", borderRight: "1.5px solid #e5e7eb", flexShrink: 0 }}>
                    <Phone style={{ width: 14, height: 14, color: "#9ca3af" }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#374151" }}>{dialCode}</span>
                  </div>
                  <input type="tel" value={payerPhone} onChange={e => setPayerPhone(e.target.value)}
                    placeholder="XX XXX XX XXX" data-testid="input-payer-phone"
                    style={{ flex: 1, padding: "12px 14px", fontSize: 15, border: "none", outline: "none", background: "transparent", color: "#111" }} />
                </div>
              </div>
            )}

            {/* Orange Money Mali instruction */}
            {needsOrangeInstruction && !isCryptoMethod && (
              <div style={{ background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 12, padding: "10px 14px" }} data-testid="orange-instruction-block">
                <p style={{ fontSize: 12, fontWeight: 600, color: "#c2410c", marginBottom: 4 }}>Orange Money — Validation requise</p>
                <p style={{ fontSize: 12, color: "#92400e" }}>Composez <strong>{orangeUssdCode}</strong> puis accédez au <strong>{orangeMenuHint}</strong> pour valider.</p>
              </div>
            )}

            {/* Pay button */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button type="button" onClick={handlePayClick}
                disabled={isSubmitting || isCryptoLoading || !selectedMethod || (!isCryptoMethod && !payerPhone.trim())}
                className="pay-btn" data-testid="button-step1-next"
                style={{ background: "linear-gradient(135deg,#f5c100 0%,#e8a800 100%)", color: "#1a1100", boxShadow: "0 4px 18px rgba(245,193,0,0.38)" }}>
                {(isSubmitting || isCryptoLoading) && <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />}
                {isCryptoMethod ? "Payer en crypto" : "Payez avec RobotPay"}
              </button>
              <p style={{ textAlign: "center", fontSize: 12, color: "#9ca3af", letterSpacing: "0.03em" }}>使用 RobotPay 安全等待</p>
            </div>

          </>)}

          {/* ══ STEP 2 ══════════════════════════════════════════════════════ */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }} data-testid="step-2-omnipay-content">

              {paymentFailed ? (
                <div style={{ textAlign: "center", paddingTop: 8, display: "flex", flexDirection: "column", gap: 16 }} data-testid="step-2-failed">
                  <div className="anim-fail" style={{ display: "inline-block" }}>
                    <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#fee2e2", border: "4px solid #fca5a5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                      <X style={{ width: 36, height: 36, color: "#dc2626" }} />
                    </div>
                  </div>
                  <div>
                    <p style={{ fontWeight: 700, color: "#991b1b", fontSize: 16 }}>Paiement échoué</p>
                    <p style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>{failureReason}</p>
                  </div>
                  <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 14px", textAlign: "left" }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#991b1b", marginBottom: 4 }}>Que faire ?</p>
                    {["Vérifiez que votre solde est suffisant","Assurez-vous que votre code secret est correct","Vérifiez que le numéro est correct"].map(t => (
                      <p key={t} style={{ fontSize: 12, color: "#7f1d1d" }}>• {t}</p>
                    ))}
                  </div>
                  <button type="button" onClick={handleRetry} className="pay-btn" data-testid="button-retry"
                    style={{ background: "linear-gradient(135deg,#f5c100 0%,#e8a800 100%)", color: "#1a1100" }}>
                    <RefreshCw style={{ width: 16, height: 16 }} /> Réessayer
                  </button>
                </div>

              ) : sendavaOtpRequired && !sendavaOtpConfirmed ? (<>
                <div style={{ background: "#fff7ed", borderRadius: 12, padding: 12, textAlign: "center", fontSize: 14, fontWeight: 500, color: "#92400e" }}>Validation Orange Money — Code OTP requis</div>
                {sendavaUssdCode && (
                  <div style={{ background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 12, padding: "10px 14px" }} data-testid="sendava-ussd-block">
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#c2410c", marginBottom: 4 }}>Étape 1 — Obtenez votre code OTP</p>
                    <p style={{ fontSize: 12, color: "#92400e" }}>Composez <strong style={{ fontFamily: "monospace" }}>{sendavaUssdCode}</strong> sur votre téléphone.</p>
                  </div>
                )}
                <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }} data-testid="sendava-otp-input-block">
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#166534" }}>Étape 2 — Entrez votre code OTP</p>
                  <input type="text" inputMode="numeric" maxLength={8} value={sendavaOtp}
                    onChange={e => setSendavaOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder="Code OTP reçu par SMS" className="pay-input" data-testid="input-sendava-otp" />
                  <button type="button" onClick={handleSendavaConfirmOtp} disabled={sendavaOtpConfirming || !sendavaOtp.trim()}
                    className="pay-btn" data-testid="button-sendava-confirm-otp"
                    style={{ background: "linear-gradient(135deg,#f5c100 0%,#e8a800 100%)", color: "#1a1100" }}>
                    {sendavaOtpConfirming && <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />}
                    Confirmer le paiement
                  </button>
                </div>
                <button type="button" onClick={handleRetry} className="ghost-btn" data-testid="button-step2-sendava-prev">← Retour</button>
              </>) : sendavaOtpRequired && sendavaOtpConfirmed ? (<>
                <div style={{ background: "#dcfce7", borderRadius: 12, padding: 12, textAlign: "center", fontSize: 14, fontWeight: 500, color: "#166534" }}>Code OTP confirmé — Paiement en cours</div>
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <Loader2 style={{ width: 36, height: 36, color: "#2563eb", animation: "spin 1s linear infinite", margin: "0 auto" }} />
                  <p style={{ fontSize: 13, color: "#6b7280", marginTop: 12 }}>Vérification en cours...</p>
                </div>
              </>) : omnipayPaymentUrl ? (<>
                <div style={{ background: "#dbeafe", borderRadius: 12, padding: 12, textAlign: "center", fontSize: 14, fontWeight: 500, color: "#1e40af" }}>
                  Cliquez ci-dessous pour valider votre paiement de {formatAmount(amount)} {currency}
                </div>
                {omnipayFees > 0 && <p style={{ textAlign: "center", fontSize: 12, color: "#6b7280" }}>Frais : {formatAmount(omnipayFees)} {currency}</p>}
                <button type="button" onClick={handleWaveRedirect} className="pay-btn" data-testid="button-wave-pay"
                  style={{ background: "linear-gradient(135deg,#f5c100 0%,#e8a800 100%)", color: "#1a1100" }}>
                  <ExternalLink style={{ width: 16, height: 16 }} /> Valider le paiement
                </button>
                {omnipayPolling && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#6b7280" }}>
                    <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                    <span style={{ fontSize: 13 }}>En attente de confirmation...</span>
                  </div>
                )}
                <button type="button" onClick={handleRetry} className="ghost-btn" data-testid="button-step2-prev">← Retour</button>
              </>) : (<>
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                  <div className="anim-pulse" style={{ display: "inline-block" }}>
                    <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                      <Phone style={{ width: 38, height: 38, color: "#2563eb" }} />
                    </div>
                  </div>
                  <p style={{ fontWeight: 700, fontSize: 15, color: "#111", marginTop: 14 }}>Validez sur votre téléphone</p>
                  <p style={{ fontSize: 13, color: "#6b7280", marginTop: 6 }}>
                    Une demande de paiement de <strong style={{ color: "#1d4ed8" }}>{formatAmount(amount)} {currency}</strong> a été envoyée sur votre appareil.
                  </p>
                  {omnipayFees > 0 && <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>Frais : {formatAmount(omnipayFees)} {currency}</p>}
                </div>
                {needsOrangeInstruction && (
                  <div style={{ background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 12, padding: "10px 14px" }} data-testid="orange-instruction-step2">
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#c2410c", marginBottom: 4 }}>Orange Money — Comment valider ?</p>
                    <p style={{ fontSize: 12, color: "#92400e" }}>Composez <strong>{orangeUssdCode}</strong> puis accédez au <strong>{orangeMenuHint}</strong> et validez.</p>
                  </div>
                )}
                {omnipayPolling && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#6b7280" }}>
                    <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                    <span style={{ fontSize: 12 }}>Vérification en cours...</span>
                  </div>
                )}
                <button type="button" onClick={handleRetry} className="ghost-btn" data-testid="button-step2-prev">← Retour</button>
              </>)}
            </div>
          )}

          {/* ══ STEP 3 ══════════════════════════════════════════════════════ */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }} data-testid="step-3-content">
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div className="anim-success">
                  <div style={{ width: 96, height: 96, borderRadius: "50%", background: "radial-gradient(circle,#dcfce7 60%,#bbf7d0 100%)", border: "5px solid #86efac", boxShadow: "0 0 0 8px #dcfce7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                      <path className="anim-check" d="M10 25 L20 35 L38 14" stroke="#00b050" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  </div>
                </div>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#00b050", textTransform: "uppercase", letterSpacing: "0.12em", marginTop: 12 }}>Paiement approuvé</p>
              </div>

              <div style={{ borderRadius: 14, padding: "18px 20px", textAlign: "center", background: "linear-gradient(135deg,#1d4ed8 0%,#3b82f6 100%)" }}>
                <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Montant débité</p>
                <p style={{ color: "#fff", fontWeight: 800, fontSize: 38, letterSpacing: "-1px" }}>
                  {formatAmount(amount)}<span style={{ fontSize: 20, fontWeight: 500, opacity: 0.75, marginLeft: 8 }}>{currency}</span>
                </p>
                {merchantInfo && <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 6 }}>{merchantInfo.name}</p>}
              </div>

              <div style={{ border: "1.5px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
                {omnipayReference && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 16px", borderBottom: "1px solid #f3f4f6" }}>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>Référence</span>
                    <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 600, color: "#111" }}>{omnipayReference}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 16px", borderBottom: "1px solid #f3f4f6" }}>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>Statut</span>
                  <span style={{ fontSize: 12, fontWeight: 600, background: "#dcfce7", color: "#166534", padding: "2px 10px", borderRadius: 99 }}>Confirmé</span>
                </div>
                {confirmedAt && (<>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 16px", borderBottom: "1px solid #f3f4f6" }}>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>Date</span>
                    <span style={{ fontSize: 12, color: "#374151" }}>{formatDate(confirmedAt)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 16px" }}>
                    <span style={{ fontSize: 12, color: "#6b7280", display: "flex", alignItems: "center", gap: 4 }}><Clock style={{ width: 12, height: 12 }} /> Heure</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{formatTime(confirmedAt)}</span>
                  </div>
                </>)}
              </div>

              {redirectUrl ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <p style={{ textAlign: "center", fontSize: 12, color: "#9ca3af" }}>Redirection dans <strong style={{ color: "#374151" }}>{redirectCountdown}s</strong>...</p>
                  <a href={(() => { try { const u = new URL(/^https?:\/\//i.test(redirectUrl) ? redirectUrl : `https://${redirectUrl}`); u.searchParams.set("status","success"); u.searchParams.set("amount",String(amount)); u.searchParams.set("ref",omnipayReference||""); return u.toString(); } catch { return "#"; } })()}
                    className="pay-btn" style={{ textDecoration: "none", background: "linear-gradient(135deg,#f5c100 0%,#e8a800 100%)", color: "#1a1100" }} data-testid="link-redirect">
                    Retourner sur le site
                  </a>
                </div>
              ) : (
                <p style={{ textAlign: "center", fontSize: 13, color: "#9ca3af" }}>Vous pouvez fermer cette page.</p>
              )}
            </div>
          )}

        </div>

        {/* ── Footer ── */}
        <div style={{ borderTop: "1px solid #f1f5f9", padding: "14px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "#fafafa" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Shield + check SVG */}
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 3L5 8.5v8c0 7 4.9 13.5 11 15 6.1-1.5 11-8 11-15v-8L16 3z" fill="#e8f0fe" stroke="#2563eb" strokeWidth="1.5" />
              <path d="M11 16l4 4 6-7" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ textAlign: "left" }}>
              <p style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>Hosted &amp; secured by</p>
              <img src={robotpayLogo} alt="RobotPay" style={{ height: 20, objectFit: "contain", filter: "grayscale(30%) brightness(0.4)", marginTop: 2 }} />
            </div>
          </div>
        </div>
      </div>

      {/* ════════════ OTP MODAL ════════════ */}
      {showOtpPopup && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowOtpPopup(false); }}>
          <div className="modal-box">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 17, color: "#111" }}>Code OTP requis</p>
                <p style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>Orange Money</p>
              </div>
              <button onClick={() => setShowOtpPopup(false)}
                style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px solid #e5e7eb", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X style={{ width: 15, height: 15, color: "#6b7280" }} />
              </button>
            </div>

            <div style={{ background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 14, padding: "14px 16px", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "#ff6600", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Phone style={{ width: 18, height: 18, color: "#fff" }} />
                </div>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 13, color: "#c2410c", marginBottom: 4 }}>Composez sur votre téléphone</p>
                  <p style={{ fontSize: 14, color: "#92400e" }}>
                    <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 16, background: "#fff", color: "#c2410c", padding: "2px 8px", borderRadius: 6, border: "1px solid #fed7aa" }}>
                      {otpUssdDisplay}
                    </span>
                    {" "}pour générer le code OTP et mettez-le ici.
                  </p>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Votre code OTP</label>
                <input type="text" inputMode="numeric" maxLength={8} value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="Code reçu par téléphone" className="pay-input" autoFocus data-testid="input-otp-orange"
                  style={{ textAlign: "center", fontSize: 22, fontWeight: 700, letterSpacing: "0.2em" }} />
              </div>
              <button type="button" className="pay-btn" data-testid="button-otp-confirm"
                disabled={isSubmitting || !otpCode.trim()}
                style={{ background: "linear-gradient(135deg,#f5c100 0%,#e8a800 100%)", color: "#1a1100" }}
                onClick={() => { if (!otpCode.trim()) { toast({ title: "Code OTP requis", variant: "destructive" }); return; } handleStep1Next(); }}>
                {isSubmitting && <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />}
                Confirmer et payer
              </button>
              <button type="button" className="ghost-btn" onClick={() => setShowOtpPopup(false)}
                style={{ justifyContent: "center", width: "100%" }}>
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
