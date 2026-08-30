import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Smartphone, ExternalLink, Bitcoin, X, RefreshCw, Clock } from "lucide-react";
import { useLanguage, detectLangFromCountry } from "@/lib/language";
import { sanitizePaymentMessage } from "@/lib/sanitize-payment-message";
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
import gcashIcon        from "@assets/images_(24)_1783366582605.png";
import paymayaIcon      from "@assets/images_(25)_1783366582572.png";
import airteltigoIcon   from "@assets/images_(24)_1784323232372.png";
import vodafoneIcon     from "@assets/vodafone-brand-logo-phone-symbol-with-name-white-design-englan_1784323232487.jpg";
import mtnGhanaIcon     from "@assets/XzQ5b64_1784323232515.png";

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
  "Philippines":        ["GCash", "Maya (PayMaya)"],
  "Pakistan":           ["EasyPaisa", "JazzCash", "NayaPay", "SadaPay"],
  "India":              [],
  "Nigeria":            ["MTN MoMo Nigeria", "Airtel Money Nigeria", "OPay", "PalmPay", "Kuda Bank"],
  "Ghana":              ["MTN Mobile Money", "AirtelTigo Money", "Vodafone Cash"],
  "Niger":              ["Airtel Money", "Moov Money", "Zamani", "Amana", "Mynita"],
  "Kenya":              ["Safaricom M-Pesa", "Airtel Money", "M-Pesa"],
};

const DIAL_CODES: Record<string, string> = {
  "Togo": "+228", "Benin": "+229", "Burkina Faso": "+226", "Cameroun": "+237",
  "Congo Brazzaville": "+242", "Congo RDC": "+243", "Gabon": "+241",
  "Cote d'Ivoire": "+225", "Mali": "+223", "Senegal": "+221",
  "Guinee": "+224", "Gambie": "+220",
  "Philippines": "+63", "Pakistan": "+92", "India": "+91", "Nigeria": "+234",
  "Ghana": "+233", "Niger": "+227", "Kenya": "+254",
};

/** Exemple de numéro local affiché en placeholder selon le pays */
const PHONE_PLACEHOLDERS: Record<string, string> = {
  "Togo":               "Ex: 90000000",
  "Benin":              "Ex: 50123456",
  "Burkina Faso":       "Ex: 65123456",
  "Cameroun":           "Ex: 650123456",
  "Congo Brazzaville":  "Ex: 061234567",
  "Congo RDC":          "Ex: 812345678",
  "Gabon":              "Ex: 07123456",
  "Cote d'Ivoire":      "Ex: 0712345678",
  "Mali":               "Ex: 65123456",
  "Senegal":            "Ex: 771234567",
  "Guinee":             "Ex: 621234567",
  "Gambie":             "Ex: 3012345",
  "Philippines":        "Ex: 9171234567",
  "Pakistan":           "Ex: 3001234567",
  "India":              "Ex: 9000000000",
  "Nigeria":            "Ex: 8012345678",
  "Ghana":              "Ex: 244123456",
  "Niger":              "Ex: 90123456",
  "Kenya":              "Ex: 712345678",
};

const COUNTRY_FLAGS: Record<string, string> = {
  "Togo": "🇹🇬", "Benin": "🇧🇯", "Burkina Faso": "🇧🇫", "Cameroun": "🇨🇲",
  "Congo Brazzaville": "🇨🇬", "Congo RDC": "🇨🇩", "Gabon": "🇬🇦",
  "Cote d'Ivoire": "🇨🇮", "Mali": "🇲🇱", "Senegal": "🇸🇳",
  "Guinee": "🇬🇳", "Gambie": "🇬🇲",
  "Philippines": "🇵🇭", "Pakistan": "🇵🇰", "India": "🇮🇳", "Nigeria": "🇳🇬",
  "Ghana": "🇬🇭", "Niger": "🇳🇪", "Kenya": "🇰🇪",
};

/* operator icon (real image or color+abbr fallback) */
const OPERATOR_IMAGES: Record<string, string> = {
  "Wave":             waveIcon,
  "Moov Money":       moovIcon,
  "MTN Mobile Money": mtnIcon,
  "TMoney":           tmoneyIcon,
  "Orange Money":     orangeIcon,
  "Mixx by Yas":      mixxIcon,
  "M-Pesa":           mpesaIcon,
  "GCash":            gcashIcon,
  "Maya (PayMaya)":   paymayaIcon,
  "AirtelTigo Money": airteltigoIcon,
  "Vodafone Cash":    vodafoneIcon,
  "MTN Mobile Money Ghana": mtnGhanaIcon,
};
const OPERATOR_META: Record<string, { bg: string; abbr: string }> = {
  "Orange Money":        { bg: "#FF6600", abbr: "OM" },
  "Airtel Money":        { bg: "#E8001D", abbr: "AT" },
  "M-Pesa":              { bg: "#60BB44", abbr: "MP" },
  "Coris Money":         { bg: "#7C2020", abbr: "CM" },
  "Mixx by Yas":         { bg: "#7C3AED", abbr: "MX" },
  "Africell":            { bg: "#0066B3", abbr: "AF" },
  "Africell Money":      { bg: "#0066B3", abbr: "AF" },
  "Celtiis":             { bg: "#E05A00", abbr: "CT" },
  "GCash":               { bg: "#007DFF", abbr: "GC" },
  "Maya (PayMaya)":      { bg: "#00B14F", abbr: "MY" },
  "ShopeePay":           { bg: "#EE4D2D", abbr: "SP" },
  "GrabPay":             { bg: "#00B14F", abbr: "GP" },
  "EasyPaisa":           { bg: "#3AB54A", abbr: "EP" },
  "JazzCash":            { bg: "#D71920", abbr: "JC" },
  "NayaPay":             { bg: "#5C2D91", abbr: "NP" },
  "SadaPay":             { bg: "#1A1A1A", abbr: "SD" },
  "UPI / IMPS":          { bg: "#FF7F00", abbr: "UP" },
  "NEFT / RTGS":         { bg: "#1B4FA6", abbr: "NE" },
  "PhonePe":             { bg: "#6739B7", abbr: "PP" },
  "Google Pay":          { bg: "#4285F4", abbr: "GP" },
  "Paytm":               { bg: "#00BAF2", abbr: "PT" },
  "MTN MoMo Nigeria":    { bg: "#FFCB05", abbr: "MN" },
  "Airtel Money Nigeria":{ bg: "#E8001D", abbr: "AN" },
  "OPay":                { bg: "#2B7A10", abbr: "OP" },
  "PalmPay":             { bg: "#06C167", abbr: "PL" },
  "Kuda Bank":           { bg: "#4B1B73", abbr: "KB" },
  "AirtelTigo Money":    { bg: "#E8001D", abbr: "AT" },
  "Vodafone Cash":       { bg: "#E60000", abbr: "VC" },
  "Safaricom M-Pesa":    { bg: "#60BB44", abbr: "MP" },
  "Zamani":              { bg: "#1B4FA6", abbr: "ZA" },
  "Amana":               { bg: "#0D7C3D", abbr: "AM" },
  "Mynita":              { bg: "#8B4513", abbr: "MY" },
};

function currencyForCountry(c: string) {
  if (["Cameroun","Congo Brazzaville","Gabon"].includes(c)) return "XAF";
  if (c === "Congo RDC")   return "CDF";
  if (c === "Guinee")      return "GNF";
  if (c === "Gambie")      return "GMD";
  if (c === "Pakistan")    return "PKR";
  if (c === "Philippines") return "PHP";
  if (c === "India")       return "INR";
  if (c === "Nigeria")     return "NGN";
  if (c === "Kenya")       return "KES";
  if (c === "Ghana")       return "GHS";
  return "XOF";
}

/* ── SendavaPay helpers ─────────────────────────────────────────────────── */

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════════════════════ */
export default function PaymentPage() {
  const { toast } = useToast();
  const { t, setLang, setDefaultLang } = useLanguage();

  /* URL params */
  const pathParts   = window.location.pathname.split("/");
  const slugFromPath= pathParts.length === 3 && pathParts[1] === "pay" ? pathParts[2] : "";
  const urlParams   = new URLSearchParams(window.location.search);
  const merchantSlug    = urlParams.get("merchant") || slugFromPath || "";
  const amountParam     = urlParams.get("amount");
  const countryParam    = urlParams.get("country") || "";
  const redirectUrlParam= urlParams.get("redirect") || "";
  const omnipayStatus   = urlParams.get("omnipay_status") || "";
  const clapayReturn    = urlParams.get("clapay_return") === "1";
  const refParam        = urlParams.get("ref") || "";
  const phoneParam      = urlParams.get("phone") || urlParams.get("payerPhone") || "";
  const nameParam       = urlParams.get("name")  || urlParams.get("payerName")  || "";

  /* state */
  const [amount,      setAmount]      = useState(amountParam ? parseInt(amountParam, 10) : 0);
  const [redirectUrl, setRedirectUrl] = useState(redirectUrlParam);
  const redirectRef   = useRef(redirectUrlParam);

  const [step,         setStep]        = useState(omnipayStatus === "complete" && !clapayReturn ? 3 : 1);
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
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [dynMethods,  setDynMethods]  = useState<{ name: string; logo: string | null }[] | null>(null);
  const [cryptoOn,    setCryptoOn]    = useState(false);
  const [cryptoLoading,setCryptoLoad] = useState(false);

  const [failed,       setFailed]      = useState(false);
  const [failReason,   setFailReason]  = useState("");
  const [confirmedAt,  setConfirmedAt] = useState<Date | null>(null);
  const [showOtpModal, setShowOtpModal]= useState(false);
  const [showHelpModal,setShowHelpModal]= useState(false);

  /* Auto-language detection based on country */
  useEffect(() => {
    if (country) {
      const detected = detectLangFromCountry(country);
      setDefaultLang(detected);
    }
  }, [country, setDefaultLang]);

  /* ── SendavaPay API flow ──────────────────────────────────────────────── */
  const [sndOtpRequired,   setSndOtpRequired]   = useState(false);

  const [sndOtp,           setSndOtp]           = useState("");
  const [sndOtpSubmitting, setSndOtpSubmitting] = useState(false);
  const [sndProxyToken,    setSndProxyToken]    = useState<string | null>(null);
  const [helpName,     setHelpName]     = useState("");
  const [helpWhatsapp, setHelpWhatsapp] = useState("");
  const [helpMessage,  setHelpMessage]  = useState("");
  const [helpSending,  setHelpSending]  = useState(false);
  const [helpSent,     setHelpSent]     = useState(false);

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
  const rawMethods       = dynMethods ?? (PAYMENT_METHODS[country] || []).map((n: string) => ({ name: n, logo: null as string | null }));
  const methods          = rawMethods;
  const isCrypto         = method === "crypto";
  const needsOtp         = method === "Orange Money" && (country === "Burkina Faso" || country === "Cote d'Ivoire");
  const otpUssd          = country === "Burkina Faso" ? "*144*4*6*montant#" : "#144*82#";
  const maliOrange       = method === "Orange Money" && country === "Mali";
  const isSeapayCountry  = ["Philippines","Pakistan","India","Nigeria"].includes(country);
  const isIndia          = country === "India";
  const isPhilippines    = country === "Philippines";
  const isSeapayRedirect = isSeapayCountry && (isIndia || !!method) && !isCrypto;
  const dialCode         = DIAL_CODES[country] || "+";

  /* ── Auto-sélection méthode pour l'Inde (pas de choix opérateur) ─────── */
  useEffect(() => {
    if (isIndia) setMethod("UPI");
  }, [isIndia]);

  /* ── fetch merchant ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (clapayReturn && refParam) {
      setIsLoading(true);
      fetch(`/api/payment/by-ref/${encodeURIComponent(refParam)}`)
        .then(async r => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.message || t("payLinkNotFound"));
          return d;
        })
        .then(d => {
          if (d.amount) setAmount(d.amount);
          if (d.redirectUrl) { setRedirectUrl(d.redirectUrl); redirectRef.current = d.redirectUrl; }
          if (d.omnipayReference) setOmniRef(d.omnipayReference);
          if (d.paymentId) setPaymentId(d.paymentId);
          if (d.merchantName || d.merchantSlug) {
            setMerchantInfo({ name: d.merchantName || d.merchantSlug, slug: d.merchantSlug || "", countries: d.country ? [d.country] : [] });
          }
          if (["omnipay_confirmed", "confirmed"].includes(d.status)) {
            setConfirmedAt(new Date());
            setStep(3);
          } else if (["omnipay_failed", "omnipay_error", "failed", "expired"].includes(d.status)) {
            setFailed(true);
            setFailReason(t("payFailedDesc"));
            setStep(2);
          } else {
            setStep(2);
            if (d.paymentId) startPolling(d.paymentId);
          }
        })
        .catch(e => setLoadError(e.message || t("payLinkNotFound")))
        .finally(() => setIsLoading(false));
      return;
    }
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
    if (!merchantSlug) { setLoadError(t("payLinkNotFound")); setIsLoading(false); return; }
    (async () => {
      setIsLoading(true);
      try {
        const r = await fetch(`/api/payment/${merchantSlug}/info`);
        if (!r.ok) { const d = await r.json(); throw new Error(d.message || t("payMerchantNotFound")); }
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
  }, [merchantSlug, t]);

  useEffect(() => {
    if (!country) return;
    fetch(`/api/public/payment-methods/${encodeURIComponent(country)}?type=api`)
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
        else if (d.status === "failed") { clearInterval(pollingRef.current!); setOmniPolling(false); setFailed(true); setFailReason(t("payFailedDesc")); }
      } catch {}
    }, 5000);
  };
  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  /* ── redirect countdown ─────────────────────────────────────────────── */
  useEffect(() => {
    if (step !== 3) return;
    const tCount = setInterval(() => setCountdown(p => {
      if (p <= 1) { clearInterval(tCount); if (redirectRef.current) safeRedirect(redirectRef.current, { status:"success", amount:String(amount), ref:omniRef||"" }); return 0; }
      return p - 1;
    }), 1000);
    return () => clearInterval(tCount);
  }, [step, amount, omniRef]);

  /* ── handlers ───────────────────────────────────────────────────────── */
  const selectMethod = useCallback((m: string) => { setMethod(m); setOtpCode(""); }, []);

  const handlePay = () => {
    if (!isIndia && !method) { toast({ title: t("payMethodRequired"), description: t("payMethodRequiredDesc"), variant:"destructive" }); return; }
    if (isCrypto) { doInitiate(); return; }
    if (!isSeapayCountry && !payerPhone.trim()) { toast({ title: t("payPhoneRequired"), description: t("payPhoneRequired"), variant:"destructive" }); return; }
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
      } catch { toast({ title: t("payErrorGeneric"), variant:"destructive" }); }
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
      setPaymentId(d.paymentId); setOmniRef(d.omnipayReference); setShowOtpModal(false);
      if (d.sendavapay) {
        /* ── SendavaPay: push USSD déclenché côté serveur ── */
        if (d.proxyToken) setSndProxyToken(d.proxyToken);
        setStep(2);
        if (d.requiresOtp) {
          setSndOtpRequired(true);
          // otpToken is now stored server-side; no need to hold it in browser state.
        } else if (d.paymentUrl) {
          setPaymentUrl(d.paymentUrl);
          startPolling(d.paymentId);
        } else {
          startPolling(d.paymentId);
        }
        return;
      }
      if (d.paymentUrl) { setPaymentUrl(d.paymentUrl); setStep(2); }
      else { setStep(2); startPolling(d.paymentId); }
    } catch (e: any) { toast({ title: t("payFailed"), description: sanitizePaymentMessage(e?.message, t("payFailedDesc")), variant:"destructive" }); }
    finally { setIsSubmitting(false); }
  };

  /* ── SendavaPay : résolution de l'ID opérateur ──────────────────────── */
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

  const resolveOperatorId = (ops: any[], methodName: string, _cc: string): string | null => {
    const norm = (s: string) => s.toLowerCase().replace(/[\s\-_]+/g, "");
    const low = methodName.toLowerCase().trim();
    const normLow = norm(low);
    const exactNorm = ops.find((o: any) => norm(o.name) === normLow);
    if (exactNorm) return exactNorm.id;
    const contained = ops.find((o: any) => {
      const on = norm(o.name);
      return normLow.includes(on) || on.includes(normLow);
    });
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

  /* ── SendavaPay : soumettre le code OTP ──────────────────────────────── */
  const submitSendavaOtp = async () => {
    if (!sndOtpRequired || !sndOtp.trim()) return;
    setSndOtpSubmitting(true);
    try {
      const proxyHeaders: Record<string, string> = sndProxyToken ? { "X-Sp-Proxy-Token": sndProxyToken } : {};
      // Only send the user-entered OTP code — the OTP token is stored server-side and
      // used directly by the proxy without trusting the client to supply it.
      const res = await fetch("/api/sendavapay/proxy/v1/submit-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...proxyHeaders },
        body: JSON.stringify({ otp: sndOtp.trim() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || t("otpInvalidCode"));
      setSndOtpRequired(false);
      if (paymentId) startPolling(paymentId);
    } catch (e: any) {
      toast({ title: t("otpInvalidCode"), description: sanitizePaymentMessage(e.message, t("otpInvalidCode")), variant: "destructive" });
    } finally {
      setSndOtpSubmitting(false);
    }
  };

  const retry = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setOmniPolling(false); setFailed(false); setFailReason(""); setPaymentUrl(null); setStep(1); setSndOtpRequired(false);
  };

  if (isLoading) return (
    <>
      <style>{`@keyframes bank1PaymentSpin{to{transform:rotate(360deg)}}`}</style>
      <div
        style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#fff" }}
        role="status"
        aria-label="Chargement du paiement"
      >
        <Loader2
          style={{
            width:32,
            height:32,
            color:"#2563eb",
            animation:"bank1PaymentSpin .9s linear infinite",
            transformOrigin:"center",
          }}
        />
      </div>
    </>
  );
  if ((loadError || !merchantInfo) && step !== 3) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#fff", padding:16 }}>
      <div style={{ textAlign:"center", maxWidth:320 }}>
        <div style={{ width:56, height:56, borderRadius:"50%", background:"#fee2e2", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
          <X style={{ width:26, height:26, color:"#dc2626" }} />
        </div>
        <p style={{ fontWeight:700, color:"#111", fontSize:16, marginBottom:6 }}>{t("payLinkNotFound")}</p>
        <p style={{ color:"#6b7280", fontSize:14 }}>{sanitizePaymentMessage(loadError, t("payLinkNotFound"))}</p>
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
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes fadeInOverlay{from{opacity:0}to{opacity:1}}
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
          width:100%;padding:13px 16px;font-size:16px;font-weight:900;
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

      <div style={{ minHeight:"100vh", background:"#fff", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"12px 0" }}>

        {/* ── top header (outside card) ─────────────────────────────── */}
        <div style={{ width:"100%", maxWidth:400, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 20px 14px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:"#e8f0fe", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <img src={bankCardIcon} alt="" style={{ width:24, height:24, filter:"brightness(0) saturate(100%) invert(24%) sepia(95%) saturate(1200%) hue-rotate(218deg) brightness(99%) contrast(97%)" }} />
            </div>
            <p style={{ fontWeight:600, fontSize:16, color:"#111827", lineHeight:1.2 }} data-testid="text-title">{t("payTitle")}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LanguageSwitcher />
            <button onClick={() => setShowHelpModal(true)} data-testid="button-help"
              style={{ background:"none", border:"none", cursor:"pointer", padding:0, lineHeight:1, display:"flex", alignItems:"center", justifyContent:"center" }}
              title={t("help")}>
              <img src="/help-icon.png" alt={t("help")} style={{ width:42, height:42, objectFit:"cover", borderRadius:"50%" }} />
            </button>
          </div>
        </div>

        {/* ── white card ───────────────────────────────────────────── */}
        <div style={{ width:"100%", maxWidth:400, background:"#fff", borderRadius:24, boxShadow:"0 2px 24px rgba(0,0,0,.14), 0 1px 4px rgba(0,0,0,.07)", overflow:"hidden" }}>
          <div style={{ padding:"18px 20px 20px", display:"flex", flexDirection:"column", gap:14 }}>

            {/* ══ STEP 1 ══════════════════════════════════════════════ */}
            {step === 1 && (<>
              {merchantInfo && merchantInfo.countries.length > 1 && (
                <div>
                  <p style={{ fontSize:13, fontWeight:600, color:"#374151", marginBottom:8 }}>{t("payCountry")}</p>
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

              {amount > 0 && (
                <div style={{ background:"#f1f5f9", borderRadius:14, padding:"14px 16px", textAlign:"center" }}>
                  <p style={{ fontSize:13, fontWeight:600, color:"#6b7280", marginBottom:4, textTransform:"uppercase", letterSpacing:".05em" }}>{t("payAmountToPay")}</p>
                  <p style={{ fontSize:38, fontWeight:900, color:"#2563eb", letterSpacing:"-1px", lineHeight:1.1 }} data-testid="text-amount">
                    {fmt(amount)}<span style={{ fontSize:18, fontWeight:700, color:"#2563eb", marginLeft:6, opacity:.85 }}>{currency}</span>
                  </p>
                </div>
              )}

              {/* ── Opérateur : caché pour l'Inde (redirect direct SeaPay) ── */}
              {!isIndia && (
              <div>
                <p style={{ fontSize:13, fontWeight:500, color:"#6b7280", marginBottom:10 }}>{t("payChooseMethod")}</p>
                {methods.length === 0 && !cryptoOn ? (
                  <p style={{ textAlign:"center", color:"#9ca3af", fontSize:13, padding:"14px", border:"1.5px dashed #e5e7eb", borderRadius:12 }}>{t("noData")}</p>
                ) : (
                  <div style={{ border:"2.5px solid #111", borderRadius:18, padding:"12px 10px", display:"flex", alignItems:"center", justifyContent:"space-evenly", gap:8 }}
                    role="radiogroup">
                    {methods.map(m => {
                      const dbLogo = m.logo;
                      const img  = dbLogo || OPERATOR_IMAGES[m.name];
                      const meta = OPERATOR_META[m.name] || { bg:"#6b7280", abbr:m.name.substring(0,2).toUpperCase() };
                      const sel  = method === m.name;
                      return (
                        <div key={m.name} className={`op${sel ? " sel" : ""}`}
                          onClick={() => selectMethod(m.name)}
                          onTouchEnd={e => { e.preventDefault(); selectMethod(m.name); }}
                          role="radio" aria-checked={sel} tabIndex={0}
                          onKeyDown={e => { if (e.key===" "||e.key==="Enter") { e.preventDefault(); selectMethod(m.name); } }}
                          data-testid={`radio-${m.name.replace(/\s+/g,"-").toLowerCase()}`}
                          title={m.name}>
                          {img
                            ? <img src={img} alt={m.name} draggable={false} onContextMenu={e => e.preventDefault()} onDragStart={e => e.preventDefault()} style={{ width:"100%", height:"100%", objectFit:"cover", borderRadius:"50%", display:"block", pointerEvents:"none", userSelect:"none", WebkitUserDrag:"none" } as React.CSSProperties} />
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
                        data-testid="radio-crypto" title={t("payCrypto")}
                        style={{ background:"#f59e0b", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <Bitcoin style={{ width:32, height:32, color:"#fff" }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* ── Téléphone : caché pour les pays SeaPay (Inde, Philippines) ── */}
              {!isCrypto && !isSeapayCountry && (
                <div>
                  <p style={{ fontSize:13, fontWeight:600, color:"#374151", marginBottom:8 }}>{t("payPhoneNumber")}</p>
                  <div style={{ display:"flex", alignItems:"stretch", border:"1.5px solid #d1d5db", borderRadius:12, overflow:"hidden", background:"#fff" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, padding:"0 12px", background:"#f8fafc", borderRight:"1.5px solid #e5e7eb", flexShrink:0 }}>
                      <Smartphone style={{ width:15, height:15, color:"#94a3b8" }} />
                      <span style={{ fontSize:14, fontWeight:700, color:"#374151" }}>{dialCode}</span>
                    </div>
                    <input type="tel" value={payerPhone} onChange={e => setPayerPhone(e.target.value)}
                      placeholder={PHONE_PLACEHOLDERS[country] || t("payPhoneNumberPlaceholder")} data-testid="input-phone"
                      style={{ flex:1, padding:"12px 14px", fontSize:15, border:"none", outline:"none", background:"transparent", color:"#111" }} />
                  </div>
                </div>
              )}

              {isCrypto && (
                <div style={{ background:"#fffbeb", border:"1.5px solid #fde68a", borderRadius:12, padding:"10px 14px" }}>
                  <p style={{ fontSize:12, color:"#92400e" }}>{t("cryptoScanQr")}</p>
                </div>
              )}

              {isSeapayRedirect && (
                <div style={{ background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:12, padding:"10px 14px" }}>
                  <p style={{ fontSize:12, fontWeight:600, color:"#1d4ed8", marginBottom:3 }}>{method} — {t("payProcessing")}</p>
                  <p style={{ fontSize:12, color:"#1e40af" }}>{t("payWaitingValidation")}</p>
                </div>
              )}

              {maliOrange && (
                <div style={{ background:"#fff7ed", border:"1.5px solid #fed7aa", borderRadius:12, padding:"10px 14px" }}>
                  <p style={{ fontSize:12, fontWeight:600, color:"#c2410c", marginBottom:3 }}>Orange Money — {t("otpTitle")}</p>
                  <p style={{ fontSize:12, color:"#92400e" }}>{t("payValidateOnPhone")}</p>
                </div>
              )}

              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                <button type="button" onClick={handlePay}
                  disabled={isSubmitting || cryptoLoading || (!isIndia && !method) || (!isCrypto && !isSeapayCountry && !payerPhone.trim())}
                  className="paybtn" data-testid="button-pay"
                  style={{ background:"#f5c100", color:"#111" }}>
                  {(isSubmitting || cryptoLoading) && <Loader2 style={{ width:18, height:18, animation:"spin 1s linear infinite" }} />}
                  {isCrypto ? t("payCrypto") : isIndia ? t("payPayNow") : t("payPayNow")}
                </button>
                <p style={{ textAlign:"center", fontSize:12, color:"#374151", fontWeight:500 }}>{t("payProcessing")}</p>
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
                    <p style={{ fontWeight:700, color:"#991b1b", fontSize:16 }}>{t("payFailed")}</p>
                    <p style={{ color:"#6b7280", fontSize:13 }}>{sanitizePaymentMessage(failReason, t("payFailedDesc"))}</p>
                    <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:12, padding:"12px 14px", textAlign:"left" }}>
                      <p style={{ fontSize:12, color:"#7f1d1d" }}>• {t("payFailedDesc")}</p>
                    </div>
                    <button type="button" onClick={retry} className="paybtn" style={{ background:"#f5c100", color:"#111" }}>
                      <RefreshCw style={{ width:16, height:16 }} /> {t("payTryAgain")}
                    </button>
                  </div>
                ) : sndOtpRequired ? (
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                    <div style={{ background:"#fff7ed", border:"1.5px solid #fed7aa", borderRadius:14, padding:"14px 16px" }}>
                      <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                        <div style={{ width:42, height:42, borderRadius:10, background:"#FF6600", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          <Smartphone style={{ width:20, height:20, color:"#fff" }} />
                        </div>
                        <div>
                          <p style={{ fontWeight:700, fontSize:14, color:"#c2410c", marginBottom:4 }}>{t("otpTitle")}</p>
                          <p style={{ fontSize:12, color:"#92400e" }}>{t("otpDesc")}</p>
                        </div>
                      </div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      <label style={{ fontSize:12, fontWeight:600, color:"#374151" }}>{t("otpCodePlaceholder")}</label>
                      <input
                        type="text" inputMode="numeric" maxLength={8}
                        value={sndOtp} onChange={e => setSndOtp(e.target.value.replace(/\D/g,""))}
                        placeholder="123456"
                        data-testid="input-snd-otp"
                        style={{ padding:"12px 14px", fontSize:22, fontWeight:700, letterSpacing:"0.25em", textAlign:"center", border:"1.5px solid #d1d5db", borderRadius:12, outline:"none", background:"#fff", color:"#111" }}
                      />
                    </div>
                    <button type="button" onClick={submitSendavaOtp}
                      disabled={sndOtpSubmitting || sndOtp.trim().length < 4}
                      className="paybtn" data-testid="button-snd-otp-submit"
                      style={{ background:"#f5c100", color:"#111" }}>
                      {sndOtpSubmitting && <Loader2 style={{ width:16, height:16, animation:"spin 1s linear infinite" }} />}
                      {t("confirm")}
                    </button>
                    <button type="button" onClick={retry} className="ghost">← {t("back")}</button>
                  </div>
                ) : paymentUrl ? (<>
                  <div style={{ background:"#dbeafe", borderRadius:12, padding:12, textAlign:"center", fontSize:14, fontWeight:500, color:"#1e40af" }}>
                    {t("payWaitingValidation")}
                  </div>
                  <button type="button" onClick={() => { if (paymentUrl) { window.open(paymentUrl,"_blank"); if (paymentId) startPolling(paymentId); } }}
                    className="paybtn" style={{ background:"#f5c100", color:"#111" }}>
                    <ExternalLink style={{ width:16, height:16 }} /> {t("payOpenPaymentLink")}
                  </button>
                  {omniPolling && (
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, color:"#6b7280" }}>
                      <Loader2 style={{ width:15, height:15, animation:"spin 1s linear infinite" }} />
                      <span style={{ fontSize:13 }}>{t("payProcessing")}</span>
                    </div>
                  )}
                  <button type="button" onClick={retry} className="ghost">← {t("back")}</button>
                </>) : (<>
                  <div style={{ textAlign:"center", padding:"14px 0" }}>
                    <div className="anim-pulse" style={{ display:"inline-block" }}>
                      <div style={{ width:100, height:100, borderRadius:"50%", background:"#eff6ff", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto" }}>
                        <img src={phoneHandIcon} alt="" style={{ width:72, height:72, objectFit:"contain" }} />
                      </div>
                    </div>
                    <p style={{ fontWeight:700, fontSize:15, color:"#111", marginTop:14 }}>{t("payWaitingValidation")}</p>
                    <p style={{ fontSize:13, color:"#6b7280", marginTop:6 }}>
                      {t("payProcessing")}
                    </p>
                  </div>
                  {maliOrange && (
                    <div style={{ background:"#fff7ed", border:"1.5px solid #fed7aa", borderRadius:12, padding:"10px 14px" }}>
                      <p style={{ fontSize:12, fontWeight:600, color:"#c2410c", marginBottom:3 }}>Orange Money — {t("help")}</p>
                      <p style={{ fontSize:12, color:"#92400e" }}>{t("payValidateOnPhone")}</p>
                    </div>
                  )}
                  {omniPolling && (
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, color:"#6b7280" }}>
                      <Loader2 style={{ width:14, height:14, animation:"spin 1s linear infinite" }} />
                      <span style={{ fontSize:12 }}>{t("payProcessing")}</span>
                    </div>
                  )}
                  <button type="button" onClick={retry} className="ghost">← {t("back")}</button>
                </>)}
              </div>
            )}

            {/* ══ STEP 3 ══════════════════════════════════════════════ */}
            {step === 3 && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:0, paddingTop:8 }} data-testid="step3">
                <div className="anim-pop" style={{ marginBottom:16 }}>
                  <div style={{ width:110, height:110, borderRadius:"50%", background:"#fff", border:"5px solid #22c55e", boxShadow:"0 0 0 10px #dcfce7", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
                      <circle cx="30" cy="30" r="28" fill="#22c55e" />
                      <path className="anim-draw" d="M16 31 L26 41 L44 20" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
                <p style={{ fontWeight:800, fontSize:20, color:"#111", textAlign:"center", marginBottom:4 }}>{t("paySuccess")}</p>
                {merchantInfo && (
                  <p style={{ fontSize:13, color:"#6b7280", textAlign:"center", marginBottom:20 }}>{t("via")} <strong style={{ color:"#374151" }}>{merchantInfo.name}</strong></p>
                )}
                <div style={{ width:"100%", borderRadius:16, padding:"20px 24px", textAlign:"center", background:"linear-gradient(135deg,#16a34a 0%,#22c55e 100%)", marginBottom:16 }}>
                  <p style={{ color:"rgba(255,255,255,.75)", fontSize:11, textTransform:"uppercase", letterSpacing:".1em", marginBottom:6 }}>{t("payAmountToPay")}</p>
                  <p style={{ color:"#fff", fontWeight:900, fontSize:42, letterSpacing:"-1px", lineHeight:1 }}>
                    {fmt(amount)}<span style={{ fontSize:22, fontWeight:500, opacity:.8, marginLeft:8 }}>{currency}</span>
                  </p>
                </div>
                <div style={{ width:"100%", border:"1.5px solid #e5e7eb", borderRadius:16, overflow:"hidden", marginBottom:16 }}>
                  {omniRef && (
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"13px 18px", borderBottom:"1px solid #f3f4f6" }}>
                      <span style={{ fontSize:12, color:"#6b7280", fontWeight:500 }}>{t("payTransactionRef")}</span>
                      <span style={{ fontSize:12, fontFamily:"monospace", fontWeight:700, color:"#111", background:"#f3f4f6", padding:"3px 10px", borderRadius:8 }}>{omniRef}</span>
                    </div>
                  )}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"13px 18px", borderBottom: confirmedAt ? "1px solid #f3f4f6" : "none" }}>
                    <span style={{ fontSize:12, color:"#6b7280", fontWeight:500 }}>{t("status")}</span>
                    <span style={{ fontSize:12, fontWeight:700, background:"#dcfce7", color:"#166534", padding:"3px 12px", borderRadius:99, display:"flex", alignItems:"center", gap:5 }}>
                      <span style={{ width:7, height:7, borderRadius:"50%", background:"#22c55e", display:"inline-block" }} />
                      {t("confirmed")}
                    </span>
                  </div>
                  {confirmedAt && (<>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"13px 18px", borderBottom:"1px solid #f3f4f6" }}>
                      <span style={{ fontSize:12, color:"#6b7280", fontWeight:500 }}>{t("date")}</span>
                      <span style={{ fontSize:12, color:"#374151", fontWeight:600 }}>{fmtD(confirmedAt)}</span>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"13px 18px" }}>
                      <span style={{ fontSize:12, color:"#6b7280", fontWeight:500, display:"flex", alignItems:"center", gap:4 }}>
                        <Clock style={{ width:12, height:12 }} /> {t("time")}
                      </span>
                      <span style={{ fontSize:12, fontWeight:700, color:"#374151" }}>{fmtT(confirmedAt)}</span>
                    </div>
                  </>)}
                </div>
                {redirectUrl ? (
                  <div style={{ width:"100%", display:"flex", flexDirection:"column", gap:10, alignItems:"center" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, background:"#f0fdf4", border:"1.5px solid #86efac", borderRadius:12, padding:"10px 18px", width:"100%" }}>
                      <Loader2 style={{ width:15, height:15, color:"#16a34a", animation:"spin 1s linear infinite", flexShrink:0 }} />
                      <p style={{ fontSize:13, color:"#166534", margin:0 }}>
                        {t("payBackToMerchant")} <strong>{countdown}s</strong> ...
                      </p>
                    </div>
                    <a href={(() => { try { const u = new URL(/^https?:\/\//i.test(redirectUrl) ? redirectUrl : `https://${redirectUrl}`); u.searchParams.set("status","success"); u.searchParams.set("amount",String(amount)); u.searchParams.set("ref",omniRef||""); return u.toString(); } catch { return "#"; } })()}
                      className="paybtn" style={{ textDecoration:"none", background:"#22c55e", color:"#fff", width:"100%", textAlign:"center" }} data-testid="link-redirect">
                      {t("payBackToMerchant")}
                    </a>
                  </div>
                ) : (
                  <p style={{ textAlign:"center", fontSize:13, color:"#9ca3af", marginTop:4 }}>{t("paySuccessDesc")}</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop:20, marginBottom:20, display:"flex", flexDirection:"column", alignItems:"center" }}>
          <img src={robotpayLogo} alt="RobotPay" style={{ height:52, objectFit:"contain", display:"block" }} />
        </div>
      </div>

      {showOtpModal && (
        <div className="overlay" onClick={e => { if (e.target===e.currentTarget) setShowOtpModal(false); }}>
          <div className="modal">
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20 }}>
              <div>
                <p style={{ fontWeight:700, fontSize:17, color:"#111" }}>{t("otpTitle")}</p>
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
                  <p style={{ fontWeight:600, fontSize:13, color:"#c2410c", marginBottom:6 }}>{t("payValidateOnPhone")}</p>
                  <p style={{ fontFamily:"monospace", fontWeight:800, fontSize:16, background:"#fff", color:"#c2410c", padding:"3px 10px", borderRadius:7, border:"1px solid #fed7aa", display:"inline-block" }}>
                    {otpUssd}
                  </p>
                  <p style={{ fontSize:12, color:"#92400e", marginTop:6 }}>{t("otpDesc")}</p>
                </div>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#374151" }}>{t("otpCodePlaceholder")}</label>
              <input type="text" inputMode="numeric" maxLength={8} value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g,""))}
                placeholder={t("otpCodePlaceholder")} autoFocus data-testid="input-otp"
                className="inp"
                style={{ textAlign:"center", fontSize:22, fontWeight:700, letterSpacing:"0.22em" }} />
              <button type="button" className="paybtn" data-testid="button-otp-confirm"
                disabled={isSubmitting || !otpCode.trim()}
                style={{ background:"#f5c100", color:"#111" }}
                onClick={() => { if (!otpCode.trim()) { toast({ title: t("otpCodeRequired"), variant:"destructive" }); return; } doInitiate(); }}>
                {isSubmitting && <Loader2 style={{ width:16, height:16, animation:"spin 1s linear infinite" }} />}
                {t("otpVerify")}
              </button>
              <button type="button" className="ghost" onClick={() => setShowOtpModal(false)} style={{ justifyContent:"center", width:"100%" }}>
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHelpModal && (
        <div
          onClick={e => { if (e.target===e.currentTarget) { setShowHelpModal(false); setHelpSent(false); setHelpName(""); setHelpWhatsapp(""); setHelpMessage(""); } }}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", zIndex:1000, display:"flex", flexDirection:"column", justifyContent:"flex-end", animation:"fadeInOverlay .2s ease" }}>
          <div style={{ background:"#fff", borderRadius:"24px 24px 0 0", width:"100%", maxHeight:"92vh", display:"flex", flexDirection:"column", animation:"slideUp .3s cubic-bezier(.32,.72,0,1)", boxShadow:"0 -4px 32px rgba(0,0,0,.18)" }}>
            <div style={{ display:"flex", justifyContent:"center", padding:"12px 0 4px" }}>
              <div style={{ width:40, height:4, borderRadius:2, background:"#e5e7eb" }} />
            </div>
            <div style={{ overflowY:"auto", flex:1, padding:"12px 20px 0" }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:18 }}>
                <div>
                  <p style={{ fontWeight:800, fontSize:19, color:"#111", margin:0 }}>{t("help")}</p>
                  <p style={{ fontSize:13, color:"#6b7280", marginTop:4 }}>{t("payWaitingValidation")}</p>
                </div>
                <button onClick={() => { setShowHelpModal(false); setHelpSent(false); setHelpName(""); setHelpWhatsapp(""); setHelpMessage(""); }}
                  style={{ width:32, height:32, borderRadius:"50%", border:"1.5px solid #e5e7eb", background:"#f9fafb", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <X style={{ width:15, height:15, color:"#6b7280" }} />
                </button>
              </div>
              {helpSent ? (
                <div style={{ textAlign:"center", padding:"32px 0 24px" }}>
                  <div style={{ width:60, height:60, borderRadius:"50%", background:"#e8f5e9", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <p style={{ fontWeight:700, fontSize:17, color:"#111", marginBottom:8 }}>{t("success")}</p>
                  <p style={{ fontSize:13, color:"#6b7280", lineHeight:1.6 }}>{t("paySuccessDesc")}</p>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:16, paddingBottom:8 }}>
                  <div>
                    <label style={{ fontSize:13, fontWeight:600, color:"#374151", display:"block", marginBottom:7 }}>
                      {t("payFullName")} <span style={{ color:"#ef4444" }}>*</span>
                    </label>
                    <input type="text" value={helpName} onChange={e => setHelpName(e.target.value)}
                      placeholder={t("payFullNamePlaceholder")} className="inp" style={{ fontSize:15 }} />
                  </div>
                  <div>
                    <label style={{ fontSize:13, fontWeight:600, color:"#374151", display:"block", marginBottom:7 }}>
                      {t("payPhoneNumber")} <span style={{ fontWeight:400, color:"#9ca3af" }}>({t("optional")})</span>
                    </label>
                    <input type="tel" value={helpWhatsapp} onChange={e => setHelpWhatsapp(e.target.value)}
                      placeholder="+229 00 00 00 00" className="inp" style={{ fontSize:15 }} />
                  </div>
                  <div>
                    <label style={{ fontSize:13, fontWeight:600, color:"#374151", display:"block", marginBottom:7 }}>
                      {t("messages")} <span style={{ color:"#ef4444" }}>*</span>
                    </label>
                    <textarea value={helpMessage} onChange={e => setHelpMessage(e.target.value)}
                      placeholder={t("help")} rows={4} className="inp"
                      style={{ fontSize:15, resize:"none", fontFamily:"inherit" }} />
                  </div>
                </div>
              )}
            </div>
            <div style={{ padding:"16px 20px 28px", background:"#fff" }}>
              {helpSent ? (
                <button onClick={() => { setShowHelpModal(false); setHelpSent(false); setHelpName(""); setHelpWhatsapp(""); setHelpMessage(""); }}
                  style={{ width:"100%", padding:"16px", borderRadius:14, border:"none", background:"#1a7f3c", cursor:"pointer", fontSize:16, fontWeight:700, color:"#fff" }}>
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
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          name: helpName.trim(),
                          whatsapp: helpWhatsapp.trim(),
                          message: helpMessage.trim(),
                          merchantName: merchantInfo?.name || "",
                          merchantSlug: merchantInfo?.slug || merchantSlug,
                        }),
                      });
                      if (r.ok) { setHelpSent(true); }
                      else { toast({ title: t("error"), description: t("payErrorGeneric"), variant: "destructive" }); }
                    } catch {
                      toast({ title: t("error"), description: t("payErrorGeneric"), variant: "destructive" });
                    } finally { setHelpSending(false); }
                  }}
                  style={{ width:"100%", padding:"16px", borderRadius:14, border:"none", background: (!helpName.trim() || !helpMessage.trim()) ? "#b0c9b7" : "#1a7f3c", cursor: (!helpName.trim() || !helpMessage.trim()) ? "not-allowed" : "pointer", fontSize:16, fontWeight:700, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", gap:8, transition:"background .15s" }}>
                  {helpSending && <Loader2 style={{ width:18, height:18, animation:"spin 1s linear infinite" }} />}
                  {t("submit")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
