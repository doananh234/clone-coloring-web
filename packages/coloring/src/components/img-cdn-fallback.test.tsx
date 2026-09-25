import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ImgCdnFallback } from "./img-cdn-fallback";

const CDN = "https://image.lagroups.org";
const transformed = `${CDN}/cdn-cgi/image/width=500,quality=75/assets/b1/cover.png`;

/** Fire the same event the browser fires when an <img> fails to load. */
function failToLoad(img: HTMLImageElement) {
  img.dispatchEvent(new Event("error", { bubbles: false }));
}

describe("ImgCdnFallback", () => {
  beforeEach(() => render(<ImgCdnFallback />));
  afterEach(cleanup);

  it("swaps a failed CDN-transformed image for the original", () => {
    const img = document.createElement("img");
    img.src = transformed;
    document.body.appendChild(img);

    failToLoad(img);

    expect(img.getAttribute("src")).toBe(`${CDN}/assets/b1/cover.png`);
  });

  it("leaves a non-transformed image alone", () => {
    const img = document.createElement("img");
    img.src = `${CDN}/assets/b1/cover.png`;
    document.body.appendChild(img);

    failToLoad(img);

    expect(img.getAttribute("src")).toBe(`${CDN}/assets/b1/cover.png`);
  });

  it("does not retry forever when the original fails too", () => {
    const img = document.createElement("img");
    img.src = transformed;
    document.body.appendChild(img);

    failToLoad(img);
    const afterFirst = img.getAttribute("src");
    failToLoad(img);

    expect(img.getAttribute("src")).toBe(afterFirst);
  });
});
