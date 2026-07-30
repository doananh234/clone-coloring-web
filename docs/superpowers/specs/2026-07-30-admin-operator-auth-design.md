# Admin Operator Auth + Account Management — Design

**Date:** 2026-07-30
**Status:** Approved (design)

## Goal

Two changes for the admin panel (the Motio `(coloring)` surface, main site at root):

1. Replace **Google (Firebase) login** with **username / password login**, backed by a **custom DB auth** layer (drop Firebase for admin login).
2. Add a **user-account management** feature — CRUD for the **admin operator accounts** that log into this panel (create/edit/delete/disable, set role, reset password).

"User account" = **admin operators** (staff who use this panel), NOT the end-customer `User` model (wallet/credits). The two are kept separate.

## Current State (findings)

- Auth today = **Firebase Auth, Google popup only** (`(public)/login/page.tsx` → `signInWithPopup`).
- Client stores a Bearer token in `localStorage` key `vx_auth_tokens` via `setAuthToken()` (`packages/core-uikit/src/api/http-client.ts`) and sends `Authorization: Bearer <token>` on every request.
- **Only 2 of 85 API routes** verify the token server-side: `api/auth/me` and `api/admin/queue/[[...path]]` (both call `adminAuth.verifyIdToken`). Everything else relies on the client-side gate.
- Client-side gate = `AuthGate` in `(coloring)/providers.tsx` (redirects to `/login` when signed out).
- Firebase client usage in 4 files: `(coloring)/providers.tsx`, `(public)/login/page.tsx`, `(public)/layout.tsx`, `backup/layout.tsx`.
- Prisma (Postgres via pooler). `User` model = end-customers (has Wallet/CreditLedger). **No admin-account model exists.**
- No `bcrypt`/`jose`/`jsonwebtoken` in deps yet. No Next `middleware.ts`.

## Design

### 1. Data model — new Prisma `Operator`

Separate from `User` so admin accounts never mix with customers.

```prisma
model Operator {
  id           String    @id @default(cuid())
  username     String    @unique
  passwordHash String
  name         String
  role         String    @default("operator") // "admin" | "operator"
  disabled     Boolean   @default(false)
  lastLoginAt  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}
```

- `role = "admin"` → may manage operator accounts. `role = "operator"` → normal login only.
- `disabled = true` → login rejected.

### 2. Auth mechanism

- **Password hashing:** `bcryptjs` (pure-JS, no native build — safe in Next server / Docker), cost 12.
- **Session token:** signed **JWT** via `jose`. Payload `{ sub: operatorId, username, role, name }`, ~8h expiry, HS256, secret from `AUTH_JWT_SECRET` env (fail fast at startup if missing).
- Issued on login, stored via existing `setAuthToken()` (localStorage), sent as Bearer. **No client HTTP-plumbing changes.**
- Shared server helper `requireOperator(req)` (new, e.g. `apps/admin/src/lib/auth/require-operator.ts`) verifies the JWT and returns the operator claims (or a 401 `NextResponse`). An optional `requireAdmin(req)` variant additionally checks `role === "admin"`.
- The 2 Firebase call sites (`auth/me`, `admin/queue`) are switched to `requireOperator`.

**Token-storage decision:** JWT-in-localStorage, sent as Bearer (consistent with the current Firebase-token approach, zero plumbing change). Accepted tradeoff: localStorage is XSS-exposed — same exposure as today. httpOnly-cookie sessions (more secure) are explicitly out of scope for this iteration.

### 3. API routes

- `POST /api/auth/login` — body `{ username, password }`. Look up operator by username; reject if missing / disabled / bad password (generic 401, no user enumeration). On success: update `lastLoginAt`, issue JWT, return `{ token, user: { id, name, username, role } }`.
- `GET /api/auth/me` — `requireOperator` → return operator profile. (Rewrites the Firebase version.)
- `/api/operators` (all gated by `requireAdmin`):
  - `GET /api/operators` — list operators (no passwordHash in payload).
  - `POST /api/operators` — create `{ username, name, password, role }`. Unique-username check → 409 on conflict.
  - `GET /api/operators/[id]` — one operator.
  - `PATCH /api/operators/[id]` — update `name`, `role`, `disabled`, and optional `password` (reset). Never returns passwordHash.
  - `DELETE /api/operators/[id]` — delete.
- **Guards:** cannot delete/disable/demote the **last remaining enabled admin** (prevents lockout); returns 409 with a clear message.
- Input validation via Zod on all bodies.

### 4. Client

- **Login page** (`(public)/login/page.tsx`): replace Google button with a username + password form → `POST /api/auth/login` → `setAuthToken({ accessToken: token, refreshToken: "" })` → redirect `/`. Show inline error on 401.
- **AuthGate** (`(coloring)/providers.tsx`): replace `onAuthStateChanged` with a `GET /api/auth/me` check using the stored token on mount; if invalid/absent → `clearAuthToken()` + redirect `/login`; else supply `{ user, logout }` to `ColoringAuthProvider`. `logout` = clear token + redirect `/login`. Remove `FirebaseProvider` from this surface. (Drop the 50-min Firebase refresh loop; JWT simply expires → next `/me` 401 sends user to login.)
- **New screen — "Tài khoản":** operator CRUD, added to the coloring shell (`nav-config.ts`, "Nhóm quản lý" section, icon e.g. `users`). Route under the `(coloring)` group. Follows existing coloring screen patterns (`entity-grid`, form-controls, states). Visible only when the logged-in operator is `admin` (nav item + route both guard on role). Uses new data hooks (`use-operators`, `use-operator-actions`) calling the `/api/operators` endpoints through the existing `appApi` client.

### 5. Bootstrap / seed

- Prisma **seed script** (`packages/db/prisma/seed.ts`, wired via `package.json` `prisma.seed`) creating a first `admin` operator from env `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` (idempotent upsert). Without this, nobody can log in once Firebase is removed. Run on deploy (`prisma db seed` / documented in deploy.sh).

### 6. Out of scope / flags

- Legacy **`backup/` dashboard** and `(public)/layout.tsx` still reference Firebase. Firebase config files (`firebase-config.ts`, `lib/firebase-admin.ts`, deps) are **left in place**; the main flow stops using them. The backup dashboard's Firebase auth gate becomes non-functional (accepted — it is legacy). No effort spent migrating it.
- httpOnly-cookie sessions, refresh-token rotation, password-reset-by-email, rate limiting on login, and MFA are **not** in this iteration (login rate limiting is a recommended fast-follow).

## Testing

- **Unit:** password hash/verify helper; JWT sign/verify helper; `requireOperator`/`requireAdmin` (valid / expired / missing / wrong-role); last-admin guard logic.
- **Integration (API):** login success / bad password / disabled user; `/me`; operators CRUD happy path + 409 on duplicate username + 403 for non-admin + last-admin-lockout guard.
- **Manual/E2E:** log in with seeded admin → create operator → log out → log in as new operator → confirm no "Tài khoản" access.

## Decisions (resolved open questions)

1. Legacy `backup/` dashboard Firebase auth: **left as-is (out of scope)**.
2. Session: **JWT-in-localStorage (Bearer)**, reusing existing plumbing.
3. Account management: **gated to `admin` role**.
