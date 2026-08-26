"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";
import { Tabs } from "../../components/ui/tabs";
import { LoadingRows, ErrorState, EmptyState } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { useCloneJob } from "../../data/use-clone-job";
import { getLocalJob } from "../../data/local-store";
import { JobPipelineTab } from "./job-pipeline-tab";
import { JobCompareTab } from "./job-compare-tab";
import { JobClassifyTab } from "./job-classify-tab";
import { metaFor } from "../../data/status";
import { useQueueActions, rowActionFor } from "../../data/use-queue-actions";
import { resolveImg } from "../../data/img";
import type { CloneJobDetail, CloneJobPage, CloneRetryRecord } from "../../data/types";

const capLabel = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--muted-foreground)",
  textTransform: "uppercase" as const,
  letterSpacing: "var(--tracking-caps)",
};
const mono = { fontFamily: "var(--font-mono)" };

function fmtDate(s?: string): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString("vi-VN");
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={capLabel}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, letterSpacing: "-0.02em", marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function InfoTab({ job }: { job: CloneJobDetail }) {
  const meta = metaFor(job.status);
  const chars = job.entityMap?.characters ?? [];
  const locs = job.entityMap?.locations ?? [];
  const rows: [string, React.ReactNode][] = [
    ["Nguồn", <span style={mono} key="s">{job.sourceFileName || "—"}</span>],
    ["Brand đích", job.brand || "—"],
    ["Số trang", <span style={mono} key="p">{job.totalPages}</span>],
    ["Đã xử lý", <span style={mono} key="a">{`${job.analyzedPages}/${job.totalPages}`}</span>],
    ["Trạng thái", <Badge tone={meta.tone} dot={meta.dot} key="st">{meta.label}</Badge>],
  ];
  if (job.status === "error" && job.failedStep) {
    rows.push(["Bước lỗi", <span style={{ ...mono, color: "var(--danger)" }} key="fs">{job.failedStep}</span>]);
  }
  rows.push(
    ["Tạo", <span style={mono} key="c">{fmtDate(job.createdAt)}</span>],
    ["Cập nhật", <span style={mono} key="u">{fmtDate(job.updatedAt)}</span>],
  );
  const retries: CloneRetryRecord[] = Array.isArray(job.retryHistory) ? job.retryHistory : [];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16, alignItems: "start" }}>
      <Card title="Thông tin job">
        <div style={{ display: "flex", flexDirection: "column", fontSize: 13.5 }}>
          {rows.map(([l, v], i) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : undefined }}>
              <span style={{ color: "var(--muted-foreground)" }}>{l}</span>
              <span style={{ textAlign: "right" }}>{v}</span>
            </div>
          ))}
        </div>
        {job.error && (
          <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {job.error}
          </div>
        )}
        {retries.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 6 }}>
              Lịch sử retry ({retries.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {retries.map((r, i) => (
                <div key={i} style={{ borderLeft: "2px solid var(--danger)", paddingLeft: 8, fontSize: 11.5 }}>
                  <div style={{ ...mono, color: "var(--muted-foreground)" }}>
                    <span style={{ color: "var(--foreground)", fontWeight: 600 }}>{r.step} · lần {r.attempt}</span>
                    {" · "}{fmtDate(r.at)}
                  </div>
                  <div style={{ color: "var(--danger)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.error}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card title="Kết quả analyze">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13.5 }}>
          <div>
            <div style={{ color: "var(--muted-foreground)", fontSize: 12, marginBottom: 6 }}>Nhân vật phát hiện</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {chars.length ? chars.map((c, i) => <Badge tone="carbon" key={i}>{c.name}</Badge>) : <span style={{ color: "var(--muted-foreground)" }}>—</span>}
            </div>
          </div>
          <div>
            <div style={{ color: "var(--muted-foreground)", fontSize: 12, marginBottom: 6 }}>Bối cảnh phát hiện</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {locs.length ? locs.map((l, i) => <Badge tone="neutral" key={i}>{l.name}</Badge>) : <span style={{ color: "var(--muted-foreground)" }}>—</span>}
            </div>
          </div>
          {job.sourcePdfUrl && (
            <a href={resolveImg(job.sourcePdfUrl)} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 12, textDecoration: "none", color: "var(--foreground)" }}>
              <Icon name="file-text" size={18} />
              <span style={{ flex: 1, ...mono, fontSize: 13 }}>{job.sourceFileName || "PDF nguồn"}</span>
              <Icon name="download" size={16} />
            </a>
          )}
        </div>
      </Card>
    </div>
  );
}

export function JobDetailScreen({ jobId }: { jobId: string }) {
  const router = useRouter();
  const localJob = getLocalJob(jobId);
  const { job: fetched, isLoading, isError } = useCloneJob(localJob ? "" : jobId);
  const [tab, setTab] = useState<"classify" | "pipeline" | "pages" | "info">("pages");
  const qa = useQueueActions();
  const [pending, setPending] = useState(false);
  const [actErr, setActErr] = useState<string | null>(null);

  // Local drafts render straight from the store (never fetched).
  const job: CloneJobDetail | undefined = localJob
    ? {
        id: localJob.id,
        name: localJob.name,
        status: localJob.status,
        totalPages: localJob.totalPages,
        analyzedPages: localJob.analyzedPages,
        brand: localJob.brand,
        currentStep: localJob.currentStep,
        sourceFileName: localJob.sourceBookId ?? undefined,
        createdAt: localJob.createdAt,
        updatedAt: localJob.updatedAt,
        pages: [],
      }
    : fetched;

  // When a job is in error, default to the info tab so the failure reason is
  // visible immediately. Only auto-switch once, so the user can still browse
  // other tabs afterwards.
  const autoSwitchedToError = useRef(false);
  useEffect(() => {
    if (!autoSwitchedToError.current && job?.status === "error") {
      setTab("info");
      autoSwitchedToError.current = true;
    }
  }, [job?.status]);

  if (!localJob && isLoading) {
    return (
      <Card>
        <LoadingRows rows={6} />
      </Card>
    );
  }
  if (!localJob && (isError || !job)) {
    return (
      <Card>
        <ErrorState sub={`Không tải được job ${jobId}. Job có thể không tồn tại hoặc API chưa sẵn sàng.`} />
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button variant="outline" size="sm" onClick={() => router.push(`${B}/jobs`)}>Về danh sách job</Button>
        </div>
      </Card>
    );
  }

  if (!job) return null;

  const meta = metaFor(job.status);
  const isLocal = Boolean(localJob);
  const pct = job.totalPages > 0 ? Math.round((job.analyzedPages / job.totalPages) * 100) : meta.bucket === "done" ? 100 : 0;
  // Same status-driven action as the list row (e.g. a completed/"reproduced" job → "Chạy lại" regen).
  const rowAction = isLocal ? null : rowActionFor(job.status);

  const runRowAction = async () => {
    if (!rowAction) return;
    if (rowAction.confirm && !window.confirm(rowAction.confirm)) return;
    setPending(true);
    setActErr(null);
    try {
      await qa[rowAction.key](job.id);
    } catch (e) {
      setActErr(e instanceof Error ? e.message : "Thao tác thất bại");
    } finally {
      setPending(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <div>
            <Button variant="ghost" size="sm" onClick={() => router.push(`${B}/jobs`)}>
              <Icon name="arrow-left" size={16} /> Clone jobs
            </Button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>{job.name || job.id.slice(0, 8)}</h1>
            <Badge tone={meta.tone} dot={meta.dot}>{meta.label}</Badge>
            {isLocal && <Badge tone="warning">Nháp · local</Badge>}
            {job.brand && <Badge tone="carbon">{job.brand}</Badge>}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)" }}>
            <span style={mono}>{job.id}</span> · tạo {fmtDate(job.createdAt)}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {rowAction && (
              <Button
                variant={rowAction.variant}
                size="sm"
                disabled={!qa.enabled || pending}
                title={qa.enabled ? undefined : "Bật ghi thật (staging) để dùng"}
                onClick={runRowAction}
              >
                {pending ? "…" : rowAction.label}
              </Button>
            )}
          </div>
          {actErr && (
            <div style={{ padding: "6px 10px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12 }}>{actErr}</div>
          )}
        </div>
      </div>

      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 16, alignItems: "center" }}>
          <Stat label="Bước hiện tại" value={job.currentStep || meta.label} />
          <Stat label="Trang đã xử lý" value={`${job.analyzedPages}/${job.totalPages}`} />
          <Stat label="ETA" value="—" />
          <div style={{ minWidth: 160 }}>
            <div style={{ ...capLabel, marginBottom: 8 }}>Tiến độ tổng</div>
            <Progress value={pct} tone={meta.bucket === "error" ? "danger" : "volt"} />
          </div>
        </div>
      </Card>

      <Tabs<"classify" | "pipeline" | "pages" | "info">
        items={[
          ...(job.status === "awaiting-classify" || job.status === "awaiting-fill"
            ? [{
                key: "classify" as const,
                label:
                  job.status === "awaiting-fill"
                    ? "Phân loại trang · thiếu trang ruột"
                    : "Phân loại trang · chờ duyệt",
              }]
            : []),
          { key: "pages", label: `So sánh & chọn trang · ${job.pages.length}` },
          { key: "pipeline", label: "Pipeline & xác nhận" },
          { key: "info", label: "Thông tin & logs" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "classify" ? (
        <JobClassifyTab job={job} />
      ) : tab === "pipeline" ? (
        <JobPipelineTab job={job} isLocal={isLocal} onViewPages={() => setTab("pages")} />
      ) : tab === "pages" ? (
        <JobCompareTab jobId={job.id} pages={job.pages} bookId={job.resultBookId ?? job.bookId ?? undefined} />
      ) : (
        <InfoTab job={job} />
      )}
    </div>
  );
}
