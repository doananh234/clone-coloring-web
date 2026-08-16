"use client";

import { useEffect, useState } from "react";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { resolveImg } from "../../data/img";
import type { BookColoringPage } from "../../data/types";
import type { TitleSafePosition } from "../../data/source-covers";

const promptKey = (ts: TitleSafePosition) => `sourceCoverPrompt:${ts}`;

export function InteriorPickerModal({
  open, title, titleSafe, pages, busy, onPick, onClose, fetchDefaultPrompt,
}: {
  open: boolean;
  title: string;
  /** Position being generated — drives the per-position prompt override. */
  titleSafe: TitleSafePosition | null;
  pages: BookColoringPage[];
  busy: boolean;
  /** Second arg is the (possibly edited) prompt; empty string = server default. */
  onPick: (interiorPageId: string, promptOverride: string) => void;
  onClose: () => void;
  fetchDefaultPrompt: (titleSafe: TitleSafePosition) => Promise<string>;
}) {
  const [prompt, setPrompt] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [loadingPrompt, setLoadingPrompt] = useState(false);

  // On open (or position change): use the saved per-position edit if present,
  // otherwise prefill from the server's built-in default for that position.
  useEffect(() => {
    if (!open || !titleSafe) return;
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(promptKey(titleSafe)) : null;
    if (saved != null) { setPrompt(saved); return; }
    let cancelled = false;
    setLoadingPrompt(true);
    fetchDefaultPrompt(titleSafe)
      .then((d) => { if (!cancelled) setPrompt(d); })
      .catch(() => { if (!cancelled) setPrompt(""); })
      .finally(() => { if (!cancelled) setLoadingPrompt(false); });
    return () => { cancelled = true; };
  }, [open, titleSafe, fetchDefaultPrompt]);

  const onPromptChange = (v: string) => {
    setPrompt(v);
    if (titleSafe) window.localStorage.setItem(promptKey(titleSafe), v);
  };

  const restoreDefault = async () => {
    if (!titleSafe) return;
    setLoadingPrompt(true);
    try {
      const d = await fetchDefaultPrompt(titleSafe);
      setPrompt(d);
      window.localStorage.removeItem(promptKey(titleSafe));
    } catch {
      /* keep current text on failure */
    } finally {
      setLoadingPrompt(false);
    }
  };

  if (!open) return null;
  return (
    <div onClick={busy ? undefined : onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,13,12,.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", padding: 20, width: "min(880px, 94vw)", maxHeight: "86vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" style={{ background: "none", border: "none", cursor: busy ? "default" : "pointer" }}><Icon name="x" size={18} /></button>
        </div>

        {/* Advanced: editable prompt (persisted per-position in localStorage). */}
        <div style={{ marginBottom: 14, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
          <button
            type="button"
            onClick={() => setShowPrompt((s) => !s)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 10px", background: "none", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: "var(--foreground)" }}
          >
            <span><Icon name="settings" size={13} /> Prompt (nâng cao) — sửa để tinh chỉnh, không cần deploy</span>
            <Icon name={showPrompt ? "chevron-down" : "chevron-right"} size={14} />
          </button>
          {showPrompt && (
            <div style={{ padding: "0 10px 10px" }}>
              <textarea
                value={prompt}
                onChange={(e) => onPromptChange(e.target.value)}
                disabled={busy || loadingPrompt}
                spellCheck={false}
                placeholder={loadingPrompt ? "Đang tải prompt mặc định…" : "Để trống = dùng prompt mặc định của server"}
                style={{ width: "100%", minHeight: 160, resize: "vertical", fontFamily: "ui-monospace, monospace", fontSize: 11.5, lineHeight: 1.5, padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                  Đã lưu tự động cho vị trí {titleSafe ?? ""}. Để trống → prompt mặc định.
                </span>
                <Button type="button" variant="outline" size="sm" onClick={restoreDefault} disabled={busy || loadingPrompt}>
                  Khôi phục mặc định
                </Button>
              </div>
            </div>
          )}
        </div>

        {busy && <div style={{ marginBottom: 12, fontSize: 13, color: "var(--muted-foreground)" }}><Icon name="loader" size={14} /> Đang tạo bìa… (~2 phút, đừng đóng)</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 10, opacity: busy ? 0.5 : 1, pointerEvents: busy ? "none" : "auto" }}>
          {pages.map((p, i) => (
            <button key={p.id || i} type="button" onClick={() => onPick(p.id, prompt)} style={{ padding: 0, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden", cursor: "pointer", background: "#fff", aspectRatio: "1 / 1" }}>
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
