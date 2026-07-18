"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@vx/core-uikit/components";
import { toast } from "sonner";
import Link from "next/link";

interface JobRow {
  id: string;
  name: string;
  status: string;
  currentStep?: string | null;
  failedStep?: string | null;
  retryHistory?: Array<{ step: string }>;
  thumbnailUrl?: string | null;
  brand?: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  queued: "bg-gray-100 text-gray-800 border-gray-200",
  stashed: "bg-purple-100 text-purple-800 border-purple-200",
  running: "bg-blue-100 text-blue-800 border-blue-200 animate-pulse",
  reproduced: "bg-green-100 text-green-800 border-green-200",
  error: "bg-red-100 text-red-800 border-red-200",
};

function StatusPill({ status }: { status: string }) {
  const style = STATUS_STYLE[status] ?? "bg-gray-100 text-gray-800 border-gray-200";
  const label = status === "reproduced" ? "done" : status;
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}

const FILTERS = ["all", "pending", "queued", "stashed", "running", "reproduced", "error"] as const;
type Filter = (typeof FILTERS)[number];

type CloneListResponse = { data: JobRow[]; counts: Record<string, number> };

async function fetchJobs(filter: Filter): Promise<CloneListResponse> {
  const url = filter === "all" ? "/api/clone" : `/api/clone?status=${filter}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as Partial<CloneListResponse>;
  return { data: body.data ?? [], counts: body.counts ?? {} };
}

export function QueueTab({
  defaultFilter = "all",
  lockedFilter = false,
}: {
  defaultFilter?: Filter;
  lockedFilter?: boolean;
} = {}) {
  const [filter, setFilter] = useState<Filter>(defaultFilter);

  const { data } = useQuery({
    queryKey: ["clone-jobs", filter],
    queryFn: () => fetchJobs(filter),
    refetchInterval: 2000,
    refetchIntervalInBackground: false,
  });
  const rows: JobRow[] = data?.data ?? [];
  const serverCounts = data?.counts ?? {};

  async function call(path: string, okMessage: string) {
    try {
      const res = await fetch(path, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      toast.success(okMessage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  const counts: Record<Filter, number> = {
    all: serverCounts.all ?? 0,
    pending: serverCounts.pending ?? 0,
    queued: serverCounts.queued ?? 0,
    stashed: serverCounts.stashed ?? 0,
    running: serverCounts.running ?? 0,
    reproduced: serverCounts.reproduced ?? 0,
    error: serverCounts.error ?? 0,
  };

  const visible = rows;

  // For terminal-status filters, show when the job finished/failed (updatedAt)
  // instead of when it was created — matches the server-side sort key so the
  // "latest failure" is both at the top and labeled with a meaningful time.
  const timeColumnLabel =
    filter === "reproduced" ? "Finished" : filter === "error" ? "Failed" : "Created";
  const rowTimestamp = (r: JobRow): string =>
    r.status === "reproduced" || r.status === "error" ? r.updatedAt : r.createdAt;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Clone queue ({counts.all})</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => call("/api/clone/queue/pause", "Queue paused")}
          >
            Pause queue
          </Button>
          <Button
            variant="outline"
            onClick={() => call("/api/clone/queue/resume", "Queue resumed")}
          >
            Resume queue
          </Button>
          <Button
            variant="outline"
            disabled={counts.queued === 0}
            onClick={() =>
              call("/api/clone/queue/stash-all", "All queued jobs stashed")
            }
          >
            Stash all queued
          </Button>
        </div>
      </div>

      {/* Filter tabs (hidden when a parent tab already scopes the filter) */}
      {!lockedFilter && (
        <div className="flex flex-wrap gap-2 border-b">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm border-b-2 -mb-px transition-colors ${
                filter === f
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "reproduced" ? "done" : f} ({counts[f]})
            </button>
          ))}
        </div>
      )}

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 w-20">Cover</th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Brand</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Step</th>
              <th className="text-left p-3">Retries</th>
              <th className="text-left p-3">{timeColumnLabel}</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const isRunning = r.status === "running";
              return (
                <tr
                  key={r.id}
                  className={`border-t ${isRunning ? "bg-blue-50/40 border-l-4 border-l-blue-500" : ""}`}
                >
                  <td className="p-3">
                    {r.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.thumbnailUrl}
                        alt=""
                        className="h-12 w-12 rounded object-cover bg-gray-100"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="h-12 w-12 rounded bg-gray-100" />
                    )}
                  </td>
                  <td className="p-3 max-w-xs">
                    <Link href={`/clone/${r.id}`} className="hover:underline line-clamp-2">
                      {r.name}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">{r.brand ?? "-"}</td>
                  <td className="p-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {r.failedStep ?? r.currentStep ?? "-"}
                    {isRunning && r.currentStep && (
                      <span className="ml-1 text-xs text-blue-600">⟳</span>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {r.retryHistory?.length ?? 0}
                  </td>
                  <td className="p-3 text-muted-foreground whitespace-nowrap">
                    {new Date(rowTimestamp(r)).toLocaleString()}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {r.status === "pending" && (
                      <Button
                        size="sm"
                        onClick={() => call(`/api/clone/${r.id}/start`, `Started ${r.name}`)}
                      >
                        Start
                      </Button>
                    )}
                    {r.status === "error" && (
                      <Button
                        size="sm"
                        onClick={() => call(`/api/clone/${r.id}/retry`, `Re-enqueued ${r.name}`)}
                      >
                        Retry
                      </Button>
                    )}
                    {r.status === "queued" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => call(`/api/clone/${r.id}/stash`, `Stashed ${r.name}`)}
                      >
                        Stash
                      </Button>
                    )}
                    {r.status === "stashed" && (
                      <Button
                        size="sm"
                        onClick={() => call(`/api/clone/${r.id}/unstash`, `Re-enqueued ${r.name}`)}
                      >
                        Requeue
                      </Button>
                    )}
                    {r.status === "reproduced" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Re-run "${r.name}" from scratch? This makes a fresh AI call (slow, costs money) and creates a NEW book — the old book is kept.`,
                            )
                          ) {
                            void call(`/api/clone/${r.id}/rerun`, `Re-running ${r.name}`);
                          }
                        }}
                      >
                        Re-run
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  {filter === "all"
                    ? "No clone jobs yet. Use the Import CSV tab to enqueue some."
                    : `No jobs with status "${filter}".`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
