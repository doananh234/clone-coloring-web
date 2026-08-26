"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost, httpDel } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";
import type { CloneJobPage } from "./types";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

const isInterior = (p: CloneJobPage): boolean =>
  p.pageType !== "cover" && p.pageType !== "interiorIntro";

/**
 * Local copy of the canonical drop-flag read. The canonical helper is
 * `isDroppedFromClone` in `@vx/clone-core/steps/plan-page-selection.ts`;
 * @vx/coloring deliberately does not depend on @vx/clone-core, so the rule is
 * inlined here. Keep the two in lockstep: `excludedFromClone ?? excluded ?? false`.
 */
const isDropped = (p: CloneJobPage): boolean =>
  p.excludedFromClone ?? p.excluded ?? false;

export interface AdditionalMeta {
  isAdditional: boolean;
  displayNumber: string;
  parentPageNumber?: number;
}

/** Derive the display label + additional flag for a page (nothing stored in DB). */
export function deriveAdditionalMeta(page: CloneJobPage, allPages: CloneJobPage[]): AdditionalMeta {
  if (page.origin !== "additional" || page.parentPageNumber == null) {
    return { isAdditional: false, displayNumber: `#${page.pageNumber}`, parentPageNumber: undefined };
  }
  const siblings = allPages
    .filter((q) => q.origin === "additional" && q.parentPageNumber === page.parentPageNumber)
    .sort((a, b) => a.pageNumber - b.pageNumber);
  const n = siblings.findIndex((q) => q.pageNumber === page.pageNumber) + 1;
  return {
    isAdditional: true,
    displayNumber: `#${page.parentPageNumber}·A${n}`,
    parentPageNumber: page.parentPageNumber,
  };
}

/** Interior page count, drops excluded — the numerator of the progress header. */
export function interiorProgress(pages: CloneJobPage[]): { count: number } {
  return { count: pages.filter((p) => isInterior(p) && !isDropped(p)).length };
}

/** D3 write actions (all behind the staging write flag). */
export function useFillInterior(jobId: string) {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ["coloring", "clone-job", jobId] });
  const base = `${COLORING_API_BASE}/clone/${encodeURIComponent(jobId)}`;
  const guard = () => {
    if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
  };

  return {
    enabled: COLORING_WRITE_ENABLED,
    fill: async () => {
      guard();
      await httpPost(`${base}/fill-interior`, {});
      inval();
    },
    regen: async (pageNumber: number, changePercent: number) => {
      guard();
      await httpPost(`${base}/pages/${pageNumber}/regen`, { changePercent });
      inval();
    },
    remove: async (pageNumber: number) => {
      guard();
      await httpDel(`${base}/pages/${pageNumber}`);
      inval();
    },
  };
}
