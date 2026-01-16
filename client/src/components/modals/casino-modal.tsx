import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Gamepad2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  CheckCircle,
  AlertCircle,
  Wallet,
  RefreshCw,
  Link2,
  Unlink,
  Shield,
  Lock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAuthToken } from "@/lib/api";
import { formatPeso, cn } from "@/lib/utils";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";

interface CasinoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CasinoModal({ open, onOpenChange }: CasinoModalProps) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  const [phptBalance, setPhptBalance] = useState(0);
  const [casinoBalance, setCasinoBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [casinoConnected, setCasinoConnected] = useState(false);
  const [assignedAgent, setAssignedAgent] = useState<string | null>(null);
  const [isAgent, setIsAgent] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  // PIN verification state
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pendingAmount, setPendingAmount] = useState<number>(0);

  const getAuthHeaders = useCallback(() => {
    const token = getAuthToken();
    return { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
  }, []);

  const fetchBalances = useCallback(async () => {
    setBalanceLoading(true);
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
      if (casinoData.success) {
        setCasinoConnected(casinoData.connected);
        setCasinoBalance(casinoData.balance);
        setDemoMode(casinoData.demoMode || false);
        if (casinoData.username) {
          setUsername(casinoData.username);
        }
        if (casinoData.assignedAgent) {
          setAssignedAgent(casinoData.assignedAgent);
        }
        if (casinoData.isAgent !== undefined) {
          setIsAgent(casinoData.isAgent);
        }
      }
    } catch (error) {
      console.error("Failed to fetch balances:", error);
    } finally {
      setBalanceLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (open) {
      fetchBalances();
      setSuccess(false);
      setAmount("");
      setPin("");
      setPinError(null);
      setShowPinDialog(false);
    }
  }, [open, fetchBalances]);

  const handleConnectRedirect = () => {
    onOpenChange(false);
    navigate("/casino-connect");
  };

  const handleDisconnect = async () => {
    try {
      const response = await fetch("/api/casino/disconnect", {
        method: "POST",
        headers: getAuthHeaders()
      });

      const data = await response.json();
      
      if (data.success) {
        setCasinoConnected(false);
        setCasinoBalance(null);
        setAssignedAgent(null);
        setUsername("");
        toast({ title: "Disconnected", description: "Casino account unlinked" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Step 1: Validate and show PIN dialog
  const handleTransaction = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid amount", variant: "destructive" });
      return;
    }

    const parsedAmount = parseFloat(amount);

    if (activeTab === "deposit" && parsedAmount > phptBalance) {
      toast({ title: "Insufficient Balance", description: "Not enough PHPT balance", variant: "destructive" });
      return;
    }

    // Note: We don't validate casino balance on frontend since it's not reliable/real-time
    // The backend will verify the actual casino balance via 747 API

    // Store amount and show PIN dialog
    setPendingAmount(parsedAmount);
    setPin("");
    setPinError(null);
    setShowPinDialog(true);
  };

  // Step 2: Execute transaction with PIN
  const handleConfirmTransaction = async () => {
    if (pin.length !== 6) {
      setPinError("Please enter your 6-digit PIN");
      return;
    }

    setLoading(true);
    let shouldCloseDialog = true;

    try {
      const endpoint = activeTab === "deposit" ? "/api/casino/deposit" : "/api/casino/withdraw";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ amount: pendingAmount, pin })
      });

      const data = await response.json();

      if (data.success) {
        setShowPinDialog(false);
        setSuccess(true);
        toast({
          title: activeTab === "deposit" ? "Deposit Successful" : "Withdrawal Successful",
          description: `${formatPeso(pendingAmount)} has been ${activeTab === "deposit" ? "deposited to" : "withdrawn from"} your casino account`
        });
        fetchBalances();
      } else {
        // Handle PIN-related errors
        if (data.requiresPin || data.needsPinSetup || data.message?.toLowerCase().includes("pin")) {
          shouldCloseDialog = false;
          setPinError(data.message || "Invalid PIN");
          setPin("");

          if (data.needsPinSetup) {
            toast({
              title: "PIN Required",
              description: "Please set up your PIN in Settings first",
              variant: "destructive"
            });
          }
        } else {
          throw new Error(data.message || "Transaction failed");
        }
      }
    } catch (error: any) {
      toast({
        title: "Transaction Failed",
        description: error.message || "Please try again",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      if (shouldCloseDialog) {
        setShowPinDialog(false);
      }
    }
  };

  const quickAmounts = [100, 500, 1000, 5000];

  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold mb-2">
              {activeTab === "deposit" ? "Deposit Complete!" : "Withdrawal Complete!"}
            </h3>
            <p className="text-muted-foreground mb-6">
              {formatPeso(parseFloat(amount))} has been {activeTab === "deposit" ? "added to" : "withdrawn from"} your 747 Live account
            </p>
            <Button onClick={() => { setSuccess(false); setAmount(""); }} className="w-full">
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-rose-500/20 to-orange-500/20">
              <Gamepad2 className="h-5 w-5 text-rose-500" />
            </div>
            747 Live Casino
            {demoMode && (
              <Badge variant="outline" className="ml-2 text-amber-600 border-amber-500/50 text-xs">
                Demo
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {demoMode && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs mb-2">
            <p className="font-medium">Demo Mode Active</p>
            <p className="text-amber-600 dark:text-amber-500">API credentials not configured. Transactions are simulated.</p>
          </div>
        )}

        {/* Not Connected State */}
        {!casinoConnected && !balanceLoading && (
          <div className="space-y-4">
            <div className="p-6 rounded-lg bg-gradient-to-br from-rose-500/10 to-orange-500/10 border border-rose-500/20 text-center">
              <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                <Link2 className="h-8 w-8 text-rose-500" />
              </div>
              <p className="font-semibold mb-2">Connect Your 747 Account</p>
              <p className="text-sm text-muted-foreground mb-4">
                Link your 747Live casino account to deposit and withdraw using PHPT
              </p>
              
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 text-xs mb-4">
                <Shield className="h-4 w-4 inline mr-2" />
                Secure OTP verification required
              </div>

              <Button 
                onClick={handleConnectRedirect}
                className="w-full h-12 bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600"
                data-testid="button-connect-casino"
              >
                <Link2 className="mr-2 h-4 w-4" />
                Connect 747 Account
              </Button>
            </div>
          </div>
        )}

        {/* Connected State */}
        {casinoConnected && (
          <>
            {/* Balance Cards */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Card className="border-primary/20">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Wallet className="h-4 w-4 text-primary" />
                    <span className="text-xs text-muted-foreground">PayVerse</span>
                  </div>
                  <p className="font-bold text-lg" data-testid="text-phpt-balance">
                    {balanceLoading ? "..." : formatPeso(phptBalance)}
                  </p>
                </CardContent>
              </Card>
              
              <Card className="border-rose-500/20">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Gamepad2 className="h-4 w-4 text-rose-500" />
                    <span className="text-xs text-muted-foreground">Casino</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-5 w-5 ml-auto"
                      onClick={() => fetchBalances()}
                      disabled={balanceLoading}
                    >
                      <RefreshCw className={cn("h-3 w-3", balanceLoading && "animate-spin")} />
                    </Button>
                  </div>
                  <p className="font-bold text-lg" data-testid="text-casino-balance">
                    {balanceLoading ? "..." : casinoBalance !== null ? formatPeso(casinoBalance) : "—"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Connected Account Info */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20 mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">{username}</p>
                  <p className="text-xs text-green-600/70">via {assignedAgent}</p>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleDisconnect}
                className="text-muted-foreground hover:text-destructive"
              >
                <Unlink className="h-4 w-4" />
              </Button>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "deposit" | "withdraw")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="deposit" className="flex items-center gap-2">
                  <ArrowDownToLine className="h-4 w-4" />
                  Deposit
                </TabsTrigger>
                <TabsTrigger value="withdraw" className="flex items-center gap-2">
                  <ArrowUpFromLine className="h-4 w-4" />
                  Withdraw
                </TabsTrigger>
              </TabsList>

              <TabsContent value="deposit" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Amount to Deposit</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="text-2xl font-bold h-14"
                    data-testid="input-deposit-amount"
                  />
                  <div className="flex gap-2 flex-wrap">
                    {quickAmounts.map((qa) => (
                      <Button
                        key={qa}
                        variant="outline"
                        size="sm"
                        onClick={() => setAmount(qa.toString())}
                        className="flex-1"
                      >
                        ₱{qa.toLocaleString()}
                      </Button>
                    ))}
                  </div>
                </div>

                <Button 
                  onClick={handleTransaction} 
                  disabled={loading || !amount}
                  className="w-full h-12 bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600"
                  data-testid="button-deposit-casino"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Deposit to Casino"}
                </Button>
              </TabsContent>

              <TabsContent value="withdraw" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Amount to Withdraw</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="text-2xl font-bold h-14"
                    data-testid="input-withdraw-amount"
                  />
                  <div className="flex gap-2 flex-wrap">
                    {quickAmounts.map((qa) => (
                      <Button
                        key={qa}
                        variant="outline"
                        size="sm"
                        onClick={() => setAmount(qa.toString())}
                        className="flex-1"
                      >
                        ₱{qa.toLocaleString()}
                      </Button>
                    ))}
                  </div>
                </div>

                <Button 
                  onClick={handleTransaction} 
                  disabled={loading || !amount}
                  className="w-full h-12"
                  data-testid="button-withdraw-casino"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Withdraw from Casino"}
                </Button>
              </TabsContent>
            </Tabs>

            {/* Info */}
            <div className="mt-4 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground space-y-1">
              <p className="flex items-center gap-2">
                <AlertCircle className="h-3 w-3" />
                Minimum: ₱100 | Maximum: ₱50,000 per transaction
              </p>
              <p>Processing time: Instant for deposits, 1-5 minutes for withdrawals</p>
            </div>
          </>
        )}

        {balanceLoading && !casinoConnected && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
      </DialogContent>

      {/* PIN Verification Dialog */}
      <Dialog open={showPinDialog} onOpenChange={(open) => {
        if (!open && !loading) {
          setShowPinDialog(false);
          setPin("");
          setPinError(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Enter PIN to Confirm
            </DialogTitle>
            <DialogDescription>
              Enter your 6-digit PIN to {activeTab === "deposit" ? "deposit" : "withdraw"} {formatPeso(pendingAmount)}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-4">
            <InputOTP
              value={pin}
              onChange={(value) => {
                setPin(value);
                setPinError(null);
              }}
              maxLength={6}
              disabled={loading}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>

            {pinError && (
              <p className="text-sm text-destructive text-center">{pinError}</p>
            )}

            <div className="flex gap-3 w-full mt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowPinDialog(false);
                  setPin("");
                  setPinError(null);
                }}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleConfirmTransaction}
                disabled={loading || pin.length !== 6}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
