"use client";

import { useState } from "react";
import { httpPost } from "@vx/core-uikit/api";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { resolveImg } from "../../data/img";
import { COLORING_API_BASE } from "../../data/config";
import { useGenerationJobs } from "../../data/use-generation-jobs";
import { isActiveGenerationJob } from "../../data/generation-jobs";

type ExportInfo = { url?: string; hash?: string; builtAt?: string; filename?: string };

/**
 * Toolbar control that turns a book's export into a copyable download LINK.
 * - No cached link yet → "Tạo link export" button (POST enqueues a book-export job).
 * - A book-export job is active → "Đang tạo…" (progress lives in the queue drawer).
 * - Cached link present → show the link + Copy, plus a "Cập nhật" rebuild.
 * The cached link comes from `book.data.export`; when the worker finishes, the
 * global queue poll invalidates the book query and this re-renders with the url.
 */
export function ExportLinkButton({ bookId, exportInfo }: { bookId: string; exportInfo?: ExportInfo }) {
  const { jobs, refetch } = useGenerationJobs();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const active = jobs.some((j) => j.bookId === bookId && j.type === "book-export" && isActiveGenerationJob(j));
  const fullUrl = exportInfo?.url ? resolveImg(exportInfo.url) : undefined;

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      await httpPost(`${COLORING_API_BASE}/books/${bookId}/export-zip`, {});
      // Reflect the newly-created pending job immediately (idle poll is 30s).
      await refetch();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Tạo link thất bại");
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (!fullUrl) return;
    navigator.clipboard?.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (active) {
    return (
      <Button variant="outline" size="sm" disabled title="Đang build ZIP ở nền — theo dõi ở hàng đợi tạo ảnh">
        <Icon name="loader" size={16} /> Đang tạo link…
      </Button>
    );
  }

  if (fullUrl) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Button variant="outline" size="sm" onClick={copy} title={fullUrl}>
          <Icon name={copied ? "check" : "copy"} size={16} /> {copied ? "Đã copy" : "Copy link ZIP"}
        </Button>
        <Button variant="ghost" size="sm" onClick={create} disabled={busy} title="Build lại ZIP (khi sách đã đổi)">
          <Icon name="sparkles" size={15} /> {busy ? "…" : "Cập nhật"}
        </Button>
        {err && <span style={{ fontSize: 11.5, color: "var(--danger)" }}>{err}</span>}
      </span>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={create}
      disabled={busy}
      title="Tạo link tải ZIP (Main + Clone, cover + interior) — build ở nền rồi copy link"
    >
      <Icon name="download" size={16} /> {busy ? "Đang tạo…" : "Tạo link export"}
      {err && <span style={{ fontSize: 11.5, color: "var(--danger)", marginLeft: 6 }}>{err}</span>}
    </Button>
  );
}
