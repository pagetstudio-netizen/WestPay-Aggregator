import { useState, useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/lib/language";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import {
  Shield, Lock, Loader2, BookOpen, Code, Server, Key,
  ArrowRight, CheckCircle, AlertTriangle, Globe, Zap, Copy, Check,
  Send, ArrowDownCircle, Bell, Menu, X, ShieldCheck, FileText, Hash,
  Eye, EyeOff
} from "lucide-react";
import Captcha, { generateCaptchaCode } from "@/components/Captcha";
import { copyTextToClipboard } from "@/lib/clipboard";
import docsPaymentIllustration from "@assets/Screenshot_20260826-170313_1787764599668.png";
import docsFlowIllustration from "@assets/Screenshot_20260826-170419_1787764599628.png";
import docsSecurityIllustration from "@assets/IMG_20260826_171328_925_1787764614017.jpg";
import docsApiIllustration from "@assets/IMG_20260826_171326_814_1787764614055.jpg";

const BASE_URL = "https://westpay.cfd";
const BANK2_URL = "https://payment.bank2.westpay.cfd";

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
  const langColor: Record<string, string> = { JavaScript: "text-yellow-400", PHP: "text-indigo-400", Python: "text-blue-400" };
  return (
    <Card className="wp-code-card overflow-hidden">
      <CardContent className="p-0">
        <div className="wp-code-toolbar flex items-center justify-between gap-2 px-3 py-1.5 border-b bg-muted/50">
          <div className="flex items-center gap-2">
            {lang && <span className={`text-xs font-bold ${langColor[lang] || "text-muted-foreground"}`}>{lang}</span>}
            {label && <span className="text-xs text-muted-foreground truncate">{label}</span>}
          </div>
          <CopyButton text={code} />
        </div>
        <div className="wp-code-body p-4 overflow-x-auto bg-muted/20">
          <pre className="wp-code-pre text-xs sm:text-sm font-mono whitespace-pre">{code}</pre>
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
            className={`wp-lang-tab px-3 py-1 rounded text-xs font-medium transition-colors ${active === t.lang ? "wp-lang-tab-active bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            data-testid={`tab-lang-${t.lang.toLowerCase()}`}>
            {t.lang}
          </button>
        ))}
      </div>
      {current && <CodeBlock code={current.code} label={current.label} lang={current.lang} />}
    </div>
  );
}

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
      toast({
        title: "Incorrect security code",
        description: "Please enter the new code shown.",
        variant: "destructive",
      });
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
      if (!res.ok) throw new Error(data.message || "The email or documentation PIN is invalid.");
      onAccess(data);
    } catch (err: any) {
      toast({ title: "Unable to access documentation", description: err.message, variant: "destructive" });
      refreshCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="wp-docs-reference-gate">
      <style>{`
        .wp-docs-reference-gate {
          min-height: 100dvh;
          box-sizing: border-box;
          padding-top: 93px;
          overflow-x: hidden;
          background: #0963e8;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
        }
        .wp-docs-reference-brand {
          width: 328px;
          height: 106px;
          margin: 0 auto;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          padding: 0 20px 0 22px;
          gap: 22px;
          background: #fff;
        }
        .wp-docs-reference-brand img {
          width: 78px;
          height: 78px;
          flex: 0 0 78px;
          display: block;
          object-fit: cover;
        }
        .wp-docs-reference-brand-name {
          color: #061126;
          font-size: 39px;
          line-height: 1;
          font-weight: 700;
          letter-spacing: -1.6px;
          white-space: nowrap;
        }
        .wp-docs-reference-card {
          width: min(553px, calc(100% - 24px));
          min-height: calc(100dvh - 199px);
          margin: 0 auto;
          box-sizing: border-box;
          padding: 54px 16px 80px 31px;
          background: #fff;
        }
        .wp-docs-reference-content {
          width: 100%;
          max-width: 506px;
        }
        .wp-docs-reference-title {
          margin: 0;
          color: #000;
          font-size: 28px;
          line-height: 1.18;
          font-weight: 700;
          text-align: center;
        }
        .wp-docs-reference-description {
          max-width: 525px;
          margin: 0 auto;
          color: #000;
          font-size: 27px;
          line-height: 1.2;
          font-weight: 700;
          text-align: center;
        }
        .wp-docs-reference-form {
          margin-top: 29px;
        }
        .wp-docs-reference-input {
          width: 100%;
          height: 80px;
          box-sizing: border-box;
          padding: 0 19px;
          border: 2px solid #b8b8b8;
          border-radius: 7px;
          outline: none;
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 25px;
          line-height: 1;
        }
        .wp-docs-reference-input::placeholder {
          color: #777;
          opacity: 1;
        }
        .wp-docs-reference-input:focus {
          border-color: #8d8d8d;
          box-shadow: 0 0 0 2px rgba(9, 99, 232, .16);
        }
        .wp-docs-reference-pin {
          position: relative;
          margin-top: 18px;
        }
        .wp-docs-reference-pin .wp-docs-reference-input {
          padding-right: 66px;
        }
        .wp-docs-reference-pin input::placeholder {
          font-weight: 700;
        }
        .wp-docs-reference-eye {
          position: absolute;
          top: 50%;
          right: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          padding: 0;
          border: 0;
          transform: translateY(-50%);
          color: #000;
          background: transparent;
          cursor: pointer;
        }
        .wp-docs-reference-eye svg {
          width: 27px;
          height: 27px;
          stroke-width: 2.3;
        }
        .wp-docs-reference-captcha {
          display: flex;
          align-items: center;
          width: 100%;
          height: 78px;
          box-sizing: border-box;
          margin-top: 33px;
          overflow: hidden;
          border: 2px solid #b8b8b8;
          border-radius: 7px;
          background: #fff;
        }
        .wp-docs-reference-captcha > div {
          display: flex;
          align-items: center;
          flex: 0 0 199px;
          width: 199px;
          height: 100%;
          padding-left: 9px;
          box-sizing: border-box;
        }
        .wp-docs-reference-captcha canvas {
          width: 176px !important;
          height: 52px !important;
          border-radius: 0 !important;
        }
        .wp-docs-reference-captcha > div > button {
          display: none;
        }
        .wp-docs-reference-captcha-input {
          min-width: 0;
          width: 100%;
          height: 100%;
          padding: 0 12px 0 0;
          box-sizing: border-box;
          border: 0;
          outline: 0;
          color: #777;
          background: transparent;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 25px;
          font-weight: 700;
        }
        .wp-docs-reference-captcha-input::placeholder {
          color: #777;
          opacity: 1;
        }
        .wp-docs-reference-captcha-input:focus {
          box-shadow: none;
        }
        .wp-docs-reference-captcha-error {
          margin: 6px 0 -19px;
          color: #dc2626;
          font-size: 13px;
          font-weight: 600;
        }
        .wp-docs-reference-submit {
          display: flex;
          align-items: center;
          justify-content: center;
          width: calc(100% - 8px);
          height: 80px;
          margin: 65px 0 0 8px;
          box-sizing: border-box;
          border: 2px solid #456b8d;
          border-radius: 7px;
          color: #fff;
          background: #6083a8;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 37px;
          line-height: 1;
          font-weight: 700;
          cursor: pointer;
          transition: background-color .12s ease, transform .1s ease;
        }
        .wp-docs-reference-submit:hover:not(:disabled) {
          background: #56799d;
        }
        .wp-docs-reference-submit:active:not(:disabled) {
          transform: scale(.99);
        }
        .wp-docs-reference-submit:disabled {
          cursor: not-allowed;
          opacity: .58;
        }
        @media (max-width: 500px) {
          .wp-docs-reference-gate {
            padding-top: 48px;
          }
          .wp-docs-reference-brand {
            width: 286px;
            height: 92px;
            padding-left: 18px;
            gap: 18px;
          }
          .wp-docs-reference-brand img {
            width: 66px;
            height: 66px;
            flex-basis: 66px;
          }
          .wp-docs-reference-brand-name {
            font-size: 33px;
          }
          .wp-docs-reference-card {
            min-height: calc(100dvh - 140px);
            padding: 42px 13px 56px 20px;
          }
          .wp-docs-reference-title {
            font-size: 24px;
          }
          .wp-docs-reference-description {
            font-size: 22px;
          }
          .wp-docs-reference-input {
            height: 68px;
            font-size: 21px;
          }
          .wp-docs-reference-captcha {
            height: 68px;
          }
          .wp-docs-reference-captcha > div {
            flex-basis: 148px;
            width: 148px;
            padding-left: 5px;
          }
          .wp-docs-reference-captcha canvas {
            width: 136px !important;
            height: 46px !important;
          }
          .wp-docs-reference-captcha-input {
            font-size: 20px;
          }
          .wp-docs-reference-submit {
            height: 68px;
            margin-top: 48px;
            font-size: 30px;
          }
        }
      `}</style>

      <div className="wp-docs-reference-brand">
        <img src="/robotpay-logo.jpg" alt="WestPay" />
        <span className="wp-docs-reference-brand-name">WestPay</span>
      </div>

      <main className="wp-docs-reference-card">
        <div className="wp-docs-reference-content">
          <h1 className="wp-docs-reference-title" data-testid="text-docs-title">Access Documentation</h1>
          <p className="wp-docs-reference-description">
            Enter your merchant credentials to access<br className="hidden sm:block" /> the API documentation.
          </p>

          <form onSubmit={handleSubmit} className="wp-docs-reference-form">
            <input
              type="email"
              className="wp-docs-reference-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              aria-label="Email"
              required
              autoComplete="username"
              data-testid="input-docs-email"
            />

            <div className="wp-docs-reference-pin">
              <input
                type={showPin ? "text" : "password"}
                className="wp-docs-reference-input"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="doc code pin"
                aria-label="Documentation PIN"
                maxLength={6}
                required
                autoComplete="current-password"
                data-testid="input-docs-pin"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="wp-docs-reference-eye"
                data-testid="button-toggle-pin-visibility"
                aria-label={showPin ? "Hide documentation PIN" : "Show documentation PIN"}
              >
                {showPin ? <EyeOff /> : <Eye />}
              </button>
            </div>

            <div className={`wp-docs-reference-captcha ${captchaError ? "border-red-500" : ""}`}>
              <Captcha code={captchaCode} onRefresh={refreshCaptcha} />
              <input
                type="text"
                className="wp-docs-reference-captcha-input"
                value={captchaInput}
                onChange={(e) => { setCaptchaInput(e.target.value.toUpperCase()); setCaptchaError(false); }}
                placeholder="Enter code"
                aria-label="Security code"
                maxLength={5}
                autoComplete="off"
                spellCheck={false}
                required
                data-testid="input-docs-captcha"
              />
            </div>
            {captchaError && <p className="wp-docs-reference-captcha-error">The security code is incorrect.</p>}

            <button
              type="submit"
              disabled={isLoading || !email || pin.length !== 6 || captchaInput.length < 5}
              className="wp-docs-reference-submit"
              data-testid="button-docs-access"
            >
              {isLoading ? <Loader2 className="w-7 h-7 animate-spin" /> : "connect to Westpay"}
            </button>
          </form>
        </div>
      </main>
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
    <div className="wp-endpoint-card border rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="wp-endpoint-trigger w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors text-left" data-testid={`endpoint-${method}-${path.replace(/\//g, "-")}`}>
        <span className={`text-white text-xs font-bold px-2 py-0.5 rounded shrink-0 ${colors[method] || "bg-gray-500"}`}>{method}</span>
        <code className="text-xs sm:text-sm font-mono text-foreground flex-1 min-w-0 break-all">{path}</code>
        {authRequired && <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
        <span className="text-muted-foreground text-xs shrink-0">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
          <div className="wp-endpoint-details border-t px-3 pb-3 space-y-3">
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

function ApiDocumentation({ merchantName }: { merchantName: string }) {
  const { t } = useLanguage();
  const [activeSection, setActiveSection] = useState("intro");
  const [navOpen, setNavOpen] = useState(false);

  const sections = [
    { id: "intro", label: t("intro"), icon: BookOpen },
    { id: "auth", label: t("authentication"), icon: Key },
    { id: "endpoints", label: t("docsEndpoints"), icon: Server },
    { id: "payment", label: t("payTitle"), icon: Globe },
    { id: "transfer", label: t("transfers"), icon: ArrowDownCircle },
    { id: "webhook", label: t("webhook"), icon: Bell },
    { id: "examples", label: t("example"), icon: Code },
    { id: "errors", label: t("error"), icon: AlertTriangle },
    { id: "security", label: t("security"), icon: ShieldCheck },
  ];

  const scrollTo = (id: string) => {
    setActiveSection(id);
    setNavOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="wp-docs-shell min-h-screen bg-background">
      <style>{`
        .wp-docs-shell {
          --wp-ink: #17213d;
          --wp-muted: #65708d;
          --wp-indigo: #3025b9;
          --wp-indigo-bright: #5b52ef;
          --wp-border: #e3e7f1;
          background: #f6f8fc !important;
          color: var(--wp-ink);
          font-family: Inter, system-ui, -apple-system, sans-serif;
        }
        .wp-docs-shell header {
          background: rgba(255,255,255,.88) !important;
          border-color: var(--wp-border) !important;
          box-shadow: 0 1px 0 rgba(23,33,61,.03);
        }
        .wp-docs-header-inner { min-height: 72px; }
        .wp-docs-brand-mark {
          width: 42px; height: 42px; border-radius: 13px;
          background: linear-gradient(145deg,#5b52ef,#3025b9);
          box-shadow: 0 8px 18px rgba(48,37,185,.22);
        }
        .wp-docs-shell .wp-docs-brand-title { color: var(--wp-ink); letter-spacing: -.02em; }
        .wp-docs-shell .wp-docs-brand-subtitle { color: #8a93aa; }
        .wp-docs-shell .wp-docs-merchant {
          border: 1px solid #e3e7f1;
          background: #f8f9fd;
          color: #4c5876;
          border-radius: 999px;
        }
        .wp-docs-shell .wp-docs-lang {
          border: 1px solid #e3e7f1;
          border-radius: 10px;
          background: #fff;
          color: #46516d;
          padding: 0 10px;
          min-height: 38px;
        }
        .wp-docs-shell .wp-docs-menu {
          border-color: #e3e7f1 !important;
          background: #fff !important;
        }
        .wp-docs-hero {
          position: relative;
          overflow: hidden;
          color: #fff;
          background:
            radial-gradient(circle at 83% 15%, rgba(126,116,255,.42), transparent 28%),
            radial-gradient(circle at 12% 110%, rgba(35,218,179,.16), transparent 35%),
            linear-gradient(135deg,#211873 0%,#3025b9 55%,#4b42dd 100%);
          box-shadow: 0 18px 40px rgba(48,37,185,.15);
        }
        .wp-docs-hero::before, .wp-docs-hero::after {
          content: ""; position: absolute; border: 1px solid rgba(255,255,255,.12);
          border-radius: 50%; pointer-events: none;
        }
        .wp-docs-hero::before { width: 460px; height: 460px; right: -150px; top: -230px; }
        .wp-docs-hero::after { width: 270px; height: 270px; left: 42%; bottom: -210px; }
        .wp-docs-hero-inner {
          position: relative; z-index: 1; max-width: 1152px; margin: 0 auto;
          padding: 58px 24px 64px; display: grid; grid-template-columns: minmax(0,1.15fr) minmax(280px,.85fr);
          gap: 52px; align-items: center;
        }
        .wp-docs-hero-eyebrow {
          display: inline-flex; align-items: center; gap: 9px; margin-bottom: 18px;
          color: #d8d5ff; font-size: 12px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase;
        }
        .wp-docs-hero-eyebrow span { width: 8px; height: 8px; border-radius: 50%; background: #6ce2bd; box-shadow: 0 0 0 5px rgba(108,226,189,.15); }
        .wp-docs-hero h2 { margin: 0; max-width: 680px; color: #fff; font-size: clamp(2.5rem,5.4vw,4.8rem); line-height: .98; letter-spacing: -.065em; font-weight: 850; }
        .wp-docs-hero h2 em { color: #a9f5d9; font-style: normal; }
        .wp-docs-hero-copy { max-width: 620px; margin: 22px 0 0; color: rgba(255,255,255,.78); font-size: clamp(1rem,1.8vw,1.2rem); line-height: 1.7; }
        .wp-docs-hero-tags { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 26px; }
        .wp-docs-hero-tags span { border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.1); border-radius: 999px; padding: 8px 12px; color: #f2f1ff; font-size: 12px; font-weight: 700; }
        .wp-docs-hero-panel {
          border: 1px solid rgba(255,255,255,.18); border-radius: 22px; padding: 16px;
          background: rgba(18,12,76,.3); box-shadow: 0 22px 44px rgba(13,8,62,.2); backdrop-filter: blur(12px);
        }
        .wp-docs-hero-panel-top { display: flex; align-items: center; gap: 7px; padding-bottom: 14px; border-bottom: 1px solid rgba(255,255,255,.12); }
        .wp-docs-hero-panel-top i { width: 8px; height: 8px; border-radius: 50%; background: #ff7b89; }
        .wp-docs-hero-panel-top i:nth-child(2) { background: #ffd16c; }
        .wp-docs-hero-panel-top i:nth-child(3) { background: #6ce2bd; }
        .wp-docs-hero-panel-url { margin-left: auto; color: rgba(255,255,255,.5); font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
        .wp-docs-hero-code { padding: 20px 4px 7px; font: 500 12px/2 ui-monospace, SFMono-Regular, Menlo, monospace; color: rgba(255,255,255,.78); }
        .wp-docs-hero-code strong { color: #a9f5d9; font-weight: 700; }
        .wp-docs-hero-art { position: relative; min-height: 264px; }
        .wp-docs-hero-art::before { content: ""; position: absolute; inset: 8% 10% 6%; border-radius: 50%; background: rgba(155,146,255,.2); filter: blur(3px); }
        .wp-docs-hero-art-main { position: absolute; z-index: 1; width: 76%; height: 218px; right: 4%; bottom: 0; object-fit: contain; object-position: center; border-radius: 18px; filter: drop-shadow(0 22px 18px rgba(14,8,73,.25)); }
        .wp-docs-hero-art-float { position: absolute; z-index: 2; width: 34%; height: 108px; left: 0; top: 24px; object-fit: cover; object-position: center; border: 5px solid rgba(255,255,255,.9); border-radius: 16px; box-shadow: 0 16px 25px rgba(14,8,73,.2); }
        .wp-docs-hero-art-badge { position: absolute; z-index: 3; right: 4%; top: 10px; display: inline-flex; align-items: center; gap: 7px; padding: 8px 11px; border: 1px solid rgba(255,255,255,.22); border-radius: 999px; background: rgba(18,12,76,.48); color: #e8e7ff; font-size: 11px; font-weight: 700; backdrop-filter: blur(8px); }
        .wp-docs-hero-art-badge::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #6ce2bd; box-shadow: 0 0 0 4px rgba(108,226,189,.14); }
        .wp-docs-visual-strip { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0,1fr); gap: 24px; margin-bottom: 8px; }
        .wp-docs-visual-card { position: relative; width: min(100%, 760px); min-height: 250px; margin: 0 auto; overflow: hidden; border: 1px solid var(--wp-border); border-radius: 16px; background: #fff; box-shadow: 0 8px 24px rgba(30,43,80,.05); }
        .wp-docs-visual-card:first-child { grid-row: auto; min-height: 290px; }
        .wp-docs-visual-card img { width: 100%; height: 100%; min-height: 250px; padding: 12px; object-fit: contain; object-position: center; display: block; background: #f8f9fd; transition: transform .35s ease; }
        .wp-docs-visual-card:first-child img { min-height: 290px; }
        .wp-docs-visual-card:hover img { transform: scale(1.035); }
        .wp-docs-visual-caption { position: absolute; left: 10px; right: 10px; bottom: 10px; padding: 8px 10px; border: 1px solid rgba(255,255,255,.55); border-radius: 10px; background: rgba(255,255,255,.86); color: var(--wp-ink); font-size: 11px; font-weight: 800; box-shadow: 0 5px 14px rgba(30,43,80,.08); backdrop-filter: blur(6px); }
        .wp-docs-layout { max-width: 1152px; margin: 0 auto; display: grid; grid-template-columns: 218px minmax(0,1fr); gap: 42px; padding: 38px 24px 70px; }
        .wp-docs-sidebar { min-width: 0; }
        .wp-docs-sidebar nav { padding: 10px; border: 1px solid var(--wp-border); border-radius: 16px; background: rgba(255,255,255,.7); box-shadow: 0 10px 28px rgba(30,43,80,.05); }
        .wp-docs-sidebar nav::before { content: "CONTENU"; display: block; padding: 8px 10px 12px; color: #9aa3b8; font-size: 10px; font-weight: 800; letter-spacing: .14em; }
        .wp-docs-sidebar button { border-radius: 10px !important; color: #727d98 !important; padding: 10px !important; font-size: 12px !important; }
        .wp-docs-sidebar button:hover { color: var(--wp-indigo) !important; background: #f1f2ff !important; }
        .wp-docs-sidebar button.bg-primary\\/10, .wp-docs-sidebar button[class*="bg-primary"] { color: var(--wp-indigo) !important; background: #eeedff !important; }
        .wp-docs-main { min-width: 0; }
        .wp-docs-main > section { scroll-margin-top: 96px; }
        .wp-docs-main > section > h2 { margin-bottom: 18px; color: var(--wp-ink); font-size: clamp(1.35rem,2.3vw,1.8rem); letter-spacing: -.035em; }
        .wp-docs-main > section > h2 svg { width: 20px; height: 20px; color: var(--wp-indigo) !important; }
        .wp-docs-main > section > p { color: var(--wp-muted) !important; line-height: 1.8; }
        /* Keep the documentation text close to the reference: dark, larger and easy to scan.
           The security section is intentionally excluded from these typography overrides. */
        .wp-docs-main > section:not(#security) > h2 {
          color: #1d2c63 !important;
          font-size: clamp(1.55rem, 2.7vw, 2rem) !important;
          font-weight: 800;
          line-height: 1.2;
          letter-spacing: -.03em;
        }
        .wp-docs-main > section:not(#security) > p {
          color: #3f4962 !important;
          font-size: 1.05rem !important;
          line-height: 1.75;
        }
        .wp-docs-main > section:not(#security) .text-sm:not(.font-mono) {
          color: #252d42 !important;
          font-size: 1rem !important;
          line-height: 1.65;
        }
        .wp-docs-main > section:not(#security) .text-sm.text-muted-foreground {
          color: #3f4962 !important;
        }
        .wp-docs-main > section:not(#security) ol,
        .wp-docs-main > section:not(#security) ul {
          color: #252d42;
        }
        .wp-docs-main > section:not(#security) li {
          line-height: 1.65;
        }
        .wp-docs-main .card { border: 1px solid var(--wp-border); border-radius: 16px; background: rgba(255,255,255,.9); box-shadow: 0 8px 24px rgba(30,43,80,.045); }
        .wp-docs-main .card:hover { border-color: #d5d8f2; }
        .wp-docs-main .text-foreground { color: var(--wp-ink) !important; }
        .wp-docs-main .text-muted-foreground { color: var(--wp-muted) !important; }
        .wp-docs-main .text-primary { color: var(--wp-indigo) !important; }
        .wp-docs-main .bg-primary { background: var(--wp-indigo) !important; }
        .wp-docs-main .border-b { border-color: #edf0f6 !important; }
        .wp-endpoint-card { border-color: var(--wp-border) !important; background: #fff; box-shadow: 0 5px 16px rgba(30,43,80,.035); transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease; }
        .wp-endpoint-card:hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(30,43,80,.075); border-color: #cbd0f0 !important; }
        .wp-endpoint-trigger { background: #fff; }
        .wp-endpoint-trigger:hover { background: #f8f8ff !important; }
        .wp-endpoint-details { background: #fbfcff; border-color: #edf0f6 !important; }
        .wp-code-card { border-color: #202653 !important; background: #151a3b !important; box-shadow: 0 12px 25px rgba(16,22,60,.14) !important; }
        .wp-code-toolbar { border-color: rgba(255,255,255,.1) !important; background: #1d244b !important; }
        .wp-code-toolbar .text-muted-foreground { color: #aab3d5 !important; }
        .wp-code-body { background: #151a3b !important; }
        .wp-docs-main .wp-code-pre { color: #e4e8ff !important; opacity: 1 !important; line-height: 1.75; }
        .wp-lang-tab { border: 1px solid transparent; }
        .wp-lang-tab-active { background: var(--wp-indigo) !important; box-shadow: 0 4px 12px rgba(48,37,185,.22); }
        .wp-docs-main table thead { background: #f4f5ff; }
        .wp-docs-main table th { color: var(--wp-ink) !important; }
        .wp-docs-main code:not(pre code) { color: var(--wp-indigo); background: #f0efff !important; border-radius: 5px; }
        .wp-docs-main .bg-muted\\/30 { background: #f8f9ff !important; }
        .wp-docs-main .bg-muted\\/20 { background: #151a3b !important; }
        .wp-docs-main > .border-t { border-color: var(--wp-border) !important; }
        @media (max-width: 800px) {
          .wp-docs-hero-inner { grid-template-columns: 1fr; gap: 28px; padding: 42px 18px 48px; }
          .wp-docs-hero-panel { max-width: 560px; }
          .wp-docs-layout { display: block; padding: 24px 14px 52px; }
          .wp-docs-visual-strip { margin-bottom: 30px; }
          .wp-docs-sidebar { margin-bottom: 28px; }
          .wp-docs-sidebar nav { display: flex; gap: 6px; overflow-x: auto; padding: 8px; }
          .wp-docs-sidebar nav::before { display: none; }
          .wp-docs-sidebar button { flex: 0 0 auto; white-space: nowrap; }
          .wp-docs-main { width: 100%; }
        }
        @media (max-width: 520px) {
          .wp-docs-hero h2 { font-size: 2.65rem; }
          .wp-docs-hero-copy { font-size: .96rem; }
          .wp-docs-hero-tags span { font-size: 11px; padding: 7px 10px; }
          .wp-docs-hero-art { min-height: 226px; }
          .wp-docs-hero-art-main { width: 82%; height: 190px; right: 0; }
          .wp-docs-hero-art-float { width: 38%; height: 92px; left: -2px; top: 25px; }
           .wp-docs-visual-strip { grid-template-columns: minmax(0,1fr); gap: 16px; }
           .wp-docs-visual-card, .wp-docs-visual-card:first-child { grid-column: auto; min-height: 220px; }
           .wp-docs-visual-card:first-child img, .wp-docs-visual-card img { min-height: 220px; padding: 8px; }
          .wp-docs-main > section > h2 { font-size: 1.35rem; }
          .wp-endpoint-trigger { gap: 8px; padding: 11px !important; }
        }
      `}</style>
      <header className="border-b sticky top-0 z-50 bg-background/95 backdrop-blur">
        <div className="wp-docs-header-inner max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="wp-docs-brand-mark w-8 h-8 rounded-md bg-primary flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="wp-docs-brand-title text-xs sm:text-sm font-bold text-foreground">WestPay {t("apiDocumentation")}</h1>
              <p className="wp-docs-brand-subtitle text-xs text-muted-foreground">v2.0 — {t("docsRestricted")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher className="wp-docs-lang" />
            <Badge variant="secondary" className="wp-docs-merchant hidden sm:inline-flex" data-testid="text-docs-merchant">{merchantName}</Badge>
            <button
              className="wp-docs-menu sm:hidden flex items-center justify-center w-9 h-9 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm transition-all duration-200 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95"
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
            {sections.map(s => (
              <button key={s.id} onClick={() => scrollTo(s.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2.5 transition-colors ${activeSection === s.id ? "bg-primary/10 text-primary font-semibold" : "text-foreground hover:bg-muted"}`}>
                <s.icon className="w-4 h-4 shrink-0" />{s.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <section className="wp-docs-hero">
        <div className="wp-docs-hero-inner">
          <div>
            <div className="wp-docs-hero-eyebrow"><span />WestPay · {t("apiDocumentation")}</div>
            <h2>WestPay <em>API</em></h2>
            <p className="wp-docs-hero-copy">{t("docsSubtitle")}. {t("docsIntegrationDesc")}</p>
            <div className="wp-docs-hero-tags">
              <span>REST API</span><span>JSON</span><span>Webhooks</span><span>{t("docsFeature4a")}</span>
            </div>
          </div>
          <div className="wp-docs-hero-art" aria-hidden="true">
            <img className="wp-docs-hero-art-main" src={docsApiIllustration} alt="" />
            <img className="wp-docs-hero-art-float" src={docsFlowIllustration} alt="" />
            <div className="wp-docs-hero-art-badge">{t("docsSecuredAccess")}</div>
          </div>
        </div>
      </section>

      <div className="wp-docs-layout">
        <div className="wp-docs-visual-strip" aria-label={t("apiDocumentation")}>
          <figure className="wp-docs-visual-card">
            <img src={docsPaymentIllustration} alt={t("docsPaymentDeposit")} />
            <figcaption className="wp-docs-visual-caption">{t("docsPaymentDeposit")}</figcaption>
          </figure>
          <figure className="wp-docs-visual-card">
            <img src={docsSecurityIllustration} alt={t("security")} />
            <figcaption className="wp-docs-visual-caption">{t("security")}</figcaption>
          </figure>
          <figure className="wp-docs-visual-card">
            <img src={docsFlowIllustration} alt={t("docsIntegrationTitle")} />
            <figcaption className="wp-docs-visual-caption">{t("docsIntegrationTitle")}</figcaption>
          </figure>
        </div>
        <aside className="wp-docs-sidebar hidden sm:block">
          <nav className="sticky top-20 space-y-0.5">
            {sections.map(s => (
              <button key={s.id} onClick={() => scrollTo(s.id)}
                className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${activeSection === s.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted"}`}
                data-testid={`nav-${s.id}`}>
                <s.icon className="w-3.5 h-3.5 shrink-0" />{s.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="wp-docs-main flex-1 min-w-0 space-y-10">

          {/* ── INTRODUCTION ── */}
          <section id="intro" className="space-y-4 scroll-mt-20">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary shrink-0" />{t("intro")}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              {t("docsIntro")}
            </p>
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
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{t("docsParameters")}</p>
                <p className="text-sm text-foreground">GET · POST · PUT · PATCH · DELETE</p>
              </CardContent></Card>
              <Card><CardContent className="p-3 space-y-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Auth</p>
                <p className="text-sm text-foreground">JWT Bearer Token + {t("apiKey")}</p>
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
              <Key className="w-5 h-5 text-primary shrink-0" />{t("authentication")}
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
              <Server className="w-5 h-5 text-primary shrink-0" />{t("docsEndpoints")} — Consultation
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
              <Globe className="w-5 h-5 text-primary shrink-0" />{t("payTitle")} (Depot)
            </h2>
            <p className="text-sm text-muted-foreground">
              WestPay fourni une page de paiement hebergee et securisee. Redirigez simplement vos utilisateurs vers cette URL — ils entrent leur numero Mobile Money et valident le paiement directement sur leur telephone via USSD.
            </p>

            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-primary" />Choisissez votre page de paiement hebergee RobotPay</p>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal pl-4">
                  <li>Redirigez votre utilisateur vers l'une des deux pages de paiement :</li>
                </ol>
                <div className="space-y-3 mt-3">
                  <CodeBlock code={`${BASE_URL}/pay?merchant=votre-slug&amount=5000&country=Togo&redirect=${encodeURIComponent("https://votresite.com/merci")}`} label="Page standard" />
                  <CodeBlock code={`${BANK2_URL}/?merchant=votre-slug&amount=5000&country=Togo&redirect=${encodeURIComponent("https://votresite.com/merci")}`} label="Page Bank2 — interface bleue simplifiee" />
                </div>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal pl-4 mt-3" start={2}>
                  <li>Le montant et le pays sont transmis par votre site et ne sont pas modifiables sur la page Bank2</li>
                  <li>Le client choisit son operateur, entre son numero et valide le paiement sur son telephone</li>
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
                      <th className="text-left p-2 text-foreground font-semibold">{t("docsRequired")}</th>
                      <th className="text-left p-2 text-foreground font-semibold">Description</th>
                    </tr></thead>
                    <tbody className="text-muted-foreground text-xs sm:text-sm">
                      <tr className="border-b"><td className="p-2 font-mono">merchant</td><td className="p-2 text-green-500">{t("yes")}</td><td className="p-2">Votre slug marchand (ex: ecomat)</td></tr>
                      <tr className="border-b"><td className="p-2 font-mono">amount</td><td className="p-2 text-green-500">{t("yes")}</td><td className="p-2">Montant en F CFA (entier positif)</td></tr>
                      <tr className="border-b"><td className="p-2 font-mono">country</td><td className="p-2 text-amber-500">Bank2</td><td className="p-2">Pays actif du marchand (ex: Togo). Obligatoire et verrouille sur Bank2 ; optionnel sur la page standard</td></tr>
                      <tr><td className="p-2 font-mono">redirect</td><td className="p-2 text-muted-foreground">{t("no")}</td><td className="p-2">URL de retour apres paiement (encoder avec encodeURIComponent)</td></tr>
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
                      <th className="text-left p-2 text-foreground font-semibold">Devise</th>
                      <th className="text-left p-2 text-foreground font-semibold">Operateurs</th>
                    </tr></thead>
                    <tbody className="text-muted-foreground">
                      {[
                        ["Togo", "+228", "XOF", "Moov Money, TMoney"],
                        ["Benin", "+229", "XOF", "MTN Mobile Money"],
                        ["Burkina Faso", "+226", "XOF", "Moov Money, Orange Money"],
                        ["Cote d'Ivoire", "+225", "XOF", "Moov Money, MTN, Orange Money, Wave"],
                        ["Senegal", "+221", "XOF", "Mixx by Yas, Orange Money, Wave"],
                        ["Mali", "+223", "XOF", "Orange Money"],
                        ["Cameroun", "+237", "XAF", "MTN Mobile Money, Orange Money"],
                        ["Congo Brazzaville", "+242", "XAF", "MTN Mobile Money"],
                        ["Congo RDC", "+243", "CDF", "Orange Money, M-Pesa"],
                        ["Gabon", "+241", "XAF", "Airtel Money, Moov Money"],
                        ["Guinée", "+224", "GNF", "MTN Mobile Money, Orange Money"],
                        ["Niger", "+227", "XOF", "Airtel Money, Moov Money, Zamani, Amana, Mynita"],
                        ["Kenya", "+254", "KES", "Airtel Money, Safaricom M-Pesa, M-Pesa"],
                        ["Ghana", "+233", "GHS", "MTN Mobile Money, AirtelTigo Money, Vodafone Cash"],
                        ["Nigeria", "+234", "NGN", "MTN MoMo Nigeria, Airtel Money, OPay, PalmPay"],
                        ["Pakistan", "+92", "PKR", "EasyPaisa, JazzCash, NayaPay, SadaPay"],
                        ["Philippines", "+63", "PHP", "GCash, Maya (PayMaya)"],
                        ["India", "+91", "INR", "UPI / IMPS, NEFT / RTGS, PhonePe, Google Pay"],
                      ].map(([pays, code, devise, ops]) => (
                        <tr key={pays} className="border-b last:border-0">
                          <td className="p-2">{pays}</td><td className="p-2 font-mono">{code}</td><td className="p-2 font-mono font-semibold">{devise}</td><td className="p-2">{ops}</td>
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
              <ArrowDownCircle className="w-5 h-5 text-primary shrink-0" />{t("transfers")} (Transferts)
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
              <Bell className="w-5 h-5 text-primary shrink-0" />{t("webhook")} & Notifications
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
              <Code className="w-5 h-5 text-primary shrink-0" />{t("example")}
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
              <AlertTriangle className="w-5 h-5 text-primary shrink-0" />{t("error")}
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
              <ShieldCheck className="w-5 h-5 text-primary shrink-0" />{t("security")}
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
  const { lang, setLang, setDefaultLang } = useLanguage();
  const [accessData, setAccessData] = useState<{ token: string; merchant: { name: string; email: string } } | null>(null);

  useEffect(() => {
    // Default to English for API docs if not explicitly set
    setDefaultLang("en");
  }, [setDefaultLang]);

  if (!accessData) return <PinGate onAccess={setAccessData} />;
  return <ApiDocumentation merchantName={accessData.merchant.name} />;
}
