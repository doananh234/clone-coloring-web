"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { httpGet, httpPost } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";
import { fileToBase64 } from "./use-upload-image";

export interface FontRecord {
  id: string;
  name: string;
  fileUrl: string;
  format: string;
  weight?: number | null;
}

const injected = new Set<string>();

/** Register uploaded fonts as CSS FontFaces (idempotent). Client-only. */
export function injectFontFaces(fonts: FontRecord[]): void {
  if (typeof document === "undefined" || !("fonts" in document) || typeof FontFace === "undefined") return;
  for (const f of fonts) {
    const dedupeKey = `${f.name}::${f.fileUrl}`;
    if (injected.has(dedupeKey)) continue;
    injected.add(dedupeKey);
    try {
      const face = new FontFace(f.name, `url(${JSON.stringify(f.fileUrl)})`);
      document.fonts.add(face);
      face.load().catch(() => {
        injected.delete(dedupeKey);
      });
    } catch {
      injected.delete(dedupeKey);
    }
  }
}

async function fetchFonts(): Promise<FontRecord[]> {
  const res = await httpGet<{ data?: FontRecord[] }>(`${COLORING_API_BASE}/fonts`);
  return res?.data ?? [];
}

export function useFonts() {
  const [fonts, setFonts] = useState<FontRecord[]>([]);
  const [isLoading, setLoading] = useState(true);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const list = await fetchFonts();
      if (!mounted.current) return;
      injectFontFaces(list);
      setFonts(list);
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

  const upload = useCallback(
    async (file: File, name: string) => {
      if (!COLORING_WRITE_ENABLED) throw new Error("Chỉ chạy ở chế độ ghi thật (staging).");
      const ext = file.name.toLowerCase().split(".").pop() || "";
      const format = ext === "woff2" || ext === "ttf" || ext === "otf" ? ext : "";
      if (!format) throw new Error("Chỉ chấp nhận .woff2, .ttf, .otf");
      if (file.size > 2 * 1024 * 1024) throw new Error("File font vượt quá 2MB");
      const base64 = await fileToBase64(file);
      await httpPost(`${COLORING_API_BASE}/fonts`, { name, base64, format });
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!COLORING_WRITE_ENABLED) throw new Error("Chỉ chạy ở chế độ ghi thật (staging).");
      await fetch(`${COLORING_API_BASE}/fonts/${encodeURIComponent(id)}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      if (!COLORING_WRITE_ENABLED) throw new Error("Chỉ chạy ở chế độ ghi thật (staging).");
      await fetch(`${COLORING_API_BASE}/fonts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      await refresh();
    },
    [refresh],
  );

  return { fonts, names: fonts.map((f) => f.name), isLoading, upload, remove, rename, enabled: COLORING_WRITE_ENABLED };
}
