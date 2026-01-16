import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Smartphone, CreditCard, Upload, ArrowRight, Loader2, CheckCircle, AlertCircle, ExternalLink, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAuthToken } from "@/lib/api";
import { formatPeso, cn } from "@/lib/utils";
import telegramLogo from "@assets/IMG_7140_1765874653939.png";

type CashOutMethod = "telegram" | "ewallet" | "manual" | null;
type ViewState = "method_select" | "input" | "confirmation" | "success";

interface CashOutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EWALLET_PROVIDERS = [
  { id: "gcash", label: "GCash", color: "bg-[#007DFE]" },
  { id: "maya", label: "Maya", color: "bg-[#00D063]" },
  { id: "grabpay", label: "GrabPay", color: "bg-[#00B14F]" },
];

interface TelegramSuccessData {
  amount: number;
  telegramLink?: string;
  isInstant: boolean;
}

interface EwalletSuccessData {
  amount: number;
  provider: string;
  accountNumber: string;
}

export function CashOutModal({ open, onOpenChange }: CashOutModalProps) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [method, setMethod] = useState<CashOutMethod>(null);
  const [viewState, setViewState] = useState<ViewState>("method_select");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [phptBalance, setPhptBalance] = useState(0);

  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [provider, setProvider] = useState("gcash");

  const [telegramSuccess, setTelegramSuccess] = useState<TelegramSuccessData | null>(null);
  const [ewalletSuccess, setEwalletSuccess] = useState<EwalletSuccessData | null>(null);

  const getAuthHeaders = useCallback(() => {
    const token = getAuthToken();
    return { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
  }, []);

  useEffect(() => {
    if (open) {
      fetchBalance();
    }
  }, [open]);

  const fetchBalance = async () => {
    try {
      const response = await fetch("/api/wallet/balance", { headers: getAuthHeaders() });
      const data = await response.json();
      if (data.success) {
        setPhptBalance(parseFloat(data.phptBalance) || 0);
      }
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    }
  };

  const resetState = () => {
    setMethod(null);
    setViewState("method_select");
    setAmount("");
    setLoading(false);
    setAccountNumber("");
    setAccountName("");
    setProvider("gcash");
    setTelegramSuccess(null);
    setEwalletSuccess(null);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const selectMethod = (m: CashOutMethod) => {
    setMethod(m);
    setViewState("input");
  };

  const handleTelegramConfirm = () => {
    const amt = parseFloat(amount);
    if (!amt || amt < 1) {
      toast({ title: "Invalid Amount", description: "Minimum is 1 PHPT", variant: "destructive" });
      return;
    }
    if (amt > phptBalance) {
      toast({ title: "Insufficient Balance", description: `You only have ${phptBalance} PHPT`, variant: "destructive" });
      return;
    }
    setViewState("confirmation");
  };

  const handleTelegramCashOut = async () => {
    const amt = parseFloat(amount);
    setLoading(true);
    try {
      const response = await fetch("/api/crypto/cashout", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ amount: amt })
      });
      const data = await response.json();
      if (data.success) {
        setTelegramSuccess({
          amount: amt,
          telegramLink: data.telegramLink,
          isInstant: data.status === "completed"
        });
        setViewState("success");
        fetchBalance();
      } else {
        toast({ title: "Withdrawal Failed", description: data.message || "Please try again", variant: "destructive" });
        setViewState("input");
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setViewState("input");
    } finally {
      setLoading(false);
    }
  };

  const handleEWalletConfirm = () => {
    const amt = parseFloat(amount);
    if (!amt || amt < 1) {
      toast({ title: "Invalid Amount", description: "Minimum is ₱1", variant: "destructive" });
      return;
    }
    if (amt > phptBalance) {
      toast({ title: "Insufficient Balance", description: `You only have ${formatPeso(phptBalance)}`, variant: "destructive" });
      return;
    }
    if (!accountNumber || accountNumber.length < 10) {
      toast({ title: "Invalid Account", description: "Please enter a valid account number", variant: "destructive" });
      return;
    }
    if (!accountName || accountName.length < 2) {
      toast({ title: "Invalid Name", description: "Please enter the account holder's name", variant: "destructive" });
      return;
    }
    setViewState("confirmation");
  };

  const handleEWalletCashOut = async () => {
    const amt = parseFloat(amount);
    setLoading(true);
    try {
      const response = await fetch("/api/nexuspay/cashout", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          amount: amt,
          accountNumber,
          accountName,
          provider
        })
      });
      const data = await response.json();
      if (data.success) {
        setEwalletSuccess({ amount: amt, provider, accountNumber });
        setViewState("success");
        fetchBalance();
      } else {
        toast({ title: "Cash Out Failed", description: data.message || "Please try again", variant: "destructive" });
        setViewState("input");
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setViewState("input");
    } finally {
      setLoading(false);
    }
  };

  const methodOptions = [
    { id: "telegram" as const, icon: Smartphone, label: "Telegram", description: "Withdraw to Telegram wallet", color: "bg-blue-500" },
    { id: "ewallet" as const, icon: CreditCard, label: "eWallet (Instant)", description: "GCash, Maya, GrabPay", color: "bg-green-500" },
    { id: "manual" as const, icon: Building2, label: "Bank / Manual", description: "Request payout to saved accounts", color: "bg-purple-500" },
  ];

  const getTitle = () => {
    if (viewState === "success") return "Complete";
    if (viewState === "confirmation") return "Confirm";
    return "Cash Out";
  };

  const getDescription = () => {
    if (viewState === "success") return "Your transaction has been processed";
    if (viewState === "confirmation") return "Please review the details below";
    if (viewState === "method_select") return "Choose how you want to withdraw funds";
    return `Balance: ${formatPeso(phptBalance)}`;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {viewState === "input" && (
              <Button variant="ghost" size="sm" onClick={() => { setMethod(null); setViewState("method_select"); }} className="mr-2 -ml-2">
                ←
              </Button>
            )}
            {getTitle()}
            {method && viewState === "input" && (
              <span className="text-muted-foreground font-normal">› {methodOptions.find(m => m.id === method)?.label}</span>
            )}
          </DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>

        {viewState === "method_select" && (
          <div className="space-y-3 pt-4">
            {methodOptions.map((opt) => (
              <Card 
                key={opt.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => selectMethod(opt.id)}
                data-testid={`cashout-method-${opt.id}`}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center", opt.color)}>
                    {opt.id === "telegram" ? (
                      <img src={telegramLogo} alt="Telegram" className="h-7 w-7 object-contain" />
                    ) : (
                      <opt.icon className="h-6 w-6 text-white" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{opt.label}</p>
                    <p className="text-sm text-muted-foreground">{opt.description}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {method === "telegram" && viewState === "input" && (
          <div className="space-y-4 pt-4">
            <div>
              <Label htmlFor="telegram-cashout-amount">Amount (PHPT)</Label>
              <Input
                id="telegram-cashout-amount"
                type="number"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                max={phptBalance}
                data-testid="input-cashout-amount"
              />
              <p className="text-xs text-muted-foreground mt-1">Available: {formatPeso(phptBalance)}</p>
            </div>
            <Button 
              onClick={handleTelegramConfirm} 
              disabled={!amount}
              className="w-full"
              data-testid="button-review-cashout"
            >
              Review Withdrawal
            </Button>
          </div>
        )}

        {method === "telegram" && viewState === "confirmation" && (
          <div className="space-y-4 pt-4">
            <div className="bg-muted/50 rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-center">Confirm Withdrawal</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Withdraw to</span>
                  <span className="font-medium">Telegram Wallet</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-medium">{parseFloat(amount).toFixed(2)} PHPT</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Fee</span>
                  <span className="font-medium text-green-600">Free</span>
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="font-medium">You will receive</span>
                  <span className="font-bold text-blue-600">{parseFloat(amount).toFixed(2)} PHPT</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline"
                onClick={() => setViewState("input")} 
                disabled={loading}
                className="flex-1"
              >
                Back
              </Button>
              <Button 
                onClick={handleTelegramCashOut} 
                disabled={loading}
                className="flex-1 bg-blue-500 hover:bg-blue-600"
                data-testid="button-confirm-cashout"
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirm
              </Button>
            </div>
          </div>
        )}

        {method === "telegram" && viewState === "success" && telegramSuccess && (
          <div className="space-y-4 pt-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-green-800 mb-2">
                {telegramSuccess.isInstant ? "Withdrawal Successful!" : "Withdrawal Created!"}
              </h3>
              <p className="text-lg font-semibold text-green-700 mb-2">
                {telegramSuccess.amount.toFixed(2)} PHPT
              </p>
              <p className="text-sm text-green-600">
                {telegramSuccess.isInstant 
                  ? "Funds have been sent to your Telegram wallet"
                  : "Open Telegram to claim your funds"}
              </p>
            </div>
            {telegramSuccess.telegramLink && (
              <a href={telegramSuccess.telegramLink} target="_blank" rel="noopener noreferrer">
                <Button className="w-full bg-blue-500 hover:bg-blue-600">
                  <ExternalLink className="mr-2 h-4 w-4" /> Open in Telegram
                </Button>
              </a>
            )}
            <Button variant="outline" onClick={handleClose} className="w-full" data-testid="button-done">
              Done
            </Button>
          </div>
        )}

        {method === "ewallet" && viewState === "input" && (
          <div className="space-y-4 pt-4">
            <div>
              <Label>Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger data-testid="select-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EWALLET_PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="account-number">Account Number</Label>
              <Input
                id="account-number"
                placeholder="e.g. 09171234567"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                data-testid="input-account-number"
              />
            </div>
            <div>
              <Label htmlFor="account-name">Account Name</Label>
              <Input
                id="account-name"
                placeholder="Name on the account"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                data-testid="input-account-name"
              />
            </div>
            <div>
              <Label htmlFor="ewallet-amount">Amount (PHP)</Label>
              <Input
                id="ewallet-amount"
                type="number"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                data-testid="input-ewallet-amount"
              />
              <p className="text-xs text-muted-foreground mt-1">Available: {formatPeso(phptBalance)}</p>
            </div>
            <Button 
              onClick={handleEWalletConfirm} 
              disabled={!amount || !accountNumber || !accountName}
              className="w-full bg-green-600 hover:bg-green-700"
              data-testid="button-review-ewallet"
            >
              Review Cash Out
            </Button>
          </div>
        )}

        {method === "ewallet" && viewState === "confirmation" && (
          <div className="space-y-4 pt-4">
            <div className="bg-muted/50 rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-center">Confirm Cash Out</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Provider</span>
                  <span className="font-medium">{EWALLET_PROVIDERS.find(p => p.id === provider)?.label}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Account</span>
                  <span className="font-medium">{accountNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">{accountName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-medium">{formatPeso(parseFloat(amount))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Fee</span>
                  <span className="font-medium text-green-600">Free</span>
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="font-medium">You will receive</span>
                  <span className="font-bold text-green-600">{formatPeso(parseFloat(amount))}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline"
                onClick={() => setViewState("input")} 
                disabled={loading}
                className="flex-1"
              >
                Back
              </Button>
              <Button 
                onClick={handleEWalletCashOut} 
                disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700"
                data-testid="button-confirm-ewallet"
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirm
              </Button>
            </div>
          </div>
        )}

        {method === "ewallet" && viewState === "success" && ewalletSuccess && (
          <div className="space-y-4 pt-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-green-800 mb-2">Cash Out Successful!</h3>
              <p className="text-lg font-semibold text-green-700 mb-2">
                {formatPeso(ewalletSuccess.amount)}
              </p>
              <p className="text-sm text-green-600">
                Sent to {EWALLET_PROVIDERS.find(p => p.id === ewalletSuccess.provider)?.label} ({ewalletSuccess.accountNumber})
              </p>
            </div>
            <Button variant="outline" onClick={handleClose} className="w-full" data-testid="button-done">
              Done
            </Button>
          </div>
        )}

        {method === "manual" && (
          <div className="space-y-4 pt-4 text-center">
            <Building2 className="h-16 w-16 text-purple-500 mx-auto" />
            <p className="font-medium">Manual Cash Out to Bank/E-Wallet</p>
            <p className="text-sm text-muted-foreground">
              Request a manual withdrawal to your saved bank account or e-wallet. Admin will process your request.
            </p>
            <div className="space-y-2">
              <Button
                onClick={() => {
                  handleClose();
                  navigate("/manual-withdrawal");
                }}
                className="w-full bg-purple-600 hover:bg-purple-700"
                data-testid="button-go-manual-withdrawal"
              >
                Go to Manual Withdrawal
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  handleClose();
                  navigate("/bank-accounts");
                }}
                className="w-full"
                data-testid="button-manage-bank-accounts"
              >
                Manage Bank Accounts
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
