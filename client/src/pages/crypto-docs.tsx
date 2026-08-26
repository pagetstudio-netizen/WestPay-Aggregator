import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/lib/language";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  Shield, Lock, Loader2, BookOpen, Code, Server, Key,
  ArrowRight, CheckCircle, AlertTriangle, Globe, Bell, Menu, X,
  ShieldCheck, Copy, Check, Bitcoin, Zap, ArrowDownCircle,
} from "lucide-react";

const BASE_URL = "https://westpay.cfd";

// ─── Composant copie ─────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const handleCopy = useCallback(async () => {
    try {
      await copyTextToClipboard(text, { successTitle: t("copied") });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [text, t]);
  return (
    <Button size="icon" variant="ghost" onClick={handleCopy} className="shrink-0 h-7 w-7" data-testid="button-copy-code">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </Button>
  );
}

function CodeBlock({ code, label, lang }: { code: string; label?: string; lang?: string }) {
  const langColor: Record<string, string> = { cURL: "text-green-400", JavaScript: "text-yellow-400", PHP: "text-indigo-400", Python: "text-blue-400" };
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b bg-muted/50">
          <div className="flex items-center gap-2">
            {lang && <span className={`text-xs font-bold ${langColor[lang] || "text-muted-foreground"}`}>{lang}</span>}
            {label && <span className="text-xs text-muted-foreground truncate">{label}</span>}
          </div>
          <CopyButton text={code} />
        </div>
        <div className="p-4 overflow-x-auto bg-muted/20">
          <pre className="text-xs sm:text-sm font-mono text-foreground whitespace-pre">{code}</pre>
        </div>
      </CardContent>
    </Card>
  );
}

function LangTabs({ tabs }: { tabs: { lang: string; label: string; code: string }[] }) {
  const [active, setActive] = useState(tabs[0]?.lang || "");
  const current = tabs.find(t => t.lang === active) || tabs[0];
  return (
    <div className="space-y-2">
      <div className="flex gap-1 flex-wrap">
        {tabs.map(t => (
          <button key={t.lang} onClick={() => setActive(t.lang)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${active === t.lang ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            data-testid={`tab-lang-${t.lang.toLowerCase()}`}>
            {t.lang}
          </button>
        ))}
      </div>
      {current && <CodeBlock code={current.code} label={current.label} lang={current.lang} />}
    </div>
  );
}

function InfoBadge({ children, color = "blue" }: { children: string; color?: "blue" | "green" | "amber" | "red" }) {
  const colors = { blue: "bg-blue-500/10 text-blue-600 border-blue-500/20", green: "bg-green-500/10 text-green-600 border-green-500/20", amber: "bg-amber-500/10 text-amber-600 border-amber-500/20", red: "bg-red-500/10 text-red-600 border-red-500/20" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[color]}`}>{children}</span>;
}

function CredentialBox({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const { t } = useLanguage();
  const copy = () => { copyTextToClipboard(value, { successTitle: t("copied") }).catch(() => {}); };
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 border" style={{ background: "hsl(var(--muted)/0.3)" }}>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <p className={`text-sm font-semibold truncate ${mono ? "font-mono" : ""}`}>{value}</p>
      </div>
      <Button size="icon" variant="ghost" onClick={copy} className="shrink-0 h-7 w-7"><Copy className="w-3.5 h-3.5" /></Button>
    </div>
  );
}

// ─── Porte PIN ───────────────────────────────────────────────────────────────

function PinGate({ onAccess }: { onAccess: (data: { token: string; merchant: { name: string; email: string } }) => void }) {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/docs/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t("docsInvalidPin"));
      onAccess(data);
    } catch (err: any) {
      toast({ title: t("docsInvalidPin"), description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-3 pb-2">
          <div className="flex justify-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f59e0b 0%, #1a237e 100%)" }}>
              <Bitcoin className="w-7 h-7 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-crypto-docs-title">{t("cryptoDocsTitle")}</h1>
            <p className="text-xs text-muted-foreground mt-1">{t("cryptoDocsSubtitle")}</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="doc-email">{t("merchant")} Email</Label>
              <Input id="doc-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="contact@votreboite.com" required data-testid="input-crypto-docs-email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-pin">{t("docsPinLabel")}</Label>
              <Input id="doc-pin" type="password" value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••" maxLength={6} required data-testid="input-crypto-docs-pin" />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading || pin.length !== 6} data-testid="button-crypto-docs-access">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
              {t("docsAccessBtn")}
            </Button>
          </form>
          <p className="text-xs text-center text-muted-foreground mt-4">
            {t("docsPinConfigured")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Navigation ──────────────────────────────────────────────────────────────

function CryptoDocumentation({ token, merchantName }: { token: string; merchantName: string }) {
  const { t } = useLanguage();
  const [activeSection, setActiveSection] = useState("intro");
  const [navOpen, setNavOpen] = useState(false);
  const [info, setInfo] = useState<{ slug: string; cryptoApiKey: string | null; webhookUrl: string | null; cryptoEnabled: boolean } | null>(null);

  const sections = [
    { id: "intro",       label: t("intro"),      icon: BookOpen },
    { id: "credentials", label: t("cryptoDocsCredentialsTitle"),  icon: Key },
    { id: "slug",        label: t("cryptoDocsSlugTitle"),  icon: Globe },
    { id: "invoice",     label: t("cryptoDocsInvoiceTitle"), icon: Zap },
    { id: "status",      label: t("status"), icon: Server },
    { id: "webhook",     label: t("webhook"),           icon: Bell },
    { id: "withdraw",    label: t("withdrawals"),           icon: ArrowDownCircle },
    { id: "examples",    label: t("example"),   icon: Code },
    { id: "security",    label: t("security"),           icon: ShieldCheck },
  ];

  useEffect(() => {
    fetch("/api/docs/crypto-merchant-info", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setInfo(d))
      .catch(() => {});
  }, [token]);

  const scrollTo = (id: string) => {
    setActiveSection(id);
    setNavOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const slug = info?.slug || "votre-slug";
  const apiKey = info?.cryptoApiKey || "WP-CRYPTO-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
  const paymentPageUrl = `${BASE_URL}/pay/crypto/:trackId`;
  const slugPaymentUrl = `${BASE_URL}/pay/${slug}?mode=crypto&amount=10.00&currency=USDT&description=Produit`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 z-50 bg-background/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #f59e0b 0%, #1a237e 100%)" }}>
              <Bitcoin className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-xs sm:text-sm font-bold">RobotPay — {t("cryptoDocsTitle")}</h1>
              <p className="text-xs text-muted-foreground">v1.0 — {t("docsRestricted")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Badge variant="secondary" className="hidden sm:inline-flex" data-testid="text-crypto-docs-merchant">{merchantName}</Badge>
            <button
              className="sm:hidden flex items-center justify-center w-9 h-9 rounded-lg border bg-background shadow-sm"
              onClick={() => setNavOpen(!navOpen)} data-testid="button-mobile-nav">
              {navOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {navOpen && (
          <div className="sm:hidden border-t bg-background px-3 py-2 space-y-0.5 shadow-md">
            {sections.map(s => (
              <button key={s.id} onClick={() => scrollTo(s.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2.5 transition-colors ${activeSection === s.id ? "bg-primary/10 text-primary font-semibold" : "text-foreground hover:bg-muted"}`}>
                <s.icon className="w-4 h-4 shrink-0" />{s.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="max-w-6xl mx-auto flex gap-6 px-3 sm:px-4 py-6">
        {/* Sidebar */}
        <aside className="hidden sm:block w-52 shrink-0">
          <nav className="sticky top-20 space-y-0.5">
            {sections.map(s => (
              <button key={s.id} onClick={() => scrollTo(s.id)}
                className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${activeSection === s.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted"}`}
                data-testid={`nav-crypto-${s.id}`}>
                <s.icon className="w-3.5 h-3.5 shrink-0" />{s.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 space-y-12">

          {/* ── Introduction ── */}
          <section id="intro" className="scroll-mt-20 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{t("intro")}</h2>
                <p className="text-xs text-muted-foreground">{t("cryptoDocsIntroSubtitle")}</p>
              </div>
            </div>
            <Card>
              <CardContent className="p-5 space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t("cryptoDocsIntroDesc")}
                </p>
                <div className="grid sm:grid-cols-3 gap-3">
                  {[
                    { icon: Globe, title: t("cryptoDocsGlobalTitle"), desc: t("cryptoDocsGlobalDesc") },
                    { icon: Zap, title: t("cryptoDocsInstantTitle"), desc: t("cryptoDocsInstantDesc") },
                    { icon: ShieldCheck, title: t("cryptoDocsSecureTitle"), desc: t("cryptoDocsSecureDesc") },
                  ].map(f => (
                    <div key={f.title} className="rounded-lg p-3 border space-y-1.5">
                      <div className="flex items-center gap-2">
                        <f.icon className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold">{f.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{f.desc}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg p-3 border-l-4 border-amber-500 bg-amber-500/5 space-y-1">
                  <p className="text-xs font-semibold text-amber-600">{t("cryptoDocsFeesTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("cryptoDocsFeesDesc")}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">URL de base</p>
                  <CodeBlock code={BASE_URL} label="Base URL" />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">{t("cryptoDocsSupportedTitle")}</p>
                  <div className="flex flex-wrap gap-2">
                    {["USDT", "BTC", "ETH", "LTC", "TRX", "MATIC", "BNB", "DOGE"].map(c => (
                      <span key={c} className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: "#fff8e1", color: "#f59e0b", border: "1px solid #fde68a" }}>{c}</span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── Identifiants ── */}
          <section id="credentials" className="scroll-mt-20 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Key className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-bold">{t("cryptoDocsCredentialsTitle")}</h2>
            </div>
            <Card>
              <CardContent className="p-5 space-y-4">
                {info?.cryptoEnabled ? (
                  <div className="flex items-center gap-2 rounded-lg p-2.5 bg-green-500/10 border border-green-500/20">
                    <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                    <span className="text-xs font-medium text-green-700">{t("cryptoDocsEnabled")}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg p-2.5 bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="text-xs font-medium text-amber-700">{t("cryptoDocsDisabled")}</span>
                  </div>
                )}
                <div className="space-y-3">
                  <CredentialBox label={t("cryptoDocsSlugLabel")} value={slug} />
                  {apiKey !== "WP-CRYPTO-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" ? (
                    <CredentialBox label={t("cryptoDocsApiKeyLabel")} value={apiKey} />
                  ) : (
                    <div className="rounded-lg px-3 py-2.5 border border-dashed">
                      <p className="text-xs text-muted-foreground">{t("cryptoDocsNoApiKey")}</p>
                    </div>
                  )}
                  <CredentialBox label={t("cryptoDocsPaymentPageLabel")} value={`${BASE_URL}/pay/${slug}`} />
                </div>
                <div className="rounded-lg p-3 border bg-muted/30 space-y-2">
                  <p className="text-xs font-semibold">{t("cryptoDocsHowToUseApiKey")}</p>
                  <p className="text-xs text-muted-foreground">{t("cryptoDocsAddHeader")}</p>
                  <CodeBlock code={`X-API-KEY: ${apiKey}`} label="Header d'authentification" />
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── Lien de paiement slug ── */}
          <section id="slug" className="scroll-mt-20 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Globe className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{t("cryptoDocsSlugTitle")}</h2>
                <p className="text-xs text-muted-foreground">{t("cryptoDocsSlugSubtitle")}</p>
              </div>
            </div>
            <Card>
              <CardContent className="p-5 space-y-5">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t("cryptoDocsSlugDesc")}
                </p>

                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground">{t("cryptoDocsUrlStructure")}</p>
                  <CodeBlock
                    code={`${BASE_URL}/pay/VOTRE_SLUG?amount=MONTANT&currency=CRYPTO&description=PRODUIT&returnUrl=URL_RETOUR`}
                    label="URL de paiement" />
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground">{t("cryptoDocsParameters")}</p>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left px-3 py-2 font-semibold">{t("cryptoDocsParamName")}</th>
                          <th className="text-left px-3 py-2 font-semibold">{t("cryptoDocsParamRequired")}</th>
                          <th className="text-left px-3 py-2 font-semibold">{t("cryptoDocsParamDesc")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {[
                          { p: "amount", r: t("yes") + "*", d: "Montant à payer. Mettre 0 pour laisser le client choisir (prix libre)" },
                          { p: "currency", r: t("yes"), d: "Cryptomonnaie : USDT, BTC, ETH, LTC, TRX, MATIC, BNB, DOGE" },
                          { p: "description", r: t("no"), d: "Nom du produit / description visible sur la page de paiement" },
                          { p: "orderId", r: t("no"), d: "Votre référence interne (commande, abonnement, etc.)" },
                          { p: "returnUrl", r: t("no"), d: "URL de redirection après paiement (ex: https://monsite.com/merci)" },
                        ].map(row => (
                          <tr key={row.p} className="bg-background">
                            <td className="px-3 py-2 font-mono font-semibold text-primary">{row.p}</td>
                            <td className="px-3 py-2">
                              <InfoBadge color={row.r.startsWith(t("yes")) ? "green" : "blue"}>{row.r}</InfoBadge>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{row.d}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground">{t("cryptoDocsExamples")}</p>
                  <CodeBlock
                    code={`${BASE_URL}/pay/${slug}?amount=10.00&currency=USDT&description=Abonnement%20Premium&returnUrl=https://monsite.com/merci`}
                    label="Paiement de 10 USDT" />
                  <CodeBlock
                    code={`${BASE_URL}/pay/${slug}?amount=0.005&currency=BTC&description=Don&orderId=DON-001`}
                    label="Paiement de 0.005 BTC" />
                  <CodeBlock
                    code={`${BASE_URL}/pay/${slug}?amount=0&currency=USDT&description=Don%20libre`}
                    label="Prix libre (le client entre le montant)" />
                </div>

                <div className="rounded-lg p-3 bg-green-500/5 border border-green-500/20">
                  <p className="text-xs font-semibold text-green-700 mb-1">{t("cryptoDocsHtmlButton")}</p>
                  <CodeBlock
                    lang="JavaScript"
                    code={`<a href="${BASE_URL}/pay/${slug}?amount=10&currency=USDT&description=Produit" target="_blank">\n  <button>Payer en crypto</button>\n</a>`}
                    label="Bouton de paiement" />
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── Créer une invoice via API ── */}
          <section id="invoice" className="scroll-mt-20 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{t("cryptoDocsInvoiceTitle")}</h2>
                <p className="text-xs text-muted-foreground">{t("cryptoDocsInvoiceSubtitle")}</p>
              </div>
            </div>
            <Card>
              <CardContent className="p-5 space-y-5">
                <div className="flex items-center gap-3">
                  <span className="bg-green-500 text-white text-xs font-bold px-2.5 py-1 rounded">POST</span>
                  <code className="text-sm font-mono">/api/merchant/crypto/invoice</code>
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                  <InfoBadge color="amber">X-API-KEY requis</InfoBadge>
                </div>
                <p className="text-sm text-muted-foreground">{t("cryptoDocsInvoiceDesc")}</p>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><ArrowRight className="w-3 h-3" />{t("cryptoDocsPayload")}</p>
                  <CodeBlock code={`{
  "amount": 10.00,         // Montant (0 = prix libre)
  "currency": "USDT",     // Crypto : USDT, BTC, ETH, LTC, TRX...
  "description": "Abonnement Premium",  // Nom du produit
  "orderId": "CMD-456",   // (optionnel) votre référence
  "returnUrl": "https://monsite.com/merci"  // (optionnel)
}`} label="Request Body (JSON)" />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" />{t("cryptoDocsResponse")} (200 OK)</p>
                  <CodeBlock code={`{
  "success": true,
  "trackId": "TP-XXXXXXXXXXXXXXXX",
  "paymentUrl": "${BASE_URL}/pay/crypto/TP-XXXXXXXXXXXXXXXX",
  "expiredAt": "2026-05-01T12:30:00Z"
}`} label="Response (JSON)" />
                </div>

                <div className="rounded-lg p-3 bg-blue-500/5 border border-blue-500/20 space-y-1">
                  <p className="text-xs font-semibold text-blue-700">{t("cryptoDocsFlowTitle")}</p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>{t("cryptoDocsFlowStep1")}</li>
                    <li>{t("cryptoDocsFlowStep2")}</li>
                    <li>{t("cryptoDocsFlowStep3")}</li>
                    <li>{t("cryptoDocsFlowStep4")}</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── Vérification du statut ── */}
          <section id="status" className="scroll-mt-20 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Server className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-bold">{t("status")}</h2>
            </div>
            <Card>
              <CardContent className="p-5 space-y-5">
                <div className="flex items-center gap-3">
                  <span className="bg-blue-500 text-white text-xs font-bold px-2.5 py-1 rounded">GET</span>
                  <code className="text-sm font-mono">/api/payment/crypto/{"{trackId}"}/status</code>
                  <InfoBadge color="blue">{t("public")}</InfoBadge>
                </div>
                <p className="text-sm text-muted-foreground">{t("cryptoDocsStatusDesc")}</p>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" />{t("cryptoDocsResponse")}</p>
                  <CodeBlock code={`{
  "trackId": "TP-XXXXXXXXXXXXXXXX",
  "status": "paid",         // pending | paid | expired | failed
  "amount": "10.00",
  "currency": "USDT",
  "payAmount": "10.00",     // montant réellement reçu
  "payCurrency": "USDT",
  "walletAddress": "TXxx...abc",
  "network": "TRC20",
  "txHash": "0x..."         // hash de la transaction blockchain
}`} label="Response (JSON)" />
                </div>

                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-muted/50"><th className="text-left px-3 py-2 font-semibold">{t("status")}</th><th className="text-left px-3 py-2 font-semibold">{t("cryptoDocsParamDesc")}</th></tr></thead>
                    <tbody className="divide-y">
                      {[
                        { s: "pending", c: "blue", d: t("cryptoDocsStatusPending") },
                        { s: "confirming", c: "amber", d: t("cryptoDocsStatusConfirming") },
                        { s: "paid", c: "green", d: t("cryptoDocsStatusPaid") },
                        { s: "expired", c: "red", d: t("cryptoDocsStatusExpired") },
                        { s: "failed", c: "red", d: t("cryptoDocsStatusFailed") },
                      ].map(row => (
                        <tr key={row.s} className="bg-background">
                          <td className="px-3 py-2"><InfoBadge color={row.c as any}>{row.s}</InfoBadge></td>
                          <td className="px-3 py-2 text-muted-foreground">{row.d}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── Webhooks ── */}
          <section id="webhook" className="scroll-mt-20 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{t("webhook")}</h2>
                <p className="text-xs text-muted-foreground">{t("cryptoDocsWebhookSubtitle")}</p>
              </div>
            </div>
            <Card>
              <CardContent className="p-5 space-y-5">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t("cryptoDocsWebhookDesc")}
                </p>

                {info?.webhookUrl ? (
                  <div className="flex items-center gap-2 rounded-lg p-2.5 bg-green-500/10 border border-green-500/20">
                    <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-green-700">{t("cryptoDocsWebhookConfigured")}</p>
                      <p className="text-xs font-mono text-green-600 truncate">{info.webhookUrl}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg p-2.5 bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <p className="text-xs text-amber-700">{t("cryptoDocsNoWebhook")}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">{t("cryptoDocsWebhookPayload")}</p>
                  <CodeBlock code={`{
  "event": "crypto.payment.confirmed",
  "trackId": "TP-XXXXXXXXXXXXXXXX",
  "status": "paid",
  "currency": "USDT",
  "grossAmount": 10.00,     // montant brut reçu
  "feeAmount": 0.50,        // frais RobotPay (5%)
  "netAmount": 9.50,        // montant net crédité sur votre solde
  "orderId": "CMD-456",     // votre référence (si fournie)
  "description": "Abonnement Premium",
  "timestamp": "2026-05-01T12:35:00Z"
}`} label="Webhook Payload (JSON)" />
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground">{t("cryptoDocsWebhookSecurity")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("cryptoDocsWebhookSecurityDesc")}
                  </p>
                  <LangTabs tabs={[
                    {
                      lang: "PHP", label: t("cryptoDocsWebhookVerify"),
                      code: `<?php
$payload = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_ROBOTPAY_SIGNATURE'] ?? '';
$secret = 'VOTRE_WEBHOOK_SECRET';

$expected = hash_hmac('sha256', $payload, $secret);
if (!hash_equals($expected, $signature)) {
    http_response_code(401);
    die('Signature invalide');
}

$data = json_decode($payload, true);
if ($data['event'] === 'crypto.payment.confirmed' && $data['status'] === 'paid') {
    $orderId = $data['orderId'];
    $netAmount = $data['netAmount'];
    $currency = $data['currency'];
    // Marquer la commande comme payée dans votre base
    marquerCommandePayee($orderId, $netAmount, $currency);
}

http_response_code(200);
echo json_encode(['ok' => true]);`,
                    },
                    {
                      lang: "JavaScript", label: t("cryptoDocsWebhookVerify") + " (Node.js)",
                      code: `const crypto = require('crypto');

app.post('/webhook/robotpay', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-robotpay-signature'];
  const secret = 'VOTRE_WEBHOOK_SECRET';
  const expected = crypto
    .createHmac('sha256', secret)
    .update(req.body)
    .digest('hex');

  if (expected !== signature) {
    return res.status(401).json({ error: 'Signature invalide' });
  }

  const data = JSON.parse(req.body);
  if (data.event === 'crypto.payment.confirmed' && data.status === 'paid') {
    const { orderId, netAmount, currency } = data;
    // Marquer la commande comme payée
    await markOrderAsPaid(orderId, netAmount, currency);
  }

  res.json({ ok: true });
});`,
                    },
                  ]} />
                </div>

                <div className="rounded-lg p-3 bg-blue-500/5 border border-blue-500/20">
                  <p className="text-xs font-semibold text-blue-700 mb-1">{t("cryptoDocsWebhookBestPractices")}</p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li>{t("cryptoDocsWebhookBestPractices1")}</li>
                    <li>{t("cryptoDocsWebhookBestPractices2")}</li>
                    <li>{t("cryptoDocsWebhookBestPractices3")}</li>
                    <li>{t("cryptoDocsWebhookBestPractices4")}</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── Retraits ── */}
          <section id="withdraw" className="scroll-mt-20 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <ArrowDownCircle className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-bold">{t("withdrawals")}</h2>
            </div>
            <Card>
              <CardContent className="p-5 space-y-5">
                <p className="text-sm text-muted-foreground">{t("cryptoDocsWithdrawDesc")}</p>

                <div className="flex items-center gap-3">
                  <span className="bg-green-500 text-white text-xs font-bold px-2.5 py-1 rounded">POST</span>
                  <code className="text-sm font-mono">/api/merchant/crypto/withdraw</code>
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><ArrowRight className="w-3 h-3" />{t("cryptoDocsPayload")}</p>
                  <CodeBlock code={`{
  "currency": "USDT",
  "amount": 50.00,          // Montant brut à retirer de votre solde
  "walletAddress": "TXxx...abc",
  "network": "TRC20"        // Réseau : TRC20, ERC20, BEP20, etc.
}`} label="Request Body (JSON)" />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" />{t("cryptoDocsResponse")}</p>
                  <CodeBlock code={`{
  "id": 42,
  "message": "Demande de retrait soumise avec succès",
  "fee": {
    "rate": "5%",
    "feeAmount": "2.50000000",   // frais RobotPay
    "netAmount": "47.50000000"   // montant envoyé à votre adresse
  }
}`} label="Response (JSON)" />
                </div>

                <div className="flex items-center gap-3">
                  <span className="bg-blue-500 text-white text-xs font-bold px-2.5 py-1 rounded">GET</span>
                  <code className="text-sm font-mono">/api/merchant/crypto/withdrawals</code>
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <p className="text-xs text-muted-foreground">{t("cryptoDocsWithdrawListDesc")}</p>

                <div className="rounded-lg p-3 bg-amber-500/5 border border-amber-500/20">
                  <p className="text-xs font-semibold text-amber-700 mb-1">{t("cryptoDocsFeesTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("cryptoDocsWithdrawFeesDesc")}</p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── Exemples de code ── */}
          <section id="examples" className="scroll-mt-20 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Code className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-bold">{t("example")}</h2>
            </div>

            <Card>
              <CardContent className="p-5 space-y-6">
                <div className="space-y-3">
                  <p className="text-sm font-semibold">{t("cryptoDocsInvoiceTitle")}</p>
                  <LangTabs tabs={[
                    {
                      lang: "cURL", label: t("cryptoDocsInvoiceTitle"),
                      code: `curl -X POST ${BASE_URL}/api/merchant/crypto/invoice \\
  -H "Content-Type: application/json" \\
  -H "X-API-KEY: ${apiKey}" \\
  -d '{
    "amount": 10.00,
    "currency": "USDT",
    "description": "Abonnement Premium",
    "orderId": "CMD-001",
    "returnUrl": "https://monsite.com/merci"
  }'`,
                    },
                    {
                      lang: "PHP", label: t("cryptoDocsInvoiceTitle"),
                      code: `<?php
$apiKey = '${apiKey}';
$data = [
    'amount'      => 10.00,
    'currency'    => 'USDT',
    'description' => 'Abonnement Premium',
    'orderId'     => 'CMD-001',
    'returnUrl'   => 'https://monsite.com/merci',
];

$ch = curl_init('${BASE_URL}/api/merchant/crypto/invoice');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        "X-API-KEY: $apiKey",
    ],
    CURLOPT_POSTFIELDS => json_encode($data),
]);

$response = json_decode(curl_exec($ch), true);
curl_close($ch);

if ($response['success']) {
    // Rediriger le client
    header('Location: ' . $response['paymentUrl']);
    exit;
}`,
                    },
                    {
                      lang: "JavaScript", label: t("cryptoDocsInvoiceTitle") + " (Node.js/fetch)",
                      code: `const API_KEY = '${apiKey}';
const BASE = '${BASE_URL}';

async function createCryptoInvoice({ amount, currency, description, orderId, returnUrl }) {
  const res = await fetch(\`\${BASE}/api/merchant/crypto/invoice\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': API_KEY,
    },
    body: JSON.stringify({ amount, currency, description, orderId, returnUrl }),
  });

  const data = await res.json();
  if (!data.success) throw new Error(data.message);
  return data; // { trackId, paymentUrl, expiredAt }
}

// Utilisation
const invoice = await createCryptoInvoice({
  amount: 10.00,
  currency: 'USDT',
  description: 'Abonnement Premium',
  orderId: 'CMD-001',
  returnUrl: 'https://monsite.com/merci',
});

// Rediriger le client
window.location.href = invoice.paymentUrl;`,
                    },
                  ]} />
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold">{t("cryptoDocsStatusTitle")}</p>
                  <LangTabs tabs={[
                    {
                      lang: "cURL", label: t("cryptoDocsStatusTitle"),
                      code: `curl ${BASE_URL}/api/payment/crypto/TP-XXXXXXXXXXXXXXXX/status`,
                    },
                    {
                      lang: "PHP", label: t("cryptoDocsStatusTitle"),
                      code: `<?php
$trackId = 'TP-XXXXXXXXXXXXXXXX';
$response = json_decode(
    file_get_contents('${BASE_URL}/api/payment/crypto/' . $trackId . '/status'),
    true
);

if ($response['status'] === 'paid') {
    echo "Paiement confirmé ! Montant net : " . $response['netAmount'];
}`,
                    },
                    {
                      lang: "JavaScript", label: t("cryptoDocsStatusTitle"),
                      code: `async function checkPaymentStatus(trackId) {
  const res = await fetch(\`${BASE_URL}/api/payment/crypto/\${trackId}/status\`);
  const data = await res.json();
  return data; // { status, amount, currency, payCurrency, txHash, ... }
}

// Polling toutes les 5 secondes
const interval = setInterval(async () => {
  const status = await checkPaymentStatus('TP-XXXXXXXXXXXXXXXX');
  if (status.status === 'paid') {
    console.log('Paiement confirmé !', status);
    clearInterval(interval);
  } else if (['expired', 'failed'].includes(status.status)) {
    console.log('Paiement échoué ou expiré');
    clearInterval(interval);
  }
}, 5000);`,
                    },
                  ]} />
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── Sécurité ── */}
          <section id="security" className="scroll-mt-20 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-bold">{t("security")}</h2>
            </div>
            <Card>
              <CardContent className="p-5 space-y-4">
                {[
                  { icon: Lock, title: t("cryptoDocsSecurityApiKey"), desc: t("cryptoDocsSecurityApiKeyDesc") },
                  { icon: ShieldCheck, title: t("cryptoDocsSecurityWebhook"), desc: t("cryptoDocsSecurityWebhookDesc") },
                  { icon: Globe, title: t("cryptoDocsSecurityHttps"), desc: t("cryptoDocsSecurityHttpsDesc") },
                  { icon: CheckCircle, title: t("cryptoDocsSecurityIdempotence"), desc: t("cryptoDocsSecurityIdempotenceDesc") },
                  { icon: AlertTriangle, title: t("cryptoDocsSecurityRegenerate"), desc: t("cryptoDocsSecurityRegenerateDesc") },
                ].map(item => (
                  <div key={item.title} className="flex gap-3 p-3 rounded-lg border">
                    <item.icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

        </main>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function CryptoDocsPage() {
  const { lang, setLang, setDefaultLang } = useLanguage();
  const [session, setSession] = useState<{ token: string; merchant: { name: string; email: string } } | null>(null);

  useEffect(() => {
    // Default to English for Crypto docs if not explicitly set
    setDefaultLang("en");
  }, [setDefaultLang]);

  if (!session) {
    return <PinGate onAccess={setSession} />;
  }

  return <CryptoDocumentation token={session.token} merchantName={session.merchant.name} />;
}
