/**
 * KingCong image provider — session cookie + Playwright relogin fallback.
 * global.fetch is mocked; Playwright is mocked so the relogin path is exercised
 * without a real browser. Each test re-imports the module (vi.resetModules) so
 * the module-level cookie cache doesn't leak across cases.
 */
import { mkdtempSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocked Playwright — launchPersistentContext yields a context whose cookies()
// returns a fresh PHPSESSID. Reused by the relogin test.
const gotoMock = vi.fn().mockResolvedValue(undefined);
vi.mock("playwright", () => ({
  chromium: {
    launchPersistentContext: vi.fn().mockResolvedValue({
      pages: () => [{ goto: gotoMock, url: () => "https://kingcongstudio.com/ai/image", title: async () => "AI Image" }],
      newPage: async () => ({ goto: gotoMock, url: () => "https://kingcongstudio.com/ai/image", title: async () => "AI Image" }),
      cookies: async () => [{ name: "PHPSESSID", value: "fresh" }],
      close: async () => undefined,
    }),
  },
}));

const ENV_KEYS = [
  "IMAGE_PROVIDER", "KINGCONG_COOKIE", "KINGCONG_SESSION_FILE", "KINGCONG_USER_DATA_DIR",
  "KINGCONG_RELOGIN_ENABLED", "KINGCONG_POLL_INTERVAL", "KINGCONG_POLL_TIMEOUT",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.KINGCONG_POLL_INTERVAL = "0";
  process.env.KINGCONG_POLL_TIMEOUT = "10";
  vi.resetModules();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
  vi.restoreAllMocks();
  gotoMock.mockClear();
});

// --- fetch mock helpers ---

function jsonRes(body: unknown) {
  return { status: 200, text: async (): Promise<string> => JSON.stringify(body) };
}
function htmlRes() {
  return { status: 200, text: async (): Promise<string> => "<!DOCTYPE html><title>Đăng Nhập</title>" };
}
function bytesRes(contentType = "image/jpeg") {
  return {
    status: 200,
    ok: true,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? contentType : null) },
    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  };
}

const ENDPOINT = "https://kingcongstudio.com/ajaxs/image.php";
const CDN = "https://cdn.ai33.pro/imagen2/T1/x.jpg";

/** Build a fetch mock that answers create → status(done) → CDN download. */
function happyFetch() {
  return vi.fn(async (url: string, init?: { body?: unknown }) => {
    if (url === ENDPOINT) {
      const isStatus = typeof init?.body === "string" && init.body.includes("check_status");
      return isStatus
        ? jsonRes({ status: "success", task_status: "done", result_images: [{ imageUrl: CDN, width: 1024, height: 1024, mimeType: "image/jpeg" }] })
        : jsonRes({ status: "success", task_id: "T1", new_balance: 100 });
    }
    return bytesRes(); // CDN or source download
  });
}

describe("kingcongImageProvider", () => {
  it("generateImage: create → poll → base64 (inline cookie)", async () => {
    process.env.KINGCONG_COOKIE = "PHPSESSID=good";
    const fetchMock = happyFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { kingcongImageProvider } = await import("./image-provider-kingcong");
    const img = await kingcongImageProvider.generateImage("a cat coloring page");

    expect(img.base64).toBe(Buffer.from([1, 2, 3, 4]).toString("base64"));
    expect(img.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    // first POST carried the inline cookie
    const firstPost = fetchMock.mock.calls.find((c) => c[0] === ENDPOINT)!;
    expect((firstPost[1] as { headers: Record<string, string> }).headers.cookie).toBe("PHPSESSID=good");
  });

  it("editImage: downloads source then sends create_task with image", async () => {
    process.env.KINGCONG_COOKIE = "PHPSESSID=good";
    const fetchMock = happyFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { kingcongImageProvider } = await import("./image-provider-kingcong");
    const img = await kingcongImageProvider.editImage("https://src/page.jpg", "make a variation");

    expect(img.dataUrl.startsWith("data:")).toBe(true);
    // source image was downloaded (a non-endpoint GET happened)
    expect(fetchMock.mock.calls.some((c) => c[0] === "https://src/page.jpg")).toBe(true);
  });

  it("editImage: drops the blank placeholder and sends the real reference", async () => {
    process.env.KINGCONG_COOKIE = "PHPSESSID=good";
    const fetchMock = happyFetch();
    vi.stubGlobal("fetch", fetchMock);

    // Mirrors the facade's character/location extraction call: primary is the
    // 1×1 white placeholder, the real source rides in referenceImageUrls.
    const blank =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    const { kingcongImageProvider } = await import("./image-provider-kingcong");
    await kingcongImageProvider.editImage(blank, "extract the character", {
      referenceImageUrls: ["https://src/scene.jpg"],
    });

    // The real reference WAS downloaded (the blank data URL needs no fetch),
    // proving the source is used as the `image`, not dropped.
    expect(fetchMock.mock.calls.some((c) => c[0] === "https://src/scene.jpg")).toBe(true);
  });

  it("editImage: composites multiple real references into one image (none dropped)", async () => {
    process.env.KINGCONG_COOKIE = "PHPSESSID=good";
    const fetchMock = happyFetch();
    vi.stubGlobal("fetch", fetchMock);

    const pngDataUrl = async (color: string): Promise<string> => {
      const buf = await sharp({ create: { width: 4, height: 4, channels: 3, background: color } })
        .png()
        .toBuffer();
      return `data:image/png;base64,${buf.toString("base64")}`;
    };
    const primary = await pngDataUrl("#ff0000");
    const ref = await pngDataUrl("#00ff00");

    const { kingcongImageProvider } = await import("./image-provider-kingcong");
    const img = await kingcongImageProvider.editImage(primary, "combine references", {
      referenceImageUrls: [ref],
    });

    // Both inputs are data URLs (no source fetch), yet create_task still ran —
    // meaning compositeSources merged them into the single `image` slot.
    expect(img.dataUrl.startsWith("data:")).toBe(true);
    expect(fetchMock.mock.calls.some((c) => c[0] === ENDPOINT)).toBe(true);
  });

  it("re-logins via Playwright and retries when the cookie is expired", async () => {
    const sessionFile = join(mkdtempSync(join(tmpdir(), "kc-")), "session.json");
    process.env.KINGCONG_SESSION_FILE = sessionFile;
    process.env.KINGCONG_USER_DATA_DIR = join(tmpdir(), "kc-profile");
    process.env.KINGCONG_RELOGIN_ENABLED = "true";
    delete process.env.KINGCONG_COOKIE;

    // First endpoint POST (with bootstrapped cookie) → HTML login (expired);
    // after relogin, subsequent POSTs succeed.
    let endpointPosts = 0;
    const fetchMock = vi.fn(async (url: string, init?: { body?: unknown }) => {
      if (url === ENDPOINT) {
        endpointPosts += 1;
        if (endpointPosts === 1) return htmlRes();
        const isStatus = typeof init?.body === "string" && init.body.includes("check_status");
        return isStatus
          ? jsonRes({ status: "success", task_status: "done", result_images: [{ imageUrl: CDN, mimeType: "image/jpeg", width: 1, height: 1 }] })
          : jsonRes({ status: "success", task_id: "T2" });
      }
      return bytesRes();
    });
    vi.stubGlobal("fetch", fetchMock);

    const { kingcongImageProvider } = await import("./image-provider-kingcong");
    const img = await kingcongImageProvider.generateImage("prompt");

    expect(img.dataUrl.startsWith("data:")).toBe(true);
    // relogin happened (Playwright navigated) and fresh cookie was persisted
    expect(gotoMock).toHaveBeenCalled();
    const persisted = JSON.parse(await readFile(sessionFile, "utf8"));
    expect(persisted.cookie).toBe("PHPSESSID=fresh");
    expect(persisted.source).toBe("playwright");
    // the retry POST used the fresh cookie
    const retry = fetchMock.mock.calls.filter((c) => c[0] === ENDPOINT)[1]!;
    expect((retry[1] as { headers: Record<string, string> }).headers.cookie).toBe("PHPSESSID=fresh");
  });

  it("refreshes PHPSESSID over HTTP via the remember token (no Playwright)", async () => {
    const sessionFile = join(mkdtempSync(join(tmpdir(), "kc-")), "session.json");
    await writeFile(
      sessionFile,
      JSON.stringify({ cookie: "PHPSESSID=stale; remember_ai84=keep", source: "manual" }),
    );
    process.env.KINGCONG_SESSION_FILE = sessionFile;
    process.env.KINGCONG_RELOGIN_ENABLED = "true";
    delete process.env.KINGCONG_COOKIE;

    const IMAGE_PAGE = "https://kingcongstudio.com/ai/image";
    const fetchMock = vi.fn(async (url: string, init?: { body?: unknown; headers?: Record<string, string> }) => {
      if (url === IMAGE_PAGE) {
        // remember-refresh GET → hand back a fresh PHPSESSID via Set-Cookie
        return { status: 200, headers: { getSetCookie: () => ["PHPSESSID=newsid; Path=/; HttpOnly"] }, text: async (): Promise<string> => "" };
      }
      if (url === ENDPOINT) {
        const body = String(init?.body ?? "");
        const cookie = init?.headers?.cookie ?? "";
        if (body.includes("__probe__")) return jsonRes({ status: "success", task_status: "error" }); // authed JSON
        if (body.includes("check_status"))
          return jsonRes({ status: "success", task_status: "done", result_images: [{ imageUrl: CDN, mimeType: "image/jpeg", width: 1, height: 1 }] });
        // create_task: stale cookie → expired HTML; refreshed cookie → success
        return cookie.includes("PHPSESSID=stale") ? htmlRes() : jsonRes({ status: "success", task_id: "T3" });
      }
      return bytesRes();
    });
    vi.stubGlobal("fetch", fetchMock);

    const { kingcongImageProvider } = await import("./image-provider-kingcong");
    const img = await kingcongImageProvider.generateImage("prompt");

    expect(img.dataUrl.startsWith("data:")).toBe(true);
    expect(gotoMock).not.toHaveBeenCalled(); // Playwright NOT used
    const persisted = JSON.parse(await readFile(sessionFile, "utf8"));
    expect(persisted.cookie).toContain("PHPSESSID=newsid");
    expect(persisted.cookie).toContain("remember_ai84=keep"); // remember token preserved
  });

  it("throws when expired and relogin is disabled (inline cookie)", async () => {
    process.env.KINGCONG_COOKIE = "PHPSESSID=stale";
    process.env.KINGCONG_RELOGIN_ENABLED = "false";
    vi.stubGlobal("fetch", vi.fn(async () => htmlRes()));

    const { kingcongImageProvider } = await import("./image-provider-kingcong");
    await expect(kingcongImageProvider.generateImage("x")).rejects.toThrow(/expired|rejected|Non-JSON/i);
  });
});

describe("capPrompt", () => {
  // KingCong rejects prompts over 4000 chars, counting each newline as CRLF
  // (\n = 2). The cap must fit the CRLF-adjusted length, not raw string length —
  // a line-heavy prompt can blow past 4000 while `.length` still reads under it
  // (the real prod bug: 3960 chars + 132 newlines = 4092).
  const KINGCONG_LIMIT = 4000;
  const crlfLen = (s: string): number => s.length + (s.match(/\n/g)?.length ?? 0);

  beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => undefined));

  it("caps a line-heavy prompt so its CRLF-adjusted length stays within KingCong's limit", async () => {
    // ~4000 short lines: raw length ~8000, but CRLF length ~12000. The old cap
    // (raw length ≤ 4000) leaves CRLF length well over the limit.
    const prompt = Array.from({ length: 4000 }, (_, i) => `line ${i}`).join("\n");
    const { capPrompt } = await import("./image-provider-kingcong");

    const capped = capPrompt(prompt);

    expect(crlfLen(capped)).toBeLessThanOrEqual(KINGCONG_LIMIT);
  });

  it("returns a short prompt unchanged (no cap needed)", async () => {
    const prompt = "a cat coloring page\nwith a hat";
    const { capPrompt } = await import("./image-provider-kingcong");
    expect(capPrompt(prompt)).toBe(prompt);
  });
});
