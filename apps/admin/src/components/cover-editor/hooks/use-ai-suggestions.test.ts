import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAiSuggestions } from "./use-ai-suggestions";

describe("useAiSuggestions", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockReset();
  });

  it("initializes with no suggestions and not loading", () => {
    const { result } = renderHook(() => useAiSuggestions());
    expect(result.current.suggestions).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("populates suggestions on successful fetch", async () => {
    const pack = {
      titles: ["A"],
      subtitles: ["B"],
      brandLines: ["C"],
      fontPairs: [],
      palettes: [],
      layoutHint: "centered" as const,
    };
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => pack,
    });
    const { result } = renderHook(() => useAiSuggestions());
    await act(async () => {
      await result.current.fetchSuggestions("https://r2/x.png", { title: "T" });
    });
    expect(result.current.suggestions?.titles).toEqual(["A"]);
    expect(result.current.loading).toBe(false);
  });

  it("sets error when fetch fails", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    });
    const { result } = renderHook(() => useAiSuggestions());
    await act(async () => {
      await result.current.fetchSuggestions("https://r2/x.png", { title: "T" });
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.suggestions).toBeNull();
  });
});
