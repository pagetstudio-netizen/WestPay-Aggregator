import { useState, useEffect, useCallback, useRef } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Smartphone, ExternalLink, Bitcoin, X, RefreshCw, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage, detectLangFromCountry } from "@/lib/language";
import LanguageSwitcher from "@/components/LanguageSwitcher";

import waveIcon      from "@assets/zOMoVcU_1779635321598.png";
import moovIcon      from "@assets/ZJCa7PK_1779635321640.jpg";
import mtnIcon       from "@assets/XzQ5b64_1779635321616.png";
import tmoneyIcon    from "@assets/ruU3bQe_1779635321485.png";
import orangeIcon    from "@assets/ctVnv9i_1779636596458.png";
import robotpayLogo  from "@assets/20260524_144646_1779637077787.png";
import bankCardIcon  from "@assets/mine-mod-bankcard-CLOhqwHj_1779636875827.png";
import phoneHandIcon from "@assets/file_00000000d2f47246aaf6fa11ae0a4003_1779726190358.png";
import mixxIcon      from "@assets/mixxByYas-web-page_1763835083140-t9C-E95C_1780044772406.png";
import mpesaIcon     from "@assets/M-pesa-logo_1780044772360.png";

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

const OPERATOR_IMAGES: Record<string, string> = {
  "Wave":             waveIcon,
  "Moov Money":       moovIcon,
  "MTN Mobile Money": mtnIcon,
  "TMoney":           tmoneyIcon,
  "Orange Money":     orangeIcon,
  "Mixx by Yas":      mixxIcon,
  "M-Pesa":           mpesaIcon,
};

const OPERATOR_META: Record<string, { bg: string; abbr: string }> = {
  "Orange Money":   { bg: "#FF6600", abbr: "OM" },
  "Airtel Money":   { bg: "#E8001D", abbr: "AT" },
  "M-Pesa":         { bg: "#60BB44", abbr: "MP" },
  "Coris Money":    { bg: "#7C2020", abbr: "CM" },
  "Mixx by Yas":    { bg: "#7C3AED", abbr: "MX" },
  "Africell":       { bg: "#0066B3", abbr: "AF" },
  "Africell Money": { bg: "#0066B3", abbr: "AF" },
  "Celtiis":        { bg: "#E05A00", abbr: "CT" },
};

function currencyForCountry(c: string) {
  if (["Cameroun", "Congo Brazzaville", "Gabon"].includes(c)) return "XAF";
  if (c === "Congo RDC") return "CDF";
  if (c === "Guinee") return "GNF";
  if (c === "Gambie") return "GMD";
  return "XOF";
}

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

const SNDV_DISPLAY_TO_BRAND: Record<string, string> = {
  "tmoney": "tmoney", "moov money": "moov", "moov": "moov",
  "mtn mobile money": "mtn", "mtn money": "mtn", "mtn": "mtn",
  "orange money": "orange", "orange": "orange",
  "wave": "wave",
  "mixx by yas": "mixx", "mixx": "mixx",
  "free money": "free", "free": "free",
  "coris money": "coris", "coris": "coris",
  "airtel money": "airtel", "airtel": "airtel",
  "m-pesa": "mpesa", "mpesa": "mpesa",
  "vodacom": "vodacom",
  "africell money": "africell", "africell": "africell",
  "celtiis": "celtiis",
};

const resolveOperatorId = (ops: any[], methodName: string): string | null => {
  const norm = (s: string) => s.toLowerCase().replace(/[\s\-_]+/g, "");
  const low = methodName.toLowerCase().trim();
  const normLow = norm(low);
  const exactNorm = ops.find((o: any) => norm(o.name) === normLow);
  if (exactNorm) return exactNorm.id;
  const contained = ops.find((o: any) => { const on = norm(o.name); return normLow.includes(on) || on.includes(normLow); });
  if (contained) return contained.id;
  const brand = SNDV_DISPLAY_TO_BRAND[low];
  if (brand) {
    const branded = ops.find((o: any) => norm(o.name).includes(brand) || norm(o.id).includes(brand));
    if (branded) return branded.id;
  }
  const BRAND_KEYWORDS = ["mtn","orange","moov","wave","mixx","airtel","vodacom","mpesa","tmoney","coris","free","africell","celtiis"];
  for (const kw of BRAND_KEYWORDS) {
    if (normLow.includes(kw)) {
      const found = ops.find((o: any) => norm(o.name).includes(kw) || norm(o.id).includes(kw));
      if (found) return found.id;
    }
  }
  return ops[0]?.id ?? null;
};

export default function PaymentLinkPage() {
  const [, params] = useRoute("/link/:uniqueId");
  const uniqueId = params?.uniqueId || "";
  const { toast } = useToast();
  const { t, lang, setLang, setDefaultLang } = useLanguage();

  const [step, setStep]               = useState(1);
  const [country, setCountry]         = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [method, setMethod]           = useState("");
  const [otpCode, setOtpCode]         = useState("");
  const [payerPhone, setPayerPhone]   = useState("");
  const [paymentId, setPaymentId]     = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentUrl, setPaymentUrl]   = useState<string | null>(null);
  const [omniRef, setOmniRef]         = useState<string | null>(null);
  const [omniPolling, setOmniPolling] = useState(false);
  const [countdown, setCountdown]     = useState(5);
  const [failed, setFailed]           = useState(false);
  const [failReason, setFailReason]   = useState("");
  const [confirmedAt, setConfirmedAt] = useState<Date | null>(null);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [dynMethods, setDynMethods]   = useState<{ name: string; logo: string | null }[] | null>(null);
  const [cryptoOn, setCryptoOn]       = useState(false);
  const [cryptoLoading, setCryptoLoad] = useState(false);

  const [sndOtpRequired, setSndOtpRequired]     = useState(false);
  const [sndOtpToken, setSndOtpToken]           = useState<string | null>(null);
  const [sndOtp, setSndOtp]                     = useState("");
  const [sndOtpSubmitting, setSndOtpSubmitting] = useState(false);

  const [helpName, setHelpName]         = useState("");
  const [helpWhatsapp, setHelpWhatsapp] = useState("");
  const [helpMessage, setHelpMessage]   = useState("");
  const [helpSending, setHelpSending]   = useState(false);
  const [helpSent, setHelpSent]         = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const redirectRef = useRef<string | null>(null);

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
    if (data?.countries?.length && !country) {
      setCountry(data.countries[0]);

      // Auto-detect language from country if no explicit preference exists
      const detected = detectLangFromCountry(data.countries[0]);
      setDefaultLang(detected);
    }
    if (data?.link.redirectUrl) {
      redirectRef.current = data.link.redirectUrl;
    }
  }, [data, setDefaultLang]);

  useEffect(() => {
    if (!country) return;
    fetch(`/api/public/payment-methods/${encodeURIComponent(country)}?type=link`)
      .then(r => r.json()).then(d => {
        if (!Array.isArray(d.methods)) { setDynMethods(null); return; }
        const normalized = d.methods.map((m: any) =>
          typeof m === "string" ? { name: m, logo: null } : { name: m.name, logo: m.logo || null }
        );
        setDynMethods(normalized);
      })
      .catch(() => setDynMethods(null));
    setMethod(""); setOtpCode("");
  }, [country]);

  useEffect(() => {
    if (!data?.merchantSlug) return;
    fetch(`/api/public/crypto/check-merchant/${encodeURIComponent(data.merchantSlug)}`)
      .then(r => r.ok ? r.json() : { enabled: false }).then(d => setCryptoOn(!!d.enabled)).catch(() => setCryptoOn(false));
  }, [data?.merchantSlug]);

  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  const safeRedirect = (raw: string, extra?: Record<string, string>) => {
    if (!raw || /^(javascript|data|vbscript):/i.test(raw.trim())) return;
    const norm = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const u = new URL(norm);
      if (!["https:", "http:"].includes(u.protocol)) return;
      if (extra) Object.entries(extra).forEach(([k, v]) => u.searchParams.set(k, v));
      window.location.replace(u.toString());
    } catch {}
  };

  const getLocale = () => {
    switch (lang) {
      case "fr": return "fr-FR";
      case "zh": return "zh-CN";
      case "pt": return "pt-PT";
      default: return "en-US";
    }
  };

  const fmt  = (n: number) => n.toLocaleString(getLocale());
  const fmtT = (d: Date) => d.toLocaleTimeString(getLocale(), { hour: "2-digit", minute: "2-digit" });
  const fmtD = (d: Date) => d.toLocaleDateString(getLocale(), { day: "2-digit", month: "long", year: "numeric" });

  const currency = currencyForCountry(country);
  const rawMethods = dynMethods ?? (PAYMENT_METHODS[country] || []).map((n: string) => ({ name: n, logo: null as string | null }));
  const methods = rawMethods;
  const isCrypto = method === "crypto";
  const needsOtp = method === "Orange Money" && (country === "Burkina Faso" || country === "Cote d'Ivoire");
  const otpUssd = country === "Burkina Faso" ? "*144*4*6*montant#" : "#144*82#";
  const maliOrange = method === "Orange Money" && country === "Mali";
  const dialCode = DIAL_CODES[country] || "+";

  const effectiveAmount = data?.link.amountType === "fixed"
    ? (data?.link.amount ?? 0)
    : (Number(customAmount) || 0);

  const startPolling = (pId: number) => {
    setOmniPolling(true);
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/omnipay/payment/${pId}/status`);
        const d = await r.json();
        if (d.status === "confirmed") {
          clearInterval(pollingRef.current!); setOmniPolling(false);
          setConfirmedAt(new Date()); setStep(3);
        } else if (d.status === "failed") {
          clearInterval(pollingRef.current!); setOmniPolling(false);
          setFailed(true); setFailReason(t("payFailedDesc"));
        }
      } catch {}
    }, 5000);
  };

  useEffect(() => {
    if (step !== 3) return;
    const t = setInterval(() => setCountdown(p => {
      if (p <= 1) {
        clearInterval(t);
        if (redirectRef.current) safeRedirect(redirectRef.current, { status: "success", ref: omniRef || "" });
        return 0;
      }
      return p - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [step]);

  const selectMethod = useCallback((m: string) => { setMethod(m); setOtpCode(""); }, []);

  const sndReportFailure = (pId: number, reason: string) => {
    fetch("/api/payment/report-failure", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentId: pId, errorMessage: reason }) }).catch(() => {});
  };

  const initiateSendavaPayment = async (token: string, pId: number, countryCode: string, payerPhoneE164: string) => {
    try {
      const opsRes = await fetch(`https://sendavapay.com/api/sdk/v1/operators/${countryCode}`);
      const opsData = await opsRes.json();
      const ops: any[] = opsData.data || [];
      const operatorId = resolveOperatorId(ops, method);
      if (!operatorId) throw new Error(`Opérateur indisponible: ${method}`);
      const initRes = await fetch("https://sendavapay.com/api/sdk/v1/initiate-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentToken: token, payerName: "Client", payerPhone: payerPhoneE164, payerCountry: countryCode, operatorId }),
      });
      const initData = await initRes.json();
      if (!initData.success) {
        if (initData.code === "SERVER_ERROR" || initData.code === "PAYMENT_IN_PROGRESS") { startPolling(pId); return; }
        throw new Error(initData.error || initData.message || "Erreur initialisation paiement");
      }
      if (initData.requiresRedirect && initData.redirectUrl) {
        setPaymentUrl(initData.redirectUrl); startPolling(pId);
      } else if (initData.requiresOtp) {
        setSndOtpRequired(true); setSndOtpToken(initData.otpToken || null);
      } else {
        startPolling(pId);
      }
    } catch (e: any) {
      const reason = e.message || "Erreur de connexion au service de paiement";
      setFailed(true); setFailReason(reason); sndReportFailure(pId, reason);
    }
  };

  const submitSendavaOtp = async () => {
    if (!sndOtpToken || !sndOtp.trim()) return;
    setSndOtpSubmitting(true);
    try {
      const res = await fetch("https://sendavapay.com/api/sdk/v1/submit-otp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpToken: sndOtpToken, otp: sndOtp.trim() }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.message || "Code OTP invalide");
      setSndOtpRequired(false);
      if (paymentId) startPolling(paymentId);
    } catch (e: any) {
      toast({ title: "OTP invalide", description: e.message, variant: "destructive" });
    } finally { setSndOtpSubmitting(false); }
  };

  const retry = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setOmniPolling(false); setFailed(false); setFailReason(""); setPaymentUrl(null);
    setSndOtpRequired(false); setSndOtpToken(null); setSndOtp(""); setSndOtpSubmitting(false);
    setStep(1);
  };

  const doInitiate = async () => {
    if (!data) return;
    if (isCrypto) {
      setCryptoLoad(true);
      try {
        const r = await fetch("/api/payment/crypto/initiate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merchantSlug: data.merchantSlug, amount: effectiveAmount, currency, returnUrl: data.link.redirectUrl || undefined }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.message);
        window.location.replace(`/pay/crypto/${d.trackId}`);
      } catch { toast({ title: "Paiement non disponible", variant: "destructive" }); }
      finally { setCryptoLoad(false); }
      return;
    }
    setIsSubmitting(true); setFailed(false); setFailReason("");
    try {
      const r = await fetch("/api/payment/initiate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantSlug: data.merchantSlug, country, amount: effectiveAmount,
          payerPhone: payerPhone.trim(), payerName: "Client", paymentMethod: method,
          redirectUrl: data.link.redirectUrl || null,
          firstName: "Client", lastName: "RobotPay",
          operator: method.toLowerCase().includes("wave") ? "wave" : undefined,
          otp: needsOtp ? otpCode.trim() : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setPaymentId(d.paymentId); setOmniRef(d.omnipayReference); setShowOtpModal(false);
      if (d.sendavapay && d.sendavapayToken && d.paymentToken) {
        setStep(2);
        initiateSendavaPayment(d.paymentToken, d.paymentId, d.countryCode, d.payerPhoneE164);
        return;
      }
      if (d.paymentUrl) { setPaymentUrl(d.paymentUrl); setStep(2); }
      else { setStep(2); startPolling(d.paymentId); }
    } catch (e: any) {
      toast({ title: "Paiement non abouti", description: e.message || "Vérifiez vos informations et réessayez.", variant: "destructive" });
    } finally { setIsSubmitting(false); }
  };

  const handlePay = () => {
    if (!method) { toast({ title: "Méthode requise", description: "Sélectionnez un opérateur.", variant: "destructive" }); return; }
    if (isCrypto) { doInitiate(); return; }
    if (!payerPhone.trim()) { toast({ title: "Numéro requis", description: "Entrez votre numéro.", variant: "destructive" }); return; }
    if (data?.link.amountType === "flexible" && !customAmount) { toast({ title: "Montant requis", description: "Entrez le montant.", variant: "destructive" }); return; }
    if (needsOtp && !otpCode.trim()) { setShowOtpModal(true); return; }
    doInitiate();
  };

  if (isLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
      <Loader2 style={{ width: 36, height: 36, color: "#2563eb", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error || !data) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", padding: 16 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ textAlign: "center", maxWidth: 320 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <X style={{ width: 26, height: 26, color: "#dc2626" }} />
        </div>
        <p style={{ fontWeight: 700, color: "#111", fontSize: 16, marginBottom: 6 }}>{t("payInvalidLink")}</p>
        <p style={{ color: "#6b7280", fontSize: 14 }}>{(error as Error)?.message || t("payLinkExpired")}</p>
      </div>
    </div>
  );

  const redirectUrl = data.link.redirectUrl;

  return (
    <>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pop{0%{transform:scale(.5);opacity:0}60%{transform:scale(1.1)}80%{transform:scale(.95)}100%{transform:scale(1);opacity:1}}
        @keyframes draw{0%{stroke-dashoffset:100}100%{stroke-dashoffset:0}}
        @keyframes pulse{0%,100%{transform:scale(.95);opacity:1}50%{transform:scale(1.05);opacity:.7}}
        @keyframes shake{0%,100%{transform:translateX(0)}15%{transform:translateX(-7px)}30%{transform:translateX(7px)}45%{transform:translateX(-5px)}60%{transform:translateX(5px)}75%{transform:translateX(-3px)}90%{transform:translateX(3px)}}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes fadeInOverlay{from{opacity:0}to{opacity:1}}
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        .anim-pop{animation:pop .45s cubic-bezier(.175,.885,.32,1.275) forwards}
        .anim-draw{stroke-dasharray:100;stroke-dashoffset:100;animation:draw .4s ease-out .35s forwards}
        .anim-pulse{animation:pulse 2s ease-in-out infinite}
        .anim-shake{animation:shake .5s ease-in-out .1s both}
        .op{width:68px;height:68px;border-radius:50%;cursor:pointer;overflow:hidden;flex-shrink:0;transition:transform .12s,box-shadow .14s;box-shadow:0 0 0 3px transparent;outline:none;}
        .op:active{transform:scale(.91)}
        .op.sel{box-shadow:0 0 0 3.5px #2563eb}
        .inp{width:100%;padding:12px 14px;font-size:15px;border:1.5px solid #d1d5db;border-radius:12px;outline:none;background:#fff;color:#111;transition:border-color .15s,box-shadow .15s;}
        .inp:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.13)}
        .inp::placeholder{color:#b0b8c8}
        .sel-wrap{position:relative}
        .csel{width:100%;padding:12px 40px 12px 42px;font-size:15px;border:1.5px solid #c4d4f0;border-radius:12px;outline:none;background:#fff;color:#111;cursor:pointer;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%232563eb' stroke-width='2.2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;transition:border-color .15s;}
        .csel:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12)}
        .paybtn{width:100%;padding:13px 16px;font-size:16px;font-weight:900;border:none;border-radius:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;letter-spacing:.01em;transition:opacity .15s,transform .1s;}
        .paybtn:active:not(:disabled){transform:scale(.975)}
        .paybtn:disabled{opacity:.45;cursor:not-allowed}
        .ghost{padding:10px 18px;font-size:13px;font-weight:500;border:1.5px solid #e5e7eb;border-radius:10px;background:transparent;color:#6b7280;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:background .15s;}
        .ghost:hover{background:#f3f4f6}
        .overlay{position:fixed;inset:0;background:rgba(0,0,0,.52);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;}
        .modal{background:#fff;border-radius:24px;padding:26px;width:100%;max-width:360px;box-shadow:0 28px 70px rgba(0,0,0,.25);}
      `}</style>

      <div style={{ minHeight: "100vh", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "12px 0" }}>

        {/* ── top header ── */}
        <div style={{ width: "100%", maxWidth: 400, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#e8f0fe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <img src={bankCardIcon} alt="" style={{ width: 24, height: 24, filter: "brightness(0) saturate(100%) invert(24%) sepia(95%) saturate(1200%) hue-rotate(218deg) brightness(99%) contrast(97%)" }} />
            </div>
            <div>
              <p style={{ fontWeight: 600, fontSize: 15, color: "#111827", lineHeight: 1.2 }} data-testid="text-title">{data.link.name}</p>
              <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.2 }}>{data.merchantName}</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LanguageSwitcher />
            <button onClick={() => setShowHelpModal(true)} data-testid="button-help"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
              title={t("payHelp")}>
              <img src="/help-icon.png" alt={t("payHelp")} style={{ width: 42, height: 42, objectFit: "cover", borderRadius: "50%" }} />
            </button>
          </div>
        </div>

        {/* ── white card ── */}
        <div style={{ width: "100%", maxWidth: 400, background: "#fff", borderRadius: 24, boxShadow: "0 2px 24px rgba(0,0,0,.14), 0 1px 4px rgba(0,0,0,.07)", overflow: "hidden" }}>
          <div style={{ padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

            {/* ══ STEP 1 ══ */}
            {step === 1 && (<>

              {/* Country selector */}
              {data.countries.length > 1 && (
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>{t("payCountry")}</p>
                  <div className="sel-wrap">
                    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 19, pointerEvents: "none", zIndex: 1 }}>
                      {COUNTRY_FLAGS[country] || "🌍"}
                    </span>
                    <select value={country} onChange={e => { setCountry(e.target.value); setMethod(""); }}
                      className="csel" data-testid="select-country">
                      {data.countries.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Amount */}
              {data.link.amountType === "fixed" && data.link.amount! > 0 && (
                <div style={{ background: "#f1f5f9", borderRadius: 14, padding: "14px 16px", textAlign: "center" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".05em" }}>{t("payAmountToPay")}</p>
                  <p style={{ fontSize: 38, fontWeight: 900, color: "#2563eb", letterSpacing: "-1px", lineHeight: 1.1 }} data-testid="text-amount">
                    {fmt(data.link.amount!)}<span style={{ fontSize: 18, fontWeight: 700, color: "#2563eb", marginLeft: 6, opacity: .85 }}>{currency}</span>
                  </p>
                </div>
              )}

              {data.link.amountType === "flexible" && (
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>{t("payAmount")} ({currency})</p>
                  <input type="number" value={customAmount} onChange={e => setCustomAmount(e.target.value)}
                    placeholder={t("payEnterAmount")} className="inp" data-testid="input-custom-amount" />
                  {customAmount && Number(customAmount) > 0 && (
                    <div style={{ background: "#f1f5f9", borderRadius: 14, padding: "10px 16px", textAlign: "center", marginTop: 8 }}>
                      <p style={{ fontSize: 32, fontWeight: 900, color: "#2563eb", letterSpacing: "-1px", lineHeight: 1.1 }}>
                        {fmt(Number(customAmount))}<span style={{ fontSize: 16, fontWeight: 700, color: "#2563eb", marginLeft: 6, opacity: .85 }}>{currency}</span>
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Operator circles */}
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: "#6b7280", marginBottom: 10 }}>{t("payChooseMethod")}</p>
                {methods.length === 0 && !cryptoOn ? (
                  <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: "14px", border: "1.5px dashed #e5e7eb", borderRadius: 12 }}>{t("noData")}</p>
                ) : (
                  <div style={{ border: "2.5px solid #111", borderRadius: 18, padding: "12px 10px", display: "flex", alignItems: "center", justifyContent: "space-evenly", gap: 8 }}
                    role="radiogroup">
                    {methods.map(m => {
                      const img = m.logo || OPERATOR_IMAGES[m.name];
                      const meta = OPERATOR_META[m.name] || { bg: "#6b7280", abbr: m.name.substring(0, 2).toUpperCase() };
                      const sel = method === m.name;
                      return (
                        <div key={m.name} className={`op${sel ? " sel" : ""}`}
                          onClick={() => selectMethod(m.name)}
                          onTouchEnd={e => { e.preventDefault(); selectMethod(m.name); }}
                          role="radio" aria-checked={sel} tabIndex={0}
                          onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); selectMethod(m.name); } }}
                          data-testid={`radio-${m.name.replace(/\s+/g, "-").toLowerCase()}`}
                          title={m.name}>
                          {img
                            ? <img src={img} alt={m.name} draggable={false} onContextMenu={e => e.preventDefault()} onDragStart={e => e.preventDefault()} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block", pointerEvents: "none", userSelect: "none", WebkitUserDrag: "none" } as React.CSSProperties} />
                            : <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: meta.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff" }}>{meta.abbr}</div>
                          }
                        </div>
                      );
                    })}
                    {cryptoOn && (
                      <div className={`op${isCrypto ? " sel" : ""}`}
                        onClick={() => selectMethod("crypto")}
                        onTouchEnd={e => { e.preventDefault(); selectMethod("crypto"); }}
                        role="radio" aria-checked={isCrypto} tabIndex={0}
                        onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); selectMethod("crypto"); } }}
                        data-testid="radio-crypto" title={t("payCrypto")}
                        style={{ background: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Bitcoin style={{ width: 32, height: 32, color: "#fff" }} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Phone input */}
              {!isCrypto && (
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>{t("payPhoneNumber")}</p>
                  <div style={{ display: "flex", alignItems: "stretch", border: "1.5px solid #d1d5db", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 12px", background: "#f8fafc", borderRight: "1.5px solid #e5e7eb", flexShrink: 0 }}>
                      <Smartphone style={{ width: 15, height: 15, color: "#94a3b8" }} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#374151" }}>{dialCode}</span>
                    </div>
                    <input type="tel" value={payerPhone} onChange={e => setPayerPhone(e.target.value)}
                      placeholder={t("payPhoneNumberPlaceholder")} data-testid="input-payer-phone"
                      style={{ flex: 1, padding: "12px 14px", fontSize: 15, border: "none", outline: "none", background: "transparent", color: "#111" }} />
                  </div>
                </div>
              )}

              {/* Crypto note */}
              {isCrypto && (
                <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 12, padding: "10px 14px" }}>
                  <p style={{ fontSize: 12, color: "#92400e" }}>{t("payCryptoNote") || "Vous serez redirigé vers une page sécurisée avec QR code."}</p>
                </div>
              )}

              {/* Mali Orange instruction */}
              {maliOrange && (
                <div style={{ background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 12, padding: "10px 14px" }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#c2410c", marginBottom: 3 }}>Orange Money — {t("otpTitle")}</p>
                  <p style={{ fontSize: 12, color: "#92400e" }}>Composez <strong>#144#</strong> → Paiement marchand (option 2) pour valider.</p>
                </div>
              )}

              {/* Pay button */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <button type="button" onClick={handlePay}
                  disabled={isSubmitting || cryptoLoading || !method || (!isCrypto && !payerPhone.trim()) || (data.link.amountType === "flexible" && !customAmount)}
                  className="paybtn" data-testid="button-pay"
                  style={{ background: "#f5c100", color: "#111" }}>
                  {(isSubmitting || cryptoLoading) && <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />}
                  {isCrypto ? t("payCrypto") : t("payPayNow")}
                </button>
                <p style={{ textAlign: "center", fontSize: 12, color: "#374151", fontWeight: 500 }}>{t("paySecurityRobotPay")}</p>
              </div>

            </>)}

            {/* ══ STEP 2 ══ */}
            {step === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }} data-testid="step2">

                {failed ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "center" }}>
                    <div className="anim-shake" style={{ display: "inline-block" }}>
                      <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#fee2e2", border: "4px solid #fca5a5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                        <X style={{ width: 36, height: 36, color: "#dc2626" }} />
                      </div>
                    </div>
                    <p style={{ fontWeight: 700, color: "#991b1b", fontSize: 16 }}>{t("payFailed")}</p>
                    <p style={{ color: "#6b7280", fontSize: 13 }}>{failReason}</p>
                    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 14px", textAlign: "left" }}>
                      {[t("payFailedDesc")].map(text =>
                        <p key={text} style={{ fontSize: 12, color: "#7f1d1d" }}>• {text}</p>)}
                    </div>
                    <button type="button" onClick={retry} className="paybtn" style={{ background: "#f5c100", color: "#111" }}>
                      <RefreshCw style={{ width: 16, height: 16 }} /> {t("payTryAgain")}
                    </button>
                  </div>

                ) : sndOtpRequired ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 14, padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ width: 42, height: 42, borderRadius: 10, background: "#FF6600", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Smartphone style={{ width: 20, height: 20, color: "#fff" }} />
                        </div>
                        <div>
                          <p style={{ fontWeight: 700, fontSize: 14, color: "#c2410c", marginBottom: 4 }}>{t("otpTitle")}</p>
                          <p style={{ fontSize: 12, color: "#92400e" }}>{t("otpDesc")}</p>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{t("otpCodePlaceholder")}</label>
                      <input type="text" inputMode="numeric" maxLength={8}
                        value={sndOtp} onChange={e => setSndOtp(e.target.value.replace(/\D/g, ""))}
                        placeholder="123456" data-testid="input-snd-otp"
                        style={{ padding: "12px 14px", fontSize: 22, fontWeight: 700, letterSpacing: "0.25em", textAlign: "center", border: "1.5px solid #d1d5db", borderRadius: 12, outline: "none", background: "#fff", color: "#111" }} />
                    </div>
                    <button type="button" onClick={submitSendavaOtp}
                      disabled={sndOtpSubmitting || sndOtp.trim().length < 4}
                      className="paybtn" data-testid="button-snd-otp-submit"
                      style={{ background: "#f5c100", color: "#111" }}>
                      {sndOtpSubmitting && <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />}
                      {t("payConfirmPayment")}
                    </button>
                    <button type="button" onClick={retry} className="ghost">← {t("back")}</button>
                  </div>

                ) : paymentUrl ? (<>
                  <div style={{ background: "#dbeafe", borderRadius: 12, padding: 12, textAlign: "center", fontSize: 14, fontWeight: 500, color: "#1e40af" }}>
                    {t("payProcessingRequestBy")} {fmt(effectiveAmount)} {currency}
                  </div>
                  <button type="button" onClick={() => { if (paymentUrl) { window.open(paymentUrl, "_blank"); if (paymentId) startPolling(paymentId); } }}
                    className="paybtn" style={{ background: "#f5c100", color: "#111" }}>
                    <ExternalLink style={{ width: 16, height: 16 }} /> {t("payOpenPaymentLink")}
                  </button>
                  {omniPolling && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#6b7280" }}>
                      <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} />
                      <span style={{ fontSize: 13 }}>{t("payWaitingConfirmation")}</span>
                    </div>
                  )}
                  <button type="button" onClick={retry} className="ghost">← {t("back")}</button>

                </>) : (<>
                  <div style={{ textAlign: "center", padding: "14px 0" }}>
                    <div className="anim-pulse" style={{ display: "inline-block" }}>
                      <div style={{ width: 100, height: 100, borderRadius: "50%", background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                        <img src={phoneHandIcon} alt="téléphone" style={{ width: 72, height: 72, objectFit: "contain" }} />
                      </div>
                    </div>
                    <p style={{ fontWeight: 700, fontSize: 15, color: "#111", marginTop: 14 }}>{t("payValidateOnPhone")}</p>
                    <p style={{ fontSize: 13, color: "#6b7280", marginTop: 6 }}>
                      {t("payProcessingRequestBy")} <strong style={{ color: "#1d4ed8" }}>{fmt(effectiveAmount)} {currency}</strong> {t("payDoNotClosePage")}.
                    </p>
                  </div>
                  {maliOrange && (
                    <div style={{ background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 12, padding: "10px 14px" }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "#c2410c", marginBottom: 3 }}>Orange Money — {t("payHelp")}</p>
                      <p style={{ fontSize: 12, color: "#92400e" }}>Composez <strong>#144#</strong> → Paiement marchand.</p>
                    </div>
                  )}
                  {omniPolling && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#6b7280" }}>
                      <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                      <span style={{ fontSize: 12 }}>{t("payVerificationInProgress")}</span>
                    </div>
                  )}
                  <button type="button" onClick={retry} className="ghost">← {t("back")}</button>
                </>)}

              </div>
            )}

            {/* ══ STEP 3 ══ */}
            {step === 3 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, paddingTop: 8 }} data-testid="step3">

                <div className="anim-pop" style={{ marginBottom: 16 }}>
                  <div style={{ width: 110, height: 110, borderRadius: "50%", background: "#fff", border: "5px solid #22c55e", boxShadow: "0 0 0 10px #dcfce7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
                      <circle cx="30" cy="30" r="28" fill="#22c55e" />
                      <path className="anim-draw" d="M16 31 L26 41 L44 20" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>

                <p style={{ fontWeight: 800, fontSize: 20, color: "#111", textAlign: "center", marginBottom: 4 }}>{t("paySuccess")}</p>
                <p style={{ fontSize: 13, color: "#6b7280", textAlign: "center", marginBottom: 20 }}>via <strong style={{ color: "#374151" }}>{data.merchantName}</strong></p>

                <div style={{ width: "100%", borderRadius: 16, padding: "20px 24px", textAlign: "center", background: "linear-gradient(135deg,#16a34a 0%,#22c55e 100%)", marginBottom: 16 }}>
                  <p style={{ color: "rgba(255,255,255,.75)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>{t("payAmount")}</p>
                  <p style={{ color: "#fff", fontWeight: 900, fontSize: 42, letterSpacing: "-1px", lineHeight: 1 }}>
                    {fmt(effectiveAmount)}<span style={{ fontSize: 22, fontWeight: 500, opacity: .8, marginLeft: 8 }}>{currency}</span>
                  </p>
                </div>

                <div style={{ width: "100%", border: "1.5px solid #e5e7eb", borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
                  {omniRef && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 18px", borderBottom: "1px solid #f3f4f6" }}>
                      <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>{t("payTransactionRef")}</span>
                      <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: "#111", background: "#f3f4f6", padding: "3px 10px", borderRadius: 8 }}>{omniRef}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 18px", borderBottom: confirmedAt ? "1px solid #f3f4f6" : "none" }}>
                    <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>{t("status")}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, background: "#dcfce7", color: "#166534", padding: "3px 12px", borderRadius: 99, display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                      {t("confirmed")}
                    </span>
                  </div>
                  {confirmedAt && (<>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 18px", borderBottom: "1px solid #f3f4f6" }}>
                      <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>{t("date")}</span>
                      <span style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>{fmtD(confirmedAt)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 18px" }}>
                      <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock style={{ width: 12, height: 12 }} /> {t("time") || "Heure"}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{fmtT(confirmedAt)}</span>
                    </div>
                  </>)}
                </div>

                {redirectUrl ? (
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 12, padding: "10px 18px", width: "100%" }}>
                      <Loader2 style={{ width: 15, height: 15, color: "#16a34a", animation: "spin 1s linear infinite", flexShrink: 0 }} />
                      <p style={{ fontSize: 13, color: "#166534", margin: 0 }}>
                        {t("payRedirectionIn")} <strong>{countdown}s</strong>...
                      </p>
                    </div>
                    <a href={(() => { try { const u = new URL(/^https?:\/\//i.test(redirectUrl) ? redirectUrl : `https://${redirectUrl}`); u.searchParams.set("status", "success"); u.searchParams.set("ref", omniRef || ""); return u.toString(); } catch { return "#"; } })()}
                      className="paybtn" style={{ textDecoration: "none", background: "#22c55e", color: "#fff", width: "100%", textAlign: "center" }} data-testid="link-redirect">
                      {t("payBackToMerchant")}
                    </a>
                  </div>
                ) : (
                  <p style={{ textAlign: "center", fontSize: 13, color: "#9ca3af", marginTop: 4 }}>{t("payDoNotClosePage")}</p>
                )}

              </div>
            )}

          </div>
        </div>

        {/* ── footer ── */}
        <div style={{ marginTop: 20, marginBottom: 20, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <img src={robotpayLogo} alt="RobotPay" style={{ height: 52, objectFit: "contain", display: "block" }} />
        </div>

      </div>

      {/* ── OTP Modal ── */}
      {showOtpModal && (
        <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setShowOtpModal(false); }}>
          <div className="modal">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 17, color: "#111" }}>{t("otpTitle")}</p>
                <p style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{method}</p>
              </div>
              <button onClick={() => setShowOtpModal(false)}
                style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px solid #e5e7eb", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X style={{ width: 15, height: 15, color: "#6b7280" }} />
              </button>
            </div>
            <div style={{ background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 14, padding: "14px 16px", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: "#FF6600", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Smartphone style={{ width: 20, height: 20, color: "#fff" }} />
                </div>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 13, color: "#c2410c", marginBottom: 6 }}>{t("payOrangeMoneyEnterCode")}</p>
                  <p style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 16, background: "#fff", color: "#c2410c", padding: "3px 10px", borderRadius: 7, border: "1px solid #fed7aa", display: "inline-block" }}>
                    {otpUssd}
                  </p>
                  <p style={{ fontSize: 12, color: "#92400e", marginTop: 6 }}>{country === "Burkina Faso" ? t("payOrangeMoneyBurkinaDesc") : t("payOrangeMoneyCoteDesc")}</p>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{t("otpCodePlaceholder")}</label>
              <input type="text" inputMode="numeric" maxLength={8} value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, ""))}
                placeholder={t("otpEnterCode")} autoFocus data-testid="input-otp"
                className="inp"
                style={{ textAlign: "center", fontSize: 22, fontWeight: 700, letterSpacing: "0.22em" }} />
              <button type="button" className="paybtn" data-testid="button-otp-confirm"
                disabled={isSubmitting || !otpCode.trim()}
                style={{ background: "#f5c100", color: "#111" }}
                onClick={() => { if (!otpCode.trim()) { toast({ title: t("otpCodeRequired"), variant: "destructive" }); return; } doInitiate(); }}>
                {isSubmitting && <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />}
                {t("payConfirmPayment")}
              </button>
              <button type="button" className="ghost" onClick={() => setShowOtpModal(false)} style={{ justifyContent: "center", width: "100%" }}>
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Help bottom sheet ── */}
      {showHelpModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) { setShowHelpModal(false); setHelpSent(false); setHelpName(""); setHelpWhatsapp(""); setHelpMessage(""); } }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeInOverlay .2s ease" }}>
          <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", width: "100%", maxHeight: "92vh", display: "flex", flexDirection: "column", animation: "slideUp .3s cubic-bezier(.32,.72,0,1)", boxShadow: "0 -4px 32px rgba(0,0,0,.18)" }}>
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: "#e5e7eb" }} />
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: "12px 20px 0" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
                <div>
                  <p style={{ fontWeight: 800, fontSize: 19, color: "#111", margin: 0 }}>{t("payHelp")}</p>
                  <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{t("payAnyQuestion")}</p>
                </div>
                <button onClick={() => { setShowHelpModal(false); setHelpSent(false); setHelpName(""); setHelpWhatsapp(""); setHelpMessage(""); }}
                  style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px solid #e5e7eb", background: "#f9fafb", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <X style={{ width: 15, height: 15, color: "#6b7280" }} />
                </button>
              </div>
              {helpSent ? (
                <div style={{ textAlign: "center", padding: "32px 0 24px" }}>
                  <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#e8f5e9", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                  <p style={{ fontWeight: 700, fontSize: 17, color: "#111", marginBottom: 8 }}>{t("payMessageSent")}</p>
                  <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>{t("payMessageSent")}</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 8 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 7 }}>{t("payYourName")} <span style={{ color: "#ef4444" }}>*</span></label>
                    <input type="text" value={helpName} onChange={e => setHelpName(e.target.value)} placeholder={t("payYourName")} className="inp" style={{ fontSize: 15 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 7 }}>{t("payYourWhatsApp")} <span style={{ fontWeight: 400, color: "#9ca3af" }}>({t("optional")})</span></label>
                    <input type="tel" value={helpWhatsapp} onChange={e => setHelpWhatsapp(e.target.value)} placeholder="+229 00 00 00 00" className="inp" style={{ fontSize: 15 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 7 }}>Message <span style={{ color: "#ef4444" }}>*</span></label>
                    <textarea value={helpMessage} onChange={e => setHelpMessage(e.target.value)} placeholder={t("payDescribeProblem")} rows={4} className="inp" style={{ fontSize: 15, resize: "none", fontFamily: "inherit" }} />
                  </div>
                </div>
              )}
            </div>
            <div style={{ padding: "16px 20px 28px", background: "#fff" }}>
              {helpSent ? (
                <button onClick={() => { setShowHelpModal(false); setHelpSent(false); setHelpName(""); setHelpWhatsapp(""); setHelpMessage(""); }}
                  style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", background: "#1a7f3c", cursor: "pointer", fontSize: 16, fontWeight: 700, color: "#fff" }}>
                  {t("close")}
                </button>
              ) : (
                <button type="button"
                  disabled={helpSending || !helpName.trim() || !helpMessage.trim()}
                  onClick={async () => {
                    if (!helpName.trim() || !helpMessage.trim()) return;
                    setHelpSending(true);
                    try {
                      const r = await fetch("/api/support/help", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: helpName.trim(), whatsapp: helpWhatsapp.trim(), message: helpMessage.trim(), merchantName: data.merchantName, merchantSlug: data.merchantSlug }),
                      });
                      if (r.ok) { setHelpSent(true); }
                      else { toast({ title: t("error"), description: t("payErrorGeneric"), variant: "destructive" }); }
                    } catch { toast({ title: t("error"), description: t("payErrorGeneric"), variant: "destructive" }); }
                    finally { setHelpSending(false); }
                  }}
                  style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", background: (!helpName.trim() || !helpMessage.trim()) ? "#b0c9b7" : "#1a7f3c", cursor: (!helpName.trim() || !helpMessage.trim()) ? "not-allowed" : "pointer", fontSize: 16, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "background .15s" }}>
                  {helpSending && <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />}
                  {t("paySendMessage")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
