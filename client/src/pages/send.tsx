import { useState, useCallback, useEffect } from "react";
import AppLayout from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Send as SendIcon, Search, User, Loader2, CheckCircle, AlertCircle, ArrowRight, Coins } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAuthToken } from "@/lib/api";
import { formatPeso, cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

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
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<SearchResult | null>(null);
  
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
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
    
    const amt = parseFloat(amount);

    setSending(true);
    try {
      // Use paygramCliId if available, then username, then email as PayGram identifier
      const recipientId = selectedRecipient.paygramCliId || selectedRecipient.username || selectedRecipient.email;
      const response = await fetch("/api/crypto/send-paygram", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          recipientId,
          amount: amt,
          note: note || undefined
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSuccess(true);
        setShowConfirmation(false);
        setPhptBalance(prev => prev - amt);
        toast({ 
          title: "Transfer Successful!", 
          description: `${formatPeso(amt)} sent to ${selectedRecipient.fullName}` 
        });
      } else {
        toast({ title: "Transfer Failed", description: data.message || "Please try again", variant: "destructive" });
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
    setSuccess(false);
    setShowConfirmation(false);
  };

  if (success) {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto pt-8">
          <Card className="text-center">
            <CardContent className="pt-8 pb-8 space-y-6">
              <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-2">Transfer Successful!</h2>
                <p className="text-muted-foreground">
                  {formatPeso(parseFloat(amount))} has been sent to {selectedRecipient?.fullName}
                </p>
              </div>
              <Button onClick={resetForm} className="w-full" data-testid="button-send-another">
                Send Another
              </Button>
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

        {/* Confirmation Modal */}
        {showConfirmation && selectedRecipient && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
              <CardHeader className="text-center">
                <CardTitle className="text-xl">Confirm Transfer</CardTitle>
                <CardDescription>Please review the details before sending</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-xl bg-secondary/50 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Recipient</span>
                    <span className="font-medium">{selectedRecipient.fullName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Username/Email</span>
                    <span className="text-sm">{selectedRecipient.email}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-bold text-lg text-primary">{formatPeso(parseFloat(amount))}</span>
                  </div>
                  {note && (
                    <div className="flex justify-between items-start">
                      <span className="text-muted-foreground">Note</span>
                      <span className="text-sm text-right max-w-[60%]">{note}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Please verify all details. This transaction cannot be reversed.
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    className="flex-1" 
                    onClick={() => setShowConfirmation(false)}
                    disabled={sending}
                    data-testid="button-cancel-send"
                  >
                    Cancel
                  </Button>
                  <Button 
                    className="flex-1" 
                    onClick={handleSend}
                    disabled={sending}
                    data-testid="button-confirm-send"
                  >
                    {sending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <SendIcon className="mr-2 h-4 w-4" />
                    )}
                    Confirm & Send
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
