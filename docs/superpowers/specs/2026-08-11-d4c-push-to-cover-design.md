# D4c — Push to Cover (`coverCandidates[]`) Design

> Slice 3/3 of **D4 — Book Non-destructive** (master spec `2026-08-09-ai-coloring-book-tools-design.md` §6, tasks **T-015/016/017**). D4a (ordering + Number/Background) and D4b (Regen Thêm `variants[]`) are done + merged. This slice adds non-destructive cover candidates.

## 1. Goal

After colorizing an interior page, the operator can **Push to Cover**: the page's colored image becomes a new cover candidate and is auto-selected as the live cover (`coverUrl`), while the previous cover and every other candidate are preserved. The operator can browse candidates, switch the live one, delete non-selected ones, and open any candidate as the background in the existing Cover editor.

## 2. Decisions (locked in brainstorming)

- **Replace the old "Làm bìa" button.** The current per-page "Làm bìa" (`usePageActions.setCover` → `PUT { coverUrl }`, destructive, no history) is removed and replaced by **"Push to Cover"** (non-destructive superset — it auto-sets `coverUrl` too, so nothing is lost). "Set thumbnail" / "Set vuông" stay untouched.
- **Candidate grid lives in Book detail.** A "Cover candidates" strip is added to the Cover section of `book-detail-screen.tsx` (next to the existing `coverVersions`). No candidate UI inside the Cover editor screen.
- **Cover-editor entry is in scope.** Each candidate has an "Mở trong Cover editor" action → sets `coverMeta.sourceThumbnailUrl` (via existing `useSaveCover.saveCoverSource`) then navigates to `/books/[bookId]/cover`.
- **Push reuses `coloredUrl` — no new image.** Push-to-Cover does NOT call AI or upload to R2; the candidate `url` points at the page's existing `coloredUrl`. (Master spec didn't specify; reusing the already-rendered colored image is cheaper and correct.)
- **Selection tracked by id, not by URL.** Add `book.data.selectedCoverCandidateId`. `coverUrl` still mirrors the selected candidate's url for backward compat, but selection state is authoritative via id (avoids fragile URL matching when `?v=` cache-bust suffixes differ). This is a deliberate refinement of the master spec, which used `coverUrl` alone as the pointer.

## 3. Data model (JSON extension, backward-compatible)

```ts
// packages/coloring/src/data/types.ts
/** D4c: a non-destructive cover candidate. Lives in book.data.coverCandidates[]. */
export interface CoverCandidate {
  id: string;
  url: string;                 // points at an interior page's coloredUrl (no copy made)
  origin: "source" | "pushed"; // "source" = the cover that existed before the first push
  fromPageId?: string;         // interior page id when origin:"pushed"
  createdAt: string;
}
```

Storage:
- `book.data.coverCandidates?: CoverCandidate[]` — the list.
- `book.data.selectedCoverCandidateId?: string` — id of the live candidate.
- `book.coverUrl` (column) — **mirrors** the selected candidate's `url` (list/thumbnail/PDF/exports keep reading this).

**Mirror invariant (soft):** `push`/`select` set `coverUrl = selectedCandidate.url` (a raw colored image, no text). When the operator later composes text in the Cover editor, that flow overwrites `coverUrl` with the text-composed image and sets `coverMeta.sourceThumbnailUrl` to the candidate — at which point `coverUrl` no longer equals any candidate url, but `selectedCoverCandidateId` still points at the background candidate. Consumers that need "which candidate is active" read the id; consumers that need "the cover image" read `coverUrl`. No conflict.

**Legacy books:** `coverCandidates`/`selectedCoverCandidateId` stay `undefined` until the first push. No backfill. Books that never push keep behaving exactly as today.

## 4. Pure helpers — `packages/coloring/src/data/cover-candidates.ts` (unit-tested)

Mirrors `page-variants.ts`. Operates on an abstract state so the route can map it onto the column + JSON blob:

```ts
export interface CoverState {
  coverUrl?: string;
  coverCandidates?: CoverCandidate[];
  selectedCoverCandidateId?: string;
}
```

Functions:
- `ensureSourceCandidate(state, newId: () => string, now: string): { state: CoverState; sourceId?: string }`
  Seed an `origin:"source"` candidate from `coverUrl` iff the list is empty **and** `coverUrl` is set; select it. No-op (returns existing source id, or `undefined` when there was no coverUrl to seed) otherwise.
- `addCandidate(state, incoming: CoverCandidate): CoverState`
  Append. **Dedupe by url:** if a candidate with the same `url` already exists, return state unchanged (the caller then selects that existing candidate instead of adding a duplicate).
- `selectCandidate(state, id: string): CoverState`
  Set `selectedCoverCandidateId = id` and mirror `coverUrl = candidate.url`. Throws if `id` is unknown.
- `deleteCandidate(state, id: string): CoverState`
  Remove the candidate. **Refuses the currently-selected candidate** (throws). A non-selected `origin:"source"` candidate MAY be deleted (it is just history). Throws if `id` is unknown.

Push composition (done in the route, not a single helper): `ensureSourceCandidate → addCandidate(pushed) → selectCandidate(pushed.id)`. If `addCandidate` deduped (url already present), select the pre-existing candidate with that url.

## 5. Routes (atomic — not the generic PUT read-modify-write)

The generic `PUT /api/books/[bookId]` does a non-atomic read-modify-write on `book.data`. Cover candidate mutations get their own routes (parallel to D4b's variants routes) that read the book, run the pure helper, and write back `{ coverUrl, data: { ...curData, coverCandidates, selectedCoverCandidateId } }` in one `prisma.book.update`.

- **`POST /api/books/[bookId]/cover-candidates`** — body `{ url: string; fromPageId?: string }`. Push: seed source, add `{ origin:"pushed", url, fromPageId }` (deduped), auto-select. Pure DB — no AI, no R2. Returns `{ success, selectedCoverCandidateId }`.
- **`PATCH /api/books/[bookId]/cover-candidates`** — body `{ candidateId: string }`. Select + mirror `coverUrl`. Helper throws → 400 on unknown id.
- **`DELETE /api/books/[bookId]/cover-candidates/[candidateId]`** — delete; helper throws → 400 when the id is selected/unknown.

All mutations behind `COLORING_WRITE_ENABLED`. Add a `./data/cover-candidates` subpath export to `packages/coloring/package.json` so the routes can import the pure helpers + `CoverCandidate` type server-side (exactly as `./data/page-variants` was added in D4b). The helper file only imports the pure-interface `./types`, so it is server-safe.

## 6. Client hook — `packages/coloring/src/data/use-cover-candidates.ts`

```ts
useCoverCandidates(bookId) → {
  enabled: boolean;
  push(pageId: string, coloredUrl: string): Promise<void>;   // POST
  select(candidateId: string): Promise<void>;                // PATCH
  remove(candidateId: string): Promise<void>;                // DELETE
}
```

Guards on `COLORING_WRITE_ENABLED`, invalidates `["coloring", "book", bookId]` after each mutation. Uses `httpPost`/`httpPatch`/`httpDel` from `@vx/core-uikit/api`.

## 7. UI

### 7.1 `page-actions-row.tsx` — replace "Làm bìa"
In the `{colored && (…)}` block, replace the `setCover` button with:
```tsx
<Button variant="outline" size="sm" disabled={disabled || busy !== null}
  title="Đẩy bản màu này thành ứng viên bìa và chọn làm bìa chính (giữ bìa cũ)"
  onClick={run("push", () => coverCandidates.push(page.id, colored!))}>
  <Icon name="image" size={15} /> {busy === "push" ? "Đang đẩy…" : "Push to Cover"}
</Button>
```
"Set thumbnail" / "Set vuông" remain. Add `const coverCandidates = useCoverCandidates(bookId);`. `usePageActions.setCover` becomes unused by this component (leave the hook method in place — it's a thin helper; removing it is out of scope).

### 7.2 `book-detail-screen.tsx` — Cover candidates strip
In the Cover section (near `coverVersions`, ~line 428), add a "Cover candidates" strip rendered when `b.data?.coverCandidates?.length`:
- grid of candidate thumbnails (reuse the `coverVersions` thumbnail style);
- click a non-selected candidate → `coverCandidates.select(id)` (mirrors `coverUrl`);
- selected candidate shows a check badge; origin badge shows **Nguồn** (`source`) / **Push** (`pushed`);
- non-selected candidate shows an ✕ delete button → `coverCandidates.remove(id)`;
- each candidate shows an **"Mở trong Cover editor"** action → `saveCover.saveCoverSource(candidate.url, coverMetaObj)` then `router.push(`${B}/books/${bookId}/cover`)` (reuses existing `useSaveCover`).

Selection uses `b.data.selectedCoverCandidateId`. All actions behind the write flag (disabled + hint when off, like the rest of the screen).

## 8. Tests & verification gate

- **`packages/coloring/src/data/cover-candidates.test.ts`** (Vitest, pure helpers):
  - `ensureSourceCandidate`: seeds source from `coverUrl` + selects when list empty; no-op when a candidate already exists; no seed (sourceId `undefined`) when `coverUrl` absent.
  - `addCandidate`: appends; dedupes by url (no duplicate).
  - `selectCandidate`: sets id + mirrors `coverUrl`; throws on unknown id.
  - `deleteCandidate`: removes non-selected; refuses selected (throws); allows non-selected source.
- **Typecheck gate:** `cd apps/admin && yarn typecheck` (baseline may show `.next/dev/types/routes.d.ts` noise — judge by delta). Coloring tests: `cd packages/coloring && yarn vitest run src/data/cover-candidates.test.ts`, plus full `yarn test` green.
- **Manual verify (dev, staging write enabled):** colorize an interior → "Push to Cover" adds a candidate, auto-selects it, `coverUrl` updates, old cover appears as a `source` candidate; switching candidates swaps the live cover; deleting a non-selected candidate works; the selected candidate can't be deleted; "Mở trong Cover editor" opens the editor with that candidate as the background.

## 9. Task mapping

| Task | Covered by |
|---|---|
| T-015 Push Coloring→Cover (new candidate) | §4 `addCandidate` + §5 POST |
| T-016 Push theo Add (auto chọn, giữ cũ) | §4 `ensureSourceCandidate`+`selectCandidate` (append-only, seeds/keeps old cover) + §5 POST |
| T-017 Interior không bị thay khi Push | Push only reads `page.coloredUrl` into a candidate; never writes the page. coloredUrl/interior untouched. |

## 10. File structure

**Create:**
- `packages/coloring/src/data/cover-candidates.ts` — `CoverState` + pure helpers.
- `packages/coloring/src/data/cover-candidates.test.ts` — helper unit tests.
- `packages/coloring/src/data/use-cover-candidates.ts` — client hook.
- `apps/admin/src/app/api/books/[bookId]/cover-candidates/route.ts` — POST (push) + PATCH (select).
- `apps/admin/src/app/api/books/[bookId]/cover-candidates/[candidateId]/route.ts` — DELETE.

**Modify:**
- `packages/coloring/src/data/types.ts` — `CoverCandidate` interface.
- `packages/coloring/package.json` — `./data/cover-candidates` subpath export.
- `packages/coloring/src/screens/books/page-actions-row.tsx` — replace "Làm bìa" with "Push to Cover".
- `packages/coloring/src/screens/books/book-detail-screen.tsx` — Cover candidates strip.

## 11. Risks / notes

- **JSON blob growth:** `coverCandidates[]` + `variants[]` grow the `Book` row over time — tracked in the master spec as the reason a future `BookImage` table is noted. Out of scope here.
- **`coverUrl` vs composed cover:** documented in §3 (mirror is soft; the Cover editor legitimately replaces `coverUrl` with a text-composed image). No code needs to enforce equality — selection is by id.
- **Old "Làm bìa" removed:** any operator muscle-memory changes; "Push to Cover" is the one-click replacement and is strictly more capable.
