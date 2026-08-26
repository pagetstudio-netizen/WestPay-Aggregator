import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Check, Copy, CheckCircle2, XCircle, Clock, RefreshCw, AlertTriangle } from "lucide-react";
import QRCode from "react-qr-code";
import { useLanguage } from "@/lib/language";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { copyTextToClipboard } from "@/lib/clipboard";

type LinkInfo = {
  uniqueId: string;
  name: string;
  currency: string;
  amountType: string;
  amount: string | null;
  description: string | null;
  returnUrl: string | null;
  merchantName: string;
  merchantSlug: string;
};

type PaymentData = {
  trackId: string;
  address: string;
  network?: string;
  payAmount?: number;
  payCurrency: string;
  expiredAt?: string;
};

type StatusData = {
  status: string;
  txHash?: string;
  payAmount?: number;
  payCurrency?: string;
};

function CopyBtn({ value }: { value: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { copyTextToClipboard(value, { successTitle: t("copied") }).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {}); }}
      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
      style={{ background: copied ? "#dcfce7" : "#f0f4f8", color: copied ? "#166534" : "#1976d2", border: `1px solid ${copied ? "#bbf7d0" : "#bbdefb"}` }}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? t("copied") : t("copy")}
    </button>
  );
}

function Countdown({ expiredAt }: { expiredAt: string }) {
  const { t } = useLanguage();
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const upd = () => setRemaining(Math.max(0, Math.floor((new Date(expiredAt).getTime() - Date.now()) / 1000)));
    upd(); const t = setInterval(upd, 1000); return () => clearInterval(t);
  }, [expiredAt]);
  const m = Math.floor(remaining / 60), s = remaining % 60;
  const urgent = remaining < 300;
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: urgent ? "#ffebee" : "#e3f2fd", color: urgent ? "#c62828" : "#1976d2" }}>
      {remaining === 0 ? t("expired") : `${m}m ${s.toString().padStart(2, "0")}s`}
    </span>
  );
}

export default function CryptoLinkPage() {
  const { t, autoSetLangFromBrowser } = useLanguage();

  useEffect(() => {
    autoSetLangFromBrowser();
  }, [autoSetLangFromBrowser]);

  const [, params] = useRoute("/c/:uniqueId");
  const uniqueId = params?.uniqueId || "";

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [customAmount, setCustomAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [payment, setPayment] = useState<PaymentData | null>(null);
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const STATUS_CFG: Record<string, { label: string; color: string; icon: any; spin?: boolean }> = {
    new:        { label: t("cryptoStatusWaiting"), color: "#1976d2", icon: Clock, spin: true },
    waiting:    { label: t("cryptoStatusWaiting"), color: "#1976d2", icon: Clock, spin: true },
    confirming: { label: t("cryptoStatusConfirming"),  color: "#fb8c00", icon: RefreshCw, spin: true },
    paying:     { label: t("cryptoStatusPaying"),          color: "#43a047", icon: RefreshCw, spin: true },
    paid:       { label: t("cryptoStatusPaid"),    color: "#2e7d32", icon: CheckCircle2 },
    expired:    { label: t("cryptoStatusExpired"),             color: "#757575", icon: XCircle },
    failed:     { label: t("cryptoStatusFailed"),         color: "#c62828", icon: XCircle },
    refunded:   { label: t("cryptoStatusRefunded"),               color: "#6d4c41", icon: AlertTriangle },
  };

  const { data: link, isLoading, isError } = useQuery<LinkInfo>({
    queryKey: ["/api/crypto-link", uniqueId],
    queryFn: async () => {
      const res = await fetch(`/api/crypto-link/${uniqueId}`);
      if (!res.ok) throw new Error(t("cryptoLinkNotFound"));
      return res.json();
    },
    enabled: !!uniqueId,
    retry: false,
  });

  useEffect(() => {
    document.title = link ? `${t("payTitle")} ${link.merchantName} — RobotPay` : `${t("payTitle")} — RobotPay`;
  }, [link, t]);

  const pollStatus = useCallback(async (trackId: string) => {
    try {
      const res = await fetch(`/api/payment/crypto/${trackId}/status`);
      if (!res.ok) return;
      const data: StatusData = await res.json();
      setStatusData(data);
      if (["paid", "expired", "failed", "refunded"].includes(data.status)) {
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (payment?.trackId && step === 3) {
      pollStatus(payment.trackId);
      pollingRef.current = setInterval(() => pollStatus(payment.trackId), 5000);
      return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    }
  }, [payment?.trackId, step, pollStatus]);

  const isLibre = link?.amountType === "libre";
  const fixedAmount = link?.amount ? parseFloat(link.amount) : null;
  const displayAmount = isLibre ? (customAmount ? parseFloat(customAmount) : null) : fixedAmount;

  const handlePay = async () => {
    if (isLibre && (!customAmount || parseFloat(customAmount) <= 0)) {
      setError(t("payInvalidAmount")); return;
    }
    setError(""); setSubmitting(true);
    try {
      const body: any = {};
      if (isLibre) body.customAmount = parseFloat(customAmount);
      const res = await fetch(`/api/crypto-link/${uniqueId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t("payErrorGeneric"));
      setPayment(data);
      setStep(3);
    } catch (e: any) {
      setError(e.message || t("payErrorGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  const status = statusData?.status || "new";
  const cfg = STATUS_CFG[status] || STATUS_CFG["new"];
  const StatusIcon = cfg.icon;
  const isTerminal = ["paid", "expired", "failed", "refunded"].includes(status);
  const isPaid = status === "paid";

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#00b050" }}>
      <Loader2 className="w-10 h-10 animate-spin text-white" />
    </div>
  );

  if (isError || !link) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#00b050" }}>
      <div className="bg-white rounded-md p-6 max-w-sm w-full text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <span className="text-red-600 text-xl font-bold">!</span>
        </div>
        <h2 className="text-lg font-semibold" style={{ color: "#111827" }}>{t("cryptoLinkNotFound")}</h2>
        <p className="text-sm" style={{ color: "#6b7280" }}>{t("cryptoLinkInvalid")}</p>
      </div>
    </div>
  );

  const stepLabels = [t("cryptoStepInfo"), t("cryptoStepPayment")];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: "#00b050" }}>
      <style>{`
        .crypto-card { color: #1f2937; }
        .crypto-card input {
          color: #111827 !important; background-color: #ffffff !important;
          border-color: #d1d5db !important; -webkit-text-fill-color: #111827 !important;
        }
        .crypto-card input::placeholder { color: #9ca3af !important; -webkit-text-fill-color: #9ca3af !important; }
        .crypto-card input:focus { border-color: #00b050 !important; box-shadow: 0 0 0 2px rgba(0,176,80,0.15); outline: none; }
        .pay-btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; font-weight: 600; font-size: 0.875rem; border-radius: 0.375rem; padding: 0.625rem 1.5rem; border: none; cursor: pointer; transition: opacity 0.15s, transform 0.1s; }
        .pay-btn:active:not(:disabled) { transform: scale(0.97); }
        .pay-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .pay-btn-green { background-color: #00b050; color: #ffffff; }
        .pay-btn-green:hover:not(:disabled) { background-color: #009a45; }
      `}</style>

      <div className="w-full max-w-[420px] px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-white font-bold text-lg">RobotPay</h1>
            <p className="text-white/80 text-sm">{t("cryptoSecurePayment")}</p>
          </div>
          <LanguageSwitcher className="text-white" />
        </div>

        <div className="mb-3">
          <p className="text-white/80 text-xs">{t("amount")} :</p>
          {displayAmount !== null ? (
            <p className="text-white font-bold text-3xl">
              {displayAmount.toLocaleString(t("lang") === "zh" ? "zh-CN" : t("lang") === "fr" ? "fr-FR" : "en-US")}<span className="text-base ml-2">{link.currency}</span>
            </p>
          ) : (
            <p className="text-white font-bold text-2xl opacity-60">{t("cryptoFreeAmount")}</p>
          )}
        </div>

        <div className="bg-white rounded-lg p-4 crypto-card">
          {/* Barre de progression */}
          <div className="mb-2">
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#e5e7eb" }}>
              <div className="h-full rounded-full" style={{ width: step === 1 ? "50%" : "100%", backgroundColor: "#00b050", transition: "width 0.5s ease-in-out" }} />
            </div>
            <p className="text-xs text-right mt-1" style={{ color: "#9ca3af" }}>{t("cryptoStep")} {step === 1 ? 1 : 2} {t("cryptoOf")} 2</p>
          </div>

          {/* Indicateurs d'étapes */}
          <div className="flex items-center justify-around mb-4 px-2">
            {stepLabels.map((label, i) => {
              const sn = i + 1;
              const isActive = (step === 1 && sn === 1) || (step > 1 && sn === 2);
              const isDone = (step > 1 && sn === 1);
              return (
                <div key={sn} className="flex flex-col items-center relative" style={{ flex: 1 }}>
                  {i > 0 && <div className="absolute top-3 right-1/2 h-0.5" style={{ width: "100%", backgroundColor: isDone || isActive ? "#00b050" : "#d1d5db" }} />}
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2" style={{ borderColor: isActive || isDone ? "#00b050" : "#d1d5db", backgroundColor: isDone ? "#00b050" : "#ffffff", color: isDone ? "#ffffff" : isActive ? "#00b050" : "#9ca3af" }}>
                      {isDone ? <Check className="w-4 h-4" /> : sn}
                    </div>
                    <p className="text-xs text-center mt-1 leading-tight" style={{ color: isActive || isDone ? "#00b050" : "#9ca3af" }}>{label}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ─── Étape 1 : Informations ─── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold mb-0.5" style={{ color: "#374151" }}>{t("cryptoMerchant")}</p>
                <p className="text-base font-bold" style={{ color: "#111827" }}>{link.merchantName}</p>
              </div>
              <div>
                <p className="text-sm font-semibold mb-0.5" style={{ color: "#374151" }}>{t("cryptoPurpose")}</p>
                <p className="text-sm" style={{ color: "#4b5563" }}>{link.name}</p>
              </div>
              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: "#374151" }}>{t("cryptoCurrency")}</p>
                <span className="inline-block px-3 py-1 rounded-full text-sm font-bold" style={{ background: "#fff8e1", color: "#b45309" }}>{link.currency}</span>
              </div>
              {isLibre && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "#374151" }}>{t("cryptoAmountToPay")} ({link.currency})</label>
                  <input type="number" min="0.01" step="any" placeholder="ex: 10" value={customAmount} onChange={e => setCustomAmount(e.target.value)} className="w-full py-2 px-3 text-sm border rounded-md" data-testid="input-crypto-amount" />
                </div>
              )}
              {error && <div className="text-xs p-2 rounded-md" style={{ background: "#fef2f2", color: "#b91c1c" }}>{error}</div>}
              <button onClick={handlePay} disabled={submitting || (isLibre && !customAmount)} className="pay-btn pay-btn-green w-full" data-testid="btn-pay-crypto">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />{t("cryptoPreparing")}</> : t("cryptoPayNow")}
              </button>
            </div>
          )}

          {/* ─── Étape 3 : Paiement crypto inline ─── */}
          {step === 3 && payment && (
            <div className="space-y-4">
              {/* Statut */}
              <div className="flex items-center gap-2 py-2 px-3 rounded-xl" style={{ background: `${cfg.color}15`, border: `1px solid ${cfg.color}30` }}>
                <StatusIcon className={`w-5 h-5 shrink-0 ${cfg.spin && !isTerminal ? "animate-spin" : ""}`} style={{ color: cfg.color }} />
                <p className="text-sm font-bold flex-1" style={{ color: cfg.color }}>{cfg.label}</p>
                {payment.expiredAt && !isTerminal && <Countdown expiredAt={payment.expiredAt} />}
              </div>

              {/* Montant à envoyer */}
              {payment.payAmount && payment.payCurrency && !isPaid && (
                <div className="text-center py-2 rounded-xl" style={{ background: "#f8fafc" }}>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#9ca3af" }}>{t("cryptoExactAmount")}</p>
                  <p className="text-2xl font-bold" style={{ color: "#111827" }}>
                    {payment.payAmount} <span className="text-base font-medium" style={{ color: "#6b7280" }}>{payment.payCurrency}</span>
                  </p>
                  {payment.network && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full mt-1 inline-block" style={{ background: "#fef3c7", color: "#92400e" }}>
                      {t("cryptoNetwork")} : {payment.network}
                    </span>
                  )}
                </div>
              )}

              {/* QR Code + adresse (si pas encore payé) */}
              {!isPaid && !["expired", "failed"].includes(status) && (
                <>
                  {/* QR Code */}
                  <div className="flex flex-col items-center">
                    <div className="rounded-xl p-3" style={{ background: "#fff", border: "1px solid #e5e7eb" }}>
                      <QRCode value={payment.address} size={150} viewBox="0 0 256 256" />
                    </div>
                    <p className="text-xs mt-1.5" style={{ color: "#9ca3af" }}>{t("cryptoScanWallet")}</p>
                  </div>

                  {/* Adresse */}
                  <div className="rounded-xl p-3 space-y-2" style={{ background: "#f8fafc", border: "1px solid #e5e7eb" }}>
                    <p className="text-xs font-semibold" style={{ color: "#374151" }}>{t("cryptoDepositAddress")}</p>
                    <p className="text-xs font-mono break-all rounded-lg p-2" style={{ background: "#f0f9ff", color: "#1d4ed8" }} data-testid="text-wallet-address">
                      {payment.address}
                    </p>
                    <div className="flex justify-end">
                      <CopyBtn value={payment.address} />
                    </div>
                  </div>

                  {/* Avertissement */}
                  <div className="rounded-xl p-3 text-xs text-center" style={{ background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" }}>
                    {t("cryptoWarning")}
                  </div>
                </>
              )}

              {/* En cours de confirmation */}
              {(status === "confirming" || status === "paying") && (
                <div className="flex flex-col items-center gap-2 py-3 text-center">
                  <RefreshCw className="w-8 h-8 animate-spin" style={{ color: "#00b050" }} />
                  <p className="text-sm font-semibold" style={{ color: "#111827" }}>{t("cryptoStatusDetected")}</p>
                  <p className="text-xs" style={{ color: "#6b7280" }}>{t("cryptoStatusConfirmingBlockchain")}</p>
                </div>
              )}

              {/* Paiement confirmé */}
              {isPaid && (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "#f0fdf4" }}>
                    <CheckCircle2 className="w-10 h-10" style={{ color: "#00b050" }} />
                  </div>
                  <div>
                    <p className="font-bold text-lg" style={{ color: "#111827" }}>{t("cryptoStatusPaid")}</p>
                    <p className="text-sm mt-1" style={{ color: "#6b7280" }}>{t("cryptoPaidDesc")}</p>
                  </div>
                  {statusData?.txHash && (
                    <div className="w-full rounded-xl p-3 text-left" style={{ background: "#f8fafc", border: "1px solid #e5e7eb" }}>
                      <p className="text-xs font-semibold mb-1" style={{ color: "#374151" }}>{t("cryptoTxHash")}</p>
                      <p className="text-xs font-mono break-all" style={{ color: "#6b7280" }} data-testid="text-tx-hash">{statusData.txHash}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Expiré / Échoué */}
              {(status === "expired" || status === "failed") && (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <XCircle className="w-12 h-12" style={{ color: status === "expired" ? "#9ca3af" : "#ef4444" }} />
                  <p className="text-sm font-semibold" style={{ color: "#374151" }}>
                    {status === "expired" ? t("payLinkExpired") : t("payFailed")}
                  </p>
                  <p className="text-xs" style={{ color: "#9ca3af" }}>{t("payBackToMerchant")}</p>
                </div>
              )}

              {/* Actualiser */}
              {!isTerminal && (
                <div className="flex justify-end">
                  <button
                    onClick={() => payment?.trackId && pollStatus(payment.trackId)}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
                    style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> {t("refresh")}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 pt-3" style={{ borderTop: "1px solid #e5e7eb" }}>
            <p className="text-xs text-center" style={{ color: "#9ca3af" }}>{t("payTitle")} RobotPay · {link.currency}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

