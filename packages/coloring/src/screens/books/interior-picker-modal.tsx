"use client";

import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { resolveImg } from "../../data/img";
import type { BookColoringPage } from "../../data/types";

export function InteriorPickerModal({
  open, title, pages, busy, onPick, onClose,
}: {
  open: boolean;
  title: string;
  pages: BookColoringPage[];
  busy: boolean;
  onPick: (interiorPageId: string) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div onClick={busy ? undefined : onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,13,12,.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", padding: 20, width: "min(880px, 94vw)", maxHeight: "86vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" style={{ background: "none", border: "none", cursor: busy ? "default" : "pointer" }}><Icon name="x" size={18} /></button>
        </div>
        {busy && <div style={{ marginBottom: 12, fontSize: 13, color: "var(--muted-foreground)" }}><Icon name="loader" size={14} /> Đang tạo bìa… (~2 phút, đừng đóng)</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 10, opacity: busy ? 0.5 : 1, pointerEvents: busy ? "none" : "auto" }}>
          {pages.map((p, i) => (
            <button key={p.id || i} type="button" onClick={() => onPick(p.id)} style={{ padding: 0, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden", cursor: "pointer", background: "#fff", aspectRatio: "1 / 1" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolveImg(p.url)} alt={`Trang ${i + 1}`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </button>
          ))}
        </div>
        <div style={{ marginTop: 14, textAlign: "right" }}>
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>Đóng</Button>
        </div>
      </div>
    </div>
  );
}
