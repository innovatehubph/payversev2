import { Link, useLocation } from "wouter";
import { Home, ArrowDownToLine, ArrowUpFromLine, Send, Clock, LogOut, User, Shield, Settings, ChevronDown, LayoutGrid, UserCheck, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import payverseLogo from "@assets/payverse_logo.png";
import { useAuth } from "@/lib/auth-context";
import { useModals } from "@/lib/modal-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TopUpModal, CashOutModal } from "@/components/modals";
import { ChatFab } from "@/components/ai-chat";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { topUpOpen, cashOutOpen, openTopUp, openCashOut, closeTopUp, closeCashOut } = useModals();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  // Super admin is the escrow account - hide user transaction features
  const isSuperAdmin = user?.role === "super_admin";

  const navItems = [
    { icon: Home, label: "Home", path: "/dashboard", testId: "nav-home", type: "link" as const },
    // Hide Top Up, Cash Out for super admin (escrow account), but allow Send (P2P)
    ...(!isSuperAdmin ? [
      { icon: ArrowDownToLine, label: "Top Up", action: openTopUp, testId: "nav-topup", type: "action" as const },
      { icon: ArrowUpFromLine, label: "Cash Out", action: openCashOut, testId: "nav-cashout", type: "action" as const },
    ] : []),
    { icon: Send, label: "Send", path: "/send", testId: "nav-send", type: "link" as const },
    { icon: Clock, label: "History", path: "/history", testId: "nav-history", type: "link" as const },
  ];

  // Build sidebar items based on user role
  const sidebarItems = [
    ...navItems,
    // Hide Services for super admin (user-only features like QRPH, Casino)
    ...(!isSuperAdmin ? [
      { icon: LayoutGrid, label: "Services", path: "/services", testId: "nav-services", type: "link" as const },
    ] : []),
    { icon: User, label: "Profile", path: "/profile", testId: "nav-profile", type: "link" as const },
    { icon: Shield, label: "Security & PIN", path: "/security", testId: "nav-security", type: "link" as const },
    // Hide KYC for super admin
    ...(!isSuperAdmin ? [
      { icon: UserCheck, label: "KYC Verification", path: "/kyc", testId: "nav-kyc", type: "link" as const },
    ] : []),
    // Help & Support - available to all users
    { icon: HelpCircle, label: "Help & Support", path: "/help", testId: "nav-help", type: "link" as const },
    // Admin-only items
    ...(user?.isAdmin || user?.role === "super_admin" || user?.role === "admin"
      ? [{ icon: Settings, label: "Admin Panel", path: "/admin", testId: "nav-admin", type: "link" as const }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0 md:pl-64 transition-all duration-300">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-64 border-r border-border bg-card/50 backdrop-blur-xl z-50">
        <div className="p-6">
          <div className="bg-slate-900 rounded-xl p-3 inline-block">
            <img src={payverseLogo} alt="PayVerse" className="h-8 w-auto object-contain" />
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {sidebarItems.map((item, index) => {
            if (item.type === "action") {
              return (
                <button
                  key={index}
                  onClick={item.action}
                  data-testid={item.testId}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group cursor-pointer text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <item.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            }

            const isActive = location === item.path;
            return (
              <Link key={item.path} href={item.path!}>
                <div 
                  data-testid={item.testId}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group cursor-pointer",
                    isActive 
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" 
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <item.icon className={cn("h-5 w-5", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary")} />
                  <span className="font-medium">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Desktop Logout */}
        <div className="p-4 border-t border-border">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={handleLogout}
            data-testid="button-logout-desktop"
          >
            <LogOut className="mr-2 h-5 w-5" />
            Log Out
          </Button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-16 bg-background/80 backdrop-blur-lg border-b border-border z-40 px-4 flex items-center justify-between">
        <div className="bg-slate-900 rounded-lg p-2">
          <img src={payverseLogo} alt="PayVerse" className="h-6 w-auto object-contain" />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                <span className="font-bold text-primary text-xs">{user?.fullName?.substring(0, 2).toUpperCase() || "U"}</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {/* Hide Services for super admin */}
            {!isSuperAdmin && (
              <>
                <DropdownMenuItem asChild>
                  <Link href="/services" className="cursor-pointer">
                    <LayoutGrid className="mr-2 h-4 w-4" />
                    Services
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem asChild>
              <Link href="/profile" className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/security" className="cursor-pointer">
                <Shield className="mr-2 h-4 w-4" />
                Security & PIN
              </Link>
            </DropdownMenuItem>
            {/* Hide KYC for super admin */}
            {!isSuperAdmin && (
              <DropdownMenuItem asChild>
                <Link href="/kyc" className="cursor-pointer">
                  <UserCheck className="mr-2 h-4 w-4" />
                  KYC Verification
                </Link>
              </DropdownMenuItem>
            )}
            {(user?.isAdmin || user?.role === "super_admin" || user?.role === "admin") && (
              <DropdownMenuItem asChild>
                <Link href="/admin" className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  Admin Panel
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/help" className="cursor-pointer">
                <HelpCircle className="mr-2 h-4 w-4" />
                Help & Support
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-destructive focus:text-destructive cursor-pointer"
              data-testid="button-logout-mobile"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto p-4 pt-20 md:pt-4 md:p-8 animate-in fade-in zoom-in-95 duration-500">
        {children}
      </main>

      {/* Mobile Bottom Nav - Premium Wallet Style */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 pb-safe">
        {/* Layered background with gradient and glassmorphism */}
        <div className="relative">
          {/* Glow effect behind the nav */}
          <div className="absolute inset-x-4 -top-4 h-8 bg-gradient-to-t from-primary/20 to-transparent blur-xl rounded-full" />
          
          {/* Main nav container */}
          <div className="relative bg-gradient-to-b from-background/95 to-background backdrop-blur-xl border-t border-white/10 shadow-[0_-8px_32px_-8px_rgba(0,0,0,0.3)]">
            <div className="flex justify-around items-end h-20 px-3 pt-2 pb-3 max-w-md mx-auto">
              {/* Home */}
              <Link href="/dashboard">
                <div 
                  data-testid="nav-home"
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 transition-all duration-300 cursor-pointer group",
                    location === "/dashboard" ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <div className={cn(
                    "p-2.5 rounded-2xl transition-all duration-300",
                    location === "/dashboard" 
                      ? "bg-primary/15 shadow-lg shadow-primary/20 scale-110" 
                      : "group-hover:bg-muted group-active:scale-95"
                  )}>
                    <Home className="h-5 w-5" />
                  </div>
                  <span className={cn(
                    "text-[10px] font-semibold tracking-wide",
                    location === "/dashboard" && "text-primary"
                  )}>Home</span>
                </div>
              </Link>

              {/* Top Up - Elevated action (hidden for super admin) */}
              {!isSuperAdmin && (
                <button
                  onClick={openTopUp}
                  data-testid="nav-topup"
                  className="flex flex-col items-center justify-center gap-1 transition-all duration-300 cursor-pointer group text-muted-foreground"
                >
                  <div className="p-2.5 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20 group-hover:from-emerald-500/30 group-hover:to-emerald-600/20 group-active:scale-95 transition-all duration-300 shadow-lg shadow-emerald-500/10">
                    <ArrowDownToLine className="h-5 w-5 text-emerald-500" />
                  </div>
                  <span className="text-[10px] font-semibold tracking-wide text-emerald-600 dark:text-emerald-400">Top Up</span>
                </button>
              )}

              {/* Send - Central FAB style (available for all users including super admin) */}
              <Link href="/send">
                <div
                  data-testid="nav-send"
                  className="flex flex-col items-center justify-center gap-1 transition-all duration-300 cursor-pointer group -mt-6"
                >
                  <div className={cn(
                    "p-4 rounded-full transition-all duration-300 shadow-xl",
                    location === "/send"
                      ? "bg-gradient-to-br from-primary via-primary to-primary/80 shadow-primary/40 scale-110"
                      : "bg-gradient-to-br from-primary to-primary/90 shadow-primary/30 group-hover:shadow-primary/50 group-hover:scale-105 group-active:scale-95"
                  )}>
                    <Send className="h-6 w-6 text-white" />
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold tracking-wide",
                    location === "/send" ? "text-primary" : "text-foreground"
                  )}>Send</span>
                </div>
              </Link>

              {/* Cash Out - Elevated action (hidden for super admin) */}
              {!isSuperAdmin && (
                <button
                  onClick={openCashOut}
                  data-testid="nav-cashout"
                  className="flex flex-col items-center justify-center gap-1 transition-all duration-300 cursor-pointer group text-muted-foreground"
                >
                  <div className="p-2.5 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-600/10 border border-amber-500/20 group-hover:from-amber-500/30 group-hover:to-orange-600/20 group-active:scale-95 transition-all duration-300 shadow-lg shadow-amber-500/10">
                    <ArrowUpFromLine className="h-5 w-5 text-amber-500" />
                  </div>
                  <span className="text-[10px] font-semibold tracking-wide text-amber-600 dark:text-amber-400">Cash Out</span>
                </button>
              )}

              {/* History */}
              <Link href="/history">
                <div 
                  data-testid="nav-history"
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 transition-all duration-300 cursor-pointer group",
                    location === "/history" ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <div className={cn(
                    "p-2.5 rounded-2xl transition-all duration-300",
                    location === "/history" 
                      ? "bg-primary/15 shadow-lg shadow-primary/20 scale-110" 
                      : "group-hover:bg-muted group-active:scale-95"
                  )}>
                    <Clock className="h-5 w-5" />
                  </div>
                  <span className={cn(
                    "text-[10px] font-semibold tracking-wide",
                    location === "/history" && "text-primary"
                  )}>History</span>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Modals */}
      <TopUpModal open={topUpOpen} onOpenChange={(open) => !open && closeTopUp()} />
      <CashOutModal open={cashOutOpen} onOpenChange={(open) => !open && closeCashOut()} />

      {/* AI Chat FAB */}
      <ChatFab />
    </div>
  );
}

export { AppLayout };
