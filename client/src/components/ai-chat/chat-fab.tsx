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
  const [isEnabled, setIsEnabled] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  // Check if AI is enabled
  useEffect(() => {
    getAiStatus()
      .then((status) => {
        setIsEnabled(status.enabled && status.configured);
        setIsLoaded(true);
      })
      .catch(() => {
        setIsEnabled(false);
        setIsLoaded(true);
      });
  }, []);

  // Don't render if AI is disabled
  if (!isLoaded || !isEnabled) return null;

  return (
    <>
      {/* FAB Button */}
      <Button
        size="icon"
        className={cn(
          "fixed bottom-24 right-4 md:bottom-6 md:right-6 z-40",
          "w-14 h-14 rounded-full shadow-lg",
          "bg-gradient-to-br from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700",
          "transition-all duration-300 ease-out",
          isOpen && "scale-0 opacity-0",
          className
        )}
        onClick={() => setIsOpen(true)}
        title="Chat with PayVerse AI"
      >
        <div className="relative">
          <MessageCircle className="h-6 w-6 text-white" />
          <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-yellow-300" />
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
      />

      {/* Backdrop for mobile */}
      {isOpen && !isMinimized && (
        <div
          className="fixed inset-0 bg-black/20 z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

export default ChatFab;
