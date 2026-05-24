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
  Bell, Mail, HelpCircle, Power, Menu, X, ChevronLeft, ChevronRight, Bitcoin, Share2,
  Shield, Building2, AlertCircle
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { MerchantCountry, Transaction, WebhookLog, PaymentLink, WalletTransfer, WalletTransferCountry, Withdrawal } from "@shared/schema";
import { useLanguage, LANGUAGES } from "@/lib/language";
import imgSidebarBg from "@assets/IMG-20260524-WA0032_1779626216477.jpg";
import icnOverview from "@assets/homeBarActive_1779626310103.png";
import icnTransactions from "@assets/a90f54732fab3ff150753cf117ce6a24_1779626310067.png";
import icnVirements from "@assets/a96d355bc25b348d27c903a0be9d6798_1779626310086.png";
import icnReversements from "@assets/téléchargement_(57)_1779626310270.png";
import icnPaymentLinks from "@assets/téléchargement_(58)_1779626310247.png";
import icnCrypto from "@assets/fa6620bc07e2128cfd6a47b85bb73129_1779626310124.png";
import icnSdk from "@assets/6146731_1779626310202.png";
import icnApikeys from "@assets/2164832_1779626310294.png";
import icnWebhook from "@assets/da590302ca9d8b4097acd7253ed8fbf0_1779626310173.png";
import icnSettings from "@assets/1437214_1779626310223.png";

type MerchantTab = "overview" | "apikeys" | "webhook" | "virements" | "reversements" | "settings" | "paymentlinks" | "transactions" | "crypto" | "sdk" | "wallet" | "analyse";

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

function OverviewPanel({ token, onTabChange }: { token: string | null; onTabChange: (tab: MerchantTab) => void }) {
  const { t, lang } = useLanguage();
  const { data: transactions = [], isLoading: txLoading } = useMerchantFetch("/api/merchant/transactions", ["/api/merchant/transactions"], token);

  const allTx = transactions as (Transaction & { payerName?: string | null })[];
  const totalCount = allTx.length;
  const confirmedCount = allTx.filter(tx => tx.status === "confirmed").length;
  const recentTx = allTx.slice(0, 30);
  const locale = lang === "pt" ? "pt-BR" : lang === "en" ? "en-US" : "fr-FR";

  return (
    <div className="flex flex-col h-full overflow-hidden -m-4 md:-m-6" style={{ background: "#e8eaed" }}>
      {/* ── Fixed cards section ── */}
      <div className="flex-shrink-0 px-4 pt-4 space-y-3">

        {/* Card 1 – Total (dark navy) */}
        <div className="rounded-2xl p-5 relative overflow-hidden" style={{ background: "#1a237e" }} data-testid="card-overview-total">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.45)" }} />
            <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.75)" }}>{t("total")}</span>
          </div>
          <p className="text-5xl font-bold text-white leading-none" data-testid="text-total-count">
            {String(totalCount).padStart(2, "0")}
          </p>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-15 pointer-events-none">
            <div className="w-16 h-16 rounded-xl border-4 border-white flex items-center justify-center">
              <div className="w-7 h-7 rounded-full border-4 border-white" />
            </div>
          </div>
        </div>

        {/* Card 2 – Succès (white) */}
        <div className="rounded-2xl p-5 relative overflow-hidden bg-white" style={{ border: "1.5px solid #e8ecf0" }} data-testid="card-overview-success">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4" style={{ color: "#00b050" }} />
            <span className="text-sm font-semibold" style={{ color: "#555" }}>{t("successCount")}</span>
          </div>
          <p className="text-5xl font-bold leading-none" style={{ color: "#1a1a1a" }} data-testid="text-confirmed-count">
            {String(confirmedCount).padStart(2, "0")}
          </p>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-8 pointer-events-none">
            <ArrowRightLeft className="w-16 h-16" style={{ color: "#bbb" }} />
          </div>
        </div>

        {/* Card 3 – Green action card */}
        <div className="rounded-2xl p-4" style={{ background: "#2e7d32" }} data-testid="card-overview-actions">
          <div className="flex gap-3">
            <button
              onClick={() => onTabChange("wallet")}
              className="flex-1 py-2.5 rounded-full text-sm font-bold bg-white transition-all hover:bg-gray-100 active:scale-95"
              style={{ color: "#1a1a1a" }}
              data-testid="button-wallet-balance"
            >
              {t("walletBalance")}
            </button>
            <button
              onClick={() => onTabChange("analyse")}
              className="flex-1 py-2.5 rounded-full text-sm font-bold bg-white transition-all hover:bg-gray-100 active:scale-95"
              style={{ color: "#1a1a1a" }}
              data-testid="button-analyse"
            >
              {t("analyseTitle")}
            </button>
          </div>
        </div>
      </div>

      {/* ── Scrollable transactions section ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 mt-5 min-h-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold" style={{ color: "#1a1a1a" }}>{t("recentTransactionsTitle")}</h3>
          <button
            onClick={() => onTabChange("transactions")}
            className="px-4 py-1.5 rounded-full text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95"
            style={{ background: "#3d5af1" }}
            data-testid="button-voir-tout"
          >
            {t("viewAll")}
          </button>
        </div>

        {txLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
        ) : recentTx.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
            <CreditCard className="w-8 h-8 mx-auto mb-2" style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>{t("noTransactions")}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
            {recentTx.map((tx, idx) => {
              const isTransfer = tx.amount < 0 || tx.txId.startsWith("TR-");
              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-2 px-4 py-3"
                  style={{ borderBottom: idx < recentTx.length - 1 ? "1px solid #f0f4ff" : "none" }}
                  data-testid={`row-tx-overview-${tx.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: "#1a1a1a" }}>
                      {isTransfer ? "TRANSFER " : ""}{tx.txId}
                    </p>
                    {(tx as any).payerName && (
                      <p className="text-xs truncate" style={{ color: "#888" }}>{(tx as any).payerName}</p>
                    )}
                  </div>
                  <div className="text-center shrink-0 px-2">
                    <p className="text-xs font-bold" style={{ color: isTransfer ? "#e53935" : "#00b050" }}>
                      {tx.amount.toLocaleString(locale)} {countryToCurrency(tx.country)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs" style={{ color: "#888" }}>{tx.payerNumber || "—"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function WalletPanel({ token }: { token: string | null }) {
  const { t, lang } = useLanguage();
  const { data: balance = [], isLoading: balLoading } = useMerchantFetch("/api/merchant/balance", ["/api/merchant/balance"], token);
  const { data: cryptoBalances = [], isLoading: cryptoLoading } = useMerchantFetch("/api/merchant/crypto/balances", ["/api/merchant/crypto/balances"], token);

  const countries = balance as MerchantCountry[];
  const totalBalance = countries.reduce((sum, c) => sum + (c.balance || 0), 0);
  const cryptoList = cryptoBalances as { currency: string; balance: string }[];
  const hasCryptoBalance = cryptoList.some(c => parseFloat(c.balance) > 0);
  const locale = lang === "pt" ? "pt-BR" : lang === "en" ? "en-US" : "fr-FR";

  return (
    <div className="-m-4 md:-m-6 p-4 md:p-6 min-h-full overflow-y-auto" style={{ background: "#e8eaed" }}>
      <div className="mb-5">
        <h2 className="text-xl font-bold" style={{ color: "#1a1a1a" }}>{t("walletTitle")}</h2>
        <p className="text-xs mt-0.5" style={{ color: "#888" }}>{t("walletDesc")}</p>
      </div>

      {/* Total balance summary */}
      <div className="rounded-2xl p-5 mb-5 relative overflow-hidden" style={{ background: "linear-gradient(135deg,#1a237e,#3949ab)" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.65)" }}>{t("totalConsolidatedBalance")}</p>
        <p className="text-4xl font-black text-white leading-none mb-1" data-testid="text-wallet-total">
          {balLoading ? "—" : totalBalance.toLocaleString(locale)}
        </p>
        <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>FCFA</p>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none">
          <Wallet className="w-20 h-20 text-white" />
        </div>
      </div>

      {/* Country balances */}
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>
        {t("balanceByCountry")} — {countries.length}
      </p>

      {balLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
        </div>
      ) : countries.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
          <Wallet className="w-8 h-8 mx-auto mb-2" style={{ color: "#ddd" }} />
          <p className="text-sm" style={{ color: "#aaa" }}>{t("noCountriesConfigured")}</p>
        </div>
      ) : (
        <div className="space-y-3 mb-5">
          {countries.map((c, idx) => (
            <div
              key={c.id}
              className="rounded-2xl p-4 relative overflow-hidden"
              style={{ background: COUNTRY_COLORS[idx % COUNTRY_COLORS.length], opacity: c.active ? 1 : 0.65 }}
              data-testid={`card-wallet-${c.country}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-white/70" />
                  <p className="text-xs font-bold text-white/80 uppercase tracking-widest">{c.country}</p>
                </div>
                <span
                  className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                  style={{ background: c.active ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.25)", color: "white" }}
                >
                  {c.active ? t("active") : t("disabled")}
                </span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-3xl font-black text-white leading-none">
                    {(c.balance ?? 0).toLocaleString(locale)}
                  </p>
                  <p className="text-xs font-semibold text-white/70 mt-0.5">{countryToCurrency(c.country)}</p>
                </div>
                {!c.active && (
                  <p className="text-xs text-white/50 max-w-28 text-right">{t("countryDisabled")}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Crypto balances */}
      {(hasCryptoBalance || cryptoLoading) && (
        <>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>
            {t("cryptoBalances")}
          </p>
          {cryptoLoading ? (
            <div className="space-y-3">
              {[1,2].map(i => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {cryptoList.filter(c => parseFloat(c.balance) > 0).map(c => (
                <div key={c.currency} className="bg-white rounded-2xl p-4 flex items-center justify-between shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#f59e0b20" }}>
                      <Bitcoin className="w-5 h-5" style={{ color: "#f59e0b" }} />
                    </div>
                    <p className="text-sm font-bold" style={{ color: "#1a1a1a" }}>{c.currency}</p>
                  </div>
                  <p className="text-base font-black" style={{ color: "#1a1a1a" }}>{parseFloat(c.balance).toFixed(6)}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AnalysePanel({ token }: { token: string | null }) {
  const { t, lang } = useLanguage();
  const { data: stats } = useMerchantFetch("/api/merchant/stats", ["/api/merchant/stats"], token);
  const { data: transactions = [], isLoading: txLoading } = useMerchantFetch("/api/merchant/transactions", ["/api/merchant/transactions"], token);
  const { data: balance = [] } = useMerchantFetch("/api/merchant/balance", ["/api/merchant/balance"], token);

  const allTx = transactions as (Transaction & { payerName?: string | null })[];
  const countries = balance as MerchantCountry[];
  const locale = lang === "pt" ? "pt-BR" : lang === "en" ? "en-US" : "fr-FR";
  const dateLocale = lang === "pt" ? "pt-BR" : lang === "en" ? "en-GB" : "fr-FR";

  const confirmedTx = allTx.filter(tx => tx.status === "confirmed");
  const pendingTx = allTx.filter(tx => tx.status === "pending");
  const failedTx = allTx.filter(tx => tx.status === "failed");
  const confirmedTotal = confirmedTx.reduce((s, tx) => s + tx.amount, 0);
  const successRate = allTx.length > 0 ? Math.round((confirmedTx.length / allTx.length) * 100) : 0;

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString(dateLocale, { day: "2-digit", month: "short" });
    const dayTx = confirmedTx.filter(tx => {
      const txDate = new Date(tx.createdAt);
      return txDate.toDateString() === d.toDateString();
    });
    return { label, count: dayTx.length, volume: dayTx.reduce((s, tx) => s + tx.amount, 0) };
  });

  const maxVolume = Math.max(...last7Days.map(d => d.volume), 1);

  const countryStats = countries.map(c => ({
    country: c.country,
    count: confirmedTx.filter(tx => tx.country === c.country).length,
    volume: confirmedTx.filter(tx => tx.country === c.country).reduce((s, tx) => s + tx.amount, 0),
  })).filter(c => c.count > 0).sort((a, b) => b.volume - a.volume);

  return (
    <div className="-m-4 md:-m-6 p-4 md:p-6 min-h-full overflow-y-auto" style={{ background: "#e8eaed" }}>
      <div className="mb-5">
        <h2 className="text-xl font-bold" style={{ color: "#1a1a1a" }}>{t("analyseTitle")}</h2>
        <p className="text-xs mt-0.5" style={{ color: "#888" }}>{t("analyseDesc")}</p>
      </div>

      {/* KPI cards row */}
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>{t("globalStats")}</p>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-2xl p-4" style={{ background: "#1a237e" }} data-testid="card-analyse-total">
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">{t("total")}</p>
          <p className="text-3xl font-black text-white">{allTx.length}</p>
          <p className="text-xs text-white/60 mt-0.5">{t("transactionPlural")}</p>
        </div>
        <div className="rounded-2xl p-4" style={{ background: "#2e7d32" }} data-testid="card-analyse-success">
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">{t("successRate")}</p>
          <p className="text-3xl font-black text-white">{successRate}%</p>
          <p className="text-xs text-white/60 mt-0.5">{confirmedTx.length} {t("confirmedLabel")}</p>
        </div>
        <div className="rounded-2xl p-4 bg-white" style={{ border: "1.5px solid #e8ecf0" }} data-testid="card-analyse-volume">
          <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#888" }}>{t("confirmedVolume")}</p>
          <p className="text-xl font-black" style={{ color: "#1a1a1a" }}>{confirmedTotal.toLocaleString(locale)}</p>
          <p className="text-xs mt-0.5" style={{ color: "#aaa" }}>FCFA</p>
        </div>
        <div className="rounded-2xl p-4 bg-white" style={{ border: "1.5px solid #e8ecf0" }} data-testid="card-analyse-pending">
          <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#888" }}>{t("pending")}</p>
          <p className="text-3xl font-black" style={{ color: pendingTx.length > 0 ? "#fb8c00" : "#1a1a1a" }}>{pendingTx.length}</p>
          <p className="text-xs mt-0.5" style={{ color: "#aaa" }}>{t("transactionPlural")}</p>
        </div>
      </div>

      {/* Status breakdown */}
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>{t("statusBreakdown")}</p>
      <div className="bg-white rounded-2xl p-4 mb-5 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
        {allTx.length === 0 ? (
          <p className="text-sm text-center py-2" style={{ color: "#aaa" }}>{t("noData")}</p>
        ) : (
          <div className="space-y-3">
            {[
              { label: t("statusConfirmed"), count: confirmedTx.length, color: "#00b050" },
              { label: t("statusPending"), count: pendingTx.length, color: "#fb8c00" },
              { label: t("statusFailed"), count: failedTx.length, color: "#e53935" },
            ].map(s => (
              <div key={s.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold" style={{ color: "#555" }}>{s.label}</span>
                  <span className="text-xs font-bold" style={{ color: s.color }}>{s.count}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "#f0f4ff" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: allTx.length > 0 ? `${(s.count / allTx.length) * 100}%` : "0%",
                      background: s.color
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 7-day chart */}
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>{t("last7daysVolume")}</p>
      <div className="bg-white rounded-2xl p-4 mb-5 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
        {txLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="flex items-end gap-1.5 h-24">
            {last7Days.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t-lg transition-all" style={{
                  height: `${Math.max((d.volume / maxVolume) * 80, d.volume > 0 ? 8 : 0)}px`,
                  background: d.volume > 0 ? "#3d5af1" : "#e8ecf0",
                  minHeight: 4,
                }} />
                <span className="text-[9px] font-medium text-center leading-tight" style={{ color: "#aaa" }}>{d.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Performance by country */}
      {countryStats.length > 0 && (
        <>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>{t("performanceByCountry")}</p>
          <div className="space-y-2">
            {countryStats.map((c, idx) => (
              <div key={c.country} className="bg-white rounded-2xl p-4 flex items-center justify-between shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: COUNTRY_COLORS[idx % COUNTRY_COLORS.length] }}>
                    <Globe className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: "#1a1a1a" }}>{c.country}</p>
                    <p className="text-xs" style={{ color: "#888" }}>{c.count} {c.count > 1 ? t("transactionPlural") : t("transactionSingular")}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black" style={{ color: "#00b050" }}>{c.volume.toLocaleString(locale)}</p>
                  <p className="text-xs" style={{ color: "#aaa" }}>FCFA</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Today / yesterday */}
      <p className="text-xs font-bold uppercase tracking-widest mt-5 mb-3" style={{ color: "#888" }}>{t("todayAndYesterday")}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-4" style={{ background: "#ef5350" }}>
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">{t("today")}</p>
          <p className="text-2xl font-black text-white">{(stats?.todayVolume || 0).toLocaleString(locale)}</p>
          <p className="text-xs text-white/60">FCFA</p>
        </div>
        <div className="rounded-2xl p-4" style={{ background: "#7e57c2" }}>
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">{t("yesterday")}</p>
          <p className="text-2xl font-black text-white">{(stats?.yesterdayVolume || 0).toLocaleString(locale)}</p>
          <p className="text-xs text-white/60">FCFA</p>
        </div>
      </div>
    </div>
  );
}

function TransactionDetailDrawer({ tx, onClose }: { tx: any; onClose: () => void }) {
  const { toast, t: _t } = { toast: useToast().toast, t: useLanguage().t };
  const isTransfer = tx.amount < 0 || tx.txId?.startsWith("TR-");
  const fee = tx.providerFee != null ? tx.providerFee : Math.round(Math.abs(tx.amount) * 0.03);
  const net = Math.abs(tx.amount) - fee;

  const statusCfg = tx.status === "confirmed"
    ? { label: _t("confirmedLabel2"), bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0", dot: "#22c55e" }
    : tx.status === "pending"
    ? { label: _t("pendingLabel"), bg: "#fffbeb", color: "#d97706", border: "#fde68a", dot: "#f59e0b" }
    : { label: _t("failedLabel"), bg: "#fef2f2", color: "#dc2626", border: "#fecaca", dot: "#ef4444" };

  const providerLabel = (p: string) => {
    if (p === "omnipay" || p === "mbiyo") return "Mobile Money";
    if (p === "crypto") return "Crypto";
    if (p === "sms") return "SMS";
    return p || "—";
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() =>
      toast({ title: `${label} copié`, description: text.substring(0, 40) })
    );
  };

  const DetailRow = ({ label, value, mono = false, copyable = false }: { label: string; value: string; mono?: boolean; copyable?: boolean }) => (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-gray-50 last:border-0">
      <span className="text-xs font-medium text-gray-400 flex-shrink-0 w-28">{label}</span>
      <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
        <span className={`text-sm font-semibold text-gray-800 text-right truncate ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
        {copyable && (
          <button onClick={() => copyToClipboard(value, label)} className="flex-shrink-0 p-1 rounded hover:bg-gray-100 transition-colors" data-testid={`button-copy-${label}`}>
            <Copy className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl"
        style={{ maxHeight: "92vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
        data-testid="drawer-transaction-detail"
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: isTransfer ? "#fef2f2" : "#f0fdf4" }}>
              {isTransfer
                ? <ArrowUpRight className="w-5 h-5" style={{ color: "#dc2626" }} />
                : <ArrowUpRight className="w-5 h-5 rotate-180" style={{ color: "#16a34a" }} />
              }
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">{isTransfer ? "Transfert envoyé" : "Paiement reçu"}</p>
              <p className="text-xs text-gray-400 font-mono">{tx.txId?.substring(0, 20)}…</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors" data-testid="button-close-detail">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Amount block */}
        <div className="px-5 py-5 text-center border-b border-gray-50">
          <p className="text-4xl font-black text-gray-900 tracking-tight">
            <span style={{ color: isTransfer ? "#dc2626" : "#16a34a" }}>{isTransfer ? "−" : "+"}</span>
            {Math.abs(tx.amount).toLocaleString("fr-FR")}
            <span className="text-lg font-semibold text-gray-400 ml-2">FCFA</span>
          </p>
          <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: statusCfg.bg, color: statusCfg.color, border: `1px solid ${statusCfg.border}` }}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusCfg.dot }} />
              {statusCfg.label}
            </span>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              {isTransfer ? "Transfert" : "Encaissement"}
            </span>
          </div>
        </div>

        {/* Fee summary */}
        {!isTransfer && (
          <div className="mx-5 mt-4 rounded-xl p-4 grid grid-cols-3 gap-2 text-center" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
            <div>
              <p className="text-xs text-gray-400 mb-1">Montant brut</p>
              <p className="text-sm font-bold text-gray-800">{Math.abs(tx.amount).toLocaleString("fr-FR")} F</p>
            </div>
            <div style={{ borderLeft: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0" }}>
              <p className="text-xs text-gray-400 mb-1">Frais (3%)</p>
              <p className="text-sm font-bold" style={{ color: "#f59e0b" }}>{fee.toLocaleString("fr-FR")} F</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Net reçu</p>
              <p className="text-sm font-bold" style={{ color: "#16a34a" }}>{net.toLocaleString("fr-FR")} F</p>
            </div>
          </div>
        )}

        {/* Details */}
        <div className="px-5 py-2 mt-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Détails</p>
          <DetailRow label="Référence" value={tx.txId || "—"} mono copyable />
          {(tx.payerName || tx.payer_name) && <DetailRow label="Payeur" value={tx.payerName || tx.payer_name} />}
          {(tx.payerNumber || tx.payer_number) && <DetailRow label="Téléphone" value={tx.payerNumber || tx.payer_number} copyable />}
          <DetailRow label="Pays" value={tx.country || "—"} />
          <DetailRow label="Mode" value={providerLabel(tx.provider)} />
          {tx.omnipayTxId && <DetailRow label="ID Opérateur" value={tx.omnipayTxId} mono copyable />}
          <DetailRow label="Date" value={new Date(tx.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })} />
        </div>

        {/* Footer */}
        <div className="px-5 pb-6 pt-4">
          <div className="flex items-center justify-center gap-1.5 mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-xs text-gray-400">Transaction WestPay · Sécurisée</span>
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          </div>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
            data-testid="button-close-receipt"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function MerchantTransactionsPanel({ token }: { token: string | null }) {
  const { t } = useLanguage();
  const { data: transactions = [], isLoading } = useMerchantFetch("/api/merchant/transactions", ["/api/merchant/transactions"], token);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterProvider, setFilterProvider] = useState("all");
  const [selectedTx, setSelectedTx] = useState<any>(null);

  if (isLoading) return <MerchantLoadingSkeleton />;

  const allTx = (transactions as (Transaction & { payerName?: string | null })[]);

  const filtered = allTx.filter((tx) => {
    const term = searchTerm.toLowerCase();
    const matchSearch = !term
      || tx.txId.toLowerCase().includes(term)
      || tx.country.toLowerCase().includes(term)
      || (tx.payerNumber || "").includes(term)
      || ((tx as any).payerName || "").toLowerCase().includes(term);
    const matchStatus = filterStatus === "all" || tx.status === filterStatus;
    const matchProvider = filterProvider === "all" || tx.provider === filterProvider;
    return matchSearch && matchStatus && matchProvider;
  });

  const downloadCSV = () => {
    const header = "TXID,Nom payeur,Numéro,Montant,Pays,Statut,Mode,Date\n";
    const rows = filtered.map((tx) =>
      `${tx.txId},"${(tx as any).payerName || ""}",${tx.payerNumber || ""},${tx.amount},${tx.country},${tx.status},${tx.provider},${new Date(tx.createdAt).toLocaleString("fr-FR")}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "transactions.csv"; a.click();
  };

  const confirmedTotal = allTx.filter(tx => tx.status === "confirmed" && tx.amount > 0).reduce((s, tx) => s + tx.amount, 0);
  const confirmedCount = allTx.filter(tx => tx.status === "confirmed").length;
  const pendingCount = allTx.filter(tx => tx.status === "pending").length;
  const failedCount = allTx.filter(tx => tx.status === "failed").length;

  const getStatusCfg = (status: string) =>
    status === "confirmed"
      ? { label: "Confirmé", bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0", dot: "#22c55e" }
      : status === "pending"
      ? { label: "En attente", bg: "#fffbeb", color: "#d97706", border: "#fde68a", dot: "#f59e0b" }
      : { label: "Échoué", bg: "#fef2f2", color: "#dc2626", border: "#fecaca", dot: "#ef4444" };

  const providerLabel = (p: string) => {
    if (p === "omnipay" || p === "mbiyo") return "Mobile Money";
    if (p === "crypto") return "Crypto";
    return "SMS";
  };

  return (
    <div className="min-h-full bg-white">
      {/* Page header */}
      <div className="px-4 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Historique des transactions</h2>
            <p className="text-xs text-gray-400 mt-0.5">{allTx.length} transaction{allTx.length !== 1 ? "s" : ""} au total</p>
          </div>
          <button
            onClick={downloadCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
            data-testid="button-merchant-export-csv"
          >
            <Download className="w-3.5 h-3.5" /> Exporter
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl p-4 bg-white border border-gray-100" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#eff6ff" }}>
              <TrendingUp className="w-3.5 h-3.5" style={{ color: "#3b82f6" }} />
            </div>
            <span className="text-xs font-medium text-gray-400">Volume</span>
          </div>
          <p className="text-base font-black text-gray-900 leading-tight">{confirmedTotal.toLocaleString("fr-FR")}</p>
          <p className="text-xs text-gray-400">FCFA</p>
        </div>
        <div className="rounded-2xl p-4 bg-white border border-gray-100" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#f0fdf4" }}>
              <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#16a34a" }} />
            </div>
            <span className="text-xs font-medium text-gray-400">Confirmées</span>
          </div>
          <p className="text-base font-black text-gray-900">{confirmedCount}</p>
          <p className="text-xs text-gray-400">transactions</p>
        </div>
        <div className="rounded-2xl p-4 bg-white border border-gray-100" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#fffbeb" }}>
              <Clock className="w-3.5 h-3.5" style={{ color: "#d97706" }} />
            </div>
            <span className="text-xs font-medium text-gray-400">En attente</span>
          </div>
          <p className="text-base font-black text-gray-900">{pendingCount}</p>
          <p className="text-xs text-gray-400">transactions</p>
        </div>
        <div className="rounded-2xl p-4 bg-white border border-gray-100" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#fef2f2" }}>
              <XCircle className="w-3.5 h-3.5" style={{ color: "#dc2626" }} />
            </div>
            <span className="text-xs font-medium text-gray-400">Échouées</span>
          </div>
          <p className="text-base font-black text-gray-900">{failedCount}</p>
          <p className="text-xs text-gray-400">transactions</p>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 pb-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
          <input
            className="w-full rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:border-green-400 focus:bg-white transition-colors"
            placeholder="Référence, téléphone, payeur…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-merchant-search-tx"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-xl px-3 py-2.5 text-sm border border-gray-200 bg-gray-50 text-gray-700 outline-none focus:border-green-400 focus:bg-white transition-colors"
            data-testid="select-filter-status"
          >
            <option value="all">Tous les statuts</option>
            <option value="confirmed">Confirmé</option>
            <option value="pending">En attente</option>
            <option value="failed">Échoué</option>
          </select>
          <select
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
            className="rounded-xl px-3 py-2.5 text-sm border border-gray-200 bg-gray-50 text-gray-700 outline-none focus:border-green-400 focus:bg-white transition-colors"
            data-testid="select-filter-provider"
          >
            <option value="all">Tous</option>
            <option value="omnipay">Mobile Money</option>
            <option value="sms">SMS</option>
            <option value="crypto">Crypto</option>
          </select>
        </div>
      </div>

      {/* Results count */}
      {(searchTerm || filterStatus !== "all" || filterProvider !== "all") && (
        <div className="px-4 pb-2">
          <p className="text-xs text-gray-400">{filtered.length} résultat{filtered.length !== 1 ? "s" : ""}</p>
        </div>
      )}

      {/* Transaction list */}
      <div className="px-4 pb-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <CreditCard className="w-7 h-7 text-gray-200" />
            </div>
            <p className="text-sm font-medium text-gray-400">Aucune transaction trouvée</p>
            {searchTerm && <p className="text-xs text-gray-300 mt-1">Essayez un autre terme de recherche</p>}
          </div>
        ) : (
          <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            {/* Table header — desktop */}
            <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-3 border-b border-gray-100 bg-gray-50">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Référence / Payeur</span>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Pays</span>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Statut</span>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Montant</span>
            </div>

            {/* Rows */}
            {filtered.map((tx, idx) => {
              const isTransfer = tx.amount < 0 || tx.txId.startsWith("TR-");
              const txPayerName = (tx as any).payerName;
              const cfg = getStatusCfg(tx.status);

              return (
                <div
                  key={tx.id}
                  className={`flex sm:grid sm:grid-cols-[1fr_auto_auto_auto] gap-3 sm:gap-4 px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors items-center ${idx !== 0 ? "border-t border-gray-100" : ""}`}
                  onClick={() => setSelectedTx(tx)}
                  data-testid={`card-tx-${tx.id}`}
                >
                  {/* Left: icon + info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: isTransfer ? "#fef2f2" : tx.status === "confirmed" ? "#f0fdf4" : tx.status === "pending" ? "#fffbeb" : "#fef2f2" }}>
                      {isTransfer
                        ? <ArrowUpRight className="w-4 h-4" style={{ color: "#dc2626" }} />
                        : tx.status === "confirmed"
                        ? <ArrowUpRight className="w-4 h-4 rotate-180" style={{ color: "#16a34a" }} />
                        : <Clock className="w-4 h-4" style={{ color: "#d97706" }} />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-semibold text-gray-700 truncate" data-testid={`text-mtx-${tx.id}`}>{tx.txId}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {txPayerName && <span className="text-xs text-gray-500 font-medium" data-testid={`text-payer-name-${tx.id}`}>{txPayerName}</span>}
                        {tx.payerNumber && <span className="text-xs text-gray-400" data-testid={`text-payer-number-${tx.id}`}>· {tx.payerNumber}</span>}
                        <span className="text-xs text-gray-300">· {new Date(tx.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Country — hidden on mobile, shown inline */}
                  <span className="hidden sm:block text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg text-center whitespace-nowrap">{tx.country}</span>

                  {/* Status */}
                  <span
                    className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                    style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                    data-testid={`text-status-${tx.id}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />
                    {cfg.label}
                  </span>

                  {/* Amount — always visible */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold" style={{ color: isTransfer ? "#dc2626" : "#16a34a" }} data-testid={`text-tx-amount-${tx.id}`}>
                      {isTransfer ? "−" : "+"}{Math.abs(tx.amount).toLocaleString("fr-FR")}
                    </p>
                    <p className="text-xs text-gray-300">FCFA</p>
                    {/* Mobile status dot */}
                    <div className="sm:hidden flex justify-end mt-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: cfg.dot }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedTx && <TransactionDetailDrawer tx={selectedTx} onClose={() => setSelectedTx(null)} />}
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

  const keyList = apiKeys as MerchantCountry[];
  const activeCount = keyList.filter(k => k.active).length;

  return (
    <div className="-m-4 md:-m-6 min-h-full" style={{ background: "#f2f3f5" }}>

      {/* ── Hero header ── */}
      <div className="px-5 pt-6 pb-5" style={{ background: "#fff", borderBottom: "1px solid #f0f0f0" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm shrink-0"
              style={{ background: "linear-gradient(135deg, #3949ab 0%, #1a237e 100%)" }}>
              <Key className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight" style={{ color: "#1a1a1a" }}>
                {t("apiKeysTitle")}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "#888" }}>
                Gérez vos clés d'accès par pays
              </p>
            </div>
          </div>
          <button
            onClick={() => window.open("/api-docs", "_blank")}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold shrink-0 shadow-sm transition-all active:scale-95"
            style={{ background: "#3949ab", color: "#fff", border: "none" }}
            data-testid="button-open-api-docs"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Guide d'intégration
          </button>
        </div>

        {/* Stat pills */}
        <div className="flex gap-2 mt-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ background: "#e8f5e9" }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#00b050" }} />
            <span className="text-xs font-bold" style={{ color: "#2e7d32" }}>{activeCount} pays actif{activeCount > 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ background: "#e8eaf6" }}>
            <Key className="w-3 h-3" style={{ color: "#3949ab" }} />
            <span className="text-xs font-bold" style={{ color: "#3949ab" }}>{keyList.length} clé{keyList.length > 1 ? "s" : ""} au total</span>
          </div>
        </div>
      </div>

      {/* ── Security notice ── */}
      <div className="mx-4 mt-4 rounded-2xl p-3.5 flex items-start gap-3"
        style={{ background: "#fffbea", border: "1.5px solid #fef3c7" }}>
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#d97706" }} />
        <p className="text-xs leading-relaxed" style={{ color: "#92400e" }}>
          Vos clés API sont <strong>confidentielles</strong>. Ne les partagez jamais publiquement. En cas de compromission, régénérez-les immédiatement.
        </p>
      </div>

      {/* ── Keys list ── */}
      <div className="p-4 space-y-3">
        {keyList.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
            <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: "#f0f4ff" }}>
              <Key className="w-7 h-7" style={{ color: "#c5cae9" }} />
            </div>
            <p className="font-bold text-sm mb-1" style={{ color: "#1a1a1a" }}>{t("noApiKeys")}</p>
            <p className="text-xs" style={{ color: "#aaa" }}>Contactez votre administrateur pour activer des pays</p>
          </div>
        ) : (
          keyList.map((key, idx) => {
            const color = COUNTRY_COLORS[idx % COUNTRY_COLORS.length];
            const flagMap: Record<string, string> = {
              "Togo": "🇹🇬", "Benin": "🇧🇯", "Ivory Coast": "🇨🇮", "Senegal": "🇸🇳",
              "Cameroon": "🇨🇲", "Guinea": "🇬🇳", "Mali": "🇲🇱", "Burkina Faso": "🇧🇫",
              "Niger": "🇳🇪", "DRC": "🇨🇩", "Congo": "🇨🇬", "Gabon": "🇬🇦",
            };
            return (
              <div key={key.id} className="bg-white rounded-2xl overflow-hidden shadow-sm"
                style={{ border: "1.5px solid #e8ecf0" }}
                data-testid={`card-apikey-${key.id}`}>

                {/* Card header */}
                <div className="px-5 py-4 flex items-center justify-between gap-3"
                  style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl"
                      style={{ background: color + "18", border: `1.5px solid ${color}30` }}>
                      {flagMap[key.country] || "🌍"}
                    </div>
                    <div>
                      <p className="text-sm font-bold" style={{ color: "#1a1a1a" }}>{key.country}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: key.active ? "#00b050" : "#e53935" }} />
                        <span className="text-xs font-semibold" style={{ color: key.active ? "#2e7d32" : "#c62828" }}>
                          {key.active ? t("active") : t("inactive")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => { if (confirm(t("confirm"))) regenerateMutation.mutate(key.id); }}
                    disabled={regenerateMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95"
                    style={{ background: "#f0f4ff", color: "#3949ab", border: "1.5px solid #c5cae9" }}
                    data-testid={`button-regenerate-key-${key.id}`}
                  >
                    {regenerateMutation.isPending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <RefreshCw className="w-3.5 h-3.5" />}
                    Régénérer
                  </button>
                </div>

                {/* Key display */}
                <div className="px-5 py-4">
                  <p className="text-xs font-bold mb-2" style={{ color: "#888" }}>CLÉ API</p>
                  <div className="flex items-center gap-2 rounded-xl px-3.5 py-3"
                    style={{ background: "#f8f9fc", border: "1.5px solid #e8ecf0" }}>
                    <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: "#bbb" }} />
                    <code className="text-xs font-mono flex-1 break-all leading-relaxed"
                      style={{ color: "#444" }}
                      data-testid={`text-apikey-${key.id}`}>
                      {key.apiKey}
                    </code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(key.apiKey); toast({ title: "Clé copiée !" }); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all active:scale-90"
                      style={{ background: "#e8eaf6", color: "#3949ab" }}
                      data-testid={`button-copy-key-${key.id}`}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs mt-2 flex items-center gap-1" style={{ color: "#bbb" }}>
                    <Shield className="w-3 h-3" />
                    Incluez cette clé dans le header <code className="font-mono" style={{ color: "#888" }}>X-API-Key</code> de vos requêtes
                  </p>
                </div>
              </div>
            );
          })
        )}

        {/* ── Integration guide banner ── */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "linear-gradient(135deg, #3949ab 0%, #1a237e 100%)" }}>
          <div className="px-5 py-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.15)" }}>
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white leading-tight">{t("integrationGuide")}</p>
              <p className="text-xs mt-0.5 text-white/70">Exemples de code, webhooks et référence complète</p>
            </div>
            <button
              onClick={() => window.open("/api-docs", "_blank")}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold shrink-0 transition-all active:scale-95"
              style={{ background: "#fff", color: "#3949ab", border: "none" }}
              data-testid="button-docs-link"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Ouvrir
            </button>
          </div>
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
  const { t } = useLanguage();
  if (status === "pending") return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: "#fff3cd", color: "#856404" }}>
      <Clock className="w-3 h-3" /> {t("pendingLabel")}
    </span>
  );
  if (status === "approved") return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: "#d4edda", color: "#155724" }}>
      <CheckCircle2 className="w-3 h-3" /> {t("approved")}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: "#f8d7da", color: "#721c24" }}>
      <XCircle className="w-3 h-3" /> {t("rejected")}
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
  const [recipientName, setRecipientName] = useState("");

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
    setRecipientName("");
  };

  const createMutation = useMutation({
    mutationFn: async (data: { merchantCountryId: number; amount: number; phone: string; operator: string; recipientName?: string }) => {
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
      setAmount(""); setPhone(""); setSelectedOperator(""); setRecipientName("");
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
    createMutation.mutate({ merchantCountryId: Number(selectedWalletId), amount: amountNum, phone, operator: selectedOperator, recipientName: recipientName.trim() || undefined });
  };

  const totalWithdrawn = (withdrawalList as Withdrawal[]).filter(w => w.status === "approved").reduce((s, w) => s + w.amount, 0);
  const pendingCount = (withdrawalList as Withdrawal[]).filter(w => w.status === "pending").length;

  return (
    <div className="-m-4 md:-m-6 p-4 md:p-6 min-h-full" style={{ background: "#f2f3f5" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold" style={{ color: "#1a1a1a" }}>{t("withdrawalsTitle")}</h2>
          <p className="text-xs mt-0.5" style={{ color: "#888" }}>Demandez un reversement vers votre compte mobile money</p>
        </div>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: "#00b050" }}>
          <Download className="w-5 h-5 text-white" />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: "#e8f5e9" }}>
              <Download className="w-3.5 h-3.5" style={{ color: "#00b050" }} />
            </div>
            <p className="text-xs font-semibold" style={{ color: "#888" }}>{t("totalWithdrawn")}</p>
          </div>
          <p className="text-xl font-bold" style={{ color: "#1a1a1a" }}>{totalWithdrawn.toLocaleString("fr-FR")}<span className="text-sm ml-1 font-semibold" style={{ color: "#aaa" }}>F</span></p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: pendingCount > 0 ? "#fff8e1" : "#f3e5f5" }}>
              <Clock className="w-3.5 h-3.5" style={{ color: pendingCount > 0 ? "#f59e0b" : "#9c27b0" }} />
            </div>
            <p className="text-xs font-semibold" style={{ color: "#888" }}>{t("pending")}</p>
          </div>
          <p className="text-xl font-bold" style={{ color: "#1a1a1a" }}>{pendingCount}</p>
        </div>
      </div>

      {/* Form card */}
      <div className="bg-white rounded-2xl overflow-hidden mb-5 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
        <div className="px-5 py-4 flex items-center gap-2.5" style={{ borderBottom: "1px solid #f5f5f5" }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#e8f5e9" }}>
            <Send className="w-4 h-4" style={{ color: "#00b050" }} />
          </div>
          <span className="font-bold text-sm" style={{ color: "#1a1a1a" }}>{t("requestWithdrawal")}</span>
        </div>
        <div className="p-5 space-y-5">
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
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: "#333" }}>Nom du bénéficiaire <span style={{ color: "#aaa", fontWeight: 400 }}>(optionnel)</span></label>
                  <input
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Prénom et nom du destinataire"
                    className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                    style={{ border: "1.5px solid #e2e8f0", background: "#fff", color: "#1a1a1a" }}
                    data-testid="input-withdrawal-recipient-name"
                  />
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

      {/* History */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid #f5f5f5" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#e3f2fd" }}>
              <BarChart3 className="w-4 h-4" style={{ color: "#1976d2" }} />
            </div>
            <span className="font-bold text-sm" style={{ color: "#1a1a1a" }}>{t("withdrawalHistory")}</span>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#f0f4ff", color: "#3949ab" }}>
            {(withdrawalList as Withdrawal[]).length}
          </span>
        </div>
        {wdLoading ? (
          <div className="p-4 space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : (withdrawalList as Withdrawal[]).length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: "#f5f5f5" }}>
              <Download className="w-6 h-6" style={{ color: "#ccc" }} />
            </div>
            <p className="text-sm font-medium mb-1" style={{ color: "#888" }}>{t("noWithdrawals")}</p>
            <p className="text-xs" style={{ color: "#bbb" }}>Vos demandes de reversement apparaîtront ici</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "#f5f5f5" }}>
            {(withdrawalList as Withdrawal[]).map((w) => {
              const statusConfig = w.status === "approved"
                ? { bg: "#e8f5e9", color: "#2e7d32", label: "Approuvé" }
                : w.status === "rejected"
                ? { bg: "#fce4ec", color: "#ad1457", label: "Refusé" }
                : { bg: "#fff8e1", color: "#e65100", label: "En attente" };
              return (
                <div key={w.id} className="px-5 py-4" data-testid={`withdrawal-row-${w.id}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "#f5f6f8" }}>
                      <Download className="w-5 h-5" style={{ color: "#888" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="font-bold text-sm" style={{ color: "#1a1a1a" }}>
                          {w.amount.toLocaleString("fr-FR")} <span className="font-semibold text-xs" style={{ color: "#888" }}>{countryToCurrency(w.country)}</span>
                        </p>
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0" style={{ background: statusConfig.bg, color: statusConfig.color }}>{statusConfig.label}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs" style={{ color: "#888" }}>
                        <span className="font-medium" style={{ color: "#555" }}>{w.country}</span>
                        {(w as any).operator && <span style={{ color: "#1e88e5", fontWeight: 600 }}>{(w as any).operator}</span>}
                        {(w as any).recipientName && <span><User className="w-3 h-3 inline mr-0.5" />{(w as any).recipientName}</span>}
                        <span><Phone className="w-3 h-3 inline mr-0.5" />{w.phone}</span>
                        <span>{new Date(w.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
                      </div>
                      {w.adminNote && (
                        <p className="text-xs mt-1.5 px-2.5 py-1.5 rounded-lg italic" style={{ background: "#fffbea", color: "#78350f", border: "1px solid #fef3c7" }}>
                          💬 {w.adminNote}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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

  const ZONE_FLAGS: Record<string, string> = {
    "Togo": "🇹🇬", "Benin": "🇧🇯", "Ivory Coast": "🇨🇮", "Senegal": "🇸🇳",
    "Mali": "🇲🇱", "Burkina Faso": "🇧🇫", "Niger": "🇳🇪", "Guinea-Bissau": "🇬🇼",
    "Cameroon": "🇨🇲", "Chad": "🇹🇩", "Congo": "🇨🇬", "Gabon": "🇬🇦",
    "CAR": "🇨🇫", "Equatorial Guinea": "🇬🇶", "DRC": "🇨🇩", "Guinea": "🇬🇳",
  };
  const ZONE_COLORS: Record<string, { bg: string; text: string; pill: string }> = {
    "XOF": { bg: "#e8f5e9", text: "#2e7d32", pill: "#00b050" },
    "XAF": { bg: "#e3f2fd", text: "#1565c0", pill: "#1976d2" },
    "CDF": { bg: "#fff8e1", text: "#e65100", pill: "#f59e0b" },
  };

  const totalTransferred = (walletTransfers as WalletTransfer[]).filter(w => w.status === "approved").reduce((s, w) => s + w.amount, 0);
  const pendingCount = (walletTransfers as WalletTransfer[]).filter(w => w.status === "pending").length;

  const fromMCObj = eligibleCountries.find(c => String(c.id) === fromCountryId);
  const toMCObj = toCountries.find(c => String(c.id) === toCountryId);
  const fromWtc = fromMCObj ? wtcMap.get(fromMCObj.country) : undefined;
  const parsedAmt = parseInt(amount) || 0;
  let estimatedFee = 0;
  if (!feeExempt && wtFeeSettings && parsedAmt > 0) {
    estimatedFee = wtFeeSettings.feeType === "percentage"
      ? Math.round((parsedAmt * wtFeeSettings.feeValue) / 100)
      : Math.round(wtFeeSettings.feeValue);
  }
  const totalNeeded = parsedAmt + estimatedFee;
  const insufficientBalance = !!(fromMCObj && parsedAmt > 0 && fromMCObj.balance < totalNeeded);
  const isDisabled = createMutation.isPending || !fromCountryId || !toCountryId || !amount || insufficientBalance;

  // Group eligible countries by zone for display
  const zoneGroups = new Map<string, MerchantCountry[]>();
  eligibleCountries.forEach(c => {
    const zone = wtcMap.get(c.country)?.currencyZone || "?";
    if (!zoneGroups.has(zone)) zoneGroups.set(zone, []);
    zoneGroups.get(zone)!.push(c);
  });

  return (
    <div className="-m-4 md:-m-6 min-h-full" style={{ background: "#f2f3f5" }}>

      {/* ── Hero header ── */}
      <div className="px-5 pt-6 pb-5" style={{ background: "#fff", borderBottom: "1px solid #f0f0f0" }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm shrink-0"
            style={{ background: "linear-gradient(135deg, #7e57c2 0%, #512da8 100%)" }}>
            <ArrowRightLeft className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold leading-tight" style={{ color: "#1a1a1a" }}>{t("walletTransfersTitle")}</h2>
            <p className="text-xs mt-0.5" style={{ color: "#888" }}>Transférez entre wallets de la même zone monétaire</p>
          </div>
        </div>
        {/* Stat pills */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl p-3.5" style={{ background: "#f3e5f5", border: "1.5px solid #e1bee7" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: "#7b1fa2" }}>Total transféré</p>
            <p className="text-xl font-bold" style={{ color: "#4a148c" }}>{totalTransferred.toLocaleString("fr-FR")}<span className="text-xs ml-1 font-semibold" style={{ color: "#9c27b0" }}>F</span></p>
          </div>
          <div className="rounded-2xl p-3.5" style={{ background: pendingCount > 0 ? "#fff8e1" : "#f3e5f5", border: `1.5px solid ${pendingCount > 0 ? "#ffe082" : "#e1bee7"}` }}>
            <p className="text-xs font-semibold mb-1" style={{ color: pendingCount > 0 ? "#e65100" : "#7b1fa2" }}>En attente</p>
            <p className="text-xl font-bold" style={{ color: pendingCount > 0 ? "#bf360c" : "#4a148c" }}>{pendingCount}</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* ── Zone info pills ── */}
        {wtcList.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Array.from(zoneGroups.entries()).map(([zone, countries]) => {
              const zc = ZONE_COLORS[zone] || { bg: "#f5f5f5", text: "#555", pill: "#888" };
              return (
                <div key={zone} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                  style={{ background: zc.bg, color: zc.text }}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: zc.pill }} />
                  Zone {zone} · {countries.map(c => ZONE_FLAGS[c.country] || "🌍").join(" ")} {countries.map(c => c.country).join(", ")}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Warning if not enough countries ── */}
        {eligibleCountries.length < 2 && (
          <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: "#fffbea", border: "1.5px solid #fef3c7" }}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#d97706" }} />
            <p className="text-xs leading-relaxed" style={{ color: "#92400e" }}>{t("transferWarning")}</p>
          </div>
        )}

        {/* ── Transfer form ── */}
        <form onSubmit={handleSubmit}>

          {/* Montant */}
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm mb-4" style={{ border: "1.5px solid #e8ecf0" }}>
            <div className="px-5 py-4 flex items-center gap-2.5" style={{ borderBottom: "1px solid #f5f5f5" }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#f3e5f5" }}>
                <DollarSign className="w-4 h-4" style={{ color: "#7e57c2" }} />
              </div>
              <span className="font-bold text-sm" style={{ color: "#1a1a1a" }}>Montant</span>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center rounded-xl overflow-hidden" style={{ border: "1.5px solid #e2e8f0", background: "#fafafa" }}>
                <span className="px-4 py-3.5 text-sm font-bold shrink-0" style={{ color: "#7e57c2", borderRight: "1px solid #e2e8f0" }}>
                  {fromZone || "FCFA"}
                </span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  min="1"
                  className="flex-1 px-4 py-3.5 text-xl font-bold outline-none bg-transparent"
                  style={{ color: "#1a1a1a" }}
                  data-testid="input-virement-amount"
                />
              </div>
              {fromMCObj && amount && parsedAmt > 0 && (
                <p className="text-xs mt-2 flex items-center gap-1.5" style={{ color: "#888" }}>
                  <Wallet className="w-3 h-3" />
                  Solde disponible : <strong style={{ color: "#555" }}>{fromMCObj.balance.toLocaleString("fr-FR")} {fromZone}</strong>
                </p>
              )}
            </div>
          </div>

          {/* From / Arrow / To */}
          <div className="relative mb-4">

            {/* From */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
              <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid #f5f5f5", background: "#fafafa" }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#7e57c2" }} />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#7e57c2" }}>De</span>
              </div>
              <div className="px-4 py-4">
                {eligibleCountries.length === 0 ? (
                  <p className="text-sm text-center py-2" style={{ color: "#bbb" }}>Aucun pays éligible</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {eligibleCountries.map((c) => {
                      const zone = wtcMap.get(c.country)?.currencyZone || "";
                      const zc = ZONE_COLORS[zone] || { bg: "#f5f5f5", text: "#555", pill: "#888" };
                      const selected = String(c.id) === fromCountryId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setFromCountryId(String(c.id)); setToCountryId(""); }}
                          className="flex items-center gap-2.5 px-3 py-3 rounded-xl transition-all text-left"
                          style={{
                            background: selected ? "#7e57c2" : "#f8f9fc",
                            border: `1.5px solid ${selected ? "#7e57c2" : "#e8ecf0"}`,
                          }}
                          data-testid={`select-from-${c.id}`}
                        >
                          <span className="text-xl leading-none shrink-0">{ZONE_FLAGS[c.country] || "🌍"}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate leading-tight" style={{ color: selected ? "#fff" : "#1a1a1a" }}>{c.country}</p>
                            <p className="text-xs leading-tight mt-0.5" style={{ color: selected ? "rgba(255,255,255,0.7)" : "#aaa" }}>
                              {c.balance.toLocaleString("fr-FR")} {zone}
                            </p>
                          </div>
                          {selected && <CheckCircle2 className="w-4 h-4 ml-auto shrink-0 text-white" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Arrow swap button */}
            <div className="flex justify-center -my-3 relative z-10">
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md"
                style={{ background: "linear-gradient(135deg, #7e57c2 0%, #512da8 100%)", border: "3px solid #f2f3f5" }}>
                <ArrowRightLeft className="w-5 h-5 text-white" />
              </div>
            </div>

            {/* To */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
              <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid #f5f5f5", background: "#fafafa" }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#00b050" }} />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#00b050" }}>À</span>
                {fromZone && <span className="text-xs ml-auto" style={{ color: "#aaa" }}>Même zone {fromZone} uniquement</span>}
              </div>
              <div className="px-4 py-4">
                {!fromCountryId ? (
                  <div className="py-4 text-center">
                    <p className="text-sm" style={{ color: "#ccc" }}>Sélectionnez d'abord un pays source</p>
                  </div>
                ) : toCountries.length === 0 ? (
                  <div className="py-4 text-center rounded-xl" style={{ background: "#fffbea" }}>
                    <p className="text-sm font-medium" style={{ color: "#d97706" }}>Aucun autre wallet disponible dans la zone {fromZone}</p>
                    <p className="text-xs mt-1" style={{ color: "#aaa" }}>Activez d'autres pays de la même zone pour effectuer un virement</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {toCountries.map((c) => {
                      const zone = wtcMap.get(c.country)?.currencyZone || "";
                      const selected = String(c.id) === toCountryId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setToCountryId(String(c.id))}
                          className="flex items-center gap-2.5 px-3 py-3 rounded-xl transition-all text-left"
                          style={{
                            background: selected ? "#00b050" : "#f8f9fc",
                            border: `1.5px solid ${selected ? "#00b050" : "#e8ecf0"}`,
                          }}
                          data-testid={`select-to-${c.id}`}
                        >
                          <span className="text-xl leading-none shrink-0">{ZONE_FLAGS[c.country] || "🌍"}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate leading-tight" style={{ color: selected ? "#fff" : "#1a1a1a" }}>{c.country}</p>
                            <p className="text-xs leading-tight mt-0.5" style={{ color: selected ? "rgba(255,255,255,0.7)" : "#aaa" }}>
                              {c.balance.toLocaleString("fr-FR")} {zone}
                            </p>
                          </div>
                          {selected && <CheckCircle2 className="w-4 h-4 ml-auto shrink-0 text-white" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Fee recap */}
          {fromCountryId && toCountryId && parsedAmt > 0 && (
            <div className="rounded-2xl p-4 mb-4 space-y-2"
              style={{ background: insufficientBalance ? "#fff5f5" : "#f0faf5", border: `1.5px solid ${insufficientBalance ? "#feb2b2" : "#c3e6cb"}` }}>
              <div className="flex justify-between text-sm">
                <span style={{ color: "#555" }}>Montant</span>
                <span style={{ color: "#1a1a1a", fontWeight: 600 }}>{parsedAmt.toLocaleString("fr-FR")} {fromZone || "FCFA"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: "#555" }}>Frais de virement</span>
                {feeExempt ? (
                  <span style={{ color: "#2e7d32", fontWeight: 600 }}>✦ Sans frais</span>
                ) : (
                  <span style={{ color: estimatedFee > 0 ? "#e53e3e" : "#555", fontWeight: 600 }}>
                    {estimatedFee > 0 ? `−${estimatedFee.toLocaleString("fr-FR")} ${fromZone || "FCFA"}` : "0"}
                  </span>
                )}
              </div>
              <div className="flex justify-between text-sm pt-2" style={{ borderTop: `1px solid ${insufficientBalance ? "#feb2b2" : "#c3e6cb"}` }}>
                <span style={{ fontWeight: 700, color: insufficientBalance ? "#c53030" : "#155724" }}>Total débité</span>
                <span style={{ fontWeight: 700, color: insufficientBalance ? "#c53030" : "#155724" }}>{totalNeeded.toLocaleString("fr-FR")} {fromZone || "FCFA"}</span>
              </div>
              {insufficientBalance && fromMCObj && (
                <p className="text-xs pt-1" style={{ color: "#c53030" }}>
                  Solde insuffisant — disponible : {fromMCObj.balance.toLocaleString("fr-FR")} {fromZone}
                </p>
              )}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isDisabled}
            className="w-full rounded-2xl py-4 text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
            style={{
              background: isDisabled ? "#d1d5db" : "linear-gradient(135deg, #7e57c2 0%, #512da8 100%)",
              color: isDisabled ? "#9ca3af" : "#fff",
              border: "none",
            }}
            data-testid="button-submit-virement"
          >
            {createMutation.isPending
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : <Send className="w-5 h-5" />}
            {createMutation.isPending ? t("processingLabel") : insufficientBalance ? t("insufficientFunds") : t("sendMoney")}
          </button>
        </form>

        {/* ── History ── */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid #f5f5f5" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#f3e5f5" }}>
                <BarChart3 className="w-4 h-4" style={{ color: "#7e57c2" }} />
              </div>
              <span className="font-bold text-sm" style={{ color: "#1a1a1a" }}>{t("transferHistory")}</span>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#f3e5f5", color: "#7e57c2" }}>
              {(walletTransfers as WalletTransfer[]).length}
            </span>
          </div>

          {wtLoading ? (
            <div className="p-4 space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : (walletTransfers as WalletTransfer[]).length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: "#f5f5f5" }}>
                <ArrowRightLeft className="w-6 h-6" style={{ color: "#ccc" }} />
              </div>
              <p className="text-sm font-medium mb-1" style={{ color: "#888" }}>{t("noTransfers")}</p>
              <p className="text-xs" style={{ color: "#bbb" }}>Vos virements inter-wallets apparaîtront ici</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "#f5f5f5" }}>
              {(walletTransfers as WalletTransfer[]).map((wt) => {
                const statusConf = wt.status === "approved"
                  ? { bg: "#e8f5e9", color: "#2e7d32", label: t("approved") }
                  : wt.status === "rejected"
                  ? { bg: "#fce4ec", color: "#ad1457", label: t("rejected") }
                  : { bg: "#fff8e1", color: "#e65100", label: t("pendingLabel") };
                return (
                  <div key={wt.id} className="px-5 py-4" data-testid={`virement-row-${wt.id}`}>
                    <div className="flex items-center gap-3">
                      <div className="shrink-0 flex items-center gap-1 text-lg">
                        <span>{ZONE_FLAGS[wt.fromCountry] || "🌍"}</span>
                        <ArrowRightLeft className="w-3.5 h-3.5 mx-0.5" style={{ color: "#7e57c2" }} />
                        <span>{ZONE_FLAGS[wt.toCountry] || "🌍"}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p className="text-sm font-bold" style={{ color: "#1a1a1a" }}>
                            {wt.fromCountry} → {wt.toCountry}
                          </p>
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0"
                            style={{ background: statusConf.bg, color: statusConf.color }}>
                            {statusConf.label}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs" style={{ color: "#888" }}>
                          <span className="font-semibold" style={{ color: "#555" }}>{wt.amount.toLocaleString("fr-FR")} {wt.currency}</span>
                          <span style={{ color: wt.fee === 0 ? "#00b050" : "#888" }}>
                            {wt.fee === 0 ? t("noFeesLabel") : `${t("fees")} : ${wt.fee.toLocaleString("fr-FR")} ${wt.currency}`}
                          </span>
                          <span>{new Date(wt.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
                        </div>
                        {wt.adminNote && (
                          <p className="text-xs mt-1.5 px-2.5 py-1.5 rounded-lg italic"
                            style={{ background: "#fffbea", color: "#78350f", border: "1px solid #fef3c7" }}>
                            💬 {wt.adminNote}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MerchantSettingsPanel({ token }: { token: string | null }) {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"info" | "password" | "support">("info");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isChanging, setIsChanging] = useState(false);

  const { data: contacts } = useQuery<{
    telegram1: string; telegram2: string;
    whatsapp1: string; whatsapp2: string; hours: string; hours2: string;
  }>({
    queryKey: ["/api/public/support-contacts"],
    staleTime: 5 * 60 * 1000,
  });

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Les mots de passe ne correspondent pas", variant: "destructive" }); return;
    }
    setIsChanging(true);
    try {
      const res = await fetch("/api/merchant/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || t("error")); }
      toast({ title: t("passwordChanged") });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Action non effectuée", description: "Une erreur est survenue. Veuillez réessayer.", variant: "destructive" });
    } finally { setIsChanging(false); }
  };

  const tabs = [
    { key: "info" as const, label: "Informations personnelles", icon: User },
    { key: "password" as const, label: "Mot de passe", icon: Shield },
    { key: "support" as const, label: "Contacts SAV", icon: MessageCircle },
  ];

  return (
    <div className="-m-4 md:-m-6 min-h-full" style={{ background: "#f2f3f5" }}>

      {/* Profile hero */}
      <div className="px-5 pt-6 pb-5" style={{ background: "#fff", borderBottom: "1px solid #f0f0f0" }}>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shrink-0 shadow-sm" style={{ background: "linear-gradient(135deg, #00b050 0%, #00852e 100%)" }}>
            {user?.name?.charAt(0)?.toUpperCase() || "M"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold leading-tight truncate" style={{ color: "#1a1a1a" }}>{user?.name}</p>
            <p className="text-sm mt-0.5 truncate" style={{ color: "#888" }}>{user?.email}</p>
            <div className="flex gap-1.5 mt-2">
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold" style={{ background: "#e8f5e9", color: "#2e7d32" }}>Marchand</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold" style={{ background: "#e3f2fd", color: "#1565c0" }}>Actif</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="px-4 pt-4 pb-0">
        <div className="flex gap-1 p-1 rounded-2xl" style={{ background: "#e8ecf0" }}>
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex-1 flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: activeTab === tab.key ? "#fff" : "transparent",
                  color: activeTab === tab.key ? "#00b050" : "#888",
                  boxShadow: activeTab === tab.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                }}
                data-testid={`tab-settings-${tab.key}`}
              >
                <Icon className="w-4 h-4" />
                <span className="leading-none text-center" style={{ fontSize: "10px" }}>{tab.label.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-4 space-y-3">

        {/* ── INFO TAB ── */}
        {activeTab === "info" && (
          <>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
              <div className="px-5 py-4 flex items-center gap-2.5" style={{ borderBottom: "1px solid #f5f5f5" }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#e8f5e9" }}>
                  <User className="w-4 h-4" style={{ color: "#00b050" }} />
                </div>
                <span className="font-bold text-sm" style={{ color: "#1a1a1a" }}>Informations du compte</span>
              </div>
              <div className="divide-y" style={{ borderColor: "#f8f9fa" }}>
                {/* Nom commercial */}
                <div className="flex items-center px-5 py-4 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold mb-0.5" style={{ color: "#888" }}>Nom commercial</p>
                    <p className="text-sm font-bold truncate" style={{ color: "#1a1a1a" }}>{user?.name || "—"}</p>
                  </div>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#f5f6f8" }}>
                    <Building2 className="w-4 h-4" style={{ color: "#888" }} />
                  </div>
                </div>
                {/* Email */}
                <div className="flex items-center px-5 py-4 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold mb-0.5" style={{ color: "#888" }}>Adresse e-mail</p>
                    <p className="text-sm font-medium truncate" style={{ color: "#1a1a1a" }}>{user?.email || "—"}</p>
                  </div>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#fce4ec" }}>
                    <Mail className="w-4 h-4" style={{ color: "#e91e63" }} />
                  </div>
                </div>
                {/* Role */}
                <div className="flex items-center px-5 py-4 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold mb-0.5" style={{ color: "#888" }}>Rôle</p>
                    <p className="text-sm font-medium" style={{ color: "#1a1a1a" }}>Marchand WestPay</p>
                  </div>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#e3f2fd" }}>
                    <Shield className="w-4 h-4" style={{ color: "#1976d2" }} />
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: "#fffbea", border: "1.5px solid #fef3c7" }}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#d97706" }} />
              <p className="text-xs leading-relaxed" style={{ color: "#92400e" }}>
                Pour modifier votre nom commercial ou votre adresse e-mail, veuillez contacter votre administrateur WestPay.
              </p>
            </div>
          </>
        )}

        {/* ── PASSWORD TAB ── */}
        {activeTab === "password" && (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
            <div className="px-5 py-4 flex items-center gap-2.5" style={{ borderBottom: "1px solid #f5f5f5" }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#f3e5f5" }}>
                <Shield className="w-4 h-4" style={{ color: "#9c27b0" }} />
              </div>
              <div>
                <span className="font-bold text-sm" style={{ color: "#1a1a1a" }}>{t("changePassword")}</span>
                <p className="text-xs" style={{ color: "#aaa" }}>Choisissez un mot de passe fort et unique</p>
              </div>
            </div>
            <form onSubmit={handleChangePassword} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: "#555" }}>{t("currentPassword")}</label>
                <div className="flex items-center rounded-xl px-3.5 py-2.5 gap-2" style={{ border: "1.5px solid #e2e8f0", background: "#f9fafb" }}>
                  <input
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="flex-1 text-sm outline-none bg-transparent"
                    style={{ color: "#1a1a1a" }}
                    data-testid="input-merchant-current-password"
                  />
                  <button type="button" onClick={() => setShowCurrent(v => !v)} className="shrink-0" style={{ color: "#bbb" }}>
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: "#555" }}>{t("newPassword")}</label>
                <div className="flex items-center rounded-xl px-3.5 py-2.5 gap-2" style={{ border: "1.5px solid #e2e8f0", background: "#f9fafb" }}>
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="flex-1 text-sm outline-none bg-transparent"
                    style={{ color: "#1a1a1a" }}
                    data-testid="input-merchant-new-password"
                  />
                  <button type="button" onClick={() => setShowNew(v => !v)} className="shrink-0" style={{ color: "#bbb" }}>
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: "#555" }}>Confirmer le nouveau mot de passe</label>
                <div className="flex items-center rounded-xl px-3.5 py-2.5 gap-2" style={{
                  border: `1.5px solid ${confirmPassword && confirmPassword !== newPassword ? "#f44336" : "#e2e8f0"}`,
                  background: "#f9fafb"
                }}>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="flex-1 text-sm outline-none bg-transparent"
                    style={{ color: "#1a1a1a" }}
                    data-testid="input-merchant-confirm-password"
                  />
                  {confirmPassword && (
                    confirmPassword === newPassword
                      ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "#00b050" }} />
                      : <AlertCircle className="w-4 h-4 shrink-0" style={{ color: "#f44336" }} />
                  )}
                </div>
              </div>
              <button
                type="submit"
                disabled={isChanging || !currentPassword || !newPassword || !confirmPassword}
                className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                style={{
                  background: isChanging || !currentPassword || !newPassword || !confirmPassword ? "#ccc" : "#00b050",
                  color: "#fff", border: "none"
                }}
                data-testid="button-merchant-change-password"
              >
                {isChanging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                {isChanging ? "Modification..." : t("changePassword")}
              </button>
            </form>
          </div>
        )}

        {/* ── SUPPORT TAB ── */}
        {activeTab === "support" && (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
            <div className="px-5 py-4 flex items-center gap-2.5" style={{ borderBottom: "1px solid #f5f5f5" }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#e3f2fd" }}>
                <MessageCircle className="w-4 h-4" style={{ color: "#1976d2" }} />
              </div>
              <div>
                <span className="font-bold text-sm" style={{ color: "#1a1a1a" }}>Contacts du support</span>
                <p className="text-xs" style={{ color: "#aaa" }}>Nous sommes disponibles pour vous aider</p>
              </div>
            </div>
            {contacts ? (
              <div className="divide-y p-0" style={{ borderColor: "#f8f9fa" }}>
                {contacts.telegram1 && (
                  <a href={`https://t.me/${contacts.telegram1.replace("@","")}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-4 px-5 py-4 transition-all hover:bg-gray-50"
                    data-testid="link-support-telegram1">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#e3f2fd" }}>
                      <MessageCircle className="w-5 h-5" style={{ color: "#039be5" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold mb-0.5" style={{ color: "#888" }}>Telegram</p>
                      <p className="text-sm font-bold truncate" style={{ color: "#039be5" }}>{contacts.telegram1}</p>
                      {contacts.hours && <p className="text-xs mt-0.5" style={{ color: "#aaa" }}>{contacts.hours}</p>}
                    </div>
                    <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "#ccc" }} />
                  </a>
                )}
                {contacts.telegram2 && (
                  <a href={`https://t.me/${contacts.telegram2.replace("@","")}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-4 px-5 py-4 transition-all hover:bg-gray-50"
                    data-testid="link-support-telegram2">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#e3f2fd" }}>
                      <MessageCircle className="w-5 h-5" style={{ color: "#039be5" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold mb-0.5" style={{ color: "#888" }}>Telegram (2)</p>
                      <p className="text-sm font-bold truncate" style={{ color: "#039be5" }}>{contacts.telegram2}</p>
                      {contacts.hours2 && <p className="text-xs mt-0.5" style={{ color: "#aaa" }}>{contacts.hours2}</p>}
                    </div>
                    <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "#ccc" }} />
                  </a>
                )}
                {contacts.whatsapp1 && (
                  <a href={`https://wa.me/${contacts.whatsapp1.replace(/\D/g,"")}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-4 px-5 py-4 transition-all hover:bg-gray-50"
                    data-testid="link-support-whatsapp1">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#e8f5e9" }}>
                      <Phone className="w-5 h-5" style={{ color: "#25d366" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold mb-0.5" style={{ color: "#888" }}>WhatsApp</p>
                      <p className="text-sm font-bold truncate" style={{ color: "#25d366" }}>{contacts.whatsapp1}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "#ccc" }} />
                  </a>
                )}
                {contacts.whatsapp2 && (
                  <a href={`https://wa.me/${contacts.whatsapp2.replace(/\D/g,"")}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-4 px-5 py-4 transition-all hover:bg-gray-50"
                    data-testid="link-support-whatsapp2">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#e8f5e9" }}>
                      <Phone className="w-5 h-5" style={{ color: "#25d366" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold mb-0.5" style={{ color: "#888" }}>WhatsApp (2)</p>
                      <p className="text-sm font-bold truncate" style={{ color: "#25d366" }}>{contacts.whatsapp2}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "#ccc" }} />
                  </a>
                )}
              </div>
            ) : (
              <div className="p-8 text-center">
                <MessageCircle className="w-8 h-8 mx-auto mb-2" style={{ color: "#ddd" }} />
                <p className="text-sm" style={{ color: "#aaa" }}>Aucun contact configuré</p>
              </div>
            )}
          </div>
        )}

        {/* Logout — always visible */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm" style={{ border: "1.5px solid #ffcdd2" }}>
          <button
            onClick={() => { logout(); setLocation("/merchant-login"); }}
            className="w-full flex items-center gap-4 px-5 py-4 transition-all hover:bg-red-50"
            data-testid="button-merchant-logout"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#fff0f0" }}>
              <LogOut className="w-5 h-5" style={{ color: "#e53935" }} />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold" style={{ color: "#c62828" }}>{t("logout")}</p>
              <p className="text-xs mt-0.5" style={{ color: "#aaa" }}>{t("logoutDesc")}</p>
            </div>
            <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "#ffcdd2" }} />
          </button>
        </div>
      </div>
    </div>
  );
}

const LINK_COUNTRY_FLAGS: Record<string, { flag: string; currency: string; label: string }> = {
  "Togo": { flag: "🇹🇬", currency: "XOF", label: "Togo" },
  "Benin": { flag: "🇧🇯", currency: "XOF", label: "Bénin" },
  "Burkina Faso": { flag: "🇧🇫", currency: "XOF", label: "Burkina" },
  "Cameroun": { flag: "🇨🇲", currency: "XAF", label: "Cameroun" },
  "Congo Brazzaville": { flag: "🇨🇬", currency: "XAF", label: "Congo" },
  "Congo RDC": { flag: "🇨🇩", currency: "CDF", label: "Congo RDC" },
  "Gabon": { flag: "🇬🇦", currency: "XAF", label: "Gabon" },
  "Cote d'Ivoire": { flag: "🇨🇮", currency: "XOF", label: "Côte d'Ivoire" },
  "Mali": { flag: "🇲🇱", currency: "XOF", label: "Mali" },
  "Senegal": { flag: "🇸🇳", currency: "XOF", label: "Sénégal" },
  "Guinee": { flag: "🇬🇳", currency: "GNF", label: "Guinée" },
  "Gambie": { flag: "🇬🇲", currency: "GMD", label: "Gambie" },
  "Ghana": { flag: "🇬🇭", currency: "GHS", label: "Ghana" },
  "Nigeria": { flag: "🇳🇬", currency: "NGN", label: "Nigeria" },
  "Niger": { flag: "🇳🇪", currency: "XOF", label: "Niger" },
};

function PaymentLinksPanel({ token }: { token: string | null }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const baseUrl = "https://westpay.cloud";
  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [editLink, setEditLink] = useState<PaymentLink | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const mkForm = () => ({
    name: "", description: "", countries: [] as string[],
    amountType: "flexible" as "fixed" | "flexible", amount: "",
    notificationEmail: "", confirmationMessage: "", redirectUrl: "",
    collectBillingAddress: false, showShareButton: true,
    paymentLimit: "", expiresAt: "",
  });
  const [form, setForm] = useState(mkForm());
  const setField = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const { data: merchantCountries = [] } = useMerchantFetch("/api/merchant/balance", ["/api/merchant/balance"], token);
  const activeCountries = (merchantCountries as MerchantCountry[]).filter(c => c.active).map(c => c.country);

  const { data: links = [], isLoading } = useQuery<PaymentLink[]>({
    queryKey: ["/api/merchant/payment-links"],
    queryFn: async () => {
      const res = await fetch("/api/merchant/payment-links", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    enabled: !!token,
  });

  const buildPayload = (f: ReturnType<typeof mkForm>) => ({
    name: f.name, description: f.description || undefined,
    amountType: f.amountType, amount: f.amount ? Number(f.amount) : undefined,
    redirectUrl: f.redirectUrl || undefined,
    paymentLimit: f.paymentLimit ? Number(f.paymentLimit) : undefined,
    expiresAt: f.expiresAt || undefined,
    countries: f.countries.length > 0 ? f.countries : undefined,
    confirmationMessage: f.confirmationMessage || undefined,
    collectBillingAddress: f.collectBillingAddress,
    showShareButton: f.showShareButton,
    notificationEmail: f.notificationEmail || undefined,
  });

  const createMutation = useMutation({
    mutationFn: async (f: ReturnType<typeof mkForm>) => {
      const res = await fetch("/api/merchant/payment-links", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(buildPayload(f)),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/payment-links"] });
      setView("list"); setForm(mkForm()); setShowAdvanced(false);
      toast({ title: t("linkCreated") });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/merchant/payment-links/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/payment-links"] });
      setView("list"); setEditLink(null); setForm(mkForm()); setShowAdvanced(false);
      toast({ title: t("linkUpdated") });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/merchant/payment-links/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Error");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/merchant/payment-links"] }); toast({ title: t("linkDeleted") }); },
  });

  const copyLink = (uniqueId: string) => { navigator.clipboard.writeText(`${baseUrl}/link/${uniqueId}`); toast({ title: t("copied") }); };
  const shareLink = (uniqueId: string) => {
    const url = `${baseUrl}/link/${uniqueId}`;
    if (navigator.share) navigator.share({ title: "Lien de paiement WestPay", url });
    else { navigator.clipboard.writeText(url); toast({ title: "Lien copié !" }); }
  };

  const openCreate = () => { setForm(mkForm()); setEditLink(null); setShowAdvanced(false); setView("create"); };
  const openEdit = (link: PaymentLink) => {
    const l = link as any;
    setEditLink(link);
    setForm({
      name: link.name, description: l.description || "",
      countries: l.countries || [], amountType: link.amountType as "fixed" | "flexible",
      amount: link.amount?.toString() || "", notificationEmail: l.notificationEmail || "",
      confirmationMessage: l.confirmationMessage || "", redirectUrl: link.redirectUrl || "",
      collectBillingAddress: l.collectBillingAddress || false,
      showShareButton: l.showShareButton !== false,
      paymentLimit: link.paymentLimit?.toString() || "",
      expiresAt: link.expiresAt ? new Date(link.expiresAt as any).toISOString().slice(0, 16) : "",
    });
    setShowAdvanced(false); setView("edit");
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast({ title: "Le titre du lien est requis", variant: "destructive" }); return; }
    if (form.amountType === "fixed" && !form.amount) { toast({ title: "Le montant est requis pour un lien à montant fixe", variant: "destructive" }); return; }
    if (view === "edit" && editLink) updateMutation.mutate({ id: editLink.id, data: buildPayload(form) });
    else createMutation.mutate(form);
  };

  const toggleCountry = (c: string) => setForm(f => ({
    ...f, countries: f.countries.includes(c) ? f.countries.filter(x => x !== c) : [...f.countries, c],
  }));

  const totalRevenue = links.reduce((s, l) => s + l.totalRevenue, 0);
  const totalPayments = links.reduce((s, l) => s + l.paymentCount, 0);
  const isPending = createMutation.isPending || updateMutation.isPending;
  const isEdit = view === "edit";

  // ─── FORM VIEW (Create / Edit) ───────────────────────────────────────────────
  if (view === "create" || view === "edit") {
    return (
      <div className="-m-4 md:-m-6" style={{ background: "#f2f3f5", minHeight: "100%" }}>
        {/* Sticky header */}
        <div className="sticky top-0 z-10 px-4 pt-5 pb-3 flex items-center gap-3" style={{ background: "#f2f3f5", borderBottom: "1px solid #e8ecf0" }}>
          <button
            onClick={() => { setView("list"); setEditLink(null); setForm(mkForm()); }}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "#fff", border: "1.5px solid #e0e0e0" }}
          >
            <ChevronLeft className="w-4 h-4" style={{ color: "#333" }} />
          </button>
          <div>
            <h2 className="text-base font-bold leading-tight" style={{ color: "#1a1a1a" }}>
              {isEdit ? "Modifier le lien" : "Créer un lien de paiement"}
            </h2>
            <p className="text-xs" style={{ color: "#aaa" }}>Liens de Paiement / {isEdit ? editLink?.name : "Nouveau lien"}</p>
          </div>
        </div>

        {/* Form sections */}
        <div className="px-4 pt-4 pb-36 space-y-3">

          {/* ── Informations du lien ── */}
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1.5px solid #e8ecf0" }}>
            <div className="px-4 py-3 flex items-center gap-2.5" style={{ borderBottom: "1px solid #f5f5f5" }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#e8f5e9" }}>
                <Link className="w-4 h-4" style={{ color: "#00b050" }} />
              </div>
              <span className="font-bold text-sm" style={{ color: "#1a1a1a" }}>Informations du lien</span>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-bold mb-1.5 block" style={{ color: "#555" }}>
                  Titre du lien <span style={{ color: "#e53e3e" }}>*</span>
                </label>
                <input
                  value={form.name} onChange={e => setField("name", e.target.value)}
                  placeholder="ex : Billets Liverpool, Facture Mai, Inscription…"
                  className="w-full px-3.5 py-3 text-sm rounded-xl outline-none transition-all"
                  style={{ border: `1.5px solid ${form.name ? "#00b050" : "#e0e0e0"}`, background: "#fafafa", color: "#1a1a1a" }}
                  data-testid="input-link-name"
                />
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block" style={{ color: "#555" }}>
                  Description <span className="font-normal" style={{ color: "#bbb" }}>(optionnel)</span>
                </label>
                <textarea
                  value={form.description} onChange={e => setField("description", e.target.value)}
                  placeholder="ex : Meilleures places, rangée VIP, entrée générale…"
                  rows={2}
                  className="w-full px-3.5 py-3 text-sm rounded-xl outline-none resize-none transition-all"
                  style={{ border: "1.5px solid #e0e0e0", background: "#fafafa", color: "#1a1a1a" }}
                  data-testid="input-link-description"
                />
              </div>
            </div>
          </div>

          {/* ── Pays de collecte ── */}
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1.5px solid #e8ecf0" }}>
            <div className="px-4 py-3 flex items-center gap-2.5" style={{ borderBottom: "1px solid #f5f5f5" }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#e3f2fd" }}>
                <Globe className="w-4 h-4" style={{ color: "#1976d2" }} />
              </div>
              <span className="font-bold text-sm" style={{ color: "#1a1a1a" }}>Pays de collecte</span>
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs" style={{ color: "#888" }}>
                  {form.countries.length === 0
                    ? "Le payeur choisira son opérateur lors du paiement."
                    : `${form.countries.length} pays sélectionné${form.countries.length > 1 ? "s" : ""}`}
                </p>
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
                  style={{
                    background: form.countries.length === activeCountries.length && activeCountries.length > 0 ? "#e8f5e9" : "#f5f5f5",
                    color: form.countries.length === activeCountries.length && activeCountries.length > 0 ? "#00b050" : "#555",
                    border: "1.5px solid #e0e0e0"
                  }}
                  onClick={() => setForm(f => ({ ...f, countries: f.countries.length === activeCountries.length ? [] : [...activeCountries] }))}
                  data-testid="button-select-all-countries"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  {form.countries.length === activeCountries.length && activeCountries.length > 0 ? "Tout désélect." : "Tout sélectionner"}
                </button>
              </div>
              {activeCountries.length === 0 ? (
                <p className="text-xs text-center py-4" style={{ color: "#aaa" }}>Aucun pays actif configuré sur votre compte</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {activeCountries.map(c => {
                      const info = LINK_COUNTRY_FLAGS[c] || { flag: "🌍", currency: "", label: c };
                      const selected = form.countries.includes(c);
                      return (
                        <button
                          key={c}
                          onClick={() => toggleCountry(c)}
                          className="flex flex-col items-center py-3 px-2 rounded-xl transition-all active:scale-95"
                          style={{
                            border: `1.5px solid ${selected ? "#00b050" : "#e8ecf0"}`,
                            background: selected ? "#f0fff4" : "#fafafa",
                          }}
                          data-testid={`button-country-${c.replace(/[\s']/g, "-").toLowerCase()}`}
                        >
                          <span className="text-2xl mb-1 leading-none">{info.flag}</span>
                          <span className="text-xs font-semibold leading-tight text-center" style={{ color: selected ? "#00b050" : "#333" }}>{info.label}</span>
                          <span className="text-xs leading-tight" style={{ color: "#aaa" }}>{info.currency}</span>
                        </button>
                      );
                    })}
                  </div>
                  {form.countries.length === 0 && (
                    <p className="text-xs mt-2 text-center py-1 rounded-lg" style={{ color: "#aaa", background: "#f9fafb" }}>
                      Aucune sélection = tous les pays actifs acceptés
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Montant ── */}
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1.5px solid #e8ecf0" }}>
            <div className="px-4 py-3 flex items-center gap-2.5" style={{ borderBottom: "1px solid #f5f5f5" }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#fff8e1" }}>
                <Zap className="w-4 h-4" style={{ color: "#f59e0b" }} />
              </div>
              <span className="font-bold text-sm" style={{ color: "#1a1a1a" }}>Montant</span>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#1a1a1a" }}>Montant fixe</p>
                  <p className="text-xs mt-0.5" style={{ color: "#888" }}>
                    {form.amountType === "fixed" ? "Activé — montant prédéfini par le marchand" : "Désactivé — le payeur saisit le montant librement"}
                  </p>
                </div>
                <button
                  onClick={() => setForm(f => ({ ...f, amountType: f.amountType === "fixed" ? "flexible" : "fixed" }))}
                  className="relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0"
                  style={{ background: form.amountType === "fixed" ? "#00b050" : "#d1d5db" }}
                  data-testid="toggle-amount-type"
                >
                  <span className="inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform"
                    style={{ transform: form.amountType === "fixed" ? "translateX(1.35rem)" : "translateX(0.15rem)" }} />
                </button>
              </div>
              {form.amountType === "fixed" && (
                <div>
                  <label className="text-xs font-bold mb-1.5 block" style={{ color: "#555" }}>Montant (F CFA)</label>
                  <input
                    type="number" value={form.amount} onChange={e => setField("amount", e.target.value)}
                    placeholder="ex : 5000"
                    className="w-full px-3.5 py-3 text-sm rounded-xl outline-none"
                    style={{ border: `1.5px solid ${form.amount ? "#00b050" : "#e0e0e0"}`, background: "#fafafa", color: "#1a1a1a" }}
                    data-testid="input-link-amount"
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── Notification par email ── */}
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1.5px solid #e8ecf0" }}>
            <div className="px-4 py-3 flex items-center gap-2.5" style={{ borderBottom: "1px solid #f5f5f5" }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#fce4ec" }}>
                <Mail className="w-4 h-4" style={{ color: "#e91e63" }} />
              </div>
              <span className="font-bold text-sm" style={{ color: "#1a1a1a" }}>Notification par email</span>
            </div>
            <div className="p-4">
              <p className="text-xs mb-3" style={{ color: "#888" }}>
                Recevez une notification à chaque paiement reçu via ce lien.
              </p>
              <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5" style={{ border: "1.5px solid #e0e0e0", background: "#fafafa" }}>
                <Mail className="w-4 h-4 shrink-0" style={{ color: "#ccc" }} />
                <input
                  type="email" value={form.notificationEmail} onChange={e => setField("notificationEmail", e.target.value)}
                  placeholder="votre@email.com"
                  className="flex-1 text-sm outline-none bg-transparent"
                  style={{ color: "#1a1a1a" }}
                  data-testid="input-link-notification-email"
                />
              </div>
            </div>
          </div>

          {/* ── Paramètres avancés ── */}
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1.5px solid #e8ecf0" }}>
            <button
              className="w-full px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: showAdvanced ? "1px solid #f5f5f5" : "none" }}
              onClick={() => setShowAdvanced(v => !v)}
              data-testid="button-toggle-advanced"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#f3e5f5" }}>
                  <Settings className="w-4 h-4" style={{ color: "#9c27b0" }} />
                </div>
                <span className="font-bold text-sm" style={{ color: "#1a1a1a" }}>Paramètres avancés</span>
              </div>
              <ChevronRight className="w-4 h-4 transition-transform" style={{ color: "#bbb", transform: showAdvanced ? "rotate(90deg)" : "none" }} />
            </button>

            {showAdvanced && (
              <div className="p-4 space-y-5">

                {/* Message de confirmation */}
                <div>
                  <label className="text-xs font-bold mb-1 block" style={{ color: "#555" }}>Message de confirmation</label>
                  <p className="text-xs mb-2" style={{ color: "#aaa" }}>Affiché au payeur après un paiement réussi.</p>
                  <input
                    value={form.confirmationMessage} onChange={e => setField("confirmationMessage", e.target.value)}
                    placeholder="ex : Merci pour votre paiement ! Votre commande est confirmée."
                    className="w-full px-3.5 py-3 text-sm rounded-xl outline-none"
                    style={{ border: "1.5px solid #e0e0e0", background: "#fafafa", color: "#1a1a1a" }}
                    data-testid="input-link-confirmation-message"
                  />
                </div>

                {/* Redirection après paiement */}
                <div>
                  <label className="text-xs font-bold mb-1 block" style={{ color: "#555" }}>Redirection après paiement</label>
                  <p className="text-xs mb-2" style={{ color: "#aaa" }}>Redirigez le client vers votre site après le paiement.</p>
                  <input
                    value={form.redirectUrl} onChange={e => setField("redirectUrl", e.target.value)}
                    placeholder="https://votre-site.com/merci"
                    className="w-full px-3.5 py-3 text-sm rounded-xl outline-none"
                    style={{ border: "1.5px solid #e0e0e0", background: "#fafafa", color: "#1a1a1a" }}
                    data-testid="input-link-redirect"
                  />
                </div>

                {/* Collecter l'adresse de facturation */}
                <div className="flex items-start justify-between gap-4 py-1">
                  <div className="flex-1">
                    <p className="text-sm font-semibold" style={{ color: "#1a1a1a" }}>Collecter l'adresse de facturation</p>
                    <p className="text-xs mt-0.5" style={{ color: "#888" }}>Demande l'adresse complète du payeur lors du paiement.</p>
                  </div>
                  <button
                    onClick={() => setField("collectBillingAddress", !form.collectBillingAddress)}
                    className="relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 mt-0.5"
                    style={{ background: form.collectBillingAddress ? "#00b050" : "#d1d5db" }}
                    data-testid="toggle-collect-billing"
                  >
                    <span className="inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform"
                      style={{ transform: form.collectBillingAddress ? "translateX(1.35rem)" : "translateX(0.15rem)" }} />
                  </button>
                </div>

                {/* Afficher le bouton de partage */}
                <div className="flex items-start justify-between gap-4 py-1">
                  <div className="flex-1">
                    <p className="text-sm font-semibold" style={{ color: "#1a1a1a" }}>Afficher le bouton de partage</p>
                    <p className="text-xs mt-0.5" style={{ color: "#888" }}>Permet au payeur de partager le lien avec d'autres personnes.</p>
                  </div>
                  <button
                    onClick={() => setField("showShareButton", !form.showShareButton)}
                    className="relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 mt-0.5"
                    style={{ background: form.showShareButton ? "#00b050" : "#d1d5db" }}
                    data-testid="toggle-show-share"
                  >
                    <span className="inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform"
                      style={{ transform: form.showShareButton ? "translateX(1.35rem)" : "translateX(0.15rem)" }} />
                  </button>
                </div>

                {/* Limite d'utilisations */}
                <div>
                  <label className="text-xs font-bold mb-1 block" style={{ color: "#555" }}>Limite d'utilisations</label>
                  <p className="text-xs mb-2" style={{ color: "#aaa" }}>Nombre maximum de paiements autorisés via ce lien.</p>
                  <input
                    type="number" value={form.paymentLimit} onChange={e => setField("paymentLimit", e.target.value)}
                    placeholder="Illimité par défaut"
                    className="w-full px-3.5 py-3 text-sm rounded-xl outline-none"
                    style={{ border: "1.5px solid #e0e0e0", background: "#fafafa", color: "#1a1a1a" }}
                    data-testid="input-link-limit"
                  />
                </div>

                {/* Date d'expiration */}
                <div>
                  <label className="text-xs font-bold mb-1 block" style={{ color: "#555" }}>Date d'expiration</label>
                  <p className="text-xs mb-2" style={{ color: "#aaa" }}>Le lien sera automatiquement désactivé après cette date.</p>
                  <input
                    type="datetime-local" value={form.expiresAt} onChange={e => setField("expiresAt", e.target.value)}
                    className="w-full px-3.5 py-3 text-sm rounded-xl outline-none"
                    style={{ border: "1.5px solid #e0e0e0", background: "#fafafa", color: "#1a1a1a" }}
                    data-testid="input-link-expires"
                  />
                </div>

              </div>
            )}
          </div>
        </div>

        {/* Sticky bottom action bar */}
        <div className="fixed bottom-0 left-0 right-0 px-4 py-4 z-20"
          style={{ background: "rgba(242,243,245,0.97)", borderTop: "1px solid #e0e0e0", backdropFilter: "blur(8px)" }}>
          <div className="flex gap-3 max-w-lg mx-auto">
            <button
              onClick={() => { setView("list"); setEditLink(null); setForm(mkForm()); }}
              className="flex-1 py-3.5 rounded-2xl text-sm font-bold"
              style={{ background: "#fff", color: "#555", border: "1.5px solid #e0e0e0" }}
              data-testid="button-cancel-link"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit} disabled={isPending}
              className="flex-1 py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
              style={{ background: isPending ? "#ccc" : "#00b050", color: "#fff", border: "none" }}
              data-testid="button-submit-link-form"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              {isEdit ? "Enregistrer" : "Créer le lien"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── LIST VIEW ───────────────────────────────────────────────────────────────
  return (
    <div className="-m-4 md:-m-6 p-4 md:p-6 min-h-full" style={{ background: "#f2f3f5" }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-5">
        <div>
          <h2 className="text-xl font-bold" style={{ color: "#1a1a1a" }}>{t("paymentLinksTitle")}</h2>
          <p className="text-xs mt-0.5" style={{ color: "#888" }}>{t("paymentLinksDesc")}</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm"
          style={{ background: "#00b050", color: "#fff", border: "none" }}
          data-testid="button-create-payment-link"
        >
          <Plus className="w-4 h-4" /> {t("newLink")}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-2xl p-3.5 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
          <div className="w-7 h-7 rounded-xl flex items-center justify-center mb-2" style={{ background: "#e3f2fd" }}>
            <Link className="w-3.5 h-3.5" style={{ color: "#1976d2" }} />
          </div>
          <p className="text-2xl font-bold" style={{ color: "#1a1a1a" }}>{links.length}</p>
          <p className="text-xs font-semibold mt-0.5" style={{ color: "#888" }}>{t("links")}</p>
        </div>
        <div className="bg-white rounded-2xl p-3.5 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
          <div className="w-7 h-7 rounded-xl flex items-center justify-center mb-2" style={{ background: "#e8f5e9" }}>
            <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#00b050" }} />
          </div>
          <p className="text-2xl font-bold" style={{ color: "#1a1a1a" }}>{totalPayments}</p>
          <p className="text-xs font-semibold mt-0.5" style={{ color: "#888" }}>{t("payments")}</p>
        </div>
        <div className="bg-white rounded-2xl p-3.5 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
          <div className="w-7 h-7 rounded-xl flex items-center justify-center mb-2" style={{ background: "#f3e5f5" }}>
            <BarChart3 className="w-3.5 h-3.5" style={{ color: "#9c27b0" }} />
          </div>
          <p className="text-lg font-bold leading-tight" style={{ color: "#1a1a1a" }}>{totalRevenue.toLocaleString()}<span className="text-xs ml-0.5 font-semibold" style={{ color: "#aaa" }}>F</span></p>
          <p className="text-xs font-semibold mt-0.5" style={{ color: "#888" }}>{t("volume")}</p>
        </div>
      </div>

      {isLoading ? <MerchantLoadingSkeleton /> : links.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
          <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: "#f0f4ff" }}>
            <Link className="w-7 h-7" style={{ color: "#3949ab" }} />
          </div>
          <p className="font-bold text-sm mb-1" style={{ color: "#1a1a1a" }}>{t("noLinks")}</p>
          <p className="text-xs mb-4" style={{ color: "#aaa" }}>{t("noLinksDesc")}</p>
          <button onClick={openCreate} className="px-5 py-2.5 rounded-xl text-sm font-bold" style={{ background: "#00b050", color: "#fff" }}>
            {t("createLink")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link) => {
            const url = `${baseUrl}/link/${link.uniqueId}`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(url)}`;
            const isExpired = link.expiresAt && new Date() > new Date(link.expiresAt as any);
            const isLimited = link.paymentLimit && link.paymentCount >= link.paymentLimit;
            const inactive = !link.active || isExpired || isLimited;
            let statusStyle = { bg: "#e8f5e9", color: "#2e7d32", label: t("statusActive") };
            if (isExpired) statusStyle = { bg: "#fce4ec", color: "#ad1457", label: t("expired") };
            else if (isLimited) statusStyle = { bg: "#fce4ec", color: "#ad1457", label: t("limitReached") };
            else if (!link.active) statusStyle = { bg: "#f5f5f5", color: "#757575", label: t("inactive") };
            const l = link as any;
            return (
              <div key={link.id} className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: "1.5px solid #e8ecf0", opacity: inactive ? 0.65 : 1 }} data-testid={`card-payment-link-${link.id}`}>
                <div className="flex items-start gap-3">
                  <img src={qrUrl} alt="QR" className="w-14 h-14 rounded-xl shrink-0" style={{ border: "1px solid #e8ecf0" }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate" style={{ color: "#1a1a1a" }} data-testid={`text-link-name-${link.id}`}>{link.name}</p>
                        {l.description && <p className="text-xs truncate mt-0.5" style={{ color: "#888" }}>{l.description}</p>}
                        <p className="text-xs mt-0.5" style={{ color: "#aaa" }}>{link.amountType === "fixed" ? `${link.amount?.toLocaleString()} F CFA` : t("flexibleAmount")}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 whitespace-nowrap" style={{ background: statusStyle.bg, color: statusStyle.color }}>{statusStyle.label}</span>
                    </div>

                    {/* Feature badges */}
                    <div className="flex flex-wrap gap-1 mb-2">
                      {l.collectBillingAddress && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "#e8f5e9", color: "#2e7d32" }}>📋 Adresse</span>}
                      {l.showShareButton && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "#e3f2fd", color: "#1565c0" }}>🔗 Partage</span>}
                      {l.notificationEmail && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "#fce4ec", color: "#ad1457" }}>✉ Email</span>}
                      {l.confirmationMessage && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "#fff8e1", color: "#e65100" }}>💬 Message</span>}
                      {link.paymentLimit && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "#f3e5f5", color: "#6a1b9a" }}>🔢 {link.paymentCount}/{link.paymentLimit}</span>}
                      {link.expiresAt && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "#e8eaf6", color: "#283593" }}>⏱ Expiration</span>}
                    </div>

                    <div className="flex items-center gap-1 rounded-xl px-3 py-1.5 mb-2" style={{ background: "#f9fafb", border: "1px solid #e2e8f0" }}>
                      <span className="text-xs truncate flex-1 font-mono" style={{ color: "#666" }}>{url}</span>
                      <button className="p-1 rounded" onClick={() => copyLink(link.uniqueId)} style={{ color: "#888" }} data-testid={`button-copy-link-${link.id}`}><Copy className="w-3 h-3" /></button>
                      <button className="p-1 rounded" onClick={() => window.open(url, "_blank")} style={{ color: "#888" }} data-testid={`button-open-link-${link.id}`}><ExternalLink className="w-3 h-3" /></button>
                      <button className="p-1 rounded" onClick={() => shareLink(link.uniqueId)} style={{ color: "#888" }} data-testid={`button-share-link-${link.id}`}><Share2 className="w-3 h-3" /></button>
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs" style={{ color: "#888" }}>
                      <span><BarChart3 className="w-3 h-3 inline mr-0.5" />{link.paymentCount} {t("payments")}</span>
                      <span style={{ color: "#00b050", fontWeight: 600 }}>{link.totalRevenue.toLocaleString()} F</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-2 shrink-0">
                    <Switch checked={link.active} onCheckedChange={(checked) => updateMutation.mutate({ id: link.id, data: { active: checked } })} data-testid={`switch-link-active-${link.id}`} />
                    <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#f0f4ff", border: "1px solid #c5cae9" }} onClick={() => openEdit(link)} data-testid={`button-edit-link-${link.id}`}>
                      <Edit3 className="w-3 h-3" style={{ color: "#3949ab" }} />
                    </button>
                    <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#fff0f0", border: "1px solid #ffcdd2" }} onClick={() => deleteMutation.mutate(link.id)} data-testid={`button-delete-link-${link.id}`}>
                      <Trash2 className="w-3 h-3" style={{ color: "#c62828" }} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
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

const NAV_ITEMS: { key: MerchantTab; img: string; label: string }[] = [
  { key: "overview",      img: icnOverview,      label: "overview" },
  { key: "transactions",  img: icnTransactions,  label: "transactions" },
  { key: "virements",     img: icnVirements,     label: "virements" },
  { key: "reversements",  img: icnReversements,  label: "reversements" },
  { key: "paymentlinks",  img: icnPaymentLinks,  label: "paymentlinks" },
  { key: "crypto",        img: icnCrypto,        label: "crypto" },
  { key: "sdk",           img: icnSdk,           label: "sdk" },
  { key: "apikeys",       img: icnApikeys,       label: "apikeys" },
  { key: "webhook",       img: icnWebhook,       label: "webhook" },
  { key: "settings",      img: icnSettings,      label: "settings" },
];

function NavItem({
  img, label, active, collapsed, onClick, testId
}: {
  img: string; label: string; active: boolean;
  collapsed: boolean; onClick: () => void; testId: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className="w-full flex items-center gap-3 rounded-xl transition-all duration-150 text-left"
      style={{
        padding: collapsed ? "9px" : "8px 10px",
        justifyContent: collapsed ? "center" : undefined,
        background: active ? "#00b050" : "transparent",
      }}
      title={collapsed ? label : undefined}
    >
      <div
        className="flex items-center justify-center rounded-xl shrink-0"
        style={{
          width: 36, height: 36,
          background: active ? "rgba(255,255,255,0.2)" : "#f2f3f5",
        }}
      >
        <img src={img} alt={label} className="w-5 h-5 object-contain" style={{ filter: active ? "brightness(10)" : "none" }} />
      </div>
      {!collapsed && (
        <span className="text-sm font-semibold truncate" style={{ color: active ? "#fff" : "#1a1a1a" }}>
          {label}
        </span>
      )}
      {!collapsed && active && (
        <div className="ml-auto w-1.5 h-5 rounded-full shrink-0" style={{ background: "rgba(255,255,255,0.6)" }} />
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

  const navLabel = (key: MerchantTab) => {
    if (key === "virements") return t("transfers");
    if (key === "reversements") return t("withdrawals");
    if (key === "paymentlinks") return t("paymentlinks");
    if (key === "apikeys") return t("apikeys");
    if (key === "crypto") return "Crypto";
    return t(key);
  };

  return (
    <div className="flex flex-col h-full select-none" style={{ background: "#fff" }}>

      {/* ── Brand hero with background image ── */}
      <div
        className="relative overflow-hidden shrink-0"
        style={{ height: collapsed ? 72 : 120 }}
      >
        <img
          src={imgSidebarBg}
          alt="brand"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: "brightness(0.45)" }}
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 100%)" }} />
        <div className={`relative z-10 flex flex-col ${collapsed ? "items-center justify-center h-full" : "justify-end px-4 pb-4 h-full"}`}>
          {collapsed ? (
            <span className="text-white font-black text-lg tracking-tight">R</span>
          ) : (
            <>
              <p className="text-white font-black text-xl tracking-tight leading-tight drop-shadow-md">RobotPay</p>
              <p className="text-xs mt-0.5 truncate font-medium" style={{ color: "rgba(255,255,255,0.65)", maxWidth: 160 }}>{user?.name}</p>
            </>
          )}
        </div>
      </div>

      {/* ── Nav items ── */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {visibleNavItems.map(item => (
          <NavItem
            key={item.key}
            img={item.img}
            label={navLabel(item.key)}
            active={activeTab === item.key}
            collapsed={collapsed}
            onClick={() => onTabChange(item.key)}
            testId={`merchant-nav-${item.key}`}
          />
        ))}
      </div>

      {/* ── Logout ── */}
      <div className="p-2 shrink-0" style={{ borderTop: "1px solid #f0f0f0" }}>
        <button
          onClick={onLogout}
          data-testid="button-merchant-logout"
          className="w-full flex items-center gap-3 rounded-xl transition-all duration-150"
          style={{
            padding: collapsed ? "9px" : "8px 10px",
            justifyContent: collapsed ? "center" : undefined,
          }}
          title={collapsed ? t("logout") : undefined}
        >
          <div className="flex items-center justify-center rounded-xl shrink-0" style={{ width: 36, height: 36, background: "#fff0f0" }}>
            <LogOut className="w-4 h-4" style={{ color: "#e53e3e" }} />
          </div>
          {!collapsed && <span className="text-sm font-semibold" style={{ color: "#e53e3e" }}>{t("logout")}</span>}
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
          background: "#fff",
          boxShadow: "2px 0 12px rgba(0,0,0,0.08)",
          borderRight: "1px solid #eef0f3",
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
        style={{ background: "#fff", boxShadow: "4px 0 24px rgba(0,0,0,0.15)", borderRight: "1px solid #eef0f3" }}
      >
        <div className="flex items-center justify-end px-3 pt-3 pb-1">
          <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg" style={{ color: "#888", background: "#f5f5f5" }}>
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
          className="flex items-center justify-between gap-2 px-4 shrink-0"
          style={{ background: "#3d5af1", height: 56, zIndex: 30, boxShadow: "0 2px 12px rgba(61,90,241,0.25)" }}
        >
          <div className="flex items-center gap-3">
            {/* Desktop sidebar toggle */}
            <button
              className="hidden md:flex w-9 h-9 rounded-xl items-center justify-center transition-colors hover:bg-white/15"
              style={{ color: "white" }}
              onClick={() => setSidebarCollapsed(c => !c)}
              data-testid="button-merchant-sidebar-toggle"
            >
              <Menu className="w-5 h-5" />
            </button>
            {/* Mobile hamburger */}
            <button
              className="flex md:hidden w-9 h-9 rounded-xl items-center justify-center transition-colors hover:bg-white/15"
              style={{ color: "white" }}
              onClick={() => setMobileOpen(o => !o)}
              data-testid="button-mobile-sidebar-toggle"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-base font-bold text-white tracking-wide">
              {activeTab === "overview" ? t("overview")
                : activeTab === "wallet" ? t("walletTitle")
                : activeTab === "analyse" ? t("analyseTitle")
                : activeTab === "transactions" ? t("transactions")
                : activeTab === "virements" ? t("transfers")
                : activeTab === "reversements" ? t("withdrawals")
                : activeTab === "paymentlinks" ? t("paymentlinks")
                : activeTab === "apikeys" ? t("apikeys")
                : activeTab === "crypto" ? "Crypto"
                : activeTab === "sdk" ? "SDK"
                : activeTab === "webhook" ? "Webhook"
                : activeTab === "settings" ? t("settings")
                : "WestPay"}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Language selector */}
            <LanguageDropdown />
            {/* Help / Info */}
            <button
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:bg-white/15"
              style={{ color: "white" }}
              onClick={() => window.open("/api-docs", "_blank")}
              data-testid="button-help"
              title="Documentation API"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            {/* Profile / Settings */}
            <button
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:bg-white/15"
              style={{ background: "rgba(255,255,255,0.18)", color: "white" }}
              onClick={() => handleTabChange("settings")}
              data-testid="button-profile"
              title="Paramètres"
            >
              <User className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* ── Main content ── */}
        {activeTab === "overview" ? (
          <main className="flex-1 overflow-hidden p-4 md:p-6">
            <OverviewPanel token={token} onTabChange={handleTabChange} />
          </main>
        ) : (
          <main className="flex-1 overflow-auto p-4 md:p-6">
            {activeTab === "wallet"        && <WalletPanel token={token} />}
            {activeTab === "analyse"       && <AnalysePanel token={token} />}
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
        )}
      </div>
    </div>
  );
}
