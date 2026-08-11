import { describe, it, expect } from "vitest";
import { ensureSourceCandidate, addCandidate, selectCandidate, deleteCandidate, type CoverState } from "./cover-candidates";
import type { CoverCandidate } from "./types";

const pushed = (id: string, url = `/c/${id}.png`): CoverCandidate => ({ id, url, origin: "pushed", fromPageId: "p1", createdAt: "t" });

describe("ensureSourceCandidate", () => {
  it("seeds an origin:source candidate from coverUrl and selects it when the list is empty", () => {
    const { state, sourceId } = ensureSourceCandidate({ coverUrl: "/old-cover.png" }, () => "src", "t0");
    expect(state.coverCandidates).toEqual([
      { id: "src", url: "/old-cover.png", origin: "source", createdAt: "t0" },
    ]);
    expect(state.selectedCoverCandidateId).toBe("src");
    expect(sourceId).toBe("src");
  });

  it("does not seed (sourceId undefined) when there is no coverUrl", () => {
    const { state, sourceId } = ensureSourceCandidate({}, () => "src", "t0");
    expect(state.coverCandidates).toBeUndefined();
    expect(sourceId).toBeUndefined();
  });

  it("is a no-op when a candidate already exists (returns the first candidate's id)", () => {
    const existing: CoverState = {
      coverUrl: "/old-cover.png",
      coverCandidates: [{ id: "s1", url: "/old-cover.png", origin: "source", createdAt: "t" }, pushed("p2")],
      selectedCoverCandidateId: "s1",
    };
    const { state, sourceId } = ensureSourceCandidate(existing, () => "NEW", "t9");
    expect(sourceId).toBe("s1");
    expect(state.coverCandidates).toHaveLength(2);
  });
});

describe("addCandidate", () => {
  it("appends a new candidate without changing the selection", () => {
    const state: CoverState = {
      coverUrl: "/old.png",
      coverCandidates: [{ id: "s1", url: "/old.png", origin: "source", createdAt: "t" }],
      selectedCoverCandidateId: "s1",
    };
    const out = addCandidate(state, pushed("p1"));
    expect(out.coverCandidates!.map((c) => c.id)).toEqual(["s1", "p1"]);
    expect(out.selectedCoverCandidateId).toBe("s1");
  });

  it("dedupes by url (no duplicate appended)", () => {
    const state: CoverState = {
      coverCandidates: [{ id: "s1", url: "/dup.png", origin: "source", createdAt: "t" }],
      selectedCoverCandidateId: "s1",
    };
    const out = addCandidate(state, pushed("p1", "/dup.png"));
    expect(out.coverCandidates!.map((c) => c.id)).toEqual(["s1"]);
  });
});

describe("selectCandidate", () => {
  it("sets selectedCoverCandidateId and mirrors coverUrl", () => {
    const state: CoverState = {
      coverUrl: "/old.png",
      coverCandidates: [
        { id: "s1", url: "/old.png", origin: "source", createdAt: "t" },
        pushed("p1", "/c/p1.png"),
      ],
      selectedCoverCandidateId: "s1",
    };
    const out = selectCandidate(state, "p1");
    expect(out.selectedCoverCandidateId).toBe("p1");
    expect(out.coverUrl).toBe("/c/p1.png");
  });

  it("throws on an unknown id", () => {
    const state: CoverState = { coverCandidates: [pushed("p1")], selectedCoverCandidateId: "p1" };
    expect(() => selectCandidate(state, "nope")).toThrow();
  });
});

describe("deleteCandidate", () => {
  const base = (): CoverState => ({
    coverUrl: "/old.png",
    coverCandidates: [
      { id: "s1", url: "/old.png", origin: "source", createdAt: "t" },
      pushed("p1"),
      pushed("p2"),
    ],
    selectedCoverCandidateId: "p1",
  });

  it("removes a non-selected candidate", () => {
    const out = deleteCandidate(base(), "p2");
    expect(out.coverCandidates!.map((c) => c.id)).toEqual(["s1", "p1"]);
  });
  it("removes a non-selected source candidate", () => {
    const out = deleteCandidate(base(), "s1");
    expect(out.coverCandidates!.map((c) => c.id)).toEqual(["p1", "p2"]);
  });
  it("refuses to delete the selected candidate", () => {
    expect(() => deleteCandidate(base(), "p1")).toThrow();
  });
  it("throws on an unknown id", () => {
    expect(() => deleteCandidate(base(), "nope")).toThrow();
  });
});
