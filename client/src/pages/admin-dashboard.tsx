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
  Check, ChevronsUpDown, ArrowUpRight
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Merchant, MerchantCountry, Transaction, PhoneNumber, SmsLog, PaymentLink, WalletTransfer } from "@shared/schema";

type AdminTab = "overview" | "merchants" | "paymentlinks" | "transactions" | "countries" | "numbers" | "sms" | "apikeys" | "omnipay" | "virements" | "settings";

function useAdminFetch(url: string, key: string[]) {
  const { token } = useAuth();
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erreur de chargement");
      return res.json();
    },
  });
}

function StatCard({ title, value, icon: Icon, subtitle }: { title: string; value: string | number; icon: any; subtitle?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{title}</p>
            <p className="text-2xl font-bold text-foreground mt-1" data-testid={`stat-${title.toLowerCase().replace(/\s/g, '-')}`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TelegramDialog({ merchant, token }: { merchant: Merchant; token: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [mode, setMode] = useState<"choose" | "dm" | "group">("choose");

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
  const { data: stats } = useAdminFetch("/api/admin/stats", ["/api/admin/stats"]);
  const { data: transactions = [] } = useAdminFetch("/api/admin/transactions", ["/api/admin/transactions"]);
  const { data: merchants = [] } = useAdminFetch("/api/admin/merchants", ["/api/admin/merchants"]);
  const { data: links = [] } = useAdminFetch("/api/admin/payment-links", ["/api/admin/payment-links"]);

  const recentTx = (transactions as Transaction[]).slice(0, 5);
  const recentLinks = (links as any[]).slice(0, 5);
  const recentMerchants = (merchants as any[]).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Marchands" value={stats?.merchantCount || 0} icon={Users} />
        <StatCard title="Liens de paiement" value={stats?.paymentLinkCount || 0} icon={Link} />
        <StatCard title="Transactions" value={stats?.transactionCount || 0} icon={Hash} />
        <StatCard title="Volume total" value={`${(stats?.totalVolume || 0).toLocaleString("fr-FR")} F`} icon={DollarSign} />
        <StatCard title="Paiements auj." value={stats?.todayPayments || 0} icon={TrendingUp} />
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
  const baseUrl = window.location.origin;

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/merchant", merchantId, "details"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/merchant/${merchantId}/details`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Erreur chargement");
      return res.json();
    },
    enabled: !!merchantId,
  });

  const copyLink = (uniqueId: string) => {
    navigator.clipboard.writeText(`${baseUrl}/link/${uniqueId}`);
    toast({ title: "Lien copié !" });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isLoading ? "Chargement..." : data?.merchant?.name}</DialogTitle>
        </DialogHeader>
        {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div> : data && (
          <div className="space-y-5 mt-2">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-muted rounded-lg px-3 py-2"><p className="text-xs text-muted-foreground">Email</p><p className="font-medium">{data.merchant.email}</p></div>
              <div className="bg-muted rounded-lg px-3 py-2"><p className="text-xs text-muted-foreground">Slug</p><p className="font-medium">/{data.merchant.slug}</p></div>
              <div className="bg-muted rounded-lg px-3 py-2"><p className="text-xs text-muted-foreground">Statut</p><Badge variant={data.merchant.suspended ? "destructive" : "default"}>{data.merchant.suspended ? "Suspendu" : "Actif"}</Badge></div>
              <div className="bg-muted rounded-lg px-3 py-2"><p className="text-xs text-muted-foreground">Volume total</p><p className="font-medium">{(data.totalRevenue || 0).toLocaleString()} F CFA</p></div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Link className="w-4 h-4" />Liens de paiement ({data.links.length})</h3>
              {data.links.length === 0 ? <p className="text-xs text-muted-foreground">Aucun lien créé</p> : (
                <div className="space-y-2">
                  {data.links.map((link: PaymentLink) => (
                    <div key={link.id} className="flex items-center justify-between gap-2 bg-muted rounded-lg px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{link.name}</p>
                        <p className="text-xs text-muted-foreground">{link.amountType === "fixed" ? `${link.amount?.toLocaleString()} F` : "Libre"} • {link.paymentCount} paiements</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge variant={link.active ? "default" : "secondary"} className="text-xs px-1">{link.active ? "Actif" : "Inactif"}</Badge>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyLink(link.uniqueId)}><Copy className="w-3 h-3" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><ArrowRightLeft className="w-4 h-4" />Dernières transactions ({data.transactions.length})</h3>
              {data.transactions.length === 0 ? <p className="text-xs text-muted-foreground">Aucune transaction</p> : (
                <div className="space-y-1.5">
                  {data.transactions.slice(0, 10).map((tx: Transaction) => (
                    <div key={tx.id} className="flex items-center justify-between gap-2 bg-muted rounded-lg px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{tx.txId}</p>
                        <p className="text-xs text-muted-foreground">{tx.country} • {tx.payerNumber || "Inconnu"}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold">{tx.amount.toLocaleString()} F</p>
                        <Badge variant={tx.status === "confirmed" ? "default" : "secondary"} className="text-xs px-1">{tx.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AdminPaymentLinksPanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const baseUrl = window.location.origin;
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
  const { token } = useAuth();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [slug, setSlug] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMerchantId, setSelectedMerchantId] = useState<number | null>(null);

  const { data: merchants = [], isLoading } = useAdminFetch("/api/admin/merchants", ["/api/admin/merchants"]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/create-merchant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, email, slug, password, pin: pin || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      setShowCreate(false);
      setName(""); setEmail(""); setSlug(""); setPassword(""); setPin("");
      toast({ title: "Marchand cree avec succes" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

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

  const filtered = (merchants as any[]).filter(
    (m) => m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-4">
      {selectedMerchantId && <MerchantDetailsDialog merchantId={selectedMerchantId} onClose={() => setSelectedMerchantId(null)} />}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-foreground">Marchands</h2>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-merchant"><Plus className="w-4 h-4 mr-2" />Nouveau marchand</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Creer un marchand</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Nom</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="EcoMat Togo" required data-testid="input-merchant-name" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@ecomat.com" required data-testid="input-merchant-create-email" />
              </div>
              <div className="space-y-2">
                <Label>Slug (URL)</Label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="ecomat" required data-testid="input-merchant-slug" />
              </div>
              <div className="space-y-2">
                <Label>Mot de passe</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" required data-testid="input-merchant-create-password" />
              </div>
              <div className="space-y-2">
                <Label>Code PIN (6 chiffres, optionnel)</Label>
                <Input
                  value={pin}
                  onChange={(e) => { const val = e.target.value.replace(/\D/g, "").slice(0, 6); setPin(val); }}
                  placeholder="123456"
                  maxLength={6}
                  data-testid="input-merchant-create-pin"
                />
                <p className="text-xs text-muted-foreground">Requis pour acceder a la documentation API</p>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-create-merchant">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Creer le marchand
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-10"
          placeholder="Rechercher un marchand..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          data-testid="input-search-merchants"
        />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">Aucun marchand trouve</CardContent></Card>
        ) : (
          filtered.map((merchant: any) => (
            <Card key={merchant.id} data-testid={`card-merchant-${merchant.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground" data-testid={`text-merchant-name-${merchant.id}`}>{merchant.name}</h3>
                      <Badge variant={merchant.suspended ? "destructive" : "secondary"}>
                        {merchant.suspended ? "Suspendu" : "Actif"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{merchant.email}</p>
                    <p className="text-xs text-muted-foreground">Slug: /{merchant.slug}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span><Link className="w-3 h-3 inline mr-1" />{merchant.linkCount || 0} liens</span>
                      <span><ArrowRightLeft className="w-3 h-3 inline mr-1" />{merchant.txCount || 0} transactions</span>
                      <span><DollarSign className="w-3 h-3 inline mr-1" />{(merchant.totalRevenue || 0).toLocaleString()} F</span>
                    </div>
                    {merchant.webhookUrl && (
                      <div className="flex items-center gap-1 mt-1">
                        <Webhook className="w-3 h-3 text-green-500" />
                        <p className="text-xs text-muted-foreground truncate max-w-xs" data-testid={`text-webhook-url-${merchant.id}`}>{merchant.webhookUrl}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap justify-end">
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setSelectedMerchantId(merchant.id)} data-testid={`button-details-${merchant.id}`}>
                      <Eye className="w-3 h-3" />Détails
                    </Button>
                    <TelegramDialog merchant={merchant} token={token || ""} />
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
  const { data: transactions = [], isLoading } = useAdminFetch("/api/admin/transactions", ["/api/admin/transactions"]);
  const [searchTerm, setSearchTerm] = useState("");

  if (isLoading) return <LoadingSkeleton />;

  const filtered = (transactions as any[]).filter(
    (t) => t.txId?.toLowerCase().includes(searchTerm.toLowerCase()) || t.country?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const downloadCSV = () => {
    const header = "TXID,Montant,Pays,Marchand,Statut,Date\n";
    const rows = filtered.map((t: any) =>
      `${t.txId},${t.amount},${t.country},${t.merchantName || t.merchantId},${t.status},${new Date(t.createdAt).toLocaleDateString("fr-FR")}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "transactions.csv"; a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-foreground">Transactions</h2>
        <Button variant="outline" onClick={downloadCSV} data-testid="button-export-csv">
          <Download className="w-4 h-4 mr-2" />Export CSV
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-10" placeholder="Rechercher par TXID ou pays..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} data-testid="input-search-transactions" />
      </div>

      <ScrollArea className="h-[calc(100vh-280px)]">
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">Aucune transaction</CardContent></Card>
          ) : (
            filtered.map((tx: any) => (
              <Card key={tx.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-foreground" data-testid={`text-txid-${tx.id}`}>{tx.txId}</span>
                        <Badge variant="secondary">{tx.country}</Badge>
                        <Badge variant={tx.status === "confirmed" ? "default" : "destructive"}>
                          {tx.status === "confirmed" ? "Confirme" : tx.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {tx.amount?.toLocaleString("fr-FR")} F CFA {tx.payerNumber ? `de ${tx.payerNumber}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(tx.createdAt).toLocaleString("fr-FR")}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-foreground">{tx.amount?.toLocaleString("fr-FR")}</p>
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

function CountriesPanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [merchantId, setMerchantId] = useState("");
  const [country, setCountry] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [openMerchantCombo, setOpenMerchantCombo] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");

  const { data: merchants = [] } = useAdminFetch("/api/admin/merchants", ["/api/admin/merchants"]);
  const { data: countries = [], isLoading } = useAdminFetch("/api/admin/countries", ["/api/admin/countries"]);

  const addCountryMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/add-country", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ merchantId: parseInt(merchantId), country }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Erreur"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/countries"] });
      setShowAdd(false); setMerchantId(""); setCountry("");
      toast({ title: "Pays ajoute" });
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
      toast({ title: "Solde mis a jour" });
    },
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

  if (isLoading) return <LoadingSkeleton />;

  const availableCountries = ["Togo", "Benin", "Cote d'Ivoire", "Senegal", "Mali", "Burkina Faso", "Cameroun", "Congo Brazzaville", "Gabon"];
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
        <Dialog open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) { setMerchantId(""); setCountry(""); setOpenMerchantCombo(false); } }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-country"><Plus className="w-4 h-4 mr-2" />Ajouter un pays</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Activer un pays pour un marchand</DialogTitle></DialogHeader>
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
                <Label>Pays</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger data-testid="select-country"><SelectValue placeholder="Selectionner un pays" /></SelectTrigger>
                  <SelectContent>
                    {availableCountries.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={addCountryMutation.isPending || !merchantId || !country} data-testid="button-submit-add-country">
                {addCountryMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Activer le pays
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
                  <div className="text-right shrink-0 space-y-2">
                    <p className="text-lg font-bold text-foreground">{mc.balance?.toLocaleString("fr-FR")}</p>
                    <p className="text-xs text-muted-foreground">F CFA</p>
                    <div className="flex items-center gap-1 justify-end flex-wrap">
                      <Button
                        variant={mc.omnipayEnabled ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleOmnipayMutation.mutate({ merchantId: mc.merchantId, countryId: mc.id, omnipayEnabled: !mc.omnipayEnabled })}
                        disabled={toggleOmnipayMutation.isPending}
                        data-testid={`button-toggle-omnipay-${mc.id}`}
                      >
                        {mc.omnipayEnabled ? <Zap className="w-3 h-3 mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
                        {mc.omnipayEnabled ? "Paiement actif" : "Paiement inactif"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const amount = prompt("Nouveau solde :");
                          if (amount) updateBalanceMutation.mutate({ id: mc.id, balance: parseInt(amount) });
                        }}
                        data-testid={`button-update-balance-${mc.id}`}
                      >
                        <DollarSign className="w-3 h-3 mr-1" />Modifier
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
  const filteredCountries = selectedMerchant
    ? countriesList.filter(c => c.merchantId === selectedMerchant)
    : countriesList;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">Gestion des cles API & PIN</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="w-4 h-4" />PIN des marchands
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {merchantsList.map((m) => (
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
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" />Journal d'activite API
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {(apiLogs as any[]).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Aucune activite enregistree</p>
                ) : (
                  (apiLogs as any[]).slice(0, 20).map((log: any) => (
                    <div key={log.id} className="flex items-start gap-2 p-2 rounded-md text-xs">
                      <Badge variant={log.action.includes("failed") ? "destructive" : "secondary"} className="text-xs shrink-0">
                        {log.action}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-muted-foreground truncate">{log.description}</p>
                        <p className="text-muted-foreground/60">{new Date(log.createdAt).toLocaleString("fr-FR")}</p>
                      </div>
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="w-4 h-4" />Cles API par pays
            </CardTitle>
            <select
              className="text-sm border rounded-md px-2 py-1 bg-background text-foreground"
              value={selectedMerchant || ""}
              onChange={(e) => setSelectedMerchant(e.target.value ? parseInt(e.target.value) : null)}
              data-testid="select-filter-merchant"
            >
              <option value="">Tous les marchands</option>
              {merchantsList.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
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

  const callbackUrl = typeof window !== "undefined" ? `${window.location.origin}/api/omnipay/callback` : "";

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
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Cle API (apikey)</Label>
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Votre cle API"
                data-testid="input-omnipay-apikey"
              />
              <p className="text-xs text-muted-foreground">Cle API pour authentifier les requetes de paiement.</p>
            </div>
            <div className="space-y-2">
              <Label>Cle de callback (callback_key)</Label>
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

function AdminWalletTransfersPanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const { data: transfers = [], isLoading } = useAdminFetch("/api/admin/wallet-transfers", ["/api/admin/wallet-transfers"]);
  const { data: feeConfig, refetch: refetchFee } = useAdminFetch("/api/admin/wallet-transfer-fee", ["/api/admin/wallet-transfer-fee"]);

  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<(WalletTransfer & { merchantName: string }) | null>(null);
  const [noteAction, setNoteAction] = useState<"approve" | "reject">("approve");
  const [note, setNote] = useState("");
  const [feeType, setFeeType] = useState("percentage");
  const [feeValue, setFeeValue] = useState("2");
  const [savingFee, setSavingFee] = useState(false);

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

  const allTransfers = (transfers as (WalletTransfer & { merchantName: string })[]);
  const pending = allTransfers.filter(t => t.status === "pending");

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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Tous les virements</CardTitle>
            <Badge variant="secondary">{allTransfers.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          ) : allTransfers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun virement</p>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-2">
                {allTransfers.map((wt) => (
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
            </ScrollArea>
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

function SupportContactsCard({ token }: { token: string | null }) {
  const { toast } = useToast();
  const { data: contacts, refetch } = useQuery<{
    telegram1: string; telegram2: string;
    whatsapp1: string; whatsapp2: string; hours: string; hours2: string;
  }>({
    queryKey: ["/api/public/support-contacts"],
    staleTime: 0,
  });

  const [tg1, setTg1] = useState("");
  const [tg2, setTg2] = useState("");
  const [wa1, setWa1] = useState("");
  const [wa2, setWa2] = useState("");
  const [hours, setHours] = useState("");
  const [hours2, setHours2] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (contacts) {
      setTg1(contacts.telegram1 || "");
      setTg2(contacts.telegram2 || "");
      setWa1(contacts.whatsapp1 || "");
      setWa2(contacts.whatsapp2 || "");
      setHours(contacts.hours || "");
      setHours2(contacts.hours2 || "");
    }
  }, [contacts]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/support-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ telegram1: tg1, telegram2: tg2, whatsapp1: wa1, whatsapp2: wa2, hours, hours2 }),
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
          Contacts Support (affichés sur le dashboard marchand)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Telegram 1 (handle)</Label>
                <Input value={tg1} onChange={(e) => setTg1(e.target.value)} placeholder="@Albertrobotpay" data-testid="input-support-tg1" />
              </div>
              <div className="space-y-2">
                <Label>Horaires Telegram 1</Label>
                <Input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="9h GMT à 12h" data-testid="input-support-hours" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Telegram 2 (handle)</Label>
                <Input value={tg2} onChange={(e) => setTg2(e.target.value)} placeholder="@Atfchalvt" data-testid="input-support-tg2" />
              </div>
              <div className="space-y-2">
                <Label>Horaires Telegram 2</Label>
                <Input value={hours2} onChange={(e) => setHours2(e.target.value)} placeholder="15h à 20h" data-testid="input-support-hours2" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>WhatsApp 1</Label>
                <Input value={wa1} onChange={(e) => setWa1(e.target.value)} placeholder="+1 (226) 484-5698" data-testid="input-support-wa1" />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp 2</Label>
                <Input value={wa2} onChange={(e) => setWa2(e.target.value)} placeholder="+1 (226) 484-568" data-testid="input-support-wa2" />
              </div>
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

export default function AdminDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      setLocation("/admin-access-9584");
    }
  }, [authLoading, user, setLocation]);

  if (authLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!user || user.role !== "admin") return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const menuItems: { title: string; icon: any; tab: AdminTab }[] = [
    { title: "Vue d'ensemble", icon: BarChart3, tab: "overview" },
    { title: "Marchands", icon: Users, tab: "merchants" },
    { title: "Liens de paiement", icon: Link, tab: "paymentlinks" },
    { title: "Transactions", icon: ArrowRightLeft, tab: "transactions" },
    { title: "Pays & API", icon: Globe, tab: "countries" },
    { title: "Numeros SIM", icon: Phone, tab: "numbers" },
    { title: "SMS recus", icon: MessageSquare, tab: "sms" },
    { title: "API & PIN", icon: Key, tab: "apikeys" },
    { title: "Paiement", icon: Zap, tab: "omnipay" },
    { title: "Virements", icon: ArrowUpRight, tab: "virements" },
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
                  <Shield className="w-4 h-4 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm font-bold text-sidebar-foreground">RobotPay</p>
                  <p className="text-xs text-muted-foreground">Administration</p>
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
                        data-testid={`nav-${item.tab}`}
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
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <h1 className="text-sm font-semibold text-foreground hidden sm:block">Tableau de bord</h1>
            </div>
            <Badge variant="outline" className="text-xs">{user.email}</Badge>
          </header>

          <main className="flex-1 overflow-auto p-4 md:p-6">
            {activeTab === "overview" && <OverviewPanel />}
            {activeTab === "merchants" && <MerchantsPanel />}
            {activeTab === "paymentlinks" && <AdminPaymentLinksPanel />}
            {activeTab === "transactions" && <TransactionsPanel />}
            {activeTab === "countries" && <CountriesPanel />}
            {activeTab === "numbers" && <NumbersPanel />}
            {activeTab === "sms" && <SmsPanel />}
            {activeTab === "apikeys" && <ApiKeysManagementPanel />}
            {activeTab === "omnipay" && <OmniPayPanel />}
            {activeTab === "virements" && <AdminWalletTransfersPanel />}
            {activeTab === "settings" && <SettingsPanel />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
