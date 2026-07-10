"use client";
import React, { useEffect, useRef, useState } from "react";
import * as fabric from "fabric";
import type { FabricSceneJSON, StyleFilter } from "@vx/server-core/text-overlay";
import type { SlotName, SlotState } from "./types";

interface CanvasEditorProps {
  backgroundUrl: string;
  initialScene?: FabricSceneJSON;
  slots: Record<SlotName, SlotState>;
  onSlotUpdate: (slot: SlotName, patch: Partial<SlotState>) => void;
  onSceneChange: (scene: FabricSceneJSON) => void;
  filter: StyleFilter;
  /**
   * When true, hide all text layers so the canvas shows only the clean
   * illustration. Used when the AI tab is active — the model receives the
   * clean image as input, and matching what's on screen keeps the user
   * from thinking their text was destroyed.
   */
  hideText?: boolean;
  /**
   * Parent-owned ref. Once the Fabric canvas is ready, we set
   * `exportRef.current` to a function returning the current canvas backstore
   * as a base64 PNG data URL (always at the 1024x1024 native resolution,
   * regardless of the CSS scale). Undoes any active selection first so
   * transform handles don't get baked into the export.
   *
   * Enables WYSIWYG saves: the exported PNG is exactly what the user sees
   * on screen, with real Google Fonts, no server-side canvas rebuild.
   */
  exportRef?: React.MutableRefObject<(() => string) | null>;
}

const SLOT_ORDER: SlotName[] = ["title", "subtitle", "brand"];

// Approximate CSS filter values kept in sync with fabric-scene-renderer.ts.
const CSS_FILTERS: Record<StyleFilter, string> = {
  none: "none",
  vintage: "sepia(0.3) saturate(0.8) contrast(0.9)",
  warm: "saturate(1.15) brightness(1.05) sepia(0.1)",
  cool: "saturate(1.1) hue-rotate(-15deg)",
  monochrome: "grayscale(1)",
  sepia: "sepia(1)",
  pastel: "saturate(0.7) brightness(1.1) contrast(0.95)",
};

/**
 * Rewrites remote image URLs to go through our same-origin proxy so
 * Fabric.js can draw them onto the canvas without tainting it.
 * Same-origin (starts with "/") and data: URLs pass through unchanged.
 */
function toProxiedUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("/") || url.startsWith("data:") || url.startsWith("blob:")) return url;
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

export function CanvasEditor({
  backgroundUrl,
  initialScene,
  slots,
  onSlotUpdate,
  onSceneChange,
  filter,
  hideText = false,
  exportRef,
}: CanvasEditorProps) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const slotObjRef = useRef<Record<SlotName, fabric.Textbox | null>>({
    title: null,
    subtitle: null,
    brand: null,
  });
  const bgObjRef = useRef<fabric.Image | null>(null);
  const [ready, setReady] = useState(false);
  const [scale, setScale] = useState<number>(1);

  // 0. Observe wrapper dimensions and calculate scale factor.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      if (width > 0) setScale(width / 1024);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 1. Initialize Fabric canvas once.
  useEffect(() => {
    if (!canvasElRef.current) return;
    const canvas = new fabric.Canvas(canvasElRef.current, {
      width: 1024,
      height: 1024,
      backgroundColor: "#ffffff",
      preserveObjectStacking: true,
    });
    canvasRef.current = canvas;

    // Expose the export function to the parent via ref. Returns the current
    // backstore as a base64 PNG data URL at 1024x1024 — enabling WYSIWYG save
    // (parent posts the bytes; no server-side scene rebuild + font fetch).
    if (exportRef) {
      exportRef.current = () => {
        const c = canvasRef.current;
        if (!c) return "";
        // Discard active selection so transform handles aren't baked in.
        c.discardActiveObject();
        c.renderAll();
        return c.toDataURL({
          format: "png",
          quality: 1,
          multiplier: 1,
        });
      };
    }

    setReady(true);

    // Emit scene whenever anything changes.
    const emit = () => onSceneChange(canvas.toJSON() as FabricSceneJSON);
    canvas.on("object:modified", emit);
    canvas.on("object:added", emit);
    canvas.on("object:removed", emit);

    // Sync text edits back into slot state so React inputs update.
    canvas.on("text:changed", (e) => {
      const target = e.target;
      if (!target || target.type !== "textbox") return;
      const slot = (target as fabric.Object & { data?: { slot?: SlotName } }).data?.slot;
      if (slot) {
        onSlotUpdate(slot, { text: (target as fabric.Textbox).text ?? "" });
      }
    });

    return () => {
      canvas.dispose();
      canvasRef.current = null;
      if (exportRef) exportRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2 + 3. Initialize canvas contents: SEQUENTIALLY load the scene (or create
  // fresh text slots), strip any stale background image serialized in the
  // saved scene JSON, then load the CURRENT backgroundUrl as the fresh
  // bottom layer. Merging these into one effect avoids the two-effect race
  // where both the scene JSON's embedded bg and a fresh URL bg were added
  // to the canvas, producing two overlapping backgrounds.
  useEffect(() => {
    if (!ready || !canvasRef.current) return;
    const canvas = canvasRef.current;
    let cancelled = false;

    const initialize = async () => {
      // A. Load saved scene JSON if present (text positions/styles), or
      //    create fresh default textboxes.
      if (initialScene?.objects?.length) {
        await canvas.loadFromJSON(initialScene as unknown as fabric.CanvasOptions);
        if (cancelled) return;
        // Recapture per-slot textbox refs by their data.slot tag.
        for (const obj of canvas.getObjects()) {
          const s = (obj as fabric.Object & { data?: { slot?: SlotName } }).data?.slot;
          if (s && obj.type === "textbox") {
            slotObjRef.current[s] = obj as fabric.Textbox;
          }
        }
        // Strip any image objects the saved scene brought along — they're a
        // stale coverUrl from a previous save that we do NOT want composited
        // on top of the fresh clean illustration.
        const staleImages = canvas
          .getObjects()
          .filter((o) => o.type === "image");
        for (const img of staleImages) canvas.remove(img);
      } else {
        const positions: Record<SlotName, { top: number; textAlign: string }> = {
          title: { top: 100, textAlign: "center" },
          subtitle: { top: 850, textAlign: "center" },
          brand: { top: 940, textAlign: "center" },
        };
        for (const slot of SLOT_ORDER) {
          const state = slots[slot];
          const tb = new fabric.Textbox(state.text || "", {
            left: 512,
            top: positions[slot].top,
            originX: "center",
            originY: "center",
            width: 900,
            fontFamily: state.fontFamily,
            fill: state.color,
            fontSize: state.fontSize,
            textAlign: positions[slot].textAlign as fabric.Textbox["textAlign"],
            editable: true,
          });
          (tb as fabric.Object & { data?: { slot?: SlotName } }).data = { slot };
          canvas.add(tb);
          slotObjRef.current[slot] = tb;
        }
      }

      // B. Load the CURRENT backgroundUrl as the (single) bottom layer.
      if (backgroundUrl) {
        try {
          const img = await fabric.Image.fromURL(toProxiedUrl(backgroundUrl), {
            crossOrigin: "anonymous",
          });
          if (cancelled) return;
          const el = img.getElement() as HTMLImageElement | undefined;
          if (el && !el.complete) {
            await new Promise<void>((resolve, reject) => {
              el.onload = () => resolve();
              el.onerror = () => reject(new Error("bg image failed to load"));
            });
          }
          if (cancelled) return;
          const rawW = el?.naturalWidth || (img.width as number) || 1;
          const rawH = el?.naturalHeight || (img.height as number) || 1;
          if (rawW < 2 || rawH < 2) {
            console.warn("[CoverEditor] bg image has no dimensions after load", { rawW, rawH });
          } else {
            if (bgObjRef.current) canvas.remove(bgObjRef.current);
            const s = Math.max(1024 / rawW, 1024 / rawH);
            img.set({
              left: 0,
              top: 0,
              originX: "left",
              originY: "top",
              scaleX: s,
              scaleY: s,
              selectable: false,
              evented: false,
            });
            canvas.add(img);
            canvas.sendObjectToBack(img);
            bgObjRef.current = img;
          }
        } catch (err) {
          console.error("[CoverEditor] bg image load failed:", err);
        }
      }

      if (!cancelled) canvas.requestRenderAll();
    };

    initialize();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, backgroundUrl]);

  // 3b. Toggle text-layer visibility when the AI tab is opened / left.
  //     Hides all slot textboxes so the user sees the clean illustration
  //     that will be handed to the image-edit model. Does NOT clear their
  //     text state — flipping the flag off restores them exactly.
  useEffect(() => {
    if (!ready || !canvasRef.current) return;
    let anyChange = false;
    for (const slot of SLOT_ORDER) {
      const obj = slotObjRef.current[slot];
      if (!obj) continue;
      const shouldBeVisible = !hideText;
      if (obj.visible !== shouldBeVisible) {
        obj.set({ visible: shouldBeVisible });
        anyChange = true;
      }
    }
    if (anyChange) canvasRef.current.requestRenderAll();
  }, [hideText, ready]);

  // 4. Sync React slot state → Fabric objects.
  useEffect(() => {
    if (!ready) return;
    for (const slot of SLOT_ORDER) {
      const obj = slotObjRef.current[slot];
      if (!obj) continue;
      const state = slots[slot];
      let dirty = false;
      if (obj.text !== state.text) {
        obj.set({ text: state.text });
        dirty = true;
      }
      if (obj.fontFamily !== state.fontFamily) {
        obj.set({ fontFamily: state.fontFamily });
        dirty = true;
      }
      if (obj.fill !== state.color) {
        obj.set({ fill: state.color });
        dirty = true;
      }
      if (obj.fontSize !== state.fontSize) {
        obj.set({ fontSize: state.fontSize });
        dirty = true;
      }
      if (dirty) canvasRef.current?.requestRenderAll();
    }
  }, [slots, ready]);

  return (
    <div
      ref={wrapperRef}
      className="relative aspect-square w-full max-h-full max-w-[min(100%,720px)] overflow-hidden"
    >
      <div
        style={{
          width: 1024,
          height: 1024,
          transformOrigin: "top left",
          transform: `scale(${scale})`,
          transition: "transform 60ms linear",
        }}
      >
        <canvas
          ref={canvasElRef}
          className="rounded-lg border shadow-sm"
          style={{ filter: CSS_FILTERS[filter] }}
          data-testid="cover-editor-canvas"
        />
      </div>
    </div>
  );
}
