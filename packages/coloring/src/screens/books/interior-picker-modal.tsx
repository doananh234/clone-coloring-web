"use client";

import { useEffect, useState } from "react";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { ProviderSelect, useProviderPreference, type ImageProvider } from "../../components/provider-select";
import { thumbImg } from "../../data/img";
import type { BookColoringPage } from "../../data/types";
import type { TitleSafePosition } from "../../data/source-covers";

const promptKey = (ts: TitleSafePosition) => `sourceCoverPrompt:${ts}`;

/** Max interior pages selectable for a single Gen Cover action. */
const MAX_SELECT = 3;

export function InteriorPickerModal({
  open, title, titleSafe, pages, busy, onConfirm, onClose, fetchDefaultPrompt,
}: {
  open: boolean;
  title: string;
  /** Position being generated — drives the per-position prompt override. */
  titleSafe: TitleSafePosition | null;
  pages: BookColoringPage[];
  busy: boolean;
  /** Fired on "Gen (N)": the chosen interior ids + the (possibly edited) prompt
   *  (empty string = server default). One background job is queued per id. */
  onConfirm: (interiorPageIds: string[], promptOverride: string, provider: ImageProvider) => void;
  onClose: () => void;
  fetchDefaultPrompt: (titleSafe: TitleSafePosition) => Promise<string>;
}) {
  const [provider, setProvider] = useProviderPreference();
  const [prompt, setPrompt] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  // Transient status line (Copy/Xóa/Apply feedback). Cleared after a moment.
  const [notice, setNotice] = useState("");
  // Selected interior page ids (order preserved), capped at MAX_SELECT.
  const [selected, setSelected] = useState<string[]>([]);

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

  // Reset the selection whenever the dialog opens or switches position.
  useEffect(() => { setSelected([]); }, [open, titleSafe]);

  // Edits are held in local state only; nothing is persisted until "Apply".
  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(""), 2200);
  };

  // Toggle an interior page in/out of the selection (max MAX_SELECT).
  const toggleSelect = (id: string) => {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_SELECT) { flash(`Chỉ chọn tối đa ${MAX_SELECT} ảnh cho một lần tạo`); return cur; }
      return [...cur, id];
    });
  };

  const confirmGen = () => {
    if (busy || selected.length === 0) return;
    onConfirm(selected, prompt, provider);
  };

  // Copy Prompt — put the current text on the clipboard.
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      flash("Đã copy prompt vào clipboard");
    } catch {
      flash("Không copy được (trình duyệt chặn clipboard)");
    }
  };

  // Xóa Prompt — empty the box. Empty text = server default at generation time.
  const clearPrompt = () => {
    setPrompt("");
    flash("Đã xóa prompt (để trống → dùng prompt mặc định khi tạo)");
  };

  // Apply Prompt — commit the current text as the saved override for this
  // position (persisted in localStorage, reused next time the dialog opens).
  const applyPrompt = () => {
    if (!titleSafe) return;
    window.localStorage.setItem(promptKey(titleSafe), prompt);
    flash(`Đã áp dụng & lưu prompt cho vị trí ${titleSafe}`);
  };

  const restoreDefault = async () => {
    if (!titleSafe) return;
    setLoadingPrompt(true);
    try {
      const d = await fetchDefaultPrompt(titleSafe);
      setPrompt(d);
      window.localStorage.removeItem(promptKey(titleSafe));
      flash("Đã khôi phục prompt mặc định");
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
                onChange={(e) => setPrompt(e.target.value)}
                disabled={busy || loadingPrompt}
                spellCheck={false}
                placeholder={loadingPrompt ? "Đang tải prompt mặc định…" : "Để trống = dùng prompt mặc định của server"}
                style={{ width: "100%", minHeight: 160, resize: "vertical", fontFamily: "ui-monospace, monospace", fontSize: 11.5, lineHeight: 1.5, padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: 11, color: notice ? "var(--foreground)" : "var(--muted-foreground)", fontWeight: notice ? 600 : 400 }}>
                  {notice || `Vị trí ${titleSafe ?? ""}. Bấm "Apply Prompt" để lưu, để trống → prompt mặc định.`}
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <Button type="button" variant="outline" size="sm" onClick={copyPrompt} disabled={busy || loadingPrompt || !prompt}>
                    Copy Prompt
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={clearPrompt} disabled={busy || loadingPrompt || !prompt}>
                    Xóa Prompt
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={applyPrompt} disabled={busy || loadingPrompt}>
                    Apply Prompt
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={restoreDefault} disabled={busy || loadingPrompt}>
                    Khôi phục mặc định
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 12, fontSize: 12.5, color: "var(--muted-foreground)" }}>
          {busy ? (
            <><Icon name="loader" size={14} /> Đang thêm vào hàng đợi…</>
          ) : (
            <>Tick chọn 1–{MAX_SELECT} ảnh rồi bấm <b>Gen</b>. Mỗi ảnh tạo 1 tác vụ chạy ngầm — theo dõi ở icon hàng đợi trên header.</>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 10, opacity: busy ? 0.5 : 1, pointerEvents: busy ? "none" : "auto" }}>
          {pages.map((p, i) => {
            const isSel = selected.includes(p.id);
            const order = selected.indexOf(p.id) + 1;
            return (
              <button
                key={p.id || i}
                type="button"
                aria-pressed={isSel}
                onClick={() => toggleSelect(p.id)}
                style={{ position: "relative", padding: 0, border: isSel ? "2px solid var(--accent, #4f46e5)" : "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden", cursor: "pointer", background: "#fff", aspectRatio: "1 / 1", outline: isSel ? "2px solid color-mix(in srgb, var(--accent, #4f46e5) 30%, transparent)" : "none" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbImg(p.url, 400)} alt={`Trang ${i + 1}`} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {/* Checkbox indicator (top-left) */}
                <span style={{ position: "absolute", top: 6, left: 6, width: 20, height: 20, borderRadius: 5, border: "1px solid rgba(11,13,12,.35)", background: isSel ? "var(--accent, #4f46e5)" : "rgba(255,255,255,.85)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                  {isSel ? order : ""}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Đã chọn {selected.length}/{MAX_SELECT}</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <ProviderSelect value={provider} onChange={setProvider} disabled={busy} />
            <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>Đóng</Button>
            <Button size="sm" onClick={confirmGen} disabled={busy || selected.length === 0}>
              <Icon name="sparkles" size={14} /> Gen ({selected.length})
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
