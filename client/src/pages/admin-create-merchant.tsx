import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Loader2, User, Mail, Link2, Lock, Globe, Hash,
  Shield, CheckCircle, Eye, EyeOff, Users
} from "lucide-react";

const ADMIN_BASE = "/admin-access-958425546648484886646634808526522886433";

export default function AdminCreateMerchant() {
  const { user, isLoading: authLoading, token } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [slug, setSlug] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [website, setWebsite] = useState("");
  const [pin, setPin] = useState("");
  const [totpCode, setTotpCode] = useState("");

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      setLocation(ADMIN_BASE);
    }
  }, [authLoading, user, setLocation]);

  const autoSlug = (val: string) =>
    val.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slug || slug === autoSlug(name)) {
      setSlug(autoSlug(val));
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/create-merchant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          slug: slug.trim(),
          password,
          pin: pin || undefined,
          website: website || undefined,
          totpCode,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur lors de la création");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "✅ Marchand créé avec succès",
        description: `${name} — accès : /merchant/${slug}`,
      });
      setLocation(`${ADMIN_BASE}/dashboard`);
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isValid = name.trim() && email.trim() && slug.trim() && password && totpCode.length === 6;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-sm shadow-xs">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation(`${ADMIN_BASE}/dashboard`)}
              className="gap-2 text-muted-foreground hover:text-foreground"
              data-testid="button-back-dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Retour au tableau de bord</span>
            </Button>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-sm font-semibold text-foreground">Nouveau marchand</span>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs gap-1">
            <Users className="w-3 h-3" />
            Admin
          </Badge>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Info panel */}
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Créer un compte marchand</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Remplissez les informations du nouveau marchand. Ils recevront leurs identifiants pour se connecter.
              </p>
            </div>

            <div className="space-y-3">
              {[
                {
                  icon: User,
                  title: "Nom & Slug",
                  desc: "Le slug est l'identifiant URL unique du marchand (ex: ecomat → /merchant/ecomat)",
                },
                {
                  icon: Lock,
                  title: "Mot de passe",
                  desc: "Choisissez un mot de passe fort que le marchand pourra changer par la suite",
                },
                {
                  icon: Hash,
                  title: "Code PIN (optionnel)",
                  desc: "6 chiffres requis pour accéder à la documentation API",
                },
                {
                  icon: Shield,
                  title: "Google Authenticator",
                  desc: "Votre code TOTP admin est requis pour confirmer la création",
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex gap-3 text-sm">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {createMutation.isSuccess && (
              <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 p-4 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-green-700 dark:text-green-300 text-sm">Marchand créé !</p>
                  <p className="text-xs text-green-600/80 dark:text-green-400/70 mt-0.5">Redirection en cours…</p>
                </div>
              </div>
            )}
          </div>

          {/* Right: Form */}
          <div className="lg:col-span-2">
            <Card className="shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Informations du marchand</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => { e.preventDefault(); if (isValid) createMutation.mutate(); }}
                  className="space-y-5"
                >
                  {/* Name + Email row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="merchant-name" className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                        Nom du marchand <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="merchant-name"
                        value={name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        placeholder="EcoMat Togo"
                        required
                        data-testid="input-merchant-name"
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="merchant-email" className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                        Email <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="merchant-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="contact@ecomat.com"
                        required
                        data-testid="input-merchant-create-email"
                        className="h-10"
                      />
                    </div>
                  </div>

                  {/* Slug */}
                  <div className="space-y-1.5">
                    <Label htmlFor="merchant-slug" className="flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                      Slug (URL) <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono select-none">
                        /merchant/
                      </span>
                      <Input
                        id="merchant-slug"
                        value={slug}
                        onChange={(e) => setSlug(autoSlug(e.target.value))}
                        placeholder="ecomat"
                        required
                        data-testid="input-merchant-slug"
                        className="h-10 pl-[4.8rem] font-mono text-sm"
                      />
                    </div>
                    {slug && (
                      <p className="text-xs text-muted-foreground">
                        URL d'accès :{" "}
                        <span className="font-mono text-foreground">/merchant/{slug}</span>
                      </p>
                    )}
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <Label htmlFor="merchant-password" className="flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                      Mot de passe <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="merchant-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mot de passe sécurisé"
                        required
                        data-testid="input-merchant-create-password"
                        className="h-10 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Website + PIN row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="merchant-website" className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                        Site web{" "}
                        <span className="text-xs text-muted-foreground font-normal">(optionnel)</span>
                      </Label>
                      <Input
                        id="merchant-website"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="https://example.com"
                        type="url"
                        data-testid="input-merchant-website"
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="merchant-pin" className="flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                        Code PIN{" "}
                        <span className="text-xs text-muted-foreground font-normal">(optionnel)</span>
                      </Label>
                      <Input
                        id="merchant-pin"
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="123456"
                        maxLength={6}
                        inputMode="numeric"
                        data-testid="input-merchant-create-pin"
                        className="h-10 font-mono tracking-widest"
                      />
                      <p className="text-xs text-muted-foreground">Accès documentation API</p>
                    </div>
                  </div>

                  <Separator />

                  {/* TOTP */}
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                    <Label className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold">
                      <Shield className="w-4 h-4" />
                      Code Google Authenticator <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      data-testid="input-merchant-create-totp"
                      className="h-11 text-center font-mono text-xl tracking-[0.5em] border-amber-400/50 focus:border-amber-500 bg-background"
                    />
                    <p className="text-xs text-amber-600/80 dark:text-amber-400/70">
                      Ouvrez Google Authenticator et entrez le code à 6 chiffres affiché pour votre compte WestPay
                    </p>
                    {totpCode.length > 0 && totpCode.length < 6 && (
                      <p className="text-xs text-amber-500">{6 - totpCode.length} chiffre(s) manquant(s)</p>
                    )}
                  </div>

                  {/* Submit */}
                  <div className="flex gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setLocation(`${ADMIN_BASE}/dashboard`)}
                      className="flex-1 h-11"
                      disabled={createMutation.isPending}
                      data-testid="button-cancel-create-merchant"
                    >
                      Annuler
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 h-11 font-semibold"
                      disabled={createMutation.isPending || !isValid}
                      data-testid="button-submit-create-merchant"
                    >
                      {createMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Création en cours…
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Créer le marchand
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
