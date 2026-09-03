/**
 * KingCong Studio Provider — image generation/editing via the site's internal
 * `ajaxs/image.php` endpoint (kingcongstudio.com), wrapped as an
 * ImageProviderInterface. Select with IMAGE_PROVIDER=kingcong.
 *
 * This is NOT a public/contracted API. It authenticates with the browser
 * SESSION COOKIE (PHPSESSID + remember_*), so we carry a cookie and, on
 * expiry, re-mint one via Playwright against a persistent (already
 * Google-logged-in) browser profile. Login is Google OAuth and cannot be
 * scripted, hence the persistent-profile strategy.
 *
 * Contract (verified from the browser):
 *   POST <base>/ajaxs/image.php
 *   - create_task: multipart/form-data
 *       action=create_task, model_id, prompt, generations_count, aspect_ratio,
 *       resolution, negative_prompt, enhance_prompt, res_type, image=<file?>
 *     → { status:"success", task_id, new_balance }
 *   - check_status: application/x-www-form-urlencoded
 *       action=check_status, task_id
 *     → { status, task_status:"done", result_images:[{ imageUrl,... }], cost, progress }
 *
 * Config (env):
 *   IMAGE_PROVIDER=kingcong
 *   KINGCONG_BASE_URL         (default https://kingcongstudio.com)
 *   KINGCONG_IMAGE_MODEL      (default gemini-3.1-flash-lite-image)
 *   KINGCONG_COOKIE           inline cookie (serverless/Next); OR:
 *   KINGCONG_SESSION_FILE     JSON file holding the cookie (default .kingcong-session.json)
 *   KINGCONG_USER_DATA_DIR    persistent Playwright profile (default .kingcong-profile)
 *   KINGCONG_RELOGIN_ENABLED  "true"|"false" (default true; file-mode only)
 *   KINGCONG_POLL_INTERVAL    seconds (default 3)
 *   KINGCONG_POLL_TIMEOUT     seconds (default 500 — img2img runs ~80s/page and
 *                             can spike well past 180s under load)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import sharp from "sharp";

import { getLangfuse } from "../langfuse";
import type {
  ColorizeOptions,
  GeneratedImage,
  ImageGenerationOptions,
  ImageProviderInterface,
  ImageUsage,
} from "./image-provider-types";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

type KingCongConfig = {
  endpoint: string;
  baseUrl: string;
  imagePageUrl: string;
  model: string;
  userAgent: string;
  inlineCookie: string | null;
  sessionFile: string;
  userDataDir: string;
  reloginEnabled: boolean;
  pollInterval: number;
  pollTimeout: number;
};

function getConfig(): KingCongConfig {
  const baseUrl = (process.env.KINGCONG_BASE_URL || "https://kingcongstudio.com").replace(/\/$/, "");
  return {
    endpoint: process.env.KINGCONG_IMAGE_ENDPOINT || `${baseUrl}/ajaxs/image.php`,
    baseUrl,
    imagePageUrl: process.env.KINGCONG_IMAGE_PAGE_URL || `${baseUrl}/ai/image`,
    model: process.env.KINGCONG_IMAGE_MODEL || "gemini-3.1-flash-lite-image",
    userAgent: process.env.KINGCONG_USER_AGENT || DEFAULT_USER_AGENT,
    inlineCookie: process.env.KINGCONG_COOKIE?.trim() || null,
    sessionFile: resolve(process.env.KINGCONG_SESSION_FILE || ".kingcong-session.json"),
    userDataDir: resolve(process.env.KINGCONG_USER_DATA_DIR || ".kingcong-profile"),
    reloginEnabled: (process.env.KINGCONG_RELOGIN_ENABLED || "true") !== "false",
    pollInterval: Number(process.env.KINGCONG_POLL_INTERVAL) || 3,
    pollTimeout: Number(process.env.KINGCONG_POLL_TIMEOUT) || 500,
  };
}

// --- Response types ---

type CreateTaskResponse = { status: string; task_id: string; new_balance?: number };
type ResultImage = { id: string; width: number; height: number; imageUrl: string; mimeType: string };
type StatusResponse = {
  status: string;
  task_status?: string;
  result_images?: ResultImage[];
  cost?: number;
  progress?: number;
};

class KingCongSessionExpiredError extends Error {
  constructor(message = "KingCong session cookie expired or rejected") {
    super(message);
    this.name = "KingCongSessionExpiredError";
  }
}

// --- Session cookie (module-level cache) ---

let cachedCookie: string | null = null;

async function loadCookie(config: KingCongConfig): Promise<string> {
  if (config.inlineCookie) return config.inlineCookie;
  if (cachedCookie) return cachedCookie;

  try {
    const raw = await readFile(config.sessionFile, "utf8");
    const parsed = JSON.parse(raw) as { cookie?: string };
    if (parsed.cookie) {
      cachedCookie = parsed.cookie;
      return cachedCookie;
    }
  } catch {
    /* fall through */
  }

  if (config.reloginEnabled) return relogin(config);
  throw new KingCongSessionExpiredError(
    `Chưa có cookie: set KINGCONG_COOKIE hoặc tạo ${config.sessionFile} (chạy script login), ` +
      `và bật KINGCONG_RELOGIN_ENABLED để tự re-login.`,
  );
}

async function saveCookie(config: KingCongConfig, cookie: string): Promise<void> {
  cachedCookie = cookie;
  if (config.inlineCookie) return; // env-driven: nothing to persist
  await mkdir(dirname(config.sessionFile), { recursive: true });
  const doc = { cookie, source: "playwright", updatedAt: new Date().toISOString() };
  await writeFile(config.sessionFile, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

/**
 * Re-mint the session cookie. Two strategies, cheapest first:
 *
 *  1. HTTP remember-refresh (NO browser, NO Google): the site's `remember_*`
 *     token is a "remember me" credential. If we still hold it, a plain request
 *     makes KingCong reissue a fresh PHPSESSID. This covers the common case
 *     (only PHPSESSID expired) and sidesteps Google's "browser not secure"
 *     block on automated OAuth entirely.
 *  2. Playwright persistent profile — only when the remember token ALSO died,
 *     which needs a fresh (one-time, manual) Google login.
 */
async function relogin(config: KingCongConfig, staleCookie?: string): Promise<string> {
  // Strategy 1 — reuse the remember token over plain HTTP.
  if (staleCookie && /(?:^|;\s*)remember_/i.test(staleCookie)) {
    const refreshed = await httpRememberRefresh(config, staleCookie);
    if (refreshed) {
      await saveCookie(config, refreshed);
      return refreshed;
    }
  }

  if (config.inlineCookie) {
    throw new KingCongSessionExpiredError(
      "KINGCONG_COOKIE hết hạn (remember token cũng hết) — cập nhật lại cookie từ trình duyệt thật.",
    );
  }
  return reloginWithPlaywright(config);
}

/**
 * Ask KingCong to reissue a PHPSESSID using the still-valid `remember_*`
 * token. Returns the merged cookie if the result is authenticated, else null
 * (remember token dead → caller falls back to Playwright).
 */
async function httpRememberRefresh(
  config: KingCongConfig,
  staleCookie: string,
): Promise<string | null> {
  const res = await fetch(config.imagePageUrl, {
    headers: { cookie: staleCookie, "user-agent": config.userAgent, accept: "text/html" },
    redirect: "manual",
  });
  const setCookies: string[] = res.headers.getSetCookie?.() ?? [];
  const newSid = extractSetCookie(setCookies, "PHPSESSID");
  const merged = newSid ? mergeCookie(staleCookie, "PHPSESSID", newSid) : staleCookie;

  // A fresh PHPSESSID is also handed to anonymous visitors, so prove the merged
  // cookie is actually authenticated with a cheap check_status probe: authed →
  // JSON, unauthenticated → the login HTML SPA.
  const probe = await rawPost(
    config,
    () => ({
      body: new URLSearchParams({ action: "check_status", task_id: "__probe__" }).toString(),
      contentType: "application/x-www-form-urlencoded; charset=UTF-8",
    }),
    merged,
  );
  return probe.expired ? null : merged;
}

/** Extract a cookie value from a list of Set-Cookie header strings. */
function extractSetCookie(setCookies: string[], name: string): string | null {
  for (const sc of setCookies) {
    const m = sc.match(new RegExp(`^\\s*${name}=([^;]+)`));
    if (m) return m[1]!;
  }
  return null;
}

/** Replace (or append) one name=value pair inside a cookie header string. */
function mergeCookie(cookie: string, name: string, value: string): string {
  const parts = cookie
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !p.startsWith(`${name}=`));
  parts.unshift(`${name}=${value}`);
  return parts.join("; ");
}

/**
 * Re-mint the session cookie via a persistent (human-logged-in) Playwright
 * profile. Playwright is imported dynamically so it stays optional — only this
 * path needs it, and only in a long-running worker (never serverless).
 */
async function reloginWithPlaywright(config: KingCongConfig): Promise<string> {
  let chromium: {
    launchPersistentContext: (
      dir: string,
      opts: { headless?: boolean; userAgent?: string },
    ) => Promise<{
      pages: () => Array<{ goto: (u: string, o?: unknown) => Promise<unknown>; url: () => string; title: () => Promise<string> }>;
      newPage: () => Promise<{ goto: (u: string, o?: unknown) => Promise<unknown>; url: () => string; title: () => Promise<string> }>;
      cookies: (urls?: string) => Promise<Array<{ name: string; value: string }>>;
      close: () => Promise<void>;
    }>;
  };
  try {
    // @ts-ignore optional peer dependency resolved at runtime
    ({ chromium } = await import("playwright"));
  } catch {
    throw new KingCongSessionExpiredError(
      "Cần Playwright để tự re-login: yarn add -D playwright && npx playwright install chromium",
    );
  }

  const context = await chromium.launchPersistentContext(config.userDataDir, {
    headless: true,
    userAgent: config.userAgent,
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(config.imagePageUrl, { waitUntil: "networkidle", timeout: 60_000 });
    const title = await page.title().catch(() => "");
    if (/\/auth\/(login|register)/.test(page.url()) || /đăng nhập/i.test(title)) {
      throw new KingCongSessionExpiredError(
        `Playwright profile không còn đăng nhập. Chạy login THỦ CÔNG headed vào "${config.userDataDir}".`,
      );
    }
    const cookies = await context.cookies(config.baseUrl);
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    if (!/PHPSESSID=/.test(cookieHeader)) {
      throw new KingCongSessionExpiredError("Playwright không lấy được PHPSESSID.");
    }
    await saveCookie(config, cookieHeader);
    return cookieHeader;
  } finally {
    await context.close();
  }
}

// --- Low-level POST with a single transparent relogin-and-retry ---

async function post(
  config: KingCongConfig,
  build: () => { body: BodyInit; contentType?: string },
): Promise<unknown> {
  const cookie = await loadCookie(config);
  let outcome = await rawPost(config, build, cookie);

  if (outcome.expired) {
    if (!config.reloginEnabled) throw new KingCongSessionExpiredError(outcome.detail);
    const fresh = await relogin(config, cookie);
    outcome = await rawPost(config, build, fresh);
    if (outcome.expired) {
      throw new KingCongSessionExpiredError(`Vẫn bị từ chối sau relogin: ${outcome.detail}`);
    }
  }
  return outcome.json;
}

async function rawPost(
  config: KingCongConfig,
  build: () => { body: BodyInit; contentType?: string },
  cookie: string,
): Promise<{ expired: boolean; json?: unknown; detail: string }> {
  const { body, contentType } = build();
  const headers: Record<string, string> = {
    accept: "application/json, text/javascript, */*; q=0.01",
    origin: config.baseUrl,
    referer: config.imagePageUrl,
    "x-requested-with": "XMLHttpRequest",
    "user-agent": config.userAgent,
    cookie,
  };
  if (contentType) headers["content-type"] = contentType; // FormData sets its own boundary

  const res = await fetch(config.endpoint, { method: "POST", headers, body });
  const raw = await res.text();
  if (res.status === 401 || res.status === 403) return { expired: true, detail: `HTTP ${res.status}` };
  try {
    return { expired: false, json: JSON.parse(raw), detail: "ok" };
  } catch {
    // Non-JSON => the login HTML SPA => session gone.
    return { expired: true, detail: `Non-JSON response (HTTP ${res.status})` };
  }
}

// --- Task flow ---

function mapSize(size: ImageGenerationOptions["size"]): { aspect: string; resolution: string } {
  const resolution = process.env.KINGCONG_IMAGE_RESOLUTION || "1K";
  if (size === "1024x1792") return { aspect: "9:16", resolution };
  if (size === "1792x1024") return { aspect: "16:9", resolution };
  return { aspect: "1:1", resolution };
}

// KingCong rejects prompts over 4000 chars ("Mô tả tối đa 4000 ký tự"). Some
// shared prompts (cover-source, style) run 17k–28k chars — far longer than
// Diaflow/Vertex need. These prompts front-load the core directive, so keep the
// head and cut at a clean paragraph/line boundary under the limit.
//
// CRITICAL: KingCong counts a newline as CRLF (\n = 2 chars) when enforcing the
// limit, so the budget is on `length + newlineCount`, NOT raw string length. A
// line-heavy prompt trips 4000 while `.length` still reads under it (prod bug:
// 3960 chars + 132 newlines = 4092 → rejected). Cap on the CRLF-adjusted length
// with a small safety margin below the hard limit.
const KINGCONG_MAX_PROMPT_CHARS = 4000;
const KINGCONG_SAFE_PROMPT_CHARS = 3900;

/** CRLF-adjusted length: what KingCong counts (each \n costs 2). */
function crlfLength(s: string): number {
  let extra = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10 /* \n */) extra++;
  return s.length + extra;
}

export function capPrompt(prompt: string): string {
  if (crlfLength(prompt) <= KINGCONG_SAFE_PROMPT_CHARS) return prompt;
  // Walk forward, spending the CRLF budget (newline = 2), to find the longest
  // prefix that fits — then back up to a clean paragraph/line boundary.
  let end = 0;
  let budget = KINGCONG_SAFE_PROMPT_CHARS;
  while (end < prompt.length) {
    const cost = prompt.charCodeAt(end) === 10 ? 2 : 1;
    if (budget - cost < 0) break;
    budget -= cost;
    end++;
  }
  const head = prompt.slice(0, end);
  const lastBreak = Math.max(head.lastIndexOf("\n\n"), head.lastIndexOf("\n"));
  const cut = lastBreak > end * 0.6 ? head.slice(0, lastBreak) : head;
  const capped = cut.trimEnd();
  console.warn(
    `[KingCong] prompt ${prompt.length} chars / ${crlfLength(prompt)} CRLF > ${KINGCONG_SAFE_PROMPT_CHARS} — cắt còn ${capped.length} chars / ${crlfLength(capped)} CRLF (giữ phần đầu).`,
  );
  return capped;
}

async function createTask(
  config: KingCongConfig,
  prompt: string,
  size: ImageGenerationOptions["size"],
  image: { data: Uint8Array; filename: string; contentType: string } | null,
): Promise<string> {
  const { aspect, resolution } = mapSize(size);
  const json = (await post(config, () => {
    const form = new FormData();
    form.set("action", "create_task");
    form.set("model_id", config.model);
    form.set("prompt", capPrompt(prompt));
    form.set("generations_count", "1");
    form.set("aspect_ratio", aspect);
    form.set("resolution", resolution);
    form.set("negative_prompt", "");
    form.set("enhance_prompt", "0");
    form.set("res_type", "resolution");
    if (image) {
      const part = image.data as unknown as BlobPart;
      form.set("image", new Blob([part], { type: image.contentType }), image.filename);
    }
    return { body: form };
  })) as CreateTaskResponse;

  if (json?.status !== "success" || !json.task_id) {
    throw new Error(`KingCong create_task thất bại: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json.task_id;
}

async function waitForImageUrl(config: KingCongConfig, taskId: string): Promise<string> {
  const deadline = Date.now() + config.pollTimeout * 1000;
  for (;;) {
    const res = (await post(config, () => ({
      body: new URLSearchParams({ action: "check_status", task_id: taskId }).toString(),
      contentType: "application/x-www-form-urlencoded; charset=UTF-8",
    }))) as StatusResponse;

    const status = res.task_status ?? res.status;
    const url = res.result_images?.[0]?.imageUrl;
    if (status === "done" && url) return url;
    if (status === "failed" || status === "error") {
      throw new Error(`KingCong task lỗi: ${JSON.stringify(res).slice(0, 300)}`);
    }
    if (Date.now() >= deadline) {
      throw new Error(`KingCong timeout sau ${config.pollTimeout}s (task ${taskId})`);
    }
    await sleep(config.pollInterval * 1000);
  }
}

// --- Helpers ---

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Fetch a remote image and convert to base64 (matches Diaflow's contract). */
async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`KingCong: tải ảnh kết quả thất bại (${res.status}): ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type") || "image/jpeg";
  return { data: buffer.toString("base64"), mimeType };
}

/** Download the edit source (http(s) or data: URL) into bytes for the `image` field. */
async function downloadSource(
  url: string,
): Promise<{ data: Uint8Array; filename: string; contentType: string }> {
  if (url.startsWith("data:")) {
    const [header, b64] = url.split(",");
    const contentType = header.match(/data:(.*?);/)?.[1] || "image/jpeg";
    return { data: new Uint8Array(Buffer.from(b64, "base64")), filename: "source.jpg", contentType };
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`KingCong: tải ảnh nguồn thất bại (${res.status}): ${url}`);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const ext = contentType.includes("png") ? "png" : "jpg";
  return {
    data: new Uint8Array(Buffer.from(await res.arrayBuffer())),
    filename: `source.${ext}`,
    contentType,
  };
}

type SourceImage = { data: Uint8Array; filename: string; contentType: string };

// The facade (image-provider.ts) uses this exact 1×1 white PNG as a throwaway
// "primary" for reference-only flows (character/location extraction), passing
// the REAL source scene in referenceImageUrls. KingCong's single `image` slot
// must carry the real source, so we recognise and drop this placeholder instead
// of sending a blank canvas and losing the source.
const BLANK_WHITE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

function isBlankPlaceholder(url: string): boolean {
  return url.includes(BLANK_WHITE_PNG_BASE64);
}

/**
 * KingCong's ajaxs/image.php accepts a SINGLE `image` file, but some flows need
 * several references at once (character + location + art-style). Instead of
 * dropping the extras, tile every reference into one horizontal montage on a
 * white ground so the model still sees them all through the one allowed slot.
 */
async function compositeSources(sources: SourceImage[]): Promise<SourceImage> {
  const TARGET_HEIGHT = 1024;
  const GAP = 24;
  const tiles = await Promise.all(
    sources.map(async (s) => {
      const buf = await sharp(Buffer.from(s.data))
        .resize({ height: TARGET_HEIGHT, fit: "inside" })
        .png()
        .toBuffer();
      const meta = await sharp(buf).metadata();
      return { buf, width: meta.width ?? TARGET_HEIGHT, height: meta.height ?? TARGET_HEIGHT };
    }),
  );
  const height = Math.max(...tiles.map((t) => t.height));
  const width = tiles.reduce((sum, t) => sum + t.width, 0) + GAP * (tiles.length - 1);
  let left = 0;
  const overlays = tiles.map((t) => {
    const layer = { input: t.buf, left, top: Math.floor((height - t.height) / 2) };
    left += t.width + GAP;
    return layer;
  });
  const out = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
    .composite(overlays)
    .png()
    .toBuffer();
  return { data: new Uint8Array(out), filename: "composite.png", contentType: "image/png" };
}

/**
 * Choose the single `image` KingCong should send for an edit. Drops the facade's
 * blank placeholder so the real reference isn't lost, and composites when more
 * than one real reference survives — so nothing is ever silently dropped.
 */
async function resolveEditSource(
  imageUrl: string,
  referenceImageUrls: string[] | undefined,
): Promise<SourceImage> {
  const candidates = [imageUrl, ...(referenceImageUrls ?? [])].filter(Boolean);
  const realUrls = candidates.filter((u) => !isBlankPlaceholder(u));
  const chosen = realUrls.length ? realUrls : candidates; // never end up empty
  const sources = await Promise.all(chosen.map(downloadSource));
  return sources.length === 1 ? sources[0]! : compositeSources(sources);
}

function logToLangfuse(
  operation: string,
  prompt: string,
  usage: ImageUsage | undefined,
  options?: ImageGenerationOptions,
): void {
  const lf = getLangfuse();
  if (!lf) return;
  const trace = lf.trace({
    name: options?.trace?.caller || `kingcong/${operation}`,
    metadata: { entityType: options?.trace?.entityType, entityId: options?.trace?.entityId },
  });
  trace.generation({ name: operation, model: getConfig().model, input: prompt, usage });
}

// --- Image Provider ---

export const kingcongImageProvider: ImageProviderInterface = {
  async generateImage(
    prompt: string,
    options: ImageGenerationOptions = {},
  ): Promise<GeneratedImage> {
    const config = getConfig();
    const taskId = await createTask(config, prompt, options.size, null);
    const imageUrl = await waitForImageUrl(config, taskId);
    const { data, mimeType } = await fetchAsBase64(imageUrl);
    logToLangfuse("generateImage", prompt, undefined, options);
    return { base64: data, dataUrl: `data:${mimeType};base64,${data}` };
  },

  async editImage(
    imageUrl: string,
    prompt: string,
    options: ColorizeOptions = {},
  ): Promise<GeneratedImage> {
    const config = getConfig();
    // ajaxs/image.php has a single `image` slot. resolveEditSource keeps every
    // reference in play: it drops the facade's blank placeholder and composites
    // multiple real references into one montage rather than dropping them.
    const source = await resolveEditSource(imageUrl, options.referenceImageUrls);
    const taskId = await createTask(config, prompt, options.size, source);
    const resultUrl = await waitForImageUrl(config, taskId);
    const { data, mimeType } = await fetchAsBase64(resultUrl);
    logToLangfuse("editImage", prompt, undefined, options);
    return { base64: data, dataUrl: `data:${mimeType};base64,${data}` };
  },
};
