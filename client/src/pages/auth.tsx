import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import payverseLogo from "@assets/payverse_logo.png";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    fullName: "",
    username: "",
  });
  const { login, register, user } = useAuth();
  const { toast } = useToast();
  const [_, setLocation] = useLocation();

  if (user) {
    setLocation("/");
    return null;
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        await login(formData.email, formData.password);
      } else {
        if (!formData.fullName || !formData.username) {
          toast({
            title: "Error",
            description: "Please fill in all fields",
            variant: "destructive",
          });
          return;
        }
        await register(formData);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Authentication failed",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#072E62' }}>
      {/* Left Panel - Visuals */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden" style={{ backgroundColor: '#072E62' }}>
        <div className="absolute inset-0 opacity-20">
          <svg className="w-full h-full" viewBox="0 0 800 600" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g opacity="0.3">
              {[...Array(20)].map((_, i) => (
                <polygon 
                  key={i}
                  points="50,0 100,25 100,75 50,100 0,75 0,25"
                  fill="none"
                  stroke="#0D6469"
                  strokeWidth="1"
                  transform={`translate(${(i % 5) * 180 + (Math.floor(i / 5) % 2) * 90}, ${Math.floor(i / 5) * 120})`}
                />
              ))}
            </g>
          </svg>
        </div>
        
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <img src={payverseLogo} alt="PayVerse" className="h-12 w-auto object-contain" />
          
          <div className="space-y-6 max-w-lg">
            <h1 className="text-5xl font-display font-bold text-white leading-tight">
              The Future of <br/>
              <span style={{ color: '#37A000' }}>Peer-to-Peer</span> <br/>
              Payments.
            </h1>
            <p className="text-lg text-white/70">
              Join millions of users who trust PayVerse for secure, instant, and borderless transactions.
            </p>
          </div>
          
          <div className="flex gap-2 text-sm text-white/50">
            <span>© 2024 PayVerse Inc.</span>
            <span>•</span>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <span>•</span>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8 animate-in slide-in-from-right-8 duration-700" style={{ backgroundColor: '#0D6469' }}>
        <div className="w-full max-w-md space-y-8 p-8 rounded-2xl" style={{ backgroundColor: '#0D6469' }}>
          <div className="text-center lg:text-left">
            <div className="lg:hidden flex justify-center mb-6">
              <img src={payverseLogo} alt="PayVerse" className="h-10 w-auto object-contain" />
            </div>
            <h2 className="text-3xl font-display font-bold tracking-tight text-white">
              {isLogin ? "Welcome back" : "Create an account"}
            </h2>
            <p className="text-white/80 mt-2">
              {isLogin ? "Please enter your credentials to login." : "Get started with your free secure e-wallet today."}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-5">
            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-white">Full Name</Label>
                  <Input 
                    id="fullName" 
                    type="text" 
                    placeholder="Juan dela Cruz" 
                    className="h-12 bg-white text-gray-700 border-0"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-white">Username</Label>
                  <Input 
                    id="username" 
                    type="text" 
                    placeholder="juandc" 
                    className="h-12 bg-white text-gray-700 border-0"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white">Email address</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="name@example.com" 
                className="h-12 bg-white text-gray-700 border-0"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="password" className="text-white">Password</Label>
                {isLogin && <a href="/forgot-password" className="text-xs text-white/80 font-medium hover:text-white" data-testid="link-forgot-password">Forgot Password?</a>}
              </div>
              <Input 
                id="password" 
                type="password" 
                placeholder="••••••••" 
                className="h-12 bg-white text-gray-700 border-0"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                minLength={6}
              />
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 text-base font-medium rounded-full transition-transform active:scale-[0.98]"
              style={{ backgroundColor: '#072E62' }}
              disabled={loading}
            >
              {loading ? "Please wait..." : (isLogin ? "LOG IN" : "SIGN UP")}
            </Button>
          </form>

          <p className="text-center text-sm text-white/80">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button onClick={() => setIsLogin(!isLogin)} className="font-semibold text-white hover:underline uppercase">
              {isLogin ? "SIGN UP" : "LOG IN"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
