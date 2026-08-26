export { stepDownload, type DownloadDeps } from "./download";
export { stepRender, type RenderDeps } from "./render";
export { stepAnalyze, type AnalyzeDeps } from "./analyze";
export { stepExtractEntities, type ExtractEntitiesDeps } from "./extract-entities";
export { stepReproduce, type ReproduceDeps } from "./reproduce";
export { stepCreateBook, type CreateBookDeps } from "./create-book";
export { normalizeRawData } from "./book-page-meta";
export {
  stepOneShot,
  type OneShotDeps,
  type OneShotPageResult,
  resolveBrand,
} from "./one-shot";
export {
  stepGenerateCover,
  type GenerateCoverDeps,
} from "./generate-cover";
export {
  stepFillInterior,
  planFillInterior,
  DEFAULT_TARGET_INTERIOR,
  type FillInteriorDeps,
  type FillInteriorPage,
  type FillTask,
} from "./fill-interior";
export { buildColoringStyleRowInput } from "./build-coloring-style-row-input";
export { upsertColoringStyleWithVariant, type UpsertColoringStyleResult } from "./upsert-coloring-style-with-variant";
export {
  buildColoringStyleVariant,
  paletteFingerprint,
  readVariants,
  type ColorPalette,
  type ColoringStyleVariant,
} from "./coloring-style-variant";
export {
  removeVariant,
  type RemoveVariantResult,
  type VariantMirror,
} from "./remove-coloring-style-variant";
export {
  planPageSelection,
  LANE1_MIN_INTERIOR,
  type SelectablePage,
  type PageSelection,
} from "./plan-page-selection";
