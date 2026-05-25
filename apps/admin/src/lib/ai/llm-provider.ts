/**
 * LLM Provider — text generation and vision analysis.
 * Centralized service for all AI text/vision calls.
 *
 * Config: Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY,
 *         AZURE_LLM_DEPLOYMENT_NAME (default: gpt-4o)
 */

import { resolveR2Url as normalizeImageUrl } from "../r2";

export type LLMMessage = {
  role: "system" | "user" | "assistant";
  content: string | LLMMessagePart[];
};

export type LLMMessagePart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type LLMOptions = {
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
};

export type LLMResponse = {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
};

function getConfig() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment =
    process.env.AZURE_LLM_TEXT_DEPLOYMENT_NAME || process.env.AZURE_LLM_DEPLOYMENT_NAME || "gpt-4o";
  const apiVersion = process.env.OPENAI_API_VERSION || "2025-04-01-preview";

  if (!endpoint || !apiKey) {
    throw new Error(
      "LLM not configured. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY in .env.local",
    );
  }

  return { endpoint, apiKey, deployment, apiVersion };
}

/**
 * Send a chat completion request to Azure OpenAI.
 */
export async function chatCompletion(
  messages: LLMMessage[],
  options: LLMOptions = {},
): Promise<LLMResponse> {
  const { endpoint, apiKey, deployment, apiVersion } = getConfig();
  const { maxTokens = 2048, temperature = 0.7, jsonMode = false } = options;

  const body: Record<string, unknown> = {
    messages,
    max_completion_tokens: maxTokens,
    temperature,
  };

  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(
    `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM API error (${res.status}): ${err}`);
  }

  const result = await res.json();
  const content = result.choices?.[0]?.message?.content?.trim() || "";
  const usage = result.usage
    ? {
        promptTokens: result.usage.prompt_tokens,
        completionTokens: result.usage.completion_tokens,
      }
    : undefined;

  return { content, usage };
}

/**
 * Simple text prompt → text response.
 */
export async function textPrompt(
  prompt: string,
  options?: LLMOptions & { systemPrompt?: string },
): Promise<string> {
  const messages: LLMMessage[] = [];
  if (options?.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  messages.push({ role: "user", content: prompt });
  const result = await chatCompletion(messages, options);
  return result.content;
}

/**
 * Send an image + text prompt for vision analysis. Returns text or JSON.
 */
export async function visionAnalyze(
  imageUrl: string,
  prompt: string,
  options?: LLMOptions & { systemPrompt?: string },
): Promise<string> {
  // Resolve relative R2 paths to full URLs
  const resolvedUrl = normalizeImageUrl(imageUrl);

  const messages: LLMMessage[] = [];
  if (options?.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  messages.push({
    role: "user",
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: resolvedUrl } },
    ],
  });
  const result = await chatCompletion(messages, options);
  return result.content;
}

/**
 * Vision analyze with structured JSON response.
 */
export async function visionAnalyzeJSON<T = unknown>(
  imageUrl: string,
  prompt: string,
  options?: Omit<LLMOptions, "jsonMode"> & { systemPrompt?: string },
): Promise<T> {
  const content = await visionAnalyze(imageUrl, prompt, {
    ...options,
    jsonMode: true,
  });
  return JSON.parse(content) as T;
}
