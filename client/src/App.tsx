import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import RestrictedPage from "@/pages/restricted";
import AdminLogin from "@/pages/admin-login";
import AdminDashboard from "@/pages/admin-dashboard";
import MerchantLogin from "@/pages/merchant-login";
import MerchantDashboard from "@/pages/merchant-dashboard";
import ApiDocsPage from "@/pages/api-docs";
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
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
