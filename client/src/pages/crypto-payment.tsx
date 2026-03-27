import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, CheckCircle2, XCircle, Clock, Copy, ExternalLink, RefreshCw, Bitcoin, AlertTriangle } from "lucide-react";

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
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any; bg: string }> = {
  new:         { label: "En attente de paiement", color: "#1976d2", icon: Clock,         bg: "#e3f2fd" },
  waiting:     { label: "En attente de paiement", color: "#1976d2", icon: Clock,         bg: "#e3f2fd" },
  confirming:  { label: "Confirmation en cours",  color: "#fb8c00", icon: RefreshCw,     bg: "#fff3e0" },
  paying:      { label: "Paiement reçu",          color: "#43a047", icon: RefreshCw,     bg: "#e8f5e9" },
  paid:        { label: "Paiement confirmé",       color: "#2e7d32", icon: CheckCircle2,  bg: "#e8f5e9" },
  expired:     { label: "Lien expiré",             color: "#757575", icon: XCircle,       bg: "#f5f5f5" },
  failed:      { label: "Paiement échoué",         color: "#c62828", icon: XCircle,       bg: "#ffebee" },
  refunded:    { label: "Remboursé",               color: "#6d4c41", icon: AlertTriangle, bg: "#efebe9" },
};

function QRCodeDisplay({ value }: { value: string }) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value) return;
    setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=000000&margin=10`);
  }, [value]);

  if (!qrUrl) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      <img
        src={qrUrl}
        alt="QR Code"
        width={180}
        height={180}
        className="rounded-xl shadow-md border-4 border-white"
        style={{ imageRendering: "pixelated" }}
        onError={() => setQrUrl(null)}
      />
      <p className="text-xs text-gray-400">Scannez avec votre wallet crypto</p>
    </div>
  );
}

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
      const res = await fetch(`/api/crypto/status/${trackId}`);
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.message || "Erreur de chargement");
      }
      const json = await res.json();
      setData(json);
      setError(null);
      setLastRefresh(Date.now());

      const terminal = ["paid", "expired", "failed", "refunded"];
      if (terminal.includes(json.status)) {
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
    pollingRef.current = setInterval(fetchStatus, 10000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchStatus, trackId]);

  const status = data?.status || "new";
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG["new"];
  const StatusIcon = cfg.icon;
  const isPending = !["paid", "expired", "failed", "refunded"].includes(status);
  const isPaid = status === "paid" || status === "paying";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: "#f0f4f8" }}>
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#1976d2" }}>
            <Bitcoin className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: "#1a237e" }}>WestPay Crypto</h1>
            <p className="text-xs" style={{ color: "#546e7a" }}>Paiement sécurisé par cryptomonnaie</p>
          </div>
        </div>

        {/* Card principal */}
        <div className="rounded-2xl shadow-xl overflow-hidden" style={{ background: "#fff" }}>

          {/* Status banner */}
          <div
            className="flex items-center gap-3 px-5 py-4"
            style={{ background: cfg.bg, borderBottom: `2px solid ${cfg.color}22` }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: cfg.color + "20" }}
            >
              <StatusIcon className={`w-5 h-5 ${isPending ? "animate-spin" : ""}`} style={{ color: cfg.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: cfg.color }}>{cfg.label}</p>
              <p className="text-xs truncate" style={{ color: "#78909c" }}>
                Réf : <span className="font-mono font-semibold">{trackId}</span>
              </p>
            </div>
            {data?.expiredAt && isPending && <CountdownTimer expiredAt={data.expiredAt} />}
          </div>

          <div className="p-5 space-y-5">

            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="w-10 h-10 animate-spin" style={{ color: "#1976d2" }} />
                <p className="text-sm font-medium" style={{ color: "#546e7a" }}>Chargement...</p>
              </div>
            )}

            {/* Erreur */}
            {!loading && error && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <XCircle className="w-12 h-12" style={{ color: "#c62828" }} />
                <p className="text-sm font-semibold" style={{ color: "#c62828" }}>{error}</p>
                <button
                  onClick={fetchStatus}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ background: "#1976d2" }}
                >
                  Réessayer
                </button>
              </div>
            )}

            {/* Contenu principal */}
            {!loading && data && (
              <>
                {/* Montant */}
                <div className="text-center">
                  <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#90a4ae" }}>
                    Montant à payer
                  </p>
                  {data.payAmount && data.payCurrency ? (
                    <div className="space-y-1">
                      <p className="text-4xl font-bold" style={{ color: "#1a237e" }}>
                        {data.payAmount} <span className="text-2xl font-semibold">{data.payCurrency}</span>
                      </p>
                      <p className="text-sm" style={{ color: "#78909c" }}>
                        ≈ {data.amount} {data.currency}
                      </p>
                    </div>
                  ) : (
                    <p className="text-4xl font-bold" style={{ color: "#1a237e" }}>
                      {data.amount} <span className="text-2xl font-semibold">{data.currency}</span>
                    </p>
                  )}
                </div>

                {/* Adresse de paiement */}
                {data.address && isPending && (
                  <div className="space-y-4">
                    <div className="flex flex-col items-center">
                      <QRCodeDisplay value={data.address} />
                    </div>
                    <div
                      className="rounded-xl p-4 space-y-2"
                      style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
                    >
                      {data.network && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold" style={{ color: "#546e7a" }}>Réseau</span>
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{ background: "#e3f2fd", color: "#1976d2" }}
                          >
                            {data.network}
                          </span>
                        </div>
                      )}
                      <div className="space-y-1">
                        <span className="text-xs font-semibold" style={{ color: "#546e7a" }}>Adresse de dépôt</span>
                        <div className="flex items-start gap-2">
                          <p
                            className="flex-1 text-xs font-mono break-all rounded-lg p-2.5"
                            style={{ background: "#e8f0fe", color: "#1565c0", border: "1px solid #bbdefb" }}
                            data-testid="text-wallet-address"
                          >
                            {data.address}
                          </p>
                        </div>
                        <div className="flex justify-end">
                          <CopyButton value={data.address} label="Copier l'adresse" />
                        </div>
                      </div>
                    </div>
                    <div
                      className="rounded-xl p-3 text-xs text-center"
                      style={{ background: "#fff8e1", color: "#f57f17", border: "1px solid #ffe082" }}
                    >
                      ⚠️ Envoyez <strong>exactement</strong> le montant indiqué sur le <strong>bon réseau</strong>.<br />
                      Toute erreur de montant ou réseau peut entraîner une perte définitive.
                    </div>
                  </div>
                )}

                {/* Confirmation de paiement */}
                {isPaid && (
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "#e8f5e9" }}>
                      <CheckCircle2 className="w-10 h-10" style={{ color: "#2e7d32" }} />
                    </div>
                    <div>
                      <p className="font-bold text-lg" style={{ color: "#2e7d32" }}>Paiement reçu !</p>
                      <p className="text-sm" style={{ color: "#546e7a" }}>
                        {status === "paying" ? "En cours de confirmation sur la blockchain..." : "Votre paiement a bien été confirmé."}
                      </p>
                    </div>
                    {data.txHash && (
                      <div className="w-full rounded-xl p-3" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                        <p className="text-xs font-semibold mb-1" style={{ color: "#546e7a" }}>Hash de transaction</p>
                        <p className="text-xs font-mono break-all" style={{ color: "#1565c0" }} data-testid="text-tx-hash">{data.txHash}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Expiré / Échoué */}
                {(status === "expired" || status === "failed") && (
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <XCircle className="w-12 h-12" style={{ color: status === "expired" ? "#757575" : "#c62828" }} />
                    <p className="text-sm font-medium" style={{ color: "#546e7a" }}>
                      {status === "expired"
                        ? "Ce lien de paiement a expiré. Veuillez contacter le marchand."
                        : "Le paiement a échoué. Veuillez contacter le marchand."}
                    </p>
                  </div>
                )}

                {/* Hash de transaction si payé */}
                {status === "paid" && data.txHash && (
                  <div className="w-full rounded-xl p-3" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: "#546e7a" }}>Hash de transaction</p>
                    <p className="text-xs font-mono break-all" style={{ color: "#1565c0" }} data-testid="text-tx-hash">{data.txHash}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}
          >
            <p className="text-xs" style={{ color: "#90a4ae" }}>
              Actualisé il y a {Math.round((Date.now() - lastRefresh) / 1000)}s
            </p>
            <button
              onClick={fetchStatus}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
              style={{ background: "#e3f2fd", color: "#1976d2" }}
              data-testid="button-refresh-status"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Actualiser
            </button>
          </div>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: "#90a4ae" }}>
          Propulsé par <span className="font-semibold">WestPay</span> · Paiements sécurisés en Afrique de l'Ouest
        </p>
      </div>
    </div>
  );
}
