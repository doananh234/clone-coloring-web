# Diaflow Provider Design

**Date:** 2026-06-03
**Status:** Approved

## Problem

The admin app currently supports Azure, Gemini, and Vertex AI as image generation providers, and Azure-only for text/vision (LLM). We need to add Diaflow — an internal async API — as a unified provider for both image generation and text generation.

## Scope

- Single provider file handling both image and LLM generation
- Integrate into existing provider selection mechanism
- Normalize Diaflow's async (session + polling) API to match the synchronous interface consumers expect

## Out of Scope

- Per-flow-type tokens (single token for all flows)
- Upload endpoint (placeholder payloads — real shapes provided later)
- User-level token management

## Architecture

### Single File

`apps/admin/src/lib/ai/image-provider-diaflow.ts`

Handles both concerns via a `flow` parameter:
- `flow: "image"` — image generation (coloring pages, covers, character extraction)
- `flow: "text"` — text generation and vision analysis

### Diaflow API (2-step async)

**Step 1 — Create session:**

```
POST {DIAFLOW_API_URL}/api/v1/interfaces/app/process
Authorization: Bearer {DIAFLOW_TOKEN}
Content-Type: application/json

{
  "flow": "image" | "text",
  "request": "prompt text",
  "character_image": "remote_path",   // optional, image flow
  "background_image": "remote_path",  // optional, image flow
  "image": "base64_or_url"            // optional, text flow (vision)
}
```

Response:
```json
{ "session_id": "uuid" }
```

**Step 2 — Poll status:**

```
GET {DIAFLOW_API_URL}/api/v1/interfaces/app/status/{session_id}
Authorization: Bearer {DIAFLOW_TOKEN}
```

Response:
```json
{
  "status": "Processing" | "Done" | "Failed",
  "result": {
    "image-generation-0": { "output": "path/to/image" },
    "output": { "key": "text content or image path" }
  },
  "error": "error message if failed"
}
```

### Polling Behavior

- Interval: `DIAFLOW_POLL_INTERVAL` (default 3 seconds)
- Timeout: `DIAFLOW_POLL_TIMEOUT` (default 300 seconds)
- Retry on HTTP 502/503/504 up to 3 times per poll
- Throw on `Failed`/`Error` status or timeout

### Result Extraction

**Image results** — priority order:
1. `result["image-generation-0"]["output"]`
2. First value in `result["output"]`
3. `result["preview"]`
4. Walk all nodes for fields: `output`, `preview`, `image`, `image_url`, `url`

Relative paths prefixed with `https://cdn.diaflow.io/`.
CDN URLs fetched and converted to base64 for `GeneratedImage` response.

**Text results** — priority order:
1. `result["output"]` (if string)
2. First string value found in `result`

## Exports

### Image Provider

```typescript
export const diaflowImageProvider: ImageProviderInterface = {
  generateImage(prompt, options) -> Promise<GeneratedImage>
  editImage(imageUrl, prompt, options) -> Promise<GeneratedImage>
}
```

Uses `flow: "image"`. Returns normalized `{ base64, dataUrl, usage }`.

### LLM Functions

```typescript
export async function diaflowTextPrompt(
  prompt: string,
  systemPrompt?: string
): Promise<string>

export async function diaflowVisionAnalyze(
  imageUrl: string,
  prompt: string
): Promise<string>

export async function diaflowVisionAnalyzeJSON<T>(
  imageUrl: string,
  prompt: string
): Promise<T>
```

Uses `flow: "text"`. `visionAnalyzeJSON` parses the text response as JSON.

## Integration Points

### image-provider.ts

Add `"diaflow"` to provider switch:

```typescript
if (provider === "diaflow") return diaflowImageProvider
```

### llm-provider.ts

Add `LLM_PROVIDER` env var and route to Diaflow when set:

```typescript
const llmProvider = process.env.LLM_PROVIDER || "azure"
if (llmProvider === "diaflow") {
  // delegate to diaflowTextPrompt / diaflowVisionAnalyze
}
```

### .env.example

```env
# Diaflow Provider
DIAFLOW_API_URL=https://api.diaflow.io
DIAFLOW_TOKEN=
DIAFLOW_POLL_INTERVAL=3
DIAFLOW_POLL_TIMEOUT=300
```

### Provider Selection

```env
IMAGE_PROVIDER=diaflow    # image generation via Diaflow
LLM_PROVIDER=diaflow      # text/vision via Diaflow
```

## Internal Helper Functions

```typescript
// Create session and poll until done
async function runDiaflow(payload: DiaflowPayload): Promise<DiaflowResult>

// Single poll request with retry on transient HTTP errors
async function pollStatus(sessionId: string): Promise<DiaflowStatus>

// Extract image URL from dynamic result structure
function extractImageUrl(result: Record<string, unknown>): string

// Extract text from dynamic result structure
function extractTextResult(result: Record<string, unknown>): string

// Fetch CDN image and convert to base64
async function fetchAsBase64(url: string): Promise<string>
```

## Types

```typescript
type DiaflowPayload = {
  flow: "image" | "text"
  request: string
  character_image?: string
  background_image?: string
  image?: string
  [key: string]: unknown  // extensible for future fields
}

type DiaflowStatus = {
  status: "Processing" | "Done" | "Failed"
  result?: Record<string, unknown>
  error?: string
}

type DiaflowResult = {
  sessionId: string
  result: Record<string, unknown>
}
```

## Error Handling

- **Network errors**: Throw with descriptive message including endpoint
- **Transient errors (502/503/504)**: Retry up to 3 times during polling
- **Diaflow errors (Failed status)**: Throw with `error` field from response
- **Timeout**: Throw `TimeoutError` after `DIAFLOW_POLL_TIMEOUT` seconds
- **Missing result**: Throw if extraction finds no image/text in completed result

## Env Var Validation

At provider init, validate:
- `DIAFLOW_API_URL` is set (required)
- `DIAFLOW_TOKEN` is set (required)
- Throw clear error if missing

## Files to Create

- `apps/admin/src/lib/ai/image-provider-diaflow.ts`

## Files to Modify

- `apps/admin/src/lib/ai/image-provider.ts` — add diaflow case
- `apps/admin/src/lib/ai/llm-provider.ts` — add LLM_PROVIDER routing
- `apps/admin/.env.example` — add diaflow env vars

## Placeholder Note

Request/response shapes are mockups. Actual API contract to be provided by user and updated in the implementation. The provider structure and normalization logic are the real deliverables.
