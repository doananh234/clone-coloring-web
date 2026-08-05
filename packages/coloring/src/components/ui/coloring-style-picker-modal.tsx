"use client";

import { useEffect, useState } from "react";
import { Icon } from "../../lib/icon";
import { Button } from "./button";
import { Badge } from "./badge";
import { useEntityList } from "../../data/use-entity-list";
import { useIsMobile } from "../../hooks/use-is-mobile";
import { resolveImg } from "../../data/img";
import type { EntityListItem } from "../../data/types";

interface Variant {
  id: string;
  colorPalette?: { primaryColors?: string[]; accentColors?: string[]; backgroundTone?: string; warmth?: string; saturation?: string };
  thumbnailUrl?: string | null;
}

export interface StyleSelection {
  styleId: string;
  styleName: string;
  variantId: string | null;
  /** Resolved thumbnail of the chosen variant (or style), for the trigger preview. */
  thumb?: string;
  /** Primary colors of the chosen variant, for a compact swatch preview. */
  swatches?: string[];
}

export interface ColoringStylePickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (sel: StyleSelection) => void;
  /** Thumbnail of the page being colorized — shown for visual reference. */
  referenceThumb?: string;
}

function readVariants(item: EntityListItem): Variant[] {
  const vs = (item as unknown as { variants?: unknown }).variants;
  return Array.isArray(vs) ? (vs as Variant[]).filter((v) => v && typeof v.id === "string") : [];
}
function styleThumb(item: EntityListItem): string | undefined {
  return resolveImg(item.thumbnailUrl || item.referenceImages?.[0] || readVariants(item)[0]?.thumbnailUrl || undefined);
}
function variantColors(v: Variant): string[] {
  const p = v.colorPalette ?? {};
  return [...(p.primaryColors ?? []), ...(p.accentColors ?? [])].filter((c) => typeof c === "string" && c);
}

function Swatches({ colors, size = 18 }: { colors: string[]; size?: number }) {
  if (colors.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {colors.map((c, i) => (
        <span key={i} title={c} style={{ width: size, height: size, borderRadius: 5, background: c, border: "1px solid var(--border)" }} />
      ))}
    </div>
  );
}

/**
 * Two-step coloring-style picker: browse styles as large cards → open one to see
 * the base style (left) and its color variants (right, big image + palette) →
 * pick a variant. Styles with no variant can be chosen directly.
 */
export function ColoringStylePickerModal({ open, onClose, onSelect, referenceThumb }: ColoringStylePickerModalProps) {
  const { items, isLoading } = useEntityList("coloring-styles");
  const [selected, setSelected] = useState<EntityListItem | null>(null);
  const [q, setQ] = useState("");
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open) { setSelected(null); setQ(""); }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") (selected ? setSelected(null) : onClose()); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, selected, onClose]);

  if (!open) return null;

  const ql = q.trim().toLowerCase();
  const shown = items.filter((s) => !ql || s.name.toLowerCase().includes(ql));

  const choose = (style: EntityListItem, v: Variant | null) => {
    onSelect({
      styleId: style.id,
      styleName: style.name,
      variantId: v?.id ?? null,
      thumb: resolveImg(v?.thumbnailUrl || style.thumbnailUrl || undefined),
      swatches: v ? variantColors(v).slice(0, 6) : [],
    });
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,13,12,.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? 8 : 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface, #fff)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", width: "min(1100px, 96vw)", height: isMobile ? "min(94vh, 760px)" : "min(760px, 90vh)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          {selected && (
            <button type="button" onClick={() => setSelected(null)} aria-label="Quay lại" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: "var(--foreground)" }}><Icon name="arrow-left" size={20} /></button>
          )}
          {referenceThumb && (
            <span title="Trang đang tô" style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={referenceThumb} alt="Trang đang tô" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", border: "1px solid var(--border)", background: "#fff" }} />
            </span>
          )}
          <div style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{selected ? selected.name : "Chọn coloring style"}</div>
          {!selected && (
            <div style={{ width: isMobile ? 130 : 240, flexShrink: 0 }}>
              <input placeholder="Tìm style…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", fontSize: 13, background: "var(--neutral-100)" }} />
            </div>
          )}
          <button type="button" onClick={onClose} aria-label="Đóng" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: "var(--muted-foreground)" }}><Icon name="x" size={20} /></button>
        </div>

        {/* body */}
        {!selected ? (
          <div style={{ overflowY: "auto", padding: 18 }}>
            {isLoading ? (
              <div style={{ color: "var(--muted-foreground)", fontSize: 13 }}>Đang tải…</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 16 }}>
                {shown.map((s) => {
                  const count = readVariants(s).length;
                  const img = styleThumb(s);
                  return (
                    <div key={s.id} className="mo-bookcard" onClick={() => setSelected(s)} style={{ cursor: "pointer" }}>
                      <div style={{ aspectRatio: "1 / 1", borderRadius: "var(--radius-md)", background: "var(--neutral-100)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)", overflow: "hidden" }}>
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img} alt={s.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : <Icon name="image" size={26} />}
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                      {count > 0 && <Badge tone="info">{count} màu</Badge>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", flex: 1, minHeight: 0, overflowY: isMobile ? "auto" : "visible" }}>
            {/* LEFT: base style */}
            <div style={{ width: isMobile ? "auto" : 300, flexShrink: 0, borderRight: isMobile ? "none" : "1px solid var(--border)", borderBottom: isMobile ? "1px solid var(--border)" : "none", padding: isMobile ? 14 : 18, overflowY: isMobile ? "visible" : "auto", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", color: "var(--muted-foreground)" }}>STYLE GỐC</div>
              <div style={{ aspectRatio: "1 / 1", borderRadius: "var(--radius-md)", background: "var(--neutral-100)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {styleThumb(selected) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={styleThumb(selected)} alt={selected.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : <Icon name="image" size={28} />}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{selected.name}</div>
              {selected.description && <div style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.5 }}>{selected.description}</div>}
              {readVariants(selected).length === 0 && (
                <Button size="sm" onClick={() => choose(selected, null)}><Icon name="palette" size={15} /> Dùng style này</Button>
              )}
            </div>

            {/* RIGHT: variants */}
            <div style={{ flex: 1, minWidth: 0, padding: isMobile ? 14 : 18, overflowY: isMobile ? "visible" : "auto" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", color: "var(--muted-foreground)", marginBottom: 12 }}>
                CHỌN BẢNG MÀU (VARIANT) · {readVariants(selected).length}
              </div>
              {readVariants(selected).length === 0 ? (
                <div style={{ color: "var(--muted-foreground)", fontSize: 13 }}>Style này chưa có variant màu. Dùng nút bên trái để chọn style.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 16 }}>
                  {readVariants(selected).map((v, i) => {
                    const img = resolveImg(v.thumbnailUrl || undefined);
                    const colors = variantColors(v);
                    const tone = [v.colorPalette?.backgroundTone, v.colorPalette?.warmth].filter(Boolean).join(" · ");
                    return (
                      <div key={v.id} className="mo-bookcard" onClick={() => choose(selected, v)} style={{ cursor: "pointer" }}>
                        <div style={{ aspectRatio: "1 / 1", borderRadius: "var(--radius-md)", background: "var(--neutral-100)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)", overflow: "hidden" }}>
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img} alt={`variant ${i + 1}`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : <Icon name="image" size={24} />}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>#{i + 1}{tone ? ` · ${tone}` : ""}</div>
                        <Swatches colors={colors} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
