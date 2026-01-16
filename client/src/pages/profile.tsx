import { useState, useEffect } from "react";
import AppLayout from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Shield, Bell, CreditCard, LogOut, ChevronRight, Moon, Globe, HelpCircle, Wallet, Link2, Unlink, Eye, EyeOff, RefreshCw, ExternalLink, Edit2, Check, X, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { getAuthToken } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function Profile() {
  const { user, logout, refreshUser } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [cryptoStatus, setCryptoStatus] = useState<any>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [showToken, setShowToken] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [newToken, setNewToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [resettingTutorial, setResettingTutorial] = useState(false);

  const getAuthHeaders = () => {
    const token = getAuthToken();
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };
  };

  useEffect(() => {
    fetchCryptoStatus();
  }, []);

  const fetchCryptoStatus = async () => {
    setStatusLoading(true);
    try {
      const response = await fetch("/api/crypto/status", { headers: getAuthHeaders() });
      const data = await response.json();
      setCryptoStatus(data);
    } catch (error) {
      console.error("Failed to fetch crypto status:", error);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleSaveToken = async () => {
    if (!newToken.trim()) {
      toast({ title: "Error", description: "Please enter a valid token", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/crypto/connect", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ telegramToken: newToken.trim() })
      });
      const data = await response.json();
      
      if (response.ok && data.success) {
        toast({ title: "Success", description: "Telegram token updated successfully" });
        setNewToken("");
        setIsEditing(false);
        await fetchCryptoStatus();
        try { await refreshUser(); } catch (e) { console.error("Failed to refresh user", e); }
      } else {
        toast({ title: "Error", description: data.message || "Failed to save token", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save token", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const response = await fetch("/api/crypto/connect", {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      
      if (response.ok) {
        toast({ title: "Disconnected", description: "Telegram wallet has been disconnected" });
        setCryptoStatus({ connected: false });
        try { await refreshUser(); } catch (e) { console.error("Failed to refresh user", e); }
      } else {
        const data = await response.json();
        toast({ title: "Error", description: data.message || "Failed to disconnect", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to disconnect", variant: "destructive" });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleResetTutorial = async () => {
    setResettingTutorial(true);
    try {
      const response = await fetch("/api/tutorials/reset", {
        method: "POST",
        headers: getAuthHeaders()
      });
      
      if (response.ok) {
        toast({ title: "Tutorial Reset", description: "The guided tour will appear on your next dashboard visit." });
      } else {
        toast({ title: "Error", description: "Failed to reset tutorial", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to reset tutorial", variant: "destructive" });
    } finally {
      setResettingTutorial(false);
    }
  };

  const maskedToken = (token: string) => {
    if (!token || token.length < 8) return "••••••••";
    return token.substring(0, 4) + "••••••••" + token.substring(token.length - 4);
  };

  return (
    <AppLayout>
       <header className="mb-6">
        <h1 className="text-2xl font-display font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences.</p>
      </header>

      <div className="space-y-6">
        {/* Profile Card */}
        <div className="p-6 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-white text-primary flex items-center justify-center text-2xl font-bold border-4 border-white/20">
            {user?.fullName?.substring(0, 2).toUpperCase() || "U"}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">{user?.fullName || "User"}</h2>
            <p className="text-primary-foreground/80 text-sm">{user?.email || ""}</p>
            <div className="flex items-center gap-2 mt-2">
               <span className="px-2 py-0.5 rounded-md bg-white/20 text-xs font-medium">{user?.kycStatus === "verified" ? "Verified" : "Unverified"}</span>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
            <ChevronRight className="h-6 w-6" />
          </Button>
        </div>

        {/* Settings Sections */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground ml-1">Account</h3>
          <div className="bg-card rounded-xl border border-border/50 overflow-hidden divide-y divide-border/50">
            <div className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer transition-colors">
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Personal Information</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer transition-colors">
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Payment Methods</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div 
              className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer transition-colors"
              onClick={() => navigate("/security")}
              data-testid="link-security-privacy"
            >
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Security & Privacy</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          <h3 className="text-sm font-medium text-muted-foreground ml-1 mt-6">Telegram PayGram Integration</h3>
          <div className="bg-card rounded-xl border border-border/50 overflow-hidden">
            {statusLoading ? (
              <div className="p-4 flex items-center justify-center">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : cryptoStatus?.connected ? (
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                      <Link2 className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium">Wallet Connected</p>
                      <p className="text-xs text-muted-foreground">UserCliId: {cryptoStatus.userCliId}</p>
                    </div>
                  </div>
                  <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">Active</span>
                </div>
                
                {isEditing ? (
                  <div className="space-y-3 pt-2 border-t">
                    <Label htmlFor="newToken">New Telegram Token</Label>
                    <Input
                      id="newToken"
                      type="password"
                      placeholder="Paste your new @opgmbot token"
                      value={newToken}
                      onChange={(e) => setNewToken(e.target.value)}
                      data-testid="input-new-telegram-token"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveToken} disabled={saving} data-testid="button-save-token">
                        {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        <span className="ml-1">Save</span>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setIsEditing(false); setNewToken(""); }} data-testid="button-cancel-edit">
                        <X className="h-4 w-4" />
                        <span className="ml-1">Cancel</span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-2 border-t">
                    <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} data-testid="button-edit-token">
                      <Edit2 className="h-4 w-4 mr-1" />
                      Update Token
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-destructive hover:text-destructive" 
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      data-testid="button-disconnect-wallet"
                    >
                      {disconnecting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4 mr-1" />}
                      Disconnect
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Wallet className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">No Wallet Connected</p>
                    <p className="text-xs text-muted-foreground">Connect your @opgmbot token to enable crypto</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
                    <p className="font-medium mb-1">How to get your token:</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-blue-700 text-xs">
                      <li>Open <a href="https://telegram.me/opgmbot" target="_blank" className="underline">@opgmbot</a> in Telegram</li>
                      <li>Send <code className="bg-blue-100 px-1 rounded">/api</code> to get your token</li>
                      <li>Copy and paste it below</li>
                    </ol>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="telegramToken">Telegram PayGram Token</Label>
                    <Input
                      id="telegramToken"
                      type="password"
                      placeholder="Paste your @opgmbot token"
                      value={newToken}
                      onChange={(e) => setNewToken(e.target.value)}
                      data-testid="input-telegram-token-settings"
                    />
                  </div>
                  
                  <Button onClick={handleSaveToken} disabled={saving || !newToken.trim()} className="w-full" data-testid="button-connect-token">
                    {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                    Connect Wallet
                  </Button>
                </div>
              </div>
            )}
          </div>

          <h3 className="text-sm font-medium text-muted-foreground ml-1 mt-6">Preferences</h3>
          <div className="bg-card rounded-xl border border-border/50 overflow-hidden divide-y divide-border/50">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Notifications</span>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Moon className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Dark Mode</span>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer transition-colors">
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Language</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-sm">English</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>
          </div>

           <h3 className="text-sm font-medium text-muted-foreground ml-1 mt-6">Support</h3>
          <div className="bg-card rounded-xl border border-border/50 overflow-hidden divide-y divide-border/50">
            <div className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer transition-colors">
              <div className="flex items-center gap-3">
                <HelpCircle className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Help Center</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div 
              className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer transition-colors"
              onClick={handleResetTutorial}
              data-testid="button-restart-tutorial"
            >
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-muted-foreground" />
                <div>
                  <span className="font-medium">Restart Tutorial</span>
                  <p className="text-xs text-muted-foreground">See the guided tour again</p>
                </div>
              </div>
              {resettingTutorial ? (
                <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>

          <Button variant="destructive" className="w-full mt-6 h-12 rounded-xl" onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" /> Sign Out
          </Button>

          <p className="text-center text-xs text-muted-foreground mt-4 pb-8">
            Payverse v1.0.2 • Built with ❤️
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
