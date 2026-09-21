"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

/**
 * Text input backed by a URL param, debounced. The box updates instantly (local
 * state) and `commit` — which writes the URL and so drives the fetch — only runs
 * after typing pauses. Writing the URL on every keystroke re-renders the whole
 * route and the box briefly shows the stale URL value, dropping typed chars.
 *
 * `value` changing from outside (back/forward, reset) resyncs the box, but NOT
 * when it's just our own commit landing: the user may have typed more while
 * router.replace was in flight, and resyncing then would eat those chars.
 */
export function useDebouncedInput(
  value: string,
  commit: (v: string) => void,
  delayMs = 300,
): [string, (v: string) => void] {
  const [text, setText] = useState(value);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const committedRef = useRef(value);

  useEffect(() => {
    if (value !== committedRef.current) {
      committedRef.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    if (text === committedRef.current) return;
    const t = setTimeout(() => {
      committedRef.current = text;
      commitRef.current(text);
    }, delayMs);
    return () => clearTimeout(t);
  }, [text, delayMs]);

  return [text, setText];
}
