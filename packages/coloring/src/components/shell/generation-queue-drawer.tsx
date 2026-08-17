"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Badge } from "../ui/badge";
import { COLORING_BASE } from "./nav-config";
import { resolveImg } from "../../data/img";
import { useGenerationJobs } from "../../data/use-generation-jobs";
import type { GenerationJob } from "../../data/generation-jobs";

const TITLE_SAFE_LABEL: Record<string, string> = { top: "Top", middle: "Middle", bottom: "Bottom" };

function typeLabel(j: GenerationJob): string {
  if (j.type === "source-cover") {
    const pos = j.payload?.titleSafe ? ` (${TITLE_SAFE_LABEL[j.payload.titleSafe] ?? j.payload.titleSafe})` : "";
    return `Source Cover${pos}`;
  }
  return j.type;
}

function statusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge tone="neutral"><Icon name="clock" size={11} /> Chờ</Badge>;
    case "running":
      return <Badge tone="carbon"><Icon name="loader" size={11} /> Đang chạy</Badge>;
    case "done":
      return <Badge tone="success" dot>Xong</Badge>;
    case "error":
      return <Badge tone="danger"><Icon name="alert-triangle" size={11} /> Lỗi</Badge>;
    default:
      return <Badge tone="neutral">{status}</Badge>;
  }
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s trước`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.round(h / 24)} ngày trước`;
}

/** Global header widget: a queue icon with an active-count badge that opens a
 *  right-hand drawer listing background generation jobs (source cover now). */
export function GenerationQueueDrawer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { jobs, activeCount, isLoading } = useGenerationJobs();

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const goToBook = (j: GenerationJob) => {
    setOpen(false);
    router.push(`${COLORING_BASE}/books/${j.bookId}`);
  };

  return (
    <>
      <button type="button" className="mo-hbtn" onClick={() => setOpen(true)} aria-label="Hàng đợi tạo ảnh" title="Hàng đợi tạo ảnh">
        <Icon name="layers" size={18} />
        {activeCount > 0 && <span className="mo-hbtn__count">{activeCount}</span>}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(11,13,12,.4)", zIndex: 200, display: "flex", justifyContent: "flex-end" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(420px, 100%)", height: "100%", background: "var(--card)", borderLeft: "1px solid var(--border)", boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", animation: "mo-dd-in var(--dur-med) var(--ease-out)" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="layers" size={18} />
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15 }}>Hàng đợi tạo ảnh</span>
                {activeCount > 0 && <Badge tone="success" dot>{activeCount} đang chạy</Badge>}
              </div>
              <button type="button" className="mo-hbtn" onClick={() => setOpen(false)} aria-label="Đóng"><Icon name="x" size={18} /></button>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {isLoading && jobs.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--muted-foreground)", padding: 8 }}>Đang tải…</div>
              ) : jobs.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--muted-foreground)", padding: 8 }}>
                  Chưa có tác vụ nào. Bấm “Gen Cover” ở màn chi tiết sách để tạo — tiến độ sẽ hiện ở đây.
                </div>
              ) : (
                jobs.map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => goToBook(j)}
                    title="Mở sách"
                    style={{ display: "flex", gap: 10, alignItems: "center", textAlign: "left", padding: 8, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--background)", cursor: "pointer" }}
                  >
                    <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: "var(--radius-sm)", overflow: "hidden", border: "1px solid var(--border)", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)" }}>
                      {j.resultUrl || j.payload?.sourceImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={resolveImg(j.resultUrl || j.payload?.sourceImageUrl)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <Icon name="image" size={16} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{typeLabel(j)}</div>
                      <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {j.bookTitle || j.bookId} · {relTime(j.createdAt)}
                      </div>
                      {j.status === "error" && j.error && (
                        <div style={{ fontSize: 11, color: "var(--danger)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.error}</div>
                      )}
                    </div>
                    <div style={{ flexShrink: 0 }}>{statusBadge(j.status)}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
