import { useState, useEffect, useMemo, useRef } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getAvatarUrl, getInitials, getAvatarColor } from "@/lib/avatar";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger
} from "@/components/ui/sidebar";
import {
  Users, ArrowRightLeft, Globe, Phone, Settings, LogOut, Plus,
  Trash2, Ban, CheckCircle, XCircle, Copy, Shield, Loader2, Download,
  MessageSquare, Key, DollarSign, Hash, Calendar, Search, Clock,
  RefreshCw, Lock, BookOpen, FileText, Webhook, Zap, ToggleLeft, ToggleRight, Link2,
  Link, BarChart3, TrendingUp, Eye, ToggleLeft as Toggle, ExternalLink, Filter,
  Check, ChevronsUpDown, ArrowUpRight, Edit3, Wallet, AlertTriangle, RotateCcw, Bitcoin,
  Monitor, EyeOff, KeyRound, Mail, GripVertical, ImagePlus, X, Upload, Smartphone,
  Bot, Send
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Merchant, MerchantCountry, Transaction, PhoneNumber, SmsLog, PaymentLink, WalletTransfer, Withdrawal, WithdrawalOperator } from "@shared/schema";

type AdminTab = "overview" | "analytics" | "merchants" | "paymentlinks" | "transactions" | "countries" | "numbers" | "sms" | "apikeys" | "omnipay" | "mbiyo" | "sendavapay" | "cryptoagg" | "cryptowithdrawals" | "virements" | "reversements" | "admins" | "settings" | "sdk" | "security" | "notifications" | "userbot" | "knowledge" | "actionlogs";

function useAdminFetch(url: string, key: (string | null | undefined)[], opts?: { staleTime?: number; refetchOnWindowFocus?: boolean }) {
  const { token, logout } = useAuth();
  const [, setLocation] = useLocation();
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        logout();
        setLocation("/admin-access-958425546648484886646634808526522886433");
        throw new Error("Session expiree");
      }
      if (!res.ok) throw new Error("Erreur de chargement");
      return res.json();
    },
    staleTime: opts?.staleTime ?? 30_000,
    refetchOnWindowFocus: opts?.refetchOnWindowFocus ?? false,
  });
}

function StatCard({ title, value, icon: Icon, subtitle, accent }: { title: string; value: string | number; icon: any; subtitle?: string; accent?: "green" | "blue" | "orange" | "purple" }) {
  const accentClasses: Record<string, string> = {
    green: "bg-green-500/10 text-green-600 dark:text-green-400",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  };
  const iconClass = accent ? accentClasses[accent] : "bg-primary/10 text-primary";
  return (
    <Card className="shadow-card hover:shadow-card-hover transition-shadow duration-200 overflow-hidden relative">
      <div className="absolute inset-y-0 left-0 w-1" style={{ background: accent === "green" ? "#00b050" : accent === "blue" ? "#2563eb" : accent === "orange" ? "#f97316" : accent === "purple" ? "#9333ea" : "#00b050" }} />
      <CardContent className="p-4 pl-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground truncate uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold text-foreground mt-1 leading-tight" data-testid={`stat-${title.toLowerCase().replace(/\s/g, '-')}`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const BOT_LANGUAGES = [
  { value: "fr", label: "🇫🇷 Français" },
  { value: "en", label: "🇬🇧 English" },
  { value: "zh", label: "🇨🇳 中文 (Chinois)" },
  { value: "de", label: "🇩🇪 Deutsch (Allemand)" },
];

function TelegramDialog({ merchant, token }: { merchant: Merchant; token: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [mode, setMode] = useState<"choose" | "dm" | "group">("choose");
  const [selectedLang, setSelectedLang] = useState<string>((merchant as any).telegramBotLanguage || "fr");
  const [savingLang, setSavingLang] = useState(false);

  const isLinked = !!(merchant as any).telegramChatId;

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/merchant/${merchant.id}/telegram/generate-code`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedCode(data.code);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/merchant/${merchant.id}/telegram/revoke`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erreur");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      setGeneratedCode(null);
      setMode("choose");
      toast({ title: "Accès Telegram révoqué" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const saveLang = async (lang: string) => {
    setSavingLang(true);
    try {
      const res = await fetch(`/api/admin/merchant/${merchant.id}/telegram/language`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ language: lang }),
      });
      if (!res.ok) throw new Error("Erreur");
      setSelectedLang(lang);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      toast({ title: "Langue du bot mise à jour", description: BOT_LANGUAGES.find(l => l.value === lang)?.label });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setSavingLang(false);
    }
  };

  const handleGenerate = (selectedMode: "dm" | "group") => {
    setMode(selectedMode);
    generateMutation.mutate();
  };

  const handleClose = (v: boolean) => {
    setOpen(v);
    if (!v) { setGeneratedCode(null); setMode("choose"); }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Notifications Telegram" data-testid={`button-telegram-${merchant.id}`}>
          <MessageSquare className={`w-4 h-4 ${isLinked ? "text-blue-500" : "text-muted-foreground"}`} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Telegram — {merchant.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2">
            <Badge variant={isLinked ? "secondary" : "outline"}>
              {isLinked ? "✅ Notifications actives" : "⬜ Non configuré"}
            </Badge>
          </div>

          <div className="space-y-2">
            <Label>Langue des notifications bot</Label>
            <div className="flex gap-2">
              <Select
                value={selectedLang}
                onValueChange={(v) => setSelectedLang(v)}
              >
                <SelectTrigger className="flex-1" data-testid={`select-bot-lang-${merchant.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOT_LANGUAGES.map(l => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => saveLang(selectedLang)}
                disabled={savingLang || selectedLang === ((merchant as any).telegramBotLanguage || "fr")}
                data-testid={`button-save-bot-lang-${merchant.id}`}
              >
                {savingLang ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sauvegarder"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Le bot enverra toutes ses notifications dans cette langue.
            </p>
          </div>

          {isLinked ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Ce marchand reçoit ses notifications de paiement sur Telegram (DM ou groupe dédié).
              </p>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => { if (confirm("Supprimer la configuration Telegram de ce marchand ?")) revokeMutation.mutate(); }}
                disabled={revokeMutation.isPending}
                data-testid={`button-revoke-telegram-${merchant.id}`}
              >
                {revokeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Supprimer la configuration
              </Button>
            </div>
          ) : generatedCode ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Code d'activation (valide 24h)</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-primary/10 text-primary font-bold rounded p-3 text-center text-xl tracking-widest" data-testid={`text-telegram-code-${merchant.id}`}>
                    {generatedCode}
                  </code>
                  <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(generatedCode); toast({ title: "Code copié !" }); }} data-testid={`button-copy-code-${merchant.id}`}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <Separator />
              {mode === "dm" ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">Le marchand doit envoyer au bot :</p>
                  <code className="block bg-muted rounded p-2 text-sm text-center">/start {generatedCode}</code>
                  <p className="text-xs text-muted-foreground">Le marchand ouvre une conversation avec le bot et envoie cette commande.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-medium">Dans le groupe dédié, envoyer :</p>
                  <code className="block bg-muted rounded p-2 text-sm text-center">/setmarchand {generatedCode}</code>
                  <p className="text-xs text-muted-foreground">Ajoutez le bot au groupe du marchand, puis envoyez cette commande dans ce groupe.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground font-medium">Comment le marchand va-t-il recevoir les notifications ?</p>
              <div className="grid grid-cols-1 gap-2">
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={() => handleGenerate("dm")}
                  disabled={generateMutation.isPending}
                  data-testid={`button-generate-dm-${merchant.id}`}
                >
                  <MessageSquare className="w-5 h-5 text-blue-500 shrink-0" />
                  <div className="text-left">
                    <div className="font-medium text-sm">Message personnel (DM)</div>
                    <div className="text-xs text-muted-foreground">Le marchand configure lui-même le bot</div>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={() => handleGenerate("group")}
                  disabled={generateMutation.isPending}
                  data-testid={`button-generate-group-${merchant.id}`}
                >
                  <Users className="w-5 h-5 text-green-500 shrink-0" />
                  <div className="text-left">
                    <div className="font-medium text-sm">Groupe dédié (configuré par admin)</div>
                    <div className="text-xs text-muted-foreground">Vous créez un groupe et liez le bot pour lui</div>
                  </div>
                </Button>
              </div>
              {generateMutation.isPending && <div className="flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OverviewPanel() {
  const { toast } = useToast();
  const { token } = useAuth();
  const { data: stats, refetch: refetchStats, isFetching: isFetchingStats } = useAdminFetch("/api/admin/stats", ["/api/admin/stats"], { staleTime: 60_000, refetchOnWindowFocus: true });
  const { data: transactions = [] } = useAdminFetch("/api/admin/transactions", ["/api/admin/transactions"]);
  const { data: merchants = [] } = useAdminFetch("/api/admin/merchants", ["/api/admin/merchants"]);
  const { data: links = [] } = useAdminFetch("/api/admin/payment-links", ["/api/admin/payment-links"]);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showResetFeesConfirm, setShowResetFeesConfirm] = useState(false);
  const [isResettingFees, setIsResettingFees] = useState(false);
  const [isDeletingBaseline, setIsDeletingBaseline] = useState(false);

  const recentTx = (transactions as Transaction[]).slice(0, 5);
  const recentLinks = (links as any[]).slice(0, 5);
  const recentMerchants = (merchants as any[]).slice(0, 5);

  const fmtF = (n: number) => `${n.toLocaleString("fr-FR")} F`;

  const handleDeleteBaseline = async () => {
    setIsDeletingBaseline(true);
    try {
      const res = await fetch("/api/admin/stats-baseline", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Échec");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "✅ Baseline supprimée", description: "Les vraies statistiques sont maintenant affichées." });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setIsDeletingBaseline(false);
    }
  };

  const handleResetStats = async () => {
    setIsResetting(true);
    try {
      const res = await fetch("/api/admin/reset-stats", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Échec de la réinitialisation");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Statistiques réinitialisées", description: "Les compteurs ont été remis à zéro." });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setIsResetting(false);
      setShowResetConfirm(false);
    }
  };

  const handleResetFees = async () => {
    setIsResettingFees(true);
    try {
      const res = await fetch("/api/admin/reset-fees", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Échec de la réinitialisation des frais");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Frais réinitialisés", description: "Le compteur de bénéfice total a été remis à zéro." });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setIsResettingFees(false);
      setShowResetFeesConfirm(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Solde total de la plateforme */}
      <div className="rounded-lg border bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/50">
            <Wallet className="w-5 h-5 text-green-700 dark:text-green-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Solde total de la plateforme</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-400" data-testid="stat-platform-balance">
              {(stats?.platformBalance || 0).toLocaleString("fr-FR")} <span className="text-base font-semibold">F CFA</span>
            </p>
            <p className="text-xs text-muted-foreground">Cumul de tous les wallets marchands actifs</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => refetchStats()}
              disabled={isFetchingStats}
              data-testid="button-refresh-stats"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetchingStats ? "animate-spin" : ""}`} /> Actualiser
            </Button>
            {!showResetConfirm && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400"
                onClick={() => setShowResetConfirm(true)}
                data-testid="button-reset-stats"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser les stats
              </Button>
            )}
          </div>
          {showResetConfirm && (
            <div className="flex flex-col items-end gap-1.5 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 rounded-md p-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-orange-700 dark:text-orange-400">
                <AlertTriangle className="w-3.5 h-3.5" /> Confirmer la réinitialisation ?
              </div>
              <p className="text-xs text-muted-foreground max-w-[200px] text-right">Les compteurs (transactions, volumes, commissions) seront remis à zéro. Pas le nombre de marchands.</p>
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setShowResetConfirm(false)}>Annuler</Button>
                <Button
                  size="sm"
                  className="text-xs h-7 bg-orange-600 hover:bg-orange-700 text-white"
                  onClick={handleResetStats}
                  disabled={isResetting}
                  data-testid="button-confirm-reset-stats"
                >
                  {isResetting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} Confirmer
                </Button>
              </div>
            </div>
          )}
          {stats?.lastStatsReset && (
            <div className="flex flex-col items-end gap-1">
              <p className="text-xs text-muted-foreground">
                Dernier reset : {new Date(stats.lastStatsReset).toLocaleDateString("fr-FR")}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
                onClick={handleDeleteBaseline}
                disabled={isDeletingBaseline}
                data-testid="button-delete-baseline"
              >
                {isDeletingBaseline ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Restaurer les vraies valeurs
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Statistiques principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Marchands" value={stats?.merchantCount || 0} icon={Users} accent="blue" />
        <StatCard title="Liens de paiement" value={stats?.paymentLinkCount || 0} icon={Link} accent="purple" />
        <StatCard title="Transactions" value={stats?.transactionCount || 0} icon={Hash} accent="green" />
        <StatCard title="Volume total" value={fmtF(stats?.totalVolume || 0)} icon={DollarSign} accent="green" />
        <StatCard title="Paiements auj." value={stats?.todayPayments || 0} icon={TrendingUp} accent="orange" />
      </div>

      {/* Bénéfice net WestPay */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Bénéfice net WestPay</p>
        <p className="text-xs text-muted-foreground mb-3">Après déduction des frais fournisseur (OmniPay / Mbiyo)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Bénéfice total — avec bouton de réinitialisation des frais */}
          <Card className="shadow-card hover:shadow-card-hover transition-shadow duration-200 overflow-hidden relative">
            <div className="absolute inset-y-0 left-0 w-1" style={{ background: "#00b050" }} />
            <CardContent className="p-4 pl-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bénéfice total</p>
                  <p className="text-2xl font-bold text-foreground mt-1 leading-tight" data-testid="stat-bénéfice-total">{fmtF(stats?.commissionTotal || 0)}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-green-500/10 text-green-600 dark:text-green-400">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  {!showResetFeesConfirm ? (
                    <button
                      onClick={() => setShowResetFeesConfirm(true)}
                      className="text-xs text-orange-500 hover:text-orange-600 flex items-center gap-1 transition-colors"
                      data-testid="button-reset-fees"
                      title="Réinitialiser uniquement les frais"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset frais
                    </button>
                  ) : (
                    <div className="flex gap-1">
                      <button
                        onClick={() => setShowResetFeesConfirm(false)}
                        className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border transition-colors"
                      >Non</button>
                      <button
                        onClick={handleResetFees}
                        disabled={isResettingFees}
                        className="text-xs text-white bg-orange-500 hover:bg-orange-600 px-1.5 py-0.5 rounded transition-colors flex items-center gap-0.5"
                        data-testid="button-confirm-reset-fees"
                      >
                        {isResettingFees ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} Oui
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          <StatCard title="Bénéfice du jour" value={fmtF(stats?.commissionToday || 0)} icon={TrendingUp} accent="orange" />
          <StatCard title="Bénéfice ce mois" value={fmtF(stats?.commissionThisMonth || 0)} icon={BarChart3} accent="blue" />
          <StatCard title="Mois précédent" value={fmtF(stats?.commissionPrevMonth || 0)} icon={BarChart3} accent="purple" />
        </div>
      </div>

      {/* Paiements par canal & Retraits */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Canaux de paiement & Retraits</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30"><Hash className="w-4 h-4 text-blue-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Paiements par API</p>
                <p className="text-lg font-bold">{(stats?.apiPaymentsCount || 0).toLocaleString("fr-FR")}</p>
                <p className="text-xs text-muted-foreground">{fmtF(stats?.apiPaymentsTotal || 0)}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30"><Link className="w-4 h-4 text-purple-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Paiements par lien</p>
                <p className="text-lg font-bold">{(stats?.linkPaymentsCount || 0).toLocaleString("fr-FR")}</p>
                <p className="text-xs text-muted-foreground">{fmtF(stats?.linkPaymentsTotal || 0)}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30"><Download className="w-4 h-4 text-green-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Retraits effectués</p>
                <p className="text-lg font-bold">{(stats?.withdrawalsCount || 0).toLocaleString("fr-FR")}</p>
                <p className="text-xs text-muted-foreground">{fmtF(stats?.withdrawalsTotal || 0)}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><ArrowRightLeft className="w-4 h-4" />Transactions récentes</CardTitle></CardHeader>
          <CardContent className="p-0">
            {recentTx.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">Aucune transaction</p> : (
              <div className="divide-y">
                {recentTx.map((tx: Transaction) => (
                  <div key={tx.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{tx.txId}</p>
                      <p className="text-xs text-muted-foreground">{tx.country} • {tx.payerNumber || "?"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold">{tx.amount.toLocaleString()} F</p>
                      <Badge variant={tx.status === "confirmed" ? "default" : "secondary"} className="text-xs px-1">{tx.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Link className="w-4 h-4" />Derniers liens</CardTitle></CardHeader>
          <CardContent className="p-0">
            {recentLinks.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">Aucun lien</p> : (
              <div className="divide-y">
                {recentLinks.map((link: any) => (
                  <div key={link.id} className="px-4 py-2.5">
                    <p className="text-xs font-medium truncate">{link.name}</p>
                    <p className="text-xs text-muted-foreground">{link.merchantName} • {link.amountType === "fixed" ? `${link.amount?.toLocaleString()} F` : "Libre"}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground">{link.paymentCount} paiements</span>
                      <Badge variant={link.active ? "default" : "secondary"} className="text-xs px-1">{link.active ? "Actif" : "Inactif"}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4" />Marchands récents</CardTitle></CardHeader>
          <CardContent className="p-0">
            {recentMerchants.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">Aucun marchand</p> : (
              <div className="divide-y">
                {recentMerchants.map((m: any) => (
                  <div key={m.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                    </div>
                    <Badge variant={m.suspended ? "destructive" : "secondary"} className="text-xs px-1">{m.suspended ? "Suspendu" : "Actif"}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MerchantDetailsDialog({ merchantId, onClose }: { merchantId: number; onClose: () => void }) {
  const { token } = useAuth();
  const { toast } = useToast();

  const [subTab, setSubTab] = useState<"profile" | "wallets" | "webhook">("profile");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/merchant", merchantId, "details"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/merchant/${merchantId}/details`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Erreur chargement");
      return res.json();
    },
    enabled: !!merchantId,
  });

  const { data: wallets = [], refetch: refetchWallets } = useQuery<MerchantCountry[]>({
    queryKey: ["/api/admin/merchant", merchantId, "wallets"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/merchant/${merchantId}/wallets`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: !!merchantId,
  });

  const merchant = data?.merchant;

  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [profileWebsite, setProfileWebsite] = useState("");
  const [profileSlug, setProfileSlug] = useState("");
  const [slugError, setSlugError] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [balanceEdits, setBalanceEdits] = useState<Record<number, string>>({});

  useEffect(() => {
    if (merchant) {
      setProfileName(merchant.name || "");
      setProfileEmail(merchant.email || "");
      setProfileWebsite(merchant.website || "");
      setProfileSlug(merchant.slug || "");
      setSlugError("");
      setWebhookUrl(merchant.webhookUrl || "");
    }
  }, [merchant]);

  useEffect(() => {
    if (wallets.length) {
      const m: Record<number, string> = {};
      wallets.forEach((w: MerchantCountry) => { m[w.id] = String(w.balance); });
      setBalanceEdits(m);
    }
  }, [wallets]);

  const profileMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/merchant/${merchantId}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: profileName, email: profileEmail, password: profilePassword || undefined, website: profileWebsite }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      refetch();
      setProfilePassword("");
      toast({ title: "Profil mis à jour" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const slugMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/merchants/${merchantId}/slug`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slug: profileSlug }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      refetch();
      setProfileSlug(data.slug);
      setSlugError("");
      toast({ title: "Slug mis à jour" });
    },
    onError: (err: any) => {
      setSlugError(err.message);
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const webhookMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/merchant/${merchantId}/webhook`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ webhookUrl }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      refetch();
      toast({ title: "Webhook mis à jour" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const saveBalance = async (walletId: number) => {
    const balance = parseInt(balanceEdits[walletId] || "0");
    if (isNaN(balance) || balance < 0) { toast({ title: "Solde invalide", variant: "destructive" }); return; }
    const res = await fetch("/api/admin/update-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: walletId, balance }),
    });
    if (res.ok) { refetchWallets(); toast({ title: "Solde mis à jour" }); }
    else { const d = await res.json(); toast({ title: "Erreur", description: d.message, variant: "destructive" }); }
  };

  const toggleWalletActive = async (walletId: number, merchantId: number, active: boolean) => {
    const res = await fetch(`/api/admin/merchant/${merchantId}/country/${walletId}/active`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ active }),
    });
    if (res.ok) { refetchWallets(); toast({ title: active ? "Wallet activé" : "Wallet désactivé" }); }
    else toast({ title: "Erreur", variant: "destructive" });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {isLoading ? "Chargement..." : merchant?.name}
            {merchant && <Badge variant={merchant.suspended ? "destructive" : "secondary"} className="text-xs">{merchant.suspended ? "Suspendu" : "Actif"}</Badge>}
            {merchant?.feeExempt && <Badge className="text-xs bg-emerald-600 text-white">Zéro frais</Badge>}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div> : (
          <div className="space-y-4">
            <div className="flex gap-1 border-b">
              {(["profile", "wallets", "webhook"] as const).map((tab) => (
                <button key={tab} onClick={() => setSubTab(tab)}
                  className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${subTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {tab === "profile" ? "Profil" : tab === "wallets" ? "Wallets" : "Webhook"}
                </button>
              ))}
            </div>

            {subTab === "profile" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-muted rounded px-3 py-2"><p className="text-muted-foreground">Slug actuel</p><p className="font-mono font-medium">/{merchant?.slug}</p></div>
                  <div className="bg-muted rounded px-3 py-2"><p className="text-muted-foreground">Volume total</p><p className="font-semibold">{(data?.totalRevenue || 0).toLocaleString()} F CFA</p></div>
                </div>

                <div className="rounded-lg border p-3 space-y-2">
                  <Label className="text-sm font-semibold">Modifier le slug</Label>
                  <p className="text-xs text-muted-foreground">Le slug est utilisé dans les liens de paiement. Seuls les lettres minuscules, chiffres et tirets sont acceptés.</p>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Input
                        value={profileSlug}
                        onChange={e => { setProfileSlug(e.target.value); setSlugError(""); }}
                        placeholder="ex: mon-marchand"
                        className={slugError ? "border-destructive" : ""}
                        data-testid="input-edit-merchant-slug"
                      />
                      {slugError && <p className="text-xs text-destructive">{slugError}</p>}
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => slugMutation.mutate()}
                      disabled={slugMutation.isPending || profileSlug === merchant?.slug}
                      data-testid="button-save-merchant-slug"
                    >
                      {slugMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Modifier"}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Nom du marchand</Label>
                  <Input value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Nom" data-testid="input-edit-merchant-name" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={profileEmail} onChange={e => setProfileEmail(e.target.value)} placeholder="Email" data-testid="input-edit-merchant-email" />
                </div>
                <div className="space-y-2">
                  <Label>Site web <span className="text-muted-foreground text-xs font-normal">(optionnel)</span></Label>
                  <Input type="url" value={profileWebsite} onChange={e => setProfileWebsite(e.target.value)} placeholder="https://example.com" data-testid="input-edit-merchant-website" />
                </div>
                <div className="space-y-2">
                  <Label>Nouveau mot de passe <span className="text-muted-foreground text-xs font-normal">(laisser vide pour ne pas changer)</span></Label>
                  <Input type="password" value={profilePassword} onChange={e => setProfilePassword(e.target.value)} placeholder="Nouveau mot de passe" data-testid="input-edit-merchant-password" />
                </div>
                <Button onClick={() => profileMutation.mutate()} disabled={profileMutation.isPending} data-testid="button-save-merchant-profile">
                  {profileMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Enregistrer les modifications
                </Button>

                <div className="flex items-center justify-between rounded-lg border p-3 bg-emerald-50 dark:bg-emerald-950/20">
                  <div>
                    <p className="text-sm font-medium">Mode sans frais</p>
                    <p className="text-xs text-muted-foreground">Exempte ce marchand de tous les frais (payin 5.5%, payout 4.5%, virements)</p>
                  </div>
                  <Switch
                    checked={!!merchant?.feeExempt}
                    onCheckedChange={async (val) => {
                      const res = await fetch(`/api/admin/merchants/${merchantId}/fee-exempt`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ feeExempt: val }),
                      });
                      if (res.ok) {
                        refetch();
                        queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
                        toast({ title: val ? "Mode sans frais activé" : "Mode sans frais désactivé" });
                      } else {
                        toast({ title: "Erreur", variant: "destructive" });
                      }
                    }}
                    data-testid="switch-fee-exempt"
                  />
                </div>
              </div>
            )}

            {subTab === "wallets" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Modifier le solde ou activer/désactiver les wallets par pays. Les changements sont immédiats.</p>
                {wallets.length === 0 ? (
                  <p className="text-sm text-center text-muted-foreground py-4">Aucun wallet configuré</p>
                ) : wallets.map((w: MerchantCountry) => (
                  <div key={w.id} className="p-3 rounded border bg-muted/20 space-y-2" data-testid={`wallet-admin-row-${w.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{w.country}</span>
                        <Badge variant={w.active ? "default" : "secondary"} className={`text-xs ${w.active ? "bg-emerald-600 text-white" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{w.active ? "Actif" : "Désactivé"}</Badge>
                      </div>
                      {w.active ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                          onClick={() => toggleWalletActive(w.id, merchantId, false)}
                          data-testid={`button-deactivate-wallet-${w.id}`}
                        >
                          Désactiver
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-emerald-300 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                          onClick={() => toggleWalletActive(w.id, merchantId, true)}
                          data-testid={`button-activate-wallet-${w.id}`}
                        >
                          Activer
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 relative">
                        <Input
                          type="number"
                          value={balanceEdits[w.id] ?? String(w.balance)}
                          onChange={e => setBalanceEdits(prev => ({ ...prev, [w.id]: e.target.value }))}
                          className="pr-12 text-sm"
                          min="0"
                          data-testid={`input-wallet-balance-${w.id}`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">FCFA</span>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => saveBalance(w.id)} data-testid={`button-save-balance-${w.id}`}>
                        Enregistrer
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {subTab === "webhook" && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">L'URL de webhook sera mise à jour pour ce marchand. Il recevra des notifications POST à chaque paiement confirmé.</p>
                <div className="space-y-2">
                  <Label>URL de webhook / callback</Label>
                  <Input
                    value={webhookUrl}
                    onChange={e => setWebhookUrl(e.target.value)}
                    placeholder="https://votresite.com/webhook"
                    data-testid="input-admin-webhook-url"
                  />
                  <p className="text-xs text-muted-foreground">Laisser vide pour désactiver le webhook.</p>
                </div>
                {merchant?.webhookUrl && (
                  <div className="p-3 rounded bg-muted text-xs space-y-1">
                    <p className="text-muted-foreground font-medium">URL actuelle :</p>
                    <p className="font-mono break-all">{merchant.webhookUrl}</p>
                    {merchant.webhookSecret && (
                      <>
                        <p className="text-muted-foreground font-medium mt-2">Secret de signature :</p>
                        <div className="flex items-center gap-2">
                          <p className="font-mono break-all">{merchant.webhookSecret}</p>
                          <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0"
                            onClick={() => { navigator.clipboard.writeText(merchant.webhookSecret); toast({ title: "Secret copié" }); }}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <Button onClick={() => webhookMutation.mutate()} disabled={webhookMutation.isPending} data-testid="button-save-admin-webhook">
                  {webhookMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Mettre à jour le webhook
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AdminPaymentLinksPanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const baseUrl = "https://west-pay-aggregator-1--beryowone.replit.app";
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterMerchant, setFilterMerchant] = useState("");

  const { data: links = [], isLoading } = useAdminFetch("/api/admin/payment-links", ["/api/admin/payment-links"]);

  const toggleMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/payment-links/${id}/toggle`, { method: "PUT", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-links"] }); toast({ title: "Lien mis à jour" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/payment-links/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Erreur");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-links"] }); queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] }); toast({ title: "Lien supprimé" }); },
  });

  const copyLink = (uniqueId: string) => {
    navigator.clipboard.writeText(`${baseUrl}/link/${uniqueId}`);
    toast({ title: "Lien copié !" });
  };

  const getLinkStatus = (link: any) => {
    if (!link.active) return "disabled";
    if (link.expiresAt && new Date() > new Date(link.expiresAt)) return "expired";
    if (link.paymentLimit && link.paymentCount >= link.paymentLimit) return "expired";
    return "active";
  };

  const filtered = (links as any[]).filter((link) => {
    const status = getLinkStatus(link);
    const matchSearch = link.name.toLowerCase().includes(search.toLowerCase()) || link.merchantName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || status === filterStatus;
    const matchType = filterType === "all" || link.amountType === filterType;
    const matchMerchant = !filterMerchant || link.merchantName.toLowerCase().includes(filterMerchant.toLowerCase());
    return matchSearch && matchStatus && matchType && matchMerchant;
  });

  const totalPayments = (links as any[]).reduce((s: number, l: any) => s + l.paymentCount, 0);
  const totalRevenue = (links as any[]).reduce((s: number, l: any) => s + l.totalRevenue, 0);

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Liens de Paiement</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{(links as any[]).length} liens</span>
          <span>•</span>
          <span>{totalPayments} paiements</span>
          <span>•</span>
          <span>{totalRevenue.toLocaleString()} F générés</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-10" placeholder="Rechercher par nom ou marchand..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-links" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-36" data-testid="select-filter-status"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="active">Actif</SelectItem>
            <SelectItem value="disabled">Désactivé</SelectItem>
            <SelectItem value="expired">Expiré</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full sm:w-36" data-testid="select-filter-type"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous types</SelectItem>
            <SelectItem value="fixed">Fixe</SelectItem>
            <SelectItem value="flexible">Libre</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground text-sm"><Link className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Aucun lien trouvé</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((link: any) => {
            const status = getLinkStatus(link);
            return (
              <Card key={link.id} data-testid={`card-admin-link-${link.id}`} className={status !== "active" ? "opacity-70" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm" data-testid={`text-admin-link-name-${link.id}`}>{link.name}</span>
                        <Badge variant="outline" className="text-xs">{link.merchantName}</Badge>
                        {status === "active" && <Badge variant="default" className="text-xs">Actif</Badge>}
                        {status === "disabled" && <Badge variant="secondary" className="text-xs">Désactivé</Badge>}
                        {status === "expired" && <Badge variant="destructive" className="text-xs">Expiré</Badge>}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                        <span>{link.amountType === "fixed" ? `${link.amount?.toLocaleString()} F CFA (fixe)` : "Montant libre"}</span>
                        <span><BarChart3 className="w-3 h-3 inline mr-0.5" />{link.paymentCount} paiements</span>
                        <span>{link.totalRevenue.toLocaleString()} F générés</span>
                        {link.expiresAt && <span>Expire: {new Date(link.expiresAt).toLocaleDateString("fr-FR")}</span>}
                        {link.paymentLimit && <span>Limite: {link.paymentCount}/{link.paymentLimit}</span>}
                      </div>
                      <div className="flex items-center gap-1 mt-2 bg-muted rounded px-2 py-1 max-w-sm">
                        <span className="text-xs truncate text-muted-foreground flex-1">{baseUrl}/link/{link.uniqueId}</span>
                        <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0" onClick={() => copyLink(link.uniqueId)} data-testid={`button-admin-copy-link-${link.id}`}><Copy className="w-3 h-3" /></Button>
                        <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0" onClick={() => window.open(`${baseUrl}/link/${link.uniqueId}`, "_blank")}><ExternalLink className="w-3 h-3" /></Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch checked={link.active} onCheckedChange={() => toggleMutation.mutate(link.id)} data-testid={`switch-admin-link-${link.id}`} />
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => { if (confirm("Supprimer ce lien ?")) deleteMutation.mutate(link.id); }} data-testid={`button-admin-delete-link-${link.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MerchantsPanel() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [websiteFilter, setWebsiteFilter] = useState("");
  const [selectedMerchantId, setSelectedMerchantId] = useState<number | null>(null);

  const { data: merchants = [], isLoading } = useAdminFetch("/api/admin/merchants", ["/api/admin/merchants"]);

  const suspendMutation = useMutation({
    mutationFn: async ({ id, suspended }: { id: number; suspended: boolean }) => {
      const res = await fetch("/api/admin/update-merchant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, suspended }),
      });
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      toast({ title: "Marchand mis a jour" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/delete-merchant/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erreur");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      toast({ title: "Marchand supprime" });
    },
  });

  const filtered = (merchants as any[]).filter((m) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = !term || m.name.toLowerCase().includes(term) || m.email.toLowerCase().includes(term) || (m.website || "").toLowerCase().includes(term) || m.slug.toLowerCase().includes(term);
    const matchesWebsite = !websiteFilter || (m.website || "").toLowerCase().includes(websiteFilter.toLowerCase());
    return matchesSearch && matchesWebsite;
  });

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-4">
      {selectedMerchantId && <MerchantDetailsDialog merchantId={selectedMerchantId} onClose={() => setSelectedMerchantId(null)} />}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-foreground">Marchands</h2>
        <Button
          onClick={() => setLocation("/admin-access-958425546648484886646634808526522886433/create-merchant")}
          data-testid="button-create-merchant"
        >
          <Plus className="w-4 h-4 mr-2" />Nouveau marchand
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Rechercher par nom, email, slug..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-search-merchants"
          />
        </div>
        <div className="relative flex-1 min-w-40">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Filtrer par site web..."
            value={websiteFilter}
            onChange={(e) => setWebsiteFilter(e.target.value)}
            data-testid="input-filter-website"
          />
        </div>
      </div>
      {(searchTerm || websiteFilter) && (
        <p className="text-xs text-muted-foreground">{filtered.length} marchand{filtered.length !== 1 ? "s" : ""} trouvé{filtered.length !== 1 ? "s" : ""}</p>
      )}

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">Aucun marchand trouve</CardContent></Card>
        ) : (
          filtered.map((merchant: any) => (
            <Card key={merchant.id} data-testid={`card-merchant-${merchant.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 shadow-sm" style={{ border: "1.5px solid var(--border)" }}>
                        <img
                          src={getAvatarUrl(merchant.name, 80)}
                          alt={merchant.name}
                          className="w-full h-full object-cover"
                          onError={e => {
                            const t = e.currentTarget as HTMLImageElement;
                            t.style.display = "none";
                            const parent = t.parentElement;
                            if (parent && !parent.querySelector(".av-fallback")) {
                              parent.style.display = "flex";
                              parent.style.alignItems = "center";
                              parent.style.justifyContent = "center";
                              parent.style.background = getAvatarColor(merchant.name);
                              const fb = document.createElement("span");
                              fb.className = "av-fallback text-white font-bold text-sm";
                              fb.textContent = getInitials(merchant.name);
                              parent.appendChild(fb);
                            }
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-foreground" data-testid={`text-merchant-name-${merchant.id}`}>{merchant.name}</h3>
                          <Badge variant={merchant.suspended ? "destructive" : "secondary"}>
                            {merchant.suspended ? "Suspendu" : "Actif"}
                          </Badge>
                          {merchant.feeExempt && <Badge className="text-xs bg-emerald-600 text-white">Zéro frais</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">{merchant.email}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Slug: /{merchant.slug}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span><Link className="w-3 h-3 inline mr-1" />{merchant.linkCount || 0} liens</span>
                      <span><ArrowRightLeft className="w-3 h-3 inline mr-1" />{merchant.txCount || 0} transactions</span>
                      <span><DollarSign className="w-3 h-3 inline mr-1" />{(merchant.totalRevenue || 0).toLocaleString()} F</span>
                    </div>
                    {merchant.website && (
                      <div className="flex items-center gap-1 mt-1">
                        <Globe className="w-3 h-3 text-blue-500" />
                        <a href={merchant.website.startsWith("http") ? merchant.website : `https://${merchant.website}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline truncate max-w-xs" data-testid={`text-merchant-website-${merchant.id}`}>{merchant.website}</a>
                      </div>
                    )}
                    {merchant.webhookUrl && (
                      <div className="flex items-center gap-1 mt-1">
                        <Webhook className="w-3 h-3 text-green-500" />
                        <p className="text-xs text-muted-foreground truncate max-w-xs" data-testid={`text-webhook-url-${merchant.id}`}>{merchant.webhookUrl}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap justify-end">
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setSelectedMerchantId(merchant.id)} data-testid={`button-details-${merchant.id}`}>
                      <Edit3 className="w-3 h-3" />Modifier
                    </Button>
                    <TelegramDialog merchant={merchant} token={token || ""} />
                    <Select
                      value={(merchant as any).withdrawalMode || "manual"}
                      onValueChange={async (mode) => {
                        await fetch(`/api/admin/merchants/${merchant.id}/withdrawal-mode`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ mode }),
                        });
                        queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs w-28" data-testid={`select-withdrawal-mode-${merchant.id}`}>
                        <Download className="w-3 h-3 mr-1" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manuel</SelectItem>
                        <SelectItem value="auto">Auto</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => suspendMutation.mutate({ id: merchant.id, suspended: !merchant.suspended })}
                      data-testid={`button-suspend-${merchant.id}`}
                    >
                      {merchant.suspended ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Ban className="w-4 h-4 text-amber-500" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { if (confirm("Supprimer ce marchand ?")) deleteMutation.mutate(merchant.id); }}
                      data-testid={`button-delete-${merchant.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function TransactionsPanel() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const apiUrl = useMemo(() => {
    const params = new URLSearchParams({ dateFilter });
    if (dateFilter === "custom") {
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
    }
    return `/api/admin/transactions?${params.toString()}`;
  }, [dateFilter, startDate, endDate]);

  const { data: transactions = [], isLoading, refetch, isError, error } = useAdminFetch(apiUrl, ["/api/admin/transactions", dateFilter, startDate, endDate]);

  if (isLoading) return <LoadingSkeleton />;

  if (isError) return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-foreground">Transactions</h2>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-transactions">
          <RefreshCw className="w-4 h-4 mr-2" />Réessayer
        </Button>
      </div>
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="p-6 text-center space-y-2">
          <p className="text-destructive font-semibold">⚠️ Erreur de chargement des transactions</p>
          <p className="text-sm text-muted-foreground">{(error as any)?.message || "Impossible de charger les données"}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
            <RefreshCw className="w-4 h-4 mr-2" />Réessayer
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  const filtered = (transactions as any[]).filter((t) => {
    const term = searchTerm.toLowerCase();
    const matchSearch = !term ||
      t.txId?.toLowerCase().includes(term) ||
      t.country?.toLowerCase().includes(term) ||
      t.merchantName?.toLowerCase().includes(term) ||
      t.payerNumber?.toLowerCase().includes(term) ||
      t.omnipayReference?.toLowerCase().includes(term);
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "confirmed" && ["confirmed", "approved", "success", "completed"].includes(t.status)) ||
      (statusFilter === "failed" && ["failed", "rejected", "omnipay_failed"].includes(t.status)) ||
      (statusFilter === "pending" && ["pending", "omnipay_pending", "submitted"].includes(t.status));
    const matchType =
      typeFilter === "all" ||
      t.type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copié", description: `${label} copié dans le presse-papiers` });
  };

  const downloadCSV = () => {
    const header = "Type,TXID,Référence,Montant,Pays,Marchand,Numéro,Opérateur,Statut,Note,Date\n";
    const rows = filtered.map((t: any) =>
      `${t.type || "payment"},${t.txId},${t.omnipayReference || ""},${t.amount},${t.country},${t.merchantName || t.merchantId},${t.payerNumber || ""},${t.operator || ""},${t.status},${t.errorMessage || ""},${new Date(t.createdAt).toLocaleDateString("fr-FR")}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "transactions.csv"; a.click();
  };

  const failedCount = (transactions as any[]).filter((t) => ["failed", "rejected"].includes(t.status)).length;

  const getTypeBadge = (type: string) => {
    if (type === "withdrawal") return <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400">Retrait</Badge>;
    if (type === "transfer") return <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400">Transfert</Badge>;
    if (type === "pending") return <Badge className="text-xs bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400">En cours</Badge>;
    return <Badge className="text-xs bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400">Paiement</Badge>;
  };

  const getStatusBadge = (status: string) => {
    if (["confirmed", "approved", "success", "completed"].includes(status))
      return <Badge variant="default" className="text-xs">{status === "approved" ? "Approuvé" : "Confirmé"}</Badge>;
    if (["failed", "rejected", "omnipay_failed"].includes(status))
      return <Badge variant="destructive" className="text-xs">{status === "rejected" ? "Rejeté" : "Échoué"}</Badge>;
    if (["omnipay_pending", "submitted"].includes(status))
      return <Badge className="text-xs bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400">En cours</Badge>;
    return <Badge variant="secondary" className="text-xs">En attente</Badge>;
  };

  const getProviderName = (provider: string | null | undefined, ref: string | null | undefined): string => {
    const p = (provider || "").toLowerCase();
    const r = ref || "";
    if (p === "sendavapay" || r.startsWith("sdk_") || r.startsWith("SP-")) return "SendavaPay";
    if (p === "mbiyo" || r.startsWith("MBY") || r.startsWith("MB-")) return "Mbiyo";
    if (p === "omnipay" || r.startsWith("OP-") || r.startsWith("TR-")) return "OmniPay";
    if (p === "westpay") return "Mbiyo";
    if (p === "sms") return "SMS";
    return "WestPay";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">Transactions</h2>
          <Badge variant="secondary" className="text-xs">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</Badge>
          {failedCount > 0 && (
            <Badge variant="destructive" className="text-xs">{failedCount} échoué{failedCount > 1 ? "s" : ""}</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-transactions">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button variant="outline" onClick={downloadCSV} data-testid="button-export-csv">
            <Download className="w-4 h-4 mr-2" />Export CSV
          </Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-10" placeholder="Rechercher TXID, référence, pays, marchand, numéro..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} data-testid="input-search-transactions" />
        </div>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-40" data-testid="select-date-filter">
            <SelectValue placeholder="Période" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            <SelectItem value="today">Aujourd'hui</SelectItem>
            <SelectItem value="yesterday">Hier</SelectItem>
            <SelectItem value="week">Cette semaine</SelectItem>
            <SelectItem value="month">Ce mois</SelectItem>
            <SelectItem value="custom">Plage personnalisée</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36" data-testid="select-type-filter">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous types</SelectItem>
            <SelectItem value="payment">Paiements</SelectItem>
            <SelectItem value="pending">En cours</SelectItem>
            <SelectItem value="withdrawal">Retraits</SelectItem>
            <SelectItem value="transfer">Transferts</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36" data-testid="select-status-filter">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="confirmed">Confirmés</SelectItem>
            <SelectItem value="failed">Échoués</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {dateFilter === "custom" && (
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Du :</label>
            <Input type="date" className="w-36 text-xs" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-start-date" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Au :</label>
            <Input type="date" className="w-36 text-xs" value={endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="input-end-date" />
          </div>
        </div>
      )}

      <div className="space-y-2">
          {filtered.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">Aucune transaction pour cette période</CardContent></Card>
          ) : (
            filtered.map((tx: any) => {
              const isFailed = ["failed", "rejected", "omnipay_failed"].includes(tx.status);
              const isPendingInProgress = tx.type === "pending" || ["omnipay_pending", "submitted"].includes(tx.status);
              return (
                <Card key={tx.id} className={isFailed ? "border-destructive/40 bg-destructive/5 dark:bg-destructive/10" : isPendingInProgress ? "border-yellow-300 dark:border-yellow-700" : ""}>
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs font-semibold text-foreground truncate max-w-[180px]" data-testid={`text-txid-${tx.id}`} title={tx.txId}>{tx.txId}</span>
                            <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => copyToClipboard(tx.txId, "ID transaction")} title="Copier l'ID" data-testid={`button-copy-txid-${tx.id}`}>
                              <Copy className="w-3 h-3" />
                            </Button>
                            {getTypeBadge(tx.type)}
                            <Badge variant="secondary" className="text-xs">{tx.country}</Badge>
                            {getStatusBadge(tx.status)}
                            {tx.provider && <Badge variant="outline" className="text-xs">{getProviderName(tx.provider, tx.omnipayReference)}</Badge>}
                          </div>
                          <div className="flex items-center gap-3 flex-wrap mt-1.5">
                            <p className="text-sm font-medium text-foreground">{tx.amount?.toLocaleString("fr-FR")} F CFA</p>
                            {tx.merchantName && <p className="text-xs text-muted-foreground">🏪 {tx.merchantName}</p>}
                            {tx.payerNumber && <p className="text-xs text-muted-foreground">📞 {tx.payerNumber}</p>}
                            {tx.operator && <p className="text-xs text-muted-foreground">📱 {tx.operator}</p>}
                          </div>
                          {tx.omnipayReference && isPendingInProgress && (
                            <div className="mt-2 flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700 px-3 py-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 mb-0.5">Référence {getProviderName(tx.provider, tx.omnipayReference)}</p>
                                <code className="text-xs font-mono text-yellow-900 dark:text-yellow-200 break-all">{tx.omnipayReference}</code>
                              </div>
                              <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs border-yellow-400 text-yellow-700 hover:bg-yellow-100 dark:text-yellow-300" onClick={() => copyToClipboard(tx.omnipayReference, `Référence ${getProviderName(tx.provider, tx.omnipayReference)}`)} data-testid={`button-copy-ref-${tx.id}`}>
                                <Copy className="w-3 h-3 mr-1" />Copier
                              </Button>
                            </div>
                          )}
                          {tx.omnipayReference && !isPendingInProgress && (
                            <div className="flex items-center gap-1 mt-1">
                              <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px]" title={tx.omnipayReference}>Réf: {tx.omnipayReference}</p>
                              <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => copyToClipboard(tx.omnipayReference, `Référence ${getProviderName(tx.provider, tx.omnipayReference)}`)} title="Copier la référence" data-testid={`button-copy-ref-${tx.id}`}>
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                          {tx.errorMessage && (
                            <p className="text-xs text-destructive mt-1 bg-destructive/10 rounded px-2 py-1">⚠️ {tx.errorMessage}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">{new Date(tx.createdAt).toLocaleString("fr-FR")}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-lg font-bold ${isFailed ? "text-destructive" : "text-foreground"}`}>{tx.amount?.toLocaleString("fr-FR")}</p>
                          <p className="text-xs text-muted-foreground">F CFA</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
    </div>
  );
}

function CountriesPanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [merchantId, setMerchantId] = useState("");
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [openMerchantCombo, setOpenMerchantCombo] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const [editingBalance, setEditingBalance] = useState<number | null>(null);
  const [balanceInput, setBalanceInput] = useState("");

  const { data: merchants = [] } = useAdminFetch("/api/admin/merchants", ["/api/admin/merchants"]);
  const { data: countries = [], isLoading } = useAdminFetch("/api/admin/countries", ["/api/admin/countries"]);

  const addCountryMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/add-countries", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ merchantId: parseInt(merchantId), countries: selectedCountries }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/countries"] });
      setShowAdd(false); setMerchantId(""); setSelectedCountries([]);
      toast({ title: `${data.added || selectedCountries.length} pays ajouté(s)` });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const updateBalanceMutation = useMutation({
    mutationFn: async ({ id, balance }: { id: number; balance: number }) => {
      const res = await fetch("/api/admin/update-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, balance }),
      });
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/countries"] });
      setEditingBalance(null);
      setBalanceInput("");
      toast({ title: "Solde mis à jour" });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible de modifier le solde", variant: "destructive" }),
  });

  const toggleOmnipayMutation = useMutation({
    mutationFn: async ({ merchantId, countryId, omnipayEnabled }: { merchantId: number; countryId: number; omnipayEnabled: boolean }) => {
      const res = await fetch(`/api/admin/merchant/${merchantId}/country/${countryId}/omnipay`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ omnipayEnabled }),
      });
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/countries"] });
      toast({ title: "Mis à jour" });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible de modifier", variant: "destructive" }),
  });

  const deleteCountryMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/merchant-country/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erreur suppression");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/countries"] });
      toast({ title: "Pays supprimé" });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible de supprimer", variant: "destructive" }),
  });


  if (isLoading) return <LoadingSkeleton />;

  const availableCountries = ["Togo", "Benin", "Cote d'Ivoire", "Senegal", "Mali", "Burkina Faso", "Cameroun", "Congo Brazzaville", "Congo RDC", "Gabon", "Guinee", "Gambie"];
  const selectedMerchantName = (merchants as Merchant[]).find(m => m.id.toString() === merchantId)?.name;
  const filteredCountries = filterSearch.trim()
    ? (countries as any[]).filter((mc: any) =>
        mc.country.toLowerCase().includes(filterSearch.toLowerCase()) ||
        (mc.merchantName || "").toLowerCase().includes(filterSearch.toLowerCase())
      )
    : (countries as any[]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-foreground">Pays & API Keys</h2>
        <Dialog open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) { setMerchantId(""); setSelectedCountries([]); setOpenMerchantCombo(false); } }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-country"><Plus className="w-4 h-4 mr-2" />Ajouter un pays</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Activer des pays pour un marchand</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); addCountryMutation.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Marchand</Label>
                <Popover open={openMerchantCombo} onOpenChange={setOpenMerchantCombo}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openMerchantCombo}
                      className="w-full justify-between font-normal"
                      data-testid="select-merchant-country"
                    >
                      {selectedMerchantName ?? "Rechercher un marchand..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Rechercher par nom..." data-testid="input-merchant-search" />
                      <CommandList>
                        <CommandEmpty>Aucun marchand trouvé.</CommandEmpty>
                        <CommandGroup>
                          {(merchants as Merchant[]).map((m) => (
                            <CommandItem
                              key={m.id}
                              value={m.name}
                              onSelect={() => { setMerchantId(m.id.toString()); setOpenMerchantCombo(false); }}
                              data-testid={`merchant-option-${m.id}`}
                            >
                              <Check className={`mr-2 h-4 w-4 ${merchantId === m.id.toString() ? "opacity-100" : "opacity-0"}`} />
                              <span>{m.name}</span>
                              {m.suspended && <Badge variant="destructive" className="ml-auto text-xs">Suspendu</Badge>}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Pays ({selectedCountries.length} sélectionné{selectedCountries.length > 1 ? "s" : ""})</Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => setSelectedCountries([...availableCountries])}
                      data-testid="button-select-all-countries"
                    >Tout sélectionner</button>
                    {selectedCountries.length > 0 && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:underline"
                        onClick={() => setSelectedCountries([])}
                        data-testid="button-deselect-all-countries"
                      >Tout décocher</button>
                    )}
                  </div>
                </div>
                <div className="border rounded-md divide-y max-h-52 overflow-y-auto" data-testid="country-checkboxes">
                  {availableCountries.map((c) => {
                    const checked = selectedCountries.includes(c);
                    return (
                      <label
                        key={c}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                        data-testid={`checkbox-country-${c.replace(/\s/g, "-").toLowerCase()}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedCountries(prev =>
                              checked ? prev.filter(x => x !== c) : [...prev, c]
                            )
                          }
                          className="rounded border-border w-4 h-4 accent-primary"
                        />
                        <span className="text-sm">{c}</span>
                        {checked && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
                      </label>
                    );
                  })}
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={addCountryMutation.isPending || !merchantId || selectedCountries.length === 0} data-testid="button-submit-add-country">
                {addCountryMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Activer {selectedCountries.length > 1 ? `les ${selectedCountries.length} pays` : selectedCountries.length === 1 ? `${selectedCountries[0]}` : "les pays sélectionnés"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Filtrer par marchand ou pays..."
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          data-testid="input-filter-countries"
        />
      </div>

      <div className="space-y-3">
        {filteredCountries.length === 0 && filterSearch && (
          <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">Aucun résultat pour « {filterSearch} »</CardContent></Card>
        )}
        {(countries as any[]).length === 0 ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">Aucun pays configure</CardContent></Card>
        ) : (
          filteredCountries.map((mc: any) => (
            <Card key={mc.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{mc.country}</span>
                      <Badge variant="secondary">{mc.merchantName || `Marchand #${mc.merchantId}`}</Badge>
                      <Badge variant={mc.active ? "default" : "destructive"}>{mc.active ? "Actif" : "Inactif"}</Badge>
                      {mc.omnipayEnabled && <Badge variant="secondary"><Zap className="w-3 h-3 mr-1" />Paiement actif</Badge>}
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Key className="w-3 h-3 text-muted-foreground" />
                      <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md font-mono">{mc.apiKey}</code>
                      <Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(mc.apiKey); toast({ title: "Copie !" }); }}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="shrink-0 space-y-2 text-right">
                    {editingBalance === mc.id ? (
                      <div className="flex items-center gap-1 justify-end">
                        <Input
                          type="number"
                          value={balanceInput}
                          onChange={(e) => setBalanceInput(e.target.value)}
                          className="h-8 w-32 text-sm text-right"
                          placeholder="Nouveau solde"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") updateBalanceMutation.mutate({ id: mc.id, balance: parseInt(balanceInput) || 0 });
                            if (e.key === "Escape") { setEditingBalance(null); setBalanceInput(""); }
                          }}
                          data-testid={`input-balance-${mc.id}`}
                        />
                        <Button
                          size="sm"
                          className="h-8 px-2"
                          disabled={updateBalanceMutation.isPending}
                          onClick={() => updateBalanceMutation.mutate({ id: mc.id, balance: parseInt(balanceInput) || 0 })}
                          data-testid={`button-save-balance-inline-${mc.id}`}
                        >
                          {updateBalanceMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => { setEditingBalance(null); setBalanceInput(""); }}
                          data-testid={`button-cancel-balance-${mc.id}`}
                        >
                          <XCircle className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        className="text-lg font-bold text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors cursor-pointer"
                        onClick={() => { setEditingBalance(mc.id); setBalanceInput(String(mc.balance ?? 0)); }}
                        title="Cliquer pour modifier"
                        data-testid={`button-balance-edit-${mc.id}`}
                      >
                        {mc.balance?.toLocaleString("fr-FR")} <span className="text-xs font-normal text-muted-foreground">F CFA</span>
                      </button>
                    )}
                    <div className="flex items-center gap-1 justify-end flex-wrap">
                      <Button
                        variant={mc.omnipayEnabled ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleOmnipayMutation.mutate({ merchantId: mc.merchantId, countryId: mc.id, omnipayEnabled: !mc.omnipayEnabled })}
                        disabled={toggleOmnipayMutation.isPending}
                        data-testid={`button-toggle-omnipay-${mc.id}`}
                      >
                        <Zap className="w-3 h-3 mr-1" />
                        {mc.omnipayEnabled ? "Paiement actif" : "Paiement inactif"}
                      </Button>
                      {editingBalance !== mc.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setEditingBalance(mc.id); setBalanceInput(String(mc.balance ?? 0)); }}
                          data-testid={`button-update-balance-${mc.id}`}
                        >
                          <Edit3 className="w-3 h-3 mr-1" />Solde
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => { if (confirm(`Supprimer ${mc.country} pour ${mc.merchantName || "ce marchand"} ?`)) deleteCountryMutation.mutate(mc.id); }}
                        disabled={deleteCountryMutation.isPending}
                        data-testid={`button-delete-country-${mc.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function NumbersPanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [country, setCountry] = useState("");
  const [operator, setOperator] = useState("");
  const [numMerchantId, setNumMerchantId] = useState("");

  const { data: numbersData = [], isLoading } = useAdminFetch("/api/admin/numbers", ["/api/admin/numbers"]);
  const { data: merchants = [] } = useAdminFetch("/api/admin/merchants", ["/api/admin/merchants"]);

  const addNumberMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/add-number", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          phoneNumber, country, operator: operator || undefined,
          merchantId: numMerchantId ? parseInt(numMerchantId) : undefined,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/numbers"] });
      setShowAdd(false); setPhoneNumber(""); setCountry(""); setOperator(""); setNumMerchantId("");
      toast({ title: "Numero ajoute" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const toggleNumberMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/toggle-number/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/numbers"] });
      toast({ title: "Statut mis a jour" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const deleteNumberMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/delete-number/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erreur");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/numbers"] });
      toast({ title: "Numero supprime" });
    },
  });

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-foreground">Numeros Mobile Money</h2>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-number"><Plus className="w-4 h-4 mr-2" />Ajouter un numero</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Ajouter un numero SIM</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); addNumberMutation.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Numero</Label>
                <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+22899935673" required data-testid="input-phone-number" />
              </div>
              <div className="space-y-2">
                <Label>Pays</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger data-testid="select-number-country"><SelectValue placeholder="Selectionner" /></SelectTrigger>
                  <SelectContent>
                    {["Togo", "Benin", "Cote d'Ivoire", "Senegal", "Mali", "Burkina Faso", "Cameroun", "Congo Brazzaville", "Gabon"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Operateur</Label>
                <Input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="Moov Money, TMoney..." data-testid="input-operator" />
              </div>
              <div className="space-y-2">
                <Label>Marchand (optionnel)</Label>
                <Select value={numMerchantId} onValueChange={setNumMerchantId}>
                  <SelectTrigger data-testid="select-number-merchant"><SelectValue placeholder="Aucun" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {(merchants as Merchant[]).map((m) => (
                      <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={addNumberMutation.isPending} data-testid="button-submit-add-number">
                {addNumberMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Ajouter le numero
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {(numbersData as PhoneNumber[]).length === 0 ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">Aucun numero configure</CardContent></Card>
        ) : (
          (numbersData as PhoneNumber[]).map((num) => (
            <Card key={num.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Phone className="w-4 h-4 text-primary" />
                      <span className="font-semibold font-mono text-foreground" data-testid={`text-number-${num.id}`}>{num.phoneNumber}</span>
                      <Badge variant="secondary">{num.country}</Badge>
                      {num.operator && <Badge variant="outline">{num.operator}</Badge>}
                      <Badge variant={num.status === "active" ? "default" : "destructive"}>
                        {num.status === "active" ? "Actif" : "Inactif"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleNumberMutation.mutate(num.id)}
                      data-testid={`button-toggle-number-${num.id}`}
                    >
                      {num.status === "active" ? (
                        <XCircle className="w-4 h-4 text-amber-500" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { if (confirm("Supprimer ce numero ?")) deleteNumberMutation.mutate(num.id); }}
                      data-testid={`button-delete-number-${num.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function SmsPanel() {
  const { data: smsLogs = [], isLoading } = useAdminFetch("/api/admin/sms-logs", ["/api/admin/sms-logs"]);
  const [filter, setFilter] = useState<"all" | "parsed" | "errors">("all");

  if (isLoading) return <LoadingSkeleton />;

  const allLogs = smsLogs as any[];
  const filteredLogs = allLogs.filter((sms) => {
    if (filter === "parsed") return sms.parsed;
    if (filter === "errors") return !sms.parsed;
    return true;
  });

  const parsedCount = allLogs.filter((s) => s.parsed).length;
  const errorCount = allLogs.filter((s) => !s.parsed).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-foreground" data-testid="text-sms-title">SMS recus ({allLogs.length})</h2>
        <div className="flex items-center gap-1">
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")} data-testid="button-filter-all">
            Tous ({allLogs.length})
          </Button>
          <Button size="sm" variant={filter === "parsed" ? "default" : "outline"} onClick={() => setFilter("parsed")} data-testid="button-filter-parsed">
            Traites ({parsedCount})
          </Button>
          <Button size="sm" variant={filter === "errors" ? "default" : "outline"} onClick={() => setFilter("errors")} data-testid="button-filter-errors">
            Erreurs ({errorCount})
          </Button>
        </div>
      </div>
      <ScrollArea className="h-[calc(100vh-260px)]">
        <div className="space-y-2">
          {filteredLogs.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">Aucun SMS {filter === "parsed" ? "traite" : filter === "errors" ? "en erreur" : "recu"}</CardContent></Card>
          ) : (
            filteredLogs.map((sms: any) => (
              <Card key={sms.id}>
                <CardContent className="p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <MessageSquare className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-mono text-sm text-foreground">{sms.fromSim}</span>
                      <Badge variant={sms.parsed ? "default" : "destructive"} data-testid={`badge-sms-status-${sms.id}`}>
                        {sms.parsed ? "Traite" : "Non traite"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 break-all">{sms.smsText}</p>
                    {(sms.parsedTxId || sms.parsedAmount || sms.parsedPayer) && (
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {sms.parsedTxId && (
                          <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground">TX: {sms.parsedTxId}</span>
                        )}
                        {sms.parsedAmount && (
                          <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground">{sms.parsedAmount.toLocaleString("fr-FR")} F CFA</span>
                        )}
                        {sms.parsedPayer && (
                          <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground">{sms.parsedPayer}</span>
                        )}
                      </div>
                    )}
                    {sms.errorMessage && (
                      <p className="text-xs text-destructive mt-2" data-testid={`text-sms-error-${sms.id}`}>{sms.errorMessage}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">{new Date(sms.createdAt).toLocaleString("fr-FR")}</p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function ApiKeysManagementPanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [selectedMerchant, setSelectedMerchant] = useState<number | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinMerchantId, setPinMerchantId] = useState<number | null>(null);
  const [showPinDialog, setShowPinDialog] = useState(false);

  const { data: merchants = [] } = useAdminFetch("/api/admin/merchants", ["/api/admin/merchants"]);
  const { data: allCountries = [] } = useAdminFetch("/api/admin/countries", ["/api/admin/countries"]);
  const { data: apiLogs = [] } = useAdminFetch("/api/admin/api-logs", ["/api/admin/api-logs"]);

  const updatePinMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/update-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ merchantId: pinMerchantId, pin: pinInput }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      toast({ title: "PIN mis a jour" });
      setShowPinDialog(false); setPinInput(""); setPinMerchantId(null);
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const regenerateMutation = useMutation({
    mutationFn: async (merchantCountryId: number) => {
      const res = await fetch("/api/admin/regenerate-api", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ merchantCountryId }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/countries"] });
      toast({ title: "Cle API regeneree" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const merchantsList = merchants as (Merchant & { hasPin: boolean })[];
  const countriesList = allCountries as (MerchantCountry & { merchantName: string })[];
  const filteredMerchants = selectedMerchant
    ? merchantsList.filter(m => m.id === selectedMerchant)
    : merchantsList;
  const filteredCountries = selectedMerchant
    ? countriesList.filter(c => c.merchantId === selectedMerchant)
    : countriesList;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold text-foreground">Gestion des cles API & PIN</h2>
        <Select value={selectedMerchant ? String(selectedMerchant) : "all"} onValueChange={v => setSelectedMerchant(v === "all" ? null : parseInt(v))}>
          <SelectTrigger className="w-52 h-9 text-sm" data-testid="select-filter-merchant-top">
            <SelectValue placeholder="Tous les marchands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les marchands</SelectItem>
            {merchantsList.map(m => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="w-4 h-4" />PIN des marchands
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredMerchants.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun marchand</p>
            ) : filteredMerchants.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 p-2 rounded-md hover-elevate">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={m.hasPin ? "default" : "secondary"} className="text-xs">
                    {m.hasPin ? "PIN actif" : "Pas de PIN"}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setPinMerchantId(m.id); setPinInput(""); setShowPinDialog(true); }}
                    data-testid={`button-set-pin-${m.id}`}
                  >
                    <Lock className="w-3 h-3 mr-1" />{m.hasPin ? "Modifier" : "Definir"}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />Journal d'activite API
              </CardTitle>
              {(apiLogs as any[]).length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  data-testid="button-copy-all-logs"
                  onClick={() => {
                    const text = (apiLogs as any[]).slice(0, 20).map((log: any) =>
                      `[${new Date(log.createdAt).toLocaleString("fr-FR")}] ${log.action} | ${log.description} | IP: ${log.ip || "-"}`
                    ).join("\n");
                    navigator.clipboard.writeText(text);
                    toast({ title: "Requetes copiees", description: `${Math.min((apiLogs as any[]).length, 20)} entrees copiees` });
                  }}
                >
                  <Copy className="w-3 h-3" />Copier tout
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {(apiLogs as any[]).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Aucune activite enregistree</p>
                ) : (
                  (apiLogs as any[]).slice(0, 20).map((log: any) => (
                    <div key={log.id} className="flex items-start gap-2 p-2 rounded-md text-xs hover:bg-muted/50 group">
                      <Badge variant={log.action.includes("failed") ? "destructive" : "secondary"} className="text-xs shrink-0">
                        {log.action}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-muted-foreground break-all">{log.description}</p>
                        <p className="text-muted-foreground/60">{new Date(log.createdAt).toLocaleString("fr-FR")}{log.ip ? ` — IP: ${log.ip}` : ""}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                        data-testid={`button-copy-log-${log.id}`}
                        onClick={() => {
                          const text = `[${new Date(log.createdAt).toLocaleString("fr-FR")}] ${log.action} | ${log.description} | IP: ${log.ip || "-"}`;
                          navigator.clipboard.writeText(text);
                          toast({ title: "Requete copiee" });
                        }}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="w-4 h-4" />Cles API par pays
            {selectedMerchant && <Badge variant="secondary" className="text-xs font-normal ml-1">{merchantsList.find(m => m.id === selectedMerchant)?.name}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredCountries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucune cle API</p>
            ) : (
              filteredCountries.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-2 p-3 rounded-md border flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{c.merchantName}</span>
                      <Badge variant="outline">{c.country}</Badge>
                    </div>
                    <code className="text-xs text-muted-foreground font-mono mt-1 block break-all" data-testid={`text-admin-apikey-${c.id}`}>
                      {c.apiKey}
                    </code>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { navigator.clipboard.writeText(c.apiKey); toast({ title: "Cle copiee" }); }}
                      data-testid={`button-admin-copy-key-${c.id}`}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm("Regenerer cette cle API ? L'ancienne sera invalidee.")) {
                          regenerateMutation.mutate(c.id);
                        }
                      }}
                      disabled={regenerateMutation.isPending}
                      data-testid={`button-admin-regenerate-${c.id}`}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />Regenerer
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Definir le code PIN</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); updatePinMutation.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Nouveau PIN (6 chiffres)</Label>
              <Input
                value={pinInput}
                onChange={(e) => { const val = e.target.value.replace(/\D/g, "").slice(0, 6); setPinInput(val); }}
                placeholder="123456"
                maxLength={6}
                required
                data-testid="input-admin-pin"
              />
              <p className="text-xs text-muted-foreground">
                Ce PIN sera utilise par le marchand pour acceder a la documentation API.
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={updatePinMutation.isPending || pinInput.length !== 6} data-testid="button-submit-pin">
              {updatePinMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
              Enregistrer le PIN
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OmniPayPanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [callbackKey, setCallbackKey] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);

  const { data: omnipaySettings, isLoading: settingsLoading } = useAdminFetch("/api/admin/omnipay/settings", ["/api/admin/omnipay/settings"]);

  useEffect(() => {
    if (omnipaySettings && !isInitialized) {
      setApiKey(omnipaySettings.apiKey || "");
      setCallbackKey(omnipaySettings.callbackKey || "");
      setIsInitialized(true);
    }
  }, [omnipaySettings, isInitialized]);

  const { data: omnipayBalance, isLoading: balanceLoading, refetch: refetchBalance } = useQuery({
    queryKey: ["/api/admin/omnipay/balance"],
    queryFn: async () => {
      const res = await fetch("/api/admin/omnipay/balance", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!omnipaySettings?.configured,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/omnipay/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ apiKey, callbackKey }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/omnipay/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/omnipay/balance"] });
      toast({ title: "Configuration sauvegardee" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const callbackUrl = "https://west-pay-aggregator-1--beryowone.replit.app/api/omnipay/callback";

  if (settingsLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">Configuration Paiement</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4" />Statut
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Configuration</span>
              <Badge variant={omnipaySettings?.configured ? "default" : "destructive"} data-testid="badge-omnipay-status">
                {omnipaySettings?.configured ? "Configure" : "Non configure"}
              </Badge>
            </div>
            {omnipaySettings?.configured && (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Solde</span>
                <div className="flex items-center gap-2">
                  {balanceLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : omnipayBalance?.balance !== undefined ? (
                    <span className="text-sm font-bold text-foreground" data-testid="text-omnipay-balance">
                      {Number(omnipayBalance.balance).toLocaleString("fr-FR")} F CFA
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Indisponible</span>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => refetchBalance()} data-testid="button-refresh-omnipay-balance">
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="w-4 h-4" />URL de callback
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Configurez cette URL comme URL de callback pour recevoir les notifications de paiement.
            </p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-muted px-3 py-2 rounded-md font-mono flex-1 break-all text-foreground" data-testid="text-callback-url">
                {callbackUrl}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { navigator.clipboard.writeText(callbackUrl); toast({ title: "URL copiee" }); }}
                data-testid="button-copy-callback-url"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="w-4 h-4" />Cles API
          </CardTitle>
        </CardHeader>
        <CardContent>
          {omnipaySettings?.envOverride && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700 px-3 py-2 text-xs text-yellow-800 dark:text-yellow-300">
              <span className="mt-0.5">⚠️</span>
              <span>Une variable d'environnement <code className="font-mono font-bold">OMNIPAY_API_KEY</code> est active et prend la priorité au runtime. La clé ci-dessous est sauvegardée en base de données mais n'est pas utilisée tant que la variable d'env est définie.</span>
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Cle API Westpay (apikey)</Label>
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="omnipay_api_key_..."
                data-testid="input-omnipay-apikey"
              />
              <p className="text-xs text-muted-foreground">Cle API unique utilisee pour les paiements entrants ET les retraits (transferts).</p>
            </div>
            <div className="space-y-2">
              <Label>Cle de callback / webhook (callback_key)</Label>
              <Input
                value={callbackKey}
                onChange={(e) => setCallbackKey(e.target.value)}
                placeholder="Votre cle de callback"
                data-testid="input-omnipay-callbackkey"
              />
              <p className="text-xs text-muted-foreground">Cle utilisee pour verifier la signature HMAC-SHA3-512 des callbacks.</p>
            </div>
            <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-omnipay">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
              Sauvegarder la configuration
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function MbiyoPanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);

  const { data: mbiyoSettings, isLoading: settingsLoading } = useAdminFetch("/api/admin/mbiyo/settings", ["/api/admin/mbiyo/settings"]);

  useEffect(() => {
    if (mbiyoSettings && !isInitialized) {
      setApiKey(mbiyoSettings.apiKey || "");
      setWebhookSecret(mbiyoSettings.webhookSecret || "");
      setIsInitialized(true);
    }
  }, [mbiyoSettings, isInitialized]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/mbiyo/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ apiKey, webhookSecret }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mbiyo/settings"] });
      toast({ title: "Configuration Mbiyo sauvegardee" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const payinCallbackUrl = "https://west-pay-aggregator-1--beryowone.replit.app/api/mbiyo/callback";
  const payoutCallbackUrl = "https://west-pay-aggregator-1--beryowone.replit.app/api/mbiyo/payout-callback";

  if (settingsLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">Configuration Mbiyo</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4" />Statut
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Configuration</span>
              <Badge variant={mbiyoSettings?.configured ? "default" : "destructive"} data-testid="badge-mbiyo-status">
                {mbiyoSettings?.configured ? "Configure" : "Non configure"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Mbiyo (mbiyo.africa) — paiements mobiles entrants et sortants. Activez-le par pays dans l'onglet Pays.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="w-4 h-4" />Webhook Payin
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              URL de callback pour les paiements entrants (collecte).
            </p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-muted px-3 py-2 rounded-md font-mono flex-1 break-all text-foreground" data-testid="text-mbiyo-callback-url">
                {payinCallbackUrl}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { navigator.clipboard.writeText(payinCallbackUrl); toast({ title: "URL copiee" }); }}
                data-testid="button-copy-mbiyo-callback-url"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="w-4 h-4" />Webhook Payout
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              URL de callback pour les reversements sortants (retraits marchands).
            </p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-muted px-3 py-2 rounded-md font-mono flex-1 break-all text-foreground" data-testid="text-mbiyo-payout-callback-url">
                {payoutCallbackUrl}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { navigator.clipboard.writeText(payoutCallbackUrl); toast({ title: "URL copiee" }); }}
                data-testid="button-copy-mbiyo-payout-callback-url"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="w-4 h-4" />Cles API
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mbiyoSettings?.envOverride && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700 px-3 py-2 text-xs text-yellow-800 dark:text-yellow-300">
              <span className="mt-0.5">⚠️</span>
              <span>Une variable d'environnement <code className="font-mono font-bold">MBIYO_API_KEY</code> est active et prend la priorité au runtime. La clé ci-dessous est sauvegardée en base de données mais n'est pas utilisée tant que la variable d'env est définie.</span>
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Cle API Mbiyo (Bearer token)</Label>
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="mbiyo_api_key_..."
                data-testid="input-mbiyo-apikey"
              />
              <p className="text-xs text-muted-foreground">Cle Bearer utilisee pour authentifier les requetes vers l'API Mbiyo.</p>
            </div>
            <div className="space-y-2">
              <Label>Secret webhook (Signature HMAC-SHA256)</Label>
              <Input
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder="Votre secret webhook Mbiyo"
                data-testid="input-mbiyo-webhook-secret"
              />
              <p className="text-xs text-muted-foreground">Secret utilise pour verifier la signature HMAC-SHA256 des webhooks entrants.</p>
            </div>
            <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-mbiyo">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
              Sauvegarder la configuration
            </Button>
          </form>
        </CardContent>
      </Card>

      <MbiyoManualConfirmCard token={token} />
    </div>
  );
}

function MbiyoManualConfirmCard({ token }: { token: string | null }) {
  const { toast } = useToast();
  const [reference, setReference] = useState("");
  const [txId, setTxId] = useState("");

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/mbiyo/confirm-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reference: reference.trim(), txId: txId.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Erreur");
      return d;
    },
    onSuccess: (data) => {
      toast({ title: "Paiement confirme", description: `Marchand ${data.merchantName} credite de ${data.credit}` });
      setReference("");
      setTxId("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/transactions"] });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  return (
    <Card className="border-orange-200 dark:border-orange-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-orange-500" />Confirmation manuelle d'un paiement Mbiyo
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">
          Utiliser uniquement si le paiement est confirmé chez Mbiyo mais reste "en attente" sur WestPay (webhook non reçu). Cela crédite le solde du marchand manuellement.
        </p>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Référence WestPay (obligatoire)</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="ex: MBMNWCI3HTD5F1DC30"
              data-testid="input-mbiyo-manual-reference"
            />
          </div>
          <div className="space-y-1">
            <Label>ID Transaction Mbiyo (optionnel)</Label>
            <Input
              value={txId}
              onChange={(e) => setTxId(e.target.value)}
              placeholder="ex: txn_xxxxxxxx"
              data-testid="input-mbiyo-manual-txid"
            />
          </div>
          <Button
            onClick={() => confirmMutation.mutate()}
            disabled={!reference.trim() || confirmMutation.isPending}
            className="bg-orange-500 hover:bg-orange-600 text-white"
            data-testid="button-mbiyo-manual-confirm"
          >
            {confirmMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
            Confirmer et créditer le marchand
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SendavaPayPanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);

  const { data: settings, isLoading: settingsLoading } = useAdminFetch("/api/admin/sendavapay/settings", ["/api/admin/sendavapay/settings"]);

  useEffect(() => {
    if (settings && !isInitialized) {
      setApiKey(settings.apiKey || "");
      setWebhookSecret(settings.webhookSecret === "configured" ? "" : (settings.webhookSecret || ""));
      setIsInitialized(true);
    }
  }, [settings, isInitialized]);

  const { data: balanceData, isLoading: balanceLoading, refetch: refetchBalance } = useQuery({
    queryKey: ["/api/admin/sendavapay/balance"],
    queryFn: async () => {
      const res = await fetch("/api/admin/sendavapay/balance", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!settings?.configured,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/sendavapay/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ apiKey, webhookSecret }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sendavapay/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sendavapay/balance"] });
      toast({ title: "Configuration SendavaPay sauvegardee" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const callbackUrl = "https://west-pay-aggregator-1--beryowone.replit.app/api/sendavapay/callback";

  if (settingsLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">Configuration SendavaPay</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4" />Statut
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Configuration</span>
              <Badge variant={settings?.configured ? "default" : "destructive"} data-testid="badge-sendavapay-status">
                {settings?.configured ? "Configure" : "Non configure"}
              </Badge>
            </div>
            {settings?.configured && (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Solde</span>
                <div className="flex items-center gap-2">
                  {balanceLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : balanceData?.balance !== undefined ? (
                    <span className="text-sm font-bold text-foreground" data-testid="text-sendavapay-balance">
                      {typeof balanceData.balance === "number"
                        ? `${Number(balanceData.balance).toLocaleString("fr-FR")} F CFA`
                        : JSON.stringify(balanceData.balance)}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Indisponible</span>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => refetchBalance()} data-testid="button-refresh-sendavapay-balance">
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              SendavaPay — collectes mobiles (TMoney, Moov, MTN, Orange, Wave). Activez par operateur dans l'onglet Pays &amp; API.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="w-4 h-4" />URL de callback
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Configurez cette URL dans votre tableau de bord SendavaPay pour recevoir les notifications de paiement.
            </p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-muted px-3 py-2 rounded-md font-mono flex-1 break-all text-foreground" data-testid="text-sendavapay-callback-url">
                {callbackUrl}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { navigator.clipboard.writeText(callbackUrl); toast({ title: "URL copiee" }); }}
                data-testid="button-copy-sendavapay-callback-url"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="w-4 h-4" />Pays supportes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {["Togo", "Benin", "Cameroun", "Burkina Faso", "Cote d'Ivoire", "Mali", "Senegal", "Congo RDC", "Congo Brazzaville"].map(c => (
                <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              OTP requis pour Orange Money en Burkina Faso, Cote d'Ivoire, Mali et Senegal.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="w-4 h-4" />Cles API SendavaPay
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings?.envOverride && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700 px-3 py-2 text-xs text-yellow-800 dark:text-yellow-300">
              <span className="mt-0.5">⚠️</span>
              <span>Une variable d'environnement <code className="font-mono font-bold">SENDAVAPAY_API_KEY</code> est active et prend la priorité au runtime. La clé ci-dessous est sauvegardée en base de données mais n'est pas utilisée tant que la variable d'env est définie.</span>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">API Key</label>
              <input
                type="text"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Votre cle API SendavaPay"
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background text-foreground outline-none focus:ring-2 focus:ring-ring"
                data-testid="input-sendavapay-api-key"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Webhook Secret {settings?.webhookSecret === "configured" && <span className="text-xs text-green-600 font-normal ml-1">(déjà configuré)</span>}
              </label>
              <input
                type="password"
                value={webhookSecret}
                onChange={e => setWebhookSecret(e.target.value)}
                placeholder={settings?.webhookSecret === "configured" ? "Laisser vide pour ne pas changer" : "Votre secret webhook SendavaPay"}
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background text-foreground outline-none focus:ring-2 focus:ring-ring"
                data-testid="input-sendavapay-api-secret"
              />
            </div>
          </div>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-sendavapay-settings"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Sauvegarder
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function AdminWalletTransfersPanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const { data: transfers = [], isLoading } = useAdminFetch("/api/admin/wallet-transfers", ["/api/admin/wallet-transfers"]);
  const { data: feeConfig, refetch: refetchFee } = useAdminFetch("/api/admin/wallet-transfer-fee", ["/api/admin/wallet-transfer-fee"]);
  const { data: wtcList = [], refetch: refetchWtc } = useAdminFetch("/api/admin/wallet-transfer-countries", ["/api/admin/wallet-transfer-countries"]);

  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<(WalletTransfer & { merchantName: string }) | null>(null);
  const [noteAction, setNoteAction] = useState<"approve" | "reject">("approve");
  const [note, setNote] = useState("");
  const [feeType, setFeeType] = useState("percentage");
  const [feeValue, setFeeValue] = useState("2");
  const [savingFee, setSavingFee] = useState(false);
  const [newCountry, setNewCountry] = useState("");
  const [newZone, setNewZone] = useState("XOF");
  const [addingCountry, setAddingCountry] = useState(false);

  useEffect(() => {
    if (feeConfig) {
      setFeeType((feeConfig as any).feeType || "percentage");
      setFeeValue((feeConfig as any).feeValue || "2");
    }
  }, [feeConfig]);

  const actionMutation = useMutation({
    mutationFn: async ({ id, action, note: n }: { id: number; action: "approve" | "reject"; note: string }) => {
      const res = await fetch(`/api/admin/wallet-transfers/${id}/${action}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ note: n }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wallet-transfers"] });
      toast({ title: vars.action === "approve" ? "Virement approuve et applique" : "Virement rejete" });
      setNoteDialogOpen(false);
      setNote("");
      setSelectedTransfer(null);
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const openAction = (transfer: WalletTransfer & { merchantName: string }, action: "approve" | "reject") => {
    setSelectedTransfer(transfer);
    setNoteAction(action);
    setNote("");
    setNoteDialogOpen(true);
  };

  const saveFee = async () => {
    setSavingFee(true);
    try {
      const res = await fetch("/api/admin/wallet-transfer-fee", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ feeType, feeValue }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      refetchFee();
      toast({ title: "Frais mis a jour" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setSavingFee(false);
    }
  };

  const statusBadge = (status: string) => {
    if (status === "pending") return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" />En attente</Badge>;
    if (status === "approved") return <Badge className="bg-green-500 gap-1"><CheckCircle className="w-3 h-3" />Approuve</Badge>;
    return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Rejete</Badge>;
  };

  const [searchVt, setSearchVt] = useState("");
  const [statusFilterVt, setStatusFilterVt] = useState("all");
  const [countryFilterVt, setCountryFilterVt] = useState("all");

  const allTransfers = (transfers as (WalletTransfer & { merchantName: string })[]);
  const pending = allTransfers.filter(t => t.status === "pending");

  const filteredTransfers = allTransfers.filter((wt) => {
    const term = searchVt.toLowerCase();
    const matchSearch = !term || wt.merchantName?.toLowerCase().includes(term) || wt.fromCountry?.toLowerCase().includes(term) || wt.toCountry?.toLowerCase().includes(term) || `TR-${wt.id}`.toLowerCase().includes(term);
    const matchStatus = statusFilterVt === "all" || wt.status === statusFilterVt;
    const matchCountry = countryFilterVt === "all" || wt.fromCountry === countryFilterVt || wt.toCountry === countryFilterVt;
    return matchSearch && matchStatus && matchCountry;
  });

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">Virements Inter-Wallets</h2>

      <Card>
        <CardHeader><CardTitle className="text-base">Configuration des frais</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2">
              <Label>Type de frais</Label>
              <Select value={feeType} onValueChange={setFeeType}>
                <SelectTrigger className="w-44" data-testid="select-fee-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Pourcentage (%)</SelectItem>
                  <SelectItem value="fixed">Montant fixe (FCFA)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valeur</Label>
              <Input
                type="number"
                value={feeValue}
                onChange={(e) => setFeeValue(e.target.value)}
                placeholder={feeType === "percentage" ? "Ex: 2" : "Ex: 500"}
                min="0"
                step="0.1"
                className="w-40"
                data-testid="input-fee-value"
              />
            </div>
            <Button onClick={saveFee} disabled={savingFee} data-testid="button-save-fee">
              {savingFee ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Enregistrer
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Frais actuels : {feeType === "percentage" ? `${feeValue}% du montant` : `${parseFloat(feeValue || "0").toLocaleString("fr-FR")} FCFA fixe`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Pays autorisés pour les virements</CardTitle>
            <Badge variant="secondary">{(wtcList as any[]).length} pays</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newCountry.trim()) return;
              setAddingCountry(true);
              try {
                const res = await fetch("/api/admin/wallet-transfer-countries", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ country: newCountry.trim(), currencyZone: newZone }),
                });
                if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
                refetchWtc();
                setNewCountry("");
                toast({ title: "Pays ajouté" });
              } catch (err: any) {
                toast({ title: "Erreur", description: err.message, variant: "destructive" });
              } finally {
                setAddingCountry(false);
              }
            }}
            className="flex flex-wrap gap-3 items-end"
          >
            <div className="space-y-1 flex-1 min-w-40">
              <Label className="text-xs">Nom du pays</Label>
              <Input
                value={newCountry}
                onChange={(e) => setNewCountry(e.target.value)}
                placeholder="Ex: Nigeria"
                data-testid="input-new-wtc-country"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Zone monétaire</Label>
              <Select value={newZone} onValueChange={setNewZone}>
                <SelectTrigger className="w-28" data-testid="select-new-wtc-zone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="XOF">XOF</SelectItem>
                  <SelectItem value="XAF">XAF</SelectItem>
                  <SelectItem value="CDF">CDF</SelectItem>
                  <SelectItem value="GNF">GNF</SelectItem>
                  <SelectItem value="GMD">GMD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={addingCountry || !newCountry.trim()} size="sm" data-testid="button-add-wtc-country">
              {addingCountry ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              Ajouter
            </Button>
          </form>

          <div className="space-y-2">
            {["XOF", "XAF", "CDF", "GNF", "GMD"].map(zone => {
              const zoneCountries = (wtcList as any[]).filter((c: any) => c.currencyZone === zone);
              if (zoneCountries.length === 0) return null;
              return (
                <div key={zone}>
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Zone {zone}</p>
                  <div className="space-y-1">
                    {zoneCountries.map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between gap-2 p-2 rounded border text-sm" data-testid={`wtc-row-${c.id}`}>
                        <div className="flex items-center gap-2">
                          <span className={c.active ? "text-foreground font-medium" : "text-muted-foreground line-through"}>{c.country}</span>
                          <Badge variant={c.active ? "secondary" : "outline"} className="text-xs">
                            {c.active ? "Actif" : "Désactivé"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Switch
                            checked={c.active}
                            onCheckedChange={async (v) => {
                              await fetch(`/api/admin/wallet-transfer-countries/${c.id}/toggle`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ active: v }),
                              });
                              refetchWtc();
                              toast({ title: v ? `${c.country} activé` : `${c.country} désactivé` });
                            }}
                            data-testid={`switch-wtc-${c.id}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive h-7 w-7"
                            onClick={async () => {
                              if (!confirm(`Supprimer ${c.country} ?`)) return;
                              await fetch(`/api/admin/wallet-transfer-countries/${c.id}`, {
                                method: "DELETE",
                                headers: { Authorization: `Bearer ${token}` },
                              });
                              refetchWtc();
                              toast({ title: `${c.country} supprimé` });
                            }}
                            data-testid={`button-delete-wtc-${c.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Les virements sont uniquement possibles entre deux pays actifs dans la même zone monétaire.</p>
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base text-orange-600 dark:text-orange-400">
                Demandes en attente
              </CardTitle>
              <Badge variant="secondary">{pending.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pending.map((wt) => (
                <div key={wt.id} className="p-3 rounded border bg-muted/30 space-y-2" data-testid={`virement-pending-${wt.id}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <span className="font-medium text-sm">{wt.merchantName}</span>
                      <span className="text-muted-foreground text-xs ml-2">#{wt.id}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1"
                        onClick={() => openAction(wt, "approve")} data-testid={`button-approve-virement-${wt.id}`}>
                        <CheckCircle className="w-3 h-3" />Approuver
                      </Button>
                      <Button size="sm" variant="destructive" className="gap-1"
                        onClick={() => openAction(wt, "reject")} data-testid={`button-reject-virement-${wt.id}`}>
                        <XCircle className="w-3 h-3" />Rejeter
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{wt.fromCountry} → {wt.toCountry}</span>
                    <span>Montant : <span className="text-foreground font-medium">{wt.amount.toLocaleString("fr-FR")} {wt.currency}</span></span>
                    <span>Frais : {wt.fee.toLocaleString("fr-FR")} {wt.currency}</span>
                    <span>Total debite : {(wt.amount + wt.fee).toLocaleString("fr-FR")} {wt.currency}</span>
                    <span>{new Date(wt.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-44">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-10" placeholder="Marchand, pays, référence TR-..." value={searchVt} onChange={e => setSearchVt(e.target.value)} data-testid="input-search-vt" />
        </div>
        <Select value={statusFilterVt} onValueChange={setStatusFilterVt}>
          <SelectTrigger className="w-36" data-testid="select-filter-vt-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="approved">Approuvé</SelectItem>
            <SelectItem value="rejected">Rejeté</SelectItem>
          </SelectContent>
        </Select>
        <Select value={countryFilterVt} onValueChange={setCountryFilterVt}>
          <SelectTrigger className="w-40" data-testid="select-filter-vt-country"><SelectValue placeholder="Pays" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous pays</SelectItem>
            {COUNTRIES_LIST.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Tous les virements</CardTitle>
            <Badge variant="secondary">{filteredTransfers.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          ) : filteredTransfers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun virement</p>
          ) : (
            <div className="space-y-2">
                {filteredTransfers.map((wt) => (
                  <div key={wt.id} className="p-3 rounded border text-sm space-y-1" data-testid={`virement-row-${wt.id}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{wt.merchantName}</span>
                        <span className="text-muted-foreground text-xs">•</span>
                        <span className="text-muted-foreground text-xs">{wt.fromCountry} → {wt.toCountry}</span>
                      </div>
                      {statusBadge(wt.status)}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Montant : <span className="text-foreground">{wt.amount.toLocaleString("fr-FR")} {wt.currency}</span></span>
                      <span>Frais : {wt.fee.toLocaleString("fr-FR")}</span>
                      <span>{new Date(wt.createdAt).toLocaleDateString("fr-FR")}</span>
                    </div>
                    {wt.adminNote && <p className="text-xs text-muted-foreground italic">Note : {wt.adminNote}</p>}
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {noteAction === "approve" ? "Approuver le virement" : "Rejeter le virement"}
            </DialogTitle>
          </DialogHeader>
          {selectedTransfer && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded text-sm space-y-1">
                <p className="font-medium">{selectedTransfer.merchantName}</p>
                <p className="text-muted-foreground">{selectedTransfer.fromCountry} → {selectedTransfer.toCountry}</p>
                <p>{selectedTransfer.amount.toLocaleString("fr-FR")} {selectedTransfer.currency} + frais {selectedTransfer.fee.toLocaleString("fr-FR")} = <strong>{(selectedTransfer.amount + selectedTransfer.fee).toLocaleString("fr-FR")} {selectedTransfer.currency}</strong> débités</p>
              </div>
              <div className="space-y-2">
                <Label>Note (optionnelle)</Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={noteAction === "approve" ? "Commentaire d'approbation..." : "Raison du rejet..."}
                  data-testid="input-action-note"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setNoteDialogOpen(false)}>Annuler</Button>
                <Button
                  disabled={actionMutation.isPending}
                  onClick={() => actionMutation.mutate({ id: selectedTransfer.id, action: noteAction, note })}
                  className={noteAction === "approve" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                  variant={noteAction === "reject" ? "destructive" : "default"}
                  data-testid="button-confirm-action"
                >
                  {actionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {noteAction === "approve" ? "Confirmer l'approbation" : "Confirmer le rejet"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminsPanel() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const { data: adminList = [], isLoading } = useAdminFetch("/api/admin/admins", ["/api/admin/admins"]);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPwd, setShowPwd] = useState(false);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/create-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/admins"] });
      toast({ title: "Administrateur créé", description: `${form.email} peut maintenant se connecter.` });
      setForm({ email: "", password: "" });
      setCreateOpen(false);
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/delete-admin/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur suppression"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/admins"] });
      toast({ title: "Administrateur supprimé" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const allAdmins = adminList as { id: number; email: string; createdAt: string }[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Administrateurs</h2>
          <p className="text-sm text-muted-foreground">{allAdmins.length} compte{allAdmins.length !== 1 ? "s" : ""} administrateur</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5" data-testid="button-add-admin">
          <Plus className="w-3.5 h-3.5" /> Ajouter un admin
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : allAdmins.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Aucun administrateur trouvé.</p>
      ) : (
        <div className="space-y-2">
          {allAdmins.map((a) => {
            const isSelf = user?.email === a.email;
            return (
              <div key={a.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/20" data-testid={`admin-row-${a.id}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate" data-testid={`text-admin-email-${a.id}`}>{a.email}</span>
                      {isSelf && <Badge variant="secondary" className="text-xs py-0">Vous</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Créé le {new Date(a.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-xs hidden sm:inline-flex">ID #{a.id}</Badge>
                  {!isSelf && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (confirm(`Supprimer le compte admin ${a.email} ?`)) deleteMutation.mutate(a.id);
                      }}
                      data-testid={`button-delete-admin-${a.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouvel administrateur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Adresse email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="admin@example.com"
                data-testid="input-admin-email"
              />
            </div>
            <div className="space-y-2">
              <Label>Mot de passe</Label>
              <div className="relative">
                <Input
                  type={showPwd ? "text" : "password"}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Minimum 6 caractères"
                  data-testid="input-admin-password"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowPwd(v => !v)}
                >
                  <Eye className="w-3.5 h-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Ce compte aura accès à tous les outils d'administration.</p>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.email || form.password.length < 6}
                data-testid="button-create-admin"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Créer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const COUNTRIES_LIST = [
  "Togo", "Benin", "Burkina Faso", "Cote d'Ivoire", "Senegal", "Mali",
  "Cameroun", "Congo Brazzaville", "Congo RDC", "Gabon", "Guinee", "Niger", "Guinee-Bissau",
  "Tchad", "Centrafrique", "Guinee Equatoriale",
];
const OPERATOR_TYPES = ["Mobile Money", "Virement bancaire", "Carte bancaire", "Cryptomonnaie", "Autre"];
const GATEWAYS = ["OmniPay", "Mbiyo", "SendavaPay", "Manuel"];

function SortableOpRow({
  op, onEdit, onDelete, onToggle, onUploadLogo, onRemoveLogo, uploadingFor,
}: {
  op: WithdrawalOperator;
  onEdit: (op: WithdrawalOperator) => void;
  onDelete: (id: number) => void;
  onToggle: (op: WithdrawalOperator, field: string, value: boolean) => void;
  onUploadLogo: (id: number, file: File) => void;
  onRemoveLogo: (id: number) => void;
  uploadingFor: number | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: op.id });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="p-3 rounded border bg-muted/20 space-y-3" data-testid={`operator-row-${op.id}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none shrink-0 p-1">
            <GripVertical className="w-4 h-4" />
          </div>
          <div className="relative group shrink-0">
            {(op as any).logo ? (
              <img src={(op as any).logo} alt={op.name} className="w-10 h-10 rounded-full object-cover border" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-muted border flex items-center justify-center">
                <span className="text-xs font-bold text-muted-foreground">{op.name.substring(0, 2).toUpperCase()}</span>
              </div>
            )}
            <button
              type="button"
              className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
              onClick={() => fileInputRef.current?.click()}
              title="Changer le logo"
            >
              {uploadingFor === op.id ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <ImagePlus className="w-4 h-4 text-white" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) onUploadLogo(op.id, file);
                e.target.value = "";
              }}
            />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{op.name}</span>
              <Badge variant="outline" className="text-xs py-0">{op.type}</Badge>
              <Badge variant="secondary" className="text-xs py-0">{op.country}</Badge>
              {!op.active && <Badge variant="destructive" className="text-xs py-0">Inactif</Badge>}
            </div>
            <span className="text-xs text-muted-foreground">
              Passerelle : {op.gateway}{op.gateway?.toLowerCase() === "mbiyo" && op.mbiyoCode ? ` (${op.mbiyoCode})` : op.gateway?.toLowerCase() === "mbiyo" ? " ⚠️ code réseau manquant" : ""} · Limite : {op.dailyLimit.toLocaleString("fr-FR")} FCFA/j
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {(op as any).logo && (
            <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive h-7 w-7 p-0" title="Supprimer le logo" onClick={() => onRemoveLogo(op.id)} data-testid={`button-remove-logo-${op.id}`}>
              <X className="w-3 h-3" />
            </Button>
          )}
          <Switch checked={op.active} onCheckedChange={(v) => onToggle(op, "active", v)} data-testid={`switch-op-active-${op.id}`} />
          <Button size="sm" variant="ghost" onClick={() => onEdit(op)} data-testid={`button-edit-op-${op.id}`}><Eye className="w-3 h-3" /></Button>
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onDelete(op.id)} data-testid={`button-delete-op-${op.id}`}><Trash2 className="w-3 h-3" /></Button>
        </div>
      </div>
      <div className="border-t pt-2">
        <p className="text-xs text-muted-foreground mb-2 font-medium">Maintenance (bloquer) :</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
          {[
            { label: "Toutes les pages", field: "maintenanceAll", val: op.maintenanceAll },
            { label: "Dépôts", field: "maintenanceDeposits", val: op.maintenanceDeposits },
            { label: "Retraits", field: "maintenanceWithdrawals", val: op.maintenanceWithdrawals },
            { label: "Liens de paiement", field: "maintenancePaymentLinks", val: op.maintenancePaymentLinks },
            { label: "API paiement", field: "maintenanceApiPayment", val: op.maintenanceApiPayment },
          ].map(({ label, field, val }) => (
            <label key={field} className="flex items-center gap-1.5 cursor-pointer">
              <Switch checked={val} onCheckedChange={(v) => onToggle(op, field, v)} className="scale-75 origin-left" data-testid={`switch-${field}-${op.id}`} />
              <span className={`text-xs ${val ? "text-red-500 font-medium" : "text-muted-foreground"}`}>{label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function WithdrawalOperatorsPanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const { data: opList = [], isLoading: opsLoading } = useAdminFetch("/api/admin/withdrawal-operators", ["/api/admin/withdrawal-operators"]);

  const [opDialogOpen, setOpDialogOpen] = useState(false);
  const [editingOp, setEditingOp] = useState<WithdrawalOperator | null>(null);
  const [filterCountry, setFilterCountry] = useState("all");
  const [uploadingLogoFor, setUploadingLogoFor] = useState<number | null>(null);
  const [localOps, setLocalOps] = useState<WithdrawalOperator[]>([]);

  useEffect(() => { setLocalOps(opList as WithdrawalOperator[]); }, [opList]);

  const emptyForm = { name: "", type: "Mobile Money", country: "Togo", dailyLimit: 1000000, gateway: "OmniPay", omnipayCode: "", mbiyoCode: "", active: true, maintenanceAll: false, maintenanceDeposits: false, maintenanceWithdrawals: false, maintenancePaymentLinks: false, maintenanceApiPayment: false };
  const [form, setForm] = useState(emptyForm);

  const openCreate = () => { setEditingOp(null); setForm(emptyForm); setOpDialogOpen(true); };
  const openEdit = (op: WithdrawalOperator) => {
    setEditingOp(op);
    setForm({ name: op.name, type: op.type, country: op.country, dailyLimit: op.dailyLimit, gateway: op.gateway, omnipayCode: op.omnipayCode || "", mbiyoCode: op.mbiyoCode || "", active: op.active, maintenanceAll: op.maintenanceAll, maintenanceDeposits: op.maintenanceDeposits, maintenanceWithdrawals: op.maintenanceWithdrawals, maintenancePaymentLinks: op.maintenancePaymentLinks, maintenanceApiPayment: op.maintenanceApiPayment });
    setOpDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const url = editingOp ? `/api/admin/withdrawal-operators/${editingOp.id}` : "/api/admin/withdrawal-operators";
      const method = editingOp ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawal-operators"] });
      toast({ title: editingOp ? "Opérateur mis à jour" : "Opérateur créé" });
      setOpDialogOpen(false);
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/withdrawal-operators/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Erreur suppression");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawal-operators"] }); toast({ title: "Opérateur supprimé" }); },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const toggleMaint = async (op: WithdrawalOperator, field: string, value: boolean) => {
    await fetch(`/api/admin/withdrawal-operators/${op.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ [field]: value }),
    });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawal-operators"] });
  };

  const uploadLogo = async (opId: number, file: File) => {
    setUploadingLogoFor(opId);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch(`/api/admin/operator-logo/${opId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawal-operators"] });
      toast({ title: "Logo mis à jour" });
    } catch (e: any) {
      toast({ title: "Erreur upload", description: e.message, variant: "destructive" });
    } finally {
      setUploadingLogoFor(null);
    }
  };

  const removeLogo = async (opId: number) => {
    const res = await fetch(`/api/admin/operator-logo/${opId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawal-operators"] });
      toast({ title: "Logo supprimé" });
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const filtered = filterCountry === "all" ? localOps : localOps.filter(o => o.country === filterCountry);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = filtered.findIndex(o => o.id === Number(active.id));
    const newIdx = filtered.findIndex(o => o.id === Number(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const newFiltered = arrayMove(filtered, oldIdx, newIdx);
    const filteredIds = new Set(filtered.map(o => o.id));
    let fi = 0;
    const newFull = localOps.map(op => filteredIds.has(op.id) ? newFiltered[fi++] : op);
    setLocalOps(newFull);
    try {
      await fetch("/api/admin/withdrawal-operators/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ updates: newFull.map((op, i) => ({ id: op.id, sortOrder: i })) }),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawal-operators"] });
    } catch {}
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-base font-semibold text-foreground">Opérateurs de retrait</h3>
        <div className="flex items-center gap-2">
          <Select value={filterCountry} onValueChange={setFilterCountry}>
            <SelectTrigger className="h-8 text-xs w-40" data-testid="select-filter-country">
              <SelectValue placeholder="Tous les pays" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les pays</SelectItem>
              {COUNTRIES_LIST.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={openCreate} className="gap-1" data-testid="button-add-operator">
            <Plus className="w-3 h-3" />Ajouter
          </Button>
        </div>
      </div>

      {opsLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Aucun opérateur configuré.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filtered.map(o => o.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {filtered.map((op) => (
                <SortableOpRow
                  key={op.id}
                  op={op}
                  onEdit={openEdit}
                  onDelete={id => deleteMutation.mutate(id)}
                  onToggle={toggleMaint}
                  onUploadLogo={uploadLogo}
                  onRemoveLogo={removeLogo}
                  uploadingFor={uploadingLogoFor}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Dialog open={opDialogOpen} onOpenChange={setOpDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingOp ? "Modifier l'opérateur" : "Nouvel opérateur"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Moov Money" data-testid="input-op-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger data-testid="select-op-type"><SelectValue /></SelectTrigger>
                  <SelectContent>{OPERATOR_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pays</Label>
                <Select value={form.country} onValueChange={v => setForm(f => ({ ...f, country: v }))}>
                  <SelectTrigger data-testid="select-op-country"><SelectValue /></SelectTrigger>
                  <SelectContent>{COUNTRIES_LIST.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Limite journalière (FCFA)</Label>
              <Input type="number" value={form.dailyLimit} onChange={e => setForm(f => ({ ...f, dailyLimit: Number(e.target.value) }))} data-testid="input-op-limit" />
            </div>
            <div className="space-y-2">
              <Label>Passerelle de paiement</Label>
              <Select value={form.gateway} onValueChange={v => setForm(f => ({ ...f, gateway: v }))}>
                <SelectTrigger data-testid="select-op-gateway"><SelectValue /></SelectTrigger>
                <SelectContent>{GATEWAYS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">La passerelle sélectionnée sera utilisée pour tous les paiements et retraits via cet opérateur, pour tous les marchands de ce pays.</p>
            </div>
            {form.gateway?.toLowerCase() === "omnipay" && (
              <div className="space-y-2">
                <Label>Code opérateur OmniPay</Label>
                <Input value={form.omnipayCode} onChange={e => setForm(f => ({ ...f, omnipayCode: e.target.value }))} placeholder="Ex: mtn, orange, moov, wave, mixx..." data-testid="input-op-omnipay-code" />
                <p className="text-xs text-muted-foreground">Code opérateur envoyé à OmniPay. Laisser vide pour laisser OmniPay détecter automatiquement via le numéro. Requis pour Wave (<code>wave</code>) et Mixx (<code>mixx</code>).</p>
              </div>
            )}
            {form.gateway?.toLowerCase() === "mbiyo" && (
              <div className="space-y-2">
                <Label>Code réseau Mbiyo</Label>
                <Input value={form.mbiyoCode} onChange={e => setForm(f => ({ ...f, mbiyoCode: e.target.value }))} placeholder="Ex: mtn, moov, wave, celtiis, orange..." data-testid="input-op-mbiyo-code" />
                <p className="text-xs text-muted-foreground">Code réseau exact attendu par Mbiyo pour les retraits (ex: <code>mtn</code>, <code>moov</code>, <code>wave</code>, <code>celtiis</code>). Obligatoire si la passerelle est Mbiyo.</p>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} data-testid="switch-op-active-form" />
              <Label>Actif</Label>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setOpDialogOpen(false)}>Annuler</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name || !form.country} data-testid="button-save-operator">
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {editingOp ? "Mettre à jour" : "Créer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminWithdrawalsPanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const { data: wdList = [], isLoading } = useAdminFetch("/api/admin/withdrawals", ["/api/admin/withdrawals"]);
  const { data: platformFlags, refetch: refetchFlags } = useQuery<{ withdrawalsDisabled: boolean; withdrawalMinAmount: number }>({
    queryKey: ["/api/public/platform-flags"],
    queryFn: () => fetch("/api/public/platform-flags").then(r => r.json()),
  });
  const [isTogglingWd, setIsTogglingWd] = useState(false);
  const [minAmountInput, setMinAmountInput] = useState("");
  const [isSavingMin, setIsSavingMin] = useState(false);

  const toggleWithdrawals = async (disabled: boolean) => {
    setIsTogglingWd(true);
    try {
      const res = await fetch("/api/admin/platform-flags", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ withdrawalsDisabled: disabled }),
      });
      if (!res.ok) throw new Error("Erreur");
      await refetchFlags();
      toast({ title: disabled ? "Retraits bloqués" : "Retraits réactivés", description: disabled ? "Les marchands ne peuvent plus effectuer de retraits." : "Les retraits sont de nouveau disponibles." });
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    } finally {
      setIsTogglingWd(false);
    }
  };

  const saveMinAmount = async () => {
    const val = parseInt(minAmountInput);
    if (isNaN(val) || val < 1) {
      toast({ title: "Montant invalide", description: "Entrez un nombre entier positif.", variant: "destructive" });
      return;
    }
    setIsSavingMin(true);
    try {
      const res = await fetch("/api/admin/platform-flags", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ withdrawalMinAmount: val }),
      });
      if (!res.ok) throw new Error("Erreur");
      await refetchFlags();
      setMinAmountInput("");
      toast({ title: "Minimum mis à jour", description: `Le retrait minimum est maintenant de ${val.toLocaleString("fr-FR")} FCFA.` });
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    } finally {
      setIsSavingMin(false);
    }
  };

  const [activeSubTab, setActiveSubTab] = useState<"requests" | "operators">("requests");
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedWd, setSelectedWd] = useState<any | null>(null);
  const [wdAction, setWdAction] = useState<"approve" | "reject">("approve");
  const [note, setNote] = useState("");
  const [searchWd, setSearchWd] = useState("");
  const [websiteFilterWd, setWebsiteFilterWd] = useState("");
  const [statusFilterWd, setStatusFilterWd] = useState("all");
  const [countryFilterWd, setCountryFilterWd] = useState("all");
  const [modeFilterWd, setModeFilterWd] = useState("all");

  const actionMutation = useMutation({
    mutationFn: async ({ id, action, note: n }: { id: number; action: "approve" | "reject"; note: string }) => {
      const res = await fetch(`/api/admin/withdrawals/${id}/${action}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ note: n }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals"] });
      const msg = vars.action === "approve"
        ? data.omnipayRef ? `Approuvé par Westpay (Réf: ${data.omnipayRef})` : "Reversement approuvé"
        : "Reversement rejeté (solde restitué)";
      toast({ title: msg });
      setNoteDialogOpen(false);
      setNote("");
      setSelectedWd(null);
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const openAction = (wd: any, action: "approve" | "reject") => {
    setSelectedWd(wd);
    setWdAction(action);
    setNote("");
    setNoteDialogOpen(true);
  };

  const statusBadge = (status: string) => {
    if (status === "pending") return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" />En attente</Badge>;
    if (status === "approved") return <Badge className="bg-green-500 gap-1"><CheckCircle className="w-3 h-3" />Approuvé</Badge>;
    if (status === "failed") return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Échoué</Badge>;
    return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Rejeté</Badge>;
  };

  const allWd = (wdList as any[]);
  const pending = allWd.filter(w => w.status === "pending");

  const filteredWd = allWd.filter((w) => {
    const term = searchWd.toLowerCase();
    const matchSearch = !term || w.merchantName?.toLowerCase().includes(term) || w.phone?.includes(term) || w.country?.toLowerCase().includes(term) || (w.operator || "").toLowerCase().includes(term) || (w.omnipayRef || "").toLowerCase().includes(term);
    const matchWebsite = !websiteFilterWd || (w.merchantWebsite || "").toLowerCase().includes(websiteFilterWd.toLowerCase());
    const matchStatus = statusFilterWd === "all" || w.status === statusFilterWd;
    const matchCountry = countryFilterWd === "all" || w.country === countryFilterWd;
    const matchMode = modeFilterWd === "all" || w.withdrawalMode === modeFilterWd;
    return matchSearch && matchWebsite && matchStatus && matchCountry && matchMode;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Reversements (Retraits Marchands)</h2>
        {pending.length > 0 && <Badge className="bg-orange-500">{pending.length} en attente</Badge>}
      </div>

      {/* Contrôle global des retraits */}
      <div className={`flex items-center justify-between gap-4 p-4 rounded-xl border-2 ${platformFlags?.withdrawalsDisabled ? "border-red-400 bg-red-50 dark:bg-red-950/20" : "border-green-300 bg-green-50 dark:bg-green-950/20"}`}>
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full shrink-0 ${platformFlags?.withdrawalsDisabled ? "bg-red-500" : "bg-green-500"}`} />
          <div>
            <p className="text-sm font-semibold text-foreground">
              {platformFlags?.withdrawalsDisabled ? "Retraits marchands bloqués" : "Retraits marchands actifs"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {platformFlags?.withdrawalsDisabled
                ? "Les marchands voient les opérateurs mais ne peuvent pas soumettre de retrait."
                : "Les marchands peuvent effectuer des retraits normalement."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isTogglingWd && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          <Switch
            checked={!platformFlags?.withdrawalsDisabled}
            onCheckedChange={(v) => toggleWithdrawals(!v)}
            disabled={isTogglingWd}
            data-testid="switch-withdrawals-enabled"
          />
        </div>
      </div>

      {/* Montant minimum de retrait */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-xl border-2 border-blue-200 bg-blue-50 dark:bg-blue-950/20">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-3 h-3 rounded-full shrink-0 bg-blue-500" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Montant minimum de retrait</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Actuel : <span className="font-bold text-blue-600">{(platformFlags?.withdrawalMinAmount ?? 200).toLocaleString("fr-FR")} FCFA</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="number"
            min="1"
            placeholder="Ex: 200"
            value={minAmountInput}
            onChange={e => setMinAmountInput(e.target.value)}
            className="w-28 px-3 py-1.5 text-sm rounded-lg border border-blue-300 bg-white dark:bg-gray-800 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
            data-testid="input-withdrawal-min-amount"
            onKeyDown={e => e.key === "Enter" && saveMinAmount()}
          />
          <button
            onClick={saveMinAmount}
            disabled={isSavingMin || !minAmountInput}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            data-testid="button-save-min-amount"
          >
            {isSavingMin ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Enregistrer
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeSubTab === "requests" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveSubTab("requests")} data-testid="tab-wd-requests">
          Demandes{pending.length > 0 && <Badge variant="secondary" className="ml-2 text-xs">{pending.length}</Badge>}
        </button>
        <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeSubTab === "operators" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveSubTab("operators")} data-testid="tab-wd-operators">
          Opérateurs
        </button>
      </div>

      {activeSubTab === "operators" && <WithdrawalOperatorsPanel />}

      {activeSubTab === "requests" && (
        <div className="space-y-4">
          {pending.length > 0 && (
            <Card className="border-orange-200 dark:border-orange-800">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base text-orange-600 dark:text-orange-400">Demandes en attente</CardTitle>
                  <Badge variant="secondary">{pending.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pending.map((wd) => {
                    const fees = wd.fees || 0;
                    const net = wd.amount - fees;
                    return (
                      <div key={wd.id} className="p-3 rounded border bg-muted/30 space-y-2" data-testid={`withdrawal-pending-${wd.id}`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{wd.merchantName}</span>
                              <span className="text-muted-foreground text-xs">#{wd.id}</span>
                              <Badge variant="outline" className="text-xs">{wd.withdrawalMode === "auto" ? "Auto" : "Manuel"}</Badge>
                            </div>
                            {wd.merchantWebsite && (
                              <a href={wd.merchantWebsite.startsWith("http") ? wd.merchantWebsite : `https://${wd.merchantWebsite}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">{wd.merchantWebsite}</a>
                            )}
                          </div>
                          <div className="flex gap-2 shrink-0">
                            {wd.omnipayRef ? (
                              <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-500 gap-1 h-8 px-3">
                                <Clock className="w-3 h-3" />En cours chez prestataire
                              </Badge>
                            ) : (
                              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1 h-8"
                                onClick={() => openAction(wd, "approve")} data-testid={`button-approve-wd-${wd.id}`}>
                                <CheckCircle className="w-3 h-3" />Valider le reversement
                              </Button>
                            )}
                            <Button size="sm" variant="destructive" className="gap-1 h-8"
                              onClick={() => openAction(wd, "reject")} data-testid={`button-reject-wd-${wd.id}`}>
                              <XCircle className="w-3 h-3" />Rejeter
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                          <div><span className="text-muted-foreground">Montant demandé :</span> <span className="font-semibold text-foreground">{wd.amount.toLocaleString("fr-FR")} FCFA</span></div>
                          <div><span className="text-muted-foreground">Pays :</span> <span className="font-medium text-foreground">{wd.country}</span></div>
                          {wd.operator && <div><span className="text-muted-foreground">Opérateur :</span> <span className="font-medium text-foreground">{wd.operator}</span></div>}
                          <div><span className="text-muted-foreground">N° réception :</span> <span className="font-medium text-foreground">{wd.phone}</span></div>
                          <div><span className="text-muted-foreground">Date :</span> <span>{new Date(wd.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-40">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-10" placeholder="Marchand, pays, numéro, réf Westpay..." value={searchWd} onChange={e => setSearchWd(e.target.value)} data-testid="input-search-wd" />
            </div>
            <div className="relative flex-1 min-w-40">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-10" placeholder="Site web..." value={websiteFilterWd} onChange={e => setWebsiteFilterWd(e.target.value)} data-testid="input-filter-wd-website" />
            </div>
            <Select value={statusFilterWd} onValueChange={setStatusFilterWd}>
              <SelectTrigger className="w-36" data-testid="select-filter-wd-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="approved">Approuvé</SelectItem>
                <SelectItem value="rejected">Rejeté</SelectItem>
                <SelectItem value="failed">Échoué</SelectItem>
              </SelectContent>
            </Select>
            <Select value={countryFilterWd} onValueChange={setCountryFilterWd}>
              <SelectTrigger className="w-40" data-testid="select-filter-wd-country"><SelectValue placeholder="Pays" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous pays</SelectItem>
                {COUNTRIES_LIST.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={modeFilterWd} onValueChange={setModeFilterWd}>
              <SelectTrigger className="w-32" data-testid="select-filter-wd-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous modes</SelectItem>
                <SelectItem value="auto">Automatique</SelectItem>
                <SelectItem value="manual">Manuel</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Tous les reversements</CardTitle>
                <Badge variant="secondary">{filteredWd.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
              ) : filteredWd.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun reversement</p>
              ) : (
                <div className="space-y-2">
                    {filteredWd.map((wd) => {
                      const fees = wd.fees || 0;
                      const net = wd.amount - fees;
                      return (
                        <div key={wd.id} className="p-3 rounded border bg-muted/20 space-y-2" data-testid={`withdrawal-row-${wd.id}`}>
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-foreground">{wd.merchantName}</span>
                                <span className="text-muted-foreground text-xs">#{wd.id}</span>
                                <Badge variant="outline" className="text-xs">{wd.withdrawalMode === "auto" ? "Auto" : "Manuel"}</Badge>
                                {statusBadge(wd.status)}
                              </div>
                              {wd.merchantWebsite && (
                                <a href={wd.merchantWebsite.startsWith("http") ? wd.merchantWebsite : `https://${wd.merchantWebsite}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-0.5">
                                  <Globe className="w-3 h-3" />{wd.merchantWebsite}
                                </a>
                              )}
                            </div>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setSelectedWd(wd); setDetailDialogOpen(true); }} data-testid={`button-wd-detail-${wd.id}`}>
                              <Eye className="w-3 h-3 mr-1" />Détails
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5 text-xs">
                            <div><span className="text-muted-foreground">Montant :</span> <span className="font-semibold text-foreground">{wd.amount.toLocaleString("fr-FR")} FCFA</span></div>
                            {fees > 0 && <div><span className="text-muted-foreground">Frais :</span> <span className="text-orange-500">{fees.toLocaleString("fr-FR")} FCFA</span></div>}
                            {fees > 0 && <div><span className="text-muted-foreground">Net envoyé :</span> <span className="font-semibold text-green-600">{net.toLocaleString("fr-FR")} FCFA</span></div>}
                            <div><span className="text-muted-foreground">Pays :</span> {wd.country}</div>
                            {wd.operator && <div><span className="text-muted-foreground">Opérateur :</span> {wd.operator}</div>}
                            <div><span className="text-muted-foreground">N° réception :</span> <span className="font-medium">{wd.phone}</span></div>
                            <div className="col-span-2"><span className="text-muted-foreground">Date :</span> {new Date(wd.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                          </div>
                          {wd.omnipayRef && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs text-muted-foreground">Réf Westpay :</span>
                              <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">{wd.omnipayRef}</code>
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { navigator.clipboard.writeText(wd.omnipayRef!); }} title="Copier la référence" data-testid={`button-copy-ref-${wd.id}`}>
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                          {wd.adminNote && <p className="text-xs italic text-muted-foreground">Note : {wd.adminNote}</p>}
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Détails du reversement #{selectedWd?.id}</DialogTitle>
          </DialogHeader>
          {selectedWd && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted rounded p-3">
                  <p className="text-xs text-muted-foreground mb-1">Marchand</p>
                  <p className="font-semibold text-sm">{selectedWd.merchantName}</p>
                  {selectedWd.merchantWebsite && <a href={selectedWd.merchantWebsite.startsWith("http") ? selectedWd.merchantWebsite : `https://${selectedWd.merchantWebsite}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">{selectedWd.merchantWebsite}</a>}
                </div>
                <div className="bg-muted rounded p-3">
                  <p className="text-xs text-muted-foreground mb-1">Statut</p>
                  {selectedWd && statusBadge(selectedWd.status)}
                  <p className="text-xs mt-1">{selectedWd.withdrawalMode === "auto" ? "Traitement auto" : "Traitement manuel"}</p>
                </div>
              </div>
              <div className="rounded border p-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Montant demandé</span><span className="font-semibold">{selectedWd.amount.toLocaleString("fr-FR")} FCFA</span></div>
                {(selectedWd.fees || 0) > 0 && <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Frais de traitement</span><span className="text-orange-500">- {(selectedWd.fees || 0).toLocaleString("fr-FR")} FCFA</span></div>
                  <div className="flex justify-between border-t pt-2"><span className="font-medium">Net envoyé</span><span className="font-bold text-green-600">{(selectedWd.amount - (selectedWd.fees || 0)).toLocaleString("fr-FR")} FCFA</span></div>
                </>}
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex gap-2"><span className="text-muted-foreground w-32 shrink-0">Pays :</span><span className="font-medium">{selectedWd.country}</span></div>
                {selectedWd.operator && <div className="flex gap-2"><span className="text-muted-foreground w-32 shrink-0">Mode paiement :</span><span className="font-medium">{selectedWd.operator}</span></div>}
                <div className="flex gap-2"><span className="text-muted-foreground w-32 shrink-0">N° réception :</span><span className="font-medium font-mono">{selectedWd.phone}</span></div>
                <div className="flex gap-2"><span className="text-muted-foreground w-32 shrink-0">Date :</span><span>{new Date(selectedWd.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>
                {selectedWd.processedAt && <div className="flex gap-2"><span className="text-muted-foreground w-32 shrink-0">Traité le :</span><span>{new Date(selectedWd.processedAt).toLocaleString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>}
                {selectedWd.omnipayRef && (
                  <div className="flex gap-2 items-center">
                    <span className="text-muted-foreground w-32 shrink-0">Réf Westpay :</span>
                    <code className="font-mono text-xs bg-muted px-2 py-1 rounded flex-1 break-all">{selectedWd.omnipayRef}</code>
                    <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => { navigator.clipboard.writeText(selectedWd.omnipayRef!); }} data-testid="button-copy-omnipayref-dialog">
                      <Copy className="w-3 h-3 mr-1" />Copier
                    </Button>
                  </div>
                )}
                {selectedWd.adminNote && <div className="flex gap-2"><span className="text-muted-foreground w-32 shrink-0">Note :</span><span className="italic">{selectedWd.adminNote}</span></div>}
              </div>
              {selectedWd.status === "pending" && (
                <div className="flex gap-2 pt-2">
                  {selectedWd.omnipayRef ? (
                    <div className="flex-1 text-xs text-yellow-600 border border-yellow-500 rounded px-3 py-2 flex items-center gap-2">
                      <Clock className="w-3 h-3 shrink-0" />
                      Déjà envoyé au prestataire — en attente de confirmation automatique
                    </div>
                  ) : (
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1 flex-1"
                      onClick={() => { setDetailDialogOpen(false); openAction(selectedWd, "approve"); }}>
                      <CheckCircle className="w-3 h-3" />Valider le reversement
                    </Button>
                  )}
                  <Button size="sm" variant="destructive" className="gap-1 flex-1"
                    onClick={() => { setDetailDialogOpen(false); openAction(selectedWd, "reject"); }}>
                    <XCircle className="w-3 h-3" />Rejeter
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{wdAction === "approve" ? "Valider le reversement" : "Rejeter le reversement"}</DialogTitle>
          </DialogHeader>
          {selectedWd && (
            <div className="space-y-4">
              <div className="p-3 rounded bg-muted text-sm space-y-1">
                <p><span className="text-muted-foreground">Marchand :</span> <span className="font-medium">{selectedWd.merchantName}</span></p>
                {selectedWd.merchantWebsite && <p><span className="text-muted-foreground">Site :</span> <span className="text-blue-500">{selectedWd.merchantWebsite}</span></p>}
                <p><span className="text-muted-foreground">Montant :</span> <span className="font-semibold">{selectedWd.amount.toLocaleString("fr-FR")} FCFA</span></p>
                <p><span className="text-muted-foreground">Pays :</span> {selectedWd.country}</p>
                {selectedWd.operator && <p><span className="text-muted-foreground">Opérateur :</span> {selectedWd.operator}</p>}
                <p><span className="text-muted-foreground">N° réception :</span> <span className="font-mono">{selectedWd.phone}</span></p>
                <p><span className="text-muted-foreground">Date :</span> {new Date(selectedWd.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              {wdAction === "approve" && (
                <p className="text-xs text-green-700 bg-green-50 dark:bg-green-950 dark:text-green-300 p-2 rounded">Le paiement sera traité automatiquement par Westpay.</p>
              )}
              {wdAction === "reject" && (
                <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950 p-2 rounded">Le solde sera restitué au marchand en cas de rejet.</p>
              )}
              <div className="space-y-2">
                <Label>Note (optionnelle)</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder={wdAction === "approve" ? "Ex: Paiement effectué" : "Ex: Informations insuffisantes"}
                  data-testid="input-wd-note" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setNoteDialogOpen(false)}>Annuler</Button>
                <Button
                  onClick={() => actionMutation.mutate({ id: selectedWd.id, action: wdAction, note })}
                  disabled={actionMutation.isPending}
                  className={wdAction === "approve" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                  variant={wdAction === "reject" ? "destructive" : "default"}
                  data-testid="button-confirm-wd-action"
                >
                  {actionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {wdAction === "approve" ? "Valider et envoyer" : "Confirmer le rejet"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettingsPanel() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { token } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isChanging, setIsChanging] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [groupIdInput, setGroupIdInput] = useState("");
  const [isSavingGroup, setIsSavingGroup] = useState(false);

  const { data: profile } = useAdminFetch("/api/admin/profile", ["/api/admin/profile"]);
  const { data: tgSettings, refetch: refetchTg } = useAdminFetch("/api/admin/telegram/settings", ["/api/admin/telegram/settings"]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsChanging(true);
    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      toast({ title: "Mot de passe modifie" });
      setCurrentPassword(""); setNewPassword("");
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">Parametres</h2>

      <Card>
        <CardHeader><CardTitle className="text-base">Informations du compte</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">Email: <span className="text-foreground">{user?.email}</span></p>
          <p className="text-sm text-muted-foreground">Role: <Badge variant="default">Administrateur</Badge></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Changer le mot de passe</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label>Mot de passe actuel</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required data-testid="input-current-password" />
            </div>
            <div className="space-y-2">
              <Label>Nouveau mot de passe</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required data-testid="input-new-password" />
            </div>
            <Button type="submit" disabled={isChanging} data-testid="button-change-password">
              {isChanging ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Modifier
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-500" />
            Configuration Bot Telegram
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pour enregistrer votre groupe admin dans le bot, envoyez cette commande dans le groupe :
          </p>
          <div className="bg-muted rounded p-3 space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Commande à envoyer dans le groupe :</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm break-all">
                /setgroup {showApiKey ? (profile as any)?.apiKey || "..." : "••••••••••••••••"}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowApiKey(!showApiKey)}
                data-testid="button-toggle-apikey"
              >
                {showApiKey ? <Lock className="w-4 h-4" /> : <Key className="w-4 h-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  const key = (profile as any)?.apiKey;
                  if (key) { navigator.clipboard.writeText(`/setgroup ${key}`); toast({ title: "Commande copiée !" }); }
                }}
                data-testid="button-copy-apikey"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>1️⃣ Ajoutez le bot à votre groupe Telegram admin</p>
            <p>2️⃣ Copiez la commande ci-dessus et envoyez-la dans le groupe</p>
            <p>3️⃣ Le bot confirmera l'enregistrement</p>
          </div>
        </CardContent>
      </Card>

      <AdminAccountsCard token={token} currentUserId={(user as any)?.id} />

      <TotpCard token={token} />

      <AIKeysCard token={token} />

      <SupportContactsCard token={token} />

      <Card>
        <CardContent className="p-4">
          <Button
            variant="destructive"
            onClick={() => { logout(); setLocation("/"); }}
            data-testid="button-admin-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />Se deconnecter
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function TotpCard({ token }: { token: string | null }) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<"idle" | "setup" | "disable">("idle");
  const [qrCode, setQrCode] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [verifyCode, setVerifyCode] = useState<string>("");
  const [disableCode, setDisableCode] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const { data: totpStatus, refetch: refetchStatus } = useQuery<{ totpEnabled: boolean }>({
    queryKey: ["/api/admin/2fa/status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/2fa/status", { headers: { Authorization: `Bearer ${token}` } });
      return res.json();
    },
  });

  const handleStartSetup = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/2fa/setup", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setVerifyCode("");
      setPhase("setup");
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyCode.length !== 6) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ secret, code: verifyCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      toast({ title: "Google Authenticator activé", description: "Le 2FA TOTP est maintenant actif sur votre compte." });
      setPhase("idle");
      setQrCode(""); setSecret(""); setVerifyCode("");
      refetchStatus();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
      setVerifyCode("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disableCode.length !== 6) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: disableCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      toast({ title: "Google Authenticator désactivé" });
      setPhase("idle");
      setDisableCode("");
      refetchStatus();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
      setDisableCode("");
    } finally {
      setIsLoading(false);
    }
  };

  const totpEnabled = totpStatus?.totpEnabled ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-violet-500" />
          Google Authenticator (TOTP 2FA)
          {totpEnabled && <Badge className="ml-2 bg-green-500 text-white text-xs">Activé</Badge>}
          {!totpEnabled && <Badge variant="outline" className="ml-2 text-xs text-muted-foreground">Désactivé</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {phase === "idle" && (
          <>
            <p className="text-sm text-muted-foreground">
              {totpEnabled
                ? "Google Authenticator est actif. À chaque connexion, un code TOTP vous sera demandé."
                : "Activez Google Authenticator pour sécuriser votre compte avec un code rotatif toutes les 30 secondes."}
            </p>
            <div className="flex gap-2">
              {!totpEnabled && (
                <Button
                  onClick={handleStartSetup}
                  disabled={isLoading}
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                  data-testid="button-totp-setup"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Smartphone className="w-4 h-4 mr-2" />}
                  Configurer Google Authenticator
                </Button>
              )}
              {totpEnabled && (
                <Button
                  variant="outline"
                  onClick={() => { setPhase("disable"); setDisableCode(""); }}
                  className="border-red-200 text-red-600 hover:bg-red-50"
                  data-testid="button-totp-disable-start"
                >
                  Désactiver le 2FA TOTP
                </Button>
              )}
            </div>
          </>
        )}

        {phase === "setup" && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground space-y-1">
              <p>1️⃣ Installez <strong>Google Authenticator</strong> ou <strong>Authy</strong> sur votre téléphone</p>
              <p>2️⃣ Scannez le QR code ci-dessous</p>
              <p>3️⃣ Entrez le code à 6 chiffres pour confirmer</p>
            </div>
            {qrCode && (
              <div className="flex flex-col items-center gap-3 p-4 bg-white border rounded-xl">
                <img src={qrCode} alt="QR Code TOTP" className="w-48 h-48" data-testid="img-totp-qr" />
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Ou entrez ce code manuellement :</p>
                  <code className="text-xs font-mono bg-muted px-2 py-1 rounded break-all select-all">{secret}</code>
                </div>
              </div>
            )}
            <form onSubmit={handleEnable} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Code de vérification (6 chiffres)</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="text-center text-lg font-mono tracking-widest"
                  data-testid="input-totp-verify"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={isLoading || verifyCode.length !== 6} className="bg-violet-600 hover:bg-violet-700 text-white" data-testid="button-totp-confirm">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Activer le 2FA
                </Button>
                <Button type="button" variant="ghost" onClick={() => { setPhase("idle"); setQrCode(""); setSecret(""); }} data-testid="button-totp-cancel">
                  Annuler
                </Button>
              </div>
            </form>
          </div>
        )}

        {phase === "disable" && (
          <form onSubmit={handleDisable} className="space-y-4">
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-red-50 border border-red-100">
              <Shield className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">Entrez votre code Google Authenticator pour désactiver le 2FA</p>
            </div>
            <div className="space-y-1.5">
              <Label>Code TOTP actuel</Label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="text-center text-lg font-mono tracking-widest"
                autoFocus
                data-testid="input-totp-disable-code"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="destructive" disabled={isLoading || disableCode.length !== 6} data-testid="button-totp-disable-confirm">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Confirmer la désactivation
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setPhase("idle"); setDisableCode(""); }} data-testid="button-totp-disable-cancel">
                Annuler
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function AIKeysCard({ token }: { token: string | null }) {
  const { toast } = useToast();
  const { data: status, refetch } = useQuery<{
    openai: string | null; groq: string | null; gemini: string | null;
    openaiConfigured: boolean; groqConfigured: boolean; geminiConfigured: boolean;
    openaiFromEnv: boolean; groqFromEnv: boolean; geminiFromEnv: boolean;
  }>({
    queryKey: ["/api/admin/ai-keys"],
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch("/api/admin/ai-keys", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    enabled: !!token,
  });

  const [openai, setOpenai] = useState("");
  const [groq, setGroq] = useState("");
  const [gemini, setGemini] = useState("");
  const [showOpenai, setShowOpenai] = useState(false);
  const [showGroq, setShowGroq] = useState(false);
  const [showGemini, setShowGemini] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string; source?: string | null } | null>>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const body: Record<string, string> = {};
      if (openai !== "") body.openai = openai.trim();
      if (groq !== "") body.groq = groq.trim();
      if (gemini !== "") body.gemini = gemini.trim();
      if (Object.keys(body).length === 0) {
        toast({ title: "Rien à enregistrer", description: "Remplissez au moins un champ.", variant: "destructive" });
        return;
      }
      const res = await fetch("/api/admin/ai-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      await refetch();
      setOpenai(""); setGroq(""); setGemini("");
      toast({ title: "Clés IA enregistrées", description: "Le bot utilisera ces clés en priorité." });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteKey = async (provider: "openai" | "groq" | "gemini") => {
    try {
      const res = await fetch("/api/admin/ai-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [provider]: "" }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      await refetch();
      toast({ title: "Clé supprimée", description: `La clé ${provider} a été effacée de la base.` });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  const handleTest = async (provider: "openai" | "groq" | "gemini") => {
    setTestingProvider(provider);
    setTestResults(prev => ({ ...prev, [provider]: null }));
    try {
      const res = await fetch("/api/admin/ai-keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      setTestResults(prev => ({ ...prev, [provider]: data }));
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [provider]: { success: false, message: err.message } }));
    } finally {
      setTestingProvider(null);
    }
  };

  const PROVIDERS = [
    {
      id: "openai" as const,
      label: "🟢 OpenAI",
      model: "gpt-4o-mini",
      placeholder: "sk-proj-...",
      link: "https://platform.openai.com/api-keys",
      linkLabel: "platform.openai.com/api-keys",
      value: openai,
      setValue: setOpenai,
      show: showOpenai,
      setShow: setShowOpenai,
      configured: status?.openaiConfigured ?? false,
      currentKey: status?.openai ?? null,
      envVar: "OPENAI_API_KEY",
    },
    {
      id: "groq" as const,
      label: "🟡 Groq",
      model: "llama-3.1-8b-instant · Gratuit",
      placeholder: "gsk_...",
      link: "https://console.groq.com/keys",
      linkLabel: "console.groq.com/keys",
      value: groq,
      setValue: setGroq,
      show: showGroq,
      setShow: setShowGroq,
      configured: status?.groqConfigured ?? false,
      currentKey: status?.groq ?? null,
      envVar: "GROQ_API_KEY",
    },
    {
      id: "gemini" as const,
      label: "🔵 Gemini",
      model: "gemini-1.5-flash · Gratuit",
      placeholder: "AIza...",
      link: "https://aistudio.google.com/app/apikey",
      linkLabel: "aistudio.google.com/app/apikey",
      value: gemini,
      setValue: setGemini,
      show: showGemini,
      setShow: setShowGemini,
      configured: status?.geminiConfigured ?? false,
      currentKey: status?.gemini ?? null,
      envVar: "GEMINI_API_KEY",
    },
  ];

  const testResult = (id: string) => testResults[id];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <span className="text-lg">🤖</span>
          Clés API — Intelligence Artificielle (Bot Support)
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Le bot essaie les providers dans l'ordre : OpenAI → Groq → Gemini. Priorité : variable d'environnement &gt; clé DB.
        </p>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-800 space-y-1">
          <p className="font-semibold">Variables d'environnement prises en charge</p>
          <p>Vous pouvez configurer les clés directement dans les secrets Replit (ou sur votre serveur) :</p>
          <div className="font-mono space-y-0.5 mt-1">
            <p>OPENAI_API_KEY=sk-proj-...</p>
            <p>GROQ_API_KEY=gsk_...</p>
            <p>GEMINI_API_KEY=AIza...</p>
          </div>
          <p className="text-blue-600">Si une variable d'environnement est définie, elle est utilisée en priorité sur la clé enregistrée ici.</p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-4">
            {PROVIDERS.map((p) => {
              const result = testResult(p.id);
              const isTesting = testingProvider === p.id;
              return (
                <div key={p.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{p.label}</span>
                      <span className="text-xs text-muted-foreground">{p.model}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.configured ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {p.configured ? "Configurée" : "Non configurée"}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!p.configured || isTesting}
                        onClick={() => handleTest(p.id)}
                        className="h-6 text-xs px-2"
                        data-testid={`button-test-${p.id}`}
                      >
                        {isTesting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
                        Tester
                      </Button>
                    </div>
                  </div>

                  {result && (
                    <div className={`flex items-start gap-2 p-2 rounded text-xs ${result.success ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"}`}>
                      {result.success ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                      <span>{result.message}{result.source ? ` (source: ${result.source === "env" ? "variable d'environnement" : "base de données"})` : ""}</span>
                    </div>
                  )}

                  {p.currentKey && (
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground font-mono flex-1">Clé actuelle : {p.currentKey}</p>
                      <button
                        type="button"
                        onClick={() => handleDeleteKey(p.id)}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors"
                        title="Supprimer cette clé de la base"
                        data-testid={`button-delete-${p.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="relative">
                    <Input
                      type={p.show ? "text" : "password"}
                      value={p.value}
                      onChange={(e) => p.setValue(e.target.value)}
                      placeholder={`${p.placeholder} (nouvelle clé)`}
                      className="pr-10 text-sm"
                      data-testid={`input-ai-${p.id}`}
                    />
                    <button type="button" onClick={() => p.setShow(!p.show)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {p.show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Obtenir une clé : <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{p.linkLabel}</a>
                    {" · "}Env secret : <code className="bg-muted px-1 rounded">{p.envVar}</code>
                  </p>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button
              type="submit"
              disabled={isSaving || (!openai && !groq && !gemini)}
              data-testid="button-save-ai-keys"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Enregistrer les clés
            </Button>
            <p className="text-xs text-muted-foreground">Remplissez un ou plusieurs champs puis cliquez Enregistrer.</p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SupportContactsCard({ token }: { token: string | null }) {
  const { toast } = useToast();
  const { data: contacts, refetch } = useQuery<{
    telegram1: string; telegram2: string; telegram3: string; telegram4: string;
  }>({
    queryKey: ["/api/public/support-contacts"],
    staleTime: 0,
  });

  const [tg1, setTg1] = useState("");
  const [tg2, setTg2] = useState("");
  const [tg3, setTg3] = useState("");
  const [tg4, setTg4] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (contacts) {
      setTg1(contacts.telegram1 || "");
      setTg2(contacts.telegram2 || "");
      setTg3(contacts.telegram3 || "");
      setTg4(contacts.telegram4 || "");
    }
  }, [contacts]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/support-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ telegram1: tg1, telegram2: tg2, telegram3: tg3, telegram4: tg4 }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      queryClient.invalidateQueries({ queryKey: ["/api/public/support-contacts"] });
      await refetch();
      toast({ title: "Contacts mis à jour" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-500" />
          Contacts Support Telegram (affichés sur le dashboard marchand)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Telegram 1</Label>
              <Input value={tg1} onChange={(e) => setTg1(e.target.value)} placeholder="@Atfchalvt" data-testid="input-support-tg1" />
            </div>
            <div className="space-y-2">
              <Label>Telegram 2</Label>
              <Input value={tg2} onChange={(e) => setTg2(e.target.value)} placeholder="@geeorbotpay" data-testid="input-support-tg2" />
            </div>
            <div className="space-y-2">
              <Label>Telegram 3</Label>
              <Input value={tg3} onChange={(e) => setTg3(e.target.value)} placeholder="@pankeyrobotpay" data-testid="input-support-tg3" />
            </div>
            <div className="space-y-2">
              <Label>Telegram 4</Label>
              <Input value={tg4} onChange={(e) => setTg4(e.target.value)} placeholder="@astapay" data-testid="input-support-tg4" />
            </div>
          </div>
          <Button type="submit" disabled={isSaving} data-testid="button-save-support-contacts">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Enregistrer
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AdminAccountsCard({ token, currentUserId }: { token: string | null; currentUserId: number }) {
  const { toast } = useToast();
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showForm, setShowForm] = useState(false);

  const { data: adminList = [], refetch } = useQuery<{ id: number; email: string; createdAt: string }[]>({
    queryKey: ["/api/admin/admins"],
    queryFn: async () => {
      const res = await fetch("/api/admin/admins", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/create-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: newEmail, password: newPassword }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      refetch();
      setNewEmail(""); setNewPassword(""); setShowForm(false);
      toast({ title: "Compte administrateur créé" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/delete-admin/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json()).message);
    },
    onSuccess: () => { refetch(); toast({ title: "Compte supprimé" }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" />Comptes administrateurs
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)} data-testid="button-toggle-create-admin">
            <Plus className="w-3 h-3 mr-1" />Nouveau admin
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/40">
            <p className="text-sm font-medium">Créer un nouveau compte</p>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" placeholder="admin@exemple.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} data-testid="input-new-admin-email" />
            </div>
            <div className="space-y-2">
              <Label>Mot de passe</Label>
              <Input type="password" placeholder="Min. 6 caractères" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} data-testid="input-new-admin-password" />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !newEmail || newPassword.length < 6} data-testid="button-submit-create-admin">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                Créer le compte
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {adminList.map((admin) => (
            <div key={admin.id} className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-card" data-testid={`row-admin-${admin.id}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" data-testid={`text-admin-email-${admin.id}`}>{admin.email}</p>
                <p className="text-xs text-muted-foreground">Depuis le {new Date(admin.createdAt).toLocaleDateString("fr-FR")}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {admin.id === currentUserId ? (
                  <Badge variant="default" className="text-xs">Vous</Badge>
                ) : (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={() => { if (confirm(`Supprimer le compte ${admin.email} ?`)) deleteMutation.mutate(admin.id); }}
                    data-testid={`button-delete-admin-${admin.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const SUPPORTED_COUNTRIES = [
  "Togo", "Benin", "Cote d'Ivoire", "Senegal", "Mali",
  "Burkina Faso", "Cameroun", "Congo Brazzaville", "Gabon", "Congo RDC", "Guinee",
];

const CRYPTO_WD_STATUS_LABELS: Record<string, { bg: string; color: string; label: string }> = {
  pending:    { bg: "#e3f2fd", color: "#1976d2", label: "En attente" },
  processing: { bg: "#fff3e0", color: "#fb8c00", label: "En cours" },
  completed:  { bg: "#e8f5e9", color: "#2e7d32", label: "Complété" },
  rejected:   { bg: "#ffebee", color: "#c62828", label: "Rejeté" },
};

function CryptoWithdrawalsAdminPanel() {
  const { data: withdrawals = [], isLoading, refetch } = useAdminFetch(
    "/api/admin/crypto/withdrawals",
    ["/api/admin/crypto/withdrawals"]
  );
  const { data: merchantsData = [] } = useAdminFetch("/api/admin/merchants", ["/api/admin/merchants"]);
  const { token } = useAuth();
  const { toast } = useToast();

  const [updating, setUpdating] = useState<number | null>(null);
  const [noteModal, setNoteModal] = useState<{ id: number; status: string } | null>(null);
  const [adminNote, setAdminNote] = useState("");

  const merchantMap = (merchantsData as any[]).reduce((acc: Record<number, string>, m: any) => {
    acc[m.id] = m.businessName || m.email;
    return acc;
  }, {});

  const handleUpdate = async (id: number, status: string, note?: string) => {
    setUpdating(id);
    try {
      const res = await fetch(`/api/admin/crypto/withdrawals/${id}`, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status, adminNote: note }),
      });
      if (!res.ok) throw new Error("Erreur");
      refetch();
      toast({ title: `Retrait mis à jour : ${status}` });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setUpdating(null);
      setNoteModal(null);
    }
  };

  const wds = (withdrawals as any[]).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Retraits Crypto</h2>
          <p className="text-sm text-muted-foreground">Gérez les demandes de retrait crypto des marchands.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} data-testid="btn-refresh-crypto-withdrawals">
          Actualiser
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Chargement...</div>
      ) : wds.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">Aucune demande de retrait crypto.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl overflow-hidden border">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Marchand</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Crypto</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Brut demandé</th>
                  <th className="text-left px-4 py-3 font-semibold" style={{ color: "#dc2626" }}>Frais (5%)</th>
                  <th className="text-left px-4 py-3 font-semibold" style={{ color: "#166534" }}>À envoyer</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Adresse</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Réseau</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Statut</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-background">
                {wds.map((wr: any, idx: number) => {
                  const s = CRYPTO_WD_STATUS_LABELS[wr.status] || CRYPTO_WD_STATUS_LABELS["pending"];
                  return (
                    <tr key={wr.id} style={{ borderTop: idx > 0 ? "1px solid hsl(var(--border))" : "none" }} data-testid={`row-admin-wd-${wr.id}`}>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(wr.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-3 font-semibold">{merchantMap[wr.merchantId] || `#${wr.merchantId}`}</td>
                      <td className="px-4 py-3 font-bold text-amber-500">{wr.currency}</td>
                      <td className="px-4 py-3 font-semibold">{parseFloat(wr.amount).toFixed(6)}</td>
                      <td className="px-4 py-3 font-mono" style={{ color: "#dc2626" }}>
                        −{wr.feeAmount ? parseFloat(wr.feeAmount).toFixed(6) : (parseFloat(wr.amount) * 0.05).toFixed(6)}
                      </td>
                      <td className="px-4 py-3 font-bold font-mono" style={{ color: "#166534" }}>
                        {wr.netAmount ? parseFloat(wr.netAmount).toFixed(6) : (parseFloat(wr.amount) * 0.95).toFixed(6)}
                      </td>
                      <td className="px-4 py-3 font-mono max-w-[120px] truncate text-muted-foreground" title={wr.walletAddress}>
                        {wr.walletAddress.slice(0, 8)}...{wr.walletAddress.slice(-6)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{wr.network || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full font-bold text-xs" style={{ background: s.bg, color: s.color }}>
                          {s.label}
                        </span>
                        {wr.adminNote && <p className="text-xs text-muted-foreground mt-1">{wr.adminNote}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {wr.status === "pending" && (
                          <div className="flex gap-1 flex-wrap">
                            <button
                              onClick={() => handleUpdate(wr.id, "processing")}
                              disabled={updating === wr.id}
                              className="text-xs px-2 py-1 rounded font-semibold"
                              style={{ background: "#fff3e0", color: "#fb8c00" }}
                              data-testid={`btn-process-wd-${wr.id}`}
                            >
                              En cours
                            </button>
                            <button
                              onClick={() => { setNoteModal({ id: wr.id, status: "completed" }); setAdminNote(""); }}
                              disabled={updating === wr.id}
                              className="text-xs px-2 py-1 rounded font-semibold"
                              style={{ background: "#e8f5e9", color: "#2e7d32" }}
                              data-testid={`btn-complete-wd-${wr.id}`}
                            >
                              Complété
                            </button>
                            <button
                              onClick={() => { setNoteModal({ id: wr.id, status: "rejected" }); setAdminNote(""); }}
                              disabled={updating === wr.id}
                              className="text-xs px-2 py-1 rounded font-semibold"
                              style={{ background: "#ffebee", color: "#c62828" }}
                              data-testid={`btn-reject-wd-${wr.id}`}
                            >
                              Rejeter
                            </button>
                          </div>
                        )}
                        {wr.status === "processing" && (
                          <div className="flex gap-1 flex-wrap">
                            <button
                              onClick={() => { setNoteModal({ id: wr.id, status: "completed" }); setAdminNote(""); }}
                              disabled={updating === wr.id}
                              className="text-xs px-2 py-1 rounded font-semibold"
                              style={{ background: "#e8f5e9", color: "#2e7d32" }}
                              data-testid={`btn-complete-wd-processing-${wr.id}`}
                            >
                              Marquer complété
                            </button>
                            <button
                              onClick={() => { setNoteModal({ id: wr.id, status: "rejected" }); setAdminNote(""); }}
                              disabled={updating === wr.id}
                              className="text-xs px-2 py-1 rounded font-semibold"
                              style={{ background: "#ffebee", color: "#c62828" }}
                              data-testid={`btn-reject-wd-processing-${wr.id}`}
                            >
                              Rejeter
                            </button>
                          </div>
                        )}
                        {(wr.status === "completed" || wr.status === "rejected") && (
                          <span className="text-xs text-muted-foreground">—</span>
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

      {/* Modal note admin */}
      {noteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setNoteModal(null)}
        >
          <div
            className="rounded-2xl p-6 w-full max-w-sm space-y-4 mx-4 bg-background border"
            onClick={e => e.stopPropagation()}
            data-testid="modal-admin-wd-note"
          >
            <h3 className="font-bold">
              {noteModal.status === "completed" ? "Marquer comme complété" : "Rejeter le retrait"}
            </h3>
            <div>
              <label className="block text-xs font-semibold mb-1 text-muted-foreground">Note admin (optionnel)</label>
              <textarea
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                placeholder="Hash de transaction, raison du rejet..."
                rows={3}
                className="w-full text-sm px-3 py-2 rounded-lg border bg-background"
                data-testid="input-admin-wd-note"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setNoteModal(null)}
                className="flex-1 py-2 rounded-lg text-sm font-semibold bg-muted text-muted-foreground"
              >
                Annuler
              </button>
              <button
                onClick={() => handleUpdate(noteModal.id, noteModal.status, adminNote)}
                disabled={updating === noteModal.id}
                className="flex-1 py-2 rounded-lg text-sm font-bold"
                style={{
                  background: noteModal.status === "completed" ? "#2e7d32" : "#c62828",
                  color: "#fff"
                }}
                data-testid="btn-confirm-admin-wd-action"
              >
                {updating === noteModal.id ? "Mise à jour..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type CryptoAggType = {
  id: number;
  name: string;
  type: string;
  apiKey: string;
  payoutApiKey?: string | null;
  callbackKey?: string | null;
  active: boolean;
  createdAt: string;
  countries: { id: number; aggregatorId: number; country: string; active: boolean }[];
  assignedMerchants: { id: number; aggregatorId: number; merchantId: number; active: boolean }[];
};

function CryptoAggPanel() {
  const { token } = useAuth();
  const { toast } = useToast();

  const { data: aggregators = [], isLoading, refetch } = useAdminFetch(
    "/api/admin/crypto-aggregators",
    ["/api/admin/crypto-aggregators"]
  );
  const { data: allMerchants = [] } = useAdminFetch("/api/admin/merchants", ["/api/admin/merchants"]);

  const [addOpen, setAddOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [selectedAgg, setSelectedAgg] = useState<CryptoAggType | null>(null);
  const [configTab, setConfigTab] = useState<"general" | "merchants">("general");
  const [merchantSearch, setMerchantSearch] = useState("");

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("oxapay");
  const [newApiKey, setNewApiKey] = useState("");
  const [newPayoutKey, setNewPayoutKey] = useState("");
  const [newCallbackKey, setNewCallbackKey] = useState("");

  const [regenCryptoKeys, setRegenCryptoKeys] = useState<Record<number, string>>({});

  const [editName, setEditName] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editPayoutKey, setEditPayoutKey] = useState("");
  const [editCallbackKey, setEditCallbackKey] = useState("");

  const adminFetch = async (url: string, opts: RequestInit = {}) => {
    const res = await fetch(url, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
    return res.json();
  };

  const createMutation = useMutation({
    mutationFn: async () => adminFetch("/api/admin/crypto-aggregators", {
      method: "POST",
      body: JSON.stringify({ name: newName, type: newType, apiKey: newApiKey, payoutApiKey: newPayoutKey, callbackKey: newCallbackKey }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crypto-aggregators"] });
      toast({ title: "Agrégateur créé" });
      setAddOpen(false);
      setNewName(""); setNewApiKey(""); setNewPayoutKey(""); setNewCallbackKey("");
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: number; [key: string]: any }) => {
      const { id, ...rest } = data;
      return adminFetch(`/api/admin/crypto-aggregators/${id}`, { method: "PATCH", body: JSON.stringify(rest) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crypto-aggregators"] });
      toast({ title: "Configuration sauvegardée" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => adminFetch(`/api/admin/crypto-aggregators/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crypto-aggregators"] });
      toast({ title: "Agrégateur supprimé" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const countryMutation = useMutation({
    mutationFn: async ({ id, country, active }: { id: number; country: string; active: boolean }) =>
      adminFetch(`/api/admin/crypto-aggregators/${id}/countries`, { method: "PUT", body: JSON.stringify({ country, active }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crypto-aggregators"] });
      refetch().then((r) => {
        if (selectedAgg && r.data) {
          const updated = (r.data as CryptoAggType[]).find(a => a.id === selectedAgg.id);
          if (updated) setSelectedAgg(updated);
        }
      });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const merchantMutation = useMutation({
    mutationFn: async ({ id, merchantId, active }: { id: number; merchantId: number; active: boolean }) =>
      adminFetch(`/api/admin/crypto-aggregators/${id}/merchants`, { method: "PUT", body: JSON.stringify({ merchantId, active }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crypto-aggregators"] });
      refetch().then((r) => {
        if (selectedAgg && r.data) {
          const updated = (r.data as CryptoAggType[]).find(a => a.id === selectedAgg.id);
          if (updated) setSelectedAgg(updated);
        }
      });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const regenCryptoKeyMutation = useMutation({
    mutationFn: async (merchantId: number) => {
      const res = await fetch(`/api/admin/merchant/${merchantId}/crypto/regenerate-key`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return { merchantId, ...(await res.json()) };
    },
    onSuccess: (data: any) => {
      setRegenCryptoKeys(prev => ({ ...prev, [data.merchantId]: data.cryptoApiKey }));
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      toast({ title: "Clé crypto régénérée" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const openConfig = (agg: CryptoAggType) => {
    setSelectedAgg(agg);
    setEditName(agg.name);
    setEditApiKey(agg.apiKey);
    setEditPayoutKey(agg.payoutApiKey || "");
    setEditCallbackKey(agg.callbackKey || "");
    setConfigTab("general");
    setMerchantSearch("");
    setConfigOpen(true);
  };

  const isCountryActive = (agg: CryptoAggType, country: string) => {
    const c = agg.countries.find(x => x.country === country);
    return c?.active ?? false;
  };

  const isMerchantAssigned = (agg: CryptoAggType, merchantId: number) => {
    const m = agg.assignedMerchants.find(x => x.merchantId === merchantId);
    return m?.active ?? false;
  };

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Bitcoin className="w-5 h-5 text-orange-500" />
          Agrégateurs Crypto
        </h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5" data-testid="button-add-crypto-aggregator">
              <Plus className="w-4 h-4" /> Ajouter un agrégateur
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nouvel agrégateur crypto</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Nom</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="ex: OxaPay Principal" data-testid="input-agg-name" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger data-testid="select-agg-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oxapay">OxaPay</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Clé API (Merchant Key)</Label>
                <Input value={newApiKey} onChange={e => setNewApiKey(e.target.value)} placeholder="Clé API marchande" data-testid="input-agg-apikey" />
              </div>
              <div className="space-y-2">
                <Label>Clé Payout (optionnel)</Label>
                <Input value={newPayoutKey} onChange={e => setNewPayoutKey(e.target.value)} placeholder="Clé payout OxaPay" data-testid="input-agg-payoutkey" />
              </div>
              <div className="space-y-2">
                <Label>Clé Callback / Webhook (optionnel)</Label>
                <Input value={newCallbackKey} onChange={e => setNewCallbackKey(e.target.value)} placeholder="Clé HMAC webhook" data-testid="input-agg-callbackkey" />
              </div>
              <Button
                className="w-full"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !newName.trim() || !newApiKey.trim()}
                data-testid="button-create-aggregator"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                Créer l'agrégateur
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(aggregators as CryptoAggType[]).length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center gap-3 text-center">
          <Bitcoin className="w-12 h-12 text-muted-foreground/30" />
          <p className="text-muted-foreground font-medium">Aucun agrégateur crypto configuré</p>
          <p className="text-xs text-muted-foreground">Ajoutez un agrégateur OxaPay pour accepter les paiements en crypto.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {(aggregators as CryptoAggType[]).map(agg => (
            <Card key={agg.id} className="overflow-hidden" data-testid={`card-aggregator-${agg.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                      <Bitcoin className="w-5 h-5 text-orange-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate" data-testid={`text-agg-name-${agg.id}`}>{agg.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-muted-foreground capitalize">{agg.type}</span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">
                          {agg.assignedMerchants.filter(m => m.active).length} marchand(s) actif(s)
                        </span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground" data-testid={`text-agg-date-${agg.id}`}>
                          {new Date(agg.createdAt).toLocaleDateString("fr-FR")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant={agg.active ? "default" : "secondary"}
                      className={agg.active ? "bg-emerald-500 text-white" : ""}
                      data-testid={`badge-agg-status-${agg.id}`}
                    >
                      {agg.active ? "Actif" : "Inactif"}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openConfig(agg)}
                      data-testid={`button-config-agg-${agg.id}`}
                    >
                      <Settings className="w-3.5 h-3.5 mr-1.5" /> Configurer
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Supprimer l'agrégateur "${agg.name}" ?`)) deleteMutation.mutate(agg.id);
                      }}
                      data-testid={`button-delete-agg-${agg.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bitcoin className="w-4 h-4 text-orange-500" />
              {selectedAgg?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedAgg && (
            <div className="space-y-4 pt-2">
              <div className="flex gap-1 border-b">
                {(["general", "merchants"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setConfigTab(tab)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${configTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                    data-testid={`tab-config-${tab}`}
                  >
                    {tab === "general" ? "Général" : "Marchands"}
                  </button>
                ))}
              </div>

              {configTab === "general" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4 p-3 rounded-lg border">
                    <div>
                      <p className="text-sm font-medium">Statut global</p>
                      <p className="text-xs text-muted-foreground">Activer ou désactiver cet agrégateur</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={selectedAgg.active ? "outline" : "default"}
                        className={!selectedAgg.active ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
                        onClick={() => {
                          updateMutation.mutate({ id: selectedAgg.id, active: true });
                          setSelectedAgg({ ...selectedAgg, active: true });
                        }}
                        disabled={selectedAgg.active || updateMutation.isPending}
                        data-testid="button-agg-activate"
                      >
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Activer
                      </Button>
                      <Button
                        size="sm"
                        variant={!selectedAgg.active ? "outline" : "destructive"}
                        onClick={() => {
                          updateMutation.mutate({ id: selectedAgg.id, active: false });
                          setSelectedAgg({ ...selectedAgg, active: false });
                        }}
                        disabled={!selectedAgg.active || updateMutation.isPending}
                        data-testid="button-agg-deactivate"
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Désactiver
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Nom</Label>
                      <Input value={editName} onChange={e => setEditName(e.target.value)} data-testid="input-edit-name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Clé API (Merchant Key)</Label>
                      <Input value={editApiKey} onChange={e => setEditApiKey(e.target.value)} data-testid="input-edit-apikey" />
                    </div>
                    <div className="space-y-2">
                      <Label>Clé Payout (optionnel)</Label>
                      <Input value={editPayoutKey} onChange={e => setEditPayoutKey(e.target.value)} data-testid="input-edit-payoutkey" />
                    </div>
                    <div className="space-y-2">
                      <Label>Clé Callback / Webhook (optionnel)</Label>
                      <Input value={editCallbackKey} onChange={e => setEditCallbackKey(e.target.value)} data-testid="input-edit-callbackkey" />
                    </div>
                    <Button
                      onClick={() => updateMutation.mutate({
                        id: selectedAgg.id,
                        name: editName,
                        apiKey: editApiKey,
                        payoutApiKey: editPayoutKey,
                        callbackKey: editCallbackKey,
                      })}
                      disabled={updateMutation.isPending}
                      data-testid="button-save-general"
                    >
                      {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Key className="w-4 h-4 mr-2" />}
                      Sauvegarder
                    </Button>
                  </div>
                </div>
              )}

              {configTab === "merchants" && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Activez la crypto pour les marchands de votre choix. La crypto est mondiale — aucune restriction de pays.
                  </p>
                  <div className="relative">
                    <input
                      type="text"
                      value={merchantSearch}
                      onChange={e => setMerchantSearch(e.target.value)}
                      placeholder="Rechercher un marchand (nom, email)..."
                      className="w-full text-sm px-3 py-2 pl-9 rounded-lg border bg-background"
                      data-testid="input-merchant-search"
                    />
                    <svg className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <div className="divide-y rounded-lg border overflow-hidden max-h-96 overflow-y-auto">
                    {(allMerchants as any[]).filter((m: any) => {
                      if (!merchantSearch.trim()) return true;
                      const q = merchantSearch.toLowerCase();
                      return (m.name || "").toLowerCase().includes(q) || (m.email || "").toLowerCase().includes(q) || (m.businessName || "").toLowerCase().includes(q);
                    }).map((m: any) => {
                      const isAssigned = isMerchantAssigned(selectedAgg, m.id);
                      const displayKey = regenCryptoKeys[m.id] ?? m.cryptoApiKey;
                      return (
                        <div key={m.id} className="px-4 py-3 space-y-2">
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{m.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <Button
                                size="sm"
                                variant={isAssigned ? "default" : "outline"}
                                className={isAssigned ? "bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs" : "h-7 text-xs"}
                                onClick={() => merchantMutation.mutate({ id: selectedAgg.id, merchantId: m.id, active: true })}
                                disabled={isAssigned || merchantMutation.isPending}
                                data-testid={`button-merchant-assign-${m.id}`}
                              >
                                Assigner
                              </Button>
                              <Button
                                size="sm"
                                variant={!isAssigned ? "secondary" : "outline"}
                                className="h-7 text-xs"
                                onClick={() => merchantMutation.mutate({ id: selectedAgg.id, merchantId: m.id, active: false })}
                                disabled={!isAssigned || merchantMutation.isPending}
                                data-testid={`button-merchant-unassign-${m.id}`}
                              >
                                Retirer
                              </Button>
                            </div>
                          </div>
                          {isAssigned && (
                            <div className="flex items-center gap-2 bg-muted/50 rounded px-2 py-1.5">
                              <Key className="w-3 h-3 text-muted-foreground shrink-0" />
                              <code className="text-xs font-mono text-foreground flex-1 truncate" data-testid={`text-crypto-key-${m.id}`}>
                                {displayKey || "—"}
                              </code>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs shrink-0"
                                onClick={() => regenCryptoKeyMutation.mutate(m.id)}
                                disabled={regenCryptoKeyMutation.isPending}
                                data-testid={`button-regen-crypto-key-${m.id}`}
                              >
                                <RefreshCw className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {(allMerchants as any[]).filter((m: any) => {
                      if (!merchantSearch.trim()) return true;
                      const q = merchantSearch.toLowerCase();
                      return (m.name || "").toLowerCase().includes(q) || (m.email || "").toLowerCase().includes(q) || (m.businessName || "").toLowerCase().includes(q);
                    }).length === 0 && (
                      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                        {merchantSearch.trim() ? `Aucun marchand trouvé pour "${merchantSearch}"` : "Aucun marchand disponible"}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function EmailNotifyPanel({ merchants }: { merchants: Merchant[] }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<"all" | "specific">("all");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [specificEmail, setSpecificEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ count: number; message: string; failed?: string[] } | null>(null);

  const activeMerchants = merchants.filter(m => m.status !== "suspended");

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) { toast({ title: "Sujet et message requis", variant: "destructive" }); return; }
    if (mode === "specific" && !specificEmail.trim()) { toast({ title: "Adresse email requise", variant: "destructive" }); return; }
    setIsSending(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/admin/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim(), to: mode === "specific" ? specificEmail.trim() : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setLastResult(data);
      toast({ title: "✅ " + data.message });
      setSubject(""); setMessage(""); setSpecificEmail("");
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally { setIsSending(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 p-4 rounded-xl border bg-muted/30">
        <Users className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm text-muted-foreground">
          <strong className="text-foreground">{activeMerchants.length}</strong> marchands actifs disponibles pour une diffusion globale
        </span>
      </div>
      <Card>
        <CardHeader className="pb-4"><CardTitle className="text-base">Composer la notification</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSend} className="space-y-5">
            <div>
              <Label className="text-sm font-semibold mb-2 block">Destinataires</Label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setMode("all")}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all text-sm font-medium text-left ${mode === "all" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}
                  data-testid="button-notify-mode-all">
                  <Users className="w-4 h-4 shrink-0" />
                  <div><p className="font-semibold leading-tight">Tous les marchands</p><p className="text-xs opacity-70 leading-tight">{activeMerchants.length} destinataires</p></div>
                </button>
                <button type="button" onClick={() => setMode("specific")}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all text-sm font-medium text-left ${mode === "specific" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}
                  data-testid="button-notify-mode-specific">
                  <Mail className="w-4 h-4 shrink-0" />
                  <div><p className="font-semibold leading-tight">Email spécifique</p><p className="text-xs opacity-70 leading-tight">Un seul destinataire</p></div>
                </button>
              </div>
            </div>
            {mode === "specific" && (
              <div>
                <Label htmlFor="notif-email" className="text-sm font-semibold">Adresse email</Label>
                <Input id="notif-email" type="email" value={specificEmail} onChange={e => setSpecificEmail(e.target.value)} placeholder="exemple@email.com" className="mt-1.5" data-testid="input-notify-email" />
              </div>
            )}
            <div>
              <Label htmlFor="notif-subject" className="text-sm font-semibold">Objet de l'email</Label>
              <Input id="notif-subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex: Maintenance prévue — lundi 27 mai" className="mt-1.5" data-testid="input-notify-subject" />
            </div>
            <div>
              <Label htmlFor="notif-message" className="text-sm font-semibold">Message</Label>
              <textarea id="notif-message" value={message} onChange={e => setMessage(e.target.value)}
                placeholder={"Bonjour,\n\nNous souhaitons vous informer que...\n\nCordialement,\nL'équipe WestPay"}
                rows={8} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                data-testid="textarea-notify-message" />
              <p className="text-xs text-muted-foreground mt-1">Les retours à la ligne sont préservés dans l'email.</p>
            </div>
            {mode === "all" && activeMerchants.length > 0 && (
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-widest">Destinataires ({activeMerchants.length})</p>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {activeMerchants.map(m => (
                    <span key={m.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-background border border-border text-foreground">{m.email}</span>
                  ))}
                </div>
              </div>
            )}
            <Button type="submit" disabled={isSending || !subject.trim() || !message.trim()} className="w-full" data-testid="button-send-notification">
              {isSending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Envoi en cours…</> : <><MessageSquare className="w-4 h-4 mr-2" />{mode === "all" ? `Envoyer à ${activeMerchants.length} marchands` : "Envoyer l'email"}</>}
            </Button>
          </form>
        </CardContent>
      </Card>
      {lastResult && (
        <Card className={lastResult.failed && lastResult.failed.length > 0 ? "border-yellow-200" : "border-green-200"}>
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${lastResult.failed && lastResult.failed.length > 0 ? "bg-yellow-100" : "bg-green-100"}`}>
                <CheckCircle className={`w-4 h-4 ${lastResult.failed && lastResult.failed.length > 0 ? "text-yellow-600" : "text-green-600"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{lastResult.message}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{lastResult.count} email(s) envoyé(s) avec succès</p>
                {lastResult.failed && lastResult.failed.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-yellow-700 mb-1">Échecs ({lastResult.failed.length}) :</p>
                    <div className="flex flex-wrap gap-1">
                      {lastResult.failed.map(e => <span key={e} className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800">{e}</span>)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type TgButton = { text: string; url: string };

function TelegramBroadcastPanel({ merchants }: { merchants: Merchant[] }) {
  const { token } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<"all" | "all_groups" | "specific">("all");
  const [message, setMessage] = useState("");
  const [imageMode, setImageMode] = useState<"url" | "file">("url");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [buttons, setButtons] = useState<TgButton[]>([]);
  const [selectedMerchantIds, setSelectedMerchantIds] = useState<number[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [lastResult, setLastResult] = useState<{ sent: number; failed: number; message: string } | null>(null);

  const { data: tgMerchants = [] } = useAdminFetch("/api/admin/telegram/merchants-with-telegram", ["/api/admin/telegram/merchants-with-telegram"]);
  const telegramMerchants = tgMerchants as { id: number; name: string; email: string; suspended: boolean }[];
  const activeTgMerchants = telegramMerchants.filter(m => !m.suspended);

  const addButton = () => {
    if (buttons.length >= 6) return;
    setButtons(prev => [...prev, { text: "", url: "" }]);
  };

  const removeButton = (idx: number) => setButtons(prev => prev.filter((_, i) => i !== idx));

  const updateButton = (idx: number, field: keyof TgButton, value: string) => {
    setButtons(prev => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b));
  };

  const toggleMerchant = (id: number) => {
    setSelectedMerchantIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) { toast({ title: "Message requis", variant: "destructive" }); return; }
    if (mode === "specific" && selectedMerchantIds.length === 0) { toast({ title: "Sélectionnez au moins un marchand", variant: "destructive" }); return; }

    const validButtons = buttons.filter(b => b.text.trim() && b.url.trim());
    const buttonsPayload = validButtons.length > 0 ? [validButtons] : [];

    let finalImageUrl: string | undefined = imageMode === "url" ? imageUrl.trim() || undefined : undefined;

    // Upload file first if needed
    if (imageMode === "file" && imageFile) {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("image", imageFile);
        const upRes = await fetch("/api/admin/telegram/upload-image", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const upData = await upRes.json();
        if (!upRes.ok) throw new Error(upData.message || "Erreur upload");
        finalImageUrl = upData.url;
      } catch (err: any) {
        toast({ title: "Erreur upload image", description: err.message, variant: "destructive" });
        setIsUploading(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    setIsSending(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/admin/telegram/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: message.trim(),
          imageUrl: finalImageUrl,
          buttons: buttonsPayload,
          target: mode,
          merchantIds: mode === "specific" ? selectedMerchantIds : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      setLastResult(data);
      toast({ title: "✅ " + data.message });
      setMessage("");
      setImageUrl("");
      setImageFile(null);
      setImagePreview("");
      setButtons([]);
      setSelectedMerchantIds([]);
    } catch (err: any) {
      toast({ title: "Erreur envoi Telegram", description: err.message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="flex items-center gap-3 p-4 rounded-xl border bg-blue-50 dark:bg-blue-950/20">
        <MessageSquare className="w-4 h-4 text-blue-500 shrink-0" />
        <span className="text-sm text-muted-foreground">
          <strong className="text-foreground">{activeTgMerchants.length}</strong> marchands avec Telegram actif /{" "}
          <strong className="text-foreground">{merchants.filter(m => m.status !== "suspended").length}</strong> au total
        </span>
      </div>

      {activeTgMerchants.length === 0 && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 p-4 text-sm text-yellow-800 dark:text-yellow-300">
          ⚠️ Aucun marchand n'a encore configuré son Telegram. Les marchands doivent lier leur groupe via le bot pour recevoir des messages.
        </div>
      )}

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-500" />
            Composer le message Telegram
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSend} className="space-y-5">

            {/* Recipient mode */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">Destinataires</Label>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setMode("all")}
                  className={`flex items-center gap-2 px-3 py-3 rounded-xl border-2 transition-all text-sm font-medium text-left ${mode === "all" ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400" : "border-border text-muted-foreground hover:border-muted-foreground"}`}
                  data-testid="button-tg-mode-all">
                  <Users className="w-4 h-4 shrink-0" />
                  <div>
                    <p className="font-semibold leading-tight">Marchands liés</p>
                    <p className="text-xs opacity-70 leading-tight">{activeTgMerchants.length} avec Telegram</p>
                  </div>
                </button>
                <button type="button" onClick={() => setMode("all_groups")}
                  className={`flex items-center gap-2 px-3 py-3 rounded-xl border-2 transition-all text-sm font-medium text-left ${mode === "all_groups" ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400" : "border-border text-muted-foreground hover:border-muted-foreground"}`}
                  data-testid="button-tg-mode-all-groups">
                  <Globe className="w-4 h-4 shrink-0" />
                  <div>
                    <p className="font-semibold leading-tight">Tous les groupes</p>
                    <p className="text-xs opacity-70 leading-tight">Où le bot est présent</p>
                  </div>
                </button>
                <button type="button" onClick={() => setMode("specific")}
                  className={`flex items-center gap-2 px-3 py-3 rounded-xl border-2 transition-all text-sm font-medium text-left ${mode === "specific" ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400" : "border-border text-muted-foreground hover:border-muted-foreground"}`}
                  data-testid="button-tg-mode-specific">
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  <div>
                    <p className="font-semibold leading-tight">Marchands spécif.</p>
                    <p className="text-xs opacity-70 leading-tight">Sélection manuelle</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Merchant selection for specific mode */}
            {mode === "specific" && (
              <div>
                <Label className="text-sm font-semibold mb-2 block">Sélectionner les marchands ({selectedMerchantIds.length} sélectionné(s))</Label>
                <div className="border rounded-xl overflow-hidden">
                  {activeTgMerchants.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Aucun marchand avec Telegram configuré</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto divide-y divide-border">
                      {activeTgMerchants.map(m => (
                        <label key={m.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors" data-testid={`checkbox-tg-merchant-${m.id}`}>
                          <input
                            type="checkbox"
                            checked={selectedMerchantIds.includes(m.id)}
                            onChange={() => toggleMerchant(m.id)}
                            className="rounded border-border"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground leading-tight truncate">{m.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Message */}
            <div>
              <Label htmlFor="tg-message" className="text-sm font-semibold">Message</Label>
              <textarea
                id="tg-message"
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={"🔔 Bonjour,\n\nNous vous informons que...\n\n— L'équipe WestPay"}
                rows={7}
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none font-mono"
                data-testid="textarea-tg-message"
              />
              <p className="text-xs text-muted-foreground mt-1">Vous pouvez utiliser *gras*, _italique_, `code` (format Markdown Telegram).</p>
            </div>

            {/* Image */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  Image
                  <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">optionnel</span>
                </Label>
                <div className="flex rounded-lg border overflow-hidden text-xs">
                  <button type="button" onClick={() => { setImageMode("url"); setImageFile(null); setImagePreview(""); }}
                    className={`px-3 py-1.5 font-medium transition-colors ${imageMode === "url" ? "bg-blue-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
                    data-testid="button-img-mode-url">
                    Lien URL
                  </button>
                  <button type="button" onClick={() => { setImageMode("file"); setImageUrl(""); }}
                    className={`px-3 py-1.5 font-medium transition-colors ${imageMode === "file" ? "bg-blue-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
                    data-testid="button-img-mode-file">
                    Télécharger
                  </button>
                </div>
              </div>

              {imageMode === "url" ? (
                <>
                  <Input
                    id="tg-image"
                    type="url"
                    value={imageUrl}
                    onChange={e => setImageUrl(e.target.value)}
                    placeholder="https://exemple.com/image.jpg"
                    data-testid="input-tg-image-url"
                  />
                  {imageUrl && imageUrl.startsWith("http") && (
                    <div className="mt-2 rounded-xl overflow-hidden border border-border w-full max-h-40">
                      <img src={imageUrl} alt="Aperçu" className="w-full h-40 object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">URL publique accessible en https.</p>
                </>
              ) : (
                <>
                  <label htmlFor="tg-image-file"
                    className="mt-1 flex flex-col items-center justify-center w-full rounded-xl border-2 border-dashed border-border cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-colors p-5 gap-2"
                    data-testid="label-tg-image-file">
                    {imagePreview ? (
                      <img src={imagePreview} alt="Aperçu" className="max-h-36 rounded-lg object-contain" />
                    ) : (
                      <>
                        <Upload className="w-6 h-6 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Cliquez pour sélectionner une image</span>
                        <span className="text-xs text-muted-foreground">JPG, PNG, WEBP, GIF · max 10 Mo</span>
                      </>
                    )}
                    <input
                      id="tg-image-file"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={handleFileChange}
                      data-testid="input-tg-image-file"
                    />
                  </label>
                  {imageFile && (
                    <div className="flex items-center justify-between mt-2 px-3 py-2 rounded-lg bg-muted/40 border text-xs">
                      <span className="text-muted-foreground truncate">{imageFile.name}</span>
                      <button type="button" onClick={() => { setImageFile(null); setImagePreview(""); }} className="text-destructive hover:text-destructive/80 ml-2 shrink-0" data-testid="button-remove-image">✕</button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">L'image sera hébergée et envoyée avec le texte en légende.</p>
                </>
              )}
            </div>

            {/* Inline Buttons */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  Boutons
                  <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">optionnel</span>
                </Label>
                <Button type="button" variant="outline" size="sm" onClick={addButton} disabled={buttons.length >= 6} className="h-7 text-xs gap-1" data-testid="button-tg-add-btn">
                  <Plus className="w-3 h-3" />
                  Ajouter un bouton
                </Button>
              </div>

              {buttons.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-center">
                  <p className="text-xs text-muted-foreground">Aucun bouton — cliquez sur « Ajouter un bouton » pour en créer un</p>
                  <p className="text-xs text-muted-foreground mt-1">Chaque bouton apparaîtra sous le message avec un lien cliquable</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {buttons.map((btn, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-3 rounded-xl border bg-muted/20" data-testid={`tg-button-row-${idx}`}>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">Texte du bouton</Label>
                          <Input
                            value={btn.text}
                            onChange={e => updateButton(idx, "text", e.target.value)}
                            placeholder="Ex: Accéder à mon compte"
                            className="h-8 text-sm"
                            data-testid={`input-tg-btn-text-${idx}`}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">Lien URL</Label>
                          <Input
                            value={btn.url}
                            onChange={e => updateButton(idx, "url", e.target.value)}
                            placeholder="https://westpay.cfd/merchant-login"
                            className="h-8 text-sm"
                            data-testid={`input-tg-btn-url-${idx}`}
                          />
                        </div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 mt-5" onClick={() => removeButton(idx)} data-testid={`button-tg-remove-btn-${idx}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">Maximum 6 boutons · Les boutons avec texte et URL vides sont ignorés</p>
                </div>
              )}
            </div>

            {/* Preview */}
            {(message.trim() || imageUrl.trim() || imagePreview || buttons.filter(b => b.text && b.url).length > 0) && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 dark:bg-blue-950/10 p-4">
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-3">Aperçu du message</p>
                <div className="bg-white dark:bg-zinc-900 rounded-xl border p-3 space-y-2 shadow-sm">
                  {(imagePreview || (imageUrl && imageUrl.startsWith("http"))) && (
                    <div className="rounded-lg overflow-hidden">
                      <img src={imagePreview || imageUrl} alt="" className="w-full max-h-32 object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    </div>
                  )}
                  <p className="text-sm text-foreground whitespace-pre-wrap">{message || "—"}</p>
                  {buttons.filter(b => b.text && b.url).length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {buttons.filter(b => b.text && b.url).map((b, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-medium">
                          <ExternalLink className="w-3 h-3" />
                          {b.text}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Send button */}
            <Button
              type="submit"
              disabled={isSending || isUploading || !message.trim() || (mode === "specific" && selectedMerchantIds.length === 0)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-send-telegram"
            >
              {isUploading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Upload image…</>
              ) : isSending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Envoi en cours…</>
              ) : (
                <><MessageSquare className="w-4 h-4 mr-2" />
                  {mode === "all"
                    ? `Envoyer à ${activeTgMerchants.length} marchands Telegram`
                    : `Envoyer à ${selectedMerchantIds.length} marchand(s) sélectionné(s)`}
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Result */}
      {lastResult && (
        <Card className={lastResult.failed > 0 ? "border-yellow-200" : "border-green-200"}>
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${lastResult.failed > 0 ? "bg-yellow-100" : "bg-green-100"}`}>
                <CheckCircle className={`w-4 h-4 ${lastResult.failed > 0 ? "text-yellow-600" : "text-green-600"}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{lastResult.message}</p>
                <div className="flex gap-3 mt-1">
                  <span className="text-xs text-green-600">✓ {lastResult.sent} envoyé(s)</span>
                  {lastResult.failed > 0 && <span className="text-xs text-yellow-600">✗ {lastResult.failed} échec(s)</span>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OtpBotPanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [botToken, setBotToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testChatId, setTestChatId] = useState("");
  const [testMerchantName, setTestMerchantName] = useState("");
  const [testing, setTesting] = useState(false);

  const { data: botSettings, isLoading, refetch } = useQuery<{
    running: boolean; username: string | null; hasToken: boolean; masked: string | null;
  }>({
    queryKey: ["/api/admin/telegram/otp-bot/settings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/telegram/otp-bot/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botToken.trim()) { toast({ title: "Token required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/telegram/otp-bot/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ token: botToken.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      toast({ title: "OTP bot started", description: `@${data.username}` });
      setBotToken("");
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testChatId.trim()) { toast({ title: "Chat ID required", variant: "destructive" }); return; }
    setTesting(true);
    try {
      const res = await fetch("/api/admin/telegram/otp-bot/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chatId: testChatId.trim(), merchantName: testMerchantName.trim() || "Test Merchant" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      toast({ title: "Test OTP sent!", description: `Code: ${data.otp} — check Telegram` });
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Bot status card */}
      <div className={`flex items-center gap-4 p-4 rounded-xl border ${botSettings?.running ? "bg-emerald-950/30 border-emerald-800/40" : "bg-muted border-border"}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${botSettings?.running ? "bg-emerald-600" : "bg-muted-foreground/20"}`}>
          <KeyRound className={`w-5 h-5 ${botSettings?.running ? "text-white" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground">OTP Delivery Bot</span>
            {isLoading ? (
              <Skeleton className="h-5 w-16" />
            ) : botSettings?.running ? (
              <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30 text-xs">● Running</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-xs">● Offline</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isLoading ? "Loading..." : botSettings?.running
              ? `@${botSettings.username} — exclusively sends OTP codes during merchant login`
              : botSettings?.hasToken
              ? `Token found (${botSettings.masked}) — bot failed to start`
              : "No token configured — OTP codes will fall back to email"}
          </p>
        </div>
      </div>

      {/* Info box */}
      <div className="flex gap-3 p-4 rounded-xl bg-blue-950/20 border border-blue-800/30">
        <Shield className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-300 leading-relaxed">
          <strong className="text-blue-200 block mb-1">Dedicated single-role bot</strong>
          This bot has one job only: deliver 6-digit OTP codes to merchant Telegram groups when they log in.
          It does not respond to commands, does not broadcast, and does not interact with the main notification bot.
          <br /><br />
          <strong className="text-blue-200">Fallback chain:</strong> OTP Bot → Main Bot → Email
        </div>
      </div>

      {/* Token configuration */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Configure Bot Token</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create a new bot via <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">@BotFather</a> → /newbot — paste the token below
          </p>
        </div>
        <form onSubmit={handleSaveToken} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Bot Token</Label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={botToken}
                onChange={e => setBotToken(e.target.value)}
                placeholder="123456789:AAF..."
                className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
                data-testid="input-otp-bot-token"
              />
              <button
                type="button"
                onClick={() => setShowToken(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Button
            type="submit"
            disabled={saving || !botToken.trim()}
            className="w-full"
            data-testid="button-save-otp-bot-token"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Starting bot...</> : <><CheckCircle className="w-4 h-4 mr-2" />Save & Start Bot</>}
          </Button>
        </form>
        {botSettings?.hasToken && (
          <p className="text-xs text-muted-foreground text-center">
            Current token: <span className="font-mono text-foreground">{botSettings.masked}</span>
          </p>
        )}
      </div>

      {/* Test send */}
      {botSettings?.running && (
        <div className="p-4 rounded-xl border border-border bg-card space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Send Test OTP</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Send a real test code to any Telegram group to verify delivery</p>
          </div>
          <form onSubmit={handleTest} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Chat / Group ID</Label>
                <input
                  type="text"
                  value={testChatId}
                  onChange={e => setTestChatId(e.target.value)}
                  placeholder="-1001234567890"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
                  data-testid="input-otp-bot-test-chat-id"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Merchant Name</Label>
                <input
                  type="text"
                  value={testMerchantName}
                  onChange={e => setTestMerchantName(e.target.value)}
                  placeholder="EcoMat"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  data-testid="input-otp-bot-test-merchant"
                />
              </div>
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={testing || !testChatId.trim()}
              className="w-full"
              data-testid="button-otp-bot-test-send"
            >
              {testing ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Sending...</> : <><MessageSquare className="w-4 h-4 mr-2" />Send Test Code</>}
            </Button>
          </form>
        </div>
      )}

      {/* Message preview */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Message Preview</h3>
        <div className="rounded-xl bg-[#17212b] p-4 font-mono text-xs leading-relaxed text-[#e8e8e8] space-y-0.5">
          <p className="text-white font-bold">🔐 WestPay — Secure Login</p>
          <p>&nbsp;</p>
          <p>👤 <span className="font-bold">Merchant:</span> EcoMat</p>
          <p className="text-[#6c7883]">━━━━━━━━━━━━━━━━━━━━━━</p>
          <p>&nbsp;</p>
          <p>Your one-time login code:</p>
          <p>&nbsp;</p>
          <p className="bg-[#0d1117] px-3 py-1.5 rounded text-[#58a6ff] tracking-[0.35em] font-bold text-sm">  4  8  3  7  2  1  </p>
          <p>&nbsp;</p>
          <p className="text-[#6c7883]">━━━━━━━━━━━━━━━━━━━━━━</p>
          <p>⏱ Valid for <span className="font-bold">5 minutes</span> · Single use only</p>
          <p>🔒 <span className="font-bold">Never share this code with anyone</span></p>
          <p>&nbsp;</p>
          <p className="text-[#6c7883] italic">WestPay · Secure Payment Platform</p>
        </div>
      </div>
    </div>
  );
}

function BotTokenCard({ onSaved }: { onSaved: () => void }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [botToken, setBotToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const saveToken = async () => {
    if (!botToken.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/telegram/main-bot/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ token: botToken.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur");
      toast({ title: `✅ Bot activé : @${data.username}`, description: "Le bot Telegram est maintenant actif" });
      setBotToken("");
      onSaved();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Key className="w-4 h-4 text-green-500" />
          Token du bot principal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Collez le token BotFather de votre bot Telegram principal. Il sera sauvegardé en base de données et le bot démarrera immédiatement.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showToken ? "text" : "password"}
              value={botToken}
              onChange={e => setBotToken(e.target.value)}
              placeholder="1234567890:ABCDefghIJKlmnOPQRstuvWXYZ"
              className="font-mono text-sm pr-10"
              data-testid="input-bot-token"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <Button onClick={saveToken} disabled={saving || !botToken.trim()} size="sm" data-testid="button-save-bot-token">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Activer"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Créez un bot avec <code className="bg-muted px-1 rounded">@BotFather</code> → <code className="bg-muted px-1 rounded">/newbot</code> puis copiez le token ici.
        </p>
      </CardContent>
    </Card>
  );
}

function TelegramBotPanel() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [groupId, setGroupId] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [testing, setTesting] = useState(false);

  const { data: botStatus, refetch: refetchStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["/api/admin/telegram/bot-status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/telegram/bot-status", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{
        hasToken: boolean; running: boolean; username: string | null;
        webhookUrl: string | null; webhookPendingCount: number;
        webhookLastError: string | null; hasAdminGroup: boolean;
      }>;
    },
    refetchInterval: 30000,
  });

  const { data: tgSettings } = useQuery({
    queryKey: ["/api/admin/telegram/settings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/telegram/settings", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ groupId: string | null; knownGroupsCount: number }>;
    },
  });

  useEffect(() => {
    if (tgSettings?.groupId) setGroupId(tgSettings.groupId);
  }, [tgSettings]);

  const saveGroupId = async () => {
    if (!groupId.trim()) return;
    setSavingGroup(true);
    try {
      const res = await fetch("/api/admin/telegram/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ groupId: groupId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast({ title: "✅ Chat ID admin enregistré" });
      refetchStatus();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setSavingGroup(false);
    }
  };

  const refreshWebhook = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/telegram/refresh-webhook", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast({ title: "✅ Webhook réenregistré", description: data.webhookUrl });
      refetchStatus();
    } catch (err: any) {
      toast({ title: "Erreur webhook", description: err.message, variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

  const testBot = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/admin/telegram/test-bot", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast({ title: "✅ Message test envoyé", description: "Vérifiez votre groupe Telegram admin" });
    } catch (err: any) {
      toast({ title: "Erreur test", description: err.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const statusColor = botStatus?.running
    ? botStatus.webhookLastError ? "text-amber-500" : "text-green-500"
    : "text-red-500";
  const statusText = botStatus?.running
    ? botStatus.webhookLastError ? "Actif (erreurs webhook)" : "Actif ✓"
    : "Inactif";

  return (
    <div className="space-y-4">
      {/* Status card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-blue-500" />
              Statut du bot principal
            </span>
            <button type="button" onClick={() => refetchStatus()} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <RefreshCw className={`w-3 h-3 ${statusLoading ? "animate-spin" : ""}`} />
              Actualiser
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {statusLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Chargement…</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Token bot</p>
                  <p className={`font-semibold ${botStatus?.hasToken ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                    {botStatus?.hasToken ? "✓ Configuré" : "✗ Manquant"}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">État bot</p>
                  <p className={`font-semibold ${statusColor}`}>{statusLoading ? "…" : statusText}</p>
                </div>
                {botStatus?.username && (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground mb-1">Nom du bot</p>
                    <p className="font-semibold text-foreground">@{botStatus.username}</p>
                  </div>
                )}
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Groupe admin</p>
                  <p className={`font-semibold ${botStatus?.hasAdminGroup ? "text-green-600 dark:text-green-400" : "text-amber-500"}`}>
                    {botStatus?.hasAdminGroup ? "✓ Configuré" : "⚠ Non défini"}
                  </p>
                </div>
              </div>

              {/* Webhook info */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Webhook Telegram</p>
                <p className="font-mono text-xs break-all text-foreground">
                  {botStatus?.webhookUrl || <span className="text-muted-foreground italic">(aucun webhook actif)</span>}
                </p>
                {botStatus?.webhookPendingCount !== undefined && botStatus.webhookPendingCount > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">⚠ {botStatus.webhookPendingCount} mise(s) à jour en attente</p>
                )}
                {botStatus?.webhookLastError && (
                  <p className="text-xs text-red-500 font-medium">❌ Dernière erreur : {botStatus.webhookLastError}</p>
                )}
              </div>

              {/* Token missing warning */}
              {!botStatus?.hasToken && (
                <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-700 dark:text-red-400">
                  <p className="font-semibold mb-1">⚠ Token manquant</p>
                  <p className="text-xs">Configurez le token du bot ci-dessous pour l'activer.</p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Group ID config */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Hash className="w-4 h-4 text-violet-500" />
            Chat ID du groupe admin
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            ID numérique du groupe Telegram où le bot envoie les alertes admin (transactions, logins, etc.). Pour l'obtenir : ajoutez le bot dans le groupe, puis envoyez la commande <code className="bg-muted px-1 rounded text-xs">/setgroup API_KEY_ADMIN</code>.
          </p>
          <div className="flex gap-2">
            <Input
              value={groupId}
              onChange={e => setGroupId(e.target.value)}
              placeholder="-1001234567890"
              className="font-mono text-sm flex-1"
              data-testid="input-admin-group-id"
            />
            <Button onClick={saveGroupId} disabled={savingGroup || !groupId.trim()} size="sm" data-testid="button-save-group-id">
              {savingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enregistrer"}
            </Button>
          </div>
          {tgSettings?.knownGroupsCount !== undefined && (
            <p className="text-xs text-muted-foreground">{tgSettings.knownGroupsCount} groupe(s) connu(s) du bot au total</p>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            Actions & Diagnostic
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={refreshWebhook}
              disabled={refreshing}
              className="flex items-center gap-3 p-4 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 hover:border-blue-400 dark:hover:border-blue-600 transition-all text-left"
              data-testid="button-refresh-webhook"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center shrink-0">
                {refreshing ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <RefreshCw className="w-4 h-4 text-white" />}
              </div>
              <div>
                <p className="font-semibold text-sm text-blue-700 dark:text-blue-300">Réveiller le bot</p>
                <p className="text-xs text-blue-600/70 dark:text-blue-400/70">Forcer le réenregistrement du webhook Telegram</p>
              </div>
            </button>

            <button
              type="button"
              onClick={testBot}
              disabled={testing || !botStatus?.running || !botStatus?.hasAdminGroup}
              className="flex items-center gap-3 p-4 rounded-xl border-2 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 hover:border-green-400 dark:hover:border-green-600 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="button-test-bot"
            >
              <div className="w-9 h-9 rounded-lg bg-green-500 flex items-center justify-center shrink-0">
                {testing ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
              </div>
              <div>
                <p className="font-semibold text-sm text-green-700 dark:text-green-300">Message test</p>
                <p className="text-xs text-green-600/70 dark:text-green-400/70">Envoyer un message test au groupe admin</p>
              </div>
            </button>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">📋 Checklist dépannage :</p>
            <p>1. <code className="bg-muted px-1 rounded">TELEGRAM_BOT_TOKEN</code> défini dans les variables Plesk</p>
            <p>2. <code className="bg-muted px-1 rounded">APP_URL=https://westpay.cfd</code> défini dans les variables Plesk</p>
            <p>3. Chat ID groupe admin configuré ci-dessus</p>
            <p>4. Cliquez "Réveiller le bot" après chaque déploiement ou redémarrage</p>
            <p>5. Vérifiez que le bot est bien <strong>membre administrateur</strong> du groupe Telegram</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationsPanel() {
  const [activeNotifTab, setActiveNotifTab] = useState<"email" | "telegram" | "botconfig" | "otpbot">("botconfig");
  const { data: merchants = [] } = useAdminFetch("/api/admin/merchants", ["/api/admin/merchants"]);
  const allMerchants = merchants as Merchant[];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-sm">
          <MessageSquare className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Notifications & Diffusion</h2>
          <p className="text-sm text-muted-foreground">Configurez et utilisez le bot Telegram pour vos notifications</p>
        </div>
      </div>

      {/* Channel tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted border">
        <button
          type="button"
          onClick={() => setActiveNotifTab("botconfig")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-all ${activeNotifTab === "botconfig" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          data-testid="button-notif-tab-botconfig"
        >
          <Bot className="w-3.5 h-3.5 text-blue-500" />
          Bot
        </button>
        <button
          type="button"
          onClick={() => setActiveNotifTab("telegram")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-all ${activeNotifTab === "telegram" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          data-testid="button-notif-tab-telegram"
        >
          <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
          Broadcast
        </button>
        <button
          type="button"
          onClick={() => setActiveNotifTab("email")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-all ${activeNotifTab === "email" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          data-testid="button-notif-tab-email"
        >
          <Mail className="w-3.5 h-3.5" />
          Email
        </button>
        <button
          type="button"
          onClick={() => setActiveNotifTab("otpbot")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-all ${activeNotifTab === "otpbot" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          data-testid="button-notif-tab-otpbot"
        >
          <KeyRound className="w-3.5 h-3.5 text-amber-500" />
          OTP Bot
        </button>
      </div>

      {activeNotifTab === "botconfig" && <TelegramBotPanel />}
      {activeNotifTab === "email" && <EmailNotifyPanel merchants={allMerchants} />}
      {activeNotifTab === "telegram" && <TelegramBroadcastPanel merchants={allMerchants} />}
      {activeNotifTab === "otpbot" && <OtpBotPanel />}
    </div>
  );
}

const DELAY_OPTIONS = [
  { value: "auto", label: "Par défaut (30 secondes)" },
  { value: "5", label: "5 secondes" },
  { value: "10", label: "10 secondes" },
  { value: "15", label: "15 secondes" },
  { value: "20", label: "20 secondes" },
  { value: "30", label: "30 secondes" },
  { value: "45", label: "45 secondes" },
  { value: "1m", label: "1 minute" },
  { value: "2m", label: "2 minutes" },
  { value: "5m", label: "5 minutes" },
  { value: "0", label: "Immédiat (sans délai)" },
];

function UserbotPanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<"idle" | "sending" | "code" | "password" | "connecting">("idle");
  const [phone, setPhone] = useState("+15843334306");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [delayValue, setDelayValue] = useState("auto");
  const [savingDelay, setSavingDelay] = useState(false);
  const [delayInit, setDelayInit] = useState(false);

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ["/api/admin/userbot/status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/userbot/status", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ connected: boolean; phone: string; linkedGroups: number; pendingAuth: boolean; responseDelay: string }>;
    },
    refetchInterval: 5000,
  });

  const serverDelay = status?.responseDelay || "auto";
  if (!delayInit && status) { setDelayValue(serverDelay); setDelayInit(true); }

  async function adminPost(endpoint: string, body: object) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async function handleStartAuth() {
    setStep("sending");
    const result = await adminPost("/api/admin/userbot/start-auth", { phone });
    if (result.success) {
      toast({ title: "Code envoyé !", description: result.message });
      setStep("code");
    } else {
      toast({ title: "Erreur", description: result.message, variant: "destructive" });
      setStep("idle");
    }
  }

  async function handleSubmitCode() {
    setStep("connecting");
    const result = await adminPost("/api/admin/userbot/complete-auth", { code });
    if (result.message === "2FA_REQUIRED") {
      toast({ title: "2FA requis", description: "Entrez votre mot de passe Telegram." });
      setStep("password");
    } else if (result.success) {
      toast({ title: "Connecté !", description: result.message });
      setStep("idle"); setCode(""); refetchStatus();
    } else {
      toast({ title: "Erreur", description: result.message, variant: "destructive" });
      setStep("code");
    }
  }

  async function handleSubmitPassword() {
    setStep("connecting");
    const result = await adminPost("/api/admin/userbot/complete-auth", { code, password });
    if (result.success) {
      toast({ title: "Connecté !", description: result.message });
      setStep("idle"); setCode(""); setPassword(""); refetchStatus();
    } else {
      toast({ title: "Erreur", description: result.message, variant: "destructive" });
      setStep("password");
    }
  }

  async function handleDisconnect() {
    await adminPost("/api/admin/userbot/disconnect", {});
    toast({ title: "Déconnecté", description: "Le compte support a été déconnecté." });
    refetchStatus();
  }

  async function handleSaveDelay() {
    setSavingDelay(true);
    try {
      const result = await adminPost("/api/admin/userbot/delay", { value: delayValue });
      if (result.success) {
        toast({ title: "Délai enregistré", description: DELAY_OPTIONS.find(o => o.value === delayValue)?.label });
      } else {
        toast({ title: "Erreur", description: result.message, variant: "destructive" });
      }
    } finally {
      setSavingDelay(false);
    }
  }

  const isConnected = status?.connected;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center shadow-sm">
          <MessageSquare className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Compte Support Client</h2>
          <p className="text-sm text-muted-foreground">Compte Telegram réel qui répond naturellement dans les groupes marchands</p>
        </div>
      </div>

      {/* Status card */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Statut de connexion</span>
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${isConnected ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-muted-foreground"}`} />
            {isConnected ? "Connecté" : "Déconnecté"}
          </span>
        </div>
        {status && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-muted-foreground text-xs mb-1">Numéro de téléphone</p>
              <p className="font-mono font-medium">{status.phone}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-muted-foreground text-xs mb-1">Groupes liés</p>
              <p className="font-bold text-lg">{status.linkedGroups}</p>
            </div>
          </div>
        )}
        {isConnected && (
          <button type="button" onClick={handleDisconnect}
            className="w-full py-2 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            data-testid="button-userbot-disconnect">
            Déconnecter le compte support
          </button>
        )}
      </div>

      {/* Response delay config */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground text-sm mb-0.5">Délai de réponse</h3>
          <p className="text-xs text-muted-foreground">Configurez combien de temps le compte support attend avant de répondre.</p>
        </div>
        <div className="space-y-3">
          <div className="relative">
            <select value={delayValue} onChange={e => setDelayValue(e.target.value)}
              className="w-full appearance-none px-3 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary pr-8"
              data-testid="select-userbot-delay">
              {DELAY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </div>
          </div>
          <button type="button" onClick={handleSaveDelay} disabled={savingDelay}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
            data-testid="button-save-delay">
            {savingDelay ? <><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement...</> : "Enregistrer le délai"}
          </button>
        </div>
        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          Par défaut, le compte attend 30 secondes avant de répondre et affiche l'indicateur de frappe ("en train d'écrire...") en continu pendant tout ce délai pour paraître naturel. Vous pouvez ajuster ce délai ci-dessus.
        </div>
      </div>

      {/* Connect flow */}
      {!isConnected && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h3 className="font-semibold text-foreground text-sm">Connecter le compte Telegram</h3>
          {(step === "idle" || step === "sending") && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Numéro de téléphone</label>
                <input type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+15843334306"
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-userbot-phone" />
              </div>
              <button type="button" onClick={handleStartAuth} disabled={step === "sending"}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                data-testid="button-userbot-sendcode">
                {step === "sending" ? <><Loader2 className="w-4 h-4 animate-spin" /> Envoi du code...</> : "Envoyer le code de vérification"}
              </button>
            </div>
          )}
          {step === "code" && (
            <div className="space-y-3">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-sm text-blue-700 dark:text-blue-300">
                Un code de vérification a été envoyé à <strong>{phone}</strong>.
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Code de vérification</label>
                <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="12345" maxLength={10}
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm font-mono text-center tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-userbot-code" onKeyDown={e => e.key === "Enter" && handleSubmitCode()} />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep("idle")} className="flex-1 py-2 rounded-lg border text-sm font-medium hover:bg-muted transition-colors">Retour</button>
                <button type="button" onClick={handleSubmitCode} disabled={step === "connecting" || !code}
                  className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                  data-testid="button-userbot-submitcode">
                  {step === "connecting" ? <><Loader2 className="w-4 h-4 animate-spin" /> Connexion...</> : "Vérifier et connecter"}
                </button>
              </div>
            </div>
          )}
          {step === "password" && (
            <div className="space-y-3">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-700 dark:text-amber-300">
                La vérification en deux étapes est activée. Entrez votre mot de passe Telegram.
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Mot de passe 2FA</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Votre mot de passe Telegram"
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-userbot-password" onKeyDown={e => e.key === "Enter" && handleSubmitPassword()} />
              </div>
              <button type="button" onClick={handleSubmitPassword} disabled={step === "connecting" || !password}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                data-testid="button-userbot-submitpassword">
                {step === "connecting" ? <><Loader2 className="w-4 h-4 animate-spin" /> Connexion...</> : "Confirmer le mot de passe"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* How it works */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="font-semibold text-foreground text-sm">Comment ça fonctionne</h3>
        <ol className="space-y-2 text-sm text-muted-foreground list-none">
          <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>Connecter le compte Telegram ci-dessus</li>
          <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>Ajouter ce compte dans le groupe Telegram du marchand</li>
          <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>Générer un code d'activation depuis le profil du marchand</li>
          <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">4</span>Envoyer <code className="bg-muted px-1 rounded font-mono">/setmarchand CODE</code> dans le groupe</li>
          <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">5</span>Le compte répond naturellement dans la langue du message</li>
        </ol>
        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground mb-1">Comportement :</p>
          <p>Répond naturellement en français ou en anglais selon la langue du message.</p>
          <p>Aucune liste de commandes, aucun texte en gras avec des astérisques.</p>
          <p>Affiche l'indicateur de frappe avant de répondre.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Knowledge Panel ────────────────────────────────────────────────────────
const KNOWLEDGE_CATEGORIES = ["general","platform","payments","withdrawals","api","webhooks","dashboard","crypto","security","troubleshooting","fees","account"];

function KnowledgePanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ category: "general", title: "", content: "" });
  const [saving, setSaving] = useState(false);
  const [reembedding, setReembedding] = useState(false);

  const { data: chunks = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/knowledge"],
    queryFn: async () => {
      const res = await fetch("/api/admin/knowledge", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const filtered = chunks.filter(c =>
    (filter === "all" || c.category === filter) &&
    (search === "" || c.title.toLowerCase().includes(search.toLowerCase()) || c.content.toLowerCase().includes(search.toLowerCase()))
  );

  const openCreate = () => { setForm({ category: "general", title: "", content: "" }); setEditItem(null); setShowForm(true); };
  const openEdit = (item: any) => { setForm({ category: item.category, title: item.title, content: item.content }); setEditItem(item); setShowForm(true); };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) { toast({ title: "Titre et contenu requis", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const url = editItem ? `/api/admin/knowledge/${editItem.id}` : "/api/admin/knowledge";
      const method = editItem ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error((await res.json()).message);
      toast({ title: editItem ? "Mis à jour ✅" : "Ajouté ✅", description: "Embedding généré automatiquement" });
      setShowForm(false); setEditItem(null); refetch();
    } catch (e: any) { toast({ title: "Erreur", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer ce chunk ?")) return;
    await fetch(`/api/admin/knowledge/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    toast({ title: "Supprimé" }); refetch();
  };

  const handleToggle = async (id: number, active: boolean) => {
    await fetch(`/api/admin/knowledge/${id}`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ active }) });
    refetch();
  };

  const handleReembed = async () => {
    setReembedding(true);
    await fetch("/api/admin/knowledge/reembed", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    toast({ title: "Re-embedding lancé", description: "Les embeddings manquants sont générés en arrière-plan" });
    setReembedding(false);
  };

  const stats = { total: chunks.length, active: chunks.filter(c => c.active).length, embedded: chunks.filter(c => c.active).length };

  return (
    <div className="space-y-4 p-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Base de connaissances IA</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Système RAG — {stats.total} chunks · {stats.active} actifs</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReembed} disabled={reembedding} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition-colors" data-testid="button-reembed-knowledge">
            <RefreshCw className={`w-3.5 h-3.5 ${reembedding ? "animate-spin" : ""}`} />
            Re-embed
          </button>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors" data-testid="button-add-knowledge">
            <Plus className="w-3.5 h-3.5" /> Ajouter
          </button>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary" data-testid="input-search-knowledge" />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="text-sm border border-border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none" data-testid="select-filter-knowledge">
          <option value="all">Toutes ({chunks.length})</option>
          {KNOWLEDGE_CATEGORIES.map(c => <option key={c} value={c}>{c} ({chunks.filter(x => x.category === c).length})</option>)}
        </select>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="font-semibold text-sm text-foreground">{editItem ? "Modifier le chunk" : "Nouveau chunk de connaissance"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Catégorie</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full text-sm border border-border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none" data-testid="select-knowledge-category">
                {KNOWLEDGE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Titre</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: How payments work" className="w-full text-sm border border-border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none" data-testid="input-knowledge-title" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Contenu</label>
            <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={5} placeholder="Décrivez en détail ce que le bot doit savoir sur ce sujet..." className="w-full text-sm border border-border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none resize-none" data-testid="textarea-knowledge-content" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setEditItem(null); }} className="px-4 py-1.5 text-sm rounded-lg border border-border text-muted-foreground hover:bg-muted" data-testid="button-cancel-knowledge">Annuler</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 flex items-center gap-1.5" data-testid="button-save-knowledge">
              {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Génération embedding…</> : <><CheckCircle className="w-3.5 h-3.5" /> Enregistrer</>}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {chunks.length === 0 ? "Base de connaissances vide — le seed automatique est en cours…" : "Aucun résultat"}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((chunk: any) => (
            <div key={chunk.id} className={`rounded-xl border p-3 transition-opacity ${chunk.active ? "border-border bg-card" : "border-border/50 bg-muted/30 opacity-60"}`} data-testid={`card-knowledge-${chunk.id}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{chunk.category}</span>
                    <span className="font-semibold text-sm text-foreground truncate">{chunk.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{chunk.content}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Switch checked={chunk.active} onCheckedChange={(v) => handleToggle(chunk.id, v)} data-testid={`switch-knowledge-${chunk.id}`} />
                  <button onClick={() => openEdit(chunk)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors" data-testid={`button-edit-knowledge-${chunk.id}`}><Edit3 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => handleDelete(chunk.id)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-destructive/10 transition-colors" data-testid={`button-delete-knowledge-${chunk.id}`}><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SdkPanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const { data: sdkMerchants = [], isLoading, refetch } = useAdminFetch("/api/admin/sdk/merchants", ["/api/admin/sdk/merchants"]);
  const [visibleKeys, setVisibleKeys] = useState<Record<number, boolean>>({});

  const toggleSdk = async (id: number, enable: boolean) => {
    const res = await fetch(`/api/admin/sdk/merchants/${id}/${enable ? "enable" : "disable"}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { const d = await res.json(); toast({ title: "Erreur", description: d.message, variant: "destructive" }); return; }
    const d = await res.json();
    if (enable && d.sdkApiKey) toast({ title: "SDK activé", description: d.sdkApiKey });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/sdk/merchants"] });
    refetch();
  };

  const regenerateKey = async (id: number) => {
    const res = await fetch(`/api/admin/sdk/merchants/${id}/regenerate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { const d = await res.json(); toast({ title: "Erreur", description: d.message, variant: "destructive" }); return; }
    const d = await res.json();
    toast({ title: "Clé régénérée", description: d.sdkApiKey });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/sdk/merchants"] });
    refetch();
  };

  const merchants = sdkMerchants as { id: number; name: string; email: string; sdkEnabled: boolean; sdkApiKey: string | null }[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Gestion SDK API</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Activation et gestion des clés SDK par marchand</p>
        </div>
        <Badge variant="secondary" className="text-xs gap-1"><Shield className="w-3 h-3" />Accès administrateur uniquement</Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Key className="w-4 h-4" />Marchands — Accès SDK</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : merchants.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Aucun marchand</p>
          ) : (
            <div className="space-y-3">
              {merchants.map(m => (
                <div key={m.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant={m.sdkEnabled ? "default" : "secondary"} className="text-xs">
                        {m.sdkEnabled ? "SDK actif" : "Désactivé"}
                      </Badge>
                      <Switch
                        checked={m.sdkEnabled}
                        onCheckedChange={v => toggleSdk(m.id, v)}
                        data-testid={`switch-sdk-${m.id}`}
                      />
                    </div>
                  </div>
                  {m.sdkEnabled && m.sdkApiKey && (
                    <div className="bg-muted/50 rounded-md p-2 flex items-center gap-2">
                      <code className="text-xs font-mono flex-1 min-w-0 text-foreground/80">
                        {visibleKeys[m.id] ? m.sdkApiKey : m.sdkApiKey.slice(0, 12) + "••••••••••••••••••••••••••••••••••"}
                      </code>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                        onClick={() => setVisibleKeys(v => ({ ...v, [m.id]: !v[m.id] }))}
                        data-testid={`button-toggle-sdk-key-${m.id}`}>
                        <Eye className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                        onClick={() => { navigator.clipboard.writeText(m.sdkApiKey!); toast({ title: "Clé SDK copiée" }); }}
                        data-testid={`button-copy-sdk-key-${m.id}`}>
                        <Copy className="w-3 h-3" />
                      </Button>
                      <Button variant="outline" size="sm" className="h-6 text-xs gap-1 shrink-0"
                        onClick={() => regenerateKey(m.id)}
                        data-testid={`button-regen-sdk-key-${m.id}`}>
                        <RefreshCw className="w-3 h-3" />Regén.
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><BookOpen className="w-4 h-4" />Endpoints SDK disponibles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            {[
              { method: "POST", path: "/api/sdk/v1/payin", desc: "Initier un paiement entrant (Mobile Money via Mbiyo)" },
              { method: "POST", path: "/api/sdk/v1/payout", desc: "Initier un retrait automatique (Mobile Money via Mbiyo)" },
              { method: "GET", path: "/api/sdk/v1/transaction/:orderId", desc: "Consulter le statut d'une transaction" },
              { method: "GET", path: "/api/sdk/v1/balance", desc: "Consulter les soldes par pays" },
              { method: "GET", path: "/api/sdk/v1/ping", desc: "Vérifier la connexion SDK" },
            ].map(ep => (
              <div key={ep.path} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50">
                <Badge variant={ep.method === "POST" ? "default" : "secondary"} className="text-xs shrink-0 font-mono">{ep.method}</Badge>
                <div className="min-w-0">
                  <code className="text-xs font-mono text-foreground/80 block">{ep.path}</code>
                  <p className="text-xs text-muted-foreground mt-0.5">{ep.desc}</p>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-2 border-t">Header requis: <code className="font-mono bg-muted px-1 rounded">X-SDK-Key: WP-SDK-...</code></p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type Period = "today" | "month" | "all";

function AnalyticsPanel() {
  const [period, setPeriod] = useState<Period>("month");

  const { data: byMerchant, isLoading: loadingMerchant, isError: errorMerchant } = useAdminFetch(
    `/api/admin/stats/by-merchant?period=${period}`,
    ["/api/admin/stats/by-merchant", period],
    { staleTime: 30000 }
  );

  const { data: byCountry, isLoading: loadingCountry, isError: errorCountry } = useAdminFetch(
    `/api/admin/stats/by-country?period=${period}`,
    ["/api/admin/stats/by-country", period],
    { staleTime: 30000 }
  );

  const fmt = (n: number) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  const fmtSigned = (n: number) => (n >= 0 ? "+" : "") + fmt(n);

  const periodLabel: Record<Period, string> = { today: "Aujourd'hui", month: "Ce mois", all: "Tout" };

  const merchantRows = (byMerchant as { merchantId: number; merchantName: string; collectionBenefit: number; withdrawalBenefit: number; transferBenefit: number; totalBenefit: number }[] | undefined) || [];
  const countryRows = (byCountry as { country: string; collectionBenefit: number; withdrawalBenefit: number; totalBenefit: number }[] | undefined) || [];

  const totalMerchant = merchantRows.reduce((s, r) => s + r.totalBenefit, 0);
  const totalCountry = countryRows.reduce((s, r) => s + r.totalBenefit, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold">Analytique — Bénéfice net</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Bénéfice net WestPay par marchand (collectes + retraits − frais fournisseur + frais virements wallet) et par pays (collectes + retraits − frais fournisseur).</p>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(["today", "month", "all"] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              data-testid={`btn-period-${p}`}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {periodLabel[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2"><Users className="w-4 h-4 text-primary" />Par marchand</span>
              <span className="text-sm font-normal text-muted-foreground">Total : <span className="font-semibold text-foreground">{fmt(totalMerchant)} FCFA</span></span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingMerchant ? (
              <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : errorMerchant ? (
              <p className="text-sm text-red-500 text-center py-8">Erreur de chargement des données.</p>
            ) : !merchantRows.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">Aucune donnée pour cette période.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Marchand</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Collectes</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Retraits</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Virements</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {merchantRows.map((row, i) => (
                      <tr key={row.merchantId} data-testid={`row-merchant-${row.merchantId}`} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${i === 0 ? "bg-primary/4" : ""}`}>
                        <td className="px-4 py-2.5 font-medium truncate max-w-36">{row.merchantName}</td>
                        <td className={`text-right px-3 py-2.5 tabular-nums text-xs ${row.collectionBenefit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{fmtSigned(row.collectionBenefit)}</td>
                        <td className={`text-right px-3 py-2.5 tabular-nums text-xs ${row.withdrawalBenefit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{fmtSigned(row.withdrawalBenefit)}</td>
                        <td className={`text-right px-3 py-2.5 tabular-nums text-xs ${row.transferBenefit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{fmtSigned(row.transferBenefit)}</td>
                        <td className={`text-right px-4 py-2.5 font-semibold tabular-nums ${row.totalBenefit >= 0 ? "text-foreground" : "text-red-500"}`}>{fmt(row.totalBenefit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2"><Globe className="w-4 h-4 text-primary" />Par pays</span>
              <span className="text-sm font-normal text-muted-foreground">Total : <span className="font-semibold text-foreground">{fmt(totalCountry)} FCFA</span></span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingCountry ? (
              <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : errorCountry ? (
              <p className="text-sm text-red-500 text-center py-8">Erreur de chargement des données.</p>
            ) : !countryRows.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">Aucune donnée pour cette période.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Pays</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Collectes</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Retraits</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {countryRows.map((row, i) => (
                      <tr key={row.country} data-testid={`row-country-${row.country}`} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${i === 0 ? "bg-primary/4" : ""}`}>
                        <td className="px-4 py-2.5 font-medium">{row.country}</td>
                        <td className={`text-right px-3 py-2.5 tabular-nums text-xs ${row.collectionBenefit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{fmtSigned(row.collectionBenefit)}</td>
                        <td className={`text-right px-3 py-2.5 tabular-nums text-xs ${row.withdrawalBenefit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{fmtSigned(row.withdrawalBenefit)}</td>
                        <td className={`text-right px-4 py-2.5 font-semibold tabular-nums ${row.totalBenefit >= 0 ? "text-foreground" : "text-red-500"}`}>{fmt(row.totalBenefit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SecurityIpsPanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [secTab, setSecTab] = useState<"allowed" | "blocked" | "devices" | "trusted-devices" | "countries" | "settings" | "logs">("allowed");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ ipAddress: "", userEmail: "", role: "merchant", note: "" });
  const [blockForm, setBlockForm] = useState({ ipAddress: "", reason: "" });
  const [adding, setAdding] = useState(false);
  const [addingBlock, setAddingBlock] = useState(false);

  const fetchWith = async (url: string) => {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error("Erreur");
    return r.json();
  };

  const { data: ips = [], isLoading: ipsLoading, refetch: refetchIps } = useQuery<any[]>({
    queryKey: ["/api/admin/security/ips"],
    queryFn: () => fetchWith("/api/admin/security/ips"),
    staleTime: 15_000,
  });

  const { data: blockedIpsList = [], isLoading: blockedLoading, refetch: refetchBlocked } = useQuery<any[]>({
    queryKey: ["/api/admin/security/blocked-ips"],
    queryFn: () => fetchWith("/api/admin/security/blocked-ips"),
    staleTime: 15_000,
    enabled: secTab === "blocked",
  });

  const { data: blockedDevices = [], isLoading: devicesLoading, refetch: refetchDevices } = useQuery<any[]>({
    queryKey: ["/api/admin/security/blocked-devices"],
    queryFn: () => fetchWith("/api/admin/security/blocked-devices"),
    staleTime: 15_000,
    enabled: secTab === "devices",
  });

  const { data: secLogs = [], isLoading: logsLoading, refetch: refetchLogs } = useQuery<any[]>({
    queryKey: ["/api/admin/security/logs"],
    queryFn: () => fetchWith("/api/admin/security/logs?limit=50"),
    staleTime: 20_000,
    enabled: secTab === "logs",
  });

  const { data: trustedDevices = [], isLoading: trustedDevicesLoading, refetch: refetchTrustedDevices } = useQuery<any[]>({
    queryKey: ["/api/admin/security/devices"],
    queryFn: () => fetchWith("/api/admin/security/devices"),
    staleTime: 15_000,
    enabled: secTab === "trusted-devices",
  });

  const { data: secConfig = { twoFa: false, deviceCheck: false, vpnBlock: false, blockedCountries: [] }, isLoading: configLoading, refetch: refetchConfig } = useQuery<any>({
    queryKey: ["/api/admin/security/config"],
    queryFn: () => fetchWith("/api/admin/security/config"),
    staleTime: 30_000,
    enabled: secTab === "settings" || secTab === "countries",
  });

  const [newCountry, setNewCountry] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  const { data: loginLogs = [], isLoading: loginLogsLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/login-logs"],
    queryFn: () => fetchWith("/api/admin/login-logs?limit=30"),
    staleTime: 30_000,
    enabled: secTab === "allowed",
  });

  const addMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const r = await fetch("/api/admin/security/ips", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message || "Erreur"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security/ips"] });
      toast({ title: "IP autorisée", description: `${form.ipAddress} ajoutée avec succès.` });
      setForm({ ipAddress: "", userEmail: "", role: "merchant", note: "" });
      setAdding(false);
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/admin/security/ips/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("Erreur");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/security/ips"] }); toast({ title: "IP retirée" }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const addBlockMutation = useMutation({
    mutationFn: async (data: typeof blockForm) => {
      const r = await fetch("/api/admin/security/blocked-ips", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message || "Erreur"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security/blocked-ips"] });
      toast({ title: "IP bloquée", description: `${blockForm.ipAddress} bloquée avec succès.` });
      setBlockForm({ ipAddress: "", reason: "" });
      setAddingBlock(false);
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const removeBlockMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/admin/security/blocked-ips/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("Erreur");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/security/blocked-ips"] }); toast({ title: "IP débloquée" }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const removeDeviceMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/admin/security/blocked-devices/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("Erreur");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/security/blocked-devices"] }); toast({ title: "Appareil débloqué" }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const trustDeviceMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/admin/security/devices/${id}/trust`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("Erreur");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/security/devices"] }); toast({ title: "Appareil autorisé" }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const blockTrustedDeviceMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/admin/security/devices/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("Erreur");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/security/devices"] }); toast({ title: "Appareil bloqué" }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const saveSecConfig = async (patch: Partial<{ twoFa: boolean; deviceCheck: boolean; vpnBlock: boolean; blockedCountries: string[] }>) => {
    setSavingConfig(true);
    try {
      const r = await fetch("/api/admin/security/config", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error("Erreur");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security/config"] });
      toast({ title: "Configuration sauvegardée" });
    } catch (e: any) { toast({ title: "Erreur", description: e.message, variant: "destructive" }); }
    finally { setSavingConfig(false); }
  };

  const getField = (row: any, ...keys: string[]) => { for (const k of keys) if (row[k]) return row[k]; return ""; };

  const filtered = ips.filter((ip: any) =>
    getField(ip, "ipAddress", "ip_address").includes(search) ||
    getField(ip, "userEmail", "user_email").toLowerCase().includes(search.toLowerCase())
  );

  const filteredBlocked = blockedIpsList.filter((ip: any) =>
    getField(ip, "ipAddress", "ip_address").includes(search)
  );

  const EVENT_LABELS: Record<string, { label: string; color: string }> = {
    ip_blocked: { label: "IP bloquée", color: "bg-red-500" },
    ip_allowed: { label: "IP autorisée", color: "bg-green-500" },
    ip_unblocked: { label: "IP débloquée", color: "bg-blue-500" },
    device_blocked: { label: "Appareil bloqué", color: "bg-orange-500" },
    brute_force: { label: "Brute Force", color: "bg-red-600" },
    blocked_access: { label: "Accès bloqué", color: "bg-red-400" },
    blocked_device: { label: "Appareil bloqué", color: "bg-orange-400" },
    blocked_login_attempt: { label: "Login bloqué", color: "bg-red-500" },
  };

  const tabBtnClass = (t: string) =>
    `px-4 py-2 text-sm font-medium rounded-md transition-colors ${secTab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Sécurité avancée</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Surveillance et contrôle d'accès à la plateforme</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 p-1 bg-muted rounded-lg">
        <button className={tabBtnClass("allowed")} onClick={() => setSecTab("allowed")} data-testid="tab-sec-allowed">
          ✅ IPs Autorisées
        </button>
        <button className={tabBtnClass("blocked")} onClick={() => setSecTab("blocked")} data-testid="tab-sec-blocked">
          ⛔ IPs Bloquées
        </button>
        <button className={tabBtnClass("trusted-devices")} onClick={() => setSecTab("trusted-devices")} data-testid="tab-sec-trusted-devices">
          📱 Appareils
        </button>
        <button className={tabBtnClass("devices")} onClick={() => setSecTab("devices")} data-testid="tab-sec-devices">
          🚫 Appareils Bloqués
        </button>
        <button className={tabBtnClass("countries")} onClick={() => setSecTab("countries")} data-testid="tab-sec-countries">
          🌍 Pays Bloqués
        </button>
        <button className={tabBtnClass("settings")} onClick={() => setSecTab("settings")} data-testid="tab-sec-settings">
          ⚙️ Paramètres
        </button>
        <button className={tabBtnClass("logs")} onClick={() => setSecTab("logs")} data-testid="tab-sec-logs">
          📋 Logs
        </button>
      </div>

      {/* ── IPs Autorisées ─────────────────────────────────────────────────────── */}
      {secTab === "allowed" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">IPs pouvant accéder au dashboard admin</p>
            <Button size="sm" onClick={() => setAdding(true)} className="gap-2" data-testid="button-add-ip">
              <Plus className="w-4 h-4" /> Donner accès
            </Button>
          </div>

          {ips.length === 0 && !ipsLoading && (
            <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">Mode ouvert</p>
                  <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">Tant qu'aucune IP n'est ajoutée, toutes les adresses peuvent accéder. Ajoutez votre IP en premier pour activer la protection.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {adding && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4 text-primary" />Autoriser une nouvelle IP</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Adresse IP *</Label>
                    <Input placeholder="192.168.1.1" value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} data-testid="input-new-ip" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email (optionnel)</Label>
                    <Input placeholder="user@exemple.com" value={form.userEmail} onChange={(e) => setForm({ ...form, userEmail: e.target.value })} data-testid="input-ip-email" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Rôle</Label>
                    <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                      <SelectTrigger data-testid="select-ip-role"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrateur</SelectItem>
                        <SelectItem value="merchant">Marchand</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Note</Label>
                    <Input placeholder="Ex: Bureau principal" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} data-testid="input-ip-note" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => addMutation.mutate(form)} disabled={!form.ipAddress || addMutation.isPending} className="gap-2" data-testid="button-confirm-add-ip">
                    {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Autoriser
                  </Button>
                  <Button variant="outline" onClick={() => setAdding(false)} data-testid="button-cancel-add-ip">Annuler</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-ip" />
                </div>
                <Button variant="outline" size="icon" onClick={() => refetchIps()} data-testid="button-refresh-ips"><RefreshCw className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {ipsLoading ? <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              : filtered.length === 0 ? (
                <div className="p-8 text-center"><Shield className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" /><p className="text-sm text-muted-foreground">{search ? "Aucun résultat" : "Aucune IP autorisée"}</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">IP</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Email</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Rôle</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Localisation</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Date</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Action</th>
                    </tr></thead>
                    <tbody>
                      {filtered.map((ip: any) => (
                        <tr key={ip.id} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-ip-${ip.id}`}>
                          <td className="px-4 py-3"><span className="font-mono font-semibold text-foreground">{getField(ip, "ipAddress", "ip_address")}</span></td>
                          <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs">{getField(ip, "userEmail", "user_email") || "—"}</td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <Badge variant={(ip.role === "admin") ? "default" : "secondary"} className="text-xs">{ip.role === "admin" ? "Admin" : "Marchand"}</Badge>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">
                            {[getField(ip, "city"), getField(ip, "country")].filter(Boolean).join(", ") || "—"}
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">
                            {(ip.createdAt || ip.created_at) ? new Date(ip.createdAt || ip.created_at).toLocaleDateString("fr-FR") : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => removeMutation.mutate(ip.id)} disabled={removeMutation.isPending} data-testid={`button-remove-ip-${ip.id}`}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dernières connexions */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground" />Dernières connexions</CardTitle></CardHeader>
            <CardContent>
              {loginLogsLoading ? <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              : !loginLogs.length ? <p className="text-sm text-muted-foreground">Aucune connexion enregistrée.</p>
              : (
                <div className="space-y-1">
                  {loginLogs.map((log: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-3 py-2 border-b last:border-0 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${log.success ? "bg-green-500" : "bg-red-500"}`} />
                        <span className="font-mono text-xs text-muted-foreground truncate">{log.ip || "—"}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={log.role === "admin" ? "default" : "secondary"} className="text-xs">{log.role}</Badge>
                        <span className="text-xs text-muted-foreground hidden sm:block">
                          {log.created_at ? new Date(log.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── IPs Bloquées ──────────────────────────────────────────────────────── */}
      {secTab === "blocked" && (
        <div className="space-y-5">
          {/* Formulaire toujours visible */}
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" /> Bloquer une adresse IP
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="Adresse IP ex: 105.235.26.127"
                  value={blockForm.ipAddress}
                  onChange={(e) => setBlockForm({ ...blockForm, ipAddress: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter" && blockForm.ipAddress) addBlockMutation.mutate(blockForm); }}
                  className="font-mono flex-1"
                  data-testid="input-block-ip"
                />
                <Input
                  placeholder="Raison (optionnel)"
                  value={blockForm.reason}
                  onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter" && blockForm.ipAddress) addBlockMutation.mutate(blockForm); }}
                  className="flex-1 sm:max-w-[220px]"
                  data-testid="input-block-reason"
                />
                <Button
                  variant="destructive"
                  onClick={() => addBlockMutation.mutate(blockForm)}
                  disabled={!blockForm.ipAddress.trim() || addBlockMutation.isPending}
                  className="gap-2 shrink-0"
                  data-testid="button-confirm-block-ip"
                >
                  {addBlockMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  Bloquer
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Appuyez sur Entrée ou cliquez Bloquer · Via Telegram : <span className="font-mono">/bloquerip 1.2.3.4 raison</span></p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Rechercher une IP..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <Button variant="outline" size="icon" onClick={() => refetchBlocked()}><RefreshCw className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {blockedLoading ? <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              : filteredBlocked.length === 0 ? (
                <div className="p-8 text-center"><Shield className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" /><p className="text-sm text-muted-foreground">Aucune IP bloquée</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">IP</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Localisation</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Raison</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Bloqué par</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Date</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Action</th>
                    </tr></thead>
                    <tbody>
                      {filteredBlocked.map((ip: any) => (
                        <tr key={ip.id} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-blocked-ip-${ip.id}`}>
                          <td className="px-4 py-3">
                            <span className="font-mono font-semibold text-red-500">{getField(ip, "ipAddress", "ip_address")}</span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                            {[getField(ip, "city"), getField(ip, "country")].filter(Boolean).join(", ") || "—"}
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">{ip.reason || "—"}</td>
                          <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">{getField(ip, "blockedBy", "blocked_by") || "—"}</td>
                          <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs">
                            {(ip.createdAt || ip.created_at) ? new Date(ip.createdAt || ip.created_at).toLocaleDateString("fr-FR") : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="outline" size="sm" className="text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20 hover:text-green-700 text-xs gap-1"
                              onClick={() => removeBlockMutation.mutate(ip.id)} disabled={removeBlockMutation.isPending} data-testid={`button-unblock-ip-${ip.id}`}>
                              <CheckCircle className="w-3.5 h-3.5" /> Débloquer
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Appareils Bloqués ─────────────────────────────────────────────────── */}
      {secTab === "devices" && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">Appareils dont l'empreinte numérique est bloquée, même en cas de changement d'IP ou VPN.</p>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-end">
                <Button variant="outline" size="icon" onClick={() => refetchDevices()}><RefreshCw className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {devicesLoading ? <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              : blockedDevices.length === 0 ? (
                <div className="p-8 text-center"><Shield className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" /><p className="text-sm text-muted-foreground">Aucun appareil bloqué</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Empreinte</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Dernière IP</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Raison</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Date</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Action</th>
                    </tr></thead>
                    <tbody>
                      {blockedDevices.map((d: any) => (
                        <tr key={d.id} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-blocked-device-${d.id}`}>
                          <td className="px-4 py-3"><span className="font-mono text-xs text-orange-500">{(d.fingerprint || "").substring(0, 20)}…</span></td>
                          <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs font-mono">{getField(d, "ipAddress", "ip_address") || "—"}</td>
                          <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">{d.reason || "—"}</td>
                          <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs">
                            {(d.createdAt || d.created_at) ? new Date(d.createdAt || d.created_at).toLocaleDateString("fr-FR") : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="outline" size="sm" className="text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20 text-xs gap-1"
                              onClick={() => removeDeviceMutation.mutate(d.id)} disabled={removeDeviceMutation.isPending} data-testid={`button-unblock-device-${d.id}`}>
                              <CheckCircle className="w-3.5 h-3.5" /> Débloquer
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Appareils Connus (trust/block) ────────────────────────────────────── */}
      {secTab === "trusted-devices" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Appareils détectés lors des connexions admin. Les appareils non-fiables bloquent la connexion si la vérification est activée.</p>
            <Button variant="outline" size="icon" onClick={() => refetchTrustedDevices()} data-testid="button-refresh-trusted-devices"><RefreshCw className="w-4 h-4" /></Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {trustedDevicesLoading ? <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              : trustedDevices.length === 0 ? (
                <div className="p-8 text-center"><Shield className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" /><p className="text-sm text-muted-foreground">Aucun appareil enregistré</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Statut</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Navigateur / OS</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Dernière IP</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Localisation</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Vu le</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                    </tr></thead>
                    <tbody>
                      {trustedDevices.map((d: any) => {
                        const trusted = d.isTrusted || d.is_trusted;
                        const loc = [d.city, d.country].filter(Boolean).join(", ") || "—";
                        const seenAt = d.lastSeen || d.last_seen;
                        return (
                          <tr key={d.id} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-trusted-device-${d.id}`}>
                            <td className="px-4 py-3">
                              <Badge variant={trusted ? "default" : "secondary"} className={`text-xs ${trusted ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>
                                {trusted ? "✅ Autorisé" : "⏳ En attente"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-xs">{d.browser || "—"}</div>
                              <div className="text-muted-foreground text-xs">{d.os || "—"}</div>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs font-mono">{d.ipAddress || d.ip_address || "—"}</td>
                            <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">{loc}</td>
                            <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs">
                              {seenAt ? new Date(seenAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {!trusted && (
                                  <Button variant="outline" size="sm" className="text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20 text-xs gap-1"
                                    onClick={() => trustDeviceMutation.mutate(d.id)} disabled={trustDeviceMutation.isPending} data-testid={`button-trust-device-${d.id}`}>
                                    <CheckCircle className="w-3.5 h-3.5" /> Autoriser
                                  </Button>
                                )}
                                <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 text-xs"
                                  onClick={() => blockTrustedDeviceMutation.mutate(d.id)} disabled={blockTrustedDeviceMutation.isPending} data-testid={`button-block-trusted-device-${d.id}`}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Pays Bloqués ──────────────────────────────────────────────────────── */}
      {secTab === "countries" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Les connexions depuis ces pays seront automatiquement refusées lors du login admin.</p>
            <Button variant="outline" size="icon" onClick={() => refetchConfig()} data-testid="button-refresh-countries"><RefreshCw className="w-4 h-4" /></Button>
          </div>

          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" /> Ajouter un pays à bloquer
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Ex: Nigeria, Russie, Iran..."
                  value={newCountry}
                  onChange={(e) => setNewCountry(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newCountry.trim()) {
                      const updated = [...(secConfig.blockedCountries || []), newCountry.trim()];
                      saveSecConfig({ blockedCountries: updated });
                      setNewCountry("");
                    }
                  }}
                  className="flex-1"
                  data-testid="input-new-country"
                />
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (!newCountry.trim()) return;
                    const updated = [...(secConfig.blockedCountries || []), newCountry.trim()];
                    saveSecConfig({ blockedCountries: updated });
                    setNewCountry("");
                  }}
                  disabled={!newCountry.trim() || savingConfig}
                  className="gap-2 shrink-0"
                  data-testid="button-add-country"
                >
                  {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Bloquer
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {configLoading ? <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              : !secConfig.blockedCountries?.length ? (
                <div className="p-8 text-center">
                  <Globe className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">Aucun pays bloqué — toutes les connexions sont autorisées</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Pays</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Action</th>
                    </tr></thead>
                    <tbody>
                      {secConfig.blockedCountries.map((c: string, i: number) => (
                        <tr key={i} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-blocked-country-${i}`}>
                          <td className="px-4 py-3">
                            <span className="font-medium text-red-500">🌍 {c}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                const updated = secConfig.blockedCountries.filter((_: string, idx: number) => idx !== i);
                                saveSecConfig({ blockedCountries: updated });
                              }}
                              disabled={savingConfig}
                              data-testid={`button-remove-country-${i}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Paramètres Sécurité ────────────────────────────────────────────────── */}
      {secTab === "settings" && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">Activez ou désactivez les protections avancées pour le login administrateur.</p>
          {configLoading ? <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 2FA */}
              <Card className={secConfig.twoFa ? "border-green-300 dark:border-green-700" : ""}>
                <CardContent className="p-5 flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${secConfig.twoFa ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"}`}>
                    <KeyRound className={`w-5 h-5 ${secConfig.twoFa ? "text-green-600" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-semibold text-sm">2FA via Telegram</p>
                      <Badge variant={secConfig.twoFa ? "default" : "secondary"} className="text-xs">{secConfig.twoFa ? "Actif" : "Inactif"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">Envoie un code OTP sur Telegram après le mot de passe.</p>
                    <Button size="sm" variant={secConfig.twoFa ? "destructive" : "default"} onClick={() => saveSecConfig({ twoFa: !secConfig.twoFa })} disabled={savingConfig} data-testid="button-toggle-2fa">
                      {savingConfig ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                      {secConfig.twoFa ? "Désactiver" : "Activer"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Device Check */}
              <Card className={secConfig.deviceCheck ? "border-blue-300 dark:border-blue-700" : ""}>
                <CardContent className="p-5 flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${secConfig.deviceCheck ? "bg-blue-100 dark:bg-blue-900/30" : "bg-muted"}`}>
                    <Monitor className={`w-5 h-5 ${secConfig.deviceCheck ? "text-blue-600" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-semibold text-sm">Vérification d'appareil</p>
                      <Badge variant={secConfig.deviceCheck ? "default" : "secondary"} className="text-xs">{secConfig.deviceCheck ? "Actif" : "Inactif"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">Bloque les nouveaux appareils jusqu'à validation Telegram.</p>
                    <Button size="sm" variant={secConfig.deviceCheck ? "destructive" : "default"} onClick={() => saveSecConfig({ deviceCheck: !secConfig.deviceCheck })} disabled={savingConfig} data-testid="button-toggle-device-check">
                      {savingConfig ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                      {secConfig.deviceCheck ? "Désactiver" : "Activer"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* VPN Block */}
              <Card className={secConfig.vpnBlock ? "border-orange-300 dark:border-orange-700" : ""}>
                <CardContent className="p-5 flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${secConfig.vpnBlock ? "bg-orange-100 dark:bg-orange-900/30" : "bg-muted"}`}>
                    <EyeOff className={`w-5 h-5 ${secConfig.vpnBlock ? "text-orange-600" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-semibold text-sm">Blocage VPN / Proxy</p>
                      <Badge variant={secConfig.vpnBlock ? "default" : "secondary"} className="text-xs">{secConfig.vpnBlock ? "Actif" : "Inactif"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">Refuse automatiquement les connexions via VPN ou proxy.</p>
                    <Button size="sm" variant={secConfig.vpnBlock ? "destructive" : "default"} onClick={() => saveSecConfig({ vpnBlock: !secConfig.vpnBlock })} disabled={savingConfig} data-testid="button-toggle-vpn-block">
                      {savingConfig ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                      {secConfig.vpnBlock ? "Désactiver" : "Activer"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Info card */}
              <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 sm:col-span-1">
                <CardContent className="p-5 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-400 mb-1">Important</p>
                    <p className="text-xs text-amber-700 dark:text-amber-500">La 2FA et la vérification d'appareils nécessitent que le groupe Telegram admin soit configuré. Les alertes de localisation sont toujours envoyées.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ── Logs Sécurité ─────────────────────────────────────────────────────── */}
      {secTab === "logs" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Historique des événements de sécurité</p>
            <Button variant="outline" size="icon" onClick={() => refetchLogs()}><RefreshCw className="w-4 h-4" /></Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {logsLoading ? <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              : secLogs.length === 0 ? (
                <div className="p-8 text-center"><Shield className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" /><p className="text-sm text-muted-foreground">Aucun événement enregistré</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Événement</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">IP</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Détails</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Admin Telegram</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                    </tr></thead>
                    <tbody>
                      {secLogs.map((log: any) => {
                        const evType = log.eventType || log.event_type || "";
                        const evInfo = EVENT_LABELS[evType] || { label: evType, color: "bg-gray-400" };
                        return (
                          <tr key={log.id} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-seclog-${log.id}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full shrink-0 ${evInfo.color}`} />
                                <span className="text-xs font-medium">{evInfo.label}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs font-mono">{log.ip || "—"}</td>
                            <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs max-w-[200px] truncate">{log.details || log.action || "—"}</td>
                            <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">{getField(log, "telegramAdmin", "telegram_admin") || "—"}</td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">
                              {(log.createdAt || log.created_at) ? new Date(log.createdAt || log.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function AdminActionLogsPanel() {
  const { token } = useAuth();
  const [filter, setFilter] = useState<"all" | "login" | "security">("all");
  const [search, setSearch] = useState("");

  const fetchWith = async (url: string) => {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error("Erreur");
    return r.json();
  };

  const { data: logs = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/action-logs"],
    queryFn: () => fetchWith("/api/admin/action-logs?limit=100"),
    refetchInterval: 30_000,
  });

  const filtered = (logs as any[]).filter(log => {
    if (filter === "login" && log._type !== "login") return false;
    if (filter === "security" && log._type !== "security") return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (log.userEmail || "").toLowerCase().includes(q) ||
      (log.ip || "").toLowerCase().includes(q) ||
      (log.action || "").toLowerCase().includes(q) ||
      (log.details || "").toLowerCase().includes(q) ||
      (log.eventType || "").toLowerCase().includes(q) ||
      (log.device || "").toLowerCase().includes(q)
    );
  });

  const badgeForType = (log: any) => {
    if (log._type === "login") {
      return log.success
        ? <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-500/15 text-green-400">Connexion réussie</span>
        : <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/15 text-red-400">Échec connexion</span>;
    }
    const evtColor: Record<string, string> = {
      blocked_access: "bg-red-500/15 text-red-400",
      brute_force: "bg-orange-500/15 text-orange-400",
      ip_blocked: "bg-orange-500/15 text-orange-400",
      new_device: "bg-blue-500/15 text-blue-400",
      blocked_device: "bg-red-500/15 text-red-400",
      vpn_detected: "bg-yellow-500/15 text-yellow-400",
      location_jump: "bg-purple-500/15 text-purple-400",
      country_blocked: "bg-red-500/15 text-red-400",
      unauthorized_2fa_disable: "bg-red-600/20 text-red-400",
      unauthorized_admin_creation: "bg-red-600/20 text-red-400",
    };
    const cls = evtColor[log.eventType] || "bg-muted text-muted-foreground";
    return <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>{log.eventType || log.action || "événement"}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Logs d'actions</h2>
          <p className="text-sm text-muted-foreground">Toutes les connexions et événements de sécurité — mis à jour en temps réel</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-actionlogs">
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Rafraîchir
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "login", "security"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            data-testid={`filter-actionlogs-${f}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
          >
            {f === "all" ? `Tous (${logs.length})` : f === "login" ? `Connexions (${logs.filter((l:any) => l._type === "login").length})` : `Sécurité (${logs.filter((l:any) => l._type === "security").length})`}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher..."
            data-testid="input-search-actionlogs"
            className="pl-8 pr-3 py-1.5 bg-muted rounded-lg text-sm w-52 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">Aucun log trouvé</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Email / Utilisateur</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">IP</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Détails</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log: any, i: number) => (
                    <tr key={`${log._type}-${log.id}-${i}`} className="border-b border-border/30 hover:bg-muted/30 transition-colors" data-testid={`row-actionlog-${i}`}>
                      <td className="px-4 py-3">{badgeForType(log)}</td>
                      <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs font-mono">
                        {log.userEmail || log.role || "—"}
                        {log._type === "login" && log.device && (
                          <div className="text-[10px] text-muted-foreground/60 truncate max-w-[180px]">{log.device}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs font-mono">{log.ip || "—"}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs max-w-[220px] truncate">
                        {log.details || log.action || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      setLocation("/admin-access-958425546648484886646634808526522886433");
    }
  }, [authLoading, user, setLocation]);

  if (authLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!user || user.role !== "admin") return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  type MenuGroup = { label: string; items: { title: string; icon: any; tab: AdminTab }[] };
  const menuGroups: MenuGroup[] = [
    {
      label: "Tableau de bord",
      items: [
        { title: "Vue d'ensemble", icon: BarChart3, tab: "overview" },
        { title: "Analytique", icon: TrendingUp, tab: "analytics" },
      ],
    },
    {
      label: "Marchands",
      items: [
        { title: "Marchands", icon: Users, tab: "merchants" },
        { title: "Transactions", icon: ArrowRightLeft, tab: "transactions" },
        { title: "Liens de paiement", icon: Link, tab: "paymentlinks" },
        { title: "Virements", icon: ArrowUpRight, tab: "virements" },
        { title: "Reversements", icon: Download, tab: "reversements" },
      ],
    },
    {
      label: "Infrastructure",
      items: [
        { title: "Pays & API", icon: Globe, tab: "countries" },
        { title: "Numéros SIM", icon: Phone, tab: "numbers" },
        { title: "SMS reçus", icon: MessageSquare, tab: "sms" },
        { title: "API & PIN", icon: Key, tab: "apikeys" },
      ],
    },
    {
      label: "Passerelles",
      items: [
        { title: "OmniPay", icon: Zap, tab: "omnipay" },
        { title: "Mbiyo", icon: Globe, tab: "mbiyo" },
        { title: "SendavaPay", icon: Zap, tab: "sendavapay" },
        { title: "Crypto", icon: Bitcoin, tab: "cryptoagg" },
        { title: "Retraits Crypto", icon: Download, tab: "cryptowithdrawals" },
      ],
    },
    {
      label: "Administration",
      items: [
        { title: "Administrateurs", icon: Shield, tab: "admins" },
        { title: "Sécurité IP", icon: Lock, tab: "security" },
        { title: "Logs d'actions", icon: FileText, tab: "actionlogs" },
        { title: "Paramètres", icon: Settings, tab: "settings" },
        { title: "SDK API", icon: BookOpen, tab: "sdk" },
        { title: "Notifications", icon: Mail, tab: "notifications" },
        { title: "Support Bot", icon: MessageSquare, tab: "userbot" },
        { title: "Base de connaissances", icon: BookOpen, tab: "knowledge" },
      ],
    },
  ];

  const activeTabTitle = menuGroups.flatMap(g => g.items).find(i => i.tab === activeTab)?.title ?? "Administration";

  const style = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <Sidebar className="border-r border-sidebar-border bg-sidebar">
          <SidebarContent>
            {/* ── Logo / Brand ─────────────────────────────────────────── */}
            <SidebarGroup>
              <div className="px-3 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm shrink-0">
                    <Shield className="w-4 h-4 text-primary-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-sidebar-foreground leading-tight tracking-tight">WestPay</p>
                    <p className="text-[10px] text-muted-foreground leading-tight font-medium uppercase tracking-widest">Admin</p>
                  </div>
                </div>
              </div>
            </SidebarGroup>
            <Separator className="opacity-60" />

            {/* ── Grouped Navigation ───────────────────────────────────── */}
            {menuGroups.map((group) => (
              <SidebarGroup key={group.label} className="py-1">
                <SidebarGroupLabel className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/70 px-3 py-1.5">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.tab}>
                        <SidebarMenuButton
                          onClick={() => setActiveTab(item.tab)}
                          isActive={activeTab === item.tab}
                          data-testid={`nav-${item.tab}`}
                          className="gap-2.5 rounded-lg text-sm font-medium"
                        >
                          <item.icon className="w-4 h-4 shrink-0" />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}

            {/* ── Bottom: admin email ───────────────────────────────────── */}
            <div className="mt-auto">
              <Separator className="opacity-60" />
              <div className="px-3 py-3 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 ring-2 ring-primary/20">
                  <img
                    src={getAvatarUrl(user.email, 48)}
                    alt={user.email}
                    className="w-full h-full object-cover"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-sidebar-foreground truncate leading-tight">{user.email}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">Administrateur</p>
                </div>
              </div>
            </div>
          </SidebarContent>
        </Sidebar>

        <div className="flex flex-col flex-1 min-w-0">
          {/* ── Top Header ────────────────────────────────────────────── */}
          <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b sticky top-0 z-50 bg-background/95 backdrop-blur-sm shadow-xs">
            <div className="flex items-center gap-3">
              <SidebarTrigger data-testid="button-sidebar-toggle" className="text-muted-foreground hover:text-foreground" />
              <span className="w-px h-4 bg-border hidden sm:block" />
              <div className="hidden sm:flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <h1 className="text-sm font-semibold text-foreground">{activeTabTitle}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden md:block">{user.email}</span>
              <div className="w-7 h-7 rounded-full overflow-hidden ring-2 ring-primary/20">
                <img
                  src={getAvatarUrl(user.email, 48)}
                  alt={user.email}
                  className="w-full h-full object-cover"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 md:p-6">
            {activeTab === "overview" && <OverviewPanel />}
            {activeTab === "analytics" && <AnalyticsPanel />}
            {activeTab === "merchants" && <MerchantsPanel />}
            {activeTab === "paymentlinks" && <AdminPaymentLinksPanel />}
            {activeTab === "transactions" && <TransactionsPanel />}
            {activeTab === "countries" && <CountriesPanel />}
            {activeTab === "numbers" && <NumbersPanel />}
            {activeTab === "sms" && <SmsPanel />}
            {activeTab === "apikeys" && <ApiKeysManagementPanel />}
            {activeTab === "omnipay" && <OmniPayPanel />}
            {activeTab === "mbiyo" && <MbiyoPanel />}
            {activeTab === "sendavapay" && <SendavaPayPanel />}
            {activeTab === "cryptoagg" && <CryptoAggPanel />}
            {activeTab === "cryptowithdrawals" && <CryptoWithdrawalsAdminPanel />}
            {activeTab === "virements" && <AdminWalletTransfersPanel />}
            {activeTab === "reversements" && <AdminWithdrawalsPanel />}
            {activeTab === "admins" && <AdminsPanel />}
            {activeTab === "security" && <SecurityIpsPanel />}
            {activeTab === "actionlogs" && <AdminActionLogsPanel />}
            {activeTab === "settings" && <SettingsPanel />}
            {activeTab === "sdk" && <SdkPanel />}
            {activeTab === "notifications" && <NotificationsPanel />}
            {activeTab === "userbot" && <UserbotPanel />}
            {activeTab === "knowledge" && <KnowledgePanel />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
