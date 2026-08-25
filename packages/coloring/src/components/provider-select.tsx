"use client";

import { useCallback, useEffect, useState } from "react";

/** Operator-selectable image backends. Mirrors the server-side allow-list. */
export type ImageProvider = "kingcong" | "diaflow";

const STORAGE_KEY = "vx.imageProvider";
// Default to Diaflow: it takes the full (non-truncated) prompt and produces
// higher-quality covers. KingCong caps prompts at 4000 chars, which degrades
// cover quality — operators can still pick it explicitly when they want it.
const DEFAULT_PROVIDER: ImageProvider = "diaflow";

function readStored(): ImageProvider {
  if (typeof window === "undefined") return DEFAULT_PROVIDER;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "kingcong" || v === "diaflow" ? v : DEFAULT_PROVIDER;
}

/**
 * Remembers the operator's last image-provider choice in localStorage so it
 * persists across cover/regen dialogs and reloads. Defaults to KingCong.
 */
export function useProviderPreference(): [ImageProvider, (p: ImageProvider) => void] {
  const [provider, setProviderState] = useState<ImageProvider>(DEFAULT_PROVIDER);

  useEffect(() => {
    setProviderState(readStored());
  }, []);

  const setProvider = useCallback((p: ImageProvider) => {
    setProviderState(p);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, p);
  }, []);

  return [provider, setProvider];
}

interface ProviderSelectProps {
  value: ImageProvider;
  onChange: (p: ImageProvider) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
}

/** Compact KingCong/Diaflow picker for cover + regen dialogs. */
export function ProviderSelect({ value, onChange, label, disabled, id = "image-provider" }: ProviderSelectProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label ? (
        <label htmlFor={id} style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>
          {label}
        </label>
      ) : null}
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as ImageProvider)}
        style={{
          height: 34,
          borderRadius: 8,
          border: "1px solid #d1d5db",
          background: "#fff",
          padding: "0 10px",
          fontSize: 13,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <option value="kingcong">KingCong</option>
        <option value="diaflow">Diaflow</option>
      </select>
    </div>
  );
}
