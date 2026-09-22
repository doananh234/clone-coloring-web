import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDebouncedInput } from "./use-query-param";

describe("useDebouncedInput", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("updates the box instantly but commits only after typing pauses", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useDebouncedInput("", commit, 300));

    act(() => result.current[1]("c"));
    act(() => result.current[1]("co"));
    expect(result.current[0]).toBe("co");
    act(() => vi.advanceTimersByTime(299));
    expect(commit).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("co");
  });

  it("keeps chars typed while its own commit is still landing", () => {
    const commit = vi.fn();
    const { result, rerender } = renderHook(({ v }) => useDebouncedInput(v, commit, 300), {
      initialProps: { v: "" },
    });

    act(() => result.current[1]("coc"));
    act(() => vi.advanceTimersByTime(300));
    // User keeps typing before the URL catches up…
    act(() => result.current[1]("coco"));
    // …then the committed "coc" arrives back as the URL value.
    rerender({ v: "coc" });

    expect(result.current[0]).toBe("coco");
    act(() => vi.advanceTimersByTime(300));
    expect(commit).toHaveBeenLastCalledWith("coco");
  });

  it("resyncs the box when the value changes from outside", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedInput(v, vi.fn(), 300), {
      initialProps: { v: "coco" },
    });

    rerender({ v: "" }); // e.g. back navigation to a URL without ?q=
    expect(result.current[0]).toBe("");
  });

  it("does not commit when nothing was typed", () => {
    const commit = vi.fn();
    renderHook(() => useDebouncedInput("coco", commit, 300));
    act(() => vi.advanceTimersByTime(1000));
    expect(commit).not.toHaveBeenCalled();
  });
});
