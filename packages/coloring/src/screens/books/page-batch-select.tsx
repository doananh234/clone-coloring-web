"use client";

import { memo, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Progress } from "../../components/ui/progress";
import { EmptyState } from "../../components/ui/states";
import { usePageActions } from "../../data/use-page-actions";
import { usePageAdditional, type RegenAddOpts } from "../../data/use-page-additional";
import { runBatchRegen } from "../../data/run-batch-regen";
import { thumbImg } from "../../data/img";
import type { BookColoringPage } from "../../data/types";

const mono = { fontFamily: "var(--font-mono)" as const };

/** One selectable page tile: click toggles selection; shows spinner / result state. */
// Memoized + driven by a stable `onToggle(index)` so selecting one page doesn't
// re-render every other thumb (a book can have 100+ pages).
const SelectableThumb = memo(function SelectableThumb({
  page,
  index,
  selected,
  state,
  disabled,
  onToggle,
}: {
  page: BookColoringPage;
  index: number;
  selected: boolean;
  state?: "running" | "ok" | "err";
  disabled: boolean;
  onToggle: (index: number) => void;
}) {
  // Batch-select shows the B&W line-art (never the colored result) — you pick
  // pages to regen the line-art, so a colorized page must not appear coloured here.
  const src = thumbImg(page.url, 400);
  const border =
    state === "err"
      ? "2px solid var(--danger)"
      : selected
        ? "2px solid var(--volt-500)"
        : "1px solid var(--border)";
  return (
    <div
      onClick={disabled ? undefined : () => onToggle(index)}
      className="mo-bookthumb"
      style={{
        cursor: disabled ? "default" : "pointer",
        aspectRatio: "1 / 1",
        borderRadius: "var(--radius-sm)",
        background: "var(--neutral-100)",
        border,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--neutral-400)",
        overflow: "hidden",
        opacity: disabled && !selected ? 0.6 : 1,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`Trang ${index + 1}`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <Icon name="image" size={18} />
      )}
      {/* checkbox */}
      <span
        style={{
          position: "absolute",
          left: 6,
          top: 6,
          width: 18,
          height: 18,
          borderRadius: 4,
          border: selected ? "none" : "1px solid var(--border)",
          background: selected ? "var(--volt-500)" : "rgba(255,255,255,.85)",
          color: "var(--carbon-950)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected && <Icon name="check" size={13} />}
      </span>
      {/* page number */}
      <span style={{ position: "absolute", left: 6, bottom: 4, ...mono, fontSize: 10, color: "#fff", background: "rgba(11,13,12,.6)", padding: "0 4px", borderRadius: 4 }}>
        {String(index + 1).padStart(2, "0")}
      </span>
      {/* running / result badge */}
      {state === "running" && (
        <span style={{ position: "absolute", inset: 0, background: "rgba(11,13,12,.45)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
          <Icon name="loader" size={20} />
        </span>
      )}
      {state === "ok" && (
        <span style={{ position: "absolute", right: 5, top: 5, background: "var(--success)", color: "#fff", borderRadius: 99, width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="check" size={12} />
        </span>
      )}
      {state === "err" && (
        <span style={{ position: "absolute", right: 5, top: 5, background: "var(--danger)", color: "#fff", borderRadius: 99, width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="x" size={12} />
        </span>
      )}
    </div>
  );
});

/**
 * Batch-select surface for a book's pages: multi-select pages and regen them all
 * sequentially, writing straight onto each page (no per-image preview/confirm).
 * Each page uses the SAME regen as the single-page button (same camera, from the
 * original source) via usePageActions.regenApply.
 */
export function PageBatchSelect({
  bookId,
  pages,
  cloneJobId,
}: {
  bookId: string;
  pages: BookColoringPage[];
  cloneJobId?: string;
}) {
  const qc = useQueryClient();
  const actions = usePageActions(bookId, cloneJobId);
  const additional = usePageAdditional(bookId);
  const [addOpts, setAddOpts] = useState<RegenAddOpts>({ count: 1, source: "A", changePercent: 30 });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<Map<number, "ok" | "err">>(new Map());
  const [summary, setSummary] = useState<{ ok: number; err: number } | null>(null);

  if (pages.length === 0) {
    return <EmptyState icon="image" title="Chưa có trang" sub="Sách này chưa có trang tô màu." />;
  }

  // Stable identity so memoized SelectableThumbs don't all re-render on one toggle.
  const toggle = useCallback(
    (i: number) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i);
        else next.add(i);
        return next;
      }),
    [],
  );
  const selectAll = () => setSelected(new Set(pages.map((_, i) => i)));
  const clear = () => setSelected(new Set());

  const run = async () => {
    const indices = [...selected].sort((a, b) => a - b);
    if (indices.length === 0) return;
    if (!window.confirm(`Regen ${indices.length} trang đã chọn? Ảnh mới sẽ GHI ĐÈ ảnh hiện tại và tốn phí AI. Không thể hoàn tác.`)) return;

    setRunning(true);
    setSummary(null);
    setResults(new Map());
    setProgress({ done: 0, total: indices.length });

    const res = await runBatchRegen(
      indices,
      async (i) => {
        setCurrent(i);
        await actions.regenApply(i);
      },
      (done, index, ok) => {
        setProgress({ done, total: indices.length });
        setResults((prev) => new Map(prev).set(index, ok ? "ok" : "err"));
      },
    );

    setCurrent(null);
    setRunning(false);
    setSummary({ ok: res.ok.length, err: res.err.length });
    // Keep failed pages selected so the user can retry just those; clear the rest.
    setSelected(new Set(res.err));
    qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
  };

  const runAdd = async () => {
    const indices = [...selected].sort((a, b) => a - b);
    if (indices.length === 0) return;
    if (!window.confirm(`Sinh thêm ${addOpts.count} trang interior mới từ ${indices.length} trang đã chọn? Các trang mới sẽ nằm ở cuối, KHÔNG ghi đè. Tốn phí AI.`)) return;

    setRunning(true);
    setSummary(null);
    setResults(new Map());
    setProgress({ done: 0, total: indices.length });

    const res = await runBatchRegen(
      indices,
      async (i) => { setCurrent(i); await additional.regenAddPages(pages[i].id, addOpts); },
      (done, index, ok) => {
        setProgress({ done, total: indices.length });
        setResults((prev) => new Map(prev).set(index, ok ? "ok" : "err"));
      },
    );

    setCurrent(null);
    setRunning(false);
    setSummary({ ok: res.ok.length, err: res.err.length });
    setSelected(new Set(res.err));
    qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
  };

  const disabled = !actions.enabled;
  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  const stateOf = (i: number): "running" | "ok" | "err" | undefined => {
    if (running && current === i) return "running";
    return results.get(i);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* toolbar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Button variant="outline" size="sm" disabled={running} onClick={selectAll}>Chọn tất cả</Button>
        <Button variant="outline" size="sm" disabled={running || selected.size === 0} onClick={clear}>Bỏ chọn</Button>
        <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>Đã chọn <span style={{ ...mono, fontWeight: 600, color: "var(--foreground)" }}>{selected.size}</span>/{pages.length}</span>
        <div style={{ flex: 1 }} />
        {cloneJobId && (
          <Button size="sm" variant="outline"
            disabled={disabled || running || selected.size === 0}
            title={disabled ? "Cần bật ghi thật (staging)" : "Ghi đè ảnh hiện tại (bản cũ)"}
            onClick={run}>
            <Icon name="sparkles" size={15} /> {running ? `Đang regen ${progress?.done ?? 0}/${progress?.total ?? 0}…` : "Regen hàng loạt (ghi đè)"}
          </Button>
        )}
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <select value={addOpts.source} onChange={(e) => setAddOpts((o) => ({ ...o, source: e.target.value as "A" | "B" }))} disabled={running}
            style={{ padding: "3px 6px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--card)" }}>
            <option value="A">A</option><option value="B">B</option>
          </select>
          <input type="number" min={1} max={4} value={addOpts.count} disabled={running}
            onChange={(e) => setAddOpts((o) => ({ ...o, count: Math.min(4, Math.max(1, Number(e.target.value) || 1)) }))}
            style={{ width: 46, padding: "3px 6px", fontFamily: "var(--font-mono)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--card)" }} />
        </label>
        <Button size="sm"
          disabled={disabled || running || selected.size === 0}
          title={disabled ? "Cần bật ghi thật (staging)" : "Sinh thêm biến thể (không ghi đè)"}
          onClick={runAdd}>
          <Icon name="sparkles" size={15} /> {running ? `Đang sinh ${progress?.done ?? 0}/${progress?.total ?? 0}…` : "Regen Thêm (Add)"}
        </Button>
      </div>

      {/* progress */}
      {running && progress && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Progress value={pct} />
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            Đang xử lý {Math.min(progress.done + 1, progress.total)}/{progress.total}
            {current != null ? ` · Trang ${String(current + 1).padStart(2, "0")}` : ""} — chạy tuần tự, vui lòng không đóng trang.
          </div>
        </div>
      )}

      {/* summary */}
      {!running && summary && (
        <div
          style={{
            fontSize: 12.5,
            padding: "8px 12px",
            borderRadius: "var(--radius-sm)",
            background: summary.err ? "var(--danger-bg)" : "var(--success-bg)",
            color: summary.err ? "var(--danger)" : "var(--success)",
          }}
        >
          Xong: {summary.ok} thành công{summary.err ? `, ${summary.err} lỗi (đã giữ chọn các trang lỗi để thử lại)` : ""}.
        </div>
      )}

      {disabled && (
        <div style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>
          Regen chỉ chạy khi bật ghi thật (<span style={mono}>NEXT_PUBLIC_COLORING_WRITE=1</span> · staging).
        </div>
      )}

      {/* grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 10 }}>
        {pages.map((p, i) => (
          <SelectableThumb
            key={p.id || i}
            page={p}
            index={i}
            selected={selected.has(i)}
            state={stateOf(i)}
            disabled={running}
            onToggle={toggle}
          />
        ))}
      </div>
    </div>
  );
}
