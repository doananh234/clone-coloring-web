"use client";

import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Icon } from "../../lib/icon";
import { resolveImg } from "../../data/img";

/** One color palette captured from a source cover (see ColoringStyle.variants). */
interface Variant {
  id?: string;
  colorPalette?: {
    primaryColors?: string[];
    accentColors?: string[];
    backgroundTone?: string;
    warmth?: string;
    saturation?: string;
  };
  thumbnailUrl?: string | null;
}

function Swatches({ colors }: { colors: string[] }) {
  if (colors.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {colors.map((c, i) => (
        <span
          key={i}
          title={c}
          style={{ width: 20, height: 20, borderRadius: 6, background: c, border: "1px solid var(--border)" }}
        />
      ))}
    </div>
  );
}

/**
 * Read-only display of a coloring style's color variants. Each variant is one
 * palette (primary + accent colors) captured from a source cover — this is what
 * replaced spawning a duplicate ColoringStyle per book.
 */
export function ColorVariantsSection({ variants }: { variants: unknown }) {
  const list = Array.isArray(variants) ? (variants as Variant[]) : [];
  if (list.length === 0) return null;
  return (
    <Card>
      <div style={{ fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        Bảng màu (variants) <Badge tone="info">{list.length}</Badge>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
        {list.map((v, idx) => {
          const p = v.colorPalette ?? {};
          const primary = (p.primaryColors ?? []).filter(Boolean);
          const accent = (p.accentColors ?? []).filter(Boolean);
          const img = resolveImg(v.thumbnailUrl);
          const meta = [`#${idx + 1}`, p.backgroundTone, p.warmth, p.saturation].filter(Boolean).join(" · ");
          return (
            <div
              key={v.id ?? idx}
              style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden", display: "flex", flexDirection: "column" }}
            >
              <div style={{ aspectRatio: "1 / 1", background: "var(--neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)", overflow: "hidden" }}>
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt={`variant ${idx + 1}`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <Icon name="image" size={28} />
                )}
              </div>
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{meta}</div>
                <Swatches colors={primary} />
                {accent.length > 0 && <Swatches colors={accent} />}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
