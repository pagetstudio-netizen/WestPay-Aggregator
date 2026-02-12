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
  Wallet, ArrowRightLeft, Key, Settings, LogOut, Loader2, Download,
  Copy, Globe, DollarSign, Hash, TrendingUp, Search, RefreshCw, BookOpen, Lock, ExternalLink,
  Webhook, Send, CheckCircle2, XCircle, Clock
} from "lucide-react";
import type { MerchantCountry, Transaction, WebhookLog } from "@shared/schema";

type MerchantTab = "overview" | "transactions" | "apikeys" | "webhook" | "settings";

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

  const totalBalance = (balance as MerchantCountry[]).reduce((sum, c) => sum + (c.balance || 0), 0);

  const countryFlags: Record<string, string> = {
    "Togo": "TG", "Benin": "BJ", "Cote d'Ivoire": "CI", "Guinee": "GN",
    "Senegal": "SN", "Mali": "ML", "Burkina Faso": "BF", "Niger": "NE", "Ghana": "GH", "Nigeria": "NG",
  };

  return (
    <div className="space-y-6">
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
                      <p className="text-lg font-bold text-foreground">+{tx.amount.toLocaleString("fr-FR")}</p>
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
              Utilisez cette cle pour verifier l'authenticite des notifications recues. La signature HMAC-SHA256 est envoyee dans le header <code className="bg-muted px-1 rounded text-foreground">X-WestPay-Signature</code>.
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

export default function MerchantDashboard() {
  const { user, token, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<MerchantTab>("overview");

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

          <main className="flex-1 overflow-auto p-4 md:p-6">
            {activeTab === "overview" && <OverviewPanel token={token} />}
            {activeTab === "transactions" && <MerchantTransactionsPanel token={token} />}
            {activeTab === "apikeys" && <ApiKeysPanel token={token} />}
            {activeTab === "webhook" && <WebhookPanel token={token} />}
            {activeTab === "settings" && <MerchantSettingsPanel token={token} />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
