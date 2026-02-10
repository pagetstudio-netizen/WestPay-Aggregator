import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger
} from "@/components/ui/sidebar";
import {
  Wallet, ArrowRightLeft, Key, Settings, LogOut, Loader2, Download,
  Copy, Globe, DollarSign, Hash, TrendingUp, Search
} from "lucide-react";
import type { MerchantCountry, Transaction } from "@shared/schema";

type MerchantTab = "overview" | "transactions" | "apikeys" | "settings";

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
  const { data: apiKeys = [], isLoading } = useMerchantFetch("/api/merchant/api-keys", ["/api/merchant/api-keys"], token);

  if (isLoading) return <MerchantLoadingSkeleton />;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Mes cles API</h2>
      <p className="text-sm text-muted-foreground">Utilisez ces cles pour integrer WestPay dans vos applications.</p>
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
                </div>
              </CardContent>
            </Card>
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
            {activeTab === "settings" && <MerchantSettingsPanel token={token} />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
