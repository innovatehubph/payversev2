import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import AppLayout from "@/components/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Gamepad2, 
  Smartphone, 
  Receipt, 
  Shield, 
  Building2, 
  TrendingUp,
  Wallet,
  ChevronRight,
  Sparkles,
  Zap,
  LinkIcon,
  CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAuthToken } from "@/lib/api";

interface ServiceCard {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgGradient: string;
  status: "active" | "coming_soon";
  provider?: string;
}

const services: ServiceCard[] = [
  {
    id: "casino",
    name: "747 Live Casino",
    description: "Deposit & withdraw to your gaming account instantly",
    icon: Gamepad2,
    color: "text-rose-500",
    bgGradient: "from-rose-500/20 via-rose-600/10 to-orange-500/10",
    status: "active",
    provider: "747live.ph"
  },
  {
    id: "airtime",
    name: "Airtime & Load",
    description: "Buy prepaid load for all networks",
    icon: Smartphone,
    color: "text-blue-500",
    bgGradient: "from-blue-500/20 via-blue-600/10 to-cyan-500/10",
    status: "coming_soon",
    provider: "PlataPay"
  },
  {
    id: "bills",
    name: "Bills Payment",
    description: "Pay electricity, water, internet & more",
    icon: Receipt,
    color: "text-emerald-500",
    bgGradient: "from-emerald-500/20 via-emerald-600/10 to-teal-500/10",
    status: "coming_soon",
    provider: "PlataPay"
  },
  {
    id: "insurance",
    name: "Insurance",
    description: "Get protected with affordable plans",
    icon: Shield,
    color: "text-purple-500",
    bgGradient: "from-purple-500/20 via-purple-600/10 to-pink-500/10",
    status: "coming_soon",
    provider: "PlataPay"
  },
  {
    id: "hotels",
    name: "Hotel Booking",
    description: "Book accommodations nationwide",
    icon: Building2,
    color: "text-amber-500",
    bgGradient: "from-amber-500/20 via-amber-600/10 to-yellow-500/10",
    status: "coming_soon",
    provider: "PlataPay"
  },
  {
    id: "crypto",
    name: "Crypto Trading",
    description: "Buy, sell & trade cryptocurrencies",
    icon: TrendingUp,
    color: "text-indigo-500",
    bgGradient: "from-indigo-500/20 via-indigo-600/10 to-violet-500/10",
    status: "coming_soon",
    provider: "PDAX"
  }
];

export default function Services() {
  const [casinoConnected, setCasinoConnected] = useState(false);
  const [casinoUsername, setCasinoUsername] = useState<string | null>(null);

  useEffect(() => {
    const checkCasinoStatus = async () => {
      try {
        const token = getAuthToken();
        const res = await fetch("/api/casino/balance", {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setCasinoConnected(data.connected || false);
          setCasinoUsername(data.username || null);
        }
      } catch (error) {
        console.error("Failed to check casino status:", error);
      }
    };
    checkCasinoStatus();
  }, []);

  const [, navigate] = useLocation();
  
  const handleServiceClick = (service: ServiceCard) => {
    if (service.status === "coming_soon") return;
    
    if (service.id === "casino") {
      navigate("/casino");
    }
  };

  return (
    <AppLayout>
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
            <Wallet className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold">Services</h1>
            <p className="text-muted-foreground text-sm">Pay with PHPT for everyday needs</p>
          </div>
        </div>
      </header>

      {/* Featured Service - Casino */}
      <section className="mb-6">
        <Card 
          className="overflow-hidden group hover:shadow-xl transition-all duration-300 border-rose-500/20"
          data-testid="service-casino-featured"
        >
          <CardContent className="p-0">
            <div className="relative bg-gradient-to-br from-rose-500 via-rose-600 to-orange-500 p-6 text-white">
              <div className="absolute top-0 right-0 -mt-8 -mr-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute bottom-0 left-0 -mb-4 -ml-4 h-24 w-24 rounded-full bg-white/10 blur-xl" />
              
              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 rounded-2xl bg-white/20 backdrop-blur-sm">
                    <Gamepad2 className="h-8 w-8" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-xl font-bold">747 Live Casino</h3>
                      <Badge className="bg-white/20 text-white border-0 text-xs">
                        <Zap className="h-3 w-3 mr-1" /> Live
                      </Badge>
                    </div>
                    <p className="text-white/80 text-sm">Instant deposits & withdrawals</p>
                  </div>
                </div>
                
                {casinoConnected ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-white/90 text-sm bg-white/10 rounded-lg px-3 py-2">
                      <CheckCircle2 className="h-4 w-4 text-green-300" />
                      <span>Connected as <strong>{casinoUsername}</strong></span>
                    </div>
                    <Link href="/casino">
                      <Button 
                        className="w-full bg-white text-rose-600 hover:bg-white/90"
                        data-testid="button-use-casino"
                      >
                        <Gamepad2 className="mr-2 h-4 w-4" /> Deposit / Withdraw
                        <ChevronRight className="ml-auto h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <Link href="/casino">
                    <Button className="w-full bg-white text-rose-600 hover:bg-white/90" data-testid="button-connect-casino">
                      <LinkIcon className="mr-2 h-4 w-4" /> Connect Your 747 Account
                      <ChevronRight className="ml-auto h-4 w-4" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* All Services Grid */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-muted-foreground" />
          All Services
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {services.map((service) => (
            <Card
              key={service.id}
              className={cn(
                "overflow-hidden transition-all duration-300 group",
                service.status === "active" 
                  ? "cursor-pointer hover:shadow-lg hover:scale-[1.02] border-transparent hover:border-primary/20" 
                  : "opacity-75 cursor-not-allowed"
              )}
              onClick={() => handleServiceClick(service)}
              data-testid={`service-card-${service.id}`}
            >
              <CardContent className="p-4">
                <div className={cn(
                  "p-3 rounded-xl bg-gradient-to-br mb-3 w-fit transition-transform group-hover:scale-110",
                  service.bgGradient
                )}>
                  <service.icon className={cn("h-6 w-6", service.color)} />
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm truncate">{service.name}</h3>
                    {service.status === "coming_soon" && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                        Soon
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{service.description}</p>
                  {service.provider && (
                    <p className="text-[10px] text-muted-foreground/60 font-medium">{service.provider}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Info Banner */}
      <section className="mt-6">
        <Card className="bg-gradient-to-r from-primary/5 via-primary/10 to-accent/5 border-primary/10">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/10">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">All services use your PHPT balance</p>
              <p className="text-xs text-muted-foreground">Instant payments, no additional fees</p>
            </div>
          </CardContent>
        </Card>
      </section>

    </AppLayout>
  );
}
