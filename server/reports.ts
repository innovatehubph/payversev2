import { Express, Request, Response } from "express";
import { storage } from "./storage";
import { authMiddleware } from "./auth";
import ExcelJS from "exceljs";
import { stringify } from "csv-stringify/sync";

// Report filter interface
interface ReportFilters {
  from?: Date;
  to?: Date;
  status?: string;
  type?: string;
  userId?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

// Parse query params into filters
function parseFilters(query: any): ReportFilters {
  const filters: ReportFilters = {};

  if (query.from) {
    filters.from = new Date(query.from);
  }
  if (query.to) {
    // Set to end of day
    const toDate = new Date(query.to);
    toDate.setHours(23, 59, 59, 999);
    filters.to = toDate;
  }
  if (query.status && query.status !== "all") {
    filters.status = query.status;
  }
  if (query.type && query.type !== "all") {
    filters.type = query.type;
  }
  if (query.userId) {
    filters.userId = parseInt(query.userId);
  }
  if (query.search) {
    filters.search = query.search;
  }
  if (query.limit) {
    filters.limit = Math.min(parseInt(query.limit) || 100, 10000);
  }
  if (query.offset) {
    filters.offset = parseInt(query.offset) || 0;
  }

  return filters;
}

// Format date for display
function formatDate(date: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toISOString().replace("T", " ").substring(0, 19);
}

// Format amount for display
function formatAmount(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return num.toFixed(2);
}

// Get transaction type display name
function getTypeDisplayName(type: string): string {
  const typeNames: Record<string, string> = {
    transfer: "P2P Transfer",
    deposit: "Deposit",
    topup: "Top-up",
    withdrawal: "Withdrawal",
    cashout: "Cash Out",
    crypto_send: "Crypto Send",
    crypto_topup: "Crypto Top-up",
    crypto_cashout: "Crypto Cash Out",
    qrph_cashin: "QRPH Cash-in",
    qrph_credit: "QRPH Credit",
    qrph_payout: "QRPH Payout",
    qrph_payout_failed: "QRPH Payout (Failed)",
    manual_deposit: "Manual Deposit",
    casino_deposit: "Casino Deposit",
    casino_withdraw: "Casino Withdrawal",
    sync_credit: "Balance Credit",
    sync_debit: "Balance Debit",
  };
  return typeNames[type] || type;
}

// Get status display name
function getStatusDisplayName(status: string): string {
  const statusNames: Record<string, string> = {
    completed: "Completed",
    pending: "Pending",
    failed: "Failed",
    refunded: "Refunded",
    cancelled: "Cancelled",
  };
  return statusNames[status] || status;
}

export function registerReportRoutes(app: Express) {
  // Middleware to check admin access
  const adminMiddleware = (req: Request, res: Response, next: Function) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  };

  // Get transaction report data with filters
  app.get("/api/admin/reports/transactions", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const filters = parseFilters(req.query);
      const result = await getTransactionReportData(filters);
      res.json(result);
    } catch (error: any) {
      console.error("[Reports] Error fetching transaction report:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Export transactions to CSV
  app.get("/api/admin/reports/transactions/export/csv", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const filters = parseFilters(req.query);
      filters.limit = 50000; // Higher limit for export

      const { transactions } = await getTransactionReportData(filters);

      // Transform to flat structure for CSV
      const csvData = transactions.map((tx: any) => ({
        ID: tx.id,
        Date: formatDate(tx.createdAt),
        Type: getTypeDisplayName(tx.type),
        "User Name": tx.userName || "",
        "User Email": tx.userEmail || "",
        Username: tx.username || "",
        Amount: formatAmount(tx.amount),
        Status: getStatusDisplayName(tx.status),
        Reference: tx.externalTxId || "",
        Note: tx.note || "",
        Category: tx.category || "",
      }));

      const csv = stringify(csvData, { header: true });

      const filename = `transactions_${new Date().toISOString().split("T")[0]}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error: any) {
      console.error("[Reports] CSV export error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Export transactions to Excel
  app.get("/api/admin/reports/transactions/export/excel", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const filters = parseFilters(req.query);
      filters.limit = 50000; // Higher limit for export

      const { transactions, summary } = await getTransactionReportData(filters);

      // Create workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "PayVerse Admin";
      workbook.created = new Date();

      // Add transactions sheet
      const sheet = workbook.addWorksheet("Transactions");

      // Define columns
      sheet.columns = [
        { header: "ID", key: "id", width: 8 },
        { header: "Date", key: "date", width: 20 },
        { header: "Type", key: "type", width: 18 },
        { header: "User Name", key: "userName", width: 20 },
        { header: "User Email", key: "userEmail", width: 25 },
        { header: "Username", key: "username", width: 15 },
        { header: "Amount (PHP)", key: "amount", width: 15 },
        { header: "Status", key: "status", width: 12 },
        { header: "Reference", key: "reference", width: 25 },
        { header: "Note", key: "note", width: 30 },
        { header: "Category", key: "category", width: 15 },
      ];

      // Style header row
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F46E5" }, // Primary color
      };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.height = 25;

      // Add data rows
      transactions.forEach((tx: any) => {
        const row = sheet.addRow({
          id: tx.id,
          date: formatDate(tx.createdAt),
          type: getTypeDisplayName(tx.type),
          userName: tx.userName || "",
          userEmail: tx.userEmail || "",
          username: tx.username || "",
          amount: parseFloat(tx.amount),
          status: getStatusDisplayName(tx.status),
          reference: tx.externalTxId || "",
          note: tx.note || "",
          category: tx.category || "",
        });

        // Style status column based on status
        const statusCell = row.getCell("status");
        if (tx.status === "completed") {
          statusCell.font = { color: { argb: "FF16A34A" } }; // Green
        } else if (tx.status === "pending") {
          statusCell.font = { color: { argb: "FFCA8A04" } }; // Yellow
        } else if (tx.status === "failed" || tx.status === "refunded") {
          statusCell.font = { color: { argb: "FFDC2626" } }; // Red
        }

        // Format amount as currency
        const amountCell = row.getCell("amount");
        amountCell.numFmt = "#,##0.00";
      });

      // Add summary sheet
      const summarySheet = workbook.addWorksheet("Summary");
      summarySheet.columns = [
        { header: "Metric", key: "metric", width: 25 },
        { header: "Value", key: "value", width: 20 },
      ];

      const summaryHeaderRow = summarySheet.getRow(1);
      summaryHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      summaryHeaderRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F46E5" },
      };

      summarySheet.addRow({ metric: "Total Transactions", value: summary.totalCount });
      summarySheet.addRow({ metric: "Total Volume (PHP)", value: summary.totalVolume });
      summarySheet.addRow({ metric: "Completed", value: summary.completedCount });
      summarySheet.addRow({ metric: "Pending", value: summary.pendingCount });
      summarySheet.addRow({ metric: "Failed/Refunded", value: summary.failedCount });
      summarySheet.addRow({ metric: "Report Generated", value: formatDate(new Date()) });

      if (filters.from) {
        summarySheet.addRow({ metric: "From Date", value: formatDate(filters.from) });
      }
      if (filters.to) {
        summarySheet.addRow({ metric: "To Date", value: formatDate(filters.to) });
      }

      // Format volume cell
      summarySheet.getCell("B2").numFmt = "#,##0.00";

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();

      const filename = `transactions_${new Date().toISOString().split("T")[0]}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error: any) {
      console.error("[Reports] Excel export error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get user report data
  app.get("/api/admin/reports/users", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const filters = parseFilters(req.query);
      const result = await getUserReportData(filters);
      res.json(result);
    } catch (error: any) {
      console.error("[Reports] Error fetching user report:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Export users to CSV
  app.get("/api/admin/reports/users/export/csv", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const filters = parseFilters(req.query);
      const { users } = await getUserReportData(filters);

      const csvData = users.map((u: any) => ({
        ID: u.id,
        "Full Name": u.fullName,
        Username: u.username,
        Email: u.email,
        "PHPT Balance": formatAmount(u.phptBalance),
        "KYC Status": u.kycStatus,
        Role: u.role,
        Active: u.isActive ? "Yes" : "No",
        "Phone Number": u.phoneNumber || "",
        "Created At": formatDate(u.createdAt),
        "Transaction Count": u.transactionCount || 0,
        "Total Volume": formatAmount(u.totalVolume || 0),
      }));

      const csv = stringify(csvData, { header: true });

      const filename = `users_${new Date().toISOString().split("T")[0]}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error: any) {
      console.error("[Reports] User CSV export error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Export users to Excel
  app.get("/api/admin/reports/users/export/excel", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const filters = parseFilters(req.query);
      const { users, summary } = await getUserReportData(filters);

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "PayVerse Admin";
      workbook.created = new Date();

      const sheet = workbook.addWorksheet("Users");

      sheet.columns = [
        { header: "ID", key: "id", width: 8 },
        { header: "Full Name", key: "fullName", width: 20 },
        { header: "Username", key: "username", width: 15 },
        { header: "Email", key: "email", width: 25 },
        { header: "PHPT Balance", key: "balance", width: 15 },
        { header: "KYC Status", key: "kycStatus", width: 12 },
        { header: "Role", key: "role", width: 12 },
        { header: "Active", key: "active", width: 8 },
        { header: "Phone", key: "phone", width: 15 },
        { header: "Created At", key: "createdAt", width: 20 },
        { header: "Tx Count", key: "txCount", width: 10 },
        { header: "Total Volume", key: "volume", width: 15 },
      ];

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F46E5" },
      };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.height = 25;

      users.forEach((u: any) => {
        const row = sheet.addRow({
          id: u.id,
          fullName: u.fullName,
          username: u.username,
          email: u.email,
          balance: parseFloat(u.phptBalance),
          kycStatus: u.kycStatus,
          role: u.role,
          active: u.isActive ? "Yes" : "No",
          phone: u.phoneNumber || "",
          createdAt: formatDate(u.createdAt),
          txCount: u.transactionCount || 0,
          volume: parseFloat(u.totalVolume || 0),
        });

        row.getCell("balance").numFmt = "#,##0.00";
        row.getCell("volume").numFmt = "#,##0.00";

        // Style KYC status
        const kycCell = row.getCell("kycStatus");
        if (u.kycStatus === "verified") {
          kycCell.font = { color: { argb: "FF16A34A" } };
        } else if (u.kycStatus === "pending") {
          kycCell.font = { color: { argb: "FFCA8A04" } };
        }
      });

      // Summary sheet
      const summarySheet = workbook.addWorksheet("Summary");
      summarySheet.columns = [
        { header: "Metric", key: "metric", width: 25 },
        { header: "Value", key: "value", width: 20 },
      ];

      const summaryHeaderRow = summarySheet.getRow(1);
      summaryHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      summaryHeaderRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F46E5" },
      };

      summarySheet.addRow({ metric: "Total Users", value: summary.totalUsers });
      summarySheet.addRow({ metric: "Active Users", value: summary.activeUsers });
      summarySheet.addRow({ metric: "KYC Verified", value: summary.verifiedUsers });
      summarySheet.addRow({ metric: "KYC Pending", value: summary.pendingKyc });
      summarySheet.addRow({ metric: "Total Balance (PHP)", value: summary.totalBalance });
      summarySheet.addRow({ metric: "Report Generated", value: formatDate(new Date()) });

      summarySheet.getCell("B5").numFmt = "#,##0.00";

      const buffer = await workbook.xlsx.writeBuffer();

      const filename = `users_${new Date().toISOString().split("T")[0]}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error: any) {
      console.error("[Reports] User Excel export error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get available transaction types for filter dropdown
  app.get("/api/admin/reports/transaction-types", authMiddleware, adminMiddleware, async (_req: Request, res: Response) => {
    const types = [
      { value: "all", label: "All Types" },
      { value: "transfer", label: "P2P Transfer" },
      { value: "deposit", label: "Deposit" },
      { value: "withdrawal", label: "Withdrawal" },
      { value: "qrph_cashin", label: "QRPH Cash-in" },
      { value: "qrph_credit", label: "QRPH Credit" },
      { value: "qrph_payout", label: "QRPH Payout" },
      { value: "manual_deposit", label: "Manual Deposit" },
      { value: "casino_deposit", label: "Casino Deposit" },
      { value: "casino_withdraw", label: "Casino Withdrawal" },
      { value: "crypto_send", label: "Crypto Send" },
      { value: "crypto_topup", label: "Crypto Top-up" },
      { value: "sync_credit", label: "Balance Credit" },
      { value: "sync_debit", label: "Balance Debit" },
    ];
    res.json(types);
  });

  console.log("[Reports] Admin report routes registered");
}

// Helper function to get transaction report data
async function getTransactionReportData(filters: ReportFilters) {
  // Get all transactions with user info
  const allTransactions = await storage.getAllTransactionsWithUsers(filters);

  // Calculate summary
  let totalVolume = 0;
  let completedCount = 0;
  let pendingCount = 0;
  let failedCount = 0;

  allTransactions.forEach((tx: any) => {
    totalVolume += parseFloat(tx.amount) || 0;
    if (tx.status === "completed") completedCount++;
    else if (tx.status === "pending") pendingCount++;
    else failedCount++;
  });

  return {
    transactions: allTransactions,
    summary: {
      totalCount: allTransactions.length,
      totalVolume: totalVolume.toFixed(2),
      completedCount,
      pendingCount,
      failedCount,
    },
    filters,
  };
}

// Helper function to get user report data
async function getUserReportData(filters: ReportFilters) {
  const allUsers = await storage.getAllUsersWithStats(filters);

  let totalBalance = 0;
  let activeUsers = 0;
  let verifiedUsers = 0;
  let pendingKyc = 0;

  allUsers.forEach((u: any) => {
    totalBalance += parseFloat(u.phptBalance) || 0;
    if (u.isActive) activeUsers++;
    if (u.kycStatus === "verified") verifiedUsers++;
    else if (u.kycStatus === "pending") pendingKyc++;
  });

  return {
    users: allUsers,
    summary: {
      totalUsers: allUsers.length,
      activeUsers,
      verifiedUsers,
      pendingKyc,
      totalBalance: totalBalance.toFixed(2),
    },
    filters,
  };
}
