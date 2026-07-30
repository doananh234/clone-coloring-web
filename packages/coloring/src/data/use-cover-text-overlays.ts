"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { httpGet, httpPost } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

/**
 * A reusable per-element cover text STYLE + LAYOUT template (like ColoringStyle
 * for colors). `elements` is the loosely-typed overlay shape
 * (Record<"title"|"subtitle"|"brand"|"badge", CoverElementExtract>) — cast to
 * the applyExtractedStyles param type at the call site (it validates per-field).
 */
export interface CoverTextOverlayRecord {
  id: string;
  name: string;
  elements: Record<string, unknown>;
  referenceImageUrl?: string | null;
}

const WRITE_DISABLED_MSG = "Chỉ chạy ở chế độ ghi thật (staging).";

async function fetchOverlays(): Promise<CoverTextOverlayRecord[]> {
  const res = await httpGet<{ data?: CoverTextOverlayRecord[] }>(`${COLORING_API_BASE}/cover-text-overlays`);
  return res?.data ?? [];
}

/** CRUD hook over /cover-text-overlays (mirrors use-fonts.ts). */
export function useCoverTextOverlays() {
  const [overlays, setOverlays] = useState<CoverTextOverlayRecord[]>([]);
  const [isLoading, setLoading] = useState(true);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const list = await fetchOverlays();
      if (!mounted.current) return;
      setOverlays(list);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const create = useCallback(
    async (name: string, elements: Record<string, unknown>, referenceImageUrl?: string | null) => {
      if (!COLORING_WRITE_ENABLED) throw new Error(WRITE_DISABLED_MSG);
      await httpPost(`${COLORING_API_BASE}/cover-text-overlays`, { name, elements, referenceImageUrl: referenceImageUrl ?? null });
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!COLORING_WRITE_ENABLED) throw new Error(WRITE_DISABLED_MSG);
      await fetch(`${COLORING_API_BASE}/cover-text-overlays/${encodeURIComponent(id)}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      if (!COLORING_WRITE_ENABLED) throw new Error(WRITE_DISABLED_MSG);
      await fetch(`${COLORING_API_BASE}/cover-text-overlays/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      await refresh();
    },
    [refresh],
  );

  return { overlays, isLoading, create, remove, rename, refresh, enabled: COLORING_WRITE_ENABLED };
}
