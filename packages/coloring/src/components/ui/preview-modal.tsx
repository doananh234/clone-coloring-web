"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../../lib/icon";

export interface PreviewModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  imageSrc?: string;
  /** Custom right-panel content (e.g. before/after comparison). Overrides imageSrc. */
  imageNode?: ReactNode;
  /** Badges shown above the info rows (left panel). */
  badges?: ReactNode;
  /** Info rows shown in the left panel. */
  info?: { label: string; value: ReactNode }[];
  /** Optional description text (left panel, above info). */
  desc?: ReactNode;
  /** Optional action buttons row (left panel, bottom). */
  actions?: ReactNode;
  /** Prev/next navigation (lightbox behavior — also bound to ← / → keys). */
  onPrev?: () => void;
  onNext?: () => void;
  /** Position label, e.g. "3 / 24". */
  counter?: string;
}

/** Preview: LEFT panel = info + actions, RIGHT panel = large image view. Lightbox: ←/→ nav, Esc close. */
export function PreviewModal({ open, onClose, title, imageSrc, imageNode, badges, info, desc, actions, onPrev, onNext, counter }: PreviewModalProps) {
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { zoom ? setZoom(false) : onClose(); }
      else if (e.key === "ArrowLeft") onPrev?.();
      else if (e.key === "ArrowRight") onNext?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, onPrev, onNext, zoom]);

  useEffect(() => { if (!open) setZoom(false); }, [open]);

  if (!open) return null;

  const hasLeft = Boolean(badges || desc || (info && info.length) || actions);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(11,13,12,.5)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: "clamp(8px, 3vw, 24px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", width: "min(880px, 100%)", height: "min(90vh, 860px)", overflow: "hidden", display: "flex", flexDirection: "column", animation: "mo-dd-in var(--dur-med) var(--ease-out)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em", margin: 0 }}>{title}</h3>
            {counter && <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>{counter}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {(onPrev || onNext) && (
              <>
                <button type="button" className="mo-hbtn" onClick={onPrev} aria-label="Trang trước" title="← Trang trước"><Icon name="arrow-left" size={18} /></button>
                <button type="button" className="mo-hbtn" onClick={onNext} aria-label="Trang sau" title="→ Trang sau"><Icon name="chevron-right" size={18} /></button>
              </>
            )}
            {(imageSrc || imageNode) && !imageNode && <button type="button" className="mo-hbtn" onClick={() => setZoom(true)} aria-label="Phóng to" title="Phóng to"><Icon name="search" size={18} /></button>}
            <button type="button" className="mo-hbtn" onClick={onClose} aria-label="Đóng"><Icon name="x" size={18} /></button>
          </div>
        </div>

        {/* Flex-wrap: info + image sit side-by-side when wide, stack (wrap) when
            narrow — always readable, never scaled tiny. Whole body scrolls. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "clamp(12px, 2.5vw, 18px)", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
          {hasLeft && (
            <div style={{ flex: "1 1 260px", minWidth: "min(100%, 240px)", display: "flex", flexDirection: "column", gap: 12 }}>
              {badges && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{badges}</div>}
              {desc && <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{desc}</div>}
              {info && info.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", fontSize: 13, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "2px 12px" }}>
                  {info.map((r, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: i < info.length - 1 ? "1px solid var(--border)" : undefined }}>
                      <span style={{ color: "var(--muted-foreground)" }}>{r.label}</span>
                      <span style={{ textAlign: "right", minWidth: 0 }}>{r.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* RIGHT: large image view / custom node (coloring images are square 1:1) — fixed, top-aligned */}
          {imageNode ? (
            <div style={{ flex: "1 1 320px", minWidth: "min(100%, 280px)" }}>{imageNode}</div>
          ) : (
            // Ảnh tự co để luôn vừa khung modal (không ép aspect-ratio → không tràn/scroll).
            // maxHeight bám theo viewport nên fit trọn trên cả web lẫn mobile.
            <div style={{ flex: "1 1 320px", minWidth: "min(100%, 280px)", maxHeight: "100%", borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--border)", background: "var(--neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)" }}>
              {imageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageSrc} alt={typeof title === "string" ? title : "preview"} onClick={() => setZoom(true)} style={{ maxWidth: "100%", maxHeight: "min(72vh, 700px)", width: "auto", height: "auto", objectFit: "contain", background: "#fff", cursor: "zoom-in" }} />
              ) : (
                <Icon name="image" size={30} />
              )}
            </div>
          )}
        </div>

        {/* FOOTER: actions as one full-width row under both columns */}
        {actions && (
          <div style={{ flexShrink: 0, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "14px 18px", borderTop: "1px solid var(--border)", background: "var(--card)" }}>{actions}</div>
        )}
      </div>

      {/* Fullscreen zoom (lightbox) */}
      {zoom && imageSrc && (
        <div onClick={(e) => { e.stopPropagation(); setZoom(false); }} style={{ position: "fixed", inset: 0, background: "rgba(11,13,12,.9)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageSrc} alt="zoom" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          {(onPrev || onNext) && (
            <>
              <button type="button" onClick={(e) => { e.stopPropagation(); onPrev?.(); }} style={{ position: "fixed", left: 16, top: "50%", transform: "translateY(-50%)", width: 44, height: 44, borderRadius: 99, border: "none", background: "rgba(255,255,255,.15)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="arrow-left" size={22} /></button>
              <button type="button" onClick={(e) => { e.stopPropagation(); onNext?.(); }} style={{ position: "fixed", right: 16, top: "50%", transform: "translateY(-50%)", width: 44, height: 44, borderRadius: 99, border: "none", background: "rgba(255,255,255,.15)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="chevron-right" size={22} /></button>
            </>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); setZoom(false); }} style={{ position: "fixed", top: 16, right: 16, width: 40, height: 40, borderRadius: 99, border: "none", background: "rgba(255,255,255,.15)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="x" size={20} /></button>
        </div>
      )}
    </div>
  );
}
