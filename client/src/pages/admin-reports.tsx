import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { getAuthHeaders } from "@/lib/api";
import { formatPeso } from "@/lib/utils";
import {
  FileSpreadsheet,
  FileText,
  Download,
  Search,
  RefreshCw,
  ArrowLeft,
  Users,
  Receipt,
  Calendar,
  Filter,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  Clock,
  XCircle
} from "lucide-react";

interface Transaction {
  id: number;
  createdAt: string;
  type: string;
  amount: string;
  status: string;
  note: string | null;
  category: string | null;
  externalTxId: string | null;
  userName: string | null;
  userEmail: string | null;
  username: string | null;
}

interface TransactionSummary {
  totalCount: number;
  totalVolume: string;
  completedCount: number;
  pendingCount: number;
  failedCount: number;
}

interface User {
  id: number;
  fullName: string;
  username: string;
  email: string;
  phptBalance: string;
  kycStatus: string;
  role: string;
  isActive: boolean;
  phoneNumber: string | null;
  createdAt: string;
  transactionCount: number;
  totalVolume: string;
}

interface UserSummary {
  totalUsers: number;
  activeUsers: number;
  verifiedUsers: number;
  pendingKyc: number;
  totalBalance: string;
}

interface TransactionType {
  value: string;
  label: string;
}

export default function AdminReports() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Transaction report state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txSummary, setTxSummary] = useState<TransactionSummary | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [txTypes, setTxTypes] = useState<TransactionType[]>([]);

  // User report state
  const [users, setUsers] = useState<User[]>([]);
  const [userSummary, setUserSummary] = useState<UserSummary | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);

  // Filters
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Export loading states
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  useEffect(() => {
    fetchTransactionTypes();
    fetchTransactionReport();
    fetchUserReport();
  }, []);

  const fetchTransactionTypes = async () => {
    try {
      const res = await fetch("/api/admin/reports/transaction-types", {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setTxTypes(data);
    } catch (error) {
      console.error("Failed to fetch transaction types:", error);
    }
  };

  const fetchTransactionReport = async () => {
    setTxLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.append("from", dateFrom);
      if (dateTo) params.append("to", dateTo);
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (typeFilter !== "all") params.append("type", typeFilter);
      if (searchQuery) params.append("search", searchQuery);
      params.append("limit", "100");

      const res = await fetch(`/api/admin/reports/transactions?${params}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setTransactions(data.transactions || []);
      setTxSummary(data.summary || null);
    } catch (error) {
      console.error("Failed to fetch transaction report:", error);
      toast({ title: "Error", description: "Failed to load transactions", variant: "destructive" });
    } finally {
      setTxLoading(false);
    }
  };

  const fetchUserReport = async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);

      const res = await fetch(`/api/admin/reports/users?${params}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setUsers(data.users || []);
      setUserSummary(data.summary || null);
    } catch (error) {
      console.error("Failed to fetch user report:", error);
      toast({ title: "Error", description: "Failed to load users", variant: "destructive" });
    } finally {
      setUsersLoading(false);
    }
  };

  const handleExportCsv = async (reportType: "transactions" | "users") => {
    setExportingCsv(true);
    try {
      const params = new URLSearchParams();
      if (reportType === "transactions") {
        if (dateFrom) params.append("from", dateFrom);
        if (dateTo) params.append("to", dateTo);
        if (statusFilter !== "all") params.append("status", statusFilter);
        if (typeFilter !== "all") params.append("type", typeFilter);
        if (searchQuery) params.append("search", searchQuery);
      } else {
        if (searchQuery) params.append("search", searchQuery);
      }

      const res = await fetch(`/api/admin/reports/${reportType}/export/csv?${params}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reportType}_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: "Success", description: "CSV exported successfully" });
    } catch (error) {
      console.error("Export error:", error);
      toast({ title: "Error", description: "Failed to export CSV", variant: "destructive" });
    } finally {
      setExportingCsv(false);
    }
  };

  const handleExportExcel = async (reportType: "transactions" | "users") => {
    setExportingExcel(true);
    try {
      const params = new URLSearchParams();
      if (reportType === "transactions") {
        if (dateFrom) params.append("from", dateFrom);
        if (dateTo) params.append("to", dateTo);
        if (statusFilter !== "all") params.append("status", statusFilter);
        if (typeFilter !== "all") params.append("type", typeFilter);
        if (searchQuery) params.append("search", searchQuery);
      } else {
        if (searchQuery) params.append("search", searchQuery);
      }

      const res = await fetch(`/api/admin/reports/${reportType}/export/excel?${params}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reportType}_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: "Success", description: "Excel exported successfully" });
    } catch (error) {
      console.error("Export error:", error);
      toast({ title: "Error", description: "Failed to export Excel", variant: "destructive" });
    } finally {
      setExportingExcel(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "failed":
      case "refunded":
        return <Badge className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />{status}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeDisplayName = (type: string) => {
    const found = txTypes.find(t => t.value === type);
    return found?.label || type;
  };

  if (!user?.isAdmin) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Admin access required</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <header className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-display font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm">Export and analyze transaction data</p>
        </div>
      </header>

      <Tabs defaultValue="transactions" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="transactions" className="gap-2">
            <Receipt className="h-4 w-4" />
            Transactions
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
        </TabsList>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-6">
          {/* Summary Cards */}
          {txSummary && (
            <div className="grid gap-4 md:grid-cols-5">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Receipt className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{txSummary.totalCount}</p>
                      <p className="text-xs text-muted-foreground">Total Transactions</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{formatPeso(parseFloat(txSummary.totalVolume))}</p>
                      <p className="text-xs text-muted-foreground">Total Volume</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{txSummary.completedCount}</p>
                      <p className="text-xs text-muted-foreground">Completed</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{txSummary.pendingCount}</p>
                      <p className="text-xs text-muted-foreground">Pending</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                      <XCircle className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{txSummary.failedCount}</p>
                      <p className="text-xs text-muted-foreground">Failed/Refunded</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-5">
                <div className="space-y-2">
                  <Label htmlFor="dateFrom">From Date</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="dateFrom"
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateTo">To Date</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="dateTo"
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="refunded">Refunded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {txTypes.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="search">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="search"
                      placeholder="Name, email, reference..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button onClick={fetchTransactionReport} disabled={txLoading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${txLoading ? "animate-spin" : ""}`} />
                  Apply Filters
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExportCsv("transactions")}
                  disabled={exportingCsv || transactions.length === 0}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  {exportingCsv ? "Exporting..." : "Export CSV"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExportExcel("transactions")}
                  disabled={exportingExcel || transactions.length === 0}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  {exportingExcel ? "Exporting..." : "Export Excel"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Transactions Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Transaction Data</CardTitle>
              <CardDescription>
                Showing {transactions.length} transactions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">ID</TableHead>
                      <TableHead className="w-[150px]">Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {txLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : transactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No transactions found
                        </TableCell>
                      </TableRow>
                    ) : (
                      transactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="font-mono text-xs">{tx.id}</TableCell>
                          <TableCell className="text-xs">{formatDate(tx.createdAt)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{getTypeDisplayName(tx.type)}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <p className="font-medium">{tx.userName || "-"}</p>
                              <p className="text-xs text-muted-foreground">{tx.userEmail || tx.username || ""}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatPeso(parseFloat(tx.amount))}
                          </TableCell>
                          <TableCell>{getStatusBadge(tx.status)}</TableCell>
                          <TableCell className="font-mono text-xs max-w-[150px] truncate">
                            {tx.externalTxId || "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-6">
          {/* Summary Cards */}
          {userSummary && (
            <div className="grid gap-4 md:grid-cols-5">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{userSummary.totalUsers}</p>
                      <p className="text-xs text-muted-foreground">Total Users</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{userSummary.activeUsers}</p>
                      <p className="text-xs text-muted-foreground">Active</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{userSummary.verifiedUsers}</p>
                      <p className="text-xs text-muted-foreground">KYC Verified</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{userSummary.pendingKyc}</p>
                      <p className="text-xs text-muted-foreground">KYC Pending</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{formatPeso(parseFloat(userSummary.totalBalance))}</p>
                      <p className="text-xs text-muted-foreground">Total Balance</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filters and Export */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Options
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-2 flex-1 min-w-[200px]">
                  <Label htmlFor="userSearch">Search Users</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="userSearch"
                      placeholder="Name, email, username..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Button onClick={fetchUserReport} disabled={usersLoading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${usersLoading ? "animate-spin" : ""}`} />
                  Search
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExportCsv("users")}
                  disabled={exportingCsv || users.length === 0}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  {exportingCsv ? "Exporting..." : "Export CSV"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExportExcel("users")}
                  disabled={exportingExcel || users.length === 0}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  {exportingExcel ? "Exporting..." : "Export Excel"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Users Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">User Data</CardTitle>
              <CardDescription>
                Showing {users.length} users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>KYC</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Tx Count</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : users.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No users found
                        </TableCell>
                      </TableRow>
                    ) : (
                      users.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-mono text-xs">{u.id}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{u.fullName}</p>
                              <p className="text-xs text-muted-foreground">@{u.username}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{u.email}</TableCell>
                          <TableCell className="text-right font-mono">
                            {formatPeso(parseFloat(u.phptBalance))}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={u.kycStatus === "verified" ? "default" : "outline"}
                              className={u.kycStatus === "verified" ? "bg-green-100 text-green-800" : ""}
                            >
                              {u.kycStatus}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{u.role}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{u.transactionCount}</TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatPeso(parseFloat(u.totalVolume))}
                          </TableCell>
                          <TableCell className="text-xs">
                            {new Date(u.createdAt).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
