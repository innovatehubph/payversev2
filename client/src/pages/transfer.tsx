import AppLayout from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowRight, Search, Shield, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { api, getAuthToken } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";

const LARGE_TRANSFER_THRESHOLD = 5000;

export default function Transfer() {
  const [step, setStep] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user, refreshUser } = useAuth();
  const [_, setLocation] = useLocation();
  
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pin, setPin] = useState("");
  const [pinVerifying, setPinVerifying] = useState(false);
  const [securityStatus, setSecurityStatus] = useState<any>(null);

  useEffect(() => {
    fetchSecurityStatus();
  }, []);

  const fetchSecurityStatus = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch("/api/security/status", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setSecurityStatus(data);
      } else {
        setSecurityStatus({ hasPinSet: false, isLocked: false });
      }
    } catch (error) {
      console.error("Failed to fetch security status:", error);
      setSecurityStatus({ hasPinSet: false, isLocked: false });
    }
  };

  useEffect(() => {
    const search = async () => {
      if (searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }
      try {
        const results = await api.users.search(searchQuery);
        setSearchResults(results);
      } catch (error) {
        console.error("Search failed", error);
      }
    };
    const timer = setTimeout(search, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const isLargeTransfer = parseFloat(amount) > LARGE_TRANSFER_THRESHOLD;

  const handleInitiateTransfer = () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    if (isLargeTransfer && securityStatus?.isLocked) {
      toast({
        title: "PIN Locked",
        description: "Your PIN is temporarily locked due to too many failed attempts. Please try again later.",
        variant: "destructive",
      });
      return;
    }
    
    if (isLargeTransfer && securityStatus?.hasPinSet) {
      setShowPinDialog(true);
    } else if (isLargeTransfer && !securityStatus?.hasPinSet) {
      toast({
        title: "PIN Required",
        description: "Please set up your transaction PIN in Security settings before making large transfers.",
        variant: "destructive",
      });
      setLocation("/security");
    } else {
      handleTransfer();
    }
  };

  const handleVerifyPinAndTransfer = async () => {
    if (pin.length !== 6) {
      toast({
        title: "Invalid PIN",
        description: "Please enter your 6-digit PIN",
        variant: "destructive",
      });
      return;
    }

    setPinVerifying(true);
    try {
      const token = getAuthToken();
      const response = await fetch("/api/security/pin/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ pin })
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setShowPinDialog(false);
        setPin("");
        await handleTransfer();
      } else {
        toast({
          title: "PIN Verification Failed",
          description: data.message || "Invalid PIN",
          variant: "destructive",
        });
        if (response.status === 423) {
          setShowPinDialog(false);
          setPin("");
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to verify PIN",
        variant: "destructive",
      });
    } finally {
      setPinVerifying(false);
    }
  };

  const handleTransfer = async () => {
    setLoading(true);
    setStep(3);

    try {
      await api.transfer.send({
        receiverId: selectedUser.id,
        amount,
        note,
      });

      await refreshUser();

      setTimeout(() => {
        setStep(1);
        setAmount("");
        setNote("");
        setSelectedUser(null);
        toast({
          title: "Transfer Successful",
          description: `₱${parseFloat(amount).toLocaleString()} sent to ${selectedUser.fullName}`,
        });
        setLocation("/");
      }, 2000);
    } catch (error: any) {
      toast({
        title: "Transfer Failed",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <header className="mb-6">
        <h1 className="text-2xl font-display font-bold">Transfer Money</h1>
        <p className="text-muted-foreground">Send funds securely to friends or businesses.</p>
      </header>

      {step === 1 && (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search name, username, or email" 
              className="pl-10 h-12 rounded-xl bg-card border-border/60"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-user"
            />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              {searchQuery ? "Search Results" : "Find Payverse Users"}
            </h3>
            {searchResults.length === 0 && searchQuery.length >= 2 && (
              <div className="text-center py-8 text-muted-foreground">
                No users found
              </div>
            )}
            {searchResults.length === 0 && searchQuery.length < 2 && (
              <div className="text-center py-8 text-muted-foreground">
                Start typing to search for users
              </div>
            )}
            {searchResults.map((contact) => (
              <div 
                key={contact.id} 
                className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/50 hover:border-primary/30 cursor-pointer transition-all" 
                onClick={() => {
                  setSelectedUser(contact);
                  setStep(2);
                }}
                data-testid={`user-result-${contact.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/5 flex items-center justify-center text-primary font-bold">
                    {contact.fullName.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{contact.fullName}</p>
                    <p className="text-xs text-muted-foreground">@{contact.username}</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 2 && selectedUser && (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <div className="p-6 rounded-2xl bg-card border border-border shadow-sm text-center">
            <div className="h-16 w-16 mx-auto rounded-full bg-pink-100 text-pink-600 flex items-center justify-center font-bold text-2xl mb-3">
              {selectedUser.fullName.substring(0, 2).toUpperCase()}
            </div>
            <h2 className="text-xl font-bold">{selectedUser.fullName}</h2>
            <p className="text-sm text-muted-foreground">@{selectedUser.username} • Payverse User</p>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold ml-1">Amount</Label>
              <div className="relative mt-2">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-3xl font-bold text-muted-foreground">₱</span>
                <Input 
                  type="number" 
                  placeholder="0.00" 
                  className="pl-10 h-20 text-4xl font-bold bg-transparent border-0 border-b-2 border-border rounded-none focus-visible:ring-0 focus-visible:border-primary px-4" 
                  autoFocus
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  step="0.01"
                  min="0"
                  data-testid="input-amount"
                />
              </div>
            </div>
            
            <div className="flex justify-between text-sm px-1">
              <span className="text-muted-foreground">Available PHPT Balance</span>
              <span className="font-medium">{parseFloat(user?.phptBalance || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })} PHPT</span>
            </div>

            {isLargeTransfer && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <Shield className="h-5 w-5 text-amber-600" />
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  PIN verification required for transfers above ₱{LARGE_TRANSFER_THRESHOLD.toLocaleString()}
                </p>
              </div>
            )}

            <div className="pt-4">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold ml-1 mb-2 block">Note (Optional)</Label>
              <Input 
                placeholder="What is this for?" 
                className="bg-card border-border/60 h-12 rounded-xl"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                data-testid="input-note"
              />
            </div>
          </div>

          <div className="fixed bottom-20 left-4 right-4 md:static md:mt-8">
            <Button 
              onClick={handleInitiateTransfer} 
              className="w-full h-14 text-lg font-medium shadow-lg shadow-primary/20 rounded-xl"
              disabled={loading || !amount || parseFloat(amount) <= 0}
              data-testid="button-send"
            >
              {loading ? "Processing..." : "Send Money"}
            </Button>
            <Button variant="ghost" onClick={() => setStep(1)} className="w-full mt-2" disabled={loading}>Cancel</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col items-center justify-center py-12 animate-in zoom-in-95 duration-500">
          <div className="h-24 w-24 rounded-full bg-green-100 text-green-600 flex items-center justify-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-check"><path d="M20 6 9 17l-5-5"/></svg>
          </div>
          <h2 className="text-2xl font-bold mb-2">Processing...</h2>
          <p className="text-muted-foreground text-center max-w-xs">
            Your transaction is being processed securely. This should only take a moment.
          </p>
        </div>
      )}

      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              PIN Verification Required
            </DialogTitle>
            <DialogDescription>
              For your security, please enter your 6-digit PIN to authorize this large transfer of ₱{parseFloat(amount || "0").toLocaleString()}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pin">Transaction PIN</Label>
              <Input
                id="pin"
                type="password"
                placeholder="Enter 6-digit PIN"
                className="text-center text-2xl tracking-widest"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                autoFocus
                data-testid="input-pin"
              />
            </div>
            
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
              <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Never share your PIN with anyone. PayVerse staff will never ask for your PIN.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={() => { setShowPinDialog(false); setPin(""); }}
              className="flex-1"
              disabled={pinVerifying}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleVerifyPinAndTransfer}
              className="flex-1"
              disabled={pin.length !== 6 || pinVerifying}
              data-testid="button-verify-pin"
            >
              {pinVerifying ? "Verifying..." : "Verify & Send"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
