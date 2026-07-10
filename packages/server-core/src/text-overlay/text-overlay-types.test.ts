import { describe, it, expect } from "vitest";
import type { FabricSceneJSON, StyleFilter, CoverMeta } from "./text-overlay-types";

describe("text-overlay types", () => {
  it("FabricSceneJSON accepts arbitrary keys and objects array", () => {
    const scene: FabricSceneJSON = {
      version: "7.0.0",
      objects: [{ type: "textbox", text: "hello" }],
      background: "#ffffff",
    };
    expect(scene.version).toBe("7.0.0");
    expect(scene.objects.length).toBe(1);
  });

  it("StyleFilter is one of the 7 named values", () => {
    const filters: StyleFilter[] = [
      "none",
      "vintage",
      "warm",
      "cool",
      "monochrome",
      "sepia",
      "pastel",
    ];
    expect(filters).toHaveLength(7);
  });

  it("CoverMeta accepts legacy fields + new optional fields", () => {
    const meta: CoverMeta = {
      titleCover: "T",
      subtitle: "S",
      brandId: "b",
      coloringStyleId: "c",
      sourceThumbnailUrl: "url",
      middlePageIndex: 3,
      presetId: "default",
      status: "generated",
      generatedAt: "2026-07-09T00:00:00Z",
      // NEW optional:
      scene: { version: "7", objects: [] },
      editedAt: "2026-07-09T01:00:00Z",
      filter: "vintage",
    };
    expect(meta.filter).toBe("vintage");
    expect(meta.scene?.version).toBe("7");
    expect(meta.editedAt).toBe("2026-07-09T01:00:00Z");
  });

  it("CoverMeta.status includes 'manual'", () => {
    const meta: CoverMeta = {
      titleCover: "T",
      subtitle: "",
      brandId: "b",
      coloringStyleId: "c",
      sourceThumbnailUrl: "url",
      middlePageIndex: 1,
      presetId: "default",
      status: "manual",
      generatedAt: "2026-07-09T00:00:00Z",
    };
    expect(meta.status).toBe("manual");
  });
});
