import { DashboardPage } from "./pages/dashboard";
import { TradePage } from "./pages/trade";
import { AccountsPage } from "./pages/accounts";
import { PositionsPage } from "./pages/positions";
import { OrdersPage } from "./pages/orders";
import { PnlPage } from "./pages/pnl";
import { TpslPage } from "./pages/tpsl";
import { WebhooksPage } from "./pages/webhooks";
import { LogsPage } from "./pages/logs";
import { SettingsPage } from "./pages/settings";

import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import { LoginPage } from "@/pages/login";
import { SelectAccountsPage } from "./pages/select-accounts";

// import { RepunchMonitor } from "@/components/repunch-monitor";
import { AccountDetailPage } from "./pages/account-detail";
import { NotificationsPage } from "./pages/notifications";
import History from "./pages/history";
import CalculatorPage from "./pages/calculator";
// import { AutoLimitPage } from "./pages/auto-limit-page";
// import { AutoTradePuncherPage } from "./pages/Autotradepuncher";

const queryClient = new QueryClient();

setAuthTokenGetter(() => {
  return localStorage.getItem("ct_token");
});

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("ct_token");
    if (!token && location !== "/login") {
      setLocation("/login");
    } else if (token && location === "/login") {
      setLocation("/dashboard");
    }
    setIsReady(true);
  }, [location, setLocation]);

  if (!isReady) return null;
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={DashboardPage} />
            <Route path="/dashboard" component={DashboardPage} />
            <Route path="/trade" component={TradePage} />
            <Route path="/positions" component={PositionsPage} />
            <Route path="/accounts" component={AccountsPage} />
            <Route path="/orders" component={OrdersPage} />
            <Route path="/pnl" component={PnlPage} />
            <Route path="/tpsl" component={TpslPage} />
            <Route path="/webhooks" component={WebhooksPage} />
            <Route path="/logs" component={LogsPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/select-accounts" component={SelectAccountsPage} />
            <Route path="/accounts/:id" component={AccountDetailPage} />
            <Route path="/notifications" component={NotificationsPage} />
            <Route path="/history" component={History} />
            <Route path="/calculator" component={CalculatorPage} />
            {/* <Route path="/auto-limit" component={AutoTradePuncherPage} /> */}

            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            {/* <RepunchMonitor /> */}
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;