import { useState, useEffect, useRef } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger
} from "@/components/ui/sidebar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Wallet, ArrowRightLeft, Key, Settings, LogOut, Loader2, Download,
  Copy, Globe, DollarSign, Hash, TrendingUp, Search, RefreshCw, BookOpen, Lock, ExternalLink,
  Webhook, Send, CheckCircle2, XCircle, Clock, ArrowUpRight, Zap, Link, QrCode,
  Trash2, Plus, ToggleLeft, ToggleRight, Edit3, BarChart3, MessageCircle, Phone, Receipt, User, Calendar, CreditCard, Filter,
  Bell, Mail, HelpCircle, Power
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { MerchantCountry, Transaction, WebhookLog, PaymentLink, WalletTransfer, WalletTransferCountry, Withdrawal } from "@shared/schema";
import { useLanguage, LANGUAGES } from "@/lib/language";

type MerchantTab = "overview" | "apikeys" | "webhook" | "virements" | "reversements" | "settings" | "paymentlinks" | "transactions";

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
  const { data: balance = [], isLoading: balLoading } = useMerchantFetch("/api/merchant/balance", ["/api/merchant/balance"], token);
  const { data: stats } = useMerchantFetch("/api/merchant/stats", ["/api/merchant/stats"], token);

  if (balLoading) return <MerchantLoadingSkeleton />;

  const countries = balance as MerchantCountry[];
  const totalBalance = countries.reduce((sum, c) => sum + (c.balance || 0), 0);
  const activeCount = countries.filter(c => c.active).length;

  return (
    <div
      className="-m-4 md:-m-6 p-4 md:p-6 min-h-full"
      style={{ background: "#e8eaed" }}
    >
      <h2 className="text-xl font-bold mb-5" style={{ color: "#333" }}>Tableau de bord</h2>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>
        Solde / Reversements
      </p>
      <div className="flex flex-col gap-4 mb-6">
        <BigStatCard
          color="#1e88e5"
          label="Solde"
          value={totalBalance.toLocaleString("fr-FR")}
          currency="FCFA"
          sub={`${activeCount} pays actif${activeCount > 1 ? "s" : ""} — ${stats?.transactionCount || 0} transaction${(stats?.transactionCount || 0) > 1 ? "s" : ""}`}
          testId="text-total-balance"
        />
        <BigStatCard
          color="#26a69a"
          label="Reversements"
          value={(stats?.totalWithdrawn || 0).toLocaleString("fr-FR")}
          currency="FCFA"
          testId="text-total-withdrawn"
        />
      </div>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>
        Statistique journalier
      </p>
      <div className="flex flex-col gap-4 mb-6">
        <BigStatCard
          color="#ef5350"
          label="Aujourd'hui"
          value={(stats?.todayVolume || 0).toLocaleString("fr-FR")}
          currency="FCFA"
          testId="text-today-volume"
        />
        <BigStatCard
          color="#7e57c2"
          label="Hier"
          value={(stats?.yesterdayVolume || 0).toLocaleString("fr-FR")}
          currency="FCFA"
          testId="text-yesterday-volume"
        />
      </div>

      {countries.length > 0 && (
        <>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>
            Solde par pays
          </p>
          <div className="flex flex-col gap-4">
            {countries.map((c, idx) => (
              <div
                key={c.id}
                className="rounded-xl p-5"
                style={{ background: COUNTRY_COLORS[idx % COUNTRY_COLORS.length] }}
                data-testid={`text-balance-${c.country}`}
              >
                <p className="text-xs font-bold text-white/80 uppercase tracking-widest mb-2">{c.country}</p>
                <p className="text-3xl font-bold text-white leading-none">
                  {c.balance.toLocaleString("fr-FR")}<span className="text-xl font-semibold ml-2 text-white/90">FCFA</span>
                </p>
                {!c.active && <p className="text-xs text-white/60 mt-1">Inactif</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MerchantTransactionsPanel({ token }: { token: string | null }) {
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
    if (p === "omnipay") return "Mobile Money";
    if (p === "sms") return "SMS";
    return p;
  };

  const confirmedTotal = allTx.filter(t => t.status === "confirmed" && t.amount > 0).reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Mes transactions</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Total confirmé : {confirmedTotal.toLocaleString("fr-FR")} F CFA</p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadCSV} data-testid="button-merchant-export-csv">
          <Download className="w-4 h-4 mr-2" />Export CSV
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-10" placeholder="Rechercher par ID, nom, numéro, pays..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} data-testid="input-merchant-search-tx" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36" data-testid="select-filter-status"><Filter className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="confirmed">Confirmé</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="failed">Echoué</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterProvider} onValueChange={setFilterProvider}>
          <SelectTrigger className="w-40" data-testid="select-filter-provider"><CreditCard className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous modes</SelectItem>
            <SelectItem value="omnipay">Mobile Money</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {(searchTerm || filterStatus !== "all" || filterProvider !== "all") && (
        <p className="text-xs text-muted-foreground">{filtered.length} transaction{filtered.length !== 1 ? "s" : ""} trouvée{filtered.length !== 1 ? "s" : ""}</p>
      )}

      <ScrollArea className="h-[calc(100vh-340px)]">
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">Aucune transaction</CardContent></Card>
          ) : (
            filtered.map((tx) => {
              const isTransfer = tx.amount < 0 || tx.txId.startsWith("TR-");
              const txPayerName = (tx as any).payerName;
              return (
                <Card key={tx.id} data-testid={`card-tx-${tx.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold text-muted-foreground" data-testid={`text-mtx-${tx.id}`}>{tx.txId}</span>
                          <Badge variant="outline" className="text-xs">{tx.country}</Badge>
                          {tx.provider === "omnipay" && <Badge variant="secondary" className="text-xs gap-1"><Zap className="w-3 h-3" />{providerLabel(tx.provider)}</Badge>}
                          {tx.provider === "sms" && <Badge variant="outline" className="text-xs gap-1"><Phone className="w-3 h-3" />SMS</Badge>}
                          {isTransfer && <Badge variant="secondary" className="text-xs gap-1"><ArrowUpRight className="w-3 h-3" />Transfert</Badge>}
                          <Badge variant={tx.status === "confirmed" ? "default" : tx.status === "pending" ? "secondary" : "destructive"} className="text-xs">
                            {tx.status === "confirmed" ? "Confirmé" : tx.status === "pending" ? "En attente" : tx.status}
                          </Badge>
                        </div>
                        {txPayerName && (
                          <div className="flex items-center gap-1 text-sm text-foreground">
                            <User className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span data-testid={`text-payer-name-${tx.id}`}>{txPayerName}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          {tx.payerNumber && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" /><span data-testid={`text-payer-number-${tx.id}`}>{tx.payerNumber}</span>
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span data-testid={`text-tx-date-${tx.id}`}>{new Date(tx.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-lg font-bold ${isTransfer ? "text-destructive" : "text-green-600 dark:text-green-400"}`} data-testid={`text-tx-amount-${tx.id}`}>
                          {isTransfer ? "" : "+"}{tx.amount.toLocaleString("fr-FR")}
                        </p>
                        <p className="text-xs text-muted-foreground">F CFA</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function ApiKeysPanel({ token }: { token: string | null }) {
  const { toast } = useToast();
  const [showPinDialog, setShowPinDialog] = useState(false);
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/api-keys"] });
      toast({ title: "Cle API regeneree", description: "L'ancienne cle est maintenant invalidee." });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <MerchantLoadingSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Cles API & Integration</h2>
          <p className="text-sm text-muted-foreground">Utilisez ces cles pour integrer WestPay dans vos applications.</p>
        </div>
        <Button variant="outline" onClick={() => window.open("/api-docs", "_blank")} data-testid="button-open-api-docs">
          <BookOpen className="w-4 h-4 mr-2" />Documentation API
        </Button>
      </div>

      <div className="space-y-3">
        {(apiKeys as MerchantCountry[]).length === 0 ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">Aucune cle API disponible</CardContent></Card>
        ) : (
          (apiKeys as MerchantCountry[]).map((key) => (
            <Card key={key.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Key className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-semibold text-foreground">{key.country}</span>
                      <Badge variant={key.active ? "default" : "destructive"}>
                        {key.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md font-mono break-all" data-testid={`text-apikey-${key.id}`}>
                        {key.apiKey}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { navigator.clipboard.writeText(key.apiKey); toast({ title: "Cle copiee !" }); }}
                        data-testid={`button-copy-key-${key.id}`}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirm("Regenerer cette cle API ? L'ancienne cle sera immediatement invalidee.")) {
                        regenerateMutation.mutate(key.id);
                      }
                    }}
                    disabled={regenerateMutation.isPending}
                    data-testid={`button-regenerate-key-${key.id}`}
                  >
                    {regenerateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                    Regenerer
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Card className="border-dashed">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Documentation d'integration</p>
              <p className="text-xs text-muted-foreground">Accedez a la documentation complete de l'API WestPay. Un code PIN est requis.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.open("/api-docs", "_blank")} data-testid="button-docs-link">
              <ExternalLink className="w-3 h-3 mr-1" />Ouvrir
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WebhookPanel({ token }: { token: string | null }) {
  const { toast } = useToast();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const { data: webhookData, isLoading } = useMerchantFetch("/api/merchant/webhook", ["/api/merchant/webhook"], token);
  const { data: logs = [], isLoading: logsLoading } = useMerchantFetch("/api/merchant/webhook/logs", ["/api/merchant/webhook/logs"], token);

  useEffect(() => {
    if (webhookData?.webhookUrl) {
      setWebhookUrl(webhookData.webhookUrl);
    }
  }, [webhookData]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/merchant/webhook", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ webhookUrl: webhookUrl.trim() }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      const data = await res.json();
      toast({ title: webhookUrl.trim() ? "Webhook configure" : "Webhook supprime" });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/webhook"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/webhook/logs"] });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const res = await fetch("/api/merchant/webhook/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Test reussi", description: `Reponse: ${data.statusCode}` });
      } else {
        toast({ title: "Test echoue", description: data.error || `Code: ${data.statusCode}`, variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/webhook/logs"] });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsTesting(false);
    }
  };

  const handleRemove = async () => {
    setWebhookUrl("");
    setIsSaving(true);
    try {
      const res = await fetch("/api/merchant/webhook", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ webhookUrl: "" }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      toast({ title: "Webhook supprime" });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/webhook"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/webhook/logs"] });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <MerchantLoadingSkeleton />;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">Notifications Webhook</h2>
      <p className="text-sm text-muted-foreground">
        Recevez une notification automatique sur votre serveur a chaque paiement confirme.
      </p>

      <Card>
        <CardHeader><CardTitle className="text-base">Configuration du Webhook</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>URL du Webhook</Label>
            <Input
              type="url"
              placeholder="https://votre-site.com/webhook/westpay"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              data-testid="input-webhook-url"
            />
            <p className="text-xs text-muted-foreground">
              WestPay enverra une requete POST a cette URL pour chaque paiement confirme.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-webhook">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Enregistrer
            </Button>
            {webhookData?.hasWebhook && (
              <>
                <Button variant="outline" onClick={handleTest} disabled={isTesting} data-testid="button-test-webhook">
                  {isTesting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                  Tester
                </Button>
                <Button variant="destructive" onClick={handleRemove} disabled={isSaving} data-testid="button-remove-webhook">
                  <XCircle className="w-4 h-4 mr-2" />Supprimer
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {webhookData?.hasWebhook && webhookData.webhookSecret && (
        <Card>
          <CardHeader><CardTitle className="text-base">Cle secrete (Signature HMAC)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Utilisez cette cle pour verifier l'authenticite des notifications recues. La signature HMAC-SHA256 est envoyee dans le header <code className="bg-muted px-1 rounded text-foreground">X-RobotPay-Signature</code>.
            </p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-muted p-2 rounded flex-1 break-all text-foreground" data-testid="text-webhook-secret">{webhookData.webhookSecret}</code>
              <Button
                size="icon"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(webhookData.webhookSecret);
                  toast({ title: "Cle copiee" });
                }}
                data-testid="button-copy-webhook-secret"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Format de la notification</CardTitle></CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted p-3 rounded overflow-x-auto text-foreground">{`{
  "event": "payment.confirmed",
  "txId": "TM240612.1234.A56789",
  "amount": 3000,
  "currency": "XOF",
  "payer": "+22890001234",
  "country": "Togo",
  "merchantSlug": "ecomat",
  "timestamp": "2026-02-12T10:30:00Z"
}`}</pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Historique des envois</CardTitle>
            <Badge variant="secondary">{(logs as WebhookLog[]).length} envoi(s)</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (logs as WebhookLog[]).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun envoi pour le moment</p>
          ) : (
            <ScrollArea className="max-h-64">
              <div className="space-y-2">
                {(logs as WebhookLog[]).slice(0, 20).map((log) => (
                  <div key={log.id} className="flex items-center justify-between gap-2 p-2 rounded border text-sm" data-testid={`webhook-log-${log.id}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      {log.success ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs text-foreground truncate">
                          {log.statusCode ? `HTTP ${log.statusCode}` : "Erreur"} - {log.response?.substring(0, 80) || "Pas de reponse"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString("fr-FR")}
                        </p>
                      </div>
                    </div>
                    <Badge variant={log.success ? "default" : "destructive"} className="shrink-0">
                      {log.success ? "OK" : "Echec"}
                    </Badge>
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
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCountry || !recipientPhone || !amount || !firstName || !lastName) {
      toast({ title: "Erreur", description: "Tous les champs sont requis", variant: "destructive" });
      return;
    }
    const parsedAmount = parseInt(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({ title: "Erreur", description: "Le montant doit etre un nombre positif", variant: "destructive" });
      return;
    }
    if (selectedMC && parsedAmount > selectedMC.balance) {
      toast({ title: "Erreur", description: "Solde insuffisant pour ce pays", variant: "destructive" });
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
  const { toast } = useToast();
  const { data: balance = [], isLoading: balLoading } = useMerchantFetch("/api/merchant/balance", ["/api/merchant/balance"], token);
  const { data: withdrawalList = [], isLoading: wdLoading } = useMerchantFetch("/api/merchant/withdrawals", ["/api/merchant/withdrawals"], token);

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
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!selectedWalletId || !selectedOperator || !amount || !phone) return;
    const amountNum = parseInt(amount);
    if (isNaN(amountNum) || amountNum <= 0) return;
    if (selectedWallet && amountNum > selectedWallet.balance) {
      toast({ title: "Solde insuffisant", description: `Solde disponible : ${selectedWallet.balance.toLocaleString("fr-FR")} FCFA`, variant: "destructive" });
      return;
    }
    createMutation.mutate({ merchantCountryId: Number(selectedWalletId), amount: amountNum, phone, operator: selectedOperator });
  };

  const totalWithdrawn = (withdrawalList as Withdrawal[]).filter(w => w.status === "approved").reduce((s, w) => s + w.amount, 0);
  const pendingCount = (withdrawalList as Withdrawal[]).filter(w => w.status === "pending").length;

  return (
    <div className="-m-4 md:-m-6 p-4 md:p-6 min-h-full" style={{ background: "#e8eaed" }}>
      <h2 className="text-xl font-bold mb-5" style={{ color: "#333" }}>Reversements</h2>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>Aperçu</p>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-xl p-4" style={{ background: "#26a69a" }}>
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">Total retiré</p>
          <p className="text-2xl font-bold text-white">{totalWithdrawn.toLocaleString("fr-FR")}<span className="text-sm ml-1 text-white/80">FCFA</span></p>
        </div>
        <div className="rounded-xl p-4" style={{ background: pendingCount > 0 ? "#fb8c00" : "#7e57c2" }}>
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">En attente</p>
          <p className="text-2xl font-bold text-white">{pendingCount}<span className="text-sm ml-1 text-white/80">demande{pendingCount > 1 ? "s" : ""}</span></p>
        </div>
      </div>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>Nouvelle demande</p>
      <div className="bg-white rounded-2xl p-5 mb-6 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
        <div className="space-y-5">
          <div>
            <p className="text-sm font-bold mb-3" style={{ color: "#333" }}>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs mr-2" style={{ background: "#00b050" }}>1</span>
              Choisir le wallet (pays)
            </p>
            {balLoading ? (
              <div className="grid gap-2 grid-cols-2">{[1,2].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
            ) : activeWallets.length === 0 ? (
              <p className="text-sm" style={{ color: "#888" }}>Aucun wallet actif disponible.</p>
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
                      {w.balance.toLocaleString("fr-FR")}<span className="text-xs ml-1" style={{ color: String(w.id) === selectedWalletId ? "rgba(255,255,255,0.7)" : "#aaa" }}>FCFA</span>
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
                Choisir l'opérateur
              </p>
              {opsLoading ? (
                <div className="grid gap-2 grid-cols-2">{[1,2].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
              ) : operatorList.length === 0 ? (
                <div className="p-3 rounded-xl text-sm" style={{ background: "#fff3cd", color: "#856404" }}>
                  Aucun opérateur disponible pour {selectedWallet.country}.
                </div>
              ) : (
                <div className="grid gap-2 grid-cols-2">
                  {operatorList.map((op) => (
                    <div
                      key={op.id}
                      onClick={() => setSelectedOperator(op.name)}
                      className="rounded-xl p-3 cursor-pointer transition-all flex items-center gap-2"
                      style={{
                        background: selectedOperator === op.name ? "#1e88e5" : "#f5f6f8",
                        border: `2px solid ${selectedOperator === op.name ? "#1e88e5" : "#e8ecf0"}`,
                      }}
                      data-testid={`operator-card-${op.id}`}
                    >
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: selectedOperator === op.name ? "rgba(255,255,255,0.2)" : "#e8ecf0" }}>
                        <Zap className="w-4 h-4" style={{ color: selectedOperator === op.name ? "#fff" : "#00b050" }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate" style={{ color: selectedOperator === op.name ? "#fff" : "#1a1a1a" }}>{op.name}</p>
                        <p className="text-xs" style={{ color: selectedOperator === op.name ? "rgba(255,255,255,0.7)" : "#aaa" }}>{op.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedWallet && selectedOperator && (
            <form onSubmit={handleSubmit}>
              <p className="text-sm font-bold mb-3" style={{ color: "#333" }}>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs mr-2" style={{ background: "#00b050" }}>3</span>
                Informations de retrait
              </p>
              <div className="rounded-xl p-3 mb-4 text-xs" style={{ background: "#f0faf5", border: "1px solid #c3e6cb" }}>
                <span style={{ color: "#155724" }}>Wallet : <strong>{selectedWallet.country}</strong> · Opérateur : <strong>{selectedOperator}</strong> · Solde : <strong>{selectedWallet.balance.toLocaleString("fr-FR")} FCFA</strong></span>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: "#333" }}>Montant (FCFA)</label>
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
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: "#333" }}>Numéro Mobile Money</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ex: +22507XXXXXXXX"
                    className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                    style={{ border: "1.5px solid #e2e8f0", background: "#fff", color: "#1a1a1a" }}
                    data-testid="input-withdrawal-phone"
                  />
                  <p className="text-xs mt-1" style={{ color: "#aaa" }}>Numéro {selectedOperator} où vous recevrez le paiement.</p>
                </div>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !amount || !phone}
                  className="w-full rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2 transition-all"
                  style={{ background: createMutation.isPending || !amount || !phone ? "#ccc" : "#00b050", color: "#fff", border: "none", cursor: createMutation.isPending ? "not-allowed" : "pointer" }}
                  data-testid="button-submit-withdrawal"
                >
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {createMutation.isPending ? "Traitement..." : "Soumettre la demande"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>
        Historique — {(withdrawalList as Withdrawal[]).length} demande{(withdrawalList as Withdrawal[]).length > 1 ? "s" : ""}
      </p>
      <div className="space-y-3">
        {wdLoading ? (
          [1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)
        ) : (withdrawalList as Withdrawal[]).length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
            <Download className="w-8 h-8 mx-auto mb-2" style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>Aucune demande de reversement</p>
          </div>
        ) : (
          (withdrawalList as Withdrawal[]).map((w) => (
            <div key={w.id} className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }} data-testid={`withdrawal-row-${w.id}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-lg font-bold" style={{ color: "#1a1a1a" }}>{w.amount.toLocaleString("fr-FR")} <span className="text-sm font-semibold" style={{ color: "#888" }}>FCFA</span></p>
                <StatusPill status={w.status} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "#888" }}>
                <span className="font-medium" style={{ color: "#555" }}>{w.country}</span>
                {(w as any).operator && <span style={{ color: "#1e88e5", fontWeight: 600 }}>{(w as any).operator}</span>}
                <span><Phone className="w-3 h-3 inline mr-0.5" />{w.phone}</span>
                <span>{new Date(w.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</span>
                <span className="px-1.5 py-0.5 rounded-full text-xs" style={{ background: "#f0f0f0", color: "#666" }}>{w.withdrawalMode === "auto" ? "Auto" : "Manuel"}</span>
              </div>
              {w.adminNote && (
                <p className="text-xs mt-2 px-2 py-1 rounded-lg italic" style={{ background: "#f8f9fa", color: "#666" }}>
                  Note : {w.adminNote}
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
  const { toast } = useToast();
  const { data: balance = [], isLoading: balLoading } = useMerchantFetch("/api/merchant/balance", ["/api/merchant/balance"], token);
  const { data: walletTransfers = [], isLoading: wtLoading } = useMerchantFetch("/api/merchant/wallet-transfers", ["/api/merchant/wallet-transfers"], token);
  const { data: wtcList = [] } = useQuery<WalletTransferCountry[]>({
    queryKey: ["/api/wallet-transfer-countries"],
    queryFn: () => fetch("/api/wallet-transfer-countries").then(r => r.json()),
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
        description: `${data.amount.toLocaleString("fr-FR")} ${data.currency} de ${data.fromCountry} → ${data.toCountry}. Frais : ${data.fee.toLocaleString("fr-FR")} ${data.currency}.`,
      });
      setFromCountryId(""); setToCountryId(""); setAmount("");
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!fromCountryId || !toCountryId || !amount) {
      toast({ title: "Erreur", description: "Tous les champs sont requis", variant: "destructive" });
      return;
    }
    const parsed = parseInt(amount);
    if (isNaN(parsed) || parsed <= 0) {
      toast({ title: "Erreur", description: "Montant invalide", variant: "destructive" });
      return;
    }
    createMutation.mutate({ fromCountryId, toCountryId, amount });
  };

  if (balLoading) return <MerchantLoadingSkeleton />;

  const xofCountries = wtcList.filter((c: WalletTransferCountry) => c.currencyZone === "XOF").map((c: WalletTransferCountry) => c.country).join(", ");
  const xafCountries = wtcList.filter((c: WalletTransferCountry) => c.currencyZone === "XAF").map((c: WalletTransferCountry) => c.country).join(", ");
  const totalTransferred = (walletTransfers as WalletTransfer[]).filter(w => w.status === "approved").reduce((s, w) => s + w.amount, 0);
  const pendingCount = (walletTransfers as WalletTransfer[]).filter(w => w.status === "pending").length;

  return (
    <div className="-m-4 md:-m-6 p-4 md:p-6 min-h-full" style={{ background: "#e8eaed" }}>
      <h2 className="text-xl font-bold mb-1" style={{ color: "#333" }}>Virements Inter-Wallets</h2>
      <p className="text-xs mb-5" style={{ color: "#888" }}>Transférez des fonds entre vos wallets dans la même zone monétaire (XOF ou XAF).</p>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>Aperçu</p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl p-4" style={{ background: "#7e57c2" }}>
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">Total viré</p>
          <p className="text-2xl font-bold text-white">{totalTransferred.toLocaleString("fr-FR")}<span className="text-sm ml-1 text-white/80">FCFA</span></p>
        </div>
        <div className="rounded-xl p-4" style={{ background: pendingCount > 0 ? "#fb8c00" : "#1976d2" }}>
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">En attente</p>
          <p className="text-2xl font-bold text-white">{pendingCount}<span className="text-sm ml-1 text-white/80">virement{pendingCount > 1 ? "s" : ""}</span></p>
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
        </div>
      )}

      {eligibleCountries.length < 2 && (
        <div className="rounded-xl p-4 mb-5 text-sm" style={{ background: "#fff3cd", border: "1px solid #ffc107", color: "#856404" }}>
          Il vous faut au moins 2 wallets actifs dans la même zone monétaire pour effectuer un virement.
        </div>
      )}

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>Nouvelle demande</p>
      <div className="bg-white rounded-2xl p-5 mb-6 shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: "#333" }}>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs mr-1.5" style={{ background: "#7e57c2" }}>1</span>
                Wallet source
              </label>
              <select
                value={fromCountryId}
                onChange={(e) => { setFromCountryId(e.target.value); setToCountryId(""); }}
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ border: "1.5px solid #e2e8f0", background: "#fff", color: fromCountryId ? "#1a1a1a" : "#aaa" }}
                data-testid="select-virement-from"
              >
                <option value="">{eligibleCountries.length === 0 ? "Aucun wallet éligible" : "Sélectionner..."}</option>
                {eligibleCountries.map(c => (
                  <option key={c.id} value={String(c.id)}>{c.country} — {c.balance.toLocaleString("fr-FR")} FCFA</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: "#333" }}>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs mr-1.5" style={{ background: "#7e57c2" }}>2</span>
                Wallet destination
              </label>
              <select
                value={toCountryId}
                onChange={(e) => setToCountryId(e.target.value)}
                disabled={!fromCountryId || toCountries.length === 0}
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ border: "1.5px solid #e2e8f0", background: !fromCountryId ? "#f5f5f5" : "#fff", color: toCountryId ? "#1a1a1a" : "#aaa" }}
                data-testid="select-virement-to"
              >
                <option value="">{fromCountryId && toCountries.length === 0 ? "Aucun wallet compatible" : "Sélectionner..."}</option>
                {toCountries.map(c => (
                  <option key={c.id} value={String(c.id)}>{c.country} — {c.balance.toLocaleString("fr-FR")} FCFA</option>
                ))}
              </select>
              {fromCountryId && toCountries.length === 0 && (
                <p className="text-xs mt-1" style={{ color: "#e53935" }}>Aucun wallet compatible dans la zone {fromZone}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: "#333" }}>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs mr-1.5" style={{ background: "#7e57c2" }}>3</span>
              Montant ({fromZone || "FCFA"})
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
                Solde disponible : <strong style={{ color: "#555" }}>{fromMC.balance.toLocaleString("fr-FR")} {fromZone}</strong> — Des frais s'appliquent.
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

          <button
            type="submit"
            disabled={createMutation.isPending || !fromCountryId || !toCountryId || !amount}
            className="w-full rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2 transition-all"
            style={{ background: createMutation.isPending || !fromCountryId || !toCountryId || !amount ? "#ccc" : "#7e57c2", color: "#fff", border: "none", cursor: createMutation.isPending ? "not-allowed" : "pointer" }}
            data-testid="button-submit-virement"
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
            {createMutation.isPending ? "Traitement..." : "Soumettre la demande"}
          </button>
        </form>
      </div>

      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#888" }}>
        Historique — {(walletTransfers as WalletTransfer[]).length} virement{(walletTransfers as WalletTransfer[]).length > 1 ? "s" : ""}
      </p>
      <div className="space-y-3">
        {wtLoading ? (
          [1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)
        ) : (walletTransfers as WalletTransfer[]).length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm" style={{ border: "1.5px solid #e8ecf0" }}>
            <ArrowRightLeft className="w-8 h-8 mx-auto mb-2" style={{ color: "#ddd" }} />
            <p className="text-sm" style={{ color: "#aaa" }}>Aucun virement pour le moment</p>
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
                <span>Montant : <strong style={{ color: "#333" }}>{wt.amount.toLocaleString("fr-FR")} {wt.currency}</strong></span>
                <span>Frais : <strong style={{ color: "#333" }}>{wt.fee.toLocaleString("fr-FR")} {wt.currency}</strong></span>
                <span>{new Date(wt.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</span>
              </div>
              {wt.adminNote && (
                <p className="text-xs mt-2 px-2 py-1 rounded-lg italic" style={{ background: "#f8f9fa", color: "#666" }}>
                  Note : {wt.adminNote}
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
      <h2 className="text-lg font-semibold text-foreground">Parametres du compte</h2>

      <Card>
        <CardHeader><CardTitle className="text-base">Mon compte</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">Nom: <span className="text-foreground font-semibold">{user?.name}</span></p>
          <p className="text-sm text-muted-foreground">Email: <span className="text-foreground">{user?.email}</span></p>
          <p className="text-sm text-muted-foreground">Role: <Badge variant="secondary">Marchand</Badge></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Changer le mot de passe</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label>Mot de passe actuel</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required data-testid="input-merchant-current-password" />
            </div>
            <div className="space-y-2">
              <Label>Nouveau mot de passe</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required data-testid="input-merchant-new-password" />
            </div>
            <Button type="submit" disabled={isChanging} data-testid="button-merchant-change-password">
              {isChanging ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Modifier
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <Button
            variant="destructive"
            onClick={() => { logout(); setLocation("/merchant-login"); }}
            data-testid="button-merchant-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />Se deconnecter
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PaymentLinksPanel({ token }: { token: string | null }) {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editLink, setEditLink] = useState<PaymentLink | null>(null);
  const [form, setForm] = useState({ name: "", amountType: "fixed", amount: "", redirectUrl: "", paymentLimit: "" });
  const baseUrl = window.location.origin;

  const { data: links = [], isLoading } = useQuery<PaymentLink[]>({
    queryKey: ["/api/merchant/payment-links"],
    queryFn: async () => {
      const res = await fetch("/api/merchant/payment-links", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Erreur chargement");
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/merchant/payment-links"] }); setShowCreate(false); setForm({ name: "", amountType: "fixed", amount: "", redirectUrl: "", paymentLimit: "" }); toast({ title: "Lien créé avec succès" }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/merchant/payment-links"] }); setEditLink(null); toast({ title: "Lien mis à jour" }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/merchant/payment-links/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Erreur suppression");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/merchant/payment-links"] }); toast({ title: "Lien supprimé" }); },
  });

  const copyLink = (uniqueId: string) => {
    navigator.clipboard.writeText(`${baseUrl}/link/${uniqueId}`);
    toast({ title: "Lien copié !" });
  };

  const totalRevenue = links.reduce((s, l) => s + l.totalRevenue, 0);
  const totalPayments = links.reduce((s, l) => s + l.paymentCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Liens de Paiement</h2>
          <p className="text-sm text-muted-foreground">Créez des liens partageables pour recevoir des paiements</p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-create-payment-link">
          <Plus className="w-4 h-4 mr-2" />Nouveau lien
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{links.length}</div><p className="text-xs text-muted-foreground">Liens créés</p></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{totalPayments}</div><p className="text-xs text-muted-foreground">Paiements reçus</p></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{totalRevenue.toLocaleString()} F</div><p className="text-xs text-muted-foreground">Volume total</p></CardContent></Card>
      </div>

      {isLoading ? <MerchantLoadingSkeleton /> : links.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Link className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Aucun lien de paiement</p>
          <p className="text-sm mt-1">Créez votre premier lien pour commencer à recevoir des paiements</p>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link) => {
            const url = `${baseUrl}/link/${link.uniqueId}`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(url)}`;
            const isExpired = link.expiresAt && new Date() > new Date(link.expiresAt);
            const isLimited = link.paymentLimit && link.paymentCount >= link.paymentLimit;
            return (
              <Card key={link.id} data-testid={`card-payment-link-${link.id}`} className={!link.active || isExpired || isLimited ? "opacity-60" : ""}>
                <CardContent className="pt-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <img src={qrUrl} alt="QR" className="w-20 h-20 rounded border shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-sm" data-testid={`text-link-name-${link.id}`}>{link.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {link.amountType === "fixed" ? `${link.amount?.toLocaleString()} F CFA` : "Montant libre"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isExpired ? <Badge variant="destructive" className="text-xs">Expiré</Badge>
                            : isLimited ? <Badge variant="destructive" className="text-xs">Limite atteinte</Badge>
                            : link.active ? <Badge variant="default" className="text-xs">Actif</Badge>
                            : <Badge variant="secondary" className="text-xs">Inactif</Badge>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 mt-2 bg-muted rounded px-2 py-1">
                        <span className="text-xs truncate text-muted-foreground flex-1">{url}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => copyLink(link.uniqueId)} data-testid={`button-copy-link-${link.id}`}>
                          <Copy className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => window.open(url, "_blank")} data-testid={`button-open-link-${link.id}`}>
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span><BarChart3 className="w-3 h-3 inline mr-1" />{link.paymentCount} paiements</span>
                        <span>{link.totalRevenue.toLocaleString()} F reçus</span>
                        {link.paymentLimit && <span>Limite: {link.paymentCount}/{link.paymentLimit}</span>}
                      </div>
                    </div>
                    <div className="flex sm:flex-col items-center gap-2 shrink-0">
                      <Switch checked={link.active} onCheckedChange={(checked) => updateMutation.mutate({ id: link.id, data: { active: checked } })} data-testid={`switch-link-active-${link.id}`} />
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => { setEditLink(link); setForm({ name: link.name, amountType: link.amountType, amount: link.amount?.toString() || "", redirectUrl: link.redirectUrl || "", paymentLimit: link.paymentLimit?.toString() || "" }); }} data-testid={`button-edit-link-${link.id}`}>
                        <Edit3 className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="outline" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => deleteMutation.mutate(link.id)} data-testid={`button-delete-link-${link.id}`}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showCreate || !!editLink} onOpenChange={(o) => { if (!o) { setShowCreate(false); setEditLink(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editLink ? "Modifier le lien" : "Créer un lien de paiement"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label>Nom du lien</Label>
              <Input placeholder="Ex: Paiement commande #42" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} data-testid="input-link-name" />
            </div>
            <div className="space-y-1">
              <Label>Type de montant</Label>
              <Select value={form.amountType} onValueChange={(v) => setForm(f => ({ ...f, amountType: v }))}>
                <SelectTrigger data-testid="select-link-amount-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Montant fixe</SelectItem>
                  <SelectItem value="flexible">Montant libre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.amountType === "fixed" && (
              <div className="space-y-1">
                <Label>Montant (F CFA)</Label>
                <Input type="number" placeholder="5000" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} data-testid="input-link-amount" />
              </div>
            )}
            <div className="space-y-1">
              <Label>URL de redirection <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
              <Input placeholder="https://votresite.com/merci" value={form.redirectUrl} onChange={(e) => setForm(f => ({ ...f, redirectUrl: e.target.value }))} data-testid="input-link-redirect" />
            </div>
            <div className="space-y-1">
              <Label>Limite de paiements <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
              <Input type="number" placeholder="Illimité" value={form.paymentLimit} onChange={(e) => setForm(f => ({ ...f, paymentLimit: e.target.value }))} data-testid="input-link-limit" />
            </div>
            <Button className="w-full" onClick={() => { if (editLink) { updateMutation.mutate({ id: editLink.id, data: { name: form.name, amountType: form.amountType, amount: form.amount ? Number(form.amount) : undefined, redirectUrl: form.redirectUrl || undefined, paymentLimit: form.paymentLimit ? Number(form.paymentLimit) : undefined } }); } else { createMutation.mutate(form); } }} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-link-form">
              {createMutation.isPending || updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : editLink ? "Enregistrer" : "Créer le lien"}
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

export default function MerchantDashboard() {
  const { user, token, logout, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<MerchantTab>("overview");
  const { t } = useLanguage();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "merchant")) {
      setLocation("/merchant-login");
    }
  }, [authLoading, user, setLocation]);

  if (authLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!user || user.role !== "merchant") return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const menuItems: { title: string; icon: any; tab: MerchantTab }[] = [
    { title: t("overview"), icon: Wallet, tab: "overview" },
    { title: t("transactions"), icon: Receipt, tab: "transactions" },
    { title: t("transfers"), icon: ArrowUpRight, tab: "virements" },
    { title: t("withdrawals"), icon: Download, tab: "reversements" },
    { title: t("paymentlinks"), icon: Link, tab: "paymentlinks" },
    { title: t("apikeys"), icon: Key, tab: "apikeys" },
    { title: t("webhook"), icon: Webhook, tab: "webhook" },
    { title: t("settings"), icon: Settings, tab: "settings" },
  ];

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  const handleLogout = () => {
    logout();
    setLocation("/merchant-login");
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <div className="px-3 py-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-sm shrink-0">
                    <Wallet className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-sidebar-foreground leading-tight">WestPay</p>
                    <p className="text-xs text-muted-foreground truncate leading-tight">{user.name}</p>
                  </div>
                </div>
              </div>
            </SidebarGroup>
            <Separator />
            <SidebarGroup>
              <SidebarGroupLabel>{t("navigation")}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {menuItems.map((item) => (
                    <SidebarMenuItem key={item.tab}>
                      <SidebarMenuButton
                        onClick={() => setActiveTab(item.tab)}
                        isActive={activeTab === item.tab}
                        data-testid={`merchant-nav-${item.tab}`}
                      >
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <div className="flex flex-col flex-1 min-w-0">
          <header
            className="flex items-center justify-between gap-2 px-4 sticky top-0 z-50 shadow-sm"
            style={{ background: "#1e2231", height: "52px" }}
          >
            <div className="flex items-center">
              <SidebarTrigger
                className="text-white/80 hover:text-white hover:bg-white/10"
                data-testid="button-merchant-sidebar-toggle"
              />
            </div>

            <div className="flex items-center gap-1">
              <button
                className="relative p-2 rounded-lg transition-colors"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.8)" }}
                title={t("notifications")}
                onClick={() => toast({ title: t("notifications"), description: "Aucune nouvelle notification." })}
                data-testid="button-notifications"
              >
                <Bell className="w-5 h-5" />
                <span
                  className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ background: "#e91e63", fontSize: "10px", lineHeight: 1 }}
                >
                  0
                </span>
              </button>

              <button
                className="p-2 rounded-lg transition-colors"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.8)" }}
                title={t("messages")}
                onClick={() => setActiveTab("settings")}
                data-testid="button-messages"
              >
                <Mail className="w-5 h-5" />
              </button>

              <button
                className="p-2 rounded-lg transition-colors"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.8)" }}
                title={t("help")}
                onClick={() => window.open("/api-docs", "_blank")}
                data-testid="button-help"
              >
                <HelpCircle className="w-5 h-5" />
              </button>

              <button
                className="p-2 rounded-lg transition-colors"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.8)" }}
                title={t("logout")}
                onClick={handleLogout}
                data-testid="button-merchant-logout"
              >
                <Power className="w-5 h-5" />
              </button>

              <LanguageDropdown />
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
            <SupportBanner />
            {activeTab === "overview" && <OverviewPanel token={token} />}
            {activeTab === "transactions" && <MerchantTransactionsPanel token={token} />}
            {activeTab === "virements" && <WalletTransfersPanel token={token} />}
            {activeTab === "reversements" && <WithdrawalsPanel token={token} />}
            {activeTab === "paymentlinks" && <PaymentLinksPanel token={token} />}
            {activeTab === "apikeys" && <ApiKeysPanel token={token} />}
            {activeTab === "webhook" && <WebhookPanel token={token} />}
            {activeTab === "settings" && <MerchantSettingsPanel token={token} />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
