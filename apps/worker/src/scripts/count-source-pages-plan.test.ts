import { describe, it, expect } from "vitest";
import { planPageCount, encodePdfUrl } from "./count-source-pages-plan";

describe("planPageCount", () => {
  it("parks a thin source and records its page count", () => {
    expect(planPageCount(30)).toEqual({ totalPages: 30, status: "insufficient-pages" });
  });

  it("keeps a thick enough source in the queue, only filling the count", () => {
    expect(planPageCount(42)).toEqual({ totalPages: 42 });
    expect(planPageCount(120)).toEqual({ totalPages: 120 });
  });

  it("refuses a nonsense page count instead of parking the job", () => {
    expect(planPageCount(0)).toBeNull();
    expect(planPageCount(-1)).toBeNull();
    expect(planPageCount(Number.NaN)).toBeNull();
  });

  it("honours a custom threshold", () => {
    expect(planPageCount(45, 50)).toEqual({ totalPages: 45, status: "insufficient-pages" });
    expect(planPageCount(45, 40)).toEqual({ totalPages: 45 });
  });
});

describe("encodePdfUrl", () => {
  const base = "https://aws-code-store.s3.us-east-1.amazonaws.com/telegram-books";

  it("percent-encodes spaces and accents in the path", () => {
    expect(encodePdfUrl(`${base}/Búsqueda y Plática/057_x.pdf`)).toBe(
      `${base}/B%C3%BAsqueda%20y%20Pl%C3%A1tica/057_x.pdf`,
    );
  });

  it("leaves an already-encoded url untouched (no double encoding)", () => {
    const encoded = `${base}/B%C3%BAsqueda%20y%20Pl%C3%A1tica/057_x.pdf`;
    expect(encodePdfUrl(encoded)).toBe(encoded);
  });

  it("returns the input unchanged when it is not a url", () => {
    expect(encodePdfUrl("not a url")).toBe("not a url");
  });
});
