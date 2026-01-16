import { db, pool } from "../db";
import { drizzle } from "drizzle-orm/node-postgres";
import { users, transactions, paygramConnections, cryptoInvoices, cryptoWithdrawals, adminAuditLogs, balanceAdjustments, manualPaymentMethods, manualDepositRequests, emailOtps, kycDocuments, userTutorials, casinoLinks, casinoTransactions, type User, type InsertUser, type Transaction, type InsertTransaction, type PaygramConnection, type CryptoInvoice, type CryptoWithdrawal, type AdminAuditLog, type InsertAdminAuditLog, type BalanceAdjustment, type InsertBalanceAdjustment, type ManualPaymentMethod, type InsertManualPaymentMethod, type ManualDepositRequest, type InsertManualDepositRequest, type EmailOtp, type InsertEmailOtp, type KycDocument, type InsertKycDocument, type CasinoLink, type InsertCasinoLink, type CasinoTransaction, type InsertCasinoTransaction } from "@shared/schema";
import { eq, desc, or, sql, ilike, and, gt, lt, inArray, isNull } from "drizzle-orm";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserBalance(userId: number, newBalance: string): Promise<void>;
  updateUserFiatBalance(userId: number, newBalance: string): Promise<void>;
  updateUserPhptBalance(userId: number, newBalance: string): Promise<void>;
  creditPhptBalance(userId: number, amount: number): Promise<{ newPhptBalance: string; newTotalBalance: string }>;
  debitPhptBalance(userId: number, amount: number): Promise<{ newPhptBalance: string; newTotalBalance: string }>;
  syncPhptBalance(userId: number, newBalance: number): Promise<void>;
  
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  getTransactionsByUserId(userId: number): Promise<Transaction[]>;
  updateTransactionStatus(transactionId: number, status: string): Promise<void>;
  
  searchUsers(query: string): Promise<Pick<User, 'id' | 'fullName' | 'username' | 'email'>[]>;
  
  getPaygramConnection(userId: number): Promise<PaygramConnection | undefined>;
  createPaygramConnection(userId: number, paygramUserId: string, apiToken: string): Promise<PaygramConnection>;
  updatePaygramConnection(userId: number, updates: { isValid?: boolean; lastError?: string | null; lastSyncAt?: Date }): Promise<void>;
  deletePaygramConnection(userId: number): Promise<void>;
  
  createCryptoInvoice(data: { invoiceId: string; invoiceCode?: string; userId: number; amount: string; currencyCode: number; payUrl?: string; voucherCode?: string }): Promise<CryptoInvoice>;
  getCryptoInvoiceByInvoiceId(invoiceId: string): Promise<CryptoInvoice | undefined>;
  getCryptoInvoiceByInvoiceCode(invoiceCode: string): Promise<CryptoInvoice | undefined>;
  updateCryptoInvoiceStatus(invoiceId: string, status: string, paidAt?: Date): Promise<void>;
  
  createCryptoWithdrawal(data: { userId: number; amount: string; fee: string; method: string; currencyCode: number }): Promise<CryptoWithdrawal>;
  getCryptoWithdrawal(id: number): Promise<CryptoWithdrawal | undefined>;
  updateCryptoWithdrawal(id: number, updates: { status?: string; paygramRequestId?: string; paygramTxId?: string; voucherCode?: string; errorMessage?: string; processedAt?: Date }): Promise<void>;
  getCryptoWithdrawalsByUserId(userId: number): Promise<CryptoWithdrawal[]>;
  
  getAllUsers(): Promise<User[]>;
  getAllTransactions(): Promise<Transaction[]>;
  getAdminStats(): Promise<{ 
    totalUsers: number; 
    totalTransactions: number; 
    totalVolume: string;
    activeUsers: number;
    verifiedUsers: number;
    cryptoConnections: number;
  }>;
  updateUserAdmin(userId: number, updates: { isActive?: boolean; isAdmin?: boolean; kycStatus?: string; role?: string }): Promise<void>;
  updateUserRole(userId: number, role: string): Promise<void>;
  
  createAdminAuditLog(log: InsertAdminAuditLog): Promise<AdminAuditLog>;
  getAdminAuditLogs(limit?: number): Promise<AdminAuditLog[]>;
  
  createBalanceAdjustment(adjustment: InsertBalanceAdjustment): Promise<BalanceAdjustment>;
  getBalanceAdjustments(limit?: number): Promise<BalanceAdjustment[]>;
  getBalanceAdjustmentsByUserId(userId: number): Promise<BalanceAdjustment[]>;
  
  adjustBalanceWithAudit(params: {
    adminId: number;
    userId: number;
    amount: string;
    adjustmentType: string;
    reason: string;
    previousBalance: string;
    newBalance: string;
    ipAddress: string | null;
  }): Promise<{ adjustment: BalanceAdjustment; auditLog: AdminAuditLog }>;
  
  searchUsersAdmin(query: string): Promise<User[]>;
  searchTransactionsAdmin(filters: { userId?: number; status?: string; type?: string; dateFrom?: Date; dateTo?: Date }): Promise<Transaction[]>;
  getPendingKycUsers(): Promise<User[]>;
  
  findPendingQrphTransaction(transactionId: string): Promise<Transaction | undefined>;
  claimQrphTransaction(transactionId: number): Promise<boolean>;
  getPendingQrphTransactions(): Promise<Transaction[]>;
  getTransaction(id: number): Promise<Transaction | undefined>;
  
  // Manual Payment Methods
  getActivePaymentMethods(): Promise<ManualPaymentMethod[]>;
  getAllPaymentMethods(): Promise<ManualPaymentMethod[]>;
  getPaymentMethod(id: number): Promise<ManualPaymentMethod | undefined>;
  createPaymentMethod(data: InsertManualPaymentMethod): Promise<ManualPaymentMethod>;
  updatePaymentMethod(id: number, data: Partial<InsertManualPaymentMethod>): Promise<ManualPaymentMethod | undefined>;
  deletePaymentMethod(id: number): Promise<void>;
  
  // Manual Deposit Requests
  createManualDepositRequest(data: InsertManualDepositRequest): Promise<ManualDepositRequest>;
  getManualDepositRequest(id: number): Promise<ManualDepositRequest | undefined>;
  getManualDepositsByUserId(userId: number): Promise<ManualDepositRequest[]>;
  getPendingManualDeposits(): Promise<ManualDepositRequest[]>;
  getAllManualDeposits(): Promise<ManualDepositRequest[]>;
  getManualDepositsByStatus(status: string): Promise<ManualDepositRequest[]>;
  updateManualDepositStatus(id: number, status: string, updates: { adminId?: number; adminNote?: string; rejectionReason?: string; paygramTxId?: string }): Promise<ManualDepositRequest | undefined>;
  
  // Email OTP
  createEmailOtp(data: { email: string; otp: string; purpose: string; expiresAt: Date }): Promise<EmailOtp>;
  verifyEmailOtp(email: string, otp: string, purpose: string): Promise<{ valid: boolean; message?: string }>;
  
  // PIN Management
  updateUserPin(userId: number, pinHash: string): Promise<void>;
  updateUserPinAttempts(userId: number, attempts: number, lockedUntil: Date | null): Promise<void>;
  updateUserPassword(userId: number, hashedPassword: string): Promise<void>;
  updateUserLastLogin(userId: number, ipAddress: string | null): Promise<void>;
  
  // KYC Documents
  createKycDocument(doc: InsertKycDocument): Promise<KycDocument>;
  getKycDocumentsByUserId(userId: number): Promise<KycDocument[]>;
  updateKycDocumentStatus(id: number, status: string, adminNote?: string): Promise<void>;
  getPendingKycDocuments(): Promise<(KycDocument & { user: Pick<User, 'id' | 'fullName' | 'email' | 'username'> })[]>;
  
  // Tutorials
  getCompletedTutorials(userId: number): Promise<string[]>;
  markTutorialComplete(userId: number, tutorialId: string): Promise<void>;
  resetTutorials(userId: number): Promise<void>;
  
  // Casino Links
  getCasinoLink(userId: number): Promise<CasinoLink | undefined>;
  getCasinoLinkByUsername(casinoUsername: string): Promise<CasinoLink | undefined>;
  createCasinoLink(data: InsertCasinoLink): Promise<CasinoLink>;
  updateCasinoLink(userId: number, updates: Partial<InsertCasinoLink>): Promise<CasinoLink | undefined>;
  deleteCasinoLink(userId: number): Promise<void>;
  
  // Casino Transactions (state machine for buy/sell with fallback)
  createCasinoTransaction(data: InsertCasinoTransaction): Promise<CasinoTransaction>;
  getCasinoTransaction(id: number): Promise<CasinoTransaction | undefined>;
  getCasinoTransactionByTxId(transactionId: string): Promise<CasinoTransaction | undefined>;
  updateCasinoTransaction(id: number, updates: Partial<CasinoTransaction>): Promise<CasinoTransaction | undefined>;
  getCasinoTransactionsByUserId(userId: number): Promise<CasinoTransaction[]>;
  getPendingCasinoTransactions(): Promise<CasinoTransaction[]>;
  getManualRequiredCasinoTransactions(): Promise<CasinoTransaction[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserBalance(userId: number, newBalance: string): Promise<void> {
    await db.update(users).set({ balance: newBalance }).where(eq(users.id, userId));
  }

  async updateUserFiatBalance(userId: number, newBalance: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");
    const phptBalance = parseFloat(user.phptBalance || "0");
    const newTotalBalance = (parseFloat(newBalance) + phptBalance).toFixed(2);
    await db.update(users).set({ 
      fiatBalance: newBalance,
      balance: newTotalBalance 
    }).where(eq(users.id, userId));
  }

  async updateUserPhptBalance(userId: number, newBalance: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");
    const fiatBalance = parseFloat(user.fiatBalance || "0");
    const newTotalBalance = (parseFloat(newBalance) + fiatBalance).toFixed(2);
    await db.update(users).set({ 
      phptBalance: newBalance,
      balance: newTotalBalance 
    }).where(eq(users.id, userId));
  }

  async creditPhptBalance(userId: number, amount: number): Promise<{ newPhptBalance: string; newTotalBalance: string }> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");
    const currentPhpt = parseFloat(user.phptBalance || "0");
    const currentFiat = parseFloat(user.fiatBalance || "0");
    const newPhptBalanceNum = currentPhpt + amount;
    const newPhptBalance = newPhptBalanceNum.toFixed(2);
    const newTotalBalance = (currentFiat + newPhptBalanceNum).toFixed(2);
    await db.update(users).set({ 
      phptBalance: newPhptBalance,
      balance: newTotalBalance 
    }).where(eq(users.id, userId));
    return { newPhptBalance, newTotalBalance };
  }

  async debitPhptBalance(userId: number, amount: number): Promise<{ newPhptBalance: string; newTotalBalance: string }> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");
    const currentPhpt = parseFloat(user.phptBalance || "0");
    if (currentPhpt < amount) {
      throw new Error("Insufficient PHPT balance");
    }
    const currentFiat = parseFloat(user.fiatBalance || "0");
    const newPhptBalanceNum = currentPhpt - amount;
    const newPhptBalance = newPhptBalanceNum.toFixed(2);
    const newTotalBalance = (currentFiat + newPhptBalanceNum).toFixed(2);
    await db.update(users).set({ 
      phptBalance: newPhptBalance,
      balance: newTotalBalance 
    }).where(eq(users.id, userId));
    return { newPhptBalance, newTotalBalance };
  }

  async syncPhptBalance(userId: number, newBalance: number): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");
    // Guard against NaN from parseFloat
    const sanitizedBalance = isNaN(newBalance) ? 0 : newBalance;
    const currentFiat = parseFloat(user.fiatBalance || "0") || 0;
    const newPhptBalance = sanitizedBalance.toFixed(2);
    const newTotalBalance = (currentFiat + sanitizedBalance).toFixed(2);
    await db.update(users).set({ 
      phptBalance: newPhptBalance,
      balance: newTotalBalance 
    }).where(eq(users.id, userId));
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const [transaction] = await db.insert(transactions).values(insertTransaction).returning();
    return transaction;
  }

  async getTransactionsByUserId(userId: number): Promise<Transaction[]> {
    return await db
      .select()
      .from(transactions)
      .where(or(eq(transactions.senderId, userId), eq(transactions.receiverId, userId)))
      .orderBy(desc(transactions.createdAt));
  }

  async updateTransactionStatus(transactionId: number, status: string): Promise<void> {
    await db
      .update(transactions)
      .set({ status, updatedAt: new Date() })
      .where(eq(transactions.id, transactionId));
  }

  async searchUsers(query: string): Promise<Pick<User, 'id' | 'fullName' | 'username' | 'email'>[]> {
    // Privacy fix: Require exact match on username, email, or phone number
    // This prevents exposing other users' accounts through partial keyword searches
    const exactQuery = query.toLowerCase().trim();
    return await db
      .select({
        id: users.id,
        fullName: users.fullName,
        username: users.username,
        email: users.email,
      })
      .from(users)
      .where(
        or(
          sql`LOWER(${users.username}) = ${exactQuery}`,
          sql`LOWER(${users.email}) = ${exactQuery}`,
          sql`${users.phoneNumber} = ${query.trim()}`
        )
      )
      .limit(10);
  }

  async getPaygramConnection(userId: number): Promise<PaygramConnection | undefined> {
    const [connection] = await db.select().from(paygramConnections).where(eq(paygramConnections.userId, userId));
    return connection;
  }

  async createPaygramConnection(userId: number, paygramUserId: string, apiToken: string): Promise<PaygramConnection> {
    const existing = await this.getPaygramConnection(userId);
    if (existing) {
      await db.update(paygramConnections)
        .set({ paygramUserId, apiToken, isValid: true, lastError: null, updatedAt: new Date() })
        .where(eq(paygramConnections.userId, userId));
      const [updated] = await db.select().from(paygramConnections).where(eq(paygramConnections.userId, userId));
      return updated;
    }
    const [connection] = await db.insert(paygramConnections)
      .values({ userId, paygramUserId, apiToken })
      .returning();
    return connection;
  }

  async updatePaygramConnection(userId: number, updates: { isValid?: boolean; lastError?: string | null; lastSyncAt?: Date }): Promise<void> {
    await db.update(paygramConnections)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(paygramConnections.userId, userId));
  }

  async deletePaygramConnection(userId: number): Promise<void> {
    await db.delete(paygramConnections).where(eq(paygramConnections.userId, userId));
  }

  async createCryptoInvoice(data: { invoiceId: string; invoiceCode?: string; userId: number; amount: string; currencyCode: number; payUrl?: string; voucherCode?: string }): Promise<CryptoInvoice> {
    const [invoice] = await db.insert(cryptoInvoices)
      .values({
        invoiceId: data.invoiceId,
        invoiceCode: data.invoiceCode,
        userId: data.userId,
        amount: data.amount,
        currencyCode: data.currencyCode,
        payUrl: data.payUrl,
        voucherCode: data.voucherCode,
        status: "pending"
      })
      .returning();
    return invoice;
  }

  async getCryptoInvoiceByInvoiceId(invoiceId: string): Promise<CryptoInvoice | undefined> {
    const [invoice] = await db.select().from(cryptoInvoices).where(eq(cryptoInvoices.invoiceId, invoiceId));
    return invoice;
  }

  async getCryptoInvoiceByInvoiceCode(invoiceCode: string): Promise<CryptoInvoice | undefined> {
    const [invoice] = await db.select().from(cryptoInvoices).where(eq(cryptoInvoices.invoiceCode, invoiceCode));
    return invoice;
  }

  async updateCryptoInvoiceStatus(invoiceId: string, status: string, paidAt?: Date): Promise<void> {
    await db.update(cryptoInvoices)
      .set({ status, paidAt, updatedAt: new Date() })
      .where(eq(cryptoInvoices.invoiceId, invoiceId));
  }

  async getCryptoInvoicesByUserId(userId: number): Promise<CryptoInvoice[]> {
    return await db.select().from(cryptoInvoices)
      .where(eq(cryptoInvoices.userId, userId))
      .orderBy(desc(cryptoInvoices.createdAt));
  }

  async getPendingCryptoInvoicesByUserId(userId: number): Promise<CryptoInvoice[]> {
    return await db.select().from(cryptoInvoices)
      .where(and(
        eq(cryptoInvoices.userId, userId),
        eq(cryptoInvoices.status, "pending")
      ))
      .orderBy(desc(cryptoInvoices.createdAt));
  }

  async creditCryptoInvoice(invoiceId: string, transactionId: number, paygramTxId?: string): Promise<void> {
    await db.update(cryptoInvoices)
      .set({ 
        status: "credited", 
        creditedAt: new Date(),
        creditedTransactionId: transactionId,
        paygramTxId: paygramTxId,
        updatedAt: new Date() 
      })
      .where(eq(cryptoInvoices.invoiceId, invoiceId));
  }

  async markInvoicePaid(invoiceId: string, paygramTxId?: string): Promise<void> {
    await db.update(cryptoInvoices)
      .set({ 
        status: "paid", 
        paidAt: new Date(),
        paygramTxId: paygramTxId,
        updatedAt: new Date() 
      })
      .where(eq(cryptoInvoices.invoiceId, invoiceId));
  }

  async createCryptoWithdrawal(data: { userId: number; amount: string; fee: string; method: string; currencyCode: number }): Promise<CryptoWithdrawal> {
    const [withdrawal] = await db.insert(cryptoWithdrawals)
      .values({
        userId: data.userId,
        amount: data.amount,
        fee: data.fee,
        method: data.method,
        currencyCode: data.currencyCode,
        status: "pending"
      })
      .returning();
    return withdrawal;
  }

  async getCryptoWithdrawal(id: number): Promise<CryptoWithdrawal | undefined> {
    const [withdrawal] = await db.select().from(cryptoWithdrawals).where(eq(cryptoWithdrawals.id, id));
    return withdrawal;
  }

  async updateCryptoWithdrawal(id: number, updates: { status?: string; paygramRequestId?: string; paygramTxId?: string; voucherCode?: string; errorMessage?: string; processedAt?: Date }): Promise<void> {
    await db.update(cryptoWithdrawals)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(cryptoWithdrawals.id, id));
  }

  async getCryptoWithdrawalsByUserId(userId: number): Promise<CryptoWithdrawal[]> {
    return await db.select().from(cryptoWithdrawals)
      .where(eq(cryptoWithdrawals.userId, userId))
      .orderBy(desc(cryptoWithdrawals.createdAt));
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getAllTransactions(): Promise<Transaction[]> {
    return await db.select().from(transactions).orderBy(desc(transactions.createdAt)).limit(100);
  }

  async getAdminStats(): Promise<{ 
    totalUsers: number; 
    totalTransactions: number; 
    totalVolume: string;
    activeUsers: number;
    verifiedUsers: number;
    cryptoConnections: number;
  }> {
    const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const [activeCount] = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.isActive, true));
    const [verifiedCount] = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.kycStatus, "verified"));
    const [cryptoCount] = await db.select({ count: sql<number>`count(*)` }).from(paygramConnections).where(eq(paygramConnections.isValid, true));
    const [txCount] = await db.select({ count: sql<number>`count(*)` }).from(transactions);
    const [volume] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` }).from(transactions).where(eq(transactions.status, "completed"));
    
    return {
      totalUsers: Number(userCount?.count || 0),
      totalTransactions: Number(txCount?.count || 0),
      totalVolume: volume?.total || "0",
      activeUsers: Number(activeCount?.count || 0),
      verifiedUsers: Number(verifiedCount?.count || 0),
      cryptoConnections: Number(cryptoCount?.count || 0)
    };
  }

  async updateUserAdmin(userId: number, updates: { isActive?: boolean; isAdmin?: boolean; kycStatus?: string; role?: string }): Promise<void> {
    const updateData: any = {};
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
    if (updates.isAdmin !== undefined) updateData.isAdmin = updates.isAdmin;
    if (updates.kycStatus !== undefined) updateData.kycStatus = updates.kycStatus;
    if (updates.role !== undefined) {
      updateData.role = updates.role;
      updateData.isAdmin = updates.role === "super_admin" || updates.role === "admin";
    }
    
    if (Object.keys(updateData).length > 0) {
      await db.update(users).set(updateData).where(eq(users.id, userId));
    }
  }

  async updateUserRole(userId: number, role: string): Promise<void> {
    const isAdmin = role === "super_admin" || role === "admin";
    await db.update(users).set({ role, isAdmin }).where(eq(users.id, userId));
  }

  async createAdminAuditLog(log: InsertAdminAuditLog): Promise<AdminAuditLog> {
    const [auditLog] = await db.insert(adminAuditLogs).values(log).returning();
    return auditLog;
  }

  async getAdminAuditLogs(limit: number = 100): Promise<AdminAuditLog[]> {
    return await db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(limit);
  }

  async createBalanceAdjustment(adjustment: InsertBalanceAdjustment): Promise<BalanceAdjustment> {
    const [balanceAdj] = await db.insert(balanceAdjustments).values(adjustment).returning();
    return balanceAdj;
  }

  async getBalanceAdjustments(limit: number = 100): Promise<BalanceAdjustment[]> {
    return await db.select().from(balanceAdjustments).orderBy(desc(balanceAdjustments.createdAt)).limit(limit);
  }

  async getBalanceAdjustmentsByUserId(userId: number): Promise<BalanceAdjustment[]> {
    return await db.select().from(balanceAdjustments)
      .where(eq(balanceAdjustments.userId, userId))
      .orderBy(desc(balanceAdjustments.createdAt));
  }

  async searchUsersAdmin(query: string): Promise<User[]> {
    if (!query) return this.getAllUsers();
    const searchPattern = `%${query}%`;
    return await db.select().from(users)
      .where(
        or(
          sql`${users.fullName} ILIKE ${searchPattern}`,
          sql`${users.username} ILIKE ${searchPattern}`,
          sql`${users.email} ILIKE ${searchPattern}`
        )
      )
      .orderBy(desc(users.createdAt));
  }

  async searchTransactionsAdmin(filters: { userId?: number; status?: string; type?: string; dateFrom?: Date; dateTo?: Date }): Promise<Transaction[]> {
    let query = db.select().from(transactions);
    const conditions = [];
    
    if (filters.userId) {
      conditions.push(or(eq(transactions.senderId, filters.userId), eq(transactions.receiverId, filters.userId)));
    }
    if (filters.status) {
      conditions.push(eq(transactions.status, filters.status));
    }
    if (filters.type) {
      conditions.push(eq(transactions.type, filters.type));
    }
    
    if (conditions.length > 0) {
      return await db.select().from(transactions)
        .where(and(...conditions))
        .orderBy(desc(transactions.createdAt))
        .limit(100);
    }
    
    return await db.select().from(transactions)
      .orderBy(desc(transactions.createdAt))
      .limit(100);
  }

  async getPendingKycUsers(): Promise<User[]> {
    return await db.select().from(users)
      .where(eq(users.kycStatus, "pending"))
      .orderBy(desc(users.createdAt));
  }

  async adjustBalanceWithAudit(params: {
    adminId: number;
    userId: number;
    amount: string;
    adjustmentType: string;
    reason: string;
    previousBalance: string;
    newBalance: string;
    ipAddress: string | null;
  }): Promise<{ adjustment: BalanceAdjustment; auditLog: AdminAuditLog }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const txDb = drizzle(client);
      
      // Get current fiat balance to recalculate total
      const [user] = await txDb.select().from(users).where(eq(users.id, params.userId));
      const currentFiat = parseFloat(user?.fiatBalance || "0");
      const newPhptBalance = parseFloat(params.newBalance);
      const newTotalBalance = (currentFiat + newPhptBalance).toFixed(2);
      
      // Update phptBalance and recalculate total balance
      await txDb.update(users).set({ 
        phptBalance: params.newBalance,
        balance: newTotalBalance 
      }).where(eq(users.id, params.userId));
      
      const [adjustment] = await txDb.insert(balanceAdjustments).values({
        adminId: params.adminId,
        userId: params.userId,
        amount: params.amount,
        adjustmentType: params.adjustmentType,
        reason: params.reason,
        previousBalance: params.previousBalance,
        newBalance: params.newBalance
      }).returning();
      
      const [auditLog] = await txDb.insert(adminAuditLogs).values({
        adminId: params.adminId,
        action: "balance_adjustment",
        targetType: "user",
        targetId: params.userId,
        details: `${params.adjustmentType}: ${params.amount} PHPT. Reason: ${params.reason}`,
        previousValue: params.previousBalance,
        newValue: params.newBalance,
        ipAddress: params.ipAddress
      }).returning();
      
      await client.query('COMMIT');
      return { adjustment, auditLog };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createAuditLog(params: {
    adminId: number;
    action: string;
    targetType: string;
    targetId: number;
    details: string;
    previousValue?: string | null;
    newValue?: string | null;
    ipAddress?: string | null;
  }): Promise<AdminAuditLog> {
    const [auditLog] = await db.insert(adminAuditLogs).values({
      adminId: params.adminId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      details: params.details,
      previousValue: params.previousValue || null,
      newValue: params.newValue || null,
      ipAddress: params.ipAddress || null
    }).returning();
    return auditLog;
  }

  // Transactional admin top-up: credits PHPT, creates transaction record, and logs audit
  async topupUserWithAudit(params: {
    adminId: number;
    userId: number;
    amount: number;
    paymentMethod: string;
    reference: string | null;
    previousBalance: string;
    ipAddress: string | null;
  }): Promise<{ newPhptBalance: string; newTotalBalance: string; transaction: Transaction; auditLog: AdminAuditLog }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const txDb = drizzle(client);
      
      // Get current user balances
      const [user] = await txDb.select().from(users).where(eq(users.id, params.userId));
      if (!user) throw new Error("User not found");
      
      const currentPhpt = parseFloat(user.phptBalance || "0");
      const currentFiat = parseFloat(user.fiatBalance || "0");
      const newPhptBalanceNum = currentPhpt + params.amount;
      const newPhptBalance = newPhptBalanceNum.toFixed(2);
      const newTotalBalance = (currentFiat + newPhptBalanceNum).toFixed(2);
      
      // Update user balances
      await txDb.update(users).set({ 
        phptBalance: newPhptBalance,
        balance: newTotalBalance 
      }).where(eq(users.id, params.userId));
      
      // Create transaction record
      const [transaction] = await txDb.insert(transactions).values({
        senderId: null,
        receiverId: params.userId,
        amount: params.amount.toFixed(2),
        type: "topup",
        status: "completed",
        category: "Top-up",
        note: `${params.paymentMethod} top-up${params.reference ? `: ${params.reference}` : ''}`,
        walletType: "phpt"
      }).returning();
      
      // Create audit log
      const [auditLog] = await txDb.insert(adminAuditLogs).values({
        adminId: params.adminId,
        action: "topup_user",
        targetType: "user",
        targetId: params.userId,
        details: `Credited ${params.amount} PHPT via ${params.paymentMethod}. Ref: ${params.reference || 'N/A'}`,
        previousValue: params.previousBalance,
        newValue: newPhptBalance,
        ipAddress: params.ipAddress
      }).returning();
      
      await client.query('COMMIT');
      return { newPhptBalance, newTotalBalance, transaction, auditLog };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Transactional invoice reclaim: credits PHPT, creates transaction, and marks invoice as credited atomically
  async reclaimInvoice(params: {
    userId: number;
    invoiceId: string;
    amount: number;
    paygramTxId?: string;
    invoiceCode?: string;
  }): Promise<{ newPhptBalance: string; newTotalBalance: string; transaction: Transaction }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const txDb = drizzle(client);
      
      // Get current user balances
      const [user] = await txDb.select().from(users).where(eq(users.id, params.userId));
      if (!user) throw new Error("User not found");
      
      // Check invoice exists and belongs to user
      const [invoice] = await txDb.select().from(cryptoInvoices).where(eq(cryptoInvoices.invoiceId, params.invoiceId));
      if (!invoice) throw new Error("Invoice not found");
      if (invoice.userId !== params.userId) throw new Error("Not authorized");
      if (invoice.status === "credited") throw new Error("Invoice already credited");
      
      const currentPhpt = parseFloat(user.phptBalance || "0");
      const currentFiat = parseFloat(user.fiatBalance || "0");
      const newPhptBalanceNum = currentPhpt + params.amount;
      const newPhptBalance = newPhptBalanceNum.toFixed(2);
      const newTotalBalance = (currentFiat + newPhptBalanceNum).toFixed(2);
      
      // Update user balances
      await txDb.update(users).set({ 
        phptBalance: newPhptBalance,
        balance: newTotalBalance 
      }).where(eq(users.id, params.userId));
      
      // Create transaction record
      const [transaction] = await txDb.insert(transactions).values({
        senderId: params.userId,
        receiverId: params.userId,
        amount: params.amount.toFixed(2),
        type: "crypto_topup",
        status: "completed",
        category: "Invoice Reclaim",
        note: `Reclaimed invoice ${params.invoiceCode || params.invoiceId}`,
        walletType: "phpt"
      }).returning();
      
      // Mark invoice as credited with all lifecycle data
      await txDb.update(cryptoInvoices).set({ 
        status: "credited",
        creditedAt: new Date(),
        creditedTransactionId: transaction.id,
        paygramTxId: params.paygramTxId || null,
        paidAt: new Date(),
        updatedAt: new Date()
      }).where(eq(cryptoInvoices.invoiceId, params.invoiceId));
      
      await client.query('COMMIT');
      return { newPhptBalance, newTotalBalance, transaction };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findPendingQrphTransaction(transactionId: string): Promise<Transaction | undefined> {
    // First check for pending status
    let [transaction] = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.type, "qrph_cashin"),
          eq(transactions.status, "pending"),
          ilike(transactions.note, `%${transactionId}%`)
        )
      );
    
    // If not pending, check for processing (being handled by another request)
    if (!transaction) {
      [transaction] = await db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.type, "qrph_cashin"),
            eq(transactions.status, "processing"),
            ilike(transactions.note, `%${transactionId}%`)
          )
        );
    }
    
    // If not found, check for completed
    if (!transaction) {
      [transaction] = await db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.type, "qrph_cashin"),
            eq(transactions.status, "completed"),
            ilike(transactions.note, `%${transactionId}%`)
          )
        );
    }
    
    return transaction;
  }

  // Atomically claim a QRPH transaction for processing (prevents race conditions)
  async claimQrphTransaction(transactionId: number): Promise<boolean> {
    const result = await db
      .update(transactions)
      .set({ status: "processing", updatedAt: new Date() })
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.status, "pending")
        )
      )
      .returning();
    
    // Returns true if the update succeeded (row was in pending status)
    return result.length > 0;
  }

  async getPendingQrphTransactions(): Promise<Transaction[]> {
    return db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.type, "qrph_cashin"),
          eq(transactions.status, "pending")
        )
      )
      .orderBy(desc(transactions.createdAt));
  }

  async getTransaction(id: number): Promise<Transaction | undefined> {
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id));
    return transaction;
  }

  // Manual Payment Methods
  async getActivePaymentMethods(): Promise<ManualPaymentMethod[]> {
    return db.select().from(manualPaymentMethods).where(eq(manualPaymentMethods.isActive, true)).orderBy(desc(manualPaymentMethods.createdAt));
  }

  async getAllPaymentMethods(): Promise<ManualPaymentMethod[]> {
    return db.select().from(manualPaymentMethods).orderBy(desc(manualPaymentMethods.createdAt));
  }

  async getPaymentMethod(id: number): Promise<ManualPaymentMethod | undefined> {
    const [method] = await db.select().from(manualPaymentMethods).where(eq(manualPaymentMethods.id, id));
    return method;
  }

  async createPaymentMethod(data: InsertManualPaymentMethod): Promise<ManualPaymentMethod> {
    const [method] = await db.insert(manualPaymentMethods).values(data).returning();
    return method;
  }

  async updatePaymentMethod(id: number, data: Partial<InsertManualPaymentMethod>): Promise<ManualPaymentMethod | undefined> {
    const [method] = await db.update(manualPaymentMethods)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(manualPaymentMethods.id, id))
      .returning();
    return method;
  }

  async deletePaymentMethod(id: number): Promise<void> {
    await db.delete(manualPaymentMethods).where(eq(manualPaymentMethods.id, id));
  }

  // Manual Deposit Requests
  async createManualDepositRequest(data: InsertManualDepositRequest): Promise<ManualDepositRequest> {
    const [request] = await db.insert(manualDepositRequests).values(data).returning();
    return request;
  }

  async getManualDepositRequest(id: number): Promise<ManualDepositRequest | undefined> {
    const [request] = await db.select().from(manualDepositRequests).where(eq(manualDepositRequests.id, id));
    return request;
  }

  async getManualDepositsByUserId(userId: number): Promise<ManualDepositRequest[]> {
    return db.select().from(manualDepositRequests).where(eq(manualDepositRequests.userId, userId)).orderBy(desc(manualDepositRequests.createdAt));
  }

  async getPendingManualDeposits(): Promise<ManualDepositRequest[]> {
    return db.select().from(manualDepositRequests).where(eq(manualDepositRequests.status, "pending")).orderBy(desc(manualDepositRequests.createdAt));
  }

  async getAllManualDeposits(): Promise<ManualDepositRequest[]> {
    return db.select().from(manualDepositRequests).orderBy(desc(manualDepositRequests.createdAt));
  }

  async getManualDepositsByStatus(status: string): Promise<ManualDepositRequest[]> {
    return db.select().from(manualDepositRequests).where(eq(manualDepositRequests.status, status)).orderBy(desc(manualDepositRequests.createdAt));
  }

  async updateManualDepositStatus(id: number, status: string, updates: { adminId?: number; adminNote?: string; rejectionReason?: string; paygramTxId?: string }): Promise<ManualDepositRequest | undefined> {
    const [request] = await db.update(manualDepositRequests)
      .set({ 
        status, 
        ...updates, 
        processedAt: new Date(),
        updatedAt: new Date() 
      })
      .where(eq(manualDepositRequests.id, id))
      .returning();
    return request;
  }

  // Email OTP
  async createEmailOtp(data: { email: string; otp: string; purpose: string; expiresAt: Date }): Promise<EmailOtp> {
    // Invalidate any previous OTPs for this email/purpose
    await db.update(emailOtps)
      .set({ verified: true })
      .where(
        and(
          eq(emailOtps.email, data.email),
          eq(emailOtps.purpose, data.purpose),
          eq(emailOtps.verified, false)
        )
      );
    
    const [otpRecord] = await db.insert(emailOtps).values(data).returning();
    return otpRecord;
  }

  async verifyEmailOtp(email: string, otp: string, purpose: string): Promise<{ valid: boolean; message?: string }> {
    const now = new Date();
    
    // Get the latest unverified OTP for this email/purpose
    const [latestOtp] = await db.select()
      .from(emailOtps)
      .where(
        and(
          eq(emailOtps.email, email),
          eq(emailOtps.purpose, purpose),
          eq(emailOtps.verified, false)
        )
      )
      .orderBy(desc(emailOtps.createdAt))
      .limit(1);
    
    if (!latestOtp) {
      return { valid: false, message: "No OTP found. Please request a new code." };
    }
    
    // Check if too many attempts
    if (latestOtp.attempts >= 5) {
      return { valid: false, message: "Too many failed attempts. Please request a new OTP." };
    }
    
    // Check if expired
    if (new Date(latestOtp.expiresAt) < now) {
      return { valid: false, message: "OTP has expired. Please request a new code." };
    }
    
    // Check if OTP matches
    if (latestOtp.otp !== otp) {
      // Increment attempts on wrong OTP
      await db.update(emailOtps)
        .set({ attempts: latestOtp.attempts + 1 })
        .where(eq(emailOtps.id, latestOtp.id));
      
      const remainingAttempts = 5 - latestOtp.attempts - 1;
      return { 
        valid: false, 
        message: remainingAttempts > 0 
          ? `Invalid OTP. ${remainingAttempts} attempt${remainingAttempts > 1 ? 's' : ''} remaining.`
          : "Too many failed attempts. Please request a new OTP."
      };
    }
    
    // Mark OTP as verified
    await db.update(emailOtps)
      .set({ verified: true })
      .where(eq(emailOtps.id, latestOtp.id));
    
    // Invalidate all other OTPs for this email/purpose
    await db.update(emailOtps)
      .set({ verified: true })
      .where(
        and(
          eq(emailOtps.email, email),
          eq(emailOtps.purpose, purpose),
          eq(emailOtps.verified, false)
        )
      );
    
    return { valid: true };
  }

  // PIN Management
  async updateUserPin(userId: number, pinHash: string): Promise<void> {
    await db.update(users)
      .set({ 
        pinHash,
        pinUpdatedAt: new Date(),
        pinFailedAttempts: 0,
        pinLockedUntil: null
      })
      .where(eq(users.id, userId));
  }

  async updateUserPinAttempts(userId: number, attempts: number, lockedUntil: Date | null): Promise<void> {
    await db.update(users)
      .set({ 
        pinFailedAttempts: attempts,
        pinLockedUntil: lockedUntil
      })
      .where(eq(users.id, userId));
  }

  async updateUserPassword(userId: number, hashedPassword: string): Promise<void> {
    await db.update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, userId));
  }

  async updateUserLastLogin(userId: number, ipAddress: string | null): Promise<void> {
    await db.update(users)
      .set({ 
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress
      })
      .where(eq(users.id, userId));
  }

  // KYC Documents
  async createKycDocument(doc: InsertKycDocument): Promise<KycDocument> {
    const [kycDoc] = await db.insert(kycDocuments).values(doc).returning();
    return kycDoc;
  }

  async getKycDocumentsByUserId(userId: number): Promise<KycDocument[]> {
    return await db.select().from(kycDocuments)
      .where(eq(kycDocuments.userId, userId))
      .orderBy(desc(kycDocuments.createdAt));
  }

  async updateKycDocumentStatus(id: number, status: string, adminNote?: string): Promise<void> {
    const updateData: any = { status, updatedAt: new Date() };
    if (adminNote !== undefined) {
      updateData.adminNote = adminNote;
    }
    await db.update(kycDocuments).set(updateData).where(eq(kycDocuments.id, id));
  }

  async getPendingKycDocuments(): Promise<(KycDocument & { user: Pick<User, 'id' | 'fullName' | 'email' | 'username'> })[]> {
    const docs = await db.select({
      id: kycDocuments.id,
      userId: kycDocuments.userId,
      documentType: kycDocuments.documentType,
      documentUrl: kycDocuments.documentUrl,
      status: kycDocuments.status,
      adminNote: kycDocuments.adminNote,
      createdAt: kycDocuments.createdAt,
      updatedAt: kycDocuments.updatedAt,
      user: {
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        username: users.username,
      }
    })
    .from(kycDocuments)
    .leftJoin(users, eq(kycDocuments.userId, users.id))
    .where(eq(kycDocuments.status, "pending"))
    .orderBy(desc(kycDocuments.createdAt));
    
    return docs.map(d => ({
      ...d,
      user: d.user!
    }));
  }

  async getCompletedTutorials(userId: number): Promise<string[]> {
    const tutorials = await db.select({ tutorialId: userTutorials.tutorialId })
      .from(userTutorials)
      .where(eq(userTutorials.userId, userId));
    return tutorials.map(t => t.tutorialId);
  }

  async markTutorialComplete(userId: number, tutorialId: string): Promise<void> {
    const existing = await db.select().from(userTutorials)
      .where(and(eq(userTutorials.userId, userId), eq(userTutorials.tutorialId, tutorialId)))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(userTutorials).values({ userId, tutorialId });
    }
  }

  async resetTutorials(userId: number): Promise<void> {
    await db.delete(userTutorials).where(eq(userTutorials.userId, userId));
  }

  // Casino Links
  async getCasinoLink(userId: number): Promise<CasinoLink | undefined> {
    const [link] = await db.select().from(casinoLinks).where(eq(casinoLinks.userId, userId));
    return link;
  }

  async getCasinoLinkByUsername(casinoUsername: string): Promise<CasinoLink | undefined> {
    const [link] = await db.select().from(casinoLinks).where(eq(casinoLinks.casinoUsername, casinoUsername));
    return link;
  }

  async createCasinoLink(data: InsertCasinoLink): Promise<CasinoLink> {
    const [link] = await db.insert(casinoLinks).values(data).returning();
    return link;
  }

  async updateCasinoLink(userId: number, updates: Partial<InsertCasinoLink>): Promise<CasinoLink | undefined> {
    const [link] = await db.update(casinoLinks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(casinoLinks.userId, userId))
      .returning();
    return link;
  }

  async deleteCasinoLink(userId: number): Promise<void> {
    await db.delete(casinoLinks).where(eq(casinoLinks.userId, userId));
  }

  // Casino Transactions (state machine for buy/sell with fallback)
  async createCasinoTransaction(data: InsertCasinoTransaction): Promise<CasinoTransaction> {
    const [tx] = await db.insert(casinoTransactions).values(data).returning();
    return tx;
  }

  async getCasinoTransaction(id: number): Promise<CasinoTransaction | undefined> {
    const [tx] = await db.select().from(casinoTransactions).where(eq(casinoTransactions.id, id));
    return tx;
  }

  async getCasinoTransactionByTxId(transactionId: string): Promise<CasinoTransaction | undefined> {
    const [tx] = await db.select().from(casinoTransactions).where(eq(casinoTransactions.transactionId, transactionId));
    return tx;
  }

  async updateCasinoTransaction(id: number, updates: Partial<CasinoTransaction>): Promise<CasinoTransaction | undefined> {
    const [tx] = await db.update(casinoTransactions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(casinoTransactions.id, id))
      .returning();
    return tx;
  }

  async getCasinoTransactionsByUserId(userId: number): Promise<CasinoTransaction[]> {
    return await db.select().from(casinoTransactions)
      .where(eq(casinoTransactions.userId, userId))
      .orderBy(desc(casinoTransactions.createdAt));
  }

  async getPendingCasinoTransactions(): Promise<CasinoTransaction[]> {
    const pendingStatuses = ["refund_pending", "redeposit_pending", "payout_pending"];
    return await db.select().from(casinoTransactions)
      .where(
        and(
          inArray(casinoTransactions.status, pendingStatuses),
          or(
            isNull(casinoTransactions.nextRetryAt),
            lt(casinoTransactions.nextRetryAt, new Date())
          )
        )
      )
      .orderBy(casinoTransactions.createdAt);
  }

  async getManualRequiredCasinoTransactions(): Promise<CasinoTransaction[]> {
    return await db.select().from(casinoTransactions)
      .where(eq(casinoTransactions.status, "manual_required"))
      .orderBy(casinoTransactions.createdAt);
  }
}

export const storage = new DatabaseStorage();
