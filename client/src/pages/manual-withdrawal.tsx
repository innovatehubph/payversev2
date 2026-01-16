import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  Wallet,
  ArrowLeft,
  Plus,
  Loader2,
  Building2,
  Smartphone,
  CreditCard,
  Lock,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  ArrowUpRight,
  RefreshCw,
  Coins,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAuthToken } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatPeso } from "@/lib/utils";
import { initSocket, onWithdrawalUpdate, disconnectSocket } from "@/lib/socket";

interface BankAccount {
  id: number;
  accountType: string;
  bankName: string | null;
  accountNumber: string;
  accountName: string;
  isDefault: boolean;
}

interface WithdrawalRequest {
  id: number;
  amount: string;
  status: string;
  createdAt: string;
  processedAt: string | null;
  completedAt: string | null;
  rejectionReason: string | null;
  bankAccount: BankAccount | null;
}

export default function ManualWithdrawal() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [phptBalance, setPhptBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pin, setPin] = useState("");

  const getAuthHeaders = useCallback(() => {
    const token = getAuthToken();
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  }, []);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const [accountsRes, withdrawalsRes, balanceRes] = await Promise.all([
        fetch("/api/manual/bank-accounts", { headers: getAuthHeaders() }),
        fetch("/api/manual/withdrawals/my", { headers: getAuthHeaders() }),
        fetch("/api/wallet/balance", { headers: getAuthHeaders() }),
      ]);

      const accountsData = await accountsRes.json();
      const withdrawalsData = await withdrawalsRes.json();
      const balanceData = await balanceRes.json();

      if (Array.isArray(accountsData)) {
        setAccounts(accountsData);
        // Set default account as selected
        const defaultAccount = accountsData.find((a: BankAccount) => a.isDefault);
        if (defaultAccount && !selectedAccountId) {
          setSelectedAccountId(defaultAccount.id.toString());
        }
      }

      if (Array.isArray(withdrawalsData)) {
        setWithdrawals(withdrawalsData);
      }

      if (balanceData.success) {
        setPhptBalance(parseFloat(balanceData.phptBalance) || 0);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getAuthHeaders, selectedAccountId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // WebSocket for real-time updates
  useEffect(() => {
    if (!user) return;

    const socket = initSocket(user.id);

    const unsubscribe = onWithdrawalUpdate((data) => {
      console.log("[Withdrawal] Real-time update:", data);
      // Update the specific withdrawal in the list
      setWithdrawals((prev) =>
        prev.map((w) => (w.id === data.id ? { ...w, ...data } : w))
      );

      // Show toast notification
      if (data.status === "processing") {
        toast({ title: "Withdrawal Processing", description: "Your withdrawal is being processed" });
      } else if (data.status === "completed") {
        toast({ title: "Withdrawal Completed", description: "Your funds have been sent!" });
      } else if (data.status === "rejected") {
        toast({ title: "Withdrawal Rejected", description: data.rejectionReason || "Your withdrawal was rejected", variant: "destructive" });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [user, toast]);

  const handleSubmitWithdrawal = () => {
    const withdrawAmount = parseFloat(amount);

    if (!selectedAccountId) {
      toast({ title: "Error", description: "Please select an account", variant: "destructive" });
      return;
    }

    if (!withdrawAmount || withdrawAmount < 1) {
      toast({ title: "Error", description: "Minimum withdrawal is ₱1", variant: "destructive" });
      return;
    }

    if (withdrawAmount > phptBalance) {
      toast({ title: "Error", description: "Insufficient balance", variant: "destructive" });
      return;
    }

    if (withdrawAmount > 50000) {
      toast({ title: "Error", description: "Maximum withdrawal is ₱50,000", variant: "destructive" });
      return;
    }

    setShowPinDialog(true);
  };

  const handleConfirmWithdrawal = async () => {
    if (pin.length !== 6) {
      toast({ title: "Error", description: "Please enter your 6-digit PIN", variant: "destructive" });
      return;
    }

    setProcessing(true);
    try {
      const response = await fetch("/api/manual/withdrawals", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          userBankAccountId: parseInt(selectedAccountId),
          amount: parseFloat(amount),
          pin,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({ title: "Success", description: "Withdrawal request submitted" });
        setShowPinDialog(false);
        setPin("");
        setAmount("");
        fetchData();
      } else {
        // Handle PIN errors
        if (data.attemptsRemaining !== undefined) {
          toast({ title: "Invalid PIN", description: data.message, variant: "destructive" });
          setPin("");
          return;
        }
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case "gcash":
      case "maya":
      case "grabpay":
        return Smartphone;
      case "bank":
        return Building2;
      default:
        return CreditCard;
    }
  };

  const getAccountLabel = (account: BankAccount) => {
    if (account.accountType === "bank" && account.bankName) {
      return `${account.bankName} - ${account.accountNumber}`;
    }
    return `${account.accountType.toUpperCase()} - ${account.accountNumber}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "processing":
        return <Badge className="bg-blue-500"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Processing</Badge>;
      case "completed":
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const selectedAccount = accounts.find((a) => a.id.toString() === selectedAccountId);

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto">
        <header className="mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="mb-2 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-bold">Manual Withdrawal</h1>
              <p className="text-muted-foreground">Request to withdraw PHPT to your bank or e-wallet</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => fetchData()} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Balance Card */}
            <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Available Balance</p>
                    <p className="text-3xl font-bold flex items-center gap-2">
                      <Coins className="h-6 w-6 text-primary" />
                      {formatPeso(phptBalance)}
                    </p>
                  </div>
                  <Wallet className="h-12 w-12 text-primary/30" />
                </div>
              </CardContent>
            </Card>

            {/* Withdrawal Form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Request Withdrawal</CardTitle>
                <CardDescription>Select account and enter amount to withdraw</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {accounts.length === 0 ? (
                  <div className="text-center py-6">
                    <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground mb-4">You need to add a bank or e-wallet account first</p>
                    <Button onClick={() => navigate("/bank-accounts")}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Account
                    </Button>
                  </div>
                ) : (
                  <>
                    <div>
                      <Label>Withdraw To</Label>
                      <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((account) => {
                            const Icon = getAccountIcon(account.accountType);
                            return (
                              <SelectItem key={account.id} value={account.id.toString()}>
                                <div className="flex items-center gap-2">
                                  <Icon className="h-4 w-4" />
                                  <span>{getAccountLabel(account)}</span>
                                  {account.isDefault && <Badge variant="secondary" className="text-xs ml-2">Default</Badge>}
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <Button variant="link" size="sm" className="px-0 mt-1" onClick={() => navigate("/bank-accounts")}>
                        <Plus className="h-3 w-3 mr-1" />
                        Add new account
                      </Button>
                    </div>

                    <div>
                      <Label>Amount (PHPT)</Label>
                      <Input
                        type="number"
                        placeholder="Enter amount"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        min="1"
                        max={phptBalance}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Min: ₱1 | Max: ₱50,000</p>
                    </div>

                    {selectedAccount && amount && parseFloat(amount) > 0 && (
                      <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Withdrawal Amount</span>
                          <span className="font-medium">{formatPeso(parseFloat(amount))}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Destination</span>
                          <span className="font-medium">{selectedAccount.accountType.toUpperCase()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Account</span>
                          <span className="font-medium">{selectedAccount.accountNumber}</span>
                        </div>
                      </div>
                    )}

                    <Button
                      className="w-full"
                      size="lg"
                      onClick={handleSubmitWithdrawal}
                      disabled={!selectedAccountId || !amount || parseFloat(amount) < 1}
                    >
                      <ArrowUpRight className="h-5 w-5 mr-2" />
                      Request Withdrawal
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Withdrawal History */}
            {withdrawals.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Withdrawals</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {withdrawals.slice(0, 5).map((withdrawal) => (
                      <div key={withdrawal.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
                            <ArrowUpRight className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-medium">{formatPeso(parseFloat(withdrawal.amount))}</p>
                            <p className="text-xs text-muted-foreground">
                              {withdrawal.bankAccount ? getAccountLabel(withdrawal.bankAccount) : "Unknown account"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(withdrawal.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          {getStatusBadge(withdrawal.status)}
                          {withdrawal.rejectionReason && (
                            <p className="text-xs text-destructive mt-1">{withdrawal.rejectionReason}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* PIN Dialog */}
        <Dialog open={showPinDialog} onOpenChange={(open) => { if (!open) { setShowPinDialog(false); setPin(""); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader className="text-center pb-2">
              <div className="mx-auto h-14 w-14 rounded-full bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center mb-3">
                <ArrowUpRight className="h-7 w-7 text-orange-500" />
              </div>
              <DialogTitle className="text-xl">Confirm Withdrawal</DialogTitle>
              <DialogDescription>Enter your PIN to submit the withdrawal request</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Amount Display */}
              <div className="text-center p-4 rounded-xl bg-gradient-to-br from-orange-500/10 to-amber-500/10 border border-orange-500/20">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Withdrawal Amount</p>
                <p className="text-3xl font-bold text-orange-600">{formatPeso(parseFloat(amount || "0"))}</p>
                {selectedAccount && (
                  <Badge variant="outline" className="mt-2">
                    {selectedAccount.accountType.toUpperCase()} - {selectedAccount.accountNumber}
                  </Badge>
                )}
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
                    PHPT will be deducted immediately. Admin will process your withdrawal manually.
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter className="flex gap-3 sm:gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { setShowPinDialog(false); setPin(""); }} disabled={processing}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
                onClick={handleConfirmWithdrawal}
                disabled={processing || pin.length !== 6}
              >
                {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUpRight className="mr-2 h-4 w-4" />}
                {processing ? "Processing..." : "Submit Request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
