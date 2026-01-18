/**
 * OpenRouter API Integration
 *
 * Handles communication with OpenRouter for AI model access.
 * Supports multiple models with automatic routing based on query type.
 */

import { getSystemSetting } from "./settings";

// Model configurations
export const AI_MODELS = {
  primary: "google/gemini-2.5-pro-preview",
  fast: "google/gemini-2.0-flash-001",
  code: "x-ai/grok-2-1212",
  image: "black-forest-labs/flux-1.1-pro",
} as const;

export type ModelType = keyof typeof AI_MODELS;

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface FunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface ChatCompletionOptions {
  messages: Message[];
  model?: string;
  functions?: FunctionDefinition[];
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
}

interface StreamChunk {
  type: "content" | "function_call" | "done" | "error";
  content?: string;
  functionCall?: {
    name: string;
    arguments: string;
  };
  error?: string;
}

// Cost tracking (per 1M tokens, approximate)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "google/gemini-2.5-pro-preview": { input: 1.25, output: 5.00 },
  "google/gemini-2.0-flash-001": { input: 0.10, output: 0.40 },
  "x-ai/grok-2-1212": { input: 2.00, output: 10.00 },
  "black-forest-labs/flux-1.1-pro": { input: 0.04, output: 0.04 },
};

/**
 * Get the OpenRouter API key from system settings
 */
async function getApiKey(): Promise<string> {
  const apiKey = await getSystemSetting("OPENROUTER_API_KEY", "");
  if (!apiKey) {
    throw new Error("OpenRouter API key not configured");
  }
  return apiKey;
}

/**
 * Select the best model based on query analysis
 */
export function selectModel(
  message: string,
  preference: "auto" | "fast" | "reasoning" | "code" = "auto"
): string {
  // User preference override
  if (preference === "fast") return AI_MODELS.fast;
  if (preference === "reasoning") return AI_MODELS.primary;
  if (preference === "code") return AI_MODELS.code;

  // Auto-detect based on content
  const lowerMessage = message.toLowerCase();

  // Code-related queries
  const codeKeywords = [
    "code", "function", "api", "debug", "error", "programming",
    "javascript", "typescript", "python", "sql", "implement",
    "refactor", "fix bug", "syntax", "algorithm"
  ];
  if (codeKeywords.some(kw => lowerMessage.includes(kw))) {
    return AI_MODELS.code;
  }

  // Simple queries - use fast model
  const simplePatterns = [
    /^(hi|hello|hey|thanks|thank you|bye|goodbye)/i,
    /^(what is|how do i|where is|when)/i,
    /^(yes|no|ok|okay|sure)/i,
  ];
  if (simplePatterns.some(p => p.test(lowerMessage)) && message.length < 100) {
    return AI_MODELS.fast;
  }

  // Complex queries - use primary model
  const complexIndicators = [
    "analyze", "compare", "explain why", "what should i",
    "help me decide", "recommendation", "transaction", "transfer",
    "balance", "report", "statistics"
  ];
  if (complexIndicators.some(kw => lowerMessage.includes(kw))) {
    return AI_MODELS.primary;
  }

  // Default to fast for general queries
  return AI_MODELS.fast;
}

/**
 * Make a streaming chat completion request to OpenRouter
 */
export async function* streamChatCompletion(
  options: ChatCompletionOptions
): AsyncGenerator<StreamChunk> {
  const apiKey = await getApiKey();
  const model = options.model || AI_MODELS.fast;

  const requestBody: Record<string, unknown> = {
    model,
    messages: options.messages,
    stream: true,
    max_tokens: options.maxTokens || 4096,
    temperature: options.temperature ?? 0.7,
  };

  // Add function calling if provided
  if (options.functions && options.functions.length > 0) {
    requestBody.tools = options.functions.map(fn => ({
      type: "function",
      function: fn,
    }));
    requestBody.tool_choice = "auto";
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://payverse.ph",
        "X-Title": "PayVerse AI Assistant",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[OpenRouter] API error:", response.status, errorText);
      yield { type: "error", error: `API error: ${response.status}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let functionCall: { name: string; arguments: string } | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();

        if (data === "[DONE]") {
          if (functionCall) {
            yield { type: "function_call", functionCall };
          }
          yield { type: "done" };
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;

          if (delta?.content) {
            yield { type: "content", content: delta.content };
          }

          // Handle function calls
          if (delta?.tool_calls?.[0]) {
            const toolCall = delta.tool_calls[0];
            if (toolCall.function?.name) {
              functionCall = {
                name: toolCall.function.name,
                arguments: toolCall.function.arguments || "",
              };
            } else if (functionCall && toolCall.function?.arguments) {
              functionCall.arguments += toolCall.function.arguments;
            }
          }
        } catch (e) {
          // Skip invalid JSON lines
        }
      }
    }

    yield { type: "done" };
  } catch (error) {
    console.error("[OpenRouter] Stream error:", error);
    yield { type: "error", error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Make a non-streaming chat completion request
 */
export async function chatCompletion(
  options: ChatCompletionOptions
): Promise<{
  content: string;
  functionCall?: { name: string; arguments: string };
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}> {
  const apiKey = await getApiKey();
  const model = options.model || AI_MODELS.fast;

  const requestBody: Record<string, unknown> = {
    model,
    messages: options.messages,
    stream: false,
    max_tokens: options.maxTokens || 4096,
    temperature: options.temperature ?? 0.7,
  };

  if (options.functions && options.functions.length > 0) {
    requestBody.tools = options.functions.map(fn => ({
      type: "function",
      function: fn,
    }));
    requestBody.tool_choice = "auto";
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://payverse.ph",
      "X-Title": "PayVerse AI Assistant",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  let functionCall: { name: string; arguments: string } | undefined;
  if (choice?.message?.tool_calls?.[0]) {
    const toolCall = choice.message.tool_calls[0];
    functionCall = {
      name: toolCall.function.name,
      arguments: toolCall.function.arguments,
    };
  }

  return {
    content: choice?.message?.content || "",
    functionCall,
    model,
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
    } : undefined,
  };
}

/**
 * Generate an image using the image model
 */
export async function generateImage(
  prompt: string,
  options: { width?: number; height?: number } = {}
): Promise<{ url: string; error?: string }> {
  const apiKey = await getApiKey();

  try {
    const response = await fetch("https://openrouter.ai/api/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://payverse.ph",
        "X-Title": "PayVerse AI Assistant",
      },
      body: JSON.stringify({
        model: AI_MODELS.image,
        prompt,
        n: 1,
        size: `${options.width || 1024}x${options.height || 1024}`,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { url: "", error: `Image generation failed: ${response.status}` };
    }

    const data = await response.json();
    return { url: data.data?.[0]?.url || "" };
  } catch (error) {
    console.error("[OpenRouter] Image generation error:", error);
    return { url: "", error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Estimate cost for a request
 */
export function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const costs = MODEL_COSTS[model] || { input: 0.01, output: 0.01 };
  return (promptTokens * costs.input + completionTokens * costs.output) / 1_000_000;
}
