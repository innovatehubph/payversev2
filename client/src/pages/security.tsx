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

  // Forgot PIN state
  const [showForgotPin, setShowForgotPin] = useState(false);
  const [forgotPinOtp, setForgotPinOtp] = useState("");
  const [forgotPinNewPin, setForgotPinNewPin] = useState("");
  const [forgotPinConfirmPin, setForgotPinConfirmPin] = useState("");
  const [forgotPinOtpSent, setForgotPinOtpSent] = useState(false);
  const [forgotPinSendingOtp, setForgotPinSendingOtp] = useState(false);
  const [forgotPinResetting, setForgotPinResetting] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState("");

  // Change Password state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changePasswordOtp, setChangePasswordOtp] = useState("");
  const [changePasswordOtpSent, setChangePasswordOtpSent] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [sendingPasswordOtp, setSendingPasswordOtp] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

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

  // Forgot PIN handlers
  const handleForgotPinRequestOtp = async () => {
    setForgotPinSendingOtp(true);
    try {
      const response = await fetch("/api/security/pin/reset/request", {
        method: "POST",
        headers: getAuthHeaders()
      });
      const data = await response.json();

      if (response.ok && data.success) {
        toast({ title: "OTP Sent", description: "Check your email for the verification code" });
        setForgotPinOtpSent(true);
        setMaskedEmail(data.email || "your email");
      } else {
        toast({ title: "Error", description: data.message || "Failed to send OTP", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to send OTP", variant: "destructive" });
    } finally {
      setForgotPinSendingOtp(false);
    }
  };

  const handleForgotPinReset = async () => {
    if (forgotPinNewPin.length !== 6) {
      toast({ title: "Error", description: "New PIN must be 6 digits", variant: "destructive" });
      return;
    }
    if (forgotPinNewPin !== forgotPinConfirmPin) {
      toast({ title: "Error", description: "PINs do not match", variant: "destructive" });
      return;
    }
    if (forgotPinOtp.length !== 6) {
      toast({ title: "Error", description: "Please enter the 6-digit verification code", variant: "destructive" });
      return;
    }

    setForgotPinResetting(true);
    try {
      const response = await fetch("/api/security/pin/reset/confirm", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          otp: forgotPinOtp,
          newPin: forgotPinNewPin
        })
      });
      const data = await response.json();

      if (response.ok && data.success) {
        toast({ title: "Success", description: "PIN reset successfully" });
        // Reset all forgot PIN state
        setShowForgotPin(false);
        setForgotPinOtp("");
        setForgotPinNewPin("");
        setForgotPinConfirmPin("");
        setForgotPinOtpSent(false);
        setMaskedEmail("");
        await fetchSecurityStatus();
      } else {
        toast({ title: "Error", description: data.message || "Failed to reset PIN", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to reset PIN", variant: "destructive" });
    } finally {
      setForgotPinResetting(false);
    }
  };

  const handleCancelForgotPin = () => {
    setShowForgotPin(false);
    setForgotPinOtp("");
    setForgotPinNewPin("");
    setForgotPinConfirmPin("");
    setForgotPinOtpSent(false);
    setMaskedEmail("");
  };

  // Change Password handlers
  const handleRequestPasswordOtp = async () => {
    setSendingPasswordOtp(true);
    try {
      const response = await fetch("/api/security/password/change/request-otp", {
        method: "POST",
        headers: getAuthHeaders()
      });
      const data = await response.json();

      if (response.ok && data.success) {
        toast({ title: "OTP Sent", description: "Check your email for the verification code" });
        setChangePasswordOtpSent(true);
      } else {
        toast({ title: "Error", description: data.message || "Failed to send OTP", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to send OTP", variant: "destructive" });
    } finally {
      setSendingPasswordOtp(false);
    }
  };

  const handleChangePassword = async () => {
    if (currentPassword.length < 6) {
      toast({ title: "Error", description: "Please enter your current password", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Error", description: "New password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({ title: "Error", description: "New passwords do not match", variant: "destructive" });
      return;
    }
    if (changePasswordOtp.length !== 6) {
      toast({ title: "Error", description: "Please enter the 6-digit OTP from your email", variant: "destructive" });
      return;
    }

    setChangingPassword(true);
    try {
      const response = await fetch("/api/security/password/change", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword: confirmNewPassword,
          otp: changePasswordOtp
        })
      });
      const data = await response.json();

      if (response.ok && data.success) {
        toast({ title: "Success", description: "Password changed successfully" });
        setShowChangePassword(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
        setChangePasswordOtp("");
        setChangePasswordOtpSent(false);
      } else {
        toast({ title: "Error", description: data.message || "Failed to change password", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to change password", variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleCancelChangePassword = () => {
    setShowChangePassword(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setChangePasswordOtp("");
    setChangePasswordOtpSent(false);
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
                            <InputOTPSlot index={0} mask />
                            <InputOTPSlot index={1} mask />
                            <InputOTPSlot index={2} mask />
                            <InputOTPSlot index={3} mask />
                            <InputOTPSlot index={4} mask />
                            <InputOTPSlot index={5} mask />
                          </InputOTPGroup>
                        </InputOTP>
                      </div>

                      <div className="space-y-2">
                        <Label>Confirm PIN</Label>
                        <InputOTP maxLength={6} value={confirmPin} onChange={setConfirmPin} data-testid="input-confirm-pin">
                          <InputOTPGroup>
                            <InputOTPSlot index={0} mask />
                            <InputOTPSlot index={1} mask />
                            <InputOTPSlot index={2} mask />
                            <InputOTPSlot index={3} mask />
                            <InputOTPSlot index={4} mask />
                            <InputOTPSlot index={5} mask />
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
                            <InputOTPSlot index={0} mask />
                            <InputOTPSlot index={1} mask />
                            <InputOTPSlot index={2} mask />
                            <InputOTPSlot index={3} mask />
                            <InputOTPSlot index={4} mask />
                            <InputOTPSlot index={5} mask />
                          </InputOTPGroup>
                        </InputOTP>
                      </div>

                      <div className="space-y-2">
                        <Label>New PIN</Label>
                        <InputOTP maxLength={6} value={newPin} onChange={setNewPin} data-testid="input-new-pin">
                          <InputOTPGroup>
                            <InputOTPSlot index={0} mask />
                            <InputOTPSlot index={1} mask />
                            <InputOTPSlot index={2} mask />
                            <InputOTPSlot index={3} mask />
                            <InputOTPSlot index={4} mask />
                            <InputOTPSlot index={5} mask />
                          </InputOTPGroup>
                        </InputOTP>
                      </div>

                      <div className="space-y-2">
                        <Label>Confirm New PIN</Label>
                        <InputOTP maxLength={6} value={confirmNewPin} onChange={setConfirmNewPin} data-testid="input-confirm-new-pin">
                          <InputOTPGroup>
                            <InputOTPSlot index={0} mask />
                            <InputOTPSlot index={1} mask />
                            <InputOTPSlot index={2} mask />
                            <InputOTPSlot index={3} mask />
                            <InputOTPSlot index={4} mask />
                            <InputOTPSlot index={5} mask />
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
                ) : showForgotPin ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Mail className="h-5 w-5 text-blue-600" />
                        <span className="text-blue-800 font-medium">Reset PIN via Email</span>
                      </div>
                      <p className="text-sm text-blue-700">
                        We'll send a verification code to your registered email address.
                      </p>
                    </div>

                    {!forgotPinOtpSent ? (
                      <Button
                        onClick={handleForgotPinRequestOtp}
                        disabled={forgotPinSendingOtp}
                        className="w-full"
                        data-testid="button-forgot-pin-send-otp"
                      >
                        {forgotPinSendingOtp ? (
                          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Mail className="h-4 w-4 mr-2" />
                        )}
                        Send Verification Code
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-center text-muted-foreground">
                          Code sent to <strong>{maskedEmail}</strong>
                        </p>

                        <div className="space-y-2">
                          <Label>Verification Code</Label>
                          <InputOTP maxLength={6} value={forgotPinOtp} onChange={setForgotPinOtp} data-testid="input-forgot-pin-otp">
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
                          <InputOTP maxLength={6} value={forgotPinNewPin} onChange={setForgotPinNewPin} data-testid="input-forgot-pin-new">
                            <InputOTPGroup>
                              <InputOTPSlot index={0} mask />
                              <InputOTPSlot index={1} mask />
                              <InputOTPSlot index={2} mask />
                              <InputOTPSlot index={3} mask />
                              <InputOTPSlot index={4} mask />
                              <InputOTPSlot index={5} mask />
                            </InputOTPGroup>
                          </InputOTP>
                        </div>

                        <div className="space-y-2">
                          <Label>Confirm New PIN</Label>
                          <InputOTP maxLength={6} value={forgotPinConfirmPin} onChange={setForgotPinConfirmPin} data-testid="input-forgot-pin-confirm">
                            <InputOTPGroup>
                              <InputOTPSlot index={0} mask />
                              <InputOTPSlot index={1} mask />
                              <InputOTPSlot index={2} mask />
                              <InputOTPSlot index={3} mask />
                              <InputOTPSlot index={4} mask />
                              <InputOTPSlot index={5} mask />
                            </InputOTPGroup>
                          </InputOTP>
                        </div>

                        <Button
                          onClick={handleForgotPinReset}
                          disabled={forgotPinResetting || forgotPinOtp.length !== 6 || forgotPinNewPin.length !== 6 || forgotPinConfirmPin.length !== 6}
                          className="w-full"
                          data-testid="button-forgot-pin-reset"
                        >
                          {forgotPinResetting ? (
                            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Lock className="h-4 w-4 mr-2" />
                          )}
                          Reset PIN
                        </Button>
                      </div>
                    )}

                    <Button
                      variant="ghost"
                      onClick={handleCancelForgotPin}
                      className="w-full"
                      data-testid="button-cancel-forgot-pin"
                    >
                      Cancel
                    </Button>
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

                    <Button
                      variant="link"
                      onClick={() => setShowForgotPin(true)}
                      className="w-full text-sm"
                      data-testid="button-show-forgot-pin"
                    >
                      Forgot PIN?
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Change Password Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <Lock className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Password</CardTitle>
                    <CardDescription>Change your account password</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {showChangePassword ? (
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Current Password</Label>
                        <div className="relative">
                          <Input
                            type={showCurrentPassword ? "text" : "password"}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="Enter current password"
                            className="pr-10"
                            data-testid="input-current-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                            tabIndex={-1}
                          >
                            {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>New Password</Label>
                        <div className="relative">
                          <Input
                            type={showNewPassword ? "text" : "password"}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Enter new password (min 8 characters)"
                            className="pr-10"
                            data-testid="input-new-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                            tabIndex={-1}
                          >
                            {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Confirm New Password</Label>
                        <Input
                          type="password"
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          placeholder="Confirm new password"
                          data-testid="input-confirm-new-password"
                        />
                      </div>

                      {!changePasswordOtpSent ? (
                        <Button
                          onClick={handleRequestPasswordOtp}
                          disabled={sendingPasswordOtp || currentPassword.length < 6 || newPassword.length < 8 || newPassword !== confirmNewPassword}
                          className="w-full"
                          variant="outline"
                          data-testid="button-request-password-otp"
                        >
                          {sendingPasswordOtp ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                          Send Verification Code
                        </Button>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <Label>Email Verification Code</Label>
                            <InputOTP maxLength={6} value={changePasswordOtp} onChange={setChangePasswordOtp} data-testid="input-change-password-otp">
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
                            onClick={handleChangePassword}
                            disabled={changingPassword || changePasswordOtp.length !== 6}
                            className="w-full"
                            data-testid="button-change-password"
                          >
                            {changingPassword ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
                            Change Password
                          </Button>
                        </>
                      )}

                      <Button
                        variant="ghost"
                        onClick={handleCancelChangePassword}
                        className="w-full"
                        data-testid="button-cancel-change-password"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setShowChangePassword(true)}
                    className="w-full"
                    data-testid="button-show-change-password"
                  >
                    <Key className="h-4 w-4 mr-2" />
                    Change Password
                  </Button>
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
