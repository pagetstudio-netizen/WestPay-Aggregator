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
import AdminDashboard from "@/pages/admin-dashboard";
import MerchantLogin from "@/pages/merchant-login";
import MerchantDashboard from "@/pages/merchant-dashboard";
import ApiDocsPage from "@/pages/api-docs";
import PaymentPage from "@/pages/payment";
import PaymentLinkPage from "@/pages/payment-link-page";
import CryptoPaymentPage from "@/pages/crypto-payment";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={RestrictedPage} />
      <Route path="/admin-access-9584" component={AdminLogin} />
      <Route path="/admin-access-9584/dashboard" component={AdminDashboard} />
      <Route path="/merchant-login" component={MerchantLogin} />
      <Route path="/merchant/:slug" component={MerchantDashboard} />
      <Route path="/api-docs" component={ApiDocsPage} />
      <Route path="/pay" component={PaymentPage} />
      <Route path="/pay/crypto/:trackId" component={CryptoPaymentPage} />
      <Route path="/pay/:slug" component={PaymentPage} />
      <Route path="/link/:uniqueId" component={PaymentLinkPage} />
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
