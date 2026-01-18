/**
 * Chat Container Component
 *
 * Main container for the AI chat interface.
 */

import { useEffect } from "react";
import { X, Minimize2, Maximize2, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAiChat } from "@/hooks/use-ai-chat";
import { ChatMessages } from "./chat-messages";
import { ChatInput } from "./chat-input";

interface ChatContainerProps {
  isOpen: boolean;
  onClose: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  sessionId?: string;
}

export function ChatContainer({
  isOpen,
  onClose,
  isMinimized = false,
  onToggleMinimize,
  sessionId,
}: ChatContainerProps) {
  const {
    messages,
    isLoading,
    isStreaming,
    error,
    currentModel,
    rateLimit,
    sendMessage,
    clearConversation,
    clearError,
  } = useAiChat({ sessionId });

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(clearError, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "fixed bottom-20 right-4 md:bottom-4 md:right-4 z-50",
        "flex flex-col bg-background border rounded-xl shadow-2xl",
        "transition-all duration-300 ease-out",
        isMinimized
          ? "w-80 h-14"
          : "w-[calc(100vw-2rem)] md:w-[400px] h-[500px] md:h-[600px]"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-violet-500/10 to-purple-500/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">PayVerse AI</h3>
            {!isMinimized && currentModel && (
              <p className="text-[10px] text-muted-foreground">
                {currentModel.split("/").pop()}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Clear conversation */}
          {!isMinimized && messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={clearConversation}
              title="Clear conversation"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}

          {/* Minimize/Maximize */}
          {onToggleMinimize && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onToggleMinimize}
              title={isMinimized ? "Expand" : "Minimize"}
            >
              {isMinimized ? (
                <Maximize2 className="h-4 w-4" />
              ) : (
                <Minimize2 className="h-4 w-4" />
              )}
            </Button>
          )}

          {/* Close */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content (hidden when minimized) */}
      {!isMinimized && (
        <>
          {/* Error banner */}
          {error && (
            <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm border-b">
              {error}
            </div>
          )}

          {/* Messages */}
          <ChatMessages
            messages={messages}
            isStreaming={isStreaming}
          />

          {/* Rate limit warning */}
          {rateLimit && rateLimit.remaining <= 5 && (
            <div className="px-4 py-2 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-xs text-center border-t">
              {rateLimit.remaining} requests remaining this hour
            </div>
          )}

          {/* Input */}
          <ChatInput
            onSend={sendMessage}
            isLoading={isLoading || isStreaming}
          />
        </>
      )}
    </div>
  );
}

export default ChatContainer;
