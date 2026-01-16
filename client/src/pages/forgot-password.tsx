import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mail, KeyRound, CheckCircle } from "lucide-react";
import payverseLogo from "@assets/payverse_logo.png";

export default function ForgotPassword() {
  const [step, setStep] = useState<"email" | "otp" | "success">("email");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { toast } = useToast();
  const [_, setLocation] = useLocation();

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: "Error", description: "Please enter your email", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/security/password/reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (response.ok) {
        toast({ title: "Check your email", description: "We've sent a verification code to your email." });
        setStep("otp");
      } else {
        toast({ title: "Error", description: data.message || "Failed to send reset code", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (otp.length !== 6) {
      toast({ title: "Error", description: "Please enter the 6-digit code from your email", variant: "destructive" });
      return;
    }
    
    if (newPassword.length < 8) {
      toast({ title: "Error", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/security/password/reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, newPassword, confirmPassword }),
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setStep("success");
        toast({ title: "Success", description: "Your password has been reset successfully!" });
      } else {
        toast({ title: "Error", description: data.message || "Failed to reset password", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#0D6469' }}>
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <img src={payverseLogo} alt="PayVerse" className="h-12 w-auto mx-auto mb-6" />
          
          {step === "email" && (
            <>
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
                <Mail className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-2xl font-display font-bold text-white">Forgot Password?</h1>
              <p className="text-white/70 mt-2">Enter your email and we'll send you a code to reset your password.</p>
            </>
          )}
          
          {step === "otp" && (
            <>
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
                <KeyRound className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-2xl font-display font-bold text-white">Reset Password</h1>
              <p className="text-white/70 mt-2">Enter the code we sent to {email}</p>
            </>
          )}
          
          {step === "success" && (
            <>
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
              <h1 className="text-2xl font-display font-bold text-white">Password Reset!</h1>
              <p className="text-white/70 mt-2">Your password has been successfully reset. You can now login with your new password.</p>
            </>
          )}
        </div>

        {step === "email" && (
          <form onSubmit={handleRequestReset} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                className="h-12 bg-white text-gray-700 border-0"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="input-email"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-medium rounded-full"
              style={{ backgroundColor: '#072E62' }}
              disabled={loading}
              data-testid="button-send-code"
            >
              {loading ? "Sending..." : "Send Reset Code"}
            </Button>

            <button
              type="button"
              onClick={() => setLocation("/auth")}
              className="w-full flex items-center justify-center gap-2 text-white/80 hover:text-white transition-colors"
              data-testid="button-back-login"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Login
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleResetPassword} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="otp" className="text-white">Verification Code</Label>
              <Input
                id="otp"
                type="text"
                placeholder="Enter 6-digit code"
                className="h-12 bg-white text-gray-700 border-0 text-center text-xl tracking-widest"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                required
                data-testid="input-otp"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-white">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="Enter new password"
                className="h-12 bg-white text-gray-700 border-0"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
                data-testid="input-new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-white">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm new password"
                className="h-12 bg-white text-gray-700 border-0"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
                data-testid="input-confirm-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-medium rounded-full"
              style={{ backgroundColor: '#072E62' }}
              disabled={loading}
              data-testid="button-reset-password"
            >
              {loading ? "Resetting..." : "Reset Password"}
            </Button>

            <button
              type="button"
              onClick={() => setStep("email")}
              className="w-full flex items-center justify-center gap-2 text-white/80 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Use different email
            </button>
          </form>
        )}

        {step === "success" && (
          <Button
            onClick={() => setLocation("/auth")}
            className="w-full h-12 text-base font-medium rounded-full"
            style={{ backgroundColor: '#072E62' }}
            data-testid="button-go-login"
          >
            Go to Login
          </Button>
        )}
      </div>
    </div>
  );
}
