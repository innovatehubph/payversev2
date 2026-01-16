# Payverse E-Wallet Application

## Overview
Payverse is a production-ready P2P e-wallet application designed for secure peer-to-peer money transfers, user wallet management, and cryptocurrency integration via the PayGram API. It features a modern full-stack, API-first architecture with fintech-grade security, supporting both regular users and administrators. The platform aims to provide a robust and user-friendly financial service with connected third-party services.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **UI**: shadcn/ui with Radix UI, styled using Tailwind CSS v4
- **Build**: Vite
- **Navigation**: Modal-based flows for Top Up/Cash Out, 5-item mobile footer nav (Home, Top Up, Cash Out, Send, History)

### Backend
- **Runtime**: Node.js with Express and TypeScript (ESM)
- **API**: RESTful
- **Authentication**: Custom JWT-like session tokens, bcrypt for passwords
- **Security**: AES-256-GCM encryption for sensitive data
- **Features**: Core authentication, transfer, admin, PayGram integration, casino integration, services hub.

### Database
- **ORM**: Drizzle ORM (PostgreSQL dialect)
- **Schema**: Defined in `shared/schema.ts`
- **Tables**: `users`, `transactions`, `paygramConnections`, `cryptoInvoices`, `cryptoWithdrawals`, `adminAuditLogs`, `balanceAdjustments`, `userTutorials`, `casinoLinks`, `casinoTransactions`. PayGram is the single source of truth for balances; PayVerse stores transaction history and audit logs.

### Key Features
- **User Onboarding**: Interactive guided tour for new users.
- **Admin Features**: User/KYC management, balance adjustments, transaction monitoring, audit logs, crypto administration, role-based access control (RBAC).
- **Security**: bcrypt hashing, AES-256-GCM encryption, Bearer token authentication, RBAC, rate limiting, enhanced audit logging.
- **Wallet Architecture**: Single PHPT balance as source of truth (PHP display is 1:1 conversion). Admin escrow account (`admin@payverse.ph`) for internal PHPT operations and an admin Telegram wallet for external funding. Casino balance is display-only for casino features.
- **Services Hub**: Connected third-party services for casino gaming, bills payment, crypto trading.

## Connected Services

### 747Live Casino Integration
- **API**: `https://bridge.747lc.com`
- **Features**: Deposit/withdraw PHPT to/from casino account
- **Endpoints**: `/api/casino/balance`, `/api/casino/deposit`, `/api/casino/withdraw`
- **Status**: Active (demo mode when `CASINO_747_API_KEY` not configured)
- **Environment Variable**: `CASINO_747_API_KEY`

### Coming Soon Services
- **PlataPay** (`platapay.ph`): Airtime loading, bills payment, insurance, hotel bookings
- **PDAX** (`pdax.ph`): Crypto trading and exchange

## External Dependencies

### Database
- **PostgreSQL**: Connected via `DATABASE_URL`, managed with Drizzle ORM and Drizzle Kit for migrations.

### Third-Party APIs
- **PayGram API** (`https://api.pay-gram.org`):
  - **Core Functionality**: Full cryptocurrency operations including `IssueInvoice`, `UserInfo`, `GetExchangeRates`, `Swap`, `TransferCredit`, `Withdraw`, `GetStatement`, `CreateRedEnvelope`/`RedeemRedEnvelope`, `SetCallbackApi`.
  - **Token Architecture**: Uses a shared `PAYGRAM_API_TOKEN` and individual encrypted user Telegram tokens.
  - **Callback**: `https://payverse.innovatehub.site/api/crypto/callback` for payment notifications.
  - **Top-up Flow**: Invoice-Voucher-Redeem bridge using `IssueInvoice` (PayGramPay) and `PayVoucher` (TGIN).
  - **Cashout Flow**: Withdraw PHPT from PayVerse to Telegram wallet or external wallets.
  - **Send Flow**: P2P PHPT transfers between PayGram users via `TransferCredit`.
  - **Admin Top-up**: Admin-initiated PHPT credits to users.
  - **QRPH Cash-In Auto-Credit**: PHP deposits via QRPH (NexusPay) automatically credit PHPT using admin wallet transfers.
  - **Manual P2P Deposit**: User deposits via traditional methods, approved by admin and credited via PayGram.

- **NexusPay API**:
  - **QRPH Cash-In**: Integrates with NexusPay for QR payment processing, using webhooks for payment confirmation.
  - **QRPH Payout**: Convert PHPT to PHP and receive via GCash/Maya/GrabPay, involving PHPT transfer to an admin escrow account and NexusPay payout.

- **747Live Casino Bridge** (`https://bridge.747lc.com`):
  - **Deposit (Buy Chips)**: Transfer PHPT to escrow → Credit casino chips. If casino credit fails, auto-refund PHPT.
  - **Withdraw (Sell Chips)**: Withdraw casino chips → Transfer PHPT from escrow. If PHPT payout fails, auto-redeposit chips.
  - **Balance Check**: Query user's casino balance
  - **Transaction State Machine**: Tracked in `casino_transactions` table with statuses: `initiated`, `escrow_debited`, `casino_debited`, `payout_pending`, `refund_pending`, `redeposit_pending`, `completed`, `failed`, `manual_required`
  - **Fallback System**: Automatic rollback on failures; escalates to `manual_required` if rollback also fails
  - **Admin Endpoints**: `/api/casino/admin/manual-required`, `/api/casino/admin/pending`, `/api/casino/admin/resolve/:id`

### Environment Variables
- `DATABASE_URL`
- `ENCRYPTION_KEY` / `SESSION_SECRET`
- `PAYGRAM_API_TOKEN`
- `ADMIN_PAYGRAM_TOKEN` (for funding escrow externally)
- `ADMIN_PAYGRAM_CLI_ID` (admin escrow account ID)
- `NEXUSPAY_USERNAME`, `NEXUSPAY_PASSWORD`, `NEXUSPAY_MERCHANT_ID`, `NEXUSPAY_KEY`
- `CASINO_747_API_KEY` (for 747Live integration)
- `PUBLIC_APP_URL`

## Recent Changes (December 2024)
- Added Services hub page with connected services tiles
- Integrated 747Live casino deposit/withdraw (demo mode available)
- Added coming soon placeholders for PlataPay and PDAX services
- Enhanced mobile footer navigation with premium wallet-app styling
- Implemented modal-based Top Up and Cash Out flows
- Created global ModalContext for managing modal state
- Implemented casino transaction state machine with automatic fallback for failed operations
- Added `casino_transactions` table for tracking buy/sell operations through two-phase commit
- Casino buy chips: auto-refunds PHPT if casino credit fails
- Casino sell chips: auto-redeposits casino chips if PHPT payout fails
- Added admin endpoints for viewing pending/manual-required casino transactions
- Added user endpoint to check transaction status (`/api/casino/transaction-status`)
- Fixed QRPH Cash-In: Now properly credits user's local PayVerse phptBalance after successful NexusPay payment and PayGram transfer
- Fixed transaction history: QRPH cash-in/credit transactions now display as "deposit" instead of "sent"
- Added admin QRPH manual processing: Both /api/admin/qrph/process/:id and /api/admin/qrph/process-all now credit local balances
- Added "Direct Credit" option for admin to bypass PayGram when it has insufficient balance or API issues
- Fixed admin dashboard to display phptBalance field instead of total balance field, showing separate PHPT balance and total balance
- Fixed casino sell chips: Added pre-check to verify admin escrow's PayGram balance BEFORE withdrawing casino chips, preventing rollback scenarios
- Updated admin credit PHPT: Now uses transferFromAdminWallet to actually move PHPT from escrow to user's PayGram wallet (consistent with casino sell and QRPH cash-in)
- Implemented real-time balance sync: All PHPT and casino balances now auto-refresh without manual button clicks
  - Dashboard: 15-second polling for PHPT balance
  - Casino page: 15-second polling for players only (agents excluded), with tab visibility check
  - Admin dashboard: 60-second polling with visibility-aware throttling
  - Wallet balance endpoint syncs to local database for admin dashboard consistency
- Created comprehensive Swagger API documentation at /api-docs with 100+ endpoints covering Auth, Wallet, Transfers, QRPH, Casino, Crypto, Security, KYC, Admin, Manual Deposits

## Recent Changes (January 2026 - UAT Fixes)
- **Send Privacy Fix**: Changed recipient search from partial keyword matching to exact username/email/phone match to prevent exposing other users' accounts (similar to GCash/Maya behavior)
- **P2P Transfer Confirmation**: Added confirmation modal before sending money, showing recipient details and amount for review before submitting
- **Transaction History Categorization**: Telegram top-ups now display as "Telegram Top-up" instead of generic "Transfer", with category stored in database
- **QRPH Auto-Confirm Bug Fix**: Fixed issue where QRPH payments auto-confirmed without actual payment - now strictly validates `transaction_state` instead of lenient success check
- **Cashout Modal Refactor**: 
  - Uses proper `viewState` enum ("method_select", "input", "confirmation", "success") for clean navigation
  - Scopes success data separately for Telegram and eWallet flows
  - Shows confirmation pages before processing any cashout
  - Shows dedicated success status pages instead of just toast notifications
  - Handles both seamless (instant) and link-based Telegram cashout responses
