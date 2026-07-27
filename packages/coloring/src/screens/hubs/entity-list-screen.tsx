"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Card } from "../../components/ui/card";
import { Badge, type BadgeTone } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { LoadingRows, EmptyState, ErrorState } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { useEntityList } from "../../data/use-entity-list";
import { resolveImg } from "../../data/img";
import type { EntityListItem } from "../../data/types";

export interface EntityCard {
  id: string;
  image?: string;
  name: string;
  desc?: string;
  meta?: ReactNode;
  badges?: { tone: BadgeTone; text: string }[];
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
}

export function EntityListScreen({ title, subtitle, path, kind, toCard, action, emptyText }: EntityListScreenProps) {
  const router = useRouter();
  const { items, total, isLoading, isError } = useEntityList(path);
  const [q, setQ] = useState("");

  const ql = q.trim().toLowerCase();
  const cards = items.map(toCard).filter((c) => !ql || c.name.toLowerCase().includes(ql));

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

      {isLoading ? (
        <Card><LoadingRows rows={4} height={90} /></Card>
      ) : isError ? (
        <Card><ErrorState sub={`Không gọi được /${path}.`} /></Card>
      ) : cards.length === 0 ? (
        <Card><EmptyState title="Chưa có dữ liệu" sub={emptyText} /></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 16 }}>
          {cards.map((c) => (
            <div key={c.id} className="mo-bookcard" onClick={() => router.push(`${B}/entity/${kind}/${c.id}`)}>
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
              {c.meta && <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{c.meta}</div>}
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
