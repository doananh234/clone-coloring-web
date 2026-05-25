# Firestore Data Schema

Reference for all Firestore collections, document structures, service logic, security rules, and indexes.

**Projects:** `iroly-development` (default), `iroly-production`
**Validation:** Zod schemas with TypeScript type inference
**Type pattern:** `DBXxxReadData` (read), `DBXxxCreateData` (write), `DBXxxUpdateData` (partial update)

---

## Collections Overview

| Collection              | Doc ID       | Access        | Service                    |
| ----------------------- | ------------ | ------------- | -------------------------- |
| `books`                 | auto/manual  | Default deny  | `book-service.ts`          |
| `categories`            | auto/manual  | Public R/W    | `category-service.ts`      |
| `users`                 | Firebase UID | Owner only    | `user-service.ts`          |
| `users/{uid}/purchases` | purchaseId   | Owner only    | `book-purchase-service.ts` |
| `app` (doc: `home`)     | `home`       | Default deny  | `app-home-service.ts`      |
| `credit_ledger`         | auto         | Authenticated | —                          |
| `generated_images`      | auto         | Authenticated | —                          |
| `image_feed_meta`       | userId       | Owner only    | —                          |
| `image_feed_chunks`     | auto         | Authenticated | —                          |
| `wallets`               | userId       | Owner only    | —                          |
| `styles`                | auto         | Public R/W    | —                          |
| `images`                | auto         | Public R/W    | —                          |
| `listings`              | auto         | Public R/W    | —                          |

---

## 1. `books/{bookId}`

Coloring books with pages, pricing, thumbnails, and PDF.

### Schema

| Field                | Type                 | Required | Notes                         |
| -------------------- | -------------------- | -------- | ----------------------------- |
| `id`                 | `string`             | yes      | Document ID                   |
| `title`              | `string`             | yes      | min 1 char                    |
| `subtitle`           | `string`             | no       |                               |
| `description`        | `string`             | no       |                               |
| `price`              | `string`             | no       | Display price (e.g. "$2.99")  |
| `originalPrice`      | `string`             | no       | Before discount               |
| `discount`           | `string`             | no       | Discount label                |
| `category`           | `string`             | no       | Category name                 |
| `categoryId`         | `string`             | no       | FK to `categories` collection |
| `badge`              | `string`             | no       | UI badge (e.g. "NEW", "HOT")  |
| `backgroundColor`    | `string`             | no       | Hex/named color for UI        |
| `tryoutPage`         | `string`             | no       | Free preview page URL         |
| `coverUrl`           | `string`             | yes      | Cover image URL, min 1 char   |
| `pdfUrl`             | `string`             | no       | PDF download URL              |
| `squareThumbnailUrl` | `string`             | no       | 1:1 aspect ratio thumbnail    |
| `thumbnailUrl`       | `string`             | no       | 3:4 aspect ratio thumbnail    |
| `summaryPages`       | `BookColoringPage[]` | no       | Preview/summary pages         |
| `coloringPages`      | `BookColoringPage[]` | yes      | min 1 page                    |
| `specifications`     | `BookSpecifications` | yes      | Page count, dimensions, age   |
| `isConverted`        | `boolean`            | no       | Migration flag                |
| `isRedesigned`       | `boolean`            | no       | Redesign flag                 |
| `isEditionConverted` | `boolean`            | no       | Edition migration flag        |
| `createdAt`          | `Timestamp`          | yes      | Server timestamp              |
| `updatedAt`          | `Timestamp`          | yes      | Server timestamp              |

### Embedded Types

**BookColoringPage**

| Field      | Type      | Required |
| ---------- | --------- | -------- |
| `id`       | `string`  | yes      |
| `url`      | `string`  | yes      |
| `isPublic` | `boolean` | no       |

**BookSpecifications**

| Field        | Type     | Required    |
| ------------ | -------- | ----------- |
| `pages`      | `number` | yes (min 1) |
| `dimensions` | `string` | no          |
| `ageRange`   | `string` | no          |

### Service Logic (`book-service.ts`)

| Method                           | Description                                |
| -------------------------------- | ------------------------------------------ |
| `getBook(bookId)`                | Get single book by ID                      |
| `getBooks()`                     | Get all books ordered by `title`           |
| `getBooksByCategory(categoryId)` | Filter by `categoryId`, order by `title`   |
| `createBook(bookId, data)`       | Zod-validated create, auto-sets timestamps |
| `updateBook(bookId, data)`       | Partial update, auto-sets `updatedAt`      |
| `deleteBook(bookId)`             | Hard delete                                |

### Index

Composite: `(categoryId ASC, title ASC)` — used by `getBooksByCategory()`

---

## 2. `categories/{categoryId}`

Book categories with embedded book summaries for fast listing.

### Schema

| Field         | Type                    | Required | Notes                        |
| ------------- | ----------------------- | -------- | ---------------------------- |
| `id`          | `string`                | yes      | Document ID                  |
| `name`        | `string`                | yes      | Internal name                |
| `displayName` | `string`                | yes      | UI display name              |
| `description` | `string`                | yes      |                              |
| `iconUrl`     | `string`                | yes      | Category icon                |
| `iconPrompt`  | `string`                | yes      | Prompt used to generate icon |
| `isPublic`    | `boolean`               | no       | Visibility flag              |
| `index`       | `number`                | no       | Sort order                   |
| `books`       | `CategoryBookSummary[]` | yes      | Denormalized book list       |
| `createdAt`   | `Timestamp`             | yes      | Server timestamp             |
| `updatedAt`   | `Timestamp`             | yes      | Server timestamp             |

### Embedded Types

**CategoryBookSummary** (denormalized from `books`)

| Field      | Type     | Required |
| ---------- | -------- | -------- |
| `id`       | `string` | yes      |
| `title`    | `string` | yes      |
| `coverUrl` | `string` | yes      |
| `price`    | `string` | no       |
| `badge`    | `string` | no       |
| `order`    | `number` | no       |

### Service Logic (`category-service.ts`)

| Method                                   | Description                      |
| ---------------------------------------- | -------------------------------- |
| `getCategory(categoryId)`                | Get single category              |
| `getCategories()`                        | Get all ordered by `index`       |
| `createCategory(categoryId, data)`       | Zod-validated create             |
| `updateCategory(categoryId, data)`       | Partial update                   |
| `updateCategoryBooks(categoryId, books)` | Replace embedded `books[]` array |
| `deleteCategory(categoryId)`             | Hard delete                      |

### Index

Composite: `(index ASC, displayName ASC)`

### Data Relationship

`categories.books[]` is a **denormalized snapshot** of book data. When a book is created/updated, the corresponding `CategoryBookSummary` in the parent category should also be updated via `updateCategoryBooks()`.

---

## 3. `users/{userId}`

User profiles. Document ID = Firebase Auth UID.

### Schema

| Field         | Type             | Required | Notes             |
| ------------- | ---------------- | -------- | ----------------- |
| `id`          | `string`         | yes      | = Firebase UID    |
| `displayName` | `string \| null` | yes      | Max 15 chars      |
| `photoUrl`    | `string \| null` | yes      | Must be valid URL |
| `createdAt`   | `Timestamp`      | yes      | Server timestamp  |
| `updatedAt`   | `Timestamp`      | yes      | Server timestamp  |

### Service Logic (`user-service.ts`)

| Method                     | Description                            |
| -------------------------- | -------------------------------------- |
| `getUser(userId)`          | Get user profile                       |
| `createUser(userId, data)` | Create on first auth, Zod-validated    |
| `updateUser(userId, data)` | Update `displayName` and/or `photoUrl` |

### Security

Owner-only: `request.auth.uid == userId`

---

## 4. `users/{userId}/purchases/{purchaseId}`

In-app purchase records (one-time book purchases). Subcollection under `users`.

### Schema

| Field                   | Type                                                | Required | Notes            |
| ----------------------- | --------------------------------------------------- | -------- | ---------------- |
| `id`                    | `string`                                            | yes      | Purchase ID      |
| `bookId`                | `string`                                            | yes      | FK to `books`    |
| `platform`              | `'ios' \| 'android'`                                | yes      |                  |
| `productId`             | `string`                                            | yes      | Store product ID |
| `status`                | `'verified' \| 'pending' \| 'failed' \| 'refunded'` | yes      |                  |
| `transactionId`         | `string`                                            | no       | iOS only         |
| `originalTransactionId` | `string`                                            | no       | iOS only         |
| `environment`           | `'sandbox' \| 'production'`                         | no       | iOS only         |
| `purchaseToken`         | `string`                                            | no       | Android only     |
| `orderId`               | `string \| null`                                    | no       | Android only     |
| `createdAt`             | `Timestamp`                                         | yes      | Server timestamp |
| `updatedAt`             | `Timestamp`                                         | yes      | Server timestamp |

### Service Logic (`book-purchase-service.ts`)

| Method                                 | Description                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `hasUserPurchasedBook(userId, bookId)` | Check ownership (status = `verified`)                                          |
| `getUserPurchases(userId)`             | All verified purchases, newest first                                           |
| `getUserPurchasedBookIds(userId)`      | List of owned book IDs                                                         |
| `recordBookPurchase(input)`            | Record purchase with idempotency check (duplicate purchaseId returns existing) |

### Purchase Flow

1. App sends purchase receipt to server
2. Server verifies with Apple/Google
3. `recordBookPurchase()` writes document with `status: 'verified'`
4. Duplicate `purchaseId` is idempotent (returns existing record)
5. App queries `hasUserPurchasedBook()` to check access

---

## 5. `app/home` (Singleton Document)

Home screen configuration. Single document at `app/home`.

### Schema

| Field             | Type                      | Required | Notes            |
| ----------------- | ------------------------- | -------- | ---------------- |
| `newArrivalBooks` | `AppHomeNewArrivalBook[]` | yes      |                  |
| `trendingBooks`   | `AppHomeTrendingBook[]`   | yes      |                  |
| `categories`      | `AppHomeCategory[]`       | yes      |                  |
| `updatedAt`       | `Timestamp`               | no       | Server timestamp |

### Embedded Types

**AppHomeNewArrivalBook**

| Field      | Type     | Required |
| ---------- | -------- | -------- |
| `id`       | `string` | yes      |
| `title`    | `string` | yes      |
| `coverUrl` | `string` | yes      |
| `price`    | `string` | no       |
| `subtitle` | `string` | no       |
| `order`    | `number` | no       |

**AppHomeTrendingBook**

| Field              | Type     | Required |
| ------------------ | -------- | -------- |
| `id`               | `string` | yes      |
| `rank`             | `number` | yes      |
| `title`            | `string` | yes      |
| `subtitle`         | `string` | yes      |
| `imageUrl`         | `string` | yes      |
| `participantCount` | `string` | no       |

**AppHomeCategory**

| Field         | Type      | Required |
| ------------- | --------- | -------- |
| `id`          | `string`  | yes      |
| `name`        | `string`  | yes      |
| `displayName` | `string`  | yes      |
| `description` | `string`  | yes      |
| `iconUrl`     | `string`  | yes      |
| `isPublic`    | `boolean` | yes      |
| `order`       | `number`  | yes      |

### Service Logic (`app-home-service.ts`)

| Method             | Description                               |
| ------------------ | ----------------------------------------- |
| `getHome()`        | Read home config                          |
| `updateHome(data)` | Overwrite entire document (Zod-validated) |

---

## 6. Caching Layer (`FirestoreDataService`)

In-memory cache with 5-minute TTL for frequently accessed data.

| Method                    | Cache Key    | Description           |
| ------------------------- | ------------ | --------------------- |
| `loadBooks()`             | —            | Direct Firestore read |
| `loadBooksCached()`       | `books`      | Cached version        |
| `loadBooksByCategory(id)` | —            | Direct, filtered read |
| `loadBookById(id)`        | —            | Single doc read       |
| `loadCategories()`        | —            | Direct Firestore read |
| `loadCategoriesCached()`  | `categories` | Cached version        |
| `loadCategoryByKey(key)`  | —            | Single doc read       |
| `clearCache()`            | —            | Invalidate all        |

---

## 7. Security Rules Summary

```
users/{userId}           → owner only (auth.uid == userId)
credit_ledger/{id}       → authenticated
generated_images/{id}    → authenticated
image_feed_meta/{id}     → owner only (auth.uid == id)
image_feed_chunks/{id}   → authenticated
wallets/{id}             → owner only (auth.uid == id)
styles/{id}              → public R/W
categories/{id}          → public R/W
images/{id}              → public R/W
listings/{id}            → public R/W
everything else          → deny all
```

---

## 8. Constants

```typescript
COLLECTIONS = { BOOKS, CATEGORIES, APP, USERS };
APP_DOCS = { HOME };

VALIDATION_CONSTANTS = {
  MAX_STRING_LENGTH: 1000,
  MAX_PAGINATION_LIMIT: 100,
  MIN_PAGINATION_LIMIT: 1,
};

DISPLAY_NAME_MAX_LENGTH = 15;
```

---

## 9. Entity Relationship Diagram

```
books ──────────────┐
  │                 │ denormalized into
  │ categoryId ───► categories.books[]
  │                 │
  │ bookId ◄─────── users/{uid}/purchases
  │
  │ (subset) ─────► app/home.newArrivalBooks[]
  │ (subset) ─────► app/home.trendingBooks[]
  │
categories ────────► app/home.categories[]
```

**Key patterns:**

- **Denormalization:** `categories.books[]` and `app/home.*` embed book/category snapshots for fast reads
- **One-time purchase:** `purchases` subcollection under `users`, buy once own forever
- **Idempotency:** `recordBookPurchase()` checks for duplicate `purchaseId` before writing
- **Timestamps:** All collections use `FieldValue.serverTimestamp()` on create/update
