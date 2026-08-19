import { describe, it, expect } from "vitest";
import { applyCoverSelect, applyCoverRemove } from "./use-cover-candidates";
import type { BookDetail } from "./types";

function book(): BookDetail {
  return {
    id: "b1",
    title: "T",
    coverUrl: "/cover-a.png",
    data: {
      coverCandidates: [
        { id: "a", url: "/cover-a.png", origin: "source", createdAt: "" },
        { id: "b", url: "/cover-b.png", origin: "pushed", createdAt: "" },
      ],
      selectedCoverCandidateId: "a",
    },
  } as unknown as BookDetail;
}

describe("applyCoverSelect", () => {
  it("mirrors the chosen candidate's url onto coverUrl + selectedCoverCandidateId", () => {
    const next = applyCoverSelect(book(), "b")!;
    expect(next.coverUrl).toBe("/cover-b.png");
    expect((next.data as Record<string, unknown>).selectedCoverCandidateId).toBe("b");
    // list preserved
    expect(((next.data as Record<string, unknown>).coverCandidates as unknown[]).length).toBe(2);
  });

  it("returns null when the candidate isn't in the list (→ refetch)", () => {
    expect(applyCoverSelect(book(), "ghost")).toBeNull();
  });

  it("returns null for an undefined book", () => {
    expect(applyCoverSelect(undefined, "a")).toBeNull();
  });
});

describe("applyCoverRemove", () => {
  it("removes a non-selected candidate, leaving selection + coverUrl intact", () => {
    const next = applyCoverRemove(book(), "b")!;
    const d = next.data as Record<string, unknown>;
    expect((d.coverCandidates as { id: string }[]).map((c) => c.id)).toEqual(["a"]);
    expect(d.selectedCoverCandidateId).toBe("a");
    expect(next.coverUrl).toBe("/cover-a.png");
  });

  it("returns null when removing the selected candidate (→ refetch)", () => {
    expect(applyCoverRemove(book(), "a")).toBeNull();
  });

  it("returns null when the candidate isn't found / book is undefined", () => {
    expect(applyCoverRemove(book(), "ghost")).toBeNull();
    expect(applyCoverRemove(undefined, "a")).toBeNull();
  });
});
