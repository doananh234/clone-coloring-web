"use client";

import { useState } from "react";
import { httpGet } from "@vx/core-uikit/api";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { usePageActions } from "../../data/use-page-actions";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "../../data/config";
import { resolveImg } from "../../data/img";
import type { BookColoringPage } from "../../data/types";

/**
 * Actions for one INTRO page (book.summaryPages): Regen and Xoá, nothing else.
 *
 * Kept apart from PageActionsRow on purpose. That component is built around an
 * interior page — it locates the page by index in coloringPages and offers
 * colorize, animation, cover candidates and camera changes, none of which mean
 * anything for a "This Book Belongs to" page. The two share the regen plumbing
 * in usePageActions, not the UI.
 *
 * Unlike interior regen (which appends optional extra instructions to the
 * server's prompt), this dialog shows the WHOLE prompt, prefilled from
 * GET /api/page-regen-prompt, and what the operator leaves in the box replaces
 * it outright — the same contract as the cover dialog.
 */

/**
 * Which rule set the regen prompt uses. "title" = a title page (illustration
 * plus title lettering, redrawn ~55% different); "text" = a text-only utility
 * page (copyright, table of contents, dedication, "this book belongs to"),
 * reproduced faithfully. Declared here rather than imported from server-core so
 * that server-only package stays out of the client bundle.
 */
type IntroVariant = "title" | "text";

export function IntroActionsRow({
  bookId,
  summaryPages,
  page,
  onRemoved,
}: {
  bookId: string;
  summaryPages: BookColoringPage[];
  page: BookColoringPage;
  onRemoved?: () => void;
}) {
  const actions = usePageActions(bookId);
  const [busy, setBusy] = useState<"regen" | "apply" | "remove" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cand, setCand] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  /** Server default per variant, cached so switching back does not refetch. */
  const [defaultPrompts, setDefaultPrompts] = useState<Partial<Record<IntroVariant, string>>>({});
  const [variant, setVariant] = useState<IntroVariant>("title");
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const disabled = !COLORING_WRITE_ENABLED;

  /**
   * Open the dialog on variant `v`, fetching the server's own prompt for it so
   * the box shows what really gets sent.
   */
  const loadPrompt = async (v: IntroVariant) => {
    setErr(null);
    setPromptOpen(true);
    setVariant(v);
    const cached = defaultPrompts[v];
    if (cached) {
      setPromptText(cached);
      return;
    }
    setLoadingPrompt(true);
    try {
      const qs = new URLSearchParams({ variant: v, bookId });
      const res = await httpGet<{ prompt?: string }>(`${COLORING_API_BASE}/intro-regen-prompt?${qs}`);
      const p = res?.prompt ?? "";
      setDefaultPrompts((prev) => ({ ...prev, [v]: p }));
      setPromptText(p);
    } catch {
      setErr("Không tải được prompt mặc định — bạn vẫn có thể tự nhập.");
    } finally {
      setLoadingPrompt(false);
    }
  };

  const runRegen = async () => {
    setBusy("regen");
    setErr(null);
    try {
      const r = await actions.genIntroCandidate(page, promptText);
      setCand(r.url);
      setPromptOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Regen thất bại");
    } finally {
      setBusy(null);
    }
  };

  const applyCand = async () => {
    if (!cand) return;
    setBusy("apply");
    setErr(null);
    try {
      await actions.applyIntroCandidate(summaryPages, page.id, cand);
      setCand(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Áp dụng thất bại");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm("Xoá trang intro này khỏi sách? Không thể hoàn tác.")) return;
    setBusy("remove");
    setErr(null);
    try {
      await actions.removeIntroPage(summaryPages, page.id);
      onRemoved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Xoá thất bại");
    } finally {
      setBusy(null);
    }
  };

  const activeDefault = defaultPrompts[variant] ?? "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Button variant="outline" size="sm" disabled={disabled || busy !== null} title="Vẽ lại trang intro — sửa được prompt" onClick={() => loadPrompt(variant)}>
          <Icon name="sparkles" size={15} /> Regen
        </Button>
        <Button variant="outline" size="sm" disabled={disabled || busy !== null} onClick={remove} style={{ marginLeft: "auto", color: "var(--danger)" }}>
          <Icon name="x" size={15} /> {busy === "remove" ? "Đang xoá…" : "Xoá"}
        </Button>
      </div>

      {cand && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 10, border: "1px solid var(--volt-600)", borderRadius: "var(--radius-md)", background: "var(--neutral-100)" }}>
          <div onClick={() => setZoom(true)} title="Bấm để phóng to" style={{ width: 120, height: 120, flexShrink: 0, borderRadius: "var(--radius-sm)", overflow: "hidden", border: "1px solid var(--border)", background: "#fff", cursor: "zoom-in", position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resolveImg(cand)} alt="bản mới" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            <span style={{ position: "absolute", right: 4, bottom: 4, background: "rgba(11,13,12,.6)", color: "#fff", borderRadius: 4, padding: 3, display: "flex" }}><Icon name="search" size={12} /></span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Bản regen</div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Bấm ảnh để phóng to. “Áp dụng” để dùng cho trang này, “Tạo lại” để sửa prompt và thử bản khác.</div>
          </div>
          <Button size="sm" disabled={busy !== null} onClick={applyCand}>{busy === "apply" ? "Đang áp dụng…" : "Áp dụng"}</Button>
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => loadPrompt(variant)}>Tạo lại</Button>
          <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => setCand(null)}>Bỏ</Button>
        </div>
      )}

      {zoom && cand && (
        <div onClick={() => setZoom(false)} style={{ position: "fixed", inset: 0, background: "rgba(11,13,12,.82)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resolveImg(cand)} alt="bản mới (phóng to)" style={{ maxWidth: "92vw", maxHeight: "88vh", objectFit: "contain", borderRadius: "var(--radius-md)", background: "#fff", boxShadow: "var(--shadow-lg)" }} />
        </div>
      )}

      {err && <div style={{ padding: "8px 10px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12 }}>{err}</div>}

      {disabled && (
        <div style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>
          Các thao tác chỉ chạy khi bật ghi thật (<span style={{ fontFamily: "var(--font-mono)" }}>NEXT_PUBLIC_COLORING_WRITE=1</span> · staging).
        </div>
      )}

      {promptOpen && (
        <div
          onClick={() => busy === null && setPromptOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", zIndex: 1000, padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--card, #fff)", borderRadius: "var(--radius-lg, 14px)", padding: 20, width: "min(680px, 94vw)", boxShadow: "0 12px 44px rgba(0,0,0,.28)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Icon name="sparkles" size={18} />
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Regen trang intro — prompt</h3>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", margin: "0 0 10px" }}>
              Chọn loại trang, rồi sửa prompt nếu cần. Nội dung trong ô sẽ <strong>thay thế hoàn toàn</strong> prompt mặc định.
            </p>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {(
                [
                  { v: "title" as const, label: "Trang tựa có hình", hint: "Có minh hoạ + chữ tựa — vẽ lại khác ~55%" },
                  { v: "text" as const, label: "Trang chữ thuần", hint: "Chỉ có chữ (bản quyền, mục lục…) — chép lại trung thành" },
                ]
              ).map(({ v, label, hint }) => (
                <Button
                  key={v}
                  variant={variant === v ? "primary" : "outline"}
                  size="sm"
                  title={hint}
                  disabled={busy !== null || loadingPrompt}
                  onClick={() => {
                    if (v !== variant) void loadPrompt(v);
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
            <textarea
              className="mo-input"
              value={loadingPrompt ? "Đang tải prompt mặc định…" : promptText}
              onChange={(e) => setPromptText(e.target.value)}
              readOnly={loadingPrompt}
              autoFocus
              style={{ width: "100%", minHeight: 240, padding: "10px 12px", lineHeight: 1.6, resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 12.5 }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy !== null || loadingPrompt || !activeDefault || promptText === activeDefault}
                onClick={() => setPromptText(activeDefault)}
              >
                Khôi phục mặc định
              </Button>
              <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => setPromptOpen(false)}>Huỷ</Button>
              <Button size="sm" disabled={busy !== null || loadingPrompt || !promptText.trim()} onClick={runRegen}>
                <Icon name="sparkles" size={15} /> {busy === "regen" ? "Đang tạo…" : "Tạo bản xem trước"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
