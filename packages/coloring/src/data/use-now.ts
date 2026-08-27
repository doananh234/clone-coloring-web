"use client";

import { useEffect, useState } from "react";

/**
 * A `Date.now()` that re-renders on an interval, for clocks that count up
 * between server updates. Disabled by default so a screen with nothing running
 * does not re-render on a timer.
 */
export function useNow(enabled: boolean, intervalMs = 10_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);
  return now;
}
