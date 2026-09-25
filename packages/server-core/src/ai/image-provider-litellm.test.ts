/**
 * LiteLLM image provider — the OpenAI images API branch (gpt-image-2, Qwen-Image 2.1).
 *
 * litellmFetch is mocked so no network is touched; global.fetch is spied on to
 * prove the result-url download goes through litellmFetch (which carries the
 * self-signed-cert trust) and never through the global fetch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const litellmFetchMock = vi.fn();
vi.mock("./litellm-dispatcher", () => ({
  litellmFetch: (...args: unknown[]) => litellmFetchMock(...args),
}));

const ENV_KEYS = [
  "LITELLM_BASE_URL",
  "LITELLM_API_KEY",
  "LITELLM_IMAGE_MODEL",
  "LITELLM_IMAGE_API_MODELS",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.LITELLM_BASE_URL = "https://litellm.test";
  process.env.LITELLM_API_KEY = "sk-test";
  process.env.LITELLM_IMAGE_MODEL = "gemini-3.1-flash-image";
  delete process.env.LITELLM_IMAGE_API_MODELS; // exercise the built-in default
  litellmFetchMock.mockReset();
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
  vi.restoreAllMocks();
});

const QWEN = "qwen-image-2.1";
const ASSET_URL = "https://vxsolutions.ddns.net:52521/assets/abc.png";

async function loadProvider() {
  return (await import("./image-provider-litellm")).litellmImageProvider;
}

/** A Response-alike carrying binary image bytes. */
function imageRes(contentType = "image/png", bytes = new Uint8Array([137, 80, 78, 71])) {
  return {
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? contentType : null) },
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

/** A Response-alike for the images API JSON envelope. */
function apiRes(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/**
 * Route the two calls a url-returning generation makes: the images API call,
 * then the asset download.
 */
function routeGeneration(entry: Record<string, unknown>, assetRes: unknown = imageRes()) {
  litellmFetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/v1/images/")) return apiRes({ data: [entry] });
    return assetRes;
  });
}

/** The JSON body of the nth litellmFetch call that hit the images API. */
function generationBody(): Record<string, unknown> {
  const call = litellmFetchMock.mock.calls.find((c) => String(c[0]).includes("/v1/images/"));
  if (!call) throw new Error("no images API call was made");
  return JSON.parse((call[1] as { body: string }).body);
}

describe("litellm image provider — images API routing", () => {
  it("routes qwen-image-2.1 to /v1/images/generations, not chat-completions", async () => {
    routeGeneration({ url: ASSET_URL });
    const provider = await loadProvider();

    await provider.generateImage("a duck", { model: QWEN });

    const urls = litellmFetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.endsWith("/v1/images/generations"))).toBe(true);
    expect(urls.some((u) => u.includes("/chat/completions"))).toBe(false);
  });

  it("keeps gemini on chat-completions", async () => {
    litellmFetchMock.mockResolvedValue(
      apiRes({
        choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,QUJD" } }] } }],
      }),
    );
    const provider = await loadProvider();

    await provider.generateImage("a duck", { model: "gemini-3.1-flash-image" });

    const urls = litellmFetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/chat/completions"))).toBe(true);
    expect(urls.some((u) => u.includes("/v1/images/"))).toBe(false);
  });

  it("honours an explicit LITELLM_IMAGE_API_MODELS csv over the default pattern", async () => {
    process.env.LITELLM_IMAGE_API_MODELS = "gpt-image,dall-e,qwen-image";
    routeGeneration({ url: ASSET_URL });
    const provider = await loadProvider();

    await provider.generateImage("a duck", { model: QWEN });

    expect(litellmFetchMock.mock.calls.some((c) => String(c[0]).includes("/v1/images/"))).toBe(
      true,
    );
  });
});

describe("litellm image provider — size handling", () => {
  it("asks qwen for a square size even when a portrait aspect is requested", async () => {
    routeGeneration({ url: ASSET_URL });
    const provider = await loadProvider();

    await provider.generateImage("a lighthouse", { model: QWEN, aspectRatio: "3:4" });

    // Non-square would survive to normalizeGeneratedImage(), which center-crops
    // to a square and would cut the top and bottom off the render.
    expect(generationBody().size).toBe("1024x1024");
  });

  it("asks qwen for a square size even when a landscape aspect is requested", async () => {
    routeGeneration({ url: ASSET_URL });
    const provider = await loadProvider();

    await provider.generateImage("a wide meadow", { model: QWEN, aspectRatio: "16:9" });

    expect(generationBody().size).toBe("1024x1024");
  });

  it("still maps the aspect hint for gpt-image-2, which ignores size anyway", async () => {
    routeGeneration({ b64_json: "QUJD" });
    const provider = await loadProvider();

    await provider.generateImage("a lighthouse", { model: "gpt-image-2", aspectRatio: "3:4" });

    expect(generationBody().size).toBe("1024x1536");
  });
});

describe("litellm image provider — edit reference images", () => {
  /** Count the multipart "image" parts on the edits request. */
  function imagePartCount(): number {
    const call = litellmFetchMock.mock.calls.find((c) => String(c[0]).includes("/v1/images/edits"));
    if (!call) throw new Error("no images/edits call was made");
    const form = (call[1] as { body: { getAll(k: string): unknown[] } }).body;
    return form.getAll("image").length;
  }

  it("drops style references for qwen, which would otherwise be returned instead of the source", async () => {
    routeGeneration({ b64_json: "QUJD" });
    const provider = await loadProvider();

    await provider.editImage("data:image/png;base64,QUJD", "colorize", {
      model: QWEN,
      referenceImageUrls: ["data:image/png;base64,REYx", "data:image/png;base64,REYy"],
    });

    // Source only. With the references attached this model returns the LAST
    // image's subject — a colorized style sample, not the colorized page.
    expect(imagePartCount()).toBe(1);
  });

  it("keeps style references for gpt-image-2, which composites them correctly", async () => {
    routeGeneration({ b64_json: "QUJD" });
    const provider = await loadProvider();

    await provider.editImage("data:image/png;base64,QUJD", "colorize", {
      model: "gpt-image-2",
      referenceImageUrls: ["data:image/png;base64,REYx"],
    });

    expect(imagePartCount()).toBe(2);
  });
});

describe("litellm image provider — result envelope", () => {
  it("returns b64_json straight through without a second request", async () => {
    routeGeneration({ b64_json: "QUJD" });
    const provider = await loadProvider();

    const img = await provider.generateImage("a duck", { model: QWEN });

    expect(img.base64).toBe("QUJD");
    expect(img.dataUrl).toBe("data:image/png;base64,QUJD");
    // Only the images API call — no asset download.
    expect(litellmFetchMock).toHaveBeenCalledTimes(1);
  });

  it("downloads a result url through litellmFetch, never the global fetch", async () => {
    const globalFetch = vi.spyOn(globalThis, "fetch");
    routeGeneration({ url: ASSET_URL });
    const provider = await loadProvider();

    const img = await provider.generateImage("a duck", { model: QWEN });

    // The asset host serves a self-signed cert; the global fetch would fail TLS.
    expect(litellmFetchMock.mock.calls.map((c) => String(c[0]))).toContain(ASSET_URL);
    expect(globalFetch).not.toHaveBeenCalled();
    expect(img.base64).toBe(Buffer.from([137, 80, 78, 71]).toString("base64"));
  });

  it("rejects an XML error body served under HTTP 200", async () => {
    // MinIO answers some failures this way, so res.ok alone would let an XML
    // blob through as if it were a PNG.
    routeGeneration({ url: ASSET_URL }, imageRes("application/xml"));
    const provider = await loadProvider();

    await expect(provider.generateImage("a duck", { model: QWEN })).rejects.toThrow(
      /returned application\/xml, expected an image/,
    );
  });

  it("reports the status and url when the asset has expired", async () => {
    routeGeneration(
      { url: ASSET_URL },
      {
        ok: false,
        status: 404,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(0),
      },
    );
    const provider = await loadProvider();

    await expect(provider.generateImage("a duck", { model: QWEN })).rejects.toThrow(
      new RegExp(
        `failed to fetch result url \\(404\\): ${ASSET_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      ),
    );
  });

  it("carries the real mime type into the data url instead of assuming png", async () => {
    routeGeneration({ url: ASSET_URL }, imageRes("image/webp"));
    const provider = await loadProvider();

    const img = await provider.generateImage("a duck", { model: QWEN });

    expect(img.dataUrl.startsWith("data:image/webp;base64,")).toBe(true);
  });

  it("rejects an empty body", async () => {
    routeGeneration({ url: ASSET_URL }, imageRes("image/png", new Uint8Array([])));
    const provider = await loadProvider();

    await expect(provider.generateImage("a duck", { model: QWEN })).rejects.toThrow(
      /returned an empty body/,
    );
  });

  it("rejects an entry carrying neither b64_json nor url", async () => {
    routeGeneration({});
    const provider = await loadProvider();

    await expect(provider.generateImage("a duck", { model: QWEN })).rejects.toThrow(
      /neither b64_json nor url/,
    );
  });
});
