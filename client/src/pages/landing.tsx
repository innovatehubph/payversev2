import { useEffect } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { ArrowRight, Wallet, Shield, Zap, Globe, Smartphone, CreditCard, Bitcoin, Send, ChevronDown } from "lucide-react";
import payverseLogo from "@assets/payverse_logo.png";
import { ChatFab } from "@/components/ai-chat";

const FloatingElement = ({ children, delay = 0, duration = 3, y = 20, x = 0 }: { 
  children: React.ReactNode; 
  delay?: number; 
  duration?: number;
  y?: number;
  x?: number;
}) => (
  <motion.div
    animate={{ 
      y: [0, -y, 0],
      x: [0, x, 0],
      rotateZ: [0, x > 0 ? 5 : -5, 0]
    }}
    transition={{ 
      duration,
      repeat: Infinity,
      delay,
      ease: "easeInOut"
    }}
  >
    {children}
  </motion.div>
);

const GlassCard = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl shadow-xl ${className}`}>
    {children}
  </div>
);

export default function Landing() {
  const { user } = useAuth();
  const [_, setLocation] = useLocation();
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.3], [1, 0.95]);

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (user) {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  // If user is logged in, don't render landing (will redirect)
  if (user) return null;

  const features = [
    { icon: Zap, title: "Instant Transfers", desc: "Send money in seconds, not days" },
    { icon: Shield, title: "Bank-Grade Security", desc: "Your funds are always protected" },
    { icon: Globe, title: "Global Access", desc: "Transfer anywhere, anytime" },
    { icon: Bitcoin, title: "Crypto Ready", desc: "Buy, sell, and hold crypto assets" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />
      </div>

      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="bg-slate-800/80 backdrop-blur-xl rounded-xl p-2 border border-white/10">
              <img src={payverseLogo} alt="PayVerse" className="h-8 w-auto" />
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <Link href="/auth">
              <Button variant="ghost" className="text-white hover:bg-white/10">
                Sign In
              </Button>
            </Link>
            <Link href="/auth">
              <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/30">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </nav>

      <motion.section 
        style={{ opacity: heroOpacity, scale: heroScale }}
        className="relative min-h-screen flex items-center justify-center px-6 pt-20"
      >
        <div className="absolute inset-0 hidden md:flex items-center justify-center overflow-hidden">
          <FloatingElement delay={0} y={30} x={-10}>
            <div className="absolute left-10 top-1/4">
              <GlassCard className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                    <Send className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-white/60">Sent</p>
                    <p className="text-white font-semibold">₱2,500.00</p>
                  </div>
                </div>
              </GlassCard>
            </div>
          </FloatingElement>

          <FloatingElement delay={0.5} y={25} x={15}>
            <div className="absolute right-10 lg:right-20 top-1/3">
              <GlassCard className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center">
                    <Bitcoin className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-white/60">PHPT Balance</p>
                    <p className="text-white font-semibold">12,450.00</p>
                  </div>
                </div>
              </GlassCard>
            </div>
          </FloatingElement>

          <FloatingElement delay={1} y={20} x={-5}>
            <div className="absolute left-10 lg:left-1/4 bottom-1/4">
              <GlassCard className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-white/60">Received</p>
                    <p className="text-white font-semibold">₱5,000.00</p>
                  </div>
                </div>
              </GlassCard>
            </div>
          </FloatingElement>

          <FloatingElement delay={1.5} y={35} x={10}>
            <div className="absolute right-10 lg:right-1/4 bottom-1/3">
              <GlassCard className="p-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center">
                    <Smartphone className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-white/80 text-sm">Mobile Ready</span>
                </div>
              </GlassCard>
            </div>
          </FloatingElement>
        </div>

        <div className="relative z-10 text-center max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 mb-8"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-sm text-white/80">Now with Crypto Integration</span>
            </motion.div>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">
              The Future of{" "}
              <span className="bg-gradient-to-r from-primary via-teal-400 to-blue-400 bg-clip-text text-transparent">
                Digital Payments
              </span>
            </h1>

            <p className="text-lg md:text-xl text-white/70 mb-10 max-w-2xl mx-auto">
              Send, receive, and manage your money with ease. Experience seamless P2P transfers and crypto trading in one beautiful app.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/auth">
                <Button size="lg" className="bg-primary hover:bg-primary/90 text-white px-8 py-6 text-lg shadow-xl shadow-primary/30 group">
                  Start for Free
                  <motion.span
                    animate={{ x: [0, 5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </motion.span>
                </Button>
              </Link>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-white/20 text-white hover:bg-white/10 px-8 py-6 text-lg backdrop-blur-sm"
              >
                <Wallet className="mr-2 h-5 w-5" />
                Learn More
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2"
          >
            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <ChevronDown className="h-8 w-8 text-white/40" />
            </motion.div>
          </motion.div>
        </div>
      </motion.section>

      <section className="relative py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Why Choose PayVerse?
            </h2>
            <p className="text-white/60 max-w-2xl mx-auto">
              Experience the next generation of digital payments with features designed for the modern world.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                whileHover={{ y: -5, scale: 1.02 }}
                className="group"
              >
                <GlassCard className="p-6 h-full transition-all duration-300 group-hover:border-primary/50 group-hover:bg-white/15">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-teal-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                  <p className="text-white/60 text-sm">{feature.desc}</p>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <GlassCard className="p-12">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Ready to Get Started?
              </h2>
              <p className="text-white/60 mb-8 max-w-xl mx-auto">
                Join thousands of users who trust PayVerse for their daily transactions.
              </p>
              <Link href="/auth">
                <Button size="lg" className="bg-primary hover:bg-primary/90 text-white px-12 py-6 text-lg shadow-xl shadow-primary/30">
                  Create Free Account
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </GlassCard>
          </motion.div>
        </div>
      </section>

      <footer className="relative py-12 px-6 border-t border-white/10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-slate-800 rounded-xl p-2">
              <img src={payverseLogo} alt="PayVerse" className="h-6 w-auto" />
            </div>
            <span className="text-white/60 text-sm">© 2024 PayVerse. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-white/60">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Support</a>
          </div>
        </div>
      </footer>

      {/* AI Chat FAB - available for guests too */}
      <ChatFab />
    </div>
  );
}
