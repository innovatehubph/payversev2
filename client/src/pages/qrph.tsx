import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import AppLayout from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  RefreshCw, 
  ExternalLink, 
  CheckCircle2,
  QrCode,
  Smartphone,
  Banknote,
  AlertCircle,
  Copy,
  Clock,
  Loader2,
  CheckCircle,
  XCircle,
  Home,
  PartyPopper
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { getAuthToken } from "@/lib/api";
import { formatPeso } from "@/lib/utils";
import { QRCodeSVG } from "qrcode.react";

type PaymentStatus = "pending" | "processing" | "success" | "failed" | "expired";

interface PaymentData {
  paymentUrl: string;
  transactionId: string;
  amount: number;
  qrphraw?: string;
}

const PROVIDER_COLORS = {
  gcash: { bg: "bg-[#007DFE]", text: "text-white", label: "GCash" },
  maya: { bg: "bg-[#00D063]", text: "text-white", label: "Maya" },
  grabpay: { bg: "bg-[#00B14F]", text: "text-white", label: "GrabPay" },
};

export default function QRPH() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  
  const [statusLoading, setStatusLoading] = useState(true);
  const [gatewayStatus, setGatewayStatus] = useState<{ configured: boolean; authenticated: boolean } | null>(null);
  
  const [cashinAmount, setCashinAmount] = useState("");
  const [cashinLoading, setCashinLoading] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("pending");
  const [statusMessage, setStatusMessage] = useState("Waiting for payment...");
  
  const [cashoutAmount, setCashoutAmount] = useState("");
  const [cashoutAccount, setCashoutAccount] = useState("");
  const [cashoutName, setCashoutName] = useState("");
  const [cashoutProvider, setCashoutProvider] = useState("gcash");
  const [cashoutLoading, setCashoutLoading] = useState(false);
  
  const [showSuccessPage, setShowSuccessPage] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(5);
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef(0);
  const paymentDataRef = useRef<PaymentData | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get("status") === "success") {
      setShowSuccessPage(true);
      toast({
        title: "Payment Received!",
        description: "Your PHPT balance is being credited",
      });
    }
  }, [searchString, toast]);

  useEffect(() => {
    if (showSuccessPage && redirectCountdown > 0) {
      const timer = setTimeout(() => {
        setRedirectCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (showSuccessPage && redirectCountdown === 0) {
      navigate("/dashboard");
    }
  }, [showSuccessPage, redirectCountdown, navigate]);

  const getAuthHeaders = useCallback(() => {
    const token = getAuthToken();
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };
  }, []);

  const checkStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const response = await fetch("/api/nexuspay/status", {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      setGatewayStatus(data);
    } catch (error) {
      console.error("Failed to check gateway status:", error);
    } finally {
      setStatusLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    pollCountRef.current = 0;
  }, []);

  const checkPaymentStatus = useCallback(async (transactionId: string) => {
    try {
      const response = await fetch(`/api/nexuspay/cashin-status/${transactionId}`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      
      const apiStatus = data.status?.toLowerCase() || data.transaction_state?.toLowerCase() || "pending";
      
      if (apiStatus === "success" || apiStatus === "paid" || apiStatus === "completed") {
        setPaymentStatus("success");
        setStatusMessage("Payment received!");
        stopPolling();
        const amount = paymentDataRef.current?.amount || data.amount || 0;
        toast({
          title: "Payment Successful!",
          description: `${formatPeso(amount)} has been added to your wallet`,
        });
      } else if (apiStatus === "failed" || apiStatus === "cancelled" || apiStatus === "rejected") {
        setPaymentStatus("failed");
        setStatusMessage("Payment failed or cancelled");
        stopPolling();
      } else if (apiStatus === "expired") {
        setPaymentStatus("expired");
        setStatusMessage("QR code has expired");
        stopPolling();
      } else if (apiStatus === "pending") {
        setPaymentStatus("pending");
        setStatusMessage("Waiting for payment...");
      } else {
        setPaymentStatus("processing");
        setStatusMessage("Processing payment...");
      }
    } catch (error) {
      console.error("Status check error:", error);
    }
  }, [getAuthHeaders, stopPolling, toast]);

  const startPolling = useCallback((transactionId: string) => {
    stopPolling();
    pollCountRef.current = 0;
    
    pollingRef.current = setInterval(() => {
      pollCountRef.current += 1;
      if (pollCountRef.current > 60) {
        setPaymentStatus("expired");
        setStatusMessage("Payment session expired");
        stopPolling();
        return;
      }
      checkPaymentStatus(transactionId);
    }, 5000);
  }, [checkPaymentStatus, stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleCashIn = async () => {
    const amount = parseFloat(cashinAmount);
    if (!cashinAmount || amount < 100) {
      toast({ title: "Invalid Amount", description: "Minimum amount is ₱100", variant: "destructive" });
      return;
    }

    // Check if user is logged in
    const token = getAuthToken();
    if (!token) {
      toast({ title: "Not Logged In", description: "Please log in to use this feature", variant: "destructive" });
      return;
    }

    setCashinLoading(true);
    try {
      const response = await fetch("/api/nexuspay/cashin", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ amount })
      });

      // Handle non-OK responses
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Server error" }));
        console.error("[QRPH] Cash-in error response:", response.status, errorData);
        toast({ 
          title: "Payment Failed", 
          description: errorData.message || `Server error (${response.status})`, 
          variant: "destructive" 
        });
        return;
      }

      const data = await response.json();
      console.log("[QRPH] Cash-in response:", data);

      if (data.success && data.paymentUrl) {
        const newPaymentData = {
          paymentUrl: data.paymentUrl,
          transactionId: data.transactionId,
          amount: data.amount,
          qrphraw: data.qrphraw || undefined
        };
        paymentDataRef.current = newPaymentData;
        setPaymentData(newPaymentData);
        setPaymentStatus("pending");
        setStatusMessage("Waiting for payment...");
        setPaymentDialog(true);
        setCashinAmount("");
        
        startPolling(data.transactionId);
      } else {
        toast({ 
          title: "Payment Failed", 
          description: data.message || "Could not create payment", 
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Payment processing failed", 
        variant: "destructive" 
      });
    } finally {
      setCashinLoading(false);
    }
  };

  const handleCashOut = async () => {
    const amount = parseFloat(cashoutAmount);
    if (!cashoutAmount || amount < 1) {
      toast({ title: "Invalid Amount", description: "Minimum payout is ₱1", variant: "destructive" });
      return;
    }

    if (!cashoutAccount.trim()) {
      toast({ title: "Account Required", description: "Enter your mobile number", variant: "destructive" });
      return;
    }

    setCashoutLoading(true);
    try {
      const response = await fetch("/api/nexuspay/cashout", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          amount,
          accountNumber: cashoutAccount.trim(),
          accountName: cashoutName.trim() || user?.fullName || "PayVerse User",
          provider: cashoutProvider
        })
      });

      const data = await response.json();

      if (data.success) {
        toast({ 
          title: "Payout Successful!", 
          description: `${formatPeso(data.amount)} sent to ${cashoutAccount} via ${data.gateway || cashoutProvider.toUpperCase()}`
        });
        setCashoutAmount("");
        setCashoutAccount("");
        setCashoutName("");
      } else {
        toast({ 
          title: "Payout Failed", 
          description: data.message || "Could not process payout", 
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Payout processing failed", 
        variant: "destructive" 
      });
    } finally {
      setCashoutLoading(false);
    }
  };

  const openPaymentPage = () => {
    if (paymentData?.paymentUrl) {
      window.open(paymentData.paymentUrl, "_blank");
    }
  };

  const copyTransactionId = async () => {
    if (paymentData?.transactionId) {
      try {
        await navigator.clipboard.writeText(paymentData.transactionId);
        toast({ title: "Copied!", description: "Transaction ID copied to clipboard" });
      } catch {
        toast({ 
          title: "Copy Failed", 
          description: `Transaction ID: ${paymentData.transactionId}`, 
          variant: "destructive" 
        });
      }
    }
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      stopPolling();
      paymentDataRef.current = null;
      setPaymentStatus("pending");
      setStatusMessage("Waiting for payment...");
    }
    setPaymentDialog(open);
  };

  if (showSuccessPage) {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto py-12">
          <Card className="border-0 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-8 text-white text-center">
              <div className="w-20 h-20 mx-auto mb-4 bg-white/20 rounded-full flex items-center justify-center">
                <PartyPopper className="h-10 w-10" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Payment Successful!</h1>
              <p className="text-white/80">Your PHPT balance is being credited</p>
            </div>
            
            <CardContent className="p-6 space-y-6 text-center">
              <div className="space-y-2">
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
                <p className="text-lg font-medium">Thank you for your payment</p>
                <p className="text-sm text-muted-foreground">
                  Your PHPT balance will be updated shortly at a 1:1 rate (₱1 = 1 PHPT)
                </p>
              </div>
              
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">
                  Redirecting to dashboard in <span className="font-bold text-primary">{redirectCountdown}</span> seconds...
                </p>
              </div>
              
              <Button 
                onClick={() => navigate("/dashboard")}
                className="w-full h-12 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                data-testid="button-go-dashboard"
              >
                <Home className="mr-2 h-5 w-5" />
                Go to Dashboard Now
              </Button>
              
              <Button 
                variant="outline"
                onClick={() => {
                  setShowSuccessPage(false);
                  setRedirectCountdown(5);
                  navigate("/qrph", { replace: true });
                }}
                className="w-full"
                data-testid="button-new-payment"
              >
                Make Another Payment
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (statusLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center py-24">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  const isReady = gatewayStatus?.configured && gatewayStatus?.authenticated;

  const StatusIcon = () => {
    switch (paymentStatus) {
      case "success":
        return <CheckCircle className="h-6 w-6 text-green-500" />;
      case "failed":
      case "expired":
        return <XCircle className="h-6 w-6 text-red-500" />;
      default:
        return <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />;
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-display font-bold">QRPH Wallet</h1>
            <p className="text-sm text-muted-foreground">
              {isReady ? (
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  Payment gateway ready
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  Gateway unavailable
                </span>
              )}
            </p>
          </div>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={checkStatus}
            data-testid="button-refresh-status"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </header>

        <Card className="border-0 bg-gradient-to-br from-blue-600 via-purple-600 to-green-500 text-white overflow-hidden">
          <CardContent className="py-6 relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />
            
            <div className="relative z-10">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <QrCode className="h-6 w-6" />
                </div>
              </div>
              
              <p className="text-center text-white/80 text-sm mb-3">Supported E-Wallets</p>
              
              <div className="flex justify-center gap-2 flex-wrap">
                {Object.entries(PROVIDER_COLORS).map(([key, value]) => (
                  <span
                    key={key}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold ${value.bg} ${value.text} shadow-lg`}
                  >
                    {value.label}
                  </span>
                ))}
              </div>
              
              <p className="text-center text-white/70 text-xs mt-4">
                Instant deposits & payouts via Philippine e-wallets
              </p>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="cashin" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-12">
            <TabsTrigger value="cashin" className="gap-1.5" data-testid="tab-cashin">
              <ArrowDownLeft className="h-4 w-4" />
              Cash In
            </TabsTrigger>
            <TabsTrigger value="cashout" className="gap-1.5" data-testid="tab-cashout">
              <ArrowUpRight className="h-4 w-4" />
              Cash Out
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cashin" className="mt-4">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ArrowDownLeft className="h-5 w-5 text-green-500" />
                  Add Funds via QR
                </CardTitle>
                <CardDescription>
                  Generate a QR code and scan with your e-wallet app
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isReady ? (
                  <div className="text-center py-6">
                    <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                    <p className="text-muted-foreground">Payment gateway is currently unavailable</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(PROVIDER_COLORS).map(([key, value]) => (
                        <div
                          key={key}
                          className={`p-3 rounded-lg ${value.bg} ${value.text} text-center`}
                        >
                          <Smartphone className="h-5 w-5 mx-auto mb-1" />
                          <p className="text-xs font-medium">{value.label}</p>
                        </div>
                      ))}
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="cashin-amount">Amount (PHP)</Label>
                      <Input
                        id="cashin-amount"
                        type="number"
                        placeholder="Enter amount (min. ₱100)"
                        value={cashinAmount}
                        onChange={(e) => setCashinAmount(e.target.value)}
                        min="100"
                        step="1"
                        className="text-lg h-12"
                        data-testid="input-cashin-amount"
                      />
                      {cashinAmount && parseFloat(cashinAmount) > 0 && (
                        <p className="text-sm text-muted-foreground">
                          You'll receive: <span className="font-semibold text-green-600">{formatPeso(parseFloat(cashinAmount))}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {[100, 500, 1000].map((preset) => (
                        <Button
                          key={preset}
                          variant="outline"
                          size="sm"
                          onClick={() => setCashinAmount(preset.toString())}
                          className="flex-1"
                          data-testid={`button-preset-${preset}`}
                        >
                          ₱{preset}
                        </Button>
                      ))}
                    </div>

                    <Button 
                      onClick={handleCashIn}
                      disabled={cashinLoading || !cashinAmount || parseFloat(cashinAmount) < 100}
                      className="w-full h-12 text-base bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600"
                      data-testid="button-cashin"
                    >
                      {cashinLoading ? (
                        <><RefreshCw className="mr-2 h-5 w-5 animate-spin" />Generating QR...</>
                      ) : (
                        <><QrCode className="mr-2 h-5 w-5" />Generate QR Code</>
                      )}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cashout" className="mt-4">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ArrowUpRight className="h-5 w-5 text-orange-500" />
                  Withdraw to E-Wallet
                </CardTitle>
                <CardDescription>
                  Send funds instantly to your e-wallet
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isReady ? (
                  <div className="text-center py-6">
                    <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                    <p className="text-muted-foreground">Payment gateway is currently unavailable</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="cashout-provider">E-Wallet Provider</Label>
                      <Select value={cashoutProvider} onValueChange={setCashoutProvider}>
                        <SelectTrigger id="cashout-provider" className="h-12" data-testid="select-provider">
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gcash">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-[#007DFE]" />
                              GCash
                            </span>
                          </SelectItem>
                          <SelectItem value="maya">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-[#00D063]" />
                              Maya
                            </span>
                          </SelectItem>
                          <SelectItem value="mayabank">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-[#00D063]" />
                              Maya Bank
                            </span>
                          </SelectItem>
                          <SelectItem value="grabpay">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-[#00B14F]" />
                              GrabPay
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="cashout-account">Mobile Number</Label>
                      <Input
                        id="cashout-account"
                        type="tel"
                        placeholder="09XX XXX XXXX"
                        value={cashoutAccount}
                        onChange={(e) => setCashoutAccount(e.target.value)}
                        className="text-lg h-12"
                        data-testid="input-cashout-account"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="cashout-name">Account Name (Optional)</Label>
                      <Input
                        id="cashout-name"
                        type="text"
                        placeholder="Recipient name"
                        value={cashoutName}
                        onChange={(e) => setCashoutName(e.target.value)}
                        className="h-12"
                        data-testid="input-cashout-name"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="cashout-amount">Amount (PHP)</Label>
                      <Input
                        id="cashout-amount"
                        type="number"
                        placeholder="Enter amount (min. ₱1)"
                        value={cashoutAmount}
                        onChange={(e) => setCashoutAmount(e.target.value)}
                        min="1"
                        step="1"
                        className="text-lg h-12"
                        data-testid="input-cashout-amount"
                      />
                    </div>

                    <Button 
                      onClick={handleCashOut}
                      disabled={cashoutLoading || !cashoutAmount || parseFloat(cashoutAmount) < 1 || !cashoutAccount.trim()}
                      className="w-full h-12 text-base"
                      variant="secondary"
                      data-testid="button-cashout"
                    >
                      {cashoutLoading ? (
                        <><RefreshCw className="mr-2 h-5 w-5 animate-spin" />Processing...</>
                      ) : (
                        <><Banknote className="mr-2 h-5 w-5" />Send {cashoutAmount ? formatPeso(parseFloat(cashoutAmount)) : "₱0"}</>
                      )}
                    </Button>

                    <p className="text-xs text-center text-muted-foreground">
                      Payouts are processed instantly to your e-wallet
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground">
            Powered by NexusPay QRPH Gateway
          </p>
        </div>
      </div>

      <Dialog open={paymentDialog} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-center justify-center">
              <QrCode className="h-5 w-5 text-green-500" />
              Pay {paymentData ? formatPeso(paymentData.amount) : ""}
            </DialogTitle>
          </DialogHeader>
          
          {paymentData && (
            <div className="flex flex-col flex-1 min-h-0 space-y-3">
              <div className="flex-1 min-h-0 rounded-lg border overflow-hidden bg-white">
                <iframe
                  src={paymentData.paymentUrl}
                  className="w-full h-full min-h-[400px]"
                  title="Payment Page"
                  data-testid="iframe-payment"
                />
              </div>

              <div className="flex-shrink-0 space-y-2">
                <Button
                  onClick={openPaymentPage}
                  className="w-full h-12 bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600"
                  data-testid="button-open-payment"
                >
                  <ExternalLink className="mr-2 h-5 w-5" />
                  Open in New Tab (for Mobile)
                </Button>
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={copyTransactionId}
                    className="flex-1"
                    data-testid="button-copy-txid"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy ID
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleDialogClose(false)}
                    className="flex-1"
                    data-testid="button-close-payment"
                  >
                    Close
                  </Button>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  Transaction: {paymentData.transactionId}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
