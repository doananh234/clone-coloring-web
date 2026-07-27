"use client";

import { useCallback, useRef, useState } from "react";

export interface ImageComparisonProps {
  /** Left/before layer, revealed as the divider moves right. */
  beforeSrc: string;
  /** Right/after layer, shown underneath (full). */
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
}

/**
 * Before/after slider — drag the divider to reveal B&W (before) over the
 * colored (after) image. Ported from the old app's image-comparison so
 * colorize keeps BOTH versions instead of replacing the original.
 */
export function ImageComparison({ beforeSrc, afterSrc, beforeLabel = "B&W gốc", afterLabel = "Đã tô màu" }: ImageComparisonProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const dragging = useRef(false);

  const setFromClientX = useCallback((clientX: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const p = ((clientX - box.left) / box.width) * 100;
    setPos(Math.min(100, Math.max(0, p)));
  }, []);

  const onDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setFromClientX(e.clientX);
  };
  const onMove = (e: React.PointerEvent) => {
    if (dragging.current) setFromClientX(e.clientX);
  };
  const onUp = () => { dragging.current = false; };

  const lbl = { position: "absolute" as const, top: 10, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99, background: "rgba(11,13,12,.55)", color: "#fff", pointerEvents: "none" as const };

  return (
    <div
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--border)", background: "#fff", cursor: "ew-resize", touchAction: "pan-y", userSelect: "none" }}
    >
      {/* after (colored) — full */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={afterSrc} alt={afterLabel} draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
      {/* before (B&W) — clipped by pos */}
      <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={beforeSrc} alt={beforeLabel} draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#fff" }} />
      </div>
      {/* divider */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${pos}%`, width: 2, background: "#fff", transform: "translateX(-50%)", boxShadow: "0 0 4px rgba(0,0,0,.35)" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 36, height: 36, borderRadius: 99, border: "2px solid #fff", background: "rgba(255,255,255,.9)", boxShadow: "var(--shadow-md)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8L1 5M4 8L1 11M4 8H12M12 8L15 5M12 8L15 11" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      </div>
      <span style={{ ...lbl, left: 10 }}>{beforeLabel}</span>
      <span style={{ ...lbl, right: 10 }}>{afterLabel}</span>
    </div>
  );
}
