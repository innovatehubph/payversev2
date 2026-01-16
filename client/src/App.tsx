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
import AdminSettings from "@/pages/admin-settings";
import AdminReports from "@/pages/admin-reports";
import Security from "@/pages/security";
import KYC from "@/pages/kyc";
import ForgotPassword from "@/pages/forgot-password";
import Services from "@/pages/services";
import Casino from "@/pages/casino";
import BankAccounts from "@/pages/bank-accounts";
import ManualWithdrawal from "@/pages/manual-withdrawal";

function ProtectedRoute({
  component: Component,
  adminOnly = false,
  blockSuperAdmin = false
}: {
  component: () => React.JSX.Element | null;
  adminOnly?: boolean;
  blockSuperAdmin?: boolean;
}) {
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

  // Block super admin from user-only pages (QRPH, Casino, Manual Deposit, etc.)
  if (blockSuperAdmin && user.role === "super_admin") {
    return <Redirect to="/dashboard" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        {() => <Landing />}
      </Route>
      <Route path="/auth">
        {() => <Auth />}
      </Route>
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
        {() => <ProtectedRoute component={Crypto} blockSuperAdmin={true} />}
      </Route>
      <Route path="/qrph">
        {() => <ProtectedRoute component={QRPH} blockSuperAdmin={true} />}
      </Route>
      <Route path="/manual-deposit">
        {() => <ProtectedRoute component={ManualDeposit} blockSuperAdmin={true} />}
      </Route>
      <Route path="/admin">
        {() => <ProtectedRoute component={Admin} adminOnly={true} />}
      </Route>
      <Route path="/admin/settings">
        {() => <ProtectedRoute component={AdminSettings} adminOnly={true} />}
      </Route>
      <Route path="/admin/reports">
        {() => <ProtectedRoute component={AdminReports} adminOnly={true} />}
      </Route>
      <Route path="/security">
        {() => <ProtectedRoute component={Security} />}
      </Route>
      <Route path="/kyc">
        {() => <ProtectedRoute component={KYC} blockSuperAdmin={true} />}
      </Route>
      <Route path="/services">
        {() => <ProtectedRoute component={Services} blockSuperAdmin={true} />}
      </Route>
      <Route path="/casino-connect">
        {() => <Redirect to="/casino" />}
      </Route>
      <Route path="/casino">
        {() => <ProtectedRoute component={Casino} blockSuperAdmin={true} />}
      </Route>
      <Route path="/bank-accounts">
        {() => <ProtectedRoute component={BankAccounts} blockSuperAdmin={true} />}
      </Route>
      <Route path="/manual-withdrawal">
        {() => <ProtectedRoute component={ManualWithdrawal} blockSuperAdmin={true} />}
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
  const [preloaderDone, setPreloaderDone] = useState(false);

  // Show preloader first, then show app
  if (showPreloader && !preloaderDone) {
    return (
      <>
        <Preloader onComplete={() => {
          setPreloaderDone(true);
          setShowPreloader(false);
        }} />
        <Toaster />
      </>
    );
  }

  // After preloader, always show Router (let routes handle auth)
  return (
    <>
      <Toaster />
      <Router />
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
