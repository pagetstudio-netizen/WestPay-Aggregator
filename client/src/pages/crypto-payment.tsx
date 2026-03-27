import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, CheckCircle2, XCircle, Clock, Copy, RefreshCw, Bitcoin, AlertTriangle } from "lucide-react";
import QRCode from "react-qr-code";

type CryptoPaymentStatus = {
  trackId: string;
  status: string;
  amount: number;
  currency: string;
  payAmount?: number;
  payCurrency?: string;
  address?: string;
  network?: string;
  txHash?: string;
  expiredAt?: string;
  createdAt?: string;
  merchantName?: string;
  aggregatorName?: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any; bg: string; spin?: boolean }> = {
  new:         { label: "En attente de paiement", color: "#1976d2", icon: Clock,         bg: "#e3f2fd", spin: true },
  waiting:     { label: "En attente de paiement", color: "#1976d2", icon: Clock,         bg: "#e3f2fd", spin: true },
  confirming:  { label: "Confirmation en cours",  color: "#fb8c00", icon: RefreshCw,     bg: "#fff3e0", spin: true },
  paying:      { label: "Paiement reçu",          color: "#43a047", icon: RefreshCw,     bg: "#e8f5e9", spin: true },
  paid:        { label: "Paiement confirmé",       color: "#2e7d32", icon: CheckCircle2,  bg: "#e8f5e9" },
  expired:     { label: "Lien expiré",             color: "#757575", icon: XCircle,       bg: "#f5f5f5" },
  failed:      { label: "Paiement échoué",         color: "#c62828", icon: XCircle,       bg: "#ffebee" },
  refunded:    { label: "Remboursé",               color: "#6d4c41", icon: AlertTriangle, bg: "#efebe9" },
};

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
      style={{
        background: copied ? "#e8f5e9" : "#f0f4f8",
        color: copied ? "#2e7d32" : "#1976d2",
        border: `1px solid ${copied ? "#a5d6a7" : "#bbdefb"}`,
      }}
      data-testid="button-copy-address"
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copié !" : (label || "Copier")}
    </button>
  );
}

function CountdownTimer({ expiredAt }: { expiredAt: string }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(expiredAt).getTime() - Date.now()) / 1000));
      setRemaining(diff);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiredAt]);

  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  const isUrgent = remaining < 300;

  return (
    <div
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
      style={{
        background: isUrgent ? "#ffebee" : "#e3f2fd",
        color: isUrgent ? "#c62828" : "#1976d2",
      }}
    >
      <Clock className="w-3.5 h-3.5" />
      {remaining === 0 ? "Expiré" : `${m}m ${s.toString().padStart(2, "0")}s`}
    </div>
  );
}

export default function CryptoPaymentPage() {
  const pathParts = window.location.pathname.split("/");
  const trackId = pathParts[pathParts.length - 1] || "";

  const [data, setData] = useState<CryptoPaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!trackId) return;
    try {
      const [statusRes, infoRes] = await Promise.all([
        fetch(`/api/payment/crypto/${trackId}/status`),
        fetch(`/api/public/crypto-payment/${trackId}`),
      ]);
      if (!statusRes.ok) {
        const json = await statusRes.json();
        throw new Error(json.message || "Erreur de chargement");
      }
      const statusJson = await statusRes.json();
      const infoJson = infoRes.ok ? await infoRes.json() : {};
      setData({ ...infoJson, ...statusJson });
      setError(null);
      setLastRefresh(Date.now());

      const terminal = ["paid", "expired", "failed", "refunded"];
      if (terminal.includes(statusJson.status)) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [trackId]);

  useEffect(() => {
    if (!trackId) {
      setError("Identifiant de transaction manquant.");
      setLoading(false);
      return;
    }
    fetchStatus();
    pollingRef.current = setInterval(fetchStatus, 5000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchStatus, trackId]);

  const status = data?.status || "new";
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG["new"];
  const StatusIcon = cfg.icon;
  const isPending = !["paid", "expired", "failed", "refunded"].includes(status);
  const isPaid = status === "paid" || status === "paying";
  const isConfirmed = status === "paid";

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #0d1b2a 0%, #1a3a5c 50%, #0d1b2a 100%)" }}
    >
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}
          >
            <Bitcoin className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">WestPay Crypto</h1>
            {data?.merchantName && (
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                {data.merchantName}
              </p>
            )}
          </div>
        </div>

        {/* Card principal */}
        <div
          className="rounded-3xl overflow-hidden shadow-2xl"
          style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.12)" }}
        >

          {/* Status banner */}
          <div
            className="flex items-center gap-3 px-5 py-4"
            style={{ background: cfg.bg + "15", borderBottom: `1px solid ${cfg.color}30` }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: cfg.color + "25" }}
            >
              <StatusIcon className={`w-5 h-5 ${cfg.spin ? "animate-spin" : ""}`} style={{ color: cfg.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: cfg.color }}>{cfg.label}</p>
              <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.4)" }}>
                Réf : <span className="font-mono">{trackId.substring(0, 20)}...</span>
              </p>
            </div>
            {data?.expiredAt && isPending && <CountdownTimer expiredAt={data.expiredAt} />}
          </div>

          <div className="p-5 space-y-5">

            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center gap-3 py-10">
                <Loader2 className="w-10 h-10 animate-spin" style={{ color: "#f59e0b" }} />
                <p className="text-sm font-medium text-white/60">Chargement...</p>
              </div>
            )}

            {/* Erreur */}
            {!loading && error && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <XCircle className="w-12 h-12" style={{ color: "#ef4444" }} />
                <p className="text-sm font-semibold text-white/80">{error}</p>
                <button
                  onClick={fetchStatus}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                  style={{ background: "#f59e0b" }}
                >
                  Réessayer
                </button>
              </div>
            )}

            {/* Contenu principal */}
            {!loading && data && (
              <>
                {/* Montant */}
                <div className="text-center py-2">
                  <p className="text-xs font-bold uppercase tracking-widest mb-2 text-white/40">
                    Montant à payer
                  </p>
                  {data.payAmount && data.payCurrency ? (
                    <div className="space-y-1">
                      <p className="text-4xl font-bold text-white">
                        {data.payAmount} <span className="text-2xl font-semibold text-white/70">{data.payCurrency}</span>
                      </p>
                      <p className="text-sm text-white/50">
                        ≈ {data.amount} {data.currency}
                      </p>
                    </div>
                  ) : (
                    <p className="text-4xl font-bold text-white">
                      {data.amount} <span className="text-2xl font-semibold text-white/70">{data.currency}</span>
                    </p>
                  )}
                </div>

                {/* Adresse de paiement + QR code */}
                {data.address && isPending && (
                  <div className="space-y-4">
                    {/* QR Code */}
                    <div className="flex flex-col items-center">
                      <div
                        className="rounded-2xl p-4"
                        style={{ background: "#fff" }}
                      >
                        <QRCode
                          value={data.address}
                          size={160}
                          style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                          viewBox="0 0 256 256"
                        />
                      </div>
                      <p className="text-xs text-white/40 mt-2">Scannez avec votre wallet crypto</p>
                    </div>

                    {/* Infos réseau + adresse */}
                    <div
                      className="rounded-2xl p-4 space-y-3"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                    >
                      {data.network && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white/50">Réseau</span>
                          <span
                            className="text-xs font-bold px-2.5 py-1 rounded-full"
                            style={{ background: "#f59e0b20", color: "#f59e0b" }}
                          >
                            {data.network}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-xs font-semibold text-white/50 block mb-1.5">Adresse de dépôt</span>
                        <p
                          className="text-xs font-mono break-all rounded-xl p-3"
                          style={{ background: "rgba(255,255,255,0.08)", color: "#93c5fd" }}
                          data-testid="text-wallet-address"
                        >
                          {data.address}
                        </p>
                        <div className="flex justify-end mt-2">
                          <CopyButton value={data.address} label="Copier l'adresse" />
                        </div>
                      </div>
                    </div>

                    {/* Avertissement */}
                    <div
                      className="rounded-xl p-3 text-xs text-center"
                      style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.3)" }}
                    >
                      ⚠️ Envoyez <strong>exactement</strong> le montant indiqué sur le <strong>bon réseau</strong>.<br />
                      Toute erreur peut entraîner une perte définitive des fonds.
                    </div>
                  </div>
                )}

                {/* Paiement confirmé */}
                {isConfirmed && (
                  <div className="flex flex-col items-center gap-4 py-6 text-center">
                    <div
                      className="w-20 h-20 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(34,197,94,0.15)" }}
                    >
                      <CheckCircle2 className="w-12 h-12" style={{ color: "#22c55e" }} />
                    </div>
                    <div>
                      <p className="font-bold text-xl text-white">Paiement confirmé !</p>
                      <p className="text-sm text-white/50 mt-1">
                        Votre transaction a bien été confirmée sur la blockchain.
                      </p>
                    </div>
                    {data.txHash && (
                      <div
                        className="w-full rounded-xl p-3"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                      >
                        <p className="text-xs font-semibold text-white/50 mb-1">Hash de transaction</p>
                        <p className="text-xs font-mono break-all text-white/70" data-testid="text-tx-hash">
                          {data.txHash}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Confirmation en cours */}
                {status === "paying" && (
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(34,197,94,0.1)" }}
                    >
                      <RefreshCw className="w-9 h-9 animate-spin" style={{ color: "#22c55e" }} />
                    </div>
                    <p className="text-sm font-semibold text-white">Paiement reçu !</p>
                    <p className="text-xs text-white/50">En cours de confirmation sur la blockchain...</p>
                  </div>
                )}

                {/* Confirmation en cours (confirming) */}
                {status === "confirming" && !isPaid && (
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <RefreshCw className="w-10 h-10 animate-spin" style={{ color: "#fb8c00" }} />
                    <p className="text-sm font-semibold text-white">Confirmation en cours...</p>
                    <p className="text-xs text-white/50">Transaction détectée, en attente de confirmation réseau.</p>
                  </div>
                )}

                {/* Expiré / Échoué */}
                {(status === "expired" || status === "failed") && (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <XCircle className="w-14 h-14" style={{ color: status === "expired" ? "#9ca3af" : "#ef4444" }} />
                    <p className="text-sm font-semibold text-white/80">
                      {status === "expired"
                        ? "Ce lien de paiement a expiré."
                        : "Le paiement a échoué."}
                    </p>
                    <p className="text-xs text-white/40">
                      Veuillez contacter le marchand pour initier un nouveau paiement.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
          >
            <p className="text-xs text-white/30">
              Actualisé il y a {Math.round((Date.now() - lastRefresh) / 1000)}s
            </p>
            <button
              onClick={fetchStatus}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)" }}
              data-testid="button-refresh-status"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Actualiser
            </button>
          </div>
        </div>

        <p className="text-center text-xs mt-4 text-white/25">
          Propulsé par <span className="font-semibold text-white/40">WestPay</span> · Paiements sécurisés
        </p>
      </div>
    </div>
  );
}
