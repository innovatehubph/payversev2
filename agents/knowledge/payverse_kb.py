#!/usr/bin/env python3
"""
Payverse Knowledge Base - Complete project intelligence for AI agents.

This module contains comprehensive knowledge about the Payverse project
structure, architecture, APIs, integrations, and operational details.
"""

from dataclasses import dataclass, field
from typing import Any
from enum import Enum


class TechStack(str, Enum):
    """Payverse technology stack."""
    RUNTIME = "Node.js (ESM)"
    LANGUAGE = "TypeScript 5.6.3"
    FRONTEND_FRAMEWORK = "React 19.2"
    BACKEND_FRAMEWORK = "Express.js"
    DATABASE = "PostgreSQL 16"
    ORM = "Drizzle ORM"
    UI_LIBRARY = "shadcn/ui + Radix UI"
    STYLING = "Tailwind CSS v4"
    STATE_MANAGEMENT = "TanStack React Query v5"
    BUILD_TOOL = "Vite"
    ROUTING = "Wouter"


@dataclass
class ProjectStructure:
    """Payverse project structure knowledge."""

    root_path: str = "/root/payverse"

    directories: dict = field(default_factory=lambda: {
        "client": "React frontend application",
        "client/src/pages": "18 page components",
        "client/src/components": "UI components and modals",
        "client/src/components/ui": "60+ shadcn/ui components",
        "client/src/components/modals": "Transaction modals",
        "client/src/lib": "API client, contexts, utilities",
        "client/src/hooks": "Custom React hooks",
        "server": "Express.js backend (19 modules)",
        "db": "Database connection (Drizzle)",
        "shared": "Shared types and schemas",
        "script": "Build scripts",
    })

    key_files: dict = field(default_factory=lambda: {
        "package.json": "Dependencies and scripts",
        "tsconfig.json": "TypeScript configuration",
        "vite.config.ts": "Frontend build config",
        "drizzle.config.ts": "Database config",
        "shared/schema.ts": "Database schema definitions",
        "server/index.ts": "Express app entry point",
        "server/routes.ts": "API route registration",
        "server/storage.ts": "Data access layer (130+ methods)",
        "client/src/App.tsx": "React app entry point",
        "client/src/lib/api.ts": "HTTP client",
        "client/src/lib/auth-context.tsx": "Auth state management",
    })


@dataclass
class DatabaseSchema:
    """Payverse database schema knowledge."""

    tables: dict = field(default_factory=lambda: {
        "users": {
            "description": "User accounts with roles and balances",
            "key_columns": ["id", "username", "email", "role", "balance", "fiatBalance", "phptBalance", "pinHash", "kycStatus", "isActive"],
            "roles": ["super_admin", "admin", "support", "user"],
        },
        "transactions": {
            "description": "P2P transfer and payment history",
            "key_columns": ["id", "userId", "type", "amount", "status", "walletType", "reference"],
            "types": ["transfer", "deposit", "withdrawal", "topup", "cashout", "qrph_cashin", "qrph_credit"],
            "statuses": ["pending", "completed", "failed"],
        },
        "paygramConnections": {
            "description": "Telegram wallet linkage",
            "key_columns": ["id", "userId", "telegramUserId", "encryptedToken"],
        },
        "cryptoInvoices": {
            "description": "PayGram payment invoices",
            "key_columns": ["id", "userId", "invoiceCode", "voucherCode", "amount", "status"],
        },
        "cryptoWithdrawals": {
            "description": "PHPT withdrawal requests",
            "key_columns": ["id", "userId", "amount", "fee", "method", "status"],
        },
        "casinoLinks": {
            "description": "747Live casino account mapping",
            "key_columns": ["id", "userId", "casinoUsername", "casinoClientId", "agentUsername", "status"],
            "statuses": ["pending", "verified", "revoked", "demo"],
        },
        "casinoTransactions": {
            "description": "Casino buy/sell state machine",
            "key_columns": ["id", "userId", "type", "amount", "status", "retryCount", "rollbackCompleted"],
            "statuses": ["initiated", "escrow_debited", "casino_debited", "payout_pending", "refund_pending", "redeposit_pending", "completed", "failed", "manual_required"],
        },
        "adminAuditLogs": {
            "description": "Admin action audit trail",
            "key_columns": ["id", "adminId", "action", "targetType", "targetId", "riskLevel"],
        },
        "balanceAdjustments": {
            "description": "Admin balance corrections",
            "key_columns": ["id", "userId", "adminId", "type", "amount", "previousBalance", "newBalance"],
        },
        "manualPaymentMethods": {
            "description": "Admin-managed payment options",
            "key_columns": ["id", "name", "type", "accountDetails", "isActive"],
        },
        "manualDepositRequests": {
            "description": "User deposit requests",
            "key_columns": ["id", "userId", "methodId", "amount", "proofImageUrl", "status"],
        },
    })


@dataclass
class APIEndpoints:
    """Payverse API endpoints knowledge."""

    auth: dict = field(default_factory=lambda: {
        "POST /api/auth/register": "User registration",
        "POST /api/auth/login": "User login with credentials",
        "POST /api/auth/logout": "Session logout",
        "GET /api/auth/me": "Get current user profile",
    })

    wallet: dict = field(default_factory=lambda: {
        "GET /api/wallet/balance": "Get current balance",
        "POST /api/transfer": "P2P PHPT transfer",
        "GET /api/transactions": "Transaction history",
        "GET /api/users/search": "Search users for transfer",
    })

    crypto: dict = field(default_factory=lambda: {
        "POST /api/crypto/invoice": "Create payment invoice",
        "POST /api/crypto/pay-invoice": "Pay invoice from balance",
        "GET /api/crypto/invoices": "List user invoices",
        "POST /api/crypto/withdraw": "Request PHPT withdrawal",
        "POST /api/crypto/connect": "Link Telegram wallet",
        "GET /api/crypto/connection": "Get PayGram connection status",
        "POST /api/crypto/sync-balance": "Sync balance from PayGram",
        "POST /api/crypto/red-envelope/create": "Create lucky money",
        "POST /api/crypto/swap": "Currency swap",
    })

    qrph: dict = field(default_factory=lambda: {
        "POST /api/nexuspay/cashin": "QRPH deposit request",
        "GET /api/nexuspay/cashin-status/:id": "Check QRPH status",
        "POST /api/nexuspay/cashout": "QRPH withdrawal",
        "POST /api/nexuspay/webhook": "Payment webhook",
    })

    casino: dict = field(default_factory=lambda: {
        "GET /api/casino/balance": "Check casino balance",
        "POST /api/casino/deposit": "Buy casino chips",
        "POST /api/casino/withdraw": "Sell casino chips",
        "GET /api/casino/transaction-status": "Transaction tracking",
        "POST /api/casino/link": "Link casino account",
        "GET /api/casino/link": "Get casino link status",
    })

    security: dict = field(default_factory=lambda: {
        "POST /api/security/pin/setup": "Create transaction PIN",
        "POST /api/security/pin/verify": "Verify PIN",
        "POST /api/security/pin/change": "Change PIN",
        "GET /api/security/status": "Get security status",
        "POST /api/security/password/reset-request": "Request password reset",
        "POST /api/security/password/reset": "Reset password with OTP",
    })

    kyc: dict = field(default_factory=lambda: {
        "POST /api/kyc/upload": "Upload KYC documents",
        "GET /api/kyc/documents": "List submitted documents",
        "GET /api/kyc/status": "Get KYC status",
    })

    admin: dict = field(default_factory=lambda: {
        "GET /api/admin/stats": "Dashboard statistics",
        "GET /api/admin/users": "User management list",
        "PATCH /api/admin/users/:id": "Update user",
        "POST /api/admin/balance/adjust": "Balance adjustment",
        "GET /api/admin/audit-logs": "Audit trail",
        "POST /api/admin/topup-user": "Admin credit PHPT",
        "GET /api/admin/transactions/search": "Transaction search",
        "GET /api/admin/casino/pending": "Pending casino txns",
        "POST /api/admin/casino/resolve": "Resolve failed txn",
    })


@dataclass
class Integrations:
    """External service integrations."""

    paygram: dict = field(default_factory=lambda: {
        "base_url": "https://api.pay-gram.org",
        "description": "PHPT cryptocurrency operations via Telegram",
        "features": [
            "P2P transfers (TransferCredit)",
            "Invoice creation and payment",
            "Telegram wallet integration",
            "Balance queries",
            "Red envelope (lucky money)",
            "Voucher redemption via TGIN bridge",
        ],
        "auth": "API token in Authorization header",
        "server_module": "server/paygram.ts",
    })

    nexuspay: dict = field(default_factory=lambda: {
        "base_url": "https://nexuspay.cloud",
        "description": "QR-based payment processing for PHP",
        "features": [
            "QRPH cash-in (PHP deposits)",
            "QRPH cash-out to GCash/Maya/GrabPay",
            "Webhook payment confirmation",
        ],
        "auth": "Username/password + CSRF token",
        "server_module": "server/nexuspay.ts",
    })

    casino_747: dict = field(default_factory=lambda: {
        "base_url": "https://bridge.747lc.com",
        "description": "747Live casino chip operations",
        "features": [
            "Buy chips (PHPT → Casino credits)",
            "Sell chips (Casino → PHPT)",
            "Balance checking",
            "Hierarchy verification",
        ],
        "agents": ["marcthepogi", "teammarc", "bossmarc747"],
        "server_module": "server/casino.ts",
    })


@dataclass
class ServerModules:
    """Backend server modules knowledge."""

    modules: dict = field(default_factory=lambda: {
        "index.ts": {"lines": 101, "purpose": "Express app setup, middleware"},
        "auth.ts": {"lines": 40, "purpose": "Session tokens, Bearer auth middleware"},
        "routes.ts": {"lines": 342, "purpose": "Route registration, core endpoints"},
        "storage.ts": {"lines": 1156, "purpose": "Data access layer (130+ methods)"},
        "paygram.ts": {"lines": 2161, "purpose": "PayGram API integration"},
        "nexuspay.ts": {"lines": 1337, "purpose": "NexusPay QRPH integration"},
        "casino.ts": {"lines": 1807, "purpose": "747Live casino integration"},
        "admin.ts": {"lines": 694, "purpose": "Admin features, RBAC"},
        "security.ts": {"lines": 273, "purpose": "PIN, OTP, password operations"},
        "email.ts": {"lines": 627, "purpose": "Email notifications"},
        "encryption.ts": {"lines": 55, "purpose": "AES-256-GCM encryption"},
        "kyc.ts": {"lines": 193, "purpose": "KYC document handling"},
        "otp.ts": {"lines": 141, "purpose": "One-time password management"},
        "manual-deposits.ts": {"lines": 491, "purpose": "Manual P2P deposits"},
        "swagger.ts": {"lines": 1927, "purpose": "OpenAPI documentation"},
    })


@dataclass
class ClientPages:
    """Frontend pages knowledge."""

    pages: dict = field(default_factory=lambda: {
        "auth.tsx": {"lines": 400, "purpose": "Login/registration forms"},
        "dashboard.tsx": {"lines": 500, "purpose": "Main wallet view, balance display"},
        "send.tsx": {"lines": 350, "purpose": "P2P transfer interface"},
        "transfer.tsx": {"lines": 300, "purpose": "Transfer confirmation"},
        "history.tsx": {"lines": 400, "purpose": "Transaction history"},
        "profile.tsx": {"lines": 350, "purpose": "User profile settings"},
        "security.tsx": {"lines": 477, "purpose": "PIN setup/change"},
        "kyc.tsx": {"lines": 397, "purpose": "KYC document submission"},
        "crypto.tsx": {"lines": 845, "purpose": "Telegram top-up, crypto ops"},
        "qrph.tsx": {"lines": 783, "purpose": "NexusPay QRPH cash-in/out"},
        "manual-deposit.tsx": {"lines": 540, "purpose": "Manual P2P deposits"},
        "casino.tsx": {"lines": 1300, "purpose": "747Live casino integration"},
        "casino-connect.tsx": {"lines": 567, "purpose": "Casino account linking"},
        "admin.tsx": {"lines": 1801, "purpose": "Admin dashboard (largest)"},
        "services.tsx": {"lines": 267, "purpose": "Connected services hub"},
        "landing.tsx": {"lines": 329, "purpose": "Public landing page"},
        "forgot-password.tsx": {"lines": 245, "purpose": "Password reset flow"},
        "not-found.tsx": {"lines": 50, "purpose": "404 page"},
    })


@dataclass
class SecurityFeatures:
    """Security implementation knowledge."""

    authentication: dict = field(default_factory=lambda: {
        "method": "Custom session tokens (random + timestamp)",
        "storage": "Bearer token in Authorization header",
        "password_hashing": "bcrypt (10 rounds)",
    })

    encryption: dict = field(default_factory=lambda: {
        "algorithm": "AES-256-GCM",
        "key_derivation": "Environment variable (32-byte key)",
        "usage": "Telegram API tokens encryption",
    })

    authorization: dict = field(default_factory=lambda: {
        "method": "Role-Based Access Control (RBAC)",
        "roles": {
            "super_admin": {"level": 100, "permissions": "All"},
            "admin": {"level": 50, "permissions": "User management, balance ops"},
            "support": {"level": 25, "permissions": "View only, limited actions"},
            "user": {"level": 0, "permissions": "Own account operations"},
        },
    })

    transaction_security: dict = field(default_factory=lambda: {
        "pin_threshold": 5000,  # PHPT
        "pin_max_attempts": 5,
        "pin_lockout_duration": 30,  # minutes
        "rate_limits": {
            "admin": "100 requests per 15 minutes",
            "sensitive": "20 requests per 15 minutes",
        },
    })


@dataclass
class EnvironmentVariables:
    """Required environment variables."""

    required: dict = field(default_factory=lambda: {
        "DATABASE_URL": "PostgreSQL connection string",
        "PAYGRAM_API_TOKEN": "PayGram shared API token",
        "ENCRYPTION_KEY": "AES encryption key (or SESSION_SECRET)",
        "NEXUSPAY_USERNAME": "NexusPay account username",
        "NEXUSPAY_PASSWORD": "NexusPay account password",
        "NEXUSPAY_MERCHANT_ID": "NexusPay merchant identifier",
        "NEXUSPAY_KEY": "NexusPay API key",
        "CASINO_747_TOKEN_MARCTHEPOGI": "Agent 1 token",
        "CASINO_747_TOKEN_TEAMMARC": "Agent 2 token",
        "CASINO_747_TOKEN_BOSSMARC747": "Agent 3 token",
    })

    optional: dict = field(default_factory=lambda: {
        "PORT": "Server port (default: 5000)",
        "NODE_ENV": "Environment (development/production)",
        "SMTP_HOST": "Email server host",
        "SMTP_PORT": "Email server port",
        "SMTP_USER": "Email account",
        "SMTP_PASS": "Email password",
    })


class PayverseKnowledgeBase:
    """
    Complete Payverse project knowledge base.

    This class aggregates all project knowledge for AI agents.
    """

    def __init__(self):
        self.project = ProjectStructure()
        self.database = DatabaseSchema()
        self.api = APIEndpoints()
        self.integrations = Integrations()
        self.server = ServerModules()
        self.client = ClientPages()
        self.security = SecurityFeatures()
        self.env_vars = EnvironmentVariables()
        self.tech_stack = TechStack

    def get_file_path(self, component: str) -> str:
        """Get file path for a component."""
        paths = {
            "schema": f"{self.project.root_path}/shared/schema.ts",
            "routes": f"{self.project.root_path}/server/routes.ts",
            "storage": f"{self.project.root_path}/server/storage.ts",
            "paygram": f"{self.project.root_path}/server/paygram.ts",
            "nexuspay": f"{self.project.root_path}/server/nexuspay.ts",
            "casino": f"{self.project.root_path}/server/casino.ts",
            "admin": f"{self.project.root_path}/server/admin.ts",
            "auth_context": f"{self.project.root_path}/client/src/lib/auth-context.tsx",
            "api_client": f"{self.project.root_path}/client/src/lib/api.ts",
        }
        return paths.get(component, f"{self.project.root_path}/{component}")

    def get_table_info(self, table_name: str) -> dict:
        """Get information about a database table."""
        return self.database.tables.get(table_name, {})

    def get_endpoint_info(self, category: str) -> dict:
        """Get API endpoints for a category."""
        categories = {
            "auth": self.api.auth,
            "wallet": self.api.wallet,
            "crypto": self.api.crypto,
            "qrph": self.api.qrph,
            "casino": self.api.casino,
            "security": self.api.security,
            "kyc": self.api.kyc,
            "admin": self.api.admin,
        }
        return categories.get(category, {})

    def get_integration_info(self, service: str) -> dict:
        """Get integration details for an external service."""
        services = {
            "paygram": self.integrations.paygram,
            "nexuspay": self.integrations.nexuspay,
            "casino": self.integrations.casino_747,
        }
        return services.get(service, {})

    def get_module_info(self, module_name: str) -> dict:
        """Get server module information."""
        return self.server.modules.get(module_name, {})

    def get_page_info(self, page_name: str) -> dict:
        """Get client page information."""
        return self.client.pages.get(page_name, {})

    def get_security_config(self) -> dict:
        """Get security configuration."""
        return {
            "authentication": self.security.authentication,
            "encryption": self.security.encryption,
            "authorization": self.security.authorization,
            "transaction": self.security.transaction_security,
        }

    def search_knowledge(self, query: str) -> list[dict]:
        """Search knowledge base for relevant information."""
        results = []
        query_lower = query.lower()

        # Search tables
        for table, info in self.database.tables.items():
            if query_lower in table.lower() or query_lower in info.get("description", "").lower():
                results.append({"type": "table", "name": table, "info": info})

        # Search modules
        for module, info in self.server.modules.items():
            if query_lower in module.lower() or query_lower in info.get("purpose", "").lower():
                results.append({"type": "module", "name": module, "info": info})

        # Search pages
        for page, info in self.client.pages.items():
            if query_lower in page.lower() or query_lower in info.get("purpose", "").lower():
                results.append({"type": "page", "name": page, "info": info})

        return results

    def get_summary(self) -> str:
        """Get project summary."""
        return """
PAYVERSE - P2P E-Wallet Application

Tech Stack: TypeScript, React 19, Express.js, PostgreSQL, Drizzle ORM
Features: P2P transfers, PHPT crypto, QRPH payments, 747Live casino

Key Integrations:
- PayGram API: PHPT cryptocurrency operations
- NexusPay: QRPH cash-in/out (GCash, Maya, GrabPay)
- 747Live: Casino chip buy/sell

Security: RBAC, PIN protection, AES-256 encryption, audit logging

Structure:
- 18 frontend pages (React)
- 19 backend modules (Express)
- 11+ database tables (PostgreSQL)
- 60+ API endpoints
"""


# Singleton instance
_kb_instance = None

def get_knowledge_base() -> PayverseKnowledgeBase:
    """Get the singleton knowledge base instance."""
    global _kb_instance
    if _kb_instance is None:
        _kb_instance = PayverseKnowledgeBase()
    return _kb_instance
