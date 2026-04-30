import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Wallet, ArrowRightLeft, Key, Settings, LogOut, Loader2, Download,
  Copy, Globe, DollarSign, Hash, TrendingUp, Search, RefreshCw, BookOpen, Lock, ExternalLink,
  Webhook, Send, CheckCircle2, XCircle, Clock, ArrowUpRight, Zap, Link, QrCode, Eye, EyeOff,
  Trash2, Plus, ToggleLeft, ToggleRight, Edit3, BarChart3, MessageCircle, Phone, Receipt, User, Calendar, CreditCard, Filter,
  Bell, Mail, HelpCircle, Power, Menu, X, ChevronLeft, ChevronRight, Bitcoin
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { MerchantCountry, Transaction, WebhookLog, PaymentLink, WalletTransfer, WalletTransferCountry, Withdrawal } from "@shared/schema";
import { useLanguage, LANGUAGES } from "@/lib/language";

type MerchantTab = "overview" | "apikeys" | "webhook" | "virements" | "reversements" | "settings" | "paymentlinks" | "transactions" | "crypto" | "sdk";

function useMerchantFetch(url: string, key: string[], token: string | null) {
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erreur de chargement");
      return res.json();
    },
    enabled: !!token,
  });
}

function countryToCurrency(country: string): string {
  if (country === "Congo RDC") return "CDF";
  if (country === "Guinee") return "GNF";
  if (country === "Gambie") return "GMD";
  return "FCFA";
}

const COUNTRY_COLORS = [
  "#1976d2", "#26a69a", "#e57373", "#7e57c2",
  "#00897b", "#fb8c00", "#43a047", "#d81b60",
  "#039be5", "#6d4c41",
];

function BigStatCard({
  color, label, value, currency, sub, testId
}: {
  color: string; label: string; value: string; currency?: string; sub?: string; testId?: string;
}) {
  return (
    <div
      className="rounded-xl p-5 w-full"
      style={{ background: color }}
      data-testid={testId}
    >
      <p className="text-xs font-bold text-white/80 uppercase tracking-widest mb-2">{label}</p>
      <p className="text-3xl font-bold text-white leading-none">
        {value}{currency && <span className="text-xl font-semibold ml-2 text-white/90">{currency}</span>}
      </p>
      {sub && <p className="text-xs text-white/70 mt-2 font-medium">{sub}</p>}
    </div>
  );
}

function OverviewPanel({ token }: { token: string | null }) {
  const { t } = useLanguage();
  const { data: balance = [], isLoading: balLoading } = useMerchantFetch("/api/merchant/balance", ["/api/merchant/balance"], token);
  const { data: stats } = useMerchantFetch("/api/merchant/stats", ["/api/merchant/stats"], token);
  const { data: me } = useMerchantFetch("/api/merchant/me", ["/api/merchant/me"], token);

  if (balLoading) return <MerchantLoadingSkeleton />;

  const countries = balance as MerchantCountry[];
  const totalBalance = countries.reduce((sum, c) => sum + (c.balance || 0), 0);
  const activeCount = countries.filter(c => c.active).length;

  return (
    <div
      className="-m-4 md:-m-6 p-4 md:p-6 min-h-full"
      style={{ background: "#e8eaed" }}
    >
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <h2 className="text-xl font-bold" style={{ color: "#333" }}>{t("dashboard")}</h2>
        {(me as any)?.feeExempt && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-600 text-white">
            ✦ Zéro frais activé
          </span>
        )}
      </div>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>
        {t("balance")} / {t("reversements")}
      </p>
      <div className="flex flex-col gap-4 mb-6">
        <BigStatCard
          color="#1e88e5"
          label={t("balance")}
          value={totalBalance.toLocaleString("fr-FR")}
          currency="FCFA"
          sub={`${activeCount} pays actif${activeCount > 1 ? "s" : ""} — ${stats?.transactionCount || 0} transaction${(stats?.transactionCount || 0) > 1 ? "s" : ""}`}
          testId="text-total-balance"
        />
        <BigStatCard
          color="#26a69a"
          label={t("reversements")}
          value={(stats?.totalWithdrawn || 0).toLocaleString("fr-FR")}
          currency="FCFA"
          testId="text-total-withdrawn"
        />
      </div>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>
        {t("todayStats")}
      </p>
      <div className="flex flex-col gap-4 mb-6">
        <BigStatCard
          color="#ef5350"
          label={t("today")}
          value={(stats?.todayVolume || 0).toLocaleString("fr-FR")}
          currency="FCFA"
          testId="text-today-volume"
        />
        <BigStatCard
          color="#7e57c2"
          label={t("yesterday")}
          value={(stats?.yesterdayVolume || 0).toLocaleString("fr-FR")}
          currency="FCFA"
          testId="text-yesterday-volume"
        />
      </div>

      {countries.length > 0 && (
        <>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>
            {t("balanceByCountry")}
          </p>
          <div className="flex flex-col gap-4">
            {countries.map((c, idx) => (
              <div
                key={c.id}
                className={`rounded-xl p-5 transition-opacity ${!c.active ? "opacity-60" : ""}`}
                style={{ background: COUNTRY_COLORS[idx % COUNTRY_COLORS.length] }}
                data-testid={`text-balance-${c.country}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-white/80 uppercase tracking-widest">{c.country}</p>
                  {c.active ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500 text-white shadow-sm">
                      Actif
                    </span>
                  ) : (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500 text-white shadow-sm">
                      Désactivé
                    </span>
                  )}
                </div>
                <p className="text-3xl font-bold text-white leading-none">
                  {(c.balance ?? 0).toLocaleString("fr-FR")}<span className="text-xl font-semibold ml-2 text-white/90">{countryToCurrency(c.country)}</span>
                </p>
                {!c.active && (
                  <p className="text-xs text-white/60 mt-2">Ce pays est désactivé — non visible sur la page de paiement</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MerchantTransactionsPanel({ token }: { token: string | null }) {
  const { t } = useLanguage();
  const { data: transactions = [], isLoading } = useMerchantFetch("/api/merchant/transactions", ["/api/merchant/transactions"], token);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterProvider, setFilterProvider] = useState("all");

  if (isLoading) return <MerchantLoadingSkeleton />;

  const allTx = (transactions as (Transaction & { payerName?: string | null })[]);

  const filtered = allTx.filter((t) => {
    const term = searchTerm.toLowerCase();
    const matchSearch = !term || t.txId.toLowerCase().includes(term) || t.country.toLowerCase().includes(term) || (t.payerNumber || "").includes(term) || (t.payerName || "").toLowerCase().includes(term);
    const matchStatus = filterStatus === "all" || t.status === filterStatus;
    const matchProvider = filterProvider === "all" || t.provider === filterProvider;
    return matchSearch && matchStatus && matchProvider;
  });

  const downloadCSV = () => {
    const header = "TXID,Nom payeur,Numéro,Montant,Pays,Statut,Mode,Date\n";
    const rows = filtered.map((t) =>
      `${t.txId},"${(t as any).payerName || ""}",${t.payerNumber || ""},${t.amount},${t.country},${t.status},${t.provider},${new Date(t.createdAt).toLocaleString("fr-FR")}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "transactions.csv"; a.click();
  };

  const providerLabel = (p: string) => {
    if (p === "omnipay" || p === "mbiyo") return "Mobile Money";
    if (p === "sms") return "SMS";
    return p;
  };

  const confirmedTotal = allTx.filter(t => t.status === "confirmed" && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const confirmedCount = allTx.filter(t => t.status === "confirmed").length;
  const pendingCount = allTx.filter(t => t.status === "pending").length;

  return (
    <div className="-m-4 md:-m-6 p-4 md:p-6 min-h-full" style={{ background: "#e8eaed" }}>
      <div className="flex items-center justify-between gap-2 mb-5">
        <h2 className="text-xl font-bold" style={{ color: "#333" }}>{t("transactionHistory")}</h2>
        <button
          onClick={downloadCSV}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all"
          style={{ background: "#fff", border: "1.5px solid #e8ecf0", color: "#333" }}
          data-testid="button-merchant-export-csv"
        >
          <Download className="w-4 h-4" /> {t("exportCsv")}
        </button>
      </div>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>{t("summary")}</p>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl p-4" style={{ background: "#1976d2" }}>
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">{t("totalVolume")}</p>
          <p className="text-xl font-bold text-white">{confirmedTotal.toLocaleString("fr-FR")}<span className="text-xs ml-1 text-white/70">FCFA</span></p>
        </div>
        <div className="rounded-xl p-4" style={{ background: "#00b050" }}>
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">{t("confirmed")}</p>
          <p className="text-xl font-bold text-white">{confirmedCount}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: pendingCount > 0 ? "#fb8c00" : "#78909c" }}>
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">{t("pending")}</p>
          <p className="text-xl font-bold text-white">{pendingCount}</p>
        </div>
      </div>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>{t("filter")}</p>
      <div className="bg-white rounded-2xl p-3 mb-4 shadow-sm flex gap-2 flex-wrap" style={{ border: "1.5px solid #e8ecf0" }}>
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#aaa" }} />
          <input
            className="w-full rounded-xl pl-9 pr-3 py-2 text-sm outline-none"
            style={{ border: "1.5px solid #e2e8f0", background: "#f9fafb", color: "#1a1a1a" }}
            placeholder={t("searchTransactions")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-merchant-search-tx"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm outline-none"
          style={{ border: "1.5px solid #e2e8f0", background: "#f9fafb", color: "#333" }}
          data-testid="select-filter-status"
        >
          <option value="all">{t("allStatuses")}</option>
          <option value="confirmed">{t("confirmed")}</option>
          <option value="pending">{t("pending")}</option>
          <option value="failed">{t("failed")}</option>
        </select>
        <select
          value={filterProvider}
          onChange={(e) => setFilterProvider(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm outline-none"
          style={{ border: "1.5px solid #e2e8f0", background: "#f9fafb", color: "#333" }}
          data-testid="select-filter-provider"
        >
          <option value="all">{t("all")}</option>
          <option value="omnipay">Mobile Money</option>
          <option value="sms">SMS</option>
        </select>
      </div>

      {(searchTerm || filterStatus !== "all" || filterProvider !== "all") && (
        <p className="text-xs mb-2" style={{ color: "#888" }}>{filtered.length} résultat{filtered.length !== 1 ? "s" : ""}</p>
      )}

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>
        {t("recentTransactions")} — {allTx.length}
      </p>
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
            <CreditCard className="w-8 h-8 mx-auto mb-2" style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>{t("noTransactions")}</p>
          </div>
        ) : (
          filtered.map((tx) => {
            const isTransfer = tx.amount < 0 || tx.txId.startsWith("TR-");
            const txPayerName = (tx as any).payerName;
            const statusColor = tx.status === "confirmed" ? { bg: "#d4edda", color: "#155724" } : tx.status === "pending" ? { bg: "#fff3cd", color: "#856404" } : { bg: "#f8d7da", color: "#721c24" };
            return (
              <div key={tx.id} className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }} data-testid={`card-tx-${tx.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{ background: "#f0f4ff", color: "#3949ab" }} data-testid={`text-mtx-${tx.id}`}>{tx.txId}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: statusColor.bg, color: statusColor.color }}>
                        {tx.status === "confirmed" ? t("confirmed") : tx.status === "pending" ? t("pending") : t("failed")}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#f0f4ff", color: "#3949ab" }}>{tx.country}</span>
                      {isTransfer && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#fce4ec", color: "#c62828" }}>{t("transfers")}</span>}
                    </div>
                    {txPayerName && (
                      <p className="text-sm font-semibold mb-0.5" style={{ color: "#1a1a1a" }} data-testid={`text-payer-name-${tx.id}`}>{txPayerName}</p>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs" style={{ color: "#888" }}>
                      {tx.payerNumber && <span><Phone className="w-3 h-3 inline mr-0.5" /><span data-testid={`text-payer-number-${tx.id}`}>{tx.payerNumber}</span></span>}
                      <span><Calendar className="w-3 h-3 inline mr-0.5" /><span data-testid={`text-tx-date-${tx.id}`}>{new Date(tx.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></span>
                      <span style={{ color: "#1976d2", fontWeight: 600 }}>Validé par RobotPay</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold" style={{ color: isTransfer ? "#e53935" : "#00b050" }} data-testid={`text-tx-amount-${tx.id}`}>
                      {isTransfer ? "" : "+"}{tx.amount.toLocaleString("fr-FR")}
                    </p>
                    <p className="text-xs" style={{ color: "#aaa" }}>FCFA</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ApiKeysPanel({ token }: { token: string | null }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { data: apiKeys = [], isLoading } = useMerchantFetch("/api/merchant/api-keys", ["/api/merchant/api-keys"], token);

  const regenerateMutation = useMutation({
    mutationFn: async (merchantCountryId: number) => {
      const res = await fetch("/api/merchant/regenerate-api", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ merchantCountryId }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/api-keys"] });
      toast({ title: t("apiKey"), description: t("keyActive") });
    },
    onError: () => toast({ title: "Action non effectuée", description: "Une erreur est survenue. Veuillez réessayer.", variant: "destructive" }),
  });

  if (isLoading) return <MerchantLoadingSkeleton />;

  return (
    <div className="-m-4 md:-m-6 p-4 md:p-6 min-h-full" style={{ background: "#e8eaed" }}>
      <div className="flex items-center justify-between gap-2 mb-5">
        <div>
          <h2 className="text-xl font-bold" style={{ color: "#333" }}>{t("apiKeysTitle")}</h2>
          <p className="text-xs mt-0.5" style={{ color: "#888" }}>{t("apiKeysDesc")}</p>
        </div>
        <button
          onClick={() => window.open("/api-docs", "_blank")}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold"
          style={{ background: "#fff", border: "1.5px solid #e8ecf0", color: "#333" }}
          data-testid="button-open-api-docs"
        >
          <BookOpen className="w-4 h-4" /> {t("apiDocumentation")}
        </button>
      </div>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>
        {t("yourApiKeys")} — {(apiKeys as MerchantCountry[]).length}
      </p>
      <div className="space-y-3 mb-5">
        {(apiKeys as MerchantCountry[]).length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
            <Key className="w-8 h-8 mx-auto mb-2" style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>{t("noApiKeys")}</p>
          </div>
        ) : (
          (apiKeys as MerchantCountry[]).map((key, idx) => (
            <div key={key.id} className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: COUNTRY_COLORS[idx % COUNTRY_COLORS.length] }}>
                    <Key className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: "#1a1a1a" }}>{key.country}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: key.active ? "#d4edda" : "#f8d7da", color: key.active ? "#155724" : "#721c24" }}>
                      {key.active ? t("active") : t("inactive")}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (confirm(t("confirm"))) {
                      regenerateMutation.mutate(key.id);
                    }
                  }}
                  disabled={regenerateMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                  style={{ background: "#f0f4ff", color: "#3949ab", border: "1px solid #c5cae9" }}
                  data-testid={`button-regenerate-key-${key.id}`}
                >
                  {regenerateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  {t("reset")}
                </button>
              </div>
              <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "#f9fafb", border: "1px solid #e2e8f0" }}>
                <code className="text-xs font-mono flex-1 break-all" style={{ color: "#555" }} data-testid={`text-apikey-${key.id}`}>{key.apiKey}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(key.apiKey); toast({ title: t("copied") }); }}
                  className="p-1.5 rounded-lg shrink-0 transition-all hover:bg-gray-200"
                  style={{ color: "#888" }}
                  data-testid={`button-copy-key-${key.id}`}
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: "1.5px dashed #c5cae9" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#f0f4ff" }}>
            <BookOpen className="w-5 h-5" style={{ color: "#3949ab" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: "#1a1a1a" }}>{t("integrationGuide")}</p>
            <p className="text-xs" style={{ color: "#888" }}>{t("apiKeysDesc")}</p>
          </div>
          <button
            onClick={() => window.open("/api-docs", "_blank")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
            style={{ background: "#3949ab", color: "#fff", border: "none" }}
            data-testid="button-docs-link"
          >
            <ExternalLink className="w-3.5 h-3.5" /> {t("openLink")}
          </button>
        </div>
      </div>
    </div>
  );
}

function WebhookPanel({ token }: { token: string | null }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const { data: webhookData, isLoading } = useMerchantFetch("/api/merchant/webhook", ["/api/merchant/webhook"], token);
  const { data: logs = [], isLoading: logsLoading } = useMerchantFetch("/api/merchant/webhook/logs", ["/api/merchant/webhook/logs"], token);

  useEffect(() => {
    if (webhookData?.webhookUrl) setWebhookUrl(webhookData.webhookUrl);
  }, [webhookData]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/merchant/webhook", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ webhookUrl: webhookUrl.trim() }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || t("error")); }
      toast({ title: webhookUrl.trim() ? t("webhookSaved") : t("delete") });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/webhook"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/webhook/logs"] });
    } catch (err: any) {
      toast({ title: "Action non effectuée", description: "Une erreur est survenue. Veuillez réessayer.", variant: "destructive" });
    } finally { setIsSaving(false); }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const res = await fetch("/api/merchant/webhook/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) toast({ title: t("webhookTested"), description: `HTTP ${data.statusCode}` });
      else toast({ title: "Test non concluant", description: "Le webhook n'a pas répondu correctement. Vérifiez votre URL.", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/webhook/logs"] });
    } catch (err: any) {
      toast({ title: "Action non effectuée", description: "Une erreur est survenue. Veuillez réessayer.", variant: "destructive" });
    } finally { setIsTesting(false); }
  };

  const handleRemove = async () => {
    setWebhookUrl(""); setIsSaving(true);
    try {
      const res = await fetch("/api/merchant/webhook", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ webhookUrl: "" }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || t("error")); }
      toast({ title: t("delete") });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/webhook"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/webhook/logs"] });
    } catch (err: any) {
      toast({ title: "Action non effectuée", description: "Une erreur est survenue. Veuillez réessayer.", variant: "destructive" });
    } finally { setIsSaving(false); }
  };

  if (isLoading) return <MerchantLoadingSkeleton />;

  return (
    <div className="-m-4 md:-m-6 p-4 md:p-6 min-h-full" style={{ background: "#e8eaed" }}>
      <h2 className="text-xl font-bold mb-1" style={{ color: "#333" }}>{t("webhookTitle")}</h2>
      <p className="text-xs mb-5" style={{ color: "#888" }}>{t("webhookDesc")}</p>

      {webhookData?.hasWebhook && (
        <div className="rounded-xl px-4 py-3 mb-5 flex items-center gap-2 text-sm" style={{ background: "#d4edda", border: "1px solid #c3e6cb" }}>
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "#155724" }} />
          <span style={{ color: "#155724", fontWeight: 600 }}>{t("webhookActive")}</span>
          <span style={{ color: "#155724" }}>— {webhookData.webhookUrl}</span>
        </div>
      )}

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>{t("webhookGuide")}</p>
      <div className="bg-white rounded-2xl p-5 mb-5 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
        <label className="block text-sm font-bold mb-1.5" style={{ color: "#333" }}>{t("webhookUrl")}</label>
        <input
          type="url"
          placeholder={t("webhookUrlPlaceholder")}
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          className="w-full rounded-xl px-4 py-2.5 text-sm outline-none mb-2"
          style={{ border: "1.5px solid #e2e8f0", background: "#f9fafb", color: "#1a1a1a" }}
          data-testid="input-webhook-url"
        />
        <p className="text-xs mb-4" style={{ color: "#aaa" }}>{t("webhookGuideDesc")}</p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold"
            style={{ background: "#00b050", color: "#fff", border: "none" }}
            data-testid="button-save-webhook"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t("saveWebhook")}
          </button>
          {webhookData?.hasWebhook && (
            <>
              <button
                onClick={handleTest}
                disabled={isTesting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold"
                style={{ background: "#f0f4ff", color: "#3949ab", border: "1px solid #c5cae9" }}
                data-testid="button-test-webhook"
              >
                {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {t("testWebhook")}
              </button>
              <button
                onClick={handleRemove}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold"
                style={{ background: "#fff0f0", color: "#c62828", border: "1px solid #ffcdd2" }}
                data-testid="button-remove-webhook"
              >
                <XCircle className="w-4 h-4" /> {t("delete")}
              </button>
            </>
          )}
        </div>
      </div>

      {webhookData?.hasWebhook && webhookData.webhookSecret && (
        <>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>{t("webhookSecret")}</p>
          <div className="bg-white rounded-2xl p-4 mb-5 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
            <p className="text-xs mb-3" style={{ color: "#888" }}>
              <code className="px-1 rounded" style={{ background: "#f0f4ff", color: "#3949ab" }}>X-RobotPay-Signature</code>
            </p>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "#f9fafb", border: "1px solid #e2e8f0" }}>
              <code className="text-xs font-mono flex-1 break-all" style={{ color: "#555" }} data-testid="text-webhook-secret">{webhookData.webhookSecret}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(webhookData.webhookSecret); toast({ title: t("copied") }); }}
                className="p-1.5 rounded-lg hover:bg-gray-200"
                style={{ color: "#888" }}
                data-testid="button-copy-webhook-secret"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>{t("payload")}</p>
      <div className="bg-white rounded-2xl p-4 mb-5 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
        <pre className="text-xs overflow-x-auto rounded-xl p-3" style={{ background: "#1e2231", color: "#a8d8a8", fontFamily: "monospace" }}>{`{
  "event": "payment.confirmed",
  "txId": "TM240612.1234.A56789",
  "amount": 3000,
  "currency": "XOF",
  "payer": "+22890001234",
  "country": "Togo",
  "merchantSlug": "ecomat",
  "timestamp": "2026-02-12T10:30:00Z"
}`}</pre>
      </div>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>
        {t("webhookLogs")} — {(logs as WebhookLog[]).length}
      </p>
      <div className="space-y-2">
        {logsLoading ? (
          [1,2].map(i => <Skeleton key={i} className="h-14 w-full rounded-2xl" />)
        ) : (logs as WebhookLog[]).length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
            <Send className="w-8 h-8 mx-auto mb-2" style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>{t("noWebhookLogs")}</p>
          </div>
        ) : (
          (logs as WebhookLog[]).slice(0, 20).map((log) => (
            <div key={log.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3" style={{ border: "1.5px solid #e8ecf0" }} data-testid={`webhook-log-${log.id}`}>
              {log.success
                ? <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: "#00b050" }} />
                : <XCircle className="w-5 h-5 shrink-0" style={{ color: "#e53935" }} />
              }
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: "#1a1a1a" }}>
                  {log.statusCode ? `HTTP ${log.statusCode}` : t("error")} — {log.response?.substring(0, 80) || "—"}
                </p>
                <p className="text-xs" style={{ color: "#aaa" }}>{new Date(log.createdAt).toLocaleString("fr-FR")}</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0" style={{ background: log.success ? "#d4edda" : "#f8d7da", color: log.success ? "#155724" : "#721c24" }}>
                {log.success ? t("delivered") : t("deliveryFailed")}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TransfersPanel({ token }: { token: string | null }) {
  const { toast } = useToast();
  const { data: balance = [], isLoading: balLoading } = useMerchantFetch("/api/merchant/balance", ["/api/merchant/balance"], token);
  const { data: transactions = [], isLoading: txLoading } = useMerchantFetch("/api/merchant/transactions", ["/api/merchant/transactions"], token);

  const [selectedCountry, setSelectedCountry] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [operator, setOperator] = useState("");

  const omnipayCountries = (balance as MerchantCountry[]).filter(c => c.omnipayEnabled && c.active);
  const selectedMC = omnipayCountries.find(c => c.country === selectedCountry);

  const transferMutation = useMutation({
    mutationFn: async (data: { country: string; msisdn: string; amount: number; firstName: string; lastName: string; operator?: string }) => {
      const res = await fetch("/api/merchant/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/stats"] });
      toast({
        title: "Transfert initie",
        description: `${data.amount?.toLocaleString("fr-FR")} F CFA envoye. Ref: ${data.reference}`,
      });
      setRecipientPhone("");
      setAmount("");
      setFirstName("");
      setLastName("");
      setOperator("");
    },
    onError: () => toast({ title: "Action non effectuée", description: "Une erreur est survenue. Veuillez réessayer.", variant: "destructive" }),
  });

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCountry || !recipientPhone || !amount || !firstName || !lastName) {
      toast({ title: "Champs incomplets", description: "Veuillez remplir tous les champs requis.", variant: "destructive" });
      return;
    }
    const parsedAmount = parseInt(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({ title: "Montant invalide", description: "Le montant doit être un nombre entier positif.", variant: "destructive" });
      return;
    }
    if (selectedMC && parsedAmount > selectedMC.balance) {
      toast({ title: "Solde insuffisant", description: "Votre solde disponible ne permet pas d'effectuer cette opération.", variant: "destructive" });
      return;
    }
    transferMutation.mutate({
      country: selectedCountry,
      msisdn: recipientPhone,
      amount: parsedAmount,
      firstName,
      lastName,
      operator: operator && operator !== "auto" ? operator : undefined,
    });
  };

  const transferTxs = (transactions as Transaction[]).filter(t => t.amount < 0 || t.txId.startsWith("TR-"));

  if (balLoading) return <MerchantLoadingSkeleton />;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">Transferts Mobile Money</h2>
      <p className="text-sm text-muted-foreground">
        Envoyez de l'argent directement vers un portefeuille Mobile Money.
      </p>

      <Card>
        <CardHeader><CardTitle className="text-base">Nouveau transfert</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleTransfer} className="space-y-4">
            <div className="space-y-2">
              <Label>Pays</Label>
              <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                <SelectTrigger data-testid="select-transfer-country">
                  <SelectValue placeholder="Selectionner un pays" />
                </SelectTrigger>
                <SelectContent>
                  {omnipayCountries.map(c => (
                    <SelectItem key={c.id} value={c.country}>
                      {c.country} - Solde: {c.balance.toLocaleString("fr-FR")} F CFA
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prenom du destinataire</Label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Prenom"
                  required
                  data-testid="input-transfer-firstname"
                />
              </div>
              <div className="space-y-2">
                <Label>Nom du destinataire</Label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Nom"
                  required
                  data-testid="input-transfer-lastname"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Numero de telephone</Label>
              <Input
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="Ex: 90001234"
                required
                data-testid="input-transfer-phone"
              />
            </div>

            <div className="space-y-2">
              <Label>Montant (F CFA)</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Ex: 5000"
                min="1"
                required
                data-testid="input-transfer-amount"
              />
              {selectedMC && (
                <p className="text-xs text-muted-foreground">
                  Solde disponible: {selectedMC.balance.toLocaleString("fr-FR")} F CFA
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Operateur (optionnel)</Label>
              <Select value={operator} onValueChange={setOperator}>
                <SelectTrigger data-testid="select-transfer-operator">
                  <SelectValue placeholder="Auto-detection" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detection</SelectItem>
                  <SelectItem value="moov">Moov Money</SelectItem>
                  <SelectItem value="tmoney">T-Money</SelectItem>
                  <SelectItem value="wave">Wave</SelectItem>
                  <SelectItem value="mtn">MTN Mobile Money</SelectItem>
                  <SelectItem value="orange">Orange Money</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              type="submit"
              disabled={transferMutation.isPending || !selectedCountry}
              data-testid="button-submit-transfer"
            >
              {transferMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Envoyer le transfert
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Historique des transferts</CardTitle>
            <Badge variant="secondary">{transferTxs.length} transfert(s)</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {txLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : transferTxs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun transfert pour le moment</p>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {transferTxs.slice(0, 50).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between gap-2 p-3 rounded border text-sm" data-testid={`transfer-row-${tx.id}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <ArrowUpRight className="w-4 h-4 text-destructive shrink-0" />
                        <span className="font-mono text-xs font-semibold text-foreground">{tx.txId}</span>
                        <Badge variant="secondary">{tx.country}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {tx.payerNumber ? `Vers ${tx.payerNumber}` : ""}
                        {" "}{new Date(tx.createdAt).toLocaleString("fr-FR")}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-destructive">{tx.amount.toLocaleString("fr-FR")} F</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type WithdrawalOperatorFE = {
  id: number; name: string; type: string; country: string;
  dailyLimit: number; gateway: string; active: boolean;
  maintenanceAll: boolean; maintenanceWithdrawals: boolean;
};

function StatusPill({ status }: { status: string }) {
  if (status === "pending") return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: "#fff3cd", color: "#856404" }}>
      <Clock className="w-3 h-3" /> En attente
    </span>
  );
  if (status === "approved") return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: "#d4edda", color: "#155724" }}>
      <CheckCircle2 className="w-3 h-3" /> Approuvé
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: "#f8d7da", color: "#721c24" }}>
      <XCircle className="w-3 h-3" /> Rejeté
    </span>
  );
}

function WithdrawalsPanel({ token }: { token: string | null }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { data: balance = [], isLoading: balLoading } = useMerchantFetch("/api/merchant/balance", ["/api/merchant/balance"], token);
  const { data: withdrawalList = [], isLoading: wdLoading } = useMerchantFetch("/api/merchant/withdrawals", ["/api/merchant/withdrawals"], token);
  const { data: me } = useMerchantFetch("/api/merchant/me", ["/api/merchant/me"], token);
  const feeExempt = !!(me as any)?.feeExempt;
  const { data: platformFlags } = useQuery<{ withdrawalsDisabled: boolean }>({
    queryKey: ["/api/public/platform-flags"],
    queryFn: () => fetch("/api/public/platform-flags").then(r => r.json()),
    refetchInterval: 60000,
  });
  const withdrawalsDisabled = !!platformFlags?.withdrawalsDisabled;

  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [selectedOperator, setSelectedOperator] = useState("");
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");

  const activeWallets = (balance as MerchantCountry[]).filter(w => w.active);
  const selectedWallet = activeWallets.find(w => String(w.id) === selectedWalletId);

  const { data: operatorList = [], isLoading: opsLoading } = useQuery<WithdrawalOperatorFE[]>({
    queryKey: ["/api/merchant/withdrawal-operators", selectedWallet?.country],
    queryFn: () =>
      fetch(`/api/merchant/withdrawal-operators/${encodeURIComponent(selectedWallet!.country)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()),
    enabled: !!selectedWallet && !!token,
  });

  const handleWalletSelect = (walletId: string) => {
    setSelectedWalletId(walletId);
    setSelectedOperator("");
    setPhone("");
    setAmount("");
  };

  const createMutation = useMutation({
    mutationFn: async (data: { merchantCountryId: number; amount: number; phone: string; operator: string }) => {
      const res = await fetch("/api/merchant/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/balance"] });
      setAmount(""); setPhone(""); setSelectedOperator("");
      toast({ title: "Demande soumise", description: "Votre demande de reversement est en cours de traitement." });
    },
    onError: () => toast({ title: "Action non effectuée", description: "Une erreur est survenue. Veuillez réessayer.", variant: "destructive" }),
  });

  const handleSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!selectedWalletId || !selectedOperator || !amount || !phone) return;
    const amountNum = parseInt(amount);
    if (isNaN(amountNum) || amountNum <= 0) return;
    if (selectedWallet && amountNum > selectedWallet.balance) {
      toast({ title: "Solde insuffisant", description: `Votre solde disponible est de ${selectedWallet.balance.toLocaleString("fr-FR")} ${countryToCurrency(selectedWallet.country)}.`, variant: "destructive" });
      return;
    }
    createMutation.mutate({ merchantCountryId: Number(selectedWalletId), amount: amountNum, phone, operator: selectedOperator });
  };

  const totalWithdrawn = (withdrawalList as Withdrawal[]).filter(w => w.status === "approved").reduce((s, w) => s + w.amount, 0);
  const pendingCount = (withdrawalList as Withdrawal[]).filter(w => w.status === "pending").length;

  return (
    <div className="-m-4 md:-m-6 p-4 md:p-6 min-h-full" style={{ background: "#e8eaed" }}>
      <h2 className="text-xl font-bold mb-5" style={{ color: "#333" }}>{t("withdrawalsTitle")}</h2>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>{t("summary")}</p>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-xl p-4" style={{ background: "#26a69a" }}>
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">{t("totalWithdrawn")}</p>
          <p className="text-2xl font-bold text-white">{totalWithdrawn.toLocaleString("fr-FR")}<span className="text-sm ml-1 text-white/80">FCFA</span></p>
        </div>
        <div className="rounded-xl p-4" style={{ background: pendingCount > 0 ? "#fb8c00" : "#7e57c2" }}>
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">{t("pending")}</p>
          <p className="text-2xl font-bold text-white">{pendingCount}</p>
        </div>
      </div>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>{t("requestWithdrawal")}</p>
      <div className="bg-white rounded-2xl p-5 mb-6 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
        <div className="space-y-5">
          <div>
            <p className="text-sm font-bold mb-3" style={{ color: "#333" }}>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs mr-2" style={{ background: "#00b050" }}>1</span>
              {t("selectCountry")}
            </p>
            {balLoading ? (
              <div className="grid gap-2 grid-cols-2">{[1,2].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
            ) : activeWallets.length === 0 ? (
              <p className="text-sm" style={{ color: "#888" }}>{t("noCountriesActive")}</p>
            ) : (
              <div className="grid gap-2 grid-cols-2">
                {activeWallets.map((w, idx) => (
                  <div
                    key={w.id}
                    onClick={() => handleWalletSelect(String(w.id))}
                    className="rounded-xl p-3 cursor-pointer transition-all"
                    style={{
                      background: String(w.id) === selectedWalletId ? COUNTRY_COLORS[idx % COUNTRY_COLORS.length] : "#f5f6f8",
                      border: `2px solid ${String(w.id) === selectedWalletId ? COUNTRY_COLORS[idx % COUNTRY_COLORS.length] : "#e8ecf0"}`,
                    }}
                    data-testid={`wallet-card-${w.id}`}
                  >
                    <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: String(w.id) === selectedWalletId ? "rgba(255,255,255,0.8)" : "#888" }}>{w.country}</p>
                    <p className="text-lg font-bold" style={{ color: String(w.id) === selectedWalletId ? "#fff" : "#1a1a1a" }}>
                      {w.balance.toLocaleString("fr-FR")}<span className="text-xs ml-1" style={{ color: String(w.id) === selectedWalletId ? "rgba(255,255,255,0.7)" : "#aaa" }}>{countryToCurrency(w.country)}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedWallet && (
            <div>
              <p className="text-sm font-bold mb-3" style={{ color: "#333" }}>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs mr-2" style={{ background: "#00b050" }}>2</span>
                {t("selectOperator")}
              </p>
              {opsLoading ? (
                <div className="grid gap-2 grid-cols-2">{[1,2].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
              ) : operatorList.length === 0 ? (
                <div className="p-3 rounded-xl text-sm" style={{ background: "#fff3cd", color: "#856404" }}>
                  {t("noData")} — {selectedWallet.country}
                </div>
              ) : (
                <div className="grid gap-2 grid-cols-2">
                  {operatorList.map((op) => (
                    <div
                      key={op.id}
                      onClick={() => { if (!withdrawalsDisabled) setSelectedOperator(op.name); }}
                      className="rounded-xl p-3 transition-all flex items-center gap-2"
                      style={{
                        background: withdrawalsDisabled ? "#f5f6f8" : selectedOperator === op.name ? "#1e88e5" : "#f5f6f8",
                        border: `2px solid ${withdrawalsDisabled ? "#e8ecf0" : selectedOperator === op.name ? "#1e88e5" : "#e8ecf0"}`,
                        cursor: withdrawalsDisabled ? "not-allowed" : "pointer",
                        opacity: withdrawalsDisabled ? 0.6 : 1,
                      }}
                      data-testid={`operator-card-${op.id}`}
                    >
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: (!withdrawalsDisabled && selectedOperator === op.name) ? "rgba(255,255,255,0.2)" : "#e8ecf0" }}>
                        <Zap className="w-4 h-4" style={{ color: (!withdrawalsDisabled && selectedOperator === op.name) ? "#fff" : "#00b050" }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate" style={{ color: (!withdrawalsDisabled && selectedOperator === op.name) ? "#fff" : "#1a1a1a" }}>{op.name}</p>
                        <p className="text-xs" style={{ color: (!withdrawalsDisabled && selectedOperator === op.name) ? "rgba(255,255,255,0.7)" : "#aaa" }}>{op.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {withdrawalsDisabled && operatorList.length > 0 && (
                <div className="mt-3 rounded-xl p-4 flex items-start gap-3" style={{ background: "#fff0f0", border: "1.5px solid #ffb3b3" }}>
                  <span className="text-xl mt-0.5">🚫</span>
                  <div>
                    <p className="text-sm font-bold" style={{ color: "#c0392b" }}>Retrait non disponible</p>
                    <p className="text-xs mt-0.5" style={{ color: "#922b21" }}>Les retraits sont temporairement suspendus. Veuillez réessayer ultérieurement ou contacter le support.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedWallet && selectedOperator && !withdrawalsDisabled && (
            <form onSubmit={handleSubmit}>
              <p className="text-sm font-bold mb-3" style={{ color: "#333" }}>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs mr-2" style={{ background: "#00b050" }}>3</span>
                {t("withdrawalHistory")}
              </p>
              <div className="rounded-xl p-3 mb-4 text-xs" style={{ background: "#f0faf5", border: "1px solid #c3e6cb" }}>
                <span style={{ color: "#155724" }}>{selectedWallet.country} · <strong>{selectedOperator}</strong> · {t("availableBalance")} : <strong>{selectedWallet.balance.toLocaleString("fr-FR")} {countryToCurrency(selectedWallet.country)}</strong></span>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: "#333" }}>{t("amount")} ({countryToCurrency(selectedWallet.country)})</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Ex: 50000"
                    min="1"
                    max={selectedWallet.balance}
                    className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                    style={{ border: "1.5px solid #e2e8f0", background: "#fff", color: "#1a1a1a" }}
                    data-testid="input-withdrawal-amount"
                  />
                  {amount && parseInt(amount) > 0 && (() => {
                    const gross = parseInt(amount);
                    const fee = feeExempt ? 0 : Math.floor(gross * 0.045);
                    const net = gross - fee;
                    return (
                      <div className="mt-2 rounded-lg p-2.5 text-xs space-y-1" style={{ background: "#f0faf5", border: "1px solid #c3e6cb" }}>
                        {feeExempt ? (
                          <div className="flex justify-between items-center">
                            <span style={{ color: "#155724", fontWeight: 600 }}>✦ Mode sans frais</span>
                            <span style={{ color: "#155724", fontWeight: 600 }}>0 F</span>
                          </div>
                        ) : (
                          <div className="flex justify-between"><span style={{ color: "#666" }}>Frais WestPay (4,5 %)</span><span style={{ color: "#e53e3e", fontWeight: 600 }}>−{fee.toLocaleString("fr-FR")} F</span></div>
                        )}
                        <div className="flex justify-between border-t pt-1" style={{ borderColor: "#c3e6cb" }}><span style={{ color: "#155724", fontWeight: 700 }}>Vous recevrez</span><span style={{ color: "#155724", fontWeight: 700 }}>{net.toLocaleString("fr-FR")} F</span></div>
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: "#333" }}>{t("phone")}</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ex: +22507XXXXXXXX"
                    className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                    style={{ border: "1.5px solid #e2e8f0", background: "#fff", color: "#1a1a1a" }}
                    data-testid="input-withdrawal-phone"
                  />
                  <p className="text-xs mt-1" style={{ color: "#aaa" }}>{selectedOperator}</p>
                </div>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !amount || !phone}
                  className="w-full rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2 transition-all"
                  style={{ background: createMutation.isPending || !amount || !phone ? "#ccc" : "#00b050", color: "#fff", border: "none", cursor: createMutation.isPending ? "not-allowed" : "pointer" }}
                  data-testid="button-submit-withdrawal"
                >
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {createMutation.isPending ? t("loading") : t("requestWithdrawal")}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>
        {t("withdrawalHistory")} — {(withdrawalList as Withdrawal[]).length}
      </p>
      <div className="space-y-3">
        {wdLoading ? (
          [1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)
        ) : (withdrawalList as Withdrawal[]).length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
            <Download className="w-8 h-8 mx-auto mb-2" style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>{t("noWithdrawals")}</p>
          </div>
        ) : (
          (withdrawalList as Withdrawal[]).map((w) => (
            <div key={w.id} className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }} data-testid={`withdrawal-row-${w.id}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-lg font-bold" style={{ color: "#1a1a1a" }}>{w.amount.toLocaleString("fr-FR")} <span className="text-sm font-semibold" style={{ color: "#888" }}>{countryToCurrency(w.country)}</span></p>
                <StatusPill status={w.status} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "#888" }}>
                <span className="font-medium" style={{ color: "#555" }}>{w.country}</span>
                {(w as any).operator && <span style={{ color: "#1e88e5", fontWeight: 600 }}>{(w as any).operator}</span>}
                <span><Phone className="w-3 h-3 inline mr-0.5" />{w.phone}</span>
                <span>{new Date(w.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</span>
                <span className="px-1.5 py-0.5 rounded-full text-xs" style={{ background: "#f0f0f0", color: "#666" }}>{w.withdrawalMode === "auto" ? t("autoMode") : t("manualMode")}</span>
              </div>
              {w.adminNote && (
                <p className="text-xs mt-2 px-2 py-1 rounded-lg italic" style={{ background: "#f8f9fa", color: "#666" }}>
                  {t("adminNote")} : {w.adminNote}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function WalletTransfersPanel({ token }: { token: string | null }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { data: balance = [], isLoading: balLoading } = useMerchantFetch("/api/merchant/balance", ["/api/merchant/balance"], token);
  const { data: walletTransfers = [], isLoading: wtLoading } = useMerchantFetch("/api/merchant/wallet-transfers", ["/api/merchant/wallet-transfers"], token);
  const { data: me } = useMerchantFetch("/api/merchant/me", ["/api/merchant/me"], token);
  const feeExempt = !!(me as any)?.feeExempt;
  const { data: wtcList = [] } = useQuery<WalletTransferCountry[]>({
    queryKey: ["/api/wallet-transfer-countries"],
    queryFn: () => fetch("/api/wallet-transfer-countries").then(r => r.json()),
  });

  const { data: wtFeeSettings } = useQuery<{ feeType: string; feeValue: number }>({
    queryKey: ["/api/public/wallet-transfer-fee"],
    queryFn: () => fetch("/api/public/wallet-transfer-fee").then(r => r.json()),
  });

  const [fromCountryId, setFromCountryId] = useState("");
  const [toCountryId, setToCountryId] = useState("");
  const [amount, setAmount] = useState("");

  const wtcMap = new Map<string, WalletTransferCountry>(wtcList.map((c: WalletTransferCountry) => [c.country, c]));
  const allMerchantCountries = (balance as MerchantCountry[]).filter(c => c.active);
  const eligibleCountries = allMerchantCountries.filter(c => wtcMap.has(c.country));
  const fromMC = eligibleCountries.find(c => String(c.id) === fromCountryId);
  const fromZone = fromMC ? wtcMap.get(fromMC.country)?.currencyZone || null : null;
  const toCountries = fromZone
    ? eligibleCountries.filter(c =>
        String(c.id) !== fromCountryId &&
        wtcMap.get(c.country)?.currencyZone === fromZone
      )
    : [];

  const createMutation = useMutation({
    mutationFn: async (data: { fromCountryId: string; toCountryId: string; amount: string }) => {
      const res = await fetch("/api/merchant/wallet-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: (data: WalletTransfer) => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/wallet-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/balance"] });
      toast({
        title: "Virement soumis",
        description: data.fee === 0
          ? `${data.amount.toLocaleString("fr-FR")} ${data.currency} de ${data.fromCountry} → ${data.toCountry}. ✦ Sans frais.`
          : `${data.amount.toLocaleString("fr-FR")} ${data.currency} de ${data.fromCountry} → ${data.toCountry}. Frais : ${data.fee.toLocaleString("fr-FR")} ${data.currency}.`,
      });
      setFromCountryId(""); setToCountryId(""); setAmount("");
    },
    onError: (err: any) => toast({ title: "Action non effectuée", description: err.message || "Une erreur est survenue. Veuillez réessayer.", variant: "destructive" }),
  });

  const handleSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!fromCountryId || !toCountryId || !amount) {
      toast({ title: "Champs incomplets", description: "Veuillez sélectionner les pays et saisir un montant.", variant: "destructive" });
      return;
    }
    const parsed = parseInt(amount);
    if (isNaN(parsed) || parsed <= 0) {
      toast({ title: "Montant invalide", description: "Le montant doit être un nombre entier positif.", variant: "destructive" });
      return;
    }
    createMutation.mutate({ fromCountryId, toCountryId, amount });
  };

  if (balLoading) return <MerchantLoadingSkeleton />;

  const xofCountries = wtcList.filter((c: WalletTransferCountry) => c.currencyZone === "XOF").map((c: WalletTransferCountry) => c.country).join(", ");
  const xafCountries = wtcList.filter((c: WalletTransferCountry) => c.currencyZone === "XAF").map((c: WalletTransferCountry) => c.country).join(", ");
  const cdfCountries = wtcList.filter((c: WalletTransferCountry) => c.currencyZone === "CDF").map((c: WalletTransferCountry) => c.country).join(", ");
  const totalTransferred = (walletTransfers as WalletTransfer[]).filter(w => w.status === "approved").reduce((s, w) => s + w.amount, 0);
  const pendingCount = (walletTransfers as WalletTransfer[]).filter(w => w.status === "pending").length;

  return (
    <div className="-m-4 md:-m-6 p-4 md:p-6 min-h-full" style={{ background: "#e8eaed" }}>
      <h2 className="text-xl font-bold mb-1" style={{ color: "#333" }}>{t("walletTransfersTitle")}</h2>
      <p className="text-xs mb-5" style={{ color: "#888" }}>{t("walletTransfersDesc")}</p>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>{t("summary")}</p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl p-4" style={{ background: "#7e57c2" }}>
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">{t("totalTransfers")}</p>
          <p className="text-2xl font-bold text-white">{totalTransferred.toLocaleString("fr-FR")}<span className="text-sm ml-1 text-white/80">FCFA</span></p>
        </div>
        <div className="rounded-xl p-4" style={{ background: pendingCount > 0 ? "#fb8c00" : "#1976d2" }}>
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">{t("pending")}</p>
          <p className="text-2xl font-bold text-white">{pendingCount}</p>
        </div>
      </div>

      {wtcList.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-5">
          {xofCountries && (
            <div className="rounded-xl px-3 py-2 text-xs" style={{ background: "#e8f5e9", border: "1px solid #c8e6c9" }}>
              <span className="font-bold" style={{ color: "#2e7d32" }}>Zone XOF : </span>
              <span style={{ color: "#388e3c" }}>{xofCountries}</span>
            </div>
          )}
          {xafCountries && (
            <div className="rounded-xl px-3 py-2 text-xs" style={{ background: "#e3f2fd", border: "1px solid #bbdefb" }}>
              <span className="font-bold" style={{ color: "#1565c0" }}>Zone XAF : </span>
              <span style={{ color: "#1976d2" }}>{xafCountries}</span>
            </div>
          )}
          {cdfCountries && (
            <div className="rounded-xl px-3 py-2 text-xs" style={{ background: "#fff8e1", border: "1px solid #ffe082" }}>
              <span className="font-bold" style={{ color: "#e65100" }}>Zone CDF : </span>
              <span style={{ color: "#ef6c00" }}>{cdfCountries}</span>
            </div>
          )}
        </div>
      )}

      {eligibleCountries.length < 2 && (
        <div className="rounded-xl p-4 mb-5 text-sm" style={{ background: "#fff3cd", border: "1px solid #ffc107", color: "#856404" }}>
          {t("transferWarning")}
        </div>
      )}

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>{t("newTransfer")}</p>
      <div className="bg-white rounded-2xl p-5 mb-6 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: "#333" }}>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs mr-1.5" style={{ background: "#7e57c2" }}>1</span>
                {t("fromCountry")}
              </label>
              <select
                value={fromCountryId}
                onChange={(e) => { setFromCountryId(e.target.value); setToCountryId(""); }}
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ border: "1.5px solid #e2e8f0", background: "#fff", color: fromCountryId ? "#1a1a1a" : "#aaa" }}
                data-testid="select-virement-from"
              >
                <option value="">{eligibleCountries.length === 0 ? t("noData") : t("selectFromCountry")}</option>
                {eligibleCountries.map(c => (
                  <option key={c.id} value={String(c.id)}>{c.country} — {c.balance.toLocaleString("fr-FR")} {countryToCurrency(c.country)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: "#333" }}>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs mr-1.5" style={{ background: "#7e57c2" }}>2</span>
                {t("toCountry")}
              </label>
              <select
                value={toCountryId}
                onChange={(e) => setToCountryId(e.target.value)}
                disabled={!fromCountryId || toCountries.length === 0}
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ border: "1.5px solid #e2e8f0", background: !fromCountryId ? "#f5f5f5" : "#fff", color: toCountryId ? "#1a1a1a" : "#aaa" }}
                data-testid="select-virement-to"
              >
                <option value="">{fromCountryId && toCountries.length === 0 ? t("noData") : t("selectToCountry")}</option>
                {toCountries.map(c => (
                  <option key={c.id} value={String(c.id)}>{c.country} — {c.balance.toLocaleString("fr-FR")} {countryToCurrency(c.country)}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: "#333" }}>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs mr-1.5" style={{ background: "#7e57c2" }}>3</span>
              {t("amount")} ({fromZone || "FCFA"})
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ex: 50000"
              min="1"
              required
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
              style={{ border: "1.5px solid #e2e8f0", background: "#fff", color: "#1a1a1a" }}
              data-testid="input-virement-amount"
            />
            {fromMC && amount && !isNaN(parseInt(amount)) && (
              <p className="text-xs mt-1" style={{ color: "#aaa" }}>
                {t("availableBalance")} : <strong style={{ color: "#555" }}>{fromMC.balance.toLocaleString("fr-FR")} {fromZone}</strong>
              </p>
            )}
          </div>

          {fromCountryId && toCountryId && (
            <div className="rounded-xl p-3 flex items-center gap-3 text-sm" style={{ background: "#f0f4ff", border: "1px solid #c5cae9" }}>
              <ArrowRightLeft className="w-4 h-4 shrink-0" style={{ color: "#7e57c2" }} />
              <span style={{ color: "#333" }}>
                {eligibleCountries.find(c => String(c.id) === fromCountryId)?.country} → {toCountries.find(c => String(c.id) === toCountryId)?.country}
              </span>
            </div>
          )}

          {fromCountryId && toCountryId && amount && !isNaN(parseInt(amount)) && parseInt(amount) > 0 && (() => {
            const parsedAmt = parseInt(amount);
            let estimatedFee = 0;
            if (!feeExempt && wtFeeSettings) {
              if (wtFeeSettings.feeType === "percentage") {
                estimatedFee = Math.round((parsedAmt * wtFeeSettings.feeValue) / 100);
              } else {
                estimatedFee = Math.round(wtFeeSettings.feeValue);
              }
            }
            const totalNeeded = parsedAmt + estimatedFee;
            const hasEnough = !fromMC || fromMC.balance >= totalNeeded;
            return (
              <div className="rounded-lg p-2.5 text-xs space-y-1.5" style={{ background: hasEnough ? "#f0faf5" : "#fff5f5", border: `1px solid ${hasEnough ? "#c3e6cb" : "#feb2b2"}` }}>
                <div className="flex justify-between">
                  <span style={{ color: "#555" }}>Montant</span>
                  <span style={{ color: "#333", fontWeight: 600 }}>{parsedAmt.toLocaleString("fr-FR")} {fromZone || "FCFA"}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: "#555" }}>Frais de virement</span>
                  {feeExempt ? (
                    <span style={{ color: "#2e7d32", fontWeight: 600 }}>✦ Sans frais</span>
                  ) : (
                    <span style={{ color: estimatedFee > 0 ? "#e53e3e" : "#555", fontWeight: 600 }}>
                      {estimatedFee > 0 ? `−${estimatedFee.toLocaleString("fr-FR")} ${fromZone || "FCFA"}` : "0"}
                    </span>
                  )}
                </div>
                <div className="flex justify-between border-t pt-1.5" style={{ borderColor: hasEnough ? "#c3e6cb" : "#feb2b2" }}>
                  <span style={{ color: hasEnough ? "#155724" : "#c53030", fontWeight: 700 }}>Total débité</span>
                  <span style={{ color: hasEnough ? "#155724" : "#c53030", fontWeight: 700 }}>{totalNeeded.toLocaleString("fr-FR")} {fromZone || "FCFA"}</span>
                </div>
                {!hasEnough && fromMC && (
                  <p className="text-xs pt-0.5" style={{ color: "#c53030" }}>
                    Solde insuffisant — vous avez {fromMC.balance.toLocaleString("fr-FR")} {fromZone}, il vous manque {(totalNeeded - fromMC.balance).toLocaleString("fr-FR")} {fromZone}.
                  </p>
                )}
              </div>
            );
          })()}

          {(() => {
            const parsedAmt = parseInt(amount) || 0;
            let estimatedFee = 0;
            if (!feeExempt && wtFeeSettings && parsedAmt > 0) {
              estimatedFee = wtFeeSettings.feeType === "percentage"
                ? Math.round((parsedAmt * wtFeeSettings.feeValue) / 100)
                : Math.round(wtFeeSettings.feeValue);
            }
            const totalNeeded = parsedAmt + estimatedFee;
            const insufficientBalance = !!(fromMC && parsedAmt > 0 && fromMC.balance < totalNeeded);
            const isDisabled = createMutation.isPending || !fromCountryId || !toCountryId || !amount || insufficientBalance;
            return (
              <button
                type="submit"
                disabled={isDisabled}
                className="w-full rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2 transition-all"
                style={{ background: isDisabled ? "#ccc" : "#7e57c2", color: "#fff", border: "none", cursor: isDisabled ? "not-allowed" : "pointer" }}
                data-testid="button-submit-virement"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                {createMutation.isPending ? t("loading") : insufficientBalance ? "Solde insuffisant" : t("confirmTransfer")}
              </button>
            );
          })()}
        </form>
      </div>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>
        {t("transferHistory")} — {(walletTransfers as WalletTransfer[]).length}
      </p>
      <div className="space-y-3">
        {wtLoading ? (
          [1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)
        ) : (walletTransfers as WalletTransfer[]).length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
            <ArrowRightLeft className="w-8 h-8 mx-auto mb-2" style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>{t("noTransfers")}</p>
          </div>
        ) : (
          (walletTransfers as WalletTransfer[]).map((wt) => (
            <div key={wt.id} className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }} data-testid={`virement-row-${wt.id}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold" style={{ color: "#1a1a1a" }}>{wt.fromCountry}</span>
                  <ArrowRightLeft className="w-3.5 h-3.5" style={{ color: "#7e57c2" }} />
                  <span className="text-base font-bold" style={{ color: "#1a1a1a" }}>{wt.toCountry}</span>
                </div>
                <StatusPill status={wt.status} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "#888" }}>
                <span>{t("amount")} : <strong style={{ color: "#333" }}>{wt.amount.toLocaleString("fr-FR")} {wt.currency}</strong></span>
                <span>{t("fees")} : <strong style={{ color: wt.fee === 0 ? "#00b050" : "#333" }}>{wt.fee === 0 ? "Sans frais" : `${wt.fee.toLocaleString("fr-FR")} ${wt.currency}`}</strong></span>
                <span>{new Date(wt.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</span>
              </div>
              {wt.adminNote && (
                <p className="text-xs mt-2 px-2 py-1 rounded-lg italic" style={{ background: "#f8f9fa", color: "#666" }}>
                  {t("adminNote")} : {wt.adminNote}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MerchantSettingsPanel({ token }: { token: string | null }) {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isChanging, setIsChanging] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsChanging(true);
    try {
      const res = await fetch("/api/merchant/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || t("error")); }
      toast({ title: t("passwordChanged") });
      setCurrentPassword(""); setNewPassword("");
    } catch (err: any) {
      toast({ title: "Action non effectuée", description: "Une erreur est survenue. Veuillez réessayer.", variant: "destructive" });
    } finally { setIsChanging(false); }
  };

  return (
    <div className="-m-4 md:-m-6 p-4 md:p-6 min-h-full" style={{ background: "#e8eaed" }}>
      <h2 className="text-xl font-bold mb-5" style={{ color: "#333" }}>{t("settingsTitle")}</h2>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>{t("myProfile")}</p>
      <div className="bg-white rounded-2xl p-5 mb-5 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shrink-0" style={{ background: "#1976d2" }}>
            {user?.name?.charAt(0)?.toUpperCase() || "M"}
          </div>
          <div>
            <p className="text-lg font-bold" style={{ color: "#1a1a1a" }}>{user?.name}</p>
            <p className="text-sm" style={{ color: "#888" }}>{user?.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <span className="text-xs px-3 py-1 rounded-full font-semibold" style={{ background: "#e8f5e9", color: "#2e7d32" }}>{t("merchant")}</span>
          <span className="text-xs px-3 py-1 rounded-full font-semibold" style={{ background: "#e3f2fd", color: "#1565c0" }}>{t("statusActive")}</span>
        </div>
      </div>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>{t("security")}</p>
      <div className="bg-white rounded-2xl p-5 mb-5 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
        <p className="text-sm font-bold mb-4" style={{ color: "#1a1a1a" }}>{t("changePassword")}</p>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#555" }}>{t("currentPassword")}</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
              style={{ border: "1.5px solid #e2e8f0", background: "#f9fafb", color: "#1a1a1a" }}
              data-testid="input-merchant-current-password"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#555" }}>{t("newPassword")}</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
              style={{ border: "1.5px solid #e2e8f0", background: "#f9fafb", color: "#1a1a1a" }}
              data-testid="input-merchant-new-password"
            />
          </div>
          <button
            type="submit"
            disabled={isChanging}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: "#00b050", color: "#fff", border: "none" }}
            data-testid="button-merchant-change-password"
          >
            {isChanging ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t("changePassword")}
          </button>
        </form>
      </div>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>{t("session")}</p>
      <div className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: "1.5px solid #ffcdd2" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#fff0f0" }}>
            <LogOut className="w-5 h-5" style={{ color: "#e53935" }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: "#1a1a1a" }}>{t("logout")}</p>
            <p className="text-xs" style={{ color: "#aaa" }}>{t("logoutDesc")}</p>
          </div>
          <button
            onClick={() => { logout(); setLocation("/merchant-login"); }}
            className="px-4 py-2 rounded-xl text-sm font-bold"
            style={{ background: "#fff0f0", color: "#c62828", border: "1px solid #ffcdd2" }}
            data-testid="button-merchant-logout"
          >
            {t("logout")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentLinksPanel({ token }: { token: string | null }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editLink, setEditLink] = useState<PaymentLink | null>(null);
  const [form, setForm] = useState({ name: "", amountType: "fixed", amount: "", redirectUrl: "", paymentLimit: "" });
  const baseUrl = "https://westpay.cloud";

  const { data: links = [], isLoading } = useQuery<PaymentLink[]>({
    queryKey: ["/api/merchant/payment-links"],
    queryFn: async () => {
      const res = await fetch("/api/merchant/payment-links", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(t("error"));
      return res.json();
    },
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch("/api/merchant/payment-links", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: data.name, amountType: data.amountType,
          amount: data.amount ? Number(data.amount) : undefined,
          redirectUrl: data.redirectUrl || undefined,
          paymentLimit: data.paymentLimit ? Number(data.paymentLimit) : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/merchant/payment-links"] }); setShowCreate(false); setForm({ name: "", amountType: "fixed", amount: "", redirectUrl: "", paymentLimit: "" }); toast({ title: t("linkCreated") }); },
    onError: () => toast({ title: "Action non effectuée", description: "Une erreur est survenue. Veuillez réessayer.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<typeof form & { active: boolean }> }) => {
      const res = await fetch(`/api/merchant/payment-links/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/merchant/payment-links"] }); setEditLink(null); toast({ title: t("linkUpdated") }); },
    onError: () => toast({ title: "Action non effectuée", description: "Une erreur est survenue. Veuillez réessayer.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/merchant/payment-links/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(t("error"));
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/merchant/payment-links"] }); toast({ title: t("linkDeleted") }); },
  });

  const copyLink = (uniqueId: string) => {
    navigator.clipboard.writeText(`${baseUrl}/link/${uniqueId}`);
    toast({ title: t("copied") });
  };

  const totalRevenue = links.reduce((s, l) => s + l.totalRevenue, 0);
  const totalPayments = links.reduce((s, l) => s + l.paymentCount, 0);

  return (
    <div className="-m-4 md:-m-6 p-4 md:p-6 min-h-full" style={{ background: "#e8eaed" }}>
      <div className="flex items-center justify-between gap-2 mb-5">
        <div>
          <h2 className="text-xl font-bold" style={{ color: "#333" }}>{t("paymentLinksTitle")}</h2>
          <p className="text-xs mt-0.5" style={{ color: "#888" }}>{t("paymentLinksDesc")}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold"
          style={{ background: "#00b050", color: "#fff", border: "none" }}
          data-testid="button-create-payment-link"
        >
          <Plus className="w-4 h-4" /> {t("newLink")}
        </button>
      </div>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>{t("summary")}</p>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl p-4" style={{ background: "#1976d2" }}>
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">{t("links")}</p>
          <p className="text-2xl font-bold text-white">{links.length}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: "#26a69a" }}>
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">{t("payments")}</p>
          <p className="text-2xl font-bold text-white">{totalPayments}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: "#7e57c2" }}>
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">{t("volume")}</p>
          <p className="text-lg font-bold text-white">{totalRevenue.toLocaleString()}<span className="text-xs ml-1 text-white/70">F</span></p>
        </div>
      </div>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>
        {t("yourLinks")} — {links.length}
      </p>

      {isLoading ? <MerchantLoadingSkeleton /> : links.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
          <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: "#f0f4ff" }}>
            <Link className="w-7 h-7" style={{ color: "#3949ab" }} />
          </div>
          <p className="font-bold text-sm mb-1" style={{ color: "#1a1a1a" }}>{t("noLinks")}</p>
          <p className="text-xs mb-4" style={{ color: "#aaa" }}>{t("noLinksDesc")}</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-xl text-sm font-bold"
            style={{ background: "#00b050", color: "#fff", border: "none" }}
          >
            {t("createLink")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link) => {
            const url = `${baseUrl}/link/${link.uniqueId}`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(url)}`;
            const isExpired = link.expiresAt && new Date() > new Date(link.expiresAt);
            const isLimited = link.paymentLimit && link.paymentCount >= link.paymentLimit;
            const inactive = !link.active || isExpired || isLimited;
            let statusStyle = { bg: "#d4edda", color: "#155724", label: t("statusActive") };
            if (isExpired) statusStyle = { bg: "#f8d7da", color: "#721c24", label: t("expired") };
            else if (isLimited) statusStyle = { bg: "#f8d7da", color: "#721c24", label: t("limitReached") };
            else if (!link.active) statusStyle = { bg: "#e9ecef", color: "#495057", label: t("inactive") };
            return (
              <div key={link.id} className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: "1.5px solid #e8ecf0", opacity: inactive ? 0.65 : 1 }} data-testid={`card-payment-link-${link.id}`}>
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <img src={qrUrl} alt="QR" className="w-16 h-16 rounded-xl shrink-0" style={{ border: "1px solid #e8ecf0" }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="font-bold text-sm" style={{ color: "#1a1a1a" }} data-testid={`text-link-name-${link.id}`}>{link.name}</p>
                        <p className="text-xs" style={{ color: "#888" }}>{link.amountType === "fixed" ? `${link.amount?.toLocaleString()} F CFA` : t("flexibleAmount")}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0" style={{ background: statusStyle.bg, color: statusStyle.color }}>{statusStyle.label}</span>
                    </div>
                    <div className="flex items-center gap-1 rounded-xl px-3 py-1.5 mb-2" style={{ background: "#f9fafb", border: "1px solid #e2e8f0" }}>
                      <span className="text-xs truncate flex-1 font-mono" style={{ color: "#666" }}>{url}</span>
                      <button className="p-1 rounded hover:bg-gray-200 shrink-0" onClick={() => copyLink(link.uniqueId)} style={{ color: "#888" }} data-testid={`button-copy-link-${link.id}`}><Copy className="w-3 h-3" /></button>
                      <button className="p-1 rounded hover:bg-gray-200 shrink-0" onClick={() => window.open(url, "_blank")} style={{ color: "#888" }} data-testid={`button-open-link-${link.id}`}><ExternalLink className="w-3 h-3" /></button>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs" style={{ color: "#888" }}>
                      <span><BarChart3 className="w-3 h-3 inline mr-0.5" />{link.paymentCount} {t("payments")}</span>
                      <span style={{ color: "#00b050", fontWeight: 600 }}>{link.totalRevenue.toLocaleString()} F</span>
                      {link.paymentLimit && <span>{t("limit")} : {link.paymentCount}/{link.paymentLimit}</span>}
                    </div>
                  </div>
                  <div className="flex sm:flex-col items-center gap-2 shrink-0">
                    <Switch checked={link.active} onCheckedChange={(checked) => updateMutation.mutate({ id: link.id, data: { active: checked } })} data-testid={`switch-link-active-${link.id}`} />
                    <button
                      className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ background: "#f0f4ff", border: "1px solid #c5cae9" }}
                      onClick={() => { setEditLink(link); setForm({ name: link.name, amountType: link.amountType, amount: link.amount?.toString() || "", redirectUrl: link.redirectUrl || "", paymentLimit: link.paymentLimit?.toString() || "" }); }}
                      data-testid={`button-edit-link-${link.id}`}
                    >
                      <Edit3 className="w-3 h-3" style={{ color: "#3949ab" }} />
                    </button>
                    <button
                      className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ background: "#fff0f0", border: "1px solid #ffcdd2" }}
                      onClick={() => deleteMutation.mutate(link.id)}
                      data-testid={`button-delete-link-${link.id}`}
                    >
                      <Trash2 className="w-3 h-3" style={{ color: "#c62828" }} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showCreate || !!editLink} onOpenChange={(o) => { if (!o) { setShowCreate(false); setEditLink(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editLink ? t("editLink") : t("createLink")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label>{t("linkName")}</Label>
              <Input placeholder="Ex: Paiement commande #42" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} data-testid="input-link-name" />
            </div>
            <div className="space-y-1">
              <Label>{t("amountType")}</Label>
              <Select value={form.amountType} onValueChange={(v) => setForm(f => ({ ...f, amountType: v }))}>
                <SelectTrigger data-testid="select-link-amount-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">{t("fixedAmount")}</SelectItem>
                  <SelectItem value="flexible">{t("flexibleAmount")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.amountType === "fixed" && (
              <div className="space-y-1">
                <Label>{t("amount")} (F CFA)</Label>
                <Input type="number" placeholder="5000" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} data-testid="input-link-amount" />
              </div>
            )}
            <div className="space-y-1">
              <Label>{t("redirectUrl")}</Label>
              <Input placeholder="https://yoursite.com/thanks" value={form.redirectUrl} onChange={(e) => setForm(f => ({ ...f, redirectUrl: e.target.value }))} data-testid="input-link-redirect" />
            </div>
            <div className="space-y-1">
              <Label>{t("paymentLimit")}</Label>
              <Input type="number" placeholder={t("unlimited")} value={form.paymentLimit} onChange={(e) => setForm(f => ({ ...f, paymentLimit: e.target.value }))} data-testid="input-link-limit" />
            </div>
            <Button className="w-full" onClick={() => { if (editLink) { updateMutation.mutate({ id: editLink.id, data: { name: form.name, amountType: form.amountType, amount: form.amount ? Number(form.amount) : undefined, redirectUrl: form.redirectUrl || undefined, paymentLimit: form.paymentLimit ? Number(form.paymentLimit) : undefined } }); } else { createMutation.mutate(form); } }} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-link-form">
              {createMutation.isPending || updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : editLink ? t("save") : t("createLink")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MerchantLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

function SupportBanner() {
  const { data: contacts } = useQuery<{
    telegram1: string; telegram2: string;
    whatsapp1: string; whatsapp2: string; hours: string; hours2: string;
  }>({
    queryKey: ["/api/public/support-contacts"],
    staleTime: 5 * 60 * 1000,
  });

  if (!contacts) return null;

  return (
    <div className="border rounded-xl p-3 text-sm bg-primary/5 border-primary/20" data-testid="banner-support">
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <MessageCircle className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-foreground text-xs mb-1.5">Support client disponible</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 flex-wrap">
              <MessageCircle className="w-3 h-3 text-primary shrink-0" />
              <span>Telegram :</span>
              <a href={`https://t.me/${contacts.telegram1.replace("@","")}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">{contacts.telegram1}</a>
              {contacts.hours && <span className="opacity-70">({contacts.hours})</span>}
              {contacts.telegram2 && <>
                <span className="opacity-50">·</span>
                <a href={`https://t.me/${contacts.telegram2.replace("@","")}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">{contacts.telegram2}</a>
                {contacts.hours2 && <span className="opacity-70">({contacts.hours2})</span>}
              </>}
            </span>
            <span className="flex items-center gap-1 flex-wrap">
              <Phone className="w-3 h-3 text-primary shrink-0" />
              <span>WhatsApp :</span>
              <a href={`https://wa.me/${contacts.whatsapp1.replace(/\D/g,"")}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">{contacts.whatsapp1}</a>
              {contacts.whatsapp2 && <>
                <span className="opacity-50">·</span>
                <a href={`https://wa.me/${contacts.whatsapp2.replace(/\D/g,"")}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">{contacts.whatsapp2}</a>
              </>}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LanguageDropdown() {
  const { lang, setLang, currentLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors"
        style={{ background: open ? "rgba(255,255,255,0.15)" : "transparent", color: "#fff", border: "none", cursor: "pointer" }}
        title="Langue / Language"
        data-testid="button-language-selector"
      >
        <span className="text-base leading-none">{currentLanguage.flag}</span>
        <span className="text-xs font-bold uppercase hidden sm:inline">{currentLanguage.code}</span>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 rounded-xl shadow-xl overflow-hidden z-50"
          style={{ minWidth: "140px", background: "#1e2231", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors"
              style={{
                background: lang === l.code ? "rgba(255,255,255,0.12)" : "transparent",
                color: lang === l.code ? "#fff" : "rgba(255,255,255,0.7)",
                border: "none", cursor: "pointer"
              }}
              data-testid={`button-lang-${l.code}`}
            >
              <span className="text-base">{l.flag}</span>
              <span>{l.label}</span>
              {lang === l.code && <span className="ml-auto text-green-400 text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const CRYPTO_TX_STATUS: Record<string, { bg: string; color: string; label: string }> = {
  new:        { bg: "#e3f2fd", color: "#1976d2", label: "Nouveau" },
  pending:    { bg: "#e3f2fd", color: "#1976d2", label: "En attente" },
  waiting:    { bg: "#e3f2fd", color: "#1976d2", label: "En attente" },
  confirming: { bg: "#fff3e0", color: "#fb8c00", label: "Confirmation" },
  paying:     { bg: "#e8f5e9", color: "#43a047", label: "Reçu" },
  paid:       { bg: "#e8f5e9", color: "#2e7d32", label: "Confirmé" },
  expired:    { bg: "#f5f5f5", color: "#757575", label: "Expiré" },
  failed:     { bg: "#ffebee", color: "#c62828", label: "Échoué" },
  refunded:   { bg: "#efebe9", color: "#6d4c41", label: "Remboursé" },
};

const WITHDRAWAL_STATUS: Record<string, { bg: string; color: string; label: string }> = {
  pending:    { bg: "#e3f2fd", color: "#1976d2", label: "En attente" },
  processing: { bg: "#fff3e0", color: "#fb8c00", label: "En cours" },
  completed:  { bg: "#e8f5e9", color: "#2e7d32", label: "Complété" },
  rejected:   { bg: "#ffebee", color: "#c62828", label: "Rejeté" },
};

const CRYPTO_NETWORKS: Record<string, string[]> = {
  USDT: ["TRC20", "ERC20", "BEP20"],
  BTC:  ["Bitcoin"],
  ETH:  ["ERC20"],
  LTC:  ["Litecoin"],
  TRX:  ["TRC20"],
  BNB:  ["BEP20"],
  SOL:  ["Solana"],
  DOGE: ["Dogecoin"],
  XRP:  ["XRP Ledger"],
  DAI:  ["ERC20", "BEP20"],
};

const SUPPORTED_INVOICE_CURRENCIES = ["USDT", "BTC", "ETH", "LTC", "TRX", "BNB", "SOL", "DOGE"];

function CryptoPanel({ token, user }: { token: string | null; user: any }) {
  const queryClient = useQueryClient();
  const [cryptoTab, setCryptoTab] = useState<"balances" | "invoice" | "withdrawals" | "transactions" | "api">("balances");

  const { data: aggs = [], isLoading: aggLoading } = useMerchantFetch(
    "/api/merchant/crypto-aggregators",
    ["/api/merchant/crypto-aggregators"],
    token
  );
  const { data: cryptoTxs = [], isLoading: txLoading } = useMerchantFetch(
    "/api/merchant/crypto/transactions",
    ["/api/merchant/crypto/transactions"],
    token
  );
  const { data: cryptoBalancesData = [] } = useMerchantFetch(
    "/api/merchant/crypto/balances",
    ["/api/merchant/crypto/balances"],
    token
  );
  const { data: cryptoKeyData } = useMerchantFetch(
    "/api/merchant/crypto/api-key",
    ["/api/merchant/crypto/api-key"],
    token
  );
  const { data: withdrawalsData = [], isLoading: wrLoading } = useMerchantFetch(
    "/api/merchant/crypto/withdrawals",
    ["/api/merchant/crypto/withdrawals"],
    token
  );

  const aggList = aggs as { id: number; name: string; type: string; countries: string[] }[];
  const balances = cryptoBalancesData as { currency: string; balance: string }[];
  const txs = (cryptoTxs as any[]).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const withdrawals = (withdrawalsData as any[]).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const isEnabled = aggList.length > 0;
  const cryptoApiKey = (cryptoKeyData as any)?.cryptoApiKey || null;

  const { data: cryptoWebhookData } = useMerchantFetch("/api/merchant/webhook", ["/api/merchant/webhook"], token);
  const [cryptoWebhookUrl, setCryptoWebhookUrl] = useState("");
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const { toast: cryptoToast } = useToast();

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  };

  const handleRegenerateKey = async () => {
    if (!confirm("Régénérer la clé API crypto ? L'ancienne clé sera immédiatement invalidée.")) return;
    setIsRegenerating(true);
    try {
      const res = await fetch("/api/merchant/crypto/regenerate-api-key", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Échec de la régénération");
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/crypto/api-key"] });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsRegenerating(false);
    }
  };

  // ── Webhook sync ─────────────────────────────────────────────────────────
  useEffect(() => {
    if ((cryptoWebhookData as any)?.webhookUrl) setCryptoWebhookUrl((cryptoWebhookData as any).webhookUrl);
  }, [cryptoWebhookData]);

  const handleSaveCryptoWebhook = async () => {
    setIsSavingWebhook(true);
    try {
      const res = await fetch("/api/merchant/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ webhookUrl: cryptoWebhookUrl.trim() }),
      });
      if (!res.ok) throw new Error("Erreur lors de la sauvegarde");
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/webhook"] });
      cryptoToast({ title: "Webhook enregistré" });
    } catch (e: any) {
      cryptoToast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setIsSavingWebhook(false);
    }
  };

  // ── Retrait ──────────────────────────────────────────────────────────────
  const [withdrawModal, setWithdrawModal] = useState<{ currency: string; available: string } | null>(null);
  const [wdAddress, setWdAddress] = useState("");
  const [wdNetwork, setWdNetwork] = useState("");
  const [wdAmount, setWdAmount] = useState("");
  const [wdLoading, setWdLoading] = useState(false);
  const [wdError, setWdError] = useState("");

  const openWithdrawModal = (currency: string, available: string) => {
    setWithdrawModal({ currency, available });
    setWdAddress(""); setWdNetwork(""); setWdAmount(""); setWdError("");
    const nets = CRYPTO_NETWORKS[currency] || [];
    setWdNetwork(nets[0] || "");
  };

  const handleWithdraw = async () => {
    setWdError("");
    if (!wdAddress.trim()) { setWdError("Adresse requise"); return; }
    const amt = parseFloat(wdAmount);
    if (isNaN(amt) || amt <= 0) { setWdError("Montant invalide"); return; }
    const avail = parseFloat(withdrawModal?.available || "0");
    if (amt > avail) { setWdError(`Montant dépasse le solde disponible (${avail.toFixed(6)} ${withdrawModal?.currency})`); return; }
    setWdLoading(true);
    try {
      const res = await fetch("/api/merchant/crypto/withdraw", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ currency: withdrawModal?.currency, amount: amt, walletAddress: wdAddress, network: wdNetwork }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/crypto/balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/crypto/withdrawals"] });
      setWithdrawModal(null);
      setCryptoTab("withdrawals");
    } catch (e: any) {
      setWdError(e.message);
    } finally {
      setWdLoading(false);
    }
  };

  // ── Créer un lien de paiement crypto ─────────────────────────────────────
  const [invDescription, setInvDescription] = useState("");
  const [invReturnUrl, setInvReturnUrl] = useState("");
  const [invFreePrice, setInvFreePrice] = useState(false);
  const [invAmount, setInvAmount] = useState("");
  const [invSelectedCurrencies, setInvSelectedCurrencies] = useState<string[]>(["USDT"]);
  const [invLoading, setInvLoading] = useState(false);
  const [invResults, setInvResults] = useState<Array<{ paymentUrl: string; currency: string; name: string }>>([]);
  const [invError, setInvError] = useState("");

  const INVOICE_CURRENCIES = ["USDT", "BTC", "ETH", "LTC", "TRX", "MATIC", "BNB", "DOGE"];

  const toggleInvCurrency = (c: string) => {
    setInvSelectedCurrencies(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    );
  };

  const handleSelectAllCurrencies = () => {
    if (invSelectedCurrencies.length === INVOICE_CURRENCIES.length) {
      setInvSelectedCurrencies(["USDT"]);
    } else {
      setInvSelectedCurrencies([...INVOICE_CURRENCIES]);
    }
  };

  const handleCreateInvoice = async () => {
    setInvError(""); setInvResults([]);
    if (!invDescription.trim()) { setInvError("Nom du produit requis"); return; }
    if (invSelectedCurrencies.length === 0) { setInvError("Sélectionnez au moins une cryptomonnaie"); return; }
    const amt = invFreePrice ? 0 : parseFloat(invAmount);
    if (!invFreePrice && (isNaN(amt) || amt <= 0)) { setInvError("Montant invalide"); return; }
    setInvLoading(true);
    try {
      const results: Array<{ paymentUrl: string; currency: string; name: string }> = [];
      for (const currency of invSelectedCurrencies) {
        const res = await fetch("/api/merchant/crypto-links", {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: invDescription.trim(),
            currency,
            amountType: invFreePrice ? "libre" : "fixed",
            amount: invFreePrice ? undefined : amt,
            description: invDescription.trim(),
            returnUrl: invReturnUrl.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) { setInvError(data.message || "Erreur de création"); setInvLoading(false); return; }
        results.push({ currency, paymentUrl: data.url, name: invDescription.trim() });
      }
      setInvResults(results);
    } catch (e: any) {
      setInvError(e.message || "Erreur inattendue");
    } finally {
      setInvLoading(false);
    }
  };

  if (aggLoading) return <MerchantLoadingSkeleton />;

  const CRYPTO_TABS: { key: typeof cryptoTab; label: string }[] = [
    { key: "balances",     label: "Soldes" },
    { key: "invoice",      label: "Créer un lien" },
    { key: "withdrawals",  label: "Retraits" },
    { key: "transactions", label: "Transactions" },
    { key: "api",          label: "API" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1" style={{ color: "#1a237e" }}>Paiements Crypto</h2>
        <p className="text-sm" style={{ color: "#546e7a" }}>
          Acceptez des cryptomonnaies via RobotPay — USDT, BTC, ETH, LTC, TRX et plus. Mondial, sans restriction de pays.
        </p>
      </div>

      {!isEnabled ? (
        <div className="rounded-xl p-6 text-center" style={{ background: "#fff", border: "1px solid #e2e8f0" }}>
          <Bitcoin className="w-10 h-10 mx-auto mb-3" style={{ color: "#e2e8f0" }} />
          <p className="text-sm font-medium" style={{ color: "#546e7a" }}>Paiements crypto non activés</p>
          <p className="text-xs mt-1" style={{ color: "#90a4ae" }}>
            Contactez l'administrateur pour activer les paiements crypto sur votre compte.
          </p>
        </div>
      ) : (
        <>
          {/* Sous-onglets */}
          <div className="flex gap-1 flex-wrap" style={{ borderBottom: "2px solid #e2e8f0", paddingBottom: 0 }}>
            {CRYPTO_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setCryptoTab(tab.key)}
                className="px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors"
                style={{
                  background: cryptoTab === tab.key ? "#fff" : "transparent",
                  color: cryptoTab === tab.key ? "#1a237e" : "#90a4ae",
                  borderBottom: cryptoTab === tab.key ? "2px solid #1a237e" : "2px solid transparent",
                  marginBottom: -2,
                }}
                data-testid={`tab-crypto-${tab.key}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Soldes ── */}
          {cryptoTab === "balances" && (
            <div className="space-y-4">
              <div className="rounded-lg px-3 py-2 text-xs flex items-start gap-2" style={{ background: "#fef9c3", border: "1px solid #fde047", color: "#713f12" }}>
                <span className="text-base leading-none mt-0.5">💡</span>
                <span>
                  <strong>Frais RobotPay :</strong> 5% sur chaque dépôt reçu et 5% sur chaque retrait. Ces frais sont déduits automatiquement.
                </span>
              </div>
              {balances.length === 0 ? (
                <div className="rounded-xl p-6 text-center" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <Bitcoin className="w-8 h-8 mx-auto mb-2" style={{ color: "#e2e8f0" }} />
                  <p className="text-sm" style={{ color: "#90a4ae" }}>Aucun solde crypto pour le moment.</p>
                  <p className="text-xs mt-1" style={{ color: "#b0bec5" }}>Les soldes s'accumulent après chaque paiement reçu.</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {balances.map((b) => {
                    const nets = CRYPTO_NETWORKS[b.currency.toUpperCase()] || [];
                    return (
                      <div
                        key={b.currency}
                        className="rounded-xl p-4 space-y-3"
                        style={{ background: "#fff", border: "1px solid #e2e8f0" }}
                        data-testid={`card-crypto-balance-${b.currency}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "#fff8e1" }}>
                            <Bitcoin className="w-4 h-4" style={{ color: "#f59e0b" }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold uppercase" style={{ color: "#90a4ae" }}>{b.currency}</p>
                            <p className="text-lg font-bold" style={{ color: "#1a237e" }}>
                              {parseFloat(b.balance).toFixed(6)}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => openWithdrawModal(b.currency, b.balance)}
                          className="w-full text-xs font-semibold py-1.5 rounded-lg"
                          style={{ background: "#e3f2fd", color: "#1565c0", border: "1px solid #bbdefb" }}
                          data-testid={`btn-withdraw-${b.currency}`}
                        >
                          Retirer
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Lien de paiement crypto ── */}
          {cryptoTab === "invoice" && (
            <div className="space-y-4">
              <div className="rounded-xl p-5 space-y-5" style={{ background: "#fff", border: "1px solid #e2e8f0" }}>

                {/* Nom du produit */}
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "#546e7a" }}>Nom du produit *</label>
                  <input
                    type="text"
                    value={invDescription}
                    onChange={e => setInvDescription(e.target.value)}
                    placeholder="ex: Abonnement Premium, Commande #123..."
                    className="w-full text-sm px-3 py-2.5 rounded-lg"
                    style={{ border: "1px solid #e2e8f0", background: "#f8fafc", color: "#1a237e" }}
                    data-testid="input-invoice-description"
                  />
                </div>

                {/* Prix */}
                <div>
                  <label className="block text-xs font-semibold mb-2" style={{ color: "#546e7a" }}>Prix</label>
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => setInvFreePrice(false)}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors"
                      style={{
                        background: !invFreePrice ? "#1a237e" : "#f1f5f9",
                        color: !invFreePrice ? "#fff" : "#546e7a",
                        border: `1px solid ${!invFreePrice ? "#1a237e" : "#e2e8f0"}`,
                      }}
                      data-testid="btn-price-fixed"
                    >
                      Prix fixé
                    </button>
                    <button
                      onClick={() => setInvFreePrice(true)}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors"
                      style={{
                        background: invFreePrice ? "#1a237e" : "#f1f5f9",
                        color: invFreePrice ? "#fff" : "#546e7a",
                        border: `1px solid ${invFreePrice ? "#1a237e" : "#e2e8f0"}`,
                      }}
                      data-testid="btn-price-free"
                    >
                      Prix libre
                    </button>
                  </div>
                  {!invFreePrice ? (
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      value={invAmount}
                      onChange={e => setInvAmount(e.target.value)}
                      placeholder="Montant (ex: 10)"
                      className="w-full text-sm px-3 py-2.5 rounded-lg"
                      style={{ border: "1px solid #e2e8f0", background: "#f8fafc", color: "#1a237e" }}
                      data-testid="input-invoice-amount"
                    />
                  ) : (
                    <div className="rounded-lg px-3 py-2.5 text-xs" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534" }}>
                      Le client saisit lui-même le montant qu'il souhaite payer.
                    </div>
                  )}
                </div>

                {/* Cryptomonnaies */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold" style={{ color: "#546e7a" }}>Cryptomonnaies à accepter *</label>
                    <button
                      onClick={handleSelectAllCurrencies}
                      className="text-xs font-semibold px-2 py-1 rounded"
                      style={{ background: invSelectedCurrencies.length === INVOICE_CURRENCIES.length ? "#e8eaf6" : "#f1f5f9", color: "#1a237e" }}
                      data-testid="btn-select-all-currencies"
                    >
                      {invSelectedCurrencies.length === INVOICE_CURRENCIES.length ? "Tout désélectionner" : "Tout sélectionner"}
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {INVOICE_CURRENCIES.map(c => {
                      const selected = invSelectedCurrencies.includes(c);
                      return (
                        <button
                          key={c}
                          onClick={() => toggleInvCurrency(c)}
                          className="flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-bold transition-all"
                          style={{
                            background: selected ? "#e8eaf6" : "#f8fafc",
                            color: selected ? "#1a237e" : "#90a4ae",
                            border: selected ? "2px solid #1a237e" : "1.5px solid #e2e8f0",
                          }}
                          data-testid={`btn-currency-${c}`}
                        >
                          {selected && <span className="text-xs mb-0.5" style={{ color: "#1a237e" }}>✓</span>}
                          {c}
                        </button>
                      );
                    })}
                  </div>
                  {invSelectedCurrencies.length > 1 && (
                    <p className="text-xs mt-2" style={{ color: "#78909c" }}>
                      {invSelectedCurrencies.length} cryptomonnaies sélectionnées — un lien distinct sera créé pour chacune.
                    </p>
                  )}
                </div>

                {/* URL de retour */}
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "#546e7a" }}>URL de retour (facultatif)</label>
                  <input
                    type="url"
                    value={invReturnUrl}
                    onChange={e => setInvReturnUrl(e.target.value)}
                    placeholder="https://monsite.com/merci"
                    className="w-full text-sm px-3 py-2.5 rounded-lg"
                    style={{ border: "1px solid #e2e8f0", background: "#f8fafc", color: "#1a237e" }}
                    data-testid="input-invoice-returnurl"
                  />
                </div>

                {invError && (
                  <div className="text-xs p-2 rounded-lg" style={{ background: "#ffebee", color: "#c62828" }}>{invError}</div>
                )}

                <button
                  onClick={handleCreateInvoice}
                  disabled={invLoading}
                  className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                  style={{ background: invLoading ? "#9fa8da" : "#1a237e", color: "#fff" }}
                  data-testid="btn-create-invoice"
                >
                  {invLoading && <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {invLoading ? "Création en cours…" : "Générer le lien de paiement"}
                </button>
              </div>

              {invResults.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold" style={{ color: "#2e7d32" }}>
                      ✓ {invResults.length === 1 ? "Lien généré !" : `${invResults.length} liens générés !`}
                    </p>
                    <button
                      onClick={() => { setInvResults([]); setInvAmount(""); setInvDescription(""); setInvReturnUrl(""); setInvFreePrice(false); setInvSelectedCurrencies(["USDT"]); }}
                      className="text-xs underline"
                      style={{ color: "#546e7a" }}
                    >
                      Nouveau lien
                    </button>
                  </div>
                  <p className="text-xs" style={{ color: "#78909c" }}>
                    Partagez ce lien à votre client. Le paiement sera initié quand il clique dessus.
                  </p>
                  {invResults.map(r => (
                    <div key={r.currency} className="rounded-xl p-4 space-y-2" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: "#fff8e1", color: "#f59e0b" }}>{r.currency}</span>
                      <div className="flex items-center gap-2 mt-2">
                        <a
                          href={r.paymentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-xs font-mono break-all underline"
                          style={{ color: "#1565c0" }}
                          data-testid={`link-invoice-${r.currency}`}
                        >
                          {r.paymentUrl}
                        </a>
                        <button
                          onClick={() => copyToClipboard(r.paymentUrl, `inv-${r.currency}`)}
                          className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-semibold"
                          style={{ background: "#c8e6c9", color: "#2e7d32" }}
                          data-testid={`btn-copy-invoice-${r.currency}`}
                        >
                          {copiedKey === `inv-${r.currency}` ? "Copié !" : "Copier"}
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => { setInvResults([]); setInvAmount(""); setInvDescription(""); setInvReturnUrl(""); setInvFreePrice(false); setInvSelectedCurrencies(["USDT"]); }}
                    className="text-xs underline"
                    style={{ color: "#546e7a" }}
                  >
                    Créer un nouveau lien
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Retraits ── */}
          {cryptoTab === "withdrawals" && (
            <div className="space-y-3">
              {wrLoading ? (
                <MerchantLoadingSkeleton />
              ) : withdrawals.length === 0 ? (
                <div className="rounded-xl p-6 text-center" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <p className="text-sm" style={{ color: "#90a4ae" }}>Aucune demande de retrait pour le moment.</p>
                  <p className="text-xs mt-1" style={{ color: "#b0bec5" }}>Allez dans "Soldes" pour initier un retrait.</p>
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0" }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          <th className="text-left px-4 py-3 font-semibold" style={{ color: "#546e7a" }}>Date</th>
                          <th className="text-left px-4 py-3 font-semibold" style={{ color: "#546e7a" }}>Crypto</th>
                          <th className="text-left px-4 py-3 font-semibold" style={{ color: "#546e7a" }}>Montant brut</th>
                          <th className="text-left px-4 py-3 font-semibold" style={{ color: "#dc2626" }}>Frais (5%)</th>
                          <th className="text-left px-4 py-3 font-semibold" style={{ color: "#166534" }}>Net reçu</th>
                          <th className="text-left px-4 py-3 font-semibold" style={{ color: "#546e7a" }}>Adresse</th>
                          <th className="text-left px-4 py-3 font-semibold" style={{ color: "#546e7a" }}>Réseau</th>
                          <th className="text-left px-4 py-3 font-semibold" style={{ color: "#546e7a" }}>Statut</th>
                        </tr>
                      </thead>
                      <tbody style={{ background: "#fff" }}>
                        {withdrawals.map((wr: any, idx: number) => {
                          const s = WITHDRAWAL_STATUS[wr.status] || WITHDRAWAL_STATUS["pending"];
                          return (
                            <tr
                              key={wr.id}
                              style={{ borderTop: idx > 0 ? "1px solid #f0f4f8" : "none" }}
                              data-testid={`row-withdrawal-${wr.id}`}
                            >
                              <td className="px-4 py-3" style={{ color: "#546e7a" }}>
                                {new Date(wr.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                              </td>
                              <td className="px-4 py-3 font-bold" style={{ color: "#f59e0b" }}>{wr.currency}</td>
                              <td className="px-4 py-3 font-semibold" style={{ color: "#1a237e" }}>{parseFloat(wr.amount).toFixed(6)}</td>
                              <td className="px-4 py-3 font-mono" style={{ color: "#dc2626" }}>
                                −{wr.feeAmount ? parseFloat(wr.feeAmount).toFixed(6) : (parseFloat(wr.amount) * 0.05).toFixed(6)}
                              </td>
                              <td className="px-4 py-3 font-semibold font-mono" style={{ color: "#166534" }}>
                                {wr.netAmount ? parseFloat(wr.netAmount).toFixed(6) : (parseFloat(wr.amount) * 0.95).toFixed(6)}
                              </td>
                              <td className="px-4 py-3 font-mono max-w-[120px] truncate" style={{ color: "#546e7a" }} title={wr.walletAddress}>
                                {wr.walletAddress.slice(0, 10)}...{wr.walletAddress.slice(-6)}
                              </td>
                              <td className="px-4 py-3" style={{ color: "#546e7a" }}>{wr.network || "—"}</td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-0.5 rounded-full font-bold" style={{ background: s.bg, color: s.color }}>
                                  {s.label}
                                </span>
                                {wr.adminNote && (
                                  <p className="text-xs mt-1" style={{ color: "#78909c" }}>{wr.adminNote}</p>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Transactions ── */}
          {cryptoTab === "transactions" && (
            <div>
              {txLoading ? (
                <MerchantLoadingSkeleton />
              ) : txs.length === 0 ? (
                <div className="rounded-xl p-6 text-center" style={{ background: "#fff", border: "1px solid #e2e8f0" }}>
                  <p className="text-sm font-medium" style={{ color: "#546e7a" }}>Aucune transaction crypto pour le moment.</p>
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0" }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          <th className="text-left px-4 py-3 font-semibold" style={{ color: "#546e7a" }}>Track ID</th>
                          <th className="text-left px-4 py-3 font-semibold" style={{ color: "#546e7a" }}>Montant</th>
                          <th className="text-left px-4 py-3 font-semibold" style={{ color: "#546e7a" }}>Crypto reçu</th>
                          <th className="text-left px-4 py-3 font-semibold" style={{ color: "#546e7a" }}>Statut</th>
                          <th className="text-left px-4 py-3 font-semibold" style={{ color: "#546e7a" }}>Date</th>
                          <th className="text-left px-4 py-3 font-semibold" style={{ color: "#546e7a" }}>Page</th>
                        </tr>
                      </thead>
                      <tbody style={{ background: "#fff" }}>
                        {txs.map((tx: any, idx: number) => {
                          const s = CRYPTO_TX_STATUS[tx.status] || CRYPTO_TX_STATUS["new"];
                          return (
                            <tr
                              key={tx.id}
                              style={{ borderTop: idx > 0 ? "1px solid #f0f4f8" : "none" }}
                              data-testid={`row-crypto-tx-${tx.id}`}
                            >
                              <td className="px-4 py-3 font-mono" style={{ color: "#1565c0" }}>
                                {tx.trackId?.substring(0, 12)}...
                              </td>
                              <td className="px-4 py-3 font-semibold" style={{ color: "#1a237e" }}>
                                {tx.amount} {tx.currency}
                              </td>
                              <td className="px-4 py-3" style={{ color: "#43a047" }}>
                                {tx.payAmount ? (
                                  <span className="font-semibold">{tx.payAmount} {tx.payCurrency}</span>
                                ) : (
                                  <span style={{ color: "#b0bec5" }}>—</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-0.5 rounded-full font-bold" style={{ background: s.bg, color: s.color }}>
                                  {s.label}
                                </span>
                              </td>
                              <td className="px-4 py-3" style={{ color: "#546e7a" }}>
                                {new Date(tx.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                              </td>
                              <td className="px-4 py-3">
                                <a
                                  href={`/pay/crypto/${tx.trackId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 font-semibold hover:underline"
                                  style={{ color: "#1976d2" }}
                                  data-testid={`link-crypto-payment-${tx.id}`}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Voir
                                </a>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── API ── */}
          {cryptoTab === "api" && (
            <div className="space-y-4">
              {/* Clé API */}
              <div className="rounded-xl p-4 space-y-3" style={{ background: "#fff", border: "1px solid #e2e8f0" }}>
                <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: "#90a4ae" }}>Clé API Crypto</h3>
                <p className="text-xs" style={{ color: "#546e7a" }}>
                  Clé dédiée aux paiements crypto. Globale (non liée à un pays), utilisable indépendamment du mobile money.
                </p>
                {cryptoApiKey ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <code
                        className="flex-1 text-xs px-3 py-2 rounded-lg font-mono break-all"
                        style={{ background: "#f1f5f9", color: "#1565c0", border: "1px solid #e2e8f0" }}
                        data-testid="text-crypto-api-key"
                      >
                        {cryptoApiKey}
                      </code>
                      <button
                        onClick={() => copyToClipboard(cryptoApiKey, "crypto-key")}
                        className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold"
                        style={{ background: copiedKey === "crypto-key" ? "#e8f5e9" : "#e3f2fd", color: copiedKey === "crypto-key" ? "#2e7d32" : "#1565c0" }}
                        data-testid="btn-copy-crypto-key"
                      >
                        {copiedKey === "crypto-key" ? "Copié !" : "Copier"}
                      </button>
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={handleRegenerateKey}
                        disabled={isRegenerating}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                        style={{ background: "#fff8e1", color: "#f59e0b", border: "1px solid #fde68a" }}
                        data-testid="btn-regenerate-crypto-key"
                      >
                        {isRegenerating ? "Régénération..." : "Régénérer la clé"}
                      </button>
                    </div>
                    <p className="text-xs" style={{ color: "#b0bec5" }}>
                      Header : <code className="font-mono" style={{ color: "#546e7a" }}>X-API-KEY: {cryptoApiKey}</code>
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg text-xs" style={{ background: "#f8fafc", color: "#90a4ae" }}>
                    Aucune clé API crypto. Contactez l'administrateur.
                  </div>
                )}
              </div>

              {/* Webhook URL crypto */}
              <div className="rounded-xl p-4 space-y-3" style={{ background: "#fff", border: "1px solid #e2e8f0" }}>
                <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: "#90a4ae" }}>URL Webhook Crypto</h3>
                <p className="text-xs" style={{ color: "#546e7a" }}>
                  RobotPay envoie une notification <code className="font-mono bg-slate-100 px-1 rounded">POST</code> à cette URL dès qu'un paiement crypto est confirmé.
                </p>
                {(cryptoWebhookData as any)?.webhookUrl && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono" style={{ background: "#e8f5e9", border: "1px solid #a5d6a7", color: "#2e7d32" }}>
                    <span className="text-green-600">✓</span>
                    <span className="flex-1 truncate">{(cryptoWebhookData as any).webhookUrl}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={cryptoWebhookUrl}
                    onChange={e => setCryptoWebhookUrl(e.target.value)}
                    placeholder="https://monsite.com/webhook/robotpay"
                    className="flex-1 text-xs px-3 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-200"
                    style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
                    data-testid="input-crypto-webhook-url"
                  />
                  <button
                    onClick={handleSaveCryptoWebhook}
                    disabled={isSavingWebhook || !cryptoWebhookUrl.trim()}
                    className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold"
                    style={{ background: "#1a237e", color: "#fff", opacity: isSavingWebhook || !cryptoWebhookUrl.trim() ? 0.6 : 1 }}
                    data-testid="btn-save-crypto-webhook"
                  >
                    {isSavingWebhook ? "..." : "Enregistrer"}
                  </button>
                </div>
                <p className="text-xs" style={{ color: "#b0bec5" }}>
                  Signature HMAC envoyée dans le header <code className="font-mono">X-RobotPay-Signature</code>
                </p>
              </div>

              {/* Bouton documentation */}
              <div className="rounded-xl p-4 space-y-3" style={{ background: "#fff", border: "1px solid #e2e8f0" }}>
                <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: "#90a4ae" }}>Documentation</h3>
                <p className="text-xs" style={{ color: "#546e7a" }}>
                  Consultez la documentation complète : lien de paiement, API invoice, vérification de statut, webhooks, exemples de code PHP / JavaScript / cURL.
                </p>
                <button
                  onClick={() => window.open("/crypto-docs", "_blank")}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #f59e0b 0%, #1a237e 100%)", color: "#fff" }}
                  data-testid="btn-open-crypto-docs"
                >
                  <span>📄</span>
                  Ouvrir la documentation API Crypto
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Modal retrait ── */}
      {withdrawModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setWithdrawModal(null)}
          data-testid="modal-withdraw"
        >
          <div
            className="rounded-2xl p-6 w-full max-w-md space-y-4 mx-4"
            style={{ background: "#fff", border: "1px solid #e2e8f0" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold" style={{ color: "#1a237e" }}>Retirer {withdrawModal.currency}</h3>
                <p className="text-xs" style={{ color: "#90a4ae" }}>
                  Disponible : {parseFloat(withdrawModal.available).toFixed(6)} {withdrawModal.currency}
                </p>
              </div>
              <button
                onClick={() => setWithdrawModal(null)}
                className="text-lg font-bold"
                style={{ color: "#90a4ae" }}
                data-testid="btn-close-withdraw-modal"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "#546e7a" }}>Montant ({withdrawModal.currency}) *</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={wdAmount}
                  onChange={e => setWdAmount(e.target.value)}
                  placeholder={`Max: ${parseFloat(withdrawModal.available).toFixed(6)}`}
                  className="w-full text-sm px-3 py-2 rounded-lg"
                  style={{ border: "1px solid #e2e8f0", background: "#f8fafc", color: "#1a237e" }}
                  data-testid="input-withdraw-amount"
                />
                <button
                  onClick={() => setWdAmount(parseFloat(withdrawModal.available).toFixed(8))}
                  className="text-xs mt-1 underline"
                  style={{ color: "#1565c0" }}
                >
                  Max
                </button>
              </div>

              {(CRYPTO_NETWORKS[withdrawModal.currency.toUpperCase()] || []).length > 0 && (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "#546e7a" }}>Réseau *</label>
                  <select
                    value={wdNetwork}
                    onChange={e => setWdNetwork(e.target.value)}
                    className="w-full text-sm px-3 py-2 rounded-lg"
                    style={{ border: "1px solid #e2e8f0", background: "#f8fafc", color: "#1a237e" }}
                    data-testid="select-withdraw-network"
                  >
                    {(CRYPTO_NETWORKS[withdrawModal.currency.toUpperCase()] || []).map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "#546e7a" }}>Adresse de destination *</label>
                <input
                  type="text"
                  value={wdAddress}
                  onChange={e => setWdAddress(e.target.value)}
                  placeholder="Votre adresse crypto"
                  className="w-full text-sm px-3 py-2 rounded-lg font-mono"
                  style={{ border: "1px solid #e2e8f0", background: "#f8fafc", color: "#1a237e" }}
                  data-testid="input-withdraw-address"
                />
              </div>

              {wdAmount && !isNaN(parseFloat(wdAmount)) && parseFloat(wdAmount) > 0 && (
                <div className="p-3 rounded-lg text-xs space-y-1" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                  <div className="flex justify-between" style={{ color: "#374151" }}>
                    <span>Montant demandé</span>
                    <span className="font-mono font-semibold">{parseFloat(wdAmount).toFixed(6)} {withdrawModal.currency}</span>
                  </div>
                  <div className="flex justify-between" style={{ color: "#dc2626" }}>
                    <span>Frais RobotPay (5%)</span>
                    <span className="font-mono">−{(parseFloat(wdAmount) * 0.05).toFixed(6)} {withdrawModal.currency}</span>
                  </div>
                  <div className="h-px my-1" style={{ background: "#bbf7d0" }} />
                  <div className="flex justify-between font-bold" style={{ color: "#166534" }}>
                    <span>Vous recevez</span>
                    <span className="font-mono">{(parseFloat(wdAmount) * 0.95).toFixed(6)} {withdrawModal.currency}</span>
                  </div>
                </div>
              )}

              {wdError && (
                <div className="text-xs p-2 rounded-lg" style={{ background: "#ffebee", color: "#c62828" }}>{wdError}</div>
              )}

              <div className="p-3 rounded-lg text-xs" style={{ background: "#fff8e1", border: "1px solid #fde68a", color: "#92400e" }}>
                ⚠️ Vérifiez soigneusement l'adresse et le réseau. Les retraits crypto sont irréversibles.
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setWithdrawModal(null)}
                className="flex-1 py-2 rounded-lg text-sm font-semibold"
                style={{ background: "#f1f5f9", color: "#546e7a" }}
                data-testid="btn-cancel-withdraw"
              >
                Annuler
              </button>
              <button
                onClick={handleWithdraw}
                disabled={wdLoading}
                className="flex-1 py-2 rounded-lg text-sm font-bold"
                style={{ background: wdLoading ? "#e2e8f0" : "#1a237e", color: wdLoading ? "#90a4ae" : "#fff" }}
                data-testid="btn-confirm-withdraw"
              >
                {wdLoading ? "Envoi..." : "Confirmer le retrait"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const NAV_ITEMS: { key: MerchantTab; icon: any; color: string }[] = [
  { key: "overview",      icon: BarChart3,    color: "#1976d2" },
  { key: "transactions",  icon: Receipt,      color: "#26a69a" },
  { key: "virements",     icon: ArrowRightLeft, color: "#7e57c2" },
  { key: "reversements",  icon: Download,     color: "#fb8c00" },
  { key: "paymentlinks",  icon: Link,         color: "#e57373" },
  { key: "crypto",        icon: Bitcoin,      color: "#f59e0b" },
  { key: "sdk",           icon: BookOpen,     color: "#8b5cf6" },
  { key: "apikeys",       icon: Key,          color: "#039be5" },
  { key: "webhook",       icon: Webhook,      color: "#43a047" },
  { key: "settings",      icon: Settings,     color: "#6d4c41" },
];

function NavItem({
  icon: Icon, label, color, active, collapsed, onClick, testId
}: {
  icon: any; label: string; color: string; active: boolean;
  collapsed: boolean; onClick: () => void; testId: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className="w-full flex items-center gap-3 rounded-xl transition-all duration-150 text-left group"
      style={{
        padding: collapsed ? "10px" : "9px 12px",
        justifyContent: collapsed ? "center" : undefined,
        background: active ? "#00b050" : "transparent",
        color: active ? "#fff" : "rgba(255,255,255,0.55)",
      }}
      title={collapsed ? label : undefined}
    >
      <div
        className="flex items-center justify-center rounded-lg shrink-0 transition-all"
        style={{
          width: 32, height: 32,
          background: active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
        }}
      >
        <Icon className="w-4 h-4" style={{ color: active ? "#fff" : color }} />
      </div>
      {!collapsed && (
        <span className="text-sm font-medium truncate">{label}</span>
      )}
      {!collapsed && active && (
        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/70 shrink-0" />
      )}
    </button>
  );
}

function MerchantSidebarContent({
  user, activeTab, collapsed, onTabChange, onLogout, t, hasCrypto, hasSdk
}: {
  user: any; activeTab: MerchantTab; collapsed: boolean;
  onTabChange: (tab: MerchantTab) => void; onLogout: () => void;
  t: (key: string) => string;
  hasCrypto: boolean;
  hasSdk: boolean;
}) {
  const visibleNavItems = NAV_ITEMS.filter(item => {
    if (item.key === "crypto") return hasCrypto;
    if (item.key === "sdk") return hasSdk;
    return true;
  });

  return (
    <div className="flex flex-col h-full select-none">
      <div className="px-3 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
          <div
            className="flex items-center justify-center rounded-xl shrink-0 shadow-md"
            style={{ width: 38, height: 38, background: "linear-gradient(135deg,#00b050,#00832a)" }}
          >
            <span className="text-white font-black text-base">W</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-bold text-white leading-tight tracking-wide">WestPay</p>
              <p className="text-xs truncate leading-tight" style={{ color: "rgba(255,255,255,0.45)", maxWidth: 150 }}>{user?.name}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {visibleNavItems.map(item => (
          <NavItem
            key={item.key}
            icon={item.icon}
            label={
              item.key === "virements" ? t("transfers") :
              item.key === "reversements" ? t("withdrawals") :
              item.key === "paymentlinks" ? t("paymentlinks") :
              item.key === "apikeys" ? t("apikeys") :
              item.key === "crypto" ? "Crypto" :
              t(item.key)
            }
            color={item.color}
            active={activeTab === item.key}
            collapsed={collapsed}
            onClick={() => onTabChange(item.key)}
            testId={`merchant-nav-${item.key}`}
          />
        ))}
      </div>

      <div className="p-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <button
          onClick={onLogout}
          data-testid="button-merchant-logout"
          className="w-full flex items-center gap-3 rounded-xl transition-all duration-150"
          style={{
            padding: collapsed ? "10px" : "9px 12px",
            justifyContent: collapsed ? "center" : undefined,
            color: "rgba(255,255,255,0.45)",
          }}
          title={collapsed ? t("logout") : undefined}
        >
          <div className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 32, height: 32, background: "rgba(255,255,255,0.06)" }}>
            <LogOut className="w-4 h-4 text-red-400" />
          </div>
          {!collapsed && <span className="text-sm font-medium text-red-400">{t("logout")}</span>}
        </button>
      </div>
    </div>
  );
}

function SdkDocPanel({ sdkApiKey }: { sdkApiKey: string | null }) {
  const { toast } = useToast();
  const [showKey, setShowKey] = useState(false);
  const copy = (text: string, label = "Copié") => { navigator.clipboard.writeText(text); toast({ title: label }); };
  const BASE_URL = "https://westpay.cloud";
  const KEY_DISPLAY = sdkApiKey ? (showKey ? sdkApiKey : sdkApiKey.slice(0, 10) + "••••••••••••••••••••••••••••••••••••••") : "WP-SDK-...";

  const CodeBlock = ({ code }: { code: string }) => (
    <div className="relative group">
      <pre className="bg-gray-900 text-green-300 text-xs rounded-lg p-4 overflow-x-auto font-mono leading-relaxed whitespace-pre">{code}</pre>
      <button
        onClick={() => copy(code, "Code copié")}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-700 hover:bg-gray-600 text-white rounded px-2 py-1 text-xs flex items-center gap-1"
      >
        <Copy className="w-3 h-3" />Copier
      </button>
    </div>
  );

  const Section = ({ id, title, icon: Icon, children }: { id: string; title: string; icon: any; children: any }) => (
    <div id={id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100" style={{ background: "linear-gradient(90deg,#f8faff,#fff)" }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#1e2231" }}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <h3 className="text-base font-bold text-gray-800">{title}</h3>
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  );

  const EndpointBadge = ({ method }: { method: string }) => (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-bold ${method === "POST" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>{method}</span>
  );

  const ParamRow = ({ name, type, req, desc }: { name: string; type: string; req: boolean; desc: string }) => (
    <tr className="border-b border-gray-50 last:border-0">
      <td className="py-2 pr-3 align-top"><code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono text-gray-800">{name}</code></td>
      <td className="py-2 pr-3 align-top"><span className="text-xs text-gray-500 font-mono">{type}</span></td>
      <td className="py-2 pr-3 align-top">{req ? <span className="text-xs text-red-500 font-medium">Requis</span> : <span className="text-xs text-gray-400">Optionnel</span>}</td>
      <td className="py-2 align-top text-xs text-gray-600">{desc}</td>
    </tr>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.12)" }}>
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold">WestPay SDK API</h2>
            <p className="text-xs text-white/60">Documentation — Payin & Payout Mobile Money</p>
          </div>
        </div>
        <div className="mt-4 bg-white/10 rounded-xl p-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/50 mb-1 font-medium uppercase tracking-widest">Votre Clé SDK</p>
            <code className="text-sm font-mono text-green-300 break-all">{KEY_DISPLAY}</code>
          </div>
          <button onClick={() => setShowKey(v => !v)} className="shrink-0 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition" data-testid="button-toggle-sdk-key">
            {showKey ? <EyeOff className="w-4 h-4 text-white" /> : <Eye className="w-4 h-4 text-white" />}
          </button>
          {sdkApiKey && (
            <button onClick={() => copy(sdkApiKey, "Clé SDK copiée")} className="shrink-0 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition" data-testid="button-copy-sdk-key-merchant">
              <Copy className="w-4 h-4 text-white" />
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/60">
          <span>URL de base: <code className="text-white font-mono">{BASE_URL}</code></span>
          <span>•</span>
          <span>Fournisseur: <span className="text-green-300 font-medium">RobotPay</span></span>
          <span>•</span>
          <span>Version: <span className="text-white font-medium">v1</span></span>
        </div>
      </div>

      {/* Authentication */}
      <Section id="auth" title="Authentification" icon={Key}>
        <p className="text-sm text-gray-600">Toutes les requêtes doivent inclure votre clé SDK dans le header HTTP <code className="bg-gray-100 px-1 rounded font-mono text-xs">X-SDK-Key</code>.</p>
        <CodeBlock code={`curl -X POST ${BASE_URL}/api/sdk/v1/payin \\
  -H "Content-Type: application/json" \\
  -H "X-SDK-Key: ${sdkApiKey || "WP-SDK-VOTRE_CLE"}" \\
  -d '{...}'`} />
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="text-amber-500 text-sm mt-0.5">⚠️</span>
          <p className="text-xs text-amber-700">Ne partagez jamais votre clé SDK publiquement. Stockez-la dans vos variables d'environnement serveur.</p>
        </div>
      </Section>

      {/* Payin */}
      <Section id="payin" title="Payin — Initier un Paiement Entrant" icon={ArrowRightLeft}>
        <div className="flex items-center gap-2">
          <EndpointBadge method="POST" />
          <code className="text-sm font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded">/api/sdk/v1/payin</code>
        </div>
        <p className="text-sm text-gray-600">Déclenche une demande de paiement Mobile Money vers le client. Le client reçoit une notification USSD ou push sur son téléphone.</p>
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-widest">Paramètres du corps (JSON)</p>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-sm min-w-[500px]">
              <thead><tr className="bg-gray-50"><th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Champ</th><th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Type</th><th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Requis</th><th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Description</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                <ParamRow name="amount" type="number" req={true} desc="Montant en unité de la monnaie locale (ex: 5000 pour 5000 XOF)" />
                <ParamRow name="currency" type="string" req={true} desc="Code devise ISO: XOF, XAF, GNF, CDF, GMD" />
                <ParamRow name="order_id" type="string" req={true} desc="Identifiant unique de votre commande (stocké côté serveur)" />
                <ParamRow name="callback_url" type="string" req={true} desc="URL de votre webhook pour recevoir la notification de statut" />
                <ParamRow name="metadata.phone_number" type="string" req={true} desc="Numéro de téléphone du payeur avec indicatif (ex: +22890123456)" />
                <ParamRow name="metadata.network" type="string" req={true} desc="Réseau mobile: mtn, orange, moov, wave, togocom, flooz, airtel, mpesa" />
                <ParamRow name="metadata.country_code" type="string" req={true} desc="Code pays ISO 2 lettres: TG, BJ, CI, SN, ML, BF, CM, CG, CD, GN, GM" />
                <ParamRow name="metadata.customer_name" type="string" req={false} desc="Nom du client (optionnel, pour votre référence)" />
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-widest">Exemple de requête</p>
          <CodeBlock code={`curl -X POST ${BASE_URL}/api/sdk/v1/payin \\
  -H "Content-Type: application/json" \\
  -H "X-SDK-Key: ${sdkApiKey || "WP-SDK-VOTRE_CLE"}" \\
  -d '{
    "amount": 5000,
    "currency": "XOF",
    "order_id": "CMD-2024-001",
    "callback_url": "https://votre-site.com/webhook/paiement",
    "metadata": {
      "phone_number": "+22890123456",
      "network": "moov",
      "country_code": "TG",
      "customer_name": "Jean Dupont"
    }
  }'`} />
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-widest">Réponse succès (200)</p>
          <CodeBlock code={`{
  "status": "success",
  "message": "Paiement initié avec succès",
  "data": {
    "reference": "MB1A2B3C4D5E6F7G",
    "transaction_id": "TXN-RBPAY-XXXX",
    "amount": 5000,
    "currency": "XOF",
    "order_id": "CMD-2024-001",
    "status": "pending",
    "payment_method": "mobile_money",
    "network": "moov",
    "country_code": "TG",
    "redirect_url": null,
    "instructions": "Composez *155# pour valider",
    "created_at": "2024-01-15T10:30:00Z"
  }
}`} />
        </div>
      </Section>

      {/* Payout */}
      <Section id="payout" title="Payout — Retrait Automatique (Envoi d'argent)" icon={Send}>
        <div className="flex items-center gap-2">
          <EndpointBadge method="POST" />
          <code className="text-sm font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded">/api/sdk/v1/payout</code>
        </div>
        <p className="text-sm text-gray-600">Envoie un paiement Mobile Money vers un bénéficiaire depuis votre solde WestPay. Le solde est débité immédiatement. Les frais sont calculés automatiquement.</p>
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
          💡 <strong>Frais appliqués:</strong> 4,5% du montant (5,5% pour Congo Brazzaville et Congo RDC). Votre solde disponible doit couvrir le montant + frais.
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-widest">Paramètres du corps (JSON)</p>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-sm min-w-[500px]">
              <thead><tr className="bg-gray-50"><th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Champ</th><th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Type</th><th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Requis</th><th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Description</th></tr></thead>
              <tbody>
                <ParamRow name="amount" type="number" req={true} desc="Montant à envoyer (sans les frais, qui sont ajoutés automatiquement)" />
                <ParamRow name="currency" type="string" req={true} desc="Code devise ISO: XOF, XAF, GNF, CDF, GMD" />
                <ParamRow name="order_id" type="string" req={true} desc="Identifiant unique de votre opération de payout" />
                <ParamRow name="callback_url" type="string" req={true} desc="URL de votre webhook pour la notification de statut" />
                <ParamRow name="metadata.phone_number" type="string" req={true} desc="Numéro de téléphone du bénéficiaire avec indicatif" />
                <ParamRow name="metadata.network" type="string" req={true} desc="Réseau mobile du bénéficiaire: mtn, orange, moov, wave..." />
                <ParamRow name="metadata.country_code" type="string" req={true} desc="Code pays du bénéficiaire: TG, BJ, CI, SN, ML, BF, CM, CG, CD, GN, GM" />
                <ParamRow name="metadata.beneficiary" type="string" req={false} desc="Nom du bénéficiaire (optionnel)" />
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-widest">Exemple de requête</p>
          <CodeBlock code={`curl -X POST ${BASE_URL}/api/sdk/v1/payout \\
  -H "Content-Type: application/json" \\
  -H "X-SDK-Key: ${sdkApiKey || "WP-SDK-VOTRE_CLE"}" \\
  -d '{
    "amount": 10000,
    "currency": "XOF",
    "order_id": "PAYOUT-2024-001",
    "callback_url": "https://votre-site.com/webhook/payout",
    "metadata": {
      "phone_number": "+22670123456",
      "network": "orange",
      "country_code": "BF",
      "beneficiary": "Marie Koné"
    }
  }'`} />
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-widest">Réponse succès (200)</p>
          <CodeBlock code={`{
  "status": "success",
  "message": "Payout initié avec succès",
  "data": {
    "reference": "MB7H8I9J0K1L2M3N",
    "transaction_id": "TXN-PAYOUT-XXXX",
    "amount": 10000,
    "fee": 450,
    "charged_amount": 10450,
    "currency": "XOF",
    "order_id": "PAYOUT-2024-001",
    "status": "pending",
    "payment_method": "mobile_money",
    "recipient": {
      "phone_number": "+22670123456",
      "network": "orange",
      "country_code": "BF",
      "beneficiary": "Marie Koné"
    },
    "created_at": "2024-01-15T10:35:00Z"
  }
}`} />
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-widest">Erreur solde insuffisant (422)</p>
          <CodeBlock code={`{
  "status": "error",
  "message": "Solde insuffisant pour ce retrait.",
  "data": {
    "required_amount": 10450,
    "available_balance": 5000,
    "currency": "XOF"
  }
}`} />
        </div>
      </Section>

      {/* Transaction Status */}
      <Section id="status" title="Statut Transaction" icon={Search}>
        <div className="flex items-center gap-2">
          <EndpointBadge method="GET" />
          <code className="text-sm font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded">/api/sdk/v1/transaction/:reference</code>
        </div>
        <p className="text-sm text-gray-600">Récupère le statut actuel d'une transaction payin ou payout à partir de sa référence WestPay (champ <code className="bg-gray-100 px-1 rounded text-xs font-mono">reference</code> de la réponse initiale).</p>
        <CodeBlock code={`curl -X GET ${BASE_URL}/api/sdk/v1/transaction/MB1A2B3C4D5E6F7G \\
  -H "X-SDK-Key: ${sdkApiKey || "WP-SDK-VOTRE_CLE"}"`} />
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-widest">Réponse (200)</p>
          <CodeBlock code={`{
  "status": "success",
  "data": {
    "reference": "MB1A2B3C4D5E6F7G",
    "amount": 5000,
    "status": "confirmed",
    "payment_method": "mobile_money",
    "network": "moov",
    "country": "Togo",
    "phone_number": "+22890123456",
    "created_at": "2024-01-15T10:30:00Z"
  }
}`} />
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-widest">Valeurs de statut possibles</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { s: "pending", c: "bg-yellow-100 text-yellow-700", d: "En attente de confirmation" },
              { s: "confirmed", c: "bg-green-100 text-green-700", d: "Paiement confirmé" },
              { s: "failed", c: "bg-red-100 text-red-700", d: "Echec de la transaction" },
              { s: "processing", c: "bg-blue-100 text-blue-700", d: "En cours de traitement (payout)" },
              { s: "completed", c: "bg-green-100 text-green-700", d: "Payout effectué avec succès" },
            ].map(({ s, c, d }) => (
              <div key={s} className="flex items-center gap-2 p-2 rounded-lg border border-gray-100">
                <span className={`text-xs px-2 py-0.5 rounded font-mono font-medium ${c}`}>{s}</span>
                <span className="text-xs text-gray-500">{d}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Balance */}
      <Section id="balance" title="Solde par Pays" icon={Wallet}>
        <div className="flex items-center gap-2">
          <EndpointBadge method="GET" />
          <code className="text-sm font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded">/api/sdk/v1/balance</code>
        </div>
        <p className="text-sm text-gray-600">Retourne vos soldes disponibles pour tous vos pays actifs.</p>
        <CodeBlock code={`curl -X GET ${BASE_URL}/api/sdk/v1/balance \\
  -H "X-SDK-Key: ${sdkApiKey || "WP-SDK-VOTRE_CLE"}"`} />
        <CodeBlock code={`{
  "status": "success",
  "data": {
    "balances": [
      { "country": "Togo",      "balance": 125000, "currency": "XOF" },
      { "country": "Benin",     "balance": 80000,  "currency": "XOF" },
      { "country": "Cameroun",  "balance": 50000,  "currency": "XAF" }
    ]
  }
}`} />
      </Section>

      {/* Webhooks */}
      <Section id="webhook" title="Notifications Webhook" icon={Webhook}>
        <p className="text-sm text-gray-600">WestPay envoie une requête <code className="bg-gray-100 px-1 rounded text-xs font-mono">POST</code> vers votre <code className="bg-gray-100 px-1 rounded text-xs font-mono">callback_url</code> dès que le statut d'une transaction change.</p>
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-widest">Payload webhook payin (paiement confirmé)</p>
          <CodeBlock code={`{
  "event": "payment.confirmed",
  "reference": "MB1A2B3C4D5E6F7G",
  "order_id": "CMD-2024-001",
  "amount": 5000,
  "currency": "XOF",
  "status": "confirmed",
  "payment_method": "mobile_money",
  "payer": {
    "phone_number": "+22890123456",
    "network": "moov",
    "country_code": "TG"
  },
  "timestamp": "2024-01-15T10:32:15Z"
}`} />
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-widest">Payload webhook payout</p>
          <CodeBlock code={`{
  "event": "payout.completed",
  "reference": "MB7H8I9J0K1L2M3N",
  "order_id": "PAYOUT-2024-001",
  "amount": 10000,
  "fee": 450,
  "currency": "XOF",
  "status": "completed",
  "recipient": {
    "phone_number": "+22670123456",
    "network": "orange",
    "country_code": "BF"
  },
  "timestamp": "2024-01-15T10:37:45Z"
}`} />
        </div>
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
          💡 Votre endpoint webhook doit répondre avec un code HTTP 200 pour confirmer la réception. WestPay réessaie automatiquement en cas d'échec.
        </div>
      </Section>

      {/* Networks */}
      <Section id="networks" title="Réseaux & Pays Supportés" icon={Globe}>
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full text-xs">
            <thead><tr className="bg-gray-50"><th className="text-left py-2 px-3 text-gray-500 font-medium">Pays</th><th className="text-left py-2 px-3 text-gray-500 font-medium">Code</th><th className="text-left py-2 px-3 text-gray-500 font-medium">Devise</th><th className="text-left py-2 px-3 text-gray-500 font-medium">Réseaux disponibles</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {[
                { pays: "Togo", code: "TG", devise: "XOF", reseaux: "togocom, moov, flooz" },
                { pays: "Bénin", code: "BJ", devise: "XOF", reseaux: "mtn, moov" },
                { pays: "Côte d'Ivoire", code: "CI", devise: "XOF", reseaux: "mtn, orange, moov, wave" },
                { pays: "Sénégal", code: "SN", devise: "XOF", reseaux: "orange, wave, free" },
                { pays: "Mali", code: "ML", devise: "XOF", reseaux: "orange, moov, wave" },
                { pays: "Burkina Faso", code: "BF", devise: "XOF", reseaux: "orange, moov, wave" },
                { pays: "Cameroun", code: "CM", devise: "XAF", reseaux: "mtn, orange" },
                { pays: "Congo Brazzaville", code: "CG", devise: "XAF", reseaux: "mtn, airtel" },
                { pays: "Congo RDC", code: "CD", devise: "CDF", reseaux: "mtn, orange, airtel, mpesa" },
                { pays: "Guinée", code: "GN", devise: "GNF", reseaux: "mtn, orange, moov" },
                { pays: "Gambie", code: "GM", devise: "GMD", reseaux: "afrimoney, qmoney" },
              ].map(r => (
                <tr key={r.code} className="hover:bg-gray-50/50">
                  <td className="py-2 px-3 font-medium text-gray-700">{r.pays}</td>
                  <td className="py-2 px-3"><code className="bg-gray-100 px-1.5 rounded font-mono">{r.code}</code></td>
                  <td className="py-2 px-3"><code className="bg-gray-100 px-1.5 rounded font-mono">{r.devise}</code></td>
                  <td className="py-2 px-3 text-gray-500">{r.reseaux}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Errors */}
      <Section id="errors" title="Codes d'Erreur" icon={XCircle}>
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full text-xs">
            <thead><tr className="bg-gray-50"><th className="text-left py-2 px-3 text-gray-500 font-medium">HTTP</th><th className="text-left py-2 px-3 text-gray-500 font-medium">status</th><th className="text-left py-2 px-3 text-gray-500 font-medium">Cause</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {[
                { code: "400", s: "error", cause: "Paramètres manquants ou invalides dans le corps de la requête" },
                { code: "401", s: "error", cause: "Clé SDK manquante, invalide ou SDK désactivé sur ce compte" },
                { code: "403", s: "error", cause: "Compte marchand suspendu" },
                { code: "404", s: "error", cause: "Transaction introuvable pour cette référence" },
                { code: "422", s: "error", cause: "Solde insuffisant (payout) ou paiement refusé" },
                { code: "503", s: "error", cause: "Passerelle de paiement non disponible (contacter le support)" },
                { code: "500", s: "error", cause: "Erreur interne du serveur" },
              ].map(r => (
                <tr key={r.code} className="hover:bg-gray-50/50">
                  <td className="py-2 px-3"><span className={`px-1.5 py-0.5 rounded font-mono font-bold ${r.code.startsWith("2") ? "bg-green-100 text-green-700" : r.code.startsWith("4") ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>{r.code}</span></td>
                  <td className="py-2 px-3"><code className="text-red-500 font-mono">{r.s}</code></td>
                  <td className="py-2 px-3 text-gray-600">{r.cause}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-widest">Format de réponse d'erreur</p>
          <CodeBlock code={`{
  "status": "error",
  "message": "Description lisible de l'erreur",
  "data": null
}`} />
        </div>
      </Section>

      {/* PHP Example */}
      <Section id="examples" title="Exemple d'Intégration PHP" icon={Hash}>
        <CodeBlock code={`<?php
// Configuration
$SDK_KEY = '${sdkApiKey || "WP-SDK-VOTRE_CLE"}';
$BASE_URL = '${BASE_URL}';

// Initier un paiement
function initiatePayin($amount, $currency, $orderId, $callbackUrl, $phone, $network, $countryCode) {
    global $SDK_KEY, $BASE_URL;
    
    $data = [
        'amount'       => $amount,
        'currency'     => $currency,
        'order_id'     => $orderId,
        'callback_url' => $callbackUrl,
        'metadata'     => [
            'phone_number' => $phone,
            'network'      => $network,
            'country_code' => $countryCode,
        ]
    ];
    
    $ch = curl_init("$BASE_URL/api/sdk/v1/payin");
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            "X-SDK-Key: $SDK_KEY"
        ],
        CURLOPT_POSTFIELDS     => json_encode($data),
    ]);
    
    $response = json_decode(curl_exec($ch), true);
    curl_close($ch);
    return $response;
}

// Recevoir le webhook
$payload = json_decode(file_get_contents('php://input'), true);
if ($payload['status'] === 'confirmed') {
    $orderId   = $payload['order_id'];
    $amount    = $payload['amount'];
    $reference = $payload['reference'];
    // Mettre à jour votre base de données...
}
http_response_code(200);
?>`} />
      </Section>

      {/* JavaScript Example */}
      <Section id="js-example" title="Exemple d'Intégration Node.js" icon={Zap}>
        <CodeBlock code={`const SDK_KEY  = process.env.WESTPAY_SDK_KEY; // "${sdkApiKey ? sdkApiKey.slice(0, 12) + "..." : "WP-SDK-..."}"
const BASE_URL = '${BASE_URL}';

// Initier un payin
async function initiatePayin({ amount, currency, orderId, callbackUrl, phone, network, countryCode }) {
  const res = await fetch(\`\${BASE_URL}/api/sdk/v1/payin\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-SDK-Key': SDK_KEY },
    body: JSON.stringify({
      amount, currency, order_id: orderId, callback_url: callbackUrl,
      metadata: { phone_number: phone, network, country_code: countryCode }
    })
  });
  return res.json();
}

// Initier un payout
async function initiatePayout({ amount, currency, orderId, callbackUrl, phone, network, countryCode, beneficiary }) {
  const res = await fetch(\`\${BASE_URL}/api/sdk/v1/payout\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-SDK-Key': SDK_KEY },
    body: JSON.stringify({
      amount, currency, order_id: orderId, callback_url: callbackUrl,
      metadata: { phone_number: phone, network, country_code: countryCode, beneficiary }
    })
  });
  return res.json();
}

// Vérifier un statut
async function getTransactionStatus(reference) {
  const res = await fetch(\`\${BASE_URL}/api/sdk/v1/transaction/\${reference}\`, {
    headers: { 'X-SDK-Key': SDK_KEY }
  });
  return res.json();
}

// Exemple d'utilisation
const result = await initiatePayin({
  amount: 5000, currency: 'XOF', orderId: 'CMD-001',
  callbackUrl: 'https://mon-site.com/webhook',
  phone: '+22890123456', network: 'moov', countryCode: 'TG'
});
console.log(result);`} />
      </Section>

      <div className="text-center py-4 text-xs text-gray-400">
        WestPay SDK v1 — Support: <a href="mailto:support@westpay.cloud" className="text-blue-500 hover:underline">support@westpay.cloud</a>
      </div>
    </div>
  );
}

export default function MerchantDashboard() {
  const { user, token, logout, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<MerchantTab>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useLanguage();
  const { toast } = useToast();

  const { data: cryptoAggs = [] } = useQuery({
    queryKey: ["/api/merchant/crypto-aggregators"],
    queryFn: async () => {
      if (!token) return [];
      const res = await fetch("/api/merchant/crypto-aggregators", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
  });
  const hasCrypto = (cryptoAggs as any[]).length > 0;

  const { data: sdkStatus } = useQuery({
    queryKey: ["/api/merchant/sdk/status"],
    queryFn: async () => {
      if (!token) return { sdkEnabled: false };
      const res = await fetch("/api/merchant/sdk/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { sdkEnabled: false };
      return res.json();
    },
    enabled: !!token,
    staleTime: 60000,
  });
  const hasSdk = !!(sdkStatus as any)?.sdkEnabled;
  const sdkApiKey = (sdkStatus as any)?.sdkApiKey as string | null;

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "merchant")) {
      setLocation("/merchant-login");
    }
  }, [authLoading, user, setLocation]);

  useEffect(() => {
    if (!hasCrypto && activeTab === "crypto") setActiveTab("overview");
    if (!hasSdk && activeTab === "sdk") setActiveTab("overview");
  }, [hasCrypto, hasSdk, activeTab]);

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8eaed" }}>
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#00b050" }} />
    </div>
  );
  if (!user || user.role !== "merchant") return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8eaed" }}>
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#00b050" }} />
    </div>
  );

  const handleLogout = () => { logout(); setLocation("/merchant-login"); };
  const handleTabChange = (tab: MerchantTab) => { setActiveTab(tab); setMobileOpen(false); };

  const visibleNavItems = NAV_ITEMS.filter(item => {
    if (item.key === "crypto") return hasCrypto;
    if (item.key === "sdk") return hasSdk;
    return true;
  });
  const currentItem = visibleNavItems.find(n => n.key === activeTab);

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: "#e8eaed" }}>

      {/* ── Desktop sidebar ── */}
      <aside
        className="hidden md:flex flex-col shrink-0 transition-all duration-300 overflow-hidden"
        style={{
          width: sidebarCollapsed ? 64 : 240,
          background: "#1e2231",
          boxShadow: "2px 0 16px rgba(0,0,0,0.18)",
        }}
      >
        <MerchantSidebarContent
          user={user}
          activeTab={activeTab}
          collapsed={sidebarCollapsed}
          onTabChange={handleTabChange}
          onLogout={handleLogout}
          t={t}
          hasCrypto={hasCrypto}
          hasSdk={hasSdk}
        />
      </aside>

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile drawer ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col md:hidden transition-transform duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ background: "#1e2231", boxShadow: "4px 0 24px rgba(0,0,0,0.3)" }}
      >
        <div className="flex items-center justify-end px-3 pt-3 pb-1">
          <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg" style={{ color: "rgba(255,255,255,0.5)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <MerchantSidebarContent
          user={user}
          activeTab={activeTab}
          collapsed={false}
          onTabChange={handleTabChange}
          onLogout={handleLogout}
          t={t}
          hasCrypto={hasCrypto}
          hasSdk={hasSdk}
        />
      </aside>

      {/* ── Main content ── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Header */}
        <header
          className="flex items-center justify-between gap-2 px-4 shrink-0 shadow-md"
          style={{ background: "#1e2231", height: 52, zIndex: 30 }}
        >
          <div className="flex items-center gap-3">
            <button
              className="hidden md:flex w-8 h-8 rounded-lg items-center justify-center transition-colors hover:bg-white/10"
              style={{ color: "rgba(255,255,255,0.7)" }}
              onClick={() => setSidebarCollapsed(c => !c)}
              data-testid="button-merchant-sidebar-toggle"
            >
              {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
            <button
              className="flex md:hidden w-8 h-8 rounded-lg items-center justify-center transition-colors hover:bg-white/10"
              style={{ color: "rgba(255,255,255,0.7)" }}
              onClick={() => setMobileOpen(o => !o)}
              data-testid="button-mobile-sidebar-toggle"
            >
              <Menu className="w-4 h-4" />
            </button>

            {currentItem && (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "rgba(255,255,255,0.1)" }}>
                  <currentItem.icon className="w-3.5 h-3.5" style={{ color: currentItem.color }} />
                </div>
                <span className="text-sm font-semibold text-white/80 hidden sm:block">
                  {activeTab === "virements" ? t("transfers") : activeTab === "reversements" ? t("withdrawals") : activeTab === "paymentlinks" ? t("paymentlinks") : activeTab === "apikeys" ? t("apikeys") : activeTab === "crypto" ? "Paiements Crypto" : activeTab === "sdk" ? "SDK API" : t(activeTab)}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-0.5">
            <button
              className="relative p-2 rounded-lg hover:bg-white/10 transition-colors"
              style={{ color: "rgba(255,255,255,0.7)" }}
              onClick={() => toast({ title: t("notifications"), description: "Aucune nouvelle notification." })}
              data-testid="button-notifications"
            >
              <Bell className="w-4 h-4" />
            </button>
            <button
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              style={{ color: "rgba(255,255,255,0.7)" }}
              onClick={() => window.open("/api-docs", "_blank")}
              data-testid="button-help"
              title="Documentation API"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            <LanguageDropdown />
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">
          <SupportBanner />
          {activeTab === "overview"      && <OverviewPanel token={token} />}
          {activeTab === "transactions"  && <MerchantTransactionsPanel token={token} />}
          {activeTab === "virements"     && <WalletTransfersPanel token={token} />}
          {activeTab === "reversements"  && <WithdrawalsPanel token={token} />}
          {activeTab === "paymentlinks"  && <PaymentLinksPanel token={token} />}
          {activeTab === "apikeys"       && <ApiKeysPanel token={token} />}
          {activeTab === "webhook"       && <WebhookPanel token={token} />}
          {activeTab === "settings"      && <MerchantSettingsPanel token={token} />}
          {activeTab === "crypto"        && <CryptoPanel token={token} user={user} />}
          {activeTab === "sdk"           && <SdkDocPanel sdkApiKey={sdkApiKey} />}
        </main>
      </div>
    </div>
  );
}
