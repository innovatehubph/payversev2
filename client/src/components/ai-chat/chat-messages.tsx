/**
 * Chat Messages Component
 *
 * Renders the list of chat messages with auto-scroll.
 */

import { useEffect, useRef } from "react";
import { ChatMessage } from "./chat-message";
import type { ChatMessage as ChatMessageType } from "@/lib/ai-chat-api";
import type { ActionStatus } from "./chat-action-status";

interface ChatMessagesProps {
  messages: ChatMessageType[];
  isStreaming: boolean;
  currentAction?: ActionStatus | null;
}

export function ChatMessages({ messages, isStreaming, currentAction }: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold mb-2">PayVerse AI Assistant</h3>
        <p className="text-muted-foreground text-sm max-w-sm">
          Ask me anything about PayVerse! I can help you check your balance,
          find users, explain features, and more.
        </p>
        <div className="mt-6 flex flex-wrap gap-2 justify-center">
          {[
            "What's my balance?",
            "How do I send money?",
            "What are the fees?",
            "How do I verify my account?",
          ].map((suggestion) => (
            <button
              key={suggestion}
              className="px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded-full transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {messages.map((message, index) => {
        const isLastAssistant = index === messages.length - 1 && message.role === "assistant";
        return (
          <ChatMessage
            key={message.id || index}
            message={message}
            isStreaming={isStreaming && isLastAssistant}
            currentAction={isStreaming && isLastAssistant ? currentAction : null}
          />
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
}

export default ChatMessages;
