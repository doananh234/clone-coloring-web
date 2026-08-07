"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { LoadingRows } from "../../components/ui/states";
import { PreviewModal } from "../../components/ui/preview-modal";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { useCloneJob } from "../../data/use-clone-job";
import { resolveImg } from "../../data/img";

const mono = { fontFamily: "var(--font-mono)" as const };

function Thumb({ src, caption, onClick }: { src?: string; caption: string; onClick?: () => void }) {
  return (
    <div style={{ cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
      <div
        className="mo-bookthumb"
        style={{ aspectRatio: "1 / 1", borderRadius: "var(--radius-sm)", background: "var(--neutral-100)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)", overflow: "hidden" }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={caption} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Icon name="image" size={18} />
        )}
      </div>
      <div style={{ fontSize: 11.5, marginTop: 5, textAlign: "center", color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{caption}</div>
    </div>
  );
}

/**
 * "Sách gốc (nguồn clone)" — surfaces the ORIGINAL book this record was cloned
 * from: the source clone job, its original cover (first source page) and the
 * original interior pages. Mirrors the "Main book" folder in the export ZIP.
 * Each thumbnail opens a lightbox preview (←/→ to page through).
 */
export function BookOriginalSection({ jobId, sourceCoverFallback }: { jobId: string | null; sourceCoverFallback?: string }) {
  const router = useRouter();
  const { job, isLoading } = useCloneJob(jobId ?? "");
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  if (!jobId) {
    return (
      <Card title="Sách gốc (nguồn clone)">
        <div style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>Sách này không gắn với clone job nguồn nào.</div>
      </Card>
    );
  }

  const openJob = () => router.push(`${B}/jobs/${jobId}`);
  const pages = job?.pages ?? [];
  const originalCover = resolveImg(pages[0]?.imageUrl || sourceCoverFallback);

  // Previewable items in display order: original cover (if any) then each page.
  const items: { src?: string; caption: string }[] = [
    ...(originalCover ? [{ src: originalCover, caption: "Bìa gốc" }] : []),
    ...pages.map((p, i) => ({ src: resolveImg(p.imageUrl), caption: `Trang gốc ${String(i + 1).padStart(2, "0")}` })),
  ];
  const openAt = (i: number) => { if (i >= 0 && i < items.length) setPreviewIdx(i); };
  const active = previewIdx != null ? items[previewIdx] : null;

  return (
    <Card title="Sách gốc (nguồn clone)">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--muted-foreground)" }}>
            Bản gốc mà sách này được clone từ đó.
            {job?.sourceFileName && <> Nguồn: <span style={{ ...mono, color: "var(--foreground)" }}>{job.sourceFileName}</span>.</>}
          </div>
          <Button variant="outline" size="sm" onClick={openJob} title="Mở clone job gốc đã tạo ra sách này">
            <Icon name="copy" size={15} /> Mở book gốc
          </Button>
        </div>

        {isLoading ? (
          <LoadingRows rows={2} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 10 }}>
            {items.map((it, i) => (
              <Thumb key={it.caption} src={it.src} caption={it.caption} onClick={it.src ? () => openAt(i) : undefined} />
            ))}
            {items.length === 0 && (
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--muted-foreground)" }}>
                <Badge tone="neutral">{job?.status ?? "—"}</Badge>
                Chưa có trang gốc để hiển thị — mở job để xem chi tiết.
              </div>
            )}
          </div>
        )}
      </div>

      <PreviewModal
        open={active != null}
        onClose={() => setPreviewIdx(null)}
        title={active?.caption}
        imageSrc={active?.src}
        badges={<Badge tone="carbon">GỐC</Badge>}
        counter={previewIdx != null ? `${previewIdx + 1} / ${items.length}` : undefined}
        onPrev={previewIdx != null && previewIdx > 0 ? () => openAt(previewIdx - 1) : undefined}
        onNext={previewIdx != null && previewIdx < items.length - 1 ? () => openAt(previewIdx + 1) : undefined}
      />
    </Card>
  );
}
