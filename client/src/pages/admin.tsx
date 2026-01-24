import { useState, useEffect } from "react";
import AppLayout from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Users,
  ArrowUpDown,
  ArrowDownLeft,
  ArrowUpRight,
  Bitcoin,
  RefreshCw,
  Shield,
  TrendingUp,
  Send,
  Wallet,
  UserCheck,
  Link2,
  Search,
  CheckCircle,
  XCircle,
  DollarSign,
  History,
  AlertTriangle,
  AlertCircle,
  Upload,
  Plus,
  Trash2,
  Eye,
  Building2,
  Smartphone,
  FileText,
  Camera,
  MapPin,
  Key,
  Settings,
  Home,
  UserPlus,
  FileSpreadsheet,
} from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { getAuthToken } from "@/lib/api";

interface KycDocument {
  id: number;
  documentType: string;
  documentUrl: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
}

interface AdminStats {
  totalUsers: number;
  totalTransactions: number;
  totalVolume: string;
  activeUsers: number;
  verifiedUsers: number;
  cryptoConnections: number;
}

interface CryptoState {
  data: any;
  error: string | null;
  configError: boolean;
}

interface AdminUser {
  id: number;
  email: string;
  fullName: string;
  username: string;
  accountNumber?: string;
  phptBalance: string;
  kycStatus: string;
  isActive: boolean;
  isAdmin: boolean;
  role: "super_admin" | "admin" | "support" | "user";
  createdAt: string;
}

interface UserDetailTransaction {
  id: number;
  referenceNumber?: string;
  amount: string;
  type: string;
  status: string;
  createdAt: string;
  note?: string;
}

interface AuditLog {
  id: number;
  adminId: number;
  action: string;
  targetType: string;
  targetId: number | null;
  details: string | null;
  previousValue: string | null;
  newValue: string | null;
  riskLevel: "critical" | "high" | "medium" | "low" | null;
  ipAddress: string | null;
  userAgent: string | null;
  sessionId: string | null;
  requestMethod: string | null;
  requestPath: string | null;
  createdAt: string;
}

interface BalanceAdjustment {
  id: number;
  adminId: number;
  userId: number;
  amount: string;
  adjustmentType: string;
  reason: string;
  previousBalance: string;
  newBalance: string;
  createdAt: string;
}

interface PendingQrphTransaction {
  id: number;
  senderId: number;
  amount: string;
  type: string;
  status: string;
  note: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
  username: string | null;
}

export default function Admin() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [crypto, setCrypto] = useState<CryptoState>({ data: null, error: null, configError: false });
  const [pendingKyc, setPendingKyc] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [adjustments, setAdjustments] = useState<BalanceAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [userSearch, setUserSearch] = useState("");
  const [txStatusFilter, setTxStatusFilter] = useState("all");
  
  const [sendAmount, setSendAmount] = useState("");
  const [sendTelegramId, setSendTelegramId] = useState("");
  const [sendCurrency, setSendCurrency] = useState("11");
  const [sending, setSending] = useState(false);
  
  const [adjustUserId, setAdjustUserId] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustType, setAdjustType] = useState("credit");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [pendingDeposits, setPendingDeposits] = useState<any[]>([]);
  const [creditPendingDeposits, setCreditPendingDeposits] = useState<any[]>([]);
  const [newMethodLabel, setNewMethodLabel] = useState("");
  const [newMethodAccount, setNewMethodAccount] = useState("");
  const [newMethodNumber, setNewMethodNumber] = useState("");
  const [newMethodType, setNewMethodType] = useState("gcash");
  const [newMethodInstructions, setNewMethodInstructions] = useState("");
  const [addingMethod, setAddingMethod] = useState(false);
  const [processingDeposit, setProcessingDeposit] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [retryingDeposit, setRetryingDeposit] = useState<number | null>(null);
  
  const [kycDialogOpen, setKycDialogOpen] = useState(false);
  const [selectedKycUser, setSelectedKycUser] = useState<AdminUser | null>(null);
  const [kycDocuments, setKycDocuments] = useState<KycDocument[]>([]);
  const [loadingKycDocs, setLoadingKycDocs] = useState(false);
  const [kycRejectReason, setKycRejectReason] = useState("");
  
  const [pendingQrph, setPendingQrph] = useState<PendingQrphTransaction[]>([]);
  const [processingQrph, setProcessingQrph] = useState<number | null>(null);
  const [processingAllQrph, setProcessingAllQrph] = useState(false);
  const [registeringPaygram, setRegisteringPaygram] = useState<number | null>(null);

  // Manual Withdrawals state
  const [pendingWithdrawals, setPendingWithdrawals] = useState<any[]>([]);
  const [allWithdrawals, setAllWithdrawals] = useState<any[]>([]);
  const [processingWithdrawal, setProcessingWithdrawal] = useState<number | null>(null);
  const [withdrawalRejectReason, setWithdrawalRejectReason] = useState("");

  // Manual Transaction Detail Modal state
  const [selectedManualTx, setSelectedManualTx] = useState<any | null>(null);
  const [manualTxModalOpen, setManualTxModalOpen] = useState(false);
  const [manualTxFilter, setManualTxFilter] = useState<"all" | "deposits" | "withdrawals">("all");

  // Telegram Topup/Cashout state
  const [telegramUserId, setTelegramUserId] = useState("");
  const [telegramAmount, setTelegramAmount] = useState("");
  const [telegramNote, setTelegramNote] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [telegramAction, setTelegramAction] = useState<"topup" | "cashout">("topup");
  const [processingTelegram, setProcessingTelegram] = useState(false);
  const [telegramTransactions, setTelegramTransactions] = useState<any[]>([]);
  const [generatedTelegramLink, setGeneratedTelegramLink] = useState<string | null>(null);

  // Note: Escrow management is done via Dashboard Top Up/Cash Out buttons for super admin

  // User Detail View state
  const [userDetailDialogOpen, setUserDetailDialogOpen] = useState(false);
  const [selectedUserDetail, setSelectedUserDetail] = useState<AdminUser | null>(null);
  const [userDetailTransactions, setUserDetailTransactions] = useState<UserDetailTransaction[]>([]);
  const [userDetailKycDocs, setUserDetailKycDocs] = useState<KycDocument[]>([]);
  const [loadingUserDetail, setLoadingUserDetail] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    if (user?.isAdmin) {
      fetchAdminData();

      // Silent background refresh every 30 seconds (no loading indicators)
      const refreshInterval = setInterval(() => {
        if (!document.hidden) {
          fetchAdminData(true); // silent mode
        }
      }, 30000);

      return () => clearInterval(refreshInterval);
    }
  }, [user]);

  const getAuthHeaders = () => {
    const token = getAuthToken();
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };
  };

  const fetchAdminData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [statsRes, usersRes, txRes, cryptoRes, kycRes, logsRes, adjRes, methodsRes, depositsRes, creditPendingRes, qrphRes, withdrawalsRes, telegramTxRes] = await Promise.all([
        fetch("/api/admin/stats", { headers: getAuthHeaders() }),
        fetch("/api/admin/users", { headers: getAuthHeaders() }),
        fetch("/api/admin/transactions", { headers: getAuthHeaders() }),
        fetch("/api/admin/crypto/balances", { headers: getAuthHeaders() }),
        fetch("/api/admin/kyc/pending", { headers: getAuthHeaders() }),
        fetch("/api/admin/audit-logs", { headers: getAuthHeaders() }),
        fetch("/api/admin/balance/adjustments", { headers: getAuthHeaders() }),
        fetch("/api/manual/admin/payment-methods", { headers: getAuthHeaders() }),
        fetch("/api/manual/admin/deposits/pending", { headers: getAuthHeaders() }),
        fetch("/api/manual/admin/deposits/credit-pending", { headers: getAuthHeaders() }),
        fetch("/api/admin/qrph/pending", { headers: getAuthHeaders() }),
        fetch("/api/manual/admin/withdrawals", { headers: getAuthHeaders() }),
        fetch("/api/admin/telegram/transactions", { headers: getAuthHeaders() })
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
      if (txRes.ok) setTransactions(await txRes.json());
      if (kycRes.ok) setPendingKyc(await kycRes.json());
      if (logsRes.ok) setAuditLogs(await logsRes.json());
      if (adjRes.ok) setAdjustments(await adjRes.json());
      if (methodsRes.ok) setPaymentMethods(await methodsRes.json());
      if (depositsRes.ok) setPendingDeposits(await depositsRes.json());
      if (creditPendingRes.ok) setCreditPendingDeposits(await creditPendingRes.json());
      if (qrphRes.ok) setPendingQrph(await qrphRes.json());
      if (withdrawalsRes.ok) {
        const withdrawals = await withdrawalsRes.json();
        setAllWithdrawals(withdrawals);
        setPendingWithdrawals(withdrawals.filter((w: any) => w.status === "pending" || w.status === "processing"));
      }
      if (telegramTxRes.ok) {
        const telegramData = await telegramTxRes.json();
        setTelegramTransactions(telegramData.transactions || []);
      }

      if (cryptoRes.ok) {
        setCrypto({ data: await cryptoRes.json(), error: null, configError: false });
      } else if (cryptoRes.status === 503) {
        setCrypto({ data: null, error: "Admin PayGram token not configured", configError: true });
      } else {
        setCrypto({ data: null, error: "Failed to load crypto data", configError: false });
      }
    } catch (error) {
      if (!silent) {
        console.error("Failed to fetch admin data:", error);
        toast({
          title: "Error",
          description: "Failed to load admin data",
          variant: "destructive"
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleSearchUsers = async () => {
    try {
      const response = await fetch(`/api/admin/users/search?q=${encodeURIComponent(userSearch)}`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        setUsers(await response.json());
      }
    } catch (error) {
      toast({ title: "Error", description: "Search failed", variant: "destructive" });
    }
  };

  const handleFilterTransactions = async () => {
    try {
      let url = "/api/admin/transactions/search?";
      if (txStatusFilter !== "all") url += `status=${txStatusFilter}`;
      
      const response = await fetch(url, { headers: getAuthHeaders() });
      if (response.ok) {
        setTransactions(await response.json());
      }
    } catch (error) {
      toast({ title: "Error", description: "Filter failed", variant: "destructive" });
    }
  };

  const handleUpdateUser = async (userId: number, updates: { isActive?: boolean; isAdmin?: boolean }) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(updates)
      });
      
      if (response.ok) {
        toast({ title: "Success", description: "User updated" });
        fetchAdminData();
      } else {
        const error = await response.json();
        throw new Error(error.message || "Failed to update");
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update user", variant: "destructive" });
    }
  };

  const handleUpdateRole = async (userId: number, role: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ role })
      });
      
      if (response.ok) {
        toast({ title: "Success", description: "Role updated successfully" });
        fetchAdminData();
      } else {
        const error = await response.json();
        throw new Error(error.message || "Failed to update role");
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update role", variant: "destructive" });
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "super_admin": return "destructive";
      case "admin": return "default";
      case "support": return "secondary";
      default: return "outline";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "super_admin": return "Super Admin";
      case "admin": return "Admin";
      case "support": return "Support";
      default: return "User";
    }
  };

  const canEditRole = (targetUser: AdminUser) => {
    if (user?.role !== "super_admin") return false;
    if (targetUser.id === user?.id) return false;
    if (targetUser.role === "super_admin") return false;
    return true;
  };

  // Handle viewing user details (profile, KYC, transactions)
  const handleViewUserDetail = async (targetUser: AdminUser) => {
    setSelectedUserDetail(targetUser);
    setUserDetailDialogOpen(true);
    setLoadingUserDetail(true);
    setUserDetailTransactions([]);
    setUserDetailKycDocs([]);

    try {
      // Fetch user's transactions and KYC documents in parallel
      const [txResponse, kycResponse] = await Promise.all([
        fetch(`/api/admin/users/${targetUser.id}/transactions`, { headers: getAuthHeaders() }),
        fetch(`/api/admin/kyc/${targetUser.id}/documents`, { headers: getAuthHeaders() })
      ]);

      if (txResponse.ok) {
        const txData = await txResponse.json();
        setUserDetailTransactions(txData);
      }

      if (kycResponse.ok) {
        const kycData = await kycResponse.json();
        setUserDetailKycDocs(kycData);
      }
    } catch (error) {
      console.error("Failed to fetch user details:", error);
      toast({ title: "Error", description: "Failed to load user details", variant: "destructive" });
    } finally {
      setLoadingUserDetail(false);
    }
  };

  const handleViewKycDocuments = async (kycUser: AdminUser) => {
    setSelectedKycUser(kycUser);
    setKycDialogOpen(true);
    setLoadingKycDocs(true);
    setKycRejectReason("");

    try {
      const response = await fetch(`/api/admin/kyc/${kycUser.id}/documents`, { headers: getAuthHeaders() });
      if (response.ok) {
        setKycDocuments(await response.json());
      } else {
        setKycDocuments([]);
      }
    } catch (error) {
      console.error("Failed to fetch KYC documents:", error);
      setKycDocuments([]);
    } finally {
      setLoadingKycDocs(false);
    }
  };

  const handleKycAction = async (userId: number, action: "approve" | "reject", reason?: string) => {
    try {
      const response = await fetch(`/api/admin/kyc/${userId}/${action}`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason })
      });
      
      if (response.ok) {
        toast({ title: "Success", description: `KYC ${action}d successfully` });
        setKycDialogOpen(false);
        setSelectedKycUser(null);
        fetchAdminData();
      } else {
        throw new Error(`Failed to ${action} KYC`);
      }
    } catch (error) {
      toast({ title: "Error", description: `Failed to ${action} KYC`, variant: "destructive" });
    }
  };

  const handleBalanceAdjust = async () => {
    const userId = parseInt(adjustUserId);
    const amt = parseFloat(adjustAmount);
    
    if (!adjustUserId || isNaN(userId) || userId <= 0) {
      toast({ title: "Error", description: "Please enter a valid user ID", variant: "destructive" });
      return;
    }
    if (!adjustAmount || isNaN(amt) || amt <= 0) {
      toast({ title: "Error", description: "Please enter a valid amount greater than 0", variant: "destructive" });
      return;
    }
    if (!adjustReason || adjustReason.length < 10) {
      toast({ title: "Error", description: "Reason must be at least 10 characters", variant: "destructive" });
      return;
    }
    
    setAdjusting(true);
    try {
      const response = await fetch("/api/admin/balance/adjust", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          userId,
          amount: adjustAmount,
          adjustmentType: adjustType,
          reason: adjustReason
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({ title: "Success", description: `Balance adjusted. New balance: ₱${data.newBalance}` });
        setAdjustUserId("");
        setAdjustAmount("");
        setAdjustReason("");
        fetchAdminData();
      } else {
        toast({ title: "Error", description: data.message || "Failed to adjust", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setAdjusting(false);
    }
  };

  const handleSendCrypto = async () => {
    if (!sendTelegramId || !sendAmount) {
      toast({ title: "Error", description: "Please fill all fields", variant: "destructive" });
      return;
    }
    
    setSending(true);
    try {
      const response = await fetch("/api/admin/crypto/send", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          telegramId: sendTelegramId,
          amount: parseFloat(sendAmount),
          currency: parseInt(sendCurrency)
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({ title: "Success", description: "Crypto sent successfully" });
        setSendAmount("");
        setSendTelegramId("");
        fetchAdminData();
      } else {
        toast({ title: "Error", description: data.message || "Failed to send", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleAddPaymentMethod = async () => {
    if (!newMethodLabel || !newMethodAccount || !newMethodNumber) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }
    
    setAddingMethod(true);
    try {
      const response = await fetch("/api/manual/admin/payment-methods", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          label: newMethodLabel,
          accountName: newMethodAccount,
          accountNumber: newMethodNumber,
          providerType: newMethodType,
          instructions: newMethodInstructions || null
        })
      });
      
      if (response.ok) {
        toast({ title: "Success", description: "Payment method added" });
        setNewMethodLabel("");
        setNewMethodAccount("");
        setNewMethodNumber("");
        setNewMethodInstructions("");
        fetchAdminData();
      } else {
        const error = await response.json();
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setAddingMethod(false);
    }
  };

  const handleDeletePaymentMethod = async (id: number) => {
    try {
      const response = await fetch(`/api/manual/admin/payment-methods/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      
      if (response.ok) {
        toast({ title: "Success", description: "Payment method deleted" });
        fetchAdminData();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  const handleApproveDeposit = async (id: number) => {
    setProcessingDeposit(id);
    try {
      const response = await fetch(`/api/manual/admin/deposits/${id}/approve`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({})
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({ title: "Success", description: "Deposit approved and PHPT credited" });
        fetchAdminData();
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessingDeposit(null);
    }
  };

  const handleRejectDeposit = async (id: number) => {
    if (!rejectReason || rejectReason.length < 5) {
      toast({ title: "Error", description: "Please provide a reason (min 5 chars)", variant: "destructive" });
      return;
    }
    
    setProcessingDeposit(id);
    try {
      const response = await fetch(`/api/manual/admin/deposits/${id}/reject`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ rejectionReason: rejectReason })
      });
      
      if (response.ok) {
        toast({ title: "Success", description: "Deposit rejected" });
        setRejectReason("");
        fetchAdminData();
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessingDeposit(null);
    }
  };

  const handleRetryCredit = async (id: number) => {
    setRetryingDeposit(id);
    try {
      const response = await fetch(`/api/manual/admin/deposits/${id}/retry`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({})
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({ title: "Success", description: "PHPT credited successfully" });
        fetchAdminData();
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setRetryingDeposit(null);
    }
  };

  const handleProcessQrph = async (id: number) => {
    setProcessingQrph(id);
    try {
      const response = await fetch(`/api/admin/qrph/process/${id}`, {
        method: "POST",
        headers: getAuthHeaders()
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({ title: "Success", description: data.message });
        fetchAdminData();
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessingQrph(null);
    }
  };

  const handleProcessAllQrph = async () => {
    setProcessingAllQrph(true);
    try {
      const response = await fetch("/api/admin/qrph/process-all", {
        method: "POST",
        headers: getAuthHeaders()
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({ 
          title: "Batch Processing Complete", 
          description: `Processed ${data.processed}/${data.total} transactions` 
        });
        fetchAdminData();
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessingAllQrph(false);
    }
  };

  const handleRegisterPaygram = async (userId: number, username: string) => {
    setRegisteringPaygram(userId);
    try {
      const response = await fetch(`/api/admin/users/${userId}/register-paygram`, {
        method: "POST",
        headers: getAuthHeaders()
      });

      const data = await response.json();

      if (data.success) {
        toast({ title: "Success", description: `${username} registered on PayGram successfully` });
      } else {
        toast({ title: "Info", description: data.message || "User may already be registered on PayGram", variant: "default" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setRegisteringPaygram(null);
    }
  };

  // Manual Withdrawal Handlers
  const handleProcessWithdrawal = async (id: number) => {
    setProcessingWithdrawal(id);
    try {
      const response = await fetch(`/api/manual/admin/withdrawals/${id}/process`, {
        method: "POST",
        headers: getAuthHeaders()
      });

      const data = await response.json();

      if (data.success) {
        toast({ title: "Success", description: "Withdrawal marked as processing" });
        fetchAdminData();
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessingWithdrawal(null);
    }
  };

  const handleCompleteWithdrawal = async (id: number) => {
    setProcessingWithdrawal(id);
    try {
      const response = await fetch(`/api/manual/admin/withdrawals/${id}/complete`, {
        method: "POST",
        headers: getAuthHeaders()
      });

      const data = await response.json();

      if (data.success) {
        toast({ title: "Success", description: "Withdrawal completed successfully" });
        fetchAdminData();
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessingWithdrawal(null);
    }
  };

  const handleRejectWithdrawal = async (id: number) => {
    if (!withdrawalRejectReason || withdrawalRejectReason.length < 5) {
      toast({ title: "Error", description: "Please provide a reason (min 5 chars)", variant: "destructive" });
      return;
    }

    setProcessingWithdrawal(id);
    try {
      const response = await fetch(`/api/manual/admin/withdrawals/${id}/reject`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ rejectionReason: withdrawalRejectReason })
      });

      const data = await response.json();

      if (data.success) {
        toast({ title: "Success", description: "Withdrawal rejected and funds refunded" });
        setWithdrawalRejectReason("");
        fetchAdminData();
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessingWithdrawal(null);
    }
  };

  const getAccountTypeIcon = (type: string) => {
    switch (type) {
      case "gcash": return <Smartphone className="h-4 w-4 text-blue-500" />;
      case "maya": return <Smartphone className="h-4 w-4 text-green-500" />;
      case "grabpay": return <Smartphone className="h-4 w-4 text-emerald-500" />;
      case "bank": return <Building2 className="h-4 w-4 text-slate-600" />;
      default: return <Wallet className="h-4 w-4" />;
    }
  };

  const getWithdrawalStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="secondary">Pending</Badge>;
      case "processing": return <Badge variant="default" className="bg-blue-500">Processing</Badge>;
      case "completed": return <Badge variant="default" className="bg-green-500">Completed</Badge>;
      case "rejected": return <Badge variant="destructive">Rejected</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (!user?.isAdmin) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-24">
          <Shield className="h-16 w-16 text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">Admin privileges required</p>
        </div>
      </AppLayout>
    );
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-24">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  const filteredUsers = userSearch 
    ? users.filter(u => 
        u.fullName.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.username.toLowerCase().includes(userSearch.toLowerCase())
      )
    : users;

  return (
    <AppLayout>
      <header className="mb-6 flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <Shield className="h-6 w-6" />
              Admin Dashboard
            </h1>
            {user?.role === "super_admin" && (
              <Badge variant="destructive" className="text-xs" data-testid="badge-super-admin">
                Super Admin
              </Badge>
            )}
            {user?.role === "admin" && (
              <Badge variant="default" className="text-xs" data-testid="badge-admin-role">
                Admin
              </Badge>
            )}
            {user?.role === "support" && (
              <Badge variant="secondary" className="text-xs" data-testid="badge-support-role">
                Support
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            Manage PayVerse platform
            {user?.role === "super_admin" && " • Full access to all features"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard")}
            data-testid="button-admin-home"
          >
            <Home className="h-4 w-4 mr-2" />
            Home
          </Button>
          {user?.role === "super_admin" && (
            <Button
              variant="default"
              onClick={() => navigate("/admin/settings")}
              className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700"
              data-testid="button-system-settings"
            >
              <Key className="h-4 w-4 mr-2" />
              System Settings
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => navigate("/admin/reports")}
            data-testid="button-reports"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Reports
          </Button>
          <Button variant="outline" onClick={() => fetchAdminData()} disabled={loading} data-testid="button-refresh-admin">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </header>

      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Users</p>
                  <p className="text-2xl font-bold">{stats.totalUsers}</p>
                  <p className="text-xs text-muted-foreground">{stats.activeUsers} active</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <UserCheck className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Verified Users</p>
                  <p className="text-2xl font-bold">{stats.verifiedUsers}</p>
                  <p className="text-xs text-muted-foreground">KYC completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                  <Link2 className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Crypto Wallets</p>
                  <p className="text-2xl font-bold">{stats.cryptoConnections}</p>
                  <p className="text-xs text-muted-foreground">PayGram linked</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <ArrowUpDown className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Transactions</p>
                  <p className="text-2xl font-bold">{stats.totalTransactions}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pending KYC</p>
                  <p className="text-2xl font-bold">{pendingKyc.length}</p>
                  <p className="text-xs text-muted-foreground">Awaiting review</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-teal-100 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-teal-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Balances</p>
                  <p className="text-2xl font-bold">₱{parseFloat(stats.totalVolume).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="users" className="space-y-6">
        <TabsList className="grid w-full grid-cols-9">
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Users</span>
          </TabsTrigger>
          <TabsTrigger value="kyc" data-testid="tab-kyc">
            <UserCheck className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">KYC</span>
          </TabsTrigger>
          <TabsTrigger value="transactions" data-testid="tab-transactions">
            <ArrowUpDown className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Tx</span>
          </TabsTrigger>
          <TabsTrigger value="balance" data-testid="tab-balance">
            <DollarSign className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Balance</span>
          </TabsTrigger>
          <TabsTrigger value="manual" data-testid="tab-manual">
            <Building2 className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Manual</span>
            {(pendingDeposits.length + pendingWithdrawals.length) > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                {pendingDeposits.length + pendingWithdrawals.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="qrph" data-testid="tab-qrph">
            <Smartphone className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">QRPH</span>
            {pendingQrph.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                {pendingQrph.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="telegram" data-testid="tab-telegram">
            <Send className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Telegram</span>
          </TabsTrigger>
          <TabsTrigger value="crypto" data-testid="tab-crypto">
            <Bitcoin className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Crypto</span>
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">
            <History className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Logs</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>Manage user accounts and permissions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchUsers()}
                  className="max-w-sm"
                  data-testid="input-user-search"
                />
                <Button variant="outline" onClick={handleSearchUsers} data-testid="button-search-users">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="space-y-4">
                {filteredUsers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between p-4 rounded-lg border" data-testid={`user-row-${u.id}`}>
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="font-semibold text-primary">{u.fullName.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="font-medium">{u.fullName}</p>
                        <p className="text-sm text-muted-foreground">@{u.username} • {u.email}</p>
                        <p className="text-xs text-muted-foreground">ID: {u.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant={u.kycStatus === "verified" ? "default" : u.kycStatus === "pending" ? "secondary" : "outline"}>
                        {u.kycStatus}
                      </Badge>
                      <Badge variant={getRoleBadgeVariant(u.role)} data-testid={`badge-role-${u.id}`}>
                        {getRoleLabel(u.role)}
                      </Badge>
                      <div className="text-right">
                        <p className="font-semibold" data-testid={`text-phpt-balance-${u.id}`}>
                          {parseFloat(u.phptBalance || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PHPT
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ≈ ₱{parseFloat(u.phptBalance || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleViewUserDetail(u)}
                        title="View user details"
                        data-testid={`button-view-user-${u.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRegisterPaygram(u.id, u.username)}
                        disabled={registeringPaygram === u.id}
                        title="Register user on PayGram (use if balance not syncing)"
                        data-testid={`button-register-paygram-${u.id}`}
                      >
                        {registeringPaygram === u.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <UserPlus className="h-4 w-4" />
                        )}
                      </Button>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Active</Label>
                        <Switch
                          checked={u.isActive}
                          onCheckedChange={(checked) => handleUpdateUser(u.id, { isActive: checked })}
                          disabled={u.id === user?.id || u.role === "super_admin"}
                          data-testid={`switch-active-${u.id}`}
                        />
                      </div>
                      {user?.role === "super_admin" && (
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">Role</Label>
                          <Select 
                            value={u.role} 
                            onValueChange={(role) => handleUpdateRole(u.id, role)}
                            disabled={!canEditRole(u)}
                          >
                            <SelectTrigger className="w-28" data-testid={`select-role-${u.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">User</SelectItem>
                              <SelectItem value="support">Support</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                              {u.role === "super_admin" && (
                                <SelectItem value="super_admin">Super Admin</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {user?.role !== "super_admin" && (
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">Admin</Label>
                          <Switch
                            checked={u.isAdmin}
                            onCheckedChange={(checked) => handleUpdateUser(u.id, { isAdmin: checked })}
                            disabled={u.id === user?.id || u.role === "super_admin"}
                            data-testid={`switch-admin-${u.id}`}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kyc">
          <Card>
            <CardHeader>
              <CardTitle>KYC Verification Queue</CardTitle>
              <CardDescription>Review and approve user verification requests</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingKyc.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <UserCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No pending KYC requests</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingKyc.map((u) => (
                    <div key={u.id} className="flex items-center justify-between p-4 rounded-lg border border-orange-200 bg-orange-50/50" data-testid={`kyc-row-${u.id}`}>
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                          <span className="font-semibold text-orange-600">{u.fullName.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="font-medium">{u.fullName}</p>
                          <p className="text-sm text-muted-foreground">@{u.username} • {u.email}</p>
                          <p className="text-xs text-muted-foreground">Submitted: {new Date(u.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleViewKycDocuments(u)}
                          data-testid={`button-kyc-view-${u.id}`}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View Documents
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>View and filter all platform transactions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Select value={txStatusFilter} onValueChange={setTxStatusFilter}>
                  <SelectTrigger className="w-40" data-testid="select-tx-status">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={handleFilterTransactions} data-testid="button-filter-tx">
                  Apply Filter
                </Button>
              </div>
              
              <div className="space-y-3">
                {transactions.slice(0, 50).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`tx-row-${tx.id}`}>
                    <div>
                      <p className="font-medium">{tx.type}</p>
                      <p className="text-sm text-muted-foreground">
                        ID: {tx.id} • Sender: {tx.senderId || "N/A"} → Receiver: {tx.receiverId || "N/A"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">₱{parseFloat(tx.amount).toLocaleString()}</p>
                      <Badge variant={tx.status === "completed" ? "default" : tx.status === "pending" ? "secondary" : "destructive"}>
                        {tx.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balance">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Balance Adjustment
                </CardTitle>
                <CardDescription>Credit or debit user balances with audit trail</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>User ID</Label>
                  <Input
                    type="number"
                    placeholder="Enter user ID"
                    value={adjustUserId}
                    onChange={(e) => setAdjustUserId(e.target.value)}
                    data-testid="input-adjust-userid"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Amount (₱)</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                      data-testid="input-adjust-amount"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={adjustType} onValueChange={setAdjustType}>
                      <SelectTrigger data-testid="select-adjust-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="credit">Credit (Add)</SelectItem>
                        <SelectItem value="debit">Debit (Remove)</SelectItem>
                        <SelectItem value="correction">Correction</SelectItem>
                        <SelectItem value="refund">Refund</SelectItem>
                        <SelectItem value="fee">Fee</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Reason (min 10 characters)</Label>
                  <Textarea
                    placeholder="Explain the reason for this adjustment..."
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    data-testid="input-adjust-reason"
                  />
                </div>
                <Button 
                  onClick={handleBalanceAdjust} 
                  disabled={adjusting || !adjustUserId || !adjustAmount || adjustReason.length < 10}
                  className="w-full"
                  data-testid="button-adjust-balance"
                >
                  {adjusting ? "Processing..." : "Apply Adjustment"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Adjustments</CardTitle>
                <CardDescription>History of balance modifications</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {adjustments.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No adjustments yet</p>
                  ) : (
                    adjustments.map((adj) => (
                      <div key={adj.id} className="p-3 rounded-lg border text-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <Badge variant={adj.adjustmentType === "credit" || adj.adjustmentType === "refund" ? "default" : "secondary"}>
                              {adj.adjustmentType}
                            </Badge>
                            <p className="mt-1 font-medium">User #{adj.userId}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">₱{parseFloat(adj.amount).toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">
                              ₱{parseFloat(adj.previousBalance).toLocaleString()} → ₱{parseFloat(adj.newBalance).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <p className="text-muted-foreground mt-2">{adj.reason}</p>
                        <p className="text-xs text-muted-foreground mt-1">{new Date(adj.createdAt).toLocaleString()}</p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="manual">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left Side: Payment Methods */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4" />
                  Payment Methods
                </CardTitle>
                <CardDescription className="text-xs">Manage receiving accounts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {paymentMethods.length === 0 ? (
                    <p className="text-muted-foreground text-center py-3 text-sm">No methods yet</p>
                  ) : (
                    paymentMethods.map((method: any) => (
                      <div key={method.id} className="p-2 rounded-lg border flex justify-between items-center text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <Badge variant={method.isActive ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                              {method.providerType}
                            </Badge>
                            <span className="font-medium truncate">{method.label}</span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{method.accountNumber}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDeletePaymentMethod(method.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t pt-3 space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add Method
                  </h4>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Input placeholder="Label" value={newMethodLabel} onChange={(e) => setNewMethodLabel(e.target.value)} className="h-8 text-sm" />
                    <Select value={newMethodType} onValueChange={setNewMethodType}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gcash">GCash</SelectItem>
                        <SelectItem value="maya">Maya</SelectItem>
                        <SelectItem value="grabpay">GrabPay</SelectItem>
                        <SelectItem value="bank">Bank</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Input placeholder="Account Name" value={newMethodAccount} onChange={(e) => setNewMethodAccount(e.target.value)} className="h-8 text-sm" />
                  <Input placeholder="Account Number" value={newMethodNumber} onChange={(e) => setNewMethodNumber(e.target.value)} className="h-8 text-sm" />
                  <Button onClick={handleAddPaymentMethod} disabled={addingMethod} className="w-full h-8 text-sm">
                    {addingMethod ? "Adding..." : "Add"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Right Side: Combined Transactions List */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ArrowUpDown className="h-4 w-4" />
                      Transactions
                      {(pendingDeposits.length + pendingWithdrawals.filter(w => w.status === "pending" || w.status === "processing").length) > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {pendingDeposits.length + pendingWithdrawals.filter(w => w.status === "pending" || w.status === "processing").length}
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-xs">Click to view details and take action</CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button variant={manualTxFilter === "all" ? "default" : "outline"} size="sm" className="h-7 text-xs px-2" onClick={() => setManualTxFilter("all")}>All</Button>
                    <Button variant={manualTxFilter === "deposits" ? "default" : "outline"} size="sm" className="h-7 text-xs px-2" onClick={() => setManualTxFilter("deposits")}>
                      Deposits {pendingDeposits.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{pendingDeposits.length}</Badge>}
                    </Button>
                    <Button variant={manualTxFilter === "withdrawals" ? "default" : "outline"} size="sm" className="h-7 text-xs px-2" onClick={() => setManualTxFilter("withdrawals")}>
                      Withdrawals {pendingWithdrawals.filter(w => w.status === "pending" || w.status === "processing").length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{pendingWithdrawals.filter(w => w.status === "pending" || w.status === "processing").length}</Badge>}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {/* Combined list of deposits and withdrawals */}
                  {(() => {
                    const deposits = (manualTxFilter === "all" || manualTxFilter === "deposits")
                      ? [...pendingDeposits, ...creditPendingDeposits].map(d => ({ ...d, txType: "deposit" }))
                      : [];
                    const withdrawals = (manualTxFilter === "all" || manualTxFilter === "withdrawals")
                      ? allWithdrawals.filter(w => w.status === "pending" || w.status === "processing").map(w => ({ ...w, txType: "withdrawal" }))
                      : [];
                    const combined = [...deposits, ...withdrawals].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                    if (combined.length === 0) {
                      return <p className="text-muted-foreground text-center py-8 text-sm">No pending transactions</p>;
                    }

                    return combined.map((tx) => (
                      <div
                        key={`${tx.txType}-${tx.id}`}
                        className={`p-3 rounded-lg border cursor-pointer hover:shadow-md transition-all ${
                          tx.txType === "deposit"
                            ? tx.status === "credit_pending" ? "border-orange-200 bg-orange-50/50" : "border-green-200 bg-green-50/50 hover:border-green-300"
                            : tx.status === "processing" ? "border-blue-200 bg-blue-50/50 hover:border-blue-300" : "border-yellow-200 bg-yellow-50/50 hover:border-yellow-300"
                        }`}
                        onClick={() => { setSelectedManualTx(tx); setManualTxModalOpen(true); }}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${tx.txType === "deposit" ? "bg-green-100" : "bg-orange-100"}`}>
                              {tx.txType === "deposit" ? <ArrowDownLeft className="h-4 w-4 text-green-600" /> : <ArrowUpRight className="h-4 w-4 text-orange-600" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold">₱{parseFloat(tx.amount).toLocaleString()}</span>
                                <Badge variant="outline" className={`text-[10px] px-1.5 ${tx.txType === "deposit" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                                  {tx.txType === "deposit" ? "Deposit" : "Withdraw"}
                                </Badge>
                                {tx.status === "credit_pending" && <Badge variant="outline" className="text-[10px] px-1.5 bg-orange-100 text-orange-700">Retry</Badge>}
                                {tx.status === "processing" && <Badge variant="outline" className="text-[10px] px-1.5 bg-blue-100 text-blue-700">Processing</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {tx.txType === "deposit" ? (tx.user?.username || tx.user?.fullName || `User #${tx.userId}`) : (tx.userName || `User #${tx.userId}`)}
                                <span className="mx-1">•</span>
                                {new Date(tx.createdAt).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            {tx.txType === "deposit" && tx.paymentMethod?.label && (
                              <Badge variant="secondary" className="text-[10px]">{tx.paymentMethod.label}</Badge>
                            )}
                            {tx.txType === "withdrawal" && (
                              <Badge variant="secondary" className="text-[10px] uppercase">{tx.accountType}</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Transaction Detail Modal */}
          <Dialog open={manualTxModalOpen} onOpenChange={setManualTxModalOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedManualTx?.txType === "deposit" ? (
                    <><ArrowDownLeft className="h-5 w-5 text-green-600" /> Deposit Details</>
                  ) : (
                    <><ArrowUpRight className="h-5 w-5 text-orange-600" /> Withdrawal Details</>
                  )}
                </DialogTitle>
              </DialogHeader>

              {selectedManualTx && (
                <div className="space-y-4">
                  <div className="text-center py-2">
                    <p className="text-3xl font-bold text-primary">₱{parseFloat(selectedManualTx.amount).toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedManualTx.txType === "deposit"
                        ? (selectedManualTx.user?.username || selectedManualTx.user?.fullName || `User #${selectedManualTx.userId}`)
                        : (selectedManualTx.userName || `User #${selectedManualTx.userId}`)}
                    </p>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1 border-b">
                      <span className="text-muted-foreground">Type</span>
                      <Badge variant={selectedManualTx.txType === "deposit" ? "default" : "secondary"}>
                        {selectedManualTx.txType === "deposit" ? "Deposit" : "Withdrawal"}
                      </Badge>
                    </div>
                    <div className="flex justify-between py-1 border-b">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant="outline">{selectedManualTx.status}</Badge>
                    </div>
                    <div className="flex justify-between py-1 border-b">
                      <span className="text-muted-foreground">Date</span>
                      <span>{new Date(selectedManualTx.createdAt).toLocaleString()}</span>
                    </div>

                    {selectedManualTx.txType === "deposit" && selectedManualTx.paymentMethod && (
                      <div className="flex justify-between py-1 border-b">
                        <span className="text-muted-foreground">Payment Method</span>
                        <span>{selectedManualTx.paymentMethod.label}</span>
                      </div>
                    )}

                    {selectedManualTx.txType === "withdrawal" && (
                      <>
                        <div className="flex justify-between py-1 border-b">
                          <span className="text-muted-foreground">Account Type</span>
                          <span className="uppercase">{selectedManualTx.accountType}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b">
                          <span className="text-muted-foreground">Account Name</span>
                          <span>{selectedManualTx.accountName}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b">
                          <span className="text-muted-foreground">Account Number</span>
                          <span className="font-mono">{selectedManualTx.accountNumber}</span>
                        </div>
                        {selectedManualTx.bankName && (
                          <div className="flex justify-between py-1 border-b">
                            <span className="text-muted-foreground">Bank</span>
                            <span>{selectedManualTx.bankName}</span>
                          </div>
                        )}
                      </>
                    )}

                    {selectedManualTx.userNote && (
                      <div className="py-1">
                        <span className="text-muted-foreground">Note:</span>
                        <p className="mt-1 p-2 bg-muted rounded text-sm">{selectedManualTx.userNote}</p>
                      </div>
                    )}

                    {selectedManualTx.txType === "deposit" && selectedManualTx.proofImageUrl && (
                      <div className="py-1">
                        <span className="text-muted-foreground">Proof:</span>
                        <a href={selectedManualTx.proofImageUrl} target="_blank" rel="noopener noreferrer">
                          <img src={selectedManualTx.proofImageUrl} alt="Proof" className="mt-1 w-full max-h-40 object-cover rounded border cursor-pointer hover:opacity-80" />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  {selectedManualTx.status !== "completed" && selectedManualTx.status !== "rejected" && (
                    <div className="space-y-2 pt-2">
                      {selectedManualTx.txType === "deposit" && selectedManualTx.status === "pending" && (
                        <div className="flex gap-2">
                          <Button
                            className="flex-1 bg-green-600 hover:bg-green-700"
                            onClick={() => { handleApproveDeposit(selectedManualTx.id); setManualTxModalOpen(false); }}
                            disabled={processingDeposit === selectedManualTx.id}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" /> Approve
                          </Button>
                          <Button
                            variant="destructive"
                            className="flex-1"
                            onClick={() => { handleRejectDeposit(selectedManualTx.id); setManualTxModalOpen(false); }}
                            disabled={processingDeposit === selectedManualTx.id}
                          >
                            <XCircle className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        </div>
                      )}

                      {selectedManualTx.txType === "deposit" && selectedManualTx.status === "credit_pending" && (
                        <Button
                          className="w-full bg-orange-600 hover:bg-orange-700"
                          onClick={() => { handleRetryCredit(selectedManualTx.id); setManualTxModalOpen(false); }}
                          disabled={retryingDeposit === selectedManualTx.id}
                        >
                          <RefreshCw className="h-4 w-4 mr-1" /> Retry Credit
                        </Button>
                      )}

                      {selectedManualTx.txType === "withdrawal" && selectedManualTx.status === "pending" && (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <Button
                              className="flex-1 bg-blue-500 hover:bg-blue-600"
                              onClick={() => { handleProcessWithdrawal(selectedManualTx.id); setManualTxModalOpen(false); }}
                              disabled={processingWithdrawal === selectedManualTx.id}
                            >
                              Processing
                            </Button>
                            <Button
                              className="flex-1 bg-green-600 hover:bg-green-700"
                              onClick={() => { handleCompleteWithdrawal(selectedManualTx.id); setManualTxModalOpen(false); }}
                              disabled={processingWithdrawal === selectedManualTx.id}
                            >
                              Complete
                            </Button>
                          </div>
                          <Input
                            placeholder="Rejection reason..."
                            value={withdrawalRejectReason}
                            onChange={(e) => setWithdrawalRejectReason(e.target.value)}
                            className="text-sm"
                          />
                          <Button
                            variant="destructive"
                            className="w-full"
                            onClick={() => { handleRejectWithdrawal(selectedManualTx.id); setManualTxModalOpen(false); }}
                            disabled={processingWithdrawal === selectedManualTx.id || !withdrawalRejectReason}
                          >
                            <XCircle className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        </div>
                      )}

                      {selectedManualTx.txType === "withdrawal" && selectedManualTx.status === "processing" && (
                        <div className="space-y-2">
                          <Button
                            className="w-full bg-green-600 hover:bg-green-700"
                            onClick={() => { handleCompleteWithdrawal(selectedManualTx.id); setManualTxModalOpen(false); }}
                            disabled={processingWithdrawal === selectedManualTx.id}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" /> Mark Complete
                          </Button>
                          <Input
                            placeholder="Rejection reason..."
                            value={withdrawalRejectReason}
                            onChange={(e) => setWithdrawalRejectReason(e.target.value)}
                            className="text-sm"
                          />
                          <Button
                            variant="destructive"
                            className="w-full"
                            onClick={() => { handleRejectWithdrawal(selectedManualTx.id); setManualTxModalOpen(false); }}
                            disabled={processingWithdrawal === selectedManualTx.id || !withdrawalRejectReason}
                          >
                            <XCircle className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        </div>
                      )}

                      {selectedManualTx.txType === "deposit" && (
                        <Input
                          placeholder="Rejection reason (if rejecting)"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          className="text-sm"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="qrph">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5" />
                    QRPH Pending Transactions
                  </CardTitle>
                  <CardDescription>
                    Process pending QRPH cash-in payments that need manual credit
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchAdminData()}
                    data-testid="button-refresh-qrph"
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                  </Button>
                  {pendingQrph.length > 0 && (
                    <Button
                      onClick={handleProcessAllQrph}
                      disabled={processingAllQrph}
                      data-testid="button-process-all-qrph"
                    >
                      {processingAllQrph ? (
                        <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Processing...</>
                      ) : (
                        <><CheckCircle className="h-4 w-4 mr-1" /> Process All ({pendingQrph.length})</>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {pendingQrph.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                  <h3 className="text-lg font-semibold">All Caught Up!</h3>
                  <p className="text-muted-foreground">No pending QRPH transactions to process</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingQrph.map((tx) => (
                    <div 
                      key={tx.id} 
                      className="flex items-center justify-between p-4 rounded-lg border bg-amber-50/50 border-amber-200"
                      data-testid={`qrph-row-${tx.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                          <Smartphone className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="font-bold text-lg" data-testid={`text-qrph-amount-${tx.id}`}>
                            ₱{parseFloat(tx.amount).toLocaleString()}
                          </p>
                          <p className="text-sm text-muted-foreground" data-testid={`text-qrph-user-${tx.id}`}>
                            {tx.userName || tx.username || tx.userEmail || `User #${tx.senderId}`}
                          </p>
                          <p className="text-xs text-muted-foreground" data-testid={`text-qrph-note-${tx.id}`}>
                            {tx.note}
                          </p>
                          <p className="text-xs text-muted-foreground" data-testid={`text-qrph-date-${tx.id}`}>
                            {new Date(tx.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300">
                          Pending Credit
                        </Badge>
                        <Button
                          size="sm"
                          onClick={() => handleProcessQrph(tx.id)}
                          disabled={processingQrph === tx.id}
                          data-testid={`button-process-qrph-${tx.id}`}
                        >
                          {processingQrph === tx.id ? (
                            <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Processing...</>
                          ) : (
                            <><CheckCircle className="h-4 w-4 mr-1" /> Credit PHPT</>
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-blue-500" />
                About QRPH Processing
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                When users pay via QRPH (GCash, Maya, GrabPay), payments are received by NexusPay and should be auto-credited.
              </p>
              <p>
                If the automatic credit fails (due to PayGram API issues), transactions appear here for manual processing.
              </p>
              <p>
                <strong>Credit PHPT:</strong> Transfers PHPT from admin PayGram wallet to user's wallet and updates their balance.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="crypto">
          {crypto.configError ? (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center py-8">
                  <Shield className="h-12 w-12 text-destructive mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Admin Token Not Configured</h3>
                  <p className="text-muted-foreground max-w-md">
                    The PAYGRAM_API_TOKEN secret is not set. Please add your PayGram admin token in Replit Secrets.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
          <div className="space-y-6">
            <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  PayGram Admin Wallet
                </CardTitle>
                <CardDescription>Platform crypto balances</CardDescription>
              </CardHeader>
              <CardContent>
                {crypto.data?.wallets ? (
                  <div className="grid gap-4 md:grid-cols-3">
                    {crypto.data.wallets.map((wallet: any) => (
                      <div key={wallet.currencyCode} className="p-4 rounded-xl bg-card border">
                        <p className="text-sm text-muted-foreground mb-1">
                          {wallet.currencyCode === 11 ? "PHPT" : wallet.currencyCode === 5 ? "USDT" : wallet.currencyCode === 1 ? "BTC" : `Currency ${wallet.currencyCode}`}
                        </p>
                        <p className="text-2xl font-bold">
                          {parseFloat(wallet.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No crypto data available</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5" />
                  Send Crypto
                </CardTitle>
                <CardDescription>Send crypto to a Telegram PayGram user</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Telegram ID / PayGram User</Label>
                    <Input
                      type="text"
                      placeholder="123456789"
                      value={sendTelegramId}
                      onChange={(e) => setSendTelegramId(e.target.value)}
                      data-testid="input-telegram-id"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={sendAmount}
                      onChange={(e) => setSendAmount(e.target.value)}
                      data-testid="input-send-amount"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select value={sendCurrency} onValueChange={setSendCurrency}>
                      <SelectTrigger data-testid="select-send-currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="11">PHPT</SelectItem>
                        <SelectItem value="5">USDT</SelectItem>
                        <SelectItem value="1">BTC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button 
                  onClick={handleSendCrypto} 
                  disabled={sending || !sendTelegramId || !sendAmount}
                  data-testid="button-send-crypto"
                >
                  {sending ? "Sending..." : "Send Crypto"}
                </Button>
              </CardContent>
            </Card>
          </div>
          )}
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Admin Audit Logs
              </CardTitle>
              <CardDescription>Track all administrative actions for accountability</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {auditLogs.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No audit logs yet</p>
                ) : (
                  auditLogs.map((log) => (
                    <div 
                      key={log.id} 
                      className={`p-3 rounded-lg border text-sm ${
                        log.riskLevel === "critical" ? "border-red-300 bg-red-50/50" :
                        log.riskLevel === "high" ? "border-orange-300 bg-orange-50/50" :
                        ""
                      }`}
                      data-testid={`audit-log-${log.id}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline">{log.action}</Badge>
                          <span className="text-muted-foreground">on {log.targetType} #{log.targetId}</span>
                          {log.riskLevel && (
                            <Badge 
                              variant={
                                log.riskLevel === "critical" ? "destructive" :
                                log.riskLevel === "high" ? "default" :
                                log.riskLevel === "medium" ? "secondary" :
                                "outline"
                              }
                              className="text-xs"
                            >
                              {log.riskLevel}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {log.details && (
                        <p className="mt-2 text-muted-foreground">{log.details}</p>
                      )}
                      {(log.previousValue || log.newValue) && (
                        <div className="mt-2 text-xs">
                          {log.previousValue && <span className="text-red-600">Before: {log.previousValue}</span>}
                          {log.previousValue && log.newValue && <span className="mx-2">→</span>}
                          {log.newValue && <span className="text-green-600">After: {log.newValue}</span>}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                        <span>Admin ID: {log.adminId}</span>
                        {log.ipAddress && <span>IP: {log.ipAddress}</span>}
                        {log.requestMethod && log.requestPath && (
                          <span>{log.requestMethod} {log.requestPath}</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Telegram Topup/Cashout Tab */}
        <TabsContent value="telegram">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Telegram Operations Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5" />
                  Telegram {telegramAction === "topup" ? "Topup" : "Cashout"}
                </CardTitle>
                <CardDescription>
                  {telegramAction === "topup"
                    ? "Send PHPT to user via Telegram PayGram"
                    : "Process user cashout to Telegram wallet"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Action Toggle */}
                <div className="flex gap-2">
                  <Button
                    variant={telegramAction === "topup" ? "default" : "outline"}
                    onClick={() => {
                      setTelegramAction("topup");
                      setGeneratedTelegramLink(null);
                    }}
                    className="flex-1"
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Topup
                  </Button>
                  <Button
                    variant={telegramAction === "cashout" ? "default" : "outline"}
                    onClick={() => {
                      setTelegramAction("cashout");
                      setGeneratedTelegramLink(null);
                    }}
                    className="flex-1"
                  >
                    <Wallet className="h-4 w-4 mr-2" />
                    Cashout
                  </Button>
                </div>

                {/* User Selection */}
                <div className="space-y-2">
                  <Label>Select User</Label>
                  <Select value={telegramUserId} onValueChange={setTelegramUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a user..." />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id.toString()}>
                          {u.fullName} (@{u.username}) - ₱{parseFloat(u.phptBalance || "0").toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Amount */}
                <div className="space-y-2">
                  <Label>Amount (PHPT)</Label>
                  <Input
                    type="number"
                    placeholder="Enter amount..."
                    value={telegramAmount}
                    onChange={(e) => setTelegramAmount(e.target.value)}
                    min="1"
                  />
                </div>

                {/* Telegram Username (for cashout) */}
                {telegramAction === "cashout" && (
                  <div className="space-y-2">
                    <Label>Telegram Username (optional)</Label>
                    <Input
                      placeholder="@username or leave blank for user's PayGram"
                      value={telegramUsername}
                      onChange={(e) => setTelegramUsername(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      If blank, will use user's registered PayGram account
                    </p>
                  </div>
                )}

                {/* Note */}
                <div className="space-y-2">
                  <Label>Note (optional)</Label>
                  <Textarea
                    placeholder="Add a note..."
                    value={telegramNote}
                    onChange={(e) => setTelegramNote(e.target.value)}
                    rows={2}
                  />
                </div>

                {/* Generated Telegram Link */}
                {generatedTelegramLink && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-2">
                    <p className="text-sm font-medium text-green-800">Telegram Link Generated!</p>
                    <div className="flex gap-2">
                      <Input
                        value={generatedTelegramLink}
                        readOnly
                        className="text-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(generatedTelegramLink);
                          toast({ title: "Copied!", description: "Link copied to clipboard" });
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Share this link with the user to claim their PHPT
                    </p>
                  </div>
                )}

                {/* Submit Button */}
                <Button
                  className="w-full"
                  onClick={async () => {
                    if (!telegramUserId || !telegramAmount) {
                      toast({ title: "Error", description: "Please select a user and enter amount", variant: "destructive" });
                      return;
                    }

                    setProcessingTelegram(true);
                    try {
                      const endpoint = telegramAction === "topup"
                        ? "/api/admin/telegram/direct-send"
                        : "/api/admin/telegram/process-cashout";

                      const body: any = {
                        userId: parseInt(telegramUserId),
                        amount: telegramAmount,
                        note: telegramNote
                      };

                      if (telegramAction === "cashout" && telegramUsername) {
                        body.telegramUsername = telegramUsername;
                      }

                      const response = await fetch(endpoint, {
                        method: "POST",
                        headers: getAuthHeaders(),
                        body: JSON.stringify(body)
                      });

                      const data = await response.json();

                      if (data.success) {
                        toast({
                          title: "Success!",
                          description: data.message
                        });

                        if (data.telegramLink) {
                          setGeneratedTelegramLink(data.telegramLink);
                        }

                        // Reset form
                        setTelegramUserId("");
                        setTelegramAmount("");
                        setTelegramNote("");
                        setTelegramUsername("");

                        // Refresh data
                        fetchAdminData(true);
                      } else {
                        toast({
                          title: "Error",
                          description: data.message || "Operation failed",
                          variant: "destructive"
                        });
                      }
                    } catch (error: any) {
                      toast({
                        title: "Error",
                        description: error.message || "Operation failed",
                        variant: "destructive"
                      });
                    } finally {
                      setProcessingTelegram(false);
                    }
                  }}
                  disabled={processingTelegram || !telegramUserId || !telegramAmount}
                >
                  {processingTelegram ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : telegramAction === "topup" ? (
                    <Send className="h-4 w-4 mr-2" />
                  ) : (
                    <Wallet className="h-4 w-4 mr-2" />
                  )}
                  {processingTelegram
                    ? "Processing..."
                    : telegramAction === "topup"
                      ? "Send PHPT to User"
                      : "Process Cashout"
                  }
                </Button>

                {/* Create Link Only Button (for topup) */}
                {telegramAction === "topup" && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={async () => {
                      if (!telegramUserId || !telegramAmount) {
                        toast({ title: "Error", description: "Please select a user and enter amount", variant: "destructive" });
                        return;
                      }

                      setProcessingTelegram(true);
                      try {
                        const response = await fetch("/api/admin/telegram/create-topup", {
                          method: "POST",
                          headers: getAuthHeaders(),
                          body: JSON.stringify({
                            userId: parseInt(telegramUserId),
                            amount: telegramAmount,
                            note: telegramNote
                          })
                        });

                        const data = await response.json();

                        if (data.success) {
                          setGeneratedTelegramLink(data.telegramLink);
                          toast({
                            title: "Link Generated!",
                            description: `Share this link with ${data.user?.fullName || "the user"} to claim ${telegramAmount} PHPT`
                          });
                          fetchAdminData(true);
                        } else {
                          toast({
                            title: "Error",
                            description: data.message || "Failed to create link",
                            variant: "destructive"
                          });
                        }
                      } catch (error: any) {
                        toast({
                          title: "Error",
                          description: error.message || "Failed to create link",
                          variant: "destructive"
                        });
                      } finally {
                        setProcessingTelegram(false);
                      }
                    }}
                    disabled={processingTelegram || !telegramUserId || !telegramAmount}
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    Generate Telegram Link Only
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Telegram Transaction History */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Telegram Transaction History
                </CardTitle>
                <CardDescription>
                  Recent Telegram topup and cashout transactions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {telegramTransactions.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No Telegram transactions yet</p>
                  ) : (
                    telegramTransactions.map((tx: any) => (
                      <div
                        key={tx.id}
                        className={`p-3 rounded-lg border text-sm ${
                          tx.type === "telegram_topup"
                            ? "bg-green-50/50 border-green-200"
                            : "bg-blue-50/50 border-blue-200"
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {tx.type === "telegram_topup" ? (
                                <TrendingUp className="h-4 w-4 text-green-600" />
                              ) : (
                                <Wallet className="h-4 w-4 text-blue-600" />
                              )}
                              <span className="font-medium">
                                {tx.type === "telegram_topup" ? "Topup" : "Cashout"}
                              </span>
                              <Badge variant={tx.status === "completed" ? "default" : "secondary"}>
                                {tx.status}
                              </Badge>
                            </div>
                            <p className="font-bold">
                              {tx.type === "telegram_topup" ? "+" : "-"}
                              ₱{parseFloat(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                            {tx.note && (
                              <p className="text-xs text-muted-foreground">{tx.note}</p>
                            )}
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <p>{new Date(tx.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Note: Super admin can use Top Up/Cash Out from the Dashboard for escrow operations */}
        </TabsContent>
      </Tabs>

      {/* User Detail Dialog */}
      <Dialog open={userDetailDialogOpen} onOpenChange={setUserDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>
              Profile, KYC documents, and transaction history for {selectedUserDetail?.fullName}
            </DialogDescription>
          </DialogHeader>

          {loadingUserDetail ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedUserDetail && (
            <div className="space-y-6">
              {/* User Profile Section */}
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Profile Information
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Full Name</Label>
                    <p className="font-medium">{selectedUserDetail.fullName}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Username</Label>
                    <p className="font-medium">@{selectedUserDetail.username}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <p className="font-medium">{selectedUserDetail.email}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Account Number</Label>
                    <p className="font-medium">{selectedUserDetail.accountNumber || "Not assigned"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">PHPT Balance</Label>
                    <p className="font-medium">{parseFloat(selectedUserDetail.phptBalance || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })} PHPT</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Account Status</Label>
                    <div className="flex gap-2 mt-1">
                      <Badge variant={selectedUserDetail.isActive ? "default" : "destructive"}>
                        {selectedUserDetail.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant={selectedUserDetail.kycStatus === "verified" ? "default" : "secondary"}>
                        KYC: {selectedUserDetail.kycStatus}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Role</Label>
                    <Badge variant={getRoleBadgeVariant(selectedUserDetail.role)}>
                      {getRoleLabel(selectedUserDetail.role)}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Registered</Label>
                    <p className="font-medium">{new Date(selectedUserDetail.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>

              {/* KYC Documents Section */}
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  KYC Documents
                </h3>
                {userDetailKycDocs.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No KYC documents submitted</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-3">
                    {userDetailKycDocs.map((doc) => {
                      const docLabels: Record<string, string> = {
                        government_id: "Government ID",
                        selfie: "Selfie with ID",
                        proof_of_address: "Proof of Address"
                      };
                      return (
                        <div key={doc.id} className="border rounded-lg overflow-hidden">
                          <div className="p-2 bg-muted/50 flex items-center justify-between">
                            <span className="text-sm font-medium">{docLabels[doc.documentType] || doc.documentType}</span>
                            <Badge variant={doc.status === "approved" ? "default" : doc.status === "rejected" ? "destructive" : "secondary"} className="text-xs">
                              {doc.status}
                            </Badge>
                          </div>
                          <div className="aspect-[4/3] bg-muted">
                            <img
                              src={doc.documentUrl}
                              alt={doc.documentType}
                              className="w-full h-full object-cover cursor-pointer"
                              onClick={() => window.open(doc.documentUrl, '_blank')}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Transaction History Section */}
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Recent Transactions
                </h3>
                {userDetailTransactions.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No transactions found</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {userDetailTransactions.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between p-2 border rounded text-sm">
                        <div>
                          <p className="font-medium">{tx.type.replace(/_/g, ' ').toUpperCase()}</p>
                          <p className="text-xs text-muted-foreground">
                            {tx.referenceNumber || `#${tx.id}`} • {new Date(tx.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{parseFloat(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} PHPT</p>
                          <Badge variant={tx.status === "completed" ? "default" : tx.status === "failed" ? "destructive" : "secondary"} className="text-xs">
                            {tx.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setUserDetailDialogOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={kycDialogOpen} onOpenChange={setKycDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>KYC Document Review</DialogTitle>
            <DialogDescription>
              Review documents for {selectedKycUser?.fullName} (@{selectedKycUser?.username})
            </DialogDescription>
          </DialogHeader>

          {loadingKycDocs ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : kycDocuments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No documents submitted yet</p>
              <p className="text-sm mt-2">The user needs to upload their documents before verification can proceed.</p>
              <Button variant="outline" onClick={() => setKycDialogOpen(false)} className="mt-4">
                Close
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                {kycDocuments.map((doc) => {
                  const docIcons: Record<string, any> = {
                    government_id: FileText,
                    selfie: Camera,
                    proof_of_address: MapPin
                  };
                  const docLabels: Record<string, string> = {
                    government_id: "Government ID",
                    selfie: "Selfie with ID",
                    proof_of_address: "Proof of Address"
                  };
                  const DocIcon = docIcons[doc.documentType] || FileText;
                  
                  return (
                    <div key={doc.id} className="border rounded-lg overflow-hidden">
                      <div className="p-3 bg-muted/50 flex items-center gap-2">
                        <DocIcon className="h-4 w-4" />
                        <span className="font-medium text-sm">{docLabels[doc.documentType] || doc.documentType}</span>
                        <Badge 
                          variant={doc.status === "approved" ? "default" : doc.status === "rejected" ? "destructive" : "secondary"}
                          className="ml-auto"
                        >
                          {doc.status}
                        </Badge>
                      </div>
                      <div className="aspect-[4/3] bg-muted relative">
                        <img 
                          src={doc.documentUrl} 
                          alt={docLabels[doc.documentType] || doc.documentType}
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => window.open(doc.documentUrl, '_blank')}
                        />
                      </div>
                      <div className="p-2 text-xs text-muted-foreground">
                        Uploaded: {new Date(doc.createdAt).toLocaleDateString()}
                        {doc.adminNote && (
                          <p className="mt-1 text-red-600">Note: {doc.adminNote}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t pt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Rejection Reason (required if rejecting)</Label>
                  <Textarea
                    placeholder="Enter reason for rejection..."
                    value={kycRejectReason}
                    onChange={(e) => setKycRejectReason(e.target.value)}
                    rows={2}
                  />
                </div>
                
                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={() => setKycDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    variant="destructive"
                    onClick={() => handleKycAction(selectedKycUser!.id, "reject", kycRejectReason)}
                    disabled={!kycRejectReason.trim()}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                  <Button 
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => handleKycAction(selectedKycUser!.id, "approve")}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
