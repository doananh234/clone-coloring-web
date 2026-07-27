"use client";

import { useRef } from "react";
import { Icon } from "../../lib/icon";

export interface CoverText {
  title: string;
  subtitle: string;
  badge: string;
}
export interface Pos {
  x: number;
  y: number;
}
export interface CoverLayout {
  title: Pos;
  sub: Pos;
  badge: Pos;
  titleSize: number;
  color: string;
}

interface DragState {
  key: "title" | "sub" | "badge";
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
}
interface ResizeState {
  sx: number;
  os: number;
}

/** Design's draggable cover canvas (carbon frame, volt safe-zone, %-positioned text). */
export function CoverCanvas({
  image,
  brand,
  text,
  layout,
  onLayout,
  font,
}: {
  image?: string;
  brand?: string;
  text: CoverText;
  layout: CoverLayout;
  onLayout: (next: CoverLayout) => void;
  /** Selected font family — applied to title + subtitle so the preview matches export. */
  font?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const resize = useRef<ResizeState | null>(null);

  const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

  const startDrag = (key: DragState["key"]) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const cur = key === "title" ? layout.title : key === "sub" ? layout.sub : layout.badge;
    drag.current = { key, sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y, w: box.width, h: box.height };
  };

  const startResize = (e: React.PointerEvent) => {
    e.stopPropagation();
    resize.current = { sx: e.clientX, os: layout.titleSize };
  };

  const onMove = (e: React.PointerEvent) => {
    if (resize.current) {
      const sz = clamp(Math.round(resize.current.os + (e.clientX - resize.current.sx) * 0.15), 14, 72);
      onLayout({ ...layout, titleSize: sz });
      return;
    }
    const d = drag.current;
    if (!d) return;
    const nx = clamp(d.ox + ((e.clientX - d.sx) / d.w) * 100, 4, 96);
    const ny = clamp(d.oy + ((e.clientY - d.sy) / d.h) * 100, 4, 96);
    const patch: Pos = { x: nx, y: ny };
    onLayout({ ...layout, [d.key === "sub" ? "sub" : d.key]: patch });
  };

  const end = () => {
    drag.current = null;
    resize.current = null;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ background: "var(--carbon-950)", borderRadius: "var(--radius-lg)", padding: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", width: "min(360px, 100%)", aspectRatio: "1 / 1" }}>
          <div style={{ position: "absolute", inset: 24, border: "1.5px dashed var(--volt-600)", borderRadius: 4, opacity: 0.6, pointerEvents: "none", zIndex: 2 }} />
          <div
            ref={boxRef}
            onPointerMove={onMove}
            onPointerUp={end}
            onPointerLeave={end}
            style={{ width: "100%", height: "100%", background: "var(--neutral-100)", borderRadius: 6, boxShadow: "var(--shadow-lg)", boxSizing: "border-box", position: "relative", overflow: "hidden", touchAction: "none", textAlign: "center" }}
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="cover" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
            ) : (
              <div style={{ position: "absolute", inset: 28, borderRadius: 8, background: "rgba(255,255,255,.45)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--carbon-800)", pointerEvents: "none" }}>
                <Icon name="image" size={26} />
              </div>
            )}
            {brand && (
              <div style={{ position: "absolute", left: "50%", top: 14, transform: "translateX(-50%)", fontSize: 11, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--carbon-800)", fontWeight: 600, pointerEvents: "none", zIndex: 3, textShadow: "0 1px 2px rgba(255,255,255,.6)" }}>{brand}</div>
            )}

            <div className="mo-cov-layer mo-cov-title" style={{ left: `${layout.title.x}%`, top: `${layout.title.y}%`, fontSize: layout.titleSize, color: layout.color, fontFamily: font || undefined }} onPointerDown={startDrag("title")}>
              {text.title}
              <span className="mo-cov-handle" onPointerDown={startResize} title="Kéo để đổi cỡ chữ" />
            </div>
            {text.subtitle && (
              <div className="mo-cov-layer mo-cov-sub" style={{ left: `${layout.sub.x}%`, top: `${layout.sub.y}%`, fontFamily: font || undefined }} onPointerDown={startDrag("sub")}>{text.subtitle}</div>
            )}
            {text.badge && (
              <span className="mo-cov-layer mo-cov-badge" style={{ left: `${layout.badge.x}%`, top: `${layout.badge.y}%` }} onPointerDown={startDrag("badge")}>{text.badge}</span>
            )}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
        Kéo thả chữ để dời vị trí trên bìa · nét đứt volt = vùng an toàn chữ · <span style={{ fontFamily: "var(--font-mono)" }}>2550 × 3300 px · 300 DPI</span>
      </div>
    </div>
  );
}
