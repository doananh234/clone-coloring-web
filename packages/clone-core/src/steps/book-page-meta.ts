/**
 * Normalize a Prisma `Json` rawData value before it is stored on a book
 * coloringPage's `sceneData`.
 *
 * The worker create-book step persists the FULL per-page LLM output (so new
 * fields the model emits — e.g. titleCover/isCover/visualDna — are kept without
 * code changes). It used to do `sceneData: { ...p.rawData }`, which is safe when
 * rawData is an object but CORRUPTS it when rawData is a JSON *string*: spreading
 * a string yields `{ "0": "{", "1": "\"", … }` (numeric keys). That is exactly
 * the malformed sceneData seen on ~12 books.
 *
 * `normalizeRawData` keeps the full-passthrough behavior while making it safe:
 *   - object            → returned as-is (all fields preserved)
 *   - JSON string        → parsed back into its object
 *   - anything else/null → undefined (no sceneData, never a numeric-key blob)
 */
export function normalizeRawData(raw: unknown): Record<string, unknown> | undefined {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* not JSON → no sceneData */
    }
  }
  return undefined;
}
