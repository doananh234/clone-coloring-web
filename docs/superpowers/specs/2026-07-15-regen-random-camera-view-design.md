# Regen with Random Camera View — Design

**Date:** 2026-07-15
**Status:** Approved (user confirmed)
**Scope:** Clone page → "Reproduce Book" step (step index 4)

## Problem

The per-page "Regenerate with AI" on the Reproduce Book step always uses
`buildRedesignPrompt(30)` — a ~30% variation where "viewing angle" is only a
MAY-CHANGE item, so the model rarely commits to a real camera change. The user
wants a one-click way to regenerate a page from a *different* camera view,
with no manual view selection (random, just guaranteed different from the
current view).

## Decisions (from brainstorming)

- **No dropdown / no user control.** One extra per-page button: **"New Angle"**.
  It picks a random camera view different from the page's current view.
- **Reframe, keep scene.** Same scene, characters, props, line-art rules;
  only composition/framing changes to fit the new angle. The rest of the
  existing ~30% template applies unchanged.
- "Regenerate All" keeps today's behavior (same view).

## Design

### 1. Prompt layer — `packages/server-core/src/ai/prompts/redesign-prompts.ts`

```ts
buildRedesignPrompt(changePercent: number, opts?: { cameraView?: string })
```

When `opts.cameraView` is set, append a required block:

- "REQUIRED: Redraw this exact scene from a **{view}** camera view
  (short parenthetical explaining the view, e.g. bird's-eye = looking down
  from above). The composition and framing MUST change to fit the new angle."
- Remove "viewing angle" from the MAY-CHANGE list in this mode (it is now
  required, not optional). KEEP and DO-NOT rules unchanged.

Without `opts`, output is byte-identical to today's prompt.

### 2. API — `apps/admin/src/app/api/clone/[jobId]/reproduce/route.ts`

- Body accepts optional `newAngle?: boolean` alongside `pageIndex`.
- Allowlist: `close-up | medium | wide | bird's-eye | low-angle`.
- When `newAngle` is true:
  - Read current view from `jobPage.rawData?.scene?.cameraView`, normalize
    (lowercase, map close synonyms like "top-down" → "bird's-eye",
    "eye-level" → "medium"; unknown/empty → treated as not in list).
  - Pick a random view from the allowlist excluding the normalized current.
  - Pass it to `buildRedesignPrompt(30, { cameraView })` in `reproducePage`.
  - On success, persist the chosen view back to
    `jobPage.rawData.scene.cameraView` (in the same `cloneJob.pages` update
    that already writes `reproducedUrl`) so a second click excludes it.
  - Include `cameraView` in the per-page result object of the response.
- Without `newAngle`, behavior is unchanged.

### 3. UI — `apps/admin/src/components/clone-reproduce-step.tsx`

- `regeneratePage(pageIndex, opts?: { newAngle?: boolean })` — passes
  `newAngle` through to the API; on success with a `cameraView` in the
  result, toast "Regenerated with {view} view".
- `ReproducePageRow`: one extra icon button ("New Angle", camera/rotate
  icon) next to the existing Regenerate button, same disabled/generating
  states, calling `onRegenerate` variant with `newAngle: true`.
- Result display/persistence rides the existing `reproducedUrl` flow
  (override → reproducedUrl → redesignedUrl → original), so it survives
  reload.

## Error handling

- Page with no `rawData.scene.cameraView`: treat current view as unknown —
  pick randomly from the full allowlist.
- API validates `pageIndex` exactly as today; `newAngle` is boolean-coerced.
- Failures follow the existing per-page error path (status "error", toast).

## Testing

- No route-test infra exists in `apps/admin`; prompt builder is pure and
  lives in `server-core` — add a unit test for `buildRedesignPrompt` with and
  without `cameraView` (default output unchanged; camera block present and
  MAY-CHANGE "viewing angle" line removed when set).
- Manual verification on a real job: click New Angle twice on one page —
  second regen must use a different view than the first (persisted
  `cameraView` excluded), and the image must visibly change (cache-buster
  `?v=` already in place from the reproduce fix).

## Out of scope

- No changes to `redesign-page` route, the worker pipeline, or Regenerate All.
- No DB schema changes (`cameraView` already lives in `rawData.scene`).
