import { describe, it, expect } from "vitest";
import { planSourceCover, withSourceCoverSelected } from "./source-cover-backfill-plan";

const pages = [
  { pageNumber: 1, imageUrl: "/assets/clone-jobs/j1/p1.png", pageType: "cover" },
  { pageNumber: 2, imageUrl: "/assets/clone-jobs/j1/p2.png" },
];

describe("planSourceCover", () => {
  it("plans a copy of the source cover to a key that never clobbers the old cover", () => {
    expect(planSourceCover({ id: "b1", data: {} }, pages)).toEqual({
      action: "apply",
      sourceUrl: "/assets/clone-jobs/j1/p1.png",
      destKey: "assets/b1/source-cover.png",
    });
  });

  it("skips a book that already has the source cover candidate", () => {
    const data = { coverCandidates: [{ id: "c", url: "/x", origin: "original", createdAt: "t" }] };
    expect(planSourceCover({ id: "b1", data }, pages)).toEqual({ action: "skip", reason: "already-done" });
  });

  it("skips when the job has no usable source page", () => {
    expect(planSourceCover({ id: "b1", data: {} }, [])).toEqual({ action: "skip", reason: "no-source-page" });
  });

  it("keeps the source image extension", () => {
    const plan = planSourceCover({ id: "b1", data: {} }, [{ pageNumber: 1, imageUrl: "/a/p1.jpg?v=2" }]);
    expect(plan).toMatchObject({ destKey: "assets/b1/source-cover.jpg" });
  });
});

describe("withSourceCoverSelected", () => {
  const ids = () => {
    let n = 0;
    return () => `id${++n}`;
  };

  it("keeps the current cover as a candidate and selects the source cover", () => {
    const next = withSourceCoverSelected({ coverUrl: "/old.png" }, "/new.png", ids(), "now");
    expect(next.coverUrl).toBe("/new.png");
    expect(next.coverCandidates).toEqual([
      { id: "id1", url: "/old.png", origin: "source", createdAt: "now" },
      { id: "id2", url: "/new.png", origin: "original", createdAt: "now" },
    ]);
    expect(next.selectedCoverCandidateId).toBe("id2");
  });

  it("appends to existing candidates without dropping them", () => {
    const state = {
      coverUrl: "/pushed.png",
      coverCandidates: [{ id: "p", url: "/pushed.png", origin: "pushed" as const, createdAt: "t" }],
      selectedCoverCandidateId: "p",
    };
    const next = withSourceCoverSelected(state, "/new.png", ids(), "now");
    expect(next.coverCandidates?.map((c) => c.origin)).toEqual(["pushed", "original"]);
    expect(next.coverUrl).toBe("/new.png");
  });

  it("works for a book with no cover at all", () => {
    const next = withSourceCoverSelected({ coverUrl: "" }, "/new.png", ids(), "now");
    expect(next.coverCandidates).toHaveLength(1);
    expect(next.coverUrl).toBe("/new.png");
  });
});
