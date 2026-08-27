"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPatch } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (bật NEXT_PUBLIC_COLORING_WRITE=1, upstream staging).";

export type PageType = "cover" | "interiorIntro" | "interior";
export type ClassifyEdit = {
  pageNumber: number;
  pageType?: PageType;
  excludedFromClone?: boolean;
};

/**
 * Display-only mirror of `LANE1_MIN_INTERIOR` in @vx/clone-core. Duplicated
 * because @vx/coloring does not depend on @vx/clone-core; the worker's copy
 * remains authoritative for the actual routing decision.
 */
export const GATE_MIN_INTERIOR = 40;

/** Interior pages that will actually be sent for cloning. Mirrors planPageSelection. */
export function countInteriorPages(edits: ClassifyEdit[]): number {
  return edits.filter(
    (e) =>
      !e.excludedFromClone &&
      e.pageType !== "cover" &&
      e.pageType !== "interiorIntro",
  ).length;
}

export interface GateStateView {
  /** The operator already confirmed and the worker parked the job. */
  parked: boolean;
  lane: 1 | 2;
  tone: "success" | "warning";
  /** Live: what confirming with the CURRENT edits would do. */
  banner: string;
  /** Present only once parked — what already happened, in the past tense. */
  parkedNotice?: string;
  confirmLabel: string;
}

/**
 * Everything the classify screen needs to tell the operator where the job
 * stands. Pure so it can be tested without rendering.
 *
 * The reason it takes `status` at all: a successful confirm leaves the job in
 * `awaiting-fill`, which KEEPS this tab mounted. Without a parked branch the
 * screen re-renders byte-identically — same grid, same future-tense banner,
 * same button label — and an operator at the bottom of a long page reads that
 * as "nothing happened" and clicks again.
 */
export function describeGateState(
  status: string,
  interiorCount: number,
  keptPageCount: number,
): GateStateView {
  const lane: 1 | 2 = interiorCount < GATE_MIN_INTERIOR ? 2 : 1;
  const parked = status === "awaiting-fill";
  const banner =
    lane === 2
      ? `Interior: ${interiorCount} — dưới ${GATE_MIN_INTERIOR}. Xác nhận sẽ đưa job vào hàng chờ bổ sung trang, KHÔNG gọi Diaflow và không tốn chi phí.`
      : `Interior: ${interiorCount} — đủ điều kiện. Xác nhận sẽ gửi ${keptPageCount} trang cho Diaflow và bắt đầu phát sinh chi phí.`;
  return {
    parked,
    lane,
    tone: lane === 2 ? "warning" : "success",
    banner,
    parkedNotice: parked
      ? "Đã xác nhận. Job nằm trong hàng chờ bổ sung trang ruột — chưa gọi Diaflow, chưa phát sinh chi phí. Sửa phân loại rồi bấm Xác nhận lại nếu muốn đổi quyết định."
      : undefined,
    confirmLabel: parked ? "Xác nhận lại" : "Xác nhận & tạo book",
  };
}

/** Pure payload builder — unit-tested without a live client. */
export function buildClassifyPayload(edits: ClassifyEdit[], confirm: boolean) {
  return { pages: edits, confirm };
}

/** PATCH /clone/[jobId]/classify — save page classifications, optionally confirm+resume. */
export function useClassifyGate(jobId: string) {
  const qc = useQueryClient();
  const send = async (edits: ClassifyEdit[], confirm: boolean) => {
    if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
    await httpPatch(
      `${COLORING_API_BASE}/clone/${encodeURIComponent(jobId)}/classify`,
      buildClassifyPayload(edits, confirm),
    );
    qc.invalidateQueries({ queryKey: ["coloring", "clone-job", jobId] });
  };
  return {
    save: (edits: ClassifyEdit[]) => send(edits, false),
    confirm: (edits: ClassifyEdit[]) => send(edits, true),
  };
}
