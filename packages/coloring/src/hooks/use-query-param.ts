"use client";

import { useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

/**
 * Read/write a single URL search param (shareable + survives reload). Setting a
 * value to the fallback removes the param so URLs stay clean. Uses router.replace
 * (no history spam, no scroll jump) so paginating/filtering keeps the position on
 * reload instead of snapping back to page 1.
 */
export function useQueryParam(key: string, fallback = ""): [string, (v: string) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = params.get(key) ?? fallback;

  const setValue = useCallback(
    (v: string) => {
      const next = new URLSearchParams(params.toString());
      if (!v || v === fallback) next.delete(key);
      else next.set(key, v);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname, key, fallback],
  );

  return [value, setValue];
}

/** Set several params in ONE router.replace (avoids races when e.g. changing a
 * tab must also reset page). Pass null/"" to remove a key. */
export function useSetQueryParams(): (updates: Record<string, string | null>) => void {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname],
  );
}

/** Numeric variant (e.g. pagination `?page=3`). */
export function useQueryNumber(key: string, fallback = 1): [number, (n: number) => void] {
  const [raw, setRaw] = useQueryParam(key, String(fallback));
  const value = Math.max(1, Number(raw) || fallback);
  return [value, (n: number) => setRaw(String(n))];
}
