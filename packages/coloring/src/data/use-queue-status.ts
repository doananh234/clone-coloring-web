"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost } from "@vx/core-uikit/api";
import { COLORING_API_BASE } from "./config";

export type QueueStatus = "todo" | "in_progress" | "review" | "done";

export interface QueueColumn {
  key: QueueStatus;
  label: string;
}

/** Kanban columns for the "My queue" board (order = left→right flow). */
export const QUEUE_COLUMNS: QueueColumn[] = [
  { key: "todo", label: "Chờ làm" },
  { key: "in_progress", label: "Đang xử lý" },
  { key: "review", label: "Chờ duyệt" },
  { key: "done", label: "Hoàn tất" },
];

/** Move a book to a kanban status, then refresh the books cache. */
export function useSetQueueStatus() {
  const qc = useQueryClient();
  return async (bookId: string, status: QueueStatus) => {
    await httpPost(`${COLORING_API_BASE}/books/queue-status`, { bookId, status });
    await qc.invalidateQueries({ queryKey: ["coloring", "books"] });
  };
}
