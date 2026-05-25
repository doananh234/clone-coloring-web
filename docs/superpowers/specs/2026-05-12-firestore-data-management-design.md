# Firestore Data Management — Admin Dashboard Design Spec

**Date:** 2026-05-12
**Status:** Draft
**Scope:** Admin CRUD for Firestore collections (books, categories, app/home, purchases, wallets, credit_ledger)

---

## 1. Overview

Add full data management for Firestore collections to the VX Admin dashboard. Direct Firebase Client SDK connection (no REST intermediary). Admin users authenticate via Firebase Auth with admin-level access.

**Phased rollout:**

- Phase 1: Books, Categories, App Home Config, Purchases (read-only)
- Phase 2: Wallets, Credit Ledger (read-only)
- Skipped (not in use): styles, images, listings, generated_images, image_feed_meta, image_feed_chunks

---

## 2. Architecture

### 2.1 Firebase Integration in core-uikit

New optional subpath: `@vx/core-uikit/firebase`

```
packages/core-uikit/src/firebase/
├── firebase-provider.tsx     # FirebaseProvider context, initializeApp
├── use-firestore.ts          # useFirestore() — access Firestore instance
├── use-firestore-crud.ts     # useFirestoreGetAll, useFirestoreGetOne, useFirestoreMutation
├── firestore-helpers.ts      # Query builders, timestamp converters, pagination
└── index.ts                  # Barrel export
```

**Design decisions:**

- `FirebaseProvider` wraps the app, takes `firebaseConfig` as prop — no hardcoded config
- Firestore hooks mirror existing REST hooks (`useRestGetAll` → `useFirestoreGetAll`)
- TanStack Query underneath — same cache/invalidation as REST
- Firebase SDK is a peer dependency — unused if not installed
- Cursor-based pagination using `startAfter`/`limit` (Firestore native)
- Client-side text search on configurable `searchFields` (Firestore has no full-text search)

**Usage in app:**

```tsx
// apps/admin/src/main.tsx
import { FirebaseProvider } from "@vx/core-uikit/firebase";
import { firebaseConfig } from "./firebase-config";

<FirebaseProvider config={firebaseConfig}>
  <QueryProvider>
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>
  </QueryProvider>
</FirebaseProvider>;
```

### 2.2 CRUD Generator Extension

New `dataSource` option in `createCrudPages`:

```ts
// Firestore-based entity
createCrudPages<BookEntity>({
  entityName: "books",
  basePath: "/books",
  dataSource: {
    type: "firestore",
    collection: "books",
    orderBy: { field: "title", direction: "asc" },
    searchFields: ["title", "category"],
  },
  fields: bookFields,
  namespace: "books",
  navigate: appNavigate,
});
```

**How it works:**

- `createCrudPages` checks `dataSource.type` — `"firestore"` uses Firestore hooks, absent/`"rest"` uses REST hooks
- Sorting, pagination, filtering delegate to Firestore query constraints
- Backward compatible — existing REST entities unchanged

### 2.3 Firebase Config in Admin App

```
apps/admin/src/
├── firebase-config.ts        # Firebase project config (from env vars)
```

Environment variables:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

---

## 3. New Field Types for CRUD Generator

| Type              | Used By                                     | Description                              |
| ----------------- | ------------------------------------------- | ---------------------------------------- |
| `nested-array`    | books (coloringPages, summaryPages)         | Add/remove/reorder items with sub-fields |
| `embedded-object` | books (specifications)                      | Inline group of fields rendered together |
| `url-image`       | books, categories (coverUrl, iconUrl, etc.) | URL text input + image preview thumbnail |
| `color`           | books (backgroundColor)                     | Hex color input with preview swatch      |

These extend `FieldConfig.type`. Existing types unchanged.

---

## 4. New Shared Components

### 4.1 SortableList (core-uikit/components/crud/)

Generic drag-and-drop reorderable list using `@dnd-kit/sortable`.

```tsx
<SortableList
  items={items}
  onReorder={(newOrder) => setItems(newOrder)}
  renderItem={(item, { dragHandleProps }) => <div {...dragHandleProps}>{item.title}</div>}
/>
```

Used by: nested-array field type, App Home Config page.

### 4.2 ItemPickerDialog (core-uikit/components/crud/)

Modal to search and select items from a Firestore collection.

```tsx
<ItemPickerDialog
  collection="books"
  displayField="title"
  imageField="coverUrl"
  onSelect={(selectedItems) => handleAdd(selectedItems)}
/>
```

Used by: App Home Config (add books/categories to sections).

### 4.3 Dependency

- `@dnd-kit/core` + `@dnd-kit/sortable` — ~15KB gzipped

---

## 5. Phase 1 Entities

### 5.1 Books (`/books`)

**Data source:** Firestore `books` collection
**Type:** Full CRUD via generator

**Fields:**

| Field                | Type            | Form Control                         | List        | Detail | Notes                |
| -------------------- | --------------- | ------------------------------------ | ----------- | ------ | -------------------- |
| `id`                 | text            | Read-only                            | no          | yes    | Document ID          |
| `title`              | text            | Text input                           | yes         | yes    | Required, min 1      |
| `subtitle`           | text            | Text input                           | no          | yes    |                      |
| `description`        | textarea        | Textarea                             | no          | yes    |                      |
| `price`              | text            | Text input                           | yes         | yes    | Display price string |
| `originalPrice`      | text            | Text input                           | no          | yes    |                      |
| `discount`           | text            | Text input                           | no          | yes    |                      |
| `categoryId`         | select          | Dropdown (from categories)           | no          | yes    | FK to categories     |
| `category`           | text            | Auto-filled from categoryId          | yes         | yes    | Category name        |
| `badge`              | select          | Select (NEW, HOT, custom)            | yes         | yes    |                      |
| `backgroundColor`    | color           | Color picker                         | no          | yes    | Hex color            |
| `coverUrl`           | url-image       | URL input + preview                  | yes (thumb) | yes    | Required             |
| `thumbnailUrl`       | url-image       | URL input + preview                  | no          | yes    | 3:4 ratio            |
| `squareThumbnailUrl` | url-image       | URL input + preview                  | no          | yes    | 1:1 ratio            |
| `tryoutPage`         | url-image       | URL input + preview                  | no          | yes    | Free preview         |
| `pdfUrl`             | text            | URL input                            | no          | yes    | PDF download         |
| `coloringPages`      | nested-array    | Array editor (id, url, isPublic)     | no          | yes    | Required, min 1      |
| `summaryPages`       | nested-array    | Array editor (id, url, isPublic)     | no          | yes    |                      |
| `specifications`     | embedded-object | Inline (pages, dimensions, ageRange) | no          | yes    | Required             |
| `isConverted`        | boolean         | Checkbox                             | no          | yes    | Migration flag       |
| `isRedesigned`       | boolean         | Checkbox                             | no          | yes    |                      |
| `isEditionConverted` | boolean         | Checkbox                             | no          | yes    |                      |
| `createdAt`          | date            | Auto (read-only)                     | yes         | yes    | Server timestamp     |
| `updatedAt`          | date            | Auto (read-only)                     | no          | yes    | Server timestamp     |

**List page columns:** title, coverUrl (thumbnail), category, price, badge, createdAt
**Default sort:** title ASC
**Searchable:** title, category
**Filterable:** categoryId (select), badge (select)

### 5.2 Categories (`/categories`)

**Data source:** Firestore `categories` collection
**Type:** Full CRUD via generator

**Fields:**

| Field         | Type         | Form Control        | List        | Detail | Notes                           |
| ------------- | ------------ | ------------------- | ----------- | ------ | ------------------------------- |
| `id`          | text         | Read-only           | no          | yes    |                                 |
| `name`        | text         | Text input          | no          | yes    | Internal name                   |
| `displayName` | text         | Text input          | yes         | yes    | Required                        |
| `description` | textarea     | Textarea            | no          | yes    |                                 |
| `iconUrl`     | url-image    | URL input + preview | yes (thumb) | yes    | Required                        |
| `iconPrompt`  | textarea     | Textarea            | no          | yes    | AI prompt                       |
| `isPublic`    | boolean      | Toggle              | yes         | yes    |                                 |
| `index`       | number       | Number input        | yes         | yes    | Sort order                      |
| `books`       | nested-array | **Read-only list**  | no          | yes    | Denormalized, not editable here |
| `createdAt`   | date         | Auto (read-only)    | no          | yes    |                                 |
| `updatedAt`   | date         | Auto (read-only)    | no          | yes    |                                 |

**List page columns:** displayName, iconUrl (thumbnail), isPublic, index, book count
**Default sort:** index ASC
**Searchable:** displayName, name

### 5.3 App Home Config (`/app-home`)

**Data source:** Firestore singleton `app/home`
**Type:** Custom page (NOT generator)

**Layout:** Single page with 3 collapsible sections, each with a drag-and-drop sortable list.

**Section 1 — New Arrival Books:**

- DnD list of `AppHomeNewArrivalBook` items
- Each row: cover thumbnail + title + price + remove button
- "Add Book" button → `ItemPickerDialog` searching `books` collection
- Order determined by list position (mapped to `order` field on save)

**Section 2 — Trending Books:**

- DnD list of `AppHomeTrendingBook` items
- Each row: image + title + subtitle + participantCount + remove button
- "Add Book" button → `ItemPickerDialog` searching `books` collection
- `rank` auto-assigned by position (1, 2, 3...)

**Section 3 — Categories:**

- DnD list of `AppHomeCategory` items
- Each row: icon + displayName + isPublic toggle + remove button
- "Add Category" button → `ItemPickerDialog` searching `categories` collection
- `order` auto-assigned by position

**Save:** Single "Save Changes" button writes entire document via Firestore `setDoc()`
**Load:** On mount, reads `app/home` doc and populates all 3 sections

### 5.4 Purchases (`/users/:userId/purchases`)

**Data source:** Firestore subcollection `users/{userId}/purchases`
**Type:** Custom read-only page

**Access:** Link from user detail page → "View Purchases" button

**Table columns:**

| Column        | Notes                                                                          |
| ------------- | ------------------------------------------------------------------------------ |
| purchaseId    | Document ID                                                                    |
| bookId        | Link to `/books/:bookId` detail                                                |
| platform      | Badge: ios / android                                                           |
| productId     | Store product ID                                                               |
| status        | Color badge: verified (green), pending (yellow), failed (red), refunded (gray) |
| transactionId | iOS only, show "—" if empty                                                    |
| orderId       | Android only, show "—" if empty                                                |
| createdAt     | Formatted date                                                                 |

**Features:** Filter by status, sort by createdAt (newest first). No create/edit/delete.

---

## 6. Phase 2 Entities

### 6.1 Wallets (`/wallets`)

**Data source:** Firestore `wallets` collection (doc ID = userId)
**Type:** CRUD via generator

**Fields:** To be confirmed from Firestore data. Expected: userId, balance, currency, updatedAt.
**List page:** userId (linked to user), balance, currency, updatedAt.

Design is flexible — exact field config created when connecting to live Firestore.

### 6.2 Credit Ledger (`/credit-ledger`)

**Data source:** Firestore `credit_ledger` collection
**Type:** Read-only list page (custom, no generator)

**Expected columns:** userId (linked), amount, type (badge), description, createdAt
**Features:** Filter by userId, type. Sort by createdAt desc.
**Stretch goal:** CSV export.

---

## 7. Sidebar Navigation

```
Dashboard
── Books                    ← Phase 1
── Categories               ← Phase 1
── App Home Config          ← Phase 1
── Users                    (existing)
     └─ Purchases           ← Phase 1 (from user detail)
── Wallets                  ← Phase 2
── Credit Ledger            ← Phase 2
```

---

## 8. i18n

New namespaces per entity: `books`, `categories`, `appHome`, `purchases`, `wallets`, `creditLedger`.

Each follows existing pattern:

```json
{
  "title": "Page Title",
  "fields": { "fieldName": "Label" },
  "options": { "fieldName": { "value": "Display" } }
}
```

3 locales: en, vi, ja.

---

## 9. Dependencies Added

| Package             | Purpose                                | Size                        |
| ------------------- | -------------------------------------- | --------------------------- |
| `firebase`          | Firebase Client SDK (Auth + Firestore) | ~80KB gzipped (tree-shaken) |
| `@dnd-kit/core`     | Drag-and-drop core                     | ~10KB gzipped               |
| `@dnd-kit/sortable` | Sortable preset                        | ~5KB gzipped                |

Firebase added as dependency of `@vx/core-uikit` (peer) and `@vx/admin` (direct).
DnD-kit added to `@vx/core-uikit`.

---

## 10. Firestore Indexes Required

| Collection   | Fields                         | Used By                    |
| ------------ | ------------------------------ | -------------------------- |
| `books`      | `(categoryId ASC, title ASC)`  | Books filtered by category |
| `categories` | `(index ASC, displayName ASC)` | Categories sorted list     |

These should be added to `firestore.indexes.json` in the Firebase project.

---

## 11. Limitations & Trade-offs

1. **No full-text search** — client-side filtering on loaded data. Acceptable for admin use (hundreds of docs, not millions). Algolia/Typesense can be added later.
2. **Image management is URL-only** — admins paste R2 Cloudflare URLs. No upload from admin.
3. **Denormalization sync is manual** — when a book is updated, the admin must also update category.books[] and app/home sections if that book appears there. Future: automated sync via Cloud Function.
4. **Cursor-based pagination** — no "jump to page 5". Forward/back navigation only. Standard for Firestore.
5. **Phase 2 schemas are approximate** — wallets and credit_ledger field configs will be finalized when connecting to live Firestore data.

---

## 12. Security Considerations

- Firebase Auth required — admin users must authenticate before Firestore access
- Firestore security rules must allow admin role access to all managed collections
- Firebase config (API key, project ID) is safe to expose client-side — security enforced by Firestore rules
- No sensitive data (service account keys) in frontend code
- Admin role verification should happen in Firestore security rules via custom claims (`request.auth.token.admin == true`)
