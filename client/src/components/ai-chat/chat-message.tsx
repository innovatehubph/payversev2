/**
 * Chat Message Component
 *
 * Renders a single chat message with avatar and content.
 */

import { memo } from "react";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "./markdown-renderer";
import { ChatActionStatus, type ActionStatus } from "./chat-action-status";
import type { ChatMessage as ChatMessageType } from "@/lib/ai-chat-api";
import payverseLogo from "@assets/payverse_logo.png";

interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming?: boolean;
  currentAction?: ActionStatus | null;
}

export const ChatMessage = memo(function ChatMessage({
  message,
  isStreaming,
  currentAction,
}: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex gap-3 p-4",
        isUser ? "bg-transparent" : "bg-muted/50"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center overflow-hidden",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-slate-900 p-1"
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <img src={payverseLogo} alt="AI" className="w-full h-full object-contain" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">
            {isUser ? "You" : "PayVerse AI"}
          </span>
          {message.modelUsed && !isUser && (
            <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
              {message.modelUsed.split("/").pop()}
            </span>
          )}
        </div>

        {/* Message content */}
        <div className="text-sm">
          {message.content ? (
            <>
              <MarkdownRenderer content={message.content} />
              {/* Show action status below content when streaming */}
              {isStreaming && currentAction && (
                <div className="mt-3">
                  <ChatActionStatus action={currentAction} />
                </div>
              )}
            </>
          ) : isStreaming && currentAction ? (
            <ChatActionStatus action={currentAction} />
          ) : isStreaming ? (
            <ChatActionStatus
              action={{ type: "thinking", message: "Processing your request" }}
            />
          ) : null}
        </div>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.attachments.map((attachment, index) => (
              <a
                key={index}
                href={attachment.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                <span className="text-xs font-medium truncate max-w-[200px]">
                  {attachment.fileName}
                </span>
              </a>
            ))}
          </div>
        )}

        {/* Streaming indicator */}
        {isStreaming && message.content && (
          <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
        )}
      </div>
    </div>
  );
});

export default ChatMessage;
