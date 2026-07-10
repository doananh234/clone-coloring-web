import { describe, it, expect } from "vitest";
import { renderTextOverlay } from "./text-renderer";
import { TEXT_PRESETS } from "./text-overlay-presets";
import sharp from "sharp";

const DEFAULT = TEXT_PRESETS[0];

async function makeSquareImage(color: string, size = 512): Promise<Buffer> {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

describe("renderTextOverlay", () => {
  it("returns a PNG buffer larger than 0 bytes when only header is set", async () => {
    const source = await makeSquareImage("#ffffff");
    const result = await renderTextOverlay(source, {
      header: {
        text: "Hello Cover",
        fontFamily: DEFAULT.fontFamily,
        color: DEFAULT.color,
        outlineColor: DEFAULT.outlineColor,
        outlineWidth: DEFAULT.outlineWidth,
        shadow: DEFAULT.shadow,
        position: "top",
        scale: 1,
      },
      footer: null,
    });
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it("returns a PNG buffer when only footer is set", async () => {
    const source = await makeSquareImage("#ffffff");
    const result = await renderTextOverlay(source, {
      header: null,
      footer: {
        text: "Subtitle line",
        fontFamily: DEFAULT.fontFamily,
        color: DEFAULT.color,
        outlineColor: DEFAULT.outlineColor,
        outlineWidth: DEFAULT.outlineWidth,
        shadow: DEFAULT.shadow,
        position: "bottom-center",
        scale: 1,
      },
    });
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it("returns a PNG buffer when both header + footer are set", async () => {
    const source = await makeSquareImage("#f0f0f0");
    const result = await renderTextOverlay(source, {
      header: {
        text: "Top",
        fontFamily: DEFAULT.fontFamily,
        color: DEFAULT.color,
        outlineColor: DEFAULT.outlineColor,
        outlineWidth: DEFAULT.outlineWidth,
        shadow: DEFAULT.shadow,
        position: "top",
        scale: 1,
      },
      footer: {
        text: "Bottom",
        fontFamily: DEFAULT.fontFamily,
        color: DEFAULT.color,
        outlineColor: DEFAULT.outlineColor,
        outlineWidth: DEFAULT.outlineWidth,
        shadow: DEFAULT.shadow,
        position: "bottom-center",
        scale: 1,
      },
    });
    expect(result.byteLength).toBeGreaterThan(0);
  });
});
