import { describe, it, expect, vi, beforeEach } from "vitest";

const httpPost = vi.fn();
const httpPut = vi.fn();
const httpGet = vi.fn();
vi.mock("@vx/core-uikit/api", () => ({
  httpPost: (...a: unknown[]) => httpPost(...a),
  httpPut: (...a: unknown[]) => httpPut(...a),
  httpGet: (...a: unknown[]) => httpGet(...a),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { usePageActions } from "./use-page-actions";
import type { BookColoringPage } from "./types";

const page = (o: Partial<BookColoringPage> & { id: string }): BookColoringPage => ({
  url: "/p.png",
  ...o,
});

/** Interior #5 of a book whose source had a cover + 2 intro pages before it. */
const interior5 = page({ id: "bp5", sourcePageNumber: 5, origin: "original" });
/** A page added after the clone job — it has no counterpart in the job at all. */
const additional = page({ id: "bpA", origin: "additional" });

const bodyOf = (call: unknown[]) => call[1] as Record<string, unknown>;
const urlOf = (call: unknown[]) => call[0] as string;

describe("usePageActions — clone-job calls address the page by identity", () => {
  beforeEach(() => {
    httpPost.mockReset();
    httpPut.mockReset();
    httpGet.mockReset();
    httpPost.mockResolvedValue({ results: [{ url: "https://r2/cand.png" }], succeeded: 1 });
  });

  it("genCandidate sends sourcePageNumber + bookPageId, not just an array index", async () => {
    const a = usePageActions("b1", "job1");
    await a.genCandidate(interior5, false);

    expect(urlOf(httpPost.mock.calls[0])).toContain("/clone/job1/reproduce");
    expect(bodyOf(httpPost.mock.calls[0])).toMatchObject({
      sourcePageNumber: 5,
      bookPageId: "bp5",
    });
  });

  it("genCandidate skips the clone job for a page with no source page number", async () => {
    httpPost.mockResolvedValue({ url: "https://r2/from-image.png" });
    const a = usePageActions("b1", "job1");
    await a.genCandidate(additional, false);

    // Must go to the id-addressed regen endpoint, never to /reproduce, where a
    // missing counterpart would silently redraw an unrelated page.
    expect(urlOf(httpPost.mock.calls[0])).toContain("/books/b1/pages/bpA/regen");
    expect(httpPost.mock.calls.every((c) => !urlOf(c).includes("/reproduce"))).toBe(true);
  });

  it("applyCandidate sends sourcePageNumber + bookPageId", async () => {
    const a = usePageActions("b1", "job1");
    await a.applyCandidate(interior5, "regen");

    expect(urlOf(httpPost.mock.calls[0])).toContain("/clone/job1/apply-candidate");
    expect(bodyOf(httpPost.mock.calls[0])).toMatchObject({
      sourcePageNumber: 5,
      bookPageId: "bp5",
      kind: "regen",
    });
  });

  it("regenApply sends sourcePageNumber + bookPageId", async () => {
    const a = usePageActions("b1", "job1");
    await a.regenApply(interior5);

    expect(bodyOf(httpPost.mock.calls[0])).toMatchObject({
      sourcePageNumber: 5,
      bookPageId: "bp5",
      apply: true,
    });
  });

  it("regenApply refuses a page with no source page number instead of regenerating a random one", async () => {
    const a = usePageActions("b1", "job1");
    await expect(a.regenApply(additional)).rejects.toThrow();
    expect(httpPost).not.toHaveBeenCalled();
  });
});

describe("usePageActions — intro pages live in summaryPages, not coloringPages", () => {
  const intro = page({ id: "sp1", url: "/s1.png", sourcePageNumber: 2 });
  const otherIntro = page({ id: "sp2", url: "/s2.png", sourcePageNumber: 3 });

  beforeEach(() => {
    httpPost.mockReset();
    httpPut.mockReset();
    httpGet.mockReset();
    httpPost.mockResolvedValue({ jobId: "job-1" });
    httpGet.mockResolvedValue({ job: { status: "done", resultUrl: "https://r2/intro-regen.png" } });
    httpPut.mockResolvedValue({});
  });

  it("genIntroCandidate regens through the id-addressed route with the summary target", async () => {
    // Never /reproduce: an intro page's clone-job counterpart is not in the
    // book's interior array, and the candidate must not touch coloringPages.
    const a = usePageActions("b1", "job1");
    const r = await a.genIntroCandidate(intro);

    expect(urlOf(httpPost.mock.calls[0])).toContain("/books/b1/pages/sp1/regen");
    expect(bodyOf(httpPost.mock.calls[0])).toMatchObject({ target: "summary" });
    expect(r.url).toBe("https://r2/intro-regen.png");
  });

  it("genIntroCandidate sends the edited prompt as a full override", async () => {
    const a = usePageActions("b1", "job1");
    await a.genIntroCandidate(intro, "Redraw it snowy.");

    expect(bodyOf(httpPost.mock.calls[0])).toMatchObject({ promptOverride: "Redraw it snowy." });
  });

  it("applyIntroCandidate writes summaryPages and leaves the other intro page alone", async () => {
    const a = usePageActions("b1", "job1");
    await a.applyIntroCandidate([intro, otherIntro], "sp1", "https://r2/new.png");

    const body = httpPut.mock.calls[0][1] as { summaryPages: { id: string; url: string }[] };
    expect(Object.keys(body)).toEqual(["summaryPages"]);
    expect(body.summaryPages).toEqual([
      { id: "sp1", url: "https://r2/new.png", sourcePageNumber: 2 },
      { id: "sp2", url: "/s2.png", sourcePageNumber: 3 },
    ]);
  });

  it("removeIntroPage drops just that page from summaryPages", async () => {
    const a = usePageActions("b1", "job1");
    await a.removeIntroPage([intro, otherIntro], "sp1");

    const body = httpPut.mock.calls[0][1] as { summaryPages: { id: string }[] };
    expect(body.summaryPages.map((p) => p.id)).toEqual(["sp2"]);
  });
});
