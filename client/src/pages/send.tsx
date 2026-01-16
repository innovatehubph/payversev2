import { useState, useCallback, useEffect } from "react";
import AppLayout from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Send as SendIcon, Search, User, Loader2, CheckCircle, AlertCircle, ArrowRight, Coins, ArrowUpRight, Sparkles, Home, Lock } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { getAuthToken } from "@/lib/api";
import { formatPeso, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";

interface SearchResult {
  id: number;
  fullName: string;
  username: string;
  email: string;
  paygramCliId?: string;
}

export default function Send() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<SearchResult | null>(null);
  
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const [phptBalance, setPhptBalance] = useState(0);
  const [balanceLoading, setBalanceLoading] = useState(true);

  const getAuthHeaders = useCallback(() => {
    const token = getAuthToken();
    return { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
  }, []);

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const response = await fetch("/api/wallet/balance", { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.success) {
          setPhptBalance(parseFloat(data.phptBalance) || 0);
        }
      } catch (error) {
        console.error("Failed to fetch balance:", error);
      } finally {
        setBalanceLoading(false);
      }
    };
    fetchBalance();
  }, [getAuthHeaders]);

  const handleSearch = async () => {
    if (!searchQuery || searchQuery.length < 2) return;
    
    setSearching(true);
    try {
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (Array.isArray(data)) {
        const filtered = data.filter((u: SearchResult) => u.id !== user?.id);
        setSearchResults(filtered);
      }
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setSearching(false);
    }
  };

  const handleShowConfirmation = () => {
    if (!selectedRecipient) {
      toast({ title: "Select Recipient", description: "Please select who to send to", variant: "destructive" });
      return;
    }
    
    const amt = parseFloat(amount);
    if (!amt || amt < 1) {
      toast({ title: "Invalid Amount", description: "Minimum send amount is 1 PHPT", variant: "destructive" });
      return;
    }
    
    if (amt > phptBalance) {
      toast({ title: "Insufficient Balance", description: `You only have ${formatPeso(phptBalance)}`, variant: "destructive" });
      return;
    }

    setShowConfirmation(true);
  };

  const handleSend = async () => {
    if (!selectedRecipient) return;

    if (pin.length !== 6) {
      toast({ title: "PIN Required", description: "Please enter your 6-digit PIN", variant: "destructive" });
      return;
    }

    const amt = parseFloat(amount);

    setSending(true);
    try {
      // Use /api/transfer for P2P transfers (works for all users, requires PIN)
      const response = await fetch("/api/transfer", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          receiverId: selectedRecipient.id,
          amount: amt.toFixed(2),
          note: note || undefined,
          pin
        })
      });

      const data = await response.json();

      if (response.ok && data.transaction) {
        setSuccess(true);
        setShowConfirmation(false);
        setPhptBalance(prev => prev - amt);
        setPin("");
        toast({
          title: "Transfer Successful!",
          description: `${formatPeso(amt)} sent to ${selectedRecipient.fullName}`
        });
      } else {
        // Handle specific error cases
        if (data.requiresKyc) {
          toast({ title: "KYC Required", description: data.message, variant: "destructive" });
        } else if (data.requiresPin) {
          toast({ title: "PIN Required", description: data.message, variant: "destructive" });
        } else if (data.lockedUntil) {
          toast({ title: "PIN Locked", description: data.message, variant: "destructive" });
        } else if (data.attemptsRemaining !== undefined) {
          toast({ title: "Invalid PIN", description: data.message, variant: "destructive" });
        } else {
          toast({ title: "Transfer Failed", description: data.message || "Please try again", variant: "destructive" });
        }
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const resetForm = () => {
    setSelectedRecipient(null);
    setSearchQuery("");
    setSearchResults([]);
    setAmount("");
    setNote("");
    setPin("");
    setSuccess(false);
    setShowConfirmation(false);
  };

  if (success) {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto pt-4">
          <Card className="overflow-hidden border-0 shadow-xl">
            {/* Success Header with Gradient */}
            <div className="bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500 p-8 text-white text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
              <div className="relative">
                <div className="h-20 w-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 ring-4 ring-white/30">
                  <CheckCircle className="h-10 w-10 text-white" />
                </div>
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Sparkles className="h-5 w-5" />
                  <h2 className="text-2xl font-bold">Transfer Successful!</h2>
                  <Sparkles className="h-5 w-5" />
                </div>
                <p className="text-white/80 text-sm">Your money is on its way</p>
              </div>
            </div>

            <CardContent className="p-6 space-y-6">
              {/* Amount Display */}
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-1">Amount Sent</p>
                <p className="text-4xl font-bold text-primary">{formatPeso(parseFloat(amount))}</p>
                <Badge variant="secondary" className="mt-2">PHPT</Badge>
              </div>

              <Separator />

              {/* Transaction Details */}
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-xl bg-secondary/50">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                    <ArrowUpRight className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Sent to</p>
                    <p className="font-semibold">{selectedRecipient?.fullName}</p>
                    <p className="text-xs text-muted-foreground">{selectedRecipient?.email}</p>
                  </div>
                </div>

                {note && (
                  <div className="p-4 rounded-xl bg-muted/50 border border-border">
                    <p className="text-xs text-muted-foreground mb-1">Note</p>
                    <p className="text-sm">{note}</p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button variant="outline" onClick={() => navigate("/dashboard")} className="gap-2">
                  <Home className="h-4 w-4" />
                  Home
                </Button>
                <Button onClick={resetForm} className="gap-2 bg-gradient-to-r from-primary to-primary/80" data-testid="button-send-another">
                  <SendIcon className="h-4 w-4" />
                  Send Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-md mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-display font-bold">Send Money</h1>
          <p className="text-muted-foreground">Transfer PHPT to another PayVerse user</p>
        </header>

        <Card className="mb-4">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Available Balance</span>
              <span className="font-bold text-lg flex items-center gap-1">
                <Coins className="h-4 w-4 text-primary" />
                {balanceLoading ? "..." : formatPeso(phptBalance)}
              </span>
            </div>
          </CardContent>
        </Card>

        {!selectedRecipient ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Find Recipient</CardTitle>
              <CardDescription>Enter exact username, email, or phone number</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter exact username, email or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  data-testid="input-search-recipient"
                />
                <Button onClick={handleSearch} disabled={searching || !searchQuery} data-testid="button-search">
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-2">
                  {searchResults.map((result) => (
                    <div
                      key={result.id}
                      onClick={() => setSelectedRecipient(result)}
                      className="p-3 rounded-xl border border-border hover:border-primary/50 hover:bg-secondary/50 cursor-pointer transition-colors flex items-center gap-3"
                      data-testid={`recipient-${result.id}`}
                    >
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="font-bold text-primary text-sm">
                          {result.fullName.substring(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{result.fullName}</p>
                        <p className="text-sm text-muted-foreground">{result.email}</p>
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              )}

              {searchQuery && searchResults.length === 0 && !searching && (
                <div className="text-center py-8 text-muted-foreground">
                  <User className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No users found</p>
                  <p className="text-sm">Please enter the exact username, email, or phone number</p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedRecipient(null)} className="-ml-2">
                  ←
                </Button>
                Send to {selectedRecipient.fullName}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 rounded-xl bg-secondary/50 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="font-bold text-primary text-sm">
                    {selectedRecipient.fullName.substring(0, 2).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-medium">{selectedRecipient.fullName}</p>
                  <p className="text-sm text-muted-foreground">{selectedRecipient.email}</p>
                </div>
              </div>

              <div>
                <Label htmlFor="amount">Amount (PHPT)</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="Enter amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="1"
                  max={phptBalance}
                  data-testid="input-send-amount"
                />
                <p className="text-xs text-muted-foreground mt-1">Minimum: 1 PHPT</p>
              </div>

              <div>
                <Label htmlFor="note">Note (optional)</Label>
                <Textarea
                  id="note"
                  placeholder="What's this for?"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="resize-none"
                  rows={2}
                  data-testid="input-send-note"
                />
              </div>

              <Button 
                onClick={handleShowConfirmation} 
                disabled={!amount}
                className="w-full"
                data-testid="button-review-send"
              >
                <ArrowRight className="mr-2 h-4 w-4" />
                Review Transfer
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Confirmation Dialog */}
        <Dialog open={showConfirmation && !!selectedRecipient} onOpenChange={(open) => { setShowConfirmation(open); if (!open) setPin(""); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader className="text-center pb-2">
              <div className="mx-auto h-14 w-14 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mb-3">
                <SendIcon className="h-7 w-7 text-primary" />
              </div>
              <DialogTitle className="text-xl">Confirm Transfer</DialogTitle>
              <DialogDescription>Please review the details before sending</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Amount Highlight */}
              <div className="text-center p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">You're Sending</p>
                <p className="text-3xl font-bold text-primary">{formatPeso(parseFloat(amount || "0"))}</p>
                <Badge variant="outline" className="mt-2">PHPT</Badge>
              </div>

              {/* Recipient Info */}
              <div className="flex items-center gap-4 p-4 rounded-xl bg-secondary/50">
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold">
                  {selectedRecipient?.fullName.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Recipient</p>
                  <p className="font-semibold">{selectedRecipient?.fullName}</p>
                  <p className="text-xs text-muted-foreground">{selectedRecipient?.email}</p>
                </div>
                <ArrowUpRight className="h-5 w-5 text-muted-foreground" />
              </div>

              {/* Note */}
              {note && (
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <p className="text-xs text-muted-foreground mb-1">Note</p>
                  <p className="text-sm">{note}</p>
                </div>
              )}

              {/* PIN Input */}
              <div className="p-4 rounded-xl bg-secondary/30 border">
                <div className="flex items-center gap-2 mb-3">
                  <Lock className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">Enter your 6-digit PIN</p>
                </div>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={pin} onChange={setPin}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} className="h-11 w-10" mask />
                      <InputOTPSlot index={1} className="h-11 w-10" mask />
                      <InputOTPSlot index={2} className="h-11 w-10" mask />
                      <InputOTPSlot index={3} className="h-11 w-10" mask />
                      <InputOTPSlot index={4} className="h-11 w-10" mask />
                      <InputOTPSlot index={5} className="h-11 w-10" mask />
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
                    This transaction cannot be reversed. Please verify all details.
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter className="flex gap-3 sm:gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setShowConfirmation(false); setPin(""); }}
                disabled={sending}
                data-testid="button-cancel-send"
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-gradient-to-r from-primary to-emerald-600 hover:from-primary/90 hover:to-emerald-600/90"
                onClick={handleSend}
                disabled={sending || pin.length !== 6}
                data-testid="button-confirm-send"
              >
                {sending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <SendIcon className="mr-2 h-4 w-4" />
                )}
                {sending ? "Sending..." : "Confirm & Send"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
