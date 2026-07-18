import { describe, it, expect } from "vitest";
import {
  buildRedesignPrompt,
  pickDifferentCameraView,
  CAMERA_VIEWS,
  type CameraView,
} from "./redesign-prompts";

describe("buildRedesignPrompt", () => {
  it("keeps the default template unchanged when no camera view is given", () => {
    const prompt = buildRedesignPrompt(30);
    expect(prompt).toContain("~30% change");
    expect(prompt).toContain("Character pose, posture, and viewing angle");
    expect(prompt).not.toContain("REQUIRED CAMERA CHANGE");
  });

  it("uses the given change percent, falling back to 30", () => {
    expect(buildRedesignPrompt(50)).toContain("~50% change");
    expect(buildRedesignPrompt(0)).toContain("~30% change");
  });

  it("adds a required camera block and drops viewing angle from MAY CHANGE", () => {
    const prompt = buildRedesignPrompt(30, { cameraView: "bird's-eye" });
    expect(prompt).toContain("REQUIRED CAMERA CHANGE");
    expect(prompt).toContain("bird's-eye");
    // viewing angle is now required, not optional
    expect(prompt).not.toContain("Character pose, posture, and viewing angle");
    expect(prompt).toContain("Character pose and posture");
    // line-art rules stay intact
    expect(prompt).toContain("KEEP unchanged:");
    expect(prompt).toContain("DO NOT:");
  });

  it("includes a hint for every camera view", () => {
    for (const view of CAMERA_VIEWS) {
      const prompt = buildRedesignPrompt(30, { cameraView: view });
      expect(prompt).toContain(view);
    }
  });
});

describe("pickDifferentCameraView", () => {
  const always = (value: number) => () => value;

  it("never returns the current view", () => {
    for (const current of CAMERA_VIEWS) {
      for (let i = 0; i < 20; i++) {
        expect(pickDifferentCameraView(current)).not.toBe(current);
      }
    }
  });

  it("normalizes synonyms before excluding", () => {
    // "top-down" ≙ bird's-eye — must never pick bird's-eye
    for (let i = 0; i < 20; i++) {
      expect(pickDifferentCameraView("Top-Down")).not.toBe("bird's-eye");
      expect(pickDifferentCameraView("eye level")).not.toBe("medium");
      expect(pickDifferentCameraView("closeup")).not.toBe("close-up");
    }
  });

  it("picks from the full list when current view is unknown or empty", () => {
    const seen = new Set<CameraView>();
    for (let i = 0; i < CAMERA_VIEWS.length; i++) {
      seen.add(pickDifferentCameraView(undefined, always(i / CAMERA_VIEWS.length)));
    }
    expect(seen.size).toBe(CAMERA_VIEWS.length);
    expect(() => pickDifferentCameraView("something-weird")).not.toThrow();
  });

  it("is deterministic with an injected random source", () => {
    expect(pickDifferentCameraView("wide", always(0))).toBe(
      pickDifferentCameraView("wide", always(0)),
    );
  });

  it("accepts a list and excludes every entry", () => {
    for (let i = 0; i < 30; i++) {
      const picked = pickDifferentCameraView(["wide", "bird's-eye"]);
      expect(picked).not.toBe("wide");
      expect(picked).not.toBe("bird's-eye");
    }
  });

  it("normalizes and ignores undefined entries in a list", () => {
    for (let i = 0; i < 30; i++) {
      const picked = pickDifferentCameraView([undefined, "top-down", "eye level"]);
      expect(picked).not.toBe("bird's-eye");
      expect(picked).not.toBe("medium");
    }
  });

  it("falls back to the full list when a list would exclude everything", () => {
    expect(() =>
      pickDifferentCameraView([...CAMERA_VIEWS]),
    ).not.toThrow();
    expect(CAMERA_VIEWS).toContain(pickDifferentCameraView([...CAMERA_VIEWS]));
  });
});
