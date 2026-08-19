"use client";

import { useState } from "react";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { ColoringStylePickerModal, type StyleSelection } from "../../components/ui/coloring-style-picker-modal";
import { usePageActions } from "../../data/use-page-actions";
import { usePageAdditional, type RegenAddOpts } from "../../data/use-page-additional";
import { useCoverCandidates } from "../../data/use-cover-candidates";
import { useSourceCovers } from "../../data/use-source-covers";
import { resolveImg } from "../../data/img";
import type { BookColoringPage } from "../../data/types";

interface Candidate {
  url: string;
  cameraView?: string;
  kind: "regen" | "angle";
}

export function PageActionsRow({
  bookId,
  pages,
  page,
  bookData,
  onRemoved,
  variant = "page",
  sourceCover,
}: {
  bookId: string;
  pages: BookColoringPage[];
  page: BookColoringPage;
  /** Full book.data JSON blob — merged (with coverMeta) when setting this page as cover source. */
  bookData?: Record<string, unknown>;
  onRemoved: () => void;
  variant?: "page" | "sourceCover";
  sourceCover?: import("../../data/source-covers").SourceCover;
}) {
  const cloneJobId = typeof bookData?.cloneJobId === "string" ? bookData.cloneJobId : undefined;
  const actions = usePageActions(bookId, cloneJobId);
  const additional = usePageAdditional(bookId);
  const coverCandidates = useCoverCandidates(bookId);
  const sourceCovers = useSourceCovers(bookId);
  const isSC = variant === "sourceCover" && !!sourceCover;
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenOpts, setRegenOpts] = useState<RegenAddOpts>({ count: 2, source: "A", changePercent: 30 });
  // Book page maps 1:1 by array index to its source clone job page.
  const pageIndex = pages.findIndex((p) => p.id === page.id);
  // Cover / thumbnail / square are set from the COLORED version (like the old
  // "Set Colored as …" lightbox actions) → only offered once the page is colorized.
  const colored = page.coloredUrl;
  // Coloring style + color variant chosen via the picker modal (replaces the
  // old flat dropdown — lets the user browse styles then pick a palette variant).
  const [sel, setSel] = useState<StyleSelection | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Regen/Đổi góc generate a candidate WITHOUT applying → user previews + chooses.
  const [cand, setCand] = useState<Candidate | null>(null);
  const [zoom, setZoom] = useState(false);

  const disabled = !actions.enabled;

  const run = (kind: string, fn: () => Promise<void>, after?: () => void) => async () => {
    setBusy(kind);
    setErr(null);
    try {
      await fn();
      after?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Thất bại");
    } finally {
      setBusy(null);
    }
  };

  const doGen = (newAngle: boolean) => async () => {
    setBusy(newAngle ? "angle" : "regen");
    setErr(null);
    setZoom(false);
    try {
      const r = await actions.genCandidate(pageIndex, newAngle);
      setCand({ url: r.url, cameraView: r.cameraView, kind: newAngle ? "angle" : "regen" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Tạo bản mới thất bại");
    } finally {
      setBusy(null);
    }
  };

  const applyCand = async () => {
    if (!cand) return;
    setBusy("apply");
    setErr(null);
    try {
      await actions.applyCandidate(pageIndex, cand.kind);
      setCand(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Áp dụng thất bại");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      {/* single horizontal action bar: colorize + manage buttons */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          style={{ flex: "1 1 240px", minWidth: 180, display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--neutral-100)", cursor: "pointer", textAlign: "left" }}
        >
          {sel?.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sel.thumb} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", border: "1px solid var(--border)", flexShrink: 0 }} />
          ) : (
            <span style={{ width: 32, height: 32, borderRadius: 6, background: "var(--neutral-200, #eee)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)", flexShrink: 0 }}><Icon name="palette" size={16} /></span>
          )}
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: sel ? 600 : 400, color: sel ? "var(--foreground)" : "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sel ? sel.styleName : "Chọn coloring style…"}
            </span>
            {sel?.swatches && sel.swatches.length > 0 && (
              <span style={{ display: "flex", gap: 3, marginTop: 3 }}>
                {sel.swatches.map((c, i) => <span key={i} style={{ width: 12, height: 12, borderRadius: 3, background: c, border: "1px solid var(--border)" }} />)}
              </span>
            )}
          </span>
          <Icon name="chevron-down" size={16} />
        </button>
        <Button size="sm" disabled={disabled || !sel || busy !== null} onClick={run("colorize", () =>
          isSC
            ? sourceCovers.colorize(sourceCover!, sel!.styleId, sel!.variantId)
            : actions.colorize(page.id, page.url, sel!.styleId, sel!.variantId),
        )}>
          <Icon name="palette" size={15} /> {busy === "colorize" ? "Đang tô…" : "Tô màu"}
        </Button>
        {!isSC && actions.canRegen && (
          <>
            <Button variant="outline" size="sm" disabled={disabled || busy !== null || pageIndex < 0} title="Tạo bản vẽ lại (giữ nguyên góc) để xem trước" onClick={doGen(false)}>
              <Icon name="sparkles" size={15} /> {busy === "regen" ? "Đang tạo…" : "Regen"}
            </Button>
            <Button variant="outline" size="sm" disabled={disabled || busy !== null || pageIndex < 0} title="Tạo bản với góc camera mới để xem trước" onClick={doGen(true)}>
              <Icon name="sparkles" size={15} /> {busy === "angle" ? "Đang tạo…" : "Đổi góc"}
            </Button>
          </>
        )}
        {!isSC && (
          <Button variant="outline" size="sm" disabled={disabled || busy !== null}
            title="Sinh thêm trang interior (không ghi đè) — chọn nguồn A/B" onClick={() => setRegenOpen((v) => !v)}>
            <Icon name="sparkles" size={15} /> Regen Thêm
          </Button>
        )}
        {colored && (
          <>
            <span style={{ width: 1, height: 22, background: "var(--border)", margin: "0 2px" }} />
            <Button variant="outline" size="sm" disabled={disabled || busy !== null} title="Đẩy bản màu này thành ứng viên bìa và chọn làm bìa chính (giữ bìa cũ)" onClick={run("cover", () => coverCandidates.push(page.id, colored!))}>
              <Icon name="image" size={15} /> {busy === "cover" ? "Đang đẩy…" : "Push to Cover"}
            </Button>
            <Button variant="outline" size="sm" disabled={disabled || busy !== null} title="Đặt bản màu làm thumbnail 3:4 (thumbnailUrl)" onClick={run("thumb", () => actions.setThumbnail(colored))}>
              <Icon name="image" size={15} /> Set thumbnail
            </Button>
            <Button variant="outline" size="sm" disabled={disabled || busy !== null} title="Đặt bản màu làm ảnh vuông 1:1 (squareThumbnailUrl)" onClick={run("square", () => actions.setSquare(colored))}>
              <Icon name="image" size={15} /> Set vuông
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" disabled={disabled || busy !== null} onClick={run("pub", () => isSC ? sourceCovers.togglePublic(sourceCover!.id) : actions.togglePublic(pages, page.id))}>
          {page.isPublic ? "Ẩn" : "Công khai"}
        </Button>
        <Button variant="danger" size="sm" disabled={disabled || busy !== null} onClick={run("del", () => isSC ? sourceCovers.remove(sourceCover!.id) : actions.removePage(pages, page.id), onRemoved)}>
          <Icon name="x" size={15} /> Xóa
        </Button>
      </div>

      {!isSC && regenOpen && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: 10, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--neutral-100)" }}>
          <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>Nguồn
            <select value={regenOpts.source} onChange={(e) => setRegenOpts((o) => ({ ...o, source: e.target.value as "A" | "B" }))}
              style={{ padding: "4px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--card)" }}>
              <option value="A">A · New Source</option>
              <option value="B">B · + Prompt gốc</option>
            </select>
          </label>
          <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>Số bản
            <input type="number" min={1} max={4} value={regenOpts.count}
              onChange={(e) => setRegenOpts((o) => ({ ...o, count: Math.min(4, Math.max(1, Number(e.target.value) || 1)) }))}
              style={{ width: 56, padding: "4px 8px", fontFamily: "var(--font-mono)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--card)" }} />
          </label>
          <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>% đổi
            <input type="number" min={5} max={95} step={5} value={regenOpts.changePercent}
              onChange={(e) => setRegenOpts((o) => ({ ...o, changePercent: Math.min(95, Math.max(5, Number(e.target.value) || 30)) }))}
              style={{ width: 56, padding: "4px 8px", fontFamily: "var(--font-mono)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--card)" }} />
          </label>
          <Button size="sm" disabled={disabled || busy !== null}
            onClick={run("regenadd", () => additional.regenAddPages(page.id, regenOpts), () => setRegenOpen(false))}>
            {busy === "regenadd" ? "Đang sinh…" : `Sinh ${regenOpts.count} trang`}
          </Button>
        </div>
      )}

      {cand && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 10, border: "1px solid var(--volt-600)", borderRadius: "var(--radius-md)", background: "var(--neutral-100)" }}>
          <div onClick={() => setZoom(true)} title="Bấm để phóng to" style={{ width: 120, height: 120, flexShrink: 0, borderRadius: "var(--radius-sm)", overflow: "hidden", border: "1px solid var(--border)", background: "#fff", cursor: "zoom-in", position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resolveImg(cand.url)} alt="bản mới" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            <span style={{ position: "absolute", right: 4, bottom: 4, background: "rgba(11,13,12,.6)", color: "#fff", borderRadius: 4, padding: 3, display: "flex" }}><Icon name="search" size={12} /></span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {cand.kind === "angle" ? "Bản đổi góc" : "Bản regen"}{cand.cameraView ? ` · góc ${cand.cameraView}` : ""}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Bấm ảnh để phóng to. “Áp dụng” để dùng cho trang này, “Tạo lại” để thử bản khác.</div>
          </div>
          <Button size="sm" disabled={busy !== null} onClick={applyCand}>{busy === "apply" ? "Đang áp dụng…" : "Áp dụng"}</Button>
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={doGen(cand.kind === "angle")}>{busy === "regen" || busy === "angle" ? "Đang tạo…" : "Tạo lại"}</Button>
          <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => setCand(null)}>Bỏ</Button>
        </div>
      )}

      {zoom && cand && (
        <div onClick={() => setZoom(false)} style={{ position: "fixed", inset: 0, background: "rgba(11,13,12,.82)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resolveImg(cand.url)} alt="bản mới (phóng to)" style={{ maxWidth: "92vw", maxHeight: "88vh", objectFit: "contain", borderRadius: "var(--radius-md)", background: "#fff", boxShadow: "var(--shadow-lg)" }} />
          <button type="button" onClick={() => setZoom(false)} aria-label="Đóng" style={{ position: "fixed", top: 16, right: 16, background: "rgba(255,255,255,.15)", border: "none", borderRadius: 99, width: 40, height: 40, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="x" size={20} /></button>
        </div>
      )}

      {err && <div style={{ padding: "8px 10px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12 }}>{err}</div>}

      {disabled && (
        <div style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>
          Các thao tác chỉ chạy khi bật ghi thật (<span style={{ fontFamily: "var(--font-mono)" }}>NEXT_PUBLIC_COLORING_WRITE=1</span> · staging).
        </div>
      )}

      <ColoringStylePickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={setSel} referenceThumb={resolveImg(page.coloredUrl || page.url)} />
    </div>
  );
}
