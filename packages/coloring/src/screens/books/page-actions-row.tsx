"use client";

import { useState } from "react";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/form-controls";
import { useEntityList } from "../../data/use-entity-list";
import { usePageActions } from "../../data/use-page-actions";
import type { BookColoringPage } from "../../data/types";

export function PageActionsRow({
  bookId,
  pages,
  page,
  bookData,
  onRemoved,
}: {
  bookId: string;
  pages: BookColoringPage[];
  page: BookColoringPage;
  /** Full book.data JSON blob — merged (with coverMeta) when setting this page as cover source. */
  bookData?: Record<string, unknown>;
  onRemoved: () => void;
}) {
  const cloneJobId = typeof bookData?.cloneJobId === "string" ? bookData.cloneJobId : undefined;
  const actions = usePageActions(bookId, cloneJobId);
  // Book page maps 1:1 by array index to its source clone job page.
  const pageIndex = pages.findIndex((p) => p.id === page.id);
  // Cover / thumbnail / square are set from the COLORED version (like the old
  // "Set Colored as …" lightbox actions) → only offered once the page is colorized.
  const colored = page.coloredUrl;
  const { items: styles } = useEntityList("coloring-styles");
  const [styleId, setStyleId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const styleOptions = styles.map((s) => ({ label: s.name, value: s.id }));
  const chosen = styleId || styleOptions[0]?.value || "";
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      {/* single horizontal action bar: colorize + manage buttons */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px", minWidth: 160 }}>
          <Select value={chosen} onChange={setStyleId} options={styleOptions} placeholder="Tô màu với coloring style…" />
        </div>
        <Button size="sm" disabled={disabled || !chosen || busy !== null} onClick={run("colorize", () => actions.colorize(page.id, page.url, chosen))}>
          <Icon name="palette" size={15} /> {busy === "colorize" ? "Đang tô…" : "Tô màu"}
        </Button>
        {actions.canRegen && (
          <>
            <Button variant="outline" size="sm" disabled={disabled || busy !== null || pageIndex < 0} title="Vẽ lại trang (giữ nguyên góc)" onClick={run("regen", () => actions.regenPage(pageIndex, false))}>
              <Icon name="sparkles" size={15} /> {busy === "regen" ? "Đang regen…" : "Regen"}
            </Button>
            <Button variant="outline" size="sm" disabled={disabled || busy !== null || pageIndex < 0} title="Vẽ lại trang với góc camera mới" onClick={run("angle", () => actions.regenPage(pageIndex, true))}>
              <Icon name="sparkles" size={15} /> {busy === "angle" ? "Đang đổi góc…" : "Đổi góc"}
            </Button>
          </>
        )}
        {colored && (
          <>
            <span style={{ width: 1, height: 22, background: "var(--border)", margin: "0 2px" }} />
            <Button variant="outline" size="sm" disabled={disabled || busy !== null} title="Đặt bản màu làm ảnh bìa (coverUrl)" onClick={run("cover", () => actions.setCover(colored))}>
              <Icon name="image" size={15} /> {busy === "cover" ? "Đang đặt…" : "Làm bìa"}
            </Button>
            <Button variant="outline" size="sm" disabled={disabled || busy !== null} title="Đặt bản màu làm thumbnail 3:4 (thumbnailUrl)" onClick={run("thumb", () => actions.setThumbnail(colored))}>
              <Icon name="image" size={15} /> Set thumbnail
            </Button>
            <Button variant="outline" size="sm" disabled={disabled || busy !== null} title="Đặt bản màu làm ảnh vuông 1:1 (squareThumbnailUrl)" onClick={run("square", () => actions.setSquare(colored))}>
              <Icon name="image" size={15} /> Set vuông
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" disabled={disabled || busy !== null} onClick={run("pub", () => actions.togglePublic(pages, page.id))}>
          {page.isPublic ? "Ẩn" : "Công khai"}
        </Button>
        <Button variant="danger" size="sm" disabled={disabled || busy !== null} onClick={run("del", () => actions.removePage(pages, page.id), onRemoved)}>
          <Icon name="x" size={15} /> Xóa
        </Button>
      </div>

      {err && <div style={{ padding: "8px 10px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12 }}>{err}</div>}

      {disabled && (
        <div style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>
          Các thao tác chỉ chạy khi bật ghi thật (<span style={{ fontFamily: "var(--font-mono)" }}>NEXT_PUBLIC_COLORING_WRITE=1</span> · staging).
        </div>
      )}
    </div>
  );
}
