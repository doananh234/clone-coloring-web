import type { BadgeTone } from "../components/ui/badge";

/** Design's 5 status buckets (job tabs / queue rows). */
export type JobBucket = "queue" | "running" | "confirm" | "done" | "error";

export interface StatusMeta {
  bucket: JobBucket;
  label: string;
  tone: BadgeTone;
  dot?: boolean;
}

/** Map every raw CloneJob.status to a design bucket + badge presentation. */
export const STATUS_META: Record<string, StatusMeta> = {
  uploading: { bucket: "queue", label: "Đang tải", tone: "info" },
  pending: { bucket: "queue", label: "Queue", tone: "info" },
  queued: { bucket: "queue", label: "Queue", tone: "info" },
  extracted: { bucket: "queue", label: "Đã tách trang", tone: "info" },
  stashed: { bucket: "queue", label: "Tạm hoãn", tone: "carbon" },
  analyzing: { bucket: "running", label: "Đang chạy", tone: "success", dot: true },
  running: { bucket: "running", label: "Đang chạy", tone: "success", dot: true },
  analyzed: { bucket: "confirm", label: "Chờ xác nhận", tone: "warning" },
  confirmed: { bucket: "confirm", label: "Chờ xác nhận", tone: "warning" },
  entities_ready: { bucket: "confirm", label: "Chờ xác nhận", tone: "warning" },
  reproduced: { bucket: "done", label: "Hoàn thành", tone: "neutral" },
  error: { bucket: "error", label: "Lỗi", tone: "danger" },
};

export function metaFor(status: string): StatusMeta {
  return STATUS_META[status] ?? { bucket: "queue", label: status, tone: "neutral" };
}

/**
 * Jobs-list tabs. `filter` is the server `?status=` value (server-side filtering
 * so completed/stashed jobs actually load). `countKeys` sums the server `counts`
 * grouped by raw status. Mirrors the old QueueTab FILTERS.
 */
export interface StatusTab {
  key: string;
  label: string;
  /** Server status filter; "" = no filter (all). */
  filter: string;
  countKeys: string[];
  barColor: string;
}

export const STATUS_TABS: StatusTab[] = [
  { key: "all", label: "Tất cả", filter: "", countKeys: ["all"], barColor: "var(--neutral-400)" },
  { key: "pending", label: "Queue", filter: "pending", countKeys: ["pending", "queued", "uploading", "extracted"], barColor: "var(--info)" },
  { key: "running", label: "Đang chạy", filter: "running", countKeys: ["running", "analyzing"], barColor: "var(--volt-500)" },
  { key: "analyzed", label: "Chờ xác nhận", filter: "analyzed", countKeys: ["analyzed", "confirmed", "entities_ready"], barColor: "var(--warning)" },
  { key: "reproduced", label: "Hoàn thành", filter: "reproduced", countKeys: ["reproduced"], barColor: "var(--success)" },
  { key: "stashed", label: "Tạm hoãn", filter: "stashed", countKeys: ["stashed"], barColor: "var(--carbon-700)" },
  { key: "error", label: "Lỗi", filter: "error", countKeys: ["error"], barColor: "var(--danger)" },
];

/** Sum server counts for a tab's status keys. */
export function countFor(tab: StatusTab, counts: Record<string, number>): number {
  return tab.countKeys.reduce((n, k) => n + (counts[k] ?? 0), 0);
}

/** Legacy alias kept for the Overview "queue today" rows (excludes the "all" tab). */
export const BUCKETS = STATUS_TABS.filter((t) => t.key !== "all");
