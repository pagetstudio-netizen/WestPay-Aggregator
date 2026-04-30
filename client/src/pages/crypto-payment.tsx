import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, CheckCircle2, XCircle, Clock, Copy, Check, RefreshCw, AlertTriangle } from "lucide-react";
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
};

const STATUS_CFG: Record<string, { label: string; color: string; icon: any; spin?: boolean }> = {
  new:        { label: "En attente de paiement", color: "#1976d2", icon: Clock,        spin: true },
  waiting:    { label: "En attente de paiement", color: "#1976d2", icon: Clock,        spin: true },
  confirming: { label: "Confirmation en cours",  color: "#fb8c00", icon: RefreshCw,    spin: true },
  paying:     { label: "Paiement reçu",          color: "#43a047", icon: RefreshCw,    spin: true },
  paid:       { label: "Paiement confirmé ✓",    color: "#2e7d32", icon: CheckCircle2 },
  expired:    { label: "Lien expiré",             color: "#757575", icon: XCircle },
  failed:     { label: "Paiement échoué",         color: "#c62828", icon: XCircle },
  refunded:   { label: "Remboursé",               color: "#6d4c41", icon: AlertTriangle },
};

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}
      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
      style={{ background: copied ? "#dcfce7" : "#f0f4f8", color: copied ? "#166534" : "#1976d2", border: `1px solid ${copied ? "#bbf7d0" : "#bbdefb"}` }}
      data-testid="button-copy-address"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copié !" : "Copier"}
    </button>
  );
}

function Countdown({ expiredAt }: { expiredAt: string }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const upd = () => setRemaining(Math.max(0, Math.floor((new Date(expiredAt).getTime() - Date.now()) / 1000)));
    upd(); const t = setInterval(upd, 1000); return () => clearInterval(t);
  }, [expiredAt]);
  const m = Math.floor(remaining / 60), s = remaining % 60;
  const urgent = remaining < 300;
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: urgent ? "#ffebee" : "#e3f2fd", color: urgent ? "#c62828" : "#1976d2" }}>
      {remaining === 0 ? "Expiré" : `${m}m ${s.toString().padStart(2, "0")}s`}
    </span>
  );
}

export default function CryptoPaymentPage() {
  const pathParts = window.location.pathname.split("/");
  const trackId = pathParts[pathParts.length - 1] || "";

  const [data, setData] = useState<CryptoPaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      const terminal = ["paid", "expired", "failed", "refunded"];
      if (terminal.includes(statusJson.status)) {
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [trackId]);

  useEffect(() => {
    if (!trackId) { setError("Identifiant de transaction manquant."); setLoading(false); return; }
    fetchStatus();
    pollingRef.current = setInterval(fetchStatus, 5000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [fetchStatus, trackId]);

  useEffect(() => {
    document.title = data?.merchantName ? `Payer ${data.merchantName} — RobotPay` : "Paiement Crypto — RobotPay";
  }, [data?.merchantName]);

  const status = data?.status || "new";
  const cfg = STATUS_CFG[status] || STATUS_CFG["new"];
  const StatusIcon = cfg.icon;
  const isPending = !["paid", "expired", "failed", "refunded"].includes(status);
  const isPaid = status === "paid";
  const isTerminal = !isPending;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: "#00b050" }}>
      <style>{`
        .cpay-card { color: #1f2937; }
        .cpay-card input { color: #111827 !important; background-color: #ffffff !important; }
      `}</style>

      <div className="w-full max-w-[420px] px-4 py-3">
        {/* En-tête */}
        <div className="mb-2">
          <h1 className="text-white font-bold text-lg">RobotPay</h1>
          <p className="text-white/80 text-sm">Paiement sécurisé</p>
        </div>

        {/* Montant */}
        <div className="mb-3">
          <p className="text-white/80 text-xs">Montant :</p>
          {data ? (
            data.payAmount && data.payCurrency ? (
              <div>
                <p className="text-white font-bold text-3xl">
                  {data.payAmount}<span className="text-base ml-2">{data.payCurrency}</span>
                </p>
                <p className="text-white/70 text-sm">≈ {data.amount} {data.currency}</p>
              </div>
            ) : (
              <p className="text-white font-bold text-3xl">
                {data.amount}<span className="text-base ml-2">{data.currency}</span>
              </p>
            )
          ) : (
            <p className="text-white font-bold text-3xl opacity-60">—</p>
          )}
        </div>

        {/* Carte blanche */}
        <div className="bg-white rounded-lg p-4 cpay-card">

          {/* Statut */}
          <div className="flex items-center gap-2 py-2 px-3 rounded-xl mb-4" style={{ background: `${cfg.color}15`, border: `1px solid ${cfg.color}30` }}>
            <StatusIcon className={`w-5 h-5 shrink-0 ${cfg.spin && isPending ? "animate-spin" : ""}`} style={{ color: cfg.color }} />
            <p className="text-sm font-bold flex-1" style={{ color: cfg.color }}>{cfg.label}</p>
            {data?.expiredAt && isPending && <Countdown expiredAt={data.expiredAt} />}
          </div>

          {/* Chargement */}
          {loading && (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 className="w-10 h-10 animate-spin" style={{ color: "#00b050" }} />
              <p className="text-sm" style={{ color: "#6b7280" }}>Chargement...</p>
            </div>
          )}

          {/* Erreur */}
          {!loading && error && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <XCircle className="w-12 h-12" style={{ color: "#ef4444" }} />
              <p className="text-sm font-semibold" style={{ color: "#374151" }}>{error}</p>
              <button onClick={fetchStatus} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "#00b050" }}>
                Réessayer
              </button>
            </div>
          )}

          {/* Contenu */}
          {!loading && data && (
            <div className="space-y-4">

              {/* Infos réseau (si en attente) */}
              {data.network && isPending && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: "#374151" }}>Réseau</span>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "#fef3c7", color: "#92400e" }}>
                    {data.network}
                  </span>
                </div>
              )}

              {/* QR Code + adresse (si en attente et adresse disponible) */}
              {data.address && isPending && (
                <>
                  <div className="flex flex-col items-center">
                    <div className="rounded-xl p-3" style={{ background: "#fff", border: "1px solid #e5e7eb" }}>
                      <QRCode value={data.address} size={150} viewBox="0 0 256 256" />
                    </div>
                    <p className="text-xs mt-1.5" style={{ color: "#9ca3af" }}>Scannez avec votre wallet crypto</p>
                  </div>

                  <div className="rounded-xl p-3 space-y-2" style={{ background: "#f8fafc", border: "1px solid #e5e7eb" }}>
                    <p className="text-xs font-semibold" style={{ color: "#374151" }}>Adresse de dépôt</p>
                    <p className="text-xs font-mono break-all rounded-lg p-2" style={{ background: "#f0f9ff", color: "#1d4ed8" }} data-testid="text-wallet-address">
                      {data.address}
                    </p>
                    <div className="flex justify-end">
                      <CopyBtn value={data.address} />
                    </div>
                  </div>

                  <div className="rounded-xl p-3 text-xs text-center" style={{ background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" }}>
                    ⚠️ Envoyez <strong>exactement</strong> le montant indiqué sur le <strong>bon réseau</strong>. Toute erreur peut entraîner une perte définitive des fonds.
                  </div>
                </>
              )}

              {/* Confirmation en cours */}
              {(status === "confirming" || status === "paying") && (
                <div className="flex flex-col items-center gap-2 py-3 text-center">
                  <RefreshCw className="w-8 h-8 animate-spin" style={{ color: "#00b050" }} />
                  <p className="text-sm font-semibold" style={{ color: "#111827" }}>Transaction détectée !</p>
                  <p className="text-xs" style={{ color: "#6b7280" }}>Confirmation en cours sur la blockchain…</p>
                </div>
              )}

              {/* Paiement confirmé */}
              {isPaid && (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "#f0fdf4" }}>
                    <CheckCircle2 className="w-10 h-10" style={{ color: "#00b050" }} />
                  </div>
                  <div>
                    <p className="font-bold text-lg" style={{ color: "#111827" }}>Paiement confirmé !</p>
                    <p className="text-sm mt-1" style={{ color: "#6b7280" }}>Votre transaction a été confirmée sur la blockchain.</p>
                  </div>
                  {data.txHash && (
                    <div className="w-full rounded-xl p-3 text-left" style={{ background: "#f8fafc", border: "1px solid #e5e7eb" }}>
                      <p className="text-xs font-semibold mb-1" style={{ color: "#374151" }}>Hash de transaction</p>
                      <p className="text-xs font-mono break-all" style={{ color: "#6b7280" }} data-testid="text-tx-hash">{data.txHash}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Expiré / Échoué */}
              {(status === "expired" || status === "failed") && (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <XCircle className="w-12 h-12" style={{ color: status === "expired" ? "#9ca3af" : "#ef4444" }} />
                  <p className="text-sm font-semibold" style={{ color: "#374151" }}>
                    {status === "expired" ? "Ce lien a expiré." : "Le paiement a échoué."}
                  </p>
                  <p className="text-xs" style={{ color: "#9ca3af" }}>Contactez le marchand pour un nouveau lien.</p>
                </div>
              )}

              {/* Bouton actualiser */}
              {!isTerminal && (
                <div className="flex justify-end pt-1">
                  <button
                    onClick={fetchStatus}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
                    style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}
                    data-testid="button-refresh-status"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Actualiser
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 pt-3" style={{ borderTop: "1px solid #e5e7eb" }}>
            <p className="text-xs text-center" style={{ color: "#9ca3af" }}>
              Paiement sécurisé via RobotPay{data?.merchantName ? ` · ${data.merchantName}` : ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
