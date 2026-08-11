# D1 — Coloring Style: Manual + Hashtag Design

> Sub-project D of the "AI coloring book tools" epic (master spec `2026-08-09-ai-coloring-book-tools-design.md` §7, tasks **T-001/002**). The last of the four D-slices; D2/D3/D4 are done + merged/deployed. This slice adds hashtag entry with normalization + autocomplete to the style create/edit flows.

## 1. Goal

Operators can attach normalized hashtags when creating a coloring/art style from an image, and get autocomplete suggestions from existing tags so they reuse canonical tags instead of inventing near-duplicates. Tags are normalized consistently (client for live display, server on save). Style creation as "manual" and free-text tag search on the list already exist — this slice fills the missing tag-input + normalization + autocomplete.

## 2. Current state (verified against code 2026-08-11)

- `POST /api/coloring-styles` (route.ts:29,54,56) and `POST /api/art-styles` already accept + store `tags` and stamp `data.source = "manual"`.
- `PUT /api/coloring-styles/[id]` and `PUT /api/art-styles/[id]` write `tags` through the `...data` rest spread.
- List search already matches name + description + **tags** (`entity-list-screen.tsx:76`).
- `entity-edit-screen.tsx` has a raw comma-separated tags `Input` (trim only — no normalize, no autocomplete).
- `extract-style-screen.tsx` (the create/"manual style" screen, shared for `art-styles` + `coloring-styles`) has **no** tags input.
- `useStyleFromImage(kind).create(data)` forwards any fields in `data` to `POST /api/{kind}`.

So the remaining work is purely: a tag-input UI (create + edit), a normalization helper (client + server), and autocomplete.

## 3. Decisions (locked in brainstorming)

- **Tag input on Create AND Edit** — one shared `TagsInput` component; replace the edit screen's raw comma `Input` with it for consistency.
- **Normalize client + server** — one pure helper used both places: client normalizes as chips are added (live display), server normalizes on save (authoritative, covers direct API calls). Needs a `@vx/coloring/data/tags` subpath export for the routes (same pattern as D4b/D4c `data/*` exports).
- **Generic for both kinds** — the shared `extract-style-screen` and `entity-edit-screen` are `kind`-parameterized (`art-styles` | `coloring-styles`); the tag input applies to both, with per-kind autocomplete suggestions.
- **Preserve unicode** — normalization does NOT strip Vietnamese accents. It only lowercases, trims, strips leading `#`, turns whitespace/underscore runs into a single hyphen, collapses/‌trims hyphens. `"Trẻ Em" → "trẻ-em"`, `"#Bold Easy" → "bold-easy"`.
- **No backfill** — legacy un-normalized tags are left as-is; only create/edit-from-now normalize. (Autocomplete still displays legacy tags normalized via `collectTags`, but the stored rows are untouched until edited.)

## 4. Pure helpers — `packages/coloring/src/data/tags.ts` (unit-tested)

Pure module (no `"use client"`, no imports beyond nothing) so it is server-importable via a new `@vx/coloring/data/tags` subpath export.

```ts
/** Normalize one raw tag: trim, lowercase, strip leading '#', whitespace/underscore
 *  → single hyphen, collapse/trim hyphens. Preserves unicode letters (Vietnamese).
 *  Returns "" for a tag that normalizes to nothing. */
export function normalizeTag(raw: string): string;

/** Normalize a list: map normalizeTag, drop empties, dedupe preserving first-seen order. */
export function normalizeTags(list: string[]): string[];

/** Union of all tags across style rows, normalized, deduped, sorted — the autocomplete pool. */
export function collectTags(items: { tags?: string[] }[]): string[];
```

`normalizeTag` algorithm (exact):
```
s = raw.trim().toLowerCase()
s = s.replace(/^#+/, "")            // strip leading hash(es)
s = s.replace(/[\s_]+/g, "-")       // whitespace + underscore runs → single hyphen
s = s.replace(/-+/g, "-")           // collapse repeated hyphens
s = s.replace(/^-+|-+$/g, "")       // trim leading/trailing hyphens
return s
```
No `[^a-z0-9-]` stripping — unicode letters/digits pass through unchanged.

## 5. UI component — `packages/coloring/src/components/ui/tags-input.tsx`

Reusable chip input (presentational; suggestions passed in so it stays testable/decoupled):
- Props: `value: string[]`, `onChange: (tags: string[]) => void`, `suggestions?: string[]`, `disabled?: boolean`, `placeholder?: string`.
- Renders each tag as a chip with an ✕ remove button.
- Typing + **Enter** or **comma** → `normalizeTag(token)`; add if non-empty and not already present; clear the input. **Backspace** on an empty input removes the last chip.
- **Autocomplete:** a dropdown under the input listing `suggestions` filtered to (a) not-already-selected and (b) containing the current typed substring (compared on the normalized token); clicking a suggestion adds it. Hidden when the input is empty or no matches.
- All disabled when `disabled`.

## 6. Wiring

Suggestions come from `useEntityList(kind)` (already used across the coloring screens; fetches the full list) → `collectTags(items)`.

- **`extract-style-screen.tsx`** (Create): add `const [tags, setTags] = useState<string[]>([])`; fetch `useEntityList(kind)` for `suggestions = collectTags(items)`; render `<TagsInput value={tags} onChange={setTags} suggestions={suggestions} disabled={!svc.enabled || busy !== null} />` inside the analyze-result card (below the name field); pass `tags` into `svc.create({ ...result, name: name || result.name, referenceImageUrls: imgs, tags })`.
- **`entity-edit-screen.tsx`** (Edit): change the tags form state from a comma string to `string[]` (seed from `entity.tags`); replace the raw `<Input>` with `<TagsInput value={form.tags} onChange={(t) => setForm(...t)} suggestions={collectTags(items)} />`; on save send `tags: form.tags` (already an array — drop the `.split(",")`). Fetch `useEntityList(kind)` for suggestions.

## 7. Server-side normalization (authoritative)

Apply `normalizeTags(tags)` (imported from `@vx/coloring/data/tags`) immediately before persisting, at 4 sites:
- `POST /api/coloring-styles` — normalize `tags` before `prisma.coloringStyle.create` (`tags: normalizeTags(tags || [])`).
- `POST /api/art-styles` — same for `prisma.artStyle.create`.
- `PUT /api/coloring-styles/[id]` — if `data.tags` is an array, replace with `normalizeTags(data.tags)` before update.
- `PUT /api/art-styles/[id]` — same.

`@vx/coloring` is already a workspace dep of `apps/admin`; `tags.ts` is pure (safe to import into a server route).

## 8. Testing & gate

- **`packages/coloring/src/data/tags.test.ts`** (Vitest):
  - `normalizeTag`: `"#Bold Easy"→"bold-easy"`, `"  UPPER  "→"upper"`, `"a  b"→"a-b"`, `"foo_bar"→"foo-bar"`, `"Trẻ Em"→"trẻ-em"` (unicode preserved), `"#"→""`, `"--x--"→"x"`.
  - `normalizeTags`: dedupe preserving order, drop empties (e.g. `["#A","a","","B"]→["a","b"]`).
  - `collectTags`: union across items, normalized, deduped, sorted; handles missing `tags`.
- **Server routes:** no route test harness — a written reasoning check in the commit body (like D4c): each of the 4 sites normalizes tags before persist; PUT only when `tags` present.
- **UI:** no unit test for `TagsInput` (consistent with the other presentational UI components here — e.g. the D4b/D4c grids shipped without one); covered by typecheck + manual.
- **Gate:** `cd apps/admin && yarn typecheck` (baseline `.next/dev/types/routes.d.ts` noise — judge by delta); `cd packages/coloring && yarn vitest run src/data/tags.test.ts` + full `yarn test` green.
- **Manual (dev/staging write):** create a style from an image → add hashtags (chips, Enter/comma, ✕ remove); autocomplete suggests existing tags; created row stores normalized `tags` + `data.source="manual"`; edit a style's tags via the same input; list search finds it by tag.

## 9. Task mapping

| Task | Covered by |
|---|---|
| T-001 Manual Style Name + Hashtag | tag input on create (§5/§6) + create already stamps `source="manual"` + AI-derived directive (existing analyze→create) |
| T-002 Search Style theo Hashtag | list free-text search already matches tags (§2) + **normalize** (§4/§7) + **autocomplete** (§5) close the remaining gap |

## 10. File structure

**Create:**
- `packages/coloring/src/data/tags.ts` — pure helpers.
- `packages/coloring/src/data/tags.test.ts` — unit tests.
- `packages/coloring/src/components/ui/tags-input.tsx` — chip input with autocomplete.

**Modify:**
- `packages/coloring/package.json` — `./data/tags` subpath export.
- `packages/coloring/src/screens/hubs/extract-style-screen.tsx` — tags input on create.
- `packages/coloring/src/screens/entity/entity-edit-screen.tsx` — replace comma input with `TagsInput`.
- `apps/admin/src/app/api/coloring-styles/route.ts` — normalize tags on POST.
- `apps/admin/src/app/api/art-styles/route.ts` — normalize tags on POST.
- `apps/admin/src/app/api/coloring-styles/[id]/route.ts` — normalize tags on PUT.
- `apps/admin/src/app/api/art-styles/[id]/route.ts` — normalize tags on PUT.

## 11. Risks / notes

- **Shared screens touch both kinds:** the generic tag input changes the art-styles create/edit flow too (they already have a `tags` field, so this is additive/consistent, not a behavior break).
- **Legacy tags un-normalized:** search is substring so legacy `Bold Easy` and new `bold-easy` won't cross-match. Acceptable — no backfill in scope; tags converge as rows are edited. (A one-off normalize-all backfill is a possible future follow-up, out of scope.)
- **Autocomplete pool is per-kind and client-derived** from the already-loaded list — no new endpoint, no extra fetch.
