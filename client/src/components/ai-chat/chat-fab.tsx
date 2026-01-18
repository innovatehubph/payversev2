/**
 * Chat FAB (Floating Action Button) Component
 *
 * Floating button to open/close the AI chat interface.
 */

import { useState, useEffect } from "react";
import { MessageCircle, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChatContainer } from "./chat-container";
import { getAiStatus } from "@/lib/ai-chat-api";

interface ChatFabProps {
  className?: string;
}

export function ChatFab({ className }: ChatFabProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [aiStatus, setAiStatus] = useState<{ enabled: boolean; configured: boolean }>({ enabled: true, configured: false });

  // Check if AI is enabled from system settings
  useEffect(() => {
    getAiStatus()
      .then((status) => {
        setAiStatus({ enabled: status.enabled, configured: status.configured });
      })
      .catch((err) => {
        console.log("[ChatFab] Status check failed, showing FAB anyway:", err);
        // Show FAB anyway - let user see it and get proper error in chat
        setAiStatus({ enabled: true, configured: false });
      });
  }, []);

  // Only hide if explicitly disabled in settings (enabled === false)
  if (aiStatus.enabled === false) return null;

  return (
    <>
      {/* FAB Button - Always visible on all screen sizes */}
      <Button
        size="icon"
        className={cn(
          "fixed z-[9999]",
          // Position: above bottom nav on mobile, bottom-right on desktop
          "bottom-24 right-4 sm:bottom-24 sm:right-4 md:bottom-8 md:right-8",
          "w-14 h-14 rounded-full",
          "shadow-xl shadow-purple-500/30",
          "bg-gradient-to-br from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700",
          "transition-all duration-300 ease-out",
          "hover:scale-110 active:scale-95",
          isOpen && "scale-0 opacity-0 pointer-events-none",
          className
        )}
        onClick={() => setIsOpen(true)}
        title="Chat with PayVerse AI"
      >
        <div className="relative">
          <MessageCircle className="h-6 w-6 text-white" />
          <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-yellow-300 animate-pulse" />
        </div>
      </Button>

      {/* Chat Container */}
      <ChatContainer
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
          setIsMinimized(false);
        }}
        isMinimized={isMinimized}
        onToggleMinimize={() => setIsMinimized(!isMinimized)}
        isConfigured={aiStatus?.configured ?? false}
      />

      {/* Backdrop for mobile */}
      {isOpen && !isMinimized && (
        <div
          className="fixed inset-0 bg-black/40 z-[9998] md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

export default ChatFab;
