import { describe, it, expect } from "vitest";
import { buildPageRegenPrompt } from "./page-regen-prompt";

// These strings are the ones the worker (runRegen) and the reproduce helper were
// each building inline. Pinning them here is the point of the extraction: the
// prompt box in the intro regen dialog shows what the server actually sends, so
// the two must not drift apart again.
const PRESERVE_STYLE_TAIL =
  "CRITICAL — PRESERVE THE ORIGINAL LINE-ART STYLE: keep the EXACT same stroke weight, line thickness, curve treatment and drawing technique as the source image. Do NOT restyle, do NOT redesign, do NOT change the artistic style. Clean black-and-white line art only (no color, no shading). " +
  "Output must be 1 single frame, not a split panel or grid layout.";

describe("buildPageRegenPrompt — no style references (preserve the page's own line art)", () => {
  it("matches the prompt the reproduce helper built, same camera", () => {
    expect(buildPageRegenPrompt({})).toBe(
      "Redraw this black-and-white coloring page keeping the SAME scene, composition, characters, objects and camera angle. " +
        PRESERVE_STYLE_TAIL,
    );
  });

  it("matches the prompt it built for a new camera view", () => {
    expect(buildPageRegenPrompt({ cameraView: "top-down" })).toBe(
      "Redraw this black-and-white coloring page from a top-down CAMERA VIEW — the composition, framing and viewpoint MUST change SIGNIFICANTLY to fit this new angle (do NOT keep the original camera position). Keep the SAME characters, objects and scene, only the viewpoint changes. " +
        PRESERVE_STYLE_TAIL,
    );
  });
});

describe("buildPageRegenPrompt — with style references", () => {
  it("labels a single reference IMAGE 2 and counts 2 images", () => {
    const p = buildPageRegenPrompt({ styleRefCount: 1 });
    expect(p).toContain("You are given 2 images IN THIS EXACT ORDER:");
    expect(p).toContain("- IMAGE 2 = STYLE REFERENCE(S)");
    expect(p).toContain("TASK: Redraw IMAGE 1 keeping the SAME scene, composition and camera angle, in the black-and-white line-art style of IMAGE 2.");
    expect(p).toContain("STRICT: Do NOT redraw, reproduce or borrow the CONTENT of IMAGE 2 — take its STYLE only.");
  });

  it("labels two references IMAGE 2-3 and counts 3 images", () => {
    const p = buildPageRegenPrompt({ styleRefCount: 2 });
    expect(p).toContain("You are given 3 images IN THIS EXACT ORDER:");
    expect(p).toContain("- IMAGE 2-3 = STYLE REFERENCE(S)");
  });

  it("appends the style directive scoped to the style reference", () => {
    expect(buildPageRegenPrompt({ styleRefCount: 1, styleDirective: "thick outlines" })).toContain(
      "\n\nStyle directive (applies to the STYLE of IMAGE 2 only):\nthick outlines",
    );
  });

  it("omits the directive block when there is no directive", () => {
    expect(buildPageRegenPrompt({ styleRefCount: 1 })).not.toContain("Style directive");
  });
});

describe("buildPageRegenPrompt — frame and user instructions", () => {
  it("appends the frame instruction when one is supplied", () => {
    expect(buildPageRegenPrompt({ frame: "FRAME: draw a square." })).toContain("\n\nFRAME: draw a square.");
  });

  it("appends nothing when the frame is empty (env turned it off)", () => {
    expect(buildPageRegenPrompt({ frame: "" })).toBe(buildPageRegenPrompt({}));
  });

  it("puts user instructions last so they take priority", () => {
    const p = buildPageRegenPrompt({ frame: "FRAME.", instructions: "make it snowy" });
    expect(p.endsWith("\n\nUSER-REQUESTED CHANGES (apply these exactly to the redrawn page, they take priority): make it snowy")).toBe(true);
  });

  it("ignores blank instructions", () => {
    expect(buildPageRegenPrompt({ instructions: "   " })).toBe(buildPageRegenPrompt({}));
  });
});
