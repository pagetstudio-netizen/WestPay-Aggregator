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
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger
} from "@/components/ui/sidebar";
import {
  Users, ArrowRightLeft, Globe, Phone, Settings, LogOut, Plus,
  Trash2, Ban, CheckCircle, Copy, Shield, Loader2, Download,
  MessageSquare, Key, DollarSign, Hash, Calendar, Search
} from "lucide-react";
import type { Merchant, MerchantCountry, Transaction, PhoneNumber, SmsLog } from "@shared/schema";

type AdminTab = "merchants" | "transactions" | "countries" | "numbers" | "sms" | "settings";

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

function MerchantsPanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [slug, setSlug] = useState("");
  const [password, setPassword] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: merchants = [], isLoading } = useAdminFetch("/api/admin/merchants", ["/api/admin/merchants"]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/create-merchant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, email, slug, password }),
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
      setName(""); setEmail(""); setSlug(""); setPassword("");
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

  const filtered = (merchants as Merchant[]).filter(
    (m) => m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-4">
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
          filtered.map((merchant: Merchant) => (
            <Card key={merchant.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground" data-testid={`text-merchant-name-${merchant.id}`}>{merchant.name}</h3>
                      <Badge variant={merchant.suspended ? "destructive" : "secondary"}>
                        {merchant.suspended ? "Suspendu" : "Actif"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{merchant.email}</p>
                    <p className="text-xs text-muted-foreground mt-1">Slug: /{merchant.slug}</p>
                  </div>
                  <div className="flex items-center gap-1">
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

  if (isLoading) return <LoadingSkeleton />;

  const availableCountries = ["Togo", "Benin", "Cote d'Ivoire", "Guinee", "Senegal", "Mali", "Burkina Faso", "Niger", "Ghana", "Nigeria"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-foreground">Pays & API Keys</h2>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-country"><Plus className="w-4 h-4 mr-2" />Ajouter un pays</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Activer un pays pour un marchand</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); addCountryMutation.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Marchand</Label>
                <Select value={merchantId} onValueChange={setMerchantId}>
                  <SelectTrigger data-testid="select-merchant-country"><SelectValue placeholder="Selectionner" /></SelectTrigger>
                  <SelectContent>
                    {(merchants as Merchant[]).map((m) => (
                      <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pays</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger data-testid="select-country"><SelectValue placeholder="Selectionner" /></SelectTrigger>
                  <SelectContent>
                    {availableCountries.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={addCountryMutation.isPending} data-testid="button-submit-add-country">
                {addCountryMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Activer le pays
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {(countries as any[]).length === 0 ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">Aucun pays configure</CardContent></Card>
        ) : (
          (countries as any[]).map((mc: any) => (
            <Card key={mc.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{mc.country}</span>
                      <Badge variant="secondary">{mc.merchantName || `Marchand #${mc.merchantId}`}</Badge>
                      <Badge variant={mc.active ? "default" : "destructive"}>{mc.active ? "Actif" : "Inactif"}</Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Key className="w-3 h-3 text-muted-foreground" />
                      <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md font-mono">{mc.apiKey}</code>
                      <Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(mc.apiKey); toast({ title: "Copie !" }); }}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-foreground">{mc.balance?.toLocaleString("fr-FR")}</p>
                    <p className="text-xs text-muted-foreground">F CFA</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
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
                    {["Togo", "Benin", "Cote d'Ivoire", "Guinee", "Senegal"].map((c) => (
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
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { if (confirm("Supprimer ce numero ?")) deleteNumberMutation.mutate(num.id); }}
                    data-testid={`button-delete-number-${num.id}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
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

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">SMS recus</h2>
      <ScrollArea className="h-[calc(100vh-220px)]">
        <div className="space-y-2">
          {(smsLogs as SmsLog[]).length === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">Aucun SMS recu</CardContent></Card>
          ) : (
            (smsLogs as SmsLog[]).map((sms) => (
              <Card key={sms.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <MessageSquare className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-mono text-sm text-foreground">{sms.fromSim}</span>
                        <Badge variant={sms.parsed ? "default" : "secondary"}>
                          {sms.parsed ? "Traite" : "Non traite"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 break-all">{sms.smsText}</p>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(sms.createdAt).toLocaleString("fr-FR")}</p>
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

function SettingsPanel() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { token } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isChanging, setIsChanging] = useState(false);

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
  const [activeTab, setActiveTab] = useState<AdminTab>("merchants");

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      setLocation("/admin-access-9584");
    }
  }, [authLoading, user, setLocation]);

  if (authLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!user || user.role !== "admin") return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const { data: stats } = useAdminFetch("/api/admin/stats", ["/api/admin/stats"]);

  const menuItems: { title: string; icon: any; tab: AdminTab }[] = [
    { title: "Marchands", icon: Users, tab: "merchants" },
    { title: "Transactions", icon: ArrowRightLeft, tab: "transactions" },
    { title: "Pays & API", icon: Globe, tab: "countries" },
    { title: "Numeros SIM", icon: Phone, tab: "numbers" },
    { title: "SMS recus", icon: MessageSquare, tab: "sms" },
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
                  <p className="text-sm font-bold text-sidebar-foreground">WestPay</p>
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
            {activeTab !== "settings" && activeTab !== "sms" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatCard title="Marchands" value={stats?.merchantCount || 0} icon={Users} />
                <StatCard title="Transactions" value={stats?.transactionCount || 0} icon={Hash} />
                <StatCard title="Volume total" value={`${(stats?.totalVolume || 0).toLocaleString("fr-FR")} F`} icon={DollarSign} />
                <StatCard title="Numeros actifs" value={stats?.activeNumbers || 0} icon={Phone} />
              </div>
            )}

            {activeTab === "merchants" && <MerchantsPanel />}
            {activeTab === "transactions" && <TransactionsPanel />}
            {activeTab === "countries" && <CountriesPanel />}
            {activeTab === "numbers" && <NumbersPanel />}
            {activeTab === "sms" && <SmsPanel />}
            {activeTab === "settings" && <SettingsPanel />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
