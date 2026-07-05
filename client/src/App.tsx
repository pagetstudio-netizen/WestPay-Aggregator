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
import CryptoDocsPage from "@/pages/crypto-docs";
import CryptoLinkPage from "@/pages/crypto-link-page";
import NotFound from "@/pages/not-found";
import IpVerificationPage from "@/pages/ip-verification";
import AdminCreateMerchant from "@/pages/admin-create-merchant";

function Router() {
  return (
    <Switch>
      <Route path="/" component={RestrictedPage} />
      <Route path="/ip-verify" component={IpVerificationPage} />
      <Route path="/admin-access-958425546648484886646634808526522886433" component={AdminLogin} />
      <Route path="/admin-access-958425546648484886646634808526522886433/dashboard" component={AdminDashboard} />
      <Route path="/admin-access-958425546648484886646634808526522886433/create-merchant" component={AdminCreateMerchant} />
      <Route path="/merchant-login" component={MerchantLogin} />
      <Route path="/merchant/:slug" component={MerchantDashboard} />
      <Route path="/api-docs" component={ApiDocsPage} />
      <Route path="/crypto-docs" component={CryptoDocsPage} />
      <Route path="/pay" component={PaymentPage} />
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
