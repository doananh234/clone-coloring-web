"use client";
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@vx/core-uikit/components";
import { Button } from "@vx/core-uikit/components";
import { cn } from "@vx/core-uikit/utils";
import { useCoverScene } from "./hooks/use-cover-scene";
import { useGoogleFonts } from "./hooks/use-google-fonts";
import { CanvasEditor } from "./canvas-editor";
import { ControlPanel, type Tab } from "./control-panel/control-panel";
import type { CoverEditorProps } from "./types";

export function CoverEditorModal(props: CoverEditorProps) {
  const scene = useCoverScene(props.initialState);
  const families = React.useMemo(
    () => Object.values(scene.slots).map((s) => s.fontFamily),
    [scene.slots],
  );
  useGoogleFonts(families);

  const [saving, setSaving] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>("text");
  // Populated by CanvasEditor on mount. Returns the current backstore as a
  // base64 PNG data URL — used by Save to send the WYSIWYG bytes straight
  // to the server (no scene JSON round-trip, no server-side font fetching).
  const canvasExportRef = React.useRef<(() => string) | null>(null);
  // Populated by the AI panel when the user accepts a generated cover preview.
  // When set, Save Cover skips the raw scene-export round-trip and persists
  // this url directly.
  const [aiCoverUrl, setAiCoverUrl] = React.useState<string | null>(null);

  async function handleSave() {
    if (!scene.scene) {
      alert("Scene not initialized yet — try again in a moment.");
      return;
    }
    setSaving(true);
    try {
      // Short-circuit: an AI-blended cover was accepted from the AI panel.
      // Skip re-rendering the raw scene — persist the already-uploaded URL.
      if (aiCoverUrl) {
        await props.onSave({
          coverUrl: aiCoverUrl,
          scene: scene.scene,
          filter: scene.filter,
        });
        props.onOpenChange(false);
        return;
      }

      // Client-side render → send the raw PNG bytes. What the user sees on the
      // canvas (real Google Fonts, real filter, real positions) becomes the
      // saved cover, byte-for-byte. Fixes the tofu-text problem where the
      // server @napi-rs/canvas couldn't load the font and rendered replacement
      // glyphs.
      const exportFn = canvasExportRef.current;
      if (!exportFn) {
        throw new Error("Canvas not ready — try again in a moment.");
      }
      const dataUrl = exportFn();
      if (!dataUrl) {
        throw new Error("Canvas export returned no data.");
      }
      const res = await fetch("/api/generate/cover-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: props.initialState.bookId,
          imageBase64: dataUrl,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Export failed (${res.status})`);
      }
      const { url } = (await res.json()) as { url: string; base64: string };
      await props.onSave({
        coverUrl: url,
        scene: scene.scene,
        filter: scene.filter,
      });
      props.onOpenChange(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className={cn("!max-w-6xl w-[95vw] h-[90vh] p-0 flex flex-col")}>
        <DialogHeader className="border-b p-4">
          <DialogTitle>Edit Cover</DialogTitle>
        </DialogHeader>
        <div className="flex-1 grid grid-cols-12 overflow-hidden min-h-0">
          <div className="col-span-7 border-r bg-muted/20 flex items-center justify-center p-6 min-h-0 min-w-0">
            <CanvasEditor
              backgroundUrl={scene.backgroundUrl}
              initialScene={props.initialState.scene}
              slots={scene.slots}
              onSlotUpdate={(slot, patch) => {
                if (patch.text !== undefined) scene.setSlotText(slot, patch.text);
                const { text: _t, ...styleOnly } = patch;
                if (Object.keys(styleOnly).length > 0) scene.setSlotStyle(slot, styleOnly);
              }}
              onSceneChange={scene.setScene}
              filter={scene.filter}
              hideText={tab === "ai"}
              exportRef={canvasExportRef}
            />
          </div>
          <div className="col-span-5 overflow-y-auto min-h-0">
            <ControlPanel
              slots={scene.slots}
              onSlotText={scene.setSlotText}
              onSlotStyle={scene.setSlotStyle}
              filter={scene.filter}
              onFilterChange={scene.setFilter}
              bookId={props.initialState.bookId}
              backgroundImageUrl={props.initialState.backgroundUrl}
              aiCoverUrl={aiCoverUrl}
              onAiCoverAccept={setAiCoverUrl}
              tab={tab}
              onTabChange={setTab}
            />
          </div>
        </div>
        <div className="border-t p-3 flex justify-end gap-2">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : aiCoverUrl ? "Save AI Cover" : "Save Cover"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
