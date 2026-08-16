// apps/admin/src/app/api/cover-prompt/route.test.ts
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@vx/server-core/ai", () => ({
  buildCoverSourceBWPrompt: (ts: string) => `PROMPT_FOR_${ts}`,
}));

import { GET } from "./route";

const req = (qs: string) => new NextRequest(`http://localhost/api/cover-prompt${qs}`);

describe("GET /api/cover-prompt", () => {
  it.each(["top", "middle", "bottom"] as const)("returns the default prompt for %s", async (pos) => {
    const res = await GET(req(`?titleSafe=${pos}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ titleSafe: pos, prompt: `PROMPT_FOR_${pos}` });
  });

  it("400s on a missing titleSafe", async () => {
    expect((await GET(req(""))).status).toBe(400);
  });

  it("400s on an invalid titleSafe", async () => {
    expect((await GET(req("?titleSafe=side"))).status).toBe(400);
  });
});
