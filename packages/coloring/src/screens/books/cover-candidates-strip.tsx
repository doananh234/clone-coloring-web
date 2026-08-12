"use client";

import { useState } from "react";
import { Icon } from "../../lib/icon";
import { useCoverCandidates } from "../../data/use-cover-candidates";
import { resolveImg } from "../../data/img";
import type { CoverCandidate } from "../../data/types";

/** D4c: manage a book's cover candidates — select (mirror coverUrl) and delete
 *  (non-selected). */
export function CoverCandidatesStrip({
  bookId, candidates, selectedId, onPreview,
}: {
  bookId: string;
  candidates: CoverCandidate[];
  selectedId?: string;
  /** Click a candidate image → open the shared Preview Dialog (like a colored page). */
  onPreview?: (url: string, title: string) => void;
}) {
  const cc = useCoverCandidates(bookId);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const disabled = !cc.enabled;

  const run = (kind: string, fn: () => Promise<void>) => async () => {
    setBusy(kind); setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Thất bại"); } finally { setBusy(null); }
  };

  if (candidates.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Header lives on the parent Card title ("Cover Candidates · N") — no duplicate here. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 10 }}>
        {candidates.map((c) => {
          const isSel = c.id === selectedId;
          const label = c.origin === "source" ? "Nguồn" : "Push";
          return (
            <div key={c.id}>
              {/* Image is the positioning context so the label/badges anchor to the
                  thumbnail, not the whole card (else the label overlaps the button below). */}
              <div title="Xem trước" onClick={() => onPreview?.(c.url, isSel ? "Bìa (đang chọn)" : `Cover · ${label}`)}
                style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: "var(--radius-sm)", overflow: "hidden", border: `${isSel ? 2 : 1}px solid ${isSel ? "var(--volt-600)" : "var(--border)"}`, boxShadow: isSel ? "var(--shadow-glow)" : undefined, background: "#fff", cursor: "pointer" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolveImg(c.url)} alt={label} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <span style={{ position: "absolute", left: 4, bottom: 4, fontSize: 9, fontWeight: 700, color: "#fff", background: "rgba(11,13,12,.6)", padding: "0 4px", borderRadius: 4 }}>{label}</span>
                {isSel && <span style={{ position: "absolute", right: 4, top: 4, background: "var(--volt-500)", color: "var(--carbon-950)", borderRadius: 99, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={10} /></span>}
                {!isSel && (
                  <button type="button" title="Xoá ứng viên" disabled={disabled || busy !== null}
                    onClick={(e) => { e.stopPropagation(); void run(`del-${c.id}`, () => cc.remove(c.id))(); }}
                    style={{ position: "absolute", right: 4, top: 4, background: "rgba(11,13,12,.6)", color: "#fff", border: "none", borderRadius: 99, width: 16, height: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="x" size={10} />
                  </button>
                )}
              </div>
              {!isSel && (
                <button type="button" title="Đặt candidate này làm ảnh bìa" disabled={disabled || busy !== null}
                  onClick={run(`sel-${c.id}`, () => cc.select(c.id))}
                  style={{ marginTop: 4, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 10.5, padding: "3px 4px", borderRadius: "var(--radius-sm)", border: "1px solid var(--volt-600)", background: "var(--card)", cursor: disabled ? "default" : "pointer" }}>
                  <Icon name="check" size={11} /> {busy === `sel-${c.id}` ? "Đang chọn…" : "Chọn làm bìa"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {err && <div style={{ padding: "6px 8px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12 }}>{err}</div>}
      {disabled && <div style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>Chọn/xoá ứng viên bìa chỉ chạy khi bật ghi thật (staging).</div>}
    </div>
  );
}
