import { useState } from "react";
import AppLayout from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  HelpCircle,
  Search,
  MessageCircle,
  Sparkles,
  BookOpen,
  Shield,
  CreditCard,
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  Gamepad2,
  User,
  AlertCircle,
  Send,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { useFAQs, type FAQ } from "@/hooks/use-faqs";
import { useAuth } from "@/lib/auth-context";

// Category icons and colors
const CATEGORY_CONFIG: Record<string, { icon: React.ComponentType<any>; color: string; label: string }> = {
  general: { icon: BookOpen, color: "bg-blue-500/10 text-blue-600", label: "General" },
  account: { icon: User, color: "bg-purple-500/10 text-purple-600", label: "Account" },
  kyc: { icon: Shield, color: "bg-green-500/10 text-green-600", label: "KYC Verification" },
  security: { icon: Shield, color: "bg-red-500/10 text-red-600", label: "Security" },
  transactions: { icon: CreditCard, color: "bg-indigo-500/10 text-indigo-600", label: "Transactions" },
  balance: { icon: Wallet, color: "bg-emerald-500/10 text-emerald-600", label: "Balance" },
  topup: { icon: ArrowUpCircle, color: "bg-green-500/10 text-green-600", label: "Top Up" },
  withdrawal: { icon: ArrowDownCircle, color: "bg-orange-500/10 text-orange-600", label: "Withdrawal" },
  casino: { icon: Gamepad2, color: "bg-pink-500/10 text-pink-600", label: "Casino" },
  qrph: { icon: CreditCard, color: "bg-cyan-500/10 text-cyan-600", label: "QRPH" },
  telegram: { icon: Send, color: "bg-sky-500/10 text-sky-600", label: "Telegram" },
  errors: { icon: AlertCircle, color: "bg-red-500/10 text-red-600", label: "Troubleshooting" },
};

function getCategoryConfig(category: string) {
  return CATEGORY_CONFIG[category] || CATEGORY_CONFIG.general;
}

export default function Help() {
  const { user } = useAuth();
  const {
    faqs,
    categories,
    userRole,
    loading,
    error,
    searchQuery,
    selectedCategory,
    setSearchQuery,
    setSelectedCategory,
    trackFaqHit,
  } = useFAQs();

  const [expandedFaq, setExpandedFaq] = useState<string | undefined>(undefined);

  const handleFaqClick = (faqId: number, value: string) => {
    if (value === expandedFaq) {
      setExpandedFaq(undefined);
    } else {
      setExpandedFaq(value);
      trackFaqHit(faqId);
    }
  };

  const openAiChat = () => {
    // Trigger AI chat FAB
    const chatFab = document.querySelector('[data-ai-chat-fab]') as HTMLButtonElement;
    if (chatFab) {
      chatFab.click();
    }
  };

  return (
    <AppLayout>
      <div className="container max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <HelpCircle className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Help & Support</h1>
          <p className="text-muted-foreground">
            {user ? `Hi ${user.username}! ` : ""}
            Find answers to common questions or chat with our AI assistant.
          </p>
        </div>

        {/* AI Chat CTA */}
        <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/20">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Need personalized help?</h3>
                <p className="text-sm text-muted-foreground">
                  Our AI assistant can answer your questions and help you navigate PayVerse.
                </p>
              </div>
              <Button onClick={openAiChat} className="gap-2">
                <MessageCircle className="w-4 h-4" />
                Chat with AI
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search for help..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12"
          />
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedCategory === null ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(null)}
          >
            All
          </Button>
          {categories.map((category) => {
            const config = getCategoryConfig(category);
            const Icon = config.icon;
            return (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className="gap-1"
              >
                <Icon className="w-3 h-3" />
                {config.label}
              </Button>
            );
          })}
        </div>

        {/* Role indicator for authenticated users */}
        {user && userRole !== "guest" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="w-4 h-4" />
            <span>
              Showing FAQs for: <Badge variant="secondary" className="ml-1">{userRole}</Badge>
            </span>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="p-6 text-center">
              <AlertCircle className="w-8 h-8 mx-auto text-destructive mb-2" />
              <p className="text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* FAQs */}
        {!loading && !error && (
          <>
            {faqs.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5" />
                    Frequently Asked Questions
                  </CardTitle>
                  <CardDescription>
                    {faqs.length} question{faqs.length !== 1 ? "s" : ""} found
                    {selectedCategory && ` in ${getCategoryConfig(selectedCategory).label}`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Accordion
                    type="single"
                    collapsible
                    value={expandedFaq}
                    onValueChange={setExpandedFaq}
                  >
                    {faqs.map((faq) => {
                      const config = getCategoryConfig(faq.category);
                      const Icon = config.icon;
                      return (
                        <AccordionItem key={faq.id} value={`faq-${faq.id}`}>
                          <AccordionTrigger
                            onClick={() => handleFaqClick(faq.id, `faq-${faq.id}`)}
                            className="text-left hover:no-underline"
                          >
                            <div className="flex items-start gap-3 pr-4">
                              <div className={`p-1.5 rounded ${config.color} mt-0.5`}>
                                <Icon className="w-3 h-3" />
                              </div>
                              <div>
                                <span className="font-medium">{faq.question}</span>
                                {!selectedCategory && (
                                  <Badge variant="outline" className="ml-2 text-xs">
                                    {config.label}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pl-10">
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              {faq.answer.split("\n").map((line, i) => (
                                <p key={i} className="mb-2 last:mb-0">
                                  {line}
                                </p>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <HelpCircle className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="font-semibold mb-2">No FAQs found</h3>
                  <p className="text-muted-foreground mb-4">
                    {searchQuery
                      ? "Try a different search term or browse by category."
                      : "We're still learning from user interactions. Check back soon!"}
                  </p>
                  <Button onClick={openAiChat} variant="outline" className="gap-2">
                    <MessageCircle className="w-4 h-4" />
                    Ask AI Assistant
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Contact Support */}
        <Card>
          <CardHeader>
            <CardTitle>Still need help?</CardTitle>
            <CardDescription>
              Our support team is here to assist you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Button
                variant="outline"
                className="h-auto py-4 justify-start gap-3"
                onClick={openAiChat}
              >
                <div className="p-2 rounded-full bg-primary/10">
                  <MessageCircle className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-medium">Chat with AI</div>
                  <div className="text-xs text-muted-foreground">
                    Get instant answers 24/7
                  </div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-4 justify-start gap-3"
                asChild
              >
                <a href="mailto:support@payverse.ph">
                  <div className="p-2 rounded-full bg-blue-500/10">
                    <ExternalLink className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium">Email Support</div>
                    <div className="text-xs text-muted-foreground">
                      support@payverse.ph
                    </div>
                  </div>
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Powered by AI notice */}
        <p className="text-center text-xs text-muted-foreground">
          <Sparkles className="w-3 h-3 inline mr-1" />
          FAQs are powered by AI and continuously updated based on real user interactions.
        </p>
      </div>
    </AppLayout>
  );
}
