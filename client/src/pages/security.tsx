import { useState, useEffect } from "react";
import AppLayout from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Lock, Key, ChevronLeft, CheckCircle2, AlertCircle, Eye, EyeOff, RefreshCw, Mail } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getAuthToken } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export default function Security() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [securityStatus, setSecurityStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [setupPin, setSetupPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [settingUp, setSettingUp] = useState(false);
  
  const [showChangePin, setShowChangePin] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [changePinOtp, setChangePinOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [changingPin, setChangingPin] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  const getAuthHeaders = () => {
    const token = getAuthToken();
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };
  };

  useEffect(() => {
    fetchSecurityStatus();
  }, []);

  const fetchSecurityStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/security/status", { headers: getAuthHeaders() });
      const data = await response.json();
      setSecurityStatus(data);
    } catch (error) {
      console.error("Failed to fetch security status:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSetupPin = async () => {
    if (setupPin.length !== 6) {
      toast({ title: "Error", description: "PIN must be 6 digits", variant: "destructive" });
      return;
    }
    if (setupPin !== confirmPin) {
      toast({ title: "Error", description: "PINs do not match", variant: "destructive" });
      return;
    }
    
    setSettingUp(true);
    try {
      const response = await fetch("/api/security/pin/setup", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ pin: setupPin, confirmPin: confirmPin })
      });
      const data = await response.json();
      
      if (response.ok && data.success) {
        toast({ title: "Success", description: "PIN set up successfully" });
        setSetupPin("");
        setConfirmPin("");
        await fetchSecurityStatus();
        try { await refreshUser(); } catch (e) {}
      } else {
        toast({ title: "Error", description: data.message || "Failed to set up PIN", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to set up PIN", variant: "destructive" });
    } finally {
      setSettingUp(false);
    }
  };

  const handleRequestOtp = async () => {
    setSendingOtp(true);
    try {
      const response = await fetch("/api/security/pin/change/request-otp", {
        method: "POST",
        headers: getAuthHeaders()
      });
      const data = await response.json();
      
      if (response.ok && data.success) {
        toast({ title: "OTP Sent", description: "Check your email for the verification code" });
        setOtpSent(true);
      } else {
        toast({ title: "Error", description: data.message || "Failed to send OTP", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to send OTP", variant: "destructive" });
    } finally {
      setSendingOtp(false);
    }
  };

  const handleChangePin = async () => {
    if (currentPin.length !== 6) {
      toast({ title: "Error", description: "Current PIN must be 6 digits", variant: "destructive" });
      return;
    }
    if (newPin.length !== 6) {
      toast({ title: "Error", description: "New PIN must be 6 digits", variant: "destructive" });
      return;
    }
    if (newPin !== confirmNewPin) {
      toast({ title: "Error", description: "New PINs do not match", variant: "destructive" });
      return;
    }
    if (changePinOtp.length !== 6) {
      toast({ title: "Error", description: "Please enter the 6-digit OTP from your email", variant: "destructive" });
      return;
    }
    
    setChangingPin(true);
    try {
      const response = await fetch("/api/security/pin/change", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ 
          currentPin, 
          newPin, 
          otp: changePinOtp 
        })
      });
      const data = await response.json();
      
      if (response.ok && data.success) {
        toast({ title: "Success", description: "PIN changed successfully" });
        setShowChangePin(false);
        setCurrentPin("");
        setNewPin("");
        setConfirmNewPin("");
        setChangePinOtp("");
        setOtpSent(false);
        await fetchSecurityStatus();
      } else {
        toast({ title: "Error", description: data.message || "Failed to change PIN", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to change PIN", variant: "destructive" });
    } finally {
      setChangingPin(false);
    }
  };

  return (
    <AppLayout>
      <header className="mb-6">
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate("/profile")}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to Settings
        </Button>
        <h1 className="text-2xl font-display font-bold">Security</h1>
        <p className="text-muted-foreground">Manage your account security settings.</p>
      </header>

      <div className="space-y-6 pb-20">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${securityStatus?.hasPinSet ? 'bg-green-100' : 'bg-amber-100'}`}>
                    {securityStatus?.hasPinSet ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-lg">Transaction PIN</CardTitle>
                    <CardDescription>
                      {securityStatus?.hasPinSet 
                        ? "Your PIN is set up and protecting your transactions" 
                        : "Set up a PIN to secure large transfers"}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {securityStatus?.isLocked && (
                  <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
                    <p className="font-medium">PIN Locked</p>
                    <p className="text-red-600 text-xs mt-1">Too many failed attempts. Please wait before trying again.</p>
                  </div>
                )}
                
                {!securityStatus?.hasPinSet ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
                      <p className="font-medium mb-1">Why set up a PIN?</p>
                      <ul className="list-disc list-inside text-blue-700 text-xs space-y-0.5">
                        <li>Required for transfers of 5,000 PHPT or more</li>
                        <li>Adds an extra layer of security</li>
                        <li>Protects your funds from unauthorized access</li>
                      </ul>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Enter 6-digit PIN</Label>
                        <InputOTP maxLength={6} value={setupPin} onChange={setSetupPin} data-testid="input-setup-pin">
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
                      
                      <div className="space-y-2">
                        <Label>Confirm PIN</Label>
                        <InputOTP maxLength={6} value={confirmPin} onChange={setConfirmPin} data-testid="input-confirm-pin">
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
                      
                      <Button 
                        onClick={handleSetupPin} 
                        disabled={settingUp || setupPin.length !== 6 || confirmPin.length !== 6}
                        className="w-full"
                        data-testid="button-setup-pin"
                      >
                        {settingUp ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
                        Set Up PIN
                      </Button>
                    </div>
                  </div>
                ) : showChangePin ? (
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Current PIN</Label>
                        <InputOTP maxLength={6} value={currentPin} onChange={setCurrentPin} data-testid="input-current-pin">
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
                      
                      <div className="space-y-2">
                        <Label>New PIN</Label>
                        <InputOTP maxLength={6} value={newPin} onChange={setNewPin} data-testid="input-new-pin">
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
                      
                      <div className="space-y-2">
                        <Label>Confirm New PIN</Label>
                        <InputOTP maxLength={6} value={confirmNewPin} onChange={setConfirmNewPin} data-testid="input-confirm-new-pin">
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
                      
                      {!otpSent ? (
                        <Button 
                          onClick={handleRequestOtp} 
                          disabled={sendingOtp || currentPin.length !== 6 || newPin.length !== 6 || confirmNewPin.length !== 6}
                          className="w-full"
                          variant="outline"
                          data-testid="button-request-otp"
                        >
                          {sendingOtp ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                          Send Verification Code
                        </Button>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <Label>Email Verification Code</Label>
                            <InputOTP maxLength={6} value={changePinOtp} onChange={setChangePinOtp} data-testid="input-change-pin-otp">
                              <InputOTPGroup>
                                <InputOTPSlot index={0} />
                                <InputOTPSlot index={1} />
                                <InputOTPSlot index={2} />
                                <InputOTPSlot index={3} />
                                <InputOTPSlot index={4} />
                                <InputOTPSlot index={5} />
                              </InputOTPGroup>
                            </InputOTP>
                            <p className="text-xs text-muted-foreground">Check your email for the verification code</p>
                          </div>
                          
                          <Button 
                            onClick={handleChangePin} 
                            disabled={changingPin || changePinOtp.length !== 6}
                            className="w-full"
                            data-testid="button-change-pin"
                          >
                            {changingPin ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
                            Change PIN
                          </Button>
                        </>
                      )}
                      
                      <Button 
                        variant="ghost" 
                        onClick={() => {
                          setShowChangePin(false);
                          setCurrentPin("");
                          setNewPin("");
                          setConfirmNewPin("");
                          setChangePinOtp("");
                          setOtpSent(false);
                        }}
                        className="w-full"
                        data-testid="button-cancel-change-pin"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <span className="text-green-800 font-medium">PIN Active</span>
                      </div>
                      {securityStatus?.pinUpdatedAt && (
                        <span className="text-green-600 text-xs">
                          Updated {new Date(securityStatus.pinUpdatedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    
                    <Button 
                      variant="outline" 
                      onClick={() => setShowChangePin(true)}
                      className="w-full"
                      data-testid="button-show-change-pin"
                    >
                      <Key className="h-4 w-4 mr-2" />
                      Change PIN
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Account Verification</CardTitle>
                    <CardDescription>Your KYC verification status</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className={`flex items-center justify-between p-3 rounded-lg border ${
                  securityStatus?.kycStatus === 'verified' 
                    ? 'bg-green-50 border-green-200' 
                    : securityStatus?.kycStatus === 'pending'
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center gap-2">
                    {securityStatus?.kycStatus === 'verified' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                    )}
                    <span className={`font-medium ${
                      securityStatus?.kycStatus === 'verified' 
                        ? 'text-green-800' 
                        : securityStatus?.kycStatus === 'pending'
                        ? 'text-amber-800'
                        : 'text-gray-800'
                    }`}>
                      {securityStatus?.kycStatus === 'verified' 
                        ? 'Verified' 
                        : securityStatus?.kycStatus === 'pending'
                        ? 'Pending Review'
                        : 'Not Verified'}
                    </span>
                  </div>
                </div>
                
                {securityStatus?.kycStatus !== 'verified' && (
                  <Button 
                    variant="outline" 
                    className="w-full mt-4"
                    onClick={() => navigate("/kyc")}
                    data-testid="button-verify-identity"
                  >
                    Verify Your Identity
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Security Tips</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Never share your PIN or password with anyone</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Use a unique PIN that's hard to guess</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>PayVerse will never ask for your PIN via email or phone</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Report suspicious activity immediately</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
