import { useState } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ModalProvider } from "@/lib/modal-context";
import Preloader from "@/components/preloader";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Auth from "@/pages/auth";
import Send from "@/pages/send";
import History from "@/pages/history";
import Profile from "@/pages/profile";
import Crypto from "@/pages/crypto";
import QRPH from "@/pages/qrph";
import ManualDeposit from "@/pages/manual-deposit";
import Admin from "@/pages/admin";
import Security from "@/pages/security";
import KYC from "@/pages/kyc";
import ForgotPassword from "@/pages/forgot-password";
import Services from "@/pages/services";
import Casino from "@/pages/casino";

function ProtectedRoute({ component: Component, adminOnly = false }: { component: () => React.JSX.Element; adminOnly?: boolean }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/" />;
  }

  if (adminOnly && !user.isAdmin) {
    return <Redirect to="/dashboard" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/auth" component={Auth} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/dashboard">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/send">
        {() => <ProtectedRoute component={Send} />}
      </Route>
      <Route path="/transfer">
        {() => <Redirect to="/send" />}
      </Route>
      <Route path="/history">
        {() => <ProtectedRoute component={History} />}
      </Route>
      <Route path="/profile">
        {() => <ProtectedRoute component={Profile} />}
      </Route>
      <Route path="/crypto">
        {() => <ProtectedRoute component={Crypto} />}
      </Route>
      <Route path="/qrph">
        {() => <ProtectedRoute component={QRPH} />}
      </Route>
      <Route path="/manual-deposit">
        {() => <ProtectedRoute component={ManualDeposit} />}
      </Route>
      <Route path="/admin">
        {() => <ProtectedRoute component={Admin} adminOnly={true} />}
      </Route>
      <Route path="/security">
        {() => <ProtectedRoute component={Security} />}
      </Route>
      <Route path="/kyc">
        {() => <ProtectedRoute component={KYC} />}
      </Route>
      <Route path="/services">
        {() => <ProtectedRoute component={Services} />}
      </Route>
      <Route path="/casino-connect">
        {() => <Redirect to="/casino" />}
      </Route>
      <Route path="/casino">
        {() => <ProtectedRoute component={Casino} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const [showPreloader, setShowPreloader] = useState(() => {
    const token = localStorage.getItem("auth_token");
    return !token;
  });

  // Hide preloader if user is authenticated or auth check is complete
  if (user || (!loading && !showPreloader)) {
    return (
      <>
        <Toaster />
        <Router />
      </>
    );
  }

  return (
    <>
      <Preloader onComplete={() => setShowPreloader(false)} />
      <Toaster />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ModalProvider>
          <TooltipProvider>
            <AppContent />
          </TooltipProvider>
        </ModalProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
