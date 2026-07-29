import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@vx/db", () => ({ prisma: { book: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) } } }));

import { PUT } from "./route";

function put(bookId: string, body: unknown) {
  return PUT(
    new NextRequest(`http://localhost/api/books/${bookId}`, { method: "PUT", body: JSON.stringify(body) }),
    { params: Promise.resolve({ bookId }) },
  );
}

describe("PUT /api/books/[bookId] coverLayout merge", () => {
  beforeEach(() => { findUnique.mockReset(); update.mockReset(); update.mockResolvedValue({ id: "b1" }); });

  it("folds coverLayout into data without dropping existing data keys", async () => {
    findUnique.mockResolvedValue({ data: { coverMeta: { sourceThumbnailUrl: "u" }, keep: 1 } });
    const doc = { version: 1, elements: { title: { text: "T" } } };
    const res = await put("b1", { coverLayout: doc });
    expect(res.status).toBe(200);
    const arg = update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "b1" });
    expect(arg.data.data.coverLayout).toEqual(doc);
    expect(arg.data.data.coverMeta).toEqual({ sourceThumbnailUrl: "u" }); // preserved
    expect(arg.data.data.keep).toBe(1); // preserved
    expect(arg.data.coverLayout).toBeUndefined(); // not a top-level column
  });

  it("still updates plain columns (coverUrl) directly", async () => {
    findUnique.mockResolvedValue({ data: {} });
    const res = await put("b1", { coverUrl: "https://r2/c.png?v=1" });
    expect(res.status).toBe(200);
    const arg = update.mock.calls[0][0];
    expect(arg.data.coverUrl).toBe("https://r2/c.png?v=1");
  });
});
