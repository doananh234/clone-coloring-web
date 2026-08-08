"use client";

import { useState } from "react";
import { ApiError } from "@vx/core-uikit/api";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Icon } from "../../lib/icon";
import { resolveImg } from "../../data/img";
import { useColoringStyleVariantActions } from "../../data/use-coloring-style-variant-actions";

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
 * Display of a coloring style's color variants. Each variant is one palette
 * (primary + accent colors) captured from a source cover — this is what replaced
 * spawning a duplicate ColoringStyle per book. When `styleId` is provided AND
 * write mode is on, each variant gets a delete button (single-variant delete via
 * the /variants/[variantId] API); the last variant is blocked (delete the whole
 * style instead), and a variant still referenced by books warns before deleting.
 */
export function ColorVariantsSection({ variants, styleId }: { variants: unknown; styleId?: string }) {
  const list = Array.isArray(variants) ? (variants as Variant[]) : [];
  const actions = useColoringStyleVariantActions(styleId ?? "");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const canDelete = !!styleId && actions.enabled && list.length > 1;

  const onDelete = async (variantId: string) => {
    if (!window.confirm("Xoá bảng màu (variant) này khỏi style? Hành động không thể hoàn tác.")) return;
    setBusyId(variantId);
    setErr(null);
    try {
      await actions.removeVariant(variantId);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const body = (e.body ?? {}) as { error?: string; message?: string; inUseBy?: number };
        if (body.error === "last-variant") {
          setErr(body.message ?? "Đây là bảng màu cuối cùng — hãy xoá cả style.");
        } else if (body.error === "in-use") {
          const n = body.inUseBy ?? 0;
          if (window.confirm(`${n} sách đang dùng bảng màu này. Vẫn xoá? (tham chiếu ở sách sẽ mồ côi)`)) {
            try {
              await actions.removeVariant(variantId, { force: true });
            } catch (e2) {
              setErr(e2 instanceof Error ? e2.message : "Xoá thất bại");
            }
          }
        } else {
          setErr("Xoá thất bại (409).");
        }
      } else {
        setErr(e instanceof Error ? e.message : "Xoá thất bại");
      }
    } finally {
      setBusyId(null);
    }
  };

  if (list.length === 0) return null;
  return (
    <Card>
      <div style={{ fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        Bảng màu (variants) <Badge tone="info">{list.length}</Badge>
      </div>
      {err && <div style={{ marginBottom: 10, fontSize: 12.5, color: "var(--danger)" }}>{err}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
        {list.map((v, idx) => {
          const p = v.colorPalette ?? {};
          const primary = (p.primaryColors ?? []).filter(Boolean);
          const accent = (p.accentColors ?? []).filter(Boolean);
          const img = resolveImg(v.thumbnailUrl);
          const meta = [`#${idx + 1}`, p.backgroundTone, p.warmth, p.saturation].filter(Boolean).join(" · ");
          const deletable = canDelete && !!v.id;
          return (
            <div
              key={v.id ?? idx}
              style={{ position: "relative", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden", display: "flex", flexDirection: "column" }}
            >
              {deletable && (
                <button
                  type="button"
                  title="Xoá bảng màu này"
                  disabled={busyId === v.id}
                  onClick={() => onDelete(v.id as string)}
                  style={{ position: "absolute", top: 6, right: 6, zIndex: 2, width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,.92)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: busyId === v.id ? "wait" : "pointer", color: "var(--danger)" }}
                >
                  <Icon name={busyId === v.id ? "loader" : "trash-2"} size={15} />
                </button>
              )}
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
