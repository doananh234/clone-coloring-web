"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpGet, httpPost, httpPatch, httpDel } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";
import type { SourceCover, TitleSafePosition } from "./source-covers";
import type { ImageProvider } from "../components/provider-select";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

/** On-demand B&W source-cover actions (gen / colorize / public / delete). */
export function useSourceCovers(bookId: string) {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
  const base = `${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}/source-covers`;
  const guard = () => { if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY); };

  return {
    enabled: COLORING_WRITE_ENABLED,
    gen: async (
      interiorPageId: string,
      titleSafe: TitleSafePosition,
      promptOverride?: string,
      provider?: ImageProvider,
    ) => {
      guard();
      // A non-empty promptOverride lets operators tune the prompt in the dialog
      // without a redeploy; omit it (undefined) to use the server default.
      // provider: operator-chosen backend; omit → worker's IMAGE_PROVIDER default.
      // Runs in the background now — returns a GenerationJob id; progress is
      // tracked in the header queue drawer (["coloring","generation-jobs"]).
      const res = await httpPost<{ jobId?: string }>(base, {
        interiorPageId, titleSafe, prompt: promptOverride?.trim() || undefined, provider,
      });
      qc.invalidateQueries({ queryKey: ["coloring", "generation-jobs"] });
      return res;
    },
    /** Built-in default prompt for a position — used to prefill the editable box. */
    defaultPrompt: async (titleSafe: TitleSafePosition): Promise<string> => {
      const res = await httpGet<{ prompt: string }>(
        `${COLORING_API_BASE}/cover-prompt?titleSafe=${titleSafe}`,
      );
      return res.prompt;
    },
    colorize: async (sc: SourceCover, styleId: string, variantId?: string | null) => {
      guard();
      await httpPost(`${COLORING_API_BASE}/coloring-styles/colorize`, {
        imageUrl: sc.url, coloringStyleId: styleId, coloringVariantId: variantId ?? undefined,
        bookId, pageId: sc.id, target: "sourceCover",
      });
      inval();
    },
    togglePublic: async (scId: string) => {
      guard();
      await httpPatch(base, { scId });
      inval();
    },
    remove: async (scId: string) => {
      guard();
      await httpDel(`${base}/${encodeURIComponent(scId)}`);
      inval();
    },
  };
}
