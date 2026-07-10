"use client";
import { useState, useCallback } from "react";
import type { CoverDesignPack, CoverDesignContext } from "@vx/server-core/ai/prompts/cover-design-prompt";

export function useAiSuggestions() {
  const [suggestions, setSuggestions] = useState<CoverDesignPack | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(
    async (sourceThumbnailUrl: string, bookContext: Partial<CoverDesignContext>) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/generate/cover-design", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceThumbnailUrl, bookContext }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Request failed (${res.status})`);
        }
        const pack = (await res.json()) as CoverDesignPack;
        setSuggestions(pack);
      } catch (err) {
        setSuggestions(null);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { suggestions, loading, error, fetchSuggestions };
}
