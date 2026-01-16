import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Wallet,
  Plus,
  Trash2,
  Star,
  Edit2,
  Loader2,
  Building2,
  Smartphone,
  CreditCard,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAuthToken } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface BankAccount {
  id: number;
  accountType: string;
  bankName: string | null;
  accountNumber: string;
  accountName: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

const ACCOUNT_TYPES = [
  { value: "gcash", label: "GCash", icon: Smartphone },
  { value: "maya", label: "Maya", icon: Smartphone },
  { value: "grabpay", label: "GrabPay", icon: Smartphone },
  { value: "bank", label: "Bank Transfer", icon: Building2 },
];

const BANKS = [
  "BDO",
  "BPI",
  "Metrobank",
  "Landbank",
  "PNB",
  "Security Bank",
  "UnionBank",
  "RCBC",
  "Chinabank",
  "EastWest Bank",
  "UCPB",
  "PSBank",
  "Other",
];

export default function BankAccounts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [processing, setProcessing] = useState(false);

  // Form state
  const [accountType, setAccountType] = useState("gcash");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");

  const getAuthHeaders = useCallback(() => {
    const token = getAuthToken();
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const response = await fetch("/api/manual/bank-accounts", {
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      if (Array.isArray(data)) {
        setAccounts(data);
      }
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const resetForm = () => {
    setAccountType("gcash");
    setBankName("");
    setAccountNumber("");
    setAccountName(user?.fullName || "");
  };

  const handleAddAccount = async () => {
    if (!accountNumber.trim()) {
      toast({ title: "Error", description: "Account number is required", variant: "destructive" });
      return;
    }

    if (!accountName.trim()) {
      toast({ title: "Error", description: "Account name is required", variant: "destructive" });
      return;
    }

    if (accountType === "bank" && !bankName) {
      toast({ title: "Error", description: "Please select a bank", variant: "destructive" });
      return;
    }

    setProcessing(true);
    try {
      const response = await fetch("/api/manual/bank-accounts", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          accountType,
          bankName: accountType === "bank" ? bankName : null,
          accountNumber: accountNumber.trim(),
          accountName: accountName.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({ title: "Success", description: "Account added successfully" });
        setShowAddDialog(false);
        resetForm();
        fetchAccounts();
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const handleEditAccount = async () => {
    if (!selectedAccount) return;

    if (!accountNumber.trim()) {
      toast({ title: "Error", description: "Account number is required", variant: "destructive" });
      return;
    }

    if (!accountName.trim()) {
      toast({ title: "Error", description: "Account name is required", variant: "destructive" });
      return;
    }

    setProcessing(true);
    try {
      const response = await fetch(`/api/manual/bank-accounts/${selectedAccount.id}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          accountType,
          bankName: accountType === "bank" ? bankName : null,
          accountNumber: accountNumber.trim(),
          accountName: accountName.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({ title: "Success", description: "Account updated successfully" });
        setShowEditDialog(false);
        setSelectedAccount(null);
        fetchAccounts();
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!selectedAccount) return;

    setProcessing(true);
    try {
      const response = await fetch(`/api/manual/bank-accounts/${selectedAccount.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (data.success) {
        toast({ title: "Success", description: "Account deleted successfully" });
        setShowDeleteDialog(false);
        setSelectedAccount(null);
        fetchAccounts();
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const handleSetDefault = async (account: BankAccount) => {
    try {
      const response = await fetch(`/api/manual/bank-accounts/${account.id}/set-default`, {
        method: "POST",
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (data.success) {
        toast({ title: "Success", description: "Default account updated" });
        fetchAccounts();
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const openEditDialog = (account: BankAccount) => {
    setSelectedAccount(account);
    setAccountType(account.accountType);
    setBankName(account.bankName || "");
    setAccountNumber(account.accountNumber);
    setAccountName(account.accountName);
    setShowEditDialog(true);
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
      return account.bankName;
    }
    return account.accountType.toUpperCase();
  };

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
              <h1 className="text-2xl font-display font-bold">My Accounts</h1>
              <p className="text-muted-foreground">Manage your bank and e-wallet accounts for withdrawals</p>
            </div>
            <Button onClick={() => { resetForm(); setAccountName(user?.fullName || ""); setShowAddDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Account
            </Button>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : accounts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">No accounts yet</h3>
              <p className="text-muted-foreground mb-4">
                Add your bank or e-wallet account to receive manual withdrawals
              </p>
              <Button onClick={() => { resetForm(); setAccountName(user?.fullName || ""); setShowAddDialog(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Account
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {accounts.map((account) => {
              const Icon = getAccountIcon(account.accountType);
              return (
                <Card key={account.id} className={account.isDefault ? "border-primary" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                        account.accountType === "gcash" ? "bg-blue-100 text-blue-600" :
                        account.accountType === "maya" ? "bg-green-100 text-green-600" :
                        account.accountType === "grabpay" ? "bg-emerald-100 text-emerald-600" :
                        "bg-slate-100 text-slate-600"
                      }`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{getAccountLabel(account)}</span>
                          {account.isDefault && (
                            <Badge variant="secondary" className="text-xs">
                              <Star className="h-3 w-3 mr-1" />
                              Default
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{account.accountNumber}</p>
                        <p className="text-sm text-muted-foreground">{account.accountName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!account.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSetDefault(account)}
                            title="Set as default"
                          >
                            <Star className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(account)}
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setSelectedAccount(account); setShowDeleteDialog(true); }}
                          title="Delete"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Withdrawal CTA */}
        {accounts.length > 0 && (
          <Card className="mt-6 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium mb-1">Ready to withdraw?</h3>
                  <p className="text-sm text-muted-foreground">Request a manual withdrawal to your saved account</p>
                </div>
                <Button onClick={() => navigate("/manual-withdrawal")}>
                  Request Withdrawal
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add Account Dialog */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Account</DialogTitle>
              <DialogDescription>Add a bank or e-wallet account for receiving withdrawals</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label>Account Type</Label>
                <Select value={accountType} onValueChange={setAccountType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {accountType === "bank" && (
                <div>
                  <Label>Bank Name</Label>
                  <Select value={bankName} onValueChange={setBankName}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {BANKS.map((bank) => (
                        <SelectItem key={bank} value={bank}>
                          {bank}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>{accountType === "bank" ? "Account Number" : "Mobile Number"}</Label>
                <Input
                  placeholder={accountType === "bank" ? "Enter account number" : "09XXXXXXXXX"}
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                />
              </div>

              <div>
                <Label>Account Name</Label>
                <Input
                  placeholder="Name as registered"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)} disabled={processing}>
                Cancel
              </Button>
              <Button onClick={handleAddAccount} disabled={processing}>
                {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Add Account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Account Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Account</DialogTitle>
              <DialogDescription>Update your account details</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label>Account Type</Label>
                <Select value={accountType} onValueChange={setAccountType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {accountType === "bank" && (
                <div>
                  <Label>Bank Name</Label>
                  <Select value={bankName} onValueChange={setBankName}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {BANKS.map((bank) => (
                        <SelectItem key={bank} value={bank}>
                          {bank}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>{accountType === "bank" ? "Account Number" : "Mobile Number"}</Label>
                <Input
                  placeholder={accountType === "bank" ? "Enter account number" : "09XXXXXXXXX"}
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                />
              </div>

              <div>
                <Label>Account Name</Label>
                <Input
                  placeholder="Name as registered"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={processing}>
                Cancel
              </Button>
              <Button onClick={handleEditAccount} disabled={processing}>
                {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Account</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this account? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAccount}
                disabled={processing}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
