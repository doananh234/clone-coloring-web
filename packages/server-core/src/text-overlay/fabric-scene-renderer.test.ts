import { describe, it, expect, vi } from "vitest";
import { renderFabricSceneToPng } from "./fabric-scene-renderer";
import sharp from "sharp";

async function makeSourceImage(): Promise<string> {
  const buf = await sharp({
    create: { width: 800, height: 800, channels: 3, background: "#ff0000" },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}

describe("renderFabricSceneToPng", () => {
  it("renders a scene with 1 text object over a background at 1024x1024", async () => {
    const bg = await makeSourceImage();
    const scene = {
      version: "7.0.0",
      objects: [
        {
          type: "textbox",
          text: "Hello",
          left: 100,
          top: 100,
          fontFamily: "Inter",
          fontSize: 60,
          fill: "#ffffff",
          width: 800,
        },
      ],
    };
    const buffer = await renderFabricSceneToPng({
      sceneJson: scene,
      backgroundImageUrl: bg,
      size: 1024,
    });
    expect(buffer.byteLength).toBeGreaterThan(0);
    const meta = await sharp(buffer).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
  });

  it("applies the vintage filter without throwing", async () => {
    const bg = await makeSourceImage();
    const scene = { version: "7.0.0", objects: [] };
    const buffer = await renderFabricSceneToPng({
      sceneJson: scene,
      backgroundImageUrl: bg,
      filter: "vintage",
      size: 1024,
    });
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("renders even when the scene has no objects (background-only)", async () => {
    const bg = await makeSourceImage();
    const buffer = await renderFabricSceneToPng({
      sceneJson: { version: "7", objects: [] },
      backgroundImageUrl: bg,
    });
    const meta = await sharp(buffer).metadata();
    expect(meta.width).toBe(1024);
  });

  it("skips unknown object types (does not throw)", async () => {
    const bg = await makeSourceImage();
    const scene = {
      version: "7",
      objects: [{ type: "somethingWeird", left: 0, top: 0 }],
    };
    const buffer = await renderFabricSceneToPng({
      sceneJson: scene,
      backgroundImageUrl: bg,
    });
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
