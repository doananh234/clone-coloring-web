"use client";

import { Icon } from "../../lib/icon";

export interface StylePickerItem {
  id: string;
  name: string;
  image?: string;
}

export interface StylePickerProps {
  items: StylePickerItem[];
  value: string;
  onChange: (id: string) => void;
  /** Allow deselect (for optional pickers). */
  clearable?: boolean;
  loading?: boolean;
  emptyText?: string;
}

/** Gallery picker — selectable style cards (thumbnail + name). Replaces a plain Select. */
export function StylePicker({ items, value, onChange, clearable, loading, emptyText = "Chưa có style." }: StylePickerProps) {
  if (loading) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 10 }}>
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="mo-skel" style={{ aspectRatio: "1 / 1", borderRadius: "var(--radius-md)" }} />)}
      </div>
    );
  }
  if (items.length === 0) {
    return <div style={{ fontSize: 13, color: "var(--muted-foreground)", padding: "12px 0" }}>{emptyText}</div>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 10 }}>
      {items.map((s) => {
        const active = value === s.id;
        return (
          <div
            key={s.id}
            role="button"
            tabIndex={0}
            onClick={() => onChange(clearable && active ? "" : s.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onChange(clearable && active ? "" : s.id)}
            style={{ cursor: "pointer" }}
          >
            <div style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: "var(--radius-md)", overflow: "hidden", border: `${active ? 2 : 1}px solid ${active ? "var(--volt-600)" : "var(--border)"}`, boxShadow: active ? "var(--shadow-glow)" : undefined, background: "var(--neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)" }}>
              {s.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image} alt={s.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <Icon name="palette" size={22} />
              )}
              {active && (
                <span style={{ position: "absolute", right: 6, top: 6, width: 20, height: 20, borderRadius: 99, background: "var(--volt-500)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--carbon-950)" }}>
                  <Icon name="check" size={12} stroke={3} />
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, fontWeight: active ? 600 : 500, marginTop: 6, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: active ? "var(--foreground)" : "var(--muted-foreground)" }}>{s.name}</div>
          </div>
        );
      })}
    </div>
  );
}
