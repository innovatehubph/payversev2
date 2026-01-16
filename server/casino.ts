import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { CASINO_AGENTS, type CasinoAgent } from "@shared/schema";
import { transferToAdminWallet, transferFromAdminWallet, getUserPhptBalance } from "./paygram";
import { getSystemSetting, clearSettingsCache } from "./settings";

const router = Router();

// Cache admin user ID for transaction logging
let adminUserId: number | null = null;

async function getAdminUserId(): Promise<number | null> {
  if (adminUserId !== null) return adminUserId;

  const adminEmail = process.env.SUPER_ADMIN_EMAIL || "admin@payverse.ph";
  const adminUser = await storage.getUserByEmail(adminEmail);
  if (adminUser) {
    adminUserId = adminUser.id;
    console.log(`[Casino] Admin user ID cached: ${adminUserId}`);
  }
  return adminUserId;
}

const CASINO_API_BASE = "https://bridge.747lc.com";

// Token cache to avoid repeated DB queries during a request cycle
let tokenCache: Record<string, { value: string | undefined; timestamp: number }> = {};
const TOKEN_CACHE_TTL = 30000; // 30 seconds cache for tokens

// Get agent token from database (with cache)
async function getAgentToken(agent: CasinoAgent): Promise<string | undefined> {
  const key = `CASINO_747_TOKEN_${agent.toUpperCase()}`;

  // Check cache
  const cached = tokenCache[key];
  if (cached && Date.now() - cached.timestamp < TOKEN_CACHE_TTL) {
    return cached.value;
  }

  // Get from database (falls back to env var)
  const token = await getSystemSetting(key, "");
  tokenCache[key] = { value: token || undefined, timestamp: Date.now() };

  return token || undefined;
}

// Check if any tokens are configured (checks database dynamically)
async function checkDemoMode(): Promise<boolean> {
  for (const agent of CASINO_AGENTS) {
    const token = await getAgentToken(agent);
    if (token) {
      return false; // Has at least one token, not demo mode
    }
  }
  return true; // No tokens configured, demo mode
}

// Clear token cache (call when settings are updated)
export function clearTokenCache(): void {
  tokenCache = {};
}

interface CasinoApiResponse {
  success: boolean;
  message?: string;
  data?: any;
}

// API uses status enum: 0=Success, 1=?, 2=AuthError, 3=?, 4=?
const API_STATUS_SUCCESS = 0;
const API_STATUS_AUTH_ERROR = 2;

// GET request with query params and authToken in header
async function callCasinoApiGet(
  endpoint: string,
  authToken: string,
  queryParams?: Record<string, any>,
  timeoutMs: number = 30000
): Promise<CasinoApiResponse> {
  if (!authToken) {
    console.error("[Casino API] No authToken provided for endpoint:", endpoint);
    return { success: false, message: "API token not configured" };
  }

  try {
    // Build query string
    const searchParams = new URLSearchParams();
    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        searchParams.append(key, String(value));
      });
    }
    
    const url = `${CASINO_API_BASE}${endpoint}?${searchParams.toString()}`;
    console.log(`[Casino API] GET ${endpoint} with params:`, queryParams);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "accept": "text/plain",
        "authToken": authToken
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    const data = await response.json();
    console.log(`[Casino API] Response for ${endpoint}:`, { httpStatus: response.status, body: data });

    if (!response.ok) {
      return { success: false, data, message: data.message || `HTTP ${response.status}` };
    }

    if (data.status !== undefined && data.status !== API_STATUS_SUCCESS) {
      const statusMessage = data.status === API_STATUS_AUTH_ERROR ? "Authentication failed" : data.message;
      return { success: false, data, message: statusMessage || `API status: ${data.status}` };
    }

    return { success: true, data, message: data.message };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error("[Casino API] Request timed out:", endpoint);
      return { success: false, message: "Casino API request timed out" };
    }
    console.error("[Casino API] Error:", error);
    return { success: false, message: error.message || "Casino API error" };
  }
}

// POST request with authToken in body
async function callCasinoApiPost(
  endpoint: string, 
  authToken: string,
  bodyParams?: Record<string, any>,
  timeoutMs: number = 30000
): Promise<CasinoApiResponse> {
  if (!authToken) {
    console.error("[Casino API] No authToken provided for endpoint:", endpoint);
    return { success: false, message: "API token not configured" };
  }
  
  try {
    const requestBody = {
      authToken: authToken,
      platform: 1,
      ...bodyParams
    };
    
    console.log(`[Casino API] POST ${endpoint} with body:`, { ...requestBody, authToken: "[HIDDEN]" });
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(`${CASINO_API_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "accept": "text/plain",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    const data = await response.json();
    console.log(`[Casino API] Response for ${endpoint}:`, { httpStatus: response.status, body: data });
    
    if (!response.ok) {
      return { success: false, data, message: data.message || `HTTP ${response.status}` };
    }
    
    if (data.status !== undefined && data.status !== API_STATUS_SUCCESS) {
      const statusMessage = data.status === API_STATUS_AUTH_ERROR ? "Authentication failed" : data.message;
      return { success: false, data, message: statusMessage || `API status: ${data.status}` };
    }
    
    return { success: true, data, message: data.message };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error("[Casino API] Request timed out:", endpoint);
      return { success: false, message: "Casino API request timed out" };
    }
    console.error("[Casino API] Error:", error);
    return { success: false, message: error.message || "Casino API error" };
  }
}

// Unified casino Transfer helper - consolidates all chip transfer operations
interface CasinoTransferParams {
  agent: CasinoAgent;
  username: string;
  amount: number; // Positive for deposit/credit, negative for withdraw
  isAgent: boolean;
  nonce: string;
  comment?: string;
}

async function executeCasinoTransfer(params: CasinoTransferParams): Promise<CasinoApiResponse> {
  const { agent, username, amount, isAgent, nonce, comment } = params;

  const token = await getAgentToken(agent);
  if (!token) {
    console.error(`[Casino Transfer] No token configured for agent: ${agent}`);
    return { success: false, message: `Token not configured for agent ${agent}` };
  }

  console.log(`[Casino Transfer] ${amount >= 0 ? 'Credit' : 'Debit'} ${Math.abs(amount)} chips to ${username} via ${agent} (isAgent: ${isAgent})`);

  const result = await callCasinoApiPost("/Default/Transfer", token, {
    username,
    amount,
    toAgent: isAgent,
    currency: "php",
    nonce,
    ...(comment && { comment })
  });

  if (!result.success) {
    console.error(`[Casino Transfer] Failed: ${result.message}`);
  } else {
    console.log(`[Casino Transfer] Success: ${Math.abs(amount)} chips ${amount >= 0 ? 'credited to' : 'withdrawn from'} ${username}`);
  }

  return result;
}

interface UserAgentResult {
  agent: CasinoAgent | null;
  hierarchy: any[];
  clientId: string | null;
  username: string | null; // The canonical username from API
  agentClientId: string | null; // The agent's clientId from hierarchy[2]
  agentUsername: string | null; // The agent's username from hierarchy[2]
  isAgent: boolean; // Whether the user is an agent or player
}

// Find which agent the user belongs to by checking hierarchy - tries both player and agent types
async function findUserAgent(casinoUsername: string, preferredIsAgent?: boolean): Promise<UserAgentResult> {
  console.log(`[Casino] Searching for user ${casinoUsername} across all ${CASINO_AGENTS.length} agent accounts...`);
  
  // Try both isAgent values - if preferred is specified, try that first
  const isAgentValues = preferredIsAgent !== undefined 
    ? [preferredIsAgent, !preferredIsAgent] 
    : [false, true]; // Default: try player first, then agent
  
  for (const isAgent of isAgentValues) {
    console.log(`[Casino] Trying isAgent=${isAgent} for ${casinoUsername}...`);
    
    // Create parallel API calls for all agents with current isAgent value
    const apiCalls = CASINO_AGENTS.map(async (agentName) => {
      const token = await getAgentToken(agentName);
      if (!token) return { agentName, result: null };
      
      try {
        const result = await callCasinoApiGet("/Default/GetHierarchy", token, {
          username: casinoUsername,
          isAgent: isAgent
        });
        return { agentName, result, isAgent };
      } catch (error) {
        console.error(`[Casino] Error checking hierarchy with ${agentName}:`, error);
        return { agentName, result: null, isAgent };
      }
    });
    
    // Execute all calls in parallel
    const results = await Promise.all(apiCalls);
    
    // Process results to find matching agent
    for (const { agentName, result, isAgent: foundAsAgent } of results) {
      if (!result?.success || !result.data) continue;
      
      const hierarchy = Array.isArray(result.data) ? result.data : result.data.hierarchy || [];
      const userInfo = result.data.user;
      const clientId = userInfo?.clientId?.toString() || null;
      const canonicalUsername = userInfo?.username || casinoUsername;
      
      if (hierarchy.length >= 3) {
        const thirdLevel = hierarchy[2];
        const thirdLevelUsername = (thirdLevel?.username || thirdLevel?.Username || thirdLevel?.name || "").toLowerCase();
        const agentClientIdFromHierarchy = thirdLevel?.clientId?.toString() || null;
        const agentUsernameFromHierarchy = thirdLevel?.username || thirdLevel?.Username || thirdLevel?.name || null;
        
        // Check if this username matches any of our agents
        const matchedAgent = CASINO_AGENTS.find(a => thirdLevelUsername === a.toLowerCase());
        
        if (matchedAgent) {
          console.log(`[Casino] Found user ${casinoUsername} (clientId: ${clientId}, isAgent: ${foundAsAgent}) under agent ${matchedAgent} via token ${agentName}`);
          return { 
            agent: matchedAgent, 
            hierarchy, 
            clientId, 
            username: canonicalUsername,
            agentClientId: agentClientIdFromHierarchy,
            agentUsername: agentUsernameFromHierarchy,
            isAgent: foundAsAgent
          };
        }
      }
      
      console.log(`[Casino] User ${casinoUsername} found via ${agentName} (isAgent: ${foundAsAgent}) but not under configured agents. Hierarchy:`, hierarchy);
    }
  }
  
  return { agent: null, hierarchy: [], clientId: null, username: null, agentClientId: null, agentUsername: null, isAgent: false };
}

// Connect casino account - verify user and detect their agent
router.post("/connect", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { username, isAgent = false } = req.body;
    
    if (!username?.trim()) {
      return res.status(400).json({ success: false, message: "Casino username required" });
    }

    const casinoUsername = username.trim().toLowerCase();

    // Check if already linked
    const existingLink = await storage.getCasinoLink(user.id);
    if (existingLink && existingLink.status === "verified") {
      return res.json({
        success: true,
        message: "Already connected",
        casinoUsername: existingLink.casinoUsername,
        assignedAgent: existingLink.assignedAgent,
        isAgent: existingLink.isAgent
      });
    }

    const isDemoMode = await checkDemoMode();
    if (isDemoMode) {
      // Demo mode - create a mock link (delete existing first)
      if (existingLink) {
        await storage.deleteCasinoLink(user.id);
      }

      const link = await storage.createCasinoLink({
        userId: user.id,
        casinoUsername: casinoUsername,
        isAgent: isAgent,
        assignedAgent: "bossmarc747", // Default demo agent
        hierarchySnapshot: JSON.stringify([{ demo: true, note: "Demo mode - no verification performed" }]),
        status: "demo" // Mark as demo status, not verified
      });

      return res.json({
        success: true,
        message: "Demo mode - connection simulated (no real verification)",
        casinoUsername: link.casinoUsername,
        assignedAgent: link.assignedAgent,
        isAgent: link.isAgent,
        demoMode: true
      });
    }

    // Find the user's agent via hierarchy check - tries both player and agent types
    const { agent, hierarchy, clientId, username: canonicalUsername, agentClientId, agentUsername, isAgent: detectedIsAgent } = await findUserAgent(casinoUsername, isAgent);

    if (!agent) {
      return res.status(403).json({
        success: false,
        message: "Your casino account is not under any of our configured agents. Please contact support."
      });
    }

    // Delete existing link if any and create new one
    if (existingLink) {
      await storage.deleteCasinoLink(user.id);
    }

    // Use the detected isAgent value from API, not user-provided
    const link = await storage.createCasinoLink({
      userId: user.id,
      casinoUsername: canonicalUsername || casinoUsername, // Use canonical username from API
      casinoClientId: clientId, // Store clientId from hierarchy response
      agentUsername: agentUsername, // Store agent's username for withdrawals
      agentClientId: agentClientId, // Store agent's clientId for withdrawals
      isAgent: detectedIsAgent, // Use detected value from GetHierarchy API
      assignedAgent: agent,
      hierarchySnapshot: JSON.stringify(hierarchy),
      status: "verified"
    });

    console.log(`[Casino] Created link for user ${user.id}: username=${link.casinoUsername}, clientId=${clientId}, agent=${agent}, agentClientId=${agentClientId}`);

    return res.json({
      success: true,
      message: "Casino account connected successfully",
      casinoUsername: link.casinoUsername,
      casinoClientId: clientId,
      assignedAgent: link.assignedAgent,
      isAgent: link.isAgent
    });
  } catch (error: any) {
    console.error("[Casino] Connect error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get casino balance and link status
router.get("/balance", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const isDemoMode = await checkDemoMode();
    const link = await storage.getCasinoLink(user.id);

    // Not connected
    if (!link) {
      return res.json({
        success: true,
        connected: false,
        balance: null,
        demoMode: isDemoMode,
        message: "Connect your casino account first"
      });
    }

    // Check for demo status (allow demo transactions but flag them)
    const isDemo = link.status === "demo" || isDemoMode;

    if (!["verified", "demo"].includes(link.status)) {
      return res.json({
        success: true,
        connected: false,
        balance: null,
        demoMode: isDemoMode,
        message: "Casino link not verified"
      });
    }

    if (isDemo) {
      return res.json({
        success: true,
        connected: true,
        demoMode: true,
        balance: 1000,
        username: link.casinoUsername,
        assignedAgent: link.assignedAgent,
        isAgent: link.isAgent,
        message: "Demo mode - balance simulated"
      });
    }

    // Get balance using the assigned agent's token
    const token = await getAgentToken(link.assignedAgent as CasinoAgent);
    if (!token) {
      return res.status(500).json({ success: false, message: "Agent token not configured" });
    }

    console.log(`[Casino Balance] Requesting balance for ${link.casinoUsername} (clientId: ${link.casinoClientId}, isAgent: ${link.isAgent}, typeof isAgent: ${typeof link.isAgent})`);
    
    // AGENT ACCOUNTS: Don't show balance (statistics endpoint doesn't work for agents)
    if (link.isAgent) {
      console.log(`[Casino Balance] Agent account ${link.casinoUsername} - balance not available via API`);
      return res.json({
        success: true,
        connected: true,
        username: link.casinoUsername,
        assignedAgent: link.assignedAgent,
        isAgent: true,
        balance: null, // No balance available for agents
        balanceNotAvailable: true,
        message: "Agent balance must be checked on 747Live dashboard",
        demoMode: false
      });
    }
    
    // PLAYER ACCOUNTS: Use statistics endpoint which returns currentBalance
    console.log(`[Casino Balance] Player account - using statistics endpoint for ${link.casinoUsername}`);
    const statsResult = await callCasinoApiPost("/statistics/transactions-by-client-username", token, {
      username: link.casinoUsername,
      currency: "php"
    });
    
    console.log(`[Casino Balance DEBUG] Statistics response for ${link.casinoUsername}:`, JSON.stringify(statsResult, null, 2));
    
    if (statsResult.success && statsResult.data && statsResult.data.currentBalance !== undefined) {
      const data = statsResult.data;
      const currentBalance = parseFloat(data.currentBalance) || 0;
      
      // Extract 7-day stats if available
      const stats7Days = data.statisticsForThePast7Days || {};
      const recentStats = data.statisticsForMostRecentDeposit || {};
      
      return res.json({
        success: true,
        connected: true,
        username: link.casinoUsername,
        assignedAgent: link.assignedAgent,
        isAgent: false,
        balance: currentBalance,
        withdrawableBalance: currentBalance,
        canWithdraw: stats7Days.canWithdraw ?? true,
        allBalances: [
          { type: "main", currency: "PHP", amount: currentBalance }
        ],
        // Include stats from the statistics endpoint
        stats: {
          // 7-day statistics
          totalDeposit7Days: parseFloat(stats7Days.totalDeposit) || 0,
          totalBet7Days: parseFloat(stats7Days.totalBet) || 0,
          totalWithdraw7Days: parseFloat(stats7Days.totalWithdraw) || 0,
          wageringFactor: parseFloat(stats7Days.wageringFactor) || 0,
          amountToBet: parseFloat(stats7Days.amountToBet) || 0,
          // Most recent deposit stats
          recentDeposit: parseFloat(recentStats.totalDeposit) || 0,
          recentBet: parseFloat(recentStats.totalBet) || 0,
          recentWithdraw: parseFloat(recentStats.totalWithdraw) || 0,
          recentCanWithdraw: recentStats.canWithdraw ?? true,
          recentAmountToBet: parseFloat(recentStats.amountToBet) || 0
        },
        demoMode: false,
        source: "statistics"
      });
    }
    
    // FALLBACK: Return connected but no balance - use link.isAgent not hardcoded
    console.log(`[Casino Balance] Statistics failed for ${link.casinoUsername} (isAgent: ${link.isAgent})`);
    return res.json({
      success: true,
      connected: true,
      username: link.casinoUsername,
      assignedAgent: link.assignedAgent,
      isAgent: link.isAgent, // Use actual value from DB, not hardcoded
      balance: null,
      balanceNotAvailable: true,
      message: statsResult.message || "Could not fetch balance",
      demoMode: false
    });
  } catch (error: any) {
    console.error("[Casino] Balance error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Deposit PHPT to casino (Buy 747 chips)
// Flow: 1. Create transaction record → 2. Transfer PHPT to escrow → 3. Credit casino chips
// Fallback: If casino credit fails → refund PHPT. If refund fails → mark for manual resolution.
router.post("/deposit", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { amount, pin } = req.body;
    const depositAmount = Math.floor(parseFloat(amount?.toString() || "0"));

    // Get full user record for PIN verification
    const fullUser = await storage.getUser(user.id);
    if (!fullUser) {
      return res.status(401).json({ success: false, message: "User not found" });
    }

    // PIN verification required for casino transactions
    if (!fullUser.pinHash) {
      return res.status(400).json({
        success: false,
        message: "PIN required. Please set up your PIN in Security settings first.",
        requiresPin: true,
        needsPinSetup: true
      });
    }

    if (!pin) {
      return res.status(400).json({
        success: false,
        message: "PIN required for casino transactions",
        requiresPin: true
      });
    }

    // Check PIN lockout
    if (fullUser.pinLockedUntil && new Date(fullUser.pinLockedUntil) > new Date()) {
      const remainingMinutes = Math.ceil((new Date(fullUser.pinLockedUntil).getTime() - Date.now()) / 60000);
      return res.status(423).json({
        success: false,
        message: `PIN locked due to too many failed attempts. Try again in ${remainingMinutes} minutes.`,
        lockedUntil: fullUser.pinLockedUntil
      });
    }

    // Verify PIN
    const isValidPin = await bcrypt.compare(pin, fullUser.pinHash);
    if (!isValidPin) {
      const newAttempts = (fullUser.pinFailedAttempts || 0) + 1;
      const maxAttempts = 5;

      if (newAttempts >= maxAttempts) {
        const lockUntil = new Date(Date.now() + 30 * 60 * 1000);
        await storage.updateUserPinAttempts(fullUser.id, newAttempts, lockUntil);
        return res.status(423).json({
          success: false,
          message: "Too many failed PIN attempts. PIN locked for 30 minutes.",
          lockedUntil: lockUntil
        });
      }

      await storage.updateUserPinAttempts(fullUser.id, newAttempts, null);
      return res.status(401).json({
        success: false,
        message: `Invalid PIN. ${maxAttempts - newAttempts} attempts remaining.`,
        attemptsRemaining: maxAttempts - newAttempts
      });
    }

    // Reset failed attempts on success
    await storage.updateUserPinAttempts(fullUser.id, 0, null);
    
    if (!depositAmount || depositAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    if (depositAmount < 1) {
      return res.status(400).json({ success: false, message: "Minimum deposit is ₱1" });
    }

    if (depositAmount > 50000) {
      return res.status(400).json({ success: false, message: "Maximum deposit is ₱50,000" });
    }

    // Check casino link - must be verified or demo
    const link = await storage.getCasinoLink(user.id);
    if (!link || !["verified", "demo"].includes(link.status)) {
      return res.status(400).json({ success: false, message: "Connect and verify your casino account first" });
    }

    const isDemoMode = await checkDemoMode();
    const isDemo = link.status === "demo" || isDemoMode;

    // Get admin user ID for transaction logging
    const adminId = await getAdminUserId();

    if (isDemo) {
      // Demo mode: simulate deposit without moving real funds
      await storage.createTransaction({
        senderId: user.id,
        receiverId: adminId,
        amount: depositAmount.toString(),
        type: "casino_deposit",
        status: "completed",
        walletType: "phpt",
        note: `Casino deposit to ${link.casinoUsername} (747Live) [DEMO - no real funds moved]`,
      });

      return res.json({
        success: true,
        message: "Demo deposit successful (no real funds moved)",
        demoMode: true
      });
    }

    // Get user's PayGram ID from paygram_connections, fallback to username/email
    const paygramConnection = await storage.getPaygramConnection(user.id);
    const userCliId = paygramConnection?.paygramUserId || user.username || user.email;
    if (!userCliId) {
      return res.status(400).json({ success: false, message: "User wallet identifier not found" });
    }

    // Pre-check: Verify user has sufficient PHPT balance BEFORE attempting transfer
    // This gives a clear error message instead of a generic "insufficient balance" from PayGram
    const userBalance = await getUserPhptBalance(userCliId);
    console.log(`[Casino Deposit] User ${userCliId} balance check: ${userBalance.balance} PHPT (needed: ${depositAmount})`);

    if (!userBalance.success) {
      console.error(`[Casino Deposit] Failed to check user balance: ${userBalance.message}`);
      return res.status(400).json({
        success: false,
        message: "Could not verify your wallet balance. Please try again."
      });
    }

    if (userBalance.balance < depositAmount) {
      console.log(`[Casino Deposit] Insufficient balance: ${userBalance.balance} < ${depositAmount}`);
      return res.status(400).json({
        success: false,
        message: `Insufficient PHPT balance. You have ₱${userBalance.balance.toLocaleString()} but need ₱${depositAmount.toLocaleString()}.`
      });
    }

    // Generate unique transaction ID with random suffix to prevent collisions
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const transactionId = `DEP${user.id}_${Date.now()}_${randomSuffix}`;
    
    // Create casino transaction record for state tracking
    let casinoTx = await storage.createCasinoTransaction({
      userId: user.id,
      type: "buy",
      amount: depositAmount.toString(),
      status: "initiated",
      transactionId: transactionId,
      casinoNonce: transactionId,
    });
    console.log(`[Casino Deposit] Transaction ${transactionId} created with ID ${casinoTx.id}`);

    // Step 1: Transfer PHPT from user to admin escrow wallet
    console.log(`[Casino Deposit] Step 1: Transferring ${depositAmount} PHPT from ${userCliId} to admin escrow`);
    const phptTransfer = await transferToAdminWallet(userCliId, depositAmount);
    
    if (!phptTransfer.success) {
      console.error(`[Casino Deposit] PHPT transfer failed for ${userCliId}:`, phptTransfer.message);
      await storage.updateCasinoTransaction(casinoTx.id, {
        status: "failed",
        failureReason: phptTransfer.message || "PHPT transfer to escrow failed",
        failureStep: "escrow_transfer",
      });
      return res.status(400).json({ 
        success: false, 
        message: phptTransfer.message || "Insufficient PHPT balance" 
      });
    }
    
    // Update: PHPT transferred to escrow
    await storage.updateCasinoTransaction(casinoTx.id, {
      status: "escrow_debited",
      escrowTxId: phptTransfer.transactionId,
    });
    console.log(`[Casino Deposit] PHPT transfer successful: ${phptTransfer.transactionId}`);

    // Step 2: Call casino API to credit chips to user
    const result = await executeCasinoTransfer({
      agent: link.assignedAgent as CasinoAgent,
      username: link.casinoUsername,
      amount: depositAmount,
      isAgent: link.isAgent,
      nonce: transactionId,
      comment: `deposited ${depositAmount}php using payverse account with transaction number ${transactionId}`
    });

    if (!result.success) {
      // Casino credit failed - attempt automatic refund
      console.error(`[Casino Deposit] Casino credit failed. Attempting PHPT refund. TxId: ${transactionId}`);
      await storage.updateCasinoTransaction(casinoTx.id, {
        status: "refund_pending",
        failureReason: result.message || "Casino chip credit failed",
        failureStep: "casino_credit",
        rollbackAttempts: 1,
        lastRollbackAt: new Date(),
      });
      
      const refundResult = await transferFromAdminWallet(userCliId, depositAmount);
      
      if (refundResult.success) {
        console.log(`[Casino Deposit] Automatic refund successful: ${refundResult.transactionId}`);
        await storage.updateCasinoTransaction(casinoTx.id, {
          status: "failed", // Gracefully failed with successful refund
          rollbackTxId: refundResult.transactionId,
        });
        await storage.createTransaction({
          senderId: user.id,
          receiverId: adminId,
          amount: depositAmount.toString(),
          type: "casino_deposit",
          status: "failed",
          walletType: "phpt",
          note: `REFUNDED: Casino chip credit failed. PHPT refunded. TxId: ${transactionId}`,
        });
        return res.status(400).json({ 
          success: false, 
          message: "Casino chip credit failed. Your PHPT has been automatically refunded." 
        });
      } else {
        // Refund failed - needs manual resolution
        console.error(`[Casino Deposit] CRITICAL: Refund also failed. TxId: ${transactionId}`);
        await storage.updateCasinoTransaction(casinoTx.id, {
          status: "manual_required",
          failureReason: `Casino credit failed: ${result.message}. Refund also failed: ${refundResult.message}`,
          adminAlertSent: false, // Flag for admin notification system
        });
        await storage.createTransaction({
          senderId: user.id,
          receiverId: adminId,
          amount: depositAmount.toString(),
          type: "casino_deposit",
          status: "pending", // Mark as pending for manual resolution
          walletType: "phpt",
          note: `MANUAL REQUIRED: Casino credit failed, auto-refund failed. TxId: ${transactionId}`,
        });
        return res.status(400).json({ 
          success: false, 
          message: "Transaction requires manual processing. Support has been notified. Reference: " + transactionId 
        });
      }
    }

    // Success - update transaction and create history record
    await storage.updateCasinoTransaction(casinoTx.id, {
      status: "completed",
      casinoResponseId: result.data?.transactionId || null,
    });
    
    await storage.createTransaction({
      senderId: user.id,
      receiverId: adminId,
      amount: depositAmount.toString(),
      type: "casino_deposit",
      status: "completed",
      walletType: "phpt",
      note: `Casino deposit to ${link.casinoUsername} via ${link.assignedAgent} (747Live). TxId: ${transactionId}`,
    });

    console.log(`[Casino Deposit] Complete: ${depositAmount} chips credited to ${link.casinoUsername}`);
    return res.json({
      success: true,
      message: `Successfully deposited ${depositAmount} chips to your 747 account`,
      transactionId
    });
  } catch (error: any) {
    console.error("[Casino] Deposit error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Withdraw from casino to PHPT (Sell 747 chips)
// Flow: 1. Create transaction record → 2. Withdraw chips from casino → 3. Transfer PHPT to user
// Fallback: If PHPT payout fails → redeposit chips. If redeposit fails → mark for manual resolution.
router.post("/withdraw", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { amount, pin } = req.body;
    const withdrawAmount = Math.floor(parseFloat(amount?.toString() || "0"));

    // Get full user record for PIN verification
    const fullUser = await storage.getUser(user.id);
    if (!fullUser) {
      return res.status(401).json({ success: false, message: "User not found" });
    }

    // PIN verification required for casino transactions
    if (!fullUser.pinHash) {
      return res.status(400).json({
        success: false,
        message: "PIN required. Please set up your PIN in Security settings first.",
        requiresPin: true,
        needsPinSetup: true
      });
    }

    if (!pin) {
      return res.status(400).json({
        success: false,
        message: "PIN required for casino transactions",
        requiresPin: true
      });
    }

    // Check PIN lockout
    if (fullUser.pinLockedUntil && new Date(fullUser.pinLockedUntil) > new Date()) {
      const remainingMinutes = Math.ceil((new Date(fullUser.pinLockedUntil).getTime() - Date.now()) / 60000);
      return res.status(423).json({
        success: false,
        message: `PIN locked due to too many failed attempts. Try again in ${remainingMinutes} minutes.`,
        lockedUntil: fullUser.pinLockedUntil
      });
    }

    // Verify PIN
    const isValidPin = await bcrypt.compare(pin, fullUser.pinHash);
    if (!isValidPin) {
      const newAttempts = (fullUser.pinFailedAttempts || 0) + 1;
      const maxAttempts = 5;

      if (newAttempts >= maxAttempts) {
        const lockUntil = new Date(Date.now() + 30 * 60 * 1000);
        await storage.updateUserPinAttempts(fullUser.id, newAttempts, lockUntil);
        return res.status(423).json({
          success: false,
          message: "Too many failed PIN attempts. PIN locked for 30 minutes.",
          lockedUntil: lockUntil
        });
      }

      await storage.updateUserPinAttempts(fullUser.id, newAttempts, null);
      return res.status(401).json({
        success: false,
        message: `Invalid PIN. ${maxAttempts - newAttempts} attempts remaining.`,
        attemptsRemaining: maxAttempts - newAttempts
      });
    }

    // Reset failed attempts on success
    await storage.updateUserPinAttempts(fullUser.id, 0, null);
    
    if (!withdrawAmount || withdrawAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    if (withdrawAmount < 1) {
      return res.status(400).json({ success: false, message: "Minimum withdrawal is ₱1" });
    }

    if (withdrawAmount > 50000) {
      return res.status(400).json({ success: false, message: "Maximum withdrawal is ₱50,000" });
    }

    // Check casino link - must be verified or demo
    const link = await storage.getCasinoLink(user.id);
    if (!link || !["verified", "demo"].includes(link.status)) {
      return res.status(400).json({ success: false, message: "Connect and verify your casino account first" });
    }

    const isDemoMode = await checkDemoMode();
    const isDemo = link.status === "demo" || isDemoMode;

    // Get admin user ID for transaction logging
    const adminId = await getAdminUserId();

    if (isDemo) {
      // Demo mode: simulate withdrawal without moving real funds
      await storage.createTransaction({
        senderId: adminId,
        receiverId: user.id,
        amount: withdrawAmount.toString(),
        type: "casino_withdraw",
        status: "completed",
        walletType: "phpt",
        note: `Casino withdrawal from ${link.casinoUsername} (747Live) [DEMO]`,
      });

      return res.json({
        success: true,
        message: "Demo withdrawal successful (no real funds moved)",
        demoMode: true
      });
    }

    // Get user's PayGram ID from paygram_connections, fallback to username/email
    const paygramConnection = await storage.getPaygramConnection(user.id);
    const userCliId = paygramConnection?.paygramUserId || user.username || user.email;
    if (!userCliId) {
      return res.status(400).json({ success: false, message: "User wallet identifier not found" });
    }

    // Pre-check: Verify admin escrow has sufficient PHPT balance BEFORE withdrawing chips
    // This prevents the scenario where chips are withdrawn but PHPT payout fails
    // Super admin's PayGram username is always "superadmin" (the escrow account)
    const adminEscrowId = "superadmin";
    const escrowBalance = await getUserPhptBalance(adminEscrowId);
    console.log(`[Casino Withdraw] Admin escrow balance check: ${escrowBalance.balance} PHPT (needed: ${withdrawAmount})`);
    
    if (!escrowBalance.success) {
      console.error(`[Casino Withdraw] Failed to check escrow balance: ${escrowBalance.message}`);
      return res.status(503).json({ 
        success: false, 
        message: "Unable to verify escrow balance. Please try again later." 
      });
    }
    
    if (escrowBalance.balance < withdrawAmount) {
      console.error(`[Casino Withdraw] Insufficient escrow balance: ${escrowBalance.balance} < ${withdrawAmount}`);
      return res.status(400).json({ 
        success: false, 
        message: `Escrow temporarily has insufficient funds (${escrowBalance.balance.toFixed(2)} PHPT available). Please contact support or try a smaller amount.` 
      });
    }

    // Generate unique transaction ID with random suffix to prevent collisions
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const transactionId = `WD${user.id}_${Date.now()}_${randomSuffix}`;
    
    // Create casino transaction record for state tracking
    let casinoTx = await storage.createCasinoTransaction({
      userId: user.id,
      type: "sell",
      amount: withdrawAmount.toString(),
      status: "initiated",
      transactionId: transactionId,
      casinoNonce: transactionId,
    });
    console.log(`[Casino Withdraw] Transaction ${transactionId} created with ID ${casinoTx.id}`);

    // Step 1: Call casino API to withdraw chips (negative amount)
    const result = await executeCasinoTransfer({
      agent: link.assignedAgent as CasinoAgent,
      username: link.casinoUsername,
      amount: -withdrawAmount, // NEGATIVE amount for withdrawal
      isAgent: link.isAgent,
      nonce: transactionId,
      comment: `withdrawn ${withdrawAmount}php to payverse account with transaction number ${transactionId}`
    });

    if (!result.success) {
      console.error(`[Casino Withdraw] Chip withdrawal failed for ${link.casinoUsername}:`, result.message);
      await storage.updateCasinoTransaction(casinoTx.id, {
        status: "failed",
        failureReason: result.message || "Failed to withdraw casino chips",
        failureStep: "casino_debit",
      });
      return res.status(400).json({ 
        success: false, 
        message: result.message || "Insufficient casino chips or withdrawal failed" 
      });
    }
    
    // Update: Chips withdrawn from casino
    await storage.updateCasinoTransaction(casinoTx.id, {
      status: "casino_debited",
      casinoResponseId: result.data?.transactionId || null,
    });
    console.log(`[Casino Withdraw] Chip withdrawal successful`);

    // Step 2: Transfer PHPT from admin escrow to user wallet
    console.log(`[Casino Withdraw] Step 2: Transferring ${withdrawAmount} PHPT from admin escrow to ${userCliId}`);
    await storage.updateCasinoTransaction(casinoTx.id, {
      status: "payout_pending",
    });
    
    const phptTransfer = await transferFromAdminWallet(userCliId, withdrawAmount);
    
    if (!phptTransfer.success) {
      // PHPT payout failed - attempt to redeposit chips back to casino
      console.error(`[Casino Withdraw] PHPT payout failed. Attempting chip redeposit. TxId: ${transactionId}`);
      await storage.updateCasinoTransaction(casinoTx.id, {
        status: "redeposit_pending",
        failureReason: phptTransfer.message || "Admin escrow has insufficient PHPT",
        failureStep: "payout",
        rollbackAttempts: 1,
        lastRollbackAt: new Date(),
      });
      
      const revertResult = await executeCasinoTransfer({
        agent: link.assignedAgent as CasinoAgent,
        username: link.casinoUsername,
        amount: withdrawAmount, // POSITIVE amount to re-credit
        isAgent: link.isAgent,
        nonce: `${transactionId}_REVERT`,
        comment: `auto-revert: re-credited ${withdrawAmount}php after failed payout for transaction ${transactionId}`
      });
      
      if (revertResult.success) {
        console.log(`[Casino Withdraw] Automatic chip redeposit successful`);
        await storage.updateCasinoTransaction(casinoTx.id, {
          status: "failed", // Gracefully failed with successful redeposit
          rollbackTxId: revertResult.data?.transactionId || `${transactionId}_REVERT`,
        });
        await storage.createTransaction({
          senderId: adminId,
          receiverId: user.id,
          amount: withdrawAmount.toString(),
          type: "casino_withdraw",
          status: "failed",
          walletType: "phpt",
          note: `REVERTED: PHPT payout failed, chips redeposited. TxId: ${transactionId}`,
        });
        return res.status(400).json({ 
          success: false, 
          message: "PHPT payout failed (escrow low on funds). Your casino chips have been automatically restored." 
        });
      } else {
        // Redeposit failed - needs manual resolution
        console.error(`[Casino Withdraw] CRITICAL: Chip redeposit also failed. TxId: ${transactionId}`);
        await storage.updateCasinoTransaction(casinoTx.id, {
          status: "manual_required",
          failureReason: `PHPT payout failed: ${phptTransfer.message}. Chip redeposit also failed: ${revertResult.message}`,
          adminAlertSent: false, // Flag for admin notification system
        });
        await storage.createTransaction({
          senderId: adminId,
          receiverId: user.id,
          amount: withdrawAmount.toString(),
          type: "casino_withdraw",
          status: "pending", // Mark as pending for manual resolution
          walletType: "phpt",
          note: `MANUAL REQUIRED: PHPT payout failed, chip redeposit failed. User owes ${withdrawAmount} PHPT. TxId: ${transactionId}`,
        });
        return res.status(400).json({ 
          success: false, 
          message: "Transaction requires manual processing. Support has been notified. Reference: " + transactionId 
        });
      }
    }
    
    // Update with escrow transaction ID
    await storage.updateCasinoTransaction(casinoTx.id, {
      escrowTxId: phptTransfer.transactionId,
    });
    console.log(`[Casino Withdraw] PHPT transfer successful: ${phptTransfer.transactionId}`);

    // Success - update transaction and create history record
    await storage.updateCasinoTransaction(casinoTx.id, {
      status: "completed",
    });
    
    await storage.createTransaction({
      senderId: adminId,
      receiverId: user.id,
      amount: withdrawAmount.toString(),
      type: "casino_withdraw",
      status: "completed",
      walletType: "phpt",
      note: `Casino withdrawal from ${link.casinoUsername} via ${link.assignedAgent} (747Live). TxId: ${transactionId}`,
    });

    console.log(`[Casino Withdraw] Complete: ${withdrawAmount} PHPT credited to ${userCliId}`);
    return res.json({
      success: true,
      message: `Successfully withdrew ${withdrawAmount} chips to your PHPT wallet`,
      transactionId
    });
  } catch (error: any) {
    console.error("[Casino] Withdraw error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Store OTPs temporarily (in production, use Redis or database)
const otpStore = new Map<string, { otp: string; expires: number; username: string; isAgent: boolean; agent: string; clientId: string }>();

// Store balance challenges for player verification (in production, use Redis or database)
const balanceChallengeStore = new Map<string, { 
  expectedBalance: number; 
  expires: number; 
  username: string; 
  agent: string; 
  clientId: string;
  agentClientId: string;
  agentUsername: string;
}>();

// Generate random 6-digit OTP
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Validate username via GetHierarchy - check if user is under Team Marc network
router.post("/validate", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { username, isAgent = false } = req.body;
    
    if (!username?.trim()) {
      return res.status(400).json({ success: false, valid: false, message: "Username required" });
    }

    const casinoUsername = username.trim().toLowerCase();

    const isDemoMode = await checkDemoMode();
    if (isDemoMode) {
      // Demo mode - simulate validation
      return res.json({
        success: true,
        valid: true,
        username: casinoUsername,
        agent: "bossmarc747",
        clientId: "demo_123",
        demoMode: true
      });
    }

    // Find the user's agent via hierarchy check - tries both player and agent types
    const { agent, clientId, username: canonicalUsername, isAgent: detectedIsAgent } = await findUserAgent(casinoUsername, isAgent);

    if (!agent) {
      return res.json({
        success: true,
        valid: false,
        message: "Your 747 account is not under Team Marc network. Required agents: marcthepogi, teammarc, or bossmarc747"
      });
    }

    return res.json({
      success: true,
      valid: true,
      username: canonicalUsername || casinoUsername,
      agent: agent,
      clientId: clientId,
      isAgent: detectedIsAgent // Return detected agent/player type
    });
  } catch (error: any) {
    console.error("[Casino] Validate error:", error);
    return res.status(500).json({ success: false, valid: false, message: error.message });
  }
});

// Send verification challenge - OTP for agents, balance verification for players
router.post("/send-otp", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { username, isAgent = false } = req.body;
    
    if (!username?.trim()) {
      return res.status(400).json({ success: false, message: "Username required" });
    }

    const casinoUsername = username.trim().toLowerCase();

    // First validate the user exists and is under our network - tries both player and agent types
    const { agent, clientId, username: canonicalUsername, agentClientId, agentUsername, isAgent: detectedIsAgent } = await findUserAgent(casinoUsername, isAgent);

    if (!agent) {
      return res.status(400).json({
        success: false,
        message: "Username not found under Team Marc network"
      });
    }

    // Get the agent's token
    const token = await getAgentToken(agent);
    if (!token) {
      return res.status(500).json({ success: false, message: "Agent token not configured" });
    }

    const isDemoMode = await checkDemoMode();

    // PLAYER ACCOUNTS: Use balance verification instead of OTP
    // Use detected isAgent from API, not user-provided value
    if (!detectedIsAgent) {
      console.log(`[Casino] Player verification - fetching balance for ${casinoUsername}`);

      // Fetch player's current balance from statistics endpoint
      const statsResult = await callCasinoApiPost("/statistics/transactions-by-client-username", token, {
        username: canonicalUsername || casinoUsername,
        currency: "php"
      });

      if (!statsResult.success || !statsResult.data || statsResult.data.currentBalance === undefined) {
        console.log(`[Casino] Failed to fetch balance for player ${casinoUsername}:`, statsResult.message);
        return res.status(400).json({
          success: false,
          message: "Could not fetch your casino balance. Please try again or contact support."
        });
      }

      const currentBalance = parseFloat(statsResult.data.currentBalance) || 0;
      const balanceKey = `${user.id}_${casinoUsername}`;

      // Store balance challenge with 10-minute expiry
      balanceChallengeStore.set(balanceKey, {
        expectedBalance: currentBalance,
        expires: Date.now() + 10 * 60 * 1000,
        username: canonicalUsername || casinoUsername,
        agent,
        clientId: clientId || "",
        agentClientId: agentClientId || "",
        agentUsername: agentUsername || ""
      });

      console.log(`[Casino] Balance challenge stored for ${casinoUsername}: ₱${currentBalance.toFixed(2)}`);

      if (isDemoMode) {
        return res.json({
          success: true,
          message: "Demo mode - Enter your current casino balance to verify",
          verificationType: "balance",
          demoMode: true,
          demoBalance: currentBalance // Only in demo mode for testing
        });
      }

      return res.json({
        success: true,
        message: "Enter your current 747 casino balance to verify account ownership",
        verificationType: "balance"
      });
    }

    // AGENT ACCOUNTS: Use OTP via SendMessage
    const otp = generateOtp();
    const otpKey = `${user.id}_${casinoUsername}`;

    // Store OTP with 10-minute expiry
    otpStore.set(otpKey, {
      otp,
      expires: Date.now() + 10 * 60 * 1000,
      username: canonicalUsername || casinoUsername,
      isAgent: true,
      agent,
      clientId: clientId || ""
    });

    if (isDemoMode) {
      console.log(`[Casino] DEMO OTP for agent ${casinoUsername}: ${otp}`);
      return res.json({
        success: true,
        message: "Demo mode - OTP logged to console",
        verificationType: "otp",
        demoMode: true,
        demoOtp: otp
      });
    }

    // Send OTP via casino's SendMessage API
    const message = `
<div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #333; margin-bottom: 20px;">PayVerse Verification</h2>
  <p style="color: #666; margin-bottom: 15px;">Your verification code is:</p>
  <div style="background: #f5f5f5; padding: 15px; text-align: center; border-radius: 8px; margin-bottom: 15px;">
    <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${otp}</span>
  </div>
  <p style="color: #999; font-size: 12px;">This code expires in 10 minutes. Do not share this code with anyone.</p>
</div>
    `.trim();
    
    console.log(`[Casino OTP] Sending OTP to agent ${canonicalUsername || casinoUsername} via ${agent}`);
    
    const result = await callCasinoApiPost("/Default/SendMessage", token, {
      username: canonicalUsername || casinoUsername,
      clientId: clientId ? parseInt(clientId) : 0,
      subject: "PayVerse OTP",
      message: message
    });
    
    console.log(`[Casino OTP] SendMessage result for ${canonicalUsername || casinoUsername}:`, JSON.stringify(result));

    if (!result.success) {
      console.log(`[Casino] SendMessage failed for agent ${casinoUsername}: ${result.message}`);
      return res.json({
        success: true,
        message: "Verification code generated. Check your 747 messages.",
        verificationType: "otp",
        fallbackMode: true
      });
    }

    return res.json({
      success: true,
      message: "Verification code sent to your 747 account messages",
      verificationType: "otp"
    });
  } catch (error: any) {
    console.error("[Casino] Send verification error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Verify OTP and complete connection
router.post("/verify-otp", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { username, isAgent = false, otp } = req.body;
    
    if (!username?.trim() || !otp?.trim()) {
      return res.status(400).json({ success: false, message: "Username and OTP required" });
    }

    const casinoUsername = username.trim().toLowerCase();
    const otpKey = `${user.id}_${casinoUsername}`;
    
    const storedData = otpStore.get(otpKey);
    
    if (!storedData) {
      return res.status(400).json({ success: false, message: "No OTP found. Please request a new code." });
    }

    if (Date.now() > storedData.expires) {
      otpStore.delete(otpKey);
      return res.status(400).json({ success: false, message: "OTP expired. Please request a new code." });
    }

    if (storedData.otp !== otp.trim()) {
      return res.status(400).json({ success: false, message: "Invalid OTP. Please check and try again." });
    }

    // OTP is valid - clear it and create the casino link
    otpStore.delete(otpKey);

    // Delete existing link if any
    const existingLink = await storage.getCasinoLink(user.id);
    if (existingLink) {
      await storage.deleteCasinoLink(user.id);
    }

    // Create verified casino link
    const link = await storage.createCasinoLink({
      userId: user.id,
      casinoUsername: storedData.username,
      casinoClientId: storedData.clientId,
      isAgent: storedData.isAgent,
      assignedAgent: storedData.agent,
      hierarchySnapshot: JSON.stringify({ verifiedViaOtp: true }),
      status: "verified"
    });

    console.log(`[Casino] OTP verified - created link for user ${user.id}: username=${link.casinoUsername}, agent=${storedData.agent}`);

    return res.json({
      success: true,
      message: "Casino account connected successfully",
      casinoUsername: link.casinoUsername,
      assignedAgent: link.assignedAgent,
      isAgent: link.isAgent
    });
  } catch (error: any) {
    console.error("[Casino] Verify OTP error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Verify balance and complete connection (for player accounts)
router.post("/verify-balance", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { username, balance } = req.body;
    
    if (!username?.trim()) {
      return res.status(400).json({ success: false, message: "Username required" });
    }
    
    if (balance === undefined || balance === null || balance === "") {
      return res.status(400).json({ success: false, message: "Balance required" });
    }

    const casinoUsername = username.trim().toLowerCase();
    const balanceKey = `${user.id}_${casinoUsername}`;
    const enteredBalance = parseFloat(balance.toString());
    
    if (isNaN(enteredBalance) || enteredBalance < 0) {
      return res.status(400).json({ success: false, message: "Please enter a valid balance amount" });
    }
    
    const storedData = balanceChallengeStore.get(balanceKey);
    
    if (!storedData) {
      return res.status(400).json({ success: false, message: "No verification pending. Please start the connection process again." });
    }

    if (Date.now() > storedData.expires) {
      balanceChallengeStore.delete(balanceKey);
      return res.status(400).json({ success: false, message: "Verification expired. Please start the connection process again." });
    }

    // Check if balance matches exactly (to 2 decimal places)
    const expectedBalance = Math.round(storedData.expectedBalance * 100) / 100;
    const userBalance = Math.round(enteredBalance * 100) / 100;
    
    if (expectedBalance !== userBalance) {
      console.log(`[Casino] Balance mismatch for ${casinoUsername}: expected ${expectedBalance}, got ${userBalance}`);
      return res.status(400).json({ 
        success: false, 
        message: "Balance doesn't match. Please check your 747 casino balance and try again." 
      });
    }

    // Balance is valid - clear it and create the casino link
    balanceChallengeStore.delete(balanceKey);

    // Delete existing link if any
    const existingLink = await storage.getCasinoLink(user.id);
    if (existingLink) {
      await storage.deleteCasinoLink(user.id);
    }

    // Create verified casino link for player
    const link = await storage.createCasinoLink({
      userId: user.id,
      casinoUsername: storedData.username,
      casinoClientId: storedData.clientId,
      agentClientId: storedData.agentClientId,
      agentUsername: storedData.agentUsername,
      isAgent: false, // This endpoint is only for players
      assignedAgent: storedData.agent,
      hierarchySnapshot: JSON.stringify({ verifiedViaBalance: true, verifiedBalance: expectedBalance }),
      status: "verified"
    });

    console.log(`[Casino] Balance verified - created link for user ${user.id}: username=${link.casinoUsername}, agent=${storedData.agent}, balance=₱${expectedBalance}`);

    return res.json({
      success: true,
      message: "Casino account connected successfully",
      casinoUsername: link.casinoUsername,
      assignedAgent: link.assignedAgent,
      isAgent: false
    });
  } catch (error: any) {
    console.error("[Casino] Verify balance error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get casino transaction history (finance data)
router.get("/finance", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const link = await storage.getCasinoLink(user.id);
    if (!link) {
      return res.json({ success: true, transactions: [], message: "No casino account connected" });
    }

    // Get date range from query params (default: last 30 days)
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    
    const fromUtc = (req.query.from as string) || fromDate.toISOString();
    const toUtc = (req.query.to as string) || toDate.toISOString();

    const isDemoMode = await checkDemoMode();
    if (isDemoMode) {
      // Demo mode: return sample transactions
      return res.json({
        success: true,
        transactions: [
          { date: new Date().toISOString(), type: "deposit", amount: 1000, balance: 1000 },
          { date: new Date(Date.now() - 86400000).toISOString(), type: "bet", amount: -100, balance: 900 },
          { date: new Date(Date.now() - 86400000).toISOString(), type: "win", amount: 250, balance: 1150 }
        ],
        demoMode: true
      });
    }

    const token = await getAgentToken(link.assignedAgent as CasinoAgent);
    if (!token) {
      return res.status(500).json({ success: false, message: "Agent token not configured" });
    }

    // Call 747Live get-finance API - send both username and clientId when available
    const requestParams: Record<string, any> = {
      fromUtc: fromUtc,
      toExcludingUtc: toUtc
    };
    
    // Always include username, also include clientId if available
    if (link.casinoUsername) {
      requestParams.username = link.casinoUsername;
    }
    if (link.casinoClientId) {
      requestParams.clientId = link.casinoClientId;
    }
    
    // Require at least one identifier
    if (!link.casinoUsername && !link.casinoClientId) {
      return res.status(400).json({ success: false, message: "Casino account missing identifier" });
    }
    
    const result = await callCasinoApiPost("/account/get-finance", token, requestParams);

    console.log(`[Casino Finance] Response for ${link.casinoUsername}:`, JSON.stringify(result, null, 2));

    if (result.success && result.data) {
      // Parse transactions from response
      const transactions = result.data.transactions || result.data.items || result.data || [];
      
      return res.json({
        success: true,
        username: link.casinoUsername,
        transactions: Array.isArray(transactions) ? transactions.map((tx: any) => ({
          date: tx.date || tx.createdAt || tx.timestamp,
          type: tx.type || tx.transactionType || "unknown",
          amount: parseFloat(tx.amount) || 0,
          balance: parseFloat(tx.balance) || parseFloat(tx.balanceAfter) || null,
          description: tx.description || tx.comment || tx.note || null
        })) : [],
        fromDate: fromUtc,
        toDate: toUtc
      });
    }

    return res.json({ 
      success: true, 
      transactions: [],
      message: result.message || "Could not fetch finance data" 
    });
  } catch (error: any) {
    console.error("[Casino] Finance error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get casino transaction statistics
router.get("/statistics", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const link = await storage.getCasinoLink(user.id);
    if (!link) {
      return res.json({ success: true, stats: null, message: "No casino account connected" });
    }

    const isDemoMode = await checkDemoMode();
    if (isDemoMode) {
      // Demo mode: return sample statistics
      return res.json({
        success: true,
        stats: {
          totalDeposits: 5000,
          totalWithdrawals: 2500,
          totalBets: 15000,
          totalWins: 12000,
          netProfit: -500,
          currency: "PHP"
        },
        demoMode: true
      });
    }

    const token = await getAgentToken(link.assignedAgent as CasinoAgent);
    if (!token) {
      return res.status(500).json({ success: false, message: "Agent token not configured" });
    }

    // Call 747Live transactions-by-client-username API
    const result = await callCasinoApiPost("/statistics/transactions-by-client-username", token, {
      username: link.casinoUsername,
      currency: "php"
    });

    console.log(`[Casino Statistics] Response for ${link.casinoUsername}:`, JSON.stringify(result, null, 2));

    if (result.success && result.data) {
      // Parse statistics from response
      const data = result.data;
      
      return res.json({
        success: true,
        username: link.casinoUsername,
        stats: {
          totalDeposits: parseFloat(data.totalDeposits || data.deposits || 0),
          totalWithdrawals: parseFloat(data.totalWithdrawals || data.withdrawals || 0),
          totalBets: parseFloat(data.totalBets || data.bets || data.wager || 0),
          totalWins: parseFloat(data.totalWins || data.wins || data.payout || 0),
          netProfit: parseFloat(data.netProfit || data.profit || data.ggr || 0),
          currency: data.currency || "PHP",
          // Raw data for debugging
          rawStats: data
        }
      });
    }

    return res.json({ 
      success: true, 
      stats: null,
      message: result.message || "Could not fetch statistics" 
    });
  } catch (error: any) {
    console.error("[Casino] Statistics error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get user's casino transaction status (for pending/failed transactions)
router.get("/transaction-status", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const transactions = await storage.getCasinoTransactionsByUserId(user.id);
    
    // Filter to show recent and active transactions
    const activeStatuses = ["initiated", "escrow_debited", "casino_debited", "payout_pending", "refund_pending", "redeposit_pending", "manual_required"];
    const activeTransactions = transactions.filter(tx => activeStatuses.includes(tx.status));
    const recentTransactions = transactions.slice(0, 10); // Last 10 transactions

    return res.json({
      success: true,
      activeTransactions: activeTransactions.map(tx => ({
        id: tx.id,
        transactionId: tx.transactionId,
        type: tx.type,
        amount: tx.amount,
        status: tx.status,
        statusMessage: getTransactionStatusMessage(tx.status, tx.type),
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
      })),
      recentTransactions: recentTransactions.map(tx => ({
        id: tx.id,
        transactionId: tx.transactionId,
        type: tx.type,
        amount: tx.amount,
        status: tx.status,
        statusMessage: getTransactionStatusMessage(tx.status, tx.type),
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
      })),
    });
  } catch (error: any) {
    console.error("[Casino] Transaction status error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Helper function for user-friendly status messages
function getTransactionStatusMessage(status: string, type: string): string {
  const actionWord = type === "buy" ? "deposit" : "withdrawal";
  switch (status) {
    case "initiated":
      return `Your ${actionWord} is being processed...`;
    case "escrow_debited":
      return type === "buy" ? "PHPT transferred, crediting casino chips..." : "Processing...";
    case "casino_debited":
      return type === "sell" ? "Chips withdrawn, transferring PHPT to your wallet..." : "Processing...";
    case "payout_pending":
      return "Transferring PHPT to your wallet...";
    case "refund_pending":
      return "Casino credit failed. Refunding your PHPT...";
    case "redeposit_pending":
      return "PHPT payout failed. Restoring your casino chips...";
    case "manual_required":
      return "This transaction requires support attention. Reference ID provided.";
    case "completed":
      return `Your ${actionWord} completed successfully.`;
    case "failed":
      return `Transaction failed but funds were restored.`;
    default:
      return "Processing...";
  }
}

// Admin: Get transactions requiring manual resolution
router.get("/admin/manual-required", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.isAdmin && user?.role !== "super_admin" && user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const transactions = await storage.getManualRequiredCasinoTransactions();

    return res.json({
      success: true,
      transactions: transactions.map(tx => ({
        id: tx.id,
        userId: tx.userId,
        transactionId: tx.transactionId,
        type: tx.type,
        amount: tx.amount,
        status: tx.status,
        failureReason: tx.failureReason,
        failureStep: tx.failureStep,
        escrowTxId: tx.escrowTxId,
        casinoNonce: tx.casinoNonce,
        rollbackAttempts: tx.rollbackAttempts,
        adminAlertSent: tx.adminAlertSent,
        resolvedBy: tx.resolvedBy,
        resolvedAt: tx.resolvedAt,
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
      })),
      count: transactions.length,
    });
  } catch (error: any) {
    console.error("[Casino Admin] Manual required error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Admin: Get all pending transactions (for retry system)
router.get("/admin/pending", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.isAdmin && user?.role !== "super_admin" && user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const transactions = await storage.getPendingCasinoTransactions();

    return res.json({
      success: true,
      transactions: transactions.map(tx => ({
        id: tx.id,
        userId: tx.userId,
        transactionId: tx.transactionId,
        type: tx.type,
        amount: tx.amount,
        status: tx.status,
        failureReason: tx.failureReason,
        failureStep: tx.failureStep,
        rollbackAttempts: tx.rollbackAttempts,
        nextRetryAt: tx.nextRetryAt,
        createdAt: tx.createdAt,
      })),
      count: transactions.length,
    });
  } catch (error: any) {
    console.error("[Casino Admin] Pending transactions error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Admin: Manually resolve a transaction
router.post("/admin/resolve/:id", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.isAdmin && user?.role !== "super_admin" && user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const txId = parseInt(req.params.id);
    const { resolution, notes } = req.body;
    
    if (!resolution || !["completed", "failed", "refunded"].includes(resolution)) {
      return res.status(400).json({ success: false, message: "Valid resolution required: completed, failed, or refunded" });
    }

    const tx = await storage.getCasinoTransaction(txId);
    if (!tx) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    if (tx.status !== "manual_required") {
      return res.status(400).json({ success: false, message: "Transaction is not in manual_required status" });
    }

    await storage.updateCasinoTransaction(txId, {
      status: resolution,
      resolvedBy: user.id,
      resolvedAt: new Date(),
      failureReason: tx.failureReason + ` | Admin resolution: ${resolution}. Notes: ${notes || "None"}`,
    });

    // Log admin action
    await storage.createAdminAuditLog({
      adminId: user.id,
      action: "casino_transaction_resolved",
      targetType: "casino_transaction",
      targetId: tx.id,
      details: JSON.stringify({
        transactionId: tx.transactionId,
        userId: tx.userId,
        amount: tx.amount,
        type: tx.type,
        resolution,
        notes,
      }),
    });

    console.log(`[Casino Admin] Transaction ${tx.transactionId} resolved as ${resolution} by admin ${user.id}`);

    return res.json({
      success: true,
      message: `Transaction resolved as ${resolution}`,
    });
  } catch (error: any) {
    console.error("[Casino Admin] Resolve error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Admin: Manually credit casino chips to a user
// Accepts optional agent and isAgent params to skip hierarchy lookup when casino API is unavailable
router.post("/admin/manual-credit", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const { casinoUsername, amount, notes, agent: providedAgent, isAgent: providedIsAgent } = req.body;
    
    if (!casinoUsername?.trim()) {
      return res.status(400).json({ success: false, message: "Casino username required" });
    }
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Valid amount required" });
    }

    let agent: CasinoAgent | null = null;
    let targetUsername = casinoUsername.trim();
    let isAgent = providedIsAgent === true;

    // If agent is provided directly, use it (bypass hierarchy lookup)
    if (providedAgent && CASINO_AGENTS.includes(providedAgent.toLowerCase())) {
      agent = providedAgent.toLowerCase() as CasinoAgent;
      console.log(`[Casino Admin] Using provided agent: ${agent}`);
    } else {
      // Try to find via hierarchy lookup
      const lookupResult = await findUserAgent(casinoUsername.trim());
      if (lookupResult.agent) {
        agent = lookupResult.agent;
        targetUsername = lookupResult.username || casinoUsername.trim();
        isAgent = lookupResult.isAgent;
      }
    }
    
    if (!agent) {
      return res.status(404).json({ 
        success: false, 
        message: "Casino user not found. If API is unavailable, provide agent manually (marcthepogi/teammarc/bossmarc747)" 
      });
    }

    const nonce = Date.now().toString();

    const transferResult = await executeCasinoTransfer({
      agent,
      username: targetUsername,
      amount: amount,
      isAgent,
      nonce,
      comment: notes || `Admin manual credit of ${amount} chips`
    });

    if (!transferResult.success) {
      console.error("[Casino Admin] Manual credit failed:", transferResult.message);
      return res.status(500).json({ success: false, message: transferResult.message || "Casino transfer failed" });
    }

    // Log admin action
    await storage.createAdminAuditLog({
      adminId: user.id,
      action: "casino_manual_credit",
      targetType: "casino_user",
      targetId: 0, // Use 0 since this is a casino username, not a user ID
      details: JSON.stringify({
        casinoUsername: targetUsername,
        amount,
        agent,
        notes,
        response: transferResult.data
      }),
    });

    console.log(`[Casino Admin] Successfully credited ${amount} chips to ${targetUsername}`);

    return res.json({
      success: true,
      message: `Successfully credited ${amount} chips to ${targetUsername}`,
      data: transferResult.data
    });
  } catch (error: any) {
    console.error("[Casino Admin] Manual credit error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Disconnect casino account
router.post("/disconnect", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    await storage.deleteCasinoLink(user.id);

    return res.json({
      success: true,
      message: "Casino account disconnected"
    });
  } catch (error: any) {
    console.error("[Casino] Disconnect error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export async function registerCasinoRoutes(app: any, authMiddleware: any) {
  app.use("/api/casino", authMiddleware, router);
  const isDemoMode = await checkDemoMode();
  console.log(`[Casino] 747Live routes registered (Demo mode: ${isDemoMode})`);
}

export default router;
