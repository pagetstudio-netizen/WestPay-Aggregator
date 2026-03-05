import { useState, useEffect } from "react";
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
  Trash2, Plus, ToggleLeft, ToggleRight, Edit3, BarChart3, MessageCircle, Phone
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { MerchantCountry, Transaction, WebhookLog, PaymentLink, WalletTransfer, WalletTransferCountry, Withdrawal } from "@shared/schema";

type MerchantTab = "overview" | "transactions" | "apikeys" | "webhook" | "transfers" | "reversements" | "settings" | "paymentlinks";

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

function OverviewPanel({ token }: { token: string | null }) {
  const { data: balance = [], isLoading: balLoading } = useMerchantFetch("/api/merchant/balance", ["/api/merchant/balance"], token);
  const { data: stats } = useMerchantFetch("/api/merchant/stats", ["/api/merchant/stats"], token);

  if (balLoading) return <MerchantLoadingSkeleton />;

  const countries = balance as MerchantCountry[];
  const totalBalance = countries.reduce((sum, c) => sum + (c.balance || 0), 0);
  const omnipayCountries = countries.filter(c => c.omnipayEnabled && c.active);

  const countryFlags: Record<string, string> = {
    "Togo": "TG", "Benin": "BJ", "Cote d'Ivoire": "CI",
    "Senegal": "SN", "Mali": "ML", "Burkina Faso": "BF",
    "Cameroun": "CM", "Congo Brazzaville": "CG", "Gabon": "GA",
  };

  return (
    <div className="space-y-6">
      {omnipayCountries.length > 0 && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-10 h-10 rounded-md bg-green-500/10 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground" data-testid="text-omnipay-status">Paiement mobile actif</p>
                <p className="text-xs text-muted-foreground">
                  Paiements automatiques via {omnipayCountries.map(c => c.country).join(", ")}
                </p>
              </div>
              <Badge variant="default" data-testid="badge-omnipay-count">{omnipayCountries.length} pays</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm text-muted-foreground">Solde total</p>
              <p className="text-3xl font-bold text-foreground mt-1" data-testid="text-total-balance">
                {totalBalance.toLocaleString("fr-FR")} F CFA
              </p>
            </div>
            <div className="w-14 h-14 rounded-md bg-primary/10 flex items-center justify-center">
              <DollarSign className="w-7 h-7 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Transactions</p>
                <p className="text-xl font-bold text-foreground mt-1">{stats?.transactionCount || 0}</p>
              </div>
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                <Hash className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Pays actifs</p>
                <p className="text-xl font-bold text-foreground mt-1">{(balance as MerchantCountry[]).filter(c => c.active).length}</p>
              </div>
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                <Globe className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Volume total</p>
                <p className="text-xl font-bold text-foreground mt-1">{(stats?.totalVolume || 0).toLocaleString("fr-FR")} F</p>
              </div>
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-base font-semibold text-foreground mb-3">Solde par pays</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(balance as MerchantCountry[]).length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="p-6 text-center text-muted-foreground text-sm">Aucun pays active</CardContent>
            </Card>
          ) : (
            (balance as MerchantCountry[]).map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md bg-accent flex items-center justify-center text-sm font-bold text-accent-foreground">
                        {countryFlags[c.country] || c.country.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground text-sm">{c.country}</p>
                        <Badge variant={c.active ? "default" : "destructive"} className="mt-1">
                          {c.active ? "Actif" : "Inactif"}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-foreground" data-testid={`text-balance-${c.country}`}>
                        {c.balance.toLocaleString("fr-FR")}
                      </p>
                      <p className="text-xs text-muted-foreground">F CFA</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MerchantTransactionsPanel({ token }: { token: string | null }) {
  const { data: transactions = [], isLoading } = useMerchantFetch("/api/merchant/transactions", ["/api/merchant/transactions"], token);
  const [searchTerm, setSearchTerm] = useState("");

  if (isLoading) return <MerchantLoadingSkeleton />;

  const filtered = (transactions as Transaction[]).filter(
    (t) => t.txId.toLowerCase().includes(searchTerm.toLowerCase()) || t.country.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const downloadCSV = () => {
    const header = "TXID,Montant,Pays,Statut,Date\n";
    const rows = filtered.map((t) =>
      `${t.txId},${t.amount},${t.country},${t.status},${new Date(t.createdAt).toLocaleDateString("fr-FR")}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "mes-transactions.csv"; a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-foreground">Mes transactions</h2>
        <Button variant="outline" onClick={downloadCSV} data-testid="button-merchant-export-csv">
          <Download className="w-4 h-4 mr-2" />Export CSV
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-10" placeholder="Rechercher..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} data-testid="input-merchant-search-tx" />
      </div>

      <ScrollArea className="h-[calc(100vh-280px)]">
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">Aucune transaction</CardContent></Card>
          ) : (
            filtered.map((tx) => (
              <Card key={tx.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-foreground" data-testid={`text-mtx-${tx.id}`}>{tx.txId}</span>
                        <Badge variant="secondary">{tx.country}</Badge>
                        {tx.provider === "omnipay" && (
                          <Badge variant="outline"><Zap className="w-3 h-3 mr-1" />Mobile Money</Badge>
                        )}
                        {(tx.amount < 0 || tx.txId.startsWith("TR-")) && (
                          <Badge variant="secondary"><ArrowUpRight className="w-3 h-3 mr-1" />Transfert</Badge>
                        )}
                        <Badge variant={tx.status === "confirmed" ? "default" : "destructive"}>
                          {tx.status === "confirmed" ? "Confirme" : tx.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {tx.amount.toLocaleString("fr-FR")} F CFA
                        {tx.payerNumber ? ` de ${tx.payerNumber}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(tx.createdAt).toLocaleString("fr-FR")}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-lg font-bold ${tx.amount < 0 || tx.txId.startsWith("TR-") ? "text-destructive" : "text-foreground"}`}>
                        {tx.amount < 0 ? "" : "+"}{tx.amount.toLocaleString("fr-FR")}
                      </p>
                      <p className="text-xs text-muted-foreground">F CFA</p>
                    </div>
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

function WithdrawalsPanel({ token }: { token: string | null }) {
  const { toast } = useToast();
  const { data: balance = [], isLoading: balLoading } = useMerchantFetch("/api/merchant/balance", ["/api/merchant/balance"], token);
  const { data: withdrawalList = [], isLoading: wdLoading } = useMerchantFetch("/api/merchant/withdrawals", ["/api/merchant/withdrawals"], token);

  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");

  const activeWallets = (balance as MerchantCountry[]).filter(w => w.active);
  const selectedWallet = activeWallets.find(w => String(w.id) === selectedWalletId);

  const createMutation = useMutation({
    mutationFn: async (data: { merchantCountryId: number; amount: number; phone: string }) => {
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
      setAmount("");
      setPhone("");
      toast({ title: "Demande de reversement soumise", description: "Votre demande est en cours de traitement." });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!selectedWalletId || !amount || !phone) return;
    const amountNum = parseInt(amount);
    if (isNaN(amountNum) || amountNum <= 0) return;
    if (selectedWallet && amountNum > selectedWallet.balance) {
      toast({ title: "Solde insuffisant", description: `Solde disponible : ${selectedWallet.balance.toLocaleString("fr-FR")} FCFA`, variant: "destructive" });
      return;
    }
    createMutation.mutate({ merchantCountryId: Number(selectedWalletId), amount: amountNum, phone });
  };

  const statusBadge = (status: string) => {
    if (status === "pending") return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" />En attente</Badge>;
    if (status === "approved") return <Badge className="bg-green-500 gap-1"><CheckCircle2 className="w-3 h-3" />Approuve</Badge>;
    return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Rejete</Badge>;
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">Reversements (Retraits)</h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {balLoading ? (
          [1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)
        ) : activeWallets.map((w) => (
          <Card key={w.id} className={`border-2 ${String(w.id) === selectedWalletId ? "border-primary" : "border-border"} cursor-pointer hover:border-primary/60 transition-colors`}
            onClick={() => setSelectedWalletId(String(w.id))} data-testid={`wallet-card-${w.id}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-foreground">{w.country}</span>
                {String(w.id) === selectedWalletId && <CheckCircle2 className="w-4 h-4 text-primary" />}
              </div>
              <p className="text-xl font-bold text-foreground">{w.balance.toLocaleString("fr-FR")} <span className="text-sm font-normal text-muted-foreground">FCFA</span></p>
              {w.balance === 0 && <p className="text-xs text-muted-foreground mt-0.5">Solde vide</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Download className="w-4 h-4" />Nouvelle demande de reversement</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Wallet (pays)</Label>
              <Select value={selectedWalletId} onValueChange={setSelectedWalletId}>
                <SelectTrigger data-testid="select-withdrawal-wallet">
                  <SelectValue placeholder="Sélectionner un wallet..." />
                </SelectTrigger>
                <SelectContent>
                  {activeWallets.map(w => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.country} — {w.balance.toLocaleString("fr-FR")} FCFA
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Montant à retirer (FCFA)</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Ex: 50000"
                min="1"
                max={selectedWallet?.balance}
                data-testid="input-withdrawal-amount"
              />
              {selectedWallet && (
                <p className="text-xs text-muted-foreground">Solde disponible : <span className="font-semibold text-foreground">{selectedWallet.balance.toLocaleString("fr-FR")} FCFA</span></p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Numéro Mobile Money de réception</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ex: +22507XXXXXXXX"
                data-testid="input-withdrawal-phone"
              />
              <p className="text-xs text-muted-foreground">Le retrait doit être effectué via le système de paiement du pays du wallet sélectionné.</p>
            </div>
            <Button type="submit" disabled={createMutation.isPending || !selectedWalletId || !amount || !phone} data-testid="button-submit-withdrawal">
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
              Soumettre la demande
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Historique des reversements</CardTitle>
            <Badge variant="secondary">{(withdrawalList as Withdrawal[]).length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {wdLoading ? (
            <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          ) : (withdrawalList as Withdrawal[]).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucune demande de reversement</p>
          ) : (
            <ScrollArea className="max-h-96">
              <div className="space-y-2">
                {(withdrawalList as Withdrawal[]).map((w) => (
                  <div key={w.id} className="p-3 rounded border bg-muted/30" data-testid={`withdrawal-row-${w.id}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{w.amount.toLocaleString("fr-FR")} FCFA</span>
                        <span className="text-muted-foreground text-xs">— {w.country}</span>
                      </div>
                      {statusBadge(w.status)}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                      <span><Phone className="w-3 h-3 inline mr-1" />{w.phone}</span>
                      <span>{new Date(w.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      <Badge variant="outline" className="text-xs py-0">{w.withdrawalMode === "auto" ? "Auto" : "Manuel"}</Badge>
                    </div>
                    {w.adminNote && <p className="text-xs text-muted-foreground mt-1 italic">Note : {w.adminNote}</p>}
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
        title: "Demande de virement soumise",
        description: `${data.amount.toLocaleString("fr-FR")} ${data.currency} de ${data.fromCountry} vers ${data.toCountry}. Frais: ${data.fee.toLocaleString("fr-FR")} ${data.currency}. En attente d'approbation admin.`,
      });
      setFromCountryId("");
      setToCountryId("");
      setAmount("");
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

  const statusBadge = (status: string) => {
    if (status === "pending") return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" />En attente</Badge>;
    if (status === "approved") return <Badge className="bg-green-500 gap-1"><CheckCircle2 className="w-3 h-3" />Approuve</Badge>;
    return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Rejete</Badge>;
  };

  if (balLoading) return <MerchantLoadingSkeleton />;

  const xofCountries = wtcList.filter((c: WalletTransferCountry) => c.currencyZone === "XOF").map((c: WalletTransferCountry) => c.country).join(", ");
  const xafCountries = wtcList.filter((c: WalletTransferCountry) => c.currencyZone === "XAF").map((c: WalletTransferCountry) => c.country).join(", ");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Virements Inter-Wallets</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Transférez des fonds entre vos wallets dans la même zone monétaire. Soumis à l'approbation de l'administrateur.
        </p>
      </div>

      {wtcList.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-muted/50 rounded-lg border text-xs">
          {xofCountries && (
            <div><span className="font-medium">Zone XOF : </span><span className="text-muted-foreground">{xofCountries}</span></div>
          )}
          {xafCountries && (
            <div><span className="font-medium">Zone XAF : </span><span className="text-muted-foreground">{xafCountries}</span></div>
          )}
        </div>
      )}

      {eligibleCountries.length < 2 && (
        <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
          Vous avez besoin d'au moins 2 wallets actifs dans la même zone monétaire pour effectuer un virement inter-wallets.
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Nouvelle demande de virement</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Wallet source</Label>
                <Select value={fromCountryId} onValueChange={(v) => { setFromCountryId(v); setToCountryId(""); }}>
                  <SelectTrigger data-testid="select-virement-from">
                    <SelectValue placeholder={eligibleCountries.length === 0 ? "Aucun wallet éligible" : "Sélectionner"} />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleCountries.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.country} — {c.balance.toLocaleString("fr-FR")} FCFA
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Wallet destination</Label>
                <Select value={toCountryId} onValueChange={setToCountryId} disabled={!fromCountryId || toCountries.length === 0}>
                  <SelectTrigger data-testid="select-virement-to">
                    <SelectValue placeholder={fromCountryId && toCountries.length === 0 ? "Aucun wallet compatible" : "Sélectionner"} />
                  </SelectTrigger>
                  <SelectContent>
                    {toCountries.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.country} — {c.balance.toLocaleString("fr-FR")} FCFA
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fromCountryId && toCountries.length === 0 && (
                  <p className="text-xs text-destructive">Aucun autre wallet dans la même zone ({fromZone})</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Montant ({fromZone || "FCFA"})</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Ex: 50000"
                min="1"
                required
                data-testid="input-virement-amount"
              />
              {fromMC && amount && !isNaN(parseInt(amount)) && (
                <p className="text-xs text-muted-foreground">
                  Solde disponible : {fromMC.balance.toLocaleString("fr-FR")} {fromZone} — Des frais s'appliquent.
                </p>
              )}
            </div>
            <Button type="submit" disabled={createMutation.isPending || !fromCountryId || !toCountryId} data-testid="button-submit-virement">
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowRightLeft className="w-4 h-4 mr-2" />}
              Soumettre la demande
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Historique des virements</CardTitle>
            <Badge variant="secondary">{(walletTransfers as WalletTransfer[]).length} virement(s)</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {wtLoading ? (
            <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : (walletTransfers as WalletTransfer[]).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun virement pour le moment</p>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {(walletTransfers as WalletTransfer[]).map((wt) => (
                  <div key={wt.id} className="p-3 rounded border text-sm space-y-1" data-testid={`virement-row-${wt.id}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-medium">{wt.fromCountry} → {wt.toCountry}</span>
                      {statusBadge(wt.status)}
                    </div>
                    <div className="flex items-center gap-4 text-muted-foreground text-xs flex-wrap">
                      <span>Montant : <span className="text-foreground font-medium">{wt.amount.toLocaleString("fr-FR")} {wt.currency}</span></span>
                      <span>Frais : <span className="text-foreground">{wt.fee.toLocaleString("fr-FR")} {wt.currency}</span></span>
                      <span>{new Date(wt.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</span>
                    </div>
                    {wt.adminNote && (
                      <p className="text-xs text-muted-foreground italic">Note admin : {wt.adminNote}</p>
                    )}
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
    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm" data-testid="banner-support">
      <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
        <MessageCircle className="w-4 h-4" />
        <span className="font-semibold">Si vous rencontrez un problème, veuillez contacter notre support client</span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground pl-6">
        <span className="flex items-center gap-1 flex-wrap">
          <MessageCircle className="w-3 h-3 text-blue-500 shrink-0" />
          <span>Telegram :</span>
          <a href={`https://t.me/${contacts.telegram1.replace("@","")}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline font-medium">{contacts.telegram1}</a>
          {contacts.hours && <span className="text-xs text-muted-foreground">({contacts.hours})</span>}
          {contacts.telegram2 && <>
            <span className="mx-0.5">·</span>
            <a href={`https://t.me/${contacts.telegram2.replace("@","")}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline font-medium">{contacts.telegram2}</a>
            {contacts.hours2 && <span className="text-xs text-muted-foreground">({contacts.hours2})</span>}
          </>}
        </span>
        <span className="flex items-center gap-1 flex-wrap">
          <Phone className="w-3 h-3 text-green-500 shrink-0" />
          <span>WhatsApp :</span>
          <a href={`https://wa.me/${contacts.whatsapp1.replace(/\D/g,"")}`} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline font-medium">{contacts.whatsapp1}</a>
          {contacts.whatsapp2 && <>
            <span className="mx-0.5">·</span>
            <a href={`https://wa.me/${contacts.whatsapp2.replace(/\D/g,"")}`} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline font-medium">{contacts.whatsapp2}</a>
          </>}
        </span>
      </div>
    </div>
  );
}

export default function MerchantDashboard() {
  const { user, token, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<MerchantTab>("overview");
  const { data: balanceData = [] } = useMerchantFetch("/api/merchant/balance", ["/api/merchant/balance"], token);
  const hasOmnipay = (balanceData as MerchantCountry[]).some(c => c.omnipayEnabled && c.active);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "merchant")) {
      setLocation("/merchant-login");
    }
  }, [authLoading, user, setLocation]);

  if (authLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!user || user.role !== "merchant") return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const menuItems: { title: string; icon: any; tab: MerchantTab }[] = [
    { title: "Vue d'ensemble", icon: Wallet, tab: "overview" },
    { title: "Transactions", icon: ArrowRightLeft, tab: "transactions" },
    ...(hasOmnipay ? [{ title: "Transferts", icon: Send, tab: "transfers" as MerchantTab }] : []),
    { title: "Reversements", icon: Download, tab: "reversements" },
    { title: "Liens de paiement", icon: Link, tab: "paymentlinks" },
    { title: "Cles API", icon: Key, tab: "apikeys" },
    { title: "Webhook", icon: Webhook, tab: "webhook" },
    { title: "Parametres", icon: Settings, tab: "settings" },
  ];

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <div className="flex items-center gap-2 px-3 py-4">
                <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                  <Wallet className="w-4 h-4 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm font-bold text-sidebar-foreground">WestPay</p>
                  <p className="text-xs text-muted-foreground truncate">{user.name}</p>
                </div>
              </div>
            </SidebarGroup>
            <Separator />
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
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
          <header className="flex items-center justify-between gap-2 p-3 border-b sticky top-0 z-50 bg-background">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-merchant-sidebar-toggle" />
              <h1 className="text-sm font-semibold text-foreground hidden sm:block">Espace Marchand</h1>
            </div>
            <Badge variant="outline" className="text-xs">{user.name}</Badge>
          </header>

          <main className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
            <SupportBanner />
            {activeTab === "overview" && <OverviewPanel token={token} />}
            {activeTab === "transactions" && <MerchantTransactionsPanel token={token} />}
            {activeTab === "transfers" && <TransfersPanel token={token} />}
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
