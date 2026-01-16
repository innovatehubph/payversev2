import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Gamepad2,
  ArrowLeft,
  User,
  Users,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Shield,
  Mail,
  ChevronRight,
  Loader2,
  LinkIcon,
  Unlink
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { getAuthToken } from "@/lib/api";
import { cn } from "@/lib/utils";

type AccountType = "player" | "agent";
type Step = "select_type" | "enter_username" | "verify_otp" | "connected";

interface CasinoStatus {
  connected: boolean;
  username?: string;
  assignedAgent?: string;
  isAgent?: boolean;
  balance?: number;
  demoMode?: boolean;
}

interface ValidationResult {
  valid: boolean;
  username?: string;
  agent?: string;
  clientId?: string;
  message?: string;
}

export default function CasinoConnect() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  const [step, setStep] = useState<Step>("select_type");
  const [accountType, setAccountType] = useState<AccountType>("player");
  const [username, setUsername] = useState("");
  const [otp, setOtp] = useState("");
  
  const [status, setStatus] = useState<CasinoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  const getAuthHeaders = () => {
    const token = getAuthToken();
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/casino/balance", { headers: getAuthHeaders() });
      const data = await response.json();
      setStatus(data);
      
      if (data.connected) {
        setStep("connected");
      }
    } catch (error) {
      console.error("Failed to fetch casino status:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleValidateUsername = async () => {
    if (!username.trim()) {
      toast({ title: "Error", description: "Please enter your 747 username", variant: "destructive" });
      return;
    }

    setValidating(true);
    setValidationResult(null);
    
    try {
      const response = await fetch("/api/casino/validate", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          username: username.trim(),
          isAgent: accountType === "agent"
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.valid) {
        setValidationResult({
          valid: true,
          username: data.username,
          agent: data.agent,
          clientId: data.clientId
        });
        toast({ title: "Account Found", description: `Your account is under agent: ${data.agent}` });
      } else {
        setValidationResult({
          valid: false,
          message: data.message || "Username not found or not under Team Marc network"
        });
        toast({ 
          title: "Validation Failed", 
          description: data.message || "Your account must be under Team Marc network (marcthepogi, teammarc, or bossmarc747)", 
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to validate username", variant: "destructive" });
    } finally {
      setValidating(false);
    }
  };

  const handleSendOtp = async () => {
    if (!validationResult?.valid) {
      toast({ title: "Error", description: "Please validate your username first", variant: "destructive" });
      return;
    }

    setSendingOtp(true);
    
    try {
      const response = await fetch("/api/casino/send-otp", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          username: validationResult.username,
          isAgent: accountType === "agent"
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setStep("verify_otp");
        toast({ title: "OTP Sent", description: "Check your 747 account messages for the verification code" });
      } else {
        toast({ 
          title: "Failed to Send OTP", 
          description: data.message || "Could not send verification code", 
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to send OTP", variant: "destructive" });
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      toast({ title: "Error", description: "Please enter the 6-digit OTP", variant: "destructive" });
      return;
    }

    setVerifying(true);
    
    try {
      const response = await fetch("/api/casino/verify-otp", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          username: validationResult?.username,
          isAgent: accountType === "agent",
          otp: otp
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        toast({ title: "Success", description: "Your 747 account is now connected!" });
        await fetchStatus();
        setStep("connected");
      } else {
        toast({ 
          title: "Verification Failed", 
          description: data.message || "Invalid or expired OTP", 
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to verify OTP", variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    
    try {
      const response = await fetch("/api/casino/disconnect", {
        method: "POST",
        headers: getAuthHeaders()
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        toast({ title: "Disconnected", description: "Your 747 account has been unlinked" });
        setStatus(null);
        setStep("select_type");
        setUsername("");
        setOtp("");
        setValidationResult(null);
      } else {
        toast({ title: "Error", description: data.message || "Failed to disconnect", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to disconnect", variant: "destructive" });
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center py-24">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto space-y-6">
        <header className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/services")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <Gamepad2 className="h-6 w-6 text-rose-500" />
              747 Connect
            </h1>
            <p className="text-sm text-muted-foreground">Link your 747Live casino account</p>
          </div>
        </header>

        {step === "connected" && status?.connected ? (
          <Card className="border-green-500/30 bg-gradient-to-br from-green-50/50 to-emerald-50/30 dark:from-green-950/20 dark:to-emerald-950/10">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <CardTitle className="text-lg text-green-700 dark:text-green-400">Account Connected</CardTitle>
                  <CardDescription>Your 747Live account is linked</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-white/60 dark:bg-gray-900/40 border space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Username</span>
                  <span className="font-semibold">{status.username}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Account Type</span>
                  <Badge variant="outline">{status.isAgent ? "Agent" : "Player"}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Agent Network</span>
                  <span className="font-medium text-rose-600">{status.assignedAgent}</span>
                </div>
                {status.balance !== undefined && status.balance !== null && (
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Casino Balance</span>
                    <span className="font-bold text-lg">₱{status.balance.toLocaleString()}</span>
                  </div>
                )}
              </div>
              
              {status.demoMode && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                  <AlertCircle className="h-4 w-4 inline mr-2" />
                  Demo mode - real casino API not connected
                </div>
              )}
              
              <div className="flex gap-3">
                <Button 
                  className="flex-1 bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600"
                  onClick={() => navigate("/services")}
                  data-testid="button-use-casino"
                >
                  <Gamepad2 className="mr-2 h-4 w-4" />
                  Use Casino
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  data-testid="button-disconnect"
                >
                  {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {step === "select_type" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span className="h-6 w-6 rounded-full bg-primary text-white text-sm flex items-center justify-center">1</span>
                    Select Account Type
                  </CardTitle>
                  <CardDescription>Choose your 747Live account type</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <RadioGroup value={accountType} onValueChange={(v) => setAccountType(v as AccountType)}>
                    <div 
                      className={cn(
                        "flex items-center space-x-4 p-4 rounded-lg border-2 cursor-pointer transition-all",
                        accountType === "player" ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50"
                      )}
                      onClick={() => setAccountType("player")}
                    >
                      <RadioGroupItem value="player" id="player" />
                      <div className="p-2 rounded-full bg-blue-100">
                        <User className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <Label htmlFor="player" className="font-semibold cursor-pointer">Player Account</Label>
                        <p className="text-sm text-muted-foreground">I play games on 747Live</p>
                      </div>
                    </div>
                    
                    <div 
                      className={cn(
                        "flex items-center space-x-4 p-4 rounded-lg border-2 cursor-pointer transition-all",
                        accountType === "agent" ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50"
                      )}
                      onClick={() => setAccountType("agent")}
                    >
                      <RadioGroupItem value="agent" id="agent" />
                      <div className="p-2 rounded-full bg-purple-100">
                        <Users className="h-5 w-5 text-purple-600" />
                      </div>
                      <div className="flex-1">
                        <Label htmlFor="agent" className="font-semibold cursor-pointer">Agent Account</Label>
                        <p className="text-sm text-muted-foreground">I'm a 747Live agent/sub-agent</p>
                      </div>
                    </div>
                  </RadioGroup>
                  
                  <Button 
                    onClick={() => setStep("enter_username")} 
                    className="w-full"
                    data-testid="button-continue-type"
                  >
                    Continue <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            )}

            {step === "enter_username" && (
              <Card>
                <CardHeader>
                  <Button variant="ghost" size="sm" className="-ml-2 mb-2 w-fit" onClick={() => { setStep("select_type"); setValidationResult(null); }}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span className="h-6 w-6 rounded-full bg-primary text-white text-sm flex items-center justify-center">2</span>
                    Enter Your Username
                  </CardTitle>
                  <CardDescription>Enter your 747Live {accountType} username</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">747 Username</Label>
                    <Input
                      id="username"
                      placeholder={`Enter your ${accountType} username`}
                      value={username}
                      onChange={(e) => { setUsername(e.target.value); setValidationResult(null); }}
                      className="h-12"
                      data-testid="input-username"
                    />
                  </div>
                  
                  {validationResult && (
                    <div className={cn(
                      "p-4 rounded-lg border",
                      validationResult.valid 
                        ? "bg-green-50 border-green-200 text-green-800" 
                        : "bg-red-50 border-red-200 text-red-800"
                    )}>
                      {validationResult.valid ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5" />
                            <span className="font-medium">Account Verified</span>
                          </div>
                          <p className="text-sm">
                            Username: <strong>{validationResult.username}</strong><br />
                            Under Agent: <strong>{validationResult.agent}</strong>
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-5 w-5 mt-0.5" />
                          <div>
                            <span className="font-medium">Validation Failed</span>
                            <p className="text-sm mt-1">{validationResult.message}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm">
                    <Shield className="h-4 w-4 inline mr-2" />
                    Your account must be under Team Marc network to use PayVerse casino features.
                  </div>
                  
                  {!validationResult?.valid ? (
                    <Button 
                      onClick={handleValidateUsername}
                      disabled={validating || !username.trim()}
                      className="w-full"
                      data-testid="button-validate"
                    >
                      {validating ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Validating...</>
                      ) : (
                        <>Validate Username</>
                      )}
                    </Button>
                  ) : (
                    <Button 
                      onClick={handleSendOtp}
                      disabled={sendingOtp}
                      className="w-full bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600"
                      data-testid="button-send-otp"
                    >
                      {sendingOtp ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending OTP...</>
                      ) : (
                        <><Mail className="mr-2 h-4 w-4" /> Send Verification Code</>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {step === "verify_otp" && (
              <Card>
                <CardHeader>
                  <Button variant="ghost" size="sm" className="-ml-2 mb-2 w-fit" onClick={() => { setStep("enter_username"); setOtp(""); }}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span className="h-6 w-6 rounded-full bg-primary text-white text-sm flex items-center justify-center">3</span>
                    Verify Your Account
                  </CardTitle>
                  <CardDescription>Enter the 6-digit code sent to your 747 account</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                    <Mail className="h-4 w-4 inline mr-2" />
                    Check your 747Live account messages for the verification code.
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Verification Code</Label>
                    <div className="flex justify-center py-4">
                      <InputOTP maxLength={6} value={otp} onChange={setOtp} data-testid="input-otp">
                        <InputOTPGroup>
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                  </div>
                  
                  <Button 
                    onClick={handleVerifyOtp}
                    disabled={verifying || otp.length !== 6}
                    className="w-full bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600"
                    data-testid="button-verify-otp"
                  >
                    {verifying ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...</>
                    ) : (
                      <><LinkIcon className="mr-2 h-4 w-4" /> Connect Account</>
                    )}
                  </Button>
                  
                  <Button 
                    variant="ghost"
                    onClick={handleSendOtp}
                    disabled={sendingOtp}
                    className="w-full"
                    data-testid="button-resend-otp"
                  >
                    {sendingOtp ? "Sending..." : "Resend Code"}
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}

        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              How it works
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>1. Select your account type (Player or Agent)</li>
              <li>2. Enter your 747Live username</li>
              <li>3. We verify you're under Team Marc network</li>
              <li>4. Confirm with OTP sent to your 747 account</li>
              <li>5. Instantly deposit & withdraw using PHPT</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
