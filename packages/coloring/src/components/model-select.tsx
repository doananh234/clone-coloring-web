"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Image model choices for the LiteLLM provider. "" = Auto (the server's
 * LITELLM_IMAGE_MODEL). The model is ONLY honoured when the provider is
 * `litellm` — every other backend has its model fixed by its own deployment.
 *
 * Single source of truth: the cover editor's AI panel, the interior picker and
 * the colorize screens all read this list, so a new model shows up everywhere
 * at once. (It used to be copy-pasted per screen and drifted.)
 *
 *  - gpt-image-2      lays out top/middle/bottom title-safe text most reliably
 *  - gemini-3.1       fast, the usual default
 *  - qwen-image-2.1   local GPU box: no per-image cost, but slower
 *                     (~20s generate, ~45s edit) and square output only
 */
export const IMAGE_MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Model: Auto" },
  { value: "gpt-image-2", label: "gpt-image-2" },
  { value: "gemini-3.1-flash-image", label: "Gemini 3.1" },
  { value: "qwen-image-2.1", label: "Qwen-Image 2.1" },
];

const MODEL_VALUES = IMAGE_MODEL_OPTIONS.map((o) => o.value);
const STORAGE_KEY = "vx.imageModel";
const DEFAULT_MODEL = "";

function readStored(): string {
  if (typeof window === "undefined") return DEFAULT_MODEL;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v !== null && MODEL_VALUES.includes(v) ? v : DEFAULT_MODEL;
}

/**
 * Remembers the operator's last image-model choice in localStorage, mirroring
 * useProviderPreference so the two selects behave the same across dialogs.
 */
export function useModelPreference(): [string, (m: string) => void] {
  const [model, setModelState] = useState<string>(DEFAULT_MODEL);

  useEffect(() => {
    setModelState(readStored());
  }, []);

  const setModel = useCallback((m: string) => {
    setModelState(m);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, m);
  }, []);

  return [model, setModel];
}

interface ModelSelectProps {
  value: string;
  onChange: (m: string) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
}

/** Compact image-model picker. Pair it with ProviderSelect. */
export function ModelSelect({ value, onChange, label, disabled, id = "image-model" }: ModelSelectProps) {
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
        onChange={(e) => onChange(e.target.value)}
        title="Image model (chỉ áp dụng cho provider LiteLLM)"
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
        {IMAGE_MODEL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
