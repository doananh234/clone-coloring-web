// apps/admin/src/app/api/intro-regen-prompt/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
vi.mock("@vx/db", () => ({
  prisma: { book: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

import { GET } from "./route";

const get = (qs: string) => GET(new NextRequest(`http://localhost/api/intro-regen-prompt${qs}`));

describe("GET /api/intro-regen-prompt", () => {
  beforeEach(() => {
    findUnique.mockReset();
    findUnique.mockResolvedValue({ title: "Dinosaur Adventures", subtitle: "50 Fun Pages" });
  });

  it("inlines the book's title and subtitle for the title variant", async () => {
    const body = await (await get("?variant=title&bookId=b1")).json();
    expect(body.prompt).toContain('- Title: "Dinosaur Adventures"');
    expect(body.prompt).toContain('- Subtitle: "50 Fun Pages"');
  });

  it("defaults to the title variant when none is given", async () => {
    const body = await (await get("?bookId=b1")).json();
    expect(body.prompt).toContain("INTRO / TITLE page");
  });

  it("defaults to the title variant for an unknown value", async () => {
    const body = await (await get("?variant=banana&bookId=b1")).json();
    expect(body.prompt).toContain("INTRO / TITLE page");
  });

  it("serves the text variant without touching the database", async () => {
    const body = await (await get("?variant=text")).json();
    expect(body.prompt).toContain("NOT a creative variation");
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("omits a null subtitle rather than printing null", async () => {
    findUnique.mockResolvedValue({ title: "Solo", subtitle: null });
    const body = await (await get("?variant=title&bookId=b1")).json();
    expect(body.prompt).toContain('- Title: "Solo"');
    expect(body.prompt).not.toContain("- Subtitle:");
  });

  it("400s when the title variant has no bookId", async () => {
    expect((await get("?variant=title")).status).toBe(400);
  });

  it("404s for a book that does not exist", async () => {
    findUnique.mockResolvedValue(null);
    expect((await get("?variant=title&bookId=nope")).status).toBe(404);
  });
});
