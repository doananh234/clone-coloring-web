"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";
import { addLocalJob } from "./local-store";

export interface CreateJobInput {
  file: File | null;
  name: string;
  brand?: string;
  /** Upload strategy for the real POST /api/clone (not the redesign mode). */
  mode?: "one-shot" | "multi-step";
  /** Redesign mode label — kept for the local draft only (applied later in the real pipeline). */
  redesignMode?: string;
}

export interface CreateJobResult {
  jobId: string;
  bulk: boolean;
}

/**
 * Create a clone job. When COLORING_WRITE_ENABLED (staging only):
 *   - CSV  → POST /clone/import-csv (multipart)
 *   - PDF  → POST /clone/presign → PUT file to R2 → POST /clone
 * Otherwise creates a local draft (no upload, no server write).
 */
export function useCreateJob(): (input: CreateJobInput) => Promise<CreateJobResult> {
  const qc = useQueryClient();

  return async ({ file, name, brand, mode = "one-shot", redesignMode }) => {
    if (!COLORING_WRITE_ENABLED) {
      const job = addLocalJob({ name, brand, sourceFileName: file?.name, mode: redesignMode });
      return { jobId: job.id, bulk: false };
    }

    if (!file) throw new Error("Cần chọn file nguồn (PDF hoặc CSV)");
    const isCsv = file.name.toLowerCase().endsWith(".csv");

    if (isCsv) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${COLORING_API_BASE}/clone/import-csv`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Import CSV lỗi (${res.status})`);
      qc.invalidateQueries({ queryKey: ["coloring", "clone-jobs"] });
      return { jobId: "", bulk: true };
    }

    // PDF: presign → upload to R2 → create job
    const pre = await httpPost<{ uploadUrl: string; jobId: string; key: string }>(
      `${COLORING_API_BASE}/clone/presign`,
      { fileName: file.name },
    );
    const up = await fetch(pre.uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": "application/pdf" },
    });
    if (!up.ok) throw new Error(`Upload PDF lên R2 lỗi (${up.status})`);

    await httpPost(`${COLORING_API_BASE}/clone`, {
      jobId: pre.jobId,
      key: pre.key,
      name,
      fileName: file.name,
      mode,
      brand: brand || undefined,
    });
    qc.invalidateQueries({ queryKey: ["coloring", "clone-jobs"] });
    return { jobId: pre.jobId, bulk: false };
  };
}
