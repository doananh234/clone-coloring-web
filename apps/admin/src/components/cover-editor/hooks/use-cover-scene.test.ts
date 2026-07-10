import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCoverScene } from "./use-cover-scene";
import { DEFAULT_SLOT_STATE } from "../types";

const INITIAL = {
  bookId: "b1",
  backgroundUrl: "https://r2/x.png",
  scene: undefined,
  slots: {
    ...DEFAULT_SLOT_STATE,
    title: { ...DEFAULT_SLOT_STATE.title, text: "My Book" },
  },
  filter: "none" as const,
};

describe("useCoverScene", () => {
  it("initializes with provided slot state and filter", () => {
    const { result } = renderHook(() => useCoverScene(INITIAL));
    expect(result.current.slots.title.text).toBe("My Book");
    expect(result.current.filter).toBe("none");
    expect(result.current.backgroundUrl).toBe("https://r2/x.png");
  });

  it("setSlotText updates one slot without touching others", () => {
    const { result } = renderHook(() => useCoverScene(INITIAL));
    act(() => result.current.setSlotText("subtitle", "New Subtitle"));
    expect(result.current.slots.subtitle.text).toBe("New Subtitle");
    expect(result.current.slots.title.text).toBe("My Book");
  });

  it("setSlotStyle updates font/color/size for one slot", () => {
    const { result } = renderHook(() => useCoverScene(INITIAL));
    act(() => result.current.setSlotStyle("title", { fontFamily: "Pacifico", color: "#ff0000" }));
    expect(result.current.slots.title.fontFamily).toBe("Pacifico");
    expect(result.current.slots.title.color).toBe("#ff0000");
    expect(result.current.slots.title.text).toBe("My Book");
  });

  it("setFilter updates the filter", () => {
    const { result } = renderHook(() => useCoverScene(INITIAL));
    act(() => result.current.setFilter("vintage"));
    expect(result.current.filter).toBe("vintage");
  });

  it("setScene stores the last serialized scene JSON", () => {
    const { result } = renderHook(() => useCoverScene(INITIAL));
    act(() => result.current.setScene({ version: "7.0.0", objects: [] }));
    expect(result.current.scene?.version).toBe("7.0.0");
  });
});
