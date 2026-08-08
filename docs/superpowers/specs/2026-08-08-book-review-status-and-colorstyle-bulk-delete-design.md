# Book review status + coloring-style bulk delete — Design

Date: 2026-08-08

Two independent admin-UX improvements to the coloring surface (`@vx/coloring`):

1. **Bulk delete on `/styles/colorstyles`** — select multiple coloring styles and delete them together.
2. **Book review status** — reuse `Book.isPublic` as an editorial approval flag ("Đã duyệt" / "Nháp"), default the `/books` list to show only approved books, and add an authorized "Duyệt sách" action on the book detail page.

---

## Feature 1 — Coloring-style bulk delete

### Scope

Only `/styles/colorstyles` (the `ColorStylesScreen`). The other entity hubs that share `EntityListScreen` (characters, locations, brands, categories, B&W styles) keep their current behavior: click card → detail.

### Current state

- `ColorStylesScreen` (`packages/coloring/src/screens/hubs/entity-lists.tsx`) renders the shared
  `EntityListScreen` with `path="coloring-styles"` `kind="coloring-styles"`.
- `EntityListScreen` (`.../hubs/entity-list-screen.tsx`) renders cards; clicking a card navigates to
  `/entity/{kind}/{id}`. No selection UI.
- Single delete already exists: `DELETE /api/coloring-styles/[id]`
  (`apps/admin/src/app/api/coloring-styles/[id]/route.ts`).
- `useEntityActions(kind, id).remove()` calls `httpDel`, gated behind `COLORING_WRITE_ENABLED`.
- The entity list query key is `["coloring", "entity", kind]` (see `use-entity-actions.ts` invalidation).

### Design

**`EntityListScreen` — opt-in selection.** Add two optional props:

```ts
selectable?: boolean;   // enables checkbox + bulk action bar
deleteKind?: string;    // API kind for DELETE (defaults to `kind`)
```

- When `selectable` is false/absent (all current callers), the component is byte-for-byte unchanged
  in behavior.
- When `selectable` is true:
  - Each card shows a checkbox in the top-left corner (mirrors `BookCard`'s pattern in
    `books-screen.tsx`: absolutely positioned, `onClick` stops propagation so toggling does not open
    the detail page).
  - Selected cards get a `2px solid var(--volt-600)` outline (same visual affordance as book
    selection).
  - A bulk action bar (a `Card`) appears above the grid when `selected.size > 0`:
    `"Đã chọn N style"` · **Xoá đã chọn** (danger) · **Bỏ chọn** (ghost).
  - Selection state is local `useState<Set<string>>`.

**`ColorStylesScreen`** passes `selectable` (and relies on `deleteKind` defaulting to `kind`).

**Bulk-delete hook** — new `useEntityBulkDelete(kind)` in `packages/coloring/src/data/`:

```ts
export function useEntityBulkDelete(kind: string) {
  const qc = useQueryClient();
  return {
    enabled: COLORING_WRITE_ENABLED,
    removeMany: async (ids: string[]) => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
      await Promise.all(
        ids.map((id) => httpDel(`${COLORING_API_BASE}/${kind}/${encodeURIComponent(id)}`)),
      );
      qc.invalidateQueries({ queryKey: ["coloring", "entity", kind] });
    },
  };
}
```

- Fires N parallel `DELETE /api/coloring-styles/[id]` requests (style counts are small; no new bulk
  endpoint required).
- Gated behind `COLORING_WRITE_ENABLED` like every other coloring write. When the flag is off, the
  "Xoá đã chọn" button is disabled with the standard "Cần bật ghi thật (staging)" title.

**Confirmation** — `window.confirm` (matches the existing book-delete pattern in
`book-detail-screen.tsx`), e.g. `Xoá N coloring style đã chọn? Hành động này không thể hoàn tác.`

**Error handling** — if any delete rejects, `Promise.all` rejects; show the error message in the
bulk bar (small `var(--danger)` text, like the assign error in `books-screen.tsx`). Successful
deletes still applied; the list invalidation reflects the true remaining set. Selection is cleared on
success.

### Data safety — deleting a style used by colored books

Deleting a coloring style is **safe for already-colored books**. Verified:

- `ColoringStyle` (schema.prisma) has **no Prisma relation / FK** to `Book`. Books reference a style
  only as a loose ID in JSON (`coloringPages[].coloringStyleId`, `data.coloringStyleId`,
  `coverMeta.coloringStyleId`). So `prisma.coloringStyle.delete()` does not cascade and does not error.
- Colored page images are standalone PNGs uploaded to R2 (`coloredUrl` on each page). Display and
  export-zip read `coloredUrl` directly and never re-read the `ColoringStyle` row. `DELETE
  /api/coloring-styles/[id]` removes only the Postgres row — it does not touch R2 assets.
- Only consequence: an orphaned `coloringStyleId` reference on those books — shown as plain text in
  the book "Thông tin" tab (harmless), and re-colorizing with that exact deleted style would return a
  graceful 404 (`findUnique` → "not found"). No screen crashes; the user just picks another style.

Given no data damage, **no usage-count safeguard** is added — a plain `window.confirm` is sufficient
(user-confirmed).

### Out of scope

- No bulk-delete API endpoint (client fan-out is sufficient).
- No selection for other entity kinds.
- No "N books use this style" usage warning before delete.

---

## Feature 2 — Book review status ("Đã duyệt" / "Nháp")

### Decision: reuse `Book.isPublic`

Confirmed by the user. Verified safe because `isPublic` has **no downstream effect today**:

- The storefront sync (`apps/admin/src/app/api/app-home/sync/route.ts`) syncs **all** books that have
  a `coverUrl`, ignoring `isPublic` entirely.
- A repo-wide search shows `book.isPublic` is only consumed by the admin `/books` list filter
  (`apps/admin/src/app/api/books/route.ts`) and rendered as a badge. No public/consumer endpoint
  gates on it.

So "Đang bán" was effectively a cosmetic label. New meaning:

| `isPublic` | New label |
|---|---|
| `true` | **Đã duyệt** (tone `success`) |
| `false` | **Nháp** (tone `neutral`) |

No schema migration, no new column.

### Backfill (one-time)

All existing books become "Đã duyệt":

- Script `apps/worker/src/scripts/backfill-book-approved.ts` (co-located with the existing one-off
  scripts like `cleanup-failed.ts`) running `prisma.book.updateMany({ data: { isPublic: true } })`.
- Run once against the target DB during deploy of this change. New books created afterward by the
  clone pipeline keep `isPublic: false` (already the case in
  `packages/clone-core/src/steps/create-book.ts` and the clone confirm/reproduce routes) → they show
  as "Nháp".

### Badge relabel (3 sites)

Change every `isPublic ? "Đang bán" : "Nháp"` render to `isPublic ? "Đã duyệt" : "Nháp"`:

1. `packages/coloring/src/screens/books/books-screen.tsx` — `BookCard` (currently line ~48).
2. `packages/coloring/src/screens/books/book-info-tab.tsx` — "Trạng thái" row (line ~57).
3. `packages/coloring/src/screens/books/book-detail-screen.tsx` — header badge (line ~259).

### List default filter → "Đã duyệt"

- In `BooksScreen`, change the status param default from `"all"` to `"pub"`
  (`useQueryParam("status", "pub")`), so a fresh `/books` visit shows only approved books.
- Filter `Select` options relabeled: `Tất cả` (all) / `Đã duyệt` (pub) / `Nháp` (draft). The current
  values `pub`/`draft` map cleanly onto `isPublic true/false` — **the API route
  `apps/admin/src/app/api/books/route.ts` needs no change** (it already maps `pub→isPublic:true`,
  `draft→isPublic:false`).
- The API route's own default stays `"all"` so other callers of `/api/books` that omit `status`
  (e.g. the admin queue board) are unaffected — only the `BooksScreen` UI default changes.
- Update the empty-state branch condition in `BooksScreen` that checks `status !== "all"` so the
  "no match" vs "empty library" copy still makes sense when the default is `pub`.
- Drafts are hidden by default; a reviewer switches the filter to "Nháp" to find books needing
  review/regen.

### Approve action (detail page only)

- Add a **"Duyệt sách"** button to the `book-detail-screen.tsx` header action row.
- Visible only when the book is currently "Nháp" (`!b.isPublic`) **and** the current user is allowed
  to approve (see authorization). Hidden otherwise.
- On click: `window.confirm("Duyệt sách này? Sách sẽ chuyển sang trạng thái Đã duyệt.")` →
  `POST /api/books/[bookId]/approve` → on success invalidate `["coloring","book",bookId]` and
  `["coloring","books"]`, show the standard success message.
- New hook `useApproveBook(bookId)` in `use-book-actions.ts`, gated behind `COLORING_WRITE_ENABLED`
  like its siblings.

### Authorization (server-side)

New route `apps/admin/src/app/api/books/[bookId]/approve/route.ts`:

- `POST` handler uses `getOperatorFromRequest(req)` (same helper the books list + assign routes use).
- Allow when `operator.role === "admin"` **or** `operator.sub === book.assignedToId`. Otherwise
  respond `403`.
- On success: `prisma.book.update({ where: { id }, data: { isPublic: true } })`. **Assignment is left
  untouched** (`assignedToId` unchanged) — confirmed by the user.
- Returns the updated book (or `{ success: true }`).

Client UI mirrors the rule to decide button visibility: show the approve button when
`user.role === "admin" || user.id === book.assignedToId`. (`useColoringAuth()` already exposes the
current user; `book.assignedToId` is on `BookRow`/`BookDetail`.)

### Out of scope

- Storefront sync behavior (unchanged — still syncs all books).
- Kanban `queueStatus` workflow (independent; not touched).
- Bulk approve on the list (explicitly deferred — approve is detail-page only).
- Un-approve / revert to draft (not requested; could be a later addition).

---

## Files touched (summary)

**Feature 1**
- `packages/coloring/src/screens/hubs/entity-list-screen.tsx` — opt-in selection UI.
- `packages/coloring/src/screens/hubs/entity-lists.tsx` — `ColorStylesScreen` passes `selectable`.
- `packages/coloring/src/data/use-entity-bulk-delete.ts` — new hook (+ export from data index if present).

**Feature 2**
- `apps/worker/src/scripts/backfill-book-approved.ts` — one-time backfill.
- `apps/admin/src/app/api/books/[bookId]/approve/route.ts` — new authorized approve endpoint.
- `packages/coloring/src/data/use-book-actions.ts` — `useApproveBook` hook.
- `packages/coloring/src/screens/books/book-detail-screen.tsx` — approve button + relabel.
- `packages/coloring/src/screens/books/books-screen.tsx` — default filter, options relabel, badge, empty-state.
- `packages/coloring/src/screens/books/book-info-tab.tsx` — badge relabel.

## Testing

- Feature 1: manual — select several styles, delete, verify list refresh; verify write-flag gating
  disables the action off-staging.
- Feature 2: unit test for the approve route authorization (admin allowed, assignee allowed,
  other operator 403) alongside the existing `route.test.ts` files under `api/books/[bookId]/`.
  Manual: generate a book (shows "Nháp", hidden by default filter), switch filter to "Nháp", open
  detail, approve as assignee/admin, confirm it becomes "Đã duyệt" and appears under the default filter.
