import { useState, useCallback, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Smartphone, QrCode, Upload, ArrowRight, Loader2, CheckCircle, Copy, ExternalLink, Clock, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAuthToken } from "@/lib/api";
import { formatPeso, cn } from "@/lib/utils";
import { QRCodeSVG } from "qrcode.react";
import telegramLogo from "@assets/IMG_7140_1765874653939.png";
import { Link } from "wouter";

type TopUpMethod = "telegram" | "qrph" | "manual" | null;
type PaymentStatus = "pending" | "processing" | "success" | "failed" | "expired";

interface TopUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TopUpModal({ open, onOpenChange }: TopUpModalProps) {
  const { toast } = useToast();
  const [method, setMethod] = useState<TopUpMethod>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const [qrData, setQrData] = useState<{ paymentUrl: string; transactionId: string; qrphraw?: string } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("pending");
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const getAuthHeaders = useCallback(() => {
    const token = getAuthToken();
    return { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const resetState = () => {
    setMethod(null);
    setAmount("");
    setLoading(false);
    setQrData(null);
    setPaymentStatus("pending");
    stopPolling();
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const handleTelegramTopUp = async () => {
    if (!amount || parseFloat(amount) < 1) {
      toast({ title: "Invalid Amount", description: "Minimum is 1 PHPT", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/crypto/direct-topup", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ amount: parseFloat(amount) })
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: "Top-up Successful!", description: `${data.amount} PHPT added to your wallet` });
        handleClose();
      } else {
        toast({ title: "Top-up Failed", description: data.message || "Please try again", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to process top-up", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleQRPHTopUp = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt < 100) {
      toast({ title: "Invalid Amount", description: "Minimum cash-in is ₱100", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/nexuspay/cashin", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ amount: amt })
      });
      const data = await response.json();
      if (data.success && data.paymentUrl) {
        setQrData({ paymentUrl: data.paymentUrl, transactionId: data.transactionId, qrphraw: data.qrphraw });
        setPaymentStatus("pending");
        startPolling(data.transactionId);
      } else {
        toast({ title: "Failed", description: data.message || "Could not generate QR code", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (transactionId: string) => {
    pollingRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/nexuspay/cashin-status/${transactionId}`, { headers: getAuthHeaders() });
        const data = await response.json();
        const status = data.status?.toLowerCase() || "pending";
        if (status === "success" || status === "paid" || status === "completed") {
          setPaymentStatus("success");
          stopPolling();
          toast({ title: "Payment Successful!", description: `Your balance has been credited` });
        } else if (status === "failed" || status === "cancelled") {
          setPaymentStatus("failed");
          stopPolling();
        } else if (status === "expired") {
          setPaymentStatus("expired");
          stopPolling();
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 3000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: "QR data copied to clipboard" });
  };

  const methodOptions = [
    { id: "telegram" as const, icon: Smartphone, label: "Telegram", description: "Top up from your Telegram wallet", color: "bg-blue-500" },
    { id: "qrph" as const, icon: QrCode, label: "QRPH (GCash/Maya)", description: "Pay with QR code (₱100 min)", color: "bg-green-500" },
    { id: "manual" as const, icon: Upload, label: "Manual Deposit", description: "Bank transfer or send money", color: "bg-purple-500" },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {method && (
              <Button variant="ghost" size="sm" onClick={() => { setMethod(null); setQrData(null); }} className="mr-2 -ml-2">
                ←
              </Button>
            )}
            Top Up
            {method && <span className="text-muted-foreground font-normal">› {methodOptions.find(m => m.id === method)?.label}</span>}
          </DialogTitle>
          <DialogDescription>
            {!method ? "Choose how you want to add funds" : "Enter the amount to top up"}
          </DialogDescription>
        </DialogHeader>

        {!method && (
          <div className="space-y-3 pt-4">
            {methodOptions.map((opt) => (
              <Card 
                key={opt.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setMethod(opt.id)}
                data-testid={`topup-method-${opt.id}`}
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

        {method === "telegram" && (
          <div className="space-y-4 pt-4">
            <div>
              <Label htmlFor="telegram-amount">Amount (PHPT)</Label>
              <Input
                id="telegram-amount"
                type="number"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                data-testid="input-topup-amount"
              />
              <p className="text-xs text-muted-foreground mt-1">Minimum: 1 PHPT</p>
            </div>
            <Button 
              onClick={handleTelegramTopUp} 
              disabled={loading || !amount}
              className="w-full"
              data-testid="button-confirm-topup"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Top Up {amount ? `${amount} PHPT` : ""}
            </Button>
          </div>
        )}

        {method === "qrph" && !qrData && (
          <div className="space-y-4 pt-4">
            <div>
              <Label htmlFor="qrph-amount">Amount (PHP)</Label>
              <Input
                id="qrph-amount"
                type="number"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="100"
                data-testid="input-qrph-amount"
              />
              <p className="text-xs text-muted-foreground mt-1">Minimum: ₱100</p>
            </div>
            <Button 
              onClick={handleQRPHTopUp} 
              disabled={loading || !amount}
              className="w-full bg-green-600 hover:bg-green-700"
              data-testid="button-generate-qr"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
              Generate QR Code
            </Button>
          </div>
        )}

        {method === "qrph" && qrData && (
          <div className="space-y-4 pt-4">
            {paymentStatus === "pending" && (
              <>
                <div className="bg-white p-4 rounded-xl flex justify-center">
                  <QRCodeSVG value={qrData.qrphraw || qrData.paymentUrl} size={200} />
                </div>
                <div className="text-center space-y-2">
                  <p className="font-medium">Scan with GCash or Maya</p>
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                    <Clock className="h-4 w-4 animate-pulse" /> Waiting for payment...
                  </p>
                </div>
                {qrData.qrphraw && (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => copyToClipboard(qrData.qrphraw!)}>
                    <Copy className="mr-2 h-4 w-4" /> Copy QR Data
                  </Button>
                )}
                <a href={qrData.paymentUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="w-full">
                    <ExternalLink className="mr-2 h-4 w-4" /> Open Payment Link
                  </Button>
                </a>
              </>
            )}
            {paymentStatus === "success" && (
              <div className="text-center py-8 space-y-4">
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
                <p className="text-xl font-medium">Payment Successful!</p>
                <p className="text-muted-foreground">Your balance has been credited</p>
                <Button onClick={handleClose} className="w-full">Done</Button>
              </div>
            )}
            {(paymentStatus === "failed" || paymentStatus === "expired") && (
              <div className="text-center py-8 space-y-4">
                <XCircle className="h-16 w-16 text-red-500 mx-auto" />
                <p className="text-xl font-medium">{paymentStatus === "expired" ? "QR Expired" : "Payment Failed"}</p>
                <Button onClick={() => { setQrData(null); setPaymentStatus("pending"); }} variant="outline" className="w-full">
                  Try Again
                </Button>
              </div>
            )}
          </div>
        )}

        {method === "manual" && (
          <div className="space-y-4 pt-4 text-center">
            <Upload className="h-16 w-16 text-purple-500 mx-auto" />
            <p className="font-medium">Manual P2P Deposit</p>
            <p className="text-sm text-muted-foreground">
              Transfer funds via bank, GCash, or Maya send money, then submit proof for admin approval.
            </p>
            <Link href="/manual-deposit" onClick={() => handleClose()}>
              <Button className="w-full bg-purple-600 hover:bg-purple-700" data-testid="button-goto-manual">
                Go to Manual Deposit
              </Button>
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
