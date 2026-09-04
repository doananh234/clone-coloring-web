/**
 * LLM Provider — text generation and vision analysis.
 * Centralized service for all AI text/vision calls.
 *
 * Config: Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY,
 *         AZURE_LLM_DEPLOYMENT_NAME (default: gpt-4o)
 */

import { createRequire } from "node:module";
import { jsonrepair } from "jsonrepair";

// ESM shim — `@vx/server-core` is "type": "module" so the bare `require()`
// used below to lazy-load the Diaflow provider needs a CJS-compatible require.
const require = createRequire(import.meta.url);

import { resolveR2Url as normalizeImageUrl } from "../r2";
import { getLangfuse } from "../langfuse";
import { litellmFetch } from "./litellm-dispatcher";

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
  /** Langfuse trace metadata for cost tracking */
  trace?: { caller?: string; entityType?: string; entityId?: string };
};

export type LLMResponse = {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
};

function getAzureConfig() {
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

function getLiteLLMConfig() {
  const baseUrl = process.env.LITELLM_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.LITELLM_API_KEY;
  const model = process.env.LITELLM_TEXT_MODEL || "saigon";

  if (!baseUrl || !apiKey) {
    throw new Error("LLM not configured. Set LITELLM_BASE_URL and LITELLM_API_KEY.");
  }

  return { baseUrl, apiKey, model };
}

/**
 * Send a chat completion request to the active text backend.
 * Azure OpenAI by default; LiteLLM (OpenAI-compatible) when LLM_PROVIDER=litellm.
 */
export async function chatCompletion(
  messages: LLMMessage[],
  options: LLMOptions = {},
): Promise<LLMResponse> {
  const { maxTokens = 2048, temperature = 0.7, jsonMode = false } = options;
  const useLiteLLM = process.env.LLM_PROVIDER === "litellm";

  let res: Response;
  let modelLabel: string;

  if (useLiteLLM) {
    const { baseUrl, apiKey, model } = getLiteLLMConfig();
    modelLabel = model;
    const body: Record<string, unknown> = {
      model,
      messages,
      // saigon and friends are reasoning models — use the OpenAI-standard field.
      max_tokens: maxTokens,
      temperature,
    };
    if (jsonMode) {
      body.response_format = { type: "json_object" };
    }
    res = await litellmFetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } else {
    const { endpoint, apiKey, deployment, apiVersion } = getAzureConfig();
    modelLabel = deployment;
    const body: Record<string, unknown> = {
      messages,
      max_completion_tokens: maxTokens,
      temperature,
    };
    if (jsonMode) {
      body.response_format = { type: "json_object" };
    }
    res = await fetch(
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
  }

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

  // Log to Langfuse
  const lf = getLangfuse();
  if (lf && usage) {
    const trace = lf.trace({
      name: options.trace?.caller || "chatCompletion",
      metadata: {
        entityType: options.trace?.entityType,
        entityId: options.trace?.entityId,
      },
    });
    trace.generation({
      name: "chatCompletion",
      model: modelLabel,
      input: messages,
      output: content,
      usage: {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.promptTokens + usage.completionTokens,
      },
    });
  }

  return { content, usage };
}

/**
 * Simple text prompt → text response.
 */
export async function textPrompt(
  prompt: string,
  options?: LLMOptions & { systemPrompt?: string },
): Promise<string> {
  if (process.env.LLM_PROVIDER === "diaflow") {
    const mod = await import("./image-provider-diaflow");
    return mod.diaflowTextPrompt(prompt, options);
  }

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
  imageUrl: string | string[],
  prompt: string,
  options?: LLMOptions & { systemPrompt?: string },
): Promise<string> {
  if (process.env.LLM_PROVIDER === "diaflow") {
    const mod = await import("./image-provider-diaflow");
    return mod.diaflowVisionAnalyze(imageUrl, prompt, options);
  }

  // Resolve relative R2 paths to full URLs
  const urls = Array.isArray(imageUrl) ? imageUrl : [imageUrl];
  const imageParts: LLMMessagePart[] = urls.map((url) => ({
    type: "image_url" as const,
    image_url: { url: normalizeImageUrl(url) },
  }));

  const messages: LLMMessage[] = [];
  if (options?.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  messages.push({
    role: "user",
    content: [
      ...imageParts,
      { type: "text", text: prompt },
    ],
  });
  const result = await chatCompletion(messages, options);
  return result.content;
}

/**
 * One-shot clone pipeline (PDF → array of redesigned pages + analyze JSON).
 * Delegates to the Diaflow provider; throws if Diaflow is not active —
 * there is no Azure equivalent (the full pipeline only exists in Diaflow).
 */
export type CloneOneShotPage = {
  redesignedImageUrl: string;
  analyzeData: unknown;
};

export async function cloneOneShot(
  pdfUrl: string,
  options?: {
    brandInfo?: string;
    trace?: { caller?: string; entityType?: string; entityId?: string };
  },
): Promise<{ sessionId: string; pages: CloneOneShotPage[] }> {
  if (process.env.LLM_PROVIDER !== "diaflow") {
    throw new Error("cloneOneShot requires LLM_PROVIDER=diaflow");
  }
  // Static dynamic import — bundlers (webpack/turbopack) statically resolve
  // a literal path here, unlike the createRequire-based `require()` pattern.
  const mod = await import("./image-provider-diaflow");
  return mod.diaflowCloneOneShot(normalizeImageUrl(pdfUrl), options);
}

/**
 * Debug helper — recheck a previously-run Diaflow one-shot session without
 * issuing a new API call. Returns the raw payload + parsed pages so callers
 * can inspect what the flow actually produced.
 */
export async function recheckOneShotSession(sessionId: string): Promise<{
  sessionId: string;
  status: string;
  raw: Record<string, unknown> | undefined;
  pages: CloneOneShotPage[];
  parseError?: string;
}> {
  if (process.env.LLM_PROVIDER !== "diaflow") {
    throw new Error("recheckOneShotSession requires LLM_PROVIDER=diaflow");
  }
  const mod = await import("./image-provider-diaflow");
  return mod.diaflowRecheckOneShotSession(sessionId);
}

/**
 * Vision analyze with structured JSON response.
 */
/**
 * Parse JSON returned by an LLM defensively. Models (incl. LiteLLM/Azure-proxied
 * ones) intermittently wrap the payload in ```json fences, add prose around it,
 * or leave a trailing comma — a raw JSON.parse then throws
 * ("Expected double-quoted property name…") and the whole request 500s. We strip
 * fences, extract the outermost object/array, and drop trailing commas before
 * parsing; only a genuinely broken payload throws (with a snippet for debugging).
 */
export function parseLlmJson<T = unknown>(raw: string): T {
  let s = (raw ?? "").trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) s = fence[1].trim();
  // Trim leading prose / trailing prose around the JSON body.
  const start = s.search(/[{[]/);
  if (start > 0) s = s.slice(start);
  const end = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (end >= 0 && end < s.length - 1) s = s.slice(0, end + 1);
  try {
    return JSON.parse(s) as T;
  } catch {
    // Reasoning models behind LiteLLM (e.g. "saigon") reliably emit malformed
    // JSON — missing commas between array/object members, trailing commas, single
    // quotes — even in json_object mode. jsonrepair fixes these structurally.
    try {
      return JSON.parse(jsonrepair(s)) as T;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`LLM returned invalid JSON (${msg}). First 300 chars: ${s.slice(0, 300)}`);
    }
  }
}

export async function visionAnalyzeJSON<T = unknown>(
  imageUrl: string | string[],
  prompt: string,
  options?: Omit<LLMOptions, "jsonMode"> & { systemPrompt?: string },
): Promise<T> {
  if (process.env.LLM_PROVIDER === "diaflow") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { diaflowVisionAnalyzeJSON } = require("./image-provider-diaflow");
    const urls = Array.isArray(imageUrl)
      ? imageUrl.map(normalizeImageUrl)
      : normalizeImageUrl(imageUrl);
    return diaflowVisionAnalyzeJSON(urls, prompt, options);
  }

  const content = await visionAnalyze(imageUrl, prompt, {
    ...options,
    jsonMode: true,
  });
  return parseLlmJson<T>(content);
}
