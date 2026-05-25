"use client";

import { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/pro-regular-svg-icons";

/**
 * Global Image Preview — click any image to view fullscreen.
 *
 * Usage:
 *   1. Mount <GlobalImagePreview /> once in the dashboard layout
 *   2. On any <img>, add: onClick={() => previewImage(src, alt)}
 *   3. Or use the helper: <PreviewableImage src={url} alt={alt} />
 *
 * Uses custom DOM events so no context/provider needed.
 */

// --- Custom Event API ---

const EVENT_NAME = "global-image-preview";

type PreviewEventDetail = {
  src: string;
  alt?: string;
};

export function previewImage(src: string, alt?: string) {
  window.dispatchEvent(new CustomEvent<PreviewEventDetail>(EVENT_NAME, { detail: { src, alt } }));
}

// --- Helper component for clickable images ---

export function PreviewableImage({
  src,
  alt,
  className,
  style,
}: {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <img
      src={src}
      alt={alt || ""}
      className={`cursor-zoom-in ${className || ""}`}
      style={style}
      onClick={() => previewImage(src, alt)}
    />
  );
}

// --- Global Preview Component (mount once in layout) ---

export function GlobalImagePreview() {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState("");
  const [alt, setAlt] = useState("");

  const handleOpen = useCallback((e: Event) => {
    const detail = (e as CustomEvent<PreviewEventDetail>).detail;
    setSrc(detail.src);
    setAlt(detail.alt || "");
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    window.addEventListener(EVENT_NAME, handleOpen);
    return () => window.removeEventListener(EVENT_NAME, handleOpen);
  }, [handleOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={handleClose}
    >
      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
      </button>

      {/* Image */}
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Alt text */}
      {alt && (
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-sm text-white/80">
          {alt}
        </p>
      )}
    </div>
  );
}
