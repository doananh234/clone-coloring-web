"use client";

import { useEffect, useState } from "react";

/**
 * True when the viewport is at/below `maxWidth`. SSR-safe (starts false, resolves
 * on mount) and updates on viewport changes. Used to collapse modal side-by-side
 * layouts into a single stacked column on small screens.
 */
export function useIsMobile(maxWidth = 720): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [maxWidth]);
  return isMobile;
}
