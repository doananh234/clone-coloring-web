"use client";

import { Badge } from "../../components/ui/badge";
import { humanize } from "./entity-fields";

/** Keys that are meta/urls/structural — never rendered as descriptive fields. */
const HIDE = new Set([
  "id", "name", "displayName", "createdAt", "updatedAt", "sourceBookId", "success",
  "thumbnailUrl", "logoUrl", "referenceImageUrl", "referenceImages", "coloringStyleId",
  "index", "isPublic", "data", "__v",
]);

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const isHexArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && HEX.test(x.trim()));
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string");
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A row of hex color chips (swatch + code) — the "bộ màu sẽ dùng". */
export function Swatches({ colors }: { colors: string[] }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {colors.map((c, i) => {
        const hex = c.trim();
        return (
          <div key={`${hex}-${i}`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 8px 3px 3px", border: "1px solid var(--border)", borderRadius: 999, background: "var(--card)" }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", background: hex, border: "1px solid rgba(0,0,0,0.12)", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.02em" }}>{hex}</span>
          </div>
        );
      })}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", marginBottom: 6 }}>
      {children}
    </div>
  );
}

/** Render one value: hex array → swatches, string array → badges, string → text. */
function Value({ value }: { value: unknown }) {
  if (isHexArray(value)) return <Swatches colors={value} />;
  if (isStringArray(value)) {
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {value.map((v, i) => <Badge tone="neutral" key={i}>{v}</Badge>)}
      </div>
    );
  }
  if (typeof value === "string" || typeof value === "number") {
    return <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{String(value)}</p>;
  }
  return null;
}

/** A nested group (e.g. colorPalette, medium, shadingAndLighting) as a bordered block. */
function Group({ label, obj }: { label: string; obj: Record<string, unknown> }) {
  const entries = Object.entries(obj).filter(([, v]) => isHexArray(v) || isStringArray(v) || (typeof v === "string" && v.trim()) || typeof v === "number");
  if (entries.length === 0) return null;
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14, background: "var(--neutral-50, var(--card))" }}>
      <FieldLabel>{humanize(label)}</FieldLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {entries.map(([k, v]) => (
          <div key={k}>
            {/* Palette arrays get their own sub-label; description shown without redundant "Description" label */}
            {k !== "description" && <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 4 }}>{humanize(k)}</div>}
            <Value value={v} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Renders an extracted / stored style object with real structure:
 * flat strings/arrays as fields, and nested groups (colorPalette with hex
 * swatches, medium, shading, fill, feel) as bordered blocks. Used by both the
 * extract-result preview and the entity detail view so the palette is always visible.
 */
export function StyleResultView({ data, omit }: { data: Record<string, unknown>; omit?: string[] }) {
  const hidden = omit ? new Set([...HIDE, ...omit]) : HIDE;
  const entries = Object.entries(data).filter(([k]) => !hidden.has(k));
  const flat = entries.filter(([, v]) => isHexArray(v) || isStringArray(v) || (typeof v === "string" && (v as string).trim()) || typeof v === "number");
  const groups = entries.filter(([, v]) => isPlainObject(v));

  // Palette first so the color set is the most prominent thing.
  groups.sort(([a], [b]) => (a === "colorPalette" ? -1 : b === "colorPalette" ? 1 : 0));

  if (flat.length === 0 && groups.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {flat.map(([k, v]) => (
        <div key={k}>
          <FieldLabel>{humanize(k)}</FieldLabel>
          <Value value={v} />
        </div>
      ))}
      {groups.map(([k, v]) => (
        <Group key={k} label={k} obj={v as Record<string, unknown>} />
      ))}
    </div>
  );
}
