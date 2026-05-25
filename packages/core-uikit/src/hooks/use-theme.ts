import { useState, useEffect, useCallback } from "react";

type ThemeMode = "light" | "dark" | "system";
type ThemeVariant = "diaflow" | "default" | "corporate" | "minimal";

type ThemeConfig = {
  mode: ThemeMode;
  variant: ThemeVariant;
};

const STORAGE_KEY = "vx_theme";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(config: ThemeConfig): void {
  const resolved = config.mode === "system" ? getSystemTheme() : config.mode;
  const el = document.documentElement;

  if (resolved === "dark") {
    el.classList.add("dark");
  } else {
    el.classList.remove("dark");
  }

  el.classList.remove("theme-diaflow", "theme-default", "theme-corporate", "theme-minimal");
  el.classList.add(`theme-${config.variant}`);
}

function loadConfig(): ThemeConfig {
  if (typeof window === "undefined") return { mode: "system", variant: "diaflow" };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed === "object" && parsed.mode) return parsed as ThemeConfig;
      // Migrate old string format ("dark") to new object format
      return { mode: parsed as ThemeMode, variant: "diaflow" };
    }
  } catch {}
  return { mode: "system", variant: "diaflow" };
}

export function useTheme() {
  const [config, setConfigState] = useState<ThemeConfig>(loadConfig);

  useEffect(() => {
    applyTheme(config);
  }, [config]);

  useEffect(() => {
    if (config.mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme(config);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [config]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setConfigState((prev) => {
      const next = { ...prev, mode };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      applyTheme(next);
      return next;
    });
  }, []);

  const setVariant = useCallback((variant: ThemeVariant) => {
    setConfigState((prev) => {
      const next = { ...prev, variant };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      applyTheme(next);
      return next;
    });
  }, []);

  return {
    theme: config.mode,
    variant: config.variant,
    setTheme,
    setVariant,
    resolvedTheme: config.mode === "system" ? getSystemTheme() : config.mode,
  };
}
