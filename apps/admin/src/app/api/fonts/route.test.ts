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

const b64 = Buffer.from("fake-font").toString("base64");

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

  it("POST uploads + creates a font row", async () => {
    create.mockResolvedValue({ id: "f9", name: "Foo", fileUrl: "https://r2/fonts/x.woff2", format: "woff2" });
    const res = await POST(new NextRequest("http://localhost/api/fonts", { method: "POST", body: JSON.stringify({ name: "Foo", base64: b64, format: "woff2" }) }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.font.id).toBe("f9");
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0].data.format).toBe("woff2");
  });
});
