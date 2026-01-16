import { Link, useLocation } from "wouter";
import { Home, Send, History, User, Bitcoin, Shield, QrCode, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import payverseLogo from "@assets/payverse_logo.png";
import { useAuth } from "@/lib/auth-context";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();

  const navItems = [
    { icon: Home, label: "Home", path: "/dashboard", testId: "nav-home" },
    { icon: Send, label: "Transfer", path: "/transfer", testId: "nav-transfer" },
    { icon: Bitcoin, label: "Crypto", path: "/crypto", testId: "nav-crypto" },
    { icon: QrCode, label: "QRPH", path: "/qrph", testId: "nav-qrph" },
    { icon: Upload, label: "P2P Deposit", path: "/manual-deposit", testId: "nav-p2p" },
    { icon: History, label: "History", path: "/history", testId: "nav-history" },
    { icon: User, label: "Profile", path: "/profile", testId: "nav-settings" },
    ...(user?.isAdmin ? [{ icon: Shield, label: "Admin", path: "/admin", testId: "nav-admin" }] : []),
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
          {navItems.map((item) => {
            const isActive = location === item.path;
            return (
              <Link key={item.path} href={item.path}>
                <div 
                  data-testid={item.testId}
                  className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group cursor-pointer",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}>
                  <item.icon className={cn("h-5 w-5", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary")} />
                  <span className="font-medium">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto p-4 md:p-8 animate-in fade-in zoom-in-95 duration-500">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 glass-panel z-50 pb-safe">
        <div className="flex justify-around items-center h-16 px-2">
          {navItems.map((item) => {
            const isActive = location === item.path;
            return (
              <Link key={item.path} href={item.path}>
                <div className={cn(
                  "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors duration-200 cursor-pointer",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}>
                  <div className={cn(
                    "p-1.5 rounded-full transition-all",
                    isActive && "bg-primary/10"
                  )}>
                    <item.icon className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-medium">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
