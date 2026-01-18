/**
 * AI Chat API Client
 *
 * Handles communication with the AI chat backend endpoints.
 * Supports SSE streaming for real-time responses.
 */

const API_BASE = "/api/ai";

export interface ChatMessage {
  id?: number;
  role: "user" | "assistant" | "system";
  content: string;
  contentType?: string;
  modelUsed?: string;
  attachments?: FileAttachment[];
  createdAt?: Date;
}

export interface FileAttachment {
  id?: number;
  fileName: string;
  fileType: string;
  fileUrl: string;
  fileSize?: number;
}

export interface Conversation {
  id: number;
  sessionId: string;
  title: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
  modelPreference?: "auto" | "fast" | "reasoning" | "code";
  attachments?: FileAttachment[];
}

export interface StreamEvent {
  type: "session" | "content" | "function_call" | "function_result" | "done" | "error";
  sessionId?: string;
  model?: string;
  content?: string;
  name?: string;
  success?: boolean;
  data?: unknown;
  error?: string;
  remaining?: number;
}

/**
 * Send a chat message and stream the response
 */
export async function* streamChat(
  request: ChatRequest,
  onSession?: (sessionId: string, model: string) => void
): AsyncGenerator<StreamEvent> {
  const token = localStorage.getItem("auth_token");

  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    yield { type: "error", error: error.message || "Request failed" };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: "error", error: "No response body" };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();

      try {
        const parsed = JSON.parse(data) as StreamEvent;

        if (parsed.type === "session" && parsed.sessionId && onSession) {
          onSession(parsed.sessionId, parsed.model || "unknown");
        }

        yield parsed;
      } catch (e) {
        // Skip invalid JSON
      }
    }
  }
}

/**
 * Get user's conversations
 */
export async function getConversations(): Promise<Conversation[]> {
  const token = localStorage.getItem("auth_token");

  const response = await fetch(`${API_BASE}/conversations`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch conversations");
  }

  const data = await response.json();
  return data.conversations;
}

/**
 * Get a specific conversation with messages
 */
export async function getConversation(
  sessionId: string
): Promise<{ conversation: Conversation; messages: ChatMessage[] }> {
  const token = localStorage.getItem("auth_token");

  const response = await fetch(`${API_BASE}/conversations/${sessionId}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch conversation");
  }

  return response.json();
}

/**
 * Delete (archive) a conversation
 */
export async function deleteConversation(sessionId: string): Promise<void> {
  const token = localStorage.getItem("auth_token");

  const response = await fetch(`${API_BASE}/conversations/${sessionId}`, {
    method: "DELETE",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error("Failed to delete conversation");
  }
}

/**
 * Upload a file for AI chat
 */
export async function uploadFile(
  file: File,
  conversationId?: number
): Promise<FileAttachment> {
  const token = localStorage.getItem("auth_token");

  const formData = new FormData();
  formData.append("file", file);
  if (conversationId) {
    formData.append("conversationId", conversationId.toString());
  }

  const response = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Upload failed" }));
    throw new Error(error.message || "Upload failed");
  }

  const data = await response.json();
  return data.attachment;
}

/**
 * Check AI service status
 */
export async function getAiStatus(): Promise<{
  enabled: boolean;
  configured: boolean;
  models: Record<string, string>;
}> {
  const response = await fetch(`${API_BASE}/status`);

  if (!response.ok) {
    throw new Error("Failed to check AI status");
  }

  return response.json();
}
