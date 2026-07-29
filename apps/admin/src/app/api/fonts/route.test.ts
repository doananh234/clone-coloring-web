import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const create = vi.fn();
const findMany = vi.fn();
vi.mock("@vx/db", () => ({ prisma: { font: { create: (...a: unknown[]) => create(...a), findMany: (...a: unknown[]) => findMany(...a) } } }));
vi.mock("@vx/server-core/r2", () => ({
  getR2Config: () => ({}),
  createR2Client: () => ({}),
  uploadToR2: vi.fn(async ({ key }: { key: string }) => ({ url: `https://r2/${key}` })),
}));

import { GET, POST } from "./route";

// TrueType magic bytes (0x00 0x01 0x00 0x00) + padding so it passes the
// magic-byte sniff for .ttf/.otf declared formats.
const ttfBytes = Buffer.concat([Buffer.from([0x00, 0x01, 0x00, 0x00]), Buffer.from("payload")]);
const b64 = ttfBytes.toString("base64");
// WOFF2 magic bytes ("wOF2") for the woff2 happy path.
const woff2Bytes = Buffer.concat([Buffer.from("wOF2"), Buffer.from("payload")]);
const woff2B64 = woff2Bytes.toString("base64");
// A non-font body (plain text) — must be rejected by the byte check.
const nonFontB64 = Buffer.from("fake-font").toString("base64");

describe("/api/fonts", () => {
  beforeEach(() => { create.mockReset(); findMany.mockReset(); });

  it("GET lists fonts", async () => {
    findMany.mockResolvedValue([{ id: "f1", name: "Foo", fileUrl: "u", format: "woff2" }]);
    const res = await GET();
    const json = await res.json();
    expect(json.data).toHaveLength(1);
  });

  it("POST rejects missing name/base64", async () => {
    const res = await POST(new NextRequest("http://localhost/api/fonts", { method: "POST", body: JSON.stringify({ format: "woff2" }) }));
    expect(res.status).toBe(400);
  });

  it("POST rejects disallowed format", async () => {
    const res = await POST(new NextRequest("http://localhost/api/fonts", { method: "POST", body: JSON.stringify({ name: "F", base64: b64, format: "exe" }) }));
    expect(res.status).toBe(400);
  });

  it("POST rejects oversized file (>2MB)", async () => {
    const big = Buffer.alloc(2 * 1024 * 1024 + 10).toString("base64");
    const res = await POST(new NextRequest("http://localhost/api/fonts", { method: "POST", body: JSON.stringify({ name: "F", base64: big, format: "ttf" }) }));
    expect(res.status).toBe(400);
  });

  it("POST rejects a valid format but non-font byte body", async () => {
    const res = await POST(new NextRequest("http://localhost/api/fonts", { method: "POST", body: JSON.stringify({ name: "F", base64: nonFontB64, format: "ttf" }) }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("File không phải font hợp lệ");
    expect(create).not.toHaveBeenCalled();
  });

  it("POST rejects woff2 format with non-woff2 (ttf) bytes", async () => {
    const res = await POST(new NextRequest("http://localhost/api/fonts", { method: "POST", body: JSON.stringify({ name: "F", base64: b64, format: "woff2" }) }));
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("POST uploads + creates a font row", async () => {
    create.mockResolvedValue({ id: "f9", name: "Foo", fileUrl: "https://r2/fonts/x.woff2", format: "woff2" });
    const res = await POST(new NextRequest("http://localhost/api/fonts", { method: "POST", body: JSON.stringify({ name: "Foo", base64: woff2B64, format: "woff2" }) }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.font.id).toBe("f9");
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0].data.format).toBe("woff2");
  });
});
