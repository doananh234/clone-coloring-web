"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";
import { Input } from "../../components/ui/input";
import { Tabs } from "../../components/ui/tabs";
import { Pagination } from "../../components/ui/pagination";
import { LoadingRows, EmptyState, ErrorState } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { useCloneJobs } from "../../data/use-clone-jobs";
import { useQueryParam, useQueryNumber, useSetQueryParams } from "../../hooks/use-query-param";
import { useJobCounts } from "../../data/use-job-counts";
import { useLocalJobs } from "../../data/local-store";
import { useQueueActions, rowActionFor } from "../../data/use-queue-actions";
import { COLORING_WRITE_ENABLED } from "../../data/config";
import { metaFor, STATUS_TABS, countFor } from "../../data/status";
import { resolveImg } from "../../data/img";
import type { CloneJobRow } from "../../data/types";

const th = {
  textAlign: "left" as const,
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "var(--tracking-caps)",
  color: "var(--muted-foreground)",
  borderBottom: "1px solid var(--border)",
};
const td = { padding: 12, borderBottom: "1px solid var(--border)" };
const mono = { fontFamily: "var(--font-mono)" };

function progressOf(j: CloneJobRow): number {
  if (j.totalPages > 0) return Math.round((j.analyzedPages / j.totalPages) * 100);
  return metaFor(j.status).bucket === "done" ? 100 : 0;
}

/** DD/MM/YYYY HH:MM — for the Created/Updated columns. */
function fmtDateTime(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function JobsScreen() {
  const router = useRouter();
  // URL-backed so tab/page/search survive reload + are shareable.
  const [tab] = useQueryParam("tab", "all");
  const [q] = useQueryParam("q", "");
  const [page, setPage] = useQueryNumber("page", 1);
  const setParams = useSetQueryParams();
  const LIMIT = 50;

  const activeTab = STATUS_TABS.find((t) => t.key === tab) ?? STATUS_TABS[0];
  // List (rows) and summary (counts) are separate requests: switching tabs
  // refetches only the rows, so the tab badges (from cached counts) never flash empty.
  const { jobs, isLoading, isError } = useCloneJobs(activeTab.filter || "all", LIMIT, page);
  const counts = useJobCounts();
  const tabTotal = countFor(activeTab, counts);
  const totalPages = Math.max(1, Math.ceil(tabTotal / LIMIT));
  const changeTab = (key: string) => setParams({ tab: key === "all" ? null : key, page: null });
  const local = useLocalJobs();
  const qa = useQueueActions();
  const [actErr, setActErr] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const runAction = (id: string, fn: () => Promise<void>, confirmMsg?: string) => async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setPending(id);
    setActErr(null);
    try {
      await fn();
    } catch (err) {
      setActErr(err instanceof Error ? err.message : "Thao tác thất bại");
    } finally {
      setPending(null);
    }
  };
  const queuedCount = countFor(STATUS_TABS.find((t) => t.key === "pending")!, counts);

  // Local drafts only show on the "all" tab, first page (not a real server status).
  const allJobs = tab === "all" && page === 1 ? [...local, ...jobs] : jobs;

  const ql = q.trim().toLowerCase();
  const rows = allJobs.filter(
    (j) => !ql || `${j.name} ${j.brand ?? ""} ${j.id}`.toLowerCase().includes(ql),
  );

  const tabs = STATUS_TABS.map((t) => ({ key: t.key, label: t.label, count: countFor(t, counts) }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>
            Clone jobs
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>
            Pipeline clone từ PDF nguồn đến book hoàn chỉnh
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="outline" size="sm" disabled={!qa.enabled || pending !== null} onClick={runAction("q:pause", qa.pause)} title={qa.enabled ? undefined : "Cần bật ghi thật (staging)"}>Tạm dừng queue</Button>
          <Button variant="outline" size="sm" disabled={!qa.enabled || pending !== null} onClick={runAction("q:resume", qa.resume)}>Tiếp tục</Button>
          <Button variant="outline" size="sm" disabled={!qa.enabled || pending !== null || queuedCount === 0} onClick={runAction("q:stashall", qa.stashAll)}>Tạm hoãn tất cả</Button>
          <Button onClick={() => router.push(`${B}/jobs/new`)}>
            <Icon name="plus" size={18} /> Tạo clone job
          </Button>
        </div>
      </div>
      {actErr && (
        <div style={{ padding: "10px 12px", background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}>{actErr}</div>
      )}
      {!COLORING_WRITE_ENABLED && (
        <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          Thao tác queue (start/retry/stash/re-run) chỉ chạy khi bật ghi thật (<span style={{ fontFamily: "var(--font-mono)" }}>NEXT_PUBLIC_COLORING_WRITE=1</span> · staging).
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Tabs items={tabs} value={tab} onChange={changeTab} />
        <div style={{ width: 260, maxWidth: "100%" }}>
          <Input icon="search" placeholder="Tìm job, brand, id…" value={q} onChange={(e) => setParams({ q: e.target.value || null, page: null })} />
        </div>
      </div>

      <Card>
        {isLoading ? (
          <LoadingRows rows={6} />
        ) : isError ? (
          <ErrorState sub="Không gọi được /api/clone. Kiểm tra database và thử lại." />
        ) : rows.length === 0 ? (
          <EmptyState icon="copy" title="Chưa có clone job" sub="Tạo clone job đầu tiên từ một PDF nguồn." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 1040 }}>
              <thead>
                <tr>
                  <th style={th}>Job</th>
                  <th style={th}>Nguồn</th>
                  <th style={th}>Bước</th>
                  <th style={th}>Tiến độ</th>
                  <th style={th}>Trạng thái</th>
                  <th style={th}>Ngày tạo</th>
                  <th style={th}>Ngày update</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {rows.map((j) => {
                  const meta = metaFor(j.status);
                  const pct = progressOf(j);
                  return (
                    <tr
                      key={j.id}
                      className="mo-row"
                      style={{ cursor: "pointer" }}
                      onClick={() => router.push(`${B}/jobs/${j.id}`)}
                    >
                      <td style={td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 34, height: 44, borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)", background: "var(--neutral-100)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)" }}>
                            {resolveImg(j.thumbnailUrl || undefined) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={resolveImg(j.thumbnailUrl || undefined)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              <Icon name="book-open" size={14} />
                            )}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontWeight: 600 }}>{j.name || "—"}</span>
                              {"__local" in j && <Badge tone="warning">Nháp</Badge>}
                            </div>
                            <div style={{ ...mono, fontSize: 11, color: "var(--muted-foreground)" }}>{j.id.slice(0, 8)}</div>
                          </div>
                        </div>
                      </td>
                      <td style={td}>
                        <div>{j.brand || "—"}</div>
                        {j.totalPages ? <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{j.totalPages} trang</div> : null}
                      </td>
                      <td style={{ ...td, ...mono }}>{j.currentStep || `${j.analyzedPages}/${j.totalPages || "—"}`}</td>
                      <td style={td}>
                        <div style={{ width: 120 }}>
                          <Progress value={pct} tone={meta.bucket === "error" ? "danger" : "volt"} />
                        </div>
                      </td>
                      <td style={td}>
                        <Badge tone={meta.tone} dot={meta.dot}>
                          {meta.label}
                        </Badge>
                      </td>
                      <td style={{ ...td, ...mono, fontSize: 12, whiteSpace: "nowrap", color: "var(--muted-foreground)" }}>{fmtDateTime(j.createdAt)}</td>
                      <td style={{ ...td, ...mono, fontSize: 12, whiteSpace: "nowrap", color: "var(--muted-foreground)" }}>{fmtDateTime(j.updatedAt)}</td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                        {(() => {
                          const a = "__local" in j ? null : rowActionFor(j.status);
                          if (!a) return null;
                          return (
                            <Button
                              variant={a.variant}
                              size="sm"
                              disabled={!qa.enabled || pending !== null}
                              title={qa.enabled ? undefined : "Cần bật ghi thật (staging)"}
                              onClick={runAction(j.id, () => qa[a.key](j.id), a.confirm)}
                              style={{ marginRight: 6 }}
                            >
                              {pending === j.id ? "…" : a.label}
                            </Button>
                          );
                        })()}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`${B}/jobs/${j.id}`);
                          }}
                        >
                          Xem
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!isLoading && !isError && totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage(Math.max(1, page - 1))}
          onNext={() => setPage(Math.min(totalPages, page + 1))}
        />
      )}
    </div>
  );
}
