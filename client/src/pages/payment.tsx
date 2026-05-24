import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Smartphone, ExternalLink, Bitcoin, X, RefreshCw, Clock, CreditCard } from "lucide-react";

import waveIcon    from "@assets/zOMoVcU_1779635321598.png";
import moovIcon    from "@assets/ZJCa7PK_1779635321640.jpg";
import mtnIcon     from "@assets/XzQ5b64_1779635321616.png";
import tmoneyIcon  from "@assets/ruU3bQe_1779635321485.png";
import robotpayLogo from "@assets/20260524_144646_1779635303879.png";

/* ── types ─────────────────────────────────────────────────────────────── */
type MerchantInfo = { name: string; slug: string; countries: string[] };

/* ── static data ────────────────────────────────────────────────────────── */
const PAYMENT_METHODS: Record<string, string[]> = {
  "Togo":               ["Moov Money", "TMoney"],
  "Benin":              ["MTN Mobile Money", "Moov Money", "Celtiis"],
  "Burkina Faso":       ["Coris Money", "Moov Money", "Orange Money"],
  "Cameroun":           ["MTN Mobile Money", "Orange Money"],
  "Congo Brazzaville":  ["MTN Mobile Money"],
  "Congo RDC":          ["Africell", "Airtel Money", "M-Pesa", "Orange Money"],
  "Gabon":              ["Airtel Money", "Moov Money"],
  "Cote d'Ivoire":      ["Wave", "Orange Money", "Moov Money", "MTN Mobile Money"],
  "Mali":               ["Orange Money"],
  "Senegal":            ["Wave", "Mixx by Yas", "Orange Money"],
  "Guinee":             ["MTN Mobile Money", "Orange Money"],
  "Gambie":             ["Africell Money"],
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

/* operator icon (real image or color+abbr fallback) */
const OPERATOR_IMAGES: Record<string, string> = {
  "Wave":             waveIcon,
  "Moov Money":       moovIcon,
  "MTN Mobile Money": mtnIcon,
  "TMoney":           tmoneyIcon,
};
const OPERATOR_META: Record<string, { bg: string; abbr: string }> = {
  "Orange Money":  { bg: "#FF6600", abbr: "OM" },
  "Airtel Money":  { bg: "#E8001D", abbr: "AT" },
  "M-Pesa":        { bg: "#60BB44", abbr: "MP" },
  "Coris Money":   { bg: "#7C2020", abbr: "CM" },
  "Mixx by Yas":   { bg: "#7C3AED", abbr: "MX" },
  "Africell":      { bg: "#0066B3", abbr: "AF" },
  "Africell Money":{ bg: "#0066B3", abbr: "AF" },
  "Celtiis":       { bg: "#E05A00", abbr: "CT" },
};

function currencyForCountry(c: string) {
  if (["Cameroun","Congo Brazzaville","Gabon"].includes(c)) return "XAF";
  if (c === "Congo RDC") return "CDF";
  if (c === "Guinee")    return "GNF";
  if (c === "Gambie")    return "GMD";
  return "XOF";
}

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════════════════════ */
export default function PaymentPage() {
  const { toast } = useToast();

  /* URL params */
  const pathParts   = window.location.pathname.split("/");
  const slugFromPath= pathParts.length === 3 && pathParts[1] === "pay" ? pathParts[2] : "";
  const urlParams   = new URLSearchParams(window.location.search);
  const merchantSlug    = urlParams.get("merchant") || slugFromPath || "";
  const amountParam     = urlParams.get("amount");
  const countryParam    = urlParams.get("country") || "";
  const redirectUrlParam= urlParams.get("redirect") || "";
  const omnipayStatus   = urlParams.get("omnipay_status") || "";
  const refParam        = urlParams.get("ref") || "";
  const phoneParam      = urlParams.get("phone") || urlParams.get("payerPhone") || "";
  const nameParam       = urlParams.get("name")  || urlParams.get("payerName")  || "";

  /* state */
  const [amount,      setAmount]      = useState(amountParam ? parseInt(amountParam, 10) : 0);
  const [redirectUrl, setRedirectUrl] = useState(redirectUrlParam);
  const redirectRef   = useRef(redirectUrlParam);

  const [step,         setStep]        = useState(omnipayStatus === "complete" ? 3 : 1);
  const [merchantInfo, setMerchantInfo]= useState<MerchantInfo | null>(null);
  const [isLoading,    setIsLoading]   = useState(true);
  const [loadError,    setLoadError]   = useState<string | null>(null);

  const [payerPhone,  setPayerPhone]  = useState(phoneParam);
  const [payerName]   = useState(nameParam);
  const [country,     setCountry]     = useState(countryParam);
  const currency = currencyForCountry(country);

  const [method,       setMethod]      = useState("");
  const [otpCode,      setOtpCode]     = useState("");
  const [paymentId,    setPaymentId]   = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting]= useState(false);
  const [countdown,    setCountdown]   = useState(5);

  const [paymentUrl,   setPaymentUrl]  = useState<string | null>(null);
  const [omniRef,      setOmniRef]     = useState<string | null>(null);
  const [omniPolling,  setOmniPolling] = useState(false);
  const [omniFees,     setOmniFees]    = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [dynMethods,  setDynMethods]  = useState<string[] | null>(null);
  const [cryptoOn,    setCryptoOn]    = useState(false);
  const [cryptoLoading,setCryptoLoad] = useState(false);

  const [sndOtpRequired,  setSndOtpRequired] = useState(false);
  const [sndUssdCode,     setSndUssdCode]    = useState<string | null>(null);
  const [sndOtp,          setSndOtp]         = useState("");
  const [sndConfirming,   setSndConfirming]  = useState(false);
  const [sndConfirmed,    setSndConfirmed]   = useState(false);

  const [failed,       setFailed]      = useState(false);
  const [failReason,   setFailReason]  = useState("");
  const [confirmedAt,  setConfirmedAt] = useState<Date | null>(null);
  const [showOtpModal, setShowOtpModal]= useState(false);

  /* ── helpers ────────────────────────────────────────────────────────── */
  const safeRedirect = (raw: string, extra?: Record<string,string>) => {
    if (!raw || /^(javascript|data|vbscript):/i.test(raw.trim())) return;
    const norm = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const u = new URL(norm);
      if (!["https:","http:"].includes(u.protocol)) return;
      if (extra) Object.entries(extra).forEach(([k,v]) => u.searchParams.set(k,v));
      window.location.replace(u.toString());
    } catch {}
  };
  const fmt  = (n: number) => n.toLocaleString("fr-FR");
  const fmtT = (d: Date) => d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
  const fmtD = (d: Date) => d.toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"});

  /* ── derived ────────────────────────────────────────────────────────── */
  const methods          = dynMethods ?? (PAYMENT_METHODS[country] || []);
  const isCrypto         = method === "crypto";
  const needsOtp         = method === "Orange Money" && (country === "Burkina Faso" || country === "Cote d'Ivoire");
  const otpUssd          = country === "Burkina Faso" ? "*144*4*6*montant#" : "#144*82#";
  const maliOrange       = method === "Orange Money" && country === "Mali";
  const dialCode         = DIAL_CODES[country] || "+";

  /* ── fetch merchant ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (omnipayStatus === "complete" && refParam) {
      setIsLoading(false);
      fetch(`/api/payment/by-ref/${encodeURIComponent(refParam)}`)
        .then(r => r.json()).then(d => {
          if (d.amount)         setAmount(d.amount);
          if (d.redirectUrl)    { setRedirectUrl(d.redirectUrl); redirectRef.current = d.redirectUrl; }
          if (d.omnipayReference) setOmniRef(d.omnipayReference);
          if (d.merchantName || d.merchantSlug)
            setMerchantInfo({ name: d.merchantName || d.merchantSlug, slug: d.merchantSlug || "", countries: d.country ? [d.country] : [] });
          setConfirmedAt(new Date());
        }).catch(() => {});
      return;
    }
    if (!merchantSlug) { setLoadError("Lien de paiement invalide."); setIsLoading(false); return; }
    (async () => {
      setIsLoading(true);
      try {
        const r = await fetch(`/api/payment/${merchantSlug}/info`);
        if (!r.ok) { const d = await r.json(); throw new Error(d.message || "Marchand introuvable"); }
        const data = await r.json();
        setMerchantInfo(data.merchant);
        const countries: string[] = data.merchant.countries;
        if (countryParam) {
          const match = countries.find(c => c.toLowerCase() === countryParam.toLowerCase());
          setCountry(match || countries[0] || "");
        } else { setCountry(countries[0] || ""); }
      } catch (e: any) { setLoadError(e.message); }
      finally { setIsLoading(false); }
    })();
  }, [merchantSlug]);

  useEffect(() => {
    if (!country) return;
    fetch(`/api/public/payment-methods/${encodeURIComponent(country)}?type=api`)
      .then(r => r.json()).then(d => setDynMethods(Array.isArray(d.methods) ? d.methods : null))
      .catch(() => setDynMethods(null));
    setMethod(""); setOtpCode("");
  }, [country]);

  useEffect(() => {
    if (!merchantSlug) return;
    fetch(`/api/public/crypto/check-merchant/${encodeURIComponent(merchantSlug)}`)
      .then(r => r.ok ? r.json() : { enabled: false }).then(d => setCryptoOn(!!d.enabled)).catch(() => setCryptoOn(false));
  }, [merchantSlug]);

  /* ── polling ────────────────────────────────────────────────────────── */
  const startPolling = (pId: number) => {
    setOmniPolling(true);
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/omnipay/payment/${pId}/status`);
        const d = await r.json();
        if (d.status === "confirmed") { clearInterval(pollingRef.current!); setOmniPolling(false); setConfirmedAt(new Date()); setStep(3); }
        else if (d.status === "failed") { clearInterval(pollingRef.current!); setOmniPolling(false); setFailed(true); setFailReason("Le paiement n'a pas pu être traité. Vérifiez votre solde ou votre code secret."); }
      } catch {}
    }, 5000);
  };
  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  /* ── redirect countdown ─────────────────────────────────────────────── */
  useEffect(() => {
    if (step !== 3) return;
    const t = setInterval(() => setCountdown(p => {
      if (p <= 1) { clearInterval(t); if (redirectRef.current) safeRedirect(redirectRef.current, { status:"success", amount:String(amount), ref:omniRef||"" }); return 0; }
      return p - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [step]);

  /* ── handlers ───────────────────────────────────────────────────────── */
  const selectMethod = useCallback((m: string) => { setMethod(m); setOtpCode(""); }, []);

  const handlePay = () => {
    if (!method) { toast({ title:"Méthode requise", description:"Sélectionnez un opérateur.", variant:"destructive" }); return; }
    if (isCrypto) { doInitiate(); return; }
    if (!payerPhone.trim()) { toast({ title:"Numéro requis", description:"Entrez votre numéro.", variant:"destructive" }); return; }
    if (needsOtp && !otpCode.trim()) { setShowOtpModal(true); return; }
    doInitiate();
  };

  const doInitiate = async () => {
    if (isCrypto) {
      setCryptoLoad(true);
      try {
        const r = await fetch("/api/payment/crypto/initiate", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ merchantSlug, amount, currency, returnUrl: redirectUrl || undefined }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.message);
        window.location.replace(`/pay/crypto/${d.trackId}`);
      } catch { toast({ title:"Paiement non disponible", variant:"destructive" }); }
      finally { setCryptoLoad(false); }
      return;
    }
    setIsSubmitting(true); setFailed(false); setFailReason("");
    try {
      const r = await fetch("/api/payment/initiate", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ merchantSlug, country, amount, payerPhone:payerPhone.trim(), payerName:payerName.trim(), paymentMethod:method, redirectUrl:redirectUrl||null, firstName:"Client", lastName:"RobotPay", operator: method.toLowerCase().includes("wave") ? "wave" : undefined, otp: needsOtp ? otpCode.trim() : undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setPaymentId(d.paymentId); setOmniRef(d.omnipayReference); setOmniFees(d.fees || 0); setShowOtpModal(false);
      if (d.sendavapay && d.otpRequired) { setSndOtpRequired(true); setSndUssdCode(d.ussdCode||null); setSndConfirmed(false); setSndOtp(""); setStep(2); }
      else if (d.paymentUrl) { setPaymentUrl(d.paymentUrl); setStep(2); }
      else { setStep(2); startPolling(d.paymentId); }
    } catch { toast({ title:"Paiement non abouti", description:"Vérifiez vos informations et réessayez.", variant:"destructive" }); }
    finally { setIsSubmitting(false); }
  };

  const confirmSndOtp = async () => {
    if (!paymentId || !sndOtp.trim()) return;
    setSndConfirming(true);
    try {
      const r = await fetch("/api/payment/sendavapay/confirm-otp", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ paymentId, otp:sndOtp.trim() }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setSndConfirmed(true); startPolling(paymentId);
    } catch (e: any) { toast({ title:"Code OTP invalide", description:e.message, variant:"destructive" }); }
    finally { setSndConfirming(false); }
  };

  const retry = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setOmniPolling(false); setFailed(false); setFailReason(""); setPaymentUrl(null);
    setSndOtpRequired(false); setSndOtp(""); setSndConfirmed(false); setStep(1);
  };

  /* ── loading / error ────────────────────────────────────────────────── */
  if (isLoading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#fff" }}>
      <Loader2 style={{ width:36, height:36, color:"#2563eb", animation:"spin 1s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  if ((loadError || !merchantInfo) && step !== 3) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#fff", padding:16 }}>
      <div style={{ textAlign:"center", maxWidth:320 }}>
        <div style={{ width:56, height:56, borderRadius:"50%", background:"#fee2e2", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
          <X style={{ width:26, height:26, color:"#dc2626" }} />
        </div>
        <p style={{ fontWeight:700, color:"#111", fontSize:16, marginBottom:6 }}>Lien invalide</p>
        <p style={{ color:"#6b7280", fontSize:14 }}>{loadError || "Ce lien de paiement n'est pas valide."}</p>
      </div>
    </div>
  );

  /* ══════════════════════════ RENDER ═════════════════════════════════════ */
  return (
    <>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pop{0%{transform:scale(.5);opacity:0}60%{transform:scale(1.1)}80%{transform:scale(.95)}100%{transform:scale(1);opacity:1}}
        @keyframes draw{0%{stroke-dashoffset:100}100%{stroke-dashoffset:0}}
        @keyframes pulse{0%,100%{transform:scale(.95);opacity:1}50%{transform:scale(1.05);opacity:.7}}
        @keyframes shake{0%,100%{transform:translateX(0)}15%{transform:translateX(-7px)}30%{transform:translateX(7px)}45%{transform:translateX(-5px)}60%{transform:translateX(5px)}75%{transform:translateX(-3px)}90%{transform:translateX(3px)}}
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        .anim-pop{animation:pop .45s cubic-bezier(.175,.885,.32,1.275) forwards}
        .anim-draw{stroke-dasharray:100;stroke-dashoffset:100;animation:draw .4s ease-out .35s forwards}
        .anim-pulse{animation:pulse 2s ease-in-out infinite}
        .anim-shake{animation:shake .5s ease-in-out .1s both}
        .op{
          width:68px;height:68px;border-radius:50%;cursor:pointer;overflow:hidden;flex-shrink:0;
          transition:transform .12s,box-shadow .14s;
          box-shadow:0 0 0 3px transparent;
          outline:none;
        }
        .op:active{transform:scale(.91)}
        .op.sel{box-shadow:0 0 0 3.5px #2563eb}
        .inp{
          width:100%;padding:12px 14px;font-size:15px;
          border:1.5px solid #d1d5db;border-radius:12px;
          outline:none;background:#fff;color:#111;
          transition:border-color .15s,box-shadow .15s;
        }
        .inp:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.13)}
        .inp::placeholder{color:#b0b8c8}
        .sel-wrap{position:relative}
        .csel{
          width:100%;padding:12px 40px 12px 42px;font-size:15px;
          border:1.5px solid #c4d4f0;border-radius:12px;
          outline:none;background:#fff;color:#111;cursor:pointer;
          appearance:none;-webkit-appearance:none;
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%232563eb' stroke-width='2.2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat:no-repeat;background-position:right 12px center;
          transition:border-color .15s;
        }
        .csel:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12)}
        .paybtn{
          width:100%;padding:16px;font-size:18px;font-weight:900;
          border:none;border-radius:14px;cursor:pointer;
          display:flex;align-items:center;justify-content:center;gap:8px;
          letter-spacing:.01em;transition:opacity .15s,transform .1s;
        }
        .paybtn:active:not(:disabled){transform:scale(.975)}
        .paybtn:disabled{opacity:.45;cursor:not-allowed}
        .ghost{
          padding:10px 18px;font-size:13px;font-weight:500;
          border:1.5px solid #e5e7eb;border-radius:10px;
          background:transparent;color:#6b7280;cursor:pointer;
          display:inline-flex;align-items:center;gap:5px;
          transition:background .15s;
        }
        .ghost:hover{background:#f3f4f6}
        .overlay{
          position:fixed;inset:0;background:rgba(0,0,0,.52);
          display:flex;align-items:center;justify-content:center;
          z-index:9999;padding:16px;
        }
        .modal{
          background:#fff;border-radius:24px;padding:26px;
          width:100%;max-width:360px;
          box-shadow:0 28px 70px rgba(0,0,0,.25);
        }
      `}</style>

      <div style={{ minHeight:"100vh", background:"#fff", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"20px 0" }}>

        {/* ── top header (outside card) ─────────────────────────────── */}
        <div style={{ width:"100%", maxWidth:400, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 20px 14px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:"#e8f0fe", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <CreditCard style={{ width:22, height:22, color:"#2563eb" }} />
            </div>
            <div>
              <p style={{ fontWeight:600, fontSize:16, color:"#111827", lineHeight:1.2 }} data-testid="text-title">Effectuer un paiement</p>
              {merchantInfo && <p style={{ fontSize:12, color:"#9ca3af", marginTop:1 }}>{merchantInfo.name}</p>}
            </div>
          </div>
          <button onClick={() => window.history.back()} data-testid="button-close"
            style={{ background:"none", border:"none", cursor:"pointer", padding:4, color:"#374151", fontSize:18, fontWeight:700, lineHeight:1 }}>
            ✕
          </button>
        </div>

        {/* ── white card ───────────────────────────────────────────── */}
        <div style={{ width:"100%", maxWidth:400, background:"#fff", borderRadius:24, boxShadow:"0 2px 24px rgba(0,0,0,.09), 0 1px 4px rgba(0,0,0,.05)", overflow:"hidden" }}>
          <div style={{ padding:"22px 20px 24px", display:"flex", flexDirection:"column", gap:18 }}>

            {/* ══ STEP 1 ══════════════════════════════════════════════ */}
            {step === 1 && (<>

              {/* Country */}
              {merchantInfo && merchantInfo.countries.length > 1 && (
                <div>
                  <p style={{ fontSize:13, fontWeight:600, color:"#374151", marginBottom:8 }}>Sélectionner un pays</p>
                  <div className="sel-wrap">
                    <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:19, pointerEvents:"none", zIndex:1 }}>
                      {COUNTRY_FLAGS[country] || "🌍"}
                    </span>
                    <select value={country} onChange={e => { setCountry(e.target.value); setMethod(""); }}
                      className="csel" data-testid="select-country">
                      {merchantInfo.countries.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Amount */}
              {amount > 0 && (
                <div style={{ background:"#f1f5f9", borderRadius:14, padding:"14px 16px", textAlign:"center" }}>
                  <p style={{ fontSize:14, fontWeight:700, color:"#374151", marginBottom:4 }}>Montant à payer</p>
                  <p style={{ fontSize:30, fontWeight:900, color:"#2563eb", letterSpacing:"-0.5px" }} data-testid="text-amount">
                    {currency} {fmt(amount)}
                  </p>
                </div>
              )}

              {/* Operator circles */}
              <div>
                <p style={{ fontSize:13, fontWeight:500, color:"#6b7280", marginBottom:10 }}>Choisissez une méthode de payement</p>

                {methods.length === 0 && !cryptoOn ? (
                  <p style={{ textAlign:"center", color:"#9ca3af", fontSize:13, padding:"14px", border:"1.5px dashed #e5e7eb", borderRadius:12 }}>Aucune méthode disponible.</p>
                ) : (
                  <div style={{ border:"2.5px solid #111", borderRadius:18, padding:"12px 10px", display:"flex", alignItems:"center", justifyContent:"space-evenly", gap:8 }}
                    role="radiogroup">

                    {methods.map(m => {
                      const img  = OPERATOR_IMAGES[m];
                      const meta = OPERATOR_META[m] || { bg:"#6b7280", abbr:m.substring(0,2).toUpperCase() };
                      const sel  = method === m;
                      return (
                        <div key={m} className={`op${sel ? " sel" : ""}`}
                          onClick={() => selectMethod(m)}
                          onTouchEnd={e => { e.preventDefault(); selectMethod(m); }}
                          role="radio" aria-checked={sel} tabIndex={0}
                          onKeyDown={e => { if (e.key===" "||e.key==="Enter") { e.preventDefault(); selectMethod(m); } }}
                          data-testid={`radio-${m.replace(/\s+/g,"-").toLowerCase()}`}
                          title={m}>
                          {img
                            ? <img src={img} alt={m} style={{ width:"100%", height:"100%", objectFit:"cover", borderRadius:"50%", display:"block" }} />
                            : <div style={{ width:"100%", height:"100%", borderRadius:"50%", background:meta.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, color:"#fff", letterSpacing:"0.03em" }}>{meta.abbr}</div>
                          }
                        </div>
                      );
                    })}

                    {cryptoOn && (
                      <div className={`op${isCrypto ? " sel" : ""}`}
                        onClick={() => selectMethod("crypto")}
                        onTouchEnd={e => { e.preventDefault(); selectMethod("crypto"); }}
                        role="radio" aria-checked={isCrypto} tabIndex={0}
                        onKeyDown={e => { if (e.key===" "||e.key==="Enter") { e.preventDefault(); selectMethod("crypto"); } }}
                        data-testid="radio-crypto" title="Crypto"
                        style={{ background:"#f59e0b", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <Bitcoin style={{ width:32, height:32, color:"#fff" }} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Phone input */}
              {!isCrypto && (
                <div>
                  <p style={{ fontSize:13, fontWeight:600, color:"#374151", marginBottom:8 }}>Numéro de téléphone</p>
                  <div style={{ display:"flex", alignItems:"stretch", border:"1.5px solid #d1d5db", borderRadius:12, overflow:"hidden", background:"#fff" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, padding:"0 12px", background:"#f8fafc", borderRight:"1.5px solid #e5e7eb", flexShrink:0 }}>
                      <Smartphone style={{ width:15, height:15, color:"#94a3b8" }} />
                      <span style={{ fontSize:14, fontWeight:700, color:"#374151" }}>{dialCode}</span>
                    </div>
                    <input type="tel" value={payerPhone} onChange={e => setPayerPhone(e.target.value)}
                      placeholder="XX XXX XX XXX" data-testid="input-phone"
                      style={{ flex:1, padding:"12px 14px", fontSize:15, border:"none", outline:"none", background:"transparent", color:"#111" }} />
                  </div>
                </div>
              )}

              {/* Crypto note */}
              {isCrypto && (
                <div style={{ background:"#fffbeb", border:"1.5px solid #fde68a", borderRadius:12, padding:"10px 14px" }}>
                  <p style={{ fontSize:12, color:"#92400e" }}>Vous serez redirigé vers une page sécurisée avec QR code.</p>
                </div>
              )}

              {/* Mali Orange instruction */}
              {maliOrange && (
                <div style={{ background:"#fff7ed", border:"1.5px solid #fed7aa", borderRadius:12, padding:"10px 14px" }}>
                  <p style={{ fontSize:12, fontWeight:600, color:"#c2410c", marginBottom:3 }}>Orange Money — Validation requise</p>
                  <p style={{ fontSize:12, color:"#92400e" }}>Composez <strong>#144#</strong> → Paiement marchand (option 2) pour valider.</p>
                </div>
              )}

              {/* Pay button */}
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                <button type="button" onClick={handlePay}
                  disabled={isSubmitting || cryptoLoading || !method || (!isCrypto && !payerPhone.trim())}
                  className="paybtn" data-testid="button-pay"
                  style={{ background:"#f5c100", color:"#111" }}>
                  {(isSubmitting || cryptoLoading) && <Loader2 style={{ width:18, height:18, animation:"spin 1s linear infinite" }} />}
                  {isCrypto ? "Payer en crypto" : "Payez avec RobotPay"}
                </button>
                <p style={{ textAlign:"center", fontSize:12, color:"#9ca3af" }}>使用 RobotPay 安全等待</p>
              </div>

            </>)}

            {/* ══ STEP 2 ══════════════════════════════════════════════ */}
            {step === 2 && (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }} data-testid="step2">

                {failed ? (
                  <div style={{ display:"flex", flexDirection:"column", gap:16, textAlign:"center" }}>
                    <div className="anim-shake" style={{ display:"inline-block" }}>
                      <div style={{ width:80, height:80, borderRadius:"50%", background:"#fee2e2", border:"4px solid #fca5a5", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto" }}>
                        <X style={{ width:36, height:36, color:"#dc2626" }} />
                      </div>
                    </div>
                    <p style={{ fontWeight:700, color:"#991b1b", fontSize:16 }}>Paiement échoué</p>
                    <p style={{ color:"#6b7280", fontSize:13 }}>{failReason}</p>
                    <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:12, padding:"12px 14px", textAlign:"left" }}>
                      {["Vérifiez que votre solde est suffisant","Assurez-vous que votre code secret est correct","Vérifiez que le numéro est correct"].map(t =>
                        <p key={t} style={{ fontSize:12, color:"#7f1d1d" }}>• {t}</p>)}
                    </div>
                    <button type="button" onClick={retry} className="paybtn" style={{ background:"#f5c100", color:"#111" }}>
                      <RefreshCw style={{ width:16, height:16 }} /> Réessayer
                    </button>
                  </div>

                ) : sndOtpRequired && !sndConfirmed ? (<>
                  <div style={{ background:"#fff7ed", borderRadius:12, padding:12, textAlign:"center", fontSize:14, fontWeight:500, color:"#92400e" }}>
                    Validation Orange Money — Code OTP requis
                  </div>
                  {sndUssdCode && (
                    <div style={{ background:"#fff7ed", border:"1.5px solid #fed7aa", borderRadius:12, padding:"10px 14px" }}>
                      <p style={{ fontSize:12, fontWeight:600, color:"#c2410c", marginBottom:4 }}>Composez sur votre téléphone</p>
                      <p style={{ fontSize:14, fontFamily:"monospace", fontWeight:700, color:"#c2410c" }}>{sndUssdCode}</p>
                    </div>
                  )}
                  <input type="text" inputMode="numeric" maxLength={8} value={sndOtp}
                    onChange={e => setSndOtp(e.target.value.replace(/\D/g,""))}
                    placeholder="Code OTP reçu par SMS" className="inp" data-testid="input-snd-otp" />
                  <button type="button" onClick={confirmSndOtp} disabled={sndConfirming || !sndOtp.trim()}
                    className="paybtn" style={{ background:"#f5c100", color:"#111" }}>
                    {sndConfirming && <Loader2 style={{ width:16, height:16, animation:"spin 1s linear infinite" }} />}
                    Confirmer le paiement
                  </button>
                  <button type="button" onClick={retry} className="ghost">← Retour</button>

                </>) : sndOtpRequired && sndConfirmed ? (
                  <div style={{ textAlign:"center", padding:"24px 0" }}>
                    <Loader2 style={{ width:36, height:36, color:"#2563eb", animation:"spin 1s linear infinite", margin:"0 auto" }} />
                    <p style={{ fontSize:13, color:"#6b7280", marginTop:12 }}>Vérification en cours...</p>
                  </div>

                ) : paymentUrl ? (<>
                  <div style={{ background:"#dbeafe", borderRadius:12, padding:12, textAlign:"center", fontSize:14, fontWeight:500, color:"#1e40af" }}>
                    Cliquez ci-dessous pour valider votre paiement de {fmt(amount)} {currency}
                  </div>
                  {omniFees > 0 && <p style={{ textAlign:"center", fontSize:12, color:"#6b7280" }}>Frais : {fmt(omniFees)} {currency}</p>}
                  <button type="button" onClick={() => { if (paymentUrl) { window.open(paymentUrl,"_blank"); if (paymentId) startPolling(paymentId); } }}
                    className="paybtn" style={{ background:"#f5c100", color:"#111" }}>
                    <ExternalLink style={{ width:16, height:16 }} /> Valider le paiement
                  </button>
                  {omniPolling && (
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, color:"#6b7280" }}>
                      <Loader2 style={{ width:15, height:15, animation:"spin 1s linear infinite" }} />
                      <span style={{ fontSize:13 }}>En attente de confirmation...</span>
                    </div>
                  )}
                  <button type="button" onClick={retry} className="ghost">← Retour</button>

                </>) : (<>
                  <div style={{ textAlign:"center", padding:"14px 0" }}>
                    <div className="anim-pulse" style={{ display:"inline-block" }}>
                      <div style={{ width:80, height:80, borderRadius:"50%", background:"#eff6ff", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto" }}>
                        <Smartphone style={{ width:38, height:38, color:"#2563eb" }} />
                      </div>
                    </div>
                    <p style={{ fontWeight:700, fontSize:15, color:"#111", marginTop:14 }}>Validez sur votre téléphone</p>
                    <p style={{ fontSize:13, color:"#6b7280", marginTop:6 }}>
                      Demande de <strong style={{ color:"#1d4ed8" }}>{fmt(amount)} {currency}</strong> envoyée sur votre appareil.
                    </p>
                    {omniFees > 0 && <p style={{ fontSize:12, color:"#9ca3af", marginTop:4 }}>Frais : {fmt(omniFees)} {currency}</p>}
                  </div>
                  {maliOrange && (
                    <div style={{ background:"#fff7ed", border:"1.5px solid #fed7aa", borderRadius:12, padding:"10px 14px" }}>
                      <p style={{ fontSize:12, fontWeight:600, color:"#c2410c", marginBottom:3 }}>Orange Money — Comment valider ?</p>
                      <p style={{ fontSize:12, color:"#92400e" }}>Composez <strong>#144#</strong> → Paiement marchand.</p>
                    </div>
                  )}
                  {omniPolling && (
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, color:"#6b7280" }}>
                      <Loader2 style={{ width:14, height:14, animation:"spin 1s linear infinite" }} />
                      <span style={{ fontSize:12 }}>Vérification en cours...</span>
                    </div>
                  )}
                  <button type="button" onClick={retry} className="ghost">← Retour</button>
                </>)}

              </div>
            )}

            {/* ══ STEP 3 ══════════════════════════════════════════════ */}
            {step === 3 && (
              <div style={{ display:"flex", flexDirection:"column", gap:16, paddingTop:8 }} data-testid="step3">
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
                  <div className="anim-pop">
                    <div style={{ width:96, height:96, borderRadius:"50%", background:"radial-gradient(circle,#dcfce7 60%,#bbf7d0 100%)", border:"5px solid #86efac", boxShadow:"0 0 0 8px #dcfce7", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                        <path className="anim-draw" d="M10 25 L20 35 L38 14" stroke="#00b050" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                  <p style={{ fontSize:11, fontWeight:700, color:"#00b050", textTransform:"uppercase", letterSpacing:".12em", marginTop:12 }}>Paiement approuvé</p>
                </div>

                <div style={{ borderRadius:14, padding:"18px 20px", textAlign:"center", background:"linear-gradient(135deg,#1d4ed8 0%,#3b82f6 100%)" }}>
                  <p style={{ color:"rgba(255,255,255,.65)", fontSize:11, textTransform:"uppercase", letterSpacing:".08em", marginBottom:4 }}>Montant débité</p>
                  <p style={{ color:"#fff", fontWeight:800, fontSize:38, letterSpacing:"-1px" }}>
                    {fmt(amount)}<span style={{ fontSize:20, fontWeight:500, opacity:.75, marginLeft:8 }}>{currency}</span>
                  </p>
                  {merchantInfo && <p style={{ color:"rgba(255,255,255,.55)", fontSize:12, marginTop:6 }}>{merchantInfo.name}</p>}
                </div>

                <div style={{ border:"1.5px solid #e5e7eb", borderRadius:14, overflow:"hidden" }}>
                  {omniRef && (
                    <div style={{ display:"flex", justifyContent:"space-between", padding:"11px 16px", borderBottom:"1px solid #f3f4f6" }}>
                      <span style={{ fontSize:12, color:"#6b7280" }}>Référence</span>
                      <span style={{ fontSize:12, fontFamily:"monospace", fontWeight:600, color:"#111" }}>{omniRef}</span>
                    </div>
                  )}
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"11px 16px", borderBottom:"1px solid #f3f4f6" }}>
                    <span style={{ fontSize:12, color:"#6b7280" }}>Statut</span>
                    <span style={{ fontSize:12, fontWeight:600, background:"#dcfce7", color:"#166534", padding:"2px 10px", borderRadius:99 }}>Confirmé</span>
                  </div>
                  {confirmedAt && (<>
                    <div style={{ display:"flex", justifyContent:"space-between", padding:"11px 16px", borderBottom:"1px solid #f3f4f6" }}>
                      <span style={{ fontSize:12, color:"#6b7280" }}>Date</span>
                      <span style={{ fontSize:12, color:"#374151" }}>{fmtD(confirmedAt)}</span>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", padding:"11px 16px" }}>
                      <span style={{ fontSize:12, color:"#6b7280", display:"flex", alignItems:"center", gap:4 }}>
                        <Clock style={{ width:12, height:12 }} /> Heure
                      </span>
                      <span style={{ fontSize:12, fontWeight:600, color:"#374151" }}>{fmtT(confirmedAt)}</span>
                    </div>
                  </>)}
                </div>

                {redirectUrl ? (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    <p style={{ textAlign:"center", fontSize:12, color:"#9ca3af" }}>Redirection dans <strong style={{ color:"#374151" }}>{countdown}s</strong>...</p>
                    <a href={(() => { try { const u = new URL(/^https?:\/\//i.test(redirectUrl) ? redirectUrl : `https://${redirectUrl}`); u.searchParams.set("status","success"); u.searchParams.set("amount",String(amount)); u.searchParams.set("ref",omniRef||""); return u.toString(); } catch { return "#"; } })()}
                      className="paybtn" style={{ textDecoration:"none", background:"#f5c100", color:"#111" }} data-testid="link-redirect">
                      Retourner sur le site
                    </a>
                  </div>
                ) : (
                  <p style={{ textAlign:"center", fontSize:13, color:"#9ca3af" }}>Vous pouvez fermer cette page.</p>
                )}
              </div>
            )}

          </div>
        </div>

        {/* ── footer (outside card) ─────────────────────────────────── */}
        <div style={{ marginTop:22, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {/* shield SVG matching mockup */}
            <svg width="38" height="44" viewBox="0 0 38 44" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 2L3 9.5v11c0 10.2 6.9 19.7 16 22 9.1-2.3 16-11.8 16-22v-11L19 2z" fill="#fff" stroke="#111" strokeWidth="2"/>
              <path d="M11 22l5.5 5.5 10-10" stroke="#111" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div>
              <p style={{ fontSize:11, color:"#94a3b8", margin:0, lineHeight:1.3 }}>Hosted &amp; secured by</p>
              <img src={robotpayLogo} alt="RobotPay" style={{ height:22, objectFit:"contain", display:"block", marginTop:2, filter:"brightness(0.3) saturate(0)" }} />
            </div>
          </div>
        </div>

      </div>

      {/* ════════════ OTP MODAL ════════════════════════════════════════ */}
      {showOtpModal && (
        <div className="overlay" onClick={e => { if (e.target===e.currentTarget) setShowOtpModal(false); }}>
          <div className="modal">
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20 }}>
              <div>
                <p style={{ fontWeight:700, fontSize:17, color:"#111" }}>Code OTP requis</p>
                <p style={{ fontSize:13, color:"#6b7280", marginTop:2 }}>Orange Money</p>
              </div>
              <button onClick={() => setShowOtpModal(false)}
                style={{ width:32, height:32, borderRadius:"50%", border:"1.5px solid #e5e7eb", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <X style={{ width:15, height:15, color:"#6b7280" }} />
              </button>
            </div>

            <div style={{ background:"#fff7ed", border:"1.5px solid #fed7aa", borderRadius:14, padding:"14px 16px", marginBottom:18 }}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                <div style={{ width:42, height:42, borderRadius:10, background:"#FF6600", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <Smartphone style={{ width:20, height:20, color:"#fff" }} />
                </div>
                <div>
                  <p style={{ fontWeight:600, fontSize:13, color:"#c2410c", marginBottom:6 }}>Composez sur votre téléphone</p>
                  <p style={{ fontFamily:"monospace", fontWeight:800, fontSize:16, background:"#fff", color:"#c2410c", padding:"3px 10px", borderRadius:7, border:"1px solid #fed7aa", display:"inline-block" }}>
                    {otpUssd}
                  </p>
                  <p style={{ fontSize:12, color:"#92400e", marginTop:6 }}>pour générer le code OTP et mettez-le ici.</p>
                </div>
              </div>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#374151" }}>Votre code OTP</label>
              <input type="text" inputMode="numeric" maxLength={8} value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g,""))}
                placeholder="Code reçu par téléphone" autoFocus data-testid="input-otp"
                className="inp"
                style={{ textAlign:"center", fontSize:22, fontWeight:700, letterSpacing:"0.22em" }} />
              <button type="button" className="paybtn" data-testid="button-otp-confirm"
                disabled={isSubmitting || !otpCode.trim()}
                style={{ background:"#f5c100", color:"#111" }}
                onClick={() => { if (!otpCode.trim()) { toast({ title:"Code OTP requis", variant:"destructive" }); return; } doInitiate(); }}>
                {isSubmitting && <Loader2 style={{ width:16, height:16, animation:"spin 1s linear infinite" }} />}
                Confirmer et payer
              </button>
              <button type="button" className="ghost" onClick={() => setShowOtpModal(false)} style={{ justifyContent:"center", width:"100%" }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
