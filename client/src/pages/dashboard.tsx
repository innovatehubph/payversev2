import { useState, useEffect } from "react";
import AppLayout from "@/components/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ArrowDownLeft, Send, Clock, Plus, Coins, Eye, EyeOff, Link2, Wallet, QrCode, Building2, Gamepad2, LayoutGrid, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useModals } from "@/lib/modal-context";
import { api, getAuthToken } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { formatPeso } from "@/lib/utils";
import { GuidedTour, DASHBOARD_TOUR_STEPS } from "@/components/guided-tour";
import { CasinoModal } from "@/components/modals";

export default function Dashboard() {
  const [showBalance, setShowBalance] = useState(true);
  const { user } = useAuth();
  const { openTopUp, openCashOut } = useModals();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cryptoConnected, setCryptoConnected] = useState(false);
  const [phptBalance, setPhptBalance] = useState(0);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [showTour, setShowTour] = useState(false);
  const [tourChecked, setTourChecked] = useState(false);
  const [casinoModalOpen, setCasinoModalOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [txData] = await Promise.all([
          api.transactions.getAll(),
          fetchWalletBalance()
        ]);
        setTransactions(txData.slice(0, 5));
      } catch (error) {
        console.error("Failed to fetch data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    // Silent background refresh every 15 seconds (no loading indicators)
    const balanceInterval = setInterval(() => {
      if (!document.hidden) {
        fetchWalletBalance(true); // silent mode
      }
    }, 15000);

    return () => clearInterval(balanceInterval);
  }, []);

  useEffect(() => {
    const checkTutorialStatus = async () => {
      try {
        const token = getAuthToken();
        const res = await fetch("/api/tutorials/status", {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          const hasCompletedDashboardTour = data.completedTutorials?.includes("dashboard_tour");
          if (!hasCompletedDashboardTour) {
            setTimeout(() => setShowTour(true), 1000);
          }
        }
      } catch (error) {
        console.error("Failed to check tutorial status", error);
      } finally {
        setTourChecked(true);
      }
    };
    checkTutorialStatus();
  }, []);

  const fetchWalletBalance = async (silent = false) => {
    try {
      const token = getAuthToken();
      const headers = { "Authorization": `Bearer ${token}` };
      const balanceRes = await fetch("/api/wallet/balance", { headers });
      const balanceData = await balanceRes.json();

      if (balanceData.success) {
        setPhptBalance(parseFloat(balanceData.phptBalance) || 0);
        setCryptoConnected(balanceData.connected);
      }
    } catch (error) {
      if (!silent) console.error("Failed to fetch wallet balance", error);
      if (!silent) setPhptBalance(0);
    } finally {
      if (!silent) setBalanceLoading(false);
    }
  };

  const handleTourComplete = async () => {
    setShowTour(false);
    try {
      const token = getAuthToken();
      await fetch("/api/tutorials/complete/dashboard_tour", {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
    } catch (error) {
      console.error("Failed to mark tour complete", error);
    }
  };

  const handleTourSkip = () => {
    setShowTour(false);
    handleTourComplete();
  };

  return (
    <AppLayout>
      <header className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-muted-foreground text-sm font-medium mb-1">Welcome back,</h2>
          <h1 className="text-2xl font-display font-bold" data-testid="text-username">{user?.fullName || "User"}</h1>
        </div>
      </header>

      {showTour && (
        <GuidedTour
          tourId="dashboard_tour"
          steps={DASHBOARD_TOUR_STEPS}
          onComplete={handleTourComplete}
          onSkip={handleTourSkip}
        />
      )}

      {/* Main Balance Card */}
      <section className="mb-6" data-testid="wallet-balance">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground p-6 shadow-2xl shadow-primary/30">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 h-40 w-40 rounded-full bg-white/10 blur-3xl"></div>
          <div className="absolute bottom-0 left-0 -mb-8 -ml-8 h-40 w-40 rounded-full bg-accent/20 blur-3xl"></div>
          
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-primary-foreground/80 font-medium mb-1 flex items-center gap-2 text-sm">
                  <Coins className="h-4 w-4" /> PayVerse Balance
                  {cryptoConnected && (
                    <span className="inline-flex items-center gap-1 text-xs bg-white/20 px-2 py-0.5 rounded-full">
                      <Link2 className="h-3 w-3" /> Connected
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-3">
                  <h2 className="text-4xl md:text-5xl font-display font-bold tracking-tight" data-testid="text-total-balance">
                    {balanceLoading ? "..." : showBalance ? formatPeso(phptBalance) : "••••••"}
                  </h2>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="text-primary-foreground/70 hover:text-white hover:bg-white/10 h-8 w-8 rounded-full"
                    onClick={() => setShowBalance(!showBalance)}
                    data-testid="button-toggle-balance"
                  >
                    {showBalance ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-primary-foreground/60 text-xs mt-1">
                  PHPT • 1:1 with PHP
                </p>
              </div>
            </div>

            {/* Quick Action Buttons - Top Up/Cash Out hidden for super admin (escrow account), Send allowed */}
            <div className={`grid ${user?.role === "super_admin" ? "grid-cols-2" : "grid-cols-3"} gap-3`}>
              <Link href="/send">
                <Button className="w-full bg-white text-primary hover:bg-white/90 border-0 shadow-lg shadow-black/10 font-medium h-12" data-testid="button-send">
                  <Send className="mr-2 h-4 w-4" /> Send
                </Button>
              </Link>
              {user?.role !== "super_admin" && (
                <>
                  <Button
                    variant="outline"
                    className="border-white/30 text-white hover:bg-white/10 hover:text-white font-medium h-12"
                    onClick={openTopUp}
                    data-testid="button-topup"
                  >
                    <ArrowDownLeft className="mr-2 h-4 w-4" /> Top Up
                  </Button>
                  <Button
                    variant="outline"
                    className="border-white/30 text-white hover:bg-white/10 hover:text-white font-medium h-12"
                    onClick={openCashOut}
                    data-testid="button-cashout"
                  >
                    <ArrowUpRight className="mr-2 h-4 w-4" /> Cash Out
                  </Button>
                </>
              )}
              {user?.role === "super_admin" && (
                <Link href="/admin">
                  <Button className="w-full bg-white/20 text-white hover:bg-white/30 border-0 font-medium h-12" data-testid="button-admin">
                    Admin Panel
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Quick Services - Hidden for super admin (escrow account) */}
      {user?.role !== "super_admin" && (
        <section className="mb-6" data-testid="quick-services">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-display font-semibold flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-muted-foreground" /> Quick Services
            </h3>
            <Link href="/services" className="text-sm text-primary font-medium hover:underline flex items-center gap-1" data-testid="link-all-services">
              All Services <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link href="/crypto">
              <Card className="group hover:border-primary/30 hover:shadow-lg transition-all cursor-pointer h-full" data-testid="quick-crypto">
                <CardContent className="p-4 flex flex-col items-center text-center">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/10 mb-3 group-hover:scale-110 transition-transform">
                    <Wallet className="h-6 w-6 text-indigo-500" />
                  </div>
                  <p className="font-semibold text-sm">Crypto Wallet</p>
                  <p className="text-xs text-muted-foreground">PHPT via PayGram</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/qrph">
              <Card className="group hover:border-primary/30 hover:shadow-lg transition-all cursor-pointer h-full" data-testid="quick-qrph">
                <CardContent className="p-4 flex flex-col items-center text-center">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/10 mb-3 group-hover:scale-110 transition-transform">
                    <QrCode className="h-6 w-6 text-blue-500" />
                  </div>
                  <p className="font-semibold text-sm">QRPH Payment</p>
                  <p className="text-xs text-muted-foreground">GCash, Maya, GrabPay</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/manual-deposit">
              <Card className="group hover:border-primary/30 hover:shadow-lg transition-all cursor-pointer h-full" data-testid="quick-manual">
                <CardContent className="p-4 flex flex-col items-center text-center">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 mb-3 group-hover:scale-110 transition-transform">
                    <Building2 className="h-6 w-6 text-emerald-500" />
                  </div>
                  <p className="font-semibold text-sm">Manual Deposit</p>
                  <p className="text-xs text-muted-foreground">Bank & E-wallets</p>
                </CardContent>
              </Card>
            </Link>

            <Card
              className="group hover:border-rose-500/30 hover:shadow-lg transition-all cursor-pointer h-full border-rose-500/10"
              onClick={() => setCasinoModalOpen(true)}
              data-testid="quick-casino"
            >
              <CardContent className="p-4 flex flex-col items-center text-center">
                <div className="p-3 rounded-xl bg-gradient-to-br from-rose-500/20 to-orange-500/10 mb-3 group-hover:scale-110 transition-transform">
                  <Gamepad2 className="h-6 w-6 text-rose-500" />
                </div>
                <p className="font-semibold text-sm">747 Casino</p>
                <p className="text-xs text-muted-foreground">Instant deposit</p>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Recent Transactions */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-display font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" /> Recent Activity
          </h3>
          <Link href="/history" className="text-sm text-primary font-medium hover:underline" data-testid="link-view-all">
            View All
          </Link>
        </div>
        
        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : transactions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Coins className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-muted-foreground font-medium mb-1">No transactions yet</p>
                <p className="text-sm text-muted-foreground">Your activity will appear here</p>
              </CardContent>
            </Card>
          ) : (
            transactions.map((tx) => {
              // Use direction from backend (primary) or fallback to type check
              const isIncoming = tx.direction === 'incoming' || tx.type === 'received';

              // Get display name: prefer description, then counterparty name
              const displayName = tx.description ||
                (tx.counterparty?.fullName ? (isIncoming ? `From ${tx.counterparty.fullName}` : `To ${tx.counterparty.fullName}`) : null) ||
                tx.displayCategory ||
                "Transaction";

              return (
                <Card key={tx.id} className="group hover:border-primary/20 hover:shadow-md transition-all" data-testid={`tx-row-${tx.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm ${
                          isIncoming
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        }`}>
                          {isIncoming ? (
                            <ArrowDownLeft className="h-5 w-5" />
                          ) : (
                            <ArrowUpRight className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{displayName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}
                            {tx.counterparty?.username && <span className="ml-1 text-primary">@{tx.counterparty.username}</span>}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${
                          isIncoming ? 'text-green-600 dark:text-green-400' : 'text-foreground'
                        }`}>
                          {isIncoming ? '+' : '-'}{formatPeso(parseFloat(tx.amount))}
                        </p>
                        <p className="text-xs text-muted-foreground">{tx.displayCategory || tx.category || "Transaction"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </section>

      <CasinoModal open={casinoModalOpen} onOpenChange={setCasinoModalOpen} />
    </AppLayout>
  );
}
