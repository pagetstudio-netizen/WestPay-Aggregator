import { Switch, Route } from "wouter";
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
import { useState, useEffect } from "react";

function Router() {
  const [adminPath, setAdminPath] = useState<string>(ADMIN_PATH);
  const hostname = window.location.hostname.toLowerCase();
  const isBank2Host = hostname === "payment.bank2.westpay.cfd";
  const isSecureDocsHost = hostname === "secure.docs.westpay.cfd";
  const isBank2Root = window.location.pathname === "/" && window.location.search === "";

  useEffect(() => {
    // Injection HTML par Node.js a fonctionné → rien à faire.
    if (adminPath !== "/__admin_not_configured__") return;

    // Fallback sécurisé : vérification serveur sans révéler le slug.
    // L'endpoint répond uniquement { isAdminPath: true|false }.
    // Il est sous /api/auth/ donc couvert par le rate-limiter existant (30 req/5 min/IP).
    const segments = window.location.pathname.split("/").filter(Boolean);
    // Le chemin admin est toujours un slug de premier niveau (1-2 segments max)
    if (segments.length === 0 || segments.length > 2) return;

    const basePath = "/" + segments[0];

    fetch("/api/auth/admin/verify-path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: basePath }),
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data: { isAdminPath: boolean }) => {
        if (data.isAdminPath) {
          updateAdminBase(basePath);   // met à jour adminConfig.base pour la navigation interne
          setAdminPath(basePath);      // force le re-render du Switch avec le bon chemin
        }
      })
      .catch(() => {}); // silencieux — 404 reste affiché en dernier recours
  }, [adminPath]);

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
      <Route path="/api-docs" component={ApiDocsPage} />
      <Route path="/crypto-docs" component={CryptoDocsPage} />
      <Route path="/pay" component={PaymentPage} />
      <Route path="/bank2" component={Bank2PaymentPage} />
      <Route path="/pay/crypto/:trackId" component={CryptoPaymentPage} />
      <Route path="/pay/:slug" component={PaymentPage} />
      <Route path="/link/:uniqueId" component={PaymentLinkPage} />
      <Route path="/c/:uniqueId" component={CryptoLinkPage} />
      <Route component={NotFound} />
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
