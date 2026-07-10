import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

describe("GET /api/proxy-image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when url param is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/proxy-image");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("url query param is required");
  });

  it("returns 400 when url param is invalid", async () => {
    const req = new NextRequest("http://localhost:3000/api/proxy-image?url=not-a-url");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("invalid url");
  });

  it("returns 403 when host is not allowed", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/proxy-image?url=https://evil.com/image.jpg",
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("host not allowed");
  });

  it("returns 200 and proxies image for allowed R2 host", async () => {
    const mockImageBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
    global.fetch = vi.fn().mockResolvedValue(
      new Response(mockImageBuffer, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );

    const req = new NextRequest(
      "http://localhost:3000/api/proxy-image?url=https://bucket.r2.dev/image.jpg",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Cache-Control")).toContain("max-age=3600");
  });

  it("returns 200 and proxies image for allowed Diaflow CDN host", async () => {
    const mockImageBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // JPEG header
    global.fetch = vi.fn().mockResolvedValue(
      new Response(mockImageBuffer, {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      }),
    );

    const req = new NextRequest(
      "http://localhost:3000/api/proxy-image?url=https://cdn.diaflow.io/image.jpg",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("allows a host from R2_PUBLIC_BASE_URL env var", async () => {
    const prev = process.env.R2_PUBLIC_BASE_URL;
    process.env.R2_PUBLIC_BASE_URL = "https://assets.example.com";
    try {
      const mockImageBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
      global.fetch = vi.fn().mockResolvedValue(
        new Response(mockImageBuffer, {
          status: 200,
          headers: { "Content-Type": "image/png" },
        }),
      );

      const req = new NextRequest(
        "http://localhost:3000/api/proxy-image?url=" +
          encodeURIComponent("https://assets.example.com/path/to/img.png"),
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/png");
    } finally {
      if (prev === undefined) delete process.env.R2_PUBLIC_BASE_URL;
      else process.env.R2_PUBLIC_BASE_URL = prev;
    }
  });
});
