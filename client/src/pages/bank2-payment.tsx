import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { sanitizePaymentMessage } from "@/lib/sanitize-payment-message";

type MerchantInfo = {
  name: string;
  slug: string;
  countries: string[];
};

type PaymentMethod = {
  name: string;
};

type Screen = "countries" | "operators" | "phone" | "otp" | "pending" | "success" | "failed";

type PaymentLinkInfo = {
  link: {
    uniqueId: string;
    name: string;
    bank: string;
    amountType: string;
    amount: number | null;
    redirectUrl: string | null;
  };
  merchantName: string;
  merchantSlug: string;
  countries: string[];
};

const FALLBACK_METHODS: Record<string, string[]> = {
  Togo: ["Moov Money", "TMoney"],
  Benin: ["MTN Mobile Money", "Moov Money", "Celtiis"],
  "Burkina Faso": ["Coris Money", "Moov Money", "Orange Money"],
  Cameroun: ["MTN Mobile Money", "Orange Money"],
  "Congo Brazzaville": ["MTN Mobile Money"],
  "Congo RDC": ["Africell", "Airtel Money", "M-Pesa", "Orange Money"],
  Gabon: ["Airtel Money", "Moov Money"],
  "Cote d'Ivoire": ["Wave", "Orange Money", "Moov Money", "MTN Mobile Money"],
  Mali: ["Orange Money"],
  Senegal: ["Wave", "Mixx by Yas", "Orange Money"],
  Guinee: ["MTN Mobile Money", "Orange Money"],
  Gambie: ["Africell Money"],
  Philippines: ["GCash", "Maya (PayMaya)"],
  Pakistan: ["EasyPaisa", "JazzCash", "NayaPay", "SadaPay"],
  Nigeria: ["MTN MoMo Nigeria", "Airtel Money Nigeria", "OPay", "PalmPay", "Kuda Bank"],
  Ghana: ["MTN Mobile Money", "AirtelTigo Money", "Vodafone Cash"],
  Niger: ["Airtel Money", "Moov Money", "Zamani", "Amana", "Mynita"],
  Kenya: ["Safaricom M-Pesa", "Airtel Money", "M-Pesa"],
};

const DIAL_CODES: Record<string, string> = {
  Togo: "+228",
  Benin: "+229",
  "Burkina Faso": "+226",
  Cameroun: "+237",
  "Congo Brazzaville": "+242",
  "Congo RDC": "+243",
  Gabon: "+241",
  "Cote d'Ivoire": "+225",
  Mali: "+223",
  Senegal: "+221",
  Guinee: "+224",
  Gambie: "+220",
  Philippines: "+63",
  Pakistan: "+92",
  India: "+91",
  Nigeria: "+234",
  Ghana: "+233",
  Niger: "+227",
  Kenya: "+254",
};

const COUNTRY_FLAGS: Record<string, string> = {
  Togo: "🇹🇬",
  Benin: "🇧🇯",
  "Burkina Faso": "🇧🇫",
  Cameroun: "🇨🇲",
  "Congo Brazzaville": "🇨🇬",
  "Congo RDC": "🇨🇩",
  Gabon: "🇬🇦",
  "Cote d'Ivoire": "🇨🇮",
  Mali: "🇲🇱",
  Senegal: "🇸🇳",
  Guinee: "🇬🇳",
  Gambie: "🇬🇲",
  Philippines: "🇵🇭",
  Pakistan: "🇵🇰",
  India: "🇮🇳",
  Nigeria: "🇳🇬",
  Ghana: "🇬🇭",
  Niger: "🇳🇪",
  Kenya: "🇰🇪",
};

const COUNTRY_LABELS: Record<string, string> = {
  Benin: "Bénin",
  "Cote d'Ivoire": "Côte d'Ivoire",
  Guinee: "Guinée",
  Senegal: "Sénégal",
};

const PHONE_PLACEHOLDERS: Record<string, string> = {
  Togo: "90 00 00 00",
  Benin: "50 12 34 56",
  "Burkina Faso": "65 12 34 56",
  Cameroun: "650 12 34 56",
  "Congo Brazzaville": "06 123 45 67",
  "Congo RDC": "812 345 678",
  Gabon: "07 12 34 56",
  "Cote d'Ivoire": "07 12 34 56 78",
  Mali: "65 12 34 56",
  Senegal: "77 123 45 67",
  Guinee: "621 234 567",
  Gambie: "301 2345",
  Philippines: "917 123 4567",
  Pakistan: "300 123 4567",
  India: "90000 00000",
  Nigeria: "801 234 5678",
  Ghana: "244 123 456",
  Niger: "90 12 34 56",
  Kenya: "712 345 678",
};

const ORANGE_OTP_USSD: Record<string, string> = {
  "Burkina Faso": "*144*4*6*montant#",
  "Cote d'Ivoire": "#144*82#",
  Mali: "*144#",
};

function currencyForCountry(country: string) {
  if (["Cameroun", "Congo Brazzaville", "Gabon"].includes(country)) return "XAF";
  if (country === "Congo RDC") return "CDF";
  if (country === "Guinee") return "GNF";
  if (country === "Gambie") return "GMD";
  if (country === "Pakistan") return "PKR";
  if (country === "Philippines") return "PHP";
  if (country === "India") return "INR";
  if (country === "Nigeria") return "NGN";
  if (country === "Kenya") return "KES";
  if (country === "Ghana") return "GHS";
  return "XOF";
}

function Stepper({ screen }: { screen: Screen }) {
  const stage = screen === "success" ? 3 : ["pending", "otp"].includes(screen) ? 2 : 1;
  const steps = ["Numéro de téléphone", "Informations de confirmation", "Paiement terminé"];

  return (
    <div className="bank2-stepper" aria-label="Progression du paiement">
      {steps.map((label, index) => {
        const number = index + 1;
        const complete = stage > number;
        const active = stage === number;
        return (
          <div className="bank2-step-wrap" key={label}>
            <div className={`bank2-step ${complete ? "complete" : ""} ${active ? "active" : ""}`}>
              {complete ? <Check size={22} strokeWidth={2.5} /> : number}
            </div>
            <span className={complete || active ? "current" : ""}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Bank2PaymentPage() {
  const params = new URLSearchParams(window.location.search);
  const merchantSlug = params.get("merchant") || "";
  const paymentLinkUniqueId = params.get("link") || params.get("linkId") || "";
  const amountParam = Number.parseInt(params.get("amount") || "0", 10);
  const countryParam = params.get("country") || "";
  const redirectParam = params.get("redirect") || "";
  const referenceParam = params.get("ref") || "";
  const completeParam = params.get("omnipay_status") === "complete";

  const [screen, setScreen] = useState<Screen>(completeParam ? "pending" : paymentLinkUniqueId ? "countries" : "operators");
  const [merchant, setMerchant] = useState<MerchantInfo | null>(null);
  const [country, setCountry] = useState(countryParam);
  const [amount, setAmount] = useState(Number.isFinite(amountParam) ? amountParam : 0);
  const [amountType, setAmountType] = useState<"fixed" | "flexible">("fixed");
  const [countrySearch, setCountrySearch] = useState("");
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [method, setMethod] = useState("");
  const [phone, setPhone] = useState(params.get("phone") || params.get("payerPhone") || "");
  const payerName = params.get("name") || params.get("payerName") || "";
  const [otp, setOtp] = useState("");
  const [sendavaOtp, setSendavaOtp] = useState("");
  const [sendavaOtpRequired, setSendavaOtpRequired] = useState(false);
  const [sendavaProxyToken, setSendavaProxyToken] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [reference, setReference] = useState(referenceParam);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [confirmedAt, setConfirmedAt] = useState<Date | null>(completeParam ? new Date() : null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(3);
  const redirectRef = useRef(redirectParam);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currency = currencyForCountry(country);
  const dialCode = DIAL_CODES[country] || "+";
  const orangeOtpUssd = method === "Orange Money" ? ORANGE_OTP_USSD[country] : null;
  const needsPreOtp = Boolean(orangeOtpUssd);

  const formatAmount = (value: number) => value.toLocaleString("fr-FR");
  const visibleCountries = (merchant?.countries || []).filter((item) => {
    const label = COUNTRY_LABELS[item] || item;
    return `${label} ${DIAL_CODES[item] || ""}`.toLowerCase().includes(countrySearch.trim().toLowerCase());
  });

  const buildRedirectUrl = useCallback(() => {
    const raw = redirectRef.current;
    if (!raw || /^(javascript|data|vbscript):/i.test(raw.trim())) return null;
    try {
      const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const url = new URL(normalized);
      if (!["https:", "http:"].includes(url.protocol)) return null;
      url.searchParams.set("status", "success");
      url.searchParams.set("amount", String(amount));
      url.searchParams.set("ref", reference);
      return url.toString();
    } catch {
      return null;
    }
  }, [amount, reference]);

  const startPolling = useCallback((id: number) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/omnipay/payment/${id}/status`);
        const data = await response.json();
        if (data.status === "confirmed") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setConfirmedAt(new Date());
          setScreen("success");
        } else if (data.status === "failed") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setError("Le paiement n’a pas pu être confirmé. Veuillez réessayer.");
          setScreen("failed");
        }
      } catch {
        // Le polling continue : une coupure réseau temporaire ne doit pas annuler le paiement.
      }
    }, 5000);
  }, []);

  useEffect(() => () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
  }, []);

  useEffect(() => {
    if (completeParam && referenceParam) {
      setLoading(true);
      fetch(`/api/payment/by-ref/${encodeURIComponent(referenceParam)}`)
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || "Paiement introuvable");
          setAmount(data.amount);
          setCountry(data.country);
          setReference(data.omnipayReference || referenceParam);
          setPaymentId(data.paymentId || null);
          setMerchant({
            name: data.merchantName || "RobotPay",
            slug: "",
            countries: data.country ? [data.country] : [],
          });
          if (data.redirectUrl) redirectRef.current = data.redirectUrl;
          if (["confirmed", "omnipay_confirmed"].includes(data.status)) {
            setConfirmedAt(new Date());
            setScreen("success");
          } else if (["failed", "omnipay_failed", "omnipay_error"].includes(data.status)) {
            setError("Le paiement n’a pas pu être confirmé. Veuillez réessayer.");
            setScreen("failed");
          } else {
            setScreen("pending");
            if (data.paymentId) startPolling(data.paymentId);
          }
        })
        .catch((caught) => setError(sanitizePaymentMessage(caught.message, "Paiement introuvable")))
        .finally(() => setLoading(false));
      return;
    }

    if (paymentLinkUniqueId) {
      setLoading(true);
      fetch(`/api/payment-link/${encodeURIComponent(paymentLinkUniqueId)}`)
        .then(async (response) => {
          const data = await response.json() as PaymentLinkInfo & { message?: string };
          if (!response.ok) throw new Error(data.message || "Lien de paiement introuvable");
          if (data.link.bank !== "bank2") {
            throw new Error("Ce lien utilise Bank 1 et doit être ouvert sur westpay.cfd.");
          }
          setMerchant({
            name: data.merchantName,
            slug: data.merchantSlug,
            countries: data.countries,
          });
          setAmountType(data.link.amountType === "flexible" ? "flexible" : "fixed");
          setAmount(data.link.amount || 0);
          if (data.link.redirectUrl) redirectRef.current = data.link.redirectUrl;
          setScreen("countries");
        })
        .catch((caught) => setError(sanitizePaymentMessage(caught.message, "Page de paiement indisponible")))
        .finally(() => setLoading(false));
      return;
    }

    if (!merchantSlug || !countryParam || !amountParam || amountParam <= 0) {
      setError("Le marchand, le pays et le montant doivent être fournis par le site marchand.");
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`/api/payment/${encodeURIComponent(merchantSlug)}/info`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Marchand introuvable");
        const info = data.merchant as MerchantInfo;
        const matchedCountry = info.countries.find(
          (item) => item.toLowerCase() === countryParam.toLowerCase(),
        );
        if (!matchedCountry) throw new Error("Ce pays n’est pas activé pour ce marchand.");
        setMerchant(info);
        setCountry(matchedCountry);
        setScreen("operators");
      })
      .catch((caught) => setError(sanitizePaymentMessage(caught.message, "Page de paiement indisponible")))
      .finally(() => setLoading(false));
  }, [amountParam, completeParam, countryParam, merchantSlug, paymentLinkUniqueId, referenceParam, startPolling]);

  useEffect(() => {
    if (!country || completeParam) return;
    setMethods([]);
    fetch(`/api/public/payment-methods/${encodeURIComponent(country)}?type=api`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.methods)) throw new Error();
        setMethods(
          data.methods
            .map((item: string | { name: string }) => ({
              name: typeof item === "string" ? item : item.name,
            }))
            .filter((item: PaymentMethod) => item.name),
        );
      })
      .catch(() => {
        setMethods((FALLBACK_METHODS[country] || []).map((name) => ({ name })));
      });
  }, [completeParam, country]);

  useEffect(() => {
    if (screen !== "success") return;
    setCountdown(3);
    const target = buildRedirectUrl();
    const timer = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          if (target) window.location.replace(target);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [buildRedirectUrl, screen]);

  const initiatePayment = async () => {
    if (!method || !phone.trim() || amount <= 0 || !merchant?.slug) return;
    if (needsPreOtp && !otp.trim()) {
      setError("Le code OTP est requis pour cet opérateur.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/payment/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantSlug: merchant.slug,
          country,
          amount,
          payerPhone: phone.trim(),
          payerName: payerName.trim(),
          paymentMethod: method,
          redirectUrl: redirectRef.current || null,
          firstName: "Client",
          lastName: "RobotPay",
          operator: method.toLowerCase().includes("wave") ? "wave" : undefined,
          otp: needsPreOtp ? otp.trim() : undefined,
          paymentLinkUniqueId: paymentLinkUniqueId || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Échec de l’initiation du paiement");

      setPaymentId(data.paymentId);
      setReference(data.omnipayReference || data.reference || "");
      setPaymentUrl(data.paymentUrl || null);
      if (data.proxyToken) setSendavaProxyToken(data.proxyToken);

      if (data.sendavapay && data.requiresOtp) {
        setSendavaOtpRequired(true);
        setScreen("otp");
      } else {
        setScreen("pending");
        if (data.paymentId) startPolling(data.paymentId);
      }
    } catch (caught: any) {
      setError(sanitizePaymentMessage(caught.message, "Une erreur est survenue."));
    } finally {
      setSubmitting(false);
    }
  };

  const submitSendavaOtp = async () => {
    if (!sendavaOtpRequired || sendavaOtp.trim().length < 4) return;
    setSubmitting(true);
    setError("");
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (sendavaProxyToken) headers["X-Sp-Proxy-Token"] = sendavaProxyToken;
      const response = await fetch("/api/sendavapay/proxy/v1/submit-otp", {
        method: "POST",
        headers,
        body: JSON.stringify({ otp: sendavaOtp.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Code OTP invalide");
      setSendavaOtpRequired(false);
      setScreen("pending");
      if (paymentId) startPolling(paymentId);
    } catch (caught: any) {
      setError(sanitizePaymentMessage(caught.message, "Code OTP invalide"));
    } finally {
      setSubmitting(false);
    }
  };

  const retry = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setError("");
    setOtp("");
    setSendavaOtp("");
    setSendavaOtpRequired(false);
    setPaymentUrl(null);
    setScreen("phone");
  };

  if (loading) {
    return (
      <div className="bank2-page bank2-center">
        <Loader2 className="bank2-spin" size={44} color="#fff" />
      </div>
    );
  }

  if (error && !merchant && screen !== "success") {
    return (
      <div className="bank2-page bank2-center">
        <div className="bank2-card bank2-error-card">
          <div className="bank2-error-icon"><X size={34} /></div>
          <h1>Page de paiement indisponible</h1>
          <p>{error}</p>
        </div>
        <Bank2Styles />
      </div>
    );
  }

  return (
    <div className="bank2-page">
      <Bank2Styles />
      <main className="bank2-shell">
        <header className="bank2-amount">
          <span>Montant :</span>
          <strong>{amount > 0 ? formatAmount(amount) : "—"} <small>{currency}</small></strong>
        </header>

        {screen === "countries" ? (
          <section className="bank2-country-card">
            <h1>Sélectionnez votre pays</h1>
            <p>Choisissez le pays depuis lequel vous souhaitez effectuer le paiement.</p>

            <div className="bank2-country-search">
              <Search size={20} />
              <input
                type="search"
                value={countrySearch}
                onChange={(event) => setCountrySearch(event.target.value)}
                placeholder="Rechercher un pays ou un indicatif"
                aria-label="Rechercher un pays"
                data-testid="bank2-country-search"
              />
            </div>

            <div className="bank2-country-list">
              {visibleCountries.length === 0 ? (
                <div className="bank2-country-empty">Aucun pays ne correspond à votre recherche.</div>
              ) : visibleCountries.map((item) => (
                <button
                  type="button"
                  className="bank2-country"
                  key={item}
                  onClick={() => {
                    setCountry(item);
                    setMethod("");
                    setError("");
                    setScreen("operators");
                  }}
                  data-testid={`bank2-country-${item.replace(/[\s']/g, "-").toLowerCase()}`}
                >
                  <span className="bank2-country-flag">{COUNTRY_FLAGS[item] || "🌍"}</span>
                  <span className="bank2-country-name">{COUNTRY_LABELS[item] || item}</span>
                  <span className="bank2-country-code">{DIAL_CODES[item] || ""}</span>
                  <ChevronRight size={23} />
                </button>
              ))}
            </div>
          </section>
        ) : screen === "operators" ? (
          <section className="bank2-operator-section">
            <div className="bank2-operator-heading">
              {paymentLinkUniqueId && (
                <button type="button" onClick={() => setScreen("countries")} aria-label="Changer de pays">
                  <ChevronLeft size={23} />
                </button>
              )}
              <h1>Sélectionnez le mode de paiement :</h1>
            </div>
            {amountType === "flexible" && (
              <label className="bank2-flexible-amount bank2-flexible-amount-on-blue">
                <span>Montant du paiement en {currency}</span>
                <div>
                  <input
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={amount || ""}
                    onChange={(event) => setAmount(Math.max(0, Number.parseInt(event.target.value || "0", 10) || 0))}
                    placeholder="Entrez le montant"
                    data-testid="bank2-link-amount"
                  />
                  <strong>{currency}</strong>
                </div>
              </label>
            )}
            <div className="bank2-operator-list">
              {methods.length === 0 ? (
                <div className="bank2-empty">Aucun opérateur disponible pour ce pays.</div>
              ) : methods.map((item) => (
                <button
                  type="button"
                  className="bank2-operator"
                  key={item.name}
                  disabled={amountType === "flexible" && amount <= 0}
                  onClick={() => {
                    setMethod(item.name);
                    setScreen("phone");
                  }}
                  data-testid={`bank2-operator-${item.name.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  <span>{item.name}</span>
                  <ChevronRight size={28} />
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="bank2-card">
            <Stepper screen={screen} />

            {screen === "phone" && (
              <div className="bank2-content">
                <div className="bank2-notice">
                  Veuillez sélectionner la même option que votre méthode de transfert.
                </div>
                <label className="bank2-label" htmlFor="bank2-phone">
                  Veuillez entrer votre numéro de téléphone :
                </label>
                <div className="bank2-phone-input">
                  <span><Phone size={18} /> {dialCode}</span>
                  <input
                    id="bank2-phone"
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value.replace(/[^\d\s]/g, ""))}
                    placeholder={PHONE_PLACEHOLDERS[country] || "Numéro de téléphone"}
                    data-testid="bank2-phone"
                  />
                </div>

                <p className="bank2-label bank2-method-label">Méthode de transfert</p>
                <div className="bank2-selected-method">
                  <span className="bank2-radio" />
                  <strong>{method}</strong>
                </div>

                {needsPreOtp && (
                  <div className="bank2-otp-block">
                    <div className="bank2-otp-help">
                      <strong>Pour obtenir votre code OTP :</strong>
                      <span>
                        Composez <code>{orangeOtpUssd}</code> sur votre téléphone Orange Money,
                        puis saisissez le code reçu ci-dessous.
                      </span>
                    </div>
                    <label className="bank2-label" htmlFor="bank2-pre-otp">Code OTP</label>
                    <input
                      id="bank2-pre-otp"
                      type="text"
                      inputMode="numeric"
                      maxLength={8}
                      value={otp}
                      onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                      placeholder="Entrez le code OTP"
                      data-testid="bank2-pre-otp"
                    />
                  </div>
                )}

                {error && <p className="bank2-inline-error">{error}</p>}

                <div className="bank2-actions">
                  <button type="button" className="bank2-button secondary" onClick={() => setScreen("operators")}>
                    <ChevronLeft size={22} /> Retour
                  </button>
                  <button
                    type="button"
                    className="bank2-button primary"
                    onClick={initiatePayment}
                    disabled={submitting || !phone.trim() || (needsPreOtp && !otp.trim())}
                  >
                    {submitting ? <Loader2 className="bank2-spin" size={20} /> : <>Suivant <ChevronRight size={18} /></>}
                  </button>
                </div>
              </div>
            )}

            {screen === "otp" && (
              <div className="bank2-content bank2-state">
                <ShieldCheck className="bank2-shield bank2-pulse" size={82} />
                <h2>Confirmation du paiement</h2>
                <p>Saisissez le code OTP reçu sur votre téléphone.</p>
                <input
                  className="bank2-otp-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  value={sendavaOtp}
                  onChange={(event) => setSendavaOtp(event.target.value.replace(/\D/g, ""))}
                  placeholder="••••••"
                  data-testid="bank2-sendava-otp"
                />
                {error && <p className="bank2-inline-error">{error}</p>}
                <button
                  type="button"
                  className="bank2-button primary wide"
                  onClick={submitSendavaOtp}
                  disabled={submitting || sendavaOtp.length < 4}
                >
                  {submitting ? <Loader2 className="bank2-spin" size={20} /> : "Confirmer"}
                </button>
              </div>
            )}

            {screen === "pending" && (
              <div className="bank2-content bank2-state">
                <ShieldCheck className="bank2-shield bank2-pulse" size={88} />
                <h2>Paiement en cours de confirmation</h2>
                <p>Validez la demande sur votre téléphone. La page se met à jour automatiquement.</p>
                {paymentUrl && (
                  <a
                    className="bank2-button primary wide bank2-link"
                    href={paymentUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => paymentId && startPolling(paymentId)}
                  >
                    <ExternalLink size={18} /> Ouvrir la page de paiement
                  </a>
                )}
              </div>
            )}

            {screen === "failed" && (
              <div className="bank2-content bank2-state">
                <div className="bank2-error-icon"><X size={34} /></div>
                <h2>Paiement non confirmé</h2>
                <p>{error}</p>
                <button type="button" className="bank2-button primary wide" onClick={retry}>
                  <RefreshCw size={18} /> Réessayer
                </button>
              </div>
            )}

            {screen === "success" && (
              <div className="bank2-content bank2-success">
                <h2>ROBOTPAY</h2>
                <div className="bank2-divider" />
                <div className="bank2-success-amount">{formatAmount(amount)} {currency}</div>
                <div className="bank2-check-circle"><Check size={70} strokeWidth={2.5} /></div>
                <h3>Votre paiement a été approuvé</h3>
                <div className="bank2-details">
                  {phone && <p><strong>Payeur :</strong> {phone}</p>}
                  {reference && <p><strong>ID Transaction :</strong> {reference}</p>}
                  <p><strong>Date Paiement :</strong> {(confirmedAt || new Date()).toLocaleString("fr-FR")}</p>
                </div>
                {buildRedirectUrl() && (
                  <>
                    <a className="bank2-button success wide bank2-link" href={buildRedirectUrl() || "#"}>
                      Retour au site marchand
                    </a>
                    <p className="bank2-countdown">Redirection automatique dans {countdown} seconde{countdown > 1 ? "s" : ""}…</p>
                  </>
                )}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function Bank2Styles() {
  return (
    <style>{`
      @keyframes bank2-spin{to{transform:rotate(360deg)}}
      @keyframes bank2-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.06);opacity:.72}}
      @keyframes bank2-pop{0%{transform:scale(.45);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
      .bank2-spin{animation:bank2-spin 1s linear infinite}
      .bank2-pulse{animation:bank2-pulse 1.8s ease-in-out infinite}
      .bank2-page{min-height:100vh;background:#4b91e8;color:#151515;font-family:Arial,Helvetica,sans-serif;padding:0 16px 48px}
      .bank2-center{display:flex;align-items:center;justify-content:center}
      .bank2-shell{width:100%;max-width:600px;margin:0 auto}
      .bank2-amount{color:#fff;padding:30px 34px 26px;position:relative}
      .bank2-amount>span{display:block;font-size:26px;font-weight:400;margin-bottom:2px}
      .bank2-amount>strong{font-size:50px;line-height:1;font-weight:700;letter-spacing:.01em}
      .bank2-amount small{font-size:.55em;font-weight:400}
      .bank2-country-card{background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 26px rgba(20,68,112,.18);padding:28px}
      .bank2-country-card h1{font-size:25px;color:#183b5b;margin:0 0 7px}
      .bank2-country-card>p{font-size:15px;color:#718096;margin:0 0 22px;line-height:1.45}
      .bank2-country-search{height:52px;border:1.5px solid #d8e2ec;background:#f8fafc;border-radius:12px;display:flex;align-items:center;padding:0 15px;gap:10px;color:#8ca0b3;margin-bottom:16px}
      .bank2-country-search:focus-within{border-color:#4b91e8;box-shadow:0 0 0 3px rgba(75,145,232,.12);background:#fff}
      .bank2-country-search input{border:0;outline:0;background:transparent;flex:1;min-width:0;font-size:16px;color:#243b53}
      .bank2-country-list{display:flex;flex-direction:column;border:1px solid #e5edf4;border-radius:13px;overflow:hidden}
      .bank2-country{border:0;border-bottom:1px solid #e8eef4;background:#fff;min-height:68px;padding:0 17px;display:grid;grid-template-columns:42px 1fr auto 24px;gap:10px;align-items:center;text-align:left;cursor:pointer;color:#183b5b}
      .bank2-country:last-child{border-bottom:0}.bank2-country:hover{background:#f2f8ff}.bank2-country:disabled{opacity:.48;cursor:not-allowed}
      .bank2-country-flag{font-size:27px}.bank2-country-name{font-size:17px;font-weight:700}.bank2-country-code{font-size:15px;color:#6b7f91;font-weight:600}.bank2-country svg{color:#a8b6c3}
      .bank2-country-empty{padding:26px 18px;text-align:center;color:#7c8d9d}
      .bank2-flexible-amount{display:block;margin-bottom:18px}.bank2-flexible-amount>span{display:block;font-size:14px;font-weight:700;color:#34495e;margin-bottom:7px}
      .bank2-flexible-amount>div{height:54px;border:1.5px solid #d8e2ec;border-radius:12px;display:flex;align-items:center;overflow:hidden}
      .bank2-flexible-amount input{border:0;outline:0;flex:1;min-width:0;height:100%;padding:0 15px;font-size:18px}.bank2-flexible-amount strong{padding:0 15px;color:#4b91e8}
      .bank2-flexible-amount-on-blue>span{color:#fff}.bank2-flexible-amount-on-blue>div{background:#fff;border-color:#fff}
      .bank2-operator-heading{display:flex;align-items:flex-start;gap:9px;margin:0 4px 25px}.bank2-operator-heading h1{margin:0;flex:1}
      .bank2-operator-heading button{width:36px;height:36px;border:1px solid rgba(255,255,255,.5);background:rgba(255,255,255,.14);color:#fff;border-radius:10px;display:flex;align-items:center;justify-content:center;cursor:pointer}
      .bank2-operator-section h1{font-size:26px;color:#fff;font-weight:400;margin:0 4px 30px}
      .bank2-operator-list{display:flex;flex-direction:column;gap:16px}
      .bank2-operator{width:100%;min-height:86px;border:0;border-radius:14px;background:#fff;padding:0 26px;display:flex;align-items:center;justify-content:space-between;color:#18507d;font-size:24px;font-weight:700;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.13);transition:transform .12s,box-shadow .12s}
      .bank2-operator:hover{transform:translateY(-1px);box-shadow:0 5px 16px rgba(0,0,0,.15)}
      .bank2-operator:active{transform:scale(.985)}
      .bank2-operator:disabled{opacity:.55;cursor:not-allowed;transform:none}
      .bank2-operator svg{color:#a8adb2}
      .bank2-empty{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.4);border-radius:14px;color:#fff;padding:20px;text-align:center}
      .bank2-card{background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.12)}
      .bank2-error-card{width:min(440px,100%);padding:36px;text-align:center}
      .bank2-error-card h1{font-size:22px;margin:18px 0 8px}.bank2-error-card p{color:#667085;line-height:1.5}
      .bank2-stepper{display:grid;grid-template-columns:repeat(3,1fr);padding:32px 26px 20px;position:relative}
      .bank2-stepper:before{content:"";position:absolute;height:2px;background:#d7dde5;left:22%;right:22%;top:59px}
      .bank2-step-wrap{display:flex;align-items:center;flex-direction:column;gap:9px;position:relative;z-index:1;text-align:center;color:#a5abb4;font-size:13px;line-height:1.15}
      .bank2-step{width:54px;height:54px;border-radius:50%;border:2px solid #d1d5dc;background:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#9aa2ad}
      .bank2-step.active,.bank2-step.complete{border-color:#69b4d2;color:#0879b2}.bank2-step-wrap span.current{color:#0879b2}
      .bank2-content{padding:12px 30px 30px}
      .bank2-notice{background:#ffe2a3;color:#d45a24;padding:13px 16px;font-size:16px;line-height:1.3;margin-bottom:24px}
      .bank2-label{display:block;font-size:17px;font-weight:700;margin-bottom:12px}
      .bank2-phone-input{height:62px;border:1px solid #d6d8dc;border-radius:12px;display:flex;align-items:center;overflow:hidden;margin-bottom:24px}
      .bank2-phone-input>span{height:100%;display:flex;align-items:center;gap:5px;padding:0 14px;color:#5d6672;border-right:1px solid #dfe1e4;font-weight:600;white-space:nowrap}
      .bank2-phone-input input{min-width:0;flex:1;height:100%;border:0;outline:0;padding:0 14px;font-size:18px}
      .bank2-method-label{margin-bottom:12px}
      .bank2-selected-method{display:flex;align-items:center;gap:12px;font-size:19px;color:#565d66;margin-bottom:24px}
      .bank2-radio{width:22px;height:22px;border-radius:50%;border:7px solid #2d9fe4;background:#fff}
      .bank2-otp-block{margin-bottom:20px}.bank2-otp-block input,.bank2-otp-input{width:100%;border:1px solid #d6d8dc;border-radius:12px;padding:14px;font-size:18px;outline:0}
      .bank2-otp-help{background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 14px;margin-bottom:16px;color:#92400e;font-size:14px;line-height:1.45}
      .bank2-otp-help strong{display:block;color:#c2410c;margin-bottom:5px}.bank2-otp-help span{display:block}
      .bank2-otp-help code{display:inline-block;background:#fff;border:1px solid #fdba74;border-radius:6px;padding:2px 7px;margin:0 2px;color:#c2410c;font-weight:800;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
      .bank2-otp-input{text-align:center;font-size:25px;letter-spacing:.28em;max-width:320px}
      .bank2-inline-error{background:#fef2f2;border:1px solid #fecaca;color:#b42318;padding:10px 12px;border-radius:9px;margin:0 0 18px;font-size:14px}
      .bank2-actions{display:grid;grid-template-columns:1fr 1fr;gap:22px}
      .bank2-button{min-height:58px;border:0;border-radius:8px;padding:0 18px;display:inline-flex;align-items:center;justify-content:center;gap:7px;font-size:18px;font-weight:700;cursor:pointer;text-decoration:none}
      .bank2-button:disabled{opacity:.48;cursor:not-allowed}.bank2-button.primary{background:#78bde4;color:#fff}.bank2-button.secondary{background:#6fb4db;color:#fff}.bank2-button.success{background:#22c55e;color:#fff}
      .bank2-button.wide{width:100%;max-width:360px}.bank2-link{text-decoration:none}
      .bank2-state{text-align:center;display:flex;flex-direction:column;align-items:center;padding-top:24px;padding-bottom:38px}
      .bank2-state h2{font-size:23px;margin:20px 0 12px}.bank2-state>p{font-size:17px;color:#7a8089;line-height:1.5;margin:0 0 24px;max-width:470px}
      .bank2-shield{color:#43d47d}
      .bank2-error-icon{width:72px;height:72px;border-radius:50%;background:#fee2e2;color:#dc2626;display:flex;align-items:center;justify-content:center;margin:0 auto}
      .bank2-success{align-items:stretch;padding-top:14px}.bank2-success h2{font-size:26px;font-weight:400;margin:8px 0 16px}.bank2-divider{height:1px;background:#ddd}.bank2-success-amount{font-size:30px;margin:28px 0}
      .bank2-check-circle{width:128px;height:128px;background:#20c865;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;animation:bank2-pop .5s ease-out}
      .bank2-success h3{text-align:center;font-size:24px;font-weight:400;color:#4e535a;margin:0 0 24px}
      .bank2-details{background:#e7e8eb;border-radius:6px;padding:14px 16px;margin-bottom:20px;color:#414955}.bank2-details p{margin:6px 0;font-size:15px}
      .bank2-success>.bank2-button{margin:0 auto}.bank2-countdown{text-align:center;color:#6b7280;font-size:13px;margin:10px 0 0}
      @media(max-width:560px){
        .bank2-page{padding:0 15px 32px}.bank2-amount{padding:24px 26px 24px}.bank2-amount>span{font-size:20px}.bank2-amount>strong{font-size:42px}
        .bank2-country-card{padding:21px 16px;border-radius:15px}.bank2-country-card h1{font-size:22px}.bank2-country{padding:0 12px;grid-template-columns:38px 1fr auto 20px}.bank2-country-name{font-size:15px}.bank2-country-code{font-size:14px}.bank2-country-flag{font-size:24px}
        .bank2-operator-section h1{font-size:20px;margin-bottom:22px}.bank2-operator{min-height:68px;font-size:18px;padding:0 20px}
        .bank2-stepper{padding:26px 12px 18px}.bank2-stepper:before{top:51px}.bank2-step{width:48px;height:48px;font-size:18px}.bank2-step-wrap{font-size:11px}
        .bank2-content{padding:10px 22px 24px}.bank2-notice{font-size:14px}.bank2-label{font-size:15px}.bank2-actions{gap:14px}.bank2-button{font-size:16px;min-height:52px}
        .bank2-state h2{font-size:20px}.bank2-state>p{font-size:15px}.bank2-success h2{font-size:22px}.bank2-success h3{font-size:21px}
      }
    `}</style>
  );
}