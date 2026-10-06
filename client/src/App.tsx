import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { LanguageProvider } from "@/lib/language";
import RestrictedPage from "@/pages/restricted";
import AdminLogin from "@/pages/admin-login";
import { ADMIN_PATH, updateAdminBase } from "@/lib/admin-config";
import AdminDashboard from "@/pages/admin-dashboard";
import MerchantLogin from "@/pages/merchant-login";
import MerchantDashboard from "@/pages/merchant-dashboard";
import ApiDocsPage from "@/pages/api-docs";
import PaymentPage from "@/pages/payment";
import Bank2PaymentPage from "@/pages/bank2-payment";
import PaymentLinkPage from "@/pages/payment-link-page";
import CryptoPaymentPage from "@/pages/crypto-payment";
import CryptoDocsPage from "@/pages/crypto-docs";
import CryptoLinkPage from "@/pages/crypto-link-page";
import NotFound from "@/pages/not-found";
import IpVerificationPage from "@/pages/ip-verification";
import AdminCreateMerchant from "@/pages/admin-create-merchant";
import ManualPaymentPreview from "@/pages/manual-payment-preview";
import { useState, useEffect } from "react";

const WESTPAY_FALLBACK_HOSTS: Record<string, string> = {
  "westpay.cfd": "westpay.cdf",
  "dashboard.westpay.cfd": "dashboard.westpay.cdf",
  "link.westpay.cfd": "link.westpay.cdf",
  "payment.bank2.westpay.cfd": "payment.bank2.westpay.cdf",
  "checkout1.westpay.cfd": "checkout1.westpay.cdf",
};

const BANK2_PAYMENT_QUERY_KEYS = [
  "merchant", "link", "linkId", "amount", "country", "redirect", "ref",
  "payment_status", "phone", "payerPhone", "name", "payerName",
];

const CHECKOUT_PAYMENT_QUERY_KEYS = [
  "merchant", "amount", "country", "redirect", "payment_status",
  "clapay_return", "ref", "phone", "payerPhone", "name", "payerName",
];

function getFallbackHostname(hostname: string): string | null {
  return WESTPAY_FALLBACK_HOSTS[hostname] ?? (import.meta.env.DEV ? "westpay.cdf" : null);
}

function RedirectToFallbackHost({
  targetHostname,
  ready = true,
}: {
  targetHostname: string;
  ready?: boolean;
}) {
  useEffect(() => {
    if (!ready) return;
    const targetUrl = new URL(window.location.href);
    targetUrl.protocol = "https:";
    targetUrl.hostname = targetHostname;
    targetUrl.port = "";
    window.location.replace(targetUrl.toString());
  }, [ready, targetHostname]);

  return null;
}

function Router() {
  const [adminPath, setAdminPath] = useState<string>(ADMIN_PATH);
  const [adminPathCheckedFor, setAdminPathCheckedFor] = useState<string | null>(null);
  const [location] = useLocation();
  const hostname = window.location.hostname.toLowerCase();
  const currentPath = location.replace(/\/+$/, "") || "/";
  const fallbackHostname = getFallbackHostname(hostname);
  const isBank2Host = hostname === "payment.bank2.westpay.cfd";
  const isSecureDocsHost = hostname === "secure.docs.westpay.cfd";
  const isDashboardHost = hostname === "dashboard.westpay.cfd";
  const isLegacyDocsPath = !isSecureDocsHost &&
    currentPath === "/api-docs";
  const isMerchantLoginPath = currentPath === "/merchant/index/login";
  const isLegacyMerchantLoginPath =
    currentPath === "/merchant/login";
  const searchParams = new URLSearchParams(window.location.search);
  const hasQueryParameters = searchParams.toString() !== "";
  const hasRecognizedBank2Parameters = BANK2_PAYMENT_QUERY_KEYS.some((key) => Boolean(searchParams.get(key)));
  const hasRecognizedCheckoutParameters = CHECKOUT_PAYMENT_QUERY_KEYS.some((key) => Boolean(searchParams.get(key)));
  const isCheckout1Host = hostname === "checkout1.westpay.cfd";
  const isBareCheckoutPaymentPath =
    isCheckout1Host &&
    (currentPath === "/pay" || /^\/pay\/[^/]+$/.test(currentPath)) &&
    !hasRecognizedCheckoutParameters;
  const shouldRedirectFallbackRoot =
    fallbackHostname !== null &&
    currentPath === "/" &&
    (
      hostname === "westpay.cfd"
        ? !hasQueryParameters
        : hostname === "payment.bank2.westpay.cfd"
          ? !hasRecognizedBank2Parameters
          : hostname in WESTPAY_FALLBACK_HOSTS || !hasQueryParameters
    );

  const UnmatchedRoute = fallbackHostname
    ? () => (
        <RedirectToFallbackHost
          targetHostname={fallbackHostname}
          ready={adminPathCheckedFor === window.location.pathname}
        />
      )
    : NotFound;

  useEffect(() => {
    // Injection HTML par Node.js a fonctionné → rien à faire.
    const pathname = window.location.pathname;
    if (adminPath !== "/__admin_not_configured__") {
      setAdminPathCheckedFor(pathname);
      return;
    }

    // Fallback sécurisé : vérification serveur sans révéler le slug.
    // L'endpoint répond uniquement { isAdminPath: true|false }.
    // Il est sous /api/auth/ donc couvert par le rate-limiter existant (30 req/5 min/IP).
    const segments = pathname.split("/").filter(Boolean);
    // Le chemin admin est toujours un slug de premier niveau (1-2 segments max)
    if (segments.length === 0 || segments.length > 2) {
      setAdminPathCheckedFor(pathname);
      return;
    }

    const basePath = "/" + segments[0];
    let isActive = true;

    fetch("/api/auth/admin/verify-path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: basePath }),
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data: { isAdminPath: boolean }) => {
        if (isActive && data.isAdminPath) {
          updateAdminBase(basePath);   // met à jour adminConfig.base pour la navigation interne
          setAdminPath(basePath);      // force le re-render du Switch avec le bon chemin
        }
      })
      .catch(() => {}) // silencieux; le chemin revient au fallback une fois la vérification terminée
      .finally(() => {
        if (isActive) setAdminPathCheckedFor(pathname);
      });

    return () => {
      isActive = false;
    };
  }, [adminPath, location]);

  // Fallback côté client pour les environnements qui ne passent pas par le
  // middleware Express : l'ancienne URL reste une page introuvable.
  if (isLegacyDocsPath || isLegacyMerchantLoginPath) {
    return fallbackHostname
      ? <RedirectToFallbackHost targetHostname={fallbackHostname} ready={adminPathCheckedFor === window.location.pathname} />
      : <NotFound />;
  }
  if (shouldRedirectFallbackRoot && fallbackHostname) {
    return <RedirectToFallbackHost targetHostname={fallbackHostname} />;
  }
  if (isBareCheckoutPaymentPath && fallbackHostname) {
    return <RedirectToFallbackHost targetHostname={fallbackHostname} />;
  }
  if (import.meta.env.DEV && currentPath === "/__preview/manual-payment") {
    return <ManualPaymentPreview />;
  }

  // Nouvelle URL officielle de connexion marchand. Le domaine reste
  // utilisable ensuite pour afficher /merchant/:slug après authentification.
  if (isDashboardHost && isMerchantLoginPath) {
    return <MerchantLogin />;
  }

  if (isBank2Host) {
    if (currentPath !== "/" || !hasRecognizedBank2Parameters) {
      return fallbackHostname
        ? <RedirectToFallbackHost targetHostname={fallbackHostname} />
        : <NotFound />;
    }
    return <Bank2PaymentPage />;
  }

  if (isSecureDocsHost && (window.location.pathname === "/" || window.location.pathname === "")) {
    return <ApiDocsPage />;
  }

  return (
    <Switch>
      <Route path="/" component={RestrictedPage} />
      <Route path="/ip-verify" component={IpVerificationPage} />
      <Route path={adminPath} component={AdminLogin} />
      <Route path={`${adminPath}/dashboard`} component={AdminDashboard} />
      <Route path={`${adminPath}/create-merchant`} component={AdminCreateMerchant} />
      <Route path="/merchant-login" component={MerchantLogin} />
      <Route path="/merchant/:slug" component={MerchantDashboard} />
      <Route path="/crypto-docs" component={CryptoDocsPage} />
      <Route path="/pay" component={PaymentPage} />
      <Route path="/bank2" component={Bank2PaymentPage} />
      <Route path="/pay/crypto/:trackId" component={CryptoPaymentPage} />
      <Route path="/pay/:slug" component={PaymentPage} />
      <Route path="/link/:uniqueId" component={PaymentLinkPage} />
      <Route path="/c/:uniqueId" component={CryptoLinkPage} />
      <Route component={UnmatchedRoute} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
