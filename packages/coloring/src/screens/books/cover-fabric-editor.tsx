"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Canvas, Textbox } from "fabric";
import { COVER_CANVAS_SIDE as S, ELEMENT_ORDER, type CoverDoc, type CoverElement, type CoverElementKey } from "../../lib/cover-doc";
import { COLORING_IMG_BASE } from "../../data/config";

export interface CoverEditorHandle {
  export(): Promise<{ base64: string; blob: Blob }>;
}
export interface CoverFabricEditorProps {
  image?: string;
  doc: CoverDoc;
  onChange: (doc: CoverDoc) => void;
  selectedKey: CoverElementKey | null;
  onSelect: (key: CoverElementKey | null) => void;
}

/** Route CDN images through the same-origin proxy so toDataURL isn't tainted. */
function toProxied(url: string): string {
  if (typeof window === "undefined" || !url || url.startsWith("data:")) return url;
  try {
    const u = new URL(url, window.location.origin);
    const cdnHost = new URL(COLORING_IMG_BASE, window.location.origin).host;
    if (u.host === cdnHost && u.origin !== window.location.origin) return `/coloring-img${u.pathname}${u.search}`;
    return url;
  } catch { return url; }
}

/** letterSpacing px → fabric charSpacing (1/1000 em, relative to fontSize). */
const toCharSpacing = (px: number, fontSize: number) => (fontSize ? (px / fontSize) * 1000 : 0);

export const CoverFabricEditor = forwardRef<CoverEditorHandle, CoverFabricEditorProps>(function CoverFabricEditor(
  { image, doc, onChange, selectedKey, onSelect },
  ref,
) {
  const elRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const boxesRef = useRef<Partial<Record<CoverElementKey, Textbox>>>({});
  const naturalSideRef = useRef<number>(S);
  // CSS scale factor: the Fabric surface is a fixed S×S canvas scaled down to
  // fit the container width. Transform doesn't change the S-px coordinate
  // system, so text positions stay correct + inside the frame.
  const [scale, setScale] = useState(1);
  // Keep the latest doc/onChange in refs so fabric event handlers stay stable.
  const docRef = useRef(doc); docRef.current = doc;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const onSelectRef = useRef(onSelect); onSelectRef.current = onSelect;

  // Track the wrapper width → scale = width / S. Without this the Fabric canvas
  // renders at its native S px (Fabric forces the element + .canvas-container to
  // S px, overriding CSS width:100%), overflowing the layout massively.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => { const w = el.clientWidth; if (w > 0) setScale(w / S); };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Init canvas once (client-only).
  useEffect(() => {
    let disposed = false;
    let canvas: Canvas | null = null;
    (async () => {
      if (typeof window === "undefined" || !elRef.current) return;
      const fabric = await import("fabric");
      if (disposed) return;
      canvas = new fabric.Canvas(elRef.current, { width: S, height: S, backgroundColor: "#efe8d9", selection: false, preserveObjectStacking: true });
      canvasRef.current = canvas;

      canvas.on("selection:created", (e) => onSelectRef.current(keyOf(e.selected?.[0])));
      canvas.on("selection:updated", (e) => onSelectRef.current(keyOf(e.selected?.[0])));
      canvas.on("selection:cleared", () => onSelectRef.current(null));
      canvas.on("object:modified", (e) => {
        const key = keyOf(e.target);
        if (!key) return;
        const t = e.target as Textbox;
        const el = docRef.current.elements[key];
        // Scaling a Textbox multiplies scaleX; fold it back into fontSize and reset scale.
        const nextSize = Math.round(el.fontSize * (t.scaleX ?? 1));
        t.set({ scaleX: 1, scaleY: 1, fontSize: nextSize });
        onChangeRef.current({
          ...docRef.current,
          elements: { ...docRef.current.elements, [key]: { ...el, left: Math.round(t.left ?? el.left), top: Math.round(t.top ?? el.top), fontSize: nextSize } },
        });
      });
    })();
    return () => { disposed = true; canvas?.dispose(); canvasRef.current = null; boxesRef.current = {}; };
  }, []);

  // Background image (cover-fit), reloaded when `image` changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    (async () => {
      const fabric = await import("fabric");
      if (!image) { canvas.backgroundImage = undefined; canvas.renderAll(); return; }
      try {
        const img = await fabric.FabricImage.fromURL(toProxied(image), { crossOrigin: "anonymous" });
        if (cancelled) return;
        const iw = img.width ?? S, ih = img.height ?? S;
        naturalSideRef.current = Math.max(iw, ih);
        const scale = Math.max(S / iw, S / ih);
        img.set({ scaleX: scale, scaleY: scale, left: (S - iw * scale) / 2, top: (S - ih * scale) / 2, selectable: false, evented: false });
        canvas.backgroundImage = img;
        canvas.renderAll();
      } catch { /* leave cream background; export will still work if user retries */ }
    })();
    return () => { cancelled = true; };
  }, [image]);

  // Sync textboxes from doc (create/update/remove per visibility). Runs on every doc change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    (async () => {
      const fabric = await import("fabric");
      if (cancelled) return;
      // Load the fonts this doc needs before (re)rendering text.
      if (document.fonts) {
        await Promise.all(ELEMENT_ORDER.map((k) => {
          const el = doc.elements[k];
          return el.visible && el.text ? document.fonts.load(`${el.fontWeight} 40px "${el.fontFamily}"`).catch(() => {}) : Promise.resolve();
        }));
      }
      if (cancelled) return;
      for (const key of ELEMENT_ORDER) {
        const el = doc.elements[key];
        const existing = boxesRef.current[key];
        if (!el.visible || !el.text) {
          if (existing) { canvas.remove(existing); delete boxesRef.current[key]; }
          continue;
        }
        if (existing) {
          applyStyle(existing, el);
          existing.set({ left: el.left, top: el.top });
        } else {
          const tb = new fabric.Textbox(el.text, { originX: "center", originY: "center", left: el.left, top: el.top, width: S * 0.82, editable: false });
          tb.set({ data: { key } });
          applyStyle(tb, el);
          canvas.add(tb);
          boxesRef.current[key] = tb;
        }
      }
      canvas.requestRenderAll();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  // Reflect external selection onto the canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!selectedKey) { canvas.discardActiveObject(); canvas.requestRenderAll(); return; }
    const tb = boxesRef.current[selectedKey];
    if (tb && canvas.getActiveObject() !== tb) { canvas.setActiveObject(tb); canvas.requestRenderAll(); }
  }, [selectedKey]);

  useImperativeHandle(ref, () => ({
    async export() {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas chưa sẵn sàng.");
      const multiplier = Math.max(1, naturalSideRef.current / S);
      let dataUrl: string;
      try { dataUrl = canvas.toDataURL({ format: "png", multiplier }); }
      catch { throw new Error("Ảnh gốc chặn CORS nên không render được bìa phía client."); }
      const base64 = dataUrl.split(",")[1] ?? "";
      const blob = await (await fetch(dataUrl)).blob();
      return { base64, blob };
    },
  }));

  return (
    <div style={{ background: "var(--carbon-950)", borderRadius: "var(--radius-lg)", padding: 24 }}>
      {/* Responsive square. overflow:hidden clips the fixed S×S inner surface
          (its layout box stays S px; the CSS transform only shrinks it visually
          to the wrapper width). aspectRatio keeps the frame square. */}
      <div
        ref={wrapperRef}
        style={{ position: "relative", width: "100%", maxWidth: 520, margin: "0 auto", aspectRatio: "1 / 1", overflow: "hidden", borderRadius: 6, minHeight: 0 }}
      >
        <div style={{ width: S, height: S, transformOrigin: "top left", transform: `scale(${scale})` }}>
          <canvas ref={elRef} />
        </div>
        <div style={{ position: "absolute", inset: "5%", border: "1.5px dashed var(--volt-600)", borderRadius: 4, opacity: 0.5, pointerEvents: "none", zIndex: 2 }} />
      </div>
    </div>
  );
});

function keyOf(obj: unknown): CoverElementKey | null {
  const data = (obj as { data?: { key?: CoverElementKey } } | undefined)?.data;
  return data?.key ?? null;
}
function applyStyle(tb: Textbox, el: CoverElement): void {
  tb.set({
    text: el.text,
    fontFamily: el.fontFamily,
    fontWeight: el.fontWeight,
    fontSize: el.fontSize,
    fill: el.color,
    textAlign: el.textAlign,
    charSpacing: toCharSpacing(el.letterSpacing, el.fontSize),
  });
}
