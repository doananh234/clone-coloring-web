"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { thumbImg } from "../../data/img";
import {
  useClassifyGate,
  countInteriorPages,
  describeGateState,
  type PageType,
  type ClassifyEdit,
} from "../../data/use-classify-gate";
import type { CloneJobDetail } from "../../data/types";

const TYPE_BG: Record<PageType, string> = {
  cover: "color-mix(in srgb, indigo 16%, var(--card))",
  interiorIntro: "color-mix(in srgb, gold 20%, var(--card))",
  interior: "var(--card)",
};
const TYPES: PageType[] = ["cover", "interiorIntro", "interior"];
const TYPE_LABEL: Record<PageType, string> = { cover: "Cover", interiorIntro: "Intro", interior: "Interior" };

type Row = { pageNumber: number; url: string; pageType: PageType; excludedFromClone: boolean };

/**
 * One classify card. Memoized + driven by a STABLE `onPatch` so toggling one
 * page's type/excluded doesn't re-render every other card (these grids can hold
 * 100+ pages). Thumbnails go through the CDN resizer, not full-res originals.
 */
const ClassifyCard = memo(function ClassifyCard({
  row,
  onPatch,
}: {
  row: Row;
  onPatch: (pageNumber: number, patch: Partial<Row>) => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        background: TYPE_BG[row.pageType],
        opacity: row.excludedFromClone ? 0.5 : 1,
      }}
    >
      <div style={{ position: "relative", aspectRatio: "3/4", background: "var(--muted)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbImg(row.url, 360)}
          alt={`p${row.pageNumber}`}
          loading="lazy"
          decoding="async"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: row.excludedFromClone ? "grayscale(1)" : undefined,
          }}
        />
        <span style={{ position: "absolute", top: 6, left: 6 }}>
          <Badge tone="carbon">#{row.pageNumber}</Badge>
        </span>
      </div>
      <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        <select
          value={row.pageType}
          disabled={row.excludedFromClone}
          onChange={(e) => onPatch(row.pageNumber, { pageType: e.target.value as PageType })}
          style={{
            fontSize: 12.5,
            padding: "4px 6px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--card)",
          }}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={row.excludedFromClone}
            onChange={(e) => onPatch(row.pageNumber, { excludedFromClone: e.target.checked })}
          />
          Loại khỏi book
        </label>
      </div>
    </div>
  );
});

export function JobClassifyTab({ job }: { job: CloneJobDetail }) {
  const gate = useClassifyGate(job.id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>(() => {
    // Seed page 1 as the cover, everything else interior — the same fallback
    // classifyPage() applies in @vx/clone-core, inlined because @vx/coloring
    // cannot depend on that package. The operator corrects it from here.
    let coverSeen = false;
    return (job.pages ?? []).map((p) => {
      const seeded: PageType =
        (p.pageType as PageType) ??
        (p.pageNumber === 1 && !coverSeen ? "cover" : "interior");
      if (seeded === "cover") coverSeen = true;
      return {
        pageNumber: p.pageNumber,
        url: p.redesignedUrl || p.imageUrl,
        pageType: seeded,
        excludedFromClone: p.excludedFromClone ?? p.excluded ?? false,
      };
    });
  });

  // Stable identity so memoized ClassifyCards don't all re-render on one edit.
  const setRow = useCallback(
    (pageNumber: number, patch: Partial<Row>) =>
      setRows((rs) => rs.map((r) => (r.pageNumber === pageNumber ? { ...r, ...patch } : r))),
    [],
  );

  const edits: ClassifyEdit[] = useMemo(
    () =>
      rows.map((r) => ({
        pageNumber: r.pageNumber,
        pageType: r.pageType,
        excludedFromClone: r.excludedFromClone,
      })),
    [rows],
  );
  const coverCount = rows.filter((r) => r.pageType === "cover" && !r.excludedFromClone).length;
  const interiorCount = countInteriorPages(edits);
  const keptCount = edits.filter((e) => !e.excludedFromClone).length;
  const view = describeGateState(job.status, interiorCount, keptCount, job.alreadySpent ?? false);

  // `okText` matters: a confirm that succeeds leaves the job in `awaiting-fill`,
  // which keeps THIS tab mounted and re-renders it identically. Without an
  // explicit acknowledgement next to the button the operator — who is at the
  // bottom of a page-long grid — sees no change at all and reads it as frozen.
  const run = async (fn: () => Promise<void>, okText: string) => {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await fn();
      setOk(okText);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Thất bại");
    } finally {
      setBusy(false);
    }
  };

  // Sắp xếp tuần tự theo số trang (đầu → cuối); trang excluded vẫn nằm đúng vị trí.
  const ordered = [...rows].sort((a, b) => a.pageNumber - b.pageNumber);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {err && (
        <div style={{ padding: "10px 12px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>
          {err}
        </div>
      )}
      {coverCount !== 1 && (
        <div style={{ padding: "10px 12px", background: "var(--warning-bg)", color: "var(--warning)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>
          Cảnh báo: đang có {coverCount} trang Cover (nên đúng 1).
        </div>
      )}

      {view.parkedNotice && (
        <div
          style={{
            padding: "0.75rem 1rem",
            borderRadius: 8,
            background: "color-mix(in srgb, var(--success) 14%, var(--card))",
            border: "1px solid color-mix(in srgb, var(--success) 40%, transparent)",
            fontSize: 13,
          }}
        >
          <strong>✓ {view.parkedNotice}</strong>
        </div>
      )}

      <div
        style={{
          padding: "0.75rem 1rem",
          borderRadius: 8,
          background:
            view.tone === "danger"
              ? "color-mix(in srgb, red 16%, var(--card))"
              : view.tone === "warning"
                ? "color-mix(in srgb, orange 18%, var(--card))"
                : "color-mix(in srgb, green 15%, var(--card))",
          border:
            view.tone === "danger"
              ? "1px solid color-mix(in srgb, red 45%, transparent)"
              : undefined,
        }}
      >
        {view.banner}
      </div>

      <Card title={`Phân loại ${rows.length} trang trước khi tạo book`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 12 }}>
          {ordered.map((r) => (
            <ClassifyCard key={r.pageNumber} row={r} onPatch={setRow} />
          ))}
        </div>
      </Card>

      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
        {/* Feedback lives HERE, beside the buttons — the top-of-page status pill
            and tab label are off-screen for anyone who just scrolled a grid. */}
        {err && (
          <span style={{ fontSize: 12.5, color: "var(--danger)", fontWeight: 600 }}>
            ✗ Thất bại — chi tiết ở đầu trang
          </span>
        )}
        {!err && ok && (
          <span style={{ fontSize: 12.5, color: "var(--success)", fontWeight: 600 }}>✓ {ok}</span>
        )}
        {!err && !ok && view.parkedNotice && (
          <span style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>
            Đã xác nhận · đang chờ bổ sung trang ruột
          </span>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => run(() => gate.save(edits), "Đã lưu phân loại")}
          >
            {busy ? "Đang lưu…" : "Lưu nháp"}
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              run(
                () => gate.confirm(edits),
                view.willPark
                  ? "Đã xác nhận — job vào hàng chờ bổ sung trang, không phát sinh chi phí"
                  : "Đã xác nhận — job đã vào hàng đợi xử lý",
              )
            }
          >
            {busy ? "Đang xử lý…" : view.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
