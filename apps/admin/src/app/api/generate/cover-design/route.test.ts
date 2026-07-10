import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the LLM provider BEFORE importing the route
vi.mock("@vx/server-core/ai/llm-provider", () => ({
  visionAnalyzeJSON: vi.fn(),
}));
vi.mock("@vx/server-core/text-overlay", async () => {
  return {
    FONT_CATALOG: [
      { id: "fredoka", family: "Fredoka", weights: [400, 700] },
      { id: "inter", family: "Inter", weights: [400, 700] },
    ],
  };
});

import { POST } from "./route";
import { visionAnalyzeJSON } from "@vx/server-core/ai/llm-provider";

const PACK = {
  titles: ["Dino Time"],
  subtitles: ["For little explorers"],
  brandLines: ["Kids Coloring Club"],
  fontPairs: [{ id: "p1", display: "Fredoka", body: "Inter" }],
  palettes: [{ id: "pa1", name: "warm", background: "#fff", primary: "#000", secondary: "#111", accent: "#222" }],
  layoutHint: "centered" as const,
};

describe("POST /api/generate/cover-design", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when sourceThumbnailUrl is missing", async () => {
    const req = new NextRequest("http://localhost/api/generate/cover-design", {
      method: "POST",
      body: JSON.stringify({ bookContext: { title: "T" } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when bookContext.title is missing", async () => {
    const req = new NextRequest("http://localhost/api/generate/cover-design", {
      method: "POST",
      body: JSON.stringify({ sourceThumbnailUrl: "https://r2/x.png", bookContext: {} }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns CoverDesignPack on success", async () => {
    (visionAnalyzeJSON as ReturnType<typeof vi.fn>).mockResolvedValueOnce(PACK);
    const req = new NextRequest("http://localhost/api/generate/cover-design", {
      method: "POST",
      body: JSON.stringify({
        sourceThumbnailUrl: "https://r2/x.png",
        bookContext: { title: "Dino Adventures", ageRange: "4-8" },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.titles).toEqual(["Dino Time"]);
    expect(body.layoutHint).toBe("centered");
  });

  it("returns 500 on LLM failure", async () => {
    (visionAnalyzeJSON as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Diaflow down"));
    const req = new NextRequest("http://localhost/api/generate/cover-design", {
      method: "POST",
      body: JSON.stringify({
        sourceThumbnailUrl: "https://r2/x.png",
        bookContext: { title: "T" },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
