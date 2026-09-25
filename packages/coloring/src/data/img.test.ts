import { describe, it, expect } from "vitest";
import { stripCdnTransform } from "./img";

const CDN = "https://image.lagroups.org";

describe("stripCdnTransform", () => {
  it("returns the untransformed original for a /cdn-cgi/image/ url", () => {
    expect(
      stripCdnTransform(`${CDN}/cdn-cgi/image/width=500,quality=75,format=auto,fit=cover/assets/b1/cover.png`),
    ).toBe(`${CDN}/assets/b1/cover.png`);
  });

  it("keeps the query string (cache-busting ?v=...)", () => {
    expect(stripCdnTransform(`${CDN}/cdn-cgi/image/width=400/assets/b1/cover.png?v=9`)).toBe(
      `${CDN}/assets/b1/cover.png?v=9`,
    );
  });

  it("returns null for a url that is not a transform", () => {
    expect(stripCdnTransform(`${CDN}/assets/b1/cover.png`)).toBeNull();
    expect(stripCdnTransform("https://cdn.diaflow.io/x.png")).toBeNull();
    expect(stripCdnTransform("data:image/png;base64,xxx")).toBeNull();
    expect(stripCdnTransform("")).toBeNull();
  });
});
