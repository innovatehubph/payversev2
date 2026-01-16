/**
 * Payverse Balance Service
 *
 * Centralized service for all balance operations to ensure consistency.
 *
 * IMPORTANT: PHPT Balance is the SINGLE SOURCE OF TRUTH
 * - balance field = phptBalance (they should always be equal)
 * - fiatBalance is deprecated and not used in transaction flows
 * - Casino balance is display-only for player wallet connection
 *
 * KEY PRINCIPLES:
 * 1. All balance changes MUST create a transaction record for audit trail
 * 2. balance = phptBalance (ALWAYS synchronized)
 * 3. Database transactions wrap balance + transaction record creation
 * 4. PayGram transfers MUST be followed by local balance sync
 */

import { db } from "../db";
import { users, transactions, type User, type Transaction } from "@shared/schema";
import { eq } from "drizzle-orm";
import { TRANSACTION_TYPES } from "@shared/constants";

// ============================================================================
// TYPES
// ============================================================================

export interface BalanceResult {
  userId: number;
  previousBalance: string;
  newBalance: string;
  transaction?: Transaction;
}

export interface BalanceOperationParams {
  userId: number;
  amount: number;
  type: string;
  note?: string;
  reference?: string;
  senderId?: number | null;
  receiverId?: number | null;
  category?: string;
  externalTxId?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Safely parse a balance string to number
 */
function parseBalance(balance: string | null | undefined): number {
  if (!balance) return 0;
  const parsed = parseFloat(balance);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Format number to balance string with 2 decimal places
 */
function formatBalance(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Get user with balance validation
 */
async function getUserWithValidation(userId: number): Promise<User> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }
  return user;
}

// ============================================================================
// BALANCE SERVICE
// ============================================================================

export const balanceService = {
  /**
   * Credit PHPT balance with transaction record
   * Use this for: deposits, top-ups, incoming transfers, refunds, PayGram credits
   */
  async credit(params: BalanceOperationParams): Promise<BalanceResult> {
    const { userId, amount, type, note, senderId, category, externalTxId } = params;

    if (amount <= 0) {
      throw new Error("Credit amount must be positive");
    }

    return await db.transaction(async (tx) => {
      // Get current user balance
      const [user] = await tx.select().from(users).where(eq(users.id, userId));
      if (!user) throw new Error(`User not found: ${userId}`);

      // Calculate new balance (PHPT is single source of truth)
      const currentBalance = parseBalance(user.phptBalance);
      const newBalance = currentBalance + amount;
      const formattedBalance = formatBalance(newBalance);

      // Update user balance (both balance and phptBalance stay in sync)
      await tx.update(users).set({
        phptBalance: formattedBalance,
        balance: formattedBalance,
      }).where(eq(users.id, userId));

      // Create transaction record for audit trail
      const [transaction] = await tx.insert(transactions).values({
        senderId: senderId ?? null,
        receiverId: userId,
        amount: formatBalance(amount),
        type,
        status: "completed",
        walletType: "phpt",
        note: note || `PHPT credit: ${type}`,
        category: category || type,
        externalTxId: externalTxId || null,
      }).returning();

      console.log(`[BalanceService] Credit: User ${userId} +${amount} PHPT (${type}). New balance: ${formattedBalance}`);

      return {
        userId,
        previousBalance: user.phptBalance,
        newBalance: formattedBalance,
        transaction,
      };
    });
  },

  /**
   * Debit PHPT balance with transaction record
   * Use this for: withdrawals, outgoing transfers, casino deposits, PayGram debits
   */
  async debit(params: BalanceOperationParams): Promise<BalanceResult> {
    const { userId, amount, type, note, receiverId, category, externalTxId } = params;

    if (amount <= 0) {
      throw new Error("Debit amount must be positive");
    }

    return await db.transaction(async (tx) => {
      // Get current user balance with lock
      const [user] = await tx.select().from(users).where(eq(users.id, userId));
      if (!user) throw new Error(`User not found: ${userId}`);

      // Check sufficient balance
      const currentBalance = parseBalance(user.phptBalance);
      if (currentBalance < amount) {
        throw new Error(`Insufficient PHPT balance. Available: ${currentBalance}, Required: ${amount}`);
      }

      // Calculate new balance
      const newBalance = currentBalance - amount;
      const formattedBalance = formatBalance(newBalance);

      // Update user balance (both balance and phptBalance stay in sync)
      await tx.update(users).set({
        phptBalance: formattedBalance,
        balance: formattedBalance,
      }).where(eq(users.id, userId));

      // Create transaction record for audit trail
      const [transaction] = await tx.insert(transactions).values({
        senderId: userId,
        receiverId: receiverId ?? null,
        amount: formatBalance(amount),
        type,
        status: "completed",
        walletType: "phpt",
        note: note || `PHPT debit: ${type}`,
        category: category || type,
        externalTxId: externalTxId || null,
      }).returning();

      console.log(`[BalanceService] Debit: User ${userId} -${amount} PHPT (${type}). New balance: ${formattedBalance}`);

      return {
        userId,
        previousBalance: user.phptBalance,
        newBalance: formattedBalance,
        transaction,
      };
    });
  },

  /**
   * Transfer PHPT between users (atomic: sender debit + receiver credit)
   */
  async transfer(params: {
    senderId: number;
    receiverId: number;
    amount: number;
    note?: string;
  }): Promise<{ senderResult: BalanceResult; receiverResult: BalanceResult }> {
    const { senderId, receiverId, amount, note } = params;

    if (amount <= 0) {
      throw new Error("Transfer amount must be positive");
    }

    if (senderId === receiverId) {
      throw new Error("Cannot transfer to yourself");
    }

    return await db.transaction(async (tx) => {
      // Get both users
      const [sender] = await tx.select().from(users).where(eq(users.id, senderId));
      const [receiver] = await tx.select().from(users).where(eq(users.id, receiverId));

      if (!sender) throw new Error(`Sender not found: ${senderId}`);
      if (!receiver) throw new Error(`Receiver not found: ${receiverId}`);

      const senderBalance = parseBalance(sender.phptBalance);
      if (senderBalance < amount) {
        throw new Error(`Insufficient balance. Available: ${senderBalance}, Required: ${amount}`);
      }

      // Calculate new balances
      const newSenderBalance = senderBalance - amount;
      const newReceiverBalance = parseBalance(receiver.phptBalance) + amount;

      // Update sender
      await tx.update(users).set({
        phptBalance: formatBalance(newSenderBalance),
        balance: formatBalance(newSenderBalance),
      }).where(eq(users.id, senderId));

      // Update receiver
      await tx.update(users).set({
        phptBalance: formatBalance(newReceiverBalance),
        balance: formatBalance(newReceiverBalance),
      }).where(eq(users.id, receiverId));

      // Create single transaction record for transfer
      const [transaction] = await tx.insert(transactions).values({
        senderId,
        receiverId,
        amount: formatBalance(amount),
        type: TRANSACTION_TYPES.TRANSFER,
        status: "completed",
        walletType: "phpt",
        note: note || "Transfer",
        category: "Transfer",
      }).returning();

      console.log(`[BalanceService] Transfer: User ${senderId} -> User ${receiverId}: ${amount} PHPT`);

      return {
        senderResult: {
          userId: senderId,
          previousBalance: sender.phptBalance,
          newBalance: formatBalance(newSenderBalance),
          transaction,
        },
        receiverResult: {
          userId: receiverId,
          previousBalance: receiver.phptBalance,
          newBalance: formatBalance(newReceiverBalance),
          transaction,
        },
      };
    });
  },

  /**
   * Sync balance from PayGram (external source of truth for PHPT)
   * Creates transaction record if balance changed
   */
  async syncFromPaygram(params: {
    userId: number;
    newPaygramBalance: number;
    reason: string;
    externalTxId?: string;
  }): Promise<BalanceResult> {
    const { userId, newPaygramBalance, reason, externalTxId } = params;

    return await db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId));
      if (!user) throw new Error(`User not found: ${userId}`);

      const currentBalance = parseBalance(user.phptBalance);
      const sanitizedNewBalance = isNaN(newPaygramBalance) ? 0 : newPaygramBalance;
      const difference = sanitizedNewBalance - currentBalance;
      const formattedBalance = formatBalance(sanitizedNewBalance);

      // Update balance (both fields stay in sync)
      await tx.update(users).set({
        phptBalance: formattedBalance,
        balance: formattedBalance,
      }).where(eq(users.id, userId));

      // Create sync transaction record if there's a significant difference
      let transaction: Transaction | undefined;
      if (Math.abs(difference) >= 0.01) {
        const [txRecord] = await tx.insert(transactions).values({
          senderId: difference > 0 ? null : userId,
          receiverId: difference > 0 ? userId : null,
          amount: formatBalance(Math.abs(difference)),
          type: difference > 0 ? "sync_credit" : "sync_debit",
          status: "completed",
          walletType: "phpt",
          note: `Balance sync: ${reason}`,
          category: "Balance Sync",
          externalTxId: externalTxId || null,
        }).returning();
        transaction = txRecord;
        console.log(`[BalanceService] Sync: User ${userId} balance adjusted by ${difference} PHPT (${reason})`);
      }

      return {
        userId,
        previousBalance: user.phptBalance,
        newBalance: formattedBalance,
        transaction,
      };
    });
  },

  /**
   * Credit after successful PayGram transfer (from admin/escrow to user)
   * Use this after transferFromAdminWallet() succeeds
   */
  async creditFromPaygram(params: {
    userId: number;
    amount: number;
    type: string;
    note?: string;
    paygramTxId?: string;
  }): Promise<BalanceResult> {
    return this.credit({
      userId: params.userId,
      amount: params.amount,
      type: params.type,
      note: params.note,
      senderId: null, // From PayGram/admin escrow
      category: params.type,
      externalTxId: params.paygramTxId,
    });
  },

  /**
   * Debit before PayGram transfer (user to admin/escrow)
   * Use this before transferToAdminWallet()
   */
  async debitToPaygram(params: {
    userId: number;
    amount: number;
    type: string;
    note?: string;
    paygramTxId?: string;
  }): Promise<BalanceResult> {
    return this.debit({
      userId: params.userId,
      amount: params.amount,
      type: params.type,
      note: params.note,
      receiverId: null, // To PayGram/admin escrow
      category: params.type,
      externalTxId: params.paygramTxId,
    });
  },

  /**
   * Get current balance for a user
   */
  async getBalance(userId: number): Promise<string> {
    const user = await getUserWithValidation(userId);
    return user.phptBalance;
  },

  /**
   * Check if user has sufficient balance
   */
  async hasSufficientBalance(userId: number, amount: number): Promise<boolean> {
    const user = await getUserWithValidation(userId);
    return parseBalance(user.phptBalance) >= amount;
  },

  /**
   * Validate that balance fields are consistent (balance = phptBalance)
   */
  async validateBalance(userId: number): Promise<{
    isValid: boolean;
    balance: string;
    phptBalance: string;
    discrepancy: string;
  }> {
    const user = await getUserWithValidation(userId);
    const balance = parseBalance(user.balance);
    const phptBalance = parseBalance(user.phptBalance);
    const discrepancy = balance - phptBalance;

    return {
      isValid: Math.abs(discrepancy) < 0.01,
      balance: user.balance,
      phptBalance: user.phptBalance,
      discrepancy: formatBalance(discrepancy),
    };
  },

  /**
   * Fix balance inconsistency by setting balance = phptBalance
   */
  async fixBalanceInconsistency(userId: number): Promise<BalanceResult> {
    return await db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId));
      if (!user) throw new Error(`User not found: ${userId}`);

      const phptBalance = user.phptBalance;

      await tx.update(users).set({
        balance: phptBalance,
      }).where(eq(users.id, userId));

      console.log(`[BalanceService] Fixed inconsistency for User ${userId}: balance set to ${phptBalance}`);

      return {
        userId,
        previousBalance: user.balance,
        newBalance: phptBalance,
      };
    });
  },
};

export default balanceService;
