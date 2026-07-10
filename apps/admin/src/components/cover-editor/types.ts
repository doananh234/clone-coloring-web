import type { FabricSceneJSON, StyleFilter } from "@vx/server-core/text-overlay";

export type SlotName = "title" | "subtitle" | "brand";

export interface SlotState {
  text: string;
  fontFamily: string;
  color: string;
  fontSize: number;
}

export interface CoverEditorInitialState {
  bookId: string;
  backgroundUrl: string;
  scene?: FabricSceneJSON;
  slots: Record<SlotName, SlotState>;
  filter: StyleFilter;
}

export interface CoverEditorSaveResult {
  coverUrl: string;
  scene: FabricSceneJSON;
  filter: StyleFilter;
}

export interface CoverEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialState: CoverEditorInitialState;
  onSave: (result: CoverEditorSaveResult) => Promise<void>;
}

export const DEFAULT_SLOT_STATE: Record<SlotName, SlotState> = {
  title: { text: "", fontFamily: "Fredoka", color: "#ffffff", fontSize: 72 },
  subtitle: { text: "", fontFamily: "Inter", color: "#f5f5f5", fontSize: 32 },
  // Cozy handwritten script matches the KDP-style "small signature at the
  // bottom" convention. Bumped up from 24 → 34 because handwritten scripts
  // need a bit more room than a clean sans to stay readable at thumbnail size.
  brand: { text: "", fontFamily: "Caveat", color: "#2d2a3d", fontSize: 34 },
};
