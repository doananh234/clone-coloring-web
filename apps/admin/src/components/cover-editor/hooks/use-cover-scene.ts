"use client";
import { useState, useCallback } from "react";
import type { FabricSceneJSON, StyleFilter } from "@vx/server-core/text-overlay";
import type { CoverEditorInitialState, SlotName, SlotState } from "../types";

export function useCoverScene(initial: CoverEditorInitialState) {
  const [scene, setScene] = useState<FabricSceneJSON | undefined>(initial.scene);
  const [slots, setSlots] = useState<Record<SlotName, SlotState>>(initial.slots);
  const [filter, setFilter] = useState<StyleFilter>(initial.filter);

  const setSlotText = useCallback((slot: SlotName, text: string) => {
    setSlots((prev) => ({ ...prev, [slot]: { ...prev[slot], text } }));
  }, []);

  const setSlotStyle = useCallback(
    (slot: SlotName, patch: Partial<Omit<SlotState, "text">>) => {
      setSlots((prev) => ({ ...prev, [slot]: { ...prev[slot], ...patch } }));
    },
    [],
  );

  return {
    scene,
    setScene,
    slots,
    setSlotText,
    setSlotStyle,
    filter,
    setFilter,
    backgroundUrl: initial.backgroundUrl,
    bookId: initial.bookId,
  };
}
