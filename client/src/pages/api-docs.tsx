import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Shield, Lock, Loader2, BookOpen, Code, Server, Key,
  ArrowRight, CheckCircle, AlertTriangle, Globe, Zap, Copy, Check,
  Send, ArrowDownCircle, Bell, Menu, X, ShieldCheck, FileText, Hash, Download,
  Eye, EyeOff
} from "lucide-react";
import Captcha, { generateCaptchaCode } from "@/components/Captcha";

const BASE_URL = "https://west-pay-aggregator-1--beryowone.replit.app";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.left = "-9999px";
        document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
      }
      setCopied(true);
      toast({ title: "Code copie !" });
      setTimeout(() => setCopied(false), 2000);
    } catch { toast({ title: "Impossible de copier", variant: "destructive" }); }
  }, [text, toast]);
  return (
    <Button size="icon" variant="ghost" onClick={handleCopy} className="shrink-0 h-7 w-7" data-testid="button-copy-code">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </Button>
  );
}

function CodeBlock({ code, label, lang }: { code: string; label?: string; lang?: string }) {
  const langColor: Record<string, string> = { JavaScript: "text-yellow-400", PHP: "text-indigo-400", Python: "text-blue-400" };
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

const DOC_FEATURES = [
  { icon: BookOpen, label: "Documentation complète de l'API RobotPay" },
  { icon: Code, label: "Exemples de code prêts à intégrer" },
  { icon: Key, label: "Gestion de vos clés API par pays" },
  { icon: Shield, label: "Accès sécurisé par PIN personnel" },
];

function PinGate({ onAccess }: { onAccess: (data: { token: string; merchant: { name: string; email: string } }) => void }) {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [captchaCode, setCaptchaCode] = useState(() => generateCaptchaCode());
  const [captchaInput, setCaptchaInput] = useState("");
  const [captchaError, setCaptchaError] = useState(false);
  const { toast } = useToast();

  const refreshCaptcha = useCallback(() => {
    setCaptchaCode(generateCaptchaCode());
    setCaptchaInput("");
    setCaptchaError(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (captchaInput.toUpperCase() !== captchaCode) {
      setCaptchaError(true);
      refreshCaptcha();
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/docs/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Accès refusé");
      onAccess(data);
    } catch (err: any) {
      toast({ title: "Accès refusé", description: err.message, variant: "destructive" });
      refreshCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      <style>{`
        .pg-input {
          width:100%;padding:0.7rem 0.9rem;font-size:0.9rem;
          border:1.5px solid #e2e8f0;border-radius:10px;
          background:#fafafa;color:#1a1a1a;outline:none;
          transition:border-color 0.15s,box-shadow 0.15s,background 0.15s;
          font-family:inherit;
        }
        .pg-input:focus { border-color:#00b050;box-shadow:0 0 0 3px rgba(0,176,80,0.1);background:#fff; }
        .pg-input::placeholder { color:#b0bec5; }
        .pg-input-error { border-color:#ef4444 !important; box-shadow:0 0 0 3px rgba(239,68,68,0.1) !important; }
        .pg-btn {
          width:100%;padding:0.8rem;font-size:0.95rem;font-weight:700;
          background:linear-gradient(135deg,#00b050,#009a45);color:#fff;
          border:none;border-radius:10px;cursor:pointer;
          transition:opacity 0.15s,transform 0.1s,box-shadow 0.15s;
          display:flex;align-items:center;justify-content:center;gap:0.5rem;
          box-shadow:0 4px 14px rgba(0,176,80,0.3);letter-spacing:0.01em;
        }
        .pg-btn:hover:not(:disabled) { opacity:0.92;box-shadow:0 6px 20px rgba(0,176,80,0.35); }
        .pg-btn:active:not(:disabled) { transform:scale(0.98); }
        .pg-btn:disabled { opacity:0.45;cursor:not-allowed;box-shadow:none; }
      `}</style>

      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: "linear-gradient(145deg,#00b050 0%,#005c2e 60%,#003d1e 100%)" }}>
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 25% 75%,#ffffff 0%,transparent 55%),radial-gradient(circle at 75% 25%,#ffffff 0%,transparent 45%)" }} />

        <div className="relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white shadow-lg flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.25)" }}>
              <img src="/robotpay-logo.jpg" alt="WestPay" className="w-full h-full object-cover" />
            </div>
            <div>
              <span className="text-3xl font-black text-white tracking-tight leading-none block">WestPay</span>
              <p className="text-white/60 text-sm mt-1">Documentation API</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 space-y-6">
          <div>
            <h2 className="text-3xl xl:text-4xl font-black text-white leading-tight mb-3">
              Intégrez RobotPay dans vos applications
            </h2>
            <p className="text-white/70 text-base leading-relaxed">
              Accédez à la documentation complète de notre API de paiement Mobile Money pour l'Afrique de l'Ouest et du Centre.
            </p>
          </div>

          <div className="space-y-3">
            {DOC_FEATURES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <span className="text-white/85 text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>

          <div className="bg-white/10 backdrop-blur rounded-2xl p-5 border border-white/15">
            <p className="text-white/70 text-xs font-medium uppercase tracking-widest mb-2">Accès sécurisé</p>
            <p className="text-white text-sm font-semibold">Votre PIN est configuré par l'administrateur. Chaque accès est journalisé.</p>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
          <span className="text-white/50 text-xs">Documentation sécurisée</span>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 bg-white">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="flex lg:hidden flex-col items-center gap-3 mb-8">
            <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-lg border border-slate-100">
              <img src="/robotpay-logo.jpg" alt="WestPay" className="w-full h-full object-cover" />
            </div>
            <div className="text-center">
              <span className="text-2xl font-black text-slate-900 block">WestPay</span>
              <span className="text-sm text-slate-400">Documentation API</span>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-black text-slate-900 mb-1" data-testid="text-docs-title">Accès Documentation</h1>
            <p className="text-slate-500 text-sm">Entrez vos identifiants marchands pour accéder à la documentation API.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">Adresse email</label>
              <input
                type="email"
                className="pg-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                required
                autoComplete="username"
                data-testid="input-docs-email"
              />
            </div>

            {/* PIN */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">Code PIN (6 chiffres)</label>
              <div className="relative">
                <input
                  type={showPin ? "text" : "password"}
                  className="pg-input"
                  style={{ paddingRight: "2.75rem", letterSpacing: showPin ? "normal" : "0.3em" }}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  maxLength={6}
                  required
                  autoComplete="current-password"
                  data-testid="input-docs-pin"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  data-testid="button-toggle-pin-visibility"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* CAPTCHA */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Code de sécurité</label>
              <Captcha code={captchaCode} onRefresh={refreshCaptcha} />
              <input
                type="text"
                className={`pg-input ${captchaError ? "pg-input-error" : ""}`}
                value={captchaInput}
                onChange={(e) => { setCaptchaInput(e.target.value.toUpperCase()); setCaptchaError(false); }}
                placeholder="Entrez le code ci-dessus"
                maxLength={5}
                autoComplete="off"
                spellCheck={false}
                required
                data-testid="input-docs-captcha"
              />
              {captchaError && (
                <p className="text-xs text-red-500 font-medium">Code incorrect, un nouveau code a été généré.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || !email || pin.length !== 6 || captchaInput.length < 5}
              className="pg-btn"
              style={{ marginTop: "0.75rem" }}
              data-testid="button-docs-access"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
              {isLoading ? "Vérification..." : "Accéder à la documentation"}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
              <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 leading-relaxed">
                Votre PIN d'accès est fourni par l'administrateur RobotPay. Chaque connexion est enregistrée à des fins de sécurité.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EndpointCard({ method, path, description, requestBody, responseBody, authRequired, notes }: {
  method: string; path: string; description: string;
  requestBody?: string; responseBody: string; authRequired?: boolean; notes?: string;
}) {
  const [open, setOpen] = useState(false);
  const colors: Record<string, string> = { GET: "bg-blue-500", POST: "bg-green-500", PUT: "bg-amber-500", DELETE: "bg-red-500", PATCH: "bg-purple-500" };
  return (
    <div className="border rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors text-left" data-testid={`endpoint-${method}-${path.replace(/\//g, "-")}`}>
        <span className={`text-white text-xs font-bold px-2 py-0.5 rounded shrink-0 ${colors[method] || "bg-gray-500"}`}>{method}</span>
        <code className="text-xs sm:text-sm font-mono text-foreground flex-1 min-w-0 break-all">{path}</code>
        {authRequired && <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
        <span className="text-muted-foreground text-xs shrink-0">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t px-3 pb-3 space-y-3">
          <p className="text-sm text-muted-foreground pt-3">{description}</p>
          {notes && (
            <div className="flex items-start gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-600 dark:text-amber-400">{notes}</p>
            </div>
          )}
          {requestBody && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1"><ArrowRight className="w-3 h-3" />Corps de la requete</p>
              <CodeBlock code={requestBody} label="Request Body (JSON)" />
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" />Reponse (200 OK)</p>
            <CodeBlock code={responseBody} label="Response (JSON)" />
          </div>
        </div>
      )}
    </div>
  );
}

const SECTIONS = [
  { id: "intro", label: "Introduction", icon: BookOpen },
  { id: "auth", label: "Authentification", icon: Key },
  { id: "endpoints", label: "Endpoints", icon: Server },
  { id: "payment", label: "Paiement", icon: Globe },
  { id: "transfer", label: "Transferts", icon: ArrowDownCircle },
  { id: "webhook", label: "Webhooks", icon: Bell },
  { id: "examples", label: "Exemples de code", icon: Code },
  { id: "errors", label: "Gestion des erreurs", icon: AlertTriangle },
  { id: "security", label: "Securite", icon: ShieldCheck },
];

function ApiDocumentation({ merchantName }: { merchantName: string }) {
  const [activeSection, setActiveSection] = useState("intro");
  const [navOpen, setNavOpen] = useState(false);

  const scrollTo = (id: string) => {
    setActiveSection(id);
    setNavOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 z-50 bg-background/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xs sm:text-sm font-bold text-foreground">WestPay API Documentation</h1>
              <p className="text-xs text-muted-foreground">v2.0 — Usage restreint</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" data-testid="text-docs-merchant">{merchantName}</Badge>
            <button
              className="sm:hidden flex items-center justify-center w-9 h-9 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm transition-all duration-200 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95"
              onClick={() => setNavOpen(!navOpen)}
              data-testid="button-mobile-nav"
              aria-label="Menu de navigation"
            >
              <div className={`transition-all duration-200 ${navOpen ? "rotate-90 opacity-80" : "rotate-0 opacity-100"}`}>
                {navOpen
                  ? <X className="w-5 h-5 text-gray-800 dark:text-gray-100" />
                  : <Menu className="w-5 h-5 text-gray-800 dark:text-gray-100" />
                }
              </div>
            </button>
          </div>
        </div>
        {navOpen && (
          <div className="sm:hidden border-t bg-background px-3 py-2 space-y-0.5 shadow-md">
            {SECTIONS.map(s => (
              <button key={s.id} onClick={() => scrollTo(s.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2.5 transition-colors ${activeSection === s.id ? "bg-primary/10 text-primary font-semibold" : "text-foreground hover:bg-muted"}`}>
                <s.icon className="w-4 h-4 shrink-0" />{s.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="max-w-6xl mx-auto flex gap-6 px-3 sm:px-4 py-6">
        <aside className="hidden sm:block w-52 shrink-0">
          <nav className="sticky top-20 space-y-0.5">
            {SECTIONS.map(s => (
              <button key={s.id} onClick={() => scrollTo(s.id)}
                className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${activeSection === s.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted"}`}
                data-testid={`nav-${s.id}`}>
                <s.icon className="w-3.5 h-3.5 shrink-0" />{s.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 min-w-0 space-y-10">

          {/* ── INTRODUCTION ── */}
          <section id="intro" className="space-y-4 scroll-mt-20">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary shrink-0" />Introduction
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              WestPay est une plateforme d'aggregation de paiements Mobile Money en Afrique de l'Ouest et du Centre.
              L'API REST permet d'integrer les paiements, les retraits automatiques, la consultation des soldes et les
              notifications en temps reel dans n'importe quelle application web ou mobile.
            </p>
            <a
              href="/WestPay_API_Documentation_v2.pdf"
              download="WestPay_API_Documentation_v2.pdf"
              className="flex items-center justify-center gap-3 w-full py-4 px-6 rounded-xl text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-md"
              data-testid="button-download-docs"
            >
              <Download className="w-5 h-5 shrink-0" />
              Télécharger la documentation en PDF
            </a>

            <div className="grid gap-3 sm:grid-cols-2">
              <Card><CardContent className="p-3 space-y-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">URL de base</p>
                <code className="text-sm font-mono text-foreground">{BASE_URL}</code>
              </CardContent></Card>
              <Card><CardContent className="p-3 space-y-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Format</p>
                <p className="text-sm text-foreground">JSON (application/json)</p>
              </CardContent></Card>
              <Card><CardContent className="p-3 space-y-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Methodes HTTP</p>
                <p className="text-sm text-foreground">GET · POST · PUT · PATCH · DELETE</p>
              </CardContent></Card>
              <Card><CardContent className="p-3 space-y-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Auth</p>
                <p className="text-sm text-foreground">JWT Bearer Token + Cle API</p>
              </CardContent></Card>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                "Paiements Mobile Money via USSD push",
                "Retraits automatiques vers Mobile Money",
                "Notifications webhook en temps reel",
                "Support multi-pays et multi-operateurs",
                "Page de paiement securisee et hebergee",
                "Consultation des soldes par pays",
                "Historique complet des transactions",
                "Signature HMAC-SHA256 pour la securite",
              ].map(f => (
                <div key={f} className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  <span className="text-sm text-foreground">{f}</span>
                </div>
              ))}
            </div>
            <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
              <CardContent className="p-3 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Important</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Ne partagez jamais vos cles API ni votre secret webhook. Regenerez-les immediatement si vous suspectez une compromission.</p>
                </div>
              </CardContent>
            </Card>
          </section>

          <Separator />

          {/* ── AUTHENTIFICATION ── */}
          <section id="auth" className="space-y-4 scroll-mt-20">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Key className="w-5 h-5 text-primary shrink-0" />Authentification
            </h2>
            <p className="text-sm text-muted-foreground">
              L'API utilise deux niveaux d'authentification : un <strong>token JWT</strong> obtenu apres connexion,
              et une <strong>cle API par pays</strong> disponible dans votre tableau de bord.
            </p>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground mb-2">1. Obtenir un token JWT</p>
                <EndpointCard
                  method="POST"
                  path="/api/auth/merchant/login"
                  description="Authentification du marchand. Retourne un token JWT valide 24 heures."
                  requestBody={`{
  "email": "contact@votreentreprise.com",
  "password": "votre_mot_de_passe"
}`}
                  responseBody={`{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "contact@votreentreprise.com",
    "name": "Votre Entreprise",
    "slug": "votre-slug",
    "role": "merchant"
  }
}`}
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground mb-2">2. Inclure le token dans chaque requete</p>
                <CodeBlock label="Headers requis" code={`Authorization: Bearer <VOTRE_JWT_TOKEN>
Content-Type: application/json`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground mb-2">3. Cle API par pays (methode simplifiee pour les retraits)</p>
                <p className="text-sm text-muted-foreground mb-2">
                  Pour les retraits via <code className="bg-muted px-1 rounded text-xs">POST /api/merchant/transfer</code>,
                  vous pouvez utiliser directement votre <strong>cle API pays</strong> sans passer par la connexion JWT.
                  Disponible dans votre dashboard sous "Cles API". Format : <code className="bg-muted px-1 rounded text-xs">PREFIX-[40 caracteres]</code>
                </p>
                <CodeBlock label="Header X-API-KEY (suffit pour les retraits)" code={`X-API-KEY: TGO-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
Content-Type: application/json`} />
                <p className="text-xs text-muted-foreground mt-2">Chaque cle est liee a un pays precis — utilisez la cle du pays concerne par le retrait.</p>
              </div>
            </div>
          </section>

          <Separator />

          {/* ── ENDPOINTS ── */}
          <section id="endpoints" className="space-y-4 scroll-mt-20">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Server className="w-5 h-5 text-primary shrink-0" />Endpoints — Consultation
            </h2>
            <p className="text-xs text-muted-foreground mb-2">Cliquez sur un endpoint pour voir les details.</p>
            <div className="space-y-2">
              <EndpointCard method="GET" path="/api/merchant/balance" description="Recupere les soldes du marchand par pays." authRequired
                responseBody={`[
  {
    "id": 1,
    "merchantId": 1,
    "country": "Togo",
    "apiKey": "TGO-a1b2c3...",
    "balance": 125000,
    "active": true,
    "omnipayEnabled": true
  },
  {
    "id": 2,
    "merchantId": 1,
    "country": "Benin",
    "apiKey": "BEN-x9y8z7...",
    "balance": 45000,
    "active": true,
    "omnipayEnabled": false
  }
]`} />

              <EndpointCard method="GET" path="/api/merchant/transactions" description="Liste toutes les transactions du marchand (paiements et transferts). Limite a 100 resultats recents." authRequired
                notes="Les transactions de type transfert (retrait) ont un txId prefixe par TR-"
                responseBody={`[
  {
    "id": 101,
    "merchantId": 1,
    "country": "Togo",
    "txId": "OP-abc123def456",
    "amount": 5000,
    "payerNumber": "+22890123456",
    "status": "confirmed",
    "provider": "mobile",
    "createdAt": "2026-03-01T10:30:00.000Z"
  },
  {
    "id": 102,
    "merchantId": 1,
    "country": "Togo",
    "txId": "TR-xyz789ghi012",
    "amount": 3000,
    "payerNumber": "+22898654321",
    "status": "confirmed",
    "provider": "transfer",
    "createdAt": "2026-03-01T14:00:00.000Z"
  }
]`} />

              <EndpointCard method="GET" path="/api/merchant/stats" description="Statistiques du marchand : nombre de transactions et volume total confirme." authRequired
                responseBody={`{
  "transactionCount": 42,
  "totalVolume": 875000
}`} />

              <EndpointCard method="GET" path="/api/merchant/api-keys" description="Liste les cles API du marchand par pays actif." authRequired
                responseBody={`[
  {
    "id": 1,
    "country": "Togo",
    "apiKey": "TGO-a1b2c3d4e5f6...",
    "balance": 125000,
    "active": true
  }
]`} />

              <EndpointCard method="POST" path="/api/merchant/regenerate-api" description="Regenere la cle API d'un pays. L'ancienne cle est invalidee immediatement." authRequired
                notes="Attention : toutes les integrations utilisant l'ancienne cle cesseront de fonctionner."
                requestBody={`{ "merchantCountryId": 1 }`}
                responseBody={`{
  "success": true,
  "apiKey": "TGO-nouvelleclegenereealeatoirement..."
}`} />
            </div>
          </section>

          <Separator />

          {/* ── PAIEMENT ── */}
          <section id="payment" className="space-y-4 scroll-mt-20">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary shrink-0" />Paiements (Depot)
            </h2>
            <p className="text-sm text-muted-foreground">
              WestPay fourni une page de paiement hebergee et securisee. Redirigez simplement vos utilisateurs vers cette URL — ils entrent leur numero Mobile Money et valident le paiement directement sur leur telephone via USSD.
            </p>

            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-primary" />Page de paiement hebergee RobotPay</p>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal pl-4">
                  <li>Redirigez votre utilisateur vers l'URL de paiement :</li>
                </ol>
                <CodeBlock code={`${BASE_URL}/pay?merchant=votre-slug&amount=5000&country=Togo&redirect=${encodeURIComponent("https://votresite.com/merci")}`} label="URL de paiement" />
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal pl-4 mt-3" start={2}>
                  <li>Le client entre son numero et valide le paiement USSD sur son telephone</li>
                  <li>Votre URL de redirection recoit : <code className="bg-muted px-1 rounded">?status=success&amount=5000&ref=OP-abc123</code></li>
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-foreground mb-2">Parametres de l'URL de paiement</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b">
                      <th className="text-left p-2 text-foreground font-semibold">Parametre</th>
                      <th className="text-left p-2 text-foreground font-semibold">Requis</th>
                      <th className="text-left p-2 text-foreground font-semibold">Description</th>
                    </tr></thead>
                    <tbody className="text-muted-foreground text-xs sm:text-sm">
                      <tr className="border-b"><td className="p-2 font-mono">merchant</td><td className="p-2 text-green-500">Oui</td><td className="p-2">Votre slug marchand (ex: ecomat)</td></tr>
                      <tr className="border-b"><td className="p-2 font-mono">amount</td><td className="p-2 text-green-500">Oui</td><td className="p-2">Montant en F CFA (entier positif)</td></tr>
                      <tr className="border-b"><td className="p-2 font-mono">country</td><td className="p-2 text-muted-foreground">Non</td><td className="p-2">Pays (ex: Togo). Premier pays actif si omis</td></tr>
                      <tr><td className="p-2 font-mono">redirect</td><td className="p-2 text-muted-foreground">Non</td><td className="p-2">URL de retour apres paiement (encoder avec encodeURIComponent)</td></tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-foreground mb-3">Operateurs disponibles par pays</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead><tr className="border-b">
                      <th className="text-left p-2 text-foreground font-semibold">Pays</th>
                      <th className="text-left p-2 text-foreground font-semibold">Code</th>
                      <th className="text-left p-2 text-foreground font-semibold">Operateurs</th>
                    </tr></thead>
                    <tbody className="text-muted-foreground">
                      {[
                        ["Togo", "+228", "Moov Money, TMoney"],
                        ["Benin", "+229", "MTN Mobile Money"],
                        ["Burkina Faso", "+226", "Moov Money, Orange Money"],
                        ["Cote d'Ivoire", "+225", "Moov Money, MTN, Orange Money, Wave"],
                        ["Senegal", "+221", "Mixx by Yas, Orange Money, Wave"],
                        ["Mali", "+223", "Orange Money"],
                        ["Cameroun", "+237", "MTN Mobile Money, Orange Money"],
                        ["Congo Brazzaville", "+242", "MTN Mobile Money"],
                        ["Congo RDC", "+243", "Orange Money, M-Pesa"],
                        ["Gabon", "+241", "Airtel Money, Moov Money"],
                        ["Guinée", "+224", "MTN Mobile Money, Orange Money"],
                      ].map(([pays, code, ops]) => (
                        <tr key={pays} className="border-b last:border-0">
                          <td className="p-2">{pays}</td><td className="p-2 font-mono">{code}</td><td className="p-2">{ops}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20">
              <CardContent className="p-4 flex gap-3">
                <span className="text-orange-500 text-lg shrink-0">⚠️</span>
                <div className="text-sm text-orange-800 dark:text-orange-300 space-y-1">
                  <p className="font-semibold">Orange Money — Burkina Faso : code OTP obligatoire</p>
                  <p>Pour payer via Orange Money au Burkina Faso, le client doit d'abord <strong>générer un code OTP</strong> depuis son téléphone, puis le saisir sur la page de paiement.</p>
                  <p className="font-mono text-xs bg-orange-100 dark:bg-orange-900 px-2 py-1 rounded mt-1">
                    Composer sur le téléphone : <strong>*144*4*6*montant#</strong><br />
                    Ex. pour 5 000 F CFA : <strong>*144*4*6*5000#</strong>
                  </p>
                  <p>Un champ de saisie OTP s'affiche automatiquement sur la page de paiement RobotPay lorsque Orange Money Burkina Faso est sélectionné.</p>
                </div>
              </CardContent>
            </Card>
          </section>

          <Separator />

          {/* ── TRANSFERTS ── */}
          <section id="transfer" className="space-y-4 scroll-mt-20">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <ArrowDownCircle className="w-5 h-5 text-primary shrink-0" />Retraits automatiques (Transferts)
            </h2>
            <p className="text-sm text-muted-foreground">
              Envoyez de l'argent directement vers n'importe quel portefeuille Mobile Money. Le montant est debite
              de votre solde et transfere instantanement au destinataire.
            </p>
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-foreground mb-2">Flux de retrait</p>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal pl-4">
                  <li>Appelez l'endpoint avec le numero, le montant et le nom du destinataire</li>
                  <li>WestPay verifie votre solde disponible</li>
                  <li>Le montant est transfere sur le portefeuille Mobile Money du destinataire</li>
                  <li>Votre solde est debite (montant + frais eventuels)</li>
                  <li>La transaction est enregistree avec un txId prefixe <code className="bg-muted px-1 rounded">TR-</code></li>
                </ol>
              </CardContent>
            </Card>
            <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
              <CardContent className="p-4 flex gap-3">
                <span className="text-amber-500 text-lg shrink-0">⚠️</span>
                <div className="text-sm text-amber-800 dark:text-amber-300 space-y-1">
                  <p className="font-semibold">Format du numero de telephone (msisdn)</p>
                  <p>Le numero doit toujours inclure l'indicatif pays, sans le <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">+</code>.</p>
                  <p className="font-mono text-xs bg-amber-100 dark:bg-amber-900 px-2 py-1 rounded mt-1">
                    228 + 90123456 → <strong>22890123456</strong> &nbsp;(Togo)<br />
                    225 + 0789012345 → <strong>2250789012345</strong> &nbsp;(Côte d'Ivoire)<br />
                    229 + 97123456 → <strong>22997123456</strong> &nbsp;(Bénin)<br />
                    221 + 771234567 → <strong>221771234567</strong> &nbsp;(Sénégal)
                  </p>
                </div>
              </CardContent>
            </Card>
            <EndpointCard method="POST" path="/api/merchant/transfer" description="Effectue un retrait automatique vers un portefeuille Mobile Money. Debite votre solde marchand." authRequired
              notes="Le numero msisdn doit inclure l'indicatif pays (ex: 228 pour Togo, 225 pour Cote d'Ivoire). Le champ operator est optionnel — auto-detecte depuis le numero."
              requestBody={`{
  "country": "Togo",
  "msisdn": "22890123456",
  "amount": 5000,
  "firstName": "Jean",
  "lastName": "Dupont",
  "operator": "moov"
}`}
              responseBody={`{
  "success": true,
  "reference": "WP-abc123def456",
  "transactionId": 1024,
  "fees": 100,
  "amount": 5000,
  "country": "Togo"
}`} />
          </section>

          <Separator />

          {/* ── WEBHOOKS ── */}
          <section id="webhook" className="space-y-4 scroll-mt-20">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary shrink-0" />Webhooks & Notifications
            </h2>
            <p className="text-sm text-muted-foreground">
              Configurez une URL webhook pour recevoir des notifications en temps reel a chaque paiement confirme.
              WestPay envoie un POST signe avec votre secret via HMAC-SHA256.
            </p>
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-foreground mb-2">Configuration en 4 etapes</p>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal pl-4">
                  <li>Allez dans votre dashboard, onglet "Webhook"</li>
                  <li>Entrez votre URL (ex : <code className="bg-muted px-1 rounded text-xs">https://votresite.com/api/webhook</code>)</li>
                  <li>Copiez et sauvegardez votre secret webhook</li>
                  <li>Cliquez "Tester" pour valider la configuration</li>
                </ol>
              </CardContent>
            </Card>
            <div>
              <p className="text-sm font-semibold text-foreground mb-2">Payload recu sur votre endpoint</p>
              <CodeBlock label="POST votre-url-webhook" code={`// Headers envoyes par WestPay
X-RobotPay-Signature: a3f8c2d1e4b7...  (HMAC-SHA256)
X-RobotPay-Event: payment.confirmed
Content-Type: application/json

// Body JSON
{
  "event": "payment.confirmed",
  "txId": "OP-abc123def456",
  "amount": 5000,
  "currency": "XOF",
  "payer": "+22890123456",
  "country": "Togo",
  "merchantSlug": "votre-slug",
  "provider": "mobile",
  "timestamp": "2026-03-01T10:30:00.000Z"
}`} />
            </div>
            <div className="space-y-2">
              <EndpointCard method="GET" path="/api/merchant/webhook" description="Recupere la configuration webhook actuelle." authRequired
                responseBody={`{
  "webhookUrl": "https://votresite.com/api/webhook",
  "webhookSecret": "votre_secret_hmac_sha256...",
  "hasWebhook": true
}`} />
              <EndpointCard method="PUT" path="/api/merchant/webhook" description="Met a jour l'URL de webhook. Un secret est genere automatiquement." authRequired
                requestBody={`{ "webhookUrl": "https://votresite.com/api/webhook" }`}
                responseBody={`{
  "success": true,
  "webhookUrl": "https://votresite.com/api/webhook",
  "webhookSecret": "secret_genere_automatiquement_32chars"
}`} />
              <EndpointCard method="POST" path="/api/merchant/webhook/test" description="Envoie une notification de test a votre URL pour verifier la configuration." authRequired
                responseBody={`{ "success": true, "statusCode": 200, "message": "Notification test envoyee" }`} />
              <EndpointCard method="GET" path="/api/merchant/webhook/logs" description="Historique des 20 dernieres notifications webhook envoyees." authRequired
                responseBody={`[
  {
    "id": 1,
    "url": "https://votresite.com/api/webhook",
    "statusCode": 200,
    "success": true,
    "createdAt": "2026-03-01T10:30:00.000Z"
  }
]`} />
            </div>
          </section>

          <Separator />

          {/* ── EXEMPLES DE CODE ── */}
          <section id="examples" className="space-y-6 scroll-mt-20">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Code className="w-5 h-5 text-primary shrink-0" />Exemples de code
            </h2>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2"><Hash className="w-4 h-4 text-muted-foreground" />1. Connexion et recuperation du solde</p>
              <LangTabs tabs={[
                {
                  lang: "JavaScript",
                  label: "Connexion + Solde",
                  code: `// ── JavaScript (Node.js / Browser) ──────────────────────────
const BASE = "${BASE_URL}";

// 1. Connexion
const loginRes = await fetch(\`\${BASE}/api/auth/merchant/login\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "contact@votreentreprise.com",
    password: "votre_mot_de_passe"
  })
});
const { token } = await loginRes.json();

// 2. Recuperer le solde
const balanceRes = await fetch(\`\${BASE}/api/merchant/balance\`, {
  headers: { "Authorization": \`Bearer \${token}\` }
});
const soldes = await balanceRes.json();
console.log("Soldes:", soldes);
// [{ country: "Togo", balance: 125000 }, ...]`
                },
                {
                  lang: "PHP",
                  label: "Connexion + Solde",
                  code: `<?php
// ── PHP (cURL) ──────────────────────────────────────────────
$BASE = "${BASE_URL}";

// 1. Connexion
$ch = curl_init("$BASE/api/auth/merchant/login");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => ["Content-Type: application/json"],
  CURLOPT_POSTFIELDS => json_encode([
    "email" => "contact@votreentreprise.com",
    "password" => "votre_mot_de_passe"
  ])
]);
$response = json_decode(curl_exec($ch), true);
curl_close($ch);
$token = $response["token"];

// 2. Recuperer le solde
$ch = curl_init("$BASE/api/merchant/balance");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => ["Authorization: Bearer $token"]
]);
$soldes = json_decode(curl_exec($ch), true);
curl_close($ch);
print_r($soldes);
?>`
                },
                {
                  lang: "Python",
                  label: "Connexion + Solde",
                  code: `# ── Python (requests) ──────────────────────────────────────
import requests

BASE = "${BASE_URL}"

# 1. Connexion
login_res = requests.post(f"{BASE}/api/auth/merchant/login", json={
    "email": "contact@votreentreprise.com",
    "password": "votre_mot_de_passe"
})
token = login_res.json()["token"]

# 2. Recuperer le solde
headers = {"Authorization": f"Bearer {token}"}
soldes = requests.get(f"{BASE}/api/merchant/balance", headers=headers).json()
print("Soldes:", soldes)`
                }
              ]} />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2"><Hash className="w-4 h-4 text-muted-foreground" />2. Rediriger vers la page de paiement</p>
              <LangTabs tabs={[
                {
                  lang: "JavaScript",
                  label: "Redirection page de paiement",
                  code: `// ── JavaScript ──────────────────────────────────────────────
const BASE = "${BASE_URL}";

// Construire l'URL de paiement et rediriger le client
const url = new URL(\`\${BASE}/pay\`);
url.searchParams.set("merchant", "votre-slug");
url.searchParams.set("amount", "5000");        // Montant en F CFA
url.searchParams.set("country", "Togo");       // Pays (optionnel)
url.searchParams.set("redirect", "https://votresite.com/merci"); // URL de retour

window.location.href = url.toString();

// Apres paiement, le client est redirige vers :
// https://votresite.com/merci?status=success&amount=5000&ref=OP-abc123`
                },
                {
                  lang: "PHP",
                  label: "Redirection page de paiement",
                  code: `<?php
// ── PHP ─────────────────────────────────────────────────────
$BASE = "${BASE_URL}";

// Construire l'URL et rediriger le client
$params = http_build_query([
  "merchant" => "votre-slug",
  "amount"   => 5000,            // Montant en F CFA
  "country"  => "Togo",         // Pays (optionnel)
  "redirect" => "https://votresite.com/merci" // URL de retour
]);

header("Location: $BASE/pay?$params");
exit;

// Apres paiement, le client est redirige vers :
// https://votresite.com/merci?status=success&amount=5000&ref=OP-abc123
?>`
                },
                {
                  lang: "Python",
                  label: "Redirection page de paiement",
                  code: `# ── Python (Flask) ──────────────────────────────────────────
from flask import redirect
from urllib.parse import urlencode

BASE = "${BASE_URL}"

@app.route("/payer")
def payer():
    params = urlencode({
        "merchant": "votre-slug",
        "amount": 5000,           # Montant en F CFA
        "country": "Togo",        # Pays (optionnel)
        "redirect": "https://votresite.com/merci"  # URL de retour
    })
    return redirect(f"{BASE}/pay?{params}")

# Apres paiement, le client est redirige vers :
# https://votresite.com/merci?status=success&amount=5000&ref=OP-abc123`
                }
              ]} />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2"><Hash className="w-4 h-4 text-muted-foreground" />3. Effectuer un retrait (transfert)</p>
              <LangTabs tabs={[
                {
                  lang: "JavaScript",
                  label: "Retrait Mobile Money",
                  code: `// ── JavaScript ──────────────────────────────────────────────
const BASE = "${BASE_URL}";

async function effectuerRetrait(token, data) {
  const res = await fetch(\`\${BASE}/api/merchant/transfer\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": \`Bearer \${token}\`
    },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Erreur retrait");
  }
  return res.json();
}

// Utilisation
try {
  const resultat = await effectuerRetrait(token, {
    country: "Togo",
    msisdn: "22890123456",
    amount: 5000,
    firstName: "Marie",
    lastName: "Konan"
  });
  console.log("Retrait reussi !");
  console.log("Reference:", resultat.reference);
  console.log("Frais:", resultat.fees, "F CFA");
} catch (err) {
  console.error("Erreur:", err.message);
}`
                },
                {
                  lang: "PHP",
                  label: "Retrait Mobile Money",
                  code: `<?php
// ── PHP ─────────────────────────────────────────────────────
$BASE = "${BASE_URL}";

function effectuerRetrait($token, $data) {
  global $BASE;
  $ch = curl_init("$BASE/api/merchant/transfer");
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
      "Content-Type: application/json",
      "Authorization: Bearer $token"
    ],
    CURLOPT_POSTFIELDS => json_encode($data)
  ]);
  $body = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  $res = json_decode($body, true);
  if ($code !== 200) {
    throw new Exception($res["message"] ?? "Erreur retrait");
  }
  return $res;
}

try {
  $resultat = effectuerRetrait($token, [
    "country" => "Togo",
    "msisdn" => "22890123456",
    "amount" => 5000,
    "firstName" => "Marie",
    "lastName" => "Konan"
  ]);
  echo "Retrait reussi ! Reference: " . $resultat["reference"];
} catch (Exception $e) {
  echo "Erreur: " . $e->getMessage();
}
?>`
                },
                {
                  lang: "Python",
                  label: "Retrait Mobile Money",
                  code: `# ── Python ──────────────────────────────────────────────────
import requests

BASE = "${BASE_URL}"

def effectuer_retrait(token, country, msisdn, amount, prenom, nom):
    res = requests.post(
        f"{BASE}/api/merchant/transfer",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        json={
            "country": country,
            "msisdn": msisdn,
            "amount": amount,
            "firstName": prenom,
            "lastName": nom
        }
    )
    res.raise_for_status()
    return res.json()

try:
    resultat = effectuer_retrait(
        token, "Togo", "22890123456", 5000, "Marie", "Konan"
    )
    print(f"Retrait reussi ! Reference: {resultat['reference']}")
    print(f"Frais: {resultat['fees']} F CFA")
except requests.exceptions.HTTPError as e:
    print(f"Erreur {e.response.status_code}: {e.response.json()['message']}")`
                }
              ]} />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2"><Hash className="w-4 h-4 text-muted-foreground" />4. Recevoir et verifier un webhook</p>
              <LangTabs tabs={[
                {
                  lang: "JavaScript",
                  label: "Webhook (Express.js)",
                  code: `// ── JavaScript (Express.js) ─────────────────────────────────
const express = require("express");
const crypto = require("crypto");
const app = express();

app.use(express.json());

const WEBHOOK_SECRET = process.env.WESTPAY_WEBHOOK_SECRET;

function verifierSignature(body, signature) {
  const attendu = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(JSON.stringify(body))
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(attendu)
  );
}

app.post("/api/webhook", (req, res) => {
  const signature = req.headers["x-robotpay-signature"];
  const event = req.headers["x-robotpay-event"];

  if (!signature || !verifierSignature(req.body, signature)) {
    return res.status(401).json({ error: "Signature invalide" });
  }

  if (event === "payment.confirmed") {
    const { txId, amount, payer, country, merchantSlug } = req.body;
    console.log(\`Paiement confirme: \${amount} F CFA de \${payer} (\${country})\`);
    // Mettre a jour votre base de donnees ici
    // await db.marquerPaiementConfirme(txId, amount);
  }

  res.json({ received: true }); // Repondre 200 rapidement
});`
                },
                {
                  lang: "PHP",
                  label: "Webhook (PHP)",
                  code: `<?php
// ── PHP ─────────────────────────────────────────────────────
// Fichier: webhook.php

$WEBHOOK_SECRET = getenv("WESTPAY_WEBHOOK_SECRET");

function verifierSignature($body, $signature, $secret) {
  $attendu = hash_hmac("sha256", $body, $secret);
  return hash_equals($attendu, $signature);
}

// Lire la requete brute
$inputBrut = file_get_contents("php://input");
$signature = $_SERVER["HTTP_X_ROBOTPAY_SIGNATURE"] ?? "";
$event = $_SERVER["HTTP_X_ROBOTPAY_EVENT"] ?? "";

if (!verifierSignature($inputBrut, $signature, $WEBHOOK_SECRET)) {
  http_response_code(401);
  echo json_encode(["error" => "Signature invalide"]);
  exit;
}

$data = json_decode($inputBrut, true);

if ($event === "payment.confirmed") {
  $txId = $data["txId"];
  $montant = $data["amount"];
  $payeur = $data["payer"];
  $pays = $data["country"];

  // Mettre a jour votre base de donnees
  // $pdo->prepare("UPDATE paiements SET statut='confirme' WHERE tx_id=?")
  //     ->execute([$txId]);

  error_log("Paiement confirme: $montant FCFA de $payeur ($pays)");
}

http_response_code(200);
echo json_encode(["received" => true]);
?>`
                },
                {
                  lang: "Python",
                  label: "Webhook (Flask)",
                  code: `# ── Python (Flask) ──────────────────────────────────────────
import hmac
import hashlib
import json
import os
from flask import Flask, request, jsonify

app = Flask(__name__)
WEBHOOK_SECRET = os.environ.get("WESTPAY_WEBHOOK_SECRET", "")

def verifier_signature(body_brut: bytes, signature: str) -> bool:
    attendu = hmac.new(
        WEBHOOK_SECRET.encode(),
        body_brut,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(attendu, signature)

@app.route("/api/webhook", methods=["POST"])
def recevoir_webhook():
    signature = request.headers.get("X-RobotPay-Signature", "")
    event = request.headers.get("X-RobotPay-Event", "")

    if not verifier_signature(request.get_data(), signature):
        return jsonify({"error": "Signature invalide"}), 401

    data = request.get_json()

    if event == "payment.confirmed":
        tx_id = data["txId"]
        montant = data["amount"]
        payeur = data["payer"]
        pays = data["country"]
        print(f"Paiement confirme: {montant} FCFA de {payeur} ({pays})")
        # Mettez a jour votre base de donnees ici

    return jsonify({"received": True}), 200

if __name__ == "__main__":
    app.run(port=3000)`
                }
              ]} />
            </div>
          </section>

          <Separator />

          {/* ── ERREURS ── */}
          <section id="errors" className="space-y-4 scroll-mt-20">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-primary shrink-0" />Gestion des erreurs
            </h2>
            <p className="text-sm text-muted-foreground">
              L'API retourne toujours un objet JSON avec un champ <code className="bg-muted px-1 rounded">message</code> en cas d'erreur.
            </p>
            <CodeBlock label="Format d'erreur" code={`{
  "message": "Description de l'erreur",
  "code": "ERROR_CODE"  // optionnel
}`} />
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/30">
                      <th className="text-left p-3 text-foreground font-semibold">Code HTTP</th>
                      <th className="text-left p-3 text-foreground font-semibold">Cause</th>
                      <th className="text-left p-3 text-foreground font-semibold">Solution</th>
                    </tr></thead>
                    <tbody>
                      {[
                        ["200", "Succes", "Requete traitee correctement", ""],
                        ["400", "Requete invalide", "Verifier les champs requis et leur format", "destructive"],
                        ["400 — Solde insuffisant", "Balance trop faible", "Verifier votre solde avant le transfert", "destructive"],
                        ["401", "Non autorise", "Token JWT expire ou invalide — se reconnecter", "destructive"],
                        ["401 — Signature invalide", "Webhook falsifie", "Verifier la generation HMAC avec le bon secret", "destructive"],
                        ["403", "Acces refuse", "Role insuffisant ou marchand suspendu", "destructive"],
                        ["404", "Ressource introuvable", "Verifier l'ID ou le slug utilise", "destructive"],
                        ["409", "Conflit", "Transaction deja existante (txId duplique)", "destructive"],
                        ["429", "Trop de requetes", "Respecter les limites de debit (rate limiting)", "destructive"],
                        ["500", "Erreur serveur", "Reessayer apres quelques secondes", "destructive"],
                      ].map(([code, label, solution]) => (
                        <tr key={code} className="border-b last:border-0">
                          <td className="p-3"><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{code}</code></td>
                          <td className="p-3 text-foreground text-xs sm:text-sm font-medium">{label}</td>
                          <td className="p-3 text-muted-foreground text-xs sm:text-sm">{solution}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div>
              <p className="text-sm font-semibold text-foreground mb-2">Exemple de gestion d'erreur robuste</p>
              <LangTabs tabs={[
                {
                  lang: "JavaScript",
                  label: "Gestion des erreurs",
                  code: `async function appelAPI(url, options = {}) {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Authorization": \`Bearer \${token}\`,
        ...(options.headers || {})
      }
    });

    const data = await res.json();

    if (!res.ok) {
      // Gestion des erreurs specifiques
      switch (res.status) {
        case 401:
          // Token expire — se reconnecter
          await seReconnecter();
          throw new Error("Session expiree, veuillez vous reconnecter");
        case 400:
          throw new Error(data.message || "Requete invalide");
        case 429:
          // Attendre avant de reessayer
          await new Promise(r => setTimeout(r, 5000));
          return appelAPI(url, options); // retry
        default:
          throw new Error(data.message || \`Erreur \${res.status}\`);
      }
    }

    return data;
  } catch (err) {
    console.error("Erreur API:", err.message);
    throw err;
  }
}`
                },
                {
                  lang: "PHP",
                  label: "Gestion des erreurs",
                  code: `<?php
function appelAPI($url, $method = "GET", $data = null, $token = null) {
  $headers = ["Content-Type: application/json"];
  if ($token) $headers[] = "Authorization: Bearer $token";

  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_HTTPHEADER => $headers,
  ]);
  if ($data) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));

  $body = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  $res = json_decode($body, true);

  switch ($code) {
    case 200: return $res;
    case 400: throw new InvalidArgumentException($res["message"] ?? "Requete invalide");
    case 401: throw new RuntimeException("Token invalide ou expire");
    case 403: throw new RuntimeException("Acces refuse");
    case 404: throw new RuntimeException("Ressource introuvable");
    case 429: throw new RuntimeException("Trop de requetes, attendez avant de reessayer");
    default:  throw new RuntimeException("Erreur serveur ($code): " . ($res["message"] ?? "Inconnue"));
  }
}
?>`
                },
                {
                  lang: "Python",
                  label: "Gestion des erreurs",
                  code: `import requests
import time

BASE = "${BASE_URL}"

class WestPayError(Exception):
    def __init__(self, status_code, message):
        self.status_code = status_code
        super().__init__(f"[{status_code}] {message}")

def appel_api(endpoint, method="GET", data=None, token=None, retry=3):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    for tentative in range(retry):
        res = requests.request(
            method, f"{BASE}{endpoint}",
            headers=headers, json=data
        )

        if res.status_code == 429:
            # Rate limit — attendre et reessayer
            time.sleep(5 * (tentative + 1))
            continue

        if not res.ok:
            err = res.json()
            raise WestPayError(res.status_code, err.get("message", "Erreur inconnue"))

        return res.json()

    raise WestPayError(429, "Limite de requetes atteinte apres plusieurs essais")`
                }
              ]} />
            </div>
          </section>

          <Separator />

          {/* ── SECURITE ── */}
          <section id="security" className="space-y-4 scroll-mt-20">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary shrink-0" />Bonnes pratiques de securite
            </h2>

            <div className="space-y-3">
              {[
                {
                  title: "Proteger la cle API et le token JWT",
                  items: [
                    "Ne jamais inclure la cle API directement dans le code source versionne (GitHub, etc.)",
                    "Utiliser des variables d'environnement : process.env.WESTPAY_API_KEY / os.getenv('WESTPAY_API_KEY')",
                    "Regenerer la cle API immediatement si vous suspectez une compromission",
                    "Le token JWT expire apres 24h — prevoir un mecanisme de re-connexion automatique",
                  ]
                },
                {
                  title: "Securiser votre endpoint webhook",
                  items: [
                    "Toujours verifier la signature HMAC-SHA256 avant de traiter un webhook",
                    "Utiliser crypto.timingSafeEqual (JS) ou hash_equals (PHP) pour eviter les timing attacks",
                    "Repondre 200 rapidement, puis traiter en arriere-plan (eviter les timeouts)",
                    "Enregistrer tous les webhooks recus dans une file d'attente (queue) pour le traitement",
                  ]
                },
                {
                  title: "Valider les donnees recues",
                  items: [
                    "Toujours verifier que le montant dans le webhook correspond au montant attendu",
                    "Verifier que le merchantSlug correspond bien a votre compte",
                    "Implementer une protection contre la rejouabilite (stocker les txId traites)",
                    "Valider le format des numeros de telephone avant de lancer un retrait",
                  ]
                },
                {
                  title: "Pratiques de code",
                  items: [
                    "Utiliser HTTPS uniquement pour votre URL webhook (HTTP sera refuse)",
                    "Implenter un mecanisme de retry avec backoff exponentiel pour les erreurs 5xx",
                    "Limiter les appels API avec du rate limiting cote client",
                    "Logger les appels API avec l'ID de transaction pour faciliter le support",
                  ]
                }
              ].map(({ title, items }) => (
                <Card key={title}>
                  <CardContent className="p-4">
                    <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-primary shrink-0" />{title}
                    </p>
                    <ul className="space-y-1">
                      {items.map(item => (
                        <li key={item} className="flex items-start gap-2 text-xs sm:text-sm text-muted-foreground">
                          <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />{item}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div>
              <p className="text-sm font-semibold text-foreground mb-2">Exemple : stocker les secrets en variables d'environnement</p>
              <LangTabs tabs={[
                {
                  lang: "JavaScript",
                  label: ".env + Node.js",
                  code: `// Fichier .env (NE PAS committer ce fichier !)
WESTPAY_API_KEY=TGO-votre_cle_api_complete
WESTPAY_WEBHOOK_SECRET=votre_secret_webhook
WESTPAY_MERCHANT_EMAIL=contact@votreentreprise.com
WESTPAY_MERCHANT_PASSWORD=votre_mot_de_passe

// Dans votre code Node.js :
require("dotenv").config();

const API_KEY = process.env.WESTPAY_API_KEY;
const WEBHOOK_SECRET = process.env.WESTPAY_WEBHOOK_SECRET;

// Fichier .gitignore :
// .env
// node_modules/`
                },
                {
                  lang: "PHP",
                  label: ".env + PHP",
                  code: `<?php
// Fichier .env (NE PAS committer !)
// WESTPAY_API_KEY=TGO-votre_cle_api
// WESTPAY_WEBHOOK_SECRET=votre_secret

// Avec vlucas/phpdotenv :
$dotenv = Dotenv\\Dotenv::createImmutable(__DIR__);
$dotenv->load();

$apiKey = $_ENV["WESTPAY_API_KEY"];
$webhookSecret = $_ENV["WESTPAY_WEBHOOK_SECRET"];

// Ou directement via les variables serveur Apache/Nginx :
$apiKey = getenv("WESTPAY_API_KEY");
?>`
                },
                {
                  lang: "Python",
                  label: ".env + Python",
                  code: `# Fichier .env (NE PAS committer !)
# WESTPAY_API_KEY=TGO-votre_cle_api
# WESTPAY_WEBHOOK_SECRET=votre_secret

# Avec python-dotenv :
from dotenv import load_dotenv
import os

load_dotenv()

API_KEY = os.getenv("WESTPAY_API_KEY")
WEBHOOK_SECRET = os.getenv("WESTPAY_WEBHOOK_SECRET")

# Verifier que les secrets sont charges
if not API_KEY or not WEBHOOK_SECRET:
    raise EnvironmentError("Variables d'environnement WESTPAY manquantes")`
                }
              ]} />
            </div>
          </section>

          <div className="py-8 text-center border-t">
            <p className="text-xs text-muted-foreground">WestPay API Documentation v2.0</p>
            <p className="text-xs text-muted-foreground mt-1">Pour toute question : contactez votre gestionnaire de compte</p>
          </div>

        </main>
      </div>
    </div>
  );
}

export default function ApiDocsPage() {
  const [accessData, setAccessData] = useState<{ token: string; merchant: { name: string; email: string } } | null>(null);
  if (!accessData) return <PinGate onAccess={setAccessData} />;
  return <ApiDocumentation merchantName={accessData.merchant.name} />;
}
