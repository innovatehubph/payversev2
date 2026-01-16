import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Gamepad2,
  ArrowLeft,
  User,
  Users,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Shield,
  Mail,
  ChevronRight,
  Loader2,
  LinkIcon,
  Unlink,
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  Sparkles,
  Zap,
  Trophy,
  Coins,
  History,
  TrendingUp,
  TrendingDown,
  Lock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAuthToken } from "@/lib/api";
import { formatPeso, cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type AccountType = "player" | "agent";
type ConnectionStep = "select_type" | "enter_username" | "verify_otp";

interface BalanceInfo {
  type: string;
  currency: string;
  amount: number;
}

interface AccountInfo {
  clientId?: string | null;
  status?: string | null;
  currency?: string;
  level?: string | null;
  lastLogin?: string | null;
}

interface PlayerStats {
  totalDeposit7Days?: number;
  totalBet7Days?: number;
  totalWithdraw7Days?: number;
  wageringFactor?: number;
  amountToBet?: number;
  recentDeposit?: number;
  recentBet?: number;
  recentWithdraw?: number;
  recentCanWithdraw?: boolean;
  recentAmountToBet?: number;
}

interface CasinoStatus {
  connected: boolean;
  username?: string;
  assignedAgent?: string;
  isAgent?: boolean;
  balance?: number | null;
  bonusBalance?: number;
  withdrawableBalance?: number;
  lockedBalance?: number;
  canWithdraw?: boolean;
  allBalances?: BalanceInfo[];
  balanceNotAvailable?: boolean;
  stats?: PlayerStats;
  message?: string;
  demoMode?: boolean;
  source?: string;
}

interface ValidationResult {
  valid: boolean;
  username?: string;
  agent?: string;
  clientId?: string;
  message?: string;
}

interface Transaction {
  id: number;
  type: string;
  amount: string;
  status: string;
  note: string;
  createdAt: string;
}

interface CasinoStats {
  totalDeposits: number;
  totalWithdrawals: number;
  totalBets: number;
  totalWins: number;
  netProfit: number;
  currency: string;
}

interface CasinoFinanceTransaction {
  date: string;
  type: string;
  amount: number;
  balance: number | null;
  description: string | null;
}

export default function Casino() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  const [status, setStatus] = useState<CasinoStatus | null>(null);
  const [phptBalance, setPhptBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [casinoStats, setCasinoStats] = useState<CasinoStats | null>(null);
  const [casinoFinance, setCasinoFinance] = useState<CasinoFinanceTransaction[]>([]);
  
  const [connectionStep, setConnectionStep] = useState<ConnectionStep>("select_type");
  const [accountType, setAccountType] = useState<AccountType>("player");
  const [username, setUsername] = useState("");
  const [otp, setOtp] = useState("");
  const [balanceInput, setBalanceInput] = useState("");
  const [verificationType, setVerificationType] = useState<"otp" | "balance">("otp");
  const [validating, setValidating] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // PIN entry state
  const [pin, setPin] = useState("");
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<"deposit" | "withdraw" | null>(null);

  const getAuthHeaders = useCallback(() => {
    const token = getAuthToken();
    return { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
  }, []);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [walletRes, casinoRes] = await Promise.all([
        fetch("/api/wallet/balance", { headers: getAuthHeaders() }),
        fetch("/api/casino/balance", { headers: getAuthHeaders() })
      ]);

      const walletData = await walletRes.json();
      if (walletData.success) {
        setPhptBalance(parseFloat(walletData.phptBalance) || 0);
      }

      const casinoData = await casinoRes.json();
      setStatus(casinoData);

      if (casinoData.connected) {
        // Fetch local transaction history, casino statistics, and casino finance in parallel
        const [historyRes, statsRes, financeRes] = await Promise.all([
          fetch("/api/transactions?type=casino", { headers: getAuthHeaders() }),
          fetch("/api/casino/statistics", { headers: getAuthHeaders() }),
          fetch("/api/casino/finance", { headers: getAuthHeaders() })
        ]);

        if (historyRes.ok) {
          const historyData = await historyRes.json();
          setTransactions(historyData.transactions?.slice(0, 5) || []);
        }

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          if (statsData.success && statsData.stats) {
            setCasinoStats(statsData.stats);
          }
        }

        if (financeRes.ok) {
          const financeData = await financeRes.json();
          if (financeData.success && financeData.transactions) {
            setCasinoFinance(financeData.transactions.slice(0, 10));
          }
        }
      }
    } catch (error) {
      if (!silent) console.error("Failed to fetch data:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [getAuthHeaders]);

  // Initial data fetch - only runs once on mount
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Silent background refresh every 15 seconds (no loading indicators)
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      if (!document.hidden && status?.connected) {
        fetchData(true); // silent mode
      }
    }, 15000);

    return () => clearInterval(refreshInterval);
  }, [status?.connected, fetchData]);

  const handleValidateUsername = async () => {
    if (!username.trim()) {
      toast({ title: "Error", description: "Please enter your 747 username", variant: "destructive" });
      return;
    }

    setValidating(true);
    setValidationResult(null);
    
    try {
      const response = await fetch("/api/casino/validate", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ username: username.trim(), isAgent: accountType === "agent" })
      });
      
      const data = await response.json();
      
      if (response.ok && data.valid) {
        setValidationResult({ valid: true, username: data.username, agent: data.agent, clientId: data.clientId });
        toast({ title: "Account Found", description: `Your account is under agent: ${data.agent}` });
      } else {
        setValidationResult({ valid: false, message: data.message || "Username not found" });
        toast({ title: "Not Found", description: data.message || "Account not under Team Marc network", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setValidating(false);
    }
  };

  const handleSendOtp = async () => {
    if (!validationResult?.valid) return;
    setSendingOtp(true);
    
    try {
      const response = await fetch("/api/casino/send-otp", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ username: validationResult.username, isAgent: accountType === "agent" })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        // Set verification type based on response
        const vType = data.verificationType === "balance" ? "balance" : "otp";
        setVerificationType(vType);
        setConnectionStep("verify_otp");
        
        if (vType === "balance") {
          toast({ title: "Verify Your Account", description: "Enter your current 747 casino balance" });
        } else {
          toast({ title: "OTP Sent", description: "Check your 747 account messages" });
        }
      } else {
        toast({ title: "Failed", description: data.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) return;
    setVerifying(true);
    
    try {
      const response = await fetch("/api/casino/verify-otp", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ username: validationResult?.username, isAgent: accountType === "agent", otp })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        toast({ title: "Connected!", description: "Your 747 account is now linked" });
        await fetchData();
      } else {
        toast({ title: "Invalid OTP", description: data.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyBalance = async () => {
    if (!balanceInput.trim()) return;
    setVerifying(true);
    
    try {
      const response = await fetch("/api/casino/verify-balance", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ username: validationResult?.username, balance: parseFloat(balanceInput) })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        toast({ title: "Connected!", description: "Your 747 account is now linked" });
        await fetchData();
      } else {
        toast({ title: "Verification Failed", description: data.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const response = await fetch("/api/casino/disconnect", { method: "POST", headers: getAuthHeaders() });
      const data = await response.json();
      
      if (response.ok && data.success) {
        toast({ title: "Disconnected", description: "Account unlinked successfully" });
        setStatus(null);
        setConnectionStep("select_type");
        setUsername("");
        setOtp("");
        setBalanceInput("");
        setVerificationType("otp");
        setValidationResult(null);
        setCasinoStats(null);
        setCasinoFinance([]);
        setTransactions([]);
        await fetchData();
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleDeposit = async () => {
    const parsedAmount = parseFloat(depositAmount);
    if (!parsedAmount || parsedAmount <= 0) {
      toast({ title: "Invalid Amount", description: "Enter a valid amount", variant: "destructive" });
      return;
    }

    if (parsedAmount > phptBalance) {
      toast({ title: "Insufficient Balance", description: "Not enough PHPT", variant: "destructive" });
      return;
    }

    // Show PIN dialog instead of processing directly
    setPendingAction("deposit");
    setShowPinDialog(true);
  };

  const handleWithdraw = async () => {
    const parsedAmount = parseFloat(withdrawAmount);
    if (!parsedAmount || parsedAmount <= 0) {
      toast({ title: "Invalid Amount", description: "Enter a valid amount", variant: "destructive" });
      return;
    }

    // Use withdrawableBalance if available, otherwise fall back to balance
    const availableForWithdraw = status?.withdrawableBalance ?? status?.balance ?? 0;
    if (parsedAmount > availableForWithdraw) {
      toast({
        title: "Insufficient Withdrawable Balance",
        description: `You can only withdraw ₱${availableForWithdraw.toLocaleString()}. Some chips may be locked or non-cashable.`,
        variant: "destructive"
      });
      return;
    }

    // Show PIN dialog instead of processing directly
    setPendingAction("withdraw");
    setShowPinDialog(true);
  };

  // Execute the actual transaction after PIN verification
  const handleConfirmTransaction = async () => {
    if (pin.length !== 6) {
      toast({ title: "Invalid PIN", description: "Please enter your 6-digit PIN", variant: "destructive" });
      return;
    }

    const isDeposit = pendingAction === "deposit";
    const amount = isDeposit ? parseFloat(depositAmount) : parseFloat(withdrawAmount);
    const endpoint = isDeposit ? "/api/casino/deposit" : "/api/casino/withdraw";

    setProcessing(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ amount, pin })
      });

      const data = await response.json();

      if (data.success) {
        setSuccessMessage(isDeposit
          ? `₱${amount.toLocaleString()} chips added to casino!`
          : `₱${amount.toLocaleString()} PHPT credited to wallet!`
        );
        setShowSuccess(true);
        if (isDeposit) {
          setDepositAmount("");
        } else {
          setWithdrawAmount("");
        }
        await fetchData();
        setTimeout(() => setShowSuccess(false), 3000);
      } else {
        // Handle specific PIN-related errors
        if (data.requiresPin && data.needsPinSetup) {
          toast({ title: "PIN Required", description: "Please set up your PIN in Security settings first.", variant: "destructive" });
        } else if (data.lockedUntil) {
          toast({ title: "PIN Locked", description: data.message, variant: "destructive" });
        } else if (data.attemptsRemaining !== undefined) {
          toast({ title: "Invalid PIN", description: data.message, variant: "destructive" });
          setPin(""); // Clear PIN for retry
          return; // Don't close dialog on invalid PIN
        } else {
          toast({ title: "Failed", description: data.message, variant: "destructive" });
        }
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
      setShowPinDialog(false);
      setPin("");
      setPendingAction(null);
    }
  };

  const quickAmounts = [100, 500, 1000, 5000];

  if (loading) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-rose-500 to-orange-500 animate-pulse" />
            <Gamepad2 className="h-8 w-8 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-muted-foreground">Loading casino...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto space-y-6 pb-24">
        <header className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/services")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <div className="p-2 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500">
                <Gamepad2 className="h-5 w-5 text-white" />
              </div>
              747 Live Casino
            </h1>
          </div>
          {status?.connected && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fetchData()}
              disabled={loading}
              data-testid="button-refresh"
            >
              <RefreshCw className={cn("h-5 w-5", loading && "animate-spin")} />
            </Button>
          )}
        </header>

        <AnimatePresence mode="wait">
          {showSuccess && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              className="fixed top-20 left-1/2 -translate-x-1/2 z-50"
            >
              <Card className="bg-green-500 text-white shadow-2xl border-0">
                <CardContent className="p-4 flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6" />
                  <span className="font-semibold">{successMessage}</span>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {status?.connected ? (
          <>
            <Card className="overflow-hidden border-0 shadow-xl">
              <div className="bg-gradient-to-br from-rose-500 via-rose-600 to-orange-500 p-6 text-white relative">
                <div className="absolute top-0 right-0 -mt-10 -mr-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
                <div className="absolute bottom-0 left-0 -mb-10 -ml-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
                
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-white/20 backdrop-blur">
                        <Trophy className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm text-white/80">Connected as</p>
                        <p className="font-bold text-lg">{status.username}</p>
                      </div>
                    </div>
                    <Badge className="bg-white/20 border-0">
                      <Zap className="h-3 w-3 mr-1" />
                      {status.isAgent ? "Agent" : "Player"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Casino Balance - different display for agents vs players */}
                    <div className="bg-white/10 backdrop-blur rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Coins className="h-4 w-4 text-yellow-300" />
                        <span className="text-sm text-white/80">
                          {status.isAgent ? "Agent Account" : "Casino Chips"}
                        </span>
                      </div>
                      {status.balanceNotAvailable || status.balance === null ? (
                        <p className="text-sm text-white/60" data-testid="text-casino-balance">
                          {status.isAgent ? "Check 747 dashboard" : "Balance unavailable"}
                        </p>
                      ) : (
                        <p className="text-2xl font-bold" data-testid="text-casino-balance">
                          ₱{(status.balance ?? 0).toLocaleString()}
                        </p>
                      )}
                      {(status.bonusBalance ?? 0) > 0 && (
                        <p className="text-xs text-white/60 mt-1">
                          +₱{status.bonusBalance?.toLocaleString()} bonus
                        </p>
                      )}
                    </div>
                    <div className="bg-white/10 backdrop-blur rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Wallet className="h-4 w-4 text-green-300" />
                        <span className="text-sm text-white/80">PHPT Wallet</span>
                      </div>
                      <p className="text-2xl font-bold" data-testid="text-phpt-balance">
                        ₱{phptBalance.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  
                  {/* Player Stats - 7 Day Activity (only for players with stats) */}
                  {!status.isAgent && status.stats && (
                    <div className="mt-4 pt-4 border-t border-white/20">
                      <p className="text-xs text-white/60 mb-3">Last 7 Days Activity</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-white/10 rounded-lg p-2 text-center">
                          <p className="text-lg font-bold text-green-300">₱{(status.stats.totalDeposit7Days ?? 0).toLocaleString()}</p>
                          <p className="text-xs text-white/60">Deposits</p>
                        </div>
                        <div className="bg-white/10 rounded-lg p-2 text-center">
                          <p className="text-lg font-bold text-blue-300">₱{(status.stats.totalBet7Days ?? 0).toLocaleString()}</p>
                          <p className="text-xs text-white/60">Bets</p>
                        </div>
                        <div className="bg-white/10 rounded-lg p-2 text-center">
                          <p className="text-lg font-bold text-amber-300">₱{(status.stats.totalWithdraw7Days ?? 0).toLocaleString()}</p>
                          <p className="text-xs text-white/60">Withdrawals</p>
                        </div>
                      </div>
                      {status.stats.wageringFactor !== undefined && status.stats.wageringFactor > 0 && (
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="text-white/60">Wagering Factor:</span>
                          <span className="font-medium">{status.stats.wageringFactor.toFixed(2)}x</span>
                        </div>
                      )}
                      {status.canWithdraw === false && (
                        <div className="mt-2 bg-amber-500/20 rounded-lg p-2 text-center">
                          <p className="text-xs text-amber-200">Wagering requirement not met</p>
                          {status.stats.amountToBet && status.stats.amountToBet > 0 && (
                            <p className="text-xs text-white/80">Bet ₱{status.stats.amountToBet.toLocaleString()} more to withdraw</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {status.allBalances && status.allBalances.length > 1 && (
                    <div className="mt-4 pt-4 border-t border-white/20">
                      <p className="text-xs text-white/60 mb-2">All Balances:</p>
                      <div className="flex flex-wrap gap-2">
                        {status.allBalances.map((bal, idx) => (
                          <span key={idx} className="text-xs bg-white/10 px-2 py-1 rounded">
                            {bal.type}: ₱{bal.amount.toLocaleString()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <CardContent className="p-4 bg-white/50 dark:bg-gray-900/50 backdrop-blur">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Shield className="h-4 w-4" />
                    via {status.assignedAgent}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="text-muted-foreground hover:text-destructive"
                    data-testid="button-disconnect"
                  >
                    {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4 mr-1" />}
                    Disconnect
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Buy/Sell Chips - Only for player accounts */}
            {!status.isAgent && (
            <Card>
              <CardContent className="p-4">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "deposit" | "withdraw")}>
                  <TabsList className="grid w-full grid-cols-2 h-12">
                    <TabsTrigger value="deposit" className="flex items-center gap-2 text-base">
                      <ArrowDownToLine className="h-4 w-4" />
                      Buy Chips
                    </TabsTrigger>
                    <TabsTrigger value="withdraw" className="flex items-center gap-2 text-base">
                      <ArrowUpFromLine className="h-4 w-4" />
                      Sell Chips
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="deposit" className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label className="flex items-center justify-between">
                        <span>Amount (PHPT → Chips)</span>
                        <span className="text-sm text-muted-foreground">Available: ₱{phptBalance.toLocaleString()}</span>
                      </Label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground">₱</span>
                        <Input
                          type="number"
                          placeholder="0"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          className="text-3xl font-bold h-16 pl-10 pr-4 text-center"
                          data-testid="input-deposit-amount"
                        />
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {quickAmounts.map((qa) => (
                          <Button
                            key={qa}
                            variant="outline"
                            size="sm"
                            onClick={() => setDepositAmount(qa.toString())}
                            className="flex-1"
                          >
                            ₱{qa.toLocaleString()}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <Button 
                      onClick={handleDeposit} 
                      disabled={processing || !depositAmount}
                      className="w-full h-14 text-lg bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600"
                      data-testid="button-deposit"
                    >
                      {processing ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>
                          <ArrowDownToLine className="mr-2 h-5 w-5" />
                          Buy {depositAmount ? `₱${parseFloat(depositAmount).toLocaleString()}` : ""} Chips
                        </>
                      )}
                    </Button>
                  </TabsContent>

                  <TabsContent value="withdraw" className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label className="flex items-center justify-between">
                        <span>Amount (Chips → PHPT)</span>
                        <span className="text-sm text-muted-foreground">Withdrawable: ₱{(status.withdrawableBalance ?? status.balance ?? 0).toLocaleString()}</span>
                      </Label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground">₱</span>
                        <Input
                          type="number"
                          placeholder="0"
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          className="text-3xl font-bold h-16 pl-10 pr-4 text-center"
                          data-testid="input-withdraw-amount"
                        />
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {quickAmounts.map((qa) => (
                          <Button
                            key={qa}
                            variant="outline"
                            size="sm"
                            onClick={() => setWithdrawAmount(qa.toString())}
                            className="flex-1"
                          >
                            ₱{qa.toLocaleString()}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <Button 
                      onClick={handleWithdraw} 
                      disabled={processing || !withdrawAmount}
                      className="w-full h-14 text-lg"
                      data-testid="button-withdraw"
                    >
                      {processing ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>
                          <ArrowUpFromLine className="mr-2 h-5 w-5" />
                          Sell {withdrawAmount ? `₱${parseFloat(withdrawAmount).toLocaleString()}` : ""} Chips
                        </>
                      )}
                    </Button>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
            )}

            {/* Agent Notice - for agent accounts */}
            {status.isAgent && (
              <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-800 dark:text-amber-200">Agent Account</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        Agent accounts cannot buy or sell chips through PayVerse. 
                        Please use the 747Live dashboard to manage your balance and transfers.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Casino Statistics Card */}
            {casinoStats && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    Casino Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Total Deposits</p>
                      <p className="text-lg font-bold text-green-600">₱{casinoStats.totalDeposits.toLocaleString()}</p>
                    </div>
                    <div className="bg-rose-50 dark:bg-rose-900/20 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Total Withdrawals</p>
                      <p className="text-lg font-bold text-rose-600">₱{casinoStats.totalWithdrawals.toLocaleString()}</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Total Bets</p>
                      <p className="text-lg font-bold text-blue-600">₱{casinoStats.totalBets.toLocaleString()}</p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Total Wins</p>
                      <p className="text-lg font-bold text-amber-600">₱{casinoStats.totalWins.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className={cn(
                    "mt-3 p-3 rounded-lg text-center",
                    casinoStats.netProfit >= 0 ? "bg-green-100 dark:bg-green-900/30" : "bg-rose-100 dark:bg-rose-900/30"
                  )}>
                    <p className="text-xs text-muted-foreground">Net Profit/Loss</p>
                    <p className={cn(
                      "text-xl font-bold",
                      casinoStats.netProfit >= 0 ? "text-green-600" : "text-rose-600"
                    )}>
                      {casinoStats.netProfit >= 0 ? "+" : ""}₱{casinoStats.netProfit.toLocaleString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* PayVerse Transaction History */}
            {transactions.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />
                    PayVerse Transactions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-full",
                          tx.type === "casino_deposit" ? "bg-rose-100 dark:bg-rose-900/30" : "bg-green-100 dark:bg-green-900/30"
                        )}>
                          {tx.type === "casino_deposit" ? (
                            <TrendingDown className="h-4 w-4 text-rose-600" />
                          ) : (
                            <TrendingUp className="h-4 w-4 text-green-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {tx.type === "casino_deposit" ? "Bought Chips" : "Sold Chips"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(tx.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "font-semibold",
                          tx.type === "casino_deposit" ? "text-rose-600" : "text-green-600"
                        )}>
                          {tx.type === "casino_deposit" ? "-" : "+"}₱{parseFloat(tx.amount).toLocaleString()}
                        </p>
                        <Badge variant={tx.status === "completed" ? "default" : "secondary"} className="text-xs">
                          {tx.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* 747Live Casino History */}
            {casinoFinance.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Gamepad2 className="h-4 w-4 text-rose-500" />
                    747Live Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {casinoFinance.map((tx, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-full",
                          tx.amount < 0 ? "bg-rose-100 dark:bg-rose-900/30" : "bg-green-100 dark:bg-green-900/30"
                        )}>
                          {tx.amount < 0 ? (
                            <TrendingDown className="h-4 w-4 text-rose-600" />
                          ) : (
                            <TrendingUp className="h-4 w-4 text-green-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm capitalize">{tx.type}</p>
                          <p className="text-xs text-muted-foreground">
                            {tx.date ? new Date(tx.date).toLocaleDateString() : "Recent"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "font-semibold",
                          tx.amount < 0 ? "text-rose-600" : "text-green-600"
                        )}>
                          {tx.amount >= 0 ? "+" : ""}₱{Math.abs(tx.amount).toLocaleString()}
                        </p>
                        {tx.balance !== null && (
                          <p className="text-xs text-muted-foreground">Bal: ₱{tx.balance.toLocaleString()}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card className="bg-muted/30">
              <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
                <p className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Minimum: ₱1 | Maximum: ₱50,000 per transaction
                </p>
                <p>1 PHPT = 1 Casino Chip (1:1 rate)</p>
                <p>Instant processing for both deposits and withdrawals</p>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card className="overflow-hidden">
              <div className="bg-gradient-to-br from-rose-500 via-rose-600 to-orange-500 p-6 text-white text-center">
                <div className="h-20 w-20 mx-auto mb-4 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                  <Gamepad2 className="h-10 w-10" />
                </div>
                <h2 className="text-xl font-bold mb-2">Connect Your 747 Account</h2>
                <p className="text-white/80 text-sm">
                  Link your 747Live casino account to instantly buy and sell chips using your PHPT wallet
                </p>
              </div>
            </Card>

            <div className="flex items-center gap-4 text-sm text-muted-foreground px-2">
              <div className={cn(
                "flex items-center gap-2",
                connectionStep === "select_type" ? "text-primary font-medium" : ""
              )}>
                <span className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold",
                  connectionStep === "select_type" ? "bg-primary text-white" : "bg-muted"
                )}>1</span>
                Type
              </div>
              <ChevronRight className="h-4 w-4" />
              <div className={cn(
                "flex items-center gap-2",
                connectionStep === "enter_username" ? "text-primary font-medium" : ""
              )}>
                <span className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold",
                  connectionStep === "enter_username" ? "bg-primary text-white" : "bg-muted"
                )}>2</span>
                Username
              </div>
              <ChevronRight className="h-4 w-4" />
              <div className={cn(
                "flex items-center gap-2",
                connectionStep === "verify_otp" ? "text-primary font-medium" : ""
              )}>
                <span className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold",
                  connectionStep === "verify_otp" ? "bg-primary text-white" : "bg-muted"
                )}>3</span>
                Verify
              </div>
            </div>

            <AnimatePresence mode="wait">
              {connectionStep === "select_type" && (
                <motion.div
                  key="select_type"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">What type of 747 account do you have?</CardTitle>
                      <CardDescription>Select your account type to continue</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <RadioGroup value={accountType} onValueChange={(v) => setAccountType(v as AccountType)}>
                        <div 
                          className={cn(
                            "flex items-center space-x-4 p-4 rounded-xl border-2 cursor-pointer transition-all",
                            accountType === "player" ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50"
                          )}
                          onClick={() => setAccountType("player")}
                        >
                          <RadioGroupItem value="player" id="player" />
                          <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30">
                            <User className="h-6 w-6 text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <Label htmlFor="player" className="font-semibold text-base cursor-pointer">Player Account</Label>
                            <p className="text-sm text-muted-foreground">I play games on 747Live</p>
                          </div>
                        </div>
                        
                        <div 
                          className={cn(
                            "flex items-center space-x-4 p-4 rounded-xl border-2 cursor-pointer transition-all",
                            accountType === "agent" ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50"
                          )}
                          onClick={() => setAccountType("agent")}
                        >
                          <RadioGroupItem value="agent" id="agent" />
                          <div className="p-3 rounded-xl bg-purple-100 dark:bg-purple-900/30">
                            <Users className="h-6 w-6 text-purple-600" />
                          </div>
                          <div className="flex-1">
                            <Label htmlFor="agent" className="font-semibold text-base cursor-pointer">Agent Account</Label>
                            <p className="text-sm text-muted-foreground">I'm a 747Live agent or sub-agent</p>
                          </div>
                        </div>
                      </RadioGroup>
                      
                      <Button 
                        onClick={() => setConnectionStep("enter_username")} 
                        className="w-full h-12"
                        data-testid="button-continue-type"
                      >
                        Continue <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {connectionStep === "enter_username" && (
                <motion.div
                  key="enter_username"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <Card>
                    <CardHeader>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="-ml-2 mb-2 w-fit" 
                        onClick={() => { setConnectionStep("select_type"); setValidationResult(null); }}
                      >
                        <ArrowLeft className="h-4 w-4 mr-1" /> Back
                      </Button>
                      <CardTitle className="text-lg">Enter Your 747 Username</CardTitle>
                      <CardDescription>We'll verify your account is under Team Marc network</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="username">Your 747Live {accountType} username</Label>
                        <Input
                          id="username"
                          placeholder={`Enter your ${accountType} username`}
                          value={username}
                          onChange={(e) => { setUsername(e.target.value); setValidationResult(null); }}
                          className="h-12 text-lg"
                          data-testid="input-username"
                        />
                      </div>
                      
                      {validationResult && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn(
                            "p-4 rounded-xl border",
                            validationResult.valid 
                              ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" 
                              : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                          )}
                        >
                          {validationResult.valid ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                                <CheckCircle2 className="h-5 w-5" />
                                <span className="font-semibold">Account Found!</span>
                              </div>
                              <div className="text-sm text-green-600 dark:text-green-500">
                                <p>Username: <strong>{validationResult.username}</strong></p>
                                <p>Agent: <strong>{validationResult.agent}</strong></p>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-2 text-red-700 dark:text-red-400">
                              <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                              <div>
                                <span className="font-semibold">Not Found</span>
                                <p className="text-sm mt-1">{validationResult.message}</p>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}

                      <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-400">
                        <Shield className="h-4 w-4 inline mr-2" />
                        Your account must be under Team Marc network (marcthepogi, teammarc, or bossmarc747)
                      </div>
                      
                      {!validationResult?.valid ? (
                        <Button 
                          onClick={handleValidateUsername}
                          disabled={validating || !username.trim()}
                          className="w-full h-12"
                          data-testid="button-validate"
                        >
                          {validating ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Validating...</>
                          ) : (
                            "Validate Username"
                          )}
                        </Button>
                      ) : (
                        <Button 
                          onClick={handleSendOtp}
                          disabled={sendingOtp}
                          className="w-full h-12 bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600"
                          data-testid="button-send-otp"
                        >
                          {sendingOtp ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending OTP...</>
                          ) : (
                            <><Mail className="mr-2 h-4 w-4" /> Send Verification Code</>
                          )}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {connectionStep === "verify_otp" && (
                <motion.div
                  key="verify_otp"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <Card>
                    <CardHeader>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="-ml-2 mb-2 w-fit" 
                        onClick={() => { setConnectionStep("enter_username"); setOtp(""); setBalanceInput(""); }}
                      >
                        <ArrowLeft className="h-4 w-4 mr-1" /> Back
                      </Button>
                      <CardTitle className="text-lg">
                        {verificationType === "balance" ? "Verify Your Balance" : "Enter Verification Code"}
                      </CardTitle>
                      <CardDescription>
                        {verificationType === "balance" 
                          ? "Enter your current 747 casino balance to verify account ownership" 
                          : "Check your 747Live account messages for the 6-digit code"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {verificationType === "balance" ? (
                        <>
                          <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 text-sm">
                            <Wallet className="h-4 w-4 inline mr-2" />
                            Login to your 747Live account and check your current balance. Enter the exact amount to verify you own this account.
                          </div>
                          
                          <div className="py-4">
                            <Label htmlFor="balance-input" className="text-sm text-muted-foreground mb-2 block">
                              Your Current 747 Casino Balance
                            </Label>
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground">₱</span>
                              <Input
                                id="balance-input"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={balanceInput}
                                onChange={(e) => setBalanceInput(e.target.value)}
                                className="text-3xl font-bold h-16 pl-10 pr-4 text-center"
                                data-testid="input-balance-verification"
                              />
                            </div>
                            <p className="text-xs text-muted-foreground mt-2 text-center">
                              Enter your exact balance including centavos (e.g., 1234.56)
                            </p>
                          </div>
                          
                          <Button 
                            onClick={handleVerifyBalance}
                            disabled={verifying || !balanceInput.trim()}
                            className="w-full h-12 bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600"
                            data-testid="button-verify-balance"
                          >
                            {verifying ? (
                              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...</>
                            ) : (
                              <><LinkIcon className="mr-2 h-4 w-4" /> Connect Account</>
                            )}
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm">
                            <Mail className="h-4 w-4 inline mr-2" />
                            Login to your 747Live account and check your messages for the verification code.
                          </div>
                          
                          <div className="flex justify-center py-6">
                            <InputOTP maxLength={6} value={otp} onChange={setOtp} data-testid="input-otp">
                              <InputOTPGroup>
                                <InputOTPSlot index={0} className="h-14 w-12 text-2xl" />
                                <InputOTPSlot index={1} className="h-14 w-12 text-2xl" />
                                <InputOTPSlot index={2} className="h-14 w-12 text-2xl" />
                                <InputOTPSlot index={3} className="h-14 w-12 text-2xl" />
                                <InputOTPSlot index={4} className="h-14 w-12 text-2xl" />
                                <InputOTPSlot index={5} className="h-14 w-12 text-2xl" />
                              </InputOTPGroup>
                            </InputOTP>
                          </div>
                          
                          <Button 
                            onClick={handleVerifyOtp}
                            disabled={verifying || otp.length !== 6}
                            className="w-full h-12 bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600"
                            data-testid="button-verify-otp"
                          >
                            {verifying ? (
                              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...</>
                            ) : (
                              <><LinkIcon className="mr-2 h-4 w-4" /> Connect Account</>
                            )}
                          </Button>
                          
                          <Button 
                            variant="ghost"
                            onClick={handleSendOtp}
                            disabled={sendingOtp}
                            className="w-full"
                            data-testid="button-resend-otp"
                          >
                            {sendingOtp ? "Sending..." : "Resend Code"}
                          </Button>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Why Connect?
                </h4>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    <span>Instant deposits - buy casino chips with PHPT</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    <span>Quick withdrawals - convert chips back to PHPT</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    <span>1:1 exchange rate with no hidden fees</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    <span>Secure OTP verification protects your account</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* PIN Verification Dialog */}
      <Dialog open={showPinDialog} onOpenChange={(open) => {
        if (!open) {
          setShowPinDialog(false);
          setPin("");
          setPendingAction(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center pb-2">
            <div className="mx-auto h-14 w-14 rounded-full bg-gradient-to-br from-rose-500/20 to-orange-500/20 flex items-center justify-center mb-3">
              {pendingAction === "deposit" ? (
                <ArrowDownToLine className="h-7 w-7 text-rose-500" />
              ) : (
                <ArrowUpFromLine className="h-7 w-7 text-green-500" />
              )}
            </div>
            <DialogTitle className="text-xl">
              Confirm {pendingAction === "deposit" ? "Deposit" : "Withdrawal"}
            </DialogTitle>
            <DialogDescription>Enter your PIN to continue</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Amount Display */}
            <div className="text-center p-4 rounded-xl bg-gradient-to-br from-rose-500/10 to-orange-500/10 border border-rose-500/20">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                {pendingAction === "deposit" ? "Buying Chips" : "Selling Chips"}
              </p>
              <p className="text-3xl font-bold text-rose-600">
                ₱{parseFloat(pendingAction === "deposit" ? depositAmount : withdrawAmount || "0").toLocaleString()}
              </p>
              <Badge variant="outline" className="mt-2">
                {pendingAction === "deposit" ? "PHPT → Chips" : "Chips → PHPT"}
              </Badge>
            </div>

            {/* PIN Input */}
            <div className="p-4 rounded-xl bg-secondary/30 border">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">Enter your 6-digit PIN</p>
              </div>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={pin} onChange={setPin}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} className="h-11 w-10" />
                    <InputOTPSlot index={1} className="h-11 w-10" />
                    <InputOTPSlot index={2} className="h-11 w-10" />
                    <InputOTPSlot index={3} className="h-11 w-10" />
                    <InputOTPSlot index={4} className="h-11 w-10" />
                    <InputOTPSlot index={5} className="h-11 w-10" />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Important</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {pendingAction === "deposit"
                    ? "PHPT will be deducted from your wallet to buy casino chips."
                    : "Casino chips will be sold and PHPT credited to your wallet."}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-3 sm:gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setShowPinDialog(false);
                setPin("");
                setPendingAction(null);
              }}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600"
              onClick={handleConfirmTransaction}
              disabled={processing || pin.length !== 6}
            >
              {processing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : pendingAction === "deposit" ? (
                <ArrowDownToLine className="mr-2 h-4 w-4" />
              ) : (
                <ArrowUpFromLine className="mr-2 h-4 w-4" />
              )}
              {processing ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
