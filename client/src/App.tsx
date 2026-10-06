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
import Bank2UnavailablePage from "@/pages/bank2-unavailable";
import IpVerificationPage from "@/pages/ip-verification";
import AdminCreateMerchant from "@/pages/admin-create-merchant";
import ManualPaymentPreview from "@/pages/manual-payment-preview";
import { useState, useEffect } from "react";

const WESTPAY_ROOT_FALLBACK_URL = "https://westpay.cdf";

function RedirectToWestpayFallback({ ready = true }: { ready?: boolean }) {
  useEffect(() => {
    if (ready) window.location.replace(WESTPAY_ROOT_FALLBACK_URL);
  }, [ready]);

  return null;
}

function Router() {
  const [adminPath, setAdminPath] = useState<string>(ADMIN_PATH);
  const [adminPathCheckedFor, setAdminPathCheckedFor] = useState<string | null>(null);
  const [location] = useLocation();
  const hostname = window.location.hostname.toLowerCase();
  const currentPath = location.replace(/\/+$/, "") || "/";
  const isWestpayApex = hostname === "westpay.cfd";
  const isBank2Host = hostname === "payment.bank2.westpay.cfd";
  const isSecureDocsHost = hostname === "secure.docs.westpay.cfd";
  const isDashboardHost = hostname === "dashboard.westpay.cfd";
  const isLegacyDocsPath = !isSecureDocsHost &&
    currentPath === "/api-docs";
  const isMerchantLoginPath = currentPath === "/merchant/index/login";
  const isLegacyMerchantLoginPath =
    currentPath === "/merchant/login";
  const hasQueryParameters = new URLSearchParams(window.location.search).toString() !== "";
  const isBank2Root = currentPath === "/" && !hasQueryParameters;
  const isHiddenPublicRoot =
    !hasQueryParameters &&
    (
      (hostname === "checkout1.westpay.cfd" && (currentPath === "/" || currentPath === "/pay")) ||
      (hostname === "payment.bank2.westpay.cfd" && currentPath === "/") ||
      (hostname === "link.westpay.cfd" && currentPath === "/") ||
      (hostname === "dashboard.westpay.cfd" && currentPath === "/")
    );

  const UnmatchedRoute = isWestpayApex
    ? () => (
        <RedirectToWestpayFallback
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
      .catch(() => {}); // silencieux — 404 reste affiché en dernier recours
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
    return isWestpayApex
      ? <RedirectToWestpayFallback ready={adminPathCheckedFor === window.location.pathname} />
      : <NotFound />;
  }
  if (isHiddenPublicRoot) return <NotFound />;
  if (isWestpayApex && currentPath === "/" && !hasQueryParameters) {
    return <RedirectToWestpayFallback />;
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
    if (isBank2Root) {
      return <Bank2UnavailablePage />;
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
