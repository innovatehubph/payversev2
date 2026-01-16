import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import AppLayout from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  RefreshCw, 
  ExternalLink, 
  AlertCircle, 
  CheckCircle2, 
  Send, 
  History, 
  Settings, 
  Coins,
  Smartphone,
  X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { getAuthToken } from "@/lib/api";
import { formatPhpt } from "@/lib/utils";
import telegramLogo from "@assets/IMG_7140_1765874653939.png";

export default function Crypto() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Connection and balance state
  const [connectionStatus, setConnectionStatus] = useState<any>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [phptBalance, setPhptBalance] = useState<string>("0");
  const [balanceLoading, setBalanceLoading] = useState(false);
  
  // Action states
  const [depositAmount, setDepositAmount] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);
  const [cashoutAmount, setCashoutAmount] = useState("");
  const [cashoutLoading, setCashoutLoading] = useState(false);
  const [sendAmount, setSendAmount] = useState("");
  const [sendRecipient, setSendRecipient] = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  
  // Withdrawal confirmation dialog state
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [withdrawInvoice, setWithdrawInvoice] = useState<{
    amount: number;
    invoiceId: string;
    invoiceCode: string;
    telegramLink: string;
    voucherCode?: string;
  } | null>(null);
  const [cancellingWithdraw, setCancellingWithdraw] = useState(false);
  
  // History state
  const [statement, setStatement] = useState<any[]>([]);
  const [statementLoading, setStatementLoading] = useState(false);

  const getAuthHeaders = useCallback(() => {
    const token = getAuthToken();
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };
  }, []);

  // Fetch balance from PayGram API (single source of truth)
  const fetchBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const response = await fetch("/api/wallet/balance", { 
        headers: getAuthHeaders() 
      });
      const data = await response.json();
      if (data.success) {
        setPhptBalance(data.phptBalance || "0");
      }
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    } finally {
      setBalanceLoading(false);
    }
  }, [getAuthHeaders]);

  // Check connection status
  const checkConnectionStatus = useCallback(async () => {
    if (!user) return;
    
    setStatusLoading(true);
    try {
      const response = await fetch("/api/crypto/status", {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      setConnectionStatus(data);
      
      if (data.connected && data.isValid) {
        await fetchBalance();
      }
    } catch (error) {
      console.error("Failed to check connection status:", error);
    } finally {
      setStatusLoading(false);
    }
  }, [user, getAuthHeaders, fetchBalance]);

  // Fetch transaction history
  const fetchStatement = async () => {
    setStatementLoading(true);
    try {
      const response = await fetch("/api/crypto/statement", { headers: getAuthHeaders() });
      const data = await response.json();
      if (data.success && data.transactions) {
        setStatement(data.transactions);
      }
    } catch (error) {
      console.error("Failed to fetch statement:", error);
    } finally {
      setStatementLoading(false);
    }
  };

  useEffect(() => {
    checkConnectionStatus();
  }, [checkConnectionStatus]);

  // Top-up handler
  const handleTopUp = async () => {
    if (!depositAmount || parseFloat(depositAmount) < 1) {
      toast({ title: "Invalid Amount", description: "Minimum top-up is 1 PHPT", variant: "destructive" });
      return;
    }

    setDepositLoading(true);
    try {
      const response = await fetch("/api/crypto/direct-topup", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ amount: parseFloat(depositAmount) })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({ 
          title: "Top-up Successful!", 
          description: `${data.amount} PHPT added to your wallet` 
        });
        setDepositAmount("");
        await fetchBalance();
      } else {
        toast({ title: "Top-up Failed", description: data.message || "Please try again", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to process top-up", variant: "destructive" });
    } finally {
      setDepositLoading(false);
    }
  };

  // Withdraw - Step 1: Create invoice and show confirmation dialog
  const handleWithdraw = async () => {
    const amount = parseFloat(cashoutAmount);
    const balance = parseFloat(phptBalance);
    
    if (!cashoutAmount || amount < 1) {
      toast({ title: "Invalid Amount", description: "Minimum withdrawal is 1 PHPT", variant: "destructive" });
      return;
    }
    
    if (amount > balance) {
      toast({ title: "Insufficient Balance", description: "You don't have enough PHPT", variant: "destructive" });
      return;
    }

    setCashoutLoading(true);
    try {
      const response = await fetch("/api/crypto/cashout", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ amount })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Store invoice details and open confirmation dialog
        setWithdrawInvoice({
          amount: data.amount,
          invoiceId: data.invoiceId,
          invoiceCode: data.invoiceCode,
          telegramLink: data.telegramLink,
          voucherCode: data.voucherCode
        });
        setWithdrawDialogOpen(true);
        setCashoutAmount("");
      } else {
        toast({ title: "Withdrawal Failed", description: data.message || "Please try again", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to process withdrawal", variant: "destructive" });
    } finally {
      setCashoutLoading(false);
    }
  };

  // Withdraw - Confirm (user clicks Telegram link)
  const handleWithdrawConfirm = () => {
    if (withdrawInvoice?.telegramLink) {
      window.open(withdrawInvoice.telegramLink, "_blank");
      toast({ 
        title: "Opening Telegram", 
        description: "Complete the claim in the PayGram bot" 
      });
      setWithdrawDialogOpen(false);
      setWithdrawInvoice(null);
      fetchBalance();
    }
  };

  // Withdraw - Cancel (mark as failed)
  const handleWithdrawCancel = async () => {
    if (!withdrawInvoice) {
      setWithdrawDialogOpen(false);
      return;
    }

    setCancellingWithdraw(true);
    try {
      const response = await fetch("/api/crypto/cancel-withdrawal", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ 
          invoiceId: withdrawInvoice.invoiceId,
          amount: withdrawInvoice.amount
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({ 
          title: "Withdrawal Cancelled", 
          description: "The withdrawal has been cancelled" 
        });
      } else {
        toast({ 
          title: "Cancelled", 
          description: "Withdrawal was not completed" 
        });
      }
    } catch (error) {
      console.error("Failed to cancel withdrawal:", error);
    } finally {
      setCancellingWithdraw(false);
      setWithdrawDialogOpen(false);
      setWithdrawInvoice(null);
      fetchBalance();
    }
  };

  // Send P2P handler
  const handleSend = async () => {
    const amount = parseFloat(sendAmount);
    const balance = parseFloat(phptBalance);
    
    if (!sendAmount || amount < 1) {
      toast({ title: "Invalid Amount", description: "Minimum send is 1 PHPT", variant: "destructive" });
      return;
    }
    
    if (!sendRecipient.trim()) {
      toast({ title: "Recipient Required", description: "Enter a PayGram username", variant: "destructive" });
      return;
    }
    
    if (amount > balance) {
      toast({ title: "Insufficient Balance", description: "You don't have enough PHPT", variant: "destructive" });
      return;
    }

    setSendLoading(true);
    try {
      const response = await fetch("/api/crypto/send-paygram", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          recipientId: sendRecipient.trim(),
          amount,
          note: `Sent to: ${sendRecipient.trim()}`
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({ title: "Transfer Successful!", description: `Sent ${sendAmount} PHPT to ${sendRecipient}` });
        setSendAmount("");
        setSendRecipient("");
        await fetchBalance();
      } else {
        toast({ title: "Transfer Failed", description: data.message || "Please try again", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to send", variant: "destructive" });
    } finally {
      setSendLoading(false);
    }
  };

  if (statusLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center py-24">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  const isConnected = connectionStatus?.connected;
  const currentBalance = parseFloat(phptBalance);

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-display font-bold">PHPT Wallet</h1>
            <p className="text-sm text-muted-foreground">
              {isConnected ? (
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  Connected
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  Not connected
                </span>
              )}
            </p>
          </div>
          {isConnected && (
            <Button 
              variant="outline" 
              size="icon" 
              onClick={fetchBalance} 
              disabled={balanceLoading}
              data-testid="button-refresh-balance"
            >
              <RefreshCw className={`h-4 w-4 ${balanceLoading ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </header>

        {/* Connection Banner */}
        {!isConnected && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                    <Smartphone className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium text-amber-900">Connect Telegram Wallet</p>
                    <p className="text-sm text-amber-700">Link your PayGram account to get started</p>
                  </div>
                </div>
                <Link href="/profile">
                  <Button size="sm" data-testid="button-connect-wallet">
                    <Settings className="mr-2 h-4 w-4" />
                    Connect
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Balance Card */}
        {isConnected && (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardContent className="py-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-primary/10 mb-3">
                  <Coins className="h-7 w-7 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground mb-1">Available Balance</p>
                <p className="text-4xl font-bold tracking-tight" data-testid="text-phpt-balance">
                  {balanceLoading ? (
                    <span className="text-muted-foreground">Loading...</span>
                  ) : (
                    formatPhpt(currentBalance)
                  )}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  ≈ ₱{currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Tabs */}
        <Tabs 
          defaultValue="topup" 
          className="w-full" 
          onValueChange={(value) => { 
            if (value === "history") fetchStatement(); 
          }}
        >
          <TabsList className="grid w-full grid-cols-4 h-12">
            <TabsTrigger value="topup" className="gap-1.5" data-testid="tab-topup">
              <ArrowDownLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Top-up</span>
            </TabsTrigger>
            <TabsTrigger value="withdraw" className="gap-1.5" data-testid="tab-withdraw">
              <ArrowUpRight className="h-4 w-4" />
              <span className="hidden sm:inline">Cashout</span>
            </TabsTrigger>
            <TabsTrigger value="send" className="gap-1.5" data-testid="tab-send">
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Send</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5" data-testid="tab-history">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">History</span>
            </TabsTrigger>
          </TabsList>

          {/* Top-up Tab */}
          <TabsContent value="topup" className="mt-4">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ArrowDownLeft className="h-5 w-5 text-green-500" />
                  Add PHPT to Wallet
                </CardTitle>
                <CardDescription>
                  Transfer PHPT from your Telegram PayGram wallet
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isConnected ? (
                  <div className="text-center py-6">
                    <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                    <p className="text-muted-foreground mb-4">Connect your Telegram wallet to top up</p>
                    <Link href="/profile">
                      <Button data-testid="button-connect-topup">
                        <Settings className="mr-2 h-4 w-4" />
                        Connect Wallet
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 border border-blue-100">
                      <img src={telegramLogo} alt="Telegram" className="w-8 h-8 rounded-full" />
                      <div className="text-sm">
                        <p className="font-medium text-blue-900">From Telegram PayGram</p>
                        <p className="text-blue-700">Instant transfer via @opgmbot</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="topup-amount">Amount (PHPT)</Label>
                      <Input
                        id="topup-amount"
                        type="number"
                        placeholder="Enter amount (min. 1)"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        min="1"
                        step="1"
                        className="text-lg"
                        data-testid="input-topup-amount"
                      />
                      {depositAmount && parseFloat(depositAmount) > 0 && (
                        <p className="text-sm text-muted-foreground">
                          ≈ ₱{parseFloat(depositAmount).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <Button 
                      onClick={handleTopUp}
                      disabled={depositLoading || !depositAmount || parseFloat(depositAmount) < 1}
                      className="w-full h-12 text-base"
                      data-testid="button-topup"
                    >
                      {depositLoading ? (
                        <><RefreshCw className="mr-2 h-5 w-5 animate-spin" />Processing...</>
                      ) : (
                        <><ArrowDownLeft className="mr-2 h-5 w-5" />Add {depositAmount || "0"} PHPT</>
                      )}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Withdraw Tab */}
          <TabsContent value="withdraw" className="mt-4">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ArrowUpRight className="h-5 w-5 text-orange-500" />
                  Cashout to Your Telegram
                </CardTitle>
                <CardDescription>
                  Withdraw PHPT to your own Telegram PayGram wallet
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isConnected ? (
                  <div className="text-center py-6">
                    <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                    <p className="text-muted-foreground mb-4">Connect your Telegram wallet to withdraw</p>
                    <Link href="/profile">
                      <Button data-testid="button-connect-withdraw">
                        <Settings className="mr-2 h-4 w-4" />
                        Connect Wallet
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="p-3 rounded-lg bg-muted/50 border">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Available Balance</span>
                        <span className="font-semibold" data-testid="text-withdraw-balance">
                          {formatPhpt(currentBalance)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="withdraw-amount">Amount (PHPT)</Label>
                      <Input
                        id="withdraw-amount"
                        type="number"
                        placeholder="Enter amount (min. 1)"
                        value={cashoutAmount}
                        onChange={(e) => setCashoutAmount(e.target.value)}
                        min="1"
                        max={phptBalance}
                        step="1"
                        className="text-lg"
                        data-testid="input-withdraw-amount"
                      />
                    </div>

                    <Button 
                      onClick={handleWithdraw}
                      disabled={cashoutLoading || !cashoutAmount || parseFloat(cashoutAmount) < 1 || parseFloat(cashoutAmount) > currentBalance}
                      className="w-full h-12 text-base"
                      variant="secondary"
                      data-testid="button-withdraw"
                    >
                      {cashoutLoading ? (
                        <><RefreshCw className="mr-2 h-5 w-5 animate-spin" />Creating withdrawal...</>
                      ) : (
                        <><ArrowUpRight className="mr-2 h-5 w-5" />Withdraw {cashoutAmount || "0"} PHPT</>
                      )}
                    </Button>

                    <p className="text-xs text-center text-muted-foreground">
                      You'll receive a link to claim PHPT in Telegram
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Send Tab */}
          <TabsContent value="send" className="mt-4">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Send className="h-5 w-5 text-blue-500" />
                  Send PHPT
                </CardTitle>
                <CardDescription>
                  Transfer PHPT to another PayGram user
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isConnected ? (
                  <div className="text-center py-6">
                    <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                    <p className="text-muted-foreground mb-4">Connect your Telegram wallet to send</p>
                    <Link href="/profile">
                      <Button data-testid="button-connect-send">
                        <Settings className="mr-2 h-4 w-4" />
                        Connect Wallet
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="p-3 rounded-lg bg-muted/50 border">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Available Balance</span>
                        <span className="font-semibold" data-testid="text-send-balance">
                          {formatPhpt(currentBalance)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="send-recipient">Recipient PayGram ID</Label>
                      <Input
                        id="send-recipient"
                        type="text"
                        placeholder="Enter recipient's PayGram username"
                        value={sendRecipient}
                        onChange={(e) => setSendRecipient(e.target.value)}
                        data-testid="input-send-recipient"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="send-amount">Amount (PHPT)</Label>
                      <Input
                        id="send-amount"
                        type="number"
                        placeholder="Enter amount (min. 1)"
                        value={sendAmount}
                        onChange={(e) => setSendAmount(e.target.value)}
                        min="1"
                        max={phptBalance}
                        step="1"
                        className="text-lg"
                        data-testid="input-send-amount"
                      />
                    </div>

                    <Button 
                      onClick={handleSend}
                      disabled={sendLoading || !sendAmount || parseFloat(sendAmount) < 1 || !sendRecipient.trim() || parseFloat(sendAmount) > currentBalance}
                      className="w-full h-12 text-base"
                      data-testid="button-send"
                    >
                      {sendLoading ? (
                        <><RefreshCw className="mr-2 h-5 w-5 animate-spin" />Sending...</>
                      ) : (
                        <><Send className="mr-2 h-5 w-5" />Send {sendAmount || "0"} PHPT</>
                      )}
                    </Button>

                    <p className="text-xs text-center text-muted-foreground">
                      Transfers are instant and cannot be reversed
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <History className="h-5 w-5 text-gray-500" />
                    Transaction History
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={fetchStatement}
                    disabled={statementLoading}
                  >
                    <RefreshCw className={`h-4 w-4 ${statementLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {statementLoading ? (
                  <div className="flex justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : statement.length === 0 ? (
                  <div className="text-center py-8">
                    <History className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-muted-foreground">No transactions yet</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {statement.map((tx, i) => (
                      <div 
                        key={i} 
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          tx.status === 'failed' || tx.status === 'cancelled' 
                            ? 'bg-red-50/50 border-red-200' 
                            : 'bg-muted/30'
                        }`}
                        data-testid={`transaction-${i}`}
                      >
                        <div>
                          <p className="font-medium text-sm">{tx.type || tx.transactionType}</p>
                          <p className="text-xs text-muted-foreground">
                            {tx.date ? new Date(tx.date).toLocaleDateString() : tx.createdAt}
                          </p>
                          {(tx.status === 'failed' || tx.status === 'cancelled') && (
                            <span className="text-xs text-red-600 font-medium">Cancelled</span>
                          )}
                        </div>
                        <div className="text-right">
                          <p className={`font-semibold ${
                            tx.status === 'failed' || tx.status === 'cancelled' 
                              ? 'text-red-600 line-through' 
                              : tx.amount > 0 ? 'text-green-600' : ''
                          }`}>
                            {tx.amount > 0 ? '+' : ''}{tx.amount} PHPT
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground">
            Powered by{" "}
            <a 
              href="https://paygr.am" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              PayGram
            </a>
            {" "}• PHPT = Philippine Peso (1:1)
          </p>
        </div>
      </div>

      {/* Withdrawal Confirmation Dialog */}
      <Dialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5 text-orange-500" />
              Confirm Withdrawal
            </DialogTitle>
            <DialogDescription>
              Your withdrawal is ready. Click the button below to claim your PHPT in Telegram.
            </DialogDescription>
          </DialogHeader>
          
          {withdrawInvoice && (
            <div className="space-y-4 py-4">
              {/* Invoice Info */}
              <div className="p-4 rounded-lg bg-orange-50 border border-orange-200">
                <div className="text-center mb-3">
                  <p className="text-sm text-orange-700 mb-1">Withdrawal Amount</p>
                  <p className="text-3xl font-bold text-orange-900">
                    {withdrawInvoice.amount} PHPT
                  </p>
                  <p className="text-sm text-orange-600 mt-1">
                    ≈ ₱{withdrawInvoice.amount.toLocaleString()}
                  </p>
                </div>
                
                <div className="pt-3 border-t border-orange-200 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-orange-700">Invoice ID</span>
                    <span className="font-mono text-xs text-orange-800">
                      {withdrawInvoice.invoiceCode?.substring(0, 12) || withdrawInvoice.invoiceId.substring(0, 12)}...
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-orange-700">Destination</span>
                    <span className="text-orange-800">Telegram @opgmbot</span>
                  </div>
                  <div className="text-xs mt-2 p-2 bg-gray-100 rounded break-all">
                    <span className="text-gray-500 block mb-1">Debug Link:</span>
                    <code className="text-gray-700">{withdrawInvoice.telegramLink}</code>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3">
                <a
                  href={withdrawInvoice.telegramLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleWithdrawConfirm}
                  className="inline-flex items-center justify-center gap-2 w-full h-12 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-base"
                  data-testid="button-confirm-telegram"
                >
                  <img src={telegramLogo} alt="" className="w-6 h-6 rounded-full" />
                  Claim in Telegram
                  <ExternalLink className="h-4 w-4" />
                </a>
                
                <Button
                  variant="outline"
                  onClick={handleWithdrawCancel}
                  disabled={cancellingWithdraw}
                  className="w-full h-11"
                  data-testid="button-cancel-withdraw"
                >
                  {cancellingWithdraw ? (
                    <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Cancelling...</>
                  ) : (
                    <><X className="mr-2 h-4 w-4" />Cancel Withdrawal</>
                  )}
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                Clicking cancel will mark this withdrawal as failed
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
