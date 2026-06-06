"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type Position = { top: number; left: number };

const POPOVER_W = 680;
const POPOVER_H = 480;
const MARGIN = 12;

function computePosition(rect: DOMRect): Position {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = rect.right + MARGIN;
  if (left + POPOVER_W > vw - MARGIN) {
    left = rect.left - POPOVER_W - MARGIN;
  }
  if (left < MARGIN) {
    left = Math.max(MARGIN, (vw - POPOVER_W) / 2);
  }

  let top = rect.top + rect.height / 2 - POPOVER_H / 2;
  if (top < MARGIN) top = MARGIN;
  if (top + POPOVER_H > vh - MARGIN) top = Math.max(MARGIN, vh - POPOVER_H - MARGIN);

  return { top, left };
}

/**
 * Hover state + viewport-aware positioning for a floating preview popover.
 * Returns refs/handlers to attach to an anchor element + the resolved position.
 */
export function usePreviewHover() {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const openPreview = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (openTimerRef.current !== null || open) return;
    openTimerRef.current = window.setTimeout(() => {
      if (anchorRef.current) {
        setPosition(computePosition(anchorRef.current.getBoundingClientRect()));
        setOpen(true);
      }
      openTimerRef.current = null;
    }, 150);
  }, [open]);

  const closePreview = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) return;
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 100);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleScroll() {
      setOpen(false);
    }
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [open]);

  useEffect(() => {
    return () => {
      if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  return { anchorRef, open, position, openPreview, closePreview };
}

/**
 * Floating side-by-side preview popover. Renders two equally-sized panes.
 *
 * The parent owns labels, badge text, and right-pane content (which may be an
 * image OR a placeholder for empty/loading/error states).
 */
export function PagePreviewPopover({
  title,
  badge,
  leftLabel,
  leftUrl,
  rightLabel,
  rightSlot,
  top,
  left,
  onMouseEnter,
  onMouseLeave,
}: {
  title: string;
  badge: { text: string; className: string };
  leftLabel: string;
  leftUrl: string;
  rightLabel: string;
  rightSlot: ReactNode;
  top: number;
  left: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return (
    <div
      className="fixed z-50 w-[680px] rounded-lg border bg-popover shadow-xl"
      style={{ top, left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <p className="text-sm font-semibold">{title}</p>
        <span className={`text-xs font-medium ${badge.className}`}>{badge.text}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 p-3">
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {leftLabel}
          </p>
          <div className="aspect-[3/4] w-full overflow-hidden rounded-md border bg-muted">
            <img
              src={leftUrl}
              alt={leftLabel}
              className="h-full w-full object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {rightLabel}
          </p>
          <div className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-md border bg-muted">
            {rightSlot}
          </div>
        </div>
      </div>
    </div>
  );
}
