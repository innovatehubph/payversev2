import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { 
  Upload, 
  CheckCircle,
  Clock,
  XCircle,
  Copy,
  Building2,
  Smartphone,
  CreditCard,
  RefreshCw,
  Image,
  ArrowLeft,
  AlertCircle,
  FileCheck
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { getAuthToken } from "@/lib/api";
import { formatPeso } from "@/lib/utils";

interface PaymentMethod {
  id: number;
  label: string;
  accountName: string;
  accountNumber: string;
  providerType: string;
  instructions: string | null;
  isActive: boolean;
}

interface DepositRequest {
  id: number;
  amount: string;
  status: string;
  proofImageUrl: string | null;
  userNote: string | null;
  rejectionReason: string | null;
  createdAt: string;
  processedAt: string | null;
}

const PROVIDER_ICONS: Record<string, any> = {
  bank: Building2,
  gcash: Smartphone,
  maya: Smartphone,
  grabpay: Smartphone,
  other: CreditCard,
};

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  pending: { color: "bg-yellow-100 text-yellow-800", icon: Clock, label: "Pending Review" },
  approved: { color: "bg-green-100 text-green-800", icon: CheckCircle, label: "Approved" },
  rejected: { color: "bg-red-100 text-red-800", icon: XCircle, label: "Rejected" },
  credit_pending: { color: "bg-orange-100 text-orange-800", icon: RefreshCw, label: "Credit Pending" },
};

export default function ManualDeposit() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [myDeposits, setMyDeposits] = useState<DepositRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [proofImageUrl, setProofImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  const [showMethodDialog, setShowMethodDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);

  const getAuthHeaders = () => {
    const token = getAuthToken();
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [methodsRes, depositsRes] = await Promise.all([
        fetch("/api/manual/payment-methods", { headers: getAuthHeaders() }),
        fetch("/api/manual/deposits/my", { headers: getAuthHeaders() })
      ]);
      
      if (methodsRes.ok) {
        const methods = await methodsRes.json();
        setPaymentMethods(methods);
      }
      
      if (depositsRes.ok) {
        const deposits = await depositsRes.json();
        setMyDeposits(deposits);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max file size is 5MB", variant: "destructive" });
      return;
    }
    
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file", variant: "destructive" });
      return;
    }
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setProofImage(base64);
      
      setUploadingImage(true);
      try {
        const response = await fetch("/api/manual/upload-proof", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ imageData: base64 })
        });
        
        if (response.ok) {
          const data = await response.json();
          setProofImageUrl(data.imageUrl);
          toast({ title: "Image uploaded", description: "Proof of payment ready" });
        } else {
          toast({ title: "Upload failed", description: "Please try again", variant: "destructive" });
        }
      } catch (error) {
        toast({ title: "Upload error", description: "Please try again", variant: "destructive" });
      } finally {
        setUploadingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!selectedMethod) {
      toast({ title: "Select payment method", variant: "destructive" });
      return;
    }
    
    const parsedAmount = parseFloat(amount);
    if (!amount || parsedAmount < 1) {
      toast({ title: "Invalid amount", description: "Minimum is ₱1", variant: "destructive" });
      return;
    }
    
    if (!proofImageUrl) {
      toast({ title: "Proof required", description: "Please upload proof of payment", variant: "destructive" });
      return;
    }
    
    setSubmitting(true);
    try {
      const response = await fetch("/api/manual/deposits", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          paymentMethodId: selectedMethod.id,
          amount: parsedAmount,
          userNote: note || undefined,
          proofImageUrl
        })
      });
      
      if (response.ok) {
        setShowSuccessDialog(true);
        setAmount("");
        setNote("");
        setProofImage(null);
        setProofImageUrl(null);
        setSelectedMethod(null);
        fetchData();
      } else {
        const error = await response.json();
        toast({ title: "Submission failed", description: error.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Please try again", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied!", description: `${label} copied to clipboard` });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const ProviderIcon = selectedMethod ? (PROVIDER_ICONS[selectedMethod.providerType.toLowerCase()] || CreditCard) : CreditCard;

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center py-24">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold">Manual Deposit</h1>
            <p className="text-sm text-muted-foreground">Send payment to our accounts and upload proof</p>
          </div>
        </header>

        {paymentMethods.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No payment methods available yet.</p>
              <p className="text-sm text-muted-foreground mt-2">Please check back later or use other deposit options.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">1. Select Payment Method</CardTitle>
                <CardDescription>Choose where you'll send your payment</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {paymentMethods.map((method) => {
                    const Icon = PROVIDER_ICONS[method.providerType.toLowerCase()] || CreditCard;
                    const isSelected = selectedMethod?.id === method.id;
                    return (
                      <div
                        key={method.id}
                        onClick={() => {
                          setSelectedMethod(method);
                          setShowMethodDialog(true);
                        }}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected 
                            ? "border-primary bg-primary/5" 
                            : "border-muted hover:border-primary/50"
                        }`}
                        data-testid={`payment-method-${method.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${isSelected ? "bg-primary/10" : "bg-muted"}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{method.label}</p>
                            <p className="text-sm text-muted-foreground">{method.accountName}</p>
                          </div>
                          {isSelected && <CheckCircle className="h-5 w-5 text-primary" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {selectedMethod && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">2. Enter Amount</CardTitle>
                    <CardDescription>How much did you send?</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="amount">Amount (PHP)</Label>
                      <Input
                        id="amount"
                        type="number"
                        placeholder="Enter amount"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="text-lg h-12"
                        data-testid="input-amount"
                      />
                      {amount && parseFloat(amount) > 0 && (
                        <p className="text-sm text-muted-foreground">
                          You'll receive: <span className="font-semibold text-green-600">{parseFloat(amount).toFixed(2)} PHPT</span>
                        </p>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      {[100, 500, 1000, 5000].map((preset) => (
                        <Button
                          key={preset}
                          variant="outline"
                          size="sm"
                          onClick={() => setAmount(preset.toString())}
                          className="flex-1"
                          data-testid={`preset-${preset}`}
                        >
                          ₱{preset.toLocaleString()}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">3. Upload Proof of Payment</CardTitle>
                    <CardDescription>Take a screenshot of your payment confirmation</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <input
                      type="file"
                      accept="image/*"
                      ref={fileInputRef}
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                    
                    {proofImage ? (
                      <div className="relative rounded-lg border overflow-hidden">
                        <img src={proofImage} alt="Proof of payment" className="w-full max-h-64 object-contain bg-muted" />
                        <div className="absolute top-2 right-2">
                          {uploadingImage ? (
                            <Badge variant="secondary">
                              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                              Uploading...
                            </Badge>
                          ) : proofImageUrl ? (
                            <Badge className="bg-green-500">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Uploaded
                            </Badge>
                          ) : (
                            <Badge variant="destructive">Upload failed</Badge>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="absolute bottom-2 right-2"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Change Image
                        </Button>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                        data-testid="upload-area"
                      >
                        <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                        <p className="text-muted-foreground">Click to upload proof of payment</p>
                        <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 5MB</p>
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      <Label htmlFor="note">Note (Optional)</Label>
                      <Textarea
                        id="note"
                        placeholder="Reference number or any additional details..."
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        data-testid="input-note"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Button
                  onClick={handleSubmit}
                  disabled={submitting || !proofImageUrl || !amount || parseFloat(amount) < 1}
                  className="w-full h-14 text-lg bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                  data-testid="button-submit"
                >
                  {submitting ? (
                    <><RefreshCw className="mr-2 h-5 w-5 animate-spin" />Submitting...</>
                  ) : (
                    <><FileCheck className="mr-2 h-5 w-5" />Submit Deposit Request</>
                  )}
                </Button>
              </>
            )}
          </>
        )}

        {myDeposits.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">My Deposit Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {myDeposits.slice(0, 5).map((deposit) => {
                  const config = STATUS_CONFIG[deposit.status] || STATUS_CONFIG.pending;
                  const StatusIcon = config.icon;
                  return (
                    <div key={deposit.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <StatusIcon className="h-5 w-5" />
                        <div>
                          <p className="font-medium">{formatPeso(parseFloat(deposit.amount))}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(deposit.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge className={config.color}>{config.label}</Badge>
                        {deposit.rejectionReason && (
                          <p className="text-xs text-red-500 mt-1">{deposit.rejectionReason}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showMethodDialog} onOpenChange={setShowMethodDialog}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          {selectedMethod && (
            <>
              {/* Header with Gradient */}
              <div className="bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 p-6 text-white text-center">
                <div className="h-16 w-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-3 ring-4 ring-white/30">
                  <ProviderIcon className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-1">Payment Details</h3>
                <p className="text-white/80 text-sm">Send your payment to this account</p>
              </div>

              <div className="p-6 space-y-4">
                {/* Payment Method Badge */}
                <div className="flex items-center justify-center">
                  <Badge variant="secondary" className="text-sm px-4 py-1">
                    {selectedMethod.label}
                  </Badge>
                </div>

                {/* Account Details */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-xs text-muted-foreground">Account Name</p>
                      <p className="font-medium">{selectedMethod.accountName}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => copyToClipboard(selectedMethod.accountName, "Account name")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 border border-blue-200 dark:border-blue-800">
                    <div>
                      <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide">Account Number</p>
                      <p className="font-mono font-bold text-2xl text-blue-700 dark:text-blue-300">{selectedMethod.accountNumber}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="border-blue-300 hover:bg-blue-100"
                      onClick={() => copyToClipboard(selectedMethod.accountNumber, "Account number")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {selectedMethod.instructions && (
                  <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                    <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Instructions</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400">{selectedMethod.instructions}</p>
                    </div>
                  </div>
                )}

                <Button
                  onClick={() => setShowMethodDialog(false)}
                  className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                >
                  <CheckCircle className="mr-2 h-5 w-5" />
                  Got it, I'll send my payment
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          {/* Header with Gradient */}
          <div className="bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500 p-8 text-white text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-8 -mr-8 h-32 w-32 rounded-full bg-white/10 blur-xl" />
            <div className="absolute bottom-0 left-0 -mb-8 -ml-8 h-24 w-24 rounded-full bg-white/10 blur-xl" />

            <div className="relative z-10">
              <div className="h-20 w-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 ring-4 ring-white/30">
                <CheckCircle className="h-10 w-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-1">Request Submitted!</h3>
              <p className="text-white/80">Your deposit is being reviewed</p>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-3">
                <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                  <Clock className="h-3 w-3 mr-1" />
                  Pending Review
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm">
                Our team will review your deposit request and payment proof.
                Your PHPT will be credited once approved.
              </p>
            </div>

            <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">What's next?</p>
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  You'll be notified once your deposit is approved. This usually takes a few minutes during business hours.
                </p>
              </div>
            </div>

            <Button
              onClick={() => setShowSuccessDialog(false)}
              className="w-full h-12 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
            >
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
