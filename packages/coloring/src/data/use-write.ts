"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPut } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";
import { saveBookPatch, type BookPatch } from "./local-books";
import { saveEntityPatch } from "./local-entities";
import { toBookPayload, toEntityPayload } from "./api-payload";
import type { EntityRecord } from "./use-entity";

/**
 * Unified save. When COLORING_WRITE_ENABLED (staging only), PUTs the mapped
 * payload to the real API and invalidates caches; otherwise writes to the local
 * sandbox. Same call site either way — flipping the flag is the only change.
 */
export function useSaveBook(id: string): (patch: BookPatch) => Promise<void> {
  const qc = useQueryClient();
  return async (patch: BookPatch) => {
    if (COLORING_WRITE_ENABLED) {
      await httpPut(`${COLORING_API_BASE}/books/${encodeURIComponent(id)}`, toBookPayload(patch));
      qc.invalidateQueries({ queryKey: ["coloring", "book", id] });
      qc.invalidateQueries({ queryKey: ["coloring", "books"] });
    } else {
      saveBookPatch(id, patch);
    }
  };
}

export function useSaveEntity(kind: string, id: string): (patch: EntityRecord) => Promise<void> {
  const qc = useQueryClient();
  return async (patch: EntityRecord) => {
    if (COLORING_WRITE_ENABLED) {
      await httpPut(`${COLORING_API_BASE}/${kind}/${encodeURIComponent(id)}`, toEntityPayload(kind, patch));
      qc.invalidateQueries({ queryKey: ["coloring", "entity-one", kind, id] });
      qc.invalidateQueries({ queryKey: ["coloring", "entity", kind] });
    } else {
      saveEntityPatch(kind, id, patch);
    }
  };
}
