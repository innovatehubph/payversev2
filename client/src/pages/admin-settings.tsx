import { useState, useEffect } from "react";
import AppLayout from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft,
  Key,
  Shield,
  Wallet,
  Users,
  Settings,
  Save,
  Eye,
  EyeOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Server,
  Mail,
  QrCode,
  Home,
  Bot,
  MessageSquare,
  Sparkles,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getAuthToken } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface SystemSetting {
  id: number;
  key: string;
  value: string;
  category: string;
  description: string | null;
  isEncrypted: boolean;
  isActive: boolean;
  hasValue: boolean;
  updatedAt: string;
}

interface EscrowAgent {
  id: number;
  agentUsername: string;
  agentType: string;
  isActive: boolean;
  dailyLimit: string | null;
  totalProcessed: string;
  lastActivityAt: string | null;
}

const CATEGORY_ICONS: Record<string, any> = {
  paygram: Wallet,
  casino: Server,
  nexuspay: QrCode,
  escrow: Shield,
  system: Settings,
  email: Mail,
  sms: MessageSquare,
  ai: Bot,
  general: Key,
};

const CATEGORY_LABELS: Record<string, string> = {
  paygram: "PayGram API",
  casino: "Casino (747Live)",
  nexuspay: "NexusPay (QRPH)",
  escrow: "Escrow Settings",
  system: "System Settings",
  email: "Email (SMTP)",
  sms: "SMS (PhilSMS)",
  ai: "AI Assistant",
  general: "General",
};

export default function AdminSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, SystemSetting[]>>({});
  const [escrowAgents, setEscrowAgents] = useState<EscrowAgent[]>([]);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState("paygram");
  const [testingApi, setTestingApi] = useState<string | null>(null);

  const getAuthHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${getAuthToken()}`,
  });

  useEffect(() => {
    if (user?.role !== "super_admin") {
      navigate("/admin");
      return;
    }
    fetchSettings();
    fetchEscrowAgents();
  }, [user]);

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/admin/settings", { headers: getAuthHeaders() });
      const data = await response.json();
      if (response.ok) {
        setSettings(data.settings);

        // Pre-populate edit values with current values (for non-encrypted fields)
        const initialValues: Record<string, string> = {};
        Object.values(data.settings).flat().forEach((setting: any) => {
          if (!setting.isEncrypted && setting.value) {
            initialValues[setting.key] = setting.value;
          }
        });
        setEditValues(initialValues);
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEscrowAgents = async () => {
    try {
      const response = await fetch("/api/admin/escrow-agents", { headers: getAuthHeaders() });
      const data = await response.json();
      if (response.ok) {
        setEscrowAgents(data.agents);
      }
    } catch (error) {
      console.error("Failed to fetch escrow agents:", error);
    }
  };

  const handleSaveSetting = async (key: string) => {
    const value = editValues[key];
    if (value === undefined) return;

    setSaving(key);
    try {
      const response = await fetch(`/api/admin/settings/${key}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ value }),
      });

      if (response.ok) {
        toast({ title: "Success", description: `${key} updated successfully` });
        setEditValues((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
        await fetchSettings();
      } else {
        const data = await response.json();
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save setting", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const handleToggleSetting = async (key: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/admin/settings/${key}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ isActive }),
      });

      if (response.ok) {
        toast({ title: "Success", description: `${key} ${isActive ? "enabled" : "disabled"}` });
        await fetchSettings();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to update setting", variant: "destructive" });
    }
  };

  const handleToggleAgent = async (id: number, isActive: boolean) => {
    try {
      const response = await fetch(`/api/admin/escrow-agents/${id}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ isActive }),
      });

      if (response.ok) {
        toast({ title: "Success", description: `Agent ${isActive ? "enabled" : "disabled"}` });
        await fetchEscrowAgents();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to update agent", variant: "destructive" });
    }
  };

  const handleTestOpenRouter = async () => {
    setTestingApi("OPENROUTER_API_KEY");
    try {
      const response = await fetch("/api/admin/settings/test-openrouter", {
        method: "POST",
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast({
          title: "API Key Valid",
          description: data.message,
        });
      } else {
        toast({
          title: "API Key Invalid",
          description: data.message || "Failed to validate API key",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Test Failed",
        description: "Failed to test OpenRouter API key",
        variant: "destructive",
      });
    } finally {
      setTestingApi(null);
    }
  };

  // Check if a setting is a boolean toggle (true/false value)
  const isBooleanSetting = (key: string): boolean => {
    const booleanSettings = [
      "AI_ENABLED",
      "SMS_NOTIFICATIONS_ENABLED",
      "KYC_AUTO_APPROVAL",
      "PIN_REQUIRED",
    ];
    return booleanSettings.includes(key);
  };

  // Handle boolean toggle change
  const handleBooleanToggle = async (key: string, currentValue: string) => {
    const newValue = currentValue === "true" ? "false" : "true";
    setSaving(key);
    try {
      const response = await fetch(`/api/admin/settings/${key}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ value: newValue }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: `${key} ${newValue === "true" ? "enabled" : "disabled"}`
        });
        await fetchSettings();
      } else {
        const data = await response.json();
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to update setting", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  if (user?.role !== "super_admin") {
    return null;
  }

  const categories = Object.keys(settings);

  return (
    <AppLayout>
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-2 -ml-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back to Admin
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
            <Home className="h-4 w-4 mr-1" /> Home
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
            <Key className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold">System Settings</h1>
            <p className="text-muted-foreground">Manage API keys, credentials, and system configuration</p>
          </div>
        </div>
      </header>

      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 mb-6">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            <strong>Super Admin Only:</strong> Changes here affect the entire system. Handle with care.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 flex-wrap">
            {categories.map((category) => {
              const Icon = CATEGORY_ICONS[category] || Key;
              return (
                <TabsTrigger key={category} value={category} className="gap-2">
                  <Icon className="h-4 w-4" />
                  {CATEGORY_LABELS[category] || category}
                </TabsTrigger>
              );
            })}
            <TabsTrigger value="escrow" className="gap-2">
              <Users className="h-4 w-4" />
              Escrow Agents
            </TabsTrigger>
          </TabsList>

          {categories.map((category) => (
            <TabsContent key={category} value={category} className="space-y-4">
              {settings[category]?.map((setting) => (
                <Card key={setting.key}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Label className="font-mono text-sm">{setting.key}</Label>
                          {setting.isActive ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Active</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Disabled</span>
                          )}
                          {setting.hasValue ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Configured</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Not Set</span>
                          )}
                        </div>
                        {setting.description && (
                          <p className="text-sm text-muted-foreground mb-2">{setting.description}</p>
                        )}
                        {setting.hasValue && !isBooleanSetting(setting.key) && (
                          <p className="text-xs text-muted-foreground mb-2 font-mono bg-muted/50 px-2 py-1 rounded">
                            Current: {setting.isEncrypted ? "••••••••" : setting.value}
                          </p>
                        )}

                        {/* Boolean settings use a toggle switch */}
                        {isBooleanSetting(setting.key) ? (
                          <div className="flex items-center gap-3 mt-2">
                            <Switch
                              checked={setting.value === "true"}
                              onCheckedChange={() => handleBooleanToggle(setting.key, setting.value || "false")}
                              disabled={saving === setting.key}
                            />
                            <span className={cn(
                              "text-sm font-medium",
                              setting.value === "true" ? "text-green-600" : "text-muted-foreground"
                            )}>
                              {setting.value === "true" ? "Enabled" : "Disabled"}
                            </span>
                            {saving === setting.key && (
                              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                            )}
                          </div>
                        ) : (
                          /* Non-boolean settings use text input */
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <Input
                                type={showValues[setting.key] ? "text" : "password"}
                                placeholder={setting.isEncrypted
                                  ? (setting.hasValue ? "Enter new value to change..." : "Enter value...")
                                  : "Enter value..."}
                                value={editValues[setting.key] ?? ""}
                                onChange={(e) =>
                                  setEditValues((prev) => ({ ...prev, [setting.key]: e.target.value }))
                                }
                                className="pr-10 font-mono text-sm"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                                onClick={() =>
                                  setShowValues((prev) => ({ ...prev, [setting.key]: !prev[setting.key] }))
                                }
                              >
                                {showValues[setting.key] ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => handleSaveSetting(setting.key)}
                              disabled={!editValues[setting.key] || saving === setting.key}
                            >
                              {saving === setting.key ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                            </Button>
                            {/* Test button for OpenRouter API key */}
                            {setting.key === "OPENROUTER_API_KEY" && setting.hasValue && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleTestOpenRouter}
                                disabled={testingApi === "OPENROUTER_API_KEY"}
                                className="gap-1"
                              >
                                {testingApi === "OPENROUTER_API_KEY" ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Zap className="h-4 w-4" />
                                )}
                                Test
                              </Button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Switch
                          checked={setting.isActive}
                          onCheckedChange={(checked) => handleToggleSetting(setting.key, checked)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          ))}

          <TabsContent value="escrow" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Casino Agent Accounts</CardTitle>
                <CardDescription>
                  These are the 747Live agent accounts managed by the super admin escrow. All casino transactions
                  flow through these accounts.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {escrowAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between p-4 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                        <Users className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="font-medium font-mono">{agent.agentUsername}</p>
                        <p className="text-sm text-muted-foreground">
                          Type: {agent.agentType} | Processed: {parseFloat(agent.totalProcessed).toLocaleString()} PHPT
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {agent.isActive ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                          <CheckCircle2 className="h-3 w-3" /> Active
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
                          Disabled
                        </span>
                      )}
                      <Switch
                        checked={agent.isActive}
                        onCheckedChange={(checked) => handleToggleAgent(agent.id, checked)}
                      />
                    </div>
                  </div>
                ))}

                {escrowAgents.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">No escrow agents configured</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">About Escrow System</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-sm text-muted-foreground">
                  <p>
                    <strong>Super Admin as Escrow:</strong> The super admin account acts as the central escrow for
                    all PayVerse transactions. This includes:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>User deposits and withdrawals via PayGram</li>
                    <li>Casino chip purchases and sales</li>
                    <li>Agent account management for 747Live</li>
                  </ul>
                  <p>
                    All PHPT flows through the escrow account, ensuring proper tracking and security of funds.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </AppLayout>
  );
}
