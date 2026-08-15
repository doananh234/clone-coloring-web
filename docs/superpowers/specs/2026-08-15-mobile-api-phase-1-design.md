# Mobile API — Phase 1 Design

**Date:** 2026-08-15
**Status:** Draft (pending user review)
**Scope:** Phase 1 — standalone customer-facing API for the mobile app: scaffold, auth, home, catalog, user library + coloring progress. Commerce (buy / subscription / payment) is Phase 2.

## 1. Problem & Goals

The current backend serves the admin web (`apps/admin`, Next.js) and the worker (`apps/worker`). There is **no dedicated API for the mobile application**. We need a separate server, consuming the existing `@vx/db` schema, that exposes clean endpoints for the mobile app.

### Goals (Phase 1)
- Standalone NestJS API (`apps/mobile-api`) — decoupled from admin web.
- Customer auth: email/password, self-managed JWT (access + refresh).
- Home settings feed.
- Catalog: books, categories, books-by-category — with search, filter, sort, pagination.
- User library: purchased books (read) + coloring progress (list/save/update "đang tô" / "đã tô").

### Non-Goals (→ Phase 2)
- Buying a book, subscription, payment (Apple IAP + Google Play Billing + Stripe).
- Password reset / email verification / social login (Phase 1.x, non-blocking).
- Push notifications, reviews, wishlists.

## 2. Decisions (confirmed with user)

| Topic | Decision |
|---|---|
| Approach | **A** — standalone NestJS app in the coloring monorepo, shares `@vx/db` |
| Auth | **Email/password self-managed (JWT)** — `passwordHash` (bcrypt) on `User`, tokens via `jose` |
| Payment | **Apple IAP + Google Play Billing + Stripe** — Phase 2 only |
| Scope | **Phase 1** as above |
| Tokens | Access + refresh (default; overridable) |
| Coloring progress | Included in Phase 1 (independent of payment) |
| App name | `apps/mobile-api` |

## 3. Architecture

Mirror `apps/homeowner-api` from the house-design-ai-web monorepo: **NestJS 11 + ESM + SWC**, module-per-domain (`*.controller.ts` / `*.service.ts` / `*.module.ts` / `*.service.spec.ts`), global JWT guard + `@Public()` opt-out, Zod validation pipe, Prisma module (Global) extending `PrismaClient` from `@vx/db`.

```
apps/mobile-api/
├── package.json            # @vx/mobile-api — NestJS 11, ESM, SWC, deps: @vx/db, jose, bcryptjs, zod
├── tsconfig.json
├── Dockerfile              # (or shared multi-stage in root, see §8)
├── .env.example
└── src/
    ├── main.ts             # prefix "api", CORS, shutdown hooks, PORT=3001
    ├── app.module.ts       # wires modules + APP_GUARD(JwtAuthGuard) + APP_INTERCEPTOR(LoggingInterceptor)
    ├── prisma/
    │   ├── prisma.service.ts   # extends PrismaClient, onModuleInit/Destroy
    │   └── prisma.module.ts    # @Global
    ├── common/
    │   ├── jwt-auth.guard.ts       # verify Bearer via jose; dev x-user-id fallback (non-prod)
    │   ├── public.decorator.ts     # @Public() → IS_PUBLIC_KEY
    │   ├── current-user.decorator.ts  # @CurrentUser() → req.auth.sub
    │   ├── zod-validation.pipe.ts
    │   ├── logging.interceptor.ts
    │   ├── health.controller.ts    # GET /api/health (@Public)
    │   ├── jwt.ts                  # signAccess/signRefresh/verify (jose, HS256)
    │   ├── password.ts            # hash/verify (bcryptjs)
    │   └── pagination.ts          # parseListQuery + toPageMeta helpers
    └── modules/
        ├── auth/       # register, login, refresh
        ├── me/         # profile + library + colorings
        ├── home/       # home feed from App.data.mobileHome
        └── catalog/    # books, categories, books-by-category
```

### Response conventions
- **List endpoints** return `{ data: T[], meta: { total, page, limit } }`.
- **Single-entity** endpoints return the entity object directly.
- Errors use Nest exceptions → `{ statusCode, message, issues? }`. Zod issues surface as `issues: [{ path, message }]`.

### Auth flow
1. `register`/`login` → `password.ts` verifies, `jwt.ts` signs an **access token** (short TTL, e.g. 1h, `aud: "mobile"`) + **refresh token** (long TTL, e.g. 30d).
2. `JwtAuthGuard` (global) verifies `Authorization: Bearer <access>` on every route except `@Public()`. Sets `req.auth = { sub: userId, role }`.
3. `refresh` verifies the refresh token and issues a new access token.
4. Non-production convenience: `x-user-id` header stands in for a token (for local/e2e), gated by `NODE_ENV !== "production"`.

JWT secret from `JWT_SECRET` env. Access/refresh separated by an embedded `typ` claim so a refresh token cannot be used as an access token.

## 4. Modules & Endpoints

### 4.1 auth (`/api/auth`, `@Public`)
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password, name? }` | `{ user, accessToken, refreshToken }` |
| POST | `/auth/login` | `{ email, password }` | `{ user, accessToken, refreshToken }` |
| POST | `/auth/refresh` | `{ refreshToken }` | `{ accessToken }` |

- Passwords: min 8 chars (zod). Store `passwordHash` only; never return it.
- `register` conflicts on existing email → 409.
- `user` shape: `{ id, email, name, avatarUrl, role, createdAt }` (no hash).

### 4.2 me (`/api/me`, auth)
| Method | Path | Purpose |
|---|---|---|
| GET | `/me` | current profile |
| PATCH | `/me` | update `{ name?, avatarUrl? }` |
| GET | `/me/library/books?page=&limit=` | purchased books (Purchase where `userId` + `status="paid"`, join Book) |
| GET | `/me/colorings?status=&page=&limit=` | user artworks; `status` ∈ `in_progress`\|`finished` |
| GET | `/me/colorings/:id` | one artwork (ownership-checked) |
| POST | `/me/colorings` | `{ bookId, pageIndex?, pageId?, imageUrl?, progress?, status? }` → create |
| PATCH | `/me/colorings/:id` | update progress/imageUrl/status |
| DELETE | `/me/colorings/:id` | remove |

- All `/me/colorings*` scope by `req.auth.sub`; cross-user access → 404 (not 403, to avoid enumeration).
- Phase 1 `/me/library/books` may return empty until Phase 2 populates `Purchase`.

### 4.3 home (`/api/home`, `@Public`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/home` | reads `App.data.mobileHome`; resolves referenced book/category ids into hydrated objects |

`App.data.mobileHome` (admin-configured JSON, no new model): `{ banners: [...], sections: [{ title, bookIds:[] }], featuredCategoryIds: [] }`. The service resolves ids → public Book/Category rows and drops missing/non-public ones.

### 4.4 catalog (`/api/catalog`, `@Public`)
| Method | Path | Query | Purpose |
|---|---|---|---|
| GET | `/catalog/books` | `search, categoryId, brandId, minPrice, maxPrice, sort, page, limit` | paginated books (`isPublic` only) |
| GET | `/catalog/books/:id` | — | book detail (`isPublic`) → 404 otherwise |
| GET | `/catalog/categories` | — | public categories, ordered by `index` |
| GET | `/catalog/categories/:id/books` | `search, brandId, minPrice, maxPrice, sort, page, limit` | books in a category |

**Filtering/sorting/pagination conventions (shared helper):**
- `page` (default 1), `limit` (default 20, max 100).
- `sort`: whitelist `createdAt|title|price` with `:asc|:desc` (default `createdAt:desc`). Reject non-whitelisted fields.
- `search`: case-insensitive `contains` over `title` (+ `subtitle`) via Prisma `mode: "insensitive"`. (Fuzzy pg_trgm/unaccent is a later enhancement; Phase 1 uses ILIKE-style contains to avoid a DB-extension dependency.)
- `price`: filtered/sorted on the new **numeric column `Book.priceAmount`** (minor units, Int). `minPrice/maxPrice` are numeric (major units) → converted to minor units in-service. `sort` price key maps to `priceAmount`. The legacy free-form `price String?` stays for display/admin compat.

## 5. Data Model Changes (`packages/db/prisma/schema.prisma`)

All additive / non-destructive. One Prisma migration.

```prisma
model Book {
  // ...existing fields unchanged (price String? kept for display/admin)...
  priceAmount Int?    // new — normalized price in minor units (e.g. cents); backfilled from `price`

  @@index([priceAmount])
  // ...existing indexes unchanged...
}

model User {
  id           String   @id @default(cuid())   // was: no default
  email        String?  @unique
  name         String?
  avatarUrl    String?                          // new
  passwordHash String?                          // new
  role         String   @default("user")
  data         Json     @default("{}")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Purchase {
  id          String   @id @default(cuid())
  userId      String?                           // new
  bookId      String?                           // new
  type        String?                           // new  "book" | "subscription"
  status      String?  @default("pending")      // new  "pending" | "paid" | "refunded"
  amount      Int?                              // new  minor units
  currency    String?  @default("USD")          // new
  provider    String?                           // new  "stripe" | "apple" | "google"
  providerRef String?                           // new
  data        Json     @default("{}")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId])
  @@index([bookId])
}

// New — user coloring artworks / progress ("đang tô" / "đã tô")
model UserColoring {
  id        String   @id @default(cuid())
  userId    String
  bookId    String
  pageId    String?
  pageIndex Int?
  status    String   @default("in_progress")  // "in_progress" | "finished"
  imageUrl  String?                            // saved colored render (R2)
  progress  Json     @default("{}")            // opaque per-app progress payload
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([userId, status])
  @@index([bookId])
}
```

- Existing admin `Purchase` CRUD writes `{ data: body }` only → unaffected by the added optional columns.
- Changing `User.id` to `@default(cuid())` does not alter existing rows; new customer signups get generated ids.
- **`Book.priceAmount` backfill:** the migration parses each existing `price` string (strip currency symbols/commas, parse to a number, ×100 → minor units) into `priceAmount`; unparseable/empty prices become `NULL`. Admin still writes `price` as a string; keeping `priceAmount` in sync on admin edits is a small follow-up (admin write-through or a periodic sync) — noted, not in Phase 1.
- **Phase 2 models (not in this migration):** `Subscription`, `Payment`.

## 6. Error Handling & Validation
- Zod schemas per DTO (in-app under each module or a small `dto/` folder); validated by `ZodValidationPipe`.
- Consistent Nest exceptions: `BadRequestException` (validation), `UnauthorizedException` (auth), `NotFoundException` (missing/foreign), `ConflictException` (dup email).
- No secret leakage: never serialize `passwordHash`; auth errors are generic ("Invalid credentials").

## 7. Security
- `JWT_SECRET` from env (min length enforced at boot). Access TTL ~1h, refresh ~30d.
- Refresh is **stateless** in Phase 1 (no DB revocation store) — a leaked refresh token is valid until expiry. DB-backed revocation/rotation is deferred to Phase 2.
- bcrypt cost ≥ 10.
- Global guard denies by default; only `@Public()` routes are open.
- CORS enabled (tighten origins for prod via env).
- Rate limiting on `/auth/*` — noted as a hardening follow-up (Phase 1.x) unless required now.

## 8. Deployment
- New container **`vx-mobile-api`** (port `3001`) in `docker-compose.yml` + `docker-compose.prod.yml`, sharing `vx-postgres` / `vx-redis`.
- Own `apps/mobile-api/.env.prod` (git-ignored): `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `PORT`, `NODE_ENV`.
- `deploy.sh`: add `apps/mobile-api/.env.prod` to the preflight existence check and include the service in the build/up steps.
- Build serially (host is memory-constrained — known constraint).

## 9. Testing
- **Unit (Vitest):** service specs — auth (hash/verify, token issue), catalog (filter/sort/pagination query building), me/colorings (ownership scoping), home (id resolution + dropping non-public).
- **E2E (supertest):** `/auth/register→login→me`, `/catalog/books` pagination+filter, `/me/colorings` CRUD + cross-user 404.
- Target ≥ 80% on new code.

## 10. Phase 2 Roadmap (out of scope now)
- Commerce module: buy book, subscription plans, entitlements.
- Payment providers: Apple IAP + Google Play Billing (receipt verification + server notifications) and Stripe (Checkout + webhooks); unified entitlement layer writing `Purchase`/`Subscription`.
- Wire `/me/library/books` to real entitlements.
- DB-backed refresh-token revocation/rotation store.
- Keep `Book.priceAmount` in sync on admin price edits (write-through or periodic sync).

## 11. Resolved Decisions
- **Price filtering:** normalized numeric column `Book.priceAmount` (minor units), backfilled from `price`; catalog filters/sorts on it. (§4.4, §5)
- **Refresh tokens:** stateless in Phase 1; DB revocation store → Phase 2. (§7)
- **`/home`:** stays **public** (static feed). (§4.3)
