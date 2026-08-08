"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Card } from "../../components/ui/card";
import { Badge, type BadgeTone } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { LoadingRows, EmptyState, ErrorState } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { useEntityList } from "../../data/use-entity-list";
import { useEntityBulkDelete } from "../../data/use-entity-bulk-delete";
import { resolveImg } from "../../data/img";
import type { EntityListItem } from "../../data/types";

export interface EntityCard {
  id: string;
  image?: string;
  name: string;
  desc?: string;
  meta?: ReactNode;
  badges?: { tone: BadgeTone; text: string }[];
  /** Small color swatch row (e.g. a coloring style's palette). */
  swatches?: string[];
  round?: boolean;
}

export interface EntityListScreenProps {
  title: string;
  subtitle: string;
  path: string;
  kind: string;
  toCard: (raw: EntityListItem) => EntityCard;
  action?: ReactNode;
  emptyText?: string;
  /** Gallery layout: large image on top of each card (easier to inspect visuals). */
  largeImage?: boolean;
  /** Enables multi-select + a bulk-delete action bar. Off by default (cards just open detail). */
  selectable?: boolean;
  /** API kind used for DELETE when selectable (defaults to `kind`). */
  deleteKind?: string;
}

export function EntityListScreen({ title, subtitle, path, kind, toCard, action, emptyText, largeImage, selectable, deleteKind }: EntityListScreenProps) {
  const router = useRouter();
  const { items, total, isLoading, isError } = useEntityList(path);
  const [q, setQ] = useState("");
  const bulk = useEntityBulkDelete(deleteKind ?? kind);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toggle = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearSel = () => { setSelected(new Set()); setErr(null); };
  const removeSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Xoá ${selected.size} mục đã chọn? Hành động này không thể hoàn tác.`)) return;
    setBusy(true); setErr(null);
    try { await bulk.removeMany([...selected]); clearSel(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Xoá thất bại"); }
    finally { setBusy(false); }
  };

  const ql = q.trim().toLowerCase();
  // Search the full loaded list (useEntityList fetches all rows) across name +
  // description + tags — not just the card name.
  const matches = (it: EntityListItem) =>
    it.name.toLowerCase().includes(ql) ||
    (it.description ?? "").toLowerCase().includes(ql) ||
    (it.tags ?? []).some((t) => t.toLowerCase().includes(ql));
  const cards = items.filter((it) => !ql || matches(it)).map(toCard);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>{title}</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>{isLoading ? "Đang tải…" : `${total} · ${subtitle}`}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {action}
          <div style={{ width: 240 }}><Input icon="search" placeholder={`Tìm ${title.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
      </div>

      {selectable && selected.size > 0 && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>Đã chọn {selected.size} mục</span>
            <div style={{ flex: 1 }} />
            <Button size="sm" disabled={busy || !bulk.enabled}
              title={bulk.enabled ? undefined : "Cần bật ghi thật (staging)"}
              style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
              onClick={removeSelected}>
              <Icon name="trash-2" size={16} /> {busy ? "Đang xoá…" : "Xoá đã chọn"}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={clearSel}>Bỏ chọn</Button>
          </div>
          {err && <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--danger)" }}>{err}</div>}
        </Card>
      )}

      {isLoading ? (
        <Card><LoadingRows rows={4} height={90} /></Card>
      ) : isError ? (
        <Card><ErrorState sub={`Không gọi được /${path}.`} /></Card>
      ) : cards.length === 0 ? (
        <Card><EmptyState title="Chưa có dữ liệu" sub={emptyText} /></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill,minmax(${largeImage ? 260 : 240}px,1fr))`, gap: 16 }}>
          {cards.map((c) => (
            <div key={c.id} className="mo-bookcard"
              onClick={() => router.push(`${B}/entity/${kind}/${c.id}`)}
              style={{ position: "relative", ...(selectable && selected.has(c.id) ? { outline: "2px solid var(--volt-600)", outlineOffset: 2 } : {}) }}>
              {selectable && (
                <label onClick={(e) => e.stopPropagation()} title="Chọn để xoá"
                  style={{ position: "absolute", top: 8, left: 8, zIndex: 2, width: 26, height: 26, borderRadius: 7, background: "rgba(255,255,255,.92)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} style={{ cursor: "pointer", width: 15, height: 15 }} />
                </label>
              )}
              {largeImage ? (
                <>
                  <div style={{ aspectRatio: "1 / 1", borderRadius: c.round === false ? "var(--radius-md)" : 99, background: "var(--neutral-100)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)", overflow: "hidden" }}>
                    {c.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.image} alt={c.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <Icon name="image" size={28} />
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                  {c.desc && <div style={{ fontSize: 12, color: "var(--muted-foreground)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.desc}</div>}
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 44, height: 44, borderRadius: c.round === false ? "var(--radius-md)" : 99, background: "var(--neutral-100)", border: "1px solid var(--border)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)", flexShrink: 0, overflow: "hidden" }}>
                    {c.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.image} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <Icon name="image" size={18} />
                    )}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                    {c.desc && <div style={{ fontSize: 12, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.desc}</div>}
                  </div>
                </div>
              )}
              {c.meta && <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{c.meta}</div>}
              {c.swatches && c.swatches.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {c.swatches.map((col, i) => (
                    <span key={i} title={col} style={{ width: 16, height: 16, borderRadius: 4, background: col, border: "1px solid var(--border)" }} />
                  ))}
                </div>
              )}
              {c.badges && c.badges.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {c.badges.map((bd, i) => <Badge tone={bd.tone} key={i}>{bd.text}</Badge>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
