# Mobile API — Status & Handoff

**App:** `apps/mobile-api` (`@vx/mobile-api`) — standalone customer-facing API for the coloring mobile app.
**Last updated:** 2026-08-18
**Phase 1:** ✅ DONE, merged to `main`, DEPLOYED to prod.
**Phase 2:** ⛔ Not started (commerce: buy / subscription / payment).

Related docs: spec `docs/superpowers/specs/2026-08-15-mobile-api-phase-1-design.md` · plan `docs/superpowers/plans/2026-08-15-mobile-api-phase-1.md` (gitignored, local).

---

## 1. What it is

NestJS 11 (ESM + SWC), module-per-domain, global JWT guard with `@Public()` opt-out, Zod validation pipe, a `@Global` Prisma module extending `PrismaClient` from `@vx/db`. Structure mirrors `apps/homeowner-api` in the house-design-ai-web monorepo. Runs as its own container `vx-mobile-api` on **port 3001**, sharing the existing Postgres/Redis.

Built 2026-08-15 via subagent-driven TDD (12 tasks). **35 tests (unit + e2e), typecheck clean.** Global API prefix is `/api`.

---

## 2. Deployment (prod)

- Container **`vx-mobile-api`** on EC2 `3.216.170.208:3001`, health `GET /api/health`.
- Deployed via `./deploy.sh` (rsync + docker-compose to EC2). `deploy.sh` preflight requires `apps/mobile-api/.env.prod` (git-ignored, already created on the deploy machine).
- Prod schema is applied by deploy.sh's existing `prisma db push --accept-data-loss` step (the project does **not** use `prisma migrate` — no `migrations/` dir).
- Redeploy: `./deploy.sh` (builds admin + worker + mobile-api serially; host is memory-constrained).

**Base URL (prod):** `http://3.216.170.208:3001/api`

---

## 3. Endpoints (Phase 1)

Auth: `Authorization: Bearer <accessToken>`. Everything under `/me` requires auth and is scoped to the token's user; cross-user access returns 404. List endpoints return `{ data, meta: { total, page, limit } }`.

### Auth (`@Public`)
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/auth/register` | `{ email, password(min8), name? }` | `{ user, accessToken, refreshToken }` (201) |
| POST | `/api/auth/login` | `{ email, password }` | `{ user, accessToken, refreshToken }` (201) |
| POST | `/api/auth/refresh` | `{ refreshToken }` | `{ accessToken }` (201) |

`user` = `{ id, email, name, avatarUrl, role, createdAt }` (never `passwordHash`).

### Me (auth)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/me` | profile |
| PATCH | `/api/me` | `{ name?, avatarUrl? }` |
| GET | `/api/me/library/books?page=&limit=` | purchased books (Purchase where userId + status="paid") — empty until Phase 2 |
| GET | `/api/me/colorings?status=in_progress\|finished&page=&limit=` | user artworks |
| GET | `/api/me/colorings/:id` | one artwork (owner-scoped) |
| POST | `/api/me/colorings` | `{ bookId, pageId?, pageIndex?, imageUrl?, progress?, status? }` |
| PATCH | `/api/me/colorings/:id` | `{ imageUrl?, progress?, status? }` |
| DELETE | `/api/me/colorings/:id` | |

### Catalog (`@Public`)
| Method | Path | Query |
|---|---|---|
| GET | `/api/catalog/categories` | — (public, ordered by index then name) |
| GET | `/api/catalog/books` | `search, categoryId, minPrice, maxPrice, sort, page, limit` |
| GET | `/api/catalog/books/:id` | — (404 if not public) |
| GET | `/api/catalog/categories/:id/books` | `search, minPrice, maxPrice, sort, page, limit` |

`sort` whitelist: `createdAt|title|price` (`price` → `priceAmount`) with `:asc|:desc`, default `createdAt:desc`. `page` default 1, `limit` default 20 / max 100. Price filters use the numeric `Book.priceAmount` (minor units). **No `brandId` filter** (Book has no brandId column).

### Home (`@Public`)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/home` | reads `App.data.mobileHome` `{ banners, sections:[{title,bookIds}], featuredCategoryIds }`, hydrates public books/categories, drops missing/non-public |

### Health (`@Public`)
`GET /api/health` → `{ status: "ok", db: boolean }`.

---

## 4. Data model (added in Phase 1, `packages/db/prisma/schema.prisma`)

All additive / non-destructive. Applied via `prisma db push`.

- `User`: added `passwordHash String?`, `avatarUrl String?`; `id String @id @default(cuid())`.
- `Book`: added `priceAmount Int?` (minor units) + `@@index`. Backfill script: `packages/db/prisma/backfill-price-amount.sql` (run once on prod to fill from the free-form `price` string).
- `Purchase`: added optional `userId, bookId, type, status(default "pending"), amount, currency(default "USD"), provider, providerRef` + indexes. (Admin still uses the old `{ data }` CRUD — unaffected.)
- `UserColoring` (new): `id, userId, bookId, pageId?, pageIndex?, status(default "in_progress"), imageUrl?, progress Json, createdAt, updatedAt` + indexes `[userId]`, `[userId,status]`, `[bookId]`.

---

## 5. Auth & security notes

- Email/password self-managed. JWT via `jose` HS256, secret `JWT_SECRET` (min 16 chars, **enforced at boot** in `main.ts`), audience `"mobile"`, `typ` claim separates access (1h) vs refresh (30d). `verifyAuthToken` rejects a refresh token used as access and rejects a non-string role claim. Passwords bcrypt (cost 10).
- Global `JwtAuthGuard` denies by default; only `@Public()` routes open (auth, catalog, home, health).
- Dev-only bypass: header `x-user-id` stands in for a token when `NODE_ENV !== "production"` (used by e2e tests; disabled in prod container which sets `NODE_ENV=production`).
- **Refresh is stateless in Phase 1** (no DB revocation) — deferred to Phase 2.

---

## 6. Local dev / test

⚠️ `packages/db/.env` points at **prod Supabase**. Do NOT run `prisma db push`/migrate or the e2e suite against it. For local dev use a throwaway Postgres:

```bash
docker run -d --name coloring-dev-pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=coloring -p 5433:5432 postgres:16-alpine
# temporarily point packages/db/.env DATABASE_URL + DIRECT_URL at postgresql://postgres:postgres@localhost:5433/coloring
yarn workspace @vx/db prisma db push && yarn workspace @vx/db prisma generate
```

Then, from repo root:
```bash
yarn workspace @vx/mobile-api dev         # start (needs apps/mobile-api/.env.local with JWT_SECRET)
yarn workspace @vx/mobile-api typecheck    # tsc --noEmit
yarn workspace @vx/mobile-api test         # unit + e2e (e2e needs the local DB reachable)
```
Restore `packages/db/.env` to prod values when done. Unit specs (jwt, pagination, catalog buildBookWhere, home resolveConfig, auth/me services with mocked prisma) are DB-free; e2e specs (health/auth/catalog/colorings) need the DB.

---

## 7. Structure

```
apps/mobile-api/src/
├── main.ts, app.module.ts
├── prisma/            prisma.service.ts (extends PrismaClient from @vx/db), prisma.module.ts (@Global)
├── common/            jwt.ts, password.ts, pagination.ts, public.decorator.ts, current-user.decorator.ts,
│                      jwt-auth.guard.ts, zod-validation.pipe.ts, logging.interceptor.ts, health.controller.ts
└── modules/
    ├── auth/          register/login/refresh
    ├── me/            profile + colorings CRUD + library books
    ├── home/          feed from App.data.mobileHome (resolveConfig is a pure, unit-tested fn)
    └── catalog/       books/categories (buildBookWhere is exported + unit-tested)
```

---

## 8. What's DONE vs MISSING

### ✅ Done (Phase 1)
Auth (email/pw JWT), profile, catalog (search/filter/sort/pagination), home feed, coloring artworks CRUD, purchased-library read, schema + deploy wiring. 35 tests green, deployed.

### ⛔ Missing — Phase 2 (commerce), the reason for the next session
Decided provider stack (user choice): **Apple IAP + Google Play Billing + Stripe**.
1. **Buy a book** — checkout + entitlement; write a real `Purchase` (userId, bookId, status "paid", provider, providerRef, amount).
2. **Subscription** — plans + entitlement; new `Subscription` model.
3. **Payment** — Apple IAP + Google Play Billing (receipt verification + server notifications) and Stripe (Checkout + webhooks); unified entitlement layer.
4. **Wire `/me/library/books` to real entitlements** (currently returns paid Purchases, which are empty until buying exists).
5. **DB-backed refresh-token revocation/rotation** (Phase 1 refresh is stateless).

### 🔧 Deferred minors / follow-ups (non-blocking, from final review)
- **Highest value:** sync `Book.priceAmount` when admin edits `price` (admin writes only the `price` string → new books get `priceAmount = NULL` → invisible to price filters/sorts over time). Options: admin write-through, or a periodic sync job. Run `packages/db/prisma/backfill-price-amount.sql` once on prod to fill existing rows if not already done.
- `catalog.listBooks`/`me.listColorings` return `Paginated<unknown>` — could tighten to concrete row types.
- No 400 on non-numeric `minPrice`/`maxPrice` (silently ignored).
- Empty `PATCH /me` is a no-op that returns the row (fine, could guard/document).
- `console.log` logging → consider Nest `Logger`.
- Password reset / email verification / social login (Phase 1.x, non-blocking).
- Rate limiting on `/auth/*`.

---

## 9. Next-session starting points
- Read this doc + the spec. Phase 2 is a new architectural cycle: brainstorm → spec → plan (payment/app-store constraints are the heavy, risky part — start there).
- App-store rule: iOS/Android require IAP for digital goods; Stripe is for web/out-of-app. Design the entitlement layer to unify both sources writing `Purchase`/`Subscription`.
- Reuse the Phase 1 patterns: module-per-domain, `ZodValidationPipe` on writes, owner-scoping via `@CurrentUser()`, pagination helpers, `{ data, meta }` envelopes, `@Public()` only where truly public.
