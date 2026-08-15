"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost, httpDel } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

/**
 * Surface the server's own error text. httpPost/httpDel throw an ApiError whose
 * `.message` is only "API Error 503: …"; the useful message (e.g. the queue-
 * unavailable notice) lives in the parsed JSON body under `error`.
 */
function toFriendlyError(err: unknown): Error {
  const body = (err as { body?: unknown } | null)?.body;
  if (body && typeof body === "object" && "error" in body) {
    const msg = (body as { error?: unknown }).error;
    if (typeof msg === "string" && msg) return new Error(msg);
  }
  return err instanceof Error ? err : new Error("Thao tác thất bại");
}

/**
 * Clone-queue actions, replicating the old QueueTab. All behind the write flag
 * (default local = off) since they mutate real jobs. POST with empty body.
 */
export function useQueueActions() {
  const qc = useQueryClient();
  // Refresh both the row list and the tab-count badges after a mutation.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["coloring", "clone-jobs"] });
    qc.invalidateQueries({ queryKey: ["coloring", "job-counts"] });
  };

  const post = async (path: string) => {
    if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
    try {
      await httpPost(`${COLORING_API_BASE}${path}`, {});
    } catch (err) {
      throw toFriendlyError(err);
    }
    invalidate();
  };

  const del = async (path: string) => {
    if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
    try {
      await httpDel(`${COLORING_API_BASE}${path}`);
    } catch (err) {
      throw toFriendlyError(err);
    }
    invalidate();
  };

  return {
    enabled: COLORING_WRITE_ENABLED,
    // queue-level
    pause: () => post(`/clone/queue/pause`),
    resume: () => post(`/clone/queue/resume`),
    stashAll: () => post(`/clone/queue/stash-all`),
    // per-row (by status)
    start: (id: string) => post(`/clone/${encodeURIComponent(id)}/start`),
    retry: (id: string) => post(`/clone/${encodeURIComponent(id)}/retry`),
    stash: (id: string) => post(`/clone/${encodeURIComponent(id)}/stash`),
    unstash: (id: string) => post(`/clone/${encodeURIComponent(id)}/unstash`),
    rerun: (id: string) => post(`/clone/${encodeURIComponent(id)}/rerun`),
    // destructive: removes the job + its book + all R2 assets + queue record.
    remove: (id: string) => del(`/clone/${encodeURIComponent(id)}`),
  };
}

/** The row action for a given raw status: {label, variant, key} or null. */
export function rowActionFor(status: string): { key: "start" | "retry" | "stash" | "unstash" | "rerun"; label: string; variant: "primary" | "outline"; confirm?: string } | null {
  switch (status) {
    case "pending":
      return { key: "start", label: "Start", variant: "primary" };
    case "error":
      return { key: "retry", label: "Retry", variant: "primary" };
    case "queued":
      return { key: "stash", label: "Tạm hoãn", variant: "outline" };
    case "stashed":
      return { key: "unstash", label: "Đưa lại queue", variant: "primary" };
    case "reproduced":
      return { key: "rerun", label: "Chạy lại", variant: "outline", confirm: "Chạy lại job từ đầu? Tốn phí AI và tạo book MỚI (book cũ vẫn giữ)." };
    default:
      return null;
  }
}
