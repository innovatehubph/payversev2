/**
 * AI Chat Hook
 *
 * Manages state and interactions for the AI chat interface.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  streamChat,
  getConversation,
  type ChatMessage,
  type ChatRequest,
  type StreamEvent,
} from "@/lib/ai-chat-api";

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  sessionId: string | null;
  currentModel: string | null;
  rateLimit: {
    remaining: number;
    resetAt?: Date;
  } | null;
}

interface UseAiChatOptions {
  sessionId?: string;
  onError?: (error: string) => void;
}

export function useAiChat(options: UseAiChatOptions = {}) {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    isStreaming: false,
    error: null,
    sessionId: options.sessionId || null,
    currentModel: null,
    rateLimit: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingMessageRef = useRef<string>("");

  // Load existing conversation if sessionId provided
  useEffect(() => {
    if (options.sessionId) {
      loadConversation(options.sessionId);
    }
  }, [options.sessionId]);

  /**
   * Load an existing conversation
   */
  const loadConversation = useCallback(async (sessionId: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const { conversation, messages } = await getConversation(sessionId);
      setState(prev => ({
        ...prev,
        isLoading: false,
        sessionId: conversation.sessionId,
        messages: messages.map(m => ({
          ...m,
          createdAt: new Date(m.createdAt || Date.now()),
        })),
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to load conversation";
      setState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
      options.onError?.(errorMessage);
    }
  }, [options.onError]);

  /**
   * Send a message and stream the response
   */
  const sendMessage = useCallback(async (
    message: string,
    modelPreference?: "auto" | "fast" | "reasoning" | "code"
  ) => {
    if (!message.trim() || state.isStreaming) return;

    // Add user message immediately
    const userMessage: ChatMessage = {
      role: "user",
      content: message,
      createdAt: new Date(),
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isStreaming: true,
      error: null,
    }));

    streamingMessageRef.current = "";

    // Create assistant message placeholder
    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: "",
      createdAt: new Date(),
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, assistantMessage],
    }));

    try {
      const request: ChatRequest = {
        message,
        conversationId: state.sessionId || undefined,
        modelPreference,
      };

      const stream = streamChat(request, (sessionId, model) => {
        setState(prev => ({
          ...prev,
          sessionId,
          currentModel: model,
        }));
      });

      for await (const event of stream) {
        if (event.type === "content" && event.content) {
          streamingMessageRef.current += event.content;

          setState(prev => ({
            ...prev,
            messages: prev.messages.map((m, i) =>
              i === prev.messages.length - 1
                ? { ...m, content: streamingMessageRef.current }
                : m
            ),
          }));
        } else if (event.type === "function_call") {
          // Show function call indicator
          setState(prev => ({
            ...prev,
            messages: prev.messages.map((m, i) =>
              i === prev.messages.length - 1
                ? { ...m, content: streamingMessageRef.current + `\n\n*Executing ${event.name}...*` }
                : m
            ),
          }));
        } else if (event.type === "function_result") {
          // Remove the function call indicator
          const contentWithoutIndicator = streamingMessageRef.current;
          setState(prev => ({
            ...prev,
            messages: prev.messages.map((m, i) =>
              i === prev.messages.length - 1
                ? { ...m, content: contentWithoutIndicator }
                : m
            ),
          }));
        } else if (event.type === "error") {
          setState(prev => ({
            ...prev,
            isStreaming: false,
            error: event.error || "Unknown error",
          }));
          options.onError?.(event.error || "Unknown error");
          return;
        } else if (event.type === "done") {
          setState(prev => ({
            ...prev,
            isStreaming: false,
            rateLimit: event.remaining !== undefined
              ? { remaining: event.remaining }
              : prev.rateLimit,
          }));
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to send message";
      setState(prev => ({
        ...prev,
        isStreaming: false,
        error: errorMessage,
      }));
      options.onError?.(errorMessage);
    }
  }, [state.sessionId, state.isStreaming, options.onError]);

  /**
   * Clear current conversation
   */
  const clearConversation = useCallback(() => {
    setState({
      messages: [],
      isLoading: false,
      isStreaming: false,
      error: null,
      sessionId: null,
      currentModel: null,
      rateLimit: null,
    });
  }, []);

  /**
   * Stop streaming response
   */
  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    setState(prev => ({ ...prev, isStreaming: false }));
  }, []);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    sendMessage,
    loadConversation,
    clearConversation,
    stopStreaming,
    clearError,
  };
}
