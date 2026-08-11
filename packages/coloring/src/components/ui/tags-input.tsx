"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { Icon } from "../../lib/icon";
import { normalizeTag } from "../../data/tags";

/** D1: chip input for hashtags with autocomplete. Presentational — the caller
 *  supplies `suggestions` (e.g. collectTags of the loaded list). Normalization is
 *  delegated to the tested normalizeTag helper, so chips are always canonical. */
export function TagsInput({
  value,
  onChange,
  suggestions = [],
  disabled = false,
  placeholder = "Thêm hashtag…",
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  disabled?: boolean;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);

  const add = (raw: string) => {
    const t = normalizeTag(raw);
    setInput("");
    if (!t || value.includes(t)) return;
    onChange([...value, t]);
  };
  const removeAt = (i: number) => onChange(value.filter((_, j) => j !== i));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(input);
    } else if (e.key === "Backspace" && input === "" && value.length > 0) {
      removeAt(value.length - 1);
    }
  };

  const q = normalizeTag(input);
  const matches = useMemo(
    () => (q ? suggestions.filter((s) => !value.includes(s) && s.includes(q)).slice(0, 8) : []),
    [q, suggestions, value],
  );

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", padding: 6, minHeight: 40, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: disabled ? "var(--neutral-100)" : "var(--card)", opacity: disabled ? 0.6 : 1 }}>
        {value.map((t, i) => (
          <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 600, padding: "2px 4px 2px 8px", borderRadius: 99, background: "var(--neutral-200, #eee)", color: "var(--foreground)" }}>
            {t}
            {!disabled && (
              <button type="button" aria-label={`Xoá ${t}`} onClick={() => removeAt(i)}
                style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex", padding: 0, color: "var(--muted-foreground)" }}>
                <Icon name="x" size={12} />
              </button>
            )}
          </span>
        ))}
        <input
          value={input}
          disabled={disabled}
          placeholder={value.length === 0 ? placeholder : ""}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          style={{ flex: "1 1 80px", minWidth: 80, border: "none", outline: "none", background: "transparent", fontSize: 13, padding: "4px 2px" }}
        />
      </div>
      {focused && matches.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, marginTop: 4, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow-md)", overflow: "hidden", maxHeight: 240, overflowY: "auto" }}>
          {matches.map((s) => (
            <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); add(s); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12.5, color: "var(--foreground)" }}>
              #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
