import { describe, it, expect } from "vitest";
import { findMisregeneratedPages } from "./detect-misregen-pages";
import type { BookColoringPage } from "./types";

const JOB = "job1";
const page = (o: Partial<BookColoringPage> & { id: string }): BookColoringPage => ({
  url: "/x.png",
  ...o,
});

const jobPages = [
  { pageNumber: 1, redesignedUrl: "/job/p1-cover.png" },
  { pageNumber: 2, redesignedUrl: "/job/p2-intro.png" },
  { pageNumber: 4, redesignedUrl: "/job/p4.png" },
  { pageNumber: 5, redesignedUrl: "/job/p5.png" },
];

const regenUrl = (n: number, kind = "regen") =>
  `https://img/assets/clone-jobs/${JOB}/reproduce/page-${String(n).padStart(3, "0")}-${kind}.png`;

describe("findMisregeneratedPages", () => {
  it("flags a page whose regen came from a different source page", () => {
    // Interior #5 shows an image generated from job page #2 — the index-mismatch bug.
    const pages = [page({ id: "bp5", sourcePageNumber: 5, url: regenUrl(2) })];

    expect(findMisregeneratedPages(pages, jobPages, JOB)).toEqual([
      {
        pageId: "bp5",
        sourcePageNumber: 5,
        wrongSourcePageNumber: 2,
        currentUrl: regenUrl(2),
        restoreUrl: "/job/p5.png",
      },
    ]);
  });

  it("leaves a page regenerated from its own source page alone", () => {
    const pages = [page({ id: "bp5", sourcePageNumber: 5, url: regenUrl(5) })];
    expect(findMisregeneratedPages(pages, jobPages, JOB)).toEqual([]);
  });

  it("ignores the ?v= cache-buster when reading the page number", () => {
    const pages = [page({ id: "bp5", sourcePageNumber: 5, url: `${regenUrl(5)}?v=123456` })];
    expect(findMisregeneratedPages(pages, jobPages, JOB)).toEqual([]);
  });

  it("flags a bad 'angle' regen too", () => {
    const pages = [page({ id: "bp5", sourcePageNumber: 5, url: regenUrl(2, "angle") })];
    expect(findMisregeneratedPages(pages, jobPages, JOB)).toHaveLength(1);
  });

  it("leaves pages that were never regenerated through /reproduce alone", () => {
    const pages = [
      page({ id: "bp4", sourcePageNumber: 4, url: "https://img/assets/b1/pages/page-001.png" }),
      // regen-from-image path — always addressed pages by id, never had the bug
      page({ id: "bp5", sourcePageNumber: 5, url: "https://img/assets/b1/pages/bp5-regen-abc.png" }),
    ];
    expect(findMisregeneratedPages(pages, jobPages, JOB)).toEqual([]);
  });

  it("ignores regen urls belonging to a different clone job", () => {
    const pages = [
      page({ id: "bp5", sourcePageNumber: 5, url: regenUrl(2).replace(JOB, "other-job") }),
    ];
    expect(findMisregeneratedPages(pages, jobPages, JOB)).toEqual([]);
  });

  it("does not flag a page that has no source page number", () => {
    const pages = [page({ id: "bpA", origin: "additional", url: regenUrl(2) })];
    expect(findMisregeneratedPages(pages, jobPages, JOB)).toEqual([]);
  });

  it("skips a page whose source page is gone from the job (nothing to restore from)", () => {
    const pages = [page({ id: "bp9", sourcePageNumber: 9, url: regenUrl(2) })];
    expect(findMisregeneratedPages(pages, jobPages, JOB)).toEqual([]);
  });

  it("falls back to the job page's imageUrl when it has no redesignedUrl", () => {
    const bare = [{ pageNumber: 5, imageUrl: "/job/p5-raw.png" }];
    const pages = [page({ id: "bp5", sourcePageNumber: 5, url: regenUrl(2) })];

    expect(findMisregeneratedPages(pages, bare, JOB)[0].restoreUrl).toBe("/job/p5-raw.png");
  });
});
