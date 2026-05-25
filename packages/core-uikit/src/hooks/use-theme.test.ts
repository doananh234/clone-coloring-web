import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "./use-theme";

describe("useTheme", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    localStorage.removeItem("vx_theme");
    // jsdom does not implement matchMedia — provide a minimal stub
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("defaults to system theme", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("system");
  });

  it("setTheme dark adds dark class to html", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("dark"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(result.current.theme).toBe("dark");
  });

  it("setTheme light removes dark class", () => {
    document.documentElement.classList.add("dark");
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("light"));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("persists to localStorage", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("dark"));
    const stored = JSON.parse(localStorage.getItem("vx_theme")!);
    expect(stored.mode).toBe("dark");
  });
});
